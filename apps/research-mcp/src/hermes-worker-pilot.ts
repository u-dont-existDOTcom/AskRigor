import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  candidateScreeningSubmissionSchema
} from "./actions/research-candidate-frontier.js";
import {
  finalizationDecisionSchema,
  RESEARCH_MODULE_IDS,
  type ResearchFinalizationDecision
} from "./actions/research-session-controller.js";
import {
  PRIVATE_RESEARCH_ORCHESTRATION_PREFIX,
  privateResearchOrchestrationViewSchema
} from "./private-research-orchestration.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sessionId = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

export const HERMES_AGENT_PIN = Object.freeze({
  repository: "https://github.com/NousResearch/hermes-agent",
  release: "v2026.8.19",
  package_version: "0.20.5",
  commit: "fcbd1076a93841fa88855acce810e342a5b78101"
} as const);

export const HERMES_RESEARCH_WORKER_POLICY = Object.freeze({
  policy_version: "askrigor_hermes_research_policy_v1",
  enabled_toolsets: [] as readonly string[],
  skip_memory: true,
  skip_context_files: true,
  skip_background_review: true,
  save_trajectories: false,
  repository_access: "NONE",
  production_secret_access: "NONE",
  finalization_authority: "ASKRIGOR_SERVER_ONLY"
} as const);

const moduleDecisionSchema = z.object({
  module_id: z.enum(RESEARCH_MODULE_IDS),
  applicability: z.enum(["REQUIRED", "NOT_REQUIRED"]),
  rationale: bounded(1_000)
}).strict();

const moduleSubmissionSchema = z.object({
  package_version: z.literal("askrigor_module_applicability_v1"),
  decisions: z.array(moduleDecisionSchema).min(1).max(RESEARCH_MODULE_IDS.length)
}).strict();

const hermesModuleOutputSchema = z.object({
  contract_version: z.literal("askrigor_hermes_semantic_result_v1"),
  session_id: sessionId,
  state_digest: digest,
  work_type: z.literal("module_applicability"),
  submission: moduleSubmissionSchema
}).strict();

const hermesCandidateOutputSchema = z.object({
  contract_version: z.literal("askrigor_hermes_semantic_result_v1"),
  session_id: sessionId,
  state_digest: digest,
  work_type: z.literal("candidate_screening"),
  submission: candidateScreeningSubmissionSchema
}).strict();

export const hermesSemanticModelOutputSchema = z.discriminatedUnion(
  "work_type",
  [hermesModuleOutputSchema, hermesCandidateOutputSchema]
);

const workerUsageSchema = z.object({
  api_calls: z.number().int().nonnegative().max(1_000),
  input_tokens: z.number().int().nonnegative().max(100_000_000).optional(),
  output_tokens: z.number().int().nonnegative().max(100_000_000).optional(),
  estimated_cost_nano_usd:
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()
}).strict();

export const hermesSemanticExecutionSchema = z.object({
  model_output: hermesSemanticModelOutputSchema,
  diagnostics: z.object({
    worker: z.literal("hermes_agent"),
    upstream_commit: z.literal(HERMES_AGENT_PIN.commit),
    provider: bounded(100),
    model: bounded(200),
    usage: workerUsageSchema
  }).strict()
}).strict();

export type HermesSemanticExecution = z.output<
  typeof hermesSemanticExecutionSchema
>;
export type PrivateResearchView = z.output<
  typeof privateResearchOrchestrationViewSchema
>;

export interface HermesSemanticExecutor {
  execute(input: {
    session_id: string;
    state_digest: string;
    research_context?: string;
    semantic_work: NonNullable<PrivateResearchView["semantic_work"]>;
  }): Promise<unknown>;
}

