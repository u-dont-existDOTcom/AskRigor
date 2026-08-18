import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const EXPECTED_SKILL_FRONTMATTER = `---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
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
    const gate = sectionBetween(skill, "## Protocol gate", "## Forum Signal routing");

    expect(gate).toContain("Load and verify Universal first.");
    expectFragmentsInOrder(gate, [
      "Call `get_protocol_manifest` for `protocol: \"universal\"`.",
      "Verify via `verify_protocol_integrity` using its returned SHA-256",
      "Call `load_protocol` for `protocol: \"universal\"`; read all canonical text.",
      "Use Universal's loaded activation boundary."
    ]);
    expect(gate).toContain(
      "HRP applies to every health/research task unless both very simple and genuinely uncontroversial"
    );
    expect(gate).toContain("Both conditions are required");
    expect(gate).toContain(
      "If unclear, ask first."
    );
    expect(gate).toContain(
      "For HRP, repeat that full sequence for `protocol: \"hrp\"` before analysis."
    );
  });

  it("uses HRP precedence with compatible Universal supplementation and one completion ledger", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const gate = sectionBetween(skill, "## Protocol gate", "## Forum Signal routing");

    expect(gate).toContain(
      "HRP wins conflicts; Universal supplies compatible rules."
    );
    expect(gate).toContain(
      "Use HRP orchestration/approval; no second Universal preflight."
    );
    expect(gate).toContain(
      "Build one applicability ledger from the complete operative texts."
    );
    expectFragmentsInOrder(gate, [
      "Call `get_protocol_manifest` for `protocol: \"universal\"`.",
      "Verify via `verify_protocol_integrity` using its returned SHA-256",
      "Call `load_protocol` for `protocol: \"universal\"`; read all canonical text.",
      "Use Universal's loaded activation boundary.",
      "For HRP, repeat that full sequence for `protocol: \"hrp\"` before analysis.",
      "Build one applicability ledger from the complete operative texts.",
      "Execute/audit every triggered module.",
      "Claim compliance only after every applicable check passes",
      "otherwise use an authorized bounded path"
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
    expect(skill).toContain("Use installed Project router before HRP; otherwise require Forum Signal");
    expect(skill).toContain("treatment endorsement/choice/start-defer-sequence");
    expect(skill).toContain("If uncertain, require it");
    expect(skill).toContain("Call `survey_youtube_community`");
    expect(skill).toContain("formal evidence cannot deselect it");
    expect(skill).toContain("each Action receipt's `synthesis_lock`");
    expect(skill).toContain("`complete_no_candidates`");
    expect(skill).toContain("`completed_with_access_boundary`");
    expect(skill).toContain("`reply_count_mismatches`");
    expect(skill).toContain(
      "Accept `api_visible_complete` after exhausting all top-level and accessible reply pages with empty `reply_count_mismatches`."
    );
    expect(skill).toContain(
      "It covers only the API-visible corpus, excluding deleted, moderated, private, held-for-review, hidden, unavailable, or never-posted material."
    );
    expect(skill).toContain("`search_youtube_comments`");
    expect(skill).toContain("query-bounded `partial`");
    expect(skill).toContain("`provider_reported_comments`");
    expect(skill).toContain("`records_retrieved_cumulative`");
    expect(skill).toContain("`records_returned_for_analysis`");
    expect(skill).toContain("`continuation_recommended: true`");
    expect(skill).toContain(
      "continue while `continuation_recommended: true`"
    );
    expect(skill).toContain("expected information gain is positive");
    expect(skill).toContain("`support_not_located`");
    expect(skill).toContain("cannot downgrade observed community signal");
    expect(skill).toContain("preop conservative≠postop rehab");
    expect(skill).toContain("`HRP-complete`/full-HRP opening");
    expect(skill).toContain("Videos worth watching");
    for (const explicitRequiredExample of [
      "treatment alternatives",
      "avoiding replacement",
      "avoiding joint replacement",
      "avoiding surgery",
    ]) {
      expect(skill).toContain(explicitRequiredExample);
    }
    for (const implicitDecisionBoundary of [
      "personal or practical treatment decision",
      "good idea for me",
      "now versus wait or delay",
      "even if alternatives are unstated",
      "population-level",
      "A request to exclude forums limits execution, not applicability",
      "simple definition or terminology",
      "pure chemistry or mechanism with no real-world outcome or safety claim",
      "emergency triage before stabilization",
      "no meaningful user-experience corpus",
    ]) {
      expect(skill).toContain(implicitDecisionBoundary);
    }
    expect(skill).toContain("`HRP-complete`/full-HRP opening need formal retrieval");
    expect(skill).toContain("no unresolved material fingerprint/direction/transfer");

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
