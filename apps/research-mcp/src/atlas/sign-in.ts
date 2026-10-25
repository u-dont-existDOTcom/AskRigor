import { jwtVerify, type JWTVerifyGetKey } from "jose";

import {
  type AtlasParticipationSettings,
  type AtlasSignInState,
  newSignInState,
  participantKeyFor,
  pkceChallenge,
} from "./participation.js";

/**
 * Signing in to vote or comment in the Atlas (decision 171, section 4D; design
 * docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, section D): the AskRigor login of the apps, through
 * the same Auth0 tenant, as a regular web application with the authorization code flow and PKCE. Only the openid scope
 * is asked for, so no email address or profile claim is ever requested. The callback exchanges the code with the
 * client secret and the PKCE verifier, verifies the ID token against the tenant's keys (issuer, audience, nonce,
 * expiry), and derives from its subject the participant key; nothing else of the token is kept.
 */

export interface AtlasSignInSettings {
  /** The tenant the connector already uses (ASKRIGOR_OAUTH_ISSUER_URL). */
  issuerUrl: URL;
  /** The Atlas's Auth0 application (ASKRIGOR_ATLAS_AUTH0_CLIENT_ID and ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET). */
  clientId: string;
  clientSecret: string;
  /** The tenant's keys (ASKRIGOR_OAUTH_JWKS_URL). */
  jwks: JWTVerifyGetKey;
  /** The token request's transport; the global fetch by default. */
  fetch?: typeof fetch;
}

export const ATLAS_SIGN_IN_PATH = "/atlas/auth/login";
export const ATLAS_CALLBACK_PATH = "/atlas/auth/callback";
export const ATLAS_SIGN_OUT_PATH = "/atlas/auth/logout";

/** The callback the Auth0 application allows: the public origin's /atlas/auth/callback. */
export const callbackUrl = (settings: AtlasParticipationSettings) => `${settings.publicOrigin}${ATLAS_CALLBACK_PATH}`;

/**
 * Signing out of the tenant's own login in this browser, back to the public origin's /atlas (the Auth0 application's
 * allowed logout URL). Signing out of the Atlas clears only the Atlas's cookie; the pages offer this link afterwards,
 * so the next sign-in asks for the password again. It is a plain link: the pages' content policy lets a form go only
 * to this origin.
 */
export function tenantSignOutUrl(settings: AtlasParticipationSettings, signIn: AtlasSignInSettings): string {
  const location = new URL("v2/logout", withTrailingSlash(signIn.issuerUrl));
  location.search = new URLSearchParams({ client_id: signIn.clientId, returnTo: `${settings.publicOrigin}/atlas` }).toString();
  return location.href;
}

/** The start of a sign-in: a new state, nonce and PKCE verifier, and where the reader goes to sign in. */
export function startSignIn(settings: AtlasParticipationSettings, signIn: AtlasSignInSettings, returnPath: string,
  now: Date): { state: AtlasSignInState; location: string } {
  const state = newSignInState(returnPath, now);
  const location = new URL("authorize", withTrailingSlash(signIn.issuerUrl));
  location.search = new URLSearchParams({
    response_type: "code",
    client_id: signIn.clientId,
    redirect_uri: callbackUrl(settings),
    scope: "openid",
    // The tenant's default audience is the MCP API, which admits only the connectors' applications. The Atlas wants an
    // ID token alone, so it names Auth0's own userinfo audience and never asks for the MCP API (on 25 Oct the tenant
    // refused every sign-in without it: the client "is not authorized to access resource server").
    audience: new URL("userinfo", withTrailingSlash(signIn.issuerUrl)).href,
    state: state.state,
    nonce: state.nonce,
    code_challenge: pkceChallenge(state.verifier),
    code_challenge_method: "S256",
  }).toString();
  return { state, location: location.href };
}

export type AtlasSignInRefusal =
  | "sign_in_expired"
  | "state_mismatch"
  | "denied"
  | "token_exchange_failed"
  | "token_invalid";

export class AtlasSignInError extends Error {
  constructor(readonly refusal: AtlasSignInRefusal) {
    super(`ATLAS_SIGN_IN_${refusal.toUpperCase()}`);
  }
}

const CODE = /^[A-Za-z0-9._~-]{1,1024}$/u;

/**
 * The end of a sign-in: the callback's code and state against the sign-in cookie's, the code exchanged for an ID token
 * with the client secret and the PKCE verifier, the token verified, and the participant key derived from its subject.
 */
export async function finishSignIn(input: {
  settings: AtlasParticipationSettings;
  signIn: AtlasSignInSettings;
  /** The callback's query. */
  query: URLSearchParams;
  /** The sign-in cookie's state; undefined when it is missing, altered or expired. */
  state: AtlasSignInState | undefined;
  now: Date;
}): Promise<{ participantKey: string; returnPath: string }> {
  const { settings, signIn, query, state } = input;
  if (state === undefined) throw new AtlasSignInError("sign_in_expired");
  if (query.get("state") !== state.state) throw new AtlasSignInError("state_mismatch");
  if (query.has("error")) throw new AtlasSignInError("denied");
  const code = query.get("code");
  if (code === null || !CODE.test(code)) throw new AtlasSignInError("token_exchange_failed");

  let idToken: unknown;
  try {
    const response = await (signIn.fetch ?? fetch)(new URL("oauth/token", withTrailingSlash(signIn.issuerUrl)), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: signIn.clientId,
        client_secret: signIn.clientSecret,
        code,
        code_verifier: state.verifier,
        redirect_uri: callbackUrl(settings),
      }).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("status");
    idToken = ((await response.json()) as { id_token?: unknown }).id_token;
  } catch {
    throw new AtlasSignInError("token_exchange_failed");
  }
  if (typeof idToken !== "string" || idToken.length === 0 || idToken.length > 16_384) {
    throw new AtlasSignInError("token_exchange_failed");
  }
  let subject: string;
  try {
    const { payload } = await jwtVerify(idToken, signIn.jwks, {
      // Exactly the issuer the connector checks its access tokens against.
      issuer: signIn.issuerUrl.href,
      audience: signIn.clientId,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "nonce"],
      currentDate: input.now,
    });
    if (payload.nonce !== state.nonce || typeof payload.sub !== "string") throw new Error("claims");
    subject = payload.sub;
  } catch {
    throw new AtlasSignInError("token_invalid");
  }
  let participantKey: string;
  try {
    participantKey = participantKeyFor(settings, subject);
  } catch {
    throw new AtlasSignInError("token_invalid");
  }
  return { participantKey, returnPath: state.returnPath };
}

/** Auth0's issuer ends with a slash; the tenant's endpoints sit under it. */
function withTrailingSlash(url: URL): URL {
  return url.href.endsWith("/") ? url : new URL(`${url.href}/`);
}
