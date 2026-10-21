import { z } from "zod";

/** A JSON Schema node as the SDK publishes it in tools/list. */
export interface ConnectorJsonSchema {
  [key: string]: unknown;
  type?: string | string[];
  description?: string;
  properties?: Record<string, ConnectorJsonSchema>;
  items?: ConnectorJsonSchema;
  anyOf?: ConnectorJsonSchema[];
  oneOf?: ConnectorJsonSchema[];
  required?: string[];
}

/** The SDK uses draft-7 and input mode for tools/list (zod-json-schema-compat). */
export function strictConnectorInputSchema(schema: z.ZodType): ConnectorJsonSchema {
  return z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as ConnectorJsonSchema;
}

// Constraints ChatGPT's connector checks but its app does not show the model
// (read-only Codex probes, 2026-10-16), so a call failed on rules it could not see.
const HIDDEN_CONSTRAINTS = new Set(["minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "minimum",
  "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "uniqueItems", "additionalProperties"]);

/**
 * ChatGPT's surface: the top level as it is, without the constraints its app hides; a union, and an object or array
 * nested below the second level, published as described but untyped. The tool's own description carries those shapes.
 */
export function relaxedConnectorInputSchema(strict: ConnectorJsonSchema): ConnectorJsonSchema {
  const walk = (node: ConnectorJsonSchema, depth: number): ConnectorJsonSchema => {
    const container = node.properties !== undefined || node.items !== undefined || node.type === "object" || node.type === "array";
    if (node.anyOf !== undefined || node.oneOf !== undefined || (container && depth >= 3)) {
      return node.description === undefined ? {} : { description: node.description };
    }
    const result: ConnectorJsonSchema = {};
    for (const [key, value] of Object.entries(node)) {
      if (HIDDEN_CONSTRAINTS.has(key)) continue;
      if (key === "properties") result.properties = Object.fromEntries(
        Object.entries(node.properties!).map(([name, child]) => [name, walk(child, depth + 1)]));
      else if (key === "items") result.items = walk(node.items!, depth + 1);
      else result[key] = value;
    }
    return result;
  };
  return walk(strict, 0);
}

/**
 * Runtime acceptance is permissive on both surfaces; only the published schema differs. The SDK passes any arguments
 * to the handler, which validates them itself and reports every problem.
 */
export function permissiveConnectorInputSchema(published: ConnectorJsonSchema) {
  return z.looseObject(Object.fromEntries(Object.entries(published.properties!).map(([key, fragment]) =>
    [key, z.unknown().optional().meta(fragment)]))).meta({
      ...published,
      // Override looseObject's generated additionalProperties too, including its absence on /mcp.
      additionalProperties: published.additionalProperties
    });
}
