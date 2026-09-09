import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  createDispatchRecords,
  deriveIdentifierOnlySelection,
  FRESH_VALIDATION_ARMS,
  sha256,
  type FreshValidationArm,
} from "../evaluation/mast/src/fresh-validation.js";
import { loadCanonicalHrpInstructions } from "../evaluation/mast/src/paired-condition.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(repositoryRoot,
  "evaluation/mast/fresh-validation-round-1-preregistration.json");

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function gitText(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return stdout.trim();
}

async function loadManifest(): Promise<any> {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

async function verifySource(manifest: any, mastRootInput: string): Promise<Record<string, unknown>> {
  const mastRoot = await realpath(mastRootInput);
  const selection = deriveIdentifierOnlySelection({
    candidateFamilies: manifest.cohort.candidateFamilies,
    seedInteger: manifest.selectionMethod.seedInteger,
  });
  if (JSON.stringify(selection.freshFamilies) !== JSON.stringify(manifest.cohort.freshFamilies)
    || JSON.stringify(selection.reservedFamilies) !== JSON.stringify(manifest.cohort.reservedFamilies)
    || selection.representativeIndex !== manifest.selectionMethod.representativeIndex
    || selection.supplementalStart !== manifest.selectionMethod.supplementalStart
    || JSON.stringify(selection.supplementalPrefixes)
      !== JSON.stringify(manifest.selectionMethod.supplementalPrefixes)) {
    throw new Error("FRESH_VALIDATION_FROZEN_SELECTION_MISMATCH");
  }
  const [universal, hrp, mastCommit, mastTree, mastStatus, baseAncestor] = await Promise.all([
    readFile(resolve(repositoryRoot, "protocols/Universal_Instructions.xml")),
    readFile(resolve(repositoryRoot, "protocols/HRP_Full.xml")),
    gitText(mastRoot, "rev-parse", "HEAD"),
    gitText(mastRoot, "rev-parse", "HEAD^{tree}"),
    gitText(mastRoot, "status", "--porcelain=v1"),
    gitText(repositoryRoot, "merge-base", "--is-ancestor",
      manifest.sourceBindings.askRigor.commit, "HEAD").then(() => true),
  ]);
  if (!baseAncestor || sha256(universal) !== manifest.sourceBindings.askRigor.universal.sha256
    || sha256(hrp) !== manifest.sourceBindings.askRigor.hrp.sha256) {
    throw new Error("FRESH_VALIDATION_ASKRIGOR_SOURCE_DRIFT");
  }
  if (mastCommit !== manifest.sourceBindings.mast.commit
    || mastTree !== manifest.sourceBindings.mast.tree || mastStatus !== "") {
    throw new Error("FRESH_VALIDATION_MAST_SOURCE_DRIFT");
  }
  return {
    selectionVerified: true,
    sourceCommitIsAncestor: true,
    universalSha256: sha256(universal),
    hrpSha256: sha256(hrp),
    mastCommit,
    mastTree,
    mastWorktreeClean: true,
    reservedFamilyContentRead: false,
  };
}

async function verifyPrivateRoot(root: string): Promise<string> {
  if (!isAbsolute(root)) throw new Error("FRESH_VALIDATION_ARTIFACT_ROOT_NOT_ABSOLUTE");
  const real = await realpath(root);
  const repository = await realpath(repositoryRoot);
  if (real === repository || real.startsWith(`${repository}/`)) {
    throw new Error("FRESH_VALIDATION_ARTIFACT_ROOT_INSIDE_REPOSITORY");
  }
  const info = await stat(real);
  if (!info.isDirectory() || (info.mode & 0o777) !== 0o700) {
    throw new Error("FRESH_VALIDATION_ARTIFACT_ROOT_MODE_INVALID");
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

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function prepareGeneration(manifest: any, mastRootInput: string, artifactRootInput: string,
  seedPath: string): Promise<Record<string, unknown>> {
  const verification = await verifySource(manifest, mastRootInput);
  const artifactRoot = await verifyPrivateRoot(artifactRootInput);
  const privateSeed = await readFile(seedPath);
  if (privateSeed.byteLength !== manifest.design.dispatchSeed.privateSeedBytes
    || sha256(privateSeed) !== manifest.design.dispatchSeed.sha256Commitment) {
    throw new Error("FRESH_VALIDATION_PRIVATE_SEED_RECEIPT_MISMATCH");
  }
  const mastRoot = await realpath(mastRootInput);
  const [itemsBytes, defaultPrompt, thoroughPrompt, protocols] = await Promise.all([
    readFile(resolve(mastRoot, "benchmarks/donoharm/dataset/items.jsonl"), "utf8"),
    readFile(resolve(mastRoot, "benchmarks/donoharm/prompts/default.md"), "utf8"),
    readFile(resolve(mastRoot, "benchmarks/donoharm/prompts/thorough.md"), "utf8"),
    loadCanonicalHrpInstructions(repositoryRoot),
  ]);
  if (defaultPrompt !== "") throw new Error("FRESH_VALIDATION_MAST_DEFAULT_PROMPT_NOT_EMPTY");
  const allowed = new Set([
    ...manifest.cohort.freshFamilies,
    ...manifest.cohort.developmentRegressionFamilies,
  ]);
  const prompts = new Map(itemsBytes.split("\n").filter(Boolean).map((line) => {
    const item = JSON.parse(line) as { id: string; prompt: string };
    return [item.id, item.prompt] as const;
  }).filter(([id]) => allowed.has(id)));
  if (prompts.size !== allowed.size || [...allowed].some((id) => !prompts.has(id))) {
    throw new Error("FRESH_VALIDATION_BASE_PROMPT_SET_INCOMPLETE");
  }
  const dispatch = createDispatchRecords({
    privateSeed,
    freshFamilies: manifest.cohort.freshFamilies,
    regressionFamilies: manifest.cohort.developmentRegressionFamilies,
    trialsPerFamilyPerArm: manifest.design.trialsPerFamilyPerArm,
  });
  const armInput = (arm: FreshValidationArm, prompt: string): string => ({
    A: prompt,
    B: `${thoroughPrompt}${prompt}`,
    C: `${protocols.universalBytes}\n\n${prompt}`,
    D: `${protocols.universalBytes}\n\n${protocols.hrpBytes}\n\n${prompt}`,
  })[arm];
  const mapRecords = [];
  for (const record of dispatch) {
    const input = armInput(record.armId, prompts.get(record.familyId)!);
    const laneDirectory = record.lane === "FRESH_VALIDATION" ? "fresh" : "regression";
    const relative = `generation/${laneDirectory}/inputs/${String(record.sequence)
      .padStart(3, "0")}-${record.opaqueInputId}.txt`;
    const exactInputSha256 = await writePrivate(resolve(artifactRoot, relative), input);
    mapRecords.push({ ...record, inputFile: relative, exactInputSha256,
      exactInputUtf8Bytes: Buffer.byteLength(input, "utf8") });
  }
  const laneSchedule = (lane: string) => mapRecords.filter((record) => record.lane === lane)
    .map(({ sequence, opaqueInputId }) => ({ sequence, opaqueInputId }));
  const privateMap = {
    schemaVersion: 1,
    studyId: manifest.studyId,
    records: mapRecords,
  };
  const privateMapSha256 = await writePrivate(resolve(artifactRoot,
    "generation/private-dispatch-map.json"), json(privateMap));
  const freshScheduleSha256 = await writePrivate(resolve(artifactRoot,
    "generation/fresh-opaque-schedule.json"), json({ schemaVersion: 1,
      studyId: manifest.studyId, lane: "FRESH_VALIDATION", entries: laneSchedule("FRESH_VALIDATION") }));
  const regressionScheduleSha256 = await writePrivate(resolve(artifactRoot,
    "generation/regression-opaque-schedule.json"), json({ schemaVersion: 1,
      studyId: manifest.studyId, lane: "DEVELOPMENT_REGRESSION",
      entries: laneSchedule("DEVELOPMENT_REGRESSION") }));
  const receipt = {
    schemaVersion: 1,
    studyId: manifest.studyId,
    verification,
    preregistrationSha256: sha256(await readFile(manifestPath)),
    seedCommitmentVerified: true,
    freshInputCount: laneSchedule("FRESH_VALIDATION").length,
    regressionInputCount: laneSchedule("DEVELOPMENT_REGRESSION").length,
    privateMapSha256,
    freshScheduleSha256,
    regressionScheduleSha256,
    rubricsOrGuidanceRead: false,
    reservedFamilyContentRead: false,
    modelInferencePerformed: false,
  };
  const receiptSha256 = await writePrivate(resolve(artifactRoot,
    "generation/preparation-receipt.json"), json(receipt));
  return { ...receipt, receiptSha256 };
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const mastRoot = argument("--mast-root");
  if (!mastRoot) throw new Error("--mast-root is required");
  const manifest = await loadManifest();
  if (command === "verify-freeze") {
    process.stdout.write(`${JSON.stringify(await verifySource(manifest, mastRoot), null, 2)}\n`);
    return;
  }
  if (command === "prepare-generation") {
    const artifactRoot = argument("--artifact-root");
    const seedPath = argument("--seed-file");
    if (!artifactRoot || !seedPath) {
      throw new Error("prepare-generation requires --artifact-root and --seed-file");
    }
    process.stdout.write(`${JSON.stringify(
      await prepareGeneration(manifest, mastRoot, artifactRoot, seedPath), null, 2)}\n`);
    return;
  }
  throw new Error("Usage: verify-freeze|prepare-generation --mast-root PATH [options]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}

export { prepareGeneration, verifySource };
