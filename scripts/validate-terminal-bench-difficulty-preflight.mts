import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  inspectPrivateMiniatureForDifficulty,
  type DifficultyReadinessCode,
} from "../evaluation/terminal-bench/difficulty-probe-contract.js";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const receiptSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  sliceId: z.literal("terminal-bench-difficulty-probe-preflight-v1"),
  state: z.literal("FRONTIER_PROBE_BLOCKED_AGENT_INPUT_INCOMPLETE"),
  privateBoundary: z.object({
    directoryOutsideRepository: z.literal(true),
    directoryMode: z.literal("0700"),
    fileMode: z.literal("0600"),
    fileCount: z.literal(7),
    agentFacingFiles: z.tuple([z.literal("fixture.json")]),
    graderOnlyFiles: z.array(z.string().min(1)).length(6),
    graderOnlyValuesReadByDifficultyEvaluator: z.literal(false),
    graderOnlyStructureInspected: z.literal(true),
    fixtureSha256: sha256,
  }),
  readiness: z.object({
    ready: z.literal(false),
    findingCount: z.number().int().positive(),
    codes: z.array(z.enum([
      "TASK_INSTRUCTIONS_MISSING",
      "TARGET_ESTIMAND_MISSING",
      "REQUESTED_OUTPUTS_MISSING",
      "REQUESTED_SENSITIVITIES_MISSING",
      "REPORT_OBSERVED_EVIDENCE_MISSING",
      "REPORT_NUMERICAL_INPUT_MISSING",
      "AGENT_BUNDLE_SCHEMA_INVALID",
      "AGENT_INPUT_HASH_MISMATCH",
      "GRADER_ONLY_FIELD_DISCLOSED",
      "GRADER_ARTIFACT_IDENTITY_DISCLOSED",
      "AGENT_BUNDLE_EVIDENCE_COVERAGE_INCOMPLETE",
    ])).min(1),
  }),
  execution: z.object({
    frontierAgentInvoked: z.literal(false),
    paidInferencePerformed: z.literal(false),
    externalSubmissionPerformed: z.literal(false),
    maximumEstimatedCostUsdBeforeAbort: z.literal(0),
  }),
  repairBoundary: z.object({
    required: z.literal(true),
    independentMethodReviewRequired: z.literal(true),
  }).passthrough(),
  completion: z.object({
    typedClaim: z.literal("SUBTASK_COMPLETE_PARENT_OPEN"),
  }).passthrough(),
}).passthrough();

const proofReceiptSchema = z.object({
  fixtureSha256: sha256,
  oracleSha256: sha256,
  alternateImplementationSha256: sha256,
  fixturePublished: z.literal(false),
  latentAnswersPublished: z.literal(false),
});

function root(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function uniqueCodes(codes: DifficultyReadinessCode[]): string[] {
  return [...new Set(codes)];
}

async function main(): Promise<void> {
  const repositoryRoot = root();
  const [receiptValue, proofValue] = await Promise.all([
    readJson(join(repositoryRoot, "evaluation/terminal-bench/difficulty-preflight-receipt.json")),
    readJson(join(repositoryRoot, "evaluation/terminal-bench/private-miniature-verifier-receipt.json")),
  ]);
  const receipt = receiptSchema.parse(receiptValue);
  const proof = proofReceiptSchema.parse(proofValue);
  if (receipt.privateBoundary.fixtureSha256 !== proof.fixtureSha256) {
    throw new Error("DIFFICULTY_PREFLIGHT_FIXTURE_RECEIPT_MISMATCH");
  }
  const privateIndex = process.argv.indexOf("--private-dir");
  let privateInspection: "not_requested" | "pass" = "not_requested";
  if (privateIndex >= 0) {
    const privateDirectory = process.argv[privateIndex + 1];
    if (!privateDirectory) {
      throw new Error("DIFFICULTY_PREFLIGHT_PRIVATE_DIRECTORY_MISSING");
    }
    const inspected = await inspectPrivateMiniatureForDifficulty(
      privateDirectory,
      proof.fixtureSha256,
      [proof.oracleSha256, proof.alternateImplementationSha256],
    );
    const inspectedCodes = uniqueCodes(inspected.readiness.findings.map(({ code }) => code));
    if (
      inspected.readiness.ready
      || inspected.readiness.findings.length !== receipt.readiness.findingCount
      || JSON.stringify(inspectedCodes) !== JSON.stringify(receipt.readiness.codes)
      || inspected.graderOnlyContentRead
    ) {
      throw new Error("DIFFICULTY_PREFLIGHT_PRIVATE_INSPECTION_MISMATCH");
    }
    privateInspection = "pass";
  }
  process.stdout.write(`${JSON.stringify({
    status: "PREFLIGHT_COMPLETE_FRONTIER_PROBE_NOT_READY",
    task_id: receipt.taskId,
    fixture_sha256: proof.fixtureSha256,
    readiness: receipt.readiness,
    private_inspection: privateInspection,
    frontier_agent_invoked: receipt.execution.frontierAgentInvoked,
    paid_inference_performed: receipt.execution.paidInferencePerformed,
    external_submission_performed: receipt.execution.externalSubmissionPerformed,
    completion: receipt.completion,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown difficulty-preflight validation failure";
  process.stderr.write(`Terminal-Bench difficulty preflight failed: ${message}\n`);
  process.exitCode = 1;
});
