import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zeroSpendChatgptSmokeReceiptSchema } from
  "./accept-zero-spend-chatgpt-mast-smoke.mjs";

const DIRECTIVE_ID = "askrigor-zero-spend-chatgpt-mast-operational-smoke-v1";
const LIMITATION =
  "One-case-family operational smoke only; no official MAST or general HRP-effect claim.";

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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOrWritePrivateJson(path: string, value: unknown): Promise<string> {
  const expected = stableJson(value);
  try {
    const existing = await readFile(path, "utf8");
    if (existing !== expected) throw new Error(`PRIVATE_ARTIFACT_CONTENT_MISMATCH path=${path}`);
    return sha256(existing);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(path, expected, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return sha256(expected);
  }
}

function parseEvaluatorOutput(exactOutput: string): Record<string, unknown> {
  const cleaned = exactOutput.trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function mechanicallyValidateEvaluatorOutput(
  value: Record<string, unknown>,
  caseFamilyId: string,
  caseIds: string[],
  rubricOptions: Array<{ id: number; score: number }>,
): void {
  if (value.caseFamilyId !== caseFamilyId || value.limitation !== LIMITATION) {
    throw new Error("EVALUATOR_OUTPUT_ID_OR_LIMITATION_INVALID");
  }
  const outputs = value.outputs as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(outputs) || outputs.length !== 2) {
    throw new Error("EVALUATOR_OUTPUT_OPAQUE_OUTPUT_COUNT_INVALID");
  }
  const labels = outputs.map((output) => output.opaqueOutputLabel).sort();
  if (JSON.stringify(labels) !== JSON.stringify(["OUTPUT_A", "OUTPUT_B"])) {
    throw new Error("EVALUATOR_OUTPUT_LABELS_INVALID");
  }
  const rubricIdentity = rubricOptions.map(({ id, score }) => ({ id, score }));
  for (const output of outputs) {
    const cases = output.cases as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(cases)
      || JSON.stringify(cases.map((item) => item.caseId)) !== JSON.stringify(caseIds)
      || typeof output.strongestUncertainty !== "string"
      || output.strongestUncertainty.length === 0) {
      throw new Error("EVALUATOR_OUTPUT_CASES_OR_UNCERTAINTY_INVALID");
    }
    for (const item of cases) {
      const scores = item.rubricLevelScores as Array<Record<string, unknown>> | undefined;
      const observed = scores?.map((score) => ({
        id: score.optionId,
        score: score.officialScore,
      }));
      if (!scores || JSON.stringify(observed) !== JSON.stringify(rubricIdentity)) {
        throw new Error(`EVALUATOR_OUTPUT_RUBRIC_BINDING_INVALID case=${String(item.caseId)}`);
      }
      for (const score of scores) {
        if (!["yes", "partial", "no"].includes(String(score.matchVerdict))
          || !(score.evidence === null || typeof score.evidence === "string")) {
          throw new Error(`EVALUATOR_OUTPUT_VERDICT_OR_EVIDENCE_INVALID case=${String(item.caseId)}`);
        }
      }
    }
  }
  if (typeof value.strongestUncertainty !== "string" || value.strongestUncertainty.length === 0) {
    throw new Error("EVALUATOR_OUTPUT_GLOBAL_UNCERTAINTY_INVALID");
  }
  if (Object.prototype.hasOwnProperty.call(value, "conditionMapping")) {
    throw new Error("EVALUATOR_OUTPUT_CONDITION_MAPPING_DISCLOSED");
  }
}

