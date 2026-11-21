# Production release, 2026-11-16 (private research dossiers, stage 1 of #477, with the AI privacy reading on)

- **Owner decisions:** 329a (notice v6 covers the stage 1 private dossier and its listed contents), 330a (paid accounts
  unchanged) and 334a (release with the AI privacy reading on; the owner chose a in the Inbox at 18:49 UTC and typed
  "334a" in chat on 16 Nov 2026 at 19:42:26 UTC, in the session that released). Not a pure-fix release: it stores more
  for free accounts (privately) and changes what the privacy page says.
- **Contents:** #481, merged as `bc71b90ede758ed30c81cebbacf4bf15ef3456e5` at 20:12:52 UTC (tree equal to the tested
  head `61782eb7`; `main` had not moved since `ce1d677a`). Migration `0037_research_dossiers` (additive); both database
  role scripts changed (access to `3292cbcf…`, review to `1649203c…`); HRP 20.6.43; the private dossier at the final
  check with a deterministic privacy screen and, behind `ASKRIGOR_DOSSIER_PRIVACY_READING`, a meaning-based privacy
  reading through the research planner's Claude path and daily cap; `plan_research` asks for the dossier (runtime-only
  field); `forget_card` erases a thread's dossiers; revocation withdraws pending ones; privacy page sentences. The tool
  lists are unchanged (35 tools; mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`).
- **Before deploying:** `npm run verify` 7,018 passed (6 skipped); PostgreSQL acceptance 114 checks; notice v6 rollback
  acceptance; hosted checks 7 of 7 on `61782eb7`; three independent Codex reviews (the last: "release after fixes",
  fixed before the merge); the private-map check on every pushed commit.
- **Build and stage A (20:13 to 20:15 UTC):** image `sha256:c19698b24ec9101ea85ff5651579e5bb81b80d318a9d3665a7d124c8d51e7d2c`
  (archive 122,622,536 bytes); the host on `ce1d677a`, healthy; prior role scripts `a40256a6…` and `a01e4178…`;
  `runtime.env` 90 names; no dossier line; the planner's four prerequisite lines present.
- **Before stage B:** quiet for 714 seconds; no active database connection of the service.
- **Stage B (20:15:37 to 20:16:25 UTC):** dump 18,102,634 bytes kept with the prior files in the rollback folder; the
  prior image tagged `askrigor-research:rollback-pre-bc71b90ede75`; migrations through 0037 recorded; each role runs
  exactly its script's functions (review 37, access 18); the dossier boundary check: five tables, none readable by the
  reader or PUBLIC, six functions neither can run, the revocation trigger on; research-mcp on the new image from
  20:16:17 UTC, healthy.
- **Stage C:** the build and HRP 20.6.43 served; 35 tools with all three tool list versions equal to their fixtures;
  notice v6; the reader probe passed; the promotion one-shot succeeded; the timer is active.
- **Site:** the privacy page and the terms equal the merge's files and read "Effective November 16, 2026"; the Atlas
  answers through both hosts. Released before stage D, so the page described the privacy reading before it ran.
- **Stage D (about 20:18 UTC):** `runtime.env` kept as `runtime.env.before-dossiers`; `ASKRIGOR_RESEARCH_DOSSIERS=enabled`
  and `ASKRIGOR_DOSSIER_PRIVACY_READING=on` added; research-mcp recreated, healthy; the service reads dossiers saved,
  the privacy reading on, the planner on with its USD 3 daily cap; the tool list unchanged.
- **After:** no privacy reading has failed (planner log); no packaged plugin file changed; the rollback tag equals the
  image of `ce1d677a` and the kept files are intact. Not yet observed: the first saved dossier (it needs a qualifying
  research run).
- **Rollback:** stage D's undo first (restores `runtime.env.before-dossiers`), then the selector and `runtime.env` from
  the rollback folder; never below `ce1d677a`; hold deletion requests while an older image serves; the migration stays.
  See infra/living-evidence-production/README.md.
