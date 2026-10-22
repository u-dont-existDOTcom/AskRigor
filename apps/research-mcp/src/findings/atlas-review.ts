import { randomUUID } from "node:crypto";

import {
  ATLAS_CARD_DECISIONS,
  ATLAS_DISAGREEMENTS,
  ATLAS_FINDING_PROMOTION_FAILURE_CODES,
  ATLAS_FINDING_TAGS,
  ATLAS_INTENT_KINDS,
  ATLAS_INTENT_SCHEMA,
  ATLAS_LABELS,
  ATLAS_LINK_RELATIONS,
  ATLAS_RETRACTION_STATUSES,
  ATLAS_SOURCE_KINDS,
  ATLAS_SOURCE_PROVIDERS,
  ATLAS_VERIFIED_BASES,
  AtlasReviewError,
  atlasLabelOf,
  atlasNumbersSchema,
  atlasSourceIdentifierSchema,
  prepareAtlasFindingIntent,
  stableJson,
  type AtlasCardDecision,
  type AtlasCardItemKind,
  type AtlasDecisionView,
  type AtlasFindingIntent,
  type AtlasFindingPromotionFailureCode,
  type AtlasIntentKind,
  type AtlasIntentView,
  type AtlasLabel,
  type AtlasLinkRelation,
  type AtlasMadeWith,
  type AtlasNumberEntry,
  type AtlasReviewStore,
  type AtlasSource,
  type AtlasSourceIdentifier,
  type AtlasState,
  type AtlasStateFinding,
  type AtlasStateReader,
  type AtlasVersionContent,
  type PreparedAtlasFindingIntent,
} from "@askrigor/evidence-repository";
import type { CrossrefConfig, PubmedConfig } from "@askrigor/sources";
import { z } from "zod";

import { ATLAS_NUMBERS_PROBLEM_CODES, atlasNumbersProblems, type AtlasNumbersProblem } from "../binary-results.js";
import { GitHubApiError } from "../lessons/github-app.js";
import {
  ATLAS_COMMUNITY_STATES,
  ATLAS_LINK_PROBLEM_CODES,
  atlasBasesOf,
  atlasLinkProblems,
  atlasWordingKey,
  communityState,
  screenAtlasTexts,
  type AtlasBasis,
  type AtlasCommunityCheck,
  type AtlasDisagreement,
  type AtlasLinkProblem,
  type AtlasLinkProblemCode,
  type AtlasLinkState,
} from "./acceptance-checks.js";
import { FINDING_CERTAINTIES, PUBLIC_VALUE_SCOPES, type StoredFinding } from "./card.js";
import {
  decisionDate,
  findingsCardNumber,
  findingsCardSha256,
  isBeyondQuickAnswer,
  reconcileFindingsCard,
  type FindingsCardInbox,
  type FindingsCardRead,
  type FindingsDecisionMarker,
} from "./github-findings-review.js";
import { publicFindingsCardId } from "./github-findings.js";
import type { FindingsRecord, FindingsStamp, ProtocolIdentity } from "./service.js";
import {
  ATLAS_RETRACTION_SEVERITY,
  checkAtlasSources,
  parseAtlasSource,
  type AtlasCheckedSource,
  type AtlasSourceCheck,
  type AtlasSourceCheckCache,
  type AtlasSourceChecks,
} from "./source-checks.js";

/**
 * The owner's findings actions on review_research_contribution (Atlas phase 2 design, sections 1 to 3 and 9C; owner
 * answers 159 and 160b): list_findings, inspect_finding, accept_finding, edit_finding, reject_finding,
 * withdraw_finding and link_findings. Each decision on a card item is bound to the card record the owner inspected by
 * its SHA-256, runs every exact check again (part B), and records the decision and a hash-bound intent in one
 * transaction through the review role's functions (part A). The call never writes canonical evidence: the one-shot
 * writer applies the intent within about 5 minutes. Code checks only what is exact; the topic, the numbers and the
 * links are the AI's declarations, and the owner accepts or rejects.
 */

export const ATLAS_REVIEW_ACTIONS = [
  "list_findings",
  "inspect_finding",
  "accept_finding",
  "edit_finding",
  "reject_finding",
  "withdraw_finding",
  "link_findings",
] as const;
export type AtlasReviewAction = typeof ATLAS_REVIEW_ACTIONS[number];

export function isAtlasReviewAction(action: string): action is AtlasReviewAction {
  return (ATLAS_REVIEW_ACTIONS as readonly string[]).includes(action);
}

export const ATLAS_REVIEW_OUTCOMES = [
  "findings_listed",
  "finding_inspected",
  "finding_queued",
  "finding_written",
  "finding_write_failed",
  "finding_rejected",
  "needs_confirmation",
  "checks_not_passed",
  "try_again_later",
] as const;
export type AtlasReviewOutcome = typeof ATLAS_REVIEW_OUTCOMES[number];

export const ATLAS_REVIEW_ERROR_CODES = [
  "card_not_found",
  "card_changed",
  "item_not_found",
  "finding_not_found",
  "decision_conflict",
  "version_stale",
  // Erasing wording (decision 7) comes with part D; nothing is recorded until then.
  "erase_not_built",
  "atlas_review_closed",
] as const;
export type AtlasReviewErrorCode = typeof ATLAS_REVIEW_ERROR_CODES[number] | "invalid_request" |
  "review_service_unavailable";

/** Problems the checks name besides those of numbers, privacy and links, each with what to change. */
export const ATLAS_CHECK_PROBLEM_CODES = [
  "community_only",
  "source_refused",
  "source_not_on_finding",
  "source_conflict",
  "topic_label_missing",
  "open_lead_fields",
  "nothing_changed",
  "stamp_without_protocols",
  "intent_invalid",
] as const;
type CheckProblemCode = typeof ATLAS_CHECK_PROBLEM_CODES[number];

// Input fields --------------------------------------------------------------------------------------------------------

const publicNumberInput = z.string().trim().regex(/^[Ff]-[1-9][0-9]{3,}$/u);
const ownerText = (max: number) => z.string().trim().min(1).max(max);

/** The findings actions' fields, all flat so that ChatGPT's app shows them; per-action rules are in the refinement. */
export const atlasReviewInputShape = {
  card: z.string().trim().regex(/^[Aa][Rr][Ff]-[0-9]{1,9}$/u).optional()
    .describe("Findings actions: a findings card's id, such as ARF-0142, in any case."),
  finding: z.number().int().min(1).max(5).optional().describe("Findings actions: the card's finding, from 1."),
  lead: z.number().int().min(1).max(6).optional().describe("Findings actions: the card's open lead, from 1."),
  atlasNumber: publicNumberInput.optional().describe("Findings actions: an accepted finding's number, such as F-1007."),
  cardSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional()
    .describe("accept_finding, edit_finding: the cardSha256 inspect_finding returned for the card."),
  version: z.number().int().min(1).optional()
    .describe("edit_finding after acceptance, withdraw_finding: the finding's latest version, as inspect_finding last " +
      "showed it."),
  topicKey: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u).optional()
    .describe("accept_finding, edit_finding before acceptance: the topic the finding is filed under, as the topic key " +
      "format has it (lower case, digits, . _ -), such as velmor-syndrome. You declare it; the reply names it."),
  topicLabel: ownerText(200).optional()
    .describe("With topicKey, when the topic is new: its label, such as Velmor syndrome."),
  wording: ownerText(500).optional().describe("edit_finding: the finding's wording as the owner wants it."),
  appliesTo: ownerText(300).optional().describe("edit_finding: whom or what the finding holds for."),
  whyNotUsual: ownerText(300).optional().describe("edit_finding: why the usual answer misses it."),
  whatWouldChangeIt: ownerText(300).optional().describe("edit_finding: what would change it."),
  question: ownerText(300).optional().describe("edit_finding before acceptance only: the question it answers."),
  sources: z.array(z.string().trim().min(1).max(300)).min(1).max(10).optional()
    .describe("edit_finding: the sources to keep, only some of the finding's own identifiers."),
  numbers: atlasNumbersSchema.optional(),
  note: ownerText(600).optional()
    .describe("edit_finding after acceptance (a correction), withdraw_finding, and an unlink: the public note; the " +
      "server dates it."),
  correction: z.boolean().optional()
    .describe("edit_finding after acceptance: true (the default) for a correction with a dated note, false for a " +
      "wording fix."),
  eraseWording: z.boolean().optional()
    .describe("Erasing wording that could identify a person comes with the next part of the Atlas build; until then " +
      "a call with it records nothing."),
  confirm: z.boolean().optional()
    .describe("accept_finding, edit_finding: true only after the owner said to accept anyway what the checks flagged."),
  relation: z.enum([...ATLAS_LINK_RELATIONS, "unlink"]).optional()
    .describe("link_findings: atlasNumber same_as, narrows, contradicts or replaces the finding named by to; unlink " +
      "withdraws their link."),
  to: publicNumberInput.optional().describe("link_findings: the other finding, such as F-1001."),
  disagreement: z.enum(ATLAS_DISAGREEMENTS).optional()
    .describe("link_findings with contradicts: what the two disagree on."),
  rationale: ownerText(500).optional().describe("link_findings: why the link holds, public."),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,400}$/u).optional().describe("list_findings: the nextCursor it returned."),
};

type AtlasFieldName = keyof typeof atlasReviewInputShape | "reason" | "proposalId" | "expectedPayloadSha256";
const ATLAS_FIELD_NAMES = Object.keys(atlasReviewInputShape) as Array<keyof typeof atlasReviewInputShape>;

export interface AtlasReviewRequest {
  action: AtlasReviewAction;
  card?: string;
  finding?: number;
  lead?: number;
  atlasNumber?: string;
  cardSha256?: string;
  version?: number;
  topicKey?: string;
  topicLabel?: string;
  wording?: string;
  appliesTo?: string;
  whyNotUsual?: string;
  whatWouldChangeIt?: string;
  question?: string;
  sources?: string[];
  numbers?: AtlasNumberEntry[];
  note?: string;
  reason?: string;
  correction?: boolean;
  eraseWording?: boolean;
  confirm?: boolean;
  relation?: AtlasLinkRelation | "unlink";
  to?: string;
  disagreement?: AtlasDisagreement;
  rationale?: string;
  cursor?: string;
}

const EDIT_TEXTS = ["wording", "appliesTo", "whyNotUsual", "whatWouldChangeIt"] as const;
const CARD_ITEM_DECISION_FIELDS: AtlasFieldName[] = [
  "card", "finding", "lead", "cardSha256", "topicKey", "topicLabel", "numbers", "confirm", "reason",
];
const FIELDS_BY_ACTION: Record<AtlasReviewAction | "edit_after", readonly AtlasFieldName[]> = {
  list_findings: ["cursor"],
  inspect_finding: ["card", "finding", "lead", "atlasNumber"],
  accept_finding: CARD_ITEM_DECISION_FIELDS,
  edit_finding: [...CARD_ITEM_DECISION_FIELDS, ...EDIT_TEXTS, "question", "sources"],
  edit_after: ["atlasNumber", "card", "finding", "lead", "version", ...EDIT_TEXTS, "sources", "numbers", "note",
    "correction", "eraseWording", "confirm", "reason"],
  reject_finding: ["card", "finding", "lead", "cardSha256", "reason"],
  withdraw_finding: ["atlasNumber", "card", "finding", "lead", "version", "note", "eraseWording", "reason"],
  link_findings: ["atlasNumber", "relation", "to", "disagreement", "rationale", "note", "reason"],
};

/**
 * The per-action rules of the findings actions' flat input. An edit_finding call with version is an edit after
 * acceptance; without it, an acceptance with the owner's wording.
 */
export function refineAtlasReviewInput(
  value: Partial<Record<AtlasFieldName, unknown>> & { action: AtlasReviewAction },
  context: z.RefinementCtx,
): void {
  const issue = (message: string, field?: string) =>
    context.addIssue({ code: "custom", message, ...(field === undefined ? {} : { path: [field] }) });
  const has = (field: AtlasFieldName) => value[field] !== undefined;
  const action = value.action;
  const after = action === "edit_finding" && has("version");
  const allowed = new Set<AtlasFieldName>(FIELDS_BY_ACTION[after ? "edit_after" : action]);
  for (const field of [...ATLAS_FIELD_NAMES, "reason", "proposalId", "expectedPayloadSha256"] as AtlasFieldName[]) {
    if (has(field) && !allowed.has(field)) {
      issue(`${action}${after ? " after acceptance" : ""} does not take ${field}`, field);
    }
  }
  const oneItem = () => {
    if (!has("card")) issue(`${action} needs card, such as ARF-0142`, "card");
    if (has("finding") === has("lead")) issue(`${action} names either finding or lead`, "finding");
  };
  const findingOrCard = () => {
    if (has("atlasNumber") === has("card")) {
      issue(`${action} names the finding by atlasNumber, or by card with finding or lead`, "atlasNumber");
    } else if (has("card") && has("finding") === has("lead")) {
      issue(`${action} names either finding or lead with card`, "finding");
    }
  };
  switch (action) {
    case "list_findings":
      return;
    case "inspect_finding":
      if (has("atlasNumber") === has("card")) issue("inspect_finding names a card or an atlasNumber", "card");
      if (has("finding") && has("lead")) issue("inspect_finding names finding or lead, not both", "finding");
      if (has("atlasNumber") && (has("finding") || has("lead"))) {
        issue("inspect_finding takes finding or lead only with card", "finding");
      }
      return;
    case "accept_finding":
    case "edit_finding":
      if (after) {
        findingOrCard();
        if (![...EDIT_TEXTS, "sources", "numbers"].some((field) => has(field as AtlasFieldName))) {
          issue("edit_finding after acceptance needs a new wording, appliesTo, whyNotUsual, whatWouldChangeIt, " +
            "sources or numbers", "wording");
        }
        if (value.correction !== false && !has("note")) {
          issue("a correction needs its public note; set correction to false for a wording fix", "note");
        }
        return;
      }
      oneItem();
      if (!has("cardSha256")) issue(`${action} needs cardSha256, from inspect_finding`, "cardSha256");
      if (!has("topicKey")) issue(`${action} needs topicKey (and topicLabel for a new topic)`, "topicKey");
      if (!has("numbers")) issue(`${action} needs numbers, an empty list when the wording gives no two-group figure`,
        "numbers");
      if (action === "edit_finding" && ![...EDIT_TEXTS, "question", "sources"].some((field) =>
        has(field as AtlasFieldName))) {
        issue("edit_finding needs a new wording, appliesTo, whyNotUsual, whatWouldChangeIt, question or sources; " +
          "to accept the item as it stands, use accept_finding", "wording");
      }
      return;
    case "reject_finding":
      oneItem();
      if (!has("reason")) issue("reject_finding needs the owner's reason, which stays private", "reason");
      return;
    case "withdraw_finding":
      findingOrCard();
      if (!has("version")) issue("withdraw_finding needs version, the finding's latest", "version");
      if (!has("note")) issue("withdraw_finding needs its public note", "note");
      return;
    case "link_findings":
      if (!has("atlasNumber")) issue("link_findings needs atlasNumber", "atlasNumber");
      if (!has("relation")) issue("link_findings needs relation", "relation");
      if (!has("to")) issue("link_findings needs to, the other finding", "to");
      if (value.relation === "unlink") {
        if (!has("note") && !has("rationale")) issue("an unlink needs its public note", "note");
      } else {
        if (!has("rationale")) issue("link_findings needs rationale", "rationale");
        if (has("note")) issue("note goes only with relation unlink", "note");
      }
      return;
  }
}

