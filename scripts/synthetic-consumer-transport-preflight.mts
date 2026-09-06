import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const SYNTHETIC_PROMPT_TEMPLATE = "Read only the file named {FILE_NAME}. Return the exact value of its payload_marker field as one lowercase hexadecimal string, or return NOT_AVAILABLE if that file or field is not accessible. Do not use a different file, quote other sources, browse the web, or add explanation.";
export const SYNTHETIC_PROBES = [
  { probeId: "P01", chatMode: "ORDINARY", attachment: "seed", requestedFile: "seed" },
  { probeId: "P02", chatMode: "ORDINARY", attachment: null, requestedFile: "seed" },
  { probeId: "P03", chatMode: "TEMPORARY_NON_PERSONALIZED", attachment: null, requestedFile: "seed" },
  { probeId: "P04", chatMode: "TEMPORARY_NON_PERSONALIZED", attachment: "local", requestedFile: "local" },
  { probeId: "P05", chatMode: "TEMPORARY_NON_PERSONALIZED", attachment: "local", requestedFile: "seed" },
  { probeId: "P06", chatMode: "TEMPORARY_NON_PERSONALIZED", attachment: null, requestedFile: "absent" },
] as const;
export type ProbeId = typeof SYNTHETIC_PROBES[number]["probeId"];
export const SYNTHETIC_RECOVERY_NAMESPACE = "recovery-01";
export const SYNTHETIC_RECOVERY_AUTHORITY = {
  messageId: "b2932286-cd17-4716-b53c-167049da8fbb",
  exactBodySha256: "bc7f71b691a0adca5a22dee4b35b06768283576b7b7c0360f3abb2e36e840fc4",
} as const;
type RecoveryAuthority = { messageId: string; exactBodySha256: string };
type RecoveryRequest = {
  manifestPath: string; manifestSha256: string; recoveryDirectivePath: string;
  recoverySourcePath: string; priorTransportEventPath: string; priorOperationalReturnPath: string;
};
type FixtureKind = "seed" | "local" | "absent";
type Markers = { seed: string; local: string };
type FileReceipt = { filename: string; sha256: string; bytes: number };
type FrozenManifest = {
  schemaVersion: 1;
  directiveId: "askrigor-nonclinical-consumer-transport-preflight-v1";
  runId: string;
  markers: Markers;
  files: { seed: FileReceipt; local: FileReceipt; absent: { filename: string; mustRemainAbsent: true } };
  probes: Array<{
    probeId: ProbeId; chatMode: string; attachment: string | null; requestedFile: string;
    expectedMarkerBinding: FixtureKind; prompt: FileReceipt; initialState: "UNEXECUTED";
  }>;
};

const HEX32 = /^[0-9a-f]{32}$/;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytesOf = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

