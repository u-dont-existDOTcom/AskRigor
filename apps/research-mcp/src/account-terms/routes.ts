import type { IncomingMessage, ServerResponse } from "node:http";

import { RESEARCH_USE_NOTICE_VERSION, type TermsPageAnswerStore } from "@askrigor/evidence-repository";

import { readForm } from "../atlas/participation.js";
import type { TokenBucketLimiter } from "../rate-limit.js";
import { decideNotice, keepFailedSearchesFromNoticeForm, recordedNoticeAnswer, type AccountTermsAccess } from "./decision.js";
import {
  ANSWER_POLICY,
  PAGE_POLICY,
  answerPage,
  answeredPage,
  expiredPage,
  noticePage,
  tooManyRequestsPage,
  unavailablePage,
} from "./pages.js";
import {
  ACCOUNT_TERMS_PATH,
  TERMS_STATE,
  TERMS_TOKEN_FIELD,
  checkTermsVisit,
  signTermsAnswer,
  type AccountTermsSettings,
  type TermsAnswer,
  type TermsReturn,
} from "./tokens.js";

/**
 * GET and POST /account/terms (owner answer 419a): the free-use notice right after a person's first sign-in, between
 * Auth0's post-login Action and Auth0's /continue (tokens.ts).
 *
 * - GET only reads. With a valid token: an account whose yes covers the current notice (or the owner's own free login,
 *   under the owner's standing instruction), or an active paid private account, goes straight back as accepted; any
 *   other is shown the notice, with "Accept and continue" and "Decline", which post the token back with the notice
 *   version shown.
 * - POST uses the token once (the security review of 26 Nov 2026): the first answer claims it, by its SHA-256, until it
 *   can no longer be used; a later POST records nothing, gets the same answer again for the same decision (a double
 *   press) and is refused for the other, so a Decline never becomes a yes. Accept records the yes as
 *   accept_free_contributor does, noted PERSON_SIGN_IN_PAGE, and only for the current notice: a page showing an earlier
 *   one is shown again with the current one. Decline records nothing, and the Action ends the sign-in.
 * - A failure never strands the sign-in, and never records a yes: a token that does not check out (a secret or issuer
 *   that differs from the Action's, an expired or altered token) or an account store that does not answer sends the
 *   person back with a signed "not recorded" answer, which the Action lets through; AskRigor's research tools still
 *   refuse until the notice is accepted. A Decline is honoured whenever the token's signature is the Action's.
 * - A request with no single token or state: a page saying the link expired, and nothing is read or recorded.
 *
 * What is read and recorded is decided in decision.ts, which Gemini's sign-in shares (gemini-sign-in/routes.ts).
 */
export interface AccountTermsRoutes {
  /** Handles the request when its path is the terms page's, and says so; false leaves it to the server. */
  dispatch(request: IncomingMessage, response: ServerResponse, context: { pathname: string; clientIp: string }):
    Promise<boolean>;
}

/** What the page needs of the connector's research accounts. */
export type { AccountTermsAccess } from "./decision.js";

export interface AccountTermsOptions {
  /** accountTermsSettingsFromEnv(); without it, or without its secret, the page answers 503. */
  settings: AccountTermsSettings | undefined;
  /** The connector's research accounts; undefined without them, and the page answers 503. */
  access: AccountTermsAccess | undefined;
  /** The answers the page has taken (migration 0044); undefined without the research-access database: 503. */
  answers: TermsPageAnswerStore | undefined;
  rateLimiter: TokenBucketLimiter;
  now?: () => Date;
}

