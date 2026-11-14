import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { permissiveConnectorInputSchema, type ConnectorJsonSchema } from "./connector-input-schema.js";
import { laterUserObservationSchema, openLeadsSchema, researchPlanSchema } from "./carried-state.js";
import { communityLeadsSchema } from "./community-leads.js";
import { runtimeActionDoiSchema } from "./actions/open-full-text-route.js";
import { studyMethodAuditSubmissionSchema } from "./actions/study-method-audit.js";
import { laterFindingsCardSchema } from "./findings/card.js";
import type { ResearchOperationHandler } from "./research-operation.js";
import { shareCodeSchema, sharedAnswerIdSchema, sharedAnswerInputSchema } from "./shared-answers.js";
import { SOURCE_LINE_LIMITS, sourceLineSchema } from "./source-lines.js";
import { sourceReadingInputSchema } from "./source-reading.js";
import { keyNameSchema, nameFormsSchema, searchCoverageSchema } from "./absence-searches.js";
import { studyMapSchema } from "./study-map.js";
import { keepItemsInputSchema } from "./atlas/kept-review.js";
import { placementsInputSchema } from "./atlas/placement-review.js";
import { reportVerdictSchema } from "./atlas/report-review.js";
import { atlasReportShareSchema, reportNumberSchema } from "./atlas/report-door.js";
import { glanceRowIdSchema, glanceRowInputSchema } from "./atlas/glance-review.js";
import { challengeMarkInputShape } from "./atlas/challenge-review.js";
import { claimCoverageSchema } from "./claim-coverage.js";
import { ASKED_LIMIT, framingSchema, researchMenuSchema, researchSteeringInputSchema } from "./research-steering.js";

/**
 * list_calls' page: the calls received before a time, as a previous listing's next_before gave it (the review of 12 Nov
 * 2026: a position shifted as each listing was itself recorded, so pages repeated a call), and at most limit of them.
 */
export const callsPageSchema = z.object({
  before: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u,
    "a UTC time such as 2026-11-12T18:39:07.272Z, as calls_page.next_before gave it").optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).strict();

/** search_europe_pmc's later index (owner answer 283a): europe_pmc, the default, or all_journals (OpenAlex). */
export const SEARCH_INDEXES = ["europe_pmc", "all_journals"] as const;

/**
 * The person's own words about the question, as the AI passes them on in later_inputs.asked (owner answer 298b): one
 * text, or a list with one message each (round 7, 13 Nov 2026: four of the five chats first sent a list). Read so by
 * register_plain_answer, for the planning call, and by finalize_research, for the review of the draft (owner answer
 * 301a).
 */
export const askedInputSchema = z.union([
  z.string().trim().min(1).max(ASKED_LIMIT),
  z.array(z.string().trim().min(1).max(ASKED_LIMIT)).min(1).max(20),
]);

/** The person's words as one text: a list's messages in order, a blank line between them. */
export function askedText(asked: string | readonly string[]): string {
  return typeof asked === "string" ? asked : asked.join("\n\n");
}

/**
 * The newest of the person's messages, when the AI passed on a list of more than one (owner answer 304a, 14 Nov 2026):
 * what AskRigor's own planning call reads to say whether the person told the AI to go on. A single text, or a list of
 * one, has no message that follows the question, so it has none: where one message ends is the list's to say, never a
 * blank line's.
 */
export function latestMessage(asked: string | readonly string[]): string | undefined {
  return typeof asked === "string" || asked.length < 2 ? undefined : asked[asked.length - 1];
}

/**
 * finalize_research's later_inputs.asked (owner answer 301a): read from the raw call on its own, as findings_save is,
 * in later_inputs or else at the top level, and parsed as register_plain_answer parses its own (askedInputSchema, then
 * askedText, at most ASKED_LIMIT characters in all). Undefined when absent or unusable, which is never a problem or a
 * next step: AskRigor's review of the draft then reads the research target alone.
 */
