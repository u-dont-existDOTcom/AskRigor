import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";

import { createControlledResearchRoutes } from
  "../apps/research-mcp/src/actions/controlled-research-route.js";
import { CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID } from
  "../apps/research-mcp/src/custom-gpt-acceptance-receipt.js";
import {
  RESEARCH_MODULE_IDS,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutProgress,
  recordNativeYoutubeDiscovery
} from
  "../apps/research-mcp/src/actions/research-session-controller.js";
import { createResearchSessionStore } from
  "../apps/research-mcp/src/actions/research-session-store.js";
import type { ActionRoute } from
  "../apps/research-mcp/src/actions/types.js";

const SECRET = "controlled-research-route-test-secret-32-bytes";

describe("controlled research Action projection", () => {
  it("rejects caller completion injection and stale state", async () => {
    const routes = testRoutes();
    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence about several approaches to chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    expect(started.status).toBe(200);
    const view = started.body as Record<string, unknown>;
    const sessionId = view.session_id as string;
    const stateDigest = view.state_digest as string;

    const injected = await call(routes, "continue_research_session", {
      session_id: sessionId,
      state_digest: stateDigest,
      complete: true,
      completed_operations: ["all"]
    });
    expect(injected).toMatchObject({
      status: 422,
      body: { error: { code: "action_input_invalid" } }
    });

    const stale = await call(routes, "continue_research_session", {
      session_id: sessionId,
      state_digest: "f".repeat(64)
    });
    expect(stale).toMatchObject({
      status: 409,
      body: { error: { code: "research_session_state_stale" } }
    });
  });

  it("advances semantic work only with the exact terminal evidence receipt", async () => {
    const routes = testRoutes();
    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence comparing treatment programs for chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    const startedView = started.body as any;
    const firstWork = await call(routes, "continue_research_session", {
      session_id: startedView.session_id,
      state_digest: startedView.state_digest
    });
    expect(firstWork.status).toBe(200);
    const initial = firstWork.body as any;
    expect(initial.directive).toBe("perform_semantic_work");

    const chunks: string[] = [initial.worker_payload.worker_input_json_chunk];
    let page = initial.worker_payload;
    while (!page.complete) {
      const next = await call(routes, "continue_research_session", {
        session_id: initial.session_id,
        state_digest: initial.state_digest,
        worker_payload_cursor: page.next_cursor
      });
      expect(next.status).toBe(200);
      page = (next.body as any).worker_payload;
      chunks.push(page.worker_input_json_chunk);
    }
    const workerInput = JSON.parse(chunks.join(""));
    expect(workerInput.semantic_work.kind).toBe("module_applicability");
    const semanticResult = {
      contract_version: "askrigor_hermes_semantic_result_v1",
      session_id: initial.session_id,
      state_digest: initial.state_digest,
      work_type: "module_applicability",
      submission: {
        package_version: "askrigor_module_applicability_v1",
        decisions: workerInput.semantic_work.package.unresolved_module_ids.map(
          (module_id: (typeof RESEARCH_MODULE_IDS)[number]) => ({
          module_id,
          applicability: "REQUIRED",
          rationale: "Required for this broad comparative research target."
          })
        )
      }
    };

    const forged = await call(routes, "continue_research_session", {
      session_id: initial.session_id,
      state_digest: initial.state_digest,
      worker_payload_receipt: {
        ...page.terminal_receipt,
        signature: `${page.terminal_receipt.signature[0] === "A" ? "B" : "A"}${page.terminal_receipt.signature.slice(1)}`
      },
      semantic_result: semanticResult
    });
    expect(forged).toMatchObject({
      status: 409,
      body: { error: { code: "research_worker_payload_invalid" } }
    });

    const accepted = await call(routes, "continue_research_session", {
      session_id: initial.session_id,
      state_digest: initial.state_digest,
      worker_payload_receipt: page.terminal_receipt,
      semantic_result: semanticResult
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      directive: "continue_research",
      last_transition: {
        capability: "module_applicability",
        result: "semantic_work_recorded"
      }
    });
    expect((accepted.body as any).state_digest).not.toBe(initial.state_digest);
  });

  it("never turns premature finalization into a reader report", async () => {
    const routes = testRoutes();
    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence about chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    const initial = started.body as any;
    const result = await call(routes, "finalize_research_report", {
      session_id: initial.session_id,
      state_digest: initial.state_digest
    });
    expect(result).toMatchObject({
      status: 200,
      body: {
        finalization: {
          authorization: "DENIED"
        }
      }
    });
    expect((result.body as any).finalization.reader_facing).toBeUndefined();
    expect((result.body as any).product_acceptance_receipt).toBeUndefined();
  });

  it("projects server-owned background scout progress without an internal error", async () => {
    const routes = testRoutes(getProtocolManifest, {
      automatedScout: async (state) => recordAutomatedScoutProgress(state, {
        interaction_id: "interaction-controller-progress",
        phase: "INITIAL",
        provider_interaction_count: 1,
        poll_attempts: 0,
        executed_search_queries: []
      }, 1_000_000_000)
    });
    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence comparing treatment programs for chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    const moduleWork = await completeWorkerPayload(routes, started.body as any);
    const workerInput = JSON.parse(moduleWork.json);
    const routed = await call(routes, "continue_research_session", {
      session_id: workerInput.session_id,
      state_digest: workerInput.state_digest,
      worker_payload_receipt: moduleWork.receipt,
      semantic_result: {
        contract_version: "askrigor_hermes_semantic_result_v1",
        session_id: workerInput.session_id,
        state_digest: workerInput.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: workerInput.semantic_work.package.unresolved_module_ids.map(
            (module_id: (typeof RESEARCH_MODULE_IDS)[number]) => ({
              module_id,
              applicability: "REQUIRED",
              rationale: "Required for the broad comparative fixture."
            })
          )
        }
      }
    });
    const routedView = routed.body as any;
    const progress = await call(routes, "continue_research_session", {
      session_id: routedView.session_id,
      state_digest: routedView.state_digest
    });

    expect(progress).toMatchObject({
      status: 200,
      body: {
        directive: "continue_research",
        execution_status: "IN_PROGRESS",
        output_boundary: "CONTINUE_RESEARCH",
        next_capability: "automated_video_scout",
        last_transition: {
          capability: "automated_video_scout",
          result: "progress_recorded"
        }
      }
    });
  });

  it("never directs finalization from a continue state with terminal scout evidence", async () => {
    let observedDiagnosisStatus: string | undefined;
    const routes = testRoutes(getProtocolManifest, {
      automatedScout: async (state) => {
        observedDiagnosisStatus = state.diagnosis_status;
        return recordAutomatedScoutBoundary(state, {
          classification: "TERMINAL_NONRETRYABLE",
          code: "AUTOMATED_SCOUT_INVALID_PACKET",
          summary: "The external scout returned an invalid packet after bounded recovery."
        });
      }
    });
    const started = await call(routes, "start_research_session", {
      research_target: "Fixed synthetic acceptance fixture",
      diagnosis_status: "diagnosis_not_specified",
      acceptance_challenge_id: CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID
    });
    const moduleWork = await completeWorkerPayload(
      routes,
      started.body as any
    );
    const workerInput = JSON.parse(moduleWork.json);
    const routed = await call(routes, "continue_research_session", {
      session_id: workerInput.session_id,
      state_digest: workerInput.state_digest,
      worker_payload_receipt: moduleWork.receipt,
      semantic_result: {
        contract_version: "askrigor_hermes_semantic_result_v1",
        session_id: workerInput.session_id,
        state_digest: workerInput.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: workerInput.semantic_work.package.unresolved_module_ids.map(
            (module_id: (typeof RESEARCH_MODULE_IDS)[number]) => ({
              module_id,
              applicability: "REQUIRED",
              rationale: "Required for the broad comparative fixture."
            })
          )
        }
      }
    });
    const routedView = routed.body as any;
    const terminal = await call(routes, "continue_research_session", {
      session_id: routedView.session_id,
      state_digest: routedView.state_digest
    });

    expect(terminal).toMatchObject({
      status: 200,
      body: {
        directive: "continue_research",
        output_boundary: "CONTINUE_RESEARCH",
        next_capability: "native_video_discovery",
        last_transition: {
          capability: "automated_video_scout",
          result: "blocked_terminal"
        }
      }
    });
    expect(observedDiagnosisStatus).toBe("user_supplied_diagnosis");
  });

  it("returns a stable blocked view when every discovery lane ends without candidates", async () => {
    const routes = testRoutes(getProtocolManifest, {
      automatedScout: async (state) => recordAutomatedScoutBoundary(state, {
        classification: "TERMINAL_NONRETRYABLE",
        code: "AUTOMATED_SCOUT_INVALID_PACKET",
        summary: "The external scout returned no usable packet after bounded recovery."
      }),
      nativeDiscovery: async (state) => recordNativeYoutubeDiscovery(state, {
        provider: "youtube",
        record_type: "youtube_community_survey",
        retrieved_at: "2026-08-25T00:00:00.000Z",
        research_question: state.research_target,
        access_status: "inaccessible",
        limitations: ["No public candidate results were accessible."],
        searches: [{
          directions: ["general"],
          query: `${state.research_target} treatment experience`,
          access_status: "inaccessible",
          pagination: { returned: 0, exhausted: true },
          limitations: ["The search reached a terminal access boundary."],
          candidate_video_ids: []
        }],
        candidates: []
      })
    });
    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence comparing treatment programs for chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    const moduleWork = await completeWorkerPayload(routes, started.body as any);
    const workerInput = JSON.parse(moduleWork.json);
    const routed = await call(routes, "continue_research_session", {
      session_id: workerInput.session_id,
      state_digest: workerInput.state_digest,
      worker_payload_receipt: moduleWork.receipt,
      semantic_result: {
        contract_version: "askrigor_hermes_semantic_result_v1",
        session_id: workerInput.session_id,
        state_digest: workerInput.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: workerInput.semantic_work.package.unresolved_module_ids.map(
            (module_id: (typeof RESEARCH_MODULE_IDS)[number]) => ({
              module_id,
              applicability: "REQUIRED",
              rationale: "Required for the broad comparative fixture."
            })
          )
        }
      }
    });
    const afterRouting = routed.body as any;
    const afterScout = await call(routes, "continue_research_session", {
      session_id: afterRouting.session_id,
      state_digest: afterRouting.state_digest
    });
    const scoutView = afterScout.body as any;
    const terminal = await call(routes, "continue_research_session", {
      session_id: scoutView.session_id,
      state_digest: scoutView.state_digest
    });

    expect(terminal).toMatchObject({
      status: 200,
      body: {
        directive: "blocked",
        execution_status: "BLOCKED_TERMINAL",
        output_boundary: "CONTINUE_RESEARCH",
        next_capability: null,
        last_transition: {
          capability: "native_video_discovery",
          result: "blocked_terminal"
        }
      }
    });
  });

  it("returns and preserves a resumable blocked view instead of retry-looping a rate-limited capability", async () => {
    let nativeCalls = 0;
    const routes = testRoutes(getProtocolManifest, {
      automatedScout: async (state) => recordAutomatedScoutBoundary(state, {
        classification: "TERMINAL_NONRETRYABLE",
        code: "AUTOMATED_SCOUT_INVALID_PACKET",
        summary: "The external scout reached a terminal boundary."
      }),
      nativeDiscovery: async (state) => {
        nativeCalls += 1;
        if (nativeCalls > 1) return state;
        return recordNativeYoutubeDiscovery(state, {
          provider: "youtube",
          record_type: "youtube_community_survey",
          retrieved_at: "2026-08-25T00:00:00.000Z",
          research_question: state.research_target,
          access_status: "rate_limited",
          limitations: ["The provider temporarily refused search requests."],
          searches: [{
            directions: ["general"],
            query: `${state.research_target} treatment experience`,
            access_status: "rate_limited",
            pagination: { returned: 0, exhausted: false },
            limitations: ["Search can be retried after the provider limit clears."],
            candidate_video_ids: []
          }],
          candidates: []
        });
      }
    });
    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence comparing treatment programs for chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    const moduleWork = await completeWorkerPayload(routes, started.body as any);
    const workerInput = JSON.parse(moduleWork.json);
    const routed = await call(routes, "continue_research_session", {
      session_id: workerInput.session_id,
      state_digest: workerInput.state_digest,
      worker_payload_receipt: moduleWork.receipt,
      semantic_result: {
        contract_version: "askrigor_hermes_semantic_result_v1",
        session_id: workerInput.session_id,
        state_digest: workerInput.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: workerInput.semantic_work.package.unresolved_module_ids.map(
            (module_id: (typeof RESEARCH_MODULE_IDS)[number]) => ({
              module_id,
              applicability: "REQUIRED",
              rationale: "Required for the broad comparative fixture."
            })
          )
        }
      }
    });
    const afterRouting = routed.body as any;
    const afterScout = await call(routes, "continue_research_session", {
      session_id: afterRouting.session_id,
      state_digest: afterRouting.state_digest
    });
    const scoutView = afterScout.body as any;
    const firstBlocked = await call(routes, "continue_research_session", {
      session_id: scoutView.session_id,
      state_digest: scoutView.state_digest
    });

    expect(firstBlocked).toMatchObject({
      status: 200,
      body: {
        directive: "blocked",
        execution_status: "BLOCKED_RETRYABLE",
        output_boundary: "CONTINUE_RESEARCH",
        next_capability: "native_video_discovery",
        last_transition: {
          capability: "native_video_discovery",
          result: "blocked_retryable"
        }
      }
    });
    const blockedView = firstBlocked.body as any;
    const unchangedRetry = await call(routes, "continue_research_session", {
      session_id: blockedView.session_id,
      state_digest: blockedView.state_digest
    });
    expect(unchangedRetry).toMatchObject({
      status: 200,
      body: {
        directive: "blocked",
        execution_status: "BLOCKED_RETRYABLE",
        output_boundary: "CONTINUE_RESEARCH",
        next_capability: "native_video_discovery"
      }
    });
    expect((unchangedRetry.body as any).last_transition).toBeUndefined();
    expect((unchangedRetry.body as any).state_digest).toBe(
      blockedView.state_digest
    );
    expect(nativeCalls).toBe(2);
  });

  it("still fails closed when a required deterministic dependency is genuinely absent", async () => {
    const routes = testRoutes(getProtocolManifest, {
      automatedScout: async (state) => recordAutomatedScoutBoundary(state, {
        classification: "TERMINAL_NONRETRYABLE",
        code: "AUTOMATED_SCOUT_INVALID_PACKET",
        summary: "The external scout reached a terminal boundary."
      })
    });
    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence comparing treatment programs for chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    const moduleWork = await completeWorkerPayload(routes, started.body as any);
    const workerInput = JSON.parse(moduleWork.json);
    const routed = await call(routes, "continue_research_session", {
      session_id: workerInput.session_id,
      state_digest: workerInput.state_digest,
      worker_payload_receipt: moduleWork.receipt,
      semantic_result: {
        contract_version: "askrigor_hermes_semantic_result_v1",
        session_id: workerInput.session_id,
        state_digest: workerInput.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: workerInput.semantic_work.package.unresolved_module_ids.map(
            (module_id: (typeof RESEARCH_MODULE_IDS)[number]) => ({
              module_id,
              applicability: "REQUIRED",
              rationale: "Required for the broad comparative fixture."
            })
          )
        }
      }
    });
    const afterRouting = routed.body as any;
    const afterScout = await call(routes, "continue_research_session", {
      session_id: afterRouting.session_id,
      state_digest: afterRouting.state_digest
    });
    const scoutView = afterScout.body as any;
    const unavailable = await call(routes, "continue_research_session", {
      session_id: scoutView.session_id,
      state_digest: scoutView.state_digest
    });

    expect(unavailable).toMatchObject({
      status: 409,
      body: {
        error: {
          code: "research_dependency_unavailable",
          retryable: true
        }
      }
    });
  });

  it("fails closed for unknown sessions and protocol drift", async () => {
    let drift = false;
    const routes = testRoutes(async (protocol) => {
      const manifest = await getProtocolManifest(protocol);
      return drift && protocol === "hrp"
        ? { ...manifest, sha256: "0".repeat(64) }
        : manifest;
    });
    const unknown = await call(routes, "get_research_session_status", {
      session_id: `ars1_${"U".repeat(32)}`
    });
    expect(unknown).toMatchObject({
      status: 422,
      body: { error: { code: "research_session_invalid_or_expired" } }
    });

    const started = await call(routes, "start_research_session", {
      research_target: "Population-level evidence about chronic joint pain",
      diagnosis_status: "diagnosis_not_specified"
    });
    const initial = started.body as any;
    drift = true;
    const continued = await call(routes, "continue_research_session", {
      session_id: initial.session_id,
      state_digest: initial.state_digest
    });
    expect(continued).toMatchObject({
      status: 200,
      body: {
        directive: "restart_required",
        execution_status: "PROTOCOL_DRIFT",
        output_boundary: "CONTINUE_RESEARCH"
      }
    });
    const drifted = continued.body as any;
    const finalization = await call(routes, "finalize_research_report", {
      session_id: drifted.session_id,
      state_digest: drifted.state_digest
    });
    expect(finalization).toMatchObject({
      status: 200,
      body: { finalization: { authorization: "DENIED" } }
    });
    expect((finalization.body as any).product_acceptance_receipt).toBeUndefined();
  });
});

