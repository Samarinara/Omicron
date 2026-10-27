import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import http from "node:http";

test("local HTTP boundary protects credentials, guards mutations, and refuses unsigned inference", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "omicron-http-"));
  const reservation = net.createServer();
  await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const child = spawn(
    process.execPath,
    ["scripts/serve.mjs", "--port", String(port)],
    {
      env: {
        ...process.env,
        PORT: String(port),
        OMICRON_CONFIG_DIR: directory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(async () => {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Server did not start")),
      10000,
    );
    child.stdout.on("data", (b) => {
      if (String(b).includes("Omicron ·")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(Error("Server exited " + code));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  let response = await fetch(origin + "/api/session");
  const session = await response.json(),
    cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal(session.account, null);
  assert.equal(session.local, true);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.ok(session.csrf);
  for (const path of [
    "/server/auth.mjs",
    "/package.json",
    "/.git/config",
    "/src/%2e%2e%2fserver/auth.mjs",
  ])
    assert.equal((await fetch(origin + path)).status, 404, path);
  response = await fetch(origin + "/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: "{}",
  });
  assert.equal(response.status, 403);
  response = await fetch(origin + "/api/tutor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
      Origin: origin,
      "X-Omicron-CSRF": session.csrf,
    },
    body: "{}",
  });
  assert.equal(response.status, 401);
  assert.equal(
    (
      await fetch(origin + "/api/session", {
        headers: { Origin: "https://elsewhere.invalid" },
      })
    ).status,
    403,
  );
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(
      origin,
      { headers: { Host: "attacker.invalid" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
  });
  assert.equal(hostStatus, 403);
  response = await fetch(
    origin + "/auth/callback?state=unknown&code=untrusted",
    { headers: { cookie }, redirect: "manual" },
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), origin + "/#home");
  const after = await (
    await fetch(origin + "/api/session", { headers: { cookie } })
  ).json();
  assert.equal(after.account, null);
  assert.match(after.notice, /did not finish/);
});
