/**
 * AskRigor's terms at the first sign-in (owner answer 419a, 26 November 2026): an Auth0 post-login Action. Not installed:
 * installing it, its secrets and attaching it to the Login flow each wait for the owner's yes
 * (terms-at-first-sign-in.md, next to this file, and docs/superpowers/plans/2026-11-25-terms-at-sign-up.md).
 *
 * onExecutePostLogin sends a person to AskRigor's terms page (/account/terms) with a token signed by Auth0
 * (api.redirect.encodeToken) under the secret the server shares (its ASKRIGOR_AUTH0_TERMS_SECRET), only on an
 * interactive sign-in: never on a refresh-token exchange or any other token grant, never with prompt=none (Auth0 answers
 * a redirect there with an error), at most once per transaction, and not when the user's app_metadata already records the
 * current notice version. The page shows the free-use notice, or goes straight back when the account's yes already
 * covers it, and posts its signed answer to Auth0's /continue. Should sending fail unexpectedly, the sign-in goes on as
 * before 419a: AskRigor's research tools still refuse an account until the notice is accepted.
 *
 * onContinuePostLogin checks that answer with api.redirect.validateToken (signature, expiry, the transaction's state).
 * Declined, it ends the sign-in with a plain reason (api.access.deny: without it the sign-in would go on). Accepted, it
 * records the version the answer names in app_metadata, so the page is not shown again until the version changes.
 *
 * The decisions are plain functions, exported beside the two handlers, so AskRigor's tests run them without Auth0
 * (tests/auth0-terms-action.test.ts).
 */
"use strict";

/** The audience of the token that brings a person to the page, and the issuer of the page's answer. */
const TERMS_AUDIENCE = "askrigor-terms";
/** The field that carries a token both ways (AskRigor's TERMS_TOKEN_FIELD). */
const TOKEN_FIELD = "session_token";
/** How long the token to the page is valid; AskRigor refuses one valid longer than ten minutes. */
const TOKEN_SECONDS = 600;
/** Where the notice version the person accepted is kept in their app_metadata. */
const METADATA_KEY = "askrigor_notice_version";
/**
 * The sign-ins Auth0 can send to a page: the OpenID Connect browser flows. A refresh-token exchange
 * (oauth2-refresh-token), the password and resource-owner grants, token exchange, device and back-channel flows are
 * never redirected (Auth0, "Redirect with Actions"); there the server's own notice check stays the backstop.
 */
const INTERACTIVE_PROTOCOLS = new Set(["oidc-basic-profile", "oidc-implicit-profile", "oidc-hybrid-profile"]);
/** Marks a transaction already sent to the page, for at most the transaction's life. */
const SENT_PREFIX = "askrigor-terms-sent:";
const SENT_TTL_MS = 15 * 60 * 1000;

const SECRET = /^[A-Za-z0-9_-]{43,512}$/;
const NOTICE_VERSION = /^free-contributor-v[1-9][0-9]*-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const DECLINED = "You declined AskRigor's free-use notice, so you weren't signed in. To use AskRigor, sign in " +
  "again and accept it.";
const UNCONFIRMED = "AskRigor couldn't confirm your answer to its free-use notice, so you weren't signed in. " +
  "Sign in again.";

/**
 * The Action's settings, from its secrets: TERMS_SECRET (shared with AskRigor's server), TERMS_PAGE_URL (the page,
 * https, no query), NOTICE_VERSION (the server's current free-use notice version) and APPLY_TO ("*" for every
 * application, or the client IDs it applies to, separated by commas). Undefined when any is missing or malformed: the
 * Action then sends no one to the page.
 */
function settingsOf(secrets) {
  const s = secrets || {};
  if (typeof s.TERMS_SECRET !== "string" || !SECRET.test(s.TERMS_SECRET)) return undefined;
  if (typeof s.NOTICE_VERSION !== "string" || !NOTICE_VERSION.test(s.NOTICE_VERSION)) return undefined;
  let pageUrl;
  try {
    pageUrl = new URL(String(s.TERMS_PAGE_URL));
  } catch (error) {
    return undefined;
  }
  if (pageUrl.protocol !== "https:" || pageUrl.username !== "" || pageUrl.password !== "" || pageUrl.search !== "" ||
    pageUrl.hash !== "") return undefined;
  const applyTo = typeof s.APPLY_TO === "string" ? s.APPLY_TO.split(",").map((id) => id.trim()).filter(Boolean) : [];
  if (applyTo.length === 0) return undefined;
  return {
    secret: s.TERMS_SECRET,
    pageUrl: pageUrl.href,
    noticeVersion: s.NOTICE_VERSION,
    applyTo: applyTo.includes("*") ? "*" : new Set(applyTo),
  };
}

