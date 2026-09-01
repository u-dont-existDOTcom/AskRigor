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
import { validateBenchmarkGovernance } from "../evaluation/governance/src/validate.js";
import { observableEvidenceReviewRequestSchema } from
  "../evaluation/terminal-bench/observable-evidence-review-request-contract.js";
import { noharmPilotManifestSchema } from "../evaluation/mast/src/noharm-pilot.js";

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

const difficultyPreflightReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  sliceId: z.literal("terminal-bench-difficulty-probe-preflight-v1"),
  state: z.literal("FRONTIER_PROBE_BLOCKED_AGENT_INPUT_INCOMPLETE"),
  privateBoundary: z.object({
    directoryOutsideRepository: z.literal(true),
    directoryMode: z.literal("0700"),
    fileMode: z.literal("0600"),
    graderOnlyValuesReadByDifficultyEvaluator: z.literal(false),
    fixtureSha256: sha256,
  }).passthrough(),
  readiness: z.object({
    ready: z.literal(false),
    findingCount: z.literal(17),
    codes: z.array(z.string()).min(7),
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
}).passthrough();

const mastNoHarmProtectedMergeReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("mast_noharm_pilot_freeze_protected_merge"),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  sliceId: z.literal("mast-noharm-pilot-analysis-freeze-v1"),
  source: z.object({
    pullRequest: z.literal(175),
    reviewedHead: z.literal("117f05b5ea5173fe8ba26415bfbc825baeee909a"),
    exactTestedCandidate: z.literal("cf9465c1d232b39b73c0a2bfa65c8bd00912c85b"),
    exactTestedTree: z.literal("461fcdcb2c68168baf9867a72cf22bf440a370dd"),
    mergeCommit: z.literal("a1d4aaf0fe2010edc5cec13e6c431877a311d074"),
    mergedAt: z.literal("2026-09-01T17:22:46Z"),
  }).passthrough(),
  protectedChecks: z.object({
    allPassed: z.literal(true),
    names: z.array(z.string()).min(7),
  }).passthrough(),
  scope: z.object({
    modelInferencePerformed: z.literal(false),
    judgeInferencePerformed: z.literal(false),
    paidInferencePerformed: z.literal(false),
    externalSubmissionPerformed: z.literal(false),
    productionMutation: z.literal(false),
    protocolMutation: z.literal(false),
  }),
}).passthrough();

