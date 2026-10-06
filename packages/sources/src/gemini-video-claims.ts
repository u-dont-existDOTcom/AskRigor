import { z } from "zod";

import { fetchJson, fetchText, UpstreamHttpError } from "./http.js";
import { youtubeVideoIdSchema } from "./youtube.js";

/**
 * Gemini reads one public YouTube video and reports the health claims it
 * makes, for "check this video" (AskRigor#248, owner decision 2026-09-27).
 *
 * A request carries only the video's public watch URL, rebuilt here from its
 * ID, and a fixed prompt; a follow-up adds only a time. Never a person's
 * question, health details or identity: on the free tier Google may use
 * inputs and outputs to improve its products. Gemini's report is what the
 * video says and shows, as Gemini heard and saw it. It is a lead for AskRigor
 * to check with its usual tools, never evidence for a claim.
 *
 * Each pass runs as one stored background Interaction, polled through a
 * checkpoint and deleted after use, as the scout's are.
 */

const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_API_REVISION = "2026-05-20";
/** Supports agentic video processing (Google's video docs, 2026-09-23). */
export const GEMINI_VIDEO_MODEL = "gemini-3.6-flash" as const;
const GEMINI_VIDEO_MAX_OUTPUT_TOKENS = 16_000;
export const GEMINI_VIDEO_REQUEST_TIMEOUT_MS = 20_000;
export const GEMINI_VIDEO_MAX_POLLS = 120;
export const GEMINI_VIDEO_MAX_CLAIMS = 40;
/** A follow-up reports about this long from its moment. */
export const GEMINI_VIDEO_MOMENT_SPAN_SECONDS = 30;
// Gemini's report is parsed only below this size.
const MAX_REPORT_BYTES = 200_000;
// YouTube's longest videos run 12 hours; no time past that is a moment.
const MAX_VIDEO_SECONDS = 12 * 60 * 60;

const interactionIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,500}$/u);

export const geminiVideoRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("claims"),
    video_id: youtubeVideoIdSchema
  }).strict(),
  z.object({
    mode: z.literal("moment"),
    video_id: youtubeVideoIdSchema,
    at_seconds: z.number().int().min(0).max(MAX_VIDEO_SECONDS)
  }).strict()
]);
export type GeminiVideoRequest = z.output<typeof geminiVideoRequestSchema>;

export const geminiVideoCheckpointSchema = z.object({
  interaction_id: interactionIdSchema,
  poll_attempts: z.number().int().min(0).max(GEMINI_VIDEO_MAX_POLLS)
}).strict();
export type GeminiVideoCheckpoint = z.output<typeof geminiVideoCheckpointSchema>;

export interface GeminiVideoConfig {
  apiKey: string;
}
const configSchema = z.object({ apiKey: z.string().trim().min(1).max(4_096) }).strict();

/**
 * A time in a video as Gemini writes it: MM:SS, or H:MM:SS past an hour.
 * Minutes may run past 59 when the hour is left out.
 */
const videoTimeSchema = z.string().trim().regex(/^(?:\d{1,2}:[0-5]\d|\d{1,3}):[0-5]\d$/u);
const speakerSchema = z.enum(["creator", "guest", "other", "unclear"]);

export const geminiVideoClaimSchema = z.object({
  start: videoTimeSchema,
  speaker: speakerSchema,
  quote: z.string().trim().min(1).max(600),
  claim: z.string().trim().min(1).max(400),
  evidence: z.enum(["named_study", "personal_experience", "expert_opinion", "none"]),
  evidence_detail: z.string().trim().max(400),
  specifics: z.array(z.string().trim().min(1).max(160)).max(12)
}).strict();

export const geminiVideoClaimsReportSchema = z.object({
  spoken_language: z.string().trim().max(35),
  claims: z.array(geminiVideoClaimSchema).max(GEMINI_VIDEO_MAX_CLAIMS),
  more_claims_not_listed: z.boolean(),
  sponsorships: z.array(z.object({
    start: z.union([videoTimeSchema, z.literal("")]),
    what: z.string().trim().min(1).max(300)
  }).strict()).max(12),
  on_screen_citations: z.array(z.object({
    start: videoTimeSchema,
    citation: z.string().trim().min(1).max(400)
  }).strict()).max(24)
}).strict();
export type GeminiVideoClaimsReport = z.output<typeof geminiVideoClaimsReportSchema>;

