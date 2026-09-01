import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const taskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  status: z.literal("active_mast_noharm_pilot_freeze"),
  exclusive: z.literal(true),
  requiredBranch: z.literal("task/mast-noharm-pilot-freeze-v1-20260901"),
  baselineCommit: z.literal("5919cb07161b0a4ea23a07f3de4cadbc640acf5f"),
  assuranceLane: z.literal("evaluation_and_scientific_governance"),
  preflightCommand: z.literal("npm run external-evaluation:preflight"),
  completionCommand: z.literal("npm run external-evaluation:acceptance"),
  currentSlice: z.object({
    sliceId: z.literal("mast-noharm-pilot-analysis-freeze-v1"),
    status: z.enum(["implementation_active", "ready_for_protected_merge"]),
    maximumEstimatedCostUsdBeforeAbort: z.literal(0),
  }).passthrough(),
  previousCompletedTask: z.object({
    taskId: z.literal("askrigor-living-evidence-promotion-scheduler-v1"),
    releaseReceiptMergeCommit: z.literal("7964674b8a3dac804620a0e7d1dff62b00a68bf2"),
  }).passthrough(),
  lessonQueue: z.object({
    open: z.literal(0),
    needsReview: z.literal(0),
    acceptedNotIncorporated: z.literal(0),
  }).passthrough(),
}).passthrough();

const activationSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("active_task_transition_candidate"),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  pullRequest: z.literal(168),
  activationBranch: z.literal("task/external-evaluation-phase22-20260901"),
  activationBaseline: z.literal("7964674b8a3dac804620a0e7d1dff62b00a68bf2"),
  activationGates: z.object({
    previousExclusiveTaskTerminal: z.literal(true),
    freshProtectedMainResolved: z.literal(true),
    newerCompetingExclusiveTaskFound: z.literal(false),
    externalDeadlineFeasible: z.literal(true),
  }),
  hardBoundaries: z.array(z.string().min(1)).min(5),
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
