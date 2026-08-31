CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS community_integrity_signals (
  integrity_signal_id text PRIMARY KEY CHECK (integrity_signal_id ~ '^ARINT-[A-Z0-9_-]{8,80}$'),
  kind text NOT NULL CHECK (kind IN (
    'COMMERCIAL_COORDINATION', 'SOCKPUPPET_COORDINATION', 'VOTE_BRIGADING',
    'IMPERSONATION', 'REIDENTIFICATION_ATTEMPT', 'DANGEROUS_INSTRUCTION'
  )),
  target_type text NOT NULL,
  target_id text NOT NULL CHECK (length(target_id) > 0),
  source_meaning_sha256_before char(64) NOT NULL CHECK (source_meaning_sha256_before ~ '^[a-f0-9]{64}$'),
  source_meaning_sha256_after char(64) NOT NULL CHECK (source_meaning_sha256_after ~ '^[a-f0-9]{64}$'),
  verification_state_before text NOT NULL,
  verification_state_after text NOT NULL,
  evidence_capability_before text NOT NULL,
  evidence_capability_after text NOT NULL,
  formal_evidence_relationship_before text NOT NULL,
  formal_evidence_relationship_after text NOT NULL,
  independent_source_count_before integer NOT NULL CHECK (independent_source_count_before >= 0),
  independent_source_count_after integer NOT NULL CHECK (independent_source_count_after >= 0),
  engagement_affects_evidence_state boolean NOT NULL DEFAULT false
    CHECK (engagement_affects_evidence_state = false),
  required_queue_types text[] NOT NULL CHECK (cardinality(required_queue_types) BETWEEN 1 AND 4),
  queue_item_ids text[] NOT NULL CHECK (cardinality(queue_item_ids) = cardinality(required_queue_types)),
  automated_regulatory_reporting boolean NOT NULL DEFAULT false
    CONSTRAINT community_integrity_no_auto_reporting CHECK (automated_regulatory_reporting = false),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  created_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT community_integrity_meaning_immutable CHECK (
    source_meaning_sha256_before = source_meaning_sha256_after
  ),
  CONSTRAINT community_integrity_evidence_immutable CHECK (
    verification_state_before = verification_state_after
    AND evidence_capability_before = evidence_capability_after
    AND formal_evidence_relationship_before = formal_evidence_relationship_after
    AND independent_source_count_before = independent_source_count_after
  ),
  CONSTRAINT community_integrity_kind_queue_gate CHECK (
    (kind IN ('COMMERCIAL_COORDINATION', 'SOCKPUPPET_COORDINATION', 'VOTE_BRIGADING')
      AND required_queue_types @> ARRAY['MODERATION', 'SCIENTIFIC']::text[]
      AND required_queue_types <@ ARRAY['MODERATION', 'SCIENTIFIC']::text[])
    OR (kind IN ('IMPERSONATION', 'REIDENTIFICATION_ATTEMPT')
      AND required_queue_types @> ARRAY['MODERATION', 'PRIVACY']::text[]
      AND required_queue_types <@ ARRAY['MODERATION', 'PRIVACY']::text[])
    OR (kind = 'DANGEROUS_INSTRUCTION'
      AND required_queue_types @> ARRAY['MODERATION', 'SAFETY']::text[]
      AND required_queue_types <@ ARRAY['MODERATION', 'SAFETY']::text[])
  )
);

CREATE OR REPLACE FUNCTION validate_community_integrity_queues()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  matched_count integer;
  matched_types text[];
BEGIN
  SELECT count(*), array_agg(queue_type ORDER BY queue_type)
    INTO matched_count, matched_types
  FROM community_operational_queue_items
  WHERE queue_item_id = ANY (NEW.queue_item_ids)
    AND target_type = NEW.target_type
    AND target_id = NEW.target_id
    AND source_meaning_sha256 = NEW.source_meaning_sha256_before
    AND independent_review_required = true
    AND automated_regulatory_reporting = false;
  IF matched_count <> cardinality(NEW.queue_item_ids)
     OR matched_types <> ARRAY(SELECT unnest(NEW.required_queue_types) ORDER BY 1)
  THEN
    RAISE EXCEPTION 'COMMUNITY_INTEGRITY_QUEUE_SET_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_integrity_queue_gate ON community_integrity_signals;