export function finalCheckAsked(raw: unknown): string | undefined {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(raw)) return undefined;
  const later = raw.later_inputs;
  const parsed = askedInputSchema.safeParse(object(later) && Object.hasOwn(later, "asked") ? later.asked : raw.asked);
  if (!parsed.success) return undefined;
  const text = askedText(parsed.data);
  return text.length > ASKED_LIMIT ? undefined : text;
}

/**
 * Owner answer 189a: published tool definitions stay fixed. A new input gets a later shape entry; a newer form
 * of an existing input (enum, nested field or relaxed limit) redeclares that input in the later shape. Either
 * form reaches runtime validation at the top level or through later_inputs, never both. A new action or category
 * goes in the runtime enum only, named in results or the protocol. New guidance belongs in results or the protocol.
 */
// The test marker (the free Claude test of 5 Nov 2026): "off", or another explicit off such as false or ["off"]; the
// value is read from the raw call (findingsSaveMarker), so any value parses here, and one that isn't off gets a note.
const findingsSaveMarkerSchema = z.unknown().optional();

const LATER_INPUT_SHAPES = Object.freeze({
  finalize_research: {
    community_evidence: z.enum(["researched", "not_relevant"]).optional()
      .describe("Community research declaration. Missing declarations, coverage and lane-report gaps are notes; material access boundaries remain limits to state in your own words."),
    treatment_choice: z.enum(["compared", "not_compared"]).optional()
      .describe("Treatment comparison declaration. Missing declarations, unfinished research and wording gaps are notes; only the five source, reading, number, harm-screen and retraction checks block."),
    open_leads: openLeadsSchema.optional()
      .describe("Optional planning for a later pass: studies or communities not yet reached, with what each could change."),
    another_pass_estimate: researchPlanSchema.shape.another_pass_estimate
      .describe("Optional estimate of what another pass would take, at most 200 characters."),
    // Owner answer 219b: the card's newer form, whose findings each declare whether they draw on YouTube comments.
    findings_card: laterFindingsCardSchema.optional()
      .describe("The findings card, as published, with each finding's draws_on_youtube_comments: true when any part " +
        "of it rests on YouTube comments read in this research, false otherwise. A finding drawing on them is held " +
        "privately for AskRigor's owner and never published; after comments were read, so is one left undeclared. " +
        "For the Atlas's research behind each finding (owner answer 252a), each finding may also give backing (the " +
        "paper's sentence and conclusion, copied exactly, and the strongest thing against it), each figure's source, " +
        "and forum_signal (what people report in the forum threads read here); one resting on its forum_signal alone " +
        "may have no sources."),
    // Owner answer 237a: the one optional field the source line adds.
    source_lines: z.array(sourceLineSchema).min(1).max(SOURCE_LINE_LIMITS.lines).optional()
      .describe("Optional: for each key claim, the key source's id, the claim, the paper's sentence and its own " +
        "conclusion, each copied whole and exactly, and the strongest thing against the claim. AskRigor looks both " +
        "quotes up in the text it fetched; a quote not found is a note, and the panel says so."),
    // Owner answer 249a: the study map, for a conclusion that combines studies.
    study_map: studyMapSchema.optional()
      .describe("Optional, when a conclusion combines studies: the studies, the group of people behind each, the " +
        "links between them and, for each claim, how many independent groups of people it counts, with each study's " +
        "passage it rests on. AskRigor checks what is exact against the research receipts, the texts it fetched and " +
        "ClinicalTrials.gov; what it finds are notes."),
    // 5 Nov 2026: user_observations' newer form, with not_tried.
    user_observations: z.array(laterUserObservationSchema).max(30).optional()
      .describe("user_observations' newer form, given here or at the top level, not both: as the top-level input, " +
        "and not_tried for a report whose writer never tried what it describes, such as a review of a book whose " +
        "exercises the reviewer didn't do."),
    // 5 Nov 2026 (the owner: "make sure that our feedback loop is working between forum signal and studies"): each lead
    // people's reports raised, with the study search that followed it or why none did.
    community_leads: communityLeadsSchema.optional()
      .describe("Each option, form, dose, timing, responder group, harm or way it could work that the forum threads " +
        "or YouTube comments read here raised and the question didn't name: searched, with the exact query of the " +
        "study search that followed, what the studies showed and the answer's sentence on it, or not_searched, with " +
        "why; an empty list when the reports raised nothing new. AskRigor checks the reads, searches and sentences " +
        "against this call's receipts and answer_draft; what it finds are notes, and leads not searched are a limit."),
    // 5 Nov 2026 (the owner: "make sure askrigor is enforcing that the AI tells people what it actually read"): for each
    // key source, the answer's words saying how it was read.
    source_reading: sourceReadingInputSchema.optional()
      .describe("For each key source the answer cites, one entry: source, its id as key_sources gives it, and quote, " +
        "the answer's own words saying how it was read (as this check's result names it, such as abstract only or " +
        "full text read), beside or in the sentence citing it, in the answer's language, copied from answer_draft. " +
        "A cited key source without an entry, or whose quote the answer doesn't show, holds the answer back under the " +
        "reading-depth check."),
    // The free Claude test of 5 Nov 2026 (absence-searches.ts): before saying something was not found, the key name's
    // other spellings, older names and synonyms, each searched, and a source beyond PubMed and Europe PMC.
    name_forms: nameFormsSchema.optional()
      .describe("Before saying something was not found: each other spelling, older name or synonym of the key name " +
        "that was searched, with the exact query of the search_pubmed, search_europe_pmc or search_clinical_trials " +
        "call that searched it. AskRigor checks each query against this call's literature-search receipts and that the " +
        "form's words are in it; what it finds are notes."),
    key_name: keyNameSchema.optional()
      .describe("With name_forms: the key name, as the answer writes it, copied from answer_draft. Only a form other " +
        "than it counts as another name searched."),
    search_coverage: searchCoverageSchema.optional()
      .describe("search_coverage's newer form, given here or at the top level (given in both, this one is used): " +
        "what the searches covered " +
        "beyond the indexed databases, and other_journals when your own web search covered journals PubMed and Europe " +
        "PMC don't index, which AskRigor can't see."),
    // AskRigor#431: a video fact-check accounts for every claim extract_youtube_video_claims listed (notes only).
    claim_coverage: claimCoverageSchema.optional()
      .describe("For each claim extract_youtube_video_claims listed (its id, such as dQw4w9WgXcQ#3): assessed, " +
        "limited (with reason, a few words), unresolved, or not_addressed. AskRigor checks the ids against this " +
        "call's extraction receipts; a claim with no status or not_addressed is a note, and the answer then calls " +
        "itself partial."),
    // The free Claude test of 5 Nov 2026: a test run's cards are never saved. It can only turn saving off.
    findings_save: findingsSaveMarkerSchema
      .describe("off: save no findings card from this call, whatever the account's setting, as a test run does. It " +
        "can only turn saving off; any value other than off leaves the account's setting to decide."),
    // Owner answer 301a (13 Nov 2026): the person's words, for AskRigor's own review of the draft on a dev account. Read
    // from the raw call (finalCheckAsked), so any value parses here and none is ever a problem or a step; used in memory
    // for that call only, and never signed, stored or logged.
    asked: z.unknown().optional()
      .describe("When a registration result asks for it: the person's own words about this question, word for word " +
        "and in order, as one text or a list with one message each, as given to register_plain_answer, with any later " +
        "message of theirs about this question added. Used only by AskRigor's review of the draft; never kept."),
  },
  // Owner answer 219b: the card exactly as finalize_research checked it, its findings' declarations included.
  save_research_findings: {
    findings_card: laterFindingsCardSchema
      .describe("The card exactly as the last finalize_research call checked it, with each finding's " +
        "draws_on_youtube_comments as that call had it.")
  },
  // The owner regressions on #412's build (judged 6 Nov 2026): doi's newer form, which takes the "<" and ">" of older
  // SICI-form DOIs, refused by the published pattern before a call reaches AskRigor. Percent-escaped (%3C, %3E), such a DOI
  // fits the published field too.
  acquire_open_full_text: {
    doi: runtimeActionDoiSchema.optional()
      .describe("doi's newer form, given here or at the top level, not both: a DOI with \"<\" or \">\", as older " +
        "SICI-form DOIs have, such as 10.1002/(SICI)1097-0258(19980515)17:9<1083::AID-SIM794>3.0.CO;2-2.")
  },
  // Owner answer 283a (9 Nov 2026): the same search over OpenAlex, a free index of nearly all journals, for papers in
  // journals PubMed and Europe PMC don't index (the 1999 Syrian rue oil paper was in one).
  search_europe_pmc: {
    index: z.enum(SEARCH_INDEXES).optional()
      .describe("all_journals: search OpenAlex, a free index of nearly all journals, instead of Europe PMC, for papers " +
        "in journals PubMed and Europe PMC don't index, such as many plant, food, farming and regional journals. " +
        "Only the query, date_range, page_size (up to 50) and cursor go to OpenAlex. europe_pmc, the default, " +
        "searches Europe PMC.")
  },
  search_youtube: {
    channel_id: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/u).optional()
      .describe("The caller's exact YouTube channel id; only matching results are returned, even when the query names a channel.")
  },
  // The recheck of 5 Nov 2026: a test run's audits leave nothing in the review inbox, so a marked check of the method is
  // never held for it.
  validate_study_method_audit: {
    audit: studyMethodAuditSubmissionSchema.optional(),
    findings_save: findingsSaveMarkerSchema
      .describe("off: hold nothing from this audit for AskRigor's review inbox, as a test run does. It changes " +
        "nothing else.")
  },
  validate_review_method_audit: {
    findings_save: findingsSaveMarkerSchema
      .describe("off: hold nothing from this audit for AskRigor's review inbox, as a test run does. It changes " +
        "nothing else.")
  },
  // Owner answer 200a: the person's confirmed, de-identified copy, and the code that deletes it.
  manage_research_access: {
    sharedAnswer: sharedAnswerInputSchema.optional()
      .describe("With share_answer: the de-identified copy the person saw and confirmed."),
    shareCode: shareCodeSchema.optional()
      .describe("With delete_shared_answer: the code share_answer returned."),
    // Owner answer 229a: a person's report to the Atlas, and its take-down.
    atlasReport: atlasReportShareSchema.optional()
      .describe("With share_report: the report exactly as the person saw and confirmed it, with its research."),
    reportNumber: reportNumberSchema.optional(),
    // Owner answer 279a (9 Nov 2026): the framing given with the plain answer, the menu of next tasks after a quick
    // screen, and the account's research style.
    framing: framingSchema.optional()
      .describe("With register_plain_answer: the question the person most likely means, premises that look inverted " +
        "or unclear, and questions that could redirect the research."),
    researchMenu: researchMenuSchema.optional()
      .describe("With plan_research, after a quick screen: the research target, the next tasks with their kind and " +
        "what each could change, and the person's allocation once given."),
    // Owner answer 298b (13 Nov 2026): the person's own words, for AskRigor's own planning call on a dev account. Read
    // in memory for that call only; never signed, stored or logged.
    // Round 7 (13 Nov 2026): four of the five chats first sent them as a list, one message each, and were refused
    // once; a list is read as its messages in order.
    asked: askedInputSchema.optional()
      .describe("With register_plain_answer, when inspect asks for it: the person's own words about this question, " +
        "word for word and in order: their question, and after it any answer they gave to a question of yours " +
        "about it; as one text, or as a list with one message each."),
    researchSteering: researchSteeringInputSchema.optional()
      .describe("With set_research_steering, when the person asks: style, checkBackMinutes and adjustmentDetail, any " +
        "of them."),
    // The review of 12 Nov 2026: list_calls shows what fits one result; its result says where the next ones start.
    callsPage: callsPageSchema.optional()
      .describe("With list_calls: before, the UTC time a previous result's calls_page.next_before gave, for the calls " +
        "received before it, and limit, at most how many to show; a result shows as many as fit and says where the " +
        "next ones start."),
  },
  review_research_contribution: {
    sharedAnswerId: sharedAnswerIdSchema.optional()
      .describe("With read_shared_answer or delete_shared_answer: the ID list_shared_answers gave."),
    // Owner answers 229a and 231a: findings kept for AskRigor's research only.
    items: keepItemsInputSchema.optional()
      .describe("With keep_for_research or show_on_pages: P and F numbers, up to 100. With mark_challenge or " +
        "clear_challenge: P numbers, up to 100."),
    // Owner answer 229a: where items sit under Health.
    placements: placementsInputSchema.optional()
      .describe("With place_items: [{item, subcategory}], 1 to 200 entries; subcategory a key list_unplaced lists, or null."),
    // Owner answer 229a: people's reports.
    reportState: z.enum(["received", "published", "held", "refused"]).optional()
      .describe("With list_reports: the state to list; received (the check's queue) by default."),
    report: z.string().trim().regex(/^[Rr]-[1-9][0-9]{3,}$/u).optional()
      .describe("With check_report or decide_report: the report, such as R-1001."),
    verdict: reportVerdictSchema.optional()
      .describe("With check_report or decide_report: {verdict, aiWarning?, reason?, subcategory?, research?}."),
    // The owner, 3 Nov: a problem's rows at a glance.
    glanceRow: glanceRowInputSchema.optional()
      .describe("With propose_glance_row: {subcategory, rowClass, what, result, comparison, followUp, limits, sources, namesAPerson}."),
    glanceRowId: glanceRowIdSchema.optional().describe("With show_glance_row or withdraw_glance_row: the row, such as G-1001."),
    glanceState: z.enum(["proposed", "shown", "withdrawn"]).optional()
      .describe("With list_glance_rows: the state to list; proposed by default."),
    // The owner, 6 Nov 2026: findings that challenge the usual view, with mark_challenge (items too, and with
    // clear_challenge).
    ...challengeMarkInputShape,
  },
} satisfies Record<string, z.ZodRawShape>);

