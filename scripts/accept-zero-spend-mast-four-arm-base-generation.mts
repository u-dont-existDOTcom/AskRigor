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

const validGenerationRecordSchema = z.object({
  sequence: z.number().int().min(1).max(96),
  opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
  attempt: z.number().int().min(1),
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
  toolsInvoked: z.literal(false),
  browsingInvoked: z.literal(false),
  freshConversation: z.literal(true),
  exactInputCaptured: z.literal(true),
  inputFile: relativePrivateFileSchema,
  exactInputSha256: sha256Schema,
  outputFile: relativePrivateFileSchema,
  exactOutputSha256: sha256Schema,
  exactOutputUtf8Bytes: z.number().int().positive(),
  provenanceStatus: z.literal("VERIFIED"),
  exactOutputStoredPrivately: z.literal(true),
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
});

const invalidMechanicalAttemptSchema = z.object({
  sequence: z.number().int().min(1).max(96),
  opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
  attempt: z.number().int().min(1),
  status: z.literal("INVALID_MECHANICAL"),
  reason: z.enum([
    "PROVIDER_ERROR",
    "EMPTY_RESPONSE",
    "TRUNCATED_RESPONSE",
    "WRONG_MODEL_OR_REASONING_MODE",
    "TOOL_INVOCATION",
    "FAILED_EXACT_INPUT_CAPTURE",
  ]),
  capturedAt: timestampSchema,
  chatLocator: z.string().url().nullable(),
  conversationId: z.string().min(1).nullable(),
  userMessageId: z.string().min(1).nullable(),
  assistantMessageId: z.string().min(1).nullable(),
  exactInputSha256: sha256Schema,
  retainedPrivately: z.literal(true),
}).passthrough();

export const fourArmGenerationLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_generation"),
  directiveId: z.literal("askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2"),
  createdAt: timestampSchema,
  frozenAt: timestampSchema,
  preflightSha256: sha256Schema,
  dispatchMapSha256: sha256Schema,
  totalValidResponses: z.literal(96),
  invalidMechanicalAttemptCount: z.number().int().min(0),
  rubricsOrGuidanceInspectedBeforeFreeze: z.literal(false),
  evaluationPerformedBeforeFreeze: z.literal(false),
  perturbationsGenerated: z.literal(false),
  records: z.array(validGenerationRecordSchema).length(96),
  invalidMechanicalAttempts: z.array(invalidMechanicalAttemptSchema),
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
  completionClaim: z.literal("BASE_PILOT_PARENT_OPEN"),
}).superRefine((ledger, context) => {
  if (ledger.invalidMechanicalAttempts.length !== ledger.invalidMechanicalAttemptCount) {
    context.addIssue({
      code: "custom",
      path: ["invalidMechanicalAttemptCount"],
      message: "invalid attempt count does not match retained attempt records",
    });
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

async function acceptArtifactRoot(repositoryRoot: string, artifactRoot: string): Promise<{
  status: "FOUR_ARM_BASE_GENERATION_ACCEPTED";
  validResponseCount: 96;
  invalidMechanicalAttemptCount: number;
  generationLedgerSha256: string;
  completionClaim: "BASE_PILOT_PARENT_OPEN";
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

  const [preflightBytes, dispatchMapBytes, ledgerBytes] = await Promise.all([
    readFile(resolve(artifactRoot, "preflight-receipt.json")),
    readFile(resolve(artifactRoot, "private-dispatch-map.json")),
    readFile(resolve(artifactRoot, "generation-ledger.json")),
  ]);
  const ledger = acceptFourArmGenerationRecords(
    JSON.parse(dispatchMapBytes.toString("utf8")),
    JSON.parse(ledgerBytes.toString("utf8")),
  );
  if (ledger.preflightSha256 !== sha256(preflightBytes)
    || ledger.dispatchMapSha256 !== sha256(dispatchMapBytes)) {
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

  return {
    status: "FOUR_ARM_BASE_GENERATION_ACCEPTED",
    validResponseCount: 96,
    invalidMechanicalAttemptCount: ledger.invalidMechanicalAttemptCount,
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
