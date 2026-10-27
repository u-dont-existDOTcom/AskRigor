# Production release, 26 October (the fixes from the regressions of 25 to 26 October, #375)

- **Owner decisions:** "182. a ... 183. b 184. a 185. b" (read at about 13:05 UTC on 26 Oct, owner questions page).
  185b: release the regression fixes now and run the regression list; the Atlas navigation (183b) goes in a later
  release with its own run. 182a: publish 14 of the owner's 16 cards (not ARF-0048, whose leads rest on a private book,
  nor ARF-0012, whose findings all come from YouTube comments). 184a: five regression cases get their study in the
  prompt.
- **Source:** [#375](https://github.com/u-dont-existDOTcom/AskRigor/pull/375) passed all seven checks on `5f196a62` and
  merged as `ddba2b7960dfe6c46a8f3ece6eabfc187c46e611` onto main `997cb426`; the merge tree equals the PR head tree.
  Contents:
  - the fixes for the judgment of the 25 to 26 Oct run (`docs/audits/2026-10-26-owner-regressions-judgment.md`):
    - the final check tells this turn from an earlier one by its round token (`4ae45ddd`, `2bd16f3c`);
    - steps no call can close this turn (`61814997`);
    - collapsed caveats and five small defects (`c3f52ce2`);
  - `publish_cards` publishing the owner's cards saved before the `public_value` declaration (`79ab63bf`; on the
    first try 13 of the 14 cards chosen in 182a were refused as `not_public`);
  - the regression list's five study-given cases (`5f196a62`).

  No migration, grant, site, Codex plugin or Custom GPT file changed. HRP 20.6.31 and Universal 20.5.46. Tool
  descriptions changed (`finalize_research`'s `carried_state` and `proposed_tests`, the plain-answer note), so the tool
  list version changed and connected apps are asked to refresh.
- **Tests:** each change ran `npm run verify` before its merge into the next build (4,866 tests at the last, 6
  skipped), and CI's deterministic verification passed on the PR head.
- **Image:**
  - ID `sha256:fb8c3fbfcf22cfcc9943a93bb598871b1e192829c27991874a038f2e81878f87`, user `node`;
  - source archive `4aa7b921f8211737...`;
  - image archive `e249aa32bc947c26...`, 124,219,152 bytes;
  - the no-secret candidate answered health and version with one log line and no credential marker.

  The first two build attempts timed out in `npm ci` while a backup on the laptop held the connection (ETIMEDOUT
  after 351 and 794 seconds). The third, started when the backup ended at 13:47 UTC, built.
- **Stage A (14:11 UTC):** the image archive and both unchanged role scripts were copied to the host; the first copy
  had lost its connection part way and was replaced whole. Prior state: `research-mcp` on `997cb426`, healthy;
  `runtime.env` with 73 names and the 8 Atlas lines; the promotion timer enabled.
- **Stage B (14:11:37 to 14:11:48 UTC):**
  - the image loaded with the built ID, and the timer was stopped;
  - the prior image was tagged `askrigor-research:rollback-pre-ddba2b7960df`, with rollback copies and a `pg_dump`
    (4,985,170 bytes, `903dddc5f1d34646`) in `/opt/askrigor/rollbacks/pre-ddba2b7960dfe6c46a8f3ece6eabfc187c46e611/`;
  - `migrate` changed nothing (0018 to 0023 with the same hashes);
  - both unchanged role scripts re-ran, and each role's rights are exactly its script's (25 and 11 functions; the
    reader still cannot read held YouTube findings and reads the 7 Atlas tables);
  - only the build line of `runtime.env` changed;
  - the selector named the new image, and `research-mcp` was recreated, healthy.
- **Stage C (14:12 UTC):**
  - the public and in-image checks passed: build `ddba2b79` in `/version`, 33 tools, both manifests, the panel, the
    review actions, notice v4, the round limit 10, the Atlas review open with pages and participation on, and the
    full-text probes;
  - the hardened promotion oneshot ran once on the release's image (success, nothing pending), and the timer is back
    on (next trigger 14:15:09 UTC).
- **Codex plugin:** this release changed no packaged plugin file, and the installed package
  (`0.1.0+codex.20261022222738...`) equals the release commit's 8 packaged files byte for byte (version line aside), so
  there was no reinstall.
- **After the release:** the 13 remaining cards of 182a were published at about 14:14 UTC (P-1003 to P-1029, 27 findings,
  all "Not checked by supervisors yet"). With ARF-0240's two (P-1001, P-1002, 13:07 UTC), the Atlas shows 29 findings;
  their pages answer at `/atlas/findings/P-…`. The regression run (85 cases, the five of 184a included) starts by itself
  when the owner's ChatGPT app shows build `ddba2b79` (`/home/joel/askrigor-releases/20261026-fixes`, the poller probes
  every 8 minutes for up to 6 hours).
- **Rollback:** the selector line back to `askrigor-research:997cb4269815247f3a0d3699c6025ac643907524` (tagged
  `rollback-pre-ddba2b7960df`), the build line back, and `research-mcp` recreated; no database change to undo.
