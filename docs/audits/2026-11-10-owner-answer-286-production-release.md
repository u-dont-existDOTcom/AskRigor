# Production release, 2026-11-10 (owner answer 286a)

- **Owner decision:** "286a, release it", typed in chat at about 18:37 UTC on 10 Nov in the session that made this
  release.
- **Contents:** #436:
  - **When balanced asks first (owner answer 284, 10 Nov, in the owner's words):** balanced research shows the menu and
    waits for the person's choice when the recommended tasks' high estimate is past about 10 minutes
    (`ASK_ABOVE_MINUTES`), or when the menu's `steering_could_help` isn't false: the model's own judgment from its
    screen, in any language, counted as true when left out, as HRP's `StructuredUserSteeringAndApproval` asks. It goes
    on without asking only for a precise question whose tasks fit in about 10 minutes, and when it asks for the
    person's choices, it says in one line what they could change. `steering_could_help` is a field of
    `later_inputs.researchMenu` on `manage_research_access` action `plan_research`, echoed in the runtime result;
    request-local, like the rest of the menu.
  - The release record of #435, What's new for 10 November, and the rule marked released.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so **no app needs a refresh**. No migration, role script, compose or settings change but the
  build line; no privacy or terms change.
- **Before deploying:**
  - `npm run lessons:status` at 18:38:09 UTC: open 43; needs review 6; accepted but not incorporated 1; incorporated or
    closed 41; deletion eligible 0; lane items unrecorded 0, in open pull requests 0. New since 9 Nov: lesson #60
    (people's reports matched to a long-term dose, 16:31 UTC), which this release doesn't touch; it goes to the next
    build.
  - All seven CI checks passed on #436's head `5905cf8a`; `npm run verify` at `5905cf8a`: 6,428 passed, 6 skipped, the
    typecheck and the build. The private-map check found nothing to refuse.
- **Source:** #436 marked ready at 18:42:49 UTC and merged at 18:53:47 UTC as
  `3c9e0612ed1a2a52f5c7a5c2b21d70fbfab6f2b0`, whose tree equals the head's.
- **Image:**
  - source archive SHA-256 `d7214d39ec7dc9ecf86ec640c13afbc02f895ac375b185236ece27601c794a6f`;
  - ID `sha256:a6e43025363d60b016dfe2bf50fa8fd0c8ee7b25e95ac89acc232c7f3f814cab`, user `node`;
  - image archive 122,015,868 bytes, SHA-256 `529880351b8662442fa21cf923b591b664afcd0eba9e30080f03c33c6453b607`,
    copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.41 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A, 19:02:08 UTC):** research-mcp on `48919464`, healthy; `compose.living-evidence.yaml`
  `196da407`; the role scripts `a40256a6` and `7f361afa`; `runtime.env` 80 names, one of them the OpenAlex key's; the
  promotion timer enabled; the site release `48919464`. The owner's maps file copied, the same bytes as on 9 Nov.
- **Stage B (19:02:37 to 19:03:16 UTC):**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-3c9e0612ed1a2a52f5c7a5c2b21d70fbfab6f2b0` (the prior image,
    `48919464`'s, tagged `rollback-pre-3c9e0612ed1a`, the selector, `runtime.env`, both compose files and both role
    scripts), and a `living_evidence` dump of 17,608,011 bytes, SHA-256 `94b5f7c20e2a33c4…`;
  - migrate: nothing new, 0018 to 0033 recorded with the release files' hashes;
  - both role scripts re-run with the same bytes; the review role may run exactly its script's 36 functions and the
    access role its 15; the boundaries as before (the review role holds no table or column right; the access role its
    tables and 15 columns; the reader can't read the held YouTube findings or the call record, and reads the 11 Atlas
    tables);
  - `runtime.env`: 80 names, only the build line changed; the OpenAlex key's line kept as #435 wrote it (one line, well
    formed, never printed); the selector names `askrigor-research:3c9e0612ed1a2a52f5c7a5c2b21d70fbfab6f2b0`; the maps
    file reinstalled with the same bytes; the compose file unchanged;
  - research-mcp recreated at 19:03:16 UTC, healthy, with the reader and maps mounts read-only; the running service has
    the OpenAlex key set (checked without printing it).
- **The site, after the image (19:03:40 UTC; no privacy change, so What's new went out once the rule was live):** the
  archive was made with the merge's own script in the next-build worktree, whose tree equals the merge's; its tar
  equals the separately built one (`8c8e9e08afecb86bb690911c4e27109ec02d628fc2c522e3be5ca235a2a1a170`); the archive is
  324,683 bytes, SHA-256 `8f6c081d1e2762d384949c6d60ade8d37922816c29392257cf50afe441f9bfc6`, checked again on the host;
  the installer `c7992a2f`. Installed over release `48919464` with the Atlas upstream and the proxy secret read on the
  host; Caddy recreated. All eight pages and `robots.txt` equal the merge's files byte for byte; the privacy page still
  reads "Effective November 9, 2026", the terms "Effective November 6, 2026"; through askrigor.com the Atlas pages
  answer as before, with their security headers, and `askrigor.com/atlas` equals `mcp.askrigor.com/atlas`.
- **Stage C (19:04:19 to 19:05:21 UTC):** `/version` names build `3c9e0612`, HRP 20.6.41; an unauthenticated POST gets
  401; `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal their fixtures in the image;
  the site's pages and the Atlas pages answer 200; the in-image probes pass as for `48919464` (a passing final check,
  the full-text, forum-reader and shared-answers probes; the 14 review actions owner answers 171 and 173 added are
  named in the published description, as the frozen list has them, and in no input schema, so the probe's schema line
  reads "missing" as it did on 9 Nov); the all-journal search from production, with the key, found the 1999 Syrian
  rue oil paper (`10.1080/12538078.1999.10515822`) first, and the key appears nowhere in the result; one log line,
  with no credential-like marker.