CREATE TRIGGER community_integrity_queue_gate
BEFORE INSERT ON community_integrity_signals
FOR EACH ROW EXECUTE FUNCTION validate_community_integrity_queues();

CREATE TABLE IF NOT EXISTS community_review_disagreements (
  disagreement_id text PRIMARY KEY CHECK (disagreement_id ~ '^ARDIS-[A-Z0-9_-]{8,64}$'),
  target_type text NOT NULL,
  target_id text NOT NULL CHECK (length(target_id) > 0),
  moderation_event_id text NOT NULL REFERENCES community_moderation_events(event_id),
  moderation_disposition text NOT NULL CHECK (moderation_disposition IN (
    'NO_CONDUCT_ACTION', 'CONDUCT_ACTION_RECORDED', 'APPEAL_PENDING'
  )),
  scientific_annotation_id text NOT NULL REFERENCES community_scientific_annotations(annotation_id),
  scientific_disposition text NOT NULL CHECK (scientific_disposition IN (
    'UNRESOLVED', 'ANNOTATED', 'METHODS_REVIEW_REQUIRED', 'RESOLVED'
  )),
  source_meaning_sha256_before char(64) NOT NULL CHECK (source_meaning_sha256_before ~ '^[a-f0-9]{64}$'),
  source_meaning_sha256_after char(64) NOT NULL CHECK (source_meaning_sha256_after ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'SUPERSEDED')),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  recorded_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT community_review_disagreement_meaning_immutable CHECK (
    source_meaning_sha256_before = source_meaning_sha256_after
  ),
  CONSTRAINT community_review_disagreement_resolution_gate CHECK (
    status <> 'RESOLVED' OR scientific_disposition = 'RESOLVED'
  )
);

CREATE OR REPLACE FUNCTION validate_community_review_disagreement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moderation_target record;
  scientific_target record;
BEGIN
  SELECT target_type, target_id INTO moderation_target
  FROM community_moderation_events WHERE event_id = NEW.moderation_event_id;
  SELECT target_type, target_id INTO scientific_target
  FROM community_scientific_annotations WHERE annotation_id = NEW.scientific_annotation_id;
  IF moderation_target.target_type <> NEW.target_type
     OR moderation_target.target_id <> NEW.target_id
     OR scientific_target.target_type <> NEW.target_type
     OR scientific_target.target_id <> NEW.target_id
  THEN
    RAISE EXCEPTION 'COMMUNITY_REVIEW_DISAGREEMENT_TARGET_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_review_disagreement_gate ON community_review_disagreements;
CREATE TRIGGER community_review_disagreement_gate
BEFORE INSERT ON community_review_disagreements
FOR EACH ROW EXECUTE FUNCTION validate_community_review_disagreement();

