import { describe, expect, it } from "vitest";

import {
  createBidirectionalIterationWorkPackage,
  createCandidateScreeningWorkPackage,
  createTreatmentLandscapeWorkPackage,
  deriveTreatmentFinalizationDiagnostics,
  deriveTreatmentFinalizationStatus,
  ingestBidirectionalIterationSubmission,
  ingestCandidateScreeningSubmission,
  ingestDiscussionActionOutput,
  ingestNativeYoutubeSurvey,
  ingestTranscriptActionOutput,
  ingestTreatmentLandscapeSubmission,
  ingestValidatedGeminiFrontier,
  initialResearchBidirectionalIterationState,
  initialResearchCandidateDiscoveryState,
  initialResearchTreatmentFinalizationState,
  initializeResearchFormalEvidence,
  initializeResearchVideoDepth,
  type TreatmentFinalizationEvidence
} from "../apps/research-mcp/src/index.js";
import {
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import {
  discussionOutput,
  transcriptOutput
} from "./helpers/research-video-depth-fixtures.js";

function narrowCompleteEvidence(options: { formalBoundary?: boolean } = {}): TreatmentFinalizationEvidence {
  const packet = structuredClone(researchPacket());
  const receipt = structuredClone(researchReceipt());
  packet.candidates[0]!.provisional_specific_program = "named program one";
  receipt.validated_candidates[0]!.gemini_provisional_annotations.specific_program =
    "named program one";
  let candidates = initialResearchCandidateDiscoveryState();
  candidates = ingestValidatedGeminiFrontier(
    candidates,
    packet,
    receipt,
    "interaction-treatment"
  );
  candidates = ingestNativeYoutubeSurvey(candidates, nativeSurvey());
  const work = createCandidateScreeningWorkPackage(candidates);
  candidates = ingestCandidateScreeningSubmission(candidates, {
    package_version: work.package_version,
    discovery_digest: work.discovery_digest,
    decisions: candidates.candidates.map((candidate) => ({
      video_id: candidate.video_id,
      materiality: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
        ? "MATERIAL" as const
        : "NOT_MATERIAL" as const,
      redundancy: "DISTINCT" as const,
      selection_status: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
        ? "SELECTED" as const
        : "NOT_SELECTED" as const,
      rationale: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
        ? "The only material program in this narrow fixture."
        : "Screened as not decision-relevant in this narrow fixture."
    }))
  });
  let videoDepth = initializeResearchVideoDepth(candidates);
  const videoId = videoDepth.selected_video_ids[0]!;
  videoDepth = ingestTranscriptActionOutput(
    videoDepth,
    videoId,
    transcriptOutput(videoId)
  );
  videoDepth = ingestDiscussionActionOutput(
    videoDepth,
    videoId,
    undefined,
    discussionOutput(videoId)
  );
  let formalEvidence = initializeResearchFormalEvidence(
    candidates,
    "de-identified treatment comparison"
  );
  formalEvidence = {
    ...formalEvidence,
    hypotheses: formalEvidence.hypotheses.map((hypothesis) => ({
      ...hypothesis,
      provider_searches: hypothesis.provider_searches.map((search) => ({
        ...search,
        status: options.formalBoundary ? "BLOCKED_TERMINAL" as const : "COMPLETE" as const,
        pages_retrieved: options.formalBoundary ? 0 : 1,
        page_receipt_hashes: options.formalBoundary ? [] : ["d".repeat(64)],
        access_statuses: [options.formalBoundary ? "inaccessible" : "complete"],
        ...(options.formalBoundary
          ? {
            boundary: {
              classification: "TERMINAL_NONRETRYABLE" as const,
              code: "FORMAL_PROVIDER_TERMINAL_BOUNDARY",
              summary: "The exact provider search reached a nonretryable source boundary."
            }
          }
          : {})
      })) as typeof hypothesis.provider_searches
    }))
  };
  let bidirectional = initialResearchBidirectionalIterationState();
  const bidirectionalWork = createBidirectionalIterationWorkPackage(
    bidirectional,
    { candidates, videoDepth, formalEvidence }
  );
  const result = ingestBidirectionalIterationSubmission(
    bidirectional,
    { candidates, videoDepth, formalEvidence },
    {
      package_version: bidirectionalWork.package_version,
      evidence_basis_digest: bidirectionalWork.evidence_basis_digest,
      round_number: bidirectionalWork.round_number,
      community_to_formal_assessments:
        bidirectionalWork.community_evidence.map(({ evidence_ref_id }) => ({
          evidence_ref_id,
          disposition: "NO_NEW_MATERIAL_TRANSFER",
          rationale: "No new material hypothesis in the narrow fixture."
        })),
      formal_to_community_assessments:
        bidirectionalWork.formal_evidence.map(({ evidence_ref_id }) => ({
          evidence_ref_id,
          disposition: "NO_NEW_MATERIAL_TRANSFER",
          rationale: "No new material discriminator in the narrow fixture."
        })),
      transfers: [],
      discordances: []
    }
  );
  bidirectional = result.bidirectional;
  return {
    researchTarget: "de-identified treatment comparison",
    candidates,
    videoDepth,
    formalEvidence: result.formalEvidence,
    bidirectional
  };
}

function selectedInterpretations(
  work: ReturnType<typeof createTreatmentLandscapeWorkPackage>
) {
  return work.selected_videos.map(({ video_id }) => ({
    video_id,
    stage_or_baseline: "Population and stage described by the exact source.",
    outcome_and_horizon: "Walking outcome at the reported horizon.",
    nonredundant_value: "Only selected material program in the narrow fixture.",
    what_it_changed: "Added source-bound real-world implementation evidence."
  }));
}

describe("session-derived treatment landscape finalization", () => {
  it("cannot accept omitted selected videos or caller-authored assessor output", () => {
    const evidence = narrowCompleteEvidence();
    const state = initialResearchTreatmentFinalizationState();
    const work = createTreatmentLandscapeWorkPackage(state, evidence);
    const base = {
      package_version: work.package_version,
      evidence_basis_digest: work.evidence_basis_digest,
      attempt: work.attempt,
      broad_treatment_choice: false,
      specific_implementation_searches: [],
      directional_search_batches: {
        benefit: [],
        no_effect_or_failure: [],
        harm: [],
        discontinuation: [],
        eventual_standard_treatment: []
      },
      selected_video_interpretations: selectedInterpretations(work),
      further_expansion_likely_to_improve_answer: "no" as const
    };

    expect(() => ingestTreatmentLandscapeSubmission(state, evidence, {
      ...base,
      selected_video_interpretations: []
    })).toThrow(/selected_video_interpretations|Every selected video/u);
    expect(() => ingestTreatmentLandscapeSubmission(state, evidence, {
      ...base,
      synthesis_lock: "pass"
    } as never)).toThrow();
  });

  it("keeps an undercovered ledger executable even when a worker says expansion is done", () => {
    const evidence = narrowCompleteEvidence();
    const state = initialResearchTreatmentFinalizationState();
    const work = createTreatmentLandscapeWorkPackage(state, evidence);
    const next = ingestTreatmentLandscapeSubmission(state, evidence, {
      package_version: work.package_version,
      evidence_basis_digest: work.evidence_basis_digest,
      attempt: work.attempt,
      broad_treatment_choice: false,
      specific_implementation_searches: [],
      directional_search_batches: {
        benefit: [],
        no_effect_or_failure: [],
        harm: [],
        discontinuation: [],
        eventual_standard_treatment: []
      },
      selected_video_interpretations: selectedInterpretations(work),
      further_expansion_likely_to_improve_answer: "no"
    });

    expect(deriveTreatmentFinalizationStatus(next, evidence)).toBe("IN_PROGRESS");
    expect(deriveTreatmentFinalizationDiagnostics(next, evidence)).toMatchObject({
      current_evidence_basis_assessed: true,
      selection_coverage_lock: "block",
      synthesis_lock: "block",
      answer_boundary: "continue_research"
    });
  });

  it("blocks a broad treatment comparison that omits directional discovery", () => {
    const evidence = narrowCompleteEvidence();
    const state = initialResearchTreatmentFinalizationState();
    const work = createTreatmentLandscapeWorkPackage(state, evidence);
    const next = ingestTreatmentLandscapeSubmission(state, evidence, {
      package_version: work.package_version,
      evidence_basis_digest: work.evidence_basis_digest,
      attempt: work.attempt,
      broad_treatment_choice: true,
      specific_implementation_searches: [],
      directional_search_batches: {
        benefit: [],
        no_effect_or_failure: [],
        harm: [],
        discontinuation: [],
        eventual_standard_treatment: []
      },
      selected_video_interpretations: selectedInterpretations(work),
      further_expansion_likely_to_improve_answer: "no"
    });

    const diagnostics = deriveTreatmentFinalizationDiagnostics(next, evidence);
    expect(diagnostics.answer_boundary).toBe("continue_research");
    expect(diagnostics.synthesis_lock).toBe("block");
    expect(diagnostics.blockers.join(" ")).toMatch(/benefit|failure|harm|discontinuation|eventual/iu);
  });

  it("passes only after the existing assessor validates exact specific-program receipts", () => {
    const evidence = narrowCompleteEvidence();
    const state = initialResearchTreatmentFinalizationState();
    const work = createTreatmentLandscapeWorkPackage(state, evidence);
    const material = work.candidates.find(({ materiality }) =>
      materiality === "MATERIAL"
    )!;
    const batch = work.discovery_batches.find(({ query_or_scope }) =>
      query_or_scope.includes("named program one")
    )!;
    const next = ingestTreatmentLandscapeSubmission(state, evidence, {
      package_version: work.package_version,
      evidence_basis_digest: work.evidence_basis_digest,
      attempt: work.attempt,
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
      selected_video_interpretations: selectedInterpretations(work),
      further_expansion_likely_to_improve_answer: "no"
    });

    const diagnostics = deriveTreatmentFinalizationDiagnostics(next, evidence);
    expect(diagnostics.blockers).toEqual([]);
    expect(diagnostics).toMatchObject({
      selection_coverage_lock: "pass",
      per_video_depth_lock: "pass",
      synthesis_lock: "pass",
      answer_boundary: "ledger_consistent_for_synthesis"
    });
    expect(deriveTreatmentFinalizationStatus(next, evidence)).toBe("COMPLETE");
  });

  it("projects a nonretryable formal-source gap as bounded nonranking work", () => {
    const evidence = narrowCompleteEvidence({ formalBoundary: true });
    const state = initialResearchTreatmentFinalizationState();
    const work = createTreatmentLandscapeWorkPackage(state, evidence);
    const material = work.candidates.find(({ materiality }) =>
      materiality === "MATERIAL"
    )!;
    const batch = work.discovery_batches.find(({ query_or_scope }) =>
      query_or_scope.includes("named program one")
    )!;
    const next = ingestTreatmentLandscapeSubmission(state, evidence, {
      package_version: work.package_version,
      evidence_basis_digest: work.evidence_basis_digest,
      attempt: work.attempt,
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
      selected_video_interpretations: selectedInterpretations(work),
      further_expansion_likely_to_improve_answer: "no"
    });

    const diagnostics = deriveTreatmentFinalizationDiagnostics(next, evidence);
    expect(diagnostics.blockers.join(" ")).toContain("prevents complete coverage");
    expect(diagnostics.blockers.join(" ")).not.toContain("new material program hypothesis");
    expect(diagnostics.answer_boundary).toBe("bounded_nonranking_only");
    expect(deriveTreatmentFinalizationStatus(next, evidence)).toBe("BLOCKED_TERMINAL");
  });
});
