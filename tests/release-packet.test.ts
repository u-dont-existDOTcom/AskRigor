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
  it("pins the Git-capable toolchain required by the protected live runner", async () => {
    const [dockerfile, automation] = await Promise.all([
      readFile(rootFile("Dockerfile.public-review"), "utf8"),
      readFile(rootFile("docs/public-review-automation.md"), "utf8"),
    ]);

    expect(dockerfile).toContain(
      "FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d",
    );
    expect(dockerfile).toContain("ARG GIT_VERSION=1:2.39.5-0+deb12u3");
    expect(dockerfile).toContain('"git=${GIT_VERSION}"');
    expect(dockerfile).toContain("WORKDIR /work");
    expect(automation).toContain("Dockerfile.public-review");
    expect(automation).toContain("Git is required at runtime");
  });

  it("documents the exact lesson data, setup, and rollback boundary", async () => {
    const [setup, privacyMap, privacySite, readme, checklist, openApi, releaseEvidence] = await Promise.all([
      readFile(rootFile("docs/custom-gpt-actions-setup.md"), "utf8"),
      readFile(rootFile("docs/privacy-data-map.md"), "utf8"),
      readFile(rootFile("site/privacy/index.html"), "utf8"),
      readFile(rootFile("README.md"), "utf8"),
      readFile(rootFile("docs/public-review-checklist.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-action-openapi.json"), "utf8"),
      readFile(rootFile("docs/release-evidence-v0.1.0.md"), "utf8"),
    ]);

    const environmentRows = new Map(
      [...setup.matchAll(/^\| `([^`]+)` \| ([^|]+) \|$/gmu)]
        .map((match) => [match[1], match[2]?.trim()]),
    );
    expect(Object.fromEntries(environmentRows)).toEqual({
      ASKRIGOR_ACTIONS_ENABLED: "Exact literal `true` only when ready to accept Actions.",
      ASKRIGOR_RESEARCH_ACTIONS_ENABLED: "Exact literal `true` only when ready to expose public read-only research Actions.",
      ASKRIGOR_YOUTUBE_CONTINUATION_SECRET: "Server-only secret containing at least 32 UTF-8 bytes; required at startup when research Actions are enabled and never returned or logged.",
      ASKRIGOR_ACTIONS_API_KEY: "Dedicated Action Bearer secret; installed only on the server and in the GPT editor authentication control.",
      OPENAI_API_KEY: "Dedicated server-only OpenAI API project key for the privacy check.",
      ASKRIGOR_AI_BUDGET_LEDGER: "Exact absolute path `/var/lib/askrigor-actions/ai-budget.json`.",
      ASKRIGOR_AI_MONTHLY_BUDGET_USD: "Canonical production literal `50.00`; the runtime accepts only exact `50` or `50.00`.",
      ASKRIGOR_GITHUB_APP_ID: "Positive decimal App ID.",
      ASKRIGOR_GITHUB_INSTALLATION_ID: "Positive decimal installation ID.",
      ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64: "Base64-encoded dedicated server-only App private key.",
      ASKRIGOR_LESSONS_REPOSITORY: "Exact private repository name `u-dont-existDOTcom/AskRigor-lessons`.",
    });

    for (const fragment of [
      "$50.00",
      "gpt-5-nano-2025-08-07",
      "API billing is separate from ChatGPT billing",
      "https://mcp.askrigor.com/actions/openapi.json",
      "API Key",
      "Bearer",
      "https://askrigor.com/privacy",
      "Submit this anonymized lesson to improve AskRigor?",
      "docs/custom-gpt-instructions.md",
      "Knowledge: empty",
      "direct `/g/...`",
      "synthetic",
      "ARL-####",
      "npm run lessons:status",
      "Rollback",
      "Key rotation",
      "Existing chats",
      "MCP remains available",
      "Metadata: Read-only",
      "Issues: Read and write",
    ]) expect(setup).toContain(fragment);

    expect(setup).toContain("u-dont-existDOTcom/AskRigor-lessons");
    expect(setup).not.toMatch(/https?:\/\/(?:www\.)?github\.com\//iu);
    expect(setup).not.toMatch(/(?:sk-|gh[opusr]_)[A-Za-z0-9_-]{16,}/u);
    expect(setup).toContain(
      "The server accepts only the fixed privacy model `gpt-5-nano-2025-08-07`; no moving alias is allowed.",
    );

    for (const fragment of [
      "Research retrieval path",
      "Optional lesson path",
      "category",
      "general_lesson",
      "expected_behavior",
      "failure_reason",
      "synthetic_regression_example",
      "evidence_basis",
      "askrigor_version",
      "protocol_identities",
      "consent_scope",
      "submitted",
      "existing_candidate",
      "privacy_rejected",
      "rate_limited",
      "anonymizer_unavailable",
      "github_unavailable",
      "utc_month",
      "monthly_limit_nano_usd",
      "charged_nano_usd",
      "updated_at",
      "anonymous occurrence count",
      "first-seen timestamp",
      "generated comments",
      "observation timestamp",
      "fingerprint",
      "not automatic",
      "joel@askrigor.com",
    ]) expect(privacyMap).toContain(fragment);

    for (const document of [readme, checklist]) {
      expect(document).toContain("lesson Action");
      expect(document).toContain("deployed");
      expect(document).not.toContain("not yet deployed");
      expect(document).toContain("existing chats");
      expect(document).toContain("MCP");
    }
    expect(openApi).not.toContain("AskRigor-lessons");
    expect(openApi).not.toMatch(/https?:\/\/(?:www\.)?github\.com\//iu);

    expect(privacyMap).toContain(
      "The live August 12, 2026 notice at release `f928b95e29cd` was the pre-lesson privacy notice.",
    );
    expect(privacyMap).toContain(
      "The August 13, 2026 lesson notice is live and was reverified before the lesson Action was enabled.",
    );
    expect(privacyMap).not.toContain("publisher-matching public notice is live");
    expect(privacyMap).not.toContain("the notice, rather than this internal map, is the public privacy policy");
    expect(privacySite).toContain("Effective August 16, 2026");
    expect(privacySite).toContain("Optional lesson feedback");
    expect(readme).toContain("The lesson Action is deployed and live-accepted");
    expect(checklist).toContain(
      "The live August 12 policy at release `f928b95e29cd` is the historical pre-lesson notice.",
    );
    expect(checklist).toContain(
      "The August 13 lesson notice is deployed and live-accepted.",
    );
    expect(releaseEvidence).toContain("56d13b73e74c377cfd6d513a5f4ceeec9949e0bf");
  });

  it("records deployed direct acceptance without claiming unfinished Custom GPT UI proof", async () => {
    const [setup, privacyMap, privacySite, readme, index, release, state, acceptance] =
      await Promise.all([
        readFile(rootFile("docs/custom-gpt-actions-setup.md"), "utf8"),
        readFile(rootFile("docs/privacy-data-map.md"), "utf8"),
        readFile(rootFile("site/privacy/index.html"), "utf8"),
        readFile(rootFile("README.md"), "utf8"),
        readFile(rootFile("docs/INDEX.md"), "utf8"),
        readFile(rootFile("docs/release-evidence-v0.1.0.md"), "utf8"),
        readFile(rootFile("project/CODEX-CURRENT-STATE.md"), "utf8"),
        readFile(rootFile("docs/custom-gpt-action-live-acceptance.md"), "utf8")
      ]);

    for (const document of [setup, privacyMap, privacySite, readme, release, state]) {
      expect(document).toContain("ASKRIGOR_RESEARCH_ACTIONS_ENABLED");
      expect(document).toContain("60,000");
      expect(document).toContain("48,000");
    }
    for (const document of [setup, privacyMap, privacySite, readme]) {
      expect(document).toContain("shared");
      expect(document).toContain("transient");
    }
    for (const document of [setup, readme, index, state]) {
      expect(document).toContain("docs/custom-gpt-instructions.md");
      expect(document).toContain("Knowledge");
      expect(document).toContain("empty");
    }
    expect(privacyMap).toContain("protocol identity, digest, byte offset, chunk index, and expiry");
    expect(privacyMap).toContain("no protocol text, health content, or secret");
    expect(privacySite).toContain("Custom GPT Actions");
    expect(privacySite).toContain("public provider metadata and comment text");
    expect(setup).toContain("does not disable lesson capture or MCP");
    expect(setup).toContain("direct `/g/...`");
    expect(release).toContain("DEPLOYED — DIRECT ACCEPTANCE PASSED — GPT UI PENDING");
    expect(release).toContain("6639086a33b44f029c9f8405f69bd06b725e78d0");
    expect(state).toContain("codex/openai-action-schema-live-evidence-2026-08-16");
    expect(state).toContain("Custom GPT editor/UI acceptance remains pending");
    expect(acceptance).toContain("components.schemas");
    expect(acceptance).toContain("201 characters");
    expect(acceptance).toContain("sha256:05225a8210238f8099af90ba5e8525a142e50e04018547f0d0c6186f6d30544d");

    expect((acceptance.match(/^### Case /gmu) ?? [])).toHaveLength(11);
    expect(acceptance).toContain("DIRECT PASS");
    expect(acceptance).toContain("GPT UI pending");
    for (const field of [
      "UTC time", "deployed commit", "deployed image", "OpenAPI SHA-256",
      "instructions SHA-256", "Request class", "Sanitized result", "Limitation"
    ]) expect(acceptance).toContain(field);
    expect(acceptance).toContain("Post-test MCP inventory");
    expect(acceptance).toContain("Protocol chunk coverage");
  });

  it("distinguishes transient research logs from the aggregate lesson budget ledger", async () => {
    const [privacyMap, privacySite] = await Promise.all([
      readFile(rootFile("docs/privacy-data-map.md"), "utf8"),
      readFile(rootFile("site/privacy/index.html"), "utf8"),
    ]);

    expect(privacyMap).toContain(
      "The application does not emit or store request-body logs, response-body logs, candidate-content logs, or a dedicated application access log; its only log output is the startup line.",
    );
    expect(privacyMap).toContain(
      "The ledger's four aggregate data values are UTC month, monthly limit, charged nano-USD, and update time; a non-content schema version is also stored.",
    );
    expect(privacyMap).toContain("The ledger contains no candidate or request content.");
    expect(privacyMap).toContain(
      "This application-log boundary coexists with the separately disclosed private GitHub issue storage of accepted generalized candidate fields and anonymous occurrence metadata, and with the aggregate budget ledger.",
    );
    expect(privacyMap).not.toContain("Application and reverse-proxy operational logs omit");
    expect(privacyMap).not.toContain(
      "The application persists no request body, response body, candidate content, or access log",
    );
    expect(privacySite).toContain(
      "Only four aggregate budget data values are retained in that ledger: UTC month, fixed monthly limit, charged nano-USD total, and update time.",
    );
    expect(privacySite).toContain("A non-content schema marker is also stored.");
    expect(privacySite).toContain("The budget ledger contains no candidate or request content.");
    expect(privacySite).toContain(
      "This log boundary does not change the separately disclosed storage of accepted generalized candidate fields and anonymous occurrence metadata in a private GitHub issue, or the aggregate budget ledger.",
    );
    expect(privacySite).not.toContain("does not persist operational metadata");
  });

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
      "bounded deterministic-sample comment identifiers",
      "bounded reply-parent identifiers with provider-reported versus retrieved reply counts",
      "rolling corpus digest",
      "one hour",
      "active request only",
      "continuation secret is never returned",
      "no server-side comment corpus or research-session persistence",
      "not persistently stored",
      "Infrastructure providers may independently process operational"
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
      "dbff1edc405982fb58eac6a5b28840ffcf07fd93cad0e55c349f65b2fffcf5e9"
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
      "explicit_access_boundary",
      "no_tool_call_for_unsupported_write_or_medical_action"
    ]);
    expect(cases.negative[1].expected_workflow[0]).toMatchObject({
      tool: "get_youtube_video",
      arguments: { video_id_or_url: "00000000000" }
    });
    const positive6FixtureInputs = cases.positive[5].fixture.inputs as {
      searches: Array<Record<string, unknown>>;
    };
    const positive6SurveyArguments = cases.positive[5].expected_workflow[0].arguments as {
      searches: Array<Record<string, unknown>>;
    };
    expect(positive6FixtureInputs.searches.every((search) =>
      typeof search.direction === "string" && search.label === undefined
    )).toBe(true);
    expect(positive6SurveyArguments.searches.every((search) =>
      typeof search.direction === "string" && search.label === undefined
    )).toBe(true);
    expect(cases.positive[5].expected_workflow[0].expected_structured_fields)
      .toContain("searches");
    expect(cases.positive[5].expected_workflow[0].expected_structured_fields)
      .not.toContain("queries");
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
    expect(positiveYoutubeIds).toEqual(["4x1fl67d_Ag", "W42rwWD6zjw"]);
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
    expect(document).toContain("Historical ChatGPT release finding");
    expect(document).toContain("Fresh ChatGPT interface acceptance");
    expect(document).toContain("did not reproduce it");
    expect(document).toContain("exact combined card rendering remains a declared product presentation limitation");
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
      "opaque model-receipt release decision",
      "portal",
      "domain-verification",
      "Scan Tools",
      "PUBLIC SUBMISSION BLOCKED"
    ]) {
      expect(releaseEvidence).toContain(fragment);
    }
    expect(reviewChecklist).toContain("Fresh post-deployment ChatGPT interface acceptance");
    expect(reviewChecklist).toContain("routine update/status diagnostic");
    expect(reviewChecklist).toContain("product-card presentation limitation");
    expect(reviewChecklist).not.toContain(
      "Resolve or expressly accept the recorded routine-status presentation regression",
    );
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
