# Production release, 2026-10-22 (Atlas phases 1 and 2, notice v3, owner answers 149a to 163a, HRP 20.6.31)

- **Owner decisions:**
  - **162a** (read at 21:42 UTC on 22 Oct, owner questions page): release the build with the new sentences approved word
    for word. The answer also approves merging and deploying that one release pull request once its checks pass.
  - **163a** (read at 22:08 UTC): approves the one-line fix to the living-evidence acceptance's expected migration list,
    which an automated safety check had refused as a possible CI bypass.
- **Contents (#361):**
  - **Atlas phase 1 (159 1b and 7, 160b):**
    - the free contributor notice v3 (`free-contributor-v3-2026-10-22`; migration 0016);
    - the paid save offer's Atlas sentence;
    - the privacy page and the terms, both effective October 22, 2026.
  - **Atlas phase 2:**
    - the owner's accept, edit, reject, withdraw, link and forget actions on `review_research_contribution`, behind
      `ASKRIGOR_ATLAS_REVIEW`;
    - exact checks before anything is written;
    - hash-bound intents written by the promotion runner into migration 0017's append-only tables;
    - public numbers from F-1001;
    - the notice-v3 hold and restore for an image rollback.
  - **Other owner answers:**
    - **156a:** findings cards declare whom they would help;
    - **157a:** free and paid accounts read the study library under the public-copy rule;
    - **149a:** the community-skip question, and HRP 20.6.30;
    - **161a:** HRP 20.6.31, lesson #49.
  - **Fixes:**
    - the #359 checks (an unread or unfinished video reading, the named target, the partial answer, Gemini's lost
      reading);
    - the 22 October regressions' three deadlocks and the refresh hint;
    - the retraction check's `doi`;
    - the lessons status's empty listing.
- **Source:**
  - **#361:**
    - the first CI run on `bc12b16c` failed only at the PostgreSQL living-evidence acceptance
      (`FRONTIER_MIGRATION_CHAIN_MISMATCH`: its expected migration list ended at 0016);
    - `6b61b9cc` added 0017 to that list (163a). Before the push, the failure reproduced on a local PostgreSQL 16.13 and
      every CI database step then passed;
    - #361 passed all seven checks on `6b61b9cc` (Deterministic verification, workflow-policy, CodeQL and its four
      analyses);
    - it merged as `1582f063906e909ce09c01482a347a884164e1ea` onto main `71f09f63`, and the merge tree equals the PR head
      tree.
  - **Protocols:**
    - HRP 20.6.31, SHA-256 `29269d656e73c70b541226023b58b294e583188c721481c043d53f900ee0a8b5` (619,007 bytes);
    - Universal 20.5.46, `e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e` (212,875 bytes), unchanged.
  - **Changed beyond the server:**
    - migrations 0016 (`3a68451a4d386d77`) and 0017 (`c56048a74749681d`);
    - the review role's provisioning script (`86577a5ecbe491b6`), which grants the five Atlas review functions;
    - the notice-v3 hold and restore scripts;
    - the privacy page and the terms.
  - **Unchanged:** no Codex plugin packaged file and no Custom GPT file changed.
- **Database acceptance in Docker (the laptop, PostgreSQL 17.6 image, 22:09:34 to 22:10:02 UTC, on `6b61b9cc`):**
  - `npm run contributor-access:postgres-acceptance` passed: migrate to 0017, and every phase-2 storage, runner, role and
    scenario check, including that:
    - an 0016 database with data upgrades to 0017;
    - the review role executes only its functions.
  - `npm run contributor-access:notice-v3-rollback-acceptance` passed: hold, the earlier image's v2 re-acceptance, and
    restore. A first attempt at 21:52 stopped before any test because the workspace packages had not been built; the
    script now builds them first.
- **Image (built on the laptop from the merge):**
  - tag `askrigor-research:1582f063906e909ce09c01482a347a884164e1ea`;
  - ID `sha256:8219ff629e8ab074403a88375ed029ab43c775051d4d7d8da08782fb91cd9cc9`, user `node`, workdir `/app`;
  - source archive SHA-256 `fef4fec17f01ae9666a42a55e3f150f99b3963860de3f91d56ef9cc07294a13f`;
  - image archive 123,426,753 bytes, SHA-256 `e3d769990729e46fa69db196fd2feea09081ea50256216b09949712e197b33dc`.
- **No-secret gate on the laptop:**
  - `/healthz` ok;
  - `/version` HRP 20.6.31 and Universal 20.5.46 with the hashes above, build `unknown` without the build variable;
  - one log line, naming no credential class;
  - the candidate was stopped and removed.
- **Prior state (22:19 UTC):**
  - `research-mcp` ran `askrigor-research:71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`, up 8 hours, healthy.
  - SHA-256 prefixes: selector `954f8d4ff06d1baa`; `runtime.env` `16d17dddac0c28da` (65 names, with the dev account
    line of 158a); `compose.yaml` `0dca180709940dd6`; `compose.living-evidence.yaml` `5631ff8150eea2a8`; the review
    role script `6af79009eee6ee07` (the reviewed version of `71f09f63`, mode 555, root).
  - The promotion timer was enabled, the site served release `71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`, and the disk
    had 64 GB free.
  - The image archive and the release's review role script (`86577a5ecbe491b6`) were copied to the host.
