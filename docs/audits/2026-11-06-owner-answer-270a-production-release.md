# Production release, 2026-11-06 (owner answer 270a)

- **Owner decision:** "270a", typed in chat on 6 Nov in the session that made this release, with 267b (the site update goes out with it) and 269a in the same message. The owner had chosen 270a in their Inbox at 11:16 UTC and said "yes on the questions" at 19:46 UTC; this session's safety check refused the server step until the code itself was typed.
- **Contents:** #421, the fixes for the AskRigor faults the judges of the owner's regression rerun found (`2026-11-05-owner-regressions-412-judgment.md`):
  - the source-line lookup is tested when `later_inputs` repeats the findings card, and every check result shows the source lines' field names with a one-line JSON example;
  - the `not_quantified` note asks for `measured_exposure` first;
  - forum reads: a thread counts as read in full only from one page read with nothing before or after it; "blocked" rests on exact signals only (403, 451, a challenge known by its markup, a fetched and parsed robots.txt disallow), a 401 is its own login state, and a site that is down or busy counts as couldn't be read; a community never read gets "A community not read here";
  - DOIs holding `<` or `>` (Wiley's SICI form) are accepted at runtime percent-escaped;
  - `harms_quote` is checked whenever given, and declared quotes match as whole words in any script.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`), so **no app needs a refresh**. There is no migration and no role-script, compose or env change, and no packaged plugin file changed since the live build `efe2c13c`.
- **Before deploying:**
  - `npm run lessons:status` at 19:47:47 UTC gave: open 39; needs review 2; accepted but not incorporated 1; incorporated or closed 41; deletion eligible 0; lane items unrecorded 0.
  - All seven CI checks passed on #421's head `d920b344`. `npm run verify` there passed: 6,095 tests, 6 skipped, the typecheck and the build.
- **Source:** #421 marked ready and merged at `d920b344` at 19:48:49 UTC as `9dbc743acd849b908d68cd80bd3739b5262aa9cc`, whose tree equals the head's.
- **Image:**
  - source archive SHA-256 `b9040589aa41d7ab57bf8a431467ba99a17687f91532297e5325345204bc8e21`;
  - ID `sha256:c98e3ef53c2d364a737b92580d88e56a930a7feab83d5d22ff937a9a4a6f6ab6`, user `node`;
  - image archive 133,253,271 bytes, SHA-256 `c6bbb7d074b36ea8952e3665aa7db3643cc3e3da091b374029edb3a1d2bde2f4`, copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.40 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A, 20:12:15 UTC):** research-mcp on `efe2c13c`, healthy; `compose.living-evidence.yaml` `196da407`; the two role scripts `6e6063fb` and `d0ceedfc`; `runtime.env` 79 names, 8 Atlas lines; the promotion timer enabled; the reader and maps mounts read-only.
- **Stage B (20:13 UTC):**
  - the new image read Reddit through production's key before anything changed (`READER_OK`);
  - the timer stopped; rollback kept in `/opt/askrigor/rollbacks/pre-9dbc743acd849b908d68cd80bd3739b5262aa9cc` (the prior image tagged `rollback-pre-9dbc743acd84`, the selector, `runtime.env`, both compose files and both role scripts, and a `living_evidence` dump of 17,336,929 bytes, SHA-256 `88a4a74d961cc34d…`);
  - migrate: 0018 to 0029 recorded with the release files' hashes, and the notice check admits v5;
  - both role scripts re-run: the review role may run exactly its script's 34 functions and the access role its 15; the review role holds no table or column right, the access role exactly its own, and the reader can't read the held YouTube findings and reads the 11 Atlas tables;
  - `runtime.env`: 79 names, only the build line changed;
  - the selector names `askrigor-research:9dbc743acd849b908d68cd80bd3739b5262aa9cc`; the owner's maps file reinstalled with the same bytes (`b5a3c98b8128b7af`); the compose file unchanged;
  - research-mcp recreated at 20:13:17 UTC, healthy, with the reader and maps mounts read-only.
- **Stage C (20:13 to 20:15 UTC):**
  - public: `/version` names build `9dbc743a`, HRP 20.6.40; the protected-resource metadata and scopes; an unauthenticated POST gets 401; `/mcp` lists 35 tools, equal to the frozen fixture; the site's pages and the Atlas pages answer 200; the private page signed out gives the sign-in prompt with `Cache-Control: private, no-store`;
  - host: user `node`, read-only root, every capability dropped, `no-new-privileges`, 1 GiB and 256 processes; the three expected writable mounts; one log line, with no credential marker;
  - in-image probes: the three tool lists equal their fixtures; a passing final check and the panel's folds; the full-text routes; the forum reader; shared answers on;
  - review actions: 14 of 14 named in the published `/mcp/claude` description, the enum runtime-only as since owner answer 189a; blocking: a clean draft passes, and a key source with no receipt and an arithmetic error still block.
- **Promotion:** the hardened one-shot service ran once (success; the Atlas findings queue complete, nothing pending), the timer was enabled again, and its next trigger was 20:15:10 UTC, with the selector bound to the deployed image.
- **Plugin:** no packaged file changed since `efe2c13c` (0 of 8). The source and the installed copy (`0.1.0+codex.20261106053949.hrp.20.6.40.universal.20.5.46`) each equal the merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it was not reinstalled.
- **Connector probe (Codex's AskRigor app, 20:16 UTC):** 35 tools; `tool_list_version` `0d6016087ee4bc5a`; HRP 20.6.40 (`afd3d881356337dd`), running build `9dbc743a`; no out-of-date sentence; `inspect` ACTIVE, FREE_CONTRIBUTOR (the owner's login accepted notice v5 at 19:44:59 UTC).
- **Site:** the site update (#415) goes out right after this release, under 267b, with this record and its "What's new" lines.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-9dbc743acd84` (the image of `efe2c13c`), restore `runtime.env` from the rollback folder, and recreate research-mcp. There is no migration to undo.