// Output objects --------------------------------------------------------------------------------------------------------

const publicNumberSchema = z.string().regex(/^F-[1-9][0-9]{3,}$/u);
const cardIdSchema = z.string().regex(/^ARF-[0-9]{4,}$/u);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const wouldBecomeSchema = z.enum(["checked", "lead", "recheck", "community_only"]);
const failureCodeSchema = z.enum(ATLAS_FINDING_PROMOTION_FAILURE_CODES);
const intentStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);
const topicViewSchema = z.object({ key: z.string(), label: z.string(), isNew: z.boolean() }).strict();

const intentViewSchema = z.object({
  intentId: z.string().uuid(),
  kind: z.enum(ATLAS_INTENT_KINDS),
  atlasNumber: publicNumberSchema,
  status: intentStatusSchema,
  createdAt: z.string(),
  failureCode: failureCodeSchema.nullable(),
  explanation: z.string().nullable(),
}).strict();

/** list_findings: what waits, compactly enough for a phone. */
export const atlasFindingsListSchema = z.object({
  refused: z.array(intentViewSchema).max(200),
  waitingForWriter: z.number().int().nonnegative(),
  cards: z.array(z.object({
    card: cardIdSchema,
    question: z.string(),
    savedOn: daySchema,
    beyondQuickAnswer: z.boolean(),
    publicValue: z.enum(["public", "personal_only", "missing"]),
    items: z.array(z.object({
      item: z.enum(["finding", "lead"]),
      number: z.number().int().min(1).max(6),
      text: z.string(),
      certainty: z.enum(FINDING_CERTAINTIES).nullable(),
      wouldBecome: wouldBecomeSchema,
      recheckOf: publicNumberSchema.nullable(),
    }).strict()).max(11),
  }).strict()).max(10),
  nextCursor: z.string().nullable(),
  unreadableCards: z.array(cardIdSchema).max(1_000),
}).strict();
export type AtlasFindingsList = z.infer<typeof atlasFindingsListSchema>;

/** inspect_finding on a card: its texts, and each item with what it would become and its decision. */
export const atlasCardViewSchema = z.object({
  card: cardIdSchema,
  state: z.enum(["open", "closed"]),
  cardSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  question: z.string(),
  usualAnswer: z.string(),
  publicValue: z.object({
    scope: z.enum(PUBLIC_VALUE_SCOPES),
    whoElse: z.string().nullable(),
    whatItChanges: z.string().nullable(),
  }).strict().nullable(),
  savedOn: daySchema,
  saves: z.number().int().min(1),
  beyondQuickAnswer: z.boolean(),
  items: z.array(z.object({
    item: z.enum(["finding", "lead"]),
    number: z.number().int().min(1).max(6),
    text: z.string(),
    certainty: z.enum(FINDING_CERTAINTIES).nullable(),
    appliesTo: z.string().nullable(),
    sources: z.array(z.string()).max(10),
    youtubeVideos: z.number().int().nonnegative(),
    save: z.enum(["card", "occurrence"]),
    bases: z.array(z.enum(ATLAS_VERIFIED_BASES)),
    wouldBecome: wouldBecomeSchema,
    recheckOf: publicNumberSchema.nullable(),
    decision: z.object({
      decision: z.enum(ATLAS_CARD_DECISIONS),
      atlasNumber: publicNumberSchema.nullable(),
      decidedAt: z.string(),
      intentStatus: intentStatusSchema.nullable(),
      failureCode: failureCodeSchema.nullable(),
    }).strict().nullable(),
  }).strict()).max(11),
  githubSynced: z.boolean(),
}).strict();
export type AtlasCardView = z.infer<typeof atlasCardViewSchema>;

/** An accepted finding: its number, kind, label and version, and the intents that write it. */
export const atlasStatusSchema = z.object({
  atlasNumber: publicNumberSchema,
  entryKind: z.enum(["finding", "lead"]).nullable(),
  label: z.enum(ATLAS_LABELS).nullable(),
  labelAfter: z.enum(ATLAS_LABELS).nullable(),
  version: z.number().int().min(1).nullable(),
  topic: topicViewSchema.nullable(),
  wording: z.string().nullable(),
  researchCheckedOn: daySchema.nullable(),
  links: z.array(z.object({
    relation: z.enum(ATLAS_LINK_RELATIONS),
    direction: z.enum(["from", "to"]),
    other: publicNumberSchema.nullable(),
    disagreement: z.enum(ATLAS_DISAGREEMENTS).nullable(),
    withdrawn: z.boolean(),
  }).strict()).max(200),
  intent: intentViewSchema.nullable(),
  intents: z.array(intentViewSchema).max(200),
}).strict();
export type AtlasStatus = z.infer<typeof atlasStatusSchema>;

const sourceCheckViewSchema = z.object({
  source: z.string(),
  outcome: z.enum(["checked", "not_found", "unavailable", "invalid_identifier"]),
  identifier: z.string().nullable(),
  provider: z.enum(ATLAS_SOURCE_PROVIDERS).nullable(),
  title: z.string().nullable(),
  year: z.string().nullable(),
  retraction: z.enum(ATLAS_RETRACTION_STATUSES).nullable(),
  notices: z.number().int().nonnegative(),
  needsConfirmation: z.boolean(),
  binding: z.enum(["supports", "context_only"]).nullable(),
  sameAs: z.string().nullable(),
  errorCode: z.string().nullable(),
}).strict();
type SourceCheckView = z.infer<typeof sourceCheckViewSchema>;

/** Every exact check, as a dry run (inspect) or as what refused or flags a decision. */
export const atlasChecksSchema = z.object({
  item: z.string(),
  wouldBecome: wouldBecomeSchema.nullable(),
  save: z.enum(["card", "occurrence"]).nullable(),
  bases: z.array(z.enum(ATLAS_VERIFIED_BASES)),
  recheckOf: publicNumberSchema.nullable(),
  community: z.enum(ATLAS_COMMUNITY_STATES).nullable(),
  sourceStatus: z.enum(["passed", "needs_confirmation", "refused", "try_again_later"]).nullable(),
  sources: z.array(sourceCheckViewSchema).max(10),
  numbers: z.array(z.object({
    at: z.string(),
    code: z.enum(ATLAS_NUMBERS_PROBLEM_CODES),
    message: z.string(),
  }).strict()).max(200),
  privacy: z.array(z.object({ field: z.string(), reasonCode: z.string() }).strict()).max(200),
  links: z.array(z.object({
    code: z.enum(ATLAS_LINK_PROBLEM_CODES),
    writerCode: failureCodeSchema.nullable(),
    message: z.string(),
  }).strict()).max(20),
  problems: z.array(z.object({ code: z.enum(ATLAS_CHECK_PROBLEM_CODES), message: z.string() }).strict()).max(50),
  needsConfirmation: z.array(z.string()).max(20),
  topic: topicViewSchema.nullable(),
  relatedTopics: z.array(z.object({ key: z.string(), label: z.string() }).strict()).max(50),
}).strict();
export type AtlasChecks = z.infer<typeof atlasChecksSchema>;

export const atlasRetrySchema = z.object({
  reason: z.enum(["provider_unavailable", "github_unavailable", "writer_pending"]),
  message: z.string(),
}).strict();

export interface AtlasReviewResult {
  ok: boolean;
  text: string;
  outcome?: AtlasReviewOutcome;
  error?: { code: AtlasReviewErrorCode; message: string };
  findings?: AtlasFindingsList;
  card?: AtlasCardView;
  atlas?: AtlasStatus;
  checks?: AtlasChecks;
  retry?: z.infer<typeof atlasRetrySchema>;
}

// Dependencies ----------------------------------------------------------------------------------------------------------

export interface AtlasProviderConfig {
  crossref: CrossrefConfig;
  pubmed: PubmedConfig;
}

export interface AtlasReviewDependencies {
  /** The review role's five functions (decisions and intents); it never writes canonical evidence. */
  store: AtlasReviewStore;
  /** The canonical Atlas, read-only. */
  reader: AtlasStateReader;
  /** The private GitHub inbox of findings cards. */
  inbox: FindingsCardInbox;
  /** Which AskRigor records a decision that makes no research: a withdrawal or a link. */
  version: string;
  build: string;
  protocols: () => Promise<readonly ProtocolIdentity[]>;
  now?: () => Date;
  newIntentId?: () => string;
  /** The source checks' reuse between inspect and accept; the process's own by default. */
  sourceCheckCache?: AtlasSourceCheckCache;
}

// Plain words for the writer's failure codes --------------------------------------------------------------------------

/** What each failure code the Atlas writer may record means, for the owner. */
export const ATLAS_FAILURE_EXPLANATIONS: Record<AtlasFindingPromotionFailureCode, string> = {
  ATLAS_INTENT_APPLICATION_MISMATCH: "the writer already applied a different intent under this intent's ID",
  ATLAS_FINDING_ALREADY_WRITTEN: "a finding with this number is already stored",
  ATLAS_FINDING_MISSING: "the finding is not in the Atlas",
  ATLAS_FINDING_WITHDRAWN: "the finding is withdrawn, so it takes no further change",
  ATLAS_VERSION_STALE: "the version sent was not the finding's latest; inspect it again and send its latest version",
  ATLAS_TOPIC_MISSING: "the topic key is not in the Atlas and no topic label came with it",
  ATLAS_RECHECK_KEY_MISMATCH: "the re-check's question and claim match no version of the finding",
  ATLAS_LINK_TARGET_MISSING: "the other finding is not in the Atlas",
  ATLAS_LINK_TARGET_WITHDRAWN: "the other finding is withdrawn",
  ATLAS_LINK_LEAD: "a lead takes no part in same_as, narrows or contradicts, and may only be the older side of replaces",
  ATLAS_LINK_PAIR_TAKEN: "the two findings already carry a relation; unlink it first to record another",
  ATLAS_LINK_ALREADY_RECORDED: "this link was recorded before and withdrawn, and the same link is not recorded again",
  ATLAS_LINK_CYCLE: "the replaces link would make a cycle of findings replacing each other",
  ATLAS_LINK_MISSING: "the two findings have no standing link of that relation to withdraw",
  SOURCE_IDENTIFIER_CONFLICT: "a source's identifiers name another study record in the Atlas, or one of another kind",
  ATLAS_VERSION_LINEAGE_MISMATCH: "the finding's version chain did not line up",
  CLAIM_DEPENDENCY_CYCLE: "the link would make the findings' claims depend on each other in a cycle",
  CANONICAL_UNIQUE_CONFLICT: "a stored record already holds one of its unique values",
  CANONICAL_REFERENCE_MISSING: "a record it refers to is missing",
  CANONICAL_CHECK_VIOLATION: "a rule of the canonical store refused one of its values",
  CANONICAL_VALUE_INVALID: "one of its values was not valid for the canonical store",
};

/** The writer's failure code a link problem foretells, so a refused link names the code the writer would record. */
const LINK_PROBLEM_WRITER_CODES: Partial<Record<AtlasLinkProblemCode, AtlasFindingPromotionFailureCode>> = {
  finding_missing: "ATLAS_FINDING_MISSING",
  finding_withdrawn: "ATLAS_FINDING_WITHDRAWN",
  lead_in_link: "ATLAS_LINK_LEAD",
  pair_already_linked: "ATLAS_LINK_PAIR_TAKEN",
  link_stored_before: "ATLAS_LINK_ALREADY_RECORDED",
  replaces_cycle: "ATLAS_LINK_CYCLE",
  link_missing: "ATLAS_LINK_MISSING",
};

const WRITER_SENTENCE = "The Atlas writer stores it within about 5 minutes; nothing is public until the Atlas pages exist.";

// The service ---------------------------------------------------------------------------------------------------------

interface ItemRef {
  itemKind: AtlasCardItemKind;
  itemNumber: number;
}

/** A card item, as the save that counts holds it (design section 2). */
interface CardItem {
  ref: ItemRef;
  name: string;
  text: string;
  question: string;
  certainty: StoredFinding["certainty"] | null;
  appliesTo: string | null;
  sources: string[];
  youtubeVideos: number;
  save: "card" | "occurrence";
  /** The save that counts: its stamp dates the research and names the AskRigor that made it. */
  record: FindingsRecord;
  finding: StoredFinding | null;
  bases: AtlasBasis[];
  entryKind: "finding" | "lead";
  leadOrigin: "unverified_finding" | "open_lead" | null;
  cardWordingKey: string;
}

interface LoadedCard {
  card: FindingsCardRead;
  decisions: AtlasDecisionView[];
  cardSha256: string;
  synced: boolean;
}

interface SourcePlan {
  status: AtlasSourceChecks["status"];
  views: SourceCheckView[];
  sources: AtlasSource[];
  confirmations: string[];
  problems: Array<{ code: CheckProblemCode; message: string }>;
}

type Failure = { failed: AtlasReviewResult };
const failed = (result: AtlasReviewResult): Failure => ({ failed: result });
const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && "failed" in value;

export class AtlasReview {
  private readonly now: () => Date;
  private readonly newIntentId: () => string;

  constructor(private readonly deps: AtlasReviewDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.newIntentId = deps.newIntentId ?? (() => randomUUID());
  }

  /** Runs one findings action; it never throws, and never writes canonical evidence. */
  async run(request: AtlasReviewRequest, providers: AtlasProviderConfig): Promise<AtlasReviewResult> {
    try {
      switch (request.action) {
        case "list_findings": return await this.list(request);
        case "inspect_finding":
          return request.atlasNumber !== undefined
            ? await this.inspectFinding(normalizedNumber(request.atlasNumber))
            : await this.inspectCard(request, providers);
        case "accept_finding": return await this.decideItem(request, providers, "accept");
        case "edit_finding":
          return request.version === undefined
            ? await this.decideItem(request, providers, "edit")
            : await this.editAccepted(request, providers);
        case "reject_finding": return await this.reject(request);
        case "withdraw_finding": return await this.withdraw(request);
        case "link_findings": return await this.link(request);
      }
    } catch (error) {
      return errorResult(error);
    }
  }

