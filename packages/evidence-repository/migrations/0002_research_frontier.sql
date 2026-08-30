CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS research_frontiers (
  frontier_id uuid PRIMARY KEY,
  question_id uuid NOT NULL UNIQUE REFERENCES questions(question_id),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS frontier_lanes (
  lane_id uuid PRIMARY KEY,
  frontier_id uuid NOT NULL REFERENCES research_frontiers(frontier_id),
  canonical_key text NOT NULL,
  source_class text NOT NULL CHECK (source_class IN (
    'study', 'review', 'guideline', 'registry', 'book', 'grey_literature', 'other'
  )),
  provider text NOT NULL CHECK (
    length(provider) > 0 AND lower(provider) !~ '(youtube|youtu\.be|reddit|forum|community)'
  ),
  label text NOT NULL CHECK (length(label) > 0),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (frontier_id, canonical_key)
);

CREATE TABLE IF NOT EXISTS frontier_contributions (
  contribution_id uuid PRIMARY KEY,
  frontier_id uuid NOT NULL REFERENCES research_frontiers(frontier_id),
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL UNIQUE,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS discovery_passes (
  pass_id uuid PRIMARY KEY,
  contribution_id uuid NOT NULL REFERENCES frontier_contributions(contribution_id),
  lane_id uuid NOT NULL REFERENCES frontier_lanes(lane_id),
  executed_at timestamptz NOT NULL,
  deidentified_query text NOT NULL CHECK (length(deidentified_query) > 0),
  query_sha256 char(64) NOT NULL CHECK (query_sha256 ~ '^[a-f0-9]{64}$'),
  query_bytes bigint NOT NULL CHECK (query_bytes > 0),
  coverage_basis text NOT NULL CHECK (coverage_basis IN ('publication_date', 'index_date', 'provider_unspecified')),
  requested_start date,
  requested_end_exclusive date,
  confirmed_start date,
  confirmed_end_exclusive date,
  coverage_relation text NOT NULL CHECK (coverage_relation IN (
    'initial', 'full_refresh', 'contiguous_delta', 'overlap_delta', 'gap_delta', 'unscoped'
  )),
  delta_from_pass_id uuid REFERENCES discovery_passes(pass_id),
  status text NOT NULL CHECK (status IN ('complete', 'partial', 'blocked_retryable', 'blocked_terminal')),
  access_status text NOT NULL CHECK (access_status IN (
    'complete', 'api_visible_complete', 'partial', 'abstract_only', 'metadata_only',
    'inaccessible', 'rate_limited', 'not_found', 'error'
  )),
  exhausted boolean NOT NULL,
  retrieved_candidate_count integer NOT NULL CHECK (retrieved_candidate_count >= 0),
  screened_candidate_count integer NOT NULL CHECK (screened_candidate_count >= 0),
  selected_candidate_count integer NOT NULL CHECK (selected_candidate_count >= 0),
  next_capability text,
  blocked_reason_code text,
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  limitations jsonb NOT NULL CHECK (jsonb_typeof(limitations) = 'array'),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((requested_start IS NULL) = (requested_end_exclusive IS NULL)),
  CHECK ((confirmed_start IS NULL) = (confirmed_end_exclusive IS NULL)),
  CHECK (requested_start IS NULL OR requested_start < requested_end_exclusive),
  CHECK (confirmed_start IS NULL OR confirmed_start < confirmed_end_exclusive),
  CHECK (selected_candidate_count <= screened_candidate_count),
  CHECK (screened_candidate_count <= retrieved_candidate_count),
  CHECK ((coverage_basis = 'provider_unspecified') = (requested_start IS NULL)),
  CHECK ((coverage_relation IN ('contiguous_delta', 'overlap_delta', 'gap_delta')) = (delta_from_pass_id IS NOT NULL)),
  CHECK (coverage_relation <> 'unscoped' OR (requested_start IS NULL AND delta_from_pass_id IS NULL)),
  CHECK (
    (status = 'complete' AND exhausted AND next_capability IS NULL AND blocked_reason_code IS NULL
      AND requested_start IS NOT DISTINCT FROM confirmed_start
      AND requested_end_exclusive IS NOT DISTINCT FROM confirmed_end_exclusive)
    OR
    (status = 'partial' AND NOT exhausted AND next_capability IS NOT NULL AND blocked_reason_code IS NULL)
    OR
    (status = 'blocked_retryable' AND NOT exhausted AND next_capability IS NOT NULL
      AND blocked_reason_code IS NOT NULL AND confirmed_start IS NULL)
    OR
    (status = 'blocked_terminal' AND NOT exhausted AND next_capability IS NULL
      AND blocked_reason_code IS NOT NULL AND confirmed_start IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS frontier_candidates (
  candidate_id uuid PRIMARY KEY,
  frontier_id uuid NOT NULL REFERENCES research_frontiers(frontier_id),
  candidate_kind text NOT NULL CHECK (candidate_kind IN (
    'study', 'review', 'guideline', 'registry', 'book', 'grey_literature', 'other'
  )),
  identity_hash char(64) NOT NULL CHECK (identity_hash ~ '^[a-f0-9]{64}$'),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (frontier_id, identity_hash)
);

CREATE TABLE IF NOT EXISTS frontier_candidate_identifiers (
  candidate_id uuid NOT NULL REFERENCES frontier_candidates(candidate_id),
  scheme text NOT NULL CHECK (scheme IN ('doi', 'pmid', 'pmcid', 'arxiv', 'nct', 'isbn', 'url', 'other')),
  canonical_value text NOT NULL CHECK (
    length(canonical_value) > 0
    AND NOT (
      scheme = 'url'
      AND lower(canonical_value) ~ '(youtube\.com|youtu\.be|reddit\.com|/forums?(/|$))'
    )
  ),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (candidate_id, scheme, canonical_value)
);

CREATE TABLE IF NOT EXISTS frontier_candidate_versions (
  version_id uuid PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES frontier_candidates(candidate_id),
  contribution_id uuid NOT NULL REFERENCES frontier_contributions(contribution_id),
  observed_in_pass_id uuid NOT NULL REFERENCES discovery_passes(pass_id),
  display_title text NOT NULL CHECK (length(display_title) > 0),
  publication_date date,
  decision text NOT NULL CHECK (decision IN ('selected', 'excluded', 'deferred', 'unresolved')),
  decision_reason text NOT NULL CHECK (length(decision_reason) > 0),
  relevance_summary text NOT NULL CHECK (length(relevance_summary) > 0),
  source_family_id uuid REFERENCES source_families(family_id),
  previous_version_id uuid REFERENCES frontier_candidate_versions(version_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (previous_version_id),
  UNIQUE (candidate_id, observed_in_pass_id),
  CHECK (previous_version_id IS NULL OR previous_version_id <> version_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS frontier_candidate_one_initial_version
  ON frontier_candidate_versions (candidate_id) WHERE previous_version_id IS NULL;

CREATE TABLE IF NOT EXISTS frontier_trails (
  trail_id uuid PRIMARY KEY,
  frontier_id uuid NOT NULL REFERENCES research_frontiers(frontier_id),
  trail_kind text NOT NULL CHECK (trail_kind IN (
    'unresolved_question', 'unattempted_search', 'blocked_source', 'formal_followup',
    'discriminator_search', 'coverage_gap', 'delta_search'
  )),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS frontier_trail_versions (
  version_id uuid PRIMARY KEY,
  trail_id uuid NOT NULL REFERENCES frontier_trails(trail_id),
  contribution_id uuid NOT NULL REFERENCES frontier_contributions(contribution_id),
  lane_id uuid REFERENCES frontier_lanes(lane_id),
  target_start date,
  target_end_exclusive date,
  description text NOT NULL CHECK (length(description) > 0),
  rationale text NOT NULL CHECK (length(rationale) > 0),
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'decision_critical')),
  state text NOT NULL CHECK (state IN ('open', 'ready', 'blocked_retryable', 'blocked_terminal', 'resolved', 'cancelled')),
  next_capability text,
  blocked_reason_code text,
  resolution_note text,
  previous_version_id uuid REFERENCES frontier_trail_versions(version_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (previous_version_id),
  CHECK (previous_version_id IS NULL OR previous_version_id <> version_id),
  CHECK ((target_start IS NULL) = (target_end_exclusive IS NULL)),
  CHECK (target_start IS NULL OR target_start < target_end_exclusive),
  CHECK (
    (state IN ('open', 'ready') AND next_capability IS NOT NULL AND blocked_reason_code IS NULL AND resolution_note IS NULL)
    OR
    (state = 'blocked_retryable' AND next_capability IS NOT NULL AND blocked_reason_code IS NOT NULL AND resolution_note IS NULL)
    OR
    (state = 'blocked_terminal' AND next_capability IS NULL AND blocked_reason_code IS NOT NULL AND resolution_note IS NULL)
    OR
    (state IN ('resolved', 'cancelled') AND next_capability IS NULL AND resolution_note IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS frontier_trail_one_initial_version
  ON frontier_trail_versions (trail_id) WHERE previous_version_id IS NULL;

CREATE OR REPLACE FUNCTION validate_discovery_pass_delta() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prior_lane_id uuid;
  prior_end date;
  actual_relation text;
  lane_frontier_id uuid;
  contribution_frontier_id uuid;
  existing_coverage_basis text;
BEGIN
  SELECT frontier_id INTO lane_frontier_id FROM frontier_lanes WHERE lane_id = NEW.lane_id;
  SELECT frontier_id INTO contribution_frontier_id
    FROM frontier_contributions WHERE contribution_id = NEW.contribution_id;
  IF lane_frontier_id IS NULL OR contribution_frontier_id IS NULL OR lane_frontier_id <> contribution_frontier_id THEN
    RAISE EXCEPTION 'FRONTIER_PASS_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  SELECT coverage_basis INTO existing_coverage_basis
    FROM discovery_passes WHERE lane_id = NEW.lane_id LIMIT 1;
  IF existing_coverage_basis IS NOT NULL AND existing_coverage_basis <> NEW.coverage_basis THEN
    RAISE EXCEPTION 'FRONTIER_LANE_COVERAGE_BASIS_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.delta_from_pass_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT lane_id, confirmed_end_exclusive INTO prior_lane_id, prior_end
    FROM discovery_passes WHERE pass_id = NEW.delta_from_pass_id;
  IF prior_lane_id IS NULL OR prior_lane_id <> NEW.lane_id OR prior_end IS NULL OR NEW.requested_start IS NULL THEN
    RAISE EXCEPTION 'FRONTIER_DELTA_PRIOR_COVERAGE_INVALID' USING ERRCODE = '23514';
  END IF;
  actual_relation := CASE
    WHEN NEW.requested_start = prior_end THEN 'contiguous_delta'
    WHEN NEW.requested_start < prior_end THEN 'overlap_delta'
    ELSE 'gap_delta'
  END;
  IF NEW.coverage_relation <> actual_relation THEN
    RAISE EXCEPTION 'FRONTIER_DELTA_RELATION_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discovery_pass_delta_guard ON discovery_passes;
CREATE TRIGGER discovery_pass_delta_guard
  BEFORE INSERT ON discovery_passes
  FOR EACH ROW EXECUTE FUNCTION validate_discovery_pass_delta();

CREATE OR REPLACE FUNCTION validate_frontier_candidate_lineage() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prior_candidate_id uuid;
  candidate_frontier_id uuid;
  stored_candidate_kind text;
  contribution_frontier_id uuid;
  pass_frontier_id uuid;
  linked_source_kind text;
  linked_source_identity_matches boolean;
BEGIN
  SELECT candidate.frontier_id, candidate.candidate_kind
    INTO candidate_frontier_id, stored_candidate_kind
    FROM frontier_candidates candidate WHERE candidate.candidate_id = NEW.candidate_id;
  SELECT frontier_id INTO contribution_frontier_id
    FROM frontier_contributions WHERE contribution_id = NEW.contribution_id;
  SELECT lane.frontier_id INTO pass_frontier_id
    FROM discovery_passes pass
    JOIN frontier_lanes lane ON lane.lane_id = pass.lane_id
    WHERE pass.pass_id = NEW.observed_in_pass_id;
  IF candidate_frontier_id IS NULL OR contribution_frontier_id IS NULL OR pass_frontier_id IS NULL
     OR candidate_frontier_id <> contribution_frontier_id
     OR candidate_frontier_id <> pass_frontier_id THEN
    RAISE EXCEPTION 'FRONTIER_CANDIDATE_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_family_id IS NOT NULL THEN
    SELECT source_kind INTO linked_source_kind
      FROM source_families WHERE family_id = NEW.source_family_id;
    SELECT EXISTS (
      SELECT 1
      FROM frontier_candidate_identifiers candidate_identifier
      JOIN source_identifiers source_identifier
        ON source_identifier.scheme = candidate_identifier.scheme
       AND source_identifier.canonical_value = candidate_identifier.canonical_value
      WHERE candidate_identifier.candidate_id = NEW.candidate_id
        AND source_identifier.family_id = NEW.source_family_id
    ) INTO linked_source_identity_matches;
    IF linked_source_kind IS NULL
       OR (
         stored_candidate_kind IN ('study', 'review', 'guideline', 'registry')
         AND linked_source_kind <> stored_candidate_kind
       )
       OR (
         stored_candidate_kind IN ('book', 'grey_literature', 'other')
         AND linked_source_kind <> 'other'
       )
       OR NOT linked_source_identity_matches THEN
      RAISE EXCEPTION 'FRONTIER_CANDIDATE_SOURCE_IDENTITY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.previous_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT candidate_id INTO prior_candidate_id
    FROM frontier_candidate_versions WHERE version_id = NEW.previous_version_id;
  IF prior_candidate_id IS NULL OR prior_candidate_id <> NEW.candidate_id THEN
    RAISE EXCEPTION 'FRONTIER_CANDIDATE_LINEAGE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS frontier_candidate_lineage_guard ON frontier_candidate_versions;
CREATE TRIGGER frontier_candidate_lineage_guard
  BEFORE INSERT ON frontier_candidate_versions
  FOR EACH ROW EXECUTE FUNCTION validate_frontier_candidate_lineage();

CREATE OR REPLACE FUNCTION validate_frontier_trail_lineage() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prior_trail_id uuid;
  trail_frontier_id uuid;
  contribution_frontier_id uuid;
  lane_frontier_id uuid;
BEGIN
  SELECT frontier_id INTO trail_frontier_id
    FROM frontier_trails WHERE trail_id = NEW.trail_id;
  SELECT frontier_id INTO contribution_frontier_id
    FROM frontier_contributions WHERE contribution_id = NEW.contribution_id;
  IF NEW.lane_id IS NOT NULL THEN
    SELECT frontier_id INTO lane_frontier_id FROM frontier_lanes WHERE lane_id = NEW.lane_id;
  END IF;
  IF trail_frontier_id IS NULL OR contribution_frontier_id IS NULL
     OR trail_frontier_id <> contribution_frontier_id
     OR (NEW.lane_id IS NOT NULL AND (lane_frontier_id IS NULL OR trail_frontier_id <> lane_frontier_id)) THEN
    RAISE EXCEPTION 'FRONTIER_TRAIL_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.previous_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT trail_id INTO prior_trail_id
    FROM frontier_trail_versions WHERE version_id = NEW.previous_version_id;
  IF prior_trail_id IS NULL OR prior_trail_id <> NEW.trail_id THEN
    RAISE EXCEPTION 'FRONTIER_TRAIL_LINEAGE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS frontier_trail_lineage_guard ON frontier_trail_versions;
CREATE TRIGGER frontier_trail_lineage_guard
  BEFORE INSERT ON frontier_trail_versions
  FOR EACH ROW EXECUTE FUNCTION validate_frontier_trail_lineage();

CREATE OR REPLACE VIEW frontier_candidate_current_projection AS
SELECT
  candidate.candidate_id,
  candidate.frontier_id,
  candidate.candidate_kind,
  candidate.identity_hash,
  latest.version_id,
  latest.observed_in_pass_id,
  latest.display_title,
  latest.publication_date,
  latest.decision,
  latest.decision_reason,
  latest.relevance_summary,
  latest.source_family_id
FROM frontier_candidates candidate
JOIN LATERAL (
  SELECT version.* FROM frontier_candidate_versions version
  WHERE version.candidate_id = candidate.candidate_id
    AND NOT EXISTS (
      SELECT 1 FROM frontier_candidate_versions child
      WHERE child.previous_version_id = version.version_id
    )
  ORDER BY version.inserted_at DESC, version.version_id DESC
  LIMIT 1
) latest ON true;

CREATE OR REPLACE VIEW frontier_trail_current_projection AS
SELECT
  trail.trail_id,
  trail.frontier_id,
  trail.trail_kind,
  latest.version_id,
  latest.lane_id,
  latest.target_start,
  latest.target_end_exclusive,
  latest.description,
  latest.rationale,
  latest.priority,
  latest.state,
  latest.next_capability,
  latest.blocked_reason_code,
  latest.resolution_note
FROM frontier_trails trail
JOIN LATERAL (
  SELECT version.* FROM frontier_trail_versions version
  WHERE version.trail_id = trail.trail_id
    AND NOT EXISTS (
      SELECT 1 FROM frontier_trail_versions child
      WHERE child.previous_version_id = version.version_id
    )
  ORDER BY version.inserted_at DESC, version.version_id DESC
  LIMIT 1
) latest ON true;

CREATE OR REPLACE VIEW frontier_lane_delta_state AS
SELECT
  lane.lane_id,
  lane.frontier_id,
  lane.canonical_key,
  lane.source_class,
  lane.provider,
  pass_state.latest_confirmed_end_exclusive,
  gap_state.open_gap_count,
  CASE
    WHEN gap_state.open_gap_count > 0 THEN gap_state.first_gap_start
    ELSE pass_state.latest_confirmed_end_exclusive
  END AS next_delta_start
FROM frontier_lanes lane
LEFT JOIN LATERAL (
  SELECT max(pass.confirmed_end_exclusive) AS latest_confirmed_end_exclusive
  FROM discovery_passes pass
  WHERE pass.lane_id = lane.lane_id
    AND pass.status = 'complete'
    AND pass.confirmed_end_exclusive IS NOT NULL
) pass_state ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS open_gap_count,
    min(gap.target_start) AS first_gap_start
  FROM frontier_trail_current_projection gap
  WHERE gap.lane_id = lane.lane_id
    AND gap.trail_kind = 'coverage_gap'
    AND gap.state NOT IN ('resolved', 'cancelled')
) gap_state ON true;

CREATE OR REPLACE FUNCTION validate_frontier_contribution_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE invalid_counts boolean;
DECLARE missing_gap boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM discovery_passes pass
    WHERE pass.contribution_id = NEW.contribution_id
      AND (
        pass.screened_candidate_count <> (
          SELECT count(*) FROM frontier_candidate_versions version
          WHERE version.observed_in_pass_id = pass.pass_id
        )
        OR pass.selected_candidate_count <> (
          SELECT count(*) FROM frontier_candidate_versions version
          WHERE version.observed_in_pass_id = pass.pass_id AND version.decision = 'selected'
        )
      )
  ) INTO invalid_counts;
  IF invalid_counts THEN
    RAISE EXCEPTION 'FRONTIER_PASS_CANDIDATE_COUNT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM discovery_passes pass
    JOIN discovery_passes prior ON prior.pass_id = pass.delta_from_pass_id
    WHERE pass.contribution_id = NEW.contribution_id
      AND pass.coverage_relation = 'gap_delta'
      AND NOT EXISTS (
        SELECT 1
        FROM frontier_trail_current_projection gap
        WHERE gap.frontier_id = NEW.frontier_id
          AND gap.trail_kind = 'coverage_gap'
          AND gap.lane_id = pass.lane_id
          AND gap.target_start = prior.confirmed_end_exclusive
          AND gap.target_end_exclusive = pass.requested_start
          AND gap.state NOT IN ('resolved', 'cancelled')
      )
  ) INTO missing_gap;
  IF missing_gap THEN
    RAISE EXCEPTION 'FRONTIER_GAP_TRAIL_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS frontier_contribution_integrity_guard ON frontier_contributions;
CREATE CONSTRAINT TRIGGER frontier_contribution_integrity_guard
  AFTER INSERT ON frontier_contributions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_frontier_contribution_integrity();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'research_frontiers', 'frontier_lanes', 'frontier_contributions', 'discovery_passes',
    'frontier_candidates', 'frontier_candidate_identifiers', 'frontier_candidate_versions',
    'frontier_trails', 'frontier_trail_versions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS discovery_passes_lane_executed_idx
  ON discovery_passes (lane_id, executed_at DESC, pass_id DESC);
CREATE INDEX IF NOT EXISTS frontier_candidate_versions_pass_idx
  ON frontier_candidate_versions (observed_in_pass_id, decision);
CREATE INDEX IF NOT EXISTS frontier_candidate_title_full_text_idx
  ON frontier_candidate_versions USING gin (to_tsvector('simple', display_title || ' ' || relevance_summary));
CREATE INDEX IF NOT EXISTS frontier_trail_description_full_text_idx
  ON frontier_trail_versions USING gin (to_tsvector('simple', description || ' ' || rationale));

REVOKE ALL ON ALL TABLES IN SCHEMA __SCHEMA__ FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA __SCHEMA__ FROM PUBLIC;
