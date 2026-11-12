import {
  createHmac,
  randomUUID,
} from "node:crypto";

import { Pool, type PoolConfig } from "pg";
import { z } from "zod";

import {
  canonicalIdentityRequest,
  reconcileResearchFrontier,
  topicLinkFindings,
  type CanonicalIdentityReader,
  type ReconciledIdentity,
} from "./contribution-identity.js";
import {
  assertNoProhibitedPersistentKeys,
  type LivingEvidenceContribution,
  type ResearchFrontierContribution,
  type TopicLinkContribution,
} from "./contracts.js";
import { sha256 } from "./hash.js";
import {
  prepareContribution,
  prepareFrontierContribution,
  prepareTopicLinkContribution,
} from "./prepare.js";
import {
  checkResearchContributionProposal,
  contactPatternKind,
  contributionCheckFromFindings,
  contributionPrivacyBoundarySchema,
  isCommunityIdentifier,
  isIdentifierValuePath,
  isSandboxLocator,
  RESEARCH_MAP_CONSENT,
  researchContributionProposalInputSchema,
  SHARED_ANALYSIS_KINDS,
  SHARED_SOURCE_KINDS,
  type ContributionProblem,
  type ResearchContributionCheck,
} from "./research-contribution-check.js";

import { RESEARCH_USE_NOTICE_CHANGES, type ResearchUseNoticeChange } from "./research-use-notice-changes.js";
import { PostgresResearchCallRecordStore } from "./research-call-record.js";
export { contributionPrivacyBoundarySchema, researchContributionProposalInputSchema };
export { RESEARCH_USE_NOTICE_CHANGES, type ResearchUseNoticeChange };

export const RESEARCH_USE_NOTICE_VERSION =
  "free-contributor-v5-2026-11-05" as const;

/**
 * Notices free accounts accepted before the current one, oldest first. Such an
 * account accepts the current notice before free research continues: v2 when
 * each finished answer's findings card joined what free use saves (owner
 * decision Q11, 2026-09-30), v3 when findings the owner accepts may be
 * published in the public Atlas and the notice says what deleting a card
 * removes and what stays (owner answers 159, 1b and 7, and 160b, 2026-10-22),
 * v4 when free cards publish on save, with votes and comments (owner answer 171, 2026-10-25), v5 when a card's
 * summary of what communities reported holds links to the forum threads AskRigor read (owner answer 253a, 2026-11-05).
 */
export const EARLIER_RESEARCH_USE_NOTICE_VERSIONS = [
  "free-contributor-v1-2026-09-01",
  "free-contributor-v2-2026-09-30",
  "free-contributor-v3-2026-10-22",
  "free-contributor-v4-2026-10-25",
] as const;

const researchUseNoticeVersionSchema = z.enum([
  RESEARCH_USE_NOTICE_VERSION,
  ...EARLIER_RESEARCH_USE_NOTICE_VERSIONS,
]);

export type ResearchUseNoticeVersion = z.infer<typeof researchUseNoticeVersionSchema>;

/**
 * Whether a yes to the `accepted` notice covers the current one: it is the current notice, or every version after it
 * changed only wording. Exact: the versions and their declared materiality decide; nothing else is read.
 */
export function researchUseNoticeCovered(
  accepted: string | null | undefined,
  changes: readonly ResearchUseNoticeChange[] = RESEARCH_USE_NOTICE_CHANGES,
): boolean {
  const index = changes.findIndex(({ version }) => version === accepted);
  return index >= 0 && changes.slice(index + 1).every(({ material }) => !material);
}

/**
 * How the notice an account holds was accepted: by the person, or, for the owner's own login only, by the owner's
 * standing instruction of 6 November 2026 ("can we make it so that i don't have to keep accepting the askrigor notice
 * every time you update?"). The stored value names the instruction's date.
 */
export const NOTICE_ACCEPTED_BY = ["PERSON", "OWNER_STANDING_INSTRUCTION_2026_11_06"] as const;
export type NoticeAcceptedBy = typeof NOTICE_ACCEPTED_BY[number];
const noticeAcceptedBySchema = z.enum(NOTICE_ACCEPTED_BY);

/** A free account's yes, as inspect shows it: what was accepted, when, how, and whether it covers the current notice. */
export interface ResearchUseNoticeAcceptance {
  noticeVersion: ResearchUseNoticeVersion;
  acceptedAt: string;
  /** null for a row an image from before migration 0031 last wrote: its way of acceptance was not recorded. */
  acceptedBy: NoticeAcceptedBy | null;
  /** "accepted": the current notice itself; "carried_forward": an earlier one, with only wording changed since. */
  current: "accepted" | "carried_forward";
}

// Version 5 (owner answer 253a, 2026-11-05), word for word as the owner chose it: a card's summary of what public
// online communities reported holds the communities, counts of what people reported and links to the forum threads
// AskRigor read, never their posts or names, YouTube comments or video IDs. All other sentences remain version 4's
// (owner answer 171, 2026-10-25: free cards publish on save, with the unreviewed label, votes and comments; deleting a
// card removes it from the Atlas unless its findings were already accepted; an accepted finding stays while valid).
export const RESEARCH_USE_NOTICE = [
  "Free AskRigor use is reciprocal: what AskRigor learns from your research is saved for its research library.",
  "That includes deidentified structured research progress and, for each finished research answer whose findings would help other people, a findings card: the question in general terms, the main findings and how certain they are, the public studies behind them, and what public online communities reported, summarized without their posts or names: the communities, counts of what people reported, and links to the forum threads AskRigor read, never YouTube comments or video IDs.",
  "AskRigor never saves raw chat, prompts, identity or contact details, private health narratives, uploads, or raw source or provider bodies.",
  "Saved research is reviewed and does not become evidence, conclusions, or scientific authority merely because it was saved or repeated.",
  "Your findings cards are published in AskRigor's public Atlas as soon as they are saved, written without you and marked \"Not checked by supervisors yet\" until AskRigor's owner has reviewed them, and people who sign in can vote and comment on them.",
  "If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas unless AskRigor's owner has already accepted its findings; no reason is needed.",
  "An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, and rewritten or removed if it could identify anyone.",
  "Paid private access saves research findings or lesson feedback only when you accept saving them for that answer, and requires an active verified entitlement.",
].join(" ");

/**
 * How many characters of an account key make its account reference (owner question, 2026-10-21: "how can i mark
 * accounts as dev?"): manage_research_access shows a signed-in user this much of their pseudonymous key, so the owner
 * can list the account in the server's settings without anyone seeing the key or anything about the person.
 */
export const RESEARCH_ACCOUNT_REFERENCE_CHARACTERS = 12;

/** An account's reference: the first 12 hexadecimal characters of its account key. It is derived, never stored. */
export function researchAccountReference(accountKey: string): string {
  return accountKey.slice(0, RESEARCH_ACCOUNT_REFERENCE_CHARACTERS);
}

export const researchUseModeSchema = z.enum([
  "FREE_CONTRIBUTOR",
  "PAID_PRIVATE",
]);

export const freeContributorAgreementSchema = z.object({
  noticeVersion: z.literal(RESEARCH_USE_NOTICE_VERSION),
  eligibleDeidentifiedResearchContributionRequired: z.literal(true),
  prohibitedPrivateAndRawContentExcluded: z.literal(true),
  proposalReviewAndNoAuthorityAcknowledged: z.literal(true),
  paidPrivateAlternativeAcknowledged: z.literal(true),
}).strict();

/** An agreement as stored: accepted under the current notice or an earlier one. */
const storedFreeContributorAgreementSchema = freeContributorAgreementSchema.extend({
  noticeVersion: researchUseNoticeVersionSchema,
}).strict();

export type ResearchUseMode = z.infer<typeof researchUseModeSchema>;
export type FreeContributorAgreement = z.infer<
  typeof freeContributorAgreementSchema
>;
export type StoredFreeContributorAgreement = z.infer<
  typeof storedFreeContributorAgreementSchema
>;
export type ContributionPrivacyBoundary = z.infer<
  typeof contributionPrivacyBoundarySchema
>;
export type ResearchContributionProposalKind =
  | "RESEARCH_FRONTIER"
  | "SOURCE_ANALYSIS"
  | "TOPIC_LINK";

