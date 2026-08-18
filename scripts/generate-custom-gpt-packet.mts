import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createActionOpenApiDocument } from
  "../apps/research-mcp/src/actions/openapi.js";
import { createResearchActionRoutes } from
  "../apps/research-mcp/src/actions/research-routes.js";
import { createEnabledActionRoutes } from
  "../apps/research-mcp/src/actions/runtime.js";
import { createDefaultActionRoutes } from
  "../apps/research-mcp/src/lessons/runtime.js";
import { RESEARCH_OPERATIONS } from
  "../apps/research-mcp/src/register-tools.js";

const GENERATED_AT = "2026-08-18" as const;
const ROOT = new URL("../", import.meta.url);
const SKILL_PATH = "skills/askrigor/SKILL.md" as const;
const ACTION_MODULE_PATH = "project/CUSTOM_GPT_ACTION_MODULE.md" as const;
const OPENAPI_PATH = "docs/custom-gpt-action-openapi.json" as const;
const INSTRUCTIONS_PATH = "docs/custom-gpt-instructions.md" as const;
const SYNC_PATH = "docs/custom-gpt-sync.json" as const;

export interface CustomGptSync {
  schema_version: 1;
  generated_at: typeof GENERATED_AT;
  sources: Array<{ path: string; sha256: string }>;
  artifacts: Array<{
    path: typeof OPENAPI_PATH | typeof INSTRUCTIONS_PATH;
    sha256: string;
  }>;
  research_operation_ids: string[];
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
    research: createResearchActionRoutes(),
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
    research_operation_ids: RESEARCH_OPERATIONS.map(({ name }) => name).sort(),
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
  const withoutFrontmatter = skillSource
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
