# Production release, 2026-10-17 (final-check friction fixes, a one-line panel, HRP 20.6.26)

- **Owner decision:** "108a 107a", typed in the Claude session at 00:04 UTC on 17 Oct: option A of owner question 108
  (a one-line panel) and option A of question 107 (merge #341 and deploy). Earlier answers: "103 a" (16 Oct, 21:45
  UTC, the corrected copper stress case), "106b 104a" (22:52 UTC: release later, together with 104's move of
  ProposeDiscriminatingTest into a core section). The fixes come from the 16 Oct owner regressions
  (`docs/audits/2026-10-16-report-identity-production-release.md`).
- **Contents (#341):**
  - `finalize_research`'s first call: its description carries the exact JSON shape of every nested part and limit,
    which ChatGPT's app hides from the model (the 16 Oct run: 20 of 21 first calls rejected by the connector's schema
    validation); `full_text_search` and `lab_preparation` simplified to one object each.
  - Key-study links tied by AskRigor's own receipts: a paper's PubMed, Europe PMC and PMC pages once a record, reading
    or audit names its identifiers together, and its publisher landing page from a new `doi_resolution` receipt signed
    by `resolve_doi`; never a host list.
  - `community_searches[].report_identity` accepts one object as well as a list.
  - The panel as one line (question 108): "✓ Checked by AskRigor's final check.", with "The answer states its N
    limits.", or "⚠ Not checked: this answer was given before AskRigor's final check passed."; the resource declares
    ChatGPT's own `openai/widgetDomain` (not `_meta.ui.domain`, which would break the panel in Claude).
  - Question 78's rule enforced: after a correction the user pointed out (`corrections[].by_user`), the answer must
    ask whether AskRigor may send a bug report.
  - HRP 20.6.26: stress case `FormSpecificForumReports` corrected word for word (103), and `ProposeDiscriminatingTest`
    moved, text unchanged, into the core section `HeterodoxEpistemology` after `NoFavoredExplanationPrivilege` (104).
    Universal stays 20.5.43.
- **Source:**
  - #341 passed all seven checks on `e934411c` ("Deterministic verification" run 38984690838: 3,508 tests passed, 6
    skipped), was up to date with main (`1a6e6946`), and merged at 00:08:21 UTC as
    `141c229f787081585e8a9de65ec61a7a285c4727`; the merge tree equals the PR head tree. The one-line panel commit
    `e934411c` was prepared before the owner's answer and fast-forwarded onto #341 after "108a".
  - Protocols: HRP 20.6.26, SHA-256 prefix `e681ed981471a38a`; Universal 20.5.43, prefix `7f03ddbd280a9906`.
  - Unchanged since `1a6e6946`: migrations, deploy, infrastructure, dependencies, plugin package (apart from the
    manifest version) and Custom GPT files.
- **Image:**
  - tag `askrigor-research:141c229f787081585e8a9de65ec61a7a285c4727`; ID
    `sha256:c490a6858ef22b351231dfb7b425b07ca7c492fefee38ed0304ecc57458d4829`, user `node`, workdir `/app`;
  - source archive SHA-256 `1b02dbb73ecea66b73b7a1b19fd23ce90eeb5a82046235132ac0ccfc60186cc2`; image archive
    109,666,730 bytes, SHA-256 `d043ee1b29d164fa17da6bf63d3de3b7c1a5ff230b9f55f42de782aacda7a537`;
  - no-secret gate on the laptop: `/healthz` ok; `/version` HRP 20.6.26 and Universal 20.5.43, build `unknown` without
    the build variable; one log line, naming no credential class; the candidate was stopped and removed.
- **Prior state (00:10 UTC):** `research-mcp` ran `askrigor-research:5c4fc9331e102af13b5e378529e02b41423fb067`, up 5
  hours, healthy; SHA-256 prefixes: selector `b13265fd93981362`, `runtime.env` `d4c1f691f0454539`, `compose.yaml`
  `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`; the promotion timer was enabled, and
  `runtime.env` held 64 names.