  // list_findings -----------------------------------------------------------------------------------------------------

  private async list(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const after = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    if (after === null) return errorOf("invalid_request", "The cursor is not one list_findings returned.");
    const [open, intents] = await Promise.all([this.deps.inbox.openCards(), this.deps.store.inspectIntents(null)]);
    const readable = open.filter((card): card is typeof card & { record: FindingsRecord } => card.record !== undefined);
    const decisions = readable.length === 0 ? [] : await this.deps.store.inspectCards(readable.map(({ number }) => number));
    const decisionsOf = (cardNumber: number) => decisions.filter((decision) => decision.cardNumber === cardNumber);
    const waiting: Array<typeof readable[number] & { key: CursorKey }> = [];
    let unsynced = 0;
    for (const card of readable) {
      const own = decisionsOf(card.number);
      const decided = new Set(own.filter(({ itemKind }) => itemKind === "finding").map(({ itemNumber }) => itemNumber));
      if (card.record.card.findings.every((_, index) => decided.has(index + 1))) {
        // Every finding has a decision: GitHub catches up now, and the card leaves the list.
        const comments = await this.deps.inbox.readComments(card.number);
        if (comments.status === "read") {
          const sync = await reconcileFindingsCard(this.deps.inbox, {
            number: card.number, state: "open", labels: card.labels, decisions: comments.decisions,
            findings: card.record.card.findings.length,
          }, own);
          if (!sync.synced) unsynced += 1;
        }
        continue;
      }
      waiting.push({ ...card, key: cursorKeyOf(card.labels, card.record, card.number) });
    }
    waiting.sort((left, right) => compareCursorKeys(left.key, right.key));
    const remaining = after === undefined ? waiting : waiting.filter(({ key }) => compareCursorKeys(key, after) > 0);
    const shown = remaining.slice(0, LIST_PAGE);
    const nextCursor = remaining.length > LIST_PAGE ? encodeCursor(shown.at(-1)!.key) : null;

    const loaded = await Promise.all(shown.map(async (card) => {
      const comments = card.comments === 0
        ? { status: "read" as const, occurrences: [], decisions: [] }
        : await this.deps.inbox.readComments(card.number);
      return { card, comments };
    }));
    const keys = loaded.flatMap(({ card, comments }) => comments.status === "unreadable" ? [] :
      card.record.card.findings.flatMap((_, index) => {
        const item = cardItem({ record: card.record, occurrences: comments.occurrences }, publicFindingsCardId(card.number),
          { itemKind: "finding", itemNumber: index + 1 });
        return item === undefined ? [] : [item.cardWordingKey];
      }));
    const state = keys.length === 0 ? undefined : await this.deps.reader.readAtlasState({ wordingKeys: [...new Set(keys)] });
    const recheck = (key: string) => state === undefined ? undefined : recheckTarget(state, key);

    const cards: AtlasFindingsList["cards"] = [];
    const unreadable = open.filter(({ record }) => record === undefined).map(({ number }) => publicFindingsCardId(number));
    for (const { card, comments } of loaded) {
      if (comments.status === "unreadable") {
        unreadable.push(publicFindingsCardId(card.number));
        continue;
      }
      const own = decisionsOf(card.number);
      if (own.length > 0) {
        const sync = await reconcileFindingsCard(this.deps.inbox, {
          number: card.number, state: "open", labels: card.labels, decisions: comments.decisions,
          findings: card.record.card.findings.length,
        }, own);
        if (!sync.synced) unsynced += 1;
      }
      const id = publicFindingsCardId(card.number);
      const items: AtlasFindingsList["cards"][number]["items"] = [];
      const refs: ItemRef[] = [
        ...card.record.card.findings.map((_, index) => ({ itemKind: "finding" as const, itemNumber: index + 1 })),
        ...card.record.card.open_leads.map((_, index) => ({ itemKind: "open_lead" as const, itemNumber: index + 1 })),
      ];
      for (const ref of refs) {
        if (decisionFor(own, ref) !== undefined) continue;
        const item = cardItem({ record: card.record, occurrences: comments.occurrences }, id, ref)!;
        const recheckOf = item.ref.itemKind === "finding" ? recheck(item.cardWordingKey) : undefined;
        items.push({
          item: ref.itemKind === "finding" ? "finding" : "lead",
          number: ref.itemNumber,
          text: clip(item.text, 160),
          certainty: item.certainty,
          wouldBecome: wouldBecome(item, recheckOf),
          recheckOf: recheckOf ?? null,
        });
      }
      const value = card.record.card.public_value;
      cards.push({
        card: id,
        question: clip(card.record.card.question, 120),
        savedOn: card.record.stamp.saved_at.slice(0, 10),
        beyondQuickAnswer: isBeyondQuickAnswer(card.labels),
        publicValue: value === undefined ? "missing" : value.scope,
        items,
      });
    }
    const refused = intents.filter(({ status }) => status === "FAILED").map(intentView);
    const waitingForWriter = intents.filter(({ status }) => status === "PENDING").length;
    const findings: AtlasFindingsList = { refused, waitingForWriter, cards, nextCursor, unreadableCards: unreadable };
    const lines = [
      ...refused.map((intent) => `The Atlas writer refused ${intent.atlasNumber}'s ${intent.kind} with ` +
        `${intent.failureCode}: ${intent.explanation}.`),
      ...(waitingForWriter === 0 ? [] : [`${waitingForWriter} decision${waitingForWriter === 1 ? " waits" : "s wait"} ` +
        "for the Atlas writer (about 5 minutes)."]),
      ...(cards.length === 0 ? ["No findings card waits for a decision."] : cards.map((card) =>
        `${card.card}${card.beyondQuickAnswer ? " (beyond a quick answer)" : ""}, saved ${card.savedOn}: ` +
        `${card.question}${card.publicValue === "public" ? "" : ` [public value ${card.publicValue}]`}\n` +
        card.items.map((item) => `  ${item.item === "finding" ? "Finding" : "Open lead"} ${item.number}: ${item.text}` +
          `${item.certainty === null ? "" : ` (${item.certainty})`} -> ${wouldBecomeWords(item.wouldBecome, item.recheckOf)}`)
          .join("\n"))),
      ...(nextCursor === null ? [] : ["More cards wait: call list_findings with the nextCursor."]),
      ...(unreadable.length === 0 ? [] : [`${unreadable.join(", ")} cannot be read as the library saved ` +
        `${unreadable.length === 1 ? "it" : "them"}, so ${unreadable.length === 1 ? "it is" : "they are"} left out.`]),
      ...(unsynced === 0 ? [] : ["Some decisions are not on GitHub yet; the next list or inspect posts them."]),
    ];
    return { ok: true, outcome: "findings_listed", text: lines.join("\n"), findings };
  }

  // inspect_finding ---------------------------------------------------------------------------------------------------

  private async inspectCard(request: AtlasReviewRequest, providers: AtlasProviderConfig): Promise<AtlasReviewResult> {
    const cardNumber = findingsCardNumber(request.card!)!;
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded.failed;
    const id = publicFindingsCardId(cardNumber);
    const findingItems = loaded.card.record.card.findings.map((_, index) =>
      cardItem(loaded.card, id, { itemKind: "finding", itemNumber: index + 1 })!);
    const ref = itemRefOf(request);
    const focus = ref === undefined ? undefined : cardItem(loaded.card, id, ref);
    if (ref !== undefined && focus === undefined) return itemNotFound(id, ref);
    const decision = focus === undefined ? undefined : decisionFor(loaded.decisions, focus.ref);

    // A dry run of every exact check on an undecided item; the card alone needs no provider.
    const kept = focus?.sources ?? [];
    const sourceChecks = focus === undefined || decision !== undefined || kept.length === 0
      ? undefined
      : await this.checkSources(kept, providers);
    const state = await this.deps.reader.readAtlasState({
      wordingKeys: findingItems.map(({ cardWordingKey }) => cardWordingKey),
      identifiers: sourceChecks === undefined ? [] : checkedIdentifiers(sourceChecks),
    });
    const card = cardView(loaded, findingItems, state);
    if (focus === undefined) {
      return {
        ok: true,
        outcome: "finding_inspected",
        card,
        text: `${id} (cardSha256 ${loaded.cardSha256}), saved ${card.savedOn}: ${card.question}\n` +
          card.items.map((item) => `${item.item === "finding" ? "Finding" : "Open lead"} ${item.number}: ` +
            `${clip(item.text, 160)} -> ${item.decision === null
              ? wouldBecomeWords(item.wouldBecome, item.recheckOf)
              : `decided: ${decisionWords(item.decision.decision, item.decision.atlasNumber)}`}`).join("\n") +
          (loaded.synced ? "" : "\nGitHub is not up to date with the decisions yet; the next inspect posts them."),
      };
    }
    if (decision !== undefined) {
      const status = decision.publicNumber === null ? undefined : await this.statusOf(decision.publicNumber, decision);
      return {
        ok: true,
        outcome: "finding_inspected",
        card,
        ...(status === undefined ? {} : { atlas: status }),
        text: `${focus.name} is decided: ${decisionWords(decision.decision, decision.publicNumber)}, ` +
          `${decisionDate(decision.decidedAt)}.${status === undefined ? "" : ` ${statusSentence(status)}`}`,
      };
    }
    const recheckOf = focus.ref.itemKind === "finding" ? recheckTarget(state, focus.cardWordingKey) : undefined;
    const community = focus.finding === null ? undefined : communityState({ ...focus.finding, sources: kept });
    const plan = sourceChecks === undefined ? emptySourcePlan() : planSources(sourceChecks, state, false);
    const accepted = acceptedTexts(focus, {});
    const privacy = screenTexts(itemTexts(focus, accepted, []));
    const problems = [...plan.problems];
    if (community?.refused === true) problems.push(communityOnlyProblem(focus.name));
    if (madeWithOf(focus.record.stamp).protocols.length === 0) problems.push(stampProblem());
    const checks = checksOf({
      item: focus.name, wouldBecome: wouldBecome(focus, recheckOf, community), focus, recheckOf, community, plan,
      sourceChecks, privacy, problems, relatedTopics: state.topics,
    });
    const flagged = [...(community?.needsConfirmation === true ? [communityConfirmation()] : []), ...plan.confirmations];
    const next = recheckOf !== undefined
      ? `accept_finding records it as a re-check of ${recheckOf}`
      : "accept_finding needs this cardSha256, a topicKey (and topicLabel for a new topic) and the numbers the " +
        "wording gives (an empty list if none)";
    return {
      ok: true,
      outcome: "finding_inspected",
      card,
      checks,
      text: `${focus.name} (cardSha256 ${loaded.cardSha256}) would be ${wouldBecomeWords(checks.wouldBecome!, recheckOf ?? null)}` +
        ` (${focus.save === "card" ? "the card's own save" : "a later save"}; bases: ` +
        `${focus.bases.length === 0 ? "none" : focus.bases.join(", ")}).\n${sourcesSentence(plan)}` +
        (privacy.length === 0 ? "" : `\nPrivacy: ${privacy.map(({ field, reasonCode }) => `${field} (${reasonCode})`).join(", ")}.`) +
        (problems.length === 0 ? "" : `\n${problems.map(({ message }) => message).join("\n")}`) +
        (flagged.length === 0 ? "" : `\nNeeds the owner's confirmation: ${flagged.join("; ")}.`) +
        `\nNext: ${next}.`,
    };
  }

  private async inspectFinding(publicNumber: string): Promise<AtlasReviewResult> {
    const status = await this.statusOf(publicNumber);
    if (status === undefined) {
      return errorOf("finding_not_found", `No finding has the number ${publicNumber}.`);
    }
    return { ok: true, outcome: "finding_inspected", atlas: status, text: statusSentence(status) };
  }

  /** A finding's stored state, or what its intents say while it is not stored yet; undefined when there is none. */
  private async statusOf(publicNumber: string, decision?: AtlasDecisionView): Promise<AtlasStatus | undefined> {
    const [intents, state] = await Promise.all([
      this.deps.store.inspectIntents([publicNumber]),
      this.deps.reader.readAtlasState({ publicNumbers: [publicNumber] }),
    ]);
    const own = intents.filter((intent) => intent.publicNumber === publicNumber ||
      ("toPublicNumber" in intent.payload && intent.payload.toPublicNumber === publicNumber));
    const views = own.map(intentView);
    const decided = decision?.intentId === null || decision === undefined
      ? undefined
      : views.find(({ intentId }) => intentId === decision.intentId);
    const finding = state.findings.find((candidate) => candidate.publicNumber === publicNumber);
    if (finding === undefined) {
      const accept = [...own].reverse().find((intent) => intent.intentKind === "accept" &&
        intent.publicNumber === publicNumber);
      if (accept === undefined || accept.payload.kind !== "accept") return undefined;
      const payload = accept.payload;
      return {
        atlasNumber: publicNumber,
        entryKind: payload.entryKind,
        label: null,
        labelAfter: accept.status === "FAILED" ? null : payload.entryKind === "finding" ? "checked" : "lead",
        version: null,
        topic: payload.topic.label === null ? null : { key: payload.topic.key, label: payload.topic.label, isNew: true },
        wording: payload.content.wording,
        researchCheckedOn: payload.researchCheckedOn,
        links: [],
        intent: decided ?? intentView(accept),
        intents: views,
      };
    }
    const latest = finding.versions.at(-1)!;
    const topic = state.topics.find(({ topicId }) => topicId === finding.topicId);
    const numberOf = (findingId: string) =>
      state.findings.find((candidate) => candidate.findingId === findingId)?.publicNumber ?? null;
    return {
      atlasNumber: publicNumber,
      entryKind: finding.entryKind,
      label: labelsWith(state, [finding.findingId]).get(finding.findingId) ?? null,
      labelAfter: null,
      version: latest.versionNumber,
      topic: topic === undefined ? null : { key: topic.canonicalKey, label: topic.label, isNew: false },
      wording: latest.content.wording,
      researchCheckedOn: latest.researchCheckedOn,
      links: state.links
        .filter((link) => link.fromFindingId === finding.findingId || link.toFindingId === finding.findingId)
        .map((link) => ({
          relation: link.relation,
          direction: link.fromFindingId === finding.findingId ? "from" as const : "to" as const,
          other: numberOf(link.fromFindingId === finding.findingId ? link.toFindingId : link.fromFindingId),
          disagreement: (link.disagreement as AtlasDisagreement | null) ?? null,
          withdrawn: link.withdrawn,
        })),
      intent: decided ?? null,
      intents: views,
    };
  }

