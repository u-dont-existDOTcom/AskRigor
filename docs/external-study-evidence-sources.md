# External study-evidence source boundaries

Status at 2026-08-24: internal Phase D4 source candidate over the merged Phase
D3 session integration. It is not registered as a public MCP tool or Custom
GPT Action and cannot authorize final synthesis or finalization. The verified
Retraction Watch local-snapshot path is implemented but not activated,
scheduled, retained, or deployed; those production decisions remain Phase G.

## Crossref publication-integrity metadata

The existing Crossref adapter now has an internal rich lookup that preserves an
ordered history of publisher- or Retraction-Watch-attributed Crossmark
assertions. Supported normalized event kinds are retraction, withdrawal,
expression of concern, correction, update, reinstatement, and other. Each event
keeps the original and notice DOI roles, inbound or outbound direction, raw
type and label, date, reasons, provider record ID when supplied, source, and
deterministic hashes. Duplicate assertions are removed without merging away
distinct sources.

This is metadata about publication updates, not a study-quality judgment. A
successful response with no marker means only `no_update_marker_found` in the
checked Crossref record. It does not mean clean, valid, unretracted everywhere,
reproducible, or methodologically sound. Conflicting current assertions produce
an uncertain state. Retrieval failure, denial, rate limiting, and missing
records remain distinct from a successful no-marker result.

The existing public backward-compatible retraction lookup retains its prior
payload shape. The richer event history is internal.

## FORRT FLoRA replication relationships

The internal FORRT adapter accepts one canonical public DOI and calls only:

`https://rep-api.forrt.org/v1/original-lookup?dois=<doi>`

It has no caller-supplied base URL, credentials, arbitrary path, or batch input.
Only the exact `rep-api.forrt.org` hostname was added to the HTTPS allowlist.
The adapter normalizes forward replications, forward reproductions, and reverse
links to originals. It retains the provider's raw outcome wording and maps only
explicit supported values to `successful`, `failed`, `mixed`, or `unclear`;
anything else is `not_reported`.

Every linked relationship remains marked as not yet implementation-matched and
not yet source-audited. A FORRT outcome is therefore a lead to inspect, not a
verified replication verdict. A successful null result means only
`no_match_in_provider`; it does not establish that no replication or
reproduction exists. Partial, malformed, inaccessible, rate-limited, missing,
and failed responses remain separate states.

FLoRA-derived records preserve this attribution:

- Dataset: FORRT Library of Replication Attempts (FLoRA)
- Dataset DOI: `10.17605/OSF.IO/9R62X`
- License: CC BY 4.0
- Project: `https://forrt.org/fred/`

AskRigor stores no FORRT credential because the verified endpoint is public.
The adapter sends only the requested public DOI and fixed content negotiation
and user-agent headers. Raw provider bodies are not returned on errors.

## Shared contract boundary

`packages/contracts/src/study-external-evidence.ts` defines strict, bounded
records for later controller work: canonical identities, provider attempts,
publication events, replication/reproduction relationships, post-publication
threads, citation-context aggregates, review ancestry, result-specific
risk-of-bias imports, controller directives, unresolved items, and claim-local
limitations.

The contract deliberately has no global scientific, validity, reliability,
quality, or replication-verification score. Publication status, methods,
replication implementation match, result-specific bias, applicability, and
source access remain separate questions. Phase D3 connects these records to
the existing unregistered server-owned execution state without turning a
provider label into a scientific conclusion.

## Internal composite coordinator and receipt

The Phase D2 coordinator accepts only an authoritative internal research-
session ID and one DOI. Server construction supplies the exact current
Universal/HRP manifests, fixed Crossref configuration, provider executors,
clock, artifact store, signing secret, and nonsecret key ID. A caller cannot
submit provider lists, completion flags, counts, identities, directives,
limitations, hashes, or receipt fields.

The coordinator canonicalizes the DOI and requires an exact successful
Crossref identity before invoking FORRT. Crossref identity failure stops before
FORRT and creates no signed audit. After verified identity, the server runs
both mandatory open providers. It records explicit `not_configured` coverage
for Retraction Watch, PubPeer, Epistemonikos, and Scite when they are absent.
When a verified Retraction Watch reader is server-injected, the coordinator
must execute it, binds its exact snapshot ID and normalized artifact, and no
longer emits the Retraction Watch configuration gap. Retryable, partial/stale,
inaccessible, nonretryable, no-match, and successful provider states remain
distinct.

The normalized bundle derives notice-audit, prior-audit invalidation, active-
retraction exclusion, linked-repetition acquisition, and provider-gap
directives. Independent Crossref and Retraction Watch assertions are merged
into one ordered history without destroying provider provenance. Every FORRT
relationship remains a provider-reported lead with implementation and linked-
source audit still pending. Historical retraction followed by reinstatement
retains the history and notice work without being misrepresented as a
currently active retraction.

