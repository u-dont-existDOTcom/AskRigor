import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  RELATED_PROPOSAL_KEY_KINDS,
  RELATED_RECORDS_SHOWN,
  RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES,
  ResearchContributionReviewError,
  ResearchContributionReviewService,
  type CanonicalIdentityReader,
  type ResearchContributionReviewView,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { CASE_REVIEW_SCOPE } from "./oauth-resource-server.js";
import type { ResearchOperationExtra } from "./research-operation.js";

export const researchContributionReviewInputSchema = z.object({
  action: z.enum(["inspect", "status", "accept", "reject"]),
  proposalId: z.string().uuid().optional(),
  expectedPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  reason: z.string().trim().min(1).max(2_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "inspect") {
    if (value.expectedPayloadSha256 !== undefined || value.reason !== undefined) {
      context.addIssue({
        code: "custom",
        message: "inspect accepts only an optional proposalId",
      });
    }
    return;
  }
  if (value.proposalId === undefined) {
    context.addIssue({ code: "custom", message: "proposalId is required" });
  }
  if (value.action === "status") {
    if (value.expectedPayloadSha256 !== undefined || value.reason !== undefined) {
      context.addIssue({
        code: "custom",
        message: "status accepts only proposalId",
      });
    }
    return;
  }
  if (value.expectedPayloadSha256 === undefined || value.reason === undefined) {
    context.addIssue({
      code: "custom",
      message: "accept and reject require the reviewed payload hash and reason",
    });
  }
});

const promotionSchema = z.object({
  promotionId: z.string().uuid(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  receipt: z.record(z.string(), z.unknown()).nullable(),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  failureCode: z.enum(RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES).nullable(),
  failedAt: z.string().nullable(),
}).strict();

const proposalSchema = z.object({
  proposalId: z.string().uuid(),
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"]),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  payload: z.record(z.string(), z.unknown()),
  privacyBoundary: z.record(z.string(), z.boolean()),
  partial: z.boolean(),
  status: z.enum(["PENDING_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"]),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  reviewReason: z.string().nullable(),
  promotion: promotionSchema.nullable(),
  supersedesProposalId: z.string().uuid().nullable(),
  supersededByProposalIds: z.array(z.string().uuid()),
  // Owner answer 138b: what shares this proposal's identities, by ID only, and a dry run of the writer's identity checks.
  related: z.object({
    proposals: z.array(z.object({
      proposalId: z.string().uuid(),
      proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"]),
      status: z.enum(["PENDING_REVIEW", "ACCEPTED"]),
      promotionStatus: z.literal("PENDING").nullable(),
      shared: z.array(z.enum(RELATED_PROPOSAL_KEY_KINDS)),
    }).strict()).max(RELATED_RECORDS_SHOWN),
    proposalsNotShown: z.number().int().nonnegative(),
    canonical: z.object({
      records: z.array(z.object({
        record: z.enum(["topic", "question", "frontier", "frontier_candidate", "source_family"]),
        id: z.string().uuid(),
        frontierId: z.string().uuid().optional(),
        shared: z.enum(["topic_key", "question_text_and_dimensions", "question_id", "frontier_id", "identifier"]),
      }).strict()).max(RELATED_RECORDS_SHOWN),
      notShown: z.number().int().nonnegative(),
    }).strict().nullable(),
  }).strict(),
  preflight: z.object({
    status: z.enum(["clear", "conflicts", "replay", "unavailable"]),
    conflicts: z.array(z.object({
      code: z.enum(RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES),
      path: z.string().min(1).max(300),
    }).strict()).optional(),
  }).strict().nullable(),
}).strict();

const reviewErrorSchema = z.object({
  code: z.enum([
    "authorization_required",
    "insufficient_scope",
    "review_service_unavailable",
    "proposal_not_found",
    "payload_mismatch",
    "review_conflict",
    "promotion_intent_missing",
    "invalid_request",
  ]),
  message: z.string(),
}).strict();

export const researchContributionReviewOutputSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum([
    "pending_review",
    "accepted_pending_promotion",
    "accepted_promoted",
    "accepted_promotion_failed",
    "rejected",
    "withdrawn",
    "no_pending_proposal",
  ]).optional(),
  proposal: proposalSchema.optional(),
  canonicalEvidenceChangedByThisCall: z.literal(false).optional(),
  error: reviewErrorSchema.optional(),
}).strict();

