import { createHash } from "node:crypto";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ADJUSTMENT_DETAILS,
  CONTRIBUTION_PROBLEM_LIMITS,
  CONTRIBUTION_PROBLEM_RULES,
  NOTICE_ACCEPTED_BY,
  RESEARCH_STYLES,
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
  researchSteeringSchema,
  type CanonicalIdentityReader,
  type ResearchAccessView,
  type ResearchMenuChoice,
  type ResearchMenuChoiceInput,
  type ResearchSteering,
  type ResearchCallRecordStore,
  MENU_CHOICE_LIMITS,
  RESEARCH_CALL_RECORD_RETENTION_DAYS,
  RESEARCH_PLAN_DECISIONS,
  RESEARCH_PLAN_LANES,
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
import { NAMED_VIDEOS_SIGNED, namedVideoIdsIn, researchMapSavedLine } from "./findings/card.js";
import {
  RESEARCH_DOSSIER_GUARDS,
  RESEARCH_DOSSIER_REQUEST,
  researchDossierShape,
  researchDossierAllowed,
} from "./findings/dossier.js";
import {
  askrigorHoldsSchema, heldFor, heldText, heldVariants, HELD_NEXT_STEP, holdsSomethingNow, OWNER_POINTER_HOW,
  ownerPointerText, shownOwnerPointer, shownOwnerPointerSchema, type AskRigorHolds, type AskRigorHoldsOptions,
} from "./askrigor-holds.js";
import { askedText, callsPageSchema, findingsSaveOff, laterInputShape, latestMessage } from "./later-inputs.js";
import { SAFETY_LIMITS_INSPECT_SENTENCE } from "./safety-limits.js";
import { ownerPointerById } from "./owner-pointers.js";
import { MCP_RESULT_MAX_BYTES } from "./config.js";
import { clientResultBytes, isChatGptCall, withPendingPlanLane } from "./tool-result.js";
import {
  ANSWER_REVIEW_ASKED,
  ASKED_LIMIT,
  ASKED_REQUEST,
  COULD_CHANGE,
  LEARN_MODE_OFF,
  LEARN_MODE_ON,
  LEARN_MODE_UNAVAILABLE,
  MENU_PLACEHOLDERS,
  PERSON_ANSWER_DECLARED,
  PERSON_GO_AHEADS,
  personGoAheadProblem,
  PLANNER_NOT_USED_REASONS,
  PLANNER_PAUSE_MAX_MINUTES,
  PLAN_TASK_KINDS,
  RESEARCH_LANES,
  RESEARCH_LOOPS,
  FORM_PEOPLE_USE,
  STEERING_CHOICE,
  URGENT_FIRST,
  asideGuidance,
  asideNextStep,
  ORDINARY_STEERING_WORDING,
  correctedMenu,
  correctedMenuSchema,
  framingGuidance,
  framingNextStep,
  learnModeInspectSentence,
  cleanedReason,
  menuChoiceOf,
  menuProblems,
  goOnMark,
  menuDigest,
  menuReadingSentence,
  choicePlaceholderWords,
  menuRefusalText,
  planNextStep,
  planResearch,
  planResearchText,
  plannedGuidance,
  plannedNextStep,
  plannerNotUsedSentence,
  readResearchMenu,
  researchMenuSchema,
  steeringChoiceLeftOut,
  steeringChoiceRefusalText,
  steeringChoiceUnclearDecides,
  steeringChoiceUnclearText,
  steeringInspectText,
  steeringSentence,
  youDecideLaterInputs,
  youDecideLaterInputsSchema,
  type Framing,
  type MenuReading,
  type PlannedResearch,
  type PlannerNotUsedReason,
  type ResearchMenuInput,
  type ResearchSteeringInput,
} from "./research-steering.js";
import type { MenuHistoryEntry, ResearchPlanner } from "./research-planner.js";
import type { ResearchReviewer } from "./research-reviewer.js";
import type { ResearchOperationExtra, ResearchOperationHandler } from "./research-operation.js";
import {
  SHARED_ANSWER_KEPT,
  SharedAnswersFullError,
  sharedAnswerProblems,
  type SharedAnswers,
  type SharedAnswerVersions,
} from "./shared-answers.js";
import {
  atlasReportResultSchema,
  shareReport,
  takeDownReport,
  type AtlasReportDoor,
  type ReportRefusalCode,
} from "./atlas/report-door.js";
import {
  RESEARCH_RECEIPT_MAX_CHARACTERS,
  researchTargetDigest,
  type ResearchReceiptClaims,
} from "./research-receipts.js";
import { toolListNotice, toolListVersionField } from "./tool-list-currency.js";
import { WHAT_STOPS_TEXT, whatStops, whatStopsSchema } from "./findings-ledger.js";

// A notice version as a pattern, not the current value: clients keep a tool's
// schema for as long as a chat or connector lives, so a constant here would let
// a copy from before a notice change refuse the current version, and the user
// could not accept it (owner report, 2026-10-03). The service still accepts
// only the current notice; manage_research_access names it when it differs.
const noticeVersionSchema = z.string().regex(/^free-contributor-v[0-9]{1,3}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
  .describe("The notice version the user accepted, exactly as inspect returns it.");

// The plain answer any active research account registers before research (owner answer 190a, 2026-10-27).
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
    "set_findings_save",
    // Owner answer 200a: runtime-only actions, named by the final check's share_offer (owner answer 189a).
    "share_answer",
    "delete_shared_answer",
    // Owner answer 229a: a person's report of what worked for them, to the Atlas, and its take-down (runtime only).
    "share_report",
    "take_down_report",
    // Owner answer 279a (9 Nov 2026): the account's research style, and the menu of next tasks (runtime only).
    "set_research_steering",
    "plan_research",
    // Owner answer 435a: this action is learned from the registration result, without changing the published list.
    "get_research_plan",
    "list_calls",
    // The owner, 14 Nov 2026 (runtime only): one of the owner's pointers, by the id a registration's result lists.
    "owner_pointer",
    // Owner answer 386b (21 Nov 2026; runtime only): end every Gemini link of this account, from any connected app.
    "disconnect_gemini",
    // Owner answer 395b (21 Nov 2026, runtime only): a test round's pause of a dev account's planning call.
    "pause_research_planner",
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
  findingsSave: z.boolean().optional()
    .describe("With set_findings_save, dev accounts only: false turns findings-card saving off, true back on."),
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
  paidCheckoutAvailable: z.boolean(),
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
    "dev_account_required",
    "receipts_unavailable",
    "sharing_unavailable",
    "share_refused",
    "share_limit_reached",
    "invalid_request",
  ]),
  message: z.string(),
}).strict();

export const manageResearchAccessOutputSchema = z.object({
  ok: z.boolean(),
  access: researchAccessViewSchema.optional(),
  plainAnswer: z.object({
    requested: z.literal(true)
      .describe("This account has active research access and registers a plain answer before research."),
    note: z.boolean().describe("Whether its checked answers end with the note comparing them with the plain answer."),
    claims: z.number().int().min(1).max(PLAIN_ANSWER_LIMITS.claims).optional()
      .describe("With register_plain_answer: how many claims were signed."),
  }).strict().optional(),
  detailedLessonReports: z.boolean().optional()
    .describe("Whether this account's lessons may carry a detailed report: off unless the user turned detailed " +
      "lesson reports on."),
  findingsSave: z.boolean().optional()
    .describe("Shown to dev accounts only: whether this account saves findings cards, on by default."),
  research_receipt: z.string().optional(),
  accountReference: z.string().regex(new RegExp(`^[a-f0-9]{${RESEARCH_ACCOUNT_REFERENCE_CHARACTERS}}$`, "u")).optional()
    .describe("This account's reference, the first characters of its pseudonymous key: the user can give it to " +
      "AskRigor's owner, for example to be listed as a dev account. It names no one. Give it only when the user asks " +
      "for it."),
  problems: z.array(z.string()).optional(),
  error: researchAccessErrorSchema.optional(),
}).strict();

/** The account tool's inputs as its handler reads them: the published ones and its later shape (owner answer 189a). */
const manageResearchAccessRuntimeInputSchema = manageResearchAccessInputSchema.safeExtend(
  laterInputShape("manage_research_access"));

/**
 * An active free account's yes, as inspect returns it at runtime (the owner, 6 November 2026; owner answer 189a keeps the
 * published access shape): the notice it holds, when and how it was accepted, and whether it carries forward.
 */
const noticeAcceptanceSchema = z.object({
  noticeVersion: noticeVersionSchema,
  acceptedAt: z.string(),
  acceptedBy: z.enum(NOTICE_ACCEPTED_BY).nullable(),
  current: z.enum(["accepted", "carried_forward"]),
}).strict();

