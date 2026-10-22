SET search_path TO __SCHEMA__, public;

-- Owner answers 159 (1b and 7) and 160b (2026-10-22): the free contributor
-- notice has a third version, which says that findings AskRigor's owner accepts
-- may be published in AskRigor's public Atlas, written without the person, what
-- deleting a findings card removes, and that a published finding stays while it
-- is valid. An account that accepted the first or second version keeps its row
-- and accepts the third before free research continues; the service enforces
-- that, and this constraint admits exactly the three versions.
--
-- The constraint keeps the name 0011 gave it: every run applies 0011 again
-- first, and 0011 drops any other check that names the first version, then adds
-- this name only when it is missing. So the constraint is replaced only while it
-- lacks the third version, inside the migration's one transaction. Safe to run
-- again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND conname = 'research_use_accounts_free_notice_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v3-2026-10-22%'
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
          notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22')
          AND agreement_json <> '{}'::jsonb
        )
      );
  END IF;
END
$$;
