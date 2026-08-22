import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createActionOpenApiDocument } from
  "../apps/research-mcp/src/actions/openapi.js";
import { createResearchActionRoutes } from
  "../apps/research-mcp/src/actions/research-routes.js";
import { createActionOnlyResearchRoutes } from
  "../apps/research-mcp/src/actions/youtube-transcript-route.js";
import { createEnabledActionRoutes } from
  "../apps/research-mcp/src/actions/runtime.js";
import { createDefaultActionRoutes } from
  "../apps/research-mcp/src/lessons/runtime.js";
import { RESEARCH_OPERATIONS } from
  "../apps/research-mcp/src/register-tools.js";

const GENERATED_AT = "2026-08-22" as const;
const ROOT = new URL("../", import.meta.url);
const SKILL_PATH = "skills/askrigor/SKILL.md" as const;
const ACTION_MODULE_PATH = "project/CUSTOM_GPT_ACTION_MODULE.md" as const;
const OPENAPI_PATH = "docs/custom-gpt-action-openapi.json" as const;
const INSTRUCTIONS_PATH = "docs/custom-gpt-instructions.md" as const;
const SYNC_PATH = "docs/custom-gpt-sync.json" as const;
const MCP_TRANSCRIPT_PARAGRAPH = "Shortlist: `get_youtube_video`→`get_youtube_transcript`; require selected-track completion/boundary and contiguous first-to-exhausted chain. Continue only its opaque Action handle; reject caller cursors, skipped/lone pages, and mixed restart counts. If `get_youtube_transcript` is unavailable, record `transcript_tool_unavailable`, withhold claims/watchlist, and never call an undeclared tool. Metadata/comments cannot establish creator content; transcript≠truth. Call `audit_youtube_video_community`; consume its coverage receipt, continue while `continuation_recommended: true`, defer false tokens, and seek replication/failure/harm. Incomplete/retryable work remains executable despite caller labels." as const;
const CUSTOM_GPT_TRANSCRIPT_PARAGRAPH = "`get_youtube_video`→`get_youtube_transcript`; continue only its opaque Action handle. Require selected-track `api_visible_complete`/terminal boundary and one contiguous first-to-exhausted chain; reject skipped/mixed calls. Metadata/comments cannot establish creator content; transcript≠truth. Call `audit_youtube_video_community`; continue while `continuation_recommended: true`, defer false tokens, and seek replication/failure/harm. Incomplete/retryable work remains executable." as const;
const MCP_LANDSCAPE_PARAGRAPH = "Comments↔formal findings reopen discovery; close batch hypotheses and formal-return fingerprints. Before `support_not_located`, separate matched/adjacent evidence and steelman without inflation; gaps cannot erase signal. Before synthesis call `assess_treatment_landscape_coverage` if advertised; pass=ledger consistency only. Otherwise derive locally, record `assessor_tool_unavailable`, and fail closed. Keep selection, video-depth, and overall locks separate. Only a terminal nonretryable boundary after recovery permits bounded non-ranking output. Full HRP needs all locks, audits, formal returns, and transfers resolved." as const;
const CUSTOM_GPT_LANDSCAPE_PARAGRAPH = "Community↔formal reopens discovery; close material hypotheses from every batch and formal-return each fingerprint. Before `support_not_located`, separate matched/adjacent evidence and steelman without inflation; gaps cannot erase signal. Before synthesis call `assess_treatment_landscape_coverage`; pass=ledger consistency only. Require all three locks pass. Only a terminal nonretryable boundary after recovery permits bounded non-ranking output. Full HRP needs all locks, audits, formal returns, and transfers resolved." as const;
const MCP_SPARK_PARAGRAPH = "Supplied `gemini_youtube_candidate_handoff`: validate identities; preserve the frontier. Reject only literal not-found/not-visible results or verified mismatches; all other failures stay unresolved. Screen every validated lead despite caller labels. Spark summaries are unverified search cues, never evidence." as const;
const CUSTOM_GPT_SPARK_PARAGRAPH = "Supplied `gemini_youtube_candidate_handoff`: call `validate_gemini_youtube_candidate_handoff` and preserve its complete frontier receipt. Reject only literal not-found/not-visible results or verified identity mismatches; leave every other validation failure unresolved regardless of immediate retryability. Screen every validated lead regardless of caller labels before substitutes. Spark summaries are provisional search cues. If captions are unavailable, say the summary was not checked against a transcript; retain discovery value, never use it as creator-content or treatment evidence." as const;
const MCP_PROTOCOL_GATE = "Load Universal first: `get_protocol_manifest` → `verify_protocol_integrity` with its SHA-256 (stop on failure) → every `load_protocol` chunk. Use its activation boundary. HRP applies unless the health/research task is both very simple and genuinely uncontroversial; if unclear, ask.\n\nFor HRP repeat the sequence with `protocol: \"hrp\"`. HRP wins conflicts; Universal supplies compatible rules. Use one orchestration/approval and applicability ledger. Execute every triggered module; claim compliance only after all checks pass, otherwise use an authorized bounded path.\n\nInternally preserve exact `access_status`: `complete`,`api_visible_complete`,`partial`,`abstract_only`,`metadata_only`,`comments_disabled`,`inaccessible`,`rate_limited`,`not_found`,`error`. Preserve identifier/link/query/page provenance. Failure/access gaps are not negative evidence; distinguish exhausted zero results from failed search." as const;
const CUSTOM_GPT_PROTOCOL_GATE = "Load Universal first and use its activation boundary; HRP applies unless both simple and genuinely uncontroversial. Repeat for HRP. HRP wins conflicts; use one ledger, execute every triggered module, and claim compliance only after all checks pass. Preserve exact access and provenance internally; gaps are not negative evidence, and an exhausted zero-result search differs from a failed search." as const;

