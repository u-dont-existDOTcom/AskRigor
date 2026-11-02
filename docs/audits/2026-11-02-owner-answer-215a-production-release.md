# Production release, 2026-11-02 (owner answer 215a)

- **Owner decisions:**
  - "215a", typed on 1 Nov at about 20:20 UTC, and "Yes, 215a", typed again at about 22:29 UTC in the session that made
    this release: release the forum reader after the regression list ends and is judged, with HRP 20.6.36 and the
    privacy page wording. Production's key on Mission Control was added and tested on 1 Nov.
  - "216a" (2 Nov): the regression list's maker-authors case moves to a turmeric extract.
  - "217b but keep it folded ..." (2 Nov, about 11:05 UTC): the panel folds its detail, and the comparison with the quick
    answer becomes a sixth blocking check, in this release.
- **Contents of #394**, the build after #393:
  - **The forum reader** (owner answers 211a and 213b): two new tools, `search_reddit_threads` and `read_forum_thread`.
    Reddit usernames never reach the AI, only a per-thread label. A site that refuses stays refused, robots.txt is
    respected, and no bot check is passed. Reddit is read through a dedicated host connection with production's own
    key, which is mounted read-only.
  - **Search counts in results** ("found N, read M") and the niche-topic note.
  - **The fixes that waited for a tool-list change:** the frozen "as written" wording behind the pasted limits, papers
    with only a PMID or PMCID can be fetched, and one spelling for a video known only from its description.
  - **HRP 20.6.36** (outside the core): "Where AskRigor's search_reddit_threads and read_forum_thread are available,
    use them first; a page they report as refusing access stays unread."
  - **The privacy page** names public forums and Reddit among the services a link or search words go to, effective 2
    November 2026.
  - **217b:** with the account's note on, a plain answer registered before the research is compared claim by claim, as
    a sixth blocking check. Under a passing check the panel no longer repeats the checked answer. It folds, under
    closed lines, how the answer differs from the quick answer and what the check covered, with every limit.
  - The regression list's turmeric case (216a), #393's release record and the judgment of its regression run.

  The tool list changed: 35 tools (Gemini 22, at its size limit), with fixtures mcp `0d6016087ee4bc5a`, claude
  `ad0494d60fd2376b` and gemini `9a334c4e7a117921`. **The apps need one refresh.** There is no migration or
  role-script change. The compose file adds the reader's read-only mount, and `runtime.env` gains the reader's three
  lines (75 names become 78).
- **Before deploying:**
  - `npm run verify` on the 217b head passed except one test: 5,380 tests passed, 6 skipped, and the reader's deadline
    test failed under load from seven parallel agents, passing alone three times out of three.
  - CI's deterministic verification failed once on `d9c038e4`, where a release-packet test still expected the privacy
    page's old date, and passed on the final head `f7123595`.
  - `npm run lessons:status` at 11:35 UTC: open 34, needs review 0, accepted but not incorporated 1, incorporated or
    closed 38, deletion eligible 0, lane items unrecorded 0.
- **Source:** all seven checks passed on `f7123595`. It was marked ready and merged at that head at 11:48 UTC as
  `b9e658e25d29e186b51557eb53b0634f1f2573f1`, a true merge whose tree equals the head.
- **Image:** source archive SHA-256 `4f25163321cc605807c67667c69c89c8c8ab93b3dde7640c5e5013d89df7b1b1`; ID
  `sha256:69aed897f17953efdd58e570b4179f66e09e56f5da483562d9cfe907e9cc6641`, user `node`; image archive 129,936,349
  bytes, SHA-256 `ee2d68702212699dd42db64ce8e889b3cbe68707047259d18694c83da5aab827`. No-secret gate: `/healthz` ok,
  HRP 20.6.36 and Universal 20.5.46, one log line, none naming a credential.