/**
 * The research style an account sets once, for every research it runs (owner answer 279a, 9 November 2026, from the
 * owner's report AskRigor#434). style is how often the AI stops to ask the person: guided asks at the framing and before
 * every long task; balanced, the default, asks only questions that could redirect the research and shows the menu of
 * next tasks when the rest could take more than about 10 minutes or the person's choices could steer the research, as
 * they usually can unless the question is precise (owner answer 284, 10 November 2026); autonomous goes on through the
 * passes and checks back after checkBackMinutes. adjustmentDetail is what the answer says about the variables each key observational study
 * adjusted for: flagged, the default, only those that look doubtful on a quick check ("default balanced mode might only
 * mention the adjustments you think on a quick check look potentially inappropriate or controversial"), or all. None of
 * them overrides a safety, privacy or truthfulness rule.
 */
export const RESEARCH_STYLES = ["guided", "balanced", "autonomous"] as const;
export type ResearchStyle = typeof RESEARCH_STYLES[number];
export const ADJUSTMENT_DETAILS = ["flagged", "all"] as const;
export type AdjustmentDetail = typeof ADJUSTMENT_DETAILS[number];
export const CHECK_BACK_MINUTES = Object.freeze({ min: 1, max: 120 });
export interface ResearchSteering {
  style: ResearchStyle;
  checkBackMinutes: number;
  adjustmentDetail: AdjustmentDetail;
}
export const DEFAULT_RESEARCH_STEERING: Readonly<ResearchSteering> = Object.freeze({
  style: "balanced",
  checkBackMinutes: 10,
  adjustmentDetail: "flagged",
});
export const researchSteeringSchema = z.object({
  style: z.enum(RESEARCH_STYLES),
  checkBackMinutes: z.number().int().min(CHECK_BACK_MINUTES.min).max(CHECK_BACK_MINUTES.max),
  adjustmentDetail: z.enum(ADJUSTMENT_DETAILS),
}).strict();

/** An account's research style, with the defaults for what it never set. */
export function researchSteeringOf(account: Pick<ResearchUseAccountRecord, "researchSteering"> | null | undefined): ResearchSteering {
  return { ...DEFAULT_RESEARCH_STEERING, ...(account?.researchSteering ?? {}) };
}

export interface ResearchUseAccountRecord {
  accountKey: string;
  status: "ACTIVE" | "REVOKED";
  mode: ResearchUseMode | null;
  noticeVersion: ResearchUseNoticeVersion | null;
  agreement: StoredFreeContributorAgreement | null;
  activatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Whether a checked answer ends with the note comparing it with the plain answer the account registered before
   * research (owner answer 140b); absent means the default, on. saveAccount and revokeAccount never change it;
   * setPlainAnswerNote does.
   */
  plainAnswerNote?: boolean;
  /**
   * Whether this account's connector lessons may carry a detailed report (owner question 154); absent means the
   * default, off. saveAccount and revokeAccount never change it; setDetailedLessonReports does.
   */
  detailedLessonReports?: boolean;
  /**
   * Whether this account saves findings cards (owner answer 171); absent means the default, on. saveAccount and
   * revokeAccount never change it; setFindingsSave does. The connector permits only dev accounts to change it.
   */
  findingsSave?: boolean;
  /**
   * How a free account's notice was accepted (NOTICE_ACCEPTED_BY), at activatedAt; null when not recorded or not a free
   * account. saveAccount writes it with the notice; an image from before migration 0031 leaves it unrecorded.
   */
  noticeAcceptedBy?: NoticeAcceptedBy | null;
  /**
   * The account's research style (owner answer 279a); absent means the defaults, DEFAULT_RESEARCH_STEERING. saveAccount
   * and revokeAccount never change it; setResearchSteering does.
   */
  researchSteering?: ResearchSteering;
}

export interface ResearchPrivateEntitlementRecord {
  entitlementId: string;
  accountKey: string;
  status: "ACTIVE" | "REVOKED";
  source: "OWNER_GRANTED" | "BILLING_PROVIDER";
  externalReferenceSha256: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ResearchContributionProposalRecord {
  proposalId: string;
  accountKey: string;
  proposalKind: ResearchContributionProposalKind;
  payloadSha256: string;
  payload: LivingEvidenceContribution | ResearchFrontierContribution | TopicLinkContribution;
  privacyBoundary: ContributionPrivacyBoundary;
  partial: boolean;
  status: "PENDING_REVIEW" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
  /** This account's own pending proposal of the same kind that this one replaces, when the submitter named one. */
  supersedesProposalId?: string | null;
  /**
   * A paid private account's research map only (owner answer 143a): the SHA-256 of the finalization receipt whose offer
   * to file it the user said yes to. One yes files one map; a free contributor's proposal has none.
   */
  consentReceiptSha256?: string | null;
}

/** The superseded proposal named is not this account's own pending proposal of the same kind. */
const SUPERSEDES_NOT_OWN_PENDING = "RESEARCH_PROPOSAL_SUPERSEDES_NOT_OWN_PENDING";
/** A paid private account's proposal that is not a research map filed with the user's yes. */
const PAID_PRIVATE_CONSENT_REQUIRED = "RESEARCH_PROPOSAL_PAID_PRIVATE_CONSENT_REQUIRED";
/** A consent on a proposal that is not a paid private account's. */
const CONSENT_NOT_PAID_PRIVATE = "RESEARCH_PROPOSAL_CONSENT_NOT_PAID_PRIVATE";
/** The user's yes named by this finalization receipt already filed a map. */
const CONSENT_ALREADY_USED = "RESEARCH_PROPOSAL_CONSENT_ALREADY_USED";

/** Why a paid private account's proposal is refused before anything is read or stored (owner answer 143a). */
export const PAID_PRIVATE_MAP_ONLY = "Paid private mode files nothing without the user's yes. It files only this " +
  "research's map (a RESEARCH_FRONTIER proposal), after the answer's final check offered to file it and the user " +
  `said yes: send userConsent "${RESEARCH_MAP_CONSENT}" and that check's finalization_receipt as ` +
  "finalizationReceipt. Nothing was stored.";
const CONSENT_SPENT = "The user's yes to that offer has already filed this research's map, so nothing more was " +
  "stored: another map needs a new final check, its offer and the user's yes.";

export interface ProposalInsertResult {
  status: "inserted" | "idempotent_replay";
  record: ResearchContributionProposalRecord;
}

export interface SubmitProposalOptions {
  /**
   * The canonical store's read-only identity view (owner answer 138b): a frontier then continues the exact canonical
   * records it names before it is stored. Without it, or when it cannot be read, the record is filed as sent. A topic
   * link names canonical topics only, so it is not filed without this check.
   */
  canonical?: CanonicalIdentityReader;
  /**
   * The server built this analysis itself (analysis-staging.ts): one this account already filed under the same
   * idempotency key, pending, accepted or rejected, is the same audit and is not filed again, whatever clock staged it.
   */
  serverBuilt?: boolean;
  /**
   * For a paid private account (owner answer 143a): the input's finalizationReceipt as the caller checked it, a
   * finalization receipt this server signed for this account, unexpired, whose offer included this research's map.
   * The service files the map only when it names the input's receipt and the input carries the user's consent.
   */
  paidPrivateConsent?: { receiptSha256: string };
}

export interface ProposalSubmission extends ProposalInsertResult {
  /** Whether the record was checked against the canonical store, when a view was given. */
  canonicalCheck?: "checked" | "unavailable";
  /** The canonical IDs the stored record continues instead of the ones sent (IDs only). */
  reconciled: ReconciledIdentity[];
}

export interface ResearchContributorAccessStore {
  getAccount(accountKey: string): Promise<ResearchUseAccountRecord | null>;
  saveAccount(record: ResearchUseAccountRecord): Promise<void>;
  /**
   * Saves the record only while the stored row still has the status, mode, notice version and update time it had when
   * `read` was read; false, and nothing written, when it changed in between.
   */
  saveAccountIfUnchanged(record: ResearchUseAccountRecord, read: ResearchUseAccountRecord): Promise<boolean>;
  hasActivePrivateEntitlement(accountKey: string, at: string): Promise<boolean>;
  insertProposal(
    record: ResearchContributionProposalRecord,
  ): Promise<ProposalInsertResult>;
  /** This account's own proposal of the kind under an idempotency key, pending, accepted or rejected. */
  findOwnProposalByIdempotencyKey(
    accountKey: string,
    proposalKind: ResearchContributionProposalKind,
    idempotencyKey: string,
  ): Promise<ResearchContributionProposalRecord | null>;
  revokeAccount(record: ResearchUseAccountRecord): Promise<number>;
  /** Sets the account's plain-answer note; false when the account has no row. */
  setPlainAnswerNote(accountKey: string, enabled: boolean): Promise<boolean>;
  /** Sets the account's detailed lesson reports; false when the account has no row. */
  setDetailedLessonReports(accountKey: string, enabled: boolean): Promise<boolean>;
  /** Sets the account's findings-card saving; false when the account has no row. */
  setFindingsSave(accountKey: string, enabled: boolean): Promise<boolean>;
  /**
   * Changes only the parts of the account's research style the change names, in one write, and returns the style as
   * stored after it; undefined when the account has no row (the review of 12 Nov 2026: two chats each changing one
   * part read the whole style, and the later write put back the part the other had changed).
   */
  setResearchSteering(accountKey: string, change: Partial<ResearchSteering>): Promise<ResearchSteering | undefined>;
}

export interface ResearchContributorAccessServiceOptions {
  store: ResearchContributorAccessStore;
  identitySecret: Uint8Array;
  now?: () => string;
  randomUuid?: () => string;
  /**
   * The owner's own sign-in subjects: the one ASKRIGOR_OAUTH_ALLOWED_SUBJECT names, which the owner's review admits.
   * Their free accounts accept each new notice by the owner's standing instruction (NOTICE_ACCEPTED_BY), recorded as
   * such; no other account ever does, whatever list it is on.
   */
  ownerSubjects?: ReadonlySet<string>;
}

/** An active account's mode and settings, as activeAccount reads them. */
export interface ActiveResearchAccount {
  mode: ResearchUseMode;
  plainAnswerNote: boolean;
  detailedLessonReports: boolean;
  findingsSave: boolean;
  noticeVersion: ResearchUseNoticeVersion | null;
  steering: ResearchSteering;
}

export interface ResearchAccessView {
  status: "UNENROLLED" | "ACTIVE" | "REVOKED";
  mode: ResearchUseMode | null;
  noticeVersion: typeof RESEARCH_USE_NOTICE_VERSION;
  notice: string;
  /** An active free account's yes: the notice it holds, when and how it was accepted, and whether it was carried forward. */
  acceptance?: ResearchUseNoticeAcceptance;
  contributionRequired: boolean;
  privateEntitlementRequired: boolean;
  paidCheckoutAvailable: false;
  activatedAt: string | null;
  updatedAt: string | null;
}

export class ResearchAccessError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_ACCESS_REQUIRED"
      | "RESEARCH_ACCESS_REVOKED"
      | "PAID_PRIVATE_ENTITLEMENT_REQUIRED"
      | "PAID_PRIVATE_DOES_NOT_CONTRIBUTE"
      | "FREE_CONTRIBUTOR_REQUIRED"
      | "CONTRIBUTION_PRIVACY_REJECTED"
      | "RESEARCH_ACCESS_SERVICE_UNAVAILABLE"
      | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
  }
}

