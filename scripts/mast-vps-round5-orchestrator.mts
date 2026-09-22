import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";

import { generationCaptureSchema } from "../evaluation/mast/src/fresh-validation-round-5.js";
import { assertVpsPacketTransferEligible, VPS_PRIVATE_ROOT } from "../evaluation/mast/src/vps-cdp-transport-round-5.js";

const execFile = promisify(execFileCallback);
const STUDY_ID = "askrigor-mast-fresh-validation-round-5-20260920";
const DEVICE = "srv1894948";
const USER = "cloudbrowser";
const REMOTE_APP = `${VPS_PRIVATE_ROOT}/app`;
const REMOTE_SCRIPT = `${REMOTE_APP}/mast-vps-cdp-generation-round-5.mjs`;
const REMOTE_RUNTIME_HASHES = `${REMOTE_APP}/expected-runtime-hashes.json`;
const BROWSER_SERVICE = "askrigor-mast-round3-brave.service";
const DISPLAY_SERVICE = "askrigor-mast-round3-xvfb.service";
const WATCHDOG_SERVICE = "askrigor-mast-round3-watchdog.service";

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

async function exists(path: string) {
  try { await readFile(path); return true; } catch (error) {
    if (error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function preserveTerminalDisposition(artifactRoot: string, value: Record<string, unknown>) {
  const path = join(artifactRoot, "disposition/round-5-terminal-indeterminate.json");
  const ambiguityPath = join(artifactRoot, "disposition/round-5-post-send-ambiguity.json");
  if (await exists(path) || await exists(ambiguityPath)) return;
  await writePrivate(path, Buffer.from(canonicalJson({
    schemaVersion: 1,
    studyId: STUDY_ID,
    status: "INDETERMINATE",
    validationEligible: false,
    laterRunsAuthorized: false,
    exposedFamiliesBecomeDevelopment: true,
    recordedAt: new Date().toISOString(),
    ...value,
  }), "utf8"));
}

async function run(program: string, args: string[], timeout = 30 * 60 * 1_000) {
  return execFile(program, args, { timeout, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" });
}

async function runtimeHashes(repositoryRoot: string) {
  const paths = {
    browserUnitSha256: "deploy/systemd/askrigor-mast-round3-brave.service",
    displayUnitSha256: "deploy/systemd/askrigor-mast-round3-xvfb.service",
    watchdogUnitSha256: "deploy/systemd/askrigor-mast-round3-watchdog.service",
    browserWrapperSha256: "deploy/vps/brave-mast-round3.sh",
    watchdogScriptSha256: "deploy/vps/cdp-watchdog.sh",
    transportScriptSha256: "scripts/mast-vps-cdp-generation-round-5.mjs",
  } as const;
  return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => (
    [key, sha256(await readFile(join(repositoryRoot, path)))]
  ))));
}

async function writeExpectedRuntimeHashes(repositoryRoot: string, artifactRoot: string) {
  const observed = await runtimeHashes(repositoryRoot);
  const environment = await readJson(join(repositoryRoot, "evaluation/mast/fresh-validation-round-5-environment.json"));
  const amendment = await readJson(join(repositoryRoot,
    "evaluation/mast/fresh-validation-round-5-owner-model-amendment-20260922.json"));
  const expected = { ...environment.runtimeFileHashes };
  const amendedTransportHash = amendment.executableHashOverrides?.["scripts/mast-vps-cdp-generation-round-5.mjs"];
  if (typeof amendedTransportHash === "string") expected.transportScriptSha256 = amendedTransportHash;
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    throw new Error("ROUND_5_RUNTIME_HASH_MANIFEST_DRIFT");
  }
  const path = join(artifactRoot, "environment/expected-runtime-hashes.json");
  await writePrivate(path, Buffer.from(canonicalJson(observed), "utf8"));
  return path;
}

function sshArgs(key: string, host: string, remoteCommand: string) {
  return ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", `root@${host}`, remoteCommand];
}

function scpArgs(key: string, paths: string[], destination: string) {
  return ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", ...paths, destination];
}

async function installRuntime() {
  const repositoryRoot = resolve(requiredArgument("--repository-root"));
  const artifactRoot = resolve(requiredArgument("--artifact-root"));
  const key = resolve(requiredArgument("--ssh-key"));
  const host = requiredArgument("--host");
  const localRuntimeHashes = await writeExpectedRuntimeHashes(repositoryRoot, artifactRoot);
  await run("ssh", sshArgs(key, host,
    `set -eu; install -d -m 0700 -o cloudbrowser -g cloudbrowser ${VPS_PRIVATE_ROOT} ${REMOTE_APP}; install -d -m 0755 /usr/local/lib/askrigor-mast-round3`));
  await run("scp", scpArgs(key, [
    join(repositoryRoot, "deploy/vps/brave-mast-round3.sh"),
    join(repositoryRoot, "deploy/vps/cdp-watchdog.sh"),
    join(repositoryRoot, "scripts/mast-vps-cdp-generation-round-5.mjs"),
    join(repositoryRoot, "evaluation/mast/vps-runtime-round-3/package.json"),
    join(repositoryRoot, "evaluation/mast/vps-runtime-round-3/package-lock.json"),
    localRuntimeHashes,
  ], `root@${host}:${REMOTE_APP}/`));
  await run("scp", scpArgs(key, [
    join(repositoryRoot, "deploy/systemd/askrigor-mast-round3-xvfb.service"),
    join(repositoryRoot, "deploy/systemd/askrigor-mast-round3-brave.service"),
    join(repositoryRoot, "deploy/systemd/askrigor-mast-round3-watchdog.service"),
  ], `root@${host}:/etc/systemd/system/`));
  await run("ssh", sshArgs(key, host,
    `set -eu; test -d /home/cloudbrowser/.config/brave-mast-round3; install -m 0755 ${REMOTE_APP}/brave-mast-round3.sh /usr/local/lib/askrigor-mast-round3/brave-mast-round3.sh; install -m 0755 ${REMOTE_APP}/cdp-watchdog.sh /usr/local/lib/askrigor-mast-round3/cdp-watchdog.sh; chown cloudbrowser:cloudbrowser ${REMOTE_APP}/mast-vps-cdp-generation-round-5.mjs ${REMOTE_APP}/package.json ${REMOTE_APP}/package-lock.json ${REMOTE_RUNTIME_HASHES}; chmod 0700 ${REMOTE_APP}/mast-vps-cdp-generation-round-5.mjs; chmod 0600 ${REMOTE_APP}/package.json ${REMOTE_APP}/package-lock.json ${REMOTE_RUNTIME_HASHES}; runuser -u cloudbrowser -- env PATH=/home/cloudbrowser/.local/bin:/usr/bin:/bin /home/cloudbrowser/.local/bin/npm --prefix ${REMOTE_APP} ci --ignore-scripts; systemctl daemon-reload; systemctl enable ${DISPLAY_SERVICE} ${BROWSER_SERVICE} ${WATCHDOG_SERVICE}; systemctl restart ${DISPLAY_SERVICE}; systemctl restart ${BROWSER_SERVICE}; systemctl restart ${WATCHDOG_SERVICE}`), 10 * 60 * 1_000);
  const verify = await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} verify-runtime --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`));
  const receipt = JSON.parse(verify.stdout.trim());
  if (receipt.status !== "ROUND_5_RUNTIME_VERIFIED") throw new Error("ROUND_5_RUNTIME_VERIFICATION_FAILED");
  await writePrivate(join(artifactRoot, "environment/vps-runtime-attestation.json"), Buffer.from(canonicalJson(receipt), "utf8"));
  await writePrivate(join(artifactRoot, "environment/vps-profile-reuse.json"), Buffer.from(canonicalJson({
    schemaVersion: 1,
    studyId: STUDY_ID,
    owner: USER,
    reusedQualifiedProfile: "/home/cloudbrowser/.config/brave-mast-round3",
    browserService: BROWSER_SERVICE,
    sourceStudyGeneratedResponses: 0,
    reusedAt: new Date().toISOString(),
  }), "utf8"));
  process.stdout.write(`${JSON.stringify({ status: "ROUND_5_RUNTIME_INSTALLED", browserService: BROWSER_SERVICE, cdpEndpoint: "http://127.0.0.1:9224", runtimeHashes: await runtimeHashes(repositoryRoot) })}\n`);
}

async function buildPacketManifest(artifactRoot: string) {
  const packetMap = await readJson(join(artifactRoot, "generation/packet-map.json"));
  if (packetMap?.studyId !== STUDY_ID || !Array.isArray(packetMap.records) || packetMap.records.length !== 120) {
    throw new Error("ROUND_5_PACKET_MAP_INVALID");
  }
  const records = [];
  for (const record of [...packetMap.records].sort((left, right) => left.sequence - right.sequence)) {
    const path = join(artifactRoot, record.inputFile);
    const bytes = await readFile(path);
    const sourceSha256 = sha256(bytes);
    if (sourceSha256 !== record.exactInputSha256 || bytes.byteLength !== record.inputUtf8Bytes) {
      throw new Error(`ROUND_5_PACKET_SOURCE_MISMATCH_${record.sequence}`);
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

function generationSelectionIsLatest(value: any): boolean {
  if (value?.modelSelectionPolicy !== "TOP_VISIBLE_SELECTABLE_MODEL"
    || value?.modelSelectorIndex !== 0
    || !Number.isSafeInteger(value?.modelOptionCount) || value.modelOptionCount < 1
    || value?.reasoningSelectionPolicy !== "MAXIMUM_AVAILABLE"
    || typeof value?.modelVisibleLabel !== "string" || value.modelVisibleLabel.length === 0
    || typeof value?.reasoningVisibleLabel !== "string" || value.reasoningVisibleLabel.length === 0
    || typeof value?.reasoningOrdinal !== "string") return false;
  const match = /^(\d+) of (\d+)$/u.exec(value.reasoningOrdinal);
  return match !== null && Number(match[1]) === Number(match[2]);
}

function generationSelectionIsLegacy(value: any): boolean {
  return value?.modelVisibleLabel === "GPT-5.6 Sol"
    && value?.reasoningVisibleLabel === "Extra High"
    && value?.reasoningOrdinal === "4 of 5";
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
  await writeExpectedRuntimeHashes(repositoryRoot, artifactRoot);
  await run("scp", scpArgs(key, [localManifest], `root@${host}:${REMOTE_APP}/`));
  await run("ssh", sshArgs(key, host,
    `chown cloudbrowser:cloudbrowser ${REMOTE_APP}/vps-packet-manifest.json && chmod 0600 ${REMOTE_APP}/vps-packet-manifest.json && runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} verify-runtime --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`));
  const acceptanceResult = await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} pre-send-acceptance --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`));
  const acceptance = JSON.parse(acceptanceResult.stdout.trim().split("\n").at(-1)!);
  if (acceptance.status !== "PRE_SEND_ACCEPTANCE_PASS" || acceptance.sent !== false
    || acceptance.sourceSha256 !== acceptance.composerSha256 || acceptance.sourceUtf8Bytes < 167_433
    || !generationSelectionIsLatest(acceptance) || acceptance.chatMode !== "TEMPORARY"
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
  process.stdout.write(`${JSON.stringify({ status: "VPS_PACKET_TRANSFER_COMPLETE", packetCount: 120, manifestSha256: sha256(await readFile(localManifest)), receiptSha256: sha256(await readFile(localReceipt)) })}\n`);
}

