import { describe, expect, it } from "vitest";

import {
  CLAUDE_SURFACE,
  REDIRECT_URI,
  authorizeUrl,
  jwtClaims,
  passFrom,
  pkcePair,
} from "../scripts/web-engine-sign-in.mts";

const CLIENT = "abcdefghijklmnopqrstuvwxyz012345";
const jwt = (claims: Record<string, unknown>) =>
  [{ alg: "RS256", typ: "JWT" }, claims].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") +
  ".signature";
const claims = (overrides: Record<string, unknown> = {}) => ({
  iss: "https://askrigor-prod.us.auth0.com/", sub: "google-oauth2|1234", aud: [CLAUDE_SURFACE],
  azp: CLIENT, scope: "research:use", exp: 2_000, ...overrides,
});

describe("web-app engine sign-in", () => {
  it("makes the PKCE challenge of RFC 7636's example", () => {
    const octets = Buffer.from([116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37,
      77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]);
    expect(pkcePair(octets)).toEqual({
      verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    });
  });

  it("asks Auth0 for research:use on the Claude surface, through Google, with a fresh sign-in", () => {
    const url = authorizeUrl(CLIENT, "challenge", "state");
    expect(url.origin + url.pathname).toBe("https://askrigor-prod.us.auth0.com/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code", client_id: CLIENT, redirect_uri: REDIRECT_URI, scope: "research:use",
      audience: CLAUDE_SURFACE, state: "state", code_challenge: "challenge", code_challenge_method: "S256",
      connection: "google-oauth2", prompt: "login",
    });
    expect(REDIRECT_URI).toBe("http://localhost:51947/callback");
  });

  it("keeps only a research:use pass for the Claude surface, issued to the Claude app for a Google login", () => {
    const kept = passFrom({ access_token: jwt(claims()), refresh_token: "never kept", scope: "research:use" }, CLIENT, 1_000);
    expect(kept).toEqual({ pass: expect.objectContaining({ expires_at: 2_000, scope: "research:use", audience: CLAUDE_SURFACE }) });
    expect(JSON.stringify(kept)).not.toContain("never kept");
    expect(passFrom({ access_token: jwt(claims({ aud: "https://mcp.askrigor.com/mcp" })) }, CLIENT, 1_000))
      .toEqual({ problem: expect.stringContaining("not for AskRigor's Claude surface") });
    expect(passFrom({ access_token: jwt(claims({ azp: "another" })) }, CLIENT, 1_000))
      .toEqual({ problem: expect.stringContaining("another application") });
    expect(passFrom({ access_token: jwt(claims({ sub: "auth0|owner" })) }, CLIENT, 1_000))
      .toEqual({ problem: expect.stringContaining("not the Google login") });
    expect(passFrom({ access_token: jwt(claims({ scope: "research:use cases:review" })) }, CLIENT, 1_000))
      .toEqual({ problem: expect.stringContaining("more than research:use (cases:review)") });
    expect(passFrom({ access_token: jwt(claims({ scope: "openid" })) }, CLIENT, 1_000))
      .toEqual({ problem: expect.stringContaining("lacks research:use") });
    expect(passFrom({ access_token: jwt(claims({ exp: 900 })) }, CLIENT, 1_000))
      .toEqual({ problem: expect.stringContaining("expired") });
    expect(passFrom({ access_token: "opaque" }, CLIENT, 1_000)).toEqual({ problem: "the access token is not a JWT" });
    expect(passFrom({}, CLIENT, 1_000)).toEqual({ problem: "Auth0 returned no access token" });
    expect(jwtClaims("a.b")).toBeUndefined();
  });
});