- **Prior state (stage A, 11:51:42 UTC):**
  - `research-mcp` on `61215c0b`, up 19 hours, healthy;
  - selector `79dff0b00db5eca4`, `runtime.env` `f48f82ef5d11cbdc` (75 names, 8 Atlas lines, no reader line), compose
    `5631ff8150eea2a8`, both role scripts the release's;
  - the reader's directory, key and known hosts at 750, 400 and 444;
  - the site on the `00e9b6de` release, the timer enabled, 65G free.
- **Switch (stage B, run on the host from a file, 11:52:03 to 11:52:41 UTC):**
  - before any change: the reader's files and the merged service's mounts checked, the image loaded with the built ID,
    and the new image, in a locked-down container, read a Reddit search and a thread through production's key
    (`READER_OK`);
  - the timer stopped and disabled;
  - schema dump 13,265,374 bytes, SHA-256 prefix `360b219a8b4dd18d`;
  - migrate complete, with 0018 to 0023 recorded with the same hashes;
  - both role scripts re-run: the review role has exactly its 25 functions and the access role its 11, and the
    boundaries are proven again;
  - `runtime.env` gained the reader's three lines (78 names); selector `1d2c103fa01e8e2a`; compose `3b37929292d54f98`;
  - `research-mcp` recreated at 11:52:41 UTC, healthy, with the reader's mount read-only.
- **Acceptance (stage C, 11:53 UTC):**
  - **public:**
    - `/version` reports the build, HRP 20.6.36 and Universal 20.5.46, and the protected resource its scopes;
    - an unauthenticated POST to `/mcp/claude` gets 401, and anonymous `/mcp` lists 35 tools, equal to the frozen
      fixture;
    - the privacy, terms and support pages give 200, the Atlas 200, and the sign-in redirect 302;
  - **host:**
    - the security envelope, the three writable mounts, and one log line, none credential-like;
    - the in-image probe: 35 tools, the three tool-list versions equal their fixtures, the protocol loads, PubMed, the
      Reddit lookup, and a passing check returning its checked answer;
    - the panel resource folds the comparison note and what was checked, with no copy of the answer;
    - the full-text probe, the forum reader (`READER_OK`), and shared answers on (mode 700, no copies kept);
  - **review actions probe:** 14 of 14 named in the published `/mcp/claude` schema;
  - **blocking probe:** a clean draft `ready_with_limits`, and a missing source receipt and a broken figure
    `not_ready`;
  - **promotion:** the one-shot succeeded (`no_pending_promotion`, `complete`), and the timer is enabled and active.
- **Site:** released, because the privacy page changed. The four pages equal the merge's files byte for byte, the
  privacy page reads "Effective November 2, 2026", and the Atlas through the apex is unchanged.
- **Plugin:** no packaged file changed. The source and installed copies (8 files) equal the merge's file for file,
  receipt `3e83000a…`, so there is no reinstall.
- **Connectors:**
  - The owner's ChatGPT app, through Codex, sees 33 tools with tool list `442d2af213cbc996` and says its copy is out of
    date, as expected before the refresh. It reports build `b9e658e2`, HRP 20.6.36 and Universal 20.5.46, with research
    access ACTIVE (free contributor, notice v4).
  - This Claude account's connector reports the build and HRP 20.6.36, with sign-in accepted and research access
    ready, on its earlier tool list until a refresh.
- **After the release:**
  - the owner refreshes the AskRigor app once in ChatGPT's settings and in Claude's connector;
  - then one signed-in call of each new tool, and the owner's full regression list on this build, with the turmeric
    case and the save guard after every case, judged against #393's run.
- **Rollback:** `/opt/askrigor/rollbacks/pre-b9e658e25d29e186b51557eb53b0634f1f2573f1` holds the prior `runtime.env`,
  selector, both compose files, the role scripts and the schema dump, and the prior image is tagged
  `askrigor-research:rollback-pre-b9e658e25d29`. To return build `61215c0b`:
  1. stop and disable the promotion timer, deleting no proposals, intents, receipts or canonical evidence;
  2. restore the prior selector, `runtime.env` and compose file;
  3. recreate `research-mcp`.

  The site rolls back by pointing `current` at the `00e9b6de` release.
