# Execution-control Phase D4 implementation plan

**Status:** implementation candidate

**Branch:** `agent/execution-control-phase-d4-20260824`

**Baseline:** `4bb6203951d9bf0f5ef701c7bdca7645ab8134d7`

**Roadmap phase:** D4 — Retraction Watch verified local snapshot

## Objective

Add a controlled, deterministic path that can acquire the official Crossref
Retraction Watch CSV outside a user request, transform it into a compact local
snapshot, verify every activated snapshot and index against a manifest, and
make exact DOI/PMID lookups available to the existing external-evidence
coordinator when—and only when—a verified snapshot is explicitly configured.

This phase implements the storage format, sync/verification machinery, local
reader, controller composition, and hostile tests. It does **not** activate a
production snapshot directory, add a cron trigger, download or commit the real
dataset, change retention, widen the ordinary upstream HTTP allowlist, add a
public operation, deploy a new runtime, or change the Custom GPT/plugin.
Production activation remains the Phase G owner/privacy decision required by
the roadmap.

## Authority and current-state reconciliation

- Current owner instructions require server-owned completion state, deep
  study auditing, automatic Gemini discovery, no generic design/prestige
  shortcut, and no manual Spark handoff.
- Canonical HRP and Universal bytes remain unchanged in this phase.
- Phase D3 is merged at the baseline above. Its coordinator already owns
  Crossref/FORRT execution, receipts, provider artifacts, publication-event
  work, linked-source work, and claim recalculation.
- Retraction Watch is currently represented honestly as `not_configured`.
  D4 must replace that gap only when a verified local snapshot is supplied;
  caller assertions can never do so.
- The official source is the Crossref GitLab repository
  `https://gitlab.com/crossref/retraction-watch-data`. Current Crossref
  documentation identifies it as the production full-dataset source and says
  it is updated each working day. The legacy Labs endpoint is out of date.
- The live CSV currently has the 20 documented headers plus one trailing empty
  header/cell. That exact upstream representation will be recorded and
  accepted; missing, reordered, duplicated, additional, or non-terminal blank
  headers will fail closed.

## Design

### 1. Fixed-source controlled sync

Create `scripts/sync-retraction-watch.mts` and a reusable source module. The
production sync path will:

1. query only the fixed Crossref GitLab project/ref/path for the latest commit;
2. download the CSV from the exact returned 40-hex commit, not a moving branch;
3. bound response size and time, hash the exact source bytes with SHA-256, and
   record commit, commit time, source path, byte count, and retrieval time;
4. parse through pinned `csv-parse` streaming mode with strict quoting and
   column-count behavior;
5. reject malformed header topology, malformed rows, duplicate record IDs,
   oversized fields/collections, impossible dates, and unsafe output paths;
6. preserve imperfect or unavailable DOI/PMID values as unindexed metadata
   rather than inventing an identity or aborting on documented sentinels;
7. write normalized records plus compact DOI/PMID offset indexes into a staging
   snapshot; and
8. verify the complete staging snapshot before atomic activation.

The script accepts only an output root and bounded freshness policy. It does
not accept a caller-supplied URL, provider host, repository, branch, or source
file. Tests call lower-level injected local streams rather than adding a
production source override.

### 2. Snapshot representation and verification

Each immutable snapshot directory contains:

- `manifest.json` with schema version, snapshot ID, exact source repository,
  source commit and commit time, source file/path/SHA-256/bytes, exact header
  schema and hash, parsed and indexed counts, generated-file names/hashes/bytes,
  and sync time;
- `records.ndjson` with bounded normalized integrity records;
- `doi-index.json` and `pmid-index.json` mapping canonical identifiers to
  role-aware byte-offset references in the normalized record file.

The normalized record retains only public fields needed for integrity work:
record ID, original/notice identifiers and dates, title, update nature,
reasons, relevant URLs, paywall flag, and bounded notes. It does not retain the
raw 62 MB CSV after installation.

The activation root contains an atomically replaced bounded pointer recording
the current snapshot, previous verified snapshot, exact manifest hash, and
last successful source-check time. Snapshot IDs and paths are strictly
validated; symlinked control/data files are rejected. Runtime loading verifies
the pointer, manifest, every generated-file hash/size/count, all offsets, all
index roles, and referential consistency before returning a reader.

