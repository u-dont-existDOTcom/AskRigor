import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  HERMES_AGENT_PIN,
  HERMES_RESEARCH_WORKER_POLICY,
  buildHermesChildEnvironment,
  createHttpPrivateResearchOrchestrationClient,
  loadHermesDevelopmentContext,
  releaseHermesFinalResponse,
  runHermesResearchTask,
  summarizeHermesBenchmark,
  type HermesSemanticExecutor,
  type HermesWorkerRunResult,
  type PrivateResearchOrchestrationClient,
  type PrivateResearchView
} from "../apps/research-mcp/src/hermes-worker-pilot.js";
import {
  deriveProgramSignature
} from "../apps/research-mcp/src/actions/treatment-landscape-coverage-route.js";
import type {
  ResearchFinalizationDecision
} from "../apps/research-mcp/src/actions/research-session-controller.js";

const SESSION = `ars1_${"A".repeat(32)}`;
const STATE_A = "a".repeat(64);
const STATE_B = "b".repeat(64);
const STATE_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);

describe("Hermes bounded worker pilot", () => {
  it("routes semantic and deterministic work but releases output only after a server permit", async () => {
    const views = [
      moduleView(STATE_A),
      deterministicView(STATE_B),
      candidateView(STATE_C),
      finalizableView(HASH_D)
    ];
    const client = sequencedClient(views, authorizedDecision(HASH_D));
    const worker = fixtureWorker();

    const run = await runHermesResearchTask({
      research_target: "de-identified held-out treatment comparison",
      diagnosis_status: "diagnosis_not_specified"
    }, client, worker);

    expect(run).toMatchObject({
      status: "SERVER_AUTHORIZED",
      output_boundary: "FINALIZATION_ALLOWED",
      metrics: {
        controller_transitions: 3,
        deterministic_resume_requests: 1,
        semantic_work_requests: 2,
        skipped_gate_attempts: 0,
        reported_api_calls: 2,
        reported_cost_nano_usd: 34
      }
    });
    expect(client.resume).toHaveBeenCalledTimes(1);
    expect(client.submit).toHaveBeenCalledTimes(2);
    expect(worker.execute).toHaveBeenCalledTimes(2);

    const released = releaseHermesFinalResponse(run, "Permit-bound report.");
    expect(released).toMatchObject({
      released: true,
      session_id: SESSION,
      output_boundary: "FINALIZATION_ALLOWED",
      response: "Permit-bound report."
    });
  });

  it("rejects forged completion fields before any semantic submission", async () => {
    const client = fixedDeniedClient(moduleView(STATE_A));
    const worker: HermesSemanticExecutor = {
      execute: vi.fn(async ({ session_id, state_digest }) => ({
        model_output: {
          contract_version: "askrigor_hermes_semantic_result_v1",
          session_id,
          state_digest,
          work_type: "module_applicability",
          complete: true,
          synthesis_permitted: true,
          completed_operations: ["everything"],
          submission: {
            package_version: "askrigor_module_applicability_v1",
            decisions: [{
              module_id: "FORUM_SIGNAL",
              applicability: "REQUIRED",
              rationale: "The held-out treatment question needs firsthand evidence."
            }]
          }
        },
        diagnostics: diagnostics()
      }))
    };

    const run = await runHermesResearchTask({
      research_target: "de-identified held-out question",
      maximum_transitions: 2
    }, client, worker);
    expect(run.status).toBe("WORKER_OUTPUT_REJECTED");
    expect(run.metrics.skipped_gate_attempts).toBe(1);
    expect(client.submit).not.toHaveBeenCalled();
    expect(() => releaseHermesFinalResponse(run, "Forged completion"))
      .toThrow("AskRigor did not authorize");
  });

  it("rejects stale, cross-session, and cross-frontier semantic results", async () => {
    for (const mutate of [
      (output: Record<string, unknown>) => ({ ...output, session_id: `ars1_${"Z".repeat(32)}` }),
      (output: Record<string, unknown>) => ({ ...output, state_digest: HASH_E }),
      (output: Record<string, unknown>) => ({
        ...output,
        submission: {
          ...(output.submission as Record<string, unknown>),
          discovery_digest: HASH_E
        }
      })
    ]) {
      const view = candidateView(STATE_C);
      const client = fixedDeniedClient(view);
      const valid = candidateModelOutput(view);
      const worker: HermesSemanticExecutor = {
        execute: vi.fn(async () => ({
          model_output: mutate(valid as unknown as Record<string, unknown>),
          diagnostics: diagnostics()
        }))
      };
      const run = await runHermesResearchTask({
        existing_session_id: SESSION,
        maximum_transitions: 1
      }, client, worker);
      expect(run.status).toBe("WORKER_OUTPUT_REJECTED");
      expect(client.submit).not.toHaveBeenCalled();
    }
  });

  it("does not call Hermes for deterministic server work and stops bounded no-progress loops", async () => {
    const view = deterministicView(STATE_B);
    const decision = deniedDecision(STATE_B);
    const client: PrivateResearchOrchestrationClient = {
      start: vi.fn(async () => view),
      status: vi.fn(async () => view),
      resume: vi.fn(async () => view),
      advance: vi.fn(async () => view),
      submit: vi.fn(async () => { throw new Error("unexpected semantic work"); }),
      finalize: vi.fn(async () => decision)
    };
    const worker = fixtureWorker();
    const run = await runHermesResearchTask({
      research_target: "de-identified deterministic continuation fixture",
      maximum_no_progress_transitions: 2
    }, client, worker);
    expect(run.status).toBe("NO_PROGRESS");
    expect(run.metrics).toMatchObject({
      deterministic_resume_requests: 2,
      semantic_work_requests: 0,
      no_progress_transitions: 2
    });
    expect(worker.execute).not.toHaveBeenCalled();
    expect(client.submit).not.toHaveBeenCalled();
  });

  it("never converts a plain denial with no work into success", async () => {
    const client = fixedDeniedClient(finalizableView(STATE_A));
    const run = await runHermesResearchTask({ existing_session_id: SESSION }, client, fixtureWorker());
    expect(run).toMatchObject({
      status: "SERVER_DENIED",
      output_boundary: "CONTINUE_RESEARCH"
    });
    expect(() => releaseHermesFinalResponse(run, "Model says complete"))
      .toThrow("AskRigor did not authorize");
  });

  it("keeps held-out benchmark cost diagnostic and separate from completion authority", () => {
    const runs: HermesWorkerRunResult[] = [
      terminalRun("SERVER_AUTHORIZED", authorizedDecision(STATE_A), 100),
      terminalRun("SERVER_BOUNDED", boundedDecision(STATE_B), 200),
      incompleteRun(STATE_C, 900)
    ];
    const report = summarizeHermesBenchmark(runs);
    expect(report).toEqual({
      benchmark_version: "askrigor_hermes_benchmark_v1",
      tasks: 3,
      server_authorized_tasks: 1,
      server_bounded_tasks: 1,
      incomplete_tasks: 1,
      completion_rate: 2 / 3,
      unnecessary_work_transitions: 1,
      skipped_gate_attempts: 1,
      reported_cost_nano_usd: 1_200,
      cost_is_non_authoritative_diagnostic: true
    });
  });

  it("pins official Hermes and applies a no-tools, no-memory research profile", () => {
    expect(HERMES_AGENT_PIN).toEqual({
      repository: "https://github.com/NousResearch/hermes-agent",
      release: "v2026.8.19",
      package_version: "0.20.5",
      commit: "fcbd1076a93841fa88855acce810e342a5b78101"
    });
    expect(HERMES_RESEARCH_WORKER_POLICY).toMatchObject({
      enabled_toolsets: [],
      skip_memory: true,
      skip_context_files: true,
      skip_background_review: true,
      save_trajectories: false,
      repository_access: "NONE",
      production_secret_access: "NONE",
      finalization_authority: "ASKRIGOR_SERVER_ONLY"
    });
  });

  it("loads exact repository authority for read-only development packages", async () => {
    const root = resolve(import.meta.dirname, "..");
    const context = await loadHermesDevelopmentContext(root);
    expect(context).toMatchObject({
      access_mode: "READ_ONLY_NO_TOOLS",
      main_write_allowed: false,
      production_secret_access: false
    });
    for (const file of context.files) {
      const exact = await readFile(resolve(root, file.repository_path), "utf8");
      expect(file.complete_text).toBe(exact);
      expect(file.sha256).toBe(sha256(exact));
    }
    expect(context.files.map(({ repository_path }) => repository_path)).toEqual([
      "AGENTS.md",
      "project/PROJECT_INSTRUCTIONS.md",
      "protocols/HRP_Full.xml",
      "protocols/Universal_Instructions.xml"
    ]);
  });

  it("keeps the private bearer credential in the transport header, not payload", async () => {
    const key = "dedicated-private-worker-key-long-enough";
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.headers).toMatchObject({ authorization: `Bearer ${key}` });
      expect(init?.body).not.toContain(key);
      return new Response(JSON.stringify(moduleView(STATE_A)), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const client = createHttpPrivateResearchOrchestrationClient({
      baseUrl: new URL("https://askrigor.invalid"),
      apiKey: key,
      fetch: fetcher
    });
    await client.status(SESSION);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("documents the one-shot bridge without storing credentials or enabling tools", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../scripts/hermes-semantic-worker.py"),
      "utf8"
    );
    expect(source).toContain("enabled_toolsets=[]");
    expect(source).toContain("skip_memory=True");
    expect(source).toContain("skip_context_files=True");
    expect(source).toContain("save_trajectories=False");
    expect(source).not.toContain("ASKRIGOR_PRIVATE_ORCHESTRATION_API_KEY");
    expect(source).not.toContain("YOUTUBE_API_KEY");
    expect(source).not.toContain("OPENAI_API_KEY");
  });

  it("builds the child environment from an allowlist and excludes parent production secrets", () => {
    const child = buildHermesChildEnvironment({
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      ASKRIGOR_PRIVATE_ORCHESTRATION_API_KEY: "private-orchestration-secret",
      ASKRIGOR_GEMINI_API_KEY: "server-gemini-secret",
      YOUTUBE_API_KEY: "youtube-secret",
      OPENAI_API_KEY: "unrelated-provider-secret",
      HOME: "/private/home"
    }, {
      hermesCheckout: "/reviewed/hermes",
      provider: "gemini",
      model: "gemini-fixture",
      apiKey: "dedicated-hermes-model-key",
      baseUrl: "https://provider.invalid/v1"
    }, "/tmp/hermes-one-shot");

    expect(child).toEqual({
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      HERMES_HOME: "/tmp/hermes-one-shot",
      HERMES_ASKRIGOR_CHECKOUT: "/reviewed/hermes",
      HERMES_ASKRIGOR_PROVIDER: "gemini",
      HERMES_ASKRIGOR_MODEL: "gemini-fixture",
      HERMES_ASKRIGOR_API_KEY: "dedicated-hermes-model-key",
      HERMES_ASKRIGOR_BASE_URL: "https://provider.invalid/v1"
    });
  });
});

