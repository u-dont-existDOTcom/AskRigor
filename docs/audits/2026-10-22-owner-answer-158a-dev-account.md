# Owner answer 158a: the owner's account listed as a dev account (production setting, 22 October 2026)

The owner answered "158a" at about 14:39 UTC: add the account reference `65c4e892de17` (the owner's free account, the
one this Claude session's AskRigor connector uses) to the dev accounts now, with a restart of the research server and
the old settings kept for rollback. A dev account is asked for its plain answer before research, and its checked
answer ends with the note comparing the two (owner answer 140b). References are pseudonymous account keys, not
secrets (`devAccountKeysFromEnv` in `apps/research-mcp/src/config.ts`).

## Change (14:44 UTC)

The change ran from the owner's laptop as one script copied to the production host and started under `setsid`, with
its log on the host (`/root/askrigor-dev-account-20261022.log`). Before changing anything, the script checked that:

- `askrigor-research-mcp-1` ran `askrigor-research:71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b` and was healthy, as it
  had been since 00:18:26 UTC (the release record `2026-10-22-owner-answers-138-154-production-release.md`);
- Compose resolved `research-mcp` to that same image. The project is `askrigor`, in `/opt/askrigor`, with
  `compose.yaml` and `compose.living-evidence.yaml`, and the image comes from `living-evidence-image.env`. Otherwise
  the script would have stopped with nothing changed;
- `runtime.env` had no dev-account line.

What it changed:

- **Settings:** `runtime.env` went from 64 to 65 names with one added line, `ASKRIGOR_DEV_ACCOUNT_KEYS=65c4e892de17`.
  Its SHA-256 prefix went from `6771bc696eff7da0` (the release's) to `16d17dddac0c28da`. The file was appended in
  place, so its inode is unchanged.
- **Prior file:** kept as `/opt/askrigor/rollbacks/runtime.env.before-dev-account-20261022T144413Z`.
- **Restart:** only `research-mcp` was recreated (`up -d --no-deps --no-build --pull never --force-recreate`, stdin
  closed). It started at 14:44:14 UTC and was healthy by 14:44:21 UTC on the same image.
- **Container check:** its environment lists `65c4e892de17` as a dev account. The runtime envelope is unchanged:
  user `node`, read-only root, `CapDrop` `ALL`, `no-new-privileges`, 1 GiB, 256 PIDs. It wrote one log line, with no
  credential-like marker.
- **Compose warning:** Compose warned of an orphan container, `askrigor-caddy-1`, from an earlier configuration of
  the project. It was not touched.

## Acceptance (14:44 to 14:47 UTC)

- **Health:** public `/healthz` answered 200 at every 4-second probe from 14:44:39 UTC.
- **Version:** `/version` reported build `71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b`, HRP 20.6.29 and Universal 20.5.46.
- **`/mcp`:** an anonymous session listed 33 tools. The first tool's description names HRP 20.6.29, Universal 20.5.46
  and the build.
- **`/mcp/claude`:** it answered 401 to an unauthenticated POST. This session's signed-in Claude connector called
  `manage_research_access` (`inspect`) through it.
- **The dev account:** that inspect, for reference `65c4e892de17`, now returns `plainAnswer: {requested: true, note:
  true}`. The same call made just before the change returned no `plainAnswer`.

## Rollback

On the host:

1. Run `cat /opt/askrigor/rollbacks/runtime.env.before-dev-account-20261022T144413Z > /opt/askrigor/runtime.env`.
2. With `ASKRIGOR_RESEARCH_IMAGE` exported from `/opt/askrigor/living-evidence-image.env`, recreate `research-mcp`
   the same way:

   ```
   docker compose -p askrigor --project-directory /opt/askrigor -f compose.yaml -f compose.living-evidence.yaml up -d --no-deps --no-build --pull never --force-recreate research-mcp
   ```

3. Check `/healthz`, `/version`, and the 401 from `/mcp/claude`.

## Notes

- **Other accounts:** the owner's ChatGPT account and second Claude account need their own references. Each is shown
  by asking AskRigor "What is my AskRigor account reference?" in that app.
- **The next release:** it must carry this line forward. A release that rewrites `runtime.env` keeps
  `ASKRIGOR_DEV_ACCOUNT_KEYS`, and its record lists 65 names.
