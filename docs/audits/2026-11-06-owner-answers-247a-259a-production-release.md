# Production release, 2026-11-06 (owner answers 247a and 259a)

- **Owner decisions:**
  - "247a", typed on 5 Nov at 11:47 UTC in the session that made this release: release #413 once the rerun of the 61
    runs NCBI's outage spoiled has ended, so the release doesn't change the build under test. The rerun ended at 04:38 UTC
    on 6 Nov.
  - "259 a", typed on 5 Nov at 17:54 UTC: release the Atlas stack once its checks and review pass. The owner merged it
    into main (#416) at 18:09 UTC on 5 Nov; the independent review's fixes (#417) were merged at 22:47 UTC.
- **Contents:** everything main gained since the live build `bf3581aa`.
  - **The Atlas stack:** search and a findings map; finding pages in context; people's own reports, with AI checks and
    take-down at any time; the Health tree and problem pages with an "at a glance" table; the research behind each
    finding, with what people report beside it; forum reading as a verified basis, with thread links taken only from the
    verified read.
  - **Notice v5** (owner answer 253a): every free account accepts it again before free research.
  - Migrations 0025 to 0029, and both role scripts grant the new functions.
  - **#413's own work:**
    - HRP 20.6.39 (owner answer 244a);
    - the scout charges nothing for a request Google refuses before it starts, and says why;
    - the account page;
    - a literature index's own failure says so;
    - the private-map check reads the maps store;
    - the forum reader waits out Reddit's rate limit;
    - one passage given as both source-line quotes counts once;
    - records and plans;
    - the privacy page and the terms are effective 6 November 2026.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so **no app needs a refresh**. No setting, compose file or mount changed, apart from the build line.
- **Before deploying:** `npm run lessons:status` at 04:44 UTC gave:
  - open 39;
  - needs review 2;
  - accepted but not incorporated 1;
  - incorporated or closed 41;
  - deletion eligible 0;
  - lane items unrecorded 0.

  All seven CI checks passed on `c05a8d9b`.
- **Source:** marked ready and merged at `c05a8d9b` at 04:54:53 UTC as `11483f3d5d83fe024f5f9247f17f3202aff3ed6f`, whose
  tree equals the head's.
- **Image:**
  - source archive SHA-256 `3aac4baf0effa0f4d7b93db5f31f29b27c8ca40c1fcb59e4727d792cfc0acc55`;
  - ID `sha256:dad3178cf21dc4893b5ebf82c28da7fe8d66c573f5719c466cd8f1cd6455b4a1`, user `node`;
  - image archive 133,080,017 bytes, SHA-256 `f1443a0a79d5e5d5c264cf9bf3530343776251a83b11bf75d0799aba2aed6c0b`, copied with
    `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.39 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A):**
  - `research-mcp` on `bf3581aa`, healthy;
  - selector `98d9b10eb5fe1855`, `runtime.env` `bb3f36b135d11b4a` (78 names, 8 Atlas lines), compose `3b37929292d54f98`;
  - both role scripts were the last release's;
  - the site was on the `b9e658e2` release;
  - the timer was enabled.
- **Switch (stage B, run on the host from a file, at about 05:00 UTC):**
  - the new image read Reddit through production's key (`READER_OK`);
  - the timer was stopped and disabled;
  - schema dump 17,270,044 bytes, SHA-256 prefix `1a7377e14b7249d1`;
  - migrate completed, with 0018 to 0029 recorded with the release files' hashes and the notice check admitting v5;
  - both changed role scripts ran: the review role holds exactly its 34 functions and the access role its 15;
  - the boundaries were proven again, and the reader reads the eleven Atlas tables but not the held YouTube findings;
  - selector `d622e7ac41e1f6c4`;
  - `research-mcp` was recreated at 05:00:12 UTC, healthy, with the reader's mount read-only.
- **Acceptance:**
  - **public:**
    - `/version` reports the build, HRP 20.6.39 and Universal 20.5.46;
    - an unauthenticated POST to `/mcp/claude` gets 401;
    - anonymous `/mcp` lists 35 tools, equal to the frozen fixture;
    - the privacy, terms and support pages give 200;
    - the Atlas, its map, topics, sitemap, a search and the account page give 200, and the sign-in redirect 302;
  - **host:**
    - the security envelope, the three writable mounts, and one log line, none credential-like;
    - the in-image probe, with the three tool-list versions equal to their fixtures, the free contributor notice
      `free-contributor-v5-2026-11-05`, the round limit 10, and a passing check returning its checked answer;
    - the panel folds;
    - the full-text probe;
    - the forum reader (`READER_OK`);
    - shared answers on;
  - **review actions probe:** 14 of 14 named in the published `/mcp/claude` schema;
  - **blocking probe:** a clean draft gets `ready_with_limits`; a missing source receipt and a broken figure get `not_ready`;
  - **promotion:** the one-shot succeeded (`complete`, `no_pending_promotion`), and the timer is enabled and active (next
    run 05:05:03 UTC).
- **Site (released at about 05:02 UTC, because the privacy page, the terms and robots.txt changed):**
  - the archive's tar equals the separately built one (`1967dfd12183bc21…`);
  - archive SHA-256 prefix `6cf1b6e5e1fcb178`, installer `4416e9f8e871410a`;
  - the live home, privacy, terms and support pages and robots.txt equal the merge's;
  - both legal pages read "Effective November 6, 2026";
  - the Atlas through askrigor.com answers with its security headers and equals mcp.askrigor.com/atlas.
- **Plugin:** no packaged file changed since `bf3581aa`. The source and installed copies equal the merge's (receipt
  `3e83000a…`), so there is no reinstall.
- **Connectors:**
  - The owner's ChatGPT app, through Codex, sees 35 tools with tool list `0d6016087ee4bc5a` and reports build `11483f3d`
    and HRP 20.6.39, with no out-of-date sentence. Research access inspects as `UNENROLLED`: the owner's account hasn't
    accepted notice v5 yet.
  - This Claude account's connector reports the build and HRP 20.6.39, with sign-in accepted. Its next step says the free
    contributor notice has changed.
- **Not done at release:**
  - **Notice v5 for the owner's login:** accepting an agreement in the owner's name needs the owner's own words. The owner
    is asked (question 268); until then, free research on that login is refused with the notice's next step.
  - **`publish_cards` for the cards' context:** not run. Every unreviewed publication but two is kept off the pages by the
    owner's decisions (229a, 231a, 240a), and republishing could undo a keep. The two shown findings (P-1176, P-1177)
    are listed without their question until a context step that leaves keeps alone exists.
  - **November's scout counter (245a, 247a):** the ledger holds exactly the 50 refused requests' $50, last charged on
    1 Nov at 22:21 UTC. Setting it to $0 is a file change on the server, which the session's safety check refused without
    the owner's words in the session. It is unchanged. The one scout call that reads Google's reason waits for it and
    for notice v5.
- **Rollback:** `/opt/askrigor/rollbacks/pre-11483f3d5d83fe024f5f9247f17f3202aff3ed6f` holds the prior `runtime.env`,
  selector, both compose files, the role scripts and the schema dump. The prior image is tagged
  `askrigor-research:rollback-pre-11483f3d5d83`. The infra README's hazard holds: once this release stores a version 3
  publication, an intent carrying research or `forum_read`, or a card with its research, `bf3581aa` can't read them, so
  a rollback then needs a tolerant hotfix of that image. Check first with the README's three read-only queries. Below v5,
  use `research-use-notice-v5-hold.sql` and `-restore.sql`; undo no migration. To return:
  1. stop and disable the promotion timer, deleting no proposals, intents, receipts or canonical evidence;
  2. restore the prior selector, `runtime.env` and compose file, and the role scripts;
  3. recreate `research-mcp`;
  4. reinstall the `b9e658e2` site release.
