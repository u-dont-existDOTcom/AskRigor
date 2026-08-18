import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { createToolInventory } from "../scripts/generate-tool-inventory.mts";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const sectionBetween = (document: string, startHeading: string, endHeading: string) => {
  const start = document.indexOf(startHeading);
  const end = document.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) {
    throw new Error(`Missing section boundary: ${startHeading} -> ${endHeading}`);
  }
  return document.slice(start, end);
};

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
      "gpt-5.4-nano-2026-03-17",
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
      "This boundary applies only to the public Custom GPT",
    ]) expect(setup).toContain(fragment);
    expect(setup).toMatch(
      /does not narrow the\s+plugin, MCP server, or canonical protocols/u,
    );

    expect(setup).toContain("u-dont-existDOTcom/AskRigor-lessons");
    expect(setup).not.toMatch(/https?:\/\/(?:www\.)?github\.com\//iu);
    expect(setup).not.toMatch(/(?:sk-|gh[opusr]_)[A-Za-z0-9_-]{16,}/u);
    expect(setup).toContain(
      "The server accepts only the fixed privacy model\n`gpt-5.4-nano-2026-03-17`; no moving alias is allowed.",
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

  it("records the repaired Custom GPT UI continuation proof without overstating remaining acceptance", async () => {
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
    const releaseStatus = sectionBetween(
      release,
      "## Custom GPT research bridge",
      "## Artifact and endpoint identity",
    );
    const releaseIdentity = sectionBetween(
      release,
      "## Artifact and endpoint identity",
      "## Recorded production validation",
    );
    const deploymentIdentity = sectionBetween(
      acceptance,
      "## Deployment identity",
      "## OpenAI Action importer compatibility deployment",
    );
    const terminalRefetch = sectionBetween(
      acceptance,
      "## YouTube continuation and terminal-refetch release",
      "### Case 1",
    );
    const uiPassedCases = [
      sectionBetween(acceptance, "### Case 1", "### Case 2"),
      sectionBetween(acceptance, "### Case 2", "### Case 3"),
      sectionBetween(acceptance, "### Case 3", "### Case 4"),
      sectionBetween(acceptance, "### Case 4", "### Case 5"),
      sectionBetween(acceptance, "### Case 5", "### Case 6"),
    ];
    const case6 = sectionBetween(acceptance, "### Case 6", "### Case 7");
    const case9 = sectionBetween(acceptance, "### Case 9", "### Case 10");
    const normalizedCase9 = case9.replace(/\s+/gu, " ");
    const case10 = sectionBetween(acceptance, "### Case 10", "### Case 11");
    const normalizedCase10 = case10.replace(/\s+/gu, " ");

    expect(releaseStatus).toContain(
      "DEPLOYED — DIRECT AND GPT UI ACCEPTANCE PASSED; PUBLICATION, LESSON, DUPLICATE, DIRECT GPT URL, AND SHORT DOMAIN PASSED"
    );
    expect(releaseStatus).toMatch(/Product-interface protocol and\s+formal-source cases passed on 2026-08-16/u);
    expect(releaseStatus).toMatch(/The repaired two-call Custom GPT UI retest passed on\s+2026-08-17/u);
    expect(releaseStatus).toContain("Universal `20.5.12`");
    expect(releaseStatus).toContain("Universal `20.5.13` UI load passed");
    expect(releaseStatus).toContain("no lesson was submitted");
    expect(releaseStatus).not.toContain("Custom GPT editor/UI acceptance and");
    expect(terminalRefetch).toMatch(
      /50 valid\s+comment IDs returned HTTP `200` and exactly 50 items/u,
    );
    expect(terminalRefetch).toMatch(
      /51 valid comment IDs\s+returned HTTP `400 invalidFilters` and zero items/u,
    );
    expect(state).toContain("5585a9ca34ce01403044b1085b85d4f2de9783f4");
    expect(state).toContain("d1af238325ee1e0584574e47bbcbe7764d17cf7e");
    expect(state).toContain("ARL-0007");
    expect(state).toContain("905ac22ab42479c15ff0d6385a51de864271f862");
    expect(state).toContain("Universal `20.5.13` Custom GPT UI loading passed");
    expect(state).toContain("lesson-consent shell failed safe");
    expect(state).toContain("May provide tailored medical/health advice");
    expect(state).toMatch(
      /public Custom GPT boundary does not alter the\s+plugin/u,
    );
    expect(state).toContain("This is now deployed direct behavior");
    expect(state).not.toContain("This is candidate behavior, not a production claim");
    expect(acceptance).toContain("components.schemas");
    expect(acceptance).toContain("201 characters");
    expect(acceptance).toContain("66 API-visible records");
    expect(acceptance).toContain("synthesis_lock:block");
    expect(case6).toContain("DIRECT PASS — GPT UI PASS (2026-08-17), INCLUDING REPAIRED TWO-CALL CHAIN");
    expect(case6).toContain("66 records on call one");
    expect(case6).toContain("reached 149 on call two");
    expect(case6).toContain("returned 111 deterministic");
    expect(case6).toContain("completed_with_access_boundary");
    expect(case6).toContain("synthesis without an error or further continuation");
    expect(case6).toContain("replies_reconciled` remained `false");
    expect(uiPassedCases[0]).toContain("GPT UI PASS (2026-08-17)");
    for (const uiPassedCase of uiPassedCases.slice(1)) {
      expect(uiPassedCase).toContain("GPT UI PASS (2026-08-16)");
      expect(uiPassedCase).not.toMatch(/GPT UI (?:RETEST )?pending/u);
    }
    expect(case9).toContain("GPT UI PASS (2026-08-18)");
    expect(normalizedCase9).toContain("canonical consent shell did not appear");
    expect(normalizedCase9).toContain("Submitted successfully. Candidate ID: ARL-0007.");
    expect(case10).toContain("GPT UI PASS (2026-08-18)");
    expect(normalizedCase10).toContain("candidate ARL-0007. Occurrence count: 2.");
    expect(acceptance).toContain("## Completed exact Custom GPT lesson UI sequence");
    expect(acceptance).toContain("Do not repeat the completed protocol-freshness or YouTube acceptance tests");
    expect(acceptance).toContain("complete canonical consent shell from your Custom GPT Instructions");
    expect(acceptance).toContain("Do not call submit_lesson_candidate until I reply");
    expect(acceptance).toContain("May provide tailored medical/health advice");
    expect(acceptance).toContain("action_auth_required");
    expect(acceptance).toContain("public Custom GPT only");
    expect(acceptance).toContain("reuse exactly the same previously displayed generalized candidate");

    for (const exactIdentity of [
      "d1af238325ee1e0584574e47bbcbe7764d17cf7e",
      "87433b8829da835f1e8c2b1bd5cd613ac14046b6",
      "sha256:8575134332df001ddbbb5b40a041a468cff76b3388b4f6deb267b1c3363998dd",
      "9976fc89f8bb4065e6c46f7fa6cacb49e1a0eb4e526c11ca2ac346bf788fcf51",
      "f9ebc08643d25d3a54590dd885fbbe795f5aa4c0cea1f28a51c21bb7455dc4c4",
      "06ead4ec8e2aeeac99d13e36dc31b7c474a07d3bc61e3638275086daee174cf1",
      "askrigor-research:rollback-d1af238",
      "/opt/askrigor/compose.yaml.rollback-d1af238",
      "sha256:95b86a1135701149c17125d1a5994e41063f868eefd903a38e28b4c09e0f6953",
      "cf2fa82cbe4ba6e6b9ce515e2f260d07dacf09f1df6ac2feb66cfc485f9c69cf",
      "8445662618e432851b127a7f90a21f18d80d1d69c6127e9ca6d22f11ffc2806d",
      "0e166153faf37b3c7b4963fde2ad0b9c02cc5c7a4acd9620446c308c291c8e94",
      "402e369f25a2b27da114c5f018be1c64cc5f8a2ef81983f2588b30c6875438e2",
      "ef4c9845b3e50d3978f718fe10fff64ef53e55a3a4c045e8b1eb389b15bb9aad",
      "b4fd87ccff39e787eefb706257e49f0956b24e40cfb4c4e2fb24035b80b5c6af",
      "3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4",
      "/opt/askrigor/site/releases/56b3dff6d7c3/site",
    ]) {
      expect(deploymentIdentity).toContain(exactIdentity);
    }
    expect(deploymentIdentity).toContain("3 contiguous");
    expect(deploymentIdentity).toContain("98,154 bytes");
    expect(releaseIdentity).toContain("8445662618e432851b127a7f90a21f18d80d1d69c6127e9ca6d22f11ffc2806d");
    expect(releaseIdentity).toContain("no image archive was created");

    expect((acceptance.match(/^### Case /gmu) ?? [])).toHaveLength(11);
    expect(acceptance).toContain("DIRECT PASS");
    expect(acceptance).toContain("GPT UI PASS (2026-08-16)");
    expect(acceptance).toContain("This is **GPT UI FAIL SAFE**");
    for (const field of [
      "UTC time", "deployed commit", "deployed image", "OpenAPI SHA-256",
      "instructions SHA-256", "Request class", "Sanitized result", "Limitation"
    ]) expect(acceptance).toContain(field);
    expect(acceptance).toContain("Post-test MCP inventory");
    expect(acceptance).toContain("Protocol chunk coverage");
  });

  it("records the verified direct GPT URL and reversible short-domain route", async () => {
    const [readme, checklist, release, state, acceptance] = await Promise.all([
      readFile(rootFile("README.md"), "utf8"),
      readFile(rootFile("docs/public-review-checklist.md"), "utf8"),
      readFile(rootFile("docs/release-evidence-v0.1.0.md"), "utf8"),
      readFile(rootFile("project/CODEX-CURRENT-STATE.md"), "utf8"),
      readFile(rootFile("docs/custom-gpt-action-live-acceptance.md"), "utf8"),
    ]);
    const directGptUrl =
      "https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol";

    for (const document of [readme, checklist, release, state, acceptance]) {
      expect(document).toContain(directGptUrl);
    }
    expect(acceptance).toContain("2026-08-18T01:34:40Z");
    expect(acceptance).toContain("HTTP `302`");
    expect(acceptance).toContain(
      "https://chatgpt.com/share/6a641db3-2ab4-83ea-b48f-5393b1f2479f",
    );
    expect(acceptance).toContain("HTTP `200`");

    const currentRemaining = sectionBetween(state, "## Remaining", "## Blockers / unresolved");
    const currentBlockers = sectionBetween(
      state,
      "## Blockers / unresolved",
      "## Evidence / artifacts",
    );
    const currentNextAction = sectionBetween(state, "## Next safe action", "## Recovery rule");
    for (const currentSection of [currentRemaining, currentBlockers, currentNextAction]) {
      expect(currentSection).not.toContain("direct `/g/...` URL remains pending");
      expect(currentSection).not.toContain("before repointing `gpt.askrigor.com`");
    }
    expect(release).not.toContain(
      "PUBLICATION, LESSON, AND DUPLICATE PASSED; DIRECT GPT URL PENDING",
    );
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
      "MCP client-carried continuation state",
      "Custom GPT Action continuation handle map",
      "2,048",
      "16 MiB",
      "process memory",
      "no longer than one hour",
      "no comment text, author identity, provider credential, or protocol text",
      "server restart, expiry, or capacity eviction",
      "single application replica",
      "must not be horizontally scaled",
      "no durable research-session store",
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
