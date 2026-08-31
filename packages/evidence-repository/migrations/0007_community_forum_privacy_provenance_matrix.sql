CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE OR REPLACE FUNCTION community_text_array_is_unique(value text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT cardinality(value) = (
    SELECT count(DISTINCT item) FROM unnest(value) AS item
  );
$$;

CREATE TABLE IF NOT EXISTS community_privacy_publication_gates (
  gate_id text PRIMARY KEY CHECK (gate_id ~ '^ARPRIVGATE-[A-Z0-9_-]{8,64}$'),
  public_version_id text NOT NULL REFERENCES community_lead_public_versions(public_version_id),
  lead_id text NOT NULL,
  lead_version integer NOT NULL CHECK (lead_version > 0),
  risk_flags_before text[] NOT NULL,
  risk_flags_after text[] NOT NULL,
  generalization_applied boolean NOT NULL,
  minor_status text NOT NULL CHECK (minor_status IN ('ADULT', 'MINOR', 'UNKNOWN')),
  guardian_consent_state text NOT NULL CHECK (guardian_consent_state IN (
    'NOT_APPLICABLE', 'NOT_REVIEWED', 'PENDING', 'APPROVED', 'REJECTED'
  )),
  legal_privacy_review_state text NOT NULL CHECK (legal_privacy_review_state IN (
    'NOT_REVIEWED', 'REVIEW_REQUIRED', 'REVIEW_IN_PROGRESS', 'APPROVED', 'REJECTED'
  )),
  ordinary_projection_permitted boolean NOT NULL,
  decision text NOT NULL CHECK (decision IN (
    'ELIGIBLE_SYNTHETIC_LAB', 'HOLD_REIDENTIFICATION', 'HOLD_MINOR_REVIEW', 'BLOCKED'
  )),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  assessed_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version),
  CONSTRAINT community_privacy_gate_risk_flags_allowed CHECK (
    community_text_array_is_unique(risk_flags_before)
    AND community_text_array_is_unique(risk_flags_after)
    AND risk_flags_before <@ ARRAY[
      'DIRECT_IDENTIFIER', 'EXACT_DATE_OR_AGE', 'RARE_COMBINATION',
      'PRECISE_LOCATION', 'CLINICIAN_OR_CLINIC', 'UNIQUE_SEARCHABLE_QUOTE',
      'IMAGE_OR_EXIF', 'DOCUMENT_IDENTIFIER', 'MINOR',
      'PUBLIC_BACKLINK_REIDENTIFICATION', 'RELATIONAL_REIDENTIFICATION', 'OTHER'
    ]::text[]
    AND risk_flags_after <@ ARRAY[
      'DIRECT_IDENTIFIER', 'EXACT_DATE_OR_AGE', 'RARE_COMBINATION',
      'PRECISE_LOCATION', 'CLINICIAN_OR_CLINIC', 'UNIQUE_SEARCHABLE_QUOTE',
      'IMAGE_OR_EXIF', 'DOCUMENT_IDENTIFIER', 'MINOR',
      'PUBLIC_BACKLINK_REIDENTIFICATION', 'RELATIONAL_REIDENTIFICATION', 'OTHER'
    ]::text[]
    AND risk_flags_after <@ risk_flags_before
  ),
  CONSTRAINT community_privacy_gate_generalization_state CHECK (
    generalization_applied = NOT (
      risk_flags_before @> risk_flags_after AND risk_flags_after @> risk_flags_before
    )
  ),
  CONSTRAINT community_privacy_gate_guardian_state CHECK (
    (minor_status = 'ADULT' AND guardian_consent_state = 'NOT_APPLICABLE')
    OR (minor_status <> 'ADULT' AND guardian_consent_state <> 'NOT_APPLICABLE')
  ),
  CONSTRAINT community_privacy_gate_decision CHECK (
    (
      decision = 'BLOCKED'
      AND (
        guardian_consent_state = 'REJECTED'
        OR legal_privacy_review_state = 'REJECTED'
        OR (
          cardinality(risk_flags_after) = 0
          AND minor_status = 'ADULT'
          AND legal_privacy_review_state <> 'APPROVED'
        )
      )
    ) OR (
      decision = 'HOLD_REIDENTIFICATION'
      AND guardian_consent_state <> 'REJECTED'
      AND legal_privacy_review_state <> 'REJECTED'
      AND cardinality(risk_flags_after) > 0
    ) OR (
      decision = 'HOLD_MINOR_REVIEW'
      AND guardian_consent_state <> 'REJECTED'
      AND legal_privacy_review_state <> 'REJECTED'
      AND cardinality(risk_flags_after) = 0
      AND minor_status <> 'ADULT'
    ) OR (
      decision = 'ELIGIBLE_SYNTHETIC_LAB'
      AND cardinality(risk_flags_after) = 0
      AND minor_status = 'ADULT'
      AND guardian_consent_state = 'NOT_APPLICABLE'
      AND legal_privacy_review_state = 'APPROVED'
    )
  ),
  CONSTRAINT community_privacy_gate_projection CHECK (
    ordinary_projection_permitted = (decision = 'ELIGIBLE_SYNTHETIC_LAB')
  )
);