const supervisionAuthorityFeedbackSchema = z.object({
  schemaVersion: z.literal(1),
  packetType: z.literal("SUPERVISION_DESIGN_FEEDBACK"),
  severity: z.literal("IMMEDIATE_RISK"),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  ownerCorrection: z.object({
    codexAuthority: z.literal("bounded execution for tasks Chat cannot execute"),
    paidApiEvaluation: z.literal("cancelled"),
    preferredReasoningSurface: z.literal("Extra High ChatGPT"),
    ownerRelayRequestsPermitted: z.literal(false),
  }).passthrough(),
  route: z.object({
    sent: z.literal(true),
    responseStatus: z.literal("pending"),
  }).passthrough(),
  alignment: z.object({
    operationalAlignment: z.literal("failed"),
    scientificAdequacy: z.literal("not_reached_no_inference_run"),
    releaseAdequacy: z.literal("unaffected_no_spend_or_release"),
  }).passthrough(),
}).passthrough();

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
    status: z.literal("active_mast_noharm_pilot_freeze"),
    requiredBranch: z.literal("task/mast-noharm-merge-closeout-20260901"),
    currentSlice: z.object({
      sliceId: z.literal("mast-noharm-pilot-analysis-freeze-v1"),
      status: z.literal("protected_merge_complete"),
      maximumEstimatedCostUsdBeforeAbort: z.literal(0),
    }).passthrough(),
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
    difficultyPreflight: join(root, "evaluation", "terminal-bench", "difficulty-preflight-receipt.json"),
    observableEvidenceReviewRequest: join(
      root,
      "contributions",
      "terminal-bench-science",
      "observable-evidence-review-request.json",
    ),
    noharmPilot: join(root, "evaluation", "mast", "noharm-pilot-manifest.json"),
    mastNoHarmProtectedMerge: join(
      root,
      "docs",
      "audits",
      "2026-09-01-mast-noharm-pilot-freeze-protected-merge.json",
    ),
    supervisionAuthorityFeedback: join(
      root,
      "docs",
      "audits",
      "2026-09-01-supervision-design-feedback-chat-work-authority-gate.json",
    ),
  };
  const requiredCode = [
    "evaluation/mast/src/paired-condition.ts",
    "evaluation/mast/src/openai-adapter.ts",
    "evaluation/mast/src/preflight.ts",
    "evaluation/terminal-bench/verifier-contract.ts",
    "tests/external-evaluation-mast.test.ts",
    "tests/terminal-bench-miniature-verifier.test.ts",
    "evaluation/governance/benchmark-manifest.schema.json",
    "evaluation/governance/defect-ledger.schema.json",
    "evaluation/governance/src/validate.ts",
    "evaluation/governance/instances/mast-sct-preflight.manifest.json",
    "evaluation/governance/instances/mast-sct-preflight.defects.json",
    "evaluation/governance/instances/terminal-bench-private-miniature.manifest.json",
    "evaluation/governance/instances/terminal-bench-private-miniature.defects.json",
    "tests/external-evaluation-governance.test.ts",
    "evaluation/terminal-bench/difficulty-probe-contract.ts",
    "scripts/validate-terminal-bench-difficulty-preflight.mts",
    "tests/terminal-bench-difficulty-preflight.test.ts",
    "evaluation/terminal-bench/observable-evidence-review-request-contract.ts",
    "scripts/validate-observable-evidence-review-request.mts",
    "tests/observable-evidence-review-request.test.ts",
    "docs/audits/2026-09-01-terminal-bench-difficulty-preflight-protected-merge.json",
    "evaluation/mast/src/noharm-pilot.ts",
    "scripts/validate-mast-noharm-pilot.mts",
    "tests/mast-noharm-pilot.test.ts",
    "docs/audits/2026-09-01-terminal-bench-observable-evidence-review-request-protected-merge.json",
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

  const [
    rights,
    privateReceipt,
    mastPreflight,
    difficultyPreflight,
    observableEvidenceReviewRequest,
    noharmPilot,
    mastNoHarmProtectedMerge,
    supervisionAuthorityFeedback,
    rightsMd,
  ] = await Promise.all([
    readJson(paths.rights),
    readJson(paths.privateReceipt),
    readJson(paths.mastPreflight),
    readJson(paths.difficultyPreflight),
    readJson(paths.observableEvidenceReviewRequest),
    readJson(paths.noharmPilot),
    readJson(paths.mastNoHarmProtectedMerge),
    readJson(paths.supervisionAuthorityFeedback),
    readFile(paths.rightsMd, "utf8"),
  ]);
  const parsedRights = rightsScanSchema.parse(rights);
  const parsedPrivateReceipt = privateReceiptSchema.parse(privateReceipt);
  const parsedMastPreflight = mastPreflightSchema.parse(mastPreflight);
  const parsedDifficultyPreflight = difficultyPreflightReceiptSchema.parse(difficultyPreflight);
  const parsedObservableEvidenceReviewRequest = observableEvidenceReviewRequestSchema.parse(
    observableEvidenceReviewRequest,
  );
  const parsedNoHarmPilot = noharmPilotManifestSchema.parse(noharmPilot);
  const parsedMastNoHarmProtectedMerge = mastNoHarmProtectedMergeReceiptSchema.parse(
    mastNoHarmProtectedMerge,
  );
  const parsedSupervisionAuthorityFeedback = supervisionAuthorityFeedbackSchema.parse(
    supervisionAuthorityFeedback,
  );
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
  const governance = await validateBenchmarkGovernance(root);
  if (
    parsedDifficultyPreflight.privateBoundary.fixtureSha256 !== parsedPrivateReceipt.fixtureSha256
    || governance.recordedDefectCount !== 1
  ) {
    throw new Error("DIFFICULTY_PREFLIGHT_GOVERNANCE_BINDING_MISMATCH");
  }

  process.stdout.write(`${JSON.stringify({
    status: "PROTECTED_MERGE_CLOSEOUT_VERIFIED",
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
    governance,
    difficulty_preflight: {
      state: parsedDifficultyPreflight.state,
      ready: parsedDifficultyPreflight.readiness.ready,
      finding_count: parsedDifficultyPreflight.readiness.findingCount,
      frontier_agent_invoked: parsedDifficultyPreflight.execution.frontierAgentInvoked,
    },
    observable_evidence_review_request: {
      state: parsedObservableEvidenceReviewRequest.state,
      issue_url: parsedObservableEvidenceReviewRequest.publicRequest.issueUrl,
      current_verdict: parsedObservableEvidenceReviewRequest.reviewBoundary.currentVerdict,
      frontier_probe_blocked:
        parsedObservableEvidenceReviewRequest.releaseGate.frontierProbeBlockedUntilBothPass,
    },
    noharm_pilot: {
      state: parsedNoHarmPilot.state,
      pilot_classification: parsedNoHarmPilot.pilot.classification,
      pilot_base_cases: parsedNoHarmPilot.pilot.baseCaseIds.length,
      untouched_confirmation_base_cases:
        parsedNoHarmPilot.confirmation.untouchedBaseCaseIds.length,
      confirmation_partial_corpus: parsedNoHarmPilot.confirmation.partialCorpus,
      analysis_freeze: parsedNoHarmPilot.analysisFreeze.state,
      model_inference_performed: parsedNoHarmPilot.execution.modelInferencePerformed,
      judge_inference_performed: parsedNoHarmPilot.execution.judgeInferencePerformed,
      maximum_estimated_cost_usd_before_abort:
        parsedNoHarmPilot.execution.maximumEstimatedCostUsdBeforeAbort,
    },
    protected_merge: {
      pull_request: parsedMastNoHarmProtectedMerge.source.pullRequest,
      merge_commit: parsedMastNoHarmProtectedMerge.source.mergeCommit,
      all_checks_passed: parsedMastNoHarmProtectedMerge.protectedChecks.allPassed,
    },
    supervision: {
      packet_type: parsedSupervisionAuthorityFeedback.packetType,
      paid_api_evaluation: parsedSupervisionAuthorityFeedback.ownerCorrection.paidApiEvaluation,
      owner_relay_requests_permitted:
        parsedSupervisionAuthorityFeedback.ownerCorrection.ownerRelayRequestsPermitted,
      route_sent: parsedSupervisionAuthorityFeedback.route.sent,
      response_status: parsedSupervisionAuthorityFeedback.route.responseStatus,
    },
    completion: {
      typedClaim: "SUBTASK_COMPLETE_PARENT_OPEN",
      operationalAlignment: "sealed_zero_spend_noharm_pilot_and_freeze_boundary",
      scientificAdequacy: "pilot_plan_only_no_results_or_hrp_claim",
      releaseAdequacy: "protected_source_merge_complete_no_paid_inference_external_submission_or_production_release",
    },
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown external-evaluation acceptance failure";
  process.stderr.write(`External-evaluation acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
