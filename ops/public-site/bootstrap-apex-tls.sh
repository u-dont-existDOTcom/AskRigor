#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s <expected-apex-ipv4>\n' "${0##*/}" >&2
}

die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

valid_ipv4() {
  local address=$1 octet
  local -a octets=()
  [[ "$address" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS=. read -r -a octets <<<"$address"
  [[ "${#octets[@]}" -eq 4 ]] || return 1
  for octet in "${octets[@]}"; do
    (( 10#$octet <= 255 )) || return 1
  done
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
  local -a parent_components=()
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
  local -a target_components=()

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

discover_research_mcp_container() {
  local expected_config_files=$1
  local candidates_output
  local -a candidates=()
  candidates_output=$(docker ps -q \
    --filter label=com.docker.compose.service=research-mcp \
    --filter "label=com.docker.compose.project.config_files=$expected_config_files") ||
    die "cannot identify the running research-mcp container"
  mapfile -t candidates <<<"$candidates_output"
  [[ "${#candidates[@]}" -eq 1 && -n "${candidates[0]}" ]] ||
    die "expected exactly one running research-mcp container for the validated Compose files"
  live_mcp_container_id=${candidates[0]}
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

record_evidence() {
  local name=$1
  local value=$2
  local destination="$evidence_dir/$name"
  umask 077
  printf '%s\n' "$value" >"$destination"
  chmod 0400 -- "$destination"
}

verify_apex_dns() {
  local expected_ipv4=$1
  local optional_evidence_dir=${2:-}
  local a_output aaaa_output answer
  local -a a_answers=() aaaa_answers=()

  a_output=$(dig +short A askrigor.com) || die "apex DNS A lookup failed"
  aaaa_output=$(dig +short AAAA askrigor.com) || die "apex DNS AAAA lookup failed"
  while IFS= read -r answer; do
    [[ -n "$answer" ]] && a_answers+=("$answer")
  done <<<"$a_output"
  while IFS= read -r answer; do
    [[ -n "$answer" ]] && aaaa_answers+=("$answer")
  done <<<"$aaaa_output"

  [[ "${#a_answers[@]}" -eq 1 && "${a_answers[0]}" == "$expected_ipv4" ]] ||
    die "apex DNS must contain exactly the expected A answer"
  [[ "${#aaaa_answers[@]}" -eq 0 ]] || die "apex DNS must not contain an AAAA answer"

  apex_a_answers=$a_output
  apex_aaaa_answers=$aaaa_output
  if [[ -n "$optional_evidence_dir" ]]; then
    evidence_dir=$optional_evidence_dir
    record_evidence dns-a.txt "$a_output"
    record_evidence dns-aaaa.txt "$aaaa_output"
  fi
}

verify_certificate_san() {
  local certificate_file=$1
  local san_output
  san_output=$(openssl x509 -in "$certificate_file" -noout -ext subjectAltName) ||
    die "cannot inspect apex certificate SAN"
  [[ "$san_output" =~ (^|[[:space:],])DNS:askrigor\.com([[:space:],]|$) ]] ||
    die "apex certificate SAN must contain DNS:askrigor.com"
}

headers_omit_server() {
  local headers=$1 line key
  while IFS= read -r line; do
    line=${line%$'\r'}
    [[ "$line" == *:* ]] || continue
    key=${line%%:*}
    [[ "${key,,}" != server ]] || return 1
  done <<<"$headers"
}

verify_acceptance_values() {
  [[ "$#" -eq 8 ]] || die "internal error: acceptance requires eight values"
  local https_status=$1
  local http_status=$2
  local http_location=$3
  local https_headers=$4
  local mcp_id_before=$5
  local mcp_id_after=$6
  local loopback_mcp_status=$7
  local public_mcp_status=$8

  [[ "$https_status" == 204 ]] || die "apex HTTPS did not return 204"
  [[ "$http_status" == 308 ]] || die "apex HTTP did not return 308"
  [[ "$http_location" == https://askrigor.com/ ]] ||
    die "apex HTTP redirect did not target apex HTTPS"
  headers_omit_server "$https_headers" || die "apex HTTPS exposed a Server header"
  [[ -n "$mcp_id_before" && "$mcp_id_after" == "$mcp_id_before" ]] ||
    die "research-mcp container ID changed"
  [[ "$loopback_mcp_status" == 200 ]] || die "loopback MCP health check failed"
  [[ "$public_mcp_status" == 200 ]] || die "public MCP health check failed"
}

curl_status() {
  local url=$1
  local protocol=$2
  curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --noproxy '*' --proto "=$protocol" --max-time 15 -- "$url"
}

verify_mcp_health() {
  local prefix=${1:-mcp}
  local loopback_status public_status
  if ! loopback_status=$(curl_status http://127.0.0.1:3000/healthz http); then
    die "loopback MCP health request failed"
    return 1
  fi
  if ! public_status=$(curl_status https://mcp.askrigor.com/healthz https); then
    die "public MCP health request failed"
    return 1
  fi
  mcp_loopback_status=$loopback_status
  mcp_public_status=$public_status
  if [[ -n "${evidence_dir:-}" ]]; then
    record_evidence "${prefix}-loopback-status.txt" "$loopback_status"
    record_evidence "${prefix}-public-status.txt" "$public_status"
  fi
  if [[ "$loopback_status" != 200 ]]; then
    die "loopback MCP health check failed"
    return 1
  fi
  if [[ "$public_status" != 200 ]]; then
    die "public MCP health check failed"
    return 1
  fi
}

extract_header_value() {
  local headers=$1
  local requested_name=$2
  local line key value found=
  while IFS= read -r line; do
    line=${line%$'\r'}
    [[ "$line" == *:* ]] || continue
    key=${line%%:*}
    value=${line#*:}
    value=${value# }
    if [[ "${key,,}" == "${requested_name,,}" ]]; then
      found=$value
    fi
  done <<<"$headers"
  printf '%s' "$found"
}

configure_compose_environment() {
  local selected_caddyfile=$1
  caddy_caddyfile=$selected_caddyfile
  compose_environment=(
    env -i
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    HOME=/root
    "ASKRIGOR_HOSTNAME=$caddy_hostname"
    "ASKRIGOR_DIRECT_DNS_ONLY=$caddy_direct_dns_only"
    "ASKRIGOR_CADDYFILE=$caddy_caddyfile"
  )
}

configure_compose_version_environment() {
  local clean_path=$1
  compose_version_environment=(
    env -i
    "PATH=$clean_path"
    HOME=/root
  )
}

probe_compose_v2() {
  "${compose_version_environment[@]}" docker compose version >/dev/null ||
    die "Docker Compose v2 is required"
}

run_compose_command() {
  "${compose_environment[@]}" "$@"
}

assert_pinned_caddy_image_reference() {
  local image=$1
  [[ "$image" == caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 ]] ||
    die "running Caddy image must be the authorized pinned production reference"
}

assert_effective_caddy_image() {
  local effective_output image
  local -a effective_images=()
  effective_output=$(run_compose_command docker compose \
    -f "$base_compose" \
    -f "$https_compose" \
    config --no-env-resolution --images caddy) ||
    die "cannot resolve the effective Caddy image"
  while IFS= read -r image; do
    [[ -n "$image" ]] && effective_images+=("$image")
  done <<<"$effective_output"
  [[ "${#effective_images[@]}" -eq 1 && "${effective_images[0]}" == "$pinned_caddy_image" ]] ||
    die "effective Caddy image does not equal the inspected pinned reference"
}

validate_bootstrap_caddyfile() {
  assert_effective_caddy_image
  run_compose_command docker compose \
    -f "$base_compose" \
    -f "$https_compose" \
    run --rm --no-deps --pull never --entrypoint caddy caddy \
    validate --config /etc/caddy/Caddyfile --adapter caddyfile
}

recreate_caddy_with_selected_file() {
  local selected_caddyfile=$1
  configure_compose_environment "$selected_caddyfile"
  assert_effective_caddy_image
  run_compose_command docker compose \
    -f "$base_compose" \
    -f "$https_compose" \
    up -d --pull never --no-build --no-deps --force-recreate caddy
}

verify_post_recreation_acceptance() {
  local expected_mcp_id=$1
  local https_headers_file="$bootstrap_dir/https.headers"
  local https_body_file="$bootstrap_dir/https.body"
  local http_headers_file="$bootstrap_dir/http.headers"
  local http_body_file="$bootstrap_dir/http.body"
  local https_status= http_status= http_location= https_headers=
  local certificate_pem certificate_details
  local https_header_checksum https_body_checksum
  local http_header_checksum http_body_checksum
  local attempt

  for attempt in {1..30}; do
    https_status=$(curl --silent --show-error --dump-header "$https_headers_file" \
      --output "$https_body_file" --write-out '%{http_code}' --noproxy '*' \
      --proto '=https' --tlsv1.2 --max-time 15 -- https://askrigor.com/ || true)
    [[ "$https_status" == 204 ]] && break
    sleep 1
  done
  http_status=$(curl --silent --show-error --dump-header "$http_headers_file" \
    --output "$http_body_file" --write-out '%{http_code}' --noproxy '*' \
    --proto '=http' --max-time 15 -- http://askrigor.com/)
  https_headers=$(<"$https_headers_file")
  http_location=$(extract_header_value "$(<"$http_headers_file")" location)
  [[ ! -s "$https_body_file" ]] || die "apex HTTPS 204 response contained a body"

  certificate_pem=$(openssl s_client -connect askrigor.com:443 \
    -servername askrigor.com -showcerts </dev/null 2>/dev/null | openssl x509 -outform PEM) ||
    die "cannot retrieve the apex certificate"
  certificate_details=$(printf '%s\n' "$certificate_pem" | openssl x509 -noout \
    -ext subjectAltName -dates -sha256 -fingerprint) ||
    die "cannot record apex certificate evidence"

  discover_research_mcp_container "$base_compose,$https_compose"
  local current_mcp_id=$live_mcp_container_id
  discover_live_caddy_container "$base_compose,$https_compose"
  local current_caddy_id=$live_caddy_container_id
  verify_mcp_health post

  https_header_checksum=$(sha256sum -- "$https_headers_file")
  https_header_checksum=${https_header_checksum%% *}
  https_body_checksum=$(sha256sum -- "$https_body_file")
  https_body_checksum=${https_body_checksum%% *}
  http_header_checksum=$(sha256sum -- "$http_headers_file")
  http_header_checksum=${http_header_checksum%% *}
  http_body_checksum=$(sha256sum -- "$http_body_file")
  http_body_checksum=${http_body_checksum%% *}
  record_evidence apex-https-status.txt "$https_status"
  record_evidence apex-http-status.txt "$http_status"
  record_evidence apex-https-header.sha256 "$https_header_checksum"
  record_evidence apex-https-body.sha256 "$https_body_checksum"
  record_evidence apex-http-header.sha256 "$http_header_checksum"
  record_evidence apex-http-body.sha256 "$http_body_checksum"
  record_evidence apex-certificate.txt "$certificate_details"
  record_evidence caddy-after.id "$current_caddy_id"
  record_evidence research-mcp-after.id "$current_mcp_id"
  rm -f -- "$https_headers_file" "$https_body_file" "$http_headers_file" "$http_body_file"

  printf '%s\n' "$certificate_pem" | verify_certificate_san /dev/stdin
  verify_acceptance_values "$https_status" "$http_status" "$http_location" \
    "$https_headers" "$expected_mcp_id" "$current_mcp_id" \
    "$mcp_loopback_status" "$mcp_public_status"
}

remove_transient_probe_artifacts() {
  [[ -n "${bootstrap_dir:-}" ]] || return 0
  rm -f -- \
    "$bootstrap_dir/https.headers" \
    "$bootstrap_dir/https.body" \
    "$bootstrap_dir/http.headers" \
    "$bootstrap_dir/http.body"
}

rollback_armed=0
rollback_started=0
termination_handling=0
perform_bootstrap_rollback() {
  recreate_caddy_with_selected_file "$production_caddyfile" || return 1
  verify_mcp_health rollback || return 1
}

bootstrap_error_handler() {
  local status=$?
  exit "$status"
}

bootstrap_exit_handler() {
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
  printf 'Bootstrap interrupted or failed; restoring the validated MCP-only Caddyfile.\n' >&2
  remove_transient_probe_artifacts
  perform_bootstrap_rollback
  rollback_status=$?
  if [[ "$rollback_status" -ne 0 ]]; then
    printf 'Rollback did not restore healthy MCP service; manual recovery is required.\n' >&2
  fi
  printf 'Preserved bootstrap state and evidence at %s\n' "${bootstrap_dir:-unknown}" >&2
  [[ "$status" -ne 0 ]] || status=1
  exit "$status"
}

handle_bootstrap_signal() {
  local signal_name=$1
  local exit_status=$2
  if [[ "$termination_handling" -eq 0 ]]; then
    termination_handling=1
    printf 'Received %s; terminating through the rollback gate.\n' "$signal_name" >&2
  fi
  trap - HUP INT TERM
  exit "$exit_status"
}

arm_bootstrap_transaction() {
  rollback_armed=1
  rollback_started=0
  termination_handling=0
  trap bootstrap_error_handler ERR
  trap bootstrap_exit_handler EXIT
  trap 'handle_bootstrap_signal HUP 129' HUP
  trap 'handle_bootstrap_signal INT 130' INT
  trap 'handle_bootstrap_signal TERM 143' TERM
}

complete_bootstrap_transaction() {
  rollback_armed=0
  remove_transient_probe_artifacts
  trap - ERR EXIT HUP INT TERM
}

execute_bootstrap_transaction() {
  local expected_mcp_id=$1
  arm_bootstrap_transaction
  recreate_caddy_with_selected_file "$bootstrap_caddyfile"
  verify_post_recreation_acceptance "$expected_mcp_id"
  complete_bootstrap_transaction
}

ensure_secure_directory() {
  local path=$1
  local mode=$2
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    install -d -o root -g root -m "$mode" -- "$path"
  fi
  assert_root_owned_secure_path "$path" directory
}

main() {
  [[ "$#" -eq 1 ]] || {
    usage
    exit 64
  }
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "bootstrap must run as root"

  local expected_apex_ipv4=$1
  valid_ipv4 "$expected_apex_ipv4" || die "expected apex IPv4 address is malformed"

  base_compose=/opt/askrigor/compose.yaml
  https_release_link=/opt/askrigor/active-https
  https_releases_root=/opt/askrigor/releases/https
  site_root=/opt/askrigor/site
  bootstrap_root=/opt/askrigor/site/bootstrap

  local required_command
  for required_command in docker curl dig openssl realpath sha256sum stat readlink install mktemp date mkdir find; do
    command -v "$required_command" >/dev/null || die "$required_command is required"
  done
  configure_compose_version_environment /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  probe_compose_v2

  assert_root_owned_secure_path /opt directory
  assert_root_owned_secure_path /opt/askrigor directory
  assert_root_owned_secure_path "$base_compose" file
  assert_root_owned_secure_parent_chain "$https_releases_root/release"
  resolve_https_release "$https_release_link" "$https_releases_root"
  https_compose=$resolved_https_compose
  production_caddyfile=$resolved_production_caddyfile

  discover_live_caddy_container "$base_compose,$https_compose"
  local original_caddy_id=$live_caddy_container_id
  extract_public_caddy_environment "$original_caddy_id"
  local pinned_caddy_image
  pinned_caddy_image=$(docker inspect --format '{{.Config.Image}}' "$original_caddy_id") ||
    die "cannot inspect the running Caddy image"
  assert_pinned_caddy_image_reference "$pinned_caddy_image"

  verify_apex_dns "$expected_apex_ipv4"
  discover_research_mcp_container "$base_compose,$https_compose"
  local original_mcp_id=$live_mcp_container_id
  verify_mcp_health

  ensure_secure_directory "$site_root" 0755
  ensure_secure_directory "$bootstrap_root" 0700
  if [[ -n "$(find "$bootstrap_root" -mindepth 1 -maxdepth 1 \
    ! -name '.bootstrap-claimed' -print -quit)" ]]; then
    die "existing apex TLS bootstrap state must be reviewed before another run"
  fi
  mkdir -- "$bootstrap_root/.bootstrap-claimed" ||
    die "another apex TLS bootstrap invocation already claimed the state root"
  chown root:root -- "$bootstrap_root/.bootstrap-claimed"
  chmod 0700 -- "$bootstrap_root/.bootstrap-claimed"
  bootstrap_dir=$(mktemp -d -- "$bootstrap_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")
  chown root:root -- "$bootstrap_dir"
  chmod 0700 -- "$bootstrap_dir"
  assert_root_owned_secure_path "$bootstrap_dir" directory
  evidence_dir="$bootstrap_dir/evidence"
  install -d -o root -g root -m 0700 -- "$evidence_dir"
  record_evidence dns-a.txt "$apex_a_answers"
  record_evidence dns-aaaa.txt "$apex_aaaa_answers"
  record_evidence caddy-before.id "$original_caddy_id"
  record_evidence research-mcp-before.id "$original_mcp_id"
  record_evidence pre-loopback-status.txt "$mcp_loopback_status"
  record_evidence pre-public-status.txt "$mcp_public_status"

  local original_caddyfile="$bootstrap_dir/Caddyfile.original"
  bootstrap_caddyfile="$bootstrap_dir/Caddyfile.bootstrap"
  install -o root -g root -m 0400 -- "$production_caddyfile" "$original_caddyfile"
  install -o root -g root -m 0600 -- "$production_caddyfile" "$bootstrap_caddyfile"
  command cat >>"$bootstrap_caddyfile" <<'CADDY'

askrigor.com {
	header -Server
	respond "" 204
}
CADDY
  chmod 0400 -- "$bootstrap_caddyfile"
  assert_root_owned_secure_path "$original_caddyfile" file
  assert_root_owned_secure_path "$bootstrap_caddyfile" file

  configure_compose_environment "$bootstrap_caddyfile"
  validate_bootstrap_caddyfile

  execute_bootstrap_transaction "$original_mcp_id"
  printf 'Apex TLS bootstrap accepted; state and evidence: %s\n' "$bootstrap_dir"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
