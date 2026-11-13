# Production release, 2026-11-12, the third of the day (dev-account declarations, owner answers 294c and 295a)

- **Owner decision:** the owner's answers 294c and 295a, both in chat. 294c, 12 Nov 2026, about 20:10 UTC, in the
  other account's session: "for question 294, you can try on my account first but i'm not clear on what you are trying
  exactly". 295a, 12 Nov 2026, about 23:53 UTC, in the session that released: "yes 295a you didn't need to ask me
  right?". Question 295 named both changes and that they reach dev accounts only. This is not a release under the
  standing permission for pure fixes: 294c changes what a dev account's AI is asked before a short menu is planned.
  The declared answer and the paging description are fixes, and went out on the same answer.
- **Contents:** #440:
  - **A short menu needs the AI's own judgment, on a dev account** (`02c456dc`, owner answer 294c): a menu whose ask
    rests only on the judgment the AI left out (`steering_could_help`) plans nothing; the refusal
    (`invalid_request`) hands the call back as `corrected_later_inputs` with the judgment's place marked
    `<true|false>` and gives the test both ways. Whether the judgment is needed is read from the rule itself: the menu
    asks, the judgment was left out, and the same menu planned with false would go on. Why: in all 10 of the owner's
    ChatGPT runs of 12 Nov on `a826ad10`, and in the 5 of round 3 on `1d877300`, the AI left the judgment out, so the
    default decided every short menu, and the control question (one figure from one named trial) got the menu three
    times instead of an answer.
  - **An allocation is the person's answer only when the AI declares it, on a dev account** (`4e00caa9`, round 3 of
    the owner's ChatGPT runs on `1d877300`, 12 Nov): the menu takes one declared yes or no, `person_answered`. An
    allocation sent with false or without it is not used (`researchMenu.allocation_not_used`): the menu is planned as
    if none had come, and the result says so before anything else, in its text and in `next_step`, as the ask again
    and not as a call to correct. The handed-over "you decide" call carries `"person_answered": "<true|false>"`, and
    the menu's `steering_could_help` when it gave one, so a copy sent as it is asks again. Why: on the orange-peel
    question the AI got the ask and, 54 seconds later in the same turn, sent the handed-over call itself; AskRigor
    said go on, and it researched for 17 minutes without the person. Asked why in that chat: "I treated AskRigor's
    returned you_decide_later_inputs allocation as a usable default. That was an instruction-following error."
  - **`list_calls`' paging description names the field it takes** (`33799455`, Greptile's review of 12 Nov, 23:41
    UTC): `before`, as `calls_page.next_before` gives it, not `offset`. Every account; wording only.
  - **Docs:** design decisions (the 284 entry, the entry on a question ending the turn, the menu-reading entry),
    `docs/research-contributor-access.md`, the privacy data map's menu row (the new yes or no, read in memory only),
    the steering plan's two new sections with their criteria, and the release record of #439 with its index line.

  Every account that is not a dev account is planned as before, in the same words (a test compares the text; 3,245
  outputs without the requirement were byte-identical before and after `4e00caa9`); it still gets the handed-over call
  as on `1d877300`. The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`,
  gemini `9a334c4e7a117921`) and so are the server instructions, so no app needs a refresh. No migration, role script,
  compose, settings, privacy-notice or site change; only the build line of `runtime.env` changes. No file under
  `site/`, `ops/`, `infra/`, the migrations, the plugin package or `protocols/` differs from `1d877300`.
- **Before deploying:**
  - `npm run lessons:status` at 23:56:11 UTC: open 46; needs review 9; accepted but not incorporated 1;
    incorporated or closed 41; deletion eligible 1; lane items unrecorded 0, in open pull requests 0.
  - `npm run verify`: at `02c456dc`, 6,464 passed and 7 skipped (21:06:34 UTC); on `4e00caa9`'s tree before the data
    map's row was edited, 6,474 passed and 6 skipped, the typecheck and the build (23:31:14 UTC). All seven required
    and security checks passed on `4e00caa9` (Deterministic verification 5m28s) and on the head `33799455` (23:48:24
    UTC, Deterministic verification 5m30s). The private-map check found nothing to refuse (3 commits).
  - Greptile: its GitHub review of `02c456dc` at 22:40 UTC (5 of 5, no actionable issue, no thread); its local review
    of `4e00caa9` at 23:41 UTC against the clone's older `main`, so it also read #437 and #439 (4 of 5): nothing on
    this release's two changes, and two P2 notes on older code, the paging description (fixed in `33799455`) and
    repeat-pass directions in the final check that can disagree with each other (`final-check-messages.ts`: the
    guidance says not to check again while notes in the same result can say to, and it still asks for closing
    questions), left for the next build. No review thread was open at the merge.
- **Source:** #440 merged at 23:54:47 UTC as `1e7d662e47b92da174fdc613e729f7ecef1689d9`, whose tree equals
  the head's (`33799455`).
- **Image:**
  - source archive SHA-256 `232a7978c265cd0079ee2fee62eb4cc25495171e79f69c5e28128b7c623a1292`;
  - ID `sha256:50a74a6de948c5b41a3a98d8983e150d61b7d656f66623e642d610aae180bc50`, user `node`;
  - image archive 122,087,343 bytes, SHA-256 `215a92d802aaf5ea2cf3e93c6a672c9a637ea471640a69870fc50ad971c66ded`,
    copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.41 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A, 23:57:25 UTC):** research-mcp on `1d877300`, healthy; `compose.living-evidence.yaml`
  `196da407`; the role scripts `a40256a6` and `7f361afa`; `runtime.env` 80 names, one of them the OpenAlex key's; the
  promotion timer enabled; the site release `1d877300`. The owner's maps file copied, the same bytes as before. No call
  from the owner's account since 23:28 UTC, so the switch cut no research of theirs.
- **Stage B (23:58:10 to 23:58:51 UTC):**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-1e7d662e47b92da174fdc613e729f7ecef1689d9` (the selector,
    `runtime.env`, both compose files and both role scripts), the prior image, `1d877300`'s
    (`sha256:c0c164e8c0cd4895…`), tagged `rollback-pre-1e7d662e47b9`, and a `living_evidence` dump of 17,891,475
    bytes, SHA-256 `6f916ba90094e819…`;
  - migrate: nothing new to apply; 0018 to 0034 recorded with the release files' hashes;
  - both role scripts re-run with the same bytes; the review role may run exactly its script's 36 functions and the
    access role its 15; the boundaries as before (the reader can't read the held YouTube findings or the call record,
    and reads the 11 Atlas tables);
  - `runtime.env`: 80 names, only the build line changed; the selector names
    `askrigor-research:1e7d662e47b92da174fdc613e729f7ecef1689d9`; the maps file reinstalled with the same bytes; the
    compose file unchanged;
  - research-mcp recreated at 23:58:44 UTC, healthy, with the reader and maps mounts read-only; the running service has
    the OpenAlex key set (checked without printing it).
