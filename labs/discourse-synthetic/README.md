# Isolated synthetic Discourse integration laboratory

This directory defines a local-only runtime shell for the Community Health
Forum bridge. It is not a deployment configuration.

The manifest pins:

- upstream Discourse source commit
  `768a4ed1cd8e6742fe1c1340a9c4ab01318285ec`;
- the `linux/amd64` manifest for Discourse's development image at
  `sha256:d8dc0097c0911ebbf1e4844e7db0426ebeae9469637d45fcabc7cd10c516940f`;
- a loopback-only HTTP binding and disabled outbound email;
- synthetic-only, disposable data;
- no public DNS, public indexing, real health data, recruitment, or regulatory
  automation.

The upstream source identity and image were resolved from Discourse's current
official repository and `.devcontainer/devcontainer.json`. The Compose file is
an AskRigor isolation wrapper around that pinned development image; it is not a
fork of Discourse.

## Validation-only path

Run:

```bash
npm run community-forum:lab-validate
```

This validates the machine manifest and resolved Compose configuration without
starting a container or writing forum data.

## Runtime acceptance path

The runtime path is intentionally explicit and local. Prepare a disposable
checkout of the exact manifest commit outside this repository, set
`ASKRIGOR_DISCOURSE_SOURCE_DIR` to that absolute path, and run the bounded
acceptance script. Never point it at a real forum checkout or reuse a
production data volume.

```bash
git clone https://github.com/discourse/discourse.git /tmp/askrigor-discourse-synthetic
git -C /tmp/askrigor-discourse-synthetic checkout 768a4ed1cd8e6742fe1c1340a9c4ab01318285ec
export ASKRIGOR_DISCOURSE_SOURCE_DIR=/tmp/askrigor-discourse-synthetic
npm run community-forum:runtime-acceptance
```

The script verifies the exact source commit and image reference, starts only an
owned Compose project, installs the pinned upstream dependencies, migrates the
disposable database, and seeds four `.invalid` users plus three explicitly
synthetic topics. It then checks the public, member-only, and private permission
fixtures, loopback-only binding, disabled outbound email, deny-all `robots.txt`, and the `noindex,
nofollow` response header. It emits a machine-readable receipt and always
removes its owned container and volume on exit.

The integration tests separately exercise DiscourseConnect signing and account
linking, webhook signing, ordering/idempotency/deletion, PostgreSQL persistence,
and the two-object synthetic public projection.

For manual diagnostics only, use an explicit owned project name. To discard its
owned lab volume:

```bash
docker compose --project-name askrigor_synthetic_discourse_diagnostic \
  --file labs/discourse-synthetic/compose.yaml down --volumes
```

That command is destructive only to the Compose project-owned disposable lab
volume. Verify the project name before running it.
