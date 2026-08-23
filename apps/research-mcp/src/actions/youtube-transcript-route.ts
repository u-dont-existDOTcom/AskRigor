import {
  getYoutubeTranscript,
  parseYoutubeVideoId,
  youtubeTranscriptEnvelopeSchema,
  youtubeTranscriptInputSchema,
  type YoutubeTranscriptEnvelope,
  type YoutubeTranscriptInput
} from "@askrigor/sources";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import {
  createTreatmentLandscapeCoverageActionRoute,
  transcriptReceiptSchema,
  type TranscriptCoverageReceipt
} from "./treatment-landscape-coverage-route.js";
import { createGeminiCandidateActionRoute } from "./gemini-candidate-route.js";
import { createOpenFullTextActionRoutes } from "./open-full-text-route.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";
import {
  createYoutubeTranscriptContinuationHandleStore,
  isYoutubeTranscriptContinuationHandle,
  YoutubeTranscriptContinuationHandleError,
  type YoutubeTranscriptContinuationHandleStore,
  type YoutubeTranscriptContinuationState
} from "./youtube-transcript-continuation-handle.js";

const ACTION_INPUT_INVALID_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "retryable"],
      properties: {
        code: { const: "action_input_invalid" },
        retryable: { const: false }
      }
    }
  }
} as const;

const TRANSCRIPT_CONTINUATION_ERROR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "retryable"],
      properties: {
        code: {
          const: "youtube_transcript_action_continuation_invalid_or_expired"
        },
        retryable: { const: false }
      }
    }
  }
} as const;

export interface CreateYoutubeTranscriptActionRouteOptions {
  getTranscript?: (input: YoutubeTranscriptInput) => Promise<YoutubeTranscriptEnvelope>;
  continuationHandles?: YoutubeTranscriptContinuationHandleStore;
}

export const youtubeTranscriptActionOutputSchema = youtubeTranscriptEnvelopeSchema.extend({
  coverage_receipt: transcriptReceiptSchema
}).strict();

export function createYoutubeTranscriptActionRoute(
  options: CreateYoutubeTranscriptActionRouteOptions = {}
): ActionRoute {
  const retrieve = options.getTranscript ?? getYoutubeTranscript;
  const handles = options.continuationHandles ??
    createYoutubeTranscriptContinuationHandleStore();
  return Object.freeze({
    method: "POST",
    path: "/actions/research/get_youtube_transcript",
    operationId: "get_youtube_transcript",
    summary: "AskRigor get YouTube transcript",
    description: "Retrieve one bounded, timestamped public-video caption track. Continue only with the short one-hour Action handle until exhausted. Retrieval only, not evidence validation.",
    consequential: false,
    public: true,
    publicResearch: true,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(youtubeTranscriptInputSchema),
    responseSchemas: {
      200: actionJsonSchema(youtubeTranscriptActionOutputSchema),
      422: {
        oneOf: [ACTION_INPUT_INVALID_SCHEMA, TRANSCRIPT_CONTINUATION_ERROR_SCHEMA]
      }
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsed = youtubeTranscriptInputSchema.safeParse(body);
      if (!parsed.success) return invalidInput();

      const suppliedHandle = parsed.data.cursor;
      if (suppliedHandle === undefined) {
        const result = youtubeTranscriptEnvelopeSchema.parse(
          await retrieve(parsed.data)
        );
        return firstPageResult(result, parsed.data, handles);
      }
      if (!isYoutubeTranscriptContinuationHandle(suppliedHandle)) {
        return invalidContinuation();
      }

      let state: YoutubeTranscriptContinuationState;
      try {
        state = handles.claim(suppliedHandle);
      } catch (error) {
        if (error instanceof YoutubeTranscriptContinuationHandleError) {
          return invalidContinuation();
        }
        throw error;
      }
      if (
        parseYoutubeVideoId(parsed.data.video_id_or_url) !== state.source_video_id ||
        (
          parsed.data.language_code !== undefined &&
          parsed.data.language_code !== state.selected_track.language_code
        )
      ) {
        handles.rollback(suppliedHandle);
        return invalidContinuation();
      }

      try {
        const result = youtubeTranscriptEnvelopeSchema.parse(await retrieve({
          video_id_or_url: state.source_video_id,
          language_code: state.selected_track.language_code,
          cursor: state.provider_cursor,
          page_size: state.page_size
        }));
        if (result.error !== undefined || !isSuccessfulTranscriptPage(result)) {
          assertContinuationFailureShape(state, result);
          const retryable = result.error?.retryable === true;
          const output = youtubeTranscriptActionOutputSchema.parse({
            ...sanitizeContinuationPage(
              result, suppliedHandle, retryable ? suppliedHandle : undefined
            ),
            coverage_receipt: receiptFromState(state, result, retryable)
          });
          if (retryable) handles.rollback(suppliedHandle);
          else handles.commit(suppliedHandle);
          return { status: 200, body: output };
        }

        const nextState = advanceState(state, result);
        let nextHandle: string | undefined;
        try {
          if (!result.pagination.exhausted) nextHandle = handles.issue(nextState);
          const output = youtubeTranscriptActionOutputSchema.parse({
            ...sanitizeContinuationPage(result, suppliedHandle, nextHandle),
            coverage_receipt: receiptFromState(nextState, result, false)
          });
          handles.commit(suppliedHandle);
          return { status: 200, body: output };
        } catch (error) {
          if (nextHandle !== undefined) handles.revoke(nextHandle);
          throw error;
        }
      } catch (error) {
        handles.rollback(suppliedHandle);
        throw error;
      }
    }
  });
}

