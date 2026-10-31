# Production release, 2026-10-31 (owner answer 209a)

- **Owner decision:** "209a", typed in this session on 31 Oct at about 14:37 UTC. Question 209, option a: merge #389
  and deploy it, then run the owner's regression list. HRP 20.6.35's wording went to the owner with the question.
- **Contents of #389** (the build after #387):
  - the video comment audit no longer stops on large videos: a pinned comment's second listing is skipped, and a
    repeat-filter match the exact sample cannot settle is counted and stated (9a9b14a8);
  - forum depth, the studies loop and the in-answer comment map (4abb8ee1): three non-blocking notes from counts and
    signed times, and reminders in the community tools' results;
  - the regression run's exact findings (3724d166): Lancet-style decimals, "Cite … as a lead" lines out of the panel's
    limits, an unbacked "confirmed" noted like "qualified", the plain-answer note's figures, the unblinded-test wording,
    the failed plain-answer receipt's message, and scout refusals that quote the words they caught (never a secret or
    contact detail);
  - 205a's limits on one reference line with a note against pasting them (58fe2ec3);
  - HRP 20.6.35 (4ba480b1), outside the core: forum threads read in full, counts for every community corpus, every
    video and thread named, outcomes per named method, `VideoCommentMap`, a search with the person's own combination of
    symptoms, what to try first and what to avoid, the emergency exemption only for the warning, and the community
    leads that changed the study search said in the answer;
  - the smaller final-check panel (97f99134), #387's release record, the regression judgment on #387's build, the
    channel registry and the comment-map plan.

  No migration, role-script, infrastructure, site, plugin-file or tool-list change: among `infra`, the migrations,
  `site`, `.codex-plugin`, `skills`, `assets`, `tests/fixtures/frozen-tool-lists`, the Dockerfile and the workflows, the
  diff from the live build is empty. The apps need no refresh.
- **Before deploying:** `npm run verify` on the head `58fe2ec3`: 308 test files passed, 1 skipped; 5,195 tests passed,
  6 skipped. `npm run lessons:status` at 14:38:55 UTC: open 34, needs review 0, accepted but not incorporated 1,
  incorporated or closed 38, deletion eligible 0, lane items unrecorded 0. No Codex run was going.
- **Source:** the head passed Deterministic verification, workflow-policy and CodeQL; it was marked ready for review and
  merged at that head at 14:40 UTC as `ce7a664bda84caa6edf3efa49c9335b6be21250d`, a true merge whose tree equals the
  head. The frozen tool lists are unchanged: `/mcp` `442d2af213cbc996`, `/mcp/claude` `a53242ad0740d6bb`, `/mcp/gemini`
  `3f619c4c16156097`.
- **Image:** built from a `git archive` of the merge (SHA-256
  `a5de344e14cd49b007140fb5a683a9be6f4f30f5b616e9e149c17d2b43869f1a`); ID
  `sha256:36fcf0b7aebd919174b3fdd5e2b00998ebbcd8c419b855bf3c9c8e5c54c50433`, user `node`; archive 124,431,693 bytes,
  SHA-256 `b05001011dbd747d4d31f703cdf18b33fe4dcf078d2ec597c5ba0b818964a1b6`. No-secret gate: `/healthz` ok, HRP 20.6.35
  (`44e1ca79…`) and Universal 20.5.46, one log line, none naming a credential.
- **Prior state (stage A, 14:43:17 UTC):** `research-mcp` on `00e9b6de`, up 21 hours, healthy; selector
  `2be80cd3490991fe`, `runtime.env` `411898d08d03c5df` (75 names, 8 Atlas lines, 2 shared-answer lines); both role
  scripts already the release's (`af58b9c9…`, `bab9b92a…`); the site on the `00e9b6de` release; the timer enabled; 65G
  free.
- **Switch (stage B, run on the host from a file, 14:43:36 to 14:43:51 UTC):** the loaded image ID matches the laptop's;
  the timer stopped and disabled; schema dump 10,644,355 bytes, SHA-256 prefix `688d78982e6c067c`; migrate complete
  with 0018 to 0023 recorded with the same hashes; both role scripts re-run, the review role exactly its 25 functions
  and the access role its 11, boundaries proven again (`0|0|…|false|7`); `runtime.env` changed only its build line (75
  names, `33e07d9f081c047c`); selector `b183ec02c530f502`; `research-mcp` recreated at 14:43:51 UTC, healthy.
- **Acceptance (stage C, 14:44:10 UTC):**
  - public: `/version` reports the build, HRP 20.6.35 and Universal 20.5.46; the protected resource and its scopes;
    an unauthenticated POST to `/mcp/claude` gets 401; anonymous `/mcp` lists 33 tools, equal to the frozen fixture;
    the privacy, terms and support pages 200; the Atlas pages 200 and the sign-in redirect 302 to Auth0;
  - host: the security envelope (user `node`, read-only root, all capabilities dropped, no-new-privileges, 1 GiB, 256
    pids), the three writable mounts, one log line and none credential-like; the in-image probe (33 tools; the three
    tool-list versions equal their fixtures; load_protocol; the panel resource; PubMed; the Reddit lookup; the check
    passing with its checked answer in the panel); the full-text probe; shared answers on, mode 700, 0 copies kept;
  - the review actions probe: 14 of 14 named in the published `/mcp/claude` schema; the blocking probe: a clean draft
    ready_with_limits with no step, a missing source receipt and a broken figure not_ready, as expected;
  - the promotion one-shot succeeded (`no_pending_promotion`, `complete`), and the timer is enabled and active.
- **Site:** not released: no file under `site/` changed, so askrigor.com stays on the `00e9b6de` release.
- **Plugin:** no packaged file changed since the live build; the source and installed copies (8 files) equal the
  merge's file for file, receipt `3e83000a…`, so no reinstall.
- **Connectors:** this Claude account's connector reports build `ce7a664b`, HRP 20.6.35 and no stale tool list, with
  sign-in accepted and research access ready; the owner's ChatGPT app, through Codex, sees 33 tools with tool list
  `442d2af213cbc996`, HRP 20.6.35 and Universal 20.5.46 on build `ce7a664b`, no out-of-date sentence, and research access
  ACTIVE (free contributor, notice v4).
- **Regression run:** started at 14:46:14 UTC (`/home/joel/askrigor-releases/20261031-389/regress`): the same cases as
  the runs on #381's, #384's and #387's builds, plus four new ones judged apart (forum depth, a niche forum topic, one
  video's comment map, a symptom combination as in AskRigor#390). Saving switched off at 14:46:26 UTC (the reply and
  the call's result agree); it switches back on when the cases end.
- **Rollback:** `/opt/askrigor/rollbacks/pre-ce7a664bda84caa6edf3efa49c9335b6be21250d` holds the prior `runtime.env`,
  selector, compose files, role scripts and the schema dump, and the prior image is tagged
  `askrigor-research:rollback-pre-ce7a664bda84`. Restoring the prior selector and `runtime.env` and recreating
  `research-mcp` returns build `00e9b6de`; stop and disable the promotion timer first, without deleting proposals,
  intents, receipts or canonical evidence.