export interface PrivateResearchOrchestrationClient {
  start(input: {
    research_target: string;
    diagnosis_status: "diagnosis_not_specified" | "user_supplied_diagnosis";
  }): Promise<PrivateResearchView>;
  status(sessionId: string): Promise<PrivateResearchView>;
  resume(sessionId: string): Promise<PrivateResearchView>;
  submit(input: {
    session_id: string;
    state_digest: string;
    work_type: "module_applicability" | "candidate_screening";
    submission: unknown;
  }): Promise<PrivateResearchView>;
  finalize(sessionId: string): Promise<ResearchFinalizationDecision>;
}

const runMetricsSchema = z.object({
  controller_transitions: z.number().int().nonnegative(),
  deterministic_resume_requests: z.number().int().nonnegative(),
  semantic_work_requests: z.number().int().nonnegative(),
  no_progress_transitions: z.number().int().nonnegative(),
  skipped_gate_attempts: z.number().int().nonnegative(),
  reported_api_calls: z.number().int().nonnegative(),
  reported_cost_nano_usd: z.number().int().nonnegative()
}).strict();

const terminalRunSchema = z.object({
  run_version: z.literal("askrigor_hermes_worker_run_v1"),
  session_id: sessionId,
  status: z.enum(["SERVER_AUTHORIZED", "SERVER_BOUNDED"]),
  output_boundary: z.enum(["FINALIZATION_ALLOWED", "BOUNDED_NONRANKING_ONLY"]),
  decision: finalizationDecisionSchema,
  metrics: runMetricsSchema
}).strict().superRefine((run, context) => {
  if (run.decision.authorization === "DENIED") {
    context.addIssue({ code: "custom", message: "A denied decision cannot complete a Hermes task" });
  }
  const expected = run.status === "SERVER_AUTHORIZED"
    ? "FINALIZATION_ALLOWED"
    : "BOUNDED_NONRANKING_ONLY";
  if (run.output_boundary !== expected || run.decision.output_boundary !== expected) {
    context.addIssue({ code: "custom", message: "Hermes task status must match the server permit boundary" });
  }
});

const incompleteRunSchema = z.object({
  run_version: z.literal("askrigor_hermes_worker_run_v1"),
  session_id: sessionId,
  status: z.enum([
    "SERVER_DENIED",
    "WORKER_OUTPUT_REJECTED",
    "NO_PROGRESS",
    "TRANSITION_LIMIT_EXHAUSTED"
  ]),
  output_boundary: z.enum(["CONTINUE_RESEARCH", "BOUNDED_NONRANKING_ONLY"]),
  decision: finalizationDecisionSchema,
  metrics: runMetricsSchema
}).strict().superRefine((run, context) => {
  if (run.decision.authorization !== "DENIED") {
    context.addIssue({ code: "custom", message: "Incomplete Hermes tasks require a server denial" });
  }
});

export const hermesWorkerRunResultSchema = z.discriminatedUnion("status", [
  terminalRunSchema,
  incompleteRunSchema
]);

export type HermesWorkerRunResult = z.output<typeof hermesWorkerRunResultSchema>;

export interface RunHermesResearchTaskInput {
  existing_session_id?: string;
  research_target?: string;
  deidentified_research_context?: string;
  diagnosis_status?: "diagnosis_not_specified" | "user_supplied_diagnosis";
  maximum_transitions?: number;
  maximum_no_progress_transitions?: number;
}

/**
 * Controller-driven Hermes pilot. The worker never selects the next operation,
 * never invokes deterministic providers, and never decides completion.
 */
