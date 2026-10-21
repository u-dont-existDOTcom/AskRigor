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
  -- Named checks (v2 here, and any later version) are never touched, since every migration runs again on each start.
  FOR stale IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'research_contribution_promotions'::regclass
      AND contype = 'c'
      AND conname NOT LIKE 'research_contribution_promotions_v%'
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
        'TOPIC_LINK_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'TOPIC_LINK_TOPIC_MISSING',
        'TOPIC_LINK_CONFLICT',
        'TOPIC_ALIAS_CONFLICT',
        'TOPIC_LINK_ID_CONFLICT',
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

-- Owner answer 138b: "a finished version replaces the same account's draft". A proposal may name the same account's
-- own pending proposal of the same kind that it supersedes; accepting it rejects that draft, "superseded by <id>", in
-- the same transaction (owner question 48's manual flow). Rejecting it leaves the draft as it is.
ALTER TABLE research_contribution_proposals
  ADD COLUMN IF NOT EXISTS supersedes_proposal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'research_contribution_proposals'::regclass
      AND conname = 'research_contribution_proposals_v2_supersedes_fkey'
  ) THEN
    ALTER TABLE research_contribution_proposals
      ADD CONSTRAINT research_contribution_proposals_v2_supersedes_fkey
      FOREIGN KEY (supersedes_proposal_id) REFERENCES research_contribution_proposals (proposal_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'research_contribution_proposals'::regclass
      AND conname = 'research_contribution_proposals_v2_supersedes_check'
  ) THEN
    ALTER TABLE research_contribution_proposals
      ADD CONSTRAINT research_contribution_proposals_v2_supersedes_check
      CHECK (supersedes_proposal_id IS NULL OR supersedes_proposal_id <> proposal_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS research_contribution_proposals_supersedes_idx
  ON research_contribution_proposals (supersedes_proposal_id)
  WHERE supersedes_proposal_id IS NOT NULL;

-- Only the account's own pending proposal of the same kind can be superseded; anything else is refused with one
-- message, which says nothing about whether the UUID names another account's proposal.
CREATE OR REPLACE FUNCTION enforce_research_contribution_supersession()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = __SCHEMA__, pg_catalog
AS $function$
BEGIN
  IF NEW.supersedes_proposal_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM 1
    FROM research_contribution_proposals superseded
   WHERE superseded.proposal_id = NEW.supersedes_proposal_id
     AND superseded.account_key = NEW.account_key
     AND superseded.proposal_kind = NEW.proposal_kind
     AND superseded.status = 'PENDING_REVIEW';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESEARCH_PROPOSAL_SUPERSEDES_NOT_OWN_PENDING';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS research_contribution_proposal_supersession_guard
  ON research_contribution_proposals;
CREATE TRIGGER research_contribution_proposal_supersession_guard
BEFORE INSERT ON research_contribution_proposals
FOR EACH ROW EXECUTE FUNCTION enforce_research_contribution_supersession();

REVOKE ALL ON FUNCTION enforce_research_contribution_supersession() FROM PUBLIC;

-- Owner answer 138b: "merging by meaning (the AI may declare two differently worded topics the same, linked on your
-- acceptance, nothing moved or deleted)". TOPIC_LINK joins the two proposal kinds; the canonical store keeps each
-- owner-accepted link, append-only, beside the alias or edge it wrote.
DO $$
DECLARE
  stale record;
