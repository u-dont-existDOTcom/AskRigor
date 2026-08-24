import { okEnvelope } from "@askrigor/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createBidirectionalIterationWorkPackage,
  createBidirectionalReturnAssessmentWorkPackages,
  deriveBidirectionalIterationStatus,
  executeBidirectionalReturnSearch,
  ingestBidirectionalIterationSubmission,
  ingestBidirectionalReturnAssessment,
  ingestCandidateScreeningSubmission,
  ingestDiscussionActionOutput,
  ingestNativeYoutubeSurvey,
  ingestTranscriptActionOutput,
  ingestValidatedGeminiFrontier,
  initialResearchBidirectionalIterationState,
  initialResearchCandidateDiscoveryState,
  initializeResearchFormalEvidence,
  initializeResearchVideoDepth,
  type BidirectionalEvidenceState
} from "../apps/research-mcp/src/index.js";
import {
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import {
  discussionOutput,
  screeningSubmissionFor,
  transcriptOutput
} from "./helpers/research-video-depth-fixtures.js";

function evidenceFixture(): BidirectionalEvidenceState {
  let candidates = initialResearchCandidateDiscoveryState();
  candidates = ingestValidatedGeminiFrontier(
    candidates,
    researchPacket(),
    researchReceipt(),
    "interaction-bidirectional"
  );
  candidates = ingestNativeYoutubeSurvey(candidates, nativeSurvey());
  candidates = ingestCandidateScreeningSubmission(
    candidates,
    screeningSubmissionFor(candidates)
  );
  let videoDepth = initializeResearchVideoDepth(candidates);
  for (const videoId of videoDepth.selected_video_ids) {
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
  }
  return {
    candidates,
    videoDepth,
    formalEvidence: initializeResearchFormalEvidence(
      candidates,
      "de-identified treatment comparison"
    )
  };
}

function noTransferSubmission(work: ReturnType<typeof createBidirectionalIterationWorkPackage>) {
  return {
    package_version: work.package_version,
    evidence_basis_digest: work.evidence_basis_digest,
    round_number: work.round_number,
    community_to_formal_assessments: work.community_evidence.map(({ evidence_ref_id }) => ({
      evidence_ref_id,
      disposition: "NO_NEW_MATERIAL_TRANSFER" as const,
      rationale: "No new material formal-search hypothesis in this exact source."
    })),
    formal_to_community_assessments: work.formal_evidence.map(({ evidence_ref_id }) => ({
      evidence_ref_id,
      disposition: "NO_NEW_MATERIAL_TRANSFER" as const,
      rationale: "No new material community discriminator in this exact source."
    })),
    transfers: [],
    discordances: []
  };
}

function program() {
  return {
    components: "named load-management program",
    dose_or_intensity: "low initial load",
    frequency: "three sessions weekly",
    duration: "twelve weeks",
    supervision: "supervised",
    adherence_or_fidelity: "attendance tracked",
    cointerventions: "none reported",
    stage_or_baseline: "advanced symptoms",
    outcome: "walking function",
    horizon: "six months",
    care_stage: "before procedure"
  };
}

describe("server-owned bidirectional evidence iteration", () => {
  it("requires an exact assessment for every source in both directions", () => {
    const evidence = evidenceFixture();
    const state = initialResearchBidirectionalIterationState();
    const work = createBidirectionalIterationWorkPackage(state, evidence);
    const submission = noTransferSubmission(work);

    expect(() => ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      community_to_formal_assessments:
        submission.community_to_formal_assessments.slice(1)
    })).toThrow(/Every exact community-to-formal source/u);

    expect(() => ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      formal_to_community_assessments: [
        ...submission.formal_to_community_assessments,
        {
          evidence_ref_id: "f".repeat(64),
          disposition: "NO_NEW_MATERIAL_TRANSFER",
          rationale: "Invented source must be rejected."
        }
      ]
    })).toThrow(/Every exact formal-to-community source/u);
  });

  it("rejects stale submissions and does not accept caller-authored completion fields", () => {
    const evidence = evidenceFixture();
    const state = initialResearchBidirectionalIterationState();
    const work = createBidirectionalIterationWorkPackage(state, evidence);
    const submission = noTransferSubmission(work);

    expect(() => ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      evidence_basis_digest: "a".repeat(64)
    })).toThrow(/stale|frontier/u);
    expect(() => ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      complete: true
    } as never)).toThrow();
    expect(() => ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      community_to_formal_assessments: submission.community_to_formal_assessments.map(
        (assessment, index) => index === 0
          ? { ...assessment, disposition: "TERMINAL_BOUNDARY" as const }
          : assessment
      )
    })).toThrow(/terminal source receipt/u);
    expect(() => ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      formal_to_community_assessments: submission.formal_to_community_assessments.map(
        (assessment, index) => index === 0
          ? { ...assessment, disposition: "TERMINAL_BOUNDARY" as const }
          : assessment
      )
    })).toThrow(/bounded claim capability/u);
  });

  it("completes only the current two-direction evidence basis", () => {
    const evidence = evidenceFixture();
    const state = initialResearchBidirectionalIterationState();
    const work = createBidirectionalIterationWorkPackage(state, evidence);
    const result = ingestBidirectionalIterationSubmission(
      state,
      evidence,
      noTransferSubmission(work)
    );
    const nextEvidence = { ...evidence, formalEvidence: result.formalEvidence };

    expect(deriveBidirectionalIterationStatus(result.bidirectional, nextEvidence))
      .toBe("COMPLETE");
    expect(() => createBidirectionalIterationWorkPackage(
      result.bidirectional,
      nextEvidence
    )).toThrow(/already reviewed/u);
  });

  it("appends a material community hypothesis and invalidates convergence", () => {
    const evidence = evidenceFixture();
    const state = initialResearchBidirectionalIterationState();
    const work = createBidirectionalIterationWorkPackage(state, evidence);
    const source = work.community_evidence[0]!;
    const submission = noTransferSubmission(work);
    submission.community_to_formal_assessments[0] = {
      evidence_ref_id: source.evidence_ref_id,
      disposition: "MATERIAL_TRANSFER",
      rationale: "The discussion surfaced a distinct implementation and outcome."
    };
    const result = ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      transfers: [{
        direction: "COMMUNITY_TO_FORMAL",
        source_evidence_ref_ids: [source.evidence_ref_id],
        category: "IMPLEMENTATION",
        treatment_class: "distinct mechanical program",
        claim_summary: "A specific paced implementation may change walking tolerance.",
        program: program(),
        formal_query: "condition paced implementation walking tolerance six months",
        possible_decision_impact: "ranking_changing"
      }]
    });
    const nextEvidence = { ...evidence, formalEvidence: result.formalEvidence };

    expect(result.formalEvidence.hypotheses).toHaveLength(
      evidence.formalEvidence.hypotheses.length + 1
    );
    expect(result.formalEvidence.hypotheses.at(-1)?.provider_searches.every(
      ({ status }) => status === "NOT_STARTED"
    )).toBe(true);
    expect(deriveBidirectionalIterationStatus(result.bidirectional, nextEvidence))
      .toBe("IN_PROGRESS");
  });

  it("keeps formal-to-community return searches receipt-bound and retryable", async () => {
    const evidence = evidenceFixture();
    const state = initialResearchBidirectionalIterationState();
    const work = createBidirectionalIterationWorkPackage(state, evidence);
    const source = work.formal_evidence[0]!;
    const submission = noTransferSubmission(work);
    submission.formal_to_community_assessments[0] = {
      evidence_ref_id: source.evidence_ref_id,
      disposition: "MATERIAL_TRANSFER",
      rationale: "The formal result identifies a nonresponder discriminator to test."
    };
    const ingested = ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      transfers: [{
        direction: "FORMAL_TO_COMMUNITY",
        source_evidence_ref_ids: [source.evidence_ref_id],
        category: "FAILURE_OR_NO_EFFECT",
        discriminator_query: "nonresponse after twelve weeks",
        target_video_ids: [evidence.videoDepth.selected_video_ids[0]!],
        possible_decision_impact: "ranking_changing"
      }]
    });
    const transferId = ingested.bidirectional.rounds[0]!
      .formal_to_community_transfers[0]!.transfer_id;
    const retryable = vi.fn(async (input: { video: string; query: string }) =>
      okEnvelope({
        provider: "youtube",
        recordType: "youtube_comments",
        primaryIdentifier: input.video,
        query: { query: input.query },
        accessStatus: "rate_limited",
        pagination: { page_size: 100, returned: 0, exhausted: false },
        data: {},
        error: {
          code: "youtube_rate_limited",
          message: "Retry later",
          retryable: true
        }
      })
    );

    const next = await executeBidirectionalReturnSearch(
      ingested.bidirectional,
      transferId,
      retryable
    );
    expect(deriveBidirectionalIterationStatus(next, {
      ...evidence,
      formalEvidence: ingested.formalEvidence
    })).toBe("BLOCKED_RETRYABLE");
  });

  it("requires assessment of query-bounded return results before closing the pass", async () => {
    const evidence = evidenceFixture();
    const state = initialResearchBidirectionalIterationState();
    const work = createBidirectionalIterationWorkPackage(state, evidence);
    const source = work.formal_evidence[0]!;
    const submission = noTransferSubmission(work);
    submission.formal_to_community_assessments[0] = {
      evidence_ref_id: source.evidence_ref_id,
      disposition: "MATERIAL_TRANSFER",
      rationale: "A durability discriminator needs a community return search."
    };
    const ingested = ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      transfers: [{
        direction: "FORMAL_TO_COMMUNITY",
        source_evidence_ref_ids: [source.evidence_ref_id],
        category: "DURABILITY",
        discriminator_query: "benefit stopped after six months",
        target_video_ids: [evidence.videoDepth.selected_video_ids[0]!],
        possible_decision_impact: "confidence_changing"
      }]
    });
    const transferId = ingested.bidirectional.rounds[0]!
      .formal_to_community_transfers[0]!.transfer_id;
    const searched = await executeBidirectionalReturnSearch(
      ingested.bidirectional,
      transferId,
      async (input) => okEnvelope({
        provider: "youtube",
        recordType: "youtube_comments",
        primaryIdentifier: input.video,
        query: { query: input.query },
        accessStatus: "partial",
        pagination: { page_size: 100, exhausted: true },
        returned: 1,
        limitations: ["Query-bounded discovery only."],
        data: {
          comments: [{
            video_id: input.video,
            comment_id: "comment-1",
            parent_id: null,
            top_level_comment_id: "comment-1",
            is_reply: false,
            text: "The benefit stopped later.",
            like_count: 0,
            published_at: "2026-08-23T00:00:00Z",
            updated_at: "2026-08-23T00:00:00Z"
          }],
          manifest: {
            video_id: input.video,
            top_level_comments_retrieved: 1,
            expected_replies: 0,
            replies_retrieved: 0,
            total_comments_and_replies: 1,
            reply_count_mismatches: [],
            pages: { comment_threads: 1, replies: 0 },
            extraction_coverage: "partial"
          }
        }
      })
    );
    const packages = createBidirectionalReturnAssessmentWorkPackages(searched);

    expect(packages).toHaveLength(1);
    expect(deriveBidirectionalIterationStatus(searched, {
      ...evidence,
      formalEvidence: ingested.formalEvidence
    })).toBe("IN_PROGRESS");

    const assessed = ingestBidirectionalReturnAssessment(
      searched,
      ingested.formalEvidence,
      {
        package_version: "askrigor_bidirectional_return_assessment_v1",
        evidence_basis_digest: packages[0]!.evidence_basis_digest,
        round_id: packages[0]!.round_id,
        transfer_id: packages[0]!.transfer_id,
        result_assessments: packages[0]!.result_receipts.map(({ video_id }) => ({
          video_id,
          disposition: "NO_NEW_MATERIAL_TRANSFER",
          rationale: "The bounded result repeats the already represented durability claim."
        })),
        community_to_formal_transfers: []
      }
    );
    expect(deriveBidirectionalIterationStatus(assessed.bidirectional, {
      ...evidence,
      formalEvidence: assessed.formalEvidence
    })).toBe("COMPLETE");
  });

  it("bounds a partial discriminator result that has no resumable cursor", async () => {
    const evidence = evidenceFixture();
    const state = initialResearchBidirectionalIterationState();
    const work = createBidirectionalIterationWorkPackage(state, evidence);
    const source = work.formal_evidence[0]!;
    const submission = noTransferSubmission(work);
    submission.formal_to_community_assessments[0] = {
      evidence_ref_id: source.evidence_ref_id,
      disposition: "MATERIAL_TRANSFER",
      rationale: "A discriminator needs a source-bound community return search."
    };
    const ingested = ingestBidirectionalIterationSubmission(state, evidence, {
      ...submission,
      transfers: [{
        direction: "FORMAL_TO_COMMUNITY",
        source_evidence_ref_ids: [source.evidence_ref_id],
        category: "FORMAL_DISCRIMINATOR",
        discriminator_query: "source-bound discriminator",
        target_video_ids: [evidence.videoDepth.selected_video_ids[0]!],
        possible_decision_impact: "confidence_changing"
      }]
    });
    const transferId = ingested.bidirectional.rounds[0]!
      .formal_to_community_transfers[0]!.transfer_id;
    const bounded = await executeBidirectionalReturnSearch(
      ingested.bidirectional,
      transferId,
      async (input) => okEnvelope({
        provider: "youtube",
        recordType: "youtube_comments",
        primaryIdentifier: input.video,
        query: { query: input.query },
        accessStatus: "partial",
        pagination: { page_size: 100, exhausted: false },
        returned: 0,
        limitations: ["Provider supplied no resumable continuation."],
        data: {
          comments: [],
          manifest: {
            video_id: input.video,
            top_level_comments_retrieved: 0,
            expected_replies: 0,
            replies_retrieved: 0,
            total_comments_and_replies: 0,
            reply_count_mismatches: [],
            pages: { comment_threads: 0, replies: 0 },
            extraction_coverage: "partial"
          }
        }
      })
    );

    expect(deriveBidirectionalIterationStatus(bounded, {
      ...evidence,
      formalEvidence: ingested.formalEvidence
    })).toBe("BLOCKED_TERMINAL");
    expect(createBidirectionalReturnAssessmentWorkPackages(bounded)).toEqual([]);
  });
});
