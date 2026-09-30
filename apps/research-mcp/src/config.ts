export const SERVICE_NAME = "askrigor-research";
export const GEMINI_COMPATIBLE_SERVICE_NAME = "askrigor_research";
export const SERVICE_VERSION = "0.1.0";
export const DEFAULT_PORT = 3000;
export const MAX_MCP_REQUEST_BYTES = 1_048_576;
export const GEMINI_COMPATIBLE_MCP_PATH = "/mcp/gemini";
// Claude custom-connector surface. Off unless its OAuth client is configured;
// requires a valid bearer on every request so Claude runs its OAuth flow.
export const CLAUDE_MCP_PATH = "/mcp/claude";
export const ACTION_REQUEST_MAX_BYTES = 8_192;
export const RESEARCH_ACTION_RESPONSE_MAX_BYTES = 60_000;
export const PRIVATE_ORCHESTRATION_REQUEST_MAX_BYTES = 256 * 1_024;
export const PRIVATE_ORCHESTRATION_RESPONSE_MAX_BYTES = 512 * 1_024;
export const PROTOCOL_ACTION_TEXT_MAX_BYTES = 48_000;
export const PUBLIC_MCP_CONCURRENCY_LIMIT = 16;
export const PUBLIC_MCP_BROWSER_ORIGINS = [
  "https://gemini.google.com"
] as const;
export const RESEARCH_SESSION_IDLE_TTL_MS = 72 * 60 * 60 * 1_000;
export const RESEARCH_SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const RETRACTION_WATCH_MAX_AGE_MS = 72 * 60 * 60 * 1_000;
export const LIVING_EVIDENCE_REUSE_TIMEOUT_MS = 1_500;

export interface ResearchSessionCheckpointConfig {
  rootDirectory: string;
  encryptionKey: Uint8Array;
  keyId: string;
}

export interface ResearchFinalizationSigningConfig {
  signingSecret: string;
  keyId: string;
}

export interface LivingEvidenceReuseConfig {
  connectionString: string;
  schema: string;
  ssl: false | { rejectUnauthorized: false };
  connectionTimeoutMillis: number;
  queryTimeoutMillis: number;
  statementTimeoutMillis: number;
}

export interface ResearchContributorAccessConfig {
  connectionString: string;
  schema: string;
  ssl: false | { rejectUnauthorized: false };
  identitySecret: Uint8Array;
}

export interface ResearchContributionReviewConfig {
  connectionString: string;
  schema: string;
  ssl: false | { rejectUnauthorized: false };
}

export const PUBLIC_RATE_LIMIT = {
  capacity: 60,
  refillTokensPerMinute: 60,
  maxKeys: 10_000,
  idleTtlMs: 5 * 60_000
} as const;

export const PRIVATE_ORCHESTRATION_RATE_LIMIT = {
  capacity: 30,
  refillTokensPerMinute: 30,
  maxKeys: 1_000,
  idleTtlMs: 5 * 60_000
} as const;

export const PRIVATE_ORCHESTRATION_CONCURRENCY_LIMIT = 4;

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
  youtubeVideoAuditProviderRequests: 50,
  // MCP calls read longer: every top-level comment costs at least one reply
  // request, so 50 requests covered only about 50 comments per call, and each
  // extra call costs the model a turn. 40 seconds stays well inside the 60
  // seconds Claude waits for a tool call. Only a few calls at once read this
  // long, so they cannot fill the shared public pool or multiply upstream
  // requests; the rest use the Action's budget.
  mcpYoutubeVideoAuditElapsedMs: 40_000,
  mcpYoutubeVideoAuditProviderRequests: 300,
  mcpLongYoutubeVideoAuditSlots: 2
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

export function privateResearchOrchestrationIsEnabled(
  value = process.env.ASKRIGOR_PRIVATE_ORCHESTRATION_ENABLED
): boolean {
  return value === "true";
}

