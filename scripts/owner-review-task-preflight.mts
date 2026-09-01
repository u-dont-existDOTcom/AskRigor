import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const taskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-owner-review-promotion-v1"),
  status: z.enum(["in_progress", "ready_for_protected_merge", "complete"]),
  exclusive: z.literal(true),
  requiredBranch: z.literal("task/owner-review-promotion-20260901"),
  baselineCommit: z.literal("ef8b713e9b5320d3ebe8e47ec2cea98095431e90"),
  assuranceLane: z.literal("iteration"),
  plan: z.string().min(1),
  ownerSourceReceipt: z.string().min(1),
  directiveReceipt: z.string().min(1),
  preflightCommand: z.literal("npm run owner-review:preflight"),
  completionCommand: z.literal("npm run owner-review:acceptance"),
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
  const [ownerSource, directive, plan] = await Promise.all([
    readFile(join(root, task.ownerSourceReceipt), "utf8"),
    readFile(join(root, task.directiveReceipt), "utf8"),
    readFile(join(root, task.plan), "utf8"),
  ]);
  const directiveRecord = JSON.parse(directive) as {
    ownerSource?: {
      fileSha256?: string;
      fileBytes?: number;
      ownerOutcomeSha256WithoutFinalNewline?: string;
      ownerOutcomeBytesWithoutFinalNewline?: number;
    };
    directive?: { candidateStandardToolCount?: number; mergeOrDeployAuthorized?: boolean };
  };
  const ownerSourceSha256 = createHash("sha256").update(ownerSource).digest("hex");
  if (
    directiveRecord.ownerSource?.fileSha256 !== ownerSourceSha256 ||
    directiveRecord.ownerSource.fileBytes !== Buffer.byteLength(ownerSource, "utf8")
  ) {
    throw new Error("OWNER_SOURCE_RECEIPT_MISMATCH");
  }
  if (!ownerSource.endsWith("\n") || ownerSource.endsWith("\n\n")) {
    throw new Error("OWNER_OUTCOME_NORMALIZATION_AMBIGUOUS");
  }
  const ownerOutcome = ownerSource.slice(0, -1);
  const ownerOutcomeSha256 = createHash("sha256")
    .update(ownerOutcome)
    .digest("hex");
  if (
    directiveRecord.ownerSource.ownerOutcomeSha256WithoutFinalNewline !==
      ownerOutcomeSha256 ||
    directiveRecord.ownerSource.ownerOutcomeBytesWithoutFinalNewline !==
      Buffer.byteLength(ownerOutcome, "utf8")
  ) {
    throw new Error("OWNER_OUTCOME_RECEIPT_MISMATCH");
  }
  if (
    directiveRecord.directive?.candidateStandardToolCount !== 27 ||
    directiveRecord.directive?.mergeOrDeployAuthorized !== false
  ) {
    throw new Error("OWNER_REVIEW_DIRECTIVE_BOUNDARY_MISMATCH");
  }
  for (const required of [
    "accepted_pending_promotion",
    "SUBTASK_COMPLETE_PARENT_OPEN",
    "No raw chat",
  ]) {
    if (!plan.includes(required)) {
      throw new Error(`OWNER_REVIEW_PLAN_INCOMPLETE missing=${required}`);
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
    owner_source_sha256: ownerSourceSha256,
    owner_source_bytes: Buffer.byteLength(ownerSource, "utf8"),
    owner_outcome_sha256_without_final_newline: ownerOutcomeSha256,
    owner_outcome_bytes_without_final_newline: Buffer.byteLength(
      ownerOutcome,
      "utf8",
    ),
    candidate_standard_tool_count: 27,
    merge_or_deploy_authorized: false,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message :
    "unknown owner-review preflight failure";
  process.stderr.write(`Owner-review preflight failed: ${message}\n`);
  process.exitCode = 1;
});