  // accept_finding, and edit_finding before acceptance ----------------------------------------------------------------

  private async decideItem(
    request: AtlasReviewRequest,
    providers: AtlasProviderConfig,
    mode: "accept" | "edit",
  ): Promise<AtlasReviewResult> {
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded.failed;
    if (request.cardSha256 !== loaded.cardSha256) return cardChanged(id, loaded.cardSha256);
    const ref = itemRefOf(request)!;
    const item = cardItem(loaded.card, id, ref);
    if (item === undefined) return itemNotFound(id, ref);
    const existing = decisionFor(loaded.decisions, ref);
    if (existing !== undefined && existing.intent?.status !== "FAILED") {
      if (existing.decision === "rejected" || mode === "edit") {
        return errorOf("decision_conflict", `${item.name} is already decided: ` +
          `${decisionWords(existing.decision, existing.publicNumber)}, ${decisionDate(existing.decidedAt)}.` +
          (existing.decision === "rejected" ? " A decision on a card item is final." : ` To change its wording, use ` +
            `edit_finding with atlasNumber ${existing.publicNumber} and its version once it is stored.`));
      }
      return this.decisionReplay(item, existing);
    }

    // The texts, as the card holds them or as the owner edits them before acceptance.
    const edits: Partial<AtlasReviewRequest> = mode === "edit" ? request : {};
    const accepted = acceptedTexts(item, edits);
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    let kept = item.sources;
    if (request.sources !== undefined) {
      const own = new Map(item.sources.map((source) => [sourceKey(source), source]));
      kept = [];
      for (const source of request.sources) {
        const matched = own.get(sourceKey(source));
        if (matched === undefined) {
          problems.push({ code: "source_not_on_finding", message: `${source} is not one of ${item.name}'s own sources: ` +
            "keep only some of its own identifiers." });
        } else if (!kept.includes(matched)) {
          kept.push(matched);
        }
      }
    }
    if (item.leadOrigin === "open_lead") {
      for (const field of ["whyNotUsual", "whatWouldChangeIt", "sources"] as const) {
        if (edits[field] !== undefined) {
          problems.push({ code: "open_lead_fields", message: `An open lead holds only its wording and whom it applies ` +
            `to: leave ${field} out.` });
        }
      }
      if ((request.numbers ?? []).length > 0) {
        problems.push({ code: "open_lead_fields", message: "An open lead has no numbers: send numbers as an empty list." });
      }
    }
    const community = item.finding === null ? undefined : communityState({ ...item.finding, sources: kept });
    if (community?.refused === true) problems.push(communityOnlyProblem(item.name));
    const sourceChecks = item.leadOrigin === "open_lead" || kept.length === 0
      ? undefined
      : await this.checkSources(kept, providers);
    const [state, intents] = await Promise.all([
      this.deps.reader.readAtlasState({
        wordingKeys: [item.cardWordingKey],
        identifiers: sourceChecks === undefined ? [] : checkedIdentifiers(sourceChecks),
        topicKeys: request.topicKey === undefined ? [] : [request.topicKey],
      }),
      this.deps.store.inspectIntents(null),
    ]);
    // A finding with the same question and claim that waits for the writer makes this item its re-check.
    const waitingFor = intents.find((intent) => intent.status === "PENDING" && intent.payload.kind === "accept" &&
      (intent.payload.wordingKeys.card === item.cardWordingKey ||
        intent.payload.wordingKeys.accepted === item.cardWordingKey));
    if (item.ref.itemKind === "finding" && waitingFor !== undefined) {
      return tryAgainLater("writer_pending", `${waitingFor.publicNumber}, with the same question and claim, waits for ` +
        `the Atlas writer; once it is stored (about 5 minutes), ${item.name} is its re-check. Nothing was recorded.`);
    }
    const recheckOf = item.ref.itemKind === "finding" ? recheckTarget(state, item.cardWordingKey) : undefined;
    if (recheckOf !== undefined && mode === "edit") {
      return errorOf("decision_conflict", `${item.name} has the question and claim of ${recheckOf}, so it is a ` +
        `re-check of it: accept it with accept_finding, or change ${recheckOf} itself with edit_finding and its ` +
        "atlasNumber.");
    }
    const plan = sourceChecks === undefined ? emptySourcePlan() : planSources(sourceChecks, state, request.confirm === true);
    problems.push(...plan.problems);
    const madeWith = madeWithOf(item.record.stamp);
    if (madeWith.protocols.length === 0) problems.push(stampProblem());

    // What is filed: a re-check of a stored finding, or a new finding or lead under the declared topic.
    let topic: AtlasChecks["topic"] = null;
    let topicLabel: string | null = null;
    if (recheckOf === undefined) {
      const stored = state.topics.find(({ canonicalKey }) => canonicalKey === request.topicKey);
      const queued = intents.find((intent) => intent.status === "PENDING" && intent.payload.kind === "accept" &&
        intent.payload.topic.key === request.topicKey && intent.payload.topic.label !== null);
      const queuedLabel = queued?.payload.kind === "accept" ? queued.payload.topic.label : null;
      if (stored !== undefined) {
        topic = { key: stored.canonicalKey, label: stored.label, isNew: false };
      } else if (queuedLabel !== null && queuedLabel !== undefined) {
        topicLabel = queuedLabel;
        topic = { key: request.topicKey!, label: queuedLabel, isNew: false };
      } else if (request.topicLabel !== undefined) {
        topicLabel = request.topicLabel;
        topic = { key: request.topicKey!, label: request.topicLabel, isNew: true };
      } else {
        problems.push({ code: "topic_label_missing", message: `${request.topicKey} is not an Atlas topic yet: give ` +
          "topicLabel to create it, or the key of an existing topic." });
      }
    }
    const numbers = recheckOf === undefined ? request.numbers ?? [] : [];
    const numberProblems = recheckOf === undefined ? atlasNumbersProblems(numbers, accepted.wording) : [];
    const keptSet = new Set(kept);
    const editedAtAcceptance = mode === "edit" && (accepted.question !== item.question || accepted.wording !== item.text ||
      accepted.appliesTo !== item.appliesTo || accepted.whyNotUsual !== (item.finding?.why_not_usual ?? null) ||
      accepted.whatWouldChangeIt !== (item.finding?.what_would_change_it ?? null) ||
      item.sources.some((source) => !keptSet.has(source)));
    const payload: unknown = recheckOf !== undefined
      ? {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "recheck",
          publicNumber: recheckOf,
          cardWordingKey: item.cardWordingKey,
          verifiedBases: item.bases,
          sources: plan.sources,
          researchCheckedOn: researchDayOf(item.record.stamp),
          madeWith,
        }
      : {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "accept",
          entryKind: item.entryKind,
          leadOrigin: item.leadOrigin,
          editedAtAcceptance,
          topic: { key: request.topicKey!, label: topicLabel },
          question: accepted.question,
          content: contentOf(item, accepted, numbers),
          sources: plan.sources,
          wordingKeys: { card: item.cardWordingKey, accepted: atlasWordingKey(accepted.question, accepted.wording) },
          researchCheckedOn: researchDayOf(item.record.stamp),
          madeWith,
        };
    const privacy = screenTexts(intentTexts(payload));
    const decision: AtlasCardDecision = recheckOf !== undefined
      ? "rechecked"
      : item.entryKind === "finding" ? "accepted" : "accepted_as_lead";
    const checksNow = () => checksOf({
      item: item.name,
      wouldBecome: wouldBecome(item, recheckOf, community),
      focus: item,
      recheckOf,
      community,
      plan,
      sourceChecks,
      privacy,
      numberProblems,
      problems,
      topic,
      relatedTopics: state.topics,
    });
    if (problems.length > 0 || numberProblems.length > 0 || privacy.length > 0 || plan.status === "refused") {
      return checksNotPassed(item.name, checksNow());
    }
    if (plan.status === "try_again_later") {
      return {
        ...tryAgainLater("provider_unavailable", `A source of ${item.name} could not be checked just now ` +
          `(${unavailableSources(plan)}). Try again in a few minutes; nothing was recorded.`),
        checks: checksNow(),
      };
    }
    const confirmations = [...(community?.needsConfirmation === true ? [communityConfirmation()] : []),
      ...plan.confirmations];
    if (confirmations.length > 0 && request.confirm !== true) {
      return {
        ok: false,
        outcome: "needs_confirmation",
        checks: checksNow(),
        text: `Not recorded yet: ${item.name} needs the owner's confirmation: ${confirmations.join("; ")}. If the owner ` +
          "says to accept it anyway, send the same call with confirm: true.",
      };
    }
    // Last, the intent as the review store keeps it: it holds only what an intent may.
    const prepared = prepareOrProblems(payload, problems);
    const checks = checksNow();
    if (prepared === undefined) return checksNotPassed(item.name, checks);

    const stored = await this.deps.store.decide({
      cardNumber,
      itemKind: ref.itemKind,
      itemNumber: ref.itemNumber,
      decision,
      cardSha256: loaded.cardSha256,
      ownerReason: request.reason ?? null,
      decidedAt: this.now().toISOString(),
      intent: { intentId: this.newIntentId(), payload: prepared.payload, payloadSha256: prepared.payloadSha256 },
      recheckedPublicNumber: recheckOf ?? null,
    });
    const sync = await this.syncCard(loaded, stored);
    const publicNumber = stored.publicNumber!;
    const status: AtlasStatus = {
      atlasNumber: publicNumber,
      entryKind: recheckOf === undefined ? item.entryKind : null,
      label: null,
      labelAfter: recheckOf === undefined
        ? item.entryKind === "finding" ? "checked" : "lead"
        : null,
      version: null,
      topic,
      wording: recheckOf === undefined ? accepted.wording : null,
      researchCheckedOn: researchDayOf(item.record.stamp),
      links: [],
      intent: stored.intentId === null || stored.intent === null ? null : {
        intentId: stored.intentId,
        kind: stored.intent.intentKind,
        atlasNumber: publicNumber,
        status: stored.intent.status,
        createdAt: stored.intent.createdAt,
        failureCode: stored.intent.failureCode,
        explanation: stored.intent.failureCode === null ? null : ATLAS_FAILURE_EXPLANATIONS[stored.intent.failureCode],
      },
      intents: [],
    };
    const confirmed = request.confirm === true && confirmations.length > 0
      ? ` Confirmed by the owner: ${confirmations.join("; ")}.`
      : "";
    const retried = existing !== undefined ? " (a retry under the same number, after the writer refused the first)" : "";
    const text = recheckOf !== undefined
      ? `Recorded ${item.name} as a re-check of ${publicNumber}${retried}, with the research of ` +
        `${researchDayOf(item.record.stamp)}${item.bases.length > 0 ? `, which brings a verified basis (${item.bases.join(", ")})` : ""}. ` +
        `The Atlas writer stores it within about 5 minutes.`
      : item.entryKind === "finding"
        ? `Accepted ${item.name} as ${publicNumber}${retried}, a checked finding${editedAtAcceptance ? " with your wording" : ""}, ` +
          `filed under ${topic!.label}${topic!.isNew ? " (new topic)" : ""}. ${WRITER_SENTENCE}`
        : `Accepted ${item.name} as a lead, ${publicNumber}${retried}: ${item.leadOrigin === "open_lead"
          ? "an open lead of the card" : "it has no verified basis"}${editedAtAcceptance ? ", with your wording" : ""}. ` +
          `Filed under ${topic!.label}${topic!.isNew ? " (new topic)" : ""}. ${WRITER_SENTENCE}`;
    return {
      ok: true,
      outcome: outcomeOf(stored.intent?.status ?? "PENDING"),
      atlas: status,
      checks,
      text: `${text}${confirmed}${syncSentence(sync)}`,
    };
  }

  /** The same decision again: what the card item already became, with nothing new recorded. */
  private async decisionReplay(item: CardItem, existing: AtlasDecisionView): Promise<AtlasReviewResult> {
    const status = await this.statusOf(existing.publicNumber!, existing);
    return {
      ok: true,
      outcome: outcomeOf(existing.intent?.status ?? "PENDING"),
      ...(status === undefined ? {} : { atlas: status }),
      text: `${item.name} was already ${decisionWords(existing.decision, existing.publicNumber)}, on ` +
        `${decisionDate(existing.decidedAt)}; nothing new was recorded.${status === undefined ? "" : ` ${statusSentence(status)}`}`,
    };
  }

  // edit_finding after acceptance ---------------------------------------------------------------------------------------