function moduleView(stateDigest: string): PrivateResearchView {
  return view({
    state_digest: stateDigest,
    required_next_capabilities: ["route_module_applicability"],
    semantic_work: {
      kind: "module_applicability",
      package: {
        package_version: "askrigor_module_applicability_v1",
        state_digest: stateDigest,
        unresolved_module_ids: ["FORUM_SIGNAL"]
      }
    }
  });
}

function deterministicView(stateDigest: string): PrivateResearchView {
  return view({
    state_digest: stateDigest,
    required_next_capabilities: ["automated_video_scout"],
    semantic_work: null
  });
}

function candidateView(stateDigest: string): PrivateResearchView {
  const program = {
    components: "named progressive program",
    dose_or_intensity: "program not described",
    frequency: "program not described",
    duration: "program not described",
    supervision: "program not described",
    adherence_or_fidelity: "program not described",
    cointerventions: "program not described",
    stage_or_baseline: "stage described provisionally",
    outcome: "walking outcome at a reported horizon",
    horizon: "reported horizon",
    care_stage: "pre-procedure"
  };
  return view({
    state_digest: stateDigest,
    required_next_capabilities: ["candidate_screening"],
    semantic_work: {
      kind: "candidate_screening",
      package: {
        package_version: "askrigor_candidate_screening_v1",
        state_digest: stateDigest,
        discovery_digest: HASH_D,
        candidates: [{
          video_id: "XpZHKGGCK-o",
          canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
          channel_id: "UC0000000000000000000000",
          channel_title: "Independent channel",
          title: "Distinct treatment account",
          metadata_access_status: "api_visible_complete",
          origins: [{
            source: "GEMINI_SCOUT",
            frontier_id: HASH_E,
            query_ids: ["gemini_query_01"],
            query_linkage: "FRONTIER_LEVEL_ONLY"
          }],
          target_distance: "exact",
          stage_distance: "adjacent",
          provisional_treatment_class: "local mechanical",
          provisional_claim_summary: "A provisional creator claim requiring transcript verification.",
          program,
          program_description_status: "PARTIAL_PROVISIONAL",
          program_signature: deriveProgramSignature(program)
        }]
      }
    }
  });
}

