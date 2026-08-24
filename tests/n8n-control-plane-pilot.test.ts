import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";

import { describe, expect, it, vi } from "vitest";

import {
  createEphemeralN8nControlPlaneStore,
  createN8nControlPlane,
  N8nControlPlaneConflictError,
  n8nControlPlaneProjectionSchema
} from "../apps/research-mcp/src/n8n-control-plane-pilot.js";
import {
  createN8nControlPlaneHandler,
  N8N_CONTROL_PLANE_PREFIX
} from "../apps/research-mcp/src/n8n-control-plane-route.js";
import {
  PrivateOrchestrationClientError,
  type PrivateResearchOrchestrationClient,
  type PrivateResearchView
} from "../apps/research-mcp/src/private-research-orchestration-client.js";
import type {
  ResearchFinalizationDecision
} from "../apps/research-mcp/src/actions/research-session-controller.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

const SESSION_ID = `ars1_${"A".repeat(32)}`;
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

describe("n8n control-plane pilot", () => {
  it("projects only an opaque execution ID and follows server-selected work", async () => {
    let current = privateView(DIGEST_A);
    const client = fixtureClient({
      current: () => current,
      advance: vi.fn(async () => {
        current = privateView(DIGEST_B, {
          required_next_capabilities: ["native_video_discovery"]
        });
        return current;
      })
    });
    const control = createN8nControlPlane({ client });

    const started = await control.start(SESSION_ID);
    expect(started).toMatchObject({
      execution_id: expect.stringMatching(/^arn8n1_/u),
      directive: "CONTINUE_NOW",
      permit_verified: false,
      output_boundary: null
    });
    expect(JSON.stringify(started)).not.toContain(SESSION_ID);
    expect(JSON.stringify(started)).not.toContain("research_target");
    expect(JSON.stringify(started)).not.toContain("semantic_work");

    const restarted = await control.start(SESSION_ID);
    expect(restarted.execution_id).toBe(started.execution_id);

    const advanced = await control.tick(started.execution_id);
    expect(advanced.directive).toBe("CONTINUE_NOW");
    expect(client.advance).toHaveBeenCalledExactlyOnceWith({
      session_id: SESSION_ID,
      state_digest: DIGEST_A
    });
    expect(JSON.stringify(advanced)).not.toContain(SESSION_ID);
  });

  it("keeps a killed worker retryable and becomes stuck only after the fixed retry bound", async () => {
    let clock = Date.parse("2026-08-24T12:00:00.000Z");
    const client = fixtureClient({
      advance: vi.fn(async () => {
        throw new PrivateOrchestrationClientError(
          503,
          "private_orchestration_worker_failed",
          true
        );
      })
    });
    const control = createN8nControlPlane({
      client,
      now: () => new Date(clock),
      retryDelayMs: 1_000,
      maximumRetryableFailures: 3
    });
    const started = await control.start(SESSION_ID);

    const first = await control.tick(started.execution_id);
    expect(first).toMatchObject({
      directive: "RETRY_AFTER",
      reason_code: "PRIVATE_ORCHESTRATION_WORKER_FAILED",
      retry_after_ms: 1_000,
      permit_verified: false
    });

    clock += 50_000;
    expect(control.status(started.execution_id).directive).toBe("RETRY_AFTER");
    expect(client.advance).toHaveBeenCalledTimes(1);

    await control.tick(started.execution_id);
    clock += 1_000;
    const exhausted = await control.tick(started.execution_id);
    expect(exhausted).toMatchObject({
      directive: "STUCK",
      reason_code: "RETRY_LIMIT_REACHED",
      permit_verified: false,
      output_boundary: null
    });
    clock += 86_400_000;
    expect(control.status(started.execution_id).directive).toBe("STUCK");
  });

  it("never converts no progress, nonretryable failure, or elapsed time into completion", async () => {
    let clock = Date.parse("2026-08-24T12:00:00.000Z");
    const noProgressClient = fixtureClient();
    const noProgress = createN8nControlPlane({
      client: noProgressClient,
      now: () => new Date(clock),
      maximumNoProgressTransitions: 2
    });
    const started = await noProgress.start(SESSION_ID);
    expect((await noProgress.tick(started.execution_id)).directive)
      .toBe("CONTINUE_NOW");
    expect((await noProgress.tick(started.execution_id))).toMatchObject({
      directive: "STUCK",
      reason_code: "NO_PROGRESS_LIMIT_REACHED",
      permit_verified: false
    });
    clock += 30 * 86_400_000;
    expect(noProgress.status(started.execution_id).directive).toBe("STUCK");

    const blockedClient = fixtureClient({
      advance: vi.fn(async () => {
        throw new PrivateOrchestrationClientError(
          422,
          "private_orchestration_worker_output_rejected",
          false
        );
      })
    });
    const blocked = createN8nControlPlane({ client: blockedClient });
    const second = await blocked.start(SESSION_ID);
    expect(await blocked.tick(second.execution_id)).toMatchObject({
      directive: "BLOCKED",
      reason_code: "PRIVATE_ORCHESTRATION_WORKER_OUTPUT_REJECTED",
      permit_verified: false
    });
  });

  it("reaches complete or bounded-complete only from an exact permit-bound server decision", async () => {
    for (const authorization of ["AUTHORIZED", "BOUNDED"] as const) {
      const decision = terminalDecision(authorization);
      const client = fixtureClient({
        finalize: vi.fn(async () => decision)
      });
      const control = createN8nControlPlane({ client });
      const result = await control.start(SESSION_ID);
      expect(result).toMatchObject({
        directive: authorization === "AUTHORIZED"
          ? "COMPLETE"
          : "BOUNDED_COMPLETE",
        permit_verified: true,
        output_boundary: authorization === "AUTHORIZED"
          ? "FINALIZATION_ALLOWED"
          : "BOUNDED_NONRANKING_ONLY",
        permit_payload_sha256: decision.finalization_permit.permit_payload_sha256
      });
      expect(n8nControlPlaneProjectionSchema.parse(result)).toEqual(result);
    }

    const mismatched = terminalDecision("AUTHORIZED");
    mismatched.state_digest = DIGEST_B;
    mismatched.finalization_permit.state_digest = DIGEST_B;
    const rejected = createN8nControlPlane({
      client: fixtureClient({ finalize: vi.fn(async () => mismatched) })
    });
    await expect(rejected.start(SESSION_ID)).rejects.toThrow(
      "Finalization permit binding mismatch"
    );
  });

  it("rejects store-side completion injection and stale replacement", () => {
    const store = createEphemeralN8nControlPlaneStore();
    const raw = {
      state_version: "askrigor_n8n_control_state_v1" as const,
      execution_id: `arn8n1_${"A".repeat(32)}`,
      session_id: SESSION_ID,
      state_digest: DIGEST_A,
      directive: "CONTINUE_NOW" as const,
      retryable_failure_count: 0,
      no_progress_count: 0,
      reason_code: null,
      next_attempt_at: null,
      output_boundary: null,
      permit_payload_sha256: null,
      permit_verified: false,
      created_at: "2026-08-24T12:00:00.000Z",
      updated_at: "2026-08-24T12:00:00.000Z",
      revision: 0
    };
    store.create(raw);
    expect(() => store.replace(raw.execution_id, 0, {
      ...raw,
      directive: "COMPLETE",
      output_boundary: "FINALIZATION_ALLOWED",
      permit_verified: true,
      permit_payload_sha256: null,
      revision: 1
    })).toThrow("Only a permit-bound terminal state may claim completion");
    expect(() => store.replace(raw.execution_id, 99, {
      ...raw,
      revision: 100
    })).toThrow(N8nControlPlaneConflictError);
  });

  it("exposes a separate authenticated adapter that accepts no completion claims", async () => {
    const control = createN8nControlPlane({ client: fixtureClient() });
    const server = createAskRigorHttpServer({
      n8nControlPlaneEnabled: true,
      n8nControlPlaneApiKey: "phase-j-n8n-adapter-key-long-enough",
      n8nControlPlaneHandler: createN8nControlPlaneHandler(control)
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const baseUrl = new URL(`http://127.0.0.1:${address.port}`);
    try {
      const missingAuth = await fetch(
        new URL(`${N8N_CONTROL_PLANE_PREFIX}/start`, baseUrl),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: SESSION_ID })
        }
      );
      expect(missingAuth.status).toBe(401);

      const started = await n8nPost(baseUrl, "/start", {
        session_id: SESSION_ID
      });
      expect(started.status).toBe(200);
      const projection = await started.json() as { execution_id: string };
      expect(JSON.stringify(projection)).not.toContain(SESSION_ID);

      const forged = await n8nPost(baseUrl, "/tick", {
        execution_id: projection.execution_id,
        complete: true,
        all_work_done: true,
        completed_operation_count: 999
      });
      expect(forged.status).toBe(422);
      expect(await forged.json()).toEqual({
        error: { code: "n8n_control_input_invalid", retryable: false }
      });

      const status = await n8nPost(baseUrl, "/status", {
        execution_id: projection.execution_id
      });
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({
        directive: "CONTINUE_NOW",
        permit_verified: false
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    }
  });

  it("fails closed when the private n8n adapter lacks its own key or handler", () => {
    expect(() => createAskRigorHttpServer({
      n8nControlPlaneEnabled: true,
      n8nControlPlaneApiKey: "short"
    })).toThrow("Private research orchestration authentication unavailable");
    expect(() => createAskRigorHttpServer({
      n8nControlPlaneEnabled: true,
      n8nControlPlaneApiKey: "phase-j-n8n-adapter-key-long-enough"
    })).toThrow("n8n control-plane handler unavailable");
  });
});

function privateView(
  digest = DIGEST_A,
  overrides: Partial<PrivateResearchView> = {}
): PrivateResearchView {
  return {
    session_id: SESSION_ID,
    state_digest: digest,
    execution_status: "IN_PROGRESS",
    output_boundary: "CONTINUE_RESEARCH",
    finalization_readiness: "CONTINUE_RESEARCH",
    required_next_capabilities: ["automated_video_scout"],
    boundaries: [],
    semantic_work: null,
    safe_diagnostics: {
      scout_candidate_count: 0,
      unresolved_scout_candidate_count: 0
    },
    ...overrides
  };
}

function deniedDecision(digest = DIGEST_A): ResearchFinalizationDecision {
  return {
    session_id: SESSION_ID,
    authorization: "DENIED",
    output_boundary: "CONTINUE_RESEARCH",
    finalization_permit: null,
    denial_reasons: ["REQUIRED_OPERATION_INCOMPLETE"],
    required_next_capabilities: ["automated_video_scout"],
    state_digest: digest
  };
}

function fixtureClient(overrides: {
  current?: () => PrivateResearchView;
  advance?: PrivateResearchOrchestrationClient["advance"];
  finalize?: PrivateResearchOrchestrationClient["finalize"];
} = {}): PrivateResearchOrchestrationClient & {
  advance: ReturnType<typeof vi.fn>;
} {
  let local = privateView();
  const current = overrides.current ?? (() => local);
  const advance = vi.fn(overrides.advance ?? (async () => current()));
  return {
    start: vi.fn(async () => current()),
    status: vi.fn(async () => current()),
    resume: vi.fn(async () => current()),
    advance,
    submit: vi.fn(async () => current()),
    finalize: overrides.finalize ?? vi.fn(async () => deniedDecision(current().state_digest))
  };
}

function terminalDecision(
  authorization: "AUTHORIZED" | "BOUNDED"
): Extract<ResearchFinalizationDecision, { authorization: "AUTHORIZED" | "BOUNDED" }> {
  const outputBoundary = authorization === "AUTHORIZED"
    ? "FINALIZATION_ALLOWED" as const
    : "BOUNDED_NONRANKING_ONLY" as const;
  const limitationsDigest = createHash("sha256").update("[]").digest("hex");
  return {
    session_id: SESSION_ID,
    authorization,
    output_boundary: outputBoundary,
    finalization_permit: {
      permit_version: "askrigor_finalization_permit_v1",
      artifact_kind: authorization === "AUTHORIZED"
        ? "COMPARATIVE_FINALIZATION_PERMIT"
        : "BOUNDED_NONRANKING_REPORT_PERMIT",
      execution_id: SESSION_ID,
      output_boundary: outputBoundary,
      protocol_identities: [
        {
          protocol: "universal",
          name: "Universal Instructions",
          version: "20.5.14",
          revision_date: "2026-08-18",
          sha256: "c".repeat(64)
        },
        {
          protocol: "hrp",
          name: "Health Research Protocol",
          version: "20.5.22",
          revision_date: "2026-08-23",
          sha256: "d".repeat(64)
        }
      ],
      state_digest: DIGEST_A,
      authorization_basis_digest: "e".repeat(64),
      limitations_digest: limitationsDigest,
      issued_at: "2026-08-24T11:59:00.000Z",
      expires_at: "2026-08-24T12:10:00.000Z",
      key_id: "phase-j-fixture",
      domain: "askrigor.research.finalization",
      permit_payload_sha256: "f".repeat(64),
      signature: "A".repeat(43)
    },
    reader_facing: {
      permitted_scope: authorization === "AUTHORIZED"
        ? "comparative_synthesis"
        : "bounded_nonranking_report",
      limitations: []
    },
    required_next_capabilities: [],
    state_digest: DIGEST_A
  } as Extract<ResearchFinalizationDecision, { authorization: "AUTHORIZED" | "BOUNDED" }>;
}

function n8nPost(baseUrl: URL, suffix: string, body: unknown) {
  return fetch(new URL(`${N8N_CONTROL_PLANE_PREFIX}${suffix}`, baseUrl), {
    method: "POST",
    headers: {
      authorization: "Bearer phase-j-n8n-adapter-key-long-enough",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