export class SyntheticPreflightError extends Error {
  constructor(public readonly code: string) { super(code); }
}
function requireState(value: unknown, code: string): asserts value {
  if (!value) throw new SyntheticPreflightError(code);
}
async function privateDirectory(path: string) {
  const stat = await lstat(path);
  requireState(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o700, "PRIVATE_DIRECTORY_REQUIRED");
}
async function newPrivateDirectory(path: string) {
  await mkdir(path, { mode: 0o700 });
  await chmod(path, 0o700);
}
async function privateRead(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    requireState(stat.isFile() && (stat.mode & 0o777) === 0o600, "PRIVATE_REGULAR_FILE_REQUIRED");
    return await file.readFile();
  } finally { await file.close(); }
}
async function exclusiveWrite(path: string, bytes: Uint8Array) {
  const file = await open(path, "wx", 0o600);
  try { await file.chmod(0o600); await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
}
async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
const fixtureName = (runId: string, kind: FixtureKind) => `transport-fixture-${runId}-${kind}.txt`;
const receipt = (filename: string, bytes: Buffer): FileReceipt => ({ filename, sha256: sha256(bytes), bytes: bytes.length });
function makeManifest(runId: string, markers: Markers): FrozenManifest {
  return {
    schemaVersion: 1,
    directiveId: "askrigor-nonclinical-consumer-transport-preflight-v1",
    runId, markers,
    files: {
      seed: receipt(fixtureName(runId, "seed"), Buffer.from(`payload_marker=${markers.seed}\n`)),
      local: receipt(fixtureName(runId, "local"), Buffer.from(`payload_marker=${markers.local}\n`)),
      absent: { filename: fixtureName(runId, "absent"), mustRemainAbsent: true },
    },
    probes: SYNTHETIC_PROBES.map((probe) => {
      const requestedFile = fixtureName(runId, probe.requestedFile);
      const prompt = Buffer.from(SYNTHETIC_PROMPT_TEMPLATE.replace("{FILE_NAME}", requestedFile));
      requireState(!prompt.includes(markers.seed) && !prompt.includes(markers.local), "MARKER_IN_PROMPT");
      return {
        probeId: probe.probeId, chatMode: probe.chatMode,
        attachment: probe.attachment === null ? null : fixtureName(runId, probe.attachment),
        requestedFile, expectedMarkerBinding: probe.requestedFile,
        prompt: receipt(`prompts/${probe.probeId}.txt`, prompt), initialState: "UNEXECUTED",
      };
    }),
  };
}

/** Writes only a new private run. Returned data excludes markers and prompt bytes. */
export async function prepareSyntheticTransportPreflight(artifactRoot: string) {
  const root = resolve(artifactRoot);
  await privateDirectory(root);
  const runId = randomBytes(16).toString("hex");
  let seed: string;
  do { seed = randomBytes(16).toString("hex"); } while (seed === runId);
  let local: string;
  do { local = randomBytes(16).toString("hex"); } while (local === seed || local === runId);
  const manifest = makeManifest(runId, { seed, local });
  const directory = join(root, `synthetic-consumer-transport-${runId}`);
  await newPrivateDirectory(directory);
  await newPrivateDirectory(join(directory, "prompts"));
  await newPrivateDirectory(join(directory, "captures"));
  for (const kind of ["seed", "local"] as const) {
    await exclusiveWrite(join(directory, manifest.files[kind].filename), Buffer.from(`payload_marker=${manifest.markers[kind]}\n`));
  }
  for (const probe of manifest.probes) {
    await exclusiveWrite(join(directory, probe.prompt.filename), Buffer.from(SYNTHETIC_PROMPT_TEMPLATE.replace("{FILE_NAME}", probe.requestedFile)));
  }
  const manifestPath = join(directory, "manifest.json");
  const manifestBytes = bytesOf(manifest);
  await exclusiveWrite(manifestPath, manifestBytes);
  return { manifestPath, manifestSha256: sha256(manifestBytes), fixtureCount: 2, promptCount: 6, unexecutedCount: 6 };
}

async function loadFrozen(manifestPath: string, expectedSha256: string) {
  requireState(/^[0-9a-f]{64}$/.test(expectedSha256), "MANIFEST_SHA256_REQUIRED");
  const directory = dirname(resolve(manifestPath));
  requireState(resolve(manifestPath) === join(directory, "manifest.json"), "MANIFEST_FILENAME_INVALID");
  await privateDirectory(directory);
  await privateDirectory(join(directory, "prompts"));
  await privateDirectory(join(directory, "captures"));
  const manifestBytes = await privateRead(manifestPath);
  requireState(sha256(manifestBytes) === expectedSha256, "FROZEN_MANIFEST_CHANGED");
  let manifest: FrozenManifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); }
  catch { throw new SyntheticPreflightError("MANIFEST_JSON_INVALID"); }
  requireState(HEX32.test(manifest.runId) && HEX32.test(manifest.markers?.seed) && HEX32.test(manifest.markers?.local), "MANIFEST_MARKERS_INVALID");
  requireState(manifest.markers.seed !== manifest.markers.local, "MANIFEST_MARKERS_NOT_DISTINCT");
  const canonical = makeManifest(manifest.runId, manifest.markers);
  requireState(manifestBytes.equals(bytesOf(canonical)), "FROZEN_MANIFEST_NOT_CANONICAL");
  requireState(!await exists(join(directory, manifest.files.absent.filename)), "ABSENT_FIXTURE_CREATED");
  for (const frozen of [manifest.files.seed, manifest.files.local, ...manifest.probes.map((probe) => probe.prompt)]) {
    const bytes = await privateRead(join(directory, frozen.filename));
    requireState(bytes.length === frozen.bytes && sha256(bytes) === frozen.sha256, "FROZEN_FILE_CHANGED");
  }
  return { directory, manifest };
}