type LaterInputShape<Tool extends string> = Tool extends keyof typeof LATER_INPUT_SHAPES
  ? typeof LATER_INPUT_SHAPES[Tool] : {};

/** The same declaration extends strict runtime parsers while their published top-level schemas stay fixed. */
export function laterInputShape<Tool extends string>(tool: Tool): LaterInputShape<Tool> {
  return ((LATER_INPUT_SHAPES as Readonly<Record<string, z.ZodRawShape>>)[tool] ?? {}) as LaterInputShape<Tool>;
}

export const LATER_INPUTS_DESCRIPTION = "Inputs added since this app loaded its tools, named by AskRigor results or the loaded protocol; omitted otherwise.";
const laterInputsField = z.record(z.string(), z.unknown()).optional().describe(LATER_INPUTS_DESCRIPTION);

// These descriptions freeze today's values, independently of later runtime enum growth.
const OPEN_INPUT_ENUMS: Readonly<Record<string, { field: string; description: string }>> = Object.freeze({
  manage_research_access: { field: "action", description: "Research access action: inspect, accept_free_contributor, " +
    "activate_paid_private, revoke, register_plain_answer, set_plain_answer_note, set_detailed_lesson_reports, " +
    "set_findings_save, or another value an AskRigor result names." },
  review_research_contribution: { field: "action", description: "Review action: inspect, status, accept, reject, " +
    "list_findings, inspect_finding, accept_finding, edit_finding, reject_finding, withdraw_finding, link_findings, " +
    "forget_card, list_youtube_findings, move_youtube_findings, delete_youtube_findings, delete_all_youtube_findings, " +
    "list_publications, unpublish_finding, publish_cards, set_aside_cards, list_comments, hide_comment, show_comment, " +
    "remove_comment, stop_commenter, restore_commenter, set_picks, or another value an AskRigor result names." },
  submit_lesson_candidate: { field: "category", description: "Lesson category: missing_sources, conflicting_claims, " +
    "incomplete_research, evidence_weighting, community_corpus, tool_semantics, protocol_execution, privacy_or_safety, " +
    "usability, other, or another value an AskRigor result names." },
});

