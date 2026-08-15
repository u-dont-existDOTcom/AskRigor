import { createHash } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

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

export type AutomatedState = "pass" | "fail" | "blocked";

export type FailureClass = "case_contract" | "mcp_discovery" | "mcp_schema" |
  "provider_result" | "model_transport" | "model_tool_selection" |
  "model_output" | "quota_or_rate_limit" | "timeout" |
  "artifact_safety" | "unexpected_internal_error";

export interface OmittedValueEvidence {
  omitted: true;
  byte_length: number;
  sha256: string;
}

export interface SafeCallEvidence {
  tool: string;
  arguments: Record<string, unknown>;
  fields: Record<string, FieldInspection | OmittedValueEvidence>;
  error?: { code: string; message?: string };
}

export interface CaseLaneResult {
  lane: "direct" | "model";
  state: AutomatedState;
  failure_class?: FailureClass;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
  calls: SafeCallEvidence[];
  duration_ms: number;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  returned_model?: string;
}

export interface SafeInventoryEvidence {
  tool_names: string[];
  ordered_names_sha256: string;
  read_only_verified: true;
}

export interface McpToolDescriptor {
  name: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface McpCallResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
}

export interface McpSession {
  listTools(): Promise<{ tools: McpToolDescriptor[] }>;
  callTool(input: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<McpCallResult>;
}

export class McpInputValidationError extends Error {
  override readonly name = "McpInputValidationError";
}

export interface CaseReport {
  id: string;
  group: ReviewGroup;
  direct: CaseLaneResult | null;
  model: CaseLaneResult | null;
  interface_status: "pending" | "pass" | "fail" | "not_applicable";
}

export interface PublicReviewReport {
  schema_version: "askrigor-public-review-eval/v1";
  run_id: string;
  repository: { commit: string; dirty: boolean };
  case_file: { path: string; sha256: string };
  endpoint_origin: "https://mcp.askrigor.com";
  model: { requested: string; returned: string[] };
  started_at: string;
  finished_at: string | null;
  inventory: SafeInventoryEvidence | null;
  cases: CaseReport[];
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  automated_result: "pass" | "fail" | "incomplete";
}

export interface EvidenceWriteOptions {
  outputRoot: string;
  report: PublicReviewReport;
  activeSecret?: string;
}

export interface EvidenceBundlePaths {
  directory: string;
  reportJson: string;
  summaryMarkdown: string;
  sha256Manifest: string;
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

export function digestOmittedValue(value: unknown): OmittedValueEvidence {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized === undefined) throw new Error("cannot digest an undefined value");
  return {
    omitted: true,
    byte_length: Buffer.byteLength(serialized, "utf8"),
    sha256: sha256(serialized),
  };
}

export function assertReadOnlyInventory(
  tools: readonly McpToolDescriptor[],
): SafeInventoryEvidence {
  if (tools.length === 0) throw new Error("MCP tool inventory is empty");
  const names = new Set<string>();
  for (const tool of tools) {
    if (tool.name.length === 0) throw new Error("MCP tool inventory has an empty name");
    if (names.has(tool.name)) throw new Error(`duplicate MCP tool: ${tool.name}`);
    names.add(tool.name);
    if (
      tool.annotations?.readOnlyHint !== true ||
      tool.annotations.destructiveHint !== false ||
      tool.annotations.openWorldHint !== false
    ) {
      throw new Error(`tool ${tool.name} is not strictly read-only`);
    }
  }
  const toolNames = [...names];
  return {
    tool_names: toolNames,
    ordered_names_sha256: sha256(toolNames.join("\n")),
    read_only_verified: true,
  };
}

export async function runDirectCase(
  reviewCase: ReviewCase,
  session: McpSession,
  inventory: SafeInventoryEvidence,
  now: () => number = Date.now,
): Promise<CaseLaneResult> {
  const startedAt = now();
  try {
    if (reviewCase.group === "negative") {
      return await runNegativeDirectCase(reviewCase, session, inventory, startedAt, now);
    }

    const calls: SafeCallEvidence[] = [];
    const results: unknown[] = [];
    const checks: CaseLaneResult["checks"] = [];

    for (const [index, step] of reviewCase.expected_workflow.entries()) {
      if (step.tool === undefined) {
        return failedLane("direct", "case_contract", calls, checks, startedAt, now);
      }
      let argumentsValue: Record<string, unknown>;
      try {
        argumentsValue = resolveStepArguments(step, results);
      } catch {
        return failedLane("direct", "case_contract", calls, checks, startedAt, now);
      }

      let callResult: McpCallResult;
      try {
        callResult = await session.callTool({ name: step.tool, arguments: argumentsValue });
      } catch {
        return failedLane("direct", "provider_result", calls, checks, startedAt, now);
      }
      if (callResult.isError === true || !isRecord(callResult.structuredContent)) {
        return failedLane("direct", "provider_result", calls, checks, startedAt, now);
      }

      const structured = callResult.structuredContent;
      const fields: SafeCallEvidence["fields"] = {};
      let fieldsPass = true;
      for (const path of step.expected_structured_fields ?? []) {
        const inspection = inspectStructuredField(structured, path);
        fields[path] = inspection;
        if (!inspection.present) fieldsPass = false;
      }
      checks.push({ name: `step_${index + 1}_required_fields`, pass: fieldsPass });
      calls.push({
        tool: step.tool,
        arguments: sanitizeArguments(argumentsValue),
        fields,
      });
      results.push(structured);

      if (!fieldsPass) {
        return failedLane("direct", "provider_result", calls, checks, startedAt, now);
      }
    }

    const semanticChecks = validatePositiveSemantics(reviewCase, results);
    checks.push(...semanticChecks);
    if (semanticChecks.some((check) => !check.pass)) {
      return failedLane("direct", "provider_result", calls, checks, startedAt, now);
    }

    return {
      lane: "direct",
      state: "pass",
      checks,
      calls,
      duration_ms: elapsed(startedAt, now()),
    };
  } catch {
    return failedLane("direct", "unexpected_internal_error", [], [], startedAt, now);
  }
}

export function scanEvidenceSafety(value: unknown, activeSecret?: string): void {
  scanEvidenceValue(value, "$", activeSecret);
}

export async function writeEvidenceBundle(
  options: EvidenceWriteOptions,
): Promise<EvidenceBundlePaths> {
  if (!/^[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-[a-f0-9]{8}$/.test(options.report.run_id)) {
    throw new Error("invalid evidence run id");
  }

  scanEvidenceSafety(options.report, options.activeSecret);
  const reportJson = `${JSON.stringify(options.report, null, 2)}\n`;
  const summary = renderEvidenceSummary(options.report);
  scanEvidenceSafety({ summary }, options.activeSecret);

  const outputRoot = resolve(options.outputRoot);
  const directory = join(outputRoot, options.report.run_id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);

  const reportPath = join(directory, "report.json");
  const summaryPath = join(directory, "SUMMARY.md");
  const manifestPath = join(directory, "SHA256SUMS");
  await writeAtomic(reportPath, reportJson);
  await writeAtomic(summaryPath, summary);

  const manifest = [
    `${sha256(reportJson)}  ${basename(reportPath)}`,
    `${sha256(summary)}  ${basename(summaryPath)}`,
  ].join("\n") + "\n";
  await writeAtomic(manifestPath, manifest);

  return {
    directory,
    reportJson: reportPath,
    summaryMarkdown: summaryPath,
    sha256Manifest: manifestPath,
  };
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

function scanEvidenceValue(
  value: unknown,
  path: string,
  activeSecret: string | undefined,
): void {
  if (typeof value === "string") {
    if (
      activeSecret !== undefined &&
      activeSecret.length >= 8 &&
      value.includes(activeSecret)
    ) {
      throw new Error(`evidence contains the active secret at ${path}`);
    }
    if (/sk-[A-Za-z0-9_-]{20,}/.test(value)) {
      throw new Error(`evidence contains a credential-like value at ${path}`);
    }
    if (value.includes("<?xml") || value.includes("<Protocol")) {
      throw new Error(`evidence contains protocol XML at ${path}`);
    }
    if (Buffer.byteLength(value, "utf8") > 2_048) {
      throw new Error(`evidence contains an oversized string at ${path}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanEvidenceValue(entry, `${path}[${index}]`, activeSecret)
    );
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${path}.${key}`;
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === "authorization" ||
      normalizedKey === "api_key" ||
      normalizedKey === "apikey" ||
      normalizedKey === "openai_api_key" ||
      normalizedKey === "continuation_token"
    ) {
      throw new Error(`evidence contains a forbidden key at ${entryPath}`);
    }
    scanEvidenceValue(entry, entryPath, activeSecret);
  }
}

async function runNegativeDirectCase(
  reviewCase: ReviewCase,
  session: McpSession,
  inventory: SafeInventoryEvidence,
  startedAt: number,
  now: () => number,
): Promise<CaseLaneResult> {
  const step = reviewCase.expected_workflow[0];
  if (step === undefined || step.kind === undefined) {
    return failedLane("direct", "case_contract", [], [], startedAt, now);
  }

  if (step.kind === "no_tool_call_for_unsupported_write_or_medical_action") {
    const absent = (step.tools_expected_not_to_exist ?? []).every(
      (name) => !inventory.tool_names.includes(name),
    );
    const checks = [{ name: "unsupported_tools_absent", pass: absent }];
    return absent
      ? {
        lane: "direct",
        state: "pass",
        checks,
        calls: [],
        duration_ms: elapsed(startedAt, now()),
      }
      : failedLane("direct", "mcp_discovery", [], checks, startedAt, now);
  }

  if (step.tool === undefined) {
    return failedLane("direct", "case_contract", [], [], startedAt, now);
  }
  const argumentsValue = step.arguments ?? {};

  if (step.kind === "schema_rejection_before_provider_call") {
    try {
      await session.callTool({ name: step.tool, arguments: argumentsValue });
      return failedLane(
        "direct",
        "mcp_schema",
        [],
        [{ name: "input_schema_rejected", pass: false }],
        startedAt,
        now,
      );
    } catch (error) {
      const pass = error instanceof McpInputValidationError;
      const checks = [{ name: "input_schema_rejected", pass }];
      return pass
        ? {
          lane: "direct",
          state: "pass",
          checks,
          calls: [],
          duration_ms: elapsed(startedAt, now()),
        }
        : failedLane("direct", "mcp_schema", [], checks, startedAt, now);
    }
  }

  if (step.kind === "explicit_not_found") {
    let result: McpCallResult;
    try {
      result = await session.callTool({ name: step.tool, arguments: argumentsValue });
    } catch {
      return failedLane("direct", "provider_result", [], [], startedAt, now);
    }
    const structured = result.structuredContent;
    const pass = isRecord(structured) &&
      structured.provider === "youtube" &&
      structured.access_status === "not_found" &&
      isRecord(structured.data) &&
      Object.keys(structured.data).length === 0;
    const fields: SafeCallEvidence["fields"] = isRecord(structured)
      ? {
        provider: inspectStructuredField(structured, "provider"),
        access_status: inspectStructuredField(structured, "access_status"),
        data: inspectStructuredField(structured, "data"),
      }
      : {};
    const calls = [{
      tool: step.tool,
      arguments: sanitizeArguments(argumentsValue),
      fields,
    }];
    const checks = [{ name: "explicit_empty_not_found", pass }];
    return pass
      ? {
        lane: "direct",
        state: "pass",
        checks,
        calls,
        duration_ms: elapsed(startedAt, now()),
      }
      : failedLane("direct", "provider_result", calls, checks, startedAt, now);
  }

  return failedLane("direct", "case_contract", [], [], startedAt, now);
}

function validatePositiveSemantics(
  reviewCase: ReviewCase,
  results: readonly unknown[],
): CaseLaneResult["checks"] {
  const checks: CaseLaneResult["checks"] = [];
  if (reviewCase.id === "positive-1") {
    const expectedSha = reviewCase.fixture.inputs.expected_sha256;
    if (typeof expectedSha === "string") {
      const matchingDigests = results.every((result) => {
        const digest = getDottedValue(result, "manifest.sha256");
        return digest === undefined || digest === expectedSha;
      });
      checks.push({ name: "protocol_sha256_matches_fixture", pass: matchingDigests });
    }
    const verificationIndex = reviewCase.expected_workflow.findIndex(
      (step) => step.tool === "verify_protocol_integrity",
    );
    if (verificationIndex >= 0) {
      checks.push({
        name: "protocol_integrity_verified",
        pass: getDottedValue(results[verificationIndex], "verified") === true,
      });
    }
    const loadIndex = reviewCase.expected_workflow.findIndex(
      (step) => step.tool === "load_protocol",
    );
    if (loadIndex >= 0) {
      const text = getDottedValue(results[loadIndex], "text");
      checks.push({
        name: "complete_protocol_text_returned",
        pass: typeof text === "string" && text.length > 0,
      });
    }
  }

  if (reviewCase.id === "positive-2") {
    const pmid = reviewCase.fixture.inputs.pmid;
    checks.push({
      name: "pubmed_identity_matches_fixture",
      pass: results.length === 1 &&
        getDottedValue(results[0], "provider") === "pubmed" &&
        getDottedValue(results[0], "primary_identifier") === pmid &&
        getDottedValue(results[0], "data.pmid") === pmid,
    });
  }

  if (reviewCase.id === "positive-3") {
    const nctId = reviewCase.fixture.inputs.nct_id;
    checks.push({
      name: "clinical_trial_identity_matches_fixture",
      pass: results.length === 1 &&
        getDottedValue(results[0], "provider") === "clinicaltrials_gov" &&
        getDottedValue(results[0], "primary_identifier") === nctId &&
        getDottedValue(results[0], "data.nct_id") === nctId,
    });
  }

  if (reviewCase.id === "positive-4") {
    const identifier = reviewCase.fixture.inputs.identifier;
    const returnedDoi = getDottedValue(results[0], "data.doi");
    checks.push({
      name: "crossref_identity_matches_fixture",
      pass: results.length === 1 &&
        getDottedValue(results[0], "provider") === "crossref" &&
        typeof identifier === "string" &&
        typeof returnedDoi === "string" &&
        returnedDoi.toLowerCase() === identifier.toLowerCase(),
    });
  }

  if (reviewCase.id === "positive-5") {
    checks.push({
      name: "youtube_comment_provider_preserved",
      pass: results.length === 1 && getDottedValue(results[0], "provider") === "youtube",
    });
  }

  if (reviewCase.id === "positive-6") {
    const final = results.at(-1);
    checks.push({
      name: "terminal_youtube_audit_receipt",
      pass: getDottedValue(final, "continuation_recommended") === false &&
        getDottedValue(final, "receipt.synthesis_lock") === "pass" &&
        getDottedValue(final, "receipt.completion_state") === "complete",
    });
  }
  return checks;
}

function failedLane(
  lane: "direct" | "model",
  failureClass: FailureClass,
  calls: SafeCallEvidence[],
  checks: CaseLaneResult["checks"],
  startedAt: number,
  now: () => number,
): CaseLaneResult {
  return {
    lane,
    state: "fail",
    failure_class: failureClass,
    checks,
    calls,
    duration_ms: elapsed(startedAt, now()),
  };
}

function sanitizeArguments(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "continuation_token") {
      output.continuation_token_omitted = digestOmittedValue(entry);
    } else if (Array.isArray(entry)) {
      output[key] = entry.map((item) =>
        isRecord(item) ? sanitizeArguments(item) : item
      );
    } else if (isRecord(entry)) {
      output[key] = sanitizeArguments(entry);
    } else {
      output[key] = entry;
    }
  }
  return output;
}

function elapsed(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function renderEvidenceSummary(report: PublicReviewReport): string {
  const directPasses = report.cases.filter((entry) => entry.direct?.state === "pass").length;
  const modelPasses = report.cases.filter((entry) => entry.model?.state === "pass").length;
  return [
    "# AskRigor public review evaluation",
    "",
    `Run: ${report.run_id}`,
    `Commit: ${report.repository.commit}${report.repository.dirty ? " (dirty)" : ""}`,
    `Automated result: ${report.automated_result.toUpperCase()}`,
    `Direct passes: ${directPasses}`,
    `Model passes: ${modelPasses}`,
    `Cases selected: ${report.cases.length}`,
    `Requested model: ${report.model.requested}`,
    `Returned models: ${report.model.returned.join(", ") || "none"}`,
    "ChatGPT interface check: separate manual acceptance",
    "",
  ].join("\n");
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
