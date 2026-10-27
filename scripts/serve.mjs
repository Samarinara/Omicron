import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { LocalAuth, AuthError } from "../server/auth.mjs";
import { runTutor } from "../server/ai.mjs";
import { lockRuntime } from "../server/runtime-lock.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

const portIndex = process.argv.indexOf("--port");
const root = process.cwd(),
  port = Number(
    process.env.PORT || (portIndex >= 0 ? process.argv[portIndex + 1] : 3000),
  );
const origin = `http://127.0.0.1:${port}`;
const directory =
  process.env.OMICRON_CONFIG_DIR || join(homedir(), ".config", "omicron");
const unlock = lockRuntime(directory);
process.once("exit", unlock);
process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));
const auth = await new LocalAuth({ directory }).init(),
  active = new Map();
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 750000)
      throw new AuthError("This lesson has too much context.", 413);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AuthError("Invalid request.");
  }
}
async function models(session) {
  const token = await auth.token(session);
  const r = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw new AuthError(
      "ChatGPT models are unavailable. Check access in Settings.",
      r.status,
    );
  const data = await r.json();
  const list = (data.models || [])
    .filter(
      (m) =>
        m.visibility === "list" &&
        typeof m.slug === "string" &&
        typeof m.display_name === "string",
    )
    .map((m) => ({ slug: m.slug, name: m.display_name }));
  if (!list.length)
    throw new AuthError("No eligible ChatGPT models are available.", 403);
  return list;
}
http
  .createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) {
        if (req.headers.host === `localhost:${port}` && req.method === "GET") {
          res.writeHead(302, { Location: origin + req.url });
          res.end();
          return;
        }
        throw new AuthError("Open Omicron at " + origin, 403);
      }
      const url = new URL(req.url, origin),
        path = url.pathname;
      if (path.startsWith("/api/") || path === "/auth/callback") {
        if (req.headers.origin && req.headers.origin !== origin)
          throw new AuthError("Open Omicron directly to continue.", 403);
        const session = auth.session(req, res);
        if (path === "/auth/callback" && req.method === "GET") {
          try {
            await auth.callback(session, url);
            session.notice = null;
          } catch {
            session.notice =
              "Sign-in did not finish. Please try again; your learning data is safe.";
          }
          res.writeHead(303, { Location: origin + "/#home" });
          res.end();
          return;
        }
        if (path === "/api/session" && req.method === "GET") {
          const status = auth.status(session);
          status.notice = session.notice || null;
          session.notice = null;
          json(res, 200, status);
          return;
        }
        if (path === "/api/models" && req.method === "GET") {
          json(res, 200, { models: await models(session) });
          return;
        }
        if (req.method !== "POST") throw new AuthError("Route not found.", 404);
        auth.requireMutation(req, session, origin);
        const payload = await body(req);
        if (path === "/api/auth/start") {
          json(res, 200, { url: await auth.start(session, origin, payload) });
          return;
        }
        if (path === "/api/auth/signout") {
          active.get(session.id)?.abort();
          json(res, 200, await auth.signout(session));
          return;
        }
        if (path === "/api/tutor") {
          if (active.has(session.id))
            throw new AuthError(
              "Your tutor is still finishing the last request.",
              409,
            );
          const controller = new AbortController();
          active.set(session.id, controller);
          res.on("close", () => {
            if (!res.writableEnded) controller.abort();
          });
          try {
            const token = await auth.token(session);
            const catalog = await models(session);
            const model = payload.model || catalog[0].slug;
            if (!catalog.some((m) => m.slug === model))
              throw new AuthError("Choose an available model in Settings.");
            const signal = AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(120000),
            ]);
            const result = await runTutor({
              operation: payload.operation,
              payload: payload.payload,
              model,
              token,
              signal,
            });
            json(res, 200, result);
          } finally {
            active.delete(session.id);
          }
          return;
        }
        throw new AuthError("Route not found.", 404);
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new AuthError("Route not found.", 404);
      let file;
      if (path === "/") file = resolve(root, "index.html");
      else if (path.startsWith("/src/"))
        file = resolve(root, "." + decodeURIComponent(path));
      else file = resolve(root, "public", "." + decodeURIComponent(path));
      if (!(
        file === resolve(root, "index.html") ||
        file.startsWith(resolve(root, "src") + "/") ||
        file.startsWith(resolve(root, "public") + "/")
      ))
        throw new AuthError("Not found.", 404);
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (e) {
      if (res.writableEnded || res.destroyed) return;
      const status = e.status || (e.code === "ENOENT" ? 404 : 500);
      json(res, status, {
        error:
          status === 500
            ? "Omicron hit a small snag. Please try again."
            : e.message,
        code: e.code || "",
        requestId: e.requestId || "",
        detail: e.detail || "",
      });
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(
      `Omicron · ${origin}\nChatGPT credentials stay on this computer. Open the 127.0.0.1 address for sign-in.`,
    ),
  );