export async function runHermesResearchTask(
  rawInput: RunHermesResearchTaskInput,
  client: PrivateResearchOrchestrationClient,
  worker: HermesSemanticExecutor
): Promise<HermesWorkerRunResult> {
  const input = normalizeRunInput(rawInput);
  let view = !("existing_session_id" in input)
    ? await client.start({
      research_target: input.research_target!,
      diagnosis_status: input.diagnosis_status
    })
    : await client.status(input.existing_session_id);
  let decision = await client.finalize(view.session_id);
  const metrics = {
    controller_transitions: 0,
    deterministic_resume_requests: 0,
    semantic_work_requests: 0,
    no_progress_transitions: 0,
    skipped_gate_attempts: 0,
    reported_api_calls: 0,
    reported_cost_nano_usd: 0
  };
  let consecutiveNoProgress = 0;

  for (let transition = 0; transition < input.maximum_transitions; transition += 1) {
    const terminal = terminalResultOrNull(view.session_id, decision, metrics);
    if (terminal !== null) return terminal;

    // Finalization rechecks protocol identity and may update the digest. Always
    // re-read the authoritative view before submitting exact state-bound work.
    view = await client.status(view.session_id);
    const priorDigest = view.state_digest;
    if (view.semantic_work !== null) {
      if (
        view.semantic_work.kind === "module_applicability" &&
        input.research_context === undefined
      ) {
        metrics.skipped_gate_attempts += 1;
        return incompleteResult("WORKER_OUTPUT_REJECTED", decision, metrics);
      }
      metrics.semantic_work_requests += 1;
      let execution: HermesSemanticExecution;
      try {
        const parsedExecution = hermesSemanticExecutionSchema.parse(await worker.execute({
          session_id: view.session_id,
          state_digest: view.state_digest,
          ...(input.research_context === undefined
            ? {}
            : { research_context: input.research_context }),
          semantic_work: view.semantic_work
        }));
        assertWorkerBinding(view, parsedExecution.model_output);
        // Re-assign only after the strict worker and exact package binding pass.
        execution = parsedExecution;
      } catch {
        metrics.skipped_gate_attempts += 1;
        return incompleteResult("WORKER_OUTPUT_REJECTED", decision, metrics);
      }
      metrics.reported_api_calls += execution.diagnostics.usage.api_calls;
      metrics.reported_cost_nano_usd +=
        execution.diagnostics.usage.estimated_cost_nano_usd ?? 0;
      view = await client.submit({
        session_id: view.session_id,
        state_digest: view.state_digest,
        work_type: execution.model_output.work_type,
        submission: execution.model_output.submission
      });
    } else if (view.required_next_capabilities.length > 0) {
      metrics.deterministic_resume_requests += 1;
      view = await client.resume(view.session_id);
    } else {
      return incompleteResult("SERVER_DENIED", decision, metrics);
    }
    metrics.controller_transitions += 1;
    if (view.state_digest === priorDigest) {
      consecutiveNoProgress += 1;
      metrics.no_progress_transitions += 1;
    } else {
      consecutiveNoProgress = 0;
    }
    decision = await client.finalize(view.session_id);
    if (consecutiveNoProgress >= input.maximum_no_progress_transitions) {
      const terminal = terminalResultOrNull(view.session_id, decision, metrics);
      return terminal ?? incompleteResult("NO_PROGRESS", decision, metrics);
    }
  }
  return incompleteResult("TRANSITION_LIMIT_EXHAUSTED", decision, metrics);
}

export const releasedHermesResponseSchema = z.object({
  release_version: z.literal("askrigor_hermes_final_response_v1"),
  released: z.literal(true),
  session_id: sessionId,
  output_boundary: z.enum(["FINALIZATION_ALLOWED", "BOUNDED_NONRANKING_ONLY"]),
  permit_payload_sha256: digest,
  response: bounded(100_000)
}).strict();

/** Fail closed: prose exists only after a server permit is present and bound. */
export function releaseHermesFinalResponse(
  run: HermesWorkerRunResult,
  response: string
): z.output<typeof releasedHermesResponseSchema> {
  const parsed = hermesWorkerRunResultSchema.parse(run);
  if (
    parsed.status !== "SERVER_AUTHORIZED" &&
    parsed.status !== "SERVER_BOUNDED"
  ) {
    throw new Error("AskRigor did not authorize a final response");
  }
  if (parsed.decision.authorization === "DENIED") {
    throw new Error("AskRigor did not issue a finalization permit");
  }
  return releasedHermesResponseSchema.parse({
    release_version: "askrigor_hermes_final_response_v1",
    released: true,
    session_id: parsed.session_id,
    output_boundary: parsed.output_boundary,
    permit_payload_sha256:
      parsed.decision.finalization_permit.permit_payload_sha256,
    response
  });
}

