import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const activeTaskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-living-evidence-pilot-v1"),
  status: z.enum(["active", "ready_for_protected_merge", "complete"]),
  exclusive: z.literal(true),
  requiredBranch: z.string().min(1),
  pullRequest: z.number().int().positive().nullable(),
  assuranceLane: z.enum(["iteration", "decision", "release"]),
  preflightCommand: z.literal("npm run living-evidence:preflight"),
  completionCommand: z.literal("npm run living-evidence:acceptance"),
  integrationCommit: z.string().regex(/^[0-9a-f]{40}$/u),
  preservedLocalRollback: z.string().min(1),
  ownerApprovals: z.array(z.string().min(1)).min(3),
  suspendedTaskSources: z.array(z.string().min(1)).min(1),
}).passthrough();

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function assertAncestor(root: string, ancestor: string, descendant: string): void {
  execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", ancestor, descendant], {
    stdio: "ignore",
  });
}

async function main(): Promise<void> {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const task = activeTaskSchema.parse(
    JSON.parse(await readFile(join(root, "tasks", "ACTIVE-TASK.json"), "utf8")),
  );
  const currentBranch = git(root, ["branch", "--show-current"]);
  if (currentBranch !== task.requiredBranch) {
    throw new Error(
      `ACTIVE_TASK_BRANCH_MISMATCH expected=${task.requiredBranch} actual=${currentBranch || "detached"}`,
    );
  }

  const currentState = await readFile(
    join(root, "project", "CODEX-CURRENT-STATE.md"),
    "utf8",
  );
  for (const required of [task.taskId, task.preflightCommand, task.completionCommand]) {
    if (!currentState.includes(required)) {
      throw new Error(`ACTIVE_TASK_CURRENT_STATE_MISMATCH missing=${required}`);
    }
  }

  assertAncestor(root, task.integrationCommit, "HEAD");
  const rollbackCommit = git(root, ["rev-parse", task.preservedLocalRollback]);
  assertAncestor(root, rollbackCommit, task.integrationCommit);

  process.stdout.write(`${JSON.stringify({
    status: "READY",
    task_id: task.taskId,
    task_status: task.status,
    assurance_lane: task.assuranceLane,
    branch: currentBranch,
    head: git(root, ["rev-parse", "HEAD"]),
    integration_commit: task.integrationCommit,
    rollback_ref: task.preservedLocalRollback,
    rollback_commit: rollbackCommit,
    suspended_task_sources: task.suspendedTaskSources.length,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown preflight failure";
  process.stderr.write(`Living-evidence task preflight failed: ${message}\n`);
  process.exitCode = 1;
});
