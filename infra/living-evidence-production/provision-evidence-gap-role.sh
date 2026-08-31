#!/bin/sh
set -eu

intake_password_file="${ASKRIGOR_EVIDENCE_GAP_INTAKE_PASSWORD_FILE:?intake password file is required}"
migrator_password_file="${POSTGRES_PASSWORD_FILE:?migrator password file is required}"
intake_password="$(tr -d '\r\n' < "$intake_password_file")"
migrator_password="$(tr -d '\r\n' < "$migrator_password_file")"

validate_hex_password() {
  label="$1"
  value="$2"
  case "$value" in
    *[!A-Fa-f0-9]*|'')
      echo "$label password must be nonempty hexadecimal" >&2
      exit 1
      ;;
  esac
  if [ "${#value}" -ne 64 ]; then
    echo "$label password must contain exactly 64 hexadecimal characters" >&2
    exit 1
  fi
}

validate_hex_password "evidence-gap intake" "$intake_password"
validate_hex_password "living-evidence migrator" "$migrator_password"

PGPASSWORD="$migrator_password" psql \
  --host 127.0.0.1 \
  --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<SQL
DO \$role\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_evidence_gap_intake') THEN
    EXECUTE 'ALTER ROLE askrigor_evidence_gap_intake LOGIN PASSWORD ''${intake_password}'''
      || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  ELSE
    EXECUTE 'CREATE ROLE askrigor_evidence_gap_intake LOGIN PASSWORD ''${intake_password}'''
      || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  END IF;
END
\$role\$;

REVOKE ALL ON DATABASE askrigor_living_evidence FROM askrigor_evidence_gap_intake;
GRANT CONNECT ON DATABASE askrigor_living_evidence TO askrigor_evidence_gap_intake;
REVOKE TEMPORARY ON DATABASE askrigor_living_evidence FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM askrigor_evidence_gap_intake;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA living_evidence FROM askrigor_evidence_gap_intake;
GRANT USAGE ON SCHEMA living_evidence TO askrigor_evidence_gap_intake;
REVOKE ALL ON ALL TABLES IN SCHEMA living_evidence FROM askrigor_evidence_gap_intake;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA living_evidence FROM askrigor_evidence_gap_intake;
GRANT SELECT, INSERT, UPDATE ON TABLE living_evidence.evidence_gap_submissions
  TO askrigor_evidence_gap_intake;
ALTER ROLE askrigor_evidence_gap_intake SET statement_timeout = '5s';
ALTER ROLE askrigor_evidence_gap_intake SET idle_in_transaction_session_timeout = '5s';
ALTER ROLE askrigor_evidence_gap_intake SET search_path = living_evidence, pg_catalog;
SQL

unset intake_password migrator_password
