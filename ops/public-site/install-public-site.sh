#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s <archive.tar.gz> <archive.sha256> <revision>\n' "${0##*/}" >&2
}

die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

[[ "$#" -eq 3 ]] || {
  usage
  exit 64
}
[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "installer must run as root"

input_archive=$1
input_checksum=$2
revision=$3

[[ "$revision" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] ||
  die "revision must be a safe nonempty release name"

active_root=/opt/askrigor/active
base_compose=/opt/askrigor/active/compose.yaml
https_compose=/opt/askrigor/active/compose.https.yaml
production_caddyfile=/opt/askrigor/active/Caddyfile
site_root=/opt/askrigor/site
releases_root=/opt/askrigor/site/releases
state_root=/opt/askrigor/site/state
current_link=/opt/askrigor/site/current
release_path="$releases_root/$revision"
staging_path="$releases_root/.${revision}.staging"

assert_root_owned_secure_path() {
  local path=$1
  local expected_kind=$2
  local owner mode

  [[ ! -L "$path" ]] || die "path must not be a symlink: $path"
  [[ -e "$path" ]] || die "required path is missing: $path"
  case "$expected_kind" in
    file) [[ -f "$path" ]] || die "path must be a regular file: $path" ;;
    directory) [[ -d "$path" ]] || die "path must be a directory: $path" ;;
    *) die "internal error: unknown path kind" ;;
  esac
  owner=$(stat -c '%u' -- "$path")
  [[ "$owner" == 0 ]] || die "path must be owned by root: $path"
  mode=$(stat -c '%a' -- "$path")
  (( (8#$mode & 0022) == 0 )) ||
    die "path must not be group/world writable: $path"
}

ensure_secure_directory() {
  local path=$1
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    install -d -o root -g root -m 0755 -- "$path"
  fi
  assert_root_owned_secure_path "$path" directory
}

assert_root_owned_secure_parent_chain() {
  local path=$1
  local parent cursor component
  parent=$(dirname -- "$path")
  cursor=/
  assert_root_owned_secure_path "$cursor" directory
  IFS='/' read -r -a parent_components <<<"${parent#/}"
  for component in "${parent_components[@]}"; do
    [[ -n "$component" ]] || continue
    cursor=${cursor%/}/$component
    assert_root_owned_secure_path "$cursor" directory
  done
}

command -v docker >/dev/null || die "docker is required"
docker compose version >/dev/null || die "Docker Compose v2 is required"
command -v curl >/dev/null || die "curl is required"
command -v tar >/dev/null || die "tar is required"
command -v realpath >/dev/null || die "realpath is required"

[[ ! -L "$input_archive" ]] || die "path must not be a symlink: $input_archive"
[[ ! -L "$input_checksum" ]] || die "path must not be a symlink: $input_checksum"
input_archive=$(realpath -e -- "$input_archive")
input_checksum=$(realpath -e -- "$input_checksum")

assert_root_owned_secure_path /opt directory
assert_root_owned_secure_path /opt/askrigor directory
assert_root_owned_secure_path "$active_root" directory
assert_root_owned_secure_path "$base_compose" file
assert_root_owned_secure_path "$https_compose" file
assert_root_owned_secure_path "$production_caddyfile" file
assert_root_owned_secure_parent_chain "$input_archive"
assert_root_owned_secure_parent_chain "$input_checksum"
assert_root_owned_secure_path "$input_archive" file
assert_root_owned_secure_path "$input_checksum" file

ensure_secure_directory "$site_root"
ensure_secure_directory "$releases_root"
ensure_secure_directory "$state_root"

[[ ! -e "$release_path" && ! -L "$release_path" ]] ||
  die "release already exists: $release_path"
[[ ! -e "$staging_path" && ! -L "$staging_path" ]] ||
  die "staging path already exists: $staging_path"

archive_basename=${input_archive##*/}
checksum_basename=${input_checksum##*/}
[[ "$archive_basename" =~ ^[A-Za-z0-9._-]+$ ]] || die "archive basename is unsafe"
[[ "$checksum_basename" =~ ^[A-Za-z0-9._-]+$ ]] || die "checksum basename is unsafe"
[[ "$archive_basename" != "$checksum_basename" ]] || die "archive and checksum names must differ"

install -d -o root -g root -m 0700 -- "$staging_path"
staged_archive="$staging_path/$archive_basename"
staged_checksum="$staging_path/$checksum_basename"
members_file="$staging_path/archive.members"
verbose_file="$staging_path/archive.verbose"
install -o root -g root -m 0400 -- "$input_archive" "$staged_archive"
install -o root -g root -m 0400 -- "$input_checksum" "$staged_checksum"
assert_root_owned_secure_path "$staged_archive" file
assert_root_owned_secure_path "$staged_checksum" file

preserve_early_failure() {
  local status=$?
  trap - ERR
  printf 'preserved failed release artifacts:\n  staging: %s\n  release: %s\n' \
    "$staging_path" "$release_path" >&2
  exit "$status"
}
trap preserve_early_failure ERR

line_count=$(wc -l <"$staged_checksum")
[[ "$line_count" -eq 1 ]] || die "checksum sidecar must contain exactly one line"
IFS=' ' read -r expected_hash expected_name unexpected_field <"$staged_checksum"
[[ "$expected_hash" =~ ^[0-9A-Fa-f]{64}$ ]] || die "checksum sidecar has an invalid SHA-256"
[[ "$expected_name" == "$archive_basename" && -z "${unexpected_field:-}" ]] ||
  die "checksum sidecar must name only the archive basename"
(
  cd -- "$staging_path"
  sha256sum --check --strict --status -- "$checksum_basename"
)

tar -tzf "$staged_archive" >"$members_file"
tar -tvzf "$staged_archive" >"$verbose_file"
chmod 0400 -- "$members_file" "$verbose_file"

while IFS= read -r listing; do
  case ${listing:0:1} in
    -|d) ;;
    l|h) die "archive contains a symlink or hard link" ;;
    *) die "archive contains a non-file member" ;;
  esac
done <"$verbose_file"

forbidden_app_manifest=".app"".json"
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
      die "archive contains forbidden metadata: $member"
      ;;
  esac
  member_basename=${member%/}
  member_basename=${member_basename##*/}
  case "${member_basename,,}" in
    *.pem|*.key|id_rsa|id_dsa|id_ecdsa|id_ed25519|*private-key*|*private_key*)
      die "archive contains a private-key-like filename: $member"
      ;;
  esac
done <"$members_file"

for required_member in \
  site/index.html \
  site/privacy/index.html \
  site/terms/index.html \
  site/support/index.html \
  site/assets/site.css \
  ops/public-site/Caddyfile.site \
  ops/public-site/compose.site.yaml \
  ops/public-site/install-public-site.sh
do
  grep -Fxq -- "$required_member" "$members_file" ||
    die "archive is missing required member: $required_member"
done

install -d -o root -g root -m 0755 -- "$release_path"
tar -xzf "$staged_archive" --no-same-owner --no-same-permissions -C "$release_path"
chown -R root:root -- "$release_path"
find "$release_path" -type d -exec chmod 0555 {} +
find "$release_path" -type f -exec chmod 0444 {} +
chmod 0755 -- "$release_path"
assert_root_owned_secure_path "$release_path" directory
assert_root_owned_secure_path "$release_path/site" directory
assert_root_owned_secure_path "$release_path/ops/public-site/Caddyfile.site" file
assert_root_owned_secure_path "$release_path/ops/public-site/compose.site.yaml" file

packet_caddyfile="$release_path/ops/public-site/Caddyfile.site"
packet_overlay="$release_path/ops/public-site/compose.site.yaml"
staged_combined_caddyfile="$staging_path/Caddyfile.combined"
cp --reflink=never -- "$production_caddyfile" "$staged_combined_caddyfile"
printf '\n' >>"$staged_combined_caddyfile"
cat -- "$packet_caddyfile" >>"$staged_combined_caddyfile"
chown root:root -- "$staged_combined_caddyfile"
chmod 0400 -- "$staged_combined_caddyfile"

base_compose_command=(
  docker compose
  -f /opt/askrigor/active/compose.yaml
  -f /opt/askrigor/active/compose.https.yaml
)
candidate_compose_command=(
  docker compose
  -f /opt/askrigor/active/compose.yaml
  -f /opt/askrigor/active/compose.https.yaml
  -f "$packet_overlay"
)

# A service-config hash compares the complete rendered service, including the
# research-mcp image, mounts, environment-file references, networks, security
# options, and port binding, while preventing rendered values from being logged.
base_research_mcp_hash=$("${base_compose_command[@]}" config --no-env-resolution --no-interpolate --hash research-mcp)
candidate_research_mcp_hash=$("${candidate_compose_command[@]}" config --no-env-resolution --no-interpolate --hash research-mcp)
[[ -n "$base_research_mcp_hash" && "$candidate_research_mcp_hash" == "$base_research_mcp_hash" ]] ||
  die "three-file Compose render changes research-mcp"

caddy_image_count=$("${base_compose_command[@]}" config --no-env-resolution --no-interpolate --images |
  grep -Ec '(^|/)caddy(:[^@[:space:]]+)?@sha256:[0-9a-fA-F]{64}$' || true)
[[ "$caddy_image_count" -eq 1 ]] || die "production Caddy image must be pinned by SHA-256 digest"

# The run-time volume overrides validate the staged inputs without changing the
# current link or active state files. The image still comes from the production
# three-file Compose model.
"${candidate_compose_command[@]}" run --rm --no-deps \
  -v "$release_path/site:/srv/askrigor-site:ro" \
  -v "$staged_combined_caddyfile:/tmp/Caddyfile:ro" \
  --entrypoint caddy caddy \
  validate --config /tmp/Caddyfile --adapter caddyfile

curl --fail --silent --show-error --output /dev/null \
  --proto '=https' --tlsv1.2 --max-time 15 https://askrigor.com/ ||
  die "apex HTTPS prerequisite failed: askrigor.com must already complete HTTPS"

previous_current_target=
if [[ -L "$current_link" ]]; then
  previous_current_target=$(readlink -- "$current_link")
  [[ "$previous_current_target" == "$releases_root/"*/site ]] ||
    die "current link has an unexpected target: $previous_current_target"
  assert_root_owned_secure_path "$previous_current_target" directory
elif [[ -e "$current_link" ]]; then
  die "current path must be a symlink when it exists: $current_link"
fi

previous_caddyfile_present=0
previous_overlay_present=0
previous_caddyfile_backup="$staging_path/Caddyfile.previous"
previous_overlay_backup="$staging_path/compose.site.previous.yaml"
if [[ -e "$state_root/Caddyfile" || -L "$state_root/Caddyfile" ]]; then
  assert_root_owned_secure_path "$state_root/Caddyfile" file
  install -o root -g root -m 0400 -- "$state_root/Caddyfile" "$previous_caddyfile_backup"
  previous_caddyfile_present=1
fi
if [[ -e "$state_root/compose.site.yaml" || -L "$state_root/compose.site.yaml" ]]; then
  assert_root_owned_secure_path "$state_root/compose.site.yaml" file
  install -o root -g root -m 0400 -- "$state_root/compose.site.yaml" "$previous_overlay_backup"
  previous_overlay_present=1
fi

next_caddyfile="$state_root/.Caddyfile.${revision}.new"
next_overlay="$state_root/.compose.site.${revision}.new.yaml"
next_current_link="$site_root/.current.${revision}.new"
[[ ! -e "$next_caddyfile" && ! -L "$next_caddyfile" ]] || die "staged state Caddyfile already exists"
[[ ! -e "$next_overlay" && ! -L "$next_overlay" ]] || die "staged Compose overlay already exists"
[[ ! -e "$next_current_link" && ! -L "$next_current_link" ]] || die "staged current link already exists"
install -o root -g root -m 0400 -- "$staged_combined_caddyfile" "$next_caddyfile"
install -o root -g root -m 0400 -- "$packet_overlay" "$next_overlay"

probe_http_200() {
  local url=$1
  local attempt status
  for attempt in {1..20}; do
    status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 -- "$url" || true)
    [[ "$status" == 200 ]] && return 0
    sleep 1
  done
  return 1
}

