import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { MemoryGeminiSignInRowStore } from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it } from "vitest";

import { deriveGeminiSignInKeys } from "../apps/research-mcp/src/gemini-sign-in/config.js";
import {
  GEMINI_SIGN_IN_KNOWN_REASONS,
  geminiSignInReasonOf,
  mcpMethodOf,
  type GeminiSignInDiagnostic,
} from "../apps/research-mcp/src/gemini-sign-in/diagnostics.js";
import { createGeminiSignIn } from "../apps/research-mcp/src/gemini-sign-in/index.js";
import {
  Browser,
  CLIENT_ID,
  CONNECTOR,
  GOOGLE_REDIRECT,
  ISSUER,
  PERSON,
  RESOURCE,
  TOKEN_URL,
  clientAssertion,
  linkToCode,
  startGeminiFixture,
  tokenRequest,
  type GeminiFixture,
} from "./helpers/gemini-sign-in-fixture.js";

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

/**
 * The step log after Allow (ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled). The owner's link of 22 Nov 2026 ended ten
 * seconds after Allow, and the store kept his consent and no token: the code's issue and Google's token call left no
 * line. These tests run a whole link and its failures with the step log on, and check each line names the step, the
 * outcome and the reason, and never a value the request carried.
 */
describe("Gemini's sign-in step log covers every step after Allow, by name only", () => {
  let fixture: GeminiFixture | undefined;
  const records: GeminiSignInDiagnostic[] = [];
  const secrets: string[] = [];

  afterEach(async () => {
    await fixture?.close();
    fixture = undefined;
    // Nothing a request carried may reach a line: ids, codes, tokens, the person, Google's or AskRigor's addresses.
    const text = JSON.stringify(records);
    for (const secret of [CLIENT_ID, CONNECTOR, PERSON, GOOGLE_REDIRECT, ISSUER, RESOURCE, "google-state-1",
      "mcp.askrigor.com", "googleusercontent", "accountlinking", "askrigor-test.example", ...secrets]) {
      expect(text).not.toContain(secret);
    }
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(record.detail === undefined
        ? ["event", "outcome", "stage"]
        : ["detail", "event", "outcome", "stage"]);
      for (const value of [record.outcome, ...Object.values(record.detail ?? {})]) {
        if (typeof value === "string") expect(value).toMatch(/^[A-Za-z0-9 _+:.(),`-]{0,120}$/u);
      }
    }
    records.length = 0;
    secrets.length = 0;
  });

  async function start() {
    fixture = await startGeminiFixture({ diagnostic: (record) => records.push(record) });
    return fixture;
  }

  async function exchange(code: string, verifier: string, assertion: string, headers: Record<string, string> = {}) {
    secrets.push(code, verifier, assertion);
    return await tokenRequest(fixture!, {
      grant_type: "authorization_code",
      code,
      redirect_uri: GOOGLE_REDIRECT,
      code_verifier: verifier,
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: assertion,
    }, headers);
  }

  const lines = () => records.map((record) => `${record.stage} ${record.outcome}`);
  const last = (stage: string) => [...records].reverse().find((record) => record.stage === stage);

  it("logs a working link from the request to the tokens: the code's issue and Google's token call included", async () => {
    const fixture = await start();
    const { code, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl));
    const response = await exchange(code, verifier, await clientAssertion(fixture));
    const body = await response.json() as Record<string, unknown>;
    expect(response.status, JSON.stringify(body)).toBe(200);
    secrets.push(String(body.access_token), String(body.refresh_token));
    expect(lines()).toEqual([
      "authorization requested",
      "authorization to_interaction",
      "login sent_to_auth0",
      "login signed_in",
      "authorization to_interaction",
      "consent shown",
      "consent allowed",
      "authorization code_issued",
      "token issued",
    ]);
    expect(records[0]!.detail).toEqual({
      client: "gemini_document",
      redirect: "google",
      response_type: "code",
      scopes: "research:use+cases:review",
      other_scopes: 0,
      resource: "this_resource",
      response_mode: "absent",
      prompt: "absent",
      pkce: "S256",
      state: true,
      nonce: false,
    });
    expect(records[7]!.detail).toEqual({ step: "resume", to: "google", in: "query", state_param: true, iss_param: true });
    expect(last("token")!.detail).toMatchObject({
      content_type: "form",
      grant_type: "authorization_code",
      assertion_type: "jwt_bearer",
      client_id_param: "absent",
      client_secret_param: false,
      basic_header: false,
      resource_param: "absent",
      redirect_uri_param: "google",
      code_verifier_param: true,
      assertion_claims: "decoded",
      alg: "RS256",
      kid: true,
      typ: "JWT",
      iss: "gemini_document",
      sub_equals_iss: true,
      aud: "token_endpoint",
      aud_array: false,
      jti: true,
      exp_in: "le_5min",
      lifetime: "le_5min",
      refresh_token: true,
      scope: "research_use",
    });
  });

  it("names why Google's token call failed: a foreign key, a foreign audience, a replay, no jti, a long expiry", async () => {
    const fixture = await start();
    const cases: Array<{ assertion: () => Promise<string>; reason: string | string[]; shape: Record<string, unknown> }> = [
      {
        assertion: () => clientAssertion(fixture, {}, { key: fixture.strangerKey }),
        reason: ["signature verification failed", "no applicable key found in the JSON Web Key Set"],
        shape: { aud: "token_endpoint" },
      },
      {
        assertion: () => clientAssertion(fixture, { aud: [TOKEN_URL, "https://elsewhere.example/token"] }),
        reason: "every audience must be this authorization server",
        shape: { aud: "other+token_endpoint", aud_array: true },
      },
      {
        assertion: () => clientAssertion(fixture, { aud: `${ISSUER}/` }),
        reason: "audience (aud) must equal the endpoint url, issuer identifier or token endpoint url",
        shape: { aud: "issuer_slash" },
      },
      {
        assertion: () => clientAssertion(fixture, { jti: undefined }),
        reason: "unique jti (JWT ID) must be provided in the client_assertion JWT",
        shape: { jti: false },
      },
      {
        assertion: () => clientAssertion(fixture, { exp: Math.floor(Date.now() / 1_000) + 7_200 }),
        reason: "expiry too far ahead",
        shape: { exp_in: "gt_1h30s", lifetime: "gt_1h30s" },
      },
    ];
    for (const { assertion, reason, shape } of cases) {
      const { code, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl));
      const response = await exchange(code, verifier, await assertion());
      expect(response.status).toBe(401);
      const line = last("token")!;
      expect(line.outcome).toBe("invalid_client");
      expect(line.detail).toMatchObject({ status: "401", ...shape });
      expect(Array.isArray(reason) ? reason : [reason]).toContain(line.detail!.reason);
    }
    const first = await linkToCode(fixture, new Browser(fixture.baseUrl));
    const reused = await clientAssertion(fixture);
    expect((await exchange(first.code, first.verifier, reused)).status).toBe(200);
    const second = await linkToCode(fixture, new Browser(fixture.baseUrl));
    expect((await exchange(second.code, second.verifier, reused)).status).toBe(401);
    expect(last("token")!.detail!.reason).toBe("client assertion tokens must only be used once");
  });

  it("shows a token call that also sends a Basic header, and a code used twice", async () => {
    const fixture = await start();
    const { code, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl));
    const basic = `Basic ${Buffer.from(`${encodeURIComponent(CLIENT_ID)}:`).toString("base64")}`;
    secrets.push(basic.slice(6));
    const refused = await exchange(code, verifier, await clientAssertion(fixture), { authorization: basic });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    const line = last("token")!;
    expect(line.detail).toMatchObject({ basic_header: true, assertion_type: "jwt_bearer" });
    expect(GEMINI_SIGN_IN_KNOWN_REASONS.has(String(line.detail!.reason))).toBe(true);

    expect((await exchange(code, verifier, await clientAssertion(fixture))).status).toBe(200);
    expect((await exchange(code, verifier, await clientAssertion(fixture))).status).toBe(400);
    expect(last("token")).toMatchObject({ outcome: "invalid_grant" });
    expect(GEMINI_SIGN_IN_KNOWN_REASONS.has(String(last("token")!.detail!.reason))).toBe(true);
  });

  it("logs the shape of an authorization request that is refused before any login", async () => {
    const fixture = await start();
    const browser = new Browser(fixture.baseUrl);
    const response = await browser.request(`https://mcp.askrigor.com/oauth/gemini/auth?${new URLSearchParams({
      response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "openid offline_access",
      state: "google-state-1", code_challenge: "a".repeat(43), code_challenge_method: "S256",
    }).toString()}`);
    expect(response.status).toBe(400);
    expect(lines()).toEqual(["authorization requested", "library resource_missing"]);
    expect(records[0]!.detail).toMatchObject({ scopes: "openid+offline_access", resource: "absent", other_scopes: 0 });
  });

  it("logs a research call's token check on /mcp/gemini by state, refusal and method name", () => {
    const logged: string[] = [];
    const signIn = createGeminiSignIn({
      issuer: new URL(ISSUER),
      resource: new URL(RESOURCE),
      auth0Issuer: new URL("https://askrigor-test.example.auth0.com/"),
      auth0JwksUrl: new URL("https://askrigor-test.example.auth0.com/.well-known/jwks.json"),
      loginClientId: "gemini-login-client",
      loginClientSecret: "gemini-login-secret-not-real",
      keys: deriveGeminiSignInKeys(Buffer.alloc(32, 7)),
      diagnostics: true,
    }, new MemoryGeminiSignInRowStore(), { log: (line) => logged.push(line) });
    try {
      signIn.noteResourceCheck({ state: "absent" }, { method: "initialize" });
      signIn.noteResourceCheck({ state: "accepted" }, { jsonrpc: "2.0", id: 1, method: "tools/list" });
      signIn.noteResourceCheck({ state: "refused", refusal: "expired" }, { method: "tools/call", params: { name: "x" } });
      signIn.noteResourceCheck({ state: "accepted" }, { method: "custom/secret-method" });
    } finally {
      signIn.stop();
    }
    expect(logged.map((line) => JSON.parse(line))).toEqual([
      { event: "askrigor_gemini_sign_in", stage: "resource", outcome: "accepted", detail: { method: "tools/list" } },
      { event: "askrigor_gemini_sign_in", stage: "resource", outcome: "refused", detail: { method: "tools/call", reason: "expired" } },
      { event: "askrigor_gemini_sign_in", stage: "resource", outcome: "accepted", detail: { method: "other" } },
    ]);
    expect(mcpMethodOf([{ method: "initialize" }])).toBe("batch");
    expect(mcpMethodOf(undefined)).toBe("absent");
  });

  it("writes nothing when the step log is off", async () => {
    const quiet = await startGeminiFixture();
    try {
      const { code, verifier } = await linkToCode(quiet, new Browser(quiet.baseUrl));
      const response = await tokenRequest(quiet, {
        grant_type: "authorization_code", code, redirect_uri: GOOGLE_REDIRECT, code_verifier: verifier,
        client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(quiet),
      });
      expect(response.status).toBe(200);
    } finally {
      await quiet.close();
    }
    expect(records).toEqual([]);
  });
});

describe("the step log's reasons", () => {
  it("are only messages written word for word, this server's own error names, or jose's codes", () => {
    expect(geminiSignInReasonOf({ error_detail: "every audience must be this authorization server" }))
      .toBe("every audience must be this authorization server");
    expect(geminiSignInReasonOf({ message: "invalid_client", cause: { message: "jwt expired" } })).toBe("jwt expired");
    expect(geminiSignInReasonOf(new Error("GEMINI_SIGN_IN_ALREADY_CONSUMED"))).toBe("GEMINI_SIGN_IN_ALREADY_CONSUMED");
    expect(geminiSignInReasonOf({ cause: { code: "ERR_JWKS_NO_MATCHING_KEY" } })).toBe("ERR_JWKS_NO_MATCHING_KEY");
    // A message that carries a value is never logged, even when its wording is close to a listed one.
    expect(geminiSignInReasonOf({ error_detail: "client_assertion_type must have value my-own-value" })).toBe("unlisted");
    expect(geminiSignInReasonOf({ error_detail: `jwt audience missing ${TOKEN_URL}` })).toBe("unlisted");
    expect(geminiSignInReasonOf(new Error(`connect ECONNREFUSED ${PERSON}`))).toBe("unlisted");
    expect(geminiSignInReasonOf("text")).toBe("unlisted");
  });

  it("still occur in this server's check, oidc-provider and jose (a library upgrade that rewords one fails here)", () => {
    const sources = [
      ...sourceFiles(join(process.cwd(), "node_modules/oidc-provider/lib")),
      ...sourceFiles(join(process.cwd(), "node_modules/jose/dist/webapi")),
      join(process.cwd(), "apps/research-mcp/src/gemini-sign-in/provider.ts"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    // Composed in the library from a label: `${label} not found` with label "authorization code" or "refresh token".
    const composed: Record<string, string[]> = {
      "authorization code not found": ["${label} not found`", "'authorization code'"],
      "authorization code already consumed": ["${label} already consumed`", "'authorization code'"],
      "refresh token not found": ["${label} not found`", "'refresh token'"],
      "refresh token already consumed": ["${label} already consumed`", "'refresh token'"],
      [`client_assertion_type must have value ${ASSERTION_TYPE}`]: [
        "client_assertion_type must have value ${assertionType}", `'${ASSERTION_TYPE}'`,
      ],
    };
    const missing = [...GEMINI_SIGN_IN_KNOWN_REASONS].filter((reason) =>
      composed[reason] === undefined ? !sources.includes(reason) : !composed[reason]!.every((part) => sources.includes(part)));
    expect(missing).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(js|ts)$/u.test(name) ? [path] : [];
  });
}
