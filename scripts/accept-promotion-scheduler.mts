import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const receiptSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-living-evidence-promotion-scheduler-v1"),
  branch: z.literal("task/promotion-scheduler-20260901"),
  baselineCommit: z.literal("c7138eff5dbbce22bb25f727da78006e543fa476"),
  productionActivated: z.literal(false),
  artifacts: z.object({
    serviceSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    timerSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    runbookSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
  verification: z.object({
    redTestCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    focusedTests: z.literal("pass"),
    typecheck: z.literal("pass"),
    systemdAnalyzeVerify: z.literal("pass"),
    calendarVerify: z.literal("pass"),
    diffCheck: z.literal("pass"),
  }),
  completion: z.object({
    typedClaim: z.literal("SUBTASK_COMPLETE_PARENT_OPEN"),
    operationalAlignment: z.literal("pass_local_candidate"),
    scientificAdequacy: z.literal("preserved_not_expanded"),
    releaseAdequacy: z.literal("pending_protected_merge_and_production_activation"),
  }),
});

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
  const task = z.object({
    taskId: z.literal("askrigor-living-evidence-promotion-scheduler-v1"),
    status: z.literal("ready_for_protected_merge"),
    requiredBranch: z.literal("task/promotion-scheduler-20260901"),
    completionReceipt: z.literal("docs/audits/2026-09-01-promotion-scheduler-candidate.json"),
    scheduler: z.object({
      maximumPromotionsPerActivation: z.literal(1),
      automaticScientificDecision: z.literal(false),
      productionActivated: z.literal(false),
    }),
  }).passthrough().parse(
    JSON.parse(await readFile(join(root, "tasks", "ACTIVE-TASK.json"), "utf8")),
  );
  const branch = git(root, ["branch", "--show-current"]);
  if (branch !== task.requiredBranch) {
    throw new Error(`ACTIVE_TASK_BRANCH_MISMATCH expected=${task.requiredBranch} actual=${branch || "detached"}`);
  }

  const paths = {
    service: join(root, "deploy", "systemd", "askrigor-research-promotion.service"),
    timer: join(root, "deploy", "systemd", "askrigor-research-promotion.timer"),
    runbook: join(root, "docs", "research-contribution-promotion-scheduler.md"),
  };
  const [service, timer, runbook, receiptText] = await Promise.all([
    readFile(paths.service, "utf8"),
    readFile(paths.timer, "utf8"),
    readFile(paths.runbook, "utf8"),
    readFile(join(root, task.completionReceipt), "utf8"),
  ]);
  const receipt = receiptSchema.parse(JSON.parse(receiptText));
  const actualHashes = {
    serviceSha256: sha256(service),
    timerSha256: sha256(timer),
    runbookSha256: sha256(runbook),
  };
  if (JSON.stringify(actualHashes) !== JSON.stringify(receipt.artifacts)) {
    throw new Error("PROMOTION_SCHEDULER_ARTIFACT_HASH_MISMATCH");
  }

  execFileSync("systemd-analyze", ["verify", paths.service, paths.timer], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const calendar = execFileSync(
    "systemd-analyze",
    ["calendar", "*-*-* *:00/5:00 UTC", "--iterations=3"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!calendar.includes("Normalized form: *-*-* *:00/5:00 UTC")) {
    throw new Error("PROMOTION_SCHEDULER_CALENDAR_MISMATCH");
  }

  for (const prohibited of ["/bin/bash", "/bin/sh", "sh -c", "runtime.env", "ASKRIGOR_LIVING_EVIDENCE_DATABASE_URL"]) {
    if (service.includes(prohibited)) {
      throw new Error(`PROMOTION_SCHEDULER_PROHIBITED_UNIT_CONTENT value=${prohibited}`);
    }
  }
  for (const required of [
    "living-evidence-admin promote-accepted",
    "--no-deps --pull never",
    "one accepted intent per activation",
    "no scientific decision",
    "Do not delete",
  ]) {
    if (!`${service}\n${timer}\n${runbook}`.includes(required)) {
      throw new Error(`PROMOTION_SCHEDULER_REQUIRED_CONTENT_MISSING value=${required}`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    status: "READY_FOR_PROTECTED_MERGE",
    task_id: task.taskId,
    branch,
    head: git(root, ["rev-parse", "HEAD"]),
    artifacts: actualHashes,
    maximum_promotions_per_activation: 1,
    automatic_scientific_decision: false,
    production_activated: false,
    completion: receipt.completion,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown promotion-scheduler acceptance failure";
  process.stderr.write(`Promotion-scheduler acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
