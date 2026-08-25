import {
  youtubeTranscriptInputSchema,
  type YoutubeTranscriptInput
} from "@askrigor/sources";
import { z } from "zod";

import {
  youtubeVideoCommunityAuditInputSchema,
  youtubeVideoCommunityAuditOutputSchema,
  type YoutubeVideoCommunityAuditInput
} from "../youtube-video-community-audit.js";
import {
  candidateScreeningResultDigest,
  selectedCandidateVideoIds,
  type ResearchCandidateDiscoveryState
} from "./research-candidate-frontier.js";
import {
  discussionReceiptSchema,
  projectDiscussionCoverageReceipt,
  transcriptReceiptSchema
} from "./treatment-landscape-coverage-route.js";
import { youtubeTranscriptActionOutputSchema } from "./youtube-transcript-route.js";

const youtubeVideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const transcriptHandle = z.string().regex(/^art1_[A-Za-z0-9_-]{32}$/u);
const discussionHandle = z.string().regex(/^arh1_[A-Za-z0-9_-]{32}$/u);

export const researchVideoDepthRecordStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETE",
  "BLOCKED_RETRYABLE",
  "BLOCKED_TERMINAL",
  "RESTART_REQUIRED"
]);

const depthBoundarySchema = z.object({
  classification: z.enum(["RETRYABLE", "TERMINAL_NONRETRYABLE"]),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u),
  summary: z.string().min(1).max(1_000)
}).strict();

const sourceIdentitySchema = z.object({
  video_id: youtubeVideoId,
  canonical_url: z.string().url().max(200),
  title: z.string().min(1).max(500),
  channel_id: z.string().min(1).max(100),
  channel_title: z.string().min(1).max(500),
  metadata_access_status: z.enum(["complete", "api_visible_complete"])
}).strict();

const transcriptDepthRecordSchema = z.object({
  source: sourceIdentitySchema,
  status: researchVideoDepthRecordStatusSchema,
  attempt: z.number().int().nonnegative().max(1_000),
  continuation_handle: transcriptHandle.optional(),
  receipt: transcriptReceiptSchema.optional(),
  boundary: depthBoundarySchema.optional()
}).strict().superRefine((record, context) => {
  addDepthRecordRelationshipIssues(record, context);
  if (
    record.receipt !== undefined &&
    record.receipt.source_video_id !== record.source.video_id
  ) {
    context.addIssue({
      code: "custom",
      message: "Transcript receipt must match its selected source identity"
    });
  }
});

const discussionDepthRecordSchema = z.object({
  source: sourceIdentitySchema,
  status: researchVideoDepthRecordStatusSchema,
  attempt: z.number().int().nonnegative().max(1_000),
  segment_index: z.number().int().nonnegative().optional(),
  corpus_rolling_sha256: digest.optional(),
  continuation_handle: discussionHandle.optional(),
  receipt: discussionReceiptSchema.optional(),
  boundary: depthBoundarySchema.optional()
}).strict().superRefine((record, context) => {
  addDepthRecordRelationshipIssues(record, context);
  if (
    record.receipt !== undefined &&
    record.receipt.source_video_id !== record.source.video_id
  ) {
    context.addIssue({
      code: "custom",
      message: "Discussion receipt must match its selected source identity"
    });
  }
  const evidenceParts = [
    record.receipt,
    record.segment_index,
    record.corpus_rolling_sha256
  ].filter((value) => value !== undefined).length;
  if (evidenceParts !== 0 && evidenceParts !== 3) {
    context.addIssue({
      code: "custom",
      message: "Discussion receipt, segment identity, and corpus hash must travel together"
    });
  }
});

export const researchVideoDepthStateSchema = z.object({
  selection_digest: digest.optional(),
  selected_video_ids: z.array(youtubeVideoId).max(76),
  transcripts: z.array(transcriptDepthRecordSchema).max(76),
  discussions: z.array(discussionDepthRecordSchema).max(76)
}).strict().superRefine((state, context) => {
  if (new Set(state.selected_video_ids).size !== state.selected_video_ids.length) {
    context.addIssue({ code: "custom", message: "Selected video identities must be unique" });
  }
  const transcriptIds = state.transcripts.map(({ source }) => source.video_id);
  const discussionIds = state.discussions.map(({ source }) => source.video_id);
  if (
    !sameMembers(state.selected_video_ids, transcriptIds) ||
    !sameMembers(state.selected_video_ids, discussionIds)
  ) {
    context.addIssue({
      code: "custom",
      message: "Every selected video needs exactly one transcript and discussion depth record"
    });
  }
  if (
    state.selected_video_ids.length === 0 !==
      (state.selection_digest === undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "Video depth selection identity and selected records must agree"
    });
  }
});

