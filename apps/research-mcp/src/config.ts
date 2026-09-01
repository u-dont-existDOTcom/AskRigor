export const SERVICE_NAME = "askrigor-research";
export const GEMINI_COMPATIBLE_SERVICE_NAME = "askrigor_research";
export const SERVICE_VERSION = "0.1.0";
export const DEFAULT_PORT = 3000;
export const MAX_MCP_REQUEST_BYTES = 1_048_576;
export const GEMINI_COMPATIBLE_MCP_PATH = "/mcp/gemini";
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

export function parseTrustedClientIpHeader(
  value = process.env.ASKRIGOR_TRUSTED_CLIENT_IP_HEADER
): "cf-connecting-ip" | undefined {
  return value === "cf-connecting-ip" ? value : undefined;
}

export const SERVER_INSTRUCTIONS =
  "Before ordinary research use, call manage_research_access with action inspect. If access is unregistered or revoked, present the returned exact notice and let the user explicitly accept free contributor mode or use an already entitled paid-private account; never infer consent or claim that checkout exists. Free contributor mode permits only eligible deidentified structured formal-research proposals, never raw chat, identity, private health narratives, uploads, raw source/provider bodies, or YouTube/community data. At the end of eligible free research, submit the strict frontier and each complete performed source analysis with submit_research_contribution; a pending proposal is not canonical evidence. Paid-private mode submits nothing. Before final synthesis, if firsthand community evidence could plausibly matter, call survey_youtube_community, then audit_youtube_video_community for each material video. Finding an excellent RCT does not remove this requirement. Automatically continue while continuation_recommended is true and widen while expected information gain is positive. Retrieve unfiltered YouTube comments and replies; search_youtube_comments is query-bounded discovery only and never satisfies corpus acquisition. Preserve provenance and blocking receipts. For each decision-important full-text chain, call acquire_open_full_text once with exactly one doi and an optional pmcid; bind coverage_receipt.document_handle and coverage_receipt.source_content_sha256; call continue_open_full_text only while exhausted is false; then call one matching method-audit validator with the same bound document_handle. When repository_study_audit.status is reusable, pass its repository_analysis_version_id to the study validator instead of constructing a new audit; the server rechecks compatibility and runs the same validator. If reuse returns fresh_study_audit_required, call the same validator again with a newly performed audit on the unchanged exhausted handle. Require its returned coverage_receipt.document_handle and coverage_receipt.source_content_sha256 to match the acquisition byte-for-byte; any mismatch blocks synthesis. A fresh_study_audit_required boundary is not validated and also blocks synthesis until the named next capability succeeds. If the handle expires or is invalidated, discard that chain and reacquire; never combine chains. Review usable records from partial corpora as bounded evidence and label them partial; completion locks do not make observed records ineligible. Read-only retrieval.";

export const HEALTH_PAYLOAD = {
  status: "ok",
  service: SERVICE_NAME,
  version: SERVICE_VERSION
} as const;
