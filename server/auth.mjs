import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rename, chmod } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://auth.openai.com",
  RESOURCE = "https://api.openai.com/v1";
const SCOPES =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const random = () => randomBytes(32).toString("base64url");
export const accountKey = (p) =>
  createHash("sha256")
    .update(JSON.stringify([p.issuer, p.subject, p.client_id]))
    .digest("hex");
export class AuthError extends Error {
  constructor(message, status = 400, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export class LocalAuth {
  constructor({
    directory = join(homedir(), ".config", "omicron"),
    fetcher = fetch,
    verify,
    now = Date.now,
  } = {}) {
    this.directory = directory;
    this.fetch = fetcher;
    this.verify = verify;
    this.now = now;
    this.sessions = new Map();
    this.pending = new Map();
    this.refreshes = new Map();
  }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    try {
      this.data = JSON.parse(
        await readFile(join(this.directory, "chatgpt.json"), "utf8"),
      );
      if (
        this.data.version !== 1 ||
        !this.data.host?.startsWith("urn:uuid:") ||
        !Array.isArray(this.data.accounts)
      )
        throw Error("Invalid credential file.");
      for (const a of this.data.accounts) {
        if (
          typeof a.client_id !== "string" ||
          a.client_id === "dynamic_agent_client" ||
          a.issuer !== ISSUER ||
          typeof a.subject !== "string" ||
          !Array.isArray(a.scopes)
        )
          throw Error("Invalid account registration.");
      }
    } catch (e) {
      if (e.code !== "ENOENT")
        throw new Error(
          "Omicron could not read its credential file. It has been left untouched.",
        );
      this.data = {
        version: 1,
        host: `urn:uuid:${randomUUID()}`,
        accounts: [],
      };
      await this.persist();
    }
    return this;
  }
  async persist() {
    const write = async () => {
      const tmp = join(this.directory, `credentials-${randomUUID()}.tmp`);
      await writeFile(tmp, JSON.stringify(this.data), {
        mode: 0o600,
        flag: "wx",
      });
      await rename(tmp, join(this.directory, "chatgpt.json"));
      await chmod(join(this.directory, "chatgpt.json"), 0o600);
    };
    const next = (this.writes || Promise.resolve()).then(write);
    this.writes = next.catch(() => {});
    await next;
  }
  session(req, res) {
    const cookies = Object.fromEntries(
      (req.headers.cookie || "").split(";").map((s) => s.trim().split("=")),
    );
    let session = this.sessions.get(cookies.omicron);
    if (!session || session.expires < this.now()) {
      const id = random();
      session = {
        id,
        csrf: random(),
        account: null,
        expires: this.now() + 86400000,
      };
      this.sessions.set(id, session);
      res.setHeader(
        "Set-Cookie",
        `omicron=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
      );
    }
    return session;
  }
  requireMutation(req, session, origin) {
    if (
      req.headers.origin !== origin ||
      req.headers["x-omicron-csrf"] !== session.csrf
    )
      throw new AuthError("Refresh Omicron and try again.", 403);
  }
  account(session) {
    return this.data.accounts.find((a) => accountKey(a) === session.account);
  }
  status(session) {
    const a = this.account(session);
    return {
      local: true,
      csrf: session.csrf,
      account: a?.access_token
        ? {
            id: accountKey(a),
            name: a.name || a.email || "Greek learner",
            label: a.label,
            email: a.email,
            sharing: a.scopes.includes("chatgpt.tokens.use.direct"),
          }
        : null,
      accounts: this.data.accounts.map((p) => ({
        id: accountKey(p),
        label: p.label,
        email: p.email,
      })),
    };
  }
  async discovery() {
    if (!this.discoveryPromise)
      this.discoveryPromise = this.fetch(
        `${ISSUER}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(15000) },
      )
        .then(async (r) => {
          if (!r.ok)
            throw new AuthError(
              "OpenAI sign-in is taking a break. Try again.",
              503,
            );
          const d = await r.json();
          if (d.issuer !== ISSUER)
            throw new AuthError("Unexpected OpenAI issuer.", 502);
          for (const key of [
            "authorization_endpoint",
            "token_endpoint",
            "jwks_uri",
            "revocation_endpoint",
          ])
            if (d[key] && new URL(d[key]).origin !== ISSUER)
              throw new AuthError("Unexpected OpenAI endpoint.", 502);
          if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri)
            throw new AuthError("Incomplete OpenAI configuration.", 502);
          return d;
        })
        .catch((e) => {
          this.discoveryPromise = null;
          throw e;
        });
    return this.discoveryPromise;
  }
  async start(session, origin, { accountId, consent = false } = {}) {
    const d = await this.discovery();
    const existing = accountId
      ? this.data.accounts.find((a) => accountKey(a) === accountId)
      : null;
    if (accountId && !existing) throw new AuthError("Choose a saved account.");
    const client = existing?.client_id || session.retryClient;
    const state = random(),
      nonce = random(),
      verifier = random(),
      redirect = `${origin}/auth/callback`;
    for (const [key, p] of this.pending)
      if (p.expires < this.now() || p.session === session.id)
        this.pending.delete(key);
    this.pending.set(state, {
      session: session.id,
      nonce,
      verifier,
      redirect,
      accountId: existing ? accountKey(existing) : null,
      client,
      expires: this.now() + 600000,
    });
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: client || "dynamic_agent_client",
      ext_agent_host_id: this.data.host,
      response_type: "code",
      redirect_uri: redirect,
      scope: SCOPES,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    if (!client) url.searchParams.set("agent_name_hint", "Omicron");
    if (existing?.id_token)
      url.searchParams.set("id_token_hint", existing.id_token);
    if (existing?.email) url.searchParams.set("login_hint", existing.email);
    if (consent) url.searchParams.set("prompt", "consent");
    return url.toString();
  }
  async exchange(fields) {
    const d = await this.discovery();
    const r = await this.fetch(d.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, resource: RESOURCE }),
      signal: AbortSignal.timeout(30000),
    });
    const v = await r.json();
    if (!r.ok)
      throw new AuthError(
        "ChatGPT access could not be renewed. Try signing in again.",
        r.status,
        typeof v.error === "string" ? v.error : v.error?.code,
      );
    return v;
  }
  async validateToken(token, client, nonce) {
    if (this.verify) return this.verify(token, { client, nonce });
    const d = await this.discovery();
    this.jwks ??= createRemoteJWKSet(new URL(d.jwks_uri));
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: ISSUER,
      audience: client,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["sub", "exp", "iat"],
    });
    if (nonce && payload.nonce !== nonce)
      throw new AuthError("Sign-in verification failed. Please try again.");
    if (typeof payload.sub !== "string")
      throw new AuthError("Missing ChatGPT identity.");
    return payload;
  }
  async callback(session, url) {
    const state = url.searchParams.get("state"),
      p = this.pending.get(state);
    if (!p || p.session !== session.id || p.expires < this.now())
      throw new AuthError("This sign-in expired. Please try again.");
    this.pending.delete(state);
    if (url.searchParams.has("error"))
      throw new AuthError(
        "Sign-in was cancelled. Your progress is still here.",
      );
    const client = url.searchParams.get("client_id") || p.client;
    if (
      !client ||
      client === "dynamic_agent_client" ||
      (p.client && p.client !== client)
    )
      throw new AuthError("ChatGPT returned an unexpected registration.");
    const code = url.searchParams.get("code");
    if (!code) throw new AuthError("ChatGPT did not finish signing in.");
    let tokens;
    try {
      tokens = await this.exchange({
        grant_type: "authorization_code",
        client_id: client,
        code,
        code_verifier: p.verifier,
        redirect_uri: p.redirect,
      });
    } catch (error) {
      // Keep a newly issued registration for a fresh OAuth attempt; never reuse the code.
      if (error.code === "invalid_grant" && !p.accountId)
        session.retryClient = client;
      throw error;
    }
    if (
      !tokens.id_token ||
      !tokens.access_token ||
      typeof tokens.scope !== "string" ||
      !Number.isFinite(tokens.expires_in)
    )
      throw new AuthError("Incomplete ChatGPT credentials.");
    const identity = await this.validateToken(tokens.id_token, client, p.nonce);
    const old = p.accountId
      ? this.data.accounts.find((a) => accountKey(a) === p.accountId)
      : null;
    if (old && (old.subject !== identity.sub || old.issuer !== identity.iss))
      throw new AuthError(
        "That is a different ChatGPT account. Add it separately.",
      );
    const account = {
      issuer: ISSUER,
      subject: identity.sub,
      client_id: client,
      name: identity.name || "",
      email: identity.email || "",
      label: old?.label || `Account ${this.data.accounts.length + 1}`,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      scopes: tokens.scope.split(" "),
      expires_at: this.now() + tokens.expires_in * 1000,
    };
    const index = this.data.accounts.findIndex(
      (a) => accountKey(a) === accountKey(account),
    );
    if (index < 0) this.data.accounts.push(account);
    else this.data.accounts[index] = account;
    await this.persist();
    delete session.retryClient;
    session.account = accountKey(account);
    return account;
  }
  async token(session) {
    let a = this.account(session);
    if (!a?.access_token)
      throw new AuthError("Sign in with ChatGPT to continue.", 401);
    if (!a.scopes.includes("chatgpt.tokens.use.direct"))
      throw new AuthError(
        "Enable ChatGPT plan usage in Settings.",
        403,
        "plan_permission_required",
      );
    if (a.expires_at > this.now() + 60000) return a.access_token;
    const id = accountKey(a);
    if (!this.refreshes.has(id)) {
      const refresh = (async () => {
        try {
          if (!a.refresh_token)
            throw new AuthError(
              "Sign in again to continue.",
              401,
              "invalid_grant",
            );
          const v = await this.exchange({
            grant_type: "refresh_token",
            client_id: a.client_id,
            refresh_token: a.refresh_token,
          });
          if (!v.access_token || !Number.isFinite(v.expires_in))
            throw new AuthError("Incomplete renewed credentials.", 502);
          if (v.id_token) {
            const identity = await this.validateToken(v.id_token, a.client_id);
            if (identity.sub !== a.subject)
              throw new AuthError("ChatGPT account changed unexpectedly.", 401);
          }
          if (this.account(session) !== a || !a.access_token)
            throw new AuthError("This account was signed out.", 401);
          Object.assign(a, {
            access_token: v.access_token,
            refresh_token: v.refresh_token || a.refresh_token,
            id_token: v.id_token || a.id_token,
            expires_at: this.now() + v.expires_in * 1000,
            scopes: typeof v.scope === "string" ? v.scope.split(" ") : a.scopes,
          });
          await this.persist();
          return a.access_token;
        } catch (e) {
          if (
            [
              "invalid_grant",
              "invalid_refresh_token",
              "token_expired",
              "refresh_token_expired",
              "refresh_token_invalidated",
              "refresh_token_reused",
            ].includes(e.code)
          ) {
            delete a.access_token;
            delete a.refresh_token;
            delete a.id_token;
            await this.persist();
          }
          throw e;
        }
      })().finally(() => this.refreshes.delete(id));
      this.refreshes.set(id, refresh);
    }
    const token = await this.refreshes.get(id);
    if (!a.scopes.includes("chatgpt.tokens.use.direct"))
      throw new AuthError("Enable ChatGPT plan usage in Settings.", 403);
    return token;
  }
  async signout(session) {
    const a = this.account(session);
    for (const [key, p] of this.pending)
      if (p.session === session.id) this.pending.delete(key);
    session.account = null;
    delete session.retryClient;
    let revoked = true;
    if (a?.refresh_token) {
      revoked = false;
      try {
        const d = await this.discovery();
        if (d.revocation_endpoint)
          for (let attempt = 0; attempt < 2; attempt++) {
            const r = await this.fetch(d.revocation_endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                token: a.refresh_token,
                token_type_hint: "refresh_token",
                client_id: a.client_id,
              }),
              signal: AbortSignal.timeout(10000),
            });
            if (r.ok) {
              revoked = true;
              break;
            }
            if (r.status < 500) break;
            await new Promise((r) => setTimeout(r, 300));
          }
      } catch {
        /* Tokens are still cleared locally. */
      }
    }
    if (a) {
      delete a.access_token;
      delete a.refresh_token;
      delete a.id_token;
      for (const s of this.sessions.values())
        if (s.account === accountKey(a)) s.account = null;
      await this.persist();
    }
    return { revoked };
  }
}
