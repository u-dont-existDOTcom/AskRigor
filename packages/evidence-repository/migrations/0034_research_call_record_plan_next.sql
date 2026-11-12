SET search_path TO __SCHEMA__, public;

-- Owner answer 289a (12 November 2026): the call record also keeps plan_research's decision, ask or go_on: one fixed
-- value per manage_research_access call with action plan_research, taken from AskRigor's own result
-- (researchMenu.next), never from anything the person or the AI wrote. The owner's call record of 11 November showed
-- ChatGPT never calling plan_research; with the decision kept, a record also tells an ask that was ignored from a menu
-- that said to go on. NULL for every other call, which the check enforces. Safe to run again: the column comes once,
-- the check by name.
ALTER TABLE research_call_record
  ADD COLUMN IF NOT EXISTS plan_next text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'research_call_record_plan_next_check'
      AND conrelid = 'research_call_record'::regclass
  ) THEN
    ALTER TABLE research_call_record
      ADD CONSTRAINT research_call_record_plan_next_check CHECK (
        plan_next IS NULL
        OR (
          plan_next IN ('ask', 'go_on')
          AND tool = 'manage_research_access'
          -- A NULL action would leave the comparison NULL, which a check admits.
          AND action IS NOT NULL
          AND action = 'plan_research'
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN research_call_record.plan_next IS
  'plan_research''s decision from AskRigor''s own result, ask or go_on (owner answer 289a); NULL for every other call.';

REVOKE ALL ON TABLE research_call_record FROM PUBLIC;
-- The canonical reader's default table grants must not expose this private account record.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE research_call_record FROM askrigor_reader;
  END IF;
END
$$;
