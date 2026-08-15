import { createHash } from "node:crypto";

import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const workflowKindSchema = z.enum([
  "schema_rejection_before_provider_call",
  "explicit_not_found",
  "no_tool_call_for_unsupported_write_or_medical_action",
]);

const workflowStepSchema = z.strictObject({
  kind: workflowKindSchema.optional(),
  tool: z.string().min(1).optional(),
  arguments: jsonObjectSchema.optional(),
  expected_structured_fields: z.array(z.string().min(1)).optional(),
  tools_expected_not_to_exist: z.array(z.string().min(1)).optional(),
}).superRefine((step, context) => {
  if (step.tool === undefined && step.tools_expected_not_to_exist === undefined) {
    context.addIssue({
      code: "custom",
      message: "workflow step requires a tool or tools_expected_not_to_exist",
    });
  }
});

const rawReviewCaseSchema = z.strictObject({
  id: z.string().regex(/^(?:positive|negative)-[1-9][0-9]*$/),
  prompt: z.string().trim().min(1),
  fixture: z.strictObject({
    mode: z.literal("production-public-input"),
    inputs: jsonObjectSchema,
  }),
  expected_workflow: z.array(workflowStepSchema).min(1),
  expected_result_shape: z.strictObject({
    required_fields: z.array(z.string().min(1)).min(1),
  }),
  no_state_change: z.literal(true),
  why_plugin_must_not_complete: z.string().trim().min(1).optional(),
});

const reviewCaseSetSchema = z.strictObject({
  positive: z.array(rawReviewCaseSchema),
  negative: z.array(rawReviewCaseSchema),
});

export type ReviewGroup = "positive" | "negative";

export interface WorkflowStep {
  kind?: "schema_rejection_before_provider_call" | "explicit_not_found" |
    "no_tool_call_for_unsupported_write_or_medical_action";
  tool?: string;
  arguments?: Record<string, unknown>;
  expected_structured_fields?: string[];
  tools_expected_not_to_exist?: string[];
}

export interface ReviewCase {
  group: ReviewGroup;
  id: string;
  prompt: string;
  fixture: {
    mode: "production-public-input";
    inputs: Record<string, unknown>;
  };
  expected_workflow: WorkflowStep[];
  expected_result_shape: { required_fields: string[] };
  no_state_change: true;
  why_plugin_must_not_complete?: string;
}

export interface ReviewCaseSet {
  positive: ReviewCase[];
  negative: ReviewCase[];
}

export interface FieldInspection {
  present: boolean;
  type?: "array" | "boolean" | "null" | "number" | "object" | "string";
  count?: number;
}

export function parseReviewCaseSet(value: unknown): ReviewCaseSet {
  const parsed = reviewCaseSetSchema.parse(value);
  const ids = new Set<string>();

  for (const reviewCase of [...parsed.positive, ...parsed.negative]) {
    if (ids.has(reviewCase.id)) {
      throw new Error(`duplicate review case id: ${reviewCase.id}`);
    }
    ids.add(reviewCase.id);
  }

  const positive = parsed.positive.map((reviewCase) =>
    normalizeCase(reviewCase, "positive")
  );
  const negative = parsed.negative.map((reviewCase) =>
    normalizeCase(reviewCase, "negative")
  );

  return { positive, negative };
}

export function flattenReviewCases(caseSet: ReviewCaseSet): ReviewCase[] {
  return [...caseSet.positive, ...caseSet.negative];
}

export function selectReviewCases(
  caseSet: ReviewCaseSet,
  ids: readonly string[],
): ReviewCase[] {
  const allCases = flattenReviewCases(caseSet);
  if (ids.length === 0) return allCases;

  const requested = new Set(ids);
  for (const id of requested) {
    if (!allCases.some((reviewCase) => reviewCase.id === id)) {
      throw new Error(`unknown review case id: ${id}`);
    }
  }
  return allCases.filter((reviewCase) => requested.has(reviewCase.id));
}

