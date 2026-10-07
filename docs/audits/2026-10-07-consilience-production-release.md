# Production release, 2026-10-07, second (owner question 41)

## Owner decision

**Question 41**, answered "41 a" in this session on 2026-10-07 (option A: merge #283 and deploy main). The
release carries the consilience rule the owner approved in question 40 (#282) and the reworded write-tool
descriptions (#283).

## Source

- #282 merged at 03:16:49 UTC as `db2e6a8b`: HRP 20.6.11 (SHA-256 `38606fbc0ea661f4…`) and Universal 20.5.35
  (`4e907f9ac53873fe…`).
- #283 merged as `18a09a35ea5ba474016322e4f48d01b50d5c3e3b`, a true merge; `git diff --quiet M^2 M` holds.
  All seven checks passed on its head. On the laptop, `npm run verify` passed on its head: 204 test files,
  2,280 tests, typecheck and build.

## Image

- Built from a `git archive` of the merge and tagged `askrigor-research:18a09a35ea5ba474016322e4f48d01b50d5c3e3b`.
- ID `sha256:735b0b3a86d3ade02f6fb42a6d0f0ce9eef257974b4d2a994aaf5e6a174dff76`, user `node`, workdir `/app`.
- Transfer archive: 109,011,694 bytes, SHA-256
  `ff2f1694c611d8b60873da26703ddedc4705db7bd91d961020564357f2d408d6`.
- Disposable no-secret gate: `/healthz` ok; `/version` build `unknown`, HRP 20.6.11 `38606fbc0ea661f4`,
  Universal 20.5.35 `4e907f9ac53873fe`; one log line.

## Production (`mission-control-secondary`)

1. **Prior state:** `askrigor-research-mcp-1` on `askrigor-research:6c900d0cd2cfff169ed11e246252d0ff5f4a5696`,
   up 16 minutes, healthy. SHA-256 prefixes: selector `e81362f01d52314a`, `runtime.env` `ece5640ec006c7e3`,
   `compose.yaml` `0dca180709940dd6`, `compose.living-evidence.yaml` `5631ff8150eea2a8`.
2. **Load:** the checksum file verified, and the loaded image ID equals the laptop's.
3. **Promotion timer** stopped and disabled; no runner was active.
4. **Rollback kept:** image tag `askrigor-research:rollback-pre-18a09a35ea5b`; selector, `runtime.env` and both
   Compose files in `/opt/askrigor/rollbacks/pre-18a09a35ea5ba474016322e4f48d01b50d5c3e3b` (0700); schema dump
   479,960 bytes, SHA-256 prefix `6572820c5187d940`, mode 0600.
5. **Migrate:** `"status":"complete"`, no new migrations.
   - **Procedure note:** `docker compose run` without `-T` reads standard input. Inside a script fed to
     `bash -s` over SSH, it swallowed the rest of the script, which stopped after the migration with nothing
     switched. A standalone rerun of the migration exited 0. The remaining steps then ran with stdin from
     `/dev/null`. Future scripts should pass `-T` and `< /dev/null` to every `docker compose run` and `up`.
6. **`runtime.env`:** only `ASKRIGOR_BUILD_COMMIT` changed; still 62 names; new SHA-256 prefix `38633d58ca54749f`.
7. **Switch:** the selector names the new image (SHA-256 prefix `db921c1e88595309`). Only `research-mcp` was
   recreated, at 03:30:43 UTC; healthy at 03:30:49.
8. **Security envelope:** user `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, memory 1 GiB, 256
   PIDs; networks `askrigor_default` and `askrigor_living_evidence_private`; writable mounts
   `/var/lib/askrigor-actions`, `/var/lib/askrigor-research-sessions` and `/var/lib/askrigor/lesson-incidents`;
   one log line.

## Live acceptance

- **In-image probe** (without its Gemini video read):
  - build `18a09a35`, HRP 20.6.11 and Universal 20.5.35 with their fingerprints;
  - 33 tools, with the versions in the first description and in the server title;
  - Gemini catalog 22;
  - `load_protocol` index;
  - one PubMed record with a signed receipt;
  - the Reddit check (`found` and `not_found`);
  - ledger modes 0700 and 0600.
- **Public:**
  - `/version` build `18a09a35ea5b` with both versions;
  - `/mcp` lists 33 tools, and `finalize_research`'s description now begins "Final check of a research answer
    before it is given", with no "Call before" or "do the required work anyway";
  - `/privacy`, `/terms` and `/support` answer 200.
- **Signed-in connector (this session):** the manifest shows HRP 20.6.11, `38606fbc…`, and
  `connection: {sign_in: accepted, research_access: ready}`.
- **Promotion:** the manual one-shot completed (`no_pending_promotion`); the timer is re-enabled.
- **ChatGPT:** whether the "Suspicious Instruction" warning is gone can only be seen in ChatGPT.

## Plugin

- **Before:** `0.1.0+codex.20261004044030.hrp.20.6.10.universal.20.5.34`, receipt `517f615afb46c304…`.
- **Rollback copy:** `/home/joel/plugins/askrigor.rollback-20261007T033157Z`.
- **Update:** `plugin.json` equals main's apart from the version, which now carries the new protocol versions:
  `0.1.0+codex.20261007033157.hrp.20.6.11.universal.20.5.35`. `SKILL.md` equals main's.
- **Reinstall:** `codex plugin add askrigor@personal`.
- **Receipts:** source and installed are both `ecef66c8098149e7…`, 8 files.

## Rollback

Stop and disable the promotion timer; restore the selector and `runtime.env` from the rollback folder above;
recreate only `research-mcp` with `askrigor-research:rollback-pre-18a09a35ea5b`; check health and the security
envelope; re-enable the timer. Plugin: restore the rollback copy and run `codex plugin add askrigor@personal`. No
migration ran, so the database needs no step.
