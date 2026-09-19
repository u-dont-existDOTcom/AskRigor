import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";

import { loadCanonicalHrpInstructions } from "../evaluation/mast/src/paired-condition.js";
import { generationTransportReceiptSchema } from "../evaluation/mast/src/chatgpt-browser-transport-round-3.js";
import {
  appendExposureEvent,
  benchmarkConflictReviewSchema,
  buildMachineSummary,
  createRound3Dispatch,
  detectPrimaryDisagreements,
  expectedBenchmarkConflictReviews,
  exposureLedgerSchema,
  generationCaptureSchema,
  judgmentCaptureSchema,
  makeFailureReceipt,
  providerReceiptSchema,
  reconcileJudgments,
  ROUND_3_GENERATION_COUNT,
  ROUND_3_PRIMARY_JUDGMENT_COUNT,
  ROUND_3_STUDY_ID,
  scoreRound3,
  sha256,
} from "../evaluation/mast/src/fresh-validation-round-3.js";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const preregistrationPath = resolve(root, "evaluation/mast/fresh-validation-round-3-preregistration.json");
const environmentPath = resolve(root, "evaluation/mast/fresh-validation-round-3-environment.json");
const familyManifestPath = resolve(root, "evaluation/mast/fresh-validation-round-3-family-manifest.json");
const primaryJudgePromptPath = resolve(root, "evaluation/mast/prompts/fresh-round-3-primary-judge.md");
const adjudicatorPromptPath = resolve(root, "evaluation/mast/prompts/fresh-round-3-adjudicator.md");

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const ciReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  commit: z.string().regex(/^[0-9a-f]{40}$/u),
  checks: z.array(z.object({
    name: z.string().min(1),
    conclusion: z.literal("SUCCESS"),
    url: z.string().url(),
  }).strict()).min(1),
  recordedAt: z.string().datetime({ offset: true }),
}).strict();

type JsonObject = Record<string, any>;

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`ROUND_3_ARGUMENT_REQUIRED:${name}`);
  return value;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function gitText(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout.trim();
}

