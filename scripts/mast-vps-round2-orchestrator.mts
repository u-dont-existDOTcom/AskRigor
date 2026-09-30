import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";

import { generationCaptureSchema } from "../evaluation/mast/src/fresh-validation-round-2.js";
import { assertVpsPacketTransferEligible, VPS_PRIVATE_ROOT } from "../evaluation/mast/src/vps-cdp-transport.js";

const execFile = promisify(execFileCallback);
const STUDY_ID = "askrigor-mast-fresh-validation-round-2-20260918";
const DEVICE = "srv1894948";
const USER = "cloudbrowser";
const REMOTE_APP = `${VPS_PRIVATE_ROOT}/app`;
const REMOTE_SCRIPT = `${REMOTE_APP}/mast-vps-cdp-generation.mjs`;

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const canonicalJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}.`);
  return process.argv[index + 1]!;
}

async function writePrivate(path: string, bytes: Uint8Array) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, path);
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function run(program: string, args: string[], timeout = 30 * 60 * 1_000) {
  return execFile(program, args, { timeout, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" });
}

function sshArgs(key: string, host: string, remoteCommand: string) {
  return ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", `root@${host}`, remoteCommand];
}

function scpArgs(key: string, paths: string[], destination: string) {
  return ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", ...paths, destination];
}

async function buildPacketManifest(artifactRoot: string) {
  const packetMap = await readJson(join(artifactRoot, "generation/packet-map.json"));
  if (packetMap?.studyId !== STUDY_ID || !Array.isArray(packetMap.records) || packetMap.records.length !== 144) {
    throw new Error("ROUND_2_PACKET_MAP_INVALID");
  }
  const records = [];
  for (const record of [...packetMap.records].sort((left, right) => left.sequence - right.sequence)) {
    const path = join(artifactRoot, record.inputFile);
    const bytes = await readFile(path);
    const sourceSha256 = sha256(bytes);
    if (sourceSha256 !== record.exactInputSha256 || bytes.byteLength !== record.inputUtf8Bytes) {
      throw new Error(`ROUND_2_PACKET_SOURCE_MISMATCH_${record.sequence}`);
    }
    records.push({
      sequence: record.sequence,
      opaqueInputId: record.opaqueInputId,
      sourceRelativePath: record.inputFile,
      fileName: basename(record.inputFile),
      expectedSha256: record.exactInputSha256,
      sourceSha256,
      sourceUtf8Bytes: bytes.byteLength,
    });
  }
  return { schemaVersion: 1, studyId: STUDY_ID, device: DEVICE, user: USER, records };
}

async function transferPackets() {
  const repositoryRoot = resolve(requiredArgument("--repository-root"));
  const artifactRoot = resolve(requiredArgument("--artifact-root"));
  const key = resolve(requiredArgument("--ssh-key"));
  const host = requiredArgument("--host");
  const manifest = await buildPacketManifest(artifactRoot);
  const localManifest = join(artifactRoot, "environment/vps-packet-manifest.json");
  await writePrivate(localManifest, Buffer.from(canonicalJson(manifest), "utf8"));

  await run("ssh", sshArgs(key, host,
    `install -d -m 0700 -o cloudbrowser -g cloudbrowser ${VPS_PRIVATE_ROOT} ${VPS_PRIVATE_ROOT}/packets ${VPS_PRIVATE_ROOT}/runs ${REMOTE_APP}`));
  await run("scp", scpArgs(key, [
    join(repositoryRoot, "scripts/mast-vps-cdp-generation.mjs"),
    join(repositoryRoot, "evaluation/mast/vps-runtime/package.json"),
    join(repositoryRoot, "evaluation/mast/vps-runtime/package-lock.json"),
    localManifest,
  ], `root@${host}:${REMOTE_APP}/`));
  await run("ssh", sshArgs(key, host,
    `chown cloudbrowser:cloudbrowser ${REMOTE_APP}/mast-vps-cdp-generation.mjs ${REMOTE_APP}/package.json ${REMOTE_APP}/package-lock.json ${REMOTE_APP}/vps-packet-manifest.json && chmod 0700 ${REMOTE_APP}/mast-vps-cdp-generation.mjs && chmod 0600 ${REMOTE_APP}/package.json ${REMOTE_APP}/package-lock.json ${REMOTE_APP}/vps-packet-manifest.json && runuser -u cloudbrowser -- env PATH=/home/cloudbrowser/.local/bin:/usr/bin:/bin /home/cloudbrowser/.local/bin/npm --prefix ${REMOTE_APP} ci --ignore-scripts`));
  const acceptanceResult = await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} pre-send-acceptance`));
  const acceptance = JSON.parse(acceptanceResult.stdout.trim().split("\n").at(-1)!);
  if (acceptance.status !== "PRE_SEND_ACCEPTANCE_PASS" || acceptance.sent !== false
    || acceptance.sourceSha256 !== acceptance.composerSha256 || acceptance.sourceUtf8Bytes < 167_433
    || acceptance.modelVisibleLabel !== "GPT-5.6 Sol" || acceptance.reasoningVisibleLabel !== "Extra High"
    || acceptance.reasoningOrdinal !== "4 of 5" || acceptance.chatMode !== "TEMPORARY"
    || acceptance.personalization !== "UNPERSONALIZED" || acceptance.authenticated !== true) {
    throw new Error("VPS_PRE_SEND_ACCEPTANCE_INVALID");
  }
  await writePrivate(join(artifactRoot, "environment/vps-pre-send-acceptance.json"), Buffer.from(canonicalJson(acceptance), "utf8"));

  await run("rsync", [
    "-a", "--checksum", "--chmod=D700,F600", "-e",
    `ssh -i ${key} -o BatchMode=yes -o StrictHostKeyChecking=yes`,
    `${join(artifactRoot, "generation/inputs")}/`, `root@${host}:${VPS_PRIVATE_ROOT}/packets/`,
  ]);
  await run("ssh", sshArgs(key, host,
    `chown -R cloudbrowser:cloudbrowser ${VPS_PRIVATE_ROOT}/packets && chmod 0700 ${VPS_PRIVATE_ROOT}/packets && find ${VPS_PRIVATE_ROOT}/packets -type f -exec chmod 0600 {} + && runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} verify-transfer --workspace ${VPS_PRIVATE_ROOT} --manifest ${REMOTE_APP}/vps-packet-manifest.json`));
  const localReceipt = join(artifactRoot, "environment/vps-packet-transfer-receipt.json");
  await run("scp", scpArgs(key, [`root@${host}:${VPS_PRIVATE_ROOT}/packet-transfer-receipt.json`], localReceipt));
  assertVpsPacketTransferEligible(await readJson(localReceipt));
  process.stdout.write(`${JSON.stringify({ status: "VPS_PACKET_TRANSFER_COMPLETE", packetCount: 144, manifestSha256: sha256(await readFile(localManifest)), receiptSha256: sha256(await readFile(localReceipt)) })}\n`);
}