export interface CustomGptSync {
  schema_version: 1;
  generated_at: typeof GENERATED_AT;
  sources: Array<{ path: string; sha256: string }>;
  artifacts: Array<{
    path: typeof OPENAPI_PATH | typeof INSTRUCTIONS_PATH;
    sha256: string;
  }>;
  research_operation_ids: string[];
  mcp_research_operation_ids: string[];
  consequential_operation_ids: ["submit_lesson_candidate"];
  editor: {
    knowledge: "empty";
    schema_url: "https://mcp.askrigor.com/actions/openapi.json";
    authentication: "API Key -> Bearer";
    privacy_url: "https://askrigor.com/privacy";
    direct_gpt_url_required: true;
  };
}

export interface CustomGptPacket {
  openApiJson: string;
  instructionsMarkdown: string;
  syncJson: string;
}

export function generateCustomGptActionOpenApiJson(): string {
  const routes = createEnabledActionRoutes({
    researchEnabled: true,
    lessonsEnabled: true,
    research: [
      ...createResearchActionRoutes(),
      ...createActionOnlyResearchRoutes()
    ],
    lessons: createDefaultActionRoutes()
  });
  return `${JSON.stringify(createActionOpenApiDocument(routes), null, 2)}\n`;
}

export async function generateCustomGptPacket(): Promise<CustomGptPacket> {
  const [skillSource, actionModule] = await Promise.all([
    readFile(new URL(SKILL_PATH, ROOT), "utf8"),
    readFile(new URL(ACTION_MODULE_PATH, ROOT), "utf8")
  ]);
  const openApiJson = generateCustomGptActionOpenApiJson();
  const instructionsMarkdown = createInstructions(skillSource, actionModule);
  const sync: CustomGptSync = {
    schema_version: 1,
    generated_at: GENERATED_AT,
    sources: [
      { path: SKILL_PATH, sha256: sha256(skillSource) },
      { path: ACTION_MODULE_PATH, sha256: sha256(actionModule) }
    ],
    artifacts: [
      { path: OPENAPI_PATH, sha256: sha256(openApiJson) },
      { path: INSTRUCTIONS_PATH, sha256: sha256(instructionsMarkdown) }
    ],
    research_operation_ids: [
      ...RESEARCH_OPERATIONS.map(({ name }) => name),
      ...createActionOnlyResearchRoutes().map(({ operationId }) => operationId)
    ].sort(),
    mcp_research_operation_ids: RESEARCH_OPERATIONS.map(({ name }) => name).sort(),
    consequential_operation_ids: ["submit_lesson_candidate"],
    editor: {
      knowledge: "empty",
      schema_url: "https://mcp.askrigor.com/actions/openapi.json",
      authentication: "API Key -> Bearer",
      privacy_url: "https://askrigor.com/privacy",
      direct_gpt_url_required: true
    }
  };
  return {
    openApiJson,
    instructionsMarkdown,
    syncJson: `${JSON.stringify(sortObjectKeys(sync), null, 2)}\n`
  };
}

export async function writeCustomGptPacket(): Promise<void> {
  const packet = await generateCustomGptPacket();
  await Promise.all([
    writeFile(new URL(OPENAPI_PATH, ROOT), packet.openApiJson, "utf8"),
    writeFile(new URL(INSTRUCTIONS_PATH, ROOT), packet.instructionsMarkdown, "utf8"),
    writeFile(new URL(SYNC_PATH, ROOT), packet.syncJson, "utf8")
  ]);
}

function createInstructions(skillSource: string, actionModule: string): string {
  const transcriptAdapted = skillSource.replace(
    MCP_TRANSCRIPT_PARAGRAPH,
    CUSTOM_GPT_TRANSCRIPT_PARAGRAPH
  );
  if (transcriptAdapted === skillSource) {
    throw new Error("Missing MCP transcript capability boundary in AskRigor skill");
  }
  const customGptSkillSource = transcriptAdapted.replace(
    MCP_LANDSCAPE_PARAGRAPH,
    CUSTOM_GPT_LANDSCAPE_PARAGRAPH
  );
  if (customGptSkillSource === transcriptAdapted) {
    throw new Error("Missing MCP treatment-landscape capability boundary in AskRigor skill");
  }
  const sparkAdapted = customGptSkillSource.replace(
    MCP_SPARK_PARAGRAPH,
    CUSTOM_GPT_SPARK_PARAGRAPH
  );
  if (sparkAdapted === customGptSkillSource) {
    throw new Error("Missing MCP Spark candidate capability boundary in AskRigor skill");
  }
  const protocolAdapted = sparkAdapted.replace(
    MCP_PROTOCOL_GATE,
    CUSTOM_GPT_PROTOCOL_GATE
  );
  if (protocolAdapted === sparkAdapted) {
    throw new Error("Missing MCP protocol-gate compaction boundary in AskRigor skill");
  }
  const withoutFrontmatter = protocolAdapted
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "")
    .trimStart();
  const withoutDuplicateHeading = withoutFrontmatter.replace(/^# AskRigor\n+/u, "");
  return `# AskRigor\n\n${withoutDuplicateHeading.trim()}\n\n${actionModule.trim()}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortObjectKeys(child)]));
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await writeCustomGptPacket();
}
