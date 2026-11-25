-- Undo research-use-notice-v6-hold.sql once an image that reads the free
-- contributor notice v6 serves again. Run as the migrator:
--
--   psql -v schema=living_evidence -f research-use-notice-v6-restore.sql
--
-- In production the file is piped to psql in the PostgreSQL container (the
-- release plan, docs/superpowers/plans/2026-10-01-pr246-production-release.md,
-- has the exact command; infra/living-evidence-production/README.md has the
-- order).
--
-- Never run it while an image that reads only v1 to v5 serves: restored v6 rows
-- would fail its access checks again. An account restores only if it is still
-- exactly in the held state. One the person changed meanwhile (accepted v5,
-- chose paid private, or revoked) keeps its newer row, and under v6 a v5 row is
-- asked to accept v6 as usual, or, for the owner's own login, accepts it by the
-- owner's standing instruction of 6 November 2026. The hold table is emptied
-- either way, and no other table changes. Safe to run again.
--
-- How the notice was accepted (notice_accepted_by and notice_accepted_at,
-- migration 0031) is not put back, since the hold does not keep it: a restored
-- account's way of acceptance reads as not recorded.
\set ON_ERROR_STOP on
SET search_path TO :"schema", public;

SELECT to_regclass('research_use_notice_v6_hold') IS NOT NULL AS hold_exists \gset
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
FROM research_use_notice_v6_hold AS hold
WHERE account.account_key = hold.account_key
  AND account.status = 'REVOKED'
  AND account.mode IS NULL
  AND account.notice_version IS NULL
  AND account.revoked_at = hold.held_at
  AND account.updated_at = hold.held_at;

DELETE FROM research_use_notice_v6_hold;

COMMIT;

SELECT count(*) AS still_held FROM research_use_notice_v6_hold;
\else
\echo 'No research_use_notice_v6_hold table: nothing to restore.'
\endif
