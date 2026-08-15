import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  digestOmittedValue,
  flattenReviewCases,
  inspectStructuredField,
  parseReviewCaseSet,
  resolveStepArguments,
  scanEvidenceSafety,
  selectReviewCases,
  writeEvidenceBundle,
  type PublicReviewReport,
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
