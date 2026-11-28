import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { LATER_INPUTS_DESCRIPTION } from "./later-inputs.js";

import { RESEARCH_OPERATIONS } from "./register-tools.js";

const GEMINI_DESCRIPTION_MAX_CHARACTERS = 170;
// Leave room below the transport's 25,000-byte limit.
const GEMINI_CATALOG_MAX_BYTES = 24_500;
const GEMINI_DESCRIPTION_MIN_CHARACTERS = 64;
const LESSON_TOOL = "submit_lesson_candidate";
const LESSON_DESCRIPTION = "Report an AskRigor bug, preference, or feature request. Show the de-identified report first " +
  "and submit only after the user agrees. Send one report per incident.";
const LESSON_FIELD_DESCRIPTIONS: Readonly<Record<string, string>> = {
  general_lesson: "When [situation], AskRigor should [behavior] because [reason].",
  expected_behavior: "Expected result at the first failing step.",
  synthetic_regression_example: "Invent a reproduction and its expected result.",
  consent_scope: 'Use "conversation" only with consent for the whole chat.',
  existing_rules: "Name exact current HRP or Universal rules and their status, or explain the missing rule in none.",
  observed_behavior: "First observed failing step, without personal details.",
  part_to_change: "Name the specific tool, protocol rule, or check.",
  related_issue: "Public AskRigor issue number, if the user filed one.",
  detailed_report: "Only if enabled in the account's AskRigor settings. Show it before asking for consent.",
  check_report_token: "Exact token from a stopped final check, after consent.",
  preventing_rule: "For a correction, the exact HRP or Universal rule shown to the user, or no_rule with missing_rule.",
  missing_rule: "With no_rule, give the one-line missing rule shown to the user."
};
const PRODUCT_IDENTITY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  product_identity: "Match product in provider text.",
  names: "Label names, documented aliases/scripts.",
  maker_names: "Brands/makers distinguishing variants.",
  other_variant_names: "Sibling and other makers' variants."
};

// The longest schemas can leave routine bounds and format checks to the shared runtime validator.
// Keep array sizes when they specify a fixed count, and keep numeric ranges and defaults.
const TOOLS_WITH_COMPACT_FIELD_HINTS = new Set([
  "validate_study_method_audit", "validate_review_method_audit", LESSON_TOOL,
  "acquire_open_full_text", "get_research_frontier", "search_pubmed", "search_europe_pmc",
  "search_youtube", "search_youtube_comments", "audit_youtube_community",
  "survey_youtube_community", "audit_youtube_video_community"
]);

// Inputs that only bind research receipts for finalize_research, which this
// catalog does not offer; leaving them out keeps it inside its size budget.
// A study audit's headline figures and its programs' routes are read only by
// finalize_research (owner questions 87 to 89). A dotted name is nested.
const FINALIZATION_ONLY_INPUTS: Readonly<Record<string, readonly string[]>> = {
  search_youtube: ["research_target"],
  validate_study_method_audit: [
    "audit.reported_figures",
    "audit.reported_figures_none_reason",
    "audit.intervention_program.route",
    "audit.comparator_program.route"
  ]
};

const GEMINI_FUNCTION_SCHEMA_KEYS = new Set([
  "type",
  "nullable",
  "required",
  "format",
  "description",
  "properties",
  "items",
  "enum",
  "anyOf",
  "$ref",
  "$defs"
]);

