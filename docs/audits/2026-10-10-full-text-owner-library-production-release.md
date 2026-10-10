# Production release, 2026-10-09/10 (owner question 62)

- **Owner decision:** "key added. 62a", typed in this session. Option A approved the privacy sentence and said:
  merge #295, #294, #287 and #296, in that order, and deploy with the privacy page. The owner then wrote "make it
  live now, i'm the only one using this so far", so the switch came before 00:00 UTC rather than after it.
- **Contents:**
  - #295: the record of the second 2026-10-09 release.
  - #294: AskRigor no longer lists `offline_access`; clients add it themselves (owner question 61).
  - #287: full-text route recovery. A failed open-access route is not inaccessibility; public candidates and
    AI-supplied search-index copies are admitted only after identity, completeness and exact-abstract checks; access
    states are reported truthfully; HRP 20.6.14 (the question-46 wording, renumbered).
  - #296: the owner's InfoAccess library as a full-text route, used when no public copy is admitted (owner question
    59), and the privacy notice effective October 10, 2026.
  - No migrations.
- **Source:**
  - #295 merged at 23:24:22 UTC as `93866898`, and #294 at 23:27:22 as `f94f3ec5`.
  - #287 was brought up to date as `e3e4f561` and merged at 23:30:17 as `3b63e928`.
  - #296 was retargeted to main, brought up to date with the approved privacy sentence as `0552b2d9`, and merged at
    23:34:46 as `03fb5214f9b8ec853f4216ebf7ec68e8a937cadb`, a true merge whose tree equals `0552b2d9`.
  - Each head passed all seven checks.
  - On the laptop, `npm run verify` passed on `0552b2d9`: 219 test files, 2,900 tests. `test:site` validated 4 pages,
    and `test:site-deploy` passed 28 tests.
- **InfoAccess setting:** the owner added `ASKRIGOR_INFOACCESS_URL` and `ASKRIGOR_INFOACCESS_TOKEN` to `runtime.env`
  with a command that never displayed the key. Checked without reading the value: one line each, a 64-character key,
  64 names, mode 600.
- **Image:**
  - built from a `git archive` of `0552b2d9` and tagged `askrigor-research:03fb5214f9b8ec853f4216ebf7ec68e8a937cadb`;
  - ID `sha256:e8a7965990d9c9457fabfadd84de15657d67515f16ea2c113cd7c105bc78164f`, user `node`, workdir `/app`;
  - archive 109,107,544 bytes, SHA-256 `e405c606c1e6e7bc9f2cb2d50bb6bf94f40898c567ad1e1fd43a10e29157b0d6`;
  - no-secret gate: `/healthz` ok, HRP 20.6.14 `c5f544d0ad666970` and Universal 20.5.37 `342e32e1568954ed`, one log
    line.
- **Prior state:** `askrigor-research:417b1c6ff6d9432f10f6c0a50dedabea10d07a38`, up 2 hours, healthy. SHA-256
  prefixes: selector `0af73b66fa3531d1`, and `runtime.env` `f09476054e4d4170`, after the owner's InfoAccess lines.
