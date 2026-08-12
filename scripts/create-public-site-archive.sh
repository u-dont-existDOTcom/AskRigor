#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s <git-commit> <output.tar.gz>\n' "${0##*/}" >&2
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

validate_archive_membership() {
  local archive=$1
  local members_file=$2
  local verbose_file=$3
  local listing member member_basename
  local forbidden_app_manifest=".app"".json"

  tar -tzf "$archive" >"$members_file"
  tar -tvzf "$archive" >"$verbose_file"
  while IFS= read -r listing; do
    case ${listing:0:1} in
      -|d) ;;
      l|h) die "git archive contains a symlink or hard link" ;;
      *) die "git archive contains a non-file archive member" ;;
    esac
  done <"$verbose_file"

  while IFS= read -r member; do
    [[ -n "$member" ]] || die "archive contains an empty member name"
    [[ "$member" =~ ^[A-Za-z0-9._/-]+$ ]] ||
      die "archive contains a member with an unsafe name: $member"
    case "$member" in
      /*|../*|*/../*|*/..) die "archive contains an unsafe path: $member" ;;
    esac
    case "$member" in
      site|site/*|ops|ops/|ops/public-site|ops/public-site/*) ;;
      *) die "archive member is outside the allowed roots: $member" ;;
    esac
    case "/$member" in
      */.env|*/.env.*|*/"$forbidden_app_manifest"|*/.git|*/.git/*)
        die "archive contains a forbidden metadata member: $member"
        ;;
    esac
    member_basename=${member%/}
    member_basename=${member_basename##*/}
    case "${member_basename,,}" in
      *.pem|*.key|id_rsa|id_dsa|id_ecdsa|id_ed25519|*private-key*|*private_key*)
        die "private-key-like archive member: $member"
        ;;
    esac
  done <"$members_file"
}

publish_no_clobber() {
  local source=$1
  local destination=$2
  if ! ln -T -- "$source" "$destination"; then
    printf 'Error: destination appeared during publication: %s\n' "$destination" >&2
    return 1
  fi
  rm -f -- "$source"
}

validate_required_public_site_members() {
  local members_file=$1
  local required_member
  for required_member in \
    ops/public-site/bootstrap-apex-tls.sh \
    ops/public-site/install-public-site.sh
  do
    grep -Fxq -- "$required_member" "$members_file" ||
      die "archive is missing required member: $required_member"
  done
}

main() {
  [[ "$#" -eq 2 ]] || {
    usage
    exit 64
  }

  local commit=$1
  local requested_output=$2
  local output_directory output_basename output sidecar
  local temporary_directory temporary_archive temporary_sidecar
  local members_file verbose_file validation_directory
  local published_archive=0 published_archive_inode=
  local published_sidecar=0 published_sidecar_inode=

  git rev-parse --verify "${commit}^{commit}" >/dev/null 2>&1 ||
    die "revision is not a Git commit: $commit"

  output_directory=$(dirname -- "$requested_output")
  output_basename=$(basename -- "$requested_output")
  [[ "$output_basename" != "." && "$output_basename" != ".." ]] ||
    die "output must name a new archive"
  [[ -d "$output_directory" ]] || die "output directory does not exist: $output_directory"
  output_directory=$(cd -- "$output_directory" && pwd -P)
  output="$output_directory/$output_basename"
  sidecar="$output.sha256"

  [[ ! -e "$output" && ! -L "$output" ]] || die "archive already exists: $output"
  [[ ! -e "$sidecar" && ! -L "$sidecar" ]] || die "checksum sidecar already exists: $sidecar"

  # Validate the reviewed working-tree document root immediately before packaging.
  npm run test:site

  temporary_directory=$(mktemp -d "$output_directory/.public-site-archive.XXXXXXXX")
  temporary_archive="$temporary_directory/$output_basename"
  temporary_sidecar="$temporary_directory/$output_basename.sha256"
  members_file="$temporary_directory/members"
  verbose_file="$temporary_directory/verbose"
  validation_directory="$temporary_directory/validation"

  cleanup() {
    local status=$?
    local current_inode=
    if [[ "$status" -ne 0 && "$published_archive" -eq 1 ]]; then
      current_inode=$(stat -c '%d:%i' -- "$output" 2>/dev/null || true)
      if [[ "$current_inode" == "$published_archive_inode" ]]; then
        rm -f -- "$output"
      fi
    fi
    if [[ "$status" -ne 0 && "$published_sidecar" -eq 1 ]]; then
      current_inode=$(stat -c '%d:%i' -- "$sidecar" 2>/dev/null || true)
      if [[ "$current_inode" == "$published_sidecar_inode" ]]; then
        rm -f -- "$sidecar"
      fi
    fi
    rm -rf -- "$temporary_directory"
    exit "$status"
  }
  trap cleanup EXIT

  git archive --format=tar "$commit" site ops/public-site | gzip -n >"$temporary_archive"
  validate_archive_membership "$temporary_archive" "$members_file" "$verbose_file"
  validate_required_public_site_members "$members_file"

  mkdir -- "$validation_directory"
  tar -xzf "$temporary_archive" --no-same-owner --no-same-permissions \
    -C "$validation_directory" site
  node --import tsx --input-type=module -e '
  import { resolve } from "node:path";
  import { pathToFileURL } from "node:url";
  import { validatePublicSite } from "./scripts/validate-public-site.mts";
  const root = pathToFileURL(`${resolve(process.argv[1])}/`);
  const result = await validatePublicSite(root);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
    }
  ' "$validation_directory/site"

  (
    cd -- "$temporary_directory"
    sha256sum -- "$output_basename" >"$output_basename.sha256"
  )
  published_archive_inode=$(stat -c '%d:%i' -- "$temporary_archive")
  publish_no_clobber "$temporary_archive" "$output"
  published_archive=1
  published_sidecar_inode=$(stat -c '%d:%i' -- "$temporary_sidecar")
  publish_no_clobber "$temporary_sidecar" "$sidecar"
  published_sidecar=1

  rm -rf -- "$temporary_directory"
  trap - EXIT
  printf 'Created %s\nCreated %s\n' "$output" "$sidecar"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
