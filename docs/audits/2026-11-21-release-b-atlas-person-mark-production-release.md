# Production release, 2026-11-21 (release b: the write-ups switched off, both Atlas parts, the How to research page)

- **Owner decision:** typed in the main session's chat (second Claude account) on 21 Nov 2026 at
  17:55:03 UTC: "the things that are waiting on me i don't understand, whta happened or why did they disappear from
  inbox without your acting on them? i answered them in inbox but failed to put my ansewrs into chat? if so then sure,
  366b 365: push. 348a." The Inbox record: 348a chosen on 18 Nov at 13:29 UTC (typed in chat at 23:27 UTC in the first
  account's session); 366b on 19 Nov at 20:36 UTC; 365's 1a and 2a on 19 Nov at 20:38 UTC.
  - 348a: "release it switched off, after stage 1": the write-ups' public pages, off.
  - 366b: "release both, mark on, health, sex-life and crime claims kept off until a lawyer reads the sentence".
  - 365: "365: push" for a citation coincidence in the page that the private-map check flagged
    (`site/how-to-research/index.html:91`, 2 places, nothing else; pushed with `--no-verify`); 1a, the page as drafted;
    2a, the name lookups for the payments count, which is not built yet (P23): nothing released for 2a.
  - The main session's decisions during the integration: the terms dated the release day (commit 64767179); P21
    (show-at-once) stays off, the owner asked separately; #494's base left as #493's branch.