- **Production:**
  - The host step ran from a file copied to the host (`ssh -n host bash /root/stage-b-host.sh`), stdin closed for
    every `docker compose` call; it ran to the end.
  - The archive checksum verified; the loaded image ID equals the build ID. The promotion timer was stopped and
    disabled before the switch.
  - Rollback names: `askrigor-research:rollback-pre-141c229f7870` (the prior image, `5c4fc933`) and
    `/opt/askrigor/rollbacks/pre-141c229f787081585e8a9de65ec61a7a285c4727`.
  - Schema dump 926,232 bytes, SHA-256 prefix `93b44daaa981af54`; the migrate operation reported complete.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `f9eee631dad647fe`. Selector prefix
    `62e987cc0c73735e`.
  - `askrigor-research-mcp-1` started at 00:10:43 UTC and was healthy, with the same runtime envelope (`node`,
    read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs), mounts and networks, and one log line with
    no credential-like marker.
- **Acceptance (00:10 to 00:15 UTC):**
  - Public `/healthz` reported `ok`; `/version` reported build `141c229f787081585e8a9de65ec61a7a285c4727`, HRP 20.6.26
    (`e681ed98…`) and Universal 20.5.43 (`7f03ddbd…`). Protected-resource scopes were `research:use` and
    `cases:review`; an unauthenticated POST to `/mcp/claude` answered 401. Anonymous `/mcp` listed 33 tools; the first
    tool's description names HRP 20.6.26, Universal 20.5.43 and the build.
  - The in-container standard probe: 33 unique standard tools and 22 Gemini tools; both manifests returned the new
    versions; `load_protocol`'s HRP index, section `"core"` (one page) and two rules by name were ok;
    `finalize_research` lists the three panel keys; `resources/list` shows `ui://askrigor/final-check.html`, which
    reads back at 337,472 bytes with one script, the CSP and `prefersBorder`; the Gemini catalog's `finalize_research`
    has no panel key. PubMed returned one record with a receipt; the video read completed (3 calls, 61 seconds, 31
    claims); Reddit probes returned `found` and `not_found`; the private state directory had mode 700 and both ledger
    files mode 600.
  - Full text: the Europe PMC section search completed with a receipt and `full_text_scope` `METHODS`; the owner
    library's three DOI probes returned client code `fetched`, as on 16 Oct. Production's log stayed at one line.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot: result `success`, exit 0, `complete` with `no_pending_promotion`. The timer was re-enabled
    with the selector naming the new image; it ran at 00:15:13 UTC (`complete`, `no_pending_promotion`, result
    `success`), next due 00:20:13.
- **Product interface:** this session's AskRigor connector (Claude) returned HRP 20.6.26 (`e681ed98…`), `sign_in:
  accepted` and `research_access: ready`; its tool list was loaded before the release. The ChatGPT app's tool list
  waits for the owner's refresh.
- **Custom GPT:** no Custom GPT file changed between `1a6e6946` and `141c229f`, so no editor installation was needed.
- **Plugin:**
  - Before: `0.1.0+codex.20261016193407.hrp.20.6.25.universal.20.5.43`, receipts
    `77862d5c6b9b922f404b645c5a4227f8d9228a3fe8d86ed8dc20d66f32e599d0`. Rollback copy
    `/home/joel/plugins/askrigor.rollback-20261017T001225Z`.
  - Reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261017001225.hrp.20.6.26.universal.20.5.43`; source and installed receipts both
    `1eedfc3d6ac00412b7ef185c3e8be665ff76a934a9d5b524aff43faa6ff74beb`, over 8 files, each equal to the release
    commit's apart from the manifest version.
- **Lessons:** `npm run lessons:status` before the release (00:05 UTC): 14 open, 0 needing review, 0 accepted but not
  incorporated, 19 incorporated or closed, 0 deletion eligible; no unrecorded UDA lane item.
- **Product acceptance (owner regressions):** pending the owner's refresh of the ChatGPT app; then the regression list
  runs through Codex, about 60 calls per case, three stages, with the first-call rejection rate compared with 16 Oct.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-141c229f787081585e8a9de65ec61a7a285c4727`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-141c229f7870` (build `5c4fc933`), and check its
     health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261017T001225Z` and run `codex plugin add
     askrigor@personal`.

  No migration or site change needs reversal. Rollback was not executed.