async function runDeterministicSupervision() {
  const repositoryRoot = resolve(requiredArgument("--repository-root"));
  const artifactRoot = resolve(requiredArgument("--artifact-root"));
  const key = resolve(requiredArgument("--ssh-key"));
  const host = requiredArgument("--host");
  await writeExpectedRuntimeHashes(repositoryRoot, artifactRoot);
  const beforeResult = await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} verify-runtime --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`));
  const before = JSON.parse(beforeResult.stdout.trim());
  const restartResult = await run("ssh", sshArgs(key, host,
    `set -eu; systemctl kill --signal=KILL --kill-whom=main ${BROWSER_SERVICE}; for i in $(seq 1 120); do if systemctl is-active --quiet ${BROWSER_SERVICE} && curl -fsS http://127.0.0.1:9224/json/version >/dev/null; then exit 0; fi; sleep 0.25; done; exit 1`));
  void restartResult;
  const afterResult = await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} verify-runtime --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`));
  const after = JSON.parse(afterResult.stdout.trim());
  if (before.browserMainPid === after.browserMainPid) throw new Error("ROUND_5_PRE_SEND_SYSTEMD_RESTART_NOT_OBSERVED");
  const checksResult = await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} deterministic-supervision --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`));
  const checks = JSON.parse(checksResult.stdout.trim());
  const serviceResult = await run("ssh", sshArgs(key, host,
    `systemctl show ${BROWSER_SERVICE} --property=User --property=Requires --property=After --property=ActiveState --no-pager`));
  const serviceProperties = Object.fromEntries(serviceResult.stdout.trim().split("\n").map((line) => {
    const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
  }));
  const xrdpIndependent = serviceProperties.User === "cloudbrowser"
    && serviceProperties.ActiveState === "active"
    && !/xrdp|session-/iu.test(`${serviceProperties.Requires ?? ""} ${serviceProperties.After ?? ""}`);
  if (checks.status !== "DETERMINISTIC_SUPERVISION_PASS" || !xrdpIndependent) {
    throw new Error("ROUND_5_DETERMINISTIC_SUPERVISION_INVALID");
  }
  const receipt = { schemaVersion: 1, studyId: STUDY_ID, status: "PASS", sent: false,
    systemdRestartBeforeSend: true, browserPidBefore: before.browserMainPid,
    browserPidAfter: after.browserMainPid, cdpDisconnectReconnectBeforeSend: true,
    preSendFailureAction: "RETRY_WITHIN_FROZEN_CEILING",
    simulatedPostSendDisconnectAction: "NO_RESEND_STOP_ROUND",
    xrdpIndependent, observedAt: new Date().toISOString() };
  await writePrivate(join(artifactRoot, "environment/vps-deterministic-supervision.json"),
    Buffer.from(canonicalJson(receipt), "utf8"));
  process.stdout.write(`${JSON.stringify({ status: "ROUND_5_DETERMINISTIC_SUPERVISION_PASS", ...receipt })}\n`);
}

