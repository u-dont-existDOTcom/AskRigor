# Phase G resumability and privacy implementation plan

Status: owner delegated the proportionate implementation decision on
2026-08-24; decisions A and C are approved and locally verified

Branch: `agent/execution-control-phase-g-20260824`

Base: `5714ae44aa93b661a7b98b53b8b1f1dafef207da` (merged Phase F)

Roadmap authority:
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`

## Objective

Make a long-running research execution survive an ordinary application restart
without turning AskRigor into a raw research-content archive and without ever
treating missing state as completed work.

This phase does not change the public 21-tool MCP catalog, the 26-operation
Action inventory, protocol policy, Gemini transport, or Custom GPT projection.

## Current-state findings

The current research-session prototype holds its entire controller state in one
process-memory map for at most one hour. A restart loses the session. The state
contains a research target and semantic research annotations, so it can reveal
health interests even though it contains no raw transcript, comment corpus, or
article text.

The transcript and discussion continuation maps contain compact cursors and
hashes, not source text. Losing them is recoverable because the controller
already restarts an interrupted exact-video acquisition chain.

The open-full-text continuation map can contain a complete public article
index. If it is lost after acquisition reaches `EXHAUSTED` but before the method
audit is submitted, the current controller cannot resume: the session retains
only an opaque handle. Phase G must make this state explicitly reacquirable. It
must never retain the exhausted marker while pretending the missing document
can still be audited.

The D2 `EvidenceArtifactStore` holds normalized public provider envelopes in
memory. After the coordinator result is accepted, the controller needs only the
bounded receipt, status, directives, identities, and hashes. A crash during an
unfinished coordinator run can safely trigger a rerun. Persisting raw provider
artifacts would therefore add retention without being necessary for completion.

The D4 Retraction Watch snapshot is public provider data, not user/session data.
Its implementation already supports verified immutable snapshots, atomic
activation, current/previous rollback, and a stale-snapshot boundary, but no
production directory, timer, mount, or pruning policy is active.

Production currently uses one hardened Docker service: non-root, read-only
filesystem, dropped capabilities, and `no-new-privileges`, with one narrowly
scoped writable host bind for the aggregate AI budget ledger. The new design
must retain that posture and must not turn n8n, Hermes, a client, or an external
database into completion authority.

## Minimum resumable state

The durable checkpoint may contain only the controller state required to derive
the next server-owned capability:

- opaque execution ID and schema revision;
- exact Universal and HRP identities;
- controller generation, timestamps, and bounded lifecycle state;
- module/applicability/operation state and server-derived next capabilities;
- public source identities and bounded candidate/program annotations;
- compact transcript/discussion acquisition receipts and chain identities;
- formal query/source/full-text status, public source identity, and content
  hashes, but not publication text;
- method/external-evidence receipt hashes, bounded audit results, directives,
  unresolved state, and claim capabilities, but not raw provider envelopes;
- bidirectional/treatment/final-audit state; and
- permit-independent authorization basis and limitations.

The research target, diagnosis-status field, program annotations, semantic
findings, and source-selection rationales are classified as sensitive research
payload. They may be present only inside the encrypted checkpoint.

The following must not be durable:

- transcripts, captions, comments, replies, author/display identities, or raw
  return-search results;
- full article blocks/text or unrestricted provider bodies;
- Gemini prompts/responses or provider interaction IDs;
- credentials, signing keys, encryption keys, cookies, private sources, or raw
  user chat; and
- portable finalization permits as a substitute for authoritative session
  state.

## Options considered

### 1. Encrypted bounded server checkpoint — recommended

Store one authenticated-encryption envelope per session in a dedicated local
directory on the existing AskRigor VPS. Use repository-native atomic
temp-file/write/sync/rename/directory-sync mechanics already used by the AI
budget and Retraction Watch code. Keep only non-sensitive lifecycle metadata in
the clear. Use a dedicated runtime secret, strict file/directory modes, bounded
counts and bytes, automatic expiry, explicit deletion, and no backup.

Benefits: server authority remains intact; ordinary restart/deploy recovery is
possible; no new processor or paid service; bounded blast radius; easy rollback
to restart-from-source.

Costs: AskRigor begins retaining encrypted health-research session state for a
short declared period; a dedicated secret and writable mount are required;
single-host storage does not support horizontal scaling.

### 2. Client-carried sealed checkpoint — rejected

This avoids server retention but exposes a large replayable blob to clients,
complicates revocation and concurrent advancement, and would cause Hermes,
n8n, and Custom GPT to transport sensitive ciphertext. It also makes server
state authority harder to explain and enforce.

### 3. Restart from source only — safe fallback, not primary

Keeping all controller state in memory minimizes retention and is the rollback
path. It remains honest because a restart cannot claim completion, but it loses
hours of verified work and does not satisfy the roadmap's ordinary restart
resumability goal.

### 4. External database/object store — rejected for this phase

Cloudflare D1, Durable Objects, KV, or another managed database would introduce
a new provider, cost/privacy boundary, credential, deployment topology, and
retention system. KV's eventually consistent model is also a poor fit for
authoritative state transitions. The current single-VPS workload does not
justify that expansion.

### Reuse/adapt/compose decision

Compose existing repository mechanisms rather than add a database:

- preserve `ResearchSessionStore` validation, resource limits, and opaque IDs;
- adapt the AI-budget and Retraction-Watch atomic file pattern;
- use Node's stable cryptographic primitives for authenticated encryption;
- preserve existing controller restart logic and add deterministic restore
  reconciliation; and
- keep external evidence and raw source bodies in their current bounded
  in-memory stores.

Do not use the still-maturing built-in Node SQLite API or add a native SQLite
dependency for this bounded single-host store.

## Recommended owner decisions

### A. Private research-session checkpoints

Authorize a dedicated local VPS write boundary for encrypted controller
checkpoints with:

- 72-hour idle expiry;
- seven-day absolute lifetime;
- maximum 1,024 sessions and 16 MiB encrypted payload total, preserving the
  current caps unless encryption overhead requires a small explicitly tested
  allowance;
- AES-256-GCM with a dedicated 32-byte server secret and key ID;
- mode `0700` directory and mode `0600` files;
- no off-host backup and no inclusion in general VPS backups;
- automatic expiry pruning and an internal explicit-delete operation;
- a five-minute fenced claim lease so a crash cannot wedge a session and a
  stale worker cannot overwrite newer state;
- exact protocol identity validation on every authoritative restore/advance;
- fail-closed handling of malformed, unknown-key, tampered, expired, stale,
  oversized, or schema-incompatible checkpoints; and
- one application writer/replica. Horizontal scaling remains a later owner-
  reviewed storage decision.

The production mount should be separate from the aggregate budget ledger, for
example host `/opt/askrigor/state/research-sessions` mounted read-write only at
`/var/lib/askrigor-research-sessions`.

### B. Raw external-evidence and source artifacts

Do not make the D2 `EvidenceArtifactStore`, transcript/discussion bodies, or
open-full-text document indexes durable. Preserve their current in-memory
bounds. On restart:

- interrupted transcript/discussion acquisition restarts for the exact source;
- incomplete external-evidence coordination reruns;
- full text that was acquired but not method-audited is reset to exact-source
  reacquisition;
- a completed, receipt-bound method audit retains only bounded audit state and
  hashes; and
- lost raw material is never converted into negative evidence, a terminal
  access boundary, or completed work.

### C. Public Retraction Watch snapshot

Authorize a separate host-managed snapshot directory, for example
`/opt/askrigor/state/retraction-watch`, mounted read-only into the application.
Run the existing verified sync daily outside the application container. Retain
only the active and previous verified snapshots; remove abandoned staging data
and older generations after successful activation. Do not back up the mirror,
because it is reproducible from the public upstream source.

A pre-activation refresh failure preserves the last verified active snapshot. After 72 hours
without a successful source check, the provider is reported stale/partial and
cannot close an integrity check. A missing or corrupt active snapshot fails
closed; the previous verified snapshot may be restored only through the
existing verified rollback path.

The application container remains read-only for this dataset. The host sync
timer receives only network access to the fixed official source and write
access to the snapshot directory.

## Restore and crash invariants

1. A durable checkpoint is evidence of prior server state, never proof that its
   represented research claims are true.
2. No checkpoint can authorize finalization unless current code revalidates its
   schema, authentication tag, execution ID, generation, exact protocol tuple,
   and current completion gates.
3. A valid finalization permit without its authoritative session cannot resume,
   mutate, or recreate controller state.
4. Lost continuation/artifact handles reopen required work; they do not become
   terminal access boundaries.
5. Protocol drift prevents authoritative continuation/finalization until the
   existing restart/revalidation policy is satisfied.
6. A restore reconciler may move work backward from an unresumable intermediate
   state to exact-source reacquisition. It may never move work forward.
7. Generation and claim-token fencing reject stale concurrent writes.
8. Expiry, deletion, corruption, unknown key, or volume loss produces an
   explicit restart-required result, never a completed result.

## Implementation sequence after approval

1. Add a transport-independent store interface and keep the in-memory adapter
   as the test/default fallback.
2. Add the encrypted atomic-file adapter, strict envelope schema, resource
   accounting, fenced claims, expiry pruning, deletion, and corruption tests.
3. Add controller restore reconciliation for every ephemeral handle state,
   especially exhausted-but-not-method-audited full text.
4. Add hostile restart, replay, stale-writer, protocol-drift, tamper, unknown-
   key, expiry, capacity, and lost-artifact tests.
5. Add Retraction Watch activation/pruning/stale/failure tests and deployment
   scripts/configuration that preserve a read-only application mount.
6. Update the privacy data map, create the resumability threat model, update
   deployment/recovery/release documents, and record rollback instructions.
7. Run focused tests, `npm run test:run`, `npm run verify`, inventory tests, and
   any affected deployment checks.
8. Inspect the complete diff, complete lesson closeout, open a PR, review hosted
   checks, merge, and begin Phase H from fresh `main`.

## Rollback

Disable the persistent-session configuration and return to the in-memory
adapter. Stop the Retraction Watch timer and remove its read-only application
mount. Preserve no private checkpoint backup. Existing encrypted files become
unreadable to the application and are securely deleted according to the
documented operator procedure. Restarted research begins from source and cannot
inherit completion.

## Owner gate disposition

The owner directed Codex to make simple proportionate implementation decisions
without returning them for ceremonial approval. After weighing the documented
benefits and costs, Codex selected and the owner delegation authorizes:

1. the private encrypted checkpoint policy in A; and
2. the separate public Retraction Watch mirror/schedule policy in C.

This approval does not authorize an external database, paid service,
horizontal shared store, general backup inclusion, broader retention, or a new
provider. Any such expansion remains owner-gated. Approval of Gemini processing
and the existing Gemini API key remains a separate provider decision.
