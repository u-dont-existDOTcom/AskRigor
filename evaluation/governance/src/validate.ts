import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import * as formatsModule from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";

type JsonRecord = Record<string, unknown>;

interface GovernanceInstancePair {
  manifest: string;
  ledger: string;
}

export interface GovernanceValidationResult {
  status: "PASS";
  schemaVersion: 1;
  manifestCount: number;
  defectLedgerCount: number;
  recordedDefectCount: number;
  noDefectClaimMade: false;
  policyMutantsRejected: number;
  crossArtifactBindingsVerified: number;
  benchmarkTargetIntegrityReviewCount: number;
  benchmarkTargetConflictCount: number;
  benchmarkTargetTuningAllowedCount: number;
  paidInferencePerformed: false;
  latentAnswersPublished: false;
}

export type BenchmarkConformity = "CONFORMS" | "DOES_NOT_CONFORM" | "MIXED";
export type BenchmarkTargetClinicalValidity =
  | "CONSISTENT_WITH_CURRENT_HIGH_AUTHORITY_EVIDENCE"
  | "MATERIALLY_INCONSISTENT"
  | "CONTESTABLE";
export type BenchmarkProtocolChangeBasis = "GENERALIZED_CLINICAL_DEFECT" | "BENCHMARK_SCORE_ONLY";

export interface BenchmarkTargetIntegrityReview {
  itemId: string;
  exactPopulation: string;
  timing: string;
  decisionContext: string;
  highAuthorityEvidence: readonly string[];
  evidenceCurrentnessChecked: boolean;
  benchmarkConformity: BenchmarkConformity;
  clinicalValidity: BenchmarkTargetClinicalValidity;
  protocolChangeBasis: BenchmarkProtocolChangeBasis;
}

export interface BenchmarkTargetIntegrityDecision {
  itemId: string;
  classification: "BENCHMARK_TARGET_ALIGNED" | "BENCHMARK_TARGET_CONFLICT";
  benchmarkConformity: BenchmarkConformity;
  clinicalValidity: BenchmarkTargetClinicalValidity;
  protocolTuningAllowed: boolean;
  frozenOfficialResultDisposition: "PRESERVE_UNCHANGED";
}

const INSTANCE_PAIRS: GovernanceInstancePair[] = [
  {
    manifest: "evaluation/governance/instances/mast-sct-preflight.manifest.json",
    ledger: "evaluation/governance/instances/mast-sct-preflight.defects.json",
  },
  {
    manifest: "evaluation/governance/instances/terminal-bench-private-miniature.manifest.json",
    ledger: "evaluation/governance/instances/terminal-bench-private-miniature.defects.json",
  },
];

const BENCHMARK_TARGET_INTEGRITY_REVIEWS_PATH =
  "evaluation/governance/development/benchmark-target-integrity-reviews.json";
const BENCHMARK_CONFORMITY_VALUES: readonly BenchmarkConformity[] = [
  "CONFORMS",
  "DOES_NOT_CONFORM",
  "MIXED",
];
const BENCHMARK_TARGET_CLINICAL_VALIDITY_VALUES: readonly BenchmarkTargetClinicalValidity[] = [
  "CONSISTENT_WITH_CURRENT_HIGH_AUTHORITY_EVIDENCE",
  "MATERIALLY_INCONSISTENT",
  "CONTESTABLE",
];
const BENCHMARK_PROTOCOL_CHANGE_BASIS_VALUES: readonly BenchmarkProtocolChangeBasis[] = [
  "GENERALIZED_CLINICAL_DEFECT",
  "BENCHMARK_SCORE_ONLY",
];

const addFormats = (formatsModule as unknown as { default: FormatsPlugin }).default;

