import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed research receipts for the MCP route.
 *
 * A tool that finishes a unit of research work (a community survey, a terminal
 * per-video comment audit, a validated full-text method audit, or a failed
 * full-text acquisition that leaves only a lead) returns one short token. The
 * finalize_research gate verifies the tokens, so completion is checked by the
 * server instead of taken from the model's own report. Tokens are stateless:
 * they survive restarts and need no session store.
 *
 * Format: rr1~<kind>~<key=value,...>~<issued unix seconds>~<mac>. Values are
 * percent-encoded, keys are sorted, and the MAC is the first 128 bits of
 * HMAC-SHA256 over everything before the last separator, keyed by a
 * domain-separated key derived from the signing secret. The claims stay
 * readable because models copy readable text more reliably than base64.
 */

export const RESEARCH_RECEIPT_KINDS = [
  "youtube_survey",
  "youtube_video_audit",
  "youtube_community_audit",
  "full_text_lead",
  "study_audit",
  "review_audit",
  "finalization"
] as const;
export type ResearchReceiptKind = typeof RESEARCH_RECEIPT_KINDS[number];

export type ResearchReceiptClaimValue = string | number | boolean | readonly string[];
export type ResearchReceiptClaims = Readonly<Record<string, ResearchReceiptClaimValue | undefined>>;

export type ResearchReceiptRejection =
  | "malformed"
  | "unknown_kind"
  | "signature_invalid"
  | "expired";

export type ResearchReceiptVerification =
  | {
      ok: true;
      kind: ResearchReceiptKind;
      issued_at: string;
      claims: Record<string, string | string[]>;
    }
  | { ok: false; reason: ResearchReceiptRejection };

export interface ResearchReceiptOptions {
  secret: string;
  now?: () => Date;
}

export interface VerifyResearchReceiptOptions extends ResearchReceiptOptions {
  maxAgeMs?: number;
}

export const RESEARCH_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RESEARCH_RECEIPT_MAX_CHARACTERS = 2_048;

const PREFIX = "rr1";
const SEPARATOR = "~";
const KEY_DOMAIN = "askrigor:research-receipt:v1";
const MIN_SECRET_BYTES = 32;
const MAC_BYTES = 16;
const CLOCK_SKEW_SECONDS = 300;
const CLAIM_KEY = /^[a-z][a-z0-9_]{0,31}$/u;
const KINDS: ReadonlySet<string> = new Set(RESEARCH_RECEIPT_KINDS);

/**
 * The finalization signing secret when configured, otherwise the YouTube
 * continuation secret every audit-capable deployment already has (the same
 * fallback the controlled research route uses for its permits). Undefined
 * means receipts are off and finalize_research reports that it cannot verify.
 */
export function researchReceiptSecretFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  for (const name of [
    "ASKRIGOR_FINALIZATION_SIGNING_SECRET",
    "ASKRIGOR_YOUTUBE_CONTINUATION_SECRET"
  ]) {
    const value = env[name]?.trim();
    if (value !== undefined && Buffer.byteLength(value, "utf8") >= MIN_SECRET_BYTES) {
      return value;
    }
  }
  return undefined;
}

export function issueResearchReceipt(
  kind: ResearchReceiptKind,
  claims: ResearchReceiptClaims,
  options: ResearchReceiptOptions
): string {
  assertSecret(options.secret);
  const issuedSeconds = Math.floor((options.now ?? (() => new Date()))().getTime() / 1000);
  const encodedClaims = Object.keys(claims)
    .filter((key) => claims[key] !== undefined)
    .sort()
    .map((key) => {
      if (!CLAIM_KEY.test(key)) throw new Error(`Invalid research receipt claim key: ${key}`);
      return `${key}=${encodeClaimValue(claims[key]!)}`;
    })
    .join(",");
  const body = [PREFIX, kind, encodedClaims, String(issuedSeconds)].join(SEPARATOR);
  const token = `${body}${SEPARATOR}${mac(options.secret, body)}`;
  if (token.length > RESEARCH_RECEIPT_MAX_CHARACTERS) {
    throw new Error("Research receipt exceeds its size limit");
  }
  return token;
}

export function verifyResearchReceipt(
  token: string,
  options: VerifyResearchReceiptOptions
): ResearchReceiptVerification {
  assertSecret(options.secret);
  if (typeof token !== "string" || token.length > RESEARCH_RECEIPT_MAX_CHARACTERS) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.trim().split(SEPARATOR);
  if (parts.length !== 5 || parts[0] !== PREFIX) return { ok: false, reason: "malformed" };
  const [, kind, encodedClaims, issued, signature] = parts as [string, string, string, string, string];
  if (!/^[0-9]{1,12}$/u.test(issued)) return { ok: false, reason: "malformed" };
  const expected = Buffer.from(mac(options.secret, parts.slice(0, 4).join(SEPARATOR)), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: "signature_invalid" };
  }
  if (!KINDS.has(kind)) return { ok: false, reason: "unknown_kind" };
  const issuedMs = Number(issued) * 1000;
  const nowMs = (options.now ?? (() => new Date()))().getTime();
  const maxAgeMs = options.maxAgeMs ?? RESEARCH_RECEIPT_MAX_AGE_MS;
  if (issuedMs > nowMs + CLOCK_SKEW_SECONDS * 1000 || nowMs - issuedMs > maxAgeMs) {
    return { ok: false, reason: "expired" };
  }
  const claims: Record<string, string | string[]> = {};
  if (encodedClaims.length > 0) {
    for (const pair of encodedClaims.split(",")) {
      const equals = pair.indexOf("=");
      if (equals < 1) return { ok: false, reason: "malformed" };
      const key = pair.slice(0, equals);
      const value = pair.slice(equals + 1);
      try {
        claims[key] = decodeClaimValue(value);
      } catch {
        return { ok: false, reason: "malformed" };
      }
    }
  }
  return {
    ok: true,
    kind: kind as ResearchReceiptKind,
    issued_at: new Date(issuedMs).toISOString(),
    claims
  };
}

function encodeClaimValue(value: ResearchReceiptClaimValue): string {
  if (Array.isArray(value)) {
    // "+" joins list items (encodeURIComponent escapes a literal "+"). An empty
    // list is "+" and a one-item list keeps a trailing "+", so both still
    // decode as lists.
    const items = (value as readonly string[]).map(encodeText);
    return items.length === 0 ? "+" : items.length === 1 ? `${items[0]}+` : items.join("+");
  }
  return encodeText(String(value));
}

function decodeClaimValue(value: string): string | string[] {
  if (!value.includes("+")) return decodeURIComponent(value);
  if (value === "+") return [];
  const items = value.endsWith("+") ? value.slice(0, -1).split("+") : value.split("+");
  return items.map((item) => decodeURIComponent(item));
}

function encodeText(value: string): string {
  return encodeURIComponent(value).replace(/~/gu, "%7E");
}

function mac(secret: string, body: string): string {
  const key = createHmac("sha256", secret).update(KEY_DOMAIN).digest();
  return createHmac("sha256", key).update(body).digest().subarray(0, MAC_BYTES).toString("base64url");
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("Research receipt signing secret must contain at least 32 UTF-8 bytes");
  }
}
