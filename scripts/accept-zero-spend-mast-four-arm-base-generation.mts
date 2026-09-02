import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const timestampSchema = z.string().datetime({ offset: true });
const relativePrivateFileSchema = z.string().min(1).refine(
  (value) => !isAbsolute(value) && !value.split("/").includes(".."),
  "private artifact file must be a contained relative path",
);
const amendmentId =
  "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2-consumer-tool-transport-amendment-v1";

const validGenerationRecordSchema = z.object({
  sequence: z.number().int().min(1).max(96),
  opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
  attempt: z.union([z.literal(1), z.literal(2)]),
  status: z.literal("VALID"),
  providerSurface: z.literal("CHATGPT_CONSUMER_CHAT"),
  modelNameObserved: z.literal("GPT-5.6 Sol"),
  thinkingEffortObserved: z.literal("Extra High, 4 of 5"),
  chatLocator: z.string().url(),
  conversationId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  sentAtSource: timestampSchema.nullable(),
  sentAtSourceStatus: z.enum(["VERIFIED", "UNAVAILABLE"]),
  capturedAt: timestampSchema,
  toolsInvoked: z.boolean(),
  browsingInvoked: z.boolean(),
  manualToolSelection: z.literal(false),
  automaticToolInvocationObserved: z.boolean(),
  visibleToolType: z.literal("WEB_SEARCH").nullable(),
  webCitationUiArtifactCount: z.number().int().min(0),
  freshConversation: z.literal(true),
  exactInputCaptured: z.literal(true),
  inputFile: relativePrivateFileSchema,
  exactInputSha256: sha256Schema,
  outputFile: relativePrivateFileSchema,
  exactOutputSha256: sha256Schema,
  exactOutputUtf8Bytes: z.number().int().positive(),
  provenanceStatus: z.literal("VERIFIED"),
  exactOutputStoredPrivately: z.literal(true),
  transport: z.enum(["INLINE", "PASTED_TEXT_ATTACHMENT"]),
  modelSlugObserved: z.literal("gpt-5-6-thinking"),
  eligibility: z.enum([
    "ELIGIBLE_UNDER_ORIGINAL_AND_AMENDED_RULES",
    "ELIGIBLE_UNDER_CONSUMER_TOOL_TRANSPORT_AMENDMENT_V1",
  ]),
  amendmentSha256: sha256Schema,
}).superRefine((record, context) => {
  if (record.sentAtSourceStatus === "VERIFIED" && !record.sentAtSource) {
    context.addIssue({
      code: "custom",
      path: ["sentAtSource"],
      message: "verified source time requires sentAtSource",
    });
  }
  if (record.sentAtSourceStatus === "UNAVAILABLE" && record.sentAtSource !== null) {
    context.addIssue({
      code: "custom",
      path: ["sentAtSource"],
      message: "unavailable source time must remain null",
    });
  }
  if (record.automaticToolInvocationObserved !== record.toolsInvoked
    || record.browsingInvoked !== (record.webCitationUiArtifactCount > 0)
    || record.automaticToolInvocationObserved !== (record.webCitationUiArtifactCount > 0)
    || (record.automaticToolInvocationObserved && record.visibleToolType !== "WEB_SEARCH")
    || (!record.automaticToolInvocationObserved && record.visibleToolType !== null)) {
    context.addIssue({
      code: "custom",
      path: ["automaticToolInvocationObserved"],
      message: "automatic tool process measures are internally inconsistent",
    });
  }
  const expectedEligibility = record.automaticToolInvocationObserved
    ? "ELIGIBLE_UNDER_CONSUMER_TOOL_TRANSPORT_AMENDMENT_V1"
    : "ELIGIBLE_UNDER_ORIGINAL_AND_AMENDED_RULES";
  if (record.eligibility !== expectedEligibility) {
    context.addIssue({
      code: "custom",
      path: ["eligibility"],
      message: "eligibility must identify whether the response depends on the transport amendment",
    });
  }
});

