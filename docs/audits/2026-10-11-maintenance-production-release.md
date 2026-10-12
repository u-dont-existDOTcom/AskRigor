# Production release, 2026-10-11 (maintenance)

- **Owner decision:** "69 a merge 304, 305, 306 and 308 and deploy", typed in the Claude session;
  the turn's first clock reading was 03:06:07 UTC. Option A of owner question 69 approved those four merges
  and deploying the research server only. Refresh the plugin only if packaged files change.
- **Contents:**
  - #304: the record of the 2026-10-10 release.
  - #305: five Dependabot updates combined: `pg` 8.23.1, `vitest` 5.0.3,
    `@modelcontextprotocol/sdk` 1.32.1, `pdfjs-dist` 6.4.299 and `@types/node` 24.19.1.
  - #306: pdf.js uses its bundled standard fonts and character maps, with verbosity set to errors only.
    Production had logged a warning after reading a PDF with a non-embedded standard font on 2026-10-10.
    The warning held no user data; the public privacy page says the server "emits only a startup line".
  - #308: `npm run lessons:status` lists UDA lane items missing from the ledger; an AGENTS.md lane section.
  - Held out: #307 (HRP 20.6.16 and `lab_preparation`, owner question 70: A, built and in review),
    #315 (#309 part 2), and new Dependabot PRs #312 and #313.
- **Source:**
  - Each change was brought up to date with main before merging. Each new head's parents were exactly
    the reviewed head and main; all seven checks passed before each merge.
  - #304 merged at 03:06:52 UTC as `34f1db5164d676a4b7b1ba0af7c1ced569afbfc3`.
  - #305 merged at 03:09:56 UTC as `da7fb11360bdddf23f14e95d1db99fcc0ad72420`.
  - #306 merged at 03:12:22 UTC as `6a4394a5b822bdcdc2ec0335c37138747923484e`.
  - #308 merged at 03:15:43 UTC as `030d21b8e5b41acecdaa04974586843b0ab03893`, a true merge
    whose tree equals its tested head `2a0430f8`.
  - GitHub's "Deterministic verification" passed on #308's tested head, whose tree equals the merge. No separate
    laptop run was made on the merge itself; `npm run verify` passed on the #307 branch merged with this main (3,070
    tests).
- **Image:**
  - production tag `askrigor-research:030d21b8e5b41acecdaa04974586843b0ab03893`;
  - ID `sha256:698367c13febf2acca23359c86bd76ea84e2038ccc681beb50fe8e71f723c539`, user `node`, workdir `/app`;
  - source archive SHA-256 `2df3d9484229ec234579215ca4cefe9873b626ee36e1ea694be873affca86a4a`;
  - image archive 109,302,645 bytes, SHA-256 `185001467abd836dfc5e013c5a03f6ce5971780a37666e05d87e63df7fe687c8`;
  - Codex's first no-secret gate asked `/healthz` before the server was listening and got a connection reset.
    It stopped and removed the candidate; it did not check `/version` or the log count, or save the archive.
  - The Claude session reran the same gate: `/healthz` ok after 2 seconds, HRP 20.6.15 and Universal 20.5.37,
    build `unknown` without the build variable, one log line, exit 0. It then saved the archive.
  - Inside the image, `node_modules/pdfjs-dist` contains 16 standard-font files and 169 character-map files.
- **Prior state:**
  - `research-mcp` ran `askrigor-research:8195c324bd1410d259a87d30345a8b1f2ac4c141`, up 14 hours, healthy;
  - SHA-256 prefixes: selector `e1434f7a9fa79667`, `runtime.env` `e6cd4361657c093b`,
    `compose.yaml` `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`.
- **Production:**
  - The archive checksum verified; the loaded image ID equals the build ID.
  - The promotion timer was stopped and disabled; the service was inactive and no promotion runner was present.
  - Rollback names: `askrigor-research:rollback-pre-030d21b8e5b4` and
    `/opt/askrigor/rollbacks/pre-030d21b8e5b41acecdaa04974586843b0ab03893`.
  - Schema dump 510,374 bytes, SHA-256 prefix `6ee009fb10eda266`; the migrate operation reported complete.
  - `runtime.env` retained 64 names, with one build line; new SHA-256 prefix `5212b78f9d00d4f3`.
    Selector prefix `6ba4b7e9d31f9756`.
  - `askrigor-research-mcp-1` started at 03:21:48 UTC and was healthy at 03:21:55.
  - Runtime: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs, one log line.
  - Writable mounts: `/var/lib/askrigor/lesson-incidents`, `/var/lib/askrigor-actions`,
    `/var/lib/askrigor-research-sessions`; networks `askrigor_default` and `askrigor_living_evidence_private`.
