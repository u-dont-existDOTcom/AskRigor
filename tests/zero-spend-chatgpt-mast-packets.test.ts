import { describe, expect, it } from "vitest";

import {
  auditResponsePacketDifference,
  createResponsePacket,
} from "../scripts/prepare-zero-spend-chatgpt-mast-smoke.mjs";

const cases = [
  { caseId: "All001", prompt: "Synthetic benchmark case A" },
  { caseId: "All001-0", prompt: "Synthetic benchmark case B" },
];

describe("zero-spend ChatGPT MAST packet preparation", () => {
  it("permits only condition instructions and opaque identifiers to differ", () => {
    const bare = createResponsePacket("All001", cases, "BARE", "bare instructions");
    const hrp = createResponsePacket("All001", cases, "HRP", "hrp instructions");
    expect(auditResponsePacketDifference(bare, hrp)).toMatchObject({
      observedDifferencePaths: ["conditionInstructions", "opaquePacketId"],
      onlyInstructionConditionAndOpaqueIdentifiersDiffer: true,
    });
  });

  it("fails closed when a common case byte changes", () => {
    const bare = createResponsePacket("All001", cases, "BARE", "bare instructions");
    const hrp = createResponsePacket("All001", cases, "HRP", "hrp instructions");
    hrp.cases[0]!.prompt = "changed case";
    expect(() => auditResponsePacketDifference(bare, hrp)).toThrow(
      /CHATGPT_SMOKE_PACKET_DIFFERENCE_INVALID/,
    );
  });

  it("keeps the output schema and one-family limitation identical", () => {
    const bare = createResponsePacket("All001", cases, "BARE", "bare instructions");
    const hrp = createResponsePacket("All001", cases, "HRP", "hrp instructions");
    expect(bare.responseSchema).toEqual(hrp.responseSchema);
    expect(bare.operationalLimitation).toBe(hrp.operationalLimitation);
    expect(bare.responseSchema.responses).toHaveLength(2);
  });
});