/** Its results as the server checks them: the published fields and the shared answer's (owner answer 200a). */
export const manageResearchAccessRuntimeOutputSchema = manageResearchAccessOutputSchema.extend({
  error: researchAccessErrorSchema.extend({
    // Owner answer 303a: learn mode asked of an account that is not a dev account, or while the planning call is off.
    code: z.union([researchAccessErrorSchema.shape.code, z.literal("call_record_unavailable"),
      z.literal("learn_mode_unavailable"), z.literal("gemini_links_unavailable"), z.literal("planner_off")]),
  }).optional(),
  // Owner answer 386b (runtime only): how many Gemini links the account has, and how many a disconnect ended.
  geminiLinks: z.number().int().nonnegative().optional(),
  geminiLinksEnded: z.number().int().nonnegative().optional(),
  calls: z.array(z.object({
    received_at: z.iso.datetime(), tool: z.string(), action: z.string().nullable(),
    route: z.enum(["/mcp", "/mcp/claude", "/mcp/gemini"]), chatgpt: z.boolean(),
    outcome: z.enum(["answered", "refused", "failed"]), code: z.string().nullable(),
    duration_ms: z.number().int().min(0).max(86_400_000),
    // Owner answer 289a: plan_research's decision, from AskRigor's own result, on its rows only.
    plan_next: z.enum(RESEARCH_PLAN_DECISIONS).optional(),
    // Its twin (migration 0035): the lane AskRigor's own plan gave a register_plain_answer call, on its rows only.
    plan_lane: z.enum(RESEARCH_PLAN_LANES).optional(),
  }).strict()).max(500).optional(),
  retention_days: z.literal(RESEARCH_CALL_RECORD_RETENTION_DAYS).optional(),
  // The review of 12 Nov 2026: a listing that shows only some of the calls says which, and where the next ones start.
  calls_page: z.object({
    shown: z.number().int().min(0),
    total: z.number().int().min(0),
    before: z.string().optional(),
    next_before: z.string().optional(),
  }).strict().optional(),
  access: researchAccessViewSchema.safeExtend({ acceptance: noticeAcceptanceSchema.optional() }).optional(),
  sharedAnswer: z.object({
    code: z.string(),
    expiresAt: z.string(),
    kept: z.string(),
  }).strict().optional(),
  sharedAnswerDeleted: z.boolean().optional(),
  // Owner answer 229a: the report sent to the Atlas, or taken down.
  atlasReport: atlasReportResultSchema.optional(),
  // The owner's report of 6 Nov 2026 (runtime only, owner answer 189a): inspect's next step for an account whose research
  // waits on the free-use notice; since 11 Nov, register_plain_answer's and plan_research's too, for an app that hands its
  // model only the structured content.
  next_step: z.string().optional()
    .describe("What to do next. With inspect, for an account that is not active on the current notice: show the user " +
      "the notice and ask; never accept it for them. With register_plain_answer and plan_research: whether to ask the " +
      "person and end the turn, or go on."),
  // Owner answer 279a (runtime only): the account's research style, and the menu plan_research made. Learn mode (owner
  // answer 303a) is shown to a dev account only (shownSteering).
  steering: researchSteeringSchema.partial({ learnMenuChoices: true }).optional(),
  researchMenu: z.object({
    tasks: z.array(z.object({
      n: z.number().int(),
      task: z.string(),
      kind: z.enum(PLAN_TASK_KINDS),
      could_change: z.enum(COULD_CHANGE),
      person_asked: z.literal(true).optional(),
      loop: z.enum(RESEARCH_LOOPS).optional(),
      minutes: z.tuple([z.number(), z.number()]).nullable(),
    }).strict()),
    recommended: z.array(z.object({ task: z.number().int(), minutes: z.number() }).strict()),
    recommended_minutes: z.tuple([z.number(), z.number()]),
    next: z.enum(["ask", "go_on"]),
    // The judgment the menu gave: its steering_choice read as one (a named question true, the word none false),
    // otherwise its own steering_could_help.
    steering_could_help: z.boolean().optional(),
    // Owner answer 296b (13 Nov 2026): the question the menu named, with an ask, for the reply to put to the person.
    steering_choice: z.string().optional(),
    // Owner answer 297c (13 Nov 2026): the menu named no question and goes on, so the answer says its reading first.
    say_reading_first: z.literal(true).optional(),
    // Owner answer 302 (14 Nov 2026): AskRigor's own light plan, whose go-ahead is one task and one final check.
    // Runtime only: every published output schema is open, so the frozen tool lists stay as they are.
    lane: z.literal("light").optional(),
    style: z.enum(RESEARCH_STYLES),
    check_back_minutes: z.number().int(),
    adjustment_detail: z.enum(ADJUSTMENT_DETAILS),
    minutes_since_plain_answer: z.number().int().optional(),
    target_matches_plain_answer: z.boolean().optional(),
    menu_digest: z.string().optional(),
    menu_changed: z.literal(true).optional(),
    // Round 3 of the owner's ChatGPT runs (12 Nov 2026; every account since 13 Nov 2026): the call's allocation was
    // not used, as it came without person_answered true.
    allocation_not_used: z.literal(true).optional(),
    // Owner answer 304a (14 Nov 2026; runtime only): a balanced menu that could take more than about 10 minutes goes
    // on, since AskRigor's own plan read the person's newest message as telling the AI to go on.
    went_on_as_asked: z.literal(true).optional(),
    // AskRigor#467 (15 Nov 2026; runtime only): the menu went on on the person's own go-ahead, given before it was
    // shown, and the question it named, which the answer says what it assumed for.
    went_ahead: z.enum(PERSON_GO_AHEADS).optional(),
    assumed_answer_to: z.string().optional(),
    go_ahead_may_answer: z.literal(true).optional(),
    research_started: z.literal(true).optional(),
    first_menu: z.literal(true).optional(),
    person_steered: z.literal(true).optional(),
    person_steered_problem: z.string().optional(),
    person_steered_invalid: z.literal(true).optional(),
  }).strict().optional(),
  // 12 Nov 2026 (runtime only): an ask's "you decide" call, ready to copy, and a refused menu's example, built from the
  // call's own. The call carries person_answered's placeholder, to be replaced (every account since 13 Nov 2026).
  you_decide_later_inputs: youDecideLaterInputsSchema.optional()
    .describe("With plan_research's ask: the later_inputs for the person's \"you decide\", with the recommended " +
      "allocation inside researchMenu, to be sent after replacing <true|false> in person_answered with whether the " +
      "person has answered this menu in a message of their own."),
  menu_outline: correctedMenuSchema.optional(),
  corrected_later_inputs: correctedMenuSchema.optional()
    .describe("With a plan_research call whose menu could not be read: its later_inputs as they should be, built from " +
      "its own; replace each <...> with one of the values it lists."),
  // Owner answer 298b (13 Nov 2026; runtime only): with register_plain_answer on a dev account, the plan AskRigor's
  // own model call made, the plan_research call that carries it, or why that call was not used.
  // Owner answer 302 (14 Nov 2026; runtime only, as the rest of this field): every plan has a lane.
  research_plan: z.object({
    source: z.literal("askrigor_planning_call"),
    about: z.string(),
    steering_choice: z.string(),
    searches: z.number().int().min(0),
    from_asked: z.boolean(),
    lane: z.enum(RESEARCH_LANES),
    // Owner answer 304a (14 Nov 2026; runtime only): the planning call read the person's newest message as telling
    // the AI to go on, and the menu handed over carries AskRigor's mark for it.
    person_said_go_on: z.literal(true).optional(),
  }).strict().optional()
    .describe("With register_plain_answer on a dev account: what AskRigor's own planning call found the question to " +
      "be about, the one question it would put to the person or the word none, how many web searches it ran, " +
      "whether it had the person's own words, and its lane: research; light, one fact that one named source states, " +
      "opened and quoted with one final check; or aside, a plain look-up AskRigor steps aside for, with no " +
      "planned_later_inputs."),
  planned_later_inputs: z.object({ researchMenu: researchMenuSchema }).strict().optional()
    .describe("With research_plan: the later_inputs to send to plan_research next, exactly as given."),
  // The owner, 14 Nov 2026 (runtime only): what AskRigor already holds for the registered question, for every
  // account and in every lane, and one of the owner's pointers by its id.
  askrigor_holds: askrigorHoldsSchema.optional()
    .describe("With register_plain_answer: the Atlas's findings that share words with the question, to be read " +
      "before answering in any lane and given where they bear on it; the owner's pointers for this kind of " +
      "question, to be given as the owner's own; and the questions the owner keeps other pointers for."),
  owner_pointer: shownOwnerPointerSchema.optional()
    .describe("With owner_pointer: the owner's pointer with that id, to be given to the person as the owner's own."),
  research_plan_not_used: z.enum(PLANNER_NOT_USED_REASONS).optional()
    .describe("With register_plain_answer on a dev account: why AskRigor's own planning call was not used."),
  // AskRigor#477 stage 1 (runtime only): the research dossier, asked for with a research plan that goes on, for an
  // account a dossier can be saved for, here as well as in the text, for an app that hands its model only this
  // (Codex's red team of the instruction proposal, item 1).
  research_dossier_request: z.object({
    instruction: z.string(),
    shape: z.string(),
    guards: z.string(),
  }).strict().optional()
    .describe("With plan_research, when a research dossier can be saved: when to include one with the final check, " +
      "its shape, and what keeps it truthful."),
  // Enforcing HRP, stage 1 (runtime only): what can stop the answer, here as well as in the text.
  what_stops: whatStopsSchema.optional()
    .describe("With plan_research, while AskRigor keeps a findings ledger: the six checks that stop a whole answer, " +
      "each in its scope, once the call gives a usable answer_draft and research_target; everything else is a note to " +
      "fix or dispute."),
  // Owner answer 395b (runtime only): when a dev account's paused planning call starts again; null once none runs. Only
  // the pause's own result carries it: inspect, which every AI calls before research, says nothing of a pause.
  plannerPausedUntil: z.iso.datetime().nullable().optional()
    .describe("With pause_research_planner: when AskRigor's own planning call starts again for this account, in " +
      "UTC; null when no pause runs."),
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

/**
 * Its results as the server checks them (owner answer 189a keeps the published shape): with a filed research map, the
 * next step, which carries the answer's closing line and where it goes, for an app that hands its model only the
 * structured content (Claude Code; the review of 12 Nov 2026).
 */
export const submitResearchContributionRuntimeOutputSchema = submitResearchContributionOutputSchema.extend({
  next_step: z.string().optional()
    .describe("With a filed research map: how the answer shows it was filed, with the line and where it goes."),
});

/**
 * What a filed research map's answer does (11 Nov 2026): filed after this turn's check passed, the answer ends with the
 * map's line itself, so filing asks for no new final check (in the 10 Nov timing runs, 49 of 88 checks came after a pass
 * in the same turn); filed before, its receipt goes to the check with the others, whose result then gives the line, as
 * the server instructions and the skill say.
 */
export function researchMapFiledStep(): string {
  return "If this turn's final check has already passed, end the answer, after any saved line and just before the " +
    "check line, with this line, as written (in the answer's language when it is not in English): " +
    `${researchMapSavedLine(undefined)} Otherwise, give finalize_research this research_receipt with the research ` +
    "receipts, and its result gives that line.";
}

/** One person's Gemini links, by their OAuth subject (gemini-sign-in/resource.ts). */
export interface GeminiLinks {
  count(subject: string): Promise<number>;
  disconnect(subject: string): Promise<number>;
}

export interface ResearchContributorToolOptions {
  service?: ResearchContributorAccessService;
  callRecord?: ResearchCallRecordStore;
  resourceMetadataUrl?: URL;
  /** What happened to this request's sign-in on /mcp; undefined without OAuth. */
  signIn?: SignInState;
  /**
   * On a surface whose tool list has no manage_research_access (Gemini's compact list), a refusal for an account that has
   * not accepted the notice says where the person can accept it, instead of naming a tool the AI cannot call.
   */
  noticeElsewhere?: boolean;
  /** Gemini's sign-in (owner answer 386b): one account's links, to count in inspect and to end with disconnect_gemini. */
  geminiLinks?: GeminiLinks;
  /**
   * Promise P69 (owner answer 400a): with ASKRIGOR_SAFETY_LIMITS on, inspect gives the shape of finalize_research's
   * later input safety_limits, which HRP's LimitsNote asks every AI to declare and nothing published describes.
   */
  safetyLimits?: boolean;
  /** The canonical store's read-only identity view, which a submitted frontier is reconciled with. */
  canonical?: CanonicalIdentityReader;
  /** The plain answer before research, on the MCP connector only (owner answer 140b); undefined elsewhere. */
  plainAnswer?: PlainAnswerOptions;
  /** This research's map on the MCP connector (owner answer 143a): the offer a paid private map needs, and its receipt. */
  researchMap?: ResearchMapOptions;
  /** This surface's tool list version, which a call's tool_list_version is compared with (owner request, 2026-10-22). */
  toolListVersion?: string;
  /** The dev accounts permitted to change findings-card saving (owner answer 171). */
  devAccountKeys?: () => ReadonlySet<string>;
  /** Shared questions and answers (owner answer 200a), with the versions they are given under; undefined when off. */
  sharedAnswers?: SharedAnswers & { versions: () => Promise<SharedAnswerVersions> };
  /** People's reports to the Atlas (owner answer 229a); undefined while the Atlas takes none. */
  atlasReports?: AtlasReportDoor;
  /** The secret plan_research keys its menu digest with (the review of 12 Nov 2026); undefined: no digest. */
  menuDigestSecret?: () => string | undefined;
  /** AskRigor's own planning call (owner answer 298b), for dev accounts; undefined or not enabled: every account plans as before. */
  researchPlanner?: () => ResearchPlanner | undefined;
  /**
   * AskRigor's own review of a draft at the final check (owner answer 301a), for dev accounts; while it is on, a planned
   * registration also asks for the person's words at the final check.
   */
  researchReviewer?: () => ResearchReviewer | undefined;
  /** A failure's class only, never its message (owner answer 303a: menu_choice_not_recorded); console.error by default. */
  log?: (failureClass: string) => void;
  /**
   * What AskRigor already holds for a registered question (the owner, 14 Nov 2026): the Atlas's findings near it and
   * the owner's pointers. Undefined: a registration says nothing of either, and owner_pointer finds none.
   */
  askrigorHolds?: AskRigorHoldsOptions;
  /** AskRigor#477 stage 1: research dossiers are saved (ASKRIGOR_RESEARCH_DOSSIERS), so plan_research may ask for one. */
  researchDossiers?: boolean;
  /**
   * AskRigor#477 stage 2: public dossiers are on (ASKRIGOR_PUBLIC_DOSSIERS), so the dossier's shape asks for stage 2's
   * declarations too; otherwise it is stage 1's as released.
   */
  publicDossiers?: boolean;
  /**
   * Enforcing HRP, stage 1 (design-v2 of 17 Nov 2026): while the findings ledger is on for the account (whether it is
   * one of the owner's development accounts is given), plan_research says up front what can stop an answer at the final
   * check (the owner's note on question 338): the six whole-answer stops.
   */
  findingsLedger?: (devAccount: boolean) => boolean;
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
   * Signs a plain-answer research receipt bound to the account (plainAnswerAccountBinding), or undefined when this
   * server cannot sign receipts.
   */
  sign: (claims: ResearchReceiptClaims, accountKey: string) => string | undefined;
  /**
   * Reads a plain-answer research receipt this account signed: its research target's digest and its issue time; undefined
   * when it is not a valid plain-answer receipt of this account, or this server cannot verify receipts.
   */
  read?: (receipt: string, accountKey: string) => { target: string; issuedAt: string } | undefined;
}

/** Whether this mode has active research access and registers a plain answer (owner answer 190a). */
export function plainAnswerRequested(mode: string | null | undefined): boolean {
  return mode === "FREE_CONTRIBUTOR" || mode === "PAID_PRIVATE";
}

/** Whether the server's settings list this account as a dev account, by its reference (owner answer 140b). */
export function isDevAccount(accountKey: string, devAccountKeys: ReadonlySet<string>): boolean {
  return devAccountKeys.has(researchAccountReference(accountKey));
}

const PLAIN_ANSWER_NOT_REQUESTED = "AskRigor asks every account with active research access for a " +
  "plain answer before research; this account has no active research access.";
const PLAIN_ANSWER_SURFACE_UNAVAILABLE = "This surface does not offer plain-answer registration or its note.";
const NOTE_ON = "The final check then writes a short note comparing the checked answer with this plain answer, for " +
  "the end of the answer.";
const NOTE_OFF = "This account has turned off the note comparing the checked answer with the plain answer; the plain " +
  "answer still guides the research, and set_plain_answer_note turns the note back on.";

// Owner question 154 (2026-10-21): detailed lesson reports, off unless the user turns them on in AskRigor's settings.
export const DETAILED_REPORTS_ON = "Detailed lesson reports are on for this account: a lesson may carry a detailed " +
  "report, shown to the user with the lesson before asking.";
export const DETAILED_REPORTS_OFF = "Detailed lesson reports are off for this account, so a lesson carries no " +
  "detailed report.";

export const FINDINGS_SAVE_ON = "Findings-card saving is on for this dev account.";
export const FINDINGS_SAVE_OFF = "Findings-card saving is off for this dev account; its final check still checks " +
  "the findings card and the answer.";

/** A time as the pause's texts give it: hours and minutes, UTC. */
const utcClock = (at: number): string => new Date(at).toISOString().slice(11, 16);

/**
 * Owner answer 395b (21 Nov 2026): the pause's own result, for the session that runs a test round, which compares the
 * account's research with and without AskRigor's own planning call.
 */
export function plannerPausedText(until: number): string {
  return `AskRigor's own planning call is paused for this dev account until ${utcClock(until)} UTC ` +
    `(${new Date(until).toISOString()}). Until then this account's research goes as with that call off: a ` +
    "registration makes no plan, inspect asks for none of the person's words and says nothing of the pause, a menu's " +
    "answers are not kept for learn mode, and the final check finds no plan's lane; the final check's review of a " +
    "draft still runs, from the research target alone unless the person's words come with the call. The plans the " +
    "last hour kept for this account are forgotten, so no research registered during or after the pause takes one " +
    "made before it; research registered before it keeps its own. The call starts again by itself at that time. " +
    `Paused again while it runs, it keeps its start and ends at most ${PLANNER_PAUSE_MAX_MINUTES} minutes after it; ` +
    "0 minutes ends it now. A restart of AskRigor's server ends it too: the call record (list_calls) shows a plan's " +
    "lane on each registration that was planned, so a registration made while the pause ran shows none.";
}

/** Owner answer 395b: a pause ended, or none ran. */
export const PLANNER_PAUSE_ENDED = "AskRigor's own planning call is on for this dev account: no pause runs.";

/** Owner answer 395b: nothing to pause while the planning call is off on the server. */
export const PLANNER_OFF_NOTHING_PAUSED = "AskRigor's own planning call is off on this server, so there is nothing to " +
  "pause; nothing was changed.";

/** A menu without the light lane only AskRigor's own plan sets (owner answer 395b: not honoured during a pause). */
function withoutLane<T extends { lane?: unknown }>(menu: T): T {
  const { lane: _lane, ...rest } = menu;
  return rest as T;
}

export function planBuildingLine(planned: boolean): string {
  return "If this inspect starts research on a question of theirs, then before your next call, tell the person in one line, in their language: you are " +
    (planned ? "building the research plan, about a minute; " :
      "taking a first look to build the research plan, a few minutes; ") +
    "then you will show it and say whether you are waiting for their choice or starting, and how they can change it.";
}

function registrationMenuOutline(target: string | undefined, receipt: string, devAccount: boolean) {
  // Supply only the registered target and opaque receipt, never the quick answer, claims or person's words.
  const outline = correctedMenu({ research_target: target !== undefined && target.length <= 300 ? target : undefined,
    plain_answer_receipt: receipt });
  if (!devAccount) {
    // Reuse the ordinary menu's exact instruction, not a new steering rule or a default judgment.
    outline.researchMenu.steering_could_help = `<${ORDINARY_STEERING_WORDING}>`;
  }
  return outline;
}

/**
 * AskRigor's own planning call for this account (owner answer 298b): the planner while it is on, for a dev account
 * whose call no test round has paused (owner answer 395b); otherwise undefined, and the account plans as with the
 * call off.
 */
function activePlanner(options: ResearchContributorToolOptions, accountKey: string, devAccount: boolean):
  ResearchPlanner | undefined {
  if (!devAccount) return undefined;
  const planner = options.researchPlanner?.();
  return planner?.enabled === true && planner.pausedUntil?.(accountKey) === undefined ? planner : undefined;
}


/**
 * What inspect asks of an account whose research waits on the free-use notice: one not enrolled, one revoked, or one
 * active under an earlier notice, which inspect shows as not enrolled (the owner's report, 6 November 2026: when their
 * login hadn't accepted the new notice, ChatGPT only told them they couldn't use AskRigor, and never showed the notice
 * or asked them to agree). The research tools' refusal already says to call inspect and show the notice.
 */
export function noticeNextStep(): string {
  return "Show the user this notice, word for word, and ask whether they accept it for free research (or use paid " +
    "private access if they have it). Only after their yes, call manage_research_access with action " +
    `accept_free_contributor and agreement {noticeVersion: "${RESEARCH_USE_NOTICE_VERSION}", ` +
    "eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true, " +
    "proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true}. Never accept for them.";
}

/**
 * How an active free account holds the current notice, when its text should say so (the owner, 6 November 2026): a yes
 * to an earlier notice that carries forward, since every version after it changed only wording, or the owner's
 * standing instruction for the owner's own login. Empty for a yes the person gave to the current notice.
 */
export function noticeAcceptanceSentence(acceptance: ResearchAccessView["acceptance"]): string {
  if (acceptance === undefined) return "";
  const standing = acceptance.acceptedBy === "OWNER_STANDING_INSTRUCTION_2026_11_06"
    ? ` The owner's standing instruction of 6 November 2026 accepted notice ${acceptance.noticeVersion} for this login ` +
      `at ${acceptance.acceptedAt}.`
    : acceptance.acceptedBy === null
      ? ` How notice ${acceptance.noticeVersion} was accepted for this login wasn't recorded.`
      : "";
  const carried = acceptance.current === "carried_forward"
    ? ` This account's yes to notice ${acceptance.noticeVersion} carries forward to ${RESEARCH_USE_NOTICE_VERSION}, ` +
      "which changed only wording."
    : "";
  return `${standing}${carried}`;
}

/**
 * What inspect asks of an account that registers a plain answer, before any research call. It opens with the run's
 * shape (11 Nov 2026): the stop at an ask is said before the first step, where it costs nothing.
 */
export function plainAnswerRequest(note: boolean): string {
  const { textCharacters, claims, claimCharacters } = PLAIN_ANSWER_LIMITS;
  return "A research run goes: action register_plain_answer with later_inputs.framing, a short screen, action " +
    "plan_research, the tasks chosen, then finalize_research; when a result says to ask the person and wait, your " +
    "reply is that question and the turn ends there. " +
    "Before any research call, write the short answer you would give without AskRigor's tools, and register it " +
    "with action register_plain_answer: plainAnswer.text, that answer (at most " +
    `${textCharacters.toLocaleString("en-US")} characters); plainAnswer.claims, its main claims, 1 to ${claims} ` +
    `whole sentences each copied exactly from it (at most ${claimCharacters} characters each); and ` +
    "plainAnswer.researchTarget, the research target you will give finalize_research. " +
    // 11 Nov 2026: the costliest misses were the question's own premises (a PewDiePie run never checked "China has yet
    // to accomplish"); as claims of the plain answer, the sixth blocking check compares each with the research.
    "When the question asserts or assumes something checkable (a fact, a cause, a comparison, or that something can't " +
    "be or hasn't been done), give your quick verdict on each such premise in a sentence of its own, and put those " +
    "sentences first among the claims (Universal premise_integrity_and_truth_priority_gate, rule 2). AskRigor signs " +
    "it with the time. Then treat each claim as something to check, confirm or correct, and look beyond the claims " +
    "too. " +
    (note ? NOTE_ON : NOTE_OFF) + " " + FRAMING_REQUEST;
}

// Owner answer 280a (9 Nov 2026): inspect names the call record, so the AI can answer "did AskRigor get my request?"
export const CALL_RECORD_SENTENCE = "When the person asks whether AskRigor received their calls, action list_calls " +
  "lists the calls AskRigor received from this signed-in account in the last 7 days, without their content.";

// Owner answer 279a (9 Nov 2026): the framing goes with the plain answer, before any research call.
const FRAMING_REQUEST = "With it, give later_inputs.framing: likely_question, the question the person most likely " +
  "means; premise_doubts, anything in it that looks inverted, unclear or possibly false; and redirecting_questions, " +
  "up to three questions whose answers could change what to research (none when it is clear). The result says " +
  "whether to ask the person before researching. " + FORM_PEOPLE_USE;

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
  ): Promise<CallToolResult> => withToolListNotice(await respond(input, extra), input, options.toolListVersion);
}

