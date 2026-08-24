import { createHash } from "node:crypto";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RETRACTION_WATCH_HEADERS,
  RETRACTION_WATCH_SOURCE_REPOSITORY,
  buildRetractionWatchSnapshot,
  fetchOfficialRetractionWatchSource,
  installRetractionWatchSnapshot,
  loadVerifiedRetractionWatchSnapshot,
  retractionWatchSnapshotIdForSource,
  rollbackRetractionWatchSnapshot,
} from "../packages/sources/src/index.js";

const roots: string[] = [];
const NOW = new Date("2026-08-24T07:00:00.000Z");

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

interface FixtureRow {
  id: string;
  title?: string;
  originalDoi?: string;
  originalPmid?: string;
  originalDate?: string;
  noticeDoi?: string;
  noticePmid?: string;
  noticeDate?: string;
  nature?: string;
  reasons?: string;
  urls?: string;
  paywalled?: string;
  notes?: string;
}

describe("verified Retraction Watch local snapshot", () => {
  it("parses the live trailing-empty-column shape and returns ordered role-aware DOI/PMID events", async () => {
    const root = await temporaryRoot();
    const fixture = await buildFixture(root, "a".repeat(40), [
      {
        id: "100",
        title: "A title with a comma, a \"quote\", and\na line break",
        originalDoi: "HTTPS://DOI.ORG/10.5555/ORIGINAL",
        originalPmid: "001234",
        originalDate: "1/2/2020 0:00",
        noticeDoi: "10.5555/notice.retract",
        noticePmid: "5678",
        noticeDate: "4/10/2024 0:00",
        nature: "Retraction",
        reasons: "Data concern;Duplicate image;",
        urls: "https://example.test/notice;",
        paywalled: "No",
        notes: "First public note",
      },
      {
        id: "101",
        originalDoi: "10.5555/original",
        originalPmid: "1234",
        originalDate: "2020-01-02 00:00:00",
        noticeDoi: "10.5555/notice.reinstate",
        noticePmid: "5679",
        noticeDate: "5/11/2025 0:00",
        nature: "Reinstatement",
        reasons: "Publisher decision;",
        paywalled: "Yes",
      },
    ]);
    const pointer = await installRetractionWatchSnapshot({
      rootDirectory: join(root, "runtime"),
      builtSnapshotDirectory: fixture.snapshotDirectory,
      sourceCheckedAt: NOW.toISOString(),
      now: () => NOW,
    });
    const reader = await loadVerifiedRetractionWatchSnapshot({
      rootDirectory: join(root, "runtime"),
      maxAgeMs: 48 * 60 * 60 * 1_000,
      now: () => NOW,
    });

    expect(pointer.current_snapshot_id).toBe(fixture.manifest.snapshot_id);
    expect(reader.manifest.source_headers).toEqual(RETRACTION_WATCH_HEADERS);
    expect(reader.manifest.row_count).toBe(2);
    expect(reader.freshnessStatus).toBe("current");

    const lookup = await reader.lookupByDoi("DOI:10.5555/ORIGINAL");
    expect(lookup).toMatchObject({
      provider: "retraction_watch",
      record_type: "publication_integrity",
      access_status: "metadata_only",
      pagination: { exhausted: true },
      data: {
        doi: "10.5555/original",
        lookup_status: "records_available",
        record_state: "reinstatement_recorded",
        matched_record_ids: ["100", "101"],
        notice_only_record_ids: [],
      },
    });
    expect(lookup.data.events.map(({ event_kind, event_date }) => [event_kind, event_date]))
      .toEqual([
        ["retraction", "2024-04-10"],
        ["reinstatement", "2025-05-11"],
      ]);
    expect(lookup.data.events.flatMap(({ assertions }) => assertions).every(
      ({ provider, assertion_source }) =>
        provider === "retraction_watch" && assertion_source === "retraction_watch",
    )).toBe(true);

    const originalPmid = await reader.lookupByPmid("0001234");
    expect(originalPmid.data.records.map(({ record_id }) => record_id)).toEqual(["100", "101"]);
    expect(originalPmid).toMatchObject({
      access_status: "metadata_only",
      data: { lookup_status: "records_available", freshness_status: "current" },
    });
    const noticeLookup = await reader.lookupByDoi("10.5555/notice.retract");
    expect(noticeLookup.data).toMatchObject({
      lookup_status: "no_match_in_provider",
      matched_record_ids: [],
      notice_only_record_ids: ["100"],
    });
    expect(noticeLookup.limitations.join(" ")).toContain("notice identifier");
  });

  it("marks stale snapshots partial and never turns a stale no-match into favorable evidence", async () => {
    const root = await temporaryRoot();
    const fixture = await buildFixture(root, "b".repeat(40), [{
      id: "200",
      originalDoi: "10.5555/other",
      noticeDate: "4/10/2024 0:00",
      nature: "Correction",
    }]);
    await installRetractionWatchSnapshot({
      rootDirectory: join(root, "runtime"),
      builtSnapshotDirectory: fixture.snapshotDirectory,
      sourceCheckedAt: "2026-08-20T07:00:00.000Z",
      now: () => new Date("2026-08-20T07:00:00.000Z"),
    });
    const reader = await loadVerifiedRetractionWatchSnapshot({
      rootDirectory: join(root, "runtime"),
      maxAgeMs: 24 * 60 * 60 * 1_000,
      now: () => NOW,
    });
    const lookup = await reader.lookupByDoi("10.5555/not-present");

    expect(reader.freshnessStatus).toBe("stale");
    expect(lookup.access_status).toBe("partial");
    expect(lookup.data.lookup_status).toBe("no_match_in_provider");
    expect(lookup.limitations.join(" ")).toContain("older than the configured freshness window");
    expect(lookup.limitations.join(" ")).toContain("not proof that no notice exists elsewhere");
  });

  it("refreshes an unchanged verified source check without inventing a previous snapshot", async () => {
    const root = await temporaryRoot();
    const runtime = join(root, "runtime");
    const fixture = await buildFixture(root, "b".repeat(39) + "1", [{ id: "201" }], "refresh");
    await installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: fixture.snapshotDirectory,
      sourceCheckedAt: "2026-08-23T07:00:00.000Z",
      now: () => new Date("2026-08-23T07:00:00.000Z"),
    });
    const refreshed = await installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: join(runtime, "snapshots", fixture.manifest.snapshot_id),
      sourceCheckedAt: NOW.toISOString(),
      now: () => NOW,
    });

    expect(refreshed).toMatchObject({
      current_snapshot_id: fixture.manifest.snapshot_id,
      previous_snapshot_id: null,
      previous_source_checked_at: null,
      source_checked_at: NOW.toISOString(),
    });
  });

  it("retains only the active and previous verified generations", async () => {
    const root = await temporaryRoot();
    const runtime = join(root, "runtime");
    const fixtures = await Promise.all([
      buildFixture(root, "1".repeat(40), [{ id: "211" }], "prune-one"),
      buildFixture(root, "2".repeat(40), [{ id: "212" }], "prune-two"),
      buildFixture(root, "3".repeat(40), [{ id: "213" }], "prune-three"),
    ]);
    for (let index = 0; index < fixtures.length; index += 1) {
      await installRetractionWatchSnapshot({
        rootDirectory: runtime,
        builtSnapshotDirectory: fixtures[index]!.snapshotDirectory,
        sourceCheckedAt: new Date(NOW.getTime() + index * 1_000).toISOString(),
        now: () => new Date(NOW.getTime() + index * 1_000),
      });
    }

    const generations = (await readdir(join(runtime, "snapshots")))
      .filter((name) => name.startsWith("rws1_"))
      .sort();
    expect(generations).toEqual([
      fixtures[1]!.manifest.snapshot_id,
      fixtures[2]!.manifest.snapshot_id,
    ].sort());
    const rolledBack = await rollbackRetractionWatchSnapshot({
      rootDirectory: runtime,
      now: () => new Date(NOW.getTime() + 4_000),
    });
    expect(rolledBack.current_snapshot_id).toBe(fixtures[1]!.manifest.snapshot_id);
  });

  it.each([
    ["missing header", RETRACTION_WATCH_HEADERS.slice(0, -2)],
    ["reordered header", [RETRACTION_WATCH_HEADERS[1], RETRACTION_WATCH_HEADERS[0], ...RETRACTION_WATCH_HEADERS.slice(2)]],
    ["duplicate header", [RETRACTION_WATCH_HEADERS[0], RETRACTION_WATCH_HEADERS[0], ...RETRACTION_WATCH_HEADERS.slice(2)]],
    ["extra header", [...RETRACTION_WATCH_HEADERS, "Unexpected"]],
    ["non-terminal empty header", [RETRACTION_WATCH_HEADERS[0], "", ...RETRACTION_WATCH_HEADERS.slice(1, -1)]],
  ])("rejects %s drift instead of accepting a changed provider schema", async (_label, headers) => {
    const root = await temporaryRoot();
    const csvPath = join(root, "bad.csv");
    const body = `${headers.map(csvCell).join(",")}\n${fixtureRow({ id: "300" })}\n`;
    await writeFile(csvPath, body, { mode: 0o600 });
    await expect(buildFromPath(root, csvPath, "c".repeat(40))).rejects.toThrow(
      /header|schema|malformed/u,
    );
  });

  it("rejects duplicate record IDs and impossible dates", async () => {
    const root = await temporaryRoot();
    const duplicatePath = join(root, "duplicate.csv");
    const duplicate = `${header()}\n${fixtureRow({ id: "400" })}\n${fixtureRow({ id: "400" })}\n`;
    await writeFile(duplicatePath, duplicate, { mode: 0o600 });
    await expect(buildFromPath(root, duplicatePath, "d".repeat(40))).rejects.toThrow(
      /Duplicate Retraction Watch record ID/u,
    );

    const invalidDatePath = join(root, "invalid-date.csv");
    await writeFile(
      invalidDatePath,
      `${header()}\n${fixtureRow({ id: "401", noticeDate: "2/30/2024 0:00" })}\n`,
      { mode: 0o600 },
    );
    await expect(buildFromPath(root, invalidDatePath, "e".repeat(40))).rejects.toThrow(
      /Impossible Retraction Watch date/u,
    );
  });

  it("rejects malformed and oversized CSV records instead of partially ingesting them", async () => {
    const root = await temporaryRoot();
    const malformedPath = join(root, "malformed.csv");
    await writeFile(malformedPath, `${header()}\n\"unterminated`, { mode: 0o600 });
    await expect(buildFromPath(root, malformedPath, "a".repeat(39) + "1", "malformed"))
      .rejects.toThrow(/schema|malformed/u);

    const oversizedPath = join(root, "oversized.csv");
    await writeFile(
      oversizedPath,
      `${header()}\n${fixtureRow({ id: "403", title: "x".repeat(1_024 * 1_024 + 1) })}\n`,
      { mode: 0o600 },
    );
    await expect(buildFromPath(root, oversizedPath, "a".repeat(39) + "2", "oversized"))
      .rejects.toThrow(/schema|malformed/u);
  });

  it("rejects a source whose bytes do not match the declared source identity", async () => {
    const root = await temporaryRoot();
    const csvPath = join(root, "identity.csv");
    const csv = `${header()}\n${fixtureRow({ id: "404" })}\n`;
    await writeFile(csvPath, csv, { mode: 0o600 });
    await expect(buildRetractionWatchSnapshot({
      csvPath,
      snapshotDirectory: join(root, "identity-snapshot"),
      source: {
        sourceCommit: "a".repeat(39) + "3",
        sourceCommittedAt: "2026-08-24T06:00:00.000Z",
        sourceFileSha256: "f".repeat(64),
        sourceFileBytes: Buffer.byteLength(csv),
        syncedAt: NOW.toISOString(),
      },
    })).rejects.toMatchObject({ code: "retraction_watch_source_identity_mismatch" });
  });

  it("accepts the documented 1756 AM timestamp outlier but still rejects invalid times", async () => {
    const root = await temporaryRoot();
    const documentedOutlier = await buildFixture(root, "6".repeat(40), [{
      id: "18930",
      noticeDate: "6/24/1756 12:00:00 AM",
    }], "documented-date-outlier");
    expect(documentedOutlier.manifest.row_count).toBe(1);

    const invalidTimePath = join(root, "invalid-time.csv");
    await writeFile(
      invalidTimePath,
      `${header()}\n${fixtureRow({ id: "402", noticeDate: "6/24/1756 25:00" })}\n`,
      { mode: 0o600 },
    );
    await expect(buildFromPath(root, invalidTimePath, "7".repeat(40))).rejects.toThrow(
      /Impossible Retraction Watch date/u,
    );
  });

  it("refuses tampered indexes and symlinked activation pointers", async () => {
    const root = await temporaryRoot();
    const fixture = await buildFixture(root, "f".repeat(40), [{ id: "500" }]);
    const runtime = join(root, "runtime");
    await installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: fixture.snapshotDirectory,
      sourceCheckedAt: NOW.toISOString(),
      now: () => NOW,
    });
    const indexPath = join(runtime, "snapshots", fixture.manifest.snapshot_id, "doi-index.json");
    await writeFile(indexPath, "{}\n", { mode: 0o600 });
    await expect(loadVerifiedRetractionWatchSnapshot({
      rootDirectory: runtime,
      maxAgeMs: 1_000,
      now: () => NOW,
    })).rejects.toThrow(/manifest|schema|malformed/u);

    const otherRoot = await temporaryRoot();
    const otherFixture = await buildFixture(otherRoot, "1".repeat(40), [{ id: "501" }]);
    const otherRuntime = join(otherRoot, "runtime");
    await installRetractionWatchSnapshot({
      rootDirectory: otherRuntime,
      builtSnapshotDirectory: otherFixture.snapshotDirectory,
      sourceCheckedAt: NOW.toISOString(),
      now: () => NOW,
    });
    const pointer = join(otherRuntime, "active.json");
    const externalPointer = join(otherRoot, "external-pointer.json");
    await writeFile(externalPointer, await readFile(pointer));
    await unlink(pointer);
    await symlink(externalPointer, pointer);
    await expect(loadVerifiedRetractionWatchSnapshot({
      rootDirectory: otherRuntime,
      maxAgeMs: 1_000,
      now: () => NOW,
    })).rejects.toThrow(/symbolic link/u);
  });

  it("keeps the active pointer unchanged after a failed replacement and performs only verified rollback", async () => {
    const root = await temporaryRoot();
    const runtime = join(root, "runtime");
    const first = await buildFixture(root, "2".repeat(40), [{
      id: "600",
      originalDoi: "10.5555/first",
      nature: "Correction",
    }], "first");
    await installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: first.snapshotDirectory,
      sourceCheckedAt: "2026-08-23T07:00:00.000Z",
      now: () => new Date("2026-08-23T07:00:00.000Z"),
    });
    const corrupt = await buildFixture(root, "3".repeat(40), [{
      id: "601",
      originalDoi: "10.5555/corrupt",
      nature: "Retraction",
    }], "corrupt");
    await writeFile(join(corrupt.snapshotDirectory, "manifest.json"), "{}\n");
    await expect(installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: corrupt.snapshotDirectory,
      sourceCheckedAt: NOW.toISOString(),
      now: () => NOW,
    })).rejects.toThrow();
    let reader = await loadVerifiedRetractionWatchSnapshot({
      rootDirectory: runtime,
      maxAgeMs: 7 * 24 * 60 * 60 * 1_000,
      now: () => NOW,
    });
    expect(reader.manifest.snapshot_id).toBe(first.manifest.snapshot_id);

    const second = await buildFixture(root, "4".repeat(40), [{
      id: "602",
      originalDoi: "10.5555/second",
      nature: "Retraction",
    }], "second");
    await installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: second.snapshotDirectory,
      sourceCheckedAt: NOW.toISOString(),
      now: () => NOW,
    });
    reader = await loadVerifiedRetractionWatchSnapshot({
      rootDirectory: runtime,
      maxAgeMs: 7 * 24 * 60 * 60 * 1_000,
      now: () => NOW,
    });
    expect(reader.manifest.snapshot_id).toBe(second.manifest.snapshot_id);

    const pointer = await rollbackRetractionWatchSnapshot({
      rootDirectory: runtime,
      now: () => new Date("2026-08-24T08:00:00.000Z"),
    });
    expect(pointer.current_snapshot_id).toBe(first.manifest.snapshot_id);
    expect(pointer.source_checked_at).toBe("2026-08-23T07:00:00.000Z");
    expect(pointer.previous_source_checked_at).toBe(NOW.toISOString());
    reader = await loadVerifiedRetractionWatchSnapshot({
      rootDirectory: runtime,
      maxAgeMs: 7 * 24 * 60 * 60 * 1_000,
      now: () => NOW,
    });
    expect(reader.manifest.snapshot_id).toBe(first.manifest.snapshot_id);
  });

  it("refuses rollback to a corrupted previous snapshot and keeps the current snapshot active", async () => {
    const root = await temporaryRoot();
    const runtime = join(root, "runtime");
    const first = await buildFixture(root, "8".repeat(40), [{ id: "610" }], "rollback-first");
    const second = await buildFixture(root, "9".repeat(40), [{ id: "611" }], "rollback-second");
    await installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: first.snapshotDirectory,
      sourceCheckedAt: "2026-08-23T07:00:00.000Z",
      now: () => new Date("2026-08-23T07:00:00.000Z"),
    });
    await installRetractionWatchSnapshot({
      rootDirectory: runtime,
      builtSnapshotDirectory: second.snapshotDirectory,
      sourceCheckedAt: NOW.toISOString(),
      now: () => NOW,
    });
    const pointerPath = join(runtime, "active.json");
    const pointerBefore = await readFile(pointerPath, "utf8");
    await writeFile(
      join(runtime, "snapshots", first.manifest.snapshot_id, "doi-index.json"),
      "{}\n",
      { mode: 0o600 },
    );

    await expect(rollbackRetractionWatchSnapshot({
      rootDirectory: runtime,
      now: () => new Date("2026-08-24T08:00:00.000Z"),
    })).rejects.toThrow(/manifest|schema|malformed/u);
    expect(await readFile(pointerPath, "utf8")).toBe(pointerBefore);
    const reader = await loadVerifiedRetractionWatchSnapshot({
      rootDirectory: runtime,
      maxAgeMs: 7 * 24 * 60 * 60 * 1_000,
      now: () => NOW,
    });
    expect(reader.manifest.snapshot_id).toBe(second.manifest.snapshot_id);
  });

  it("uses only the fixed official GitLab project and downloads the file at the exact returned commit", async () => {
    const root = await temporaryRoot();
    const commit = "5".repeat(40);
    const csv = `${header()}\n${fixtureRow({ id: "700" })}\n`;
    const requests: URL[] = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.includes("/api/v4/projects/")) {
        return new Response(JSON.stringify([{
          id: commit,
          committed_date: "2026-08-24T06:00:00.000Z",
        }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
    });
    const source = await fetchOfficialRetractionWatchSource({
      temporaryParent: root,
      now: () => NOW,
      fetchImpl: fetchImpl as typeof fetch,
    });
    try {
      expect(requests).toHaveLength(2);
      expect(requests[0]!.origin).toBe("https://gitlab.com");
      expect(requests[0]!.searchParams.get("path")).toBe("retraction_watch.csv");
      expect(requests[0]!.searchParams.get("ref_name")).toBe("main");
      expect(requests[1]!.toString()).toBe(
        `${RETRACTION_WATCH_SOURCE_REPOSITORY}/-/raw/${commit}/retraction_watch.csv`,
      );
      expect(source).toMatchObject({
        commit,
        committedAt: "2026-08-24T06:00:00.000Z",
        sourceFileBytes: Buffer.byteLength(csv),
        sourceFileSha256: hash(csv),
      });
    } finally {
      await source.cleanup();
    }
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "askrigor-rw-test-"));
  roots.push(root);
  return root;
}