/** Comparison only: never returns the comparison string or modifies the raw bytes. */
export function parseSyntheticTransportOutput(raw: Buffer, markers: Markers) {
  requireState(HEX32.test(markers.seed) && HEX32.test(markers.local) && markers.seed !== markers.local, "PARSER_MARKERS_INVALID");
  const comparison = raw.toString("utf8").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  return {
    exactOutputSha256: sha256(raw), exactOutputBytes: raw.length,
    seedMarkerExactMatch: comparison === markers.seed,
    localMarkerExactMatch: comparison === markers.local,
    notAvailableExactMatch: comparison === "NOT_AVAILABLE",
    formatValid: comparison === "NOT_AVAILABLE" || HEX32.test(comparison),
  };
}

const STRING_FIELDS = ["observedChatMode", "observedPersonalizationState", "observedSelectorLabel", "observedReasoningLabel", "conversationOrSessionIdentifier", "userMessageId", "assistantMessageId"] as const;
const LIST_FIELDS = ["attachedSyntheticFileIdentifiersWhenExposed", "literalCitationTargetIdentifiersWhenExposed", "transportErrors"] as const;
const UI_KEYS = new Set<string>([...STRING_FIELDS, ...LIST_FIELDS, "identifierAvailability", "automaticToolUseObserved", "capturedAt"]);
function normalizeUiMetadata(value: unknown) {
  requireState(value !== null && typeof value === "object" && !Array.isArray(value), "UI_METADATA_INVALID");
  const input = value as Record<string, unknown>;
  requireState(Object.keys(input).every((key) => UI_KEYS.has(key)), "UI_METADATA_UNKNOWN_FIELD");
  const output: Record<string, unknown> = {};
  for (const key of STRING_FIELDS) {
    requireState(input[key] === undefined || input[key] === null || typeof input[key] === "string", "UI_METADATA_INVALID");
    output[key] = input[key] ?? null;
  }
  for (const key of LIST_FIELDS) {
    requireState(input[key] === undefined || (Array.isArray(input[key]) && input[key].every((entry) => typeof entry === "string")), "UI_METADATA_INVALID");
    output[key] = input[key] ?? [];
  }
  const availability = input.identifierAvailability ?? {};
  requireState(availability !== null && typeof availability === "object" && !Array.isArray(availability) && Object.values(availability).every((entry) => typeof entry === "string"), "UI_METADATA_INVALID");
  output.identifierAvailability = { ...Object.fromEntries(["conversationOrSessionIdentifier", "userMessageId", "assistantMessageId"].filter((key) => output[key] === null).map((key) => [key, "UNAVAILABLE_NOT_PROVIDED"])), ...availability };
  requireState(input.automaticToolUseObserved === undefined || input.automaticToolUseObserved === null || typeof input.automaticToolUseObserved === "boolean", "UI_METADATA_INVALID");
  output.automaticToolUseObserved = input.automaticToolUseObserved ?? null;
  requireState(input.capturedAt === undefined || (typeof input.capturedAt === "string" && Number.isFinite(Date.parse(input.capturedAt))), "UI_METADATA_INVALID");
  output.capturedAt = input.capturedAt ?? new Date().toISOString();
  return output;
}

