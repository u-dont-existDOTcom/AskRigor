import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("external evaluation current-slice contract", () => {
  it("preserves the canonical parent program while advancing to the zero-spend ChatGPT child slice", async () => {
    const task = JSON.parse(
      await readFile(rootFile("tasks/ACTIVE-TASK.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(task).toMatchObject({
      taskId: "askrigor-external-evaluation-contribution-v1",
      status: "active_zero_spend_chatgpt_mast_operational_smoke",
      exclusive: true,
      requiredBranch: "hotfix/chat-reasoning-zero-spend-routing-20260901",
      baselineCommit: "a1d4aaf0fe2010edc5cec13e6c431877a311d074",
      boundedOutcome: expect.stringContaining("zero-spend one-case ChatGPT-consumer MAST operational smoke"),
      authorityPolicy: "governance/chat-work-authority-policy.json",
      activeDirective: "docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json",
      currentState: "docs/state/EXTERNAL-EVALUATION-CHAT-WORK-HOTFIX-CURRENT-STATE.md",
      codexCurrentState: "docs/state/CODEX-CHAT-WORK-HOTFIX-CURRENT-STATE.md",
      currentSlice: {
        sliceId: "zero-spend-chatgpt-mast-operational-smoke-v1",
        status: "directive_ready_execution_not_started",
        maximumEstimatedCostUsdBeforeAbort: 0,
        requiredChats: {
          responseChats: 2,
          evaluatorChats: 1,
          mode: "EXTRA_HIGH",
          automaticRouting: true,
          ownerRelayPermitted: false,
        },
      },
      preflightCommand: "npx tsx scripts/validate-chat-work-authority-policy.mts",
      completionCommand: "npx tsx scripts/accept-zero-spend-chatgpt-mast-smoke.mts",
      lastCompletedSlice: {
        sliceId: "mast-noharm-pilot-analysis-freeze-v1",
        status: "protected_merge_complete",
        pullRequest: 175,
        mergeCommit: "a1d4aaf0fe2010edc5cec13e6c431877a311d074",
      },
      supervision: {
        completionClaim: "SUBTASK_COMPLETE_PARENT_OPEN",
        scientificAdequacy: "not reached; no inference run",
        releaseAdequacy: "unaffected; no paid run, external submission, protocol mutation, or release",
      },
    });
  });

  it("provides branch-bound preflight, authority, and fail-closed acceptance commands", async () => {
    const packageJson = JSON.parse(
      await readFile(rootFile("package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["external-evaluation:preflight"]).toBe(
      "tsx scripts/external-evaluation-task-preflight.mts",
    );
    expect(packageJson.scripts?.["external-evaluation:acceptance"]).toBe(
      "tsx scripts/accept-external-evaluation.mts",
    );
    expect(packageJson.scripts?.["validate:chat-work-authority"]).toBe(
      "tsx scripts/validate-chat-work-authority-policy.mts",
    );
    for (const path of [
      "scripts/external-evaluation-task-preflight.mts",
      "scripts/accept-external-evaluation.mts",
      "scripts/validate-chat-work-authority-policy.mts",
      "scripts/accept-zero-spend-chatgpt-mast-smoke.mts",
      "governance/chat-work-authority-policy.json",
      "docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json",
      "docs/state/CODEX-CHAT-WORK-HOTFIX-CURRENT-STATE.md",
      "docs/audits/2026-09-01-mast-noharm-pilot-freeze-protected-merge.json",
    ]) {
      await expect(access(rootFile(path))).resolves.toBeUndefined();
    }
  });

  it("requires public rights/provenance and private-fixture receipts without public latent answers", async () => {
    for (const path of [
      "contributions/terminal-bench-science/source-family-rights-scan.json",
      "contributions/terminal-bench-science/source-family-rights-scan.md",
      "evaluation/terminal-bench/private-miniature-verifier-receipt.json",
      "evaluation/mast/preflight-manifest.json",
    ]) {
      await expect(access(rootFile(path))).resolves.toBeUndefined();
    }

    await expect(
      access(rootFile("evaluation/terminal-bench/private-fixture.json")),
    ).rejects.toBeDefined();
    await expect(
      access(rootFile("evaluation/terminal-bench/latent-answers.json")),
    ).rejects.toBeDefined();
  });

  it("requires executable MAST and Terminal-Bench verifier surfaces", async () => {
    for (const path of [
      "evaluation/mast/src/paired-condition.ts",
      "evaluation/mast/src/openai-adapter.ts",
      "evaluation/mast/src/preflight.ts",
      "evaluation/terminal-bench/verifier-contract.ts",
      "tests/external-evaluation-mast.test.ts",
      "tests/terminal-bench-miniature-verifier.test.ts",
    ]) {
      await expect(access(rootFile(path))).resolves.toBeUndefined();
    }
  });
});
