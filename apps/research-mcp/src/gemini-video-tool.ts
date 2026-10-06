import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  GEMINI_VIDEO_REQUEST_TIMEOUT_MS,
  advanceGeminiVideoPass,
  deleteGeminiVideoInteraction,
  formatVideoTime,
  geminiVideoWatchUrl,
  getYoutubeVideo,
  parseVideoTime,
  type GeminiVideoAdvance,
  type GeminiVideoBoundaryCode,
  type GeminiVideoClaimsReport,
  type GeminiVideoMomentReport,
  type GeminiVideoRequest
} from "@askrigor/sources";
import { z } from "zod";

import { productionGeminiVideoLedger, type GeminiVideoLedger } from "./gemini-video-ledger.js";
import {
  decodeVideoContinuation,
  encodeVideoContinuation,
  VIDEO_CONTINUATION_TTL_MS,
  VideoContinuationError,
  type VideoContinuationState
} from "./gemini-video-continuation.js";
import { successfulToolResult } from "./tool-result.js";

/**
 * extract_youtube_video_claims: Gemini reads one public YouTube video and
 * reports its health claims, each tied to a time ("check this video",
 * AskRigor#248). Gemini gets only the video's public URL and a fixed prompt
 * (packages/sources/src/gemini-video-claims.ts). Its report is a list of
 * claims to check with AskRigor's other tools, never evidence for them.
 */

export const EXTRACT_YOUTUBE_VIDEO_CLAIMS = "extract_youtube_video_claims";
/** Longer videos are refused: one would use much of the shared daily limit. */
export const GEMINI_VIDEO_MAX_SECONDS = 2 * 60 * 60;
// Claude clients abandon a tool call after 60 seconds: polling ends by 40,
// and a poll starts only while its whole timeout still fits.
const POLL_WINDOW_MS = 40_000;
const POLL_DELAY_MS = 3_000;
const RETRY_AFTER_SECONDS = 10;
const MAX_OUTPUT_BYTES = 120_000;
// A time this far past the end is not in the video.
const END_TOLERANCE_SECONDS = 5;

export const EXTRACT_YOUTUBE_VIDEO_CLAIMS_DESCRIPTION =
  "When the person gives a YouTube video, have Gemini read it and list its health claims, each with its time, the " +
  "speaker's words, who says it and the evidence the video gives, plus sponsorships and studies shown on screen. " +
  "Gemini gets only the video's public URL, never the person's words. The result is what the video says, not " +
  "evidence: check each material claim with the other tools, and link each claim to its time. For one unclear claim, " +
  "call again with the video and at (MM:SS): Gemini quotes what is said there and describes what is shown. Reading " +
  "takes about a minute, so the result may be pending with a continuation_token; call again with only that token. " +
  "Each reading counts the whole video against a shared daily limit.";

export const extractYoutubeVideoClaimsInputSchema = z.object({
  video: z.string().trim().min(1).max(2_048).optional()
    .describe("The video's 11-character ID or its YouTube URL."),
  at: z.string().trim().min(1).max(10).optional()
    .describe("Only to follow up one unclear claim: its time, as MM:SS (H:MM:SS from one hour on)."),
  continuation_token: z.string().min(1).max(4_000).optional()
    .describe("Returned while Gemini is still reading; call again with only this token.")
}).strict().superRefine((value, context) => {
  if ((value.video === undefined) === (value.continuation_token === undefined)) {
    context.addIssue({ code: "custom", message: "Provide video, or a continuation_token." });
  }
  if (value.at !== undefined && value.video === undefined) {
    context.addIssue({ code: "custom", message: "The continuation_token already carries the time; send only the token." });
  }
});
export type ExtractYoutubeVideoClaimsInput = z.output<typeof extractYoutubeVideoClaimsInputSchema>;

