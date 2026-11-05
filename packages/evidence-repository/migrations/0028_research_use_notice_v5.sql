SET search_path TO __SCHEMA__, public;

-- Owner answer 253a (2026-11-05): free contributor notice v5 says a findings card's summary of what public online
-- communities reported holds the communities, counts of what people reported and links to the forum threads AskRigor
-- read, never their posts or names, YouTube comments or video IDs. Accounts that accepted v1 to v4 keep their rows and
-- accept v5 before free research continues; the service enforces that, and a card saved under an earlier version stores
-- no thread links. This check admits all five. Renumber this migration when the Atlas stack next takes in main (main's
-- last is 0024; this stack holds 0025 to 0029).
--
-- Keep 0011's constraint name. Every migrate applies 0011, 0016 and 0020 again first; none of them replaces a check
-- that already admits its version. Replace the check only while it lacks v5, inside the migration's transaction. Safe
-- to run again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND conname = 'research_use_accounts_free_notice_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%free-contributor-v5-2026-11-05%'
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
          notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30', 'free-contributor-v3-2026-10-22', 'free-contributor-v4-2026-10-25', 'free-contributor-v5-2026-11-05')
          AND agreement_json <> '{}'::jsonb
        )
      );
  END IF;
END
$$;
