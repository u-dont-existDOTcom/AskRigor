# Production release, 2026-10-04 (owner questions 34 and 35)

## Owner decisions

- **Question 34**, answered "34 A" on 2026-10-04 at about 02:00 UTC: merge #257,
  #263 to #276, close #250, approve the four "check this video" privacy
  sentences, and deploy.
- **Question 35**, answered "merge 277" at about 04:21 UTC. Main requires every
  merge to be up to date and to pass "Deterministic verification" and
  "workflow-policy". So the 15 approved pull requests went in as one release
  pull request, #277. Claude Code's safety check refused auto-merge, and the
  owner then approved #277 by its number.

## Source

- **Merge commit:** #277 merged as `27deb4a57fddbf78f448a014c83361bc06c0e30b`,
  a true merge.
  - First parent: `083247115724`, the prior main. Second parent: release head
    `1a5d815f75c68725915dd246e1cf6f8ee51aeb4c`.
  - `git diff --quiet M^2 M` holds.
  - All 15 pull requests show as merged on GitHub.
- **Stacked pull requests:** #274 and #275 were merged into their bases, #273
  and #269, first.
- **Heads included:** #257 `5906370e1a16`, #263 `3a0533ffa11a`, #264
  `f013c31d5a2f`, #265 `f99f1da2e8db`, #266 `74fe4d3ba7bb`, #267 `79860aee8f69`,
  #268 `bcb3b91c7bcf`, #269 `a873fd5ada7f` (with #275 `93f447d269cc`), #270
  `3ae41a04554c`, #271 `3ae845e06269`, #272 `3d4714a195dc`, #273 `1a2df8f3dd04`
  (with #274 `08db6531aec5`), #276 `bf6e99b3909f`.
- **Conflicts resolved**, the same as in the test merge:
  - #267 and #268 touch the same dependency lines as #263. Each bump is kept,
    and the lockfile is regenerated.
  - #270 against #275, in `tests/public-gap-oauth-review.test.ts`: #275's
    no-sign-in manifest checks and #270's 33 tools are both kept.
- **Effective date:** one commit sets the approved privacy sentences effective
  October 4, 2026, the day they went live. #270 had proposed October 3.
- **Checks:**
  - #277's seven checks passed.
  - On the laptop, `npm run verify` passed: 202 files and 2,265 tests, plus the
    typecheck and the build. `npm run test:site` and `npm run test:site-deploy`
    passed (28 tests), and the regenerated tool inventory was unchanged.
  - #250 was closed with a note that #273 replaces it.

## Image

- **Build:** from a `git archive` of the release head, whose tree equals the
  merge's, then tagged `askrigor-research:27deb4a57fddbf78f448a014c83361bc06c0e30b`.
- **Image:** ID
  `sha256:275b2b315d207aba5922530f1e737159babb54e3461d6f8cf631c2d43954639c`,
  user `node`, workdir `/app`.
- **Transfer archive:** 109,001,201 bytes, SHA-256
  `a3fb4b125dff14d4098cd91d1cb7d40609b48eb1342181172f9065acd776da7a`.
- **Disposable no-secret gate:**
  - read-only, all capabilities dropped, `/tmp` only;
  - `/healthz` returned the usual body;
  - `/version` returned build `unknown` (no environment), HRP 20.6.10 and
    Universal 20.5.34;
  - the log held one line.

## Production (`mission-control-secondary`)

1. **Prior state.**
   - `askrigor-research-mcp-1` ran
     `askrigor-research:5640e6d2cfef6d2436ef5459dee3fad08c8e8fd3`, up 2 days.
   - SHA-256 prefixes: selector `0fc69134f67da42d`, `runtime.env`
     `b14ce30ab61a3c8a`, `compose.yaml` `0dca180709940dd6`,
     `compose.living-evidence.yaml` `5631ff8150eea2a8`.
   - The promotion timer was enabled and active.
   - `runtime.env` held 61 names.
2. **Load.** The checksum file verified, and the loaded image ID equals the
   laptop's.
3. **Promotion timer** stopped and disabled.
4. **Rollback kept.**
   - Image tag `askrigor-research:rollback-pre-27deb4a57fdd`.
   - Selector, `runtime.env` and both Compose files, in
     `/opt/askrigor/rollbacks/pre-27deb4a57fddbf78f448a014c83361bc06c0e30b`
     (0700).
   - A custom-format dump of the `living_evidence` schema: 462,200 bytes,
     SHA-256 prefix `57240f8d82b0799b`, mode 0600, on the server only.
5. **Migrate** with the new image: `"status":"complete"`, with no new
   migrations in this release.
6. **`runtime.env`** (root, 0600; new SHA-256 prefix `b8c13d403a07507c`):
   - `ASKRIGOR_BUILD_COMMIT` is set to the merge.
   - `ASKRIGOR_OAUTH_CHATGPT_METADATA_CLIENT_ID=https://chatgpt.com/oauth/client.json`
     is added, the only new name (62 now). No secret was printed or retyped.
7. **Switch.** The selector now names the new image. Only `research-mcp` was
   recreated, at 04:24:53 UTC, and it was healthy at 04:25:01.
8. **Security envelope:**
   - user `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`;
   - memory 1 GiB, 256 PIDs;
   - networks `askrigor_default` and `askrigor_living_evidence_private`;
   - writable mounts `/var/lib/askrigor-actions`,
     `/var/lib/askrigor-research-sessions` and
     `/var/lib/askrigor/lesson-incidents`. The last is defined in the unchanged
     `compose.yaml`; the 2026-10-01 plan's list left it out.
   - The startup log has one line.

## Live acceptance

- **In-image probe** (`scripts/release-in-image-probe.mjs`): an in-memory MCP
  client inside the live container, with its own environment.
  - **Running:** HRP 20.6.10, Universal 20.5.34, build `27deb4a57fdd`.
  - **Catalogs:** the standard catalog has 33 tools, all unique, with
    `get_protocol_manifest` first; its description starts "Versions when this
    tool list was loaded: HRP 20.6.10, Universal 20.5.34, build …". The Gemini
    catalog has 22.
  - **Server identity:** title "AskRigor (HRP 20.6.10, Universal 20.5.34,
    build …)", version
    `0.1.0+hrp.20.6.10.universal.20.5.34.build.27deb4a57fddbf78f448a014c83361bc06c0e30b`.
  - **Manifests:** HRP `4337aa8ed2f8ccb3…` and Universal `d5e041b556bb8635…`.
    `load_protocol` returns the HRP index.
  - **PubMed:** one record, with a signed research receipt.
  - **"Check this video",** live on `0aj0UTxmmv4` (5:53): complete in 3 calls
    and 60 s, 25 claims, 0 sponsorships, on the unbilled Gemini key.
  - **Reddit thread check:** a real thread is `found` with its title; a
    nonexistent one is `not_found`.
  - **Ledgers:** directory 0700; `ai-budget.json` and
    `gemini-video-seconds.json` 0600.
