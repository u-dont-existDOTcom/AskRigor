import { createHash } from "node:crypto";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CONTRIBUTION_PROBLEM_LIMITS,
  CONTRIBUTION_PROBLEM_RULES,
  RESEARCH_ACCOUNT_REFERENCE_CHARACTERS,
  RESEARCH_MAP_CONSENT,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributionRejectedError,
  ResearchContributorAccessService,
  contributionPrivacyBoundarySchema,
  freeContributorAgreementSchema,
  livingEvidenceContributionSchema,
  researchAccountReference,
  researchContributionNullableParts,
  researchContributionShapeTemplate,
  researchFrontierContributionSchema,
  topicLinkContributionSchema,
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
import {
  FINALIZE_REMINDER,
  PLAIN_ANSWER_LIMITS,
  plainAnswerClaimDigest,
  sameQuote,
  sentencesOf,
} from "./research-finalization-gate.js";
import type { ResearchOperationExtra } from "./research-operation.js";
import {
  RESEARCH_RECEIPT_MAX_CHARACTERS,
  researchTargetDigest,
  type ResearchReceiptClaims,
} from "./research-receipts.js";
import { toolListNotice, toolListVersionField } from "./tool-list-currency.js";

// A notice version as a pattern, not the current value: clients keep a tool's
// schema for as long as a chat or connector lives, so a constant here would let
// a copy from before a notice change refuse the current version, and the user
// could not accept it (owner report, 2026-10-03). The service still accepts
// only the current notice; manage_research_access names it when it differs.
const noticeVersionSchema = z.string().regex(/^free-contributor-v[0-9]{1,3}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
  .describe(`The notice version the user accepted, exactly as inspect returns it (now ${RESEARCH_USE_NOTICE_VERSION}).`);

// The plain answer a paid private or dev account registers before research (owner answer 140b, 2026-10-20).
const plainAnswerInputSchema = z.object({
  researchTarget: z.string().trim().min(1).max(5_000)
    .describe("The research target, exactly as you will give it to finalize_research and the discovery tools."),
  text: z.string().trim().min(1).max(PLAIN_ANSWER_LIMITS.textCharacters)
    .describe("The short answer you would give without AskRigor's tools, written before any research call."),
  claims: z.array(z.string().trim().min(1).max(PLAIN_ANSWER_LIMITS.claimCharacters)).min(1)
    .max(PLAIN_ANSWER_LIMITS.claims)
    .describe("Its main claims, each one or more whole sentences copied exactly from text."),
}).strict();

export const manageResearchAccessInputSchema = z.object({
  action: z.enum([
    "inspect",
    "accept_free_contributor",
    "activate_paid_private",
    "revoke",
    "register_plain_answer",
    "set_plain_answer_note",
    "set_detailed_lesson_reports",
  ]),
  agreement: freeContributorAgreementSchema.extend({ noticeVersion: noticeVersionSchema }).strict().optional(),
  plainAnswer: plainAnswerInputSchema.optional()
    .describe("With register_plain_answer, before any research call: the plain answer and its claims."),
  plainAnswerNote: z.boolean().optional()
    .describe("With set_plain_answer_note: false turns off the note comparing a checked answer with its plain " +
      "answer, true turns it back on."),
  detailedLessonReports: z.boolean().optional()
    .describe("With set_detailed_lesson_reports, when the user asks: true turns this account's detailed lesson " +
      "reports on, false off."),
  tool_list_version: toolListVersionField(undefined),
}).strict();

/** The input schema as a surface publishes it: tool_list_version's description carries that surface's version. */
export function manageResearchAccessInputSchemaFor(toolListVersion: string | undefined) {
  return manageResearchAccessInputSchema.extend({ tool_list_version: toolListVersionField(toolListVersion) });
}

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
    "plain_answer_not_requested",
    "receipts_unavailable",
    "invalid_request",
  ]),
  message: z.string(),
}).strict();

