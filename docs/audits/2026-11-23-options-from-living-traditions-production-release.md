# Production release, 2026-11-23 (release F: HRP 20.6.46, traditional options in open "what can I do" research; the release records of 21 and 22 Nov)


- **Owner decision:** owner answer 410b, typed in chat on 22 Nov 2026 at 19:26:44 UTC: release #515 (HRP 20.6.46,
  `OptionsFromLivingTraditions`); #504 (the release records of releases b, C, D, E and E2 and their roadmap lines) goes
  with it. Nothing else: not #516, #513 or #503. No setting changes; the Gemini sign-in step log
  (`ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled`, on since release E2) stays on as it is. run-f.sh started at 18:10:11 UTC on
  the go the coordinator relayed after the owner's ChatGPT "before" test (its last call in the call record: 17:50:00 UTC).
- **What changed for people:** when someone asks an open question about what they can do for a health problem or goal,
  the AI is told to also search the relevant living traditions (usually two or three, chosen by documented use for that
  problem, the person's stated tradition or access, and different kinds of practice), take each option from the
  tradition's own sources, and check it like any candidate (evidence, the person's safety, safest first, no
  prescription), keeping each option's real evidence and safety state and stating the search's limits; never for an
  emergency, a look-up, a request confined to one named treatment, or against an explicit source limit. The treatment
  options checklist lists traditional, regional or folk options as a class and loads for every treatment question, not
  only video research. The first-search guidance and the planning call (rubric 2026-11-22.3) carry it too. The roadmap
  page shows the release lines of 21 and 22 November. Nothing else: the same 35 tools (no app refresh), Universal
  20.5.46, no database, setting or plugin change.
