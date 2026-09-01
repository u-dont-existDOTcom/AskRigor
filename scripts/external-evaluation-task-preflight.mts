import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  validateCanonicalDirective,
  validateCanonicalPolicy,
  type CanonicalDirective,
  type ChatWorkPolicy,
} from "./validate-chat-work-authority-policy.mjs";

const taskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  status: z.literal("active_zero_spend_chatgpt_mast_operational_smoke"),
  exclusive: z.literal(true),
  requiredBranch: z.literal("hotfix/chat-reasoning-zero-spend-routing-20260901"),
  baselineCommit: z.literal("a1d4aaf0fe2010edc5cec13e6c431877a311d074"),
  assuranceLane: z.literal("evaluation_and_scientific_governance"),
  authorityPolicy: z.literal("governance/chat-work-authority-policy.json"),
  activeDirective: z.literal("docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json"),
  currentState: z.literal("docs/state/EXTERNAL-EVALUATION-CHAT-WORK-HOTFIX-CURRENT-STATE.md"),
  codexCurrentState: z.literal("project/CODEX-CHAT-WORK-HOTFIX-CURRENT-STATE.md"),
  preflightCommand: z.literal("npx tsx scripts/validate-chat-work-authority-policy.mts"),
  completionCommand: z.literal("npx tsx scripts/accept-zero-spend-chatgpt-mast-smoke.mts"),
  currentSlice: z.object({
    sliceId: z.literal("zero-spend-chatgpt-mast-operational-smoke-v1"),
    status: z.literal("directive_ready_execution_not_started"),
    maximumEstimatedCostUsdBeforeAbort: z.literal(0),
    requiredChats: z.object({
      responseChats: z.literal(2),
      evaluatorChats: z.literal(1),
      mode: z.literal("EXTRA_HIGH"),
      automaticRouting: z.literal(true),
      ownerRelayPermitted: z.literal(false),
    }).passthrough(),
  }).passthrough(),
  lastCompletedSlice: z.object({
    sliceId: z.literal("mast-noharm-pilot-analysis-freeze-v1"),
    status: z.literal("protected_merge_complete"),
    pullRequest: z.literal(175),
    mergeCommit: z.literal("a1d4aaf0fe2010edc5cec13e6c431877a311d074"),
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

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function main(): Promise<void> {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const task = taskSchema.parse(await readJson(join(root, "tasks", "ACTIVE-TASK.json")));
  const branch = git(root, ["branch", "--show-current"]);
  if (branch !== task.requiredBranch) {
    throw new Error(`ACTIVE_TASK_BRANCH_MISMATCH expected=${task.requiredBranch} actual=${branch || "detached"}`);
  }
  try {
    git(root, ["merge-base", "--is-ancestor", task.baselineCommit, "HEAD"]);
  } catch {
    throw new Error(`ACTIVE_TASK_BASELINE_NOT_ANCESTOR baseline=${task.baselineCommit}`);
  }

  const [policy, directive, agents, currentState, codexCurrentState] = await Promise.all([
    readJson<ChatWorkPolicy>(join(root, task.authorityPolicy)),
    readJson<CanonicalDirective>(join(root, task.activeDirective)),
    readFile(join(root, "AGENTS.md"), "utf8"),
    readFile(join(root, task.currentState), "utf8"),
    readFile(join(root, task.codexCurrentState), "utf8"),
  ]);

  const findings = [
    ...validateCanonicalPolicy(policy),
    ...validateCanonicalDirective(policy, directive),
  ];
  for (const required of [
    "ChatGPT Project Manager/Extra High/Pro owns reasoning",
    "must never ask Joel to say `send it`",
    "paid model API inference is forbidden",
    task.requiredBranch,
    task.activeDirective,
    task.completionCommand,
  ]) {
    if (![agents, currentState, codexCurrentState].some((text) => text.includes(required))) {
      findings.push(`CURRENT_AUTHORITY_BOUNDARY_MISSING value=${required}`);
    }
  }

  if (findings.length > 0) throw new Error(findings.join("\n"));

  process.stdout.write(`${JSON.stringify({
    status: "ACTIVE_ZERO_SPEND_CHATGPT_MAST_DIRECTIVE_CONFIRMED",
    task_id: task.taskId,
    branch,
    baseline_commit: task.baselineCommit,
    policy_id: policy.policyId,
    directive_id: directive.directiveId,
    current_state: task.currentState,
    codex_current_state: task.codexCurrentState,
    maximum_model_api_spend_usd: policy.ownerAuthority.maximumModelApiSpendUsd,
    paid_model_api_inference_authorized: false,
    internal_supervisor_routing_automatic: policy.internalSupervisorRouting.automatic,
    owner_relay_permitted: policy.internalSupervisorRouting.ownerRelayPermitted,
    codex_semantic_authority: false,
    completion_command: task.completionCommand,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown external-evaluation preflight failure";
  process.stderr.write(`External-evaluation preflight failed: ${message}\n`);
  process.exitCode = 1;
});
