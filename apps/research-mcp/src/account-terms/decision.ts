import {
  RESEARCH_USE_NOTICE_VERSION,
  type FreeContributorAgreement,
  type ResearchContributorAccessService,
  type SignInNoticeStatus,
  type TermsPageAnswerStore,
  type TermsPageClaim,
} from "@askrigor/evidence-repository";

import type { TermsAnswer } from "./tokens.js";

/**
 * The free-use notice's answer wherever AskRigor shows it while a person signs in (owner answer 419a): its terms page,
 * /account/terms, between Auth0's post-login Action and Auth0's /continue (routes.ts), and Gemini's sign-in on
 * AskRigor's own pages, after the login and before Allow (gemini-sign-in/routes.ts). Both read and record through these
 * two functions, so a yes is recorded the same way, with the same checks, wherever it is given:
 *
 * - An account whose yes covers the current notice, the owner's own free login (under the owner's standing instruction)
 *   and an active paid private account are asked nothing.
 * - Accept records the yes as accept_free_contributor does, noted PERSON_SIGN_IN_PAGE, only for the notice version the
 *   page showed, and only by the request that first used the page's token (the security review of 26 Nov 2026).
 * - Decline records nothing, and a token used for one answer never gives the other: a Decline never becomes a yes.
 * - A store that does not answer records nothing and never stops the sign-in: the research tools' refusal stays the
 *   backstop.
 */

/** What the notice step needs of the connector's research accounts. */
export type AccountTermsAccess = Pick<ResearchContributorAccessService, "signInNoticeStatus" | "acceptFreeContributor">;

export type NoticeDecision = "accept" | "decline";

export const FAILED_SEARCHES_OPT_IN_LABEL = "Help fix AskRigor: keep my failed searches for 30 days";
export const KEEP_FAILED_SEARCHES_FIELD = "keep_failed_searches";

export function keepFailedSearchesFromNoticeForm(form: URLSearchParams): boolean {
  const values = form.getAll(KEEP_FAILED_SEARCHES_FIELD);
  return values.length === 1 && values[0] === "true";
}

/** The yes the step records: the notice it showed, with each part accept_free_contributor's agreement names. */
export const NOTICE_AGREEMENT: FreeContributorAgreement = Object.freeze({
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
});

/** The answer for an account the step asks nothing of; undefined for one it asks. */
function answerWithoutAsking(status: SignInNoticeStatus): TermsAnswer | undefined {
  if (status === "covered") return { accepted: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION };
  // Paid private: the free-use notice does not govern it, so the sign-in goes on with no notice recorded anywhere.
  if (status === "paid_private") return { accepted: true };
  return undefined;
}

/**
 * What is recorded for the account behind a verified subject, as an answer; "ask" when the notice is to be shown; not
 * recorded when the account store does not answer. Only reads.
 */
export async function recordedNoticeAnswer(access: AccountTermsAccess, subject: string): Promise<TermsAnswer | "ask"> {
  try {
    return answerWithoutAsking(await access.signInNoticeStatus(subject)) ?? "ask";
  } catch {
    return { notRecorded: "account_store_unavailable" };
  }
}

export type NoticeDecisionResult =
  /** Accept for a notice version other than the current one: nothing recorded and the token unused; show the current one. */
  | { kind: "show_again" }
  /** The token was used for the other answer: nothing changes, and the step does not go on from here. */
  | { kind: "answered_otherwise" }
  /** The step's answer: accepted (and what is recorded), declined, or not recorded with a reason. */
  | { kind: "answer"; answer: TermsAnswer };

/**
 * One press of Accept or Decline on the notice, for the person a verified token names. tokenSha256 keys the token's one
 * answer, kept until usableUntil, when the token can no longer be used anywhere.
 */
export async function decideNotice(input: {
  subject: string;
  decision: NoticeDecision;
  /** The notice version the page's form carried; undefined when it carried none, or more than one. */
  noticeVersionShown: string | undefined;
  keepFailedSearches: boolean;
  tokenSha256: string;
  usableUntil: Date;
  access: AccountTermsAccess;
  answers: TermsPageAnswerStore;
  now: Date;
}): Promise<NoticeDecisionResult> {
  const { subject, decision, access } = input;
  // A yes counts only for the notice the person was shown, as accept_free_contributor refuses an earlier version's: the
  // page is shown again with the current notice, and the token stays unused.
  if (decision === "accept" && input.noticeVersionShown !== RESEARCH_USE_NOTICE_VERSION) return { kind: "show_again" };
  let claim: TermsPageClaim;
  try {
    claim = await input.answers.claim(input.tokenSha256, decision, input.usableUntil, input.now);
  } catch {
    return { kind: "answer", answer: decision === "decline" ? { accepted: false }
      : { notRecorded: "account_store_unavailable" } };
  }
  // A token used for one answer never gives the other: a declined token never becomes a yes.
  if (!claim.claimed && claim.decision !== decision) return { kind: "answered_otherwise" };
  if (decision === "decline") return { kind: "answer", answer: { accepted: false } };
  // Accept. An account the step would not have asked (a yes given meanwhile in an app, or by this token's first press)
  // is not written over, and a paid private account is never switched to free use from here.
  const recorded = await recordedNoticeAnswer(access, subject);
  if (recorded !== "ask") return { kind: "answer", answer: recorded };
  // Only the request that claimed the token records: a second press whose first press recorded nothing records nothing
  // either.
  if (!claim.claimed) return { kind: "answer", answer: { notRecorded: "already_answered" } };
  try {
    await access.acceptFreeContributor(subject, NOTICE_AGREEMENT, "PERSON_SIGN_IN_PAGE",
      input.keepFailedSearches === true ? { keepFailedSearches: true } : undefined);
  } catch {
    return { kind: "answer", answer: { notRecorded: "account_store_unavailable" } };
  }
  return { kind: "answer", answer: { accepted: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION } };
}