verify_mcp_health() {
  probe_http_200 http://127.0.0.1:3000/healthz ||
    die "loopback MCP health check failed"
  probe_http_200 https://mcp.askrigor.com/healthz ||
    die "public MCP health check failed"
}

verify_public_routes() {
  local route
  for route in \
    https://askrigor.com/ \
    https://askrigor.com/privacy \
    https://askrigor.com/terms \
    https://askrigor.com/support
  do
    probe_http_200 "$route" || die "public route did not return 200: $route"
  done
}

restore_previous_state() {
  local restore_path
  if [[ "$previous_caddyfile_present" -eq 1 ]]; then
    restore_path="$state_root/.Caddyfile.rollback"
    install -o root -g root -m 0400 -- "$previous_caddyfile_backup" "$restore_path" &&
      mv -Tf -- "$restore_path" "$state_root/Caddyfile"
  else
    rm -f -- "$state_root/Caddyfile"
  fi
  if [[ "$previous_overlay_present" -eq 1 ]]; then
    restore_path="$state_root/.compose.site.rollback.yaml"
    install -o root -g root -m 0400 -- "$previous_overlay_backup" "$restore_path" &&
      mv -Tf -- "$restore_path" "$state_root/compose.site.yaml"
  else
    rm -f -- "$state_root/compose.site.yaml"
  fi
  if [[ -n "$previous_current_target" ]]; then
    rm -f -- "$next_current_link"
    ln -s -- "$previous_current_target" "$next_current_link" &&
      mv -Tf -- "$next_current_link" "$current_link"
  else
    rm -f -- "$current_link" "$next_current_link"
  fi
}

