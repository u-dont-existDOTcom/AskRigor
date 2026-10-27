import { z } from "zod";
import { NEXT_STEP_KINDS } from "./next-step-kinds.js";
import { REPORT_CODE_NAMES, REPORT_TOOL_NAMES } from "./check-report-vocabulary.js";

/** Compile the actual finalize_research schema's paths; only array positions admit indexes. */
export function reportValueCheck(schema: z.ZodType, protocolVersions: readonly string[]): (value: unknown) => boolean {
  const paths = new Set<string>();
  const visit = (node: unknown, path: string): void => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    const shape = node as Record<string, unknown>;
    if (path !== "") paths.add(path);
    if (typeof shape.properties === "object" && shape.properties !== null) {
      for (const [key, child] of Object.entries(shape.properties)) visit(child, path === "" ? key : `${path}.${key}`);
    }
    if (shape.items !== undefined) visit(shape.items, `${path}[]`);
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      if (Array.isArray(shape[key])) for (const branch of shape[key]) visit(branch, path);
    }
  };
  visit(z.toJSONSchema(schema, { io: "input" }), "");
  const exact = new Set([...REPORT_TOOL_NAMES, ...REPORT_CODE_NAMES, ...NEXT_STEP_KINDS, ...protocolVersions]);
  return (value: unknown): boolean => {
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
    if (typeof value !== "string") return false;
    if (exact.has(value)) return true;
    if (/^(?:0|[1-9][0-9]*)$/u.test(value) && Number.isSafeInteger(Number(value))) return true;
    return paths.has(value.replace(/\[(?:0|[1-9][0-9]*)\]/gu, "[]"));
  };
}
