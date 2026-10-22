SET search_path TO __SCHEMA__, public;

-- Owner answer 143a (2026-10-21): "ask on paid private accounts, in the same sentence as the save offer, so one yes
-- saves the findings card and files the map". A paid private account files this research's map, a RESEARCH_FRONTIER
-- proposal, only with the user's yes to the answer's offer to file it. The service checks the finalization receipt
-- of the final check that made the offer (signed for this account, unexpired, its offer naming the map) and stores
-- that receipt's SHA-256 here; the receipt itself is never stored. One yes files one map. A free contributor's
-- proposals are filed under the agreement and carry none. Safe to run again.
ALTER TABLE research_contribution_proposals
  ADD COLUMN IF NOT EXISTS consent_receipt_sha256 char(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'research_contribution_proposals'::regclass
      AND conname = 'research_contribution_proposals_v3_consent_check'
  ) THEN
    ALTER TABLE research_contribution_proposals
      ADD CONSTRAINT research_contribution_proposals_v3_consent_check CHECK (
        consent_receipt_sha256 IS NULL
        OR (consent_receipt_sha256 ~ '^[a-f0-9]{64}$' AND proposal_kind = 'RESEARCH_FRONTIER')
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS research_contribution_proposals_consent_idx
  ON research_contribution_proposals (consent_receipt_sha256)
  WHERE consent_receipt_sha256 IS NOT NULL;

COMMENT ON COLUMN research_contribution_proposals.consent_receipt_sha256 IS
  'A paid private research map only (owner answer 143a): the SHA-256 of the finalization receipt whose offer to file it the user said yes to. One yes files one map; no receipt is stored.';

-- 0009's guard admitted active free contributors only. It now also admits an active paid private account's research
-- map filed with the user's yes, and nothing else from that account; every 0009 run is followed by this one, so this
-- body is the one in force.
CREATE OR REPLACE FUNCTION enforce_research_contribution_proposal_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  account_status text;
  account_mode text;
BEGIN
  SELECT status, mode
    INTO account_status, account_mode
    FROM research_use_accounts
   WHERE account_key = NEW.account_key
   FOR KEY SHARE;
  IF NOT FOUND OR account_status <> 'ACTIVE'
     OR account_mode IS NULL OR account_mode NOT IN ('FREE_CONTRIBUTOR', 'PAID_PRIVATE') THEN
    RAISE EXCEPTION 'RESEARCH_PROPOSAL_ACCOUNT_NOT_FREE_ACTIVE';
  END IF;
  IF account_mode = 'FREE_CONTRIBUTOR' AND NEW.consent_receipt_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'RESEARCH_PROPOSAL_CONSENT_NOT_PAID_PRIVATE';
  END IF;
  IF account_mode = 'PAID_PRIVATE'
     AND (NEW.proposal_kind <> 'RESEARCH_FRONTIER' OR NEW.consent_receipt_sha256 IS NULL) THEN
    RAISE EXCEPTION 'RESEARCH_PROPOSAL_PAID_PRIVATE_CONSENT_REQUIRED';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION enforce_research_contribution_proposal_account()
  FROM PUBLIC;