async function captureStates(directory: string) {
  const states: Array<{ probeId: ProbeId; state: "UNEXECUTED" | "CAPTURED" | "TRANSPORT_FAILED" | "CAPTURE_INCOMPLETE" }> = [];
  for (const { probeId } of SYNTHETIC_PROBES) {
    const path = join(directory, "captures", probeId);
    if (!await exists(path)) { states.push({ probeId, state: "UNEXECUTED" }); continue; }
    await privateDirectory(path);
    if (!await exists(join(path, "metadata.json"))) { states.push({ probeId, state: "CAPTURE_INCOMPLETE" }); continue; }
    const metadata = JSON.parse((await privateRead(join(path, "metadata.json"))).toString("utf8"));
    if (metadata.exactOutputSha256 !== null) {
      const raw = await privateRead(join(path, "response.raw.txt"));
      requireState(sha256(raw) === metadata.exactOutputSha256 && raw.length === metadata.exactOutputBytes, "CAPTURED_RAW_CHANGED");
    }
    if (metadata.transportErrors.length > 0) { states.push({ probeId, state: "TRANSPORT_FAILED" }); continue; }
    requireState(metadata.exactOutputSha256 !== null, "CAPTURED_RAW_MISSING");
    states.push({ probeId, state: "CAPTURED" });
  }
  return states;
}

// Read only the leading source JSON object; reference links after it are not JSON.
function leadingJsonObject(bytes: Buffer): Record<string, any> {
  const text = bytes.toString("utf8");
  const start = text.search(/\S/);
  requireState(text[start] === "{", "RECOVERY_SOURCE_JSON_INVALID");
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, index + 1)); }
      catch { break; }
    }
  }
  throw new SyntheticPreflightError("RECOVERY_SOURCE_JSON_INVALID");
}