CREATE OR REPLACE FUNCTION validate_community_privacy_publication_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  public_record record;
  lead_minor_status text;
BEGIN
  SELECT lead_id, lead_version INTO public_record
  FROM community_lead_public_versions
  WHERE public_version_id = NEW.public_version_id;
  SELECT payload_json->'subjectBoundary'->>'minorStatus' INTO lead_minor_status
  FROM community_leads
  WHERE lead_id = NEW.lead_id AND lead_version = NEW.lead_version;
  IF public_record.lead_id IS DISTINCT FROM NEW.lead_id
     OR public_record.lead_version IS DISTINCT FROM NEW.lead_version
  THEN
    RAISE EXCEPTION 'COMMUNITY_PRIVACY_GATE_PUBLIC_VERSION_MISMATCH';
  END IF;
  IF lead_minor_status IS DISTINCT FROM NEW.minor_status THEN
    RAISE EXCEPTION 'COMMUNITY_PRIVACY_GATE_MINOR_STATUS_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_privacy_publication_gate_dependency ON community_privacy_publication_gates;
CREATE TRIGGER community_privacy_publication_gate_dependency
BEFORE INSERT ON community_privacy_publication_gates
FOR EACH ROW EXECUTE FUNCTION validate_community_privacy_publication_gate();

