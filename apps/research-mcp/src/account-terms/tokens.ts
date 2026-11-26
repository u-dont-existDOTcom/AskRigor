import { createHash } from "node:crypto";

import { SignJWT, compactVerify, jwtVerify, type JWTPayload } from "jose";

/**
 * AskRigor's terms page right after a person's first sign-in (owner answer 419a, 26 November 2026; plan
 * docs/superpowers/plans/2026-11-25-terms-at-sign-up.md). Two tokens pass between the Auth0 Action
 * (ops/auth0/actions/terms-at-first-sign-in.js) and this server, both HS256 under one shared secret: the server's
 * ASKRIGOR_AUTH0_TERMS_SECRET, the Action's TERMS_SECRET.
 *
 * - The Action's token brings the person here (api.redirect.encodeToken). Auth0 writes sub (the user's ID), iss (the
 *   tenant's hostname), exp and ip; the Action adds aud "askrigor-terms", the /continue address of the domain the
 *   person is signing in through (continue_uri), and asks for ten minutes. Auth0 adds the transaction's state to the
 *   page's address only after the Action has run, so this token cannot carry it (Auth0, "Redirect with Actions"): a
 *   state claim, when one is there, must equal the address's. The page's POST uses it once (routes.ts).
 * - The page's answer goes back to Auth0's /continue in a POST's body, never in an address: iss "askrigor-terms", the
 *   state, sub when known, and one outcome: accepted (with notice_version when the account's yes covers the current
 *   notice), declined, or not_recorded with a reason, when the page could not take an answer (the security review of
 *   26 Nov 2026: a failure here must not strand the sign-in, and must record nothing). Valid five minutes. The Action
 *   checks it with api.redirect.validateToken, which checks the signature, the expiry and that its state is the
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
/**
 * Why the page let a sign-in go on without an answer: nothing was recorded, and the research tools still refuse. A token
 * that did not check out; an account store that did not answer; a second press whose first press recorded nothing.
 */
export const TERMS_NOT_RECORDED_REASONS = ["link_not_verified", "account_store_unavailable", "already_answered"] as const;
export type TermsNotRecordedReason = typeof TERMS_NOT_RECORDED_REASONS[number];

export interface AccountTermsSettings {
  /**
   * The shared secret's text as UTF-8 (Auth0 signs with the text itself); undefined while ASKRIGOR_AUTH0_TERMS_SECRET
   * is unset or malformed, and the page then answers 503 with only a way on to the tenant.
   */
  secret: Uint8Array | undefined;
  /** The tenant the connector already trusts (ASKRIGOR_OAUTH_ISSUER_URL). */
  issuerUrl: URL;
  /** The tenant's /continue, where an answer goes unless the Action's token names the domain the person uses. */
  continueUrl: URL;
}

/** 43 or more base64url characters: 32 random bytes or more, and nothing an env file or Auth0's form could alter. */
const SECRET = /^[A-Za-z0-9_-]{43,512}$/u;

/**
 * The terms page's settings: the tenant the connector trusts and, when set, the shared secret. Undefined while the
 * connector's OAuth is off or its issuer is not an Auth0 tenant's, and the page answers 503; nothing else depends on it.
 */
