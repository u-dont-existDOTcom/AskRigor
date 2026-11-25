SET search_path TO __SCHEMA__, public;

-- Owner answer 307b (15 November 2026): free contributor notice v6 says a findings card may link a video that a person
-- named. A saved findings card and its page in the public Atlas may link a YouTube video that a person named themselves
-- (the asker, someone reporting what worked for them, or AskRigor's owner); videos that AskRigor itself finds through
-- YouTube's search stay out, as now; cards still hold no YouTube comments. Version 6 is material, since a card may
-- publish a link it could not hold before: accounts that accepted v1 to v5 keep their rows and accept v6 before free
-- research continues, and the owner's own login accepts it by the owner's standing instruction of 6 November 2026, as
-- migration 0031 records. The service enforces both. This check admits all six.
--
-- Keep 0011's constraint name. Every migrate applies 0011, 0016, 0020 and 0028 again first; none of them replaces a
-- check that already admits its version. Replace the check only while it lacks v6, inside the migration's transaction.
-- Safe to run again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND conname = 'research_use_accounts_free_notice_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v6-2026-11-15%'
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
          notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22', 'free-contributor-v4-2026-10-25', 'free-contributor-v5-2026-11-05', 'free-contributor-v6-2026-11-15')
          AND agreement_json <> '{}'::jsonb
        )
      );
  END IF;
END
$$;
