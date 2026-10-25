SET search_path TO __SCHEMA__, public;

-- Owner answer 171 (2026-10-25): free contributor notice v4 says free cards
-- publish on save, with an unreviewed label, votes and comments. Deleting a
-- card removes it from the Atlas unless its findings were already accepted.
-- Accounts that accepted v1, v2 or v3 keep their rows and accept v4 before free
-- research continues; the service enforces that. This check admits all four.
--
-- Keep 0011's constraint name. Every migrate applies 0011 and 0016 again first;
-- neither replaces a check that already admits its version. Replace the check
-- only while it lacks v4, inside the migration's transaction. Safe to run again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND conname = 'research_use_accounts_free_notice_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v4-2026-10-25%'
  ) THEN
    ALTER TABLE research_use_accounts
      DROP CONSTRAINT research_use_accounts_free_notice_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND conname = 'research_use_accounts_free_notice_check'
  ) THEN
    ALTER TABLE research_use_accounts
      ADD CONSTRAINT research_use_accounts_free_notice_check CHECK (
        mode <> 'FREE_CONTRIBUTOR'
        OR (
          notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22', 'free-contributor-v4-2026-10-25')
          AND agreement_json <> '{}'::jsonb
        )
      );
  END IF;
END
$$;
