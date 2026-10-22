-- Image rollback below the free contributor notice v3 (4e90274d and later): an
-- earlier image, such as build 71f09f63, reads only notice v1
-- (free-contributor-v1-2026-09-01) and v2 (free-contributor-v2-2026-09-30) and
-- fails the access check of any account whose row carries v3
-- (free-contributor-v3-2026-10-22). Run this as the migrator before the earlier
-- image serves, and once more right after it serves:
--
--   psql -v schema=living_evidence -f research-use-notice-v3-hold.sql
--
-- In production the file is piped to psql in the PostgreSQL container (the
-- release plan, docs/superpowers/plans/2026-10-01-pr246-production-release.md,
-- has the exact command; infra/living-evidence-production/README.md has the
-- rollback order).
--
-- It copies each v3 row to research_use_notice_v3_hold and marks the account
-- REVOKED, a state the earlier image reads and lets the person leave by
-- accepting its notice, v2. research-use-notice-v3-restore.sql puts back, once
-- an image that reads v3 serves again, every account still exactly in that
-- held state. Safe to run again. Nothing is deleted and no other table
-- changes: entitlements and proposals keep their account rows, Atlas rows stay
-- as they are, and the hold table stores no kind of data the account table did
-- not already hold. Only its owner, the migrator, can read it: the script
-- removes every other grant, including default-privilege ones.
\set ON_ERROR_STOP on
SET search_path TO :"schema", public;

BEGIN;

CREATE TABLE IF NOT EXISTS research_use_notice_v3_hold (
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

COMMENT ON TABLE research_use_notice_v3_hold IS
  'Free contributor notice v3 rows held during an image rollback to an image that reads only v1 and v2; restored by research-use-notice-v3-restore.sql.';

REVOKE ALL ON TABLE research_use_notice_v3_hold FROM PUBLIC;

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
    WHERE class.oid = 'research_use_notice_v3_hold'::regclass
      AND acl.grantee <> 0
      AND acl.grantee <> class.relowner
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE research_use_notice_v3_hold FROM %s', grantee_role);
  END LOOP;
END
$$;

-- held_at is the marker the restore matches: the account's revoked_at and
-- updated_at both equal it until the person changes the account.
INSERT INTO research_use_notice_v3_hold (
  account_key, status, mode, notice_version, agreement_json,
  activated_at, revoked_at, created_at, updated_at, held_at
)
SELECT
  account_key, status, mode, notice_version, agreement_json,
  activated_at, revoked_at, created_at, updated_at,
  GREATEST(now(), created_at, updated_at)
FROM research_use_accounts
WHERE notice_version = 'free-contributor-v3-2026-10-22'
ON CONFLICT (account_key) DO NOTHING;

UPDATE research_use_accounts AS account
SET status = 'REVOKED',
    mode = NULL,
    notice_version = NULL,
    agreement_json = '{}'::jsonb,
    activated_at = NULL,
    revoked_at = hold.held_at,
    updated_at = hold.held_at
FROM research_use_notice_v3_hold AS hold
WHERE account.account_key = hold.account_key
  AND account.notice_version = 'free-contributor-v3-2026-10-22';

COMMIT;

SELECT count(*) AS held_accounts FROM research_use_notice_v3_hold;