- **Production:**
  - the checksum file verified, and the loaded ID equals the laptop's;
  - the timer was stopped and disabled, and no promotion run was in progress;
  - rollback tag `askrigor-research:rollback-pre-03fb5214f9b8`, with the selector, `runtime.env` and both Compose
    files in `/opt/askrigor/rollbacks/pre-03fb5214f9b8ec853f4216ebf7ec68e8a937cadb`;
  - schema dump 510,374 bytes, SHA-256 prefix `b526c96e448d47c2`, mode 0600;
  - migrate complete, run with `-T` and stdin closed;
  - only `ASKRIGOR_BUILD_COMMIT` changed: 64 names, new prefix `f7babed7c26db628`; selector `0b0d0940ff5b412b`;
  - only `research-mcp` was recreated, at 23:51:54 UTC, and it was healthy at 23:52:00;
  - security envelope unchanged: `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs, the
    same three writable mounts, both networks, one log line.
- **Acceptance:**
  - `/version` build `03fb5214f9b8`, with HRP 20.6.14 (`c5f544d0ad666970`) and Universal 20.5.37;
  - the protected-resource metadata lists `research:use` and `cases:review` only;
  - `/mcp` has 33 tools. `acquire_open_full_text` takes `candidate_texts` and `public_copy_search`, and its
    description names the owner library;
  - the in-image probe passed: 33 tools, 22 in the Gemini catalog, both manifests, `load_protocol`, a PubMed
    receipt, one video read (2 Gemini calls, 37 seconds), the Reddit pair, and private state modes 700 and 600;
  - signed in, the HRP manifest shows 20.6.14 `c5f544d0…`, with `sign_in: accepted` and `research_access: ready`;
  - `/privacy`, `/terms` and `/support` answer 200;
  - the promotion one-shot completed (`no_pending_promotion`). The timer is re-enabled, next run 00:10:03 UTC.
- **Full text and the library (the owner's three test papers, PMIDs 11374875, 10734247 and 14529800):**
  - Through this session's signed-in connector, the green-tea paper returned `PRIMARY_OA_ROUTES_EXHAUSTED`. Europe
    PMC and Unpaywall found nothing, and the boundary names the exact title, DOI and PMID still to search. No
    `owner_library` attempt was listed, because this connector is not signed in as the configured owner subject
    (`ASKRIGOR_OAUTH_ALLOWED_SUBJECT`, the same subject for `/mcp` and `/mcp/claude`), and it holds no paid entitlement.
  - Inside the live container, with owner access, all three papers ended in an `owner_library: error` attempt, not
    "inaccessible".
  - The InfoAccess endpoint answers 401 without the key and 200 with it.
  - Its free `get_article_pdf` tool returned, for each DOI: "Article request failed (request_failed): InfoAccess could
    not complete this request". It reported no charge. AskRigor's route behaved as designed; the failure is inside
    InfoAccess.
- **Site:**
  - Archive `askrigor-site-03fb5214f9b8….tar.gz`, 26,220 bytes, SHA-256
    `66cc78c65397b94ed71a1429d256978a8b3acf5836f50b0bc633189ab4f6794e`. It holds "Effective October 10, 2026" and the
    approved sentence, and is staged in `/root/site-release-03fb5214f9b8`.
  - The installer stopped before changing anything: "expected exactly one running Caddy container for the validated
    Compose files". On 2026-10-09 at 05:00 UTC, the `/opt/askrigor/active-https` selector was moved to a newer HTTPS
    release dated 2026-10-09. The running Caddy was started on 2026-10-04 from the earlier release. That change was
    not part of this release.
  - **Owner question 63, answered "63A":** for the install only, the selector was pointed at the HTTPS release the
    running Caddy uses. The installer then activated `03fb5214…` and recreated Caddy at 00:35:51 UTC, still on the
    2026-10-04 configuration. The selector was restored to the 2026-10-09 release afterwards. The first restore step,
    placed after the installer in the same `bash -s` script, never ran: the installer's own `docker compose` read the
    rest of the script from stdin. A separate command restored it at about 00:37.
  - **Live:** `/privacy` reads "Effective October 10, 2026" and holds both the question-46 public-copy sentence and the
    question-62 library sentence. `/terms`, `/support`, `/` and `mcp.askrigor.com` answer 200.
  - **InfoAccess cross-check:** the owner's own InfoAccess connection got the same "request_failed" answer for the
    green-tea DOI as the server's key, so the failure does not depend on which key is used. The owner reports
    that full texts did come back through AskRigor in ChatGPT.
- **Plugin:**
  - before: `0.1.0+codex.20261009221000.hrp.20.6.13.universal.20.5.37`, receipt `1fe804edf385b6b2…`;
  - rollback copy `/home/joel/plugins/askrigor.rollback-20261010T001203Z`;
  - `plugin.json` equals main's apart from its version, now `0.1.0+codex.20261010001203.hrp.20.6.14.universal.20.5.37`,
    and every other file equals main's;
  - reinstalled with `codex plugin add askrigor@personal`;
  - source and installed receipts are both `48b985a224aa5d07…`, 8 files.
- **Rollback:**
  1. Stop and disable the timer.
  2. Restore the selector and `runtime.env` from the rollback folder. The owner's InfoAccess lines are in that
     `runtime.env` too.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-03fb5214f9b8`, and check its health.
  4. Re-enable the timer.
  5. For the plugin, restore the rollback copy and run `codex plugin add askrigor@personal`.

  The database needs no step. Site: reinstall the 2026-10-04 site archive with the installer.
