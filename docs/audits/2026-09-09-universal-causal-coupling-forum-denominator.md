# Universal causal-coupling and forum-denominator audit

Date: 2026-09-09

Candidate branch: `task/universal-causal-coupling-forum-signal-20260909`

Base: `0565222b1080f65ee70cde1be8daea160668e978`

## Existing overlap

AskRigor already preserved target variables, evidence direction, specificity,
estimands, dose/regime distinctions, bidirectional formal/community iteration,
forum provenance, partial-access boundaries, and information-gain stopping. The
Forum Signal module already separated firsthand reports from creator claims and
formal evidence, required person × treatment-episode deduplication, and blocked
broad synthesis on incomplete retrieval. Those stronger controls remain.

## Defects found and correction

The canonical protocol did not explicitly keep “what causes the marker” apart
from “is the marker necessary for, predictive of, or mediating benefit.” It did
not force benefit-without-marker, marker-without-benefit, matched-outcome
mediation, common-cause, or strongest strengthen/weaken tests before synthesis.
A tolerability-only comparison could therefore be overread as preserved
efficacy, and a strong formal result could end research despite a material
same-person community discriminator gap.

The forum workflow also permitted directionally enriched discovery searches to
be summarized without a structurally distinct neutral denominator. It lacked a
frozen corpus-plan identity, semantic query-neutrality state, explicit
denominator hierarchy/ledger, complete thread-to-search provenance, independent
thread and user deduplication, inclusive versus strict attribution, and a hard
report lock on prevalence-like language.

Universal 20.5.23 adds two root Critical gates and the eight required final
checks. Runtime contracts now derive causal-coupling coverage and forum
denominator receipts. YouTube discovery records carry corpus purpose, plan hash,
prevalence eligibility, and outside-denominator state through the candidate
frontier. Report synthesis requires exact controller-held receipts for causal-
coupling and forum-frequency claims, blocks unresolved causal receipts, and
blocks prevalence-like wording from discovery-only community evidence. The
Gemini capacity-bounded catalog intentionally omits the primary-corpus plan
input, so that surface remains discovery-only rather than truncating a frozen
plan.

Legacy YouTube survey records without the new provenance fields remain readable
through one normalization boundary and are deterministically classified as
`PHENOTYPE_DISCOVERY`, `prevalence_eligible: false`, and
`outside_primary_denominator: true`. Invalid or missing provenance cannot become
a prevalence permission. No historical record is rewritten.

## Files and derivation path

- `protocols/Universal_Instructions.xml`: canonical 20.5.23 semantics and all
  eight final locks.
- `scripts/protocol-migrations/migrate-universal-20.5.22-to-20.5.23.mts`:
  exact-starting-byte migration, occurrence guards, XML validation, and exact
  inverse recovery.
- `apps/research-mcp/src/causal-coupling-contract.ts` and
  `community-evidence-denominator.ts`: plan, ledger, assessment, receipt, hash,
  deduplication, outcome reconciliation, and legacy-migration contracts.
- Survey, frontier, controller, report-synthesis, semantic-worker, config, and
  catalog files: runtime propagation and synthesis enforcement.
- `project/PROJECT_INSTRUCTIONS.md` and `project/FORUM_SIGNAL_MODULE.md`:
  compact router plus the detailed single authoritative forum method.
- Protocol/router/tool/survey/controller/transport tests and the two new
  regression suites: canonical receipts, legacy compatibility, eight causal
  failure modes, and sixteen forum fixtures.
- `README.md` and `docs/tool-inventory-v0.1.0.json`: current manifest and
  generated public tool inventory.

The derivation is canonical Universal XML → byte-derived protocol manifest →
server policy context and generated Custom GPT artifacts. Forum execution is
frozen corpus plan → provider search receipts → material/deduplicated thread and
person records → denominator ledger → content-hash-bound receipt → controller →
report claim lock. Causal execution is competing-hypothesis plan → matched
discriminator evidence → coverage receipt → controller → report claim lock.

## Intentionally unchanged

HRP 20.5.27 remains byte-identical. No intervention, product, route, syndrome,
or regression-family name is encoded as a production rule. Frozen MAST results,
the eight incomplete Round 1 DEVELOPMENT captures, private payloads, historical
protocol artifacts, provider credentials, spending policy, and source-access
logic were not modified. No research, provider, model, judge, or MAST call ran.

## Validation and release boundary

Focused Node 24.18.0 checks pass for type checking; build; causal/forum regressions;
survey and legacy normalization; controller/frontier compatibility; MCP and
Gemini catalogs; policy transport; project routing; and protocol structure. The
untouched base and candidate full-suite runs timed out in
`controlled-research-route.test.ts` under parallel contention. The candidate
run also timed out `package-entrypoints.test.ts`, which passed alone in 3.34
seconds. Isolating the controlled-route file exposed one stale project-section
receipt hidden behind the timeout; it was corrected and its exact case passed in
6.34 seconds, while the other 15 cases had passed in that isolated run. The
source-bound two-run allowance was consumed by the clean base and first candidate
runs, so protected GitHub CI is the next complete gate. Exact-tree review,
Project Manager acceptance, Phase 2 admission, merge, deployment, plugin/package
synchronization, and fresh product-interface acceptance remain required before
release.

Rollback before merge is deletion/reset of this isolated branch only. After an
ordinary merge, revert the merge commit and restore the recorded prior backend
image, Custom GPT package, plugin registration/package receipt, and active
Universal manifest. Shared history must not be rewritten.
