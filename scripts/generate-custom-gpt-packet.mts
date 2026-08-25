import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createActionOpenApiDocument } from
  "../apps/research-mcp/src/actions/openapi.js";
import { createControlledResearchRoutes } from
  "../apps/research-mcp/src/actions/controlled-research-route.js";
import { createEnabledActionRoutes } from
  "../apps/research-mcp/src/actions/runtime.js";
import { createDefaultActionRoutes } from
  "../apps/research-mcp/src/lessons/runtime.js";
import { RESEARCH_OPERATIONS } from
  "../apps/research-mcp/src/register-tools.js";

const GENERATED_AT = "2026-08-25" as const;
const ROOT = new URL("../", import.meta.url);
const INSTRUCTION_SOURCE_PATH =
  "project/CUSTOM_GPT_CONTROLLED_INSTRUCTIONS.md" as const;
const SPARK_SKILL_PATH =
  "integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md" as const;
const OPENAPI_PATH = "docs/custom-gpt-action-openapi.json" as const;
const INSTRUCTIONS_PATH = "docs/custom-gpt-instructions.md" as const;
const SYNC_PATH = "docs/custom-gpt-sync.json" as const;
const RUNTIME_MANIFEST_PATH =
  "apps/research-mcp/src/generated/custom-gpt-bundle.ts" as const;
const CONTROLLED_RESEARCH_OPERATIONS = [
  "start_research_session",
  "continue_research_session",
  "get_research_session_status",
  "finalize_research_report"
] as const;
const GENERATION_SECRET = "generation-only-secret-32-bytes-long";

export interface CustomGptSync {
  schema_version: 3;
  generated_at: typeof GENERATED_AT;
  sources: Array<{ path: string; sha256: string }>;
  artifacts: Array<{
    path: typeof OPENAPI_PATH | typeof INSTRUCTIONS_PATH | typeof RUNTIME_MANIFEST_PATH;
    sha256: string;
  }>;
  research_operation_ids: string[];
  mcp_research_operation_ids: string[];
  consequential_operation_ids: ["submit_lesson_candidate"];
  installation_bundle: {
    instructions_sha256: string;
    action_schema_sha256: string;
    bundle_sha256: string;
  };
  internal_scout_skill_sha256: string;
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
  runtimeManifestTypescript: string;
  syncJson: string;
}

function controlledRoutes() {
  return createControlledResearchRoutes({
    deterministicAdvanceDependencies: {},
    semanticAdvanceDependencies: {},
    continuationSigningSecret: GENERATION_SECRET,
    finalizationSigningSecret: GENERATION_SECRET,
    finalizationKeyId: "generation-only"
  });
}

export function generateCustomGptActionOpenApiJson(): string {
  const routes = createEnabledActionRoutes({
    researchEnabled: true,
    lessonsEnabled: true,
    research: controlledRoutes(),
    lessons: createDefaultActionRoutes()
  });
  return `${JSON.stringify(createActionOpenApiDocument(routes), null, 2)}\n`;
}

export async function generateCustomGptPacket(): Promise<CustomGptPacket> {
  const [instructionSource, sparkSkill] = await Promise.all([
    readFile(new URL(INSTRUCTION_SOURCE_PATH, ROOT), "utf8"),
    readFile(new URL(SPARK_SKILL_PATH, ROOT), "utf8")
  ]);
  const instructionsMarkdown = instructionSource.trimEnd() + "\n";
  const openApiJson = generateCustomGptActionOpenApiJson();
  const installation = {
    instructions_sha256: sha256(instructionsMarkdown),
    action_schema_sha256: sha256(openApiJson)
  };
  const bundleSha256 = sha256(JSON.stringify(installation));
  const runtimeManifestTypescript = runtimeManifest({
    ...installation,
    bundle_sha256: bundleSha256
  });
  const sync: CustomGptSync = {
    schema_version: 3,
    generated_at: GENERATED_AT,
    sources: [
      { path: INSTRUCTION_SOURCE_PATH, sha256: sha256(instructionSource) },
      { path: SPARK_SKILL_PATH, sha256: sha256(sparkSkill) }
    ],
    artifacts: [
      { path: OPENAPI_PATH, sha256: sha256(openApiJson) },
      { path: INSTRUCTIONS_PATH, sha256: sha256(instructionsMarkdown) },
      { path: RUNTIME_MANIFEST_PATH, sha256: sha256(runtimeManifestTypescript) }
    ],
    research_operation_ids: [...CONTROLLED_RESEARCH_OPERATIONS].sort(),
    mcp_research_operation_ids: RESEARCH_OPERATIONS.map(({ name }) => name).sort(),
    consequential_operation_ids: ["submit_lesson_candidate"],
    installation_bundle: {
      ...installation,
      bundle_sha256: bundleSha256
    },
    internal_scout_skill_sha256: sha256(sparkSkill),
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
    runtimeManifestTypescript,
    syncJson: `${JSON.stringify(sortObjectKeys(sync), null, 2)}\n`
  };
}

export async function writeCustomGptPacket(): Promise<void> {
  const packet = await generateCustomGptPacket();
  await Promise.all([
    writeFile(new URL(OPENAPI_PATH, ROOT), packet.openApiJson, "utf8"),
    writeFile(new URL(INSTRUCTIONS_PATH, ROOT), packet.instructionsMarkdown, "utf8"),
    writeFile(new URL(RUNTIME_MANIFEST_PATH, ROOT), packet.runtimeManifestTypescript, "utf8"),
    writeFile(new URL(SYNC_PATH, ROOT), packet.syncJson, "utf8")
  ]);
}

function runtimeManifest(bundle: {
  instructions_sha256: string;
  action_schema_sha256: string;
  bundle_sha256: string;
}): string {
  return `// Generated by scripts/generate-custom-gpt-packet.mts. Do not edit.\n` +
    `export const CUSTOM_GPT_INSTALLATION_BUNDLE = ${JSON.stringify(bundle, null, 2)} as const;\n`;
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
