SET search_path TO __SCHEMA__, public;

-- Owner decision Q11 (2026-09-30): free use also saves each finished answer's
-- findings card, so the free contributor notice has a second version. An
-- account that accepted the first keeps its row and accepts the second before
-- free research continues; the service enforces that, and this constraint
-- admits exactly the two versions. Safe to run again.
DO $$
DECLARE
  stale record;
BEGIN
  FOR stale IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'research_use_accounts'::regclass
      AND contype = 'c'
      AND conname <> 'research_use_accounts_free_notice_check'
      AND pg_get_constraintdef(oid) LIKE '%free-contributor-v1-2026-09-01%'
  LOOP
    EXECUTE format('ALTER TABLE research_use_accounts DROP CONSTRAINT %I', stale.conname);
  END LOOP;
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
          notice_version IN ('free-contributor-v1-2026-09-01', 'free-contributor-v2-2026-09-30')
          AND agreement_json <> '{}'::jsonb
        )
      );
  END IF;
END
$$;
