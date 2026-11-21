import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GOOGLE_JWKS_URL } from "../apps/research-mcp/src/gemini-sign-in/google-client.js";
import {
  countGeminiLinks,
  disconnectGeminiLinks,
  verifyGeminiAccessToken,
} from "../apps/research-mcp/src/gemini-sign-in/resource.js";
import {
  Browser,
  CLIENT_ID,
  CONNECTOR,
  GOOGLE_REDIRECT,
  ISSUER,
  PERSON,
  RESOURCE,
  TOKEN_URL,
  authorizeUrl,
  clientAssertion,
  googleDocument,
  linkToCode,
  pkce,
  startGeminiFixture,
  tokenRequest,
  type GeminiFixture,
} from "./helpers/gemini-sign-in-fixture.js";

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

describe("Gemini's sign-in rules (design v2)", () => {
  let fixture: GeminiFixture;
  let browser: Browser;

  beforeEach(async () => {
    fixture = await startGeminiFixture();
    browser = new Browser(fixture.baseUrl);
  });
  afterEach(async () => {
    await fixture.close();
  });

  async function exchange(code: string, verifier: string, assertion?: string, extra: Record<string, string> = {},
    headers: Record<string, string> = {}) {
    return await tokenRequest(fixture, {
      grant_type: "authorization_code",
      code,
      redirect_uri: GOOGLE_REDIRECT,
      code_verifier: verifier,
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: assertion ?? await clientAssertion(fixture),
      ...extra,
    }, headers);
  }

  async function linked(): Promise<{ access: string; refresh: string }> {
    const { code, verifier } = await linkToCode(fixture, browser);
    const response = await exchange(code, verifier);
    expect(response.status).toBe(200);
    const body = await response.json() as { access_token: string; refresh_token: string };
    return { access: body.access_token, refresh: body.refresh_token };
  }

  async function refresh(refreshToken: string, assertion?: string) {
    return await tokenRequest(fixture, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: assertion ?? await clientAssertion(fixture),
    });
  }

  describe("tokens", () => {
    it("refreshes with a new access token and returns the same refresh token, each time with a fresh assertion", async () => {
      const { access, refresh: refreshToken } = await linked();
      for (let round = 0; round < 2; round += 1) {
        const response = await refresh(refreshToken);
        const body = await response.json() as { access_token: string; refresh_token: string; scope: string };
        expect(response.status, JSON.stringify(body)).toBe(200);
        expect(body.refresh_token).toBe(refreshToken);
        expect(body.access_token).not.toBe(access);
        expect(body.scope).toBe("research:use");
        await expect(verifyGeminiAccessToken(fixture.server, body.access_token)).resolves.toMatchObject({
          extra: { subject: PERSON },
        });
      }
    });

    it("ends the link on revocation: the refresh token and the access tokens stop working", async () => {
      const { access, refresh: refreshToken } = await linked();
      const revoke = await fetch(`${fixture.baseUrl}/oauth/gemini/token/revocation`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
          client_assertion_type: ASSERTION_TYPE,
          client_assertion: await clientAssertion(fixture, { aud: `${ISSUER}/token/revocation` }),
        }).toString(),
      });
      expect(revoke.status).toBe(200);
      await expect(verifyGeminiAccessToken(fixture.server, access)).rejects.toMatchObject({ refusal: "invalid_claims" });
      expect((await refresh(refreshToken)).status).toBe(400);
    });

    it("refuses an access token whose grant is gone, even when the token itself is still stored (F1)", async () => {
      const { access } = await linked();
      const token = await fixture.server.provider.AccessToken.find(access);
      expect(token?.grantId).toBeTypeOf("string");
      const grant = await fixture.server.provider.Grant.find(token!.grantId!);
      await grant!.destroy();
      expect(await fixture.server.provider.AccessToken.find(access)).toBeDefined();
      await expect(verifyGeminiAccessToken(fixture.server, access)).rejects.toMatchObject({ refusal: "invalid_claims" });
    });

    it("refuses a second use of a code and ends what the first use issued", async () => {
      const { code, verifier } = await linkToCode(fixture, browser);
      const first = await exchange(code, verifier);
      const { access_token: access } = await first.json() as { access_token: string };
      const second = await exchange(code, verifier);
      expect(second.status).toBe(400);
      expect((await second.json() as { error: string }).error).toBe("invalid_grant");
      await expect(verifyGeminiAccessToken(fixture.server, access)).rejects.toBeDefined();
    });

    it("refuses a wrong PKCE verifier", async () => {
      const { code } = await linkToCode(fixture, browser);
      const response = await exchange(code, pkce().verifier);
      expect(response.status).toBe(400);
      expect((await response.json() as { error: string }).error).toBe("invalid_grant");
    });

    it("issues no ID token and no owner scope: Gemini's own request (20 Nov Auth0 log) gets research:use only", async () => {
      const { code, verifier } = await linkToCode(fixture, browser, { scope: "research:use cases:review" });
      const response = await exchange(code, verifier);
      const body = await response.json() as Record<string, unknown>;
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.id_token).toBeUndefined();
      expect(body.scope).toBe("research:use");
      // A scope the connector's own document does not declare (openid, offline_access) is refused before any login.
      await expect(linkToCode(fixture, new Browser(fixture.baseUrl), { scope: "openid research:use" }))
        .rejects.toThrow(/error=invalid_scope/u);
    });

    it("works without a resource parameter (the one resource is the default) and refuses another resource", async () => {
      const { code, verifier } = await linkToCode(fixture, browser, { resource: null });
      expect((await exchange(code, verifier)).status).toBe(200);
      const { challenge } = pkce();
      const other = await browser.request(authorizeUrl({
        response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "research:use", state: "s",
        code_challenge: challenge, code_challenge_method: "S256", resource: "https://mcp.askrigor.com/mcp",
      }));
      const location = new URL(other.headers.get("location") ?? "about:blank");
      expect(location.searchParams.get("error")).toBe("invalid_target");
    });
  });

  describe("client assertions", () => {
    it("accepts the issuer and the token endpoint as audience", async () => {
      for (const aud of [ISSUER, TOKEN_URL]) {
        const { code, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl));
        expect((await exchange(code, verifier, await clientAssertion(fixture, { aud }))).status).toBe(200);
      }
    });

    it("refuses a foreign audience, a mixed audience list, a far expiry, a future iat and sub other than iss", async () => {
      for (const overrides of [
        { aud: "https://evil.example/oauth/gemini/token" },
        { aud: [TOKEN_URL, "https://evil.example/token"] },
        { exp: Math.floor(Date.now() / 1_000) + 2 * 60 * 60 },
        { iat: Math.floor(Date.now() / 1_000) + 600 },
        { sub: `${CLIENT_ID}x` },
      ]) {
        const { code, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl));
        const response = await exchange(code, verifier, await clientAssertion(fixture, overrides));
        // 401 when the assertion fails; 400 when its sub names a client that does not exist (still invalid_client).
        expect([400, 401], JSON.stringify(overrides)).toContain(response.status);
        expect((await response.json() as { error: string }).error).toBe("invalid_client");
      }
    });

    it("ignores a forged Host header: the accepted audiences come from the configured issuer only (S1)", async () => {
      const { code, verifier } = await linkToCode(fixture, browser);
      const assertion = await clientAssertion(fixture, { aud: "https://evil.example/oauth/gemini/token" });
      const response = await exchange(code, verifier, assertion, {}, {
        "x-forwarded-host": "evil.example",
      });
      expect(response.status).toBe(401);
    });

    it("fetches Google's keys once for several token requests (shared cache, F5)", async () => {
      await linked();
      await linked();
      expect(fixture.googleFetches.filter((url) => url === GOOGLE_JWKS_URL)).toHaveLength(1);
    });
  });

  describe("which clients are accepted", () => {
    it("refuses a client id on any other host or path without fetching it", async () => {
      const { challenge } = pkce();
      for (const clientId of [
        `https://accountlinking.google.com.evil.example/clientidmetadata/user_bound_provider/${CONNECTOR}`,
        `https://accountlinking.google.com/clientidmetadata/user_bound_provider/other-${CONNECTOR}`,
        `https://evil.example/clientidmetadata/user_bound_provider/${CONNECTOR}`,
        "https://chatgpt.com/oauth/client.json",
      ]) {
        const response = await browser.request(authorizeUrl({
          response_type: "code", client_id: clientId, redirect_uri: GOOGLE_REDIRECT, scope: "research:use", state: "s",
          code_challenge: challenge, code_challenge_method: "S256",
        }));
        expect(response.status, clientId).toBe(400);
        expect(response.headers.get("location")).toBeNull();
      }
      expect(fixture.googleFetches).toEqual([]);
    });

    it("refuses a document that adds a redirect, names other keys, inlines keys, uses a secret or lacks refresh", async () => {
      const { challenge } = pkce();
      const base = googleDocument();
      for (const variant of [
        { redirect_uris: [...(base.redirect_uris as string[]), "https://evil.example/callback"] },
        { redirect_uris: [`https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-ffffffffffffffffffffffff`] },
        { jwks_uri: "https://evil.example/keys.json" },
        { jwks: { keys: [] } },
        { token_endpoint_auth_method: "client_secret_post" },
        { token_endpoint_auth_method: "none" },
        { grant_types: ["authorization_code"] },
        { token_endpoint_auth_signing_alg: "PS256" },
      ]) {
        fixture.document = { ...base, ...variant };
        const fresh = await startFreshFixture();
        const response = await new Browser(fresh.baseUrl).request(authorizeUrl({
          response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "research:use",
          state: "s", code_challenge: challenge, code_challenge_method: "S256",
        }));
        expect(response.status, JSON.stringify(variant)).toBe(400);
        expect(response.headers.get("location")).toBeNull();
        await fresh.close();
      }

      async function startFreshFixture() {
        // A new server, so the library's document cache cannot serve the unaltered document.
        const fresh = await startGeminiFixture();
        fresh.document = fixture.document;
        return fresh;
      }
    });
  });

  describe("the person's steps", () => {
    it("refuses a consent post without its form token or from another origin", async () => {
      const { challenge } = pkce();
      let response = await browser.request(authorizeUrl({
        response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "research:use", state: "s",
        code_challenge: challenge, code_challenge_method: "S256",
      }));
      while (response.status === 302 || response.status === 303) {
        response = await browser.request(new URL(response.headers.get("location")!, "https://mcp.askrigor.com").href);
      }
      expect(response.status).toBe(200);
      const html = await response.text();
      const action = /<form method="post" action="([^"]+)"/u.exec(html)![1]!;
      const token = /name="form_token" value="([^"]+)"/u.exec(html)![1]!;
      const noToken = await browser.request(`https://mcp.askrigor.com${action}`, {
        method: "POST", headers: { origin: "https://mcp.askrigor.com" }, form: { decision: "allow" },
      });
      expect(noToken.status).toBe(403);
      const foreign = await browser.request(`https://mcp.askrigor.com${action}`, {
        method: "POST", headers: { origin: "https://evil.example" }, form: { decision: "allow", form_token: token },
      });
      expect(foreign.status).toBe(403);
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    });

    it("sends Gemini access_denied when the person cancels", async () => {
      const { challenge } = pkce();
      let response = await browser.request(authorizeUrl({
        response_type: "code", client_id: CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, scope: "research:use", state: "s",
        code_challenge: challenge, code_challenge_method: "S256",
      }));
      while (response.status === 302 || response.status === 303) {
        response = await browser.request(new URL(response.headers.get("location")!, "https://mcp.askrigor.com").href);
      }
      const html = await response.text();
      const action = /<form method="post" action="([^"]+)"/u.exec(html)![1]!;
      const token = /name="form_token" value="([^"]+)"/u.exec(html)![1]!;
      response = await browser.request(`https://mcp.askrigor.com${action}`, {
        method: "POST", headers: { origin: "https://mcp.askrigor.com" }, form: { decision: "cancel", form_token: token },
      });
      while (response.status === 302 || response.status === 303) {
        const location = new URL(response.headers.get("location")!, "https://mcp.askrigor.com");
        if (location.origin === "https://oauth-redirect.googleusercontent.com") {
          expect(location.searchParams.get("error")).toBe("access_denied");
          expect(location.searchParams.get("code")).toBeNull();
          return;
        }
        response = await browser.request(location.href);
      }
      throw new Error(`no redirect to Google: ${response.status}`);
    });

    it("refuses an Auth0 ID token with a forged signature", async () => {
      fixture.auth0.forgeNextIdToken = true;
      await expect(linkToCode(fixture, browser)).rejects.toThrow(/status 400/u);
    });
  });

  describe("metadata", () => {
    it("answers the same metadata at all four discovery addresses, and the resource metadata names it", async () => {
      const bodies = [];
      for (const path of [
        "/.well-known/oauth-authorization-server/oauth/gemini",
        "/.well-known/openid-configuration/oauth/gemini",
        "/oauth/gemini/.well-known/openid-configuration",
        "/oauth/gemini/.well-known/oauth-authorization-server",
      ]) {
        const response = await fetch(`${fixture.baseUrl}${path}`, { headers: { host: "evil.example" } });
        expect(response.status, path).toBe(200);
        bodies.push(await response.json() as Record<string, unknown>);
      }
      for (const body of bodies) expect(body).toEqual(bodies[0]);
      expect(bodies[0]).toMatchObject({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/auth`,
        token_endpoint: TOKEN_URL,
        revocation_endpoint: `${ISSUER}/token/revocation`,
        code_challenge_methods_supported: ["S256"],
        client_id_metadata_document_supported: true,
        scopes_supported: ["research:use"],
        response_types_supported: ["code"],
        token_endpoint_auth_methods_supported: ["private_key_jwt"],
        authorization_response_iss_parameter_supported: true,
      });
      expect(bodies[0]!.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
      for (const absent of ["registration_endpoint", "userinfo_endpoint", "end_session_endpoint",
        "pushed_authorization_request_endpoint", "introspection_endpoint", "device_authorization_endpoint"]) {
        expect(bodies[0], absent).not.toHaveProperty(absent);
      }
      const resource = await fetch(`${fixture.baseUrl}/.well-known/oauth-protected-resource/mcp/gemini`);
      expect(await resource.json()).toEqual({
        resource: RESOURCE,
        authorization_servers: [ISSUER],
        scopes_supported: ["research:use"],
        bearer_methods_supported: ["header"],
        resource_name: "AskRigor for Google Gemini",
      });
    });
  });

  describe("what is stored", () => {
    it("keeps no code, token or subject readable at rest (F7)", async () => {
      const { code, verifier } = await linkToCode(fixture, browser);
      const response = await exchange(code, verifier);
      const { access_token: access, refresh_token: refreshToken } = await response.json() as Record<string, string>;
      const everything = Buffer.concat(fixture.rows.snapshot().flatMap((row) =>
        [row.key, row.payload, row.grantKey ?? Buffer.alloc(0), row.uidKey ?? Buffer.alloc(0), row.accountRef ?? Buffer.alloc(0)]));
      for (const secret of [code, access!, refreshToken!, PERSON, CLIENT_ID, "research:use"]) {
        expect(everything.includes(Buffer.from(secret, "utf8")), secret).toBe(false);
      }
    });

    it("counts and ends one person's links (disconnect_gemini, F6)", async () => {
      const first = await linked();
      await linked();
      expect(await countGeminiLinks(fixture.server, PERSON)).toBe(2);
      expect(await countGeminiLinks(fixture.server, "auth0|someone-else")).toBe(0);
      expect(await disconnectGeminiLinks(fixture.server, PERSON)).toBe(2);
      expect(await countGeminiLinks(fixture.server, PERSON)).toBe(0);
      await expect(verifyGeminiAccessToken(fixture.server, first.access)).rejects.toBeDefined();
      expect((await refresh(first.refresh)).status).toBe(400);
    });
  });
});

describe("Gemini's sign-in: one login session per link", () => {
  it("asks a second link in the same browser to sign in again, and gives a different person their own link", async () => {
    const fixture = await startGeminiFixture();
    const browser = new Browser(fixture.baseUrl);
    try {
      const first = await linkToCode(fixture, browser);
      const firstTokens = await tokenRequest(fixture, {
        grant_type: "authorization_code", code: first.code, redirect_uri: GOOGLE_REDIRECT, code_verifier: first.verifier,
        client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(fixture),
      });
      expect(firstTokens.status).toBe(200);
      fixture.auth0.subject = "auth0|someone-else";
      const second = await linkToCode(fixture, browser);
      const secondTokens = await tokenRequest(fixture, {
        grant_type: "authorization_code", code: second.code, redirect_uri: GOOGLE_REDIRECT, code_verifier: second.verifier,
        client_assertion_type: ASSERTION_TYPE, client_assertion: await clientAssertion(fixture),
      });
      const { access_token: access } = await secondTokens.json() as { access_token: string };
      await expect(verifyGeminiAccessToken(fixture.server, access)).resolves.toMatchObject({
        extra: { subject: "auth0|someone-else" },
      });
      expect(await countGeminiLinks(fixture.server, PERSON)).toBe(1);
      expect(await countGeminiLinks(fixture.server, "auth0|someone-else")).toBe(1);
    } finally {
      await fixture.close();
    }
  });
});