export interface ResearchContributionReviewToolOptions {
  service?: ResearchContributionReviewService;
  resourceMetadataUrl?: URL;
  allowedReviewerSubjects?: ReadonlySet<string>;
  /** The canonical store's read-only identity view, for the related records and the promotion preflight. */
  canonical?: CanonicalIdentityReader;
}

export function createResearchContributionReviewHandler(
  options: ResearchContributionReviewToolOptions,
) {
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const authError = authorizeOwnerReview(extra, options);
    if (authError !== undefined) return authError;
    if (options.service === undefined) {
      return reviewError(
        "review_service_unavailable",
        "The research contribution review service is not configured.",
      );
    }
    try {
      const parsed = researchContributionReviewInputSchema.parse(input);
      const proposal = parsed.action === "accept" || parsed.action === "reject"
        ? await options.service.decide({
            proposalId: parsed.proposalId!,
            expectedPayloadSha256: parsed.expectedPayloadSha256!,
            decision: parsed.action === "accept" ? "ACCEPT" : "REJECT",
            reason: parsed.reason!,
          })
        : await options.service.inspect(parsed.proposalId, { canonical: options.canonical });
      if (proposal === null) {
        if (parsed.action === "status") {
          return reviewError(
            "proposal_not_found",
            "The research contribution proposal does not exist.",
          );
        }
        return successfulResult(
          "There is no pending research contribution proposal to review.",
          { outcome: "no_pending_proposal" },
        );
      }
      const outcome = proposal.status === "PENDING_REVIEW"
        ? "pending_review"
        : proposal.status === "REJECTED"
          ? "rejected"
          : proposal.status === "WITHDRAWN"
            ? "withdrawn"
            : proposal.promotion?.status === "COMPLETED"
              ? "accepted_promoted"
              : proposal.promotion?.status === "FAILED"
                ? "accepted_promotion_failed"
                : "accepted_pending_promotion";
      const text = outcome === "accepted_pending_promotion"
        ? "The exact reviewed proposal was accepted and queued for the separate canonical promotion runner. This call did not change canonical evidence."
        : outcome === "accepted_promoted"
          ? "The accepted proposal has a completed canonical promotion receipt."
          : outcome === "accepted_promotion_failed"
            ? `The accepted proposal's promotion failed: the canonical writer refused it with ${proposal.promotion!.failureCode}, ` +
              "a conflict with what the append-only canonical store already holds, so nothing from it was written and " +
              "it no longer holds back later accepted proposals. Filing the research again needs a corrected proposal."
            : outcome === "rejected"
              ? "The proposal was rejected and no promotion intent exists."
              : outcome === "withdrawn"
                ? "The contributor withdrew this proposal before review."
                : "Loaded the proposal for owner review; it remains non-authoritative and pending.";
      return successfulResult(`${text}${reviewAidText(proposal)}`, { outcome, proposal });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reviewError("invalid_request", "The owner-review request is invalid.");
      }
      if (error instanceof ResearchContributionReviewError) {
        const code = {
          PROPOSAL_NOT_FOUND: "proposal_not_found",
          PAYLOAD_MISMATCH: "payload_mismatch",
          REVIEW_CONFLICT: "review_conflict",
          PROMOTION_INTENT_MISSING: "promotion_intent_missing",
        }[error.code] as z.infer<typeof reviewErrorSchema>["code"];
        return reviewError(code, error.message);
      }
      return reviewError(
        "review_service_unavailable",
        "The research contribution review operation failed closed.",
      );
    }
  };
}

