# Evidence graphics: original-prompt regression and cross-domain smoke tests

## Parent owner outcome

The original health question alone should produce the decision-relevant results, not only a cancer-prevention headline, and display comparisons clearly before detailed text. This fixture preserves the exact user prompt:

> do people who get colonoscopies regularly have lower or higher rates of colon cancer or other disease or mortality?

The model must distinguish **being offered one colonoscopy** from actually undergoing it, the rates of diagnoses versus cancer deaths and all deaths, serious and common harms, sedation and bowel-preparation burdens, long-term nonfatal unknowns, and the option of a stool-testing screening program with follow-up after a positive test. It must show uncertainty and avoid blanket advice that nobody should screen.

## Source-bound reference data

- NordICC 2026 trial: PMID 42102826, DOI `10.1016/S0140-6736(26)00508-8`; randomized invitation versus no invitation, 13 years; 42% uptake. Relative risks: diagnoses 0.81 (95% CI 0.71–0.90), cancer death 0.88 (0.68–1.08), all-cause death 1.00 (0.97–1.03). Figures are adjusted cumulative-risk comparisons; raw events should not be confused with the reported time-to-event percentages.
- NordICC 2016 procedure/pain report: PMID 27214731, DOI `10.1001/jamainternmed.2016.0960`; among pain questionnaire respondents 20.3% moderate/severe pain during, 9.4% within the next 24 hours; four-country 12,574 completed procedures, 18 post-polypectomy bleeds, one perforation. The later three-country NordICC analysis uses a different source denominator.
- These are different populations/time windows, and not a complete longitudinal accounting of all harms. Figures must not be combined as though all measurements were randomized or interchangeable.
- Screening alternatives and outstanding delayed/long-term harm questions belong in the answer, even if they cannot be plotted with precision.

## What is actually tested

`node --test evaluation/visual-smoke/review-graphic.test.mjs`

The runnable test uses a **source-backed structural graphic manifest** and two explicitly **synthetic** fixtures (randomized website A/B and modeled annual electricity costs). It checks that an already-produced graphic:
1. Shows 1–3 main conclusions and covers named decision-relevant concepts.
2. Shows full titles and all essential outcome labels without hover; supplies accessible text.
3. Binds source identifiers, displayed point estimates, 95% CIs, populations, denominators, time windows, and evidence classes; never invents CI for descriptive costs or unknown outcomes.
4. Uses RR=1 or risk-difference=0 reference lines, zero bar-chart baselines, and a keyboard/touch accessible CI explainer.
5. Rejects invalid direct comparisons across invitation and procedure exposures, and rejects invented numerical causal fractions.
6. Exercises deliberately broken graphics to prove those specific failure checks can fail.

## What this test **does not** establish

A structural manifest is not an actual AskRigor model output, an independent scientific/semantic review, or a rendered accessibility/visual audit. A future end-to-end evaluation must run the exact original prompt through the deployed AskRigor path with no steering, inspect its first complete answer, and evaluate visible desktop/mobile screenshot output independently. These checks should be recorded separately, not faked by the structural test results.

A separate interactive HTML prototype was inspected in this development session at 1200px and 390px, with tab switching and no horizontal overflow. It is **not** proof of production renderer behavior and is not part of this repo's shipped UI.

Related development issue: AskRigor #489. The prior error class was scientific omission of common pain and long-term harm limits as well as mismatched chart axes and denominators, not simply visual styling.