  private async editAccepted(request: AtlasReviewRequest, providers: AtlasProviderConfig): Promise<AtlasReviewResult> {
    if (request.eraseWording === true) return eraseNotBuilt();
    const resolved = await this.resolveAccepted(request);
    if (isFailure(resolved)) return resolved.failed;
    const context = await this.findingContext(resolved, [resolved]);
    if (isFailure(context)) return context.failed;
    const { finding, state, intents } = context;
    const latest = finding.versions.at(-1)!;
    if (latest.status === "invalidated") return withdrawnConflict(resolved);
    if (request.version !== latest.versionNumber) return versionStale(resolved, latest.versionNumber);
    const accept = intents.find((intent) => intent.intentKind === "accept" && intent.publicNumber === resolved &&
      intent.status === "COMPLETED");
    if (accept === undefined || accept.payload.kind !== "accept") {
      return errorOf("review_service_unavailable", `The accepted intent of ${resolved} could not be read; nothing was ` +
        "recorded.");
    }
    const question = accept.payload.question;
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    const openLead = finding.leadOrigin === "open_lead";
    if (openLead) {
      for (const field of ["whyNotUsual", "whatWouldChangeIt", "sources"] as const) {
        if (request[field] !== undefined) {
          problems.push({ code: "open_lead_fields", message: `An open lead holds only its wording and whom it applies ` +
            `to: leave ${field} out.` });
        }
      }
    }
    // The sources: the families its latest version binds, or the ones the owner keeps of them.
    const bound = [...new Map(latest.bindings.map((binding) => [binding.familyId, binding])).values()]
      .sort((left, right) => left.locator.localeCompare(right.locator));
    const families = bound.map(({ familyId }) => state.sourceFamilies.find((family) => family.familyId === familyId))
      .filter((family): family is AtlasState["sourceFamilies"][number] => family !== undefined);
    let keptFamilies = families;
    if (request.sources !== undefined && !openLead) {
      keptFamilies = [];
      for (const source of request.sources) {
        const parsed = parseAtlasSource(source);
        const family = parsed === undefined ? undefined : families.find(({ identifiers }) =>
          identifiers.some(({ scheme, value }) => scheme === parsed.kind && value === parsed.id));
        if (family === undefined) {
          problems.push({ code: "source_not_on_finding", message: `${source} is not one of ${resolved}'s sources: keep ` +
            "only some of the identifiers its latest version binds." });
        } else if (!keptFamilies.includes(family)) {
          keptFamilies.push(family);
        }
      }
    }
    const checkStrings = keptFamilies.map(checkStringOf);
    const sourceChecks = checkStrings.length === 0 || checkStrings.some((value) => value === undefined)
      ? undefined
      : await this.checkSources(checkStrings as string[], providers);
    if (checkStrings.some((value) => value === undefined)) {
      problems.push({ code: "source_conflict", message: `A source of ${resolved} has no DOI, PMID, PMCID or NCT ` +
        "number to check again." });
    }
    const plan = sourceChecks === undefined
      ? emptySourcePlan()
      : planFamilySources(sourceChecks, keptFamilies, request.confirm === true);
    problems.push(...plan.problems);
    const content: AtlasVersionContent = {
      ...latest.content,
      wording: request.wording ?? latest.content.wording,
      appliesTo: request.appliesTo ?? latest.content.appliesTo,
      whyNotUsual: request.whyNotUsual ?? latest.content.whyNotUsual,
      whatWouldChangeIt: request.whatWouldChangeIt ?? latest.content.whatWouldChangeIt,
      numbers: request.numbers ?? latest.content.numbers,
    };
    const unchanged = stableJson(content) === stableJson(latest.content) &&
      keptFamilies.length === families.length;
    if (unchanged) {
      problems.push({ code: "nothing_changed", message: `The edit leaves ${resolved}'s version ${latest.versionNumber} ` +
        "as it is: send a new text, sources or numbers." });
    }
    const numberProblems = atlasNumbersProblems(content.numbers, content.wording);
    const payload = {
      schema: ATLAS_INTENT_SCHEMA,
      kind: "revise",
      publicNumber: resolved,
      version: latest.versionNumber,
      changeKind: request.correction === false ? "edited" : "corrected",
      note: request.note ?? null,
      content,
      sources: plan.sources,
      acceptedWordingKey: atlasWordingKey(question, content.wording),
      researchCheckedOn: latest.researchCheckedOn,
      madeWith: latest.madeWith,
    };
    const privacy = screenTexts(intentTexts(payload));
    const checksNow = () => checksOf({
      item: resolved, wouldBecome: null, recheckOf: undefined, plan, sourceChecks, privacy, numberProblems, problems,
      relatedTopics: [],
    });
    if (problems.length > 0 || numberProblems.length > 0 || privacy.length > 0 || plan.status === "refused") {
      return checksNotPassed(resolved, checksNow());
    }
    if (plan.status === "try_again_later") {
      return {
        ...tryAgainLater("provider_unavailable", `A source of ${resolved} could not be checked just now ` +
          `(${unavailableSources(plan)}). Try again in a few minutes; nothing was recorded.`),
        checks: checksNow(),
      };
    }
    if (plan.confirmations.length > 0 && request.confirm !== true) {
      return this.pendingGuard(intents, undefined, resolved) ?? {
        ok: false,
        outcome: "needs_confirmation",
        checks: checksNow(),
        text: `Not recorded yet: the new version of ${resolved} needs the owner's confirmation: ` +
          `${plan.confirmations.join("; ")}. If the owner says to go ahead, send the same call with confirm: true.`,
      };
    }
    // Last, the intent as the review store keeps it: it holds only what an intent may.
    const prepared = prepareOrProblems(payload, problems);
    const checks = checksNow();
    if (prepared === undefined) return checksNotPassed(resolved, checks);
    const pending = this.pendingGuard(intents, prepared, resolved);
    if (pending !== undefined) return pending;
    const recorded = await this.recordIntent("revise", resolved, prepared, request.reason, intents);
    const kind = request.correction === false ? "wording fix" : "correction";
    return {
      ok: true,
      outcome: outcomeOf(recorded.status),
      checks,
      atlas: {
        ...(await this.statusOf(resolved))!,
        labelAfter: labelsWith(state, [finding.findingId], { bases: { [finding.findingId]: content.verifiedBases } })
          .get(finding.findingId) ?? null,
        intent: intentView(recorded),
      },
      text: `Queued a ${kind} of ${resolved}: version ${latest.versionNumber + 1}` +
        `${request.note === undefined ? "" : ", with your note, which the Atlas dates"}. The Atlas writer stores it ` +
        "within about 5 minutes.",
    };
  }

  // reject_finding ------------------------------------------------------------------------------------------------------

  private async reject(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded.failed;
    if (request.cardSha256 !== undefined && request.cardSha256 !== loaded.cardSha256) {
      return cardChanged(id, loaded.cardSha256);
    }
    const ref = itemRefOf(request)!;
    const item = cardItem(loaded.card, id, ref);
    if (item === undefined) return itemNotFound(id, ref);
    const existing = decisionFor(loaded.decisions, ref);
    if (existing?.decision === "rejected") {
      return {
        ok: true,
        outcome: "finding_rejected",
        text: `${item.name} was already rejected on ${decisionDate(existing.decidedAt)}; nothing new was recorded.`,
      };
    }
    if (existing !== undefined) {
      return errorOf("decision_conflict", `${item.name} is already decided: ` +
        `${decisionWords(existing.decision, existing.publicNumber)}, ${decisionDate(existing.decidedAt)}. A decision on ` +
        `a card item is final; ${existing.publicNumber} can be withdrawn with withdraw_finding.`);
    }
    const stored = await this.deps.store.decide({
      cardNumber,
      itemKind: ref.itemKind,
      itemNumber: ref.itemNumber,
      decision: "rejected",
      cardSha256: loaded.cardSha256,
      ownerReason: request.reason!,
      decidedAt: this.now().toISOString(),
      intent: null,
      recheckedPublicNumber: null,
    });
    const sync = await this.syncCard(loaded, stored);
    return {
      ok: true,
      outcome: "finding_rejected",
      text: `Rejected ${item.name}; nothing from it is written to the Atlas, and your reason stays private, on the ` +
        `decision.${syncSentence(sync)}`,
    };
  }

  // withdraw_finding ----------------------------------------------------------------------------------------------------

  private async withdraw(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    if (request.eraseWording === true) return eraseNotBuilt();
    const resolved = await this.resolveAccepted(request);
    if (isFailure(resolved)) return resolved.failed;
    const context = await this.findingContext(resolved, [resolved]);
    if (isFailure(context)) return context.failed;
    const { finding, state, intents } = context;
    const latest = finding.versions.at(-1)!;
    if (latest.status === "invalidated") return withdrawnConflict(resolved);
    if (request.version !== latest.versionNumber) return versionStale(resolved, latest.versionNumber);
    const payload = {
      schema: ATLAS_INTENT_SCHEMA,
      kind: "withdraw",
      publicNumber: resolved,
      version: latest.versionNumber,
      note: request.note!,
      decidedWith: await this.decidedWith(),
    };
    const privacy = screenTexts(intentTexts(payload));
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    const prepared = privacy.length > 0 ? undefined : prepareOrProblems(payload, problems);
    const checks = checksOf({ item: resolved, wouldBecome: null, recheckOf: undefined, privacy, problems, relatedTopics: [] });
    if (prepared === undefined) return checksNotPassed(resolved, checks);
    const pending = this.pendingGuard(intents, prepared, resolved);
    if (pending !== undefined) return pending;
    const recorded = await this.recordIntent("withdraw", resolved, prepared, request.reason, intents);
    const after = labelsWith(state, partnersOf(state, finding.findingId), { invalidate: finding.findingId });
    const released = partnersOf(state, finding.findingId)
      .filter((id) => id !== finding.findingId && labelsWith(state, [id]).get(id) === "contested" && after.get(id) !== "contested")
      .map((id) => `${numberIn(state, id)} returns to ${after.get(id)}`);
    return {
      ok: true,
      outcome: outcomeOf(recorded.status),
      atlas: { ...(await this.statusOf(resolved))!, labelAfter: "withdrawn", intent: intentView(recorded) },
      text: `Queued the withdrawal of ${resolved}: version ${latest.versionNumber + 1} marks it withdrawn, with your ` +
        `note, which the Atlas dates.${released.length === 0 ? "" : ` Then ${released.join(", ")}.`} The Atlas writer ` +
        "stores it within about 5 minutes.",
    };
  }

  // link_findings -------------------------------------------------------------------------------------------------------

  private async link(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const from = normalizedNumber(request.atlasNumber!);
    const to = normalizedNumber(request.to!);
    const relation = request.relation!;
    const [intents, state] = await Promise.all([
      this.deps.store.inspectIntents([from, to]),
      this.deps.reader.readAtlasState({ publicNumbers: [from, to], replacesGraph: relation === "replaces" }),
    ]);
    for (const number of [from, to]) {
      const waiting = intents.find((intent) => intent.intentKind === "accept" && intent.publicNumber === number &&
        intent.status === "PENDING");
      if (waiting !== undefined && !state.findings.some(({ publicNumber }) => publicNumber === number)) {
        return tryAgainLater("writer_pending", `${number} waits for the Atlas writer (about 5 minutes); link it once ` +
          "it is stored. Nothing was recorded.");
      }
    }
    const linkProblems = atlasLinkProblems({
      from, relation, to, ...(request.disagreement === undefined ? {} : { disagreement: request.disagreement }),
    }, linkStateOf(state));
    let payload: Record<string, unknown> | undefined;
    if (linkProblems.length === 0) {
      if (relation === "unlink") {
        const standing = standingLink(state, from, to)!;
        payload = {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "unlink",
          publicNumber: numberIn(state, standing.fromFindingId),
          relation: standing.relation,
          toPublicNumber: numberIn(state, standing.toFindingId),
          note: request.note ?? request.rationale!,
          decidedWith: await this.decidedWith(),
        };
      } else {
        payload = {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "link",
          publicNumber: from,
          relation,
          toPublicNumber: to,
          disagreement: request.disagreement ?? null,
          rationale: request.rationale!,
          decidedWith: await this.decidedWith(),
        };
      }
    }
    const privacy = screenTexts(payload === undefined
      ? { rationale: request.rationale, note: request.note }
      : intentTexts(payload));
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    const prepared = payload === undefined || privacy.length > 0 ? undefined : prepareOrProblems(payload, problems);
    const checks = checksOf({
      item: `${from} ${relation} ${to}`, wouldBecome: null, recheckOf: undefined, privacy, problems, linkProblems,
      relatedTopics: [],
    });
    if (prepared === undefined) return checksNotPassed(`${from} ${relation} ${to}`, checks);
    const subject = prepared.payload.kind === "link" || prepared.payload.kind === "unlink"
      ? prepared.payload.publicNumber
      : from;
    const pending = this.pendingGuard(intents, prepared, subject, [from, to]);
    if (pending !== undefined) return pending;
    const kind = prepared.payload.kind as "link" | "unlink";
    const recorded = await this.recordIntent(kind, subject, prepared, request.reason, intents);
    const fromFinding = state.findings.find(({ publicNumber }) => publicNumber === from)!;
    const toFinding = state.findings.find(({ publicNumber }) => publicNumber === to)!;
    const standing = relation === "unlink" ? standingLink(state, from, to) : undefined;
    const after = labelsWith(state, [fromFinding.findingId, toFinding.findingId], relation === "unlink"
      ? { withdrawLink: standing!.linkId }
      : { addLink: { fromFindingId: fromFinding.findingId, toFindingId: toFinding.findingId, relation } });
    const [fromLabel, toLabel] = [after.get(fromFinding.findingId), after.get(toFinding.findingId)];
    const labels = fromLabel === undefined || toLabel === undefined
      ? "it stands"
      : fromLabel === toLabel
        ? `${from} and ${to} both read as ${fromLabel}`
        : `${from} reads as ${fromLabel} and ${to} as ${toLabel}`;
    const described = relation === "unlink"
      ? `the withdrawal of the link ${numberIn(state, standing!.fromFindingId)} ${standing!.relation} ` +
        `${numberIn(state, standing!.toFindingId)}`
      : `the link ${from} ${relation} ${to}${request.disagreement === undefined ? "" : ` (they disagree on ` +
        `${request.disagreement.replace(/_/gu, " ")})`}`;
    return {
      ok: true,
      outcome: outcomeOf(recorded.status),
      checks,
      atlas: {
        ...(await this.statusOf(from))!,
        labelAfter: after.get(fromFinding.findingId) ?? null,
        intent: intentView(recorded),
      },
      text: `Queued ${described}. Once the Atlas writer stores it, within about 5 minutes, ${labels}.`,
    };
  }

  // Shared steps --------------------------------------------------------------------------------------------------------

  /** Reads a card, its decisions and its hash, and brings GitHub up to date with the decisions. */
  private async loadCard(cardNumber: number): Promise<LoadedCard | Failure> {
    const id = publicFindingsCardId(cardNumber);
    const lookup = await this.deps.inbox.readCard(cardNumber);
    if (lookup.status === "not_found") {
      return failed(errorOf("card_not_found", `${id} is not a findings card in the library.`));
    }
    if (lookup.status === "unreadable") {
      return failed(errorOf("card_not_found", `${id}'s stored record, or a later save's, does not read as the library ` +
        "saved it (it may have been edited in GitHub), so it cannot be reviewed."));
    }
    const card = lookup.card;
    const decisions = await this.deps.store.inspectCards([cardNumber]);
    const sync = await reconcileFindingsCard(this.deps.inbox, { ...card, findings: card.record.card.findings.length },
      decisions);
    const reconciled: FindingsCardRead = sync.synced
      ? {
          ...card,
          decisions: decisions.map(markerOf),
          ...(sync.reviewed ? { state: "closed" as const, labels: reviewedLabels(card.labels) } : {}),
        }
      : card;
    return {
      card: reconciled,
      decisions,
      cardSha256: findingsCardSha256(cardNumber, card.record, card.occurrences),
      synced: sync.synced,
    };
  }

  /** Posts a new decision to the card, and labels and closes it once every finding has one. */
  private async syncCard(loaded: LoadedCard, decision: AtlasDecisionView) {
    const decisions = [...loaded.decisions.filter((stored) => stored.itemKind !== decision.itemKind ||
      stored.itemNumber !== decision.itemNumber), decision];
    return reconcileFindingsCard(this.deps.inbox, {
      ...loaded.card, findings: loaded.card.record.card.findings.length,
    }, decisions);
  }

