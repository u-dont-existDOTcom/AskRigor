import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
} from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

import {
  errorEnvelope,
  okEnvelope,
  publicationIntegrityEventSchema,
  type AccessStatus,
  type PublicationIntegrityAssertion,
  type PublicationIntegrityEvent,
  type PublicationRecordState,
  type ProvenanceEnvelope,
} from "@askrigor/contracts";
import { parse } from "csv-parse";
import { z } from "zod";

import { normalizeDoiIdentifier } from "./doi.js";

export const RETRACTION_WATCH_SOURCE_REPOSITORY =
  "https://gitlab.com/crossref/retraction-watch-data" as const;
export const RETRACTION_WATCH_SOURCE_PATH = "retraction_watch.csv" as const;
export const RETRACTION_WATCH_GITLAB_PROJECT_ID =
  "crossref%2Fretraction-watch-data" as const;
export const RETRACTION_WATCH_SOURCE_REF = "main" as const;

export const RETRACTION_WATCH_HEADERS = [
  "Record ID",
  "Title",
  "Subject",
  "Institution",
  "Journal",
  "Publisher",
  "Country",
  "Author",
  "URLS",
  "ArticleType",
  "RetractionDate",
  "RetractionDOI",
  "RetractionPubMedID",
  "OriginalPaperDate",
  "OriginalPaperDOI",
  "OriginalPaperPubMedID",
  "RetractionNature",
  "Reason",
  "Paywalled",
  "Notes",
  "",
] as const;

const SNAPSHOT_SCHEMA_VERSION = "1.0";
const SNAPSHOT_PREFIX = "rws1_";
const POINTER_FILE = "active.json";
const SNAPSHOTS_DIRECTORY = "snapshots";
const RECORDS_FILE = "records.ndjson";
const DOI_INDEX_FILE = "doi-index.json";
const PMID_INDEX_FILE = "pmid-index.json";
const MANIFEST_FILE = "manifest.json";
const MAX_SOURCE_BYTES = 128 * 1_024 * 1_024;
const MAX_RECORD_BYTES = 1 * 1_024 * 1_024;
const MAX_ROWS = 1_000_000;
const MAX_INDEX_REFERENCES = 2_000_000;
const MAX_MANIFEST_BYTES = 128 * 1_024;
const MAX_INDEX_BYTES = 128 * 1_024 * 1_024;
const MAX_POINTER_BYTES = 16 * 1_024;
const MAX_NORMALIZED_FIELD = 4_000;
const MAX_LIST_ITEMS = 50;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const snapshotIdSchema = z.string().regex(/^rws1_[a-f0-9]{64}$/u);
const timestampSchema = z.string().datetime({ offset: true });
const pmidSchema = z.string().regex(/^\d{1,12}$/u);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable();
const matchRoleSchema = z.enum(["original", "notice"]);

const normalizedRecordSchema = z
  .object({
    record_id: z.string().regex(/^\d{1,20}$/u),
    title: z.string().max(MAX_NORMALIZED_FIELD).nullable(),
    original_doi: z.string().nullable(),
    original_doi_raw: z.string().max(2_048).nullable(),
    original_pmid: pmidSchema.nullable(),
    original_pmid_raw: z.string().max(100).nullable(),
    original_date: dateSchema,
    notice_doi: z.string().nullable(),
    notice_doi_raw: z.string().max(2_048).nullable(),
    notice_pmid: pmidSchema.nullable(),
    notice_pmid_raw: z.string().max(100).nullable(),
    notice_date: dateSchema,
    event_kind: z.enum([
      "retraction",
      "withdrawal",
      "expression_of_concern",
      "correction",
      "update",
      "reinstatement",
      "other",
    ]),
    raw_nature: z.string().trim().min(1).max(MAX_NORMALIZED_FIELD),
    reasons: z.array(z.string().trim().min(1).max(MAX_NORMALIZED_FIELD)).max(MAX_LIST_ITEMS),
    urls: z.array(z.url().max(MAX_NORMALIZED_FIELD)).max(MAX_LIST_ITEMS),
    paywalled: z.enum(["yes", "no", "unknown"]),
    notes: z.string().max(MAX_NORMALIZED_FIELD).nullable(),
    truncated_fields: z.array(z.enum(["title", "reasons", "urls", "notes"])).max(4),
  })
  .strict();

const indexReferenceSchema = z
  .object({
    offset: z.number().int().nonnegative(),
    length: z.number().int().positive().max(MAX_RECORD_BYTES),
    record_id: normalizedRecordSchema.shape.record_id,
    role: matchRoleSchema,
  })
  .strict();

const snapshotIndexSchema = z
  .object({
    index_name: z.enum(["doi", "pmid"]),
    index_version: z.literal(SNAPSHOT_SCHEMA_VERSION),
    entries: z
      .array(
        z
          .tuple([
            z.string().trim().min(1).max(2_048),
            z.array(indexReferenceSchema).min(1).max(MAX_ROWS),
          ])
          .readonly(),
      )
      .max(MAX_ROWS),
  })
  .strict();

const generatedFileSchema = z
  .object({
    file: z.enum([RECORDS_FILE, DOI_INDEX_FILE, PMID_INDEX_FILE]),
    sha256: sha256Schema,
    bytes: z.number().int().positive().max(MAX_INDEX_BYTES),
  })
  .strict();

export const retractionWatchSnapshotManifestSchema = z
  .object({
    snapshot_name: z.literal("askrigor_retraction_watch_snapshot"),
    snapshot_version: z.literal(SNAPSHOT_SCHEMA_VERSION),
    snapshot_id: snapshotIdSchema,
    source_repository: z.literal(RETRACTION_WATCH_SOURCE_REPOSITORY),
    source_ref: z.literal(RETRACTION_WATCH_SOURCE_REF),
    source_commit: commitSchema,
    source_committed_at: timestampSchema,
    source_path: z.literal(RETRACTION_WATCH_SOURCE_PATH),
    source_file_sha256: sha256Schema,
    source_file_bytes: z.number().int().positive().max(MAX_SOURCE_BYTES),
    source_headers: z.tuple(RETRACTION_WATCH_HEADERS.map((header) => z.literal(header)) as [
      z.ZodLiteral<string>,
      ...z.ZodLiteral<string>[],
    ]),
    source_headers_sha256: sha256Schema,
    row_count: z.number().int().positive().max(MAX_ROWS),
    records_with_truncation: z.number().int().nonnegative().max(MAX_ROWS),
    invalid_original_doi_count: z.number().int().nonnegative().max(MAX_ROWS),
    invalid_original_pmid_count: z.number().int().nonnegative().max(MAX_ROWS),
    doi_key_count: z.number().int().nonnegative().max(MAX_ROWS),
    doi_reference_count: z.number().int().nonnegative().max(MAX_INDEX_REFERENCES),
    pmid_key_count: z.number().int().nonnegative().max(MAX_ROWS),
    pmid_reference_count: z.number().int().nonnegative().max(MAX_INDEX_REFERENCES),
    generated_files: z.array(generatedFileSchema).length(3),
    synced_at: timestampSchema,
  })
  .strict();

export const retractionWatchSnapshotPointerSchema = z
  .object({
    pointer_name: z.literal("askrigor_retraction_watch_active_snapshot"),
    pointer_version: z.literal(SNAPSHOT_SCHEMA_VERSION),
    current_snapshot_id: snapshotIdSchema,
    current_manifest_sha256: sha256Schema,
    previous_snapshot_id: snapshotIdSchema.nullable(),
    previous_manifest_sha256: sha256Schema.nullable(),
    previous_source_checked_at: timestampSchema.nullable(),
    source_checked_at: timestampSchema,
    activated_at: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const previousFields = [
      value.previous_snapshot_id,
      value.previous_manifest_sha256,
      value.previous_source_checked_at,
    ];
    if (!previousFields.every((field) => field === null) && !previousFields.every((field) => field !== null)) {
      context.addIssue({
        code: "custom",
        path: ["previous_snapshot_id"],
        message: "previous snapshot identity, manifest hash, and source-check time must be present together",
      });
    }
    if (value.previous_snapshot_id === value.current_snapshot_id) {
      context.addIssue({
        code: "custom",
        path: ["previous_snapshot_id"],
        message: "current and previous snapshot identities must differ",
      });
    }
  });

