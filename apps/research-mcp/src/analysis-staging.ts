import {
  ResearchAccessError,
  sha256,
  stableJson,
  type LivingEvidenceContribution,
} from "@askrigor/evidence-repository";
import { getProtocolManifest, type ProtocolManifest } from "@askrigor/protocol";
import {
  checkRetractionStatus,
  type AuditableDocumentIndex,
  type CrossrefConfig,
} from "@askrigor/sources";
import { z } from "zod";

import { createValidatedReviewAuditContribution } from "./actions/review-audit-contribution.js";
import type { ReviewMethodAuditReceipt } from "./actions/review-method-audit.js";
import { createValidatedStudyAuditContribution } from "./actions/study-audit-reuse.js";
import type { StudyMethodAuditReceipt } from "./actions/study-method-audit.js";

/**
 * Free contributors' validated study and review analyses, held between the
 * method check and the final check.
 *
 * Owner decision (30 Sep): the free tier saves what AskRigor learns from its
 * users' research, for the owner's review, the same way as the findings
 * cards. A validated analysis is built into its living-evidence contribution
 * when the check passes, while the exact document is still at hand, and held
 * here; when the final check passes, the server sends the account's held
 * analyses to the review inbox itself, so nothing depends on the AI sending
 * them. Only free contributor accounts are held. Entries hold the
 * contribution (structured findings and source identity, never the source's
 * text) under the account's pseudonymous key, and are dropped after 24 hours,
 * past the capacity, or on restart.
 */

const STAGING_TTL_MS = 24 * 60 * 60 * 1000;
const STAGING_MAX_ENTRIES = 500;
// A held analysis records an integrity check, due again in 30 days.
const INTEGRITY_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

export const ANALYSIS_NOT_SAVED_REASONS = [
  "no_doi",
  "integrity_not_current",
  "integrity_check_unavailable",
  "contribution_invalid",
  "review_inbox_unavailable",
  "rejected_by_privacy_check",
] as const;
export type AnalysisNotSavedReason = typeof ANALYSIS_NOT_SAVED_REASONS[number];

export const analysesSavedSchema = z.object({
  saved: z.number().int().nonnegative(),
  already_saved: z.number().int().nonnegative(),
  unconfirmed: z.number().int().nonnegative(),
  not_saved: z.array(z.object({
    reason: z.enum(ANALYSIS_NOT_SAVED_REASONS),
    count: z.number().int().positive(),
  }).strict()),
}).strict();
export type AnalysesSaved = z.output<typeof analysesSavedSchema>;

export type StagedAnalysis =
  | { ready: true; contribution: LivingEvidenceContribution }
  | { ready: false; reason: AnalysisNotSavedReason };

interface Entry {
  accountKey: string;
  key: string;
  stagedAtMs: number;
  analysis: Promise<StagedAnalysis>;
}

export class AnalysisStaging {
  private entries: Entry[] = [];

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = STAGING_TTL_MS,
    private readonly maxEntries = STAGING_MAX_ENTRIES,
  ) {}

  /** Holds one analysis; checking the same audit again replaces it. */
  stage(accountKey: string, key: string, analysis: Promise<StagedAnalysis>): void {
    this.prune();
    this.entries = this.entries.filter((entry) => entry.accountKey !== accountKey || entry.key !== key);
    this.entries.push({ accountKey, key, stagedAtMs: this.now(), analysis });
    // Past capacity the oldest go first.
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  /** Removes and returns the account's held analyses. */
  take(accountKey: string): Array<Promise<StagedAnalysis>> {
    this.prune();
    const taken = this.entries.filter((entry) => entry.accountKey === accountKey);
    this.entries = this.entries.filter((entry) => entry.accountKey !== accountKey);
    return taken.map(({ analysis }) => analysis);
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs;
    this.entries = this.entries.filter(({ stagedAtMs }) => stagedAtMs > cutoff);
  }
}

export interface BuildStagedAnalysisInput {
  kind: "study" | "review";
  index: AuditableDocumentIndex;
  auditReceipt: StudyMethodAuditReceipt | ReviewMethodAuditReceipt;
  crossref: CrossrefConfig;
  now?: () => Date;
  checkIntegrity?: typeof checkRetractionStatus;
  protocolManifests?: () => Promise<ProtocolManifest[]>;
}

