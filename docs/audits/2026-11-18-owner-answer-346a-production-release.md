# Production release, 2026-11-18 (enforcing HRP, stage 1: the findings ledger, on for the development accounts)

- **Owner decision:** 346a, typed in chat on 18 Nov 2026 at 23:27:27 UTC (one message: "340c 343c 344b 345 a 346a 347a
  348a 349a"), in the session that released. The ledger was switched on for the owner's two development accounts by
  the kit's optional stage D, right after the release; nothing changes for any other account.
- **Contents:** #486, merged as `0786b0385b724fafb3272e907e2ba83d3e3a757a` at 23:37:23 UTC at its checked head
  `c379db0a`, straight onto the live build `6a7db605`. At the final check a findings ledger (each finding, whether it
  stops the answer, and the chat's own lineage), and in plan_research what can stop an answer, behind two settings:
  `ASKRIGOR_FINDINGS_LEDGER=on` switches it on and `ASKRIGOR_FINDINGS_LEDGER_ACCOUNTS=dev` (the default) keeps it to the
  development accounts. No migration, no database change, no model call. Role scripts (`bc71b90e`'s), compose, the
  tool lists, HRP 20.6.43 and the site unchanged; no site release.
- **Before deploying:** Codex's final check of the branch ("release", 17 Nov 23:09 UTC, c379db0a, 260 affected tests);
  hosted checks passed.
- **Build and stage A (23:37:43 to 23:39:28 UTC):** research archive 122,706,099 bytes; the new image with no network
  and no setting read the ledger as off (LEDGER_OFF_OK), and on in the probe's own process for a development account
  only; the host on `6a7db605`; role scripts `1649203c…` and `3292cbcf…`; both dossier lines present; no ledger line.
- **Before stage B:** quiet for 12,548 seconds; no active database connection of the service.
- **Stage B (23:40:07 to 23:40:58 UTC):** dump 18,335,469 bytes kept; migrate replayed 0001 to 0038 (nothing new);
  0038's index valid and ready; both role scripts re-run with their unchanged bytes; the dossier boundary 5|0|0|6|0|O;
  both dossier lines kept, no ledger line; research-mcp on the new image from 23:40:48 UTC, healthy, reading the
  ledger as off.
- **Stage C:** build `0786b038` and HRP 20.6.43 served; 35 tools, the three compiled tool lists and the live /mcp list
  equal to the fixtures; the eight site pages equal to the merge's files; LEDGER_OFF_OK in a container of the new image.
  BC_DONE at 23:42:16 UTC.
- **Stage D (23:43:14 to 23:43:31 UTC):** runtime.env kept first as `runtime.env.before-findings-ledger`; both ledger
  lines added (94 names, 92 before); research-mcp recreated, healthy from 23:43:19 UTC; the service reads the ledger on,
  for the development accounts (2). The undo is the kit's `stage-d-undo.sh`.
- **After:** readers-read: `ASKRIGOR_FINDINGS_LEDGER` on, `ASKRIGOR_FINDINGS_LEDGER_ACCOUNTS` dev; plugin receipt: every
  packaged file equal; rollback read: the rollback tag equals `6a7db605`'s image. From outside: GitHub says merged,
  https://mcp.askrigor.com/version reports build `0786b038` and HRP 20.6.43.
- **Not verified:** a real chat on a development account with the ledger on (at the next real research session).
- **Kit:** `/home/joel/askrigor-releases/20261117-486` (made by `make-kit-486.py` from #483's kit). Its image archives,
  and the host's copy in /root, are to be removed after the next release.
