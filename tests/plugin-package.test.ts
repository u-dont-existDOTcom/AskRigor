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
      author: { name: "Mayan Roots LLC" },
      interface: {
        displayName: "AskRigor",
        shortDescription: "Auditable research retrieval",
        longDescription:
          "Rigorous health and research workflows with deterministic, auditable source retrieval and explicit access boundaries.",
        developerName: "Mayan Roots LLC",
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
    expect(skill.split(/\s+/).filter(Boolean).length).toBeLessThan(700);
  });

  it("routes every AskRigor invocation through Universal first and applies the exact HRP boundary", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const gate = sectionBetween(skill, "## Protocol gate", "## Forum Signal routing");

    expect(gate).toContain("Load Universal first:");
    expectFragmentsInOrder(gate, [
      "`get_protocol_manifest`",
      "`verify_protocol_integrity`",
      "every `load_protocol` chunk",
      "Use its activation boundary."
    ]);
    expect(gate).toContain(
      "HRP applies unless the health/research task is both very simple and genuinely uncontroversial"
    );
    expect(gate).toContain("if unclear, ask");
    expect(gate).toContain(
      "For HRP repeat the sequence with `protocol: \"hrp\"`."
    );
  });

  it("uses HRP precedence with compatible Universal supplementation and one completion ledger", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const gate = sectionBetween(skill, "## Protocol gate", "## Forum Signal routing");

    expect(gate).toContain(
      "HRP wins conflicts; Universal supplies compatible rules."
    );
    expect(gate).toContain("Use one orchestration/approval and applicability ledger.");
    expectFragmentsInOrder(gate, [
      "`get_protocol_manifest`",
      "`verify_protocol_integrity`",
      "every `load_protocol` chunk",
      "Use its activation boundary.",
      "For HRP repeat the sequence",
      "Use one orchestration/approval and applicability ledger.",
      "Execute every triggered module",
      "claim compliance only after all checks pass",
      "otherwise use an authorized bounded path"
    ]);
  });

  it("preserves access states, complete YouTube retrieval, and the non-medical MCP boundary", async () => {
    const skill = await readFile(rootFile("skills/askrigor/SKILL.md"), "utf8");
    const accessParagraph = skill
      .split(/\n\s*\n/)
      .find((paragraph) =>
        paragraph.startsWith("Internally preserve exact `access_status`:")
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
      "Failure/access gaps are not negative evidence"
    );
    expect(accessParagraph).toContain(
      "distinguish exhausted zero results from failed search"
    );

    expect(skill).toContain("`survey_youtube_community`");
    expect(skill).toContain("`audit_youtube_video_community`");
    expect(skill).toContain("firsthand evidence could affect the answer");
    expect(skill).toContain("Use installed Project router before HRP; otherwise require Forum Signal");
    expect(skill).toContain("endorsement/choice/start-defer-sequence");
    expect(skill).toContain("If uncertain, require it");
    expect(skill).toContain("call `survey_youtube_community`");
    expect(skill).toContain("formal evidence cannot deselect it");
    expect(skill).toContain("consume its coverage receipt");
    expect(skill).toContain("opaque Action handle");
    expect(skill).toContain("contiguous first-to-exhausted chain");
    expect(skill).toContain("caller corpus-size/scope labels cannot waive them");
    expect(skill).toContain("If `get_youtube_transcript` is unavailable");
    expect(skill).toContain("`transcript_tool_unavailable`");
    expect(skill).toContain("never call an undeclared tool");
    expect(skill).toContain("Accept `api_visible_complete` only after all accessible top-level/reply pages");
    expect(skill).toContain(
      "it excludes deleted, moderated, private, hidden, unavailable, and never-posted material"
    );
    expect(skill).toContain("`search_youtube_comments`");
    expect(skill).toContain("query-bounded `partial`");
    expect(skill).toContain("`continuation_recommended: true`");
    expect(skill).toContain(
      "continue while `continuation_recommended: true`"
    );
    expect(skill).toContain("while information gain is positive");
    expect(skill).toContain("`support_not_located`");
    expect(skill).toContain("gaps cannot erase signal");
    expect(skill).toContain("and pre-/postoperative care stage");
    expect(skill).toContain(
      "Full HRP needs all locks, audits, formal returns, and transfers resolved"
    );
    expect(skill).toContain("Videos worth watching");
    for (const explicitRequiredExample of [
      "treatment alternatives",
      "avoiding replacement",
      "joint replacement",
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
    expect(skill).toContain("transfers resolved");
    for (const coverageRule of [
      "classes before video selection",
      "Never pool “exercise,” PT, diet, injections, or conservative care",
      "Planning heuristics, not quotas",
      "cannot establish broad coverage",
      "`assess_treatment_landscape_coverage`",
      "`assessor_tool_unavailable`",
      "Keep selection, video-depth, and overall locks separate",
      "bounded non-ranking output",
      "Videos actually audited",
      "`program not described`"
    ]) {
      expect(skill).toContain(coverageRule);
    }

    for (const judgment of [
      "efficacy",
      "safety",
      "causality",
      "recommendation"
    ]) {
      expect(skill).toContain(judgment);
    }
  });
});
