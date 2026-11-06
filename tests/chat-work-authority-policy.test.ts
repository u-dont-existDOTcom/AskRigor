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
  type PaidModelInferenceDecision,
} from "../scripts/validate-chat-work-authority-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(readFileSync(resolve(root, "governance/chat-work-authority-policy.json"), "utf8")) as ChatWorkPolicy;
const directive = JSON.parse(readFileSync(resolve(root, "docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json"), "utf8")) as CanonicalDirective;
const digest = "b".repeat(64);
const CANCELED = "paid model API inference is canceled by the active owner decision outside the scopes a newer owner " +
  "decision names";
const decision221 = (policy.paidModelInferenceDecisions ?? []).find(({ decisionId }) => decisionId === "OWNER_ANSWER_221")!;
const withDecision = (change: Partial<PaidModelInferenceDecision>): ChatWorkPolicy => ({
  ...policy,
  paidModelInferenceDecisions: [{ ...decision221, ...change }],
});

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

  it("records owner answer 221 as a newer decision naming its date, scope, funding and ceiling", () => {
    expect(decision221).toMatchObject({
      date: "2026-11-02",
      provider: "ANTHROPIC_CLAUDE_API",
      scopes: ["MEANING_JUDGE_ON_OWNER_DEV_ACCOUNTS", "ASKRIGOR_WEB_APP_TRIAL"],
      funding: "OWNER_MONTHLY_CLAUDE_API_CREDITS",
      ceiling: { basis: "OWNER_MONTHLY_CLAUDE_API_CREDITS", spendBeyondCreditsPermitted: false },
      codexOrWorkMayAuthorPaidProposal: false,
    });
    expect(decision221.ceiling.maximumModelApiSpendUsdPerMonth).toBeGreaterThan(0);
    // The owner's words, exactly, with the key file's path left out.
    expect(decision221.ownerWords).toEqual([
      expect.stringMatching(/^221 the production server can reach Railway, which has railway agents which use my codex cli so that shoudl work\. but here's my claude API key which should have \$200 that i have to use this month: \[the key file's path, not recorded\] \.\.\. we can also maybe try the web app and see how that works better now using these api credits that will expire anyway$/u),
      "oh and i should evne have another $200 from my other account this month so don't worry about using those if needed",
    ]);
    const recorded = readFileSync(resolve(root, "governance/chat-work-authority-policy.json"), "utf8");
    // No key, workspace ID or local path: the record's only locator is the bracketed marker.
    for (const secret of ["sk-ant-", "wrkspc_", "/home/", "/Users/", ".txt"]) {
      expect(recorded).not.toContain(secret);
    }
    // Outside the decision's scopes the zero-spend ceiling stays.
    expect(policy.ownerAuthority).toMatchObject({ paidModelInferenceAllowed: false, maximumModelApiSpendUsd: 0 });
  });

  it("refuses a nonzero ceiling without a decision that names its date, scope, funding and ceiling", () => {
    const opened: ChatWorkPolicy = {
      ...policy,
      ownerAuthority: { ...policy.ownerAuthority, paidModelInferenceAllowed: true, maximumModelApiSpendUsd: 50 },
    };
    expect(validateCanonicalPolicy(opened)).toEqual(expect.arrayContaining([
      "paid model inference must remain disabled outside a recorded owner decision's scopes",
      "model API ceiling must equal zero outside a recorded owner decision's scopes",
    ]));
    const incomplete = withDecision({
      date: "2026-08-01",
      scopes: [],
      funding: "",
      ceiling: { ...decision221.ceiling, maximumModelApiSpendUsdPerMonth: 0 },
      ownerWords: [],
      codexOrWorkMayAuthorPaidProposal: true,
    });
    expect(validateCanonicalPolicy(incomplete)).toEqual(expect.arrayContaining([
      "paid model inference decision OWNER_ANSWER_221 must be newer than the zero-spend owner decision",
      "paid model inference decision OWNER_ANSWER_221 must name its scope",
      "paid model inference decision OWNER_ANSWER_221 must name its funding",
      "paid model inference decision OWNER_ANSWER_221 must name its ceiling: a basis, a positive monthly maximum in USD and whether spend beyond it is permitted",
      "paid model inference decision OWNER_ANSWER_221 must record the owner's words",
      "paid model inference decision OWNER_ANSWER_221 must not let Codex or Work author a paid proposal or ceiling",
    ]));
    expect(validateCanonicalPolicy(withDecision({ date: "2 Nov" })))
      .toContain("paid model inference decision OWNER_ANSWER_221 must name its date as YYYY-MM-DD");
    expect(validateCanonicalPolicy(withDecision({ scopes: ["PAID_SMOKE"] })))
      .toContain("paid model inference decision OWNER_ANSWER_221 names an unknown scope PAID_SMOKE");
    const keyPath = "/home/someone/keys/claude.txt";
    expect(validateCanonicalPolicy(withDecision({ ownerWords: [`here's my key: ${keyPath}`] })))
      .toContain("paid model inference decision OWNER_ANSWER_221 must not record a key, a workspace ID or a local path");
    expect(validateCanonicalPolicy(withDecision({ notRecorded: ["wrkspc_01AbCdEf"] })))
      .toContain("paid model inference decision OWNER_ANSWER_221 must not record a key, a workspace ID or a local path");
    expect(validateCanonicalPolicy({ ...policy, spending: { ...policy.spending, codexMayAuthorPaidProposal: true } }))
      .toContain("Codex/Work must not author a paid proposal or ceiling");
  });

  it("allows Claude API spend within owner answer 221's scopes and its ceiling only", () => {
    for (const scope of ["MEANING_JUDGE_ON_OWNER_DEV_ACCOUNTS", "ASKRIGOR_WEB_APP_TRIAL"]) {
      expect(evaluateGateRequest(policy, request({
        actor: "CLAUDE_SESSION", action: "DESIGN_METHODOLOGY", sourceReceipt: null, modelApiSpendUsd: 10,
        modelApiSpendScope: scope,
      }))).toEqual([]);
    }
    const over = evaluateGateRequest(policy, request({
      actor: "CLAUDE_SESSION", action: "DESIGN_METHODOLOGY", sourceReceipt: null,
      modelApiSpendUsd: decision221.ceiling.maximumModelApiSpendUsdPerMonth + 1,
      modelApiSpendScope: "MEANING_JUDGE_ON_OWNER_DEV_ACCOUNTS",
    }));
    expect(over).toEqual([`model API spend ${decision221.ceiling.maximumModelApiSpendUsdPerMonth + 1} exceeds the ceiling ` +
      `${decision221.ceiling.maximumModelApiSpendUsdPerMonth} of owner decision OWNER_ANSWER_221`]);
    // Any other paid path still needs a newer owner decision.
    for (const scope of [undefined, null, "", "PAID_SMOKE", "CUSTOM_GPT_PILOT"]) {
      const errors = evaluateGateRequest(policy, request({
        actor: "CLAUDE_SESSION", action: "DESIGN_METHODOLOGY", sourceReceipt: null, modelApiSpendUsd: 5,
        modelApiSpendScope: scope,
      }));
      expect(errors).toContain(CANCELED);
      expect(errors).toContain("model API spend 5 exceeds active ceiling 0");
    }
  });

  it("still refuses a Codex- or Work-authored paid proposal inside owner answer 221's scope", () => {
    for (const actor of ["CODEX", "WORK"]) {
      const errors = evaluateGateRequest(policy, request({
        actor, action: "DESIGN_SPEND", sourceReceipt: null, modelApiSpendUsd: 3,
        modelApiSpendScope: "MEANING_JUDGE_ON_OWNER_DEV_ACCOUNTS",
      }));
      expect(errors).toContain(`${actor} cannot author reasoning-reserved action DESIGN_SPEND`);
    }
  });

  it("rejects a Codex-authored $30 smoke proposal", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "CODEX",
      action: "DESIGN_SPEND",
      sourceReceipt: null,
      modelApiSpendUsd: 30,
    }));
    expect(errors).toContain("CODEX cannot author reasoning-reserved action DESIGN_SPEND");
    expect(errors).toContain(CANCELED);
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

  it("lets a Claude session do its own reasoning without a chat receipt (owner, 2026-10-01)", () => {
    for (const action of ["SCIENTIFIC_INTERPRETATION", "DESIGN_METHODOLOGY", "AUTHOR_PROPOSAL"]) {
      expect(evaluateGateRequest(policy, request({ actor: "CLAUDE_SESSION", action, sourceReceipt: null }))).toEqual([]);
    }
  });

  it("still refuses paid model inference from a Claude session", () => {
    const errors = evaluateGateRequest(policy, request({
      actor: "CLAUDE_SESSION",
      action: "DESIGN_SPEND",
      sourceReceipt: null,
      modelApiSpendUsd: 30,
    }));
    expect(errors).toContain("model API spend 30 exceeds active ceiling 0");
    expect(errors).toContain(CANCELED);
  });

  it("keeps a Claude session a reasoning authority with owner-only spending and release decisions", () => {
    const demoted: ChatWorkPolicy = {
      ...policy,
      reasoningAuthorities: policy.reasoningAuthorities.filter((actor) => actor !== "CLAUDE_SESSION"),
      executionOnlyActors: [...policy.executionOnlyActors, "CLAUDE_SESSION"],
      claudeSessions: { ...policy.claudeSessions, routesReasoningToAnotherChat: true, ownerOnlyDecisions: [] },
    };
    const errors = validateCanonicalPolicy(demoted);
    expect(errors).toContain("a Claude session must be a reasoning authority, not an execution-only actor");
    expect(errors).toContain("a Claude session must not route its reasoning to another chat");
    expect(errors).toContain("a Claude session's owner-only decisions must include NONZERO_SPEND");
    expect(errors).toContain("a Claude session's owner-only decisions must include MERGE_OR_DEPLOY");
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
