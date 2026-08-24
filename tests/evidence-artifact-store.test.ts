import { describe, expect, it } from "vitest";

import { createInMemoryEvidenceArtifactStore } from "../apps/research-mcp/src/index.js";

const NOW = new Date("2026-08-24T01:00:00.000Z");

function input(content: Uint8Array, provider: "crossref" | "forrt" = "crossref") {
  return {
    artifactKind: "normalized_provider_envelope" as const,
    provider,
    sourceIdentifier: "10.5555/artifact.test",
    mediaType: "application/json" as const,
    content,
  };
}

describe("in-memory evidence artifact store", () => {
  it("uses deterministic content-derived identities and clones bytes on write and read", () => {
    const store = createInMemoryEvidenceArtifactStore({ now: () => NOW });
    const source = Buffer.from("{\"provider\":\"crossref\"}", "utf8");
    const first = store.put(input(source));
    source.fill(0);

    expect(first).toMatchObject({
      artifact_id: expect.stringMatching(/^aea1_[a-f0-9]{64}$/u),
      provider: "crossref",
      content_bytes: 23,
      created_at: NOW.toISOString(),
    });
    const read = store.read(first.artifact_id)!;
    expect(Buffer.from(read.content).toString("utf8")).toBe("{\"provider\":\"crossref\"}");
    read.content.fill(0);
    expect(Buffer.from(store.read(first.artifact_id)!.content).toString("utf8"))
      .toBe("{\"provider\":\"crossref\"}");
  });

  it("deduplicates an exact artifact while keeping provider identity in the address", () => {
    const store = createInMemoryEvidenceArtifactStore({ now: () => NOW });
    const bytes = Buffer.from("same bytes", "utf8");
    const first = store.put(input(bytes));
    const duplicate = store.put(input(bytes));
    const otherProvider = store.put(input(bytes, "forrt"));

    expect(duplicate).toEqual(first);
    expect(otherProvider.content_sha256).toBe(first.content_sha256);
    expect(otherProvider.artifact_id).not.toBe(first.artifact_id);
  });

  it("fails closed at entry, per-artifact, and aggregate byte bounds", () => {
    const entryBound = createInMemoryEvidenceArtifactStore({
      now: () => NOW,
      maxEntries: 1,
      maxArtifactBytes: 10,
      maxTotalBytes: 10,
    });
    entryBound.put(input(Buffer.from("first", "utf8")));
    expect(() => entryBound.put({
      ...input(Buffer.from("second", "utf8")),
      sourceIdentifier: "10.5555/other",
    })).toThrow("capacity exceeded");

    const byteBound = createInMemoryEvidenceArtifactStore({
      now: () => NOW,
      maxArtifactBytes: 4,
      maxTotalBytes: 8,
    });
    expect(() => byteBound.put(input(Buffer.from("12345", "utf8"))))
      .toThrow("per-artifact byte limit");
  });

  it("revokes explicitly and rejects an invalid clock or inconsistent bounds", () => {
    const store = createInMemoryEvidenceArtifactStore({ now: () => NOW });
    const descriptor = store.put(input(Buffer.from("artifact", "utf8")));
    expect(store.has(descriptor.artifact_id)).toBe(true);
    store.revoke(descriptor.artifact_id);
    expect(store.has(descriptor.artifact_id)).toBe(false);
    expect(store.read(descriptor.artifact_id)).toBeUndefined();

    const invalidClock = createInMemoryEvidenceArtifactStore({
      now: () => new Date(Number.NaN),
    });
    expect(() => invalidClock.put(input(Buffer.from("x", "utf8"))))
      .toThrow("Invalid evidence artifact store clock");
    expect(() => createInMemoryEvidenceArtifactStore({
      maxArtifactBytes: 9,
      maxTotalBytes: 8,
    })).toThrow("cannot exceed");
    expect(() => createInMemoryEvidenceArtifactStore({
      maxArtifactBytes: 10 * 1_024 * 1_024 + 1,
      maxTotalBytes: 10 * 1_024 * 1_024 + 1,
    })).toThrow("descriptor contract");
    expect(() => store.put({
      ...input(Buffer.from("unexpected", "utf8")),
      caller_claimed_hash: "a".repeat(64),
    } as never)).toThrow();
  });
});
