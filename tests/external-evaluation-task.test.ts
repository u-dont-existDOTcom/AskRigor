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
      status: "active_terminal_bench_observable_evidence_review_request",
      exclusive: true,
      requiredBranch: "task/terminal-bench-observable-evidence-review-request-v1-20260901",
      baselineCommit: "4a1e740fd239491a18de8c503b4ccf1f2c6143ca",
      boundedOutcome: expect.stringContaining("paired MAST evaluation"),
      currentSlice: {
        sliceId: "terminal-bench-observable-evidence-review-request-v1",
        status: "ready_for_protected_merge",
        maximumEstimatedCostUsdBeforeAbort: 0,
      },
      preflightCommand: "npm run external-evaluation:preflight",
      completionCommand: "npm run external-evaluation:acceptance",
      lastCompletedSlice: {
        sliceId: "terminal-bench-difficulty-probe-preflight-v1",
        pullRequest: 171,
        mergeCommit: "4a1e740fd239491a18de8c503b4ccf1f2c6143ca",
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