/** A result with the notice that this call's app has an out-of-date copy of AskRigor's tools, when it has. */
function withToolListNotice(result: CallToolResult, input: Record<string, unknown>,
  toolListVersion: string | undefined): CallToolResult {
  const notice = toolListNotice(
    typeof input.tool_list_version === "string" ? input.tool_list_version : undefined,
    toolListVersion,
  );
  if (notice === undefined) return result;
  // The 12 Nov release check (Codex's AskRigor app): a plan_research call that sent no tool_list_version read this
  // notice before "Ask now", the stop the 11 Nov build puts first. Inspect keeps it first, as the owner asked; on
  // the steps after inspect the result's own next step comes first and the notice follows it.
  if (input.action !== "inspect") return { ...result, content: [...result.content, { type: "text", text: notice }] };
  const [first, ...rest] = result.content;
  return first?.type === "text"
    ? { ...result, content: [{ ...first, text: `${notice} ${first.text}` }, ...rest] }
    : { ...result, content: [{ type: "text", text: notice }, ...result.content] };
}

/**
 * A plan_research call's menu, read before the call's inputs are checked (readResearchMenu, 12 Nov 2026): the call goes
 * on with the menu in its own names and alone in later_inputs, and its result names what was read from beside it or
 * left out; a menu still not readable is refused here, with its problems and an example built from the call's own,
 * in a result whose structured content is valid (ChatGPT shows an error result without it only as "The tool failed
 * internally"). A call with no later_inputs, or another action, goes on as it came.
 */
export function withResearchMenuReading(execute: ResearchOperationHandler, options: {
  toolListVersion?: string;
  /**
   * Whether the call is a dev account's (owner answer 297c): its refused menu comes back with steering_choice's place
   * marked and its test, so the corrected call names the question. A caller not signed in, or any other, is not one.
   */
  devAccount?: (extra: ResearchOperationExtra | undefined) => Promise<boolean>;
}): ResearchOperationHandler {
  return async (input, extra) => {
    const later = input.later_inputs;
    if (input.action !== "plan_research" || later === null || typeof later !== "object" || Array.isArray(later)) {
      return await execute(input, extra);
    }
    // Owner answer 435a: on a dev account, a receipt on its own requests the server's menu. Any other account's call,
    // like a complete or flat menu, still goes through the usual reader, so its result is the one it got before.
    if (Object.hasOwn(later, "plain_answer_receipt") &&
        Object.keys(later).every((key) => key === "plain_answer_receipt" || key === "findings_save") &&
        await (options.devAccount?.(extra) ?? Promise.resolve(false)).catch(() => false)) {
      return await execute(input, extra);
    }
    const reading = readResearchMenu(later as Record<string, unknown>);
    const sentence = menuReadingSentence(reading);
    const parsed = reading.menu === undefined ? undefined : researchMenuSchema.safeParse(reading.menu);
    if (parsed === undefined || !parsed.success) {
      const named = await (options.devAccount?.(extra) ?? Promise.resolve(false)).catch(() => false);
      return withToolListNotice(menuRefusal(reading, parsed?.error.issues, named), input, options.toolListVersion);
    }
    // Codex's final check: a test run's findings_save "off" goes on with the menu, so the plan asks for no dossier.
    const later_inputs = findingsSaveOff(input) ? { ...reading.later, findings_save: "off" } : reading.later;
    const result = await execute({ ...input, later_inputs }, extra);
    return sentence === undefined ? result : withMenuReadingSentence(result, sentence);
  };
}

/** A plan_research call's refusal for its menu: what could not be read, and the example to call with. */
function menuRefusal(reading: Pick<MenuReading, "menu" | "flat" | "ignored" | "moved">,
  issues?: readonly z.core.$ZodIssue[], named = false): CallToolResult {
  const missing = reading.menu === undefined;
  const problems = missing
    ? ["later_inputs.researchMenu: missing; plan_research's menu, with its research_target and tasks, goes inside it"]
    : menuProblems(issues ?? []);
  // Owner answer 297c: a dev account's example carries steering_choice's placeholder when the call named no question,
  // and the text and the message say what replaces it.
  const example = correctedMenu(missing ? reading.flat : reading.menu, named);
  const sentence = menuReadingSentence(reading);
  const message = "plan_research could not read later_inputs.researchMenu: call it again with " +
    "corrected_later_inputs, after replacing each <...> with one of the values it lists" +
    `${choicePlaceholderWords(example)}.`;
  return {
    content: [{ type: "text", text: menuRefusalText(problems, example, sentence) }],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
      ok: false,
      error: { code: "invalid_request", message },
      problems: [...problems, ...(sentence === undefined ? [] : [sentence])],
      corrected_later_inputs: example,
    }),
    isError: true,
  };
}

/** A result with what the menu's reading read from beside it or left out: after its text, and among its problems. */
function withMenuReadingSentence(result: CallToolResult, sentence: string): CallToolResult {
  const structured = result.structuredContent;
  const problems = Array.isArray(structured?.problems) ? structured.problems as unknown[] : [];
  const changed = structured === undefined ? undefined
    : manageResearchAccessRuntimeOutputSchema.safeParse({ ...structured, problems: [...problems, sentence] });
  return {
    ...result,
    content: [...result.content, { type: "text", text: sentence }],
    ...(changed?.success === true ? { structuredContent: changed.data } : {}),
  };
}

