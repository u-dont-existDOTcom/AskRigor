# Owner review and exact promotion bridge

- Date: 2026-09-01
- Task: `askrigor-owner-review-promotion-v1`
- Branch: `task/owner-review-promotion-20260901`
- Baseline: `ef8b713e9b5320d3ebe8e47ec2cea98095431e90`
- Assurance lane: iteration with targeted authorization, privacy, migration,
  identity, concurrency, idempotency, and rollback gates.

## Owner outcome

Free AskRigor is a reciprocal ordinary product: people explicitly agree that
eligible deidentified structured research progress may enter shared review, or
they use an already entitled paid-private mode. The product should learn from
users by letting the owner examine structured proposals with GPT assistance and
make an explicit accept or reject decision. It is not a pilot, institutional
study, IRB workflow, recruitment program, or automatic scientific authority.

The independent source receipt is
`../audits/2026-09-01-owner-review-promotion-owner-source.txt`, SHA-256
`23928d3a6c230e17874314b1fbf7fc9545c6884ee2d1fdd39b38ebbfec9b9b4c`.
The normalized owner-outcome bytes without the file's final newline retain the
reasoning epoch hash
`5e77c831c1f86c9d4e9db0009341fcc6877b6ba1f85e7181f54e6b1c2267916c`.
The Extra High directive and correction identities are recorded in
`../audits/2026-09-01-owner-review-promotion-directive.json`.

## Reconciliation matrix

| Owner requirement | Task criterion | Acceptance evidence | State |
| --- | --- | --- | --- |
| Public fills out forms; owner examines via GPT | Owner-only inspect of one immutable structured proposal | Authorized/private tool tests; no public disclosure | passed |
| Learn from users | Explicit accept creates a durable promotion intent; one-shot runner promotes exact payload | PostgreSQL and writer-routing acceptance | passed |
| Agree or paid private | Do not change reciprocal consent or entitlement behavior | Existing contributor-access regressions | passed |
| Not a pilot or institution | No study/IRB/recruitment/community/payment machinery | Final diff and docs review | passed |
| Public submissions are non-authoritative | Pending, inspected, rejected, withdrawn, or unauthorized states cannot write canonical evidence | Zero-writer call and role-grant tests | passed |
| Accept/reject is explicit | Matching proposal ID/hash plus decision and nonblank reason | Service/MCP validation tests | passed |
| Continue later slices | Finish this local subtask without claiming root or release completion | Typed `SUBTASK_COMPLETE_PARENT_OPEN` receipt | passed |

## Selected composition

1. `research-mcp` authenticates `cases:review` and the existing reviewer-subject
   allowlist before it can inspect or decide a proposal.
2. A distinct restricted review role can read one proposal, conditionally
   transition `PENDING_REVIEW` to `ACCEPTED` or `REJECTED`, and on acceptance
   insert exactly one proposal/hash/kind-bound promotion intent in the same
   transaction. It cannot write canonical evidence.
3. Acceptance returns `accepted_pending_promotion`. Rejection creates no intent.
4. The separate `living-evidence-admin` profile gains a one-shot
   `promote-accepted` command. It claims an accepted intent, verifies exact
   proposal/hash/kind identity, loads only the stored strict payload, dispatches
   `SOURCE_ANALYSIS` to `PostgresEvidenceRepository.contribute` or
   `RESEARCH_FRONTIER` to `contributeFrontier`, and stores one exact receipt.
5. A retry after canonical commit but before receipt storage uses the existing
   writer idempotency and completes the same receipt. The public runtime never
   receives writer credentials, Docker control, or an admin launch path.

## Active lesson contract

