import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributorAccessService,
  contributionPrivacyBoundarySchema,
  freeContributorAgreementSchema,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { RESEARCH_USE_SCOPE } from "./oauth-resource-server.js";
import type { ResearchOperationExtra } from "./research-operation.js";

export const manageResearchAccessInputSchema = z.object({
  action: z.enum([
    "inspect",
    "accept_free_contributor",
    "activate_paid_private",
    "revoke",
  ]),
  agreement: freeContributorAgreementSchema.optional(),
}).strict();

const researchAccessViewSchema = z.object({
  status: z.enum(["UNENROLLED", "ACTIVE", "REVOKED"]),
  mode: z.enum(["FREE_CONTRIBUTOR", "PAID_PRIVATE"]).nullable(),
  noticeVersion: z.literal(RESEARCH_USE_NOTICE_VERSION),
  notice: z.literal(RESEARCH_USE_NOTICE),
  contributionRequired: z.boolean(),
  privateEntitlementRequired: z.boolean(),
  paidCheckoutAvailable: z.literal(false),
  activatedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
}).strict();

const researchAccessErrorSchema = z.object({
  code: z.enum([
    "authorization_required",
    "insufficient_scope",
    "research_access_service_unavailable",
    "research_access_required",
    "research_access_revoked",
    "paid_private_entitlement_required",
    "paid_private_does_not_contribute",
    "free_contributor_required",
    "contribution_privacy_rejected",
    "invalid_request",
  ]),
  message: z.string(),
}).strict();

export const manageResearchAccessOutputSchema = z.object({
  ok: z.boolean(),
  access: researchAccessViewSchema.optional(),
  error: researchAccessErrorSchema.optional(),
}).strict();

export const submitResearchContributionInputSchema = z.object({
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"]),
  privacyBoundary: contributionPrivacyBoundarySchema,
  payload: z.record(z.string(), z.unknown()),
}).strict();

export const submitResearchContributionOutputSchema = z.object({
  ok: z.boolean(),
  proposal: z.object({
    proposalId: z.string().uuid(),
    proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"]),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    status: z.literal("PENDING_REVIEW"),
    partial: z.boolean(),
    writeStatus: z.enum(["inserted", "idempotent_replay"]),
    canonicalEvidenceChanged: z.literal(false),
  }).strict().optional(),
  error: researchAccessErrorSchema.optional(),
}).strict();

export interface ResearchContributorToolOptions {
  service?: ResearchContributorAccessService;
  resourceMetadataUrl?: URL;
}

export function researchUseSecurityMetadata(): Record<string, unknown> {
  return {
    securitySchemes: [{ type: "oauth2", scopes: [RESEARCH_USE_SCOPE] }],
  };
}

export function createManageResearchAccessHandler(
  options: ResearchContributorToolOptions,
) {
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const auth = authorizedSubject(extra, options.resourceMetadataUrl);
    if ("error" in auth) return auth.error;
    if (options.service === undefined) {
      return accessError(
        "research_access_service_unavailable",
        "Research access enrollment is not configured.",
      );
    }
    try {
      const parsed = manageResearchAccessInputSchema.parse(input);
      if (
        (parsed.action === "accept_free_contributor") !==
          (parsed.agreement !== undefined)
      ) {
        return accessError(
          "invalid_request",
          "The exact versioned agreement is required only when accepting free contributor mode.",
        );
      }
      const access = parsed.action === "inspect"
        ? await options.service.inspect(auth.subject)
        : parsed.action === "accept_free_contributor"
          ? await options.service.acceptFreeContributor(
              auth.subject,
              parsed.agreement!,
            )
          : parsed.action === "activate_paid_private"
            ? await options.service.activatePaidPrivate(auth.subject)
            : await options.service.revoke(auth.subject);
      return {
        content: [{
          type: "text",
          text: access.status === "ACTIVE"
            ? `AskRigor research access is active in ${access.mode === "FREE_CONTRIBUTOR" ? "free contributor" : "paid private"} mode.`
            : access.status === "REVOKED"
              ? "AskRigor research access is revoked."
              : "Choose free contributor mode or activate an existing paid private entitlement before research use.",
        }],
        structuredContent: manageResearchAccessOutputSchema.parse({
          ok: true,
          access,
        }),
      };
    } catch (error) {
      return mappedAccessError(error);
    }
  };
}