function manageResearchAccess(options: ResearchContributorToolOptions) {
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const auth = authorizedSubject(extra, options.resourceMetadataUrl, options.signIn);
    if ("error" in auth) return auth.error;
    // The owner, 14 Nov 2026: later_inputs.ownerPointer goes with owner_pointer alone. Checked here, before any action
    // runs: Codex's review found a call that deleted a shared answer, and one that listed the calls, carrying it
    // unnoticed, since those actions answer before the other inputs are checked.
    if ((input.action === "owner_pointer") !== (input.ownerPointer !== undefined)) {
      return accessError("invalid_request",
        "later_inputs.ownerPointer goes only with action owner_pointer, which needs it.");
    }
    // Owner answer 395b: so is later_inputs.pauseMinutes with pause_research_planner, for the same reason.
    if ((input.action === "pause_research_planner") !== (input.pauseMinutes !== undefined)) {
      return accessError("invalid_request",
        "later_inputs.pauseMinutes goes only with action pause_research_planner, which needs it.");
    }
    if (input.plain_answer_receipt !== undefined && input.action !== "get_research_plan" && input.action !== "plan_research") {
      return accessError("invalid_request", "later_inputs.plain_answer_receipt goes only with action get_research_plan " +
        "or with plan_research in place of later_inputs.researchMenu.");
    }
    if (input.action === "list_calls") {
      if (options.callRecord === undefined || options.service === undefined) {
        const message = "This AskRigor server keeps no call record, so there is nothing to show.";
        return { content: [{ type: "text", text: message }], isError: true,
          structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
            ok: false, error: { code: "call_record_unavailable", message },
          }) };
      }
      const page = callsPageSchema.safeParse(input.callsPage ?? {});
      if (!page.success) {
        return accessError("invalid_request", `later_inputs.callsPage: ${page.error.issues.map(({ path, message }) =>
          `${path.join(".") || "the page"}: ${message}`).join("; ")}.`);
      }
      const entries = await options.callRecord.list(options.service.accountKeyForSubject(auth.subject), new Date(),
        page.data.before === undefined ? undefined : new Date(page.data.before));
      const calls = entries.map((entry) => ({ received_at: entry.receivedAt.toISOString(), tool: entry.tool,
        action: entry.action, route: entry.route, chatgpt: entry.chatgpt, outcome: entry.outcome,
        code: entry.code, duration_ms: entry.durationMs,
        ...(entry.planNext === undefined ? {} : { plan_next: entry.planNext }),
        ...(entry.planLane === undefined ? {} : { plan_lane: entry.planLane }) }));
      // The review of 12 Nov 2026: the budget counts the result as the app gets it, the tool-list notice included.
      return listedCalls(calls, page.data,
        (result) => clientResultBytes(withToolListNotice(result, input, options.toolListVersion)));
    }
    // Owner answer 386b: ending this account's Gemini links needs no active research account, only its sign-in.
    if (input.action === "disconnect_gemini") {
      if (options.geminiLinks === undefined) {
        const message = "This AskRigor server has no Gemini sign-in, so there is no Gemini link to end.";
        return { content: [{ type: "text", text: message }], isError: true,
          structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
            ok: false, error: { code: "gemini_links_unavailable", message },
          }) };
      }
      const ended = await options.geminiLinks.disconnect(auth.subject);
      const text = ended === 0
        ? "This account had no Gemini link to end."
        : `Ended ${ended === 1 ? "this account's Gemini link" : `this account's ${ended} Gemini links`}: Gemini can't ` +
          "use AskRigor as this account any more, until the person connects it again from Gemini.";
      return { content: [{ type: "text", text }],
        structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true, geminiLinksEnded: ended }) };
    }
    if (options.service === undefined) {
      return accessError(
        "research_access_service_unavailable",
        "Research access enrollment is not configured.",
      );
    }
    try {
      const parsed = manageResearchAccessRuntimeInputSchema.parse(input);
      if ((parsed.action === "share_answer") !== (parsed.sharedAnswer !== undefined)) {
        return accessError(
          "invalid_request",
          "later_inputs.sharedAnswer goes only with action share_answer, which needs it.",
        );
      }
      if ((parsed.action === "delete_shared_answer") !== (parsed.shareCode !== undefined)) {
        return accessError(
          "invalid_request",
          "later_inputs.shareCode goes only with action delete_shared_answer, which needs it.",
        );
      }
      if (parsed.action === "share_answer" || parsed.action === "delete_shared_answer") {
        const sharing = options.sharedAnswers;
        if (sharing === undefined) {
          return accessError("sharing_unavailable", "This AskRigor server does not keep shared answers, so nothing " +
            "was sent or deleted.");
        }
        if (parsed.action === "delete_shared_answer") {
          const deleted = sharing.vault.deleteByCode(parsed.shareCode!);
          return {
            content: [{ type: "text", text: deleted
              ? "The shared answer for that code is deleted."
              : "No shared answer is kept for that code: it was already deleted, its time ran out, or the code is " +
                "not one AskRigor gave." }],
            structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true, sharedAnswerDeleted: deleted }),
          };
        }
        return shareAnswer(options.service, sharing, auth.subject, parsed.sharedAnswer!);
      }
      // Owner answer 229a: a person's report to the Atlas, sent by their own AI on their yes, and its take-down.
      if ((parsed.action === "share_report") !== (parsed.atlasReport !== undefined)) {
        return accessError("invalid_request", "later_inputs.atlasReport goes only with action share_report, which needs it.");
      }
      if ((parsed.action === "take_down_report") !== (parsed.reportNumber !== undefined)) {
        return accessError("invalid_request",
          "later_inputs.reportNumber goes only with action take_down_report, which needs it.");
      }
      if (parsed.action === "share_report" || parsed.action === "take_down_report") {
        const door = options.atlasReports;
        if (door === undefined) {
          return accessError("sharing_unavailable", "This AskRigor server does not take Atlas reports yet, so nothing " +
            "was sent or taken down.");
        }
        await options.service.activeAccount(auth.subject);
        const ok = (text: string, atlasReport: z.infer<typeof atlasReportResultSchema>): CallToolResult => ({
          content: [{ type: "text", text }],
          structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true, atlasReport }),
        });
        const refuse = (code: ReportRefusalCode, message: string, problems: string[] = []): CallToolResult => ({
          content: [{ type: "text", text: problems.length === 0 ? message : `${message} ${problems.join(" ")}` }],
          structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: false,
            ...(problems.length === 0 ? {} : { problems }), error: { code, message } }),
          isError: true,
        });
        return parsed.action === "share_report"
          ? await shareReport(door, auth.subject, parsed.atlasReport!, refuse, ok, new Date())
          : await takeDownReport(door, auth.subject, parsed.reportNumber!, refuse, ok);
      }
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
      if ((parsed.action === "set_findings_save") !== (parsed.findingsSave !== undefined)) {
        return accessError(
          "invalid_request",
          "findingsSave goes only with action set_findings_save, which needs it.",
        );
      }
      if (parsed.callsPage !== undefined) {
        return accessError("invalid_request", "later_inputs.callsPage goes only with action list_calls.");
      }
      if (parsed.framing !== undefined && parsed.action !== "register_plain_answer") {
        return accessError("invalid_request", "later_inputs.framing goes only with action register_plain_answer.");
      }
      if (parsed.asked !== undefined && parsed.action !== "register_plain_answer") {
        return accessError("invalid_request", "later_inputs.asked goes only with action register_plain_answer.");
      }
      // A plan_research call with no menu at all gets the refusal a menu that can't be read gets, with an example.
      if (parsed.action === "plan_research" && parsed.researchMenu === undefined && parsed.plain_answer_receipt === undefined) {
        return menuRefusal({ ignored: [], moved: [] });
      }
      if (parsed.action !== "plan_research" && parsed.researchMenu !== undefined) {
        return accessError(
          "invalid_request",
          "later_inputs.researchMenu goes only with action plan_research, which needs it.",
        );
      }
      if (parsed.action === "get_research_plan" && parsed.plain_answer_receipt === undefined) {
        return accessError("invalid_request", "get_research_plan needs later_inputs.plain_answer_receipt from the registration.");
      }
      if (parsed.plain_answer_receipt !== undefined && parsed.researchMenu !== undefined) {
        return accessError("invalid_request", "With plan_research, give later_inputs.researchMenu or " +
          "later_inputs.plain_answer_receipt, one at a time.");
      }
      if ((parsed.action === "set_research_steering") !== (parsed.researchSteering !== undefined)) {
        return accessError(
          "invalid_request",
          "later_inputs.researchSteering goes only with action set_research_steering, which needs it.",
        );
      }
      // The owner, 14 Nov 2026: one of the owner's pointers, by its id. It stands after the checks above, so a call
      // that also carries another action's input is refused, and it reads nothing of the account.
      if (parsed.action === "owner_pointer") {
        return ownerPointerResult(options.askrigorHolds, parsed.ownerPointer!);
      }
      if (parsed.action === "register_plain_answer") {
        // Owner answer 298b: on a dev account, AskRigor's own planning call makes the plan. Any other account's
        // later_inputs.asked is read only for the YouTube videos the person named (owner answer 307b), and not kept.
        const accountKey = options.service.accountKeyForSubject(auth.subject);
        const devAccount = isDevAccount(accountKey, options.devAccountKeys?.() ?? new Set());
        // Owner answer 395b: a dev account whose planning call a test round paused registers as with the call off.
        const planner = activePlanner(options, accountKey, devAccount);
        // The person's words as one text: a list's messages in order, a blank line between them (askedText, which the
        // final check's review reads them with too).
        const asked = parsed.asked === undefined ? undefined : askedText(parsed.asked);
        if (asked !== undefined && asked.length > ASKED_LIMIT) {
          return accessError("invalid_request", `later_inputs.asked: at most ${ASKED_LIMIT.toLocaleString("en-US")} ` +
            "characters in all; give the messages that ask the question, without pasted documents.");
        }
        // Owner answer 301a: with the planner's texts, a dev account whose drafts AskRigor reviews is asked to give the
        // person's words again at the final check.
        const reviewed = planner?.enabled === true && options.researchReviewer?.()?.enabled === true;
        // Owner answer 304a: the newest of the person's messages, when the AI passed on more than one, for the
        // planning call to say whether it tells the AI to go on; and the secret that signs the menu's mark for it.
        const latest = parsed.asked === undefined ? undefined : latestMessage(parsed.asked);
        return await registerPlainAnswer(options.service, auth.subject, parsed.plainAnswer!, options.plainAnswer,
          parsed.framing, planner?.enabled === true
            ? { planner, asked, reviewed, latest, markSecret: options.menuDigestSecret?.() } : undefined,
          options.askrigorHolds, asked, isChatGptCall(extra), devAccount);
      }
      if (parsed.action === "set_research_steering") {
        // Owner answer 303a: learn mode only for a dev account, while AskRigor's own planning call is on. A test round's
        // pause (owner answer 395b) leaves the setting free: it is a setting kept for later, not a use of the call.
        const devAccount = isDevAccount(options.service.accountKeyForSubject(auth.subject),
          options.devAccountKeys?.() ?? new Set());
        return await setResearchSteering(options.service, auth.subject, parsed.researchSteering!, devAccount,
          devAccount && options.researchPlanner?.()?.enabled === true);
      }
      if (parsed.action === "plan_research" || parsed.action === "get_research_plan") {
        const accountKey = options.service.accountKeyForSubject(auth.subject);
        const devAccount = isDevAccount(accountKey, options.devAccountKeys?.() ?? new Set());
        let menu = parsed.researchMenu;
        if (parsed.plain_answer_receipt !== undefined) {
          const found = await registeredResearchPlan(options.service, auth.subject, options.plainAnswer,
            parsed.plain_answer_receipt, devAccount, isChatGptCall(extra));
          if (parsed.action === "get_research_plan" || found.menu === undefined) return found.result;
          menu = found.menu;
        }
        // Owner answer 303a: on a dev account while AskRigor's own planning call is on, the menu names learn mode, and a
        // call that carries the person's answer is kept while learn mode is on; not while a test round has paused the
        // call (owner answer 395b).
        const learning = activePlanner(options, accountKey, devAccount) !== undefined
          ? { log: options.log ?? defaultLog, active: () => activePlanner(options, accountKey, devAccount) !== undefined }
          : undefined;
        // Owner answer 395b: while a test round has paused this dev account's call, a light lane, which AskRigor's own
        // plan alone sets, is not honoured: a menu handed over before the pause goes as research (Codex's recheck).
        const paused = devAccount && learning === undefined && options.researchPlanner?.()?.enabled === true &&
          options.researchPlanner?.()?.pausedUntil?.(accountKey) !== undefined;
        return await planResearchAction(options.service, auth.subject,
          paused ? withoutLane(menu!) : menu!, options.plainAnswer,
          options.menuDigestSecret?.(), devAccount, learning, options.researchDossiers === true, findingsSaveOff(parsed),
          options.publicDossiers === true,
          options.findingsLedger?.(devAccount) === true, isChatGptCall(extra));
      }
      if (parsed.action === "set_plain_answer_note") {
        return await setPlainAnswerNote(options.service, auth.subject, parsed.plainAnswerNote!, options.plainAnswer);
      }
      if (parsed.action === "set_detailed_lesson_reports") {
        return await setDetailedLessonReports(options.service, auth.subject, parsed.detailedLessonReports!);
      }
      if (parsed.action === "set_findings_save") {
        const accountKey = options.service.accountKeyForSubject(auth.subject);
        if (!isDevAccount(accountKey, options.devAccountKeys?.() ?? new Set())) {
          return accessError("dev_account_required", "Only a dev account listed in AskRigor's settings may turn " +
            "findings-card saving off or on; this account is not listed, so its setting was not changed.");
        }
        await options.service.setFindingsSave(auth.subject, parsed.findingsSave!);
        return {
          content: [{ type: "text", text: parsed.findingsSave ? FINDINGS_SAVE_ON : FINDINGS_SAVE_OFF }],
          structuredContent: manageResearchAccessOutputSchema.parse({ ok: true, findingsSave: parsed.findingsSave }),
        };
      }
      // Owner answer 395b (21 Nov 2026): a test round pauses a dev account's planning call for at most two hours, so its
      // research goes as with the call off, and the call starts again by itself; 0 minutes ends the pause sooner.
      if (parsed.action === "pause_research_planner") {
        const accountKey = options.service.accountKeyForSubject(auth.subject);
        if (!isDevAccount(accountKey, options.devAccountKeys?.() ?? new Set())) {
          return accessError("dev_account_required", "Only a dev account listed in AskRigor's settings may pause " +
            "AskRigor's own planning call; this account is not listed, so nothing was changed.");
        }
        const planner = options.researchPlanner?.();
        if (planner?.enabled !== true || planner.pause === undefined) {
          return {
            content: [{ type: "text", text: PLANNER_OFF_NOTHING_PAUSED }],
            structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: false,
              error: { code: "planner_off", message: PLANNER_OFF_NOTHING_PAUSED } }),
            isError: true,
          };
        }
        const until = planner.pause(accountKey, parsed.pauseMinutes!);
        return {
          content: [{ type: "text", text: until === undefined ? PLANNER_PAUSE_ENDED : plannerPausedText(until) }],
          structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true,
            plannerPausedUntil: until === undefined ? null : new Date(until).toISOString() }),
        };
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
      const devAccount = isDevAccount(accountKey, options.devAccountKeys?.() ?? new Set());
      // An active account's settings, read once: every active account is asked for its plain answer
      // before research (owner answer 190a), and any active account's lessons carry a detailed report only when it
      // turned detailed lesson reports on (owner question 154).
      const settings = access.status === "ACTIVE" && access.mode !== null
        ? await options.service.activeAccount(auth.subject).catch(() => undefined)
        : undefined;
      const plain = settings !== undefined && options.plainAnswer !== undefined &&
          plainAnswerRequested(settings.mode)
        ? { note: settings.plainAnswerNote }
        : undefined;
      // Inspected, an account whose research waits on the notice is told to show it and ask, with the notice itself in
      // the text too, for an app that shows the model a tool's text alone.
      const nextStep = parsed.action === "inspect" && access.status !== "ACTIVE" ? noticeNextStep() : undefined;
      // Owner answer 303a: a dev account is told whether learn mode is on and how many of its menu choices are kept.
      const learnOn = settings?.steering.learnMenuChoices === true;
      const learnMode = settings === undefined || !devAccount ? undefined : { on: learnOn,
        kept: learnOn ? (await options.service.menuChoices(accountKey).catch(() => undefined))?.length : 0 };
      // Owner answer 386b: inspect says how many Gemini links the account has, and how to end them.
      const geminiLinks = parsed.action === "inspect" && options.geminiLinks !== undefined
        ? await options.geminiLinks.count(auth.subject).catch(() => undefined)
        : undefined;
      // Owner answer 298b: a dev account whose research AskRigor plans itself is asked for the person's own words. Read
      // after the account's reads, so a test round's pause begun meanwhile counts (owner answer 395b): while it runs,
      // inspect is as with the call off, and says nothing of the pause, so the person's AI is not told of a test.
      const planned = plain !== undefined && activePlanner(options, accountKey, devAccount) !== undefined;
      const firstLine = parsed.action === "inspect" && access.status === "ACTIVE" && !isChatGptCall(extra)
        ? planBuildingLine(planned) : undefined;
      const inspectStep = [nextStep ?? (planned ? ASKED_REQUEST : undefined), firstLine].filter(Boolean).join(" ");
      return {
        content: [{
          type: "text",
          text: (access.status === "ACTIVE"
            ? `AskRigor research access is active in ${access.mode === "FREE_CONTRIBUTOR" ? "free contributor" : "paid private"} mode.` +
              noticeAcceptanceSentence(access.acceptance)
            : access.status === "REVOKED"
              ? "AskRigor research access is revoked."
              : "Choose free contributor mode or activate an existing paid private entitlement before research use.") +
            (nextStep === undefined ? "" : ` ${nextStep} The notice, ${access.noticeVersion}: ${access.notice}`) +
            (plain === undefined ? "" : ` ${plainAnswerRequest(plain.note)}`) +
            (planned ? ` ${ASKED_REQUEST}` : "") +
            (firstLine === undefined ? "" : ` ${firstLine}`) +
            (settings === undefined
              ? ""
              : ` ${settings.detailedLessonReports ? DETAILED_REPORTS_ON : DETAILED_REPORTS_OFF}`) +
            (settings === undefined || !devAccount ? "" : ` ${settings.findingsSave ? FINDINGS_SAVE_ON : FINDINGS_SAVE_OFF}`) +
            (settings === undefined ? "" : ` ${steeringInspectText(settings.steering)}`) +
            (learnMode === undefined ? "" : ` ${learnModeInspectSentence(learnMode.on, learnMode.kept)}`) +
            (options.callRecord === undefined ? "" : ` ${CALL_RECORD_SENTENCE}`) +
            (options.safetyLimits === true && access.status === "ACTIVE" ? ` ${SAFETY_LIMITS_INSPECT_SENTENCE}` : "") +
            (geminiLinks === undefined || geminiLinks === 0 ? "" : ` This account is connected to Google Gemini ` +
              `(${geminiLinks === 1 ? "one link" : `${geminiLinks} links`}); if the person asks to disconnect Gemini, ` +
              "call manage_research_access with action disconnect_gemini.") +
            ` This account's reference, to give the user only when they ask for it: ${accountReference}.`,
        }],
        structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
          ok: true,
          access,
          ...(plain === undefined ? {} : { plainAnswer: { requested: true, note: plain.note } }),
          ...(settings === undefined ? {} : { detailedLessonReports: settings.detailedLessonReports }),
          ...(settings === undefined || !devAccount ? {} : { findingsSave: settings.findingsSave }),
          ...(settings === undefined ? {} : { steering: shownSteering(settings.steering, devAccount) }),
          accountReference,
          ...(geminiLinks === undefined || geminiLinks === 0 ? {} : { geminiLinks }),
          ...(inspectStep ? { next_step: inspectStep } : {}),
        }),
      };
    } catch (error) {
      return mappedAccessError(error);
    }
  };
}

