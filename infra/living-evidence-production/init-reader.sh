#!/bin/sh
set -eu

reader_password_file="${ASKRIGOR_READER_PASSWORD_FILE:?reader password file is required}"
reader_password="$(tr -d '\r\n' < "$reader_password_file")"
case "$reader_password" in
  *[!A-Fa-f0-9]*|'')
    echo "living-evidence reader password must be nonempty hexadecimal" >&2
    exit 1
    ;;
esac
if [ "${#reader_password}" -ne 64 ]; then
  echo "living-evidence reader password must contain exactly 64 hexadecimal characters" >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE SCHEMA IF NOT EXISTS living_evidence AUTHORIZATION askrigor_migrator;
REVOKE ALL ON SCHEMA living_evidence FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE askrigor_reader LOGIN PASSWORD '${reader_password}';
ALTER ROLE askrigor_reader SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE askrigor_living_evidence TO askrigor_reader;
GRANT USAGE ON SCHEMA living_evidence TO askrigor_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE askrigor_migrator IN SCHEMA living_evidence
  GRANT SELECT ON TABLES TO askrigor_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE askrigor_migrator IN SCHEMA living_evidence
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SQL

unset reader_password
