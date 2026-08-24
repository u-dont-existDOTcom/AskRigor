import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFileResearchSessionStore,
  createInitialResearchSessionState,
  protocolBindingsFromManifests,
  ResearchSessionUnavailableError,
  type ResearchSessionState,
} from "../apps/research-mcp/src/index.js";

const roots: string[] = [];
const KEY = Buffer.alloc(32, 0x42);

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("encrypted file research-session store", () => {
  it("survives process recreation without exposing the sensitive target", () => {
    const root = temporaryRoot();
    const state = initialState("sensitive hip treatment comparison");
    const first = createStore(root);
    const sessionId = first.issue(state);
    const file = join(root, `${sessionId}.json`);
    const stored = readFileSync(file, "utf8");

    expect(stored).not.toContain(state.research_target);
    expect(stored).not.toContain("diagnosis_not_specified");

    const reconcile = vi.fn((value: ResearchSessionState) => value);
    const restarted = createStore(root, { reconcileRestoredState: reconcile });
    expect(restarted.read(sessionId)).toEqual(state);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(restarted.read(sessionId)).toEqual(state);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("authenticates lifecycle metadata and encrypted state", () => {
    const root = temporaryRoot();
    const store = createStore(root);
    const sessionId = store.issue(initialState());
    const path = join(root, `${sessionId}.json`);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    envelope.absolute_expires_at_ms = Number(envelope.absolute_expires_at_ms) + 1;
    writeFileSync(path, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });

    expect(() => createStore(root).read(sessionId)).toThrow(/authentication failed/u);
  });

  it("fails closed for an unknown key without revealing plaintext", () => {
    const root = temporaryRoot();
    const store = createStore(root);
    const sessionId = store.issue(initialState());
    const wrongKey = createFileResearchSessionStore({
      rootDirectory: root,
      encryptionKey: Buffer.alloc(32, 0x24),
      keyId: "phase-g-key",
    });

    expect(() => wrongKey.read(sessionId)).toThrow(/authentication failed/u);
  });

  it("fences a stale writer after its claim lease expires", () => {
    const root = temporaryRoot();
    let now = 1_000;
    const first = createStore(root, { now: () => now, claimLeaseMs: 10 });
    const sessionId = first.issue(initialState());
    const staleState = first.claim(sessionId);

    now += 11;
    const second = createStore(root, { now: () => now, claimLeaseMs: 10 });
    second.claim(sessionId);

    expect(() => first.replace(sessionId, staleState)).toThrow(
      ResearchSessionUnavailableError,
    );
    second.rollback(sessionId);
    expect(second.read(sessionId)).toEqual(staleState);
  });

  it("rejects capacity instead of silently evicting an unexpired session", () => {
    const root = temporaryRoot();
    const store = createStore(root, { maxEntries: 1 });
    const firstId = store.issue(initialState("first retained target"));

    expect(() => store.issue(initialState("second target"))).toThrow(
      /cannot admit another unexpired session/u,
    );
    expect(store.read(firstId).research_target).toBe("first retained target");
  });

  it("prunes expired checkpoints and enforces explicit deletion", () => {
    const root = temporaryRoot();
    let now = 10_000;
    const store = createStore(root, {
      now: () => now,
      idleTtlMs: 20,
      absoluteTtlMs: 30,
    });
    const expiredId = store.issue(initialState("expired"));
    now += 21;
    expect(() => store.read(expiredId)).toThrow(ResearchSessionUnavailableError);

    const deletedId = store.issue(initialState("deleted"));
    store.delete(deletedId);
    expect(() => store.read(deletedId)).toThrow(ResearchSessionUnavailableError);
  });

  it("never extends a checkpoint beyond its absolute lifetime", () => {
    const root = temporaryRoot();
    let now = 100;
    const store = createStore(root, {
      now: () => now,
      idleTtlMs: 10,
      absoluteTtlMs: 20,
    });
    const sessionId = store.issue(initialState("absolute-lifetime target"));

    now = 109;
    expect(store.read(sessionId).research_target).toBe("absolute-lifetime target");
    now = 118;
    expect(store.read(sessionId).research_target).toBe("absolute-lifetime target");
    now = 120;
    expect(() => store.read(sessionId)).toThrow(ResearchSessionUnavailableError);
  });

  it("rejects a valid checkpoint replayed under another session identity", () => {
    const root = temporaryRoot();
    const store = createStore(root);
    const firstId = store.issue(initialState("first identity"));
    const secondId = store.issue(initialState("second identity"));
    const firstBytes = readFileSync(join(root, `${firstId}.json`));

    writeFileSync(join(root, `${secondId}.json`), firstBytes, { mode: 0o600 });

    expect(() => createStore(root).read(secondId)).toThrow(
      /identity or key is unavailable/u,
    );
  });

  it("rejects unsafe roots and invalid keys", () => {
    const root = temporaryRoot();
    chmodSync(root, 0o755);
    expect(() => createStore(root)).toThrow(/permissions/u);
    chmodSync(root, 0o700);
    expect(() => createFileResearchSessionStore({
      rootDirectory: root,
      encryptionKey: Buffer.alloc(31),
      keyId: "phase-g-key",
    })).toThrow(/exactly 32 bytes/u);
  });
});

function createStore(
  root: string,
  overrides: Partial<Parameters<typeof createFileResearchSessionStore>[0]> = {},
) {
  return createFileResearchSessionStore({
    rootDirectory: root,
    encryptionKey: KEY,
    keyId: "phase-g-key",
    ...overrides,
  });
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "askrigor-session-store-"));
  roots.push(root);
  return root;
}

function initialState(
  researchTarget = "de-identified treatment comparison",
): ResearchSessionState {
  return createInitialResearchSessionState({
    research_target: researchTarget,
    diagnosis_status: "diagnosis_not_specified",
  }, protocolBindingsFromManifests(
    manifest("universal"),
    manifest("hrp"),
  ));
}

function manifest(protocol: "universal" | "hrp") {
  return {
    name: protocol === "universal" ? "Universal Instructions" : "Health Research Protocol",
    version: protocol === "universal" ? "20.5.14" : "20.5.22",
    revisionDate: protocol === "universal" ? "2026-08-18" : "2026-08-23",
    sha256: protocol === "universal" ? "a".repeat(64) : "b".repeat(64),
  };
}