type ListedCall = NonNullable<z.infer<typeof manageResearchAccessRuntimeOutputSchema>["calls"]>[number];

/**
 * list_calls' result: the newest calls (received before the page's time, when it gives one) while the whole result, as
 * the app gets it, fits MCP_RESULT_MAX_BYTES (the review of 12 Nov 2026: 500 calls came to about 85 KB, more than
 * Claude's clients take in), with the time the next page starts from when some are not shown. Pages go by time, not by
 * position: each listing is itself recorded, so a position shifted and a page repeated a call. A page never ends inside
 * a group of calls received in the same millisecond, so the next page, the calls before the last one shown, misses none.
 */
function listedCalls(calls: readonly ListedCall[], page: z.infer<typeof callsPageSchema>,
  bytes: (result: CallToolResult) => number): CallToolResult {
  const total = calls.length;
  const wanted = calls.slice(0, page.limit === undefined ? total : Math.min(total, page.limit));
  const at = page.before === undefined ? "" : ` before ${page.before.slice(0, 19).replace("T", " ")} UTC`;
  const count = total === 0
    ? `AskRigor received no calls from this signed-in account in the last 7 days${at}.`
    : `AskRigor received ${total === 500 ? "at least " : ""}${total} ${total === 1 ? "call" : "calls"} from this ` +
      `signed-in account in the last 7 days${at}.`;
  // plan_research's decision, or the lane AskRigor's own plan gave a register_plain_answer call (migration 0035).
  const decided = (call: ListedCall) => call.plan_next ?? call.plan_lane;
  const line = (call: ListedCall) =>
    `${call.received_at.slice(0, 19).replace("T", " ")} UTC · ${call.tool}${call.action === null ? ""
      : ` (${call.action}${decided(call) === undefined ? "" : `: ${decided(call)}`})`} · ` +
    `${call.outcome}${call.outcome === "refused" ? ` [${call.code}]` : ""} · ${(call.duration_ms / 1_000).toFixed(1)} s · ` +
    `${call.chatgpt ? "ChatGPT" : "other app"} · ${call.route}`;
  // A page that would end inside a group of calls with the same time ends before the group instead, unless the group
  // starts the page.
  const whole = (shown: number): number => {
    let end = shown;
    while (end > 0 && end < total && calls[end]!.received_at === calls[end - 1]!.received_at) end -= 1;
    if (end > 0 || shown === 0) return end;
    end = shown;
    while (end < total && calls[end]!.received_at === calls[end - 1]!.received_at) end += 1;
    return end;
  };
  const build = (shown: number): CallToolResult => {
    const more = total - shown;
    const nextBefore = more > 0 && shown > 0 ? calls[shown - 1]!.received_at : undefined;
    const where = more === 0 ? "" : shown === 0
      ? " This result shows none of them; call list_calls again with a smaller later_inputs.callsPage limit."
      : ` This result shows the newest ${shown} of them; ${total === 500 ? "older ones are" : more === 1
        ? "1 older one is" : `${more} older ones are`} not shown: for the next, call list_calls again with ` +
        `later_inputs.callsPage {"before": "${nextBefore}"}.`;
    const text = [count + where + " Times are UTC. A call made without signing in isn't recorded. " +
      "This call itself appears from the next listing.", ...calls.slice(0, shown).map(line)].join("\n");
    return { content: [{ type: "text", text }], structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
      ok: true, calls: calls.slice(0, shown), retention_days: RESEARCH_CALL_RECORD_RETENTION_DAYS,
      ...(page.before === undefined && more === 0 ? {} : { calls_page: { shown, total,
        ...(page.before === undefined ? {} : { before: page.before }),
        ...(nextBefore === undefined ? {} : { next_before: nextBefore }) } }),
    }) };
  };
  const fits = (result: CallToolResult) => bytes(result) <= MCP_RESULT_MAX_BYTES;
  const all = build(whole(wanted.length));
  if (fits(all)) return all;
  let best = build(0);
  let lower = 1;
  let upper = wanted.length - 1;
  while (lower <= upper) {
    const shown = Math.floor((lower + upper) / 2);
    const candidate = build(whole(shown));
    if (fits(candidate)) {
      best = candidate;
      lower = shown + 1;
    } else {
      upper = shown - 1;
    }
  }
  return best;
}

/**
 * Keeps the person's confirmed, de-identified copy (owner answer 200a). Only an active research account may share; the
 * account is read to check that and counted in memory against the daily limit, and nothing about it is kept with the
 * copy. The copy passes the contact screen's exact patterns first.
 */
async function shareAnswer(
  service: ResearchContributorAccessService,
  sharing: SharedAnswers & { versions: () => Promise<SharedAnswerVersions> },
  subject: string,
  copy: NonNullable<z.infer<typeof manageResearchAccessRuntimeInputSchema>["sharedAnswer"]>,
): Promise<CallToolResult> {
  await service.activeAccount(subject);
  const problems = sharedAnswerProblems(copy);
  if (problems.length > 0) {
    return {
      content: [{ type: "text", text: `Nothing was sent. ${problems.join(" ")}` }],
      structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
        ok: false,
        problems,
        error: { code: "share_refused", message: "The copy holds what looks like contact details or a token." },
      }),
      isError: true,
    };
  }
  if (!sharing.allow(service.accountKeyForSubject(subject))) {
    return accessError("share_limit_reached", "This account has shared as many answers as AskRigor keeps from one " +
      "account in a day, so nothing was sent; it can share again tomorrow (UTC).");
  }
  let kept: { code: string; expiresAt: string };
  try {
    kept = sharing.vault.share(copy, await sharing.versions());
  } catch (error) {
    if (error instanceof SharedAnswersFullError) {
      return accessError("sharing_unavailable", "AskRigor is keeping as many shared answers as it can, so nothing " +
        "was sent; try again later.");
    }
    throw error;
  }
  return {
    content: [{
      type: "text",
      text: `Sent. Give the person this code, which deletes the shared answer: ${kept.code}. ${SHARED_ANSWER_KEPT} ` +
        "AskRigor's server checked the copy only for contact details and tokens, not that it is de-identified.",
    }],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
      ok: true,
      sharedAnswer: { code: kept.code, expiresAt: kept.expiresAt, kept: SHARED_ANSWER_KEPT },
    }),
  };
}

/**
 * The active account asked for a plain answer (owner answer 190a), with its key and note setting; undefined for any
 * other account, or on a surface without the plain answer. Throws as activeAccount does for an inactive account.
 */