function finalizableView(stateDigest: string): PrivateResearchView {
  return view({ state_digest: stateDigest, required_next_capabilities: [], semantic_work: null });
}

function view(overrides: Partial<PrivateResearchView>): PrivateResearchView {
  return {
    session_id: SESSION,
    state_digest: STATE_A,
    execution_status: "IN_PROGRESS",
    output_boundary: "CONTINUE_RESEARCH",
    finalization_readiness: "CONTINUE_RESEARCH",
    required_next_capabilities: [],
    boundaries: [],
    semantic_work: null,
    safe_diagnostics: {
      scout_candidate_count: 0,
      unresolved_scout_candidate_count: 0
    },
    ...overrides
  };
}

function fixtureWorker(): HermesSemanticExecutor & { execute: ReturnType<typeof vi.fn> } {
  return {
    execute: vi.fn(async ({ session_id, state_digest, semantic_work }) => ({
      model_output: semantic_work.kind === "module_applicability"
        ? {
          contract_version: "askrigor_hermes_semantic_result_v1",
          session_id,
          state_digest,
          work_type: "module_applicability",
          submission: {
            package_version: "askrigor_module_applicability_v1",
            decisions: semantic_work.package.unresolved_module_ids.map((module_id) => ({
              module_id,
              applicability: "REQUIRED",
              rationale: "The bounded held-out comparison requires this module."
            }))
          }
        }
        : candidateModelOutput(view({
          state_digest,
          semantic_work
        })),
      diagnostics: diagnostics()
    }))
  };
}

