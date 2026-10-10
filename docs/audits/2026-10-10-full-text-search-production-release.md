# Production release, 2026-10-10 (full-text search)

- **Owner decision:** "A: merge 302 and 303 and deploy", typed in the Claude session; the first clock read of
  that turn was 12:44:56 UTC. Option A approved merging the prior release record, then the full-text search
  change, deploying the research server only, refreshing the Codex plugin for HRP 20.6.15, and writing this record.
  Option B was not chosen; the five Dependabot updates stay for a separate release.
- **Contents:**
  - #302: the record of the 2026-10-09/10 release.
  - #303: full-text search version 1 (owner question 64: A), HRP 20.6.15 (owner question 65: A),
    InfoAccess error codes for the owner library, and privacy data map wording.
  - The data map covers the full-text receipt claim and request-local `full_text_search` declaration.
    Nothing new is stored; the public privacy page is unchanged.
  - No migrations, no site change.
- **Source:**
  - #302 merged at 12:46:05 UTC as `4fa8e26778f2db4e07f69e9444690e199f039f4d`; head `524ac4f3` was up to date,
    with checks passing.
  - #303 was brought up to date as `d3448ee5293f5f50f22dce7629e45c8c23480f7a`. All seven checks passed:
    Deterministic verification, workflow-policy, CodeQL and four Analyze jobs.
  - #303 merged at 12:50:06 UTC as `8195c324bd1410d259a87d30345a8b1f2ac4c141`, a true merge whose tree equals
    `d3448ee5` (`git diff --quiet M^2 M`).
  - On the laptop, `npm run verify` passed on `915f747e`: 221 test files, 3,018 tests, typecheck and build.
    This was before the update merge, which added only the documentation record; it was not a laptop run on
    the final merged commit.
- **Image:**
  - production tag `askrigor-research:8195c324bd1410d259a87d30345a8b1f2ac4c141`;
  - ID `sha256:458a9d657fdadae84d08630d56a9ca845b0f4ddb1476a9e169265b6443157613`, user `node`, workdir `/app`;
  - source archive SHA-256 `9d111f0995fd3e0a8e43de239394efb228f8c59fba38dcdcb42545362256564a`;
  - image archive 109,113,647 bytes, SHA-256 `0925a00c3a5ad10747716ffd46f1bf34ba9814eb85622cee09f75bfeadd27b10`;
  - no-secret gate passed: `/healthz` ok, HRP 20.6.15 and Universal 20.5.37, one log line.
    The candidate's `/version` build was `unknown`; it was stopped and removed after the checks.
- **Prior state:**
  - `research-mcp` ran `askrigor-research:03fb5214f9b8ec853f4216ebf7ec68e8a937cadb`, up 13 hours, healthy;
  - promotion timer enabled, service inactive;
  - SHA-256 prefixes: selector `0b0d0940ff5b412b`, `runtime.env` `f7babed7c26db628`,
    `compose.yaml` `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`.
- **Production:**
  - the archive checksum verified; the loaded image ID equals the build ID;
  - the promotion timer was stopped and disabled, the service was inactive, and no promotion runner was present;
  - rollback names: `askrigor-research:rollback-pre-8195c324bd14` and
    `/opt/askrigor/rollbacks/pre-8195c324bd1410d259a87d30345a8b1f2ac4c141`;
  - schema dump 510,374 bytes, SHA-256 prefix `82a9935d11318dec`; the migrate operation reported complete;
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `e6cd4361657c093b`.
    Selector prefix `e1434f7a9fa79667`;
  - `askrigor-research-mcp-1` started at 12:59:00 UTC and was healthy at 12:59:07;
  - runtime: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs, one log line;
  - writable mounts: `/var/lib/askrigor-actions`, `/var/lib/askrigor-research-sessions`,
    `/var/lib/askrigor/lesson-incidents`; networks `askrigor_default` and `askrigor_living_evidence_private`.
- **Acceptance:**
  - public `/healthz` reported `ok`, service `askrigor-research`, version `0.1.0`;
  - `/version` build `8195c324bd1410d259a87d30345a8b1f2ac4c141`, HRP 20.6.15 (2026-10-10),
    SHA-256 `ea4e14bd50471ef8305bc93a2c9a85537bbbe1b99c24faf773b899d12eb41ace`,
    and Universal 20.5.37 (2026-10-09), SHA-256 `342e32e1568954ed62a8b53d75d1ad0efe39cba8d9ad7d143658f02dded169bb`;
  - protected-resource metadata for `/mcp` names `https://mcp.askrigor.com/mcp`, with scopes
    `research:use` and `cases:review`; an unauthenticated POST to `/mcp/claude` answered 401;
  - anonymous `/mcp` listed 33 tools. `search_europe_pmc` names section fields and `full_text_scope` in its
    description and output schema; `finalize_research` takes `full_text_search`;
  - `scripts/release-in-image-probe.mjs`: 33 unique standard tools, 22 Gemini tools, both manifests,
    `load_protocol` ok, one PubMed record with a receipt, and one video read on the unbilled Gemini key
    (complete, 2 calls, 46 seconds, 25 claims, no sponsorships, duration 05:53);
  - Reddit probes returned `found` and `not_found`; private state directory mode 700, both ledger files mode 600;
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200. No site installation was part of this release;
  - promotion one-shot completed with `no_pending_promotion`; timer re-enabled. Its next trigger ran at 13:05:04 UTC
    (complete, `no_pending_promotion`), and it ran again at 13:10 and 13:20; the next trigger was 13:25:05.