async function plainAnswerAccount(
  service: ResearchContributorAccessService,
  subject: string,
  plain: PlainAnswerOptions | undefined,
): Promise<{ accountKey: string; note: boolean; steering: ResearchSteering } | undefined> {
  if (plain === undefined) return undefined;
  const accountKey = service.accountKeyForSubject(subject);
  const account = await service.activeAccount(subject);
  return plainAnswerRequested(account.mode)
    ? { accountKey, note: account.plainAnswerNote, steering: account.steering }
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
  framing?: Framing,
  // Owner answer 298b: a dev account's planner, with the person's own words when the call gave them; and whether
  // AskRigor's own review reads its drafts at the final check (owner answer 301a).
  // Owner answer 304a: latest is the newest of the person's messages when the call passed on more than one, and
  // markSecret signs the mark a menu carries when the planning call read that message as telling the AI to go on.
  planning?: { planner: ResearchPlanner; asked: string | undefined; reviewed?: boolean; latest?: string | undefined;
    markSecret?: string | undefined },
  // The owner, 14 Nov 2026: what AskRigor already holds for the question, read while the plan is made.
  holds?: AskRigorHoldsOptions,
  // Owner answer 307b: the person's own words, on any account, when the call passed them on (later_inputs.asked). The
  // receipt signs that words were passed on and the IDs of the YouTube videos they link, so the final check can tie a
  // finding's named video to the person. The words themselves are neither signed nor kept.
  personWords?: string,
  chatGpt = false,
  devAccount = false,
): Promise<CallToolResult> {
  const account = await plainAnswerAccount(service, subject, plain);
  if (account === undefined) return accessError("plain_answer_not_requested", plain === undefined ? PLAIN_ANSWER_SURFACE_UNAVAILABLE : PLAIN_ANSWER_NOT_REQUESTED);
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
  const namedVideos = personWords === undefined ? [] : namedVideoIdsIn(personWords).slice(0, NAMED_VIDEOS_SIGNED);
  const receipt = plain!.sign({
    claims: plainAnswer.claims.map(plainAnswerClaimDigest),
    text: createHash("sha256").update(plainAnswer.text, "utf8").digest("hex"),
    target: researchTargetDigest(plainAnswer.researchTarget),
    ...(personWords === undefined ? {} : { asked: "1" }),
    ...(namedVideos.length === 0 ? {} : { vids: namedVideos }),
  }, account.accountKey);
  if (receipt === undefined) {
    return accessError("receipts_unavailable", "This AskRigor server cannot sign research receipts, so the plain " +
      "answer was not registered; the research goes ahead without it.");
  }
  const count = plainAnswer.claims.length;
  // The server keeps no record of the research, so it cannot tell here whether research began; the final check can, by
  // the receipts' signed order (#394's run: q136-weak-lead-given registered again after research began, and both results
  // said "registered before research").
  const summary = `Plain answer registered: ${count === 1 ? "1 claim" : `${count} claims`}, signed with the time. The ` +
    "final check compares the answer with the latest plain answer this account registered for the research target " +
    "before the research's first receipt, so one registered after research began is not compared; if one for this " +
    "research target was registered before the research began, pass that receipt too. Treat each claim as something " +
    "to check, confirm or correct, and look beyond the claims too. Pass " +
    "this research_receipt to finalize_research with the others; there, plain_answer_comparison gives each claim, " +
    "copied exactly as listed here, with whether the research confirmed, corrected or qualified it, or did not check " +
    "it. Claims: " + plainAnswer.claims.map((claim, number) => `${number} ${JSON.stringify(claim)}`).join("; ") + ". " +
    // #434 (8 Nov 2026): a final check given the question in other words, after the person said "continue", found no
    // plain answer for it, and the answer ended without the comparison.
    `Research target, as signed: ${JSON.stringify(plainAnswer.researchTarget)}. Give finalize_research this ` +
    "research_target word for word, in a later turn too (only case and spacing are ignored): a reworded one can't be " +
    "matched to this plain answer, and the answer then ends without the comparison. " +
    // Owner answer 307b: said here, before the research, so the first card can carry the link.
    (namedVideos.length === 0 ? "" : `The person's words link ${namedVideos.length === 1 ? "a YouTube video" :
      `${namedVideos.length} YouTube videos`}: at the final check, a finding about a video the person named may link ` +
      "it, with named_videos in later_inputs.findings_card, as the person gave its address. ") +
    (account.note ? NOTE_ON : NOTE_OFF);
  const { researchTarget } = plainAnswer;
  const render = (planned: RegistrationPlan, heldAll: AskRigorHolds | undefined) =>
    registeredPlainAnswerResult({ summary, count, receipt, researchTarget, account, framing, planned, heldAll,
      reviewed: planning?.reviewed, accountDailyCalls: planning?.planner.accountDailyCalls, chatGpt, devAccount });
  // Atlas matches can be read alongside the plan. Both are returned by get_research_plan for planner accounts.
  let heldAll: AskRigorHolds | undefined;
  const holding = heldFor(holds, researchTarget).catch(() => undefined).then((held) => { heldAll = held; });
  if (planning === undefined) {
    await holding;
    return render(undefined, heldAll);
  }
  const ready = keepResearchPlan(service, account.accountKey, receipt, async (deadline) => {
    // Learn mode passes the same history to the planner. A history that cannot be read is none.
    const history = account.steering.learnMenuChoices
      ? menuHistoryOf(await service.menuChoices(account.accountKey).catch(() => []), Date.now()) : [];
    if (Date.now() >= deadline) return undefined;
    const planned = await plannedResearch(planning, plainAnswer, framing, receipt, account.accountKey, history)
      .catch(() => ({ reason: "error" as const }));
    await holding;
    return { result: render(planned, heldAll), ...(planned !== undefined && "later_inputs" in planned
      ? { menu: planned.later_inputs.researchMenu } : {}) };
  }, () => ({ result: render({ reason: "error" }, heldAll) }));
  return withPendingPlanLane({
    content: [{ type: "text", text: PLAN_PENDING }, { type: "text", text: summary },
      { type: "text", text: `research_receipt: ${receipt}` }],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true,
      plainAnswer: { requested: true, note: account.note, claims: count }, research_receipt: receipt, next_step: PLAN_PENDING }),
  }, ready.then(({ result }) => result));
}

/** The original registration result, used on retrieval or immediately when the planner is off. */
function registeredPlainAnswerResult({ summary, count, receipt, researchTarget, account, framing, planned, heldAll,
  reviewed, accountDailyCalls, chatGpt, devAccount }: {
  summary: string; count: number; receipt: string; researchTarget: string;
  account: { note: boolean; steering: ResearchSteering }; framing: Framing | undefined;
  planned: RegistrationPlan; heldAll: AskRigorHolds | undefined; reviewed: boolean | undefined;
  accountDailyCalls: number | undefined; chatGpt: boolean; devAccount: boolean;
}): CallToolResult {
  const plan = planned !== undefined && "later_inputs" in planned ? planned : undefined;
  const notPlanned = planned !== undefined && "reason" in planned ? planned : undefined;
  const fallbackLine = notPlanned !== undefined && !chatGpt ? PLAN_FALLBACK_LINE : undefined;
  const outline = plan === undefined ? registrationMenuOutline(researchTarget, receipt, devAccount) : undefined;
  const notUsed = notPlanned === undefined ? undefined
    : plannerNotUsedSentence(notPlanned.reason, accountDailyCalls);
  // A day's limit is the person's to know, so it goes to an app that hands its model only next_step too.
  const limitReached = notPlanned?.reason === "account_limit" || notPlanned?.reason === "daily_budget";
  // The result with what AskRigor holds for the question, or with less of it, or with none (heldVariants).
  const resultWith = (held: AskRigorHolds | undefined): CallToolResult => {
  const heldTexts = held === undefined ? [] : [{ type: "text" as const, text: heldText(held) }];
  const heldStep = holdsSomethingNow(held) ? ` ${HELD_NEXT_STEP}` : "";
  // Owner answer 302: AskRigor steps aside for a plain look-up. The plain answer is still signed and its receipt given,
  // in case the person asks for the research after all; nothing else is said, since every other text of this result
  // asks for research or for the final check.
  if (planned !== undefined && "aside" in planned) {
    return {
      content: [
        // With something held for the question, the step aside itself says where it goes (asideGuidance).
        { type: "text", text: asideGuidance(planned, holdsSomethingNow(held)) },
        // What AskRigor holds comes with a look-up it steps aside for too: there the AI would not have searched.
        ...heldTexts,
        { type: "text", text: `research_receipt: ${receipt} Keep it only in case the person asks for the research ` +
          "after all." },
      ],
      structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
        ok: true,
        plainAnswer: { requested: true, note: account.note, claims: count },
        research_receipt: receipt,
        next_step: asideNextStep(holdsSomethingNow(held)),
        research_plan: { source: "askrigor_planning_call", about: planned.about, steering_choice: "none",
          searches: planned.searches, from_asked: planned.asked, lane: "aside" },
        ...(held === undefined ? {} : { askrigor_holds: held }),
      }),
    };
  }
  return {
    // Owner answer 279a: what to do next, by the framing and the account's research style. Since 11 Nov 2026 it comes
    // first, before the registration's details, so an ask is the first thing the model reads, and next_step carries it
    // to an app that hands its model only the structured content.
    content: [
      { type: "text", text: plan === undefined ? framingGuidance(account.steering, framing)
        : plannedGuidance(framing, plan) },
      ...(notUsed === undefined ? [] : [{ type: "text" as const, text: notUsed }]),
      ...(fallbackLine === undefined ? [] : [{ type: "text" as const, text: fallbackLine }]),
      ...(outline === undefined ? [] : [{ type: "text" as const, text: FILL_MENU_OUTLINE }]),
      { type: "text", text: summary },
      { type: "text", text: `research_receipt: ${receipt}` },
      // What AskRigor already holds, for the answer: after the receipt, so the first texts stay what to do next.
      ...heldTexts,
      { type: "text", text: FINALIZE_REMINDER },
      // Owner answer 301a: what the final check's review of the draft reads, said where the planner's texts are. Not
      // for a light plan (owner answer 302), whose draft is not reviewed: the request would promise a review that is
      // not made, and the final check knows a light look-up by its research target.
      // Nor when the planning call was off for this registration (planned undefined): a test round's pause begun
      // while the registration ran (owner answer 395b) leaves it as with the call off.
      ...(reviewed === true && planned !== undefined && plan?.lane !== "light"
        ? [{ type: "text" as const, text: ANSWER_REVIEW_ASKED }] : []),
    ],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
      ok: true,
      plainAnswer: { requested: true, note: account.note, claims: count },
      research_receipt: receipt,
      next_step: `${plan !== undefined ? plannedNextStep(framing, plan)
        : `${framingNextStep(account.steering, framing)}${limitReached ? ` ${notUsed}` : ""}`}${heldStep}` +
        (fallbackLine === undefined ? "" : ` ${fallbackLine}`) +
        (outline === undefined ? "" : ` ${FILL_MENU_OUTLINE}`),
      ...(outline === undefined ? {} : { menu_outline: outline }),
      ...(plan === undefined ? {} : {
        research_plan: { source: "askrigor_planning_call", about: plan.about,
          steering_choice: plan.later_inputs.researchMenu.steering_choice ?? "none", searches: plan.searches,
          from_asked: plan.asked, lane: plan.lane,
          ...(plan.later_inputs.researchMenu.go_on_asked === undefined ? {} : { person_said_go_on: true as const }) },
        planned_later_inputs: plan.later_inputs,
      }),
      ...(notPlanned === undefined ? {} : { research_plan_not_used: notPlanned.reason }),
      ...(held === undefined ? {} : { askrigor_holds: held }),
    }),
  };
  };
  // Codex's review of 14 Nov 2026: a research target of 5,000 characters, three long findings and two pointers came
  // to more than a client accepts. So the first of these that fits is the result; the last has nothing held, which
  // is the result of before.
  const results = heldVariants(heldAll).map(resultWith);
  return results.find((result) => clientResultBytes(result) <= MCP_RESULT_MAX_BYTES) ?? results[results.length - 1]!;
}

/** One of the owner's pointers by its id (the owner, 14 Nov 2026), or the ids there are. */
function ownerPointerResult(holds: AskRigorHoldsOptions | undefined, id: string): CallToolResult {
  const pointers = holds?.pointers?.() ?? [];
  const pointer = ownerPointerById(id, pointers);
  if (pointer === undefined) {
    return accessError("invalid_request", pointers.length === 0
      ? "later_inputs.ownerPointer: this AskRigor server keeps no owner's pointers."
      : `later_inputs.ownerPointer: no pointer has this id; the ids are ${pointers.map(({ id: known }) => known).join(", ")}.`);
  }
  const shown = shownOwnerPointer(pointer);
  return {
    content: [{ type: "text", text: `${ownerPointerText(shown)} ${OWNER_POINTER_HOW}` }],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true, owner_pointer: shown,
      next_step: OWNER_POINTER_HOW }),
  };
}

/** AskRigor's own plan stepped aside for a plain look-up (owner answer 302): no menu, only what the question is about. */
interface PlannedAside {
  aside: true;
  about: string;
  searches: number;
  /** Whether the call had the person's own words, or only the research target. */
  asked: boolean;
}

