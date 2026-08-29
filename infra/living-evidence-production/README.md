# Production living-evidence repository runbook

Status: reviewed release candidate; activate only from an exact merged AskRigor
image with the base /opt/askrigor/compose.yaml.

## Fixed topology

The repository runs on the existing AskRigor VPS as a distinct pinned
PostgreSQL 17.6 service. It joins only the internal
living_evidence_private network and publishes no host port. The research MCP
keeps its existing public/default network and additionally joins that private
network. The unrelated annas-postgres-1 service is never used.

Both host and local bootstrap connections use SCRAM password authentication.
Local peer authentication is intentionally excluded because the digest-pinned
image runs as operating-system user `postgres` while the bootstrap database
role is the distinct `askrigor_migrator`; peer authentication would reject the
official entrypoint before it could create the database or reader role.

Persistent database state is
/opt/askrigor/state/living-evidence-postgres, owned by UID/GID 70 and mode
0700. The database container runs as that non-root UID/GID with a read-only
root filesystem, all capabilities dropped, no-new-privileges, bounded CPU
and memory, and only its database bind plus two tmpfs paths writable.

Two independent random 32-byte hexadecimal passwords live only in:

- /opt/askrigor/secrets/living-evidence-migrator-password
- /opt/askrigor/secrets/living-evidence-reader-password

Both host files are root-owned, group 70, mode 0440 so the non-root PostgreSQL
process can read the Compose bind-mounted secrets without making them
world-readable. The ordinary research service
receives only the reader URL through the existing root-owned mode-0600
runtime.env. The one-shot admin profile receives only the migrator URL
through root-owned mode-0600 living-evidence-writer.env. Neither URL or
password may be printed, checked into Git, copied into a release receipt, or
placed in Compose.

## Reversible activation

1. Record the exact current research image ID/tag, healthy container ID, base
   Compose hash, public 21-tool inventory, protocol manifests, state-directory
   modes, and a rollback copy of the base Compose file.
2. Copy the exact reviewed overlay to
   /opt/askrigor/compose.living-evidence.yaml and the exact reviewed init
   script to /opt/askrigor/living-evidence/init-reader.sh. Record hashes and
   use root ownership/mode 0600 for the overlay and 0555 for the script.
3. Create the state directory as UID/GID 70 mode 0700; create the two secret
   files atomically under a root umask from independent openssl random-byte
   calls without printing either value, then set root:70 ownership and mode
   0440.
4. Create the writer environment and append the four reader configuration
   names to runtime.env with an in-memory, non-echoing editor. The exact
   non-secret settings are schema living_evidence, SSL mode disable on the
   Docker-internal network, and reuse switch true.
5. Render the combined base plus overlay configuration and verify the image,
   no PostgreSQL published port, internal network, mounts, security controls,
   and secret-file references. Start only living-evidence-postgres and wait
   for its health check.
6. Run the exact merged image's one-shot admin entry point with migrate.
   Verify migration identity and query the catalog as the migrator to prove
   askrigor_reader has CONNECT, schema USAGE, and SELECT on every table/view,
   has no INSERT/UPDATE/DELETE/TRUNCATE privileges, and defaults to read-only
   transactions.
7. Recreate only research-mcp with the combined Compose selection. Verify it
   remains non-root/read-only/capability-free, joins exactly its prior network
   plus the internal repository network, stays healthy, and does not emit
   connection strings or database errors.
8. Run a repository miss and normal fresh audit, then import one reviewed
   source-linked audit and run an exact hit plus one deliberately stale/mutated
   forced-fresh case. Record only identifiers, hashes, states, timings, image
   identities, and allowlisted reason codes.

Every later Compose command must use both the base and living-evidence overlay;
otherwise the database remains running but the research container loses its
private-network attachment after recreation.

## Curated import

The living-evidence admin import-study-audit command accepts one strict JSON
object on stdin containing the ephemeral exact document index, its already
validated audit receipt, audit timestamps, and a current freshness receipt. It
loads the canonical protocol manifests itself, reruns the existing validator,
rejects prohibited persistent keys, and contributes only the source-free
structured audit. Raw article blocks are never written to the repository or
emitted in the admin receipt.

Use the Compose admin profile and stream the object directly over stdin. Do not
create an import file on the VPS, log stdin, or keep a shell history entry that
contains source text or a database URL. A failed import emits only a bounded
error code. Automatic public-run write-through is not part of this release.

## Failure and rollback

- Reader timeout, database unavailability, corrupt record, stale freshness,
  unfinished impact propagation, or compatibility mismatch returns the normal
  fresh_study_audit_required boundary. It never blocks a new audit.
- Disable ASKRIGOR_LIVING_EVIDENCE_REUSE_ENABLED, restore the prior research
  image/base Compose selection, and recreate only research-mcp for immediate
  product rollback. Repository rows are retained.
- Stop the database only after the research service no longer selects the
  overlay. Do not delete its state, secrets, or logical exports as part of a
  code rollback.
- This first production phase adds no automatic off-host backup. Treat host
  loss as a declared durability limitation until a reviewed encrypted backup,
  restore, retention, and deletion design is activated.
