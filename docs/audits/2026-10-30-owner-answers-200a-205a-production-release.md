# Production release, 2026-10-30 (owner answer 204a)

- **Owner decision:** "204a", typed in this session on 30 Oct at about 14:45 UTC with "201a 202a 203a 205a". Question
  204, option A: release #387 with the contributor notice unchanged, after retargeting it to main, dating the privacy
  page for the release day and running verify. The app's safety check twice refused the retarget on "204a" alone; the
  owner then typed "retarget 387 to main" in this session at about 17:36 UTC.
- **Contents of #387:**
  - shared questions and answers (owner answer 200a): the final check's runtime-only `share_offer` for a research
    account on the MCP connector, `manage_research_access` `share_answer` and `delete_shared_answer` (later inputs
    `sharedAnswer` and `shareCode`), and one AES-256-GCM file per shared copy with no account, kept 90 days, at most
    5,000, as the privacy page, the support page and `docs/privacy-data-map.md` say;
  - the answer states the limits that matter (owner answer 205a, HRP 20.6.34): beneath a passing check the result says
    the panel lists every limit, and the answer states those that change what the person should believe or do; under
    a check that has not passed it states them all. The check line reads "Checked with AskRigor's final check, with
    the limits it found.";
  - the YouTube scout's group-word check is gone (owner answer 201a), and a refusal names every part of the screen
    that failed;
  - HRP 20.6.33 (lesson #51 and UDA #444), outside the core;
  - the fixes from the owner regressions on #381's and #384's builds, their judgments, #384's release record, the
    record of 201a and 205a, and the privacy page dated October 30, 2026.

  There are no migrations, no role-script changes and no infrastructure, plugin-file or tool-list changes: from the
  live build, the diff touches only `site/privacy/index.html` and `site/support/index.html` among `infra`, the
  migrations, `.codex-plugin`, `skills`, `assets`, `site`, `tests/fixtures/frozen-tool-lists`, the Dockerfile and the
  workflows. The apps need no refresh.
- **Before deploying:**
  - the regression run on #384's build (96 cases) and its rerun of five capacity stops ended at 11:16:41 UTC; the rerun
    switched saving back on (`ok=true findingsSave=true`, the reply and the call's result agree) and removed its
    override. No Codex run was going at 17:47 UTC;
  - `npm run verify` on #387's head `344c6233`: 307 test files passed, 1 skipped; 5,112 tests passed, 6 skipped;
  - `npm run lessons:status` at 14:48 UTC: open 34, needs review 0, accepted but not incorporated 1, incorporated or
    closed 38, deletion eligible 0, lane items unrecorded 0.
- **Source:**
  - #387's head `344c6233` passed both checks (Deterministic verification, workflow-policy). Its base became main at
    17:36:49 UTC; it was marked ready for review and merged at 17:38:50 UTC as
    `00e9b6de42eca7db20a0aa622c2875d6806ad7fc`, a true merge whose tree equals the head;
  - the three frozen tool lists are unchanged: `/mcp` `442d2af213cbc996`, `/mcp/claude` `a53242ad0740d6bb`,
    `/mcp/gemini` `3f619c4c16156097`.
- **Image:**
  - built from a `git archive` of the merge (SHA-256 `544c9d2698896ee8d6b328f0c70a8d297995ad9195ee05e6b0e381baf1c26c3f`);
    ID `sha256:325de25d772224b8d7d2cfacd29d9c1e1c3daf3a0482dfc67264e878cd6100ee`, user `node`;
  - image archive 124,418,777 bytes, SHA-256 `6d36629771fe3eb7990b4cee7e9829d5a1aa0679713624e66b94c1246ef1d576`;
  - no-secret gate: `/healthz` ok, HRP 20.6.34 and Universal 20.5.46, one log line, and no line naming a credential.
- **Prior state (stage A, 17:41:31 UTC):**
  - `research-mcp` on `d8beec2d`, up 15 hours, healthy;
  - SHA-256 prefixes: selector `c381bfc5e8f9a604`, and `runtime.env` `08311994470462cb` (73 names, 8 Atlas lines, no
    shared-answer line);
  - both role scripts already equal the release's (`af58b9c9…`, `bab9b92a…`);
  - the actions mount (`/opt/askrigor/state/actions` to `/var/lib/askrigor-actions`) is mode 700, owned by 1000:1000,
    the image's `node` user;
  - the site is on the `0da58528` release, and the promotion timer is enabled.
- **Switch (stage B, run on the host from a file, 17:42:09 UTC):**
  - the loaded image ID matches the laptop's;
  - the timer was stopped and disabled;
  - schema dump 9,521,192 bytes, SHA-256 prefix `7e9180fe4c708f33`;
  - migrate complete, with 0018 to 0023 recorded with the same hashes;
  - both role scripts were re-run: the review role may run exactly its 25 functions, the access role exactly its 11,
    and the boundaries were proven again;
  - `runtime.env`: the build line changed, and the two shared-answer lines were added (owner answer 200a):
    `ASKRIGOR_SHARED_ANSWERS_DIRECTORY=/var/lib/askrigor-actions/shared-answers`, and
    `ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL`, 32 random bytes made on the host, written straight into the file, never
    printed, and checked different from the four other secrets. 75 names, the dev-account line kept, SHA-256 prefix
    `411898d08d03c5df`; selector `2be80cd3490991fe`;
  - only `research-mcp` was recreated, and it started at 17:42:23 UTC, healthy.
- **Acceptance (stage C, 17:43 UTC):**
  - `/version` build `00e9b6de`, with HRP 20.6.34 and Universal 20.5.46;
  - `/mcp/claude` refuses a call without sign-in (401), with scopes `research:use cases:review`;
  - anonymous `/mcp` lists 33 tools; with its two `tool_list_version` descriptions set aside, the list equals
    `tests/fixtures/frozen-tool-lists/mcp.json` exactly, and both descriptions name `442d2af213cbc996`, the fixture's
    digest;
  - inside the image, each surface's tool list version equals its fixture's (`/mcp`, `/mcp/claude` and `/mcp/gemini`);
  - `/privacy`, `/terms` and `/support` answer 200, and so does the Atlas on both addresses; the sign-in redirect is a
    302 to Auth0;
  - host: the security envelope is unchanged (`node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB,
    256 PIDs, the three writable mounts, both networks), with one log line and no credential markers;
  - the probes: 33 tools, 22 in the Gemini catalog, both manifests, HRP's core on one page, the panel and its CSP, and
    the feature probes. A passing check returns the checked answer, and the panel renders it (187);
  - shared answers (200a): on, the directory `/var/lib/askrigor-actions/shared-answers` mode 700, no copy kept, and no
    log line saying sharing is off;
  - the five checks (195a), `blocking-probe.mjs` in the live container, as for #384: a clean draft passes with limits,
    a key source with no receipt is `not_ready` (2 steps), and a number its counts don't give is `not_ready` (1 step);
  - the review actions: all 14 are named in the published `/mcp/claude` schema (the actions probe); the standard
    probe's check for them as quoted enum values finds none, as since 189a;
  - full text: a Europe PMC section search carries `full_text_scope`. The owner library indexed the green-tea and
    Overtoom papers, and refused the Walters copy as an identity mismatch, as before;
  - promotion: the one-shot succeeded (two `complete`, two `no_pending_promotion`, and the `atlas_findings` queue). The
    timer is enabled, next run 17:45:14 UTC.
- **Public site (17:45:47 UTC):**
  - the merge's own archive script built `askrigor-site-00e9b6de42ec.tar.gz` in a checkout of the merge, and its tar
    equals one built separately with `git archive` of the merge's `site` and `ops/public-site`
    (`aa505ec61e04c92a2d2181ae3b2f691cdcfaab32cdab019d08a0b9668b951953`); archive 29,330 bytes, SHA-256 prefix
    `89be4a088b350e89`, the merge's installer `72e529d5b9755c69`;
  - it was staged root-only on the host and installed with that installer: `/opt/askrigor/site/current` moved from
    release `0da58528d5f2cd77764d3dd7f6900cd05c16c4b9` to `00e9b6de42eca7db20a0aa622c2875d6806ad7fc`, and Caddy was
    recreated;
  - `askrigor.com`'s four pages (home, privacy, terms and support) equal the merge's files byte for byte; the privacy
    page reads "Effective October 30, 2026" and the terms "Effective October 25, 2026";
  - the Atlas through `askrigor.com`: `/atlas`, its stylesheet and `/atlas/changes` answer 200, an unknown Atlas page
    404, `/atlas/auth/login` 302, and `/atlasx` 404; the security headers are as before, and `askrigor.com/atlas`
    equals `mcp.askrigor.com/atlas`.
- **Connector probes:**
  - Claude (this session's connector, tool list `a53242ad0740d6bb`), 17:46 UTC: `get_protocol_manifest` returned the
    running build `00e9b6de` with HRP 20.6.34 (`7b933620…`) and Universal 20.5.46, sign-in accepted and research access
    ready, with no notice that the app's copy of the tools is out of date;
  - the ChatGPT app Codex reaches, 17:47 UTC: 33 tools, its tool list version `442d2af213cbc996` (current, with no
    refresh), both manifests on build `00e9b6de` with no out-of-date notice, and the owner's login `ACTIVE` as a free
    contributor (notice `free-contributor-v4-2026-10-25`).
- **Plugin:** no packaged file changed since the live build (8 files). Source and installed receipts are both
  `3e83000a1183ebfc…` (version `0.1.0+codex.20261022222738.hrp.20.6.31.universal.20.5.46`, whose protocol part names
  the versions at install time), and every file equals the merge's, so no reinstall.
- **Lessons:** `npm run lessons:status` at 17:48:30 UTC: open 34, needs review 0, accepted but not incorporated 1,
  incorporated or closed 38, deletion eligible 0, lane items unrecorded 0, lane pull-request items unrecorded 0.
- **Next:**
  - the same 96 cases on this build, through the ChatGPT app Codex reaches, from
    `/home/joel/askrigor-releases/20261030-387/regress`: started at 17:47:58 UTC, card saving off at 17:48:09 UTC
    (`ok=true findingsSave=false`, the reply and the call's result agree). It is judged against 193's signals, with
    the eleven low-calorie cases apart and `q135-low-stakes` for 205a;
  - the news pilot (owner answer 203a), from `/home/joel/askrigor-releases/20261030-news-pilot`: eight ScienceDaily
    health stories, one at a time, started at 17:48:19 UTC inside that run's save-off window, so no pilot research
    saves a card.
- **Rollback:**
  1. Stop and disable the timer.
  2. Restore the selector and `runtime.env` from `/opt/askrigor/rollbacks/pre-00e9b6de42eca7db20a0aa622c2875d6806ad7fc`.
     The prior `runtime.env` has neither shared-answer line, so sharing turns off.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-00e9b6de42ec` (build `d8beec2d`), and check its
     health.
  4. Re-enable the timer.
  5. The site: point `/opt/askrigor/site/current` back at release `0da58528d5f2cd77764d3dd7f6900cd05c16c4b9`, which
     stays on the host, and recreate Caddy as the installer does.

  The database needs no step. Copies already shared would stay encrypted in the directory, and the prior image runs no
  sweep, so their 90 days would not be kept: after a rollback, the owner decides whether to delete them.
