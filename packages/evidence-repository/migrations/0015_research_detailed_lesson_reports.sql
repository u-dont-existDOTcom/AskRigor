SET search_path TO __SCHEMA__, public;

-- Owner question 154 (2026-10-21): "i would not give everyone a long report like that in chat unless they turn that
-- on in askrigor settings". A lesson sent through the MCP connector may carry a detailed report of the failure only
-- when its account has turned detailed lesson reports on; they are off by default and each account may turn them on
-- or off. This column holds only that choice: a report is stored only in the private lessons repository, never here.
-- Safe to run again.
ALTER TABLE research_use_accounts
  ADD COLUMN IF NOT EXISTS detailed_lesson_reports boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN research_use_accounts.detailed_lesson_reports IS
  'Whether this account''s connector lessons may carry a detailed report (owner question 154), off by default. A setting only; no report is stored here.';
