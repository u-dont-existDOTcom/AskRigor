import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";

import { createControlledResearchRoutes } from
  "../apps/research-mcp/src/actions/controlled-research-route.js";
import { RESEARCH_MODULE_IDS } from
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
  manifests: typeof getProtocolManifest = getProtocolManifest
): readonly ActionRoute[] {
  let randomByte = 7;
  return createControlledResearchRoutes({
    store: createResearchSessionStore({
      random: () => new Uint8Array(24).fill(randomByte++)
    }),
    getProtocolManifest: manifests,
    deterministicAdvanceDependencies: {},
    semanticAdvanceDependencies: {},
    continuationSigningSecret: SECRET,
    finalizationSigningSecret: SECRET,
    finalizationKeyId: "test-key"
  });
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
