SET search_path TO __SCHEMA__, public;

-- The owner, 6 November 2026: "can we make it so that i don't have to keep accepting the askrigor notice every time
-- you update?" A free account's row now records how the notice it holds was accepted: by the person, or, for the
-- owner's own login only, by the owner's standing instruction of that date. notice_accepted_at is the acceptance time
-- and always equals activated_at; a write that changes activated_at without it (an image from before this migration,
-- which knows neither column, or a hold or restore script) clears both, so the record shows "not recorded" rather than
-- a stale way of acceptance. A notice that changed only in wording since an account's yes carries that yes forward
-- without any write: the service decides it from each version's declared materiality, and the row keeps the version
-- the person accepted. Safe to run again: the columns and the backfill come once, the check and trigger by name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'research_use_accounts'
      AND column_name = 'notice_accepted_by'
  ) THEN
    ALTER TABLE research_use_accounts
      ADD COLUMN notice_accepted_by text,
      ADD COLUMN notice_accepted_at timestamptz;
    -- Until now only the person's own yes made a free account, at activated_at.
    UPDATE research_use_accounts
       SET notice_accepted_by = 'PERSON',
           notice_accepted_at = activated_at
     WHERE status = 'ACTIVE'
       AND mode = 'FREE_CONTRIBUTOR'
       AND activated_at IS NOT NULL;
  END IF;
END
$$;

COMMENT ON COLUMN research_use_accounts.notice_accepted_by IS
  'How a free account''s notice was accepted: PERSON, or OWNER_STANDING_INSTRUCTION_2026_11_06 for the owner''s own login only. NULL when not recorded or not a free account.';
COMMENT ON COLUMN research_use_accounts.notice_accepted_at IS
  'When notice_accepted_by took effect; always equal to activated_at, or NULL with it.';

CREATE OR REPLACE FUNCTION research_use_accounts_notice_acceptance()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.mode IS DISTINCT FROM 'FREE_CONTRIBUTOR'
     OR NEW.notice_accepted_at IS DISTINCT FROM NEW.activated_at THEN
    NEW.notice_accepted_by := NULL;
    NEW.notice_accepted_at := NULL;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION research_use_accounts_notice_acceptance() FROM PUBLIC;

DROP TRIGGER IF EXISTS research_use_accounts_notice_acceptance ON research_use_accounts;
CREATE TRIGGER research_use_accounts_notice_acceptance
  BEFORE INSERT OR UPDATE ON research_use_accounts
  FOR EACH ROW EXECUTE FUNCTION research_use_accounts_notice_acceptance();

DO $$
BEGIN
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
          AND notice_accepted_by IN ('PERSON', 'OWNER_STANDING_INSTRUCTION_2026_11_06')
        )
      );
  END IF;
END
$$;
