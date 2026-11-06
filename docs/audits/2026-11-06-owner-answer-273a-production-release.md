# Production release, 2026-11-06 (owner answer 273a)

- **Owner decision:** "273a", typed in chat on 6 Nov in the session that made this release (first at about 21:35 UTC, again at about 22:23 UTC).
- **Contents:** #422, the owner's requests of 6 Nov 2026:
  - **how much of each study was read:** every study the answer links in an exact form (doi.org, PubMed, PMC or Europe PMC, or a page one paper's receipts sign) gets its reading from receipts, or "not looked up by AskRigor" (`linked_reading`, notes only); one sentence of exact counts of distinct studies read and listed (`reading_summary`), shown first in the panel under every status with receipts; Europe PMC search receipts group each record's identifiers (`rg`); the result says HRP StudyReadDepthDisclosure makes each reading, and who paid for each key study, required beside the claim. Check 1's link matching is unchanged from before this build;
  - **closing questions:** when an answer depends on the person, at most three questions with examples (what they're deciding, whether they match the people studied, their key measurement);
  - **findings that challenge the usual view:** migration 0030 (six nullable columns on `atlas_publications`, one check, and the review role's `mark_atlas_challenges` and `inspect_atlas_challenges`); runtime review actions `mark_challenge`, `clear_challenge` and `list_challenges`; the page `/atlas/challenges`; a box on the finding page; a stored quick-answer verdict instead of inferring a pass from being shown;
  - **a stored text never stops a page:** write-time checks read text without format characters, and rows a page would refuse are left out;
  - **the notice:** `inspect` gives an account that hasn't accepted the current notice the step to show it word for word, ask, and accept only after the user's yes (lesson 57).

  Four rounds of independent review; the final recheck found nothing material. The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`), so **no app needs a refresh**. No compose or env change, and no packaged plugin file changed since the live build `9dbc743a`.
- **Before deploying:**
  - `npm run lessons:status` at 22:25:00 UTC gave: open 41; needs review 4; accepted but not incorporated 1; incorporated or closed 41; deletion eligible 0; lane items unrecorded 2.
  - #422 took main (`e853e09a`, the site update) as `d7d0b67a`; all seven CI checks passed there. `npm run verify` at `94ce687b` passed: 6,303 tests, 6 skipped, the typecheck and the build; the PostgreSQL acceptance passed its 95 checks, migration 0030 included.
- **Source:** #422 marked ready and merged at `d7d0b67a` at 22:25:57 UTC as `dc2887b198e9e8d1d1f4faaa4b95ed3cfbb1c4d7`, whose tree equals the head's.
- **Image:**
  - source archive SHA-256 `1cfe9eb1445e80344071fb959364c781b59b65172b7d8278230f5fbd4ee55c51`;
  - ID `sha256:6d41e3da430b5006e931ae2c2b59a3922740248c89b3e211bd9be0ac2a7b4a0c`, user `node`;
  - image archive 133,317,452 bytes, SHA-256 `2e69d92743527dc96359f6a0f2236949477285cae166b83d4108a3876f9cb2be`, copied with `rsync --partial` and checked on the host.

  The no-secret gate passed: `/healthz` ok, HRP 20.6.40 and Universal 20.5.46, and one log line, naming no credential.
- **Prior state (stage A, 22:29:21 UTC):** research-mcp on `9dbc743a`, healthy; `compose.living-evidence.yaml` `196da407`; the role scripts `6e6063fb` and `d0ceedfc`; `runtime.env` 79 names; the promotion timer enabled.
- **Stage B (22:30 UTC):**
  - the new image read Reddit through production's key (`READER_OK`); the timer stopped;
  - rollback kept in `/opt/askrigor/rollbacks/pre-dc2887b198e9e8d1d1f4faaa4b95ed3cfbb1c4d7` (the prior image tagged `rollback-pre-dc2887b198e9`, the selector, `runtime.env`, both compose files and both role scripts, and a `living_evidence` dump of 17,350,231 bytes, SHA-256 `3534a429288afe8d…`);
  - migrate: 0018 to 0030 recorded with the release files' hashes, and the notice check admits v5;
  - the review role's new script (`a40256a6`) and the access role's re-run: the review role may run exactly its script's 36 functions and the access role its 15; the review role holds no table or column right, the access role exactly its own, and the reader can't read the held YouTube findings and reads the 11 Atlas tables;
  - `runtime.env`: 79 names, only the build line changed; the selector names `askrigor-research:dc2887b198e9e8d1d1f4faaa4b95ed3cfbb1c4d7`; the owner's maps file reinstalled with the same bytes; the compose file unchanged;
  - research-mcp recreated at 22:30:15 UTC, healthy, with the reader and maps mounts read-only.
- **Stage C (22:30 to 22:32 UTC):** `/version` names build `dc2887b1`, HRP 20.6.40; an unauthenticated POST gets 401; `/mcp` lists 35 tools, equal to the frozen fixture, and the three tool lists equal their fixtures in the image; the site's pages and the Atlas pages answer 200; a passing final check; 14 of 14 review actions named in the published description (the new ones runtime-only); a clean draft passes, and a key source with no receipt and an arithmetic error still block; `/atlas/challenges` answers 200, noindex, titled "Findings that challenge the usual view".
- **Promotion:** the hardened one-shot service ran once (success), the timer was enabled again with its next trigger at 22:35:11 UTC, and the selector binds the deployed image.
- **Plugin:** no packaged file changed since `9dbc743a` (0 of 8); the source and the installed copy each equal the merge's files, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, so it was not reinstalled.
- **Connector probe (Codex's AskRigor app, 22:32 UTC):** 35 tools; `tool_list_version` `0d6016087ee4bc5a`; HRP 20.6.40 (`afd3d881356337dd`), running build `dc2887b1`; no out-of-date sentence; `inspect` ACTIVE, FREE_CONTRIBUTOR.
- **After the release:** the owner's daily quick-answer task gained, at 22:34 UTC, the step that asks a second fresh helper for the usual view and marks a finding that goes against it, shown right away (owner answer 272a).
- **The site update (owner answer 267b), released at 21:12 UTC after #421:** #415 merged at `d6da63c8` as `e853e09a0c008090f5801cad94f1b5979201503d`; its site archive checked against a separately built tar (`c14e8c59…`), staged root-only and installed with the merge's installer, which recreated Caddy with the handles for `/add`, `/roadmap`, `/compare` and `/compare/free-chatgpt`; all eight pages equal the merge's files, and the Atlas answers through askrigor.com as before.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-dc2887b198e9` (the image of `9dbc743a`), restore `runtime.env` from the rollback folder and recreate research-mcp. Migration 0030 only adds nullable columns, a check and two functions, which the prior image doesn't use.
