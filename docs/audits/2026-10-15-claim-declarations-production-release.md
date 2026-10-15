# Production release, 2026-10-15 (declared claims, recommendations and accepted lessons)

- **Owner decision:** "93a" and "94b", typed in the Claude session at 10:56:04 UTC. Option B of owner question 94:
  wait for question 93, then merge #333 and the record #323 and deploy. Earlier answers:
  - "89a 88a 87a 86a" (14 Oct, 04:03 UTC);
  - "92 a 91 b 90 a" (14 Oct, 22:41 UTC). Its note on safest options became question 93.
- **Contents:**
  - #323: the record of the 2026-10-12 contested-evidence release.
  - #333 (owner questions 86 to 93):
    - HRP 20.6.22 (questions 86 to 89):
      - `HarmWarningCalibration` (FS226, FS227): a harm warning gives its rate against a comparator, or says the
        frequency is unknown, and says what the evidence measured.
      - `IdenticalResultsAcrossPublications` (FS228).
      - FS229: a mechanism claim stays on the route its evidence used.
      - FS230: a physically impossible value stays as printed but unused.
    - Universal 20.5.42 (question 86): a research task started under AskRigor stays under it in later turns,
      including "continue" without a mention.
    - HRP 20.6.23:
      - Question 90, from lessons #22 and #23: `DurationMatchedBenefitAndHarm` and FS231.
      - Question 92, from lessons #24 to #29: `BriefSymptomMeasures`, mechanisms traced across species and tissues,
        table figures read with their headings, corrections carried into charts and early answers, forum reports kept
        to the target symptom, and the user's source classes carried forward; FS232.
      - Eight stress cases.
    - HRP 20.6.24 (question 93, from the owner's note on lesson #23): `SafestOptionsFirst` and FS233.
    - `finalize_research`:
      - `safety_claims`, `key_terms` and a reminder sentence for research results (question 86);
      - study audits' `reported_figures`, each checked for plausibility (questions 87 and 88);
      - `mechanism_claims`, with routes (question 89) and with species and tissue (lesson #28);
      - `recommendations` (question 90);
      - the `share_of_reports` basis (lesson #25);
      - `community_searches[].thread_selection` (lesson #27);
      - `corrections` (lesson #29).
    - Each lesson's label names the surface it came from.
    - Fixes found before the release:
      - figures with thousands separators, including Arabic ones;
      - whole-number coincidences;
      - capitals-only terms matched with their case.
- **Source:**
  - #323 merged at 11:17:20 UTC as `128539ba03375495cc43e63d163f52d28be5d06b`.
  - #333 was brought up to date with main (merge `06ad9c07`) and merged at 12:04:48 UTC as
    `85edacfa2b68add7776b0be4845982db1ad6d275`. Its tree equals the tested head's (`f91a8222`), and its parents are
    `128539ba` and `06ad9c07`.
  - Protocols:
    - HRP 20.6.24, SHA-256 prefix `04bf76e20ebab9ab`;
    - Universal 20.5.42, prefix `0401335ed4b1f0ec`.
  - Checks: `npm run verify` passed on the final head (3,316 tests), and every PR check passed.
  - Unchanged since `808fb78a`: migrations, deploy, infrastructure, plugin package and Custom GPT files.
- **Image:**
  - production tag `askrigor-research:85edacfa2b68add7776b0be4845982db1ad6d275`;
  - ID `sha256:38f2abada5e1a1ab0a3560c634c5e47d8c4af18bda91d6efe50622f2e52d76c6`, user `node`, workdir `/app`;
  - source archive SHA-256 `a2ccf962d9d4ddae041dbd7331fd0bfe704bdac68ce6da73d6fcaab7ef133119`;
  - image archive 109,363,270 bytes, SHA-256 `6476bbd8a30227bdf8bff5e7cf0e6442c2a41d2d3a77b7a7fd5150f04ef95320`;
  - no-secret gate on the laptop:
    - `/healthz` ok;
    - `/version` HRP 20.6.24 and Universal 20.5.42, build `unknown` without the build variable;
    - one log line, naming no credential class;
    - the candidate was stopped and removed.
- **Prior state:**
  - `research-mcp` ran `askrigor-research:808fb78a3bdf887be2b9896bac78b23af5945b04`, up 3 days, healthy;
  - SHA-256 prefixes:
    - selector `9a9156a9c9b2a5c5`;
    - `runtime.env` `3f4d71fbd9defc3d`;
    - `compose.yaml` `0dca180709940dd6`;
    - `compose.living-evidence.yaml` `5631ff8150eea2a8`;
  - the promotion timer was enabled, and `runtime.env` held 64 names.
- **Production:**
  - The archive checksum verified; the loaded image ID equals the build ID.
  - At 12:24 UTC the promotion timer was stopped and disabled; the service was inactive.
  - Rollback names: `askrigor-research:rollback-pre-85edacfa2b68` (the prior image, `ff06246d1e55`) and
    `/opt/askrigor/rollbacks/pre-85edacfa2b68add7776b0be4845982db1ad6d275`.
  - Schema dump 606,756 bytes, SHA-256 prefix `9c39f47267243ede`; the migrate operation reported complete.
  - **Procedure finding:** the host script stopped after its migrate step.
    - It ran as `ssh host 'bash -s' < script`. `docker compose run` keeps stdin open, so it read the rest of the
      script, and bash then exited without error.
    - A second script, copied to the host and run from the file, finished the remaining steps at 12:35. It first
      checked that the rollback copies still matched the live files.
    - The prior image kept serving, healthy, throughout. The promotion timer stayed disabled from 12:24 to 12:41.
    - Step 8 of the release plan now closes the migrate step's stdin, and the plan says to run host steps from a file.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `38b411f75475342c`.
    Selector prefix `b9ad4230eaee16ae`.
  - `askrigor-research-mcp-1` started at 12:35:16 UTC. It was healthy when the script finished, 12.5 seconds after
    the script started.
  - Runtime:
    - `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs;
    - one log line, with no credential-like marker.
  - Writable mounts: `/var/lib/askrigor-actions`, `/var/lib/askrigor-research-sessions` and
    `/var/lib/askrigor/lesson-incidents`. Networks: `askrigor_default` and `askrigor_living_evidence_private`.
- **Acceptance (12:40 to 12:42 UTC):**
  - Public `/healthz` reported `ok`. `/version` reported build `85edacfa2b68add7776b0be4845982db1ad6d275`,
    HRP 20.6.24 (`04bf76e2…`) and Universal 20.5.42 (`0401335e…`).
  - Protected-resource scopes were `research:use` and `cases:review`.
  - An unauthenticated POST to `/mcp/claude` answered 401.
  - Anonymous `/mcp` listed 33 tools. The first tool's description names HRP 20.6.24, Universal 20.5.42 and the
    build.
  - The in-container standard probe:
    - 33 unique standard tools and 22 Gemini tools;
    - the server title and the first tool's description named the deployed build and current protocols;
    - both manifests returned the new versions, and `load_protocol`'s HRP index was ok.
  - PubMed returned one record with a receipt.
  - The video read completed without an error: 3 calls, 59 seconds, 29 claims, no sponsorships, duration 05:53.
  - Reddit probes returned `found` and `not_found`. The private state directory had mode 700 and both ledger files
    mode 600.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot: result `success`, exit 0, `complete` with `no_pending_promotion`.
    - The timer was re-enabled, and the selector names the new image.
    - The timer ran at 12:41:48 UTC (`complete`, `no_pending_promotion`). Its next run was due at 12:45:13.
- **Full text and the library:**
  - The Europe PMC section search completed without a tool error. It returned a receipt and a `full_text_scope`
    naming `METHODS`.
  - The owner library was configured, and all three DOI probes returned client code `fetched`, as on 12 Oct:
    - `10.1006/bbrc.2001.4945` and `10.1016/s0166-4328(03)00097-4`: `indexed`, `FULL_TEXT_READABLE`;
    - `10.1016/s0887-8994(99)00152-6`: `identity_mismatch`, retryable `open_full_text_route_failed`.
  - Production's log stayed at one line.
- **Product interface:** the Claude session's signed-in AskRigor connector returned:
  - HRP 20.6.24 (`04bf76e2…`) and Universal 20.5.42 (`0401335e…`);
  - `sign_in: accepted` and `research_access: ready`, in free contributor mode.

  Its tool list was loaded before the release and still named build `808fb78a`.
- **Custom GPT:** no Custom GPT file changed between `808fb78a` and `85edacfa`, so no editor installation was needed.
  That covers the Action schema (pinned by `tests/action-openapi-snapshot.test.ts`), the bundle, the instructions
  and the setup.
- **Plugin:**
  - Before: `0.1.0+codex.20261012053150.hrp.20.6.21.universal.20.5.41`, receipts
    `598827457cfb6ca7d3a3d2600046d19c03881ce9c2b3667fe25a8d3516e3b901`.
  - Rollback copy `/home/joel/plugins/askrigor.rollback-20261015T124720Z`.
  - Reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261015124639.hrp.20.6.24.universal.20.5.42`. No packaged file changed apart from the manifest
    version.
  - Source and installed receipts are both `71c9924327f885805597c77d95937dfbb9ff09934d27cab551855bbfe5de157b`, over 8
    files. Each file's hash equals the release commit's; for the manifest, the commit's with the new version line.
  - The receipts were taken with a shell form of `scripts/plugin-package-receipt.mjs`'s digest. It reproduced the
    prior receipt exactly.
  - Connector through Codex (12:48 UTC):
    - 33 tools; `get_protocol_manifest` returned HRP 20.6.24 (`04bf76e20ebab9ab`) and Universal 20.5.42
      (`0401335ed4b1f0ec`).
    - The first tool's description still named HRP 20.6.21, Universal 20.5.41 and build `808fb78a`.
      `finalize_research` had no `recommendations` or `corrections` field, so the ChatGPT app's tool list predated
      the release.
    - The owner's refresh of that app is pending.
- **Lessons:**
  - Accepted lessons #22 to #29 are marked incorporated in `AskRigor-lessons`, each with a comment saying where it
    lives.
  - Queue status: `npm run lessons:status` reported `unavailable` (`gh_unavailable`), because this session's GitHub
    client offers only `gh api`.
  - Counted directly through the GitHub API at 13:05 UTC:
    - 17 lesson candidates;
    - 0 needing review;
    - 0 accepted but not incorporated;
    - 17 incorporated or closed, 12 of them still open;
    - deletion eligibility not computed.
  - The UDA lane had no unrecorded item.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-85edacfa2b68add7776b0be4845982db1ad6d275`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-85edacfa2b68`, and check its health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261015T124720Z` and run
     `codex plugin add askrigor@personal`.

  No migration or site change needs reversal. Rollback was not executed.

## Product acceptance (owner regressions)

Pending. The regression list in `docs/owner-regressions.md` runs through Codex once the owner refreshes the AskRigor
app in ChatGPT.

Evidence: build, stage, probe, plugin and Codex outputs in `/home/joel/askrigor-releases/20261015/` on the laptop.
