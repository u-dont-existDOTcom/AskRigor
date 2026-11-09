# Research the person can steer: framing, a numbered menu with times, and state that survives "continue" (9 Nov 2026)

From the owner's report AskRigor#434 and the ChatGPT chat behind it (8 Nov 2026): a sodium-to-potassium question took
about 52 minutes with AskRigor against about a minute without, the quick answer was more useful, the question itself was
a typo for its opposite, the panel showed no comparison with the quick answer, and two later replies never called
AskRigor at all. The owner asked for research that frames the question first, asks only what could redirect it, screens
cheaply, then lets the person allocate the remaining time by numbered task, with progress shown while it works.

Status: two fixes are built (below, A); the restructure (B) waits for the owner's answer on the owner questions page.
Nothing here changes the tool list (owner answer 189a).

## What the report says, checked against the code and the protocols

| The report says | Checked | Verdict |
|---|---|---|
| The panel showed no comparison with the quick answer | The final check matches the quick answer to the research by `research_target`, word for word but for case and spacing (`registeredPlainAnswer`, `research-finalization-gate.ts`). A check given the question in other words returns `other_target`, and the panel showed nothing for any status but a written note. AskRigor keeps no request log, so which words this run used can't be recovered. | Confirmed as a class; the exact wording of this run unknown. Fixed in A. |
| The answer didn't say which studies were read in full | The AskRigor answer said it ("All three were read in full and their methods audited"; the genetic study "only the abstract"). The per-study reading check, its panel lines and the reading summary have been live since 6 Nov (`source-reading.ts`, `reading-summary.ts` in build dc2887b1). The replies that skipped it, the critique of AskRigor, never called AskRigor, so nothing checked them. | Not a check gap; the same cause as the missed calls. |
| AskRigor wasn't called when tagged (twice, on a free ChatGPT account) | AskRigor sees only calls that reach it, and keeps no request log by design (privacy page). Free and paid ChatGPT may use different models; nothing here shows the plan is the cause. | Host side. A content-free record of calls received would let a person see whether a call arrived (owner question). |
| The 52 minutes weren't worth it | Compared with the quick answer: AskRigor's run verified three ratio studies in full text and caught a real limit the quick answer missed (in the 2018 cohort, only the per-unit model was significant, not the quarters), but it stayed on the literal question, missed the mood trial, the sodium-only cohort and the intake guidance the quick answer gave, and didn't say up front that a lower ratio looks better. HRP's Pre-Research Optimization and Approval Gate (20.5.11), `PreflightBeforeBroadSearch`, `OnePassFeasibilityAudit`, `PromptPremisesAreClaims`, `AdaptiveStoppingRule` and the first pass that stops early (27 to 29 Sep) all exist and none visibly ran. | Agreed for this run. The rules exist; a plugin can't make a model follow them, so the restructure works through the steps the server does see. |
| Independence, measurement validity and counterarguments are in the protocol but not used | The study map that counts groups of people, not papers (249a), is live; `AnalyticalValidity` and Universal `reasoning_selection` exist. | Agreed. |
| A quick check of what observational studies adjusted for | `CausalInferenceDiscipline` is one sentence (causal diagrams, target-trial logic, negative controls, sensitivity analyses); `ConfoundingSelectionThresholdsTransport` covers proxies and dominant confounders. Nothing asks for each key study's adjusted variables and their likely roles. | A gap. Proposed in B as protocol text, a note and never a stop. |

## A. Built now, in the waiting build

1. **The panel says why there is no comparison.** Under a passing check with no quick-answer note, one line gives the
   reason from `plain_answer.status`: none passed, one written down for a differently worded question, one written
   after the research began, or one from another account. The person's own "note off" shows nothing
   (`FINAL_CHECK_PANEL_NO_COMPARISON`, `final-check-panel.ts`; test in `tests/final-check-panel.test.ts`).
2. **The exact wording comes back.** `register_plain_answer`'s result quotes the research target it signed and says
   to give `finalize_research` the same words, in a later turn too. A check given other words says how to call again with
   the registered words; whether two wordings ask the same question stays the AI's judgment
   (`research-contributor-access-tool.ts`, `research-finalization-gate.ts`; `tests/finalize-plain-answer.test.ts`).
3. **`docs/final-check.md`** marked seven checks "not yet released" that were released on 6 Nov; corrected.

## B. The restructure (proposed; owner question 279)

The stages, each working through a step the server already sees:

1. **Framing, with the quick answer.** The quick answer, registered before any research, also names the question the
   person most likely means, any premise that looks inverted or unclear ("did you mean lowering the ratio?"), and the
   one to three questions that could redirect the research. When one could, the AI asks and waits before the first
   research call. This is HRP's existing gate, cut to its useful core: no long specification, only the questions that
   matter. A clear question goes straight on.
2. **Screening.** Searches, abstracts, thread titles and the Atlas: cheap discovery, no full-text audits, long forum
   threads or video audits. It ends with a provisional short answer.
3. **The menu.** Numbered next tasks, each with what it could change (the conclusion, how sure, or only detail), an
   estimated time range, and a recommended allocation; the person replies "1. 5 min, 2. 4 min, 7. 1 min", in words,
   or "you decide". Estimates come from AskRigor's own measured times per kind of step, and say whether a time means
   screening, reading or a full method audit.
4. **Bounded work, shown as it goes.** Before each long step, one line naming the source, how deep it will go and why;
   a task that runs out of time stops and says what it reached; a new fork that could change the conclusion comes back
   to the person.
5. **The answer, and state that survives "continue".** The final check as now. The answer also says how long the
   research took, from the signed times of its receipts, and the comparison with the quick answer says what that time
   bought. The carried state keeps the exact target, the menu, the time given to each task and what is done, so
   "continue" resumes the same research.

**A setting per account** (stored like the quick-answer note: the choice only): Guided (ask at framing, menu after the
screen, ask before any long task); Balanced, the default (ask only questions that could redirect it, screen, then the
menu when the rest would take more than about five minutes); Autonomous (go on through the passes, report as it goes,
check back after the time allowance). A time allowance before checking back, 10 minutes by default. Neither overrides
safety, privacy or truthfulness rules.

**A quick look at what each key observational study adjusted for:** the variables in its main model, each one's
likely role (shared cause, a step on the path, something both affect, something that changes the effect, or only
precision), flagged when a doubtful role could change the conclusion, with an offer to look deeper. HRP text under
`CausalInferenceDiscipline`; a note, never a stop.

**Enforcement:** through tool results and the carried state the server already signs, with no new blocking check:
past the screening pass, a deep tool's result reminds the AI to show the menu unless the person chose Autonomous or
already answered it. Measured on the owner's regression list before any harder gate is proposed.

**Loading the protocol by stage** (the owner's idea that one part at a time could be followed better): an experiment
once the stages exist, an always-loaded core plus the current stage's part against today's loading, run on plan workers
with no API spend, adopted only if adherence measurably improves.

**Measuring whether it's worth it** (the owner: "every user would want to know why that 52 minutes was really
worthwhile"): for the regression questions, record the time and compare the quick answer with AskRigor's, blind to
which is which: what the research changed, what errors it caught, and which a person would rather have read.

## Not done

- A web app that runs the research itself: about $5 to $10 a question by the owner's estimate, so no.
- ChatGPT's own call logs: AskRigor can't reach them; only a record of the calls that reach AskRigor (owner question
  280, a privacy change).
- Hard gates that refuse research tools out of order, before the soft version is measured.
- Any change to the tool list.
