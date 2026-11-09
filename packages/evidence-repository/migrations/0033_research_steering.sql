SET search_path TO __SCHEMA__, public;

-- Owner answer 279a (9 November 2026), from the owner's report AskRigor#434: a research style each account sets once,
-- for every research it runs. research_style is how often the AI stops to ask (guided: at the framing and before every
-- long task; balanced, the default: only questions that could redirect the research, and the menu of next tasks when
-- the rest would take more than about five minutes; autonomous: on through the passes, checking back after the time
-- allowance). check_back_minutes is that allowance, 10 by default. adjustment_detail is how much the answer says about
-- what each key observational study adjusted for (the owner: "default balanced mode might only mention the adjustments
-- you think on a quick check look potentially inappropriate or controversial"): flagged, the default, or all. These are
-- settings only; nothing of any research is stored here. Safe to run again: the columns come once, the check by name.
ALTER TABLE research_use_accounts
  ADD COLUMN IF NOT EXISTS research_style text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS check_back_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS adjustment_detail text NOT NULL DEFAULT 'flagged';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'research_use_accounts_steering_check'
      AND conrelid = 'research_use_accounts'::regclass
  ) THEN
    ALTER TABLE research_use_accounts
      ADD CONSTRAINT research_use_accounts_steering_check CHECK (
        research_style IN ('guided', 'balanced', 'autonomous')
        AND check_back_minutes BETWEEN 1 AND 120
        AND adjustment_detail IN ('flagged', 'all')
      );
  END IF;
END
$$;

COMMENT ON COLUMN research_use_accounts.research_style IS
  'How often research stops to ask the person (owner answer 279a): guided, balanced (the default) or autonomous. A setting only.';
COMMENT ON COLUMN research_use_accounts.check_back_minutes IS
  'Minutes of research before the AI checks back with the person, 1 to 120, 10 by default (owner answer 279a). A setting only.';
COMMENT ON COLUMN research_use_accounts.adjustment_detail IS
  'What the answer says about the variables key observational studies adjusted for (owner answer 279a): flagged (only doubtful ones, the default) or all. A setting only.';
