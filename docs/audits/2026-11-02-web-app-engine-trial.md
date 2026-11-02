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

## Quality

Judged on the sample, in stages: stage 1's three cases, then stage 2 only if they show Claude better in more cases than
worse (`docs/superpowers/plans/2026-11-02-web-app-engine-trial.md`).
