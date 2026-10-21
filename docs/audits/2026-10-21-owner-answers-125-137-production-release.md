# Production release, 2026-10-21 (owner answers 125 to 137 and 128b, HRP 20.6.28 and Universal 20.5.45)

- **Owner decision:** "141a", typed in the Claude session on 20 Oct: merge and release #350 once its checks pass on
  GitHub and that day's regression results for #346 are in, with question 124's steps (build, deploy with rollback, live
  checks, plugin reinstall, the owner's ChatGPT app refresh, regressions, this record). Question 142 (the key-name
  contact screen in #350) was open at the merge with default A; the owner answered "142a" at about 13:00 UTC.
- **Contents (#350):**
  - HRP 20.6.28 and Universal 20.5.45 (revision date 2026-10-20): the owner's book-review item and question 129's
    sentences (Universal core `sources`); 125a (`ForumSignalNonTrigger` and stress case `ProductNameEquivalence`);
    126a (`IndividualAttributionVsPopulationEffect` into the core, the owner's sentence ending `RelevanceBeforeWarning`,
    `EstimandPreservation` into Universal's core); 128b (the serious-harm search in Universal's core, final check
    FS240, stress cases `SeriousHarmBeyondCommonEffects` and `SeriousOrganHarmOralMedicine`); 130a (funding beside the
    result, `StudyReadDepthDisclosure`); 132a (the clause in `EvidenceLayersAreNotAFixedDiscoveryOrder`); 135a (unknown
    harms in the short answer). The HRP core is 38,935 bytes, one page.
  - `finalize_research`: the `harm_screen` declaration (128b: each serious harm screened, with what was found; a harm
    not searched puts "This answer did not check [harm]." in the answer) and `safety_question`; the skipped-search
    sentence for `not_relevant` with `no_real_world_outcome` (125a); S1, S2 and S5 from the 20 Oct lane triage.
  - `submit_research_contribution`: field-level problems with an example for each (127a), and free field names
    screened for contact details like values (142a).
  - The regression list gains the 17 cases of questions 125 to 137 and the book item; `lessons:status` counts lane
    items in open UDA pull requests; 21 ledger rows; the AGENTS.md method-fit sentence (UDA #345).
- **Source:**
  - #350 passed all seven checks on head `0dfd8623` (Deterministic verification, workflow-policy, CodeQL and its four
    analyses), its base was main `034da344`, and it merged at 12:54:16 UTC as
    `7562331c83344df60426b3a0dd65653782ed069d`; the merge tree equals the PR head tree.
  - Protocols: HRP 20.6.28, SHA-256 `a38e3e76b0983f9d4545325a90c6e14b76d087750600ce99623b3ec4aa22cef4`; Universal
    20.5.45, `564c8697fdd4aa69f08b0ecba228ca47cc7dc3e022e6ef55d84ea14f86fb416e`.
  - Unchanged since `034da344`: migrations, deploy and infrastructure files, dependencies, Custom GPT files and the
    plugin's packaged files (`.codex-plugin`, `assets`, `skills`).
- **Image:**
  - tag `askrigor-research:7562331c83344df60426b3a0dd65653782ed069d`; ID
    `sha256:b68554ed453ed168e1ebda7bba1de32f6c02cea38582151cd72e67e871c7cd9a`, user `node`, workdir `/app`;
  - source archive SHA-256 `0104e068564940f224c0fd0e4faee68a02d7ac88c3406d52064d4b183249bd9e`; image archive
    109,778,872 bytes, SHA-256 `0ef5d398100c727317ca987ade986503fa0e2dff55e0c6346cc47b851d10811d`;
  - no-secret gate on the laptop: `/healthz` ok; `/version` HRP 20.6.28 and Universal 20.5.45, build `unknown` without
    the build variable; one log line, naming no credential class; the candidate was stopped and removed.
- **Prior state (12:57 UTC):** `research-mcp` ran `askrigor-research:034da344931291c009681cd6322932dc68603b17`, up 19
  hours, healthy; SHA-256 prefixes: selector `97a5eca513c4daf0`, `runtime.env` `621771eeefa01783`, `compose.yaml`
  `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`; the promotion timer was enabled, and
  `runtime.env` held 64 names.
- **Production (12:58 UTC):**
  - The host step ran from a file copied to the host (`ssh -n host bash /root/stage-b-host.sh`), stdin closed for
    every `docker compose` call; it ran to the end.
  - The archive checksum verified; the loaded image ID equals the build ID. The promotion timer was stopped and
    disabled before the switch.
  - Rollback names: `askrigor-research:rollback-pre-7562331c8334` (the prior image, `034da344`) and
    `/opt/askrigor/rollbacks/pre-7562331c83344df60426b3a0dd65653782ed069d`.
  - Schema dump 1,517,164 bytes, SHA-256 prefix `c2742eb9a1341b37`; the migrate operation reported complete.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `0380efe5df06c3f4`. Selector prefix
    `c4dd5c778207cf50`.
  - `askrigor-research-mcp-1` started at 12:58:11 UTC and was healthy, with the same runtime envelope (`node`,
    read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs), mounts and networks, and one log line with
    no credential-like marker.
- **Acceptance (12:58 to 13:00 UTC):**
  - Public `/healthz` reported `ok`; `/version` reported build `7562331c83344df60426b3a0dd65653782ed069d`, HRP 20.6.28
    and Universal 20.5.45. Protected-resource scopes were `research:use` and `cases:review`; an unauthenticated POST to
    `/mcp/claude` answered 401. Anonymous `/mcp` listed 33 tools; the first tool's description names HRP 20.6.28,
    Universal 20.5.45 and the build.
  - The in-container standard probe: 33 unique standard tools and 22 Gemini tools; both manifests returned the new
    versions; `load_protocol`'s HRP index, section `"core"` (one page) and two rules by name were ok; the panel keys,
    resource and its 337,472-byte read-back (one script, the CSP, `prefersBorder`) as before; the Gemini catalog's
    `finalize_research` has no panel key. PubMed returned one record with a receipt; the video read completed (3
    calls, 61 seconds, 31 claims); Reddit probes returned `found` and `not_found`; the private state directory had mode
    700 and both ledger files mode 600; #346's inputs and the panel's empty network policy under both keys as before;
    the second reader is not configured. New for #350: `finalize_research` lists `harm_screen` and `safety_question`;
    `submit_research_contribution`'s description is 6,473 characters with its shapes.
  - Full text: the Europe PMC section search completed with a receipt and `full_text_scope` `METHODS`; the owner
    library's three DOI probes returned client code `fetched` (two `FULL_TEXT_READABLE`, one identity mismatch with
    `PRIMARY_OA_ROUTES_EXHAUSTED`). Production's log stayed at one line.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot: result `success`, exit 0, `complete` with `no_pending_promotion`. The timer was re-enabled
    with the selector naming the new image, next due 13:00:03 UTC.
- **The scout's ledger (owner answer 145a):** at 13:02:08 UTC October's aggregate AI-budget ledger was set to $13.00
  charged, the owner's figure for October's real Gemini spend, so the YouTube scout works again; the prior file is
  kept as `/opt/askrigor/rollbacks/ai-budget-before-145a-20261021T130208Z.json`. The settlement of a later-finishing
  scout's real cost comes in the next build.
- **Product interface:** at 13:09 UTC, with no owner refresh known to this session, the ChatGPT app Codex reaches
  listed 33 AskRigor tools, the first tool's description began "Versions when this tool list was loaded: HRP 20.6.28,
  Universal 20.5.45, build 7562331c83344df60426b3a0dd65653782ed069d", both manifests returned those versions
  (`a38e3e76b0983f9d`, `564c8697fdd4aa69`), and `finalize_research` was listed with `recommendations`,
  `comparison_claims`, `user_observations`, `proposed_tests`, `carried_state`, `harm_screen` and `safety_question`.
- **Custom GPT:** no Custom GPT file changed between `034da344` and `7562331c`, so no editor installation was needed.
- **Plugin:**
  - Before: `0.1.0+codex.20261020182257.hrp.20.6.27.universal.20.5.44`, receipts
    `6b12866eaaf25d0d82cd09761e37cbaef231a71bf0020695dbbe5dd1afa17763`. Rollback copy
    `/home/joel/plugins/askrigor.rollback-20261021T130014Z`.
  - No packaged file changed; reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261021130014.hrp.20.6.28.universal.20.5.45` for the version; source and installed receipts both
    `2b000f00c3503001e91b494eab79c063679b58937bf60ff51bbf4535bb180fc3`, over 8 files, each equal to the release
    commit's apart from the manifest version.
- **Lessons:** `npm run lessons:status` at the release checkpoint (00:12 UTC): 29 open, 9 needing review (#38 to #46),
  6 accepted but not incorporated (#32 to #37), 19 incorporated or closed, 0 deletion eligible; every UDA lane item
  recorded, including those in open UDA pull requests.
- **Product acceptance (owner regressions, 13:09 to 17:22 UTC):**
  - **Setup:** the regression list (`docs/owner-regressions.md` at 7562331c: 48 cases) and the two baselines of 20 Oct
    (i44 and i45, now judged with questions 128 and 135 built) ran through Codex with the ChatGPT app whose tool list
    named build 7562331c, 13:09:31 to 17:05:13 UTC: 50 cases in 58 runs (#336 in four turns; l32, l33, the question
    120 sleep case, q132 and r326 in two), three at a time, about 60 AskRigor calls per case (2,651 in all; 31 runs used
    58 or more). OpenAI's biological-risk filter refused q130-maker-authors at 15:23 UTC (exit 1, no answer); its logs
    are kept, and one rerun with the same inputs completed from 17:07:31 to 17:22:29. No run called another app's or
    server's tool. The Claude session judged each criterion by meaning, with its evidence and quotes (a judgment of
    meaning; no word list decides it).
  - **Clean start (owner answer 144a):** `~/.codex/AGENTS.override.md` held the one line "No personal instructions
    apply in this session." for both stretches and was removed after each, as logged. No run ran a shell command or
    fetched the owner's development repository (20 Oct: 38 of 39 fetched it).
  - **Loaded:** every answer named HRP 20.6.28 and Universal 20.5.45, and every manifest call returned those versions.
  - **Executed:** of all 50 cases, 21 met every criterion, 28 met them in part, and one failed: q136-responders computed
    response rates and a ratio from counts whose denominators it had just shown to conflict, the case's own fail
    condition. Of the 30 regression cases of 20 Oct, 13 passed and 17 in part, none failed (20 Oct: 13 and 17): q81
    and r330 gained a pass; l23 (no non-drug option) and r326 (the continued turn dropped the warning and its
    declaration) lost one. i44 now passes (question 128's rule: anaphylaxis named and searched, earlier tolerance no
    protection). Of the 18 new cases, 7 passed (both book cases, q126 #40, q128, q135 two weeks, q136 scale, q137),
    10 in part and 1 failed. #336: no hard fail, five of six criteria met and one in part, as on 20 Oct. q132's first
    turn skipped community evidence for an abnormal test result with no named candidate, the gap its new clause
    targets, and its check accepted that. Question 130's funding rule shows in sixteen answers.
  - **Finalized:** the final check passed in 44 of 50 cases (not i45, l31, l36, r325, r329, r331); in the 32 cases
    comparable with 20 Oct, 26 (20 Oct: 29). 248 final-check calls, none rejected (20 Oct: 1 of 157). Every passing
    answer carries the check line and every caveat its check required. r325, r331 and l36 withheld the findings card
    the check requires in free contributor mode, as the preamble's "send nothing" led them to; l31 and i45 ran out of
    calls with discovery unfinished; r329's sources have no DOI.
  - **Findings for the next build and the owner:**
    1. The YouTube scout ran again after 145a (28 completed) until Google refused it from about 16:35 UTC with
       `gemini_youtube_scout_credits_depleted`: the Gemini key's prepaid credits are used up, which only the owner's
       Google billing can fix. Production's ledger read $47.00 of its $50 October limit at 17:10:04 UTC, about 34 scout
       holds kept at their full $1 because the live build cannot settle a later-finishing scout (the next build does).
       YouTube's daily search quota also stopped searches in eight runs.
    2. The check still passes with a needed declaration empty or incomplete (l25, l28, r328, r331, r326's turn 2), and
       with community evidence declared not relevant where the case needs it (l27, q132's turn 1).
    3. 102 tool calls failed; 31 of them were the study-audit validator's "reported figure ... is not in its cited
       source block", for totals and denominators the paper does not print as such.
    4. Template sentences still break ("reviews reviews", "would take About", label text inside caveats), and the
       unblinded-test caveat appears where no test was proposed (l26, q135 low stakes).
  - **Saves:** 35 runs' final checks saved a findings card for the owner's review, ARF-0076 to ARF-0110; the runs
    without study research and the six not_ready runs saved none. The full judgment, case
    by case, is `docs/audits/2026-10-21-owner-regressions-judgment.md`.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-7562331c83344df60426b3a0dd65653782ed069d`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-7562331c8334` (build `034da344`), and check its
     health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261021T130014Z` and run `codex plugin add
     askrigor@personal`.

  No migration or site change needs reversal. Rollback was not executed.
