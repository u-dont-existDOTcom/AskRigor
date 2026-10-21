# Owner answer 145a: a background scout settles its real cost

Date: 2026-10-21. Status: **PLANNED**, on local branch `build-145a-20261021` from `b2a356d3`
(`build-next-20261021`). Nothing here is merged, released or deployed.

## Authority and scope

Question 145 (owner-pages `95314b7`), option a: "in the next build, a scout that finishes later settles its real cost
and releases the rest of its hold, as one-call scouts already do". The owner answered "145a" on 21 Oct (about 13:00
UTC); the ledger part ("set the ledger to [the real October spend]") was done by hand in production at 13:02 UTC and is
not part of this build.

Today every Gemini scout reserves $1 (`GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD`) from the shared $50 monthly ledger
(`apps/research-mcp/src/lessons/ai-budget.ts`). A one-call scout commits its real cost and the rest is refunded. A
background scout that returns progress forfeits its reservation; later polls carry `accounted_nano_usd` and reserve
nothing; the call that completes has no reservation, so the whole $1 stays charged. A month therefore allows about 50
background scouts, whatever they cost (October: the ledger reached $50 on 17 Oct; Google billed about $13).

Rules: no new MCP tool, no tool input change, no `protocols/*.xml` change; the $50 cap, the $1 per-scout maximum, the
ledger file's format and its safety checks stay; tests use fakes; no production call, no push.

## Design

1. **A hold.** `BudgetReservation.hold()` ends a reservation like `forfeit()` (the whole amount stays charged) and
   returns a record a later call can settle: a random hold identity, the amount held and the ledger's UTC month.
   `AiBudget.settle(hold, actual)` refunds `held - actual` to that month's ledger, nothing once the month has ended
   (as `commit` does), and refunds each hold at most once.
2. **Carried with the job, not stored.** The executor (`executeResumableAutomatedGeminiScout`) returns the hold with
   its progress and takes it back with the resume. The MCP tool carries it in its signed continuation token
   (`scout-continuation.ts`, HMAC-SHA256 under a domain-separated key, deflated; signed, not encrypted: the hold is
   not sensitive, and the signature stops a client from changing it). Research sessions carry it in the scout state
   (`scout.budget_hold`), inside the AES-256-GCM session checkpoint, only while the scout is in progress.
3. **Settled where the cost is known.** On the call that completes a resumed scout, after the over-budget check and
   before validation (where a one-call scout commits), the executor settles the hold with
   `calculateGeminiScoutNanoUsd(usage)`. A ledger that cannot record it keeps the whole hold charged and the completed
   scout is still returned. A boundary, a failure, an over-budget completion, an abandoned or expired job, and a
   token or session from before this build keep the hold charged, as today.
4. **Once only.** The ledger file holds one aggregate number per month, and a continuation token can be replayed, so
   no check on the ledger alone can tell whether a given hold was settled. What makes a second refund impossible:
   - the budget remembers, in memory under its mutex, the holds it settled this UTC month (one budget object per
     ledger path per process; bounded), and records a hold before writing its refund, so a write that fails part-way
     keeps the hold charged rather than risk two refunds;
   - the sources layer reports a background scout complete only after its stored Gemini interaction was deleted, and
     a later poll of a deleted interaction is a boundary, so after a restart a replayed token cannot complete again.
   A retried completion in the same process refunds nothing more. Restart-proof once-only that does not rest on the
   provider's deletion would need a small store (proposed in the report: one owner-only marker file per settled hold,
   created with `O_EXCL` beside the ledger, removed when its month ends).

## Files

- `apps/research-mcp/src/lessons/ai-budget.ts`: `BudgetHold`, `budgetHoldSchema`, `hold()`, `settle()`.
- `apps/research-mcp/src/actions/gemini-scout-route.ts`: hold at progress, pass it through held progress, settle at a
  resumed completion.
- `apps/research-mcp/src/scout-continuation.ts`, `apps/research-mcp/src/register-tools.ts`: the token carries it.
- `apps/research-mcp/src/actions/research-session-controller.ts`, `apps/research-mcp/src/research-session-runtime.ts`:
  the session's scout state carries it while in progress.
- `evaluation/instruction-optimization/discovery-bench/scout-probe.mts`: passes it back like the checkpoint.
- Docs: `docs/privacy-data-map.md` (the ledger row, the controller checkpoint row, the MCP token),
  `docs/custom-gpt-actions-setup.md`, `docs/gemini-spark-setup.md`, `docs/research-session-resumability-threat-model.md`.

## Tests

- Budget (real ledger file): a hold settles once; a restarted budget settles a hold made before the restart; a hold
  from an ended month refunds nothing; an actual above the hold or a malformed hold is refused.
- Executor (real ledger file, fake provider): a background completion refunds the unused hold once; a retried
  completion refunds nothing more; a completion in a new month refunds nothing; a boundary, a failure, an over-budget
  completion and an abandoned job keep the hold.
- MCP tool: the token carries the hold to the next call. Research session: the hold is kept while in progress and
  settled at completion.
- `npm run verify` green before the last commit.