const originalInvalidMechanicalReceiptSchema = z.object({
  sequence: z.number().int().min(1).max(96),
  opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
  attempt: z.literal(1),
  status: z.literal("INVALID_MECHANICAL"),
  reason: z.literal("TOOL_INVOCATION"),
  capturedAt: timestampSchema,
  chatLocator: z.string().url(),
  conversationId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  exactInputSha256: sha256Schema,
  modelNameObserved: z.literal("GPT-5.6 Sol"),
  thinkingEffortObserved: z.literal("Extra High, 4 of 5"),
  modelSlugObserved: z.literal("gpt-5-6-thinking"),
  webCitationPillCount: z.number().int().positive(),
  toolMessageCount: z.number().int().min(0),
  outputFile: relativePrivateFileSchema,
  exactOutputSha256: sha256Schema,
  exactOutputUtf8Bytes: z.number().int().positive(),
  retainedPrivately: z.literal(true),
}).passthrough();

const additionalMechanicalFailureReceiptSchema = z.object({
  sequence: z.number().int().min(1).max(96),
  opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
  attempt: z.literal(1),
  status: z.literal("INVALID_MECHANICAL"),
  reason: z.enum([
    "PROVIDER_ERROR",
    "TRANSPORT_FAILURE",
    "EMPTY_RESPONSE",
    "TRUNCATED_RESPONSE",
    "WRONG_MODEL_OR_REASONING_MODE",
    "DIRTY_CHAT",
    "FAILED_EXACT_INPUT_CAPTURE",
    "PROVENANCE_FAILURE",
  ]),
  capturedAt: timestampSchema,
  chatLocator: z.string().url().nullable(),
  conversationId: z.string().min(1).nullable(),
  userMessageId: z.string().min(1).nullable(),
  assistantMessageId: z.string().min(1).nullable(),
  exactInputSha256: sha256Schema,
  outputFile: relativePrivateFileSchema.nullable(),
  exactOutputSha256: sha256Schema.nullable(),
  exactOutputUtf8Bytes: z.number().int().nonnegative().nullable(),
  retainedPrivately: z.literal(true),
}).passthrough().superRefine((receipt, context) => {
  const hasOutputFile = receipt.outputFile !== null;
  const hasOutputHash = receipt.exactOutputSha256 !== null;
  const hasOutputSize = receipt.exactOutputUtf8Bytes !== null;
  if (hasOutputFile !== hasOutputHash || hasOutputFile !== hasOutputSize) {
    context.addIssue({
      code: "custom",
      path: ["outputFile"],
      message: "additional mechanical failure output provenance must be complete or wholly absent",
    });
  }
});

const supersededRecoveryAttemptSchema = z.object({
  sequence: z.number().int().min(1).max(96),
  opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
  attempt: z.literal(2),
  status: z.literal("SUPERSEDED_RECOVERY_ATTEMPT"),
  reason: z.literal("STARTED_UNDER_SUPERSEDED_AUTOMATIC_TOOL_RETRY_RULE"),
  excludedFromPrimaryDataset: z.literal(true),
  capturedAt: timestampSchema,
  chatLocator: z.string().url(),
  conversationId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  modelNameObserved: z.literal("GPT-5.6 Sol"),
  thinkingEffortObserved: z.literal("Extra High, 4 of 5"),
  modelSlugObserved: z.literal("gpt-5-6-thinking"),
  exactInputSha256: sha256Schema,
  automaticToolInvocationObserved: z.literal(true),
  visibleToolType: z.literal("WEB_SEARCH"),
  webCitationUiArtifactCount: z.number().int().positive(),
  manualToolSelection: z.literal(false),
  outputFile: relativePrivateFileSchema,
  exactOutputSha256: sha256Schema,
  exactOutputUtf8Bytes: z.number().int().positive(),
  retainedPrivately: z.literal(true),
  amendmentSha256: sha256Schema,
}).passthrough();

