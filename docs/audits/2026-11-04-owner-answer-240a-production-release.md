# Production release, 2026-11-04 (owner answer 240a)

- **Owner decision:** "240: A, release AskRigor#398", typed on 4 Nov at about 14:08 UTC in the session that made this
  release, with "239 a1" in the same message. On 3 Nov the owner had answered "238b" (wait). Question 240 asked again,
  because the research lanes were publishing to the Atlas on a build without "kept for research".
- **Contents of #398**, the build after #394:
  - the fixes from the regression list on #394's build: forum threads count as key sources, Reddit searches ask for a
    page of 25, busy reads say when to try again, papers without a DOI are fetched by PMID or PMCID, and full-text calls
    return in time;
  - 220a: the panel lists the checked figures;
  - 219b: findings say whether they draw on YouTube comments, and comments read one video at a time count too;
  - 221: the meaning judge, off until the owner switches it on for the dev accounts, capped at $3 a day;
  - 230a: the forum reader names each failure, and stops for that research if Reddit blocks it;
  - 234a: "kept for AskRigor's research" (migration 0024, two functions for the review role);
  - Dependabot alert 34 (`@hono/node-server` 2.1.6).

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), and so are HRP 20.6.36 and Universal 20.5.46, so **no app needs a refresh**. The compose files
  and `runtime.env` names are unchanged (78 names) apart from the build line.
- **Before deploying:**
  - `npm run lessons:status` at 14:09 UTC: open 36, needs review 2, accepted but not incorporated 1, incorporated or
    closed 38, deletion eligible 0, lane items unrecorded 0.
  - `npm run verify` on `ac0ac3c3`: typecheck passed, 5,492 tests passed, 6 skipped, and one failed on a 10-second
    timeout under load (`tests/controlled-research-route.test.ts`, "binds project_router leading-BOM bytes"). It passed
    alone three times out of three, and `npm run build` then passed. All seven CI checks passed on that head.
- **Source:** marked ready and merged at `ac0ac3c3` at 14:16:37 UTC as `06fe887d65b56213dbf368e7c6ea91220b132e19`, whose
  tree equals the head.
- **Image:** source archive SHA-256 `4f627947b544399d0d0e8e2495f5cfe2721bb3feab9514ab86237bdda8be7415`; ID
  `sha256:f385efdde53eef5a0c33e4b441dc28386c0cc49ce97d57da8ba0cc821976435a`, user `node`; image archive 132,699,688
  bytes, SHA-256 `c4827dcacd81178f41c2ef4a29d83d485fc0444e2021c2513137a22528b0fb25`. No-secret gate: `/healthz` ok,
  HRP 20.6.36 and Universal 20.5.46, one log line, none naming a credential.
- **Prior state (stage A, 14:19:36 UTC):**
  - `research-mcp` on `b9e658e2`, up 2 days, healthy;
  - selector `1d2c103fa01e8e2a`, `runtime.env` `a97a795e7ec81ebd` (78 names, 8 Atlas lines), compose
    `3b37929292d54f98`, both role scripts the last release's;
  - the reader's directory, key and known hosts at 750, 400 and 444;
  - the site on the `b9e658e2` release, the timer enabled, 65G free.
- **Switch (stage B, run on the host from a file):**
  - the first run stopped at 14:20 UTC, before any change: the reader probe got `busy`, because the research lanes
    were using the one shared reader. The probe now waits for the reader, up to 12 tries, and still needs a full read;
  - the second run: the new image read a Reddit search and a thread through production's key (`READER_OK`), the timer
    was stopped and disabled, the schema dump is 15,156,020 bytes, SHA-256 prefix `3c68ec7b79ce2bf3`, and migrate
    completed with 0018 to 0024 recorded with the release files' hashes;
  - both role scripts re-run: the review role has exactly its 27 functions and the access role its 11, and the
    boundaries are proven again;
  - selector `1f8f3bab1ae6fe5f`, compose `3b37929292d54f98`;
  - `research-mcp` recreated at 14:21:14 UTC, healthy, with the reader's mount read-only.
- **Acceptance (stage C, 14:21 UTC):**
  - **public:** `/version` reports the build, HRP 20.6.36 and Universal 20.5.46; an unauthenticated POST to
    `/mcp/claude` gets 401; anonymous `/mcp` lists 35 tools, equal to the frozen fixture; the privacy, terms and support
    pages give 200, the Atlas 200, and the sign-in redirect 302;
  - **host:** the security envelope, the three writable mounts, and one log line, none credential-like; the in-image
    probe, with 35 tools, the three tool-list versions equal to their fixtures, and a passing check returning its
    checked answer; the panel folds the note and what was checked; the full-text probe; the forum reader (`READER_OK`);
    and shared answers on;
  - **review actions probe:** 14 of 14 named in the published `/mcp/claude` schema;
  - **blocking probe:** a clean draft `ready_with_limits`, and a missing source receipt and a broken figure `not_ready`;
  - **promotion:** the one-shot succeeded (`no_pending_promotion`, `complete`), and the timer is enabled and active.
- **Site:** not released, because nothing under `site/` changed.
- **Plugin:** no packaged file changed. The source and installed copies (8 files) equal the merge's, receipt `3e83000a…`,
  so there is no reinstall.
- **Connectors:** the owner's ChatGPT app, through Codex, sees 35 tools with tool list `0d6016087ee4bc5a`, reports build
  `06fe887d`, HRP 20.6.36 and research access ACTIVE (free contributor), with no out-of-date sentence. This Claude
  account's connector reports the build and HRP 20.6.36, with sign-in accepted and research access ready.
- **After the release:**
  - `keep_for_research` moved the 74 unpublished publications ("owner answer 229a") and the 41 failed findings ("owner
    answer 231a"). P-1118, unpublished on 2 Nov for a separate reason, stayed out. A kept finding left the lists, its
    page gives 200 with the kept line and `noindex`, and the Atlas lookup still returns it.
  - Owner answer 240a's quick-answer test ran on the cards the research lanes saved that day. Those that failed moved
    to kept. Two replaced cards were published again with `publish_cards`, because they held the two findings that
    passed (P-1137 and P-1145), and their other findings were kept.
- **Rollback:** `/opt/askrigor/rollbacks/pre-06fe887d65b56213dbf368e7c6ea91220b132e19` holds the prior `runtime.env`,
  selector, both compose files, the role scripts and the schema dump, and the prior image is tagged
  `askrigor-research:rollback-pre-06fe887d65b5`. To return build `b9e658e2`:
  1. stop and disable the promotion timer, deleting no proposals, intents, receipts or canonical evidence;
  2. restore the prior selector, `runtime.env` and compose file;
  3. recreate `research-mcp`.

  Migration 0024 only adds two columns, an index and two functions, so build `b9e658e2` runs on the migrated schema.
