import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { RESEARCH_USE_NOTICE_VERSION, type TermsPageAnswerStore } from "@askrigor/evidence-repository";
import type { InteractionResults } from "oidc-provider";

import {
  decideNotice, keepFailedSearchesFromNoticeForm, recordedNoticeAnswer, type AccountTermsAccess,
} from "../account-terms/decision.js";
import { answeredPage } from "../account-terms/pages.js";
import type { TermsAnswer } from "../account-terms/tokens.js";
import { cookieHeader, readCookie, readForm, sameSitePost } from "../atlas/participation.js";
import type { TokenBucketLimiter } from "../rate-limit.js";
import { GEMINI_ISSUER_PATH, GEMINI_RESOURCE_PATH, GEMINI_SCOPE } from "./config.js";
import {
  authorizationRequestShape,
  geminiSignInNote,
  type GeminiSignInDetail,
  type GeminiSignInDiagnostic,
  type GeminiSignInStage,
} from "./diagnostics.js";
import {
  GEMINI_CALLBACK_PATH,
  GeminiLogin,
  GeminiLoginError,
  LOGIN_RESULT_COOKIE,
  LOGIN_STATE_COOKIE,
} from "./login.js";
import {
  RESUME_PATH,
  consentPage,
  errorPage,
  moveOnPage,
  noticeStepPage,
  type ConsentNoticeNote,
} from "./pages.js";
import { LOGIN_SECONDS, setPageHeaders, type GeminiAuthorizationServer } from "./provider.js";

/**
 * Which requests belong to Gemini's sign-in, and how each is handled (design sections 3 to 5, v2 F3 and S1).
 *
 * - The resource metadata of /mcp/gemini, naming AskRigor's own authorization server.
 * - The authorization server's metadata at the four discovery addresses clients use.
 * - AskRigor's own steps: /oauth/gemini/interaction/<uid> (sign in, then the free-use notice when the account needs it,
 *   then consent), /oauth/gemini/interaction/<uid>/notice (the notice's answer), /oauth/gemini/interaction/<uid>/login
 *   (the hand-off from Auth0's return) and /oauth/gemini/callback (Auth0's return).
 * - Every other path under /oauth/gemini/ goes to the library, with the prefix stripped and the original URL kept so the
 *   library computes its own addresses.
 *
 * Before the library sees any request, Host is pinned to the issuer's host, X-Forwarded-Host is removed and the forwarded
 * protocol is https: the library derives its endpoint URLs, and so the audiences it accepts, from them.
 */
export interface GeminiSignInRoutes {
  /** Handles the request when its path belongs to Gemini's sign-in, and says so; false leaves it to the server. */
  dispatch(request: IncomingMessage, response: ServerResponse, context: { pathname: string; clientIp: string }):
    Promise<boolean>;
  /** The resource metadata's address, for the challenges of /mcp/gemini. */
  readonly resourceMetadataUrl: URL;
}

/**
 * AskRigor's free-use notice in Gemini's sign-in (owner answer 419a; the owner, 27 Nov 2026: "gemini is still not
 * working"). Gemini can't show the notice in its chat, so an account used only through Gemini could never accept it, and
 * every research call there was refused. After the person signs in and before the consent step, an account whose yes
 * doesn't cover the current notice is shown it, with AskRigor's terms page's own page and recording
 * (account-terms/decision.ts and pages.ts):
 *
 * - Accept records the yes as /account/terms does (PERSON_SIGN_IN_PAGE), only for the version shown; then the consent
 *   step, as before.
 * - Decline records nothing; the consent step follows all the same, so paid private use or a later yes stay possible,
 *   and the research tools keep refusing until then.
 * - The step's form token, an HMAC of the interaction and its login session under a key of its own, is checked like the
 *   consent form's (same-site POST, the interaction's cookies) and answers once: its SHA-256 keeps the first answer in
 *   research_terms_page_answers until a minute past the interaction's end, so a double press gets the same answer and
 *   the other answer is refused (a Decline never becomes a yes).
 * - A store that doesn't answer never stops the connection: the consent step says nothing was recorded.
 * - An account whose yes covers the current notice, the owner's own free login and an active paid private account go
 *   straight to the consent step, unchanged.
 */