CREATE TABLE IF NOT EXISTS community_publication_lifecycle_events (
  lifecycle_event_id text PRIMARY KEY CHECK (lifecycle_event_id ~ '^ARLIFE-[A-Z0-9_-]{8,64}$'),
  public_version_id text NOT NULL REFERENCES community_lead_public_versions(public_version_id),
  lead_id text NOT NULL,
  lead_version integer NOT NULL CHECK (lead_version > 0),
  from_state text,
  to_state text NOT NULL CHECK (to_state IN (
    'DRAFT', 'PRIVACY_REVIEW', 'APPROVED', 'SYNTHETIC_LAB_PROJECTION',
    'CHALLENGED', 'WITHDRAWN', 'SUPERSEDED'
  )),
  visibility_before text NOT NULL CHECK (visibility_before IN ('NOT_VISIBLE', 'SYNTHETIC_LAB_ONLY')),
  visibility_after text NOT NULL CHECK (visibility_after IN ('NOT_VISIBLE', 'SYNTHETIC_LAB_ONLY')),
  verification_state_before text NOT NULL,
  verification_state_after text NOT NULL,
  evidence_capability_before text NOT NULL,
  evidence_capability_after text NOT NULL,
  formal_evidence_relationship_before text NOT NULL,
  formal_evidence_relationship_after text NOT NULL,
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  occurred_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version),
  CONSTRAINT community_publication_lifecycle_evidence_immutable CHECK (
    verification_state_before = verification_state_after
    AND evidence_capability_before = evidence_capability_after
    AND formal_evidence_relationship_before = formal_evidence_relationship_after
  ),
  CONSTRAINT community_publication_lifecycle_visibility_gate CHECK (
    ((from_state = 'SYNTHETIC_LAB_PROJECTION' AND visibility_before = 'SYNTHETIC_LAB_ONLY')
      OR (from_state = 'CHALLENGED'
        AND visibility_before IN ('NOT_VISIBLE', 'SYNTHETIC_LAB_ONLY'))
      OR (from_state IS DISTINCT FROM 'SYNTHETIC_LAB_PROJECTION'
        AND from_state IS DISTINCT FROM 'CHALLENGED'
        AND visibility_before = 'NOT_VISIBLE'))
    AND ((to_state = 'SYNTHETIC_LAB_PROJECTION' AND visibility_after = 'SYNTHETIC_LAB_ONLY')
      OR (to_state = 'CHALLENGED'
        AND visibility_after IN ('NOT_VISIBLE', 'SYNTHETIC_LAB_ONLY'))
      OR (to_state NOT IN ('SYNTHETIC_LAB_PROJECTION', 'CHALLENGED')
        AND visibility_after = 'NOT_VISIBLE'))
  ),
  CONSTRAINT community_publication_lifecycle_transition_gate CHECK (
    (from_state IS NULL AND to_state = 'DRAFT')
    OR (from_state = 'DRAFT' AND to_state IN ('PRIVACY_REVIEW', 'WITHDRAWN', 'SUPERSEDED'))
    OR (from_state = 'PRIVACY_REVIEW' AND to_state IN ('APPROVED', 'DRAFT', 'WITHDRAWN', 'SUPERSEDED'))
    OR (from_state = 'APPROVED' AND to_state IN ('SYNTHETIC_LAB_PROJECTION', 'CHALLENGED', 'WITHDRAWN', 'SUPERSEDED'))
    OR (from_state = 'SYNTHETIC_LAB_PROJECTION' AND to_state IN ('CHALLENGED', 'WITHDRAWN', 'SUPERSEDED'))
    OR (from_state = 'CHALLENGED' AND to_state IN ('PRIVACY_REVIEW', 'WITHDRAWN', 'SUPERSEDED'))
  )
);

CREATE OR REPLACE FUNCTION validate_community_publication_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prior record;
  public_identity record;
BEGIN
  SELECT lead_id, lead_version INTO public_identity
  FROM community_lead_public_versions
  WHERE public_version_id = NEW.public_version_id;
  IF public_identity.lead_id <> NEW.lead_id
     OR public_identity.lead_version <> NEW.lead_version
  THEN
    RAISE EXCEPTION 'COMMUNITY_PUBLICATION_LIFECYCLE_IDENTITY_MISMATCH';
  END IF;
  SELECT * INTO prior
  FROM community_publication_lifecycle_events
  WHERE public_version_id = NEW.public_version_id
  ORDER BY inserted_at DESC, lifecycle_event_id DESC
  LIMIT 1;
  IF prior IS NULL THEN
    IF NEW.from_state IS NOT NULL THEN
      RAISE EXCEPTION 'COMMUNITY_PUBLICATION_LIFECYCLE_START_REQUIRED';
    END IF;
  ELSE
    IF NEW.from_state <> prior.to_state
       OR NEW.visibility_before <> prior.visibility_after
       OR NEW.lead_id <> prior.lead_id
       OR NEW.lead_version <> prior.lead_version
       OR NEW.verification_state_before <> prior.verification_state_after
       OR NEW.evidence_capability_before <> prior.evidence_capability_after
       OR NEW.formal_evidence_relationship_before <> prior.formal_evidence_relationship_after
    THEN
      RAISE EXCEPTION 'COMMUNITY_PUBLICATION_LIFECYCLE_CONTINUITY_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_publication_lifecycle_gate ON community_publication_lifecycle_events;
CREATE TRIGGER community_publication_lifecycle_gate
BEFORE INSERT ON community_publication_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION validate_community_publication_lifecycle();