async function runSyntheticNormalPath() {
  const repositoryRoot = resolve(requiredArgument("--repository-root"));
  const artifactRoot = resolve(requiredArgument("--artifact-root"));
  const key = resolve(requiredArgument("--ssh-key"));
  const host = requiredArgument("--host");
  await writeExpectedRuntimeHashes(repositoryRoot, artifactRoot);
  const remoteAcceptance = `${VPS_PRIVATE_ROOT}/acceptance/synthetic-normal-path`;
  await run("ssh", sshArgs(key, host,
    `set -eu; install -d -m 0700 -o cloudbrowser -g cloudbrowser ${remoteAcceptance}; if [ ! -f ${remoteAcceptance}/acceptance.json ]; then runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} synthetic-normal-path --workspace ${VPS_PRIVATE_ROOT} --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}; fi`), RESPONSE_TIMEOUT_FOR_ORCHESTRATOR);
  const localAcceptanceDirectory = join(artifactRoot, "environment/vps-synthetic-normal-path");
  await mkdir(localAcceptanceDirectory, { recursive: true, mode: 0o700 });
  await run("scp", scpArgs(key, [
    `root@${host}:${remoteAcceptance}/acceptance.json`,
    `root@${host}:${remoteAcceptance}/pre-send.json`,
    `root@${host}:${remoteAcceptance}/sent.json`,
    `root@${host}:${remoteAcceptance}/transport-receipt.json`,
    `root@${host}:${remoteAcceptance}/response-ready.json`,
    `root@${host}:${remoteAcceptance}/response.txt`,
  ], `${localAcceptanceDirectory}/`));
  const acceptance = await readJson(join(localAcceptanceDirectory, "acceptance.json"));
  if (acceptance.studyId !== STUDY_ID || acceptance.status !== "PASS"
    || acceptance.exactEquality !== true || acceptance.responseCapturedNormally !== true
    || acceptance.freshTemporaryConversationAfterward !== true || acceptance.browserHealthyThroughSoak !== true
    || (!generationSelectionIsLatest(acceptance) && !generationSelectionIsLegacy(acceptance))
    || acceptance.chatMode !== "TEMPORARY" || acceptance.personalization !== "UNPERSONALIZED") {
    throw new Error("ROUND_5_SYNTHETIC_NORMAL_PATH_ACCEPTANCE_INVALID");
  }
  process.stdout.write(`${JSON.stringify({ status: "ROUND_5_SYNTHETIC_NORMAL_PATH_PASS", acceptanceSha256: sha256(await readFile(join(localAcceptanceDirectory, "acceptance.json"))), browserPid: acceptance.browserPidAfter })}\n`);
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
  const staging = join(artifactRoot, `environment/vps-staging/${record.opaqueInputId}`);
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    await run("ssh", sshArgs(key, host,
      `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} run-one --workspace ${VPS_PRIVATE_ROOT} --manifest ${REMOTE_APP}/vps-packet-manifest.json --run-id ${record.opaqueInputId} --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`),
    RESPONSE_TIMEOUT_FOR_ORCHESTRATOR);
  } catch (error) {
    await run("rsync", ["-a", "--checksum", "--chmod=D700,F600", "-e",
      `ssh -i ${key} -o BatchMode=yes -o StrictHostKeyChecking=yes`,
      `root@${host}:${remoteDirectory}/`, `${staging}/`]).catch(() => undefined);
    try {
      const ambiguity = await readJson(join(staging, "ambiguity-receipt.json"));
      const disposition = {
        schemaVersion: 1,
        studyId: STUDY_ID,
        status: "INDETERMINATE",
        validationEligible: false,
        failureCode: "POST_SEND_UNRESOLVED_AMBIGUITY",
        opaqueInputId: record.opaqueInputId,
        sequence: record.sequence,
        sourceSha256: record.exactInputSha256,
        ambiguityReceiptSha256: sha256(await readFile(join(staging, "ambiguity-receipt.json"))),
        laterRunsAuthorized: false,
        exposedFamiliesBecomeDevelopment: true,
        recordedAt: new Date().toISOString(),
        ambiguity,
      };
      await writePrivate(join(artifactRoot, "disposition/round-5-post-send-ambiguity.json"),
        Buffer.from(canonicalJson(disposition), "utf8"));
    } catch {
      // A pre-Send failure is bounded by the remote runner and is not a post-Send disposition.
    }
    throw error;
  }
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
    "--import", "tsx", join(repositoryRoot, "scripts/mast-fresh-validation-round-5.mts"), "capture-generation",
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
    let captureSha256: string;
    try {
      captureSha256 = await captureOne({ repositoryRoot, mastGitDirectory, artifactRoot, key, host, record });
    } catch (error) {
      if (completed.size > 0) await preserveTerminalDisposition(artifactRoot, {
        failureCode: "INCOMPLETE_DENOMINATOR_TERMINAL_GENERATION_FAILURE",
        stage: "GENERATION",
        completedResponses: completed.size,
        plannedResponses: 120,
        failedOpaqueInputId: record.opaqueInputId,
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    }
    completed.add(record.opaqueInputId);
    process.stdout.write(`${JSON.stringify({ status: "RUN_SEALED", sequence: record.sequence, opaqueInputId: record.opaqueInputId, captureSha256, completed: completed.size, planned: 120 })}\n`);
  }
  process.stdout.write(`${JSON.stringify({ status: "GENERATION_COMPLETE", completed: completed.size, planned: 120 })}\n`);
}