export type ResearchVideoDepthState = z.output<typeof researchVideoDepthStateSchema>;
export type ResearchVideoDepthRecordStatus = z.output<
  typeof researchVideoDepthRecordStatusSchema
>;

export const youtubeDiscussionActionOutputSchema =
  youtubeVideoCommunityAuditOutputSchema.extend({
    coverage_receipt: discussionReceiptSchema
  }).strict();

export type YoutubeDiscussionActionOutput = z.output<
  typeof youtubeDiscussionActionOutputSchema
>;
export type YoutubeTranscriptActionOutput = z.output<
  typeof youtubeTranscriptActionOutputSchema
>;

export const researchVideoDepthWorkPackageSchema = z.object({
  capability: z.enum(["transcript_acquisition", "community_discussion_audit"]),
  video_id: youtubeVideoId,
  attempt: z.number().int().nonnegative(),
  continuation: z.boolean()
}).strict();

export type ResearchVideoDepthWorkPackage = z.output<
  typeof researchVideoDepthWorkPackageSchema
>;

export const researchVideoDepthDiagnosticsSchema = z.object({
  selected_video_ids: z.array(youtubeVideoId),
  transcript_complete_video_ids: z.array(youtubeVideoId),
  transcript_terminal_video_ids: z.array(youtubeVideoId),
  transcript_retryable_video_ids: z.array(youtubeVideoId),
  transcript_pending_video_ids: z.array(youtubeVideoId),
  discussion_complete_video_ids: z.array(youtubeVideoId),
  discussion_terminal_video_ids: z.array(youtubeVideoId),
  discussion_retryable_video_ids: z.array(youtubeVideoId),
  discussion_pending_video_ids: z.array(youtubeVideoId)
}).strict();

export type ResearchVideoDepthDiagnostics = z.output<
  typeof researchVideoDepthDiagnosticsSchema
>;

export interface ResearchVideoDepthExecutors {
  getTranscript: (
    input: YoutubeTranscriptInput
  ) => Promise<YoutubeTranscriptActionOutput>;
  auditDiscussion: (
    input: YoutubeVideoCommunityAuditInput
  ) => Promise<YoutubeDiscussionActionOutput>;
}

export function initialResearchVideoDepthState(): ResearchVideoDepthState {
  return researchVideoDepthStateSchema.parse({
    selected_video_ids: [],
    transcripts: [],
    discussions: []
  });
}

export function initializeResearchVideoDepth(
  discovery: ResearchCandidateDiscoveryState
): ResearchVideoDepthState {
  const selectedIds = selectedCandidateVideoIds(discovery);
  const selected = selectedIds.map((videoId) => {
    const candidate = discovery.candidates.find(({ video_id }) => video_id === videoId);
    if (candidate === undefined) throw new Error("Selected candidate identity is missing");
    return {
      video_id: candidate.video_id,
      canonical_url: candidate.canonical_url,
      title: candidate.title,
      channel_id: candidate.channel_id,
      channel_title: candidate.channel_title,
      metadata_access_status: candidate.metadata_access_status
    };
  });
  return researchVideoDepthStateSchema.parse({
    selection_digest: candidateScreeningResultDigest(discovery),
    selected_video_ids: selectedIds,
    transcripts: selected.map((source) => ({
      source,
      status: "NOT_STARTED",
      attempt: 0
    })),
    discussions: selected.map((source) => ({
      source,
      status: "NOT_STARTED",
      attempt: 0
    }))
  });
}

export function assertVideoDepthMatchesSelection(
  rawDepth: ResearchVideoDepthState,
  discovery: ResearchCandidateDiscoveryState
): void {
  const depth = researchVideoDepthStateSchema.parse(rawDepth);
  const selectedIds = selectedCandidateVideoIds(discovery);
  if (
    depth.selection_digest !== candidateScreeningResultDigest(discovery) ||
    !sameMembers(depth.selected_video_ids, selectedIds)
  ) {
    throw new Error("Video depth records are bound to a different candidate selection");
  }
}

export function deriveResearchVideoDepthWorkPackages(
  rawState: ResearchVideoDepthState
): ResearchVideoDepthWorkPackage[] {
  const state = researchVideoDepthStateSchema.parse(rawState);
  return [
    ...state.transcripts.flatMap((record) =>
      executableDepthRecord(record.status)
        ? [researchVideoDepthWorkPackageSchema.parse({
          capability: "transcript_acquisition",
          video_id: record.source.video_id,
          attempt: record.attempt,
          continuation: record.continuation_handle !== undefined
        })]
        : []
    ),
    ...state.discussions.flatMap((record) =>
      executableDepthRecord(record.status)
        ? [researchVideoDepthWorkPackageSchema.parse({
          capability: "community_discussion_audit",
          video_id: record.source.video_id,
          attempt: record.attempt,
          continuation: record.continuation_handle !== undefined
        })]
        : []
    )
  ];
}