/**
 * Builds the contribution for one validated analysis. Its freshness record
 * needs a current integrity check, so the server asks Crossref first. Only a
 * source with a DOI (as the admin import requires) and with no retraction,
 * correction or concern record is held. Never throws.
 */
export async function buildStagedAnalysis(input: BuildStagedAnalysisInput): Promise<StagedAnalysis> {
  const doi = input.index.source.doi;
  if (doi === undefined) return { ready: false, reason: "no_doi" };
  try {
    const integrity = await (input.checkIntegrity ?? checkRetractionStatus)(doi, input.crossref);
    if (integrity.error !== undefined) return { ready: false, reason: "integrity_check_unavailable" };
    if (integrity.data.status !== "no_retraction_record_found") return { ready: false, reason: "integrity_not_current" };
    const checked = (input.now ?? (() => new Date()))();
    const checkedAt = checked.toISOString();
    const freshness = {
      checkedAt,
      nextDueAt: new Date(checked.getTime() + INTEGRITY_RECHECK_MS).toISOString(),
      receiptSha256: sha256(stableJson(integrity.data)),
    };
    const protocolManifests = await (input.protocolManifests ?? currentProtocolManifests)();
    // The validation is the analysis's only recorded moment.
    const common = { index: input.index, protocolManifests, startedAt: checkedAt, completedAt: checkedAt, freshness };
    return {
      ready: true,
      contribution: input.kind === "study"
        ? createValidatedStudyAuditContribution({ ...common, auditReceipt: input.auditReceipt as StudyMethodAuditReceipt })
        : createValidatedReviewAuditContribution({ ...common, auditReceipt: input.auditReceipt as ReviewMethodAuditReceipt }),
    };
  } catch {
    return { ready: false, reason: "contribution_invalid" };
  }
}

export type SubmitAnalysis = (contribution: LivingEvidenceContribution) => Promise<"inserted" | "idempotent_replay">;

/**
 * Sends held analyses to the review inbox. A submission still running at the
 * deadline counts as unconfirmed and carries on by itself; a failed one is
 * reported, never retried here.
 */
export async function saveStagedAnalyses(
  analyses: ReadonlyArray<Promise<StagedAnalysis>>,
  submit: SubmitAnalysis,
  deadlineMs: number,
): Promise<AnalysesSaved> {
  type Outcome = "saved" | "already_saved" | AnalysisNotSavedReason;
  const outcomes = analyses.map(async (pending): Promise<Outcome> => {
    const analysis = await pending;
    if (!analysis.ready) return analysis.reason;
    try {
      return await submit(analysis.contribution) === "inserted" ? "saved" : "already_saved";
    } catch (error) {
      return error instanceof ResearchAccessError && error.code === "CONTRIBUTION_PRIVACY_REJECTED"
        ? "rejected_by_privacy_check"
        : "review_inbox_unavailable";
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"unconfirmed">((resolve) => {
    timer = setTimeout(() => resolve("unconfirmed"), deadlineMs);
  });
  const settled = await Promise.all(outcomes.map((outcome) => Promise.race([outcome, deadline])))
    .finally(() => clearTimeout(timer));
  const notSaved = new Map<AnalysisNotSavedReason, number>();
  for (const outcome of settled) {
    if (outcome !== "saved" && outcome !== "already_saved" && outcome !== "unconfirmed") {
      notSaved.set(outcome, (notSaved.get(outcome) ?? 0) + 1);
    }
  }
  return analysesSavedSchema.parse({
    saved: settled.filter((outcome) => outcome === "saved").length,
    already_saved: settled.filter((outcome) => outcome === "already_saved").length,
    unconfirmed: settled.filter((outcome) => outcome === "unconfirmed").length,
    not_saved: [...notSaved].map(([reason, count]) => ({ reason, count })),
  });
}

async function currentProtocolManifests(): Promise<ProtocolManifest[]> {
  return Promise.all([getProtocolManifest("universal"), getProtocolManifest("hrp")]);
}