- **Stage C (23:58:51 UTC to 00:00:22 UTC on 13 Nov):** `/version` names build `1e7d662e`, HRP 20.6.41; an
  unauthenticated POST gets 401; `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal
  their fixtures in the image; the site's pages and the Atlas pages answer as before; the in-image probes pass as for
  `1d877300` (a passing final check, the full-text, forum-reader and shared-answers probes; the review actions' schema
  line reads "missing" as before, and the full-text probe's second paper ends as before, with its open routes
  exhausted); the all-journal search from production found the 1999 Syrian rue oil paper
  (`10.1080/12538078.1999.10515822`) first, and the key appears nowhere in the result; one log line, with no
  credential-like marker.
- **Promotion:** the hardened one-shot service ran once (success, exit 0), the timer was enabled again with its next
  trigger at 00:05:04 UTC, and the selector binds the deployed image.
- **The site:** not reinstalled. No file under `site/` or `ops/public-site` differs from `1d877300`
  (`git diff --stat 1d877300..1e7d662e -- site ops infra packages/evidence-repository/migrations` is empty), so the
  `1d877300` site release stays in place; its pages answered 200 in stage C.
- **Plugin (00:01:00 UTC on 13 Nov):** no packaged file changed since `1d877300` (0 of 8); the source and the installed
  copy each equal the merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it
  was not reinstalled.
- **Connector probe (Codex's AskRigor app, a dev account, 00:01:00 to 00:02:23 UTC):** 35 tools; `tool_list_version`
  `0d6016087ee4bc5a`; HRP 20.6.41 (`e1705d3e958ea5d0`), running build `1e7d662e`; no out-of-date sentence; `inspect`
  ACTIVE, FREE_CONTRIBUTOR, balanced. A short menu with the judgment left out: refused, `invalid_request`, with
  `corrected_later_inputs` whose `steering_could_help` is `<true|false>`. The same menu with true: `ask`, with a
  `menu_digest` and `you_decide_later_inputs` carrying `person_answered` `<true|false>` and `steering_could_help` true;
  its `next_step` says the person's allocation goes with `person_answered` true. That call sent back as it was: not
  refused, `ask` again, `allocation_not_used` true, and the stop first in `next_step` and in `problems` ("The
  allocation this call carried was not used: on this account an allocation is the person's answer only with
  person_answered true, which the call did not give, so this menu still waits for them."). The same call with
  `person_answered` true, as a check of the declared value: `go_on`, with the allocation as recommended, and no
  `allocation_not_used`. The first menu with false: `go_on`. The call record read `ask`, `go_on`, `ask`, `go_on`,
  `go_on` for the five answered menu calls.
- **Claude's connector (a dev account, 00:01 to 00:03 UTC):** the same four steps gave the same results: the
  judgment's refusal with its text and `corrected_later_inputs`; `ask` with the placeholder in
  `you_decide_later_inputs`; the copy sent as it was asked again with `allocation_not_used`; and with
  `person_answered` true and minutes 2 and 1.5 it went on with the minutes kept as given (3.5 in all).
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-1e7d662e47b9` (the image of `1d877300`),
  restore `runtime.env` from the rollback folder (only its build line differs), and recreate research-mcp
  (`infra/living-evidence-production/README.md`). No migration and no site release to undo.
