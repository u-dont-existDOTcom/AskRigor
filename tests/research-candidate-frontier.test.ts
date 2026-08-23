import { describe, expect, it } from "vitest";

import {
  assertCandidateScreeningComplete,
  candidateDiscoveryReadyForScreening,
  deriveCandidateDiscoveryDiagnostics,
  ingestNativeYoutubeSurvey,
  ingestValidatedGeminiFrontier,
  initialResearchCandidateDiscoveryState,
  researchCandidateDiscoveryStateSchema
} from "../apps/research-mcp/src/index.js";
import {
  deriveGeminiYoutubeCandidateFrontier,
  type GeminiYoutubeCandidateValidationReceipt
} from "../packages/sources/src/index.js";
import {
  NATIVE_ONLY_VIDEO_ID,
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";

function externalDiscovery(
  receipt: GeminiYoutubeCandidateValidationReceipt = researchReceipt()
) {
  return ingestValidatedGeminiFrontier(
    initialResearchCandidateDiscoveryState(),
    researchPacket(),
    receipt,
    "gemini-response-1"
  );
}

function unresolvedReceipt(): GeminiYoutubeCandidateValidationReceipt {
  const complete = researchReceipt();
  const unresolvedId = RESEARCH_FIXTURE_VIDEO_IDS[2];
  return {
    ...complete,
    status: "partial",
    candidate_frontier: deriveGeminiYoutubeCandidateFrontier(
      RESEARCH_FIXTURE_VIDEO_IDS,
      RESEARCH_FIXTURE_VIDEO_IDS.slice(0, 2),
      [],
      [unresolvedId]
    ),
    validated_candidates: complete.validated_candidates.slice(0, 2),
    unresolved_candidates: [{
      video_id: unresolvedId,
      metadata_access_status: "rate_limited",
      retryable: true,
      provider_error_code: "youtube_rate_limited",
      limitations: ["Retryable fixture boundary."]
    }]
  };
}

describe("server-owned research candidate frontier", () => {
  it("admits only independently validated external identities with exact provenance", () => {
    expect(initialResearchCandidateDiscoveryState().candidates).toEqual([]);

    const state = externalDiscovery(unresolvedReceipt());
    expect(state.external_scout).toMatchObject({
      status: "BLOCKED_RETRYABLE",
      source_candidate_video_ids: RESEARCH_FIXTURE_VIDEO_IDS,
      validated_candidate_video_ids: RESEARCH_FIXTURE_VIDEO_IDS.slice(0, 2),
      unresolved_candidate_video_ids: [RESEARCH_FIXTURE_VIDEO_IDS[2]]
    });
    expect(state.candidates.map(({ video_id }) => video_id)).toEqual(
      RESEARCH_FIXTURE_VIDEO_IDS.slice(0, 2)
    );
    expect(state.candidates[0]).toMatchObject({
      published_at: "not_reported",
      origins: [{
        source: "GEMINI_SCOUT",
        query_linkage: "FRONTIER_LEVEL_ONLY"
      }],
      program_description_status: "PARTIAL_PROVISIONAL",
      screening_status: "PENDING"
    });
    expect(candidateDiscoveryReadyForScreening(state)).toBe(false);
  });

  it("requires both discovery frontiers and reconciles duplicate video identities", () => {
    const external = externalDiscovery();
    expect(candidateDiscoveryReadyForScreening(external)).toBe(false);
    expect(() => ingestNativeYoutubeSurvey(
      initialResearchCandidateDiscoveryState(),
      nativeSurvey()
    )).toThrow(/cannot replace the required external scout/u);

    const reconciled = ingestNativeYoutubeSurvey(external, nativeSurvey());
    const diagnostics = deriveCandidateDiscoveryDiagnostics(reconciled);
    expect(diagnostics).toMatchObject({
      external_source_candidates: 3,
      native_source_candidates: 2,
      reconciled_candidates: 4,
      multiple_source_candidates: 1,
      unresolved_identity_video_ids: [],
      program_not_described_candidates: 1,
      semantic_screening_pending: 4
    });
    expect(reconciled.candidates.find(({ video_id }) =>
      video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
    )?.origins.map(({ source }) => source)).toEqual([
      "GEMINI_SCOUT",
      "NATIVE_YOUTUBE"
    ]);
    expect(reconciled.candidates.find(({ video_id }) =>
      video_id === NATIVE_ONLY_VIDEO_ID
    )).toMatchObject({
      provisional_treatment_class: "program not described",
      program_description_status: "NOT_DESCRIBED"
    });
    expect(candidateDiscoveryReadyForScreening(reconciled)).toBe(true);
  });

  it("fails missing reciprocal links and caller-authored diagnostic fields", () => {
    const reconciled = ingestNativeYoutubeSurvey(externalDiscovery(), nativeSurvey());
    const missingCandidate = {
      ...reconciled,
      candidates: reconciled.candidates.slice(1)
    };
    expect(researchCandidateDiscoveryStateSchema.safeParse(missingCandidate).success)
      .toBe(false);
    expect(researchCandidateDiscoveryStateSchema.safeParse({
      ...reconciled,
      reconciled_candidates: 99
    }).success).toBe(false);
    expect(researchCandidateDiscoveryStateSchema.safeParse({
      ...reconciled,
      candidates: [{
        ...reconciled.candidates[0]!,
        metadata_access_status: "rate_limited"
      }, ...reconciled.candidates.slice(1)]
    }).success).toBe(false);
  });

  it("does not let renamed candidates inflate distinct program coverage", () => {
    const reconciled = ingestNativeYoutubeSurvey(externalDiscovery(), nativeSurvey());
    const firstProgram = reconciled.candidates[0]!.program;
    const firstSignature = reconciled.candidates[0]!.program_signature;
    const candidates = reconciled.candidates.map((candidate, index) => ({
      ...candidate,
      ...(index === 1 ? {
        program: firstProgram,
        program_signature: firstSignature,
        program_description_status: "PARTIAL_PROVISIONAL" as const
      } : {}),
      materiality: index < 2 ? "MATERIAL" as const : "NOT_MATERIAL" as const,
      redundancy: "DISTINCT" as const,
      screening_status: "SCREENED" as const
    }));
    const forged = researchCandidateDiscoveryStateSchema.parse({
      ...reconciled,
      candidates
    });

    expect(() => assertCandidateScreeningComplete(forged)).toThrow(
      /cannot count as multiple distinct programs/u
    );
  });

  it("replaces retryable native receipts without retaining stale origins", () => {
    const external = externalDiscovery();
    const blocked = ingestNativeYoutubeSurvey(external, nativeSurvey("rate_limited"));
    expect(blocked.native_youtube.status).toBe("BLOCKED_RETRYABLE");
    expect(blocked.native_youtube.unresolved_candidate_video_ids).toEqual([
      NATIVE_ONLY_VIDEO_ID
    ]);
    expect(blocked.candidates.some(({ video_id }) => video_id === NATIVE_ONLY_VIDEO_ID))
      .toBe(false);

    const recovered = ingestNativeYoutubeSurvey(blocked, nativeSurvey());
    expect(recovered.native_youtube.status).toBe("COMPLETE");
    expect(recovered.native_youtube.unresolved_candidate_video_ids).toEqual([]);
    expect(recovered.candidates.filter(({ video_id }) =>
      video_id === NATIVE_ONLY_VIDEO_ID
    )).toHaveLength(1);
  });
});