### 3. Atomic activation, rollback, and staleness

- Build under an owned temporary sibling and rename the verified immutable
  snapshot into place.
- Replace the activation pointer using same-directory temporary write,
  fsync/close, and rename.
- Preserve the prior active snapshot in the pointer.
- Provide a rollback operation that first verifies the previous snapshot and
  then atomically swaps current/previous. A corrupt previous snapshot cannot be
  activated.
- Rechecking the same source commit/content may refresh only the local checked
  time after verifying the existing immutable snapshot.
- Runtime exposes `current` versus `stale` from the local checked time and a
  configured maximum age. A stale snapshot remains an explicit partial
  coverage boundary. A stale no-match is never converted to favorable evidence.
- Failed sync or failed activation leaves the prior active pointer unchanged.

No automatic deletion or durable retention policy is added in D4. The active
and previous snapshot directories are bounded by the pointer, while pruning
and production retention remain Phase G work.

### 4. Existing coordinator integration

Extend, rather than duplicate, the Phase D2/D3 coordinator:

- add an optional server-injected verified Retraction Watch lookup;
- when absent, preserve the existing `not_configured` provider attempt;
- when present, execute it for the exact Crossref-verified DOI and store its
  normalized envelope in the existing bounded artifact store;
- bind its snapshot ID, access state, response hash, and limitations into the
  existing signed external-evidence receipt;
- merge independent Crossref and Retraction Watch assertions into ordered
  publication events without destroying provenance or falsely treating a
  notice DOI as the queried original;
- derive publication state from the combined exact event history;
- make configured retryable failure block retryably, nonretryable failure
  bounded, and stale coverage partial;
- require notice/claim restrictions from Retraction Watch events through the
  same existing directive and claim-recalculation path.

No client-supplied provider result, snapshot ID, event, count, path, or
completion assertion is accepted.

### 5. Verification

Add hostile tests covering at minimum:

- RFC-style commas, quotes, CRLF, and embedded newlines;
- exact live trailing-empty-header compatibility;
- missing, reordered, duplicate, extra, and non-terminal empty headers;
- malformed/oversized rows and duplicate record IDs;
- DOI/PMID normalization, sentinels, duplicate event keys, and role-aware
  indexes;
- source/file/index/manifest/pointer tampering and symlink/path traversal;
- atomic failure preserving the previous active snapshot;
- verified rollback and refusal of corrupt rollback;
- current/stale behavior and stale no-match limitations;
- configured provider execution versus unconfigured disclosure;
- forged caller snapshot/provider/completion fields rejected;
- combined Crossref/Retraction Watch ordering and provenance;
- retraction, correction, expression of concern, and reinstatement cannot be
  dropped from finalization-relevant state;
- retryable/partial/nonretryable snapshot outcomes cannot unlock stronger
  claim capability;
- public MCP remains 21 tools and Actions remain 26.

Use focused tests during implementation, then one merge-ready
`npm run test:run` and one `npm run verify`, avoiding unchanged-state duplicate
full runs. Record test-efficiency telemetry using the current universal
observer from an isolated universal repository checkout.

## Files expected to change

- `packages/sources/src/retraction-watch-snapshot.ts` (new)
- `packages/sources/src/index.ts`
- `packages/sources/package.json`
- `package-lock.json`
- `scripts/sync-retraction-watch.mts` (new)
- `package.json`
- `apps/research-mcp/src/actions/study-external-evidence.ts`
- `apps/research-mcp/src/index.ts`
- focused snapshot/coordinator tests and fixtures
- roadmap, current-state, source/privacy/index documentation

## Exit criteria

- A fixture snapshot can be synced, fully verified, looked up, atomically
  replaced, rolled back, and rejected when stale/corrupt/tampered.
- The existing coordinator can consume only a verified injected local snapshot
  and its receipt proves the exact snapshot/provider execution.
- Unconfigured production behavior remains unchanged and explicit.
- No real snapshot, cron, production directory, new retention policy, provider
  host allowlist, public tool, protocol, Custom GPT, plugin, or deployment
  change lands.
- Focused and full deterministic gates, hosted CI, PR review, and merge pass.
