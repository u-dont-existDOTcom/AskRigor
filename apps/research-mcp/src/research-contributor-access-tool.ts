import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CONTRIBUTION_PROBLEM_LIMITS,
  CONTRIBUTION_PROBLEM_RULES,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributionRejectedError,
  ResearchContributorAccessService,
  contributionPrivacyBoundarySchema,
  freeContributorAgreementSchema,
  livingEvidenceContributionSchema,
  researchContributionNullableParts,
  researchContributionShapeTemplate,
  researchFrontierContributionSchema,
  type CanonicalIdentityReader,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import {
  permissiveConnectorInputSchema,
  relaxedConnectorInputSchema,
  strictConnectorInputSchema,
  type ConnectorJsonSchema,
} from "./connector-input-schema.js";
import {
  RESEARCH_USE_SCOPE,
  SIGN_IN_REFUSALS,
  type SignInRefusal,
  type SignInState,
} from "./oauth-resource-server.js";
import type { ResearchOperationExtra } from "./research-operation.js";

// A notice version as a pattern, not the current value: clients keep a tool's
// schema for as long as a chat or connector lives, so a constant here would let
// a copy from before a notice change refuse the current version, and the user
// could not accept it (owner report, 2026-10-03). The service still accepts
// only the current notice; manage_research_access names it when it differs.
const noticeVersionSchema = z.string().regex(/^free-contributor-v[0-9]{1,3}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
  .describe(`The notice version the user accepted, exactly as inspect returns it (now ${RESEARCH_USE_NOTICE_VERSION}).`);

export const manageResearchAccessInputSchema = z.object({
  action: z.enum([
    "inspect",
    "accept_free_contributor",
    "activate_paid_private",
    "revoke",
  ]),
  agreement: freeContributorAgreementSchema.extend({ noticeVersion: noticeVersionSchema }).strict().optional(),
}).strict();

const researchAccessViewSchema = z.object({
  status: z.enum(["UNENROLLED", "ACTIVE", "REVOKED"]),
  mode: z.enum(["FREE_CONTRIBUTOR", "PAID_PRIVATE"]).nullable(),
  noticeVersion: noticeVersionSchema,
  notice: z.string().min(1),
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

/**
 * The exact contract: the proposal envelope, with payload either record. Claude's surface publishes it as is; the
 * handler checks every call against it itself (owner question 127), so a rejection can name every problem.
 */
export const submitResearchContributionInputSchema = z.object({
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"]).describe("Which record payload holds."),
  privacyBoundary: contributionPrivacyBoundarySchema.describe("Eight markers, each exactly false."),
  payload: z.union([researchFrontierContributionSchema, livingEvidenceContributionSchema])
    .describe("The record proposalKind names, shaped as this tool's description shows."),
}).strict();

/** Claude's surface publishes the strict schema; ChatGPT's the relaxed one, whose hidden shapes the description carries. */
export function submitResearchContributionPublishedInputSchema({ relaxed }: { relaxed: boolean }): ConnectorJsonSchema {
  const strict = strictConnectorInputSchema(submitResearchContributionInputSchema);
  return relaxed ? relaxedConnectorInputSchema(strict) : strict;
}

/** Runtime acceptance is permissive on both surfaces, so every call reaches AskRigor's own check. */
export function submitResearchContributionConnectorInputSchema(relaxed: boolean) {
  return permissiveConnectorInputSchema(submitResearchContributionPublishedInputSchema({ relaxed }));
}

const nullableParts = (kind: "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS") => {
  const parts = researchContributionNullableParts(kind);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
};

/** The record shapes, for the tool description: ChatGPT's app shows the model no part of payload's type. */
export const SUBMIT_RESEARCH_CONTRIBUTION_SHAPES_DESCRIPTION = "Record shapes, as JSON, where <uuid> stands for a " +
  "UUID, <sha256> for 64 lowercase hexadecimal characters, <date-time> for an ISO 8601 date-time with a time zone, " +
  "<date> for YYYY-MM-DD, … for deidentified text, a|b for one of the values and |null for a value that may be null. " +
  `RESEARCH_FRONTIER payload ${researchContributionShapeTemplate("RESEARCH_FRONTIER")}; ` +
  `${nullableParts("RESEARCH_FRONTIER")} may be null, and declaredQuerySha256 is the SHA-256 of the pass's ` +
  "deidentifiedQuery. " +
  `SOURCE_ANALYSIS payload ${researchContributionShapeTemplate("SOURCE_ANALYSIS")}; ${nullableParts("SOURCE_ANALYSIS")} ` +
  "may be null; knowledge is optional (structured claims, evidence bindings, edges, an assessment and freshness " +
  "records); receipts[].details holds names of your choice, each with text, a number, true, false or null; and " +
  "declaredWholeTextSha256 is null or the SHA-256 of the sections' content joined in order.";

export const SUBMIT_RESEARCH_CONTRIBUTION_DESCRIPTION = "Files one already-validated, deidentified formal research " +
  "frontier in the pending review inbox. Study and review audits validated in free contributor research are filed by " +
  "the server when finalize_research passes, so they are not submitted here. It accepts no raw chat, prompts, " +
  "identity or contact details, private health narratives, uploads, raw source or provider bodies, or YouTube or " +
  "community data. A proposal is not canonical evidence and does not gain scientific authority by submission. " +
  "Paid-private mode cannot use this operation. A rejected record comes back with every problem found, each with its " +
  "path, what was expected and an example; the values sent are not repeated. " +
  SUBMIT_RESEARCH_CONTRIBUTION_SHAPES_DESCRIPTION;

const contributionProblemSchema = z.object({
  path: z.string().min(1).max(CONTRIBUTION_PROBLEM_LIMITS.pathCharacters),
  rule: z.enum(CONTRIBUTION_PROBLEM_RULES),
  expected: z.string().min(1).max(CONTRIBUTION_PROBLEM_LIMITS.expectedCharacters),
  example: z.string().min(1).max(CONTRIBUTION_PROBLEM_LIMITS.exampleCharacters),
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
    // Owner answer 138b: the canonical records the stored record continues by exact identity, IDs only.
    canonicalCheck: z.enum(["checked", "unavailable"]).optional(),
    reconciled: z.array(z.object({
      path: z.string().min(1).max(CONTRIBUTION_PROBLEM_LIMITS.pathCharacters),
      from: z.string().uuid().nullable(),
      to: z.string().uuid(),
    }).strict()).max(1_000).optional(),
  }).strict().optional(),
  error: researchAccessErrorSchema.optional(),
  // A rejected record: each problem's path, rule, what was expected and an example, never a value sent.
  problems: z.array(contributionProblemSchema).min(1).max(CONTRIBUTION_PROBLEM_LIMITS.shown).optional(),
  problemsNotShown: z.number().int().positive().optional(),
}).strict();

export interface ResearchContributorToolOptions {
  service?: ResearchContributorAccessService;
  resourceMetadataUrl?: URL;
  /** What happened to this request's sign-in on /mcp; undefined without OAuth. */
  signIn?: SignInState;
  /** The canonical store's read-only identity view, which a submitted frontier is reconciled with. */
  canonical?: CanonicalIdentityReader;
}

/**
 * Whether this connection's research calls will be accepted, and if not, why
 * and what the user can do. get_protocol_manifest reports it, because that call
 * needs no sign-in and a client shows its result to the model: on 2026-10-03 and
 * 2026-10-06, ChatGPT showed every refused research call only as "The tool
 * failed internally", so neither the user nor the model could see the cause.
 */
export const researchConnectionSchema = z.object({
  sign_in: z.enum(["absent", "refused", "accepted"]),
  sign_in_refusal: z.enum(SIGN_IN_REFUSALS).optional(),
  research_access: z.enum([
    "ready",
    "sign_in_needed",
    "permission_missing",
    "mode_not_chosen",
    "revoked",
    "entitlement_inactive",
    "unavailable",
  ]),
  next_step: z.string().optional(),
}).strict();

export type ResearchConnection = z.infer<typeof researchConnectionSchema>;

/** The connection status for this request, or undefined when /mcp has no OAuth or the call came through an Action. */
export async function researchConnection(
  extra: ResearchOperationExtra | undefined,
  options: ResearchContributorToolOptions,
): Promise<ResearchConnection | undefined> {
  const signIn = options.signIn;
  if (signIn === undefined || extra?.surface === "action") return undefined;
  const signInFields = {
    sign_in: signIn.state,
    ...(signIn.state === "refused" ? { sign_in_refusal: signIn.refusal } : {}),
  };
  const problem = signInProblem(extra, signIn);
  if ("code" in problem) {
    return {
      ...signInFields,
      research_access: problem.code === "insufficient_scope" ? "permission_missing" : "sign_in_needed",
      next_step: problem.message,
    };
  }
  if (options.service === undefined) {
    return {
      ...signInFields,
      research_access: "unavailable",
      next_step: "AskRigor's research-access service is not configured; research tools are unavailable.",
    };
  }
  try {
    await options.service.requireActive(problem.subject);
    return { ...signInFields, research_access: "ready" };
  } catch (error) {
    const mapped = mapError(error);
    const access: ResearchConnection["research_access"] = mapped.code === "research_access_required"
      ? "mode_not_chosen"
      : mapped.code === "research_access_revoked"
        ? "revoked"
        : mapped.code === "paid_private_entitlement_required"
          ? "entitlement_inactive"
          : "unavailable";
    return {
      ...signInFields,
      research_access: access,
      next_step: access === "unavailable"
        ? "AskRigor could not read this account's research mode just now; try again shortly."
        : access === "mode_not_chosen"
          ? `${mapped.message} Call manage_research_access with action inspect, show the user the notice it returns, and let them choose.`
          : mapped.message,
    };
  }
}

/** One sentence on the connection for the manifest's text. */
export function researchConnectionSummary(connection: ResearchConnection): string {
  return connection.research_access === "ready"
    ? "Research tools: ready for this connection."
    : `Research tools will be refused for this connection: ${connection.next_step}`;
}

export function researchUseSecurityMetadata(): Record<string, unknown> {
  return {
    securitySchemes: [{ type: "oauth2", scopes: [RESEARCH_USE_SCOPE] }],
  };
}

/**
 * The manifest needs no sign-in but reports this connection's research access,
 * so a signed-in client should send its token with it: both schemes together
 * mark the sign-in as optional.
 */
export function optionalSignInSecurityMetadata(): Record<string, unknown> {
  return {
    securitySchemes: [{ type: "noauth" }, { type: "oauth2", scopes: [RESEARCH_USE_SCOPE] }],
  };
}

export function createManageResearchAccessHandler(
  options: ResearchContributorToolOptions,
) {
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const auth = authorizedSubject(extra, options.resourceMetadataUrl, options.signIn);
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
      // Consent counts only for the notice the user was shown: an earlier
      // version's terms differ, so it is refused, never upgraded.
      if (parsed.agreement !== undefined && parsed.agreement.noticeVersion !== RESEARCH_USE_NOTICE_VERSION) {
        return accessError(
          "research_access_required",
          `The current free-use notice is ${RESEARCH_USE_NOTICE_VERSION}, not ${parsed.agreement.noticeVersion}. ` +
            "Call manage_research_access with action inspect, show the user the notice it returns, and if they " +
            `accept it, send agreement.noticeVersion "${RESEARCH_USE_NOTICE_VERSION}". If this tool's schema still ` +
            "names the older version, the app is using a copy of AskRigor's tools from before the notice changed: " +
            "start a new chat, or refresh or reconnect AskRigor in the app's settings.",
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
    const auth = authorizedSubject(extra, options.resourceMetadataUrl, options.signIn);
    if ("error" in auth) return auth.error;
    if (options.service === undefined) {
      return proposalError(
        "research_access_service_unavailable",
        "Research contribution intake is not configured.",
      );
    }
    try {
      // The service refuses by account first (paid private submits nothing),
      // then checks the record and names every problem it finds.
      const result = await options.service.submitProposal(auth.subject, input, { canonical: options.canonical });
      const proposal = {
        proposalId: result.record.proposalId,
        proposalKind: result.record.proposalKind,
        payloadSha256: result.record.payloadSha256,
        status: result.record.status,
        partial: result.record.partial,
        writeStatus: result.status,
        canonicalEvidenceChanged: false,
        ...(result.canonicalCheck === undefined ? {} : { canonicalCheck: result.canonicalCheck }),
        ...(result.reconciled.length === 0 ? {} : { reconciled: result.reconciled }),
      } as const;
      const continued = result.reconciled.length === 0
        ? ""
        : ` It continues the canonical records it names by exact identity: ${result.reconciled.length} ID` +
          `${result.reconciled.length === 1 ? " was" : "s were"} set to the canonical one${result.reconciled.length === 1 ? "" : "s"} ` +
          "(proposal.reconciled), so the stored record and its hash differ from the one sent.";
      return {
        content: [{
          type: "text",
          text: `${proposal.proposalKind === "RESEARCH_FRONTIER" ? "Research frontier" : "Source analysis"} proposal ${proposal.writeStatus === "inserted" ? "entered" : "was already present in"} the review inbox. Canonical evidence was not changed.${continued}`,
        }],
        structuredContent: submitResearchContributionOutputSchema.parse({
          ok: true,
          proposal,
        }),
      };
    } catch (error) {
      if (error instanceof ResearchContributionRejectedError) return rejectedProposal(error);
      return mappedProposalError(error);
    }
  };
}

/**
 * A rejected record (owner question 127): every problem found, each with its path, rule, what was expected and an
 * example from AskRigor's own example record. Nothing from the values sent is in it, and nothing was stored.
 */
function rejectedProposal(error: ResearchContributionRejectedError): CallToolResult {
  const notShown = error.total - error.problems.length;
  const message = `The contribution was not filed: ${error.total === 1 ? "1 problem was" : `${error.total} problems were`} ` +
    "found. Fix each one and call submit_research_contribution again; nothing was stored, and the values sent are " +
    "not repeated here." +
    (error.payloadCheck === "kind_invalid"
      ? " The record in payload is checked once proposalKind is RESEARCH_FRONTIER or SOURCE_ANALYSIS."
      : error.payloadCheck === "kind_mismatch"
        ? " The record in payload is checked against the kind proposalKind names once the two agree."
        : "") +
    (error.crossFieldRulesPending ? " The rules that compare fields with each other run once these are fixed." : "");
  const lines = [
    message,
    ...error.problems.map((problem, index) =>
      `${index + 1}. ${problem.path} (${problem.rule}): expected ${problem.expected}. Example: ${problem.example}`),
    ...(notShown > 0 ? [`And ${notShown} more.`] : []),
    "This tool's description gives each record's whole shape; {…} and […] in an example stand for parts it shows.",
  ];
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    structuredContent: submitResearchContributionOutputSchema.parse({
      ok: false,
      error: {
        code: error.code === "CONTRIBUTION_PRIVACY_REJECTED" ? "contribution_privacy_rejected" : "invalid_request",
        message,
      },
      problems: error.problems,
      ...(notShown > 0 ? { problemsNotShown: notShown } : {}),
    }),
    isError: true,
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
    const auth = authorizedSubject(extra, options.resourceMetadataUrl, options.signIn);
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
      return plainError(
        mapped.code,
        mapped.code === "research_access_required"
          ? `${mapped.message} Call manage_research_access with action inspect, show the user the notice it returns, and let them choose.`
          : mapped.message,
      );
    }
    return handler(input, extra);
  };
}