const speakerSchema = z.enum(["creator", "guest", "other", "unclear"]);
export const extractYoutubeVideoClaimsOutputSchema = z.object({
  status: z.enum(["pending", "complete"]),
  mode: z.enum(["claims", "moment"]),
  video: z.object({
    video_id: z.string(),
    url: z.string(),
    title: z.string(),
    channel: z.string(),
    duration: z.string()
  }).strict(),
  at: z.string().optional(),
  continuation_token: z.string().optional(),
  retry_after_seconds: z.number().int().positive().optional(),
  spoken_language: z.string().optional(),
  claims: z.array(z.object({
    start: z.string(),
    link: z.string(),
    speaker: speakerSchema,
    quote: z.string(),
    claim: z.string(),
    evidence: z.enum(["named_study", "personal_experience", "expert_opinion", "none"]),
    evidence_detail: z.string(),
    specifics: z.array(z.string()),
    time_outside_video: z.literal(true).optional()
  }).strict()).optional(),
  more_claims_not_listed: z.boolean().optional(),
  sponsorships: z.array(z.object({
    start: z.string(),
    link: z.string().optional(),
    what: z.string()
  }).strict()).optional(),
  on_screen_citations: z.array(z.object({
    start: z.string(),
    link: z.string(),
    citation: z.string()
  }).strict()).optional(),
  moment: z.object({
    start: z.string(),
    end: z.string(),
    link: z.string(),
    speaker: speakerSchema,
    said: z.string(),
    shown: z.string()
  }).strict().optional(),
  source_note: z.string().optional(),
  research_receipt: z.string().optional()
}).strict();
type Output = z.output<typeof extractYoutubeVideoClaimsOutputSchema>;

// Gemini reads the video only. Products a creator sells are often in the
// description alone (live acceptance, 2026-10-03), so the note points there.
const SOURCE_NOTE =
  "Gemini's transcription and description of the video, not checked by AskRigor: Gemini can mishear words and " +
  "misplace times, so give each quote with its link for the person to check. Nothing here is evidence for or " +
  "against a claim. Gemini read the video only: read its description with get_youtube_video for affiliate links " +
  "and products the creator sells.";
const SPEND_GUIDANCE =
  "The zero-spend policy allows Gemini only with a key that has no billing (ASKRIGOR_GEMINI_BILLING=none). Check " +
  "the claims the person reports from the video with the other tools, and say the video itself was not read.";
const DELETION_RETRY =
  "Its stored reading could not be deleted yet; call again later with the same continuation_token to delete it.";

/** What the MCP tool hands back: its result, and the claims to sign when it completed. */
export interface VideoClaimsToolOutcome {
  result: CallToolResult;
  receipt?: { video: string; mode: "claims" | "moment"; n: number };
}