BEGIN
  -- 0009's and 0010's unnamed kind checks admit only RESEARCH_FRONTIER and SOURCE_ANALYSIS; the named checks below
  -- replace them. Named checks are never touched: 0014's consent check names proposal_kind too, and every migration
  -- runs again on each start.
  FOR stale IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE conrelid IN ('research_contribution_proposals'::regclass, 'research_contribution_promotions'::regclass)
      AND contype = 'c'
      AND conname NOT LIKE 'research_contribution_proposals_v%'
      AND conname NOT LIKE 'research_contribution_promotions_v%'
      AND pg_get_constraintdef(oid) LIKE '%proposal_kind%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', stale.table_name, stale.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'research_contribution_proposals'::regclass
      AND conname = 'research_contribution_proposals_v2_kind_check'
  ) THEN
    ALTER TABLE research_contribution_proposals
      ADD CONSTRAINT research_contribution_proposals_v2_kind_check
      CHECK (proposal_kind IN ('RESEARCH_FRONTIER', 'SOURCE_ANALYSIS', 'TOPIC_LINK'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'research_contribution_promotions'::regclass
      AND conname = 'research_contribution_promotions_v2_kind_check'
  ) THEN
    ALTER TABLE research_contribution_promotions
      ADD CONSTRAINT research_contribution_promotions_v2_kind_check
      CHECK (proposal_kind IN ('RESEARCH_FRONTIER', 'SOURCE_ANALYSIS', 'TOPIC_LINK'));
  END IF;
END
$$;

-- fromTopic is <relation> toTopic. "same" wrote each topic's label as the other's alias (none where the two labels are
-- equal or the alias was already there); narrower, broader and related wrote one topic_edges row under link_id.
CREATE TABLE IF NOT EXISTS topic_link_contributions (
  link_id uuid PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  from_topic_id uuid NOT NULL REFERENCES topics(topic_id),
  to_topic_id uuid NOT NULL REFERENCES topics(topic_id),
  relation text NOT NULL CHECK (relation IN ('same', 'narrower', 'broader', 'related')),
  aliases_written integer NOT NULL CHECK (aliases_written BETWEEN 0 AND 2),
  edges_written integer NOT NULL CHECK (edges_written BETWEEN 0 AND 1),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (from_topic_id <> to_topic_id),
  CHECK (
    (relation = 'same' AND edges_written = 0)
    OR (relation <> 'same' AND aliases_written = 0 AND edges_written = 1)
  )
);

CREATE INDEX IF NOT EXISTS topic_link_contributions_topics_idx
  ON topic_link_contributions (from_topic_id, to_topic_id);

DROP TRIGGER IF EXISTS append_only_guard ON topic_link_contributions;
CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON topic_link_contributions
  FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation();

-- 0010's decision, with the supersession step: the same signature and result, so 0010 still applies over itself.
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
      IF current_proposal.supersedes_proposal_id IS NOT NULL THEN
        UPDATE research_contribution_proposals
           SET status = 'REJECTED',
               reviewed_at = review_time,
               review_reason = 'superseded by ' || current_proposal.proposal_id::text
         WHERE research_contribution_proposals.proposal_id = current_proposal.supersedes_proposal_id
           AND research_contribution_proposals.status = 'PENDING_REVIEW'
           AND research_contribution_proposals.account_key = current_proposal.account_key
           AND research_contribution_proposals.proposal_kind = current_proposal.proposal_kind;
      END IF;
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

-- The identities a proposal's payload names, which related proposals share (owner answer 138b): its topic key and
-- ID (a topic link's two), frontier, question, source family, and every candidate or source identifier as
-- scheme:value. In step with proposalKeys in contribution-identity.ts.
CREATE OR REPLACE FUNCTION research_contribution_proposal_keys(payload jsonb)
RETURNS TABLE (key_kind text, key_value text)
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog
AS $function$
  SELECT keys.key_kind, keys.key_value
    FROM (
      SELECT 'topic_key', payload -> 'topic' ->> 'canonicalKey'
      UNION ALL SELECT 'topic_id', payload -> 'topic' ->> 'topicId'
      UNION ALL SELECT 'topic_key', payload -> 'fromTopic' ->> 'canonicalKey'
      UNION ALL SELECT 'topic_id', payload -> 'fromTopic' ->> 'topicId'
      UNION ALL SELECT 'topic_key', payload -> 'toTopic' ->> 'canonicalKey'
      UNION ALL SELECT 'topic_id', payload -> 'toTopic' ->> 'topicId'
      UNION ALL SELECT 'frontier_id', payload -> 'frontier' ->> 'frontierId'
      UNION ALL SELECT 'question_id', payload -> 'question' ->> 'questionId'
      UNION ALL SELECT 'question_id', payload -> 'knowledge' -> 'question' ->> 'questionId'
      UNION ALL SELECT 'source_family_id', payload -> 'source' ->> 'familyId'
      UNION ALL
      SELECT 'identifier', (identifier ->> 'scheme') || ':' || (identifier ->> 'value')
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(payload -> 'frontier' -> 'candidateVersions') = 'array'
                    THEN payload -> 'frontier' -> 'candidateVersions' ELSE '[]'::jsonb END
             ) candidate,
             jsonb_array_elements(
               CASE WHEN jsonb_typeof(candidate -> 'identifiers') = 'array'
                    THEN candidate -> 'identifiers' ELSE '[]'::jsonb END
             ) identifier
      UNION ALL
      SELECT 'identifier', (identifier ->> 'scheme') || ':' || (identifier ->> 'value')
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(payload -> 'source' -> 'identifiers') = 'array'
                    THEN payload -> 'source' -> 'identifiers' ELSE '[]'::jsonb END
             ) identifier
    ) AS keys(key_kind, key_value)
   WHERE keys.key_value IS NOT NULL