export function assessBenchmarkTargetIntegrity(
  review: BenchmarkTargetIntegrityReview,
): BenchmarkTargetIntegrityDecision {
  const requiredText = [review.itemId, review.exactPopulation, review.timing, review.decisionContext];
  const evidenceComplete = Array.isArray(review.highAuthorityEvidence)
    && review.highAuthorityEvidence.length > 0
    && review.highAuthorityEvidence.every(
      (source) => typeof source === "string" && source.trim().length > 0,
    );
  if (requiredText.some((value) => typeof value !== "string" || value.trim().length === 0)
    || !evidenceComplete
    || review.evidenceCurrentnessChecked !== true
    || !BENCHMARK_CONFORMITY_VALUES.includes(review.benchmarkConformity)
    || !BENCHMARK_TARGET_CLINICAL_VALIDITY_VALUES.includes(review.clinicalValidity)
    || !BENCHMARK_PROTOCOL_CHANGE_BASIS_VALUES.includes(review.protocolChangeBasis)) {
    throw new Error("BENCHMARK_TARGET_INTEGRITY_REVIEW_INCOMPLETE");
  }

  const classification = review.clinicalValidity === "CONSISTENT_WITH_CURRENT_HIGH_AUTHORITY_EVIDENCE"
    ? "BENCHMARK_TARGET_ALIGNED"
    : "BENCHMARK_TARGET_CONFLICT";

  return {
    itemId: review.itemId,
    classification,
    benchmarkConformity: review.benchmarkConformity,
    clinicalValidity: review.clinicalValidity,
    protocolTuningAllowed: classification === "BENCHMARK_TARGET_ALIGNED"
      && review.protocolChangeBasis === "GENERALIZED_CLINICAL_DEFECT",
    frozenOfficialResultDisposition: "PRESERVE_UNCHANGED",
  };
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`GOVERNANCE_EXPECTED_OBJECT path=${label}`);
  }
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`GOVERNANCE_EXPECTED_ARRAY path=${label}`);
  }
  return value;
}

function at(record: JsonRecord, key: string, label: string): unknown {
  if (!(key in record)) {
    throw new Error(`GOVERNANCE_REQUIRED_FIELD_MISSING path=${label}.${key}`);
  }
  return record[key];
}

function equal(actual: unknown, expected: unknown, code: string): void {
  if (actual !== expected) {
    throw new Error(`${code} expected=${String(expected)} actual=${String(actual)}`);
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"}:${error.keyword}`)
    .join(",");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function exactKeys(record: JsonRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`GOVERNANCE_EXACT_KEYS_MISMATCH path=${label}`);
  }
}

