import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const TOOL_NAMES = [
  "get_protocol_manifest",
  "load_protocol",
  "verify_protocol_integrity",
  "search_pubmed",
  "fetch_pubmed_record",
  "search_europe_pmc",
  "search_clinical_trials",
  "fetch_clinical_trial",
  "resolve_doi",
  "check_retraction_status",
  "search_youtube",
  "get_youtube_video",
  "get_youtube_comments",
  "search_youtube_comments"
];

describe("AskRigor public-review packet", () => {
  it("keeps the privacy map explicit about public YouTube identity and comment data", async () => {
    const document = await readFile(rootFile("docs/privacy-data-map.md"), "utf8");

    expect(document).toContain("public YouTube author/channel IDs");
    expect(document).toContain("comment text");
    expect(document).toContain("not persistently stored");
    expect(document).toContain("aggregate server logs");
  });

  it("makes every advertised read-only tool reviewable and supplies the required test set", async () => {
    const document = await readFile(rootFile("docs/public-review-checklist.md"), "utf8");

    for (const toolName of TOOL_NAMES) {
      expect(document).toContain(`\`${toolName}\``);
    }
    expect(document).toContain("`readOnlyHint: true`");
    expect(document).toContain("Five positive test cases");
    expect(document).toContain("Three negative test cases");
    expect(document).toContain("no state change");
  });

  it("records the production endpoint, deployed revision, Inspector evidence, and legal submission block", async () => {
    const document = await readFile(rootFile("docs/release-evidence-v0.1.0.md"), "utf8");

    expect(document).toContain("https://mcp.askrigor.com/mcp");
    expect(document).toContain("8fface584200f6ab824e91e6e50f975019fbf741");
    expect(document).toContain("Inspector");
    expect(document).toContain("PUBLIC SUBMISSION BLOCKED");
    expect(document).toContain("routine-status presentation regression");
  });
});
