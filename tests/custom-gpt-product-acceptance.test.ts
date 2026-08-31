import { describe, expect, it } from "vitest";

import {
  CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
  issueCustomGptAcceptanceReceipt
} from "../apps/research-mcp/src/custom-gpt-acceptance-receipt.js";
import { assessCustomGptProductAcceptance } from
  "../scripts/custom-gpt-product-acceptance.mts";

const SECRET = "product-acceptance-test-secret-at-least-32-bytes";
const KEY_ID = "product-test-key";
const SESSION_ID = `ars1_${"P".repeat(32)}`;
const protocols = [{
  protocol: "universal" as const,
  name: "Universal Instructions",
  version: "20.5.15",
  revision_date: "2026-08-24",
  sha256: "a".repeat(64)
}, {
  protocol: "hrp" as const,
  name: "Health Research Protocol",
  version: "20.5.24",
  revision_date: "2026-08-31",
  sha256: "b".repeat(64)
}] as const;

describe("Custom GPT product acceptance", () => {
  it("rejects the old caller-authored acceptance fixture regardless of claimed counts", () => {
    const result = assessCustomGptProductAcceptance({
      receipt: {
        schema_version: "askrigor-custom-gpt-product-acceptance/v1",
        installed_operation_ids: ["everything"],
        observed_action_operation_ids: ["everything"],
        coverage_receipt: {
          synthesis_lock: "pass",
          material_videos_fully_audited: 999
        },
        ordinary_output: "I completed the audit."
      },
      signingSecret: SECRET,
      expectedKeyId: KEY_ID
    });
    expect(result).toEqual({
      pass: false,
      issues: [
        "The server-issued product acceptance receipt is invalid, mismatched, or not bound to the reviewed Custom GPT bundle."
      ]
    });
  });

  it("passes only a current server-signed fixed-challenge receipt", () => {
    const receipt = issueCustomGptAcceptanceReceipt({
      challengeId: CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
      sessionId: SESSION_ID,
      protocolIdentities: protocols,
      transitionTrace: [{
        sequence: 0,
        capability: "final_completion_audit",
        result: "complete",
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
    const result = assessCustomGptProductAcceptance({
      receipt,
      signingSecret: SECRET,
      expectedKeyId: KEY_ID,
      now: () => new Date("2026-08-25T12:30:00.000Z")
    });
    expect(result).toMatchObject({
      pass: true,
      issues: [],
      verified: {
        challenge_id: CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
        session_id: SESSION_ID,
        final_boundary: "FINALIZATION_ALLOWED",
        transition_count: 1,
        report_digest: "f".repeat(64)
      }
    });
  });
});