## Retraction Watch verified local snapshot

The Phase D4 implementation uses only Crossref's fixed public GitLab project
and pins every CSV download to the exact commit returned for
`retraction_watch.csv`. The sync is an operator command, never a user-request
fetch, and does not add GitLab to the ordinary source HTTP allowlist.

Pinned `csv-parse` streaming handles quoted commas, CRLF, doubled quotes, and
embedded newlines. The accepted schema records the 20 documented fields plus
the live file's terminal empty compatibility column. Missing, reordered,
duplicated, extra, or non-terminal blank headers fail closed. The builder
records exact source commit/file SHA-256/header hash/row count/sync time and
creates bounded normalized records plus role-aware DOI and PMID indexes.

Runtime loading verifies the atomic activation pointer, exact manifest,
generated-file hashes/sizes/counts, every record offset, and complete index
reconstruction before lookup. Stale snapshots are partial coverage; no-match
is provider-scoped. The explicit rollback path verifies the prior immutable
snapshot before atomically swapping the pointer. See
`docs/retraction-watch-snapshot.md` for the format and activation boundary.

The server-issued HMAC-SHA256 receipt is bound to the exact session, canonical
study identity hash, Universal/HRP identities and hashes, complete provider
attempts, provider artifact IDs/content hashes, normalized bundle hash, issue
time, and key ID. Verification rejects changed studies, sessions, protocols,
bundles, artifacts, payloads, signatures, and secrets. This proves structural
execution/provenance and tamper resistance; it does not prove that provider
assertions or AskRigor interpretations are scientifically true.

## Evidence artifacts and method-audit binding

`EvidenceArtifactStore` is a content-addressed abstraction. Its Phase D2
implementation is bounded process memory only: at most 128 entries, 10 MiB per
artifact, and 32 MiB total by default. It clones bytes on write/read,
deduplicates exact artifacts, supports explicit revocation, and writes no disk,
database, object store, log, or portable token. The coordinator currently
stores only strict normalized Crossref and FORRT envelopes. Portable receipts
contain artifact IDs, hashes, provider identities, kinds, and byte counts—not
the artifact bodies or signing secret.

The existing public method-audit submission and receipt remain unchanged. A
separate internal schema permits typed external references only in the
`replication_contradiction_and_evidence_ancestry` domain. Each reference is
bound to the signed external receipt, exact study identity, provider, item kind,
and item hash. All other domains retain real acquired-document block
requirements, and invented `jats_*` or `pdf_*` blocks still fail. Provider-
reported relationships remain source-linked leads until the linked work's
implementation, methods, and result are separately audited.

## Phase D3 controller enforcement

Completed candidate screening creates exact program/outcome formal hypotheses,
and the server executes PubMed and Europe PMC searches for each. Returned
public identities are screened under one exact frontier receipt. Every selected
DOI then reuses the existing open-full-text continuation and method-audit
validators; the session records hashes, counts, source/version identity, and
opaque handles rather than publication text.

After an exact study method audit, the server-owned coordinator schedules
Crossref and FORRT automatically for that DOI. The session accepts only the
signed current-session/current-protocol result and projects compact attempt,
bundle, directive, limitation, and linked-source hashes. Retryable provider
failure remains executable; nonretryable or partial coverage stays claim-local
and can never be recalculated into unrestricted use.

Exact linked replications, reproductions, reviews, and publication notices
become decision-important sources in the same acquisition/audit pipeline. A
new linked source may reopen a previously completed downstream operation,
because evidence can create required work; a caller-authored operation change
without the corresponding source state is rejected. An active retraction
excludes ordinary effect use. Other completed external checks, including a
provider-scoped no-match result, require a new study-method receipt bound to
the exact signed external bundle and every controller-required external item
or coverage gap before claim capability becomes current.

## Storage, activation, and verification

Phases D2-D4 add no database, durable production artifact store, public
operation, provider credential, deployment setting, or production provider
call. D4 adds a controlled operator sync command and local snapshot format but
does not run it against the real dataset or select a production directory,
retention policy, pruning policy, schedule, or configuration binding. Phase
D3's only session connection remains the bounded, in-memory, unregistered
prototype. Hermetic tests cover strict input, exact-source/header validation,
atomic activation/rollback/staleness, snapshot/index tampering, identity
failure, normalized provider states, directives, deterministic hashes,
artifact bounds, signed-receipt tampering/cross-context rejection, and typed
method-audit references. Public inventories remain 21 MCP tools and 26 Actions.
