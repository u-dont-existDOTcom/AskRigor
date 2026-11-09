# Production release, 2026-11-09 (owner answer 285a)

- **Owner decision:** "285a and give me the inbox link with each turn", typed in chat at about 20:15 UTC on 9 Nov in
  the session that made this release. Question 284 (ask first only above about 10 minutes) had no answer, so its default
  stands: balanced still asks before recommended research of more than about five minutes.
- **Contents:** #435:
  - **HRP 20.6.41 (owner answer 282a):** `WordsAreNotSizes` (Critical) in `StatisticalAndClinicalInterpretation`, and
    the stress test `RichSourceWithoutAnAmount`, outside the core, in the approved words; SHA-256
    `e1705d3e958ea5d01936dbb9a8bf431139738ece551a111b69ba5d13b71595f9`.
  - **The all-journal search (owner answer 283a):** `search_europe_pmc` with `later_inputs.index` `all_journals`
    searches OpenAlex; receipt source `openalex`, counted as the source beyond PubMed and Europe PMC; named at the screen
    for plant, food, farming and traditional remedies. The owner's free OpenAlex key (an Inbox reply of 18:45 UTC) went
    into `runtime.env` as `OPENALEX_API_KEY`: copied to the host as a root-only file, written by the host script and the
    file removed, never printed, as owner answer 177a allowed for the Atlas secret. The privacy notice and data map name
    OpenAlex.
  - **From the timing runs of 9 Nov:** `URGENT_FIRST` (an emergency's urgent action before any menu or research),
    `RESEARCH_MENU_SHAPE` (the menu's fields spelled out; 24 of 42 menu calls had been refused), and `PLAN_TASK_MINUTES`
    measured, with `ANSWER_MINUTES` for the final check and writing.
  - **The form people use (the owner's Inbox reply of 17:13 UTC):** `FORM_PEOPLE_USE` with the plain answer's framing
    request (HRP `WholeInterventionIdentityTrace`, `UserReportedUseFidelity`).
  - What's new for 9 November, and this release's decisions marked released.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so **no app needs a refresh**. No migration, role script or compose change; one settings line
  added.
- **Before deploying:**
  - `npm run lessons:status` at 20:15:47 UTC: open 42; needs review 5; accepted but not incorporated 1; incorporated or
    closed 41; deletion eligible 0; lane items unrecorded 0.
  - All seven CI checks passed on #435's head `fe160acd`; `npm run verify` at `fe160acd`: 6,427 passed, 6 skipped, the
    typecheck and the build (the run at `9bb3cafe` had failed one test that pinned the plain answer's request without
    the form sentence, fixed in `dc10b47f`).
- **Source:** #435 marked ready at 20:21 UTC and merged at 20:24:54 UTC as `48919464fcccd5ea438efc678dbfd4fee73b870b`,
  whose tree equals the head's.
- **Image:**
  - source archive SHA-256 `42e9aee3f77179a62798230480134d82aa2303856f247fc3c252a5d005a7b0bd`;
  - ID `sha256:48be11d941a1d3e9428b71975c346108d327e8ffbdcd19d84b46fcf57011c1f9`, user `node`;
  - image archive 122,012,205 bytes, SHA-256 `02d23135f7c2a3f8cc1712205bf033f185b68c22923573e83d3a1e3a51be2116`,
    copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.41 and Universal 20.5.46, and one log line, naming no credential.
- **The site, first (20:25 UTC):** the archive was made with the merge's own script in the next-build worktree, whose
  tree equals the merge's; its tar equals the separately built one
  (`0e3241606d65bcf52bd36183091e8183eef4870b722af838bd434f20f07fe389`); the archive is 324,575 bytes, SHA-256
  `031ae3505ec05cb354316aba21fae4324a1531687c86ee68e2550856ccc5ea49`, checked again on the host; the installer `c7992a2f`. Installed over release `dc4cf76a` with the Atlas upstream
  and the proxy secret read on the host; Caddy recreated. All eight pages and `robots.txt` equal the merge's files
  byte for byte; the privacy page reads "Effective November 9, 2026" and names OpenAlex among the providers, the terms
  "Effective November 6, 2026"; through askrigor.com the Atlas pages answer as before, with their security headers, and
  `askrigor.com/atlas` equals `mcp.askrigor.com/atlas`.
- **Prior state (stage A, 20:28:08 UTC):** research-mcp on `dc4cf76a`, healthy; `compose.living-evidence.yaml`
  `196da407`; the role scripts `a40256a6` and `7f361afa`; `runtime.env` 79 names; the promotion timer enabled. The
  owner's maps file (same bytes) and the OpenAlex key file (22 characters, root-only) copied.
- **Stage B (20:28:39 to 20:29:15 UTC):**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-48919464fcccd5ea438efc678dbfd4fee73b870b` (the prior image, `dc4cf76a`'s,
    tagged `rollback-pre-48919464fccc`, the selector, `runtime.env`, both compose files and both role scripts), and a
    `living_evidence` dump of 17,578,391 bytes, SHA-256 `1131d00a6338ac61…`;
  - migrate: nothing new, 0018 to 0033 recorded with the release files' hashes;
  - both role scripts re-run with the same bytes; the review role may run exactly its script's 36 functions and the
    access role its 15; the boundaries as before (the review role holds no table or column right; the access role its
    tables and 15 columns; the reader can't read the held YouTube findings or the call record, and reads the 11 Atlas
    tables);
  - `runtime.env`: 80 names, the build line changed and `OPENALEX_API_KEY` added once, well formed, its file removed;
    the selector names `askrigor-research:48919464fcccd5ea438efc678dbfd4fee73b870b`; the maps file reinstalled with
    the same bytes; the compose file unchanged;
  - research-mcp recreated at 20:29:15 UTC, healthy, with the reader and maps mounts read-only; the running service has
    the OpenAlex key set (checked without printing it).
- **Stage C (20:29 to 20:31 UTC):** `/version` names build `48919464`, HRP 20.6.41; an unauthenticated POST gets 401;
  `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal their fixtures in the image; the
  site's pages and the Atlas pages answer 200; the in-image probes pass as for `dc4cf76a` (a passing final check, the
  full-text, forum-reader and shared-answers probes, the review actions named in the published description); **the
  all-journal search from production, with the key, found the 1999 Syrian rue oil paper
  (`10.1080/12538078.1999.10515822`) first, and the key appears nowhere in the result**; one log line, with no
  credential-like marker.
- **Promotion:** the hardened one-shot service ran once (success), the timer was enabled again with its next trigger at
  20:35:07 UTC, and the selector binds the deployed image.
- **Plugin:** no packaged file changed since `dc4cf76a` (0 of 8); the source and the installed copy each equal the
  merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it was not reinstalled.
- **Claude's connector (20:31 UTC):** `get_protocol_manifest` reported HRP 20.6.41, build `48919464`, research access
  ready, no out-of-date sentence; `search_europe_pmc` with `later_inputs.index` `all_journals` (published tool list
  from before) returned provider `openalex`, access complete, the 1999 paper first with its free copy, and a
  `literature_search` receipt with source `openalex`.
- **Connector probe (Codex's AskRigor app, 20:31 UTC):** 35 tools; `tool_list_version` `0d6016087ee4bc5a`; HRP
  20.6.41 (`e1705d3e958ea5d0`), running build `48919464`; no out-of-date sentence; `inspect` ACTIVE, FREE_CONTRIBUTOR;
  `list_calls` listed the account's calls, the newest its own. `search_europe_pmc` with `later_inputs.index`
  `all_journals` reached OpenAlex through the app's loaded tool list (provider `openalex`), but OpenAlex didn't answer
  within the adapter's 20 seconds that time (`openalex_unreachable`, timeout, retryable), and the result said so. The
  same search from production right after took 4.1 seconds and found the paper; another took 0.5.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-48919464fccc` (the image of `dc4cf76a`), restore `runtime.env`
  from the rollback folder (it has no OpenAlex line), and recreate research-mcp
  (`infra/living-evidence-production/README.md`); reinstall the `dc4cf76a` site release, whose privacy notice doesn't
  name OpenAlex. No migration to undo.