export const manageResearchAccessOutputSchema = z.object({
  ok: z.boolean(),
  access: researchAccessViewSchema.optional(),
  plainAnswer: z.object({
    requested: z.literal(true)
      .describe("This account registers a plain answer before research: a paid private or dev account."),
    note: z.boolean().describe("Whether its checked answers end with the note comparing them with the plain answer."),
    claims: z.number().int().min(1).max(PLAIN_ANSWER_LIMITS.claims).optional()
      .describe("With register_plain_answer: how many claims were signed."),
  }).strict().optional(),
  detailedLessonReports: z.boolean().optional()
    .describe("Whether this account's lessons may carry a detailed report: off unless the user turned detailed " +
      "lesson reports on."),
  research_receipt: z.string().optional(),
  accountReference: z.string().regex(new RegExp(`^[a-f0-9]{${RESEARCH_ACCOUNT_REFERENCE_CHARACTERS}}$`, "u")).optional()
    .describe("This account's reference, the first characters of its pseudonymous key: the user can give it to " +
      "AskRigor's owner, for example to be listed as a dev account. It names no one. Give it only when the user asks " +
      "for it."),
  problems: z.array(z.string()).optional(),
  error: researchAccessErrorSchema.optional(),
}).strict();

/**
 * The exact contract: the proposal envelope, with payload either record. Claude's surface publishes it as is; the
 * handler checks every call against it itself (owner question 127), so a rejection can name every problem.
 */
export const submitResearchContributionInputSchema = z.object({
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"]).describe("Which record payload holds."),
  privacyBoundary: contributionPrivacyBoundarySchema.describe("Eight markers, each exactly false."),
  payload: z.union([researchFrontierContributionSchema, livingEvidenceContributionSchema, topicLinkContributionSchema])
    .describe("The record proposalKind names, shaped as this tool's description shows."),
  supersedesProposalId: z.uuid().optional()
    .describe("Optional: the proposalId of this account's own pending proposal of the same kind that this one replaces; accepting this one rejects it as superseded."),
  userConsent: z.literal(RESEARCH_MAP_CONSENT).optional()
    .describe(`Paid private accounts only, for this research's map: "${RESEARCH_MAP_CONSENT}", after the user said ` +
      "yes to the answer's offer to save its findings and file the map."),
  finalizationReceipt: z.string().trim().min(1).max(RESEARCH_RECEIPT_MAX_CHARACTERS).optional()
    .describe("Paid private accounts only, with userConsent: the finalization_receipt of the final check whose offer " +
      "the user said yes to."),
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

const nullableParts = (kind: "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS" | "TOPIC_LINK") => {
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
  "declaredWholeTextSha256 is null or the SHA-256 of the sections' content joined in order. " +
  `TOPIC_LINK payload ${researchContributionShapeTemplate("TOPIC_LINK")}: fromTopic is the same topic as toTopic, ` +
  "narrower than it, broader than it or related to it; each holds the topic's topic_id and canonical_key as " +
  "search_research_frontiers or get_research_frontier returns them, and rationale says why in deidentified text.";

export const SUBMIT_RESEARCH_CONTRIBUTION_DESCRIPTION = "Files one already-validated, deidentified formal research " +
  "frontier in the pending review inbox, or a topic link: your declaration that two differently worded canonical " +
  "topics name the same topic, or that one is narrower than, broader than or related to the other, which the " +
  "owner's acceptance links without moving or deleting anything. Study and review audits validated in free " +
  "contributor research are filed by the server when finalize_research passes, so they are not submitted here. " +
  "It accepts no raw chat, prompts, identity or contact details, private health narratives, uploads, raw source or " +
  "provider bodies, or YouTube or community data. A proposal is not canonical evidence and does not gain scientific " +
  "authority by submission. Paid-private mode cannot use this operation. A rejected record comes back with every " +
  "problem found, each with its path, what was expected and an example; the values sent are not repeated. " +
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
    proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"]),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    status: z.literal("PENDING_REVIEW"),
    partial: z.boolean(),
    writeStatus: z.enum(["inserted", "idempotent_replay"]),
    canonicalEvidenceChanged: z.literal(false),
    // Owner answer 138b: the draft it replaces, and the canonical records it continues by exact identity, IDs only.
    supersedesProposalId: z.string().uuid().nullable(),
    canonicalCheck: z.enum(["checked", "unavailable"]).optional(),
    reconciled: z.array(z.object({
      path: z.string().min(1).max(CONTRIBUTION_PROBLEM_LIMITS.pathCharacters),
      from: z.string().uuid().nullable(),
      to: z.string().uuid(),
    }).strict()).max(1_000).optional(),
  }).strict().optional(),
  // Owner answer 143a: a filed research map's receipt, which finalize_research takes with the research receipts.
  research_receipt: z.string().optional(),
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
  /** The plain answer before research, on the MCP connector only (owner answer 140b); undefined elsewhere. */
  plainAnswer?: PlainAnswerOptions;
  /** This research's map on the MCP connector (owner answer 143a): the offer a paid private map needs, and its receipt. */
  researchMap?: ResearchMapOptions;
  /** This surface's tool list version, which a call's tool_list_version is compared with (owner request, 2026-10-22). */
  toolListVersion?: string;
}