export interface VideoClaimsToolDependencies {
  secret: string | undefined;
  geminiKeyUnbilled: boolean;
  geminiApiKey?: string;
  youtubeApiKey?: string;
  getVideo?: typeof getYoutubeVideo;
  advance?: typeof advanceGeminiVideoPass;
  deleteInteraction?: typeof deleteGeminiVideoInteraction;
  ledger?: () => GeminiVideoLedger;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function extractYoutubeVideoClaims(
  input: ExtractYoutubeVideoClaimsInput,
  dependencies: VideoClaimsToolDependencies
): Promise<VideoClaimsToolOutcome> {
  const now = dependencies.now ?? Date.now;
  const started = now();
  const secret = dependencies.secret;
  if (secret === undefined) return refusal("gemini_video_continuation_unavailable", false);
  const geminiApiKey = (dependencies.geminiApiKey ?? process.env.ASKRIGOR_GEMINI_API_KEY ?? "").trim();
  const deleteInteraction = dependencies.deleteInteraction ?? deleteGeminiVideoInteraction;

  let pass: Omit<VideoContinuationState, "checkpoint" | "expires_at_ms">;
  let checkpoint: VideoContinuationState["checkpoint"] | undefined;
  if (input.continuation_token !== undefined) {
    let state: VideoContinuationState;
    try {
      state = decodeVideoContinuation(input.continuation_token, secret, started);
    } catch (error) {
      // An expired token still names the stored reading: delete it first.
      if (error instanceof VideoContinuationError && error.expiredState !== undefined && geminiApiKey !== "") {
        const deleted = await deleteInteraction({ apiKey: geminiApiKey }, error.expiredState.checkpoint.interaction_id);
        return refusal(error.code, !deleted, deleted ? undefined : DELETION_RETRY);
      }
      return refusal(error instanceof VideoContinuationError ? error.code : "gemini_video_continuation_invalid", false);
    }
    if (geminiApiKey === "") return refusal("gemini_provider_not_configured", false);
    // The zero-spend gate holds for a resumed reading too; its stored copy is deleted.
    if (!dependencies.geminiKeyUnbilled) {
      const deleted = await deleteInteraction({ apiKey: geminiApiKey }, state.checkpoint.interaction_id);
      return refusal("gemini_video_spend_not_authorized", !deleted,
        SPEND_GUIDANCE + (deleted ? "" : ` ${DELETION_RETRY}`));
    }
    checkpoint = state.checkpoint;
    pass = { request: state.request, video: state.video, charged_seconds: state.charged_seconds };
  } else {
    const videoId = parseVideoReference(input.video!);
    if (videoId === undefined) {
      return refusal("youtube_video_id_invalid", false, "Give the video's 11-character ID or its YouTube URL.");
    }
    const atSeconds = input.at === undefined ? undefined : parseVideoTime(input.at);
    if (input.at !== undefined && atSeconds === undefined) {
      return refusal("video_time_invalid", false, "Give at as MM:SS, or H:MM:SS from one hour on.");
    }
    if (!dependencies.geminiKeyUnbilled) return refusal("gemini_video_spend_not_authorized", false, SPEND_GUIDANCE);
    if (geminiApiKey === "") return refusal("gemini_provider_not_configured", false);
    const youtubeApiKey = (dependencies.youtubeApiKey ?? process.env.YOUTUBE_API_KEY ?? "").trim();
    if (youtubeApiKey === "") return refusal("youtube_provider_not_configured", false);

    const looked = await lookUpVideo(videoId, youtubeApiKey, dependencies.getVideo ?? getYoutubeVideo);
    if ("refused" in looked) return looked.refused;
    if (atSeconds !== undefined && atSeconds >= looked.duration_seconds) {
      return refusal("video_time_outside_video", false,
        `at is past the end of the video, which runs ${formatVideoTime(looked.duration_seconds)}.`);
    }
    let ledger: GeminiVideoLedger;
    let charge;
    try {
      ledger = (dependencies.ledger ?? productionGeminiVideoLedger)();
      charge = await ledger.charge(looked.duration_seconds);
    } catch {
      return refusal("gemini_video_capacity_unavailable", true,
        "AskRigor could not check its daily video limit, so the video was not read.");
    }
    if (!charge.charged) return refusal("gemini_video_daily_limit_reached", false, dailyLimitGuidance(charge.remaining_seconds));
    const request: GeminiVideoRequest = atSeconds === undefined
      ? { mode: "claims", video_id: videoId }
      : { mode: "moment", video_id: videoId, at_seconds: atSeconds };
    pass = {
      request,
      video: { title: looked.title, channel: looked.channel, duration_seconds: looked.duration_seconds },
      charged_seconds: looked.duration_seconds
    };
  }

  const advance = dependencies.advance ?? advanceGeminiVideoPass;
  const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const config = { apiKey: geminiApiKey };
  let step: GeminiVideoAdvance;
  try {
    step = await advance(pass.request, config, checkpoint);
    while (
      step.kind === "progress" &&
      now() + POLL_DELAY_MS + GEMINI_VIDEO_REQUEST_TIMEOUT_MS <= started + POLL_WINDOW_MS
    ) {
      await sleep(POLL_DELAY_MS);
      step = await advance(pass.request, config, step.checkpoint);
    }
  } catch {
    return refusal("gemini_video_unclassified_failure", false);
  }

  if (step.kind === "boundary") return refusal(step.code, step.retryable, boundaryGuidance(step.code));
  if (step.kind === "progress") {
    const token = encodeVideoContinuation({
      ...pass,
      checkpoint: step.checkpoint,
      expires_at_ms: now() + VIDEO_CONTINUATION_TTL_MS
    }, secret);
    return {
      result: successfulToolResult(
        `Gemini is still reading the video. Call ${EXTRACT_YOUTUBE_VIDEO_CLAIMS} again with only this ` +
          `continuation_token in about ${RETRY_AFTER_SECONDS} seconds.`,
        extractYoutubeVideoClaimsOutputSchema.parse({
          status: "pending",
          ...passFields(pass),
          continuation_token: token,
          retry_after_seconds: RETRY_AFTER_SECONDS
        })
      )
    };
  }
  return completedResult(pass, step.report);
}

/**
 * The 11-character ID from an ID or a YouTube link: watch, youtu.be, Shorts,
 * live and embed links, on www, m and music hosts, with any other
 * parameters. Only the ID goes on; the rest of the link (a share code, say)
 * is dropped.
 */
export function parseVideoReference(text: string): string | undefined {
  const trimmed = text.trim();
  if (/^[A-Za-z0-9_-]{11}$/u.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase().replace(/^(?:www|m|music)\./u, "");
  let id: string | null | undefined;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com") {
    id = url.pathname === "/watch"
      ? url.searchParams.get("v")
      : /^\/(?:shorts|live|embed)\/([^/]+)\/?$/u.exec(url.pathname)?.[1];
  }
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/u.test(id) ? id : undefined;
}

/** Seconds in an ISO 8601 duration as YouTube gives it (P1DT2H3M4S), or undefined. */
export function isoDurationSeconds(duration: string): number | undefined {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?)?$/u.exec(duration);
  if (match === null) return undefined;
  const [, days, hours, minutes, seconds] = match;
  const total = Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
  return Number.isSafeInteger(total) ? total : undefined;
}

