import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  assertReadOnlyInventory,
  digestOmittedValue,
  flattenReviewCases,
  inspectStructuredField,
  McpInputValidationError,
  parseReviewCaseSet,
  resolveStepArguments,
  runDirectCase,
  scanEvidenceSafety,
  selectReviewCases,
  writeEvidenceBundle,
  type McpCallResult,
  type McpSession,
  type McpToolDescriptor,
  type PublicReviewReport,
  type ReviewCase,
  type SafeInventoryEvidence,
} from "../scripts/public-review-eval-lib.mts";

const minimalPositiveCase = {
  id: "positive-1",
  prompt: "Use AskRigor.",
  fixture: {
    mode: "production-public-input",
    inputs: { protocol: "hrp" },
  },
  expected_workflow: [{
    tool: "get_protocol_manifest",
    arguments: { protocol: "hrp" },
    expected_structured_fields: ["manifest.sha256"],
  }],
  expected_result_shape: { required_fields: ["verified"] },
  no_state_change: true,
} as const;

const completeSafeReportFixture: PublicReviewReport = {
  schema_version: "askrigor-public-review-eval/v1",
  run_id: "20260815T070000.000Z-abcdef12",
  repository: { commit: "a".repeat(40), dirty: false },
  case_file: {
    path: "docs/public-review-cases-v0.1.0.json",
    sha256: "b".repeat(64),
  },
  endpoint_origin: "https://mcp.askrigor.com",
  model: { requested: "chat-latest", returned: ["chat-latest-2026-08-01"] },
  started_at: "2026-08-15T07:00:00.000Z",
  finished_at: "2026-08-15T07:01:00.000Z",
  inventory: {
    tool_names: ["get_protocol_manifest"],
    ordered_names_sha256: "c".repeat(64),
    read_only_verified: true,
  },
  cases: [],
  usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
  automated_result: "pass",
};

const readOnlyToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const readOnlyInventoryFixture: SafeInventoryEvidence = {
  tool_names: [
    "get_protocol_manifest",
    "verify_protocol_integrity",
    "load_protocol",
    "fetch_pubmed_record",
    "get_youtube_video",
    "survey_youtube_community",
    "audit_youtube_video_community",
  ],
  ordered_names_sha256: "d".repeat(64),
  read_only_verified: true,
};

describe("public review case contracts", () => {
  it("rejects duplicate IDs across positive and negative groups", () => {
    expect(() => parseReviewCaseSet({
      positive: [minimalPositiveCase],
      negative: [{
        ...minimalPositiveCase,
        why_plugin_must_not_complete: "The operation is unavailable.",
      }],
    })).toThrow("duplicate review case id: positive-1");
  });

  it("selects requested IDs in committed case order and rejects unknown IDs", () => {
    const parsed = parseReviewCaseSet({
      positive: [minimalPositiveCase],
      negative: [],
    });

    expect(selectReviewCases(parsed, ["positive-1"]).map(({ id }) => id))
      .toEqual(["positive-1"]);
    expect(() => selectReviewCases(parsed, ["missing-1"]))
      .toThrow("unknown review case id: missing-1");
  });

  it("finds dotted and array fields without returning their values", () => {
    expect(inspectStructuredField({
      data: { comments: [{ comment_id: "c1" }, { comment_id: "c2" }] },
    }, "data.comments[].comment_id")).toEqual({
      present: true,
      type: "string",
      count: 2,
    });
  });

  it("reports a missing member inside a populated array", () => {
    expect(inspectStructuredField({
      candidates: [{ canonical_url: "https://example.test" }, {}],
    }, "candidates[].canonical_url")).toEqual({
      present: false,
      count: 2,
    });
  });

  it("substitutes the exact prior continuation token", () => {
    expect(resolveStepArguments({
      tool: "audit_youtube_video_community",
      arguments: { continuation_token: "$step_2.continuation_token" },
      expected_structured_fields: [],
    }, [{}, { continuation_token: "opaque-token" }])).toEqual({
      continuation_token: "opaque-token",
    });
  });

  it("rejects a missing dynamic continuation reference", () => {
    expect(() => resolveStepArguments({
      tool: "audit_youtube_video_community",
      arguments: { continuation_token: "$step_2.continuation_token" },
      expected_structured_fields: [],
    }, [{}])).toThrow("dynamic argument references missing step 2");
  });

  it("loads the committed six positive and three negative review cases", async () => {
    const value = JSON.parse(await readFile(
      new URL("../docs/public-review-cases-v0.1.0.json", import.meta.url),
      "utf8",
    ));

    const parsed = parseReviewCaseSet(value);

    expect(flattenReviewCases(parsed).map(({ id }) => id)).toEqual([
      "positive-1",
      "positive-2",
      "positive-3",
      "positive-4",
      "positive-5",
      "positive-6",
      "negative-1",
      "negative-2",
      "negative-3",
    ]);
  });
});