recreate_previous_caddy_only() {
  if [[ "$previous_overlay_present" -eq 1 ]]; then
    docker compose \
      -f /opt/askrigor/active/compose.yaml \
      -f /opt/askrigor/active/compose.https.yaml \
      -f /opt/askrigor/site/state/compose.site.yaml \
      up -d --no-deps --force-recreate caddy
  else
    docker compose \
      -f /opt/askrigor/active/compose.yaml \
      -f /opt/askrigor/active/compose.https.yaml \
      up -d --no-deps --force-recreate caddy
  fi
}

rollback_armed=0
rollback() {
  local status=$?
  trap - ERR
  set +e
  if [[ "$rollback_armed" -eq 1 ]]; then
    printf 'Deployment failed; restoring the prior public-site state.\n' >&2
    restore_previous_state
    recreate_previous_caddy_only
    if ! probe_http_200 http://127.0.0.1:3000/healthz ||
       ! probe_http_200 https://mcp.askrigor.com/healthz; then
      printf 'Warning: MCP health did not recover during rollback verification.\n' >&2
    fi
  fi
  printf 'preserved failed release artifacts:\n  staging: %s\n  release: %s\n' \
    "$staging_path" "$release_path" >&2
  exit "$status"
}

# Arm rollback before the first atomic change to current or active state.
rollback_armed=1
trap rollback ERR

mv -Tf -- "$next_caddyfile" "$state_root/Caddyfile"
mv -Tf -- "$next_overlay" "$state_root/compose.site.yaml"
ln -s -- "$release_path/site" "$next_current_link"
mv -Tf -- "$next_current_link" "$current_link"

docker compose \
  -f /opt/askrigor/active/compose.yaml \
  -f /opt/askrigor/active/compose.https.yaml \
  -f /opt/askrigor/site/state/compose.site.yaml \
  up -d --no-deps --force-recreate caddy

verify_mcp_health
verify_public_routes

rollback_armed=0
trap - ERR
rm -rf -- "$staging_path"
printf 'Activated public-site release %s at %s\n' "$revision" "$release_path"