async function recoveryBinding(request: RecoveryRequest, directory: string, manifest: FrozenManifest, authority: RecoveryAuthority) {
  const sourceBytes = await privateRead(request.recoverySourcePath);
  requireState(sha256(sourceBytes) === authority.exactBodySha256, "RECOVERY_SOURCE_SHA256_MISMATCH");
  const source = leadingJsonObject(sourceBytes);
  const directiveBytes = await privateRead(request.recoveryDirectivePath);
  let directive: Record<string, any>;
  try { directive = JSON.parse(directiveBytes.toString("utf8")); }
  catch { throw new SyntheticPreflightError("RECOVERY_DIRECTIVE_JSON_INVALID"); }
  const operationalKeys = ["directiveId", "directiveType", "status", "limitedSupersession", "runtimeAdmissionRequired", "immutableBindings", "attemptCeiling", "maximumExternalSpendUsd", "paidApiInferenceAuthorized"];
  requireState(operationalKeys.every((key) => isDeepStrictEqual(source[key], directive[key])), "RECOVERY_DIRECTIVE_SOURCE_MISMATCH");
  requireState(directive.directiveId === "askrigor-synthetic-preflight-presubmission-chooser-recovery-v1"
    && directive.directiveType === "SOURCE_BOUND_PRE_SUBMISSION_ATTACHMENT_COORDINATION_RECOVERY"
    && directive.status === "ONE_ADDITIONAL_P01_SETUP_ATTEMPT_AUTHORIZED_SUBJECT_TO_FRESH_ADMISSION_AND_READINESS"
    && directive.runtimeAdmissionRequired === true
    && directive.maximumExternalSpendUsd === 0 && directive.paidApiInferenceAuthorized === false
    && directive.limitedSupersession?.fixturePromptAndProbePlan === "UNCHANGED"
    && directive.limitedSupersession?.automaticFurtherRecoveryAuthorization === false, "RECOVERY_DIRECTIVE_INVALID");
  const ceiling = directive.attemptCeiling;
  requireState(ceiling?.additionalP01SetupAttempts === 1 && ceiling.maximumP01SetupAttemptsIncludingPreservedFailure === 2
    && ceiling.maximumSubmittedModelRequestsAcrossParentAndRecovery === 6 && ceiling.maximumSubmittedModelRequestsPerProbe === 1
    && ceiling.modelRetriesRegenerationsOrFollowups === 0 && ceiling.laterProbeBeforeP01Completion === false, "RECOVERY_CEILING_INVALID");
  const binding = directive.immutableBindings;
  requireState(binding?.fixtureManifestSha256 === request.manifestSha256
    && binding.P01ExactInputSha256 === manifest.probes[0].prompt.sha256
    && binding.preserveAllPriorReceiptsWithoutOverwrite === true
    && ["regenerateRunIdOrMarkers", "changeFixtureNamesOrBytes", "changePromptBytes", "changeProbeOrderOrModes", "createOrUploadAbsentFixture"].every((key) => binding[key] === false), "RECOVERY_IMMUTABLE_BINDING_INVALID");
  const originalCaptureRoot = join(directory, "captures");
  requireState(isDeepStrictEqual(await readdir(originalCaptureRoot), ["P01"]), "RECOVERY_PRIOR_CAPTURE_STATE_INVALID");
  await privateDirectory(join(originalCaptureRoot, "P01"));
  requireState(isDeepStrictEqual(await readdir(join(originalCaptureRoot, "P01")), ["metadata.json"]), "RECOVERY_PRIOR_OUTPUT_OR_EXTRA_CAPTURE");
  const metadataBytes = await privateRead(join(originalCaptureRoot, "P01/metadata.json"));
  requireState(sha256(metadataBytes) === binding.priorProbeMetadataSha256, "RECOVERY_PRIOR_METADATA_CHANGED");
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  requireState(metadata.probeId === "P01" && metadata.exactInputSha256 === binding.P01ExactInputSha256
    && ["exactOutputSha256", "exactOutputBytes", "seedMarkerExactMatch", "localMarkerExactMatch", "notAvailableExactMatch", "formatValid", "userMessageId", "assistantMessageId"].every((key) => metadata[key] === null)
    && Array.isArray(metadata.transportErrors) && metadata.transportErrors.length > 0
    && isDeepStrictEqual(metadata.attachedSyntheticFileIdentifiersWhenExposed, []), "RECOVERY_PRIOR_FAILURE_NOT_PRESUBMISSION");
  const eventBytes = await privateRead(request.priorTransportEventPath);
  requireState(sha256(eventBytes) === binding.priorTransportEventSha256, "RECOVERY_PRIOR_TRANSPORT_EVENT_CHANGED");
  const event = JSON.parse(eventBytes.toString("utf8"));
  const requiredEvent = { probeId: "P01", setFilesCalls: 0, syntheticFileSelections: 0, modelRequestSubmissionCalls: 0,
    messageCountBeforeAndAfter: 0, laterProbesAttempted: 0, fileChooserWaitCalls: 1, fileChooserAssigned: false };
  requireState(Object.entries(requiredEvent).every(([key, value]) => event[key] === value), "RECOVERY_PRIOR_ASSIGNMENT_OR_SUBMISSION");
  const returnBytes = await privateRead(request.priorOperationalReturnPath);
  requireState(sha256(returnBytes) === binding.priorOperationalReturnSha256, "RECOVERY_PRIOR_OPERATIONAL_RETURN_CHANGED");
  return {
    directiveId: directive.directiveId,
    sourceReceipt: { messageId: authority.messageId, exactBodySha256: authority.exactBodySha256, exactBodyBytes: sourceBytes.length },
    parsedDirectiveSha256: sha256(directiveBytes),
    immutableBindings: binding,
  };
}

