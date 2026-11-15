# Production release, 2026-11-15 (cards from caller-read checks, marked on their findings; the person's go-ahead answers the first menu)

- **Owner decision:** the owner typed "release 473" in chat on 15 Nov 2026 at about 22:46 UTC, in the session that
  released. The changes are the owner's answer 311a (chosen in the Inbox at 15:17:43 UTC and typed "311a" in chat at
  15:47:47 UTC: save findings to the Atlas when the app made the final check's AI readings, for every account, each
  such finding's page saying so) and AskRigor#467, which the owner called a defect in the Inbox at 15:46:07 UTC ("i
  told it to accept all on menu. People should be able to bypass the menu"). Not a pure-fix release: 311a keeps
  research data and changes what people see, and #467 changes what people are asked, so it waited for the owner's
  explicit yes.
- **Contents:** #473, five commits on `main` at `bc9a997f` (the live build):
  - `10af7d2a`: the release record of #469 (docs only).
  - `4b2c6300`: 311a. A call marked `later_inputs.ai_readings` `caller` no longer turns card saving off. The save
    copies the finalization receipt's signed `ar` claim into the card's stamp (`stamp.research.ai_readings`), never
    from the card. Each finding of such a card carries `ai_readings: "caller"` in its Atlas publication and in the
    research an accepted version keeps; the finding's page shows "Who checked it" with the owner's sentence
    "AskRigor's server checked the sources. The app that ran the research made the AI readings."; `inspect_finding`
    names it. Strict schemas take the new optional field.
  - `ea6de9c1`: AskRigor#467. `researchMenu.person_go_ahead` (`all` or `recommended`, with the person's words in
    `person_reason`) answers the research's first menu; the AI judges the words, in any language, and AskRigor checks
    the word and that words came with it. Runtime-only result fields `went_ahead`, `assumed_answer_to` and
    `go_ahead_may_answer`; the generated report vocabulary gains "recommended". The screen's menu shape is unchanged.
  - `b08cf968`: the docs (`docs/final-check.md`, `docs/design-decisions.md`, `docs/privacy-data-map.md`).
  - `56399b99`: what the independent review found (below).

  The tool list is unchanged (35 tools). No migration, role script, compose, privacy-notice or settings change:
  `runtime.env` changes its build line only. The site was not released.
- **Before deploying:**
  - On `56399b99`: `npm run typecheck` passed; the full suite (18:51 to 18:56 UTC) passed 6,863 tests with 7 skipped;
    all seven hosted checks passed (Deterministic verification run 43749120745, 18:51:45 to 18:58:47 UTC;
    workflow-policy; CodeQL and its four analyses). The private-map check on the five commits against 40 maps found
    nothing to refuse.
  - Review: an independent reviewer (a fresh agent given the diff and the stated intent), about 15 minutes. No
    blocker. One should-fix: the go-ahead could answer menus the person never pre-approved (after an allocation not
    used, on a re-plan or a changed menu). Seven minor findings. All were fixed in `56399b99`, each with a test: the
    go-ahead answers the research's first menu only, the ask's go-ahead line shows only there
    (`go_ahead_may_answer`), and a finding's page takes its mark from the research it shows.
  - `npm run lessons:status` at 20:05:40 UTC: open 50; needs review 13; accepted but not incorporated 1;
    incorporated or closed 41; deletion eligible 2; no lane item unrecorded. The issue list read at 20:05 UTC showed
    one issue newer than AskRigor#472, AskRigor#474 (19:49 UTC, already closed).
- **Source:** #473 merged at 22:48:36 UTC as `85e9919a5f1ede4b7b2e912272ae28b1afedcc7a`, whose tree equals the pull
  request head's (`56399b99`); `main` had not moved since #469. Source archive
  `askrigor-85e9919a5f1ede4b7b2e912272ae28b1afedcc7a.tar.gz`, SHA-256
  `96e10ef0ff23441cad2d3c4fc531b6f8d5185ff30e1f52b7f84e57f47ea597f3`.
- **Image:** built from that archive at 22:49:20 to 22:50:23 UTC; id
  `sha256:23209db5417b678fa8d65f65950b5cacff516f344d846421292bf1ddd40dbe53`; the candidate started, answered
  `/healthz` and `/version` and was removed; image archive 122,444,243 bytes, SHA-256
  `0ce17d440b9be9647808c298658a812cce89cfad099fc971e643e08f3e38f834`.