function candidateModelOutput(viewValue: PrivateResearchView) {
  const work = viewValue.semantic_work;
  if (work?.kind !== "candidate_screening") throw new Error("candidate work required");
  return {
    contract_version: "askrigor_hermes_semantic_result_v1" as const,
    session_id: viewValue.session_id,
    state_digest: viewValue.state_digest,
    work_type: "candidate_screening" as const,
    submission: {
      package_version: "askrigor_candidate_screening_v1" as const,
      discovery_digest: work.package.discovery_digest,
      decisions: work.package.candidates.map(({ video_id }) => ({
        video_id,
        materiality: "MATERIAL" as const,
        redundancy: "DISTINCT" as const,
        selection_status: "SELECTED" as const,
        rationale: "Selected for distinct source-bound implementation value."
      }))
    }
  };
}

function diagnostics() {
  return {
    worker: "hermes_agent" as const,
    upstream_commit: HERMES_AGENT_PIN.commit,
    provider: "fixture-provider",
    model: "fixture-model",
    usage: { api_calls: 1, estimated_cost_nano_usd: 17 }
  };
}

function sequencedClient(
  views: PrivateResearchView[],
  terminalDecision: ResearchFinalizationDecision
): PrivateResearchOrchestrationClient & Record<"resume" | "submit", ReturnType<typeof vi.fn>> {
  let index = 0;
  const current = () => views[index]!;
  return {
    start: vi.fn(async () => current()),
    status: vi.fn(async () => current()),
    resume: vi.fn(async () => {
      index += 1;
      return current();
    }),
    advance: vi.fn(async () => current()),
    submit: vi.fn(async () => {
      index += 1;
      return current();
    }),
    finalize: vi.fn(async () => index === views.length - 1
      ? terminalDecision
      : deniedDecision(current().state_digest))
  };
}

