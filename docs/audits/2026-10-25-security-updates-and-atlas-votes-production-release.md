# Production releases, 25 and 26 October (security updates; votes and comments on; the sign-in fix; card 12's move and the signed-in pages)

- **Owner decisions:** "177a 178a" (read at 20:52 UTC on 25 Oct, owner questions page). 177a: the Atlas app's client
  secret goes to the server from a file the owner saved, moved by a script without anyone seeing it, and votes and
  comments switch on. 178a: release the security updates now, before the owner refreshes the ChatGPT app.
- **Votes and comments (177a, 20:53 UTC, on the image of #367):** the owner's file held one value of 64 URL-safe
  characters; `participation-on.sh` sent it over SSH's standard input to a host script that wrote it into
  `runtime.env` with `ASKRIGOR_ATLAS_PARTICIPATION=enabled` (73 names; rollback copy
  `runtime.env.before-participation` in `/opt/askrigor/rollbacks/pre-0da58528d5f2cd77764d3dd7f6900cd05c16c4b9/`), and
  recreated `research-mcp`, healthy. In the container `atlasParticipationFromEnv()` found every part; the log held no
  credential marker. `askrigor.com/atlas/auth/login` redirects (302) to the tenant's `/authorize` with
  `response_type=code`, the Atlas client ID, `redirect_uri=https://askrigor.com/atlas/auth/callback`, `scope=openid`,
  `code_challenge_method=S256`, a state, a nonce and a challenge, and sets the 10-minute `__Host-` login cookie
  (`Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`). The owner's own sign-in completes the round trip.
- **The move of stored cards' YouTube findings (20:17 UTC, a fresh session whose connector loaded the release's tool
  list):** ARF-0007 (finding 3, saved 7 Oct) and ARF-0209 (finding 5, saved 23 Oct) are held and their cards
  rewritten; ARF-0012 answered `every_finding_youtube` and is unchanged (owner question 179). The owner deletes the
  earlier revisions GitHub keeps of cards 7 and 209.
- **Security release (#372), on the owner's 178a:**
  - **Source:** #372 passed all seven checks on `79dd7421` (main's merge of #367 taken into the next build, the same
    tree as `03192ef6`). It merged as `ea672a386aac758b6d926ec8137ea349880997c9` onto main `0da58528`, and the merge
    tree equals the PR head tree. Contents: zod 4.6.7, body-parser 2.4.0 (with qs 6.16.1 and content-type 2.1.0) and
    fast-uri 3.1.9 (Dependabot #368 to #371, alerts 25 to 33), zod 4.6's JSON Schema form (the output schemas of 10
    tools; every input schema and description unchanged; the tool list version changes), and the 25 October release
    record. No migration, grant, site, Codex plugin or Custom GPT file changed. HRP 20.6.31 and Universal 20.5.46.
  - **Tests (the laptop, on `03192ef6`):** `npm run verify` (4,817 tests, 6 skipped), `test:site`, `test:site-deploy`
    (30), `contributor-access:postgres-acceptance` (84 checks) and CI's database steps against PostgreSQL 17.6. A first
    `verify` failed in five tests, all from zod 4.6's JSON Schema form, before the fixes the commit describes.
  - **Image:** ID `sha256:cbcbac6b8e3ee86141df920f34c0d70841dd090a0f184215f6cb9b81e758e4c4`, user `node`; source archive
    `67e68b23ac46c22d...`; image archive `d8989bb87f378c61...`, 124,202,707 bytes; the no-secret candidate answered
    health and version with one log line and no credential marker.
  - **Stage B (21:02:19 to 21:02:30 UTC):** the image loaded with the built ID; the timer stopped; the prior image
    tagged `askrigor-research:rollback-pre-ea672a386aac`; rollback copies and a `pg_dump` (4,183,204 bytes,
    `ae42659ac2b37a11...`) in `/opt/askrigor/rollbacks/pre-ea672a386aac758b6d926ec8137ea349880997c9/`; `migrate`
    changed nothing (0018 to 0023 with the same hashes); both unchanged role scripts re-ran and each role's rights
    are exactly as before; only the build line of `runtime.env` changed (73 names; the pages and votes on); the
    selector named the new image and `research-mcp` was recreated, healthy.
  - **Stage C (21:03 UTC):** the public checks (version and build `ea672a38`, 401 without sign-in, 33 tools, the site's
    pages, `/atlas` on both addresses, the sign-in redirect), the container's security settings with one log line,
    the in-image probes (the Atlas review open, pages on, participation configured, notice v4, the round limit 10),
    the promotion service by hand (both queues `no_pending_promotion`) and the timer again (next 21:05:14).
  - **Codex plugin:** no packaged file changed; the installed copy equals the release's 8 packaged files.
  - **Regressions:** the poller that waits for the owner's app refresh and notice acceptance now waits for build
    `ea672a38` (restarted 21:04 UTC; until about 23:04).
  - **Rollback:** recreate `research-mcp` with `askrigor-research:rollback-pre-ea672a386aac` and the rollback folder's
    selector and `runtime.env` (the image of #367, which takes the same database).
- **The sign-in fix (#373), on the owner's "180: a" (read at 23:07 UTC):**
  - **What failed:** the owner's three sign-ins (22:02 and 22:11 UTC) came back from Auth0 with an error ("The sign-in
    was cancelled or refused"). Auth0's log, read with the read-only log key (date, type, description, client and
    scope only), gave the reason each time: client `QQrMGutU5AG0P4rEASDWMp6HWiTNGm39` "is not authorized to access
    resource server `https://mcp.askrigor.com/mcp`". The tenant's default audience is the MCP API, so an authorize
    request naming no audience asks for it, and it admits only the connectors' applications.
  - **Fix:** the Atlas authorize request names Auth0's own userinfo audience (`1a5aa03f`); nothing else in the sign-in
    changes. #373 passed all seven checks on `6fb9f6e3` and merged as
    `7621883d8fd99072e37d9f6f9dad82bf4c93df10` onto main `ea672a38`; the merge tree equals the PR head tree.
  - **Image:** ID `sha256:a3cf5f1ff71ee7f1f45930492bfaf52fa7995442fdaa468fbc80270b98d6f8f9`; source archive
    `e871e05cf5fe00d2...`; image archive `1f886f3e6a18f91c...`, 124,203,509 bytes; the no-secret candidate passed.
  - **Stages:** stage B as for #372 (migrate unchanged, both roles' rights exact, only the build line; `pg_dump`
    4,271,687 bytes, `91d52134bee25a6f...`; rollback folder `pre-7621883d8fd99072e37d9f6f9dad82bf4c93df10`, prior
    image tagged `askrigor-research:rollback-pre-7621883d8fd9`); `research-mcp` recreated at 23:10:05 UTC, healthy;
    stage C passed (version and build, 33 tools, the pages, the probes with participation configured, the promotion
    run and the timer). The live sign-in link now carries
    `audience=https://askrigor-prod.us.auth0.com/userinfo` with the code flow, PKCE and `scope=openid`.
  - **During the regression run:** the restart at 23:10:05 UTC fell within the owner's regression run (started 22:12);
    the judgment checks the cases running then and reruns any it disturbed. The tool list is unchanged, so the
    ChatGPT app's copy stays current.