export const geminiVideoMomentReportSchema = z.object({
  start: videoTimeSchema,
  end: videoTimeSchema,
  speaker: speakerSchema,
  said: z.string().trim().max(2_000),
  shown: z.string().trim().max(1_500)
}).strict();
export type GeminiVideoMomentReport = z.output<typeof geminiVideoMomentReportSchema>;

export interface GeminiVideoUsage {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
}

export const GEMINI_VIDEO_BOUNDARY_CODES = [
  "gemini_video_credits_depleted",
  "gemini_video_rate_limited",
  "gemini_video_inaccessible",
  "gemini_video_request_rejected",
  "gemini_video_upstream_unavailable",
  "gemini_video_request_failed",
  "gemini_video_invalid_response",
  "gemini_video_not_completed",
  "gemini_video_timed_out",
  "gemini_video_missing_output",
  "gemini_video_invalid_report"
] as const;
export type GeminiVideoBoundaryCode = typeof GEMINI_VIDEO_BOUNDARY_CODES[number];

export type GeminiVideoAdvance =
  | { kind: "progress"; checkpoint: GeminiVideoCheckpoint }
  | {
      kind: "complete";
      interaction_id: string;
      model: string;
      usage: GeminiVideoUsage;
      report:
        | { mode: "claims"; claims: GeminiVideoClaimsReport }
        | { mode: "moment"; moment: GeminiVideoMomentReport };
    }
  | {
      kind: "boundary";
      code: GeminiVideoBoundaryCode;
      retryable: boolean;
      // Where an invalid report broke its contract (paths only, no text).
      report_issues?: string[];
    };

const interactionSchema = z.object({
  id: z.string().min(1).optional(),
  status: z.string().min(1),
  model: z.string().optional(),
  steps: z.array(z.object({ type: z.string().min(1) }).passthrough()).default([]),
  usage: z.object({
    total_input_tokens: z.number().int().nonnegative().optional(),
    total_output_tokens: z.number().int().nonnegative().optional(),
    total_thought_tokens: z.number().int().nonnegative().optional()
  }).passthrough().optional()
}).passthrough();

