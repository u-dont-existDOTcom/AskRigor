# Private-map leak check

The owner keeps per-video YouTube comment maps on a private page (owner-pages, `askrigor/comment-maps-*.md`). AskRigor
told YouTube their counts would never appear on public pages (owner answers 175, 208b and 212b), and this repository is
public. The check refuses a push that would publish a number or an ID from those maps. It is exact code, not a judgment:
it compares what the pushed commits add with values read from the maps, and prints only the file and line of a match,
never the value.

## What it refuses

For each map, in the added lines of every pushed commit, in the names of the files it changes and in its commit message:

| Rule | A match is |
|---|---|
| Video ID | the map's video ID, unless the remote's branches already hold it. A mapped video's ID is a test fixture and a registry entry, so only a new appearance is news. |
| Comment total | the map's comment total when it has four digits or more, written with any common group separator (`7413`, `7,413`, `7.413`, `7 413`, `7_413`, no-break spaces) or in other scripts' digits. |
| Counts | at least three different counts of two digits or more from one map (sample, total, the numbers of its "Tried it" line), or all of that line's numbers, within 8 lines of each other in the new file, when they are at least 60% of the numbers of two digits or more there. |

Small numbers alone pass: a sample of 400 or 20 people is ordinary code. A table, a SQL parameter list or a run of audit
results holds many numbers; three matching ones among them are not a map, which is what the 60% share is for.

Limits. It compares digits. Words ("four hundred"), rounded or derived figures (a rate, "about 1,200") and paraphrases
pass. A merge commit's own conflict resolution is not read. Percentages are not compared. A coincidence is possible,
mostly among invented two-digit numbers in a fixture; the fix is to change an invented number, as the owner's rule for
fixtures asks (invent numbers that match no private map).

## Where the maps are

`ASKRIGOR_PRIVATE_COMMENT_MAPS` names a file, a folder of `comment-maps-*.md` pages and its `comment-maps.json` store, or
several of them separated by the platform's path delimiter. Unset, the check reads `~/claude-work/owner-pages/askrigor`, so pull that checkout after a map is
added. Where no map is found or readable (CI, another computer, a sandbox that cannot reach the folder) the check says it
was skipped and passes. Where pages are there but no map is recognized, it refuses: the layout may have changed and
nothing would be protected. The page reader starts a map at each line that links a video and takes "comments read: 400 of
1,234" (or "all 87") and the numbers on the "Tried it" line, leaving rates out. The store (schema
`askrigor.comment-maps.v1`, which the owner's private Atlas view is rendered from) is read as well, so a page's layout
can't hide a map: on 5 Nov 2026 six maps written on a page as one summary table, without video links, went unread
until that was noticed; `tests/private-map-leaks.test.ts` re-reads
the real pages on a machine that has them and fails if a map no longer has a sample and its outcome numbers.

## Using it

- `npm run check:private-maps -- range origin/main..HEAD` checks any commits by hand, for example before pushing a branch
  whose fixtures hold invented numbers. `range main` replays all of history.
- `.githooks/pre-push` runs it on every `git push` once `git config core.hooksPath .githooks` is set. The setting lives in
  the clone's shared git config, so it applies to every worktree whose branch holds `.githooks/pre-push`. It is off until
  the owner turns it on (owner question 228). Turn it off with `git config --unset core.hooksPath`.
- A refusal exits with status 1 and lists the commit, file and line. If a match is a coincidence the owner decides:
  `git push --no-verify` skips the check.

## Evidence for the settings

`docs/superpowers/plans/2026-11-03-private-map-leak-check.md` records the replay of this repository's history and the
trials of the numbers above.
