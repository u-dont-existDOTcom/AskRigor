import { describe, expect, it } from "vitest";

import {
  compareRational,
  normalizeDestinationChatLocator,
  postGatePackagingCompletionFields,
  prioritizedFamilyIds,
  validateIdentityJoins,
} from "../scripts/zero-spend-mast-post-gate-evidence-export-v1.mjs";

describe("post-gate evidence export helpers", () => {
  it("serializes exact packaging-only receipt and operation completion fields", () => {
    expect(JSON.parse(JSON.stringify(postGatePackagingCompletionFields()))).toEqual({
      receipt: {
        completionClaim: "POST_GATE_EXISTING_EVIDENCE_PACKAGED_DELIVERY_PENDING",
        delivery: {
          observationScope: "THIS_PACKAGING_INVOCATION_ONLY",
          attempted: false,
          delivered: false,
          verifiedDeliveryReceipt: false,
        },
      },
      result: {
        status: "POST_GATE_EXISTING_EVIDENCE_PACKAGED_DELIVERY_PENDING",
        delivery: {
          observationScope: "THIS_PACKAGING_INVOCATION_ONLY",
          attempted: false,
          delivered: false,
          verifiedDeliveryReceipt: false,
        },
      },
    });
  });

  it("does not promote parent success into this packaging invocation", () => {
    const parentCompletionClaim = "PARENT_DELIVERY_COMPLETE";
    const completion = postGatePackagingCompletionFields();
    const emitted = JSON.parse(JSON.stringify({
      parentProvenance: { completionClaim: parentCompletionClaim },
      receipt: completion.receipt,
      result: completion.result,
    }));
    expect(emitted.receipt.completionClaim).not.toBe(parentCompletionClaim);
    expect(emitted.result.status).not.toBe(parentCompletionClaim);
    expect(emitted.receipt.delivery).toMatchObject({
      attempted: false,
      delivered: false,
      verifiedDeliveryReceipt: false,
    });
    expect(emitted.result.delivery).toMatchObject({
      attempted: false,
      delivered: false,
      verifiedDeliveryReceipt: false,
    });
  });

  it("keeps validation and admission metadata separate from delivery evidence", () => {
    const completion = postGatePackagingCompletionFields();
    const emitted = JSON.parse(JSON.stringify({
      receipt: {
        runtimeAdmission: { mayExecute: true, primaryDecision: "ALLOW_BOUNDED_EXECUTION" },
        delivery: {
          destinationLocatorValidated: true,
          ...completion.receipt.delivery,
        },
      },
      result: completion.result,
    }));
    expect(emitted.receipt.delivery).toEqual({
      destinationLocatorValidated: true,
      observationScope: "THIS_PACKAGING_INVOCATION_ONLY",
      attempted: false,
      delivered: false,
      verifiedDeliveryReceipt: false,
    });
    expect(emitted.result.delivery).toEqual({
      observationScope: "THIS_PACKAGING_INVOCATION_ONLY",
      attempted: false,
      delivered: false,
      verifiedDeliveryReceipt: false,
    });
  });

  it("joins persisted identities without array-position assumptions", () => {
    expect(() => validateIdentityJoins({
      mapping: [
        { opaqueResponseId: "opaque-b", generationLedgerRecordId: "gen-b", sequence: 2,
          generationOutputSha256: "hash-b" },
        { opaqueResponseId: "opaque-a", generationLedgerRecordId: "gen-a", sequence: 1,
          generationOutputSha256: "hash-a" },
      ],
      generation: [
        { opaqueInputId: "gen-a", sequence: 1, exactOutputSha256: "hash-a" },
        { opaqueInputId: "gen-b", sequence: 2, exactOutputSha256: "hash-b" },
      ],
      final: [
        { opaqueResponseId: "opaque-a" },
        { opaqueResponseId: "opaque-b" },
      ],
    })).not.toThrow();
  });

  it("rejects duplicate or inconsistent persisted identities", () => {
    expect(() => validateIdentityJoins({
      mapping: [
        { opaqueResponseId: "opaque-a", generationLedgerRecordId: "gen-a", sequence: 1,
          generationOutputSha256: "hash-a" },
        { opaqueResponseId: "opaque-a", generationLedgerRecordId: "gen-b", sequence: 2,
          generationOutputSha256: "hash-b" },
      ],
      generation: [
        { opaqueInputId: "gen-a", sequence: 1, exactOutputSha256: "hash-a" },
        { opaqueInputId: "gen-b", sequence: 2, exactOutputSha256: "hash-b" },
      ],
      final: [{ opaqueResponseId: "opaque-a" }, { opaqueResponseId: "opaque-b" }],
    })).toThrow("POST_GATE_EXPORT_DUPLICATE_IDENTITY");

    expect(() => validateIdentityJoins({
      mapping: [{ opaqueResponseId: "opaque-a", generationLedgerRecordId: "gen-a",
        sequence: 1, generationOutputSha256: "wrong" }],
      generation: [{ opaqueInputId: "gen-a", sequence: 1, exactOutputSha256: "hash-a" }],
      final: [{ opaqueResponseId: "opaque-a" }],
    })).toThrow("POST_GATE_EXPORT_IDENTITY_JOIN_MISMATCH");
  });

  it("orders exact rational values and selects two values at each extreme", () => {
    expect(compareRational(
      { numerator: "1", denominator: "3" },
      { numerator: "3333333333333333", denominator: "10000000000000000" },
    )).toBeGreaterThan(0);
    const values = [
      { familyId: "f4", dMinusB: { numerator: "4", denominator: "10" } },
      { familyId: "f2", dMinusB: { numerator: "-2", denominator: "10" } },
      { familyId: "f1", dMinusB: { numerator: "-3", denominator: "10" } },
      { familyId: "f8", dMinusB: { numerator: "8", denominator: "10" } },
      { familyId: "f7", dMinusB: { numerator: "7", denominator: "10" } },
      { familyId: "f3", dMinusB: { numerator: "3", denominator: "10" } },
      { familyId: "f6", dMinusB: { numerator: "6", denominator: "10" } },
      { familyId: "f5", dMinusB: { numerator: "5", denominator: "10" } },
    ];
    expect(prioritizedFamilyIds(values)).toEqual({
      lower: ["f1", "f2"],
      higher: ["f7", "f8"],
    });
  });

  it("accepts only the bounded ChatGPT locator transport prefix", () => {
    const locator = "https://chatgpt.com/c/00000000-0000-0000-0000-000000000000";
    expect(normalizeDestinationChatLocator(locator)).toBe(locator);
    expect(normalizeDestinationChatLocator(`[${locator}`)).toBe(locator);
    expect(() => normalizeDestinationChatLocator(`[[${locator}`))
      .toThrow("POST_GATE_EXPORT_DESTINATION_LOCATOR_INVALID");
    expect(() => normalizeDestinationChatLocator("https://example.com/c/test"))
      .toThrow("POST_GATE_EXPORT_DESTINATION_LOCATOR_INVALID");
  });
});
