# Production living-evidence read-through integration

Date: 2026-08-29  
Task ID: `askrigor-living-evidence-readthrough-v1`  
Assurance lane: release  
Status: active

## Objective

Allow the production full-text path to reuse a previously validated, complete
study-method audit when—and only when—the repository record is bound to the
same exact source bytes and remains compatible with the current protocols,
audit rubric, freshness state, access state, and completed impact state.

The client must still exhaust the current lawful full-text acquisition and call
`validate_study_method_audit`. Repository reuse replaces model-side
reconstruction of the 13-domain payload; it never replaces the existing
source-linked deterministic validator.

## Product outcome

For an exact compatible repository hit:

1. `acquire_open_full_text` returns its existing source blocks and coverage
   receipt plus a compact repository-candidate receipt.
2. After the current document is exhausted, the client calls the existing
   validator with the same document handle and the advertised analysis-version
   ID instead of generating a fresh audit payload.
3. The server reloads the current candidate, repeats every compatibility check,
   runs the unchanged study-method validator against the current document
   index, and returns the ordinary full audit receipt plus a reuse receipt.
4. If any check fails or the repository is unavailable, the server returns an
   explicit `fresh_study_audit_required` boundary on the same exhausted handle.
   The next executable step is a normal validator call with a newly performed
   audit.

This removes the measured ChatGPT audit-construction stall on exact safe hits
without relaxing HRP or synthesis locks.

## Exact reuse gates

A candidate is reusable only when all of the following pass at acquisition and
again at validation:

- exact DOI (and, when present, PMCID/PMID) identity membership;
- exact `source_content_sha256` equality with the current acquisition;
- `complete_performed_analysis`, current leaf, and non-invalidating lineage;
- source access state `complete`;
- freshness projection exactly `current` with a recorded policy/check;
- zero pending or failed impact jobs for the source version;
- exact set equality with the current canonical HRP and Universal SHA-256s;
- analysis kind `study_method_audit` and rubric/receipt version `1.0`;
- one exact lossless validated-audit payload whose receipt hash recomputes;
- all 13 current study audit domains and the current strict submission schema;
- the repository receipt bound to that exact analysis/source version; and
- successful execution of the existing `validateStudyMethodAudit` function on
  the current full-text index.

Ambiguous multiple compatible candidates fail closed to a fresh audit. External
evidence-bound study audits and review audits are not reused in this first
bounded integration because their additional freshness/ancestry contracts need
separate exact reuse gates.

## Persistence and privacy boundary

This phase adds a read-only production integration. It does not automatically
persist public-user tool calls, chat, prompts, health narratives, provider
bodies, raw source text, transcripts, comments, replies, or identities. It
defines and tests a lossless contribution builder for curated validated study
audits so an authorized writer can create compatible records without raw source
content; it does not call that writer from the public read-only MCP operation.

The production reader uses a dedicated environment variable and a database role
with `SELECT` only. Absence, misconfiguration, timeout, corrupt data, or query
failure leaves ordinary fresh auditing available and emits only an allowlisted
reason code. YouTube/community persistence remains exactly zero.

## Implementation surfaces

- `packages/evidence-repository`: bounded current-analysis candidate lookup
  and typed metadata needed for independent compatibility validation.
- `apps/research-mcp`: exact stored-audit envelope/contribution builder,
  compatibility resolver, optional read-only configuration, acquisition
  projection, and validator reuse branch.
- public MCP/Action schemas and descriptions: same 21 operation names; one
  optional acquisition receipt and one additional input alternative on the
  existing study validator.
- privacy, storage policy, threat model, architecture map, deployment,
  Custom GPT/plugin material, and recovery state.

No canonical XML protocol bytes change in this task.

## Verification

Focused deterministic coverage must prove:

- exact compatible reuse and unchanged validator output;
- full-text exhaustion cannot be skipped;
- source hash, identifier, protocol, rubric, freshness, access, impact,
  lineage, receipt, and payload mutations each force a fresh audit;
- an advertised candidate invalidated before validation cannot be reused;
- database absence/failure does not block a normal fresh audit;
- no raw source or community data enters the contribution or reuse receipts;
- the public inventory remains exactly 21 tools; and
- the high-level wrapper preserves the current full-text and method-audit
  contract.

At the release boundary run the focused tests, real-PostgreSQL living-evidence
acceptance, complete `npm run verify`, privacy/release checks, exact diff and
secret review, hosted checks, deployment rollback/readback, exact 21-tool
catalog/manifests/read-only probe, plugin-package receipt, and a fresh product
case that demonstrates both a repository hit and a forced-fresh miss.

## Rollback

The code path is disabled unless the explicit reuse switch and valid read-only
database configuration are both present. Operational rollback disables the
switch and recreates the service; source rollback returns to
`rollback/main-pre-living-evidence-readthrough-20260829` at
`42cf009028d4b8bad989d9c575067bf1a98959bd`. No repository row is deleted by
disabling read-through.

## Lesson disposition

The current universal source-provenance, durable-state, living-map,
development-assurance, exclusive-task, and executable-frontier patterns already
cover the transferable controls. Treat any new finding as project-specific
unless implementation or product evidence demonstrates a genuinely new
cross-project principle.