export function createActionOnlyResearchRoutes(): readonly ActionRoute[] {
  return Object.freeze([
    createYoutubeTranscriptActionRoute(),
    createTreatmentLandscapeCoverageActionRoute(),
    createGeminiCandidateActionRoute(),
    ...createOpenFullTextActionRoutes()
  ]);
}

function firstPageResult(
  result: YoutubeTranscriptEnvelope,
  input: z.output<typeof youtubeTranscriptInputSchema>,
  handles: YoutubeTranscriptContinuationHandleStore
): ActionResult {
  assertFirstPageIntegrity(result, input);
  if (result.error !== undefined || !isSuccessfulTranscriptPage(result)) {
    return {
      status: 200,
      body: youtubeTranscriptActionOutputSchema.parse({
        ...withoutProviderCursors(result),
        coverage_receipt: receiptForSinglePage(result)
      })
    };
  }
  if (result.pagination.exhausted) {
    return {
      status: 200,
      body: youtubeTranscriptActionOutputSchema.parse({
        ...withoutProviderCursors(result),
        coverage_receipt: receiptForSinglePage(result)
      })
    };
  }

  const state = firstPageState(result, input.page_size);
  let nextHandle: string | undefined;
  try {
    if (!result.pagination.exhausted) nextHandle = handles.issue(state);
    return {
      status: 200,
      body: youtubeTranscriptActionOutputSchema.parse({
        ...sanitizeContinuationPage(result, undefined, nextHandle),
        coverage_receipt: receiptFromState(state, result, false)
      })
    };
  } catch (error) {
    if (nextHandle !== undefined) handles.revoke(nextHandle);
    throw error;
  }
}

function assertFirstPageIntegrity(
  result: YoutubeTranscriptEnvelope,
  input: z.output<typeof youtubeTranscriptInputSchema>
): void {
  if (result.pagination.cursor !== undefined) {
    throw new Error("YouTube transcript Action first page unexpectedly has a cursor");
  }
  const requestedVideoId = parseYoutubeVideoId(input.video_id_or_url);
  const sourceVideoId = result.primary_identifier ?? result.query?.video_id;
  if (
    requestedVideoId !== undefined && sourceVideoId !== undefined &&
    requestedVideoId !== sourceVideoId
  ) {
    throw new Error("YouTube transcript Action first page source identity mismatch");
  }
  assertPageShape(result, 0);
  if (isSuccessfulTranscriptPage(result)) {
    const selectedTrack = result.raw_metadata?.selected_track;
    const providerReportedSegments = result.raw_metadata?.provider_reported_segments;
    if (
      requestedVideoId === undefined || sourceVideoId !== requestedVideoId ||
      result.query?.video_id !== requestedVideoId ||
      selectedTrack === undefined || result.raw_metadata?.snapshot_sha256 === undefined ||
      result.query.language_code !== selectedTrack.language_code ||
      result.pagination.page_size !== input.page_size ||
      providerReportedSegments === undefined ||
      result.data.some(({ language_code: languageCode }) =>
        languageCode !== selectedTrack.language_code
      ) ||
      (
        result.pagination.exhausted
          ? providerReportedSegments !== result.pagination.returned
          : providerReportedSegments <= result.pagination.returned
      )
    ) {
      throw new Error("YouTube transcript Action first-page chain metadata mismatch");
    }
  }
}