  /** The F number an edit or withdrawal names: atlasNumber, or the number its card item's decision took. */
  private async resolveAccepted(request: AtlasReviewRequest): Promise<string | Failure> {
    if (request.atlasNumber !== undefined) return normalizedNumber(request.atlasNumber);
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const ref = itemRefOf(request)!;
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded;
    if (cardItem(loaded.card, id, ref) === undefined) return failed(itemNotFound(id, ref));
    const decision = decisionFor(loaded.decisions, ref);
    if (decision === undefined) {
      return failed(errorOf("item_not_found", `${itemName(id, ref)} has no decision yet: to accept it with the ` +
        "owner's wording, send edit_finding without version, with its cardSha256, topicKey and numbers."));
    }
    if (decision.publicNumber === null) {
      return failed(errorOf("decision_conflict", `${itemName(id, ref)} was rejected on ` +
        `${decisionDate(decision.decidedAt)}; it has no finding to change.`));
    }
    return decision.publicNumber;
  }

  /** A stored finding with its canonical state and its intents, or why there is none to change yet. */
  private async findingContext(publicNumber: string, numbers: string[]): Promise<{
    finding: AtlasStateFinding;
    state: AtlasState;
    intents: AtlasIntentView[];
  } | Failure> {
    const [intents, state] = await Promise.all([
      this.deps.store.inspectIntents(numbers),
      this.deps.reader.readAtlasState({ publicNumbers: numbers }),
    ]);
    const finding = state.findings.find((candidate) => candidate.publicNumber === publicNumber);
    if (finding !== undefined) return { finding, state, intents };
    const accept = [...intents].reverse().find((intent) => intent.intentKind === "accept" &&
      intent.publicNumber === publicNumber);
    if (accept?.status === "PENDING") {
      return failed(tryAgainLater("writer_pending", `${publicNumber} waits for the Atlas writer (about 5 minutes); ` +
        "change it once it is stored. Nothing was recorded."));
    }
    return failed(errorOf("finding_not_found", accept?.status === "FAILED"
      ? `${publicNumber} was never stored: the Atlas writer refused its accept with ${accept.failureCode} ` +
        `(${ATLAS_FAILURE_EXPLANATIONS[accept.failureCode!]}). Accept its card item again to retry under the same number.`
      : `No finding has the number ${publicNumber}.`));
  }

  /**
   * A change waits for the writer on these findings: the same intent again is that one (nothing new is recorded);
   * any other waits until it is stored, since it may change the version or the links the new one depends on.
   */
  private pendingGuard(
    intents: readonly AtlasIntentView[],
    prepared: PreparedAtlasFindingIntent | undefined,
    subject: string,
    numbers: readonly string[] = [subject],
  ): AtlasReviewResult | undefined {
    const pending = intents.filter((intent) => intent.status === "PENDING" && (numbers.includes(intent.publicNumber) ||
      ("toPublicNumber" in intent.payload && numbers.includes(intent.payload.toPublicNumber))));
    if (pending.length === 0) return undefined;
    const same = prepared === undefined ? undefined : pending.find((intent) =>
      intent.intentKind === prepared.payload.kind && intent.publicNumber === subject &&
      intent.payloadSha256 === prepared.payloadSha256);
    if (same !== undefined) {
      return {
        ok: true,
        outcome: "finding_queued",
        text: `This ${same.intentKind} of ${subject} already waits for the Atlas writer; nothing new was recorded.`,
      };
    }
    return tryAgainLater("writer_pending", `${pending.map((intent) => `${intent.publicNumber}'s ${intent.intentKind}`)
      .join(", ")} ${pending.length === 1 ? "waits" : "wait"} for the Atlas writer (about 5 minutes), and this change ` +
      "depends on what it stores. Inspect the finding again once it is stored. Nothing was recorded.");
  }

  /** Records an intent on an accepted finding, as the retry of the same kind's last refused intent if there is one. */
  private async recordIntent(
    kind: "revise" | "withdraw" | "link" | "unlink",
    publicNumber: string,
    prepared: PreparedAtlasFindingIntent,
    reason: string | undefined,
    intents: readonly AtlasIntentView[],
  ): Promise<AtlasIntentView> {
    const retried = new Set(intents.map(({ retryOfIntentId }) => retryOfIntentId).filter((id) => id !== null));
    const retryOf = [...intents].reverse().find((intent) => intent.intentKind === kind &&
      intent.publicNumber === publicNumber && intent.status === "FAILED" && !retried.has(intent.intentId));
    return this.deps.store.recordIntent({
      intentId: this.newIntentId(),
      intentKind: kind,
      publicNumber,
      payload: prepared.payload,
      payloadSha256: prepared.payloadSha256,
      ownerReason: reason ?? null,
      createdAt: this.now().toISOString(),
      retryOfIntentId: retryOf?.intentId ?? null,
    });
  }

  private async decidedWith() {
    return {
      askrigorVersion: safeVersion(this.deps.version),
      build: safeBuild(this.deps.build),
      protocols: (await this.deps.protocols()).slice(0, 4).map(({ name, version, sha256 }) => ({ name, version, sha256 })),
    };
  }

  private checkSources(sources: readonly string[], providers: AtlasProviderConfig): Promise<AtlasSourceChecks> {
    return checkAtlasSources(sources, {
      crossref: providers.crossref,
      pubmed: providers.pubmed,
      now: this.now,
      ...(this.deps.sourceCheckCache === undefined ? {} : { cache: this.deps.sourceCheckCache }),
    });
  }
}

// Card items ------------------------------------------------------------------------------------------------------------

function itemRefOf(request: AtlasReviewRequest): ItemRef | undefined {
  if (request.finding !== undefined) return { itemKind: "finding", itemNumber: request.finding };
  if (request.lead !== undefined) return { itemKind: "open_lead", itemNumber: request.lead };
  return undefined;
}

function itemName(cardId: string, ref: ItemRef): string {
  return `${cardId} ${ref.itemKind === "finding" ? "finding" : "open lead"} ${ref.itemNumber}`;
}

/** A card item as the save that counts holds it; undefined when the card has no such item. */
function cardItem(
  card: Pick<FindingsCardRead, "record" | "occurrences">,
  cardId: string,
  ref: ItemRef,
): CardItem | undefined {
  const name = itemName(cardId, ref);
  if (ref.itemKind === "open_lead") {
    const lead = card.record.card.open_leads[ref.itemNumber - 1];
    if (lead === undefined) return undefined;
    return {
      ref, name, text: lead, question: card.record.card.question, certainty: null, appliesTo: null, sources: [],
      youtubeVideos: 0, save: "card", record: card.record, finding: null, bases: [], entryKind: "lead",
      leadOrigin: "open_lead", cardWordingKey: atlasWordingKey(card.record.card.question, lead),
    };
  }
  const save = atlasBasesOf(card.record, card.occurrences, ref.itemNumber);
  if (save === undefined) return undefined;
  return {
    ref,
    name,
    text: save.finding.claim,
    question: save.record.card.question,
    certainty: save.finding.certainty,
    appliesTo: save.finding.applies_to,
    sources: [...save.finding.sources],
    youtubeVideos: save.finding.youtube_videos ?? 0,
    save: save.from,
    record: save.record,
    finding: save.finding,
    bases: save.bases,
    entryKind: save.entryKind,
    leadOrigin: save.entryKind === "finding" ? null : "unverified_finding",
    cardWordingKey: atlasWordingKey(save.record.card.question, save.finding.claim),
  };
}

function decisionFor(decisions: readonly AtlasDecisionView[], ref: ItemRef): AtlasDecisionView | undefined {
  return decisions.find(({ itemKind, itemNumber }) => itemKind === ref.itemKind && itemNumber === ref.itemNumber);
}

type WouldBecome = z.infer<typeof wouldBecomeSchema>;

function wouldBecome(item: CardItem, recheckOf: string | undefined, community?: AtlasCommunityCheck): WouldBecome {
  if (item.finding !== null && (community ?? communityState(item.finding)).refused) return "community_only";
  if (recheckOf !== undefined) return "recheck";
  return item.entryKind === "finding" ? "checked" : "lead";
}

function wouldBecomeWords(value: WouldBecome, recheckOf: string | null | undefined): string {
  switch (value) {
    case "checked": return "a checked finding";
    case "lead": return "a lead only";
    case "recheck": return `a re-check of ${recheckOf}`;
    case "community_only": return "held: community evidence only (4a)";
  }
}

function decisionWords(decision: AtlasCardDecision, publicNumber: string | null): string {
  switch (decision) {
    case "accepted": return `accepted as ${publicNumber}, a checked finding`;
    case "accepted_as_lead": return `accepted as a lead, ${publicNumber}`;
    case "rechecked": return `recorded as a re-check of ${publicNumber}`;
    case "rejected": return "rejected";
  }
}

/** The texts an accept would store: the card's, or the owner's where the owner edited them. */
function acceptedTexts(item: CardItem, edits: Partial<Pick<AtlasReviewRequest, typeof EDIT_TEXTS[number] | "question">>) {
  return {
    question: edits.question ?? item.question,
    wording: edits.wording ?? item.text,
    appliesTo: edits.appliesTo ?? item.appliesTo,
    whyNotUsual: edits.whyNotUsual ?? item.finding?.why_not_usual ?? null,
    whatWouldChangeIt: edits.whatWouldChangeIt ?? item.finding?.what_would_change_it ?? null,
  };
}

/** The version content an accept stores: an open lead holds only its wording and whom it applies to. */
function contentOf(item: CardItem, texts: ReturnType<typeof acceptedTexts>, numbers: AtlasNumberEntry[]): AtlasVersionContent {
  const declared = item.record.card.public_value;
  const open = item.leadOrigin === "open_lead";
  return {
    wording: texts.wording,
    appliesTo: texts.appliesTo,
    certainty: open ? null : item.certainty,
    usualAnswer: open ? null : item.record.card.usual_answer,
    whyNotUsual: open ? null : texts.whyNotUsual,
    whatWouldChangeIt: open ? null : texts.whatWouldChangeIt,
    whoElse: open || declared?.scope !== "public" ? null : declared.who_else ?? null,
    whatItChanges: open || declared?.scope !== "public" ? null : declared.what_it_changes ?? null,
    // community_checked is never stored (4a).
    tags: open || item.finding === null ? [] : ATLAS_FINDING_TAGS.filter((tag) => item.finding!.tags.includes(tag)),
    verifiedBases: item.entryKind === "finding" ? item.bases : [],
    numbers,
  };
}

/** Every text of an item as an accept would store it, for the dry run's privacy screen. */
function itemTexts(item: CardItem, texts: ReturnType<typeof acceptedTexts>, numbers: AtlasNumberEntry[]) {
  return contentTexts(contentOf(item, texts, numbers), { question: texts.question });
}

function contentTexts(content: AtlasVersionContent, extra: Record<string, string | null | undefined> = {}) {
  const texts: Record<string, string | undefined> = {};
  for (const [field, value] of Object.entries(extra)) texts[field] = value ?? undefined;
  texts.wording = content.wording;
  texts.appliesTo = content.appliesTo ?? undefined;
  texts.usualAnswer = content.usualAnswer ?? undefined;
  texts.whyNotUsual = content.whyNotUsual ?? undefined;
  texts.whatWouldChangeIt = content.whatWouldChangeIt ?? undefined;
  texts.whoElse = content.whoElse ?? undefined;
  texts.whatItChanges = content.whatItChanges ?? undefined;
  content.numbers.forEach((entry, index) => {
    texts[`numbers[${index}].outcome`] = entry.outcome;
    texts[`numbers[${index}].option`] = entry.option;
    texts[`numbers[${index}].comparator`] = entry.comparator;
    texts[`numbers[${index}].follow_up`] = entry.follow_up;
  });
  return texts;
}

/**
 * Every text an intent would store, by the field that holds it: the topic label, the question, the version's texts
 * and its numbers' outcome, option, comparator and follow-up, and the public notes and rationale. The source titles
 * are the providers' and are screened where they are read (storedTitle).
 */
function intentTexts(payload: unknown): Record<string, string | undefined> {
  const intent = payload as AtlasFindingIntent;
  switch (intent.kind) {
    case "accept":
      return contentTexts(intent.content, { topicLabel: intent.topic.label, question: intent.question });
    case "revise":
      return contentTexts(intent.content, { note: intent.note });
    case "withdraw":
    case "unlink":
      return { note: intent.note };
    case "link":
      return { rationale: intent.rationale };
    case "recheck":
    case "erase":
      return {};
  }
}

function screenTexts(texts: Readonly<Record<string, string | undefined>>): Array<{ field: string; reasonCode: string }> {
  return screenAtlasTexts(texts).map(({ field, reasonCode }) => ({ field, reasonCode }));
}

/** The intent as the review store keeps it, or why it cannot be one: each problem names its field. */
function prepareOrProblems(
  payload: unknown,
  problems: Array<{ code: CheckProblemCode; message: string }>,
): PreparedAtlasFindingIntent | undefined {
  try {
    return prepareAtlasFindingIntent(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues.slice(0, 10)) {
        problems.push({ code: "intent_invalid", message: `${issue.path.join(".") || "intent"}: ${issue.message}.` });
      }
      return undefined;
    }
    throw error;
  }
}

function communityOnlyProblem(name: string) {
  return {
    code: "community_only" as const,
    message: `${name} rests on community evidence alone (no DOI, PMID, PMCID or NCT source it keeps), which the ` +
      "Atlas does not hold until the community rule (owner decision 4a); it stays held.",
  };
}

function communityConfirmation(): string {
  return "the finding also rested on audited comments, which the Atlas does not store, so only its study sources are " +
    "kept (4a)";
}

function stampProblem() {
  return {
    code: "stamp_without_protocols" as const,
    message: "The save's version stamp names no protocol, so the Atlas cannot say which AskRigor made the research.",
  };
}

// Sources ---------------------------------------------------------------------------------------------------------------

function emptySourcePlan(): SourcePlan {
  return { status: "passed", views: [], sources: [], confirmations: [], problems: [] };
}

/** A source as one identifier, so two forms of one identifier match: the provider form, or the text itself. */
function sourceKey(source: string): string {
  const parsed = parseAtlasSource(source);
  return parsed === undefined ? `text:${source.trim()}` : `${parsed.kind}:${parsed.id}`;
}

/** The identifiers each checked source and its public record give, for the canonical lookup of their families. */
function checkedIdentifiers(checks: AtlasSourceChecks): Array<{ scheme: string; value: string }> {
  return checks.sources.flatMap((check) => check.outcome === "checked" ? recordIdentifiers(check) : []);
}

/** The identifiers a checked source has, in the intents' canonical forms: the one cited and those its record lists. */
function recordIdentifiers(check: AtlasSourceCheck & AtlasCheckedSource): AtlasSourceIdentifier[] {
  const candidates = [
    { scheme: check.kind, value: check.identifier },
    { scheme: "doi", value: check.record.doi?.toLowerCase() },
    { scheme: "pmid", value: check.record.pmid },
    { scheme: "pmcid", value: check.record.pmcid?.toUpperCase() },
    { scheme: "nct", value: check.record.nctId?.toUpperCase() },
  ];
  const identifiers = new Map<string, AtlasSourceIdentifier>();
  for (const candidate of candidates) {
    if (candidate.value === undefined || identifiers.has(candidate.scheme)) continue;
    const parsed = atlasSourceIdentifierSchema.safeParse(candidate);
    if (parsed.success) identifiers.set(parsed.data.scheme, parsed.data);
  }
  return [...identifiers.values()];
}

/** The kind of a new source family, from the closed vocabularies providers write. */
function sourceKindOf(check: AtlasSourceCheck & AtlasCheckedSource): AtlasSource["kind"] {
  if (check.kind === "nct") return "registry";
  const types = (check.record.publicationTypes ?? []).map((type) => type.trim());
  if (types.some((type) => ["Practice Guideline", "Guideline"].includes(type))) return "guideline";
  if (types.some((type) => ["Review", "Systematic Review", "Meta-Analysis", "Scoping Review"].includes(type))) {
    return "review";
  }
  return "study";
}

/** A provider's title as an intent may store it: one line, at most 500 characters, past the same screen. */
function storedTitle(title: string | undefined): string | null {
  if (title === undefined) return null;
  let text = title.replace(/\s+/gu, " ").trim();
  if (text.length > 500) text = text.slice(0, /[\uD800-\uDBFF]/u.test(text.charAt(499)) ? 499 : 500);
  if (text.length === 0 || /\p{Cc}/u.test(text) || screenAtlasTexts({ title: text }).length > 0 ||
    /(?:youtube(?:-nocookie)?\.com|youtu\.be)/iu.test(text)) {
    return null;
  }
  return text;
}

function storedNotices(notices: readonly { type: string; date: string | null; doi: string | null }[]) {
  return notices.slice(0, 20).map((notice) => ({
    type: notice.type as AtlasSource["check"]["notices"][number]["type"],
    date: notice.date !== null && /^\d{4}-\d{2}-\d{2}$/u.test(notice.date) &&
        new Date(`${notice.date}T00:00:00Z`).toISOString().startsWith(notice.date)
      ? notice.date
      : null,
    doi: notice.doi !== null && /^10\.\d{4,9}\/\S{1,300}$/u.test(notice.doi) ? notice.doi : null,
  }));
}

const severity = (status: string) => ATLAS_RETRACTION_SEVERITY.indexOf(status as typeof ATLAS_RETRACTION_SEVERITY[number]);

/**
 * The intent's sources from the checks (design section 3): each checked source with the identifiers its record gives
 * that name no other source family, joined to the family they name with that family's kind, or, for a new family, the
 * kind PubMed's types or the identifier say. Two card sources of one paper are one source, under the more serious
 * retraction status. A retracted, concerned, corrected or unreadable status needs the owner's confirm.
 */
function planSources(
  checks: AtlasSourceChecks,
  state: Pick<AtlasState, "sourceFamilies">,
  confirm: boolean,
): SourcePlan {
  const views: SourceCheckView[] = [];
  const problems: SourcePlan["problems"] = [];
  const confirmations: string[] = [];
  const planned: Array<{ source: AtlasSource; familyId: string | undefined; first: string; check: AtlasCheckedSource }> = [];
  const familiesNaming = (identifier: { scheme: string; value: string }) => state.sourceFamilies.filter(({ identifiers }) =>
    identifiers.some(({ scheme, value }) => scheme === identifier.scheme && value === identifier.value));
  for (const check of checks.sources) {
    const view = sourceView(check);
    if (check.outcome !== "checked") {
      views.push(view);
      const refused = refusal(check);
      if (refused !== undefined) problems.push(refused);
      continue;
    }
    // The cited identifier decides the family; the record's other identifiers join only where they agree with it.
    const all = recordIdentifiers(check);
    const cited = all.find(({ scheme }) => scheme === check.kind)!;
    let family: AtlasState["sourceFamilies"][number] | undefined = familiesNaming(cited)[0];
    if (family === undefined) {
      family = all.map(familiesNaming).find((named) => named.length > 0)?.[0];
    }
    const identifiers = all.filter((identifier) => {
      const named = familiesNaming(identifier);
      if (named.some((other) => other !== family)) return false;
      if (family === undefined) return true;
      const stored = family.identifiers.filter(({ scheme }) => scheme === identifier.scheme);
      return stored.length === 0 || stored.some(({ value }) => value === identifier.value);
    });
    if (!identifiers.some(({ scheme, value }) => scheme === cited.scheme && value === cited.value)) {
      views.push(view);
      problems.push({ code: "source_conflict", message: `${check.source} names a study record in the Atlas that its ` +
        "other identifiers contradict, so it cannot be bound." });
      continue;
    }
    const kind = family === undefined
      ? sourceKindOf(check)
      : (ATLAS_SOURCE_KINDS as readonly string[]).includes(family.sourceKind)
        ? family.sourceKind as AtlasSource["kind"]
        : undefined;
    if (kind === undefined) {
      views.push(view);
      problems.push({ code: "source_conflict", message: `${check.source}'s study record in the Atlas is of a kind an ` +
        "Atlas finding cannot bind." });
      continue;
    }
    identifiers.sort((left, right) => left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value));
    const same = planned.find((other) => (family !== undefined && other.familyId === family.familyId) ||
      other.source.identifiers.some((identifier) => identifiers.some(({ scheme, value }) =>
        scheme === identifier.scheme && value === identifier.value)));
    if (same !== undefined) {
      // One paper cited twice: one source, with every identifier that agrees, under the more serious status.
      const merged = new Map(same.source.identifiers.map((identifier) => [identifier.scheme, identifier]));
      for (const identifier of identifiers) if (!merged.has(identifier.scheme)) merged.set(identifier.scheme, identifier);
      same.source.identifiers = [...merged.values()]
        .sort((left, right) => left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value));
      if (severity(check.retraction.status) < severity(same.check.retraction.status)) {
        same.check = check;
        same.source.check = checkOf(check, confirm);
      }
      views.push({ ...view, sameAs: same.first });
      continue;
    }
    planned.push({
      source: { kind, identifiers, check: checkOf(check, confirm) },
      familyId: family?.familyId,
      first: check.source,
      check,
    });
    views.push(view);
  }
  for (const { check, first } of planned) {
    if (check.needsConfirmation) confirmations.push(confirmationOf(first, check));
  }
  return {
    status: checks.status,
    views,
    sources: planned.map(({ source }) => source).slice(0, 10),
    confirmations,
    problems,
  };
}

