# Lab preparation: collection conditions and repeat-draw advice (owner bug reports, 2026-10-10)

## Authority and scope

- Two owner-requested bug reports in UDA's AskRigor lane, filed 2026-10-10 by a ChatGPT reasoning chat:
  - `2026-10-10-blood-draw-hydration-and-pseudothrombocytopenia-preanalytics.md`: before a repeat blood count after an
    unexpected platelet drop, the answer omitted drinking water normally before the draw.
  - `2026-10-10-lipid-panel-dehydration-preanalytic-omission.md`: a borderline LDL was discussed without asking whether
    the person fasted without water, or suggesting a comparable, normally hydrated repeat.
- Both ask for a corrected outcome in future answers, not added keywords, and for the cause to be found first.
- The HRP wording below is a draft. It ships only as exact text the owner approves (owner question 70).

## Diagnosis

- **What HRP already says.** `LabAndTestInterpretation` asks to confirm fasting status and timing (`TestIdentity`) and to
  examine pre-analytic handling (`AnalyticalValidity`). `ClinicalManagementPreservationGate`'s action map asks for
  concurrent prevention and counselling.
- **What is missing.**
  - Nothing tells the AI to give preparation advice before a repeat draw.
  - Nothing names no-water fasting.
  - Nothing keeps the mechanisms apart: concentration effects, microclots from a difficult draw, and EDTA clumping.
  So the failures are partly a real gap and partly a rule the AI didn't apply. They read the lab result as a disease
  question and dropped the collection question.
- **Not known.** No transcript was attached, so whether those chats loaded HRP is unknown.

## Design

1. **HRP 20.6.16** (draft wording below): a rule `PreanalyticReadiness` in `LabAndTestInterpretation`, directly after
   `AnalyticalValidity`; two stress cases after `HarmOnlyInTables`; and check FS219 after FS218.
2. **A checked declaration in `finalize_research`, `lab_preparation`**, required when there are key sources (the
   `full_text_search` trigger):
   - `{ status: "covered", answer_quotes: [...] }`: one to five sentences from `answer_draft` that give the collection
     conditions or the preparation advice. Each must appear in the answer, which is the existing exact quote check.
   - `{ status: "not_applicable", reason }`: the answer interprets no lab result and plans no test. The reason is 10 to
     300 characters.
   - The server never judges whether labs are involved or whether the advice is good. That stays the model's
     declaration, as the project's rule on meaning requires.
   - A chat with an older tool list gets the existing refresh hint.
3. **Tests (no network):**
   - every `lab_preparation` gate case: missing with key sources, covered with matching quotes, a quote not in the
     answer, and not_applicable with and without a valid reason;
   - the next-step contract;
   - placement and exact sentences of the HRP edit, and the chain to 20.6.15.
4. **Acceptance in the live product:**
   - After release, run report cases R1 to R4 for platelets and R1, R2 and R5 for lipids through the AskRigor connector
     in a Claude session, on the owner's plan, so there is no API spend.
   - Record whether each answer gives the preparation advice, keeps the mechanisms separate, and keeps confirmation and
     urgency.
   - This is the "fresh post-change response" both reports ask for. A CI test can't run a model.

## Draft HRP wording (for the owner's exact-text approval)

- **Rule `PreanalyticReadiness`** (priority Critical), after `AnalyticalValidity`:
  > Before treating a lab result as real, and whenever a repeat test is planned, consider the collection conditions
  > that can change the value or the draw: fasting without water or other dehydration, recent strenuous exercise or
  > acute illness, posture and timing, interfering medications and supplements such as biotin, and tube filling,
  > mixing and transport. Ask about them when they are unknown and could change the decision. Before a repeat draw,
  > give brief preparation advice within the laboratory's instructions and any fluid restriction: drink water
  > normally, since plain water is usually allowed during fasting, and repeat under comparable conditions. Keep
  > mechanisms separate: dehydration can concentrate some measured values; a difficult draw or poor mixing can trap
  > platelets in microclots; and EDTA-dependent clumping is a different test-tube artifact that drinking water has not
  > been shown to prevent. Never present a preparation factor as the cause without evidence, use it in place of
  > confirmation such as a blood smear or a citrate-tube count, or let it delay urgent evaluation.
- **Case `RepeatPlateletDrawPreparation`:**
  - Prompt: "Platelets fell from 310 to 90 × 10^9/L, and the person is booking a repeat fasting blood test and asks
    how to prepare."
  - Expected: "Advise a prompt repeat with clinician review, a blood smear, and a citrate-tube count if clumping is
    suspected; advise drinking water normally before the draw unless told otherwise; do not claim that water prevents
    EDTA clumping or explains the result."
- **Case `LipidPanelAfterDryFasting`:**
  - Prompt: "A first lipid panel shows LDL 125 mg/dL after fasting from food and water, and the person asks whether it
    could be falsely high."
  - Expected: "Explain that fasting without water may raise measured lipids modestly, from a small crossover study,
    with no individual correction; suggest a comparable repeat with normal hydration when it would change the
    decision; keep the cardiovascular risk assessment."
- **Check FS219:** "For a lab result or a planned repeat test, collection conditions that could change the value or the
  draw were considered, preparation advice was given before any repeat draw, and no preparation factor replaced
  confirmation or urgent evaluation (PreanalyticReadiness)."
- **Revision entry:** "Owner-approved, question 70 (2026-10-11): added PreanalyticReadiness, which considers collection
  conditions before treating a lab result as real and gives preparation advice before a repeat draw, with two stress
  cases and final check FS219."

## Owner items

1. Question 70: the plan and the exact wording above (A: both; B: the wording only, without the declaration; C: change
   the wording).
2. The release question, after the build.

## Related, not in scope

- Lesson candidate #21 (lesson queue, 2026-10-10, needs review): don't declare research complete while authorized
  leads remain open. It is a separate behavior, and its review comes after this.