CREATE TABLE IF NOT EXISTS community_external_source_extraction_boundaries (
  extraction_id text PRIMARY KEY CHECK (extraction_id ~ '^AREXTRACT-[A-Z0-9_-]{8,64}$'),
  external_source_id text NOT NULL CHECK (external_source_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  source_url text NOT NULL CHECK (
    source_url ~ '^https://[a-zA-Z0-9._/-]+\.invalid(/|$)'
  ),
  source_visibility text NOT NULL CHECK (source_visibility IN (
    'PUBLIC', 'MEMBER_ONLY', 'PRIVATE', 'DELETED', 'UNKNOWN'
  )),
  provider_terms_state text NOT NULL CHECK (provider_terms_state IN (
    'ALLOWED', 'REVIEW_REQUIRED', 'PROHIBITED', 'UNKNOWN'
  )),
  attribution_state text NOT NULL CHECK (attribution_state IN (
    'COMPLETE', 'INCOMPLETE', 'NOT_APPLICABLE'
  )),
  quotation_state text NOT NULL CHECK (quotation_state IN (
    'NONE', 'APPROVED_EXCERPT', 'WITHHELD'
  )),
  privacy_state text NOT NULL CHECK (privacy_state IN ('PASS', 'HOLD', 'FAIL')),
  deletion_state text NOT NULL CHECK (deletion_state IN ('ACTIVE', 'DELETED', 'UNKNOWN')),
  raw_source_body_persisted boolean NOT NULL DEFAULT false CHECK (raw_source_body_persisted = false),
  publication_eligible boolean NOT NULL,
  decision text NOT NULL CHECK (decision IN (
    'ELIGIBLE_SYNTHETIC_LAB', 'HOLD_ACCESS_OR_TERMS',
    'HOLD_ATTRIBUTION_OR_QUOTATION', 'HOLD_PRIVACY', 'WITHDRAW_SOURCE_DELETED'
  )),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  assessed_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT community_external_source_decision CHECK (
    (
      decision = 'WITHDRAW_SOURCE_DELETED'
      AND (deletion_state = 'DELETED' OR source_visibility = 'DELETED')
    ) OR (
      decision = 'HOLD_ACCESS_OR_TERMS'
      AND deletion_state <> 'DELETED'
      AND source_visibility <> 'DELETED'
      AND (
        source_visibility <> 'PUBLIC'
        OR provider_terms_state <> 'ALLOWED'
        OR deletion_state <> 'ACTIVE'
      )
    ) OR (
      decision = 'HOLD_ATTRIBUTION_OR_QUOTATION'
      AND deletion_state = 'ACTIVE'
      AND source_visibility = 'PUBLIC'
      AND provider_terms_state = 'ALLOWED'
      AND (attribution_state <> 'COMPLETE' OR quotation_state = 'WITHHELD')
    ) OR (
      decision = 'HOLD_PRIVACY'
      AND deletion_state = 'ACTIVE'
      AND source_visibility = 'PUBLIC'
      AND provider_terms_state = 'ALLOWED'
      AND attribution_state = 'COMPLETE'
      AND quotation_state <> 'WITHHELD'
      AND privacy_state <> 'PASS'
    ) OR (
      decision = 'ELIGIBLE_SYNTHETIC_LAB'
      AND deletion_state = 'ACTIVE'
      AND source_visibility = 'PUBLIC'
      AND provider_terms_state = 'ALLOWED'
      AND attribution_state = 'COMPLETE'
      AND quotation_state <> 'WITHHELD'
      AND privacy_state = 'PASS'
    )
  ),
  CONSTRAINT community_external_source_publication_gate CHECK (
    publication_eligible = (decision = 'ELIGIBLE_SYNTHETIC_LAB')
  )
);

CREATE TABLE IF NOT EXISTS community_deleted_source_retention_decisions (
  decision_id text PRIMARY KEY CHECK (decision_id ~ '^ARRETENTION-[A-Z0-9_-]{8,64}$'),
  source_event_id text NOT NULL REFERENCES community_forum_events(event_id),
  source_version integer NOT NULL CHECK (source_version > 0),
  lead_id text NOT NULL,
  lead_version integer NOT NULL CHECK (lead_version > 0),
  public_version_id text NOT NULL REFERENCES community_lead_public_versions(public_version_id),
  source_deleted boolean NOT NULL DEFAULT true CHECK (source_deleted = true),
  source_body_retained boolean NOT NULL DEFAULT false
    CONSTRAINT community_deleted_source_no_body CHECK (source_body_retained = false),
  provenance_retained boolean NOT NULL DEFAULT true
    CONSTRAINT community_deleted_source_provenance_retained CHECK (provenance_retained = true),
  reporter_public_lead_consent_state text NOT NULL CHECK (
    reporter_public_lead_consent_state IN ('YES', 'NO', 'WITHDRAWN', 'NOT_ASKED')
  ),
  lead_consent_independent_of_source_post boolean NOT NULL,
  privacy_policy_state text NOT NULL CHECK (privacy_policy_state IN ('PASS', 'HOLD', 'FAIL')),
  disposition text NOT NULL CHECK (disposition IN (
    'RETAIN_DEIDENTIFIED_LEAD', 'WITHDRAW_PUBLIC_PROJECTION', 'HOLD_REVIEW'
  )),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  assessed_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (lead_id, lead_version) REFERENCES community_leads(lead_id, lead_version),
  CONSTRAINT community_deleted_source_retention_disposition CHECK (
    (
      disposition = 'WITHDRAW_PUBLIC_PROJECTION'
      AND reporter_public_lead_consent_state IN ('NO', 'WITHDRAWN')
    ) OR (
      disposition = 'RETAIN_DEIDENTIFIED_LEAD'
      AND reporter_public_lead_consent_state = 'YES'
      AND lead_consent_independent_of_source_post = true
      AND privacy_policy_state = 'PASS'
    ) OR (
      disposition = 'HOLD_REVIEW'
      AND reporter_public_lead_consent_state NOT IN ('NO', 'WITHDRAWN')
      AND NOT (
        reporter_public_lead_consent_state = 'YES'
        AND lead_consent_independent_of_source_post = true
        AND privacy_policy_state = 'PASS'
      )
    )
  )
);

CREATE OR REPLACE FUNCTION validate_community_deleted_source_retention()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_record record;
  public_record record;
  lead_source_aggregate_id text;
BEGIN
  SELECT event_type, source_version, aggregate_id INTO source_record
  FROM community_forum_events WHERE event_id = NEW.source_event_id;
  SELECT lead_id, lead_version INTO public_record
  FROM community_lead_public_versions WHERE public_version_id = NEW.public_version_id;
  SELECT event.aggregate_id INTO lead_source_aggregate_id
  FROM community_leads lead_record
  JOIN community_forum_events event ON event.event_id = lead_record.source_event_id
  WHERE lead_record.lead_id = NEW.lead_id
    AND lead_record.lead_version = NEW.lead_version;
  IF source_record.event_type IS DISTINCT FROM 'forum.post.deleted.v1'
     OR source_record.source_version IS DISTINCT FROM NEW.source_version
  THEN
    RAISE EXCEPTION 'COMMUNITY_RETENTION_SOURCE_NOT_DELETED';
  END IF;
  IF public_record.lead_id IS DISTINCT FROM NEW.lead_id
     OR public_record.lead_version IS DISTINCT FROM NEW.lead_version
  THEN
    RAISE EXCEPTION 'COMMUNITY_RETENTION_PUBLIC_VERSION_MISMATCH';
  END IF;
  IF lead_source_aggregate_id IS DISTINCT FROM source_record.aggregate_id THEN
    RAISE EXCEPTION 'COMMUNITY_RETENTION_SOURCE_AGGREGATE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_deleted_source_retention_dependency ON community_deleted_source_retention_decisions;
CREATE TRIGGER community_deleted_source_retention_dependency
BEFORE INSERT ON community_deleted_source_retention_decisions
FOR EACH ROW EXECUTE FUNCTION validate_community_deleted_source_retention();

CREATE TABLE IF NOT EXISTS community_private_intake_boundaries (
  boundary_id text PRIMARY KEY CHECK (boundary_id ~ '^ARPRIVATE-[A-Z0-9_-]{8,64}$'),
  intake_id text NOT NULL UNIQUE CHECK (intake_id ~ '^ARSYN-[A-Z0-9_-]{6,64}$'),
  intake_class text NOT NULL DEFAULT 'PAID_PRIVATE' CHECK (intake_class = 'PAID_PRIVATE'),
  source_visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (source_visibility = 'PRIVATE'),
  initial_public_lead_consent_state text NOT NULL CHECK (
    initial_public_lead_consent_state IN ('NOT_ASKED', 'NO', 'WITHDRAWN')
  ),
  forum_record_created boolean NOT NULL DEFAULT false
    CONSTRAINT community_private_intake_no_forum CHECK (forum_record_created = false),
  public_projection_created boolean NOT NULL DEFAULT false
    CONSTRAINT community_private_intake_no_public_projection CHECK (public_projection_created = false),
  later_separate_public_lead_workflow_required boolean NOT NULL DEFAULT true
    CHECK (later_separate_public_lead_workflow_required = true),
  raw_intake_body_persisted boolean NOT NULL DEFAULT false CHECK (raw_intake_body_persisted = false),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only = true),
  lab_only boolean NOT NULL DEFAULT true CHECK (lab_only = true),
  assessed_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'community_privacy_publication_gates',
    'community_external_source_extraction_boundaries',
    'community_deleted_source_retention_decisions',
    'community_private_intake_boundaries'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS community_privacy_gate_lead_idx
  ON community_privacy_publication_gates (lead_id, lead_version);
CREATE INDEX IF NOT EXISTS community_external_source_id_idx
  ON community_external_source_extraction_boundaries (external_source_id);
CREATE INDEX IF NOT EXISTS community_deleted_source_retention_lead_idx
  ON community_deleted_source_retention_decisions (lead_id, lead_version);

REVOKE ALL ON ALL TABLES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA __SCHEMA__ FROM PUBLIC;
