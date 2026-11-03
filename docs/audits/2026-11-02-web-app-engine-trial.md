# The web-app engine trial (owner answer 221), 2 Nov 2026

The engine and its design are in `docs/superpowers/plans/2026-11-02-web-app-engine-trial.md`. Costs are computed from
each response's usage and Anthropic's price list; the Claude Console's billing is the authority.

## The pilot

- Engine at `31b0df0f`: Claude Opus 5.5 at effort `high`, against production build `b9e658e2` (HRP 20.6.36, Universal
  20.5.46), through AskRigor's Claude surface, on the owner's Google login (research access active, free contributor
  mode, a dev account with card saving off), signed in by the owner at 19:44 UTC (owner answer 222a). ChatGPT's run
  uses the owner's email-and-password login, the one login since owner answer 196a: another dev account with the same
  settings. The system prompt carried the server's instructions only.
- It ran from 19:44 to 20:26 UTC on 2 Nov, one case at a time, while the ChatGPT run on the same build continued. That
  run, three cases at a time through Codex with GPT-6.1 Sol at extra-high reasoning, had finished these cases between
  17:07 and 18:25 UTC.
- Each case's first message was the harness's preamble and the case, word for word, as ChatGPT's.

| Case | Cost | Time | ChatGPT's time | AskRigor calls, Claude / ChatGPT | Protocol loads, Claude / ChatGPT |
|---|---|---|---|---|---|
| `i44-gh-secretagogue-safety` | $5.67 | 16.8 min | 15.8 min | 54 / 62 | 0 / 11 |
| `l25-columns-passages` | $1.81 | 5.8 min | 6.8 min | 18 / 56 | 2 / 34 |
| `l32-negative-controls`, two turns | $5.52 ($3.83 + $1.70) | 18.8 min (13.1 + 5.7) | 24.8 min (17.9 + 6.9) | 60 / 69 | 1 / 11 |
| All three | $13.00 | 41.5 min | | | |

- **Where the money went:** output, which includes thinking and the long inputs Claude writes for the audit validators
  and the final check, $4.71; writing the growing conversation to the cache, $4.84; reading it back on each request,
  $3.45; one web search, $0.01. The conversation reached 451,000 tokens in `i44`.
- **Where the time went:** Claude's own responses took 88 to 94% of each case. AskRigor's calls took about 3 minutes of
  each long case, run up to four at a time.
- **The final check:** every turn passed at its first call (ChatGPT's passed at the second or third call in three of
  the four turns). Each case registered its plain answer before research. The findings cards were checked and not
  saved, because saving is off on the dev account. The engine refused no call, and no response was refused or fell
  back to another model.

### One fault, fixed before the sample

Claude loaded almost none of AskRigor's protocols: no section in `i44`, the HRP index and three sections in `l25`, HRP's
core in `l32`. ChatGPT made 8 to 36 protocol loads a case tonight, about 336 KB of protocol a case over 42 cases. The engine gave
Claude only the server's instructions, which don't mention the protocols. In Codex, the AskRigor plugin's skill appears
by its name and one-line description, not its text, and GPT loads the protocols anyway.