/** The registration's original outer deadline, a little past the planner's own longest timeout. */
const PLANNER_WAIT_MS = 125_000;

type RegistrationPlan = PlannedResearch | PlannedAside | { reason: PlannerNotUsedReason } | undefined;
type RetrievedResearchPlan = { result: CallToolResult; menu?: ResearchMenuInput };
type PendingResearchPlan = { deadline: number; ready: Promise<RetrievedResearchPlan> };

// HTTP requests can build separate handlers over the same access service. Keep the handoff in process memory only.
const pendingResearchPlans = new WeakMap<ResearchContributorAccessService, Map<string, PendingResearchPlan>>();
const researchPlanKey = (accountKey: string, receipt: string): string =>
  createHash("sha256").update(JSON.stringify([accountKey, receipt])).digest("hex");

function keepResearchPlan(service: ResearchContributorAccessService, accountKey: string, receipt: string,
  build: (deadline: number) => Promise<RetrievedResearchPlan | undefined>, fallback: () => RetrievedResearchPlan):
  Promise<RetrievedResearchPlan> {
  const plans = pendingResearchPlans.get(service) ?? new Map<string, PendingResearchPlan>();
  pendingResearchPlans.set(service, plans);
  const key = researchPlanKey(accountKey, receipt);
  const deadline = Date.now() + PLANNER_WAIT_MS;
  const expired = Promise.withResolvers<undefined>();
  const work = Promise.resolve().then(() => build(deadline));
  const entry = { deadline, ready: Promise.race([work, expired.promise])
    .then((result) => result !== undefined && Date.now() < deadline ? result : fallback(), fallback) };
  plans.set(key, entry);
  const timer = setTimeout(() => {
    if (plans.get(key) === entry) plans.delete(key);
    expired.resolve(undefined);
  }, PLANNER_WAIT_MS);
  timer.unref?.();
  return entry.ready;
}

// The review of 435a's build (Claude, with Fable's red-team): who builds the plan; that the AI's own screen and menu
// wait for it, as they did when the registration carried it; and that it is fetched in this turn, before any question
// to the person (a plan is dropped 125 seconds after the registration), by a call that itself waits, so the AI
// neither polls nor ends its turn to wait.
const PLAN_PENDING = `AskRigor is building the research plan. ${URGENT_FIRST} Load the protocol sections you need now, ` +
  "but do not screen or write a menu of your own yet. Then, in this same turn and before asking the person " +
  "anything, call manage_research_access with action get_research_plan and later_inputs.plain_answer_receipt set " +
  "to this result's research_receipt: it waits for the plan and returns your next step.";
const PLAN_FALLBACK_LINE =
  "Tell the person in one line that the plan will take a few minutes more: you are taking a first look yourself.";
const FILL_MENU_OUTLINE = "Fill in menu_outline for your plan_research call.";

async function registeredResearchPlan(service: ResearchContributorAccessService, subject: string,
  plain: PlainAnswerOptions | undefined, receipt: string, devAccount: boolean, chatGpt: boolean):
  Promise<RetrievedResearchPlan> {
  const account = await plainAnswerAccount(service, subject, plain);
  if (account === undefined) return { result: accessError("plain_answer_not_requested",
    plain === undefined ? PLAIN_ANSWER_SURFACE_UNAVAILABLE : PLAIN_ANSWER_NOT_REQUESTED) };
  const entry = devAccount ? pendingResearchPlans.get(service)?.get(researchPlanKey(account.accountKey, receipt)) : undefined;
  const verified = plain?.read === undefined ? entry !== undefined : plain.read(receipt, account.accountKey) !== undefined;
  if (!verified) {
    return { result: accessError("invalid_request",
      "later_inputs.plain_answer_receipt is not a current plain-answer receipt of this account.") };
  }
  if (entry !== undefined && Date.now() < entry.deadline) return await entry.ready;

  // After expiry or restart the receipt still works. The caller has its original framing and exact target.
  const first = `${URGENT_FIRST} AskRigor's research plan is unavailable. Apply your registered framing and research ` +
    "style, including any question you need to ask first.";
  const fallback = chatGpt ? [] : [PLAN_FALLBACK_LINE];
  const nextStep = [first, framingNextStep(account.steering, undefined), ...fallback, FILL_MENU_OUTLINE].join(" ");
  return { result: {
    content: [nextStep, `research_receipt: ${receipt}`, FINALIZE_REMINDER]
      .map((text) => ({ type: "text" as const, text })),
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true, research_receipt: receipt,
      next_step: nextStep, menu_outline: registrationMenuOutline(undefined, receipt, devAccount) }),
  } };
}

/**
 * AskRigor's own plan for a dev account's research (owner answer 298b): the planning call's reading, question and
 * tasks as a menu for the registered research target and the receipt just signed, ready for plan_research; or why
 * there is none. Since owner answer 302 (14 Nov 2026)
 * a light plan's menu says lane light, and an aside plan gives no menu at all, only what the question is about.
 */
async function plannedResearch(
  planning: { planner: ResearchPlanner; asked: string | undefined; latest?: string | undefined;
    markSecret?: string | undefined },
  plainAnswer: z.infer<typeof plainAnswerInputSchema>,
  framing: Framing | undefined,
  receipt: string,
  accountKey: string,
  menuHistory: readonly MenuHistoryEntry[] = [],
): Promise<RegistrationPlan> {
  const call = await planning.planner.plan({ asked: planning.asked,
    researchTarget: plainAnswer.researchTarget, quickAnswer: plainAnswer.text, claims: plainAnswer.claims, framing,
    ...(menuHistory.length === 0 ? {} : { menuHistory }),
    ...(planning.latest === undefined ? {} : { latestMessage: planning.latest }) }, accountKey);
  if (call.planning.status === "skipped") {
    return call.planning.reason === "off" ? undefined : { reason: call.planning.reason };
  }
  const { about, steering_choice, tasks, searches, lane, goOn } = call.planning.plan;
  const asked = planning.asked !== undefined;
  // AskRigor steps aside only from the person's own words. A plan made from the AI's research target alone cannot
  // tell what the person asked, and nothing in a step-aside answer is checked: such a plan is not used, and the AI
  // screens and plans as on every account (in doubt, AskRigor researches).
  // Nor does it step aside on a plan made without a web search: the lane's own condition is that the call's search
  // showed the fact stated plainly, and a call that searched nothing answered from memory (14 Nov 2026: a call given
  // a history of skipped forum tasks ran no search, three runs of three).
  if (lane === "aside") {
    return asked && searches > 0 ? { aside: true, about, searches, asked } : { reason: "unreadable" };
  }
  const light = lane === "light";
  const menu = researchMenuSchema.safeParse({ research_target: plainAnswer.researchTarget,
    plain_answer_receipt: receipt, steering_choice, tasks, ...(light ? { lane: "light" } : {}) });
  if (!menu.success) return { reason: "unreadable" };
  // Owner answer 304a: the plan says the person's newest message told the AI to go on, and this call carried such a
  // message (a plan kept from the hour's cache may have been made for a call that did): the menu gets AskRigor's
  // mark, signed for these tasks and this receipt. Without the signing secret there is no mark, and the menu asks
  // as it always did.
  const mark = goOn && planning.latest !== undefined && planning.markSecret !== undefined && planning.markSecret !== ""
    ? goOnMark(menu.data.tasks, receipt, planning.markSecret) : undefined;
  return { about, searches, asked, lane: light ? "light" : "research",
    later_inputs: { researchMenu: mark === undefined ? menu.data : { ...menu.data, go_on_asked: mark } } };
}

/**
 * Changes the account's research style when the person asks (owner answer 279a); only the choice is stored. Learn mode
 * (owner answer 303a) is turned on only for a dev account while AskRigor's own planning call is on
 * (learnModeAvailable); any other call that turns it on is refused whole, its other settings too, with nothing kept
 * or changed. Turning it off is never refused, since it deletes what was kept.
 */
async function setResearchSteering(
  service: ResearchContributorAccessService,
  subject: string,
  change: ResearchSteeringInput,
  devAccount = false,
  learnModeAvailable = false,
): Promise<CallToolResult> {
  const style = change.style !== undefined || change.checkBackMinutes !== undefined ||
    change.adjustmentDetail !== undefined;
  if (!style && change.learnMenuChoices === undefined) {
    return accessError("invalid_request", "later_inputs.researchSteering needs at least one of style, " +
      "checkBackMinutes and adjustmentDetail.");
  }
  // Turning learn mode on needs a dev account with the planning call on. Turning it off never does: it deletes what
  // was kept, and an account taken off the list, or one whose planning call was switched off, must still be able to.
  if (change.learnMenuChoices === true && !learnModeAvailable) return learnModeUnavailable();
  // Turning learn mode off is done by itself, for an account in any state (forgetMenuChoices): revoked access must
  // not keep a person from deleting what was kept. Whatever else the call sets still needs active access, after it.
  const { learnMenuChoices, ...styleChange } = change;
  let steering = learnMenuChoices === false ? await service.forgetMenuChoices(subject) : undefined;
  if (style || learnMenuChoices === true) {
    steering = await service.setResearchSteering(subject, learnMenuChoices === true ? change : styleChange);
  }
  const text = [
    ...(style ? [`${steeringSentence(steering!)} This applies to this account's research until the person changes it.`]
      : []),
    ...(learnMenuChoices === undefined ? [] : [learnMenuChoices ? LEARN_MODE_ON : LEARN_MODE_OFF]),
  ].join(" ");
  return {
    content: [{ type: "text", text }],
    // An account with no row had nothing kept and has no style to show.
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: true,
      ...(steering === undefined ? {} : { steering: shownSteering(steering, devAccount) }) }),
  };
}

/** Learn mode asked of an account that is not a dev account, or while the planning call is off (owner answer 303a). */
function learnModeUnavailable(): CallToolResult {
  return {
    content: [{ type: "text", text: LEARN_MODE_UNAVAILABLE }],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({ ok: false,
      error: { code: "learn_mode_unavailable", message: LEARN_MODE_UNAVAILABLE } }),
    isError: true,
  };
}

/**
 * The research style as a result shows it: learn mode only to a dev account, the only kind that may change it, so no
 * other account is offered it and its results stay as they were (owner answer 303a).
 */
function shownSteering(steering: ResearchSteering, devAccount: boolean):
  Omit<ResearchSteering, "learnMenuChoices"> & { learnMenuChoices?: boolean } {
  const { learnMenuChoices, ...style } = steering;
  return devAccount ? { ...style, learnMenuChoices } : style;
}

/**
 * The person's reason as learn mode keeps it (owner answer 303a): one line of plain text, cleaned and cut by
 * cleanedReason; a reason that is not a text, or is empty after cleaning, is no reason.
 */
export function personReasonOf(reason: unknown): string | null {
  return cleanedReason(reason) ?? null;
}

/** Learn mode's kept choices as the planner reads them, newest first, with whole days since each (owner answer 303a). */
export function menuHistoryOf(choices: readonly ResearchMenuChoice[], now: number): MenuHistoryEntry[] {
  return choices.map(({ chosenAt, lane, youDecide, reason, tasks }) => ({
    days_ago: Math.max(0, Math.floor((now - Date.parse(chosenAt)) / 86_400_000)),
    lane,
    you_decide: youDecide,
    reason,
    tasks: tasks.map(({ kind, recommended, minutes }) => ({ kind, recommended, minutes })),
  }));
}

/** A failure's class, to the server's error output only. */
const defaultLog = (failureClass: string): void => console.error(`research access: ${failureClass}`);

const pendingMenuChoices = new WeakMap<ResearchContributorAccessService, Set<Promise<void>>>();

/** Test seam: waits for the menu choices this service is still keeping, without delaying any result. */
export async function waitForPendingMenuChoices(service: ResearchContributorAccessService): Promise<void> {
  const pending = pendingMenuChoices.get(service);
  while (pending !== undefined && pending.size > 0) await Promise.all([...pending]);
}

/**
 * Keeps one menu choice after the result is made (owner answer 303a): it never fails or delays the call, and a failure
 * logs its class only (menu_choice_not_recorded), never what failed or the choice.
 */
function keepMenuChoice(service: ResearchContributorAccessService, accountKey: string,
  choice: () => ResearchMenuChoiceInput | undefined, log: (failureClass: string) => void): void {
  let pending = pendingMenuChoices.get(service);
  if (pending === undefined) {
    pending = new Set();
    pendingMenuChoices.set(service, pending);
  }
  const write = Promise.resolve().then(async () => {
    const made = choice();
    if (made !== undefined) await service.recordMenuChoice(accountKey, made);
  }).catch(() => {
    try { log("menu_choice_not_recorded"); } catch { /* A log that fails changes nothing. */ }
  });
  pending.add(write);
  void write.then(() => pending.delete(write));
}

/**
 * A short menu that names no question, on a dev account (owner answer 296b, 13 Nov 2026; until then the refusal of
 * owner answer 294c, for the yes or no left out): nothing is planned, and the result gives the call back with the
 * question's place marked, in its text and in a structured content that is valid, with the test in its message for
 * an app that hands its model only the structured content.
 */