function firstPageState(
  result: YoutubeTranscriptEnvelope,
  pageSize: number
): YoutubeTranscriptContinuationState {
  const sourceVideoId = result.primary_identifier ?? result.query?.video_id;
  const selectedTrack = result.raw_metadata?.selected_track;
  const snapshotSha256 = result.raw_metadata?.snapshot_sha256;
  const providerReportedSegments = result.raw_metadata?.provider_reported_segments;
  if (
    sourceVideoId === undefined || selectedTrack === undefined ||
    snapshotSha256 === undefined || providerReportedSegments === undefined
  ) {
    throw new Error("YouTube transcript Action cannot establish first-page chain state");
  }
  return {
    provider_cursor: result.pagination.next_cursor ?? "terminal",
    source_video_id: sourceVideoId,
    selected_track: selectedTrack,
    snapshot_sha256: snapshotSha256,
    provider_reported_segments: providerReportedSegments,
    page_size: result.pagination.page_size ?? pageSize,
    page_count: 1,
    records_returned_cumulative: result.pagination.returned,
    next_expected_index: result.pagination.returned,
    timestamps_present: pageHasTimestamps(result)
  };
}

function advanceState(
  state: YoutubeTranscriptContinuationState,
  result: YoutubeTranscriptEnvelope
): YoutubeTranscriptContinuationState {
  const sourceVideoId = result.primary_identifier ?? result.query?.video_id;
  const selectedTrack = result.raw_metadata?.selected_track;
  if (
    result.pagination.cursor !== state.provider_cursor ||
    sourceVideoId !== state.source_video_id ||
    result.query?.video_id !== state.source_video_id ||
    result.query?.language_code !== state.selected_track.language_code ||
    result.raw_metadata?.snapshot_sha256 !== state.snapshot_sha256 ||
    result.raw_metadata?.provider_reported_segments !==
      state.provider_reported_segments ||
    result.pagination.page_size !== state.page_size ||
    selectedTrack === undefined ||
    selectedTrack.language_code !== state.selected_track.language_code ||
    selectedTrack.language_name !== state.selected_track.language_name ||
    selectedTrack.is_auto_generated !== state.selected_track.is_auto_generated ||
    result.data.some(({ language_code: languageCode }) =>
      languageCode !== state.selected_track.language_code
    )
  ) {
    throw new Error("YouTube transcript Action continuation chain mismatch");
  }
  assertPageShape(result, state.next_expected_index);
  if (state.page_count >= 9_999) {
    throw new Error("YouTube transcript Action continuation page limit exceeded");
  }
  const nextExpectedIndex = state.next_expected_index + result.pagination.returned;
  if (
    (result.pagination.exhausted &&
      nextExpectedIndex !== state.provider_reported_segments) ||
    (!result.pagination.exhausted &&
      nextExpectedIndex >= state.provider_reported_segments)
  ) {
    throw new Error("YouTube transcript Action provider segment total mismatch");
  }
  return {
    ...state,
    provider_cursor: result.pagination.next_cursor ?? "terminal",
    page_count: state.page_count + 1,
    records_returned_cumulative:
      state.records_returned_cumulative + result.pagination.returned,
    next_expected_index: nextExpectedIndex,
    timestamps_present: state.timestamps_present && pageHasTimestamps(result)
  };
}

function assertPageShape(result: YoutubeTranscriptEnvelope, expectedIndex: number): void {
  if (result.pagination.returned !== result.data.length) {
    throw new Error("YouTube transcript Action returned-count mismatch");
  }
  if (isSuccessfulTranscriptPage(result)) {
    if (result.data.length === 0) {
      throw new Error("YouTube transcript Action successful page is empty");
    }
    if (result.data.some((segment, offset) =>
      segment.index !== expectedIndex + offset
    )) {
      throw new Error("YouTube transcript Action segment chain is not contiguous");
    }
    if (result.pagination.exhausted === (result.pagination.next_cursor !== undefined)) {
      throw new Error("YouTube transcript Action pagination state is inconsistent");
    }
    if (
      result.pagination.exhausted && result.access_status !== "api_visible_complete"
    ) {
      throw new Error("YouTube transcript Action exhausted page is not complete");
    }
    if (!result.pagination.exhausted && result.access_status !== "partial") {
      throw new Error("YouTube transcript Action continuing page is not partial");
    }
  }
}

