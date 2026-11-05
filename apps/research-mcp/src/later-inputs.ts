import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { permissiveConnectorInputSchema, type ConnectorJsonSchema } from "./connector-input-schema.js";
import { laterUserObservationSchema, openLeadsSchema, researchPlanSchema } from "./carried-state.js";
import { communityLeadsSchema } from "./community-leads.js";
import { studyMethodAuditSubmissionSchema } from "./actions/study-method-audit.js";
import { laterFindingsCardSchema } from "./findings/card.js";
import type { ResearchOperationHandler } from "./research-operation.js";
import { shareCodeSchema, sharedAnswerIdSchema, sharedAnswerInputSchema } from "./shared-answers.js";
import { SOURCE_LINE_LIMITS, sourceLineSchema } from "./source-lines.js";
import { sourceReadingInputSchema } from "./source-reading.js";
import { nameFormsSchema, searchCoverageSchema } from "./absence-searches.js";
import { studyMapSchema } from "./study-map.js";
import { keepItemsInputSchema } from "./atlas/kept-review.js";
import { placementsInputSchema } from "./atlas/placement-review.js";
import { reportVerdictSchema } from "./atlas/report-review.js";
import { atlasReportShareSchema, reportNumberSchema } from "./atlas/report-door.js";
import { glanceRowIdSchema, glanceRowInputSchema } from "./atlas/glance-review.js";

/**
 * Owner answer 189a: published tool definitions stay fixed. A new input gets a later shape entry; a newer form
 * of an existing input (enum, nested field or relaxed limit) redeclares that input in the later shape. Either
 * form reaches runtime validation at the top level or through later_inputs, never both. A new action or category
 * goes in the runtime enum only, named in results or the protocol. New guidance belongs in results or the protocol.
 */
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
        "form is in it; what it finds are notes."),
    search_coverage: searchCoverageSchema.optional()
      .describe("search_coverage's newer form, given here or at the top level, not both: what the searches covered " +
        "beyond the indexed databases, and other_journals when your own web search covered journals PubMed and Europe " +
        "PMC don't index, which AskRigor can't see."),
    // The free Claude test of 5 Nov 2026: a test run's cards are never saved. It can only turn saving off.
    findings_save: z.literal("off").optional()
      .describe("off: save no findings card from this call, whatever the account's setting, as a test run does. It " +
        "cannot turn saving on.")
  },
  // Owner answer 219b: the card exactly as finalize_research checked it, its findings' declarations included.
  save_research_findings: {
    findings_card: laterFindingsCardSchema
      .describe("The card exactly as the last finalize_research call checked it, with each finding's " +
        "draws_on_youtube_comments as that call had it.")
  },
  search_youtube: {
    channel_id: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/u).optional()
      .describe("The caller's exact YouTube channel id; only matching results are returned, even when the query names a channel.")
  },
  validate_study_method_audit: { audit: studyMethodAuditSubmissionSchema.optional() },
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
  },
  review_research_contribution: {
    sharedAnswerId: sharedAnswerIdSchema.optional()
      .describe("With read_shared_answer or delete_shared_answer: the ID list_shared_answers gave."),
    // Owner answers 229a and 231a: findings kept for AskRigor's research only.
    items: keepItemsInputSchema.optional()
      .describe("With keep_for_research or show_on_pages: P and F numbers, up to 100."),
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

/** A problem with a call's later_inputs, by path. */
export interface LaterInputProblem { path: PropertyKey[]; message: string }

/**
 * Merges a call's later_inputs into its top-level inputs. A key the later shape declares (a new input, or a newer form
 * of a published one) is merged, unless the call also gives it at the top level; any other key is a problem: a
 * published top-level input belongs at the top level, and an unknown key is named with the tool's later inputs.
 */
export function mergeLaterInputs(
  tool: string,
  raw: unknown,
  topLevel: ReadonlySet<string>,
  laterShape: z.ZodRawShape = laterInputShape(tool),
): { input: unknown; problems: LaterInputProblem[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, "later_inputs")) {
    return { input: raw, problems: [] };
  }
  const { later_inputs: later, ...own } = raw as Record<string, unknown>;
  const envelope = laterInputsField.safeParse(later);
  if (!envelope.success) {
    return { input: own, problems: envelope.error.issues.map((issue) => ({ path: ["later_inputs", ...issue.path], message: issue.message })) };
  }
  const additions = envelope.data ?? {};
  const names = Object.keys(laterShape);
  const problems = Object.keys(additions).flatMap((key): LaterInputProblem[] => {
    const path = ["later_inputs", key];
    if (Object.hasOwn(laterShape, key) && key !== "later_inputs") return Object.hasOwn(own, key)
      ? [{ path, message: `${key} is also given at the top level; each input may be given only once.` }] : [];
    return topLevel.has(key)
      ? [{ path, message: `${key} is a published top-level input of ${tool}; give "${key}" at the top level.` }]
      : [{ path, message: `Unknown later input ${JSON.stringify(key)} for ${tool}. Its later inputs: ${names.join(", ") || "none"}.` }];
  });
  return { input: problems.length > 0 ? own : { ...own, ...additions }, problems };
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
