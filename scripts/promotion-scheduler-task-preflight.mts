import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const activeTaskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-living-evidence-promotion-scheduler-v1"),
  status: z.enum(["active", "ready_for_protected_merge", "production_release_complete"]),
  exclusive: z.literal(true),
  requiredBranch: z.literal("task/promotion-scheduler-20260901"),
  baselineCommit: z.string().regex(/^[0-9a-f]{40}$/u),
  assuranceLane: z.literal("release"),
  ownerSourceReceipt: z.string().min(1),
  ownerSourceSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  preflightCommand: z.literal("npm run promotion-scheduler:preflight"),
  completionCommand: z.literal("npm run promotion-scheduler:acceptance"),
  suspendedTaskSources: z.array(z.string().min(1)).min(1),
  scheduler: z.object({
    service: z.literal("askrigor-research-promotion.service"),
    timer: z.literal("askrigor-research-promotion.timer"),
    cadence: z.literal("five_minutes"),
    maximumPromotionsPerActivation: z.literal(1),
    automaticScientificDecision: z.literal(false),
    productionActivated: z.boolean(),
  }),
}).passthrough();

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const task = activeTaskSchema.parse(
    JSON.parse(await readFile(join(root, "tasks", "ACTIVE-TASK.json"), "utf8")),
  );
  const branch = git(root, ["branch", "--show-current"]);
  if (branch !== task.requiredBranch) {
    throw new Error(
      `ACTIVE_TASK_BRANCH_MISMATCH expected=${task.requiredBranch} actual=${branch || "detached"}`,
    );
  }

  execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", task.baselineCommit, "HEAD"], {
    stdio: "ignore",
  });

  const [currentState, plan, ownerSource] = await Promise.all([
    readFile(join(root, "project", "CODEX-CURRENT-STATE.md"), "utf8"),
    readFile(join(root, "docs", "superpowers", "plans", "2026-09-01-promotion-scheduler.md"), "utf8"),
    readFile(join(root, task.ownerSourceReceipt), "utf8"),
  ]);
  for (const required of [task.taskId, task.preflightCommand, task.completionCommand]) {
    if (!currentState.includes(required)) {
      throw new Error(`ACTIVE_TASK_CURRENT_STATE_MISMATCH missing=${required}`);
    }
  }
  for (const required of [task.taskId, task.requiredBranch, task.baselineCommit]) {
    if (!plan.includes(required)) {
      throw new Error(`ACTIVE_TASK_PLAN_MISMATCH missing=${required}`);
    }
  }
  if (sha256(ownerSource) !== task.ownerSourceSha256) {
    throw new Error("OWNER_SOURCE_HASH_MISMATCH");
  }

  process.stdout.write(`${JSON.stringify({
    status: "READY",
    task_id: task.taskId,
    task_status: task.status,
    assurance_lane: task.assuranceLane,
    branch,
    head: git(root, ["rev-parse", "HEAD"]),
    baseline: task.baselineCommit,
    owner_source_sha256: task.ownerSourceSha256,
    maximum_promotions_per_activation: task.scheduler.maximumPromotionsPerActivation,
    automatic_scientific_decision: task.scheduler.automaticScientificDecision,
    production_activated: task.scheduler.productionActivated,
    suspended_task_sources: task.suspendedTaskSources.length,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown promotion-scheduler preflight failure";
  process.stderr.write(`Promotion-scheduler preflight failed: ${message}\n`);
  process.exitCode = 1;
});