function assertContinuationFailureShape(
  state: YoutubeTranscriptContinuationState,
  result: YoutubeTranscriptEnvelope
): void {
  const sourceVideoId = result.primary_identifier ?? result.query?.video_id;
  if (
    result.pagination.cursor !== state.provider_cursor ||
    sourceVideoId !== state.source_video_id ||
    result.query?.video_id !== state.source_video_id ||
    result.query?.language_code !== state.selected_track.language_code ||
    result.pagination.page_size !== state.page_size ||
    result.pagination.returned !== 0 || result.data.length !== 0 ||
    result.pagination.exhausted || result.pagination.next_cursor !== undefined
  ) {
    throw new Error("YouTube transcript Action continuation failure mismatch");
  }
}

function isSuccessfulTranscriptPage(result: YoutubeTranscriptEnvelope): boolean {
  return result.error === undefined &&
    (result.access_status === "partial" || result.access_status === "api_visible_complete");
}

function receiptForSinglePage(
  result: YoutubeTranscriptEnvelope
): TranscriptCoverageReceipt {
  const selectedTrack = result.raw_metadata?.selected_track;
  return transcriptReceiptSchema.parse({
    source_video_id: result.primary_identifier ?? result.query?.video_id ?? "not_reported",
    access_status: result.access_status,
    pagination: {
      chain_started_at_first_page: true,
      cursor_chain_reconciled: result.pagination.cursor === undefined,
      page_count: 1,
      records_returned_cumulative: result.pagination.returned,
      exhausted: result.pagination.exhausted,
      next_cursor_present: false
    },
    selected_track: {
      language_code: selectedTrack?.language_code ?? "not_reported",
      language_name: selectedTrack?.language_name ?? "not_reported",
      is_auto_generated: selectedTrack?.is_auto_generated ?? "not_reported"
    },
    timestamp_provenance: pageHasTimestamps(result)
      ? "segment_timestamp_urls"
      : "unavailable",
    error_retryable: result.error?.retryable ?? "not_reported"
  });
}

function receiptFromState(
  state: YoutubeTranscriptContinuationState,
  result: YoutubeTranscriptEnvelope,
  retrySameHandle: boolean
): TranscriptCoverageReceipt {
  return transcriptReceiptSchema.parse({
    source_video_id: state.source_video_id,
    access_status: result.access_status,
    pagination: {
      chain_started_at_first_page: true,
      cursor_chain_reconciled: true,
      page_count: state.page_count,
      records_returned_cumulative: state.records_returned_cumulative,
      exhausted: result.pagination.exhausted,
      next_cursor_present: retrySameHandle || !result.pagination.exhausted
    },
    selected_track: state.selected_track,
    timestamp_provenance: state.timestamps_present
      ? "segment_timestamp_urls"
      : "unavailable",
    error_retryable: result.error?.retryable ?? "not_reported"
  });
}

function sanitizeContinuationPage(
  result: YoutubeTranscriptEnvelope,
  currentHandle: string | undefined,
  nextHandle: string | undefined
): YoutubeTranscriptEnvelope {
  const { cursor: _cursor, next_cursor: _nextCursor, ...pagination } =
    result.pagination;
  return youtubeTranscriptEnvelopeSchema.parse({
    ...result,
    pagination: {
      ...pagination,
      ...(currentHandle === undefined ? {} : { cursor: currentHandle }),
      ...(nextHandle === undefined ? {} : { next_cursor: nextHandle })
    }
  });
}

function withoutProviderCursors(
  result: YoutubeTranscriptEnvelope
): YoutubeTranscriptEnvelope {
  const { cursor: _cursor, next_cursor: _nextCursor, ...pagination } = result.pagination;
  return youtubeTranscriptEnvelopeSchema.parse({ ...result, pagination });
}

function pageHasTimestamps(result: YoutubeTranscriptEnvelope): boolean {
  return result.data.length > 0 &&
    result.data.every(({ timestamp_url: timestampUrl }) => timestampUrl.length > 0);
}

function invalidInput(): ActionResult {
  return {
    status: 422,
    body: { error: { code: "action_input_invalid", retryable: false } }
  };
}

function invalidContinuation(): ActionResult {
  return {
    status: 422,
    body: {
      error: {
        code: "youtube_transcript_action_continuation_invalid_or_expired",
        retryable: false
      }
    }
  };
}

function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _dialect, ...openApiSchema } = converted;
  return openApiSchema;
}
