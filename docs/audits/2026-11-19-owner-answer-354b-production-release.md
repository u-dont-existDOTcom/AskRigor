# Production release, 2026-11-19 (the server fixes split from #488: forum readers, large results, #475, #484)

- **Owner decision:** 354b, typed in chat on 19 Nov 2026 at 13:23:18 UTC in the owner's main session, answering
  question 354 ("Release the server fixes that have nothing to do with named people?"), option b: first limit the card
  request to answers that can hold a finding (one small change and one more review), then release. That change is
  80e1ffc6; Codex's review of it said "release". The release was run by the main session's release helper.
- **Contents:** #491, merged as `263048eb610a38bdda4232c7925444776340e991` at 14:01:37 UTC at its checked head
  `80e1ffc6`, straight onto the live build `0786b038`. The nine non-Atlas fixes of #488 unchanged (the forum readers'
  coverage wording and counts and the signed Reddit continuation, large results, #475's card reminder, #484's "unknown
  language" wording) and two fixes made after Codex's reviews of 19 Nov: `9604b8a7` (a forum-only answer is asked for
  its card too) and `80e1ffc6` (only when it can hold a finding: a forum read counts with a literature search passed in
  the same call; a simple question about a thread is not asked). Research-server code only: no migration, nothing new
  stored in the database, no new secret; role scripts (`bc71b90e`'s), compose, the tool lists, HRP 20.6.43 and the
  site unchanged; no site release. One new setting, `ASKRIGOR_DECLARE_RESULT_SIZES`, stays unset, so the published
  tool lists are the frozen ones. #487 and #488 are not part of it.
- **Before deploying:** Codex's review of `80e1ffc6` (19 Nov 13:46 UTC: no P0 or P1, "release" for the whole branch;
  one P2 left open: the changed forum regressions exercise `save` only, not `offer`), after its recheck of `9604b8a7`
  ("release"); hosted checks passed (Deterministic verification, CodeQL, workflow-policy). Main was still `0786b038`
  and the head `80e1ffc6`, mergeable and clean, right before the merge.
- **Build and stage A (14:01:55 to 14:04:25 UTC):** the merge tree equals the PR head tree; image
  `sha256:eb514fc9…` (user node); research archive 122,723,199 bytes; the candidate healthy with no credential-like
  log line (its /version says build "unknown", as #486's and #481's did: the build comes from runtime.env); the new
  image with no network and no setting read the ledger as off (LEDGER_OFF_OK); render: role scripts `1649203c…` (37
  functions) and `3292cbcf…` (18), migrations through 0038, migrations and production infra files as `0786b038`'s;
  the host on `0786b038`, compose `15d3cc3a`, both dossier lines, both ledger lines, no result size line.
- **Before stage B:** quiet for 2,253 seconds at 14:05:05 and 2,288 at 14:05:40, right before it; no call in the last
  15 minutes; no active database connection of the service.
- **Stage B (14:05:43 to 14:06:35 UTC):** rollback tag `askrigor-research:rollback-pre-263048eb610a` made from
  `0786b038`'s image (`320e86e8adda`) before anything changed; dump 18,365,934 bytes kept; migrate replayed through
  0038 (nothing new); 0038's index valid and ready; both role scripts re-run with their unchanged bytes (exactly 37
  and 18 functions); the boundaries as for #486; dossiers 5|0|0|6|0|O; runtime.env's build line only (94 names);
  both dossier lines and both ledger lines kept, no result size line; research-mcp on the new image from 14:06:24 UTC,
  healthy, reading dossiers and the privacy reading on, the ledger on for the development accounts, no result size line.
- **Stage C:** build `263048eb` and HRP 20.6.43 served; 35 tools, the three compiled tool lists and the live /mcp list
  equal to the fixtures; the eight site pages equal to the merge's files; LEDGER_OFF_OK in a container of the new
  image; the forum reader READER_OK; the panel 352,320 bytes; one promotion run completed and its timer on again
  (PROMOTION_OK). BC_DONE at 14:08:40 UTC.
- **After:** readers-read: the dossier privacy reading on, `ASKRIGOR_RESEARCH_DOSSIERS` enabled, the planner on,
  `ASKRIGOR_FINDINGS_LEDGER` on, `ASKRIGOR_FINDINGS_LEDGER_ACCOUNTS` dev, `ASKRIGOR_DECLARE_RESULT_SIZES` not set; plugin
  receipt: no packaged file changed since `0786b038`, both installed copies equal; rollback read: the rollback tag
  equals `0786b038`'s image, and the kept runtime.env and selector name `0786b038`, with both dossier lines, both
  ledger lines and no result size line. From outside (14:10:06 UTC): GitHub says merged,
  https://mcp.askrigor.com/version reports build `263048eb` and HRP 20.6.43.
- **Rollback (not used):** to `0786b038` as the kit's README says: stop and disable the promotion timer, restore
  living-evidence-image.env and runtime.env from `/opt/askrigor/rollbacks/pre-263048eb610a38bdda4232c7925444776340e991`,
  recreate only research-mcp, check its health and /version, enable the timer again. Nothing in the database to undo;
  never migrate or run a role script for it. Since the switch a Reddit continuation the earlier build issued is
  refused, so that reading starts again; after a rollback one the new build issued is expected to be refused (not
  tested against the earlier image).
- **Not verified:** a real research chat through the new readers' wording and the card request (at the next real
  research session); the `offer` path of the card request beyond Codex's direct checks (its P2).
- **Kit:** `/home/joel/askrigor-releases/20261119-491` (made by `make-kit-491.py` from #486's kit, with #487's kit
  fixes: the rollback tag and PROMOTION_OK). #486's image archives and the host's copy in /root can now go (its record
  said after the next release); not removed by this release.
