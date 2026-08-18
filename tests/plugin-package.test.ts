import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const EXPECTED_SKILL_FRONTMATTER = `---
name: askrigor
description: Execute AskRigor research workflows by loading the canonical protocol, selecting read-only research tools, preserving provenance and access gaps, and auditing completion before synthesis.
---`;

function sectionBetween(document: string, heading: string, nextHeading: string): string {
  const start = document.indexOf(heading);
  const end = document.indexOf(nextHeading, start + heading.length);
  if (start === -1 || end === -1) {
    throw new Error(`Expected ${heading} before ${nextHeading}`);
  }
  return document.slice(start, end);
}

function expectFragmentsInOrder(document: string, fragments: string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = document.indexOf(fragment, cursor + 1);
    expect(next, `Expected ordered fragment: ${fragment}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe("AskRigor plugin package", () => {
  it("contains only the planned plugin and skill entrypoints", async () => {
    expect(await readdir(rootFile(".codex-plugin"))).toEqual(["plugin.json"]);
    expect(await readdir(rootFile("skills/askrigor"))).toEqual(["SKILL.md"]);

    const ignored = await readFile(rootFile(".gitignore"), "utf8");
    expect(ignored.split(/\r?\n/)).toContain(".app.json");
  });

  it("publishes the ingestion-valid read-only manifest without local app wiring", async () => {
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
      author: { name: "AskRigor" },
      interface: {
        displayName: "AskRigor",
        shortDescription: "Auditable research retrieval",
        longDescription:
          "Rigorous health and research workflows with deterministic, auditable source retrieval and explicit access boundaries.",
        developerName: "AskRigor",
        category: "Productivity",
        capabilities: ["Read"],
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

  it("uses the exact planned skill frontmatter without embedding the protocol", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");

    expect(skill.startsWith(`${EXPECTED_SKILL_FRONTMATTER}\n`)).toBe(true);
    expect(skill).not.toMatch(/\bv?20\.5\.(?:\d+|x)\b/i);
    expect(skill).not.toMatch(/<\/?(?:Protocol|Purpose|Research)/);
    expect(skill.split(/\s+/).filter(Boolean).length).toBeLessThan(500);
  });

  it("routes every AskRigor invocation through Universal first and applies the exact HRP boundary", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const gate = sectionBetween(skill, "## Protocol gate", "## Research workflow");

    expect(gate).toContain("For every AskRigor invocation, load and verify Universal first.");
    expectFragmentsInOrder(gate, [
      "Call `get_protocol_manifest` with `protocol: \"universal\"`.",
      "Call `verify_protocol_integrity` with the manifest's returned SHA-256 digest.",
      "Call `load_protocol` with `protocol: \"universal\"` and read the complete canonical text.",
      "Use the activation boundary in that loaded Universal text."
    ]);
    expect(gate).toContain(
      "HRP applies to every health or research task unless it is both very simple and genuinely uncontroversial."
    );
    expect(gate).toContain("Both exception conditions are required.");
    expect(gate).toContain(
      "If applicability is genuinely unclear, ask before answering the substantive research question."
    );
    expect(gate).toContain(
      "When HRP applies, complete the same manifest → integrity verification → full-load sequence for `protocol: \"hrp\"` before substantive analysis."
    );
  });

  it("uses HRP precedence with compatible Universal supplementation and one completion ledger", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const gate = sectionBetween(skill, "## Protocol gate", "## Research workflow");

    expect(gate).toContain(
      "Apply both protocols: HRP governs the task and takes precedence wherever their requirements conflict; Universal continues to supply compatible requirements."
    );
    expect(gate).toContain(
      "Use HRP's research-orchestration and approval gate; do not run a second Universal preflight."
    );
    expect(gate).toContain("Build one applicability ledger from the complete operative texts.");
    expectFragmentsInOrder(gate, [
      "Call `get_protocol_manifest` with `protocol: \"universal\"`.",
      "Call `verify_protocol_integrity` with the manifest's returned SHA-256 digest.",
      "Call `load_protocol` with `protocol: \"universal\"` and read the complete canonical text.",
      "Use the activation boundary in that loaded Universal text.",
      "When HRP applies, complete the same manifest → integrity verification → full-load sequence for `protocol: \"hrp\"` before substantive analysis.",
      "Build one applicability ledger from the complete operative texts.",
      "Do not claim compliance until every applicable module and completion check in that ledger has passed."
    ]);
  });

  it("preserves access states, complete YouTube retrieval, and the non-medical MCP boundary", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const accessParagraph = skill
      .split(/\n\s*\n/)
      .find((paragraph) =>
        paragraph.startsWith("Preserve every returned `access_status` literally:")
      );
    expect(accessParagraph).toBeDefined();
    const expectedStatuses = [
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
    ];
    const actualStatuses = [...accessParagraph!.matchAll(/`([a-z_]+)`/g)].map(
      ([, status]) => status
    );
    expect(actualStatuses).toEqual(["access_status", ...expectedStatuses]);
    expect(accessParagraph).toContain(
      "Never convert a retrieval failure or access gap into negative evidence."
    );
    expect(accessParagraph).toContain(
      "Distinguish an exhausted zero-result search from an unsuccessful search"
    );

    expect(skill).toContain("`survey_youtube_community`");
    expect(skill).toContain("`audit_youtube_video_community`");
    expect(skill).toContain("could plausibly affect the answer");
    expect(skill).toContain("Before HRP, use the Project router if installed; otherwise require Forum Signal");
    expect(skill).toContain("If uncertain, require it");
    expect(skill).toContain("When required, call `survey_youtube_community`");
    expect(skill).toContain("A strong formal result cannot deselect it");
    expect(skill).toContain("`receipt.synthesis_lock: pass`");
    expect(skill).toContain("`complete_no_candidates`");
    expect(skill).toContain("`completed_with_access_boundary`");
    expect(skill).toContain("`reply_count_mismatches`");
    expect(skill).toContain(
      "Accept `api_visible_complete` only after all top-level pages and all accessible reply pages are exhausted and `reply_count_mismatches` is empty."
    );
    expect(skill).toContain(
      "`api_visible_complete` means API-visible corpus coverage only; it does not include deleted, moderated, private, held-for-review, hidden, otherwise unavailable, or never-posted material."
    );
    expect(skill).toContain("`search_youtube_comments`");
    expect(skill).toContain("query-bounded `partial`");
    expect(skill).toContain("`provider_reported_comments`");
    expect(skill).toContain("`records_retrieved_cumulative`");
    expect(skill).toContain("`records_returned_for_analysis`");
    expect(skill).toContain("`continuation_recommended: true`");
    expect(skill).toContain(
      "`continuation_recommended` is authoritative for immediate automatic resubmission"
    );
    expect(skill).toContain("expected information gain remains positive");
    expect(skill).toContain("`support_not_located`");
    expect(skill).toContain("cannot by itself downgrade the community signal");
    expect(skill).toContain("Videos worth watching");
    for (const explicitRequiredExample of [
      "treatment alternatives",
      "avoiding replacement",
      "avoiding joint replacement",
      "avoiding surgery",
    ]) {
      expect(skill).toContain(explicitRequiredExample);
    }
    expect(skill).toContain("`HRP-complete` and the full-HRP opening require all ledger-required formal retrieval and passing receipts");
    expect(skill).toContain("a passing Forum Signal receipt with no incomplete direction/transfer");
    expect(skill).toContain("every selected video's Action-returned `receipt.synthesis_lock: pass`");

    for (const judgment of [
      "efficacy",
      "safety",
      "causality",
      "forum-signal direction",
      "medical recommendation"
    ]) {
      expect(skill).toContain(judgment);
    }
  });
});