export type RetractionWatchSnapshotManifest = z.output<
  typeof retractionWatchSnapshotManifestSchema
>;
export type RetractionWatchSnapshotPointer = z.output<
  typeof retractionWatchSnapshotPointerSchema
>;
export type RetractionWatchNormalizedRecord = z.output<
  typeof normalizedRecordSchema
>;

export interface RetractionWatchPublicationIntegrityData {
  doi: string | null;
  lookup_status: "records_available" | "no_match_in_provider";
  record_state: PublicationRecordState;
  events: PublicationIntegrityEvent[];
  snapshot_id: string;
  source_commit: string;
  source_file_sha256: string;
  source_checked_at: string;
  freshness_status: "current" | "stale";
  matched_record_ids: string[];
  notice_only_record_ids: string[];
}

export interface RetractionWatchPmidLookupData {
  pmid: string | null;
  lookup_status: "records_available" | "no_match_in_provider";
  records: RetractionWatchNormalizedRecord[];
  snapshot_id: string;
  source_checked_at: string;
  freshness_status: "current" | "stale";
}

export interface RetractionWatchSnapshotReader {
  readonly manifest: RetractionWatchSnapshotManifest;
  readonly pointer: RetractionWatchSnapshotPointer;
  readonly freshnessStatus: "current" | "stale";
  lookupByDoi(
    doi: string,
  ): Promise<ProvenanceEnvelope<RetractionWatchPublicationIntegrityData>>;
  lookupByPmid(
    pmid: string,
  ): Promise<ProvenanceEnvelope<RetractionWatchPmidLookupData>>;
}

export interface RetractionWatchSnapshotSourceIdentity {
  sourceCommit: string;
  sourceCommittedAt: string;
  sourceFileSha256: string;
  sourceFileBytes: number;
  syncedAt: string;
}

export interface BuildRetractionWatchSnapshotInput {
  csvPath: string;
  snapshotDirectory: string;
  source: RetractionWatchSnapshotSourceIdentity;
}

export interface LoadRetractionWatchSnapshotInput {
  rootDirectory: string;
  maxAgeMs: number;
  now?: () => Date;
}

export interface InstallRetractionWatchSnapshotInput {
  rootDirectory: string;
  builtSnapshotDirectory: string;
  sourceCheckedAt: string;
  now?: () => Date;
}

export interface OfficialRetractionWatchSource {
  commit: string;
  committedAt: string;
  csvPath: string;
  sourceFileSha256: string;
  sourceFileBytes: number;
  syncedAt: string;
  cleanup(): Promise<void>;
}

interface ParsedIndex {
  map: Map<string, z.output<typeof indexReferenceSchema>[]>;
  file: z.output<typeof snapshotIndexSchema>;
}

interface VerifiedSnapshotFiles {
  manifest: RetractionWatchSnapshotManifest;
  manifestSha256: string;
  recordsPath: string;
  doiIndex: ParsedIndex;
  pmidIndex: ParsedIndex;
}

class RetractionWatchSnapshotError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "RetractionWatchSnapshotError";
  }
}

export async function buildRetractionWatchSnapshot(
  rawInput: BuildRetractionWatchSnapshotInput,
): Promise<RetractionWatchSnapshotManifest> {
  const input = parseBuildInput(rawInput);
  const sourceFile = await verifyRegularFile(input.csvPath, MAX_SOURCE_BYTES);
  if (
    sourceFile.bytes !== input.source.sourceFileBytes ||
    sourceFile.sha256 !== input.source.sourceFileSha256
  ) {
    throw new RetractionWatchSnapshotError(
      "retraction_watch_source_identity_mismatch",
      false,
      "Retraction Watch source bytes do not match the declared exact source identity",
    );
  }
  await mkdir(input.snapshotDirectory, { recursive: false, mode: 0o700 });
  const recordsPath = join(input.snapshotDirectory, RECORDS_FILE);
  const doiReferences = new Map<string, z.output<typeof indexReferenceSchema>[]>();
  const pmidReferences = new Map<string, z.output<typeof indexReferenceSchema>[]>();
  const recordIds = new Set<string>();
  let rowCount = 0;
  let recordsWithTruncation = 0;
  let invalidOriginalDoiCount = 0;
  let invalidOriginalPmidCount = 0;
  let recordOffset = 0;
  const recordsHash = createHash("sha256");
  const records = createWriteStream(recordsPath, {
    flags: "wx",
    mode: 0o600,
  });
  let recordsStreamError: unknown;
  records.on("error", (error) => {
    recordsStreamError = error;
  });
  let parsedHeader = false;
  try {
    const parser = createReadStream(input.csvPath).pipe(
      parse({
        bom: true,
        columns: false,
        delimiter: ",",
        quote: '"',
        escape: '"',
        record_delimiter: ["\r\n", "\n"],
        relax_column_count: false,
        relax_quotes: false,
        skip_empty_lines: true,
        max_record_size: MAX_RECORD_BYTES,
      }),
    );
    for await (const rawRow of parser) {
      const row = z.array(z.string()).parse(rawRow);
      if (!parsedHeader) {
        validateHeader(row);
        parsedHeader = true;
        continue;
      }
      if (row.length !== RETRACTION_WATCH_HEADERS.length) {
        throw snapshotFormatError("Retraction Watch row does not match the exact header width");
      }
      if (rowCount >= MAX_ROWS) {
        throw snapshotFormatError("Retraction Watch row limit exceeded");
      }
      const record = normalizeRow(row);
      if (recordIds.has(record.record_id)) {
        throw snapshotFormatError(`Duplicate Retraction Watch record ID ${record.record_id}`);
      }
      recordIds.add(record.record_id);
      if (record.truncated_fields.length > 0) recordsWithTruncation += 1;
      if (record.original_doi === null && record.original_doi_raw !== null) {
        invalidOriginalDoiCount += 1;
      }
      if (record.original_pmid === null && record.original_pmid_raw !== null) {
        invalidOriginalPmidCount += 1;
      }
      const line = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
      if (line.byteLength > MAX_RECORD_BYTES) {
        throw snapshotFormatError(`Normalized record ${record.record_id} exceeds the byte limit`);
      }
      const reference = (role: "original" | "notice") =>
        indexReferenceSchema.parse({
          offset: recordOffset,
          length: line.byteLength,
          record_id: record.record_id,
          role,
        });
      addIdentifierReference(doiReferences, record.original_doi, reference("original"));
      addIdentifierReference(doiReferences, record.notice_doi, reference("notice"));
      addIdentifierReference(pmidReferences, record.original_pmid, reference("original"));
      addIdentifierReference(pmidReferences, record.notice_pmid, reference("notice"));
      recordsHash.update(line);
      if (!records.write(line)) await once(records, "drain");
      recordOffset += line.byteLength;
      rowCount += 1;
    }
    if (!parsedHeader || rowCount === 0) {
      throw snapshotFormatError("Retraction Watch CSV is missing its header or data rows");
    }
    records.end();
    await waitForStreamClose(records);
    if (recordsStreamError !== undefined) throw recordsStreamError;
    const sourceAfterParsing = await verifyRegularFile(input.csvPath, MAX_SOURCE_BYTES);
    if (
      sourceAfterParsing.bytes !== sourceFile.bytes ||
      sourceAfterParsing.sha256 !== sourceFile.sha256
    ) {
      throw new RetractionWatchSnapshotError(
        "retraction_watch_source_identity_mismatch",
        false,
        "Retraction Watch source changed while the snapshot was being built",
      );
    }
  } catch (error) {
    if (!records.destroyed) records.destroy();
    await waitForStreamClose(records);
    throw normalizeSnapshotError(error);
  }

  const doiIndex = createIndex("doi", doiReferences);
  const pmidIndex = createIndex("pmid", pmidReferences);
  const doiBytes = Buffer.from(`${canonicalJson(doiIndex)}\n`, "utf8");
  const pmidBytes = Buffer.from(`${canonicalJson(pmidIndex)}\n`, "utf8");
  if (doiBytes.byteLength > MAX_INDEX_BYTES || pmidBytes.byteLength > MAX_INDEX_BYTES) {
    throw snapshotFormatError("Retraction Watch identifier index exceeds the byte limit");
  }
  await Promise.all([
    writeExclusive(join(input.snapshotDirectory, DOI_INDEX_FILE), doiBytes),
    writeExclusive(join(input.snapshotDirectory, PMID_INDEX_FILE), pmidBytes),
  ]);
  const sourceHeadersSha256 = sha256(Buffer.from(canonicalJson(RETRACTION_WATCH_HEADERS), "utf8"));
  const snapshotId = snapshotIdentifier({
    source_commit: input.source.sourceCommit,
    source_file_sha256: input.source.sourceFileSha256,
    source_headers_sha256: sourceHeadersSha256,
    snapshot_version: SNAPSHOT_SCHEMA_VERSION,
  });
  const manifest = retractionWatchSnapshotManifestSchema.parse({
    snapshot_name: "askrigor_retraction_watch_snapshot",
    snapshot_version: SNAPSHOT_SCHEMA_VERSION,
    snapshot_id: snapshotId,
    source_repository: RETRACTION_WATCH_SOURCE_REPOSITORY,
    source_ref: RETRACTION_WATCH_SOURCE_REF,
    source_commit: input.source.sourceCommit,
    source_committed_at: input.source.sourceCommittedAt,
    source_path: RETRACTION_WATCH_SOURCE_PATH,
    source_file_sha256: input.source.sourceFileSha256,
    source_file_bytes: input.source.sourceFileBytes,
    source_headers: [...RETRACTION_WATCH_HEADERS],
    source_headers_sha256: sourceHeadersSha256,
    row_count: rowCount,
    records_with_truncation: recordsWithTruncation,
    invalid_original_doi_count: invalidOriginalDoiCount,
    invalid_original_pmid_count: invalidOriginalPmidCount,
    doi_key_count: doiIndex.entries.length,
    doi_reference_count: countReferences(doiIndex),
    pmid_key_count: pmidIndex.entries.length,
    pmid_reference_count: countReferences(pmidIndex),
    generated_files: [
      { file: RECORDS_FILE, sha256: recordsHash.digest("hex"), bytes: recordOffset },
      { file: DOI_INDEX_FILE, sha256: sha256(doiBytes), bytes: doiBytes.byteLength },
      { file: PMID_INDEX_FILE, sha256: sha256(pmidBytes), bytes: pmidBytes.byteLength },
    ].sort((left, right) => left.file.localeCompare(right.file)),
    synced_at: input.source.syncedAt,
  });
  await writeExclusive(
    join(input.snapshotDirectory, MANIFEST_FILE),
    Buffer.from(`${canonicalJson(manifest)}\n`, "utf8"),
  );
  await verifySnapshotDirectory(input.snapshotDirectory);
  return manifest;
}