$function$;

REVOKE ALL ON FUNCTION research_contribution_proposal_keys(jsonb) FROM PUBLIC;

-- The other proposals pending review, or accepted and queued for promotion, that share an identity with this payload.
CREATE OR REPLACE FUNCTION research_contribution_related_proposals(target_proposal_id uuid, payload jsonb)
RETURNS TABLE (
  proposal_id uuid,
  proposal_kind text,
  status text,
  created_at timestamptz,
  promotion_status text,
  shared jsonb
)
LANGUAGE sql
STABLE
SET search_path = __SCHEMA__, pg_catalog
AS $function$
  SELECT other.proposal_id, other.proposal_kind, other.status, other.created_at, promotion.status,
         to_jsonb(array_agg(DISTINCT other_key.key_kind ORDER BY other_key.key_kind))
    FROM research_contribution_proposals other
    LEFT JOIN research_contribution_promotions promotion ON promotion.proposal_id = other.proposal_id
    CROSS JOIN LATERAL research_contribution_proposal_keys(other.payload_json) other_key
    JOIN research_contribution_proposal_keys(payload) own_key
      ON own_key.key_kind = other_key.key_kind AND own_key.key_value = other_key.key_value
   WHERE other.proposal_id <> target_proposal_id
     AND (other.status = 'PENDING_REVIEW' OR (other.status = 'ACCEPTED' AND promotion.status = 'PENDING'))
   GROUP BY other.proposal_id, other.proposal_kind, other.status, other.created_at, promotion.status
$function$;

REVOKE ALL ON FUNCTION research_contribution_related_proposals(uuid, jsonb) FROM PUBLIC;

-- What the review role reads beyond 0010's inspect projection, as one JSON object so later fields need no new
-- function: the promotion's failure, the supersession links in both directions, and the other proposals still pending
-- review or queued for promotion that share one of its identities, with which kinds of identity they share (proposal
-- IDs only, at most 25, and how many there are). Never an account key.
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
    ),
    'supersedes_proposal_id', proposal.supersedes_proposal_id,
    'superseded_by_proposal_ids', COALESCE((
      SELECT jsonb_agg(replacement.proposal_id ORDER BY replacement.created_at, replacement.proposal_id)
        FROM research_contribution_proposals replacement
       WHERE replacement.supersedes_proposal_id = proposal.proposal_id
         AND replacement.status IN ('PENDING_REVIEW', 'ACCEPTED')
    ), '[]'::jsonb),
    'related_proposals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'proposal_id', related.proposal_id,
               'proposal_kind', related.proposal_kind,
               'status', related.status,
               'promotion_status', related.promotion_status,
               'shared', related.shared
             ) ORDER BY related.created_at, related.proposal_id)
        FROM (
          SELECT shares.* FROM research_contribution_related_proposals(proposal.proposal_id, proposal.payload_json) shares
           ORDER BY shares.created_at, shares.proposal_id
           LIMIT 25
        ) related
    ), '[]'::jsonb),
    'related_proposal_count', (
      SELECT count(*) FROM research_contribution_related_proposals(proposal.proposal_id, proposal.payload_json)
    )
  )
    FROM research_contribution_proposals proposal
   WHERE proposal.proposal_id = target_proposal_id
$function$;

REVOKE ALL ON FUNCTION inspect_research_contribution_context(uuid) FROM PUBLIC;
