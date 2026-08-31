CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE OR REPLACE FUNCTION community_json_has_prohibited_key(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  item record;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    FOR item IN SELECT key, val FROM jsonb_each(value) AS entry(key, val) LOOP
      IF lower(item.key) = ANY (ARRAY['email', 'subject_private_ref', 'direct_subject_quote', 'documents', 'media'])
        OR community_json_has_prohibited_key(item.val)
      THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR item IN SELECT val FROM jsonb_array_elements(value) AS entry(val) LOOP
      IF community_json_has_prohibited_key(item.val) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS community_forum_accounts (
  account_id text PRIMARY KEY CHECK (account_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  external_user_id text NOT NULL UNIQUE CHECK (external_user_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  email_sha256 char(64) NOT NULL UNIQUE CHECK (email_sha256 ~ '^[a-f0-9]{64}$'),
  pseudonymous_display_name text NOT NULL CHECK (length(pseudonymous_display_name) BETWEEN 3 AND 100),
  discourse_user_id text UNIQUE CHECK (discourse_user_id IS NULL OR discourse_user_id ~ '^SYNTHETIC-DISCOURSE-[0-9]{1,12}$'),
  email_verified boolean NOT NULL DEFAULT true CHECK (email_verified = true),
  forum_suspended boolean NOT NULL DEFAULT false,
  non_forum_product_access boolean NOT NULL DEFAULT true CHECK (non_forum_product_access = true),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS community_forum_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^AREVT-[A-Z0-9_-]{8,64}$'),
  event_type text NOT NULL CHECK (event_type IN (
    'forum.topic.created.v1', 'forum.topic.updated.v1', 'forum.topic.visibility_changed.v1',
    'forum.post.created.v1', 'forum.post.edited.v1', 'forum.post.deleted.v1',
    'forum.user.suspended.v1', 'forum.lead_opt_in.created.v1'
  )),
  forum_instance_id text NOT NULL CHECK (forum_instance_id = 'ASKRIGOR-SYNTHETIC-LAB'),
  aggregate_id text NOT NULL CHECK (aggregate_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  source_version integer NOT NULL CHECK (source_version > 0),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^discourse-synthetic:[a-zA-Z0-9._:-]{1,160}$'),
  minimal_payload_sha256 char(64) NOT NULL CHECK (minimal_payload_sha256 ~ '^[a-f0-9]{64}$'),
  raw_body_sha256 char(64) NOT NULL CHECK (raw_body_sha256 ~ '^[a-f0-9]{64}$'),
  trace_id text NOT NULL CHECK (trace_id ~ '^ARTRACE-[A-Z0-9_-]{8,64}$'),
  minimal_payload_json jsonb NOT NULL CHECK (jsonb_typeof(minimal_payload_json) = 'object'),
  raw_forum_body_persisted boolean NOT NULL DEFAULT false CHECK (raw_forum_body_persisted = false),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (forum_instance_id, aggregate_id, source_version)
);

CREATE TABLE IF NOT EXISTS community_forum_post_versions (
  forum_instance_id text NOT NULL CHECK (forum_instance_id = 'ASKRIGOR-SYNTHETIC-LAB'),
  topic_id text NOT NULL CHECK (topic_id ~ '^SYNTHETIC-TOPIC-[0-9]{1,12}$'),
  post_id text NOT NULL CHECK (post_id ~ '^SYNTHETIC-POST-[0-9]{1,12}$'),
  source_version integer NOT NULL CHECK (source_version > 0),
  author_account_id text REFERENCES community_forum_accounts(account_id),
  visibility text NOT NULL CHECK (visibility IN ('PRIVATE', 'MEMBER_ONLY', 'PUBLIC', 'DELETED')),
  content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  deleted boolean NOT NULL,
  source_event_id text NOT NULL UNIQUE REFERENCES community_forum_events(event_id),
  raw_forum_body_persisted boolean NOT NULL DEFAULT false CHECK (raw_forum_body_persisted = false),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (forum_instance_id, post_id, source_version),
  CHECK (
    (deleted AND visibility = 'DELETED' AND content_sha256 IS NULL)
    OR (NOT deleted AND visibility <> 'DELETED')
  )
);

CREATE TABLE IF NOT EXISTS community_bridge_dead_letters (
  dead_letter_id uuid PRIMARY KEY,
  event_id text,
  error_code text NOT NULL CHECK (length(error_code) > 0),
  raw_body_sha256 char(64) NOT NULL CHECK (raw_body_sha256 ~ '^[a-f0-9]{64}$'),
  raw_forum_body_persisted boolean NOT NULL DEFAULT false CHECK (raw_forum_body_persisted = false),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  recorded_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS community_leads (
  lead_id text NOT NULL CHECK (lead_id ~ '^ARLEAD-[A-Z0-9_-]{8,64}$'),
  lead_version integer NOT NULL CHECK (lead_version > 0),
  source_event_id text NOT NULL REFERENCES community_forum_events(event_id),
  reporter_account_id text NOT NULL REFERENCES community_forum_accounts(account_id),
  source_distance text NOT NULL CHECK (source_distance IN (
    'FIRSTHAND_SUBJECT', 'FIRSTHAND_OBSERVER', 'ONE_HOP_SUBJECT_RELAY',
    'MULTI_HOP_HEARSAY', 'PUBLIC_SOURCE_EXTRACTED', 'MIXED', 'UNKNOWN'
  )),
  verification_state text NOT NULL,
  evidence_capability text NOT NULL,
  formal_evidence_relationship text NOT NULL,
  completeness_band text NOT NULL CHECK (completeness_band IN ('MINIMAL', 'PARTIAL', 'MODERATE', 'HIGH_DETAIL')),
  status text NOT NULL CHECK (status IN ('STRUCTURED', 'PRIVACY_HOLD', 'APPROVED', 'CHALLENGED', 'WITHDRAWN', 'SUPERSEDED')),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  raw_forum_body_persisted boolean NOT NULL DEFAULT false CHECK (raw_forum_body_persisted = false),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (lead_id, lead_version),
  UNIQUE (payload_sha256)
);

CREATE TABLE IF NOT EXISTS community_lead_public_versions (
  public_version_id text PRIMARY KEY CHECK (public_version_id ~ '^ARPUB-[A-Z0-9_-]{8,64}$'),
  lead_id text NOT NULL,
  lead_version integer NOT NULL,
  publication_object_type text NOT NULL CHECK (publication_object_type IN ('PUBLIC_RESEARCH_LEAD', 'PUBLIC_NARRATIVE')),
  reporter_publication_consent boolean NOT NULL,
  subject_exact_version_approval boolean,
  privacy_review_outcome text NOT NULL CHECK (privacy_review_outcome IN ('PASS', 'FAIL', 'HUMAN_REVIEW_REQUIRED', 'PENDING')),
  abuse_review_state text NOT NULL CHECK (abuse_review_state IN ('PASS', 'FAIL', 'PENDING')),
  jurisdiction_policy_state text NOT NULL CHECK (jurisdiction_policy_state IN ('ALLOWED_SYNTHETIC_LAB', 'REVIEW_REQUIRED', 'PROHIBITED')),
  subject_identifiable boolean NOT NULL,
  direct_subject_quote_present boolean NOT NULL,
  documents_or_media_present boolean NOT NULL,
  verification_state text NOT NULL,
  evidence_capability text NOT NULL,
  formal_evidence_relationship text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PRIVACY_REVIEW', 'APPROVED', 'SYNTHETIC_LAB_PROJECTION', 'CHALLENGED', 'WITHDRAWN', 'SUPERSEDED')),
  public_payload_sha256 char(64) NOT NULL CHECK (public_payload_sha256 ~ '^[a-f0-9]{64}$'),
  version_record_sha256 char(64) NOT NULL CHECK (version_record_sha256 ~ '^[a-f0-9]{64}$'),
  public_payload_json jsonb NOT NULL CHECK (
    jsonb_typeof(public_payload_json) = 'object'
    AND NOT community_json_has_prohibited_key(public_payload_json)
  ),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version),
  CONSTRAINT community_public_version_release_gate CHECK (
    status NOT IN ('APPROVED', 'SYNTHETIC_LAB_PROJECTION')
    OR (
      privacy_review_outcome = 'PASS'
      AND abuse_review_state = 'PASS'
      AND jurisdiction_policy_state = 'ALLOWED_SYNTHETIC_LAB'
      AND (
        (
          publication_object_type = 'PUBLIC_NARRATIVE'
          AND subject_exact_version_approval = true
        )
        OR (
          publication_object_type = 'PUBLIC_RESEARCH_LEAD'
          AND reporter_publication_consent = true
          AND subject_identifiable = false
          AND direct_subject_quote_present = false
          AND documents_or_media_present = false
        )
      )
    )
  )
);

CREATE TABLE IF NOT EXISTS community_lead_withdrawals (
  withdrawal_id uuid PRIMARY KEY,
  public_version_id text NOT NULL REFERENCES community_lead_public_versions(public_version_id),
  requested_at timestamptz NOT NULL,
  content_retained_in_lab_projection boolean NOT NULL DEFAULT false CHECK (content_retained_in_lab_projection = false),
  tombstone_sha256 char(64) NOT NULL CHECK (tombstone_sha256 ~ '^[a-f0-9]{64}$'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (public_version_id)
);

CREATE TABLE IF NOT EXISTS community_lead_verifications (
  verification_event_id text PRIMARY KEY CHECK (verification_event_id ~ '^ARVER-[A-Z0-9_-]{8,64}$'),
  lead_id text NOT NULL,
  lead_version integer NOT NULL,
  prior_verification_state text NOT NULL,
  next_verification_state text NOT NULL,
  evidence_capability_before text NOT NULL,
  evidence_capability_after text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('PRIVACY_REVIEWER', 'SCIENTIFIC_ANNOTATOR', 'SYSTEM_SERVICE')),
  occurred_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version),
  CHECK (evidence_capability_before = evidence_capability_after)
);

CREATE TABLE IF NOT EXISTS community_lead_challenges (
  challenge_id text PRIMARY KEY CHECK (challenge_id ~ '^ARCHAL-[A-Z0-9_-]{8,64}$'),
  lead_id text NOT NULL,
  lead_version integer NOT NULL,
  challenge_type text NOT NULL CHECK (challenge_type IN ('SUBJECT_DISPUTE', 'REPORTER_CORRECTION', 'PRIVACY', 'PROVENANCE', 'SCIENTIFIC_SCOPE', 'OTHER')),
  summary text NOT NULL CHECK (length(summary) > 0),
  status text NOT NULL CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'SUPERSEDED')),
  created_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version)
);

