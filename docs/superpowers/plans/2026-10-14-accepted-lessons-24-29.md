# Six accepted lessons (#24 to #29): mechanisms, table figures, brief symptoms, forum outcomes, corrections and the research target

## Authority and scope

- Lesson candidates #24 to #29 in the private lessons queue, filed 2026-10-14 and accepted by the owner with owner
  question 92 ("92 a", 2026-10-14). Their case details stay in that queue; this public plan describes them in general
  terms.
- **What they report:**
  - **#24:** research meant to find recoveries in one named source drifted to tangential records, mixed a visible
    recovery with a laboratory result, and did not report a source it could not read.
  - **#25:** a rate was attributed to the wrong compound from a multi-column table, and a share of selected text
    passages was presented as a share of people.
  - **#26:** advice on a brief symptom covered too few practical measures and only after onset.
  - **#27:** forum advice was counted as outcomes, a related symptom's relief as the target's, and natural resolution as
    a remedy's effect.
  - **#28:** a mechanism measured in another species and tissue was applied to people and another tissue, and a
    supplement was suggested from it.
  - **#29:** a corrected figure stayed in other parts of an answer, and a failed side tool overshadowed verified results.
- The protocol wording is question 92's owner-approved text (owner questions page), built word for word into HRP
  20.6.23 together with question 90's.

## What already covered them

Of the lessons' 32 requests, 15 were covered by existing rules (6 of them enforced by the server), 14 partly, and 3 not
at all. Most failures are the class plan 86 names: the rule exists, and nothing enforced it at the final step.

## Design

### Protocol (HRP 20.6.23, approved text)

- Mechanisms (#28): steps traced from exposure to outcome with species, tissue, dose, route and time
  (`MechanismIsNotOutcome`); a negative test weakens one mechanism only (`RankRatherThanStack`); an interaction is a
  hazard, not a reason to add a supplement (`NoProtocolStacking`); FS229 widened to species and tissue.
- Table figures (#25): figures read with their titles, headings and footnotes (`ExtractionMinimum`); a share of
  selected reports is not a share of people (QA3).
- Corrections and early answers (#25, #29): corrections reach figures, charts and headings
  (`CorrectionPropagationIsMandatory`); the pre-delivery claim check covers early and partial answers and a figure's
  table row and column (`PreDeliveryResearchClaimCheck`).
- Brief symptoms (#26): the coaching layer's trigger, the new rule `BriefSymptomMeasures`, the output minimum's other
  options listed briefly, and FS232.
- Forum reports (#27): onset and natural resolution, and the target symptom apart from an accompanying one
  (`ContextExtraction`, FS215).
- The research target (#24): the user's source classes carried forward (`PrimaryOutcomeContinuity`, FS217), resultless
  records about another intervention left out (`ExtendedEvidenceOutput`), a correction's identifier checked
  (`UserReportedUseFidelity`), and no substitute question for an unreadable source (`NoSilentAccessFailure`).
- Six stress cases, one per lesson.

### Server checks (`finalize_research`)

Each enforces an existing or newly approved rule as an exact check of what the model declares, so the checks work in
any language; meaning stays the model's declaration.

- **A share of selected reports (#25):** `safety_claims` basis `share_of_reports`. Its sentence needs the number, a study
  is optional (the reports may be posts), and the answer states "That figure is a share of selected reports, not of
  people, so how often this happens isn't known." (or, for a safety claim, that it doesn't show how safe the exposure is).
- **How forum threads were chosen (#27):** `community_searches[].thread_selection`, the review sites' frames for threads.
  Threads read without it get a declaration step with the tool-list refresh hint; threads ranked first, found by
  searching for outcomes or otherwise partial get the review sites' caveat in thread form.
- **Corrections (#29):** an optional `corrections` list, each the wrong statement and the answer's sentence saying what
  changed. The change sentence must be shown, and the wrong statement must appear nowhere else in the shown answer,
  headings, tables and summaries included.
- **Species and tissue (#28):** `mechanism_claims[].evidence_in` (people or animals, required) and an optional `tissue`
  difference. Animal evidence gets "This finding comes from animal experiments in {study}; it was not tested in people.",
  merged with the route caveat when the routes differ too; a tissue difference gets "This finding was measured in
  {measured} in {study}, not in {claimed}." A test on cells in a dish keeps the route caveat alone.

### Recurring-finding check

#28 repeats issue #330's class, a mechanism borrowed from another experimental context. Per UDA's recurring-finding
check, `mechanism_claims` is generalized from route to evidence context (species and tissue) instead of adding a new
declaration for each axis.

## Tests

- `tests/finalize-recommendations-and-lesson-checks.test.ts`: each check and caveat above, and question 90's
  `recommendations`.
- `tests/research-finalization-gate.test.ts`: the thread-selection step and caveat.
- The exact protocol text and its byte-exact reversal, as for plans 86 to 89.
- The lessons' cases join `docs/owner-regressions.md`.

## Privacy

The new inputs are request-local and are not stored or logged; `docs/privacy-data-map.md` records them.

Status: approved "92 a" on 2026-10-14; built on #333 with question 90. Going live waits for the owner's release answer
("91 b": one release once 90 and 92 are built).
