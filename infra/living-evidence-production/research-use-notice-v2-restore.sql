-- Undo research-use-notice-v2-hold.sql once an image that reads the free
-- contributor notice v2 serves again. Run as the migrator:
--
--   psql -v schema=living_evidence -f research-use-notice-v2-restore.sql
--
-- In production the file is piped to psql in the PostgreSQL container (the
-- release plan, docs/superpowers/plans/2026-10-01-pr246-production-release.md,
-- has the exact command).
--
-- Never run it while a v1-only image serves: restored v2 rows would fail its
-- access checks again. An account restores only if it is still exactly in the
-- held state. One the person changed meanwhile (accepted v1 again, chose paid
-- private, or revoked) keeps its newer row, and under v2 it is asked to accept
-- v2 as usual. The hold table is emptied either way. Safe to run again.
\set ON_ERROR_STOP on
SET search_path TO :"schema", public;

SELECT to_regclass('research_use_notice_v2_hold') IS NOT NULL AS hold_exists \gset
\if :hold_exists
BEGIN;

UPDATE research_use_accounts AS account
SET status = hold.status,
    mode = hold.mode,
    notice_version = hold.notice_version,
    agreement_json = hold.agreement_json,
    activated_at = hold.activated_at,
    revoked_at = hold.revoked_at,
    updated_at = hold.updated_at
FROM research_use_notice_v2_hold AS hold
WHERE account.account_key = hold.account_key
  AND account.status = 'REVOKED'
  AND account.mode IS NULL
  AND account.notice_version IS NULL
  AND account.revoked_at = hold.held_at
  AND account.updated_at = hold.held_at;

DELETE FROM research_use_notice_v2_hold;

COMMIT;

SELECT count(*) AS still_held FROM research_use_notice_v2_hold;
\else
\echo 'No research_use_notice_v2_hold table: nothing to restore.'
\endif
