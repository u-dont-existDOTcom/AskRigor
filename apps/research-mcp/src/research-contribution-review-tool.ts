import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ResearchContributionReviewError,
  ResearchContributionReviewService,
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
  status: z.enum(["PENDING", "COMPLETED"]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  receipt: z.record(z.string(), z.unknown()).nullable(),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
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
        : await options.service.inspect(parsed.proposalId);
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
              : "accepted_pending_promotion";
      const text = outcome === "accepted_pending_promotion"
        ? "The exact reviewed proposal was accepted and queued for the separate canonical promotion runner. This call did not change canonical evidence."
        : outcome === "accepted_promoted"
          ? "The accepted proposal has a completed canonical promotion receipt."
          : outcome === "rejected"
            ? "The proposal was rejected and no promotion intent exists."
            : outcome === "withdrawn"
              ? "The contributor withdrew this proposal before review."
              : "Loaded the proposal for owner review; it remains non-authoritative and pending.";
      return successfulResult(text, { outcome, proposal });
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