- **Prior state (stage A):** (22:51:40 UTC) research-mcp on `bc9a997f`, healthy (up 9 hours); the promotion timer
  enabled; the compose files and the two role scripts on the host are reviewed versions; `runtime.env` 90 names, the
  planner's six lines, no judge line and no second-reader line; 62 GB free. The quiet read at 22:52:04 UTC: 5,551
  seconds since the newest call (21:19:33 UTC, the owner's runner on `/mcp/claude`), none in the last 15 minutes, so
  stage B started at once.
- **Stage B:** (22:52:15 to 22:53:04 UTC) the role scripts and the compose files on the host equal reviewed versions;
  a dump of 18,085,248 bytes (SHA-256 `94eb1d0903f9d64d`...); migrate complete with nothing new to apply; both role
  scripts run from the release's bytes (the review role's functions exactly its script's 36); the boundaries as at
  #469's release; learn mode's table: the reader cannot read it and PUBLIC cannot read it; it held seven rows and one
  account had learn mode on. The prior image tagged `askrigor-research:rollback-pre-85e9919a5f1e` and the prior files
  kept under `/opt/askrigor/rollbacks/pre-85e9919a5f1ede4b7b2e912272ae28b1afedcc7a` (read back at 22:54:27 UTC: the
  tag is the image of `bc9a997f`, `sha256:f71987cb...`, and the kept `runtime.env`, 90 lines, names that build);
  `runtime.env` 90 names, the build line changed and nothing else; research-mcp recreated and started at
  **22:52:55 UTC**, healthy; the planner, from the service's own settings: enabled, USD 3 a day, 20 new plans a day
  for an account; the review: enabled, USD 3 a day, 20 reviews a day for an account; the planner's state: 15 Nov,
  USD 0.98 spent, one account counted.
- **Stage C:** (22:53:21 to 22:53:55 UTC) `/version` names build `85e9919a`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed, the two lines of 310a as at #469's release. The log differs from #469's in hashes, dates
  and times, the order the writable mounts are listed in, and one figure: the forum reader's thread probe read 96 of
  the thread's 195 comments (124 at #469's release; `state=read` each time).
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again (next run 22:55:05 UTC).
- **The site:** not released. **Plugin:** receipt unchanged (the two installed copies equal the packaged eight files;
  read at 22:54 UTC).
- **Readers after the switch (22:54:23 UTC):** the planner on and the meaning judge not set; the planner's state USD
  0.9829 for 12 plans and the review's USD 1.4788 for 13 reviews, one account; one log line, naming no failure class.
- **Connector probe (Codex's AskRigor app, the owner's account), read-only:** (22:54 UTC) 35 tools, tool list
  version `0d6016087ee4bc5a`, build `85e9919a`, HRP 20.6.41 and Universal 20.5.46 by their manifests, no out-of-date
  sentence. Two manifest calls only, so no paid call.
- **The go-ahead on the live server (this session's Claude connector, the owner's account, a dev account):**
  `get_protocol_manifest` named build `85e9919a` with no out-of-date sentence. At 22:55:05 UTC a plain answer was
  registered for "Does taking magnesium glycinate at night help adults fall asleep faster?" with the words "does
  magnesium glycinate at night help adults fall asleep faster? accept everything on the menu, i don't have time to
  answer questions, just research it all and give me the answer" (one planning call, about USD 0.10). Its
  `next_step` carried the new sentence on the go-ahead. `plan_research` with the planned menu, `person_go_ahead`
  `all` and those words as `person_reason` returned `next` `go_on`, `went_ahead` `all` and `say_reading_first`
  (no question was named), and a `next_step` beginning "AskRigor did not ask first: the person's own words
  (person_reason) told you to go ahead without waiting for a menu. They said to do everything on it, so every open
  task is in the go-ahead." This account's steering style is autonomous, so the test shows the go-ahead's own field
  and wording rather than an ask it skipped (the tests cover the ask). The research was not carried on, and no card
  was saved.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-85e9919a5f1e` (the image of `bc9a997f`),
  restore `runtime.env` from `/opt/askrigor/rollbacks/pre-85e9919a5f1ede4b7b2e912272ae28b1afedcc7a` and recreate
  research-mcp. **Hazard:** the strict schemas of `bc9a997f` cannot read a card stamp, an Atlas publication or an
  accepted version that holds `ai_readings`. At the switch no such row existed (no caller-marked card had been saved
  on any build). After the first one is saved, a rollback needs those rows found and handled first (take the field
  out, or stay on this build).
- **Not in this release:** an "urgent question" setting so AskRigor can still ask a really important question after
  a go-ahead (the owner's Inbox reply of 22:16 UTC, for the next build); the effect-size check the owner asked to fix
  durably (AskRigor#472 and the owner's Inbox reply of 22:28 UTC); the model and thinking level on each finding;
  the video-links build (the owner's 307b), which must merge this release's changes when it is taken up.