export function laterInputNames(tool: string): readonly string[] {
  return Object.keys(laterInputShape(tool));
}

interface RuntimeInputOptions {
  /** Required when a connector's published shape is already permissive or relaxed. */
  schema?: z.ZodObject;
  /** A tool's existing normalization before validation against the extended runtime schema. */
  normalize?: (input: Record<string, unknown>) => unknown;
  /**
   * A tool that validates its own input and words its own problems (finalize_research's not_ready steps, the
   * contribution service's named problems) keeps doing so: "merges" passes the raw call on, with later_inputs, for
   * the tool's parser to merge with mergeLaterInputs; "validates" merges here and passes the merged call on unparsed.
   * ChatGPT shows an isError result without structuredContent only as "The tool failed internally" (2026-10-03 and
   * 2026-10-06), so those tools' own visible results must not be replaced by this wrapper's.
   */
  handler?: "merges" | "validates";
}

/**
 * A problem with a call's later_inputs, by path: a key left out ("dropped"), or, for a tool that keeps the usable keys, a
 * key given in both places whose later_inputs form was used ("replaced").
 */
export interface LaterInputProblem { path: PropertyKey[]; message: string; kind?: "dropped" | "replaced" | "kept" }

/**
 * Whether a call is marked findings_save, read from the raw call on its own (the review of 5 Nov 2026: a misspelt key
 * beside it once dropped every later input, the marker too, and a test run's card was saved), and the note it needs:
 * in later_inputs, at the top level, where an older app may put it, or in later_inputs sent as a JSON string (its
 * recheck). Only an explicit off reads as off: "off", in any case or separator, false, or a list of those such as
 * ["off"]. Any other value (true, "on") is not read as off, with a note that the account's setting decides: the owner's
 * own research must never lose a card because a model meant true as "save", as set_findings_save's true does (the third
 * check of 5 Nov 2026). Text that isn't JSON is not read for it; its envelope is dropped with its note, as any other.
 */