/** Whether the authorization request asked for no interaction (prompt=none), wherever Auth0 reports it. */
function promptNone(event) {
  const transaction = (event && event.transaction) || {};
  const request = (event && event.request) || {};
  const words = [
    ...(Array.isArray(transaction.prompt) ? transaction.prompt : []),
    ...String((request.query && request.query.prompt) || "").split(" "),
    ...String((request.body && request.body.prompt) || "").split(" "),
  ];
  return words.includes("none");
}

/** The cache key that marks this transaction as sent to the page; undefined without a transaction ID. */
function sentKey(event) {
  const id = event && event.transaction && event.transaction.id;
  return typeof id === "string" && id.length > 0 ? SENT_PREFIX + id : undefined;
}

/**
 * Whether this sign-in goes to the page, and why: { redirect, reason }. alreadySent says this transaction was sent
 * already (the Action's cache), so a person is redirected at most once per transaction.
 */
function redirectDecision(event, settings, alreadySent) {
  if (settings === undefined) return { redirect: false, reason: "not_configured" };
  const clientId = event && event.client && event.client.client_id;
  if (settings.applyTo !== "*" && !settings.applyTo.has(clientId)) return { redirect: false, reason: "other_application" };
  const protocol = event && event.transaction && event.transaction.protocol;
  if (!INTERACTIVE_PROTOCOLS.has(protocol)) return { redirect: false, reason: "not_interactive" };
  if (promptNone(event)) return { redirect: false, reason: "prompt_none" };
  if (sentKey(event) === undefined) return { redirect: false, reason: "no_transaction" };
  if (alreadySent) return { redirect: false, reason: "already_sent" };
  const metadata = (event.user && event.user.app_metadata) || {};
  if (metadata[METADATA_KEY] === settings.noticeVersion) return { redirect: false, reason: "accepted" };
  return { redirect: true, reason: "ask" };
}

/**
 * What the page's answer, already checked by api.redirect.validateToken, means for this sign-in:
 * { deny: true, reason } or { deny: false, noticeVersion } (noticeVersion undefined when the answer names none, as for a
 * paid private account). Its issuer and subject, when the payload carries them, must be the page's and this user's.
 */
function continueDecision(payload, event) {
  if (payload === null || typeof payload !== "object") return { deny: true, reason: UNCONFIRMED };
  if (payload.iss !== undefined && payload.iss !== TERMS_AUDIENCE) return { deny: true, reason: UNCONFIRMED };
  const userId = event && event.user && event.user.user_id;
  if (payload.sub !== undefined && payload.sub !== userId) return { deny: true, reason: UNCONFIRMED };
  if (payload.accepted === false) return { deny: true, reason: DECLINED };
  if (payload.accepted !== true) return { deny: true, reason: UNCONFIRMED };
  const version = payload.notice_version;
  return { deny: false, noticeVersion: typeof version === "string" && NOTICE_VERSION.test(version) ? version : undefined };
}

exports.onExecutePostLogin = async (event, api) => {
  const settings = settingsOf(event.secrets);
  // Every other sign-in (a renewal, another application, a version already recorded) touches nothing at all.
  if (!redirectDecision(event, settings, false).redirect) return;
  try {
    const key = sentKey(event);
    if (!redirectDecision(event, settings, api.cache.get(key) !== undefined).redirect) return;
    api.cache.set(key, "1", { ttl: SENT_TTL_MS });
    const token = api.redirect.encodeToken({
      secret: settings.secret,
      expiresInSeconds: TOKEN_SECONDS,
      payload: { aud: TERMS_AUDIENCE },
    });
    api.redirect.sendUserTo(settings.pageUrl, { query: { [TOKEN_FIELD]: token } });
  } catch (error) {
    // The sign-in goes on as before 419a: AskRigor's research tools still refuse until the notice is accepted.
  }
};

exports.onContinuePostLogin = async (event, api) => {
  const settings = settingsOf(event.secrets);
  let payload;
  try {
    if (settings === undefined) throw new Error("not configured");
    payload = api.redirect.validateToken({ secret: settings.secret, tokenParameterName: TOKEN_FIELD });
  } catch (error) {
    api.access.deny(UNCONFIRMED);
    return;
  }
  const decision = continueDecision(payload, event);
  if (decision.deny) {
    api.access.deny(decision.reason);
    return;
  }
  if (decision.noticeVersion !== undefined) api.user.setAppMetadata(METADATA_KEY, decision.noticeVersion);
};

// For AskRigor's tests only; Auth0 calls the two handlers above.
exports.termsAction = Object.freeze({
  TERMS_AUDIENCE,
  TOKEN_FIELD,
  TOKEN_SECONDS,
  METADATA_KEY,
  DECLINED,
  UNCONFIRMED,
  settingsOf,
  redirectDecision,
  continueDecision,
});
