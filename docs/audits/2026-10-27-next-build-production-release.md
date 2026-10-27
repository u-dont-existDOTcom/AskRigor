# Production release, 2026-10-27 (owner question 188)

- **Owner decision:** "188a", typed in this session on 27 Oct. Question 188, option A: release the next build when the
  26 Oct regression run ends, then run the regression list again; judge both runs, the 26 Oct one first.
- **Contents of #380:**
  - the Atlas navigation (owner answer 183b);
  - bug reports with real detail (#357);
  - lessons that name the existing rules (#366);
  - research building on the Atlas (owner request of 26 Oct);
  - main's two documentation commits.

  There are no migrations, and no protocol, plugin-file or site changes.
- **Before deploying:** the 26 Oct run had ended at 21:35:50 UTC, with saving switched back on.
  - Its two capacity-failed cases, `l22-kelp-iodine` and `l30-form-specific-forum`, were rerun on the live build
    `ddba2b79` from 15:42 to 16:01 UTC on 27 Oct. Saving was switched off and back on around them, and both switches
    were verified.
  - `q130-maker-authors` was refused by OpenAI's biological-risk filter again.
- **Source:**
  - #380's head `114b54c5` passed all seven checks, after one fix. CodeQL flagged an ambiguous pattern in
    `scripts/generate-check-report-vocabulary.mts`; it was rewritten, and the generated vocabulary is unchanged.
  - It merged at 15:53:43 UTC as `0a315a918b579f6c922936b8a0390313b641a87d`, a true merge whose tree equals the head.
  - `npm run verify` had passed on `28898112` with 4,948 tests, before main's two documentation files were merged in.
- **Image:**
  - built from a `git archive` of the merge; ID `sha256:1db701ba98dea402864e0eaa2c9308b5368a2659f3ffe8e4640712da93b9f2fb`,
    user `node`;
  - archive 124,337,606 bytes, SHA-256 `77d479c730a563e9a853b6b3340b9556165cc8b54ac02d2b8aa52f8e15a947f7`;
  - no-secret gate: `/healthz` ok, HRP 20.6.31 and Universal 20.5.46, one log line, and no line naming a credential.
- **Prior state (stage A):**
  - `research-mcp` on `ddba2b79`, up 26 hours;
  - SHA-256 prefixes: selector `6971144d82aefaf2`, and `runtime.env` `451be94a485f365d` (73 names, 8 Atlas lines);
  - both role scripts already equal the release's (`af58b9c9…`, `bab9b92a…`);
  - the site is on the `0da58528` release.
- **Switch (stage B2, run on the host from a file):**
  - the loaded image ID matches the laptop's;
  - the timer was stopped and disabled;
  - schema dump 6,090,830 bytes, SHA-256 prefix `4b23beb32e4d2268`;
  - migrate complete, with 0018 to 0023 recorded with the same hashes;
  - both role scripts were re-run: the review role may run exactly its 25 functions, the access role exactly its 11,
    and the boundaries were proven again;
  - only the build line of `runtime.env` changed; selector `e1f600a12511919c`;
  - only `research-mcp` was recreated, and it started at 16:02:23 UTC, healthy.
- **Acceptance (stage C2):**
  - `/version` build `0a315a91`, with HRP 20.6.31 and Universal 20.5.46;
  - `/mcp/claude` refuses a call without sign-in (401), with scopes `research:use cases:review`;
  - `/mcp` lists 33 tools, and the first one's version line names the build;
  - `/privacy`, `/terms` and `/support` answer 200, and so do the Atlas on both addresses, and the new
    `/atlas/topics`, `/atlas/findings` and `/atlas/search`;
  - the sign-in redirect is a 302 to Auth0;
  - host: the security envelope is unchanged (`node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB,
    256 PIDs, the three writable mounts, both networks), with one log line and no credential markers;
  - the probes: 33 tools, 22 in the Gemini catalog, both manifests, and the feature probes;
  - full text: an Europe PMC section search carries `full_text_scope`. The owner library indexed the green-tea and
    Overtoom papers, and refused the Walters copy as an identity mismatch;
  - promotion: the one-shot succeeded (`no_pending_promotion`, and the `atlas_findings` queue completed). The timer is
    enabled, next run 16:05:13 UTC.
- **Plugin:** no plugin file changed. Source and installed receipts are both `3e83000a1183ebfc…` (8 files, version
  `0.1.0+codex.20261022222738.hrp.20.6.31.universal.20.5.46`), and every file equals main's, so no reinstall.
- **Next:**
  - the owner refreshes the ChatGPT app;
  - the regression poller was started at 16:04 UTC (`/home/joel/askrigor-releases/20261027-next`, with this build);
  - the 26 Oct run is being judged.
- **Rollback:**
  1. Stop and disable the timer.
  2. Restore the selector and `runtime.env` from `/opt/askrigor/rollbacks/pre-0a315a918b579f6c922936b8a0390313b641a87d`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-0a315a918b57`, and check its health.
  4. Re-enable the timer.

  The database needs no step.