CREATE TABLE IF NOT EXISTS community_lead_corrections (
  correction_id text PRIMARY KEY CHECK (correction_id ~ '^ARCORR-[A-Z0-9_-]{8,64}$'),
  lead_id text NOT NULL,
  from_lead_version integer NOT NULL,
  to_lead_version integer NOT NULL,
  correction_summary text NOT NULL CHECK (length(correction_summary) > 0),
  created_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, from_lead_version) REFERENCES community_leads(lead_id, lead_version),
  FOREIGN KEY (lead_id, to_lead_version) REFERENCES community_leads(lead_id, lead_version),
  CHECK (to_lead_version = from_lead_version + 1)
);

CREATE TABLE IF NOT EXISTS community_signal_clusters (
  cluster_id text NOT NULL CHECK (cluster_id ~ '^ARCL-[A-Z0-9_-]{8,64}$'),
  cluster_version integer NOT NULL CHECK (cluster_version > 0),
  program_fingerprint text NOT NULL CHECK (length(program_fingerprint) > 0),
  independent_source_count integer NOT NULL CHECK (independent_source_count > 0),
  direction_counts jsonb NOT NULL CHECK (jsonb_typeof(direction_counts) = 'object'),
  duplicate_handling text NOT NULL CHECK (length(duplicate_handling) > 0),
  formal_evidence_relationship text NOT NULL,
  denominator_available boolean NOT NULL,
  effectiveness_percentage_display_permitted boolean NOT NULL DEFAULT false
    CONSTRAINT community_cluster_no_effectiveness_percentage CHECK (effectiveness_percentage_display_permitted = false),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (cluster_id, cluster_version),
  UNIQUE (payload_sha256)
);