/**
 * A proposal refused before storage, with every problem the intake found (owner question 127). Its code is
 * CONTRIBUTION_PRIVACY_REJECTED when a privacy rule failed and INVALID_REQUEST otherwise; neither the problems nor the
 * message hold any value from the proposal.
 */
export class ResearchContributionRejectedError extends ResearchAccessError {
  readonly problems: readonly ContributionProblem[];
  readonly total: number;
  readonly crossFieldRulesPending: boolean;
  readonly payloadCheck: ResearchContributionCheck["payloadCheck"];

  constructor(check: ResearchContributionCheck) {
    super(
      check.privacyRuleFailed ? "CONTRIBUTION_PRIVACY_REJECTED" : "INVALID_REQUEST",
      `The contribution was not filed: ${check.total} problem${check.total === 1 ? "" : "s"} (` +
        check.problems.slice(0, 5).map(({ path, rule }) => `${path}: ${rule}`).join("; ") +
        (check.total > 5 ? "; …" : "") + ").",
    );
    this.problems = check.problems;
    this.total = check.total;
    this.crossFieldRulesPending = check.crossFieldRulesPending;
    this.payloadCheck = check.payloadCheck;
  }
}

export class ResearchContributorAccessService {
  private readonly store: ResearchContributorAccessStore;
  private readonly identitySecret: Buffer;
  private readonly now: () => string;
  private readonly createUuid: () => string;
  /** The owner's own accounts, derived once from ownerSubjects; a subject the derivation refuses is no one's. */
  private readonly ownerAccountKeys: ReadonlySet<string>;

  constructor(options: ResearchContributorAccessServiceOptions) {
    if (options.identitySecret.byteLength < 32) {
      throw new Error("RESEARCH_IDENTITY_SECRET_TOO_SHORT");
    }
    this.store = options.store;
    this.identitySecret = Buffer.from(options.identitySecret);
    this.now = options.now ?? (() => new Date().toISOString());
    this.createUuid = options.randomUuid ?? randomUUID;
    this.ownerAccountKeys = new Set([...options.ownerSubjects ?? []].flatMap((subject) => {
      try {
        return [researchAccountKeyForSubject(this.identitySecret, subject)];
      } catch {
        return [];
      }
    }));
  }

  accountKeyForSubject(subject: string): string {
    return researchAccountKeyForSubject(this.identitySecret, subject);
  }

  async inspect(subject: string): Promise<ResearchAccessView> {
    return await this.inspectByAccountKey(this.accountKeyForSubject(subject));
  }

  /**
   * inspect, for an account key the caller derived from a verified subject: the Atlas account page reads the account
   * of the person signed in there, whose session carries the key and never the subject.
   */
  async inspectByAccountKey(accountKey: string): Promise<ResearchAccessView> {
    const stored = await this.store.getAccount(accountKeyChecked(accountKey));
    if (stored === null) {
      return accessView("UNENROLLED", null, null, null);
    }
    const account = await this.withStandingAcceptance(stored);
    // Gone between the reads, as no AskRigor write does: shown as never enrolled.
    if (account === null) return accessView("UNENROLLED", null, null, null);
    // A free account whose notice has changed materially since its yes is shown the current one to accept.
    if (outdatedFreeNotice(account)) {
      return accessView("UNENROLLED", null, null, account.updatedAt);
    }
    return accessView(
      account.status,
      account.mode,
      account.activatedAt,
      account.updatedAt,
      noticeAcceptance(account),
    );
  }

  async acceptFreeContributor(
    subject: string,
    agreementInput: unknown,
  ): Promise<ResearchAccessView> {
    const agreement = freeContributorAgreementSchema.parse(agreementInput);
    const accountKey = this.accountKeyForSubject(subject);
    const prior = await this.store.getAccount(accountKey);
    const at = this.now();
    const record: ResearchUseAccountRecord = {
      accountKey,
      status: "ACTIVE",
      mode: "FREE_CONTRIBUTOR",
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      agreement,
      activatedAt: at,
      revokedAt: null,
      createdAt: prior?.createdAt ?? at,
      updatedAt: at,
      noticeAcceptedBy: "PERSON",
    };
    await this.store.saveAccount(record);
    return accessView("ACTIVE", "FREE_CONTRIBUTOR", at, at, noticeAcceptance(record));
  }

  async activatePaidPrivate(subject: string): Promise<ResearchAccessView> {
    const accountKey = this.accountKeyForSubject(subject);
    const prior = await this.store.getAccount(accountKey);
    const at = this.now();
    if (!await this.store.hasActivePrivateEntitlement(accountKey, at)) {
      throw new ResearchAccessError(
        "PAID_PRIVATE_ENTITLEMENT_REQUIRED",
        "Paid private access is unavailable for this account because no active verified entitlement exists. No price or checkout is offered by this release.",
      );
    }
    await this.store.saveAccount({
      accountKey,
      status: "ACTIVE",
      mode: "PAID_PRIVATE",
      noticeVersion: null,
      agreement: null,
      activatedAt: at,
      revokedAt: null,
      createdAt: prior?.createdAt ?? at,
      updatedAt: at,
      noticeAcceptedBy: null,
    });
    return accessView("ACTIVE", "PAID_PRIVATE", at, at);
  }

  async revoke(subject: string): Promise<ResearchAccessView> {
    const accountKey = this.accountKeyForSubject(subject);
    const prior = await this.store.getAccount(accountKey);
    const at = this.now();
    await this.store.revokeAccount({
      accountKey,
      status: "REVOKED",
      mode: null,
      noticeVersion: null,
      agreement: null,
      activatedAt: null,
      revokedAt: at,
      createdAt: prior?.createdAt ?? at,
      updatedAt: at,
      noticeAcceptedBy: null,
    });
    return accessView("REVOKED", null, null, at);
  }

  async requireActive(subject: string): Promise<ResearchUseMode> {
    return (await this.activeAccount(subject)).mode;
  }

