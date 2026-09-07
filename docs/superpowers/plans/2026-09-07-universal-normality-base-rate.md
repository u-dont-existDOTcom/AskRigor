# Universal normality / base-rate gate

Status: Project Manager-reviewed integration specification; not active in `protocols/Universal_Instructions.xml`. This remains a plan-only PR. No canonical protocol, runtime, test, release, or deployment change is authorized by this document alone.

Baseline inspected: AskRigor `main` at `15110e2398716724f7366ce4978ac20701519dfc`; `protocols/Universal_Instructions.xml` is Universal 20.5.17 with blob SHA `69b9865bd4bd887423a0df8987c28bde335960ee` and exact-byte SHA-256 `1091bda42dd6e92116dc7a7d4a67d7c1a94c19a891528a7755789485cf5874c1`.

## Failure being repaired

A question asking whether an observation is **normal/common/typical/unusual/rare** was answered from evidence that the mechanism is physiologically possible or nonpathological. For a frequency question, that changes the target from population frequency/distribution to mechanistic plausibility.

The preceding plan identifies adjacent target-preservation, evidence-direction, specificity, quantitative-risk, and risk-language controls. The proposed addition makes the frequency-target rule explicit rather than replacing those controls.

## Project Manager review correction

The original plan's unconditional treatment of every use of **normal** as population frequency was too broad. An explicitly nonpathological, safety, reference-range, or normative question must not be silently converted into a prevalence question either. Resolve the intended target from context; when several meanings matter, separate them rather than defaulting to reassurance or requiring a ceremonial clarification.

This correction does not soften the original frequency repair: mechanistic plausibility, experimental demonstration, and nonpathological status cannot by themselves establish commonness. It also prevents the reverse unsupported inference: unknown prevalence is not evidence of rarity, and a conspicuous reported response is not automatically shown to be statistically unusual. Pathological status, safety, commonness, and position in a reference distribution need their own appropriate support.

## Required canonical rule

Add a Critical `normality_base_rate_gate` adjacent to the target-preservation/evidence-discrimination controls:

> **Normality/base-rate check:** Preserve the intended meaning of *normal* from the question and context. For questions about *commonness, typicality, rarity, frequency,* or statistical normality, keep **population prevalence/distribution** as the target; do not substitute mechanistic plausibility, experimental demonstration, or nonpathological status. Use relevant prevalence, frequency, reference-distribution, or population-comparison evidence matched to the phenomenon, population, conditions, magnitude, timing, threshold, and non-reactive comparison conditions. For an explicitly nonpathological, safety, reference-range, or normative question, answer that target with appropriate evidence rather than silently replacing it with frequency. If meanings overlap, distinguish **possible**, **common**, **within a reference range**, **nonpathological**, and **safe** only as relevant and supported. Unknown prevalence is neither commonness nor rarity; say what is unknown, and label any evidence-based estimate and its limitations without inventing a percentage. Preserve qualifiers such as *a lot, immediate,* and *after only a small amount*; a familiar mechanism does not establish the distribution of that exact response. For frequency questions, explaining **why X can happen** does not answer **how often X happens**.

## Structural integration

1. Retain 20.5.18 as the proposed normality-only successor to 20.5.17, with planned revision date 2026-09-07. Before implementation, verify that this version remains unoccupied and the baseline unchanged; concurrent canonical changes require a new explicit version reconciliation, not an inferred merge.
2. Add `Normality-Base-Rate` to the Protocol `fullName` gate list.
3. Add the revision-history entry describing the target-frequency repair and preservation of other explicit meanings of normal.
4. Add the Critical gate near `<evidence_discrimination_gate>` / target-preservation controls.
5. Add a point-of-generation check immediately after Target-preservation:

   `Normality/base-rate check: What meaning of normal is actually being asked? For commonness, rarity, frequency, or statistical-normality claims, did I preserve the relevant population distribution at the stated magnitude, timing, threshold, conditions, and comparison context? Did I avoid substituting mechanism, experimental demonstration, or nonpathological status for frequency, or frequency for safety or an explicit normative target? If evidence is unavailable, state the unknown without inventing commonness, rarity, or a percentage.`

6. Add regressions for the frequency failure and the opposite target-substitution error. Test the emitted guidance and its placement as well as literal source presence; deterministic delivery tests alone are not evidence of improved model performance.
7. Preserve the existing risk-language rule and all non-waivable research, privacy, authority, and spending gates.

## Release / integrity requirement

Do not patch derived manifests or tests by hand merely to make checks green. Follow the derivation graph recorded in `docs/superpowers/plans/2026-09-07-universal-20.5.17-reconciliation.md`, regenerate canonical derived outputs where generators exist, update intentional independent current-version/digest pins only after the reviewed XML is frozen, then run the repository's full `npm run verify` gate. Historical fixed-version evidence and independent expected-value checks must not be rewritten to mirror the value under test. Do not merge a canonical implementation if protocol digest, frontier manifest, release packet, or generated Custom GPT artifacts disagree with the frozen Universal bytes.

Green checks for this plan-only commit do not establish that 20.5.18 exists, is loaded, improves reasoning, or is released. Implementation, runtime acceptance, and release require their own source-bound authority and applicable gates. HRP remains unchanged.

## Acceptance cases

- `Hot tea can trigger thermoregulatory sweating` plus no population-frequency evidence must **not** license `visible heavy sweating after tea is normal/common`.
- Unknown prevalence must remain unknown; it must not become `rare`, `abnormal`, or `safe` by inference from missing data. Assess mechanistic plausibility and nonpathological status separately only when supported.
- Preserve magnitude, immediacy, dose threshold, selectivity, and non-reactive comparisons. Do not call those qualifiers statistically unusual without matched evidence.
- Representative matched prevalence/reference-distribution evidence is primary for frequency/statistical-normality claims. A reference interval is not automatically a safety threshold or a prevalence estimate for a differently defined event.
- An explicit request about danger or pathology must be answered on that basis without an unrelated demand for an incidence percentage.
- An explicit normative or technical-definition use of normal must not trigger a population-frequency workflow merely because of the word.
- Where an ambiguous normality question combines frequency and concern, separate the relevant meanings and their evidence limits; do not resolve ambiguity by unsupported reassurance.
- A source-presence or packet-delivery test passing must not authorize bypassing a required module or claiming behavioral efficacy.

## Queue separation

PR #193 owns only this normality/base-rate plan and any separately authorized implementation of it. It does not absorb the reasoning-selection supplement, its server-packet delivery work, or an unreviewed lesson. Those changes need separate source-bound specifications and version reconciliation after the accepted canonical baseline is known. PR #190 retains its exact pinned integration scope and admission blocker. No credential provisioning, service change, study rerun, or reopening of closed transport diagnostics follows from this plan review.
