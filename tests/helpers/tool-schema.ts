import { expect } from "vitest";
import { LATER_INPUTS_DESCRIPTION } from "../../apps/research-mcp/src/later-inputs.js";

/** Existing per-tool assertions still compare the entire published top-level contract plus its common envelope. */
export function withoutLaterInputs(schema: { properties?: Record<string, unknown>; [key: string]: unknown }) {
  const { later_inputs, ...properties } = schema.properties!;
  expect(later_inputs).toMatchObject({ type: "object", description: LATER_INPUTS_DESCRIPTION });
  expect(later_inputs).not.toHaveProperty("properties");
  return { ...schema, properties };
}

/** Malformed tool calls fail before the domain handler; success schemas cannot describe these error results. */
export function toolInputProblems(result: { isError?: unknown; structuredContent?: unknown; content: unknown }): string[] {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
  const error = JSON.parse((result.content as { text: string }[])[0]!.text);
  expect(error).toMatchObject({ ok: false, error: { code: "invalid_input" }, problems: expect.any(Array) });
  expect(error.problems.length).toBeGreaterThan(0);
  for (const problem of error.problems) expect(problem).toEqual(expect.any(String));
  return error.problems;
}
