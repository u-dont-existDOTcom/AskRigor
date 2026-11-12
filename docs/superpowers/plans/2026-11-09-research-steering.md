# Research the person can steer: framing, a numbered menu with times, and state that survives "continue" (9 Nov 2026)

From the owner's report AskRigor#434 and the ChatGPT chat behind it (8 Nov 2026): a sodium-to-potassium question took
about 52 minutes with AskRigor against about a minute without, the quick answer was more useful, the question itself was
a typo for its opposite, the panel showed no comparison with the quick answer, and two later replies never called
AskRigor at all. The owner asked for research that frames the question first, asks only what could redirect it, screens
cheaply, then lets the person allocate the remaining time by numbered task, with progress shown while it works.

Status (9 Nov, 13:00 UTC): A is built. The owner answered 279a ("279a except i'm not sure it's useful to show the user
what each key observational study adjusted for since that could be quite a lot of variables... this could be another
preference they can set globally, but default balanced mode might only mention the adjustments you think on a quick
check look potentially inappropriate or controversial and might warrant further investigation") and 280a (the call
record, 7 days, shown only to that account, privacy page first). B's first stage is built (below, "Built on 9 Nov");
each stage is released only with the owner's yes. Nothing here changes the tool list (owner answer 189a).

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
menu when the rest would take more than about five minutes; since owner answer 284, 10 Nov, when it could take more
than about 10 minutes or the person's choices could steer it); Autonomous (go on through the passes, report as it goes,
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

## Built on 9 Nov (stage 1 of B, and the call record)