export function livingEvidenceReuseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LivingEvidenceReuseConfig | undefined {
  if (env.ASKRIGOR_LIVING_EVIDENCE_REUSE_ENABLED !== "true") return undefined;
  const connectionString = env.ASKRIGOR_LIVING_EVIDENCE_READER_DATABASE_URL?.trim();
  const schema = env.ASKRIGOR_LIVING_EVIDENCE_SCHEMA?.trim() || "living_evidence";
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error("Living-evidence read-only repository configuration unavailable");
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Living-evidence read-only repository configuration unavailable");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(schema)
  ) {
    throw new Error("Living-evidence read-only repository configuration unavailable");
  }
  const sslMode = env.ASKRIGOR_LIVING_EVIDENCE_READER_SSLMODE?.trim() || "disable";
  if (sslMode !== "disable" && sslMode !== "require") {
    throw new Error("Living-evidence read-only repository configuration unavailable");
  }
  return {
    connectionString,
    schema,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: LIVING_EVIDENCE_REUSE_TIMEOUT_MS,
    queryTimeoutMillis: LIVING_EVIDENCE_REUSE_TIMEOUT_MS,
    statementTimeoutMillis: LIVING_EVIDENCE_REUSE_TIMEOUT_MS,
  };
}

export function optionalLivingEvidenceReuseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LivingEvidenceReuseConfig | undefined {
  try {
    return livingEvidenceReuseConfigFromEnv(env);
  } catch {
    return undefined;
  }
}

export function researchContributorAccessConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResearchContributorAccessConfig | undefined {
  if (env.ASKRIGOR_RESEARCH_ACCESS_ENABLED !== "true") return undefined;
  const connectionString = env.ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL?.trim();
  const schema = env.ASKRIGOR_RESEARCH_ACCESS_DATABASE_SCHEMA?.trim() ||
    "living_evidence";
  const encodedSecret =
    env.ASKRIGOR_RESEARCH_IDENTITY_SECRET_BASE64URL?.trim();
  if (
    connectionString === undefined ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(schema) ||
    encodedSecret === undefined
  ) {
    throw new Error("Research contributor access configuration unavailable");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("Research contributor access configuration unavailable");
  }
  const identitySecret = Buffer.from(encodedSecret, "base64url");
  const sslMode = env.ASKRIGOR_RESEARCH_ACCESS_DATABASE_SSLMODE?.trim() ||
    "disable";
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    identitySecret.byteLength < 32 ||
    identitySecret.toString("base64url") !== encodedSecret ||
    !["disable", "require"].includes(sslMode)
  ) {
    throw new Error("Research contributor access configuration unavailable");
  }
  return {
    connectionString,
    schema,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : false,
    identitySecret: Uint8Array.from(identitySecret),
  };
}

export function researchContributionReviewConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResearchContributionReviewConfig | undefined {
  if (env.ASKRIGOR_RESEARCH_REVIEW_ENABLED !== "true") return undefined;
  const connectionString = env.ASKRIGOR_RESEARCH_REVIEW_DATABASE_URL?.trim();
  const schema = env.ASKRIGOR_RESEARCH_REVIEW_DATABASE_SCHEMA?.trim() ||
    "living_evidence";
  const sslMode = env.ASKRIGOR_RESEARCH_REVIEW_DATABASE_SSLMODE?.trim() ||
    "disable";
  if (
    connectionString === undefined || connectionString.length === 0 ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(schema) ||
    !["disable", "require"].includes(sslMode)
  ) {
    throw new Error("Research contribution review configuration unavailable");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("Research contribution review configuration unavailable");
  }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("Research contribution review configuration unavailable");
  }
  return {
    connectionString,
    schema,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : false,
  };
}

export function privateResearchOrchestrationApiKeyFromEnv(
  value = process.env.ASKRIGOR_PRIVATE_ORCHESTRATION_API_KEY
): string | undefined {
  return value;
}

