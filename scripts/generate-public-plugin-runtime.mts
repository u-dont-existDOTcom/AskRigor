import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  researchOperationsForProfile,
  type ResearchOperationProfile
} from "../apps/research-mcp/src/register-tools.js";
import { PUBLIC_RUNTIME_FORMAT_VERSION } from
  "../apps/research-mcp/src/public-runtime-bundle.js";

const ROOT = new URL("../", import.meta.url);
const SOURCE_PATHS = [
  ["universal", "protocols/Universal_Instructions.xml", true],
  ["hrp", "protocols/HRP_Full.xml", true],
  ["project_router", "project/PROJECT_INSTRUCTIONS.md", true],
  ["forum_signal_module", "project/FORUM_SIGNAL_MODULE.md", true],
  ["public_plugin_adapter", "project/PUBLIC_PLUGIN_ADAPTER.md", true],
  ["public_runtime_bindings", "project/public-runtime-bindings.json", true]
] as const;

const SKILL_PATH = "skills/askrigor/SKILL.md";
const INITIALIZATION_PATH = "skills/askrigor/MCP_INITIALIZATION.md";
const INITIALIZATION_MODULE_PATH =
  "apps/research-mcp/src/generated/public-runtime-initialization.ts";
const MANIFEST_PATH = "skills/askrigor/public-runtime-source-manifest.json";

export interface GeneratedPublicRuntimeArtifact {
  path: string;
  text: string;
}

export interface PublicPluginRuntimeManifest {
  schema_version: 1;
  bundle_format_version: typeof PUBLIC_RUNTIME_FORMAT_VERSION;
  sources: Array<{
    document_id: string;
    path: string;
    utf8_bytes: number;
    sha256: string;
    runtime_document: boolean;
  }>;
  artifacts: Array<{
    document_id: string;
    path: string;
    utf8_bytes: number;
    sha256: string;
    runtime_document: boolean;
    source_paths: string[];
  }>;
  profiles: Record<ResearchOperationProfile, {
    operation_ids: string[];
  }>;
}

export interface GeneratedPublicPluginRuntime {
  artifacts: GeneratedPublicRuntimeArtifact[];
  manifest: PublicPluginRuntimeManifest;
}

export async function generatePublicPluginRuntime(): Promise<GeneratedPublicPluginRuntime> {
  const sourceEntries = await Promise.all(SOURCE_PATHS.map(async (
    [document_id, path, runtime_document]
  ) => {
    const bytes = await readFile(new URL(path, ROOT));
    return {
      document_id,
      path,
      utf8_bytes: bytes.byteLength,
      sha256: sha256(bytes),
      runtime_document
    };
  }));
  const [projectRouter, forumSignal, adapter, bindings] = await Promise.all([
    sourceText("project/PROJECT_INSTRUCTIONS.md"),
    sourceText("project/FORUM_SIGNAL_MODULE.md"),
    sourceText("project/PUBLIC_PLUGIN_ADAPTER.md"),
    sourceText("project/public-runtime-bindings.json")
  ]);
  const parsedBindings = JSON.parse(bindings) as {
    profiles: Record<ResearchOperationProfile, { operation_ids: string[] }>;
  };
  const profiles = Object.fromEntries(
    (["legacy", "standard-v2", "gemini"] as const).map((profile) => {
      const actual = researchOperationsForProfile(profile).map(({ name }) => name);
      const declared = parsedBindings.profiles[profile]?.operation_ids;
      if (JSON.stringify(actual) !== JSON.stringify(declared)) {
        throw new Error(`Public runtime binding does not match ${profile} registry`);
      }
      return [profile, { operation_ids: actual }];
    })
  ) as PublicPluginRuntimeManifest["profiles"];

  const initialization = initializationMarkdown(adapter);
  const skill = skillMarkdown();
  const artifactsWithoutManifest: Array<GeneratedPublicRuntimeArtifact & {
    document_id: string;
    runtime_document: boolean;
    source_paths: string[];
  }> = [
    {
      document_id: "generated_public_skill",
      path: SKILL_PATH,
      text: skill,
      runtime_document: false,
      source_paths: [
        "project/PUBLIC_PLUGIN_ADAPTER.md",
        "project/public-runtime-bindings.json"
      ]
    },
    {
      document_id: "packaged_project_router",
      path: "skills/askrigor/references/PROJECT_INSTRUCTIONS.md",
      text: projectRouter,
      runtime_document: false,
      source_paths: ["project/PROJECT_INSTRUCTIONS.md"]
    },
    {
      document_id: "packaged_forum_signal_module",
      path: "skills/askrigor/references/FORUM_SIGNAL_MODULE.md",
      text: forumSignal,
      runtime_document: false,
      source_paths: ["project/FORUM_SIGNAL_MODULE.md"]
    },
    {
      document_id: "packaged_public_plugin_adapter",
      path: "skills/askrigor/references/PUBLIC_PLUGIN_ADAPTER.md",
      text: adapter,
      runtime_document: false,
      source_paths: ["project/PUBLIC_PLUGIN_ADAPTER.md"]
    },
    {
      document_id: "packaged_public_runtime_bindings",
      path: "skills/askrigor/references/public-runtime-bindings.json",
      text: bindings,
      runtime_document: false,
      source_paths: ["project/public-runtime-bindings.json"]
    },
    {
      document_id: "mcp_initialization",
      path: INITIALIZATION_PATH,
      text: initialization,
      runtime_document: true,
      source_paths: [
        "project/PUBLIC_PLUGIN_ADAPTER.md",
        "project/public-runtime-bindings.json"
      ]
    },
    {
      document_id: "mcp_initialization_module",
      path: INITIALIZATION_MODULE_PATH,
      text: initializationModule(initialization),
      runtime_document: false,
      source_paths: [INITIALIZATION_PATH]
    }
  ];
  const manifest: PublicPluginRuntimeManifest = {
    schema_version: 1,
    bundle_format_version: PUBLIC_RUNTIME_FORMAT_VERSION,
    sources: sourceEntries,
    artifacts: artifactsWithoutManifest.map((artifact) => ({
      document_id: artifact.document_id,
      path: artifact.path,
      utf8_bytes: Buffer.byteLength(artifact.text, "utf8"),
      sha256: sha256(artifact.text),
      runtime_document: artifact.runtime_document,
      source_paths: artifact.source_paths
    })),
    profiles
  };
  const manifestText = `${JSON.stringify(sortKeys(manifest), null, 2)}\n`;
  return {
    artifacts: [
      ...artifactsWithoutManifest.map(({ path, text }) => ({ path, text })),
      { path: MANIFEST_PATH, text: manifestText }
    ],
    manifest
  };
}