export const fourArmGenerationLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_generation"),
  directiveId: z.literal("askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2"),
  amendmentId: z.literal(amendmentId),
  amendmentSha256: sha256Schema,
  createdAt: timestampSchema,
  frozenAt: timestampSchema,
  preflightSha256: sha256Schema,
  dispatchMapSha256: sha256Schema,
  totalPrimaryFirstPassResponses: z.literal(96),
  originalInvalidMechanicalReceiptCount: z.literal(2),
  supersededRecoveryAttemptCount: z.literal(1),
  rubricsOrGuidanceInspectedBeforeFreeze: z.literal(false),
  evaluationPerformedBeforeFreeze: z.literal(false),
  perturbationsGenerated: z.literal(false),
  clinicalOutputContentInspectedBeforeFreeze: z.literal(false),
  promptOrProtocolTuned: z.literal(false),
  ambientToolAvailabilityChangedByExecutor: z.literal(false),
  records: z.array(validGenerationRecordSchema).length(96),
  originalInvalidMechanicalReceipts: z.array(originalInvalidMechanicalReceiptSchema).length(2),
  additionalMechanicalFailureReceiptCount: z.number().int().min(0),
  additionalMechanicalFailureReceipts: z.array(additionalMechanicalFailureReceiptSchema),
  supersededRecoveryAttempts: z.array(supersededRecoveryAttemptSchema).length(1),
  execution: z.object({
    providerApiCredentialsUsed: z.literal(false),
    paidModelApiCalls: z.literal(0),
    totalExternalSpendUsd: z.literal(0),
    codexAuthoredScientificInterpretation: z.literal(false),
    ownerRelayRequested: z.literal(false),
    ownerSaySendItRequested: z.literal(false),
    officialMastClaimMade: z.literal(false),
    generalHrpEffectClaimMade: z.literal(false),
  }),
  completionClaim: z.literal(
    "FOUR_ARM_EIGHT_FAMILY_BASE_GENERATION_FROZEN_EVALUATION_BLOCKED_PENDING_EVALUATOR_TRANSPORT_DIRECTIVE",
  ),
}).superRefine((ledger, context) => {
  if (ledger.records.some((record) => record.amendmentSha256 !== ledger.amendmentSha256)
    || ledger.supersededRecoveryAttempts.some(
      (attempt) => attempt.amendmentSha256 !== ledger.amendmentSha256,
    )) {
    context.addIssue({
      code: "custom",
      path: ["amendmentSha256"],
      message: "record amendment digest does not match the frozen ledger amendment",
    });
  }
  if (ledger.additionalMechanicalFailureReceipts.length
    !== ledger.additionalMechanicalFailureReceiptCount) {
    context.addIssue({
      code: "custom",
      path: ["additionalMechanicalFailureReceiptCount"],
      message: "additional mechanical failure count does not match retained receipts",
    });
  }
  for (const record of ledger.records) {
    const retainedFailures = ledger.additionalMechanicalFailureReceipts.filter(
      (failure) => failure.sequence === record.sequence,
    ).length;
    if ((record.attempt === 1 && retainedFailures !== 0)
      || (record.attempt === 2 && retainedFailures !== 1)) {
      context.addIssue({
        code: "custom",
        path: ["records", record.sequence - 1, "attempt"],
        message: "primary attempt number must match the retained genuine mechanical failure receipt",
      });
    }
  }
});

type GenerationLedger = z.infer<typeof fourArmGenerationLedgerSchema>;

type DispatchMap = {
  schemaVersion: 1;
  directiveId: string;
  records: Array<{
    sequence: number;
    opaqueInputId: string;
    inputFile: string;
    exactInputSha256: string;
  }>;
};

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertUnique(label: string, values: string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`FOUR_ARM_GENERATION_${label}_NOT_UNIQUE`);
  }
}

