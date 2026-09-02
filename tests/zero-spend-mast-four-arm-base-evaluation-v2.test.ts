import { describe, expect, it } from "vitest";

import {
  acceptV2CaptureProgress,
  chunkFrozenResponse,
  parseAndValidateEvaluatorV2Output,
  renderEvaluatorV2TransportExtension,
} from "../scripts/zero-spend-mast-four-arm-base-evaluation-v2.mjs";

const rawResponse = "Order alpha now. Do not start beta.";
const chunks = chunkFrozenResponse(rawResponse);
const rubricValue = {
  id: "Derm001",
  options: [
    { id: 1, score: 9 },
    { id: 2, score: 1 },
  ],
};
const validOutput = {
  actions: [
    {
      id: 1,
      category: "Diagnostic",
      evidenceChunkIds: [1],
      dependsOn: [],
      matchOptionIds: [1],
    },
  ],
  options: [
    { id: 1, verdict: "yes", actionIds: [1] },
    { id: 2, verdict: "no", actionIds: [] },
  ],
  severeCommissionActionIds: [],
  uncertainOptionIds: [],
  uncertainActionIds: [],
};

function validate(value: unknown) {
  return parseAndValidateEvaluatorV2Output({
    rawOutput: JSON.stringify(value),
    rawResponse,
    chunks,
    caseId: "Derm001",
    opaqueResponseId: "EVAL-0123456789abcdef01234567",
    rubricValue,
  });
}

describe("zero-spend blinded MAST evaluator transport v2", () => {
  it("declares canonical source option order independently of concept-grouped display order", () => {
    const extension = renderEvaluatorV2TransportExtension({
      primaryEvaluatorTransportV2: {
        semanticInstructions: "Preserve the evaluator semantics.",
        serializationInstruction: "Return compact JSON.",
      },
      evaluatorOutputSchemaV2: {},
      mechanicalValidationV2: {
        rules: ["options contains every rubric option exactly once in source order."],
      },
    }, [1, 2, 3, 4]);
    expect(extension).toContain("canonical rubric source order");
    expect(extension).toContain("[1,2,3,4]");
  });

  it("chunks by Unicode code point and reconstructs exact frozen bytes", () => {
    const source = `${"a".repeat(159)}🧪${"b".repeat(161)}\n`;
    const observed = chunkFrozenResponse(source);
    expect(observed.map(({ text }) => text).join("")).toBe(source);
    expect(observed.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(observed.map(({ text }) => Array.from(text).length)).toEqual([160, 160, 2]);
  });

  it("accepts the compact schema and reconstructs source-bound metric input", () => {
    const observed = validate(validOutput);
    expect(observed.output).toEqual(validOutput);
    expect(observed.reconstructedJudgment).toMatchObject({
      caseId: "Derm001",
      opaqueResponseId: "EVAL-0123456789abcdef01234567",
      actions: [{ id: 1, evidence: rawResponse, match: "1" }],
      options: [
        { id: 1, officialScore: 9, matchVerdict: "yes", matchedActionIds: [1] },
        { id: 2, officialScore: 1, matchVerdict: "no", matchedActionIds: [] },
      ],
    });
  });

  it("rejects wrappers, schema drift, invalid chunks, and option omissions", () => {
    expect(() => parseAndValidateEvaluatorV2Output({
      rawOutput: `\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``,
      rawResponse,
      chunks,
      caseId: "Derm001",
      opaqueResponseId: "EVAL-0123456789abcdef01234567",
      rubricValue,
    })).toThrow("EVALUATOR_V2_INVALID_JSON");
    expect(() => validate({ ...validOutput, extra: true }))
      .toThrow("EVALUATOR_V2_SCHEMA_KEY_MISMATCH");
    expect(() => validate({
      ...validOutput,
      actions: [{ ...validOutput.actions[0], evidenceChunkIds: [2] }],
    })).toThrow("EVALUATOR_V2_INVALID_CHUNK_REFERENCE");
    expect(() => validate({ ...validOutput, options: validOutput.options.slice(0, 1) }))
      .toThrow("EVALUATOR_V2_INVALID_OPTION_COVERAGE");
  });

  it("rejects broken bidirectional references and severe labels on matched actions", () => {
    expect(() => validate({
      ...validOutput,
      actions: [{ ...validOutput.actions[0], matchOptionIds: [] }],
    })).toThrow("EVALUATOR_V2_INVALID_CROSS_REFERENCE");
    expect(() => validate({ ...validOutput, severeCommissionActionIds: [1] }))
      .toThrow("EVALUATOR_V2_INVALID_SEVERE_COMMISSION_REFERENCE");
  });

  it("accepts an empty fresh v2 progress ledger bound to all 192 slots", () => {
    const records = Array.from({ length: 192 }, (_, index) => ({
      ordinal: index + 1,
      opaqueResponseId: `EVAL-${(index + 1).toString(16).padStart(24, "0")}`,
      caseId: "Derm001",
      evaluatorReplicate: (index % 2) + 1,
      orderDigest: (index + 1).toString(16).padStart(64, "0"),
      packetFile: `evaluation-v2/packets/${index + 1}.txt`,
      exactPacketSha256: (index + 1000).toString(16).padStart(64, "0"),
    }));
    const schedule = {
      schemaVersion: 1,
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      conditionMapSealed: true,
      records,
    };
    const progress = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_primary_capture_progress",
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      createdAt: "2026-09-02T19:25:00Z",
      updatedAt: "2026-09-02T19:25:00Z",
      primaryJudgmentTarget: 192,
      validJudgmentCount: 0,
      mechanicalFailureCount: 0,
      records: [],
      mechanicalFailures: [],
      haltedClaim: null,
    };
    expect(acceptV2CaptureProgress(schedule, progress).records).toHaveLength(0);
  });
});
