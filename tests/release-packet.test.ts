import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createToolInventory } from "../scripts/generate-tool-inventory.mts";

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
  "search_youtube_comments",
  "audit_youtube_community",
  "survey_youtube_community",
  "audit_youtube_video_community"
];

describe("AskRigor public-review packet", () => {
  it("keeps the privacy map explicit about every protocol and retrieval response category", async () => {
    const document = await readFile(rootFile("docs/privacy-data-map.md"), "utf8");

    for (const fragment of [
      "complete canonical protocol text",
      "manifest/integrity outputs",
      "raw_metadata",
      "structured provider error",
      "primary/provider IDs",
      "source URL/title/authors or channel",
      "pagination",
      "limitations",
      "Public YouTube video metadata",
      "public YouTube author/channel IDs",
      "comment text",
      "research question and labeled YouTube queries",
      "corpus SHA-256",
      "deterministic sample",
      "opaque authenticated continuation state",
      "comment identifiers, counters, and rolling corpus digest",
      "one hour",
      "active request only",
      "continuation secret is never returned",
      "no server-side comment corpus or research-session persistence",
      "not persistently stored",
      "aggregate server logs"
    ]) {
      expect(document).toContain(fragment);
    }
  });

  it("keeps the checked inventory byte-for-byte aligned with the source MCP tools/list output", async () => {
    const inventory = await createToolInventory();
    const committedInventory = JSON.parse(
      await readFile(rootFile("docs/tool-inventory-v0.1.0.json"), "utf8")
    );

    expect(committedInventory).toEqual(inventory);
    expect(inventory).toMatchObject({
      generated_from: "MCP tools/list against createAskRigorServer()",
      endpoint: "https://mcp.askrigor.com/mcp"
    });
    expect(inventory.tools.map(({ name }: { name: string }) => name)).toEqual(TOOL_NAMES);
    expect(inventory.tools).toHaveLength(17);
    expect(createHash("sha256").update(JSON.stringify(inventory)).digest("hex")).toBe(
      "f803181f8378a3489c630fde4b4dce49f6beec90c017e670b586d844e40c1c91"
    );

    for (const tool of inventory.tools) {
      expect(tool).toMatchObject({
        description: expect.any(String),
        inputSchema: { type: "object", $schema: "http://json-schema.org/draft-07/schema#" },
        outputSchema: { type: "object", $schema: "http://json-schema.org/draft-07/schema#" },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false
        },
        execution: { taskSupport: "forbidden" }
      });
      expect(tool.title).toBeUndefined();
      expect(tool._meta).toBeUndefined();
      expect(Object.keys(tool).filter((key) => tool[key] !== undefined).sort()).toEqual([
        "annotations", "description", "execution", "inputSchema", "name", "outputSchema"
      ]);
    }

    const audit = inventory.tools.find(({ name }) => name === "audit_youtube_community");
    expect(audit).toMatchObject({
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      outputSchema: {
        properties: {
          receipt: {
            properties: {
              completion_state: { enum: [
                "api_visible_complete",
                "complete_no_candidates",
                "completed_with_access_boundary",
                "incomplete"
              ] },
              synthesis_lock: { enum: ["pass", "block"] },
              query_bounded_comments_used_as_corpus: { const: false }
            }
          }
        }
      }
    });
    const survey = inventory.tools.find(({ name }) => name === "survey_youtube_community");
    expect(survey).toMatchObject({
      outputSchema: {
        properties: {
          candidates: {
            items: {
              properties: {
                canonical_url: { type: "string", format: "uri" },
                channel_title: { type: "string" },
                provider_reported_comments: {
                  type: "string",
                  pattern: "^(0|[1-9][0-9]*)$"
                }
              }
            }
          }
        }
      }
    });
    const videoAudit = inventory.tools.find(({ name }) =>
      name === "audit_youtube_video_community"
    );
    expect(videoAudit).toMatchObject({
      outputSchema: {
        properties: {
          provider_reported_comments: { type: "string" },
          channel_title: { type: "string" },
          records_retrieved_cumulative: { type: "integer" },
          records_returned_for_analysis: { type: "integer", maximum: 500 },
          continuation_recommended: { type: "boolean" },
          continuation_token: { type: "string", maxLength: 65536 },
          receipt: {
            properties: { synthesis_lock: { enum: ["pass", "block"] } }
          }
        }
      }
    });
  });

  it("supplies six reproducible positive and three safe negative portal cases", async () => {
    const cases = JSON.parse(
      await readFile(rootFile("docs/public-review-cases-v0.1.0.json"), "utf8")
    ) as { positive: PositiveReviewCase[]; negative: NegativeReviewCase[] };

    expect(cases.positive).toHaveLength(6);
    expect(cases.negative).toHaveLength(3);
    expect(cases.positive.map(({ id }) => id)).toEqual([
      "positive-1", "positive-2", "positive-3", "positive-4", "positive-5",
      "positive-6"
    ]);
    expect(cases.negative.map(({ id }) => id)).toEqual([
      "negative-1", "negative-2", "negative-3"
    ]);
    expect(cases.positive.map(({ expected_workflow }) =>
      expected_workflow.map(({ tool }) => tool)
    )).toEqual([
      ["get_protocol_manifest", "verify_protocol_integrity", "load_protocol"],
      ["fetch_pubmed_record"],
      ["fetch_clinical_trial"],
      ["check_retraction_status"],
      ["get_youtube_comments"],
      [
        "survey_youtube_community",
        "audit_youtube_video_community",
        "audit_youtube_video_community"
      ]
    ]);
    expect(cases.positive[0].expected_workflow[0].arguments).toEqual({
      protocol: "hrp"
    });
    expect(cases.positive[1].expected_workflow[0].arguments).toEqual({
      pmid: "13054692"
    });
    expect(cases.positive[2].expected_workflow[0].arguments).toEqual({
      nct_id: "NCT04280705"
    });
    expect(cases.positive[4].expected_workflow[0].arguments).toEqual({
      video_id_or_url: "4x1fl67d_Ag",
      include_replies: true
    });
    expect(cases.positive[5].expected_workflow[2].arguments).toEqual({
      continuation_token: "$step_2.continuation_token"
    });
    expect(JSON.stringify(cases)).not.toMatch(/continuation_secret/i);
    expect(cases.negative.map(({ expected_workflow }) => expected_workflow[0].kind)).toEqual([
      "schema_rejection_before_provider_call",
      "explicit_not_found",
      "no_tool_call_for_unsupported_write_or_medical_action"
    ]);
    expect(cases.negative[1].expected_workflow[0]).toMatchObject({
      tool: "get_youtube_video",
      arguments: { video_id_or_url: "00000000000" }
    });
    expect(JSON.stringify(cases)).not.toContain("local-recorded-fixture");
    expect(JSON.stringify(cases)).not.toContain("comments_disabled");
    const positiveYoutubeIds = cases.positive.flatMap(({ expected_workflow }) =>
      expected_workflow.flatMap(({ tool, arguments: args }) =>
        tool.includes("youtube") && typeof args.video_id_or_url === "string"
          ? [args.video_id_or_url]
          : []
      )
    );
    const negativeYoutubeIds = cases.negative.flatMap(({ expected_workflow }) =>
      expected_workflow.flatMap((step) => {
        const args = step.arguments;
        return typeof args?.video_id_or_url === "string" ? [args.video_id_or_url] : [];
      })
    );
    expect(positiveYoutubeIds).toEqual(["4x1fl67d_Ag", "4x1fl67d_Ag"]);
    expect(negativeYoutubeIds).toEqual(["00000000000"]);
    expect(positiveYoutubeIds.some((id) => negativeYoutubeIds.includes(id))).toBe(false);

    for (const testCase of cases.positive) {
      expect(testCase).toMatchObject({
        id: expect.stringMatching(/^positive-\d+$/),
        prompt: expect.stringMatching(/^Use AskRigor to /),
        fixture: { mode: "production-public-input", inputs: expect.any(Object) },
        expected_workflow: expect.any(Array),
        expected_result_shape: { required_fields: expect.any(Array) },
        no_state_change: true
      });
      expect(Object.keys(testCase.fixture.inputs)).not.toHaveLength(0);
      expect(testCase.expected_workflow).not.toHaveLength(0);
      expect(testCase.expected_result_shape.required_fields).not.toHaveLength(0);

      for (const step of testCase.expected_workflow) {
        expect(step.tool).toEqual(expect.stringMatching(/^[a-z_]+$/));
        expect(TOOL_NAMES).toContain(step.tool);
        expect(step.arguments).toEqual(expect.any(Object));
        expect(step.expected_structured_fields).toEqual(expect.any(Array));
        expect(step.expected_structured_fields).not.toHaveLength(0);
      }
    }

    for (const testCase of cases.negative) {
      expect(testCase).toMatchObject({
        id: expect.stringMatching(/^negative-\d+$/),
        prompt: expect.stringMatching(/^Use AskRigor to /),
        fixture: { mode: "production-public-input", inputs: expect.any(Object) },
        expected_workflow: [{ kind: expect.any(String) }],
        expected_result_shape: { required_fields: expect.any(Array) },
        no_state_change: true
      });
      expect(Object.keys(testCase.fixture.inputs)).not.toHaveLength(0);
      expect(testCase.expected_result_shape.required_fields).not.toHaveLength(0);
      expect(testCase.why_plugin_must_not_complete.length).toBeGreaterThan(20);
    }
  });

  it("records the production endpoint, deployed revision, Inspector evidence, and legal submission block", async () => {
    const document = await readFile(rootFile("docs/release-evidence-v0.1.0.md"), "utf8");

    expect(document).toContain("https://mcp.askrigor.com/mcp");
    expect(document).toContain("bb2245f04f6e1f7bfed8d146c92497364d6488f7");
    expect(document).toContain("Fresh public MCP discovery found exactly 15");
    expect(document).toContain("youtube_comment_budget_elapsed_ms");
    expect(document).toContain("synthesis_lock:block");
    expect(document).toContain("HRP 20.5.16 execution-reliability rollout");
    expect(document).toContain("d41e37b13357542c8439ca5199d50eef9eec8aa6ec4beeafbfbbe44213362597");
    expect(document).toContain("Inspector");
    expect(document).toContain("PUBLIC SUBMISSION BLOCKED");
    expect(document).toContain("routine-status presentation regression");
    expect(document).toContain("live-suite-20260811T172130Z-71611");
    expect(document).toContain("5/5 passed");
    expect(document).toContain("youtube-20260811T172256Z");
    expect(document).toContain("15/15 expected outcomes");
    expect(document).toContain("ANSI");
    expect(document).toContain("server-side runtime environment");
    expect(document).toContain("fail-closed server-side secret scan");
    expect(document).toContain("TS2307");
    expect(document).toContain("No provider request occurred");
    expect(document).toContain("askrigor@0.1.0");
    expect(document).toContain("no evidence was published");
    expect(document).toContain(".vite-temp");
    expect(document).toContain("No provider request occurred");
    expect(document).toContain("live-suite-v6-6a9d536b7845");
    expect(document).toContain("Live suite v6 accepted");
    expect(document).toContain("zero skipped");
    expect(document).toContain("provider-test.log.sha256");
    expect(document).toContain("Current fresh live-provider suite");
    expect(document).not.toMatch(/fresh wrapper exit\s+0 is still required/);
    expect(document).toContain(
      "17 passed files, 1 skipped file, 337 passed tests, and 5 guarded live tests skipped",
    );
  });

  it("closes only the verified public-site gate and publishes supported manifest URLs", async () => {
    const [manifestText, privacyMap, reviewChecklist, releaseEvidence, readme] = await Promise.all([
      readFile(rootFile(".codex-plugin/plugin.json"), "utf8"),
      readFile(rootFile("docs/privacy-data-map.md"), "utf8"),
      readFile(rootFile("docs/public-review-checklist.md"), "utf8"),
      readFile(rootFile("docs/release-evidence-v0.1.0.md"), "utf8"),
      readFile(rootFile("README.md"), "utf8")
    ]);
    const manifest = JSON.parse(manifestText);

    expect(manifest.interface).toMatchObject({
      websiteURL: "https://askrigor.com",
      privacyPolicyURL: "https://askrigor.com/privacy",
      termsOfServiceURL: "https://askrigor.com/terms"
    });
    expect(manifest.interface.supportURL).toBeUndefined();

    for (const document of [privacyMap, reviewChecklist, releaseEvidence, readme]) {
      expect(document).toContain("https://askrigor.com/privacy");
      expect(document).toContain("2026-08-12");
      expect(document).toContain("f928b95e29cd");
      expect(document).not.toContain("plain-HTTP unrelated");
      expect(document).not.toContain("Public submission remains blocked by the website");
    }

    for (const fragment of [
      "routine-status presentation regression",
      "portal",
      "domain-verification",
      "Scan Tools",
      "PUBLIC SUBMISSION BLOCKED"
    ]) {
      expect(releaseEvidence).toContain(fragment);
    }
    expect(reviewChecklist).toContain("routine-status presentation");
    expect(reviewChecklist).toContain("Scan Tools");
    expect(releaseEvidence).not.toContain("manifest remains unchanged");
  });
});

interface Fixture {
  mode: "production-public-input";
  inputs: Record<string, unknown>;
}

interface ExpectedResultShape {
  required_fields: string[];
}

interface PositiveWorkflowStep {
  tool: string;
  arguments: Record<string, unknown>;
  expected_structured_fields: string[];
}

interface PositiveReviewCase {
  id: string;
  prompt: string;
  fixture: Fixture;
  expected_workflow: PositiveWorkflowStep[];
  expected_result_shape: ExpectedResultShape;
  no_state_change: boolean;
}

interface NegativeWorkflowStep {
  kind: string;
  arguments?: Record<string, unknown>;
}

interface NegativeReviewCase {
  id: string;
  prompt: string;
  fixture: Fixture;
  expected_workflow: NegativeWorkflowStep[];
  expected_result_shape: ExpectedResultShape;
  no_state_change: boolean;
  why_plugin_must_not_complete: string;
}
