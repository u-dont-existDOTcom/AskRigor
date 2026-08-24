export const SERVICE_NAME = "askrigor-research";
export const GEMINI_COMPATIBLE_SERVICE_NAME = "askrigor_research";
export const SERVICE_VERSION = "0.1.0";
export const DEFAULT_PORT = 3000;
export const MAX_MCP_REQUEST_BYTES = 1_048_576;
export const GEMINI_COMPATIBLE_MCP_PATH = "/mcp/gemini";
export const ACTION_REQUEST_MAX_BYTES = 8_192;
export const RESEARCH_ACTION_RESPONSE_MAX_BYTES = 60_000;
export const PROTOCOL_ACTION_TEXT_MAX_BYTES = 48_000;
export const PUBLIC_MCP_CONCURRENCY_LIMIT = 16;
export const PUBLIC_MCP_BROWSER_ORIGINS = [
  "https://gemini.google.com"
] as const;
export const RESEARCH_SESSION_IDLE_TTL_MS = 72 * 60 * 60 * 1_000;
export const RESEARCH_SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const RETRACTION_WATCH_MAX_AGE_MS = 72 * 60 * 60 * 1_000;

export interface ResearchSessionCheckpointConfig {
  rootDirectory: string;
  encryptionKey: Uint8Array;
  keyId: string;
}

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
  youtubeCommunityAuditElapsedMs: 15_000,
  youtubeVideoAuditElapsedMs: 15_000,
  youtubeVideoAuditProviderRequests: 50
} as const;

export function publicServerIsEnabled(
  value = process.env.ASKRIGOR_PUBLIC_SERVER_ENABLED
): boolean {
  return value === "true";
}

export function actionsAreEnabled(
  value = process.env.ASKRIGOR_ACTIONS_ENABLED
): boolean {
  return value === "true";
}

export function researchActionsAreEnabled(
  value = process.env.ASKRIGOR_RESEARCH_ACTIONS_ENABLED
): boolean {
  return value === "true";
}

export function mcpHandshakeDiagnosticsAreEnabled(
  value = process.env.ASKRIGOR_MCP_HANDSHAKE_DIAGNOSTICS
): boolean {
  return value === "true";
}

export function actionApiKeyFromEnv(
  value = process.env.ASKRIGOR_ACTIONS_API_KEY
): string | undefined {
  return value;
}

export function externalEvidenceReceiptSecretFromEnv(
  value = process.env.ASKRIGOR_EXTERNAL_EVIDENCE_RECEIPT_SECRET
): string | undefined {
  return value;
}

export function externalEvidenceReceiptKeyIdFromEnv(
  value = process.env.ASKRIGOR_EXTERNAL_EVIDENCE_RECEIPT_KEY_ID
): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

export function researchSessionCheckpointConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResearchSessionCheckpointConfig | undefined {
  const rootDirectory = env.ASKRIGOR_RESEARCH_SESSION_DIRECTORY?.trim();
  const encodedKey = env.ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_BASE64URL?.trim();
  const keyId = env.ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_ID?.trim();
  if (rootDirectory === undefined && encodedKey === undefined && keyId === undefined) {
    return undefined;
  }
  if (
    rootDirectory === undefined || !rootDirectory.startsWith("/") || rootDirectory === "/" ||
    encodedKey === undefined || keyId === undefined ||
    !/^[A-Za-z0-9._-]{1,100}$/u.test(keyId)
  ) {
    throw new Error("Research session checkpoint configuration unavailable");
  }
  const encryptionKey = Buffer.from(encodedKey, "base64url");
  if (
    encryptionKey.byteLength !== 32 ||
    encryptionKey.toString("base64url") !== encodedKey
  ) {
    throw new Error("Research session checkpoint configuration unavailable");
  }
  return {
    rootDirectory,
    encryptionKey: Uint8Array.from(encryptionKey),
    keyId,
  };
}

export function retractionWatchSnapshotRootFromEnv(
  value = process.env.ASKRIGOR_RETRACTION_WATCH_DIRECTORY,
): string | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) return undefined;
  if (!normalized.startsWith("/") || normalized === "/") {
    throw new Error("Retraction Watch snapshot configuration unavailable");
  }
  return normalized;
}

export function parseTrustedClientIpHeader(
  value = process.env.ASKRIGOR_TRUSTED_CLIENT_IP_HEADER
): "cf-connecting-ip" | undefined {
  return value === "cf-connecting-ip" ? value : undefined;
}

export const SERVER_INSTRUCTIONS =
  "Before final synthesis, if firsthand community evidence could plausibly matter, call survey_youtube_community, then audit_youtube_video_community for each material video. Finding an excellent RCT does not remove this requirement. Automatically continue while continuation_recommended is true and widen while expected information gain is positive. Retrieve unfiltered YouTube comments and replies; search_youtube_comments is query-bounded discovery only and never satisfies corpus acquisition. Preserve provenance and blocking receipts. Read-only retrieval.";

export const HEALTH_PAYLOAD = {
  status: "ok",
  service: SERVICE_NAME,
  version: SERVICE_VERSION
} as const;
