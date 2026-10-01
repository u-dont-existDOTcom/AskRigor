#!/usr/bin/env bash
# Real-PostgreSQL acceptance for the free contributor notice v2 rollback
# scripts: migrate a disposable database to the current schema, then run
# hold, a v1 re-acceptance as the earlier image writes it, and restore, each
# script twice, checking the rows between steps.
set -Eeuo pipefail

postgres_image="postgres:17.6-alpine@sha256:747d5ed1fdeeb124b880fbe3d7c6557d2c4064ae41d6b6297d417882effce4be"
container_name="askrigor-notice-v2-rollback-acceptance-$$"
temporary_dir="$(mktemp -d -t askrigor-notice-v2-rollback.XXXXXX)"

cleanup() {
  docker rm --force "$container_name" >/dev/null 2>&1 || true
  rm -rf -- "$temporary_dir"
}
trap cleanup EXIT

umask 077
openssl rand -hex 32 >"$temporary_dir/migrator-password"
openssl rand -hex 32 >"$temporary_dir/access-password"
migrator_password="$(tr -d '\r\n' <"$temporary_dir/migrator-password")"
access_password="$(tr -d '\r\n' <"$temporary_dir/access-password")"

docker run --detach --name "$container_name" \
  --env POSTGRES_DB=askrigor_living_evidence \
  --env POSTGRES_USER=askrigor_migrator \
  --env POSTGRES_PASSWORD_FILE=/run/secrets/migrator-password \
  --mount "type=bind,src=$temporary_dir/migrator-password,dst=/run/secrets/migrator-password,readonly" \
  --tmpfs /var/lib/postgresql/data \
  --publish 127.0.0.1::5432 \
  "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 45); do
  if docker exec "$container_name" pg_isready \
    --username askrigor_migrator --dbname askrigor_living_evidence >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "PostgreSQL acceptance container did not become ready" >&2
  exit 1
fi

host_port="$(docker port "$container_name" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
if [[ ! "$host_port" =~ ^[0-9]+$ ]]; then
  echo "Could not resolve PostgreSQL acceptance port" >&2
  exit 1
fi
admin_url="postgresql://askrigor_migrator:${migrator_password}@127.0.0.1:${host_port}/askrigor_living_evidence"
access_url="postgresql://askrigor_research_access:${access_password}@127.0.0.1:${host_port}/askrigor_living_evidence"

DATABASE_URL="$admin_url" npx tsx \
  scripts/research-contributor-access-postgres-acceptance.mts migrate

docker cp infra/living-evidence-production/provision-research-access-role.sh \
  "$container_name:/tmp/provision-research-access-role"
docker cp "$temporary_dir/migrator-password" "$container_name:/tmp/migrator-password"
docker cp "$temporary_dir/access-password" "$container_name:/tmp/access-password"
docker exec \
  --env POSTGRES_USER=askrigor_migrator \
  --env POSTGRES_DB=askrigor_living_evidence \
  --env POSTGRES_PASSWORD_FILE=/tmp/migrator-password \
  --env ASKRIGOR_RESEARCH_ACCESS_PASSWORD_FILE=/tmp/access-password \
  "$container_name" sh /tmp/provision-research-access-role

docker cp infra/living-evidence-production/research-use-notice-v2-hold.sql "$container_name:/tmp/hold.sql"
docker cp infra/living-evidence-production/research-use-notice-v2-restore.sql "$container_name:/tmp/restore.sql"
run_sql() {
  docker exec "$container_name" psql --quiet --no-psqlrc \
    --username askrigor_migrator --dbname askrigor_living_evidence \
    -v schema=living_evidence -f "/tmp/$1"
}

# Restore before any hold has nothing to do and succeeds.
run_sql restore.sql

phase() {
  DATABASE_URL="$admin_url" ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL="$access_url" \
    npx tsx scripts/research-use-notice-v2-rollback-acceptance.mts "$1" "$temporary_dir/snapshot.json"
}

phase seed
run_sql hold.sql
run_sql hold.sql
phase after-hold
phase reenroll-v1
run_sql restore.sql
run_sql restore.sql
phase after-restore
echo '{"status":"PASS","acceptance":"research-use-notice-v2-rollback"}'