- **Production (22:21 to 22:22 UTC):**
  - **How it ran:** the host step ran from a file copied to the host (`da402d0b4a0bb6ae` on both sides), started under
    `setsid` with its log on the host; stdin was closed for every `docker compose` call.
  - **Before any change:** the host's review role script was a reviewed version, the archive checksum verified, and the
    loaded image ID equals the build ID. The promotion timer was stopped and disabled before the migration.
  - **Rollback names:** `askrigor-research:rollback-pre-1582f063906e` (the prior image, `71f09f63`) and
    `/opt/askrigor/rollbacks/pre-1582f063906e909ce09c01482a347a884164e1ea`, which also holds the prior review role
    script.
  - **Schema dump:** 2,748,691 bytes, SHA-256 prefix `2aed74142ad0fdc4`.
  - **Migration:** the migrate operation reported `complete`. The database records 0016 and 0017 with the SHA-256
    prefixes of the release's files (`3a68451a4d386d77`, `c56048a74749681d`), and its notice check admits
    `free-contributor-v3-2026-10-22`.
  - **Review role:**
    - the script was rewritten in place, and the database container read the release's bytes before it ran (1 `DO`,
      7 `REVOKE`, 10 `GRANT`, 3 `ALTER ROLE`);
    - the role can execute 0012's context function and the five Atlas review functions, with no direct table grant,
      none of the four writer-only Atlas functions, and no privilege on the F-number sequence (`true|0|5|0|false`).
  - **Settings:** `runtime.env` kept its 65 names (the build line updated; the dev account line kept), new SHA-256 prefix
    `448566504dc20472`. `ASKRIGOR_ATLAS_REVIEW` was not set at this step. Selector prefix `c92de2a35dc362ec`.
  - **Restart:** `askrigor-research-mcp-1` started at 22:22:02 UTC and was healthy.