  /**
   * The active account's mode and its settings, with the checks requireActive makes: its plain-answer note (owner
   * answer 140b), its detailed lesson reports (owner question 154), its findings-card saving (owner answer 171), and
   * the free contributor notice it accepted, which
   * decides whether its findings cards are published as soon as they are saved (decision 171).
   */
  async activeAccount(
    subject: string,
  ): Promise<ActiveResearchAccount> {
    return await this.activeAccountByKey(this.accountKeyForSubject(subject));
  }

  /** activeAccount, for an account key the caller derived from a verified subject (as inspectByAccountKey). */
  async activeAccountByKey(accountKey: string): Promise<ActiveResearchAccount> {
    const account = await this.enrolledAccountByKey(accountKeyChecked(accountKey));
    if (outdatedFreeNotice(account)) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REQUIRED",
        "AskRigor's free contributor notice has changed. It now collects or publishes more than the notice this account accepted, so show the current notice and let the user accept it, or use an entitled paid-private account, before using AskRigor research tools.",
      );
    }
    if (
      account.mode === "PAID_PRIVATE" &&
      !await this.store.hasActivePrivateEntitlement(account.accountKey, this.now())
    ) {
      throw new ResearchAccessError(
        "PAID_PRIVATE_ENTITLEMENT_REQUIRED",
        "The paid private entitlement is no longer active.",
      );
    }
    return {
      mode: account.mode,
      plainAnswerNote: account.plainAnswerNote ?? true,
      detailedLessonReports: account.detailedLessonReports === true,
      findingsSave: account.findingsSave ?? true,
      noticeVersion: account.noticeVersion,
      steering: researchSteeringOf(account),
    };
  }

  /** An account that chose a mode and is not revoked, whatever notice it accepted and whatever its entitlement. */
  private async enrolledAccount(subject: string): Promise<ResearchUseAccountRecord & { mode: ResearchUseMode }> {
    return await this.enrolledAccountByKey(this.accountKeyForSubject(subject));
  }

  /** enrolledAccount, by the account's key. */
  private async enrolledAccountByKey(accountKey: string): Promise<ResearchUseAccountRecord & { mode: ResearchUseMode }> {
    const stored = await this.store.getAccount(accountKey);
    const account = stored === null ? null : await this.withStandingAcceptance(stored);
    if (account === null) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REQUIRED",
        "Choose free contributor mode or activate an existing paid private entitlement before using AskRigor research tools.",
      );
    }
    if (account.status !== "ACTIVE" || account.mode === null) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REVOKED",
        "Research access is revoked. Choose an allowed mode again before using AskRigor research tools.",
      );
    }
    return { ...account, mode: account.mode };
  }

  /**
   * The account under the current notice. The owner's own active free account, when the notice has changed materially
   * since its last yes, accepts the current notice now by the owner's standing instruction of 6 November 2026, and the
   * row records that: the notice, its agreement, the time and how (NOTICE_ACCEPTED_BY). Any other account, and an owner
   * account that is revoked, paid private or already covered, is returned as stored.
   */
  private async withStandingAcceptance(account: ResearchUseAccountRecord): Promise<ResearchUseAccountRecord | null> {
    // Saved onto the row as it was read (the review of 7 Nov): a revoke or a switch to paid private that lands between
    // the read and the write is kept, and the account is read again. It is recorded on the first research call that
    // relies on it, a read-only tool's included, since an acceptance relied on and not recorded would be worse.
    let read: ResearchUseAccountRecord | null = account;
    for (let attempt = 0; attempt < 2 && read !== null; attempt += 1) {
      if (!outdatedFreeNotice(read) || !this.ownerAccountKeys.has(read.accountKey)) return read;
      const at = this.now();
      const accepted: ResearchUseAccountRecord = {
        ...read,
        noticeVersion: RESEARCH_USE_NOTICE_VERSION,
        agreement: freeContributorAgreementSchema.parse({
          noticeVersion: RESEARCH_USE_NOTICE_VERSION,
          eligibleDeidentifiedResearchContributionRequired: true,
          prohibitedPrivateAndRawContentExcluded: true,
          proposalReviewAndNoAuthorityAcknowledged: true,
          paidPrivateAlternativeAcknowledged: true,
        }),
        activatedAt: at,
        updatedAt: at,
        noticeAcceptedBy: "OWNER_STANDING_INSTRUCTION_2026_11_06",
      };
      if (await this.store.saveAccountIfUnchanged(accepted, read)) return accepted;
      read = await this.store.getAccount(read.accountKey);
    }
    return read;
  }

  /**
   * Turns the note comparing a checked answer with its plain answer off or on for an active account (owner answer
   * 140b). Only the choice is stored; the plain answer still guides the research either way.
   */
  async setPlainAnswerNote(subject: string, enabled: boolean): Promise<boolean> {
    await this.requireActive(subject);
    if (!await this.store.setPlainAnswerNote(this.accountKeyForSubject(subject), enabled)) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REQUIRED",
        "Choose free contributor mode or activate an existing paid private entitlement before using AskRigor research tools.",
      );
    }
    return enabled;
  }

  /**
   * Turns detailed lesson reports on or off for an active account (owner question 154): only then may its connector
   * lessons carry a detailed report. Off by default; only the choice is stored, never a report.
   */
  async setDetailedLessonReports(subject: string, enabled: boolean): Promise<boolean> {
    await this.requireActive(subject);
    if (!await this.store.setDetailedLessonReports(this.accountKeyForSubject(subject), enabled)) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REQUIRED",
        "Choose free contributor mode or activate an existing paid private entitlement before using AskRigor research tools.",
      );
    }
    return enabled;
  }

  /**
   * Changes an active account's research style (owner answer 279a): the parts given replace the stored ones, the others
   * stay. Only the choice is stored. Returns the style as stored.
   */
  async setResearchSteering(subject: string, change: Partial<ResearchSteering>): Promise<ResearchSteering> {
    await this.requireActive(subject);
    // Only the parts given, each checked, go to the store, which changes them alone in one write: no read of the whole
    // style first, which a concurrent change could make stale (the review of 12 Nov 2026).
    const parts = researchSteeringSchema.partial().parse(
      Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)));
    const steering = await this.store.setResearchSteering(this.accountKeyForSubject(subject), parts);
    if (steering === undefined) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REQUIRED",
        "Choose free contributor mode or activate an existing paid private entitlement before using AskRigor research tools.",
      );
    }
    return steering;
  }

  /**
   * Turns findings-card saving off or on; the connector checks the dev-account restriction. Turning it on needs an active
   * account on the current notice, since a saved card may be published. Turning it off publishes nothing, so it works
   * for an enrolled account whatever notice it accepted (the review of 5 November 2026, finding 5): a dev account still
   * on an earlier notice switches its saving off before it accepts the new one, so a regression run never publishes.
   */
  async setFindingsSave(subject: string, enabled: boolean): Promise<boolean> {
    if (enabled) await this.requireActive(subject);
    else await this.enrolledAccount(subject);
    if (!await this.store.setFindingsSave(this.accountKeyForSubject(subject), enabled)) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REQUIRED",
        "Choose free contributor mode or activate an existing paid private entitlement before using AskRigor research tools.",
      );
    }
    return enabled;
  }

  async submitProposal(
    subject: string,
    input: unknown,
    options: SubmitProposalOptions = {},
  ): Promise<ProposalSubmission> {
    const mode = await this.requireActive(subject);
    // Owner answer 143a (2026-10-21): a paid private account files only this research's map, and only with the user's
    // yes to the answer's offer to file it, shown by the finalization receipt the input names and the caller checked.
    // Anything else is refused before the record is read.
    const consent = mode === "PAID_PRIVATE" ? paidPrivateMapConsent(input, options.paidPrivateConsent) : undefined;
    if (mode === "PAID_PRIVATE" && consent === undefined) {
      throw new ResearchAccessError("PAID_PRIVATE_DOES_NOT_CONTRIBUTE", PAID_PRIVATE_MAP_ONLY);
    }
    if (mode !== "FREE_CONTRIBUTOR" && mode !== "PAID_PRIVATE") {
      throw new ResearchAccessError(
        "FREE_CONTRIBUTOR_REQUIRED",
        "A shared research proposal requires active free contributor mode.",
      );
    }
    // Every problem at once, so the sender can repair the record; the checks
    // below then run as they always have before anything is stored.
    const check = checkResearchContributionProposal(input);
    if (check.total > 0) throw new ResearchContributionRejectedError(check);
    const parsed = researchContributionProposalInputSchema.parse(input);
    assertNoProhibitedPersistentKeys(parsed.payload);
    assertNoObviousPrivateContactText(parsed.payload);
    let payload = parsed.payload;
    let reconciled: ReconciledIdentity[] = [];
    let canonicalCheck: ProposalSubmission["canonicalCheck"];
    if (options.canonical !== undefined && parsed.proposalKind === "RESEARCH_FRONTIER") {
      const frontier = prepareFrontierContribution(parsed.payload).contribution;
      const state = await options.canonical
        .readCanonicalIdentity(canonicalIdentityRequest("RESEARCH_FRONTIER", frontier))
        .catch(() => undefined);
      if (state === undefined) {
        canonicalCheck = "unavailable";
      } else {
        const reconciliation = reconcileResearchFrontier(frontier, state);
        if (reconciliation.findings.length > 0) {
          throw new ResearchContributionRejectedError(
            contributionCheckFromFindings("RESEARCH_FRONTIER", reconciliation.findings),
          );
        }
        payload = reconciliation.payload;
        reconciled = reconciliation.reconciled;
        canonicalCheck = "checked";
      }
    }
    if (parsed.proposalKind === "TOPIC_LINK") {
      // Both topics, and every stored link between them, are checked exactly before the link is filed.
      const link = prepareTopicLinkContribution(parsed.payload).contribution;
      const state = options.canonical === undefined
        ? undefined
        : await options.canonical
          .readCanonicalIdentity(canonicalIdentityRequest("TOPIC_LINK", link))
          .catch(() => undefined);
      if (state === undefined) {
        throw new ResearchAccessError(
          "RESEARCH_ACCESS_SERVICE_UNAVAILABLE",
          "A topic link is checked against the canonical topics it names, which cannot be read just now. Nothing " +
            "was stored; try again shortly.",
        );
      }
      const findings = topicLinkFindings(link, state);
      if (findings.length > 0) {
        throw new ResearchContributionRejectedError(contributionCheckFromFindings("TOPIC_LINK", findings));
      }
      canonicalCheck = "checked";
    }
    const prepared = prepareResearchContributionProposal(
      parsed.proposalKind,
      payload,
    );
    const accountKey = this.accountKeyForSubject(subject);
    if (options.serverBuilt === true) {
      const filed = await this.store.findOwnProposalByIdempotencyKey(
        accountKey,
        parsed.proposalKind,
        prepared.payload.idempotencyKey,
      );
      if (filed !== null) return { status: "idempotent_replay", record: filed, reconciled };
    }
    const at = this.now();
    const record: ResearchContributionProposalRecord = {
      proposalId: this.createUuid(),
      accountKey,
      proposalKind: parsed.proposalKind,
      payloadSha256: prepared.payloadSha256,
      payload: prepared.payload,
      privacyBoundary: parsed.privacyBoundary,
      partial: prepared.partial,
      status: "PENDING_REVIEW",
      createdAt: at,
      reviewedAt: null,
      reviewReason: null,
      supersedesProposalId: parsed.supersedesProposalId ?? null,
      // A free contributor's map is filed under the agreement; only a paid private map carries the user's yes.
      consentReceiptSha256: consent ?? null,
    };
    let inserted: ProposalInsertResult;
    try {
      inserted = await this.store.insertProposal(record);
    } catch (error) {
      if (error instanceof Error && error.message.includes(CONSENT_ALREADY_USED)) {
        throw new ResearchAccessError("PAID_PRIVATE_DOES_NOT_CONTRIBUTE", CONSENT_SPENT);
      }
      if (error instanceof Error && error.message.includes(PAID_PRIVATE_CONSENT_REQUIRED)) {
        throw new ResearchAccessError("PAID_PRIVATE_DOES_NOT_CONTRIBUTE", PAID_PRIVATE_MAP_ONLY);
      }
      // One answer whatever the UUID names, so nothing is learnt about another account's proposals.
      if (!(error instanceof Error) || !error.message.includes(SUPERSEDES_NOT_OWN_PENDING)) throw error;
      throw new ResearchContributionRejectedError(contributionCheckFromFindings(parsed.proposalKind, [{
        path: ["supersedesProposalId"],
        rule: "superseded_proposal",
        expected: "the UUID of one of this account's own proposals of the same kind that is still pending review, " +
          "or no supersedesProposalId: only such a draft can be replaced",
      }]));
    }
    return {
      ...inserted,
      ...(canonicalCheck === undefined ? {} : { canonicalCheck }),
      reconciled,
    };
  }
}