/**
 * The caller's active research-use mode and pseudonymous account key, which
 * decide what the findings library does with its research: saved (free
 * contributor) or offered for a yes (paid private). Undefined for an inactive
 * account, a call without a valid research:use token, or no access service.
 * Never throws.
 */
export async function researchUseAccount(
  extra: ResearchOperationExtra | undefined,
  service: ResearchContributorAccessService | undefined,
): Promise<{ mode: "FREE_CONTRIBUTOR" | "PAID_PRIVATE"; accountKey: string } | undefined> {
  const auth = authorizedSubject(extra, undefined);
  if ("error" in auth || service === undefined) return undefined;
  try {
    const mode = await service.requireActive(auth.subject);
    return { mode, accountKey: service.accountKeyForSubject(auth.subject) };
  } catch {
    return undefined;
  }
}

/**
 * Files a source analysis the server built itself (analysis-staging.ts) under
 * the caller's own account, through the same intake and privacy checks as
 * submit_research_contribution. The server's contribution carries none of
 * the persisted material the privacy boundary rules out. Throws when the call
 * has no valid research:use token or no access service.
 */
export async function submitServerSourceAnalysis(
  extra: ResearchOperationExtra | undefined,
  service: ResearchContributorAccessService | undefined,
  contribution: unknown,
): Promise<"inserted" | "idempotent_replay"> {
  const auth = authorizedSubject(extra, undefined);
  if ("error" in auth || service === undefined) throw new Error("RESEARCH_ACCOUNT_UNAVAILABLE");
  const result = await service.submitProposal(auth.subject, {
    proposalKind: "SOURCE_ANALYSIS",
    privacyBoundary: {
      rawChatPersisted: false,
      promptPersisted: false,
      accountIdentityInPayload: false,
      privateHealthNarrativePersisted: false,
      uploadContentPersisted: false,
      rawSourceContentPersisted: false,
      rawProviderResponsePersisted: false,
      communityDataPersisted: false,
    },
    payload: contribution,
  }, { serverBuilt: true });
  return result.status;
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

export function authorizedSubject(
  extra: ResearchOperationExtra | undefined,
  resourceMetadataUrl: URL | undefined,
  signIn?: SignInState,
): { subject: string } | { error: CallToolResult } {
  const problem = signInProblem(extra, signIn);
  if ("subject" in problem) return problem;
  return {
    error: oauthError(
      problem.code,
      problem.message,
      resourceMetadataUrl,
      problem.code === "insufficient_scope" ? "insufficient_scope" : "invalid_token",
    ),
  };
}

function signInProblem(
  extra: ResearchOperationExtra | undefined,
  signIn: SignInState | undefined,
): { subject: string } | { code: "authorization_required" | "insufficient_scope"; message: string } {
  const authInfo = extra?.authInfo;
  if (
    authInfo === undefined ||
    authInfo.expiresAt === undefined ||
    authInfo.expiresAt <= Date.now() / 1_000
  ) {
    return { code: "authorization_required", message: missingSignInMessage(signIn) };
  }
  if (!authInfo.scopes.includes(RESEARCH_USE_SCOPE)) {
    return {
      code: "insufficient_scope",
      message: "The connected account lacks the research:use permission. Reconnect AskRigor and approve research use.",
    };
  }
  const subject = authInfo.extra?.subject;
  if (typeof subject !== "string" || subject.length === 0) {
    return { code: "authorization_required", message: "The connected account has no stable subject identity." };
  }
  return { subject };
}

const SIGN_IN_REFUSAL_REASONS: Record<SignInRefusal, string> = {
  expired: "it had expired. Reconnect AskRigor, or retry so the app can refresh it.",
  wrong_audience: "it was issued for a different service than AskRigor's research API. Reconnect AskRigor; if this repeats, AskRigor's sign-in setup needs fixing by its operator.",
  not_a_signed_token: "it is not a token issued for AskRigor's research API. Reconnect AskRigor; if this repeats, AskRigor's sign-in setup needs fixing by its operator.",
  wrong_issuer: "it does not come from AskRigor's sign-in service. Reconnect AskRigor; if this repeats, AskRigor's sign-in setup needs fixing by its operator.",
  bad_signature: "its signature could not be verified. Reconnect AskRigor; if this repeats, AskRigor's sign-in setup needs fixing by its operator.",
  client_not_allowed: "it was issued to an app that AskRigor does not accept yet. AskRigor's operator must allow this app.",
  subject_not_allowed: "this account is not allowed on this AskRigor endpoint.",
  invalid_claims: "it lacks details AskRigor requires. Reconnect AskRigor; if this repeats, AskRigor's sign-in setup needs fixing by its operator.",
  unverifiable: "AskRigor could not check it just now. Try again shortly.",
};

function missingSignInMessage(signIn: SignInState | undefined): string {
  if (signIn?.state === "refused") {
    return `AskRigor refused this call's sign-in (${signIn.refusal}): ${SIGN_IN_REFUSAL_REASONS[signIn.refusal]}`;
  }
  return "This call carried no AskRigor sign-in. Connect or reconnect AskRigor in this app's connector settings, then call manage_research_access with action inspect.";
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