- **Contents:** PR #506, merged at 18:35:52 UTC as `c87ab9be6b4fa53474b8f9784d4e08103d7b967f` (parents `277c5a99`,
  #502's merge, the live build since 16:24 UTC, and `64767179`, the checked head; the merge's tree equals the head's); 68
  commits and 94 files against `277c5a99`. It merges:
  - #487 (8b206085), research write-ups on the Atlas's public pages, **switched off**: migration
    `0040_research_dossier_publications` and both role scripts; no `ASKRIGOR_PUBLIC_DOSSIERS` line; both notice
    allowlists empty.
  - #493 (48f251d9), Atlas Release A: migration `0041_atlas_show_saved_findings` records how each finding reached the
    pages; `show_on_pages` and `publish_cards` need `later_inputs.shown_by`; show-at-once off.
  - #494 (f521befb), Atlas Release B: migration `0042_atlas_person_readings`; the "Unverified claim of …" mark on claims
    about named people that no source AskRigor could open supports, with claims of a crime or fraud, or about someone's
    health or sex life, left out (`ATLAS_PERSON_SENSITIVE_GROUP = "leave_out"`); disputes, the owner's notices, the
    reading (Opus 5.5 at low effort, USD 1 a day, USD 5 the first day); the privacy section "People named in the Atlas"
    and the terms section "Claims about people in the Atlas".
  - The How to research page with the owner's cautions (365 1a; 1,892 words, 35 sources, as drafted), its menu item
    on every page and its Caddy route.
  - The integration's own commits: three test fixes (139e29e5: two order checks, and a Release B test that dated a
    dispute by the real clock and failed from 20 Nov on #494's own head), #487's function lists in the contributor-access
    acceptance (fd97ebad; it stopped on #487's own head too), the terms "Effective November 21, 2026" (64767179).
  - Unchanged: the tool lists (35 tools; mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`),
    compose, init-reader.sh, the Dockerfile, the lockfile, protocols (HRP 20.6.43), the plugin's packaged files.
- **Must fix before the write-ups are switched on** (Codex's integration review, 18:24 UTC, verdict "merge"; neither
  acts while `ASKRIGOR_PUBLIC_DOSSIERS` is unset): a write-up's related-topic link reads a topic's raw label, not Release
  B's filtered one (`apps/research-mcp/src/atlas/pages-http.ts`, `cardTopicLabel`); an accepted write-up on a topic page
  cancels Release B's noindex for a claim about a named person (`apps/research-mcp/src/atlas/pages.ts`, topic pages:
  keep `personKeptOutOfSearch` an independent OR). The main session makes them a promise ahead of P26's question.
- **Before deploying:** GitHub's seven checks passed at `64767179` (the full verification 7m30s, 18:34:54 UTC; at
  `fd97ebad` before it, 5m22s). Locally: `tsc -b` after each merge; the 132 test files the merge touches; the site
  checks; the PostgreSQL acceptances (contributor-access verify 124 checks, Gemini's sign-in, the write-ups' 30 checks).
  The private-map check by hand over what each push added. Codex's read-only integration review: "merge" (its two P2s
  above). The kit's local-db-check.sh (18:38 to 18:40 UTC, throwaway PostgreSQL 17.6): `LOCAL_DB_CHECK_OK`.
- **Source and image:** source archive SHA-256 `86583da47d4bc72e6edbca6f551e8e7509a2aabb8932bac40601a67e3e613bbd`; image
  `sha256:69a52e0dcb5504fa3802d9a763c7e5001663acd885c2fd54412729a9abef1692`, its archive SHA-256
  `fceed8945ec7c2f374f6748c24a48290fef5301a943cb08528d90fa74b906a27` (123,581,968 bytes). On the image, with no network
  and no setting: CANDIDATE_OK, LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK
  (12 routes: the conflict of interest shown only with its mark, the health, crime and fraud claims nowhere),
  SERVICE_READS_OK.
- **Prior state (stage A, 18:45:18 UTC):** research-mcp on `277c5a99`, healthy (image `sha256:3ccbdfb2…`); compose
  `15d3cc3a`; the role scripts #501's (review `41b02dbf`, access `97cee2aa`); runtime.env 98 names with the dossier,
  ledger and #501's four lines, and no public dossier, show-at-once or person line; the planner's key file and workspace
  lines as the reading's would be; the site #501's release (98ec69b9); the promotion timer on. PRECONDITIONS_OK.
- **Waiting for quiet (18:46 to 19:11 UTC):** the host was busy from 18:44 with two clients of the deep-dives session
  (a Codex research run on `/mcp` and a Claude helper on `/mcp/claude`, up to 50 calls in 5 minutes); the main session
  had them pause. wait-quiet.sh read 320 quiet seconds at 19:11:06; run-bc.sh's own read 327 seconds at 19:11:12. The
  signed-out Atlas before the switch: every page 200 (ATLAS_SIGNED_OUT_READ).
- **Stage B (19:11:16 to 19:12:20 UTC):** checks first (the role scripts on the host #501's; the dossier, ledger and
  #501's four lines kept; no public dossier, show-at-once or person line; the planner's key file and workspace lines;
  compose and mounts; the image archive OK; the prior image 277c5a99's, healthy; 104 setting names); the rollback tag
  `askrigor-research:rollback-pre-c87ab9be6b4f` = 277c5a99's image `3ccbdfb2963e`; the image loaded =
  `sha256:69a52e0d…`; READER_OK; the rollback folder `/opt/askrigor/rollbacks/pre-c87ab9be…` with a dump of 18,521,455
  bytes (sha256 `36bd40ef6b0d9c2b`), its selector and runtime.env naming 277c5a99 with #501's four lines and none of this
  release's; the promotion timer stopped; migrate (receipt complete): 0018 to 0043 recorded with the release files'
  hashes, 0040 `d6521ff8c24635e0`, 0041 `60f960b96729916b`, 0042 `0b2fa29938e90ad8`; the review role script (70 GRANT)
  and the access role script (30 GRANT); the review role runs exactly its script's 68 functions, the access role 21;
  the boundaries, the 0038 index, the private dossiers (5|0|0|6|0|O), Gemini's table (1|5|0|false|false), news
  (3|0|4|4|0|…), **0040 4|4|0|0|0|30|0|both triggers on, 0041 4|3|3|0, 0042 7|0|3|0|20|0**; runtime.env's build line
  only (98 names); the selector; **the switch: research-mcp on M from 19:12:12 UTC, healthy**; the same 104 setting
  names and mounts as before; the service reads the kept lines as before, public dossiers off with no notice covering
  them, the mark off, show-at-once off; none of this release's names seen. STAGE_B_DONE.
- **Stage C (19:12:20 to 19:14:13 UTC):** `/version` names M with HRP 20.6.43; 35 tools, equal to the frozen fixture; the
  8 site pages still 277c5a99's; `/how-to-research` 404 before the site release (expected); Gemini's five paths 200 and
  the user count page and image 200; the three compiled tool lists equal their fixtures (mcp `0d6016087ee4bc5a`, claude
  `ad0494d60fd2376b`, gemini `9a334c4e7a117921`); READER_OK; the OpenAlex search complete; LEDGER_OFF_OK and
  PUBLIC_DOSSIERS_OFF_OK in a container of the new image; the promotion run (inactive before, result success, exit 0,
  "complete" and "no_pending_promotion"), its timer enabled and active with its next run at 19:15:13; PROMOTION_OK,
  STAGE_C_DONE, BC_DONE 19:14:13.
- **Stage D (19:16:11 to 19:16:58 UTC):** before any change: M serving, healthy; the database as stage B left it
  (3|8|0); the planner's key file and workspace lines; "preflight: review configured true; with the four lines: mark on,
  cap USD 1, show at once false, reading configured true, model claude-opus-5-5, effort low". runtime.env kept as
  `runtime.env.before-stage-d`; **the mark on from 2026-11-21T19:16:33Z**; runtime.env 102 names (98 before) with
  `ASKRIGOR_ATLAS_PERSON_MARK`, `…_READING_KEY_FILE` (the planner's), `…_READING_WORKSPACE_ID` (the planner's) and
  `…_READING_DAILY_CAP_USD=1`; research-mcp recreated at 19:16:35 UTC, healthy (no automatic undo); the service sees the
  four names and the same 104 others; it reads the mark on since 19:16:33.000Z, cap USD 1, show-at-once off, the
  reading configured; no log line saying a reading setting is wrong; the planted claim in the live container:
  PERSON_MARK_PROBE_OK (12 routes, the conflict of interest only with its mark, the health, crime and fraud claims
  nowhere, noindex); the owner's notices readable (exit 0, 0 open then); the public checks again (35 tools, equal).
  STAGE_D_DONE, D_DONE 19:16:58.
- **Site (19:17:04 to 19:17:47 UTC, then 19:18:29 to 19:19:08):** the archive (tar SHA-256
  `eec5686d95e01953a1dac68d3e7903b55a474b9fde86d184fb14e3bc64f954a1`) with M's installer, Caddy's configuration valid,
  **release `c87ab9be…` activated at about 19:17:20 UTC** (before: 98ec69b9's, #501's), the installer's own route check
  passed (with `/how-to-research`). All 9 pages equal M's files; privacy and terms "Effective November 21, 2026"; the
  privacy section "People named in the Atlas" with 366b's sentence and the terms' "Claims about people in the Atlas";
  the home page's user count image; the Atlas through the apex as before. **The first run ended SITE_NOT_DONE on a
  fault in the kit's check, not the site:** the menu-item count piped `curl` into `grep -q` under `pipefail`, so a
  page whose match came early made `curl` fail writing (exit 23) and went uncounted ("4 of 9"). The check now reads
  each page whole first; on the main session's word the script ran again: the install was skipped (the site already
  served M), and every check passed with the menu item on 9 of 9. SITE_DONE 19:19:08.
- **Acceptance (19:19:11 to 19:19:43 UTC):** `/version` names M; `/mcp` 35 tools, equal to the fixture; GEMINI_PUBLIC_OK and
  USER_COUNT_OK (#501's features); the signed-out Atlas with the mark on: every page 200, 12 finding pages read (5 under
  the not-yet-checked banner, P-1194 with one mark and its "It might be false.", every one noindex), the dispute form
  200 (ATLAS_SIGNED_OUT_OK); `/atlas/dossiers/D-1001` 404 (the write-ups off); `/how-to-research` 200; on the host, as the
  migrator, read-only: no public copy, no notice covering public dossiers, the grants on 0040's and 0042's relations and
  on the 53 functions of 0040 to 0042 as the role scripts give them (ACCEPTANCE_DB_OK). ACCEPTANCE_OK.
- **After:** the readers' read (19:20:32): the planner, reviewer, dossiers' privacy reading, findings ledger (dev), user
  count, Gemini's sign-in and news as before; `ASKRIGOR_PUBLIC_DOSSIERS` and `ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS` not set;
  the mark on since 19:16:33Z, cap 1, the planner's key file and workspace. The plugin receipt (19:20:37): packaged files
  changed since the live build 0; the source and installed copies equal the merge's (PLUGIN_RECEIPT_DONE). The rollback
  read (19:20:41): the tag equals 277c5a99's image `3ccbdfb2…`; the kept selector and runtime.env name 277c5a99 with the
  dossier, ledger and #501's lines and none of this release's; `runtime.env.before-stage-d` names M without the mark's
  lines; the live runtime.env holds the mark's four and otherwise equals the kept one.
- **The reading's first minutes (refusals, the owner's 19 Nov request to hear of every guardrail block):** by 19:21:16
  UTC the reading had made 94 calls (USD 0.37 spent, USD 0.10 reserved, under the first day's USD 5) and stored 90
  readings, with no removal. Anthropic's model refused to read two findings with the category `bio`: **P-1212**, refused
  three times and parked at 19:18:40, so it is now off the pages (its page answers 404), as the design hides a parked
  old finding until the owner looks; and **P-1171**, refused (still shown under the banner at 19:20, and parked too if
  it is refused three times). Each refusal and the parking made a notice for the owner (five open at 19:20:10: four
  refusals and one parked, kind and finding only). They reach his Inbox once a routine carries P22's notice step.
  **By 19:23:50 UTC three findings were parked after three `bio` refusals each and are off the pages (404): P-1098,
  P-1171 and P-1212.**
- **Rollback:** never migrate or run a role script; 0040 to 0042 stay (277c5a99 runs on them; its migrate would only put
  back 0021's and 0024's two functions). To stop the reading's spending only: `ASKRIGOR_ATLAS_PERSON_READING_DAILY_CAP_USD=0`
  and recreate research-mcp. To 277c5a99's image: withdraw first what `person-claims-admin.js rollback-list` prints,
  take the routines' new lines out, then the README's steps (tag `askrigor-research:rollback-pre-c87ab9be6b4f`, the kept
  selector and runtime.env, `site-rollback.sh` for the site).
- **P22's routines:** the main session's (`routine-notice-step.md`). The first account's two (06:40 bug-report checker,
  09:20 quick-answer test) wait until a session in that account after 24 Nov 14:00 UTC; meanwhile the 09:20 routine's
  show calls are refused and change nothing, and the notices are not brought to the Inbox by a routine. The 08:35
  routine (second account): not changed by the release helper, whose session has no RemoteTrigger tool; the main session applies section 2 of `routine-notice-step.md` (`show_on_pages` with `later_inputs.shown_by` "quick_answer_test" and `later_inputs.quick_answer_verdict`) and updates owner-pages' `askrigor/atlas-quick-answer-task.md`.
- **Not yet done:** the must-fix items above before the write-ups go on (P26); P21 (show-at-once), asked of the owner;
  the lawyer's reading of the privacy sentence (366b); the first account's routines.