| Lesson | Trigger | Required behavior | Failure condition | Enforcement |
| --- | --- | --- | --- | --- |
| Current owner correction | Earlier work drifted toward an institutional program | Keep an ordinary public product and the smallest review/promotion bridge | New pilot, study, IRB, recruitment, or generic admin workflow | semantic + diff |
| Task-time lesson activation | This is a consequential auth/data slice | Apply this contract before mutation and again before delivery | A listed rule has no exact evidence | mechanical/semantic |
| Development assurance lanes | The directive is local iteration, not release | Focused tests plus hard gates; no merge/deploy claim | Release ceremony or production mutation in this slice | task receipt |
| Codex/GitHub operating system | Multi-file migration/service work | Isolated branch, coherent commits, exact tests, recovery state | Direct main edit, lost unrelated work, or unreviewed diff | Git/test |
| Context-compaction resilience | Long-running autonomous implementation | Keep `tasks/ACTIVE-TASK.json`, this plan, and receipts current | Fresh worker cannot resume from Git | file validation |
| Durable chat learning | New findings require disposition | Run lesson closeout/status and record new lesson or no-new-lesson | Unreviewed substantive finding at completion | repository gate |
| Shared supervision bootstrap | Extra High owns architecture; Codex executes | Follow v1.0.1 correction; report execution evidence and route stop boundary | Codex silently changes topology, adequacy, or completion semantics | directive/receipt |

Pre-attempt activation: `PASS`. The corrected Extra High topology resolves the
invalid original directive. No Pro pass is required unless a named stop trigger
appears.

## Invariants

- No client supplies replacement payload content during review or promotion.
- Hash mismatch, authorization failure, rejection, withdrawal-first, unsupported
  kind, or lost conditional transition produces no canonical write.
- Acceptance and promotion-intent insertion are one database transaction.
- Rejection creates no promotion intent.
- Partial formal corpora remain partial.
- Ordinary/public callers cannot inspect or decide proposals or receipts.
- The existing public research-access role gains no review/canonical authority.
- The review role gains no canonical evidence authority.
- The admin runner makes no scientific decision and processes only an already
  accepted, exact-hash-bound intent.
- No raw chat, prompt, identity/contact, private health narrative, upload, raw
  source/provider body, credential, or YouTube/community data is added.
- Accepted evidence is not automatically published and no causal claim follows.

## Implementation sequence

1. [x] Add migration `0010` for promotion intents/receipts and the narrow review
   transaction boundary; add the migration to the canonical migrator.
2. [x] Add review store/service interfaces and in-memory/PostgreSQL implementations
   for inspect, conditional decide, promotion claim, receipt completion, and
   recoverable failure/retry.
3. [x] Add the owner-only MCP inspect/decide/status operation using the established
   `cases:review` plus reviewer-subject guard. The single operation is
   `review_research_contribution` with `inspect | accept | reject | status`
   actions; it raises the standard candidate catalog from 26 to 27.
4. [x] Extend the one-shot admin CLI with `promote-accepted` and exact writer
   dispatch; do not add writer credentials to `research-mcp`.
5. [x] Provision a distinct review role and prove the original access role remains
   unchanged. Scheduler activation remains release work.
6. [x] Add focused deterministic and real-PostgreSQL acceptance for authorization,
   decision/outbox atomicity, races, restart/retry, writer routing, exact receipt,
   role grants, and migration-over-0009 behavior.
7. [x] Update contributor-access, privacy/deployment, tool inventory, and recovery
   documentation. Correct the stale `24` directly to the candidate truth `27`
   in `AGENTS.md`; Extra High correction v1.0.2 supersedes the earlier `26`
   instruction.
8. [x] Run focused gates, inspect the final diff, persist the execution receipt, and
   route it back to the Extra High conversation before any later merge/release
   phase.

## Stop triggers

Stop the affected path and return evidence to Extra High if exact stored payload
identity cannot be proven, writer idempotency cannot recover the interrupted
boundary, owner authorization requires broader public privilege, a withdrawal
race cannot be conditionally resolved, a destructive migration is required, a
receipt requires excluded data, or any requested implementation would expose a
generic writer or automate scientific acceptance.

## Completion boundary

Local completion requires focused authorization/privacy/concurrency/migration
and writer-routing evidence, exact changed-file identities, final diff review,
and lesson disposition. The only allowed typed completion claim is
`SUBTASK_COMPLETE_PARENT_OPEN`. Operational alignment, scientific adequacy, and
release adequacy remain separately reported; this slice cannot claim release
adequacy or the owner outcome achieved.

Completion state: `SUBTASK_COMPLETE_PARENT_OPEN`. Extra High final review
verdict is `PASS`, with zero Critical, Important, or Minor findings;
operational alignment is `GREEN`, scientific adequacy is
`PRESERVED_NOT_EXPANDED`, and release adequacy is `NOT_AUTHORIZED`.