export interface ResearchMapOptions {
  /**
   * Checks the finalizationReceipt a paid private account's map is filed with: signed by this server, unexpired, made
   * to this account and offering to file the map. When it is, the SHA-256 of the receipt as sent, trimmed; else why
   * it is not.
   */
  checkOffer: (receipt: string, accountKey: string) =>
    { ok: true; receiptSha256: string } | { ok: false; reason: string };
  /** Signs the research_map receipt of a map this account filed, or undefined when this server cannot sign receipts. */
  sign: (accountKey: string) => string | undefined;
}

export interface PlainAnswerOptions {
  /**
   * The account references of the accounts the server's settings mark as dev accounts (ASKRIGOR_DEV_ACCOUNT_KEYS,
   * references or whole keys).
   */
  devAccountKeys: () => ReadonlySet<string>;
  /**
   * Signs a plain-answer research receipt bound to the account (plainAnswerAccountBinding), or undefined when this
   * server cannot sign receipts.
   */
  sign: (claims: ResearchReceiptClaims, accountKey: string) => string | undefined;
}

/**
 * Whether an active account registers a plain answer before research (owner answer 140b, 2026-10-20): a paid private
 * account, or one the server's settings mark as a dev account.
 */
export function plainAnswerRequested(
  mode: "FREE_CONTRIBUTOR" | "PAID_PRIVATE",
  accountKey: string,
  devAccountKeys: ReadonlySet<string>,
): boolean {
  return mode === "PAID_PRIVATE" || isDevAccount(accountKey, devAccountKeys);
}

/** Whether the server's settings list this account as a dev account, by its reference (owner answer 140b). */
export function isDevAccount(accountKey: string, devAccountKeys: ReadonlySet<string>): boolean {
  return devAccountKeys.has(researchAccountReference(accountKey));
}

const PLAIN_ANSWER_NOT_REQUESTED = "AskRigor asks paid private accounts and the dev accounts its settings list for a " +
  "plain answer before research; this account is neither, so its research goes ahead without one.";
const NOTE_ON = "The final check then writes a short note comparing the checked answer with this plain answer, for " +
  "the end of the answer.";
const NOTE_OFF = "This account has turned off the note comparing the checked answer with the plain answer; the plain " +
  "answer still guides the research, and set_plain_answer_note turns the note back on.";

// Owner question 154 (2026-10-21): detailed lesson reports, off unless the user turns them on in AskRigor's settings.
export const DETAILED_REPORTS_ON = "Detailed lesson reports are on for this account: a lesson may carry a detailed " +
  "report, shown to the user with the lesson before asking.";
export const DETAILED_REPORTS_OFF = "Detailed lesson reports are off for this account, so a lesson carries no " +
  "detailed report.";

