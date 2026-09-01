import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const taskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal(
    "askrigor-living-evidence-free-contributor-private-entitlement-v1",
  ),
  status: z.enum(["active", "ready_for_protected_merge", "complete"]),
  exclusive: z.literal(true),
  requiredBranch: z.literal(
    "task/free-contributor-private-entitlement-20260901",
  ),
  baselineCommit: z.string().regex(/^[0-9a-f]{40}$/u),
  assuranceLane: z.enum(["iteration", "decision", "release"]),
  preflightCommand: z.literal("npm run contributor-access:preflight"),
  completionCommand: z.literal("npm run contributor-access:acceptance"),
  suspendedTaskSources: z.array(z.string().min(1)).min(1),
}).passthrough();

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function main(): Promise<void> {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const task = taskSchema.parse(JSON.parse(
    await readFile(join(root, "tasks", "ACTIVE-TASK.json"), "utf8"),
  ));
  const branch = git(root, ["branch", "--show-current"]);
  if (branch !== task.requiredBranch) {
    throw new Error(
      `ACTIVE_TASK_BRANCH_MISMATCH expected=${task.requiredBranch} actual=${branch || "detached"}`,
    );
  }
  execFileSync(
    "git",
    ["-C", root, "merge-base", "--is-ancestor", task.baselineCommit, "HEAD"],
    { stdio: "ignore" },
  );
  const currentState = await readFile(
    join(root, "project", "CODEX-CURRENT-STATE.md"),
    "utf8",
  );
  for (const required of [
    task.taskId,
    task.preflightCommand,
    task.completionCommand,
  ]) {
    if (!currentState.includes(required)) {
      throw new Error(`ACTIVE_TASK_CURRENT_STATE_MISMATCH missing=${required}`);
    }
  }
  process.stdout.write(`${JSON.stringify({
    status: "READY",
    task_id: task.taskId,
    task_status: task.status,
    assurance_lane: task.assuranceLane,
    branch,
    head: git(root, ["rev-parse", "HEAD"]),
    baseline: task.baselineCommit,
    suspended_task_sources: task.suspendedTaskSources.length,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message :
    "unknown contributor-access preflight failure";
  process.stderr.write(`Contributor-access preflight failed: ${message}\n`);
  process.exitCode = 1;
});