function judgeRuntimeConfig(judge: string) {
  if (!["J1", "J2", "J3"].includes(judge)) throw new Error("ROUND_5_JUDGE_INVALID");
  return {
    modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL" as const,
    reasoningSelectionPolicy: "MAXIMUM_AVAILABLE" as const,
  };
}

async function buildJudgeManifest(artifactRoot: string, judge: string) {
  const config = judgeRuntimeConfig(judge);
  const schedulePath = judge === "J3" ? "evaluation/J3/schedule.json" : "evaluation/blind-schedule.json";
  const schedule = await readJson(join(artifactRoot, schedulePath));
  if (schedule.studyId !== STUDY_ID || !Array.isArray(schedule.entries)
    || (judge !== "J3" && schedule.entries.length !== 120)) {
    throw new Error("ROUND_5_JUDGE_SCHEDULE_INVALID");
  }
  const records = [];
  for (const entry of schedule.entries) {
    const bytes = await readFile(join(artifactRoot, entry.packetFile));
    const sourceSha256 = sha256(bytes);
    if (sourceSha256 !== entry.exactPacketSha256 || !/^[0-9a-f]{64}$/u.test(entry.exactGenerationOutputSha256)) {
      throw new Error(`ROUND_5_JUDGE_PACKET_SOURCE_MISMATCH_${entry.opaqueResponseId}`);
    }
    records.push({ opaqueResponseId: entry.opaqueResponseId,
      fileName: `${entry.opaqueResponseId}.txt`, expectedSha256: entry.exactPacketSha256,
      exactGenerationOutputSha256: entry.exactGenerationOutputSha256,
      sourceUtf8Bytes: bytes.byteLength, sourceRelativePath: entry.packetFile });
  }
  return { schemaVersion: 1, studyId: STUDY_ID, judge, ...config, records };
}

