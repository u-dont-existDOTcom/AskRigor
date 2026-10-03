import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import { geminiVideoCheckpointSchema, geminiVideoRequestSchema } from "@askrigor/sources";
import { z } from "zod";

/**
 * Signed continuation for extract_youtube_video_claims.
 *
 * Gemini can take longer to read a video than MCP clients wait for one tool
 * call (Claude clients stop at 60 seconds), so a pass runs as a background
 * Interaction and the model gets a token to call again with. The token
 * carries the pass (video and any moment), the public video details already
 * looked up, the provider checkpoint (opaque identity and poll count) and the
 * seconds charged to the daily limit, so a later call polls the same pass
 * without looking the video up or charging again. It is signed under a
 * domain-separated key and expires; a tampered or stale token is rejected.
 */

const DOMAIN = "askrigor:gemini-video-continuation:v1";
const MAX_TOKEN_CHARACTERS = 4_000;
export const VIDEO_CONTINUATION_TTL_MS = 30 * 60 * 1000;

const continuationStateSchema = z.object({
  request: geminiVideoRequestSchema,
  video: z.object({
    title: z.string().max(300),
    channel: z.string().max(200),
    duration_seconds: z.number().int().positive()
  }).strict(),
  checkpoint: geminiVideoCheckpointSchema,
  charged_seconds: z.number().int().positive(),
  expires_at_ms: z.number().int().positive()
}).strict();

export type VideoContinuationState = z.output<typeof continuationStateSchema>;

export class VideoContinuationError extends Error {
  constructor(
    readonly code: "gemini_video_continuation_invalid" | "gemini_video_continuation_expired",
    // Only for an expired token whose signature verified: its checkpoint still
    // names the stored pass to delete.
    readonly expiredState?: VideoContinuationState
  ) {
    super(code);
  }
}

export function encodeVideoContinuation(state: VideoContinuationState, secret: string): string {
  const payload = deflateRawSync(
    Buffer.from(JSON.stringify(continuationStateSchema.parse(state)), "utf8"),
    { level: 9 }
  ).toString("base64url");
  const token = `${payload}.${sign(payload, secret)}`;
  if (token.length > MAX_TOKEN_CHARACTERS) throw new Error("Gemini video continuation token is too large");
  return token;
}

export function decodeVideoContinuation(token: string, secret: string, nowMs: number): VideoContinuationState {
  const parts = token.split(".");
  if (token.length > MAX_TOKEN_CHARACTERS || parts.length !== 2) {
    throw new VideoContinuationError("gemini_video_continuation_invalid");
  }
  const [payload, signature] = parts as [string, string];
  const expected = Buffer.from(sign(payload, secret), "base64url");
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new VideoContinuationError("gemini_video_continuation_invalid");
  }
  let state: VideoContinuationState;
  try {
    state = continuationStateSchema.parse(
      JSON.parse(inflateRawSync(Buffer.from(payload, "base64url")).toString("utf8"))
    );
  } catch {
    throw new VideoContinuationError("gemini_video_continuation_invalid");
  }
  if (nowMs >= state.expires_at_ms) throw new VideoContinuationError("gemini_video_continuation_expired", state);
  return state;
}

function sign(payload: string, secret: string): string {
  const key = createHmac("sha256", secret).update(DOMAIN).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}
