SET search_path TO __SCHEMA__, public;

-- Owner answer 171, default 5: the regression harness turns a dev account's card saving off before a run and on
-- afterwards. This column holds only that choice, on by default; no findings card is stored here. Safe to run again.
ALTER TABLE research_use_accounts
  ADD COLUMN IF NOT EXISTS findings_save boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN research_use_accounts.findings_save IS
  'Whether this account saves findings cards, on by default; changed only through the dev-account setting (owner answer 171). A setting only; no findings card is stored here.';