export function accountTermsSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): AccountTermsSettings | undefined {
  if (env.ASKRIGOR_OAUTH_ENABLED !== "true") return undefined;
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
  const secret = env.ASKRIGOR_AUTH0_TERMS_SECRET;
  return {
    secret: secret !== undefined && SECRET.test(secret) ? new TextEncoder().encode(secret) : undefined,
    issuerUrl,
    continueUrl: new URL("/continue", issuerUrl),
  };
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
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

/** Where an answer goes: the state to return with, the /continue to post to, and whose sign-in it is, when known. */
export interface TermsReturn {
  state: string;
  continueUrl: URL;
  subject?: string;
}

/** A page visit the Action's token admits, once its signature and every claim check out. */
export interface TermsVisit extends TermsReturn {
  subject: string;
  /** The token's SHA-256, by which its one answer is kept. */
  tokenSha256: string;
  /** When the token can no longer be used here, its expiry and the clock difference allowed: its answer is kept so long. */
  usableUntil: Date;
}

export type TermsVisitCheck =
  /** The signature and every claim check out. */
  | { kind: "valid"; visit: TermsVisit }
  /**
   * The request is well formed but the token does not check out: a secret or issuer that differs from the Action's, an
   * expired or altered token. signed says whether the signature itself checked out, so its subject and continue_uri can
   * be trusted; without it the answer goes to the tenant the connector trusts.
   */
  | { kind: "unverified"; back: TermsReturn; signed: boolean }
  /** No single token, or no single well-formed state: nothing to answer. */
  | { kind: "malformed" };

/** The /continue of the domain the Action says the person signs in through: https, no port, query or fragment. */
function continueUrlOf(value: unknown): URL | undefined {
  if (typeof value !== "string" || value.length > 300) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" &&
    url.pathname === "/continue" && url.search === "" && url.hash === "" && HOSTNAME.test(url.hostname) &&
    url.href === `https://${url.hostname}/continue`
    ? url
    : undefined;
}

/** The claims of a token whose signature alone checks out; undefined when it does not. */
async function signedClaims(token: string, secret: Uint8Array): Promise<JWTPayload | undefined> {
  try {
    const { payload } = await compactVerify(token, secret, { algorithms: ["HS256"] });
    const claims: unknown = JSON.parse(new TextDecoder().decode(payload));
    return typeof claims === "object" && claims !== null && !Array.isArray(claims) ? claims as JWTPayload : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a request's token and state admit. Valid: the signature under the shared secret (HS256 only), the tenant as
 * issuer (Auth0 writes its hostname; the issuer URL is also taken), the page as audience, an expiry no more than ten
 * minutes ahead, a subject, and the state the address carries. Nothing is read from a token whose signature fails.
 */
export async function checkTermsVisit(
  token: unknown,
  state: unknown,
  settings: AccountTermsSettings & { secret: Uint8Array },
  now: Date,
): Promise<TermsVisitCheck> {
  if (typeof token !== "string" || !JWS.test(token) || typeof state !== "string" || !TERMS_STATE.test(state)) {
    return { kind: "malformed" };
  }
  const unverified = async (): Promise<TermsVisitCheck> => {
    const claims = await signedClaims(token, settings.secret);
    if (claims === undefined) return { kind: "unverified", signed: false, back: { state, continueUrl: settings.continueUrl } };
    return {
      kind: "unverified",
      signed: true,
      back: {
        state,
        continueUrl: continueUrlOf(claims.continue_uri) ?? settings.continueUrl,
        ...(typeof claims.sub === "string" && SUBJECT.test(claims.sub) ? { subject: claims.sub } : {}),
      },
    };
  };
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
    return await unverified();
  }
  const exp = payload.exp!;
  if (exp - Math.floor(now.getTime() / 1_000) > TERMS_TOKEN_MAX_SECONDS + TERMS_CLOCK_TOLERANCE_SECONDS ||
    (payload.iat !== undefined && exp - payload.iat > TERMS_TOKEN_MAX_SECONDS) ||
    typeof payload.sub !== "string" || !SUBJECT.test(payload.sub) ||
    (payload.state !== undefined && payload.state !== state)) {
    return await unverified();
  }
  return {
    kind: "valid",
    visit: {
      subject: payload.sub,
      state,
      continueUrl: continueUrlOf(payload.continue_uri) ?? settings.continueUrl,
      tokenSha256: createHash("sha256").update(token, "utf8").digest("hex"),
      // Kept a minute past the last moment the token is admitted, so it is never admitted twice.
      usableUntil: new Date((exp + TERMS_CLOCK_TOLERANCE_SECONDS + 60) * 1_000),
    },
  };
}

/** What the page answers Auth0: the sign-in goes on accepted, ends declined, or goes on with nothing recorded. */
export type TermsAnswer =
  /** noticeVersion: when the account holds a yes that covers the current notice. */
  | { accepted: true; noticeVersion?: string }
  | { accepted: false }
  | { notRecorded: TermsNotRecordedReason };

/** The page's answer for Auth0's /continue, signed with the shared secret, valid five minutes. */
export async function signTermsAnswer(back: TermsReturn, answer: TermsAnswer, secret: Uint8Array,
  now: Date): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const outcome = "notRecorded" in answer
    ? { not_recorded: answer.notRecorded }
    : answer.accepted && answer.noticeVersion !== undefined
      ? { accepted: true, notice_version: answer.noticeVersion }
      : { accepted: answer.accepted };
  const jwt = new SignJWT({ state: back.state, ...outcome })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(TERMS_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TERMS_ANSWER_SECONDS);
  if (back.subject !== undefined) jwt.setSubject(back.subject);
  return await jwt.sign(secret);
}
