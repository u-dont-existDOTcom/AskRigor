# Production release, 2026-11-22 (release D: the planning menu keeps what the person asked for and the plan is shown; HRP 20.6.45's traditional-systems rule)

- **Owner decision:** "402a 403 1b 2a 404a", typed in the main session's chat (second Claude account) on 22 Nov 2026
  at 13:08:01 UTC. The owner questions page records both as decided in chat at 13:08 UTC (402a also in his Inbox at
  12:15 UTC).
  - 404a ("Release both together"): #508 (a task the person's own words asked for is never dropped from the menu) and
    #509 (the plan shown with each step's minutes and a steer line).
  - 402a ("Add it as written, and release it with the next release once the checks pass"): #510 (HRP 20.6.45 with the
    traditional-systems rule).
  - 403 (1b 2a, the Atlas Traditions tab) is not in this release. No other setting, no paid API, nothing public beyond
    what the three pull requests change.
- **Contents:** three merges, in this order (the release helper merged each as a merge commit at its checked head, with
  GitHub's seven checks green and main read right before each merge; no conflict arose, so no resolution review):
  - **#508**, merged at 13:12:59 UTC as `faa1b0c48a954b50fcfaec473996f5eb544a412f` (parents `fb467993`, release C's
    merge, live since 01:33 UTC, and `4bc8cf44`, the checked head; tree equal to it). The planning menu never drops a
    task the person's own words asked for (`person_asked`): such a task is only ever added, a requested prerequisite
    is listed first (the owner's inositol deep dive of 21 Nov, where his words asked for the reviews count and the
    comparison supplements' trials).
  - **#509**, merged at 13:20:57 UTC as `caf79d57bd776aa0df1687828ea70dfc16ce3c8c` (parents `faa1b0c4` and `d5160310`,
    the reviewed head `8c4510ce` with main merged in by GitHub's update-branch; tree equal to `8c4510ce`'s). When a first
    menu goes on, the plan block shows the reading and the nearest reading left out, each task's rough minutes, the
    total with the check and the answer, and a steer line by why it went on; in ChatGPT the reading opens the answer and
    a "What I did / Not done / To change direction" ending closes it. In apps that show words as they work, a first
    line says the plan is being built ("about a minute" with AskRigor's own planning call, "a few minutes" otherwise);
    when it waits, the first line says why. `person_steered` (runtime, inside `researchMenu`, the person's words in
    `person_reason`) lets a changed menu or a re-plan continue on balanced and autonomous; guided still asks.
    `menu_outline` at registration whenever no plan is handed over, so the first `plan_research` is not refused.
    Planner rubric 2026-11-22.1 (the forms a person could have in hand, sold or made at home).
  - **#510**, merged at 13:26:56 UTC as **M = `2975ed0d01b6e45ebd1e5bcd4871752ca27d56b9`** (parents `caf79d57` and
    `f22a7033`, the reviewed head `a6cf2028` with main merged in by GitHub's update-branch; tree equal to `a6cf2028`'s).
    HRP 20.6.45 (2026-11-22, SHA-256 `475ee5aad42fdc0bba03f786eefa4e19bc17cd9b95f4ddd7e4aef3a600c54039`): the new module
    `TraditionalSystemAccount` after `EthnobotanicalSpecificity`, and the always-loaded `traditional_ethnobotanical`
    layer ends "; load TraditionalSystemAccount."; `TRADITIONAL_SYSTEM_AT_THE_SCREEN` in the first-search guidance
    (reaches every chat, including one that loads no protocol); the planning call's step 3 sentence, rubric
    2026-11-22.2. Text exactly as the owner approved. Universal unchanged (20.5.46, `e313306b09da7e35`).
  - Unchanged against `fb467993` (read-only git, and checked again by the build and the render): migrations (0001 to
    0043), both role scripts (release b's), compose, every file under `infra/`, the Dockerfile, the lockfile, the site
    and ops/public-site, the tool lists (35 tools; mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
    `9a334c4e7a117921`), the plugin's packaged files (none names an HRP version). The 57 changed files are all under
    `tests/`, `docs/`, `apps/*/src/`, `protocols/HRP_Full.xml`, `README.md` and
    `scripts/instruction-layering-profile.json`. No setting, so no stage D.
- **Before deploying:** GitHub's seven checks passed at `4bc8cf44` (#508), `d5160310` (#509; Deterministic verification
  6m57s) and `f22a7033` (#510; 5m16s). #508: implemented by Codex from a written brief, red-teamed and rechecked three
  times read-only; #509: design red-teamed by Fable, built by Codex, reviewed by Fable over three rounds (ship), full
  suite 7,500 passed; #510: rule brainstormed and red-teamed (Claude, then Codex in two rounds) before the owner's
  answer, implemented by Codex, checked byte for byte against the approved text, Codex's read-only review fixed and
  rechecked, typecheck and build passed, 7,506 tests passed. The private-map check over the whole stack (10 commits,
  40 maps): nothing to refuse.
- **Source and image:** source archive SHA-256 `7e8effa425d02fcc94ebbccb861b75f3d9d087794921c969d1e9fb812f05f40f`;
  image `sha256:01079f2709940e237a16fa2233e9077a4809e05047cadf71dff8f3ffa8bca3b0` (archive 123,622,377 bytes, SHA-256
  `56dae21d6b79f0e6966f830a0cec5cb2368441cb43af54d3838e3c3daf784058`). The build refused unless the first-parent chain
  from M back to `fb467993` was exactly #510's, #509's and #508's merges, each at its checked head (also GitHub's
  `refs/pull/N/head`) with its tree. On the image, no network, no setting: CANDIDATE_OK (HRP 20.6.45 and its SHA-256 in
  /version); RELEASE_D_PROBE_OK (the HRP file and the protocol package's manifest 20.6.45 `475ee5aa…`, the module named
  6 times and the always-loaded pointer present, Universal 20.5.46, rubric 2026-11-22.2, the 463-character first-search
  sentence, `person_asked`, `person_steered` and `menu_outline` in the built code); the earlier releases' probes as
  regression checks: LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK,
  SAFETY_LIMITS_PROBE_OK, SAFETY_LIMITS_LIVE_OK, SERVICE_READS_OK.
