import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  evaluateGateRequest,
  validateCanonicalDirective,
  validateCanonicalPolicy,
  type CanonicalDirective,
  type ChatWorkPolicy,
  type GateRequest,
} from "../scripts/validate-chat-work-authority-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(readFileSync(resolve(root, "governance/chat-work-authority-policy.json"), "utf8")) as ChatWorkPolicy;
const directive = JSON.parse(readFileSync(resolve(root, "docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json"), "utf8")) as CanonicalDirective;
const digest = "b".repeat(64);

function request(overrides: Partial<GateRequest> = {}): GateRequest {
  return {
    requestId: "askrigor-gate-test",
    actor: "CODEX",
    action: "EXECUTE_SOURCE_BOUND_BOUNDED_DIRECTIVE",
    sourceReceipt: {
      messageId: "chat-message:extra-high:directive",
      exactBodySha256: digest,
      claimedSurface: "CHATGPT_PROJECT_MANAGER",
      observedSurface: "CHATGPT_PROJECT_MANAGER",
      provenanceStatus: "OWNER_ATTESTED",
    },
    modelApiSpendUsd: 0,
    boundedExecution: true,
    taskRequiresExecutionOutsideChat: true,
    internalRoute: null,
    ...overrides,
  };
}

describe("AskRigor Chat/Work authority policy", () => {
  it("validates the canonical zero-spend policy and directive", () => {
    expect(validateCanonicalPolicy(policy)).toEqual([]);
    expect(validateCanonicalDirective(policy, directive)).toEqual([]);
  });

  it("rejects a Codex-authored $30 smoke proposal", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "CODEX",
      action: "DESIGN_SPEND",
      sourceReceipt: null,
      modelApiSpendUsd: 30,
    }));
    expect(errors).toContain("CODEX cannot author reasoning-reserved action DESIGN_SPEND");
    expect(errors).toContain("paid model API inference is canceled by the active owner decision");
  });

  it("rejects a Work-authored approximately $175 pilot ceiling", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "WORK",
      action: "DESIGN_SPEND",
      sourceReceipt: null,
      modelApiSpendUsd: 175,
    }));
    expect(errors).toContain("WORK cannot author reasoning-reserved action DESIGN_SPEND");
    expect(errors).toContain("model API spend 175 exceeds active ceiling 0");
  });

  it("rejects a false attribution to a named ChatGPT chat", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "PROJECT_MANAGER_CHAT",
      action: "AUTHOR_PROPOSAL",
      sourceReceipt: {
        messageId: "claimed-chat-message",
        exactBodySha256: digest,
        claimedSurface: "CHATGPT_PROJECT_MANAGER",
        observedSurface: "CODEX_LOCAL",
        provenanceStatus: "UNVERIFIED",
      },
    }));
    expect(errors).toContain("claimed reasoning surface does not match observed source surface");
    expect(errors).toContain("unverified or Codex-copied reasoning cannot authorize the action");
  });

  it("allows automatic internal supervisor routing without owner relay", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "CODEX",
      action: "ROUTE_EXACT_FACTUAL_PACKET_TO_INTERNAL_SUPERVISOR",
      sourceReceipt: null,
      internalRoute: {
        destination: "SPECIALIST_SUPERVISOR_CHAT",
        ownerRelayRequested: false,
        saySendItRequested: false,
        actionTimeConfirmationRequested: false,
      },
    }));
    expect(errors).toEqual([]);
  });

  it("rejects asking Joel to relay or say send it", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "CODEX",
      action: "ROUTE_EXACT_FACTUAL_PACKET_TO_INTERNAL_SUPERVISOR",
      sourceReceipt: null,
      internalRoute: {
        destination: "PROJECT_MANAGER_CHAT",
        ownerRelayRequested: true,
        saySendItRequested: true,
        actionTimeConfirmationRequested: false,
      },
    }));
    expect(errors).toContain("routine internal supervisor routing cannot be bounced to Joel as a relay or say-send-it request");
  });

  it("rejects generic browser confirmation for standing internal supervisor routing", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "WORK",
      action: "ROUTE_EXACT_FACTUAL_PACKET_TO_INTERNAL_SUPERVISOR",
      sourceReceipt: null,
      internalRoute: {
        destination: "SPECIALIST_SUPERVISOR_CHAT",
        ownerRelayRequested: false,
        saySendItRequested: false,
        actionTimeConfirmationRequested: true,
      },
    }));
    expect(errors).toContain("standing owner authorization controls; routine internal supervisor routing cannot request action-time confirmation");
  });

  it("allows only the source-bound zero-spend bounded mechanical residue", () => {
    expect(evaluateGateRequest(policy, request())).toEqual([]);
    expect(evaluateGateRequest(policy, request({ boundedExecution: false }))).toContain("Codex/Work execution must be bounded");
    expect(evaluateGateRequest(policy, request({ taskRequiresExecutionOutsideChat: false }))).toContain("Codex/Work cannot take over a task the reasoning chat can execute directly");
  });
});
