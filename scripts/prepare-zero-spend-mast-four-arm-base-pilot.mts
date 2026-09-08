import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";

import {
  inspectCleanMastArtifactRoot,
  noharmPilotManifestSchema,
} from "../evaluation/mast/src/noharm-pilot.js";
import { loadCanonicalHrpInstructions } from "../evaluation/mast/src/paired-condition.js";
import { canonicalSha256 } from "../evaluation/terminal-bench/verifier-contract.js";

const ARM_IDS = ["A", "B", "C", "D"] as const;
type ArmId = typeof ARM_IDS[number];

const execFileAsync = promisify(execFile);

const GENERATION_SOURCE_ARTIFACTS = {
  "benchmarks/donoharm/dataset/items.jsonl":
    "a31f0c3aee400d071c16766f7b58cbcfce56a7f899b57bf89428195752b806bd",
  "benchmarks/donoharm/prompts/default.md":
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "benchmarks/donoharm/prompts/thorough.md":
    "bdaf24e367389fdfec83f3b7307ae4d438152058fa1b9d8429b4694b93349ea6",
} as const;

const EXPECTED_UNTOUCHED_FAMILIES = [
  "Derm001",
  "Endo002",
  "GI004",
  "Heme010",
  "ID008",
  "Nephro005",
  "Neuro007",
  "Pulm005",
] as const;

const directiveSchema = z.object({
  schemaVersion: z.literal(1),
  directiveType: z.literal("ZERO_SPEND_CHATGPT_MAST_CORRECTED_FOUR_ARM_BASE_FAMILY_PILOT"),
  directiveId: z.literal("askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2"),
  status: z.literal("FROZEN_BEFORE_ANY_UNTOUCHED_FAMILY_OUTPUT_IS_VIEWED"),
  scientificReconciliation: z.object({
    All001: z.literal("DEVELOPMENT_CALIBRATION"),
    Card001: z.literal("DEVELOPMENT_CALIBRATION"),
    Card001IncludedInPilotAnalysis: z.literal(false),
    Card001IncludedInContinuationGate: z.literal(false),
    additionalCard001GenerationAuthorized: z.literal(false),
    replacementFamiliesAuthorized: z.literal(false),
    untouchedFamilies: z.tuple(EXPECTED_UNTOUCHED_FAMILIES.map((family) => z.literal(family)) as [
      z.ZodLiteral<"Derm001">,
      z.ZodLiteral<"Endo002">,
      z.ZodLiteral<"GI004">,
      z.ZodLiteral<"Heme010">,
      z.ZodLiteral<"ID008">,
      z.ZodLiteral<"Nephro005">,
      z.ZodLiteral<"Neuro007">,
      z.ZodLiteral<"Pulm005">,
    ]),
    untouchedFamilyCount: z.literal(8),
  }).passthrough(),
  sourcePin: z.object({
    repository: z.literal("ARISENetwork/mast"),
    commit: z.string().regex(/^[a-f0-9]{40}$/u),
    tree: z.string().regex(/^[a-f0-9]{40}$/u),
    baseCaseOnly: z.literal(true),
    perturbationsInThisSlice: z.literal(false),
  }),
  executionBoundary: z.object({
    providerSurface: z.literal("CHATGPT_CONSUMER_CHAT"),
    modelName: z.literal("GPT-5.6 Sol"),
    reasoningMode: z.literal("Extra High"),
    providerApiCredentialsAllowed: z.literal(false),
    paidModelApiCallsAllowed: z.literal(0),
    externalSpendUsdAllowed: z.literal(0),
    toolsAndBrowsingAllowed: z.literal(false),
    freshCleanConversationPerResponse: z.literal(true),
    crossCaseContextAllowed: z.literal(false),
    crossArmContextAllowed: z.literal(false),
    crossTrialContextAllowed: z.literal(false),
    hrpOrUniversalTuningFromPilotResultsAllowed: z.literal(false),
    officialMastClaimAllowed: z.literal(false),
    generalHrpEffectClaimAllowed: z.literal(false),
    ownerRelayRequested: z.literal(false),
  }),
  sample: z.object({
    familyCount: z.literal(8),
    armsPerFamily: z.literal(4),
    trialsPerArmFamily: z.literal(3),
    responsesPerFamily: z.literal(12),
    baseResponseCount: z.literal(96),
    denominatorShrinkageAllowed: z.literal(false),
    familyReplacementAllowed: z.literal(false),
  }).passthrough(),
  generationRules: z.object({
    oneBaseCasePerCleanConversation: z.literal(true),
    rawAssistantResponseCapturedVerbatim: z.literal(true),
    rubricOrGuidanceShownToGeneratingModel: z.literal(false),
    rubricOrGuidanceInspectionBeforeAll96ResponsesCaptured: z.literal(false),
    contentBasedRetriesAllowed: z.literal(false),
  }).passthrough(),
  exploratoryContinuationGate: z.object({
    status: z.literal("FROZEN_BEFORE_ANY_UNTOUCHED_FAMILY_OUTPUT_IS_VIEWED"),
    mayBeChangedAfterUntouchedOutputIsViewed: z.literal(false),
    primarySignalCriteria: z.object({
      medianOfEightDMinusBFamilyDifferences: z.literal("> 0"),
      meanOfEightDMinusBFamilyDifferences: z.literal("> 0"),
      minimumDMinusBFamilyWins: z.literal(6),
      familyWinDenominator: z.literal(8),
    }),
  }).passthrough(),
  nextBoundedSlice: z.object({
    name: z.literal("EIGHT_FAMILY_FOUR_ARM_BASE_CASE_GENERATION"),
    responseCount: z.literal(96),
  }).passthrough(),
  completionClaim: z.literal("BASE_PILOT_PARENT_OPEN"),
}).passthrough();

