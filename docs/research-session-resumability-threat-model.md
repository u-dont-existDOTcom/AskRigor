# Research-session resumability threat model

Status: Phase G approved implementation boundary; production activation remains
part of the later private-interface and release phases

## Scope and assets

The protected asset is the server-owned research-session checkpoint used to
resume a long-running execution. It contains the research target, protocol
identity, controller state, public source identities, bounded semantic
annotations, receipt hashes, unresolved work, and server-derived authorization
basis. A research target can reveal a health interest and is treated as
sensitive even when de-identified.

The checkpoint deliberately excludes raw chat, transcripts, comments, replies,
commenter identity, article text/blocks, raw provider bodies, Gemini responses,
credentials, signing keys, encryption keys, and private sources. It may retain
bounded source-linked findings, exact source hashes, a bounded reader report,
and that report's digest; these remain part of encrypted controller state and
cannot substitute for the source receipts that authorize them.

The Retraction Watch mirror is a separate asset and lifecycle. It contains only
normalized public Crossref data and verification metadata. It never contains a
session identifier, query, health detail, or user content.

## Trust boundaries

- The AskRigor controller is the only completion authority.
- The file checkpoint adapter is a single-host persistence mechanism, not a
  second controller.
- The application runs as a non-root user with one dedicated checkpoint write
  mount. Other application files remain read-only.
- The Retraction Watch synchronizer runs as a fixed, isolated one-shot
  container. It receives no AskRigor runtime environment file or provider
  credentials and can write only the public snapshot directory.
- The research application receives the Retraction Watch directory read-only.
- Hermes, n8n, Custom GPT, Gemini, and other clients never receive the
  encryption key or write checkpoint files directly.

## Threats and controls

| Threat | Control | Residual boundary |
| --- | --- | --- |
| Filesystem inspection or stolen volume | AES-256-GCM encrypts the complete controller payload with a dedicated server key; only authenticated lifecycle metadata remains in clear text; directory mode is `0700` and files are `0600` | A host/process compromise that can read runtime memory or the key can decrypt live checkpoints |
| Metadata or ciphertext tampering | Lifecycle metadata is authenticated as associated data; strict envelope/state schemas, exact session identity, key ID, and authentication tag must pass before use | Tampering makes the session unavailable and requires restart; it cannot authorize output |
| Stale worker overwrites newer state | Five-minute claim lease, random claim token, generation increment, reread confirmation, and token fencing before replace/rollback | Duplicate provider work can occur during a deployment overlap, but only the current fenced writer may commit |
| Crash while writing | Mode-`0600` exclusive staging file, file sync, atomic link/rename, and directory sync | A crash may leave an ignored dot-prefixed staging file; it cannot be loaded as a checkpoint |
| Silent eviction or disk pressure | Fixed 1,024-session, 16-MiB plaintext, and 24-MiB stored bounds; expired entries are pruned; unexpired capacity rejects new issuance instead of evicting prior work | Operator intervention is required for corrupt files or persistent capacity exhaustion |
| Lost ephemeral source handle after restart | Restore reconciliation moves only backward: handle-bound video chains restart, unfinished return-search result state resets, and exact full text is reacquired/re-audited when later work still needs its document index | Some verified work may repeat; no lost handle becomes completion, negative evidence, or a terminal provider boundary |
| Reacquired public evidence differs from the completed frontier | Selected-video evidence is replayed from the first transcript/discussion page into a non-authoritative process-local cache; exact completed receipt hashes must match the checkpoint before semantic work proceeds | A changed or inaccessible public source can force retry/restart; it cannot be silently combined with old receipts or findings |
| Worker invents or mutates reader claims | Report work is bound to the exact current evidence digest; every creator/community finding carries its own structured program; every claim reference, program, audited-video set, limitation, source capability, and timestamp is validated; effect claims cannot use bounded, effect-excluded, stale, or retracted sources | Semantic wording remains model-fallible, but unknown references, cross-program pooling, broader unsupported claims, or a mutated report cannot obtain a current completion audit or permit |
| Finalization permit is paired with a different report | Permit v2 signs the exact reader-report digest; finalization revalidates that digest and returns the exact packet | Rendering clients may format the authorized packet but cannot substitute a different report while retaining valid authorization |
| Protocol or schema drift | Every restored state passes the exact schema and current protocol identity recheck before authoritative continuation/finalization | Incompatible old checkpoints restart rather than migrate implicitly |
| Permit replay without state | Finalization permits remain short-lived and are not stored as controller checkpoints; a permit cannot recreate or advance a missing session | A still-valid permit may be rendered only for its exact already-authorized boundary; it grants no mutation authority |
| Accidental logs/backups | Application logs exclude bodies/content; checkpoint directory is explicitly excluded from general backups; raw artifacts stay in memory | Infrastructure metadata remains governed by the hosting provider's policy |
| Over-retention | 72-hour idle expiry, seven-day absolute expiry, automatic pruning, and internal explicit deletion | Filesystem/media remanence after unlink is not claimed to be physically erased; encryption and eventual key/volume disposal limit exposure |
| Key loss or rotation | Dedicated key ID and fail-closed unknown-key behavior; no backup of private checkpoints | Losing/rotating the key makes old sessions restart-required; availability is intentionally traded for minimization |
| Snapshot poisoning or rollback | Fixed official source, exact commit/file hash, schema/header validation, immutable generation hashes, atomic pointer, verified previous snapshot, and stale state | Retraction Watch remains one provider; no match or stale data cannot prove publication integrity |
| Snapshot sync compromise | Fixed code/URLs, no runtime secrets, non-root container, read-only root, no capabilities, no-new-privileges, bounded tmpfs, and one public-data write mount | The one-shot container has outbound network access needed for the fixed official source |
| Hermes worker invents completion or provider receipts | Worker receives no orchestration credential or provider tools; strict output schemas reject completion/count/provider fields; the parent submits only the exact server package and a final-response guard requires a matching server permit | Semantic correctness remains model-fallible; server validation proves binding/schema, not truth, and later controlled audit work must preserve explicit unresolved fields |
| Hermes worker reads repository/private content or persists memory | Research profile has no toolsets, repository access, context-file loading, memory, trajectories, checkpoints, or background review; each run uses a fresh temporary directory and a small environment allowlist | The chosen external model provider processes the transient de-identified work package under its own terms |
| Compromised or drifted Hermes checkout | Parent requires the exact reviewed upstream commit and a clean tracked/untracked worktree before launch; Python environment lives outside the checkout | A compromised host or Python environment remains able to alter the process and is outside the model-level guard |
| n8n workflow invents completion or research quotas | n8n receives only a server directive; a strict tracked-workflow validator rejects policy/count logic and incomplete-to-success rewiring; success branches require the exact server-confirmed boundary and permit payload hash | An administrator who replaces both the reviewed workflow and its validation/deployment gate controls that n8n instance, but still cannot advance AskRigor controller state |
| Worker death, provider retry, or elapsed time becomes completion | AskRigor retains state; retries and no-progress transitions are bounded; retry exhaustion becomes `STUCK`; blocked/owner-gate/incomplete paths return non-success and Stop And Error; clocks never satisfy evidence gates | Retry limits may require operator continuation after an infrastructure outage; availability is not converted into evidence |
| n8n execution history leaks research content | The adapter returns no research target, inner session ID, source body, semantic package, credential, or report; execution saving is disabled in the ephemeral pilot; risky code/command/file nodes and embedded credentials are rejected | Host/network metadata and the opaque n8n execution ID remain visible to the local operator |
| n8n becomes an accidental durable research database | Phase J uses an ephemeral AskRigor-side store and a disposable n8n database only; restart reconstructs safe control state from current AskRigor server authority | Production persistence, backup, retention, or horizontal operation remains unapproved and requires a new privacy decision |