export function deriveTranscriptActionInput(
  rawState: ResearchVideoDepthState,
  videoId: string
): YoutubeTranscriptInput {
  const state = researchVideoDepthStateSchema.parse(rawState);
  const record = findTranscript(state, videoId);
  assertExecutableRecord(record.status, "Transcript");
  const languageCode = record.receipt?.selected_track.language_code;
  return youtubeTranscriptInputSchema.parse({
    video_id_or_url: videoId,
    page_size: 200,
    ...(typeof languageCode === "string" && languageCode !== "not_reported"
      ? { language_code: languageCode }
      : {}),
    ...(record.continuation_handle === undefined
      ? {}
      : { cursor: record.continuation_handle })
  });
}

export function deriveDiscussionActionInput(
  rawState: ResearchVideoDepthState,
  videoId: string
): YoutubeVideoCommunityAuditInput {
  const state = researchVideoDepthStateSchema.parse(rawState);
  const record = findDiscussion(state, videoId);
  assertExecutableRecord(record.status, "Discussion");
  return youtubeVideoCommunityAuditInputSchema.parse(
    record.continuation_handle === undefined
      ? { video_id_or_url: videoId, analysis_limit: 500 }
      : { continuation_token: record.continuation_handle, analysis_limit: 500 }
  );
}

export async function executeTranscriptDepthChain(
  rawState: ResearchVideoDepthState,
  videoId: string,
  execute: ResearchVideoDepthExecutors["getTranscript"],
  maximumCalls = 1_000
): Promise<ResearchVideoDepthState> {
  let state = researchVideoDepthStateSchema.parse(rawState);
  const limit = boundedCallLimit(maximumCalls);
  for (let call = 0; call < limit; call += 1) {
    const output = await execute(deriveTranscriptActionInput(state, videoId));
    state = ingestTranscriptActionOutput(state, videoId, output);
    const status = findTranscript(state, videoId).status;
    if (status !== "IN_PROGRESS") return state;
  }
  throw new Error("Transcript chain exceeded its bounded automatic continuation limit");
}

export async function executeDiscussionDepthChain(
  rawState: ResearchVideoDepthState,
  videoId: string,
  execute: ResearchVideoDepthExecutors["auditDiscussion"],
  maximumCalls = 1_000
): Promise<ResearchVideoDepthState> {
  let state = researchVideoDepthStateSchema.parse(rawState);
  const limit = boundedCallLimit(maximumCalls);
  for (let call = 0; call < limit; call += 1) {
    const requestedHandle = findDiscussion(state, videoId).continuation_handle;
    const output = await execute(deriveDiscussionActionInput(state, videoId));
    state = ingestDiscussionActionOutput(
      state,
      videoId,
      requestedHandle,
      output
    );
    const status = findDiscussion(state, videoId).status;
    if (status !== "IN_PROGRESS") return state;
  }
  throw new Error("Discussion chain exceeded its bounded automatic continuation limit");
}

export function ingestTranscriptActionOutput(
  rawState: ResearchVideoDepthState,
  videoId: string,
  rawOutput: YoutubeTranscriptActionOutput
): ResearchVideoDepthState {
  const state = researchVideoDepthStateSchema.parse(rawState);
  const index = state.transcripts.findIndex(({ source }) => source.video_id === videoId);
  if (index < 0) throw new Error("Transcript output does not belong to a selected video");
  const previous = state.transcripts[index]!;
  assertExecutableRecord(previous.status, "Transcript");
  const output = youtubeTranscriptActionOutputSchema.parse(rawOutput);
  const receipt = output.coverage_receipt;
  const suppliedHandle = output.pagination.cursor;
  if (
    receipt.source_video_id !== videoId ||
    (
      output.primary_identifier !== videoId &&
      !(output.primary_identifier === undefined && output.error !== undefined)
    ) ||
    output.query?.video_id !== videoId ||
    suppliedHandle !== previous.continuation_handle ||
    receipt.access_status !== output.access_status ||
    receipt.pagination.exhausted !== output.pagination.exhausted ||
    receipt.pagination.next_cursor_present !==
      (output.pagination.next_cursor !== undefined) ||
    !receipt.pagination.chain_started_at_first_page ||
    !receipt.pagination.cursor_chain_reconciled
  ) {
    throw new Error("Transcript Action output does not match the selected receipt chain");
  }
  assertTranscriptReceiptAdvance(previous.receipt, receipt, output.pagination.returned);
  const nextHandle = output.pagination.next_cursor;
  let next: z.output<typeof transcriptDepthRecordSchema>;
  if (completeTranscriptReceipt(receipt)) {
    next = {
      source: previous.source,
      status: "COMPLETE",
      attempt: previous.attempt,
      receipt
    };
  } else if (receipt.error_retryable === true || receipt.access_status === "rate_limited") {
    next = nextHandle === undefined
      ? restartTranscriptRecord(
          previous,
          "TRANSCRIPT_RETRYABLE_WITHOUT_CONTINUATION_RESTART_REQUIRED"
        )
      : {
          source: previous.source,
          status: "BLOCKED_RETRYABLE",
          attempt: previous.attempt,
          continuation_handle: nextHandle,
          receipt,
          boundary: {
            classification: "RETRYABLE",
            code: "TRANSCRIPT_RETRYABLE_BOUNDARY",
            summary: "The selected transcript chain has retryable provider work remaining."
          }
        };
  } else if (!receipt.pagination.exhausted && nextHandle !== undefined) {
    if (nextHandle === suppliedHandle) {
      throw new Error("Successful transcript continuation cannot replay the same handle");
    }
    next = {
      source: previous.source,
      status: "IN_PROGRESS",
      attempt: previous.attempt,
      continuation_handle: nextHandle,
      receipt
    };
  } else {
    next = {
      source: previous.source,
      status: "BLOCKED_TERMINAL",
      attempt: previous.attempt,
      receipt,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "TRANSCRIPT_TERMINAL_BOUNDARY",
        summary: "The selected transcript reached a nonretryable access boundary."
      }
    };
  }
  const transcripts = [...state.transcripts];
  transcripts[index] = transcriptDepthRecordSchema.parse(next);
  return researchVideoDepthStateSchema.parse({ ...state, transcripts });
}