- **Acceptance:**
  - Public `/healthz` reported `ok`; `/version` build `030d21b8e5b41acecdaa04974586843b0ab03893`,
    HRP 20.6.15 (`ea4e14bd…`) and Universal 20.5.37 (`342e32e1…`).
  - Protected-resource scopes were `research:use` and `cases:review`;
    an unauthenticated POST to `/mcp/claude` answered 401; anonymous `/mcp` listed 33 tools.
  - The in-container standard probe found 33 unique standard tools and 22 Gemini tools;
    the server title and tool description named the deployed build and current protocols.
  - Both manifests returned: HRP 20.6.15 (2026-10-10), SHA-256 prefix `ea4e14bd50471ef8`,
    and Universal 20.5.37 (2026-10-09), prefix `342e32e1568954ed`; `load_protocol` HRP index was ok.
  - PubMed returned one record with a receipt. Video read completed without an error:
    3 calls, 62 seconds, 27 claims, no sponsorships, duration 05:53.
  - Reddit probes returned `found` and `not_found`; private state directory mode 700, both ledger files mode 600.
  - `askrigor.com` `/privacy`, `/terms` and `/support` answered 200.
  - Promotion one-shot completed with `no_pending_promotion`; the timer was re-enabled and the selector
    named the new image. The next trigger ran at 03:25:12 UTC (complete, `no_pending_promotion`); the one after
    was due at 03:30:09.
- **Full text and the library:**
  - Probe: `scripts/release-fulltext-probe.mjs`, already preserved in the repository.
  - Europe PMC section search completed without a tool error, with a receipt and `full_text_scope` naming
    `METHODS`: "Europe PMC full texts only, about 30% of PubMed records".
  - The owner library was configured; all three DOI probes returned client code `fetched`.
  - `10.1006/bbrc.2001.4945` and `10.1016/s0166-4328(03)00097-4`: `owner_library: indexed`,
    access status `complete`, no error, state `FULL_TEXT_READABLE`.
  - `10.1016/s0887-8994(99)00152-6`: `owner_library: identity_mismatch`, access status `error`,
    retryable `open_full_text_route_failed`, state `PRIMARY_OA_ROUTES_EXHAUSTED`.
  - None of the three results had a signable lead.
  - No pdf.js warning appeared in the probe output; production's log stayed at one line.
    The same three library PDFs had printed eight warnings before #306 on 2026-10-10.
- **Product interface:** the Claude session's signed-in AskRigor connector returned Universal 20.5.37
  (`342e32e1…`), with `sign_in: accepted` and `research_access: ready`.
- **Custom GPT:** no Custom GPT file changed between `8195c324` and `030d21b8` (Action schema, bundle, instructions or
  setup), so no editor installation was needed.
- **Plugin:**
  - No file under `.codex-plugin`, `skills` or `assets` changed between `8195c324` and `030d21b8`;
    the plugin needed no change and was not reinstalled.
  - Version unchanged: `0.1.0+codex.20261010130246.hrp.20.6.15.universal.20.5.37`.
  - Source `/home/joel/plugins/askrigor` and installed
    `~/.codex/plugins/cache/personal/askrigor/0.1.0+codex.20261010130246.hrp.20.6.15.universal.20.5.37`
    receipts both `20f8032b66170ff3202691975cba8e61eb5ea5d97493d3f7692b05924133adc1`.
  - Connector: through the installed plugin, Codex's AskRigor connector listed 33 tools, and read-only
    `get_protocol_manifest` calls returned HRP 20.6.15 (2026-10-10, `ea4e14bd50471ef8`) and Universal 20.5.37
    (2026-10-09, `342e32e1568954ed`), with `sign_in: accepted` and `research_access: ready`.
- **Rollback:**
  1. Stop and disable `askrigor-research-promotion.timer`.
  2. Restore the selector (`/opt/askrigor/living-evidence-image.env`) and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-030d21b8e5b41acecdaa04974586843b0ab03893`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-030d21b8e5b4`, and check its health.
  4. Re-enable the timer against the restored image.
  5. The plugin needed no change; no plugin rollback is needed.

  Rollback execution was not checked in the supplied evidence.

Evidence: `facts.md`, `build-summary.md`, `deploy.out`, `fulltext-probe.out` and `standard-probe.out` in the
release's evidence folder on the laptop. `build-summary.md` records Codex's failed first gate; `facts.md` records the
Claude session's rerun and the saved archive. The timer runs, the Custom GPT file check and the plugin connector check
were made by the Claude session after the record was drafted.
