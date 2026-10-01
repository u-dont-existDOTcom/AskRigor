# PR #246 instruction optimization — production release

PR #246 merged reviewed head `e8d0092fb8b1acd2a3e80021feccda90b764854f` as
`5640e6d2cfef6d2436ef5459dee3fad08c8e8fd3` on 2026-10-01 at 18:42 UTC, on the
owner's "approve all" to owner question 19. The merge tree is identical to the
PR head's. The plan is
`docs/superpowers/plans/2026-10-01-pr246-production-release.md`.

Production now serves HRP 20.6.8 (revision 2026-09-30, SHA-256
`641473288653e5e2249527c3626d20c298c9b2f302ffc79feaad7c12191606b8`) and
Universal 20.5.33 (revision 2026-09-30, SHA-256
`981429bd73d163f860ab3939aae5ac7057a3557285faa59fa3c8779f12c9722a`).

**Release state: complete.** The backend went live at 18:51 UTC. The approved
privacy and terms wording went live at 20:18 UTC, and the findings library
opened at 20:19 UTC.

Claude Code's safety check held the wording merge
(u-dont-existDOTcom/AskRigor#259) until the owner named it ("21 merge").

## What the release replaced

Production ran `askrigor-research:b04d1e1cb308261c8838eab1066b98c98891585f`, the
merge of #236 (Claude connector OAuth, 2026-09-25). That deploy has no release
record in this repository. Its root-only rollback directory on the host is
`pre-claude-oauth-20260925T143000Z`. This release therefore also shipped the
22 first-parent merges after it:

- Dependabot updates;
- #237, #244, #245;
- the task-mode integration (#252, Universal 20.5.27);
- the locale and vault test fixes (#254);
- the rule and record PRs (#253, #255, #256);
- #246 itself.

The site logo (#247) changes only the site. It was already live: the active
site release before this one was its merge, `0e0d0f4d`, from 2026-09-27.

## Build and transfer

- **Source archive.** `git archive` of the merge: 4,062 members, 31,170,560
  bytes, SHA-256
  `951defc882bf2a9e6301b1c46833cba216eb1561de9a7fb0d8bac370ea541c33`. Its gzip
  form is 5,525,328 bytes, SHA-256
  `9c8ddee876bbf5c0ead7a2ddfe46811d187fd80c3042855d5958d75f4d3e14b0`.
- **Image.** `askrigor-research:5640e6d2cfef6d2436ef5459dee3fad08c8e8fd3`, built
  on the owner's laptop (Docker 29.8.1, amd64).
  - Image ID: `sha256:5da9b995b04d51d5faca1743daf99e753a875b548d8f780c455db3f5f960da3d`.
  - Runs as `node`, working directory `/app`.
  - SHA-256 of its layer list:
    `c74e1cc080851ba9dbc3d610fea6a5ee98711d3ea7923128e19218c4e5505731`.
- **Disposable no-secret container.** Run read-only, with all capabilities
  dropped and `no-new-privileges`. `/healthz` returned `ok`, and it logged one
  startup line.
- **Transfer.** The image archive is 108,882,806 bytes, SHA-256
  `1955496b8ac7c60d4fa7cdafd4c895aff7aa994643bb5dce30f8c645cafa8a1e`. The host
  (Docker 29.7.2, x86_64) checked the digest before `docker load`. The loaded
  image has the same ID and the same layer list.

## Deployment

- **Before any change.** The research container was healthy on the old image.
  The timer was enabled and active. Recorded SHA-256s:
  - selector: `c327465c…`
  - `runtime.env`: `ca6b7e4f…`
  - `compose.yaml`: `7defa51e…`
  - overlay: `5631ff81…`

  The base `compose.yaml` pins the research image as well as the overlay's
  `${ASKRIGOR_RESEARCH_IMAGE}`, so both name the new image now.
- **Rollback state, preserved first.**
  - Promotion timer stopped and disabled.
  - Old image tagged `askrigor-research:rollback-pre-5640e6d2cfef` (image ID
    `sha256:6dc01362…`).
  - Root-only directory
    `/opt/askrigor/rollbacks/pre-5640e6d2cfef6d2436ef5459dee3fad08c8e8fd3`
    (mode 0700) holds: the selector, `runtime.env`, both Compose files,
    `PRIOR-STATE`, `SHA256SUMS`, and a custom-format dump of the whole database
    (496,797 bytes; `pg_restore --list` shows 82 table-data entries).
  - The notice v2 hold and restore scripts are in `/root` (SHA-256
    `f64569dd…` and `12bcecf9…`, equal to the merge).
- **Migration.** The new image's one-shot `migrate` ran before it served:
  - 10 to 11 rows in `schema_migrations`;
  - `0011_research_use_notice_v2` with SHA-256 `83a27316…`;
  - `research_use_accounts_free_notice_check` present.

  The account table holds one account, a free contributor on notice v1, which
  is asked to accept v2 once.
- **Configuration.** `runtime.env` gained `ASKRIGOR_BUILD_COMMIT=5640e6d2…`
  and `ASKRIGOR_GEMINI_BILLING=none`.
  - The billing flag follows the owner's decision of 2026-09-27.
  - The server's Gemini key fingerprint equals the owner's unbilled key file's;
    no key was displayed or typed.
  - `ASKRIGOR_FINDINGS_LIBRARY` stays unset.
  - New SHA-256s: `runtime.env` `dfcb9a40…`, selector `0fc69134…`,
    `compose.yaml` `0dca1807…`. All are root, 0600.
- **Cutover.** At 18:51:03 UTC only `research-mcp` was recreated, from both
  Compose files. It was healthy within about 8 seconds. PostgreSQL (up since
  2026-09-19) and Caddy were not touched.
- **Security envelope.**
  - Runs as `node`, with a read-only root filesystem, all capabilities dropped
    and `no-new-privileges`.
  - Memory 1,073,741,824 bytes, 256 PIDs.
  - Writable mounts: only `/var/lib/askrigor-actions`,
    `/var/lib/askrigor-research-sessions` and
    `/var/lib/askrigor/lesson-incidents`.
  - Networks: exactly `askrigor_default` and `askrigor_living_evidence_private`.
  - Startup log: one line. A scan for YouTube URLs, keys, tokens, private keys,
    database URLs and request or response bodies found nothing.

## Live acceptance

- **Endpoints.** `https://mcp.askrigor.com/healthz` returns `ok`. `/mcp/claude`
  answers 401, and its protected-resource metadata 200.
- **In-image probe.** An in-memory MCP client ran inside the live image (as at
  the 2026-09-08 release):
  - the standard catalog has 32 tools (32 unique) and the Gemini catalog 22;
  - `get_protocol_manifest` returns the two versions and SHA-256s above;
  - `load_protocol` returns the HRP section index;
  - a PubMed search returned one record with a signed research receipt;
  - the Gemini scout completed in three calls over about 73 seconds (16
    discovery queries, two videos found by title, validation `partial`). The budget ledger stays
    owner-only (directory 0700, file 0600).
- **Reddit thread check, first live run.** Run from the production container,
  `lookupRedditThread` found r/IAmA post `z1c9z` with its real title in 432 ms,
  and a nonexistent post returned `not_found`.
- **Action document.** `/actions/openapi.json` is 11,701 bytes, SHA-256
  `83314c552f92e9127f91967e3491e2ca883efb9da596cda4a60bac666825b1ed`, with
  `submit_lesson_candidate` and `preserve_lesson_incident`.
  - This release does not change it: the two route definitions and the
    projection code are identical in `b04d1e1c` and the merge.
  - It differs from the 2026-09-11 record because the 2026-09-25 deploy added
    the lesson-incident route.
  - The Custom GPT needs no editor change.
- **Connector, from this Claude session.** `manage_research_access inspect`
  returned the v2 notice in the owner-approved wording. Paid-private
  activation was refused: the owner's connected account has no entitlement.
  None was created, since that is an account change the owner did not
  approve. So research tools were not run through the connector; the in-image
  probe covers them.
- **Promotion scheduler.**
  - The selector is bound to the new image.
  - The manual one-shot completed with `no_pending_promotion`. Its journal
    scan found no marker, and no runner container remained.
  - The timer was re-enabled. Its catch-up run (18:58) and scheduled runs
    (19:00, 19:05) succeeded.
- **GitHub App.** A token minted for `AskRigor-lessons` lists exactly that
  private repository, and one for `AskRigor-findings` exactly that one, as the
  token provider requires before use.

## Plugin

- **Before.** Version `0.1.0+codex.20260919021156`, receipt `cf815264…`; the
  source and the installed copy agreed.
- **Rollback copy.** `/home/joel/plugins/askrigor.rollback-20261001185906Z`.
- **Update.** The merge's `skills/askrigor/SKILL.md` and `plugin.json` went in
  with the cachebuster `0.1.0+codex.20261001185906`. Apart from the version,
  `plugin.json` equals the merge's. Reinstalled with `codex plugin add
  askrigor@personal` (Codex CLI 0.158.0).
- **Receipts.** Source and installed both
  `a434a72cf2506ed8c6855a14c4bee962ded91fa7f636db0fdc875c7986c9e3a7`, 8 files.

## Rollback

The plan's "Rollback" section applies.

- **Image.** Run the notice v2 hold script before the old image serves.
  Restore the preserved selector, `runtime.env` and `compose.yaml`. Recreate
  only `research-mcp` with `askrigor-research:rollback-pre-5640e6d2cfef`.
  Restore the timer.
- **Migration 0011 stays.** It only widens the allowed notice versions.
- **Plugin.** Restore the source from the rollback copy and run
  `codex plugin add askrigor@personal`.

## Site release (approved wording)

- **Source.** u-dont-existDOTcom/AskRigor#259 merged as `df471dd644e1dc00a0b4fe66dcffdbfb2ed87cfb`;
  its tree equals the PR head. The edits are the plan's approved list, applied
  as written, with one comma added. Both pages are effective October 1, 2026.
- **Archive.** Made with `scripts/create-public-site-archive.sh`, which ran
  the site validator (4 pages). 17 members, 25,377 bytes, SHA-256
  `45bb8d63cf0de4adab6c0719efe916670683e269fbcac64799015aa9add2d8f0`, verified
  again from a separate directory. A secret scan matched only Docker format
  strings (`.Config.Env`).
- **Staging.** The archive, its checksum file and the merge's installer
  (SHA-256 `faeb5f9f…`) went to `/opt/askrigor/site/staging/df471dd644e1`
  (root, 0700), where checksum, ownership and no-symlink checks passed.
- **Install.** `ops/public-site/install-public-site.sh` ran once and exited
  0. It validated the Caddy configuration and activated
  `/opt/askrigor/site/releases/df471dd644e1dc00a0b4fe66dcffdbfb2ed87cfb` at
  20:18:04 UTC.
  - It recreated only Caddy, whose container is new (`f3585e6e0e83`).
  - The research container stayed the same one (`fe3d7ef80ba9`) and healthy.
  - The orphan warning names the database container, which belongs to the
    other Compose file, as before.
- **Live, from outside.** `/`, `/privacy`, `/terms` and `/support` return
  200 and match the merge byte for byte. `http://askrigor.com/privacy`
  answers 308 to HTTPS. MCP `/healthz` and `/actions/openapi.json` return 200.

## Findings library

- **Opened.** `runtime.env` was first copied to the rollback directory as
  `runtime.env.pre-library`. Then `ASKRIGOR_FINDINGS_LIBRARY=enabled` was set
  (new SHA-256 `b14ce30a…`, root 0600). `research-mcp` was recreated at about
  20:19 UTC: healthy within about 8 seconds, the security envelope unchanged,
  one log line.
- **The gate holds.** In the live container, a well-formed card with a
  finalization receipt the server never issued was refused:
  `card_not_checked`, `receipt_invalid`. The library is open and still
  requires a genuine receipt.
- **Delivery works.** One clearly marked synthetic card went through the real
  queue (`GitHubFindingsQueue`) to the private `AskRigor-findings` repository
  and became `ARF-0001`. It carries the `findings-card` and `pending-review`
  labels, the card marker and the build stamp. It was then commented and
  closed as not planned, so the owner's queue holds no test card.
- **Rollback.** Unset the flag, or restore `runtime.env.pre-library`, and
  recreate `research-mcp`. Saved cards stay in the private repository.

## Also merged on the owner's answers (not deployed by this release)

- **ip-address security update.** u-dont-existDOTcom/AskRigor#258 ("20
  merge"), a three-line lockfile change, merged as `a2fc064a`. GitHub marked
  alerts 13 to 16 fixed, and Dependabot closed its duplicate (#251). The
  server does not load this library; the next release picks up the lockfile.

## Verification and lessons

- `npm run verify` passed on the merged head `e8d0092` in the laptop's French
  locale: 2,211 tests, 6 skipped, typecheck and build. CI on `e8d0092`: all 7
  checks passed.
- `npm run contributor-access:notice-v2-rollback-acceptance` passed, and two
  mutations failed it as intended.
- The site wording's head passed `npm run verify` (2,212 tests), `npm run test:site`
  and `npm run test:site-deploy` (28 tests), and CI's deterministic verification.
- Lesson checkpoint at 18:40:52 UTC: available, 2 open, 2 needing review, 0
  accepted but not incorporated, 5 incorporated or closed, 0
  deletion-eligible.
- Process lesson: a deploy went to production on 2026-09-25 without a release
  record here, so this release found the running version only by reading the
  host.