- **Full text and the library:**
  - the new probe is preserved as `scripts/release-fulltext-probe.mjs`, copied from `fulltext-release-probe.mjs`;
  - Europe PMC section search completed without a tool error, with a receipt and `full_text_scope` naming
    `METHODS`: "Europe PMC full texts only, about 30% of PubMed records";
  - the owner library was configured. All three test DOIs (`10.1006/bbrc.2001.4945`,
    `10.1016/s0887-8994(99)00152-6`, `10.1016/s0166-4328(03)00097-4`) returned client code `unavailable`,
    `owner_library: error`, access status `error`, and retryable `open_full_text_route_failed`;
  - each result was `PRIMARY_OA_ROUTES_EXHAUSTED`, with no signable lead. These probes did not retrieve full text;
  - separately, the Claude session's own InfoAccess connector asked for the green-tea paper
    (`10.1006/bbrc.2001.4945`) at about 04:55 UTC. Its free PDF tool returned `retrieval_failed`, with no charge;
    before the codes, on 2026-10-09, it said `request_failed`. The in-container client reports only the mapped code,
    `unavailable`, so which InfoAccess code the other two papers got is not recorded.
- **Custom GPT:** this release changed no Custom GPT file (Action schema, bundle, instructions or setup), so no editor
  installation was needed. Its tools get HRP 20.6.15 from the server.
- **Product interface (Claude connector, 13:23 UTC):**
  - through the Claude session's own signed-in AskRigor connector, `get_protocol_manifest` returned HRP 20.6.15
    `ea4e14bd…`, with `sign_in: accepted` and `research_access: ready`;
  - a section search returned `full_text_scope` (`METHODS`) and a receipt carrying `ft=METHODS`;
  - that session had loaded its tool list before the deploy, so the list still showed HRP 20.6.14 and the old search
    description. A chat sees the new descriptions and the `full_text_search` field only after its tool list
    refreshes.
- **Plugin:**
  - before: `0.1.0+codex.20261010001203.hrp.20.6.14.universal.20.5.37`;
    matching source and installed receipt `48b985a224aa5d07da484b908433e451313854eb4ebeedadf6937329a0ed92f3`;
  - rollback copy `/home/joel/plugins/askrigor.rollback-20261010T130246Z`;
  - reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261010130246.hrp.20.6.15.universal.20.5.37`;
  - source and installed receipts both `20f8032b66170ff3202691975cba8e61eb5ea5d97493d3f7692b05924133adc1`.
    All packaged bytes equal the specified commit apart from the authorized manifest version; no files removed;
  - 8 files covered: `.codex-plugin/plugin.json`, both SVG assets, `skills/askrigor/SKILL.md`, and all four
    browser-archive-downloading files (`GVSU-REFERENCE.md`, `SCENARIOS.md`, `SKILL.md`, `SUCCESS-PROFILE.json`);
  - connector: 33 session tools; one read-only HRP manifest call succeeded, 20.6.15 `ea4e14bd50471ef8`.
    The summary does not record a Universal manifest call through the refreshed connector;
  - receipts and registration snapshots recorded in `/tmp/askrigor-plugin-refresh-8195c324`;
  - lesson queue at refresh: 3 open, 3 need review, 0 accepted pending incorporation, 5 incorporated/closed,
    0 deletion eligible.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-8195c324bd1410d259a87d30345a8b1f2ac4c141`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-8195c324bd14`, and check its health.
  4. Re-enable the timer against the restored image.
  5. For the plugin, restore `/home/joel/plugins/askrigor.rollback-20261010T130246Z` and run
     `codex plugin add askrigor@personal`.

  No new migration or site change needs reversal. Rollback execution was not checked in the supplied evidence.

Evidence: `facts.md`, `build-summary.md`, `deploy.out`, `fulltext-probe.out`, `standard-probe.out` and
`plugin-summary.md` in the release's evidence folder on the laptop. The timer runs, the Custom GPT file check and
the Claude connector checks were made by the Claude session at about 13:23 UTC.
