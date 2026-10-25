# Production release, 2026-10-25 (the Atlas, decision 171; held YouTube findings, 173 and 175; owner answers 165a to 176a)

- **Owner decisions:**
  - **176a** (read at about 15:14 UTC on 25 Oct, owner questions page): one release with everything, question 167's
    build included. With it: "don't delete teh summaries unless YT tells us to do that", so the held YouTube findings
    have no expiry.
  - **175: send** (read at 17:31 UTC): approves the email to YouTube and the privacy page's paragraph on the held
    summaries, word for word. The release merged and deployed only after it, since the paragraph goes on the live page.
  - Built under earlier answers: 165a and 174a, 166a, 168a and 171 (with its six defaults), 170, 172a, 173.
- **Contents (#367):**
  - **The Atlas (171):** the free contributor notice v4 (`free-contributor-v4-2026-10-25`, migration 0020); free
    cards published at their save, labelled "Not checked by supervisors yet" (migration 0021); the public pages under
    `/atlas`; sign-in, votes and comments, built and switched off until the Auth0 client secret is on the server
    (migration 0022); the regression runs' card-save switch (migration 0023).
  - **Held YouTube findings (173, 175):** findings drawn from YouTube comments are kept apart from cards for the
    owner's review, never published, with no expiry; one owner action deletes them all, only with `confirm: true`
    (migration 0019).
  - **Atlas phase 3** (migration 0018), the 43 colon-form caveats (165a, 174a), worked-out audit figures (166a), the
    limit of 10 check rounds (172a), the regression fixes of 22 and 23 Oct, and Dependabot #342, #343 and #362.
- **Source:**
  - #367 passed all seven checks on `40eec7e8` (Deterministic verification with CI's PostgreSQL steps,
    workflow-policy, CodeQL and its four analyses). It merged as `0da58528d5f2cd77764d3dd7f6900cd05c16c4b9` onto main
    `1582f063`, and the merge tree equals the PR head tree.
  - **Protocols:** unchanged. HRP 20.6.31 (`29269d656e73c70b...`) and Universal 20.5.46 (`e313306b09da7e35...`).
  - **Changed beyond the server:** migrations 0018 to 0023 (`8fb4a529be8a8f07`, `f05417688f3c6fb7`,
    `e50d9a7dcf4be29a`, `f52a42ebd1a31f2a`, `0d4470f17430b015`, `bac8819c033c11b6`); both role scripts (review
    `af58b9c9a68cae9d`, access `bab9b92a3797eaf0`); the notice-v4 hold and restore scripts; the privacy page and the
    terms, effective October 25, 2026; the public site's `/atlas` route and its installer.
  - **Unchanged:** no Codex plugin packaged file and no Custom GPT file (bundle and OpenAPI schema).
- **Tests before the deploy (the laptop):**
  - On `37ead197`: `npm run verify` passed (4,817 tests, 6 skipped), with `test:site` and `test:site-deploy`.
  - On `40eec7e8`, whose tree the merge equals (16:08 UTC): `contributor-access:postgres-acceptance` passed (84
    checks, migrations 0001 to 0023, each role's functions, the held findings, publications, votes and comments) and
    `contributor-access:notice-v4-rollback-acceptance` passed.
  - CI's database steps, run locally against PostgreSQL 17.6 on `0cf6341a`: the living-evidence acceptance (42
    checks) and pilot, and the Community Forum lab and acceptance. A first local run failed only on a stale build of
    the packages; CI builds them in `npm run verify` first.
- **Image (built on the laptop from the merge):** tag `askrigor-research:0da58528d5f2cd77764d3dd7f6900cd05c16c4b9`;
  ID `sha256:da3de8275766945af25d506a43876fd31b7dc922eccb8c9dc05bd881e450698f`, user `node`, workdir `/app`; source
  archive `18619cbe7e12fc42...`; image archive `ecd81948c051296d...`, 123,836,479 bytes. The disposable no-secret
  candidate answered health and version (HRP 20.6.31, Universal 20.5.46) with one log line and no credential marker.
- **Stage A (17:36 UTC, read-only):** production served `1582f063`, healthy; both role scripts on the host were the
  reviewed versions (`86577a5e...`, `6293861e...`); `runtime.env` had 66 names; the site was `1582f063`'s; 66 GB free.
