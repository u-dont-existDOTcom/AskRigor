SET search_path TO __SCHEMA__, public;

-- Owner answer 138b (2026-10-20): "a conflicting record is marked failed with its reason and stops blocking the
-- queue". A promotion whose canonical write conflicts deterministically ends FAILED with one code from a closed list
-- (never free text or payload content) and the time it failed; the runner then moves to the next accepted intent. A
-- transient error leaves the intent PENDING for the next activation. Safe to run again.

ALTER TABLE research_contribution_promotions
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

DO $$
DECLARE
  stale record;
BEGIN
  -- 0010's unnamed status and state checks admit only PENDING and COMPLETED; the named checks below replace them.
  FOR stale IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'research_contribution_promotions'::regclass
      AND contype = 'c'
      AND conname NOT LIKE 'research_contribution_promotions_v2_%'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE research_contribution_promotions DROP CONSTRAINT %I', stale.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'research_contribution_promotions'::regclass
      AND conname = 'research_contribution_promotions_v2_state_check'
  ) THEN
    ALTER TABLE research_contribution_promotions
      ADD CONSTRAINT research_contribution_promotions_v2_state_check CHECK (
        (status = 'PENDING' AND completed_at IS NULL
          AND receipt_json IS NULL AND receipt_sha256 IS NULL
          AND failure_code IS NULL AND failed_at IS NULL)
        OR
        (status = 'COMPLETED' AND completed_at IS NOT NULL
          AND receipt_json IS NOT NULL
          AND jsonb_typeof(receipt_json) = 'object'
          AND receipt_sha256 IS NOT NULL
          AND failure_code IS NULL AND failed_at IS NULL)
        OR
        (status = 'FAILED' AND completed_at IS NULL
          AND receipt_json IS NULL AND receipt_sha256 IS NULL
          AND failure_code IS NOT NULL AND failed_at IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'research_contribution_promotions'::regclass
      AND conname = 'research_contribution_promotions_v2_failed_at_check'
  ) THEN
    ALTER TABLE research_contribution_promotions
      ADD CONSTRAINT research_contribution_promotions_v2_failed_at_check
      CHECK (failed_at IS NULL OR created_at <= failed_at);
  END IF;
  -- The closed list of failure codes, in step with RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES; replaced on every
  -- run so the list here is always the one in force.
  ALTER TABLE research_contribution_promotions
    DROP CONSTRAINT IF EXISTS research_contribution_promotions_v2_failure_code_check;
  ALTER TABLE research_contribution_promotions
    ADD CONSTRAINT research_contribution_promotions_v2_failure_code_check CHECK (
      failure_code IS NULL OR failure_code IN (
        'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'FRONTIER_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'PROTOCOL_MANIFEST_CONFLICT',
        'RESEARCH_RUN_CONFLICT',
        'TOPIC_ID_CONFLICT',
        'TOPIC_KEY_CONFLICT',
        'QUESTION_ID_CONFLICT',
        'RESEARCH_FRONTIER_ID_CONFLICT',
        'RESEARCH_FRONTIER_QUESTION_CONFLICT',
        'FRONTIER_LANE_ID_CONFLICT',
        'FRONTIER_LANE_KEY_CONFLICT',
        'FRONTIER_CANDIDATE_INITIAL_VERSION_REQUIRED',
        'FRONTIER_CANDIDATE_ALREADY_HAS_INITIAL_VERSION',
        'FRONTIER_CANDIDATE_ID_CONFLICT',
        'FRONTIER_CANDIDATE_IDENTITY_CONFLICT',
        'FRONTIER_TRAIL_INITIAL_VERSION_REQUIRED',
        'FRONTIER_TRAIL_ALREADY_HAS_INITIAL_VERSION',
        'FRONTIER_TRAIL_ID_CONFLICT',
        'SOURCE_FAMILY_ID_CONFLICT',
        'SOURCE_FAMILY_IDENTITY_CONFLICT',
        'SOURCE_IDENTIFIER_CONFLICT',
        'SOURCE_VERSION_ID_CONFLICT',
        'SOURCE_VERSION_IDENTITY_CONFLICT',
        'ANALYSIS_INITIAL_VERSION_REQUIRED',
        'ANALYSIS_ALREADY_HAS_INITIAL_VERSION',
        'ANALYSIS_TARGET_MISMATCH',
        'CLAIM_INITIAL_VERSION_REQUIRED',
        'CLAIM_ALREADY_HAS_INITIAL_VERSION',
        'CLAIM_ID_CONFLICT',
        'FRESHNESS_POLICY_ID_CONFLICT',
        'ANALYSIS_LINEAGE_MISMATCH',
        'CLAIM_DEPENDENCY_CYCLE',
        'EVIDENCE_BINDING_RECEIPT_SOURCE_MISMATCH',
        'FRONTIER_CANDIDATE_LINEAGE_MISMATCH',
        'FRONTIER_CANDIDATE_SCOPE_MISMATCH',
        'FRONTIER_CANDIDATE_SOURCE_IDENTITY_MISMATCH',
        'FRONTIER_DELTA_PRIOR_COVERAGE_INVALID',
        'FRONTIER_DELTA_RELATION_MISMATCH',
        'FRONTIER_GAP_TRAIL_REQUIRED',
        'FRONTIER_LANE_COVERAGE_BASIS_MISMATCH',
        'FRONTIER_PASS_CANDIDATE_COUNT_MISMATCH',
        'FRONTIER_PASS_SCOPE_MISMATCH',
        'FRONTIER_TRAIL_LINEAGE_MISMATCH',
        'FRONTIER_TRAIL_SCOPE_MISMATCH',
        'FUTURE_ANALYSIS_RESOLUTION_LINEAGE_MISMATCH',
        'FUTURE_ANALYSIS_RESOLUTION_WITHOUT_OPEN_ITEM',
        'SOURCE_LINEAGE_CYCLE',
        'TOPIC_HIERARCHY_CYCLE',
        'CANONICAL_UNIQUE_CONFLICT',
        'CANONICAL_REFERENCE_MISSING',
        'CANONICAL_CHECK_VIOLATION',
        'CANONICAL_VALUE_INVALID'
      )
    );
END
$$;

-- What the review role reads beyond 0010's inspect projection, as one JSON object so later fields need no new
-- function: the promotion's failure. Never an account key.
CREATE OR REPLACE FUNCTION inspect_research_contribution_context(
  target_proposal_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'promotion_failure', (
      SELECT jsonb_build_object(
        'failure_code', promotion.failure_code,
        'failed_at', to_char(promotion.failed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
        FROM research_contribution_promotions promotion
       WHERE promotion.proposal_id = proposal.proposal_id
         AND promotion.status = 'FAILED'
    )
  )
    FROM research_contribution_proposals proposal
   WHERE proposal.proposal_id = target_proposal_id
$function$;

REVOKE ALL ON FUNCTION inspect_research_contribution_context(uuid) FROM PUBLIC;
