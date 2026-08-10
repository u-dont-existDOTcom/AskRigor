import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const EXPECTED_SKILL_FRONTMATTER = `---
name: askrigor
description: Execute AskRigor research workflows by loading the canonical protocol, selecting read-only research tools, preserving provenance and access gaps, and auditing completion before synthesis.
---`;

describe("AskRigor plugin package", () => {
  it("contains only the planned plugin and skill entrypoints", async () => {
    expect(await readdir(rootFile(".codex-plugin"))).toEqual(["plugin.json"]);
    expect(await readdir(rootFile("skills/askrigor"))).toEqual(["SKILL.md"]);

    const ignored = await readFile(rootFile(".gitignore"), "utf8");
    expect(ignored.split(/\r?\n/)).toContain(".app.json");
  });

  it("publishes the exact minimal read-only manifest", async () => {
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
      interface: {
        displayName: "AskRigor",
        shortDescription:
          "Evidence-first research with auditable source retrieval",
        developerName: "AskRigor",
        category: "Productivity",
        capabilities: ["Read"],
        websiteURL: "https://askrigor.com"
      }
    });
  });

  it("uses the exact planned skill frontmatter without embedding the protocol", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");

    expect(skill.startsWith(`${EXPECTED_SKILL_FRONTMATTER}\n`)).toBe(true);
    expect(skill).not.toContain("20.5.14");
    expect(skill).not.toMatch(/<\/?(?:Protocol|Purpose|Research)/);
    expect(skill.split(/\s+/).filter(Boolean).length).toBeLessThan(500);
  });

  it("loads canonical protocols before compliance claims and routes applicable modules", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const manifestIndex = skill.indexOf("`get_protocol_manifest`");
    const loadIndex = skill.indexOf("`load_protocol`");
    const complianceIndex = skill.indexOf("claim protocol compliance");

    expect(manifestIndex).toBeGreaterThan(-1);
    expect(loadIndex).toBeGreaterThan(manifestIndex);
    expect(complianceIndex).toBeGreaterThan(loadIndex);
    expect(skill).toContain("Apply Universal Instructions to every research workflow.");
    expect(skill).toContain(
      "Apply HRP when the request concerns health, medicine, treatment, safety, or other HRP-covered research."
    );
  });

  it("preserves access states, complete YouTube retrieval, and the non-medical MCP boundary", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");

    expect(skill).toContain("Preserve every returned `access_status` literally:");
    for (const status of [
      "complete",
      "api_visible_complete",
      "partial",
      "abstract_only",
      "metadata_only",
      "comments_disabled",
      "inaccessible",
      "rate_limited",
      "not_found",
      "error"
    ]) {
      expect(skill).toContain(`\`${status}\``);
    }

    expect(skill).toContain("`search_youtube`");
    expect(skill).toContain("`get_youtube_video`");
    expect(skill).toContain("`get_youtube_comments`");
    expect(skill).toContain("`include_replies=true`");
    expect(skill).toContain("`reply_count_mismatches`");
    expect(skill).toContain("`api_visible_complete`");
    expect(skill).toContain("`search_youtube_comments`");
    expect(skill).toContain("query-bounded `partial`");

    for (const judgment of [
      "efficacy",
      "safety",
      "causality",
      "forum-signal direction",
      "medical recommendation"
    ]) {
      expect(skill).toContain(judgment);
    }
    expect(skill).toContain(
      "Never convert a retrieval failure or access gap into negative evidence."
    );
  });
});