async function mastGitText(gitDirectory: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [`--git-dir=${gitDirectory}`, ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

async function ensurePrivateRoot(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error("ROUND_3_ARTIFACT_ROOT_NOT_ABSOLUTE");
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
  const real = await realpath(path);
  const repository = await realpath(root);
  const info = await stat(real);
  if (real === repository || real.startsWith(`${repository}/`)
    || !info.isDirectory() || (info.mode & 0o777) !== 0o700) {
    throw new Error("ROUND_3_ARTIFACT_ROOT_INVALID");
  }
  return real;
}

async function writePrivate(path: string, value: string | Uint8Array): Promise<string> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(path, value, { flag: "wx", mode: 0o600 });
  await chmod(path, 0o600);
  return sha256(value);
}

async function listPrivateJson(directory: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => resolve(directory, entry.name)).sort();
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function listIntegrityFailureReceipts(privateRoot: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const walk = async (path: string): Promise<string[]> => {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return (await Promise.all(entries.map((entry) => entry.isDirectory()
        ? walk(resolve(path, entry.name))
        : Promise.resolve([resolve(path, entry.name)])))).flat();
    } catch (error: any) { if (error?.code === "ENOENT") return []; throw error; }
  };
  const paths = await walk(privateRoot);
  return paths.filter((path) => {
    const relative = path.slice(privateRoot.length + 1);
    const name = basename(path);
    return (/(?:^|\/)failures\//u.test(relative) && name.endsWith(".json"))
      || /^attempt-\d+-failure\.json$/u.test(name)
      || name === "ambiguity-receipt.json"
      || /^disposition\/.+\.json$/u.test(relative);
  }).sort();
}

async function sourceIdentity(mastGitDirectory: string) {
  const environment = await readJson(environmentPath);
  const [askRigorCommit, askRigorTree, mastCommit, mastTree] = await Promise.all([
    gitText(root, "rev-parse", "HEAD"),
    gitText(root, "rev-parse", "HEAD^{tree}"),
    mastGitText(mastGitDirectory, "rev-parse", environment.mast.commit),
    mastGitText(mastGitDirectory, "rev-parse", `${environment.mast.commit}^{tree}`),
  ]);
  return { askRigorCommit, askRigorTree, mastCommit: mastCommit.trim(), mastTree: mastTree.trim() };
}

async function verifyFrozenSources(mastGitDirectory: string): Promise<JsonObject> {
  const [environment, preregistration, familyManifest, activeTask] = await Promise.all([
    readJson(environmentPath), readJson(preregistrationPath), readJson(familyManifestPath),
    readJson(resolve(root, "tasks/ACTIVE-TASK.json")),
  ]);
  if (environment.studyId !== ROUND_3_STUDY_ID || preregistration.studyId !== ROUND_3_STUDY_ID
    || familyManifest.studyId !== ROUND_3_STUDY_ID) {
    throw new Error("ROUND_3_STUDY_ID_MISMATCH");
  }
  const branch = await gitText(root, "branch", "--show-current");
  if (activeTask.taskId !== ROUND_3_STUDY_ID || activeTask.exclusive !== true
    || activeTask.requiredBranch !== branch) {
    throw new Error("ROUND_3_ACTIVE_TASK_OR_BRANCH_MISMATCH");
  }
  await gitText(root, "merge-base", "--is-ancestor", environment.askRigor.baselineCommit, "HEAD");
  const identities = await sourceIdentity(mastGitDirectory);
  if (identities.mastCommit !== environment.mast.commit || identities.mastTree !== environment.mast.tree) {
    throw new Error("ROUND_3_MAST_SOURCE_DRIFT");
  }
  const [universalBytes, hrpBytes] = await Promise.all([
    readFile(resolve(root, "protocols/Universal_Instructions.xml")),
    readFile(resolve(root, "protocols/HRP_Full.xml")),
  ]);
  if (sha256(universalBytes) !== environment.askRigor.universal.sha256
    || sha256(hrpBytes) !== environment.askRigor.hrp.sha256) {
    throw new Error("ROUND_3_PROTOCOL_SOURCE_DRIFT");
  }
  for (const [relativePath, expected] of Object.entries(environment.executableHashManifest) as Array<[string, string]>) {
    if (sha256(await readFile(resolve(root, relativePath))) !== expected) {
      throw new Error(`ROUND_3_EXECUTABLE_HASH_DRIFT:${relativePath}`);
    }
  }
  if (sha256(await readFile(familyManifestPath)) !== preregistration.bindings.familyManifestSha256
    || sha256(await readFile(environmentPath)) !== preregistration.bindings.environmentSha256) {
    throw new Error("ROUND_3_PREREGISTRATION_BINDING_DRIFT");
  }
  const tree = (await mastGitText(mastGitDirectory, "ls-tree", "-r", "--name-only", environment.mast.commit)).trim();
  const ids = tree.split("\n").map((path) => /^benchmarks\/donoharm\/dataset\/rubrics\/([A-Za-z]+\d{3})\.json$/u.exec(path)?.[1])
    .filter((value): value is string => Boolean(value)).sort();
  if (JSON.stringify(ids) !== JSON.stringify(familyManifest.allFamilies)) {
    throw new Error("ROUND_3_IDENTIFIER_ONLY_SOURCE_MISMATCH");
  }
  return {
    identities,
    preregistrationSha256: sha256(await readFile(preregistrationPath)),
    environmentSha256: sha256(await readFile(environmentPath)),
    familyManifestSha256: sha256(await readFile(familyManifestPath)),
    identifierOnlyFamilyCount: ids.length,
    activeTaskAndBranchVerified: true,
    executableHashManifestVerified: true,
  };
}

async function verifyRuntimeBinding(mastGitDirectory: string, artifactRoot: string): Promise<JsonObject> {
  const verification = await verifyFrozenSources(mastGitDirectory);
  const freeze = await readJson(resolve(artifactRoot, "freeze/freeze-receipt.json"));
  if (freeze.studyId !== ROUND_3_STUDY_ID
    || freeze.identities.askRigorCommit !== verification.identities.askRigorCommit
    || freeze.identities.askRigorTree !== verification.identities.askRigorTree
    || freeze.identities.mastCommit !== verification.identities.mastCommit
    || freeze.identities.mastTree !== verification.identities.mastTree
    || freeze.preregistrationSha256 !== verification.preregistrationSha256
    || freeze.environmentSha256 !== verification.environmentSha256
    || freeze.familyManifestSha256 !== verification.familyManifestSha256) {
    throw new Error("ROUND_3_RUNTIME_SOURCE_BINDING_MISMATCH");
  }
  return verification;
}

async function createSeed(artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  const seed = randomBytes(32);
  const seedSha256 = await writePrivate(resolve(privateRoot, "freeze/dispatch-seed.bin"), seed);
  const receipt = {
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    seedBytes: 32,
    seedSha256,
    createdAt: new Date().toISOString(),
    payloadOpened: false,
    modelInferencePerformed: false,
  };
  await writePrivate(resolve(privateRoot, "freeze/seed-receipt.json"), json(receipt));
  return receipt;
}

async function sealFreeze(mastGitDirectory: string, artifactRoot: string, ciReceiptPath: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  const verification = await verifyFrozenSources(mastGitDirectory);
  const status = await gitText(root, "status", "--porcelain=v1");
  if (status !== "") throw new Error("ROUND_3_FREEZE_WORKTREE_NOT_CLEAN");
  const ciReceipt = ciReceiptSchema.parse(await readJson(ciReceiptPath));
  if (ciReceipt.commit !== verification.identities.askRigorCommit) {
    throw new Error("ROUND_3_CI_COMMIT_MISMATCH");
  }
  const requiredChecks = ["Deterministic verification", "workflow-policy"];
  if (requiredChecks.some((name) => !ciReceipt.checks.some((check) => check.name === name))) {
    throw new Error("ROUND_3_REQUIRED_CI_CHECK_MISSING");
  }
  const seed = await readFile(resolve(privateRoot, "freeze/dispatch-seed.bin"));
  const preregistration = await readJson(preregistrationPath);
  if (seed.byteLength !== 32 || sha256(seed) !== preregistration.design.dispatchSeedSha256) {
    throw new Error("ROUND_3_DISPATCH_SEED_MISMATCH");
  }
  const familyManifest = await readJson(familyManifestPath);
  const schedule = createRound3Dispatch(seed, familyManifest.validationFamilies);
  if (schedule.length !== ROUND_3_GENERATION_COUNT) throw new Error("ROUND_3_DISPATCH_COUNT_INVALID");
  const privateMap = {
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    records: schedule,
  };
  const publicSchedule = {
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    entries: schedule.map(({ sequence, opaqueInputId }) => ({ sequence, opaqueInputId })),
  };
  const privateMapSha256 = await writePrivate(resolve(privateRoot, "generation/private-dispatch-map.json"), json(privateMap));
  const publicScheduleSha256 = await writePrivate(resolve(privateRoot, "generation/opaque-schedule.json"), json(publicSchedule));
  let ledger = exposureLedgerSchema.parse({ schemaVersion: 1, studyId: ROUND_3_STUDY_ID, events: [] });
  for (const familyId of familyManifest.allFamilies) {
    ledger = appendExposureEvent(ledger, {
      eventId: `manifest:${familyId}`,
      familyId,
      kind: "IDENTIFIER_ONLY",
      actor: "PREPROCESSOR",
      stage: "COHORT_SELECTION",
      occurredAt: new Date().toISOString(),
      artifactSha256: verification.familyManifestSha256,
      note: "Family identity derived only from rubric filename in the pinned Git tree.",
    });
    if (familyManifest.historicalMechanicalPayloadReadFamilies.includes(familyId)) {
      ledger = appendExposureEvent(ledger, {
        eventId: `round1-mechanical:${familyId}`,
        familyId,
        kind: "MECHANICAL_PAYLOAD_READ",
        actor: "GENERATION_CODE",
        stage: "HISTORICAL_ROUND_1_PREPARATION",
        occurredAt: preregistration.historicalExposure.round1MechanicalReadRecordedAt,
        artifactSha256: null,
        note: "Round 1 mechanically read the full items.jsonl before filtering; this is not represented as semantic/model exposure.",
      });
    }
    if (familyManifest.excludedDevelopmentFamilies.includes(familyId)) {
      ledger = appendExposureEvent(ledger, {
        eventId: `historical-development:${familyId}`,
        familyId,
        kind: "SEMANTIC_MODEL_EXPOSURE",
        actor: "MODEL",
        stage: "HISTORICAL_DEVELOPMENT_OR_CALIBRATION",
        occurredAt: preregistration.historicalExposure.originalDevelopmentRecordedAt,
        artifactSha256: null,
        note: "Excluded from Round 3 because the family was used in original development or calibration.",
      });
    }
    if (familyManifest.excludedRound1GeneratedFamilies.includes(familyId)) {
      ledger = appendExposureEvent(ledger, {
        eventId: `round1-generated:${familyId}`,
        familyId,
        kind: "GENERATED_RESPONSE_EXPOSURE",
        actor: "MODEL",
        stage: "HISTORICAL_ROUND_1_GENERATION",
        occurredAt: preregistration.historicalExposure.round1GenerationRecordedAt,
        artifactSha256: null,
        note: "Excluded from Round 3 because Round 1 generated at least one response for this family.",
      });
    }
    if (familyManifest.excludedRound2ExposedFamilies.includes(familyId)) {
      ledger = appendExposureEvent(ledger, {
        eventId: `round2-exposed:${familyId}`,
        familyId,
        kind: "GENERATED_RESPONSE_EXPOSURE",
        actor: "MODEL",
        stage: "HISTORICAL_ROUND_2_GENERATION",
        occurredAt: preregistration.historicalExposure.round2TerminalRecordedAt,
        artifactSha256: preregistration.historicalExposure.round2DispositionSha256,
        note: "Excluded from Round 3 because Round 2 exposed the family through generation.",
      });
    }
  }
  const exposureLedgerSha256 = await writePrivate(resolve(privateRoot, "exposure/ledger-initial.json"), json(ledger));
  const receipt = {
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    frozenAt: new Date().toISOString(),
    ...verification,
    ciReceiptSha256: sha256(await readFile(ciReceiptPath)),
    dispatchSeedSha256: sha256(seed),
    privateMapSha256,
    publicScheduleSha256,
    exposureLedgerSha256,
    validationFamilyCount: familyManifest.validationFamilies.length,
    limitedReserveFamilyCount: familyManifest.reserveFamilies.length,
    limitedReserveStatus: familyManifest.reserveStatus.status,
    responseCount: schedule.length,
    payloadOpened: false,
    modelInferencePerformed: false,
    response1Generated: false,
  };
  await writePrivate(resolve(privateRoot, "freeze/freeze-receipt.json"), json(receipt));
  return receipt;
}

function parseMastPrompts(items: string): Map<string, string> {
  const prompts = new Map<string, string>();
  for (const line of items.split("\n").filter(Boolean)) {
    const item = JSON.parse(line) as { id?: unknown; prompt?: unknown };
    if (typeof item.id !== "string" || typeof item.prompt !== "string" || prompts.has(item.id)) {
      throw new Error("ROUND_3_MAST_ITEMS_SCHEMA_INVALID");
    }
    prompts.set(item.id, item.prompt);
  }
  return prompts;
}

async function prepareGeneration(mastGitDirectory: string, artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const freeze = await readJson(resolve(privateRoot, "freeze/freeze-receipt.json"));
  if (freeze.response1Generated !== false || freeze.payloadOpened !== false) {
    throw new Error("ROUND_3_FREEZE_RECEIPT_INVALID");
  }
  const environment = await readJson(environmentPath);
  const familyManifest = await readJson(familyManifestPath);
  const privateMap = await readJson(resolve(privateRoot, "generation/private-dispatch-map.json"));
  const [items, thoroughPrompt, protocols] = await Promise.all([
    mastGitText(mastGitDirectory, "show", `${environment.mast.commit}:benchmarks/donoharm/dataset/items.jsonl`),
    mastGitText(mastGitDirectory, "show", `${environment.mast.commit}:benchmarks/donoharm/prompts/thorough.md`),
    loadCanonicalHrpInstructions(root),
  ]);
  const prompts = parseMastPrompts(items);
  const selected = new Set(familyManifest.validationFamilies as string[]);
  if ([...selected].some((familyId) => !prompts.has(familyId))) {
    throw new Error("ROUND_3_SELECTED_PROMPT_MISSING");
  }
  const records = [];
  for (const record of privateMap.records as Array<any>) {
    const prompt = prompts.get(record.familyId)!;
    const input = ({
      A: prompt,
      B: `${thoroughPrompt}${prompt}`,
      C: `${protocols.universalBytes}\n\n${prompt}`,
      D: `${protocols.universalBytes}\n\n${protocols.hrpBytes}\n\n${prompt}`,
    } as Record<string, string>)[record.armId]!;
    const relative = `generation/inputs/${String(record.sequence).padStart(3, "0")}-${record.opaqueInputId}.txt`;
    const exactInputSha256 = await writePrivate(resolve(privateRoot, relative), input);
    records.push({ ...record, inputFile: relative, exactInputSha256, inputUtf8Bytes: Buffer.byteLength(input) });
  }
  const packetMap = { schemaVersion: 1, studyId: ROUND_3_STUDY_ID, records };
  const packetMapSha256 = await writePrivate(resolve(privateRoot, "generation/packet-map.json"), json(packetMap));
  const receipt = {
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    preparedAt: new Date().toISOString(),
    inputCount: records.length,
    packetMapSha256,
    itemBlobSha256: sha256(items),
    selectedFamilies: [...selected].sort(),
    mechanicalPayloadReadFamilies: familyManifest.allFamilies,
    limitedReservePayloadSemanticallyExposed: false,
    generationPerformed: false,
  };
  await writePrivate(resolve(privateRoot, "generation/preparation-receipt.json"), json(receipt));
  return receipt;
}

async function status(mastGitDirectory: string, artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const [generation, j1, j2, j3, conflictReviews] = await Promise.all([
    listPrivateJson(resolve(privateRoot, "generation/captures")),
    listPrivateJson(resolve(privateRoot, "evaluation/J1/captures")),
    listPrivateJson(resolve(privateRoot, "evaluation/J2/captures")),
    listPrivateJson(resolve(privateRoot, "evaluation/J3/captures")),
    listPrivateJson(resolve(privateRoot, "clinical/conflict-reviews")),
  ]);
  return {
    studyId: ROUND_3_STUDY_ID,
    generation: { completed: generation.length, planned: ROUND_3_GENERATION_COUNT },
    J1: { completed: j1.length, planned: ROUND_3_GENERATION_COUNT },
    J2: { completed: j2.length, planned: ROUND_3_GENERATION_COUNT },
    J3: { completed: j3.length, planned: "DISAGREEMENTS_ONLY" },
    benchmarkConflictReviews: conflictReviews.length,
  };
}

async function nextGeneration(mastGitDirectory: string, artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const packetMap = await readJson(resolve(privateRoot, "generation/packet-map.json"));
  const completed = new Set((await listPrivateJson(resolve(privateRoot, "generation/captures")))
    .map((path) => basename(path, ".json")));
  const record = packetMap.records.find((candidate: any) => !completed.has(candidate.opaqueInputId));
  return record ? {
    status: "PENDING",
    sequence: record.sequence,
    opaqueInputId: record.opaqueInputId,
    packetPath: resolve(privateRoot, record.inputFile),
    exactInputSha256: record.exactInputSha256,
  } : { status: "COMPLETE" };
}

async function captureGeneration(mastGitDirectory: string, artifactRoot: string, opaqueInputId: string,
  outputPath: string, providerPath: string, transportReceiptPath: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const packetMap = await readJson(resolve(privateRoot, "generation/packet-map.json"));
  const record = packetMap.records.find((candidate: any) => candidate.opaqueInputId === opaqueInputId);
  if (!record) throw new Error("ROUND_3_GENERATION_SLOT_UNKNOWN");
  const [output, providerValue, transportBytes] = await Promise.all([
    readFile(outputPath), readJson(providerPath), readFile(transportReceiptPath),
  ]);
  if (output.byteLength === 0) throw new Error("ROUND_3_GENERATION_OUTPUT_EMPTY");
  const provider = providerReceiptSchema.parse(providerValue);
  const transport = generationTransportReceiptSchema.parse(JSON.parse(transportBytes.toString("utf8")));
  if (transport.opaqueInputId !== opaqueInputId || transport.sourceSha256 !== record.exactInputSha256
    || transport.state !== "RESPONSE_COMPLETE") {
    throw new Error("ROUND_3_GENERATION_TRANSPORT_RECEIPT_INVALID");
  }
  const capture = generationCaptureSchema.parse({
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    opaqueInputId,
    exactInputSha256: record.exactInputSha256,
    exactOutputSha256: sha256(output),
    outputUtf8Bytes: output.byteLength,
    transportReceiptSha256: sha256(transportBytes),
    provider,
  });
  await writePrivate(resolve(privateRoot, `generation/raw/${opaqueInputId}.txt`), output);
  await writePrivate(resolve(privateRoot, `generation/captures/${opaqueInputId}.json`), json(capture));
  return capture;
}

async function sealGeneration(mastGitDirectory: string, artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const capturePaths = await listPrivateJson(resolve(privateRoot, "generation/captures"));
  const captures = await Promise.all(capturePaths.map(readJson));
  captures.forEach((value) => generationCaptureSchema.parse(value));
  if (captures.length !== ROUND_3_GENERATION_COUNT) throw new Error("ROUND_3_GENERATION_COVERAGE_INCOMPLETE");
  const ids = captures.map(({ opaqueInputId }) => opaqueInputId);
  if (new Set(ids).size !== ROUND_3_GENERATION_COUNT) throw new Error("ROUND_3_GENERATION_ID_DUPLICATE");
  const receipt = {
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    sealedAt: new Date().toISOString(),
    responseCount: captures.length,
    captureManifestSha256: sha256(json(captures.sort((a, b) => a.opaqueInputId.localeCompare(b.opaqueInputId)))),
    successfulSlotsRerun: false,
  };
  await writePrivate(resolve(privateRoot, "generation/seal.json"), json(receipt));
  return receipt;
}

async function buildBlindPackets(mastGitDirectory: string, artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  await readJson(resolve(privateRoot, "generation/seal.json"));
  const environment = await readJson(environmentPath);
  const seed = await readFile(resolve(privateRoot, "freeze/dispatch-seed.bin"));
  const packetMap = await readJson(resolve(privateRoot, "generation/packet-map.json"));
  const prompt = await readFile(primaryJudgePromptPath, "utf8");
  const mappings = [];
  for (const record of packetMap.records as Array<any>) {
    const capture = generationCaptureSchema.parse(await readJson(resolve(privateRoot,
      `generation/captures/${record.opaqueInputId}.json`)));
    const response = await readFile(resolve(privateRoot, `generation/raw/${record.opaqueInputId}.txt`), "utf8");
    const [rubric, guidance] = await Promise.all([
      mastGitText(mastGitDirectory, "show", `${environment.mast.commit}:benchmarks/donoharm/dataset/rubrics/${record.familyId}.json`),
      mastGitText(mastGitDirectory, "show", `${environment.mast.commit}:benchmarks/donoharm/guidance/${record.familyId}.yaml`),
    ]);
    const opaqueResponseId = `EVAL-${sha256(Buffer.concat([seed, Buffer.from(`\0${record.opaqueInputId}:blind`)] )).slice(0, 24)}`;
    const packet = `${prompt}\n\n<RESPONSE>\n${response}\n</RESPONSE>\n\n<RUBRIC>\n${rubric}\n</RUBRIC>\n\n<GUIDANCE>\n${guidance}\n</GUIDANCE>\n`;
    const relative = `evaluation/packets/${opaqueResponseId}.txt`;
    const exactPacketSha256 = await writePrivate(resolve(privateRoot, relative), packet);
    mappings.push({
      generationLedgerRecordId: record.opaqueInputId,
      opaqueResponseId,
      exactGenerationOutputSha256: capture.exactOutputSha256,
      familyId: record.familyId,
      armId: record.armId,
      trial: record.trial,
      exactPacketSha256,
      packetFile: relative,
    });
  }
  const mapping = { schemaVersion: 1, studyId: ROUND_3_STUDY_ID, records: mappings };
  const mappingSha256 = await writePrivate(resolve(privateRoot, "evaluation/sealed-condition-map.json"), json(mapping));
  const schedule = {
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    entries: mappings.map(({ opaqueResponseId, exactPacketSha256, exactGenerationOutputSha256, packetFile }) =>
      ({ opaqueResponseId, exactPacketSha256, exactGenerationOutputSha256, packetFile })),
  };
  const scheduleSha256 = await writePrivate(resolve(privateRoot, "evaluation/blind-schedule.json"), json(schedule));
  return { status: "BLIND_PACKETS_BUILT", packetCount: mappings.length, mappingSha256, scheduleSha256 };
}

async function nextJudgment(mastGitDirectory: string, artifactRoot: string, judge: "J1" | "J2" | "J3") {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  if (!["J1", "J2", "J3"].includes(judge)) throw new Error("ROUND_3_JUDGE_INVALID");
  const schedulePath = judge === "J3" ? "evaluation/J3/schedule.json" : "evaluation/blind-schedule.json";
  const schedule = await readJson(resolve(privateRoot, schedulePath));
  const completed = new Set((await listPrivateJson(resolve(privateRoot, `evaluation/${judge}/captures`)))
    .map((path) => basename(path, ".json")));
  const record = schedule.entries.find((candidate: any) => !completed.has(candidate.opaqueResponseId));
  return record ? { status: "PENDING", judge, ...record,
    packetPath: resolve(privateRoot, record.packetFile) } : { status: "COMPLETE", judge };
}

async function captureJudgment(mastGitDirectory: string, artifactRoot: string, judge: "J1" | "J2" | "J3",
  opaqueResponseId: string, rawOutputPath: string, providerPath: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  const verification = await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const schedulePath = judge === "J3" ? "evaluation/J3/schedule.json" : "evaluation/blind-schedule.json";
  const schedule = await readJson(resolve(privateRoot, schedulePath));
  const slot = schedule.entries.find((candidate: any) => candidate.opaqueResponseId === opaqueResponseId);
  if (!slot) throw new Error("ROUND_3_JUDGMENT_SLOT_UNKNOWN");
  const rawBytes = await readFile(rawOutputPath);
  const failurePaths = await listPrivateJson(resolve(privateRoot, `evaluation/${judge}/failures/${opaqueResponseId}`));
  const attempt = failurePaths.length + 1;
  if (attempt > 3) throw new Error("ROUND_3_JUDGMENT_ATTEMPT_CEILING_EXHAUSTED");
  try {
    const parsed = JSON.parse(rawBytes.toString("utf8"));
    const provider = providerReceiptSchema.parse(await readJson(providerPath));
    const capture = judgmentCaptureSchema.parse({
      schemaVersion: 1,
      studyId: ROUND_3_STUDY_ID,
      judge,
      opaqueResponseId,
      exactPacketSha256: slot.exactPacketSha256,
      exactGenerationOutputSha256: slot.exactGenerationOutputSha256,
      score: {
        f1Lexeme: parsed.f1Lexeme,
        omissionCount: parsed.omissionCount,
        commissionCount: parsed.commissionCount,
        severeCommission: parsed.severeCommission,
        requiredActionMatches: parsed.requiredActionMatches,
        prohibitedActionMatches: parsed.prohibitedActionMatches,
      },
      benchmarkTargetConflictFlag: parsed.benchmarkTargetConflictFlag,
      benchmarkTargetConflictActionIds: parsed.benchmarkTargetConflictActionIds,
      provider,
      rawOutputSha256: sha256(rawBytes),
    });
    await writePrivate(resolve(privateRoot, `evaluation/${judge}/raw/${opaqueResponseId}.txt`), rawBytes);
    await writePrivate(resolve(privateRoot, `evaluation/${judge}/captures/${opaqueResponseId}.json`), json(capture));
    return capture;
  } catch (error: any) {
    await writePrivate(resolve(privateRoot,
      `evaluation/${judge}/failures/${opaqueResponseId}/attempt-${attempt}-raw.txt`), rawBytes);
    const receipt = makeFailureReceipt({
      stage: `${judge}_JUDGMENT_CAPTURE`,
      inputArtifactSha256s: { rawOutput: sha256(rawBytes), packet: slot.exactPacketSha256 },
      failureCode: "STRUCTURED_OUTPUT_SYNTAX_OR_SCHEMA_FAILURE",
      validationErrors: [error instanceof Error ? error.message : "unknown error"],
      timestamp: new Date().toISOString(),
      source: verification.identities,
      stoppedBeforeDownstreamArtifact: true,
    });
    await writePrivate(resolve(privateRoot,
      `evaluation/${judge}/failures/${opaqueResponseId}/attempt-${attempt}-receipt.json`), json(receipt));
    throw error;
  }
}

async function buildAdjudication(mastGitDirectory: string, artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const [j1Paths, j2Paths] = await Promise.all([
    listPrivateJson(resolve(privateRoot, "evaluation/J1/captures")),
    listPrivateJson(resolve(privateRoot, "evaluation/J2/captures")),
  ]);
  if (j1Paths.length !== ROUND_3_GENERATION_COUNT || j2Paths.length !== ROUND_3_GENERATION_COUNT) {
    throw new Error("ROUND_3_PRIMARY_JUDGMENTS_INCOMPLETE");
  }
  const [j1, j2, blindSchedule, prompt] = await Promise.all([
    Promise.all(j1Paths.map(readJson)),
    Promise.all(j2Paths.map(readJson)),
    readJson(resolve(privateRoot, "evaluation/blind-schedule.json")),
    readFile(adjudicatorPromptPath, "utf8"),
  ]);
  const disagreements = detectPrimaryDisagreements(j1, j2);
  const blindById = new Map(blindSchedule.entries.map((entry: any) => [entry.opaqueResponseId, entry]));
  const entries = [];
  for (const disagreement of disagreements) {
    const source: any = blindById.get(disagreement.opaqueResponseId);
    const originalPacket = await readFile(resolve(privateRoot, source.packetFile), "utf8");
    const packet = `${prompt}\n\n${originalPacket}\n\n<J1>\n${json(disagreement.j1.score)}</J1>\n<J2>\n${json(disagreement.j2.score)}</J2>\n`;
    const relative = `evaluation/J3/packets/${disagreement.opaqueResponseId}.txt`;
    const exactPacketSha256 = await writePrivate(resolve(privateRoot, relative), packet);
    entries.push({
      opaqueResponseId: disagreement.opaqueResponseId,
      exactPacketSha256,
      exactGenerationOutputSha256: disagreement.j1.exactGenerationOutputSha256,
      packetFile: relative,
    });
  }
  const schedule = { schemaVersion: 1, studyId: ROUND_3_STUDY_ID, entries };
  const scheduleSha256 = await writePrivate(resolve(privateRoot, "evaluation/J3/schedule.json"), json(schedule));
  return { status: "ADJUDICATION_SCHEDULE_BUILT", disagreementCount: entries.length, scheduleSha256 };
}

async function recordConflictReview(mastGitDirectory: string, artifactRoot: string, reviewPath: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const review = benchmarkConflictReviewSchema.parse(await readJson(reviewPath));
  const name = `${review.familyId}-${review.actionId.replace(/[^A-Za-z0-9_.-]/gu, "_")}.json`;
  await writePrivate(resolve(privateRoot, `clinical/conflict-reviews/${name}`), json(review));
  return review;
}

function markdownReport(summary: any, familyManifest: any): string {
  const rows = familyManifest.validationFamilies.map((familyId: string) => {
    const arms = summary.rawBenchmarkResult.familyArmScores[familyId];
    const db = summary.rawBenchmarkResult.primaryDMinusB.perFamily.find((row: any) => row.familyId === familyId)?.delta;
    const dc = summary.rawBenchmarkResult.secondaryDMinusC.perFamily.find((row: any) => row.familyId === familyId)?.delta;
    return `| ${familyId} | ${arms?.A?.display6 ?? "—"} | ${arms?.B?.display6 ?? "—"} | ${arms?.C?.display6 ?? "—"} | ${arms?.D?.display6 ?? "—"} | ${db?.display6 ?? "—"} | ${dc?.display6 ?? "—"} |`;
  });
  const countSummary = (field: "omissions" | "commissions") => ["A", "B", "C", "D"]
    .map((arm) => `${arm}=${summary.rawBenchmarkResult[field][arm].total ?? "unresolved"}`)
    .join(", ");
  return `# MAST Fresh Validation Round 3 final report\n\n`
    + `Raw frozen-rule disposition: **${summary.frozenRuleDisposition}**\n\n`
    + `Validation eligible: **${summary.validationEligible ? "yes" : "no"}**\n\n`
    + `Completed responses: ${summary.completedResponses}/${summary.plannedResponses}. `
    + `Judgments: J1 ${summary.judgments.J1}, J2 ${summary.judgments.J2}, J3 ${summary.judgments.J3}.\n\n`
    + `| Family | A | B | C | D | D−B | D−C |\n|---|---:|---:|---:|---:|---:|---:|\n`
    + `${rows.join("\n")}\n\n`
    + `Benchmark-target conflicts are reported separately and never alter raw benchmark scores. `
    + `Material clinical conflicts: ${summary.clinicalReconciliation.materialConflictCount}.\n\n`
    + `Omission totals: ${countSummary("omissions")}. Commission totals: ${countSummary("commissions")}.\n\n`
    + `Limited reserve (not confirmatory): ${familyManifest.reserveFamilies.join(", ")} `
    + `(identifier-only in Round 3; historically mechanically read in Round 1, never generated or judge-exposed; status ${familyManifest.reserveStatus.status}).\n\n`
    + `This is a bounded fresh validation over the remaining eligible MAST families. `
    + `Even a PASS is not proof that AskRigor is clinically superior in general, and the single All008 reserve is not a broad independent confirmatory cohort.\n`;
}

async function finalize(mastGitDirectory: string, artifactRoot: string) {
  const privateRoot = await ensurePrivateRoot(artifactRoot);
  await verifyRuntimeBinding(mastGitDirectory, privateRoot);
  const [generationPaths, j1Paths, j2Paths, j3Paths, mapping, familyManifest, failurePaths, reviewPaths] = await Promise.all([
    listPrivateJson(resolve(privateRoot, "generation/captures")),
    listPrivateJson(resolve(privateRoot, "evaluation/J1/captures")),
    listPrivateJson(resolve(privateRoot, "evaluation/J2/captures")),
    listPrivateJson(resolve(privateRoot, "evaluation/J3/captures")),
    readJson(resolve(privateRoot, "evaluation/sealed-condition-map.json")),
    readJson(familyManifestPath),
    listIntegrityFailureReceipts(privateRoot),
    listPrivateJson(resolve(privateRoot, "clinical/conflict-reviews")),
  ]);
  if (generationPaths.length !== ROUND_3_GENERATION_COUNT || j1Paths.length !== ROUND_3_GENERATION_COUNT
    || j2Paths.length !== ROUND_3_GENERATION_COUNT) throw new Error("ROUND_3_FINAL_COVERAGE_INCOMPLETE");
  const [generations, j1, j2, j3, reviews] = await Promise.all([
    Promise.all(generationPaths.map(readJson)), Promise.all(j1Paths.map(readJson)),
    Promise.all(j2Paths.map(readJson)), Promise.all(j3Paths.map(readJson)),
    Promise.all(reviewPaths.map(readJson)),
  ]);
  const reconciliation = reconcileJudgments({
    generation: generations.map(({ opaqueInputId, exactOutputSha256 }) => ({ opaqueInputId, exactOutputSha256 })),
    mapping: mapping.records,
    j1, j2, j3,
  });
  const expectedReviews = expectedBenchmarkConflictReviews({
    targets: reconciliation.benchmarkConflictTargets,
    mapping: mapping.records,
  });
  const observedReviews = reviews.map(({ familyId, actionId }) => ({ familyId, actionId }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId)
      || left.actionId.localeCompare(right.actionId));
  if (JSON.stringify(observedReviews) !== JSON.stringify(expectedReviews)) {
    throw new Error("ROUND_3_BENCHMARK_CONFLICT_REVIEW_COVERAGE_INVALID");
  }
  const result = scoreRound3({
    generation: generations.map(({ opaqueInputId, exactOutputSha256 }) => ({ opaqueInputId, exactOutputSha256 })),
    mapping: mapping.records,
    final: reconciliation.final,
    expectedFamilies: familyManifest.validationFamilies,
  });
  const summary = buildMachineSummary({
    result,
    plannedResponses: ROUND_3_GENERATION_COUNT,
    completedResponses: generations.length,
    j1Count: j1.length,
    j2Count: j2.length,
    j3Count: j3.length,
    failureReceiptCount: failurePaths.length,
    benchmarkReviews: reviews,
    materialComponentChangedAfterResponse1: false,
  });
  await writePrivate(resolve(privateRoot, "final/final-summary.json"), json(summary));
  await writePrivate(resolve(privateRoot, "final/final-report.md"), markdownReport(summary, familyManifest));
  await writePrivate(resolve(privateRoot, "final/unblind-receipt.json"), json({
    schemaVersion: 1,
    studyId: ROUND_3_STUDY_ID,
    unblindedAt: new Date().toISOString(),
    mappingSha256: sha256(await readFile(resolve(privateRoot, "evaluation/sealed-condition-map.json"))),
    joinedRecordCount: reconciliation.final.length,
    aliasSafeExplicitJoin: true,
  }));
  return summary;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  let result: unknown;
  if (command === "create-seed") result = await createSeed(requiredArgument("--artifact-root"));
  else if (command === "verify-freeze") result = await verifyFrozenSources(requiredArgument("--mast-git-dir"));
  else if (command === "seal-freeze") result = await sealFreeze(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"), requiredArgument("--ci-receipt"));
  else if (command === "prepare-generation") result = await prepareGeneration(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"));
  else if (command === "status") result = await status(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"));
  else if (command === "next-generation") result = await nextGeneration(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"));
  else if (command === "capture-generation") result = await captureGeneration(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"), requiredArgument("--opaque-input-id"),
    requiredArgument("--output-file"), requiredArgument("--provider-receipt"),
    requiredArgument("--transport-receipt"));
  else if (command === "seal-generation") result = await sealGeneration(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"));
  else if (command === "build-blind-packets") result = await buildBlindPackets(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"));
  else if (command === "next-judgment") result = await nextJudgment(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"), requiredArgument("--judge") as "J1" | "J2" | "J3");
  else if (command === "capture-judgment") result = await captureJudgment(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"), requiredArgument("--judge") as "J1" | "J2" | "J3",
    requiredArgument("--opaque-response-id"), requiredArgument("--raw-output"),
    requiredArgument("--provider-receipt"));
  else if (command === "build-adjudication") result = await buildAdjudication(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"));
  else if (command === "record-conflict-review") result = await recordConflictReview(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"), requiredArgument("--review-file"));
  else if (command === "finalize") result = await finalize(requiredArgument("--mast-git-dir"),
    requiredArgument("--artifact-root"));
  else throw new Error("ROUND_3_COMMAND_INVALID");
  process.stdout.write(json(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (error: unknown) => {
    const artifactRoot = argument("--artifact-root");
    const mastGitDirectory = argument("--mast-git-dir");
    if (artifactRoot && mastGitDirectory) {
      try {
        const privateRoot = await ensurePrivateRoot(artifactRoot);
        const identities = await sourceIdentity(mastGitDirectory);
        const receipt = makeFailureReceipt({
          stage: process.argv[2] ?? "UNKNOWN",
          inputArtifactSha256s: {},
          failureCode: "ROUND_3_STAGE_FAILED",
          validationErrors: [error instanceof Error ? error.message : "unknown error"],
          timestamp: new Date().toISOString(),
          source: identities,
          stoppedBeforeDownstreamArtifact: true,
        });
        await writePrivate(resolve(privateRoot,
          `failures/${Date.now()}-${process.pid}-${process.argv[2] ?? "unknown"}.json`), json(receipt));
      } catch { /* preserve original failure */ }
    }
    process.stderr.write(`${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}

export {
  buildAdjudication,
  buildBlindPackets,
  captureGeneration,
  captureJudgment,
  createSeed,
  finalize,
  prepareGeneration,
  sealFreeze,
  sealGeneration,
  verifyFrozenSources,
};