export class InMemoryResearchContributorAccessStore
implements ResearchContributorAccessStore {
  private readonly accounts = new Map<string, ResearchUseAccountRecord>();
  private readonly entitlements = new Map<
    string,
    ResearchPrivateEntitlementRecord
  >();
  private readonly proposals = new Map<
    string,
    ResearchContributionProposalRecord
  >();

  async getAccount(accountKey: string): Promise<ResearchUseAccountRecord | null> {
    const record = this.accounts.get(accountKey);
    return record === undefined ? null : structuredClone(record);
  }

  async saveAccount(record: ResearchUseAccountRecord): Promise<void> {
    this.accounts.set(record.accountKey, this.keepingSettings(record));
  }

  async saveAccountIfUnchanged(record: ResearchUseAccountRecord, read: ResearchUseAccountRecord): Promise<boolean> {
    const stored = this.accounts.get(record.accountKey);
    if (stored === undefined || stored.status !== read.status || stored.mode !== read.mode ||
        stored.noticeVersion !== read.noticeVersion || stored.updatedAt !== read.updatedAt) return false;
    this.accounts.set(record.accountKey, this.keepingSettings(record));
    return true;
  }

  async setPlainAnswerNote(accountKey: string, enabled: boolean): Promise<boolean> {
    const account = this.accounts.get(accountKey);
    if (account === undefined) return false;
    this.accounts.set(accountKey, { ...account, plainAnswerNote: enabled });
    return true;
  }

  async setDetailedLessonReports(accountKey: string, enabled: boolean): Promise<boolean> {
    const account = this.accounts.get(accountKey);
    if (account === undefined) return false;
    this.accounts.set(accountKey, { ...account, detailedLessonReports: enabled });
    return true;
  }

  async setFindingsSave(accountKey: string, enabled: boolean): Promise<boolean> {
    const account = this.accounts.get(accountKey);
    if (account === undefined) return false;
    this.accounts.set(accountKey, { ...account, findingsSave: enabled });
    return true;
  }

  // Read and written with no await between them, so no other change runs in between.
  async setResearchSteering(accountKey: string, change: Partial<ResearchSteering>): Promise<ResearchSteering | undefined> {
    const account = this.accounts.get(accountKey);
    if (account === undefined) return undefined;
    const steering = { ...researchSteeringOf(account),
      ...Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)) } as ResearchSteering;
    this.accounts.set(accountKey, { ...account, researchSteering: steering });
    return { ...steering };
  }

  /**
   * The record as saved: with the account's settings, which only their setters change (setPlainAnswerNote,
   * setDetailedLessonReports and setFindingsSave).
   */
  private keepingSettings(record: ResearchUseAccountRecord): ResearchUseAccountRecord {
    const {
      plainAnswerNote: _ignoredNote,
      detailedLessonReports: _ignoredReports,
      findingsSave: _ignoredFindingsSave,
      researchSteering: _ignoredSteering,
      ...saved
    } = structuredClone(record);
    const prior = this.accounts.get(record.accountKey);
    return {
      ...saved,
      ...(prior?.plainAnswerNote === undefined ? {} : { plainAnswerNote: prior.plainAnswerNote }),
      ...(prior?.detailedLessonReports === undefined ? {} : { detailedLessonReports: prior.detailedLessonReports }),
      ...(prior?.findingsSave === undefined ? {} : { findingsSave: prior.findingsSave }),
      ...(prior?.researchSteering === undefined ? {} : { researchSteering: { ...prior.researchSteering } }),
    };
  }

  async hasActivePrivateEntitlement(
    accountKey: string,
    at: string,
  ): Promise<boolean> {
    return [...this.entitlements.values()].some((record) =>
      record.accountKey === accountKey &&
      record.status === "ACTIVE" &&
      record.grantedAt <= at &&
      (record.expiresAt === null || record.expiresAt > at)
    );
  }

  async insertProposal(
    record: ResearchContributionProposalRecord,
  ): Promise<ProposalInsertResult> {
    const account = this.accounts.get(record.accountKey);
    if (account === undefined || account.status !== "ACTIVE" || account.mode === null) {
      throw new Error("RESEARCH_PROPOSAL_ACCOUNT_NOT_FREE_ACTIVE");
    }
    // As the database trigger: a free contributor's proposal carries no consent, and a paid private account's is a
    // research map filed with the user's yes (owner answer 143a).
    const consent = record.consentReceiptSha256 ?? null;
    if (account.mode === "FREE_CONTRIBUTOR" && consent !== null) {
      throw new Error(CONSENT_NOT_PAID_PRIVATE);
    }
    if (account.mode === "PAID_PRIVATE" && (record.proposalKind !== "RESEARCH_FRONTIER" || consent === null)) {
      throw new Error(PAID_PRIVATE_CONSENT_REQUIRED);
    }
    const replay = [...this.proposals.values()].find((candidate) =>
      candidate.accountKey === record.accountKey &&
      candidate.proposalKind === record.proposalKind &&
      candidate.payloadSha256 === record.payloadSha256
    );
    if (replay !== undefined) {
      return { status: "idempotent_replay", record: structuredClone(replay) };
    }
    // One yes files one map, as the database's unique index on the consent holds it.
    if (consent !== null && [...this.proposals.values()].some(({ consentReceiptSha256 }) => consentReceiptSha256 === consent)) {
      throw new Error(CONSENT_ALREADY_USED);
    }
    if (record.supersedesProposalId !== undefined && record.supersedesProposalId !== null) {
      const superseded = this.proposals.get(record.supersedesProposalId);
      if (
        superseded === undefined || superseded.accountKey !== record.accountKey ||
        superseded.proposalKind !== record.proposalKind || superseded.status !== "PENDING_REVIEW" ||
        superseded.proposalId === record.proposalId
      ) {
        throw new Error(SUPERSEDES_NOT_OWN_PENDING);
      }
    }
    this.proposals.set(record.proposalId, structuredClone(record));
    return { status: "inserted", record: structuredClone(record) };
  }

  async findOwnProposalByIdempotencyKey(
    accountKey: string,
    proposalKind: ResearchContributionProposalKind,
    idempotencyKey: string,
  ): Promise<ResearchContributionProposalRecord | null> {
    const filed = [...this.proposals.values()]
      .filter((proposal) =>
        proposal.accountKey === accountKey && proposal.proposalKind === proposalKind &&
        proposal.payload.idempotencyKey === idempotencyKey && proposal.status !== "WITHDRAWN")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    return filed === undefined ? null : structuredClone(filed);
  }

  async revokeAccount(accountRecord: ResearchUseAccountRecord): Promise<number> {
    let withdrawn = 0;
    for (const [proposalId, proposal] of this.proposals) {
      if (
        proposal.accountKey !== accountRecord.accountKey ||
        proposal.status !== "PENDING_REVIEW"
      ) {
        continue;
      }
      this.proposals.set(proposalId, {
        ...proposal,
        status: "WITHDRAWN",
        reviewedAt: accountRecord.updatedAt,
        reviewReason: "contributor_access_revoked",
      });
      withdrawn += 1;
    }
    this.accounts.set(accountRecord.accountKey, this.keepingSettings(accountRecord));
    return withdrawn;
  }

  grantPrivateEntitlement(record: ResearchPrivateEntitlementRecord): void {
    this.entitlements.set(record.entitlementId, structuredClone(record));
  }

  allAccounts(): ResearchUseAccountRecord[] {
    return structuredClone([...this.accounts.values()]);
  }

  allProposals(): ResearchContributionProposalRecord[] {
    return structuredClone([...this.proposals.values()]);
  }
}

