import { describe, expect, it } from "vitest";

import {
  createInitialResearchSessionState,
  createResearchSessionStore,
  createCandidateScreeningWorkPackage,
  deriveDiscussionActionInput,
  deriveResearchVideoDepthWorkPackages,
  deriveTranscriptActionInput,
  deriveVideoDepthOperationStatus,
  executeDiscussionDepthChain,
  executeResearchSessionVideoDepthChain,
  executeTranscriptDepthChain,
  ingestCandidateScreeningSubmission,
  ingestDiscussionActionOutput,
  ingestNativeYoutubeSurvey,
  ingestTranscriptActionOutput,
  ingestValidatedGeminiFrontier,
  initialResearchCandidateDiscoveryState,
  initializeResearchVideoDepth,
  protocolBindingsFromManifests,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordDiscussionDepthResult,
  recordNativeYoutubeDiscovery,
  recordTranscriptDepthResult,
  recordVideoDepthRestart,
  reconcileVideoDepthAfterEphemeralLoss,
  researchSessionStateSchema,
  researchVideoDepthStateSchema
} from "../apps/research-mcp/src/index.js";
import {
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import {
  DISCUSSION_HANDLE,
  TRANSCRIPT_HANDLE,
  discussionOutput,
  screeningSubmissionFor,
  transcriptOutput
} from "./helpers/research-video-depth-fixtures.js";

const VIDEO_ONE = RESEARCH_FIXTURE_VIDEO_IDS[0];
const VIDEO_TWO = RESEARCH_FIXTURE_VIDEO_IDS[1];

function discoveredCandidates() {
  const external = ingestValidatedGeminiFrontier(
    initialResearchCandidateDiscoveryState(),
    researchPacket(),
    researchReceipt(),
    "gemini-depth-fixture"
  );
  return ingestNativeYoutubeSurvey(external, nativeSurvey());
}

function screenedCandidates() {
  const discovered = discoveredCandidates();
  return ingestCandidateScreeningSubmission(
    discovered,
    screeningSubmissionFor(discovered)
  );
}

function initialSession() {
  const protocols = protocolBindingsFromManifests({
    name: "Universal Instructions",
    version: "20.5.14",
    revisionDate: "2026-08-18",
    sha256: "a".repeat(64)
  }, {
    name: "Health Research Protocol",
    version: "20.5.22",
    revisionDate: "2026-08-23",
    sha256: "b".repeat(64)
  });
  const initial = createInitialResearchSessionState({
    research_target: "de-identified treatment comparison",
    diagnosis_status: "diagnosis_not_specified"
  }, protocols);
  const scouted = recordAutomatedScoutCompletion(initial, {
    providerResponseId: "gemini-depth-fixture",
    packet: researchPacket(),
    receipt: researchReceipt()
  });
  const discovered = recordNativeYoutubeDiscovery(scouted, nativeSurvey());
  return recordCandidateScreeningCompletion(
    discovered,
    screeningSubmissionFor(discovered.candidate_discovery)
  );
}

describe("server-owned selected-video depth", () => {
  it("reopens only process-local transcript and discussion chains after restore", () => {
    let depth = initializeResearchVideoDepth(screenedCandidates());
    depth = ingestTranscriptActionOutput(
      depth,
      VIDEO_ONE,
      transcriptOutput(VIDEO_ONE, {
        complete: false,
        nextHandle: TRANSCRIPT_HANDLE
      })
    );
    depth = ingestDiscussionActionOutput(
      depth,
      VIDEO_ONE,
      undefined,
      discussionOutput(VIDEO_ONE, {
        complete: false,
        continuationHandle: DISCUSSION_HANDLE
      })
    );
    depth = ingestTranscriptActionOutput(depth, VIDEO_TWO, transcriptOutput(VIDEO_TWO));
    depth = ingestDiscussionActionOutput(
      depth,
      VIDEO_TWO,
      undefined,
      discussionOutput(VIDEO_TWO)
    );

    const restored = reconcileVideoDepthAfterEphemeralLoss(depth);
    expect(restored.transcripts[0]).toMatchObject({
      status: "RESTART_REQUIRED",
      attempt: 1,
      boundary: { code: "TRANSCRIPT_HANDLE_LOST_ON_RESTORE" }
    });
    expect(restored.transcripts[0]!.continuation_handle).toBeUndefined();
    expect(restored.transcripts[0]!.receipt).toBeUndefined();
    expect(restored.discussions[0]).toMatchObject({
      status: "RESTART_REQUIRED",
      attempt: 1,
      boundary: { code: "DISCUSSION_HANDLE_LOST_ON_RESTORE" }
    });
    expect(restored.discussions[0]!.continuation_handle).toBeUndefined();
    expect(restored.discussions[0]!.receipt).toBeUndefined();
    expect(restored.transcripts[1]!.status).toBe("COMPLETE");
    expect(restored.discussions[1]!.status).toBe("COMPLETE");
  });

  it("binds semantic screening to the exact discovered frontier and every identity", () => {
    const discovered = discoveredCandidates();
    const work = createCandidateScreeningWorkPackage(discovered);
    const submission = screeningSubmissionFor(discovered);

    expect(work.discovery_digest).toBe(submission.discovery_digest);
    expect(work.candidates.map(({ video_id }) => video_id)).toEqual(
      discovered.candidates.map(({ video_id }) => video_id)
    );
    expect(() => ingestCandidateScreeningSubmission(discovered, {
      ...submission,
      discovery_digest: "f".repeat(64)
    })).toThrow(/different frontier/u);
    expect(() => ingestCandidateScreeningSubmission(discovered, {
      ...submission,
      decisions: submission.decisions.slice(1)
    })).toThrow(/every packaged identity/u);
    expect(() => ingestCandidateScreeningSubmission(discovered, {
      ...submission,
      decisions: submission.decisions.map((decision, index) => index === 0
        ? { ...decision, video_id: "AAAAAAAAAAA" }
        : decision)
    })).toThrow(/every packaged identity/u);
  });

  it("creates exact per-video work packages without caller cursors or completion claims", () => {
    const depth = initializeResearchVideoDepth(screenedCandidates());

    expect(depth.selected_video_ids).toEqual([VIDEO_ONE, VIDEO_TWO]);
    expect(deriveResearchVideoDepthWorkPackages(depth)).toEqual([
      {
        capability: "transcript_acquisition",
        video_id: VIDEO_ONE,
        attempt: 0,
        continuation: false
      },
      {
        capability: "transcript_acquisition",
        video_id: VIDEO_TWO,
        attempt: 0,
        continuation: false
      },
      {
        capability: "community_discussion_audit",
        video_id: VIDEO_ONE,
        attempt: 0,
        continuation: false
      },
      {
        capability: "community_discussion_audit",
        video_id: VIDEO_TWO,
        attempt: 0,
        continuation: false
      }
    ]);
    expect(deriveTranscriptActionInput(depth, VIDEO_ONE)).toEqual({
      video_id_or_url: VIDEO_ONE,
      page_size: 200
    });
    expect(deriveDiscussionActionInput(depth, VIDEO_ONE)).toEqual({
      video_id_or_url: VIDEO_ONE,
      analysis_limit: 500
    });
  });

  it("exhausts one exact timestamped transcript chain and rejects mixing or replay", () => {
    const initial = initializeResearchVideoDepth(screenedCandidates());
    const firstPage = transcriptOutput(VIDEO_ONE, {
      complete: false,
      nextHandle: TRANSCRIPT_HANDLE
    });
    const inProgress = ingestTranscriptActionOutput(initial, VIDEO_ONE, firstPage);

    expect(inProgress.transcripts[0]).toMatchObject({
      status: "IN_PROGRESS",
      continuation_handle: TRANSCRIPT_HANDLE,
      receipt: { pagination: { page_count: 1, exhausted: false } }
    });
    expect(deriveTranscriptActionInput(inProgress, VIDEO_ONE)).toEqual({
      video_id_or_url: VIDEO_ONE,
      language_code: "en",
      cursor: TRANSCRIPT_HANDLE,
      page_size: 200
    });
    expect(() => ingestTranscriptActionOutput(
      inProgress,
      VIDEO_TWO,
      transcriptOutput(VIDEO_TWO, {
        continuationHandle: TRANSCRIPT_HANDLE,
        pageCount: 2,
        cumulative: 2
      })
    )).toThrow(/selected receipt chain/u);
    expect(() => ingestTranscriptActionOutput(inProgress, VIDEO_ONE, firstPage))
      .toThrow(/selected receipt chain/u);

    const complete = ingestTranscriptActionOutput(
      inProgress,
      VIDEO_ONE,
      transcriptOutput(VIDEO_ONE, {
        continuationHandle: TRANSCRIPT_HANDLE,
        pageCount: 2,
        cumulative: 2
      })
    );
    expect(complete.transcripts[0]).toMatchObject({
      status: "COMPLETE",
      receipt: {
        timestamp_provenance: "segment_timestamp_urls",
        pagination: { page_count: 2, exhausted: true }
      }
    });
    expect(deriveVideoDepthOperationStatus(complete, "transcript_acquisition"))
      .toBe("IN_PROGRESS");
  });

  it("automatically follows only server-derived opaque continuation handles", async () => {
    const initial = initializeResearchVideoDepth(screenedCandidates());
    const transcriptInputs: unknown[] = [];
    const transcriptComplete = await executeTranscriptDepthChain(
      initial,
      VIDEO_ONE,
      async (input) => {
        transcriptInputs.push(input);
        return transcriptInputs.length === 1
          ? transcriptOutput(VIDEO_ONE, {
            complete: false,
            nextHandle: TRANSCRIPT_HANDLE
          })
          : transcriptOutput(VIDEO_ONE, {
            continuationHandle: TRANSCRIPT_HANDLE,
            pageCount: 2,
            cumulative: 2
          });
      }
    );
    expect(transcriptInputs).toEqual([
      { video_id_or_url: VIDEO_ONE, page_size: 200 },
      {
        video_id_or_url: VIDEO_ONE,
        language_code: "en",
        cursor: TRANSCRIPT_HANDLE,
        page_size: 200
      }
    ]);
    expect(transcriptComplete.transcripts[0]!.status).toBe("COMPLETE");

    const discussionInputs: unknown[] = [];
    const discussionComplete = await executeDiscussionDepthChain(
      initial,
      VIDEO_ONE,
      async (input) => {
        discussionInputs.push(input);
        return discussionInputs.length === 1
          ? discussionOutput(VIDEO_ONE, {
            complete: false,
            continuationHandle: DISCUSSION_HANDLE
          })
          : discussionOutput(VIDEO_ONE, {
            segmentIndex: 1,
            cumulative: 2
          });
      }
    );
    expect(discussionInputs).toEqual([
      { video_id_or_url: VIDEO_ONE, analysis_limit: 500 },
      { continuation_token: DISCUSSION_HANDLE, analysis_limit: 500 }
    ]);
    expect(discussionComplete.discussions[0]!.status).toBe("COMPLETE");

    let sessionCall = 0;
    const session = await executeResearchSessionVideoDepthChain(
      initialSession(),
      "transcript_acquisition",
      VIDEO_ONE,
      {
        async getTranscript() {
          sessionCall += 1;
          return sessionCall === 1
            ? transcriptOutput(VIDEO_ONE, {
              complete: false,
              nextHandle: TRANSCRIPT_HANDLE
            })
            : transcriptOutput(VIDEO_ONE, {
              continuationHandle: TRANSCRIPT_HANDLE,
              pageCount: 2,
              cumulative: 2
            });
        },
        async auditDiscussion() {
          throw new Error("Unselected executor must not run");
        }
      }
    );
    expect(session.video_depth.transcripts[0]!.status).toBe("COMPLETE");
    expect(session.operations.transcript_acquisition.status).toBe("IN_PROGRESS");
  });

  it("restarts transcript retries without a cursor, clears restarted chains, and rejects transcript-free completion", () => {
    const initial = initializeResearchVideoDepth(screenedCandidates());
    const retryable = ingestTranscriptActionOutput(
      initial,
      VIDEO_ONE,
      transcriptOutput(VIDEO_ONE, {
        complete: false,
        returned: 0,
        cumulative: 0,
        retryable: true
      })
    );
    expect(retryable.transcripts[0]).toMatchObject({
      status: "RESTART_REQUIRED",
      attempt: 1,
      boundary: {
        classification: "RETRYABLE",
        code: "TRANSCRIPT_RETRYABLE_WITHOUT_CONTINUATION_RESTART_REQUIRED"
      }
    });
    expect(retryable.transcripts[0]!.receipt).toBeUndefined();
    expect(deriveResearchVideoDepthWorkPackages(retryable)).toContainEqual({
      capability: "transcript_acquisition",
      video_id: VIDEO_ONE,
      attempt: 1,
      continuation: false
    });

    const sessionWithChain = recordTranscriptDepthResult(
      initialSession(),
      VIDEO_ONE,
      transcriptOutput(VIDEO_ONE, {
        complete: false,
        nextHandle: TRANSCRIPT_HANDLE
      })
    );
    const restarted = recordVideoDepthRestart(
      sessionWithChain,
      "transcript_acquisition",
      VIDEO_ONE,
      "youtube_transcript_action_continuation_invalid_or_expired"
    );
    expect(restarted.video_depth.transcripts[0]).toMatchObject({
      status: "RESTART_REQUIRED",
      attempt: 1,
      boundary: {
        code: "YOUTUBE_TRANSCRIPT_ACTION_CONTINUATION_INVALID_OR_EXPIRED"
      }
    });
    expect(restarted.video_depth.transcripts[0]).not.toHaveProperty("receipt");
    expect(restarted.video_depth.transcripts[0]).not.toHaveProperty(
      "continuation_handle"
    );

    const unverified = ingestTranscriptActionOutput(
      initial,
      VIDEO_ONE,
      transcriptOutput(VIDEO_ONE, {
        timestamped: false,
        returned: 0,
        cumulative: 0
      })
    );
    expect(unverified.transcripts[0]).toMatchObject({
      status: "BLOCKED_TERMINAL",
      receipt: { timestamp_provenance: "unavailable" }
    });

    const boundedSession = recordTranscriptDepthResult(
      initialSession(),
      VIDEO_ONE,
      transcriptOutput(VIDEO_ONE, {
        timestamped: false,
        returned: 0,
        cumulative: 0
      })
    );
    expect(boundedSession.video_depth.transcripts[0]).toMatchObject({
      status: "BLOCKED_TERMINAL",
      boundary: { classification: "TERMINAL_NONRETRYABLE" }
    });
    expect(boundedSession.bounded_evidence.videos[0]).toMatchObject({
      video_id: VIDEO_ONE,
      status: "BOUNDED_TERMINAL"
    });
    expect(boundedSession.operations.video_evidence_synthesis.status)
      .toBe("IN_PROGRESS");
    const fullyBoundedSession = recordTranscriptDepthResult(
      boundedSession,
      VIDEO_TWO,
      transcriptOutput(VIDEO_TWO, {
        timestamped: false,
        returned: 0,
        cumulative: 0
      })
    );
    expect(fullyBoundedSession.operations.video_evidence_synthesis)
      .toMatchObject({
        status: "BLOCKED_TERMINAL",
        boundary: { code: "VIDEO_EVIDENCE_BOUNDED_TERMINAL" }
      });
  });

  it("requires every selected discussion to pass its own completion lock", () => {
    let state = initialSession();
    state = recordDiscussionDepthResult(
      state,
      VIDEO_ONE,
      undefined,
      discussionOutput(VIDEO_ONE, {
        complete: false,
        continuationHandle: DISCUSSION_HANDLE
      })
    );
    expect(state.operations.community_discussion_audit.status).toBe("IN_PROGRESS");
    expect(deriveDiscussionActionInput(state.video_depth, VIDEO_ONE)).toEqual({
      continuation_token: DISCUSSION_HANDLE,
      analysis_limit: 500
    });
    expect(() => recordDiscussionDepthResult(
      state,
      VIDEO_ONE,
      `arh1_${"X".repeat(32)}`,
      discussionOutput(VIDEO_ONE, {
        segmentIndex: 1,
        cumulative: 2
      })
    )).toThrow(/server-owned state/u);
    expect(() => recordDiscussionDepthResult(
      state,
      VIDEO_ONE,
      DISCUSSION_HANDLE,
      discussionOutput(VIDEO_ONE, {
        segmentIndex: 0,
        cumulative: 1
      })
    )).toThrow(/replayed/u);

    state = recordDiscussionDepthResult(
      state,
      VIDEO_ONE,
      DISCUSSION_HANDLE,
      discussionOutput(VIDEO_ONE, {
        segmentIndex: 1,
        cumulative: 2
      })
    );
    expect(state.video_depth.discussions[0]).toMatchObject({
      status: "COMPLETE",
      receipt: { receipt: { synthesis_lock: "pass" } }
    });
    expect(state.operations.community_discussion_audit.status).toBe("IN_PROGRESS");

    state = recordDiscussionDepthResult(
      state,
      VIDEO_TWO,
      undefined,
      discussionOutput(VIDEO_TWO)
    );
    expect(state.operations.community_discussion_audit.status).toBe("COMPLETE");
  });

  it("preserves retryable and terminal discussion boundaries without upgrading either to completion", () => {
    const initial = initializeResearchVideoDepth(screenedCandidates());
    const first = ingestDiscussionActionOutput(
      initial,
      VIDEO_ONE,
      undefined,
      discussionOutput(VIDEO_ONE, {
        complete: false,
        continuationHandle: DISCUSSION_HANDLE
      })
    );
    const retryable = ingestDiscussionActionOutput(
      first,
      VIDEO_ONE,
      DISCUSSION_HANDLE,
      discussionOutput(VIDEO_ONE, {
        segmentIndex: 0,
        cumulative: 1,
        complete: false,
        continuationHandle: DISCUSSION_HANDLE,
        retryable: true
      })
    );
    expect(retryable.discussions[0]).toMatchObject({
      status: "BLOCKED_RETRYABLE",
      continuation_handle: DISCUSSION_HANDLE
    });
    expect(deriveResearchVideoDepthWorkPackages(retryable)).toContainEqual({
      capability: "community_discussion_audit",
      video_id: VIDEO_ONE,
      attempt: 0,
      continuation: true
    });

    const retryWithoutHandleOutput = discussionOutput(VIDEO_TWO, {
      complete: false,
      retryable: true
    });
    const retryWithoutHandle = ingestDiscussionActionOutput(
      initial,
      VIDEO_TWO,
      undefined,
      {
        ...retryWithoutHandleOutput,
        continuation_recommended: false,
        coverage_receipt: {
          ...retryWithoutHandleOutput.coverage_receipt,
          continuation_recommended: false
        }
      }
    );
    expect(retryWithoutHandle.discussions[1]).toMatchObject({
      status: "RESTART_REQUIRED",
      attempt: 1,
      boundary: {
        classification: "RETRYABLE",
        code: "DISCUSSION_RETRYABLE_WITHOUT_CONTINUATION_RESTART_REQUIRED"
      }
    });
    expect(retryWithoutHandle.discussions[1]!.receipt).toBeUndefined();

    let bounded = ingestDiscussionActionOutput(
      initial,
      VIDEO_ONE,
      undefined,
      discussionOutput(VIDEO_ONE, { terminal: true })
    );
    bounded = ingestDiscussionActionOutput(
      bounded,
      VIDEO_TWO,
      undefined,
      discussionOutput(VIDEO_TWO)
    );
    expect(deriveVideoDepthOperationStatus(
      bounded,
      "community_discussion_audit"
    )).toBe("BLOCKED_TERMINAL");

    const boundedSession = recordDiscussionDepthResult(
      initialSession(),
      VIDEO_ONE,
      undefined,
      discussionOutput(VIDEO_ONE, { terminal: true })
    );
    expect(boundedSession.bounded_evidence.videos[0]).toMatchObject({
      video_id: VIDEO_ONE,
      status: "BOUNDED_TERMINAL"
    });
    expect(boundedSession.operations.video_evidence_synthesis.status)
      .toBe("IN_PROGRESS");
    const fullyBoundedSession = recordDiscussionDepthResult(
      boundedSession,
      VIDEO_TWO,
      undefined,
      discussionOutput(VIDEO_TWO, { terminal: true })
    );
    expect(fullyBoundedSession.operations.video_evidence_synthesis)
      .toMatchObject({
        status: "BLOCKED_TERMINAL",
        boundary: { code: "VIDEO_EVIDENCE_BOUNDED_TERMINAL" }
      });
  });

  it("accepts only an exact no-progress discussion restart snapshot", () => {
    const initial = initializeResearchVideoDepth(screenedCandidates());
    const first = ingestDiscussionActionOutput(
      initial,
      VIDEO_ONE,
      undefined,
      discussionOutput(VIDEO_ONE, {
        complete: false,
        continuationHandle: DISCUSSION_HANDLE
      })
    );
    const restartOutput = discussionOutput(VIDEO_ONE, {
      restart: true,
      segmentIndex: 0,
      cumulative: 1,
      errorCode:
        "youtube_video_audit_identifier_membership_restart_required"
    });

    const restarted = ingestDiscussionActionOutput(
      first,
      VIDEO_ONE,
      DISCUSSION_HANDLE,
      restartOutput
    );
    expect(restarted.discussions[0]).toMatchObject({
      status: "RESTART_REQUIRED",
      attempt: 1,
      boundary: {
        classification: "RETRYABLE",
        code: "YOUTUBE_VIDEO_AUDIT_IDENTIFIER_MEMBERSHIP_RESTART_REQUIRED"
      }
    });
    expect(restarted.discussions[0]).not.toHaveProperty("receipt");
    expect(restarted.discussions[0]).not.toHaveProperty("continuation_handle");

    expect(() => ingestDiscussionActionOutput(
      first,
      VIDEO_ONE,
      DISCUSSION_HANDLE,
      discussionOutput(VIDEO_ONE, {
        restart: true,
        segmentIndex: 0,
        cumulative: 2,
        errorCode:
          "youtube_video_audit_identifier_membership_restart_required"
      })
    )).toThrow(/restart snapshot/u);
  });

  it("makes completed per-video evidence immutable in the session store", () => {
    const before = initialSession();
    const after = recordTranscriptDepthResult(
      before,
      VIDEO_ONE,
      transcriptOutput(VIDEO_ONE)
    );
    const store = createResearchSessionStore({
      random: () => new Uint8Array(24).fill(4)
    });
    const sessionId = store.issue(before);
    store.claim(sessionId);
    store.replace(sessionId, after);

    const claimed = store.claim(sessionId);
    const videoDepth = structuredClone(claimed.video_depth);
    videoDepth.transcripts[0]!.receipt!.pagination.records_returned_cumulative = 99;
    const forged = researchSessionStateSchema.parse({ ...claimed, video_depth: videoDepth });
    expect(() => store.replace(sessionId, forged)).toThrow(
      /per-video depth evidence is immutable/u
    );
    store.rollback(sessionId);
  });

  it("rejects schema-level cross-video receipt substitution", () => {
    const state = initialSession();
    const forged = structuredClone(state.video_depth);
    forged.transcripts[0]!.status = "COMPLETE";
    forged.transcripts[0]!.receipt = transcriptOutput(VIDEO_TWO).coverage_receipt;
    expect(researchVideoDepthStateSchema.safeParse(forged).success).toBe(false);
  });
});
