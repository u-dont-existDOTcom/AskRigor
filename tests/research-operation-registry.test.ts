import { describe, expect, it } from "vitest";

import { createToolInventory } from "../scripts/generate-tool-inventory.mts";

const EXPECTED_NAMES = [
  "get_protocol_manifest",
  "load_protocol",
  "verify_protocol_integrity",
  "search_pubmed",
  "fetch_pubmed_record",
  "search_europe_pmc",
  "acquire_open_full_text",
  "continue_open_full_text",
  "validate_study_method_audit",
  "validate_review_method_audit",
  "search_clinical_trials",
  "fetch_clinical_trial",
  "resolve_doi",
  "check_retraction_status",
  "search_youtube",
  "get_youtube_video",
  "get_youtube_comments",
  "search_youtube_comments",
  "audit_youtube_community",
  "survey_youtube_community",
  "audit_youtube_video_community",
  "get_research_frontier",
  "search_research_frontiers",
  "manage_research_access",
  "submit_research_contribution",
  "review_evidence_gap_submissions"
] as const;

interface RegistryEntry {
  name: string;
  actionPath: string;
  annotations: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
}

describe("shared research-operation registry", () => {
  it("is the exact frozen 26-operation source with executable full-text audits", async () => {
    const researchModule = await import("../apps/research-mcp/src/index.js") as
      Record<string, unknown>;
    const operations = researchModule.RESEARCH_OPERATIONS as
      readonly RegistryEntry[] | undefined;

    expect(operations).toBeDefined();
    expect(operations!.map(({ name }) => name)).toEqual(EXPECTED_NAMES);
    expect(new Set(operations!.map(({ actionPath }) => actionPath)).size).toBe(26);
    expect(operations!.every(({ name, actionPath, annotations }) =>
      actionPath === `/actions/research/${name}` &&
      annotations.readOnlyHint === !([
        "manage_research_access",
        "submit_research_contribution",
      ] as string[]).includes(name) &&
      annotations.destructiveHint === false &&
      annotations.openWorldHint === false
    )).toBe(true);

    const inventory = await createToolInventory();
    expect(inventory.tools.map(({ name }) => name)).toEqual(EXPECTED_NAMES);
    expect(inventory.tools).toHaveLength(26);
  });
});
