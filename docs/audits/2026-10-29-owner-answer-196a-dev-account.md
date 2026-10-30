# Owner answer 196a: the owner's email-and-password login listed as a dev account (production setting, 29 October 2026)

The owner answered "196a 197a" in the "AskRigor work" session, read at 17:15 UTC. Question 196, option A: one AskRigor
login everywhere, the owner's email-and-password login (account reference `73712fb19006`), in three steps:

1. the owner accepts the free notice on it once. Done: `manage_research_access` (`inspect`) through this session's
   Claude connector shows it active in free contributor mode under `free-contributor-v4-2026-10-25`, activated at
   13:32:20 UTC on 29 Oct;
2. that login is added to the dev accounts, a server setting, so regression runs can still switch card saving off
   (this record);
3. a dev account's cards publish as soon as they're saved while card saving is on, like everyone else's: a code
   change on [AskRigor#384](https://github.com/u-dont-existDOTcom/AskRigor/pull/384), released with it (owner answer
   197a).

Account references are pseudonymous account keys, not secrets (`devAccountKeysFromEnv` in
`apps/research-mcp/src/config.ts`).

## Change (17:20 UTC)

The change ran from the owner's laptop as one script copied to the production host
(`/home/joel/askrigor-releases/20261029-196a/dev-account-196a.sh`, run with `ssh -n`, its log on the host at
`/root/askrigor-dev-account-20261029.log`). Before changing anything, the script checked that:

- `askrigor-research-mcp-1` ran `askrigor-research:9e35397b70356d7e463f59ce21a183e8833e4397` and was healthy, as it
  had been since 12:30:29 UTC (the release record `2026-10-29-next-build-production-release.md`);
- the selector `living-evidence-image.env` names that same image;
- `runtime.env` had exactly one dev-account line, `ASKRIGOR_DEV_ACCOUNT_KEYS=65c4e892de17`;
- the promotion job was not running (`inactive`).

Otherwise the script would have stopped with nothing changed. What it changed:

- **Settings:** that one line of `runtime.env` became `ASKRIGOR_DEV_ACCOUNT_KEYS=65c4e892de17,73712fb19006`. The
  script installed the new file only after checking that exactly that line differed. The file still has 73 names.
  Its SHA-256 prefix went from `d6d0c4d9e88330e9` (the release's) to `f02756a6fef695e5`.
- **Prior file:** kept as `/opt/askrigor/rollbacks/runtime.env.before-dev-account-20261029T172027Z`.
- **Restart:** only `research-mcp` was recreated (`up -d --no-deps --no-build --pull never --force-recreate`, stdin
  closed). It started at 17:20:27 UTC on the same image and was healthy within seconds.
- **Container check:** its environment lists `65c4e892de17,73712fb19006` as dev accounts. The runtime envelope is
  unchanged:
  - user `node`;
  - read-only root;
  - `CapDrop` `ALL`;
  - `no-new-privileges`;
  - 1 GiB of memory;
  - 256 PIDs.

  It wrote one log line, with no credential-like marker.
- **Compose warning:** Compose warned of the orphan container `askrigor-caddy-1`, as on 22 Oct. It was not touched.

## Acceptance (17:21 UTC)

- **Health:** `/healthz` answered ok.
- **Version:** `/version` reported build `9e35397b70356d7e463f59ce21a183e8833e4397`, with HRP 20.6.31 and Universal
  20.5.46.
- **`/mcp/claude`:** it answered 401 to an unauthenticated POST.
- **The dev account:** this session's Claude connector, signed in as `73712fb19006`, called `manage_research_access`
  (`inspect`), which now returns `findingsSave: true`. Inspect shows that field only to an active dev account, so
  `set_findings_save` (dev accounts only) works for this login. The regression runner switches card saving off
  through it before a run.
- **Review:** unchanged. The review tools need both the `cases:review` scope in the sign-in token and the reviewer
  subject (`research-contribution-review-tool.ts`). The dev listing plays no part in either.

## Rollback

On the host:

1. Run `cat /opt/askrigor/rollbacks/runtime.env.before-dev-account-20261029T172027Z > /opt/askrigor/runtime.env`.
2. With `ASKRIGOR_RESEARCH_IMAGE` exported from `/opt/askrigor/living-evidence-image.env`, recreate `research-mcp`
   the same way:

   ```
   docker compose -p askrigor --project-directory /opt/askrigor -f compose.yaml -f compose.living-evidence.yaml up -d --no-deps --no-build --pull never --force-recreate research-mcp
   ```

3. Check `/healthz`, `/version`, and the 401 from `/mcp/claude`.

## Notes

- **The next release (#384):** it must carry this line forward. Its stage B changes only the build line, so it keeps
  `ASKRIGOR_DEV_ACCOUNT_KEYS=65c4e892de17,73712fb19006`, and its record lists 73 names.
- **The Google login (`65c4e892de17`):** it stays listed. Removing it would change nothing that 196a needs, and the
  owner may still sign in with it somewhere.
