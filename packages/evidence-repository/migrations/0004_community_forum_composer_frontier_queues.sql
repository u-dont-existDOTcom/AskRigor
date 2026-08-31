CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS community_composer_draft_versions (
  draft_id text NOT NULL CHECK (draft_id ~ '^ARDRAFT-[A-Z0-9_-]{8,64}$'),
  draft_version integer NOT NULL CHECK (draft_version > 0),
  reporter_account_id text NOT NULL REFERENCES community_forum_accounts(account_id),
  entry_point text NOT NULL CHECK (entry_point IN ('FORUM_POST', 'DIRECT_STRUCTURED_INTAKE')),
  source_post_id text CHECK (source_post_id IS NULL OR source_post_id ~ '^SYNTHETIC-POST-[0-9]{1,12}$'),
  source_post_disposition text NOT NULL CHECK (source_post_disposition IN (
    'ORDINARY_CONVERSATION', 'CONVERSION_OFFERED', 'CONVERSION_ACCEPTED',
    'CONVERSION_DECLINED', 'NOT_APPLICABLE_DIRECT_INTAKE'
  )),
  status text NOT NULL CHECK (status IN (
    'DRAFT', 'STOPPED', 'PREVIEW_READY', 'SYNTHETIC_PUBLICATION_REQUESTED', 'WITHDRAWN'
  )),
  public_lead_permission text NOT NULL CHECK (public_lead_permission IN ('NOT_ASKED', 'YES', 'NO', 'WITHDRAWN')),
  preview_acknowledged boolean NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  updated_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (draft_id, draft_version),
  UNIQUE (payload_sha256),
  CHECK (
    (entry_point = 'FORUM_POST' AND source_post_id IS NOT NULL
      AND source_post_disposition <> 'NOT_APPLICABLE_DIRECT_INTAKE')
    OR (entry_point = 'DIRECT_STRUCTURED_INTAKE' AND source_post_id IS NULL
      AND source_post_disposition = 'NOT_APPLICABLE_DIRECT_INTAKE')
  ),
  CONSTRAINT community_composer_publication_request_gate CHECK (
    status <> 'SYNTHETIC_PUBLICATION_REQUESTED'
    OR (
      source_post_disposition IN ('CONVERSION_ACCEPTED', 'NOT_APPLICABLE_DIRECT_INTAKE')
      AND public_lead_permission = 'YES'
      AND preview_acknowledged = true
    )
  )
);

