import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyGeminiAccessToken } from "../apps/research-mcp/src/gemini-sign-in/resource.js";
import {
  Browser,
  CLIENT_ID,
  GOOGLE_REDIRECT,
  PERSON,
  RESOURCE,
  authorizeUrl,
  clientAssertion,
  linkToCode,
  pkce,
  startGeminiFixture,
  tokenRequest,
  type GeminiFixture,
} from "./helpers/gemini-sign-in-fixture.js";

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

describe("Gemini's sign-in: AskRigor's own authorization server (owner answer 386b)", () => {
  let fixture: GeminiFixture;
  let browser: Browser;

  beforeEach(async () => {
    fixture = await startGeminiFixture();
    browser = new Browser(fixture.baseUrl);
  });
  afterEach(async () => {
    await fixture.close();
  });

  async function exchange(code: string, verifier: string, assertion?: string) {
    return await tokenRequest(fixture, {
      grant_type: "authorization_code",
      code,
      redirect_uri: GOOGLE_REDIRECT,
      code_verifier: verifier,
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: assertion ?? await clientAssertion(fixture),
    });
  }

  it("links Google's real document end to end: login through Auth0, consent, code, tokens, a research identity", async () => {
    const { code, verifier, location } = await linkToCode(fixture, browser);
    expect(location.searchParams.get("state")).toBe("google-state-1");
    expect(location.searchParams.get("iss")).toBe("https://mcp.askrigor.com/oauth/gemini");
    const response = await exchange(code, verifier);
    const body = await response.json() as Record<string, unknown>;
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toBe("research:use");
    expect(typeof body.refresh_token).toBe("string");
    expect(body.id_token).toBeUndefined();
    expect(Number(body.expires_in)).toBeLessThanOrEqual(3_600);
    const auth = await verifyGeminiAccessToken(fixture.server, String(body.access_token));
    expect(auth).toMatchObject({
      clientId: CLIENT_ID,
      scopes: ["research:use"],
      extra: { subject: PERSON },
    });
    expect(auth.resource?.href).toBe(RESOURCE);
  });

  it("links through production's proxy, which sends no-referrer on every page (release E, 22 Nov 2026)", async () => {
    const behindProxy = new Browser(fixture.baseUrl, { proxyReferrerPolicy: "no-referrer" });
    const { code, verifier } = await linkToCode(fixture, behindProxy);
    expect((await exchange(code, verifier)).status).toBe(200);
  });

  it("refuses a forged client assertion (signed by a key Google never published)", async () => {
    const { code, verifier } = await linkToCode(fixture, browser);
    const forged = await clientAssertion(fixture, {}, { key: fixture.strangerKey });
    const response = await exchange(code, verifier, forged);
    expect(response.status).toBe(401);
    expect((await response.json() as { error: string }).error).toBe("invalid_client");
  });

  it("refuses a client assertion used twice (single-use jti)", async () => {
    const first = await linkToCode(fixture, browser);
    const assertion = await clientAssertion(fixture);
    expect((await exchange(first.code, first.verifier, assertion)).status).toBe(200);
    const second = await linkToCode(fixture, new Browser(fixture.baseUrl));
    const replay = await exchange(second.code, second.verifier, assertion);
    expect(replay.status).toBe(401);
    expect((await replay.json() as { error: string }).error).toBe("invalid_client");
  });

  it("never redirects to an address the document does not list", async () => {
    const { challenge } = pkce();
    for (const redirect of [
      "https://evil.example/callback",
      "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-ffffffffffffffffffffffff",
      `${GOOGLE_REDIRECT}/extra`,
    ]) {
      const response = await browser.request(authorizeUrl({
        response_type: "code", client_id: CLIENT_ID, redirect_uri: redirect, scope: "research:use",
        state: "s", code_challenge: challenge, code_challenge_method: "S256", resource: RESOURCE,
      }));
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).not.toContain("evil.example");
    }
  });

  it("refuses an authorization without PKCE, or with plain PKCE", async () => {
    const missing = await browser.request(authorizeUrl({
      response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "research:use", state: "s", resource: RESOURCE,
      }));
    const missingLocation = new URL(missing.headers.get("location") ?? "about:blank");
    expect(missingLocation.origin).toBe("https://oauth-redirect.googleusercontent.com");
    expect(missingLocation.searchParams.get("error")).toBe("invalid_request");
    expect(missingLocation.searchParams.get("code")).toBeNull();
    const plain = await browser.request(authorizeUrl({
      response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "research:use", state: "s",
      code_challenge: "a".repeat(43), code_challenge_method: "plain", resource: RESOURCE,
      }));
    const plainLocation = new URL(plain.headers.get("location") ?? "about:blank");
    expect(plainLocation.searchParams.get("error")).toBe("invalid_request");
    expect(plainLocation.searchParams.get("code")).toBeNull();
  });
});
