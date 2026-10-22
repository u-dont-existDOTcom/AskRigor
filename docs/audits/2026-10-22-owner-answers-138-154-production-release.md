# Production release, 2026-10-22 (owner answers 138b to 154 and AskRigor#354 to #357, HRP 20.6.29 and Universal 20.5.46)

- **Owner decision:** "151 let's wait on the gemini testing / a", typed on the owner questions page at about 23:01 UTC
  on 21 Oct: open the pull request with the bug-report fixes included, and merge and release it once GitHub's checks
  pass, with the same steps as 141 (deploy with rollback, live checks, plugin reinstall, the regression list, this
  record); the Gemini test (146b, 155) waits. At about 00:05 UTC on 22 Oct the owner chose to carry on in this session
  with one Desktop Commander prompt per laptop step ("ok well i guess carry on that way bc i think you need all those
  repos"), since the session's four attached repositories keep the committed allow rule from applying.
- **Contents (#358):**
  - **Contributions and review (138b):** a finished version names the draft it replaces; server-filed analyses join
    their study's record; topic links between canonical topics; related records and a promotion preflight in the
    owner's review; promotion compares times as instants.
  - **Save offer, plain answer, research map (139c, 140b, 143a):** the paid private save offer only when a finding
    rests on work a quick answer can't do; a free answer ends with its card's id; paid private and dev accounts
    register a plain answer before research, and the checked answer ends with a note comparing the two; one yes saves
    the card and files the paid private research map; the account reference.
  - **Scout and Gemini (145a, 146b):** a background scout settles its real cost; the Gemini model and thinking level
    are a server setting; a trial only dev accounts can run.
  - **Leads and other tools (147a, 148a):** a lead's other connected full-text tools; other providers' research text
    is not evidence or answer text.
  - **The final check (AskRigor#354 to #356):** each next step has a kind (`next_step_kinds`); a not-ready result
    gives the line an answer given before a pass ends with (`unchecked_line`); the finalization receipt signs the
    SHA-256 of the checked draft; the carried state keeps the last status and the next check reports it
    (`previous_check`); "as effective as" and "no difference" sentences are absence claims; `binary_results` with the
    NNT or NNH check; `safety_question` required.
  - **The final check (153a to 153c):** `option_classes` for a treatment comparison; an NNT or NNH must be the
    reciprocal rounded up, and a benefit figure needs `harms_quote`; the serious-harm screen also for a medicine
    likely taken for months or years, and `recommendations` covers ranked options.
  - **Lessons:** `related_issue` (AskRigor#357); the detailed lesson report only from accounts that turn on
    `detailed_lesson_reports` (154, migration 0015).
  - **Protocols:** HRP 20.6.29 (lessons #47 and #48 under 152a, 153a, 153b) and Universal 20.5.46 (153c).
- **Source:**
  - #358 passed all seven checks on head `5a415103` (Deterministic verification, workflow-policy, CodeQL and its four
    analyses), its base was main `7562331c`, and it merged at 00:07:37 UTC as
    `71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`; the merge tree equals the PR head tree.
  - Protocols: HRP 20.6.29, SHA-256 `a72aed35746b86b084398cdb92fa1d36dac2d2941b31feea34e242678cf49b79` (615,849 bytes);
    Universal 20.5.46, `e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e` (212,875 bytes).
  - Changed since `7562331c` beyond the server: migrations 0012 to 0015; the review role's provisioning script
    (`EXECUTE` on migration 0012's `inspect_research_contribution_context`); the privacy page (effective October 22,
    2026); the plugin's `skills/askrigor/SKILL.md`; the lockfile (hono 4.13.13, vite 8.3.5). No Custom GPT file changed
    (the action schema and generated bundle are the same; the setup guide gained a paragraph on scout holds).
- **Image (built on the laptop from 00:09:23 UTC):**
  - tag `askrigor-research:71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`; ID
    `sha256:98f2a5715b6603172b3be6099de52c050a69a2a92c08f7327c1f9e8a196faec1`, user `node`, workdir `/app`;
  - source archive SHA-256 `c687f0fe73161840acbe7d1774d9b2f31a42c1e0b7423a9bada8c82e2b6b0f69`; image archive
    123,094,488 bytes, SHA-256 `e4d1b9cbc70ec9cbc389b862a48eda2ff317a9e8d51612fce10bed6148d97803`;
  - no-secret gate on the laptop: `/healthz` ok; `/version` HRP 20.6.29 and Universal 20.5.46 with the hashes above,
    build `unknown` without the build variable; one log line, naming no credential class; the candidate was stopped and
    removed.
- **Prior state (00:16 UTC):** `research-mcp` ran `askrigor-research:7562331c83344df60426b3a0dd65653782ed069d`, up 11
  hours, healthy; SHA-256 prefixes: selector `c4dd5c778207cf50`, `runtime.env` `0380efe5df06c3f4`, `compose.yaml`
  `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`, the review role script `064d916d8e7ed6d7` (the
  reviewed version of `7562331c`, mode 555, root); the promotion timer was enabled, `runtime.env` held 64 names, the
  site served release `03fb5214f9b8ec853f4216ebf7ec68e8a937cadb`, and the disk had 64 GB free. The image archive and
  the release's review role script (`6af79009eee6ee07`) were copied to the host.
- **Production (00:18 UTC):**
  - The host step ran from a file copied to the host, started under `setsid` so that a dropped laptop connection could
    not stop it, with its log on the host; stdin was closed for every `docker compose` call, and it ran to the end.
  - Before any change it confirmed that the release's review role script was the reviewed one (`6af79009eee6ee07`) and
    that the host's copy was the reviewed version of `7562331c`. The archive checksum verified; the loaded image ID
    equals the build ID. The promotion timer was stopped and disabled before the switch.
  - Rollback names: `askrigor-research:rollback-pre-71f09f636aaf` (the prior image, `7562331c`) and
    `/opt/askrigor/rollbacks/pre-71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`, which also holds the prior review role
    script.
  - Schema dump 1,983,699 bytes, SHA-256 prefix `771dbaca414a8331`; the migrate operation reported complete, and the
    database records 0012 to 0015 with the SHA-256 prefixes of the release's files (`63f09d2733d296f3`,
    `7cfe4690175e30cf`, `b8786944b42c9d57`, `dc26f124b7b8310e`).
  - The review role script is a single-file bind mount, so it was rewritten in place; the database container read the
    release's bytes before it ran (1 `DO`, 7 `REVOKE`, 5 `GRANT`, 3 `ALTER ROLE`), and the review role can execute
    `inspect_research_contribution_context` with no direct table grant (`true|0`).
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `6771bc696eff7da0`. Selector prefix
    `954f8d4ff06d1baa`.
  - `askrigor-research-mcp-1` started at 00:18:26 UTC and was healthy, with the same runtime envelope (`node`, read-only
    root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs), mounts and networks, and one log line with no
    credential-like marker.
- **Acceptance (00:21 to 00:24 UTC):**
  - Public `/healthz` reported `ok`; `/version` reported build `71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`, HRP 20.6.29
    and Universal 20.5.46. Protected-resource scopes were `research:use` and `cases:review`; an unauthenticated POST to
    `/mcp/claude` answered 401. Anonymous `/mcp` listed 33 tools; the first tool's description names HRP 20.6.29,
    Universal 20.5.46 and the build.
  - The in-container standard probe: 22 Gemini tools; both manifests returned the new versions; `load_protocol`'s HRP
    index, section `"core"` (one page) and two rules by name were ok; the panel keys, resource and its 337,472-byte
    read-back as before; PubMed returned one record with a receipt; Reddit probes returned `found` and `not_found`; the
    private state directory had mode 700 and both ledger files mode 600; #346's and #350's inputs as before. New for
    #358: `finalize_research` lists `binary_results` and `option_classes` and its result `next_step_kinds`,
    `unchecked_line` and `previous_check`; a call with `absence_claims` missing returned `not_ready` with kinds
    `declaration` and `tool_list` and the line "AskRigor's final check has not passed: some of its statements were not
    checked."; the next call, with its carried state and the declaration, returned `ready_with_limits` with
    `previous_check` `not_ready` (`declaration`, `tool_list`) and a finalization receipt; `submit_lesson_candidate`
    lists `related_issue` and `manage_research_access` names `set_detailed_lesson_reports`.
  - The video read did not complete: Gemini accepted the request (no 402, so the key's new credit works) and ended it
    after 8 seconds without a report (`gemini_video_not_completed`); the video is still public. The default video
    request is the same as `7562331c`'s (model `gemini-3.6-flash`, thinking `medium`; only a dev account's trial arm
    changes either).
  - Full text: the Europe PMC section search completed with a receipt and `full_text_scope` `METHODS`; the owner
    library's three DOI probes returned client code `fetched` (two `FULL_TEXT_READABLE`, one identity mismatch with
    `PRIMARY_OA_ROUTES_EXHAUSTED`), as on 21 October. Production's log stayed at one line.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot: result `success`, exit 0, `complete` with `no_pending_promotion`. The timer was re-enabled
    with the selector naming the new image.
- **The video read, retried once (00:26 UTC):** the same result, `gemini_video_not_completed` after 8 seconds. The key
  works, and its credit is accepted (Gemini answers 402 when prepaid credit is used up, which the server reports as
  `gemini_video_credits_depleted`); Gemini ends this read without a report, a Google-side outcome the server does not
  yet record in detail. This is a finding for the owner and the next build, not a failure of this release's code: the
  request is byte-for-byte the one `7562331c` sent.
- **The scout's ledger (the owner's October figure):** at 00:24:42 UTC October's aggregate AI-budget ledger was set
  from $47.00 (unchanged since 17:10:04 UTC on 21 October) to $18.00 charged, the owner's figure for October's real
  Gemini spend; the prior file is kept as `/opt/askrigor/rollbacks/ai-budget-before-18usd-20261022T002442Z.json`.
- **Site release (the privacy page's 143a and 154 sentences, effective October 22, 2026):**
  - Archive: made with `scripts/create-public-site-archive.sh` in a checkout of the merge on the laptop, which
    validated 4 pages; 26,265 bytes, SHA-256 prefix `19490904b9ef126c`; its uncompressed tar equals the one built
    separately from the merge in the Claude session (`1005691bba51fa68…`).
  - Install: staged in a root-only folder and installed with the merge's `ops/public-site/install-public-site.sh`
    (SHA-256 prefix `faeb5f9f6394473f`, unchanged). Caddy's configuration validated and only Caddy was recreated; it
    is active at `/opt/askrigor/site/releases/71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`. The previous release,
    `03fb5214f9b8ec853f4216ebf7ec68e8a937cadb`, stays for rollback.
  - Live: `/`, `/privacy`, `/terms` and `/support` match the merge byte for byte; `/privacy` reads "Effective October
    22, 2026".
- **Custom GPT:** no Custom GPT file changed between `7562331c` and `71f09f63`, so no editor installation was needed.
- **Plugin:**
  - Before: `0.1.0+codex.20261021130014.hrp.20.6.28.universal.20.5.45`, receipts
    `2b000f00c3503001e91b494eab79c063679b58937bf60ff51bbf4535bb180fc3`. Rollback copy
    `/home/joel/plugins/askrigor.rollback-20261022T002638Z`.
  - One packaged file changed (`skills/askrigor/SKILL.md`); the release's packaged files went in and the plugin was
    reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261022002638.hrp.20.6.29.universal.20.5.46`; source and installed receipts both
    `bb57f4ce5b9bededae3a699850b878a300a5b13b53a8af96101f2f780bd21bfe`, over 8 files, each equal to the release
    commit's apart from the manifest version.
- **Product interface (00:32 UTC):** through Codex, the ChatGPT app listed 33 AskRigor tools and both manifests
  returned HRP 20.6.29 and Universal 20.5.46 (`a72aed35746b86b0`, `e313306b09da7e35`), but its tool list predates the
  release: `finalize_research` lists `recommendations`, `comparison_claims`, `user_observations`, `proposed_tests`,
  `carried_state`, `harm_screen` and `safety_question`, and not `binary_results` or `option_classes`. The refresh is the
  owner's action in ChatGPT's app settings, and the regressions wait for it.
- **Lessons:** #47 and #48 (owner answer 152a, live in HRP 20.6.29) were labelled accepted and incorporated at 00:35
  UTC. `npm run lessons:status` last ran at 22:59 UTC on 21 Oct (31 open, 11 needing review, 0 accepted but not
  incorporated, 25 incorporated or closed, every lane item recorded); it runs again with the regressions.
- **Product acceptance (owner regressions):** waiting for the owner's ChatGPT app refresh. The run is set up in
  `/home/joel/askrigor-releases/20261022/regress`: the 50 cases of 21 October and the 15 new rows of the regression
  list (the OCD reports #354 to #356 and lessons #47 and #48), 65 cases, with the clean start of 144a and the preamble
  the list now asks for (the findings card goes to the final check; no notes about the test).
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-71f09f636aaf` (build `7562331c`), and check its
     health.
  4. Re-enable the timer against the restored image.
  5. Migrations 0012 to 0015 and the review role's grant stay: the previous version ignores them. The prior review
     role script is in the same rollback folder.
  6. For the site, point `/opt/askrigor/site/current` back at release `03fb5214f9b8ec853f4216ebf7ec68e8a937cadb`, which
     stays on the host, and recreate Caddy as the installer does.
  7. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261022T002638Z` and run `codex plugin add
     askrigor@personal`.
