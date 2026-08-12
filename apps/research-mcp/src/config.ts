export const SERVICE_NAME = "askrigor-research";
export const SERVICE_VERSION = "0.1.0";
export const DEFAULT_PORT = 3000;
export const MAX_MCP_REQUEST_BYTES = 1_048_576;
export const PUBLIC_MCP_CONCURRENCY_LIMIT = 16;

export const PUBLIC_RATE_LIMIT = {
  capacity: 60,
  refillTokensPerMinute: 60,
  maxKeys: 10_000,
  idleTtlMs: 5 * 60_000
} as const;

export const PUBLIC_TOOL_LIMITS = {
  pubmedPageSize: 100,
  europePmcPageSize: 100,
  clinicalTrialsPageSize: 100,
  youtubeSearchPageSize: 50,
  maximumPaginationPageSize: 100,
  youtubeCommentProviderRequestAttempts: 1_000,
  youtubeCommentThreadPages: 500,
  youtubeReplyPages: 750,
  youtubeThreads: 50_000,
  youtubeComments: 100_000,
  youtubeNormalizedOutputBytes: 64 * 1_024 * 1_024,
  youtubeTextBytes: 48 * 1_024 * 1_024,
  youtubeElapsedMs: 120_000,
  youtubeCommunityAuditElapsedMs: 15_000
} as const;

export function publicServerIsEnabled(
  value = process.env.ASKRIGOR_PUBLIC_SERVER_ENABLED
): boolean {
  return value === "true";
}

export function parseTrustedClientIpHeader(
  value = process.env.ASKRIGOR_TRUSTED_CLIENT_IP_HEADER
): "cf-connecting-ip" | undefined {
  return value === "cf-connecting-ip" ? value : undefined;
}

export const SERVER_INSTRUCTIONS =
  "Before final synthesis, if firsthand community evidence could plausibly matter, call audit_youtube_community. Finding an excellent RCT does not remove this requirement. The audit retrieves unfiltered YouTube comments and replies. search_youtube_comments is query-bounded discovery only and never satisfies corpus acquisition. Preserve identifiers, provenance, pagination, access status, and blocking receipts. Never treat access failure as negative evidence. Read-only research retrieval.";

export const HEALTH_PAYLOAD = {
  status: "ok",
  service: SERVICE_NAME,
  version: SERVICE_VERSION
} as const;
