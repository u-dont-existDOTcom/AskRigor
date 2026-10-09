# Production release, 2026-10-09 (owner question 56)

- **Owner decision:** "56a", typed in this session. Question 56, option A: merge #291 and deploy it on its own now;
  the bigger release (#288 to #290) waits.
- **Contents:** #286 (the record of the previous release), #289 (`scale_results`: a scale result in the answer
  carries its range, compared values and benchmark) and #291 (sign-in requests `offline_access`; a missing required
  declaration names the way out when a chat's tool list is outdated). No migrations and no protocol, skill or plugin
  change.
- **Source:** #291 head `5270a3bc` passed all seven checks. It merged at 03:34:58 UTC as
  `47eb3994241e0b6d74a35c42f859661095a0933d`, a true merge whose tree equals the build source.
- **Image:**
  - built from a `git archive` of `5270a3bc` and tagged `askrigor-research:47eb3994241e0b6d74a35c42f859661095a0933d`;
  - ID `sha256:afd4f161dd55c6e493716f2a234aa443177f68fae724b010eb6447a383943b9a`, user `node`, workdir `/app`;
  - archive 109,019,735 bytes, SHA-256 `68720e5a240e7d7988c0a77def8f5eaa3f3efe556f26cea6b0742b10f0abb1e5`;
  - no-secret gate: `/healthz` ok, HRP 20.6.11 and Universal 20.5.35, one log line. Its OAuth metadata scopes were
    empty because the gate container has no OAuth settings, so they were checked in production instead.
- **Prior state:** `askrigor-research:c27ff3e954bc3e9e236f33831ae61cbc2138c2d8`, up 39 hours, healthy; selector
  `73a1de53ad2e594a`; `runtime.env` `dad7ecf58cbcad6e`.
- **Production:**
  - the checksum file verified, and the loaded ID equals the laptop's;
  - the timer was stopped and disabled, and no promotion run was in progress;
  - rollback tag `askrigor-research:rollback-pre-47eb3994241e`, with the selector, `runtime.env` and both Compose
    files in `/opt/askrigor/rollbacks/pre-47eb3994241e0b6d74a35c42f859661095a0933d`;
  - schema dump 510,374 bytes, SHA-256 prefix `6c40badc85f9b39f`, mode 0600;
  - migrate complete, run with `-T` and stdin closed;
  - only `ASKRIGOR_BUILD_COMMIT` changed: 62 names, new prefix `8e08469f542d31e1`; selector `1560e2d16930c659`;
  - only `research-mcp` was recreated at 03:37:11 UTC; healthy at 03:37:18;
  - security envelope unchanged: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs,
    the same three writable mounts, both networks, one log line.
- **Acceptance:**
  - `/version` build `47eb3994241e`, with HRP 20.6.11 and Universal 20.5.35;
  - the protected-resource metadata for `/mcp` and `/mcp/claude` lists `research:use`, `cases:review` and
    `offline_access`; the `/mcp/claude` 401 challenge asks for `research:use cases:review offline_access`;
  - `/mcp` has 33 tools, and `finalize_research` takes `scale_results` and `commercial_review_applicability`;
  - the in-image probe passed: 33 tools (22 in the Gemini catalog), both manifests, `load_protocol`, a PubMed
    receipt, one video extraction (3 Gemini calls, 60 seconds of video), a Reddit lookup found and a missing one
    reported as not found, and the private state modes 700 and 600;
  - the signed-in connector shows research access `ACTIVE` (`FREE_CONTRIBUTOR`);
  - `/privacy`, `/terms` and `/support` answer 200;
  - the promotion one-shot completed (`no_pending_promotion`), and the timer is re-enabled, next run 03:50:10 UTC.
- **Plugin:** no protocol or skill change since `c27ff3e`, so no reinstall. Receipt `ecef66c8098149e7…` (8 files) for
  both the source and installed package, version `0.1.0+codex.20261007033157.hrp.20.6.11.universal.20.5.35`; the
  installed `SKILL.md` equals main.
- **Still open:**
  - Auth0 issues a refresh token only when the API allows it. The owner turns on **Allow Offline Access** for the
    `AskRigor MCP` API (`https://mcp.askrigor.com/mcp`), then removes and re-adds the AskRigor connector in ChatGPT
    so it signs in again with `offline_access`. Until then, ChatGPT connections still expire with their first
    access token.
  - The sign-in prompts that three tools return still name only their own scope. #292 adds `offline_access` to them
    for the next release.
- **Rollback:** stop and disable the timer; restore the selector and `runtime.env` from the rollback folder; recreate
  only `research-mcp` with `askrigor-research:rollback-pre-47eb3994241e`; check health; re-enable the timer. The
  database needs no step.
