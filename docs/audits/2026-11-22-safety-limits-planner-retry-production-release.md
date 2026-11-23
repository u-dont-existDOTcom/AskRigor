# Production release, 2026-11-22 (release C: HRP 20.6.44 and the safety limits; the planning call's search retry)

- **Owner decision:** "400a 401a", typed in the main session's chat on 22 Nov 2026 at 00:28 UTC.
  - 400a: add the safety-limits sentence to HRP (HRP 20.6.44) and release #507 with `ASKRIGOR_SAFETY_LIMITS=on`.
  - 401a: release #505, the planning call's search retry (no setting).
- **Contents:** two merges, in this order (the release helper merged both, as the main session arranged, each a merge
  commit at its checked head with GitHub's seven checks green and main read right before):
  - **#507**, merged at 00:59:56 UTC as `228a4c7b42a61584ff0dd81fd8465e24f496d1b5` (parents `c87ab9be`, release b's
    merge, live since 21 Nov 19:12 UTC, and `d91e8e8d`, the checked head). HRP 20.6.44 (2026-11-22, SHA-256
    `a486702b879aba2ce729482eabd5474f4ef0afa7e7b7c3efe57751e8103485ee`): LimitsNote carries question 400's sentence
    word for word. With `ASKRIGOR_SAFETY_LIMITS=on`, `finalize_research` reads `later_inputs.safety_limits`, the research
    steps a model's or app's own safety rules limited as the AI or the person reports them, and lists each as a limit
    in AskRigor's fixed words ("As the AI reports, …"), one line above the panel's fold; the answer's sentence is looked
    up; nothing blocks, nothing is stored, no link is accepted, no "none" is asked for. `inspect` gives the AI the
    declaration's shape with the switch on. Whatever the setting, the planning call and the review log
    `fallback_answered`/`fallback_refused` when Anthropic's fallback model served them. Universal unchanged (20.5.46).
    The first full verification at `d91e8e8d` failed one test, `tests/findings-ledger.test.ts` "verifies its own token
    and refuses an altered one", a flaky test #507 doesn't touch (it "alters" the third-from-last character to "A"
    unless the token ends in "A", so a token whose character there is already "A" is not altered; about 1 run in 64);
    the rerun passed.
  - **#505**, merged at 01:10:17 UTC as `fb46799394badeb3064428d945b97990366bbf43` (parents `228a4c7b` and `70127727`, its
    head with main merged in by the planning session, taking `da816cac`'s tested resolution of the planner, and #507's
    newer privacy row). When a plan ran no web search, the planning call asks once more (only with 20 seconds or more
    left of its timeout and room in the day's cap); the plan that searched is used, else the first stands. No setting:
    production has no `ASKRIGOR_RESEARCH_PLANNER_TIMEOUT_SECONDS` line, so the timeout is the code's 45 seconds (read
    at 00:43:38 UTC, and again in stages A and B).
  - Unchanged against `c87ab9be`: migrations, role scripts (release b's), compose, init-reader.sh, the Dockerfile, the
    lockfile, the site and ops/public-site, the tool lists (35 tools; mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`,
    gemini `9a334c4e7a117921`), the plugin's packaged files (none names an HRP version). The runbook gains the
    setting's paragraph.
- **Before deploying:** GitHub's seven checks passed at `d91e8e8d` (#507, after the rerun) and at `70127727` (#505).
  #507: Codex's reviews and rechecks as its pull request says, and its HRP change reviewed by Codex in the guardrail
  session; #505: Codex's review ("fix first", fixed in 4f4470d9) and recheck ("ship"); the trial merge of both tested by
  the planning session (typecheck, 147 planner and reviewer tests, 489 of #507's tests).
- **Source and image:** source archive SHA-256 `ed7c0ccfddd087f4075388966397c6095f5233d30aaa6d6c54886a5ec2a61097`; image `sha256:972017d05364590812fd99628474fc3ade9c32a18b1eeb59bb2976e7de05219e`
  (archive 123,605,055 bytes). On the image, no network, no setting: CANDIDATE_OK (HRP 20.6.44 in /version),
  LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK, SAFETY_LIMITS_PROBE_OK (off absent,
  on with "on", off with another value; HRP 20.6.44 in the protocol package), SAFETY_LIMITS_LIVE_OK (with the line and
  a made-up signing secret in that container only: a declared limit listed in AskRigor's words, the note for a quote
  the answer lacks, no note without the input), SERVICE_READS_OK.
- **Prior state (stage A, 01:12:52 UTC):** research-mcp on `c87ab9be`, healthy (image `sha256:69a52e0d…`); the role scripts
  release b's; runtime.env 102 names with the dossier, ledger, #501's four and release b's mark lines (on since
  2026-11-21T19:16:33Z); no `ASKRIGOR_SAFETY_LIMITS`, show-at-once or public dossier line; no planner timeout line; the
  site release b's; the promotion timer on. PRECONDITIONS_OK.
- **Waiting for quiet (01:13 to 01:32 UTC):** the traditional-systems session's two test chats in the owner's ChatGPT
  (`/mcp`, up to 98 calls in 5 minutes); 362 quiet seconds at 01:32:34.
- **Stage B (01:32:39 to 01:33:30 UTC):** checks first (release b's role scripts on the host, the dossier, ledger, #501's
  four and release b's mark lines kept, no safety limits, show-at-once or public dossier line, no planner timeout line);
  the rollback tag `askrigor-research:rollback-pre-fb46799394ba` = c87ab9be's image `69a52e0dcb55`; the image loaded =
  `sha256:972017d0…`; READER_OK; the rollback folder with a dump; the timer stopped; migrate (nothing new); both role
  scripts re-run (the same bytes); the database checks as release b's; runtime.env's build line only; **the switch:
  research-mcp on M from 01:33:21 UTC, healthy**; the same setting names and mounts; the kept lines read as before,
  safety limits off. STAGE_B_DONE.
- **Stage C (to 01:34:51 UTC):** `/version` names M with HRP 20.6.44; 35 tools equal to the frozen fixture; the 9 site
  pages equal M's (no site change); the three compiled tool lists equal; LEDGER_OFF_OK and PUBLIC_DOSSIERS_OFF_OK in a
  container of the new image; PROMOTION_OK; STAGE_C_DONE, BC_DONE.
- **Stage D (01:35:10 to 01:35:41 UTC):** the preflight ("safety limits now false; with ASKRIGOR_SAFETY_LIMITS=on: true;
  HRP 20.6.44 a486702b879aba2c"); runtime.env kept as `runtime.env.before-stage-d`; **`ASKRIGOR_SAFETY_LIMITS=on` written**
  (103 names, 102 before); research-mcp recreated at 01:35:26 UTC, healthy (no automatic undo); the service sees the
  name and reads it on with the other lines as before; in the live container, an in-process `finalize_research` call
  with no account (nothing saved) listed a declared limit in AskRigor's words, noted a quote the answer lacks and said
  nothing without the input: SAFETY_LIMITS_LIVE_OK. STAGE_D_DONE, D_DONE.
- **No site release:** release C changes no site file.
- **Acceptance (01:35:45 to 01:36:08 UTC):** `/version` names M with HRP 20.6.44 (2026-11-22, `a486702b…`); from outside,
  `get_protocol_manifest` gives HRP 20.6.44 and Universal 20.5.46, both naming M, neither saying the tools are out of
  date (MANIFESTS_OK); 35 tools equal to the fixture; GEMINI_PUBLIC_OK, USER_COUNT_OK, ATLAS_SIGNED_OUT_OK (the mark
  still on), the write-ups' route 404, `/how-to-research` 200. ACCEPTANCE_OK.
- **After:** the readers' read (01:36:17): `ASKRIGOR_SAFETY_LIMITS` on; the mark on since 2026-11-21T19:16:33Z; public
  dossiers and show-at-once not set; the planner timeout not set (45 seconds); no search-retry or fallback line yet.
  The plugin receipt (01:36:20): packaged files changed since c87ab9be 0; the source and installed copies equal the
  merge's (PLUGIN_RECEIPT_DONE); no reinstall needed. The rollback read (01:36:26): the tag equals c87ab9be's image; the
  kept selector and runtime.env name c87ab9be with release b's mark lines and no safety limits line. The read-only
  connector probe through the installed app (Codex): 35 tools; HRP 20.6.44 `a486702b879aba2c` and Universal 20.5.46,
  both running M; no out-of-date sentence.
- **Not checked here:** #507's kit check 4 (`inspect` on an active account giving the declaration's shape) needs an
  account; a real `fallback_answered` line appears only when Anthropic's fallback really serves a call.
- **Rollback:** the switch only: `ASKRIGOR_SAFETY_LIMITS` off (or removed) and research-mcp recreated
  (`stage-d-undo-host.sh M` puts `runtime.env.before-stage-d` back); nothing was stored. To c87ab9be's image (HRP
  20.6.43): stop and disable the promotion timer, restore `living-evidence-image.env` and `runtime.env` from
  `/opt/askrigor/rollbacks/pre-fb46799394ba…`, recreate research-mcp with `askrigor-research:rollback-pre-fb46799394ba`,
  check health and /version, enable the timer. Never migrate or re-run a role script for it (none changed).