export interface GeminiNoticeStep {
  /** The connector's research accounts: whether a yes covers the current notice, and recording one. */
  readonly access: AccountTermsAccess;
  /** Each step's one answer, kept by its token's SHA-256 (migration 0044), as /account/terms keeps its own. */
  readonly answers: TermsPageAnswerStore;
  readonly now?: () => Date;
}

const DISCOVERY_ALIASES = new Set([
  `/.well-known/oauth-authorization-server${GEMINI_ISSUER_PATH}`,
  `/.well-known/openid-configuration${GEMINI_ISSUER_PATH}`,
  `${GEMINI_ISSUER_PATH}/.well-known/openid-configuration`,
  `${GEMINI_ISSUER_PATH}/.well-known/oauth-authorization-server`,
]);
export const GEMINI_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${GEMINI_RESOURCE_PATH}`;
const INTERACTION = new RegExp(`^${GEMINI_ISSUER_PATH}/interaction/([A-Za-z0-9_-]{1,64})(/login|/notice)?$`, "u");
const LIBRARY_COOKIES = /^_(session|interaction|interaction_resume|state)(\.legacy)?(\.sig)?$/u;

export function createGeminiSignInRoutes(
  server: GeminiAuthorizationServer,
  login: GeminiLogin,
  options: {
    rateLimiter: TokenBucketLimiter;
    diagnostic?: (record: GeminiSignInDiagnostic) => void;
    /** The free-use notice before the consent step; without it the steps are as before (no notice, no notice path). */
    notice?: GeminiNoticeStep;
  },
): GeminiSignInRoutes {
  const issuer = server.settings.issuer;
  const origin = issuer.origin;
  const resourceMetadataUrl = new URL(GEMINI_RESOURCE_METADATA_PATH, origin);
  const resourceMetadata = JSON.stringify({
    resource: server.settings.resource.href,
    authorization_servers: [issuer.href.replace(/\/$/u, "")],
    scopes_supported: [GEMINI_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "AskRigor for Google Gemini",
  });
  const writeNote = geminiSignInNote(options.diagnostic);
  const note = (stage: GeminiSignInStage, outcome: string, detail?: GeminiSignInDetail) =>
    writeNote?.(stage, outcome, detail);

  const pinHeaders = (request: IncomingMessage) => {
    request.headers.host = issuer.host;
    delete request.headers["x-forwarded-host"];
    request.headers["x-forwarded-proto"] = "https";
  };

  const toLibrary = async (request: IncomingMessage, response: ServerResponse, path: string, query: string) => {
    pinHeaders(request);
    (request as IncomingMessage & { originalUrl?: string }).originalUrl = `${GEMINI_ISSUER_PATH}${path}${query}`;
    request.url = `${path}${query}`;
    await server.handle(request, response);
  };

  const fail = (response: ServerResponse, status: number, code: string) => {
    if (response.headersSent) return;
    setPageHeaders((field, value) => response.setHeader(field, value));
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    response.end(errorPage(code));
  };

  const formToken = (uid: string, sessionUid: string) => createHmac("sha256", server.settings.keys.consentForm)
    .update(`askrigor-gemini-consent-v1\u0000${uid}\u0000${sessionUid}`, "utf8")
    .digest("base64url");

  const noticeToken = (uid: string, sessionUid: string) => createHmac("sha256", server.settings.keys.noticeForm)
    .update(`askrigor-gemini-notice-v1\u0000${uid}\u0000${sessionUid}`, "utf8")
    .digest("base64url");

  const show = (response: ServerResponse, status: number, html: string) => {
    setPageHeaders((field, value) => response.setHeader(field, value));
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  };

  /** The consent step, with what the notice step before it recorded when it came first. */
  const showConsent = (response: ServerResponse, uid: string, sessionUid: string, notice?: ConsentNoticeNote) => {
    show(response, 200, consentPage({ uid, formToken: formToken(uid, sessionUid), ...(notice === undefined ? {} : { notice }) }));
    note("consent", "shown");
  };

  const interactionStep = async (request: IncomingMessage, response: ServerResponse, uid: string) => {
    pinHeaders(request);
    const details = await server.provider.interactionDetails(request, response);
    if (details.uid !== uid) return fail(response, 400, "session_expired");
    if (details.prompt.name === "login") {
      const { location, stateCookie } = await login.start(uid);
      response.writeHead(303, {
        location,
        "set-cookie": cookieHeader(LOGIN_STATE_COOKIE, stateCookie, LOGIN_SECONDS),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      });
      response.end();
      note("login", "sent_to_auth0");
      return;
    }
    if (details.prompt.name === "consent" && details.session !== undefined) {
      const { session } = details;
      if (options.notice === undefined) return showConsent(response, uid, session.uid);
      // Only reads. A store that doesn't answer leads on to the consent step, saying nothing was recorded.
      const recorded = await recordedNoticeAnswer(options.notice.access, session.accountId);
      if (recorded === "ask") {
        show(response, 200, noticeStepPage({ uid, formToken: noticeToken(uid, session.uid),
          noticeVersion: RESEARCH_USE_NOTICE_VERSION }));
        note("notice", "shown");
        return;
      }
      if ("notRecorded" in recorded) {
        note("notice", "not_recorded", { reason: recorded.notRecorded });
        return showConsent(response, uid, session.uid, "unchecked");
      }
      note("notice", "not_needed");
      return showConsent(response, uid, session.uid);
    }
    fail(response, 400, "server_error");
  };

  /**
   * Accept or Decline on the notice (GeminiNoticeStep): checked as the consent form is, then decided as /account/terms
   * decides (decideNotice), and answered with the consent step, or with the notice again when it changed meanwhile.
   */
  const noticeDecision = async (request: IncomingMessage, response: ServerResponse, uid: string, step: GeminiNoticeStep) => {
    if (!consentPostFromThisSite(request, origin)) return fail(response, 403, "invalid_request");
    let form: URLSearchParams;
    try {
      form = await readForm(request);
    } catch {
      return fail(response, 400, "invalid_request");
    }
    pinHeaders(request);
    const details = await server.provider.interactionDetails(request, response);
    if (details.uid !== uid || details.prompt.name !== "consent" || details.session === undefined) {
      return fail(response, 400, "session_expired");
    }
    const { session } = details;
    const token = noticeToken(uid, session.uid);
    if (!sameToken(token, single(form, "form_token"))) return fail(response, 403, "invalid_request");
    const decision = single(form, "decision");
    if (decision !== "accept" && decision !== "decline") return fail(response, 400, "invalid_request");
    const result = await decideNotice({
      subject: session.accountId,
      decision,
      noticeVersionShown: single(form, "notice_version"),
      keepFailedSearches: keepFailedSearchesFromNoticeForm(form),
      // An HMAC under a server key, of this interaction and its login session: its SHA-256 keys the step's one answer.
      tokenSha256: createHash("sha256").update(token, "utf8").digest("hex"),
      // A minute past the interaction's end, after which no request reaches this step with it.
      usableUntil: new Date((details.exp + 60) * 1_000),
      access: step.access,
      answers: step.answers,
      now: step.now?.() ?? new Date(),
    });
    if (result.kind === "show_again") {
      show(response, 200, noticeStepPage({ uid, formToken: token, noticeVersion: RESEARCH_USE_NOTICE_VERSION,
        changed: true }));
      note("notice", "shown_again");
      return;
    }
    if (result.kind === "answered_otherwise") {
      show(response, 409, answeredPage());
      note("notice", "answered_otherwise");
      return;
    }
    const answered = noticeAnswered(result.answer);
    note("notice", answered.outcome, "notRecorded" in result.answer ? { reason: result.answer.notRecorded } : undefined);
    showConsent(response, uid, session.uid, answered.note);
  };

  /**
   * Allow and Cancel answer the form with a page of this server that goes on by itself, never with a redirect. Chromium
   * checks every hop of a form submission's redirect chain against the form page's form-action, and Google's relay
   * (oauth-redirect.googleusercontent.com) answers with another redirect, to an address the policy didn't name: the
   * browser cancelled the chain and stayed on the Allow page, Google never got the code, and a second press of Allow was
   * answered "session expired" (the owner's tries of 22, 23 and 24 Nov 2026; the same failure, and this fix, on Google's
   * developer forum, 15 Oct 2026). Reproduced in Chromium with three local addresses, not with Google's relay; Firefox and
   * Safari were not tried. A page's own navigation is no form submission.
   */
  const moveOn = async (request: IncomingMessage, response: ServerResponse, path: string, result: InteractionResults,
    options: { mergeWithLastSubmission: boolean }) => {
    await server.provider.interactionResult(request, response, result, options);
    setPageHeaders((field, value) => response.setHeader(field, value));
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(moveOnPage(path));
  };

  /** The library's own next step, as a path on this server; undefined for anything else. */
  const resumePath = (returnTo: string): string | undefined => {
    const next = new URL(returnTo, origin);
    return next.origin === origin && next.search === "" && next.hash === "" && RESUME_PATH.test(next.pathname)
      ? next.pathname : undefined;
  };

  const consentDecision = async (request: IncomingMessage, response: ServerResponse, uid: string) => {
    if (!consentPostFromThisSite(request, origin)) return fail(response, 403, "invalid_request");
    let form: URLSearchParams;
    try {
      form = await readForm(request);
    } catch {
      return fail(response, 400, "invalid_request");
    }
    pinHeaders(request);
    const details = await server.provider.interactionDetails(request, response);
    if (details.uid !== uid || details.prompt.name !== "consent" || details.session === undefined) {
      return fail(response, 400, "session_expired");
    }
    if (!sameToken(formToken(uid, details.session.uid), form.get("form_token"))) {
      return fail(response, 403, "invalid_request");
    }
    // Checked before anything is kept, so an address the library might one day give in another form ends here.
    const next = resumePath(details.returnTo);
    if (next === undefined) return fail(response, 500, "server_error");
    const decision = form.get("decision");
    if (decision === "allow") {
      const clientId = details.params.client_id;
      if (typeof clientId !== "string") return fail(response, 400, "invalid_request");
      const grant = new server.provider.Grant({ accountId: details.session.accountId, clientId });
      // Only research:use on the one resource is ever granted. Every other requested scope is recorded as refused, so
      // the library does not ask again and issues nothing for it (no ID token, no owner review scope).
      const requested = typeof details.params.scope === "string" ? details.params.scope.split(" ").filter(Boolean) : [];
      const refused = requested.filter((scope) => scope !== GEMINI_SCOPE);
      if (refused.length > 0) grant.rejectOIDCScope(refused.join(" "));
      if (requested.includes(GEMINI_SCOPE)) grant.rejectOIDCScope(GEMINI_SCOPE);
      grant.addResourceScope(server.settings.resource.href, GEMINI_SCOPE);
      const grantId = await grant.save();
      await moveOn(request, response, next, { consent: { grantId } }, { mergeWithLastSubmission: true });
      note("consent", "allowed");
      return;
    }
    if (decision === "cancel") {
      await moveOn(request, response, next, {
        error: "access_denied",
        error_description: "The person cancelled the connection.",
      }, { mergeWithLastSubmission: false });
      note("consent", "cancelled");
      return;
    }
    fail(response, 400, "invalid_request");
  };

  const loginHandOff = async (request: IncomingMessage, response: ServerResponse, uid: string) => {
    const outcome = login.readResult(readCookie(request, LOGIN_RESULT_COOKIE), uid);
    pinHeaders(request);
    const details = await server.provider.interactionDetails(request, response);
    if (outcome === undefined || details.uid !== uid || details.prompt.name !== "login") {
      return fail(response, 400, "session_expired");
    }
    // Any earlier login session in this browser (an abandoned link) is dropped here, so the link continues with a fresh
    // one for the person who just signed in; the library's account-switch path never arises.
    dropLibraryCookies(request, /^_session/u);
    response.setHeader("set-cookie", [
      cookieHeader(LOGIN_RESULT_COOKIE, "", 0),
      "_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      "_session.sig=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    ]);
    if ("denied" in outcome) {
      await server.provider.interactionFinished(request, response, {
        error: "access_denied",
        error_description: "The person cancelled the sign-in.",
      }, { mergeWithLastSubmission: false });
      note("login", "cancelled");
      return;
    }
    await server.provider.interactionFinished(request, response, {
      login: { accountId: outcome.subject, remember: false },
    }, { mergeWithLastSubmission: false });
    note("login", "signed_in");
  };

  const callback = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", origin);
    try {
      const { uid, resultCookie } = await login.finish(url, readCookie(request, LOGIN_STATE_COOKIE));
      response.writeHead(303, {
        location: `${GEMINI_ISSUER_PATH}/interaction/${uid}/login`,
        "set-cookie": [cookieHeader(LOGIN_STATE_COOKIE, "", 0), cookieHeader(LOGIN_RESULT_COOKIE, resultCookie, 120)],
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      });
      response.end();
    } catch (error) {
      const code = error instanceof GeminiLoginError && error.code === "session_expired" ? "session_expired" : "login_required";
      note("callback", code);
      fail(response, 400, code);
    }
  };

  return {
    resourceMetadataUrl,
    async dispatch(request, response, { pathname, clientIp }) {
      const inScope = pathname === GEMINI_RESOURCE_METADATA_PATH || DISCOVERY_ALIASES.has(pathname) ||
        pathname === GEMINI_ISSUER_PATH || pathname.startsWith(`${GEMINI_ISSUER_PATH}/`);
      if (!inScope) return false;
      if (!options.rateLimiter.consume(clientIp)) {
        // Logged, so a refused call is never mistaken for one that didn't come (Codex's review, 23 Nov 2026).
        note("library", "rate_limited", { path: pathKind(pathname) });
        response.writeHead(429, { "content-type": "application/json", "retry-after": "60", "cache-control": "no-store" });
        response.end(JSON.stringify({ error: "rate_limit_exceeded" }));
        return true;
      }
      const method = request.method ?? "GET";
      const query = queryOf(request.url);
      try {
        if (pathname === GEMINI_RESOURCE_METADATA_PATH) {
          if (method !== "GET" && method !== "HEAD") return methodNotAllowed(response);
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
          });
          response.end(method === "HEAD" ? undefined : resourceMetadata);
          return true;
        }
        if (DISCOVERY_ALIASES.has(pathname)) {
          if (method !== "GET" && method !== "HEAD") return methodNotAllowed(response);
          await toLibrary(request, response, "/.well-known/openid-configuration", "");
          return true;
        }
        if (pathname === GEMINI_CALLBACK_PATH) {
          if (method !== "GET") return methodNotAllowed(response);
          await callback(request, response);
          return true;
        }
        const interaction = INTERACTION.exec(pathname);
        if (interaction !== null) {
          const uid = interaction[1]!;
          if (interaction[2] === "/login") {
            if (method !== "GET") return methodNotAllowed(response);
            await loginHandOff(request, response, uid);
          } else if (interaction[2] === "/notice") {
            // Without the notice step, its address doesn't exist.
            if (options.notice === undefined) return notFound(response);
            if (method !== "POST") return methodNotAllowed(response, POST_ONLY);
            await noticeDecision(request, response, uid, options.notice);
          } else if (method === "GET") {
            await interactionStep(request, response, uid);
          } else if (method === "POST") {
            await consentDecision(request, response, uid);
          } else {
            return methodNotAllowed(response);
          }
          return true;
        }
        const path = pathname.slice(GEMINI_ISSUER_PATH.length) || "/";
        // Only the library's exact addresses and methods reach it. Its router is more lenient (letter case, one trailing
        // slash, HEAD beside GET), and three review rounds found variants that skipped this dispatcher's own checks for
        // a new link and the step log (Codex, 23 Nov 2026); refusing every variant here keeps one definition of each.
        const served = libraryMethods(path);
        if (served === undefined) return notFound(response);
        if (!served.has(method)) return methodNotAllowed(response, served);
        // Google's calls are logged on arrival too, so one that stalls or never finishes still leaves a line.
        if (path === "/token" || path === "/token/revocation") {
          note(path === "/token" ? "token" : "revocation", "received");
        }
        if (path === "/auth") {
          // What Gemini asked for, by shape only (the step log, when on): which parameters came, never their values.
          if (writeNote !== undefined) {
            note("authorization", "requested", method === "GET"
              ? authorizationRequestShape(query, server.settings.resource.href)
              : { method: "post" });
          }
          // Finding 3 of Fable's recheck: a link must say which resource it is for. Gemini sends it (its requests to Auth0
          // on 20 Nov 2026 carried resource=), so a request without it is refused before any login, and no token is ever
          // issued for /mcp/gemini to a connector that belongs to some other MCP server.
          if (!hasExactlyOneResource(query, server.settings.resource.href)) {
            note("library", "resource_missing");
            fail(response, 400, "invalid_target");
            return true;
          }
          // A new authorization never reuses an earlier login session: every link asks the person to sign in, and the
          // library's account-switch path (a logout confirmation, which is off) can never arise. The session an earlier
          // link left in this browser (a consent page left unanswered) is deleted, not only hidden from this request,
          // so no later step of this link can pick it up (Fable's recheck, finding 2).
          for (const id of cookieValues(request, "_session")) {
            const earlier = await server.provider.Session.find(id);
            await earlier?.destroy();
          }
          dropLibraryCookies(request, /^_session/u);
        }
        await toLibrary(request, response, path, query);
        return true;
      } catch (error) {
        const code = isSessionNotFound(error) ? "session_expired" : "server_error";
        note("library", code);
        fail(response, code === "session_expired" ? 400 : 500, code);
        return true;
      }
    },
  };
}

/**
 * Whether the consent form's POST came from this server's own page. The shared same-site check needs the page's origin
 * in Origin (or Referer); production's proxy sends `Referrer-Policy: no-referrer` on every mcp.askrigor.com response,
 * whatever the page set, and under that policy a browser sends `Origin: null` and no Referer with a form's POST (Fetch
 * standard). That refused the owner's Allow on 21 and 22 Nov 2026, and #511's same-origin header never reached him
 * (release E, rolled back 22 Nov 14:29 UTC). So `Origin: null` also passes when the browser itself says the request is
 * same-origin: Sec-Fetch-Site is set by the browser and no page can forge it. A cross-site page's POST still fails (its
 * Sec-Fetch-Site is cross-site, and it carries none of the SameSite=Lax cookies the interaction needs), and so does a
 * browser that sends neither header. The form token and the interaction's cookies remain the main defence.
 */
export function consentPostFromThisSite(request: IncomingMessage, origin: string): boolean {
  if (sameSitePost(request, origin)) return true;
  return request.headers.origin === "null" && request.headers["sec-fetch-site"] === "same-origin";
}

export type { GeminiSignInDiagnostic } from "./diagnostics.js";

/** Which kind of sign-in address a path is, by name only. */
function pathKind(pathname: string): string {
  if (pathname === GEMINI_RESOURCE_METADATA_PATH || DISCOVERY_ALIASES.has(pathname)) return "metadata";
  if (pathname === GEMINI_CALLBACK_PATH) return "callback";
  if (INTERACTION.test(pathname)) return "interaction";
  const path = pathname.slice(GEMINI_ISSUER_PATH.length);
  if (path === "/token") return "token";
  if (path === "/token/revocation") return "revocation";
  if (path === "/auth" || path.startsWith("/auth/")) return "authorization";
  return "other";
}

/**
 * The methods each address of the library may be called with, exactly as it is spelled: the authorization endpoint,
 * its resume address after a step, the token and revocation endpoints and the key set. Undefined for anything else.
 */
function libraryMethods(path: string): ReadonlySet<string> | undefined {
  if (path === "/auth" || /^\/auth\/[A-Za-z0-9_-]{1,64}$/u.test(path)) return AUTH_METHODS;
  if (path === "/token" || path === "/token/revocation") return POST_ONLY;
  if (path === "/jwks") return READ_METHODS;
  return undefined;
}
const AUTH_METHODS: ReadonlySet<string> = new Set(["GET", "POST"]);
const POST_ONLY: ReadonlySet<string> = new Set(["POST"]);
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

function methodNotAllowed(response: ServerResponse, allowed: ReadonlySet<string> = AUTH_METHODS): true {
  response.writeHead(405, { "content-type": "application/json", allow: [...allowed].join(", "), "cache-control": "no-store" });
  response.end(JSON.stringify({ error: "method_not_allowed" }));
  return true;
}

function notFound(response: ServerResponse): true {
  response.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ error: "not_found" }));
  return true;
}

/** What the notice step's answer was, for the step log, and what the consent step then says of it. */
function noticeAnswered(answer: TermsAnswer): { outcome: string; note?: ConsentNoticeNote } {
  if ("notRecorded" in answer) return { outcome: "not_recorded", note: "not_recorded" };
  if (!answer.accepted) return { outcome: "declined", note: "declined" };
  // An active paid private account (it became one while the notice was open): nothing to say; the notice doesn't govern it.
  if (answer.noticeVersion === undefined) return { outcome: "not_needed" };
  return { outcome: "accepted", note: "accepted" };
}

/** A form field's one value; undefined when it is missing or given more than once. */
function single(form: URLSearchParams, name: string): string | undefined {
  const values = form.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

function queryOf(target: string | undefined): string {
  if (target === undefined) return "";
  const at = target.indexOf("?");
  return at < 0 ? "" : target.slice(at);
}

/** Every value of one cookie name in the request (a planted duplicate included). */
function cookieValues(request: IncomingMessage, name: string): string[] {
  const header = request.headers.cookie;
  if (typeof header !== "string" || header.length > 8_192) return [];
  return header.split(";").flatMap((part) => {
    const at = part.indexOf("=");
    const value = at > 0 && part.slice(0, at).trim() === name ? part.slice(at + 1).trim() : "";
    return /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? [value] : [];
  });
}

/** Exactly one resource parameter, equal to this server's one resource. */
function hasExactlyOneResource(query: string, resource: string): boolean {
  const values = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query).getAll("resource");
  return values.length === 1 && values[0] === resource;
}

function dropLibraryCookies(request: IncomingMessage, names: RegExp): void {
  const header = request.headers.cookie;
  if (typeof header !== "string") return;
  const kept = header.split(";").map((part) => part.trim()).filter((part) => {
    const name = part.slice(0, Math.max(0, part.indexOf("="))).trim();
    return !(LIBRARY_COOKIES.test(name) && names.test(name));
  });
  if (kept.length === 0) delete request.headers.cookie;
  else request.headers.cookie = kept.join("; ");
}

function sameToken(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function isSessionNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "SessionNotFound";
}
