import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { generatePublicPluginRuntime } from
  "../scripts/generate-public-plugin-runtime.mts";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const EXPECTED_SKILL_FRONTMATTER = `---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
---`;

describe("AskRigor plugin package", () => {
  it("contains the generated AskRigor closure without removing unrelated packaged skills", async () => {
    expect(await readdir(rootFile(".codex-plugin"))).toEqual(["plugin.json"]);
    expect((await readdir(rootFile("skills"))).sort()).toEqual([
      "askrigor",
      "browser-archive-downloading"
    ]);
    expect((await readdir(rootFile("skills/askrigor"))).sort()).toEqual([
      "MCP_INITIALIZATION.md",
      "SKILL.md",
      "public-runtime-source-manifest.json",
      "references"
    ]);
    expect((await readdir(rootFile("skills/askrigor/references"))).sort()).toEqual([
      "FORUM_SIGNAL_MODULE.md",
      "PROJECT_INSTRUCTIONS.md",
      "PUBLIC_PLUGIN_ADAPTER.md",
      "public-runtime-bindings.json"
    ]);

    const ignored = await readFile(rootFile(".gitignore"), "utf8");
    expect(ignored.split(/\r?\n/u)).toContain(".app.json");
  });

  it("publishes the ingestion-valid read/write manifest without local app wiring", async () => {
    const manifest = JSON.parse(
      await readFile(rootFile(".codex-plugin/plugin.json"), "utf8")
    );

    expect(manifest).toEqual({
      name: "askrigor",
      version: "0.1.0",
      description:
        "Rigorous health and research workflows with deterministic scholarly and community-source retrieval.",
      repository: "https://github.com/u-dont-existDOTcom/AskRigor",
      keywords: ["research", "health", "evidence", "pubmed", "youtube"],
      skills: "./skills/",
      author: { name: "Mayan Roots LLC" },
      interface: {
        displayName: "AskRigor",
        shortDescription: "Auditable research retrieval",
        longDescription:
          "Rigorous health and research workflows with deterministic, auditable source retrieval and explicit access boundaries.",
        developerName: "Mayan Roots LLC",
        category: "Productivity",
        capabilities: ["Read", "Write"],
        websiteURL: "https://askrigor.com",
        privacyPolicyURL: "https://askrigor.com/privacy",
        termsOfServiceURL: "https://askrigor.com/terms",
        brandColor: "#145A8D",
        composerIcon: "./assets/askrigor-composer-icon.svg",
        logo: "./assets/askrigor-logo.svg",
        defaultPrompt: [
          "Use AskRigor to research this question with auditable evidence and explicit access gaps."
        ]
      }
    });
  });

  it("uses a generated short entrypoint that points to every exact packaged authority", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");

    expect(skill.startsWith(`${EXPECTED_SKILL_FRONTMATTER}\n`)).toBe(true);
    for (const reference of [
      "MCP_INITIALIZATION.md",
      "references/PROJECT_INSTRUCTIONS.md",
      "references/FORUM_SIGNAL_MODULE.md",
      "references/PUBLIC_PLUGIN_ADAPTER.md",
      "references/public-runtime-bindings.json",
      "public-runtime-source-manifest.json"
    ]) expect(skill).toContain(reference);
    expect(skill).toContain("`load_research_runtime`");
    expect(skill).toContain("every returned continuation handle through `complete: true`");
    expect(skill).not.toMatch(/\bv?20\.5\.(?:\d+|x)\b/iu);
    expect(skill).not.toMatch(/<\/?(?:Protocol|Purpose|Research)/u);
    expect(skill.split(/\s+/u).filter(Boolean).length).toBeLessThan(250);
  });

  it("reproduces every generated package and runtime artifact byte-for-byte", async () => {
    const generated = await generatePublicPluginRuntime();
    for (const artifact of generated.artifacts) {
      expect(await readFile(rootFile(artifact.path), "utf8"), artifact.path)
        .toBe(artifact.text);
    }
    expect(generated.manifest.profiles.legacy.operation_ids).toHaveLength(27);
    expect(generated.manifest.profiles["standard-v2"].operation_ids).toHaveLength(28);
    expect(generated.manifest.profiles.gemini.operation_ids).toHaveLength(22);
  });

  it("packages canonical operational references exactly and excludes private source locators", async () => {
    for (const [source, packaged] of [
      ["project/PROJECT_INSTRUCTIONS.md", "skills/askrigor/references/PROJECT_INSTRUCTIONS.md"],
      ["project/FORUM_SIGNAL_MODULE.md", "skills/askrigor/references/FORUM_SIGNAL_MODULE.md"],
      ["project/PUBLIC_PLUGIN_ADAPTER.md", "skills/askrigor/references/PUBLIC_PLUGIN_ADAPTER.md"],
      ["project/public-runtime-bindings.json", "skills/askrigor/references/public-runtime-bindings.json"]
    ] as const) {
      expect(await readFile(rootFile(packaged))).toEqual(await readFile(rootFile(source)));
    }
    const packageText = await Promise.all([
      "skills/askrigor/SKILL.md",
      "skills/askrigor/MCP_INITIALIZATION.md",
      "skills/askrigor/public-runtime-source-manifest.json",
      "skills/askrigor/references/PROJECT_INSTRUCTIONS.md",
      "skills/askrigor/references/FORUM_SIGNAL_MODULE.md",
      "skills/askrigor/references/PUBLIC_PLUGIN_ADAPTER.md",
      "skills/askrigor/references/public-runtime-bindings.json"
    ].map((candidate) => readFile(rootFile(candidate), "utf8")));
    expect(packageText.join("\n")).not.toContain("chatgpt.com/c/");
  });
});