export function installGeminiCompatibleToolCatalog(server: McpServer): void {
  const operations = RESEARCH_OPERATIONS
    .filter(({ name }) => ![
      "review_evidence_gap_submissions",
      "review_research_contribution",
      "search_research_frontiers",
      "manage_research_access",
      "submit_research_contribution",
      "save_research_findings",
      "assess_treatment_landscape_coverage",
      "scout_gemini_youtube_candidates",
      "extract_youtube_video_claims",
      "finalize_research",
      "read_forum_thread",
      "search_reddit_threads",
    ].includes(name));
  const fullTools = operations
    .map((operation) => ({
    name: operation.name,
    description: operation.description,
    inputSchema: withoutInputs(
      geminiCompatibleInputSchema(operation.name, operation.publishedInputSchema),
      FINALIZATION_ONLY_INPUTS[operation.name] ?? []
    ),
    annotations: operation.annotations
    }));

  // Owner answer 189a permits Gemini-only envelope omissions if every envelope cannot fit. Preserve every
  // existing tool/input; at the minimum tool-description length, omit envelopes from the end of this fixed order.
  // The served-list fixture records the exact omissions, so a release cannot silently change them.
  while (Buffer.byteLength(JSON.stringify({ tools: compactTools(GEMINI_DESCRIPTION_MIN_CHARACTERS) }), "utf8") >= GEMINI_CATALOG_MAX_BYTES) {
    const tool = fullTools.findLast(({ inputSchema }) =>
      Object.hasOwn(inputSchema.properties as Record<string, unknown>, "later_inputs"));
    if (tool === undefined) throw new Error("Gemini tool catalog exceeds its byte budget without later inputs");
    tool.inputSchema = withoutInputs(tool.inputSchema, ["later_inputs"]);
  }

  // Input growth must not defeat the transport's total catalog budget.
  // Keep every tool and input; reduce description length only as needed.
  let descriptionLimit = GEMINI_DESCRIPTION_MAX_CHARACTERS;
  let tools = compactTools(descriptionLimit);
  while (Buffer.byteLength(JSON.stringify({ tools }), "utf8") >= GEMINI_CATALOG_MAX_BYTES) {
    descriptionLimit -= 5;
    if (descriptionLimit < GEMINI_DESCRIPTION_MIN_CHARACTERS) {
      throw new Error("Gemini tool catalog exceeds its byte budget with complete inputs");
    }
    tools = compactTools(descriptionLimit);
  }

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));

  function compactTools(maximumCharacters: number) {
    return fullTools.map((tool) => ({
      ...tool,
      description: tool.name === LESSON_TOOL
        ? LESSON_DESCRIPTION
        : compactGeminiDescription(tool.description, maximumCharacters)
    }));
  }
}

function withoutInputs(
  schema: Record<string, unknown>,
  names: readonly string[]
): Record<string, unknown> {
  if (names.length === 0) return schema;
  const properties = { ...(schema.properties as Record<string, unknown> | undefined) };
  const own = names.filter((name) => !name.includes("."));
  for (const name of own) delete properties[name];
  // Nested names ("audit.reported_figures") are removed inside that input.
  const nested = new Map<string, string[]>();
  for (const name of names.filter((candidate) => candidate.includes("."))) {
    const [head, ...rest] = name.split(".");
    nested.set(head!, [...(nested.get(head!) ?? []), rest.join(".")]);
  }
  for (const [head, rest] of nested) {
    const child = properties[head];
    if (child !== null && typeof child === "object" && "properties" in child) {
      properties[head] = withoutInputs(child as Record<string, unknown>, rest);
    }
  }
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name) => !own.includes(String(name)))
    : undefined;
  return { ...schema, properties, ...(required === undefined ? {} : { required }) };
}