## Card 12's move and the Atlas's signed-in pages (#374), on owner answer 181a (26 Oct)

- **Decision:** 181a ("ok sure", read at 00:13 UTC on 26 Oct): release the next build when the owner's regression run
  ends, so its remaining cases are not told the app's tools changed. The run ended at 04:43:20 UTC.
- **Contents:** owner answer 179a (`move_youtube_findings` holds a stored card whose findings all rest on YouTube
  comments with no card, then tombstones and locks the issue) and the Atlas's signed-in pages (the header's "Sign in"
  or "Your account", the notices on every page, `/atlas/account`, uncached signed-in pages, plain rate-limit and outage
  pages), with the release records of 25 October. The review tool's description and output schema change, so the tool
  list version changes and connected apps are asked to refresh.
- **Source:** #374 passed all seven checks on `2db2c5f0` and merged as `997cb4269815247f3a0d3699c6025ac643907524` onto main `7621883d`; the merge tree equals the PR head tree. Tests: card 12's move on `311112f2` (`npm run verify` 4,829, PostgreSQL acceptance 84) and the signed-in pages on `2db2c5f0` (`npm run verify` 4,843, PostgreSQL acceptance 84, `test:site`).
- **Image:** ID `sha256:24d04a9460dc3bbc16bbe8fb1f565d6cc5ee9009138c93e62a145dc86af7a3a0`; source archive `218630e1d14afb64...`; image archive `4864be9fe74c21d9...`, 124,209,412 bytes; the no-secret candidate passed.
- **Stages:** stage B as for #372 (migrate unchanged, both roles' rights exact, only the build line; `pg_dump` 4,978,953 bytes, `63f7b0c7be50e132...`; rollback folder `pre-997cb4269815247f3a0d3699c6025ac643907524`, prior image tagged `askrigor-research:rollback-pre-997cb4269815`); `research-mcp` recreated at 04:52:08 UTC, healthy, after the regression run had ended; stage C passed (version and build, 33 tools, the pages and the sign-in redirect, the probes with participation configured, the promotion run and the timer). Live: every page's header offers "Sign in", and `/atlas/account` answers. The Codex plugin still equals the release's packaged files.
- **After:** card 12's move, asked of the session that moved cards 7 and 209 (its connector loads the release's tool list); the owner refreshes the ChatGPT app for the new tool list; `l31-dose-changed-switch`, disturbed by the 23:10:05 restart, is rerun.
