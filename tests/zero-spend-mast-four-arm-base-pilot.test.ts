import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createArmOrder,
  createFourArmInputs,
} from "../scripts/prepare-zero-spend-mast-four-arm-base-pilot.mjs";

const root = resolve(import.meta.dirname, "..");

describe("zero-spend MAST four-arm base pilot", () => {
  it("creates a deterministic permutation for every family and trial", () => {
    const first = createArmOrder("seed", "Derm001", 1);
    const second = createArmOrder("seed", "Derm001", 1);
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual(["A", "B", "C", "D"]);
    expect(createArmOrder("seed", "Derm001", 2)).not.toEqual(first);
  });

  it("constructs the four exact prompt arms without a wrapper", () => {
    const inputs = createFourArmInputs({
      baseCasePrompt: "CASE",
      mastDefaultPrompt: "",
      mastThoroughPrompt: "THOROUGH\n",
      universalInstructions: "UNIVERSAL",
      hrpInstructions: "HRP",
    });
    expect(inputs).toEqual({
      A: "CASE",
      B: "THOROUGH\nCASE",
      C: "UNIVERSAL\n\nCASE",
      D: "UNIVERSAL\n\nHRP\n\nCASE",
    });
  });

  it("fails closed if the pinned MAST default prompt is not empty", () => {
    expect(() => createFourArmInputs({
      baseCasePrompt: "CASE",
      mastDefaultPrompt: "unexpected",
      mastThoroughPrompt: "THOROUGH\n",
      universalInstructions: "UNIVERSAL",
      hrpInstructions: "HRP",
    })).toThrow(/FOUR_ARM_MAST_DEFAULT_PROMPT_NOT_EMPTY/);
  });

  it("preserves the source-bound frozen directive and zero-spend execution request", () => {
    const directiveMirror = JSON.parse(readFileSync(resolve(
      root,
      "docs/directives/2026-09-01-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot.json",
    ), "utf8")) as Record<string, any>;
    const request = JSON.parse(readFileSync(resolve(
      root,
      "evaluation/mast/four-arm-eight-family-chatgpt-execution-request.json",
    ), "utf8")) as Record<string, any>;
    expect(directiveMirror.source).toMatchObject({
      assistantMessageId: "73fe6ae7-3faa-45b3-b7d2-2394ef852183",
      exactPrivateOutputSha256:
        "bf864a37c3da6b9e187a21865cf44546e45e2341dfac6f6f4d60a3d7ab5b3b33",
      provenanceStatus: "VERIFIED",
    });
    expect(directiveMirror.directive).toMatchObject({
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2",
      status: "FROZEN_BEFORE_ANY_UNTOUCHED_FAMILY_OUTPUT_IS_VIEWED",
      sample: { familyCount: 8, armsPerFamily: 4, trialsPerArmFamily: 3, baseResponseCount: 96 },
      completionClaim: "BASE_PILOT_PARENT_OPEN",
    });
    expect(request).toMatchObject({
      actor: "CODEX",
      action: "EXECUTE_SOURCE_BOUND_BOUNDED_DIRECTIVE",
      modelApiSpendUsd: 0,
      boundedExecution: true,
      sourceReceipt: {
        messageId: "73fe6ae7-3faa-45b3-b7d2-2394ef852183",
        exactBodySha256:
          "bf864a37c3da6b9e187a21865cf44546e45e2341dfac6f6f4d60a3d7ab5b3b33",
        provenanceStatus: "VERIFIED",
      },
    });
  });
});