/** What inspect asks of an account that registers a plain answer, before any research call. */
export function plainAnswerRequest(note: boolean): string {
  const { textCharacters, claims, claimCharacters } = PLAIN_ANSWER_LIMITS;
  return "Before any research call, write the short answer you would give without AskRigor's tools, and register it " +
    "with action register_plain_answer: plainAnswer.text, that answer (at most " +
    `${textCharacters.toLocaleString("en-US")} characters); plainAnswer.claims, its main claims, 1 to ${claims} ` +
    `whole sentences each copied exactly from it (at most ${claimCharacters} characters each); and ` +
    "plainAnswer.researchTarget, the research target you will give finalize_research. AskRigor signs it with the " +
    "time. Then treat each claim as something to check, confirm or correct, and look beyond the claims too. " +
    (note ? NOTE_ON : NOTE_OFF);
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
  const respond = manageResearchAccess(options);
  // Owner request (2026-10-22): inspecting is the first step of research, so its result, whatever else it says,
  // first says when this app's copy of AskRigor's tools is out of date.
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const result = await respond(input, extra);
    const notice = toolListNotice(
      typeof input.tool_list_version === "string" ? input.tool_list_version : undefined,
      options.toolListVersion,
    );
    if (notice === undefined) return result;
    const [first, ...rest] = result.content;
    return first?.type === "text"
      ? { ...result, content: [{ ...first, text: `${notice} ${first.text}` }, ...rest] }
      : { ...result, content: [{ type: "text", text: notice }, ...result.content] };
  };
}

function manageResearchAccess(options: ResearchContributorToolOptions) {
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
      if ((parsed.action === "register_plain_answer") !== (parsed.plainAnswer !== undefined)) {
        return accessError(
          "invalid_request",
          "plainAnswer goes only with action register_plain_answer, which needs it.",
        );
      }
      if ((parsed.action === "set_plain_answer_note") !== (parsed.plainAnswerNote !== undefined)) {
        return accessError(
          "invalid_request",
          "plainAnswerNote goes only with action set_plain_answer_note, which needs it.",
        );
      }
      if ((parsed.action === "set_detailed_lesson_reports") !== (parsed.detailedLessonReports !== undefined)) {
        return accessError(
          "invalid_request",
          "detailedLessonReports goes only with action set_detailed_lesson_reports, which needs it.",
        );
      }
      if (parsed.action === "register_plain_answer") {
        return await registerPlainAnswer(options.service, auth.subject, parsed.plainAnswer!, options.plainAnswer);
      }
      if (parsed.action === "set_plain_answer_note") {
        return await setPlainAnswerNote(options.service, auth.subject, parsed.plainAnswerNote!, options.plainAnswer);
      }
      if (parsed.action === "set_detailed_lesson_reports") {
        return await setDetailedLessonReports(options.service, auth.subject, parsed.detailedLessonReports!);
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
      // The account's reference, which the user can give the owner (for example to mark a dev account).
      const accountKey = options.service.accountKeyForSubject(auth.subject);
      const accountReference = researchAccountReference(accountKey);
      // An active account's settings, read once: an active paid private or dev account is asked for its plain answer
      // before research (owner answer 140b), and any active account's lessons carry a detailed report only when it
      // turned detailed lesson reports on (owner question 154).
      const settings = access.status === "ACTIVE" && access.mode !== null
        ? await options.service.activeAccount(auth.subject).catch(() => undefined)
        : undefined;
      const plain = settings !== undefined && options.plainAnswer !== undefined &&
          plainAnswerRequested(settings.mode, accountKey, options.plainAnswer.devAccountKeys())
        ? { note: settings.plainAnswerNote }
        : undefined;
      return {
        content: [{
          type: "text",
          text: (access.status === "ACTIVE"
            ? `AskRigor research access is active in ${access.mode === "FREE_CONTRIBUTOR" ? "free contributor" : "paid private"} mode.`
            : access.status === "REVOKED"
              ? "AskRigor research access is revoked."
              : "Choose free contributor mode or activate an existing paid private entitlement before research use.") +
            (plain === undefined ? "" : ` ${plainAnswerRequest(plain.note)}`) +
            (settings === undefined
              ? ""
              : ` ${settings.detailedLessonReports ? DETAILED_REPORTS_ON : DETAILED_REPORTS_OFF}`) +
            ` This account's reference, to give the user only when they ask for it: ${accountReference}.`,
        }],
        structuredContent: manageResearchAccessOutputSchema.parse({
          ok: true,
          access,
          ...(plain === undefined ? {} : { plainAnswer: { requested: true, note: plain.note } }),
          ...(settings === undefined ? {} : { detailedLessonReports: settings.detailedLessonReports }),
          accountReference,
        }),
      };
    } catch (error) {
      return mappedAccessError(error);
    }
  };
}