CREATE TABLE IF NOT EXISTS community_signal_cluster_memberships (
  cluster_id text NOT NULL,
  cluster_version integer NOT NULL,
  lead_id text NOT NULL,
  lead_version integer NOT NULL,
  source_independence_key char(64) NOT NULL CHECK (source_independence_key ~ '^[a-f0-9]{64}$'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (cluster_id, cluster_version, lead_id, lead_version),
  FOREIGN KEY (cluster_id, cluster_version) REFERENCES community_signal_clusters(cluster_id, cluster_version),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version)
);

CREATE TABLE IF NOT EXISTS community_research_questions (
  question_id text NOT NULL CHECK (question_id ~ '^ARQ-[A-Z0-9_-]{8,64}$'),
  question_version integer NOT NULL CHECK (question_version > 0),
  question_text text NOT NULL CHECK (length(question_text) > 0),
  evidence_check_status text NOT NULL,
  status text NOT NULL,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (question_id, question_version)
);

CREATE TABLE IF NOT EXISTS community_question_evidence_checks (
  evidence_check_id text PRIMARY KEY CHECK (evidence_check_id ~ '^AREC-[A-Z0-9_-]{8,64}$'),
  question_id text NOT NULL,
  question_version integer NOT NULL,
  matched_evidence_status text NOT NULL,
  summary text NOT NULL CHECK (length(summary) > 0),
  evidence_identifiers jsonb NOT NULL CHECK (jsonb_typeof(evidence_identifiers) = 'array'),
  checked_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (question_id, question_version) REFERENCES community_research_questions(question_id, question_version)
);