async function lookUpVideo(
  videoId: string,
  apiKey: string,
  getVideo: typeof getYoutubeVideo
): Promise<{ title: string; channel: string; duration_seconds: number } | { refused: VideoClaimsToolOutcome }> {
  let found;
  try {
    found = await getVideo(videoId, { apiKey });
  } catch {
    return { refused: refusal("youtube_video_lookup_failed", true) };
  }
  if (found.error?.code === "youtube_video_not_visible" || found.error?.code === "youtube_video_not_found") {
    return { refused: refusal("youtube_video_not_visible", false,
      "YouTube shows no public video with this ID: it may be deleted, private or mistyped.") };
  }
  if (found.access_status !== "api_visible_complete" || !("video_id" in found.data)) {
    return { refused: refusal("youtube_video_lookup_failed", found.error?.retryable === true) };
  }
  const video = found.data;
  if (video.privacy_status !== "public") {
    return { refused: refusal("youtube_video_not_public", false,
      "Gemini reads only public videos; this one is not public, so it was not read.") };
  }
  if (video.live_broadcast_content !== undefined && video.live_broadcast_content !== "none") {
    return { refused: refusal("youtube_video_live", false,
      "This is a live or upcoming stream; it can be read once it has ended and is published.") };
  }
  const durationSeconds = video.duration === undefined ? undefined : isoDurationSeconds(video.duration);
  if (durationSeconds === undefined || durationSeconds < 1) {
    return { refused: refusal("youtube_video_duration_unknown", false,
      "YouTube gives no length for this video, so it was not read.") };
  }
  if (durationSeconds > GEMINI_VIDEO_MAX_SECONDS) {
    return { refused: refusal("youtube_video_too_long", false,
      `AskRigor reads videos up to ${formatVideoTime(GEMINI_VIDEO_MAX_SECONDS)} long; this one runs ` +
        `${formatVideoTime(durationSeconds)}. Check the claims the person reports from it with the other tools.`) };
  }
  return {
    title: (video.title ?? "").slice(0, 300),
    channel: (video.channel_title ?? "").slice(0, 200),
    duration_seconds: durationSeconds
  };
}

function completedResult(
  pass: Omit<VideoContinuationState, "checkpoint" | "expires_at_ms">,
  report: Extract<GeminiVideoAdvance, { kind: "complete" }>["report"]
): VideoClaimsToolOutcome {
  const videoId = pass.request.video_id;
  const duration = pass.video.duration_seconds;
  const output: Output = report.mode === "claims"
    ? extractYoutubeVideoClaimsOutputSchema.parse({
        status: "complete",
        ...passFields(pass),
        ...claimsFields(report.claims, videoId, duration),
        source_note: SOURCE_NOTE
      })
    : extractYoutubeVideoClaimsOutputSchema.parse({
        status: "complete",
        ...passFields(pass),
        moment: momentFields(report.moment, videoId, duration),
        source_note: SOURCE_NOTE
      });
  if (Buffer.byteLength(JSON.stringify(output), "utf8") > MAX_OUTPUT_BYTES) {
    return refusal("gemini_video_report_too_large", false);
  }
  const claims = output.claims?.length ?? 0;
  return {
    result: successfulToolResult(
      report.mode === "claims"
        ? `Gemini listed ${claims} health claim(s) in the video` +
          (output.more_claims_not_listed === true ? ", and the video makes more it did not list" : "") +
          ". These are what the video says, as Gemini heard it: check each material claim with the other tools, " +
          "and give each one's quote with its link."
        : `Gemini reported what is said and shown at ${output.at}. Give the quote with its link.`,
      output
    ),
    receipt: { video: videoId, mode: report.mode, n: claims }
  };
}

