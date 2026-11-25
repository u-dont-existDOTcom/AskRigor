import { randomBytes } from "node:crypto";

import { Pool } from "pg";

import {
  PostgresGeminiSignInRowStore,
  type GeminiSignInRow,
} from "../packages/evidence-repository/src/gemini-sign-in-rows.js";
import { verifyGeminiAccessToken, disconnectGeminiLinks } from "../apps/research-mcp/src/gemini-sign-in/resource.js";
import {
  Browser,
  GOOGLE_REDIRECT,
  PERSON,
  clientAssertion,
  linkToCode,
  startGeminiFixture,
  tokenRequest,
} from "../tests/helpers/gemini-sign-in-fixture.js";

/**
 * Gemini's sign-in against a real PostgreSQL (owner answer 386b; design v2 F8): run by
 * scripts/run-research-contributor-access-postgres-acceptance.sh after migrating and provisioning, as the research-access
 * role. It checks the role's privileges, the store's atomic single use under concurrent connections, expiry and grant
 * deletion, and a whole Gemini link (code, tokens, replay, reuse, refresh, revocation, disconnect) on these rows.
 */
const SCHEMA = "living_evidence";
const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name}_REQUIRED`);
  return value;
}

function check(condition: unknown, what: string): void {
  if (!condition) throw new Error(`GEMINI_SIGN_IN_ACCEPTANCE_FAILED: ${what}`);
}

const key = () => randomBytes(32);
const row = (overrides: Partial<GeminiSignInRow> = {}): GeminiSignInRow => ({
  model: "ReplayDetection",
  key: key(),
  payload: randomBytes(64),
  grantKey: null,
  uidKey: null,
  accountRef: null,
  expiresAt: new Date(Date.now() + 60_000),
  ...overrides,
});

async function main(): Promise<void> {
  const access = new Pool({ connectionString: requiredEnv("ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL"), max: 12 });
  const reader = new Pool({ connectionString: requiredEnv("ASKRIGOR_LIVING_EVIDENCE_READER_DATABASE_URL"), max: 2 });
  const rows = new PostgresGeminiSignInRowStore(access, SCHEMA);
  const fixture = await startGeminiFixture({ rows });
  try {
    // The canonical reader sees nothing of it.
    let readerRefused = false;
    try {
      await reader.query(`SELECT 1 FROM ${SCHEMA}.gemini_oauth_store LIMIT 1`);
    } catch (error) {
      readerRefused = (error as { code?: string }).code === "42501";
    }
    check(readerRefused, "the canonical reader can read gemini_oauth_store");

    // Twenty concurrent first uses of one assertion mark: exactly one wins.
    const mark = row();
    const now = new Date();
    const inserts = await Promise.all(Array.from({ length: 20 }, () => rows.putIfAbsent({ ...mark, payload: randomBytes(64) }, now)));
    check(inserts.filter(Boolean).length === 1, `putIfAbsent winners: ${inserts.filter(Boolean).length}`);
    // An expired mark may be replaced; an unexpired one may not.
    const expired = row({ expiresAt: new Date(Date.now() - 1_000) });
    await rows.put(expired);
    check(await rows.putIfAbsent({ ...expired, expiresAt: new Date(Date.now() + 60_000) }, new Date()), "expired mark kept");
    check(!(await rows.putIfAbsent(expired, new Date())), "unexpired mark replaced");

    // Twenty concurrent redemptions of one code: exactly one consumes it, and a consumed row stays consumed on put.
    const code = row({ model: "AuthorizationCode", grantKey: key() });
    await rows.put(code);
    const consumed = await Promise.all(Array.from({ length: 20 }, () => rows.consume("AuthorizationCode", code.key, new Date())));
    check(consumed.filter(Boolean).length === 1, `consume winners: ${consumed.filter(Boolean).length}`);
    await rows.put({ ...code, payload: randomBytes(64) });
    check((await rows.get("AuthorizationCode", code.key, new Date()))?.consumedAt !== null, "put cleared consumed");

    // Expiry, grants and the sweep.
    const gone = row({ model: "AccessToken", expiresAt: new Date(Date.now() - 1_000) });
    await rows.put(gone);
    check(await rows.get("AccessToken", gone.key, new Date()) === undefined, "an expired row was returned");
    const grantKey = key();
    const accountRef = key();
    await rows.put(row({ model: "Grant", grantKey, accountRef, expiresAt: new Date(Date.now() + 3_600_000) }));
    await rows.put(row({ model: "AccessToken", grantKey }));
    await rows.put(row({ model: "RefreshToken", grantKey }));
    check((await rows.grantKeysOfAccount(accountRef, new Date())).length === 1, "grant not found by account");
    check(await rows.deleteGrants([grantKey]) === 1, "grant deletion count");
    check((await access.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.gemini_oauth_store WHERE grant_key = $1`,
      [grantKey])).rows[0].n === 0, "rows of a deleted grant remain");
    check(await rows.sweep(new Date()) >= 1, "sweep deleted nothing");

    // A whole link on these rows.
    const { code: linkCode, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl));
    const assertion = await clientAssertion(fixture);
    const exchange = await tokenRequest(fixture, {
      grant_type: "authorization_code", code: linkCode, redirect_uri: GOOGLE_REDIRECT, code_verifier: verifier,
      client_assertion_type: ASSERTION_TYPE, client_assertion: assertion,
    });
    check(exchange.status === 200, `token exchange ${exchange.status}`);
    const tokens = await exchange.json() as { access_token: string; refresh_token: string };
    check((await verifyGeminiAccessToken(fixture.server, tokens.access_token)).extra?.subject === PERSON, "subject");
    const replay = await tokenRequest(fixture, {
      grant_type: "refresh_token", refresh_token: tokens.refresh_token,
      client_assertion_type: ASSERTION_TYPE, client_assertion: assertion,
    });
    check(replay.status === 401, `replayed assertion ${replay.status}`);
    const reuse = await tokenRequest(fixture, {
      grant_type: "authorization_code", code: linkCode, redirect_uri: GOOGLE_REDIRECT, code_verifier: verifier,
      client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(fixture),
    });
    check(reuse.status === 400, `reused code ${reuse.status}`);
    let reuseRevoked = false;
    try {
      await verifyGeminiAccessToken(fixture.server, tokens.access_token);
    } catch {
      reuseRevoked = true;
    }
    check(reuseRevoked, "a reused code left its tokens working");

    const second = await linkToCode(fixture, new Browser(fixture.baseUrl));
    const secondTokens = await (await tokenRequest(fixture, {
      grant_type: "authorization_code", code: second.code, redirect_uri: GOOGLE_REDIRECT, code_verifier: second.verifier,
      client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(fixture),
    })).json() as { access_token: string; refresh_token: string };
    const refreshed = await tokenRequest(fixture, {
      grant_type: "refresh_token", refresh_token: secondTokens.refresh_token,
      client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(fixture),
    });
    const refreshedBody = await refreshed.json() as { refresh_token: string };
    check(refreshed.status === 200 && refreshedBody.refresh_token === secondTokens.refresh_token, "refresh");
    check(await disconnectGeminiLinks(fixture.server, PERSON) >= 1, "disconnect ended nothing");
    let disconnected = false;
    try {
      await verifyGeminiAccessToken(fixture.server, secondTokens.access_token);
    } catch {
      disconnected = true;
    }
    check(disconnected, "a disconnected link still works");
    const stored = await access.query<{ payload: Buffer; key: Buffer }>(`SELECT key, payload FROM ${SCHEMA}.gemini_oauth_store`);
    const everything = Buffer.concat(stored.rows.flatMap(({ key: rowKey, payload }) => [rowKey, payload]));
    for (const secret of [linkCode, tokens.access_token, tokens.refresh_token, secondTokens.refresh_token, PERSON]) {
      check(!everything.includes(Buffer.from(secret, "utf8")), "a token or subject is readable at rest");
    }
    process.stdout.write(`${JSON.stringify({ status: "PASS", phase: "gemini_sign_in", schema: SCHEMA })}\n`);
  } finally {
    await fixture.close();
    await access.end();
    await reader.end();
  }
}

await main();