async function buildFixture(
  root: string,
  commit: string,
  rows: FixtureRow[],
  suffix = commit.slice(0, 4),
) {
  const csv = `${header()}\n${rows.map(fixtureRow).join("\n")}\n`;
  const csvPath = join(root, `${suffix}.csv`);
  await writeFile(csvPath, csv, { mode: 0o600 });
  return buildFromPath(root, csvPath, commit, suffix);
}

async function buildFromPath(
  root: string,
  csvPath: string,
  commit: string,
  suffix = commit.slice(0, 4),
) {
  const bytes = await readFile(csvPath);
  const sourceFileSha256 = createHash("sha256").update(bytes).digest("hex");
  const snapshotId = retractionWatchSnapshotIdForSource({
    sourceCommit: commit,
    sourceFileSha256,
  });
  const snapshotDirectory = join(root, `built-${suffix}-${snapshotId}`);
  const manifest = await buildRetractionWatchSnapshot({
    csvPath,
    snapshotDirectory,
    source: {
      sourceCommit: commit,
      sourceCommittedAt: "2026-08-24T06:00:00.000Z",
      sourceFileSha256,
      sourceFileBytes: bytes.byteLength,
      syncedAt: NOW.toISOString(),
    },
  });
  return { manifest, snapshotDirectory };
}

function header(): string {
  return RETRACTION_WATCH_HEADERS.map(csvCell).join(",");
}

function fixtureRow(row: FixtureRow): string {
  const fields = Array.from({ length: RETRACTION_WATCH_HEADERS.length }, () => "");
  fields[0] = row.id;
  fields[1] = row.title ?? `Study ${row.id}`;
  fields[8] = row.urls ?? "";
  fields[10] = row.noticeDate ?? "4/10/2024 0:00";
  fields[11] = row.noticeDoi ?? `10.5555/notice.${row.id}`;
  fields[12] = row.noticePmid ?? "0";
  fields[13] = row.originalDate ?? "1/2/2020 0:00";
  fields[14] = row.originalDoi ?? `10.5555/original.${row.id}`;
  fields[15] = row.originalPmid ?? "0";
  fields[16] = row.nature ?? "Retraction";
  fields[17] = row.reasons ?? "Data concern;";
  fields[18] = row.paywalled ?? "No";
  fields[19] = row.notes ?? "";
  fields[20] = "";
  return fields.map(csvCell).join(",");
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
