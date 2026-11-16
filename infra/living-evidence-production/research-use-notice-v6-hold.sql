-- Image rollback below the free contributor notice v6 (owner answer 307b): an
-- earlier image, from the v5 release up to the last one before v6, reads only
-- notice v1 (free-contributor-v1-2026-09-01),
-- v2 (free-contributor-v2-2026-09-30), v3 (free-contributor-v3-2026-10-22),
-- v4 (free-contributor-v4-2026-10-25) and v5 (free-contributor-v5-2026-11-05)
-- and fails the access check of any account whose row carries v6
-- (free-contributor-v6-2026-11-15). Run this as the migrator before the earlier
-- image serves, and once more right after it serves:
--
--   psql -v schema=living_evidence -f research-use-notice-v6-hold.sql
--
-- In production the file is piped to psql in the PostgreSQL container (the
-- release plan, docs/superpowers/plans/2026-10-01-pr246-production-release.md,
-- has the exact command; infra/living-evidence-production/README.md has the
-- rollback order).
--
-- It copies each v6 row to research_use_notice_v6_hold and marks the account
-- REVOKED, a state the earlier image reads and lets the person leave by
-- accepting its notice, v5. research-use-notice-v6-restore.sql puts back, once
-- an image that reads v6 serves again, every account still exactly in that
-- held state. Safe to run again. Nothing is deleted and no other table
-- changes: entitlements and proposals keep their account rows, Atlas rows and
-- the findings cards keep their links, a video that a person named among them,
-- and the hold table stores no kind of data the account table did not already
-- hold. Only its owner, the migrator, can read it: the script removes every
-- other grant, including default-privilege ones.
--
-- How the notice was accepted (notice_accepted_by and notice_accepted_at,
-- migration 0031) is not held: the account table's trigger clears the pair
-- when this script moves activated_at, and the restore leaves it cleared, so a
-- restored account's way of acceptance reads as not recorded, never as a stale
-- value. That holds for the owner's own login too, whose v6 row the owner's
-- standing instruction of 6 November 2026 accepted.
--
-- Once migration 0037 (AskRigor#477, private research dossiers) is applied,
-- marking an account REVOKED here fires research_dossiers_withdraw_on_revocation,
-- which withdraws for good the account's dossier versions still waiting for
-- review; the restore cannot undo that. Stop research-mcp and turn the trigger
-- off around each run, as infra/living-evidence-production/README.md says
-- (its 0037 rollback hazards), or roll back no lower than an image that reads
-- v6, which needs no hold.
\set ON_ERROR_STOP on
SET search_path TO :"schema", public;

BEGIN;

CREATE TABLE IF NOT EXISTS research_use_notice_v6_hold (
  account_key char(64) PRIMARY KEY
    REFERENCES research_use_accounts(account_key),
  status text NOT NULL,
  mode text,
  notice_version text NOT NULL,
  agreement_json jsonb NOT NULL,
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  held_at timestamptz NOT NULL
);

COMMENT ON TABLE research_use_notice_v6_hold IS
  'Free contributor notice v6 rows held during an image rollback to an image that reads only v1 to v5; restored by research-use-notice-v6-restore.sql.';

REVOKE ALL ON TABLE research_use_notice_v6_hold FROM PUBLIC;

-- Default privileges can grant other roles access to every table the migrator
-- creates (the read-only reader role gets SELECT that way). Remove every grant
-- on the hold table except the owner's own.
DO $$
DECLARE
  grantee_role text;
BEGIN
  FOR grantee_role IN
    SELECT DISTINCT acl.grantee::regrole::text
    FROM pg_class AS class, aclexplode(class.relacl) AS acl
    WHERE class.oid = 'research_use_notice_v6_hold'::regclass
      AND acl.grantee <> 0
      AND acl.grantee <> class.relowner
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE research_use_notice_v6_hold FROM %s', grantee_role);
  END LOOP;
END
$$;

-- held_at is the marker the restore matches: the account's revoked_at and
-- updated_at both equal it until the person changes the account.
INSERT INTO research_use_notice_v6_hold (
  account_key, status, mode, notice_version, agreement_json,
  activated_at, revoked_at, created_at, updated_at, held_at
)
SELECT
  account_key, status, mode, notice_version, agreement_json,
  activated_at, revoked_at, created_at, updated_at,
  GREATEST(now(), created_at, updated_at)
FROM research_use_accounts
WHERE notice_version = 'free-contributor-v6-2026-11-15'
ON CONFLICT (account_key) DO NOTHING;

UPDATE research_use_accounts AS account
SET status = 'REVOKED',
    mode = NULL,
    notice_version = NULL,
    agreement_json = '{}'::jsonb,
    activated_at = NULL,
    revoked_at = hold.held_at,
    updated_at = hold.held_at
FROM research_use_notice_v6_hold AS hold
WHERE account.account_key = hold.account_key
  AND account.notice_version = 'free-contributor-v6-2026-11-15';

COMMIT;

SELECT count(*) AS held_accounts FROM research_use_notice_v6_hold;
