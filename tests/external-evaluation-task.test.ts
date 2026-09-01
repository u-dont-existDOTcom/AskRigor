import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("external evaluation current-slice contract", () => {
  it("preserves the canonical parent program while closing only the bounded child slice", async () => {
    const task = JSON.parse(
      await readFile(rootFile("tasks/ACTIVE-TASK.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(task).toMatchObject({
      taskId: "askrigor-external-evaluation-contribution-v1",
      status: "active_mast_noharm_pilot_freeze",
      exclusive: true,
      requiredBranch: "task/mast-noharm-merge-closeout-20260901",
      baselineCommit: "a1d4aaf0fe2010edc5cec13e6c431877a311d074",
      boundedOutcome: expect.stringContaining("paired MAST evaluation"),
      currentSlice: {
        sliceId: "mast-noharm-pilot-analysis-freeze-v1",
        status: "protected_merge_complete",
        maximumEstimatedCostUsdBeforeAbort: 0,
      },
      preflightCommand: "npm run external-evaluation:preflight",
      completionCommand: "npm run external-evaluation:acceptance",
      lastCompletedSlice: {
        sliceId: "mast-noharm-pilot-analysis-freeze-v1",
        pullRequest: 175,
        mergeCommit: "a1d4aaf0fe2010edc5cec13e6c431877a311d074",
      },
      supervision: {
        ownerCorrection: expect.stringContaining("Chat owns reasoning"),
        missionControl: {
          durablePacket:
            "docs/audits/2026-09-01-supervision-design-feedback-chat-work-authority-gate.json",
          routeStatus: "sent_response_pending",
        },
      },
    });
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
