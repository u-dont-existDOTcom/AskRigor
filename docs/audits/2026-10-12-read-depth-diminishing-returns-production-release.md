# Production release, 2026-10-12 (lab preparation, read depth, tool-list currency, diminishing returns)

- **Owner decision:** "75A (recommended): merge 307, 315, 316, 314 and 317 and deploy", typed in the Claude session
  and queued there at 02:28 UTC. Option A of owner question 75 approved those five merges in that order, deploying
  the research server, and refreshing the Codex plugin for the new protocol versions.
- **Contents:**
  - #307 (owner question 70): HRP 20.6.16, preparation advice before a repeat blood draw (`PreanalyticReadiness`,
    FS219), and the `lab_preparation` declaration in `finalize_research`.
  - #315 (#309 part 2): a Europe PMC failure keeps its HTTP status and whether it is retryable, and a PubMed
    Central article names its page.
  - #316: the record of the 2026-10-11 maintenance release.
  - #314 (owner question 71): Universal 20.5.38 (`ToolListCurrency`) and HRP 20.6.17 (`StudyReadDepthDisclosure`,
    case `CrossTrialResponderRatio`, FS220); `read_depth` on each key source, checked against what AskRigor fetched,
    with a new signed `full_text_read` receipt.
  - #317 (owner question 73): HRP 20.6.18 (`ProactiveDiminishingReturns`, cases `PlateauSaidBeforeAsked` and
    `ActiveLaneNotSaturated`, FS221).
  - Held out: #318 (owner question 77, built, HRP 20.6.19), the plans #319 and #320, and Dependabot PRs #312
    (`proxy-addr`) and #313 (`source-map-js`). GitHub rates #312's alert critical. AskRigor's server reads client
    addresses with its own code (`apps/research-mcp/src/rate-limit.ts`) and never sets Express's `trust proxy`,
    which the flaw needs, so it waits for the next release question.
- **Source:**
  - Each change was brought up to date with main before merging (`update-branch` with the expected head). Each new
    head's parents were exactly the reviewed head and main. All seven checks passed before each merge.
  - #307 merged at 02:32:46 UTC as `2db3001531b98f0de82844e133ed8b0f73e9b8cd`.
  - #315 merged at 02:35:46 UTC as `25772dc49b059d7acf010ca3ebb87d9644748bc2`.
  - #316 merged at 02:44:42 UTC as `8ea518fe510bf05120458cefb1889fe40347b9e7`.
  - #314 merged at 02:49:25 UTC as `0980193e720e5595075cc771424995453d9dda92`.
  - #317 merged at 02:51:45 UTC as `e6823000ddb54fd761d18ff7d2c2eec83d618869`.
  - Each merge's tree equals its tested head's tree, so GitHub's "Deterministic verification" on #317's head
    `687fff9c` covers the release tree. `npm run verify` also passed on the laptop on the full stack with
    question 77's build on top (3,196 tests).
  - The release tree's protocols: HRP 20.6.18, SHA-256 prefix `48e0e80ab412a3bc`; Universal 20.5.38, prefix
    `06e5ca6befb9dac6`. No migration, deploy, infrastructure or Custom GPT file changed since `030d21b8`.
- **Image:**
  - production tag `askrigor-research:e6823000ddb54fd761d18ff7d2c2eec83d618869`;
  - ID `sha256:195080d90653a9acbff8c7198f4be917490f816def527e7447a325958ec8f1f8`, user `node`, workdir `/app`;
  - source archive SHA-256 `ab3117c8b65f83a0b8d5f2e378be722bfcab0d34d1a4426ee49d1544db491df8`;
  - image archive 109,306,974 bytes, SHA-256 `9603b054986d86197db8007c9d7b06b5352c00677ef83b85af2eb3f2e7750670`;
  - no-secret gate (built and run by Codex from a reviewed brief; the brief now retries `/healthz` while the server
    starts): `/healthz` ok, `/version` HRP 20.6.18 and Universal 20.5.38, build `unknown` without the build
    variable, one log line holding no credential, key, token or provider marker; the candidate was stopped and
    removed.
