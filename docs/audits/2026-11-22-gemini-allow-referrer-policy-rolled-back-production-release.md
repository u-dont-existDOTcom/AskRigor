# Production release attempt, 2026-11-22 (release E: Gemini's sign-in Allow fix, #511), rolled back

- **Owner decision:** `405a`, typed in the coordinator session's chat on 22 Nov 2026; the clock read
  13:35:13 UTC as that turn began. Question 405 (owner-pages `askrigor/OWNER-QUESTIONS.md#q405`), option a: "Release
  the fix after the release now running, with the sign-in step log on for your next try." Covered: merging #511,
  deploying it, and adding `ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled` to runtime.env (fixed stage and outcome names
  only). Nothing else.
- **What changed for people: nothing.** The release went live at 14:24:23 UTC and was rolled back at 14:29:58 UTC,
  because its one release check failed in production: Gemini's sign-in pages still reach the browser with
  `Referrer-Policy: no-referrer`, so Allow would still be refused after a good login. The sign-in step log was never
  turned on. Production runs release D (2975ed0d) again, exactly as before (its selector and runtime.env have the same
  SHA-256 as before release E).
- **Why the fix did not reach the browser:** the container answers with `Referrer-Policy: same-origin`, as #511 makes
  it (read inside the container, bypassing Caddy). But the production Caddy configuration, in
  the `{$ASKRIGOR_HOSTNAME}` (mcp.askrigor.com) site block, sets `header { ... Referrer-Policy "no-referrer" }` on every
  response, and Caddy's `header` replaces the app's value. For #511 to work, that line must yield to the app: for
  example `?Referrer-Policy "no-referrer"` (set only when the app sets none; the Atlas block already uses `?` for the
  same reason), or an exception for `/oauth/gemini/*`. That is a production Caddy change, which 405a does not cover.
- **Contents:** one merge. **#511**, merged at 13:46:56 UTC as `fabf1ea2cb0f66e67dbb649bcf76681f640c643f` (parents
  `2975ed0d`, release D's merge, and `72daca8f`, the checked head: GitHub's update-branch merge of main into
  `39af710a` at 13:37:53 UTC, whose diff against main is `39af710a`'s own change). Every page of Gemini's sign-in is
  served with `Referrer-Policy: same-origin`, not `no-referrer` (`apps/research-mcp/src/gemini-sign-in/provider.ts`,
  `setPageHeaders`), plus tests. #512 was not merged before it. Unchanged against `2975ed0d` (read-only git):
  migrations and postgres.ts, infra/ (compose `15d3cc3a`, both role scripts release b's), every Dockerfile, compose
  file and package.json, the lockfile, .nvmrc, the protocols (HRP 20.6.45, Universal 20.5.46), the site and ops/, the
  plugin's packaged files, the tool-list fixtures (35 tools).
- **Before deploying:** GitHub's seven checks passed at `72daca8f` (Deterministic verification, CodeQL, four Analyze
  jobs, workflow-policy); no review, review thread or comment; the private-map check over the two commits found nothing
  to refuse; main read right before the merge (`2975ed0d`).
- **Source and image:** image `sha256:e2d30a2cf00802cd6db8d71ddd30a83f81f7f58ffda14669832b045cbb847a44` (archive
  123,622,912 bytes) from an exact `git archive` of M. On the image, no network, no setting: CANDIDATE_OK (HRP 20.6.45
  in /version), RELEASE_E_PROBE_OK (setPageHeaders gives `same-origin`, `no-store`, `DENY`, `nosniff`; the error page is
  AskRigor's), and the earlier releases' probes (LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK,
  PERSON_MARK_PROBE_OK, SAFETY_LIMITS_PROBE_OK, SAFETY_LIMITS_LIVE_OK, RELEASE_D_PROBE_OK), SERVICE_READS_OK.
- **Waiting for release D:** release E's host steps began only after release D had finished (14:05:43 UTC: its
  acceptance, plugin receipt and rollback read recorded, its record draft written).
- **Prior state (stage A, 14:05:54 UTC):** research-mcp on `2975ed0d`, healthy; runtime.env 103 names with the dossier,
  ledger, #501's four and release b's four mark lines and release C's `ASKRIGOR_SAFETY_LIMITS=on`, as written; no step
  log line and no other Gemini sign-in line; PRECONDITIONS_OK. From outside, the interaction page answered 400 with
  `referrer-policy: no-referrer`.
- **Waiting for quiet (14:06 to 14:23 UTC):** a ChatGPT user's research on `/mcp` (calls up to 14:17:26); 373 quiet
  seconds at 14:23:39.
- **Stage B (14:23:43 to 14:24:31 UTC):** the rollback tag `askrigor-research:rollback-pre-fabf1ea2cb0f` = 2975ed0d's
  image; the image loaded; READER_OK; the rollback folder with a dump; the timer stopped; migrate (nothing new); both role
  scripts re-run (the same bytes); the database checks as release D's; runtime.env's build line only; **the switch:
  research-mcp on M from 14:24:23 UTC, healthy**; the same setting names, mounts and readings. STAGE_B_DONE.
- **Stage C (to 14:26:12 UTC):** `/version` names M with HRP 20.6.45; 35 tools equal to the fixture; the 9 site pages
  equal M's; the three compiled tool lists equal; RELEASE_E_PROBE_OK in the live container; PROMOTION_OK. STAGE_C_DONE.
- **Acceptance (14:26:21 to 14:27:05 UTC): ACCEPTANCE_NOT_OK.** Everything else passed: MANIFESTS_OK; 35 tools; the four
  Gemini metadata addresses and the resource metadata 200 with issuer `https://mcp.askrigor.com/oauth/gemini`;
  `/mcp/gemini` without a token initializes; a made-up token gets 401 naming the resource metadata; USER_COUNT_OK;
  ATLAS_SIGNED_OUT_OK; the write-ups' route 404; `/how-to-research` 200; on the host, every kept line as written. The
  release's own check failed: `GET https://mcp.askrigor.com/oauth/gemini/interaction/zzzz` answered AskRigor's error
  page with `referrer-policy: no-referrer`.
- **Rollback (14:29:47 to 14:30:14 UTC), at 741 quiet seconds:** runtime.env and the selector put back from the
  rollback folder (they had differed in the build line only); **research-mcp on 2975ed0d from 14:29:58 UTC, healthy**;
  the same setting names, mounts and readings; `/version` names 2975ed0d; 35 tools; the promotion ran at 14:30:13 on
  2975ed0d's image (success) and the timer is on. The selector's and runtime.env's SHA-256 equal stage A's.
- **Not done:** stage D (the step log was never written), the second acceptance, a new connector probe (production is
  release D's build, which release D's probe read at 14:04 UTC). The plugin receipt (14:31 UTC): no packaged file
  changed; the source and installed copies equal the merge's (receipt `23afe4908e5a8425…`); no reinstall.
- **The way forward:** main keeps #511 (production runs `2975ed0d`). Once the Caddy line yields to the app (an owner
  decision), the release can switch again without a new build: M's image is loaded on the host, its archive is in
  /root, and the rollback tag and folder for `fabf1ea2` are kept, so the kit's stage B (after a quiet window), stage C,
  acceptance, then stage D (the step log on for the owner's Gemini test, off after it) can run as written.
- **Kit:** `/home/joel/askrigor-releases/20261122-release-e/` (README-RELEASE.md, RESULT.md, every log).
