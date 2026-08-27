import { describe, expect, it } from "vitest";

import {
  assertCandidateScreeningComplete,
  candidateDiscoveryReadyForScreening,
  deriveCandidateDiscoveryDiagnostics,
  ingestNativeYoutubeSurvey,
  ingestValidatedGeminiFrontier,
  initialResearchCandidateDiscoveryState,
  markExternalScoutFrontierBoundary,
  nativeSurveyInputFromCandidateDiscovery,
  researchCandidateDiscoveryStateSchema
} from "../apps/research-mcp/src/index.js";
import {
  deriveGeminiYoutubeCandidateFrontier,
  type GeminiYoutubeCandidateValidationReceipt
} from "../packages/sources/src/index.js";
import {
  NATIVE_ONLY_VIDEO_ID,
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSearchQuotaSurvey,
  nativeSurvey,
  rejectedResearchReceipt,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import { CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET } from
  "../apps/research-mcp/src/custom-gpt-acceptance-receipt.js";

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
  it("does not let an entirely rejected external packet unlock native discovery", () => {
    const rejected = externalDiscovery(rejectedResearchReceipt());

    expect(rejected.external_scout).toMatchObject({
      status: "BLOCKED_RETRYABLE",
      source_candidate_video_ids: RESEARCH_FIXTURE_VIDEO_IDS,
      validated_candidate_video_ids: [],
      terminally_rejected_video_ids: RESEARCH_FIXTURE_VIDEO_IDS,
      unresolved_candidate_video_ids: []
    });
    expect(rejected.candidates).toEqual([]);
    expect(candidateDiscoveryReadyForScreening(rejected)).toBe(false);
    expect(() => ingestNativeYoutubeSurvey(rejected, nativeSurvey())).toThrow(
      /cannot bypass retryable external scout/u
    );
  });

  it("admits only independently validated external identities with exact provenance", () => {
    expect(initialResearchCandidateDiscoveryState().candidates).toEqual([]);

    const state = externalDiscovery(unresolvedReceipt());
    expect(state.external_scout).toMatchObject({
      status: "BLOCKED_TERMINAL",
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
    )).toThrow(/requires a resolved external scout attempt/u);

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

  it("continues native discovery after a terminal external scout boundary", () => {
    const terminal = markExternalScoutFrontierBoundary(
      initialResearchCandidateDiscoveryState(),
      "BLOCKED_TERMINAL",
      "AUTOMATED_SCOUT_INVALID_PACKET"
    );

    expect(terminal.external_scout).toMatchObject({
      status: "BLOCKED_TERMINAL",
      source_candidate_video_ids: [],
      validated_candidate_video_ids: [],
      unresolved_candidate_video_ids: []
    });
    expect(terminal.external_scout.frontier_id).toMatch(/^[a-f0-9]{64}$/u);

    const input = nativeSurveyInputFromCandidateDiscovery(
      terminal,
      "de-identified treatment comparison"
    );
    expect(input.searches).toHaveLength(6);
    expect(input.searches.flatMap(({ direction }) => direction)).toEqual([
      "general",
      "benefit",
      "no_effect",
      "harm",
      "discontinuation",
      "formal_discriminator"
    ]);

    const discovered = ingestNativeYoutubeSurvey(terminal, nativeSurvey());
    expect(discovered.native_youtube.status).toBe("COMPLETE");
    expect(candidateDiscoveryReadyForScreening(discovered)).toBe(true);
  });

  it("bounds fallback queries for a long research target without losing its leading clinical scope", () => {
    const terminal = markExternalScoutFrontierBoundary(
      initialResearchCandidateDiscoveryState(),
      "BLOCKED_TERMINAL",
      "AUTOMATED_SCOUT_INVALID_PACKET"
    );

    const input = nativeSurveyInputFromCandidateDiscovery(
      terminal,
      CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET
    );

    expect(input.searches).toHaveLength(6);
    expect(new Set(input.searches.map(({ query }) => query)).size).toBe(6);
    for (const { query } of input.searches) {
      expect(query.length).toBeLessThanOrEqual(200);
      expect(query).toContain("end-stage hip osteoarthritis");
      expect(query).not.toContain("plain-language limitations");
    }
  });

  it("keeps retryable external scout work from being bypassed", () => {
    const retryable = markExternalScoutFrontierBoundary(
      initialResearchCandidateDiscoveryState(),
      "BLOCKED_RETRYABLE",
      "AUTOMATED_SCOUT_RATE_LIMITED"
    );
    expect(() => nativeSurveyInputFromCandidateDiscovery(
      retryable,
      "de-identified treatment comparison"
    )).toThrow(/retryable external scout/u);
    expect(() => ingestNativeYoutubeSurvey(retryable, nativeSurvey())).toThrow(
      /retryable external scout/u
    );
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
      selection_status: index === 0 ? "SELECTED" as const : "NOT_SELECTED" as const,
      screening_status: "SCREENED" as const,
      screening_rationale: "Fixture semantic screening decision."
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

  it("uses the validated external frontier after exact daily native-search exhaustion", () => {
    const external = externalDiscovery();

    const bounded = ingestNativeYoutubeSurvey(external, nativeSearchQuotaSurvey());

    expect(bounded.native_youtube).toMatchObject({
      status: "BLOCKED_TERMINAL",
      source_candidate_video_ids: [],
      validated_candidate_video_ids: [],
      unresolved_candidate_video_ids: [],
      searches: [{
        access_status: "rate_limited",
        exhausted: false,
        candidate_video_ids: []
      }]
    });
    expect(bounded.candidates.map(({ video_id }) => video_id)).toEqual(
      RESEARCH_FIXTURE_VIDEO_IDS
    );
    expect(candidateDiscoveryReadyForScreening(bounded)).toBe(true);
  });

  it("uses a validated partial external frontier after exact daily native-search exhaustion", () => {
    const external = externalDiscovery(unresolvedReceipt());

    const bounded = ingestNativeYoutubeSurvey(external, nativeSearchQuotaSurvey());

    expect(external.external_scout.status).toBe("BLOCKED_TERMINAL");
    expect(bounded.native_youtube.status).toBe("BLOCKED_TERMINAL");
    expect(bounded.candidates.map(({ video_id }) => video_id)).toEqual(
      RESEARCH_FIXTURE_VIDEO_IDS.slice(0, 2)
    );
    expect(deriveCandidateDiscoveryDiagnostics(bounded)
      .unresolved_identity_video_ids).toEqual([RESEARCH_FIXTURE_VIDEO_IDS[2]]);
    expect(candidateDiscoveryReadyForScreening(bounded)).toBe(true);
  });

  it("does not broaden partial-frontier fallback to generic native identity failures", () => {
    const external = externalDiscovery(unresolvedReceipt());

    const blocked = ingestNativeYoutubeSurvey(external, nativeSurvey("rate_limited"));

    expect(blocked.external_scout.status).toBe("BLOCKED_TERMINAL");
    expect(blocked.native_youtube.status).toBe("BLOCKED_RETRYABLE");
    expect(candidateDiscoveryReadyForScreening(blocked)).toBe(false);
  });

  it("does not use daily native-search exhaustion to bypass a missing external frontier", () => {
    const terminal = markExternalScoutFrontierBoundary(
      initialResearchCandidateDiscoveryState(),
      "BLOCKED_TERMINAL",
      "AUTOMATED_SCOUT_INVALID_PACKET"
    );

    const blocked = ingestNativeYoutubeSurvey(terminal, nativeSearchQuotaSurvey());

    expect(blocked.native_youtube.status).toBe("BLOCKED_RETRYABLE");
    expect(candidateDiscoveryReadyForScreening(blocked)).toBe(false);
  });
});