async function validateBenchmarkTargetIntegrityReviews(root: string): Promise<{
  reviewCount: number;
  conflictCount: number;
  tuningAllowedCount: number;
}> {
  const artifact = asRecord(
    await readJson(join(root, BENCHMARK_TARGET_INTEGRITY_REVIEWS_PATH)),
    BENCHMARK_TARGET_INTEGRITY_REVIEWS_PATH,
  );
  exactKeys(artifact, [
    "schemaVersion",
    "classification",
    "frozenBenchmarkResultsDisposition",
    "privateClinicalPayloadIncluded",
    "validationClaimPermitted",
    "reviews",
  ], BENCHMARK_TARGET_INTEGRITY_REVIEWS_PATH);
  equal(artifact.schemaVersion, 1, "BENCHMARK_TARGET_INTEGRITY_SCHEMA_VERSION_MISMATCH");
  equal(
    artifact.classification,
    "DEVELOPMENT_REGRESSION_ONLY",
    "BENCHMARK_TARGET_INTEGRITY_CLASSIFICATION_MISMATCH",
  );
  equal(
    artifact.frozenBenchmarkResultsDisposition,
    "PRESERVE_UNCHANGED",
    "BENCHMARK_TARGET_INTEGRITY_FROZEN_RESULT_DISPOSITION_MISMATCH",
  );
  equal(artifact.privateClinicalPayloadIncluded, false, "BENCHMARK_TARGET_INTEGRITY_PRIVATE_PAYLOAD_PRESENT");
  equal(artifact.validationClaimPermitted, false, "BENCHMARK_TARGET_INTEGRITY_VALIDATION_CLAIM_PERMITTED");

  const reviews = asArray(at(artifact, "reviews", BENCHMARK_TARGET_INTEGRITY_REVIEWS_PATH), `${BENCHMARK_TARGET_INTEGRITY_REVIEWS_PATH}.reviews`);
  if (reviews.length === 0) {
    throw new Error("BENCHMARK_TARGET_INTEGRITY_REVIEW_REGISTRY_EMPTY");
  }
  let conflictCount = 0;
  let tuningAllowedCount = 0;
  for (const [index, value] of reviews.entries()) {
    const label = `${BENCHMARK_TARGET_INTEGRITY_REVIEWS_PATH}.reviews[${index}]`;
    const record = asRecord(value, label);
    exactKeys(record, ["review", "expectedDecision"], label);
    const reviewRecord = asRecord(at(record, "review", label), `${label}.review`);
    exactKeys(reviewRecord, [
      "itemId",
      "exactPopulation",
      "timing",
      "decisionContext",
      "highAuthorityEvidence",
      "evidenceCurrentnessChecked",
      "benchmarkConformity",
      "clinicalValidity",
      "protocolChangeBasis",
    ], `${label}.review`);
    const decision = assessBenchmarkTargetIntegrity({
      itemId: at(reviewRecord, "itemId", `${label}.review`) as string,
      exactPopulation: at(reviewRecord, "exactPopulation", `${label}.review`) as string,
      timing: at(reviewRecord, "timing", `${label}.review`) as string,
      decisionContext: at(reviewRecord, "decisionContext", `${label}.review`) as string,
      highAuthorityEvidence: asArray(
        at(reviewRecord, "highAuthorityEvidence", `${label}.review`),
        `${label}.review.highAuthorityEvidence`,
      ) as string[],
      evidenceCurrentnessChecked: at(reviewRecord, "evidenceCurrentnessChecked", `${label}.review`) as boolean,
      benchmarkConformity: at(reviewRecord, "benchmarkConformity", `${label}.review`) as BenchmarkConformity,
      clinicalValidity: at(reviewRecord, "clinicalValidity", `${label}.review`) as BenchmarkTargetClinicalValidity,
      protocolChangeBasis: at(reviewRecord, "protocolChangeBasis", `${label}.review`) as BenchmarkProtocolChangeBasis,
    });
    const expected = asRecord(at(record, "expectedDecision", label), `${label}.expectedDecision`);
    exactKeys(expected, Object.keys(decision), `${label}.expectedDecision`);
    for (const [key, actual] of Object.entries(decision)) {
      equal(actual, expected[key], `BENCHMARK_TARGET_INTEGRITY_DECISION_MISMATCH path=${label}.${key}`);
    }
    if (decision.classification === "BENCHMARK_TARGET_CONFLICT") conflictCount += 1;
    if (decision.protocolTuningAllowed) tuningAllowedCount += 1;
  }
  return { reviewCount: reviews.length, conflictCount, tuningAllowedCount };
}

