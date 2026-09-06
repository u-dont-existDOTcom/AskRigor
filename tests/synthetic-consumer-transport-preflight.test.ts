import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureSyntheticTransportProbe, captureSyntheticTransportProbeFromFiles,
  parseSyntheticTransportOutput, prepareSyntheticTransportPreflight,
  SYNTHETIC_PROBES, SYNTHETIC_PROMPT_TEMPLATE, verifySyntheticTransportPreflight,
} from "../scripts/synthetic-consumer-transport-preflight.mts";

const roots: string[] = [];
const markers = { seed: "0123456789abcdef0123456789abcdef", local: "fedcba9876543210fedcba9876543210" };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const cli = resolve("scripts/run-synthetic-consumer-transport-preflight.mts");
async function testRoot() {
  const root = await mkdtemp(join(tmpdir(), "askrigor-synthetic-transport-test-"));
  roots.push(root);
  await chmod(root, 0o700);
  return root;
}
async function prepared() {
  const root = await testRoot();
  const summary = await prepareSyntheticTransportPreflight(root);
  const directory = dirname(summary.manifestPath);
  const manifest = JSON.parse(await readFile(summary.manifestPath, "utf8"));
  return { root, directory, manifest, ...summary };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("synthetic transport comparison parser", () => {
  it.each([
    [markers.seed, true, false, false, true],
    [markers.local, false, true, false, true],
    ["NOT_AVAILABLE", false, false, true, true],
    ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", false, false, false, true],
    ["Unexpected synthetic prose", false, false, false, false],
    ["", false, false, false, false],
    [" \t\r\n", false, false, false, false],
    [`\`\`\`\n${markers.seed}\n\`\`\``, false, false, false, false],
    [`${markers.seed} [1]`, false, false, false, false],
    [markers.seed.toUpperCase(), false, false, false, false],
    ["NOT_ AVAILABLE", false, false, false, false],
  ])("compares fixed synthetic case %# without returning text", (value, seed, local, notAvailable, formatValid) => {
    const raw = Buffer.from(value as string);
    const unchanged = Buffer.from(raw);
    expect(parseSyntheticTransportOutput(raw, markers)).toEqual({
      exactOutputSha256: digest(raw), exactOutputBytes: raw.length,
      seedMarkerExactMatch: seed, localMarkerExactMatch: local,
      notAvailableExactMatch: notAvailable, formatValid,
    });
    expect(raw).toEqual(unchanged);
  });
  it("trims only surrounding ASCII space, tab, CR and LF", () => {
    expect(parseSyntheticTransportOutput(Buffer.from(` \t\r\n${markers.seed}\n\r\t `), markers).seedMarkerExactMatch).toBe(true);
    for (const character of ["\u00a0", "\uFEFF", "\v", "\f", "\u2028", "\u2029"]) {
      expect(parseSyntheticTransportOutput(Buffer.from(`${character}${markers.seed}${character}`), markers).formatValid).toBe(false);
    }
    expect(parseSyntheticTransportOutput(Buffer.from(`${markers.seed.slice(0, 16)}\n${markers.seed.slice(16)}`), markers).formatValid).toBe(false);
  });
  it("hashes original bytes even when UTF8 is invalid", () => {
    const raw = Buffer.from([0xff, 0x20, 0x0a]);
    expect(parseSyntheticTransportOutput(raw, markers)).toMatchObject({ exactOutputSha256: digest(raw), exactOutputBytes: 3, formatValid: false });
    expect([...raw]).toEqual([0xff, 0x20, 0x0a]);
  });
});

describe("fixed private synthetic fixtures", () => {
  it("freezes exact files, prompt bytes, names, order and marker bindings before any capture", async () => {
    const run = await prepared();
    expect(run.manifest.runId).toMatch(/^[0-9a-f]{32}$/);
    expect(run.manifest.markers.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(run.manifest.markers.local).toMatch(/^[0-9a-f]{32}$/);
    expect(new Set([run.manifest.runId, run.manifest.markers.seed, run.manifest.markers.local]).size).toBe(3);
    expect(run.manifestSha256).toBe(digest(await readFile(run.manifestPath)));
    expect(SYNTHETIC_PROMPT_TEMPLATE).toBe("Read only the file named {FILE_NAME}. Return the exact value of its payload_marker field as one lowercase hexadecimal string, or return NOT_AVAILABLE if that file or field is not accessible. Do not use a different file, quote other sources, browse the web, or add explanation.");
    expect(run.manifest.probes.map((probe: any) => [probe.probeId, probe.chatMode, probe.expectedMarkerBinding])).toEqual([
      ["P01", "ORDINARY", "seed"], ["P02", "ORDINARY", "seed"],
      ["P03", "TEMPORARY_NON_PERSONALIZED", "seed"], ["P04", "TEMPORARY_NON_PERSONALIZED", "local"],
      ["P05", "TEMPORARY_NON_PERSONALIZED", "seed"], ["P06", "TEMPORARY_NON_PERSONALIZED", "absent"],
    ]);
    expect(run.manifest.probes.map((probe: any) => probe.attachment)).toEqual([
      run.manifest.files.seed.filename, null, null, run.manifest.files.local.filename, run.manifest.files.local.filename, null,
    ]);
    for (const kind of ["seed", "local"] as const) {
      const file = run.manifest.files[kind];
      expect(file.filename).toBe(`transport-fixture-${run.manifest.runId}-${kind}.txt`);
      const bytes = await readFile(join(run.directory, file.filename));
      expect(bytes).toEqual(Buffer.from(`payload_marker=${run.manifest.markers[kind]}\n`));
      expect(file.sha256).toBe(digest(bytes));
      expect(file.bytes).toBe(bytes.length);
    }
    for (const probe of run.manifest.probes) {
      const bytes = await readFile(join(run.directory, probe.prompt.filename));
      expect(bytes).toEqual(Buffer.from(SYNTHETIC_PROMPT_TEMPLATE.replace("{FILE_NAME}", probe.requestedFile)));
      expect(bytes.includes(run.manifest.markers.seed)).toBe(false);
      expect(bytes.includes(run.manifest.markers.local)).toBe(false);
      expect(probe.prompt.sha256).toBe(digest(bytes));
      expect(probe.prompt.bytes).toBe(bytes.length);
      expect(probe.initialState).toBe("UNEXECUTED");
    }
    expect(await readdir(join(run.directory, "captures"))).toEqual([]);
    expect(await readdir(run.directory)).not.toContain(run.manifest.files.absent.filename);
    const walk = async (path: string) => {
      const stat = await lstat(path);
      expect(stat.mode & 0o777).toBe(stat.isDirectory() ? 0o700 : 0o600);
      if (stat.isDirectory()) for (const name of await readdir(path)) await walk(join(path, name));
    };
    await walk(run.directory);
    expect(await verifySyntheticTransportPreflight(run.manifestPath, run.manifestSha256)).toMatchObject({
      fixtureCount: 2, promptCount: 6, capturedCount: 0, unexecutedCount: 6,
      probes: SYNTHETIC_PROBES.map(({ probeId }) => ({ probeId, state: "UNEXECUTED" })),
    });
  });
  it("creates separate new runs while preserving existing files", async () => {
    const root = await testRoot();
    const oldFile = join(root, "pre-existing-test-file.txt");
    await writeFile(oldFile, "fixed test bytes", { mode: 0o600 });
    const first = await prepareSyntheticTransportPreflight(root);
    const frozen = await readFile(first.manifestPath);
    const second = await prepareSyntheticTransportPreflight(root);
    expect(first.manifestPath).not.toBe(second.manifestPath);
    expect(await readFile(first.manifestPath)).toEqual(frozen);
    expect(await readFile(oldFile, "utf8")).toBe("fixed test bytes");
  });
  it("requires an existing private artifact root", async () => {
    const root = await testRoot();
    await expect(prepareSyntheticTransportPreflight(join(root, "missing"))).rejects.toThrow();
    await chmod(root, 0o755);
    await expect(prepareSyntheticTransportPreflight(root)).rejects.toThrow("PRIVATE_DIRECTORY_REQUIRED");
  });
  it.each(["manifest", "seed", "prompt", "absent"])("rejects changed frozen %s before recording", async (kind) => {
    const run = await prepared();
    const target = kind === "manifest" ? run.manifestPath : kind === "seed" ? join(run.directory, run.manifest.files.seed.filename)
      : kind === "prompt" ? join(run.directory, "prompts/P01.txt") : join(run.directory, run.manifest.files.absent.filename);
    await writeFile(target, "changed synthetic test bytes", { mode: 0o600 });
    await expect(captureSyntheticTransportProbe({ ...run, probeId: "P01", rawResponse: Buffer.from("NOT_AVAILABLE"), uiMetadata: {} })).rejects.toThrow();
    expect(await readdir(join(run.directory, "captures"))).toEqual([]);
  });
});

describe("first-output private capture", () => {
  it("preserves raw bytes and private comparisons while returning only structural state", async () => {
    const run = await prepared();
    const outputs = [run.manifest.markers.seed, "NOT_AVAILABLE", "Unexpected synthetic prose", run.manifest.markers.local, "", "NOT_AVAILABLE"];
    for (let index = 0; index < outputs.length; index++) {
      const raw = Buffer.from(` \t${outputs[index]}\r\n`);
      const summary = await captureSyntheticTransportProbe({ ...run, probeId: SYNTHETIC_PROBES[index].probeId, rawResponse: raw, uiMetadata: {} });
      const saved = await readFile(join(dirname(summary.metadataPath), "response.raw.txt"));
      expect(saved).toEqual(raw);
      const metadata = JSON.parse(await readFile(summary.metadataPath, "utf8"));
      expect(metadata).toMatchObject(parseSyntheticTransportOutput(raw, run.manifest.markers));
      expect(metadata.identifierAvailability.conversationOrSessionIdentifier).toBe("UNAVAILABLE_NOT_PROVIDED");
      expect(summary.exactOutputSha256).toBe(digest(raw));
      expect(summary.formatValid).toBe(![2, 4].includes(index));
      expect(summary).not.toHaveProperty("seedMarkerExactMatch");
      expect(summary).not.toHaveProperty("localMarkerExactMatch");
      expect(summary).not.toHaveProperty("notAvailableExactMatch");
      expect(JSON.stringify(summary)).not.toContain(run.manifest.markers.seed);
      expect(JSON.stringify(summary)).not.toContain(run.manifest.markers.local);
      expect(JSON.stringify(summary)).not.toContain("Unexpected synthetic prose");
      expect((await lstat(summary.metadataPath)).mode & 0o777).toBe(0o600);
      expect((await lstat(join(dirname(summary.metadataPath), "response.raw.txt"))).mode & 0o777).toBe(0o600);
    }
    expect(await verifySyntheticTransportPreflight(run.manifestPath, run.manifestSha256)).toMatchObject({ capturedCount: 6, unexecutedCount: 0 });
    await expect(captureSyntheticTransportProbe({ ...run, probeId: "P06", rawResponse: Buffer.from("NOT_AVAILABLE"), uiMetadata: {} })).rejects.toThrow("PROBE_DUPLICATE_OR_OUT_OF_ORDER");
  });
  it("rejects out-of-order and duplicate captures without overwriting the first output", async () => {
    const run = await prepared();
    const options = { ...run, rawResponse: Buffer.from("first synthetic output"), uiMetadata: {} };
    await expect(captureSyntheticTransportProbe({ ...options, probeId: "P02" })).rejects.toThrow("PROBE_DUPLICATE_OR_OUT_OF_ORDER");
    const first = await captureSyntheticTransportProbe({ ...options, probeId: "P01" });
    await expect(captureSyntheticTransportProbe({ ...options, probeId: "P01", rawResponse: Buffer.from("replacement") })).rejects.toThrow("PROBE_DUPLICATE_OR_OUT_OF_ORDER");
    expect(await readFile(join(dirname(first.metadataPath), "response.raw.txt"))).toEqual(options.rawResponse);
  });
  it("records a transport failure and leaves later probes explicitly unexecuted", async () => {
    const run = await prepared();
    const result = await captureSyntheticTransportProbe({ ...run, probeId: "P01", rawResponse: null, uiMetadata: { transportErrors: ["SYNTHETIC_TEST_TRANSPORT_FAILURE"] } });
    expect(result).toMatchObject({ state: "TRANSPORT_FAILED", exactOutputSha256: null, exactOutputBytes: null, formatValid: null, capturedCount: 0, unexecutedCount: 5 });
    expect(await readdir(dirname(result.metadataPath))).toEqual(["metadata.json"]);
    await expect(captureSyntheticTransportProbe({ ...run, probeId: "P02", rawResponse: Buffer.from("NOT_AVAILABLE"), uiMetadata: {} })).rejects.toThrow("TRANSPORT_STOP_REQUIRED");
    expect((await verifySyntheticTransportPreflight(run.manifestPath, run.manifestSha256)).probes).toEqual([
      { probeId: "P01", state: "TRANSPORT_FAILED" }, ...SYNTHETIC_PROBES.slice(1).map(({ probeId }) => ({ probeId, state: "UNEXECUTED" })),
    ]);
  });
  it("stops after an interrupted capture instead of allowing repair or replacement", async () => {
    const run = await prepared();
    await mkdir(join(run.directory, "captures/P01"), { mode: 0o700 });
    await expect(captureSyntheticTransportProbe({ ...run, probeId: "P01", rawResponse: Buffer.from("NOT_AVAILABLE"), uiMetadata: {} })).rejects.toThrow("TRANSPORT_STOP_REQUIRED");
    expect((await verifySyntheticTransportPreflight(run.manifestPath, run.manifestSha256)).probes[0].state).toBe("CAPTURE_INCOMPLETE");
  });
  it("rejects raw capture changes and unknown UI fields", async () => {
    const run = await prepared();
    await expect(captureSyntheticTransportProbe({ ...run, probeId: "P01", rawResponse: Buffer.from("NOT_AVAILABLE"), uiMetadata: { responseText: "forbidden" } })).rejects.toThrow("UI_METADATA_UNKNOWN_FIELD");
    const result = await captureSyntheticTransportProbe({ ...run, probeId: "P01", rawResponse: Buffer.from("NOT_AVAILABLE"), uiMetadata: {} });
    await writeFile(join(dirname(result.metadataPath), "response.raw.txt"), "changed");
    await expect(verifySyntheticTransportPreflight(run.manifestPath, run.manifestSha256)).rejects.toThrow("CAPTURED_RAW_CHANGED");
  });
  it("accepts private raw/metadata files and keeps CLI success and errors content-free", async () => {
    const run = await prepared();
    const rawPath = join(run.root, "test-captured-response.txt");
    const metadataPath = join(run.root, "test-ui-metadata.json");
    const prose = "Unexpected private synthetic response that must stay in the raw file.";
    await writeFile(rawPath, `\t${prose}\r\n`, { mode: 0o600 });
    await writeFile(metadataPath, JSON.stringify({ observedChatMode: "ORDINARY", observedSelectorLabel: "SYNTHETIC_TEST_SELECTOR" }), { mode: 0o600 });
    const stdout = execFileSync(process.execPath, ["--import", "tsx", cli, "capture", "--manifest", run.manifestPath, "--manifest-sha256", run.manifestSha256, "--probe", "P01", "--raw-file", rawPath, "--metadata-file", metadataPath], { encoding: "utf8" });
    expect(JSON.parse(stdout)).toMatchObject({ probeId: "P01", state: "CAPTURED", formatValid: false });
    for (const excluded of [prose, "SYNTHETIC_TEST_SELECTOR", run.manifest.markers.seed, run.manifest.markers.local, "MarkerExactMatch", "notAvailableExactMatch"]) expect(stdout).not.toContain(excluded);
    await chmod(rawPath, 0o644);
    await expect(captureSyntheticTransportProbeFromFiles({ ...run, probeId: "P02", rawPath, metadataPath })).rejects.toThrow("PRIVATE_REGULAR_FILE_REQUIRED");
    const failed = spawnSync(process.execPath, ["--import", "tsx", cli, `invalid-${prose}`], { encoding: "utf8" });
    expect(failed.status).toBe(1);
    expect(failed.stdout).toBe("");
    expect(failed.stderr).toBe('{"error":"COMMAND_INVALID"}\n');
  });
});
