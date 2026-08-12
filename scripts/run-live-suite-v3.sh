#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly evidence_dir="${ASKRIGOR_LIVE_EVIDENCE_DIR:-/evidence}"
readonly required_environment=(
  NCBI_EMAIL
  CROSSREF_MAILTO
  YOUTUBE_API_KEY
  ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID
)

missing_environment=()
for name in "${required_environment[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing_environment+=("$name")
  fi
done

if (( ${#missing_environment[@]} > 0 )); then
  printf 'Live suite refused: required runtime configuration is absent (%s).\n' \
    "${missing_environment[*]}" >&2
  exit 64
fi

if [[ ! -d "$evidence_dir" || ! -w "$evidence_dir" ]]; then
  printf 'Live suite refused: evidence directory is not writable.\n' >&2
  exit 65
fi

shopt -s dotglob nullglob
existing_evidence=("$evidence_dir"/*)
if (( ${#existing_evidence[@]} > 0 )); then
  printf 'Live suite refused: evidence directory must be empty.\n' >&2
  exit 66
fi

readonly raw_log="$(mktemp /tmp/askrigor-live-suite-v3.XXXXXX)"
trap 'rm -f "$raw_log"' EXIT

set +e
npm run test:live >"$raw_log" 2>&1
readonly provider_status=$?
set -e

# Do not expose raw provider output until the server-side scan accepts it.
npx --no-install tsx scripts/scan-live-suite-log.mts --log "$raw_log"
install -m 0600 "$raw_log" "$evidence_dir/provider-test.log"
(
  cd "$evidence_dir"
  sha256sum provider-test.log >provider-test.log.sha256
)

# This tested parser removes ANSI escapes and fail-closes on exit, count, or skip gates.
npx --no-install tsx scripts/assert-live-suite-output.mts \
  --exit-status "$provider_status" \
  --log "$raw_log"

printf '%s\n' \
  'Live suite v6 accepted: provider exit 0; Test Files 1 passed (1); Tests 5 passed (5); zero skipped.' \
  >"$evidence_dir/status.txt"
