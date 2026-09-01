CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE UNIQUE INDEX IF NOT EXISTS research_contribution_proposals_identity_idx
  ON research_contribution_proposals
  (proposal_id, proposal_kind, payload_sha256);

CREATE TABLE IF NOT EXISTS research_contribution_promotions (
  promotion_id uuid PRIMARY KEY,
  proposal_id uuid NOT NULL UNIQUE,
  proposal_kind text NOT NULL CHECK (
    proposal_kind IN ('RESEARCH_FRONTIER', 'SOURCE_ANALYSIS')
  ),
  reviewed_payload_sha256 char(64) NOT NULL
    CHECK (reviewed_payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('PENDING', 'COMPLETED')),
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  receipt_json jsonb,
  receipt_sha256 char(64)
    CHECK (receipt_sha256 IS NULL OR receipt_sha256 ~ '^[a-f0-9]{64}$'),
  FOREIGN KEY (proposal_id, proposal_kind, reviewed_payload_sha256)
    REFERENCES research_contribution_proposals
    (proposal_id, proposal_kind, payload_sha256),
  CHECK (
    (status = 'PENDING' AND completed_at IS NULL
      AND receipt_json IS NULL AND receipt_sha256 IS NULL)
    OR
    (status = 'COMPLETED' AND completed_at IS NOT NULL
      AND receipt_json IS NOT NULL
      AND jsonb_typeof(receipt_json) = 'object'
      AND receipt_sha256 IS NOT NULL)
  ),
  CHECK (completed_at IS NULL OR created_at <= completed_at)
);

CREATE INDEX IF NOT EXISTS research_contribution_promotions_pending_idx
  ON research_contribution_promotions (created_at, promotion_id)
  WHERE status = 'PENDING';

COMMENT ON TABLE research_contribution_promotions IS
  'Hash-bound promotion intents created only by explicit owner acceptance. The public review runtime cannot perform canonical writes; a separate one-shot administrator completes the intent and stores its exact receipt.';

CREATE OR REPLACE FUNCTION inspect_research_contribution_proposal(
  target_proposal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  proposal_id uuid,
  proposal_kind text,
  payload_sha256 text,
  payload_json jsonb,
  privacy_boundary_json jsonb,
  partial boolean,
  proposal_status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  review_reason text,
  promotion_id uuid,
  promotion_status text,
  promotion_created_at timestamptz,
  promotion_completed_at timestamptz,
  promotion_receipt_json jsonb,
  promotion_receipt_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
  SELECT proposal.proposal_id,
         proposal.proposal_kind,
         proposal.payload_sha256::text,
         proposal.payload_json,
         proposal.privacy_boundary_json,
         proposal.partial,
         proposal.status,
         proposal.created_at,
         proposal.reviewed_at,
         proposal.review_reason,
         promotion.promotion_id,
         promotion.status,
         promotion.created_at,
         promotion.completed_at,
         promotion.receipt_json,
         promotion.receipt_sha256::text
    FROM research_contribution_proposals proposal
    LEFT JOIN research_contribution_promotions promotion
      ON promotion.proposal_id = proposal.proposal_id
   WHERE proposal.proposal_id = COALESCE(
     target_proposal_id,
     (
       SELECT pending.proposal_id
         FROM research_contribution_proposals pending
        WHERE pending.status = 'PENDING_REVIEW'
        ORDER BY pending.created_at, pending.proposal_id
        LIMIT 1
     )
   )
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION inspect_research_contribution_proposal(uuid)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION decide_research_contribution_proposal(
  target_proposal_id uuid,
  expected_payload_sha256 text,
  review_decision text,
  supplied_review_reason text,
  review_time timestamptz,
  requested_promotion_id uuid DEFAULT NULL
)
RETURNS TABLE (
  proposal_id uuid,
  proposal_kind text,
  payload_sha256 text,
  payload_json jsonb,
  privacy_boundary_json jsonb,
  partial boolean,
  proposal_status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  review_reason text,
  promotion_id uuid,
  promotion_status text,
  promotion_created_at timestamptz,
  promotion_completed_at timestamptz,
  promotion_receipt_json jsonb,
  promotion_receipt_sha256 text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  current_proposal research_contribution_proposals%ROWTYPE;
  desired_status text;
BEGIN
  IF target_proposal_id IS NULL
     OR expected_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR review_decision NOT IN ('ACCEPT', 'REJECT')
     OR supplied_review_reason IS NULL
     OR supplied_review_reason <> btrim(supplied_review_reason)
     OR length(supplied_review_reason) < 1
     OR length(supplied_review_reason) > 2000
     OR review_time IS NULL
     OR (review_decision = 'ACCEPT' AND requested_promotion_id IS NULL)
     OR (review_decision = 'REJECT' AND requested_promotion_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'RESEARCH_CONTRIBUTION_REVIEW_INPUT_INVALID';
  END IF;

  SELECT *
    INTO current_proposal
    FROM research_contribution_proposals
   WHERE research_contribution_proposals.proposal_id = target_proposal_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESEARCH_CONTRIBUTION_PROPOSAL_NOT_FOUND';
  END IF;
  IF current_proposal.payload_sha256::text <> expected_payload_sha256 THEN
    RAISE EXCEPTION 'RESEARCH_CONTRIBUTION_REVIEW_PAYLOAD_MISMATCH';
  END IF;

  desired_status := CASE review_decision
    WHEN 'ACCEPT' THEN 'ACCEPTED'
    ELSE 'REJECTED'
  END;

  IF current_proposal.status = 'PENDING_REVIEW' THEN
    UPDATE research_contribution_proposals
       SET status = desired_status,
           reviewed_at = review_time,
           review_reason = supplied_review_reason
     WHERE research_contribution_proposals.proposal_id = target_proposal_id;
    IF review_decision = 'ACCEPT' THEN
      INSERT INTO research_contribution_promotions
        (promotion_id, proposal_id, proposal_kind, reviewed_payload_sha256,
         status, created_at, completed_at, receipt_json, receipt_sha256)
      VALUES
        (requested_promotion_id, current_proposal.proposal_id,
         current_proposal.proposal_kind, current_proposal.payload_sha256,
         'PENDING', review_time, NULL, NULL, NULL);
    END IF;
  ELSIF current_proposal.status <> desired_status
     OR current_proposal.review_reason <> supplied_review_reason
  THEN
    RAISE EXCEPTION 'RESEARCH_CONTRIBUTION_REVIEW_CONFLICT';
  ELSIF review_decision = 'ACCEPT' AND NOT EXISTS (
    SELECT 1
      FROM research_contribution_promotions promotion
     WHERE promotion.proposal_id = target_proposal_id
       AND promotion.proposal_kind = current_proposal.proposal_kind
       AND promotion.reviewed_payload_sha256 = current_proposal.payload_sha256
  ) THEN
    RAISE EXCEPTION 'RESEARCH_CONTRIBUTION_PROMOTION_INTENT_MISSING';
  END IF;

  RETURN QUERY
  SELECT inspected.*
    FROM inspect_research_contribution_proposal(target_proposal_id) inspected;
END
$function$;

REVOKE ALL ON FUNCTION decide_research_contribution_proposal(
  uuid, text, text, text, timestamptz, uuid
) FROM PUBLIC;