The engine's system prompt now also carries the skill's text (`skills/askrigor/SKILL.md`, the same bytes as the
installed plugin's), which says to load Universal and HRP. Claude thus gets more instruction than GPT sees; a web app
AskRigor builds would write its own system prompt the same way. The pilot's three cases run again in the sample.

## The free check before spending more (owner answer 226b)

Owner answer 226b: up to $60 for nine cases, and "make sure before you spend so much that it's actually worthwhile,
sounds like you wasted money on this round." The pilot bought the cost and time asked for. Its answers can't stand for
the corrected engine, though, and a comparison of the engine's setup with ChatGPT's, at no cost, would have found the
missing skill first. So before more is spent, the pilot's three answers and ChatGPT's answers to the same cases were
judged blind, on the Claude plan:

- **The method:** one Claude subagent judged each case's two answers, labelled A and B in an order drawn at random. It
  had the case's criteria and the declarations of each run's last final-check call, and nothing else.
- **Better for the person, Claude's answer in all three:**
  - `i44`, narrowly: it says a severe allergic reaction can come after weeks of uneventful injections, with the
    emergency signs. ChatGPT's lists more label harms, with denominators, but never says that tolerated doses don't
    protect.
  - `l25`: it explains why passages can't give a rate, uses a placebo row to separate reported from caused, and says
    when A and B can be compared.
  - `l32`: it ranks the explanations, uses each control's logic, and gives a test the person can run.
- **Against the criteria:** Claude's `l32` passes; the five other answers meet theirs in part. In `l25` neither run
  declared the passages as `share_of_reports`.
- **Errors noted, all in Claude's answers:**
  - the CJC-1295 trials with DAC called "single-dose", though they also gave repeat doses;
  - an odds ratio of 2.6 read as "more than twice as likely";
  - "rules out coolness, wetness and simply touching", too strong for one unblinded comparison;
  - an assumed volume for a dab.

  The judge also doubted the Golder review's "0.02% to 78%". The review's full text, as AskRigor returned it, gives
  exactly that range in its body, by the posts counted; its abstract's 0.2% to 8% is the overall prevalence.
- **Limits:** one judge, of Claude's own family, on three cases, with answers from the engine before the skill. Stage 1's
  judging adds a GPT judge.

Under the rule written before the result (worse in all three would have held the run for the owner), stage 1 is set to
start by itself after tonight's regression run.

## The sample runs on the Claude plan

At about 23:15 UTC the owner asked why API credit was needed with no web app, when a Claude worker can run here. Only
one question needed the API: what a web app would pay for an answer and how long the answer would take. The pilot
answered it: $1.81 to $5.67 and 6 to 19 minutes a case, at effort `high`. Comparing Claude's answers with ChatGPT's doesn't
need the API, and the sample should have been planned on the plan from the start. The overnight API run was stopped
before it spent anything. API spending for the trial ends at $13.09 ($0.09 for the plumbing check and $13.00 for the
pilot), and the rest of the $60 in owner answer 226b stays unspent.

The sample runs on Claude workers on the owner's Claude plan (`scripts/web-engine-worker.mts`): Claude Code run
headless, with the engine's system prompt, AskRigor's tools on the engine's sign-in, web search and web fetch, the
engine's refusals and guards in a hook, and nothing of the user's own settings. Two small check cases at 23:25 UTC
showed that it used no API key and saw AskRigor's structured results, and that the hook's refusal and the protocol
guard both worked. The remaining differences from the engine are in the plan.

## Stage 1, on the Claude plan

- **The run:** worker at `1346b3aa`, against production build `b9e658e2` (checked before it started), on the owner's
  Google login. Claude Code 2.1.312, Claude Opus 5.5 at effort `high`. It started at 08:05 UTC on 3 Nov, five minutes after
  YouTube's daily quota reset: tonight's regression run, which ended at 01:41 UTC, had used up the quota. It ended at 08:40
  UTC.
- **Checks:** every case reported no API key and was connected to AskRigor. Each loaded Universal and HRP by its seventh
  AskRigor call. No call was refused, no conversation was compacted, and the account's card saving stayed off.
- **Plan usage:** none of it was API spending. The plan's rate-limit notices during the run showed its five-hour window at 3% or
  less and its week at 40 to 41%, with other sessions using the same plan.

| Case | Time, Claude / ChatGPT | AskRigor calls, Claude / ChatGPT | Protocol loads, Claude / ChatGPT | Final-check calls, Claude / ChatGPT | Cost had it run on the API |
|---|---|---|---|---|---|
| `q136-weak-lead-given` | 17.7 / 16.3 min | 44 / 66 | 2 / 11 | 2 / 3 | $6.31 |
| `r376-forum-500` | 11.0 / 13.4 min | 51 / 59 | 3 / 11 | 2 / 5 | $4.35 |
| `q126-39-replication` | 6.1 / 12.3 min | 29 / 55 | 5 / 9 | 1 / 4 | $2.66 |

- **ChatGPT's answers:** from tonight's regression run on the same build (2 Nov, 21:07 to 23:36 UTC).
- **Protocol loads:** Claude's were fewer but broader. In `q136` it loaded Universal's and HRP's core sections. In
  `q126-39` it loaded both indexes and then the sections the case needs (`claim_scope_predicate_alignment_gate`,
  `AnswerShapeController`, `StatisticalAndClinicalInterpretation`).
- **The final check:**
  - `q126-39` passed at its first call.
  - `r376` passed at its second.
  - `q136` passed at its first call; Claude then searched further and checked again.
- **Sources Claude's runs lacked:** Europe PMC failed at every call. Its own public interface answered 503 at 08:42 UTC, an
  outage at Europe PMC's end; Claude searched PubMed instead. ChatGPT's runs the night before had Europe PMC. Gemini's
  YouTube scout was out of budget in `q136` and `r376`. Web fetch failed on two pages, one of
  them on old.reddit.com.
- **Other errors:** five AskRigor calls were rejected for their input and succeeded on the next call:
  - a plain-answer claim too long, or not copied exactly;
  - a review audit whose source didn't match;
  - a figure without its working.

## Stage 1's blind judging

- **The packet:** each case's question, its criteria (`docs/owner-regressions.md` at `b9e658e2`, the sections whole),
  and the two answers as A and B, in an order drawn at random. The key stayed in another folder until both verdicts were
  in.
- **The judges:** a Claude subagent on the plan, and GPT-6.1 Sol at extra-high reasoning through Codex, read-only, with
  its apps, browser and the owner's other servers off. Each read only the packet.
- **The rule:** how two judges count was committed (`6714abb2`) before either started. A case counts only when both
  prefer the same answer.

| Case | Claude judge prefers | GPT judge prefers | Counts for | Criteria, Claude judge (Claude's / ChatGPT's) | Criteria, GPT judge (Claude's / ChatGPT's) | ChatGPT's answer in #394's judgment |
|---|---|---|---|---|---|---|
| `q136-weak-lead-given` | Claude's | ChatGPT's | neither | in part / in part | fails / fails | fails |
| `r376-forum-500` | ChatGPT's | ChatGPT's | ChatGPT | in part / in part | in part / passes | in part |
| `q126-39-replication` | ChatGPT's | Claude's | neither | in part / passes | fails / fails | passes |

Claude won no case and ChatGPT one, so **under the rule, stage 2 doesn't run.** Neither judge simply favoured its own
family: the Claude judge preferred ChatGPT's answer in two cases, and the GPT judge preferred Claude's in one.

What decided each case:

- **`q136`, a weak lead:**
  - Both answers keep the pasted plant off the shortlist, name the user's abstract as its source and say it wasn't
    found. Both give it a section of its own instead of a brief line at the end, so neither meets that criterion.
  - The Claude judge preferred Claude's answer: it gives an order by IBS type and covers the non-plant options.
  - The GPT judge preferred ChatGPT's: it reads single trials more closely and adds safety points Claude's lacks, such
    as the peanut oil in an anise capsule.
  - Errors in Claude's answer:
    - it turns the rat dose into a human "helpful dose" of 3 to 4 g a day;
    - it says the plant "has never been tested in people", where the abstract says only that no study has been
      reported;
    - it calls psyllium "the lowest-risk option" without having checked its risks.
- **`r376`, months at 500 kcal:**
  - Both judges preferred ChatGPT's answer. It states its rule, names the one report that qualifies, and labels each
    near miss.
  - Claude's answer calls its best report "the closest match" without saying whether any report qualifies.
  - It also reads one statistic two ways: "47% more than they reported", then under-reporting "by about half".
  - Claude's run had little to work with. AskRigor's forum reader returned `inaccessible` for all six Reddit threads it
    tried, and for both in `q136`. The night before, ChatGPT's run read 11 of the 16 it tried. At 09:00 UTC the reader
    still couldn't open a thread it had read then. So this case's comparison is confounded by a reader failure on
    production, outside the trial.
- **`q126-39`, a failed replication:**
  - ChatGPT's answer identifies the studies as Cook and Persinger (2001) and Granqvist and colleagues (2005). It
    reconstructs both, and reports the later study's tests by suggestibility.
  - Claude's searched another literature (theta-burst and rTMS studies of hypnotic suggestibility), couldn't identify
    the studies, and assumed the later one "reported only an overall average".
  - The Claude judge preferred ChatGPT's answer, for answering from the studies themselves.
  - The GPT judge preferred Claude's, and failed both. The criteria section says the case's studies "are made up", so it
    took ChatGPT's identification (89 people, not 90) as unsupported. That sentence was in the packet because the
    section was copied whole; the prompt follows those two papers closely. The split stands under the rule.
- **Tools that worked for ChatGPT's runs but not Claude's:** Europe PMC, the Reddit reader and Gemini's YouTube scout.
  Only the Reddit reader plausibly changed a verdict (`r376`).

## What the trial shows

- **Cost and time**, the one question that needed the API: $1.81 to $5.67 and 6 to 19 minutes a case at effort `high`
  in the pilot. Stage 1's three cases would have cost $2.66 to $6.31 on the API.
- **Quality:** with the skill, Claude loaded the protocols, passed the final check and made fewer AskRigor calls, and
  its answers were about level with ChatGPT's. Two judges of different families agreed on one case of three, for
  ChatGPT's answer, in the case where Claude's run couldn't read Reddit. Nothing here shows that an AskRigor web app on
  Claude would answer better than ChatGPT's app does now.
- **The end:** under the rule the trial ends after stage 1. API spending stays at $13.09. Stage 1 and its judging used
  the owner's Claude plan and, for the GPT judge, the owner's ChatGPT plan.

## Lesson closeout

`npm run lessons:status` at 11:24 UTC on 3 Nov: 34 open, none needing review, 1 accepted but not incorporated, 38
incorporated or closed, none eligible for deletion, and no lane items unrecorded. None bears on this trial.

Two points of method for the next comparison of two systems. Both are specific to this kind of trial and recorded
here, so no new lesson is filed:

- **Check each shared source just before each side runs,** and wait if one fails, so both sides have the same tools.
  Here the Reddit reader worked for ChatGPT's runs the night before and failed for Claude's, in the one case the
  judges agreed on.
- **Give the judges the pass criteria, not notes on how the cases were made.** A judge who reads that a case's studies
  "are made up" knows something the answer's author couldn't.