export function createHttpPrivateResearchOrchestrationClient(input: {
  baseUrl: URL;
  apiKey: string;
  fetch?: typeof fetch;
}): PrivateResearchOrchestrationClient {
  const baseUrl = new URL(input.baseUrl);
  const apiKey = input.apiKey.trim();
  const fetcher = input.fetch ?? fetch;
  if (!/^https?:$/u.test(baseUrl.protocol) || apiKey.length < 32) {
    throw new Error("Invalid private orchestration client configuration");
  }
  const post = async (suffix: string, body: unknown): Promise<unknown> => {
    const response = await fetcher(
      new URL(`${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}${suffix}`, baseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    const payload: unknown = await response.json();
    if (!response.ok) throw new PrivateOrchestrationClientError(response.status);
    return payload;
  };
  const client: PrivateResearchOrchestrationClient = {
    async start(body) {
      return privateResearchOrchestrationViewSchema.parse(await post("/start", body));
    },
    async status(id) {
      return privateResearchOrchestrationViewSchema.parse(
        await post("/status", { session_id: sessionId.parse(id) })
      );
    },
    async resume(id) {
      return privateResearchOrchestrationViewSchema.parse(
        await post("/resume", { session_id: sessionId.parse(id) })
      );
    },
    async submit(body) {
      return privateResearchOrchestrationViewSchema.parse(await post("/submit", body));
    },
    async finalize(id) {
      return finalizationDecisionSchema.parse(
        await post("/finalize", { session_id: sessionId.parse(id) })
      );
    }
  };
  return Object.freeze(client);
}

export class PrivateOrchestrationClientError extends Error {
  constructor(public readonly status: number) {
    super("Private AskRigor orchestration request failed");
    this.name = "PrivateOrchestrationClientError";
  }
}

export interface HermesProcessExecutorConfig {
  hermesCheckout: string;
  pythonExecutable: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  estimatedCostNanoUsd?: number;
}

/**
 * Launches one fresh, no-tools, no-memory official Hermes process per package.
 * The provider key is child-environment-only and is never placed in argv.
 */
export function createHermesProcessSemanticExecutor(
  rawConfig: HermesProcessExecutorConfig
): HermesSemanticExecutor {
  const config = normalizeProcessConfig(rawConfig);
  const executor: HermesSemanticExecutor = {
    async execute(input) {
      await assertPinnedHermesRuntime(
        config.hermesCheckout,
        config.pythonExecutable
      );
      const workerDirectory = await mkdtemp(join(tmpdir(), "askrigor-hermes-"));
      try {
        const output = await runHermesProcess(config, workerDirectory, input);
        return hermesSemanticExecutionSchema.parse({
          model_output: output.model_output,
          diagnostics: {
            worker: "hermes_agent",
            upstream_commit: HERMES_AGENT_PIN.commit,
            provider: config.provider,
            model: config.model,
            usage: {
              api_calls: output.api_calls,
              ...(config.estimatedCostNanoUsd === undefined
                ? {}
                : { estimated_cost_nano_usd: config.estimatedCostNanoUsd })
            }
          }
        });
      } finally {
        await rm(workerDirectory, { recursive: true, force: true });
      }
    }
  };
  return Object.freeze(executor);
}

const developmentContextSchema = z.object({
  context_version: z.literal("askrigor_hermes_development_context_v1"),
  access_mode: z.literal("READ_ONLY_NO_TOOLS"),
  main_write_allowed: z.literal(false),
  production_secret_access: z.literal(false),
  files: z.array(z.object({
    repository_path: z.enum([
      "AGENTS.md",
      "project/PROJECT_INSTRUCTIONS.md",
      "protocols/HRP_Full.xml",
      "protocols/Universal_Instructions.xml"
    ]),
    sha256: digest,
    complete_text: z.string().min(1)
  }).strict()).length(4)
}).strict();

/** Build exact, memory-independent authority context for a development task. */
export async function loadHermesDevelopmentContext(repositoryRoot: string) {
  const paths = [
    "AGENTS.md",
    "project/PROJECT_INSTRUCTIONS.md",
    "protocols/HRP_Full.xml",
    "protocols/Universal_Instructions.xml"
  ] as const;
  const files = await Promise.all(paths.map(async (repositoryPath) => {
    const completeText = await readFile(resolve(repositoryRoot, repositoryPath), "utf8");
    return {
      repository_path: repositoryPath,
      sha256: sha256(completeText),
      complete_text: completeText
    };
  }));
  return developmentContextSchema.parse({
    context_version: "askrigor_hermes_development_context_v1",
    access_mode: "READ_ONLY_NO_TOOLS",
    main_write_allowed: false,
    production_secret_access: false,
    files
  });
}

export const hermesBenchmarkReportSchema = z.object({
  benchmark_version: z.literal("askrigor_hermes_benchmark_v1"),
  tasks: z.number().int().positive(),
  server_authorized_tasks: z.number().int().nonnegative(),
  server_bounded_tasks: z.number().int().nonnegative(),
  incomplete_tasks: z.number().int().nonnegative(),
  completion_rate: z.number().min(0).max(1),
  unnecessary_work_transitions: z.number().int().nonnegative(),
  skipped_gate_attempts: z.number().int().nonnegative(),
  reported_cost_nano_usd: z.number().int().nonnegative(),
  cost_is_non_authoritative_diagnostic: z.literal(true)
}).strict();

export function summarizeHermesBenchmark(runs: readonly HermesWorkerRunResult[]) {
  if (runs.length === 0) throw new Error("Hermes benchmark requires held-out runs");
  const parsed = runs.map((run) => hermesWorkerRunResultSchema.parse(run));
  const authorized = parsed.filter(({ status }) => status === "SERVER_AUTHORIZED").length;
  const boundedCount = parsed.filter(({ status }) => status === "SERVER_BOUNDED").length;
  return hermesBenchmarkReportSchema.parse({
    benchmark_version: "askrigor_hermes_benchmark_v1",
    tasks: parsed.length,
    server_authorized_tasks: authorized,
    server_bounded_tasks: boundedCount,
    incomplete_tasks: parsed.length - authorized - boundedCount,
    completion_rate: (authorized + boundedCount) / parsed.length,
    unnecessary_work_transitions: parsed.reduce(
      (total, run) => total + run.metrics.no_progress_transitions,
      0
    ),
    skipped_gate_attempts: parsed.reduce(
      (total, run) => total + run.metrics.skipped_gate_attempts,
      0
    ),
    reported_cost_nano_usd: parsed.reduce(
      (total, run) => total + run.metrics.reported_cost_nano_usd,
      0
    ),
    cost_is_non_authoritative_diagnostic: true
  });
}

function normalizeRunInput(input: RunHermesResearchTaskInput) {
  const maximumTransitions = input.maximum_transitions ?? 128;
  const maximumNoProgressTransitions = input.maximum_no_progress_transitions ?? 2;
  if (
    !Number.isSafeInteger(maximumTransitions) || maximumTransitions < 1 ||
    !Number.isSafeInteger(maximumNoProgressTransitions) ||
    maximumNoProgressTransitions < 1
  ) throw new Error("Invalid Hermes worker run limit");
  if (input.existing_session_id !== undefined) {
    if (input.research_target !== undefined) {
      throw new Error("A resumed Hermes run cannot replace its research target");
    }
    return {
      existing_session_id: sessionId.parse(input.existing_session_id),
      ...(input.deidentified_research_context === undefined
        ? {}
        : { research_context: bounded(1_000).parse(input.deidentified_research_context) }),
      diagnosis_status: "diagnosis_not_specified" as const,
      maximum_transitions: maximumTransitions,
      maximum_no_progress_transitions: maximumNoProgressTransitions
    };
  }
  return {
    research_target: bounded(1_000).parse(input.research_target),
    research_context: bounded(1_000).parse(input.research_target),
    diagnosis_status: input.diagnosis_status ?? "diagnosis_not_specified" as const,
    maximum_transitions: maximumTransitions,
    maximum_no_progress_transitions: maximumNoProgressTransitions
  };
}

function assertWorkerBinding(
  view: PrivateResearchView,
  output: z.output<typeof hermesSemanticModelOutputSchema>
): void {
  if (
    output.session_id !== view.session_id ||
    output.state_digest !== view.state_digest ||
    output.work_type !== view.semantic_work?.kind
  ) throw new Error("Hermes semantic result is bound to another work package");
  if (
    output.work_type === "candidate_screening" &&
    view.semantic_work?.kind === "candidate_screening" &&
    output.submission.discovery_digest !==
      view.semantic_work.package.discovery_digest
  ) throw new Error("Hermes candidate result is bound to another frontier");
}

function terminalResultOrNull(
  id: string,
  decision: ResearchFinalizationDecision,
  metrics: z.output<typeof runMetricsSchema>
): HermesWorkerRunResult | null {
  const parsed = finalizationDecisionSchema.parse(decision);
  if (parsed.authorization === "DENIED") return null;
  return hermesWorkerRunResultSchema.parse({
    run_version: "askrigor_hermes_worker_run_v1",
    session_id: sessionId.parse(id),
    status: parsed.authorization === "AUTHORIZED"
      ? "SERVER_AUTHORIZED"
      : "SERVER_BOUNDED",
    output_boundary: parsed.output_boundary,
    decision: parsed,
    metrics
  });
}

function incompleteResult(
  status: "SERVER_DENIED" | "WORKER_OUTPUT_REJECTED" | "NO_PROGRESS" |
    "TRANSITION_LIMIT_EXHAUSTED",
  decision: ResearchFinalizationDecision,
  metrics: z.output<typeof runMetricsSchema>
): HermesWorkerRunResult {
  const parsed = finalizationDecisionSchema.parse(decision);
  if (parsed.authorization !== "DENIED") {
    throw new Error("An authorized server decision cannot become an incomplete worker result");
  }
  return hermesWorkerRunResultSchema.parse({
    run_version: "askrigor_hermes_worker_run_v1",
    session_id: parsed.session_id,
    status,
    output_boundary: parsed.output_boundary,
    decision: parsed,
    metrics
  });
}

function normalizeProcessConfig(config: HermesProcessExecutorConfig) {
  const timeoutMs = config.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error("Invalid Hermes process timeout");
  }
  if (
    config.apiKey.trim().length < 8 ||
    config.provider.trim().length === 0 ||
    config.model.trim().length === 0
  ) throw new Error("Incomplete Hermes model configuration");
  if (
    config.estimatedCostNanoUsd !== undefined &&
    (!Number.isSafeInteger(config.estimatedCostNanoUsd) ||
      config.estimatedCostNanoUsd < 0)
  ) throw new Error("Invalid Hermes cost estimate");
  const checkout = resolve(config.hermesCheckout);
  return {
    hermesCheckout: checkout,
    pythonExecutable: resolve(config.pythonExecutable),
    provider: bounded(100).parse(config.provider),
    model: bounded(200).parse(config.model),
    apiKey: config.apiKey,
    ...(config.baseUrl === undefined ? {} : { baseUrl: new URL(config.baseUrl).toString() }),
    timeoutMs,
    ...(config.estimatedCostNanoUsd === undefined
      ? {}
      : { estimatedCostNanoUsd: config.estimatedCostNanoUsd })
  };
}

async function assertPinnedHermesRuntime(
  checkout: string,
  pythonExecutable: string
): Promise<void> {
  const [checkoutRealPath, pythonRealPath] = await Promise.all([
    realpath(checkout),
    realpath(pythonExecutable)
  ]);
  const pythonRelativePath = relative(checkoutRealPath, pythonRealPath);
  if (
    pythonRelativePath === "" ||
    (!pythonRelativePath.startsWith(`..${sep}`) &&
      pythonRelativePath !== ".." &&
      !isAbsolute(pythonRelativePath))
  ) {
    throw new Error("Hermes Python environment must be outside the reviewed checkout");
  }
  const actual = (await execFilePromise("git", ["-C", checkout, "rev-parse", "HEAD"]))
    .trim();
  if (actual !== HERMES_AGENT_PIN.commit) {
    throw new Error("Hermes checkout does not match the reviewed upstream commit");
  }
  const dirty = await execFilePromise("git", [
    "-C", checkout, "status", "--porcelain", "--untracked-files=all"
  ]);
  if (dirty.trim().length > 0) {
    throw new Error("Hermes checkout must be clean before execution");
  }
}

async function runHermesProcess(
  config: ReturnType<typeof normalizeProcessConfig>,
  workerDirectory: string,
  input: Parameters<HermesSemanticExecutor["execute"]>[0]
): Promise<{ model_output: unknown; api_calls: number }> {
  const script = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../scripts/hermes-semantic-worker.py"
  );
  const environment = buildHermesChildEnvironment(
    process.env,
    config,
    workerDirectory
  );
  const output = await spawnJsonProcess(
    config.pythonExecutable,
    [script],
    input,
    environment,
    workerDirectory,
    config.timeoutMs
  );
  return z.object({
    model_output: z.unknown(),
    api_calls: z.number().int().nonnegative().max(1_000)
  }).strict().parse(output);
}

