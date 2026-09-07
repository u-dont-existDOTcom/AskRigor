# Universal normality / base-rate gate

Status: canonical-integration patch, not yet active in `protocols/Universal_Instructions.xml`.

Baseline inspected: AskRigor `main` at `15110e2398716724f7366ce4978ac20701519dfc`; `protocols/Universal_Instructions.xml` is Universal 20.5.17 with blob SHA `69b9865bd4bd887423a0df8987c28bde335960ee`.

## Failure being repaired

A question asking whether an observation is **normal/common/typical/unusual/rare** was answered from evidence that the mechanism is physiologically possible and nonpathological. That changes the target from population frequency/distribution to mechanistic plausibility.

The current Universal already contains target-preservation, evidence-direction, specificity, quantitative-risk, and risk-language checks. Those are adjacent but insufficient. The risk-language rule constrains denominator language for risk claims; it does not impose the domain-general rule that physiological plausibility, experimental demonstration, or nonpathological status cannot establish population commonness.

## Required canonical rule

Add a Critical `normality_base_rate_gate` adjacent to the target-preservation/evidence-discrimination controls:

> **Normality/base-rate check:** When the question asks whether an observation is *normal, common, typical, unusual,* or *rare*, treat **population prevalence/distribution** as the target variable. Do not infer commonness from physiological plausibility, a known mechanism, nonpathological status, or the fact that the response has been experimentally demonstrated. Prefer direct prevalence, frequency, reference-range, or population-comparison evidence matched to the phenomenon, population, conditions, magnitude, timing, and threshold. Distinguish **possible**, **nonpathological**, and **common** explicitly. If prevalence is unknown, say so rather than translating mechanistic evidence into a frequency claim. Preserve high-information qualifiers such as *a lot, immediate, after only a small amount,* and non-reactive comparison conditions; an ordinary mechanism can still produce an unusually strong or low-threshold response. For frequency questions, explaining **why X can happen** does not answer **how often X happens**.

## Structural integration

1. Advance Universal from 20.5.17 to 20.5.18 with revision date 2026-09-07.
2. Add `Normality-Base-Rate` to the Protocol `fullName` gate list.
3. Add a 20.5.18 revision-history entry describing the target-frequency repair.
4. Add the Critical gate near `<evidence_discrimination_gate>` / target-preservation controls.
5. Add a point-of-generation check immediately after Target-preservation:

   `Normality/base-rate check: If the question asks whether something is normal, common, typical, unusual, rare, frequent, or prevalent, did I preserve population prevalence/distribution at the stated magnitude, timing, threshold, conditions, and population as the target? Did I avoid inferring commonness from mechanism, plausibility, experimental demonstration, or nonpathological status? If direct frequency evidence is unavailable, say so and label any estimate as inference.`

6. Add a regression asserting that a normal mechanism is not sufficient evidence that a conspicuous response is common.
7. Preserve the existing risk-language rule; this gate generalizes it rather than replacing it.

## Release / integrity requirement

Do not patch derived manifests or tests by hand merely to make checks green. Follow the derivation graph recorded in `docs/superpowers/plans/2026-09-07-universal-20.5.17-reconciliation.md`, regenerate canonical derived outputs where generators exist, update intentional independent version/digest pins only after the reviewed XML is frozen, then run the repository's full `npm run verify` gate. Do not merge if protocol digest, frontier manifest, release packet, or generated Custom GPT artifacts disagree with the frozen Universal bytes.

## Acceptance cases

- `Hot tea can trigger thermoregulatory sweating` + no population-frequency evidence must **not** license `visible heavy sweating after tea is normal/common`.
- If direct prevalence is unknown, answer `prevalence unknown` and separately state whether the mechanism is plausible/nonpathological.
- If the ordinary mechanism is widespread but the observed **magnitude, immediacy, dose threshold, or selectivity** is unusual, preserve that distinction rather than normalizing the magnitude from the mechanism.
- If representative prevalence/reference-distribution evidence exists, use it as the primary evidence for normality/commonness.