describe("public review evidence safety", () => {
  it("stores only a digest and byte count for omitted protocol text", () => {
    expect(digestOmittedValue("<Protocol>private body</Protocol>")).toEqual({
      omitted: true,
      byte_length: 33,
      sha256: "dd0a31f35071f38fe811a83b89b97fedd56ce382201fdec84ec34551173c2b92",
    });
  });

  it("rejects a report containing the active API key without echoing it", () => {
    const activeSecret = "key-live-secret-value";

    expect(() => scanEvidenceSafety(
      { ...completeSafeReportFixture, run_id: activeSecret },
      activeSecret,
    )).toThrow("evidence contains the active secret at $.run_id");
  });

  it("rejects raw protocol XML and continuation tokens", () => {
    expect(() => scanEvidenceSafety({
      ...completeSafeReportFixture,
      cases: [{ continuation_token: "opaque-token" }] as never,
    })).toThrow("evidence contains a forbidden key at $.cases[0].continuation_token");

    expect(() => scanEvidenceSafety({
      ...completeSafeReportFixture,
      cases: [{ note: "<?xml version='1.0'?><Protocol />" }] as never,
    })).toThrow("evidence contains protocol XML at $.cases[0].note");
  });

  it("writes private JSON, Markdown, and a verifiable SHA-256 manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "askrigor-review-"));
    try {
      const paths = await writeEvidenceBundle({
        outputRoot: root,
        report: completeSafeReportFixture,
        activeSecret: "not-present-secret",
      });

      expect(JSON.parse(await readFile(paths.reportJson, "utf8")))
        .toEqual(completeSafeReportFixture);
      expect(await readFile(paths.summaryMarkdown, "utf8"))
        .toContain("Automated result: PASS");
      expect((await stat(paths.reportJson)).mode & 0o777).toBe(0o600);
      expect((await stat(paths.summaryMarkdown)).mode & 0o777).toBe(0o600);

      const manifestLines = (await readFile(paths.sha256Manifest, "utf8"))
        .trim()
        .split("\n");
      expect(manifestLines).toHaveLength(2);
      for (const line of manifestLines) {
        const match = /^([a-f0-9]{64})  (report\.json|SUMMARY\.md)$/.exec(line);
        expect(match).not.toBeNull();
        const filePath = match?.[2] === "report.json"
          ? paths.reportJson
          : paths.summaryMarkdown;
        const actual = createHash("sha256")
          .update(await readFile(filePath))
          .digest("hex");
        expect(match?.[1]).toBe(actual);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("direct public MCP review", () => {
  it("accepts only an entirely read-only, non-destructive inventory", () => {
    expect(assertReadOnlyInventory([
      { name: "get_protocol_manifest", annotations: readOnlyToolAnnotations },
      { name: "fetch_pubmed_record", annotations: readOnlyToolAnnotations },
    ])).toEqual({
      tool_names: ["get_protocol_manifest", "fetch_pubmed_record"],
      ordered_names_sha256:
        "8f5c31917ae5f003e0ca2907e95a79596d55f37a091c2084443958394e3ee333",
      read_only_verified: true,
    });

    expect(() => assertReadOnlyInventory([{
      name: "mutable_tool",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    }])).toThrow("tool mutable_tool is not strictly read-only");
  });

  it("passes the exact three-step protocol workflow without retaining protocol text", async () => {
    const expectedSha = "d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242";
    const protocolCase = makeReviewCase({
      id: "positive-1",
      expected_workflow: [
        {
          tool: "get_protocol_manifest",
          arguments: { protocol: "hrp" },
          expected_structured_fields: ["ok", "protocol", "manifest.version", "manifest.sha256"],
        },
        {
          tool: "verify_protocol_integrity",
          arguments: { protocol: "hrp", expected_sha256: expectedSha },
          expected_structured_fields: ["ok", "protocol", "verified", "manifest.sha256"],
        },
        {
          tool: "load_protocol",
          arguments: { protocol: "hrp" },
          expected_structured_fields: ["ok", "protocol", "manifest.sha256", "text"],
        },
      ],
      fixtureInputs: { protocol: "hrp", expected_sha256: expectedSha },
    });
    const manifest = {
      ok: true,
      protocol: "hrp",
      manifest: { version: "20.5.17", sha256: expectedSha },
    };
    const session = scriptedMcpSession([
      {
        name: "get_protocol_manifest",
        arguments: { protocol: "hrp" },
        result: { structuredContent: manifest },
      },
      {
        name: "verify_protocol_integrity",
        arguments: { protocol: "hrp", expected_sha256: expectedSha },
        result: { structuredContent: { ...manifest, verified: true } },
      },
      {
        name: "load_protocol",
        arguments: { protocol: "hrp" },
        result: { structuredContent: { ...manifest, text: "full protocol body" } },
      },
    ]);

    const result = await runDirectCase(
      protocolCase,
      session,
      readOnlyInventoryFixture,
      deterministicClock(),
    );

    expect(result.state).toBe("pass");
    expect(result.calls.map(({ tool }) => tool)).toEqual([
      "get_protocol_manifest",
      "verify_protocol_integrity",
      "load_protocol",
    ]);
    expect(JSON.stringify(result)).not.toContain("full protocol body");
  });

  it("fails a protocol workflow whose returned digest differs from the fixture", async () => {
    const reviewCase = makeReviewCase({
      id: "positive-1",
      expected_workflow: [{
        tool: "get_protocol_manifest",
        arguments: { protocol: "hrp" },
        expected_structured_fields: ["manifest.sha256"],
      }],
      fixtureInputs: { protocol: "hrp", expected_sha256: "a".repeat(64) },
    });
    const session = scriptedMcpSession([{
      name: "get_protocol_manifest",
      arguments: { protocol: "hrp" },
      result: { structuredContent: { manifest: { sha256: "b".repeat(64) } } },
    }]);

    const result = await runDirectCase(
      reviewCase,
      session,
      readOnlyInventoryFixture,
      deterministicClock(),
    );

    expect(result).toMatchObject({ state: "fail", failure_class: "provider_result" });
  });

  it("uses the exact in-memory continuation token and stores only its digest", async () => {
    const value = JSON.parse(await readFile(
      new URL("../docs/public-review-cases-v0.1.0.json", import.meta.url),
      "utf8",
    ));
    const reviewCase = parseReviewCaseSet(value).positive[5];
    const token = "authenticated-continuation-token";
    const session = scriptedMcpSession([
      {
        name: "survey_youtube_community",
        arguments: reviewCase.expected_workflow[0].arguments ?? {},
        result: { structuredContent: surveyResultFixture() },
      },
      {
        name: "audit_youtube_video_community",
        arguments: reviewCase.expected_workflow[1].arguments ?? {},
        result: { structuredContent: auditResultFixture({
          continuation_recommended: true,
          continuation_token: token,
          completion_state: "partial",
        }) },
      },
      {
        name: "audit_youtube_video_community",
        arguments: { continuation_token: token },
        result: { structuredContent: auditResultFixture({
          continuation_recommended: false,
          completion_state: "complete",
          sample: [],
        }) },
      },
    ]);

    const result = await runDirectCase(
      reviewCase,
      session,
      readOnlyInventoryFixture,
      deterministicClock(),
    );

    expect(result.state).toBe("pass");
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result.calls[2].arguments).toEqual({
      continuation_token_omitted: digestOmittedValue(token),
    });
  });

  it("passes only an input-schema rejection for invalid PMID zero", async () => {
    const reviewCase = makeNegativeCase({
      id: "negative-1",
      kind: "schema_rejection_before_provider_call",
      tool: "fetch_pubmed_record",
      arguments: { pmid: "0" },
    });
    const session = scriptedMcpSession([{
      name: "fetch_pubmed_record",
      arguments: { pmid: "0" },
      error: new McpInputValidationError("invalid MCP tool arguments"),
    }]);

    const result = await runDirectCase(
      reviewCase,
      session,
      readOnlyInventoryFixture,
      deterministicClock(),
    );

    expect(result).toMatchObject({ state: "pass", calls: [] });
    expect(JSON.stringify(result)).not.toContain("invalid MCP tool arguments");
  });

  it("requires an explicit empty YouTube not-found envelope", async () => {
    const reviewCase = makeNegativeCase({
      id: "negative-2",
      kind: "explicit_not_found",
      tool: "get_youtube_video",
      arguments: { video_id_or_url: "00000000000" },
    });
    const session = scriptedMcpSession([{
      name: "get_youtube_video",
      arguments: { video_id_or_url: "00000000000" },
      result: {
        structuredContent: {
          provider: "youtube",
          access_status: "not_found",
          data: {},
        },
      },
    }]);

    const result = await runDirectCase(
      reviewCase,
      session,
      readOnlyInventoryFixture,
      deterministicClock(),
    );

    expect(result.state).toBe("pass");
  });

  it("fails a not-found envelope that contains fallback data", async () => {
    const reviewCase = makeNegativeCase({
      id: "negative-2",
      kind: "explicit_not_found",
      tool: "get_youtube_video",
      arguments: { video_id_or_url: "00000000000" },
    });
    const session = scriptedMcpSession([{
      name: "get_youtube_video",
      arguments: { video_id_or_url: "00000000000" },
      result: {
        structuredContent: {
          provider: "youtube",
          access_status: "not_found",
          data: { scraped_title: "fallback" },
        },
      },
    }]);

    const result = await runDirectCase(
      reviewCase,
      session,
      readOnlyInventoryFixture,
      deterministicClock(),
    );

    expect(result).toMatchObject({ state: "fail", failure_class: "provider_result" });
  });

  it("passes unsupported actions only when every requested operation is absent", async () => {
    const reviewCase = makeNegativeCase({
      id: "negative-3",
      kind: "no_tool_call_for_unsupported_write_or_medical_action",
      toolsExpectedNotToExist: [
        "post_youtube_comment",
        "update_clinical_trial",
        "recommend_treatment",
      ],
    });
    const session: McpSession = {
      async listTools() {
        return { tools: [] };
      },
      async callTool() {
        throw new Error("no MCP call was expected");
      },
    };

    const result = await runDirectCase(
      reviewCase,
      session,
      readOnlyInventoryFixture,
      deterministicClock(),
    );

    expect(result).toMatchObject({ state: "pass", calls: [] });
  });
});

function makeReviewCase(options: {
  id: string;
  expected_workflow: ReviewCase["expected_workflow"];
  fixtureInputs?: Record<string, unknown>;
}): ReviewCase {
  return {
    group: "positive",
    id: options.id,
    prompt: "Use AskRigor.",
    fixture: {
      mode: "production-public-input",
      inputs: options.fixtureInputs ?? {},
    },
    expected_workflow: options.expected_workflow,
    expected_result_shape: { required_fields: ["bounded result"] },
    no_state_change: true,
  };
}

function makeNegativeCase(options: {
  id: string;
  kind: NonNullable<ReviewCase["expected_workflow"][number]["kind"]>;
  tool?: string;
  arguments?: Record<string, unknown>;
  toolsExpectedNotToExist?: string[];
}): ReviewCase {
  return {
    group: "negative",
    id: options.id,
    prompt: "Use AskRigor.",
    fixture: { mode: "production-public-input", inputs: options.arguments ?? {} },
    expected_workflow: [{
      kind: options.kind,
      tool: options.tool,
      arguments: options.arguments,
      tools_expected_not_to_exist: options.toolsExpectedNotToExist,
    }],
    expected_result_shape: { required_fields: ["bounded negative result"] },
    no_state_change: true,
    why_plugin_must_not_complete: "The requested operation must fail closed.",
  };
}

function scriptedMcpSession(script: Array<{
  name: string;
  arguments: Record<string, unknown>;
  result?: McpCallResult;
  error?: Error;
}>): McpSession {
  let index = 0;
  return {
    async listTools(): Promise<{ tools: McpToolDescriptor[] }> {
      return { tools: [] };
    },
    async callTool(input): Promise<McpCallResult> {
      const expected = script[index++];
      if (expected === undefined) throw new Error(`unexpected MCP call: ${input.name}`);
      expect(input).toEqual({ name: expected.name, arguments: expected.arguments });
      if (expected.error !== undefined) throw expected.error;
      return expected.result ?? {};
    },
  };
}

function deterministicClock(): () => number {
  let time = 1_000;
  return () => {
    const current = time;
    time += 10;
    return current;
  };
}

function surveyResultFixture(): Record<string, unknown> {
  return {
    provider: "youtube",
    record_type: "youtube_community_survey",
    research_question: "Which approaches improve pain or function?",
    queries: [],
    candidates: [{
      canonical_url: "https://www.youtube.com/watch?v=4x1fl67d_Ag",
      title: "Hip osteoarthritis experience",
      channel_title: "Public channel",
      published_at: "2020-01-01T00:00:00Z",
      provider_reported_comments: 100,
    }],
    limitations: [],
  };
}

function auditResultFixture(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    provider: "youtube",
    record_type: "youtube_video_community_audit",
    video_id: "4x1fl67d_Ag",
    canonical_url: "https://www.youtube.com/watch?v=4x1fl67d_Ag",
    title: "Hip osteoarthritis experience",
    channel_title: "Public channel",
    published_at: "2020-01-01T00:00:00Z",
    provider_reported_comments: 100,
    records_retrieved_this_call: 50,
    records_retrieved_cumulative: 50,
    records_returned_for_analysis: 50,
    continuation_recommended: false,
    receipt: { completion_state: "complete", synthesis_lock: "pass" },
    ...overrides,
  };
}