export function findingsSaveMarker(raw: unknown): { off: boolean; note?: string } {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(raw)) return { off: false };
  const values: unknown[] = [];
  let asText = false;
  if (Object.hasOwn(raw, "findings_save")) values.push(raw.findings_save);
  let later = raw.later_inputs;
  if (typeof later === "string") {
    try { later = JSON.parse(later); asText = true; } catch { later = undefined; }
  }
  if (object(later) && Object.hasOwn(later, "findings_save")) values.push(later.findings_save);
  else asText = false;
  const given = values.filter((value) => value !== undefined && value !== null);
  if (given.length === 0) return { off: false };
  const offWord = (value: unknown): boolean => value === false ||
    (typeof value === "string" && value.toLowerCase().replace(/[\s_-]+/gu, "") === "off");
  const explicit = (value: unknown): boolean => offWord(value) ||
    (Array.isArray(value) && value.length > 0 && value.length <= 10 && value.every(offWord));
  if (!given.every(explicit)) {
    return { off: false, note: "findings_save: not read as off. It only turns card saving off, with \"off\"; any other " +
      "value leaves the account's setting to decide." };
  }
  const exact = given.every((value) => typeof value === "string" && offWord(value));
  return {
    off: true,
    ...(asText ? { note: "findings_save: read as \"off\" from later_inputs given as text; give later_inputs as an " +
        "object, with findings_save \"off\"." }
      : exact ? {} : { note: "findings_save: read as \"off\"; give \"off\", its value." })
  };
}

