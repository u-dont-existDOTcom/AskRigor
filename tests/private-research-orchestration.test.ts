import { createConnection } from "node:net";
import type { AddressInfo } from "node:net";

import { describe, expect, it, vi } from "vitest";

import {
  createPrivateResearchOrchestrationHandler
} from "../apps/research-mcp/src/private-research-orchestration.js";
import {
  HERMES_AGENT_PIN,
  createHttpPrivateResearchOrchestrationClient,
  releaseHermesFinalResponse,
  runHermesResearchTask,
  type HermesSemanticExecutor
} from "../apps/research-mcp/src/hermes-worker-pilot.js";
import {
  createAskRigorHttpServer
} from "../apps/research-mcp/src/server.js";
import {
  createConcurrencyLimiter,
  createTokenBucketLimiter,
  type ConcurrencyLimiter,
  type TokenBucketLimiter
} from "../apps/research-mcp/src/rate-limit.js";
import type {
  scoutGeminiYoutubeCandidates,
  validateGeminiYoutubeCandidateHandoff
} from "../packages/sources/src/index.js";
import {
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";

const API_KEY = "phase-h-private-orchestration-key-long-enough";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function protocolManifest(protocol: "universal" | "hrp") {
  return {
    name: protocol === "universal" ? "Universal Instructions" : "Health Research Protocol",
    version: protocol === "universal" ? "20.5.14" : "20.5.22",
    revisionDate: protocol === "universal" ? "2026-08-18" : "2026-08-23",
    sha256: protocol === "universal" ? HASH_A : HASH_B
  };
}

function fixtureHandler(
  maximumResponseBytes?: number,
  semanticExecutor?: HermesSemanticExecutor
) {
  const scout = vi.fn<typeof scoutGeminiYoutubeCandidates>(async () => ({
    provider: "gemini_api",
    record_type: "gemini_youtube_candidate_frontier",
    primary_identifier: "phase-h-response",
    retrieved_at: "2026-08-24T00:00:00.000Z",
    source_identity: {},
    pagination: { returned: 3, exhausted: true },
    access_status: "complete",
    limitations: [],
    data: {
      response_id: "phase-h-response",
      model: "fixture-model",
      google_search_grounded: true,
      packet: researchPacket()
    }
  }));
  const validate = vi.fn<typeof validateGeminiYoutubeCandidateHandoff>(
    async () => researchReceipt()
  );
  return createPrivateResearchOrchestrationHandler({
    getProtocolManifest: async (protocol) => protocolManifest(protocol),
    scout,
    validateCandidates: validate,
    surveyNativeCandidates: vi.fn(async () => nativeSurvey()),
    loadScoutInstructions: async () => "Exact repository scout instructions",
    geminiConfig: { apiKey: "server-held-gemini-key", model: "fixture-model" },
    youtubeApiKey: "server-held-youtube-key",
    ...(semanticExecutor === undefined ? {} : { semanticExecutor }),
    ...(maximumResponseBytes === undefined ? {} : { maximumResponseBytes })
  });
}

describe("private research orchestration HTTP boundary", () => {
  it("is absent by default and requires a distinct sufficiently long secret when enabled", async () => {
    await withServer({}, async (baseUrl) => {
      const response = await privatePost(baseUrl, "/start", {
        research_target: "private target",
        diagnosis_status: "diagnosis_not_specified"
      });
      expect(response.status).toBe(404);
    });

    expect(() => createAskRigorHttpServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: "short"
    })).toThrow("Private research orchestration authentication unavailable");
  });

  it("drives the same controller through routing and candidate screening without exposing the target", async () => {
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler()
    }, async (baseUrl) => {
      const target = "de-identified treatment comparison";
      const started = await privatePost(baseUrl, "/start", {
        research_target: target,
        diagnosis_status: "diagnosis_not_specified"
      });
      expect(started.status).toBe(200);
      const startedText = await started.text();
      expect(startedText).not.toContain(target);
      expect(startedText).not.toContain("evidence_context");
      const start = JSON.parse(startedText) as PrivateView;
      expect(start).toMatchObject({
        session_id: expect.stringMatching(/^ars1_/u),
        state_digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        output_boundary: "CONTINUE_RESEARCH",
        semantic_work: {
          kind: "module_applicability",
          package: { unresolved_module_ids: expect.any(Array) }
        }
      });
      expect(start).not.toHaveProperty("modules");
      expect(start).not.toHaveProperty("operations");
      expect(start).not.toHaveProperty("research_target");

      for (const suffix of ["/resume", "/finalize"] as const) {
        const injected = await privatePost(baseUrl, suffix, {
          session_id: start.session_id,
          complete: true,
          synthesis_permitted: true,
          completed_operation_count: 99,
          completed_operations: ["everything"]
        });
        expect(injected.status).toBe(422);
      }

      const forged = await privatePost(baseUrl, "/submit", {
        session_id: start.session_id,
        state_digest: start.state_digest,
        work_type: "module_applicability",
        complete: true,
        completed_operation_count: 99,
        completed_operations: ["everything"],
        provider_complete: true,
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: []
        }
      });
      expect(forged.status).toBe(422);

      const unresolved = start.semantic_work!.package.unresolved_module_ids!;
      const attemptedDemotion = await privatePost(baseUrl, "/submit", {
        session_id: start.session_id,
        state_digest: start.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: [
            ...unresolved.map((module_id) => ({
              module_id,
              applicability: "REQUIRED",
              rationale: "The bounded routing fixture requires this module."
            })),
            {
              module_id: "HRP",
              applicability: "NOT_REQUIRED",
              rationale: "A caller cannot demote an already required module."
            }
          ]
        }
      });
      expect(attemptedDemotion.status).toBe(409);
      const unchanged = await privatePost(baseUrl, "/status", {
        session_id: start.session_id
      });
      expect((await unchanged.json() as PrivateView).state_digest)
        .toBe(start.state_digest);

      const routedResponse = await privatePost(baseUrl, "/submit", {
        session_id: start.session_id,
        state_digest: start.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: unresolved.map((module_id) => ({
            module_id,
            applicability: "REQUIRED",
            rationale: "The bounded routing fixture requires this module."
          }))
        }
      });
      expect(routedResponse.status).toBe(200);
      const routed = await routedResponse.json() as PrivateView;
      expect(routed.state_digest).not.toBe(start.state_digest);
      expect(routed.semantic_work).toBeNull();

      const stale = await privatePost(baseUrl, "/submit", {
        session_id: start.session_id,
        state_digest: start.state_digest,
        work_type: "module_applicability",
        submission: {
          package_version: "askrigor_module_applicability_v1",
          decisions: unresolved.map((module_id) => ({
            module_id,
            applicability: "NOT_REQUIRED",
            rationale: "A stale caller cannot rewrite authoritative state."
          }))
        }
      });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toEqual({
        error: {
          code: "private_orchestration_state_stale",
          retryable: true
        }
      });

      const scoutResponse = await privatePost(baseUrl, "/resume", {
        session_id: start.session_id,
        state_digest: routed.state_digest
      });
      expect(scoutResponse.status).toBe(200);
      const scouted = await scoutResponse.json() as PrivateView;
      const discoveredResponse = await privatePost(baseUrl, "/resume", {
        session_id: start.session_id,
        state_digest: scouted.state_digest
      });
      expect(discoveredResponse.status).toBe(200);
      const discovered = await discoveredResponse.json() as PrivateView;
      expect(discovered.semantic_work).toMatchObject({
        kind: "candidate_screening",
        package: {
          discovery_digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
          candidates: expect.any(Array)
        }
      });

      const candidatePackage = discovered.semantic_work!.package;
      const candidates = candidatePackage.candidates!;
      const firstByProgram = new Map<string, string>();
      for (const candidate of candidates) {
        if (!firstByProgram.has(candidate.program_signature)) {
          firstByProgram.set(candidate.program_signature, candidate.video_id);
        }
      }
      const screenedResponse = await privatePost(baseUrl, "/submit", {
        session_id: start.session_id,
        state_digest: discovered.state_digest,
        work_type: "candidate_screening",
        submission: {
          package_version: "askrigor_candidate_screening_v1",
          discovery_digest: candidatePackage.discovery_digest,
          decisions: candidates.map(({ video_id, program_signature }) => {
            const distinctVideoId = firstByProgram.get(program_signature)!;
            const distinct = distinctVideoId === video_id;
            return {
            video_id,
            materiality: "MATERIAL",
            redundancy: distinct ? "DISTINCT" : "DUPLICATE",
            ...(distinct ? {} : { duplicate_of_video_id: distinctVideoId }),
            selection_status: distinct ? "SELECTED" : "NOT_SELECTED",
            rationale: "Distinct fixture selected for bounded depth work."
          }; })
        }
      });
      expect(screenedResponse.status).toBe(200);
      const screened = await screenedResponse.json() as PrivateView;
      expect(screened.semantic_work).toBeNull();
      expect(screened.required_next_capabilities).toEqual(expect.arrayContaining([
        "transcript_acquisition",
        "community_discussion_audit",
        "formal_evidence_search"
      ]));

      const finalization = await privatePost(baseUrl, "/finalize", {
        session_id: start.session_id
      });
      expect(finalization.status).toBe(200);
      expect(await finalization.json()).toMatchObject({
        authorization: "DENIED",
        output_boundary: "CONTINUE_RESEARCH",
        finalization_permit: null
      });
    });
  });

  it("lets the Hermes pilot complete bounded work units but cannot bypass the controller denial", async () => {
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler()
    }, async (baseUrl) => {
      const client = createHttpPrivateResearchOrchestrationClient({
        baseUrl,
        apiKey: API_KEY
      });
      const worker: HermesSemanticExecutor = {
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
                  rationale: "The de-identified broad comparison requires this module."
                }))
              }
            }
            : {
              contract_version: "askrigor_hermes_semantic_result_v1",
              session_id,
              state_digest,
              work_type: "candidate_screening",
              submission: candidateSubmission(semantic_work.package)
            },
          diagnostics: {
            worker: "hermes_agent",
            upstream_commit: HERMES_AGENT_PIN.commit,
            provider: "held-out-fixture",
            model: "held-out-fixture",
            usage: { api_calls: 1, estimated_cost_nano_usd: 1 }
          }
        }))
      };
      const run = await runHermesResearchTask({
        research_target: "de-identified treatment comparison",
        maximum_no_progress_transitions: 1,
        maximum_transitions: 12
      }, client, worker);

      expect(run).toMatchObject({
        status: "NO_PROGRESS",
        output_boundary: "CONTINUE_RESEARCH",
        decision: {
          authorization: "DENIED",
          finalization_permit: null
        },
        metrics: {
          semantic_work_requests: 2,
          deterministic_resume_requests: 3,
          skipped_gate_attempts: 0
        }
      });
      expect(worker.execute).toHaveBeenCalledTimes(2);
      expect(() => releaseHermesFinalResponse(run, "Worker claims completion"))
        .toThrow("AskRigor did not authorize");
    });
  });

  it("lets only the server choose and apply the next semantic or deterministic step", async () => {
    const worker: HermesSemanticExecutor = {
      execute: vi.fn(async ({
        session_id,
        state_digest,
        research_context,
        response_contract,
        semantic_work
      }) => {
        expect(research_context).toBe("de-identified server-owned advance fixture");
        expect(response_contract).toMatchObject({
          type: "object",
          properties: { work_type: { const: "module_applicability" } }
        });
        expect(semantic_work.kind).toBe("module_applicability");
        if (semantic_work.kind !== "module_applicability") throw new Error("wrong fixture work");
        return {
          model_output: {
            contract_version: "askrigor_hermes_semantic_result_v1",
            session_id,
            state_digest,
            work_type: "module_applicability",
            submission: {
              package_version: "askrigor_module_applicability_v1",
              decisions: semantic_work.package.unresolved_module_ids.map((module_id) => ({
                module_id,
                applicability: "REQUIRED",
                rationale: "The server-issued package requires this fixture module."
              }))
            }
          }
        };
      })
    };
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler(undefined, worker)
    }, async (baseUrl) => {
      const started = await privatePost(baseUrl, "/start", {
        research_target: "de-identified server-owned advance fixture",
        diagnosis_status: "diagnosis_not_specified"
      });
      const start = await started.json() as PrivateView;

      const injected = await privatePost(baseUrl, "/advance", {
        session_id: start.session_id,
        state_digest: start.state_digest,
        work_type: "candidate_screening",
        complete: true,
        completed_operation_count: 999
      });
      expect(injected.status).toBe(422);

      const advanced = await privatePost(baseUrl, "/advance", {
        session_id: start.session_id,
        state_digest: start.state_digest
      });
      expect(advanced.status).toBe(200);
      const routed = await advanced.json() as PrivateView;
      expect(routed.state_digest).not.toBe(start.state_digest);
      expect(routed.last_transition).toEqual({
        capability: "module_applicability",
        result: "semantic_work_recorded"
      });
      expect(worker.execute).toHaveBeenCalledTimes(1);

      const deterministic = await privatePost(baseUrl, "/advance", {
        session_id: routed.session_id,
        state_digest: routed.state_digest
      });
      expect(deterministic.status).toBe(200);
      const deterministicView = await deterministic.json() as PrivateView;
      expect(deterministicView.state_digest).not.toBe(routed.state_digest);
      expect(worker.execute).toHaveBeenCalledTimes(1);

      const stale = await privatePost(baseUrl, "/advance", {
        session_id: routed.session_id,
        state_digest: routed.state_digest
      });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toEqual({
        error: {
          code: "private_orchestration_state_stale",
          retryable: true
        }
      });
    });
  });

  it("does not advance state when the server-owned worker dies or returns an unbound result", async () => {
    const cases: Array<{
      worker: HermesSemanticExecutor;
      expectedStatus: number;
      expectedCode: string;
      retryable: boolean;
    }> = [
      {
        worker: { execute: vi.fn(async () => { throw new Error("worker killed"); }) },
        expectedStatus: 503,
        expectedCode: "private_orchestration_worker_failed",
        retryable: true
      },
      {
        worker: {
          execute: vi.fn(async ({ session_id, semantic_work }) => ({
            model_output: {
              contract_version: "askrigor_hermes_semantic_result_v1",
              session_id,
              state_digest: "f".repeat(64),
              work_type: semantic_work.kind,
              submission: { complete: true }
            },
            complete: true
          }))
        },
        expectedStatus: 422,
        expectedCode: "private_orchestration_worker_output_rejected",
        retryable: false
      }
    ];

    for (const testCase of cases) {
      await withServer({
        privateOrchestrationEnabled: true,
        privateOrchestrationApiKey: API_KEY,
        privateOrchestrationHandler: fixtureHandler(undefined, testCase.worker)
      }, async (baseUrl) => {
        const started = await privatePost(baseUrl, "/start", {
          research_target: "de-identified worker failure fixture",
          diagnosis_status: "diagnosis_not_specified"
        });
        const start = await started.json() as PrivateView;
        const response = await privatePost(baseUrl, "/advance", {
          session_id: start.session_id,
          state_digest: start.state_digest
        });
        expect(response.status).toBe(testCase.expectedStatus);
        expect(await response.json()).toEqual({
          error: {
            code: testCase.expectedCode,
            retryable: testCase.retryable
          }
        });
        const unchanged = await privatePost(baseUrl, "/status", {
          session_id: start.session_id
        });
        expect((await unchanged.json() as PrivateView).state_digest)
          .toBe(start.state_digest);
      });
    }
  });

  it("rejects unauthenticated, duplicate-auth, browser, malformed, non-JSON, and oversized requests before progress", async () => {
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler()
    }, async (baseUrl) => {
      const path = "/internal/research/v1/start";
      const missing = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      expect(missing.status).toBe(401);

      const duplicate = await rawHttpRequest(baseUrl, path, [
        ["authorization", `Bearer ${API_KEY}`],
        ["authorization", `Bearer ${API_KEY}`],
        ["content-type", "application/json"]
      ], "{}");
      expect(duplicate.status).toBe(401);

      const browser = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${API_KEY}`,
          "content-type": "application/json",
          origin: "https://example.test"
        },
        body: "{}"
      });
      expect(browser.status).toBe(403);
      expect(browser.headers.get("access-control-allow-origin")).toBeNull();

      const wrongType = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${API_KEY}`,
          "content-type": "text/plain"
        },
        body: "{}"
      });
      expect(wrongType.status).toBe(415);

      const malformed = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${API_KEY}`,
          "content-type": "application/json"
        },
        body: "not-json"
      });
      expect(malformed.status).toBe(400);

      const oversized = await fetch(new URL(path, baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${API_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ padding: "x".repeat(257 * 1_024) })
      });
      expect(oversized.status).toBe(413);

      const personal = await privatePost(baseUrl, "/start", {
        research_target: "my exact medical record: hip pain",
        diagnosis_status: "diagnosis_not_specified"
      });
      expect(personal.status).toBe(422);

      const unknown = await privatePost(baseUrl, "/status", {
        session_id: `ars1_${"Z".repeat(32)}`
      });
      expect(unknown.status).toBe(404);
    });
  });

  it("fails finalization on protocol drift and enforces the response byte ceiling", async () => {
    let hrpHash = HASH_B;
    const driftHandler = createPrivateResearchOrchestrationHandler({
      getProtocolManifest: async (protocol) => ({
        ...protocolManifest(protocol),
        sha256: protocol === "hrp" ? hrpHash : HASH_A
      })
    });
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: driftHandler
    }, async (baseUrl) => {
      const started = await privatePost(baseUrl, "/start", {
        research_target: "drift-bound private fixture",
        diagnosis_status: "diagnosis_not_specified"
      });
      const sessionId = ((await started.json()) as PrivateView).session_id;
      hrpHash = "c".repeat(64);
      const finalization = await privatePost(baseUrl, "/finalize", {
        session_id: sessionId
      });
      expect(finalization.status).toBe(200);
      expect(await finalization.json()).toMatchObject({
        authorization: "DENIED",
        denial_reasons: expect.arrayContaining(["PROTOCOL_DRIFT"]),
        output_boundary: "CONTINUE_RESEARCH"
      });
    });

    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler(64)
    }, async (baseUrl) => {
      const response = await privatePost(baseUrl, "/start", {
        research_target: "bounded response fixture",
        diagnosis_status: "diagnosis_not_specified"
      });
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: {
          code: "private_orchestration_response_too_large",
          retryable: false
        }
      });
    });
  });

  it("enforces its private rate and concurrency limiters and releases permits after errors", async () => {
    const rateLimiter: TokenBucketLimiter = { size: 1, consume: () => false };
    const deniedConcurrency: ConcurrencyLimiter = {
      inFlight: 4,
      tryAcquire: () => undefined
    };
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler(),
      privateOrchestrationRateLimiter: rateLimiter
    }, async (baseUrl) => {
      expect((await privatePost(baseUrl, "/start", {})).status).toBe(429);
    });
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler(),
      privateOrchestrationConcurrencyLimiter: deniedConcurrency
    }, async (baseUrl) => {
      expect((await privatePost(baseUrl, "/start", {})).status).toBe(503);
    });

    const limiter = createConcurrencyLimiter(1);
    await withServer({
      privateOrchestrationEnabled: true,
      privateOrchestrationApiKey: API_KEY,
      privateOrchestrationHandler: fixtureHandler(),
      privateOrchestrationRateLimiter: createTokenBucketLimiter({
        capacity: 10,
        refillTokensPerMinute: 0,
        maxKeys: 10,
        idleTtlMs: 60_000
      }),
      privateOrchestrationConcurrencyLimiter: limiter
    }, async (baseUrl) => {
      expect((await privatePost(baseUrl, "/start", { invalid: true })).status)
        .toBe(422);
      expect(limiter.inFlight).toBe(0);
      expect((await privatePost(baseUrl, "/start", {
        research_target: "second request after failure",
        diagnosis_status: "diagnosis_not_specified"
      })).status).toBe(200);
      expect(limiter.inFlight).toBe(0);
    });
  });
});

interface PrivateView {
  session_id: string;
  state_digest: string;
  output_boundary: string;
  required_next_capabilities: string[];
  semantic_work: null | {
    kind: string;
    package: {
      unresolved_module_ids?: string[];
      discovery_digest?: string;
      candidates?: Array<{ video_id: string; program_signature: string }>;
    };
  };
  last_transition?: {
    capability: string;
    result: string;
  };
}

function candidateSubmission(work: {
  discovery_digest: string;
  candidates: Array<{ video_id: string; program_signature: string }>;
}) {
  const firstByProgram = new Map<string, string>();
  for (const candidate of work.candidates) {
    if (!firstByProgram.has(candidate.program_signature)) {
      firstByProgram.set(candidate.program_signature, candidate.video_id);
    }
  }
  return {
    package_version: "askrigor_candidate_screening_v1" as const,
    discovery_digest: work.discovery_digest,
    decisions: work.candidates.map(({ video_id, program_signature }) => {
      const distinctVideoId = firstByProgram.get(program_signature)!;
      const distinct = distinctVideoId === video_id;
      return {
        video_id,
        materiality: "MATERIAL" as const,
        redundancy: distinct ? "DISTINCT" as const : "DUPLICATE" as const,
        ...(distinct ? {} : { duplicate_of_video_id: distinctVideoId }),
        selection_status: distinct ? "SELECTED" as const : "NOT_SELECTED" as const,
        rationale: "Exact public-source candidate screened for nonredundant value."
      };
    })
  };
}

async function privatePost(baseUrl: URL, suffix: string, body: unknown) {
  return fetch(new URL(`/internal/research/v1${suffix}`, baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function withServer(
  options: Parameters<typeof createAskRigorHttpServer>[0],
  callback: (baseUrl: URL) => Promise<void>
): Promise<void> {
  const server = createAskRigorHttpServer({
    publicServerEnabled: false,
    actionsEnabled: false,
    researchActionsEnabled: false,
    ...options
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  try {
    await callback(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function rawHttpRequest(
  baseUrl: URL,
  path: string,
  headers: ReadonlyArray<readonly [string, string]>,
  body: string
): Promise<{ status: number; body: string }> {
  const raw = await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: Number(baseUrl.port) }, () => {
      socket.write([
        `POST ${path} HTTP/1.1`,
        "host: localhost",
        "connection: close",
        `content-length: ${Buffer.byteLength(body)}`,
        ...headers.map(([name, value]) => `${name}: ${value}`),
        "",
        body
      ].join("\r\n"));
    });
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { response += chunk; });
    socket.once("error", reject);
    socket.once("end", () => resolve(response));
  });
  const [head, responseBody = ""] = raw.split("\r\n\r\n", 2);
  const status = Number(/^HTTP\/1\.1 ([0-9]{3})/u.exec(head!)?.[1]);
  return { status, body: responseBody };
}
