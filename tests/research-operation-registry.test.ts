import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createToolInventory } from "../scripts/generate-tool-inventory.mts";

const EXPECTED_NAMES = [
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
  "search_youtube_comments",
  "audit_youtube_community",
  "survey_youtube_community",
  "audit_youtube_video_community"
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
  it("is the exact frozen 17-operation source without changing the MCP inventory", async () => {
    const researchModule = await import("../apps/research-mcp/src/index.js") as
      Record<string, unknown>;
    const operations = researchModule.RESEARCH_OPERATIONS as
      readonly RegistryEntry[] | undefined;

    expect(operations).toBeDefined();
    expect(operations!.map(({ name }) => name)).toEqual(EXPECTED_NAMES);
    expect(new Set(operations!.map(({ actionPath }) => actionPath)).size).toBe(17);
    expect(operations!.every(({ name, actionPath, annotations }) =>
      actionPath === `/actions/research/${name}` &&
      annotations.readOnlyHint === true &&
      annotations.destructiveHint === false &&
      annotations.openWorldHint === false
    )).toBe(true);

    const inventory = await createToolInventory();
    expect(inventory.tools.map(({ name }) => name)).toEqual(EXPECTED_NAMES);
    expect(inventory.tools).toHaveLength(17);
    expect(createHash("sha256").update(JSON.stringify(inventory)).digest("hex")).toBe(
      "dbff1edc405982fb58eac6a5b28840ffcf07fd93cad0e55c349f65b2fffcf5e9"
    );
  });
});