/** The video's public watch URL, the only video address Gemini is given. */
export function geminiVideoWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeVideoIdSchema.parse(videoId)}`;
}

/** Seconds into the video, or undefined for text that is not a video time. */
export function parseVideoTime(text: string): number | undefined {
  if (!videoTimeSchema.safeParse(text).success) return undefined;
  return text.trim().split(":").reduce((seconds, part) => seconds * 60 + Number(part), 0);
}

/** MM:SS, or H:MM:SS from an hour on. */
export function formatVideoTime(seconds: number): string {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("Invalid video time");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours === 0
    ? `${String(minutes).padStart(2, "0")}:${rest}`
    : `${hours}:${String(minutes).padStart(2, "0")}:${rest}`;
}

/**
 * The whole Interactions request for one pass. Nothing in it comes from a
 * person: the URL is rebuilt from a checked video ID, the prompts are fixed,
 * and a follow-up adds only a time formatted here.
 */
export function buildGeminiVideoRequest(request: GeminiVideoRequest): Record<string, unknown> {
  const parsed = geminiVideoRequestSchema.parse(request);
  return {
    model: GEMINI_VIDEO_MODEL,
    input: [
      { type: "video", uri: geminiVideoWatchUrl(parsed.video_id), processing: "agentic" },
      { type: "text", text: parsed.mode === "claims" ? CLAIMS_PROMPT : momentPrompt(parsed.at_seconds) }
    ],
    generation_config: {
      max_output_tokens: GEMINI_VIDEO_MAX_OUTPUT_TOKENS,
      thinking_level: "medium"
    },
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: parsed.mode === "claims" ? CLAIMS_RESPONSE_SCHEMA : MOMENT_RESPONSE_SCHEMA
    },
    background: true,
    store: true
  };
}

const CLAIMS_PROMPT = [
  "You are reading one public YouTube video for AskRigor, a service that checks health claims against research " +
    "evidence. Report what the video says and shows. Do not judge whether any of it is true.",
  "",
  "List every health claim the video makes: any statement that a food, supplement, drug, procedure, exercise, " +
    "practice or product affects health, a disease, a symptom or the body, including claims about safety, dose, " +
    "causes and how something works. Include claims made by guests, in on-screen text and in sponsor segments. " +
    "Leave out greetings, requests to subscribe and anything unrelated to health.",
  "",
  "For each claim, in the order the claims occur:",
  "- start: when it begins, as MM:SS (H:MM:SS from one hour on);",
  "- speaker: creator, guest, other (a narrator, a clip or a caller) or unclear;",
  "- quote: the speaker's exact words, in the language spoken, at most 40 words; never paraphrase inside a quote;",
  "- claim: the claim in one plain English sentence;",
  "- evidence: what the video offers for it: named_study (a study, trial, paper, author or institution named or " +
    "shown), personal_experience, expert_opinion (an appeal to credentials or expertise) or none;",
  "- evidence_detail: that study, source or experience as the video names or shows it, or an empty string;",
  "- specifics: each dose, duration, frequency, product, brand or price mentioned with the claim.",
  "",
  `List at most ${GEMINI_VIDEO_MAX_CLAIMS} claims. If the video makes more, list the ${GEMINI_VIDEO_MAX_CLAIMS} ` +
    "that matter most for health and set more_claims_not_listed to true; otherwise set it to false.",
  "",
  "sponsorships: each sponsorship, paid promotion, affiliate link or discount code, and each product the creator " +
    "sells or promotes, as said or shown, with its start time (an empty string when it has none, such as a " +
    "standing on-screen banner).",
  "on_screen_citations: each study, paper, website or other source shown on screen, as written, with its start " +
    "time.",
  "spoken_language: the main spoken language as a BCP 47 tag, for example en, fr or pt-BR."
].join("\n");

function momentPrompt(atSeconds: number): string {
  const at = formatVideoTime(atSeconds);
  return [
    "You are reading one public YouTube video for AskRigor, a service that checks health claims against research " +
      "evidence. Report what the video says and shows. Do not judge whether any of it is true.",
    "",
    `At ${at}, quote what is said and describe what is shown.`,
    "",
    `- said: the exact words spoken from ${at} for about ${GEMINI_VIDEO_MOMENT_SPAN_SECONDS} seconds, in the ` +
      "language spoken; never paraphrase; an empty string if nothing is said;",
    "- shown: what is on screen in that span, including any text, chart, study, product or label, as written;",
    "- speaker: creator, guest, other (a narrator, a clip or a caller) or unclear;",
    "- start and end: the span you report, as MM:SS (H:MM:SS from one hour on)."
  ].join("\n");
}

const STRING = { type: "string" };
const TIME = { type: "string", description: "MM:SS, or H:MM:SS from one hour on" };
const SPEAKER = { type: "string", enum: ["creator", "guest", "other", "unclear"] };

const CLAIMS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    spoken_language: STRING,
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: TIME,
          speaker: SPEAKER,
          quote: STRING,
          claim: STRING,
          evidence: { type: "string", enum: ["named_study", "personal_experience", "expert_opinion", "none"] },
          evidence_detail: STRING,
          specifics: { type: "array", items: STRING }
        },
        required: ["start", "speaker", "quote", "claim", "evidence", "evidence_detail", "specifics"],
        additionalProperties: false
      }
    },
    more_claims_not_listed: { type: "boolean" },
    sponsorships: {
      type: "array",
      items: {
        type: "object",
        properties: { start: STRING, what: STRING },
        required: ["start", "what"],
        additionalProperties: false
      }
    },
    on_screen_citations: {
      type: "array",
      items: {
        type: "object",
        properties: { start: TIME, citation: STRING },
        required: ["start", "citation"],
        additionalProperties: false
      }
    }
  },
  required: ["spoken_language", "claims", "more_claims_not_listed", "sponsorships", "on_screen_citations"],
  additionalProperties: false
};

const MOMENT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { start: TIME, end: TIME, speaker: SPEAKER, said: STRING, shown: STRING },
  required: ["start", "end", "speaker", "said", "shown"],
  additionalProperties: false
};

/**
 * Starts one pass, or polls the pass a checkpoint names. A completed pass is
 * parsed in memory and its stored copy deleted before the report is returned;
 * while that delete fails, the checkpoint is handed back so a later call can
 * finish it. Malformed reports are refused, never repaired.
 */
export async function advanceGeminiVideoPass(
  request: GeminiVideoRequest,
  config: GeminiVideoConfig,
  checkpoint?: GeminiVideoCheckpoint
): Promise<GeminiVideoAdvance> {
  const parsedRequest = geminiVideoRequestSchema.parse(request);
  const parsedConfig = configSchema.safeParse(config);
  if (!parsedConfig.success) throw new Error("Invalid Gemini video configuration");
  const prior = checkpoint === undefined ? undefined : geminiVideoCheckpointSchema.parse(checkpoint);

  let raw: unknown;
  try {
    raw = prior === undefined
      ? await fetchJson(GEMINI_INTERACTIONS_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Revision": GEMINI_API_REVISION,
            "x-goog-api-key": parsedConfig.data.apiKey
          },
          body: JSON.stringify(buildGeminiVideoRequest(parsedRequest)),
          maxRetries: 0,
          timeoutMs: GEMINI_VIDEO_REQUEST_TIMEOUT_MS
        })
      : await fetchJson(`${GEMINI_INTERACTIONS_ENDPOINT}/${encodeURIComponent(prior.interaction_id)}`, {
          method: "GET",
          headers: {
            "Api-Revision": GEMINI_API_REVISION,
            "x-goog-api-key": parsedConfig.data.apiKey
          },
          maxRetries: 0,
          timeoutMs: GEMINI_VIDEO_REQUEST_TIMEOUT_MS
        });
  } catch (error) {
    if (prior === undefined) return failureBoundary(error);
    // The stored pass is gone (deleted, or expired at Google): it cannot finish.
    if (error instanceof UpstreamHttpError && error.status === 404) {
      return { kind: "boundary", code: "gemini_video_not_completed", retryable: false };
    }
    // Any other failed poll counts as one attempt and polls again later.
    return pollAgain(parsedConfig.data, prior);
  }

  const parsed = interactionSchema.safeParse(raw);
  const interactionId = parsed.success ? parsed.data.id ?? prior?.interaction_id : undefined;
  if (!parsed.success || interactionId === undefined || !interactionIdSchema.safeParse(interactionId).success) {
    return prior === undefined
      ? { kind: "boundary", code: "gemini_video_invalid_response", retryable: true }
      : pollAgain(parsedConfig.data, prior);
  }
  const interaction = parsed.data;

  if (interaction.status === "in_progress") {
    return prior === undefined
      ? { kind: "progress", checkpoint: { interaction_id: interactionId, poll_attempts: 0 } }
      : pollAgain(parsedConfig.data, prior);
  }
  const current: GeminiVideoCheckpoint = {
    interaction_id: interactionId,
    poll_attempts: prior?.poll_attempts ?? 0
  };
  if (interaction.status !== "completed") {
    // Gemini ended the pass without a report, for example on a video it could
    // not read; another pass would charge the daily limit again.
    return await deleteGeminiVideoInteraction(parsedConfig.data, interactionId)
      ? { kind: "boundary", code: "gemini_video_not_completed", retryable: false }
      : { kind: "progress", checkpoint: current };
  }

  const outcome = parseReport(parsedRequest.mode, modelOutput(interaction.steps));
  if (!await deleteGeminiVideoInteraction(parsedConfig.data, interactionId)) {
    return { kind: "progress", checkpoint: current };
  }
  if (outcome.kind === "boundary") return outcome;
  return {
    kind: "complete",
    interaction_id: interactionId,
    model: interaction.model ?? GEMINI_VIDEO_MODEL,
    usage: usage(interaction.usage),
    report: outcome.report
  };
}

/**
 * Deletes one stored pass without polling it, for a caller that abandons its
 * checkpoint. False when the delete did not succeed, so the caller can keep
 * the checkpoint and try again.
 */
export async function deleteGeminiVideoInteraction(
  config: GeminiVideoConfig,
  interactionId: string
): Promise<boolean> {
  const parsedConfig = configSchema.safeParse(config);
  if (!parsedConfig.success) throw new Error("Invalid Gemini video configuration");
  if (!interactionIdSchema.safeParse(interactionId).success) {
    throw new Error("Invalid Gemini background interaction id");
  }
  try {
    await fetchText(`${GEMINI_INTERACTIONS_ENDPOINT}/${encodeURIComponent(interactionId)}`, {
      method: "DELETE",
      headers: {
        "Api-Revision": GEMINI_API_REVISION,
        "x-goog-api-key": parsedConfig.data.apiKey
      },
      maxRetries: 0,
      timeoutMs: GEMINI_VIDEO_REQUEST_TIMEOUT_MS
    });
    return true;
  } catch (error) {
    // Already gone: an earlier delete succeeded, perhaps with its reply lost.
    return error instanceof UpstreamHttpError && error.status === 404;
  }
}

type ParsedReport =
  | { kind: "report"; report: Extract<GeminiVideoAdvance, { kind: "complete" }>["report"] }
  | Extract<GeminiVideoAdvance, { kind: "boundary" }>;

function parseReport(mode: GeminiVideoRequest["mode"], output: string | undefined): ParsedReport {
  if (output === undefined) return { kind: "boundary", code: "gemini_video_missing_output", retryable: false };
  if (Buffer.byteLength(output, "utf8") > MAX_REPORT_BYTES) {
    return { kind: "boundary", code: "gemini_video_invalid_report", retryable: false, report_issues: ["(size)"] };
  }
  let value: unknown;
  try {
    value = JSON.parse(output.trim());
  } catch {
    return { kind: "boundary", code: "gemini_video_invalid_report", retryable: false, report_issues: ["(json)"] };
  }
  const result = mode === "claims"
    ? geminiVideoClaimsReportSchema.safeParse(value)
    : geminiVideoMomentReportSchema.safeParse(value);
  if (!result.success) {
    return {
      kind: "boundary",
      code: "gemini_video_invalid_report",
      retryable: false,
      report_issues: [...new Set(result.error.issues.map(({ path }) =>
        path.map((part) => typeof part === "number" ? "[]" : String(part)).join(".") || "(root)"
      ))].slice(0, 12)
    };
  }
  return {
    kind: "report",
    report: mode === "claims"
      ? { mode, claims: result.data as GeminiVideoClaimsReport }
      : { mode, moment: result.data as GeminiVideoMomentReport }
  };
}

function modelOutput(steps: ReadonlyArray<{ type: string } & Record<string, unknown>>): string | undefined {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]!;
    if (step.type !== "model_output") continue;
    if (typeof step.text === "string" && step.text.trim().length > 0) return step.text;
    if (!Array.isArray(step.content)) continue;
    const text = step.content
      .map((item) => {
        if (typeof item !== "object" || item === null) return "";
        const record = item as Record<string, unknown>;
        return record.type === "text" && typeof record.text === "string" ? record.text : "";
      })
      .join("");
    if (text.trim().length > 0) return text;
  }
  return undefined;
}

function usage(value: z.output<typeof interactionSchema>["usage"]): GeminiVideoUsage {
  return {
    ...(value?.total_input_tokens === undefined ? {} : { total_input_tokens: value.total_input_tokens }),
    ...(value?.total_output_tokens === undefined ? {} : { total_output_tokens: value.total_output_tokens }),
    ...(value?.total_thought_tokens === undefined ? {} : { total_thought_tokens: value.total_thought_tokens })
  };
}

/**
 * One more poll attempt. Once the attempts run out, the stored pass is
 * deleted and the pass ends; until that delete succeeds, the checkpoint is
 * handed back so a later call can try it again.
 */
async function pollAgain(
  config: GeminiVideoConfig,
  prior: GeminiVideoCheckpoint
): Promise<GeminiVideoAdvance> {
  const next = { ...prior, poll_attempts: Math.min(GEMINI_VIDEO_MAX_POLLS, prior.poll_attempts + 1) };
  if (next.poll_attempts < GEMINI_VIDEO_MAX_POLLS) return { kind: "progress", checkpoint: next };
  return await deleteGeminiVideoInteraction(config, prior.interaction_id)
    ? { kind: "boundary", code: "gemini_video_timed_out", retryable: true }
    : { kind: "progress", checkpoint: next };
}

function failureBoundary(error: unknown): Extract<GeminiVideoAdvance, { kind: "boundary" }> {
  const status = error instanceof UpstreamHttpError ? error.status : undefined;
  // 402: the key's prepaid credits are used up, a billing state rather than anything about the video.
  if (status === 402) return { kind: "boundary", code: "gemini_video_credits_depleted", retryable: false };
  if (status === 429) return { kind: "boundary", code: "gemini_video_rate_limited", retryable: true };
  if (status === 401 || status === 403) return { kind: "boundary", code: "gemini_video_inaccessible", retryable: false };
  // Gemini refuses a request it cannot serve, such as a video it cannot read.
  if (status !== undefined && status >= 400 && status < 500) {
    return { kind: "boundary", code: "gemini_video_request_rejected", retryable: false };
  }
  if (status !== undefined) return { kind: "boundary", code: "gemini_video_upstream_unavailable", retryable: true };
  return { kind: "boundary", code: "gemini_video_request_failed", retryable: true };
}
