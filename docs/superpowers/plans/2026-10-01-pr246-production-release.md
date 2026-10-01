# PR #246 production release plan

Date: 2026-10-01. Status: **PLANNED**. Nothing here runs until the owner
approves merging and deploying u-dont-existDOTcom/AskRigor#246 by name on the
owner questions page (question 19). This plan prepares that approval; it is not
one.

## What the release ships

**Production's current version is not recorded.** The last release record is
`docs/audits/2026-09-11-longitudinal-evidence-production-release.md` (image
`askrigor-research:23b14f205621352f2c7f67a074bddb7e91c65ee1`, HRP 20.5.28 and
Universal 20.5.23). A later deploy happened without a record:
`https://mcp.askrigor.com/mcp/claude` answers 401 (main's #236 route; it answers
404 before it), and the installed plugin is `0.1.0+codex.20260919021156`, whose
`skills/askrigor/SKILL.md` equals main's (unchanged since `781670c9`, 13 Sep).
Reading the server to settle it was blocked by Claude Code's safety check as a
production read without the owner's approval, so step 4 records it first.

The release therefore ships #246 **and everything merged to main since the
deployed version**. Main's merges since 23b14f20 include the Claude connector
route (#236), the lesson incident vault and lesson generalization (#224, #226,
#229), Dependabot updates, the site logo (#247, site only), the task-mode
integration (#252, Universal 20.5.27) and the test fixes (#254).

From #246 itself:

- Protocols: HRP 20.6.8 (518,708 bytes, SHA-256
  `641473288653e5e2249527c3626d20c298c9b2f302ffc79feaad7c12191606b8`) and
  Universal 20.5.33 (177,276 bytes, SHA-256
  `981429bd73d163f860ab3939aae5ac7057a3557285faa59fa3c8779f12c9722a`),
  served by section in bounded pages, so Claude clients can load them.
- MCP catalog: 27 to 32 tools (`assess_treatment_landscape_coverage`,
  `scout_gemini_youtube_candidates`, `finalize_research`,
  `submit_lesson_candidate`, `save_research_findings`); inventory SHA-256
  `c943d460…` (main `5dd514a9…`). The Gemini catalog stays at 22.
- The server's completion gate, the Reddit thread check, scout-first
  discovery, the comment-audit fixes.
- Free contributor notice v2 (`free-contributor-v2-2026-09-30`): accounts that
  accepted v1 accept v2 once. Migration 0011 (SHA-256 `83a27316…`) lets the
  account table hold either version.
- The findings library ships closed (`ASKRIGOR_FINDINGS_LIBRARY` unset).
- `skills/askrigor/SKILL.md` changes, so the plugin package is reinstalled.
- No Custom GPT editor change: `docs/custom-gpt-sync.json` keeps the GPT's
  instruction and bundle hashes, and the Action document
  (`docs/custom-gpt-action-openapi.json`) is byte-identical to main's.

## Owner decisions and actions

1. **Approve merge and deploy** of #246 by name. The approval also covers
   reading and changing the production host for this release; Claude Code's
   safety check blocks production access without it.
2. **The findings library: open in this release, or later.** Recommended: in
   this release, as a second step after the deploy's checks pass: the approved
   wording onto `/privacy` and `/terms` with that day's effective date (site
   release, which also ships main's logo), the App's token scopes checked,
   then `ASKRIGOR_FINDINGS_LIBRARY=enabled`. "Later" leaves the site as it is.
3. **The Gemini key.** The owner decided on 2026-09-27 to run the scout in
   production with `ASKRIGOR_GEMINI_BILLING=none` on the owner's unbilled key.
   A Claude session may not type API keys into the server's configuration, so
   the owner installs the unbilled key as `ASKRIGOR_GEMINI_API_KEY` in
   `/opt/askrigor/runtime.env`, or confirms the key there is that one. Without
   the flag the scout is off and research uses the YouTube survey. If
   production holds a key today, the new code turns its scout off until the
   flag is set.
4. **Acceptance access.** The checks call AskRigor through this session's
   connector, which refuses research tools until the account has a research
   mode. The owner either allows switching the owner account to paid private
   (its owner entitlement) or runs the three connector checks in a chat.

## Preconditions

- #246 up to date with `main`, all 7 checks green on its head, and local
  `npm run verify` passing on the same head.
- `npm run lessons:status` immediately before the release (17:07 UTC: 2 open,
  2 needing review, 0 accepted but not incorporated, 5 closed, 0
  deletion-eligible).
- `npm run contributor-access:notice-v2-rollback-acceptance` passes (below).

## Steps and commands

`M` is the merge SHA, `M12` its first 12 characters. "Written here" marks a
command no runbook spells out, derived from the documented pattern; check it on
the host before running it.

**Laptop**

1. Merge #246 with a merge commit, then confirm the merge tree equals the PR
   head's: `git diff --quiet "$M^2" "$M"`.
2. Archive and build (pattern: `scripts/create-live-suite-v3-archive.sh`, the
   2026-08-14 plan's build gate):

   ```bash
   git archive --format=tar "$M" | gzip -n > "askrigor-$M.tar.gz"
   sha256sum "askrigor-$M.tar.gz" > "askrigor-$M.tar.gz.sha256"
   mkdir "src-$M12" && tar -xzf "askrigor-$M.tar.gz" -C "src-$M12"
   docker build --pull=false --tag "askrigor-research:$M" "src-$M12"
   docker image inspect "askrigor-research:$M" --format '{{.Id}}|user={{.Config.User}}|workdir={{.Config.WorkingDir}}'
   ```

3. Disposable no-secret gate: `docker run --detach --name "candidate-$M12"
   --read-only --cap-drop ALL --security-opt no-new-privileges:true --tmpfs
   /tmp:rw,noexec,nosuid,nodev,size=64m --publish 127.0.0.1::3000
   "askrigor-research:$M"`, `GET /healthz` returns
   `{"status":"ok","service":"askrigor-research","version":"0.1.0"}`, then
   `docker stop` and `docker rm`. Save and copy:

   ```bash
   docker save "askrigor-research:$M" | gzip -n > "askrigor-research-$M.tar.gz"
   sha256sum "askrigor-research-$M.tar.gz" > "askrigor-research-$M.tar.gz.sha256"
   scp "askrigor-research-$M.tar.gz"* \
     infra/living-evidence-production/research-use-notice-v2-*.sql \
     mission-control-secondary:/root/
   ```

**Production host** (`mission-control-secondary`, 191.215.38.123, as root)

4. Record the prior state before any change: `docker ps --format
   '{{.Names}}|{{.Image}}|{{.ID}}|{{.Status}}'`; SHA-256 of
   `/opt/askrigor/living-evidence-image.env` (the image selector, root `0600`,
   one line `ASKRIGOR_RESEARCH_IMAGE=askrigor-research:<sha>`),
   `/opt/askrigor/runtime.env`, `/opt/askrigor/compose.yaml` and
   `/opt/askrigor/compose.living-evidence.yaml`; `systemctl is-enabled
   askrigor-research-promotion.timer`; the names (never values) in
   `runtime.env`, including `ASKRIGOR_FINALIZATION_SIGNING_SECRET` or
   `ASKRIGOR_YOUTUBE_CONTINUATION_SECRET` (receipts need one of at least 32
   bytes).
5. Load: `sha256sum --check --strict "askrigor-research-$M.tar.gz.sha256"`,
   then `gunzip -c "askrigor-research-$M.tar.gz" | docker load` (written
   here), and require the loaded image ID to equal the laptop's.
6. Stop the promotion timer: `systemctl stop
   askrigor-research-promotion.timer` and `systemctl disable
   askrigor-research-promotion.timer` (written here; runbook:
   `docs/research-contribution-promotion-scheduler.md`).
7. Preserve rollback: `docker tag <prior image>
   "askrigor-research:rollback-pre-$M12"`; `install -d -m 0700 -o root -g root
   "/opt/askrigor/rollbacks/pre-$M"`; copy the selector, `runtime.env` and both
   Compose files there with `cp -p`; and a custom-format dump of the schema
   (written here, from the local pilot's form):

   ```bash
   docker exec askrigor-living-evidence-postgres-1 sh -c 'PGPASSWORD="$(tr -d "\r\n" </run/secrets/living_evidence_migrator_password)" exec pg_dump -h 127.0.0.1 -U askrigor_migrator -d askrigor_living_evidence --schema living_evidence --format custom --no-owner --no-privileges' \
     > "/opt/askrigor/rollbacks/pre-$M/living_evidence.dump"
   ```

   The container name follows Compose's naming; confirm it in step 4's list.
8. Migrate with the new image before it serves (written here, from the
   promotion unit's command line):

   ```bash
   ASKRIGOR_RESEARCH_IMAGE="askrigor-research:$M" /usr/libexec/docker/cli-plugins/docker-compose \
     --project-name askrigor --file /opt/askrigor/compose.yaml --file /opt/askrigor/compose.living-evidence.yaml \
     --profile living-evidence-admin run --rm --no-deps --pull never living-evidence-admin migrate
   ```

   Expect `"operation":"migrate","status":"complete"`. Each migration's SHA-256
   is checked against `schema_migrations`; a mismatch stops it.
9. Configuration in `runtime.env` (root `0600`): set
   `ASKRIGOR_BUILD_COMMIT=$M`. Only after the owner's key step, set
   `ASKRIGOR_GEMINI_BILLING=none`, with `ASKRIGOR_AI_BUDGET_LEDGER=/var/lib/askrigor-actions/ai-budget.json`
   and `ASKRIGOR_AI_MONTHLY_BUDGET_USD=50.00` as documented. Record the file's
   new SHA-256.
10. Point the selector at the new image (write a temporary file, `install -m
    0600 -o root -g root`, then `mv` over the selector), and recreate only
    `research-mcp` with both Compose files (written here; never
    `--remove-orphans`):

    ```bash
    ASKRIGOR_RESEARCH_IMAGE="askrigor-research:$M" /usr/libexec/docker/cli-plugins/docker-compose \
      --project-name askrigor --file /opt/askrigor/compose.yaml --file /opt/askrigor/compose.living-evidence.yaml \
      up -d --no-deps --force-recreate research-mcp
    ```

    PostgreSQL is not recreated.
11. Security envelope of the new container, by `docker inspect`: user `node`,
    read-only root filesystem, `CapDrop` `ALL`, `no-new-privileges`, memory
    1,073,741,824, PIDs 256, writable mounts only `/var/lib/askrigor-actions`
    and `/var/lib/askrigor-research-sessions`, networks exactly
    `askrigor_default` and `askrigor_living_evidence_private`.
12. Acceptance (next section).
13. Promotion: `systemctl start askrigor-research-promotion.service`, expecting
    `no_pending_promotion` in `journalctl -u
    askrigor-research-promotion.service`; then `systemctl enable --now
    askrigor-research-promotion.timer` and `systemctl list-timers
    askrigor-research-promotion.timer` for the next trigger.

**Laptop again**

14. Plugin: copy the merge's `skills/askrigor/SKILL.md` into
    `/home/joel/plugins/askrigor` after a rollback copy
    (`/home/joel/plugins/askrigor.rollback-<stamp>`), then reinstall it in
    Codex. Prior receipt: version `0.1.0+codex.20260919021156`, package SHA-256
    `cf815264d371ab07…` (source and installed agree, 8 files). Take the new
    receipt with `node scripts/plugin-package-receipt.mjs <installed root>`;
    it must show the 8 files with the new skill bytes.
15. If the owner chose to open the findings library: build the site archive
    with `scripts/create-public-site-archive.sh "$M" <archive>` after adding
    the approved wording and the day's effective date (a separate reviewed
    commit), install it with `ops/public-site/install-public-site.sh` (it
    checks, switches and rolls itself back), check that a findings token lists
    only `AskRigor-findings` and a lesson token only `AskRigor-lessons`, set
    `ASKRIGOR_FINDINGS_LIBRARY=enabled`, recreate `research-mcp` as in step 10,
    and save one synthetic card end to end.
16. Release record: `docs/audits/<date>-pr246-production-release.md` and
    `.json`, a `docs/INDEX.md` entry, and the release-time lesson checkpoint.

## Acceptance

- `/healthz` returns 200 with the body above, and the new container's startup
  log has no credential or provider marker (the classes in the 2026-09-08
  release record).
- The connector lists exactly 32 tools on `/mcp` and on `/mcp/claude`.
- `get_protocol_manifest` returns HRP 20.6.8 and Universal 20.5.33 with the
  SHA-256 values above, and `load_protocol` pages return the complete texts.
- One read-only PubMed search returns a record.
- One Reddit thread lookup from production reaches the public embed endpoint.
  It has never run live.
- With the billing flag set: one scout call completes, and the ledger is
  owner-only.
- A v1 test account is shown as not yet enrolled and offered the v2 notice.
- The live Action document still lists only `/actions/lessons` (SHA-256
  `94a3635e…`).

## Rollback

- **Library only:** unset `ASKRIGOR_FINDINGS_LIBRARY` and recreate
  `research-mcp`. Saved cards stay in the private repository.
- **Image:**
  1. stop and disable the promotion timer;
  2. run the hold script (below) as the migrator;
  3. restore the preserved selector and `runtime.env` from
     `/opt/askrigor/rollbacks/pre-$M`;
  4. recreate only `research-mcp` with the prior image, as in step 10;
  5. check health and the security envelope;
  6. restore the timer's previous state.

  If #246's image serves again later, run the restore script.
- Migration 0011 stays: it only widens the allowed notice versions, which the
  earlier image tolerates, and main's `migrate` ignores the extra
  `schema_migrations` row. The pre-release dump is for a disaster, not for this
  rollback.
- Nothing deletes database rows, proposals, intents, receipts, sessions or
  site state.

### The notice v2 rollback step

Main's image parses a stored notice version as v1 exactly, so an account that
accepted v2 fails its access check there. The hold script copies each v2 row,
unchanged, into `research_use_notice_v2_hold` and marks the account revoked:
main reads that state, and the person can accept v1 again. The restore script
puts back each account still exactly in the held state and empties the table;
an account the person changed meanwhile keeps its newer row. Both are
idempotent. Only the table's owner, the migrator, can read it: the hold script
removes every other grant, including the reader role's default-privilege one.

In production the scripts go in on stdin, since the database container has a
read-only root filesystem and local logins use SCRAM (the form of the overlay's
healthcheck):

```bash
docker exec -i askrigor-living-evidence-postgres-1 sh -c 'PGPASSWORD="$(tr -d "\r\n" </run/secrets/living_evidence_migrator_password)" exec psql --no-psqlrc -h 127.0.0.1 -U askrigor_migrator -d askrigor_living_evidence -v schema=living_evidence -f -' \
  < /root/research-use-notice-v2-hold.sql
```

Acceptance (`npm run contributor-access:notice-v2-rollback-acceptance`, real
PostgreSQL 17.6, 2026-10-01), run in that same form:

- restore before any hold does nothing;
- hold, run twice, holds the two v2 accounts and leaves the v1, paid and
  revoked accounts and a referencing entitlement unchanged;
- neither the runtime role nor a reader with production's default privileges
  can read the hold table (a probe table shows the reader's default grant
  works);
- after one held account re-accepts v1 as main writes it, restore, run twice,
  puts the other back exactly and keeps the re-accepted one.

Two mutations fail it: dropping restore's held-state condition
(`NEWER_ROW_OVERWRITTEN`), and dropping hold's grant removal
(`HOLD_READABLE_BY_READER`).

## Gaps found while planning

- The base `/opt/askrigor/compose.yaml` is not in the repository, nor is the
  manual `research-mcp` recreate command for the two-file setup; step 10's
  command is derived. Step 4 records the base file's hash, and the release
  record should say how the image variable reached Compose.
- No script inspects the security envelope or scans the startup log; earlier
  releases recorded results only.
- The plugin reinstall is prose only; no Codex command is in the repository.
- `.env.example` lacks `ASKRIGOR_BUILD_COMMIT`, `ASKRIGOR_FINDINGS_LIBRARY`,
  `ASKRIGOR_FINDINGS_REPOSITORY` and `ASKRIGOR_GEMINI_BILLING`, and
  `docs/gemini-spark-setup.md` doesn't mention the billing flag.
- The infra README's "Failure and rollback" section doesn't mention the hold
  and restore scripts; this plan does.
- No release record covers the deploy that brought `/mcp/claude` live.
