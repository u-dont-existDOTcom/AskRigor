import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";

import { z } from "zod";

import { canonicalSha256 } from "../../terminal-bench/verifier-contract.js";

export const MAST_NOHARM_SOURCE_COMMIT = "57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee";

export const PINNED_NOHARM_ARTIFACTS: Record<string, string> = {
  "benchmarks/donoharm/dataset/items.jsonl":
    "a31f0c3aee400d071c16766f7b58cbcfce56a7f899b57bf89428195752b806bd",
  "benchmarks/donoharm/prompts/default.md":
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "benchmarks/donoharm/config/benchmark.yaml":
    "9f93187d547666cbd6f85a76c24c0316c27e63990e4992cda3b6a884993317e9",
  "benchmarks/donoharm/data_loader.py":
    "2a4ea8a110d1fe0fbaf0716524ad259a2a98ac57b007fbede6b2aacd45c34c2f",
  "benchmarks/donoharm/score.py":
    "1034f4b53f8df7ec5549f6b67c99ad511c55c5ef5724ade447a514aa54c6e32b",
  "benchmarks/donoharm/judge/config.py":
    "b8eaf319623d3122e99426b86b8d223c976811bf0cdce99f01002886aaaa9466",
  "benchmarks/donoharm/judge/prompts/extract_match.md":
    "e19c9495dc9a46f462b5a6bf7b28b02f7b7ecc86f7f05b1c3e440fc3eafc500b",
  "benchmarks/donoharm/judge/prompts/global_match_review.md":
    "fea79092dc18912e18d4c32311659b60c7af276f9f1183a9a954c59892a17d58",
};

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const caseIdSchema = z.string().regex(/^[A-Za-z]+\d{3}$/u);

export const noharmPilotManifestSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  state: z.literal("SEALED_NOHARM_PILOT_PLAN_NO_MODEL_RUN"),
  source: z.object({
    repository: z.literal("ARISENetwork/mast"),
    commit: z.literal(MAST_NOHARM_SOURCE_COMMIT),
    tree: z.literal("f73e1cb717d3e76353b190abc13739d7f3476798"),
    artifacts: z.record(z.string(), sha256Schema),
    rubricInventorySha256: sha256Schema,
    guidanceInventorySha256: sha256Schema,
  }),
  pilot: z.object({
    classification: z.literal("DEVELOPMENT_DISCOVERY"),
    selectionRule: z.literal("sha256_minimum_per_specialty_prefix_v1"),
    selectionSeed: z.literal(`${MAST_NOHARM_SOURCE_COMMIT}:pilot-v1`),
    baseCaseIds: z.array(caseIdSchema).length(10),
    stabilityRepeatCaseIds: z.array(caseIdSchema).length(3),
    variantsPerBaseCase: z.literal(11),
    conditions: z.tuple([z.literal("BARE"), z.literal("HRP")]),
    modelResponseCount: z.literal(220),
    initialJudgedRecordCount: z.literal(220),
    stabilityRepeatJudgedRecordCount: z.literal(66),
    outcomeOrRubricContentUsedForSelection: z.literal(false),
    hrpRepairFromPilotPermitted: z.literal(false),
  }),
  confirmation: z.object({
    classification: z.literal("VALIDATION_CONFIRMATION"),
    untouchedBaseCaseIds: z.array(caseIdSchema).length(20),
    variantsPerBaseCase: z.literal(11),
    modelResponseCount: z.literal(440),
    partialCorpus: z.literal(true),
    partialCorpusReason: z.literal("ten base-case families reserved for development pilot"),
    fullThirtyCaseScoreReportedSeparatelyAs: z.literal("DESCRIPTIVE_OFFICIAL_FULL_OPEN_CORPUS"),
  }),
  plannedConditions: z.object({
    onlyDeclaredDifference: z.literal("system_instructions"),
    sharedSettings: z.object({
      endpoint: z.literal("https://api.openai.com/v1/responses"),
      model: z.literal("gpt-5.6-sol"),
      reasoningEffort: z.literal("xhigh"),
      maxOutputTokens: z.literal(8192),
      store: z.literal(false),
      timeoutSeconds: z.literal(300),
      maximumRetries: z.literal(2),
      maximumEstimatedCostUsdBeforeAbort: z.literal(0),
      inputPriceUsdPerMillionTokens: z.literal(4),
      outputPriceUsdPerMillionTokens: z.literal(20),
    }),
    bareInstructionSha256: sha256Schema,
    hrpInstructionSha256: sha256Schema,
  }),
  identities: z.object({
    selectionSha256: sha256Schema,
    pairedSharedSettingsSha256: sha256Schema,
    universalSha256: sha256Schema,
    hrpSha256: sha256Schema,
    matchJudge: z.literal("gemini/gemini-3-flash-preview"),
    reviewJudge: z.literal("gemini/gemini-3.5-flash"),
    judgeReasoningEffort: z.literal("minimal"),
    prompt: z.literal("default_unprompted"),
    trials: z.literal(1),
    maxOutputTokens: z.literal(8192),
  }),
  artifactBoundary: z.object({
    rootEnvironmentVariable: z.literal("ASKRIGOR_MAST_ARTIFACT_ROOT"),
    absolutePathOutsideRepositoryRequired: z.literal(true),
    rootMode: z.literal("0700"),
    fileMode: z.literal("0600"),
    symlinksPermitted: z.literal(false),
    rawResponsesWrittenBeforeJudging: z.literal(true),
    conditionLabelMapSealedSeparately: z.literal(true),
    credentialsStoredInArtifacts: z.literal(false),
    contentHashLedgerRequired: z.literal(true),
  }),
  analysisFreeze: z.object({
    state: z.literal("PENDING_PILOT_NO_RESULTS_SEEN"),
    occursAfterPilotAndBeforeUntouchedConfirmation: z.literal(true),
    requiredFrozenFields: z.tuple([
      z.literal("primary_f1_weighted_estimand_and_paired_contrast"),
      z.literal("smallest_meaningful_benefit"),
      z.literal("safety_noninferiority_margin"),
      z.literal("severe_harm_margin"),
      z.literal("worst_variant_floor_margin"),
      z.literal("case_family_regression_rule"),
      z.literal("judge_stability_acceptance_rule"),
      z.literal("missing_or_failed_judgment_policy"),
      z.literal("multiplicity_and_interval_policy"),
      z.literal("cost_latency_and_truncation_abort_rules"),
      z.literal("blinded_discordance_sampling_rule"),
    ]),
    freezeReceiptSha256Required: z.literal(true),
    untouchedConfirmationMayInfluenceFreeze: z.literal(false),
  }),
  execution: z.object({
    modelInferencePerformed: z.literal(false),
    judgeInferencePerformed: z.literal(false),
    pilotResultsObserved: z.literal(false),
    paidInferencePerformed: z.literal(false),
    maximumEstimatedCostUsdBeforeAbort: z.literal(0),
    nonzeroSpendRequiresSeparateOwnerApprovedManifest: z.literal(true),
    externalSubmissionPerformed: z.literal(false),
  }),
  completion: z.object({
    typedClaim: z.literal("SUBTASK_COMPLETE_PARENT_OPEN"),
    operationalAlignment: z.literal("sealed_zero_spend_pilot_and_freeze_boundary"),
    scientificAdequacy: z.literal("pilot_plan_only_no_results_or_hrp_claim"),
    releaseAdequacy: z.literal("no_paid_inference_external_submission_or_production_release"),
  }),
}).superRefine((value, context) => {
  const all = [...value.pilot.baseCaseIds, ...value.confirmation.untouchedBaseCaseIds];
  if (new Set(all).size !== 30) {
    context.addIssue({ code: "custom", message: "pilot and confirmation cases must be disjoint" });
  }
  const pilot = new Set(value.pilot.baseCaseIds);
  if (value.pilot.stabilityRepeatCaseIds.some((caseId) => !pilot.has(caseId))) {
    context.addIssue({ code: "custom", message: "stability repeats must be pilot cases" });
  }
});