export function acceptFourArmGenerationRecords(
  dispatchMapValue: unknown,
  ledgerValue: unknown,
): GenerationLedger {
  const dispatchMap = z.object({
    schemaVersion: z.literal(1),
    directiveId: z.literal("askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2"),
    records: z.array(z.object({
      sequence: z.number().int().min(1).max(96),
      opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
      inputFile: relativePrivateFileSchema,
      exactInputSha256: sha256Schema,
    }).passthrough()).length(96),
  }).passthrough().parse(dispatchMapValue) as DispatchMap;
  const ledger = fourArmGenerationLedgerSchema.parse(ledgerValue);

  for (let index = 0; index < 96; index += 1) {
    const expected = dispatchMap.records[index]!;
    const observed = ledger.records[index]!;
    if (
      expected.sequence !== index + 1
      || observed.sequence !== expected.sequence
      || observed.opaqueInputId !== expected.opaqueInputId
      || observed.inputFile !== expected.inputFile
      || observed.exactInputSha256 !== expected.exactInputSha256
    ) {
      throw new Error(`FOUR_ARM_GENERATION_DISPATCH_MISMATCH sequence=${index + 1}`);
    }
  }

  assertUnique("CHAT_LOCATOR", ledger.records.map(({ chatLocator }) => chatLocator));
  assertUnique("CONVERSATION_ID", ledger.records.map(({ conversationId }) => conversationId));
  assertUnique("USER_MESSAGE_ID", ledger.records.map(({ userMessageId }) => userMessageId));
  assertUnique("ASSISTANT_MESSAGE_ID", ledger.records.map(({ assistantMessageId }) => assistantMessageId));
  assertUnique("OUTPUT_FILE", ledger.records.map(({ outputFile }) => outputFile));

  const originalInvalidSequences = ledger.originalInvalidMechanicalReceipts
    .map(({ sequence }) => sequence).sort((left, right) => left - right);
  if (JSON.stringify(originalInvalidSequences) !== JSON.stringify([1, 3])) {
    throw new Error("FOUR_ARM_GENERATION_ORIGINAL_INVALID_RECEIPTS_INCOMPLETE");
  }
  for (const historical of ledger.originalInvalidMechanicalReceipts) {
    const primary = ledger.records[historical.sequence - 1]!;
    if (primary.exactOutputSha256 !== historical.exactOutputSha256
      || primary.chatLocator !== historical.chatLocator
      || primary.opaqueInputId !== historical.opaqueInputId
      || primary.exactInputSha256 !== historical.exactInputSha256
      || primary.userMessageId !== historical.userMessageId
      || primary.assistantMessageId !== historical.assistantMessageId) {
      throw new Error(
        `FOUR_ARM_GENERATION_RETROACTIVE_FIRST_PASS_MISMATCH sequence=${historical.sequence}`,
      );
    }
  }
  const superseded = ledger.supersededRecoveryAttempts[0]!;
  if (superseded.sequence !== 1
    || superseded.exactOutputSha256 === ledger.records[0]!.exactOutputSha256) {
    throw new Error("FOUR_ARM_GENERATION_SUPERSEDED_RETRY_INVALID");
  }

  return ledger;
}

async function assertPrivateTreeModes(root: string): Promise<void> {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o777) !== 0o700) {
    throw new Error("FOUR_ARM_GENERATION_ARTIFACT_ROOT_MODE_INVALID");
  }
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error(`FOUR_ARM_GENERATION_SYMLINK_FORBIDDEN path=${path}`);
      if (stat.isDirectory()) {
        if ((stat.mode & 0o777) !== 0o700) {
          throw new Error(`FOUR_ARM_GENERATION_DIRECTORY_MODE_INVALID path=${path}`);
        }
        await visit(path);
      } else if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) {
        throw new Error(`FOUR_ARM_GENERATION_FILE_MODE_INVALID path=${path}`);
      }
    }
  };
  await visit(root);
}

