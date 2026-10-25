# Production release, 2026-10-25 evening (security updates; votes and comments on)

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
