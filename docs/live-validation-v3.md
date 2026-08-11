# AskRigor v3 credential-safe live-validation packet

This packet is prepared for the ANSI-safe live-suite work introduced at
`9eeaed6e807875ab4819b1d64ff8af173f9a0553`. It must be archived from the
follow-up gate-hardening commit that requires exactly one complete test-file
summary as well as exactly five complete tests; that commit is printed by the
packaging command. This packet is not live-test evidence and does not alter the
public-submission blocker in `docs/release-evidence-v0.1.0.md`.

## Included controls

- `scripts/run-live-suite-v3.sh` refuses missing required runtime configuration
  before it can invoke `npm`; runs only `npm run test:live`; retains the
  provider process status; and delegates all result acceptance to the tested
  `scripts/assert-live-suite-output.mts` parser. It has no `grep` result gate.
- `scripts/scan-live-suite-log.mts` scans output against all runtime provider
  configuration values without echoing any value. Raw provider output is copied
  into the evidence directory only after this fail-closed server-side scan.
- `Dockerfile.live-validation` installs the pinned project dependency graph in
  a build containing only tracked `git archive` content. The container runs as
  `node`; the host command additionally makes its root filesystem read-only,
  uses a bounded temporary filesystem, drops capabilities, denies privilege
  escalation, and limits processes, memory, and CPU.
- The runner accepts only provider process exit 0, exactly `Test Files 1 passed
  (1)`, exactly `Tests 5 passed (5)`, and no additional test/test-file summary.
  The five live cases remain PubMed, Europe PMC, ClinicalTrials.gov, Crossref,
  and YouTube. It records no output before its security scan.

## Separate security review

This review is a source-only review separate from provider execution. It must
be repeated against the hashes below before the remote run:

1. Confirm the archive is made with `git archive` from the recorded commit, so
   ignored `.env`/`.app.json` files, the repository `.git` directory, and local
   untracked files cannot enter the Docker context.
2. Confirm the remote stage path is new, owned `root:root`, and mode `0700`.
   The only container-writable location is its empty `evidence` child owned by
   UID/GID 1000 and mode `0700`.
3. Confirm the server-side env file remains outside the stage, is `root:root`
   mode `0600`, is passed only with Docker `--env-file`, and is never printed,
   copied, uploaded, hashed as content, or included in an evidence archive.
4. Confirm `run-live-suite-v3.sh` runs the security scan before `install` copies
   `provider-test.log`; a scan failure exits without publishing that log. The
   scanner error is generic and never includes a matched value.
5. Confirm the runner calls the tested TypeScript parser and does not introduce
   a separate `grep`/substring success test. It fail-closes for a nonzero test
   process, additional test files, skipped tests, or count changes.
6. Inspect only post-scan evidence (`provider-test.log`, its SHA-256, and
   `status.txt`). Do not inspect raw temporary files or container environment.

## Exact preparation, upload, and run commands

Run locally from a clean checkout. `ASKRIGOR_VPS` is the preconfigured SSH
destination (for example, a root-authorized alias); it is deliberately not
stored in this repository. These commands do not read or print the remote
runtime environment.

```bash
set -Eeuo pipefail
cd /path/to/askrigor-plugin-v0
git status --porcelain
source_commit="$(git rev-parse HEAD)"
source_short="$(git rev-parse --short=12 HEAD)"
archive="/tmp/askrigor-live-suite-v3-${source_short}.tar.gz"
./scripts/create-live-suite-v3-archive.sh "$source_commit" "$archive"
sha256sum Dockerfile.live-validation scripts/run-live-suite-v3.sh \
  scripts/assert-live-suite-output.mts scripts/scan-live-suite-log.mts
```

Set the new remote stage path exactly as follows (do not reuse the v2 path):

```bash
readonly remote_stage="/root/askrigor-validation-stage/live-suite-v3-${source_short}"
ssh "$ASKRIGOR_VPS" "install -d -o root -g root -m 0700 '$remote_stage'"
ssh "$ASKRIGOR_VPS" "install -d -o 1000 -g 1000 -m 0700 '$remote_stage/evidence'"
scp "$archive" "${archive}.sha256" "$ASKRIGOR_VPS:${remote_stage}/"
```

On the remote host, prepare and run the isolated image. The root-owned runtime
env file must already exist at `/root/askrigor/live-validation.env`, mode 0600;
it contains `ASKRIGOR_LIVE_TESTS=1` plus required provider configuration and is
not displayed by this procedure.

```bash
set -Eeuo pipefail
cd "$remote_stage"
sha256sum -c "$(basename "$archive").sha256"
mkdir source
tar -xzf "$(basename "$archive")" -C source
docker build --pull=false --file source/Dockerfile.live-validation \
  --tag "askrigor-live-suite-v3:${source_short}" source
docker run --rm \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  --pids-limit=128 \
  --memory=1g \
  --cpus=1 \
  --user=1000:1000 \
  --env-file /root/askrigor/live-validation.env \
  --env ASKRIGOR_LIVE_EVIDENCE_DIR=/evidence \
  --mount "type=bind,src=${remote_stage}/evidence,dst=/evidence,rw" \
  "askrigor-live-suite-v3:${source_short}"
sha256sum evidence/provider-test.log
cat evidence/status.txt
```

The container exits 0 only after the server-side scan and all five test/status
gates pass. A nonzero exit is fail-closed; do not classify a provider result as
green until the post-scan evidence and `status.txt` exist.