export async function installRetractionWatchSnapshot(
  rawInput: InstallRetractionWatchSnapshotInput,
): Promise<RetractionWatchSnapshotPointer> {
  const input = parseInstallInput(rawInput);
  const built = await verifySnapshotDirectory(input.builtSnapshotDirectory);
  const root = await ensureOwnedRoot(input.rootDirectory);
  const snapshots = join(root, SNAPSHOTS_DIRECTORY);
  await mkdir(snapshots, { recursive: true, mode: 0o700 });
  await rejectSymlink(snapshots, "Retraction Watch snapshots directory");
  const destination = snapshotPath(snapshots, built.manifest.snapshot_id);
  let destinationExists = false;
  try {
    await lstat(destination);
    destinationExists = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (destinationExists) {
    const existing = await verifySnapshotDirectory(destination);
    if (existing.manifestSha256 !== built.manifestSha256) {
      throw snapshotFormatError("Existing snapshot identity has different manifest bytes");
    }
  } else {
    await rename(input.builtSnapshotDirectory, destination);
    await syncDirectory(snapshots);
  }
  const prior = await readOptionalPointer(root);
  const activatedAt = validNow(input.now).toISOString();
  const pointer = retractionWatchSnapshotPointerSchema.parse({
    pointer_name: "askrigor_retraction_watch_active_snapshot",
    pointer_version: SNAPSHOT_SCHEMA_VERSION,
    current_snapshot_id: built.manifest.snapshot_id,
    current_manifest_sha256: built.manifestSha256,
    previous_snapshot_id:
      prior === null || prior.current_snapshot_id === built.manifest.snapshot_id
        ? prior?.previous_snapshot_id ?? null
        : prior.current_snapshot_id,
    previous_manifest_sha256:
      prior === null || prior.current_snapshot_id === built.manifest.snapshot_id
        ? prior?.previous_manifest_sha256 ?? null
        : prior.current_manifest_sha256,
    previous_source_checked_at:
      prior === null || prior.current_snapshot_id === built.manifest.snapshot_id
        ? prior?.previous_source_checked_at ?? null
        : prior.source_checked_at,
    source_checked_at: input.sourceCheckedAt,
    activated_at: activatedAt,
  });
  await writePointerAtomically(root, pointer);
  await pruneSnapshotDirectories(snapshots, new Set([
    pointer.current_snapshot_id,
    ...(pointer.previous_snapshot_id === null ? [] : [pointer.previous_snapshot_id]),
  ]));
  return pointer;
}

export async function rollbackRetractionWatchSnapshot(input: {
  rootDirectory: string;
  now?: () => Date;
}): Promise<RetractionWatchSnapshotPointer> {
  const root = await existingOwnedRoot(input.rootDirectory);
  const pointer = await readRequiredPointer(root);
  if (
    pointer.previous_snapshot_id === null ||
    pointer.previous_manifest_sha256 === null ||
    pointer.previous_source_checked_at === null
  ) {
    throw new RetractionWatchSnapshotError(
      "retraction_watch_rollback_unavailable",
      false,
      "No previous Retraction Watch snapshot is available for rollback",
    );
  }
  const previous = await verifySnapshotDirectory(
    snapshotPath(join(root, SNAPSHOTS_DIRECTORY), pointer.previous_snapshot_id),
  );
  if (previous.manifestSha256 !== pointer.previous_manifest_sha256) {
    throw snapshotFormatError("Previous Retraction Watch snapshot manifest hash is invalid");
  }
  const rolledBack = retractionWatchSnapshotPointerSchema.parse({
    ...pointer,
    current_snapshot_id: pointer.previous_snapshot_id,
    current_manifest_sha256: pointer.previous_manifest_sha256,
    previous_snapshot_id: pointer.current_snapshot_id,
    previous_manifest_sha256: pointer.current_manifest_sha256,
    previous_source_checked_at: pointer.source_checked_at,
    source_checked_at: pointer.previous_source_checked_at,
    activated_at: validNow(input.now).toISOString(),
  });
  await writePointerAtomically(root, rolledBack);
  return rolledBack;
}

export async function loadVerifiedRetractionWatchSnapshot(
  rawInput: LoadRetractionWatchSnapshotInput,
): Promise<RetractionWatchSnapshotReader> {
  const input = parseLoadInput(rawInput);
  const root = await existingOwnedRoot(input.rootDirectory);
  const pointer = await readRequiredPointer(root);
  const verified = await verifySnapshotDirectory(
    snapshotPath(join(root, SNAPSHOTS_DIRECTORY), pointer.current_snapshot_id),
  );
  if (verified.manifestSha256 !== pointer.current_manifest_sha256) {
    throw snapshotFormatError("Active Retraction Watch manifest hash does not match the pointer");
  }
  const now = validNow(input.now);
  const checkedAt = new Date(pointer.source_checked_at);
  if (checkedAt.getTime() - now.getTime() > 5 * 60 * 1_000) {
    throw snapshotFormatError("Retraction Watch source-check time is implausibly in the future");
  }
  const freshnessStatus = now.getTime() - checkedAt.getTime() > input.maxAgeMs
    ? "stale" as const
    : "current" as const;
  const immutableManifest = structuredClone(verified.manifest);
  const immutablePointer = structuredClone(pointer);
  return Object.freeze({
    manifest: immutableManifest,
    pointer: immutablePointer,
    freshnessStatus,
    async lookupByDoi(rawDoi: string) {
      const doi = normalizeDoiIdentifier(rawDoi);
      if (doi === undefined) {
        return lookupErrorEnvelope(
          null,
          immutableManifest,
          immutablePointer,
          freshnessStatus,
          "retraction_watch_identifier_invalid",
          false,
        );
      }
      try {
        const references = verified.doiIndex.map.get(doi) ?? [];
        const records = await readReferences(verified.recordsPath, references);
        const originalRecords = records.filter(({ reference }) => reference.role === "original");
        const noticeOnlyRecordIds = records
          .filter(({ reference }) => reference.role === "notice")
          .map(({ record }) => record.record_id)
          .filter((recordId) => !originalRecords.some(({ record }) => record.record_id === recordId));
        const events = eventsFromRecords(
          doi,
          originalRecords.map(({ record }) => record),
        );
        const lookupStatus = events.length === 0
          ? "no_match_in_provider" as const
          : "records_available" as const;
        const stale = freshnessStatus === "stale";
        return okEnvelope<RetractionWatchPublicationIntegrityData>({
          provider: "retraction_watch",
          recordType: "publication_integrity",
          primaryIdentifier: doi,
          retrievedAt: immutablePointer.source_checked_at,
          sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
          accessStatus: stale ? "partial" : "metadata_only",
          pagination: { exhausted: true },
          returned: events.length,
          limitations: [
            "Retraction Watch records are provider-curated publication-integrity metadata, not proof of study validity, invalidity, misconduct, or claim truth.",
            ...(lookupStatus === "no_match_in_provider"
              ? ["No exact original-work DOI match was present in this verified local snapshot; absence is provider-scoped and is not proof that no notice exists elsewhere."]
              : []),
            ...(noticeOnlyRecordIds.length > 0
              ? ["The queried DOI also appeared as a notice identifier for another original record; that relation is disclosed but is not applied as an integrity event to the notice DOI itself."]
              : []),
            ...(stale
              ? ["The verified local Retraction Watch snapshot is older than the configured freshness window; coverage is partial until a successful source refresh."]
              : []),
          ],
          rawMetadata: {
            snapshot_id: immutableManifest.snapshot_id,
            source_commit: immutableManifest.source_commit,
            source_file_sha256: immutableManifest.source_file_sha256,
          },
          data: {
            doi,
            lookup_status: lookupStatus,
            record_state: derivePublicationRecordState(events, doi),
            events,
            snapshot_id: immutableManifest.snapshot_id,
            source_commit: immutableManifest.source_commit,
            source_file_sha256: immutableManifest.source_file_sha256,
            source_checked_at: immutablePointer.source_checked_at,
            freshness_status: freshnessStatus,
            matched_record_ids: [...new Set(originalRecords.map(({ record }) => record.record_id))].sort(numericStringCompare),
            notice_only_record_ids: [...new Set(noticeOnlyRecordIds)].sort(numericStringCompare),
          },
        });
      } catch (error) {
        return lookupErrorEnvelope(
          doi,
          immutableManifest,
          immutablePointer,
          freshnessStatus,
          error instanceof RetractionWatchSnapshotError
            ? error.code
            : "retraction_watch_snapshot_read_failed",
          error instanceof RetractionWatchSnapshotError
            ? error.retryable
            : true,
        );
      }
    },
    async lookupByPmid(rawPmid: string) {
      const pmid = normalizePmid(rawPmid);
      if (pmid === null) {
        return errorEnvelope<RetractionWatchPmidLookupData>({
          provider: "retraction_watch",
          recordType: "publication_integrity_record_lookup",
          retrievedAt: immutablePointer.source_checked_at,
          accessStatus: "inaccessible",
          code: "retraction_watch_identifier_invalid",
          message: "Retraction Watch PMID lookup requires a nonzero numeric identifier",
          retryable: false,
          limitations: ["No Retraction Watch lookup was performed for the invalid PMID."],
          data: {
            pmid: null,
            lookup_status: "no_match_in_provider",
            records: [],
            snapshot_id: immutableManifest.snapshot_id,
            source_checked_at: immutablePointer.source_checked_at,
            freshness_status: freshnessStatus,
          },
        }) as ProvenanceEnvelope<RetractionWatchPmidLookupData>;
      }
      try {
        const references = verified.pmidIndex.map.get(pmid) ?? [];
        const records = await readReferences(verified.recordsPath, references);
        const unique = [...new Map(records.map(({ record }) => [
          record.record_id,
          structuredClone(record),
        ])).values()].sort((left, right) => numericStringCompare(left.record_id, right.record_id));
        const stale = freshnessStatus === "stale";
        return okEnvelope<RetractionWatchPmidLookupData>({
          provider: "retraction_watch",
          recordType: "publication_integrity_record_lookup",
          primaryIdentifier: pmid,
          retrievedAt: immutablePointer.source_checked_at,
          accessStatus: stale ? "partial" : "metadata_only",
          pagination: { exhausted: true },
          returned: unique.length,
          limitations: [
            "Retraction Watch records are provider-curated publication-integrity metadata, not proof of study validity, invalidity, misconduct, or claim truth.",
            ...(unique.length === 0
              ? ["No exact PMID match was present in this verified local snapshot; absence is provider-scoped and is not proof that no notice exists elsewhere."]
              : []),
            ...(stale
              ? ["The verified local Retraction Watch snapshot is older than the configured freshness window; coverage is partial until a successful source refresh."]
              : []),
          ],
          rawMetadata: { snapshot_id: immutableManifest.snapshot_id },
          data: {
            pmid,
            lookup_status: unique.length === 0
              ? "no_match_in_provider"
              : "records_available",
            records: unique,
            snapshot_id: immutableManifest.snapshot_id,
            source_checked_at: immutablePointer.source_checked_at,
            freshness_status: freshnessStatus,
          },
        });
      } catch (error) {
        return errorEnvelope<RetractionWatchPmidLookupData>({
          provider: "retraction_watch",
          recordType: "publication_integrity_record_lookup",
          primaryIdentifier: pmid,
          retrievedAt: immutablePointer.source_checked_at,
          accessStatus: "error",
          code: error instanceof RetractionWatchSnapshotError
            ? error.code
            : "retraction_watch_snapshot_read_failed",
          message: "Verified local Retraction Watch snapshot lookup failed",
          retryable: error instanceof RetractionWatchSnapshotError
            ? error.retryable
            : true,
          limitations: ["Retraction Watch coverage is unavailable for this lookup; no favorable or unfavorable inference is permitted."],
          data: {
            pmid,
            lookup_status: "no_match_in_provider",
            records: [],
            snapshot_id: immutableManifest.snapshot_id,
            source_checked_at: immutablePointer.source_checked_at,
            freshness_status: freshnessStatus,
          },
        }) as ProvenanceEnvelope<RetractionWatchPmidLookupData>;
      }
    },
  });
}

export async function fetchOfficialRetractionWatchSource(input: {
  temporaryParent: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}): Promise<OfficialRetractionWatchSource> {
  if (!isAbsolute(input.temporaryParent)) {
    throw new RetractionWatchSnapshotError(
      "retraction_watch_temporary_path_invalid",
      false,
      "Retraction Watch temporary parent must be an absolute path",
    );
  }
  const now = validNow(input.now);
  const fetchImpl = input.fetchImpl ?? fetch;
  const temporary = await mkdtemp(join(input.temporaryParent, "askrigor-rw-sync-"));
  try {
    const commitUrl = new URL(
      `https://gitlab.com/api/v4/projects/${RETRACTION_WATCH_GITLAB_PROJECT_ID}/repository/commits`,
    );
    commitUrl.searchParams.set("path", RETRACTION_WATCH_SOURCE_PATH);
    commitUrl.searchParams.set("ref_name", RETRACTION_WATCH_SOURCE_REF);
    commitUrl.searchParams.set("per_page", "1");
    const commitResponse = await fetchImpl(commitUrl, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "askrigor-retraction-watch-sync/1.0" },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!commitResponse.ok) {
      throw providerFetchError(commitResponse.status, "Retraction Watch commit lookup failed");
    }
    const commitBody = await boundedJson(commitResponse, 128 * 1_024);
    const commit = z
      .array(
        z.object({ id: commitSchema, committed_date: timestampSchema }).passthrough(),
      )
      .length(1)
      .parse(commitBody)[0]!;
    const rawUrl = new URL(
      `${RETRACTION_WATCH_SOURCE_REPOSITORY}/-/raw/${commit.id}/${RETRACTION_WATCH_SOURCE_PATH}`,
    );
    const csvResponse = await fetchImpl(rawUrl, {
      method: "GET",
      headers: { Accept: "text/csv", "User-Agent": "askrigor-retraction-watch-sync/1.0" },
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (!csvResponse.ok || csvResponse.body === null) {
      throw providerFetchError(csvResponse.status, "Retraction Watch CSV download failed");
    }
    const csvPath = join(temporary, RETRACTION_WATCH_SOURCE_PATH);
    const output = createWriteStream(csvPath, { flags: "wx", mode: 0o600 });
    let outputStreamError: unknown;
    output.on("error", (error) => {
      outputStreamError = error;
    });
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      for await (const chunk of csvResponse.body) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_SOURCE_BYTES) {
          throw new RetractionWatchSnapshotError(
            "retraction_watch_source_too_large",
            false,
            "Retraction Watch source exceeds the configured byte limit",
          );
        }
        hash.update(buffer);
        if (!output.write(buffer)) await once(output, "drain");
      }
      output.end();
      await waitForStreamClose(output);
      if (outputStreamError !== undefined) throw outputStreamError;
    } catch (error) {
      if (!output.destroyed) output.destroy();
      await waitForStreamClose(output);
      throw error;
    }
    if (bytes === 0) throw snapshotFormatError("Retraction Watch source is empty");
    return {
      commit: commit.id,
      committedAt: commit.committed_date,
      csvPath,
      sourceFileSha256: hash.digest("hex"),
      sourceFileBytes: bytes,
      syncedAt: now.toISOString(),
      async cleanup() {
        await rm(temporary, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw normalizeSnapshotError(error);
  }
}

export function retractionWatchSnapshotIdForSource(input: {
  sourceCommit: string;
  sourceFileSha256: string;
}): string {
  const sourceCommit = commitSchema.parse(input.sourceCommit);
  const sourceFileSha256 = sha256Schema.parse(input.sourceFileSha256);
  return snapshotIdentifier({
    source_commit: sourceCommit,
    source_file_sha256: sourceFileSha256,
    source_headers_sha256: sha256(Buffer.from(canonicalJson(RETRACTION_WATCH_HEADERS), "utf8")),
    snapshot_version: SNAPSHOT_SCHEMA_VERSION,
  });
}

async function verifySnapshotDirectory(
  rawDirectory: string,
): Promise<VerifiedSnapshotFiles> {
  const directory = await verifiedDirectory(rawDirectory, "Retraction Watch snapshot directory");
  const manifestPath = safeChild(directory, MANIFEST_FILE);
  const manifestBytes = await readBoundedRegularFile(manifestPath, MAX_MANIFEST_BYTES);
  const manifest = retractionWatchSnapshotManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  if (basename(directory) !== manifest.snapshot_id && basename(dirname(directory)) === SNAPSHOTS_DIRECTORY) {
    throw snapshotFormatError("Snapshot directory name does not match the manifest identity");
  }
  const expectedSnapshotId = retractionWatchSnapshotIdForSource({
    sourceCommit: manifest.source_commit,
    sourceFileSha256: manifest.source_file_sha256,
  });
  if (manifest.snapshot_id !== expectedSnapshotId) {
    throw snapshotFormatError("Retraction Watch snapshot identity is not derived from its source manifest");
  }
  const expectedHeaderHash = sha256(
    Buffer.from(canonicalJson(RETRACTION_WATCH_HEADERS), "utf8"),
  );
  if (manifest.source_headers_sha256 !== expectedHeaderHash) {
    throw snapshotFormatError("Retraction Watch source-header hash does not match the accepted schema");
  }
  const generated = new Map(manifest.generated_files.map((file) => [file.file, file]));
  if (generated.size !== 3) throw snapshotFormatError("Retraction Watch generated-file manifest is incomplete");
  for (const fileName of [RECORDS_FILE, DOI_INDEX_FILE, PMID_INDEX_FILE] as const) {
    const expected = generated.get(fileName);
    if (expected === undefined) throw snapshotFormatError(`Missing ${fileName} manifest entry`);
    const actual = await verifyRegularFile(safeChild(directory, fileName), MAX_INDEX_BYTES);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      throw snapshotFormatError(`${fileName} does not match its manifest identity`);
    }
  }
  const doiIndex = await readIndex(safeChild(directory, DOI_INDEX_FILE), "doi");
  const pmidIndex = await readIndex(safeChild(directory, PMID_INDEX_FILE), "pmid");
  if (
    doiIndex.file.entries.length !== manifest.doi_key_count ||
    countReferences(doiIndex.file) !== manifest.doi_reference_count ||
    pmidIndex.file.entries.length !== manifest.pmid_key_count ||
    countReferences(pmidIndex.file) !== manifest.pmid_reference_count
  ) {
    throw snapshotFormatError("Retraction Watch index counts do not match the manifest");
  }
  const recordsPath = safeChild(directory, RECORDS_FILE);
  await verifyIndexReferentialIntegrity(
    recordsPath,
    manifest.row_count,
    doiIndex,
    pmidIndex,
  );
  return {
    manifest,
    manifestSha256: sha256(manifestBytes),
    recordsPath,
    doiIndex,
    pmidIndex,
  };
}

async function verifyIndexReferentialIntegrity(
  recordsPath: string,
  expectedRows: number,
  doiIndex: ParsedIndex,
  pmidIndex: ParsedIndex,
): Promise<void> {
  const expectedDoi = new Map<string, z.output<typeof indexReferenceSchema>[]>();
  const expectedPmid = new Map<string, z.output<typeof indexReferenceSchema>[]>();
  let rows = 0;
  for await (const line of scanNdjson(recordsPath)) {
    const record = normalizedRecordSchema.parse(JSON.parse(line.value.toString("utf8")));
    const reference = (role: "original" | "notice") =>
      indexReferenceSchema.parse({
        offset: line.offset,
        length: line.length,
        record_id: record.record_id,
        role,
      });
    addIdentifierReference(expectedDoi, record.original_doi, reference("original"));
    addIdentifierReference(expectedDoi, record.notice_doi, reference("notice"));
    addIdentifierReference(expectedPmid, record.original_pmid, reference("original"));
    addIdentifierReference(expectedPmid, record.notice_pmid, reference("notice"));
    rows += 1;
  }
  if (rows !== expectedRows) throw snapshotFormatError("Retraction Watch record count does not match the manifest");
  if (
    canonicalJson(createIndex("doi", expectedDoi)) !== canonicalJson(doiIndex.file) ||
    canonicalJson(createIndex("pmid", expectedPmid)) !== canonicalJson(pmidIndex.file)
  ) {
    throw snapshotFormatError("Retraction Watch identifier indexes do not match normalized records");
  }
}

async function* scanNdjson(path: string): AsyncGenerator<{
  offset: number;
  length: number;
  value: Buffer;
}> {
  let pending = Buffer.alloc(0);
  let pendingOffset = 0;
  for await (const rawChunk of createReadStream(path)) {
    const chunk = Buffer.from(rawChunk);
    pending = pending.byteLength === 0 ? chunk : Buffer.concat([pending, chunk]);
    let newline = pending.indexOf(0x0a);
    while (newline >= 0) {
      if (newline === 0) throw snapshotFormatError("Retraction Watch record file contains an empty line");
      const length = newline + 1;
      const value = pending.subarray(0, newline);
      yield { offset: pendingOffset, length, value };
      pending = pending.subarray(length);
      pendingOffset += length;
      newline = pending.indexOf(0x0a);
    }
    if (pending.byteLength > MAX_RECORD_BYTES) {
      throw snapshotFormatError("Retraction Watch normalized record exceeds the byte limit");
    }
  }
  if (pending.byteLength !== 0) {
    throw snapshotFormatError("Retraction Watch normalized record file is not newline terminated");
  }
}

async function readReferences(
  recordsPath: string,
  references: z.output<typeof indexReferenceSchema>[],
): Promise<Array<{
  reference: z.output<typeof indexReferenceSchema>;
  record: RetractionWatchNormalizedRecord;
}>> {
  if (references.length === 0) return [];
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(recordsPath, flags);
  try {
    const results = [];
    for (const reference of references) {
      const buffer = Buffer.alloc(reference.length);
      const result = await handle.read(buffer, 0, reference.length, reference.offset);
      if (result.bytesRead !== reference.length || buffer.at(-1) !== 0x0a) {
        throw snapshotFormatError("Retraction Watch record index points outside the verified record file");
      }
      const record = normalizedRecordSchema.parse(
        JSON.parse(buffer.subarray(0, -1).toString("utf8")),
      );
      if (record.record_id !== reference.record_id) {
        throw snapshotFormatError("Retraction Watch record index identity mismatch");
      }
      results.push({ reference, record });
    }
    return results;
  } finally {
    await handle.close();
  }
}

function eventsFromRecords(
  doi: string,
  records: RetractionWatchNormalizedRecord[],
): PublicationIntegrityEvent[] {
  const groups = new Map<string, {
    eventKind: RetractionWatchNormalizedRecord["event_kind"];
    eventDate: string | null;
    noticeDoi: string | null;
    reasons: string[];
    assertions: PublicationIntegrityAssertion[];
  }>();
  for (const record of records) {
    if (record.original_doi !== doi) continue;
    const assertionCore = {
      provider: "retraction_watch" as const,
      assertion_source: "retraction_watch" as const,
      raw_source: "Retraction Watch database via Crossref",
      relation_direction: "inbound" as const,
      provider_record_id: record.record_id,
      raw_relation_type: "RetractionNature",
      raw_type: record.raw_nature,
      raw_label: record.raw_nature,
      asserted_at: record.notice_date === null
        ? null
        : `${record.notice_date}T00:00:00.000Z`,
    };
    const assertion = {
      ...assertionCore,
      assertion_hash: sha256(Buffer.from(canonicalJson(assertionCore), "utf8")),
    } satisfies PublicationIntegrityAssertion;
    const key = canonicalJson({
      event_kind: record.event_kind,
      event_date: record.notice_date,
      original_doi: doi,
      notice_doi: record.notice_doi,
      reasons: record.reasons,
    });
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        eventKind: record.event_kind,
        eventDate: record.notice_date,
        noticeDoi: record.notice_doi,
        reasons: record.reasons,
        assertions: [assertion],
      });
    } else if (!existing.assertions.some(({ assertion_hash }) => assertion_hash === assertion.assertion_hash)) {
      existing.assertions.push(assertion);
    }
  }
  return [...groups.values()]
    .sort((left, right) => compareEventParts(left, right))
    .map((group, sequence) => {
      const assertions = group.assertions.sort((left, right) => left.assertion_hash.localeCompare(right.assertion_hash));
      const core = {
        sequence,
        event_kind: group.eventKind,
        event_date: group.eventDate,
        original_doi: doi,
        notice_doi: group.noticeDoi,
        reasons: group.reasons,
        assertions,
      };
      return publicationIntegrityEventSchema.parse({
        ...core,
        event_hash: sha256(Buffer.from(canonicalJson(core), "utf8")),
      });
    });
}