export async function writePublicPluginRuntime(): Promise<void> {
  const generated = await generatePublicPluginRuntime();
  for (const artifact of generated.artifacts) {
    const url = new URL(artifact.path, ROOT);
    await mkdir(dirname(fileURLToPath(url)), { recursive: true });
    await writeFile(url, artifact.text, "utf8");
  }
}

function skillMarkdown(): string {
  return `---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
---

# AskRigor

Read [MCP_INITIALIZATION.md](MCP_INITIALIZATION.md) first. Then load the complete public runtime with \`load_research_runtime\` using the advertised profile and every returned continuation handle through \`complete: true\`.

The exact public operational authorities are packaged at:

- [PROJECT_INSTRUCTIONS.md](references/PROJECT_INSTRUCTIONS.md)
- [FORUM_SIGNAL_MODULE.md](references/FORUM_SIGNAL_MODULE.md)
- [PUBLIC_PLUGIN_ADAPTER.md](references/PUBLIC_PLUGIN_ADAPTER.md)
- [public-runtime-bindings.json](references/public-runtime-bindings.json)
- [public-runtime-source-manifest.json](public-runtime-source-manifest.json)

Use those complete references and the canonical Universal/HRP documents delivered by the runtime. Do not infer a shorter activation rule from this entrypoint. A checksum proves delivery continuity only. Only advertised \`PUBLIC_DIRECT\` tools are directly callable; controller-internal work stays behind the server-owned research session operations. Preserve access failures, partial evidence, provenance, and server-derived completion labels.
`;
}

function initializationMarkdown(adapter: string): string {
  const fullTextChain = markdownSection(
    adapter,
    "## Full-text chain",
    "## Output and provenance"
  );
  return `# AskRigor MCP initialization

For a diagnostic request, execute only the named diagnostic operation and report its result. Do not enroll, research, search elsewhere, or claim protocol compliance.

For ordinary research, first call \`manage_research_access\` with \`action: "inspect"\` and render the returned notice without inventing agreement, entitlement, price, or checkout. Once access is authorized, call \`load_research_runtime\` with \`profile: "standard-v2"\`, then follow each opaque \`next_handle\` in order until \`complete\` is true. Treat the reconstructed bytes as the complete public runtime authority.

Use only capabilities advertised for the selected profile. Controlled research uses the server-owned start/continue/status/finalize operations; do not directly simulate controller-internal work. Preserve exact source provenance, access status, limitations, and error category. A missing provider is not zero results, a missing transcript does not erase separately retrieved comments, and a runtime checksum proves delivery rather than comprehension or scientific correctness.

${fullTextChain}
`;
}

function markdownSection(document: string, heading: string, nextHeading: string): string {
  const start = document.indexOf(heading);
  const end = document.indexOf(nextHeading, start + heading.length);
  if (start === -1 || end === -1) {
    throw new Error(`Expected ${heading} before ${nextHeading}`);
  }
  return document.slice(start + heading.length, end).trim();
}

function initializationModule(initialization: string): string {
  return "// Generated by scripts/generate-public-plugin-runtime.mts. Do not edit.\n" +
    `export const PUBLIC_RUNTIME_INITIALIZATION_INSTRUCTIONS = ${JSON.stringify(initialization)} as const;\n`;
}

async function sourceText(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), "utf8");
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortKeys(child)]));
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await writePublicPluginRuntime();
}