async function transferJudgingPackets() {
  const repositoryRoot = resolve(requiredArgument("--repository-root"));
  const artifactRoot = resolve(requiredArgument("--artifact-root"));
  const key = resolve(requiredArgument("--ssh-key"));
  const host = requiredArgument("--host");
  const judge = requiredArgument("--judge");
  const manifest = await buildJudgeManifest(artifactRoot, judge);
  await writeExpectedRuntimeHashes(repositoryRoot, artifactRoot);
  const localDirectory = join(artifactRoot, `environment/vps-judging/${judge}`);
  const stagingPackets = join(localDirectory, "packets");
  await mkdir(stagingPackets, { recursive: true, mode: 0o700 });
  for (const record of manifest.records) {
    const bytes = await readFile(join(artifactRoot, record.sourceRelativePath));
    await writePrivate(join(stagingPackets, record.fileName), bytes);
  }
  const localManifest = join(localDirectory, "manifest.json");
  await writePrivate(localManifest, Buffer.from(canonicalJson(manifest), "utf8"));
  const remoteWorkspace = `${VPS_PRIVATE_ROOT}/evaluation/${judge}`;
  await run("ssh", sshArgs(key, host,
    `install -d -m 0700 -o cloudbrowser -g cloudbrowser ${remoteWorkspace} ${remoteWorkspace}/packets ${remoteWorkspace}/runs`));
  await run("scp", scpArgs(key, [localManifest], `root@${host}:${remoteWorkspace}/manifest.json`));
  await run("rsync", ["-a", "--checksum", "--chmod=D700,F600", "-e",
    `ssh -i ${key} -o BatchMode=yes -o StrictHostKeyChecking=yes`,
    `${stagingPackets}/`, `root@${host}:${remoteWorkspace}/packets/`]);
  await run("ssh", sshArgs(key, host,
    `chown -R cloudbrowser:cloudbrowser ${remoteWorkspace}; chmod 0700 ${remoteWorkspace} ${remoteWorkspace}/packets ${remoteWorkspace}/runs; find ${remoteWorkspace}/packets -type f -exec chmod 0600 {} +; chmod 0600 ${remoteWorkspace}/manifest.json; runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} verify-judge-transfer --workspace ${remoteWorkspace} --manifest ${remoteWorkspace}/manifest.json`));
  const localReceipt = join(localDirectory, "packet-transfer-receipt.json");
  await run("scp", scpArgs(key, [`root@${host}:${remoteWorkspace}/packet-transfer-receipt.json`], localReceipt));
  const receipt = await readJson(localReceipt);
  if (receipt.studyId !== STUDY_ID || receipt.judge !== judge || receipt.records.length !== manifest.records.length
    || receipt.records.some((record: any) => record.eligible !== true
      || record.expectedSha256 !== record.destinationSha256)) {
    throw new Error("ROUND_5_JUDGE_PACKET_TRANSFER_RECEIPT_INVALID");
  }
  process.stdout.write(`${JSON.stringify({ status: "ROUND_5_JUDGE_PACKET_TRANSFER_COMPLETE", judge, packetCount: manifest.records.length, receiptSha256: sha256(await readFile(localReceipt)) })}\n`);
}

