import type { IncomingMessage, ServerResponse } from "node:http";

import {
  RESEARCH_USE_NOTICE_VERSION,
  type FreeContributorAgreement,
  type ResearchContributorAccessService,
  type SignInNoticeStatus,
} from "@askrigor/evidence-repository";

import { readForm } from "../atlas/participation.js";
import type { TokenBucketLimiter } from "../rate-limit.js";
import {
  ANSWER_POLICY,
  PAGE_POLICY,
  answerPage,
  expiredPage,
  noticePage,
  tooManyRequestsPage,
  unavailablePage,
} from "./pages.js";
import {
  ACCOUNT_TERMS_PATH,
  TERMS_TOKEN_FIELD,
  signTermsAnswer,
  verifyTermsVisit,
  type AccountTermsSettings,
  type TermsAnswer,
  type TermsVisit,
} from "./tokens.js";

/**
 * GET and POST /account/terms (owner answer 419a): the free-use notice right after a person's first sign-in, between
 * Auth0's post-login Action and Auth0's /continue (tokens.ts). A GET only reads; the token the Action signed is the
 * guard of every request, and a POST carries it back from the notice's own form.
 *
 * - GET with a valid token: an account whose yes covers the current notice (or the owner's own free login, under the
 *   owner's standing instruction), or an active paid private account, goes straight back as accepted; any other is
 *   shown the notice, with "Accept and continue" and "Decline".
 * - POST accept: the yes is recorded as accept_free_contributor records it (the same agreement, the current version),
 *   noted as given on this page (PERSON_SIGN_IN_PAGE), unless the account needs no question; then back as accepted.
 * - POST decline: nothing is recorded; back as declined, and the Action ends the sign-in.
 * - Without a valid token: a page saying the link expired, and nothing is read or recorded.
 */
export interface AccountTermsRoutes {
  /** Handles the request when its path is the terms page's, and says so; false leaves it to the server. */
  dispatch(request: IncomingMessage, response: ServerResponse, context: { pathname: string; clientIp: string }):
    Promise<boolean>;
}

/** What the page needs of the connector's research accounts. */
export type AccountTermsAccess = Pick<ResearchContributorAccessService, "signInNoticeStatus" | "acceptFreeContributor">;

export interface AccountTermsOptions {
  /** accountTermsSettingsFromEnv(); undefined while ASKRIGOR_AUTH0_TERMS_SECRET is unset, and the page answers 503. */
  settings: AccountTermsSettings | undefined;
  /** The connector's research accounts; undefined without them, and the page answers 503. */
  access: AccountTermsAccess | undefined;
  rateLimiter: TokenBucketLimiter;
  now?: () => Date;
}

/** The yes the page records: the notice it showed, with each part accept_free_contributor's agreement names. */
const AGREEMENT: FreeContributorAgreement = Object.freeze({
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
});

/** The answer for an account the page asks nothing of; undefined for one it asks. */
function answerWithoutAsking(status: SignInNoticeStatus): TermsAnswer | undefined {
  if (status === "covered") return { accepted: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION };
  // Paid private: the free-use notice does not govern it, so the sign-in goes on with no notice recorded anywhere.
  if (status === "paid_private") return { accepted: true };
  return undefined;
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

  const goBack = async (response: ServerResponse, visit: TermsVisit, answer: TermsAnswer,
    settings: AccountTermsSettings) => {
    const token = await signTermsAnswer(visit, answer, settings, now());
    write(response, 200, answerPage({ continueUrl: settings.continueUrl, token, state: visit.state }), ANSWER_POLICY);
  };

  /** The one token and the one state a request carries, checked; undefined for any other request. */
  const visitOf = async (fields: URLSearchParams, settings: AccountTermsSettings) => {
    const tokens = fields.getAll(TERMS_TOKEN_FIELD);
    const states = fields.getAll("state");
    if (tokens.length !== 1 || states.length !== 1) return undefined;
    const visit = await verifyTermsVisit(tokens[0], states[0], settings, now());
    return visit === undefined ? undefined : { visit, token: tokens[0]! };
  };

  const show = async (request: IncomingMessage, response: ServerResponse, settings: AccountTermsSettings,
    access: AccountTermsAccess) => {
    const checked = await visitOf(new URLSearchParams(queryOf(request.url)), settings);
    if (checked === undefined) return write(response, 400, expiredPage());
    const answer = answerWithoutAsking(await access.signInNoticeStatus(checked.visit.subject));
    if (answer !== undefined) return await goBack(response, checked.visit, answer, settings);
    write(response, 200, noticePage({ token: checked.token, state: checked.visit.state }));
  };

  const decide = async (request: IncomingMessage, response: ServerResponse, settings: AccountTermsSettings,
    access: AccountTermsAccess) => {
    let form: URLSearchParams;
    try {
      form = await readForm(request);
    } catch {
      return write(response, 400, expiredPage());
    }
    const checked = await visitOf(form, settings);
    const decisions = form.getAll("decision");
    if (checked === undefined || decisions.length !== 1 || !["accept", "decline"].includes(decisions[0]!)) {
      return write(response, 400, expiredPage());
    }
    if (decisions[0] === "decline") return await goBack(response, checked.visit, { accepted: false }, settings);
    // Read again: an account the GET would not have asked (a second press, or a yes given meanwhile in an app) is not
    // written over, and a paid private account is never switched to free use from here.
    const answer = answerWithoutAsking(await access.signInNoticeStatus(checked.visit.subject));
    if (answer === undefined) {
      await access.acceptFreeContributor(checked.visit.subject, AGREEMENT, "PERSON_SIGN_IN_PAGE");
    }
    await goBack(response, checked.visit, answer ?? { accepted: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION },
      settings);
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
      const { settings, access } = options;
      if (settings === undefined || access === undefined) {
        write(response, 503, unavailablePage());
        return true;
      }
      try {
        if (request.method === "GET") await show(request, response, settings, access);
        else await decide(request, response, settings, access);
      } catch {
        // The account store didn't answer, or a write failed: no answer goes back to Auth0, and the sign-in waits.
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
