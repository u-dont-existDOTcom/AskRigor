# Production release, 2026-11-12 (pure fixes, the owner's standing permission)

- **Owner decision:** released without a question, under the owner's standing permission of 12 Nov 2026 (chat, 18:11:16
  UTC): "you can do releases without my yes if you don't think there's any downside to the decisions, and we can roll
  back if it looks like the release made things worse. just ask me if there are tradeoffs to consider first". Every
  change below is a fix: AskRigor reads a menu it used to refuse, hands over a call the AI kept getting wrong, keeps the
  person's numbers as given, and fixes a wrong address and two replies too big for some apps. The one change that asks
  in a new case (a menu changed after the person saw it) keeps the person's own choice of tasks from being reused for a
  menu they didn't see; it was narrowed before release so a menu retyped in other words doesn't ask twice. The tradeoff
  found on the way, whether a precise question should skip the menu, was not built: it is the owner's question 294. The
  owner also asked for this release by name in chat at about 20:10 UTC ("merge and release
  u-dont-existDOTcom/AskRigor#439").
- **Contents:** #439:
  - **The menu in the AI's own names** (`a9e003f5`): `plan_research` reads camelCase keys, a task's title or name, one
    number as a minutes range, null as a field left out, `user_allocation` and `allocations`, and an allocation, done
    list or digest given beside the menu; other keys are left out and named in the result. A menu it can't read (tasks
    as strings, empty task objects, no tasks) is refused with `corrected_later_inputs` built from the AI's own call. It
    reads no meaning: a task's kind and what it could change must still be one of their values. Why: the owner's
    ChatGPT runs of 12 Nov on `a826ad10` (10 runs): every run's first 2 to 5 menu calls were refused, 15 to 20 seconds
    each.
  - **The "you decide" call** (`57cd7549`, `15e93476`): an ask ends with the exact `later_inputs` for "you decide", the
    allocation inside `researchMenu`, in its text and as `you_decide_later_inputs`; its line begins "Only once the
    person has replied "you decide", in a later message, never in this turn". Why: after "you decide" on 12 Nov,
    AskRigor refused five allocations and the AI researched without one (about 9 minutes against 7).
  - **A menu the AI changes on its own asks again** (`9560019d`, `33e655c4`, `640c8e77`; Greptile's reviews of 12
    Nov): each result carries a signed `menu_digest` of what the person chose among (the number of tasks and each
    one's kind, what it could change and its loop); a call whose tasks differ with no allocation from the person asks
    again under guided or balanced. A call with the person's allocation goes on with it under every style, as they may
    have changed the menu themselves. Wording, sources and minutes are not compared.
  - **The person's minutes as given** (`ac677082`): 1.5 stays 1.5; only AskRigor's estimates are rounded.
  - **Bounded replies** (`fc0a6056`, `9ce1ea44`): `list_calls` shows the newest calls that fit 40,000 bytes of the
    result as the app gets it, the tool-list notice included, and pages by time with `later_inputs.callsPage`
    (`before`, applied by the store, so pages reach past the newest 500 and repeat none; a page never ends inside calls
    received in the same millisecond); the all-journals search keeps the first OpenAlex records that fit, with exact
    counts, and a cut small search gives AskRigor's own `next_cursor`, which reads it whole again from the first record
    not shown (`c968cf04`).
  - **Claude's address** (`5863e154`): the Add AskRigor page gives Claude `https://mcp.askrigor.com/mcp/claude`.
  - **Style changes don't overwrite each other** (`a3c9a406`): `set_research_steering` writes only the parts it names,
    in one UPDATE.
  - **After inspect, the tool-list notice follows the result's text** (`c30c80aa`, found by #437's release probe).
  - **Docs** (`fb7ff327`): AGENTS.md and design-decisions carry the owner's release rule of 12 Nov; a design entry for
    the menu reading; What's new, 12 November.

  The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`) and so are the server instructions, so no app needs a refresh. No migration, role script,
  compose, settings or privacy change; only the build line of `runtime.env` changes.
- **Before deploying:**
  - `npm run lessons:status` at 20:20:13 UTC: open 46; needs review 9; accepted but not incorporated 1; incorporated
    or closed 41; deletion eligible 0; lane items unrecorded 0, in open pull requests 0.
  - `npm run verify` at the head `640c8e77`: 6,460 passed, 6 skipped, the typecheck and the build; `npm run test:site`
    (8 pages) and the public-site tests after `fb7ff327`. All required checks passed on `640c8e77` (Deterministic
    verification, workflow-policy; CodeQL and the four analyses). Postgres acceptance passed with six simultaneous
    settings changes all kept, and with the call record's strict page bound. The private-map check found nothing to
    refuse.
  - Greptile: its local review of the branch (5 of 5; two P2s on `list_calls` paging, fixed in `9ce1ea44`); its GitHub
    review of `15e93476` (3 of 5; two P1s, fixed in `c968cf04` and `640c8e77`), whose three threads were resolved after
    the fixes; and its local review of the head `640c8e77` at 20:20 UTC (5 of 5: "All five previous findings are
    addressed. No new actionable issue was confirmed."). Known and left for the next build: on a continued page of a
    small all-journals search, a search that grew past 50 records since its first page still reads as exhausted.
- **Source:** #439 merged at 20:22:37 UTC as `1d877300932e311930422ab50839d140e2d22e46`, whose tree equals the head's
  (`640c8e77`).
- **Image:**
  - source archive SHA-256 `0b27fa6f3eae629d13800fad97ccb8049ff275938a5333874d1551264359b98b`;
  - ID `sha256:c0c164e8c0cd48952148c348e46ada1e857a97e4f04824da362ec88abe1c13db`, user `node`;
  - image archive 122,071,285 bytes, SHA-256 `d70c899b50a1c39496b506bbd4b170a35db9890411d241f3f541b9b4e097a9cc`,
    copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.41 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A, 20:25:18 UTC):** research-mcp on `a826ad10`, healthy; `compose.living-evidence.yaml`
  `196da407`; the role scripts `a40256a6` and `7f361afa`; `runtime.env` 80 names, one of them the OpenAlex key's; the
  promotion timer enabled; the site release `a826ad10`. The owner's maps file copied, the same bytes as before.
- **Stage B (20:44:21 to 20:45:03 UTC):**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-1d877300932e311930422ab50839d140e2d22e46` (the selector,
    `runtime.env`, both compose files and both role scripts), the prior image, `a826ad10`'s
    (`sha256:eeb9fbd5b77309ca…`), tagged `rollback-pre-1d877300932e`, and a `living_evidence` dump of 17,872,765
    bytes, SHA-256 `df4add5a925b2e8b…`;
  - migrate: nothing new to apply; 0018 to 0034 recorded with the release files' hashes;
  - both role scripts re-run with the same bytes; the review role may run exactly its script's 36 functions and the
    access role its 15; the boundaries as before (the reader can't read the held YouTube findings or the call record,
    and reads the 11 Atlas tables);
  - `runtime.env`: 80 names, only the build line changed; the selector names
    `askrigor-research:1d877300932e311930422ab50839d140e2d22e46`; the maps file reinstalled with the same bytes; the
    compose file unchanged;
  - research-mcp recreated at 20:44:54 UTC, healthy, with the reader and maps mounts read-only; the running service has
    the OpenAlex key set (checked without printing it).