export function ingestDiscussionActionOutput(
  rawState: ResearchVideoDepthState,
  videoId: string,
  requestedHandle: string | undefined,
  rawOutput: YoutubeDiscussionActionOutput
): ResearchVideoDepthState {
  const state = researchVideoDepthStateSchema.parse(rawState);
  const index = state.discussions.findIndex(({ source }) => source.video_id === videoId);
  if (index < 0) throw new Error("Discussion output does not belong to a selected video");
  const previous = state.discussions[index]!;
  assertExecutableRecord(previous.status, "Discussion");
  if (requestedHandle !== previous.continuation_handle) {
    throw new Error("Discussion continuation handle does not match server-owned state");
  }
  const output = youtubeDiscussionActionOutputSchema.parse(rawOutput);
  const receipt = output.coverage_receipt;
  if (
    output.video_id !== videoId ||
    output.canonical_url !== previous.source.canonical_url ||
    receipt.source_video_id !== videoId ||
    (
      receipt.channel_id !== "not_reported" &&
      receipt.channel_id !== previous.source.channel_id
    ) ||
    JSON.stringify(receipt) !==
      JSON.stringify(projectDiscussionCoverageReceipt(output)) ||
    !receipt.receipt.chain_started_at_first_page ||
    receipt.continuation_recommended !== output.continuation_recommended ||
    (output.continuation_recommended && output.continuation_token === undefined)
  ) {
    throw new Error("Discussion Action output does not match the selected receipt chain");
  }
  const restartCode = output.error?.code;
  const restartRequiredCode = restartCode !== undefined &&
    DISCUSSION_RESTART_CODES.has(restartCode)
    ? restartCode
    : undefined;
  if (restartRequiredCode !== undefined) {
    assertDiscussionRestartSnapshot(previous, output);
  } else {
    assertDiscussionReceiptAdvance(previous, output);
  }
  let next: z.output<typeof discussionDepthRecordSchema>;
  const explicitlyRetryable = receipt.error_retryable === true;
  if (restartRequiredCode !== undefined) {
    next = restartDiscussionRecord(previous, restartRequiredCode);
  } else if (explicitlyRetryable) {
    next = output.continuation_token === undefined
      ? restartDiscussionRecord(
          previous,
          "DISCUSSION_RETRYABLE_WITHOUT_CONTINUATION_RESTART_REQUIRED"
        )
      : {
          source: previous.source,
          status: "BLOCKED_RETRYABLE",
          attempt: previous.attempt,
          segment_index: output.segment_index,
          corpus_rolling_sha256: output.corpus_rolling_sha256,
          continuation_handle: output.continuation_token,
          receipt,
          boundary: {
            classification: "RETRYABLE",
            code: "DISCUSSION_RETRYABLE_BOUNDARY",
            summary: "The selected discussion has retryable provider work remaining."
          }
        };
  } else if (
    receipt.receipt.synthesis_lock === "pass" &&
    receipt.receipt.completion_state === "api_visible_complete"
  ) {
    if (output.continuation_token !== undefined) {
      throw new Error("Complete discussion output cannot retain a continuation handle");
    }
    next = {
      source: previous.source,
      status: "COMPLETE",
      attempt: previous.attempt,
      segment_index: output.segment_index,
      corpus_rolling_sha256: output.corpus_rolling_sha256,
      receipt
    };
  } else if (
    receipt.receipt.synthesis_lock === "pass" &&
    receipt.receipt.completion_state === "completed_with_access_boundary"
  ) {
    next = {
      source: previous.source,
      status: "BLOCKED_TERMINAL",
      attempt: previous.attempt,
      segment_index: output.segment_index,
      corpus_rolling_sha256: output.corpus_rolling_sha256,
      receipt,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "DISCUSSION_TERMINAL_BOUNDARY",
        summary: "The selected discussion reached a recognized terminal access boundary."
      }
    };
  } else if (receipt.receipt.synthesis_lock === "pass") {
    throw new Error("Discussion synthesis lock passed without a terminal completion state");
  } else if (output.access_status === "rate_limited") {
    next = output.continuation_token === undefined
      ? restartDiscussionRecord(
          previous,
          "DISCUSSION_RATE_LIMIT_WITHOUT_CONTINUATION_RESTART_REQUIRED"
        )
      : {
          source: previous.source,
          status: "BLOCKED_RETRYABLE",
          attempt: previous.attempt,
          segment_index: output.segment_index,
          corpus_rolling_sha256: output.corpus_rolling_sha256,
          continuation_handle: output.continuation_token,
          receipt,
          boundary: {
            classification: "RETRYABLE",
            code: "DISCUSSION_RETRYABLE_BOUNDARY",
            summary: "The selected discussion has retryable provider work remaining."
          }
        };
  } else if (output.continuation_recommended) {
    next = {
      source: previous.source,
      status: "IN_PROGRESS",
      attempt: previous.attempt,
      segment_index: output.segment_index,
      corpus_rolling_sha256: output.corpus_rolling_sha256,
      continuation_handle: output.continuation_token!,
      receipt
    };
  } else {
    next = restartDiscussionRecord(
      previous,
      output.error?.code ?? "DISCUSSION_INCOMPLETE_RESTART_REQUIRED"
    );
  }
  const discussions = [...state.discussions];
  discussions[index] = discussionDepthRecordSchema.parse(next);
  return researchVideoDepthStateSchema.parse({ ...state, discussions });
}

