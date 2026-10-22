import { z } from "zod";
import { expect } from "vitest";
import { createToolInventory } from "../../scripts/generate-tool-inventory.mts";
import { finalizeResearchInputSchema, normalizeIdentifier, type FinalizeResearchOutput } from "../../apps/research-mcp/src/research-finalization-gate.js";

// Receipt field returned by retrieval and audit tools, referenced by the final check.
export const NEXT_STEP_OUTPUT_FIELDS = ["research_receipt"] as const;

export function schemaIdentifiers(schema: unknown, identifiers = new Set<string>()): Set<string> {
  if (schema === null || typeof schema !== "object") return identifiers;
  if (Array.isArray(schema)) {
    for (const child of schema) schemaIdentifiers(child, identifiers);
    return identifiers;
  }
  const node = schema as Record<string, unknown>;
  if (node.properties !== null && typeof node.properties === "object") {
    for (const name of Object.keys(node.properties)) identifiers.add(name);
  }
  for (const value of Array.isArray(node.enum) ? node.enum : []) {
    if (typeof value === "string") identifiers.add(value);
  }
  if (typeof node.const === "string") identifiers.add(node.const);
  for (const child of Object.values(node)) schemaIdentifiers(child, identifiers);
  return identifiers;
}

// This is the MCP server's tools/list, rather than a hand-maintained copy of its schema.
export const inventory = await createToolInventory();
// A next step may name any field or value the published contract exposes: finalize_research's own inputs, another
// AskRigor tool's inputs (an explicitly named operation), or a value a tool returns that the caller has already seen.
export const allowedNextStepIdentifiers = schemaIdentifiers(
  [...inventory.tools.flatMap((tool) => [tool.inputSchema, (tool as { outputSchema?: unknown }).outputSchema]),
    z.toJSONSchema(finalizeResearchInputSchema, { target: "draft-7", io: "input" })],
  new Set([...inventory.tools.map(({ name }) => name), ...NEXT_STEP_OUTPUT_FIELDS])
);

export function unknownNextStepIdentifiers(steps: readonly string[]): string[] {
  return [...new Set(steps.flatMap((step) =>
    // URL path components and opaque video IDs are data, not schema identifiers.
    // The internal-labels messages quote the answer's own text, its declared reason, a declared harm or a declared class
    // of treatment; those labels are data, not schema identifiers.
    [...step.replace(/https?:\/\/\S+/giu, "").replace(/^(?:The answer|not_relevant_reason|harm_screen\[\d+\]\.harm|option_classes\[\d+\]\.option_class) shows internal labels \([^)]*\)/u, "").matchAll(/(?<![\w-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w-])/gu)]
      .map(([identifier]) => identifier).filter((identifier) => !allowedNextStepIdentifiers.has(identifier))
  ))];
}

export function assertNextStepsContract<T extends FinalizeResearchOutput>(result: T): T {
  expect(unknownNextStepIdentifiers(result.next_steps), result.next_steps.join("\n")).toEqual([]);
  // Every step has its kind, in the same order, and an answer given before a pass has its line (AskRigor#354).
  expect(result.next_step_kinds, result.next_steps.join("\n")).toHaveLength(result.next_steps.length);
  expect(result.unchecked_line !== undefined).toBe(result.status === "not_ready");
  return result;
}

// Existing fixtures isolate other gate rules. Their study citations now carry visible links too.
export function fixtureStudyLinks(input: Record<string, unknown>): string {
  return ((input.key_sources ?? []) as Array<{ id: string }>).map(({ id }) => {
    const normalized = normalizeIdentifier(id);
    const url = /^\d+$/u.test(normalized) ? `https://pubmed.ncbi.nlm.nih.gov/${normalized}/`
      : /^PMC\d+$/u.test(normalized) ? `https://pmc.ncbi.nlm.nih.gov/articles/${normalized}/`
      : /^10\.\d+\//u.test(normalized) ? `https://doi.org/${normalized}` : undefined;
    return url === undefined ? "" : `[Study](${url})`;
  }).join(" ");
}
