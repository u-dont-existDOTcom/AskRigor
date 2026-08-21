import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { RESEARCH_OPERATIONS } from "./register-tools.js";

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
  const tools = RESEARCH_OPERATIONS.map((operation) => ({
    name: operation.name,
    description: operation.description,
    inputSchema: geminiCompatibleInputSchema(operation.inputSchema),
    annotations: operation.annotations
  }));

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
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
