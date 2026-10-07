# Production release, 2026-10-07 (owner questions 37 and 39)

## Owner decisions

- **Question 37**, answered "37 A" on 2026-10-06: merge #280 and #281 and deploy them together.
- **Question 39**, answered "39: deploy 6c900d0" in this session on 2026-10-07. Claude Code's safety check
  had refused the production switch on 2026-10-06 ("Production Deploy") with only 37 A, so nothing on the
  server changed until this answer. The same answer, sent first through another session at 02:03 UTC, was
  not acted on: an approval relayed from another session is not one.
- **Question 38** (Gemini credits): the owner added $20 of prepaid credit on 2026-10-06. A 9-token request at
  about 21:30 UTC went through.

## Source

- #281 merged at 2026-10-06T21:18:08Z as `804333963501`: YouTube comment repeats and Gemini 402 naming.
- #280 merged at 21:22:22Z as `6c900d0cd2cfff169ed11e246252d0ff5f4a5696`, a true merge, after its branch
  was brought up to date with #281 (`470a76c6`). `git diff --quiet M^2 M` holds, and the tree equals
  `470a76c666cf510b0f076c9056390ad40ad17a7a`, the build source.
- Checks: all seven on #280's head. On the laptop, `npm run verify` on the merged tree passed:
  203 test files, 2,273 tests, typecheck and build.

## Image

- Built from a `git archive` of `470a76c6` (tree equal to the merge's) and tagged
  `askrigor-research:6c900d0cd2cfff169ed11e246252d0ff5f4a5696`.
- ID `sha256:351b55fb23e25c5728222d4c4b0c466aac3ca26d9ef884bfe486a66aa61cd581`, user `node`, workdir `/app`.
- Transfer archive: 109,008,105 bytes, SHA-256
  `d95b88157a495d717ea9de05c1b8b83d8546a64e5f6e74483ac9352864c14cea`.
- Disposable no-secret gate: read-only, all capabilities dropped; `/healthz` ok; `/version` build `unknown`,
  HRP 20.6.10, Universal 20.5.34; one log line.

## Production (`mission-control-secondary`)

1. **Prior state** (2026-10-06, 21:21 UTC): `askrigor-research-mcp-1` on
   `askrigor-research:27deb4a57fddbf78f448a014c83361bc06c0e30b`, up 2 days, healthy. SHA-256 prefixes:
   selector `791f1fb1632f9ed8`, `runtime.env` `b8c13d403a07507c` (62 names), `compose.yaml`
   `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`. Promotion timer enabled and active.
2. **Load** (2026-10-07, 03:13 UTC): the checksum file verified, and the loaded image ID equals the laptop's.
3. **Promotion timer** stopped and disabled; no runner was active.
4. **Rollback kept:** image tag `askrigor-research:rollback-pre-6c900d0cd2cf`; selector, `runtime.env` and
   both Compose files in `/opt/askrigor/rollbacks/pre-6c900d0cd2cfff169ed11e246252d0ff5f4a5696` (0700); a
   custom-format dump of the `living_evidence` schema, 479,960 bytes, SHA-256 prefix `36c97c37405f1944`,
   mode 0600, on the server only.
5. **Migrate** with the new image: `"status":"complete"`, no new migrations.
6. **`runtime.env`:** only `ASKRIGOR_BUILD_COMMIT` changed, to the merge; still 62 names; new SHA-256 prefix
   `ece5640ec006c7e3`. No secret was printed or retyped.
7. **Switch:** the selector names the new image (SHA-256 prefix `e81362f01d52314a`). Only `research-mcp` was
   recreated, at 03:13:52 UTC; healthy at 03:13:58.
8. **Security envelope:** user `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, memory 1 GiB,
   256 PIDs; networks `askrigor_default` and `askrigor_living_evidence_private`; writable mounts
   `/var/lib/askrigor-actions`, `/var/lib/askrigor-research-sessions` and `/var/lib/askrigor/lesson-incidents`;
   one log line.

## Live acceptance

- **In-image probe** (`scripts/release-in-image-probe.mjs` without its video read, to spare the owner's new
  Gemini credit): build `6c900d0`, HRP 20.6.10 and Universal 20.5.34 with their fingerprints, 33 tools with
  `get_protocol_manifest` first and the versions in its description, Gemini catalog 22, `load_protocol` index,
  one PubMed record with a signed receipt, the Reddit check (a real thread `found`, a fake one `not_found`),
  ledger modes 0700 and 0600.
- **Public:** `/healthz` ok; `/version` build `6c900d0`; `/mcp` lists 33 tools, and the manifest's schemes
  are `noauth` then `oauth2` with `research:use`; `/mcp/claude` answers 401; `/privacy`, `/terms` and
  `/support` answer 200.
- **The new connection status:** an anonymous manifest call returns `sign_in: absent`,
  `research_access: sign_in_needed` and its next step; this session's signed-in connector returns
  `sign_in: accepted`, `research_access: ready`.
- **Promotion:** the manual one-shot completed (`no_pending_promotion`); the timer is re-enabled, and its
  catch-up run fired at 03:15:41.

## Plugin

`skills/askrigor/SKILL.md` and `plugin.json` are unchanged since 2026-10-04, so there was no reinstall. Source
and installed receipts are both `517f615afb46c304…`, 8 files, version
`0.1.0+codex.20261004044030.hrp.20.6.10.universal.20.5.34`. The catalog stays at 33 tools.

## Lesson checkpoint

`npm run lessons:status` at 2026-10-06 21:21 UTC: 2 open, 2 need review, 0 accepted but not incorporated, 5
incorporated or closed, 0 eligible for deletion. None bears on this release.

## Open after release

- The consilience rule (#282, HRP 20.6.11 and Universal 20.5.35) merged at 03:16:49 UTC, after this build;
  it goes live with the next release.
- ChatGPT showed a "Suspicious Instruction" warning before `finalize_research`; the reworded descriptions
  ride with this record and need the owner's approval to merge and deploy.

## Rollback

Stop and disable the promotion timer; restore the selector and `runtime.env` from the rollback folder above;
recreate only `research-mcp` with `askrigor-research:rollback-pre-6c900d0cd2cf`; check health and the security
envelope; re-enable the timer. No migration ran, so the database needs no step.