/** What the owner sees of a source's check. */
function sourceView(check: AtlasSourceCheck): SourceCheckView {
  const base: SourceCheckView = {
    source: check.source,
    outcome: check.outcome,
    identifier: check.outcome === "invalid_identifier" ? null : `${check.kind}:${check.identifier}`,
    provider: check.outcome === "invalid_identifier" ? null : check.provider,
    title: null,
    year: null,
    retraction: null,
    notices: 0,
    needsConfirmation: false,
    binding: null,
    sameAs: null,
    errorCode: check.outcome === "unavailable" ? check.errorCode : null,
  };
  return check.outcome !== "checked" ? base : {
    ...base,
    title: check.record.title ?? null,
    year: check.record.year ?? null,
    retraction: check.retraction.status,
    notices: check.retraction.notices.length,
    needsConfirmation: check.needsConfirmation,
    binding: check.binding,
  };
}

/** Why a source that is not checked cannot be bound; undefined while it only waits for its provider. */
function refusal(check: AtlasSourceCheck): { code: CheckProblemCode; message: string } | undefined {
  if (check.outcome === "invalid_identifier") {
    return { code: "source_refused", message: `${check.source} is not a DOI, PMID, PMCID or NCT number the checks can ` +
      "take: leave it out." };
  }
  if (check.outcome === "not_found") {
    return { code: "source_refused", message: `${check.source}: ${check.provider} has no public record of ` +
      `${check.identifier}, so it is refused.` };
  }
  return undefined;
}

/** What a flagged source asks of the owner before it is bound. */
function confirmationOf(source: string, check: AtlasCheckedSource): string {
  const status = check.retraction.status;
  const notices = check.retraction.notices.length;
  return status === "retracted"
    ? `${source} is retracted, so it would be bound as context only, never as support`
    : status === "unknown"
      ? `no provider could read ${source}'s retraction status`
      : `${source} has ${status === "expression_of_concern" ? "an expression of concern" : "a correction or update"} ` +
        `(${notices} notice${notices === 1 ? "" : "s"}), which the owner's confirm records as cleared`;
}

/**
 * The sources of an edit after acceptance: each source family its latest version binds and the owner keeps, checked
 * again by its own DOI, PMID, PMCID or NCT number and bound by its own identifiers, so it joins that family.
 */
function planFamilySources(
  checks: AtlasSourceChecks,
  families: ReadonlyArray<AtlasState["sourceFamilies"][number]>,
  confirm: boolean,
): SourcePlan {
  const plan: SourcePlan = { status: checks.status, views: [], sources: [], confirmations: [], problems: [] };
  checks.sources.forEach((check, index) => {
    const family = families[index]!;
    plan.views.push(sourceView(check));
    const refused = refusal(check);
    if (refused !== undefined) plan.problems.push(refused);
    if (check.outcome !== "checked") return;
    const identifiers = family.identifiers.flatMap((identifier) => {
      const parsed = atlasSourceIdentifierSchema.safeParse(identifier);
      return parsed.success ? [parsed.data] : [];
    }).sort((left, right) => left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value));
    if (!(ATLAS_SOURCE_KINDS as readonly string[]).includes(family.sourceKind) || identifiers.length === 0) {
      plan.problems.push({ code: "source_conflict", message: `${check.source}'s study record in the Atlas cannot be ` +
        "bound again by an Atlas finding." });
      return;
    }
    plan.sources.push({ kind: family.sourceKind as AtlasSource["kind"], identifiers, check: checkOf(check, confirm) });
    if (check.needsConfirmation) plan.confirmations.push(confirmationOf(check.source, check));
  });
  return plan;
}

function checkOf(check: AtlasCheckedSource, confirm: boolean): AtlasSource["check"] {
  const year = check.record.year === undefined ? NaN : Number(check.record.year);
  return {
    provider: check.provider,
    title: storedTitle(check.record.title),
    publishedYear: Number.isInteger(year) && year >= 1500 && year <= 2200 ? year : null,
    retractionStatus: check.retraction.status,
    notices: storedNotices(check.retraction.notices),
    ownerConfirmed: check.needsConfirmation && confirm,
    envelopeSha256: check.envelopeSha256,
    checkedAt: check.checkedAt,
  };
}

/** The identifier a stored source family is checked by again: its DOI first, then its PMID, PMCID or NCT number. */
function checkStringOf(family: AtlasState["sourceFamilies"][number]): string | undefined {
  for (const scheme of ["doi", "pmid", "pmcid", "nct"]) {
    const identifier = family.identifiers.find((candidate) => candidate.scheme === scheme);
    if (identifier !== undefined) return scheme === "pmid" ? `PMID:${identifier.value}` : identifier.value;
  }
  return undefined;
}

function sourcesSentence(plan: SourcePlan): string {
  if (plan.views.length === 0) return "Sources: none to check.";
  return `Sources: ${plan.views.map((view) => view.outcome === "checked"
    ? `${view.source} ${view.sameAs === null ? "" : `(the same paper as ${view.sameAs}) `}checked (${view.provider}` +
      `${view.year === null ? "" : `, ${view.year}`}, retraction status ${view.retraction})`
    : `${view.source} ${view.outcome.replace(/_/gu, " ")}${view.errorCode === null ? "" : ` (${view.errorCode})`}`)
    .join("; ")}.`;
}

function unavailableSources(plan: SourcePlan): string {
  return plan.views.filter(({ outcome }) => outcome === "unavailable")
    .map((view) => `${view.source}: ${view.provider} ${view.errorCode}`).join("; ") || "a provider";
}

// Canonical state -------------------------------------------------------------------------------------------------------

/** The current finding a card wording key re-checks: one with a version of that card or accepted key, not withdrawn. */
function recheckTarget(state: AtlasState, wordingKey: string): string | undefined {
  return state.findings.find((finding) => finding.versions.at(-1)?.status !== "invalidated" &&
    finding.versions.some((version) => version.cardWordingKey === wordingKey || version.acceptedWordingKey === wordingKey))
    ?.publicNumber;
}

function numberIn(state: AtlasState, findingId: string): string {
  return state.findings.find((finding) => finding.findingId === findingId)?.publicNumber ?? findingId;
}

function standingLink(state: AtlasState, from: string, to: string) {
  const ids = [from, to].map((number) => state.findings.find(({ publicNumber }) => publicNumber === number)?.findingId);
  return state.links.find((link) => !link.withdrawn && ids.includes(link.fromFindingId) && ids.includes(link.toFindingId) &&
    link.fromFindingId !== link.toFindingId);
}

function partnersOf(state: AtlasState, findingId: string): string[] {
  return [findingId, ...state.links.filter((link) => !link.withdrawn && link.relation === "contradicts" &&
    (link.fromFindingId === findingId || link.toFindingId === findingId))
    .map((link) => link.fromFindingId === findingId ? link.toFindingId : link.fromFindingId)];
}

/**
 * The labels the pure atlasLabelOf() gives these findings in the state, or in the state after one change: a link
 * added or withdrawn, a finding withdrawn, or a finding's bases changed.
 */