CREATE TABLE IF NOT EXISTS community_research_proposals (
  proposal_id text NOT NULL CHECK (proposal_id ~ '^ARPROP-[A-Z0-9_-]{8,64}$'),
  proposal_version integer NOT NULL CHECK (proposal_version > 0),
  question_id text NOT NULL,
  question_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLIC_COMMENT', 'METHODS_REVIEW', 'ETHICS_REVIEW', 'BLOCKED', 'SUPERSEDED')),
  recruitment_active boolean NOT NULL DEFAULT false
    CONSTRAINT community_proposal_no_recruitment CHECK (recruitment_active = false),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (proposal_id, proposal_version),
  FOREIGN KEY (question_id, question_version) REFERENCES community_research_questions(question_id, question_version)
);

CREATE TABLE IF NOT EXISTS community_moderation_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^ARMOD-[A-Z0-9_-]{8,64}$'),
  target_type text NOT NULL,
  target_id text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('CATEGORY_MODERATOR', 'GLOBAL_MODERATOR', 'ADMINISTRATOR', 'SYSTEM_PRECHECK')),
  action text NOT NULL,
  reason text NOT NULL CHECK (length(reason) > 0),
  appealable boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS community_scientific_annotations (
  annotation_id text PRIMARY KEY CHECK (annotation_id ~ '^ARANN-[A-Z0-9_-]{8,64}$'),
  target_type text NOT NULL,
  target_id text NOT NULL,
  annotation_type text NOT NULL,
  annotation_text text NOT NULL CHECK (length(annotation_text) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('SCIENTIFIC_ANNOTATOR', 'METHODS_REVIEWER', 'ASKRIGOR_SYSTEM')),
  appealable boolean NOT NULL DEFAULT true CHECK (appealable = true),
  occurred_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS community_privacy_reviews (
  review_id text PRIMARY KEY CHECK (review_id ~ '^ARPRIV-[A-Z0-9_-]{8,64}$'),
  target_type text NOT NULL CHECK (target_type IN ('LEAD', 'PUBLIC_VERSION')),
  target_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('PASS', 'FAIL', 'HUMAN_REVIEW_REQUIRED', 'PENDING')),
  risk_flags jsonb NOT NULL CHECK (jsonb_typeof(risk_flags) = 'array'),
  reviewed_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS community_safety_candidates (
  safety_candidate_id text PRIMARY KEY CHECK (safety_candidate_id ~ '^ARSAFE-[A-Z0-9_-]{8,64}$'),
  source_target_type text NOT NULL CHECK (source_target_type IN ('POST', 'LEAD', 'CLUSTER')),
  source_target_id text NOT NULL,
  seriousness text NOT NULL,
  regulatory_responsibility_state text NOT NULL CHECK (regulatory_responsibility_state IN ('NOT_ASSESSED', 'ASSESSMENT_REQUIRED', 'LEGAL_REVIEW_REQUIRED')),
  automated_regulatory_reporting boolean NOT NULL DEFAULT false
    CONSTRAINT community_safety_no_auto_reporting CHECK (automated_regulatory_reporting = false),
  triage_state text NOT NULL,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS community_consent_events (
  consent_event_id text PRIMARY KEY CHECK (consent_event_id ~ '^ARCONS-[A-Z0-9_-]{8,64}$'),
  subject_type text NOT NULL,
  subject_id text NOT NULL CHECK (subject_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  permission text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('YES', 'NO', 'WITHDRAWN', 'NOT_ASKED')),
  notice_sha256 char(64) NOT NULL CHECK (notice_sha256 ~ '^[a-f0-9]{64}$'),
  target_record_ids jsonb NOT NULL CHECK (jsonb_typeof(target_record_ids) = 'array'),
  decided_at timestamptz NOT NULL,
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE VIEW community_current_forum_post_versions AS
SELECT DISTINCT ON (forum_instance_id, post_id)
  forum_instance_id, topic_id, post_id, source_version, author_account_id,
  visibility, content_sha256, deleted, source_event_id
FROM community_forum_post_versions
ORDER BY forum_instance_id, post_id, source_version DESC;

CREATE OR REPLACE VIEW community_synthetic_public_lead_projection AS
SELECT
  public_version_id, lead_id, lead_version, publication_object_type,
  verification_state, evidence_capability, formal_evidence_relationship,
  public_payload_sha256, public_payload_json, 'SYNTHETIC_LAB_ONLY'::text AS public_visibility
FROM community_lead_public_versions
WHERE status = 'SYNTHETIC_LAB_PROJECTION'
  AND synthetic_only = true
  AND lab_only = true
  AND NOT EXISTS (
    SELECT 1 FROM community_lead_withdrawals w
    WHERE w.public_version_id = community_lead_public_versions.public_version_id
  );

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'community_forum_accounts', 'community_forum_events', 'community_forum_post_versions',
    'community_bridge_dead_letters', 'community_leads', 'community_lead_public_versions',
    'community_lead_withdrawals', 'community_lead_verifications', 'community_lead_challenges',
    'community_lead_corrections', 'community_signal_clusters', 'community_signal_cluster_memberships',
    'community_research_questions', 'community_question_evidence_checks', 'community_research_proposals',
    'community_moderation_events', 'community_scientific_annotations', 'community_privacy_reviews',
    'community_safety_candidates', 'community_consent_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS community_forum_events_aggregate_version_idx
  ON community_forum_events (aggregate_id, source_version DESC);
CREATE INDEX IF NOT EXISTS community_leads_source_distance_idx
  ON community_leads (source_distance, verification_state, evidence_capability);
CREATE INDEX IF NOT EXISTS community_public_versions_lead_idx
  ON community_lead_public_versions (lead_id, lead_version);

REVOKE ALL ON ALL TABLES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA __SCHEMA__ FROM PUBLIC;