/**
 * The active account asked for a plain answer (owner answer 140b), with its key and note setting; undefined for any
 * other account, or on a surface without the plain answer. Throws as activeAccount does for an inactive account.
 */
async function plainAnswerAccount(
  service: ResearchContributorAccessService,
  subject: string,
  plain: PlainAnswerOptions | undefined,
): Promise<{ accountKey: string; note: boolean } | undefined> {
  if (plain === undefined) return undefined;
  const accountKey = service.accountKeyForSubject(subject);
  const account = await service.activeAccount(subject);
  return plainAnswerRequested(account.mode, accountKey, plain.devAccountKeys())
    ? { accountKey, note: account.plainAnswerNote }
    : undefined;
}

/**
 * Signs the plain answer an account asked for one writes before research (owner answer 140b): a 16-character digest
 * of each claim, which must stand as one or more whole sentences of the text (compared as the final check compares
 * answer quotes and caveats, in any language), the SHA-256 of the text, the 12-character digest of the research target
 * and a binding to the account, with the receipt's issue time and order. The receipt holds no text of the plain answer,
 * goes back to the client and is never stored; the text and its claims are not kept.
 */
async function registerPlainAnswer(
  service: ResearchContributorAccessService,
  subject: string,
  plainAnswer: z.infer<typeof plainAnswerInputSchema>,
  plain: PlainAnswerOptions | undefined,
): Promise<CallToolResult> {
  const account = await plainAnswerAccount(service, subject, plain);
  if (account === undefined) return accessError("plain_answer_not_requested", PLAIN_ANSWER_NOT_REQUESTED);
  const stands = sentencesOf(plainAnswer.text);
  const problems: string[] = [];
  plainAnswer.claims.forEach((claim, index) => {
    if (!stands(claim)) {
      problems.push(`plainAnswer.claims[${index}] is not one or more whole sentences copied exactly from ` +
        "plainAnswer.text: copy each claim as the text writes it, from the start of a sentence to its end, within one " +
        "paragraph.");
    }
    const earlier = plainAnswer.claims.findIndex((other, at) => at < index && sameQuote(other, claim));
    if (earlier >= 0) problems.push(`plainAnswer.claims[${index}] repeats plainAnswer.claims[${earlier}]: give each claim once.`);
  });
  if (problems.length > 0) return rejectedPlainAnswer(problems);
  const receipt = plain!.sign({
    claims: plainAnswer.claims.map(plainAnswerClaimDigest),
    text: createHash("sha256").update(plainAnswer.text, "utf8").digest("hex"),
    target: researchTargetDigest(plainAnswer.researchTarget),
  }, account.accountKey);
  if (receipt === undefined) {
    return accessError("receipts_unavailable", "This AskRigor server cannot sign research receipts, so the plain " +
      "answer was not registered; the research goes ahead without it.");
  }
  const count = plainAnswer.claims.length;
  const summary = `Plain answer registered before research: ${count === 1 ? "1 claim" : `${count} claims`}, signed ` +
    "with the time. Treat each claim as something to check, confirm or correct, and look beyond the claims too. Pass " +
    "this research_receipt to finalize_research with the others; there, plain_answer_comparison gives each claim, " +
    "copied exactly as listed here, with whether the research confirmed, corrected or qualified it, or did not check " +
    "it. Claims: " + plainAnswer.claims.map((claim, number) => `${number} ${JSON.stringify(claim)}`).join("; ") + ". " +
    (account.note ? NOTE_ON : NOTE_OFF);
  return {
    content: [
      { type: "text", text: summary },
      { type: "text", text: `research_receipt: ${receipt}` },
      { type: "text", text: FINALIZE_REMINDER },
    ],
    structuredContent: manageResearchAccessOutputSchema.parse({
      ok: true,
      plainAnswer: { requested: true, note: account.note, claims: count },
      research_receipt: receipt,
    }),
  };
}

