import { okEnvelope } from "@askrigor/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createBidirectionalIterationWorkPackage,
  createBidirectionalIterationEvidenceContext,
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
  researchBoundedEvidenceStateSchema,
  reconcileBidirectionalIterationAfterEphemeralLoss,
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

function boundedProgram(name: string) {
  return {
    name,
    components: [name],
    dose_or_intensity: "as reported",
    frequency: "as reported",
    duration: "as reported",
    supervision: "not described",
    adherence: "not described",
    co_interventions: [],
    care_stage: "nonsurgical" as const
  };
}

function fixtureDigest(value: number): string {
  return value.toString(16).slice(-1).repeat(64);
}

function evidenceWithCommentOnlyCandidate(): BidirectionalEvidenceState {
  const evidence = evidenceFixture();
  evidence.boundedEvidence = researchBoundedEvidenceStateSchema.parse({
    state_version: "askrigor_bounded_evidence_v1",
    selection_digest: evidence.videoDepth.selection_digest,
    videos: evidence.videoDepth.selected_video_ids.map((videoId, index) => ({
      video_id: videoId,
      status: "COMPLETE",
      transcript_receipt_sha256: fixtureDigest(index + 1),
      discussion_receipt_sha256: fixtureDigest(index + 3),
      source_material_digest: fixtureDigest(index + 5),
      creator_findings: [{
        finding_id: fixtureDigest(index + 7),
        finding_type: "program",
        plain_language: "The creator describes only the original source program.",
        transcript_segment_sha256s: [fixtureDigest(index + 9)],
        program: boundedProgram("Original creator program"),
        timestamp_url: `https://www.youtube.com/watch?v=${videoId}&t=0s`,
        start_ms: 0
      }],
      community_findings: index === 0 ? [{
        finding_id: "b".repeat(64),
        direction: "benefit",
        non_identifying_wording:
          "A commenter reports a synthetic comment-only candidate called Signal Alpha.",
        regimen_clues: ["Signal Alpha"],
        reported_outcome: "A bounded improvement report.",
        counter_signals: ["Diagnosis was not independently verified."],
        program: boundedProgram("Signal Alpha"),
        comment_record_sha256s: ["c".repeat(64)]
      }] : [],
      limitations: []
    }))
  });
  return evidence;
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

  it("reopens discovery for a source-bound comment-only candidate without inventing absent candidates", () => {
    const evidence = evidenceWithCommentOnlyCandidate();
    const state = initialResearchBidirectionalIterationState();
    const firstWork = createBidirectionalIterationWorkPackage(state, evidence);
    const context = createBidirectionalIterationEvidenceContext(evidence, firstWork);
    const serialized = JSON.stringify(context);

    expect(serialized).toContain("Signal Alpha");
    expect(serialized).not.toContain("Signal Omega");
    expect(firstWork.community_evidence[0]).toMatchObject({
      community_finding_count: 1,
      creator_finding_count: 1,
      bounded_evidence_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });

    const settled = ingestBidirectionalIterationSubmission(
      state,
      evidence,
      noTransferSubmission(firstWork)
    );
    expect(deriveBidirectionalIterationStatus(settled.bidirectional, {
      ...evidence,
      formalEvidence: settled.formalEvidence
    })).toBe("COMPLETE");

    const laterEvidence = structuredClone(evidence);
    laterEvidence.formalEvidence = settled.formalEvidence;
    laterEvidence.boundedEvidence!.videos[0]!.community_findings[0] = {
      ...laterEvidence.boundedEvidence!.videos[0]!.community_findings[0]!,
      finding_id: "d".repeat(64),
      non_identifying_wording:
        "A later comment reports a synthetic comment-only candidate called Signal Beta.",
      regimen_clues: ["Signal Beta"],
      program: boundedProgram("Signal Beta")
    };
    expect(deriveBidirectionalIterationStatus(
      settled.bidirectional,
      laterEvidence
    )).toBe("IN_PROGRESS");

    const reopenedWork = createBidirectionalIterationWorkPackage(
      settled.bidirectional,
      laterEvidence
    );
    expect(JSON.stringify(createBidirectionalIterationEvidenceContext(
      laterEvidence,
      reopenedWork
    ))).toContain("Signal Beta");
    const submission = noTransferSubmission(reopenedWork);
    const source = reopenedWork.community_evidence[0]!;
    submission.community_to_formal_assessments[0] = {
      evidence_ref_id: source.evidence_ref_id,
      disposition: "MATERIAL_TRANSFER",
      rationale: "The later comment introduces a source-grounded candidate."
    };
    const reopened = ingestBidirectionalIterationSubmission(
      settled.bidirectional,
      laterEvidence,
      {
        ...submission,
        transfers: [{
          direction: "COMMUNITY_TO_FORMAL",
          source_evidence_ref_ids: [source.evidence_ref_id],
          category: "PROGRAM",
          treatment_class: "Signal Beta class",
          claim_summary: "Signal Beta is a bounded candidate for follow-up.",
          program: program(),
          formal_query: "Signal Beta condition outcome",
          possible_decision_impact: "unknown"
        }]
      }
    );
    expect(reopened.formalEvidence.hypotheses).toHaveLength(
      laterEvidence.formalEvidence.hypotheses.length + 1
    );
    expect(reopened.formalEvidence.hypotheses.at(-1)?.formal_query)
      .toContain("Signal Beta");
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

    const restored = reconcileBidirectionalIterationAfterEphemeralLoss(searched);
    expect(restored.rounds[0]!.formal_to_community_transfers[0]!.searches[0])
      .toEqual({
        video_id: evidence.videoDepth.selected_video_ids[0],
        status: "NOT_STARTED",
        pages_retrieved: 0,
        records_returned_cumulative: 0,
        page_receipt_hashes: [],
        access_statuses: []
      });

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
