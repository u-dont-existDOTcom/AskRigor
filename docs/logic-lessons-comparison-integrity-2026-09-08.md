# Logic lesson: comparison integrity (2026-09-08)

## Trigger

A psychedelic anti-inflammatory comparison exposed a sequence of reasoning failures: an assistant-introduced five-compound example silently became the comparison set; a fixed 0.5 mg/kg screening response was sorted as though it were potency; noisy point estimates were rendered as a strict ordinal ranking; and one-shot screen hits were initially presented too similarly to DOI, which had deeper dose-response and orthogonal validation. Follow-up also required separating ayahuasca from DMT and not inferring ibogaine anti-inflammatory efficacy from generic 5-HT2A agonism.

## Durable lessons

1. **Preserve the reference set.** Examples and salient subsets do not redefine the user's requested universe.
2. **Preserve the estimand.** Fixed-dose response, Emax, potency, exposure, surrogate response, and clinical efficacy are different quantities.
3. **Check whether a ranking is resolvable.** Sorting point estimates is not evidence that adjacent items are distinguishable.
4. **Separate effect magnitude from evidence depth.** Dose-response, replication, orthogonal endpoints, and mechanistic discrimination change confidence independently of the raw point estimate.
5. **For cross-drug comparisons, interrogate exposure.** Equal mg/kg is not equal molar dose or target-tissue exposure.
6. **Use dose rescue as a discriminator.** Lower-dose loss can support lower potency; failure of escalation to rescue a partial response can support lower Emax, subject to exposure/toxicity.
7. **Preserve composite attribution.** A mixture is not its headline ingredient; component and mixture evidence do not transfer automatically.
8. **Mechanism must discriminate positives from negatives.** Existing Universal specificity and evidence-direction gates already cover this; no duplicate rule was added.

## Architecture decision

Universal 20.5.21 receives the domain-general reference-set/estimand/ranking/evidence-depth gate. HRP 20.5.25 receives the health/pharmacology implementation for fixed-dose screens, dose/exposure comparability, dose-rescue logic, endpoint hierarchy, and mixture attribution. Existing specificity, evidence-direction, target-preservation, estimand, and Dose-Regime controls are retained rather than duplicated.

## Regression cases

- A prior assistant mentions five compounds, then the user requests a source-based ranking: do not silently restrict the source-defined eligible set to five.
- A multi-drug screen uses one deliberately saturating dose: report efficacy/response at that dose; do not infer potency order without dose-response/exposure-response data.
- Point estimates have wide overlapping uncertainty: use tiers/ties/indeterminate order rather than a false strict ranking.
- Compounds share mg/kg but differ in molecular weight and pharmacokinetics: do not assume exposure matching.
- One compound has only a one-shot surrogate result while another has dose-response plus orthogonal validation: separate numerical screen result from evidence confidence.
- DMT evidence differs from ayahuasca evidence: preserve mixture/component attribution.
- A compound shares 5-HT2A agonism with active agents but a matched agonist control is inactive: receptor agonism alone is not a discriminating explanation.

Canonical receipts after this patch:
- HRP 20.5.25 SHA-256 `2da6edf410c54182b3aa333d7cf9e9a11c24cf86138dfcaa508b019e3a84e2e9`
- Universal 20.5.21 SHA-256 `c85378c9993731bf93daa65a9d49438d25b1008e065bd3eb9aaac215c0af1426`