export function restartResearchVideoDepthChain(
  rawState: ResearchVideoDepthState,
  capability: "transcript_acquisition" | "community_discussion_audit",
  videoId: string,
  code: string
): ResearchVideoDepthState {
  const state = researchVideoDepthStateSchema.parse(rawState);
  if (capability === "transcript_acquisition") {
    const index = state.transcripts.findIndex(({ source }) => source.video_id === videoId);
    if (index < 0) throw new Error("Transcript restart does not belong to a selected video");
    const previous = state.transcripts[index]!;
    assertRestartableRecord(previous.status, "Transcript");
    const transcripts = [...state.transcripts];
    transcripts[index] = transcriptDepthRecordSchema.parse(
      restartTranscriptRecord(previous, code)
    );
    return researchVideoDepthStateSchema.parse({ ...state, transcripts });
  }
  const index = state.discussions.findIndex(({ source }) => source.video_id === videoId);
  if (index < 0) throw new Error("Discussion restart does not belong to a selected video");
  const previous = state.discussions[index]!;
  assertRestartableRecord(previous.status, "Discussion");
  const discussions = [...state.discussions];
  discussions[index] = discussionDepthRecordSchema.parse(
    restartDiscussionRecord(previous, code)
  );
  return researchVideoDepthStateSchema.parse({ ...state, discussions });
}

/**
 * Build a non-authoritative replay frontier for reacquiring raw public source
 * material after the process-local cache is lost. The caller must compare the
 * replay's final receipts with the authoritative completed receipts and must
 * never persist this replay state.
 */
export function createCompletedVideoDepthReplay(
  rawState: ResearchVideoDepthState,
  capability: "transcript_acquisition" | "community_discussion_audit",
  videoId: string
): ResearchVideoDepthState {
  const state = researchVideoDepthStateSchema.parse(rawState);
  const boundary = {
    classification: "RETRYABLE" as const,
    code: "EPHEMERAL_MATERIAL_REACQUISITION",
    summary: "Reacquire the exact completed public source only for receipt comparison."
  };
  if (capability === "transcript_acquisition") {
    const index = state.transcripts.findIndex(({ source }) => source.video_id === videoId);
    if (index < 0 || state.transcripts[index]!.status !== "COMPLETE") {
      throw new Error("Only a completed selected transcript can be replayed");
    }
    const transcripts = [...state.transcripts];
    transcripts[index] = transcriptDepthRecordSchema.parse({
      source: transcripts[index]!.source,
      status: "RESTART_REQUIRED",
      attempt: transcripts[index]!.attempt + 1,
      boundary
    });
    return researchVideoDepthStateSchema.parse({ ...state, transcripts });
  }
  const index = state.discussions.findIndex(({ source }) => source.video_id === videoId);
  if (index < 0 || state.discussions[index]!.status !== "COMPLETE") {
    throw new Error("Only a completed selected discussion can be replayed");
  }
  const discussions = [...state.discussions];
  discussions[index] = discussionDepthRecordSchema.parse({
    source: discussions[index]!.source,
    status: "RESTART_REQUIRED",
    attempt: discussions[index]!.attempt + 1,
    boundary
  });
  return researchVideoDepthStateSchema.parse({ ...state, discussions });
}