function fixedDeniedClient(viewValue: PrivateResearchView): PrivateResearchOrchestrationClient &
  Record<"resume" | "submit", ReturnType<typeof vi.fn>> {
  return {
    start: vi.fn(async () => viewValue),
    status: vi.fn(async () => viewValue),
    resume: vi.fn(async () => viewValue),
    advance: vi.fn(async () => viewValue),
    submit: vi.fn(async () => viewValue),
    finalize: vi.fn(async () => deniedDecision(viewValue.state_digest))
  };
}

function deniedDecision(stateDigest: string): ResearchFinalizationDecision {
  return {
    session_id: SESSION,
    authorization: "DENIED",
    output_boundary: "CONTINUE_RESEARCH",
    finalization_permit: null,
    denial_reasons: ["REQUIRED_OPERATION_INCOMPLETE"],
    required_next_capabilities: ["automated_video_scout"],
    state_digest: stateDigest
  };
}

function authorizedDecision(stateDigest: string): ResearchFinalizationDecision {
  return terminalDecision("AUTHORIZED", "FINALIZATION_ALLOWED", stateDigest);
}

function boundedDecision(stateDigest: string): ResearchFinalizationDecision {
  return terminalDecision("BOUNDED", "BOUNDED_NONRANKING_ONLY", stateDigest);
}

function terminalDecision(
  authorization: "AUTHORIZED" | "BOUNDED",
  outputBoundary: "FINALIZATION_ALLOWED" | "BOUNDED_NONRANKING_ONLY",
  stateDigest: string
): ResearchFinalizationDecision {
  return {
    session_id: SESSION,
    authorization,
    output_boundary: outputBoundary,
    finalization_permit: {
      permit_version: "askrigor_finalization_permit_v1",
      artifact_kind: authorization === "AUTHORIZED"
        ? "COMPARATIVE_FINALIZATION_PERMIT"
        : "BOUNDED_NONRANKING_REPORT_PERMIT",
      execution_id: SESSION,
      output_boundary: outputBoundary,
      protocol_identities: [{
        protocol: "universal",
        name: "Universal Instructions",
        version: "20.5.14",
        revision_date: "2026-08-18",
        sha256: STATE_A
      }, {
        protocol: "hrp",
        name: "Health Research Protocol",
        version: "20.5.22",
        revision_date: "2026-08-23",
        sha256: STATE_B
      }],
      state_digest: stateDigest,
      authorization_basis_digest: HASH_E,
      limitations_digest: sha256("[]"),
      issued_at: "2026-08-24T00:00:00.000Z",
      expires_at: "2026-08-24T00:15:00.000Z",
      key_id: "fixture-key",
      domain: "askrigor.research.finalization",
      permit_payload_sha256: HASH_D,
      signature: "S".repeat(43)
    },
    reader_facing: {
      permitted_scope: authorization === "AUTHORIZED"
        ? "comparative_synthesis"
        : "bounded_nonranking_report",
      limitations: []
    },
    required_next_capabilities: [],
    state_digest: stateDigest
  };
}

function terminalRun(
  status: "SERVER_AUTHORIZED" | "SERVER_BOUNDED",
  decision: ResearchFinalizationDecision,
  cost: number
): HermesWorkerRunResult {
  return {
    run_version: "askrigor_hermes_worker_run_v1",
    session_id: SESSION,
    status,
    output_boundary: status === "SERVER_AUTHORIZED"
      ? "FINALIZATION_ALLOWED"
      : "BOUNDED_NONRANKING_ONLY",
    decision,
    metrics: metrics(cost, 0, 0)
  };
}

function incompleteRun(stateDigest: string, cost: number): HermesWorkerRunResult {
  return {
    run_version: "askrigor_hermes_worker_run_v1",
    session_id: SESSION,
    status: "WORKER_OUTPUT_REJECTED",
    output_boundary: "CONTINUE_RESEARCH",
    decision: deniedDecision(stateDigest),
    metrics: metrics(cost, 1, 1)
  };
}

function metrics(cost: number, noProgress: number, skipped: number) {
  return {
    controller_transitions: 1,
    deterministic_resume_requests: 0,
    semantic_work_requests: 1,
    no_progress_transitions: noProgress,
    skipped_gate_attempts: skipped,
    reported_api_calls: 1,
    reported_cost_nano_usd: cost
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
