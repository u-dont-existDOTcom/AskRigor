# Production release, 2026-10-16 (final-check fixes, the mobile notice, owner questions 97, 99 and 100)

- **Owner decision:** "100a 101a", typed in the Claude session at 18:31 UTC: option A of owner question 101, merge
  #337 then #338 and deploy. Earlier answers:
  - "97a98b99a" (16:44 UTC); its "98b" asked to release #337 together with 97 and 99. It replaced a first message that
    the owner withdrew ("ignore last msg") before anything was merged.
  - Question 96 (15 Oct): #335, the 15 Oct release record, merged by the owner; the work pushed to its branch after
    that merge became #337.
- **Contents:**
  - #337, from the 15 Oct owner regressions (the final check passed in 2 of 19 cases):
    - `finalize_research`: no findings card asked for when the answer cites no study or video; a DOI key source's
      PubMed link counts once a `pubmed_record` receipt matched the two; the unread-study caveat follows the reason
      its lead receipt signed; community searches gain `access_boundary: retrieval_failed`.
    - `load_protocol`: section `"core"` loads every core section in one call, and comma-separated names load several
      sections, rules or cases.
    - The owner's mobile notice: Universal 20.5.43 (`output_style`), and a `finalize_research` caveat from ChatGPT's
      optional `openai/userAgent` hint.
    - Issue #336 in `docs/owner-regressions.md`, and its baseline record.
  - #338, owner questions 97 and 99 (issue #336; lessons #30 and #31):
    - HRP 20.6.25: `ProposeDiscriminatingTest`, FS235 and stress case `StimulusLockedPainReport` (97); sentences in
      `ScopeAxesBeforeSampling`, `PrincipalPlatformMapping` and `ObjectiveSubjectiveSeparation`, FS234, and stress
      cases `FormSpecificForumReports` and `DoseChangedFormSwitch` (99).
    - `finalize_research`: `community_searches[].report_identity`, `comparison_claims` with numeric doses,
      `principal_communities[].named_by_user`, and `check_line`.
    - UDA lane item `2026-10-15-stimulus-locked-pain-bci-research-test` (UDA #382), recorded as adapted and folded
      into #336's regression case.
- **Source:**
  - #337 merged at 18:32:37 UTC as `588dc8f60d3a64940b55403d1cec623b8f286ea1`.
  - #338 was brought up to date with main (merge `893d154e`, whose tree equals the reviewed head `76269df5`), passed
    all seven checks ("Deterministic verification" run 38948185144: 3,400 tests passed, 6 skipped), and merged at
    18:36:17 UTC as `13c26d8f4e938b8f2994b2fb63b7579872061d02`. The merge tree equals the PR head tree.
  - Protocols: HRP 20.6.25, SHA-256 prefix `f3f1d9d2f60eb0dd`; Universal 20.5.43, prefix `7f03ddbd280a9906`.
  - Unchanged since `57f07ebd`: migrations, deploy, infrastructure, plugin package (apart from the manifest version)
    and Custom GPT files.
- **Image:**
  - production tag `askrigor-research:13c26d8f4e938b8f2994b2fb63b7579872061d02`;
  - ID `sha256:7fadf70b23874b6b7a962c7cc471e70170221d4081e5d67017db3d731996d94e`, user `node`, workdir `/app`;
  - source archive SHA-256 `48b73c65ed2889ff7d8e2ff75bee83f266cb98026b8d1302539d9001b0b7712b`;
  - image archive 109,376,721 bytes, SHA-256 `304b154630310443162a535787fbb81dd7c821fa94d4ab72258e52e6bccfe40e`;
  - no-secret gate on the laptop: `/healthz` ok; `/version` HRP 20.6.25 and Universal 20.5.43, build `unknown`
    without the build variable; one log line, naming no credential class; the candidate was stopped and removed.
- **Prior state (18:42 UTC):**
  - `research-mcp` ran `askrigor-research:85edacfa2b68add7776b0be4845982db1ad6d275`, up 30 hours, healthy;
  - SHA-256 prefixes: selector `b9ad4230eaee16ae`, `runtime.env` `38b411f75475342c`, `compose.yaml`
    `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`;
  - the promotion timer was enabled, and `runtime.env` held 64 names.
- **Production:**
  - The host step ran from a file copied to the host (`ssh -n host bash /root/stage-b-host.sh`), with stdin closed for
    every `docker compose` call, as the 15 Oct finding asked; it ran to the end.
  - The archive checksum verified; the loaded image ID equals the build ID.
  - The promotion timer was stopped and disabled before the switch.
  - Rollback names: `askrigor-research:rollback-pre-13c26d8f4e93` (the prior image) and
    `/opt/askrigor/rollbacks/pre-13c26d8f4e938b8f2994b2fb63b7579872061d02`.
  - Schema dump 726,578 bytes, SHA-256 prefix `ed0b0f28b7c1bd53`; the migrate operation reported complete.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `bb75139fd00383b5`. Selector prefix
    `6c79ea21d6a9d6f1`.
  - `askrigor-research-mcp-1` started at 18:42:35 UTC and was healthy.
  - Runtime: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs; one log line, with no
    credential-like marker. Writable mounts: `/var/lib/askrigor-actions`, `/var/lib/askrigor-research-sessions` and
    `/var/lib/askrigor/lesson-incidents`. Networks: `askrigor_default` and `askrigor_living_evidence_private`.
- **Acceptance (18:42 to 18:45 UTC):**
  - Public `/healthz` reported `ok`. `/version` reported build `13c26d8f4e938b8f2994b2fb63b7579872061d02`, HRP 20.6.25
    (`f3f1d9d2…`) and Universal 20.5.43 (`7f03ddbd…`).
  - Protected-resource scopes were `research:use` and `cases:review`; an unauthenticated POST to `/mcp/claude`
    answered 401.
  - Anonymous `/mcp` listed 33 tools; the first tool's description names HRP 20.6.25, Universal 20.5.43 and the build.
  - The in-container standard probe:
    - 33 unique standard tools and 22 Gemini tools; the server title and the first tool's description named the
      deployed build and current protocols; both manifests returned the new versions;
    - `load_protocol`: the HRP index ok; section `"core"` (#337) ok, one page; two rules by name,
      `ProposeDiscriminatingTest,DocumentSignal` (#338), ok, 758 bytes;
    - PubMed returned one record with a receipt; the video read completed (2 calls, 47 seconds, 23 claims, no
      sponsorships, duration 05:53); Reddit probes returned `found` and `not_found`; the private state directory had
      mode 700 and both ledger files mode 600.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot: result `success`, exit 0, `complete` with `no_pending_promotion`. The timer was re-enabled and
    the selector names the new image. The timer ran at 18:45:02 UTC (`complete`, `no_pending_promotion`, result
    `success`); its next run was due at 18:50:12.
- **Full text and the library:** the Europe PMC section search completed without a tool error, with a receipt and a
  `full_text_scope` naming `METHODS`. The owner library was configured, and the three DOI probes returned client code
  `fetched`, as on 15 Oct: `10.1006/bbrc.2001.4945` and `10.1016/s0166-4328(03)00097-4` `indexed`,
  `FULL_TEXT_READABLE`; `10.1016/s0887-8994(99)00152-6` `identity_mismatch`, retryable `open_full_text_route_failed`.
  Production's log stayed at one line.
- **Product interface:**
  - This session's signed-in AskRigor connector (Claude) returned HRP 20.6.24 (`04bf76e2…`) before the release and
    HRP 20.6.25 (`f3f1d9d2…`) and Universal 20.5.43 (`7f03ddbd…`) after it, with `sign_in: accepted` and
    `research_access: ready`. Its tool list was loaded before the release and still named build `85edacfa`.
  - The ChatGPT app through Codex (connector probe, 18:46 UTC): 33 tools; `get_protocol_manifest` returned HRP 20.6.25
    (`f3f1d9d2f60eb0dd`) and Universal 20.5.43 (`7f03ddbd280a9906`); the first tool's description still named HRP
    20.6.24, Universal 20.5.42 and build `85edacfa`, and `finalize_research` had `recommendations` but no
    `comparison_claims`, so the app's tool list predated the release. The owner's refresh of that app is pending.
- **Custom GPT:** no Custom GPT file changed between `57f07ebd` and `13c26d8f`, so no editor installation was needed.
- **Plugin:**
  - Before: `0.1.0+codex.20261015124639.hrp.20.6.24.universal.20.5.42`, receipts
    `71c9924327f885805597c77d95937dfbb9ff09934d27cab551855bbfe5de157b`.
  - Rollback copy `/home/joel/plugins/askrigor.rollback-20261016T184428Z`.
  - Reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261016184428.hrp.20.6.25.universal.20.5.43`. No packaged file changed apart from the manifest
    version.
  - Source and installed receipts are both `058f5f4ff641dbd8b6a464f9de483768474428ac99c4e2daa656449f51155399`, over 8
    files. Each file's hash equals the release commit's; for the manifest, the commit's with the new version line.
- **Lessons:**
  - Accepted lessons #30 and #31 are marked incorporated in `AskRigor-lessons`, each with a comment saying where it
    lives.
  - `npm run lessons:status` before the release (18:31 UTC): 14 open, 0 needing review, 2 accepted but not
    incorporated (#30 and #31, now incorporated), 17 incorporated or closed, 0 deletion eligible; no unrecorded UDA
    lane item.
- **Second deploy, the check panel (#340, owner question 100):**
  - **Owner decision:** "102: A, merge 340 and deploy now, then I refresh once", typed in the Claude session at 19:28
    UTC (owner question 102: release the panel before the app refresh, so one refresh covers both deploys). Earlier:
    "100a" (18:31 UTC).
  - **Contents:** `finalize_research` declares the UI resource `ui://askrigor/final-check.html` (MCP Apps:
    `_meta.ui.resourceUri`, the legacy `ui/resourceUri` and the alias `openai/outputTemplate`), registered on the
    ChatGPT and Claude catalogs with MIME type `text/html;profile=mcp-app`: a self-contained page (the pinned
    `@modelcontextprotocol/ext-apps` 1.7.5 view bundle inlined, a `textContent`-only render script, CSP `default-src
    'none'`) that shows the final check's verdict, check line, caveats, lanes, studies and communities.
  - **Source:** #340 passed all seven checks on `8f58e6bc` ("Deterministic verification" run 38952442508: 3,421 tests
    passed, 6 skipped), was up to date with main, and merged at 19:29:35 UTC as
    `5c4fc9331e102af13b5e378529e02b41423fb067`; the merge tree equals the PR head tree.
  - **Image:** tag `askrigor-research:5c4fc9331e102af13b5e378529e02b41423fb067`; ID
    `sha256:645f4a3ef27b6f60c59e8629417d44b268648969b6675562c17eec221ae5998a`, user `node`, workdir `/app`; source
    archive SHA-256 `5121ea13e3da12da0a4195beb73d414a2ae7acc59246761f4bcd8f50b0590e49`; image archive 109,656,846
    bytes, SHA-256 `5bcf0d3e302f1bf47ebe77cccc255e9999b623eeddb9f5e8024ff6af6698861e`; the no-secret gate passed as
    above.
  - **Production:** prior image `13c26d8f…`, up 49 minutes, healthy; prior selector `6c79ea21d6a9d6f1`, `runtime.env`
    `bb75139fd00383b5`. The host step ran from a file to the end: checksum verified, loaded ID equals the build ID,
    timer stopped and disabled, rollback names `askrigor-research:rollback-pre-5c4fc9331e10` and
    `/opt/askrigor/rollbacks/pre-5c4fc9331e102af13b5e378529e02b41423fb067`, schema dump 726,578 bytes
    (`3e1597e3d67d3ddf`), migrate complete, `runtime.env` 64 names (`d4c1f691f0454539`), selector `b13265fd93981362`;
    `research-mcp` started at 19:32:28 UTC, healthy, with the same runtime envelope, mounts, networks and one log
    line.
  - **Acceptance (19:32 to 19:35 UTC):** the same public, host, standard-probe, full-text and promotion checks as
    above, all passing on build `5c4fc933`. In addition: `finalize_research` lists all three panel keys with the same
    URI; `resources/list` shows `ui://askrigor/final-check.html` (`text/html;profile=mcp-app`); reading it returns
    338,851 bytes with one script, the CSP and `prefersBorder`; the Gemini catalog's `finalize_research` has no panel
    key. The promotion timer ran at 19:35:10 UTC (`complete`, `no_pending_promotion`, `success`).
  - **Product interface:** the Claude connector returned HRP 20.6.25, `sign_in: accepted`, `research_access: ready`.
    Whether ChatGPT and Claude draw the panel is checked after the owner's app refresh, with the owner regressions.
  - **Reference host (laptop, 19:52 UTC):** the released panel HTML (338,851 bytes, from the merged source) ran in a
    sandboxed frame with an opaque origin inside a minimal host that answered the MCP Apps handshake. The panel sent
    `ui/initialize` (protocol `2026-01-26`) and `ui/notifications/initialized`, received a sample `ready_with_limits`
    result through `ui/notifications/tool-result`, sent `ui/notifications/size-changed`, and drew the verdict, the
    check line, the caveats (a sample containing `<script>` shown as text), the counts, the studies and the
    communities. Whether ChatGPT and Claude draw it is the owner's check after the app refresh.
  - **Plugin:** before `0.1.0+codex.20261016184428.hrp.20.6.25.universal.20.5.43` (receipts `058f5f4f…`); rollback
    copy `/home/joel/plugins/askrigor.rollback-20261016T193407Z`; reinstalled as
    `0.1.0+codex.20261016193407.hrp.20.6.25.universal.20.5.43`, source and installed receipts both
    `77862d5c6b9b922f404b645c5a4227f8d9228a3fe8d86ed8dc20d66f32e599d0` (8 files, equal to the release commit's apart
    from the manifest version).
  - **Lessons:** `npm run lessons:status` before this deploy (19:29 UTC): 14 open, 0 needing review, 0 accepted but
    not incorporated, 19 incorporated or closed, 0 deletion eligible; no unrecorded lane item.
  - **Rollback:** as above, with the `pre-5c4fc9331e10` names (restores build `13c26d8f`); the plugin from
    `/home/joel/plugins/askrigor.rollback-20261016T193407Z`.
- **Product acceptance (owner regressions):** pending the owner's refresh of the ChatGPT app; the regression list runs
  then through Codex, about 60 calls per case, reported in three stages.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-13c26d8f4e938b8f2994b2fb63b7579872061d02`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-13c26d8f4e93`, and check its health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261016T184428Z` and run
     `codex plugin add askrigor@personal`.

  No migration or site change needs reversal. Rollback was not executed.