function testRoutes(
  manifests: typeof getProtocolManifest = getProtocolManifest,
  deterministicAdvanceDependencies: Parameters<
    typeof createControlledResearchRoutes
  >[0]["deterministicAdvanceDependencies"] = {}
): readonly ActionRoute[] {
  let randomByte = 7;
  return createControlledResearchRoutes({
    store: createResearchSessionStore({
      random: () => new Uint8Array(24).fill(randomByte++)
    }),
    getProtocolManifest: manifests,
    deterministicAdvanceDependencies,
    semanticAdvanceDependencies: {},
    continuationSigningSecret: SECRET,
    finalizationSigningSecret: SECRET,
    finalizationKeyId: "test-key"
  });
}

async function completeWorkerPayload(
  routes: readonly ActionRoute[],
  view: any
): Promise<{ json: string; receipt: unknown }> {
  const chunks: string[] = [];
  let current = await call(routes, "continue_research_session", {
    session_id: view.session_id,
    state_digest: view.state_digest
  });
  let page = (current.body as any).worker_payload;
  chunks.push(page.worker_input_json_chunk);
  while (!page.complete) {
    current = await call(routes, "continue_research_session", {
      session_id: view.session_id,
      state_digest: view.state_digest,
      worker_payload_cursor: page.next_cursor
    });
    page = (current.body as any).worker_payload;
    chunks.push(page.worker_input_json_chunk);
  }
  return { json: chunks.join(""), receipt: page.terminal_receipt };
}

async function call(
  routes: readonly ActionRoute[],
  operationId: string,
  body: unknown
) {
  const route = routes.find((candidate) => candidate.operationId === operationId);
  if (route === undefined) throw new Error(`Missing route ${operationId}`);
  return route.handle({ request: {} as never, clientIp: "test", body });
}
