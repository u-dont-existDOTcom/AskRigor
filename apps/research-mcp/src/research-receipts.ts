import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed research receipts for the MCP route.
 *
 * A tool that finishes a unit of research work (a completed community survey,
 * search or scout, even one that found nothing, a terminal per-video comment
 * audit, a PubMed record, a DOI's registered landing page,
 * an exhausted full-text reading, a validated full-text method audit, a failed full-text acquisition that
 * leaves only a lead,
 * a recorded full-text service failure after public-copy search,
 * a treatment-coverage check, or Gemini's reading of a
 * video the person gave, read or not) returns one short token, and so does
 * manage_research_access for a plain answer registered before research (the
 * digests of its claims, its text and its research target, a binding to the
 * account, and its issue order; owner answer 140b), and
 * submit_research_contribution for a research map it filed (a binding to the
 * account and its issue order; owner answer 143a). The
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
  "atlas_lookup",
  "youtube_survey",
  "youtube_search",
  "youtube_scout",
  "youtube_video_metadata",
  "youtube_video_audit",
  "youtube_community_audit",
  "youtube_video_claims",
  // AskRigor#359: a video extract_youtube_video_claims identified but did not read, with its refusal's code. Never a
  // read video: youtube_video_claims alone says that.
  "youtube_video_unread",
  // A video extract_youtube_video_claims was still reading when it returned. Unless a later receipt shows it read or
  // not, the answer did not get its reading, so the final check counts it as unread.
  "youtube_video_pending",
  "pubmed_record",
  "doi_resolution",
  "literature_search",
  "full_text_lead",
  "full_text_route_failure",
  "full_text_read",
  "study_audit",
  "review_audit",
  "treatment_coverage",
  "finalization",
  "plain_answer",
  "research_map"
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

/**
 * Short digest of a discovery round's search terms. finalize_research compares
 * digests to tell whether two rounds searched from different angles; the terms
 * themselves never enter the receipt.
 */
export function discoveryQueryDigest(queries: readonly string[]): string {
  const normalized = [...new Set(queries.map((query) =>
    query.trim().toLowerCase().replace(/\s+/gu, " ")
  ))].sort();
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 12);
}

/**
 * Page tokens that encode to more characters are not signed, and a page left
 * with one stays unread; a survey's twelve pages then still fit its receipt.
 */
const PAGE_TOKEN_MAX_CHARACTERS = 64;
const UNSIGNED_PAGE = "!";

/**
 * A results page as discovery receipts sign it: the 12-hex digest of its query
 * (the caller's own terms), then YouTube's opaque page token, which encodes
 * only an offset and so needs the query. A search signs the page it read
 * (`pg`) and any next page it left (`nx`), so a later page settles the one
 * before it. The query never enters the receipt, and a token too long to sign
 * becomes `!`, which no read page settles.
 */
export function pageKey(query: string, token: string): string {
  const signed = encodeText(token).length <= PAGE_TOKEN_MAX_CHARACTERS;
  return `${discoveryQueryDigest([query])}.${signed ? token : UNSIGNED_PAGE}`;
}

/**
 * Result pages a discovery round left unread: the next pages it signed (`nx`)
 * that no round passed with it read (`pg`). Receipts without `nx` (scouts, and
 * receipts from before it) report their `open` count.
 */
export function roundUnreadPages(
  claims: Readonly<Record<string, string | string[] | undefined>>,
  continued: ReadonlySet<string>
): number {
  const next = claims.nx;
  if (next === undefined) return Number(typeof claims.open === "string" ? claims.open : "0") || 0;
  return (Array.isArray(next) ? next : [next]).filter((digest) => digest !== "" && !continued.has(digest)).length;
}

/** The pages the given rounds read (`pg`), for roundUnreadPages. */
export function readPages(
  rounds: ReadonlyArray<{ claims: Readonly<Record<string, string | string[] | undefined>> }>
): Set<string> {
  return new Set(rounds.flatMap(({ claims }) =>
    claims.pg === undefined ? [] : Array.isArray(claims.pg) ? claims.pg : [claims.pg]
  ).filter((page) => page !== "" && !page.endsWith(`.${UNSIGNED_PAGE}`)));
}

/**
 * Short digest of the research target. Discovery and treatment-coverage
 * receipts sign it, so finalize_research counts only the research done for
 * the question it finalizes. Case and spacing are ignored.
 */
export function researchTargetDigest(target: string): string {
  return discoveryQueryDigest([target]);
}

/**
 * Signed issue order in milliseconds: the receipt's `t` claim, which strictly
 * increases within one server process, or its whole-second issue time when it
 * has none. Equal values are ties that the caller's order never breaks.
 */
export function receiptIssueOrder(receipt: {
  claims: Readonly<Record<string, string | string[]>>;
  issued_at: string;
}): number {
  const sequence = receipt.claims.t;
  return typeof sequence === "string" && /^\d{1,16}$/u.test(sequence)
    ? Number(sequence)
    : Date.parse(receipt.issued_at);
}

/**
 * What binds a plain-answer receipt to the account that registered it (owner answer 140b): 16 hex characters of an
 * HMAC, under the receipt secret, of the pseudonymous account key, so the receipt names no account and another
 * account's plain answer does not count as this one's.
 */
export function plainAnswerAccountBinding(secret: string, accountKey: string): string {
  return createHmac("sha256", secret).update("askrigor:plain-answer-account:v1\0", "utf8")
    .update(accountKey, "utf8").digest("hex").slice(0, 16);
}

/**
 * What binds this research's map to the account (owner answer 143a): 16 hex characters of an HMAC, under the receipt
 * secret, of the pseudonymous account key. A research_map receipt signs it, so a map another account filed does not
 * count as this research's; and a finalization receipt whose offer included the map signs it, so only this account
 * can file a map on the yes to that offer. Neither names the account.
 */
export function researchMapAccountBinding(secret: string, accountKey: string): string {
  return createHmac("sha256", secret).update("askrigor:research-map-account:v1\0", "utf8")
    .update(accountKey, "utf8").digest("hex").slice(0, 16);
}

export const RESEARCH_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Atlas lookups carry bounded normalized words and public finding/source fingerprints, in any script.
export const RESEARCH_RECEIPT_MAX_CHARACTERS = 32_768;
const ORDINARY_RECEIPT_MAX_CHARACTERS = 2_048;
const receiptLimit = (kind: string) => kind === "atlas_lookup" || kind === "finalization" || kind === "literature_search"
  ? RESEARCH_RECEIPT_MAX_CHARACTERS : ORDINARY_RECEIPT_MAX_CHARACTERS;

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
  if (token.length > receiptLimit(kind)) {
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
  if (token.length > receiptLimit(parts[1] ?? "") || parts.length !== 5 || parts[0] !== PREFIX) return { ok: false, reason: "malformed" };
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