## Retention, deletion, backup, and recovery

Private checkpoints expire 72 hours after the latest successful server access
or transition and never survive seven days from issuance. They are not copied
to off-host or general VPS backups. An internal delete removes the live
directory entry and makes the session unavailable. AskRigor does not claim
physical secure erasure on SSD, filesystem journal, or host snapshots it does
not control; those stores must exclude this directory. If the volume or key is
lost, research restarts from source and no completion is inherited.

Raw external-evidence artifacts, selected-video evidence material, and source
bodies remain process-memory only. The selected-video cache is bounded to 100
entries and 64 MiB by default and is revoked when a replay receipt differs.
After a completed coordinator/method result, only the strict bounded state and
hashes needed by the controller remain in the encrypted checkpoint. A crash
during unfinished work reruns that exact operation.

The Retraction Watch mirror retains only the active and previous verified
generations. It has no backup because it is reproducible from the fixed public
upstream. Pre-activation synchronization failure preserves the active pointer.
A source check older than 72 hours is stale/partial; missing/corrupt active
state fails closed.
Rollback re-verifies the previous generation and restores its original source-
check time.

## Operational invariants

1. Persistent state can move execution backward or preserve it, never forward.
2. Missing, expired, corrupt, unknown-key, or incompatible state is not a
   recognized terminal research boundary.
3. The checkpoint store never evaluates evidence truth or completion itself.
4. The public dataset mirror and private session directory never share a mount,
   key, retention rule, or backup lifecycle.
5. Horizontal replicas/shared storage remain unsupported and require a new
   owner-reviewed design.
6. Production activation requires the later private-interface/release gates,
   exact mount verification, non-secret configuration-name checks, and restart
   acceptance. Phase G does not add a public Action or MCP operation.

## Rollback

Disable the persistent-store configuration and use the in-memory adapter. Stop
and disable the Retraction Watch timer, remove the read-only application mount,
and unlink the private checkpoint files according to the operator runbook.
Research sessions restart from source. Rollback cannot preserve or claim
completion from a deleted checkpoint.