- **The research style** (`set_research_steering`, `inspect`; migration `0033_research_steering`): guided, balanced
  (default) or autonomous; check back after 10 minutes by default (1 to 120); adjusted variables `flagged` (default,
  the owner's change) or `all`.
- **The framing with the plain answer** (`later_inputs.framing` on `register_plain_answer`): the result says whether
  to ask before researching, by the style; the inspect request asks for the framing.
- **The menu** (`plan_research`, `later_inputs.researchMenu`): time ranges by kind and sources, the recommendation,
  ask or go on by the style, the person's allocation, done tasks, the line before each task, how to resume after a
  stop, a task for each lead between people's reports and studies (`loop`), and the adjusted-variables look worded by
  the account's choice. With the plain answer's receipt it checks the research target (AskRigor#434) and gives the
  minutes since.
- **The research time** at the end of the quick-answer note, from the receipts' signed times.
- **The call record** (owner answer 280a; built by Codex on `claude/call-record-20261109` from an exact brief, reviewed
  here): see `docs/privacy-data-map.md`, "The call record".
- Tests: `tests/research-steering.test.ts`, `tests/finalize-plain-answer.test.ts` (the research time), the PostgreSQL
  acceptance's `research_steering_stored_with_defaults_and_kept_by_save`.

### What happens when the person stops the AI and redirects it (the owner's question, 9 Nov)

Stopping and then writing the new direction is the safer way, as the owner already does. Nothing the research needs
lives only in the stopped turn's working memory: the menu and the line before each task are visible text, which stays
in the chat after a stop; `plan_research` is called again with the tasks done and the new allocation; and the research
target stays the registered one, which `plan_research` checks against the plain answer's receipt. What a stop loses is
the step in flight: a tool call cut off returns no receipt, so that step is redone. Whether ChatGPT keeps a stopped
turn's tool results for the next turn is its own behavior, which AskRigor can't see; the visible menu covers the case
where it doesn't. A message sent while the AI is still working reaches it only between its steps, in ChatGPT's own way,
so stopping first stays the more reliable way to steer.

### The time estimates

The starting `PLAN_TASK_MINUTES` (a search 1 to 2 minutes, a paper read in full 3 to 6, a method audit 8 to 15, a forum
thread 2 to 6, a video's comments 5 to 15) were replaced on 9 Nov by times measured on the live build: the owner's go-ahead
of 17:02 UTC ("Start them"), DEVELOPMENT / DISCOVERY data, criteria written before the runs (kit
`/home/joel/askrigor-releases/20261109-timing/regress` on the owner's laptop: `criteria.md`, `measure.py`,
`calibrate.py`).

**The runs.** Fourteen questions (twelve from the owner's regression list, the owner's Syrian rue oil question word for
word, and a made-up sodium and memory question after AskRigor#434) through Codex's AskRigor app (`gpt-6.1-sol` at
reasoning effort xhigh), every event's arrival time recorded, card saving off for the runs. When a run stopped to ask,
the person answered "you decide how to spend the research time, and go on". Phase 1 (17:09 to 18:13 UTC) counted a
checked quick answer as the end, but a run that stops at its menu checks its quick answer first; phase 2 (18:14 to 19:25
UTC) resumed each run's own thread past its menu. All 14 ended in a checked answer, in 10.5 to 41 minutes of working time.

**What the runs showed.**

| Measure | Result |
|---|---|
| Framing given with the plain answer | 14 of 14, about half a minute in |
| Redirecting questions asked | 0 of 14, the Syrian rue oil form and the sodium direction included |
| First menu AskRigor accepted | 1.4 to 2.9 minutes in; 24 of 42 menu calls refused (the fields guessed): fixed by `RESEARCH_MENU_SHAPE` |
| First menu said ask (balanced) | 14 of 14 |
| Run stopped and waited when asked | 3 of 14; 5 made their own allocation, 6 researched on. Codex runs tasks to the end by design, so this is a lower bound for ChatGPT |
| People's reports in the first menu | 11 of 14; not for the nap, the antivenom emergency or the PITCH trial's rates |
| The antivenom emergency | a menu and 17 minutes of research; "don't delay the antivenom" first said plainly at minute 9.6: fixed by `URGENT_FIRST` |

**The times.** Thirteen go-ahead menus (the person's allocation, or the model's own): the research after each, until the
next menu or the turn's end, split by kind with each batch of parallel calls' time shared among its calls, and divided
by the sources the menu's tasks declared. Minutes per declared source, median (middle half), against the starting
range: a paper read in full 1.7 (0.7 to 2.1) against 3 to 6; a forum thread 0.65 (0.4 to 1.3) against 2 to 6; a method
audit 2.4 (2.4 to 3.2, three menus) against 8 to 15; a video's comments 1.7 (0.5 to 4.0) against 5 to 15; a study search
1.1 (0.4 to 3.2) against 1 to 2. After the tasks, the final check and writing the answer took 6.7 minutes (4.0 to 8.7),
which the menu didn't mention. Work after an allocation took 0.64 of the allocated minutes at the median (0.59 to 0.90).

New values: study search 0.5 to 2.5 minutes, abstract 0.2 to 0.5 (no measured task declared it), paper in full 1 to
2.5, method audit 2 to 4, forum thread 0.5 to 1.5, video's comments 1 to 4, video claims 1 to 3, registry record 0.3 to
1; and `ANSWER_MINUTES`, 4 to 10, said beside the tasks ("Then the final check and writing the answer"), outside the
five minutes that decide whether to ask. With them, 12 of the 13 measured windows fall inside the predicted range (3 of
13 before), and the middle run took 0.83 of the predicted middle (0.71 to 1.09). In-sample: these are the runs the values
were fitted on, one model at one effort; ChatGPT Instant ran about four times faster than Pro in the owner's Syrian rue
comparison. Later runs confirm or correct them.

Even with the measured times, all 14 first menus come to more than five minutes of recommended research, so balanced
would still ask before each: whether to raise that threshold is the owner's (question 284).

**The owner's answer to 284 (10 Nov 2026):** balanced "should ask if the research could take longer than 10 mins OR if
there is reason to believe from the initial analysis that steering could direct the research more usefully, which i'd
say it usually can unless the prompt is quite precise". Built as `ASK_ABOVE_MINUTES` (10, against the recommended
tasks' high estimate) and the menu's `steering_could_help`: the model's judgment from the screen, counted as true when
left out, as HRP's `StructuredUserSteeringAndApproval` asks (approval required unless the scope is clear). Balanced
goes on without asking only when the menu says false and the tasks fit in about 10 minutes; when it asks for the
person's choices, the AI says in one line what they could change. Nothing judges whether a question is precise but the
model. Released 10 Nov 2026 (owner answer 286a).

**The two new cases, against their criteria.** Syrian rue oil: people's reports from the start (five Reddit threads,
one claiming oral use, and a seller's "harmal oil" page with no assay); the oils told apart in a table (fixed oil,
essential oil, the traditional olive-oil preparation at 0.057% harmine, an alkaloid extract); "unknown potency", in
either direction; the interaction warning kept; the 1999 table not found (the live build searches no index of all
journals: owner answer 283a); no question about which oil the person has (the owner's reply, now `FORM_PEOPLE_USE`).
Sodium and memory: framing named dietary against blood sodium and memory against dementia measures; every study labelled
by how it was read; the adjustment reported as weakening, not vanishing; no bare "significant".

### Checked on the released rule (10 Nov 2026)

The owner's go-ahead of 20:31 UTC ("Yes, run them now"): the same 14 questions, preamble and replies, on the live build
3c9e0612 (the 284 rule, the menu's spelled-out shape and the 9 Nov times), through Codex's AskRigor app (codex-cli
0.167.0, `gpt-6.1-sol`, xhigh), three at a time, from 20:38 to 22:25 UTC. Card saving off for the run and back on after
it (the call and the reply agree), no other tool called, no sign of saving in any run. Criteria written before
(`/home/joel/askrigor-releases/20261110-timing/regress`: `criteria.md`, `measure.py`, `analysis/final.json`,
`analysis/calibration-check.json`). DEVELOPMENT / DISCOVERY data: nothing was retuned during the run.

| Measure | 9 Nov (five-minute rule) | 10 Nov (284 rule) |
|---|---|---|
| First menu call accepted | 0 of 14; 31 of 58 calls refused | 14 of 14; 2 of 22 refused |
| First menu asks / goes on | 14 / 0 | 8 / 6 |
| Next step as the rule says | (rule new on 10 Nov) | 14 of 14 |
| The menu says the person's choices could steer it | (field new on 10 Nov) | 0 of 14 (false on all 14; never left out) |
| The run stopped and waited when asked | 3 of 14 | 2 of 8; 3 made their own allocation, 3 researched on (one for a single call) |
| Whole run to a checked answer, median (range) | 25.2 minutes (10.5 to 40.9) | 20.4 minutes (7.7 to 28.9) |
| Done in one turn | 4 of 14 | 9 of 14 |
| Final check | 14 ready with limits | 14 ready with limits |

It asked for the kelp, low-dose naltrexone, symptom-cluster, vertigo-video, didgeridoo, nebulized-peroxide, bacopa and
Syrian rue oil questions (high estimates 11 to 20 minutes) and went on for the nap, the PITCH trial, saffron against
fluvoxamine, sodium and memory, sea buckthorn and the antivenom emergency (7 to 10). Against the expectations written
before: most first menus asked; the PITCH trial and the nap went on, the peroxide question asked (20 minutes); first
calls were accepted. So the asks landed on the open questions, but only through the time estimate: the model said the
person's choices could not steer the research even for the symptom cluster and the Syrian rue oil, whose form changes
its strength. Built: the field's wording now carries HRP's test for when approval is required (`RESEARCH_MENU_SHAPE`),
"even when the question is clearly worded"; the next run after a release shows whether the model's answer moves.

**The times.** The research after a go-ahead menu took 3.5 to 11.5 minutes (median 9.1) in all 12 windows, whatever
the menu said. Of the six menus that went on by themselves (high estimates 7 to 10), three ran over (7.7 against 7, 9.7
against 7, 9.2 against 8); the six after an allocation of 17 to 29 minutes used 0.31 to 0.62 of it. Per declared
source, about half the frozen ranges: a paper in full 0.76 minutes (0.47 to 1.36) against 1 to 2.5, a method audit 1.27
(0.98 to 2.13) against 2 to 4, a forum thread 0.33 (0.18 to 0.47) against 0.5 to 1.5; a study search 0.86 (0.62 to
1.38) inside 0.5 to 2.5. The calls themselves took what they took on 9 Nov (a paper 0.20 minutes a call against 0.22)
and the menus declared about as many sources (median 11 against 10). The final check and writing took 7.1 minutes (2.9
to 10.4; 9 of 12 within the menu's 4 to 10). Not retuned: on the same questions the two days differ about twofold per
source while the research stayed near 9 minutes, and the preamble asks for about 60 AskRigor calls, which may be what
ends it; a third fit would fit that spread. A run without the call budget, or in ChatGPT, would tell them apart.

**What the person's choices could change** (read, not computed). The three answers that stopped at the menu (the
symptom cluster, the didgeridoo, and naltrexone after one more call) each showed the numbered tasks with their times and
what each could change, the 4 to 10 minutes for checking and writing, and asked how to spend the time, with "you
decide" offered; none said what the person's own situation or choices could change, which the result asks for only when
the menu says it can be steered.

**The owner's depression question, measured apart.** The one menu that said the person could steer it: [6, 13]
minutes, ask for both reasons; not kept (the model's own allocation was refused for naming no tasks, and 40 research
calls followed); "you decide" in turn 2; checked at 41.9 minutes, ready with limits. What it said about the
Mediterranean diet is in the owner page's section of 10 Nov.

### The judgment required on a dev account (12 Nov 2026, owner answer 294c)

The owner's ChatGPT on 12 Nov, on build a826ad10 (10 runs: the five test prompts twice, Extra High): the AI gave no
`steering_could_help` on any menu, so the default (left out counts as yes) decided every short one. The four open
questions asked in 7 of 8 first turns, as wanted. The control, one figure from one named trial, asked both times
instead of answering. The owner, 19:30 and about 20:10 UTC: the control's menu asked "for no reason, since both steps
are required to answer the question"; "those choices should have not been given as choices since they were required to
answer the question"; and to try the change on the owner's account first.

Built: on a dev account, a menu whose ask rests only on the judgment left out is refused, with the call handed back,
the judgment's place marked `<true|false>`, and the test both ways (`STEERING_JUDGMENT`): true, the usual case, when a
choice of the person's or something only they know could materially change what is checked; false when no choice is
left to them, because the question fixes it and every task is needed to answer. Whether the judgment is needed is read
from the rule itself (the same menu planned with false would go on), so guided and autonomous research, tasks past 10
minutes, the person's own allocation, a changed menu and a re-plan need none. Every other account is planned as
before, in the same words. AskRigor checks only that the judgment was given; what it says is the model's.

Criteria, written before any run. DEVELOPMENT / DISCOVERY: five questions on one account can tune the wording, and
cannot confirm it for other accounts or models.

- The control: its first accepted menu carries false, after at most one refusal for the judgment; the result says go
  on; the turn ends with a checked answer and no question.
- Each of the four open questions: its first accepted menu carries true; the result asks; the turn ends with the menu
  and its question, as in rounds 1 and 2.
- Cost: at most one refused call more per first menu than the same prompt on the released build.
- Read, not a pass criterion: whether an ask says what the person's choice could change (for the Syrian rue oil, which
  oil they mean).

If the control still asks, or an open question goes on: the wording is changed once. A second miss of the same kind
means a bare yes or no does not carry the judgment, and the next design has the model name the choice it would ask the
person about (none named, nothing to ask) instead of a third wording. Giving the requirement to every account is the
owner's decision after the comparison.

### An allocation needs the person's answer declared, on a dev account (12 Nov 2026)

Round 3 of the owner's ChatGPT runs, on the live build 1d877300 (the five test prompts, Extra High). When
`plan_research` answers "ask", its result hands the AI the "you decide" call ready to copy (`you_decide_later_inputs`,
and the same JSON in the text's last line), holding the recommended allocation, and AskRigor took any allocation
naming an open task for the person's answer. In the orange-peel run the AI received the ask at 22:13:16 UTC and 54
seconds later, in the same turn, sent exactly `you_decide_later_inputs` (the recommended allocation, tasks 1, 4 and 2
for 2 minutes each and task 3 for 3, with the menu's digest); AskRigor answered go on, and it researched for 17
minutes without the person. Asked why, it said: "I was following the general instruction to continue substantive work
rather than ask unnecessary clarification, and I treated AskRigor's returned you_decide_later_inputs allocation as a
usable default. That was an instruction-following error." The same prompt ignored the ask in round 2 as well (2 of 3
runs). So the handed-over allocation works as a default the AI can take for the person.

Built: the menu takes one declared yes or no, `person_answered`: true once the person has answered this menu in a
message of their own, giving the allocation or leaving it to the AI ("you decide"), and never for an allocation the AI
chose itself. On a dev account, `plan_research` uses an allocation only with `person_answered` true. One sent with
false or without it is not used (`researchMenu.allocation_not_used`): the recommendation is AskRigor's own and the
existing rule decides as if no allocation had come, so the menu asks again, unless the research is autonomous or the
menu is short and the AI judged it not steerable, which go on with AskRigor's own tasks and say so. The result says it
before anything else, in its text and in `next_step`, as a stop and not as a call to correct: "The allocation this
call carried was not used: on this account an allocation is the person's answer only with person_answered true, which
the call did not give, so this menu still waits for them. If the person has not replied since the menu was shown, this
is still the turn of the ask." It is not an error, and no corrected call is handed back. The handed-over call carries
`"person_answered": "<true|false>"` after its allocation, and the menu's `steering_could_help` when it gave one; the
placeholder left in is read as not given, so the call copied as it is asks again instead of going on, and is not
refused for the judgment. The rule for the person's answer, the call's own line, `next_step` and the way back after a
stop each say that an allocation goes with `person_answered` true. AskRigor checks only that it was declared true:
whether the person answered is the model's knowledge, in any language, and no word of the person's is sent, so what
AskRigor receives and keeps about the person is unchanged. The judgment's refusal (owner answer 294c) still fires for
a short menu that left `steering_could_help` out, whether or not it carries an allocation that is not used. Every
other account is planned as before, in the same words. One limit, which the digest had before this: an ask that came
only from a menu changed after the person saw it does not outlast a second call, since a call that passes the new
digest back is planned as an unchanged menu; the copied call then follows the rule alone, so a short menu that gave no
judgment is asked for it, and one judged not steerable goes on with AskRigor's own tasks.

Criteria, written before any run. DEVELOPMENT / DISCOVERY: five prompts on one account can tune the wording, and
cannot confirm it for other accounts or models.

- (a) No first turn of the five test prompts goes on with an allocation the person did not give: a copied allocation
  gets the ask again, and the turn ends with the menu and its question.
- (b) A real "you decide" reply goes on at the first or second `plan_research` call of that turn: at most one call
  more than on build 1d877300.
- (c) Every other account is planned as before, in the same words.

If a first turn still goes on by declaring true without a reply, a declaration does not hold, and the next step is the
enforced stop with a menu card, which the owner already chose for a missed bar (owner answer 288b), not a second
wording. Giving the requirement to every account is the owner's decision after the comparison.

### Next stages

1. Measure on the owner's regression list, on plan workers with no API spend: whether the framing asks the right
   questions (the sodium question first), whether the menu appears before long tasks, whether the loop tasks appear
   and run, the time each run takes, and a blind comparison of the quick answer with AskRigor's.
2. Calibrate `PLAN_TASK_MINUTES` from those runs.
3. HRP text, for the owner's approval with the exact words: under `CausalInferenceDiscipline`, the quick look at each
   key observational study's adjustments with the owner's display rule; in the orchestration gate, that AskRigor's
   next-step results apply the person's research style. Drafted when the measurements show what the results alone
   don't do.
4. Loading the protocol one stage at a time, as an experiment against today's loading.

## Added on 9 Nov, after the owner's Syrian rue oil comparison

The owner compared one question ("would Syrian rue oil work as a strong MAOI like Syrian rue tea?") four ways: ChatGPT's
Medium, Extra High and Pro modes without AskRigor, and Instant with it (1 min 58 s against Pro's 7 min 21 s). The three
without AskRigor called a solvent-extracted seed oil potentially strong from a 1999 abstract (Hassani and El Hadek, Acta
Botanica Gallica 146:353-359, doi 10.1080/12538078.1999.10515822) that calls the oil a rich source of the alkaloids and
gives no amount; Instant with AskRigor said not to expect tea-like strength. AskRigor's run never met that paper: PubMed
and Europe PMC don't index the journal. Its list of next questions also skipped what people who take the oil report.

Checked before any page went up: the paper's full text (Table 2) gives harmine plus harmaline of about 8.7 to 8.9 mg per
gram of the hexane-extracted oil (0.87 to 0.89%; the printed total for sample 1, 9667, should be 8667), against about
99 mg per gram in dry seeds measured elsewhere (Herraiz et al. 2010). Per gram of seed the oil carries about 1% of the
seeds' alkaloids, but per gram of oil it is about a tenth as concentrated as the seeds, so a spoonful swallowed could
carry a real dose. The traditional olive-oil preparation of the 2015 knee trial held about 0.06%. So the comparison is
not the success it looked like, and its page was held back (draft kept outside the repository); none of the four
answers read the numbers that decide the question.

Built:

- `WORDS_ARE_NOT_SIZES` at the screen and at the menu: a source's significant, rich, high, substantial or strong, in
  any language, is not a size; find the sense and the number and compare it with what the question needs, or say the
  source gives none. It applies HRP's `effect_magnitude` and `NumericExposureOverridesAmbiguousLabels`, and since
  owner answer 282a (9 Nov) HRP 20.6.41's own `WordsAreNotSizes`, with the stress test `RichSourceWithoutAnAmount`,
  outside the core (released 9 Nov, owner answer 285a).
- `PEOPLE_FIRST_WHEN_USED` at the screen, and `PEOPLE_TASK_MISSING` on a first menu with no task reading people's
  reports: when HRP's `ForumSignalDefaultTrigger` applies, such as for a widely used old remedy, people's reports come
  from the start, beside the studies (`NoFixedStudiesThenCommunitySequence`). Whether the trigger applies is the model's
  judgment; AskRigor checks only the task kinds.

Found: AskRigor's study search reaches PubMed and Europe PMC only. The deciding paper sat in a journal neither
indexes; a free scholarly index such as OpenAlex would have found it, and InfoAccess's free PDF route then read it.
Owner answer 283a (9 Nov): build it as a new input of the existing search tools, so no app needs a refresh. Built:
`search_europe_pmc` with `later_inputs.index` `all_journals` searches OpenAlex (`packages/sources/src/openalex.ts`),
with its own receipt source `openalex`, counted by the final check as the source beyond PubMed and Europe PMC; the
screen names it for plant, food, farming and traditional remedies. OpenAlex holds the 1999 paper (looked up by its
DOI); its title's broken spacing kept it off the first page of broad English and French searches, but a live check
of the adapter at 18:50 UTC with a French search limited to 1995 to 2003 ("huile Peganum harmala Zygophyllaceae")
found it first, as the limitation text advises (search in the paper's own language). The index finds many other oil
and seed papers PubMed lacks. Keyless use shares about 100 searches a day per server address; the owner made a free
key on 9 Nov (its own allowance, about 1,000 searches a day, nothing prepaid), which goes into the server's settings
as `OPENALEX_API_KEY` with the release that carries the search, moved unseen by a script as owner answer 177a
allowed for the Atlas secret.
The privacy notice names OpenAlex: date it on the release day.
Since 12 November 2026 (the review: with abstracts of up to 2,000 characters, a page of 50 came to about 130 KB), an
all-journals result keeps OpenAlex's records in their order while the whole result fits 40,000 bytes of text and
structured content (`MCP_RESULT_MAX_BYTES`, the YouTube audit's budget), says "This result shows N of the M records
OpenAlex returned", leaves out the next cursor that would skip the rest, and signs only the records shown. A small
search (50 records or fewer) is read whole, so it can't be paged with OpenAlex's cursor: when it is cut, its
`next_cursor` is AskRigor's own (`askrigor-whole-search-from:N`), which reads the search whole again and shows it from
record N on (Greptile's review of 12 November 2026: the advice to search again with a smaller page size read it whole
again and cut it to the same first records).

## Built on 11 Nov: an ask ends the turn, and a pass ends the checking (released 12 Nov, owner answer 292a)

The owner, 11 Nov 2026: "it's still not asking me any steering questions". No menu or question appeared in 13
ChatGPT turns of 10 and 11 Nov. In the 10 Nov timing runs (Codex, the 284 rule on the live build) the rule asked on 9
of 15 first menus; the AI stopped on 2, one more made a single call, and six went on with 40 to 52 research calls,
three of them on an allocation the AI made up for the person. None of the 21 turns ended with a question: the turns
that stopped still ran the final check and ended on its check line. The ask came fifth, after the menu, followed by
five paragraphs on doing the tasks, and nothing said to end the turn or that a question needs no final check. The
server instructions, the one text ChatGPT always has, never mentioned asking. Of the 88 final checks, 49 came after a
pass in the same turn, and all 17 that held an answer back were a turn's first.

What this build changes, all in result text, runtime fields or the server instructions (the tool list, the six checks
and stored state are as they were):

1. **The ask ends the turn.** `plan_research`'s ask puts the stop first (the reason as the person's own setting; the
   whole reply is the message below; no research call and no final check, since a question is not an answer: HRP's
   preflight-only exit and `StructuredUserSteeringAndApproval`), then the reply ready to send (at most two sentences
   on the unchecked first look, one on what the person's choices could change when they could, the menu one task per
   line with the recommendation, and how to answer), then the rule for the answer, with the research target word for
   word; nothing follows it. The framing ask and guided's confirmation end the turn the same way; the screen says it
   is a few calls and that an ask ends the turn. An allocation naming no open task on the menu no longer counts as the
   person's answer. `register_plain_answer` gives its next step first; it and `plan_research` add `next_step` for
   Claude Code, which reads only structured content; `inspect`'s request opens with the run's shape.
2. **Every research result says how a research turn ends**: with the answer the final check says to give, or with a
   question an AskRigor result said to ask and wait on, never with a progress report; an unanswered ask means stop
   researching, send it and end the turn. This is the soft reminder planned above ("Enforcement"), without state.
3. **The server instructions** (2,048 bytes) say in their first 512 characters the run's steps (inspect, the plain
   answer, a brief screen, then action `plan_research` before deep reading: the owner's call record of 11 Nov showed
   ChatGPT inspecting in 9 of 9 runs and registering the plain answer in 8, but calling `plan_research` in none), to
   follow results, to send only what an asking result gives (after any urgent action) and end the turn, and never to
   end on a progress report; "widen discovery until finalize_research accepts it" is gone, and the proposals' privacy
   list, which repeats `submit_research_contribution`'s own description, moved past the first 512 characters. Each
   ChatGPT app loads them after one refresh of AskRigor in its settings.
4. **Shapes before the first check.** The reading tools name the `source_reading` entry's fields
   (`{source, reading, quote}`) and what happens without it; a method audit gives the study map's exact shape.
5. **A pass is the turn's last check** unless the draft itself changes, and then once more; notes about later inputs
   wait for a later answer; a pass after a pass in the same turn says so (`turn_already_passed`, runtime only); a
   filed research map's result gives the answer's closing line itself.
6. **`get_youtube_video` says it returned the video's details**, not what is said or shown in it (a ChatGPT run had
   claimed a transcript), and names `extract_youtube_video_claims` except on Gemini, whose catalog lacks it.
7. **The question's premises become claims of the quick answer**, first among them, so the sixth check compares each;
   a premise doubt not yet a claim asks for the quick answer again; the screen searches once for what would show each
   premise wrong. What counts as a premise stays the model's judgment.
8. **A video's comment audit says how many of the retrieved comments it shows** (AskRigor#438: 104 of 997), that an
   order blind to what they say picked them, and that `get_youtube_comments` returns them all at once, a large result
   to read only when the comments not shown could change the answer.
9. **Every pass says it covers the six checks, not whether the search was complete** (lesson 56: a research lane read
   a pass as the end of discovery).

Sizes: the ask for the test menu (four tasks, balanced) is 2,290 bytes, against a median of 3,584 bytes of
`plan_research` text in the first turns of the 10 Nov runs; the reminder on each research result grows from 178 to 418
bytes.

**After an independent review (12 Nov 2026).** Eleven findings, all fixed in the same branch, none changing a check:
a new fork goes back through `plan_research` without the allocation, so it is recommended or asked about (not in
autonomous research, which checks and answers instead); when asking, the doubts go in the one line before the questions
and a new registration of the plain answer waits for the answer and leaves the framing out, which isn't stored (made
before the ask it cancelled the ask; made after with the framing it would ask again); only a doubt that could be false
becomes a claim; the rule for the person's answer names the registered research target when the menu's isn't it;
renumbering goes by whether any allocation or done list was given; a research map filed before the check passes its
receipt with the others, and one filed after a pass gives the closing line; after a pass, a note saying the answer is
wrong is fixed now, while one asking for an input waits, and adding what the result asks the answer to include is no
change to the draft; after a repeat pass nothing asks for another check; on Gemini, the reading and audit sentences
leave the final check out; and the server instructions keep the urgent-action exception at an ask (2,039 bytes).
A second look (12 Nov) found three more, also fixed: a re-plan (tasks done, no allocation that counts as the person's
answer) with something to recommend asks unless the research is autonomous, since a precise menu re-planned after the
person skipped a task went on, did that task and never asked about the new one; closing questions, which the AI writes,
count as a change to a passed draft; and the request for a framing in the result of a registration made without one,
after the person answered, is said to be for the next question.

**Measuring it.** Criteria written before the runs; for anything changed afterwards, the runs are DEVELOPMENT /
DISCOVERY data. Nobody runs them without the owner's explicit yes, and none spends on an API.

- Step 0, free and urgent: in each ChatGPT app the transcripts name ("AskRigor 6 oct", which the timing kit also used,
  and "askrigor oct 3"), list the account's calls (`list_calls`), which keeps only the newest 500 of the last 7 days;
  every new call pushes the 10 and 11 Nov rows out. For each ChatGPT run of those days: whether the quick answer came
  before the first research call, whether `plan_research` was called, and how many research calls followed it. No
  `plan_research` rows means the menu is not reached at all.
- Stage 1, after the release, with no app refresh: the owner's usual mode (Extra High, GPT-6 Sol); four open prompts
  (the orange-peel invention, the PewDiePie Ajax claim, diet and depression, the Syrian rue oil) and one precise
  control (one result of one named trial); 3 runs each in a fresh chat, card saving off; a turn still researching 2
  minutes after `plan_research` is a fail; "you decide" once per open prompt; `list_calls` after every 6 runs.
- Stage 2: refresh AskRigor once in each app, which loads the new instructions, and repeat stage 1 (optionally Free
  Think, 2 runs each). An optional diagnostic adds one line to the owner's own ChatGPT instructions to tell a model
  that never reaches the stop from one that gives tool text too little weight.
- A first turn passes when the reply shows the menu (or the framing questions) and ends with the question, and the
  call record shows no research call and no final check before the person's next message. The control passes with a
  checked answer in turn 1. A second turn passes when `plan_research` gets the allocation, research stays within the
  recommended minutes plus 3, the check passes, the turn ends with the checked answer and its line, and there are at
  most 2 final checks. Every last message is classed as a checked answer, a steering question, or other.
- The bar for stage 2 in the owner's usual mode: at least 12 of 15 first turns pass, at least 3 of 5 prompts pass all
  three runs, no "other" ending, at most 2 final checks per answer turn. Below it, the enforced stop comes back to the
  owner.
- In Codex, once released: the 15-question kit on the owner's dev account, with a preamble that no longer says to ask
  inside the answer or to keep to about 60 calls (both pushed against stopping): asks kept at least 7 of 9 (2 of 9 on
  10 Nov), calls after a pass at most 1 per turn (0 to 6), first checks passing at least 10 of 21 (4 of 21).

Waiting on the owner, not built: whether balanced asks at every question's first menu (the model said the person's
choices could not steer the research on 14 of 15 first menus, open questions included); whether, if the ChatGPT runs
miss the bar, AskRigor may refuse deep-reading tools while a menu waits, on the owner's dev logins only; and whether
the call record may keep `plan_research`'s ask or go-on, which changes a privacy row.

Not done in this build: a hard gate, a run handle on every call, a menu card (two new tools) or a form (MCP
elicitation: AskRigor's per-request servers can't hold one, and classic ChatGPT doesn't show it); a research clock;
protocol-section pointers; a SKILL.md edit (1,248 of 1,250 words); any change to the six checks; a word list deciding
what counts as a question or a premise.

## Not done

- A web app that runs the research itself: about $5 to $10 a question by the owner's estimate, so no.
- ChatGPT's own call logs: AskRigor can't reach them; only a record of the calls that reach AskRigor (owner question
  280, a privacy change).
- Hard gates that refuse research tools out of order, before the soft version is measured.
- Any change to the tool list.
