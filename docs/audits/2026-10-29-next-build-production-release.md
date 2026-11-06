# Production release, 2026-10-29 (owner question 194)

- **Owner decision:** "194a", typed in this session on 29 Oct, read at 12:20 UTC with "195a". Question 194, option A:
  release #381 now; then the owner does the last app refresh (189a), and the regression list runs.
- **Contents of #381:**
  - a check that doesn't pass says why, in the answer and the panel, and under a check that passed the panel shows the
    checked answer word for word (owner answer 187);
  - the fixed tool list (189a): after this release, apps need a refresh only when a tool is added or removed;
  - free accounts register the plain answer first too (190a);
  - the fixes for the classes that came back in the 26 to 27 Oct regressions: the locked community label, steps no
    call can finish (now stated limits), the round count restarting after a pass, the plain-answer note's quotes, the
    YouTube scout's refusal wording, and "not included" beside pasted reports;
  - the publish action files a card saved without a topic under one (191b);
  - from the 27 Oct bug report in UDA's lane: a video's sponsorships kept apart from the creator's own products, its
    funding and methods caveats pulled out on their own, a comment found but not read never counted as read, and a
    channel search kept to the channel asked for.

  There are no migrations, no role-script changes, and no protocol, plugin-file or site changes; the only
  infrastructure file changed is `infra/living-evidence-production/README.md`. The apps' tool lists change once.
- **Before deploying:**
  - no regression or lane run was going (the 27 to 28 Oct run ended at 02:39:58 UTC on 28 Oct, the lanes at 05:38:24
    UTC);
  - `npm run lessons:status` at 12:24:35 UTC: open 33, needs review 0, accepted but not incorporated 1 (#50, whose
    sentence is in HRP 20.6.32 on #384), incorporated or closed 37, deletion eligible 0, lane items unrecorded 0, lane
    pull-request items unrecorded 2 (#441, recorded on #381's branch, and #444, new on 29 Oct: triaged as HRP text and
    regression cases, to build after 195a's half).
- **Source:**
  - #381's head `cae2c228` passed all seven checks; it was marked ready for review and merged at 12:26:08 UTC as
    `9e35397b70356d7e463f59ce21a183e8833e4397`, a true merge whose tree equals the head;
  - the three frozen tool lists' versions, printed by `scripts/freeze-tool-lists.mts` from a checkout of the same tree:
    `/mcp` `442d2af213cbc996`, `/mcp/claude` `a53242ad0740d6bb`, `/mcp/gemini` `3f619c4c16156097`.
- **Image:**
  - built from a `git archive` of the merge (SHA-256 `8183cd3747317cec3b443b4adb739eebd3ebefa8450560c6c488107b1ff8d3c6`);
    ID `sha256:be95cdd436d11ccf8062105c60c849698eb0813ab94a7513692c70b57dc7d81a`, user `node`;
  - image archive 124,362,192 bytes, SHA-256 `cf3e21c85d7697f43aae5710e075d50e957a0145a7eb2ca0e4767c70b5743eea`;
  - no-secret gate: `/healthz` ok, HRP 20.6.31 and Universal 20.5.46, one log line, and no line naming a credential.
- **Prior state (stage A, 12:29:56 UTC):**
  - `research-mcp` on `0a315a91`, up 44 hours;
  - SHA-256 prefixes: selector `e1f600a12511919c`, and `runtime.env` `3cd7e840dee17169` (73 names, 8 Atlas lines);
  - both role scripts already equal the release's (`af58b9c9…`, `bab9b92a…`);
  - the site is on the `0da58528` release, and the promotion timer is enabled.
- **Switch (stage B, run on the host from a file, 12:30:16 UTC):**
  - the loaded image ID matches the laptop's;
  - the timer was stopped and disabled;
  - schema dump 7,237,851 bytes, SHA-256 prefix `d2bffaca6d65cd3a`;
  - migrate complete, with 0018 to 0023 recorded with the same hashes;
  - both role scripts were re-run: the review role may run exactly its 25 functions, the access role exactly its 11,
    and the boundaries were proven again;
  - only the build line of `runtime.env` changed (73 names, SHA-256 prefix `d6d0c4d9e88330e9`); selector
    `4e10fd89d567e12a`;
  - only `research-mcp` was recreated, and it started at 12:30:29 UTC, healthy.
- **Acceptance (stage C, 12:31 UTC):**
  - `/version` build `9e35397b`, with HRP 20.6.31 and Universal 20.5.46;
  - `/mcp/claude` refuses a call without sign-in (401), with scopes `research:use cases:review`;
  - anonymous `/mcp` lists 33 tools, and the first one's description carries no versions (189a). With its two
    `tool_list_version` descriptions set back to the fixture's wording, the list equals
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
  - the review actions: the standard probe's check for the 14 Atlas review actions as quoted enum values found none,
    because since 189a the review tool publishes `action` as an open string whose description names the actions, and
    the runtime enum checks them. A separate probe found all 14 named in the published `/mcp/claude` schema;
  - full text: an Europe PMC section search carries `full_text_scope`. The owner library indexed the green-tea and
    Overtoom papers, and refused the Walters copy as an identity mismatch, as before;
  - promotion: the one-shot succeeded (`no_pending_promotion`, and the `atlas_findings` queue completed). The timer is
    enabled, next run 12:35:14 UTC.
- **Connector probes:**
  - Claude (this session's connector, whose tool list dates from build `141c229f`): `get_protocol_manifest` returned
    the running build `9e35397b` with HRP 20.6.31 and Universal 20.5.46;
  - the ChatGPT app Codex reaches (`codex_apps/askrigor_6_oct`), 12:35 UTC: 33 tools, its tool list version
    `6c8b98f749b2c772` (the list loaded before the release), and both manifest results said its copy is older than the
    tools AskRigor serves. It is signed in as `73712fb19006`, the owner's email-and-password login, whose research
    access is not enrolled (owner question 196).
- **Plugin:** no packaged file changed. Source and installed receipts are both `3e83000a1183ebfc…` (8 files, version
  `0.1.0+codex.20261022222738.hrp.20.6.31.universal.20.5.46`), and every file equals the merge's, so no reinstall.
- **Next:**
  - the owner answers question 196 (which login each app uses) and refreshes the ChatGPT app;
  - the poller `/home/joel/askrigor-releases/20261029-381/probe-then-run.sh` then starts the regression run: the 85
    cases plus the eleven low-calorie cases of owner answer 193a, as a baseline before their fixes ship (96 cases).
- **Rollback:**
  1. Stop and disable the timer.
  2. Restore the selector and `runtime.env` from `/opt/askrigor/rollbacks/pre-9e35397b70356d7e463f59ce21a183e8833e4397`.
  3. Recreate only `research-mcp` with `askrigor-research:rollback-pre-9e35397b7035`, and check its health.
  4. Re-enable the timer.

  The database needs no step.
