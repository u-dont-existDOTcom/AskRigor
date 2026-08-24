# Phase F — Server-authorized finalization and integrity permit

Status: implemented and locally verified on
`agent/execution-control-phase-f-20260824`; PR and hosted review pending

Authority: current owner requirements, complete current
`protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`, then the
execution-control productionization roadmap. This plan implements existing
policy; it does not amend either protocol.

## Objective

Create the first successful server-authorized finalization path. A complete
controller-owned execution may receive a compact integrity-bound permit. A
genuinely terminal execution may receive only a bounded-nonranking permit and
plain-language limitations derived from authoritative state. Caller assertions
never create either result.

## Existing mechanisms to reuse

- exact protocol binding and drift checks in `research-session-controller.ts`;
- the Phase E server-derived final completion audit and treatment/bidirectional
  readiness;
- the complete research-session state digest, which already includes video,
  formal, full-text, method, external-evidence, linked-work, treatment, and
  final-audit receipts;
- HMAC receipt patterns, domain separation, strict schemas, and constant-time
  signature checks from `study-external-evidence.ts` and continuation tokens;
- the current in-memory research-session store and non-production transport.

Do not add a parallel controller, a durable permit store, a public Action/MCP
operation, or a client-authored completion field.

## Design

### 1. Compact signed permit

Extend the existing permit contract with:

- explicit comparative-finalization versus bounded-nonranking artifact kind;
- exact execution ID, output boundary, protocol tuple, research-state digest,
  authorization-basis digest, and limitation-set digest;
- issue/expiry time, key ID, domain separation, payload hash, and HMAC-SHA256
  signature;
- a server-only signing secret of at least 32 UTF-8 bytes.

The permit contains no research target, diagnosis, medical details, source
text, transcript/comment content, provider body, credential, or private prose.
Verification must require the exact current session, state, protocol tuple,
boundary, basis, limitations, clock, and secret. Same-session replay of the
unchanged permit is valid only until expiry; cross-session, cross-state,
cross-protocol, expired, malformed, and tampered permits fail.

### 2. Canonical finalization decision

Replace the deliberate Phase A denial with one strict discriminated decision:

- `DENIED` while executable/incomplete/retryable work remains, protocols
  drift, or signing is unavailable;
- `BOUNDED` only when the existing server state authorizes
  `BOUNDED_NONRANKING_ONLY`;
- `AUTHORIZED` only when the current Phase E final audit authorizes
  `FINALIZATION_ALLOWED`.

The session status may report ready-to-finalize, but only the finalization
operation signs a permit. The non-production transport injects the secret and
clock; it never accepts them from a request.

### 3. State-derived limitations

Persist only the bounded external-evidence facts needed to render and verify
limitations:

- provider identity/outcome and attempt hash;
- publication-integrity record state plus event kind/hash;
- server-derived claim-local limitations already present in the verified
  external-evidence bundle.

Generate deterministic plain-language limitation records for:

- optional providers not configured;
- provider-scoped no-match, partial, inaccessible, or failed coverage;
- retraction/withdrawal, expression of concern, correction/update,
  reinstatement, or uncertain publication state;
- bounded decision-relevant linked work;
- source claim restrictions and treatment/operation terminal boundaries.

Never turn provider no-match into no concern, a replication label into a
verified outcome, or a terminal boundary into a comparative verdict.

### 4. Technical/rendering separation

Return signed technical evidence separately from the reader-facing permitted
scope and plain-language limitations. The permit binds the limitation digest
without embedding the prose. Ordinary clients can render the plain-language
section and expose permit details only for technical audit.

## Hostile tests

- complete receipt-driven fixture is denied before its audit and authorized
  only after the server audit;
- caller-shaped permit without the secret is invalid;
- payload, signature, boundary, state, protocol, limitation, expiry, and key
  tampering fail;
- cross-session permit replay fails while unchanged same-session verification
  before expiry passes;
- changed external-evidence receipt/state invalidates an issued permit;
- terminal state can receive only a bounded-nonranking artifact;
- retraction, correction, and expression-of-concern state remain in the signed
  basis and generate the appropriate limitation;
- unconfigured providers and no-match outcomes generate provider-scoped
  limitations without a no-concern claim;
- unaudited decision-changing linked work cannot authorize finalization;
- serialized permit/decision contains none of the prohibited private/raw
  fields;
- the public MCP and Action inventories remain unchanged.

## Verification and boundaries

Run focused controller/formal/prototype/permit tests, then `npm run test:run`
and `npm run verify`. Inspect the full diff, complete lesson disposition, open
and review a PR, require hosted CI, merge, and restart Phase G from fresh
`main`.

Phase F changes no protocol bytes, Custom GPT instructions, plugin package,
provider configuration, public endpoint/tool inventory, deployment, durable
storage, retention, or production write capability. Phase G remains the owner
gate for persistence.

## Implementation result

The transport-independent controller now has one real successful finalization
path and one strictly bounded report path. Both require current server-owned
state and a server-only signing secret. The signed permit binds the exact
execution, protocol tuple, state, authorization basis, limitation set, output
boundary, key identity, and short validity window. Reader-facing permitted
scope and plain-language limitations are returned separately but their exact
set is digest-bound to the permit.

External-evidence state now retains only the bounded provider outcome,
publication-record summary, and claim-local limitation facts needed for final
rendering. The schema requires those projections to match their exact receipt
hashes and prevents an active retraction/withdrawal from retaining ordinary
effect-claim permission. A provider no-match remains provider-scoped; an
unconfigured provider remains an explicit gap.

Hostile tests cover pre-completion denial, valid complete-state authorization,
bounded-only authorization, caller construction, decision/permit mismatch,
payload/signature/state/limitation/protocol/key/secret tampering, expiry,
cross-session replay, publication-history changes, provider-scoped no-match,
and prohibited raw/private fields. Typechecking and the focused four-file
controller/formal-evidence suite pass 46/46. The focused inventory suite passes
121/121. The complete `npm run verify` gate passes typechecking, 1,281 tests
with six declared skips, and the production build. A pre-existing archive
checksum test that passed alone but exceeded its default five-second timeout
twice under full-suite load now uses the same 15-second limit as the adjacent
archive/evidence test; its security assertions are unchanged.
