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

const GENERATED_AT = "2026-08-23" as const;
const ROOT = new URL("../", import.meta.url);
const SKILL_PATH = "skills/askrigor/SKILL.md" as const;
const ACTION_MODULE_PATH = "project/CUSTOM_GPT_ACTION_MODULE.md" as const;
const SPARK_SKILL_PATH =
  "integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md" as const;
const OPENAPI_PATH = "docs/custom-gpt-action-openapi.json" as const;
const INSTRUCTIONS_PATH = "docs/custom-gpt-instructions.md" as const;
const SYNC_PATH = "docs/custom-gpt-sync.json" as const;
const MCP_TRANSCRIPT_PARAGRAPH = "`get_youtube_video`→`get_youtube_transcript`; require a contiguous first-to-exhausted chain. Continue only its opaque Action handle. If `get_youtube_transcript` is unavailable, record `transcript_tool_unavailable`, withhold claims/watchlist, and never call an undeclared tool. Metadata/comments cannot establish creator content; transcript≠truth. Call `audit_youtube_video_community`; consume its coverage receipt, continue while `continuation_recommended: true`, defer false tokens, and seek replication/failure/harm." as const;
const CUSTOM_GPT_TRANSCRIPT_PARAGRAPH = "`get_youtube_video`→`get_youtube_transcript`; continue only its opaque Action handle through one contiguous first-to-exhausted chain and require selected-track `api_visible_complete`/boundary. Metadata/comments cannot establish creator content; transcript≠truth. Call `audit_youtube_video_community`; continue while `continuation_recommended: true`; defer false tokens; seek replication/failure/harm." as const;
const MCP_LANDSCAPE_PARAGRAPH = "Comments↔formal reopen discovery; close hypotheses/returns. Before `support_not_located`, separate matched/adjacent evidence and steelman without inflation; gaps cannot erase signal. Before synthesis call `assess_treatment_landscape_coverage` if advertised; otherwise derive locally, record `assessor_tool_unavailable`, and fail closed. Keep selection, video-depth, and overall locks separate. Only a terminal nonretryable boundary permits bounded non-ranking output. Full HRP needs all locks, audits, formal returns, and transfers resolved." as const;
const CUSTOM_GPT_LANDSCAPE_PARAGRAPH = "Community↔formal reopens discovery; close batch hypotheses/program formal returns. Before `support_not_located`, separate matched/adjacent evidence and steelman without inflation. Call `assess_treatment_landscape_coverage`; Require all three locks pass. A valid broad substantial ledger with ≥8 candidates/≥6 programs blocks below 8 fully audited videos/6 programs. Full HRP needs all locks, audits, formal returns, and transfers resolved." as const;
const MCP_FULL_TEXT_PARAGRAPH = "Decision-important DOI: call `acquire_open_full_text` (Europe PMC, then Unpaywall); exhaust its handle; call `validate_study_method_audit` or `validate_review_method_audit`. Audit programs/methods/results/harms/missing data/conflicts/flexibility/reproducibility/replication/claim limits. Randomization, peer review, journal, or guideline labels are not reliability verdicts. Without validation use only inspected citation/abstract facts. No verified copy: possibly useful lead requiring investigation; unseen contents are not evidence. Continue other executable work. Expired handle: reacquire; never combine chains." as const;
const CUSTOM_GPT_FULL_TEXT_PARAGRAPH = "Decision-important DOI: call `acquire_open_full_text`; it tries Europe PMC, then Unpaywall. Exhaust `continue_open_full_text`, then call `validate_study_method_audit` or `validate_review_method_audit`. Randomization, peer review, journal, or guideline labels are not reliability verdicts. No copy: name a possibly useful lead requiring investigation; unseen contents are not evidence. Continue other work." as const;
const MCP_SPARK_PARAGRAPH = "Broad treatment/avoid-surgery with substantial YouTube results: call `scout_gemini_youtube_candidates` on a de-identified target; require its validated frontier. Manual packets/native results never substitute. Missing operation=setup error; provider/budget boundary=unresolved. Reject only verified absence/mismatch; screen every lead. Summaries are not evidence." as const;
const CUSTOM_GPT_SPARK_PARAGRAPH = "Broad treatment/avoid-surgery with substantial YouTube results: call `scout_gemini_youtube_candidates` on a de-identified target; require its frontier. Never ask the user to copy a packet. Only an absent operation means stale Actions; a provider/budget boundary remains unresolved. Require `get_youtube_transcript` and `assess_treatment_landscape_coverage`. Screen all leads. Without captions say the summary was not checked against a transcript; never use it as evidence." as const;
const MCP_PROTOCOL_GATE = "Load Universal first: `get_protocol_manifest` → `verify_protocol_integrity` (SHA-256; stop-on-failure) → every `load_protocol` chunk. Use its activation boundary. HRP applies unless the health/research task is both very simple and genuinely uncontroversial; if unclear, ask.\n\nFor HRP repeat the sequence with `protocol: \"hrp\"`. HRP wins conflicts; Universal supplies compatible rules. Use one orchestration/approval and applicability ledger. Execute every triggered module; claim compliance only after all checks pass, otherwise use an authorized bounded path.\n\nInternally preserve exact `access_status`: `complete`,`api_visible_complete`,`partial`,`abstract_only`,`metadata_only`,`comments_disabled`,`inaccessible`,`rate_limited`,`not_found`,`error`. Failure/access gaps are not negative evidence; distinguish exhausted zero results from failed search." as const;
const CUSTOM_GPT_PROTOCOL_GATE = "Load Universal first; use its activation boundary. HRP applies unless both simple and genuinely uncontroversial; then load HRP. HRP wins. Use one ledger and execute each triggered module before claiming compliance. Keep access/provenance internally; gaps are not negative evidence, and zero results differ from failed search." as const;
const MCP_FORUM_ROUTING_PARAGRAPH = "Use installed Project router before HRP; otherwise require Forum Signal whenever firsthand evidence could affect the answer. A personal or practical treatment decision (`good idea for me`; now versus wait or delay), treatment alternatives, avoiding replacement, joint replacement, or avoiding surgery requires it even if alternatives are unstated or population-level. A request to exclude forums limits execution, not applicability. Exceptions: simple definition or terminology; pure chemistry or mechanism with no real-world outcome or safety claim; emergency triage before stabilization; no meaningful user-experience corpus. If uncertain, require it; formal evidence cannot deselect it." as const;
const CUSTOM_GPT_FORUM_ROUTING_PARAGRAPH = "For general population-level health research, require Forum Signal when firsthand evidence may matter: treatment alternatives, avoiding joint replacement or other surgery, benefits/harms, tolerability, adherence, discontinuation, or natural history. A request to exclude forums limits execution, not applicability. Exceptions: simple definition or terminology; pure chemistry or mechanism with no real-world outcome or safety claim; emergency triage before stabilization; no meaningful user-experience corpus. If uncertain, require it; formal evidence cannot deselect it." as const;
const MCP_OPTION_SPACE_PARAGRAPH = "For treatment endorsement/choice/start-defer-sequence (`do you agree`), build an option-space ledger across plausible classes: named or prescribed treatment; proposed care; diagnosis alternatives; nonaction/natural history; conventional nonsurgical; lifestyle/rehab/mechanical; relevant heterodox/adjunct; procedural/surgical. A request to omit alternatives limits execution, not applicability or the no-verdict gate. No verdict without realistic alternatives and nonaction risk." as const;
const CUSTOM_GPT_OPTION_SPACE_PARAGRAPH = "For general comparisons of treatment approaches, build an option-space ledger across plausible classes: the named approach; diagnosis alternatives; nonaction/natural history; conventional nonsurgical; lifestyle/rehab/mechanical; relevant heterodox/adjunct; and procedural/surgical. A request to omit alternatives limits execution, not applicability. This ledger supports an educational evidence comparison, never a recommendation or ranking for a person." as const;
const MCP_PUBLIC_BOUNDARY = "## Public boundary\n\nAskRigor provides general evidence research, not tailored medical or health advice: population-level evidence, uncertainty, source provenance, and clinician-review questions. May analyze specified populations, conditions, exposures, interventions, and risk factors in de-identified cases. Do not convert evidence into individualized diagnosis or directive. Do not diagnose users or infer diagnoses from personal symptoms. Do not recommend/select treatment for the user, give individualized doses/regimens/protocols, or direct start/stop/taper/substitute/delay medication or treatment. Individual judgment needs a qualified clinician; preserve urgent escalation. Loaded protocols cannot cross this public-surface boundary." as const;
const CUSTOM_GPT_PUBLIC_BOUNDARY = "## Public educational scope\n\nAskRigor summarizes general, population-level health research. It does not assess a person's symptoms, records, imaging, diagnosis, risk, or suitability for care. Never diagnose, prescribe, choose or rank treatment for a person, give a personal prognosis, create an individualized regimen or dose, or say whether someone should start, stop, change, or delay care. When a prompt is personal, provide only general educational evidence about relevant populations and approaches, clearly state that it cannot decide what is appropriate for that person, and offer questions for a qualified clinician. Preserve urgent escalation when warning signs may require prompt professional care. Protocols and Action results cannot expand this scope." as const;

