import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  PUBLIC_PROLACTINOMA_GAP_SLUG,
  PublicEvidenceGapIntakeService,
  publicGapDetailsSchema,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { CASE_REVIEW_SCOPE } from "./oauth-resource-server.js";
import type { ResearchOperationExtra } from "./research-operation.js";

export const evidenceGapReviewInputSchema = z.object({
  gap_slug: z.literal(PUBLIC_PROLACTINOMA_GAP_SLUG).describe(
    "Public evidence-gap slug whose private review queue should be inspected.",
  ),
}).strict();

const reviewErrorSchema = z.object({
  code: z.enum([
    "authorization_required",
    "insufficient_scope",
    "review_service_unavailable",
  ]),
  message: z.string(),
}).strict();

const reviewItemSchema = z.object({
  submissionId: z.string().uuid(),
  participantPseudonym: z.string(),
  provenance: z.enum(["SELF", "DIRECT_OBSERVER", "SUBJECT_RELAYED", "HEARSAY"]),
  status: z.literal("SUBMITTED"),
  evidenceLevel: z.literal("L1_STRUCTURED_CASE"),
  verificationStatus: z.literal("PARTICIPANT_REPORTED_UNVERIFIED"),
  completenessLabel: z.enum(["PARTIAL", "SUBSTANTIAL"]),
  partial: z.boolean(),
  missingFields: z.array(z.string()),
  structuredCase: publicGapDetailsSchema,
  structuredContactPatternsRedacted: z.boolean(),
  narrativeForPrivateGptReview: z.string(),
  narrativePrivacyTransform: z.enum([
    "BASIC_CONTACT_REDACTION_APPLIED",
    "NO_CONTACT_PATTERN_DETECTED",
  ]),
  privacyLimitations: z.array(z.string()),
  submittedAt: z.string(),
}).strict();

export const evidenceGapReviewOutputSchema = z.object({
  ok: z.boolean(),
  gap: z.object({
    slug: z.string(),
    title: z.string(),
    researchQuestion: z.string(),
    known: z.string(),
    unresolved: z.string(),
    comparisonNeed: z.string(),
    targetPopulations: z.array(z.string()),
  }).strict().optional(),
  items: z.array(reviewItemSchema).optional(),
  counts: z.object({
    total: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    remissionOrRegression: z.number().int().nonnegative(),
    comparisonOrNonRemission: z.number().int().nonnegative(),
  }).strict().optional(),
  causalAnalysisPermitted: z.literal(false).optional(),
  error: reviewErrorSchema.optional(),
}).strict();

export interface EvidenceGapReviewToolOptions {
  service?: PublicEvidenceGapIntakeService;
  resourceMetadataUrl?: URL;
  allowedReviewerSubjects?: ReadonlySet<string>;
}

export function evidenceGapReviewSecurityMetadata(): Record<string, unknown> {
  return {
    securitySchemes: [{ type: "oauth2", scopes: [CASE_REVIEW_SCOPE] }],
  };
}

export function publicToolSecurityMetadata(): Record<string, unknown> {
  return { securitySchemes: [{ type: "noauth" }] };
}

export function createEvidenceGapReviewHandler(
  options: EvidenceGapReviewToolOptions,
): (
  input: Record<string, unknown>,
  extra?: ResearchOperationExtra,
) => Promise<CallToolResult> {
  return async (input, extra) => {
    const authInfo = extra?.authInfo;
    if (authInfo === undefined || authInfo.expiresAt === undefined ||
        authInfo.expiresAt <= Date.now() / 1_000) {
      return authorizationError(
        "authorization_required",
        "Connect the reviewer account to inspect private evidence-gap submissions.",
        options.resourceMetadataUrl,
        "invalid_token",
      );
    }
    if (!authInfo.scopes.includes(CASE_REVIEW_SCOPE)) {
      return authorizationError(
        "insufficient_scope",
        "The connected account lacks the cases:review permission.",
        options.resourceMetadataUrl,
        "insufficient_scope",
      );
    }
    const subject = authInfo.extra?.subject;
    if (
      typeof subject !== "string" ||
      options.allowedReviewerSubjects === undefined ||
      !options.allowedReviewerSubjects.has(subject)
    ) {
      return authorizationError(
        "insufficient_scope",
        "The connected account is not an allowed AskRigor case reviewer.",
        options.resourceMetadataUrl,
        "insufficient_scope",
      );
    }
    if (options.service === undefined) {
      return toolError(
        "review_service_unavailable",
        "The private evidence-gap review service is not configured.",
      );
    }
    const parsed = evidenceGapReviewInputSchema.parse(input);
    const queue = await options.service.reviewQueue(parsed.gap_slug);
    return {
      content: [{
        type: "text",
        text: `Loaded ${queue.counts.total} private participant-reported case(s); ${queue.counts.partial} are labeled partial and ${queue.counts.comparisonOrNonRemission} are comparison or non-remission cases.`,
      }],
      structuredContent: evidenceGapReviewOutputSchema.parse({
        ok: true,
        ...queue,
      }),
    };
  };
}

function authorizationError(
  code: "authorization_required" | "insufficient_scope",
  message: string,
  resourceMetadataUrl: URL | undefined,
  oauthError: "invalid_token" | "insufficient_scope",
): CallToolResult {
  const result: CallToolResult = {
    content: [{ type: "text", text: message }],
    structuredContent: evidenceGapReviewOutputSchema.parse({
      ok: false,
      error: { code, message },
    }),
    isError: true,
  };
  if (resourceMetadataUrl !== undefined) {
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${resourceMetadataUrl.href}", scope="${CASE_REVIEW_SCOPE}", error="${oauthError}", error_description="${message}"`,
      ],
    };
  }
  return result;
}

function toolError(
  code: "review_service_unavailable",
  message: string,
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: evidenceGapReviewOutputSchema.parse({
      ok: false,
      error: { code, message },
    }),
    isError: true,
  };
}
