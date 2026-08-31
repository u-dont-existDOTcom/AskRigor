#!/usr/bin/env bash
set -euo pipefail

expected_commit="768a4ed1cd8e6742fe1c1340a9c4ab01318285ec"
expected_image="docker.io/discourse/discourse_dev@sha256:d8dc0097c0911ebbf1e4844e7db0426ebeae9469637d45fcabc7cd10c516940f"
project_name="${ASKRIGOR_DISCOURSE_PROJECT_NAME:-askrigor_synthetic_discourse_acceptance}"
source_dir="${ASKRIGOR_DISCOURSE_SOURCE_DIR:-}"
http_port="${ASKRIGOR_DISCOURSE_HTTP_PORT:-33000}"
compose_file="labs/discourse-synthetic/compose.yaml"

if [[ -z "$source_dir" || ! -d "$source_dir/.git" ]]; then
  echo "ASKRIGOR_DISCOURSE_SOURCE_DIR must name a disposable Discourse Git checkout" >&2
  exit 2
fi

if [[ "$project_name" != askrigor_synthetic_discourse_* ]]; then
  echo "refusing non-owned Compose project name: $project_name" >&2
  exit 2
fi

actual_commit="$(git -C "$source_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$expected_commit" ]]; then
  echo "Discourse source mismatch: expected $expected_commit, got $actual_commit" >&2
  exit 2
fi

if [[ -n "$(git -C "$source_dir" status --porcelain --untracked-files=no)" ]]; then
  echo "refusing a modified Discourse source checkout" >&2
  exit 2
fi

runtime_tmp="$(mktemp -d)"
robots_file="$runtime_tmp/robots.txt"

compose_cleanup() {
  docker compose --project-name "$project_name" --file "$compose_file" down --volumes >/dev/null 2>&1 || true
}
cleanup() {
  compose_cleanup
  [[ ! -d "$runtime_tmp" ]] || rm -r -- "$runtime_tmp"
}
trap cleanup EXIT

compose_cleanup
docker compose --project-name "$project_name" --file "$compose_file" up --detach discourse

docker compose --project-name "$project_name" --file "$compose_file" exec -T --user discourse discourse \
  bash -lc 'cd /src && bundle install && pnpm install --frozen-lockfile'
docker compose --project-name "$project_name" --file "$compose_file" exec -T --user discourse discourse \
  bash -lc 'cd /src && bin/rake db:create db:migrate'
seed_output="$(docker compose --project-name "$project_name" --file "$compose_file" exec -T --user discourse discourse \
  bash -lc 'cd /src && bin/rails runner /askrigor-lab/seed.rb')"

docker compose --project-name "$project_name" --file "$compose_file" exec --detach --user discourse discourse \
  bash -lc 'cd /src && exec bin/rails server --binding 0.0.0.0 --port 3000 >/tmp/askrigor-discourse-rails.log 2>&1'

ready="false"
for _ in $(seq 1 120); do
  if curl --silent --show-error --fail --max-time 3 "http://127.0.0.1:${http_port}/robots.txt" >"$robots_file"; then
    ready="true"
    break
  fi
  sleep 2
done
if [[ "$ready" != "true" ]]; then
  docker compose --project-name "$project_name" --file "$compose_file" exec -T discourse \
    bash -lc 'tail -n 200 /tmp/askrigor-discourse-rails.log' >&2 || true
  echo "Discourse did not become ready" >&2
  exit 1
fi

robots="$(tr -d '\r' <"$robots_file")"
if ! grep -q '^User-agent: \*$' <<<"$robots" || ! grep -q '^Disallow: /$' <<<"$robots" || grep -q '^Allow:' <<<"$robots"; then
  echo "robots.txt does not deny all crawlers" >&2
  exit 1
fi

headers="$(curl --silent --show-error --dump-header - --output /dev/null --max-time 5 "http://127.0.0.1:${http_port}/")"
if ! grep -qi '^x-robots-tag: noindex, nofollow' <<<"$headers"; then
  echo "root response is missing X-Robots-Tag: noindex, nofollow" >&2
  exit 1
fi

port_bindings="$(docker compose --project-name "$project_name" --file "$compose_file" port discourse 3000)"
if [[ "$port_bindings" != "127.0.0.1:${http_port}" ]]; then
  echo "unexpected HTTP port binding: $port_bindings" >&2
  exit 1
fi

seed_json="${seed_output##*ASKRIGOR_SYNTHETIC_SEED=}"
jq -e '
  .syntheticOnly == true and
  .humanUserCount == 4 and
  .syntheticHumanUserCount == 4 and
  .categoryCount == 3 and
  .topicCount == 3 and
  .allFixturePostsMarkedSynthetic == true and
  ([.permissionChecks[]] | all) and
  .settings.allowIndexInRobotsTxt == false and
  .settings.robotsOverride == "User-agent: *\nDisallow: /\n" and
  .settings.disableEmails == "yes" and
  .settings.allowNewRegistrations == false
' <<<"$seed_json" >/dev/null

container_id="$(docker compose --project-name "$project_name" --file "$compose_file" ps --quiet discourse)"
image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
image_ref="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
if [[ "$image_ref" != "$expected_image" ]]; then
  echo "running image reference mismatch: $image_ref" >&2
  exit 1
fi

jq -n \
  --arg schemaVersion "1" \
  --arg sourceCommit "$actual_commit" \
  --arg imageRef "$image_ref" \
  --arg imageId "$image_id" \
  --arg containerId "$container_id" \
  --arg httpBinding "$port_bindings" \
  --argjson seed "$seed_json" \
  '{
    schemaVersion: ($schemaVersion | tonumber),
    accepted: true,
    syntheticOnly: true,
    sourceCommit: $sourceCommit,
    imageRef: $imageRef,
    imageId: $imageId,
    containerId: $containerId,
    httpBinding: $httpBinding,
    outboundEmail: "DISABLED",
    robotsDenyAll: true,
    xRobotsTag: "noindex, nofollow",
    seed: $seed,
    cleanup: "owned Compose project and volumes removed on exit"
  }'