function labelsWith(
  state: AtlasState,
  findingIds: readonly string[],
  change: {
    addLink?: { fromFindingId: string; toFindingId: string; relation: AtlasLinkRelation };
    withdrawLink?: string;
    invalidate?: string;
    bases?: Record<string, readonly string[]>;
  } = {},
): Map<string, AtlasLabel> {
  const context = {
    findings: state.findings.map((finding) => ({
      findingId: finding.findingId,
      latestStatus: change.invalidate === finding.findingId ? "invalidated" : finding.versions.at(-1)!.status,
      verifiedBases: [...(change.bases?.[finding.findingId] ?? finding.versions.at(-1)!.content.verifiedBases)],
    })),
    links: [
      ...state.links.map((link) => ({
        fromFindingId: link.fromFindingId,
        toFindingId: link.toFindingId,
        relation: link.relation,
        withdrawn: link.withdrawn || link.linkId === change.withdrawLink,
      })),
      ...(change.addLink === undefined ? [] : [{ ...change.addLink, withdrawn: false }]),
    ],
  };
  const labels = new Map<string, AtlasLabel>();
  for (const id of findingIds) {
    try {
      labels.set(id, atlasLabelOf(id, context));
    } catch {
      // A finding whose label context the state does not hold in full has no label here.
    }
  }
  return labels;
}

/**
 * The Atlas as the link checks read it: each finding by its number, a lead when its latest version has no verified
 * basis (as the writer and the label rules read it), withdrawn when its latest version is invalidated; and the stored
 * links, with every standing replaces link (findings outside the state by their ID) for the cycle check.
 */
function linkStateOf(state: AtlasState): AtlasLinkState {
  const name = (findingId: string) => {
    const number = state.findings.find((finding) => finding.findingId === findingId)?.publicNumber;
    return number ?? `id:${findingId}`;
  };
  return {
    findings: state.findings.map((finding) => {
      const latest = finding.versions.at(-1)!;
      return {
        number: finding.publicNumber,
        entryKind: latest.content.verifiedBases.length === 0 ? "lead" as const : "finding" as const,
        withdrawn: latest.status === "invalidated",
      };
    }),
    links: [
      ...state.links.map((link) => ({
        from: name(link.fromFindingId), relation: link.relation, to: name(link.toFindingId), withdrawn: link.withdrawn,
      })),
      ...(state.replacesLinks ?? []).map((link) => ({
        from: name(link.fromFindingId), relation: "replaces" as const, to: name(link.toFindingId), withdrawn: false,
      })),
    ],
  };
}

// Views ---------------------------------------------------------------------------------------------------------------

function intentView(intent: AtlasIntentView): z.infer<typeof intentViewSchema> {
  return {
    intentId: intent.intentId,
    kind: intent.intentKind,
    atlasNumber: intent.publicNumber,
    status: intent.status,
    createdAt: intent.createdAt,
    failureCode: intent.failureCode,
    explanation: intent.failureCode === null ? null : ATLAS_FAILURE_EXPLANATIONS[intent.failureCode],
  };
}

function outcomeOf(status: "PENDING" | "COMPLETED" | "FAILED"): AtlasReviewOutcome {
  return status === "COMPLETED" ? "finding_written" : status === "FAILED" ? "finding_write_failed" : "finding_queued";
}

function statusSentence(status: AtlasStatus): string {
  if (status.version === null) {
    return status.intent?.status === "FAILED"
      ? `The Atlas writer refused ${status.atlasNumber}'s accept with ${status.intent.failureCode}: ` +
        `${status.intent.explanation}. Accept its card item again to retry under the same number.`
      : `${status.atlasNumber} waits for the Atlas writer (about 5 minutes)` +
        `${status.wording === null ? "" : `: "${clip(status.wording, 160)}"`}.`;
  }
  const links = status.links.filter(({ withdrawn }) => !withdrawn);
  const refused = status.intents.filter(({ status: state }) => state === "FAILED");
  const waiting = status.intents.filter(({ status: state }) => state === "PENDING");
  return `${status.atlasNumber}: ${status.entryKind === "lead" ? "a lead" : "a finding"}, labeled ${status.label}, ` +
    `version ${status.version}${status.topic === null ? "" : `, filed under ${status.topic.label}`}` +
    `${status.researchCheckedOn === null ? "" : `, research of ${status.researchCheckedOn}`}: "${clip(status.wording ?? "", 200)}"` +
    `${links.length === 0 ? "" : `. Links: ${links.map((link) => link.direction === "from"
      ? `${link.relation} ${link.other}` : `${link.other} ${link.relation} it`).join(", ")}`}` +
    `${waiting.length === 0 ? "" : `. Waiting for the writer: ${waiting.map(({ kind }) => kind).join(", ")}`}` +
    `${refused.length === 0 ? "" : `. Refused by the writer: ${refused.map((intent) =>
      `${intent.kind} (${intent.failureCode}: ${intent.explanation})`).join("; ")}`}.`;
}

function cardView(loaded: LoadedCard, findings: CardItem[], state: AtlasState): AtlasCardView {
  const { card } = loaded;
  const id = publicFindingsCardId(card.number);
  const leads = card.record.card.open_leads.map((_, index) =>
    cardItem(card, id, { itemKind: "open_lead", itemNumber: index + 1 })!);
  const declared = card.record.card.public_value;
  return {
    card: id,
    state: card.state,
    cardSha256: loaded.cardSha256,
    question: card.record.card.question,
    usualAnswer: card.record.card.usual_answer,
    publicValue: declared === undefined ? null : {
      scope: declared.scope,
      whoElse: declared.who_else ?? null,
      whatItChanges: declared.what_it_changes ?? null,
    },
    savedOn: card.record.stamp.saved_at.slice(0, 10),
    saves: 1 + card.occurrences.length,
    beyondQuickAnswer: isBeyondQuickAnswer(card.labels),
    items: [...findings, ...leads].map((item) => {
      const recheckOf = item.ref.itemKind === "finding" ? recheckTarget(state, item.cardWordingKey) : undefined;
      const decision = decisionFor(loaded.decisions, item.ref);
      return {
        item: item.ref.itemKind === "finding" ? "finding" as const : "lead" as const,
        number: item.ref.itemNumber,
        text: item.text,
        certainty: item.certainty,
        appliesTo: item.appliesTo,
        sources: item.sources,
        youtubeVideos: item.youtubeVideos,
        save: item.save,
        bases: item.bases,
        wouldBecome: wouldBecome(item, recheckOf),
        recheckOf: recheckOf ?? null,
        decision: decision === undefined ? null : {
          decision: decision.decision,
          atlasNumber: decision.publicNumber,
          decidedAt: decision.decidedAt,
          intentStatus: decision.intent?.status ?? null,
          failureCode: decision.intent?.failureCode ?? null,
        },
      };
    }),
    githubSynced: loaded.synced,
  };
}

function checksOf(input: {
  item: string;
  wouldBecome: WouldBecome | null;
  focus?: CardItem;
  recheckOf: string | undefined;
  community?: AtlasCommunityCheck;
  plan?: SourcePlan;
  sourceChecks?: AtlasSourceChecks;
  privacy: Array<{ field: string; reasonCode: string }>;
  numberProblems?: AtlasNumbersProblem[];
  linkProblems?: AtlasLinkProblem[];
  problems: Array<{ code: CheckProblemCode; message: string }>;
  topic?: AtlasChecks["topic"];
  relatedTopics: AtlasState["topics"];
}): AtlasChecks {
  return {
    item: input.item,
    wouldBecome: input.wouldBecome,
    save: input.focus?.save ?? null,
    bases: input.focus?.bases ?? [],
    recheckOf: input.recheckOf ?? null,
    community: input.community?.state ?? null,
    sourceStatus: input.sourceChecks?.status ?? (input.plan === undefined ? null : "passed"),
    sources: (input.plan?.views ?? []).slice(0, 10),
    numbers: (input.numberProblems ?? []).map(({ at, code, message }) => ({ at, code, message })),
    privacy: input.privacy,
    links: (input.linkProblems ?? []).map(({ code, message }) => ({
      code, writerCode: LINK_PROBLEM_WRITER_CODES[code] ?? null, message,
    })),
    problems: input.problems,
    needsConfirmation: [
      ...(input.community?.needsConfirmation === true ? [communityConfirmation()] : []),
      ...(input.plan?.confirmations ?? []),
    ],
    topic: input.topic ?? null,
    relatedTopics: input.relatedTopics.slice(0, 50).map(({ canonicalKey, label }) => ({ key: canonicalKey, label })),
  };
}

function checksNotPassed(item: string, checks: AtlasChecks): AtlasReviewResult {
  const lines = [
    ...checks.problems.map(({ message }) => message),
    ...checks.numbers.map(({ message }) => message),
    ...checks.privacy.map(({ field, reasonCode }) => `${field} does not pass the privacy screen (${reasonCode}): ` +
      "reword it in general terms, with no card id, link or personal detail."),
    ...checks.links.map(({ message, writerCode }) => `${message}${writerCode === null ? "" : ` (the writer would ` +
      `record ${writerCode})`}`),
  ];
  return {
    ok: false,
    outcome: "checks_not_passed",
    checks,
    text: `Not recorded: ${item} did not pass the checks.\n${lines.join("\n")}`,
  };
}

function tryAgainLater(reason: z.infer<typeof atlasRetrySchema>["reason"], message: string): AtlasReviewResult {
  return { ok: false, outcome: "try_again_later", retry: { reason, message }, text: message };
}

function syncSentence(sync: { synced: boolean }): string {
  return sync.synced ? "" : " GitHub was not updated yet; the next list or inspect posts the decision to the card.";
}

function markerOf(decision: AtlasDecisionView): FindingsDecisionMarker {
  return {
    itemKind: decision.itemKind,
    itemNumber: decision.itemNumber,
    decision: decision.decision,
    publicNumber: decision.publicNumber,
    decidedAt: decision.decidedAt,
  };
}

function reviewedLabels(labels: readonly string[]): string[] {
  return [...new Set([...labels.filter((label) => label !== "pending-review"), "reviewed"])];
}

// Errors ----------------------------------------------------------------------------------------------------------------

function errorOf(code: AtlasReviewErrorCode, message: string): AtlasReviewResult {
  return { ok: false, error: { code, message }, text: message };
}

function cardChanged(cardId: string, current: string): AtlasReviewResult {
  return errorOf("card_changed", `${cardId} changed since it was inspected (a later save, or an edit in GitHub): ` +
    `inspect it again; its cardSha256 is now ${current}. Nothing was recorded.`);
}

function itemNotFound(cardId: string, ref: ItemRef): AtlasReviewResult {
  return errorOf("item_not_found", `${cardId} has no ${ref.itemKind === "finding" ? "finding" : "open lead"} ` +
    `${ref.itemNumber}.`);
}

function versionStale(publicNumber: string, latest: number): AtlasReviewResult {
  return errorOf("version_stale", `${publicNumber}'s latest version is ${latest}: inspect it and send that version. ` +
    "Nothing was recorded.");
}

function withdrawnConflict(publicNumber: string): AtlasReviewResult {
  return errorOf("decision_conflict", `${publicNumber} is withdrawn, so it takes no further change.`);
}

function eraseNotBuilt(): AtlasReviewResult {
  return errorOf("erase_not_built", "Erasing a finding's wording (decision 7) comes with the next part of the Atlas " +
    "build; nothing was recorded. Correct or withdraw it without eraseWording, or wait for that release.");
}

function errorResult(error: unknown): AtlasReviewResult {
  if (error instanceof AtlasReviewError) {
    switch (error.code) {
      case "DECISION_CONFLICT":
      case "INTENT_CONFLICT":
        return errorOf("decision_conflict", "The card item or finding already has a different decision; inspect it " +
          "again. Nothing was recorded.");
      case "FINDING_NOT_FOUND":
        return errorOf("finding_not_found", "No accepted finding has that number; nothing was recorded.");
      case "INPUT_INVALID":
        return errorOf("invalid_request", "The review store refused the decision as not valid; nothing was recorded.");
    }
  }
  if (error instanceof GitHubApiError) {
    return error.retryable
      ? tryAgainLater("github_unavailable", "The findings repository could not be reached just now; try again in a " +
        "few minutes. Nothing was recorded.")
      : errorOf("review_service_unavailable", "The findings repository could not be reached with the App's token; " +
        "nothing was recorded.");
  }
  return errorOf("review_service_unavailable", "The Atlas review failed closed; nothing was recorded.");
}

// Text and paging -------------------------------------------------------------------------------------------------------

function normalizedNumber(value: string): string {
  return value.trim().toUpperCase();
}

/** A text on one line, cut to at most `max` characters (code points), with an ellipsis when cut. */
function clip(text: string, max: number): string {
  const points = [...text.replace(/\s+/gu, " ").trim()];
  return points.length <= max ? points.join("") : `${points.slice(0, max - 1).join("")}…`;
}

/** The research day of a save: the day its research was finalized, in UTC. */
function researchDayOf(stamp: FindingsStamp): string {
  const finalized = Date.parse(stamp.research.finalized_at);
  return new Date(Number.isFinite(finalized) ? finalized : Date.parse(stamp.saved_at)).toISOString().slice(0, 10);
}

const safeVersion = (value: string) => /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u.test(value) ? value : "unknown";
const safeBuild = (value: string) => /^(?:[0-9a-f]{7,40}|unknown)$/u.test(value) ? value : "unknown";

/** Which AskRigor made the research, from the save's stamp (without its save time, surface, model or catalog hash). */
function madeWithOf(stamp: FindingsStamp): AtlasMadeWith {
  const word = (value: string | undefined) => value !== undefined && /^[a-z_]{1,40}$/u.test(value) ? value : null;
  return {
    askrigorVersion: safeVersion(stamp.askrigor_version),
    build: safeBuild(stamp.askrigor_build),
    protocols: stamp.protocols.slice(0, 4).map(({ name, version, sha256 }) => ({ name, version, sha256 })),
    depth: word(stamp.research.depth),
    status: word(stamp.research.status),
  };
}

const LIST_PAGE = 10;

/** A card's place in the list: beyond-quick-answer first, then the oldest save, then the issue number. */
interface CursorKey {
  b: 0 | 1;
  s: string;
  n: number;
}

function cursorKeyOf(labels: readonly string[], record: FindingsRecord, number: number): CursorKey {
  return { b: isBeyondQuickAnswer(labels) ? 0 : 1, s: record.stamp.saved_at, n: number };
}

function compareCursorKeys(left: CursorKey, right: CursorKey): number {
  return left.b - right.b || Date.parse(left.s) - Date.parse(right.s) || left.n - right.n;
}

function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

/** The key a cursor names; null for a cursor list_findings did not make. */
function decodeCursor(cursor: string): CursorKey | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { b, s, n, ...rest } = value as Record<string, unknown>;
    return Object.keys(rest).length === 0 && (b === 0 || b === 1) && typeof s === "string" &&
        Number.isFinite(Date.parse(s)) && typeof n === "number" && Number.isSafeInteger(n) && n >= 1
      ? { b, s, n }
      : null;
  } catch {
    return null;
  }
}
