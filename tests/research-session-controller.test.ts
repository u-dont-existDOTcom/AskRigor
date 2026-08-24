import { describe, expect, it } from "vitest";

import {
  RESEARCH_MODULE_IDS,
  RESEARCH_OPERATION_IDS,
  applyProtocolRecheck,
  applyServerModuleApplicability,
  createInitialResearchSessionState,
  createResearchSessionStore,
  deriveRequiredNextCapabilities,
  deriveResearchOutputBoundary,
  evaluateResearchFinalization,
  finalizationPermitSchema,
  mapTreatmentLandscapeBoundary,
  protocolBindingsFromManifests,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordDiscussionDepthResult,
  recordNativeYoutubeDiscovery,
  recordTranscriptDepthResult,
  researchSessionStateSchema,
  type ResearchSessionState
} from "../apps/research-mcp/src/index.js";
import { deriveGeminiYoutubeCandidateFrontier } from "../packages/sources/src/index.js";
import {
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import {
  discussionOutput,
  screeningSubmissionFor,
  transcriptOutput
} from "./helpers/research-video-depth-fixtures.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const SESSION_ID = `ars1_${"A".repeat(32)}`;

function manifest(protocol: "universal" | "hrp", hash?: string) {
  return {
    name: protocol === "universal" ? "Universal Instructions" : "Health Research Protocol",
    version: protocol === "universal" ? "20.5.14" : "20.5.22",
    revisionDate: protocol === "universal" ? "2026-08-18" : "2026-08-23",
    sha256: hash ?? (protocol === "universal" ? HASH_A : HASH_B)
  };
}

function initialState(): ResearchSessionState {
  return createInitialResearchSessionState({
    research_target: "de-identified treatment comparison",
    diagnosis_status: "diagnosis_not_specified"
  }, protocolBindingsFromManifests(manifest("universal"), manifest("hrp")));
}

function scoutComplete(state = initialState()): ResearchSessionState {
  return recordAutomatedScoutCompletion(state, {
    providerResponseId: "interaction-1",
    packet: researchPacket(),
    receipt: researchReceipt()
  });
}

function phaseACompletionFixture(): ResearchSessionState {
  const discovered = recordNativeYoutubeDiscovery(scoutComplete(), nativeSurvey());
  let state = recordCandidateScreeningCompletion(
    discovered,
    screeningSubmissionFor(discovered.candidate_discovery)
  );
  for (const videoId of state.video_depth.selected_video_ids) {
    state = recordTranscriptDepthResult(state, videoId, transcriptOutput(videoId));
    state = recordDiscussionDepthResult(
      state,
      videoId,
      undefined,
      discussionOutput(videoId)
    );
  }
  const modules = structuredClone(state.modules);
  for (const moduleId of RESEARCH_MODULE_IDS) {
    modules[moduleId] = {
      applicability: "REQUIRED",
      execution_status: "COMPLETE",
      authority: "SERVER_ROUTER"
    };
  }
  const operations = structuredClone(state.operations);
  for (const operationId of RESEARCH_OPERATION_IDS) {
    operations[operationId] = { status: "COMPLETE" };
  }
  const formalEvidence = structuredClone(state.formal_evidence);
  for (const hypothesis of formalEvidence.hypotheses) {
    for (const search of hypothesis.provider_searches) {
      search.status = "COMPLETE";
      search.pages_retrieved = 1;
      search.records_returned_cumulative = 0;
      search.page_receipt_hashes = ["d".repeat(64)];
      search.access_statuses = ["complete"];
    }
  }
  return researchSessionStateSchema.parse({
    ...state,
    modules,
    operations,
    formal_evidence: formalEvidence
  });
}

describe("research session controller core", () => {
  it("represents every router module explicitly and derives capabilities from state", () => {
    const state = initialState();

    expect(Object.keys(state.modules)).toEqual(RESEARCH_MODULE_IDS);
    expect(state.modules.HRP).toMatchObject({
      applicability: "REQUIRED",
      execution_status: "IN_PROGRESS"
    });
    expect(state.modules.FINAL_COMPLETION_AUDIT).toMatchObject({
      applicability: "REQUIRED",
      execution_status: "NOT_STARTED"
    });
    expect(state.modules.FORUM_SIGNAL.applicability).toBe("UNRESOLVED");
    expect(deriveRequiredNextCapabilities(state)).toEqual([
      "route_module_applicability",
      "automated_video_scout"
    ]);

    expect(deriveRequiredNextCapabilities(scoutComplete(state))).toEqual([
      "route_module_applicability",
      "native_video_discovery"
    ]);
  });

  it("makes REQUIRED applicability monotonic in both controller and store", () => {
    const state = initialState();
    expect(() => applyServerModuleApplicability(
      state,
      { HRP: "NOT_REQUIRED" },
      "SERVER_ROUTER"
    )).toThrow(/cannot be demoted/u);

    const store = createResearchSessionStore({
      random: () => new Uint8Array(24).fill(1)
    });
    const sessionId = store.issue(state);
    const claimed = store.claim(sessionId);
    const forged = researchSessionStateSchema.parse({
      ...claimed,
      modules: {
        ...claimed.modules,
        HRP: {
          applicability: "NOT_REQUIRED",
          execution_status: "NOT_APPLICABLE",
          authority: "SERVER_ROUTER"
        }
      }
    });
    expect(() => store.replace(sessionId, forged)).toThrow(/cannot be demoted/u);
    store.rollback(sessionId);
  });

  it("detects exact protocol drift and keeps it monotonic", () => {
    const state = initialState();
    const drifted = applyProtocolRecheck(
      state,
      protocolBindingsFromManifests(
        manifest("universal", HASH_C),
        manifest("hrp")
      )
    );

    expect(drifted.protocol_binding.currency).toBe("DRIFTED");
    expect(deriveRequiredNextCapabilities(drifted)).toEqual([
      "restart_under_current_protocols"
    ]);
    expect(evaluateResearchFinalization(SESSION_ID, drifted)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
      finalization_permit: null,
      denial_reasons: expect.arrayContaining(["PROTOCOL_DRIFT"])
    });

    const stillDrifted = applyProtocolRecheck(
      drifted,
      protocolBindingsFromManifests(manifest("universal"), manifest("hrp"))
    );
    expect(stillDrifted.protocol_binding.currency).toBe("DRIFTED");
  });

  it("keeps unresolved scout identities executable and blocks downstream screening", () => {
    const packet = researchPacket();
    const receipt = researchReceipt();
    const unresolvedId = RESEARCH_FIXTURE_VIDEO_IDS[2];
    const partial = recordAutomatedScoutCompletion(initialState(), {
      providerResponseId: "interaction-partial",
      packet,
      receipt: {
        ...receipt,
        status: "partial",
        candidate_frontier: deriveGeminiYoutubeCandidateFrontier(
          RESEARCH_FIXTURE_VIDEO_IDS,
          RESEARCH_FIXTURE_VIDEO_IDS.slice(0, 2),
          [],
          [unresolvedId]
        ),
        validated_candidates: receipt.validated_candidates.slice(0, 2),
        unresolved_candidates: [{
          video_id: unresolvedId,
          metadata_access_status: "rate_limited",
          retryable: true,
          provider_error_code: "youtube_rate_limited",
          limitations: ["Retryable fixture boundary."]
        }]
      }
    });

    expect(partial.operations.automated_video_scout.status).toBe("BLOCKED_RETRYABLE");
    expect(deriveRequiredNextCapabilities(partial)).toEqual([
      "route_module_applicability",
      "automated_video_scout"
    ]);
    expect(partial.candidate_discovery.candidates).toHaveLength(2);
  });

  it("maps treatment boundaries without treating a component lock as global synthesis", () => {
    expect(mapTreatmentLandscapeBoundary("continue_research")).toBe(
      "CONTINUE_RESEARCH"
    );
    expect(mapTreatmentLandscapeBoundary("bounded_nonranking_only")).toBe(
      "BOUNDED_NONRANKING_ONLY"
    );
    expect(mapTreatmentLandscapeBoundary("ledger_consistent_for_synthesis")).toBe(
      "CONTINUE_RESEARCH"
    );
  });

  it("does not equate a valid terminal boundary with completion", () => {
    const boundedScout = recordAutomatedScoutBoundary(initialState(), {
      classification: "TERMINAL_NONRETRYABLE",
      code: "AUTOMATED_SCOUT_TERMINAL_BOUNDARY",
      summary: "The required provider returned a recognized terminal boundary."
    });
    expect(deriveResearchOutputBoundary(boundedScout)).toBe("CONTINUE_RESEARCH");
    expect(evaluateResearchFinalization(SESSION_ID, boundedScout)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
      denial_reasons: expect.arrayContaining([
        "TERMINAL_BOUNDARY_LIMITS_OUTPUT",
        "REQUIRED_OPERATION_INCOMPLETE"
      ])
    });

    const otherwiseFinished = phaseACompletionFixture();
    const terminalOperation = {
      status: "BLOCKED_TERMINAL" as const,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE" as const,
        code: "FORMAL_SOURCE_TERMINAL_BOUNDARY",
        summary: "One exact source remained inaccessible after lawful acquisition."
      }
    };
    expect(() => researchSessionStateSchema.parse({
      ...otherwiseFinished,
      operations: {
        ...otherwiseFinished.operations,
        accessible_full_text_acquisition: terminalOperation
      }
    })).toThrow(/derived exactly from per-source formal evidence state/u);
  });

  it("defines the future permit contract without enabling issuance", () => {
    const finished = phaseACompletionFixture();
    expect(evaluateResearchFinalization(SESSION_ID, finished)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
      finalization_permit: null,
      denial_reasons: ["PHASE_A_FINALIZATION_NOT_ENABLED"]
    });
    expect(finalizationPermitSchema.safeParse({
      permit_version: "askrigor_finalization_permit_v1",
      execution_id: SESSION_ID,
      output_boundary: "FINALIZATION_ALLOWED",
      protocol_identities: finished.protocol_binding.expected,
      state_digest: "d".repeat(64),
      issued_at: "2026-08-23T00:00:00.000Z",
      expires_at: "2026-08-23T01:00:00.000Z",
      domain: "askrigor.research.finalization"
    }).success).toBe(true);
  });

  it("mutation-checks every required module and operation completion condition", () => {
    const finished = phaseACompletionFixture();

    for (const moduleId of RESEARCH_MODULE_IDS) {
      const modules = structuredClone(finished.modules);
      modules[moduleId].execution_status = "NOT_STARTED";
      const mutated = researchSessionStateSchema.parse({ ...finished, modules });
      expect(
        evaluateResearchFinalization(SESSION_ID, mutated).denial_reasons,
        `module completion check removed for ${moduleId}`
      ).toContain("REQUIRED_MODULE_INCOMPLETE");
    }

    for (const operationId of RESEARCH_OPERATION_IDS) {
      if (operationId === "automated_video_scout") continue;
      const operations = structuredClone(finished.operations);
      operations[operationId] = { status: "NOT_STARTED" };
      if (
        operationId === "candidate_screening" ||
        operationId === "transcript_acquisition" ||
        operationId === "community_discussion_audit" ||
        operationId === "formal_evidence_search" ||
        operationId === "accessible_full_text_acquisition" ||
        operationId === "study_method_audit" ||
        operationId === "external_study_evidence_audit" ||
        operationId === "linked_replication_and_review_audit" ||
        operationId === "claim_capability_recalculation"
      ) {
        expect(() => researchSessionStateSchema.parse({ ...finished, operations }))
          .toThrow(/depth|derived.*(?:per-video|per-source).*state/u);
        continue;
      }
      const mutated = researchSessionStateSchema.parse({ ...finished, operations });
      expect(
        evaluateResearchFinalization(SESSION_ID, mutated).denial_reasons,
        `operation completion check removed for ${operationId}`
      ).toContain("REQUIRED_OPERATION_INCOMPLETE");
    }

    const scoutMissing = initialState();
    const modules = structuredClone(finished.modules);
    const operations = structuredClone(finished.operations);
    operations.automated_video_scout = { status: "NOT_STARTED" };
    operations.native_video_discovery = { status: "NOT_STARTED" };
    operations.candidate_screening = { status: "NOT_STARTED" };
    const mutatedScout = researchSessionStateSchema.parse({
      ...scoutMissing,
      modules,
      operations
    });
    expect(
      evaluateResearchFinalization(SESSION_ID, mutatedScout).denial_reasons
    ).toContain("REQUIRED_OPERATION_INCOMPLETE");
  });
});