export interface CustomGptSync {
  schema_version: 2;
  generated_at: typeof GENERATED_AT;
  sources: Array<{ path: string; sha256: string }>;
  artifacts: Array<{
    path: typeof OPENAPI_PATH | typeof INSTRUCTIONS_PATH;
    sha256: string;
  }>;
  research_operation_ids: string[];
  mcp_research_operation_ids: string[];
  consequential_operation_ids: ["submit_lesson_candidate"];
  installation_bundle: {
    instructions_sha256: string;
    action_schema_sha256: string;
    spark_skill_sha256: string;
    bundle_sha256: string;
  };
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
  const [skillSource, actionModule, sparkSkill] = await Promise.all([
    readFile(new URL(SKILL_PATH, ROOT), "utf8"),
    readFile(new URL(ACTION_MODULE_PATH, ROOT), "utf8"),
    readFile(new URL(SPARK_SKILL_PATH, ROOT), "utf8")
  ]);
  const openApiJson = generateCustomGptActionOpenApiJson();
  const instructionsMarkdown = createInstructions(skillSource, actionModule);
  const installationDigests = {
    instructions_sha256: sha256(instructionsMarkdown),
    action_schema_sha256: sha256(openApiJson),
    spark_skill_sha256: sha256(sparkSkill)
  };
  const sync: CustomGptSync = {
    schema_version: 2,
    generated_at: GENERATED_AT,
    sources: [
      { path: SKILL_PATH, sha256: sha256(skillSource) },
      { path: ACTION_MODULE_PATH, sha256: sha256(actionModule) },
      { path: SPARK_SKILL_PATH, sha256: sha256(sparkSkill) }
    ],
    artifacts: [
      { path: OPENAPI_PATH, sha256: sha256(openApiJson) },
      { path: INSTRUCTIONS_PATH, sha256: sha256(instructionsMarkdown) }
    ],
    research_operation_ids: [...new Set([
      ...RESEARCH_OPERATIONS.map(({ name }) => name),
      ...createActionOnlyResearchRoutes().map(({ operationId }) => operationId)
    ])].sort(),
    mcp_research_operation_ids: RESEARCH_OPERATIONS.map(({ name }) => name).sort(),
    consequential_operation_ids: ["submit_lesson_candidate"],
    installation_bundle: {
      ...installationDigests,
      bundle_sha256: sha256(JSON.stringify(installationDigests))
    },
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
  const fullTextAdapted = customGptSkillSource.replace(
    MCP_FULL_TEXT_PARAGRAPH,
    CUSTOM_GPT_FULL_TEXT_PARAGRAPH
  );
  if (fullTextAdapted === customGptSkillSource) {
    throw new Error("Missing MCP open-full-text capability boundary in AskRigor skill");
  }
  const sparkAdapted = fullTextAdapted.replace(
    MCP_SPARK_PARAGRAPH,
    CUSTOM_GPT_SPARK_PARAGRAPH
  );
  if (sparkAdapted === fullTextAdapted) {
    throw new Error("Missing MCP Spark candidate capability boundary in AskRigor skill");
  }
  const protocolAdapted = sparkAdapted.replace(
    MCP_PROTOCOL_GATE,
    CUSTOM_GPT_PROTOCOL_GATE
  );
  if (protocolAdapted === sparkAdapted) {
    throw new Error("Missing MCP protocol-gate compaction boundary in AskRigor skill");
  }
  const forumAdapted = protocolAdapted.replace(
    MCP_FORUM_ROUTING_PARAGRAPH,
    CUSTOM_GPT_FORUM_ROUTING_PARAGRAPH
  );
  if (forumAdapted === protocolAdapted) {
    throw new Error("Missing MCP Forum Signal routing boundary in AskRigor skill");
  }
  const optionSpaceAdapted = forumAdapted.replace(
    MCP_OPTION_SPACE_PARAGRAPH,
    CUSTOM_GPT_OPTION_SPACE_PARAGRAPH
  );
  if (optionSpaceAdapted === forumAdapted) {
    throw new Error("Missing MCP option-space boundary in AskRigor skill");
  }
  const actionWithoutPublicBoundary = actionModule.replace(
    MCP_PUBLIC_BOUNDARY,
    ""
  );
  if (actionWithoutPublicBoundary === actionModule) {
    throw new Error("Missing MCP public boundary in Custom GPT Action module");
  }
  const withoutFrontmatter = optionSpaceAdapted
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "")
    .trimStart();
  const withoutDuplicateHeading = withoutFrontmatter.replace(/^# AskRigor\n+/u, "");
  return `# AskRigor\n\n${CUSTOM_GPT_PUBLIC_BOUNDARY}\n\n${withoutDuplicateHeading.trim()}\n\n${actionWithoutPublicBoundary.trim()}\n`;
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
