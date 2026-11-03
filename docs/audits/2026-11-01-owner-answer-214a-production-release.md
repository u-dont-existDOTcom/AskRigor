# Production release, 2026-11-01 (owner answer 214a)

- **Owner decision:** "214a", typed in this session on 1 Nov at about 16:10 UTC. Question 214, option a: merge #393 and deploy it,
  then run the owner's regression list.
- **Contents of #393** (the build after #389):
  - a passing check's `caveats` hold only the sentences the answer shows as written (fcce644b, owner answer 205a), the cause of
    answers pasting every limit after the check: the mobile notice, the save offer, the correction-report question (owner question
    78) and the community-skip sentence (owner question 125). The reference line leaves those out and gives each on its own
    "Include as written" line, and the paste note doesn't count them;
  - the plain-answer note stays when a claim isn't backed (cbe1653d, owner answer 210b): the claim reads "This research did not
    check that.", only a claim left out holds the note back, and a forum thread this call declares it read can back a claim
    about what people report, named as the AI's own reading;
  - InfoAccess, one request at a time (f6b0b5e2): the server sends one request at a time to each endpoint and waits out a `busy`
    answer for at most 45 seconds; `invalid_response` ends the search there, so it no longer holds back a lead or invites another
    try;
  - the paste note asks for the check again (8117cb76); the scout's lead refusal names each refused lead and what it matched
    (846f00a5); the forum note asks why when no thread was read, and reports the user pasted no longer draw it (1b533f1c);
  - #389's release record, the judgment of its regression run, and the plan for AskRigor reading forum threads itself.

  No migration, role-script, infrastructure, site, plugin-file, protocol or tool-list change: among `infra`, the migrations, `site`,
  `.codex-plugin`, `skills`, `assets`, `protocols`, `tests/fixtures/frozen-tool-lists` and the Dockerfile, the diff from the live build
  is empty. The apps need no refresh.
- **Before deploying:** `npm run verify` on the head `1b533f1c`: 309 test files passed, 1 skipped; 5,230 tests passed, 6 skipped.
  `npm run lessons:status` at 16:13 UTC: open 34, needs review 0, accepted but not incorporated 1, incorporated or closed 38, deletion
  eligible 0, lane items unrecorded 1 (`2026-10-31-study-map-for-decision-claims`, filed the day before, not part of this build).
- **Source:** the head passed Deterministic verification, workflow-policy and CodeQL; it was marked ready for review and merged at
  that head at 16:14 UTC as `61215c0be5d5254aeff8eb08725499548f16a5a9`, a true merge whose tree equals the head. The frozen tool lists
  are unchanged: `/mcp` `442d2af213cbc996`, `/mcp/claude` `a53242ad0740d6bb`, `/mcp/gemini` `3f619c4c16156097`.
- **Image:** built from a `git archive` of the merge (SHA-256
  `83e4a80b30ec25b066704a673a0c0cfe62fe2279f3a5a7a2dcfaee76480013dc`); ID
  `sha256:4956ee0c7eb44b5f46ce58e322bf6035131a62b1dd4061bdc2b613cc65e05569`, user `node`; archive 124,435,483 bytes, SHA-256
  `9a5130f82d2768d094e363276cc009753396f274cc1f5d8366decde75fdc5388`. The first build's `npm ci` timed out on the laptop's Wi-Fi (signal -74
  dBm, heavy packet loss); the retry passed. No-secret gate: `/healthz` ok, HRP 20.6.35 and Universal 20.5.46, one log line, none naming a
  credential.
- **Prior state (stage A, 16:39:15 UTC):** `research-mcp` on `ce7a664b`, up 26 hours, healthy; selector `b183ec02c530f502`, `runtime.env`
  `33e07d9f081c047c` (75 names, 8 Atlas lines, 2 shared-answer lines); both role scripts already the release's (`af58b9c9…`, `bab9b92a…`); the site on
  the `00e9b6de` release; the timer enabled; 65G free.
- **Switch (stage B, run on the host from a file, finished 16:39:57 UTC):** the loaded image ID matches the laptop's; the timer stopped and
  disabled; schema dump 12,003,437 bytes, SHA-256 prefix `e843836705b3e444`; migrate complete with 0018 to 0023 recorded with the same hashes;
  both role scripts re-run, the review role exactly its 25 functions and the access role its 11, boundaries proven again (`0|0|…|false|7`);
  `runtime.env` changed only its build line (75 names, `f48f82ef5d11cbdc`); selector `79dff0b00db5eca4`; `research-mcp` recreated at 16:39:51 UTC, healthy.
- **Acceptance (stage C, 16:40:36 UTC):**
  - public: `/version` reports the build, HRP 20.6.35 and Universal 20.5.46; the protected resource and its scopes; an unauthenticated POST to
    `/mcp/claude` gets 401; anonymous `/mcp` lists 33 tools, equal to the frozen fixture; the privacy, terms and support pages 200; the Atlas pages 200
    and the sign-in redirect 302 to Auth0;
  - host: the security envelope, the three writable mounts, one log line and none credential-like; the in-image probe (33 tools; the three tool-list
    versions equal their fixtures; load_protocol; the panel resource; PubMed; the Reddit lookup; the check passing with its checked answer in the
    panel); the full-text probe, with two of its three papers indexed through the library; shared answers on, mode 700, 0 copies kept;
  - the review actions probe: 14 of 14 named in the published `/mcp/claude` schema; the blocking probe: a clean draft ready_with_limits with no step, a
    missing source receipt and a broken figure not_ready, as expected;
  - the promotion one-shot succeeded (`no_pending_promotion`, `complete`), and the timer is enabled and active.
- **Site:** not released: no file under `site/` changed, so askrigor.com stays on the `00e9b6de` release.
- **Plugin:** no packaged file changed since the live build; the source and installed copies (8 files) equal the merge's file for file, receipt
  `3e83000a…`, so no reinstall.
- **Connectors:** this Claude account's connector reports build `61215c0b`, HRP 20.6.35 and no stale tool list, with sign-in accepted and research
  access ready; the owner's ChatGPT app, through Codex, sees 33 tools with tool list `442d2af213cbc996`, HRP 20.6.35 and Universal 20.5.46 on build
  `61215c0b`, no out-of-date sentence, and research access ACTIVE (free contributor, notice v4).
- **Regression run:** started at 16:42:17 UTC (`/home/joel/askrigor-releases/20261101-393/regress`): the same 100 cases as the run on #389's build. Saving
  switched off at 16:42:45 UTC (the reply and the call's result agree); it switches back on when the cases end.
- **Rollback:** `/opt/askrigor/rollbacks/pre-61215c0be5d5254aeff8eb08725499548f16a5a9` holds the prior `runtime.env`, selector, compose files, role scripts and the schema
  dump, and the prior image is tagged `askrigor-research:rollback-pre-61215c0be5d5`. Restoring the prior selector and `runtime.env` and recreating `research-mcp` returns
  build `ce7a664b`; stop and disable the promotion timer first, without deleting proposals, intents, receipts or canonical evidence.
