import { describe, expect, it } from "vitest";

import {
  CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
  CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET,
  issueCustomGptAcceptanceReceipt,
  verifyCustomGptAcceptanceReceipt
} from "../apps/research-mcp/src/custom-gpt-acceptance-receipt.js";
import { assessCustomGptProductAcceptance } from
  "../scripts/custom-gpt-product-acceptance.mts";

const SECRET = "custom-gpt-acceptance-test-secret-32-bytes";
const KEY_ID = "test-key";
const SESSION_ID = `ars1_${"A".repeat(32)}`;
const protocols = [{
  protocol: "universal" as const,
  name: "Universal Instructions",
  version: "20.5.15",
  revision_date: "2026-08-24",
  sha256: "a".repeat(64)
}, {
  protocol: "hrp" as const,
  name: "Health Research Protocol",
  version: "20.5.23",
  revision_date: "2026-08-24",
  sha256: "b".repeat(64)
}] as const;

describe("server-issued Custom GPT product acceptance receipt", () => {
  it("uses a concrete regression target that cannot pass by pooling exercise", () => {
    expect(CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET).toContain(
      "radiographically confirmed end-stage hip osteoarthritis"
    );
    expect(CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET).toContain(
      "specific implementations rather than pooling exercise or conservative care"
    );
    expect(CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET).toContain(
      "progressive resistance training"
    );
    expect(CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET).toContain("aquatic exercise");
    expect(CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET).toContain(
      "gait or movement retraining"
    );
    expect(CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET).toContain("study methods");
  });

  it("binds bundle, protocols, transition trace, permit, report, and challenge without private content", () => {
    const receipt = issueCustomGptAcceptanceReceipt({
      challengeId: CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
      sessionId: SESSION_ID,
      protocolIdentities: protocols,
      transitionTrace: [{
        sequence: 0,
        capability: "module_applicability",
        result: "semantic_work_recorded",
        before_state_digest: "c".repeat(64),
        after_state_digest: "d".repeat(64)
      }],
      finalBoundary: "FINALIZATION_ALLOWED",
      permitPayloadSha256: "e".repeat(64),
      reportDigest: "f".repeat(64),
      signingSecret: SECRET,
      keyId: KEY_ID,
      now: () => new Date("2026-08-25T12:00:00.000Z")
    });
    expect(verifyCustomGptAcceptanceReceipt({
      receipt,
      signingSecret: SECRET,
      expectedKeyId: KEY_ID,
      now: () => new Date("2026-08-25T12:30:00.000Z")
    })).toEqual(receipt);
    expect(assessCustomGptProductAcceptance({
      receipt,
      signingSecret: SECRET,
      expectedKeyId: KEY_ID,
      now: () => new Date("2026-08-25T12:30:00.000Z")
    })).toMatchObject({ pass: true, issues: [] });
    expect(JSON.stringify(receipt)).not.toMatch(
      /joint pain|medical|transcript|comment|provider body|credential/iu
    );
  });

  it("rejects caller-authored assertions, tampering, and expired receipts", () => {
    expect(assessCustomGptProductAcceptance({
      receipt: {
        synthesis_lock: "pass",
        material_videos_fully_audited: 99,
        all_work_done: true
      },
      signingSecret: SECRET,
      expectedKeyId: KEY_ID
    }).pass).toBe(false);

    const receipt = issueCustomGptAcceptanceReceipt({
      challengeId: CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
      sessionId: SESSION_ID,
      protocolIdentities: protocols,
      transitionTrace: [{
        sequence: 0,
        capability: "report_synthesis",
        result: "semantic_work_recorded",
        before_state_digest: "1".repeat(64),
        after_state_digest: "2".repeat(64)
      }],
      finalBoundary: "FINALIZATION_ALLOWED",
      permitPayloadSha256: "3".repeat(64),
      reportDigest: "4".repeat(64),
      signingSecret: SECRET,
      keyId: KEY_ID,
      now: () => new Date("2026-08-25T12:00:00.000Z")
    });
    expect(() => verifyCustomGptAcceptanceReceipt({
      receipt: { ...receipt, report_digest: "5".repeat(64) },
      signingSecret: SECRET,
      expectedKeyId: KEY_ID
    })).toThrow();
    expect(() => verifyCustomGptAcceptanceReceipt({
      receipt,
      signingSecret: SECRET,
      expectedKeyId: KEY_ID,
      now: () => new Date("2026-08-25T13:00:00.000Z")
    })).toThrow(/expired/iu);
    expect(() => verifyCustomGptAcceptanceReceipt({
      receipt,
      signingSecret: SECRET,
      expectedKeyId: KEY_ID,
      now: () => new Date("2026-08-25T11:59:59.999Z")
    })).toThrow(/expired/iu);
  });
});
