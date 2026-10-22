# Production release, 2026-10-20 (lessons #32 to #37, carried state, HRP 20.6.27 and Universal 20.5.44)

- **Owner decision:** "124a", typed in the Claude session on 20 Oct (with "125a"): merge #346 and release it, step by
  step as question 124 listed (build, deploy with rollback, live checks, plugin reinstall, the owner's ChatGPT app
  refresh, regressions, this record, lessons #32 to #37 incorporated). #346 builds the owner's answers to questions
  109 to 113, 117, 120 to 123.
- **Contents (#346):**
  - HRP 20.6.27 (revision date 2026-10-18): core rules `UserObservationLedger`, `MeasurementIsNotAttribution`,
    `ProportionateAdviceOnOwnUse` and `ConditionsThatDecideTheChoice`, final checks FS236 to FS239, the full-text
    route-failure wording (113), and the 11 rules question 123 moved word for word into core sections (the core is
    38,208 bytes, one page). Universal 20.5.44: after sending a bug report, say what the lesson tool returned; the
    short-answer paragraph (121).
  - `finalize_research`: `user_observations`, `proposed_tests` and `corrections[].report` declarations; on ChatGPT's
    surface AskRigor validates the hidden parts itself and answers `not_ready` with every problem and an example;
    the carried state (`carry_forward` / `carried_state`, a signed token, never stored); two spaced
    `full_text_route_failure` receipts let a study stand as a lead; a second reader, built but off; the panel's empty
    network policy also under `openai/widgetCSP`; the l26 to l30 and q79 follow-ups from the 17 Oct regressions.
- **Source:**
  - #346 passed all seven checks on head `1e7e8fe3` (Deterministic verification, workflow-policy, CodeQL and its four
    analyses), contained main `86d628a2`, and merged at 15:56:05 UTC as
    `034da344931291c009681cd6322932dc68603b17`; the merge tree equals the PR head tree.
  - Protocols: HRP 20.6.27, SHA-256 `e6db59c14c78f3d53b04b8d36ce514eecfcaaec1cf7f9d176d7b8ad665b2e2fe`; Universal
    20.5.44, `946fac7e5e6ce5cb08811d4c533371e3032e1ce46f5c217990dc326808b55135`.
  - Unchanged since `141c229f`: migrations, deploy and infrastructure files, dependencies and Custom GPT files. In the
    plugin package only `skills/askrigor/SKILL.md` changed, so the package was reinstalled.
- **Image:**
  - tag `askrigor-research:034da344931291c009681cd6322932dc68603b17`; ID
    `sha256:9358436feb12eca8b022a1fa2f73bb72280e05d9b1ea49e25a1d16257ddb7a2e`, user `node`, workdir `/app`;
  - source archive SHA-256 `3cd429dcb0f67f0bc77daa535164dacb45866ee0831058ba1d2f68896f98db96`; image archive
    109,718,480 bytes, SHA-256 `35c8e9572edcf1c7eed1efe5ccfb415987c711a218045f822f62b7b4df1897ec`;
  - no-secret gate on the laptop: `/healthz` ok; `/version` HRP 20.6.27 and Universal 20.5.44, build `unknown` without
    the build variable; one log line, naming no credential class; the candidate was stopped and removed.
- **Prior state (18:16 UTC):** `research-mcp` ran `askrigor-research:141c229f787081585e8a9de65ec61a7a285c4727`, up 2
  days, healthy; SHA-256 prefixes: selector `62e987cc0c73735e`, `runtime.env` `f9eee631dad647fe`, `compose.yaml`
  `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`; the promotion timer was enabled, and
  `runtime.env` held 64 names.
- **Production (18:20 to 18:21 UTC):**
  - The host step ran from a file copied to the host (`ssh -n host bash /root/stage-b-host.sh`), stdin closed for
    every `docker compose` call; it ran to the end.
  - The archive checksum verified; the loaded image ID equals the build ID. The promotion timer was stopped and
    disabled before the switch.
  - Rollback names: `askrigor-research:rollback-pre-034da3449312` (the prior image, `141c229f`) and
    `/opt/askrigor/rollbacks/pre-034da344931291c009681cd6322932dc68603b17`.
  - Schema dump 1,227,938 bytes, SHA-256 prefix `136979e3ad8d1d04`; the migrate operation reported complete.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `621771eeefa01783`. Selector prefix
    `97a5eca513c4daf0`.
  - `askrigor-research-mcp-1` started at 18:21:02 UTC and was healthy, with the same runtime envelope (`node`,
    read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs), mounts and networks, and one log line with
    no credential-like marker.
- **Acceptance (18:21 to 18:22 UTC):**
  - Public `/healthz` reported `ok`; `/version` reported build `034da344931291c009681cd6322932dc68603b17`, HRP 20.6.27
    and Universal 20.5.44. Protected-resource scopes were `research:use` and `cases:review`; an unauthenticated POST to
    `/mcp/claude` answered 401. Anonymous `/mcp` listed 33 tools; the first tool's description names HRP 20.6.27,
    Universal 20.5.44 and the build.
  - The in-container standard probe: 33 unique standard tools and 22 Gemini tools; both manifests returned the new
    versions; `load_protocol`'s HRP index, section `"core"` (one page) and two rules by name were ok; the panel keys,
    resource and its 337,472-byte read-back (one script, the CSP, `prefersBorder`) as before; the Gemini catalog's
    `finalize_research` has no panel key. PubMed returned one record with a receipt; the video read completed (2
    calls, 48 seconds, 21 claims); Reddit probes returned `found` and `not_found`; the private state directory had mode
    700 and both ledger files mode 600. New for #346: `finalize_research` lists `user_observations`, `proposed_tests`
    and `carried_state`; the panel resource declares `ui.csp` `{"connectDomains":[],"resourceDomains":[]}` and
    `openai/widgetCSP` `{"connect_domains":[],"resource_domains":[]}`; the second reader is not configured.
  - Full text: the Europe PMC section search completed with a receipt and `full_text_scope` `METHODS`; the owner
    library's three DOI probes returned client code `fetched` (two `FULL_TEXT_READABLE`, one identity mismatch with
    `PRIMARY_OA_ROUTES_EXHAUSTED`). Production's log stayed at one line.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot: result `success`, exit 0, `complete` with `no_pending_promotion`. The timer was re-enabled
    with the selector naming the new image, next due 18:25:09 UTC.
