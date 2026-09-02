import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("external evaluation current-slice contract", () => {
  it("preserves the canonical parent program while advancing to the admitted blinded-evaluation slice", async () => {
    const task = JSON.parse(
      await readFile(rootFile("tasks/ACTIVE-TASK.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(task).toMatchObject({
      taskId: "askrigor-external-evaluation-contribution-v1",
      status: "active_zero_spend_mast_blinded_evaluation_v2_preflight_accepted",
      exclusive: true,
      requiredBranch: "task/mast-four-arm-zero-spend-harness-20260901",
      baselineCommit: "88eb6d252d7b7547d3a2039872bddc96707fee9e",
      boundedOutcome: expect.stringContaining("zero-spend 96-response four-arm base-generation pilot"),
      authorityPolicy: "governance/chat-work-authority-policy.json",
      activeDirective: "docs/directives/2026-09-01-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot.json",
      activeDirectiveAmendment:
        "docs/directives/2026-09-01-zero-spend-chatgpt-mast-consumer-tool-transport-amendment.json",
      activeEvaluatorDirective:
        "docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport-v2-recovery.json",
      activeLessonContract:
        "docs/state/MAST-FOUR-ARM-BASE-EVALUATION-ACTIVE-LESSON-CONTRACT.json",
      runtimeAdmissionBlocker:
        "docs/audits/2026-09-02-mast-runtime-admission-unavailable.json",
      activeRecoveryDirective:
        "docs/directives/2026-09-02-mast-runtime-admission-recovery.json",
      activeLiveLineageDirective:
        "docs/directives/2026-09-02-mast-live-lineage-admission-narrow-port.json",
      activeCredentialBootstrapDirective:
        "docs/directives/2026-09-02-mast-live-admission-credential-bootstrap.json",
      liveRuntimeAdmissionReceipt:
        "docs/audits/2026-09-02-mast-live-runtime-admission-accepted.json",
      evaluatorRuntimeAdmissionReceipt:
        "docs/audits/2026-09-02-mast-blinded-evaluator-v2-live-runtime-admission-accepted.json",
      currentState: "docs/state/MAST-FOUR-ARM-BASE-BLINDED-EVALUATION-CURRENT-STATE.md",
      codexCurrentState: "docs/state/MAST-FOUR-ARM-BASE-BLINDED-EVALUATION-CURRENT-STATE.md",
      currentSlice: {
        sliceId: "mast-four-arm-eight-family-base-blinded-evaluation-v1",
        status: "blinded_evaluation_v2_preflight_accepted_primary_dispatch_ready",
        maximumEstimatedCostUsdBeforeAbort: 0,
        conditionMapSealed: true,
        requiredChats: {
          primaryEvaluatorChats: 192,
          adjudicatorChats: "0_TO_96",
          mode: "EXTRA_HIGH",
          automaticRouting: true,
          ownerRelayPermitted: false,
        },
      },
      preflightCommand: expect.stringContaining("prepare-zero-spend-mast-four-arm-base-evaluation-v2.mts"),
      completionCommand: "npx tsx scripts/accept-zero-spend-mast-four-arm-base-evaluation-v2.mts --mast-root <PINNED_MAST_ROOT> --artifact-root <PRIVATE_ARTIFACT_ROOT>",
      completedGenerationSlice: {
        status: "accepted_and_source_bound_evaluator_directive_received",
        checkpoint: "a4ee25f8332d24e5a1b2ef37788def1daf854b40",
        primaryResponseCount: 96,
      },
      lastCompletedSlice: {
        sliceId: "zero-spend-chatgpt-mast-card001-calibration-v1",
        status: "protected_merge_complete",
        pullRequest: 180,
        mergeCommit: "88eb6d252d7b7547d3a2039872bddc96707fee9e",
      },
      supervision: {
        completionClaim: "EVALUATOR_TRANSPORT_V1_RETIRED_V2_RESTART_AUTHORIZED_FROM_ORDINAL_1",
        scientificAdequacy: "not reached; no evaluator judgment or arm/family result has been inspected or computed",
        releaseAdequacy: "unaffected; no paid run, external submission, protocol mutation, or production release",
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
      "scripts/prepare-zero-spend-mast-four-arm-base-pilot.mts",
      "scripts/accept-zero-spend-mast-four-arm-base-generation.mts",
      "scripts/zero-spend-mast-four-arm-base-evaluation.mts",
      "scripts/prepare-zero-spend-mast-four-arm-base-evaluation.mts",
      "scripts/validate-zero-spend-mast-evaluator-output.mts",
      "scripts/record-zero-spend-mast-evaluator-attempt.mts",
      "scripts/mast-blinded-evaluator-source-bridge.py",
      "scripts/zero-spend-mast-four-arm-base-evaluation-v2.mts",
      "scripts/prepare-zero-spend-mast-four-arm-base-evaluation-v2.mts",
      "scripts/validate-zero-spend-mast-evaluator-output-v2.mts",
      "scripts/record-zero-spend-mast-evaluator-attempt-v2.mts",
      "governance/chat-work-authority-policy.json",
      "docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json",
      "docs/directives/2026-09-01-zero-spend-chatgpt-mast-consumer-tool-transport-amendment.json",
      "docs/directives/2026-09-02-mast-runtime-admission-recovery.json",
      "docs/directives/2026-09-02-mast-live-lineage-admission-narrow-port.json",
      "docs/directives/2026-09-02-mast-live-admission-credential-bootstrap.json",
      "docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport.json",
      "docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport-v2-recovery.json",
      "docs/state/CODEX-CHAT-WORK-HOTFIX-CURRENT-STATE.md",
      "docs/state/MAST-FOUR-ARM-BASE-PILOT-CURRENT-STATE.md",
      "docs/state/MAST-FOUR-ARM-BASE-PILOT-ACTIVE-LESSON-CONTRACT.json",
      "docs/state/MAST-FOUR-ARM-BASE-EVALUATION-ACTIVE-LESSON-CONTRACT.json",
      "docs/state/MAST-FOUR-ARM-BASE-BLINDED-EVALUATION-CURRENT-STATE.md",
      "docs/audits/2026-09-01-mast-noharm-pilot-freeze-protected-merge.json",
      "docs/audits/2026-09-02-mast-runtime-admission-unavailable.json",
      "docs/audits/2026-09-02-mast-live-runtime-admission-accepted.json",
      "docs/audits/2026-09-02-zero-spend-chatgpt-mast-four-arm-base-generation-accepted.json",
      "docs/audits/2026-09-02-mast-blinded-evaluator-live-runtime-admission-accepted.json",
      "docs/audits/2026-09-02-mast-blinded-evaluator-v1-transport-retired.json",
      "docs/audits/2026-09-02-mast-blinded-evaluator-v2-live-runtime-admission-accepted.json",
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