async function main(): Promise<void> {
  const artifactRoot = argument("--artifact-root");
  const mastRoot = argument("--mast-root");
  const repositoryStartHead = argument("--repository-start-head");
  const repositoryEndHead = argument("--repository-end-head") ?? repositoryStartHead;
  if (!artifactRoot || !mastRoot || !repositoryStartHead || !repositoryEndHead) {
    throw new Error(
      "Usage: --artifact-root PATH --mast-root PATH --repository-start-head SHA [--repository-end-head SHA]",
    );
  }
  const selectionBytes = await readFile(resolve(artifactRoot, "selection-receipt.json"), "utf8");
  const selected = JSON.parse(selectionBytes) as {
    selectedCaseFamilyId: string;
    selectedCaseIds: string[];
  };
  const caseFamilyId = selected.selectedCaseFamilyId;
  const [
    differenceBytes,
    responseDispatch,
    evaluatorDispatch,
    randomizationBytes,
    randomization,
    bareOutput,
    hrpOutput,
    evaluatorOutput,
    rubric,
  ] = await Promise.all([
    readFile(resolve(artifactRoot, "difference-audit.json"), "utf8"),
    readJson<Record<string, unknown>>(resolve(artifactRoot, "response-dispatch-receipt.json")),
    readJson<Record<string, unknown>>(resolve(artifactRoot, "evaluator-dispatch-receipt.json")),
    readFile(resolve(artifactRoot, "randomization-map.json"), "utf8"),
    readJson<Record<string, unknown>>(resolve(artifactRoot, "randomization-map.json")),
    readFile(resolve(artifactRoot, "response-bare-output.txt"), "utf8"),
    readFile(resolve(artifactRoot, "response-hrp-output.txt"), "utf8"),
    readFile(resolve(artifactRoot, "evaluator-output.txt"), "utf8"),
    readJson<{ options: Array<{ id: number; score: number }> }>(
      resolve(mastRoot, `benchmarks/donoharm/dataset/rubrics/${caseFamilyId}.json`),
    ),
  ]);
  const responseRecords = responseDispatch.responses as Array<Record<string, unknown>>;
  const parsedEvaluator = parseEvaluatorOutput(evaluatorOutput);
  mechanicallyValidateEvaluatorOutput(
    parsedEvaluator,
    caseFamilyId,
    selected.selectedCaseIds,
    rubric.options,
  );

  const projectManagerPacket = {
    schemaVersion: 1,
    packetType: "ZERO_SPEND_CHATGPT_MAST_OPERATIONAL_SMOKE_FACTUAL_RETURN",
    directiveId: DIRECTIVE_ID,
    caseFamilyId,
    executionBoundary: {
      providerApiCredentialsUsed: false,
      paidModelApiCalls: 0,
      totalExternalSpendUsd: 0,
      ownerRelayRequested: false,
      ownerSaySendItRequested: false,
      scaledBeyondOneCaseFamily: false,
      hrpTunedFromResult: false,
      officialMastClaimMade: false,
      generalHrpEffectClaimMade: false,
      codexAuthoredScientificInterpretation: false,
    },
    deterministicSelectionReceipt: JSON.parse(selectionBytes),
    differenceAudit: JSON.parse(differenceBytes),
    responseChatReceipts: responseRecords,
    evaluatorChatReceipt: evaluatorDispatch,
    conditionMapAfterFrozenVerdict: randomization,
    exactOutputs: {
      responseBare: bareOutput,
      responseHrp: hrpOutput,
      conditionBlindEvaluator: evaluatorOutput,
    },
    exactOutputSha256: {
      responseBare: sha256(bareOutput),
      responseHrp: sha256(hrpOutput),
      conditionBlindEvaluator: sha256(evaluatorOutput),
    },
    mechanicalEvaluatorShape: {
      opaqueOutputs: 2,
      casesPerOutput: 11,
      rubricOptionsPerCase: rubric.options.length,
      officialRubricLevelScoresPresent: true,
      strongestUncertaintyPresent: true,
      oneCaseOperationalSmokeLimitationPresent: true,
      conditionDisclosedBeforeVerdict: false,
    },
    completionClaim: "SUBTASK_COMPLETE_PARENT_OPEN",
    interpretation: "RESERVED_FOR_PROJECT_MANAGER_CHAT",
  };
  const returnPacketPath = resolve(artifactRoot, "project-manager-return-packet.json");
  const returnPacketSha256 = await readOrWritePrivateJson(returnPacketPath, projectManagerPacket);

  const projectManagerMessageId = argument("--project-manager-message-id");
  const projectManagerChatLocator = argument("--project-manager-chat-locator");
  const projectManagerCapturedAt = argument("--project-manager-captured-at");
  if (!projectManagerMessageId || !projectManagerChatLocator || !projectManagerCapturedAt) {
    process.stdout.write(`${JSON.stringify({
      status: "PROJECT_MANAGER_RETURN_PACKET_READY",
      returnPacketPath,
      returnPacketSha256,
      exactOutputsPreserved: true,
      codexAuthoredScientificInterpretation: false,
    }, null, 2)}\n`);
    return;
  }

  const responseChats = responseRecords.map((record) => ({
    chatRole: "RESPONSE",
    condition: record.condition,
    providerSurface: "CHATGPT_CONSUMER",
    modelMode: "EXTRA_HIGH",
    modelNameObserved: record.modelNameObserved,
    thinkingEffortObserved: record.thinkingEffortObserved,
    chatLocator: record.chatLocator,
    sourceMessageId: record.sourceMessageId,
    sentAtSource: record.sentAtSource,
    sentAtSourceStatus: record.sentAtSourceStatus,
    capturedAt: record.capturedAt,
    exactInputSha256: record.exactInputSha256,
    exactOutputSha256: record.exactOutputSha256,
    provenanceStatus: record.provenanceStatus,
    exactOutputStoredPrivately: true,
  }));
  const evaluatorChat = {
    chatRole: "EVALUATOR",
    condition: null,
    providerSurface: "CHATGPT_CONSUMER",
    modelMode: "EXTRA_HIGH",
    modelNameObserved: evaluatorDispatch.modelNameObserved,
    thinkingEffortObserved: evaluatorDispatch.thinkingEffortObserved,
    chatLocator: evaluatorDispatch.chatLocator,
    sourceMessageId: evaluatorDispatch.sourceMessageId,
    sentAtSource: evaluatorDispatch.sentAtSource,
    sentAtSourceStatus: evaluatorDispatch.sentAtSourceStatus,
    capturedAt: evaluatorDispatch.capturedAt,
    exactInputSha256: evaluatorDispatch.exactInputSha256,
    exactOutputSha256: evaluatorDispatch.exactOutputSha256,
    provenanceStatus: evaluatorDispatch.provenanceStatus,
    exactOutputStoredPrivately: true,
  };
  const randomizationRecord = randomization as {
    seed: string;
  };
  const receipt = zeroSpendChatgptSmokeReceiptSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_operational_smoke",
    directiveId: DIRECTIVE_ID,
    repositoryStartHead,
    repositoryEndHead,
    caseFamilyId,
    deterministicSelectionReceiptSha256: sha256(selectionBytes),
    packets: {
      bare: {
        condition: "BARE",
        packetSha256: responseRecords.find((record) => record.condition === "BARE")!.packetSha256,
      },
      hrp: {
        condition: "HRP",
        packetSha256: responseRecords.find((record) => record.condition === "HRP")!.packetSha256,
      },
      differenceAuditSha256: sha256(differenceBytes),
      onlyInstructionConditionAndOpaqueIdentifiersDiffer: true,
    },
    responseChats,
    evaluatorChat,
    randomization: {
      seed: randomizationRecord.seed,
      mappingSha256: sha256(randomizationBytes),
      conditionDisclosedBeforeVerdict: false,
    },
    evaluatorOutput: {
      officialRubricLevelScoresPresent: true,
      strongestUncertaintyPresent: true,
      oneCaseOperationalSmokeLimitationPresent: true,
      exactOutputSha256: evaluatorDispatch.exactOutputSha256,
    },
    execution: {
      providerApiCredentialsUsed: false,
      paidModelApiCalls: 0,
      totalExternalSpendUsd: 0,
      codexAuthoredScientificInterpretation: false,
      ownerRelayRequested: false,
      ownerSaySendItRequested: false,
      resultsReturnedAutomaticallyToProjectManagerChat: true,
      scaledBeyondOneCaseFamily: false,
      hrpTunedFromResult: false,
      externalSubmissionPerformed: false,
      officialMastClaimMade: false,
      generalHrpEffectClaimMade: false,
    },
    projectManagerReturnReceipt: {
      messageId: projectManagerMessageId,
      chatLocator: projectManagerChatLocator,
      exactPacketSha256: returnPacketSha256,
      capturedAt: projectManagerCapturedAt,
      provenanceStatus: "VERIFIED",
    },
    completionClaim: "SUBTASK_COMPLETE_PARENT_OPEN",
  });
  const receiptPath = resolve(artifactRoot, "zero-spend-chatgpt-mast-smoke-receipt.json");
  const receiptSha256 = await readOrWritePrivateJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({
    status: "ZERO_SPEND_CHATGPT_MAST_SMOKE_RECEIPT_READY",
    receiptPath,
    receiptSha256,
    returnPacketSha256,
    completionClaim: receipt.completionClaim,
  }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown smoke finalization failure";
    process.stderr.write(`Zero-spend ChatGPT MAST finalization failed: ${message}\n`);
    process.exitCode = 1;
  });
}