CREATE TABLE IF NOT EXISTS community_frontier_snapshots (
  snapshot_id text PRIMARY KEY CHECK (snapshot_id ~ '^ARFRONTIER-[A-Z0-9_-]{8,64}$'),
  default_order text NOT NULL DEFAULT 'DIRECTION_BALANCED_STABLE'
    CHECK (default_order = 'DIRECTION_BALANCED_STABLE'),
  reported_lead_count integer NOT NULL CHECK (reported_lead_count >= 0),
  independent_source_count integer NOT NULL CHECK (
    independent_source_count >= 0 AND independent_source_count <= reported_lead_count
  ),
  direction_counts jsonb NOT NULL CHECK (jsonb_typeof(direction_counts) = 'object'),
  denominator_available boolean NOT NULL DEFAULT false
    CHECK (denominator_available = false),
  effectiveness_percentage_display_permitted boolean NOT NULL DEFAULT false
    CONSTRAINT community_frontier_no_effectiveness_percentage
      CHECK (effectiveness_percentage_display_permitted = false),
  discussion_activity_affects_evidence_state boolean NOT NULL DEFAULT false
    CHECK (discussion_activity_affects_evidence_state = false),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (
    jsonb_typeof(payload_json) = 'object'
    AND NOT community_json_has_prohibited_key(payload_json)
  ),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  generated_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS community_operational_queue_items (
  queue_item_id text PRIMARY KEY CHECK (queue_item_id ~ '^ARQUEUE-[A-Z0-9_-]{8,64}$'),
  queue_type text NOT NULL CHECK (queue_type IN (
    'MODERATION', 'PRIVACY', 'SCIENTIFIC', 'SAFETY', 'RESEARCH_STEWARDSHIP',
    'METHODS_ETHICS', 'SYSTEM_ADMINISTRATION'
  )),
  required_capability text NOT NULL CHECK (required_capability IN (
    'MODERATE_CONDUCT', 'REVIEW_PRIVACY', 'ANNOTATE_SCIENCE', 'TRIAGE_SAFETY',
    'STEWARD_RESEARCH', 'REVIEW_METHODS_ETHICS', 'ADMINISTER_SYSTEM'
  )),
  target_type text NOT NULL,
  target_id text NOT NULL CHECK (length(target_id) > 0),
  originator_actor_id text NOT NULL CHECK (originator_actor_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  independent_review_required boolean NOT NULL,
  source_meaning_sha256 char(64) NOT NULL CHECK (source_meaning_sha256 ~ '^[a-f0-9]{64}$'),
  seriousness text NOT NULL,
  automated_regulatory_reporting boolean NOT NULL DEFAULT false
    CONSTRAINT community_operational_queue_no_auto_reporting
      CHECK (automated_regulatory_reporting = false),
  status text NOT NULL CHECK (status IN ('QUEUED', 'IN_REVIEW', 'RESOLVED', 'SUPERSEDED')),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  created_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT community_operational_queue_capability_gate CHECK (
    (queue_type = 'MODERATION' AND required_capability = 'MODERATE_CONDUCT')
    OR (queue_type = 'PRIVACY' AND required_capability = 'REVIEW_PRIVACY')
    OR (queue_type = 'SCIENTIFIC' AND required_capability = 'ANNOTATE_SCIENCE')
    OR (queue_type = 'SAFETY' AND required_capability = 'TRIAGE_SAFETY')
    OR (queue_type = 'RESEARCH_STEWARDSHIP' AND required_capability = 'STEWARD_RESEARCH')
    OR (queue_type = 'METHODS_ETHICS' AND required_capability = 'REVIEW_METHODS_ETHICS')
    OR (queue_type = 'SYSTEM_ADMINISTRATION' AND required_capability = 'ADMINISTER_SYSTEM')
  ),
  CHECK (queue_type = 'SAFETY' OR seriousness = 'NOT_APPLICABLE')
);

CREATE TABLE IF NOT EXISTS community_operational_actor_roles (
  assignment_id text PRIMARY KEY CHECK (assignment_id ~ '^ARROLE-[A-Z0-9_-]{8,64}$'),
  actor_id text NOT NULL CHECK (actor_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  role text NOT NULL CHECK (role IN (
    'CATEGORY_MODERATOR', 'GLOBAL_MODERATOR', 'PRIVACY_REVIEWER',
    'SCIENTIFIC_ANNOTATOR', 'SAFETY_REVIEWER', 'RESEARCH_STEWARD',
    'METHODS_REVIEWER', 'ETHICS_REVIEWER', 'ADMINISTRATOR'
  )),
  assigned_by_actor_id text NOT NULL CHECK (assigned_by_actor_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  active boolean NOT NULL DEFAULT true CHECK (active = true),
  assigned_at timestamptz NOT NULL,
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_id, role)
);

CREATE TABLE IF NOT EXISTS community_operational_actions (
  action_id text PRIMARY KEY CHECK (action_id ~ '^ARACTION-[A-Z0-9_-]{8,64}$'),
  queue_item_id text NOT NULL REFERENCES community_operational_queue_items(queue_item_id),
  actor_id text NOT NULL CHECK (actor_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  originator_actor_id text NOT NULL CHECK (originator_actor_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  independent_review_required boolean NOT NULL,
  active_role text NOT NULL,
  capability text NOT NULL,
  action text NOT NULL,
  source_meaning_sha256_before char(64) NOT NULL CHECK (source_meaning_sha256_before ~ '^[a-f0-9]{64}$'),
  source_meaning_sha256_after char(64) NOT NULL CHECK (source_meaning_sha256_after ~ '^[a-f0-9]{64}$'),
  annotation_text text,
  automated_regulatory_reporting boolean NOT NULL DEFAULT false
    CONSTRAINT community_operational_action_no_auto_reporting
      CHECK (automated_regulatory_reporting = false),
  resulting_status text NOT NULL CHECK (resulting_status IN ('QUEUED', 'IN_REVIEW', 'RESOLVED', 'SUPERSEDED')),
  payload_sha256 char(64) NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  occurred_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (actor_id, active_role)
    REFERENCES community_operational_actor_roles(actor_id, role),
  CONSTRAINT community_operational_action_role_capability_gate CHECK (
    (active_role IN ('CATEGORY_MODERATOR', 'GLOBAL_MODERATOR') AND capability = 'MODERATE_CONDUCT')
    OR (active_role = 'PRIVACY_REVIEWER' AND capability = 'REVIEW_PRIVACY')
    OR (active_role = 'SCIENTIFIC_ANNOTATOR' AND capability = 'ANNOTATE_SCIENCE')
    OR (active_role = 'SAFETY_REVIEWER' AND capability = 'TRIAGE_SAFETY')
    OR (active_role = 'RESEARCH_STEWARD' AND capability = 'STEWARD_RESEARCH')
    OR (active_role IN ('METHODS_REVIEWER', 'ETHICS_REVIEWER') AND capability = 'REVIEW_METHODS_ETHICS')
    OR (active_role = 'ADMINISTRATOR' AND capability = 'ADMINISTER_SYSTEM')
  ),
  CONSTRAINT community_operational_action_type_capability_gate CHECK (
    (action IN ('LABEL_CONDUCT', 'HIDE_CONDUCT_VIOLATION', 'REMOVE_CONDUCT_VIOLATION', 'ESCALATE')
      AND capability = 'MODERATE_CONDUCT')
    OR (action IN ('PRIVACY_PASS', 'PRIVACY_FAIL') AND capability = 'REVIEW_PRIVACY')
    OR (action = 'ANNOTATE_SEPARATELY' AND capability = 'ANNOTATE_SCIENCE')
    OR (action IN ('TRIAGE_FOR_HUMAN_REVIEW', 'REQUEST_FOLLOW_UP', 'CLOSE_NO_ACTION')
      AND capability = 'TRIAGE_SAFETY')
    OR (action = 'STEWARDSHIP_REVIEW' AND capability = 'STEWARD_RESEARCH')
    OR (action = 'METHODS_ETHICS_REVIEW' AND capability = 'REVIEW_METHODS_ETHICS')
    OR (action = 'ADMINISTRATIVE_ACTION' AND capability = 'ADMINISTER_SYSTEM')
  ),
  CONSTRAINT community_operational_action_source_meaning_immutable CHECK (
    source_meaning_sha256_before = source_meaning_sha256_after
  ),
  CONSTRAINT community_operational_action_independent_review_gate CHECK (
    NOT independent_review_required OR actor_id <> originator_actor_id
  ),
  CONSTRAINT community_operational_action_resulting_status_gate CHECK (
    (action IN ('LABEL_CONDUCT', 'HIDE_CONDUCT_VIOLATION', 'REMOVE_CONDUCT_VIOLATION',
      'PRIVACY_PASS', 'PRIVACY_FAIL', 'ANNOTATE_SEPARATELY', 'CLOSE_NO_ACTION',
      'STEWARDSHIP_REVIEW', 'METHODS_ETHICS_REVIEW', 'ADMINISTRATIVE_ACTION')
      AND resulting_status = 'RESOLVED')
    OR (action IN ('ESCALATE', 'TRIAGE_FOR_HUMAN_REVIEW', 'REQUEST_FOLLOW_UP')
      AND resulting_status = 'IN_REVIEW')
  )
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'community_composer_draft_versions', 'community_frontier_snapshots',
    'community_operational_queue_items', 'community_operational_actor_roles',
    'community_operational_actions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS community_composer_reporter_updated_idx
  ON community_composer_draft_versions (reporter_account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS community_operational_queue_type_status_idx
  ON community_operational_queue_items (queue_type, status, created_at);
CREATE INDEX IF NOT EXISTS community_operational_actions_queue_idx
  ON community_operational_actions (queue_item_id, occurred_at);

REVOKE ALL ON ALL TABLES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA __SCHEMA__ FROM PUBLIC;