export type NoHarmPilotManifest = z.infer<typeof noharmPilotManifestSchema>;

export async function inspectCleanMastArtifactRoot(
  repositoryRoot: string,
  artifactRoot: string,
): Promise<{ directoryMode: "0700"; empty: true; outsideRepository: true }> {
  if (!isAbsolute(artifactRoot)) throw new Error("MAST_ARTIFACT_ROOT_NOT_ABSOLUTE");
  const [repositoryRealPath, artifactRealPath, artifact] = await Promise.all([
    realpath(repositoryRoot),
    realpath(artifactRoot),
    lstat(artifactRoot),
  ]);
  const fromRepository = relative(repositoryRealPath, artifactRealPath);
  if (
    fromRepository.length === 0
    || (!fromRepository.startsWith("..") && !isAbsolute(fromRepository))
  ) {
    throw new Error("MAST_ARTIFACT_ROOT_INSIDE_REPOSITORY");
  }
  if (
    !artifact.isDirectory()
    || artifact.isSymbolicLink()
    || (artifact.mode & 0o777) !== 0o700
  ) {
    throw new Error("MAST_ARTIFACT_ROOT_MODE_INVALID");
  }
  if ((await readdir(artifactRoot)).length !== 0) {
    throw new Error("MAST_ARTIFACT_ROOT_NOT_CLEAN");
  }
  return { directoryMode: "0700", empty: true, outsideRepository: true };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function specialtyPrefix(caseId: string): string {
  const match = caseId.match(/^[A-Za-z]+/u);
  if (!match) throw new Error(`NOHARM_CASE_ID_INVALID id=${caseId}`);
  return match[0];
}

function ranked(values: string[], suffix: string): string[] {
  return values.map((value) => ({
    value,
    hash: sha256(new TextEncoder().encode(`${MAST_NOHARM_SOURCE_COMMIT}:${value}:${suffix}`)),
  })).sort((left, right) => left.hash.localeCompare(right.hash)).map(({ value }) => value);
}

export function deriveNoHarmPilotSelection(baseCaseIds: string[]): {
  pilotBaseCaseIds: string[];
  stabilityRepeatCaseIds: string[];
  untouchedBaseCaseIds: string[];
  selectionSha256: string;
} {
  const unique = [...new Set(baseCaseIds)].sort();
  if (unique.length !== 30 || unique.some((id) => !caseIdSchema.safeParse(id).success)) {
    throw new Error("NOHARM_BASE_CASE_INVENTORY_INVALID");
  }
  const bySpecialty = new Map<string, string[]>();
  for (const caseId of unique) {
    const prefix = specialtyPrefix(caseId);
    bySpecialty.set(prefix, [...(bySpecialty.get(prefix) ?? []), caseId]);
  }
  if (bySpecialty.size !== 10 || [...bySpecialty.values()].some((ids) => ids.length !== 3)) {
    throw new Error("NOHARM_SPECIALTY_STRATA_INVALID");
  }
  const pilotBaseCaseIds = [...bySpecialty.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([prefix, ids]) => ranked(ids, `${prefix}:pilot-v1`)[0]);
  const stabilityRepeatCaseIds = ranked(pilotBaseCaseIds, "stability-v1").slice(0, 3);
  const pilot = new Set(pilotBaseCaseIds);
  const untouchedBaseCaseIds = unique.filter((id) => !pilot.has(id));
  return {
    pilotBaseCaseIds,
    stabilityRepeatCaseIds,
    untouchedBaseCaseIds,
    selectionSha256: canonicalSha256({
      version: 1,
      pilotBaseCaseIds,
      stabilityRepeatCaseIds,
      untouchedBaseCaseIds,
    }),
  };
}

async function inventoryHash(directory: string, extension: string): Promise<{
  fileIds: string[];
  inventorySha256: string;
}> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(extension)).sort();
  const inventory = await Promise.all(names.map(async (name) => ({
    path: name,
    sha256: sha256(await readFile(join(directory, name))),
  })));
  return {
    fileIds: names.map((name) => basename(name, extension)),
    inventorySha256: canonicalSha256(inventory),
  };
}