- **Public endpoints:**
  - `/healthz` is ok.
  - `/version` shows build `27deb4a57fdd` with both versions.
  - `/mcp` lists 33 tools, and `get_protocol_manifest` answers with no sign-in.
  - `/mcp/claude` answers 401, and its resource metadata 200.
- **Action document:** `/actions/openapi.json` is 11,701 bytes, SHA-256
  `83314c552f92e912…`, unchanged since 2026-10-01. The Custom GPT needs no edit.
- **Connector, from this Claude session:** `get_protocol_manifest` returned HRP
  20.6.10 with no research mode on the account.
- **Promotion:** the selector is bound to the new image.
  - The manual one-shot succeeded (`complete`, `no_pending_promotion`). Its
    journal scan found no marker, and no runner remained.
  - The timer is re-enabled: its catch-up run at 04:36:55 succeeded, and the
    next is at 04:40:10.

## Site release (approved wording)

- **Archive:** made with `scripts/create-public-site-archive.sh` from the merge,
  which validated 4 pages. 25,730 bytes, SHA-256
  `d0051aa1cb137cdf8d921562bd4f95097a0f45c893cd4170ced1b51ee34b5f11`.
- **Install:** staged in a root-only folder and installed with the merge's
  `ops/public-site/install-public-site.sh`. It is active at
  `/opt/askrigor/site/releases/27deb4a57fddbf78f448a014c83361bc06c0e30b`.
- **Live:**
  - `https://askrigor.com/privacy` reads "Effective October 4, 2026" and holds
    all four approved sentences.
  - `/terms` is unchanged (October 1, 2026), and `/support` answers 200.

## Plugin

- **Before:** version `0.1.0+codex.20261001185906`. Source and installed
  receipts were both `a434a72cf2506ed8…`, 8 files.
- **Rollback copy:** `/home/joel/plugins/askrigor.rollback-20261004T044030Z`.
- **Update:** the merge's `skills/askrigor/SKILL.md` and `plugin.json` went in.
  `plugin.json` equals the merge's apart from the version. The cachebuster now
  carries the protocol versions, so Codex's plugin details show them:
  `0.1.0+codex.20261004044030.hrp.20.6.10.universal.20.5.34`.
- **Reinstall:** with `codex plugin add askrigor@personal`, Codex CLI 0.160.0.
- **Receipts:** source and installed are both `517f615afb46c304…`, 8 files. The
  installed `SKILL.md` equals the merge's (9,870 bytes).

## Lesson checkpoint

`npm run lessons:status` at 02:00 UTC: 2 open, 2 need review, 0 accepted but
not incorporated, 5 incorporated or closed, 0 eligible for deletion. None bears
on this release.

## Open after release

- **ChatGPT sign-in:** the new sign-in through ChatGPT's metadata-document
  client is not yet confirmed end to end. The owner connects the plugin once;
  Auth0's side was checked on 2026-10-04 (the login page renders for that
  client).
- **ChatGPT panel:** the owner checks whether ChatGPT's plugin details page
  shows the versions.

## Rollback

The 2026-10-01 plan's image rollback applies, with this release's paths:

1. stop and disable the promotion timer;
2. restore the selector and `runtime.env` from the rollback folder above;
3. recreate only `research-mcp` with
   `askrigor-research:rollback-pre-27deb4a57fdd`;
4. check health and the security envelope;
5. re-enable the timer.

No migration ran, so the database needs no step. Site: reinstall the
2026-10-01 site archive with the installer. Plugin: restore the source from the
rollback copy and run `codex plugin add askrigor@personal`.