/**
 * Construct the complete child environment. Parent credentials are excluded
 * unless they are one of the explicitly copied process settings below; the
 * model credential is injected from the dedicated worker configuration.
 */
export function buildHermesChildEnvironment(
  parent: NodeJS.ProcessEnv,
  config: Pick<ReturnType<typeof normalizeProcessConfig>,
    "hermesCheckout" | "provider" | "model" | "apiKey" | "baseUrl">,
  workerDirectory: string
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR"
  ]) {
    if (parent[key] !== undefined) environment[key] = parent[key];
  }
  Object.assign(environment, {
    HERMES_HOME: workerDirectory,
    HERMES_ASKRIGOR_CHECKOUT: config.hermesCheckout,
    HERMES_ASKRIGOR_PROVIDER: config.provider,
    HERMES_ASKRIGOR_MODEL: config.model,
    HERMES_ASKRIGOR_API_KEY: config.apiKey,
    ...(config.baseUrl === undefined
      ? {}
      : { HERMES_ASKRIGOR_BASE_URL: config.baseUrl })
  });
  return environment;
}

function spawnJsonProcess(
  executable: string,
  args: readonly string[],
  input: unknown,
  environment: NodeJS.ProcessEnv,
  cwd: string,
  timeoutMs: number
): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [...args], {
      cwd,
      env: environment,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const maximumBytes = 512 * 1_024;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Hermes semantic worker timed out"));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > maximumBytes) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, "utf8") > 16 * 1_024) child.kill("SIGKILL");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const diagnostic = /^Hermes semantic worker failed: ([A-Z_a-z][A-Za-z0-9_]*)\s*$/u
          .exec(stderr)?.[1];
        reject(new Error(diagnostic === undefined
          ? "Hermes semantic worker process failed"
          : `Hermes semantic worker process failed (${diagnostic})`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        reject(new Error("Hermes semantic worker returned invalid JSON"));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function execFilePromise(executable: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(executable, [...args], { encoding: "utf8" }, (error, stdout) => {
      if (error !== null) reject(error);
      else resolvePromise(stdout);
    });
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
