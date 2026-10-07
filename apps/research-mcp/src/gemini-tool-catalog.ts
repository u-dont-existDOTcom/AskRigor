import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { RESEARCH_OPERATIONS } from "./register-tools.js";

const GEMINI_DESCRIPTION_MAX_CHARACTERS = 170;
const GEMINI_CATALOG_MAX_BYTES = 25_000;
const GEMINI_DESCRIPTION_MIN_CHARACTERS = 64;

// Inputs that only bind research receipts for finalize_research, which this
// catalog does not offer; leaving them out keeps it inside its size budget.
const FINALIZATION_ONLY_INPUTS: Readonly<Record<string, readonly string[]>> = {
  search_youtube: ["research_target"]
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
      "submit_lesson_candidate",
      "save_research_findings",
      "assess_treatment_landscape_coverage",
      "scout_gemini_youtube_candidates",
      "extract_youtube_video_claims",
      "finalize_research",
    ].includes(name));
  const fullTools = operations
    .map((operation) => ({
    name: operation.name,
    description: operation.description,
    inputSchema: withoutInputs(
      geminiCompatibleInputSchema(operation.inputSchema),
      FINALIZATION_ONLY_INPUTS[operation.name] ?? []
    ),
    annotations: operation.annotations
    }));

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
      description: compactGeminiDescription(tool.description, maximumCharacters)
    }));
  }
}

function withoutInputs(
  schema: Record<string, unknown>,
  names: readonly string[]
): Record<string, unknown> {
  if (names.length === 0) return schema;
  const properties = { ...(schema.properties as Record<string, unknown> | undefined) };
  for (const name of names) delete properties[name];
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name) => !names.includes(String(name)))
    : undefined;
  return { ...schema, properties, ...(required === undefined ? {} : { required }) };
}

function compactGeminiDescription(description: string, maximumCharacters: number): string {
  if (description.length <= maximumCharacters) return description;
  const prefix = description.slice(0, maximumCharacters - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, Math.max(1, boundary)).replace(/[.;,:]+$/u, "")}.`;
}

function geminiCompatibleInputSchema(inputSchema: unknown): Record<string, unknown> {
  const zodSchema = isZodSchema(inputSchema)
    ? inputSchema
    : z.object(inputSchema as z.ZodRawShape);
  const jsonSchema = z.toJSONSchema(zodSchema, { target: "draft-7" });
  return sanitizeGeminiFunctionSchema(jsonSchema);
}

function isZodSchema(value: unknown): value is z.ZodType {
  return typeof value === "object" && value !== null &&
    "safeParse" in value && typeof value.safeParse === "function";
}

function sanitizeGeminiFunctionSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (!GEMINI_FUNCTION_SCHEMA_KEYS.has(key)) {
      continue;
    }
    if (key === "properties" || key === "$defs") {
      sanitized[key] = sanitizeNamedSchemas(value);
      continue;
    }
    sanitized[key] = sanitizeSchemaValue(value);
  }

  const hints = constraintHints(schema);
  if (hints.length > 0) {
    const description = typeof sanitized.description === "string"
      ? sanitized.description.trim()
      : "";
    sanitized.description = [description, ...hints].filter(Boolean).join(" ");
  }

  return sanitized;
}

function sanitizeNamedSchemas(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, schema]) => [
      name,
      typeof schema === "object" && schema !== null && !Array.isArray(schema)
        ? sanitizeGeminiFunctionSchema(schema as Record<string, unknown>)
        : {}
    ])
  );
}

function sanitizeSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSchemaValue);
  }
  if (typeof value === "object" && value !== null) {
    return sanitizeGeminiFunctionSchema(value as Record<string, unknown>);
  }
  return value;
}

function constraintHints(schema: Record<string, unknown>): string[] {
  const hints: string[] = [];
  if ("default" in schema) {
    hints.push(`Default when omitted: ${JSON.stringify(schema.default)}.`);
  }
  if (typeof schema.minimum === "number" || typeof schema.maximum === "number") {
    hints.push(rangeHint("Accepted range", schema.minimum, schema.maximum));
  }
  if (typeof schema.minLength === "number" || typeof schema.maxLength === "number") {
    hints.push(rangeHint("Accepted character count", schema.minLength, schema.maxLength));
  }
  if (typeof schema.minItems === "number" || typeof schema.maxItems === "number") {
    hints.push(rangeHint("Accepted item count", schema.minItems, schema.maxItems));
  }
  if (typeof schema.pattern === "string") {
    hints.push(`Required format: ${schema.pattern}.`);
  }
  return hints;
}

function rangeHint(label: string, minimum: unknown, maximum: unknown): string {
  if (typeof minimum === "number" && typeof maximum === "number") {
    return `${label}: ${minimum} through ${maximum}.`;
  }
  if (typeof minimum === "number") {
    return `${label}: at least ${minimum}.`;
  }
  return `${label}: at most ${String(maximum)}.`;
}