async function completedJudgeIds(artifactRoot: string, judge: string) {
  const directory = join(artifactRoot, `evaluation/${judge}/captures`);
  try { return new Set((await readdir(directory)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5))); }
  catch (error) {
    if (error && typeof error === "object" && (error as NodeJS.ErrnoException).code === "ENOENT") return new Set<string>();
    throw error;
  }
}

async function captureJudgeOne(input: { repositoryRoot: string; mastGitDirectory: string;
  artifactRoot: string; key: string; host: string; judge: string; record: any }) {
  const { repositoryRoot, mastGitDirectory, artifactRoot, key, host, judge, record } = input;
  const remoteWorkspace = `${VPS_PRIVATE_ROOT}/evaluation/${judge}`;
  const remoteDirectory = `${remoteWorkspace}/runs/${record.opaqueResponseId}`;
  const staging = join(artifactRoot, `environment/vps-judging/${judge}/runs/${record.opaqueResponseId}`);
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    await run("ssh", sshArgs(key, host,
      `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} run-judge-one --workspace ${remoteWorkspace} --manifest ${remoteWorkspace}/manifest.json --opaque-response-id ${record.opaqueResponseId} --expected-runtime-hashes ${REMOTE_RUNTIME_HASHES}`),
    RESPONSE_TIMEOUT_FOR_ORCHESTRATOR);
  } catch (error) {
    await run("rsync", ["-a", "--checksum", "--chmod=D700,F600", "-e",
      `ssh -i ${key} -o BatchMode=yes -o StrictHostKeyChecking=yes`,
      `root@${host}:${remoteDirectory}/`, `${staging}/`]).catch(() => undefined);
    try {
      const ambiguityPath = join(staging, "ambiguity-receipt.json");
      const ambiguity = await readJson(ambiguityPath);
      const disposition = {
        schemaVersion: 1,
        studyId: STUDY_ID,
        status: "INDETERMINATE",
        validationEligible: false,
        failureCode: "POST_SEND_UNRESOLVED_AMBIGUITY",
        stage: `JUDGMENT_${judge.toUpperCase()}`,
        judge,
        opaqueResponseId: record.opaqueResponseId,
        sourceSha256: record.expectedSha256,
        ambiguityReceiptSha256: sha256(await readFile(ambiguityPath)),
        laterRunsAuthorized: false,
        exposedFamiliesBecomeDevelopment: true,
        recordedAt: new Date().toISOString(),
        ambiguity,
      };
      await writePrivate(join(artifactRoot, "disposition/round-5-post-send-ambiguity.json"),
        Buffer.from(canonicalJson(disposition), "utf8"));
    } catch {
      // A pre-Send failure is bounded by the remote runner and is not a post-Send disposition.
    }
    throw error;
  }
  await run("scp", scpArgs(key, [
    `root@${host}:${remoteDirectory}/response.txt`,
    `root@${host}:${remoteDirectory}/provider.json`,
    `root@${host}:${remoteDirectory}/provenance.json`,
    `root@${host}:${remoteDirectory}/transport-receipt.json`,
  ], `${staging}/`));
  const transport = await readJson(join(staging, "transport-receipt.json"));
  const config = judgeRuntimeConfig(judge);
  if (transport.state !== "RESPONSE_COMPLETE" || transport.sourceSha256 !== record.expectedSha256
    || !generationSelectionIsLatest(transport.ui)
    || transport.toolProvenance.length !== 0) {
    throw new Error("ROUND_5_JUDGMENT_TRANSPORT_RECEIPT_INVALID");
  }
  await run(process.execPath, ["--import", "tsx", join(repositoryRoot, "scripts/mast-fresh-validation-round-5.mts"),
    "capture-judgment", "--mast-git-dir", mastGitDirectory, "--artifact-root", artifactRoot,
    "--judge", judge, "--opaque-response-id", record.opaqueResponseId,
    "--raw-output", join(staging, "response.txt"), "--provider-receipt", join(staging, "provider.json")]);
  const capturePath = join(artifactRoot, `evaluation/${judge}/captures/${record.opaqueResponseId}.json`);
  const captureSha256 = sha256(await readFile(capturePath));
  await run("ssh", sshArgs(key, host,
    `runuser -u cloudbrowser -- /home/cloudbrowser/.local/bin/node ${REMOTE_SCRIPT} mark-judge-sealed --workspace ${remoteWorkspace} --judge ${judge} --opaque-response-id ${record.opaqueResponseId} --capture-sha256 ${captureSha256}`));
  return captureSha256;
}

