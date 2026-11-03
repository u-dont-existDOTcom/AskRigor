# A push check for numbers and IDs from the private comment maps

Owner answers 175, 208b and 212b (counts from YouTube comments never on public pages; maps kept privately). Built on the
branch `claude/awesome-villani-1b32f7`. Reference: `docs/private-map-leak-check.md`. Owner question 228 asks whether to turn
the hook on.

## Why

Three times a map's numbers headed for this public repository, and each time a person caught them:

| Date | What | How it was caught |
|---|---|---|
| 31 Oct 2026 | Counts and IDs sat in the public channel registry for about 11 hours (removed in `f7a79d35`) | By eye, after the fact |
| 1 Nov | A regression-judgment draft carried a video case's counts | At the push, by eye |
| 2 Nov | A test fixture labelled "invented" reused one real map's counts and its video's comment total | Before the push, by eye |

Whether an added line repeats a number or an ID of a private page is an exact question. By the repository's rule
(`AGENTS.md`, code review rules) code answers exact questions and a model or a person answers questions of meaning, so the
repair is a check that compares, not another reminder. Word lists would not do: the numbers are the evidence, whatever the
words around them, and the pages may hold any language.

## What was built

- `scripts/lib/private-map-leaks.mts`: reads the maps (video ID, sample, total, the numbers of the "Tried it" line) and
  compares them with `git log -p -U0` output: added lines, changed file names and commit messages.
- `scripts/check-private-map-leaks.mts`: finds the pages (`ASKRIGOR_PRIVATE_COMMENT_MAPS`, else the owner-pages checkout),
  works out the commits a push publishes (the pushed refs minus the remote's old tip and its remote-tracking branches),
  and prints a refusal that names commit, file and line and never a value. Modes: `pre-push` and `range`. Every printed
  path passes through a redaction of the IDs and totals.
- `.githooks/pre-push`: runs it with the repository's pinned Node (24 strips the types, so a fresh worktree needs no
  install). It is **off**: Git ignores the folder until `git config core.hooksPath .githooks`, which changes the clone's
  shared config and so every worktree's. That is the owner's call (question 228).
- `tests/private-map-leaks.test.ts`: invented maps in a temporary folder (every figure compared with the real pages and
  found on none), the rules, the skip, the redaction, and real `git push` runs through the hook into a local bare remote.
  On a machine that has the real pages one more test re-reads them and fails if a map's layout is no longer understood.

## Decisions made while tuning

Method: replay all 2,137 commits of `main` (a few seconds) and measure false alarms, build thirteen shapes of leak in memory from
the real maps (a registry row, JSON on one line and on many, a table row, prose with and without sample and total, an
array, reordered numbers, foreign numbers between them, a partial copy, YAML with comments, sentences on separate lines, a
dated comment) and measure how many the counts rule alone catches (totals switched off), 169 cases in all. Nothing was
printed or written but counts and masked line shapes.

1. **Video IDs are refused only when new to the public branches.** One mapped video is an old test fixture: its ID is on
   348 added lines across the tests and older documents, and the registry and older plans name others. Refusing every added
   ID would stop most edits of those files for nothing (375 findings on 2,137 commits against 14 with the exemption). The check asks Git whether a remote branch's files already hold the ID
   (`git grep` on the remote's tips; the parent's tree when replaying). The 31 Oct registry commit still trips it: those
   IDs were new that day. Owner answer 227 keeps the registry's video IDs.
2. **A comment total of four digits or more is refused alone**, as asked. Three-digit totals and samples count only with
   the other numbers.
3. **Counts are a cluster, not a set.** First version: three different counts of two digits or more in 12 added lines.
   On its own it flagged 38 commits, mostly numeric tables (audit results, a SQL parameter list, JSON lines). Requiring
   the map's numbers to be most of the numbers of two digits or more in the window, and a window of 8 lines, left two.

   | Window | Share | Alarms in history, outside the 31 Oct leak commits | Findings kept in the 31 Oct leak commits | Shapes caught, of 169 |
   |---:|---:|---:|---:|---:|
   | 12 lines | none | 127 findings in 38 commits | 13 | 165 |
   | 12 lines | 50% | 12 findings in 7 commits | 9 | 165 |
   | 12 lines | 60% | 6 findings in 5 commits | 9 | 165 |
   | **8 lines** | **60%** | **2 findings in 2 commits** | **9** | **165** |
   | 8 lines | 70% | 1 finding in 1 commit | 5 | 158 |
   | 8 lines, four different counts | 60% | 2 findings in 2 commits | 6 | 147 |

   A 70% share starts to miss the leak lines of 31 Oct, and requiring four different counts loses more leaks than it
   saves; the shapes it misses are copies of only two counts plus the sample.

## Replay of `main` (final settings)

2,137 commits scanned, 9 flagged (37 findings: 14 video ID, 12 comment total, 11 counts):

| Commit | Date | Findings | Verdict |
|---|---|---|---|
| `4bca5a03` registry: the 31 Oct channels and measured comment ratios | 31 Oct 01:22 | 24 (8 IDs, 8 totals, 8 counts) | The leak the check is for; it would have been refused |
| `75a7ca55` plan: video comment maps | 31 Oct 13:19 | 3 (2 totals, 1 counts) | Same leak class; `f7a79d35` removed it |
| `9a9b14a8`, `e03f91d6` plan: next build after #387 | 31 Oct | 1 total each | Totals named in a plan; still in `main` (question 228) |
| `d6c07570` registry | 31 Oct | 1 ID | An ID new to the repository; video IDs stay (227) |
| `ca347a28` plan (10 Aug), `19265656` audit (21 Aug) | Aug | 4 and 1 IDs | First appearance of a video that was mapped later; harmless |
| `718e20f3`, `7d4dfef2` regression judgments | 21, 22 Oct | 1 counts each | Coincidence: three ordinary two-digit numbers of one map in a run of results |

So two commits in 2,137 were false alarms (about one push in a thousand), and every real leak was caught. Scanning the
current tree of `main` as if it were all added today finds the same two coincidences and four comment totals in
public plan lines (listed on the owner page, not here).

The 2 Nov fixture, as it stood in the unpushed commit `6025d739`, is refused (7 places: totals and counts of two maps
that share a video). Its amended version `1e2f1b7d`, which is on the branch of draft #405, is not clean either: lines
49 to 51 of `tests/atlas-comment-map-pages.test.ts` hold three two-digit numbers that equal three counts of one
other map. Block by block the fixture is nowhere near a copy (no block shares more than 4 of 6 numbers with any map, and
the 5-number block shares 3), so this is the coincidence class; changing an invented number clears it.

## Limits, stated

Digits only: words, rounded or derived figures (rates, "about 1,200") and paraphrases pass. A merge commit's own conflict
resolution is not read. A sandbox that cannot read the owner-pages folder skips the check (it says so). The reader depends
on the pages' layout; the guards are the refusal when pages are present but unrecognized and the smoke test on the real
pages. Thresholds were tuned on this history and on shapes built from the real maps, so a new kind of leak may need
another look; the replay and the shape trials are repeatable with `npm run check:private-maps -- range main`.

## Lesson closeout

- Failure class: private-map numbers reaching the public repository, caught only by eye, three times in three days.
- Mechanism change: an exact comparison at the push boundary, replacing vigilance. Not another local exception.
- Disposition: `project-specific`. A universal pattern ("compare outgoing diffs with the private source of truth") would
  need its transfer rationale and limits first; not promoted.
- Canonical state: this plan and `docs/private-map-leak-check.md`. `project/CODEX-CURRENT-STATE.md` is a recovery
  checkpoint and was not touched.
