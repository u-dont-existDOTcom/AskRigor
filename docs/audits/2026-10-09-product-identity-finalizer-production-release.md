# Production release, 2026-10-09, second (owner question 60)

- **Owner decision:** "60a", typed in this session. Question 60, option A: merge #293, #288 and #290, in that order,
  and deploy now. #292 was held, then closed (owner question 61).
- **Contents:**
  - #293: the record of this morning's release, with the corrected open items;
  - #288: exact product identity in the YouTube tools, and final-check declarations for item identity,
    whole-intervention identity and destination-bound shopping, with HRP 20.6.12 and Universal 20.5.36 (owner
    questions 47 and 50);
  - #290: the final-check contract, linked key studies, no `not_relevant` bypass for comparisons or products, the
    buyer-review outcome search, the `exporter_lead` offer state, and the question-58 wording, HRP 20.6.13 and
    Universal 20.5.37.
  - No migrations and no site change.
- **Source:**
  - #293 merged at 21:59:26 UTC as `442263cd`, and #288 at 22:02:42 UTC as `0725cea8`.
  - #290 was retargeted to main, brought up to date as `dc35e2b4`, and merged at 22:06:53 UTC as
    `417b1c6ff6d9432f10f6c0a50dedabea10d07a38`, a true merge whose tree equals `dc35e2b4`.
  - Each head passed all seven checks before its merge.
  - On the laptop, `npm run verify` passed on `dc35e2b4`: 214 test files, 2,622 tests, typecheck and build.
  - **CI note:** from about 20:54 UTC, every run failed while pulling the pinned `postgres` service image. The first
    errors were Docker Hub rate limits, then authentication timeouts. Docker reported "Hub Registry Authenticated
    Actions Failing" from 21:45 UTC and the registry operational again at 21:56. A re-run then passed. The code and
    the pinned image were not changed.
- **Image:**
  - built from a `git archive` of `dc35e2b4` and tagged `askrigor-research:417b1c6ff6d9432f10f6c0a50dedabea10d07a38`;
  - ID `sha256:25fd7c78727095767cfd60d7e02a395931ee4824c9d6b1a6cb76428859c956d2`, user `node`, workdir `/app`;
  - archive 109,047,765 bytes, SHA-256 `0a694069f48482c1300d94115d6d95625d8118adfe0f0eee1c134615fd55215f`;
  - no-secret gate: `/healthz` ok, HRP 20.6.13 `b6e2b08322c52678` and Universal 20.5.37 `342e32e1568954ed`, one log
    line.
- **Prior state:** `askrigor-research:47eb3994241e0b6d74a35c42f859661095a0933d`, up 18 hours, healthy. SHA-256
  prefixes: selector `1560e2d16930c659`, `runtime.env` `8e08469f542d31e1`, `compose.yaml` `0dca180709940dd6`,
  `compose.living-evidence.yaml` `5631ff8150eea2a8`.
- **Production:**
  - the checksum file verified, and the loaded ID equals the laptop's;
  - the timer was stopped and disabled, and no promotion run was in progress;
  - rollback tag `askrigor-research:rollback-pre-417b1c6ff6d9`, with the selector, `runtime.env` and both Compose
    files in `/opt/askrigor/rollbacks/pre-417b1c6ff6d9432f10f6c0a50dedabea10d07a38`;
  - schema dump 510,374 bytes, SHA-256 prefix `a76880d7321f1a81`, mode 0600;
  - migrate complete, run with `-T` and stdin closed;
  - only `ASKRIGOR_BUILD_COMMIT` changed: 62 names, new prefix `5780fa2738ef2fa2`; selector `0af73b66fa3531d1`;
  - only `research-mcp` was recreated, at 22:07:15 UTC, and it was healthy at 22:07:22;
  - security envelope unchanged: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs, the
    same three writable mounts, both networks, one log line.
- **Acceptance:**
  - `/version` build `417b1c6ff6d9`, with HRP 20.6.13 (2026-10-09, `b6e2b08322c52678`) and Universal 20.5.37
    (2026-10-09, `342e32e1568954ed`);
  - `/mcp` has 33 tools, and the first description carries the new versions. `finalize_research` takes
    `intervention_identity`, `shopping` (with `exporter_lead`), `scale_results` and
    `commercial_review_applicability`, and its output carries `contract`;
  - the in-image probe passed:
    - 33 tools, 22 in the Gemini catalog;
    - both manifests and `load_protocol`;
    - a PubMed receipt;
    - one video extraction: 2 Gemini calls, 47 seconds;
    - a Reddit lookup found, and a missing one reported as not found;
    - private state modes 700 and 600;
  - the signed-in connector: the HRP manifest shows 20.6.13 `b6e2b083…`, with `sign_in: accepted` and
    `research_access: ready`. Research access is `ACTIVE` (`FREE_CONTRIBUTOR`);
  - `/privacy`, `/terms` and `/support` answer 200;
  - the promotion one-shot completed (`no_pending_promotion`). The timer is re-enabled, next run 22:10:01 UTC.
- **Plugin:**
  - before: `0.1.0+codex.20261007033157.hrp.20.6.11.universal.20.5.35`, receipt `ecef66c8098149e7…`, 8 files;
  - rollback copy `/home/joel/plugins/askrigor.rollback-20261009T221000Z`;
  - `plugin.json` equals main's apart from its version, now
    `0.1.0+codex.20261009221000.hrp.20.6.13.universal.20.5.37`, and every other file equals main's;
  - reinstalled with `codex plugin add askrigor@personal`;
  - source and installed receipts are both `1fe804edf385b6b2…`, 8 files.
- **Still open:** #294, which removes the offline-access listing (owner question 61), waits for a release question.
  The owner-library route (owner question 59) is being built on top of #287.
- **Rollback:**
  1. Stop and disable the timer.
  2. Restore the selector and `runtime.env` from the rollback folder.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-417b1c6ff6d9`, and check its health.
  4. Re-enable the timer.
  5. For the plugin, restore the rollback copy and run `codex plugin add askrigor@personal`.

  The database needs no step.