export function derivePublicationRecordState(
  events: PublicationIntegrityEvent[],
  queriedDoi: string,
): PublicationRecordState {
  const inbound = events.filter((event) =>
    event.original_doi === queriedDoi &&
    event.assertions.some((assertion) => assertion.relation_direction === "inbound")
  );
  if (inbound.length === 0) return "no_update_marker_found";
  const ordered = [...inbound].sort((left, right) => compareEventParts(
    {
      eventKind: left.event_kind,
      eventDate: left.event_date,
      noticeDoi: left.notice_doi,
    },
    {
      eventKind: right.event_kind,
      eventDate: right.event_date,
      noticeDoi: right.notice_doi,
    },
  ));
  if (ordered.some((event) => event.event_date === null) && ordered.length > 1) {
    return "state_uncertain";
  }
  const latestDate = ordered.at(-1)!.event_date;
  const latestKinds = new Set(
    ordered.filter((event) => event.event_date === latestDate).map((event) => event.event_kind),
  );
  if (latestKinds.size !== 1) return "state_uncertain";
  const kind = [...latestKinds][0]!;
  if (kind === "retraction" || kind === "withdrawal") return "active_retraction_or_withdrawal";
  if (kind === "expression_of_concern") return "expression_of_concern_recorded";
  if (kind === "correction") return "correction_recorded";
  if (kind === "update") return "update_recorded";
  if (kind === "reinstatement") return "reinstatement_recorded";
  return "other_update_recorded";
}