- **Contents:** three merges since release E2 (`9c117aa7`, live since 22 Nov 17:03:40 UTC), each a merge commit at its
  checked head with GitHub's seven checks green and main read right before:
  - **#512**, merged at 17:23:25 UTC on 23 Nov by another session as `ae45c39b6d28c509105226e226ca0b0bf39da316` (head
    `52880a53`): the owner lifted the tool-list freeze of answer 189a (AGENTS.md, docs, tests, the tool-list script's
    message, comment lines only under apps/); nothing served changes.
  - **#515**, merged at 17:50:03 UTC as `2a5a7e6187da170882a082e9d342a4142fff5422` (head `21298b32`: the reviewed
    `80d03343` with main merged in by GitHub's update-branch at 17:42:55 UTC; tree equal to it; Deterministic verification
    17:43:06 to 17:49:20). HRP 20.6.46 (2026-11-22, SHA-256
    `d7dd99297c422faa381ef4ecb0db1a95ed0ad27ed52a1f574fc458c47dab6e65`, 669,049 bytes): `TraditionalSystemAccount`'s
    index line names open options questions, and its new rule `OptionsFromLivingTraditions`; the options checklist's
    traditional class; the landscape gate's index line reworded (option b) so the checklist loads for every treatment
    question; stress cases and a revision entry. `OPEN_HEALTH_OPTIONS_AT_THE_SCREEN` (390 characters) in the screen text
    and at the end of every branch of the structured next step, after the 402a sentence; the planning call's step-3
    sentence, rubric 2026-11-22.3; the report vocabulary's HRP pin. Text exactly as the owner approved (all six pieces
    exact). The always-loaded core unchanged (39,983 bytes).
  - **#504**, merged at 17:58:00 UTC as **M = `6b4722f1ac0cff1316f9c3d6999e5f2dfff4d109`** (head `2386966b`: `51b4d07d`
    with main merged in at 17:50:22 UTC; tree equal to it; Deterministic verification 17:50:33 to 17:57:06): seven
    release records, docs/INDEX.md, the roadmap page's sections for 21 and 22 November 2026, its test.
  - Unchanged against `9c117aa7` (read-only git, the build, the render and the site archives): migrations, postgres.ts,
    infra/ (compose `15d3cc3a`, both role scripts release b's), ops/, Universal, the plugin's packaged files, the tool-list
    fixtures (35 tools; mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`), every package
    file, Dockerfile and compose file, .nvmrc. protocols/ changes HRP_Full.xml only; site/ the roadmap page only; 64
    files in all.
- **Before deploying:** the private-map check over #515's commit and #504's five (40 maps from 2 files, 17:42:46 UTC):
  nothing to refuse. #515: rule brainstormed and red-teamed (Claude, then Codex in two rounds), built by Codex from a
  written brief, Codex's read-only review "ship". On #504's earlier head `51b4d07d` one test failed by chance at 17:36:14
  (`tests/findings-ledger.test.ts`, "verifies its own token and refuses an altered one": its alteration leaves the token
  unchanged about once in 64 runs, the token depending on the clock); the updated head passed. On a `git archive` tree of
  M with its own npm ci and tsc -b (18:00:12 to 18:02:04 UTC): packages/protocol's manifest built from M's protocols, HRP
  20.6.46 of 2026-11-22 with SHA-256 `d7dd9929...`, the SHA-256 of M's file in git; release F's probe on that build;
  the approved text, all six pieces exact; `npm run typecheck`; 61 test files at --maxWorkers=2 (the 38 this release
  changes, #515's list and the release-record tests): 906 passed; `npm run test:site` (9 pages) and `npm run
  test:site-deploy` (30 passed).
- **Source and image:** source archive SHA-256 `5ac0885eec1341a71ad8debdc2ab93016b1e421337c830e33b408bd8a81ed4c7`
  (11,406,822 bytes); image `sha256:db44f0c38bfd56a01c243ff33ea89d5d62fb205a50a458080d86a4d98d837f0f` (archive
  123,629,148 bytes, SHA-256 `9da14547e190477b6bc11595a02f82a53b9916a0eec74017fe77decf6e9e5250`), built 17:58:17 to
  17:59:40 UTC. The build refused unless the first-parent chain from M back to `9c117aa7` was exactly #504's, #515's and
  #512's merges, each at its checked head (also GitHub's `refs/pull/N/head`) with its tree and passed checks. On the
  image, no network, no setting: CANDIDATE_OK (/version HRP 20.6.46 2026-11-22 `d7dd9929...`); RELEASE_F_PROBE_OK (the
  HRP file and the protocol package's manifest, the rule and both reworded places, the first-screen sentence in the
  screen text and all four next-step branches, rubric 2026-11-22.3 and its sentence, the report vocabulary, the three
  tool lists equal to E2's); the earlier releases' probes as regression checks: RELEASE_E_PROBE_OK (the consent POST
  rule, 6 of 6), RELEASE_D_PROBE_OK, LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK,
  SAFETY_LIMITS_PROBE_OK, SAFETY_LIMITS_LIVE_OK, SERVICE_READS_OK. Public-site archive `askrigor-site-6b4722f1ac0c.tar.gz`
  (335,367 bytes, SHA-256 `427c506740ed4663...`, its tar equal to `git archive` of M's site and ops/public-site) and the
  rollback archive of c87ab9be (byte for byte release b's own, SHA-256 `e4e2622b20235e92...`), both with M's own script.
- **Prior state (stage A, 18:04:07 to 18:04:13 UTC):** research-mcp on `9c117aa7`, healthy (started 22 Nov 17:07:35
  UTC); runtime.env and the selector exactly as E2 left them (SHA-256 `79a88f37c72c9f48` and `054024dfa7bf6375`; 104
  names, E2's step log line as written and set in the service); the site release b's `c87ab9be`. The image archive was
  copied (rsync, 18:03:35), its checksum checked and the image loaded on the host with the build's ID. The Gemini sign-in
  step lines were copied into the kit before the switch (the switch discards the container's log): the owner's Gemini
  try of 22 Nov reads 19:25:15 login sent_to_auth0, 19:25:25 login signed_in, 19:25:26 consent shown, 19:25:27 consent
  allowed, 19:25:37 library session_expired.
- **Switch (stage B, 18:15:49 to 18:16:34 UTC, at 348 quiet seconds; the newest call 18:09:52):** rollback tag
  `askrigor-research:rollback-pre-6b4722f1ac0c` = 9c117aa7's image (`e5cddf041189`); the image loaded in stage A, so the
  load was skipped; rollback folder `/opt/askrigor/rollbacks/pre-6b4722f1ac0cff1316f9c3d6999e5f2dfff4d109` with a dump
  (18,981,329 bytes); the promotion timer stopped; migrate complete with nothing new; both role scripts re-run with the
  same bytes; runtime.env's build line only (104 names, SHA-256 `538604961a24082a`; the selector `728ffb25f52b0360`);
  **research-mcp on M from 18:16:25 UTC**, healthy, with the same 110 setting names and mounts, the switches read as
  before (the step log on, safety limits on) and the step log setting present in the service.
- **Stage C (18:16:34 to 18:18:20 UTC):** /version names M with HRP 20.6.46 (`d7dd9929...`); 35 tools equal the fixture;
  the three compiled tool lists equal (mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`);
  8 site pages equal M's and the roadmap page still c87ab9be's; in the live container RELEASE_F_PROBE_OK,
  RELEASE_D_PROBE_OK, RELEASE_E_PROBE_OK and READER_OK; LEDGER_OFF_OK and PUBLIC_DOSSIERS_OFF_OK in a container of the
  new image; the promotion ran once on M (success; journal: atlas_findings queue, 2 complete, 2 no pending promotion) and
  its timer is back on (next run 18:20:02); PROMOTION_OK.
- **First acceptance (18:18:20 to 18:18:56 UTC): ACCEPTANCE_OK.** Through the public address: /version and the
  manifests from outside name M with HRP 20.6.46 `d7dd99297c422faa` and Universal 20.5.46 `e313306b09da7e35`, no
  out-of-date sentence (MANIFESTS_OK); 35 tools equal the fixture; E2's Gemini checks as regression checks
  (GEMINI_PUBLIC_OK: the four metadata addresses and the resource metadata 200 with the issuer; the consent POST with
  Origin null: same-origin 400 session_expired, cross-site 403 invalid_request; /mcp/gemini initializes, 22 tools; a
  made-up token gets 401 naming the resource metadata); USER_COUNT_OK; ATLAS_SIGNED_OUT_OK (12 finding pages, the dispute
  form 200); D-1001 404; /how-to-research 200; 8 pages equal M's and the roadmap c87ab9be's; the host
  (ACCEPTANCE_HOST_OK): M healthy as the selector and the build line name it, 104 names, every kept line as written, the
  step log line on and set in the service, its step lines seen (2 library session_expired, the checks' own).
- **The site (the roadmap page; 18:19:00 to 18:19:36 UTC, at 548 quiet seconds):** the archive checked again against
  `git archive` of M; M's installer (the same bytes as c87ab9be's) installed it as release `6b4722f1...` and recreated
  Caddy (18:19:19 UTC); the 9 pages equal M's files; the roadmap's sections for 22 and 21 November 2026 and its note;
  privacy and terms still effective November 21, 2026; the How to research menu item on 9 pages; the home page's user
  count image; the Atlas through the apex as before; SITE_DONE.
- **Second acceptance (18:19:36 to 18:20:11 UTC): ACCEPTANCE_OK**, everything as in the first, with every page M's
  (the roadmap's two sections and its note present) and the step lines 4 library session_expired.
- **Readers (18:20:15 UTC):** M healthy since 18:16:25; the planner and the reviewer on; the step log enabled; the
  Gemini secret set (not shown), no separate login client; safety limits on; the mark on since 2026-11-21T19:16:33Z;
  public dossiers and show-at-once off; log lines 6, none naming a failure class.
- **Plugin (18:20:18 UTC): PLUGIN_RECEIPT_OK.** The packaged files are unchanged since 9c117aa7; the source copy and the
  installed copy (version label 0.1.0+codex.20261106053949.hrp.20.6.40.universal.20.5.46, 8 files each) equal M's
  packaged files, and M's own scripts/plugin-package-receipt.mjs reads both: package_sha256
  `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`. No reinstall. The connector probe through the
  installed app (to 18:20:48 UTC; Codex, only AskRigor's tools): 35 tools; tool_list_version `0d6016087ee4bc5a`; HRP
  20.6.46 `d7dd99297c422faa` and Universal 20.5.46 `e313306b09da7e35`, both on build M; no out-of-date sentence.
- **The way back (rollback read, 18:20:22 UTC):** the tag `rollback-pre-6b4722f1ac0c` is 9c117aa7's image
  (`sha256:e5cddf04...`); the folder (700 root:root) keeps compose, both role scripts, the dump, and the selector and
  runtime.env naming 9c117aa7 (104 lines, the step log line in it), which equals the live one but for the build line;
  c87ab9be's site folder is kept. To release E2: `site-rollback.sh` (c87ab9be's site archive as `c87ab9be...-r2`: the
  roadmap page back), then `rollback.sh` (the selector and runtime.env from the folder, research-mcp recreated on
  9c117aa7's image). No database change to undo.
- **Next:** the after test of "what can I do for a cold" in the owner's ChatGPT (sent 23 Nov 18:24:32 UTC; the before test ran 17:35:23 to about 17:50 UTC); this
  record and its roadmap line in a pull request; the Gemini step log off after the owner's Gemini test, on his word
  (`bash step-log-off.sh` in the kit: one line out of runtime.env, research-mcp recreated on M; E2's undo refuses now).
- **Kit:** `/home/joel/askrigor-releases/20261123-release-f/` (README-RELEASE.md, RESULT.md, every log).
