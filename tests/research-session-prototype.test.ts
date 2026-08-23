import { describe, expect, it, vi } from "vitest";

import {
  createResearchSessionPrototypeRoutes,
  type ActionRoute
} from "../apps/research-mcp/src/index.js";
import type {
  scoutGeminiYoutubeCandidates,
  validateGeminiYoutubeCandidateHandoff
} from "../packages/sources/src/index.js";
import {
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function context(body: unknown) {
  return { request: {} as never, clientIp: "192.0.2.1", body };
}

function route(routes: readonly ActionRoute[], operationId: string): ActionRoute {
  const found = routes.find((candidate) => candidate.operationId === operationId);
  if (found === undefined) throw new Error(`Missing route ${operationId}`);
  return found;
}

function protocolManifest(protocol: "universal" | "hrp") {
  return {
    name: protocol === "universal" ? "Universal Instructions" : "Health Research Protocol",
    version: protocol === "universal" ? "20.5.14" : "20.5.22",
    revisionDate: protocol === "universal" ? "2026-08-18" : "2026-08-23",
    sha256: protocol === "universal" ? HASH_A : HASH_B
  };
}

describe("server-owned research session feasibility routes", () => {
  it("owns the protocol-bound state, executes one automated scout step, and refuses premature finalization", async () => {
    const scout = vi.fn<typeof scoutGeminiYoutubeCandidates>(async () => ({
      provider: "gemini_api",
      record_type: "gemini_youtube_candidate_frontier",
      primary_identifier: "interaction-1",
      retrieved_at: "2026-08-23T00:00:00.000Z",
      source_identity: {},
      pagination: { returned: 3, exhausted: true },
      access_status: "complete",
      limitations: [],
      data: {
        response_id: "interaction-1",
        model: "fixture-model",
        google_search_grounded: true,
        packet: researchPacket()
      }
    }));
    const validate = vi.fn<typeof validateGeminiYoutubeCandidateHandoff>(
      async () => researchReceipt()
    );
    const survey = vi.fn(async () => nativeSurvey());
    const routes = createResearchSessionPrototypeRoutes({
      getProtocolManifest: async (protocol) => protocolManifest(protocol),
      scout,
      validateCandidates: validate,
      surveyNativeCandidates: survey,
      loadScoutInstructions: async () => "Exact repository scout instructions",
      geminiConfig: { apiKey: "server-held-gemini-key", model: "fixture-model" },
      youtubeApiKey: "server-held-youtube-key"
    });

    const started = await route(routes, "start_research_session").handle(context({
      research_target: "de-identified treatment comparison",
      diagnosis_status: "diagnosis_not_specified"
    }));
    expect(started).toMatchObject({
      status: 200,
      body: {
        session_id: expect.stringMatching(/^ars1_/u),
        execution_status: "IN_PROGRESS",
        output_boundary: "CONTINUE_RESEARCH",
        protocol_binding: {
          currency: "CURRENT",
          expected: [
            { protocol: "universal", version: "20.5.14", sha256: HASH_A },
            { protocol: "hrp", version: "20.5.22", sha256: HASH_B }
          ]
        },
        modules: {
          HRP: { applicability: "REQUIRED", execution_status: "IN_PROGRESS" },
          FORUM_SIGNAL: { applicability: "UNRESOLVED" },
          FINAL_COMPLETION_AUDIT: {
            applicability: "REQUIRED",
            execution_status: "NOT_STARTED"
          }
        },
        required_next_capabilities: [
          "route_module_applicability",
          "automated_video_scout"
        ],
        finalization_permit: null
      }
    });
    const sessionId = (started.body as { session_id: string }).session_id;

    const continued = await route(routes, "continue_research_session").handle(context({
      session_id: sessionId
    }));
    expect(continued).toMatchObject({
      status: 200,
      body: {
        execution_status: "IN_PROGRESS",
        output_boundary: "CONTINUE_RESEARCH",
        scout: {
          status: "COMPLETE",
          candidate_count: 3,
          validated_candidate_count: 3,
          unresolved_candidate_count: 0
        },
        operations: {
          automated_video_scout: { status: "COMPLETE" },
          native_video_discovery: { status: "NOT_STARTED" }
        },
        required_next_capabilities: [
          "route_module_applicability",
          "native_video_discovery",
          "formal_evidence_search"
        ],
        last_transition: {
          capability: "automated_video_scout",
          result: "complete"
        }
      }
    });
    expect(scout).toHaveBeenCalledWith({
      researchTarget: "de-identified treatment comparison",
      diagnosisStatus: "diagnosis_not_specified",
      scoutInstructions: "Exact repository scout instructions"
    }, {
      apiKey: "server-held-gemini-key",
      model: "fixture-model"
    });
    expect(validate).toHaveBeenCalledWith(
      expect.stringContaining('"packet_version":"2.0"'),
      { apiKey: "server-held-youtube-key" }
    );

    const discovered = await route(routes, "continue_research_session").handle(context({
      session_id: sessionId
    }));
    expect(discovered).toMatchObject({
      status: 200,
      body: {
        operations: {
          automated_video_scout: { status: "COMPLETE" },
          native_video_discovery: { status: "COMPLETE" }
        },
        candidate_discovery: {
          external_source_candidates: 3,
          native_source_candidates: 2,
          reconciled_candidates: 4,
          multiple_source_candidates: 1,
          unresolved_identity_video_ids: [],
          semantic_screening_pending: 4
        },
        required_next_capabilities: [
          "route_module_applicability",
          "candidate_screening",
          "formal_evidence_search"
        ],
        last_transition: {
          capability: "native_video_discovery",
          result: "complete"
        }
      }
    });
    expect(survey).toHaveBeenCalledWith({
      research_question: "de-identified treatment comparison",
      searches: expect.arrayContaining([
        { direction: "general", query: "condition what worked program" },
        { direction: "benefit", query: "condition standard benefit" }
      ]),
      results_per_search: 10
    }, { apiKey: "server-held-youtube-key" });

    const finalized = await route(routes, "finalize_research_report").handle(context({
      session_id: sessionId
    }));
    expect(finalized).toMatchObject({
      status: 200,
      body: {
        authorization: "DENIED",
        output_boundary: "CONTINUE_RESEARCH",
        finalization_permit: null,
        denial_reasons: expect.arrayContaining([
          "MODULE_APPLICABILITY_UNRESOLVED",
          "REQUIRED_MODULE_INCOMPLETE",
          "REQUIRED_OPERATION_INCOMPLETE",
          "PHASE_A_FINALIZATION_NOT_ENABLED"
        ]),
        required_next_capabilities: expect.arrayContaining([
          "candidate_screening",
          "formal_evidence_search"
        ])
      }
    });
  });

  it("rejects every caller-authored completion, count, and module claim", async () => {
    const routes = createResearchSessionPrototypeRoutes({
      getProtocolManifest: async (protocol) => protocolManifest(protocol)
    });
    const result = await route(routes, "start_research_session").handle(context({
      research_target: "de-identified treatment comparison",
      diagnosis_status: "diagnosis_not_specified",
      complete: true,
      synthesis_permitted: true,
      completed_operations: ["everything"],
      completed_operation_count: 99,
      candidate_count: 99,
      modules: {
        HRP: { applicability: "NOT_REQUIRED" }
      }
    }));

    expect(result).toEqual({
      status: 422,
      body: { error: { code: "action_input_invalid", retryable: false } }
    });

    const started = await route(routes, "start_research_session").handle(context({
      research_target: "de-identified treatment comparison",
      diagnosis_status: "diagnosis_not_specified"
    }));
    const sessionId = (started.body as { session_id: string }).session_id;
    const forgedContinuation = await route(
      routes,
      "continue_research_session"
    ).handle(context({
      session_id: sessionId,
      complete: true,
      completed_operations: ["automated_video_scout"],
      completed_operation_count: 1,
      candidate_count: 50,
      candidate_video_ids: ["XpZHKGGCK-o"],
      candidates: [{ video_id: "XpZHKGGCK-o", materiality: "MATERIAL" }]
    }));
    expect(forgedContinuation).toEqual(result);
    const forgedFinalization = await route(
      routes,
      "finalize_research_report"
    ).handle(context({
      session_id: sessionId,
      synthesis_permitted: true,
      all_work_done: true
    }));
    expect(forgedFinalization).toEqual(result);

    const status = await route(routes, "get_research_session_status").handle(context({
      session_id: sessionId
    }));
    expect(status).toMatchObject({
      status: 200,
      body: {
        operations: { automated_video_scout: { status: "NOT_STARTED" } },
        output_boundary: "CONTINUE_RESEARCH",
        finalization_permit: null
      }
    });
  });

  it("blocks honestly when automated scouting is not configured and never asks for a manual packet", async () => {
    const scout = vi.fn<typeof scoutGeminiYoutubeCandidates>();
    const routes = createResearchSessionPrototypeRoutes({
      getProtocolManifest: async (protocol) => protocolManifest(protocol),
      scout
    });
    const started = await route(routes, "start_research_session").handle(context({
      research_target: "de-identified treatment comparison",
      diagnosis_status: "diagnosis_not_specified"
    }));
    const sessionId = (started.body as { session_id: string }).session_id;

    const continued = await route(routes, "continue_research_session").handle(context({
      session_id: sessionId
    }));

    expect(continued).toMatchObject({
      status: 200,
      body: {
        execution_status: "BLOCKED_RETRYABLE",
        output_boundary: "CONTINUE_RESEARCH",
        scout: {
          status: "BLOCKED",
          access_boundary: {
            classification: "RETRYABLE",
            code: "AUTOMATED_SCOUT_NOT_CONFIGURED",
            summary: expect.stringContaining("no manual packet was substituted")
          }
        },
        required_next_capabilities: expect.arrayContaining([
          "automated_video_scout"
        ])
      }
    });
    expect(scout).not.toHaveBeenCalled();
  });

  it("rechecks protocol identity before continuation and finalization", async () => {
    let drifted = false;
    const scout = vi.fn<typeof scoutGeminiYoutubeCandidates>();
    const routes = createResearchSessionPrototypeRoutes({
      getProtocolManifest: async (protocol) => ({
        ...protocolManifest(protocol),
        sha256: drifted && protocol === "hrp" ? "c".repeat(64) :
          protocolManifest(protocol).sha256
      }),
      scout,
      geminiConfig: { apiKey: "server-held-gemini-key", model: "fixture-model" },
      youtubeApiKey: "server-held-youtube-key"
    });
    const started = await route(routes, "start_research_session").handle(context({
      research_target: "de-identified treatment comparison",
      diagnosis_status: "diagnosis_not_specified"
    }));
    const sessionId = (started.body as { session_id: string }).session_id;
    drifted = true;

    const continued = await route(routes, "continue_research_session").handle(context({
      session_id: sessionId
    }));
    expect(continued).toMatchObject({
      status: 200,
      body: {
        execution_status: "PROTOCOL_DRIFT",
        output_boundary: "CONTINUE_RESEARCH",
        protocol_binding: { currency: "DRIFTED" },
        required_next_capabilities: ["restart_under_current_protocols"],
        last_transition: {
          capability: "protocol_currency_recheck",
          result: "protocol_drift"
        }
      }
    });
    expect(scout).not.toHaveBeenCalled();

    const finalized = await route(routes, "finalize_research_report").handle(context({
      session_id: sessionId
    }));
    expect(finalized).toMatchObject({
      status: 200,
      body: {
        authorization: "DENIED",
        output_boundary: "CONTINUE_RESEARCH",
        finalization_permit: null,
        denial_reasons: expect.arrayContaining(["PROTOCOL_DRIFT"]),
        required_next_capabilities: ["restart_under_current_protocols"]
      }
    });
  });

  it("returns a bounded invalid-or-expired error for unknown sessions", async () => {
    const routes = createResearchSessionPrototypeRoutes();
    const result = await route(routes, "get_research_session_status").handle(context({
      session_id: `ars1_${"A".repeat(32)}`
    }));

    expect(result).toEqual({
      status: 422,
      body: {
        error: {
          code: "research_session_invalid_or_expired",
          retryable: false
        }
      }
    });

    const continued = await route(routes, "continue_research_session").handle(context({
      session_id: `ars1_${"A".repeat(32)}`
    }));
    expect(continued).toEqual(result);
  });
});
