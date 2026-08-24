# Retraction Watch verified snapshot

Status at 2026-08-24: Phase D4 source candidate. The format, parser, verifier,
reader, coordinator composition, and controlled operator command exist only in
source. No production snapshot directory, schedule, retention policy, or
deployment is activated. That remains the Phase G owner/privacy decision.

## Official source

AskRigor accepts only Crossref's public GitLab repository:

`https://gitlab.com/crossref/retraction-watch-data`

Crossref identifies this repository as the production full-dataset source and
says it is updated each working day. The old Labs endpoint is explicitly out of
date and is not used. The controlled sync resolves the latest commit affecting
`retraction_watch.csv`, then downloads that file from the exact returned commit.
It does not accept an operator- or user-supplied repository, host, branch, URL,
or file name.

The fixed provider endpoints are used only by the operator sync command. They
are deliberately absent from the ordinary user-request upstream allowlist, so
a research request cannot trigger a 62 MB dataset fetch.

## Source validation

The exact live source representation currently contains Crossref's 20
documented columns plus one trailing empty compatibility column. The parser
records that complete header topology and rejects missing, reordered,
duplicated, additional, or non-terminal blank headers. CSV parsing uses pinned
`csv-parse` streaming mode so commas, CRLF, doubled quotes, and quoted embedded
newlines are handled without loading the complete raw file into a hand-written
splitter.

The sync also fails closed on malformed/oversized records, duplicate Retraction
Watch record IDs, impossible dates, unsafe paths, or a changed exact source
identity. Documented missing-identifier sentinels such as blank, `unavailable`,
and PMID `0` remain unindexed public metadata; they are not invented identities
and do not abort otherwise valid source ingestion. Invalid non-sentinel
original identifiers are counted in the manifest. The parser narrowly accepts
the provider's documented record 18930 timestamp outlier
`6/24/1756 12:00:00 AM` while still validating calendar dates and clock fields;
it does not loosen date parsing to arbitrary text.

## Snapshot files

Every immutable `rws1_<sha256>` directory contains:

- `manifest.json`: exact source repository/ref/commit/commit time/path,
  source-file SHA-256 and byte count, exact header/schema hash, row/index/
  truncation/invalid-identifier counts, sync time, and every generated-file
  hash and byte count;
- `records.ndjson`: bounded normalized public integrity records;
- `doi-index.json`: canonical DOI to role-aware record byte offsets; and
- `pmid-index.json`: normalized PMID to role-aware record byte offsets.

Roles distinguish original works from update notices. A DOI that appears only
as a notice for another record is disclosed but is not incorrectly applied as
an integrity event to the notice DOI itself.

The runtime reader accepts only an activation pointer, exact manifest, and all
three hash/size/count-verified files. It re-derives the snapshot ID, scans the
record file, reconstructs both indexes, verifies every byte offset and role,
rejects symlinks/path escape, and only then exposes lookup methods. DOI/PMID
lookup returns provider-scoped metadata and explicit no-match/stale boundaries,
never a `clean`, valid, reliable, unretracted-everywhere, or scientific-quality
claim.

## Atomic activation and rollback

The controlled command is:

```text
npm run sync:retraction-watch -- --root /explicit/absolute/operator/path
```

It downloads into a private temporary directory, builds and fully verifies an
immutable candidate in a private staging directory inside the activation root,
renames that candidate on the same filesystem into the root's `snapshots/`
directory, and atomically replaces the small `active.json` pointer only after
successful verification. The pointer keeps the exact current and previous
snapshot/manifest hashes plus the source-check time bound to each snapshot and
the activation time. A failed
download, parse, build, verification, or activation attempt leaves the prior
active pointer unchanged.

Rollback is explicit:

```text
npm run sync:retraction-watch -- --root /explicit/absolute/operator/path --rollback
```

The previous snapshot is completely reverified before the pointer is swapped.
A missing or corrupt previous snapshot cannot be activated. Rollback also
restores that snapshot's own source-check time; it cannot make older data look
fresh by retaining the replaced snapshot's later check time.

The reader requires a server-configured maximum age. Older snapshots return
partial coverage even when a key is found, and stale no-match is never
converted into favorable evidence. Rechecking unchanged exact source bytes can
refresh the checked time only after the existing immutable snapshot verifies.

## Coordinator boundary

The existing server-owned external-study evidence coordinator may receive a
verified snapshot lookup at server construction. When absent, Retraction Watch
remains the existing explicit `not_configured` coverage gap. When present, the
coordinator executes the exact DOI lookup itself, stores the normalized
provider envelope in the existing bounded in-memory artifact store, and binds
the snapshot ID, provider attempt, artifact hash, publication events,
directives, limitations, and final bundle into the existing signed receipt.

Configured stale/retryable/nonretryable state yields partial, retryable-blocked,
or bounded output respectively. Retraction, correction, expression-of-concern,
and reinstatement assertions enter the same notice-audit and claim-capability
pipeline as independent Crossref assertions. A signed structural receipt still
does not prove that either provider assertion is scientifically true.

## Production and privacy gate

D4 intentionally does not:

- run the command against the real full dataset;
- choose a production filesystem, object store, volume, or retention period;
- prune snapshots;
- install a cron or other scheduler;
- add an environment/configuration binding;
- deploy the code;
- expose a new public MCP or Action operation; or
- change protocols, Custom GPT Instructions, or plugin bytes.

Phase G must choose and review minimum retained files, active/previous
retention, deletion/pruning, backup/rollback, permissions, stale/failed-sync
operations, threat model, and deployment topology before production
activation. The roadmap recommends a daily verified snapshot but does not make
that storage decision automatically.

## Provider provenance

- Crossref production source notice:
  `https://www.crossref.org/labs/retraction-watch/`
- Crossref data repository:
  `https://gitlab.com/crossref/retraction-watch-data`
- Crossref delivery announcement:
  `https://community.crossref.org/t/changes-to-delivery-of-retraction-watch-metadata/12368`

Crossref describes the Retraction Watch database as publicly available and its
site content as CC BY 4.0. Provider records remain attributed public metadata;
AskRigor's software license does not relicense upstream data.
