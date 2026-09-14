# Private exact lesson-incident vault and historical failure corpus

Date: 2026-09-14
Issue: #222
Phase: implementation / DEVELOPMENT infrastructure
Production deployment: not authorized by this plan

## Owner outcome

When a user criticism is rechecked and validated as a real AskRigor lesson,
preserve the minimum exact originating conversation window privately and durably
before the existing generalized lesson pipeline discards the incident. Future
reasoning evaluation must be able to replay naturally occurring failures rather
than relying only on synthetic reconstructions.

Keep two records separate:

1. an owner-private encrypted exact incident record; and
2. the existing privacy-safe generalized lesson candidate in AskRigor-lessons.

Raw incident text must never enter GitHub, public MCP, public OpenAPI/plugin
surfaces, logs, analytics, CI artifacts, or generalized lesson issue bodies.

## Research-before-reinvention

Applicability: required and satisfied.

Disposition: ADAPT + COMPOSE.

Reuse AskRigor's existing encrypted local-file research-session store mechanics:
AES-256-GCM, key identity, owned-directory checks, symlink rejection,
restrictive permissions, bounded parsing, atomic rename, and fsync behavior.
Do not reuse its short-lived session TTL. Lesson incidents need a separate durable
store with explicit long-term retention and restore/rotation semantics.

## Architecture

```text
validated user criticism + lesson authorization
  -> minimum exact message window
  -> PRIVATE incident capture Action
  -> encrypted durable incident vault
  -> opaque {incident_id, incident_sha256, preservation_status}
  -> existing anonymize/generalize pipeline
  -> generalized lesson candidate + opaque incident provenance
  -> private AskRigor-lessons review queue
```

The private incident Action is consequential and write-only for ordinary product
flow. It is never registered as public MCP and there is no public raw-incident
read route. Owner-private replay/read-back is a separate authenticated maintenance
surface.

## Preservation states

Exactly:

- `EXACT_TRANSCRIPT_PRESERVED`
- `PARTIAL_TRANSCRIPT_PRESERVED`
- `LESSON_ONLY_NO_TRANSCRIPT`
- `RAW_INCIDENT_NOT_PRESERVED`

Never upgrade partial or lesson-only evidence to exact.

## Exact record contract

Implement strict `askrigor_lesson_incident_evidence_v1` semantics:

- opaque `incident_id`;
- `captured_at`;
- preservation status;
- optional private source/model/mode/AskRigor/protocol provenance;
- ordered message window with role, exact UTF-8 content, optional private message
  ref/timestamp, and SHA-256 of each exact message;
- validated defect category/finding/evidence basis/validator provenance;
- optional generalized lesson fingerprint/candidate ID;
- recomputed canonical `incident_sha256`.

Reject unknown fields, unsafe identifiers, path material, over-limit records, and
caller-supplied digest mismatches.

Limits:

- max 12 messages;
- max 24 KiB UTF-8 per message;
- max 128 KiB decoded JSON request for the incident route;
- unrelated Action route limits must remain unchanged.

## Minimum incident window

Default exact capture is only:

1. exact user prompt/evidence required to understand the failure;
2. exact erroneous AskRigor answer;
3. exact user correction;
4. corrected response/validation only when needed; and
5. immediately necessary neighboring turns only.

Whole-conversation capture is not the default. Do not reconstruct missing turns.

## Vault

Add a dedicated incident vault using the secure file-store primitives, with
configuration semantically equivalent to:

- `ASKRIGOR_LESSON_INCIDENT_DIRECTORY`
- `ASKRIGOR_LESSON_INCIDENT_KEY`
- `ASKRIGOR_LESSON_INCIDENT_KEY_ID`

Requirements:

- key/secret material never committed/logged/backed up with ciphertext;
- opaque filenames unrelated to user text;
- owner/non-symlink/restrictive-mode directory checks;
- path-traversal rejection;
- atomic write + file/directory fsync;
- bounded authenticated decrypt/read;
- explicit tamper/key-mismatch failure;
- idempotent capture/retry behavior;
- no TTL expiry.

Completion requires proving the configured storage survives ordinary service
restart/redeploy and the project's persistent-volume/remount boundary. If no
durable private volume exists, code may be implemented/tested but production
completion is blocked as `PERSISTENT_INCIDENT_VAULT_UNAVAILABLE`; do not invent
new paid infrastructure.

Document ciphertext-only backup/restore and key rotation. Destructive bulk
re-encryption requires a separately authorized migration.

## Private incident Action

Create a separate private consequential write Action/service. Raw incident and
GitHub-bound generalized lesson content never share one request object.

Success receipt exposes only:

- `status: preserved`;
- opaque `incident_id`;
- `incident_sha256`;
- preservation status;
- `retryable: false`.

Errors must never echo raw message text, keys, plaintext/ciphertext, or private
paths. Distinguish invalid/security input from retryable storage unavailability.

Do not register raw incident capture/read as a public MCP tool. Public MCP catalog
must remain unchanged. No public raw incident read operation may be added.

## Two-phase lesson workflow

After validated criticism and lesson authorization:

1. build minimum exact incident window;
2. preserve it privately and obtain opaque receipt;
3. separately generalize/anonymize lesson exactly through existing privacy flow;
4. submit generalized lesson with only opaque incident provenance;
5. show one truthful user receipt covering both states.

Partial failure is explicit:

- vault success + GitHub lesson failure: keep incident and retry generalized
  submission against same incident receipt;
- vault unavailable: never claim complete lesson archival;
- generalized duplicate: attach another distinct opaque incident occurrence.

Update `project/LESSON_CAPTURE_MODULE.md` accordingly. Preserve user consent and
platform consequential-action confirmation requirements.

## Generalized lesson changes

Extend the privacy-safe candidate/intake contract with optional opaque provenance:

```json
{
  "incident_id": "<opaque>",
  "incident_sha256": "<64 hex>",
  "preservation_status": "EXACT_TRANSCRIPT_PRESERVED"
}
```

No raw message, provider conversation/message locator, filesystem path,
ciphertext, upload content, health/personal narrative, or decrypted evidence.

AskRigor-lessons companion issue #12 owns ledger support for multiple incident
occurrences on one deduplicated generalized lesson.

## Historical recovery

Recover naturally occurring reasoning failures from owner-authorized history
where available. Store recovered raw bytes only in the private vault.
GitHub manifests contain only opaque incident IDs/digests, status, generalized
category, version/protocol provenance, lesson reference, and replay availability.

Priority classes:

- specificity/tolerated-control;
- evidence direction: timing/amount/route/form;
- exact-target substitution;
- provenance/circular support;
- denominator/prevalence;
- aggregate-null/subgroup heterogeneity;
- causal/mechanistic inference.

Truthful status only: exact, partial, lesson-only, or current-capture failure.
Never fabricate missing turns.

Recovered incidents become DEVELOPMENT regression evidence once used to tune
AskRigor. They are not held-out validation. Frozen MAST remains untouched.

## Private replay

Add an owner-private replay path that can decrypt one opaque incident ID,
materialize only the needed prompt/evidence window for a fresh DEVELOPMENT replay,
record current answer/provenance, and compare against the validated defect.

Public GitHub replay manifests reference incident IDs/digests and generalized
expected invariant only.

## Tests

Focused first.

Contract:
- exact UTF-8 round-trip;
- message and record digest verification;
- unknown fields;
- message/byte limits;
- invalid preservation-state claims.

Vault security:
- create/read;
- wrong key/key ID;
- auth-tag/tamper failure;
- symlink/path traversal/unsafe path rejection;
- atomic recovery;
- idempotent duplicate/retry;
- inventory bounds;
- no plaintext user text in filenames;
- no raw content/key in errors/log snapshots.

Workflow:
- vault + generalized success;
- vault success + generalized failure/retry;
- duplicate generalized lesson + second incident occurrence;
- vault unavailable truthful result;
- historical partial and lesson-only;
- generalized payload contains opaque provenance only.

Surface isolation:
- incident write route not public MCP;
- no raw incident public read;
- public tool catalog remains unchanged.

Durability:
- read-back after restart;
- persistent-volume/redeploy-equivalent acceptance in the real infrastructure.

## Verification budget

Iteration: focused lesson/vault/action/schema tests; affected typecheck/build only.
Do not run full repository gates after every edit.

At actual review/merge boundary:

- AskRigor: `npm run verify` plus required hosted checks and final privacy diff
  audit;
- AskRigor-lessons: its declared full tests/audits;
- explicitly verify no raw historical incident entered Git history.

Production deployment/persistent-volume changes are separate authorization.

## Mission Control triggers

Route to the registered AskRigor reasoning supervisor if:

- durable private storage requires new infrastructure/spend;
- private capture would require public raw retrieval;
- per-route bounded body handling cannot be added without widening unrelated
  routes;
- consent/platform confirmation semantics conflict;
- a historical defect would require reconstruction rather than source recovery;
- a schema would expose private incident data in GitHub;
- retention/privacy/owner-access semantics would materially change;
- production deployment/storage changes become necessary;
- implementation reaches merge/release review.

Work/Codex does not decide scientific architecture priority from the recovered
corpus.
