import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import * as oauth from "oauth4webapi";

import { GEMINI_ISSUER_PATH, type GeminiSignInSettings } from "./config.js";
import { LOGIN_SECONDS } from "./provider.js";

/**
 * The person's own login, through AskRigor's regular web application in the Auth0 tenant the connectors already use
 * (design 4.4, v2 F3). Only `openid` is asked for, with Auth0's userinfo audience, so Auth0 never issues an AskRigor API
 * token here and no email or profile is requested. `oauth4webapi` builds the request and checks the callback (state, the
 * `iss` response parameter, errors), the token response and the ID token's claims (issuer, audience, nonce, expiry);
 * `jose` also checks the ID token's signature against the tenant's keys, which oauth4webapi leaves to TLS.
 *
 * The login state (state, nonce, PKCE verifier and the interaction it belongs to) travels in a sealed `__Host-` cookie
 * for at most ten minutes. After the callback, the verified subject travels for at most two minutes in a second sealed
 * cookie to the interaction's own address, where the library's interaction cookie is present (v2 F3).
 */
export const GEMINI_CALLBACK_PATH = `${GEMINI_ISSUER_PATH}/callback`;
export const LOGIN_STATE_COOKIE = "__Host-askrigor-gemini-login";
export const LOGIN_RESULT_COOKIE = "__Host-askrigor-gemini-signed-in";
const RESULT_SECONDS = 2 * 60;
const SUBJECT = /^[^\s\u0000-\u001f\u007f]{1,512}$/u;
const UID = /^[A-Za-z0-9_-]{1,64}$/u;

interface LoginState {
  readonly v: 1;
  readonly uid: string;
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly exp: number;
}

interface LoginResult {
  readonly v: 1;
  readonly uid: string;
  /** The verified subject; absent when the person cancelled at Auth0. */
  readonly sub?: string;
  readonly denied?: true;
  readonly exp: number;
}

/** What the login produced for one interaction: the person's subject, or their cancellation. */
export type GeminiLoginOutcome = { readonly subject: string } | { readonly denied: true };

export class GeminiLoginError extends Error {
  constructor(readonly code: "session_expired" | "access_denied" | "login_failed") {
    super(`GEMINI_SIGN_IN_LOGIN_${code.toUpperCase()}`);
  }
}

export class GeminiLogin {
  private readonly as: oauth.AuthorizationServer;
  private readonly client: oauth.Client;
  private readonly jwks: JWTVerifyGetKey;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => Date;

  constructor(
    private readonly settings: GeminiSignInSettings,
    options: { jwks?: JWTVerifyGetKey; fetch?: typeof fetch; now?: () => Date } = {},
  ) {
    const tenant = settings.auth0Issuer.href.endsWith("/") ? settings.auth0Issuer.href : `${settings.auth0Issuer.href}/`;
    this.as = {
      issuer: settings.auth0Issuer.href,
      authorization_endpoint: new URL("authorize", tenant).href,
      token_endpoint: new URL("oauth/token", tenant).href,
      jwks_uri: settings.auth0JwksUrl.href,
      authorization_response_iss_parameter_supported: true,
    };
    this.client = { client_id: settings.loginClientId };
    this.jwks = options.jwks ?? createRemoteJWKSet(settings.auth0JwksUrl);
    this.fetchImpl = options.fetch;
    this.now = options.now ?? (() => new Date());
  }

  callbackUrl(): string {
    return `${this.settings.issuer.origin}${GEMINI_CALLBACK_PATH}`;
  }

  /** Where to send the browser to sign in, and the sealed login state to set as a cookie. */
  async start(uid: string): Promise<{ location: string; stateCookie: string }> {
    if (!UID.test(uid)) throw new GeminiLoginError("login_failed");
    const state: LoginState = {
      v: 1,
      uid,
      state: oauth.generateRandomState(),
      nonce: oauth.generateRandomNonce(),
      verifier: oauth.generateRandomCodeVerifier(),
      exp: this.seconds() + LOGIN_SECONDS,
    };
    const location = new URL(this.as.authorization_endpoint!);
    location.search = new URLSearchParams({
      response_type: "code",
      client_id: this.client.client_id,
      redirect_uri: this.callbackUrl(),
      scope: "openid",
      // The tenant's default audience is the MCP API; this login wants an ID token only (as the Atlas's login does).
      audience: new URL("userinfo", this.as.authorization_endpoint).href,
      state: state.state,
      nonce: state.nonce,
      code_challenge: await oauth.calculatePKCECodeChallenge(state.verifier),
      code_challenge_method: "S256",
      // Every link asks for the person's own sign-in, never a remembered one.
      prompt: "login",
    }).toString();
    return { location: location.href, stateCookie: seal(this.settings.keys.loginSeal, LOGIN_STATE_COOKIE, state) };
  }