function normalizeRow(row: string[]): RetractionWatchNormalizedRecord {
  const value = Object.fromEntries(
    RETRACTION_WATCH_HEADERS.slice(0, -1).map((header, index) => [header, row[index] ?? ""]),
  ) as Record<(typeof RETRACTION_WATCH_HEADERS)[number], string>;
  if ((row.at(-1) ?? "") !== "") {
    throw snapshotFormatError("Retraction Watch trailing compatibility column must be empty");
  }
  const recordId = value["Record ID"].trim();
  if (!/^\d{1,20}$/u.test(recordId)) throw snapshotFormatError("Retraction Watch record ID is invalid");
  const title = boundedNullable(value.Title, "title");
  const notes = boundedNullable(value.Notes, "notes");
  const reasons = boundedList(value.Reason, "reasons", false);
  const urls = boundedList(value.URLS, "urls", true);
  const originalDoi = identifier(value.OriginalPaperDOI, normalizeDoiIdentifier);
  const noticeDoi = identifier(value.RetractionDOI, normalizeDoiIdentifier);
  const originalPmid = identifier(value.OriginalPaperPubMedID, normalizePmid);
  const noticePmid = identifier(value.RetractionPubMedID, normalizePmid);
  const rawNature = value.RetractionNature.trim();
  if (rawNature.length === 0 || rawNature.length > MAX_NORMALIZED_FIELD) {
    throw snapshotFormatError("Retraction Watch update nature is invalid");
  }
  return normalizedRecordSchema.parse({
    record_id: recordId,
    title: title.value,
    original_doi: originalDoi.normalized,
    original_doi_raw: originalDoi.raw,
    original_pmid: originalPmid.normalized,
    original_pmid_raw: originalPmid.raw,
    original_date: normalizeDate(value.OriginalPaperDate),
    notice_doi: noticeDoi.normalized,
    notice_doi_raw: noticeDoi.raw,
    notice_pmid: noticePmid.normalized,
    notice_pmid_raw: noticePmid.raw,
    notice_date: normalizeDate(value.RetractionDate),
    event_kind: eventKind(rawNature),
    raw_nature: rawNature,
    reasons: reasons.values,
    urls: urls.values,
    paywalled: normalizePaywall(value.Paywalled),
    notes: notes.value,
    truncated_fields: [
      ...(title.truncated ? ["title" as const] : []),
      ...(reasons.truncated ? ["reasons" as const] : []),
      ...(urls.truncated ? ["urls" as const] : []),
      ...(notes.truncated ? ["notes" as const] : []),
    ],
  });
}

