import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directiveId =
  "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2";
const sourceDirectoryName = "evaluation-v2";
const retiredDirectoryName = "evaluation-v2-packet-order-defect-before-valid-judgment";
const expectedPreflightSha256 =
  "4e4c059c9f518b0f209b8969f5bec7ce070616939320e1d17bd42c01d942f4af";
const expectedScheduleSha256 =
  "9e331c380d34e437945b5e26fda1b2d2f7a85d79a66963d5938e5360f2820403";
const expectedChunkReceiptSha256 =
  "663024aeceb9839e1d29b98657d12924b8ff781a065d053b986596cc545d4f8f";
const expectedPacketSha256 =
  "ebe1ef40aa5d8c9ebd3258dc4771a9be1045428151d0ea843c662415b620a833";
const expectedAttemptOutputSha256 = [
  "8f4b27f2d46ae1e0f9a1c12ba5301991803a9ec712bf014245b56bb402e88202",
  "c2ba17d24440a6f1bd266c95a441a7593ba172882cd3ff3ef5829a2d9134f1b2",
];

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`PACKET_QA_INVALID_OBJECT ${label}`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`PACKET_QA_INVALID_ARRAY ${label}`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`PACKET_QA_INVALID_INTEGER ${label}`);
  return value as number;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`PACKET_QA_INVALID_STRING ${label}`);
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function equalOrder(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function firstMismatch(left: number[], right: number[]): number {
  const width = Math.max(left.length, right.length);
  for (let index = 0; index < width; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return -1;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700) {
    throw new Error(`PACKET_QA_PRIVATE_DIRECTORY_INVALID ${path}`);
  }
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
    throw new Error(`PACKET_QA_RETIREMENT_TARGET_EXISTS ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function outputOptionIds(rawOutput: string, label: string): number[] {
  const output = object(JSON.parse(rawOutput.trim()), label);
  return array(output.options, `${label}.options`).map((entry, index) =>
    integer(object(entry, `${label}.options[${index}]`).id, `${label}.options[${index}].id`));
}

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mastRootArgument = argument("--mast-root");
const artifactRootArgument = argument("--artifact-root");

if (!mastRootArgument || !artifactRootArgument) {
  process.stderr.write(
    "Usage: --mast-root ABSOLUTE_PINNED_MAST_ROOT --artifact-root ABSOLUTE_PRIVATE_ARTIFACT_ROOT\n",
  );
  process.exitCode = 1;
} else {
  const mastRoot = await realpath(mastRootArgument);
  const artifactRoot = await realpath(artifactRootArgument);
  const sourceRoot = await realpath(resolve(artifactRoot, sourceDirectoryName));
  const targetRoot = resolve(artifactRoot, retiredDirectoryName);
  const sourceRelative = relative(artifactRoot, sourceRoot);
  if (sourceRelative !== sourceDirectoryName || isAbsolute(sourceRelative)) {
    throw new Error("PACKET_QA_SOURCE_DIRECTORY_INVALID");
  }
  await assertPrivateDirectory(artifactRoot);
  await assertPrivateDirectory(sourceRoot);
  await assertAbsent(targetRoot);

  const preflightPath = resolve(sourceRoot, "evaluation-v2-preflight-receipt.json");
  const schedulePath = resolve(sourceRoot, "primary-evaluation-schedule.json");
  const chunkReceiptPath = resolve(sourceRoot, "chunk-reconstruction-receipt.json");
  const progressPath = resolve(sourceRoot, "primary-capture-progress.json");
  const provenancePath = resolve(sourceRoot, "packet-qa-live-provenance.json");
  const [preflightBytes, scheduleBytes, chunkReceiptBytes, progressBytes, provenanceBytes] =
    await Promise.all([
      readFile(preflightPath),
      readFile(schedulePath),
      readFile(chunkReceiptPath),
      readFile(progressPath),
      readFile(provenancePath),
    ]);
  if (sha256(preflightBytes) !== expectedPreflightSha256
    || sha256(scheduleBytes) !== expectedScheduleSha256
    || sha256(chunkReceiptBytes) !== expectedChunkReceiptSha256) {
    throw new Error("PACKET_QA_PREFLIGHT_IDENTITY_MISMATCH");
  }

  const schedule = object(JSON.parse(scheduleBytes.toString("utf8")), "schedule");
  const scheduleRecords = array(schedule.records, "schedule.records").map((entry, index) =>
    object(entry, `schedule.records[${index}]`));
  const slot = scheduleRecords[0]!;
  if (schedule.directiveId !== directiveId || scheduleRecords.length !== 192
    || slot.ordinal !== 1 || slot.opaqueResponseId !== "EVAL-5c555ef0530ee059e19cc80e"
    || slot.caseId !== "Endo002" || slot.evaluatorReplicate !== 2
    || slot.exactPacketSha256 !== expectedPacketSha256) {
    throw new Error("PACKET_QA_SCHEDULE_IDENTITY_MISMATCH");
  }

  const progress = object(JSON.parse(progressBytes.toString("utf8")), "progress");
  if (progress.directiveId !== directiveId || progress.validJudgmentCount !== 0
    || progress.mechanicalFailureCount !== 1 || progress.haltedClaim !== null
    || array(progress.records, "progress.records").length !== 0
    || array(progress.mechanicalFailures, "progress.mechanicalFailures").length !== 1) {
    throw new Error("PACKET_QA_PROGRESS_STATE_INVALID");
  }

  const packetFile = string(slot.packetFile, "slot.packetFile");
  const packetPath = resolve(artifactRoot, packetFile);
  const packet = await readFile(packetPath, "utf8");
  if (sha256(packet) !== expectedPacketSha256
    || packet.includes("Required `options` array ID order")) {
    throw new Error("PACKET_QA_DEFECT_NOT_REPRODUCED");
  }
  const displayedOptionIds = [...packet.matchAll(/^(?:  )?(\d+)\. \[/gmu)]
    .map((match) => Number.parseInt(match[1]!, 10));

  const rubric = object(await readJson(
    resolve(mastRoot, "benchmarks/donoharm/dataset/rubrics/Endo002.json"),
  ), "rubric");
  const sourceOptionIds = array(rubric.options, "rubric.options").map((entry, index) =>
    integer(object(entry, `rubric.options[${index}]`).id, `rubric.options[${index}].id`));

  const attemptPaths = [1, 2].map((attempt) => resolve(
    sourceRoot,
    `judgments/primary/001-EVAL-5c555ef0530ee059e19cc80e-J2-attempt-${attempt}.txt`,
  ));
  const attemptBytes = await Promise.all(attemptPaths.map((path) => readFile(path)));
  const observedOptionIds = attemptBytes.map((bytes, index) => {
    if (sha256(bytes) !== expectedAttemptOutputSha256[index]) {
      throw new Error(`PACKET_QA_OUTPUT_IDENTITY_MISMATCH attempt=${index + 1}`);
    }
    return outputOptionIds(bytes.toString("utf8"), `attempt${index + 1}`);
  });
  if (sourceOptionIds.length !== 37 || displayedOptionIds.length !== 37
    || !equalOrder(observedOptionIds[0]!, observedOptionIds[1]!)
    || !equalOrder(observedOptionIds[0]!, displayedOptionIds)
    || equalOrder(observedOptionIds[0]!, sourceOptionIds)) {
    throw new Error("PACKET_QA_ORDER_DIAGNOSIS_FAILED");
  }

  const chunkReceipt = object(JSON.parse(chunkReceiptBytes.toString("utf8")), "chunk receipt");
  const responseRecords = array(chunkReceipt.records, "chunk receipt records").map((entry, index) =>
    object(entry, `chunk receipt records[${index}]`));
  if (responseRecords.length !== 96) throw new Error("PACKET_QA_PACKET_COUNT_INVALID");
  for (const [index, record] of responseRecords.entries()) {
    const candidate = await readFile(resolve(artifactRoot, string(record.packetFile, "packet file")), "utf8");
    if (candidate.includes("Required `options` array ID order")) {
      throw new Error(`PACKET_QA_UNEXPECTED_CANONICAL_DECLARATION index=${index}`);
    }
  }

  const provenance = object(JSON.parse(provenanceBytes.toString("utf8")), "live provenance");
  if (provenance.directiveId !== directiveId || provenance.ordinal !== 1
    || provenance.exactInputSha256 !== expectedPacketSha256
    || array(provenance.attempts, "live provenance attempts").length !== 2) {
    throw new Error("PACKET_QA_LIVE_PROVENANCE_INVALID");
  }
  const firstFailureReceiptPath = resolve(
    sourceRoot,
    "receipts/primary/001-EVAL-5c555ef0530ee059e19cc80e-J2-attempt-1-invalid.json",
  );
  const firstFailureReceiptBytes = await readFile(firstFailureReceiptPath);

  const retiredAt = new Date().toISOString();
  const receipt = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_v2_packet_construction_defect_retirement",
    directiveId,
    retiredAt,
    disposition: "PACKET_CONSTRUCTION_QA_INVALIDATED_BEFORE_VALID_JUDGMENT",
    sourceImplementationCommit: await (async () => {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { stdout } = await promisify(execFile)("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
      });
      return stdout.trim();
    })(),
    identities: {
      preflightSha256: sha256(preflightBytes),
      scheduleSha256: sha256(scheduleBytes),
      chunkReconstructionReceiptSha256: sha256(chunkReceiptBytes),
      captureProgressSha256: sha256(progressBytes),
      liveProvenanceSha256: sha256(provenanceBytes),
      firstRecordedFailureReceiptSha256: sha256(firstFailureReceiptBytes),
      packetSha256: sha256(packet),
    },
    diagnosis: {
      responseCount: 96,
      primaryScheduleCount: 192,
      canonicalDeclarationMissingFromEveryPacket: true,
      affectedLiveSlotOrdinal: 1,
      sourceOptionCount: sourceOptionIds.length,
      displayedOptionCount: displayedOptionIds.length,
      eachObservedOptionCount: observedOptionIds.map((ids) => ids.length),
      observedAttemptsUseIdenticalOrder: true,
      observedOrderEqualsConceptGroupedDisplayOrder: true,
      observedOrderEqualsCanonicalSourceOrder: false,
      firstCanonicalMismatchIndex: firstMismatch(observedOptionIds[0]!, sourceOptionIds),
      canonicalSourceOrderSha256: sha256(JSON.stringify(sourceOptionIds)),
      conceptGroupedDisplayOrderSha256: sha256(JSON.stringify(displayedOptionIds)),
    },
    attempts: attemptBytes.map((bytes, index) => ({
      attempt: index + 1,
      exactOutputSha256: sha256(bytes),
      exactOutputUtf8Bytes: bytes.length,
      retainedPrivately: true,
      validEvaluatorJudgment: false,
      excludedReason: "INCOMPLETE_EVALUATOR_INPUT_PACKET_OMITTED_REQUIRED_CANONICAL_SOURCE_ORDER",
    })),
    attemptCounterDisposition:
      "RESET_TO_ATTEMPT_1_AFTER_CORRECTED_PACKET_PASSES_FRESH_PREFLIGHT",
    evaluatorRetryCeilingConsumed: false,
    directiveChanged: false,
    methodologyChanged: false,
    clinicalContentInspected: false,
    onlyMechanicalOptionIdOrderingInspected: true,
    correctionRequired:
      "DECLARE_EXACT_CANONICAL_RUBRIC_SOURCE_OPTION_ID_ORDER_IN_EVERY_V2_PACKET",
    conditionMapSealed: true,
    unblindingAuthorized: false,
    totalExternalSpendUsd: 0,
  };
  const receiptBytes = `${JSON.stringify(receipt, null, 2)}\n`;

  await rename(sourceRoot, targetRoot);
  await chmod(targetRoot, 0o700);
  const receiptPath = resolve(targetRoot, "packet-construction-defect-retirement-receipt.json");
  await writeFile(receiptPath, receiptBytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await chmod(receiptPath, 0o600);
  process.stdout.write(`${JSON.stringify({
    status: receipt.disposition,
    retiredDirectory: retiredDirectoryName,
    validEvaluatorJudgmentCount: 0,
    preservedAttemptCount: 2,
    receiptSha256: sha256(receiptBytes),
  }, null, 2)}\n`);
}