/** Turns the plain-answer note off or on for an account asked for a plain answer; only the choice is stored. */
async function setPlainAnswerNote(
  service: ResearchContributorAccessService,
  subject: string,
  enabled: boolean,
  plain: PlainAnswerOptions | undefined,
): Promise<CallToolResult> {
  if (await plainAnswerAccount(service, subject, plain) === undefined) {
    return accessError("plain_answer_not_requested", PLAIN_ANSWER_NOT_REQUESTED);
  }
  await service.setPlainAnswerNote(subject, enabled);
  return {
    content: [{
      type: "text",
      text: enabled
        ? "The note comparing a checked answer with the plain answer registered before research is on for this account."
        : "The note comparing a checked answer with the plain answer registered before research is off for this " +
          "account. A plain answer is still registered before research and still guides it.",
    }],
    structuredContent: manageResearchAccessOutputSchema.parse({
      ok: true,
      plainAnswer: { requested: true, note: enabled },
    }),
  };
}

/**
 * Turns detailed lesson reports on or off for an active account, when the user asks (owner question 154); only the
 * choice is stored. Throws as the service does for an inactive account.
 */
async function setDetailedLessonReports(
  service: ResearchContributorAccessService,
  subject: string,
  enabled: boolean,
): Promise<CallToolResult> {
  await service.setDetailedLessonReports(subject, enabled);
  return {
    content: [{
      type: "text",
      text: enabled
        ? "Detailed lesson reports are now on for this account: a lesson may carry a detailed report, shown to the " +
          "user with the lesson before asking and stored only in AskRigor's private lessons repository."
        : "Detailed lesson reports are now off for this account, so a lesson carries no detailed report.",
    }],
    structuredContent: manageResearchAccessOutputSchema.parse({ ok: true, detailedLessonReports: enabled }),
  };
}