- **Prior state:**
  - `research-mcp` ran `askrigor-research:030d21b8e5b41acecdaa04974586843b0ab03893`, up 24 hours, healthy;
  - SHA-256 prefixes: selector `6ba4b7e9d31f9756`, `runtime.env` `5212b78f9d00d4f3`,
    `compose.yaml` `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`.
- **Production:**
  - The archive checksum verified; the loaded image ID equals the build ID.
  - The promotion timer was stopped and disabled; the service was inactive and no promotion runner was present.
  - Rollback names: `askrigor-research:rollback-pre-e6823000ddb5` and
    `/opt/askrigor/rollbacks/pre-e6823000ddb54fd761d18ff7d2c2eec83d618869`.
  - Schema dump 515,859 bytes, SHA-256 prefix `d05539434a64c505`; the migrate operation reported complete.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `f14488b62d93fae1`.
    Selector prefix `33b02148bcea1cf6`.
  - `askrigor-research-mcp-1` started at 02:57:00 UTC and was healthy at 02:57:06.
  - Runtime: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs, one log line.
  - Writable mounts: `/var/lib/askrigor-research-sessions`, `/var/lib/askrigor/lesson-incidents`,
    `/var/lib/askrigor-actions`; networks `askrigor_default` and `askrigor_living_evidence_private`.
- **Acceptance:**
  - Public `/healthz` reported `ok`; `/version` build `e6823000ddb54fd761d18ff7d2c2eec83d618869`,
    HRP 20.6.18 (`48e0e80a…`) and Universal 20.5.38 (`06e5ca6b…`).
  - Protected-resource scopes were `research:use` and `cases:review`;
    an unauthenticated POST to `/mcp/claude` answered 401; anonymous `/mcp` listed 33 tools.
  - The in-container standard probe found 33 unique standard tools and 22 Gemini tools;
    the server title and the first tool's description named the deployed build and current protocols.
  - Both manifests returned: HRP 20.6.18 (2026-10-11), SHA-256 prefix `48e0e80ab412a3bc`,
    and Universal 20.5.38 (2026-10-11), prefix `06e5ca6befb9dac6`; `load_protocol` HRP index was ok.
  - PubMed returned one record with a receipt. Video read completed without an error:
    2 calls, 46 seconds, 20 claims, no sponsorships, duration 05:53.
  - Reddit probes returned `found` and `not_found`; private state directory mode 700, both ledger files mode 600.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot completed with `no_pending_promotion`; the timer was re-enabled and the selector
    named the new image. Next trigger at the check: 03:00:04 UTC.
- **Full text and the library:**
  - Probe: `scripts/release-fulltext-probe.mjs`, already preserved in the repository.
  - First run, 02:59 UTC: the Europe PMC section search failed with `europe_pmc_upstream_unavailable`,
    `http_status` 503, `retryable` true. Europe PMC's own search API answered 503 to the laptop and the server at
    the same time, so this was an upstream outage. It is also #315's change working live: before it, the failure
    did not say what had happened.
  - Rerun at 03:05 UTC, after Europe PMC recovered: the section search completed without a tool error, with a
    receipt and `full_text_scope` naming `METHODS`: "Europe PMC full texts only, about 30% of PubMed records".
  - The owner library was configured; all three DOI probes returned client code `fetched`.
  - `10.1006/bbrc.2001.4945` and `10.1016/s0166-4328(03)00097-4`: `owner_library: indexed`,
    access status `complete`, no error, state `FULL_TEXT_READABLE`.
  - `10.1016/s0887-8994(99)00152-6`: `owner_library: identity_mismatch`, access status `error`,
    retryable `open_full_text_route_failed`, state `PRIMARY_OA_ROUTES_EXHAUSTED`.
  - None of the three results had a signable lead. Production's log stayed at one line.
