import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * AskRigor's terms page right after a person's first sign-in (owner answer 419a, 26 November 2026; plan
 * docs/superpowers/plans/2026-11-25-terms-at-sign-up.md). Two tokens pass between the Auth0 Action
 * (ops/auth0/actions/terms-at-first-sign-in.js) and this server, both HS256 under one shared secret: the server's
 * ASKRIGOR_AUTH0_TERMS_SECRET, the Action's TERMS_SECRET.
 *
 * - The Action's token brings the person here (api.redirect.encodeToken). Auth0 writes sub (the user's ID), iss (the
 *   tenant's hostname), exp and ip; the Action adds aud "askrigor-terms" and asks for ten minutes. Auth0 adds the
 *   transaction's state to the page's address only after the Action has run, so this token cannot carry it (Auth0,
 *   "Redirect with Actions"): a state claim, when one is there, must equal the address's.
 * - The page's answer goes back to Auth0's /continue in a POST's body, never in an address: iss "askrigor-terms", sub,
 *   state, accepted and, when the account's yes covers the current notice, notice_version; valid five minutes. The
 *   Action checks it with api.redirect.validateToken, which checks the signature, the expiry and that its state is the
 *   transaction's.
 *
 * Neither stands in for the other: the Action's token never has iss "askrigor-terms" and has no state for Auth0 to
 * match, and the page's answer never has the tenant's issuer or this audience.
 */

export const ACCOUNT_TERMS_PATH = "/account/terms";
/** The Action's token's audience, and the issuer of the page's answer: the application the Action redirects to. */
export const TERMS_TOKEN_AUDIENCE = "askrigor-terms";
/** The field that carries a token in a form, here and at Auth0's /continue (the Action's tokenParameterName). */
export const TERMS_TOKEN_FIELD = "session_token";
/** The longest the Action's token may be valid. */
export const TERMS_TOKEN_MAX_SECONDS = 600;
/** How long the page's answer is valid. */
export const TERMS_ANSWER_SECONDS = 300;
/** The clock difference allowed between Auth0 and this server. */
export const TERMS_CLOCK_TOLERANCE_SECONDS = 30;

export interface AccountTermsSettings {
  /** The shared secret's text as UTF-8: Auth0 signs with the text itself, not with bytes it encodes. */
  secret: Uint8Array;
  /** The tenant the connector already trusts (ASKRIGOR_OAUTH_ISSUER_URL). */
  issuerUrl: URL;
  /** The tenant's /continue endpoint, where the page's answer goes. */
  continueUrl: URL;
}

/** 43 or more base64url characters: 32 random bytes or more, and nothing an env file or Auth0's form could alter. */
const SECRET = /^[A-Za-z0-9_-]{43,512}$/u;

/**
 * The terms page's settings: the shared secret and the tenant the connector trusts. Undefined, and the page answers
 * 503, while the secret is unset or malformed or the connector's OAuth is off; nothing else depends on them.
 */
export function accountTermsSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): AccountTermsSettings | undefined {
  const secret = env.ASKRIGOR_AUTH0_TERMS_SECRET;
  if (secret === undefined || !SECRET.test(secret) || env.ASKRIGOR_OAUTH_ENABLED !== "true") return undefined;
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(env.ASKRIGOR_OAUTH_ISSUER_URL ?? "");
  } catch {
    return undefined;
  }
  // An Auth0 issuer is exactly https://<tenant domain>/; anything else is not a tenant this page can return to.
  if (issuerUrl.protocol !== "https:" || issuerUrl.username !== "" || issuerUrl.password !== "" ||
    issuerUrl.port !== "" || issuerUrl.pathname !== "/" || issuerUrl.search !== "" || issuerUrl.hash !== "") {
    return undefined;
  }
  return {
    secret: new TextEncoder().encode(secret),
    issuerUrl,
    continueUrl: new URL("/continue", issuerUrl),
  };
}

/** A page visit the Action's token admits: whose account, and the Auth0 transaction's state to return with. */
export interface TermsVisit {
  subject: string;
  state: string;
}

/** A compact JWS, as the Action's token is: three base64url parts. */
const JWS = /^[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,512}$/u;
/**
 * Auth0's state as the page's address carries it, decoded: base64 or base64url characters and the other unreserved
 * ones, nothing a page or an address could read as markup or a separator.
 */
export const TERMS_STATE = /^[A-Za-z0-9._~+/=-]{1,2048}$/u;
/** An Auth0 user ID as the research account key takes it (researchAccountKeyForSubject): no space or control character. */
const SUBJECT = /^[^\s\u0000-\u001f\u007f]{1,512}$/u;

/**
 * The visit the Action's token admits, or undefined: the signature under the shared secret (HS256 only), the tenant
 * as issuer (Auth0 writes its hostname; the issuer URL is also taken), the page as audience, an expiry no more than ten
 * minutes ahead, a subject, and the state the address carries. Nothing is read from an unverified token.
 */
export async function verifyTermsVisit(
  token: unknown,
  state: unknown,
  settings: AccountTermsSettings,
  now: Date,
): Promise<TermsVisit | undefined> {
  if (typeof token !== "string" || !JWS.test(token) || typeof state !== "string" || !TERMS_STATE.test(state)) {
    return undefined;
  }
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, settings.secret, {
      algorithms: ["HS256"],
      issuer: [settings.issuerUrl.hostname, settings.issuerUrl.href],
      audience: TERMS_TOKEN_AUDIENCE,
      requiredClaims: ["exp", "sub"],
      clockTolerance: TERMS_CLOCK_TOLERANCE_SECONDS,
      currentDate: now,
    }));
  } catch {
    return undefined;
  }
  const exp = payload.exp!;
  if (exp - Math.floor(now.getTime() / 1_000) > TERMS_TOKEN_MAX_SECONDS + TERMS_CLOCK_TOLERANCE_SECONDS) return undefined;
  if (payload.iat !== undefined && exp - payload.iat > TERMS_TOKEN_MAX_SECONDS) return undefined;
  if (typeof payload.sub !== "string" || !SUBJECT.test(payload.sub)) return undefined;
  if (payload.state !== undefined && payload.state !== state) return undefined;
  return { subject: payload.sub, state };
}

/** What the page answers Auth0: whether the sign-in goes on, and the notice version the account's yes covers. */
export interface TermsAnswer {
  accepted: boolean;
  /** Only with accepted, when the account holds a yes that covers the current notice. */
  noticeVersion?: string;
}

/** The page's answer for Auth0's /continue, signed with the shared secret, valid five minutes. */
export async function signTermsAnswer(visit: TermsVisit, answer: TermsAnswer, settings: AccountTermsSettings,
  now: Date): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  return await new SignJWT({
    state: visit.state,
    accepted: answer.accepted,
    ...(answer.accepted && answer.noticeVersion !== undefined ? { notice_version: answer.noticeVersion } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(TERMS_TOKEN_AUDIENCE)
    .setSubject(visit.subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TERMS_ANSWER_SECONDS)
    .sign(settings.secret);
}
