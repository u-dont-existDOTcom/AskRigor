CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS community_moderation_appeals (
  appeal_id text PRIMARY KEY CHECK (appeal_id ~ '^ARAPPEAL-[A-Z0-9_-]{8,64}$'),
  original_moderation_event_id text NOT NULL REFERENCES community_moderation_events(event_id),
  resolution_moderation_event_id text REFERENCES community_moderation_events(event_id),
  target_type text NOT NULL,
  target_id text NOT NULL CHECK (length(target_id) > 0),
  appellant_actor_id text NOT NULL CHECK (appellant_actor_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  source_meaning_sha256_before char(64) NOT NULL CHECK (source_meaning_sha256_before ~ '^[a-f0-9]{64}$'),
  source_meaning_sha256_after char(64) NOT NULL CHECK (source_meaning_sha256_after ~ '^[a-f0-9]{64}$'),
  scientific_disposition_changed boolean NOT NULL DEFAULT false
    CHECK (scientific_disposition_changed = false),
  appeal_state text NOT NULL CHECK (appeal_state IN ('SUBMITTED', 'IN_REVIEW', 'UPHELD', 'REVERSED')),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  occurred_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT community_moderation_appeal_meaning_immutable CHECK (
    source_meaning_sha256_before = source_meaning_sha256_after
  ),
  CONSTRAINT community_moderation_appeal_resolution_gate CHECK (
    (appeal_state IN ('SUBMITTED', 'IN_REVIEW') AND resolution_moderation_event_id IS NULL)
    OR (appeal_state IN ('UPHELD', 'REVERSED')
      AND resolution_moderation_event_id IS NOT NULL
      AND resolution_moderation_event_id <> original_moderation_event_id)
  )
);

CREATE OR REPLACE FUNCTION validate_community_moderation_appeal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_event record;
  resolution_event record;
BEGIN
  SELECT target_type, target_id, appealable INTO original_event
  FROM community_moderation_events WHERE event_id = NEW.original_moderation_event_id;
  IF original_event.appealable <> true
     OR original_event.target_type <> NEW.target_type
     OR original_event.target_id <> NEW.target_id
  THEN
    RAISE EXCEPTION 'COMMUNITY_MODERATION_APPEAL_ORIGINAL_MISMATCH';
  END IF;
  IF NEW.resolution_moderation_event_id IS NOT NULL THEN
    SELECT target_type, target_id, action INTO resolution_event
    FROM community_moderation_events WHERE event_id = NEW.resolution_moderation_event_id;
    IF resolution_event.target_type <> NEW.target_type
       OR resolution_event.target_id <> NEW.target_id
       OR (NEW.appeal_state = 'REVERSED' AND resolution_event.action <> 'RESTORE')
       OR (NEW.appeal_state = 'UPHELD' AND resolution_event.action <> 'NO_ACTION')
    THEN
      RAISE EXCEPTION 'COMMUNITY_MODERATION_APPEAL_RESOLUTION_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_moderation_appeal_gate ON community_moderation_appeals;
CREATE TRIGGER community_moderation_appeal_gate
BEFORE INSERT ON community_moderation_appeals
FOR EACH ROW EXECUTE FUNCTION validate_community_moderation_appeal();

CREATE TABLE IF NOT EXISTS community_formal_evidence_updates (
  evidence_update_id text PRIMARY KEY CHECK (evidence_update_id ~ '^AREVUP-[A-Z0-9_-]{8,64}$'),
  cluster_id text NOT NULL,
  from_cluster_version integer NOT NULL CHECK (from_cluster_version > 0),
  to_cluster_version integer NOT NULL CHECK (to_cluster_version = from_cluster_version + 1),
  update_kind text NOT NULL CHECK (update_kind IN (
    'NEW_FORMAL_EVIDENCE', 'CORRECTION_OR_RETRACTION',
    'FRESHNESS_EXPIRED', 'ACCESS_CHANGED'
  )),
  scope_relationship text NOT NULL CHECK (scope_relationship IN (
    'ALIGNED_SCOPE', 'ADJACENT_ONLY', 'OUTCOME_MISMATCH', 'POPULATION_MISMATCH',
    'INTERVENTION_MISMATCH', 'TIME_HORIZON_MISMATCH', 'INACCESSIBLE_OR_UNRESOLVED'
  )),
  formal_evidence_relationship_before text NOT NULL,
  formal_evidence_relationship_after text NOT NULL,
  freshness_before text NOT NULL,
  freshness_after text NOT NULL,
  community_report_count_before integer NOT NULL CHECK (community_report_count_before >= 0),
  community_report_count_after integer NOT NULL CHECK (community_report_count_after >= 0),
  community_report_count_affects_formal_evidence boolean NOT NULL DEFAULT false
    CONSTRAINT community_formal_update_report_count_gate
      CHECK (community_report_count_affects_formal_evidence = false),
  originating_reports_retained boolean NOT NULL DEFAULT true
    CONSTRAINT community_formal_update_reports_retained_gate
      CHECK (originating_reports_retained = true),
  originating_report_meaning_changed boolean NOT NULL DEFAULT false CHECK (originating_report_meaning_changed = false),
  effectiveness_percentage_display_permitted boolean NOT NULL DEFAULT false
    CHECK (effectiveness_percentage_display_permitted = false),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  occurred_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (cluster_id, from_cluster_version)
    REFERENCES community_signal_clusters(cluster_id, cluster_version),
  FOREIGN KEY (cluster_id, to_cluster_version)
    REFERENCES community_signal_clusters(cluster_id, cluster_version)
);

CREATE TABLE IF NOT EXISTS community_question_transitions (
  transition_id text PRIMARY KEY CHECK (transition_id ~ '^ARQTRANS-[A-Z0-9_-]{8,64}$'),
  question_id text NOT NULL,
  from_question_version integer NOT NULL CHECK (from_question_version > 0),
  to_question_version integer NOT NULL CHECK (to_question_version = from_question_version + 1),
  evidence_check_id text NOT NULL REFERENCES community_question_evidence_checks(evidence_check_id),
  matched_evidence_status text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  transition_kind text NOT NULL CHECK (transition_kind IN (
    'CLOSE_ANSWERED', 'NARROW_PARTIAL_ANSWER', 'PRESERVE_FORMAL_CONFLICT',
    'OPEN_UNANSWERED', 'REFORMULATE_ILL_FORMED', 'DEFER_INACCESSIBLE'
  )),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  occurred_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (question_id, from_question_version)
    REFERENCES community_research_questions(question_id, question_version),
  FOREIGN KEY (question_id, to_question_version)
    REFERENCES community_research_questions(question_id, question_version)
);

CREATE OR REPLACE FUNCTION validate_community_question_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prior_status text;
  next_record record;
  check_record record;
  expected_matched text;
  expected_to_status text;
BEGIN
  SELECT status INTO prior_status FROM community_research_questions
  WHERE question_id = NEW.question_id AND question_version = NEW.from_question_version;
  SELECT status, evidence_check_status INTO next_record FROM community_research_questions
  WHERE question_id = NEW.question_id AND question_version = NEW.to_question_version;
  SELECT question_id, question_version, matched_evidence_status INTO check_record
  FROM community_question_evidence_checks WHERE evidence_check_id = NEW.evidence_check_id;
  SELECT matched, destination INTO expected_matched, expected_to_status FROM (VALUES
    ('CLOSE_ANSWERED', 'ANSWERED_FOR_SCOPE', 'ANSWERED'),
    ('NARROW_PARTIAL_ANSWER', 'PARTIALLY_ANSWERED', 'OPEN_UNCERTAINTY'),
    ('PRESERVE_FORMAL_CONFLICT', 'FORMAL_EVIDENCE_CONFLICTED', 'OPEN_UNCERTAINTY'),
    ('OPEN_UNANSWERED', 'NOT_ANSWERED', 'OPEN_UNCERTAINTY'),
    ('REFORMULATE_ILL_FORMED', 'QUESTION_NOT_YET_WELL_FORMED', 'CANDIDATE'),
    ('DEFER_INACCESSIBLE', 'INACCESSIBLE_OR_UNRESOLVED', 'OPEN_UNCERTAINTY')
  ) AS expected(kind, matched, destination)
  WHERE kind = NEW.transition_kind;
  IF prior_status <> NEW.from_status
     OR next_record.status <> NEW.to_status
     OR next_record.evidence_check_status <> NEW.matched_evidence_status
     OR check_record.question_id <> NEW.question_id
     OR check_record.question_version <> NEW.from_question_version
     OR check_record.matched_evidence_status <> NEW.matched_evidence_status
     OR NEW.matched_evidence_status <> expected_matched
     OR NEW.to_status <> expected_to_status
  THEN
    RAISE EXCEPTION 'COMMUNITY_QUESTION_TRANSITION_DEPENDENCY_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_question_transition_gate ON community_question_transitions;
CREATE TRIGGER community_question_transition_gate
BEFORE INSERT ON community_question_transitions
FOR EACH ROW EXECUTE FUNCTION validate_community_question_transition();

CREATE TABLE IF NOT EXISTS community_proposal_feasibility_assessments (
  assessment_id text PRIMARY KEY CHECK (assessment_id ~ '^ARFEAS-[A-Z0-9_-]{8,64}$'),
  proposal_id text NOT NULL,
  proposal_version integer NOT NULL,
  question_id text NOT NULL,
  question_version integer NOT NULL,
  evidence_check_id text NOT NULL REFERENCES community_question_evidence_checks(evidence_check_id),
  matched_evidence_status text NOT NULL,
  design_answerability text NOT NULL CHECK (design_answerability IN ('FEASIBLE', 'INFEASIBLE', 'UNCERTAIN')),
  popularity_affects_feasibility boolean NOT NULL DEFAULT false CHECK (popularity_affects_feasibility = false),
  disposition text NOT NULL CHECK (disposition IN (
    'BLOCKED_ANSWERED_SCOPE', 'BLOCKED_INFEASIBLE_DESIGN', 'METHODS_ETHICS_REVIEW_REQUIRED'
  )),
  launch_authorized boolean NOT NULL DEFAULT false CHECK (launch_authorized = false),
  recruitment_active boolean NOT NULL DEFAULT false CHECK (recruitment_active = false),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  assessed_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (proposal_id, proposal_version)
    REFERENCES community_research_proposals(proposal_id, proposal_version),
  FOREIGN KEY (question_id, question_version)
    REFERENCES community_research_questions(question_id, question_version),
  CONSTRAINT community_proposal_feasibility_disposition_gate CHECK (
    (matched_evidence_status = 'ANSWERED_FOR_SCOPE' AND disposition = 'BLOCKED_ANSWERED_SCOPE')
    OR (matched_evidence_status <> 'ANSWERED_FOR_SCOPE'
      AND design_answerability = 'INFEASIBLE'
      AND disposition = 'BLOCKED_INFEASIBLE_DESIGN')
    OR (matched_evidence_status <> 'ANSWERED_FOR_SCOPE'
      AND design_answerability IN ('FEASIBLE', 'UNCERTAIN')
      AND disposition = 'METHODS_ETHICS_REVIEW_REQUIRED')
  )
);

CREATE OR REPLACE FUNCTION validate_community_proposal_feasibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  proposal_record record;
  check_record record;
BEGIN
  SELECT question_id, question_version INTO proposal_record
  FROM community_research_proposals
  WHERE proposal_id = NEW.proposal_id AND proposal_version = NEW.proposal_version;
  SELECT question_id, question_version, matched_evidence_status INTO check_record
  FROM community_question_evidence_checks WHERE evidence_check_id = NEW.evidence_check_id;
  IF proposal_record.question_id <> NEW.question_id
     OR proposal_record.question_version <> NEW.question_version
     OR check_record.question_id <> NEW.question_id
     OR check_record.question_version <> NEW.question_version
     OR check_record.matched_evidence_status <> NEW.matched_evidence_status
  THEN
    RAISE EXCEPTION 'COMMUNITY_PROPOSAL_FEASIBILITY_DEPENDENCY_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_proposal_feasibility_gate ON community_proposal_feasibility_assessments;
CREATE TRIGGER community_proposal_feasibility_gate
BEFORE INSERT ON community_proposal_feasibility_assessments
FOR EACH ROW EXECUTE FUNCTION validate_community_proposal_feasibility();

CREATE TABLE IF NOT EXISTS community_closed_loop_results (
  result_propagation_id text PRIMARY KEY CHECK (result_propagation_id ~ '^ARRESULT-[A-Z0-9_-]{8,64}$'),
  proposal_id text NOT NULL,
  proposal_version integer NOT NULL,
  question_id text NOT NULL,
  question_version integer NOT NULL,
  result_direction text NOT NULL CHECK (result_direction IN ('NEGATIVE', 'NULL', 'MIXED', 'POSITIVE')),
  formal_evidence_relationship text NOT NULL,
  originating_reports_retained boolean NOT NULL DEFAULT true
    CONSTRAINT community_closed_loop_reports_retained_gate
      CHECK (originating_reports_retained = true),
  originating_hypothesis_penalized boolean NOT NULL DEFAULT false CHECK (originating_hypothesis_penalized = false),
  source_meaning_changed boolean NOT NULL DEFAULT false CHECK (source_meaning_changed = false),
  causal_claim_permitted boolean NOT NULL DEFAULT false CHECK (causal_claim_permitted = false),
  effectiveness_percentage_display_permitted boolean NOT NULL DEFAULT false
    CHECK (effectiveness_percentage_display_permitted = false),
  recruitment_active boolean NOT NULL DEFAULT false CHECK (recruitment_active = false),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (
    jsonb_typeof(payload_json) = 'object'
    AND NOT community_json_has_prohibited_key(payload_json)
  ),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  propagated_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (proposal_id, proposal_version)
    REFERENCES community_research_proposals(proposal_id, proposal_version),
  FOREIGN KEY (question_id, question_version)
    REFERENCES community_research_questions(question_id, question_version)
);

CREATE OR REPLACE FUNCTION validate_community_closed_loop_result()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  proposal_record record;
  target jsonb;
BEGIN
  SELECT question_id, question_version INTO proposal_record
  FROM community_research_proposals
  WHERE proposal_id = NEW.proposal_id AND proposal_version = NEW.proposal_version;
  IF proposal_record.question_id <> NEW.question_id
     OR proposal_record.question_version <> NEW.question_version
  THEN
    RAISE EXCEPTION 'COMMUNITY_CLOSED_LOOP_RESULT_PROPOSAL_MISMATCH';
  END IF;
  IF COALESCE(jsonb_typeof(NEW.payload_json->'clusterTargets'), 'missing') <> 'array'
     OR COALESCE(jsonb_typeof(NEW.payload_json->'leadTargets'), 'missing') <> 'array'
     OR COALESCE(jsonb_typeof(NEW.payload_json->'forumTargets'), 'missing') <> 'array'
     OR jsonb_array_length(NEW.payload_json->'clusterTargets') = 0
     OR jsonb_array_length(NEW.payload_json->'leadTargets') = 0
     OR jsonb_array_length(NEW.payload_json->'forumTargets') = 0
  THEN
    RAISE EXCEPTION 'COMMUNITY_CLOSED_LOOP_RESULT_ORIGINS_REQUIRED';
  END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(NEW.payload_json->'clusterTargets') LOOP
    IF NOT EXISTS (SELECT 1 FROM community_signal_clusters
      WHERE cluster_id = target->>'clusterId'
        AND cluster_version = (target->>'clusterVersion')::integer) THEN
      RAISE EXCEPTION 'COMMUNITY_CLOSED_LOOP_RESULT_CLUSTER_NOT_FOUND';
    END IF;
  END LOOP;
  FOR target IN SELECT value FROM jsonb_array_elements(NEW.payload_json->'leadTargets') LOOP
    IF NOT EXISTS (SELECT 1 FROM community_leads
      WHERE lead_id = target->>'leadId'
        AND lead_version = (target->>'leadVersion')::integer) THEN
      RAISE EXCEPTION 'COMMUNITY_CLOSED_LOOP_RESULT_LEAD_NOT_FOUND';
    END IF;
  END LOOP;
  FOR target IN SELECT value FROM jsonb_array_elements(NEW.payload_json->'forumTargets') LOOP
    IF (target->>'targetType' = 'POST' AND NOT EXISTS (
      SELECT 1 FROM community_forum_post_versions WHERE post_id = target->>'targetId'
    )) OR (target->>'targetType' = 'TOPIC' AND NOT EXISTS (
      SELECT 1 FROM community_forum_post_versions WHERE topic_id = target->>'targetId'
    )) THEN
      RAISE EXCEPTION 'COMMUNITY_CLOSED_LOOP_RESULT_FORUM_TARGET_NOT_FOUND';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_closed_loop_result_gate ON community_closed_loop_results;
CREATE TRIGGER community_closed_loop_result_gate
BEFORE INSERT ON community_closed_loop_results
FOR EACH ROW EXECUTE FUNCTION validate_community_closed_loop_result();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'community_moderation_appeals', 'community_formal_evidence_updates',
    'community_question_transitions', 'community_proposal_feasibility_assessments',
    'community_closed_loop_results'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS community_formal_evidence_cluster_idx
  ON community_formal_evidence_updates (cluster_id, to_cluster_version);
CREATE INDEX IF NOT EXISTS community_question_transition_question_idx
  ON community_question_transitions (question_id, to_question_version);
CREATE INDEX IF NOT EXISTS community_closed_loop_question_idx
  ON community_closed_loop_results (question_id, question_version);

REVOKE ALL ON ALL TABLES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA __SCHEMA__ FROM PUBLIC;
