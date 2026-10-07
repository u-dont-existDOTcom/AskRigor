# Production release, 2026-10-07, third (owner question 43)

- **Owner decision:** "43: merge 285 and deploy", typed in this session.
- **Source:** #285 was brought up to date with main (head `e67c5fe9`), and all seven checks passed. It merged as
  `c27ff3e954bc3e9e236f33831ae61cbc2138c2d8`, a true merge whose tree equals the build source.
- **Image:**
  - built from a `git archive` of `e67c5fe9` and tagged `askrigor-research:c27ff3e954bc3e9e236f33831ae61cbc2138c2d8`;
  - ID `sha256:6f577b388d7c6a904e8c9e1cf5d126379430466ef4433c62e95e82cd5f8b2d40`;
  - archive 109,013,720 bytes, SHA-256 `31c239f1481ddecc68dfc3d0cf45951795ab24013728548aae6c68119f89243f`;
  - no-secret gate: `/healthz` ok, HRP 20.6.11 and Universal 20.5.35, one log line.
- **Prior state:** `askrigor-research:18a09a35ea5ba474016322e4f48d01b50d5c3e3b`, up 9 hours, healthy; selector
  `db921c1e88595309`; `runtime.env` `38633d58ca54749f`.
- **Production:**
  - the checksum file verified, and the loaded ID equals the laptop's;
  - the timer was stopped and disabled;
  - rollback tag `askrigor-research:rollback-pre-c27ff3e954bc`, with the selector, `runtime.env` and both Compose
    files in `/opt/askrigor/rollbacks/pre-c27ff3e954bc3e9e236f33831ae61cbc2138c2d8`;
  - schema dump 492,982 bytes, SHA-256 prefix `e3b4f50e78df9e71`, mode 0600;
  - migrate complete, with no new migrations, run with `-T` and stdin closed;
  - only `ASKRIGOR_BUILD_COMMIT` changed: 62 names, new prefix `dad7ecf58cbcad6e`; selector `73a1de53ad2e594a`;
  - only `research-mcp` was recreated at 12:54:45 UTC; healthy at 12:54:52;
  - security envelope unchanged: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs,
    the same three writable mounts, one log line.
- **Acceptance:**
  - `/version` build `c27ff3e954bc`, with HRP 20.6.11 and Universal 20.5.35;
  - `/mcp` has 33 tools, and `finalize_research` takes `commercial_review_applicability`;
  - the signed-in connector shows `research_access: ready`;
  - `/privacy`, `/terms` and `/support` answer 200;
  - the promotion one-shot completed (`no_pending_promotion`), and the timer is re-enabled.
- **Plugin:** no protocol or skill change, so no reinstall. Receipt `ecef66c8098149e7…`, version
  `0.1.0+codex.20261007033157.hrp.20.6.11.universal.20.5.35`.
- **Rollback:** stop and disable the timer; restore the selector and `runtime.env` from the rollback folder; recreate
  only `research-mcp` with `askrigor-research:rollback-pre-c27ff3e954bc`; check health; re-enable the timer. The
  database needs no step.
