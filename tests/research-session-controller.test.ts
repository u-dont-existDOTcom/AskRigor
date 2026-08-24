import { describe, expect, it } from "vitest";

import {
  RESEARCH_MODULE_IDS,
  RESEARCH_OPERATION_IDS,
  applyProtocolRecheck,
  applyServerModuleApplicability,
  createBidirectionalIterationWorkPackage,
  createCandidateScreeningWorkPackage,
  createInitialResearchSessionState,
  createResearchSessionStore,
  createTreatmentLandscapeWorkPackage,
  deriveResearchFinalizationReadiness,
  deriveRequiredNextCapabilities,
  deriveResearchOutputBoundary,
  evaluateResearchFinalization,
  executeResearchSessionFinalCompletionAudit,
  finalizationPermitSchema,
  mapTreatmentLandscapeBoundary,
  protocolBindingsFromManifests,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordDiscussionDepthResult,
  recordNativeYoutubeDiscovery,
  recordResearchSessionBidirectionalIteration,
  recordResearchSessionTreatmentLandscape,
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
  const packet = structuredClone(researchPacket());
  const receipt = structuredClone(researchReceipt());
  packet.candidates[0]!.provisional_specific_program = "named program one";
  receipt.validated_candidates[0]!.gemini_provisional_annotations.specific_program =
    "named program one";
  let initial = recordAutomatedScoutCompletion(initialState(), {
    providerResponseId: "interaction-narrow-completion",
    packet,
    receipt
  });
  const discovered = recordNativeYoutubeDiscovery(initial, nativeSurvey());
  const candidateWork = createCandidateScreeningWorkPackage(
    discovered.candidate_discovery
  );
  let state = recordCandidateScreeningCompletion(
    discovered,
    {
      package_version: candidateWork.package_version,
      discovery_digest: candidateWork.discovery_digest,
      decisions: discovered.candidate_discovery.candidates.map((candidate) => ({
        video_id: candidate.video_id,
        materiality: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
          ? "MATERIAL" as const
          : "NOT_MATERIAL" as const,
        redundancy: "DISTINCT" as const,
        selection_status: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
          ? "SELECTED" as const
          : "NOT_SELECTED" as const,
        rationale: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
          ? "Only material program in the narrow completion fixture."
          : "Screened as not decision relevant in the narrow completion fixture."
      }))
    }
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
      execution_status: moduleId === "BIDIRECTIONAL_ITERATION" ||
        moduleId === "FINAL_COMPLETION_AUDIT"
        ? "NOT_STARTED"
        : "COMPLETE",
      authority: "SERVER_ROUTER"
    };
  }
  const operations = structuredClone(state.operations);
  for (const operationId of [
    "formal_evidence_search",
    "accessible_full_text_acquisition",
    "study_method_audit",
    "external_study_evidence_audit",
    "linked_replication_and_review_audit",
    "claim_capability_recalculation"
  ] as const) operations[operationId] = { status: "COMPLETE" };
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
  let ready = researchSessionStateSchema.parse({
    ...state,
    modules,
    operations,
    formal_evidence: formalEvidence
  });
  const work = createBidirectionalIterationWorkPackage(
    ready.bidirectional_iteration,
    {
      candidates: ready.candidate_discovery,
      videoDepth: ready.video_depth,
      formalEvidence: ready.formal_evidence
    }
  );
  ready = recordResearchSessionBidirectionalIteration(ready, {
    package_version: work.package_version,
    evidence_basis_digest: work.evidence_basis_digest,
    round_number: work.round_number,
    community_to_formal_assessments: work.community_evidence.map(({ evidence_ref_id }) => ({
      evidence_ref_id,
      disposition: "NO_NEW_MATERIAL_TRANSFER",
      rationale: "Fixture has no new material community-to-formal transfer."
    })),
    formal_to_community_assessments: work.formal_evidence.map(({ evidence_ref_id }) => ({
      evidence_ref_id,
      disposition: "NO_NEW_MATERIAL_TRANSFER",
      rationale: "Fixture has no new material formal-to-community transfer."
    })),
    transfers: [],
    discordances: []
  });
  const treatmentWork = createTreatmentLandscapeWorkPackage(
    ready.treatment_finalization,
    {
      researchTarget: ready.research_target,
      candidates: ready.candidate_discovery,
      videoDepth: ready.video_depth,
      formalEvidence: ready.formal_evidence,
      bidirectional: ready.bidirectional_iteration
    }
  );
  const material = treatmentWork.candidates.find(({ materiality }) =>
    materiality === "MATERIAL"
  )!;
  const batch = treatmentWork.discovery_batches.find(({ query_or_scope }) =>
    query_or_scope.includes("named program one")
  )!;
  ready = recordResearchSessionTreatmentLandscape(ready, {
    package_version: treatmentWork.package_version,
    evidence_basis_digest: treatmentWork.evidence_basis_digest,
    attempt: treatmentWork.attempt,
    broad_treatment_choice: false,
    specific_implementation_searches: [{
      search_id: "specific_named_program_one",
      discovery_batch_id: batch.batch_id,
      treatment_class_id: material.treatment_class_id,
      implementation_terms: ["named program one"],
      discriminator_terms: ["condition"],
      candidate_video_ids: [material.video_id]
    }],
    directional_search_batches: {
      benefit: [],
      no_effect_or_failure: [],
      harm: [],
      discontinuation: [],
      eventual_standard_treatment: []
    },
    selected_video_interpretations: treatmentWork.selected_videos.map(({ video_id }) => ({
      video_id,
      stage_or_baseline: "Population and stage described by the exact source.",
      outcome_and_horizon: "Walking outcome at the reported horizon.",
      nonredundant_value: "Only material program in the narrow completion fixture.",
      what_it_changed: "Added source-bound real-world implementation evidence."
    })),
    further_expansion_likely_to_improve_answer: "no"
  });
  return executeResearchSessionFinalCompletionAudit(ready);
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
    expect(deriveResearchFinalizationReadiness(finished)).toBe("FINALIZATION_ALLOWED");
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

  it("rejects forged final-audit checks and keeps undercovered work nonfinal", () => {
    const finished = phaseACompletionFixture();
    const forged = structuredClone(finished);
    forged.final_completion_audit!.checks[0]!.summary =
      "Caller-authored replacement for a server-owned completion check.";
    expect(() => researchSessionStateSchema.parse(forged))
      .toThrow(/server-derived checks exactly/u);

    const undercovered = researchSessionStateSchema.parse({
      ...finished,
      treatment_finalization: { ...finished.treatment_finalization, attempts: [] },
      final_completion_audit: undefined,
      modules: {
        ...finished.modules,
        FINAL_COMPLETION_AUDIT: {
          ...finished.modules.FINAL_COMPLETION_AUDIT,
          execution_status: "NOT_STARTED",
          authority: "SERVER_EVIDENCE"
        }
      },
      operations: {
        ...finished.operations,
        treatment_landscape_finalization: { status: "NOT_STARTED" },
        final_completion_audit: { status: "NOT_STARTED" }
      }
    });
    const audited = executeResearchSessionFinalCompletionAudit(undercovered);
    expect(audited.final_completion_audit).toMatchObject({ status: "FAIL" });
    expect(audited.final_completion_audit?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ check_id: "TREATMENT_LOCKS_PASS", status: "FAIL" })
    ]));
    expect(deriveResearchFinalizationReadiness(audited)).toBe("CONTINUE_RESEARCH");
  });

  it("maps an otherwise resolved terminal treatment boundary only to bounded nonranking output", () => {
    const finished = phaseACompletionFixture();
    const treatment = structuredClone(finished.treatment_finalization);
    const latest = treatment.attempts.at(-1)!;
    latest.assessment = {
      ...latest.assessment,
      selection_coverage_lock: "block",
      per_video_depth_lock: "pass",
      synthesis_lock: "block",
      answer_boundary: "bounded_nonranking_only",
      boundary_blockers: ["One exact source path reached a nonretryable boundary."],
      blockers: ["One exact source path reached a nonretryable boundary."],
      access_boundary_ids_used: ["formal_program_fixture"]
    };
    const bounded = researchSessionStateSchema.parse({
      ...finished,
      treatment_finalization: treatment,
      final_completion_audit: undefined,
      modules: {
        ...finished.modules,
        FINAL_COMPLETION_AUDIT: {
          ...finished.modules.FINAL_COMPLETION_AUDIT,
          execution_status: "NOT_STARTED",
          authority: "SERVER_EVIDENCE"
        }
      },
      operations: {
        ...finished.operations,
        treatment_landscape_finalization: {
          status: "BLOCKED_TERMINAL",
          boundary: {
            classification: "TERMINAL_NONRETRYABLE",
            code: "TREATMENT_LANDSCAPE_BOUNDED_NONRANKING",
            summary: "The current treatment landscape permits only bounded nonranking output."
          }
        },
        final_completion_audit: { status: "NOT_STARTED" }
      }
    });

    expect(deriveResearchFinalizationReadiness(bounded))
      .toBe("BOUNDED_NONRANKING_ONLY");
    expect(deriveResearchOutputBoundary(bounded)).toBe("BOUNDED_NONRANKING_ONLY");
    expect(evaluateResearchFinalization(SESSION_ID, bounded)).toMatchObject({
      authorization: "DENIED",
      output_boundary: "BOUNDED_NONRANKING_ONLY",
      finalization_permit: null,
      denial_reasons: expect.arrayContaining([
        "TERMINAL_BOUNDARY_LIMITS_OUTPUT",
        "PHASE_A_FINALIZATION_NOT_ENABLED"
      ])
    });
  });

  it("mutation-checks every required module and operation completion condition", () => {
    const finished = phaseACompletionFixture();
    const withoutFinalAudit = {
      ...finished,
      final_completion_audit: undefined,
      modules: {
        ...finished.modules,
        FINAL_COMPLETION_AUDIT: {
          ...finished.modules.FINAL_COMPLETION_AUDIT,
          execution_status: "NOT_STARTED" as const
        }
      },
      operations: {
        ...finished.operations,
        final_completion_audit: { status: "NOT_STARTED" as const }
      }
    };

    for (const moduleId of RESEARCH_MODULE_IDS) {
      const modules = structuredClone(withoutFinalAudit.modules);
      modules[moduleId].execution_status = "NOT_STARTED";
      const mutated = researchSessionStateSchema.parse({ ...withoutFinalAudit, modules });
      expect(
        evaluateResearchFinalization(SESSION_ID, mutated).denial_reasons,
        `module completion check removed for ${moduleId}`
      ).toContain("REQUIRED_MODULE_INCOMPLETE");
    }

    for (const operationId of RESEARCH_OPERATION_IDS) {
      if (operationId === "automated_video_scout") continue;
      const operations = structuredClone(withoutFinalAudit.operations);
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
        operationId === "claim_capability_recalculation" ||
        operationId === "bidirectional_evidence_return" ||
        operationId === "treatment_landscape_finalization"
      ) {
        expect(() => researchSessionStateSchema.parse({ ...withoutFinalAudit, operations }))
          .toThrow(/depth|derived.*(?:per-video|per-source).*state|source-bound iteration|session-owned coverage assessment/u);
        continue;
      }
      const mutated = researchSessionStateSchema.parse({ ...withoutFinalAudit, operations });
      expect(
        evaluateResearchFinalization(SESSION_ID, mutated).denial_reasons,
        `operation completion check removed for ${operationId}`
      ).toContain("REQUIRED_OPERATION_INCOMPLETE");
    }

    const scoutMissing = initialState();
    expect(
      evaluateResearchFinalization(SESSION_ID, scoutMissing).denial_reasons
    ).toContain("REQUIRED_OPERATION_INCOMPLETE");
  });
});