export interface PostgresResearchContributorAccessStoreOptions {
  connectionString: string;
  schema?: string;
  ssl?: PoolConfig["ssl"];
  connectionTimeoutMillis?: number;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

export class PostgresResearchContributorAccessStore
implements ResearchContributorAccessStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresResearchContributorAccessStoreOptions) {
    this.schema = assertSafeSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
      query_timeout: options.queryTimeoutMillis,
      statement_timeout: options.statementTimeoutMillis,
    });
  }

  /**
   * The call record (owner answer 280a) on this store's pool and schema, so the server opens no second pool; this store
   * keeps the pool's lifetime.
   */
  callRecordStore(): PostgresResearchCallRecordStore {
    return new PostgresResearchCallRecordStore(this.pool, this.schema);
  }

  async getAccount(accountKey: string): Promise<ResearchUseAccountRecord | null> {
    const result = await this.pool.query<ResearchUseAccountRow>(
      `SELECT account_key, status, mode, notice_version, agreement_json,
              activated_at, revoked_at, created_at, updated_at,
              plain_answer_note, detailed_lesson_reports, findings_save, notice_accepted_by,
              research_style, check_back_minutes, adjustment_detail
         FROM ${this.schema}.research_use_accounts
        WHERE account_key = $1`,
      [accountKey],
    );
    return result.rowCount === 0 ? null : accountFromRow(result.rows[0]!);
  }

  // saveAccount and revokeAccount leave plain_answer_note as it is: a new row takes the column's default, on.
  async setPlainAnswerNote(accountKey: string, enabled: boolean): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${this.schema}.research_use_accounts
          SET plain_answer_note = $2
        WHERE account_key = $1`,
      [accountKey, enabled],
    );
    return result.rowCount !== 0;
  }

  // saveAccount and revokeAccount leave detailed_lesson_reports as it is: a new row takes the column's default, off.
  async setDetailedLessonReports(accountKey: string, enabled: boolean): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${this.schema}.research_use_accounts
          SET detailed_lesson_reports = $2
        WHERE account_key = $1`,
      [accountKey, enabled],
    );
    return result.rowCount !== 0;
  }

  // saveAccount and revokeAccount leave findings_save as it is: a new row takes the column's default, on.
  async setFindingsSave(accountKey: string, enabled: boolean): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${this.schema}.research_use_accounts
          SET findings_save = $2
        WHERE account_key = $1`,
      [accountKey, enabled],
    );
    return result.rowCount !== 0;
  }

  // saveAccount and revokeAccount leave the research style as it is: a new row takes the columns' defaults (0033). One
  // statement changes the parts named and keeps the others as stored at that moment, so concurrent changes to different
  // parts both stay.
  async setResearchSteering(accountKey: string, change: Partial<ResearchSteering>): Promise<ResearchSteering | undefined> {
    const result = await this.pool.query<{ research_style: string; check_back_minutes: number; adjustment_detail: string }>(
      `UPDATE ${this.schema}.research_use_accounts
          SET research_style = COALESCE($2::text, research_style),
              check_back_minutes = COALESCE($3::integer, check_back_minutes),
              adjustment_detail = COALESCE($4::text, adjustment_detail)
        WHERE account_key = $1
        RETURNING research_style, check_back_minutes, adjustment_detail`,
      [accountKey, change.style ?? null, change.checkBackMinutes ?? null, change.adjustmentDetail ?? null],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : researchSteeringSchema.parse({ style: row.research_style,
      checkBackMinutes: row.check_back_minutes, adjustmentDetail: row.adjustment_detail });
  }

  // How the notice was accepted goes with the acceptance time, activated_at: migration 0031's trigger clears the pair
  // whenever a write changes activated_at without it, as an image from before 0031 does, so a stale value never stays.
  async saveAccount(record: ResearchUseAccountRecord): Promise<void> {
    const acceptedBy = record.noticeAcceptedBy ?? null;
    await this.pool.query(
      `INSERT INTO ${this.schema}.research_use_accounts
        (account_key, status, mode, notice_version, agreement_json,
         activated_at, revoked_at, created_at, updated_at, notice_accepted_by, notice_accepted_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (account_key) DO UPDATE SET
         status = EXCLUDED.status,
         mode = EXCLUDED.mode,
         notice_version = EXCLUDED.notice_version,
         agreement_json = EXCLUDED.agreement_json,
         activated_at = EXCLUDED.activated_at,
         revoked_at = EXCLUDED.revoked_at,
         updated_at = EXCLUDED.updated_at,
         notice_accepted_by = EXCLUDED.notice_accepted_by,
         notice_accepted_at = EXCLUDED.notice_accepted_at`,
      [
        record.accountKey,
        record.status,
        record.mode,
        record.noticeVersion,
        JSON.stringify(record.agreement ?? {}),
        record.activatedAt,
        record.revokedAt,
        record.createdAt,
        record.updatedAt,
        acceptedBy,
        acceptedBy === null ? null : record.activatedAt,
      ],
    );
  }

  // Only onto the row as it was read: the same status, mode, notice version and update time, the time compared to the
  // millisecond, as AskRigor writes it. A revoke or a mode switch in between changes them, and nothing is written.
  async saveAccountIfUnchanged(record: ResearchUseAccountRecord, read: ResearchUseAccountRecord): Promise<boolean> {
    const acceptedBy = record.noticeAcceptedBy ?? null;
    const result = await this.pool.query(
      `UPDATE ${this.schema}.research_use_accounts
          SET status = $2, mode = $3, notice_version = $4, agreement_json = $5::jsonb, activated_at = $6,
              revoked_at = $7, updated_at = $8, notice_accepted_by = $9, notice_accepted_at = $10
        WHERE account_key = $1
          AND status = $11
          AND mode IS NOT DISTINCT FROM $12
          AND notice_version IS NOT DISTINCT FROM $13
          AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $14::timestamptz)`,
      [
        record.accountKey,
        record.status,
        record.mode,
        record.noticeVersion,
        JSON.stringify(record.agreement ?? {}),
        record.activatedAt,
        record.revokedAt,
        record.updatedAt,
        acceptedBy,
        acceptedBy === null ? null : record.activatedAt,
        read.status,
        read.mode,
        read.noticeVersion,
        read.updatedAt,
      ],
    );
    return result.rowCount === 1;
  }

  async hasActivePrivateEntitlement(
    accountKey: string,
    at: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
         FROM ${this.schema}.research_private_entitlements
        WHERE account_key = $1
          AND status = 'ACTIVE'
          AND granted_at <= $2
          AND (expires_at IS NULL OR expires_at > $2)
        LIMIT 1`,
      [accountKey, at],
    );
    return result.rowCount !== 0;
  }

  async insertProposal(
    record: ResearchContributionProposalRecord,
  ): Promise<ProposalInsertResult> {
    const replay = async () => this.pool.query<ResearchContributionProposalRow>(
      `SELECT ${PROPOSAL_COLUMNS}
         FROM ${this.schema}.research_contribution_proposals
        WHERE account_key = $1 AND proposal_kind = $2 AND payload_sha256 = $3`,
      [record.accountKey, record.proposalKind, record.payloadSha256],
    );
    // The same record again is a replay before its supersession is checked, as it is without one.
    const supersedes = record.supersedesProposalId ?? null;
    if (supersedes !== null) {
      const prior = await replay();
      if (prior.rowCount !== 0) return { status: "idempotent_replay", record: proposalFromRow(prior.rows[0]!) };
    }
    let result: Awaited<ReturnType<typeof replay>>;
    try {
      result = await this.pool.query<ResearchContributionProposalRow>(
        `INSERT INTO ${this.schema}.research_contribution_proposals
          (proposal_id, account_key, proposal_kind, payload_sha256, payload_json,
           privacy_boundary_json, partial, status, created_at, reviewed_at,
           review_reason, supersedes_proposal_id, consent_receipt_sha256)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NULL, NULL, $10::uuid, $11)
         ON CONFLICT (account_key, proposal_kind, payload_sha256) DO NOTHING
         RETURNING ${PROPOSAL_COLUMNS}`,
        [
          record.proposalId,
          record.accountKey,
          record.proposalKind,
          record.payloadSha256,
          JSON.stringify(record.payload),
          JSON.stringify(record.privacyBoundary),
          record.partial,
          record.status,
          record.createdAt,
          supersedes,
          record.consentReceiptSha256 ?? null,
        ],
      );
    } catch (error) {
      // One yes files one map (migration 0014): another record under the same consent meets its unique index.
      if (uniqueViolation(error, CONSENT_INDEX)) throw new Error(CONSENT_ALREADY_USED);
      throw error;
    }
    if (result.rowCount !== 0) {
      return { status: "inserted", record: proposalFromRow(result.rows[0]!) };
    }
    const stored = await replay();
    if (stored.rowCount === 0) throw new Error("PROPOSAL_REPLAY_LOOKUP_FAILED");
    return {
      status: "idempotent_replay",
      record: proposalFromRow(stored.rows[0]!),
    };
  }

  async findOwnProposalByIdempotencyKey(
    accountKey: string,
    proposalKind: ResearchContributionProposalKind,
    idempotencyKey: string,
  ): Promise<ResearchContributionProposalRecord | null> {
    const result = await this.pool.query<ResearchContributionProposalRow>(
      `SELECT ${PROPOSAL_COLUMNS}
         FROM ${this.schema}.research_contribution_proposals
        WHERE account_key = $1 AND proposal_kind = $2
          AND payload_json ->> 'idempotencyKey' = $3
          AND status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED')
        ORDER BY created_at, proposal_id
        LIMIT 1`,
      [accountKey, proposalKind, idempotencyKey],
    );
    return result.rowCount === 0 ? null : proposalFromRow(result.rows[0]!);
  }

  async revokeAccount(record: ResearchUseAccountRecord): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ${this.schema}.research_use_accounts
          (account_key, status, mode, notice_version, agreement_json,
           activated_at, revoked_at, created_at, updated_at, notice_accepted_by, notice_accepted_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, NULL, NULL)
         ON CONFLICT (account_key) DO UPDATE SET
           status = EXCLUDED.status,
           mode = EXCLUDED.mode,
           notice_version = EXCLUDED.notice_version,
           agreement_json = EXCLUDED.agreement_json,
           activated_at = EXCLUDED.activated_at,
           revoked_at = EXCLUDED.revoked_at,
           updated_at = EXCLUDED.updated_at,
           notice_accepted_by = NULL,
           notice_accepted_at = NULL`,
        [
          record.accountKey,
          record.status,
          record.mode,
          record.noticeVersion,
          JSON.stringify(record.agreement ?? {}),
          record.activatedAt,
          record.revokedAt,
          record.createdAt,
          record.updatedAt,
        ],
      );
      const result = await client.query<{ withdrawn_count: number }>(
        `SELECT ${this.schema}.withdraw_pending_research_contribution_proposals(
           $1::text, $2::timestamptz
         ) AS withdrawn_count`,
        [record.accountKey, record.updatedAt],
      );
      await client.query("COMMIT");
      return result.rows[0]?.withdrawn_count ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface ResearchUseAccountRow {
  account_key: string;
  status: "ACTIVE" | "REVOKED";
  mode: ResearchUseMode | null;
  notice_version: string | null;
  agreement_json: Record<string, unknown>;
  activated_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  plain_answer_note: boolean;
  detailed_lesson_reports: boolean;
  findings_save: boolean;
  notice_accepted_by: string | null;
  research_style: string;
  check_back_minutes: number;
  adjustment_detail: string;
}

const PROPOSAL_COLUMNS = `proposal_id, account_key, proposal_kind, payload_sha256,
              payload_json, privacy_boundary_json, partial, status,
              created_at, reviewed_at, review_reason, supersedes_proposal_id,
              consent_receipt_sha256`;

/** Migration 0014's unique index: one research map per paid private yes. */
const CONSENT_INDEX = "research_contribution_proposals_consent_idx";

function uniqueViolation(error: unknown, index: string): boolean {
  return typeof error === "object" && error !== null &&
    (error as { code?: unknown }).code === "23505" && (error as { constraint?: unknown }).constraint === index;
}

interface ResearchContributionProposalRow {
  proposal_id: string;
  account_key: string;
  proposal_kind: ResearchContributionProposalKind;
  payload_sha256: string;
  payload_json: unknown;
  privacy_boundary_json: unknown;
  partial: boolean;
  status: ResearchContributionProposalRecord["status"];
  created_at: Date | string;
  reviewed_at: Date | string | null;
  review_reason: string | null;
  supersedes_proposal_id: string | null;
  consent_receipt_sha256: string | null;
}

function accountFromRow(row: ResearchUseAccountRow): ResearchUseAccountRecord {
  const noticeVersion = row.notice_version === null
    ? null
    : researchUseNoticeVersionSchema.parse(row.notice_version);
  const agreement = Object.keys(row.agreement_json).length === 0
    ? null
    : storedFreeContributorAgreementSchema.parse(row.agreement_json);
  return {
    accountKey: row.account_key,
    status: row.status,
    mode: row.mode === null ? null : researchUseModeSchema.parse(row.mode),
    noticeVersion,
    agreement,
    activatedAt: nullableTimestamp(row.activated_at),
    revokedAt: nullableTimestamp(row.revoked_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    plainAnswerNote: row.plain_answer_note !== false,
    // Only an explicit true turns detailed lesson reports on.
    detailedLessonReports: row.detailed_lesson_reports === true,
    findingsSave: row.findings_save !== false,
    noticeAcceptedBy: row.notice_accepted_by === null ? null : noticeAcceptedBySchema.parse(row.notice_accepted_by),
    researchSteering: researchSteeringSchema.parse({
      style: row.research_style,
      checkBackMinutes: row.check_back_minutes,
      adjustmentDetail: row.adjustment_detail,
    }),
  };
}

function proposalFromRow(
  row: ResearchContributionProposalRow,
): ResearchContributionProposalRecord {
  const prepared = prepareResearchContributionProposal(
    row.proposal_kind,
    row.payload_json,
  );
  if (prepared.payloadSha256 !== row.payload_sha256) {
    throw new Error("PROPOSAL_PAYLOAD_SHA256_MISMATCH");
  }
  return {
    proposalId: row.proposal_id,
    accountKey: row.account_key,
    proposalKind: row.proposal_kind,
    payloadSha256: row.payload_sha256,
    payload: prepared.payload,
    privacyBoundary: contributionPrivacyBoundarySchema.parse(
      row.privacy_boundary_json,
    ),
    partial: row.partial,
    status: row.status,
    createdAt: timestamp(row.created_at),
    reviewedAt: nullableTimestamp(row.reviewed_at),
    reviewReason: row.review_reason,
    supersedesProposalId: row.supersedes_proposal_id,
    consentReceiptSha256: row.consent_receipt_sha256,
  };
}

export function prepareResearchContributionProposal(
  kind: ResearchContributionProposalKind,
  payload: unknown,
): {
  payload: LivingEvidenceContribution | ResearchFrontierContribution | TopicLinkContribution;
  payloadSha256: string;
  partial: boolean;
} {
  if (kind === "TOPIC_LINK") {
    const prepared = prepareTopicLinkContribution(payload);
    return { payload: prepared.contribution, payloadSha256: prepared.payloadSha256, partial: false };
  }
  if (kind === "RESEARCH_FRONTIER") {
    const prepared = prepareFrontierContribution(payload);
    for (const candidate of prepared.contribution.frontier.candidateVersions) {
      assertNoSandboxIdentifiers(candidate.identifiers);
    }
    return {
      payload: prepared.contribution,
      payloadSha256: prepared.payloadSha256,
      partial: prepared.contribution.frontier.passes.some(({ status }) =>
        status !== "complete"
      ),
    };
  }
  const prepared = prepareContribution(payload);
  const contribution = prepared.contribution;
  if (contribution.source !== null) {
    assertNoSandboxIdentifiers(contribution.source.identifiers);
  }
  if (
    contribution.source === null ||
    !SHARED_ANALYSIS_KINDS.includes(contribution.analysis.analysisKind) ||
    !SHARED_SOURCE_KINDS.includes(contribution.source.sourceKind)
  ) {
    throw new ResearchAccessError(
      "CONTRIBUTION_PRIVACY_REJECTED",
      "Shared analysis proposals must be source-bound study or review analyses, not personal or topic-only narratives.",
    );
  }
  if (contribution.source.identifiers.some(({ scheme, value }) => isCommunityIdentifier(scheme, value))) {
    throw new ResearchAccessError(
      "CONTRIBUTION_PRIVACY_REJECTED",
      "YouTube and community sources are outside the shared proposal boundary.",
    );
  }
  return {
    payload: contribution,
    payloadSha256: prepared.payloadSha256,
    partial:
      contribution.analysis.captureStatus === "partial_historical_capture" ||
      contribution.source.accessStatus !== "complete",
  };
}

function assertNoSandboxIdentifiers(identifiers: ReadonlyArray<{ value: string }>): void {
  if (identifiers.some(({ value }) => isSandboxLocator(value))) {
    throw new ResearchAccessError(
      "CONTRIBUTION_PRIVACY_REJECTED",
      "A sandbox link points into another session and can never be opened.",
    );
  }
}

/**
 * The consent a paid private account's input carries for this research's map (owner answer 143a): the SHA-256 of its
 * finalizationReceipt, when the input is a RESEARCH_FRONTIER proposal with the user's consent and the caller checked
 * that same receipt; otherwise undefined, and nothing is filed.
 */
function paidPrivateMapConsent(
  input: unknown,
  checked: { receiptSha256: string } | undefined,
): string | undefined {
  if (checked === undefined || input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const { proposalKind, userConsent, finalizationReceipt } = input as Record<string, unknown>;
  if (
    proposalKind !== "RESEARCH_FRONTIER" || userConsent !== RESEARCH_MAP_CONSENT ||
    typeof finalizationReceipt !== "string"
  ) {
    return undefined;
  }
  const receiptSha256 = sha256(finalizationReceipt.trim());
  return receiptSha256 === checked.receiptSha256 ? receiptSha256 : undefined;
}

function assertNoObviousPrivateContactText(value: unknown): void {
  const reject = (): never => {
    throw new ResearchAccessError(
      "CONTRIBUTION_PRIVACY_REJECTED",
      "The proposal contains an obvious contact, address, or credential pattern.",
    );
  };
  walkStrings(value, [], (text, path) => {
    if (isIdentifierValuePath(path)) return;
    if (contactPatternKind(text) !== undefined) reject();
  });
  // Free-form names (receipts[].details) are stored too, so a name is screened like a value.
  walkKeys(value, (key) => {
    if (contactPatternKind(key) !== undefined) reject();
  });
}

function walkKeys(value: unknown, inspect: (key: string) => void): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child) => walkKeys(child, inspect));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    inspect(key);
    walkKeys(child, inspect);
  }
}

function walkStrings(
  value: unknown,
  path: string[],
  inspect: (value: string, path: string[]) => void,
): void {
  if (typeof value === "string") {
    inspect(value, path);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkStrings(child, [...path, String(index)], inspect));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    walkStrings(child, [...path, key], inspect);
  }
}

/**
 * The account key the connector derives from a signed-in subject: an HMAC of the subject under the research identity
 * secret. The Atlas's web sign-in (decision 171, section 4D) derives the same key, so a person is one account in both.
 */
export function researchAccountKeyForSubject(identitySecret: Uint8Array, subject: string): string {
  if (identitySecret.byteLength < 32) throw new Error("RESEARCH_IDENTITY_SECRET_TOO_SHORT");
  const normalized = normalizeOAuthSubject(subject);
  return createHmac("sha256", Buffer.from(identitySecret))
    .update("askrigor:research-use-account:v1\0", "utf8")
    .update(normalized, "utf8")
    .digest("hex");
}

function normalizeOAuthSubject(subject: string): string {
  if (
    subject.trim() !== subject ||
    !/^[^\s\u0000-\u001f\u007f]{1,512}$/u.test(subject)
  ) {
    throw new Error("OAUTH_SUBJECT_INVALID");
  }
  return subject;
}

/** An account key as researchAccountKeyForSubject writes it: 64 lowercase hexadecimal characters. */
function accountKeyChecked(accountKey: string): string {
  if (!/^[a-f0-9]{64}$/u.test(accountKey)) {
    throw new ResearchAccessError("INVALID_REQUEST", "The research account key is not one AskRigor derives.");
  }
  return accountKey;
}

/** An active free account whose yes no longer covers the current notice: a version since collects or publishes more. */
function outdatedFreeNotice(account: ResearchUseAccountRecord): boolean {
  return account.status === "ACTIVE" &&
    account.mode === "FREE_CONTRIBUTOR" &&
    !researchUseNoticeCovered(account.noticeVersion);
}

/** An active free account's yes, as inspect shows it; undefined for any other account. */
function noticeAcceptance(account: ResearchUseAccountRecord): ResearchUseNoticeAcceptance | undefined {
  if (account.status !== "ACTIVE" || account.mode !== "FREE_CONTRIBUTOR" || account.noticeVersion === null ||
      account.activatedAt === null || !researchUseNoticeCovered(account.noticeVersion)) return undefined;
  return {
    noticeVersion: account.noticeVersion,
    acceptedAt: account.activatedAt,
    acceptedBy: account.noticeAcceptedBy ?? null,
    current: account.noticeVersion === RESEARCH_USE_NOTICE_VERSION ? "accepted" : "carried_forward",
  };
}

function accessView(
  status: ResearchAccessView["status"],
  mode: ResearchUseMode | null,
  activatedAt: string | null,
  updatedAt: string | null,
  acceptance?: ResearchUseNoticeAcceptance,
): ResearchAccessView {
  return {
    status,
    mode,
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    notice: RESEARCH_USE_NOTICE,
    ...(acceptance === undefined ? {} : { acceptance }),
    contributionRequired: mode === "FREE_CONTRIBUTOR",
    privateEntitlementRequired: mode === "PAID_PRIVATE" || status === "UNENROLLED",
    paidCheckoutAvailable: false,
    activatedAt,
    updatedAt,
  };
}

function assertSafeSchema(schema: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error("INVALID_POSTGRES_SCHEMA");
  }
  return schema;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}