- **Stage B (17:36:23 to 17:36:37 UTC):**
  - the image loaded with the built ID; the promotion timer stopped; the prior image tagged
    `askrigor-research:rollback-pre-0da58528d5f2`; the selector, `runtime.env`, both Compose files and both role
    scripts copied to `/opt/askrigor/rollbacks/pre-0da58528d5f2cd77764d3dd7f6900cd05c16c4b9/`; a `pg_dump` of
    `living_evidence` (4,088,659 bytes, `ab73e6c973974fcf...`);
  - `migrate` recorded 0018 to 0023 with the release files' hashes, and the notice check admits v4;
  - both role scripts ran from the release's bytes (review 27 grants, access 17). Each role may run exactly its
    script's functions (review 25, access 11); the review role holds no table, column or sequence right; the access
    role holds exactly its three tables' rights and the ten account columns it may update; the reader cannot read the
    held YouTube findings and can read the seven Atlas tables;
  - `runtime.env` gained the build line, the Atlas Auth0 client ID and three server-made secrets (the proxy secret,
    the session key and the participant secret: 32 random bytes each in canonical base64url, never printed, checked
    different from each other and from the identity secret), 70 names in all; the pages and votes stayed off;
  - the selector named the new image and `research-mcp` was recreated, healthy.
- **Stage C (17:36:57 UTC):**
  - public: health; version and build `0da58528`; the protected-resource document; 401 for an unauthenticated
    `/mcp/claude`; the anonymous catalog's 33 tools with the build in the first description; the site's pages 200;
    `/atlas` 404 while off;
  - the container: user `node`, read-only root, all capabilities dropped, `no-new-privileges`, 1 GiB, 256 pids, one
    log line and no credential marker;
  - the in-image probes: 33 tools, both manifests, the final check's panel and inputs, notice v4, the 14 new review
    actions, `set_findings_save`, the round limit 10, the Atlas review open, pages and votes off, PubMed, Reddit and
    the full-text routes;
  - the promotion service ran once by hand (both queues `no_pending_promotion`) and the timer was re-enabled (next
    17:40:03).
- **Stage D (17:37:38 UTC):** `ASKRIGOR_ATLAS_PAGES=enabled` (71 names; rollback copy `runtime.env.before-pages`),
  `research-mcp` recreated, healthy. Directly on `mcp.askrigor.com`: `/atlas`, the stylesheet and `/atlas/changes`
  200; an unknown finding, an unknown path and the sign-in route 404; the pages' policy
  (`default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none';
  object-src 'none'`), `nosniff`, `DENY`, and no cookie.
- **Public site (17:38 UTC):** the merge's archive (tar `4fa86cea636202f1...`, equal to a separately built one;
  archive `44add2ba12b8f243...`; installer `72e529d5b9755c69...`) installed with `ASKRIGOR_ATLAS_UPSTREAM=research-mcp:3000`
  and the proxy secret read on the host from `runtime.env`. The home, privacy, terms and support pages equal the
  merge byte for byte; the privacy page and the terms read "Effective October 25, 2026". `askrigor.com/atlas`, its
  stylesheet and `/atlas/changes` answer 200 with the pages' headers, `Referrer-Policy:
  strict-origin-when-cross-origin` and HSTS, and the home page equals `mcp.askrigor.com/atlas`. The Atlas shows
  nothing published or checked yet.
- **Codex plugin:** no packaged file changed, so no reinstall. The installed
  `0.1.0+codex.20261022222738.hrp.20.6.31.universal.20.5.46` equals the release's 8 packaged files byte for byte, the
  manifest's version line aside, `skills/askrigor/SKILL.md` included; receipt
  `3e83000a1183ebfcf9da510c13445f1df8fb93de9b3e5706662035229ff265cf`.
- **Connector probe (Codex, 17:40 UTC):** 33 tools and both live manifests, but the tool list the ChatGPT app gives
  Codex was loaded with build `1582f063`, so it cannot send the new fields until the owner refreshes the app. The
  owner's account reads `UNENROLLED` with notice v4: an account that accepted an earlier notice accepts v4 before
  free research.
- **After the deploy:**
  - the 217 test cards of the 171 plan's section 4G are set aside (ARF-0001, ARF-0016 to ARF-0038, ARF-0042,
    ARF-0043 and ARF-0049 to ARF-0239), sent as four ranges; none had a publication;
  - `move_youtube_findings` for ARF-0007, ARF-0012 and ARF-0209 waits: this session's connector loaded its tool list
    before the release and sends the `cards` list as text, which the server refuses;
  - the email of question 175 went to YouTube API Services at 17:46:58 UTC, a reply in their thread, word for word;
  - #351, shipped in this release, was closed; Dependabot closed #342, #362 and #363, and alert 24 is fixed.
- **Rollback:** the pages alone: put back `runtime.env.before-pages` and recreate `research-mcp`. The image: the
  runbook's order (`infra/living-evidence-production/README.md`): stop the timer, the notice-v4 hold, the rollback
  folder's selector and `runtime.env`, recreate `research-mcp` with `askrigor-research:rollback-pre-0da58528d5f2`,
  the hold again, the timer. Undo no migration; the held findings, publications, votes and comments stay.
- **Owner steps left:** accept notice v4 and refresh the ChatGPT app's tool list (then the regression run, with card
  saving off); the move of cards 7, 12 and 209, then deleting the earlier revisions GitHub keeps of each; the Auth0
  client secret on the server, then votes and comments on.
