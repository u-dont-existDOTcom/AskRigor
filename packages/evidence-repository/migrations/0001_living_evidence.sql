CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id text PRIMARY KEY,
  migration_sha256 char(64) NOT NULL CHECK (migration_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS protocol_manifests (
  sha256 char(64) PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  name text NOT NULL,
  version text NOT NULL,
  revision_date date NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS research_runs (
  run_id uuid PRIMARY KEY,
  run_kind text NOT NULL CHECK (run_kind IN ('live_research', 'historical_import', 'clarification', 'correction', 'synthetic_fixture')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
  protocol_manifest_sha256s jsonb NOT NULL CHECK (jsonb_typeof(protocol_manifest_sha256s) = 'array'),
  provenance_note text NOT NULL CHECK (length(provenance_note) > 0),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS topics (
  topic_id uuid PRIMARY KEY,
  canonical_key text NOT NULL UNIQUE,
  label text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS topic_aliases (
  topic_id uuid NOT NULL REFERENCES topics(topic_id),
  alias text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (topic_id, alias),
  UNIQUE (alias)
);

CREATE TABLE IF NOT EXISTS topic_edges (
  edge_id uuid PRIMARY KEY,
  from_topic_id uuid NOT NULL REFERENCES topics(topic_id),
  to_topic_id uuid NOT NULL REFERENCES topics(topic_id),
  relation text NOT NULL CHECK (relation IN ('broader_than', 'narrower_than', 'related_to')),
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (from_topic_id, to_topic_id, relation),
  CHECK (from_topic_id <> to_topic_id)
);

CREATE TABLE IF NOT EXISTS questions (
  question_id uuid PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES topics(topic_id),
  normalized_question text NOT NULL,
  population text,
  program_or_exposure text,
  comparator text,
  outcome text,
  horizon text,
  setting text,
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS source_families (
  family_id uuid PRIMARY KEY,
  source_kind text NOT NULL CHECK (source_kind IN ('study', 'review', 'guideline', 'registry', 'other')),
  identity_hash char(64) NOT NULL UNIQUE CHECK (identity_hash ~ '^[a-f0-9]{64}$'),
  display_title text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS source_identifiers (
  family_id uuid NOT NULL REFERENCES source_families(family_id),
  scheme text NOT NULL CHECK (scheme IN ('doi', 'pmid', 'pmcid', 'arxiv', 'nct', 'url', 'other')),
  canonical_value text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (family_id, scheme, canonical_value),
  UNIQUE (scheme, canonical_value)
);

CREATE TABLE IF NOT EXISTS source_versions (
  version_id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES source_families(family_id),
  source_content_sha256 char(64) CHECK (source_content_sha256 IS NULL OR source_content_sha256 ~ '^[a-f0-9]{64}$'),
  access_status text NOT NULL CHECK (access_status IN ('complete', 'partial', 'abstract_only', 'metadata_only', 'inaccessible', 'not_found')),
  retrieved_at timestamptz,
  source_locator text,
  raw_content_persisted boolean NOT NULL DEFAULT false CHECK (raw_content_persisted = false),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE NULLS NOT DISTINCT (family_id, source_content_sha256, access_status, retrieved_at)
);

CREATE TABLE IF NOT EXISTS source_edges (
  edge_id uuid PRIMARY KEY,
  from_source_version_id uuid NOT NULL REFERENCES source_versions(version_id),
  to_source_version_id uuid NOT NULL REFERENCES source_versions(version_id),
  relation text NOT NULL CHECK (relation IN ('corrects', 'retracts', 'updates', 'includes', 'excludes', 'duplicates', 'shares_population_or_dataset_with')),
  confidence text NOT NULL CHECK (confidence IN ('verified', 'provider_reported', 'inferred', 'uncertain')),
  uncertainty text,
  supersedes_edge_id uuid REFERENCES source_edges(edge_id),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (from_source_version_id, to_source_version_id, relation),
  CHECK (from_source_version_id <> to_source_version_id)
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(question_id),
  claim_type text NOT NULL CHECK (claim_type IN ('effect', 'harm', 'method', 'applicability', 'access', 'other')),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS claim_versions (
  version_id uuid PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES claims(claim_id),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  normalized_assertion text NOT NULL CHECK (length(normalized_assertion) > 0),
  population text,
  program_or_exposure text,
  comparator text,
  outcome text,
  horizon text,
  setting text,
  direction text NOT NULL CHECK (direction IN ('benefit', 'harm', 'no_effect', 'mixed', 'descriptive', 'unclear')),
  inference_type text NOT NULL CHECK (inference_type IN ('causal', 'associational', 'descriptive', 'methodological', 'unknown')),
  capability_state text NOT NULL CHECK (capability_state IN ('can_support', 'cannot_support', 'uncertain')),
  uncertainty_and_limitations jsonb NOT NULL CHECK (jsonb_typeof(uncertainty_and_limitations) = 'array'),
  status text NOT NULL CHECK (status IN ('current', 'stale', 'superseded', 'invalidated')),
  supersedes_claim_version_id uuid REFERENCES claim_versions(version_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (supersedes_claim_version_id),
  CHECK (supersedes_claim_version_id IS NULL OR supersedes_claim_version_id <> version_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS claim_one_initial_version
  ON claim_versions (claim_id) WHERE supersedes_claim_version_id IS NULL;

CREATE TABLE IF NOT EXISTS claim_edges (
  edge_id uuid PRIMARY KEY,
  from_claim_version_id uuid NOT NULL REFERENCES claim_versions(version_id),
  to_claim_version_id uuid NOT NULL REFERENCES claim_versions(version_id),
  relation text NOT NULL CHECK (relation IN ('supports', 'refutes', 'qualifies', 'depends_on', 'duplicates', 'supersedes', 'contradicts')),
  confidence text NOT NULL CHECK (confidence IN ('verified', 'inferred', 'uncertain')),
  uncertainty text,
  supersedes_edge_id uuid REFERENCES claim_edges(edge_id),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (from_claim_version_id, to_claim_version_id, relation),
  CHECK (from_claim_version_id <> to_claim_version_id)
);

CREATE TABLE IF NOT EXISTS analyses (
  analysis_id uuid PRIMARY KEY,
  analysis_kind text NOT NULL,
  topic_id uuid REFERENCES topics(topic_id),
  source_family_id uuid REFERENCES source_families(family_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (topic_id IS NOT NULL OR source_family_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS analysis_versions (
  version_id uuid PRIMARY KEY,
  analysis_id uuid NOT NULL REFERENCES analyses(analysis_id),
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  source_version_id uuid REFERENCES source_versions(version_id),
  previous_version_id uuid REFERENCES analysis_versions(version_id),
  relationship text NOT NULL CHECK (relationship IN ('initial', 'clarifies', 'corrects', 'supersedes', 'invalidates')),
  capture_status text NOT NULL CHECK (capture_status IN ('complete_performed_analysis', 'partial_historical_capture', 'clarification', 'correction', 'invalidation')),
  authored_at timestamptz NOT NULL,
  coverage_statement text NOT NULL CHECK (length(coverage_statement) > 0),
  whole_text_sha256 char(64) NOT NULL CHECK (whole_text_sha256 ~ '^[a-f0-9]{64}$'),
  whole_text_bytes bigint NOT NULL CHECK (whole_text_bytes > 0),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL UNIQUE,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (previous_version_id),
  CHECK ((relationship = 'initial') = (previous_version_id IS NULL)),
  CHECK ((relationship <> 'invalidates') OR capture_status = 'invalidation')
);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_one_initial_version
  ON analysis_versions (analysis_id) WHERE previous_version_id IS NULL;

CREATE TABLE IF NOT EXISTS analysis_sections (
  version_id uuid NOT NULL REFERENCES analysis_versions(version_id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  section_key text NOT NULL,
  title text NOT NULL,
  content text NOT NULL CHECK (length(content) > 0),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  content_bytes bigint NOT NULL CHECK (content_bytes > 0),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (version_id, ordinal),
  UNIQUE (version_id, section_key)
);

CREATE TABLE IF NOT EXISTS analysis_domain_findings (
  version_id uuid NOT NULL REFERENCES analysis_versions(version_id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  rubric text NOT NULL CHECK (rubric IN ('study_method_v1', 'review_method_v1', 'general_analysis_v1')),
  domain text NOT NULL,
  status text NOT NULL CHECK (status IN ('adequate', 'limitation_identified', 'unclear', 'not_applicable')),
  finding text NOT NULL CHECK (length(finding) > 0),
  evidence_locators jsonb NOT NULL CHECK (jsonb_typeof(evidence_locators) = 'array'),
  unresolved_fields jsonb NOT NULL CHECK (jsonb_typeof(unresolved_fields) = 'array'),
  limitations jsonb NOT NULL CHECK (jsonb_typeof(limitations) = 'array'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (version_id, ordinal),
  UNIQUE (version_id, rubric, domain)
);

CREATE TABLE IF NOT EXISTS analysis_claim_capabilities (
  version_id uuid NOT NULL REFERENCES analysis_versions(version_id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  claim text NOT NULL CHECK (length(claim) > 0),
  capability text NOT NULL CHECK (capability IN ('can_support', 'cannot_support', 'unclear')),
  reason text NOT NULL CHECK (length(reason) > 0),
  evidence_locators jsonb NOT NULL CHECK (jsonb_typeof(evidence_locators) = 'array'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (version_id, ordinal)
);

CREATE TABLE IF NOT EXISTS future_analysis_items (
  item_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES analysis_versions(version_id),
  question text NOT NULL CHECK (length(question) > 0),
  rationale text NOT NULL CHECK (length(rationale) > 0),
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'decision_critical')),
  status text NOT NULL CHECK (status IN ('open', 'resolved', 'cancelled')),
  evidence_needed jsonb NOT NULL CHECK (jsonb_typeof(evidence_needed) = 'array'),
  resolved_by_version_id uuid REFERENCES analysis_versions(version_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (item_id, version_id),
  CHECK ((status = 'resolved') = (resolved_by_version_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS analysis_receipts (
  receipt_id uuid PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES analysis_versions(version_id),
  receipt_kind text NOT NULL,
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  locator text,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS assessments (
  assessment_id uuid NOT NULL,
  version_id uuid PRIMARY KEY,
  analysis_version_id uuid NOT NULL UNIQUE REFERENCES analysis_versions(version_id),
  source_version_id uuid NOT NULL REFERENCES source_versions(version_id),
  rubric text NOT NULL CHECK (rubric IN ('study_method_v1', 'review_method_v1', 'general_analysis_v1')),
  rubric_version text NOT NULL,
  assessor_type text NOT NULL CHECK (assessor_type IN ('deterministic_validator', 'model', 'human', 'imported_framework')),
  assessor_identifier text NOT NULL,
  internal_validity_status text NOT NULL CHECK (internal_validity_status IN ('adequate', 'limitation_identified', 'unclear', 'not_applicable')),
  internal_validity_reason text NOT NULL,
  applicability_status text NOT NULL CHECK (applicability_status IN ('adequate', 'limitation_identified', 'unclear', 'not_applicable')),
  applicability_reason text NOT NULL,
  disagreement_state text NOT NULL CHECK (disagreement_state IN ('none_recorded', 'unresolved', 'adjudicated')),
  supersedes_assessment_version_id uuid REFERENCES assessments(version_id),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (supersedes_assessment_version_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS assessment_one_initial_version
  ON assessments (assessment_id) WHERE supersedes_assessment_version_id IS NULL;

CREATE TABLE IF NOT EXISTS evidence_bindings (
  binding_id uuid PRIMARY KEY,
  claim_version_id uuid NOT NULL REFERENCES claim_versions(version_id),
  source_version_id uuid NOT NULL REFERENCES source_versions(version_id),
  locator text NOT NULL,
  polarity text NOT NULL CHECK (polarity IN ('supports', 'refutes', 'qualifies', 'context_only')),
  extraction_type text NOT NULL CHECK (extraction_type IN ('source_bound_audit', 'authored_synthesis', 'metadata_only', 'historical_import')),
  capability_ceiling text NOT NULL CHECK (capability_ceiling IN ('can_support', 'cannot_support', 'uncertain')),
  validation_receipt_id uuid REFERENCES analysis_receipts(receipt_id),
  limitations jsonb NOT NULL CHECK (jsonb_typeof(limitations) = 'array'),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (claim_version_id, source_version_id, locator, polarity)
);

CREATE TABLE IF NOT EXISTS freshness_policies (
  policy_id uuid PRIMARY KEY,
  source_family_id uuid NOT NULL REFERENCES source_families(family_id),
  source_class text NOT NULL CHECK (source_class IN ('study', 'review', 'guideline', 'registry', 'other')),
  cadence_days integer NOT NULL CHECK (cadence_days > 0),
  maximum_age_days integer NOT NULL CHECK (maximum_age_days > 0),
  owner_role text NOT NULL,
  required_checks jsonb NOT NULL CHECK (jsonb_typeof(required_checks) = 'array'),
  failure_behavior text NOT NULL CHECK (failure_behavior IN ('mark_stale', 'mark_inaccessible', 'block_current_projection')),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_family_id)
);

CREATE TABLE IF NOT EXISTS freshness_checks (
  check_id uuid PRIMARY KEY,
  policy_id uuid NOT NULL REFERENCES freshness_policies(policy_id),
  checked_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('current', 'changed', 'partial', 'inaccessible', 'error')),
  projection_state text NOT NULL CHECK (projection_state IN ('current', 'due', 'checking', 'stale', 'inaccessible', 'superseded', 'invalidated')),
  next_due_at timestamptz,
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  limitations jsonb NOT NULL CHECK (jsonb_typeof(limitations) = 'array'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS repository_events (
  event_id uuid PRIMARY KEY,
  event_kind text NOT NULL,
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  analysis_id uuid REFERENCES analyses(analysis_id),
  version_id uuid REFERENCES analysis_versions(version_id),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  event_at timestamptz NOT NULL,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS impact_jobs (
  job_id uuid PRIMARY KEY,
  triggering_event_id uuid NOT NULL REFERENCES repository_events(event_id),
  source_version_id uuid REFERENCES source_versions(version_id),
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  affected_claim_version_ids jsonb NOT NULL CHECK (jsonb_typeof(affected_claim_version_ids) = 'array'),
  impact_receipt_sha256 char(64) CHECK (impact_receipt_sha256 IS NULL OR impact_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  failure_code text,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION reject_living_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY_TABLE mutation rejected for %', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'protocol_manifests', 'research_runs', 'topics', 'topic_aliases', 'topic_edges', 'questions',
    'source_families', 'source_identifiers', 'source_versions', 'source_edges',
    'claims', 'claim_versions', 'claim_edges', 'analyses',
    'analysis_versions', 'analysis_sections', 'analysis_domain_findings',
    'analysis_claim_capabilities', 'future_analysis_items', 'analysis_receipts', 'assessments',
    'evidence_bindings', 'freshness_policies', 'freshness_checks', 'repository_events', 'impact_jobs'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION validate_analysis_lineage() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE previous_analysis_id uuid;
BEGIN
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT analysis_id INTO previous_analysis_id
      FROM analysis_versions WHERE version_id = NEW.previous_version_id;
    IF previous_analysis_id IS NULL OR previous_analysis_id <> NEW.analysis_id THEN
      RAISE EXCEPTION 'ANALYSIS_LINEAGE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analysis_lineage_guard ON analysis_versions;
CREATE TRIGGER analysis_lineage_guard
  BEFORE INSERT ON analysis_versions
  FOR EACH ROW EXECUTE FUNCTION validate_analysis_lineage();

CREATE OR REPLACE FUNCTION validate_future_analysis_resolution() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  creating_analysis_id uuid;
  resolving_analysis_id uuid;
  prior_open_item_exists boolean;
BEGIN
  IF NEW.status <> 'resolved' THEN
    RETURN NEW;
  END IF;
  SELECT analysis_id INTO creating_analysis_id
    FROM analysis_versions WHERE version_id = NEW.version_id;
  SELECT analysis_id INTO resolving_analysis_id
    FROM analysis_versions WHERE version_id = NEW.resolved_by_version_id;
  IF creating_analysis_id IS NULL OR resolving_analysis_id IS NULL OR creating_analysis_id <> resolving_analysis_id THEN
    RAISE EXCEPTION 'FUTURE_ANALYSIS_RESOLUTION_LINEAGE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM future_analysis_items prior_item
    JOIN analysis_versions prior_version ON prior_version.version_id = prior_item.version_id
    WHERE prior_item.item_id = NEW.item_id
      AND prior_item.status = 'open'
      AND prior_item.version_id <> NEW.version_id
      AND prior_version.analysis_id = creating_analysis_id
  ) INTO prior_open_item_exists;
  IF NOT prior_open_item_exists THEN
    RAISE EXCEPTION 'FUTURE_ANALYSIS_RESOLUTION_WITHOUT_OPEN_ITEM' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS future_analysis_resolution_guard ON future_analysis_items;
CREATE TRIGGER future_analysis_resolution_guard
  BEFORE INSERT ON future_analysis_items
  FOR EACH ROW EXECUTE FUNCTION validate_future_analysis_resolution();

CREATE OR REPLACE FUNCTION validate_topic_hierarchy_acyclic() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  new_parent uuid;
  new_child uuid;
  creates_cycle boolean;
BEGIN
  IF NEW.relation = 'related_to' THEN
    RETURN NEW;
  END IF;
  new_parent := CASE WHEN NEW.relation = 'broader_than' THEN NEW.from_topic_id ELSE NEW.to_topic_id END;
  new_child := CASE WHEN NEW.relation = 'broader_than' THEN NEW.to_topic_id ELSE NEW.from_topic_id END;
  WITH RECURSIVE descendants(node_id) AS (
    SELECT CASE WHEN edge.relation = 'broader_than' THEN edge.to_topic_id ELSE edge.from_topic_id END
    FROM topic_edges edge
    WHERE edge.relation IN ('broader_than', 'narrower_than')
      AND (CASE WHEN edge.relation = 'broader_than' THEN edge.from_topic_id ELSE edge.to_topic_id END) = new_child
    UNION
    SELECT CASE WHEN edge.relation = 'broader_than' THEN edge.to_topic_id ELSE edge.from_topic_id END
    FROM descendants prior
    JOIN topic_edges edge
      ON edge.relation IN ('broader_than', 'narrower_than')
     AND (CASE WHEN edge.relation = 'broader_than' THEN edge.from_topic_id ELSE edge.to_topic_id END) = prior.node_id
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE node_id = new_parent) INTO creates_cycle;
  IF creates_cycle THEN
    RAISE EXCEPTION 'TOPIC_HIERARCHY_CYCLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS topic_hierarchy_cycle_guard ON topic_edges;
CREATE TRIGGER topic_hierarchy_cycle_guard
  BEFORE INSERT ON topic_edges
  FOR EACH ROW EXECUTE FUNCTION validate_topic_hierarchy_acyclic();

CREATE OR REPLACE FUNCTION validate_source_edge_acyclic() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE creates_cycle boolean;
BEGIN
  IF NEW.relation NOT IN ('corrects', 'retracts', 'updates', 'includes', 'excludes') THEN
    RETURN NEW;
  END IF;
  WITH RECURSIVE descendants(node_id) AS (
    SELECT edge.to_source_version_id
    FROM source_edges edge
    WHERE edge.relation IN ('corrects', 'retracts', 'updates', 'includes', 'excludes')
      AND edge.from_source_version_id = NEW.to_source_version_id
    UNION
    SELECT edge.to_source_version_id
    FROM descendants prior
    JOIN source_edges edge ON edge.from_source_version_id = prior.node_id
    WHERE edge.relation IN ('corrects', 'retracts', 'updates', 'includes', 'excludes')
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE node_id = NEW.from_source_version_id) INTO creates_cycle;
  IF creates_cycle THEN
    RAISE EXCEPTION 'SOURCE_LINEAGE_CYCLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS source_edge_cycle_guard ON source_edges;
CREATE TRIGGER source_edge_cycle_guard
  BEFORE INSERT ON source_edges
  FOR EACH ROW EXECUTE FUNCTION validate_source_edge_acyclic();

CREATE OR REPLACE FUNCTION validate_claim_edge_acyclic() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE creates_cycle boolean;
BEGIN
  IF NEW.relation NOT IN ('depends_on', 'supersedes') THEN
    RETURN NEW;
  END IF;
  WITH RECURSIVE descendants(node_id) AS (
    SELECT edge.to_claim_version_id
    FROM claim_edges edge
    WHERE edge.relation IN ('depends_on', 'supersedes')
      AND edge.from_claim_version_id = NEW.to_claim_version_id
    UNION
    SELECT edge.to_claim_version_id
    FROM descendants prior
    JOIN claim_edges edge ON edge.from_claim_version_id = prior.node_id
    WHERE edge.relation IN ('depends_on', 'supersedes')
  )
  SELECT EXISTS (SELECT 1 FROM descendants WHERE node_id = NEW.from_claim_version_id) INTO creates_cycle;
  IF creates_cycle THEN
    RAISE EXCEPTION 'CLAIM_DEPENDENCY_CYCLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_edge_cycle_guard ON claim_edges;
CREATE TRIGGER claim_edge_cycle_guard
  BEFORE INSERT ON claim_edges
  FOR EACH ROW EXECUTE FUNCTION validate_claim_edge_acyclic();

CREATE OR REPLACE FUNCTION validate_evidence_binding_receipt_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE receipt_source_version_id uuid;
BEGIN
  IF NEW.validation_receipt_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT version.source_version_id INTO receipt_source_version_id
  FROM analysis_receipts receipt
  JOIN analysis_versions version ON version.version_id = receipt.version_id
  WHERE receipt.receipt_id = NEW.validation_receipt_id;
  IF receipt_source_version_id IS NULL OR receipt_source_version_id <> NEW.source_version_id THEN
    RAISE EXCEPTION 'EVIDENCE_BINDING_RECEIPT_SOURCE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_binding_receipt_source_guard ON evidence_bindings;
CREATE TRIGGER evidence_binding_receipt_source_guard
  BEFORE INSERT ON evidence_bindings
  FOR EACH ROW EXECUTE FUNCTION validate_evidence_binding_receipt_source();

CREATE OR REPLACE VIEW analysis_current_projection AS
SELECT
  a.analysis_id,
  latest.version_id,
  latest.capture_status,
  latest.relationship,
  latest.authored_at,
  latest.whole_text_sha256,
  latest.whole_text_bytes,
  (latest.relationship <> 'invalidates') AS usable
FROM analyses a
JOIN LATERAL (
  SELECT av.* FROM analysis_versions av
  WHERE av.analysis_id = a.analysis_id
    AND NOT EXISTS (
      SELECT 1 FROM analysis_versions child
      WHERE child.previous_version_id = av.version_id
    )
  ORDER BY av.inserted_at DESC, av.version_id DESC
  LIMIT 1
) latest ON true;

CREATE OR REPLACE VIEW claim_current_projection AS
SELECT
  c.claim_id,
  latest.version_id,
  c.question_id,
  latest.normalized_assertion,
  latest.capability_state,
  latest.status,
  latest.direction,
  latest.population,
  latest.program_or_exposure,
  latest.comparator,
  latest.outcome,
  latest.horizon,
  latest.setting,
  (
    latest.status = 'current'
    AND NOT EXISTS (
      SELECT 1 FROM impact_jobs pending_impact
      WHERE pending_impact.status <> 'complete'
        AND pending_impact.affected_claim_version_ids ? latest.version_id::text
    )
  ) AS usable
FROM claims c
JOIN LATERAL (
  SELECT cv.* FROM claim_versions cv
  WHERE cv.claim_id = c.claim_id
    AND NOT EXISTS (
      SELECT 1 FROM claim_versions child
      WHERE child.supersedes_claim_version_id = cv.version_id
    )
  ORDER BY cv.inserted_at DESC, cv.version_id DESC
  LIMIT 1
) latest ON true;

CREATE OR REPLACE VIEW source_current_freshness AS
SELECT
  sf.family_id,
  fp.policy_id,
  latest.checked_at,
  latest.outcome,
  CASE
    WHEN latest.projection_state IN ('superseded', 'invalidated', 'inaccessible', 'stale', 'checking') THEN latest.projection_state
    WHEN latest.next_due_at IS NOT NULL AND latest.next_due_at <= clock_timestamp() THEN 'due'
    ELSE latest.projection_state
  END AS projection_state,
  latest.next_due_at,
  latest.limitations
FROM source_families sf
LEFT JOIN freshness_policies fp ON fp.source_family_id = sf.family_id
LEFT JOIN LATERAL (
  SELECT fc.* FROM freshness_checks fc
  WHERE fc.policy_id = fp.policy_id
  ORDER BY fc.checked_at DESC, fc.inserted_at DESC, fc.check_id DESC
  LIMIT 1
) latest ON true;

CREATE INDEX IF NOT EXISTS analysis_sections_full_text_idx
  ON analysis_sections USING gin (to_tsvector('simple', title || ' ' || content));
CREATE INDEX IF NOT EXISTS claim_versions_full_text_idx
  ON claim_versions USING gin (to_tsvector('simple', normalized_assertion));
CREATE INDEX IF NOT EXISTS source_families_title_full_text_idx
  ON source_families USING gin (to_tsvector('simple', display_title));

REVOKE ALL ON SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA __SCHEMA__ FROM PUBLIC;
