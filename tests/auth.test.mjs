import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateKeyPair,
  SignJWT,
  exportJWK,
  createLocalJWKSet,
  jwtVerify,
} from "jose";
import { LocalAuth, accountKey } from "../server/auth.mjs";
const issuer = "https://auth.openai.com",
  origin = "http://127.0.0.1:3000";
async function harness(t) {
  const directory = await mkdtemp(join(tmpdir(), "omicron-auth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  let nonce = "",
    refreshes = 0;
  const requests = [];
  const auth = new LocalAuth({
    directory,
    fetcher: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith("openid-configuration"))
        return Response.json({
          issuer,
          authorization_endpoint: issuer + "/authorize",
          token_endpoint: issuer + "/token",
          jwks_uri: issuer + "/jwks",
          revocation_endpoint: issuer + "/revoke",
        });
      if (url.endsWith("/revoke")) return new Response("", { status: 200 });
      const fields = new URLSearchParams(init.body),
        refresh = fields.get("grant_type") === "refresh_token";
      if (refresh) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 20));
        return Response.json({
          access_token: "renewed",
          refresh_token: "rotated",
          expires_in: 3600,
        });
      }
      const idToken = await new SignJWT({
        nonce,
        name: "Test learner",
        email: "test@example.invalid",
      })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(issuer)
        .setSubject("subject")
        .setAudience(fields.get("client_id"))
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
      return Response.json({
        id_token: idToken,
        access_token: "test-access",
        refresh_token: "test-refresh",
        scope:
          "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        expires_in: 3600,
      });
    },
    verify: async (token, { client, nonce: expected }) => {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: client,
      });
      if (expected && payload.nonce !== expected) throw Error("Bad nonce");
      return payload;
    },
  });
  await auth.init();
  const session = { id: "browser", csrf: "csrf", account: null };
  auth.sessions.set(session.id, session);
  return {
    auth,
    directory,
    session,
    requests,
    refreshes: () => refreshes,
    start: async (accountId) => {
      const url = new URL(await auth.start(session, origin, { accountId }));
      nonce = url.searchParams.get("nonce");
      return url;
    },
    callback: (url) =>
      new URL(
        `${origin}/auth/callback?state=${url.searchParams.get("state")}&code=one-use&client_id=oaiapp_test`,
      ),
  };
}
test("OSS registration uses its own host ID, PKCE, issued client and verified identity", async (t) => {
  const h = await harness(t),
    url = await h.start();
  assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(url.searchParams.get("agent_name_hint"), "Omicron");
  assert.equal(url.searchParams.get("redirect_uri"), origin + "/auth/callback");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("ext_agent_host_id"), /^urn:uuid:/);
  const account = await h.auth.callback(h.session, h.callback(url));
  assert.equal(h.session.account, accountKey(account));
  assert.equal(h.auth.status(h.session).account.sharing, true);
  const exchanged = new URLSearchParams(
    h.requests.find((r) => r.url.endsWith("/token")).init.body,
  );
  assert.equal(exchanged.get("client_id"), "oaiapp_test");
  assert.equal(exchanged.get("resource"), "https://api.openai.com/v1");
  assert.ok(exchanged.get("code_verifier"));
  assert.equal(
    (await stat(join(h.directory, "chatgpt.json"))).mode & 0o777,
    0o600,
  );
  const status = JSON.stringify(h.auth.status(h.session));
  assert.ok(!status.includes("test-access"));
  assert.ok(!status.includes("test-refresh"));
  await assert.rejects(h.auth.callback(h.session, h.callback(url)), /expired/);
  const returning = await h.start(accountKey(account));
  assert.equal(returning.searchParams.get("client_id"), "oaiapp_test");
  assert.equal(returning.searchParams.get("agent_name_hint"), null);
  assert.ok(returning.searchParams.get("id_token_hint"));
});
test("callback rejects wrong browser, mismatched client, missing issued ID and bad nonce", async (t) => {
  const h = await harness(t);
  let url = await h.start();
  await assert.rejects(
    h.auth.callback({ id: "other" }, h.callback(url)),
    /expired/,
  );
  const missing = h.callback(url);
  missing.searchParams.delete("client_id");
  await assert.rejects(h.auth.callback(h.session, missing), /registration/);
  url = await h.start();
  await h.auth.callback(h.session, h.callback(url));
  url = await h.start(h.session.account);
  const mismatch = h.callback(url);
  mismatch.searchParams.set("client_id", "oaiapp_other");
  await assert.rejects(h.auth.callback(h.session, mismatch), /registration/);
  url = await h.start();
  h.auth.pending.get(url.searchParams.get("state")).nonce = "wrong";
  await assert.rejects(h.auth.callback(h.session, h.callback(url)), /nonce/);
});
test("refresh is serialized, rotates credentials, and signout retains registration only", async (t) => {
  const h = await harness(t),
    url = await h.start();
  const a = await h.auth.callback(h.session, h.callback(url));
  a.expires_at = 0;
  assert.deepEqual(
    await Promise.all([h.auth.token(h.session), h.auth.token(h.session)]),
    ["renewed", "renewed"],
  );
  assert.equal(h.refreshes(), 1);
  assert.equal(a.refresh_token, "rotated");
  const result = await h.auth.signout(h.session);
  assert.equal(result.revoked, true);
  const saved = JSON.parse(
    await readFile(join(h.directory, "chatgpt.json"), "utf8"),
  );
  assert.equal(saved.accounts[0].client_id, "oaiapp_test");
  assert.equal(saved.accounts[0].access_token, undefined);
  assert.equal(saved.accounts[0].id_token, undefined);
  assert.equal(h.auth.status(h.session).account, null);
});
test("mutation guard requires both the local origin and CSRF token", async (t) => {
  const h = await harness(t);
  assert.throws(() =>
    h.auth.requireMutation(
      {
        headers: { origin: "https://other.example", "x-omicron-csrf": "csrf" },
      },
      h.session,
      origin,
    ),
  );
  assert.throws(() =>
    h.auth.requireMutation({ headers: { origin } }, h.session, origin),
  );
  assert.doesNotThrow(() =>
    h.auth.requireMutation(
      { headers: { origin, "x-omicron-csrf": "csrf" } },
      h.session,
      origin,
    ),
  );
});
test("unreadable credentials remain untouched", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "omicron-bad-auth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "chatgpt.json");
  await writeFile(file, "{broken");
  await assert.rejects(new LocalAuth({ directory }).init(), /left untouched/);
  assert.equal(await readFile(file, "utf8"), "{broken");
});

test("an invalid code retries with the newly issued registration and fresh PKCE", async (t) => {
  const h = await harness(t),
    first = await h.start();
  const exchange = h.auth.exchange.bind(h.auth);
  h.auth.exchange = async () => {
    const e = Error("Expired code");
    e.code = "invalid_grant";
    throw e;
  };
  await assert.rejects(
    h.auth.callback(h.session, h.callback(first)),
    /Expired code/,
  );
  const retry = new URL(await h.auth.start(h.session, origin));
  assert.equal(retry.searchParams.get("client_id"), "oaiapp_test");
  assert.equal(retry.searchParams.get("agent_name_hint"), null);
  assert.notEqual(
    retry.searchParams.get("state"),
    first.searchParams.get("state"),
  );
  assert.notEqual(
    retry.searchParams.get("code_challenge"),
    first.searchParams.get("code_challenge"),
  );
  h.auth.exchange = exchange;
});
