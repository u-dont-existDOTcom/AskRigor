SET search_path TO __SCHEMA__, public;

-- Owner answer 419a (26 November 2026): AskRigor's terms page right after a person's first sign-in. A yes given there is
-- recorded exactly as a yes given in an AI app (accept_free_contributor), with how it was given:
-- PERSON_SIGN_IN_PAGE, the person's own yes on that page, beside PERSON (in an AI app) and the owner's standing
-- instruction. Nothing else changes: no column, row, trigger or grant, and a declined page records nothing.
--
-- Keep 0031's constraint name. Every migrate applies 0031 again first, which adds the check only when it is missing, so
-- replace the check only while it lacks PERSON_SIGN_IN_PAGE, inside the migration's transaction. Safe to run again. An
-- image from before this migration cannot read a row holding the new value: before such an image serves, map those rows
-- to PERSON (infra/living-evidence-production/README.md, migration 0044).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND conname = 'research_use_accounts_notice_acceptance_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%PERSON_SIGN_IN_PAGE%'
  ) THEN
    ALTER TABLE research_use_accounts
      DROP CONSTRAINT research_use_accounts_notice_acceptance_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND conname = 'research_use_accounts_notice_acceptance_check'
  ) THEN
    ALTER TABLE research_use_accounts
      ADD CONSTRAINT research_use_accounts_notice_acceptance_check CHECK (
        (notice_accepted_by IS NULL AND notice_accepted_at IS NULL)
        OR (
          mode = 'FREE_CONTRIBUTOR'
          AND notice_accepted_at IS NOT NULL
          AND notice_accepted_at = activated_at
          AND notice_accepted_by IN ('PERSON', 'PERSON_SIGN_IN_PAGE', 'OWNER_STANDING_INSTRUCTION_2026_11_06')
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN research_use_accounts.notice_accepted_by IS
  'How a free account''s notice was accepted: PERSON (in an AI app), PERSON_SIGN_IN_PAGE (on AskRigor''s terms page at sign-in), or OWNER_STANDING_INSTRUCTION_2026_11_06 for the owner''s own login only. NULL when not recorded or not a free account.';
