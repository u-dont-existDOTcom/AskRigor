import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createOneTimeTextRelay,
  relayPathname,
  verifyRelayPageTransfer,
} from "../evaluation/mast/src/authenticated-text-relay.js";
import {
  normalizeTransportText,
  transportFailureReceiptSchema,
  transportTextIdentity,
} from "../evaluation/mast/src/chatgpt-browser-transport.js";
import { ROUND_2_STUDY_ID } from "../evaluation/mast/src/fresh-validation-round-2.js";

const opaqueInputId = "run-000000000000000000000001";
const token = Buffer.alloc(32, 7).toString("base64url");
const source = `${"large relay packet αβγ\n".repeat(9_000)}terminal`;
const identity = transportTextIdentity(source);
const instant = "2026-09-18T21:00:00.000Z";
const temporaryDirectories: string[] = [];
const openRelays: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(openRelays.splice(0).map((relay) => relay.close().catch(() => undefined)));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function packetFile(value = source) {
  const directory = await mkdtemp(join(tmpdir(), "askrigor-text-relay-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "packet.txt");
  await writeFile(path, value, { mode: 0o600 });
  return path;
}

async function relay(input: { value?: string; expectedSha256?: string; now?: () => number; maxServes?: number } = {}) {
  const instance = await createOneTimeTextRelay({
    packetPath: await packetFile(input.value),
    opaqueInputId,
    expectedPacketSha256: input.expectedSha256 ?? transportTextIdentity(input.value ?? source).sha256,
    ttlMs: 30_000,
    maxServes: input.maxServes ?? 2,
    token,
    now: input.now,
  });
  openRelays.push(instance);
  return instance;
}

function observation(overrides: Record<string, unknown> = {}) {
  const pathname = relayPathname({ opaqueInputId, expectedPacketSha256: identity.sha256, token });
  return {
    schemaVersion: 1,
    observedAt: instant,
    originProtocol: "https:",
    pathnameSha256: transportTextIdentity(pathname).sha256,
    normalization: "LINE_ENDINGS_TO_LF_ONLY",
    relayUtf8Bytes: identity.utf8Bytes,
    relayCodePoints: identity.codePoints,
    relayPageSha256: identity.sha256,
    ...overrides,
  };
}

describe("authenticated one-time MAST text relay", () => {
  it("serves an exact 167+ KB packet once with non-cacheable plain-text headers", async () => {
    expect(Buffer.byteLength(source, "utf8")).toBeGreaterThanOrEqual(167_433);
    const instance = await relay();
    const response = await fetch(instance.localUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.text()).toBe(source);
    expect(instance.status()).toEqual({ status: "SERVED", serveCount: 1 });
  });

  it("canonicalizes only line endings before hashing and serving", async () => {
    const crlf = source.replace(/\n/gu, "\r\n");
    const instance = await relay({ value: crlf, expectedSha256: identity.sha256 });
    expect(await (await fetch(instance.localUrl)).text()).toBe(normalizeTransportText(crlf));
  });

  it("rejects wrong tokens, run IDs, hashes, and directory-like paths without content", async () => {
    const instance = await relay();
    const origin = new URL(instance.localUrl).origin;
    for (const pathname of [
      relayPathname({ opaqueInputId, expectedPacketSha256: identity.sha256, token: `${token}x` }),
      relayPathname({ opaqueInputId: "run-000000000000000000000002", expectedPacketSha256: identity.sha256, token }),
      relayPathname({ opaqueInputId, expectedPacketSha256: "0".repeat(64), token }),
      "/",
    ]) {
      const response = await fetch(`${origin}${pathname}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
  });

  it("rejects a changed character, truncation, and an incorrect declared source hash", async () => {
    for (const changed of [`${source.slice(0, -1)}X`, source.slice(0, -1)]) {
      await expect(relay({ value: changed, expectedSha256: identity.sha256 }))
        .rejects.toThrow("TEXT_RELAY_SOURCE_HASH_MISMATCH");
    }
    await expect(relay({ expectedSha256: "0".repeat(64) }))
      .rejects.toThrow("TEXT_RELAY_SOURCE_HASH_MISMATCH");
  });

  it("expires and invalidates tokens and blocks replay beyond the bounded serve count", async () => {
    let now = 1_000;
    const expired = await relay({ now: () => now });
    now += 30_000;
    expect((await fetch(expired.localUrl)).status).toBe(410);

    const invalidated = await relay();
    invalidated.invalidate();
    expect((await fetch(invalidated.localUrl)).status).toBe(410);

    const replayed = await relay({ maxServes: 1 });
    expect((await fetch(replayed.localUrl)).status).toBe(200);
    expect((await fetch(replayed.localUrl)).status).toBe(410);
  });

  it("fails closed for relay-page hash, length, path, and composer-equivalent mismatches", () => {
    const expectedPathname = relayPathname({ opaqueInputId, expectedPacketSha256: identity.sha256, token });
    expect(verifyRelayPageTransfer({
      expectedPacketSha256: identity.sha256,
      expectedUtf8Bytes: identity.utf8Bytes,
      expectedCodePoints: identity.codePoints,
      expectedPathname,
      observation: observation(),
    }).exactEquality).toBe(true);
    for (const changed of [
      { relayPageSha256: "0".repeat(64) },
      { relayUtf8Bytes: identity.utf8Bytes - 1 },
      { relayCodePoints: identity.codePoints - 1 },
      { pathnameSha256: "0".repeat(64) },
    ]) {
      expect(() => verifyRelayPageTransfer({
        expectedPacketSha256: identity.sha256,
        expectedUtf8Bytes: identity.utf8Bytes,
        expectedCodePoints: identity.codePoints,
        expectedPathname,
        observation: observation(changed),
      })).toThrow("GENERATION_RELAY_PAGE_SOURCE_MISMATCH");
    }
  });

  it("represents tunnel interruption before Send and ambiguity after Send without unsafe retry", () => {
    expect(transportFailureReceiptSchema.parse({
      schemaVersion: 1,
      studyId: ROUND_2_STUDY_ID,
      opaqueInputId,
      attempt: 1,
      stage: "TUNNEL_START",
      failureCode: "QUICK_TUNNEL_INTERRUPTED_BEFORE_SEND",
      sourceSha256: identity.sha256,
      observedComposerSha256: null,
      messageMayHaveBeenSent: false,
      retryable: true,
      stoppedBeforeSend: true,
      recordedAt: instant,
    }).retryable).toBe(true);
    expect(transportFailureReceiptSchema.parse({
      schemaVersion: 1,
      studyId: ROUND_2_STUDY_ID,
      opaqueInputId,
      attempt: 1,
      stage: "RESPONSE_CAPTURE",
      failureCode: "RESPONSE_CAPTURE_AMBIGUOUS",
      sourceSha256: identity.sha256,
      observedComposerSha256: identity.sha256,
      messageMayHaveBeenSent: true,
      retryable: false,
      stoppedBeforeSend: false,
      recordedAt: instant,
    }).retryable).toBe(false);
  });
});