- **Product interface:**
  - The Claude session's signed-in AskRigor connector returned HRP 20.6.18 (`48e0e80a…`) and Universal 20.5.38
    (`06e5ca6b…`), with `sign_in: accepted` and `research_access: ready`.
  - That session's tool list had been loaded before the deploy, and its first tool's description still named HRP
    20.6.15, Universal 20.5.37 and build `030d21b8`. This is the outdated tool list that Universal 20.5.38's
    `ToolListCurrency` describes. The client sent the new `lab_preparation` object as a string, which the server
    refused as invalid input.
  - A synthetic `finalize_research` call from that session without the new declarations returned `not_ready`. Its
    next steps asked for `lab_preparation` and for each key source's `read_depth` and `answer_marker`, and ended
    with the connector-refresh hint, once.
  - Synthetic cases through Codex's AskRigor connector: see "Product acceptance" below.
- **Custom GPT:** no Custom GPT file changed between `030d21b8` and `e6823000` (Action schema, bundle,
  instructions or setup), so no editor installation was needed.
- **Plugin:**
  - Before: `0.1.0+codex.20261010130246.hrp.20.6.15.universal.20.5.37`, source and installed receipts
    `20f8032b66170ff3202691975cba8e61eb5ea5d97493d3f7692b05924133adc1`.
  - Rollback copy `/home/joel/plugins/askrigor.rollback-20261012T030029Z`.
  - Reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261012030029.hrp.20.6.18.universal.20.5.38`. No packaged file changed since `030d21b8` apart
    from the manifest version.
  - Source and installed receipts are both `595f1bccc853660d8dd91b39228c91ab26a7625daab4249e83786056d33fa635`, over
    the same 8 files as before. The Claude session recomputed both receipts and compared two installed files with
    the release commit. No files were removed.
  - Connector through the refreshed plugin: 33 tools; read-only `get_protocol_manifest` calls returned HRP 20.6.18
    (`48e0e80ab412a3bc`) and Universal 20.5.38 (`06e5ca6befb9dac6`).
  - Lesson queue at the refresh: 4 open, 4 need review, 0 accepted pending incorporation, 5 incorporated or closed,
    0 deletion eligible.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-e6823000ddb54fd761d18ff7d2c2eec83d618869`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-e6823000ddb5`, and check its health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261012T030029Z` and run
     `codex plugin add askrigor@personal`.

  No migration or site change needs reversal. Rollback execution was not checked in the supplied evidence.


## Product acceptance (synthetic cases, 03:00 to 03:25 UTC)

- **Route:** Codex, through the AskRigor app it reaches in the owner's ChatGPT account (`askrigor_6_oct`), from a
  reviewed brief. Both cases were synthetic; no findings card was sent, and nothing was saved or submitted.
- **That app's tool list is stale:**
  - Its first tool's description names HRP 20.6.10, Universal 20.5.34 and build
    `27deb4a57fddbf78f448a014c83361bc06c0e30b`, live from 2026-10-04 to 2026-10-07. The app was created on
    2026-10-06 and its tool list has not reloaded since.
  - Its manifest calls still return the live versions, because they reach the live server. Earlier plugin probes
    counted 33 tools and read live manifests, so they could not see this.
  - Its schema refused `read_depth` on key sources and has no `lab_preparation`. The final check therefore stayed
    `not_ready`, with the connector-refresh hint, which is the designed outcome for an outdated tool list.
  - Refreshing the app is the owner's action in ChatGPT's settings. The owner refreshed it at about 03:40 UTC; Codex
    still saw the old list at 03:42 and the current one at 03:54 (build `e6823000`, HRP 20.6.18, Universal 20.5.38,
    with `lab_preparation`, `read_depth` and `answer_marker` in the schema).