  /** Checks Auth0's callback against the login state and returns the interaction and the sealed result cookie. */
  async finish(callbackUrl: URL, stateCookie: string | undefined): Promise<{ uid: string; resultCookie: string }> {
    const state = open<LoginState>(this.settings.keys.loginSeal, LOGIN_STATE_COOKIE, stateCookie);
    if (state === undefined || state.v !== 1 || state.exp <= this.seconds() || !UID.test(state.uid)) {
      throw new GeminiLoginError("session_expired");
    }
    let parameters: URLSearchParams;
    try {
      parameters = oauth.validateAuthResponse(this.as, this.client, callbackUrl, state.state);
    } catch (error) {
      if (error instanceof oauth.AuthorizationResponseError && error.error === "access_denied") {
        // A cancellation with a genuine state: Gemini is told the person declined (the interaction ends with it).
        const denied: LoginResult = { v: 1, uid: state.uid, denied: true, exp: this.seconds() + RESULT_SECONDS };
        return { uid: state.uid, resultCookie: seal(this.settings.keys.loginSeal, LOGIN_RESULT_COOKIE, denied) };
      }
      throw new GeminiLoginError("login_failed");
    }
    let subject: string;
    try {
      const response = await oauth.authorizationCodeGrantRequest(
        this.as,
        this.client,
        oauth.ClientSecretPost(this.settings.loginClientSecret),
        parameters,
        this.callbackUrl(),
        state.verifier,
        {
          signal: AbortSignal.timeout(10_000),
          ...(this.fetchImpl === undefined ? {} : { [oauth.customFetch]: this.fetchImpl }),
        },
      );
      const result = await oauth.processAuthorizationCodeResponse(this.as, this.client, response, {
        expectedNonce: state.nonce,
        requireIdToken: true,
      });
      const idToken = result.id_token;
      if (typeof idToken !== "string" || idToken.length > 16_384) throw new Error("id_token");
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: this.settings.auth0Issuer.href,
        audience: this.client.client_id,
        algorithms: ["RS256"],
        currentDate: this.now(),
      });
      if (payload.nonce !== state.nonce || typeof payload.sub !== "string" || !SUBJECT.test(payload.sub)) {
        throw new Error("claims");
      }
      subject = payload.sub;
    } catch {
      throw new GeminiLoginError("login_failed");
    }
    const result: LoginResult = { v: 1, uid: state.uid, sub: subject, exp: this.seconds() + RESULT_SECONDS };
    return { uid: state.uid, resultCookie: seal(this.settings.keys.loginSeal, LOGIN_RESULT_COOKIE, result) };
  }

  /** The login's outcome for this interaction, when the result cookie is genuine, fresh and for this uid. */
  readResult(resultCookie: string | undefined, uid: string): GeminiLoginOutcome | undefined {
    const result = open<LoginResult>(this.settings.keys.loginSeal, LOGIN_RESULT_COOKIE, resultCookie);
    if (result === undefined || result.v !== 1 || result.uid !== uid || result.exp <= this.seconds()) return undefined;
    if (result.denied === true && result.sub === undefined) return { denied: true };
    return typeof result.sub === "string" && SUBJECT.test(result.sub) ? { subject: result.sub } : undefined;
  }

  private seconds(): number {
    return Math.floor(this.now().getTime() / 1_000);
  }
}

function seal(key: Buffer, name: string, payload: object): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]).toString("base64url");
}

function open<T>(key: Buffer, name: string, value: string | undefined): T | undefined {
  if (value === undefined || value.length > 4_096 || !/^[A-Za-z0-9_-]+$/u.test(value)) return undefined;
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.byteLength < 12 + 16 + 2) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(name, "utf8"));
    decipher.setAuthTag(raw.subarray(raw.byteLength - 16));
    const text = Buffer.concat([decipher.update(raw.subarray(12, raw.byteLength - 16)), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed as T : undefined;
  } catch {
    return undefined;
  }
}