type Directive = z.infer<typeof directiveSchema>;

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writePrivate(path: string, bytes: string): Promise<string> {
  await writeFile(path, bytes, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return sha256(bytes);
}

export function createArmOrder(seed: string, familyId: string, trial: number): ArmId[] {
  return [...ARM_IDS].sort((left, right) =>
    sha256(`${seed}:${familyId}:${trial}:${left}`)
      .localeCompare(sha256(`${seed}:${familyId}:${trial}:${right}`)));
}

export function createFourArmInputs(input: {
  baseCasePrompt: string;
  mastDefaultPrompt: string;
  mastThoroughPrompt: string;
  universalInstructions: string;
  hrpInstructions: string;
}): Record<ArmId, string> {
  if (input.mastDefaultPrompt !== "") {
    throw new Error("FOUR_ARM_MAST_DEFAULT_PROMPT_NOT_EMPTY");
  }
  return {
    A: input.baseCasePrompt,
    B: `${input.mastThoroughPrompt}${input.baseCasePrompt}`,
    C: `${input.universalInstructions}\n\n${input.baseCasePrompt}`,
    D: `${input.universalInstructions}\n\n${input.hrpInstructions}\n\n${input.baseCasePrompt}`,
  };
}

async function verifyPinnedGenerationSource(
  mastRoot: string,
  sourcePin: Directive["sourcePin"],
): Promise<{
  commit: string;
  tree: string;
  worktreeClean: true;
  baseCaseCount: 30;
  itemCount: 330;
  generationArtifactSha256: typeof GENERATION_SOURCE_ARTIFACTS;
}> {
  const [{ stdout: commitOutput }, { stdout: treeOutput }, { stdout: statusOutput }] =
    await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: mastRoot, encoding: "utf8" }),
      execFileAsync("git", ["rev-parse", "HEAD^{tree}"], { cwd: mastRoot, encoding: "utf8" }),
      execFileAsync("git", ["status", "--porcelain=v1"], { cwd: mastRoot, encoding: "utf8" }),
    ]);
  const commit = commitOutput.trim();
  const tree = treeOutput.trim();
  if (commit !== sourcePin.commit || tree !== sourcePin.tree) {
    throw new Error(`FOUR_ARM_MAST_GIT_PIN_MISMATCH commit=${commit} tree=${tree}`);
  }
  if (statusOutput.length > 0) {
    throw new Error("FOUR_ARM_MAST_SOURCE_WORKTREE_NOT_CLEAN");
  }

  const generationArtifactSha256 = { ...GENERATION_SOURCE_ARTIFACTS };
  const artifactBytes = await Promise.all(Object.entries(generationArtifactSha256)
    .map(async ([path, expected]) => {
      const bytes = await readFile(resolve(mastRoot, path));
      if (sha256(bytes) !== expected) {
        throw new Error(`FOUR_ARM_MAST_GENERATION_ARTIFACT_HASH_MISMATCH path=${path}`);
      }
      return { path, bytes };
    }));
  const items = artifactBytes.find(({ path }) => path.endsWith("items.jsonl"));
  if (!items) throw new Error("FOUR_ARM_MAST_ITEMS_ARTIFACT_MISSING");
  const itemIds = items.bytes.toString("utf8").split("\n").filter(Boolean)
    .map((line) => (JSON.parse(line) as { id: string }).id);
  const baseCaseCount = itemIds.filter((id) => !id.includes("-")).length;
  if (itemIds.length !== 330 || baseCaseCount !== 30) {
    throw new Error("FOUR_ARM_MAST_GENERATION_INVENTORY_INVALID");
  }
  return {
    commit,
    tree,
    worktreeClean: true,
    baseCaseCount: 30,
    itemCount: 330,
    generationArtifactSha256,
  };
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const mastRoot = argument("--mast-root");
  const artifactRoot = argument("--artifact-root");
  const directivePath = argument("--directive");
  const directiveReceiptPath = argument("--directive-receipt");
  if (!mastRoot || !artifactRoot || !directivePath || !directiveReceiptPath) {
    throw new Error(
      "Usage: --mast-root PATH --artifact-root EMPTY_MODE_0700_PATH "
      + "--directive PATH --directive-receipt PATH",
    );
  }

  await inspectCleanMastArtifactRoot(repositoryRoot, artifactRoot);
  const [directiveBytes, directiveReceiptBytes, manifestBytes] = await Promise.all([
    readFile(directivePath, "utf8"),
    readFile(directiveReceiptPath, "utf8"),
    readFile(resolve(repositoryRoot, "evaluation/mast/noharm-pilot-manifest.json"), "utf8"),
  ]);
  const directive = directiveSchema.parse(JSON.parse(directiveBytes)) as Directive;
  const directiveReceipt = JSON.parse(directiveReceiptBytes) as {
    assistantMessageId?: string;
    sourceMessageId?: string;
    exactOutputSha256?: string;
  };
  if ((!directiveReceipt.assistantMessageId && !directiveReceipt.sourceMessageId)
    || directiveReceipt.exactOutputSha256 !== sha256(directiveBytes)) {
    throw new Error("FOUR_ARM_DIRECTIVE_SOURCE_RECEIPT_INVALID");
  }

  const manifest = noharmPilotManifestSchema.parse(JSON.parse(manifestBytes));
  if (directive.sourcePin.commit !== manifest.source.commit
    || directive.sourcePin.tree !== manifest.source.tree
    || JSON.stringify(directive.scientificReconciliation.untouchedFamilies)
      !== JSON.stringify(manifest.pilot.baseCaseIds.slice(2))) {
    throw new Error("FOUR_ARM_DIRECTIVE_SOURCE_OR_FAMILY_SET_MISMATCH");
  }
  const sourceValidation = await verifyPinnedGenerationSource(mastRoot, directive.sourcePin);

  const [itemsBytes, mastDefaultPrompt, mastThoroughPrompt, canonicalInstructions] = await Promise.all([
    readFile(resolve(mastRoot, "benchmarks/donoharm/dataset/items.jsonl"), "utf8"),
    readFile(resolve(mastRoot, "benchmarks/donoharm/prompts/default.md"), "utf8"),
    readFile(resolve(mastRoot, "benchmarks/donoharm/prompts/thorough.md"), "utf8"),
    loadCanonicalHrpInstructions(repositoryRoot),
  ]);
  const selectedFamilies = new Set<string>(directive.scientificReconciliation.untouchedFamilies);
  const baseCases = itemsBytes.split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
    id: string;
    prompt: string;
  }).filter(({ id }) => selectedFamilies.has(id));
  if (JSON.stringify(baseCases.map(({ id }) => id))
    !== JSON.stringify(directive.scientificReconciliation.untouchedFamilies)) {
    throw new Error("FOUR_ARM_BASE_CASE_SET_INCOMPLETE_OR_OUT_OF_ORDER");
  }

  const directiveSha256 = sha256(directiveBytes);
  const scheduleSeed = `${directive.directiveId}:${directiveSha256}:arm-order-v1`;
  const inputDir = resolve(artifactRoot, "inputs");
  await mkdir(inputDir, { mode: 0o700 });
  const dispatchRecords: Array<{
    sequence: number;
    opaqueInputId: string;
    familyId: string;
    trial: number;
    armId: ArmId;
    inputFile: string;
    exactInputSha256: string;
    exactInputUtf8Bytes: number;
  }> = [];

  let sequence = 0;
  for (const { id: familyId, prompt } of baseCases) {
    const armInputs = createFourArmInputs({
      baseCasePrompt: prompt,
      mastDefaultPrompt,
      mastThoroughPrompt,
      universalInstructions: canonicalInstructions.universalBytes,
      hrpInstructions: canonicalInstructions.hrpBytes,
    });
    for (let trial = 1; trial <= directive.sample.trialsPerArmFamily; trial += 1) {
      for (const armId of createArmOrder(scheduleSeed, familyId, trial)) {
        sequence += 1;
        const opaqueInputId = `run-${sha256(`${scheduleSeed}:${familyId}:${trial}:${armId}`).slice(0, 24)}`;
        const inputFile = `${String(sequence).padStart(3, "0")}-${opaqueInputId}.txt`;
        const bytes = armInputs[armId];
        await writePrivate(resolve(inputDir, inputFile), bytes);
        dispatchRecords.push({
          sequence,
          opaqueInputId,
          familyId,
          trial,
          armId,
          inputFile: `inputs/${inputFile}`,
          exactInputSha256: sha256(bytes),
          exactInputUtf8Bytes: Buffer.byteLength(bytes, "utf8"),
        });
      }
    }
  }
  if (dispatchRecords.length !== directive.sample.baseResponseCount) {
    throw new Error(`FOUR_ARM_RESPONSE_COUNT_INVALID observed=${dispatchRecords.length}`);
  }

  const armManifest = {
    schemaVersion: 1,
    directiveId: directive.directiveId,
    mastDefaultPromptSha256: sha256(mastDefaultPrompt),
    mastThoroughPromptSha256: sha256(mastThoroughPrompt),
    universalInstructionsSha256: sha256(canonicalInstructions.universalBytes),
    hrpInstructionsSha256: sha256(canonicalInstructions.hrpBytes),
    universalPlusHrpSha256: sha256(canonicalInstructions.combinedInstructions),
    separator: "two LF bytes between protocol components and the case; thorough.md is concatenated directly",
    exactInputFilesPrivate: true,
  };
  const schedule = {
    schemaVersion: 1,
    directiveId: directive.directiveId,
    seed: scheduleSeed,
    familyOrder: directive.scientificReconciliation.untouchedFamilies,
    trialsPerArmFamily: directive.sample.trialsPerArmFamily,
    entries: dispatchRecords.map(({ sequence: index, opaqueInputId }) => ({
      sequence: index,
      opaqueInputId,
    })),
    armIdentityDisclosedToEvaluators: false,
  };
  const dispatchMap = {
    schemaVersion: 1,
    directiveId: directive.directiveId,
    scheduleSeed,
    records: dispatchRecords,
  };
  const [armManifestSha256, scheduleSha256, dispatchMapSha256] = await Promise.all([
    writePrivate(resolve(artifactRoot, "arm-manifest.json"), stableJson(armManifest)),
    writePrivate(resolve(artifactRoot, "opaque-schedule.json"), stableJson(schedule)),
    writePrivate(resolve(artifactRoot, "private-dispatch-map.json"), stableJson(dispatchMap)),
  ]);
  const preflight = {
    schemaVersion: 1,
    directiveId: directive.directiveId,
    directiveSha256,
    directiveReceiptSha256: sha256(directiveReceiptBytes),
    sourceValidation,
    sourceCommit: manifest.source.commit,
    sourceTree: manifest.source.tree,
    developmentCalibrationFamilies: ["All001", "Card001"],
    untouchedFamilies: directive.scientificReconciliation.untouchedFamilies,
    baseCaseOnly: true,
    perturbationsGenerated: false,
    rubricsOrGuidanceReadByThisScript: false,
    responseCount: dispatchRecords.length,
    exactModelRequired: directive.executionBoundary.modelName,
    exactReasoningModeRequired: directive.executionBoundary.reasoningMode,
    toolsAndBrowsingAllowed: false,
    providerApiCredentialsUsed: false,
    paidModelApiCalls: 0,
    totalExternalSpendUsd: 0,
    armManifestSha256,
    scheduleSha256,
    dispatchMapSha256,
    continuationGateSha256: canonicalSha256(directive.exploratoryContinuationGate),
    completionClaim: "FOUR_ARM_BASE_INPUTS_FROZEN_GENERATION_PENDING",
  };
  const preflightSha256 = await writePrivate(
    resolve(artifactRoot, "preflight-receipt.json"),
    stableJson(preflight),
  );
  process.stdout.write(`${JSON.stringify({
    status: "FOUR_ARM_BASE_INPUTS_FROZEN",
    directiveId: directive.directiveId,
    untouchedFamilyCount: directive.sample.familyCount,
    responseCount: dispatchRecords.length,
    preflightSha256,
    armManifestSha256,
    scheduleSha256,
    dispatchMapSha256,
    providerApiCredentialsUsed: false,
    paidModelApiCalls: 0,
    totalExternalSpendUsd: 0,
    completionClaim: preflight.completionClaim,
  }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown four-arm pilot preparation failure";
    process.stderr.write(`Four-arm zero-spend pilot preparation failed: ${message}\n`);
    process.exitCode = 1;
  });
}
