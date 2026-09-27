import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import {
  GEMINI_YOUTUBE_SCOUT_MAX_LEAD_CHARACTERS,
  GEMINI_YOUTUBE_SCOUT_MAX_REDISCOVERY_LEADS,
  geminiYoutubeScoutBackgroundCheckpointSchema,
  type GeminiYoutubeScoutBackgroundCheckpoint
} from "@askrigor/sources";
import { z } from "zod";

/**
 * Signed continuation for the MCP Gemini scout.
 *
 * A grounded scout often takes longer than MCP clients wait for one tool call
 * (Claude clients stop at 60 seconds), so the MCP tool runs the scout as a
 * background Interaction and hands the model a token to call again. The token
 * carries the de-identified target and any rediscovery leads, the provider
 * checkpoint (opaque identity, public search receipts and counters) and the
 * budget already charged, so a later call resumes without reserving or charging
 * again. It is signed under a domain-separated key and expires; a tampered or
 * stale token is rejected.
 */

const DOMAIN = "askrigor:gemini-scout-continuation:v1";
const MAX_TOKEN_CHARACTERS = 12_000;
export const SCOUT_CONTINUATION_TTL_MS = 30 * 60 * 1000;

const continuationStateSchema = z.object({
  research_target: z.string().trim().min(1).max(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  rediscovery_leads: z.array(z.string().min(1).max(GEMINI_YOUTUBE_SCOUT_MAX_LEAD_CHARACTERS))
    .min(1).max(GEMINI_YOUTUBE_SCOUT_MAX_REDISCOVERY_LEADS).optional(),
  checkpoint: geminiYoutubeScoutBackgroundCheckpointSchema,
  accounted_nano_usd: z.number().int().nonnegative(),
  expires_at_ms: z.number().int().positive()
}).strict();

export interface ScoutContinuationState {
  research_target: string;
  diagnosis_status: "diagnosis_not_specified" | "user_supplied_diagnosis";
  rediscovery_leads?: string[];
  checkpoint: GeminiYoutubeScoutBackgroundCheckpoint;
  accounted_nano_usd: number;
  expires_at_ms: number;
}

export class ScoutContinuationError extends Error {
  constructor(readonly code: "gemini_scout_continuation_invalid" | "gemini_scout_continuation_expired") {
    super(code);
  }
}

export function encodeScoutContinuation(state: ScoutContinuationState, secret: string): string {
  const payload = deflateRawSync(
    Buffer.from(JSON.stringify(continuationStateSchema.parse(state)), "utf8"),
    { level: 9 }
  ).toString("base64url");
  const token = `${payload}.${sign(payload, secret)}`;
  if (token.length > MAX_TOKEN_CHARACTERS) throw new Error("Gemini scout continuation token is too large");
  return token;
}

export function decodeScoutContinuation(token: string, secret: string, nowMs: number): ScoutContinuationState {
  const parts = token.split(".");
  if (token.length > MAX_TOKEN_CHARACTERS || parts.length !== 2) {
    throw new ScoutContinuationError("gemini_scout_continuation_invalid");
  }
  const [payload, signature] = parts as [string, string];
  const expected = Buffer.from(sign(payload, secret), "base64url");
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ScoutContinuationError("gemini_scout_continuation_invalid");
  }
  let state: ScoutContinuationState;
  try {
    state = continuationStateSchema.parse(
      JSON.parse(inflateRawSync(Buffer.from(payload, "base64url")).toString("utf8"))
    );
  } catch {
    throw new ScoutContinuationError("gemini_scout_continuation_invalid");
  }
  if (nowMs >= state.expires_at_ms) throw new ScoutContinuationError("gemini_scout_continuation_expired");
  return state;
}

function sign(payload: string, secret: string): string {
  const key = createHmac("sha256", secret).update(DOMAIN).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}