export function createSubmitResearchContributionHandler(
  options: ResearchContributorToolOptions,
) {
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const auth = authorizedSubject(extra, options.resourceMetadataUrl);
    if ("error" in auth) return auth.error;
    if (options.service === undefined) {
      return proposalError(
        "research_access_service_unavailable",
        "Research contribution intake is not configured.",
      );
    }
    try {
      const parsed = submitResearchContributionInputSchema.parse(input);
      const result = await options.service.submitProposal(auth.subject, parsed);
      const proposal = {
        proposalId: result.record.proposalId,
        proposalKind: result.record.proposalKind,
        payloadSha256: result.record.payloadSha256,
        status: result.record.status,
        partial: result.record.partial,
        writeStatus: result.status,
        canonicalEvidenceChanged: false,
      } as const;
      return {
        content: [{
          type: "text",
          text: `${proposal.proposalKind === "RESEARCH_FRONTIER" ? "Research frontier" : "Source analysis"} proposal ${proposal.writeStatus === "inserted" ? "entered" : "was already present in"} the review inbox. Canonical evidence was not changed.`,
        }],
        structuredContent: submitResearchContributionOutputSchema.parse({
          ok: true,
          proposal,
        }),
      };
    } catch (error) {
      return mappedProposalError(error);
    }
  };
}

export function createResearchAccessGuard(
  handler: (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ) => Promise<CallToolResult>,
  options: ResearchContributorToolOptions,
) {
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const auth = authorizedSubject(extra, options.resourceMetadataUrl);
    if ("error" in auth) return withoutStructuredContent(auth.error);
    if (options.service === undefined) {
      return plainError(
        "research_access_service_unavailable",
        "AskRigor research use is unavailable until the reciprocal access service is configured.",
      );
    }
    try {
      await options.service.requireActive(auth.subject);
    } catch (error) {
      const mapped = mapError(error);
      return plainError(mapped.code, mapped.message);
    }
    return handler(input, extra);
  };
}

function withoutStructuredContent(result: CallToolResult): CallToolResult {
  const { structuredContent: _ignored, ...rest } = result;
  return rest;
}

function plainError(
  _code: z.infer<typeof researchAccessErrorSchema>["code"],
  message: string,
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function authorizedSubject(
  extra: ResearchOperationExtra | undefined,
  resourceMetadataUrl: URL | undefined,
): { subject: string } | { error: CallToolResult } {
  const authInfo = extra?.authInfo;
  if (
    authInfo === undefined ||
    authInfo.expiresAt === undefined ||
    authInfo.expiresAt <= Date.now() / 1_000
  ) {
    return {
      error: oauthError(
        "authorization_required",
        "Connect an AskRigor account before choosing a research-use mode.",
        resourceMetadataUrl,
        "invalid_token",
      ),
    };
  }
  if (!authInfo.scopes.includes(RESEARCH_USE_SCOPE)) {
    return {
      error: oauthError(
        "insufficient_scope",
        "The connected account lacks the research:use permission.",
        resourceMetadataUrl,
        "insufficient_scope",
      ),
    };
  }
  const subject = authInfo.extra?.subject;
  if (typeof subject !== "string" || subject.length === 0) {
    return {
      error: oauthError(
        "authorization_required",
        "The connected account has no stable subject identity.",
        resourceMetadataUrl,
        "invalid_token",
      ),
    };
  }
  return { subject };
}

function oauthError(
  code: "authorization_required" | "insufficient_scope",
  message: string,
  resourceMetadataUrl: URL | undefined,
  oauthCode: "invalid_token" | "insufficient_scope",
): CallToolResult {
  const result = accessError(code, message);
  if (resourceMetadataUrl !== undefined) {
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${resourceMetadataUrl.href}", scope="${RESEARCH_USE_SCOPE}", error="${oauthCode}", error_description="${message}"`,
      ],
    };
  }
  return result;
}

function mappedAccessError(error: unknown): CallToolResult {
  const mapped = mapError(error);
  return accessError(mapped.code, mapped.message);
}

function mappedProposalError(error: unknown): CallToolResult {
  const mapped = mapError(error);
  return proposalError(mapped.code, mapped.message);
}

function mapError(error: unknown): {
  code: z.infer<typeof researchAccessErrorSchema>["code"];
  message: string;
} {
  if (error instanceof ResearchAccessError) {
    return {
      code: error.code.toLowerCase() as z.infer<
        typeof researchAccessErrorSchema
      >["code"],
      message: error.message,
    };
  }
  if (error instanceof z.ZodError) {
    return {
      code: "invalid_request",
      message: "The research access or contribution request did not match the required contract.",
    };
  }
  return {
    code: "invalid_request",
    message: "The research access or contribution request could not be accepted.",
  };
}

function accessError(
  code: z.infer<typeof researchAccessErrorSchema>["code"],
  message: string,
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: manageResearchAccessOutputSchema.parse({
      ok: false,
      error: { code, message },
    }),
    isError: true,
  };
}

function proposalError(
  code: z.infer<typeof researchAccessErrorSchema>["code"],
  message: string,
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: submitResearchContributionOutputSchema.parse({
      ok: false,
      error: { code, message },
    }),
    isError: true,
  };
}