export async function compileGovernanceSchemas(root: string): Promise<{
  validateManifest: ValidateFunction;
  validateLedger: ValidateFunction;
}> {
  const [manifestSchema, ledgerSchema] = await Promise.all([
    readJson(join(root, "evaluation/governance/benchmark-manifest.schema.json")),
    readJson(join(root, "evaluation/governance/defect-ledger.schema.json")),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return {
    validateManifest: ajv.compile(manifestSchema as AnySchema),
    validateLedger: ajv.compile(ledgerSchema as AnySchema),
  };
}

function artifactIdentity(record: JsonRecord, label: string): JsonRecord {
  return asRecord(at(record, "identity", label), `${label}.identity`);
}

function findArtifact(manifest: JsonRecord, role: string): JsonRecord {
  const artifacts = asArray(at(manifest, "artifacts", "manifest"), "manifest.artifacts");
  const artifact = artifacts
    .map((value, index) => asRecord(value, `manifest.artifacts[${index}]`))
    .find((value) => value.role === role);
  if (artifact === undefined) {
    throw new Error(`GOVERNANCE_ARTIFACT_ROLE_MISSING role=${role}`);
  }
  return artifact;
}

function baseDefectEntry(): JsonRecord {
  return {
    id: "schema-contract-probe-1",
    discoveredAt: "2026-09-01T15:50:00Z",
    itemOrPath: "synthetic/probe",
    field: "reference target",
    class: "REFERENCE_TARGET_ERROR",
    before: { representation: "TEXT", value: "old" },
    proposedAfter: { representation: "TEXT", value: "new" },
    verdict: "bounded schema contract probe",
    reason: "Synthetic validation-only record; not a benchmark defect.",
    evidence: [{ kind: "REPRODUCTION", value: "synthetic contract probe" }],
    impact: {
      affectedItems: ["synthetic/probe"],
      affectedEpochs: [],
      scoreMayChange: true,
      programConclusionMayChange: false,
      boundedStatement: "Schema validation only.",
    },
    severity: "NOT_ESTABLISHED",
    status: "SUSPECTED",
    discoverer: "schema-contract-probe",
    independentRecheckRequired: true,
  };
}

export function assertDefectLedgerPolicyMutants(validateLedger: ValidateFunction): number {
  const ledger = (entry: JsonRecord): JsonRecord => ({
    schemaVersion: 1,
    benchmarkId: "schema-contract-probe",
    evaluatorVersion: "v1",
    manifestIdentity: "a".repeat(64),
    entries: [entry],
  });
  const validSuspected = ledger(baseDefectEntry());
  if (!validateLedger(validSuspected)) {
    throw new Error(`DEFECT_LEDGER_VALID_PROBE_REJECTED errors=${formatErrors(validateLedger.errors)}`);
  }

  const correctedWithoutRecheck = {
    ...baseDefectEntry(),
    status: "CORRECTED",
    correction: {
      version: "v2",
      releasedAt: "2026-09-01T15:51:00Z",
      artifactHashes: ["b".repeat(64)],
    },
  };
  const refutedWithoutRecheck = { ...baseDefectEntry(), status: "REFUTED" };
  const correctedWithoutCorrection = {
    ...baseDefectEntry(),
    status: "CORRECTED",
    recheck: {
      reviewer: "independent-domain-reviewer",
      reviewedAt: "2026-09-01T15:51:00Z",
      decision: "CONFIRM",
      reason: "Synthetic validation-only recheck.",
      evidenceArtifactHash: null,
    },
  };
  const suspectedWithReleasedCorrection = {
    ...baseDefectEntry(),
    correction: {
      version: "v2",
      releasedAt: "2026-09-01T15:51:00Z",
      artifactHashes: ["b".repeat(64)],
    },
  };
  const mutants = [
    correctedWithoutRecheck,
    refutedWithoutRecheck,
    correctedWithoutCorrection,
    suspectedWithReleasedCorrection,
  ];
  for (const [index, mutant] of mutants.entries()) {
    if (validateLedger(ledger(mutant))) {
      throw new Error(`DEFECT_LEDGER_POLICY_MUTANT_SURVIVED index=${index}`);
    }
  }
  return mutants.length;
}

async function verifyLocalArtifactHashes(root: string, manifest: JsonRecord): Promise<number> {
  let verified = 0;
  for (const [index, value] of asArray(at(manifest, "artifacts", "manifest"), "manifest.artifacts").entries()) {
    const artifact = asRecord(value, `manifest.artifacts[${index}]`);
    const identity = artifactIdentity(artifact, `manifest.artifacts[${index}]`);
    if (identity.kind !== "SHA256" || typeof identity.path !== "string") {
      continue;
    }
    equal(
      await sha256(join(root, identity.path)),
      identity.value,
      `GOVERNANCE_LOCAL_ARTIFACT_HASH_MISMATCH role=${String(artifact.role)}`,
    );
    verified += 1;
  }
  return verified;
}

export async function validateBenchmarkGovernance(root: string): Promise<GovernanceValidationResult> {
  const { validateManifest, validateLedger } = await compileGovernanceSchemas(root);
  const manifests = new Map<string, JsonRecord>();
  const ledgers = new Map<string, JsonRecord>();
  let recordedDefectCount = 0;
  let crossArtifactBindingsVerified = 0;
  const targetIntegrity = await validateBenchmarkTargetIntegrityReviews(root);

  for (const pair of INSTANCE_PAIRS) {
    const [manifestValue, ledgerValue, manifestHash] = await Promise.all([
      readJson(join(root, pair.manifest)),
      readJson(join(root, pair.ledger)),
      sha256(join(root, pair.manifest)),
    ]);
    if (!validateManifest(manifestValue)) {
      throw new Error(`BENCHMARK_MANIFEST_SCHEMA_INVALID path=${pair.manifest} errors=${formatErrors(validateManifest.errors)}`);
    }
    if (!validateLedger(ledgerValue)) {
      throw new Error(`DEFECT_LEDGER_SCHEMA_INVALID path=${pair.ledger} errors=${formatErrors(validateLedger.errors)}`);
    }
    const manifest = asRecord(manifestValue, pair.manifest);
    const ledger = asRecord(ledgerValue, pair.ledger);
    const benchmark = asRecord(at(manifest, "benchmark", pair.manifest), `${pair.manifest}.benchmark`);
    const evaluator = asRecord(at(manifest, "evaluator", pair.manifest), `${pair.manifest}.evaluator`);
    equal(ledger.benchmarkId, benchmark.id, "DEFECT_LEDGER_BENCHMARK_ID_MISMATCH");
    equal(ledger.evaluatorVersion, evaluator.version, "DEFECT_LEDGER_EVALUATOR_VERSION_MISMATCH");
    equal(ledger.manifestIdentity, manifestHash, "DEFECT_LEDGER_MANIFEST_HASH_MISMATCH");
    const entries = asArray(at(ledger, "entries", pair.ledger), `${pair.ledger}.entries`);
    recordedDefectCount += entries.length;
    manifests.set(String(benchmark.id), manifest);
    ledgers.set(String(benchmark.id), ledger);
    crossArtifactBindingsVerified += 3;
    crossArtifactBindingsVerified += await verifyLocalArtifactHashes(root, manifest);
  }

  const [mastPreflightValue, terminalReceiptValue] = await Promise.all([
    readJson(join(root, "evaluation/mast/preflight-manifest.json")),
    readJson(join(root, "evaluation/terminal-bench/private-miniature-verifier-receipt.json")),
  ]);
  const mastPreflight = asRecord(mastPreflightValue, "evaluation/mast/preflight-manifest.json");
  const terminalReceipt = asRecord(
    terminalReceiptValue,
    "evaluation/terminal-bench/private-miniature-verifier-receipt.json",
  );
  const mast = manifests.get("mast-sct");
  const terminal = manifests.get("terminal-bench-dependency-aware-clinical-meta-analysis-miniature");
  if (mast === undefined || terminal === undefined) {
    throw new Error("GOVERNANCE_REQUIRED_INSTANCE_MISSING");
  }

  const mastSource = asRecord(at(mastPreflight, "source", "mastPreflight"), "mastPreflight.source");
  const mastSourceArtifacts = asRecord(at(mastSource, "artifacts", "mastPreflight.source"), "mastPreflight.source.artifacts");
  const mastBenchmark = asRecord(at(mast, "benchmark", "mast"), "mast.benchmark");
  const mastEvaluator = asRecord(at(mast, "evaluator", "mast"), "mast.evaluator");
  const mastSubject = asRecord(at(mast, "subjectUnderTest", "mast"), "mast.subjectUnderTest");
  equal(
    asRecord(at(mastBenchmark, "sourceIdentity", "mast.benchmark"), "mast.benchmark.sourceIdentity").value,
    mastSource.commit,
    "MAST_GOVERNANCE_SOURCE_IDENTITY_MISMATCH",
  );
  equal(
    asRecord(at(mastEvaluator, "sourceIdentity", "mast.evaluator"), "mast.evaluator.sourceIdentity").value,
    mastSourceArtifacts["benchmarks/sct/score.py"],
    "MAST_GOVERNANCE_EVALUATOR_IDENTITY_MISMATCH",
  );
  equal(
    asRecord(at(mastSubject, "identity", "mast.subjectUnderTest"), "mast.subjectUnderTest.identity").value,
    mastSourceArtifacts["benchmarks/sct/examples/gpt-5.5.jsonl"],
    "MAST_GOVERNANCE_SUBJECT_IDENTITY_MISMATCH",
  );
  const mastConditions = asArray(at(mast, "conditions", "mast"), "mast.conditions")
    .map((value, index) => asRecord(value, `mast.conditions[${index}]`));
  const mastConditionSource = asRecord(at(mastPreflight, "conditions", "mastPreflight"), "mastPreflight.conditions");
  equal(
    asRecord(at(mastConditions[0]!, "instructionIdentity", "mast.conditions[0]"), "mast.conditions[0].instructionIdentity").value,
    mastConditionSource.bareInstructionSha256,
    "MAST_GOVERNANCE_BARE_CONDITION_MISMATCH",
  );
  equal(
    asRecord(at(mastConditions[1]!, "instructionIdentity", "mast.conditions[1]"), "mast.conditions[1].instructionIdentity").value,
    mastConditionSource.hrpInstructionSha256,
    "MAST_GOVERNANCE_HRP_CONDITION_MISMATCH",
  );
  const mastRun = asRecord(at(mast, "run", "mast"), "mast.run");
  const mastExecution = asRecord(at(mastPreflight, "execution", "mastPreflight"), "mastPreflight.execution");
  equal(mastRun.inferencePerformed, mastExecution.paidInferencePerformed, "MAST_GOVERNANCE_INFERENCE_STATE_MISMATCH");
  crossArtifactBindingsVerified += 6;

  const terminalBenchmark = asRecord(at(terminal, "benchmark", "terminal"), "terminal.benchmark");
  const terminalSubject = asRecord(at(terminal, "subjectUnderTest", "terminal"), "terminal.subjectUnderTest");
  const terminalEvaluator = asRecord(at(terminal, "evaluator", "terminal"), "terminal.evaluator");
  equal(
    asRecord(at(terminalBenchmark, "datasetIdentity", "terminal.benchmark"), "terminal.benchmark.datasetIdentity").value,
    terminalReceipt.fixtureSha256,
    "TERMINAL_GOVERNANCE_FIXTURE_IDENTITY_MISMATCH",
  );
  equal(
    asRecord(at(terminalEvaluator, "sourceIdentity", "terminal.evaluator"), "terminal.evaluator.sourceIdentity").value,
    terminalReceipt.verifierSha256,
    "TERMINAL_GOVERNANCE_VERIFIER_IDENTITY_MISMATCH",
  );
  const implementationIdentities = asArray(
    at(terminalSubject, "implementations", "terminal.subjectUnderTest"),
    "terminal.subjectUnderTest.implementations",
  ).map((value, index) => artifactIdentity(
    asRecord(value, `terminal.subjectUnderTest.implementations[${index}]`),
    `terminal.subjectUnderTest.implementations[${index}]`,
  ));
  equal(implementationIdentities[0]?.value, terminalReceipt.oracleSha256, "TERMINAL_GOVERNANCE_ORACLE_IDENTITY_MISMATCH");
  equal(
    implementationIdentities[1]?.value,
    terminalReceipt.alternateImplementationSha256,
    "TERMINAL_GOVERNANCE_ALTERNATE_IDENTITY_MISMATCH",
  );
  for (const [index, identity] of implementationIdentities.entries()) {
    equal(identity.path, null, `TERMINAL_PRIVATE_IMPLEMENTATION_PATH_EXPOSED index=${index}`);
  }
  const privateFixtureArtifact = artifactIdentity(
    findArtifact(terminal, "private_fixture_identity"),
    "terminal.private_fixture_identity",
  );
  equal(privateFixtureArtifact.path, null, "TERMINAL_PRIVATE_FIXTURE_PATH_EXPOSED");
  equal(terminalReceipt.fixturePublished, false, "TERMINAL_PRIVATE_FIXTURE_PUBLICATION_STATE_MISMATCH");
  equal(terminalReceipt.latentAnswersPublished, false, "TERMINAL_LATENT_ANSWER_PUBLICATION_STATE_MISMATCH");
  crossArtifactBindingsVerified += 9;

  return {
    status: "PASS",
    schemaVersion: 1,
    manifestCount: manifests.size,
    defectLedgerCount: ledgers.size,
    recordedDefectCount,
    noDefectClaimMade: false,
    policyMutantsRejected: assertDefectLedgerPolicyMutants(validateLedger),
    crossArtifactBindingsVerified,
    benchmarkTargetIntegrityReviewCount: targetIntegrity.reviewCount,
    benchmarkTargetConflictCount: targetIntegrity.conflictCount,
    benchmarkTargetTuningAllowedCount: targetIntegrity.tuningAllowedCount,
    paidInferencePerformed: false,
    latentAnswersPublished: false,
  };
}
