# Production release, 2026-11-09 (owner answer 281)

- **Owner decision:** "281 release it now only if you think that would help you develop the rest smarter, in general we
  don't need minor incremental releases unless that helps in that way", typed in chat at 13:43 UTC on 9 Nov in the
  session that made this release. It helps: ChatGPT reaches only production, so whether ChatGPT's modes follow the
  framing, the menu and the research style, and how long each kind of task really takes, can be measured only once
  these are live; the call record shows which calls arrived.
- **Contents:** #433, the waiting build:
  - **research the person can steer** (owner answer 279a, from the owner's report AskRigor#434): a research style per
    account (guided, balanced by default, or autonomous; checking back after 10 minutes; adjusted variables flagged
    only, or all), migration 0033; the framing with the plain answer; runtime action `plan_research`, a numbered menu of
    next tasks with planning time ranges; the loop between people's reports and studies as menu tasks; the research time
    at the end of the quick-answer note; the research target checked against the plain answer's, and the panel saying
    why a comparison is missing;
  - **after the owner's Syrian rue oil comparison of 9 Nov:** at the quick screen and the menu, a source's significant,
    rich, high or substantial is not a size; for a widely used remedy, people's reports from the start, and a first menu
    with no task reading them says to add one. The comparison page drafted for the site was held back: the 1999 paper
    behind the other answers' "rich source" gives about 0.9% harmine plus harmaline in the oil in its full text;
  - **the content-free call record** (owner answer 280a): migration 0032, kept 7 days, shown only to its own signed-in
    account (runtime action `list_calls`); the privacy notice's "Your call record", effective November 9, 2026, released
    first;
  - **how a free account's notice was accepted** (the owner, 6 Nov): migration 0031; the notice is asked again only when
    it collects or publishes more;
  - whole results for apps that read only text (lesson #59), and the #431 fact-check repairs;
  - the roadmap's What's new for 9 November.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so **no app needs a refresh**. No compose or env change; the access role's script changed.
- **Before deploying:**
  - `npm run lessons:status` at 14:10:54 UTC: open 42; needs review 5; accepted but not incorporated 1; incorporated or
    closed 41; deletion eligible 0; lane items unrecorded 0.
  - All seven CI checks passed on #433's head `9b6cc27b` (the deterministic verification finished at 14:13:42 UTC).
    `npm run verify` at `9b6cc27b`: 6,406 passed, 6 skipped, the typecheck and the build;
    `npm run contributor-access:postgres-acceptance` at `9b6cc27b`: PASS, with the steering and call-record checks.
- **Source:** #433 marked ready and merged at 14:14:09 UTC as `dc4cf76a44112e6b0b2f0646b539244b9a20e088`, whose tree
  equals the head's.
- **Image:**
  - source archive SHA-256 `f2ef8600b6442c93d27b02a83bdde38eede3bb509e96e17445cd67de4dcb1138`;
  - ID `sha256:9afab5d937f9dd251712cb4c0827d5e0ef52ae773784b475a17703c950aea85e`, user `node`;
  - image archive 121,992,435 bytes, SHA-256 `56fc3e27e82da367965f1eacbb2c40c2118f9b279203fc7848c258948ce43468`, copied
    with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.40 and Universal 20.5.46, and one log line, naming no credential.
- **The site, first (14:15 UTC):** the archive was made with the merge's own script in the next-build worktree, whose
  tree equals the merge's; its tar equals the separately built one
  (`9df1f5de910ab0ff3cca38a758bb3ae02c6a42b37c4322cee3b07e005f65af55`); the archive is 324,368 bytes, SHA-256
  `59c9c48f6d485ef0089572a5d02d2e72bfd666c436d86e9437fb3f4872f7d6b1`, checked again on the host; the installer is
  unchanged (`c7992a2f`). Staged root-only and installed over release `2dff293b` with the Atlas upstream and the proxy
  secret read on the host; Caddy recreated. All eight pages and `robots.txt` equal the merge's files byte for byte; the
  privacy page reads "Effective November 9, 2026" and the terms "Effective November 6, 2026"; through askrigor.com the
  Atlas pages answer as before, with their security headers, and `askrigor.com/atlas` equals `mcp.askrigor.com/atlas`.
- **Prior state (stage A, 14:16:08 UTC):** research-mcp on `dc2887b1`, healthy; `compose.living-evidence.yaml`
  `196da407`; the role scripts `a40256a6` and `d0ceedfc`; `runtime.env` 79 names; the promotion timer enabled.
- **Stage B, first run (14:16:41 UTC), stopped at its last check:**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-dc4cf76a44112e6b0b2f0646b539244b9a20e088` (the prior image tagged
    `rollback-pre-dc4cf76a4411`, the selector, `runtime.env`, both compose files and both role scripts, and a
    `living_evidence` dump of 17,431,755 bytes, SHA-256 `8750c959d95f9ff9…`);
  - migrate: 0018 to 0033 recorded with the release files' hashes, and the notice check admits v5;
  - both role scripts re-run (the access role's new `7f361afa`); the review role may run exactly its script's 36
    functions and the access role its 15;
  - then the boundary check failed on a syntax error in its own query, new in this release's script (one bracket too
    many in the line that asks whether the reader can read the call record). Nothing after it ran: research-mcp stayed on
    `dc2887b1`, which ignores the new columns and table; migration 0031's trigger clears the acceptance fields if that
    image writes an account.
- **Stage B, second run (14:18:25 UTC),** with the query fixed and the first run's rollback kept, not copied again:
  - boundaries: the review role holds no table or column right; the access role holds exactly INSERT, SELECT and
    DELETE on `research_call_record`, INSERT and SELECT on the proposals, SELECT on the entitlements, INSERT and SELECT on
    the accounts, and UPDATE on its 15 account columns, the five new ones included; the reader can't read the held
    YouTube findings or the call record, and reads the 11 Atlas tables;
  - `runtime.env`: 79 names, only the build line changed; the selector names
    `askrigor-research:dc4cf76a44112e6b0b2f0646b539244b9a20e088`; the owner's maps file reinstalled with the same bytes;
    the compose file unchanged;
  - research-mcp recreated at 14:18:45 UTC, healthy, with the reader and maps mounts read-only.
- **Stage C (14:19 to 14:21 UTC):** `/version` names build `dc4cf76a`, HRP 20.6.40; an unauthenticated POST gets 401;
  `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal their fixtures in the image; the
  site's pages and the Atlas pages answer 200; a passing final check; the full-text, forum-reader and shared-answers
  probes pass; 14 of 14 review actions named in the published description (the action enum unpublished, as since 189a);
  a clean draft passes, and a key source with no receipt and an arithmetic error still block; the steering module and
  the runtime actions `plan_research`, `set_research_steering` and `list_calls` are in the image, with a 7-day call
  record; one log line.
- **Promotion:** the hardened one-shot service ran once (success), the timer was enabled again with its next trigger at
  14:20:10 UTC, and the selector binds the deployed image.
- **Plugin:** no packaged file changed since `dc2887b1` (0 of 8); the source and the installed copy each equal the
  merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it was not reinstalled.
- **Connector probe (Codex's AskRigor app, 14:21 UTC):** 35 tools; `tool_list_version` `0d6016087ee4bc5a`; HRP 20.6.40
  (`afd3d881356337dd`), running build `dc4cf76a`; no out-of-date sentence; `inspect` ACTIVE, FREE_CONTRIBUTOR;
  `list_calls` listed that account's calls, the newest its own `inspect`, marked ChatGPT's, on `/mcp`.
- **The call record, end to end (Claude's connector, 14:21 UTC):** `inspect` showed the account's style at the defaults
  (balanced, 10 minutes, adjusted variables flagged) and its notice accepted by the person; `list_calls` then listed
  exactly that `inspect` call on `/mcp/claude`, answered in 32 ms, kept 7 days.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-dc4cf76a4411` (the image of `dc2887b1`),
  restore `runtime.env` from the rollback folder, recreate research-mcp, and empty `research_call_record`
  (`infra/living-evidence-production/README.md`); reinstall the `2dff293b` site release, whose privacy notice has no
  call record. Migrations 0031 to 0033 only add columns, a table, a check and a trigger, which the prior image doesn't
  use.