function passFields(pass: Omit<VideoContinuationState, "checkpoint" | "expires_at_ms">): Pick<Output, "mode" | "video" | "at"> {
  return {
    mode: pass.request.mode,
    video: {
      video_id: pass.request.video_id,
      url: geminiVideoWatchUrl(pass.request.video_id),
      title: pass.video.title,
      channel: pass.video.channel,
      duration: formatVideoTime(pass.video.duration_seconds)
    },
    ...(pass.request.mode === "moment" ? { at: formatVideoTime(pass.request.at_seconds) } : {})
  };
}

function claimsFields(report: GeminiVideoClaimsReport, videoId: string, duration: number): Partial<Output> {
  return {
    spoken_language: report.spoken_language,
    claims: report.claims.map((claim) => {
      const time = timeLink(claim.start, videoId, duration);
      return {
        start: claim.start,
        link: time.link,
        speaker: claim.speaker,
        quote: claim.quote,
        claim: claim.claim,
        evidence: claim.evidence,
        evidence_detail: claim.evidence_detail,
        specifics: claim.specifics,
        ...(time.outside ? { time_outside_video: true as const } : {})
      };
    }),
    more_claims_not_listed: report.more_claims_not_listed,
    sponsorships: report.sponsorships.map(({ start, what }) => {
      const time = start === "" ? undefined : timeLink(start, videoId, duration);
      return { start, ...(time === undefined || time.outside ? {} : { link: time.link }), what };
    }),
    on_screen_citations: report.on_screen_citations.map(({ start, citation }) => ({
      start,
      link: timeLink(start, videoId, duration).link,
      citation
    }))
  };
}

function momentFields(moment: GeminiVideoMomentReport, videoId: string, duration: number): Output["moment"] {
  return {
    start: moment.start,
    end: moment.end,
    link: timeLink(moment.start, videoId, duration).link,
    speaker: moment.speaker,
    said: moment.said,
    shown: moment.shown
  };
}

/**
 * A link to the moment (&t=<seconds>s). A time past the video's end is
 * Gemini's mistake: it links to the start and is flagged, never moved.
 */
function timeLink(start: string, videoId: string, duration: number): { link: string; outside: boolean } {
  const seconds = parseVideoTime(start);
  const url = geminiVideoWatchUrl(videoId);
  return seconds === undefined || seconds > duration + END_TOLERANCE_SECONDS
    ? { link: url, outside: true }
    : { link: `${url}&t=${seconds}s`, outside: false };
}

function dailyLimitGuidance(remainingSeconds: number): string {
  return "AskRigor shares a daily limit of 8 hours of video read by Gemini, and each reading counts the whole video; " +
    (remainingSeconds <= 0
      ? "it is used up for today."
      : `${formatVideoTime(remainingSeconds)} is left today, less than this video.`) +
    " It resets at midnight Pacific time. Check the claims the person reports from the video with the other tools, " +
    "and say the video itself could not be read today.";
}

function boundaryGuidance(code: GeminiVideoBoundaryCode): string | undefined {
  switch (code) {
    case "gemini_video_credits_depleted":
      return "AskRigor's Gemini key has used up its prepaid credits, so no video can be read until its billing is " +
        "fixed. Check the claims the person reports from the video with the other tools, and say the video itself " +
        "could not be read.";
    case "gemini_video_not_completed":
    case "gemini_video_request_rejected":
      return "Gemini could not read this video; check the claims the person reports from it with the other tools.";
    case "gemini_video_invalid_report":
    case "gemini_video_missing_output":
      return "Gemini's report did not have the required form, so none of it is used.";
    case "gemini_video_rate_limited":
    case "gemini_video_upstream_unavailable":
    case "gemini_video_timed_out":
      return "A new reading counts the whole video against the daily limit again; try once more later at most.";
    default:
      return undefined;
  }
}

function refusal(code: string, retryable: boolean, guidance?: string): VideoClaimsToolOutcome {
  return {
    result: {
      content: [{
        type: "text",
        text: `extract youtube video claims could not complete: ${code}${retryable ? " (retryable)" : ""}.` +
          (guidance === undefined ? "" : ` ${guidance}`)
      }],
      isError: true
    }
  };
}