- **After the release, the five test prompts again in the owner's ChatGPT (13 Nov, 00:03 to 00:39 UTC; Extra High; card
  saving off for the runs):**
  - **The control (one figure from one named trial):** two menu calls handed back (the shape, then the judgment), the
    third carried `steering_could_help` false, the result said go on, and the turn ended with a checked answer and no
    question (31 of 156 children, 19.9%, by group from the paper's Table 5), 7m 19s, two final checks. Asked why
    false: "The question identified one specific published trial and requested one factual outcome. No preference or
    personal information from the user could materially change the necessary research tasks". The first pass of the
    control on any build.
  - **Orange peel** (which went on by itself in rounds 2 and 3): asked, with a first look and four tasks; no call
    followed the ask. The reply "you decide" went on at the first `plan_research` call, with `person_answered` true;
    the first final check came 9.75 minutes after it (7 minutes allocated, plus 3), a second followed, and the turn
    ended with the checked answer after 13 minutes.
  - **Syrian rue oil:** asked, with five tasks; no call followed the ask.
  - **The PewDiePie question and the SMILES question went on without asking:** the AI gave `steering_could_help`
    false and each turn ended with a checked answer (6m 17s and 9m 34s). By the plan's criteria, written before the
    runs with all four open questions expected to ask, these are two misses. Asked why, on the PewDiePie question: "I
    judged that all three checks were necessary to answer the question and that asking you to choose among them would
    merely delay the research. However, you could have clarified whether the comparison concerned Chinese
    AI-distillation attempts specifically or China's broader AI-development capabilities ... therefore, true would
    have been defensible, and my false judgment was too categorical."
  - **Cost:** one refused call more per first menu on four of the five prompts (the judgment's), none on the fifth,
    where the AI gave it with its first readable menu.

  So the declared answer met its criteria on the one prompt that tests it (no first turn went on with an allocation
  the person did not give; a real "you decide" went on at the first call). The judgment did what the owner asked of it
  for the control, and it also sent two questions straight to an answer that the earlier builds had put to the person
  first. Whether those two should ask is the owner's question 296; nothing was changed or rolled back before their
  answer. Card saving was off from 00:03:02 to 00:41:06 UTC; every final check in that window belongs to a test run.
