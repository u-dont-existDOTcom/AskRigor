# The model check, Claude against Codex, on answers it was never tuned on (owner answer 198a, 30 Oct 2026)

## What was measured

- **The check:** `scripts/model-check/check-instructions.md`, fourth draft, frozen before this run (`c2ed7d39`, SHA-256
  `9807260a4bb9c7e8…`). A checker reads one answer, its question, the earlier turns and the numbered research calls
  (`extract-bundles.py`), and reports problems with a verdict: sound, fix or unreliable. It never sees the owner's
  criteria. Each check is one stateless call with every tool off (`run-check.sh`), on the owner's own plans, at no API
  cost.
- **Development:** the 27 to 28 Oct run's 95 answers, judged on 28 Oct, used to write and tune the four drafts.
- **Validation (this report):** the 29 to 30 Oct run's 104 answer turns on #381's build, judged case by case
  (`docs/audits/2026-10-30-owner-regressions-judgment.md`) and never used to tune the check. Each turn was checked once
  by each checker, with the same bundle and the same frozen instructions:
  - **claude:** Claude Sonnet 5.5 through `claude -p` (effort high), on the owner's Claude plan, 30 Oct 05:03 to 05:23
    UTC;
  - **codex:** GPT 6.1 sol through `codex exec` (reasoning effort xhigh; no config, apps, plugins, browsers, hooks or
    web search; the owner's personal instructions replaced by the one-line override of owner answer 144a), on the
    owner's ChatGPT plan, 11:16 to 11:57 UTC, after both regression runs had ended.
  - All 208 results parsed; none failed.
- **Scoring:** three helpers each took a third of the turns with one brief
  (`docs/audits/2026-10-30-model-check/` holds their three files and every turn's verdicts). For each criterion the
  judges marked in part or not met, each checker's problems were scored as having caught it, partly caught it or
  missed it; a criterion resting on something neither could see (a declaration to AskRigor's final check, the check's
  rounds or stop) is out of scope. Every other problem was scored plausible, style or doubtful, and every serious one
  checked against the bundle. Both checkers were held to the same standard.
- **A caution:** the judgments are a Claude session's, so a Claude checker can agree with them through shared habits
  rather than accuracy. The cases each found and the other missed are listed in the three files for a spot-check.

## Results

| | claude (Sonnet 5.5) | codex (GPT 6.1 sol) |
|---|---|---|
| Judged shortfalls caught, of 52 it could see | 17, and 10 in part | 5, and 2 in part |
| Problems reported | 344 (3.3 a turn; none in 6 turns) | 40 (0.4 a turn; none in 77 turns) |
| of which matching a judged shortfall | 28 | 5 |
| plausible weaknesses beyond the criteria | 252 | 34 |
| style or doubtful | 64 (19%) | 1 (3%) |
| Serious problems: confirmed / partly right / wrong | 1 / 7 / 1, of 9 | 1 / 1 / 0, of 2 |
| Verdict "sound" on the 59 turns the judges passed | 13 | 49 |
| Verdict "fix" on the 42 turns passed in part | 34 | 13 (and 1 unreliable) |
| Verdict "unreliable" on the 3 failing turns | 0 | 0 (one called sound) |
| Verdict the same as the judges' (sound, fix, unreliable for passes, in part, fails) | 47 of 104 | 62 of 104 |
| Median time per check | 32 s | 54 s |

- **Recall:** claude finds at least part of about half the shortfalls the judges found (27 of 52), codex about one in
  seven (7 of 52). Across the three parts, every shortfall codex caught claude caught too; claude caught or partly
  caught 20 that codex missed: rankings of explanations, options left out, safety advice beside a self-test, effect
  sizes and numbers needed to treat, reading across turns.
- **Precision:** codex's problems nearly all hold up (39 of 40); about one in five of claude's are style or doubtful,
  and its doubtful ones tend to cut against what the case tests (asking for a limit the answer already states,
  disputing what the judges credit).
- **Calibration:** claude says "fix" almost everywhere (on 78% of the turns the judges passed), codex "sound" almost
  everywhere (on 83% of the turns the judges passed, and on two thirds of those they passed only in part). Codex's higher verdict agreement comes from
  most answers passing, not from telling them apart. Neither called any answer unreliable where the judges failed it.
- **What both miss:** facts no research call reached (vitamin A, a physician's case series, an oral B12 trial,
  "inactivated" for a vaccine, gallstones on a very-low-calorie diet), which a reader of the research cannot supply;
  lines AskRigor's code wrote, which the instructions tell them not to report; and a section's length against the
  case's rule.
- **What codex found that claude did not:** one code-written line that contradicted the research and the answer's
  opening (`o354-work-left`, the named-target caveat), outside the judges' criteria.

## What it means

- **The owner's question (198a), "i'm suspecting claude cli is better but not sure":** as a checker that finds
  problems, claude is better here, by about four to one on the judges' shortfalls, with the caution above. As a
  checker whose every word holds, codex is better. Neither is good enough to stop an answer: the better one finds
  about half of what the judges find, and both miss what the research never reached.
- **Where it could serve:** as a second opinion that returns its problems as notes, never as a block, in line with
  owner answer 193a; for example a claude-like pass for recall, with its weak problems filtered out (by a second
  reading, or by keeping only problems tied to a call and a quote).
- **Its known gap:** the bundles show each call's structured result only when it is small, so PubMed abstracts are cut
  (the next draft would keep them). Any new draft is tuned on development answers and measured again on a run it was
  never tuned on.