export function inspectStructuredField(
  value: unknown,
  path: string,
): FieldInspection {
  const components = path.split(".");
  if (components.length === 0 || components.some((component) => component === "")) {
    throw new Error(`invalid structured field path: ${path}`);
  }

  let current: unknown[] = [value];
  let arrayCount: number | undefined;

  for (const [index, component] of components.entries()) {
    const isArray = component.endsWith("[]");
    const key = isArray ? component.slice(0, -2) : component;
    if (key === "") throw new Error(`invalid structured field path: ${path}`);

    const next: unknown[] = [];
    for (const candidate of current) {
      if (!isRecord(candidate) || !Object.hasOwn(candidate, key)) {
        return arrayCount === undefined
          ? { present: false }
          : { present: false, count: arrayCount };
      }
      const member = candidate[key];
      if (isArray) {
        if (!Array.isArray(member)) {
          return arrayCount === undefined
            ? { present: false }
            : { present: false, count: arrayCount };
        }
        next.push(...member);
      } else {
        next.push(member);
      }
    }

    if (isArray) arrayCount = next.length;
    current = next;

    if (current.length === 0 && index < components.length - 1) {
      return { present: true, count: 0 };
    }
  }

  const first = current[0];
  const inspection: FieldInspection = { present: true };
  if (first !== undefined || current.length > 0) inspection.type = valueType(first);
  if (arrayCount !== undefined) inspection.count = arrayCount;
  return inspection;
}

export function resolveStepArguments(
  step: WorkflowStep,
  results: readonly unknown[],
): Record<string, unknown> {
  return resolveDynamicValue(step.arguments ?? {}, results) as Record<string, unknown>;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeCase(
  raw: z.infer<typeof rawReviewCaseSchema>,
  group: ReviewGroup,
): ReviewCase {
  if (!raw.id.startsWith(`${group}-`)) {
    throw new Error(`review case ${raw.id} is in the wrong group`);
  }
  if (group === "negative" && raw.why_plugin_must_not_complete === undefined) {
    throw new Error(`negative review case ${raw.id} requires a rationale`);
  }

  for (const [index, step] of raw.expected_workflow.entries()) {
    if (group === "positive") {
      if (
        step.tool === undefined ||
        step.arguments === undefined ||
        step.expected_structured_fields === undefined
      ) {
        throw new Error(
          `positive review case ${raw.id} step ${index + 1} is incomplete`,
        );
      }
    } else if (step.kind === undefined) {
      throw new Error(
        `negative review case ${raw.id} step ${index + 1} requires a kind`,
      );
    }
  }

  return { ...raw, group } as ReviewCase;
}

function resolveDynamicValue(value: unknown, results: readonly unknown[]): unknown {
  if (typeof value === "string" && value.startsWith("$step_")) {
    const match = /^\$step_([1-9][0-9]*)\.([A-Za-z0-9_.]+)$/.exec(value);
    if (match === null) throw new Error(`invalid dynamic argument reference: ${value}`);
    const stepNumber = Number.parseInt(match[1], 10);
    if (stepNumber > results.length) {
      throw new Error(`dynamic argument references missing step ${stepNumber}`);
    }
    const resolved = getDottedValue(results[stepNumber - 1], match[2]);
    if (typeof resolved !== "string" || resolved.length === 0) {
      throw new Error(`dynamic argument step ${stepNumber} did not resolve to a string`);
    }
    return resolved;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveDynamicValue(entry, results));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveDynamicValue(entry, results),
      ]),
    );
  }
  return value;
}

function getDottedValue(value: unknown, path: string): unknown {
  let current = value;
  for (const component of path.split(".")) {
    if (!isRecord(current) || !Object.hasOwn(current, component)) return undefined;
    current = current[component];
  }
  return current;
}

function valueType(value: unknown): FieldInspection["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return typeof value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