function compactGeminiDescription(description: string, maximumCharacters: number): string {
  if (description.length <= maximumCharacters) return description;
  const prefix = description.slice(0, maximumCharacters - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, Math.max(1, boundary)).replace(/[.;,:]+$/u, "")}.`;
}

function geminiCompatibleInputSchema(tool: string, inputSchema: unknown): Record<string, unknown> {
  const zodSchema = isZodSchema(inputSchema)
    ? inputSchema
    : z.object(inputSchema as z.ZodRawShape);
  const jsonSchema = z.toJSONSchema(zodSchema, { target: "draft-7" });
  const compactFieldHints = TOOLS_WITH_COMPACT_FIELD_HINTS.has(tool);
  return sanitizeSchema(jsonSchema);

  function sanitizeSchema(schema: Record<string, unknown>, field?: string, productIdentity = false): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    // Product names distinguish variants, so keep their exact bounds beside the fields.
    const keepFullHints = productIdentity || field === "product_identity";

    for (const [key, value] of Object.entries(schema)) {
      if (!GEMINI_FUNCTION_SCHEMA_KEYS.has(key)) continue;
      if (key === "properties" || key === "$defs") {
        sanitized[key] = sanitizeNamedSchemas(value, keepFullHints);
        continue;
      }
      if (key === "description" && typeof value === "string") {
        sanitized.description = describeField(value, field, keepFullHints);
        continue;
      }
      sanitized[key] = sanitizeSchemaValue(value, keepFullHints);
    }

    const hints = constraintHints(schema, compactFieldHints && !keepFullHints);
    if (hints.length > 0) {
      const description = typeof sanitized.description === "string" ? sanitized.description.trim() : "";
      sanitized.description = [description, ...hints].filter(Boolean).join(" ");
    }
    return sanitized;
  }

  function describeField(description: string, field: string | undefined, productIdentity: boolean): string {
    if (tool === LESSON_TOOL && field !== undefined) {
      // Preserve all listed categories and keep consent and diagnostic guidance readable.
      if (field === "category") return description;
      if (Object.hasOwn(LESSON_FIELD_DESCRIPTIONS, field)) return LESSON_FIELD_DESCRIPTIONS[field]!;
    }
    if (productIdentity && field !== undefined && Object.hasOwn(PRODUCT_IDENTITY_DESCRIPTIONS, field)) {
      return PRODUCT_IDENTITY_DESCRIPTIONS[field]!;
    }
    return compactGeminiDescription(description, 50);
  }

  function sanitizeNamedSchemas(value: unknown, keepFullHints: boolean): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([name, schema]) => [
        name,
        name === "later_inputs" ? { type: "object", description: LATER_INPUTS_DESCRIPTION } :
        typeof schema === "object" && schema !== null && !Array.isArray(schema)
          ? sanitizeSchema(schema as Record<string, unknown>, name, keepFullHints)
          : {}
      ])
    );
  }

  function sanitizeSchemaValue(value: unknown, keepFullHints: boolean): unknown {
    if (Array.isArray(value)) return value.map((entry) => sanitizeSchemaValue(entry, keepFullHints));
    if (typeof value === "object" && value !== null) {
      return sanitizeSchema(value as Record<string, unknown>, undefined, keepFullHints);
    }
    return value;
  }
}

function isZodSchema(value: unknown): value is z.ZodType {
  return typeof value === "object" && value !== null &&
    "safeParse" in value && typeof value.safeParse === "function";
}

function constraintHints(schema: Record<string, unknown>, compact: boolean): string[] {
  const hints: string[] = [];
  if ("default" in schema) {
    hints.push(`Default: ${JSON.stringify(schema.default)}.`);
  }
  if (typeof schema.minimum === "number" || typeof schema.maximum === "number") {
    hints.push(rangeHint("Range", schema.minimum, schema.maximum));
  }
  if (!compact && (typeof schema.minLength === "number" || typeof schema.maxLength === "number")) {
    hints.push(rangeHint("Length", schema.minLength, schema.maxLength));
  }
  if ((!compact || schema.minItems === schema.maxItems) &&
      (typeof schema.minItems === "number" || typeof schema.maxItems === "number")) {
    hints.push(rangeHint("Items", schema.minItems, schema.maxItems));
  }
  if (!compact && typeof schema.pattern === "string") {
    hints.push(`Pattern: ${schema.pattern}.`);
  }
  return hints;
}

function rangeHint(label: string, minimum: unknown, maximum: unknown): string {
  if (typeof minimum === "number" && typeof maximum === "number") {
    return `${label}: ${minimum}–${maximum}.`;
  }
  if (typeof minimum === "number") {
    return `${label}: ≥${minimum}.`;
  }
  return `${label}: ≤${String(maximum)}.`;
}