/** One source-bound namespace for the preserved P01 setup failure; no reset path. */
export async function initializeSyntheticTransportRecovery(request: RecoveryRequest, authority: RecoveryAuthority = SYNTHETIC_RECOVERY_AUTHORITY) {
  const { directory, manifest } = await loadFrozen(request.manifestPath, request.manifestSha256);
  const recoveryDirectory = join(directory, SYNTHETIC_RECOVERY_NAMESPACE);
  requireState(!await exists(recoveryDirectory), "RECOVERY_ALREADY_INITIALIZED");
  const absoluteRequest = { ...request, manifestPath: resolve(request.manifestPath), recoveryDirectivePath: resolve(request.recoveryDirectivePath),
    recoverySourcePath: resolve(request.recoverySourcePath), priorTransportEventPath: resolve(request.priorTransportEventPath), priorOperationalReturnPath: resolve(request.priorOperationalReturnPath) };
  const binding = await recoveryBinding(absoluteRequest, directory, manifest, authority);
  const initialization = { schemaVersion: 1, namespace: SYNTHETIC_RECOVERY_NAMESPACE, recoveryNumber: 1,
    reservedP01SetupAttemptNumber: 2, initializedAt: new Date().toISOString(), request: absoluteRequest, ...binding };
  await newPrivateDirectory(recoveryDirectory);
  await newPrivateDirectory(join(recoveryDirectory, "captures"));
  const initializationPath = join(recoveryDirectory, "initialization.json");
  const initializationBytes = bytesOf(initialization);
  await exclusiveWrite(initializationPath, initializationBytes);
  return { namespace: SYNTHETIC_RECOVERY_NAMESPACE, recoveryNumber: 1, reservedP01SetupAttemptNumber: 2,
    initializationPath, initializationSha256: sha256(initializationBytes), manifestSha256: request.manifestSha256,
    fixtureCount: 2, promptCount: 6, capturedCount: 0, unexecutedCount: 6 };
}

async function captureNamespace(directory: string, manifest: FrozenManifest, manifestSha256: string,
  namespace = "original", authority: RecoveryAuthority = SYNTHETIC_RECOVERY_AUTHORITY) {
  if (namespace === "original") return directory;
  requireState(namespace === SYNTHETIC_RECOVERY_NAMESPACE, "CAPTURE_NAMESPACE_INVALID");
  const recoveryDirectory = join(directory, SYNTHETIC_RECOVERY_NAMESPACE);
  await privateDirectory(recoveryDirectory);
  await privateDirectory(join(recoveryDirectory, "captures"));
  const initializationBytes = await privateRead(join(recoveryDirectory, "initialization.json"));
  const initialization = JSON.parse(initializationBytes.toString("utf8"));
  requireState(initialization.request?.manifestPath === join(directory, "manifest.json")
    && initialization.request.manifestSha256 === manifestSha256, "RECOVERY_MANIFEST_MISMATCH");
  const binding = await recoveryBinding(initialization.request, directory, manifest, authority);
  requireState(initializationBytes.equals(bytesOf({ schemaVersion: 1, namespace: SYNTHETIC_RECOVERY_NAMESPACE,
    recoveryNumber: 1, reservedP01SetupAttemptNumber: 2, initializedAt: initialization.initializedAt,
    request: initialization.request, ...binding })), "RECOVERY_INITIALIZATION_CHANGED");
  return recoveryDirectory;
}

export async function verifySyntheticTransportPreflight(manifestPath: string, manifestSha256: string,
  namespace = "original", recoveryAuthority: RecoveryAuthority = SYNTHETIC_RECOVERY_AUTHORITY) {
  const { directory, manifest } = await loadFrozen(manifestPath, manifestSha256);
  const captureRoot = await captureNamespace(directory, manifest, manifestSha256, namespace, recoveryAuthority);
  const probes = await captureStates(captureRoot);
  return { manifestPath: resolve(manifestPath), manifestSha256, namespace, fixtureCount: 2, promptCount: 6, probes,
    capturedCount: probes.filter((probe) => probe.state === "CAPTURED").length,
    unexecutedCount: probes.filter((probe) => probe.state === "UNEXECUTED").length };
}

