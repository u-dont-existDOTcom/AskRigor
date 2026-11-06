# Production release, 2026-11-04 (owner answer 241a)

- **Owner decision:** "241: A, release #411", typed on 4 Nov at about 15:04 UTC in the session that made this release.
  Owner answer 239 a1, earlier that day, approved the protocol wording as written and left a quote not found as a note.
- **Contents of #411**, the build after #398:
  - **The source line** (237a): `source_lines`, a later input of `finalize_research`. Once a check passes, the two quotes
    of each line are looked up word for word in the text AskRigor fetched, and the panel says what was found.
  - **HRP 20.6.37** (239 a1), outside the core: the source line, "out of 100" counts with an evidence grade, a bottom line
    when evidence is uncertain, doubt in the first person, who paid, when care is out of reach, the "test it yourself"
    ending, the `what_could_this_be` mode, how a question becomes research, and what goes on a findings card.
  - **Lessons 53 and 52** (owner rule 148a): `ResultThatChangesWithDose` and `SignIsNotADiagnosis`.
  - **Owner answer 240a:** a saved card's findings are kept for AskRigor's research until a separate AI's quick-answer
    test shows them (`docs/atlas-quick-answer-test.md`), and a later card replaces an earlier one only on the same
    question. The Atlas home and status block say so.
  - The meaning judge's fifth job, which reads whether a source line's quotes back its claim. The judge stays off.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so **no app needs a refresh**. There is no migration and no role-script, compose or setting
  change, apart from the build line.
- **Before deploying:**
  - `npm run lessons:status` at 15:04 UTC: open 36, needs review 0, accepted but not incorporated 3, incorporated or
    closed 38, deletion eligible 0, lane items unrecorded 0.
  - `npm run verify` on `94fb1ae4` passed: 5,549 tests passed, 6 skipped, and the build. All seven CI checks passed.
- **Source:** marked ready and merged at `94fb1ae4` at about 15:08 UTC as `6afa39e056b895fd4ee337d08015728be17f71d0`, whose
  tree equals the head.
- **Image:** source archive SHA-256 `f1f873935eb8667dcd8701906df8ba58f4bbbbe0e1070bc63598c78d195c62e3`; ID
  `sha256:beac555b5d242faaa16b3251dac16c9c26422252d6ba93a52c73a806dbcc1c52`, user `node`; image archive 132,717,016
  bytes, SHA-256 `7d87ca471ffc83dadb12b07df95dc950997539445e260afc97a270e1ed4ee654`. No-secret gate: `/healthz` ok,
  HRP 20.6.37 and Universal 20.5.46, one log line, none naming a credential.
- **Prior state (stage A, 15:10:28 UTC):** `research-mcp` on `06fe887d`, healthy; selector `1f8f3bab1ae6fe5f`,
  `runtime.env` `3cf0c91534a42bbe` (78 names, 8 Atlas lines), compose `3b37929292d54f98`, both role scripts the last
  release's; the site on the `b9e658e2` release; the timer enabled.
- **Switch (stage B, run on the host from a file, from 15:10:51 UTC):** the new image read Reddit through production's key
  (`READER_OK`); the timer stopped and disabled; schema dump 15,190,080 bytes, SHA-256 prefix `4dfac45f99c50718`;
  migrate complete, with 0018 to 0024 recorded with the same hashes; both role scripts re-run, the review role with
  exactly its 27 functions and the access role its 11, and the boundaries proven again; selector `0b2a6457304e0fef`;
  `research-mcp` recreated at 15:11:20 UTC, healthy, with the reader's mount read-only.
- **Acceptance:**
  - **public:** `/version` reports the build, HRP 20.6.37 and Universal 20.5.46; an unauthenticated POST to `/mcp/claude`
    gets 401; anonymous `/mcp` lists 35 tools, equal to the frozen fixture; the privacy, terms and support pages give
    200, the Atlas 200, and the sign-in redirect 302; the Atlas home carries the new wording;
  - **host:** the security envelope, the three writable mounts, and one log line, none credential-like; the in-image
    probe, with the three tool-list versions equal to their fixtures and a passing check returning its checked answer;
    the panel folds; the full-text probe; the forum reader (`READER_OK`); shared answers on;
  - **review actions probe:** 14 of 14 named in the published `/mcp/claude` schema;
  - **blocking probe:** a clean draft `ready_with_limits`, and a missing source receipt and a broken figure `not_ready`;
  - **promotion:** the one-shot succeeded (`no_pending_promotion`, `complete`), and the timer is enabled and active;
  - **the source line, with a real open paper in the live image:** a true sentence and conclusion came back `found`,
    with the section and the mark offered; the same sentence with one word changed came back `not_found`, with no mark,
    and the check stayed `ready`.
- **Site:** not released, because nothing under `site/` changed.
- **Plugin:** no packaged file changed. The source and installed copies equal the merge's, receipt `3e83000a…`, so there
  is no reinstall.
- **Connectors:** the owner's ChatGPT app, through Codex, sees 35 tools with tool list `0d6016087ee4bc5a`, reports build
  `6afa39e0`, HRP 20.6.37 and research access ACTIVE (free contributor), with no out-of-date sentence. This Claude
  account's connector reports the build and HRP 20.6.37, with sign-in accepted and research access ready.
- **Not yet shown live:**
  - A card saved after the release staying off the pages: no lane had saved one when this was written.
  - The quick-answer test as a scheduled task: the session's safety check refused its creation, so the owner creates it
    (`askrigor/atlas-quick-answer-task.md` on the owner pages). New cards wait until then.
- **After the release:** lessons 52 and 53 are marked incorporated.
- **Rollback:** `/opt/askrigor/rollbacks/pre-6afa39e056b895fd4ee337d08015728be17f71d0` holds the prior `runtime.env`,
  selector, both compose files, the role scripts and the schema dump, and the prior image is tagged
  `askrigor-research:rollback-pre-6afa39e056b8`. To return build `06fe887d`:
  1. stop and disable the promotion timer, deleting no proposals, intents, receipts or canonical evidence;
  2. restore the prior selector, `runtime.env` and compose file;
  3. recreate `research-mcp`.
