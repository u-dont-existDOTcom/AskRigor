# Production release, 2026-11-12 (owner answer 292a)

- **Owner decision:** "292a, release it", typed in chat at 13:27:20 UTC on 12 Nov in the session that made this release
  (the owner had chosen 292a in the Inbox at 12:53 UTC; releases need the yes in chat).
- **Contents:** #437:
  - **The menu's steering field takes HRP's approval test** (`3a0d622e`, 10 Nov): `steering_could_help` is described with
    HRP `StructuredUserSteeringAndApproval`'s test, after the 10 Nov timing runs said false on all 14 questions.
  - **An ask ends the turn** (the owner, 11 Nov: "it's still not asking me any steering questions"): the result that
    asks puts the stop first and gives the message to send (menu, recommendation, "How should I spend the time?"), with
    no research call and no final check for a question; `next_step` (runtime structuredContent) carries the step for
    clients that read only structured content; an allocation naming no open task is not the person's answer; a
    non-autonomous re-plan with a new task asks. Every research result's reminder says a research turn ends with the
    checked answer or the waiting question.
  - **Server instructions (2,048 bytes)** open with the run's steps: inspect, the plain answer, a brief screen, then
    `plan_research` before deep reading (the owner's call record of 11 Nov: 9 ChatGPT runs, `plan_research` in none),
    then the stop at an ask and "never a progress report".
  - **A pass ends the checking:** a passing check is the turn's last unless the draft changes, then once more (the
    round token keeps the turn's pass; `turn_already_passed` is runtime-only); notes asking for an input wait, a note
    saying the answer is wrong is fixed now; the reading tools and method audits give the `source_reading` and study-map
    shapes before the first check.
  - **Accuracy:** a premise that could be false becomes a claim of the plain answer, which the sixth check compares;
    `get_youtube_video` says it returned the video's details, not what is said in it; a video audit says how many of the
    retrieved comments it shows (AskRigor#438); a passing check says a pass covers its six checks, not whether the search
    was complete (lesson 56); Gemini's reading and audit texts leave out the final check its catalog lacks.
  - **The call record keeps `plan_research`'s decision** (owner answer 289a): migration
    `0034_research_call_record_plan_next`, the privacy notice's "Your call record" paragraph changed first, effective
    November 12, 2026.
  - **GitHub Sponsors** on the support page and in `.github/FUNDING.yml` (owner decision 264a).
  - Reviews before release: two adversarial reviews (11 findings, then 3) and Greptile's review of the head (4
    findings), all fixed (`e768a04d`, `fc259264`, `b39e4e54`, `fca749d3`) and their threads resolved.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so no tool refresh; **the server instructions changed, so each ChatGPT app should refresh
  AskRigor once** to read them. One migration; no role script, compose or settings change but the build line.
- **Before deploying:**
  - `npm run lessons:status` at 13:29:28 UTC: open 44; needs review 7; accepted but not incorporated 1; incorporated or
    closed 41; deletion eligible 0; lane items unrecorded 0, in open pull requests 0.
  - All required checks passed on #437's head `fca749d3` (Deterministic verification, workflow-policy; CodeQL and the
    four analyses too); `npm run verify` at `fca749d3`: 6,446 passed, 6 skipped, the typecheck and the build;
    `npm run test:site`: 8 pages. The private-map check found nothing to refuse. Migration 0034 ran on the local
    acceptance database (`npm run contributor-access:postgres-acceptance`: PASS).
- **Source:** #437 merged at 14:00:31 UTC as `a826ad108705f8e9789746bb72d2226c6f606bbc`, whose tree equals the head's.
- **Image:**
  - source archive SHA-256 `2dfae89cb38a896ec24de8b58221f02a6fab572c58423e8fa3dbe59384ca9b6e`;
  - ID `sha256:eeb9fbd5b77309cacd40b9223339ecd61530e59541757a789df7123aa4808e3d`, user `node`;
  - image archive 122,037,601 bytes, SHA-256 `393ee3902237ae846145a41fb068507229fe2fa7eb1e36bcb979d77eda5a3237`,
    copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.41 and Universal 20.5.46, and one log line, naming no credential.
- **The site first (14:00:54 to 14:01:10 UTC), since the privacy notice changed:** the archive was made with the
  merge's own script in the next-build worktree, whose tree equals the merge's; its tar equals the separately built one
  (`3be18ead4eef68fe6ffb77a4aae6c974ad3871ad16e64f2963e4cdca5a5e407c`); the archive is 325,326 bytes, SHA-256
  `7bf987ddb84fa8b88f01ffc8fffa0bf1dc8dbfbda8eeac626fa82826e8140c21`, checked again on the host; the installer
  `c7992a2f`. Installed over release `3c9e0612` with the Atlas upstream and the proxy secret read on the host; Caddy
  recreated. All eight pages and `robots.txt` equal the merge's files byte for byte; the privacy page reads "Effective
  November 12, 2026", the terms "Effective November 6, 2026"; the Atlas pages answer as before, with their security
  headers, and `askrigor.com/atlas` equals `mcp.askrigor.com/atlas`.