- **Product interface:** before the owner's refresh (18:23 UTC), the ChatGPT app Codex reaches listed 33 tools from
  build `141c229f` (HRP 20.6.26, Universal 20.5.43) and its `finalize_research` lacked `user_observations`,
  `proposed_tests` and `carried_state`, while its manifest calls already returned HRP 20.6.27 and Universal 20.5.44.
  The owner refreshed the app at about 22:37 UTC ("refreshed"); at 22:39 Codex still had the old list, and at 22:53
  it showed 33 AskRigor tools, the first tool's description began "Versions when this tool list was loaded: HRP
  20.6.27, Universal 20.5.44, build 034da344931291c009681cd6322932dc68603b17", both manifests returned those versions
  (`e6db59c14c78f3d5`, `946fac7e5e6ce5cb`), and `finalize_research` was listed with `recommendations`,
  `comparison_claims`, `user_observations`, `proposed_tests` and `carried_state`.
- **Custom GPT:** no Custom GPT file changed between `141c229f` and `034da344`, so no editor installation was needed.
- **Plugin:**
  - Before: `0.1.0+codex.20261017001225.hrp.20.6.26.universal.20.5.43`, receipts
    `1eedfc3d6ac00412b7ef185c3e8be665ff76a934a9d5b524aff43faa6ff74beb`. Rollback copy
    `/home/joel/plugins/askrigor.rollback-20261020T182257Z`.
  - Reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261020182257.hrp.20.6.27.universal.20.5.44`; source and installed receipts both
    `6b12866eaaf25d0d82cd09761e37cbaef231a71bf0020695dbbe5dd1afa17763`, over 8 files, each equal to the release
    commit's apart from the manifest version (2 listing lines changed: `skills/askrigor/SKILL.md`).
- **Lessons:** `npm run lessons:status` at the release checkpoint: 27 open, 7 needing review (#38 to #44), 6 accepted
  but not incorporated (#32 to #37, which this release builds in), 21 incorporated or closed, 0 deletion eligible.
  Later the same day (22:2x UTC): 29 open, 9 needing review (#38 to #46), 6 accepted but not incorporated, 19
  incorporated or closed, 0 deletion eligible; every UDA lane item recorded, including the 21 found in open UDA pull
  requests (owner questions 128 to 137).
- **Product acceptance (owner regressions, 22:53 to 01:18 UTC):**
  - **Setup:** after the owner's refresh and the probe above, the regression list (`docs/owner-regressions.md` at
    034da344: 30 cases) and two baselines added on 20 Oct (i44 and i45, for questions 128 and 133 to 135) ran through
    Codex with the refreshed app, 22:53:39 to 01:18:01 UTC: 32 cases in 39 runs (#336 in four turns; l32, l33, the
    question 120 sleep case and r326 in two), three at a time, about 60 AskRigor calls per case (1,790 in all; 18 runs
    used 58 or more). Every run exited 0 and none called another app's or server's tool. The Claude session judged
    each criterion by meaning, with its evidence and quotes (a judgment of meaning; no word list decides it).
  - **Loaded:** every answer named HRP 20.6.27 and Universal 20.5.44, and every protocol call returned those versions.
  - **Executed:** of the 30 regression cases, 13 met every criterion (l23, l29, l30, l32, l33, l34, l35, l37, q79, q82,
    the question 120 net case, r324, r326) and 17 met them in part; none failed. Of the 21 cases also run on 17 Oct, 7
    passed and 14 in part (17 Oct: 5 and 16): l23, l30 and r326 gained a pass, and r330 lost one (six attempts to get
    its paper's full text failed, so the acid test and its route went unreported). l27 met every criterion but its
    delivered answer dropped the check line. #336: no hard fail; the paired-stimulus test came unasked in the first
    reply; five of six criteria met and one in part, as on 17 Oct. Baselines, expected to miss since this version lacks
    their rules: i44 never names severe allergic reactions or searches for them (question 128's build adds that), and
    i45 does not say whether more searching would change its conclusion (134 in part), while it already puts the
    unmeasured age-10 outcome up front (135).
  - **Finalized:** the final check passed in 29 of 32 cases (not l31, r325, r329) and in every turn of #336; among the
    17 Oct cases in 18 of 21 (17 Oct: 12 of 21). 36 of 39 runs ended `ready_with_limits`. Every passing answer carries
    every caveat its check required, and all but l27 the check line. The connector's schema validation rejected 1 of
    157 final-check calls (r332's second: `proposed_tests[0].repeats: true` where an integer is expected) and no first
    call (17 Oct: 16 of 96, and the first call in 11 of 22 runs).
  - **Test harness:**
    - The bug-report wording worked: l29, l37 and #336's turns 3 and 4 asked the question, sent nothing, and passed.
    - The preamble's "do not call save_research_findings" led r325 to withhold the findings card its check requires,
      which held its check for that alone; runs also cited the "made-up question" framing to set aside flagged
      sentences (`reader_dismissed`, l24, l25, l28).
    - **Not a clean start.** The runs loaded the owner's personal Codex instructions (`~/.codex/AGENTS.md`, changed 19
      Oct): 38 of 39 runs fetched files from the owner's development repository (24 by shell commands), and 9 ran a
      script downloaded from that repository's main branch on the laptop. The next runs work in an empty folder and
      are told not to run shell commands or follow development instructions; switching the file off for test runs is
      owner question 144.
  - **Findings for the next build:**
    1. The YouTube scout returned `gemini_scout_budget_exhausted` from the first run on (26 calls) and never completed:
       a background scout is charged its full $1 hold and never settles its real cost, so the $50 month allows about
       50 scouts (owner question 145). Runs fell back to `survey_youtube_community`.
    2. Schema rejections now come from other tools (38): the scout 20, `check_retraction_status` 6,
       `acquire_open_full_text` 5, the audit validators 4, three others once each.
    3. The check still passes with a needed declaration empty or incomplete (l25, l28, r325, r330, r331, r328).
    4. Sources without a DOI and failed downloads still decide outcomes (r329 `not_ready`; r330, r331, r332).
    5. l31 again ran out of calls with discovery unsaturated; protocol loading still takes most calls in the cases
       without research (l37 53 of 57, l25 44 of 48, l29 43 of 46, q79 43 of 57).
    6. Answer defects: l27 dropped its check line; l29 and r330 cite the installed skill by a local file path; caveat
       templates make broken sentences ("would take About", "reviews reviews", a claimed tissue equal to the measured
       one).
    7. Question 120's sleep reply asks nothing about the room; #336's turn 2 offered a general pain question as the
       documented example, and the 2022 review (PMID 36545350) was not consulted; l36 has no safety note.
  - **Saves:** in free contributor mode, 27 runs' final checks saved findings cards for the owner's review (ARF-0049 to
    ARF-0075); no answer gives its card's ID. The check also reported 72 analyses sent to the review inbox across 17
    runs; that count covers the account's analyses "in this chat or another", which explains saves reported by runs
    without research of their own (l28, l29, the question 120 sleep turn 1) and 17 Oct's saves "without a validated
    source". The full judgment, case by case, is `docs/audits/2026-10-20-owner-regressions-judgment.md`.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-034da344931291c009681cd6322932dc68603b17`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-034da3449312` (build `141c229f`), and check its
     health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261020T182257Z` and run `codex plugin add
     askrigor@personal`.

  No migration or site change needs reversal. Rollback was not executed.
