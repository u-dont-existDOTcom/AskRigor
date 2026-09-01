import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const taskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  status: z.literal("active"),
  exclusive: z.literal(true),
  requiredBranch: z.literal("task/external-evaluation-execution-20260901"),
  baselineCommit: z.literal("7964674b8a3dac804620a0e7d1dff62b00a68bf2"),
  assuranceLane: z.literal("iteration_with_bounded_decision_evaluation"),
  preflightCommand: z.literal("npm run external-evaluation:preflight"),
  completionCommand: z.literal("npm run external-evaluation:acceptance"),
  previousCompletedTask: z.object({
    taskId: z.literal("askrigor-living-evidence-promotion-scheduler-v1"),
    releaseReceiptPullRequest: z.literal(166),
    releaseReceiptMergeCommit: z.literal("7964674b8a3dac804620a0e7d1dff62b00a68bf2"),
    productionActivated: z.literal(true),
  }),
  activeLessonContract: z.array(z.object({
    lesson: z.string().min(1),
    trigger: z.string().min(1),
    requiredBehavior: z.string().min(1),
    failureCondition: z.string().min(1),
    enforcement: z.string().min(1),
  })).min(5),
}).passthrough();

const activationSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  branch: z.literal("task/external-evaluation-execution-20260901"),
  baselineCommit: z.literal("7964674b8a3dac804620a0e7d1dff62b00a68bf2"),
  activationGates: z.object({
    schedulerTerminalReceiptOnProtectedMain: z.literal(true),
    freshProtectedMainResolved: z.literal(true),
    newerHumanAuthoredExclusiveTask: z.literal(false),
    onlyOpenPullRequestsAreRoutineDependabot: z.literal(true),
    deadlineFeasibleAtActivation: z.literal(true),
  }),
  scope: z.object({
    paidNoharmRun: z.literal(false),
    externalSubmission: z.literal(false),
    productionMutation: z.literal(false),
    publicParticipantOrInstitutionalWorkflow: z.literal(false),
  }).passthrough(),
  preAttemptActivation: z.literal("PASS"),
}).passthrough();

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function main(): Promise<void> {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const [taskText, activationText, currentState, plan] = await Promise.all([
    readFile(join(root, "tasks", "ACTIVE-TASK.json"), "utf8"),
    readFile(join(root, "docs", "audits", "2026-09-01-external-evaluation-activation.json"), "utf8"),
    readFile(join(root, "project", "CODEX-CURRENT-STATE.md"), "utf8"),
    readFile(join(root, "docs", "superpowers", "plans", "2026-09-01-external-evaluation-and-scientific-contribution.md"), "utf8"),
  ]);
  const task = taskSchema.parse(JSON.parse(taskText));
  activationSchema.parse(JSON.parse(activationText));

  const branch = git(root, ["branch", "--show-current"]);
  if (branch !== task.requiredBranch) {
    throw new Error(`ACTIVE_TASK_BRANCH_MISMATCH expected=${task.requiredBranch} actual=${branch || "detached"}`);
  }

  for (const required of [
    task.taskId,
    task.requiredBranch,
    task.preflightCommand,
    task.completionCommand,
  ]) {
    if (!currentState.includes(required)) {
      throw new Error(`CURRENT_STATE_TASK_BOUNDARY_MISSING value=${required}`);
    }
  }
  if (!plan.includes("**Status:** active")) {
    throw new Error("EXTERNAL_EVALUATION_PLAN_NOT_ACTIVE");
  }

  process.stdout.write(`${JSON.stringify({
    status: "ACTIVE_TASK_CONFIRMED",
    task_id: task.taskId,
    branch,
    baseline_commit: task.baselineCommit,
    assurance_lane: task.assuranceLane,
    completion_command: task.completionCommand,
    paid_noharm_run_authorized: false,
    external_submission_authorized: false,
    production_mutation_authorized: false,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown external-evaluation preflight failure";
  process.stderr.write(`External-evaluation preflight failed: ${message}\n`);
  process.exitCode = 1;
});
