# Production release, 2026-11-16 (Atlas cards and pages may link a video that a person named; notice version 6)

- **Owner decision:** owner answer 307b. Question 307 (14 and 15 Nov 2026) asked whether saved findings cards and
  Atlas pages may link a YouTube video that a person named (the asker, someone reporting what worked for them, or the
  owner), with a new free-use notice sentence, and option b added an email telling YouTube. The owner chose b in the
  Inbox on 15 Nov at 00:21 UTC and typed "307b" and "307: send" in chat on 16 Nov at 12:58:40 UTC, in the session
  that released. Not a pure-fix release: it changes the free-use notice (version 6, material) and what is public.
- **Contents:** #478, merged as `ce1d677a0195bc299169b07329b5e0586bf19d21`, whose tree equals the pull request head's
  (`08abbb23`); `main` had not moved since `82f70507`. What it does:
  - A saved findings card and its Atlas page may hold links to YouTube videos that the person's own words named at
    registration (`named_videos`); videos AskRigor finds through YouTube's search stay out, as before; cards still
    hold no YouTube comments. Only the latest registration for the same target counts; a video named after the card
    was saved is not added (a stated limit).
  - Free contributor notice `free-contributor-v6-2026-11-15` (material): free accounts accept it again before free
    research continues; the owner's own login accepts it by the owner's standing instruction of 6 Nov 2026
    (migration 0031). Migration `0036_research_use_notice_v6` lets the notice check admit v1 to v6.
  - Privacy notice and terms: one sentence each on named video links, both effective November 16, 2026 (commit
    `08abbb23`, made before the merge).
  - Not in this release: the owner's two pointers stay in `apps/research-mcp/src/owner-pointers.ts`; making them Atlas
    entries with tags and links is still to do.
  - Rollback scripts `infra/living-evidence-production/research-use-notice-v6-hold.sql` and `-restore.sql`, and the
    rollback hazard in `infra/living-evidence-production/README.md`.

  The tool list is unchanged (35 tools; tool list versions mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`). No role script, compose or settings change: `runtime.env` changes its build line only.
- **Before deploying:** `npm run verify` on `76c1256d` (main merged in at 05:35 UTC): 377 files, 6,961 tests passed,
  6 skipped. `08abbb23` changed only the two pages' dates and four test expectations (the two test files: 42
  passed). Hosted checks on `08abbb23`: all seven passed (read at 13:11 UTC). Codex's review of 15 Nov (six findings)
  and Codex's tests (eight defects) were addressed before the merge; the PostgreSQL contributor-access acceptance, the
  notice v5 and v6 rollback acceptances and the living-evidence acceptance passed on 15 Nov. The private-map check on
  the pushed commit: nothing to refuse.
- **Source and image:** source archive SHA-256 `acd73a578dee6884b21d2f88d6b357b4a4a40c565413b313f052bd64bcc50f89`;
  image built 13:11:21 to 13:12:32 UTC, id `sha256:dea0441f939967f53c5f8f31bffb5764ef9f1594874c8a5fb0af585d8a526ff0`,
  user `node`, workdir `/app`; the disposable candidate answered `/healthz` and `/version` (HRP 20.6.42, Universal
  20.5.46) with one log line and none naming a credential class, and was removed; image archive 122,514,475 bytes,
  SHA-256 `ebd6f4f9f5ca02ea2257960b7c1955c4aecf92e8838f4670335a7b45b8e6c668`.
- **Prior state (stage A, 13:13:51 UTC):** research-mcp on `80ebc006` (the inositol release of 03:21 UTC), healthy;
  the compose overlay and both role scripts the reviewed versions (unchanged by this release); `runtime.env` 90 names;
  the promotion timer enabled; the site on `2e231949`; 62 GB free. Before stage B (13:14:13 UTC): no call for 4,213
  seconds (the newest at 12:04:03 UTC); the call record held 6,926 rows; two accounts; no active database connection
  of the service.
- **Stage B (13:14:20 to 13:15:23 UTC):** the prior files and a database dump (18,096,691 bytes, SHA-256
  `9f2ae109f2fa46c5...`) kept in the rollback folder for this merge; the prior image tagged
  `askrigor-research:rollback-pre-ce1d677a0195`; migrations 0018 to 0036 recorded with the release files' SHA-256 and
  the notice check admitting v6; both role scripts checked unchanged; research-mcp recreated on the new image, started
  13:15:13 UTC, healthy.
- **Stage C (done within a minute after stage B):** `/version` names the build; the public tool list is unchanged and
  all three tool list versions equal their fixtures; the free contributor notice reads `free-contributor-v6-2026-11-15`; the
  protocol loads; the Atlas pages answer through both hosts; the forum reader probe passed; one log line, none with a
  credential-like marker; the promotion one-shot succeeded and the timer is enabled and active.
- **Site (13:17:18 UTC):** the public-site archive of the merge (tar SHA-256
  `939b9a763bd85bcc527629af01c0b88d8eb20de746f4a393642c6ee7c9d963b8`, equal to the separately built one) activated;
  every checked page equals the merge's file; the privacy notice and the terms read "Effective November 16, 2026";
  the Atlas answers through the apex with its security headers.
- **After:** the plugin receipt found no packaged file changed since the live build (no reinstall). The rollback read
  (13:18:09 UTC) found the rollback tag on the image of `80ebc006` and the kept files (runtime.env with 90 lines and
  the prior build line). The email to YouTube (owner's "307: send") went at 13:17:51 UTC as a reply in the API quota
  thread, in the words question 307 showed.
- **Rollback:** the selector and `runtime.env` from the rollback folder, then recreate research-mcp; the migration is
  additive and stays. Hazard (infra README): `80ebc006` cannot read a publication, intent, accepted version or stored
  card that holds `named_videos`, so after the first research that names a video, a rollback needs those rows handled
  first (the README's three read-only count queries); below v6, `research-use-notice-v6-hold.sql` and
  `-restore.sql`. The first research that names a video is the last acceptance step: not yet run at this writing.
