import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("external evaluation current-slice contract", () => {
  it("preserves the canonical parent program while advancing to the zero-spend Chat-supervision slice", async () => {
    const task = JSON.parse(
      await readFile(rootFile("tasks/ACTIVE-TASK.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(task).toMatchObject({
      taskId: "askrigor-external-evaluation-contribution-v1",
      status: "active_chat_supervision_zero_spend_hotfix",
      exclusive: true,
      requiredBranch: "hotfix/chat-supervision-zero-spend-routing-20260901",
      baselineCommit: "a1d4aaf0fe2010edc5cec13e6c431877a311d074",
      ownerObjective: expect.stringContaining("Determine whether HRP improves or degrades"),
      boundedOutcome: expect.stringContaining("paired MAST evaluation performed without paid API model inference"),
      currentSlice: {
        sliceId: "mast-noharm-chatgpt-consumer-supervision-v1",
        status: "chat_reasoning_directive_issued_mechanical_execution_pending",
        maximumEstimatedCostUsdBeforeAbort: 0,
        reasoningSurface: "CHATGPT_EXTRA_HIGH_OR_PRO",
        executor: "CODEX_OR_WORK_BOUNDED_MECHANICAL_ONLY",
      },
      preflightCommand: "npm run external-evaluation:preflight",
      completionCommand: "npm run external-evaluation:acceptance",
      lastCompletedSlice: {
        sliceId: "mast-noharm-pilot-analysis-freeze-v1",
        pullRequest: 175,
        mergeCommit: "a1d4aaf0fe2010edc5cec13e6c431877a311d074",
        status: "protected_merge_complete_zero_spend_plan_only",
      },
      supervision: {
        latestOwnerCorrection: "NO_PAID_API_CHAT_REASONING_CODEX_EXECUTION_ONLY_AUTOMATIC_SUPERVISOR_ROUTING",
        scientificAdequacy: "NOT_REACHED_NO_INFERENCE_RUN",
        releaseAdequacy: "UNAFFECTED_NO_PAID_RUN_OR_RELEASE",
      },
    });

    const currentSlice = task.currentSlice as { excluded?: string[] };
    expect(currentSlice.excluded).toContain("paid MAST or NOHARM model inference");
    expect(currentSlice.excluded).toContain("paid judge inference");
    expect(currentSlice.excluded).toContain("asking Joel to relay the packet or say send it");
  });

  it("provides branch-bound preflight and artifact acceptance commands", async () => {
    const packageJson = JSON.parse(
      await readFile(rootFile("package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["external-evaluation:preflight"]).toBe(
      "tsx scripts/external-evaluation-task-preflight.mts",
    );
    expect(packageJson.scripts?.["external-evaluation:acceptance"]).toBe(
      "tsx scripts/accept-external-evaluation.mts",
    );
    await access(rootFile("scripts/external-evaluation-task-preflight.mts"));
    await access(rootFile("scripts/accept-external-evaluation.mts"));
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
