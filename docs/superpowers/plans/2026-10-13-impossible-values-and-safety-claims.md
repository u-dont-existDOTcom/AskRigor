# Physically impossible values and overstated safety (issue #331), as additions to plans 86 and 87

## Authority and scope

- AskRigor issue #331, filed 2026-10-13 at 00:37 UTC from the owner's account.
- **The impossible value:** a 2026 conference abstract on thiolated cashew gum reports "sulfhydryl incorporation
  reaching up to 96 mmol/g polymer". With at least one sulfur atom (32.065 g/mol) per thiol group, that is 3,078 mg
  of sulfur per gram, 307.8% by mass. That is physically impossible: even pure sulfur holds at most 31.19 mmol/g.
- **The overstated safety:** the same abstract calls the gum "safe" on the basis of an acute 2,000 mg/kg animal test
  with no deaths and no detected liver or kidney toxicity, with no denominator or follow-up.
- **Lineage:** a 2024 thesis and this abstract come from one investigator group, so they are not independent trials.
- The issue asks:
  - for stoichiometry bounds on scientific concentration values;
  - that the exact reported quantity be kept but marked impossible as printed, with no invented correction;
  - that a negative safety finding be read for its denominator, route, specimen and time;
  - for tests on the final answer.
- The wording below is a draft. It ships only as exact text the owner approves (owner question 89).

## Design: additions to plans 86 and 87, no new mechanism

1. **Plan 86's `harm_claims` becomes `safety_claims`**, covering both directions with one declaration:
   - **What it lists:** each sentence that warns of a harm, or calls something safe or harmless.
   - **Each entry** gains `direction` (`harm` or `safety`); the bases, the exact checks and the key-source binding are
     unchanged.
   - **New caveat:** a `safety` sentence resting on `hazard_measurement`, or on an acute or short animal test, makes
     the answer say "This rests on {measured_exposure}, not on observed safety in people using {exposure}, so
     long-term or rare harms are unmeasured."
2. **Plan 87's `reported_figures` gains `plausibility`:** `consistent`, `inconsistent_with_own_data` or
   `impossible_as_printed`.
   - `impossible_as_printed` needs a one-line reason, such as "307.8% sulfur by mass".
   - It keeps the value exactly as printed.
   - It makes the final check require the sentence "The value {value} in {marker} is physically impossible as
     printed, so it is not used." The answer must not supply a corrected value of its own.
   - Which values to check stays the auditor's judgment. The arithmetic and its reason are recorded with the evidence
     block.
   - `inconsistent_with_own_data` also covers a mismatch that numbers alone can't show, such as an abstract that
     gives a table's value under the wrong treatment label (issue #332, a fixture). Its reason names both places.
3. **Protocol wording** (draft below): one stress case and final check FS230, pointing to the existing
   `LogicArithmeticAndCitationIntegrity` and `NullEvidenceAndSafetyLanguage`.
4. **Tests:** the new direction and caveat, the plausibility values and their caveat, the exact protocol text. #331
   joins `docs/owner-regressions.md`.

## Draft wording (for the owner's exact-text approval)

- **Case `ImpossibleStoichiometry`:**
  - Prompt: "A conference abstract reports thiol groups at 96 mmol per gram of a modified gum, which would be more
    sulfur than the gum's own mass, and calls the gum safe after one acute high-dose animal test."
  - Expected: "Report the value as printed and say that it is physically impossible as printed, without inventing a
    corrected unit; say that the animal test shows no acute deaths or detected organ toxicity at that dose, not
    safety for long-term human use; treat a thesis and an abstract from the same group as one line of evidence."
- **Check FS230:** "A reported value that is physically impossible as printed was kept as printed, marked impossible
  and not used, with no invented correction, and no safety claim went beyond the denominator, route, specimen and
  duration of its evidence (LogicArithmeticAndCitationIntegrity, NullEvidenceAndSafetyLanguage)."
- **Revision entry:** "Owner-approved, question 89 (2026-10-13), from issue #331: a stress case and final check FS230
  keep a physically impossible reported value as printed but unused, and keep a safety claim within its evidence."

## Owner items

1. Question 89: the additions (sections 1 and 2) and the wording above, built with 86 to 88. A: all; B: the server
   additions only; C: change a wording.

Question 89 answered "89a" on 2026-10-14; built on #333 with 86 to 88: HRP 20.6.22, safety_claims in both directions with the safety caveat, and reported_figures plausibility with the impossible-value caveat.