- **Case 1, a lab result (questions 70 and 71):** "prolactin about twice the upper limit, repeat next week; anything
  to do before it, and how likely is it to be normal?"
  - The research ran PubMed and Europe PMC searches and one section search of Methods and Results. Two studies were
    read to the end and audited.
  - The server issued the new signed `full_text_read` receipt for both studies; all 13 receipts verified.
  - The answer gave preparation advice before the repeat draw: rest before it, no strenuous exercise or nipple
    stimulation, the laboratory's own instructions, and medicines and high-dose biotin. It did not let preparation
    replace confirmation, and it named macroprolactin, thyroid function and urgent symptoms.
  - Beside each study it said what was read: the full text and a validated audit for two studies, abstracts only
    for three others. It declined to give a personal probability the studies could not support.
- **The new declarations on production:** the same receipts and answer were sent through the production server's own
  in-container client, which has the current schema.
  - `lab_preparation` (covered, two quotes from the answer) was accepted.
  - `read_depth: full_text_audited` was accepted for both studies, matching their audit receipts.
  - `answer_marker`, the studies' DOI links and `full_text_search` (one section-search receipt) were accepted.
  - The remaining steps were first-pass items the draft had missed: a second study lead, an estimate in numbers,
    and the resulting caveat sentences. Once those were supplied, the only open step was the Europe PMC section
    search, whose own call failed while Europe PMC was unstable (HTTP 503 at 03:20 UTC; between 03:24 and 03:27 one
    section query returned records with a receipt while others failed, and a laptop request timed out).
  - Retried every 3 minutes, the probe passed at 03:37:04 UTC: the section search returned a receipt, all 14
    receipts verified, both studies were validated, no next step remained, and the final check answered
    `ready_with_limits` with the first-pass limit and its three caveat sentences.
- **Case 1 again, through the refreshed app (03:55 to 04:04 UTC):** same question, same rules.
  - The first tool named build `e6823000`. Four key studies were linked by DOI, each with its read depth beside it;
    two were read to the end with validated audits.
  - `finalize_research` verified all 12 receipts and accepted `lab_preparation`, all four `read_depth` values and
    all four `answer_marker` values. The only remaining step was the findings card, which the brief withheld so
    that no synthetic card entered the owner's findings library.
  - The answer added a community pass (two public forums, reported as unverified and kept apart from the studies)
    and declined to give a personal probability.
  - Codex called `validate_review_method_audit`, a read-only research validator, reading the brief's "review tools"
    as including it. No contribution, save, lesson or access change was made.
- **Case 2, diminishing returns (question 73):** four passes on herbal treatments for irritable bowel symptoms, the
  last three adding only small maker-run trials and duplicates; the user writes "continue".
  - The reply said, unasked, that returns had diminished. It gave the scope and what each pass found, and kept the
    exceptions open: independent replication, unpublished results and a consequential contradiction.
  - It recommended where to move the effort, said that a missing full text or an unfinished audit is not
    saturation, and kept the parent goal.
  - It gave the responder rates as a 10-point difference, not a ratio. The brief named the rule to load, so this
    tests the rule's text, not its unprompted activation.
- **Observations, not defects in this release:**
  - `load_protocol` loads top-level sections only; asked for `ProactiveDiminishingReturns`, which is nested in
    `ResearchOrchestrationAndModeSelectionGate`, it returned an error naming the index.
  - When `acquire_open_full_text` returns no receipt until a public-copy search is recorded, the final check's step
    "pass the research_receipt it returns" doesn't say so.
  - A Europe PMC request that fails without an HTTP status, such as a timeout, is reported as
    `europe_pmc_request_failed` with `retryable` false, although a timeout is usually transient
    (`packages/sources/src/europe-pmc.ts`).

Evidence: `build-summary` (Codex), `deploy.out`, `public-acceptance.out`, `promotion.out`, `standard-probe.out`,
`fulltext-probe.out`, `fulltext-probe-rerun.out` and the plugin refresh summary, in the release's evidence folder on
the laptop.
