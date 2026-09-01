import { describe, expect, it } from "vitest";

import {
  createConditionBlindMapping,
  createEvaluatorPacket,
} from "../scripts/prepare-zero-spend-chatgpt-mast-evaluator.mjs";

describe("zero-spend ChatGPT MAST evaluator preparation", () => {
  it("assigns both conditions deterministically to opaque labels", () => {
    const first = createConditionBlindMapping("fixed-seed");
    const second = createConditionBlindMapping("fixed-seed");
    expect(first).toEqual(second);
    expect(first.labels.map(({ label }) => label)).toEqual(["OUTPUT_A", "OUTPUT_B"]);
    expect(first.labels.map(({ condition }) => condition).sort()).toEqual(["BARE", "HRP"]);
  });

  it("keeps condition names out of the evaluator packet", () => {
    const packet = createEvaluatorPacket({
      caseFamilyId: "All001",
      cases: [{ caseId: "All001", prompt: "Synthetic public benchmark case" }],
      rubric: { id: "All001", options: [{ id: 1, score: 1 }] },
      guidance: "synthetic guidance",
      mapping: createConditionBlindMapping("fixed-seed"),
      outputs: { BARE: "bare exact output", HRP: "hrp exact output" },
    });
    const serialized = JSON.stringify(packet);
    expect(serialized).not.toContain('"BARE"');
    expect(serialized).not.toContain('"HRP"');
    expect(packet.randomizedOutputs.map(({ opaqueOutputLabel }) => opaqueOutputLabel))
      .toEqual(["OUTPUT_A", "OUTPUT_B"]);
  });

  it("requires an explicit one-family limitation and rubric-level output shape", () => {
    const packet = createEvaluatorPacket({
      caseFamilyId: "All001",
      cases: [{ caseId: "All001", prompt: "Synthetic public benchmark case" }],
      rubric: { id: "All001", options: [{ id: 1, score: 1 }] },
      guidance: "synthetic guidance",
      mapping: createConditionBlindMapping("fixed-seed"),
      outputs: { BARE: "first", HRP: "second" },
    });
    expect(packet.operationalLimitation).toContain("not an official MAST result");
    expect(packet.responseSchema.outputs[0]!.cases[0]!.rubricLevelScores[0])
      .toHaveProperty("officialScore");
  });
});
