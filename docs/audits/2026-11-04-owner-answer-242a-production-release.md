# Production release, 2026-11-04 (owner answer 242a)

- **Owner decision:** "242: A, release #412", typed on 4 Nov at about 21:15 UTC in the session that made this release.
- **Contents of #412**, the build after #411:
  - **The review queue** (the owner, 4 Nov: "when a finding is not accepted, it's put into a review queue anyway to check it
    so we don't lose findings on technicalities"): a free contributor's card that wasn't saved goes to the private findings
    repository as an issue labeled `unsaved-card` alone, with what stopped it. Design:
    `docs/superpowers/plans/2026-11-04-review-queue.md`.
  - **HRP 20.6.38**, outside the core: `FindingsCardForAPerson` tests a plain search of the problem by someone who has
    never heard of the option, a mention doesn't fail a finding, and a new card replaces an earlier one only on the same
    question.
  - **Lesson 54** (owner rule 148a): `ChangeIsNotHarm`.
  - **The kept pages:** a kept finding's page no longer says a separate AI found that a quick answer misses it.
  - **The quick-answer test** asks about the problem, and fails a finding only when the quick answer already gives its
    useful point. The release record of #411.

  The tool list is unchanged (35 tools, fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`), so **no app needs a refresh**. There is no migration and no role-script, compose or setting
  change, apart from the build line.
- **Before deploying:**
  - `npm run lessons:status` at 21:16 UTC: open 37, needs review 0, accepted but not incorporated 2, incorporated or closed
    40, deletion eligible 0, lane items unrecorded 0.
  - `npm run verify` on `8911a7cb` passed: 5,577 tests passed, 6 skipped, and the build. All seven CI checks passed.
  - The `unsaved-card` label was created in the findings repository.
- **Source:** marked ready and merged at `8911a7cb` at about 21:18 UTC as `bf3581aaddcc0b7b99feac7212300b353fd23393`, whose
  tree equals the head.
- **Image:** source archive SHA-256 `52fed6ba906d113b6293d88ddd8f76ad6c8a759ae5cf93157b43744f429aa8cc`; ID
  `sha256:b2bc7ca0d4b67b6b8588070d5875900f9f855045db13014e4f11f7e6662951bd`, user `node`; image archive 132,739,555
  bytes, SHA-256 `53965c3ead96f6df54415233e263c0b3639b0c0cbc421b6aa8d18f6eddc61f6b`. No-secret gate: `/healthz` ok,
  HRP 20.6.38 and Universal 20.5.46, one log line, none naming a credential.
- **Copying the image:** two `scp` runs lost their connection part way, with nothing changed on the host. `rsync` with
  `--partial` finished it in about three minutes, and the archive's SHA-256 was checked on the host.
- **Prior state (stage A):** `research-mcp` on `6afa39e0`, healthy; selector `0b2a6457304e0fef`, `runtime.env`
  `f2b9301b9a85780e` (78 names, 8 Atlas lines), compose `3b37929292d54f98`, both role scripts the last release's; the site
  on the `b9e658e2` release; the timer enabled.
- **Switch (stage B, run on the host from a file, at about 21:31 UTC):** the new image read Reddit through production's key
  (`READER_OK`); the timer stopped and disabled; schema dump 15,384,516 bytes, SHA-256 prefix `010906c6377d38cd`; migrate
  complete, with 0018 to 0024 recorded with the same hashes; both role scripts re-run, the review role with exactly its 27
  functions and the access role its 11, and the boundaries proven again; selector `98d9b10eb5fe1855`; `research-mcp`
  recreated at 21:31:22 UTC, healthy, with the reader's mount read-only.
- **Acceptance:**
  - **public:** `/version` reports the build, HRP 20.6.38 and Universal 20.5.46; an unauthenticated POST to `/mcp/claude`
    gets 401; anonymous `/mcp` lists 35 tools, equal to the frozen fixture; the privacy, terms and support pages give
    200, the Atlas 200, and the sign-in redirect 302;
  - **host:** the security envelope, the three writable mounts, and one log line, none credential-like; the in-image
    probe, with the three tool-list versions equal to their fixtures and a passing check returning its checked answer;
    the panel folds; the full-text probe; the forum reader (`READER_OK`); shared answers on;
  - **review actions probe:** 14 of 14 named in the published `/mcp/claude` schema;
  - **blocking probe:** a clean draft `ready_with_limits`, and a missing source receipt and a broken figure `not_ready`;
  - **promotion:** the one-shot succeeded (`no_pending_promotion`, `complete`), and the timer is enabled and active;
  - **the review queue, through the live final check:** a card with invented content, labeled a release test, whose quote
    wasn't in the answer and whose sources weren't verified. The check stayed `ready_with_limits`, the card came back
    rejected with `saved.reason` `kept_for_review`, and the answer's saved line named ARF-0292. The issue carried only the
    `unsaved-card` label and what stopped the card. Its forum link was left out of the copy and of the problems, and
    nothing reached the Atlas. It was then closed by hand.
- **Site:** not released, because nothing under `site/` changed.
- **Plugin:** no packaged file changed. The source and installed copies equal the merge's, receipt `3e83000a…`, so there
  is no reinstall.
- **Connectors:** the owner's ChatGPT app, through Codex, sees 35 tools with tool list `0d6016087ee4bc5a`, reports build
  `bf3581aa`, HRP 20.6.38 and research access ACTIVE (free contributor), with no out-of-date sentence. This Claude
  account's connector reports the build and HRP 20.6.38, with sign-in accepted and research access ready.
- **Not yet shown live:** a later saved card closing a copy, and `forget_card` removing one. Both are tested against the
  fake GitHub only.
- **Rollback:** `/opt/askrigor/rollbacks/pre-bf3581aaddcc0b7b99feac7212300b353fd23393` holds the prior `runtime.env`,
  selector, both compose files, the role scripts and the schema dump, and the prior image is tagged
  `askrigor-research:rollback-pre-bf3581aaddcc`. To return build `6afa39e0`:
  1. stop and disable the promotion timer, deleting no proposals, intents, receipts or canonical evidence;
  2. restore the prior selector, `runtime.env` and compose file;
  3. recreate `research-mcp`.

  Nothing in the database changed, so build `6afa39e0` runs as it did. Issues labeled `unsaved-card` stay, and nothing in
  that build reads them.
