# Production release, 2026-10-30 (owner answer 197a)

- **Owner decision:** "197a", typed in this session on 29 Oct, read at 17:15 UTC with "196a". Question 197, option A:
  release #384 when the regression run on the live build ends, so that run is the baseline for the low-calorie
  cases; then run the list again on #384 and judge both against 193's signals.
- **Contents of #384:**
  - only five checks may stop an answer (owner answer 195a): the sources are real and the ones named, a study is
    described as read the way it was read, the numbers add up, safety statements rest on a harm screen, and nothing
    taken back comes back. Every other rule comes back once as a note, or as a stated limit the panel lists under a
    passing checked answer;
  - the check runs on everything that parses (193a, part 3): a value outside a list, an unknown key or a wrong type
    drops only that field or item, and every problem comes back in one `notes` list;
  - HRP 20.6.32 (`DurationMatchedBenefitAndHarm`, `RiskAdjectiveRequiresReferenceClass` and `UpdateStructure`), with
    HRP's core still on one page;
  - the owner's low-calorie reports: after a first pass, open leads and the estimate for another pass are optional
    (#377); a scout's unverified candidates are named as such (#377's comment); a study audit may give a printed
    percentage's count and denominator, and the server redoes the arithmetic (#382, item 9);
  - literature-search receipts sign the public identifiers their results returned (DOI, PMID, PMCID, registry ID), as
    `docs/privacy-data-map.md` records (no query text, nothing stored);
  - a key source no AskRigor tool can look up no longer holds the check until its round limit;
  - owner answer 196a: a dev account's saved cards publish like everyone's;
  - ten low-calorie regression cases in `docs/owner-regressions.md`, and the release record for #381.

  There are no migrations, no role-script changes, and no infrastructure, plugin-file, site or tool-list changes: the
  diff from the live build touches none of `infra`, the migrations, `.codex-plugin`, `skills`, `assets`, `site`,
  `tests/fixtures/frozen-tool-lists`, the Dockerfile or the workflows. The apps need no refresh.
- **Before deploying:**
  - the regression run on #381's build (96 cases, the baseline) ended at 02:37:53 UTC; it switched saving back on
    (`ok=true findingsSave=true`, the reply and the call's result agree) and removed its override; no lane run was
    going;
  - in that run, three cases stopped on OpenAI's capacity ("Selected model is at capacity": `l22-kelp-iodine`,
    `q120-mosquito-net` and the first turn of `q120-sleep-inside-outside`), and OpenAI's filter refused
    `q130-maker-authors`, as in every run since 21 Oct. The three were not rerun on `9e35397b` before this release, as
    the 27 Oct release did for its two, so they have no baseline on that build; their comparison uses the 27 to 28 Oct
    run. None is a low-calorie case;
  - `npm run lessons:status` at 02:38:42 UTC: open 34, needs review 0, accepted but not incorporated 2, incorporated or
    closed 37, deletion eligible 0, lane items unrecorded 0, lane pull-request items unrecorded 1 (#444, built on
    #387's branch, whose ledger row records it).
- **Source:**
  - #384's head `b7cacdae` passed all seven checks; it was marked ready for review and merged at 02:40:11 UTC as
    `d8beec2d766e1c30e6965c10b5455e9a747e9882`, a true merge whose tree equals the head (`fa38434b`);
  - the three frozen tool lists are unchanged: `/mcp` `442d2af213cbc996`, `/mcp/claude` `a53242ad0740d6bb`,
    `/mcp/gemini` `3f619c4c16156097`.
- **Image:**
  - built from a `git archive` of the merge (SHA-256 `7d702141d471da54677171f6ab7d90487270b755d9eb7223f2b9f2c0b2e08dfe`);
    ID `sha256:6915e44877f0150b56567d4a9926029ed8ad0ad52dec4ab720628923eaa5fb7f`, user `node`;
  - image archive 124,379,981 bytes, SHA-256 `a8f8078d5dbc3dcaa96a91059bc4a73f307e48db474ea246d5bfad026c32dfee`;
  - no-secret gate: `/healthz` ok, HRP 20.6.32 and Universal 20.5.46, one log line, and no line naming a credential.
- **Prior state (stage A, 02:42:36 UTC):**
  - `research-mcp` on `9e35397b`, up 9 hours (recreated for 196a's dev-account setting at 17:20 UTC on 29 Oct);
  - SHA-256 prefixes: selector `4e10fd89d567e12a`, and `runtime.env` `f02756a6fef695e5` (73 names, 8 Atlas lines);
  - both role scripts already equal the release's (`af58b9c9…`, `bab9b92a…`);
  - the site is on the `0da58528` release, and the promotion timer is enabled.
- **Switch (stage B, run on the host from a file, 02:43:06 UTC):**
  - the loaded image ID matches the laptop's;
  - the timer was stopped and disabled;
  - schema dump 8,429,406 bytes, SHA-256 prefix `a6e51ab759fe7f51`;
  - migrate complete, with 0018 to 0023 recorded with the same hashes;
  - both role scripts were re-run: the review role may run exactly its 25 functions, the access role exactly its 11,
    and the boundaries were proven again;
  - only the build line of `runtime.env` changed (73 names, the dev-account line kept, SHA-256 prefix
    `08311994470462cb`); selector `c381bfc5e8f9a604`;
  - only `research-mcp` was recreated, and it started at 02:43:18 UTC, healthy.
- **Acceptance (stage C, 02:43 UTC):**
  - `/version` build `d8beec2d`, with HRP 20.6.32 and Universal 20.5.46;
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
    the feature probes. A passing check returns the checked answer (61 characters for the probe's fixture), and the
    panel renders it (187);
  - the five checks (195a): the standard probe's draft without `absence_claims`, which the live build stopped
    (`not_ready`, two steps: a declaration and the tool list), now passes with limits and no step, since a missing
    declaration is a note. A new probe, `blocking-probe.mjs`, run in the live container, shows two of the five checks
    still stop an answer: a key source with no receipt (`not_ready`, 2 steps) and a number needed to treat that its
    counts don't give (`not_ready`, 1 step). A clean draft passes with limits;
  - the review actions: all 14 are named in the published `/mcp/claude` schema (the actions probe); the standard
    probe's check for them as quoted enum values finds none, as since 189a;
  - full text: an Europe PMC section search carries `full_text_scope`. The owner library indexed the green-tea and
    Overtoom papers, and refused the Walters copy as an identity mismatch, as before;
  - promotion: the one-shot succeeded (`no_pending_promotion`, and the `atlas_findings` queue completed). The timer is
    enabled, next run 02:45:10 UTC.
- **Connector probes:**
  - Claude (this session's connector, tool list `a53242ad0740d6bb`): `get_protocol_manifest` returned the running
    build `d8beec2d` with HRP 20.6.32 and Universal 20.5.46, sign-in accepted and research access ready, with no notice
    that the app's copy of the tools is out of date;
  - the ChatGPT app Codex reaches, 02:48 UTC: 33 tools, its tool list version `442d2af213cbc996` (current, with no
    refresh), both manifests on build `d8beec2d` with no out-of-date notice, and the owner's login `ACTIVE` as a free
    contributor (notice `free-contributor-v4-2026-10-25`).
- **Plugin:** no packaged file changed since the live build (8 files, last changed on 21 Oct). Source and installed
  receipts are both `3e83000a1183ebfc…` (version `0.1.0+codex.20261022222738.hrp.20.6.31.universal.20.5.46`, whose
  protocol part names the versions at install time), and every file equals the merge's, so no reinstall.
- **Lessons:** #50, whose sentence is in HRP 20.6.32, is labelled incorporated.
- **Next:** the rerun of the same 96 cases on this build, through the ChatGPT app Codex reaches, from
  `/home/joel/askrigor-releases/20261030-384/regress`, started at 02:48:27 UTC with card saving off (`ok=true
  findingsSave=false`, the reply and the call's result agree); then both runs are judged against 193's signals, the
  eleven low-calorie cases apart.
- **Rollback:**
  1. Stop and disable the timer.
  2. Restore the selector and `runtime.env` from `/opt/askrigor/rollbacks/pre-d8beec2d766e1c30e6965c10b5455e9a747e9882`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-d8beec2d766e`, and check its health.
  4. Re-enable the timer.

  The database needs no step.
