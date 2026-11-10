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

## Not done

- A web app that runs the research itself: about $5 to $10 a question by the owner's estimate, so no.
- ChatGPT's own call logs: AskRigor can't reach them; only a record of the calls that reach AskRigor (owner question
  280, a privacy change).
- Hard gates that refuse research tools out of order, before the soft version is measured.
- Any change to the tool list.
