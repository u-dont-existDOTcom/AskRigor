#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s <archive.tar.gz> <archive.sha256> <revision>\n' "${0##*/}" >&2
}

die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

assert_owned_secure_path() {
  local path=$1
  local expected_kind=$2
  local expected_owner=$3
  local owner mode

  [[ ! -L "$path" ]] || die "path must not be a symlink: $path"
  [[ -e "$path" ]] || die "required path is missing: $path"
  case "$expected_kind" in
    file) [[ -f "$path" ]] || die "path must be a regular file: $path" ;;
    directory) [[ -d "$path" ]] || die "path must be a directory: $path" ;;
    *) die "internal error: unknown path kind" ;;
  esac
  owner=$(stat -c '%u' -- "$path")
  [[ "$owner" == "$expected_owner" ]] || die "path must be owned by root: $path"
  mode=$(stat -c '%a' -- "$path")
  (( (8#$mode & 0022) == 0 )) ||
    die "path must not be group/world writable: $path"
}

assert_root_owned_secure_path() {
  assert_owned_secure_path "$1" "$2" 0
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

normalize_lexical_absolute_path() {
  local input=$1
  local component last_index
  local -a input_components normalized_components=()
  [[ "$input" == /* ]] || die "internal error: path must be absolute"
  IFS='/' read -r -a input_components <<<"${input#/}"
  for component in "${input_components[@]}"; do
    case "$component" in
      ""|.) ;;
      ..)
        ((${#normalized_components[@]} > 0)) || die "path escapes the filesystem root"
        last_index=$((${#normalized_components[@]} - 1))
        unset "normalized_components[$last_index]"
        ;;
      *) normalized_components+=("$component") ;;
    esac
  done
  local IFS=/
  normalized_path="/${normalized_components[*]}"
}

resolve_https_release() {
  local selection_link=$1
  local https_releases_root=$2
  local expected_owner=${3:-0}
  local selection_owner canonical_releases_root raw_target lexical_target
  local relative_target cursor component

  [[ -L "$selection_link" ]] || die "HTTPS release selector must be a symlink: $selection_link"
  selection_owner=$(stat -c '%u' -- "$selection_link")
  [[ "$selection_owner" == "$expected_owner" ]] ||
    die "HTTPS release selector must be owned by root: $selection_link"

  assert_owned_secure_path "$https_releases_root" directory "$expected_owner"
  canonical_releases_root=$(realpath -e -- "$https_releases_root") ||
    die "HTTPS releases root is missing or unreadable: $https_releases_root"
  normalize_lexical_absolute_path "$https_releases_root"
  [[ "$canonical_releases_root" == "$normalized_path" ]] ||
    die "HTTPS releases root path must not traverse a symlink"

  raw_target=$(readlink -- "$selection_link") || die "HTTPS release selector is unreadable"
  if [[ "$raw_target" == /* ]]; then
    normalize_lexical_absolute_path "$raw_target"
  else
    normalize_lexical_absolute_path "$(dirname -- "$selection_link")/$raw_target"
  fi
  lexical_target=$normalized_path
  case "$lexical_target" in
    "$canonical_releases_root"/*) ;;
    *) die "HTTPS release selector must resolve below the HTTPS releases root: $selection_link" ;;
  esac

  relative_target=${lexical_target#"$canonical_releases_root"/}
  cursor=$canonical_releases_root
  IFS='/' read -r -a target_components <<<"$relative_target"
  for component in "${target_components[@]}"; do
    [[ -n "$component" ]] || continue
    cursor=$cursor/$component
    assert_owned_secure_path "$cursor" directory "$expected_owner"
  done

  resolved_https_release=$(realpath -e -- "$selection_link") ||
    die "HTTPS release selector target is missing or unreadable: $selection_link"
  [[ "$resolved_https_release" == "$lexical_target" ]] ||
    die "HTTPS release selector target path must not traverse a symlink"
  assert_owned_secure_path "$resolved_https_release/compose.https.yaml" file "$expected_owner"
  assert_owned_secure_path "$resolved_https_release/Caddyfile" file "$expected_owner"
  resolved_https_compose=$resolved_https_release/compose.https.yaml
  resolved_production_caddyfile=$resolved_https_release/Caddyfile
}

extract_public_caddy_environment() {
  local container_id=$1
  local environment_output line key value
  local hostname_count=0 direct_count=0
  environment_output=$(docker inspect --format '{{range .Config.Env}}{{if or (eq (index (split . "=") 0) "ASKRIGOR_HOSTNAME") (eq (index (split . "=") 0) "ASKRIGOR_DIRECT_DNS_ONLY")}}{{println .}}{{end}}{{end}}' "$container_id") ||
    die "cannot inspect the running Caddy public environment"

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    key=${line%%=*}
    value=${line#*=}
    case "$key" in
      ASKRIGOR_HOSTNAME)
        ((hostname_count += 1))
        [[ "$hostname_count" -eq 1 ]] || die "duplicate public Caddy variable: $key"
        caddy_hostname=$value
        ;;
      ASKRIGOR_DIRECT_DNS_ONLY)
        ((direct_count += 1))
        [[ "$direct_count" -eq 1 ]] || die "duplicate public Caddy variable: $key"
        caddy_direct_dns_only=$value
        ;;
      *) die "unexpected public Caddy variable name" ;;
    esac
  done <<<"$environment_output"

  [[ "$hostname_count" -eq 1 && "$direct_count" -eq 1 ]] ||
    die "public Caddy environment is incomplete"
  [[ "$caddy_hostname" == mcp.askrigor.com ]] || die "malformed ASKRIGOR_HOSTNAME"
  [[ "$caddy_direct_dns_only" =~ ^[A-Za-z0-9._,:/=-]{1,255}$ ]] ||
    die "malformed ASKRIGOR_DIRECT_DNS_ONLY"
  [[ "$caddy_direct_dns_only" == true ]] ||
    die "unexpected ASKRIGOR_DIRECT_DNS_ONLY"
}

discover_live_caddy_container() {
  local expected_config_files=$1
  local candidates_output
  local -a candidates=()
  candidates_output=$(docker ps -q \
    --filter label=com.docker.compose.service=caddy \
    --filter "label=com.docker.compose.project.config_files=$expected_config_files") ||
    die "cannot identify the running Caddy container"
  mapfile -t candidates <<<"$candidates_output"
  [[ "${#candidates[@]}" -eq 1 && -n "${candidates[0]}" ]] ||
    die "expected exactly one running Caddy container for the validated Compose files"
  live_caddy_container_id=${candidates[0]}
}

select_live_compose_config_files() {
  local selected_base_compose=$1
  local selected_https_compose=$2
  local selected_site_overlay=$3

  live_compose_config_files="$selected_base_compose,$selected_https_compose"
  if [[ -e "$selected_site_overlay" || -L "$selected_site_overlay" ]]; then
    assert_root_owned_secure_parent_chain "$selected_site_overlay"
    assert_root_owned_secure_path "$selected_site_overlay" file
    live_compose_config_files+=",$selected_site_overlay"
  fi
}

run_compose_command() {
  "${compose_environment[@]}" "$@"
}

write_validation_overlay() {
  local output=$1
  local staged_caddyfile=$2
  local staged_site=$3
  umask 077
  command cat >"$output" <<EOF
services:
  caddy:
    volumes:
      - type: bind
        source: $staged_site
        target: /srv/askrigor-site
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: $staged_caddyfile
        target: /etc/caddy/Caddyfile
        read_only: true
        bind:
          create_host_path: false
EOF
}

verify_compose_delta() {
  local base_render=$1
  local candidate_render=$2
  python3 -I - "$base_render" "$candidate_render" <<'PYTHON'
import copy
import json
import re
import sys

def fail(message):
    sys.stderr.write(f"Compose delta rejected: {message}\\n")
    raise SystemExit(1)

def strict_equal(left, right):
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(strict_equal(left[key], right[key]) for key in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(strict_equal(a, b) for a, b in zip(left, right))
    return left == right

try:
    with open(sys.argv[1], encoding="utf-8") as base_file:
        base = json.load(base_file)
    with open(sys.argv[2], encoding="utf-8") as candidate_file:
        candidate = json.load(candidate_file)
except (IndexError, OSError, ValueError):
    fail("render is missing or invalid JSON")

base_services = base.get("services") if isinstance(base, dict) else None
candidate_services = candidate.get("services") if isinstance(candidate, dict) else None
base_caddy = base_services.get("caddy") if isinstance(base_services, dict) else None
candidate_caddy = candidate_services.get("caddy") if isinstance(candidate_services, dict) else None
if not isinstance(base_caddy, dict) or not isinstance(candidate_caddy, dict):
    fail("both renders must contain caddy")
if candidate_caddy.get("image") != base_caddy.get("image"):
    fail("candidate Caddy image differs from production")
image = candidate_caddy.get("image")
if not isinstance(image, str) or not re.search(r"(?:^|/)caddy(?::[^@\\s]+)?@sha256:[0-9a-f]{64}$", image, re.IGNORECASE):
    fail("candidate must use the exact pinned production Caddy image")

base_volumes = base_caddy.get("volumes") if isinstance(base_caddy.get("volumes"), list) else []
candidate_volumes = candidate_caddy.get("volumes") if isinstance(candidate_caddy.get("volumes"), list) else []

def by_target(volumes, label):
    result = {}
    for volume in volumes:
        target = volume.get("target") if isinstance(volume, dict) else None
        if not isinstance(target, str) or target in result:
            fail(f"{label} Caddy volumes must have unique targets")
        result[target] = volume
    return result

base_by_target = by_target(base_volumes, "production")
candidate_by_target = by_target(candidate_volumes, "candidate")
config_target = "/etc/caddy/Caddyfile"
site_target = "/srv/askrigor-site"
if config_target not in base_by_target:
    fail("production Caddyfile mount is missing")
if site_target in base_by_target:
    fail("production render already contains the public-site mount")
if len(candidate_by_target) != len(base_by_target) + 1:
    fail("candidate has an unexpected Caddy volume delta")

def exact_reviewed_bind(volume, source, target):
    return strict_equal(volume, {
        "type": "bind",
        "source": source,
        "target": target,
        "read_only": True,
        "bind": {"create_host_path": False},
    })

if not exact_reviewed_bind(candidate_by_target.get(config_target), "/opt/askrigor/site/state/Caddyfile", config_target):
    fail("candidate Caddyfile mount is not the reviewed read-only bind")
if not exact_reviewed_bind(candidate_by_target.get(site_target), "/opt/askrigor/site/current", site_target):
    fail("candidate site mount is not the reviewed read-only bind")

for target, base_volume in base_by_target.items():
    if target != config_target and not strict_equal(candidate_by_target.get(target), base_volume):
        fail(f"candidate changes the existing Caddy volume at {target}")

normalized_candidate_caddy = copy.deepcopy(candidate_caddy)
normalized_candidate_caddy["volumes"] = copy.deepcopy(base_volumes)
if not strict_equal(normalized_candidate_caddy, base_caddy):
    fail("candidate changes Caddy configuration outside the two reviewed mounts")

normalized_candidate = copy.deepcopy(candidate)
normalized_candidate["services"]["caddy"] = copy.deepcopy(base_caddy)
if not strict_equal(normalized_candidate, base):
    fail("candidate changes configuration outside the two reviewed Caddy mounts")
PYTHON
}

main() {
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

base_compose=/opt/askrigor/compose.yaml
https_release_link=/opt/askrigor/active-https
https_releases_root=/opt/askrigor/releases/https
site_root=/opt/askrigor/site
releases_root=/opt/askrigor/site/releases
state_root=/opt/askrigor/site/state
current_link=/opt/askrigor/site/current
release_path="$releases_root/$revision"
staging_path="$releases_root/.${revision}.staging"

ensure_secure_directory() {
  local path=$1
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    install -d -o root -g root -m 0755 -- "$path"
  fi
  assert_root_owned_secure_path "$path" directory
}

command -v docker >/dev/null || die "docker is required"
docker compose version >/dev/null || die "Docker Compose v2 is required"
command -v curl >/dev/null || die "curl is required"
command -v tar >/dev/null || die "tar is required"
command -v realpath >/dev/null || die "realpath is required"
command -v python3 >/dev/null || die "python3 is required"

[[ ! -L "$input_archive" ]] || die "path must not be a symlink: $input_archive"
[[ ! -L "$input_checksum" ]] || die "path must not be a symlink: $input_checksum"
input_archive=$(realpath -e -- "$input_archive")
input_checksum=$(realpath -e -- "$input_checksum")

assert_root_owned_secure_path /opt directory
assert_root_owned_secure_path /opt/askrigor directory
assert_root_owned_secure_path "$base_compose" file
assert_root_owned_secure_parent_chain "$https_releases_root/release"
resolve_https_release "$https_release_link" "$https_releases_root"
https_compose=$resolved_https_compose
production_caddyfile=$resolved_production_caddyfile
select_live_compose_config_files \
  "$base_compose" "$https_compose" "$state_root/compose.site.yaml"
discover_live_caddy_container "$live_compose_config_files"
extract_public_caddy_environment "$live_caddy_container_id"
caddy_caddyfile=$production_caddyfile
compose_environment=(
  env -i
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  HOME=/root
  "ASKRIGOR_HOSTNAME=$caddy_hostname"
  "ASKRIGOR_DIRECT_DNS_ONLY=$caddy_direct_dns_only"
  "ASKRIGOR_CADDYFILE=$caddy_caddyfile"
)
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
  run_compose_command
  docker compose
  -f "$base_compose"
  -f "$https_compose"
)
candidate_compose_command=(
  run_compose_command
  docker compose
  -f "$base_compose"
  -f "$https_compose"
  -f "$packet_overlay"
)

base_compose_render="$staging_path/compose.base.json"
candidate_compose_render="$staging_path/compose.candidate.json"
umask 077
"${base_compose_command[@]}" config --no-env-resolution --no-interpolate --format json \
  >"$base_compose_render"
"${candidate_compose_command[@]}" config --no-env-resolution --no-interpolate --format json \
  >"$candidate_compose_render"
chmod 0600 -- "$base_compose_render" "$candidate_compose_render"
verify_compose_delta "$base_compose_render" "$candidate_compose_render"

validation_overlay="$staging_path/compose.validation.yaml"
write_validation_overlay \
  "$validation_overlay" "$staged_combined_caddyfile" "$release_path/site"
chmod 0600 -- "$validation_overlay"

# The run-time volume overrides validate the staged inputs without changing the
# current link or active state files. The image still comes from the production
# three-file Compose model.
"${candidate_compose_command[@]}" -f "$validation_overlay" run --rm --no-deps \
  --entrypoint caddy caddy \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile

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

activate_release
}

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
  local restoration_failed=0
  if [[ "$previous_caddyfile_present" -eq 1 ]]; then
    restore_path="$state_root/.Caddyfile.rollback"
    if ! install -o root -g root -m 0400 -- "$previous_caddyfile_backup" "$restore_path"; then
      printf 'Rollback restore failed: prior Caddyfile could not be staged.\n' >&2
      restoration_failed=1
    elif ! mv -Tf -- "$restore_path" "$state_root/Caddyfile"; then
      printf 'Rollback restore failed: prior Caddyfile could not be installed.\n' >&2
      restoration_failed=1
    fi
  else
    if ! rm -f -- "$state_root/Caddyfile"; then
      printf 'Rollback restore failed: new Caddyfile could not be removed.\n' >&2
      restoration_failed=1
    fi
  fi
  if [[ "$previous_overlay_present" -eq 1 ]]; then
    restore_path="$state_root/.compose.site.rollback.yaml"
    if ! install -o root -g root -m 0400 -- "$previous_overlay_backup" "$restore_path"; then
      printf 'Rollback restore failed: prior Compose overlay could not be staged.\n' >&2
      restoration_failed=1
    elif ! mv -Tf -- "$restore_path" "$state_root/compose.site.yaml"; then
      printf 'Rollback restore failed: prior Compose overlay could not be installed.\n' >&2
      restoration_failed=1
    fi
  else
    if ! rm -f -- "$state_root/compose.site.yaml"; then
      printf 'Rollback restore failed: new Compose overlay could not be removed.\n' >&2
      restoration_failed=1
    fi
  fi
  if [[ -n "$previous_current_target" ]]; then
    if ! rm -f -- "$next_current_link" ||
       ! ln -s -- "$previous_current_target" "$next_current_link" ||
       ! mv -Tf -- "$next_current_link" "$current_link"; then
      printf 'Rollback restore failed: prior current link could not be installed.\n' >&2
      restoration_failed=1
    fi
  else
    if ! rm -f -- "$current_link" "$next_current_link"; then
      printf 'Rollback restore failed: new current link could not be removed.\n' >&2
      restoration_failed=1
    fi
  fi

  if [[ "$previous_caddyfile_present" -eq 1 ]]; then
    if [[ -L "$state_root/Caddyfile" || ! -f "$state_root/Caddyfile" ]] ||
       ! cmp -s -- "$previous_caddyfile_backup" "$state_root/Caddyfile"; then
      restoration_failed=1
    fi
  elif [[ -e "$state_root/Caddyfile" || -L "$state_root/Caddyfile" ]]; then
    restoration_failed=1
  fi
  if [[ "$previous_overlay_present" -eq 1 ]]; then
    if [[ -L "$state_root/compose.site.yaml" || ! -f "$state_root/compose.site.yaml" ]] ||
       ! cmp -s -- "$previous_overlay_backup" "$state_root/compose.site.yaml"; then
      restoration_failed=1
    fi
  elif [[ -e "$state_root/compose.site.yaml" || -L "$state_root/compose.site.yaml" ]]; then
    restoration_failed=1
  fi
  if [[ -n "$previous_current_target" ]]; then
    if [[ ! -L "$current_link" ]] ||
       [[ $(readlink -- "$current_link" 2>/dev/null || true) != "$previous_current_target" ]]; then
      restoration_failed=1
    fi
  elif [[ -e "$current_link" || -L "$current_link" ]]; then
    restoration_failed=1
  fi

  [[ "$restoration_failed" -eq 0 ]] || {
    printf 'Rollback restoration is incomplete; Caddy will not be recreated.\n' >&2
    return 1
  }
}

recreate_previous_caddy_only() {
  if [[ "$previous_overlay_present" -eq 1 ]]; then
    run_compose_command docker compose \
      -f "$base_compose" \
      -f "$https_compose" \
      -f /opt/askrigor/site/state/compose.site.yaml \
      up -d --no-deps --force-recreate caddy
  else
    run_compose_command docker compose \
      -f "$base_compose" \
      -f "$https_compose" \
      up -d --no-deps --force-recreate caddy
  fi
}

rollback_armed=0
rollback_started=0
termination_handling=0
perform_rollback() {
  if ! restore_previous_state; then
    return 1
  fi
  if ! recreate_previous_caddy_only; then
    printf 'Rollback recreation failed after coherent state restoration.\n' >&2
    return 1
  fi
  if ! probe_http_200 http://127.0.0.1:3000/healthz ||
     ! probe_http_200 https://mcp.askrigor.com/healthz; then
    printf 'Warning: MCP health did not recover during rollback verification.\n' >&2
    return 1
  fi
}

activation_error_handler() {
  local status=$?
  exit "$status"
}

activation_exit_handler() {
  local status=$?
  local rollback_status=0
  trap - ERR EXIT HUP INT TERM
  [[ "$rollback_armed" -eq 1 ]] || exit "$status"
  rollback_armed=0
  if [[ "$rollback_started" -eq 1 ]]; then
    exit "$status"
  fi
  rollback_started=1
  set +e
  printf 'Deployment interrupted or failed; restoring the prior public-site state.\n' >&2
  perform_rollback
  rollback_status=$?
  if [[ "$rollback_status" -ne 0 ]]; then
    printf 'Rollback did not complete successfully; manual recovery is required.\n' >&2
  fi
  printf 'preserved failed release artifacts:\n  staging: %s\n  release: %s\n' \
    "$staging_path" "$release_path" >&2
  [[ "$status" -ne 0 ]] || status=1
  exit "$status"
}

handle_activation_signal() {
  local signal_name=$1
  local exit_status=$2
  if [[ "$termination_handling" -eq 0 ]]; then
    termination_handling=1
    printf 'Received %s; terminating through the rollback gate.\n' "$signal_name" >&2
  fi
  trap - HUP INT TERM
  exit "$exit_status"
}

arm_activation_transaction() {
  rollback_armed=1
  rollback_started=0
  termination_handling=0
  trap activation_error_handler ERR
  trap activation_exit_handler EXIT
  trap 'handle_activation_signal HUP 129' HUP
  trap 'handle_activation_signal INT 130' INT
  trap 'handle_activation_signal TERM 143' TERM
}

complete_activation_transaction() {
  rollback_armed=0
  trap - ERR EXIT HUP INT TERM
}

activate_release() {
  # Arm rollback before the first atomic change to current or active state.
  arm_activation_transaction

  mv -Tf -- "$next_caddyfile" "$state_root/Caddyfile"
  mv -Tf -- "$next_overlay" "$state_root/compose.site.yaml"
  ln -s -- "$release_path/site" "$next_current_link"
  mv -Tf -- "$next_current_link" "$current_link"

  run_compose_command docker compose \
    -f "$base_compose" \
    -f "$https_compose" \
    -f /opt/askrigor/site/state/compose.site.yaml \
    up -d --no-deps --force-recreate caddy

  verify_mcp_health
  verify_public_routes

  complete_activation_transaction
  rm -rf -- "$staging_path"
  printf 'Activated public-site release %s at %s\n' "$revision" "$release_path"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