CREATE TABLE IF NOT EXISTS community_research_question_cluster_dependencies (
  question_id text NOT NULL,
  question_version integer NOT NULL,
  cluster_id text NOT NULL,
  cluster_version integer NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (question_id, question_version, cluster_id, cluster_version),
  FOREIGN KEY (question_id, question_version)
    REFERENCES community_research_questions(question_id, question_version),
  FOREIGN KEY (cluster_id, cluster_version)
    REFERENCES community_signal_clusters(cluster_id, cluster_version)
);

CREATE OR REPLACE FUNCTION validate_community_research_question_cluster_dependency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  question_payload jsonb;
BEGIN
  SELECT payload_json INTO question_payload
  FROM community_research_questions
  WHERE question_id = NEW.question_id AND question_version = NEW.question_version;
  IF NOT COALESCE(question_payload->'derivedFromClusterIds' ? NEW.cluster_id, false) THEN
    RAISE EXCEPTION 'COMMUNITY_RESEARCH_QUESTION_CLUSTER_DEPENDENCY_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_research_question_cluster_dependency_gate
  ON community_research_question_cluster_dependencies;
CREATE TRIGGER community_research_question_cluster_dependency_gate
BEFORE INSERT ON community_research_question_cluster_dependencies
FOR EACH ROW EXECUTE FUNCTION validate_community_research_question_cluster_dependency();

CREATE TABLE IF NOT EXISTS community_research_proposal_evidence_links (
  proposal_id text NOT NULL,
  proposal_version integer NOT NULL,
  evidence_check_id text NOT NULL REFERENCES community_question_evidence_checks(evidence_check_id),
  question_id text NOT NULL,
  question_version integer NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (proposal_id, proposal_version),
  FOREIGN KEY (proposal_id, proposal_version)
    REFERENCES community_research_proposals(proposal_id, proposal_version)
);

CREATE OR REPLACE FUNCTION validate_community_research_proposal_evidence_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  proposal_question record;
  checked_question record;
BEGIN
  SELECT question_id, question_version INTO proposal_question
  FROM community_research_proposals
  WHERE proposal_id = NEW.proposal_id AND proposal_version = NEW.proposal_version;
  SELECT question_id, question_version, matched_evidence_status INTO checked_question
  FROM community_question_evidence_checks
  WHERE evidence_check_id = NEW.evidence_check_id;
  IF proposal_question.question_id <> NEW.question_id
     OR proposal_question.question_version <> NEW.question_version
     OR checked_question.question_id <> NEW.question_id
     OR checked_question.question_version <> NEW.question_version
  THEN
    RAISE EXCEPTION 'COMMUNITY_RESEARCH_PROPOSAL_QUESTION_VERSION_MISMATCH';
  END IF;
  IF checked_question.matched_evidence_status = 'ANSWERED_FOR_SCOPE' THEN
    RAISE EXCEPTION 'COMMUNITY_RESEARCH_PROPOSAL_SCOPE_ALREADY_ANSWERED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_research_proposal_evidence_gate ON community_research_proposal_evidence_links;
CREATE TRIGGER community_research_proposal_evidence_gate
BEFORE INSERT ON community_research_proposal_evidence_links
FOR EACH ROW EXECUTE FUNCTION validate_community_research_proposal_evidence_link();