/** Caller supplies the first completed response. A failed/incomplete capture stops continuation. */
export async function captureSyntheticTransportProbe(options: {
  manifestPath: string; manifestSha256: string; probeId: string;
  rawResponse: Buffer | null; uiMetadata: unknown; namespace?: string; recoveryAuthority?: RecoveryAuthority;
}) {
  const { directory, manifest } = await loadFrozen(options.manifestPath, options.manifestSha256);
  const captureRoot = await captureNamespace(directory, manifest, options.manifestSha256, options.namespace, options.recoveryAuthority);
  const uiMetadata = normalizeUiMetadata(options.uiMetadata);
  const failed = (uiMetadata.transportErrors as string[]).length > 0;
  requireState(options.rawResponse !== null || failed, "RAW_RESPONSE_OR_TRANSPORT_ERROR_REQUIRED");
  const states = await captureStates(captureRoot);
  requireState(!states.some((probe) => probe.state === "TRANSPORT_FAILED" || probe.state === "CAPTURE_INCOMPLETE"), "TRANSPORT_STOP_REQUIRED");
  const next = states.findIndex((probe) => probe.state === "UNEXECUTED");
  requireState(next >= 0 && states[next].probeId === options.probeId, "PROBE_DUPLICATE_OR_OUT_OF_ORDER");
  requireState(states.slice(next).every((probe) => probe.state === "UNEXECUTED"), "PROBE_STATE_ORDER_INVALID");
  const probe = manifest.probes[next];
  const captureDirectory = join(captureRoot, "captures", probe.probeId);
  // The exclusive directory is the reservation; interrupted writes are never retried.
  await newPrivateDirectory(captureDirectory);
  let parsed: ReturnType<typeof parseSyntheticTransportOutput> | null = null;
  if (options.rawResponse !== null) {
    await exclusiveWrite(join(captureDirectory, "response.raw.txt"), options.rawResponse);
    parsed = parseSyntheticTransportOutput(await privateRead(join(captureDirectory, "response.raw.txt")), manifest.markers);
  }
  const metadata = {
    probeId: probe.probeId, ...uiMetadata, exactInputSha256: probe.prompt.sha256,
    exactOutputSha256: parsed?.exactOutputSha256 ?? null, exactOutputBytes: parsed?.exactOutputBytes ?? null,
    seedMarkerExactMatch: parsed?.seedMarkerExactMatch ?? null, localMarkerExactMatch: parsed?.localMarkerExactMatch ?? null,
    notAvailableExactMatch: parsed?.notAvailableExactMatch ?? null, formatValid: parsed?.formatValid ?? null,
  };
  const metadataBytes = bytesOf(metadata);
  await exclusiveWrite(join(captureDirectory, "metadata.json"), metadataBytes);
  return {
    probeId: probe.probeId, namespace: options.namespace ?? "original", state: failed ? "TRANSPORT_FAILED" : "CAPTURED",
    metadataPath: join(captureDirectory, "metadata.json"), metadataSha256: sha256(metadataBytes),
    exactInputSha256: probe.prompt.sha256, exactOutputSha256: parsed?.exactOutputSha256 ?? null,
    exactOutputBytes: parsed?.exactOutputBytes ?? null, formatValid: parsed?.formatValid ?? null,
    capturedCount: next + (failed ? 0 : 1), unexecutedCount: 5 - next,
  };
}

export async function captureSyntheticTransportProbeFromFiles(options: {
  manifestPath: string; manifestSha256: string; probeId: string; rawPath?: string; metadataPath: string;
  namespace?: string; recoveryAuthority?: RecoveryAuthority;
}) {
  const uiBytes = await privateRead(options.metadataPath);
  let uiMetadata: unknown;
  try { uiMetadata = JSON.parse(uiBytes.toString("utf8")); }
  catch { throw new SyntheticPreflightError("UI_METADATA_JSON_INVALID"); }
  return captureSyntheticTransportProbe({ ...options, uiMetadata,
    rawResponse: options.rawPath === undefined ? null : await privateRead(options.rawPath) });
}