async function runJudging() {
  const repositoryRoot = resolve(requiredArgument("--repository-root"));
  const mastGitDirectory = resolve(requiredArgument("--mast-git-dir"));
  const artifactRoot = resolve(requiredArgument("--artifact-root"));
  const key = resolve(requiredArgument("--ssh-key"));
  const host = requiredArgument("--host");
  const judge = requiredArgument("--judge");
  const manifest = await buildJudgeManifest(artifactRoot, judge);
  const completed = await completedJudgeIds(artifactRoot, judge);
  for (const record of manifest.records) {
    if (completed.has(record.opaqueResponseId)) continue;
    let captureSha256: string;
    try {
      captureSha256 = await captureJudgeOne({ repositoryRoot, mastGitDirectory,
        artifactRoot, key, host, judge, record });
    } catch (error) {
      await preserveTerminalDisposition(artifactRoot, {
        failureCode: "INCOMPLETE_JUDGMENT_DENOMINATOR_TERMINAL_FAILURE",
        stage: `JUDGMENT_${judge}`,
        judge,
        completedJudgments: completed.size,
        plannedJudgments: manifest.records.length,
        failedOpaqueResponseId: record.opaqueResponseId,
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    }
    completed.add(record.opaqueResponseId);
    process.stdout.write(`${JSON.stringify({ status: "JUDGMENT_SEALED", judge,
      opaqueResponseId: record.opaqueResponseId, captureSha256,
      completed: completed.size, planned: manifest.records.length })}\n`);
  }
  process.stdout.write(`${JSON.stringify({ status: "JUDGING_COMPLETE", judge,
    completed: completed.size, planned: manifest.records.length })}\n`);
}

const command = process.argv[2];
if (command === "install-runtime") await installRuntime();
else if (command === "deterministic-supervision") await runDeterministicSupervision();
else if (command === "synthetic-normal-path") await runSyntheticNormalPath();
else if (command === "transfer") await transferPackets();
else if (command === "run") await runGeneration();
else if (command === "transfer-judging") await transferJudgingPackets();
else if (command === "run-judging") await runJudging();
else throw new Error(`Unknown command: ${command ?? "(missing)"}`);