/** A field's one value; undefined when it is missing or given more than once. */
function single(fields: URLSearchParams, name: string): string | undefined {
  const values = fields.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

export function createAccountTermsRoutes(options: AccountTermsOptions): AccountTermsRoutes {
  const now = options.now ?? (() => new Date());

  const write = (response: ServerResponse, status: number, body: string, policy = PAGE_POLICY,
    extra: Record<string, string> = {}) => {
    response.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // The page's address holds the Action's token: no other site ever learns it from a Referer.
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "content-security-policy": policy,
      ...extra,
    });
    response.end(body);
  };

  const goBack = async (response: ServerResponse, back: TermsReturn, answer: TermsAnswer, secret: Uint8Array) => {
    const token = await signTermsAnswer(back, answer, secret, now());
    const kind = "notRecorded" in answer ? "not_recorded" : answer.accepted ? "accepted" : "declined";
    write(response, 200, answerPage({ continueUrl: back.continueUrl, token, state: back.state, kind }), ANSWER_POLICY);
  };

  const show = async (query: URLSearchParams, response: ServerResponse, settings: AccountTermsSettings,
    secret: Uint8Array, access: AccountTermsAccess) => {
    const token = single(query, TERMS_TOKEN_FIELD);
    const check = await checkTermsVisit(token, single(query, "state"), { ...settings, secret }, now());
    if (check.kind === "malformed") return write(response, 400, expiredPage());
    if (check.kind === "unverified") return await goBack(response, check.back, { notRecorded: "link_not_verified" }, secret);
    const answer = await recordedNoticeAnswer(access, check.visit.subject);
    if (answer !== "ask") return await goBack(response, check.visit, answer, secret);
    write(response, 200, noticePage({ token: token!, state: check.visit.state, noticeVersion: RESEARCH_USE_NOTICE_VERSION }));
  };

  const decide = async (form: URLSearchParams, response: ServerResponse, settings: AccountTermsSettings,
    secret: Uint8Array, access: AccountTermsAccess, answers: TermsPageAnswerStore) => {
    const token = single(form, TERMS_TOKEN_FIELD);
    const decision = single(form, "decision");
    if (decision !== "accept" && decision !== "decline") return write(response, 400, expiredPage());
    const check = await checkTermsVisit(token, single(form, "state"), { ...settings, secret }, now());
    if (check.kind === "malformed") return write(response, 400, expiredPage());
    if (check.kind === "unverified") {
      // A Decline goes back as one whenever the signature is the Action's; with a token not even signed by it, the
      // sign-in simply doesn't go on from here.
      if (decision === "decline") {
        return check.signed ? await goBack(response, check.back, { accepted: false }, secret) : write(response, 400, expiredPage());
      }
      return await goBack(response, check.back, { notRecorded: "link_not_verified" }, secret);
    }
    const visit = check.visit;
    const result = await decideNotice({
      subject: visit.subject,
      decision,
      noticeVersionShown: single(form, "notice_version"),
      keepFailedSearches: keepFailedSearchesFromNoticeForm(form),
      tokenSha256: visit.tokenSha256,
      usableUntil: visit.usableUntil,
      access,
      answers,
      now: now(),
    });
    // Accept for an earlier notice: shown again with the current one, the token still unused.
    if (result.kind === "show_again") {
      return write(response, 200, noticePage({ token: token!, state: visit.state, noticeVersion: RESEARCH_USE_NOTICE_VERSION,
        changed: true }));
    }
    if (result.kind === "answered_otherwise") return write(response, 409, answeredPage());
    await goBack(response, visit, result.answer, secret);
  };

  return {
    async dispatch(request, response, { pathname, clientIp }) {
      if (pathname !== ACCOUNT_TERMS_PATH) return false;
      if (!options.rateLimiter.consume(clientIp)) {
        write(response, 429, tooManyRequestsPage(), PAGE_POLICY, { "retry-after": "60" });
        return true;
      }
      if (request.method !== "GET" && request.method !== "POST") {
        response.writeHead(405, {
          allow: "GET, POST",
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end("Method not allowed");
        return true;
      }
      const { settings, access, answers } = options;
      let fields: URLSearchParams;
      if (request.method === "GET") {
        fields = new URLSearchParams(queryOf(request.url));
      } else {
        try {
          fields = await readForm(request);
        } catch {
          write(response, 400, expiredPage());
          return true;
        }
      }
      if (settings?.secret === undefined || access === undefined || answers === undefined) {
        // Not set up: with the tenant known and a well-formed state, a plain way on that records nothing; never after a
        // Decline, which must not become a sign-in.
        const state = single(fields, "state");
        const wayOn = settings !== undefined && state !== undefined && TERMS_STATE.test(state) &&
          single(fields, "decision") !== "decline"
          ? { continueUrl: settings.continueUrl, state }
          : undefined;
        write(response, 503, unavailablePage(wayOn));
        return true;
      }
      try {
        if (request.method === "GET") await show(fields, response, settings, settings.secret, access);
        else await decide(fields, response, settings, settings.secret, access, answers);
      } catch {
        // Not a failure the steps above expect: no answer goes back, and the person signs in again.
        if (!response.headersSent) write(response, 503, unavailablePage());
        else response.end();
      }
      return true;
    },
  };
}

function queryOf(target: string | undefined): string {
  if (target === undefined) return "";
  const at = target.indexOf("?");
  return at < 0 ? "" : target.slice(at + 1);
}