/** A plain answer refused before signing, with each problem; nothing was signed or stored. */
function rejectedPlainAnswer(problems: readonly string[]): CallToolResult {
  const message = `The plain answer was not registered: ${problems.length === 1 ? "1 problem" : `${problems.length} problems`}. ` +
    "Fix each and register it again before research; nothing was signed or stored.";
  return {
    content: [{ type: "text", text: [message, ...problems.map((problem, index) => `${index + 1}. ${problem}`)].join("\n") }],
    structuredContent: manageResearchAccessOutputSchema.parse({
      ok: false,
      problems,
      error: { code: "invalid_request", message },
    }),
    isError: true,
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
    const accountKey = options.service.accountKeyForSubject(auth.subject);
    // Owner answer 143a: a paid private account files this research's map only with the user's yes to the offer a
    // final check made to it, which the finalizationReceipt shows; the service decides by the account's mode.
    const receipt = typeof input.finalizationReceipt === "string" ? input.finalizationReceipt : undefined;
    const offer = receipt === undefined || options.researchMap === undefined
      ? undefined
      : options.researchMap.checkOffer(receipt, accountKey);
    try {
      // The service refuses by account first (a paid private account files only a map with the user's yes), then
      // checks the record and names every problem it finds.
      const result = await options.service.submitProposal(auth.subject, input, {
        canonical: options.canonical,
        ...(offer?.ok === true ? { paidPrivateConsent: { receiptSha256: offer.receiptSha256 } } : {}),
      });
      const proposal = {
        proposalId: result.record.proposalId,
        proposalKind: result.record.proposalKind,
        payloadSha256: result.record.payloadSha256,
        status: result.record.status,
        partial: result.record.partial,
        writeStatus: result.status,
        canonicalEvidenceChanged: false,
        supersedesProposalId: result.record.supersedesProposalId ?? null,
        ...(result.canonicalCheck === undefined ? {} : { canonicalCheck: result.canonicalCheck }),
        ...(result.reconciled.length === 0 ? {} : { reconciled: result.reconciled }),
      } as const;
      const continued = result.reconciled.length === 0
        ? ""
        : ` It continues the canonical records it names by exact identity: ${result.reconciled.length} ID` +
          `${result.reconciled.length === 1 ? " was" : "s were"} set to the canonical one${result.reconciled.length === 1 ? "" : "s"} ` +
          "(proposal.reconciled), so the stored record and its hash differ from the one sent.";
      // Owner answer 143a: a filed research map returns a receipt, so the final check sees this research's map filed.
      const mapReceipt = proposal.proposalKind === "RESEARCH_FRONTIER" ? options.researchMap?.sign(accountKey) : undefined;
      return {
        content: [
          {
            type: "text",
            text: `${proposal.proposalKind === "RESEARCH_FRONTIER" ? "Research frontier" : proposal.proposalKind === "TOPIC_LINK" ? "Topic link" : "Source analysis"} proposal ${proposal.writeStatus === "inserted" ? "entered" : "was already present in"} the review inbox. Canonical evidence was not changed.${continued}`,
          },
          ...(mapReceipt === undefined ? [] : [
            { type: "text" as const, text: `research_receipt: ${mapReceipt}` },
            { type: "text" as const, text: "Give finalize_research this research_receipt with the research receipts." },
          ]),
        ],
        structuredContent: submitResearchContributionOutputSchema.parse({
          ok: true,
          proposal,
          ...(mapReceipt === undefined ? {} : { research_receipt: mapReceipt }),
        }),
      };
    } catch (error) {
      if (error instanceof ResearchContributionRejectedError) return rejectedProposal(error);
      // A paid private map refused because its receipt did not show the offer: say why the receipt did not count.
      if (
        offer !== undefined && !offer.ok && error instanceof ResearchAccessError &&
        error.code === "PAID_PRIVATE_DOES_NOT_CONTRIBUTE"
      ) {
        return proposalError("paid_private_does_not_contribute", `${error.message} The finalizationReceipt sent ` +
          `does not count: ${offer.reason}`);
      }
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
      ? " The record in payload is checked once proposalKind is RESEARCH_FRONTIER, SOURCE_ANALYSIS or TOPIC_LINK."
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
 * contributor) or offered for a yes (paid private); its plain-answer note
 * setting (owner answer 140b); whether its lessons may carry a detailed
 * report (owner question 154); and the free contributor notice it accepted
 * (decision 171: its cards are published as soon as they are saved under the
 * current one). Undefined for an inactive account, a call without a valid
 * research:use token, or no access service. Never throws.
 */
export async function researchUseAccount(
  extra: ResearchOperationExtra | undefined,
  service: ResearchContributorAccessService | undefined,
): Promise<{
  mode: "FREE_CONTRIBUTOR" | "PAID_PRIVATE";
  accountKey: string;
  plainAnswerNote: boolean;
  detailedLessonReports: boolean;
  noticeVersion: string | null;
} | undefined> {
  const auth = authorizedSubject(extra, undefined);
  if ("error" in auth || service === undefined) return undefined;
  try {
    const { mode, plainAnswerNote, detailedLessonReports, noticeVersion } = await service.activeAccount(auth.subject);
    return {
      mode,
      accountKey: service.accountKeyForSubject(auth.subject),
      plainAnswerNote,
      detailedLessonReports,
      noticeVersion,
    };
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