/** A menu whose steering_choice is neither the word none nor a question: handed back with the field's place marked. */
function steeringChoiceUnclearRefusal(plan: ResearchMenuInput): CallToolResult {
  const { steering_choice: given, ...rest } = plan;
  const example = correctedMenu(rest, true);
  const message = "plan_research planned nothing yet: later_inputs.researchMenu.steering_choice is neither the " +
    "word none nor a question, and whether to ask the person first rests on it. Call it again with " +
    `corrected_later_inputs, after replacing ${MENU_PLACEHOLDERS.steering_choice} with exactly the word none, when ` +
    "you would ask this person nothing before researching, or with the one question you would ask them, written " +
    "out as a sentence with its question mark.";
  return {
    content: [{ type: "text", text: steeringChoiceUnclearText(given ?? "", example) }],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
      ok: false,
      error: { code: "invalid_request", message },
      problems: [`later_inputs.researchMenu.steering_choice: ${JSON.stringify((given ?? "").trim())} is neither the ` +
        "word none nor a question; write exactly none, or the one question you would ask this person, written out " +
        "as a sentence with its question mark"],
      corrected_later_inputs: example,
    }),
    isError: true,
  };
}

function steeringChoiceRefusal(plan: ResearchMenuInput): CallToolResult {
  const example = correctedMenu(plan, true);
  const message = "plan_research planned nothing yet: whether this menu asks the person first rests on your " +
    "steering judgment, later_inputs.researchMenu.steering_choice, which the call left out (steering_could_help alone, " +
    "true or false, does not replace it). Call it again with corrected_later_inputs, after replacing " +
    `${MENU_PLACEHOLDERS.steering_choice} with that question or with the word none: ${STEERING_CHOICE}.`;
  return {
    content: [{ type: "text", text: steeringChoiceRefusalText(example) }],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
      ok: false,
      error: { code: "invalid_request", message },
      problems: ["later_inputs.researchMenu.steering_choice: left out; name the one question you would ask this " +
        "person, or write none"],
      corrected_later_inputs: example,
    }),
    isError: true,
  };
}

/**
 * The menu of next tasks after a quick screen (owner answer 279a): each task's time range, a recommendation, and whether
 * to ask the person first, by the account's research style. With the plain answer's receipt, it also checks that the
 * research target is the registered one (AskRigor#434) and says how long ago the plain answer was registered. Nothing
 * of the plan is stored.
 *
 * Two things the AI declares decide what a menu's result says, and AskRigor checks only that each was declared; what
 * it says is the model's. An allocation is the person's answer only with person_answered true (round 3 of the
 * owner's ChatGPT runs, 12 Nov 2026: the AI sent the handed-over "you decide" allocation itself, 54 seconds after the
 * ask, and researched for 17 minutes without the person): on dev accounts from 12 Nov, and on every account since 13
 * Nov 2026, after round 4 showed it held on the owner's account while every other account still got the handed-over
 * call as a usable default. And on a dev account (devAccount) alone, tried there before any other account gets it, a
 * short menu names the question the AI would ask the person, or none (owner answer 296b, 13 Nov 2026: round 4 showed
 * that the yes or no of owner answer 294c let "every task is needed" stand for "nothing to ask").
 */
async function planResearchAction(
  service: ResearchContributorAccessService,
  subject: string,
  plan: ResearchMenuInput,
  plain: PlainAnswerOptions | undefined,
  digestSecret?: string,
  devAccount = false,
  // Owner answer 303a: given only for a dev account while AskRigor's own planning call is on; active says whether it
  // still is once the account is read (owner answer 395b: a test round's pause may begin meanwhile).
  learning?: { log: (failureClass: string) => void; active?: () => boolean },
  // AskRigor#477 stage 1: research dossiers are saved on this server; and the call is a test run's, marked
  // findings_save "off", which asks for none.
  dossiers = false,
  callSavingOff = false,
  // AskRigor#477 stage 2: public dossiers are on, so the shape asks for stage 2's declarations.
  publicDossiers = false,
  // Enforcing HRP, stage 1: say up front what can stop the answer.
  upFront = false,
  chatGpt = false,
): Promise<CallToolResult> {
  const account = await service.activeAccount(subject);
  // Owner answer 395b: a pause begun while the account was read counts, as when the call is off.
  const learningNow = learning?.active?.() === false ? undefined : learning;
  // A light lane is set by AskRigor's own plan only, so a menu handed over before a pause begun meanwhile goes as
  // research while it runs (Codex's recheck of 21 Nov); a pause already running is read before this call.
  if (learning !== undefined && learningNow === undefined) plan = withoutLane(plan);
  const accountKey = service.accountKeyForSubject(subject);
  const read = plan.plain_answer_receipt === undefined ? undefined : plain?.read?.(plan.plain_answer_receipt, accountKey);
  const problems: string[] = [];
  if (plan.plain_answer_receipt !== undefined && read === undefined) {
    problems.push("later_inputs.researchMenu.plain_answer_receipt is not a current plain-answer receipt of this " +
      "account, so the research target and the time since were not checked.");
  }
  const outOfRange = [...(plan.allocation ?? []).map(({ task }) => task), ...(plan.done ?? [])]
    .filter((task) => task > plan.tasks.length);
  if (outOfRange.length > 0) {
    problems.push(`Task numbers ${[...new Set(outOfRange)].join(", ")} are past the ${plan.tasks.length} tasks given; ` +
      "they were left out.");
  }
  // The review of 12 Nov 2026: the menu's digest, and whether its tasks differ from the menu the call's digest names.
  const digest = digestSecret === undefined || digestSecret === "" ? undefined : menuDigest(plan.tasks, digestSecret);
  // Owner answer 304a: the menu carries AskRigor's own mark that the person's newest message told the AI to go on,
  // and the mark is this menu's: signed for its tasks and for the plain-answer receipt it carries, which is a
  // current receipt of this account. Any other value in its place is not a mark, and changes nothing. It counts only
  // for a dev account while AskRigor's own planning call is on (learning is given only then), as the mark is made
  // only then: an account taken off the list keeps no go-ahead from a menu it was handed before (the review of 14
  // Nov 2026).
  const goOnAsked = learningNow !== undefined && digest !== undefined && read !== undefined &&
    plan.go_on_asked !== undefined &&
    plan.go_on_asked === goOnMark(plan.tasks, plan.plain_answer_receipt!, digestSecret!);
  const menu = digest === undefined ? undefined
    : { digest, changed: plan.menu_digest !== undefined && plan.menu_digest !== digest, goOnAsked };
  // AskRigor#467: a go-ahead not used: not one of its two words, without the person's words, beside an allocation not
  // declared the person's, or for a re-plan or a menu changed after it was shown (the review of #473, finding 1).
  const goAheadProblem = personGoAheadProblem(plan, menu?.changed === true);
  if (goAheadProblem !== undefined) problems.push(goAheadProblem);
  const result = planResearch(plan, account.steering, read === undefined ? undefined : {
    matches: read.target === researchTargetDigest(plan.research_target),
    minutesSince: Math.max(0, Math.round((Date.now() - Date.parse(read.issuedAt)) / 60_000)),
  }, menu);
  // Owner answers 294c (12 Nov 2026) and 296b (13 Nov 2026): on a dev account, a menu whose decision rests on the
  // judgment plans nothing until it names the question the AI would ask this person, or none; the yes or no alone
  // no longer answers there. So the AI decides a short menu, not the default, and decides it by trying to name a
  // choice of the person's first.
  if (devAccount && steeringChoiceLeftOut(plan, account.steering, menu)) {
    const refused = steeringChoiceRefusal(plan);
    return result.person_steered_problem === undefined ? refused
      : withMenuReadingSentence(refused, result.person_steered_problem);
  }
  // 13 Nov 2026, on every account: a steering_choice that is neither the word none nor a question ("none_needed")
  // is handed back when the decision rests on it, for the exact word or the question.
  if (steeringChoiceUnclearDecides(plan, account.steering, menu)) {
    const refused = steeringChoiceUnclearRefusal(plan);
    return result.person_steered_problem === undefined ? refused
      : withMenuReadingSentence(refused, result.person_steered_problem);
  }
  // 11 Nov 2026: the problems come first, so an ask's text ends with the rule for the person's answer; only the stop
  // for an allocation not used comes before them (planResearchText). Whether the menu's numbers must stay as they are
  // goes by whether an allocation or a done list was given at all, even one that names no open task or is not used;
  // whether to ask goes by allocationAnswered and person_answered, inside planResearch.
  const numbered = (plan.allocation ?? []).length > 0 || (plan.done ?? []).length > 0;
  // 12 Nov 2026: an ask hands over the "you decide" call ready to copy, in its text and as a runtime field, with
  // person_answered's placeholder in it, so the call copied as it is asks again.
  const youDecide = youDecideLaterInputs(plan, result);
  // Owner answer 303a: the ask names learn mode on a dev account while the planning call is on, and a call that carries
  // the person's answer is kept while learn mode is on (menuChoiceOf decides whether it does), after the result.
  const learnMode = learningNow === undefined ? undefined : account.steering.learnMenuChoices;
  if (learningNow !== undefined && learnMode === true) {
    keepMenuChoice(service, accountKey, () => menuChoiceOf(plan, account.steering, personReasonOf(plan.person_reason)),
      learningNow.log);
  }
  const text = planResearchText(result, new Set(plan.done ?? []), numbered, plan.research_target, youDecide,
    problems, learnMode, chatGpt);
  // An allocation not used is the first thing the text and next_step say, as a stop; the structured content also
  // names it first among its problems. The result is the ask again (or the menu that goes on), not an error.
  if (result.person_steered_problem !== undefined) problems.unshift(result.person_steered_problem);
  const structuredProblems = result.allocation_not_used === true
    ? [`later_inputs.researchMenu.allocation: not used; ${PERSON_ANSWER_DECLARED}, which the call did not give`,
      ...problems]
    : problems;
  // AskRigor#477 stage 1 (Codex's red team of the instruction proposal, items 1 and 3): a research plan that goes on,
  // not a light look-up's, for an account a dossier can be saved for, asks for the dossier before the first final check,
  // after everything else the result says and never in next_step, which an ask of the person's keeps.
  const dossierRequest = researchDossierAllowed(dossiers, account, callSavingOff) && result.next === "go_on" &&
    result.lane !== "light";
  return {
    content: [{ type: "text", text },
      ...(dossierRequest
        ? [{ type: "text" as const, text: `${RESEARCH_DOSSIER_REQUEST} ${researchDossierShape(publicDossiers)} ` +
          RESEARCH_DOSSIER_GUARDS }]
        : []),
      // Enforcing HRP, stage 1 (the owner's note on question 338): what can stop the answer, before research.
      ...(upFront ? [{ type: "text" as const, text: WHAT_STOPS_TEXT }] : [])],
    structuredContent: manageResearchAccessRuntimeOutputSchema.parse({
      ok: true,
      researchMenu: result,
      ...(structuredProblems.length === 0 ? {} : { problems: structuredProblems }),
      next_step: planNextStep(result, learnMode, chatGpt),
      ...(youDecide === undefined ? {} : { you_decide_later_inputs: youDecide }),
      ...(dossierRequest ? { research_dossier_request: { instruction: RESEARCH_DOSSIER_REQUEST,
        shape: researchDossierShape(publicDossiers), guards: RESEARCH_DOSSIER_GUARDS } } : {}),
      ...(upFront ? { what_stops: whatStops() } : {}),
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
    return accessError("plain_answer_not_requested", plain === undefined ? PLAIN_ANSWER_SURFACE_UNAVAILABLE : PLAIN_ANSWER_NOT_REQUESTED);
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
            { type: "text" as const, text: researchMapFiledStep() },
          ]),
        ],
        structuredContent: submitResearchContributionRuntimeOutputSchema.parse({
          ok: true,
          proposal,
          ...(mapReceipt === undefined ? {} : { research_receipt: mapReceipt, next_step: researchMapFiledStep() }),
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
        mapped.code !== "research_access_required"
          ? mapped.message
          : options.noticeElsewhere === true
            // Gemini's sign-in shows the notice on AskRigor's own page (owner answer 419a), so connecting again reaches it.
            ? `${mapped.message} This connector can't show AskRigor's research notice. Tell the person to remove AskRigor ` +
              "in Gemini's settings and add it again (AskRigor shows the notice when they sign in), or to open AskRigor " +
              "once in Claude or ChatGPT (https://askrigor.com/add), read the notice there and choose; then retry here."
            : `${mapped.message} Call manage_research_access with action inspect, show the user the notice it returns, and let them choose.`,
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
 * report (owner question 154); its findings-card saving setting (owner answer 171); and the free contributor notice it accepted
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
  findingsSave: boolean;
  noticeVersion: string | null;
} | undefined> {
  const auth = authorizedSubject(extra, undefined);
  if ("error" in auth || service === undefined) return undefined;
  try {
    const { mode, plainAnswerNote, detailedLessonReports, findingsSave, noticeVersion } = await service.activeAccount(auth.subject);
    return {
      mode,
      accountKey: service.accountKeyForSubject(auth.subject),
      plainAnswerNote,
      detailedLessonReports,
      findingsSave,
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
