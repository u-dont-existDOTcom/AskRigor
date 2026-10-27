import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { permissiveConnectorInputSchema, type ConnectorJsonSchema } from "./connector-input-schema.js";
import type { ResearchOperationHandler } from "./research-operation.js";

/**
 * Owner answer 189a: published tool definitions stay fixed. A new input gets a later shape entry; a newer form
 * of an existing input (enum, nested field or relaxed limit) redeclares that input in the later shape. Either
 * form reaches runtime validation at the top level or through later_inputs, never both. A new action or category
 * goes in the runtime enum only, named in results or the protocol. New guidance belongs in results or the protocol.
 */
const LATER_INPUT_SHAPES = Object.freeze({
  finalize_research: {},
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