- **Promotion:** the hardened one-shot service ran once (success, exit 0), the timer was enabled again with its next
  trigger at 19:10:11 UTC, and the selector binds the deployed image.
- **Plugin:** no packaged file changed since `48919464` (0 of 8); the source and the installed copy each equal the
  merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it was not reinstalled.
- **Claude's connector (19:06 UTC):** `get_protocol_manifest` reported HRP 20.6.41, build `3c9e0612`, research access
  ready, no out-of-date sentence. `plan_research` with a precise menu (`steering_could_help` false, one study search,
  0.5 to 3 minutes) returned `next` `go_on`, style balanced, the field echoed; the same menu with the field left out
  returned `next` `ask`, with no field in the result.
- **Connector probe (Codex's AskRigor app, 19:07 UTC):** 35 tools; `tool_list_version`
  `0d6016087ee4bc5a`; HRP 20.6.41 (`e1705d3e958ea5d0`), running build `3c9e0612`; no out-of-date sentence; `inspect`
  ACTIVE, FREE_CONTRIBUTOR, with the new wording of balanced. Through the app's loaded tool list, `plan_research`
  gave the precise menu `go_on` (0.5 to 3 minutes, `steering_could_help` false echoed, "Do these tasks now"); with the
  field left out, `ask`, saying the person's choices could steer this research and asking the AI to say in one line
  what they could change; with the field false and six papers to read in full (6 to 15 minutes), `ask`, because the
  tasks could take more than about 10 minutes. `search_europe_pmc` with `later_inputs.index` `all_journals` returned
  provider `openalex`, access complete, 2 records, the 1999 paper first (on 9 Nov the same search through the app had
  timed out once).
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-3c9e0612ed1a` (the image of `48919464`),
  restore `runtime.env` from the rollback folder (only its build line differs), and recreate research-mcp
  (`infra/living-evidence-production/README.md`); reinstall the `48919464` site release, whose only difference is the
  What's new fold for 10 November. No migration to undo.
