# Atlas news, stage 1: news in shadow (server side)

21 Nov 2026. The owner, 01:41 UTC: "ok you can continue the work all night on the roadmap"; the roadmap's "Next" list
has "Science news, checked". The design is design v4 in the private owner-pages repository
(`askrigor/atlas-news/design-v4.md`), with Codex's last check (`codex-check-v4b.md`). Stage 1 stores each day's news
privately and shows nothing on any page. It needs the owner's release yes; stage 2 (the flag at "on") is a separate
release and a separate yes.

## The publish-wait bound (Codex's one open gap, settled before the build)

Codex: the 60-second handler limit "bounds server handling, not the scheduled session's connector/network wait", so
the task text must say what ends each publishing or read-back wait.

**The bound is the client's, and it is 300 seconds per call; the server answers within 60.** Read in the Claude Code
builds this laptop runs (2.1.317 and 2.1.325, the desktop app's, and 2.1.322, the CLI's): a call to a remote MCP server
(any type but stdio, sdk and the IDE ones, so the claude.ai AskRigor connector too) is aborted when it has had "no
response or progress notification" for `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, which defaults to 300,000 ms for such
servers (1,800,000 for stdio); its message: `MCP server "…" tool "…" sent no response or progress for …s; aborting`.
The wall-clock default (`MCP_TOOL_TIMEOUT`) is 100,000,000 ms, so the idle timer is the one that acts. AskRigor's
server sends no progress notifications anywhere (`notifications/progress` appears nowhere in `apps/research-mcp/src`),
so for its calls the idle timer is a wall-clock bound: a call that hasn't answered in 300 seconds ends with an error and
the session goes on. The news actions' handler answers within 60 seconds (`withinDeadline`), and its database function
stores nothing after the earlier of `not_after` and that limit, read from `clock_timestamp()` as its last step, so 300
seconds is reached only when the network or the connector stalls, and a stalled call can never store anything late.

**The task's steps are sized to it** (the text for SKILL.md, for the stage-1 release):

- The Inbox item **and the owner's record** are written before the day call, with one line saying the day is being
  stored; afterwards both are updated with the publish note. The record is therefore never waiting on a call.
- At most **two waits** in all: the day call, then one of a replay (same file), a rebased call (after `stale_base`) or a
  read-back (`list_news_items`). A day still unknown after both is settled by the next run's base check and read-back
  (design 3.8, 14), so no third wait is ever needed. Worst case 2 × 300 s = 10 minutes; usually under 2.
- A publish call starts only with at least 120 seconds before `not_after`; the read-back may be made after it.
- Each wait's start and end (`date -u +%s`) go in the published.json note, so the shadow period measures them (3.10).

If a later Claude Code changed the idle default, nothing could be stored late (the server's bound), and only the
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

## Left for later in stage 1

- The news check's changes (design 12.3) in a copy on the HDD, behind `NEWS_CARD`, and the task's new step.
- The owner-only preview pages at "shadow" (design 12.2), if still wanted.

## Steps

1. Tests first where the shape is known: card rules, later inputs, store semantics (in memory), day checks.
2. Store and migration 0043; the Postgres acceptance run for the functions, grants and the 5-second limit.
3. Gate claims and staging in `finalize_research`; the owner actions.
4. `npm run verify`; the frozen-list check unchanged; the private-map check; Codex's read-only review.