/** Whether a call is marked findings_save, as findingsSaveMarker reads it. */
export function findingsSaveOff(raw: unknown): boolean {
  return findingsSaveMarker(raw).off;
}

/**
 * The later inputs whose top-level form a final check falls back to when their later_inputs form doesn't parse (the
 * recheck of 5 Nov 2026): ones the check only reads, whose older form is harmless. Anything saved or published, a
 * findings card above all, never falls back (the third check of 5 Nov 2026: a corrected card's unusable later form gave
 * way to the out-of-date top-level card, which was saved): its later form is read, and a card that doesn't parse is
 * kept privately, with its note, as before.
 */
export const TOP_LEVEL_FALLBACK_INPUTS: ReadonlySet<string> = new Set(["source_reading", "name_forms", "key_name",
  "search_coverage"]);

/**
 * Merges a call's later_inputs into its top-level inputs. A key the later shape declares (a new input, or a newer form
 * of a published one) is merged; any other key is a problem: a published top-level input belongs at the top level, and
 * an unknown key is named with the tool's later inputs. By default any problem leaves every later input out, and the
 * wrapper refuses the call. A tool that words its own result keeps the usable keys (keepUsable): it drops only the bad
 * ones, and a key given at the top level too takes its later_inputs form, the newer one, each named in a problem (the
 * review of 5 Nov 2026: one misspelt key lost a final check's source_reading and its test marker).
 */
