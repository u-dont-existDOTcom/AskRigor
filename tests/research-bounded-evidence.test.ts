import { describe, expect, it } from "vitest";

import {
  createCandidateScreeningWorkPackage,
  createInMemoryResearchEvidenceMaterialCache,
  createInitialResearchSessionState,
  createVideoEvidenceWorkPackage,
  ingestVideoEvidenceSubmission,
  protocolBindingsFromManifests,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordDiscussionDepthResult,
  recordNativeYoutubeDiscovery,
  recordResearchSessionVideoEvidence,
  recordTranscriptDepthResult,
  sourceMaterialDigest,
  sourceRecordSha256,
  videoEvidenceFindingIds,
  type ResearchSessionState,
  type VideoEvidenceMaterial
} from "../apps/research-mcp/src/index.js";
import type { YoutubeComment } from "../packages/sources/src/index.js";
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

const SESSION_ID = `ars1_${"V".repeat(32)}`;

function manifest(protocol: "universal" | "hrp") {
  return {
    name: protocol,
    version: "1.0",
    revisionDate: "2026-08-25",
    sha256: protocol === "universal" ? "a".repeat(64) : "b".repeat(64)
  };
}

function videoFrontier(): {
  state: ResearchSessionState;
  material: VideoEvidenceMaterial;
  transcript: ReturnType<typeof transcriptOutput>;
  discussion: ReturnType<typeof discussionOutput>;
} {
  let state = createInitialResearchSessionState({
    research_target: "de-identified treatment comparison",
    diagnosis_status: "diagnosis_not_specified"
  }, protocolBindingsFromManifests(manifest("universal"), manifest("hrp")));
  state = recordAutomatedScoutCompletion(state, {
    providerResponseId: "bounded-evidence-fixture",
    packet: researchPacket(),
    receipt: researchReceipt()
  });
  state = recordNativeYoutubeDiscovery(state, nativeSurvey());
  const candidateWork = createCandidateScreeningWorkPackage(
    state.candidate_discovery
  );
  state = recordCandidateScreeningCompletion(state, {
    package_version: candidateWork.package_version,
    discovery_digest: candidateWork.discovery_digest,
    decisions: state.candidate_discovery.candidates.map((candidate) => ({
      video_id: candidate.video_id,
      materiality: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
        ? "MATERIAL" as const
        : "NOT_MATERIAL" as const,
      redundancy: "DISTINCT" as const,
      selection_status: candidate.video_id === RESEARCH_FIXTURE_VIDEO_IDS[0]
        ? "SELECTED" as const
        : "NOT_SELECTED" as const,
      rationale: "Exact bounded-evidence test frontier."
    }))
  });
  const videoId = RESEARCH_FIXTURE_VIDEO_IDS[0]!;
  const transcript = transcriptOutput(videoId);
  const discussion = discussionOutput(videoId);
  state = recordTranscriptDepthResult(state, videoId, transcript);
  state = recordDiscussionDepthResult(state, videoId, undefined, discussion);
  const comment: YoutubeComment = {
    video_id: videoId,
    comment_id: "comment-bounded-1",
    parent_id: null,
    top_level_comment_id: "comment-bounded-1",
    is_reply: false,
    author_channel_id: "private-author-channel",
    author_display_name: "Private Author Name",
    text: "Raw identifying comment text with many personal details that must never enter durable session state or a reader report.",
    like_count: 0,
    published_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
  const transcriptReceiptSha256 = sourceRecordSha256(transcript.coverage_receipt);
  const discussionReceiptSha256 = sourceRecordSha256(discussion.coverage_receipt);
  const transcriptSegments = transcript.data.map((segment) => ({
    ...segment,
    record_sha256: sourceRecordSha256(segment)
  }));
  const discussionComments = [{
    ...comment,
    record_sha256: sourceRecordSha256(comment)
  }];
  const material: VideoEvidenceMaterial = {
    video_id: videoId,
    transcript_receipt_sha256: transcriptReceiptSha256,
    discussion_receipt_sha256: discussionReceiptSha256,
    transcript_segments: transcriptSegments,
    discussion_comments: discussionComments,
    source_material_digest: sourceMaterialDigest({
      video_id: videoId,
      transcript_receipt_sha256: transcriptReceiptSha256,
      discussion_receipt_sha256: discussionReceiptSha256,
      transcript_record_sha256s: transcriptSegments.map(({ record_sha256 }) =>
        record_sha256
      ),
      discussion_record_sha256s: discussionComments.map(({ record_sha256 }) =>
        record_sha256
      )
    })
  };
  return { state, material, transcript, discussion };
}

describe("bounded selected-video evidence", () => {
  it("accepts only exact receipt-bound segment/comment references and stores de-identified findings", () => {
    const { state, material } = videoFrontier();
    const work = createVideoEvidenceWorkPackage(
      state.bounded_evidence,
      state.candidate_discovery,
      state.video_depth,
      material
    );
    const submission = {
      package_version: "askrigor_video_evidence_v1" as const,
      evidence_basis_digest: work.evidence_basis_digest,
      video_id: work.video_id,
      creator_findings: [{
        finding_type: "program" as const,
        plain_language: "The creator describes one exact program implementation.",
        transcript_segment_sha256s: [material.transcript_segments[0]!.record_sha256],
        program: boundedProgram("Exact creator program")
      }],
      community_findings: [{
        direction: "no_effect" as const,
        non_identifying_wording: "One commenter reported no perceived change.",
        regimen_clues: ["program not described"],
        reported_outcome: "No perceived symptom change at an unspecified horizon.",
        counter_signals: ["Disease stage and adherence were not described."],
        program: boundedProgram("Commenter-described program"),
        comment_record_sha256s: [material.discussion_comments[0]!.record_sha256]
      }],
      limitations: ["The discussion is self-selected and cannot establish rates."]
    };
    const next = recordResearchSessionVideoEvidence(state, material, submission);
    expect(next.operations.video_evidence_synthesis.status).toBe("COMPLETE");
    expect(next.bounded_evidence.videos[0]).toMatchObject({
      status: "COMPLETE",
      creator_findings: [{ start_ms: 0 }],
      community_findings: [{ direction: "no_effect" }]
    });
    const serialized = JSON.stringify(next);
    expect(serialized).not.toContain("Raw identifying comment text");
    expect(serialized).not.toContain("Private Author Name");
    expect(serialized).not.toContain("Segment 0");

    expect(() => ingestVideoEvidenceSubmission(
      state.bounded_evidence,
      state.candidate_discovery,
      state.video_depth,
      material,
      {
        ...submission,
        creator_findings: [{
          ...submission.creator_findings[0]!,
          transcript_segment_sha256s: ["f".repeat(64)]
        }]
      }
    )).toThrow(/outside the exact source material/u);
    expect(() => ingestVideoEvidenceSubmission(
      state.bounded_evidence,
      state.candidate_discovery,
      state.video_depth,
      material,
      {
        ...submission,
        community_findings: [{
          ...submission.community_findings[0]!,
          comment_record_sha256s: ["e".repeat(64)]
        }]
      }
    )).toThrow(/outside the exact analysis sample/u);
    expect(() => ingestVideoEvidenceSubmission(
      state.bounded_evidence,
      state.candidate_discovery,
      state.video_depth,
      material,
      {
        ...submission,
        community_findings: [{
          ...submission.community_findings[0]!,
          non_identifying_wording: material.discussion_comments[0]!.text
        }]
      }
    )).toThrow(/copies substantial verbatim source text/u);
    expect(() => ingestVideoEvidenceSubmission(
      state.bounded_evidence,
      state.candidate_discovery,
      state.video_depth,
      material,
      {
        ...submission,
        community_findings: [{
          ...submission.community_findings[0]!,
          non_identifying_wording: "A commenter at private.person@example.test reported no change."
        }]
      }
    )).toThrow(/contains a direct identifier/u);

    const accepted = recordResearchSessionVideoEvidence(state, material, submission);
    const creator = accepted.bounded_evidence.videos[0]!.creator_findings[0]!;
    const community = accepted.bounded_evidence.videos[0]!.community_findings[0]!;
    expect(creator.program.name).toBe("Exact creator program");
    expect(community.program.name).toBe("Commenter-described program");
    const findings = videoEvidenceFindingIds(accepted.bounded_evidence);
    expect(findings.get(creator.finding_id)?.program.name).toBe(
      "Exact creator program"
    );
    expect(findings.get(community.finding_id)?.program.name).toBe(
      "Commenter-described program"
    );
  });

  it("keeps raw public material process-local and returns it only for exact receipt hashes", () => {
    const { material, transcript, discussion } = videoFrontier();
    const cache = createInMemoryResearchEvidenceMaterialCache();
    cache.captureTranscript({
      sessionId: SESSION_ID,
      videoId: material.video_id,
      output: transcript
    });
    cache.captureDiscussion({
      sessionId: SESSION_ID,
      videoId: material.video_id,
      output: discussion
    });
    expect(cache.get({
      sessionId: SESSION_ID,
      videoId: material.video_id,
      transcriptReceiptSha256: material.transcript_receipt_sha256,
      discussionReceiptSha256: material.discussion_receipt_sha256
    })?.transcript_segments).toHaveLength(1);
    expect(cache.get({
      sessionId: SESSION_ID,
      videoId: material.video_id,
      transcriptReceiptSha256: "0".repeat(64),
      discussionReceiptSha256: material.discussion_receipt_sha256
    })).toBeUndefined();
    cache.revokeSession(SESSION_ID);
    expect(cache.get({
      sessionId: SESSION_ID,
      videoId: material.video_id,
      transcriptReceiptSha256: material.transcript_receipt_sha256,
      discussionReceiptSha256: material.discussion_receipt_sha256
    })).toBeUndefined();
  });

  it("evicts least-recently-used raw material because eviction cannot advance state", () => {
    const first = videoFrontier().material;
    const cache = createInMemoryResearchEvidenceMaterialCache({
      maximumEntries: 1
    });
    const firstTranscript = transcriptOutput(first.video_id);
    const firstDiscussion = discussionOutput(first.video_id);
    cache.captureTranscript({
      sessionId: SESSION_ID,
      videoId: first.video_id,
      output: firstTranscript
    });
    cache.captureDiscussion({
      sessionId: SESSION_ID,
      videoId: first.video_id,
      output: firstDiscussion
    });
    const secondVideoId = RESEARCH_FIXTURE_VIDEO_IDS[1]!;
    const secondTranscript = transcriptOutput(secondVideoId);
    const secondDiscussion = discussionOutput(secondVideoId);
    cache.captureTranscript({
      sessionId: SESSION_ID,
      videoId: secondVideoId,
      output: secondTranscript
    });
    cache.captureDiscussion({
      sessionId: SESSION_ID,
      videoId: secondVideoId,
      output: secondDiscussion
    });

    expect(cache.get({
      sessionId: SESSION_ID,
      videoId: first.video_id,
      transcriptReceiptSha256: sourceRecordSha256(firstTranscript.coverage_receipt),
      discussionReceiptSha256: sourceRecordSha256(firstDiscussion.coverage_receipt)
    })).toBeUndefined();
    expect(cache.get({
      sessionId: SESSION_ID,
      videoId: secondVideoId,
      transcriptReceiptSha256: sourceRecordSha256(secondTranscript.coverage_receipt),
      discussionReceiptSha256: sourceRecordSha256(secondDiscussion.coverage_receipt)
    })).toBeDefined();
  });
});

function boundedProgram(name: string) {
  return {
    name,
    components: ["Exact described component"],
    dose_or_intensity: "As described in the audited source",
    frequency: "As described in the audited source",
    duration: "As described in the audited source",
    supervision: "As described in the audited source",
    adherence: "As reported in the audited source",
    co_interventions: [],
    care_stage: "nonsurgical" as const
  };
}