export function validatePrivateResearchOrchestrationApiKey(
  value: string | undefined
): string {
  if (
    value === undefined || value.trim() !== value ||
    /[\r\n]/u.test(value) || Buffer.byteLength(value, "utf8") < 32
  ) {
    throw new Error("Private research orchestration authentication unavailable");
  }
  return value;
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

export function researchFinalizationSigningConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ResearchFinalizationSigningConfig | undefined {
  const signingSecret = env.ASKRIGOR_FINALIZATION_SIGNING_SECRET?.trim();
  const keyId = env.ASKRIGOR_FINALIZATION_KEY_ID?.trim();
  if (signingSecret === undefined && keyId === undefined) return undefined;
  if (
    signingSecret === undefined || Buffer.byteLength(signingSecret, "utf8") < 32 ||
    keyId === undefined || !/^[A-Za-z0-9._-]{1,100}$/u.test(keyId)
  ) {
    throw new Error("Research finalization signing configuration unavailable");
  }
  return { signingSecret, keyId };
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

/**
 * The deployed build's commit, which a deployment may set as
 * ASKRIGOR_BUILD_COMMIT; saved findings cards record it. "unknown" when it is
 * unset or not a plain commit or tag name.
 */
export function askrigorBuildCommitFromEnv(
  value = process.env.ASKRIGOR_BUILD_COMMIT
): string {
  const normalized = value?.trim();
  return normalized !== undefined && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(normalized)
    ? normalized
    : "unknown";
}

/**
 * Whether AskRigor's findings library is open: ASKRIGOR_FINDINGS_LIBRARY set to
 * "enabled". It stays closed until the owner has worded the privacy notice for
 * it and created its private review repository (owner decision Q10,
 * 2026-09-30); while closed, finalize_research checks no card and offers no
 * save, and save_research_findings saves nothing.
 */
export function findingsLibraryEnabledFromEnv(
  value = process.env.ASKRIGOR_FINDINGS_LIBRARY
): boolean {
  return value?.trim() === "enabled";
}

export function parseTrustedClientIpHeader(
  value = process.env.ASKRIGOR_TRUSTED_CLIENT_IP_HEADER
): "cf-connecting-ip" | undefined {
  return value === "cf-connecting-ip" ? value : undefined;
}

export const SERVER_INSTRUCTIONS =
  "Before research, call manage_research_access with action inspect. If access is unregistered or revoked, show the exact notice and let the user explicitly accept free contributor mode or use an entitled paid-private account; never infer consent or claim checkout exists. Free contributor mode permits only eligible deidentified structured formal-research proposals, never raw chat, identity, private health narratives, uploads, raw provider bodies, or YouTube/community data. After eligible free research, submit the strict frontier and each completed source analysis with submit_research_contribution; a pending proposal is not canonical evidence. Paid-private mode submits nothing. Before the final answer, call finalize_research with every research_receipt, your answer draft and a findings_card of its best findings; on not_ready do its next steps, else copy its caveats. If firsthand community evidence could plausibly matter, search the dominant community and an independent one: forums and Reddit by web search, YouTube by scout_gemini_youtube_candidates (else survey_youtube_community) and audit_youtube_video_community. An excellent RCT does not remove this requirement. Automatically continue while continuation_recommended is true; widen discovery until finalize_research accepts it. Retrieve unfiltered YouTube comments and replies; search_youtube_comments is query-bounded discovery only. For each decision-important full-text chain, call acquire_open_full_text once with exactly one doi and an optional pmcid; bind coverage_receipt.document_handle and coverage_receipt.source_content_sha256; call continue_open_full_text only while exhausted is false; then call one matching method-audit validator with the same bound document_handle. Its returned coverage_receipt.document_handle and coverage_receipt.source_content_sha256 must match the acquisition byte-for-byte; any mismatch blocks synthesis. If the handle expires, discard that chain and reacquire; never combine chains.";

export const HEALTH_PAYLOAD = {
  status: "ok",
  service: SERVICE_NAME,
  version: SERVICE_VERSION
} as const;
