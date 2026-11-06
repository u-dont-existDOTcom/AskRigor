# Production release, 2026-11-06 (owner answers 262a and 260a)

- **Owner decisions:**
  - "261a 262a", typed on 5 Nov in the session that made this release; 262a: release #414 right after #413.
  - 260a: the owner's private page goes out with the Atlas release.

  #413 and the Atlas went live at 05:00 UTC the same morning (`2026-11-06-owner-answers-247a-259a-production-release.md`).
- **Contents:**
  - **#418, the owner's private page:** `/atlas/account/private`, owner only, shows the comment maps and links to the
    owner's pages on GitHub. Signed out, it gives the sign-in prompt; anyone else signed in gets a 404.
    - The overlay compose file mounts the maps folder read-only beside the Reddit reader's.
    - `runtime.env` gains `ASKRIGOR_PRIVATE_COMMENT_MAPS_FILE`.
    - The site's Atlas block keeps the page's own `Referrer-Policy`.
  - **#414, HRP 20.6.40** (owner answers 249a, 250a and 251a):
    - how each study was read, said beside it (`source_reading`);
    - the study map;
    - `community_leads`, the loop from people's reports to study searches;
    - the free Claude test's lessons;
    - the rerun's judgment and #413's release record.

    `skills/askrigor/SKILL.md` changed, so the plugin was reinstalled.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so **no app needs a refresh**. There is no migration and no role-script change.
- **Before deploying:**
  - `npm run lessons:status` at 05:29 UTC gave: open 39; needs review 2; accepted but not incorporated 1; incorporated or
    closed 41; deletion eligible 0; lane items unrecorded 0.
  - #418 merged at its checked head `e4e2419b` as `fc4d23e6`. #414 then took main in.
  - All seven CI checks passed on #414's head `668a49d9`. `npm run verify` there passed: 6,064 tests, 6 skipped, the
    typecheck and the build.
- **Source:** #414 marked ready and merged at `668a49d9` at 05:33:52 UTC as
  `efe2c13cd5547db253c62620165a5cd8d27961e2`, whose tree equals the head's.
- **Image:**
  - source archive SHA-256 `c9fc58ae6023959f2c733e2cae2ebc0c4ab07ea32b3eb1f009b1dbdee7f8ea9f`;
  - ID `sha256:8e8b980a4462fd27ae66347877653977b943bc8e12f6bb4d062341b6e9f98d1e`, user `node`;
  - image archive 133,224,140 bytes, SHA-256 `1a121149bbe9dafb6b077b3aaa39ee3648d33e5ae2c2de26bb680cb91e920600`, copied
    with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.40 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A):**
  - `research-mcp` on `11483f3d`, healthy;
  - selector `d622e7ac41e1f6c4`, `runtime.env` `6f850be117503dd9` (78 names), compose `3b37929292d54f98`;
  - both role scripts were the last release's;
  - the site was on the `11483f3d` release;
  - the timer was enabled.

  The owner's maps file was copied to the host root-only (145,361 bytes; only its hash was printed).
- **Switch (stage B, run on the host from a file, at about 05:37 UTC):**
  - the merged service's mounts were checked to be the expected five, the maps folder read-only;
  - the new image read Reddit through production's key (`READER_OK`);
  - the timer was stopped and disabled;
  - schema dump 17,310,880 bytes, SHA-256 prefix `44e6c47b47128545`;
  - migrate completed with 0018 to 0029 unchanged;
  - both role scripts re-ran, with exactly 34 and 15 functions and the boundaries proven again;
  - `runtime.env` gained the maps line (79 names);
  - the maps folder was installed (0700, UID and GID 1000), and the file inside it (0600) written whole under a temporary
    name;
  - selector `ac99e25878453e10`, compose `196da40787f57739`;
  - `research-mcp` was recreated at 05:37:36 UTC, healthy, with the reader's and the maps' mounts read-only. The service
    reads the maps file.
- **Acceptance:**
  - **public:**
    - `/version` reports the build, HRP 20.6.40 and Universal 20.5.46;
    - an unauthenticated POST to `/mcp/claude` gets 401;
    - anonymous `/mcp` lists 35 tools, equal to the frozen fixture;
    - the legal pages and the Atlas pages answer as after the morning's release;
    - `/atlas/account/private` signed out gives the sign-in prompt with `Cache-Control: private, no-store`;
  - **host:**
    - the envelope, the three writable mounts, and one log line, none credential-like;
    - the in-image probe, with the three tool-list versions equal to their fixtures and notice v5;
    - the full-text probe;
    - `READER_OK`;
    - shared answers on;
  - **review actions probe:** 14 of 14;
  - **blocking probe:** a clean draft gets `ready_with_limits`; a missing source receipt and a broken figure get `not_ready`;
  - **promotion:** the one-shot succeeded, and the timer is enabled and active (next run 05:40:01 UTC).
- **Site (released at about 05:39 UTC, for the Atlas block's `?Referrer-Policy`):**
  - the archive's tar equals the separately built one (`7b2a8ab0ebf4717a…`);
  - archive SHA-256 prefix `f491fb2aac3307f2`;
  - the live pages and robots.txt equal the merge's;
  - the Atlas through askrigor.com, the private page included, answers as expected.
- **Plugin:**
  - The prior registration `0.1.0+codex.20261022222738.hrp.20.6.31.universal.20.5.46`, receipt `3e83000a…`, is kept as
    `/home/joel/plugins/askrigor.rollback-20261106T053949Z`.
  - It was reinstalled with `codex plugin add askrigor@personal` as
    `0.1.0+codex.20261106053949.hrp.20.6.40.universal.20.5.46`.
  - The source and installed receipts are both `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, over 8
    files, each equal to the merge's apart from the manifest version.
- **Connectors:**
  - The owner's ChatGPT app, through Codex, sees 35 tools with tool list `0d6016087ee4bc5a` and reports build `efe2c13c`
    and HRP 20.6.40, with no out-of-date sentence. Research access still inspects as `UNENROLLED`, waiting for the
    owner's notice v5.
  - This Claude account's connector reports the build and HRP 20.6.40, with the notice-changed next step.
- **Waiting for the owner:**
  - signing in to the Atlas to see the private page, the one check only the owner's login can make;
  - notice v5 (question 268) and the scout counter (question 269).
- **Rollback:** `/opt/askrigor/rollbacks/pre-efe2c13cd5547db253c62620165a5cd8d27961e2` holds the prior `runtime.env`,
  selector, both compose files, the role scripts and the schema dump. The prior image is tagged
  `askrigor-research:rollback-pre-efe2c13cd554`. To return build `11483f3d`:
  1. stop and disable the promotion timer, deleting no proposals, intents, receipts or canonical evidence;
  2. restore the prior selector, `runtime.env` (without the maps line) and compose file (without the mount);
  3. recreate `research-mcp`;
  4. reinstall the `11483f3d` site release;
  5. restore the plugin rollback copy and re-add it.

  The maps folder stays until the owner says otherwise.
