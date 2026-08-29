#!/usr/bin/env bash
set -euo pipefail

compose_file="infra/living-evidence-pilot/compose.yaml"
project_name="askrigor_living_evidence_pilot"

cleanup() {
  docker compose --project-name "$project_name" --file "$compose_file" down
}
trap cleanup EXIT

docker compose --project-name "$project_name" --file "$compose_file" up --detach --wait
export DATABASE_URL="postgresql://askrigor_pilot:local-pilot-only@127.0.0.1:55432/askrigor_living_evidence"
export ASKRIGOR_LIVING_EVIDENCE_OUTPUT="${ASKRIGOR_LIVING_EVIDENCE_OUTPUT:-/tmp/askrigor-living-evidence-pilot}"
npm run living-evidence:acceptance
npm run living-evidence:pilot

umask 077
container_id="$(docker compose --project-name "$project_name" --file "$compose_file" ps --quiet postgres)"
docker compose --project-name "$project_name" --file "$compose_file" exec --no-TTY postgres \
  pg_dump --username askrigor_pilot --dbname askrigor_living_evidence \
  --schema living_evidence --format custom --no-owner --no-privileges \
  --file /tmp/living-evidence-pilot.dump
docker cp "$container_id:/tmp/living-evidence-pilot.dump" \
  "$ASKRIGOR_LIVING_EVIDENCE_OUTPUT/living-evidence-pilot.dump"
chmod 600 "$ASKRIGOR_LIVING_EVIDENCE_OUTPUT/living-evidence-pilot.dump"

docker compose --project-name "$project_name" --file "$compose_file" exec --no-TTY postgres \
  psql --username askrigor_pilot --dbname askrigor_living_evidence \
  --set ON_ERROR_STOP=1 --command "DROP SCHEMA living_evidence CASCADE"
export ASKRIGOR_LIVING_EVIDENCE_SOURCE_SCHEMA_WIPED="true"
docker compose --project-name "$project_name" --file "$compose_file" exec --no-TTY postgres \
  pg_restore --username askrigor_pilot --dbname askrigor_living_evidence \
  --no-owner --no-privileges /tmp/living-evidence-pilot.dump
npm run living-evidence:restore-verify
