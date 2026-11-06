#!/bin/sh
set -eu

review_password_file="${ASKRIGOR_RESEARCH_REVIEW_PASSWORD_FILE:?research review password file is required}"
migrator_password_file="${POSTGRES_PASSWORD_FILE:?migrator password file is required}"
review_password="$(tr -d '\r\n' < "$review_password_file")"
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

validate_hex_password "research review" "$review_password"
validate_hex_password "living-evidence migrator" "$migrator_password"

PGPASSWORD="$migrator_password" psql \
  --host 127.0.0.1 \
  --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<SQL
DO \$role\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_research_review') THEN
    EXECUTE 'ALTER ROLE askrigor_research_review LOGIN PASSWORD ''${review_password}'''
      || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  ELSE
    EXECUTE 'CREATE ROLE askrigor_research_review LOGIN PASSWORD ''${review_password}'''
      || ' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  END IF;
END
\$role\$;

REVOKE ALL ON DATABASE askrigor_living_evidence FROM askrigor_research_review;
GRANT CONNECT ON DATABASE askrigor_living_evidence TO askrigor_research_review;
REVOKE TEMPORARY ON DATABASE askrigor_living_evidence FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM askrigor_research_review;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA living_evidence FROM askrigor_research_review;
GRANT USAGE ON SCHEMA living_evidence TO askrigor_research_review;
REVOKE ALL ON ALL TABLES IN SCHEMA living_evidence FROM askrigor_research_review;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA living_evidence FROM askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_research_contribution_proposal(uuid)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.decide_research_contribution_proposal(
  uuid, text, text, text, timestamptz, uuid
) TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_research_contribution_context(uuid)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_cards(integer[])
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.decide_atlas_card_item(
  integer, text, integer, text, text, text, timestamptz, uuid, jsonb, text, text
) TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.record_atlas_finding_intent(
  uuid, text, text, jsonb, text, text, timestamptz, uuid
) TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_finding_intents(text[])
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.forget_atlas_cards(integer[], timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.hold_youtube_findings(
  integer, text, timestamptz, jsonb, text, text, text
) TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_held_youtube_findings(integer[])
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_cardless_held_youtube_findings(timestamptz, text, integer)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.delete_held_youtube_findings(integer[])
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.delete_cardless_held_youtube_findings(text[])
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.delete_all_held_youtube_findings()
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_publications(
  text[], integer[], text[], text[], bigint, integer
) TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.publish_atlas_findings(integer, text, jsonb, timestamptz, boolean)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.decide_atlas_publications(integer, integer, text, text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.edit_atlas_publications(text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.withdraw_atlas_publications(integer[], text[], text, text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.erase_atlas_publication_texts(text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_comments(boolean, bigint, integer)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.moderate_atlas_comment(text, text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.set_atlas_commenter_stopped(text, boolean, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.set_atlas_home_picks(jsonb, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_home_picks()
  TO askrigor_research_review;
-- Owner answers 229a and 231a (migration 0024): findings kept for AskRigor's research only.
GRANT EXECUTE ON FUNCTION living_evidence.keep_atlas_publications(text[], text[], boolean, text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_kept_publications()
  TO askrigor_research_review;
-- Owner answer 229a (migration 0025): where items sit under Health.
GRANT EXECUTE ON FUNCTION living_evidence.set_atlas_placements(jsonb, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_placements()
  TO askrigor_research_review;
-- Owner answer 229a (migration 0026): the check's queue and its verdicts on people's reports.
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_reports(text, bigint, integer)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.decide_atlas_report(text, text, text, text, jsonb, text, text, timestamptz)
  TO askrigor_research_review;
-- The owner, 3 Nov (migration 0027): a problem's rows at a glance, each shown on the owner's yes.
GRANT EXECUTE ON FUNCTION living_evidence.propose_atlas_glance_row(jsonb, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.set_atlas_glance_row_state(text, text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_glance_rows(text, bigint, integer)
  TO askrigor_research_review;
-- The owner, 6 Nov (migration 0030): findings that challenge the usual view, marked and cleared by P number.
GRANT EXECUTE ON FUNCTION living_evidence.mark_atlas_challenges(text[], text, text, text, text, text, timestamptz)
  TO askrigor_research_review;
GRANT EXECUTE ON FUNCTION living_evidence.inspect_atlas_challenges()
  TO askrigor_research_review;
ALTER ROLE askrigor_research_review SET statement_timeout = '5s';
ALTER ROLE askrigor_research_review SET idle_in_transaction_session_timeout = '5s';
ALTER ROLE askrigor_research_review SET search_path = living_evidence, pg_catalog;
SQL

unset review_password migrator_password