- **Acceptance (22:23 to 22:25 UTC):**
  - **Public:**
    - `/healthz` reported `ok`; `/version` reported build `1582f063906e909ce09c01482a347a884164e1ea`, HRP 20.6.31 and
      Universal 20.5.46;
    - protected-resource scopes were `research:use` and `cases:review`, and an unauthenticated POST to `/mcp/claude`
      answered 401;
    - anonymous `/mcp` listed 33 tools, and the first tool's description names HRP 20.6.31, Universal 20.5.46 and the
      build;
    - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - **Runtime envelope:** the same as before (`node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256
    PIDs), with the same writable mounts and networks, and one log line with no credential-like marker.
  - **In-container standard probe:**
    - 33 tools and the 22-tool Gemini catalog;
    - both manifests returned the new versions;
    - `load_protocol`'s HRP index, section `"core"` (one page), two rules by name, and the new rule
      `SocialMediaWholeThreadAudit` (161a, 398 bytes) were ok;
    - the panel and its 337,472-byte read-back as before; PubMed returned one record with a receipt; Reddit probes
      returned `found` and `not_found`; the state directory had mode 700 and both ledger files mode 600;
    - #346's, #350's and #358's inputs and outputs as before, including a `not_ready` check and the one after it.
  - **New for #361:**
    - `finalize_research` lists `named_target`, `unwatched_videos` and the findings card's `public_value`;
    - `review_research_contribution` lists `accept_finding`, `edit_finding`, `reject_finding`, `withdraw_finding`,
      `link_findings` and `forget_card`;
    - the image's notice is `free-contributor-v3-2026-10-22`, and its receipt kinds include `youtube_video_unread`
      and `youtube_video_pending`;
    - the Atlas review was still closed at this step.
  - **Not read: a video.** A reading is a paid Gemini call, so it was left out under this task's zero-spend boundary.
    The request is the same as `71f09f63`'s.
  - **Full text:** the Europe PMC section search completed with a receipt and `full_text_scope` `METHODS`; the owner
    library's three DOI probes answered as on 22 October's first release (two `FULL_TEXT_READABLE`, one identity mismatch
    with `PRIMARY_OA_ROUTES_EXHAUSTED`). The log stayed at one line.
  - **Promotion one-shot:** result `success`, exit 0. Both queues reported `complete` with `no_pending_promotion`: the
    contributions and `"queue":"atlas_findings"`. The timer was re-enabled with the selector naming the new image; its
    next trigger was 22:25:03 UTC.
- **The Atlas review, last (22:25 UTC):**
  - `ASKRIGOR_ATLAS_REVIEW=enabled` was added to `runtime.env`: 66 names, the dev account line kept, SHA-256 prefix
    `3bd0ae28b3d6e712`. The prior file is kept as `runtime.env.before-atlas` in the rollback folder.
  - Only `research-mcp` was recreated; it started at 22:25:39 UTC, healthy, and reports the Atlas review open. Its log
    has one line with no credential-like marker.
  - Afterwards, the public checks were the same: build, versions, 401 on `/mcp/claude`, 33 tools.
- **Public site (22:26 UTC):**
  - the merge's own archive script built `askrigor-site-1582f063906e.tar.gz` in a checkout of the merge, and its tar
    equals the separately built one (`038fc1392dfceaac58b3f76e4dc7dd90a6192f73002d576e382751357b32616d`); archive
    SHA-256 prefix `a09233db75c22c1d`, the merge's installer `faeb5f9f6394473f`;
  - it was staged root-only on the host and installed with that installer: `/opt/askrigor/site/current` moved from
    release `71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b` to `1582f063906e909ce09c01482a347a884164e1ea`;
  - `askrigor.com`'s four pages (home, privacy, terms and support) equal the merge's files byte for byte, and the
    privacy page and the terms read "Effective October 22, 2026".
- **Codex plugin (22:27 UTC):**
  - the prior registration, `0.1.0+codex.20261022002638.hrp.20.6.29.universal.20.5.46` with receipt
    `bb57f4ce5b9bededae3a699850b878a300a5b13b53a8af96101f2f780bd21bfe`, is kept as
    `/home/joel/plugins/askrigor.rollback-20261022T222738Z`;
  - reinstalled as `0.1.0+codex.20261022222738.hrp.20.6.31.universal.20.5.46`; the source and installed receipts are
    both `3e83000a1183ebfcf9da510c13445f1df8fb93de9b3e5706662035229ff265cf`, over 8 files
    (`.codex-plugin/plugin.json`, every file under the manifest's `skills/` tree and the packaged assets), each equal to
    the release commit's apart from the manifest version.
- **Product interface:**
  - **ChatGPT's app, through Codex (22:29 UTC):** 33 AskRigor tools, and both manifests returned HRP 20.6.31
    (`29269d656e73c70b`) and Universal 20.5.46 (`e313306b09da7e35`). The app's tool list predates the release: its
    first tool names build `71f09f63` with HRP 20.6.29; `finalize_research` lists `binary_results` and
    `option_classes` but not `named_target`, `unwatched_videos` or the findings card's `public_value`; and
    `review_research_contribution` does not mention `accept_finding` (`connector-probe-before.md`). The refresh is the
    owner's action in ChatGPT's app settings.
  - **Claude's connector, from this Claude session (22:39 UTC):** both manifests returned HRP 20.6.31 and Universal
    20.5.46, with sign-in accepted. The session's tool list also predates the release (its first tool names build
    `71f09f63`).
  - **Notice v3:** both of the owner's accounts were free accounts on notice v2, so each must accept v3 before free
    research. The Claude account's `inspect` reads `UNENROLLED` with notice `free-contributor-v3-2026-10-22`, and its
    manifests report research access `mode_not_chosen` with the step to show the new notice. Question 164 on the owner
    page asks for the acceptance.
  - **The regressions wait for both.** From 22:38 UTC, `probe-then-run.sh` probes the ChatGPT app every 8 minutes, up
    to 15 times. It starts the run only when `finalize_research` lists `named_target` and `unwatched_videos` and the
    account's research access is active.
- **Lessons:** lesson #49 (161a, HRP 20.6.31) was labelled accepted and incorporated at 22:29 UTC. `npm run
  lessons:status` at 22:34 UTC: 32 open, 0 needing review, 0 accepted but not incorporated, 37 incorporated or closed, 0
  eligible for deletion, every lane item recorded (main and open pull requests).
- **Product acceptance (owner regressions): pending.**
  - It runs 79 cases in `/home/joel/askrigor-releases/20261022-361/regress`: the 65 of 22 October's run and 14 new rows
    of the regression list:
    - five from #359 (T1, T1b, T2, T3 and T5);
    - six from #360;
    - three from lesson #49.
  - #359's T4 and T6 are judged wherever their conditions arise; the server tests cover them.
- **Rollback:**
  - **The Atlas review alone:** restore `runtime.env.before-atlas` from the rollback folder (or remove the
    `ASKRIGOR_ATLAS_REVIEW` line) and recreate only `research-mcp`. The owner actions close, and nothing else changes.
  - **The image, below this release,** in the order of `infra/living-evidence-production/README.md`:
    1. Stop and disable `askrigor-research-promotion.timer`.
    2. Run `research-use-notice-v3-hold.sql` as the migrator.
    3. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
       `/opt/askrigor/rollbacks/pre-1582f063906e909ce09c01482a347a884164e1ea`. Recreate only `research-mcp` with
       `askrigor-research:rollback-pre-1582f063906e` (build `71f09f63`), and check its health.
    4. Run the hold once more.
    5. Re-enable the timer against the restored image.
  - **What stays:** no migration is undone. 0016 and 0017 stay, with every Atlas row. The review role keeps its Atlas
    grants, which the earlier image never uses; its prior script is in the same rollback folder.
  - **The site:** point `/opt/askrigor/site/current` back at release `71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`, which
    stays on the host, and recreate Caddy as the installer does.
  - **The plugin:** restore `/home/joel/plugins/askrigor.rollback-20261022T222738Z` and run `codex plugin add
    askrigor@personal`.
