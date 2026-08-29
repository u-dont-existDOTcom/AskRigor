import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertNoProhibitedPersistentKeys,
  livingEvidenceContributionSchema,
  prepareContribution,
  sha256,
  splitMarkdownPreservingBytes,
} from "../packages/evidence-repository/src/index.js";
import { historicalPilotContributions } from "../scripts/living-evidence-pilot-fixtures.mts";

describe("living-evidence persistence contracts", () => {
  it("splits and reconstructs a complete committed AskRigor analysis byte for byte", async () => {
    const report = await readFile(
      new URL("../docs/audits/2026-08-21-unspecified-hip-pain-full-hrp.md", import.meta.url),
      "utf8",
    );
    const sections = splitMarkdownPreservingBytes(report);
    expect(sections.length).toBeGreaterThan(10);
    expect(sections.map(({ content }) => content).join("")).toBe(report);
    expect(sha256(sections.map(({ content }) => content).join(""))).toBe(sha256(report));
    expect(sections.map(({ ordinal }) => ordinal)).toEqual(sections.map((_, index) => index));
  });

  it("never silently truncates large authored analysis text", () => {
    const content = `# Full analysis\n${"substantive analysis sentence. ".repeat(50_000)}`;
    const prepared = prepareContribution({
      schemaVersion: 1,
      idempotencyKey: "unit:large-analysis",
      run: {
        runId: "11111111-1111-4111-a111-111111111111",
        runKind: "live_research",
        startedAt: "2026-08-29T00:00:00.000Z",
        completedAt: "2026-08-29T00:01:00.000Z",
        protocolManifests: [{ name: "test", version: "1", revisionDate: "2026-08-29", sha256: "1".repeat(64) }],
        provenanceNote: "Synthetic unit fixture.",
      },
      topic: { topicId: "22222222-2222-4222-a222-222222222222", canonicalKey: "unit.large", label: "Unit large analysis" },
      source: null,
      analysis: {
        analysisId: "33333333-3333-4333-a333-333333333333",
        versionId: "44444444-4444-4444-a444-444444444444",
        analysisKind: "topic_synthesis",
        relationship: "initial",
        previousVersionId: null,
        captureStatus: "complete_performed_analysis",
        authoredAt: "2026-08-29T00:01:00.000Z",
        coverageStatement: "Complete synthetic analysis.",
        declaredWholeTextSha256: sha256(content),
        sections: [{ ordinal: 0, sectionKey: "000-full", title: "Full", content }],
        domains: [],
        claimCapabilities: [],
        futureAnalysisItems: [],
      },
      receipts: [],
    });
    expect(prepared.wholeText).toBe(content);
    expect(prepared.wholeTextBytes).toBe(Buffer.byteLength(content, "utf8"));
    expect(prepared.wholeTextSha256).toBe(sha256(content));
  });

  it("keeps community-derived text outside the durable formal-evidence pilot fixtures", async () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const contributions = await historicalPilotContributions(root);
    const persistedAnalysisText = contributions
      .flatMap(({ analysis }) => analysis.sections.map(({ content }) => content))
      .join("\n")
      .toLowerCase();
    expect(persistedAnalysisText).not.toContain("youtube");
    expect(persistedAnalysisText).not.toContain("forum signal");
    expect(persistedAnalysisText).not.toContain("community outcomes");
  });

  it("rejects prohibited raw-data keys at any nesting depth", () => {
    expect(() => assertNoProhibitedPersistentKeys({ safe: [{ raw_transcript: "no" }] }))
      .toThrow("PROHIBITED_PERSISTENT_KEY path=$.safe[0].raw_transcript");
    expect(() => assertNoProhibitedPersistentKeys({ details: { rawTranscript: "no" } }))
      .toThrow("PROHIBITED_PERSISTENT_KEY path=$.details.rawTranscript");
    expect(() => assertNoProhibitedPersistentKeys({ rawContentPersisted: false })).not.toThrow();
    expect(() => assertNoProhibitedPersistentKeys({ rawContentPersisted: true }))
      .toThrow("PROHIBITED_PERSISTENT_KEY path=$.rawContentPersisted");
  });

  it("requires contiguous ordered sections and coherent lineage", () => {
    const parsed = livingEvidenceContributionSchema.safeParse({
      schemaVersion: 1,
      idempotencyKey: "unit:invalid",
      run: {
        runId: "11111111-1111-4111-a111-111111111111",
        runKind: "clarification",
        startedAt: "2026-08-29T00:00:00.000Z",
        completedAt: "2026-08-29T00:01:00.000Z",
        protocolManifests: [{ name: "test", version: "1", revisionDate: "2026-08-29", sha256: "1".repeat(64) }],
        provenanceNote: "Synthetic invalid fixture.",
      },
      topic: { topicId: "22222222-2222-4222-a222-222222222222", canonicalKey: "unit.invalid", label: "Invalid" },
      source: null,
      analysis: {
        analysisId: "33333333-3333-4333-a333-333333333333",
        versionId: "44444444-4444-4444-a444-444444444444",
        analysisKind: "clarification",
        relationship: "clarifies",
        previousVersionId: null,
        captureStatus: "clarification",
        authoredAt: "2026-08-29T00:01:00.000Z",
        coverageStatement: "Invalid fixture.",
        declaredWholeTextSha256: null,
        sections: [{ ordinal: 1, sectionKey: "section", title: "Section", content: "text" }],
        domains: [], claimCapabilities: [], futureAnalysisItems: [],
      },
      receipts: [],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message)).toEqual(expect.arrayContaining([
        "only an initial version may omit its previous version",
        "sections ordinals must be contiguous and begin at zero",
      ]));
    }
  });
});
