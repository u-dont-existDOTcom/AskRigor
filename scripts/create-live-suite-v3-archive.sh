#!/usr/bin/env bash
set -Eeuo pipefail

if (( $# != 2 )); then
  printf 'Usage: create-live-suite-v3-archive.sh <commit> <archive.tar.gz>\n' >&2
  exit 64
fi

readonly commit="$1"
readonly archive_path="$2"

if ! git rev-parse --verify --quiet "${commit}^{commit}" >/dev/null; then
  printf 'Refused: commit is not a valid commit object.\n' >&2
  exit 65
fi

if [[ -e "$archive_path" ]]; then
  printf 'Refused: archive path already exists.\n' >&2
  exit 66
fi

git archive --format=tar "$commit" | gzip -n >"$archive_path"
archive_directory="$(dirname "$archive_path")"
archive_name="$(basename "$archive_path")"
(
  cd "$archive_directory"
  sha256sum "$archive_name" | tee "${archive_name}.sha256"
)