export function mergeLaterInputs(
  tool: string,
  raw: unknown,
  topLevel: ReadonlySet<string>,
  laterShape: z.ZodRawShape = laterInputShape(tool),
  { keepUsable = false, fallback = new Set<string>() }: { keepUsable?: boolean; fallback?: ReadonlySet<string> } = {},
): { input: unknown; problems: LaterInputProblem[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, "later_inputs")) {
    return { input: raw, problems: [] };
  }
  const { later_inputs: later, ...own } = raw as Record<string, unknown>;
  const envelope = laterInputsField.safeParse(later);
  if (!envelope.success) {
    return { input: own, problems: envelope.error.issues.map((issue) =>
      ({ path: ["later_inputs", ...issue.path], message: issue.message, kind: "dropped" as const })) };
  }
  const additions = envelope.data ?? {};
  const names = Object.keys(laterShape);
  const merged: Record<string, unknown> = { ...own };
  const problems = Object.keys(additions).flatMap((key): LaterInputProblem[] => {
    const path = ["later_inputs", key];
    if (Object.hasOwn(laterShape, key) && key !== "later_inputs") {
      merged[key] = additions[key];
      if (!Object.hasOwn(own, key)) return [];
      if (!keepUsable) {
        return [{ path, kind: "dropped", message: `${key} is also given at the top level; each input may be given only once.` }];
      }
      // The recheck of 5 Nov 2026: a later form that doesn't parse beside a top-level one that does keeps the top-level
      // form, rather than losing a valid declaration to an unusable one, for an input whose older form is harmless
      // (fallback); anything saved or published keeps its later form (the third check of 5 Nov 2026).
      const schema = laterShape[key]!;
      if (fallback.has(key) && !z.safeParse(schema, additions[key]).success && z.safeParse(schema, own[key]).success) {
        merged[key] = own[key];
        return [{ path, kind: "kept", message: `${key} is given both at the top level and in later_inputs, and its ` +
          "later_inputs form doesn't parse: its top-level form is used." }];
      }
      return [{ path, kind: "replaced", message: `${key} is given both at the top level and in later_inputs: its ` +
        "later_inputs form, the newer one, is used." }];
    }
    return [topLevel.has(key)
      ? { path, kind: "dropped", message: `${key} is a published top-level input of ${tool}; give "${key}" at the top level.` }
      : { path, kind: "dropped", message: `Unknown later input ${JSON.stringify(key)} for ${tool}. Its later inputs: ` +
        `${names.join(", ") || "none"}.` }];
  });
  return { input: keepUsable || problems.length === 0 ? merged : own, problems };
}