- **Prior state (stage A, 13:30:13 UTC):** research-mcp on `fb467993`, healthy (image `sha256:972017d0…`); the role
  scripts release b's; runtime.env 103 names with the dossier, ledger, #501's four and release b's mark lines (on since
  2026-11-21T19:16:33Z) and release C's `ASKRIGOR_SAFETY_LIMITS=on`; no show-at-once or public dossier line; no planner
  timeout line; the site release b's; the promotion timer on. PRECONDITIONS_OK.
- **Waiting for quiet (13:30 to 14:00 UTC):** research runs in ChatGPT on `/mcp` (up to 28 calls in 5 minutes) and lesson
  submissions from Claude; 313 quiet seconds at 13:59, and 317 at 14:00:43 in run-bc.sh's own reading.
- **Stage B (14:00:47 to 14:01:42 UTC):** checks first (release b's role scripts on the host; the dossier, ledger, #501's
  four, release b's mark lines and release C's safety limits line kept; no show-at-once or public dossier line; no
  planner timeout line); the rollback tag `askrigor-research:rollback-pre-2975ed0d01b6` = fb467993's image
  `972017d05364`; the image loaded = `sha256:01079f27…`; READER_OK; the rollback folder with a dump (18,895,850 bytes,
  SHA-256 `d1e154931e00754f…`); the timer stopped; migrate (nothing new); both role scripts re-run (the same bytes; 68
  and 21 functions); the database checks as before; runtime.env's build line only; **the switch: research-mcp on M from
  14:01:33 UTC, healthy**; the same 109 setting names and mounts; the kept lines read as before, safety limits on.
  STAGE_B_DONE.
- **Stage C (to 14:03:18 UTC):** `/version` names M with HRP 20.6.45; 35 tools equal to the frozen fixture; the three
  compiled tool lists equal; the 9 site pages equal M's (no site change); RELEASE_D_PROBE_OK in the live container;
  LEDGER_OFF_OK and PUBLIC_DOSSIERS_OFF_OK in a container of the new image; PROMOTION_OK (the timer enabled and active,
  next run 14:05:02 UTC); STAGE_C_DONE, BC_DONE.
- **No stage D and no site release:** release D adds no setting and changes no site file.
- **Acceptance (14:03:37 to 14:03:59 UTC):** `/version` names M with HRP 20.6.45 (2026-11-22, `475ee5aa…`); from outside,
  `get_protocol_manifest` gives HRP 20.6.45 `475ee5aad42fdc0b` and Universal 20.5.46 `e313306b09da7e35`, both naming M,
  neither saying the tools are out of date (MANIFESTS_OK); 35 tools equal to the fixture; GEMINI_PUBLIC_OK,
  USER_COUNT_OK, ATLAS_SIGNED_OUT_OK (the mark still on), the write-ups' route 404, `/how-to-research` 200.
  ACCEPTANCE_OK.
- **After:** the readers' read (14:04:03): M healthy; `ASKRIGOR_SAFETY_LIMITS` on; the mark on since
  2026-11-21T19:16:33Z; public dossiers and show-at-once not set; the planner on, its timeout not set (45 seconds); no
  search-retry or fallback line yet; 2 log lines, none naming a failure class. The plugin receipt (14:04): packaged
  files changed since fb467993 0; the source and installed copies (8 files each, receipt `23afe4908e5a8425…`) equal the
  merge's (PLUGIN_RECEIPT_DONE); no reinstall needed. The rollback read (14:04:30): the tag equals fb467993's image; the
  kept selector and runtime.env name fb467993, and the kept runtime.env equals the live one but for the build line.
  The read-only connector probe through the installed app (Codex, 14:04 to 14:05): 35 tools; HRP 20.6.45
  `475ee5aad42fdc0b` and Universal 20.5.46 `e313306b09da7e35`, both running M; no out-of-date sentence.
- **Main after M:** another session merged #511 ("Gemini sign-in: Allow works in a real browser", P72) at 13:46:56 UTC
  as `fabf1ea2`, during the quiet wait and after the build had checked main = M. It is not in this release:
  production serves M.
- **Not checked here:** what the new steering does in real chats (the plan block, the steer line, `person_steered`
  continuing a changed menu), and whether the systems rule changes the two baseline answers: the post-release tests in
  the owner's ChatGPT and Claude belong to other sessions. The roadmap's "What's new" line for this record is for the
  session that files it in `docs/audits/`.
- **Rollback:** to fb467993's image (HRP 20.6.44): stop and disable the promotion timer, restore
  `living-evidence-image.env` and `runtime.env` from `/opt/askrigor/rollbacks/pre-2975ed0d01b6e45ebd1e5bcd4871752ca27d56b9`,
  recreate research-mcp with `askrigor-research:rollback-pre-2975ed0d01b6`, check health and /version, enable the
  timer. Never migrate or re-run a role script for it (none changed); no setting to undo; nothing stored to remove.