export async function acceptArtifactRoot(repositoryRoot: string, artifactRoot: string): Promise<{
  status: "FOUR_ARM_BASE_GENERATION_ACCEPTED";
  validResponseCount: 96;
  automaticToolResponseCount: number;
  originalInvalidMechanicalReceiptCount: 2;
  supersededRecoveryAttemptCount: 1;
  generationLedgerSha256: string;
  completionClaim:
    "FOUR_ARM_EIGHT_FAMILY_BASE_GENERATION_FROZEN_EVALUATION_BLOCKED_PENDING_EVALUATOR_TRANSPORT_DIRECTIVE";
}> {
  if (!isAbsolute(artifactRoot)) throw new Error("FOUR_ARM_GENERATION_ARTIFACT_ROOT_NOT_ABSOLUTE");
  const [repositoryRealPath, artifactRealPath] = await Promise.all([
    realpath(repositoryRoot),
    realpath(artifactRoot),
  ]);
  const fromRepository = relative(repositoryRealPath, artifactRealPath);
  if (fromRepository.length === 0 || (!fromRepository.startsWith("..") && !isAbsolute(fromRepository))) {
    throw new Error("FOUR_ARM_GENERATION_ARTIFACT_ROOT_INSIDE_REPOSITORY");
  }
  await assertPrivateTreeModes(artifactRoot);

  const [preflightBytes, dispatchMapBytes, amendmentBytes, ledgerBytes] = await Promise.all([
    readFile(resolve(artifactRoot, "preflight-receipt.json")),
    readFile(resolve(artifactRoot, "private-dispatch-map.json")),
    readFile(resolve(artifactRoot, "project-manager-tool-free-transport-ruling.txt")),
    readFile(resolve(artifactRoot, "generation-ledger.json")),
  ]);
  const ledger = acceptFourArmGenerationRecords(
    JSON.parse(dispatchMapBytes.toString("utf8")),
    JSON.parse(ledgerBytes.toString("utf8")),
  );
  if (ledger.preflightSha256 !== sha256(preflightBytes)
    || ledger.dispatchMapSha256 !== sha256(dispatchMapBytes)
    || ledger.amendmentSha256 !== sha256(amendmentBytes)) {
    throw new Error("FOUR_ARM_GENERATION_PARENT_RECEIPT_HASH_MISMATCH");
  }

  for (const record of ledger.records) {
    const [inputBytes, outputBytes] = await Promise.all([
      readFile(resolve(artifactRoot, record.inputFile)),
      readFile(resolve(artifactRoot, record.outputFile)),
    ]);
    if (sha256(inputBytes) !== record.exactInputSha256) {
      throw new Error(`FOUR_ARM_GENERATION_INPUT_HASH_MISMATCH sequence=${record.sequence}`);
    }
    if (
      outputBytes.length === 0
      || sha256(outputBytes) !== record.exactOutputSha256
      || outputBytes.length !== record.exactOutputUtf8Bytes
    ) {
      throw new Error(`FOUR_ARM_GENERATION_OUTPUT_HASH_OR_SIZE_MISMATCH sequence=${record.sequence}`);
    }
  }
  for (const attempt of ledger.supersededRecoveryAttempts) {
    const outputBytes = await readFile(resolve(artifactRoot, attempt.outputFile));
    if (sha256(outputBytes) !== attempt.exactOutputSha256
      || outputBytes.length !== attempt.exactOutputUtf8Bytes) {
      throw new Error("FOUR_ARM_GENERATION_SUPERSEDED_OUTPUT_HASH_OR_SIZE_MISMATCH");
    }
  }
  for (const historical of ledger.originalInvalidMechanicalReceipts) {
    const outputBytes = await readFile(resolve(artifactRoot, historical.outputFile));
    if (sha256(outputBytes) !== historical.exactOutputSha256
      || outputBytes.length !== historical.exactOutputUtf8Bytes) {
      throw new Error("FOUR_ARM_GENERATION_ORIGINAL_INVALID_OUTPUT_HASH_OR_SIZE_MISMATCH");
    }
  }
  for (const failure of ledger.additionalMechanicalFailureReceipts) {
    if (failure.outputFile === null) continue;
    if (failure.exactOutputSha256 === null || failure.exactOutputUtf8Bytes === null) {
      throw new Error("FOUR_ARM_GENERATION_ADDITIONAL_FAILURE_OUTPUT_RECEIPT_INCOMPLETE");
    }
    const outputBytes = await readFile(resolve(artifactRoot, failure.outputFile));
    if (sha256(outputBytes) !== failure.exactOutputSha256
      || outputBytes.length !== failure.exactOutputUtf8Bytes) {
      throw new Error("FOUR_ARM_GENERATION_ADDITIONAL_FAILURE_OUTPUT_HASH_OR_SIZE_MISMATCH");
    }
  }

  return {
    status: "FOUR_ARM_BASE_GENERATION_ACCEPTED",
    validResponseCount: 96,
    automaticToolResponseCount: ledger.records.filter(
      ({ automaticToolInvocationObserved }) => automaticToolInvocationObserved,
    ).length,
    originalInvalidMechanicalReceiptCount: 2,
    supersededRecoveryAttemptCount: 1,
    generationLedgerSha256: sha256(ledgerBytes),
    completionClaim: ledger.completionClaim,
  };
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const artifactRoot = argument("--artifact-root");
  if (!artifactRoot) {
    process.stderr.write("Usage: --artifact-root ABSOLUTE_MODE_0700_PATH\n");
    process.exitCode = 1;
  } else {
    acceptArtifactRoot(repositoryRoot, artifactRoot).then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "unknown generation acceptance failure";
      process.stderr.write(`Four-arm base generation acceptance failed: ${message}\n`);
      process.exitCode = 1;
    });
  }
}