/** What shares the proposal's identities and what promotion would meet, in a sentence or two (IDs only). */
function reviewAidText(proposal: ResearchContributionReviewView): string {
  const parts: string[] = [];
  if (proposal.supersedesProposalId !== null && proposal.status === "PENDING_REVIEW") {
    parts.push(`It replaces this account's draft ${proposal.supersedesProposalId}; accepting it rejects that draft as superseded.`);
  }
  const pending = proposal.related.proposals.length + proposal.related.proposalsNotShown;
  const canonical = proposal.related.canonical === null
    ? 0
    : proposal.related.canonical.records.length + proposal.related.canonical.notShown;
  if (pending > 0 || canonical > 0) {
    parts.push(`Related (proposal.related): ${pending} other pending or queued proposal${pending === 1 ? "" : "s"} and ` +
      `${canonical} canonical record${canonical === 1 ? "" : "s"} share its topic, question, frontier or identifiers.`);
  }
  const preflight = proposal.preflight;
  if (preflight !== null) {
    parts.push(preflight.status === "clear"
      ? "Promotion preflight: the canonical writer's identity checks find no conflict."
      : preflight.status === "replay"
        ? "Promotion preflight: the canonical store already holds this exact payload, so promotion replays it."
        : preflight.status === "unavailable"
          ? "Promotion preflight: the canonical store could not be read just now."
          : `Promotion preflight: promotion would end FAILED with ${preflight.conflicts[0]!.code} at ` +
            `${preflight.conflicts[0]!.path}` +
            (preflight.conflicts.length > 1 ? ` (${preflight.conflicts.length} conflicts in proposal.preflight).` : "."));
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}

function authorizeOwnerReview(
  extra: ResearchOperationExtra | undefined,
  options: ResearchContributionReviewToolOptions,
): CallToolResult | undefined {
  const authInfo = extra?.authInfo;
  if (
    authInfo === undefined || authInfo.expiresAt === undefined ||
    authInfo.expiresAt <= Date.now() / 1_000
  ) {
    return oauthError(
      "authorization_required",
      "Connect the owner reviewer account to inspect research proposals.",
      options.resourceMetadataUrl,
      "invalid_token",
    );
  }
  if (!authInfo.scopes.includes(CASE_REVIEW_SCOPE)) {
    return oauthError(
      "insufficient_scope",
      "The connected account lacks the cases:review permission.",
      options.resourceMetadataUrl,
      "insufficient_scope",
    );
  }
  const subject = authInfo.extra?.subject;
  if (
    typeof subject !== "string" || options.allowedReviewerSubjects === undefined ||
    !options.allowedReviewerSubjects.has(subject)
  ) {
    return oauthError(
      "insufficient_scope",
      "The connected account is not an allowed AskRigor owner reviewer.",
      options.resourceMetadataUrl,
      "insufficient_scope",
    );
  }
  return undefined;
}

function successfulResult(
  text: string,
  content: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: researchContributionReviewOutputSchema.parse({
      ok: true,
      ...content,
      canonicalEvidenceChangedByThisCall: false,
    }),
  };
}

function oauthError(
  code: "authorization_required" | "insufficient_scope",
  message: string,
  resourceMetadataUrl: URL | undefined,
  oauthCode: "invalid_token" | "insufficient_scope",
): CallToolResult {
  const result = reviewError(code, message);
  if (resourceMetadataUrl !== undefined) {
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${resourceMetadataUrl.href}", scope="${CASE_REVIEW_SCOPE}", error="${oauthCode}", error_description="${message}"`,
      ],
    };
  }
  return result;
}

function reviewError(
  code: z.infer<typeof reviewErrorSchema>["code"],
  message: string,
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: researchContributionReviewOutputSchema.parse({
      ok: false,
      error: { code, message },
    }),
    isError: true,
  };
}
