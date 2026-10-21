SET search_path TO __SCHEMA__, public;

-- Owner answer 140b (2026-10-20): paid private accounts and the dev accounts the
-- server's settings list register the short answer they would give without
-- AskRigor's tools before research, and the checked answer ends with a note
-- comparing it with that plain answer. The note is on by default and each
-- account may turn it off. This column holds only that choice: the plain answer
-- itself lives in a signed receipt the client carries and is never stored. Safe
-- to run again.
ALTER TABLE research_use_accounts
  ADD COLUMN IF NOT EXISTS plain_answer_note boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN research_use_accounts.plain_answer_note IS
  'Whether a checked answer ends with the note comparing it with the plain answer registered before research (owner answer 140b). A setting only; no plain answer is stored.';
