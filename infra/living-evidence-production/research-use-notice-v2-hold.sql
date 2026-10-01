-- Image rollback below the free contributor notice v2 (PR #246 and later):
-- main's earlier image reads only notice v1 (free-contributor-v1-2026-09-01)
-- and fails the access check of any account whose row carries v2. Run this as
-- the migrator, before the earlier image serves:
--
--   psql -v schema=living_evidence -f research-use-notice-v2-hold.sql
--
-- In production the file is piped to psql in the PostgreSQL container (the
-- release plan, docs/superpowers/plans/2026-10-01-pr246-production-release.md,
-- has the exact command).
--
-- It copies each v2 row to research_use_notice_v2_hold and marks the account
-- REVOKED, a state the earlier image reads and lets the person leave by
-- accepting v1 again. research-use-notice-v2-restore.sql puts back, once an
-- image that reads v2 serves again, every account still exactly in that held
-- state. Safe to run again. Nothing is deleted: entitlements and proposals keep
-- their account rows, and the hold table stores no kind of data the account
-- table did not already hold. Only its owner, the migrator, can read it: the
-- script removes every other grant, including default-privilege ones.
\set ON_ERROR_STOP on
SET search_path TO :"schema", public;

BEGIN;

CREATE TABLE IF NOT EXISTS research_use_notice_v2_hold (
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

COMMENT ON TABLE research_use_notice_v2_hold IS
  'Free contributor notice v2 rows held during an image rollback to a v1-only image; restored by research-use-notice-v2-restore.sql.';

REVOKE ALL ON TABLE research_use_notice_v2_hold FROM PUBLIC;

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
    WHERE class.oid = 'research_use_notice_v2_hold'::regclass
      AND acl.grantee <> 0
      AND acl.grantee <> class.relowner
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE research_use_notice_v2_hold FROM %s', grantee_role);
  END LOOP;
END
$$;

-- held_at is the marker the restore matches: the account's revoked_at and
-- updated_at both equal it until the person changes the account.
INSERT INTO research_use_notice_v2_hold (
  account_key, status, mode, notice_version, agreement_json,
  activated_at, revoked_at, created_at, updated_at, held_at
)
SELECT
  account_key, status, mode, notice_version, agreement_json,
  activated_at, revoked_at, created_at, updated_at,
  GREATEST(now(), created_at, updated_at)
FROM research_use_accounts
WHERE notice_version = 'free-contributor-v2-2026-09-30'
ON CONFLICT (account_key) DO NOTHING;

UPDATE research_use_accounts AS account
SET status = 'REVOKED',
    mode = NULL,
    notice_version = NULL,
    agreement_json = '{}'::jsonb,
    activated_at = NULL,
    revoked_at = hold.held_at,
    updated_at = hold.held_at
FROM research_use_notice_v2_hold AS hold
WHERE account.account_key = hold.account_key
  AND account.notice_version = 'free-contributor-v2-2026-09-30';

COMMIT;

SELECT count(*) AS held_accounts FROM research_use_notice_v2_hold;