/**
 * Continuation handles are process-local. On durable-session restore, discard
 * only active handle-bound chains and preserve completed or genuinely terminal
 * receipts.
 */
export function reconcileVideoDepthAfterEphemeralLoss(
  rawState: ResearchVideoDepthState,
): ResearchVideoDepthState {
  let state = researchVideoDepthStateSchema.parse(rawState);
  for (const record of [...state.transcripts]) {
    if (record.continuation_handle === undefined) continue;
    state = restartResearchVideoDepthChain(
      state,
      "transcript_acquisition",
      record.source.video_id,
      "TRANSCRIPT_HANDLE_LOST_ON_RESTORE",
    );
  }
  for (const record of [...state.discussions]) {
    if (record.continuation_handle === undefined) continue;
    state = restartResearchVideoDepthChain(
      state,
      "community_discussion_audit",
      record.source.video_id,
      "DISCUSSION_HANDLE_LOST_ON_RESTORE",
    );
  }
  return researchVideoDepthStateSchema.parse(state);
}

export function deriveVideoDepthOperationStatus(
  rawState: ResearchVideoDepthState,
  capability: "transcript_acquisition" | "community_discussion_audit"
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" |
  "BLOCKED_RETRYABLE" | "BLOCKED_TERMINAL" {
  const state = researchVideoDepthStateSchema.parse(rawState);
  const records = capability === "transcript_acquisition"
    ? state.transcripts
    : state.discussions;
  if (records.length === 0 || records.every(({ status }) => status === "NOT_STARTED")) {
    return "NOT_STARTED";
  }
  if (records.some(({ status }) =>
    status === "BLOCKED_RETRYABLE" || status === "RESTART_REQUIRED"
  )) return "BLOCKED_RETRYABLE";
  if (records.some(({ status }) =>
    status === "NOT_STARTED" || status === "IN_PROGRESS"
  )) return "IN_PROGRESS";
  if (records.every(({ status }) => status === "COMPLETE")) return "COMPLETE";
  if (records.every(({ status }) =>
    status === "COMPLETE" || status === "BLOCKED_TERMINAL"
  )) return "BLOCKED_TERMINAL";
  return "IN_PROGRESS";
}

export function deriveResearchVideoDepthDiagnostics(
  rawState: ResearchVideoDepthState
): ResearchVideoDepthDiagnostics {
  const state = researchVideoDepthStateSchema.parse(rawState);
  return researchVideoDepthDiagnosticsSchema.parse({
    selected_video_ids: state.selected_video_ids,
    ...depthDiagnosticFields("transcript", state.transcripts),
    ...depthDiagnosticFields("discussion", state.discussions)
  });
}

function addDepthRecordRelationshipIssues(
  record: {
    status: ResearchVideoDepthRecordStatus;
    continuation_handle?: string;
    receipt?: unknown;
    boundary?: z.output<typeof depthBoundarySchema>;
  },
  context: z.RefinementCtx
): void {
  const blocked = record.status === "BLOCKED_RETRYABLE" ||
    record.status === "BLOCKED_TERMINAL" || record.status === "RESTART_REQUIRED";
  if (blocked !== (record.boundary !== undefined)) {
    context.addIssue({ code: "custom", message: "Depth boundary and blocked state must agree" });
  }
  if (
    record.status === "BLOCKED_TERMINAL" &&
    record.boundary?.classification !== "TERMINAL_NONRETRYABLE"
  ) {
    context.addIssue({ code: "custom", message: "Terminal depth state needs a terminal boundary" });
  }
  if (
    (record.status === "BLOCKED_RETRYABLE" || record.status === "RESTART_REQUIRED") &&
    record.boundary?.classification !== "RETRYABLE"
  ) {
    context.addIssue({ code: "custom", message: "Retryable depth state needs a retryable boundary" });
  }
  if (
    (record.status === "NOT_STARTED" || record.status === "RESTART_REQUIRED") &&
    (record.receipt !== undefined || record.continuation_handle !== undefined)
  ) {
    context.addIssue({ code: "custom", message: "Fresh depth state cannot retain an old chain" });
  }
  if (
    (record.status === "COMPLETE" || record.status === "BLOCKED_TERMINAL" ||
      record.status === "BLOCKED_RETRYABLE" || record.status === "IN_PROGRESS") &&
    record.receipt === undefined
  ) {
    context.addIssue({ code: "custom", message: "Advanced depth state needs a server receipt" });
  }
  if (
    (record.status === "COMPLETE" || record.status === "BLOCKED_TERMINAL") &&
    record.continuation_handle !== undefined
  ) {
    context.addIssue({ code: "custom", message: "Terminal depth state cannot retain continuation" });
  }
}

function assertTranscriptReceiptAdvance(
  previous: z.output<typeof transcriptReceiptSchema> | undefined,
  next: z.output<typeof transcriptReceiptSchema>,
  returnedThisPage: number
): void {
  if (previous === undefined) {
    if (
      next.pagination.page_count !== 1 ||
      next.pagination.records_returned_cumulative !== returnedThisPage
    ) throw new Error("Transcript first-page receipt did not start at the first page");
    return;
  }
  if (
    JSON.stringify(previous.selected_track) !== JSON.stringify(next.selected_track) ||
    previous.source_video_id !== next.source_video_id
  ) throw new Error("Transcript selected track changed within one chain");
  const retry = next.error_retryable === true;
  const expectedPageCount = retry
    ? previous.pagination.page_count
    : typeof previous.pagination.page_count === "number"
      ? previous.pagination.page_count + 1
      : "not_reported";
  const expectedCumulative = previous.pagination.records_returned_cumulative +
    (retry ? 0 : returnedThisPage);
  if (
    next.pagination.page_count !== expectedPageCount ||
    next.pagination.records_returned_cumulative !== expectedCumulative
  ) throw new Error("Transcript continuation receipt skipped, replayed, or changed counts");
}

function completeTranscriptReceipt(
  receipt: z.output<typeof transcriptReceiptSchema>
): boolean {
  return receipt.access_status === "api_visible_complete" &&
    receipt.pagination.exhausted &&
    !receipt.pagination.next_cursor_present &&
    receipt.selected_track.language_code !== "not_reported" &&
    receipt.selected_track.language_name !== "not_reported" &&
    receipt.selected_track.is_auto_generated !== "not_reported" &&
    receipt.timestamp_provenance === "segment_timestamp_urls";
}

function assertDiscussionReceiptAdvance(
  previous: z.output<typeof discussionDepthRecordSchema>,
  output: YoutubeDiscussionActionOutput
): void {
  const priorReceipt = previous.receipt;
  if (priorReceipt === undefined) return;
  if (
    output.segment_index <= (previous.segment_index ?? -1) &&
    output.error?.retryable !== true
  ) throw new Error("Discussion continuation replayed its prior segment");
  if (
    output.segment_index < (previous.segment_index ?? 0) ||
    output.records_retrieved_cumulative < priorReceipt.records_retrieved_cumulative ||
    output.top_level_comments_retrieved_cumulative <
      priorReceipt.top_level_comments_retrieved_cumulative ||
    output.replies_retrieved_cumulative < priorReceipt.replies_retrieved_cumulative
  ) throw new Error("Discussion continuation receipt skipped or decreased cumulative state");
  if (
    output.records_retrieved_cumulative <= priorReceipt.records_retrieved_cumulative &&
    output.error?.retryable !== true
  ) throw new Error("Discussion continuation did not advance cumulative coverage");
}

function assertDiscussionRestartSnapshot(
  previous: z.output<typeof discussionDepthRecordSchema>,
  output: YoutubeDiscussionActionOutput
): void {
  const prior = previous.receipt;
  if (
    prior === undefined ||
    output.segment_index !== previous.segment_index ||
    output.records_retrieved_cumulative !== prior.records_retrieved_cumulative ||
    output.top_level_comments_retrieved_cumulative !==
      prior.top_level_comments_retrieved_cumulative ||
    output.replies_retrieved_cumulative !== prior.replies_retrieved_cumulative ||
    output.corpus_rolling_sha256 !== previous.corpus_rolling_sha256 ||
    JSON.stringify(output.reply_count_mismatches) !==
      JSON.stringify(prior.reply_count_mismatches) ||
    output.records_retrieved_this_call !== 0 ||
    output.top_level_comments_retrieved_this_call !== 0 ||
    output.replies_retrieved_this_call !== 0 ||
    output.comment_thread_pages_this_call !== 0 ||
    output.reply_pages_this_call !== 0 ||
    output.continuation_recommended ||
    output.continuation_token !== undefined ||
    output.receipt.completion_state !== "incomplete" ||
    output.receipt.synthesis_lock !== "block"
  ) {
    throw new Error(
      "Discussion restart snapshot does not match the authoritative prior frontier"
    );
  }
}

function restartDiscussionRecord(
  previous: z.output<typeof discussionDepthRecordSchema>,
  code: string
): z.output<typeof discussionDepthRecordSchema> {
  return discussionDepthRecordSchema.parse({
    source: previous.source,
    status: "RESTART_REQUIRED",
    attempt: previous.attempt + 1,
    boundary: {
      classification: "RETRYABLE",
      code: normalizeBoundaryCode(code, "DISCUSSION_RESTART_REQUIRED"),
      summary: "The discussion continuation was discarded; restart only this selected video."
    }
  });
}

function restartTranscriptRecord(
  previous: z.output<typeof transcriptDepthRecordSchema>,
  code: string
): z.output<typeof transcriptDepthRecordSchema> {
  return transcriptDepthRecordSchema.parse({
    source: previous.source,
    status: "RESTART_REQUIRED",
    attempt: previous.attempt + 1,
    boundary: {
      classification: "RETRYABLE",
      code: normalizeBoundaryCode(code, "TRANSCRIPT_RESTART_REQUIRED"),
      summary: "The transcript continuation was discarded; restart only this selected video."
    }
  });
}

function findTranscript(state: ResearchVideoDepthState, videoId: string) {
  const record = state.transcripts.find(({ source }) => source.video_id === videoId);
  if (record === undefined) throw new Error("Transcript work does not belong to a selected video");
  return record;
}

function findDiscussion(state: ResearchVideoDepthState, videoId: string) {
  const record = state.discussions.find(({ source }) => source.video_id === videoId);
  if (record === undefined) throw new Error("Discussion work does not belong to a selected video");
  return record;
}

function assertExecutableRecord(status: ResearchVideoDepthRecordStatus, label: string): void {
  if (!executableDepthRecord(status)) {
    throw new Error(`${label} depth record is not executable`);
  }
}

function assertRestartableRecord(
  status: ResearchVideoDepthRecordStatus,
  label: string
): void {
  if (status !== "IN_PROGRESS" && status !== "BLOCKED_RETRYABLE") {
    throw new Error(`${label} depth record has no active chain to restart`);
  }
}

function executableDepthRecord(status: ResearchVideoDepthRecordStatus): boolean {
  return status === "NOT_STARTED" || status === "IN_PROGRESS" ||
    status === "BLOCKED_RETRYABLE" || status === "RESTART_REQUIRED";
}

function depthDiagnosticFields(
  prefix: "transcript" | "discussion",
  records: ReadonlyArray<{ source: { video_id: string }; status: ResearchVideoDepthRecordStatus }>
): Record<string, string[]> {
  return {
    [`${prefix}_complete_video_ids`]: records
      .filter(({ status }) => status === "COMPLETE")
      .map(({ source }) => source.video_id),
    [`${prefix}_terminal_video_ids`]: records
      .filter(({ status }) => status === "BLOCKED_TERMINAL")
      .map(({ source }) => source.video_id),
    [`${prefix}_retryable_video_ids`]: records
      .filter(({ status }) =>
        status === "BLOCKED_RETRYABLE" || status === "RESTART_REQUIRED"
      ).map(({ source }) => source.video_id),
    [`${prefix}_pending_video_ids`]: records
      .filter(({ status }) => status === "NOT_STARTED" || status === "IN_PROGRESS")
      .map(({ source }) => source.video_id)
  };
}

function normalizeBoundaryCode(value: string, fallback: string): string {
  let normalized = "";
  let separatorPending = false;
  let inspectedCharacters = 0;
  for (const sourceCharacter of value) {
    inspectedCharacters += 1;
    if (inspectedCharacters > 1_000) break;
    const character = sourceCharacter.toUpperCase();
    const allowed =
      character.length === 1 &&
      (
        (character >= "A" && character <= "Z") ||
        (character >= "0" && character <= "9")
      );
    if (!allowed) {
      separatorPending = normalized.length > 0;
      continue;
    }
    if (separatorPending && normalized.length < 80) normalized += "_";
    if (normalized.length < 80) normalized += character;
    separatorPending = false;
    if (normalized.length >= 80) break;
  }
  return normalized.length >= 3 && normalized[0]! >= "A" && normalized[0]! <= "Z"
    ? normalized
    : fallback;
}

function boundedCallLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error("Automatic depth continuation limit must be an integer from 1 to 10000");
  }
  return value;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value));
}

const DISCUSSION_RESTART_CODES = new Set([
  "youtube_video_audit_continuation_migration_restart_required",
  "youtube_video_audit_identifier_membership_restart_required",
  "youtube_video_audit_continuation_invalid",
  "youtube_video_audit_continuation_expired"
]);
