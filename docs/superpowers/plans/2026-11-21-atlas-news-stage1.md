# Atlas news, stage 1: news in shadow (server side)

21 Nov 2026. The owner, 01:41 UTC: "ok you can continue the work all night on the roadmap"; the roadmap's "Next" list
has "Science news, checked". The design is design v4 in the private owner-pages repository
(`askrigor/atlas-news/design-v4.md`), with Codex's last check (`codex-check-v4b.md`). Stage 1 stores each day's news
privately and shows nothing on any page. It needs the owner's release yes; stage 2 (the flag at "on") is a separate
release and a separate yes.

## The publish-wait bound (Codex's one open gap, settled before the build)

Codex: the 60-second handler limit "bounds server handling, not the scheduled session's connector/network wait", so
the task text must say what ends each publishing or read-back wait.

**The wait's bound is the client's, normally 300 to 330 seconds a call; the server answers within 60.** Read in the
Claude Code builds this laptop runs (2.1.317 and 2.1.325, the desktop app's, and 2.1.322, the CLI's): a call to a remote
MCP server (any type but stdio, sdk and the IDE ones, so the claude.ai AskRigor connector too) is aborted when it has had
"no response or progress notification" for `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, which defaults to 300,000 ms for such
servers (1,800,000 for stdio); a watchdog checks every 30,000 ms (Codex found the tick; 2.1.325 confirms it), so the
abort comes 300 to 330 seconds after the last byte. Its message: `MCP server "…" tool "…" sent no response or progress
for …s; aborting`.
The wall-clock default (`MCP_TOOL_TIMEOUT`) is 100,000,000 ms, so the idle timer is the one that acts. AskRigor's
server sends no progress notifications anywhere (`notifications/progress` appears nowhere in `apps/research-mcp/src`),
so for its calls the idle timer acts as a wall clock: under normal scheduling a call that hasn't answered in 330 seconds
ends with an error and the session goes on. It is a polled idle limit, not an absolute one: a laptop that sleeps, or a
stalled process, can stretch it, and a per-server `timeout` could raise it. No override is set on this laptop (no `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` or `MCP_TOOL_TIMEOUT` in
`~/.claude/settings*.json` or the desktop app's config, read 21 Nov), and the task reaches AskRigor through the
claude.ai connector, a remote server type. Every news action answers within 60 seconds, and the day call's database
function accepts a day only while its own clock is before the earlier of `not_after`, 50 seconds into the call and the
day's UTC midnight, and while its own UTC date is the day's: a final acceptance check, which the transaction's commit
follows (the physical commit comes just after the check, not before it). So the idle limit is reached only when the
network or the connector stalls, and a call is never accepted after its cutoff, however long its wait.

**The task's steps are sized to it** (the text for SKILL.md, for the stage-1 release):

- The Inbox item **and the owner's record** are written before the day call, with one line saying the day is being
  stored; afterwards both are updated with the publish note. The record is therefore never waiting on a call.
- At most **two waits** in all: the day call, then one of a replay (same file), a rebased call (after `stale_base`) or a
  read-back (`list_news_items`). A day still unknown after both is settled by the next run's base check and read-back
  (design 3.8, 14), so no third wait is ever needed. Under normal scheduling, 2 × 330 s = 11 minutes of waiting at
  most, plus the rebase and the record's update, which have no proven bound; usually under 2 minutes in all.
- A publish call starts only with at least 120 seconds before `not_after`; the read-back may be made after it.
- The run's deadline bounds the writes, not the status note. Each publish call starts at least 2 minutes before
  `not_after` (7 before the deadline); only the read-back may start later, and it is the last wait. So under normal
  scheduling, with both waits silent, the waits end at most 4 minutes after the deadline (a publish call started 7
  minutes before it, silent for 5.5, then a silent read-back of 5.5), and the note comes after them, with no bound
  claimed. Nothing waits on that note: the digest and the record are already written, and no day is accepted
  after `not_after`.
- Each wait's start and end (`date -u +%s`) go in the published.json note, so the shadow period measures them (3.10).

If a later Claude Code changed the idle default, no day could be accepted late (the server's final check), and only the
Inbox update could be later; the measured waits would show it.

## Scope of this pull request

- `news_card` (later input of `finalize_research`, read from the raw call, never holding the answer back), its rules in
  code, its own backing-line lookups (with the findings card's, same lookup and deadline) and its own signed claims
  `news`, `nl`, `ns`, `nr`; a passing call marked `findings_save: "off"` from a dev account, whose receipt carries
  `news` and `nl`, stages the card through the research-access role; the result says `news`.
- Owner actions of `review_research_contribution` (no new tool; the frozen lists stay as they are):
  `publish_news_day` (later input `news_day`), `withdraw_news_item` (`news_number`), `list_news_items` (`news_date`
  or `news_number`).
- The day call: today's UTC date only, `not_after`, the handler's 60 seconds, idempotent on (day, payload digest), the
  base check (`stale_base` with the server's record), the weekday/Sunday order rules, 3.4's steps 1, 2, 3, 5 and 6 per
  new main item and 3.5's structural checks per line, one transaction.
- Migration 0043: `atlas_news_items`, `atlas_news_days`, four SECURITY DEFINER functions; no table right for any role,
  the canonical reader included (nothing in shadow can leak through a page's read); the provisioning grants and the
  acceptance script's whole-set checks.
- `ASKRIGOR_ATLAS_NEWS`: `off` (default) or `shadow`. Any other value is off in this build; "on" comes with stage 2.

## Deliberate differences from design v4, and why

- **Step 4's word patterns stay in the news check, not on the server.** AGENTS.md: a check on model output must work in
  any language, and pattern lists decide only exact questions. The server relies on step 6's reading (a model's
  judgment of advice to start, stop or change a treatment) and keeps the exact checks (steps 2, 3).
- **No page reads the news tables in stage 1,** owner pages included, and the reader role has no right on them. The
  owner and the shadow readers read through `list_news_items`. Stage 2 adds the pages and the reader's grant.
- **"Abstract read" lines are checked for their structure only** (closed reason, a quote of at least 8 words, a DOI, the
  reading's verdict); that the quote is in the Europe PMC abstract is for the shadow readers, and a server lookup
  before stage 2.
- **Release B's reading (step 7) doesn't run in shadow:** items stay `shadow`, which no page shows.

## Codex's review of the first commit, and what changed

Codex (read-only, 21 Nov, `codex-review-1.md` in the release folder) found ten defects; each is fixed, with a test:
a committed payload reported "late" on a replay after `not_after`, and an older version's replay judged again (the
replay is now read by its exact digest first); signed lookups not enforced (a funder, an agency's action or How much's
figures now need their line found); a DOI not tied to the paper the check read (the receipt now signs news claims only
for a DOI its verified receipts name); a slow news lookup able to erase the other lookups (now apart, with its own
deadline); a replaced item left in the stored order; withdrawal and commit not serialized, and a checked line's
disposition taken from the application (both now under one lock, and the line from the database's final decision); a
day accepted across UTC midnight (the final check now reads the database's own date, and the deadline stops at
midnight); limits that let one item fail its day (capped and aligned); read-backs without a time bound (every action
now has 60 seconds, and connections 5); a re-staged card keeping its first draft (it takes the newer one while staged,
and a reading names the draft it read). Its bound remark is taken in above (330 seconds; the status note may come
after the deadline).

Codex's second round (`codex-review-2.md`, of `82ee6f57`) found six of the ten fixed and four partly, and five
defects, each now fixed with a test: a newer draft re-staged between the day call's read and its commit (the
database now keeps back a passing item whose reading doesn't name the card and the draft the row holds, and re-staging
takes only a newer receipt's draft); a DOI tied only by any receipt, a DOI resolution included (it must now be a key
source's paper, with its own record, full text or audit receipts); two versions of one item passing in one call (one
version a day, the newest; the others are kept back as superseded, and the database refuses two passing versions);
withdrawing a kept-back item breaking its row's rule (a withdrawal clears its reasons; the day's record keeps them);
and text whose JSON form could overrun the row (no control characters in stored text, and the day's size checked
against three quarters of the row's limits). Its acceptance remarks are taken in: the run's date comes from the
database, and the final date check has its own case.

Codex's third round (`codex-review-3.md`, of `fdc1e5d8`) found D, E and the acceptance remarks fixed and A to C
partly, with two defects the fixes brought in; each now has a fix and a test: a newer receipt for an unchanged draft
now advances the stored receipt too, so a receipt between them can't bring an older draft back, and another draft
signed in the same second as the stored one is refused (`draft_conflict`), never silently dropped; the DOI must also
be the paper the card's backing lines quote; an older version of an item never displaces a newer one already on show
(the database keeps it back as superseded); and every reason, the missing DOI included, is settled before one version
is chosen, so a version that fails can't displace one that passes. Its wording remarks are taken in above. Codex
hasn't re-read these third-round fixes.

Further differences from design v4 that Codex named, left for stage 2: "abstract read" lines live in the day's row,
not as numbered items, so they can't be withdrawn one by one (withdrawing every item leaves them, unshown); no outlet
counts or upkeep re-reads of corrections yet; the reading covers the narrative fields, and the closed fields
(availability, funding) need their coverage rule before any page shows them.

## Left for later in stage 1

- The news check's changes (design 12.3) in a copy on the HDD, behind `NEWS_CARD`, and the task's new step.
- The owner-only preview pages at "shadow" (design 12.2), if still wanted.

## Steps

1. Tests first where the shape is known: card rules, later inputs, store semantics (in memory), day checks.
2. Store and migration 0043; the Postgres acceptance run for the functions, grants and the 5-second limit.
3. Gate claims and staging in `finalize_research`; the owner actions.
4. `npm run verify`; the frozen-list check unchanged; the private-map check; Codex's read-only review.