- **Prior state (stage A, 14:03:09 UTC):** research-mcp on `3c9e0612`, healthy; `compose.living-evidence.yaml`
  `196da407`; the role scripts `a40256a6` and `7f361afa`; `runtime.env` 80 names, one of them the OpenAlex key's; the
  promotion timer enabled; the site release already `a826ad10`. The owner's maps file copied, the same bytes as before.
- **Stage B (14:03:20 to 14:04:07 UTC):**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-a826ad108705f8e9789746bb72d2226c6f606bbc` (the prior image,
    `3c9e0612`'s, tagged `rollback-pre-a826ad108705`, the selector, `runtime.env`, both compose files and both role
    scripts), and a `living_evidence` dump of 17,848,312 bytes, SHA-256 `1512f0c53c6161ac…`;
  - migrate: `0034_research_call_record_plan_next` applied (`f572d4cb998b3cf6`), 0018 to 0034 recorded with the release
    files' hashes, before the image that writes the column served;
  - both role scripts re-run with the same bytes; the review role may run exactly its script's 36 functions and the
    access role its 15; the boundaries as before (the reader can't read the held YouTube findings or the call record,
    and reads the 11 Atlas tables);
  - `runtime.env`: 80 names, only the build line changed; the selector names
    `askrigor-research:a826ad108705f8e9789746bb72d2226c6f606bbc`; the maps file reinstalled with the same bytes; the
    compose file unchanged;
  - research-mcp recreated at 14:03:59 UTC, healthy, with the reader and maps mounts read-only; the running service has
    the OpenAlex key set (checked without printing it).
- **Stage C (14:04:15 to 14:05:11 UTC):** `/version` names build `a826ad10`, HRP 20.6.41; an unauthenticated POST gets
  401; `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal their fixtures in the image;
  the site's pages and the Atlas pages answer as before; the in-image probes pass as for `3c9e0612` (a passing final
  check, the full-text, forum-reader and shared-answers probes; the review actions' schema line reads "missing" as
  before); the all-journal search from production found the 1999 Syrian rue oil paper
  (`10.1080/12538078.1999.10515822`) first, and the key appears nowhere in the result; one log line, with no
  credential-like marker.
- **Promotion:** the hardened one-shot service ran once (success, exit 0), the timer was enabled again with its next
  trigger at 14:10:14 UTC, and the selector binds the deployed image.
- **Plugin:** no packaged file changed since `3c9e0612` (0 of 8); the source and the installed copy each equal the
  merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it was not reinstalled.
- **Claude's connector (14:05:47 UTC):** `plan_research` with `steering_could_help` left out and two tasks (3 to 8
  minutes) returned `next` `ask` and `next_step` "Ask the person now and end your turn: …"; `list_calls` then showed that
  call as `plan_research` on `/mcp/claude` with `plan_next` `ask` (owner answer 289a, live).
- **Connector probe (Codex's AskRigor app):** 35 tools; `tool_list_version` `0d6016087ee4bc5a`; HRP 20.6.41 (`e1705d3e958ea5d0`), running build `a826ad10`; no
  out-of-date sentence; `inspect` ACTIVE, FREE_CONTRIBUTOR, balanced. Through the app's loaded tool list, `plan_research` gave
  the precise menu `go_on` (0.5 to 3 minutes) with `next_step` "Do the recommended tasks now, …" and the text "Go on now: …";
  with the field left out, `ask`, with `next_step` "Ask the person now and end your turn: …" and the sentence "Ask now,
  before any of these tasks: your whole reply this turn is the message below …"; with six papers to read in full (6 to
  15 minutes), `ask`. `search_europe_pmc` with `later_inputs.index` `all_journals`: provider `openalex`, access complete,
  2 records, the 1999 paper first. `list_calls` showed the three menu calls as `plan_research: go_on`, `ask`, `ask`.
  **Found:** these calls sent no `tool_list_version`, so the first sentence of each `plan_research` result was the
  tool-list notice ("If get_protocol_manifest in this app's tool list has no tool_list_version field, …"), before "Ask
  now". The next build puts that notice after the result's own text on every step but `inspect`, which keeps it first.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-a826ad108705` (the image of `3c9e0612`),
  restore `runtime.env` from the rollback folder (only its build line differs), and recreate research-mcp
  (`infra/living-evidence-production/README.md`); reinstall the `3c9e0612` site release (privacy notice effective
  November 9, 2026). Migration 0034 needs no undo: an earlier image writes no decision, so the column stays empty.
- **After the release:** the owner refreshes AskRigor in each ChatGPT app once; then the ChatGPT measurement of the
  plan (`docs/superpowers/plans/2026-11-09-research-steering.md`, section of 11 Nov): at least 12 of 15 first turns in
  the owner's usual mode end with the question (owner answer 288b: if missed, the enforced stop on the dev logins plus a
  menu card).
