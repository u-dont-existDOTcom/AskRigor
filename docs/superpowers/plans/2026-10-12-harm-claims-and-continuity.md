# Harm warnings and key terms checked at the final step, and AskRigor kept active in later turns (issues #324 to #326, #328)

## Authority and scope

- AskRigor issues #324, #325 and #326, filed 2026-10-12 from the owner's account, from a continuing Sri Lankan
  plant-efficacy study.
- They report:
  - **#324:** "Bacopa can cause nausea, abdominal cramps and increased bowel movements" was given with no rates,
    although a randomized trial reports nausea in 18% on Bacopa versus 4% on placebo.
  - **#325:** metal concentrations measured in a lab-extracted alginate became "do not consume wild seaweed".
  - **#326:** a "continue" turn without an @AskRigor mention dropped HRP and finalize_research.
- The protocol wording below is a draft. It ships only as exact text the owner approves (owner question 86).
- **Attribution correction (owner, 15:02 UTC):** the original Bacopa and seaweed warnings came from a continuation
  in which full HRP was not loaded and verified. They are evidence of missed reactivation (#326), not of active rules
  that judged those sentences compliant. The continuity item and the task-time reminder below are therefore the
  primary fix; the harm declaration is the enforcement point once the final check runs.
- **#328 (15:03 UTC):** a later continuation did load HRP 20.6.21 and Universal 20.5.41, then wrote that most
  seaweeds carry organic arsenic while hijiki carries mostly inorganic arsenic, without explaining what those words
  mean or why the difference changes toxicity. The issue asks for each stage to be measured separately: protocols
  loaded, triggered checks executed, final check passed.
- The cases are generic; the reports carry no personal details.

## Why this needs a mechanism, not another rule

All three reports note that the rules exist; the same class of failure recurs (rules on paper, not executed in a
later turn). Following the recurring-finding check (UDA `patterns/reasoning-selection.md`) and UDA's task-time
activation pattern (`patterns/task-time-lesson-activation.md`: activation plus an enforcement point), this plan
targets the mechanism.

Checked on main at 808fb78a:

- **The rules exist.**
  - HRP `QuantitativeRiskAndResearchAudit` (raw counts, denominators, comparator; "Never present a risk in
    isolation").
  - `AdverseEventAscertainmentAndActionabilityAudit`.
  - `EpistemicSafetyRules` (`RelevanceBeforeWarning`, `HazardIsNotRisk`, `DoseRouteFormContextComparator`).
  - `NullEvidenceAndSafetyLanguage` (`SafetyClaimScope`, `HazardExposureRiskSeparation`).
  - Universal's risk-language and risk-contextualization checks.
- **Terms (#328):** HRP's `AudienceAccessibleTerminologyGate` (`PlainLanguageThenTechnicalNuance`,
  `TerminologyLedger`) and Universal's terminology-accessibility check already require plain-language definitions
  at first use. Nothing enforces them either.
- **Nothing enforces them.**
  - `finalize_research` has no field or check for harm or safety sentences.
  - Its `absence_claims` covers only the reassuring direction ("no evidence of harm").
  - HRP's `ServerCompletionGate` says the server checks only community and key-study work.
- **Only the reassuring direction has a named rule** (`NoWeaselSafetySubstitution`). No rule or final check names a
  bare "can cause …" warning, or a warning resting on a hazard measured in a different exposure.
- **Nothing reminds the AI in a later turn.**
  - Research tool results carry only `research_receipt`.
  - `finalize_research`'s description is deliberately descriptive, after ChatGPT's safety check flagged imperative
    wording.
  - The server instructions and the plugin skill say nothing about later turns.
  - Universal's `canonical_protocol_execution_gate` applies HRP to every research task and requires
    `finalize_research`, but no text says that a "continue" turn without a mention is still that task.
- **The server can't know a task is open.** Each MCP request gets a new server with no session ID, and receipts are
  stateless signed tokens. A server-side "you haven't finalized" check is therefore not possible; the levers are the
  final check's declarations and the text each tool result carries.

## Design

### 1. `finalize_research` declaration `harm_claims` (the enforcement point for #324 and #325)

- **What it lists:** each sentence of the answer that warns that something can cause harm, is unsafe, toxic or risky,
  or should be avoided because of a possible harm. An empty list means none.
- **When required:** whenever there is an `answer_draft`, like `absence_claims` and `scale_results`.
- **Each entry:**
  - `quote`: copied from `answer_draft`, and checked to occur in it;
  - `exposure`: what the warning is about (substance, form, dose and route), as the model declares it;
  - `basis`: one of
    - `comparative_rates`: a controlled comparison reports the harm in each group;
    - `observed_rates`: a rate without a comparator, such as a cohort, registry or case series with a denominator;
    - `case_reports`: reports showing that the harm can occur, without a denominator;
    - `hazard_measurement`: a laboratory, in-vitro, animal or composition measurement, not observed harm in people;
    - `not_quantified`: no source found gives a rate;
  - `measured_exposure`: what the cited evidence actually measured, required for every basis except
    `not_quantified`;
  - `studies`: the sources it rests on (DOI, PMID or PMCID), required for every basis except `not_quantified`.
    Each must also be a declared key source, so its read depth, visible link and receipts are checked as for any
    key study.
- **Exact checks** (the server never judges what a sentence means):
  - the quote occurs in the answer;
  - for `comparative_rates`, the quote contains at least two numbers (one per group);
  - for `observed_rates`, the quote contains at least one number;
  - the studies are present and declared as key sources.
- **Caveats the answer must include,** each as its own sentence:
  - `case_reports`: "Case reports show that this harm can happen, not how often it happens."
  - `hazard_measurement`: "This warning rests on measurements of {measured_exposure}, not on harm observed in people
    using {exposure}, so how often it would cause harm wasn't measured."
  - `not_quantified`: "How often this happens wasn't quantified in the sources found here."
- **Next steps:** descriptive, never imperative. A missing declaration gets the usual connector-refresh hint.
- **The tool's description of the field:** "Records each sentence of the answer that warns that something can cause
  harm, is unsafe, toxic or risky, or should be avoided because of a possible harm, with what it is about, its basis
  and the sources it rests on (an empty list if none)."
- **Privacy:** `docs/privacy-data-map.md` records the new field. It holds sentences from the answer draft and is not
  stored, as for `absence_claims`.

### 1b. `finalize_research` declaration `key_terms` (the enforcement point for #328)

- **What it lists:** each specialized term that the answer's conclusions depend on, such as a chemical species, a test
  or a statistical measure, with the sentence that first explains it in plain words. An empty list means none.
- **When required:** whenever there is an `answer_draft`.
- **Each entry:** `term`, as the answer writes it, and `explanation`, the sentence copied from `answer_draft`.
- **Exact checks:**
  - the explanation occurs in the answer and contains the term;
  - the term's first occurrence in the answer lies inside that explanation.

  Which terms count, and whether the explanation is good, stay the model's judgment. The checks work in any language,
  because the model declares the term as the answer writes it.
- **The tool's description of the field:** "Records each specialized term that the answer's conclusions depend on,
  such as a chemical species, a test or a statistical measure, with the sentence that first explains it in plain
  words (an empty list if none)."

### 2. Research results carry one descriptive sentence (the task-time reminder for #326)

Every tool result that carries a `research_receipt` (`withResearchReceipt`) adds one line after the receipt:

> Answers that use this research are checked with finalize_research before they are given, in this turn or a later
> one.

It is descriptive, like `finalize_research`'s own description, and it reaches the AI at the moment it researches in
any turn. A later turn that calls no research tool is covered by the protocol item in section 3 alone.

### 2b. A standing list of owner-reported regressions, measured in stages (#328)

- `docs/owner-regressions.md` lists each owner-reported regression as a synthetic prompt with its pass criteria:
  - today's #324, #325, #326 and #328, and #329 to #332 (plans 87 to 89);
  - #332 is a source-evaluation fixture rather than a runtime failure: an abstract that swaps a table's treatment
    labels, a text-versus-table mismatch, a malformed uncertainty, and a methods step that is not reported (kept
    as not reported, not as omitted);
  - the earlier contested-evidence, handoff and review cases.
- Every release's acceptance runs them through the refreshed ChatGPT app in Codex, and the release record reports
  three stages separately for each:
  - **loaded:** the answer names the current protocol versions;
  - **executed:** the triggered checks are visible in the output, such as rates against a comparator or a term
    explained at first use;
  - **finalized:** `finalize_research` was called with the new declarations and passed.
- The Claude session judges the output against the criteria. This is meaning, so it stays a model judgment recorded
  with its evidence, not a word list.

### 3. Protocol wording (draft below)

- **HRP 20.6.22:**
  - rule `HarmWarningCalibration`, directly after `HazardIsNotRisk`;
  - three stress cases after the newest case, and final checks FS226 and FS227.
- **Universal 20.5.42:** item 7 in `canonical_protocol_execution_gate`, after item 6.

### 4. Tests and acceptance

- **Tests:**
  - `harm_claims` accepted and refused for every basis, including quotes in other languages and a missing
    declaration;
  - the caveats, and the key-source binding;
  - the result sentence on receipt-bearing results;
  - the next-step contract;
  - the exact protocol text, with reversible fixtures.
- **Acceptance**, through the refreshed ChatGPT app in Codex: the #326 fixture as a two-turn synthetic thread (an
  efficacy answer with a side-effect warning, then "continue"). It passes when the second turn quantifies the
  warning, scopes the hazard, and calls `finalize_research` with `harm_claims`.

## Draft wording (for the owner's exact-text approval)

- **HRP rule `HarmWarningCalibration`:**
  > A sentence saying that something can cause harm, is unsafe or should be avoided states, for the exposure it warns
  > about, how often the harm occurred against a comparator when a source reports it, or says that the frequency is
  > unknown. When the evidence measured something else, such as a laboratory concentration, a different preparation,
  > species, route or dose, or only case reports, the sentence says so. A hazard found in one form does not become a
  > warning about another.
- **Case `UnquantifiedSideEffectWarning`:**
  - Prompt: "In a continuing plant study, the answer says that a herbal extract can cause nausea and cramps, while a
    randomized trial of that extract reports nausea in 18% of the treated group and 4% on placebo."
  - Expected: "Give the trial's rates against placebo for that extract, dose and duration, with the sample size and
    uncertainty, keep people apart from event reports, and do not give a bare 'can cause' warning."
- **Case `PurifiedExtractHazardMisapplied`:**
  - Prompt: "A study reports lead and arsenic in alginate extracted in a laboratory from one seaweed species, and the
    answer tells the user not to eat wild seaweed."
  - Expected: "Say that the measurements concern the purified extract, not eaten seaweed; separate species, chemical
    form, bioaccessibility and intake; give scoped guidance only where a specific exposure is known to be high; do not
    give a blanket warning."
- **Check FS226:** "Each warning that something can cause harm or should be avoided gave the rate against a
  comparator when a source reports one, or said that the frequency is unknown, and said what the evidence measured
  when it differed from the exposure warned about (HarmWarningCalibration)."
- **Case `SpeciationExplainedAtFirstUse`** (#328):
  - Prompt: "With the protocols loaded, a seaweed safety answer says that most seaweeds carry organic arsenic while one
    species carries mostly inorganic arsenic."
  - Expected: "At first use, say in plain words what organic and inorganic arsenic mean and why the difference matters
    for toxicity, without implying that every organic form is harmless, and keep the measurement's scope, such as
    extractable versus total arsenic, and the exposure in view."
- **Check FS227:** "Each specialized term that a conclusion depends on was explained in plain words at its first use,
  including what it means for the risk or benefit (AudienceAccessibleTerminologyGate)."
- **Universal, `canonical_protocol_execution_gate` item 7:**
  > 7. A research task that started under AskRigor stays under it in every later turn of the conversation, including
  > "continue" or a revised target without a mention: reload the current protocol identities when they may have
  > changed or left the context, carry the open leads and sources forward, and check each research answer with
  > `finalize_research` before giving it. A conversation boundary or a summary of earlier turns does not end the task.
- **HRP revision entry:** "Owner-approved, question 86 (2026-10-12), from issues #324, #325 and #328: added
  HarmWarningCalibration, which gives a harm warning its rate against a comparator or says that the frequency is
  unknown, and says what the evidence measured, with three stress cases and final checks FS226 and FS227."
- **Universal revision entry:** "Owner-approved, question 86 (2026-10-12), from issue #326: a research task started
  under AskRigor stays under it in later turns, including "continue" without a mention, and each research answer is
  checked with finalize_research."

## Owner items

1. Question 86: the server changes (sections 1, 1b and 2), the regression list (2b) and the wording above. A: all;
   B: the server changes and the regression list only; C: change a wording.
2. The release question, after the build.
