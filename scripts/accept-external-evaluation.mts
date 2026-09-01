import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  BARE_SYSTEM_INSTRUCTIONS,
  createPairedMastConditions,
  loadCanonicalHrpInstructions,
} from "../evaluation/mast/src/paired-condition.js";
import { canonicalSha256 } from "../evaluation/terminal-bench/verifier-contract.js";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);

const rightsScanSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  capturedAt: z.string().datetime(),
  selection: z.object({
    disposition: z.literal("transparent_semisynthetic"),
    realTreatmentClaimPermitted: z.literal(false),
    copyrightedFullTextRedistributed: z.literal(false),
    identifiablePatientDataUsed: z.literal(false),
  }),
  sources: z.array(z.object({
    sourceId: z.string().min(1),
    authority: z.string().min(1),
    url: z.string().url(),
    capturedAt: z.string().datetime(),
    rightsState: z.enum(["compatible", "conditional", "incompatible", "not_selected"]),
    redistributionDecision: z.enum(["reference_only", "metadata_only", "derived_structure_only", "not_used"]),
    limitations: z.array(z.string()),
  })).min(5),
  decision: z.object({
    publicTaskInputs: z.literal("project-authored fictional reports and structured data"),
    realSourceUse: z.literal("methods, structural failure patterns, and provenance only"),
    latentTruthLocation: z.literal("outside_public_repository"),
    externalSubmissionRequiresFreshRightsReview: z.literal(true),
  }),
});

const privateReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  privateDirectoryOutsideRepository: z.literal(true),
  privateDirectoryMode: z.literal("0700"),
  fixturePublished: z.literal(false),
  latentAnswersPublished: z.literal(false),
  publicReceiptContainsLatentAnswers: z.literal(false),
  fixtureSha256: sha256,
  oracleSha256: sha256,
  alternateImplementationSha256: sha256,
  verifierSha256: sha256,
  verification: z.object({
    correctImplementationsPassed: z.number().int().min(2),
    seededInvalidImplementations: z.number().int().min(5),
    seededInvalidImplementationsRejected: z.number().int().min(5),
    verifierMutants: z.number().int().min(5),
    verifierMutantsKilled: z.number().int().min(5),
    falseAccepts: z.literal(0),
    falseRejects: z.literal(0),
  }).refine((value) => value.seededInvalidImplementations === value.seededInvalidImplementationsRejected, {
    message: "all seeded invalid implementations must be rejected",
  }).refine((value) => value.verifierMutants === value.verifierMutantsKilled, {
    message: "all declared verifier mutants must be killed",
  }),
});

const mastPreflightSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  state: z.literal("SEALED_PREFLIGHT_NO_MODEL_RUN"),
  source: z.object({
    repository: z.literal("ARISENetwork/mast"),
    commit: z.literal("57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee"),
    tree: z.literal("f73e1cb717d3e76353b190abc13739d7f3476798"),
  }),
  protocols: z.object({
    universalSha256: sha256,
    hrpSha256: sha256,
  }),
  conditions: z.object({
    model: z.string().min(1),
    endpoint: z.string().url(),
    sharedSettingsSha256: sha256,
    onlyDeclaredDifference: z.literal("system_instructions"),
    bareInstructionSha256: sha256,
    hrpInstructionSha256: sha256,
    sharedSettings: z.object({
      endpoint: z.string().url(),
      model: z.string().min(1),
      reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh", "max"]),
      maxOutputTokens: z.number().int().positive(),
      store: z.literal(false),
      timeoutSeconds: z.number().int().positive(),
      maximumRetries: z.number().int().min(0).max(3),
      maximumEstimatedCostUsdBeforeAbort: z.number().nonnegative(),
      inputPriceUsdPerMillionTokens: z.number().nonnegative(),
      outputPriceUsdPerMillionTokens: z.number().nonnegative(),
    }),
  }),
  execution: z.object({
    paidInferencePerformed: z.literal(false),
    noharmJudgePerformed: z.literal(false),
    rawResponsesStored: z.literal(false),
    deterministicSctExamplePreflight: z.literal("pass"),
    timeoutSeconds: z.number().int().positive(),
    maximumRetries: z.number().int().min(0).max(3),
    maximumEstimatedCostUsdBeforeAbort: z.number().nonnegative(),
  }),
});

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main(): Promise<void> {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const task = z.object({
    taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
    status: z.literal("active_bounded_candidate_protected_merge_pending"),
    requiredBranch: z.literal("task/external-evaluation-phase22-execution-20260901"),
  }).passthrough().parse(await readJson(join(root, "tasks", "ACTIVE-TASK.json")));
  const branch = git(root, ["branch", "--show-current"]);
  if (branch !== task.requiredBranch) {
    throw new Error(`ACTIVE_TASK_BRANCH_MISMATCH expected=${task.requiredBranch} actual=${branch || "detached"}`);
  }

  const paths = {
    rights: join(root, "contributions", "terminal-bench-science", "source-family-rights-scan.json"),
    rightsMd: join(root, "contributions", "terminal-bench-science", "source-family-rights-scan.md"),
    privateReceipt: join(root, "evaluation", "terminal-bench", "private-miniature-verifier-receipt.json"),
    mastPreflight: join(root, "evaluation", "mast", "preflight-manifest.json"),
  };
  const requiredCode = [
    "evaluation/mast/src/paired-condition.ts",
    "evaluation/mast/src/openai-adapter.ts",
    "evaluation/mast/src/preflight.ts",
    "evaluation/terminal-bench/verifier-contract.ts",
    "tests/external-evaluation-mast.test.ts",
    "tests/terminal-bench-miniature-verifier.test.ts",
  ];
  const findings: string[] = [];
  for (const path of [...Object.values(paths), ...requiredCode.map((path) => join(root, path))]) {
    try {
      await access(path);
    } catch {
      findings.push(`REQUIRED_ARTIFACT_MISSING path=${path.slice(root.length + 1)}`);
    }
  }
  for (const prohibited of [
    "evaluation/terminal-bench/private-fixture.json",
    "evaluation/terminal-bench/latent-answers.json",
  ]) {
    try {
      await access(join(root, prohibited));
      findings.push(`PUBLIC_LATENT_ARTIFACT_PRESENT path=${prohibited}`);
    } catch {
      // Absence is required.
    }
  }
  if (findings.length > 0) {
    throw new Error(findings.join("\n"));
  }

  const [rights, privateReceipt, mastPreflight, rightsMd] = await Promise.all([
    readJson(paths.rights),
    readJson(paths.privateReceipt),
    readJson(paths.mastPreflight),
    readFile(paths.rightsMd, "utf8"),
  ]);
  const parsedRights = rightsScanSchema.parse(rights);
  const parsedPrivateReceipt = privateReceiptSchema.parse(privateReceipt);
  const parsedMastPreflight = mastPreflightSchema.parse(mastPreflight);
  for (const prohibited of ["patient name", "date of birth", "latent answer", "real treatment caused"] ) {
    if (rightsMd.toLowerCase().includes(prohibited)) {
      throw new Error(`RIGHTS_SCAN_PROHIBITED_CONTENT value=${prohibited}`);
    }
  }
  const verifierPath = join(root, "evaluation", "terminal-bench", "verifier-contract.ts");
  if (await fileSha256(verifierPath) !== parsedPrivateReceipt.verifierSha256) {
    throw new Error("PRIVATE_RECEIPT_VERIFIER_HASH_MISMATCH");
  }
  const protocol = await loadCanonicalHrpInstructions(root);
  if (
    createHash("sha256").update(protocol.universalBytes).digest("hex")
      !== parsedMastPreflight.protocols.universalSha256
    || createHash("sha256").update(protocol.hrpBytes).digest("hex")
      !== parsedMastPreflight.protocols.hrpSha256
  ) {
    throw new Error("MAST_PREFLIGHT_PROTOCOL_HASH_MISMATCH");
  }
  if (
    parsedMastPreflight.conditions.endpoint !== parsedMastPreflight.conditions.sharedSettings.endpoint
    || parsedMastPreflight.conditions.model !== parsedMastPreflight.conditions.sharedSettings.model
    || canonicalSha256(parsedMastPreflight.conditions.sharedSettings)
      !== parsedMastPreflight.conditions.sharedSettingsSha256
    || parsedMastPreflight.execution.timeoutSeconds
      !== parsedMastPreflight.conditions.sharedSettings.timeoutSeconds
    || parsedMastPreflight.execution.maximumRetries
      !== parsedMastPreflight.conditions.sharedSettings.maximumRetries
    || parsedMastPreflight.execution.maximumEstimatedCostUsdBeforeAbort
      !== parsedMastPreflight.conditions.sharedSettings.maximumEstimatedCostUsdBeforeAbort
  ) {
    throw new Error("MAST_PREFLIGHT_SHARED_SETTINGS_MISMATCH");
  }
  const paired = createPairedMastConditions(
    parsedMastPreflight.conditions.sharedSettings,
    BARE_SYSTEM_INSTRUCTIONS,
    protocol.combinedInstructions,
  );
  if (
    paired.bare.sharedSettingsSha256 !== parsedMastPreflight.conditions.sharedSettingsSha256
    || paired.bare.systemInstructionsSha256 !== parsedMastPreflight.conditions.bareInstructionSha256
    || paired.hrp.systemInstructionsSha256 !== parsedMastPreflight.conditions.hrpInstructionSha256
  ) {
    throw new Error("MAST_PREFLIGHT_CONDITION_HASH_MISMATCH");
  }

  process.stdout.write(`${JSON.stringify({
    status: "READY_FOR_PROTECTED_MERGE",
    task_id: task.taskId,
    branch,
    source_count: parsedRights.sources.length,
    source_disposition: parsedRights.selection.disposition,
    private_fixture_published: parsedPrivateReceipt.fixturePublished,
    correct_implementations_passed: parsedPrivateReceipt.verification.correctImplementationsPassed,
    invalid_implementations_rejected: parsedPrivateReceipt.verification.seededInvalidImplementationsRejected,
    verifier_mutants_killed: parsedPrivateReceipt.verification.verifierMutantsKilled,
    mast_state: parsedMastPreflight.state,
    paid_inference_performed: parsedMastPreflight.execution.paidInferencePerformed,
    completion: {
      typedClaim: "SUBTASK_COMPLETE_PARENT_OPEN",
      operationalAlignment: "pass_bounded_rights_verifier_and_sealed_preflight",
      scientificAdequacy: "miniature_verifier_validated_no_benchmark_result_claimed",
      releaseAdequacy: "pending_protected_merge_no_production_release",
    },
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown external-evaluation acceptance failure";
  process.stderr.write(`External-evaluation acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