function validateHeader(row: string[]): void {
  if (row.length !== RETRACTION_WATCH_HEADERS.length) {
    throw snapshotFormatError("Retraction Watch CSV header width changed");
  }
  const nonempty = row.filter((header) => header.length > 0);
  if (new Set(nonempty).size !== nonempty.length) {
    throw snapshotFormatError("Retraction Watch CSV contains duplicate headers");
  }
  if (canonicalJson(row) !== canonicalJson(RETRACTION_WATCH_HEADERS)) {
    throw snapshotFormatError("Retraction Watch CSV header schema changed");
  }
}

function identifier(
  rawValue: string,
  normalize: (value: string) => string | null | undefined,
): { raw: string | null; normalized: string | null } {
  const raw = rawValue.trim();
  if (raw === "" || /^(?:unavailable|0)$/iu.test(raw)) return { raw: null, normalized: null };
  if (raw.length > 2_048) throw snapshotFormatError("Retraction Watch identifier exceeds the byte limit");
  return { raw, normalized: normalize(raw) ?? null };
}

function normalizePmid(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d{1,12}$/u.test(normalized) || /^0+$/u.test(normalized)) return null;
  return normalized.replace(/^0+(?=\d)/u, "");
}

function normalizeDate(rawValue: string): string | null {
  const value = rawValue.trim();
  if (value === "") return null;
  const match = /^(?:(\d{1,2})\/(\d{1,2})\/(\d{4})|((?:16|17|18|19|20)\d{2})-(\d{1,2})-(\d{1,2}))(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/iu.exec(value);
  if (match === null) throw snapshotFormatError(`Unsupported Retraction Watch date ${value}`);
  const year = Number(match[3] ?? match[4]);
  const month = Number(match[1] ?? match[5]);
  const day = Number(match[2] ?? match[6]);
  if (match[7] !== undefined) {
    const hour = Number(match[7]);
    const minute = Number(match[8]);
    const second = Number(match[9] ?? "0");
    const meridiem = match[10]?.toUpperCase();
    if (
      minute > 59 ||
      second > 59 ||
      (meridiem === undefined ? hour > 23 : hour < 1 || hour > 12)
    ) {
      throw snapshotFormatError(`Impossible Retraction Watch date ${value}`);
    }
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw snapshotFormatError(`Impossible Retraction Watch date ${value}`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function eventKind(value: string): RetractionWatchNormalizedRecord["event_kind"] {
  const normalized = value.toLowerCase();
  if (/reinstat/u.test(normalized)) return "reinstatement";
  if (/withdraw/u.test(normalized)) return "withdrawal";
  if (/retract/u.test(normalized)) return "retraction";
  if (/expression[ _-]*of[ _-]*concern|concern/u.test(normalized)) return "expression_of_concern";
  if (/correct|errat/u.test(normalized)) return "correction";
  if (/update/u.test(normalized)) return "update";
  return "other";
}

function normalizePaywall(value: string): "yes" | "no" | "unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes") return "yes";
  if (normalized === "no") return "no";
  return "unknown";
}

function boundedNullable(
  value: string,
  _field: "title" | "notes",
): { value: string | null; truncated: boolean } {
  const normalized = value.trim();
  if (normalized === "") return { value: null, truncated: false };
  return {
    value: normalized.slice(0, MAX_NORMALIZED_FIELD),
    truncated: normalized.length > MAX_NORMALIZED_FIELD,
  };
}

function boundedList(
  value: string,
  _field: "reasons" | "urls",
  urls: boolean,
): { values: string[]; truncated: boolean } {
  const all = [...new Set(value.split(";").map((item) => item.trim()).filter(Boolean))];
  const accepted: string[] = [];
  let truncated = all.length > MAX_LIST_ITEMS;
  for (const item of all.slice(0, MAX_LIST_ITEMS)) {
    const bounded = item.slice(0, MAX_NORMALIZED_FIELD);
    if (item.length > MAX_NORMALIZED_FIELD) truncated = true;
    if (urls && !z.url().max(MAX_NORMALIZED_FIELD).safeParse(bounded).success) {
      truncated = true;
      continue;
    }
    accepted.push(bounded);
  }
  return { values: accepted.sort(), truncated };
}

function addIdentifierReference(
  target: Map<string, z.output<typeof indexReferenceSchema>[]>,
  identifierValue: string | null,
  reference: z.output<typeof indexReferenceSchema>,
): void {
  if (identifierValue === null) return;
  const references = target.get(identifierValue) ?? [];
  if (!references.some((item) => canonicalJson(item) === canonicalJson(reference))) {
    references.push(reference);
  }
  target.set(identifierValue, references);
}

function createIndex(
  name: "doi" | "pmid",
  source: Map<string, z.output<typeof indexReferenceSchema>[]>,
): z.output<typeof snapshotIndexSchema> {
  return snapshotIndexSchema.parse({
    index_name: name,
    index_version: SNAPSHOT_SCHEMA_VERSION,
    entries: [...source.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([identifierValue, references]) => [
        identifierValue,
        references.sort((left, right) =>
          left.offset - right.offset || left.role.localeCompare(right.role)
        ),
      ]),
  });
}

function countReferences(index: z.output<typeof snapshotIndexSchema>): number {
  return index.entries.reduce((count, [, references]) => count + references.length, 0);
}

async function readIndex(path: string, expectedName: "doi" | "pmid"): Promise<ParsedIndex> {
  const bytes = await readBoundedRegularFile(path, MAX_INDEX_BYTES);
  const file = snapshotIndexSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (file.index_name !== expectedName) throw snapshotFormatError("Retraction Watch index kind mismatch");
  const map = new Map<string, z.output<typeof indexReferenceSchema>[]>();
  let previous: string | undefined;
  for (const [identifierValue, references] of file.entries) {
    if (previous !== undefined && identifierValue.localeCompare(previous) <= 0) {
      throw snapshotFormatError("Retraction Watch index identifiers are duplicated or unsorted");
    }
    previous = identifierValue;
    map.set(identifierValue, references);
  }
  return { map, file };
}

async function verifyRegularFile(path: string, maxBytes: number): Promise<{ bytes: number; sha256: string }> {
  await rejectSymlink(path, "Retraction Watch file");
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > maxBytes) {
    throw snapshotFormatError("Retraction Watch file type or size is invalid");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw snapshotFormatError("Retraction Watch file exceeds the byte limit");
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function readBoundedRegularFile(path: string, maxBytes: number): Promise<Buffer> {
  const identity = await verifyRegularFile(path, maxBytes);
  const bytes = await readFile(path);
  if (bytes.byteLength !== identity.bytes || sha256(bytes) !== identity.sha256) {
    throw snapshotFormatError("Retraction Watch file changed while being read");
  }
  return bytes;
}

async function verifiedDirectory(path: string, label: string): Promise<string> {
  if (!isAbsolute(path) || resolve(path) === sep) {
    throw snapshotFormatError(`${label} path is unsafe`);
  }
  await rejectSymlink(path, label);
  const metadata = await stat(path);
  if (!metadata.isDirectory()) throw snapshotFormatError(`${label} is not a directory`);
  return realpath(path);
}

async function ensureOwnedRoot(path: string): Promise<string> {
  if (!isAbsolute(path) || resolve(path) === sep) throw snapshotFormatError("Retraction Watch root path is unsafe");
  await mkdir(path, { recursive: true, mode: 0o700 });
  return verifiedDirectory(path, "Retraction Watch root directory");
}

async function existingOwnedRoot(path: string): Promise<string> {
  return verifiedDirectory(path, "Retraction Watch root directory");
}

async function rejectSymlink(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) throw snapshotFormatError(`${label} cannot be a symbolic link`);
}

function safeChild(parent: string, file: string): string {
  if (basename(file) !== file || file.includes("..")) throw snapshotFormatError("Unsafe Retraction Watch child path");
  const child = resolve(parent, file);
  if (!child.startsWith(`${resolve(parent)}${sep}`)) throw snapshotFormatError("Retraction Watch path escaped its root");
  return child;
}

function snapshotPath(snapshots: string, snapshotId: string): string {
  return safeChild(snapshots, snapshotIdSchema.parse(snapshotId));
}

async function readOptionalPointer(root: string): Promise<RetractionWatchSnapshotPointer | null> {
  const path = safeChild(root, POINTER_FILE);
  try {
    return await readPointer(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function readRequiredPointer(root: string): Promise<RetractionWatchSnapshotPointer> {
  try {
    return await readPointer(safeChild(root, POINTER_FILE));
  } catch (error) {
    if (isMissing(error)) {
      throw new RetractionWatchSnapshotError(
        "retraction_watch_snapshot_not_configured",
        false,
        "No active verified Retraction Watch snapshot is configured",
      );
    }
    throw error;
  }
}

async function readPointer(path: string): Promise<RetractionWatchSnapshotPointer> {
  const bytes = await readBoundedRegularFile(path, MAX_POINTER_BYTES);
  return retractionWatchSnapshotPointerSchema.parse(JSON.parse(bytes.toString("utf8")));
}

async function writePointerAtomically(
  root: string,
  pointer: RetractionWatchSnapshotPointer,
): Promise<void> {
  const bytes = Buffer.from(`${canonicalJson(pointer)}\n`, "utf8");
  const temporary = safeChild(root, `.active-${process.pid}-${Date.now()}.tmp`);
  const destination = safeChild(root, POINTER_FILE);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    await syncDirectory(root);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function pruneSnapshotDirectories(
  snapshotsRoot: string,
  retainedSnapshotIds: ReadonlySet<string>,
): Promise<void> {
  const entries = await readdir(snapshotsRoot, { withFileTypes: true });
  let removed = false;
  for (const entry of entries) {
    if (!snapshotIdSchema.safeParse(entry.name).success) continue;
    if (retainedSnapshotIds.has(entry.name)) continue;
    const path = snapshotPath(snapshotsRoot, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw snapshotFormatError("Retraction Watch snapshot generation is not a real directory");
    }
    await rm(path, { recursive: true, force: false });
    removed = true;
  }
  if (removed) await syncDirectory(snapshotsRoot);
}

async function writeExclusive(path: string, bytes: Buffer): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function waitForStreamClose(stream: {
  closed?: boolean;
  once(event: "close", listener: () => void): unknown;
}): Promise<void> {
  if (stream.closed === true) return;
  await new Promise<void>((resolveClose) => {
    stream.once("close", resolveClose);
  });
}

function parseBuildInput(input: BuildRetractionWatchSnapshotInput): BuildRetractionWatchSnapshotInput {
  const parsed = z
    .object({
      csvPath: z.string().min(1),
      snapshotDirectory: z.string().min(1),
      source: z
        .object({
          sourceCommit: commitSchema,
          sourceCommittedAt: timestampSchema,
          sourceFileSha256: sha256Schema,
          sourceFileBytes: z.number().int().positive().max(MAX_SOURCE_BYTES),
          syncedAt: timestampSchema,
        })
        .strict(),
    })
    .strict()
    .parse(input);
  if (!isAbsolute(parsed.csvPath) || !isAbsolute(parsed.snapshotDirectory)) {
    throw snapshotFormatError("Retraction Watch build paths must be absolute");
  }
  return parsed;
}

function parseInstallInput(input: InstallRetractionWatchSnapshotInput): InstallRetractionWatchSnapshotInput {
  const parsed = z
    .object({
      rootDirectory: z.string().min(1),
      builtSnapshotDirectory: z.string().min(1),
      sourceCheckedAt: timestampSchema,
      now: z.function().optional(),
    })
    .strict()
    .parse(input);
  if (!isAbsolute(parsed.rootDirectory) || !isAbsolute(parsed.builtSnapshotDirectory)) {
    throw snapshotFormatError("Retraction Watch install paths must be absolute");
  }
  return input;
}

function parseLoadInput(input: LoadRetractionWatchSnapshotInput): LoadRetractionWatchSnapshotInput {
  const parsed = z
    .object({
      rootDirectory: z.string().min(1),
      maxAgeMs: z.number().int().positive().max(365 * 24 * 60 * 60 * 1_000),
      now: z.function().optional(),
    })
    .strict()
    .parse(input);
  if (!isAbsolute(parsed.rootDirectory)) throw snapshotFormatError("Retraction Watch root path must be absolute");
  return input;
}

function snapshotIdentifier(core: Record<string, string>): string {
  return `${SNAPSHOT_PREFIX}${sha256(Buffer.from(canonicalJson(core), "utf8"))}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function validNow(now: (() => Date) | undefined): Date {
  const value = (now ?? (() => new Date()))();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw snapshotFormatError("Retraction Watch clock is invalid");
  }
  return value;
}

function compareEventParts(
  left: { eventDate: string | null; eventKind: string; noticeDoi: string | null },
  right: { eventDate: string | null; eventKind: string; noticeDoi: string | null },
): number {
  if (left.eventDate === null && right.eventDate !== null) return 1;
  if (left.eventDate !== null && right.eventDate === null) return -1;
  return (left.eventDate ?? "").localeCompare(right.eventDate ?? "") ||
    left.eventKind.localeCompare(right.eventKind) ||
    (left.noticeDoi ?? "").localeCompare(right.noticeDoi ?? "");
}

function numericStringCompare(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : left.localeCompare(right);
}

function snapshotFormatError(message: string): RetractionWatchSnapshotError {
  return new RetractionWatchSnapshotError(
    "retraction_watch_snapshot_invalid",
    false,
    message,
  );
}

function providerFetchError(status: number, message: string): RetractionWatchSnapshotError {
  if (status === 429 || status >= 500) {
    return new RetractionWatchSnapshotError(
      status === 429 ? "retraction_watch_rate_limited" : "retraction_watch_upstream_unavailable",
      true,
      message,
    );
  }
  return new RetractionWatchSnapshotError(
    "retraction_watch_access_failed",
    false,
    message,
  );
}

function normalizeSnapshotError(error: unknown): RetractionWatchSnapshotError {
  if (error instanceof RetractionWatchSnapshotError) return error;
  const providerCode = (error as { code?: unknown } | null)?.code;
  if (
    error instanceof z.ZodError ||
    (typeof providerCode === "string" && providerCode.startsWith("CSV_"))
  ) {
    return snapshotFormatError("Retraction Watch source or snapshot schema is malformed");
  }
  return new RetractionWatchSnapshotError(
    "retraction_watch_snapshot_operation_failed",
    true,
    error instanceof Error ? error.message : "Retraction Watch snapshot operation failed",
  );
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

async function boundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    throw snapshotFormatError("Retraction Watch provider metadata response is oversized");
  }
  return JSON.parse(text);
}

function lookupErrorEnvelope(
  doi: string | null,
  manifest: RetractionWatchSnapshotManifest,
  pointer: RetractionWatchSnapshotPointer,
  freshnessStatus: "current" | "stale",
  code: string,
  retryable: boolean,
): ProvenanceEnvelope<RetractionWatchPublicationIntegrityData> {
  const accessStatus: AccessStatus = retryable ? "error" : "inaccessible";
  return errorEnvelope<RetractionWatchPublicationIntegrityData>({
    provider: "retraction_watch",
    recordType: "publication_integrity",
    ...(doi === null ? {} : { primaryIdentifier: doi }),
    retrievedAt: pointer.source_checked_at,
    accessStatus,
    code,
    message: "Verified local Retraction Watch snapshot lookup failed",
    retryable,
    limitations: ["Retraction Watch coverage is unavailable for this lookup; no favorable or unfavorable inference is permitted."],
    data: {
      doi,
      lookup_status: "no_match_in_provider",
      record_state: "state_uncertain",
      events: [],
      snapshot_id: manifest.snapshot_id,
      source_commit: manifest.source_commit,
      source_file_sha256: manifest.source_file_sha256,
      source_checked_at: pointer.source_checked_at,
      freshness_status: freshnessStatus,
      matched_record_ids: [],
      notice_only_record_ids: [],
    },
  }) as ProvenanceEnvelope<RetractionWatchPublicationIntegrityData>;
}