export async function verifyPinnedMastNoHarmPilot(
  mastRepositoryRoot: string,
  manifestValue: unknown,
): Promise<{ baseCaseCount: 30; itemCount: 330; selectionSha256: string }> {
  const manifest = noharmPilotManifestSchema.parse(manifestValue);
  for (const [path, expected] of Object.entries(PINNED_NOHARM_ARTIFACTS)) {
    const actual = sha256(await readFile(join(mastRepositoryRoot, path)));
    if (actual !== expected || manifest.source.artifacts[path] !== expected) {
      throw new Error(`MAST_NOHARM_SOURCE_HASH_MISMATCH path=${path}`);
    }
  }

  const itemLines = (await readFile(
    join(mastRepositoryRoot, "benchmarks/donoharm/dataset/items.jsonl"),
    "utf8",
  )).split("\n").filter((line) => line.trim().length > 0);
  const itemIds = itemLines.map((line) => (JSON.parse(line) as { id: string }).id);
  const baseCaseIds = itemIds.filter((id) => !id.includes("-"));
  const selection = deriveNoHarmPilotSelection(baseCaseIds);
  for (const baseCaseId of baseCaseIds) {
    const family = itemIds.filter((id) => id === baseCaseId || id.startsWith(`${baseCaseId}-`));
    const expected = [baseCaseId, ...Array.from({ length: 10 }, (_, index) => `${baseCaseId}-${index}`)];
    if (JSON.stringify(family) !== JSON.stringify(expected)) {
      throw new Error(`MAST_NOHARM_VARIANT_INVENTORY_INVALID base=${baseCaseId}`);
    }
  }

  const [rubrics, guidance] = await Promise.all([
    inventoryHash(join(mastRepositoryRoot, "benchmarks/donoharm/dataset/rubrics"), ".json"),
    inventoryHash(join(mastRepositoryRoot, "benchmarks/donoharm/guidance"), ".yaml"),
  ]);
  if (
    itemIds.length !== 330
    || baseCaseIds.length !== 30
    || JSON.stringify(rubrics.fileIds) !== JSON.stringify([...baseCaseIds].sort())
    || JSON.stringify(guidance.fileIds) !== JSON.stringify([...baseCaseIds].sort())
    || rubrics.inventorySha256 !== manifest.source.rubricInventorySha256
    || guidance.inventorySha256 !== manifest.source.guidanceInventorySha256
    || JSON.stringify(selection.pilotBaseCaseIds) !== JSON.stringify(manifest.pilot.baseCaseIds)
    || JSON.stringify(selection.stabilityRepeatCaseIds)
      !== JSON.stringify(manifest.pilot.stabilityRepeatCaseIds)
    || JSON.stringify(selection.untouchedBaseCaseIds)
      !== JSON.stringify(manifest.confirmation.untouchedBaseCaseIds)
    || selection.selectionSha256 !== manifest.identities.selectionSha256
  ) {
    throw new Error("MAST_NOHARM_PILOT_BINDING_MISMATCH");
  }

  return { baseCaseCount: 30, itemCount: 330, selectionSha256: selection.selectionSha256 };
}