/**
 * The SDK sees a permissive parser with the exact published JSON. The wrapper merges the envelope, then validates
 * against the original runtime object extended by its later shape, unless the tool validates its own input
 * (RuntimeInputOptions.handler). The optional arguments support isolated evolution tests and tools with separate
 * published schemas; production later shapes come from the map above.
 */
export function withLaterInputs(
  tool: string,
  inputSchema: unknown,
  execute: ResearchOperationHandler,
  laterShape: z.ZodRawShape = laterInputShape(tool),
  runtime: RuntimeInputOptions = {},
): { inputSchema: z.ZodObject; publishedInputSchema: z.ZodObject; runtimeSchema: z.ZodObject; execute: ResearchOperationHandler } {
  const original = inputSchema instanceof z.ZodObject ? inputSchema : z.object(inputSchema as z.ZodRawShape);
  const published = z.toJSONSchema(original, { target: "draft-7", io: "input" }) as ConnectorJsonSchema;
  const properties = { ...published.properties };
  const openEnum = OPEN_INPUT_ENUMS[tool];
  if (openEnum !== undefined) properties[openEnum.field] = { type: "string", description: openEnum.description };
  const topLevel = new Set([...Object.keys(properties), "later_inputs"]);
  const { $schema: _draft, ...laterPublished } = z.toJSONSchema(laterInputsField, { target: "draft-7", io: "input" });
  const publication = original.safeExtend({ later_inputs: laterInputsField }).meta({
    ...published, additionalProperties: published.additionalProperties,
    properties: { ...properties, later_inputs: laterPublished },
  });
  const input = permissiveConnectorInputSchema(z.toJSONSchema(publication, { target: "draft-7", io: "input" }) as ConnectorJsonSchema);
  const runtimeSchema = (runtime.schema ?? original).safeExtend({ ...laterShape, later_inputs: laterInputsField });
  return {
    inputSchema: input,
    publishedInputSchema: publication,
    runtimeSchema,
    execute: async (raw, extra) => {
      if (runtime.handler === "merges") return execute(raw, extra);
      const { input, problems } = mergeLaterInputs(tool, raw, topLevel, laterShape);
      if (problems.length > 0) {
        return inputError(problems.map(({ path, message }) => `${issuePath(path)}: ${message}`));
      }
      const merged = input as Record<string, unknown>;
      if (runtime.handler === "validates") return execute(merged, extra);
      const later = raw.later_inputs;
      const additions = new Set(later !== null && typeof later === "object" ? Object.keys(later) : []);
      const parsed = runtimeSchema.safeParse(runtime.normalize === undefined ? merged : runtime.normalize(merged));
      if (!parsed.success) return inputError(issueProblems(parsed.error.issues, [], additions));
      return execute(parsed.data, extra);
    },
  };
}

function issuePath(parts: readonly PropertyKey[]): string {
  return parts.reduce<string>((text, part) => typeof part === "number"
    ? `${text}[${part}]` : `${text}${text ? "." : ""}${String(part)}`, "") || "(input)";
}

function issueProblems(issues: readonly z.core.$ZodIssue[], prefix: PropertyKey[] = [], later = new Set<string>()): string[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code === "invalid_union") return issue.errors.flatMap((branch) => issueProblems(branch, path, later));
    const paths = issue.code === "unrecognized_keys" ? issue.keys.map((key) => [...path, key]) : [path];
    return paths.map((parts) => {
      if (later.has(String(parts[0]))) parts = ["later_inputs", ...parts];
      return `${issuePath(parts)}: ${issue.message}`;
    });
  });
}

function inputError(problems: string[]): CallToolResult {
  const message = problems.join("\n");
  return {
    isError: true,
    _meta: { "askrigor/errorCode": "invalid_input" },
    // SDK clients validate any structuredContent against the success schema, even for isError results.
    content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code: "invalid_input", message }, problems }) }],
  };
}
