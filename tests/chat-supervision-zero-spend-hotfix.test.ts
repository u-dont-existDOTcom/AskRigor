import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const readText = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Chat-led zero-spend MAST supervision hotfix", () => {
  it("cancels paid API inference and keeps the active ceiling at zero", () => {
    const task = readJson("tasks/ACTIVE-TASK.json");
    const receipt = readJson("docs/audits/2026-09-01-chat-supervision-zero-spend-routing-hotfix.json");
    const directive = readJson("docs/directives/2026-09-01-mast-zero-spend-chatgpt-execution-directive.json");

    expect(task.currentSlice.maximumEstimatedCostUsdBeforeAbort).toBe(0);
    expect(task.currentSlice.excluded).toContain("paid MAST or NOHARM model inference");
    expect(task.currentSlice.excluded).toContain("paid judge inference");
    expect(receipt.hotfix.paidModelApiInferenceAllowed).toBe(false);
    expect(receipt.hotfix.maximumEstimatedCostUsdBeforeAbort).toBe(0);
    expect(receipt.ownerCorrection.observedFailure.paidApiCallsOccurred).toBe(false);
    expect(directive.fixedControls.maximumEstimatedCostUsdBeforeAbort).toBe(0);
    expect(directive.paidApiPath).toBe("CANCELED");
  });

  it("reserves proposals, methodology, prioritization, spending, and tradeoffs to Chat", () => {
    const task = readJson("tasks/ACTIVE-TASK.json");
    const instructions = readText("evaluation/AGENTS.md");

    for (const phrase of [
      "proposals",
      "evaluation methodology",
      "prioritization",
      "spending proposals",
      "consequential tradeoffs",
    ]) {
      expect(instructions).toContain(phrase);
    }
    expect(task.targetedHardGates).toContain(
      "ChatGPT Project Manager or specialist supervisor owns proposals, methodology, prioritization, spending design, and consequential tradeoffs",
    );
    expect(instructions).toContain("Codex/Work executes only an exact bounded Chat-authored directive");
  });

  it("forbids owner relay and send-it handbacks for routine internal routing", () => {
    const task = readJson("tasks/ACTIVE-TASK.json");
    const instructions = readText("evaluation/AGENTS.md");
    const receipt = readJson("docs/audits/2026-09-01-chat-supervision-zero-spend-routing-hotfix.json");

    expect(task.targetedHardGates).toContain(
      "routine internal supervisor routing is automatic and never asks Joel to relay a prompt or say send it",
    );
    expect(receipt.hotfix.internalSupervisorRoutingPreauthorized).toBe(true);
    expect(receipt.hotfix.ownerRelayForbidden).toBe(true);
    expect(instructions).toContain("say `send it` or equivalent");
    expect(instructions).toContain("must route automatically");
  });

  it("does not falsely attribute a Codex proposal to a named ChatGPT chat", () => {
    const receipt = readJson("docs/audits/2026-09-01-chat-supervision-zero-spend-routing-hotfix.json");
    const instructions = readText("evaluation/AGENTS.md");

    expect(receipt.hotfix.sourceReceiptRequiredForChatAttribution).toBe(true);
    expect(receipt.ownerCorrection.observedFailure.falseClaimThatProposalCameFromChat).toBe(true);
    expect(instructions).toContain("A local subagent, Codex summary, opened tab, chat title, or recollection is not a reasoning receipt.");
  });

  it("issues only a bounded six-route consumer-ChatGPT transport and provenance smoke", () => {
    const directive = readJson("docs/directives/2026-09-01-mast-zero-spend-chatgpt-execution-directive.json");

    expect(directive.status).toBe("ACTIVE");
    expect(directive.fixedControls.items).toBe(3);
    expect(directive.fixedControls.conditionsPerItem).toBe(2);
    expect(directive.fixedControls.maximumPromptRoutes).toBe(6);
    expect(directive.fixedControls.oneFreshConversationPerPrompt).toBe(true);
    expect(directive.fixedControls.paidJudgeCalls).toBe(false);
    expect(directive.forbiddenActions).toContain("Any full ten-family pilot or untouched confirmation run.");
    expect(directive.forbiddenActions).toContain("Any claim that three transport-smoke items measure HRP efficacy.");
    expect(directive.ownerActionRequired).toBe(false);
  });
});