async function completedIds(artifactRoot: string) {
  const directory = join(artifactRoot, "generation/captures");
  try { return new Set((await readdir(directory)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5))); }
  catch (error) {
    if (error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT") return new Set<string>();
    throw error;
  }
}

async function captureOne(input: {
  repositoryRoot: string; mastGitDirectory: string; artifactRoot: string; key: string; host: string;
  record: any;
}) {
  const { repositoryRoot, mastGitDirectory, artifactRoot, key, host, record } = input;
  const remoteDirectory = `${VPS_PRIVATE_ROOT}/runs/${record.opaqueInputId}`;
  await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} run-one --workspace ${VPS_PRIVATE_ROOT} --manifest ${REMOTE_APP}/vps-packet-manifest.json --run-id ${record.opaqueInputId}`),
  RESPONSE_TIMEOUT_FOR_ORCHESTRATOR);
  const staging = join(artifactRoot, `environment/vps-staging/${record.opaqueInputId}`);
  await mkdir(staging, { recursive: true, mode: 0o700 });
  await run("scp", scpArgs(key, [
    `root@${host}:${remoteDirectory}/response.txt`,
    `root@${host}:${remoteDirectory}/provider.json`,
    `root@${host}:${remoteDirectory}/provenance.json`,
    `root@${host}:${remoteDirectory}/transport-receipt.json`,
  ], `${staging}/`));
  const transport = await readJson(join(staging, "transport-receipt.json"));
  if (transport.sourceSha256 !== record.exactInputSha256 || transport.state !== "RESPONSE_COMPLETE") {
    throw new Error("VPS_RESPONSE_TRANSPORT_RECEIPT_INVALID");
  }
  await run(process.execPath, [
    "--import", "tsx", join(repositoryRoot, "scripts/mast-fresh-validation-round-2.mts"), "capture-generation",
    "--mast-git-dir", mastGitDirectory, "--artifact-root", artifactRoot,
    "--opaque-input-id", record.opaqueInputId,
    "--output-file", join(staging, "response.txt"),
    "--provider-receipt", join(staging, "provider.json"),
    "--transport-receipt", join(staging, "transport-receipt.json"),
  ]);
  const capturePath = join(artifactRoot, `generation/captures/${record.opaqueInputId}.json`);
  generationCaptureSchema.parse(await readJson(capturePath));
  const captureSha256 = sha256(await readFile(capturePath));
  await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} mark-sealed --workspace ${VPS_PRIVATE_ROOT} --run-id ${record.opaqueInputId} --capture-sha256 ${captureSha256}`));
  return captureSha256;
}

const RESPONSE_TIMEOUT_FOR_ORCHESTRATOR = 35 * 60 * 1_000;

async function runGeneration() {
  const repositoryRoot = resolve(requiredArgument("--repository-root"));
  const mastGitDirectory = resolve(requiredArgument("--mast-git-dir"));
  const artifactRoot = resolve(requiredArgument("--artifact-root"));
  const key = resolve(requiredArgument("--ssh-key"));
  const host = requiredArgument("--host");
  assertVpsPacketTransferEligible(await readJson(join(artifactRoot, "environment/vps-packet-transfer-receipt.json")));
  const packetMap = await readJson(join(artifactRoot, "generation/packet-map.json"));
  const completed = await completedIds(artifactRoot);
  for (const record of [...packetMap.records].sort((left, right) => left.sequence - right.sequence)) {
    if (completed.has(record.opaqueInputId)) continue;
    const captureSha256 = await captureOne({ repositoryRoot, mastGitDirectory, artifactRoot, key, host, record });
    completed.add(record.opaqueInputId);
    process.stdout.write(`${JSON.stringify({ status: "RUN_SEALED", sequence: record.sequence, opaqueInputId: record.opaqueInputId, captureSha256, completed: completed.size, planned: 144 })}\n`);
  }
  process.stdout.write(`${JSON.stringify({ status: "GENERATION_COMPLETE", completed: completed.size, planned: 144 })}\n`);
}

const command = process.argv[2];
if (command === "transfer") await transferPackets();
else if (command === "run") await runGeneration();
else throw new Error(`Unknown command: ${command ?? "(missing)"}`);