- **Stage C (20:45:03 to 20:45:51 UTC):** `/version` names build `1d877300`, HRP 20.6.41; an unauthenticated POST gets
  401; `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal their fixtures in the image;
  the site's pages and the Atlas pages answer as before; the in-image probes pass as for `a826ad10` (a passing final
  check, the full-text, forum-reader and shared-answers probes; the review actions' schema line reads "missing" as
  before); the all-journal search from production found the 1999 Syrian rue oil paper
  (`10.1080/12538078.1999.10515822`) first, and the key appears nowhere in the result; one log line, with no
  credential-like marker.
- **Promotion:** the hardened one-shot service ran once (success, exit 0), the timer was enabled again with its next
  trigger at 20:50:12 UTC, and the selector binds the deployed image.
- **The site after the image (20:48:05 to 20:48:28 UTC), since the privacy notice did not change:** the archive was
  made with the merge's own script in the next-build worktree, whose tree equals the merge's; its tar equals the
  separately built one (`b3b03017ea0718c481d5a1fcfbe594f7a140cd7cd679058142e1364401874b97`); the archive is 325,505
  bytes, SHA-256 `0da6a7c20cfe5160b27f9ca1e276ad58c9551b4935d1eea8e9a40fcd13fbede4`, checked again on the host; the
  installer `c7992a2f`. Installed over release `a826ad10` with the Atlas upstream and the proxy secret read on the
  host; Caddy recreated. All eight pages and `robots.txt` equal the merge's files byte for byte; the privacy page reads
  "Effective November 12, 2026", the terms "Effective November 6, 2026"; the Atlas pages answer as before, with their
  security headers, and `askrigor.com/atlas` equals `mcp.askrigor.com/atlas`.
- **Plugin (20:48:28 UTC):** no packaged file changed since `a826ad10` (0 of 8); the source and the installed copy each
  equal the merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it was not
  reinstalled.
- **Connector probe (Codex's AskRigor app, 20:48:45 to 20:49:54 UTC):** 35 tools; `tool_list_version`
  `0d6016087ee4bc5a`; HRP 20.6.41 (`e1705d3e958ea5d0`), running build `1d877300`; no out-of-date sentence; `inspect`
  ACTIVE, FREE_CONTRIBUTOR, balanced. A menu written in the AI's own names (`researchTarget`, `steeringCouldHelp`, a
  task's `title`, `couldChange`, one number of minutes, and a `focus` key) was not refused: `go_on`, 2 minutes, with
  "AskRigor ignored later_inputs.researchMenu.focus, which is not part of plan_research's menu." A menu with the
  judgment left out: `ask`, with a `menu_digest`, `you_decide_later_inputs` and the line "Only once the person has
  replied "you decide", in a later message, never in this turn:". That call sent back as it was: `go_on`, with the
  recommended allocation. A menu with tasks as strings: refused, `invalid_request`, with `corrected_later_inputs` whose
  first task keeps its text and lists the values for its kind and what it could change. `list_calls` showed 145 calls
  of at least 500 in the last 7 days, said which, and named the call for the next page; the four menu calls read
  `plan_research: go_on`, `ask`, `go_on` and refused.
- **Claude's connector (20:49 to 20:52 UTC):** `get_protocol_manifest` with this app's `tool_list_version`
  (`ad0494d60fd2376b`): HRP 20.6.41, running build `1d877300`, no out-of-date sentence; `inspect` ACTIVE, balanced. A
  menu in the AI's own names (`researchTarget`, a task's `title` and `name`, `couldChange`, one number of minutes):
  read, `ask`, with `you_decide_later_inputs`. The same menu with an allocation of 2 and 1.5 minutes: `go_on`, the
  minutes kept as given (3.5 in all).
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-1d877300932e` (the image of `a826ad10`),
  restore `runtime.env` from the rollback folder (only its build line differs), and recreate research-mcp
  (`infra/living-evidence-production/README.md`); reinstall the `a826ad10` site release, which is still on the host.
  No migration to undo.
- **After the release:** round 3 of the five test prompts in the owner's ChatGPT, on this build (rounds 1 and 2, on
  `a826ad10`: 7 of 8 open first turns asked; the control asked both times; 2 to 5 refused menu calls a run), watching
  for fewer refused menu calls and a kept "you decide" allocation, and rolling back if a run is worse than before. The
  session that released had no browser, so the runs go to the next session.
