import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  flattenReviewCases,
  inspectStructuredField,
  parseReviewCaseSet,
  resolveStepArguments,
  selectReviewCases,
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
