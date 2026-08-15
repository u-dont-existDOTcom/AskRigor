import { createHash } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const workflowKindSchema = z.enum([
  "schema_rejection_before_provider_call",
  "explicit_not_found",
  "explicit_access_boundary",
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
    "explicit_access_boundary" |
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
  output_evidence?: OmittedValueEvidence;
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

export interface OpenAiResponsesRequest {
  model: string;
  store: false;
  max_output_tokens: 4096;
  input: string;
  tools: [{
    type: "mcp";
    server_label: "askrigor";
    server_url: "https://mcp.askrigor.com/mcp";
    require_approval: "never";
    allowed_tools: string[];
  }];
}

export interface ResponsesTransport {
  create(request: OpenAiResponsesRequest, signal: AbortSignal): Promise<unknown>;
}

export interface NormalizedMcpCall {
  name: string;
  arguments: Record<string, unknown>;
  structuredContent: Record<string, unknown> | undefined;
  output_evidence: OmittedValueEvidence | undefined;
  error: string | null;
}

export interface NormalizedModelResponse {
  status: "completed";
  model: string;
  calls: NormalizedMcpCall[];
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
}

export interface ModelCaseOptions {
  transport: ResponsesTransport;
  inventory: SafeInventoryEvidence;
  model: string;
  signal: AbortSignal;
  directContractPassed?: boolean;
  directContractCallCount?: number;
  directSchemaRejectionPassed?: boolean;
  now?: () => number;
}

export class OpenAiTransportError extends Error {
  override readonly name = "OpenAiTransportError";

  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`OpenAI transport failed with status ${status}`);
  }
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

export type EvaluationMode = "direct" | "model" | "all";

export interface RunEvaluationOptions {
  reviewCases: ReviewCase[];
  mode: EvaluationMode;
  model: string;
  mcpSession: McpSession;
  responsesTransport?: ResponsesTransport;
  repository: { commit: string; dirty: boolean };
  caseFile: { path: string; sha256: string };
  outputRoot: string;
  runId: string;
  startedAt: string;
  finishedAt: () => string;
  activeSecret?: string;
  now?: () => number;
}

export interface RunEvaluationResult {
  report: PublicReviewReport;
  paths: EvidenceBundlePaths;
  exitCode: 0 | 1;
}

export const REQUEST_TIMEOUT_MS = 45_000;
export const CASE_TIMEOUT_MS = 180_000;
export const FULL_RUN_TIMEOUT_MS = 1_800_000;
export const MAX_OUTPUT_TOKENS = 4_096;

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
        fields[safeFieldEvidenceKey(path)] = inspection;
        const terminalFirstAudit = reviewCase.id === "positive-6" &&
          index === 1 &&
          path === "continuation_token" &&
          structured.continuation_recommended === false;
        if (!inspection.present && !terminalFirstAudit) fieldsPass = false;
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
      if (
        reviewCase.id === "positive-6" &&
        index === 1 &&
        structured.continuation_recommended === false
      ) {
        checks.push({ name: "conditional_continuation_not_required", pass: true });
        break;
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

export function buildResponsesRequest(
  reviewCase: ReviewCase,
  inventory: SafeInventoryEvidence,
  model: string,
): OpenAiResponsesRequest {
  if (inventory.read_only_verified !== true || inventory.tool_names.length === 0) {
    throw new Error("a verified read-only inventory is required");
  }
  if (model.trim().length === 0) throw new Error("model must not be empty");

  let allowedTools: string[];
  const firstStep = reviewCase.expected_workflow[0];
  if (
    reviewCase.group === "negative" &&
    firstStep?.kind === "no_tool_call_for_unsupported_write_or_medical_action"
  ) {
    allowedTools = [...inventory.tool_names];
  } else {
    allowedTools = [];
    for (const step of reviewCase.expected_workflow) {
      if (step.tool !== undefined && !allowedTools.includes(step.tool)) {
        allowedTools.push(step.tool);
      }
    }
  }
  if (allowedTools.length === 0) throw new Error("review case has no allowed tools");
  if (allowedTools.some((name) => !inventory.tool_names.includes(name))) {
    throw new Error("review case requests a tool absent from the verified inventory");
  }

  return {
    model,
    store: false,
    max_output_tokens: 4096,
    input: reviewCase.prompt,
    tools: [{
      type: "mcp",
      server_label: "askrigor",
      server_url: "https://mcp.askrigor.com/mcp",
      require_approval: "never",
      allowed_tools: allowedTools,
    }],
  };
}

export function normalizeMcpCalls(
  response: unknown,
  expectedServerLabel: string,
): NormalizedModelResponse {
  if (!isRecord(response) || response.status !== "completed") {
    throw new Error("OpenAI response did not complete");
  }
  if (typeof response.model !== "string" || response.model.length === 0) {
    throw new Error("OpenAI response has no model identity");
  }
  if (!Array.isArray(response.output)) {
    throw new Error("OpenAI response output is not an array");
  }

  const calls: NormalizedMcpCall[] = [];
  for (const item of response.output) {
    if (!isRecord(item) || item.type !== "mcp_call") continue;
    if (item.server_label !== expectedServerLabel) {
      throw new Error("unexpected MCP server label");
    }
    if (typeof item.name !== "string" || item.name.length === 0) {
      throw new Error("MCP call has no operation name");
    }
    const argumentsValue = parseJsonRecord(item.arguments, "MCP call arguments");
    const error = normalizeMcpCallError(item.error);
    const structuredContent = normalizeOptionalMcpOutput(item.output);
    const outputEvidence = item.output === undefined || item.output === null || item.output === ""
      ? undefined
      : digestOmittedValue(item.output);
    if (error === null && structuredContent === undefined && outputEvidence === undefined) {
      throw new Error("MCP call has no output");
    }
    calls.push({
      name: item.name,
      arguments: argumentsValue,
      structuredContent,
      output_evidence: outputEvidence,
      error,
    });
  }

  return {
    status: "completed",
    model: response.model,
    calls,
    usage: normalizeUsage(response.usage),
  };
}

export async function runModelCase(
  reviewCase: ReviewCase,
  options: ModelCaseOptions,
): Promise<CaseLaneResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let normalized: NormalizedModelResponse;
  try {
    const request = buildResponsesRequest(reviewCase, options.inventory, options.model);
    const response = await options.transport.create(request, options.signal);
    normalized = normalizeMcpCalls(response, "askrigor");
  } catch (error) {
    if (
      error instanceof OpenAiTransportError &&
      (error.status === 429 || error.code === "insufficient_quota")
    ) {
      return blockedLane("quota_or_rate_limit", startedAt, now);
    }
    if (isAbortError(error)) return blockedLane("timeout", startedAt, now);
    return failedLane("model", "model_output", [], [], startedAt, now);
  }

  if (reviewCase.group === "negative") {
    return evaluateNegativeModelCase(reviewCase, normalized, options, startedAt, now);
  }

  const expectedSteps = reviewCase.expected_workflow;
  const safeCalls = projectNormalizedCalls(normalized.calls, expectedSteps);
  const expectedCallCount = reviewCase.id === "positive-6" &&
      options.directContractPassed === true &&
      (options.directContractCallCount === 2 || options.directContractCallCount === 3)
    ? options.directContractCallCount
    : expectedSteps.length;
  if (normalized.calls.length !== expectedCallCount) {
    return failedModelSelection(safeCalls, normalized, startedAt, now);
  }

  const results: unknown[] = [];
  const checks: CaseLaneResult["checks"] = [];
  for (const [index, step] of expectedSteps.slice(0, expectedCallCount).entries()) {
    const call = normalized.calls[index];
    if (step.tool === undefined || call === undefined || call.name !== step.tool) {
      return failedModelSelection(safeCalls, normalized, startedAt, now, checks);
    }
    let argumentsPass: boolean;
    if (containsDynamicReference(step.arguments) && results.some((result) => result === undefined)) {
      argumentsPass = hasBoundedContinuationArgument(call.arguments);
    } else {
      try {
        const expectedArguments = resolveStepArguments(step, results);
        argumentsPass = isDeepStrictEqual(call.arguments, expectedArguments);
      } catch {
        return failedLane("model", "case_contract", safeCalls, checks, startedAt, now);
      }
    }
    checks.push({ name: `step_${index + 1}_arguments`, pass: argumentsPass });
    if (!argumentsPass || call.error !== null) {
      return failedModelSelection(safeCalls, normalized, startedAt, now, checks);
    }
    if (call.structuredContent === undefined) {
      const opaquePass = call.output_evidence !== undefined &&
        options.directContractPassed === true;
      checks.push({ name: `step_${index + 1}_opaque_output_with_direct_proof`, pass: opaquePass });
      if (!opaquePass) {
        return failedModelOutput(safeCalls, normalized, startedAt, now, checks);
      }
      results.push(undefined);
      continue;
    }

    let fieldsPass = true;
    for (const path of step.expected_structured_fields ?? []) {
      const inspection = inspectStructuredField(call.structuredContent, path);
      const terminalFirstAudit = reviewCase.id === "positive-6" &&
        index === 1 &&
        path === "continuation_token" &&
        call.structuredContent.continuation_recommended === false;
      if (!inspection.present && !terminalFirstAudit) fieldsPass = false;
    }
    checks.push({ name: `step_${index + 1}_required_fields`, pass: fieldsPass });
    if (!fieldsPass) {
      return failedModelOutput(safeCalls, normalized, startedAt, now, checks);
    }
    results.push(call.structuredContent);
    if (
      reviewCase.id === "positive-6" &&
      index === 1 &&
      call.structuredContent.continuation_recommended === false
    ) {
      checks.push({ name: "conditional_continuation_not_required", pass: true });
    }
  }

  const semanticChecks = results.some((result) => result === undefined)
    ? [{
      name: "structured_results_verified_by_direct_lane",
      pass: options.directContractPassed === true,
    }]
    : validatePositiveSemantics(reviewCase, results);
  checks.push(...semanticChecks);
  if (semanticChecks.some((check) => !check.pass)) {
    return failedModelOutput(safeCalls, normalized, startedAt, now, checks);
  }

  return {
    lane: "model",
    state: "pass",
    checks,
    calls: safeCalls,
    duration_ms: elapsed(startedAt, now()),
    usage: normalized.usage,
    returned_model: normalized.model,
  };
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

export async function runPublicReviewEvaluation(
  options: RunEvaluationOptions,
): Promise<RunEvaluationResult> {
  const now = options.now ?? Date.now;
  const runStartedAt = now();
  const report: PublicReviewReport = {
    schema_version: "askrigor-public-review-eval/v1",
    run_id: options.runId,
    repository: { ...options.repository },
    case_file: { ...options.caseFile },
    endpoint_origin: "https://mcp.askrigor.com",
    model: { requested: options.model, returned: [] },
    started_at: options.startedAt,
    finished_at: null,
    inventory: null,
    cases: options.reviewCases.map((reviewCase) => ({
      id: reviewCase.id,
      group: reviewCase.group,
      direct: null,
      model: null,
      interface_status: "pending",
    })),
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    automated_result: "incomplete",
  };

  let paths: EvidenceBundlePaths;
  try {
    const { tools } = await options.mcpSession.listTools();
    report.inventory = assertReadOnlyInventory(tools);
    paths = await persistReport(options, report);
  } catch {
    report.finished_at = options.finishedAt();
    report.automated_result = "fail";
    paths = await persistReport(options, report);
    return { report, paths, exitCode: 1 };
  }

  if (options.mode === "direct" || options.mode === "all") {
    for (const [index, reviewCase] of options.reviewCases.entries()) {
      if (now() - runStartedAt > FULL_RUN_TIMEOUT_MS) {
        report.cases[index].direct = timeoutLane("direct");
      } else {
        report.cases[index].direct = await runDirectCase(
          reviewCase,
          options.mcpSession,
          report.inventory,
          now,
        );
      }
      refreshReportAggregates(report, options.mode);
      paths = await persistReport(options, report);
    }
  }

  if (options.mode === "model" || options.mode === "all") {
    for (const [index, reviewCase] of options.reviewCases.entries()) {
      const caseReport = report.cases[index];
      if (now() - runStartedAt > FULL_RUN_TIMEOUT_MS) {
        caseReport.model = timeoutLane("model");
      } else if (options.mode === "all" && caseReport.direct?.state !== "pass") {
        caseReport.model = dependencyBlockedLane(caseReport.direct?.failure_class);
      } else if (options.responsesTransport === undefined) {
        caseReport.model = {
          lane: "model",
          state: "blocked",
          failure_class: "model_transport",
          checks: [],
          calls: [],
          duration_ms: 0,
        };
      } else {
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
        try {
          caseReport.model = await runModelCase(reviewCase, {
            transport: options.responsesTransport,
            inventory: report.inventory,
            model: options.model,
            signal: timeoutController.signal,
            directContractPassed: caseReport.direct?.state === "pass",
            directContractCallCount: caseReport.direct?.calls.length,
            directSchemaRejectionPassed: reviewCase.id === "negative-1" &&
              caseReport.direct?.state === "pass",
            now,
          });
        } finally {
          clearTimeout(timeout);
        }
      }
      refreshReportAggregates(report, options.mode);
      paths = await persistReport(options, report);
    }
  }

  report.finished_at = options.finishedAt();
  refreshReportAggregates(report, options.mode);
  paths = await persistReport(options, report);
  return {
    report,
    paths,
    exitCode: report.automated_result === "pass" ? 0 : 1,
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
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
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
      const result = await session.callTool({ name: step.tool, arguments: argumentsValue });
      const pass = isInputValidationToolResult(result);
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

  if (step.kind === "explicit_access_boundary") {
    let result: McpCallResult;
    try {
      result = await session.callTool({ name: step.tool, arguments: argumentsValue });
    } catch {
      return failedLane("direct", "provider_result", [], [], startedAt, now);
    }
    const structured = result.structuredContent;
    const pass = isRecord(structured) &&
      structured.provider === "youtube" &&
      structured.access_status === "inaccessible" &&
      isRecord(structured.error) &&
      structured.error.code === "youtube_video_not_visible" &&
      Array.isArray(structured.limitations) &&
      structured.limitations.length > 0 &&
      isRecord(structured.data) &&
      Object.keys(structured.data).length === 0;
    const fields: SafeCallEvidence["fields"] = isRecord(structured)
      ? {
        provider: inspectStructuredField(structured, "provider"),
        access_status: inspectStructuredField(structured, "access_status"),
        limitations: inspectStructuredField(structured, "limitations"),
        error_code: inspectStructuredField(structured, "error.code"),
        data: inspectStructuredField(structured, "data"),
      }
      : {};
    const calls = [{
      tool: step.tool,
      arguments: sanitizeArguments(argumentsValue),
      fields,
    }];
    const checks = [{ name: "explicit_video_visibility_boundary", pass }];
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
    const completionState = getDottedValue(final, "receipt.completion_state");
    const expectedVideoId = reviewCase.fixture.inputs.video_id_or_url;
    checks.push({
      name: "youtube_audit_identity_matches_fixture",
      pass: typeof expectedVideoId === "string" &&
        results.length >= 2 &&
        results.slice(1).every((result) => getDottedValue(result, "video_id") === expectedVideoId),
    });
    checks.push({
      name: "terminal_youtube_audit_receipt",
      pass: getDottedValue(final, "continuation_recommended") === false &&
        getDottedValue(final, "receipt.synthesis_lock") === "pass" &&
        (completionState === "api_visible_complete" ||
          completionState === "completed_with_access_boundary"),
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

function evaluateNegativeModelCase(
  reviewCase: ReviewCase,
  normalized: NormalizedModelResponse,
  options: ModelCaseOptions,
  startedAt: number,
  now: () => number,
): CaseLaneResult {
  const step = reviewCase.expected_workflow[0];
  const safeCalls = projectNormalizedCalls(normalized.calls, reviewCase.expected_workflow);
  if (step?.kind === "schema_rejection_before_provider_call") {
    const noCallPass = normalized.calls.length === 0 &&
      options.directSchemaRejectionPassed === true;
    const errorCallPass = normalized.calls.length === 1 &&
      normalized.calls[0]?.name === step.tool &&
      isDeepStrictEqual(normalized.calls[0].arguments, step.arguments ?? {}) &&
      normalized.calls[0].error !== null &&
      normalized.calls[0].structuredContent === undefined;
    const pass = noCallPass || errorCallPass;
    return modelNegativeResult(pass, safeCalls, normalized, "invalid_input_not_upstream",
      startedAt, now);
  }

  if (step?.kind === "explicit_not_found" || step?.kind === "explicit_access_boundary") {
    const call = normalized.calls[0];
    const structured = call?.structuredContent;
    const selectionPass = normalized.calls.length === 1 &&
      call?.name === step.tool &&
      isDeepStrictEqual(call?.arguments, step.arguments ?? {});
    const structuredPass = step.kind === "explicit_not_found"
      ? isRecord(structured) &&
        structured.provider === "youtube" &&
        structured.access_status === "not_found" &&
        isRecord(structured.data) &&
        Object.keys(structured.data).length === 0
      : isRecord(structured) &&
        structured.provider === "youtube" &&
        structured.access_status === "inaccessible" &&
        isRecord(structured.error) &&
        structured.error.code === "youtube_video_not_visible" &&
        Array.isArray(structured.limitations) &&
        structured.limitations.length > 0 &&
        isRecord(structured.data) &&
        Object.keys(structured.data).length === 0;
    const opaquePass = structured === undefined &&
      call?.output_evidence !== undefined &&
      call?.error === null &&
      options.directContractPassed === true;
    const accessBoundaryErrorReceipt = step.kind === "explicit_access_boundary" &&
      structured === undefined &&
      call?.error !== null &&
      options.directContractPassed === true;
    const pass = selectionPass &&
      ((call?.error === null && structuredPass) || opaquePass || accessBoundaryErrorReceipt);
    const checkName = step.kind === "explicit_access_boundary"
      ? "explicit_video_visibility_boundary"
      : "explicit_empty_not_found";
    return modelNegativeResult(pass, safeCalls, normalized, checkName,
      startedAt, now);
  }

  if (step?.kind === "no_tool_call_for_unsupported_write_or_medical_action") {
    const pass = normalized.calls.length === 0;
    return modelNegativeResult(pass, safeCalls, normalized, "unsupported_action_no_call",
      startedAt, now);
  }

  return failedLane("model", "case_contract", safeCalls, [], startedAt, now);
}

function modelNegativeResult(
  pass: boolean,
  calls: SafeCallEvidence[],
  normalized: NormalizedModelResponse,
  checkName: string,
  startedAt: number,
  now: () => number,
): CaseLaneResult {
  const checks = [{ name: checkName, pass }];
  if (!pass) return failedModelSelection(calls, normalized, startedAt, now, checks);
  return {
    lane: "model",
    state: "pass",
    checks,
    calls,
    duration_ms: elapsed(startedAt, now()),
    usage: normalized.usage,
    returned_model: normalized.model,
  };
}

function projectNormalizedCalls(
  calls: readonly NormalizedMcpCall[],
  expectedSteps: readonly WorkflowStep[],
): SafeCallEvidence[] {
  return calls.map((call, index) => {
    const fields: SafeCallEvidence["fields"] = {};
    if (call.structuredContent !== undefined) {
      for (const path of expectedSteps[index]?.expected_structured_fields ?? []) {
        fields[safeFieldEvidenceKey(path)] = inspectStructuredField(
          call.structuredContent,
          path,
        );
      }
    }
    return {
      tool: call.name,
      arguments: sanitizeArguments(call.arguments),
      fields,
      ...(call.output_evidence === undefined
        ? {}
        : { output_evidence: call.output_evidence }),
      ...(call.error === null ? {} : { error: { code: call.error } }),
    };
  });
}

function failedModelSelection(
  calls: SafeCallEvidence[],
  normalized: NormalizedModelResponse,
  startedAt: number,
  now: () => number,
  checks: CaseLaneResult["checks"] = [],
): CaseLaneResult {
  return {
    ...failedLane("model", "model_tool_selection", calls, checks, startedAt, now),
    usage: normalized.usage,
    returned_model: normalized.model,
  };
}

function failedModelOutput(
  calls: SafeCallEvidence[],
  normalized: NormalizedModelResponse,
  startedAt: number,
  now: () => number,
  checks: CaseLaneResult["checks"],
): CaseLaneResult {
  return {
    ...failedLane("model", "model_output", calls, checks, startedAt, now),
    usage: normalized.usage,
    returned_model: normalized.model,
  };
}

function blockedLane(
  failureClass: "quota_or_rate_limit" | "timeout",
  startedAt: number,
  now: () => number,
): CaseLaneResult {
  return {
    lane: "model",
    state: "blocked",
    failure_class: failureClass,
    checks: [],
    calls: [],
    duration_ms: elapsed(startedAt, now()),
  };
}

function timeoutLane(lane: "direct" | "model"): CaseLaneResult {
  return {
    lane,
    state: "blocked",
    failure_class: "timeout",
    checks: [],
    calls: [],
    duration_ms: 0,
  };
}

function dependencyBlockedLane(
  failureClass: FailureClass | undefined,
): CaseLaneResult {
  return {
    lane: "model",
    state: "blocked",
    failure_class: failureClass ?? "provider_result",
    checks: [{ name: "direct_lane_dependency", pass: false }],
    calls: [],
    duration_ms: 0,
  };
}

async function persistReport(
  options: RunEvaluationOptions,
  report: PublicReviewReport,
): Promise<EvidenceBundlePaths> {
  return writeEvidenceBundle({
    outputRoot: options.outputRoot,
    report,
    activeSecret: options.activeSecret,
  });
}

function refreshReportAggregates(
  report: PublicReviewReport,
  mode: EvaluationMode,
): void {
  const requestedResults: CaseLaneResult[] = [];
  const returnedModels = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const reviewCase of report.cases) {
    if (mode === "direct" || mode === "all") {
      if (reviewCase.direct !== null) requestedResults.push(reviewCase.direct);
    }
    if (mode === "model" || mode === "all") {
      if (reviewCase.model !== null) requestedResults.push(reviewCase.model);
      if (reviewCase.model?.returned_model !== undefined) {
        returnedModels.add(reviewCase.model.returned_model);
      }
      if (reviewCase.model?.usage !== undefined) {
        inputTokens += reviewCase.model.usage.input_tokens;
        outputTokens += reviewCase.model.usage.output_tokens;
        totalTokens += reviewCase.model.usage.total_tokens;
      }
    }
  }

  report.model.returned = [...returnedModels];
  report.usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  };

  const expectedResultCount = report.cases.length * (mode === "all" ? 2 : 1);
  if (requestedResults.length < expectedResultCount) {
    report.automated_result = "incomplete";
  } else if (requestedResults.some((result) => result.state === "fail")) {
    report.automated_result = "fail";
  } else if (requestedResults.some((result) => result.state === "blocked")) {
    report.automated_result = "incomplete";
  } else {
    report.automated_result = "pass";
  }
}

function normalizeMcpCallError(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.length > 0) return "mcp_call_error";
  if (isRecord(value) && typeof value.code === "string" && value.code.length > 0) {
    return value.code.slice(0, 100);
  }
  return "mcp_call_error";
}

function normalizeOptionalMcpOutput(
  value: unknown,
): Record<string, unknown> | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(parsed)) throw new Error("MCP call output is not an object");
  if (Object.hasOwn(parsed, "structuredContent")) {
    if (!isRecord(parsed.structuredContent)) {
      throw new Error("MCP structured content is not an object");
    }
    return parsed.structuredContent;
  }
  return parsed;
}

function parseJsonRecord(value: unknown, label: string): Record<string, unknown> {
  const parsed = typeof value === "string" ? parseJsonValue(value, label) : value;
  if (!isRecord(parsed)) throw new Error(`${label} is not an object`);
  return parsed;
}

function parseJsonValue(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function normalizeUsage(value: unknown): NormalizedModelResponse["usage"] {
  if (!isRecord(value)) throw new Error("OpenAI response usage is missing");
  const inputTokens = nonnegativeInteger(value.input_tokens, "input_tokens");
  const outputTokens = nonnegativeInteger(value.output_tokens, "output_tokens");
  const totalTokens = nonnegativeInteger(value.total_tokens, "total_tokens");
  if (inputTokens + outputTokens !== totalTokens) {
    throw new Error("OpenAI response token usage is inconsistent");
  }
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  };
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`OpenAI response ${label} is invalid`);
  }
  return value as number;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

function containsDynamicReference(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("$step_");
  if (Array.isArray(value)) return value.some(containsDynamicReference);
  if (isRecord(value)) return Object.values(value).some(containsDynamicReference);
  return false;
}

function hasBoundedContinuationArgument(
  value: Record<string, unknown>,
): boolean {
  return Object.keys(value).length === 1 &&
    typeof value.continuation_token === "string" &&
    value.continuation_token.length > 0 &&
    value.continuation_token.length <= 65_536;
}

function safeFieldEvidenceKey(path: string): string {
  return path.split(".").map((component) =>
    component === "continuation_token"
      ? "continuation_token_present"
      : component
  ).join(".");
}

function isInputValidationToolResult(result: McpCallResult): boolean {
  if (result.isError !== true || result.structuredContent !== undefined) return false;
  if (!Array.isArray(result.content)) return false;
  return result.content.some((item) =>
    isRecord(item) &&
    item.type === "text" &&
    typeof item.text === "string" &&
    item.text.includes("Input validation error") &&
    item.text.includes("Invalid arguments for tool")
  );
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