CREATE TABLE IF NOT EXISTS community_withdrawal_events (
  withdrawal_event_id text PRIMARY KEY CHECK (withdrawal_event_id ~ '^ARWITH-[A-Z0-9_-]{8,64}$'),
  public_version_id text NOT NULL REFERENCES community_lead_public_versions(public_version_id),
  requested_at timestamptz NOT NULL,
  propagation_state text NOT NULL DEFAULT 'COMPLETE' CHECK (propagation_state = 'COMPLETE'),
  public_content_retained boolean NOT NULL DEFAULT false
    CONSTRAINT community_withdrawal_event_no_public_content CHECK (public_content_retained = false),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (
    jsonb_typeof(payload_json) = 'object'
    AND NOT community_json_has_prohibited_key(payload_json)
  ),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION validate_community_withdrawal_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM community_lead_withdrawals
    WHERE public_version_id = NEW.public_version_id
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_WITHDRAWAL_REQUIRED_BEFORE_EVENT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM community_synthetic_public_lead_projection
    WHERE public_version_id = NEW.public_version_id
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_WITHDRAWAL_PROJECTION_STILL_VISIBLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_withdrawal_event_gate ON community_withdrawal_events;
CREATE TRIGGER community_withdrawal_event_gate
BEFORE INSERT ON community_withdrawal_events
FOR EACH ROW EXECUTE FUNCTION validate_community_withdrawal_event();

CREATE TABLE IF NOT EXISTS community_withdrawal_propagation_receipts (
  propagation_receipt_id text PRIMARY KEY CHECK (propagation_receipt_id ~ '^ARPROPAGATE-[A-Z0-9_-]{8,64}$'),
  withdrawal_event_id text NOT NULL REFERENCES community_withdrawal_events(withdrawal_event_id),
  public_version_id text NOT NULL REFERENCES community_lead_public_versions(public_version_id),
  lead_id text NOT NULL,
  lead_version integer NOT NULL CHECK (lead_version > 0),
  exact_projection_removed boolean NOT NULL DEFAULT true CHECK (exact_projection_removed = true),
  public_content_retained boolean NOT NULL DEFAULT false
    CONSTRAINT community_withdrawal_propagation_no_public_content CHECK (public_content_retained = false),
  provenance_retained boolean NOT NULL DEFAULT true CHECK (provenance_retained = true),
  propagation_state text NOT NULL DEFAULT 'COMPLETE' CHECK (propagation_state = 'COMPLETE'),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (
    jsonb_typeof(payload_json) = 'object'
    AND NOT community_json_has_prohibited_key(payload_json)
  ),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  completed_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version)
);

CREATE OR REPLACE FUNCTION validate_community_withdrawal_propagation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  public_identity record;
  withdrawal_public_version_id text;
BEGIN
  SELECT lead_id, lead_version INTO public_identity
  FROM community_lead_public_versions
  WHERE public_version_id = NEW.public_version_id;
  IF public_identity.lead_id <> NEW.lead_id
     OR public_identity.lead_version <> NEW.lead_version
  THEN
    RAISE EXCEPTION 'COMMUNITY_WITHDRAWAL_PROPAGATION_IDENTITY_MISMATCH';
  END IF;
  SELECT public_version_id INTO withdrawal_public_version_id
  FROM community_withdrawal_events
  WHERE withdrawal_event_id = NEW.withdrawal_event_id;
  IF withdrawal_public_version_id <> NEW.public_version_id THEN
    RAISE EXCEPTION 'COMMUNITY_WITHDRAWAL_PROPAGATION_EVENT_MISMATCH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM community_lead_withdrawals
    WHERE public_version_id = NEW.public_version_id
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_WITHDRAWAL_REQUIRED_BEFORE_PROPAGATION';
  END IF;
  IF EXISTS (
    SELECT 1 FROM community_synthetic_public_lead_projection
    WHERE public_version_id = NEW.public_version_id
  ) THEN
    RAISE EXCEPTION 'COMMUNITY_WITHDRAWAL_PROJECTION_STILL_VISIBLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_withdrawal_propagation_gate ON community_withdrawal_propagation_receipts;
CREATE TRIGGER community_withdrawal_propagation_gate
BEFORE INSERT ON community_withdrawal_propagation_receipts
FOR EACH ROW EXECUTE FUNCTION validate_community_withdrawal_propagation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'community_integrity_signals', 'community_review_disagreements',
    'community_publication_lifecycle_events',
    'community_research_question_cluster_dependencies',
    'community_research_proposal_evidence_links',
    'community_withdrawal_events',
    'community_withdrawal_propagation_receipts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS community_integrity_target_idx
  ON community_integrity_signals (target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS community_lifecycle_public_version_idx
  ON community_publication_lifecycle_events (public_version_id, inserted_at);
CREATE INDEX IF NOT EXISTS community_research_cluster_dependency_idx
  ON community_research_question_cluster_dependencies (cluster_id, cluster_version);

REVOKE ALL ON ALL TABLES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA __SCHEMA__ FROM PUBLIC;
