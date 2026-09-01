# Accepted-contribution promotion scheduler

- Date: 2026-09-01
- Task: `askrigor-living-evidence-promotion-scheduler-v1`
- Branch: `task/promotion-scheduler-20260901`
- Baseline: `c7138eff5dbbce22bb25f727da78006e543fa476`
- Assurance lane: release, with targeted credential, authorization,
  idempotency, concurrency, recovery, and production-rollback gates.

## Owner outcome

AskRigor should learn from users who choose reciprocal free use. The owner
examines deidentified structured proposals through GPT and makes the scientific
accept/reject decision. Once an exact proposal has been explicitly accepted,
the existing separate one-shot canonical writer should complete that accepted
intent without requiring Joel to remember a server command.

This is ordinary product operation. It is not automatic scientific acceptance,
an institutional study, a pilot, a recruitment system, or a generic background
agent.

## Selected bounded design

1. Keep `review_research_contribution` as the only decision boundary. The
   scheduler receives no input capable of accepting or rewriting a proposal.
2. Reuse `living-evidence-admin promote-accepted` unchanged. Each invocation
   claims at most one already accepted exact-hash intent and uses its existing
   idempotent recovery behavior.
3. Add a hardened host systemd oneshot service and five-minute persistent timer.
   The service runs the exact Compose admin profile with `--no-deps` and
   `--pull never`; it never runs a shell or accepts runtime arguments.
4. Put only the current immutable image reference in a dedicated root-owned
   non-secret environment file. Writer credentials remain solely in the
   existing root-owned admin environment file consumed by Compose.
5. A no-pending run succeeds with the existing bounded receipt. A failure stays
   visible in systemd and the next timer invocation retries the durable intent.
6. Preserve a manual immediate invocation for owner testing and backlog drain.
   At current volume, one item per five minutes is the intentional bounded
   throughput; expanding to a persistent or batch worker is a later measured
   need, not part of this slice.

## Active lesson contract

| Lesson | Trigger | Required behavior | Failure condition | Enforcement |
| --- | --- | --- | --- | --- |
| Current owner correction | Prior work veered into institutional framing | Keep an ordinary reciprocal public product | Study, pilot, IRB, recruitment, or institutional machinery appears | semantic and diff |
| Explicit owner decision | Promotion changes canonical evidence | Schedule only the existing accepted-intent runner | Timer can accept, infer, replace payload, or bypass exact hash | tests and review |
| Privileged workflow safety | Timer reaches a canonical writer credential | Static root-owned unit; no untrusted input; late isolated credential boundary | Secret in Git/unit/logs or public runtime gains writer authority | tests and production readback |
| Exclusive task lock | Work continues across release surfaces | Branch-bound lock and task-specific preflight/acceptance | Queue or stale branch selects work before this task completes | mechanical |
| Development assurance lanes | This slice will activate production scheduling | Focused inner loop; full applicable gate, rollback, protected merge, and exact production receipt at release | Candidate proof is mislabeled as production or release is under-verified | mechanical and receipt |
| Task-time lesson activation | New consequential automation slice | Apply this table before implementation, activation, and delivery | A listed rule has no specific evidence | semantic and mechanical |

Pre-attempt activation: `PASS`.

## Invariants

- Only `ACCEPTED` proposals with an exact pending promotion intent can reach the
  canonical writer.
- The scheduler makes no scientific, causal, eligibility, or deidentification
  decision.
- The public research runtime keeps no canonical-writer credential, Docker
  socket, systemd control, or scheduler-launch operation.
- The unit contains no credential, database URL, proposal content, or dynamic
  user input.
- The invoked image is the exact locally present release image; pulls and builds
  are disabled.
- At most one promotion is processed per activation; systemd serializes the
  oneshot unit.
- Failure never discards the pending intent. Existing idempotent replay handles
  a prior canonical commit without a promotion receipt.
- Disabling the timer stops automatic promotion without deleting proposals,
  intents, receipts, or canonical records.
- Partial formal corpora remain usable and labeled partial.

## Implementation sequence

1. [x] Add red contract tests for static unit bytes, five-minute timer,
   privilege isolation, deterministic invocation, failure visibility, and
   rollback documentation.
2. [x] Add task preflight and artifact-based acceptance commands.
3. [x] Add the hardened service/timer templates and deployment runbook.
4. [x] Update contributor-access, privacy, architecture-map, work-queue, and
   current-state documentation without changing scientific semantics.
5. [x] Run focused tests and `systemd-analyze verify`, then inspect the final
   diff and lesson status.
6. [x] Run the complete applicable deterministic gate, protected review, merge,
   exact VPS installation, manual no-pending acceptance, timer activation,
   next-trigger/readback, and rollback-preserving release closeout.

### Production activation recovery

PR #163 merged the initial candidate, but its first manual service run failed
before the admin container started: `ProtectHome=yes` hid Docker client/plugin
discovery and the base CLI rejected the Compose-only `--project-name` flag. The
timer was never enabled and production proposal/promotion counts remained zero.
The repaired unit invokes the reviewed system Compose plugin directly and sets a
private empty `DOCKER_CONFIG` runtime directory, retaining the intended home and
credential isolation. PR #165 merged the repair as
`a8c61cf74b26d4f7f03ab5aec79b166ba32f60d3`; manual and real timer-triggered
production runs then completed with `no_pending_promotion`, exit zero, no
remaining runner container, and no canonical evidence change.

## Stop triggers

Stop the affected path if scheduling requires a credential in Git or the unit,
public-runtime writer authority, Docker control from the MCP, automatic proposal
acceptance, unbounded processing, destructive schema changes, a second canonical
writer path, or a production conflict that cannot be rolled back by disabling
the exact timer.

## Completion boundary

The task is complete only after protected merge, exact installation of the
reviewed unit bytes, successful no-pending or accepted-fixture service execution,
enabled/active timer readback with a future trigger, unchanged healthy public
runtime identity, and an immutable production receipt. Operational alignment,
scientific adequacy, and release adequacy remain separate.
