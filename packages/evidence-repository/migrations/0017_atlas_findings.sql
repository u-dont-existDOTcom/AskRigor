SET search_path TO __SCHEMA__, public;

-- Atlas phase 2, part A (owner answers 159 and 160b, 2026-10-22; design
-- docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md, sections 3 and 5): the owner accepts findings from saved
-- findings cards into the evidence database. The owner's call records a decision and a hash-bound intent through the
-- five review functions below; the one-shot admin runner (living-evidence-admin promote-accepted) writes the canonical
-- rows. The public runtime never writes canonical evidence.
--
-- Two private review tables hold the owner's decisions and the queued intents. Decisions are deleted when a card is
-- forgotten (decision 7). No other row names a card: canonical rows never hold an ARF number, a thread key, a receipt
-- hash, an account, an answer quote, or YouTube or community data. Eight canonical Atlas tables are append-only; their
-- one exception is erase_atlas_wording(), which may replace the wording of a version a redaction row names with a fixed
-- marker. Safe to run again: every migration runs on each start, in one transaction.

-- Private review state ---------------------------------------------------------------------------------------------

-- Public finding numbers, F-1001 onward, never derived from ARF numbers. A number taken by an accept that later fails
-- stays with that accept's retry.
CREATE SEQUENCE IF NOT EXISTS atlas_public_number_seq AS bigint START WITH 1001 MINVALUE 1001 NO CYCLE;

-- The owner's queued Atlas writes. queue_position is the insertion order: the runner takes the oldest pending intent
-- first, because later intents depend on earlier ones. A payload never names a card; the decision row binds the card.
CREATE TABLE IF NOT EXISTS atlas_finding_intents (
  intent_id uuid PRIMARY KEY,
  queue_position bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  intent_kind text NOT NULL
    CHECK (intent_kind IN ('accept', 'recheck', 'revise', 'withdraw', 'link', 'unlink', 'erase')),
  public_number text NOT NULL CHECK (public_number ~ '^F-[1-9][0-9]{3,}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  owner_reason text CHECK (
    owner_reason IS NULL OR (owner_reason = btrim(owner_reason) AND length(owner_reason) BETWEEN 1 AND 2000)
  ),
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  receipt_json jsonb,
  receipt_sha256 char(64),
  failure_code text,
  failed_at timestamptz,
  retry_of_intent_id uuid REFERENCES atlas_finding_intents(intent_id),
  texts_erased_at timestamptz,
  CONSTRAINT atlas_finding_intents_v1_state_check CHECK (
    (status = 'PENDING' AND completed_at IS NULL
      AND receipt_json IS NULL AND receipt_sha256 IS NULL
      AND failure_code IS NULL AND failed_at IS NULL)
    OR
    (status = 'COMPLETED' AND completed_at IS NOT NULL
      AND receipt_json IS NOT NULL AND jsonb_typeof(receipt_json) = 'object'
      AND receipt_sha256 IS NOT NULL AND receipt_sha256 ~ '^[a-f0-9]{64}$'
      AND failure_code IS NULL AND failed_at IS NULL)
    OR
    (status = 'FAILED' AND completed_at IS NULL
      AND receipt_json IS NULL AND receipt_sha256 IS NULL
      AND failure_code IS NOT NULL AND failed_at IS NOT NULL)
  ),
  CONSTRAINT atlas_finding_intents_v1_times_check CHECK (
    (completed_at IS NULL OR created_at <= completed_at)
    AND (failed_at IS NULL OR created_at <= failed_at)
    AND (texts_erased_at IS NULL OR created_at <= texts_erased_at)
  ),
  CONSTRAINT atlas_finding_intents_v1_retry_check CHECK (
    retry_of_intent_id IS NULL OR retry_of_intent_id <> intent_id
  ),
  -- Wording is erased only from intents the runner has finished with (decision 7, part D's path).
  CONSTRAINT atlas_finding_intents_v1_erased_check CHECK (texts_erased_at IS NULL OR status <> 'PENDING')
);

-- The closed list of failure codes, in step with ATLAS_FINDING_PROMOTION_FAILURE_CODES; replaced on every run so the
-- list here is always the one in force (as 0012 does for contribution promotions).
ALTER TABLE atlas_finding_intents
  DROP CONSTRAINT IF EXISTS atlas_finding_intents_v1_failure_code_check;
ALTER TABLE atlas_finding_intents
  ADD CONSTRAINT atlas_finding_intents_v1_failure_code_check CHECK (
    failure_code IS NULL OR failure_code IN (
      'ATLAS_INTENT_APPLICATION_MISMATCH',
      'ATLAS_FINDING_ALREADY_WRITTEN',
      'ATLAS_FINDING_MISSING',
      'ATLAS_FINDING_WITHDRAWN',
      'ATLAS_VERSION_STALE',
      'ATLAS_TOPIC_MISSING',
      'ATLAS_RECHECK_KEY_MISMATCH',
      'ATLAS_LINK_TARGET_MISSING',
      'ATLAS_LINK_TARGET_WITHDRAWN',
      'ATLAS_LINK_LEAD',
      'ATLAS_LINK_PAIR_TAKEN',
      'ATLAS_LINK_ALREADY_RECORDED',
      'ATLAS_LINK_CYCLE',
      'ATLAS_LINK_MISSING',
      'SOURCE_IDENTIFIER_CONFLICT',
      'ATLAS_VERSION_LINEAGE_MISMATCH',
      'CLAIM_DEPENDENCY_CYCLE',
      'CANONICAL_UNIQUE_CONFLICT',
      'CANONICAL_REFERENCE_MISSING',
      'CANONICAL_CHECK_VIOLATION',
      'CANONICAL_VALUE_INVALID'
    )
  );

-- One live accept per public number: a retry of a FAILED accept reuses its number.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_finding_intents_live_accept_idx
  ON atlas_finding_intents (public_number)
  WHERE intent_kind = 'accept' AND status <> 'FAILED';

CREATE INDEX IF NOT EXISTS atlas_finding_intents_pending_idx
  ON atlas_finding_intents (queue_position)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS atlas_finding_intents_number_idx
  ON atlas_finding_intents (public_number, queue_position);

COMMENT ON TABLE atlas_finding_intents IS
  'Owner-decided Atlas writes awaiting the one-shot admin runner. Payloads hold the accepted texts, source identifiers and check results, the topic, question and numbers, the version stamp and the research day; never a card reference, account, thread key, receipt hash, answer quote, or YouTube or community data.';

-- The owner's decision on each card item. The only rows that name a card; forget_atlas_cards() deletes them.
CREATE TABLE IF NOT EXISTS atlas_card_decisions (
  card_number integer NOT NULL CHECK (card_number > 0),
  item_kind text NOT NULL CHECK (item_kind IN ('finding', 'open_lead')),
  item_number smallint NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted', 'accepted_as_lead', 'rechecked', 'rejected')),
  public_number text CHECK (public_number IS NULL OR public_number ~ '^F-[1-9][0-9]{3,}$'),
  card_sha256 char(64) NOT NULL CHECK (card_sha256 ~ '^[a-f0-9]{64}$'),
  owner_reason text CHECK (
    owner_reason IS NULL OR (owner_reason = btrim(owner_reason) AND length(owner_reason) BETWEEN 1 AND 2000)
  ),
  intent_id uuid REFERENCES atlas_finding_intents(intent_id),
  decided_at timestamptz NOT NULL,
  PRIMARY KEY (card_number, item_kind, item_number),
  CONSTRAINT atlas_card_decisions_v1_item_check CHECK (
    (item_kind = 'finding' AND item_number BETWEEN 1 AND 5)
    OR (item_kind = 'open_lead' AND item_number BETWEEN 1 AND 6)
  ),
  -- An open lead has no sources, so it is only ever a lead.
  CONSTRAINT atlas_card_decisions_v1_open_lead_check CHECK (
    item_kind <> 'open_lead' OR decision IN ('accepted_as_lead', 'rechecked', 'rejected')
  ),
  CONSTRAINT atlas_card_decisions_v1_outcome_check CHECK (
    (decision = 'rejected' AND public_number IS NULL AND intent_id IS NULL AND owner_reason IS NOT NULL)
    OR (decision <> 'rejected' AND public_number IS NOT NULL AND intent_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_card_decisions_intent_idx
  ON atlas_card_decisions (intent_id)
  WHERE intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_card_decisions_number_idx
  ON atlas_card_decisions (public_number)
  WHERE public_number IS NOT NULL;

COMMENT ON TABLE atlas_card_decisions IS
  'The owner''s decision on each findings-card item: the ARF issue number, the item, the decision, the F number, the card SHA-256 the owner inspected, the owner''s private reason and the time. Kept until the card is forgotten (decision 7).';

-- Canonical, append-only (append_only_guard), written only by the admin writer ------------------------------------

-- Which intents the canonical writer applied, under which run: the idempotent replay record.
CREATE TABLE IF NOT EXISTS atlas_intent_applications (
  intent_id uuid PRIMARY KEY,
  intent_kind text NOT NULL
    CHECK (intent_kind IN ('accept', 'recheck', 'revise', 'withdraw', 'link', 'unlink', 'erase')),
  public_number text NOT NULL CHECK (public_number ~ '^F-[1-9][0-9]{3,}$'),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  run_id uuid NOT NULL UNIQUE REFERENCES research_runs(run_id),
  applied_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A finding is a claim with versions in the existing claim model; leads are stored the same way (3b).
CREATE TABLE IF NOT EXISTS atlas_findings (
  finding_id uuid PRIMARY KEY,
  public_number text NOT NULL UNIQUE CHECK (public_number ~ '^F-[1-9][0-9]{3,}$'),
  claim_id uuid NOT NULL UNIQUE REFERENCES claims(claim_id),
  entry_kind text NOT NULL CHECK (entry_kind IN ('finding', 'lead')),
  lead_origin text CHECK (lead_origin IS NULL OR lead_origin IN ('unverified_finding', 'open_lead')),
  created_by_run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((entry_kind = 'lead') = (lead_origin IS NOT NULL))
);

-- Each claim version's Atlas fields. Verified bases and tags never hold the community ones (4a): comment_audit and
-- community_checked are not stored.
CREATE TABLE IF NOT EXISTS atlas_finding_versions (
  claim_version_id uuid PRIMARY KEY REFERENCES claim_versions(version_id),
  finding_id uuid NOT NULL REFERENCES atlas_findings(finding_id),
  version_number integer NOT NULL CHECK (version_number >= 1),
  certainty text CHECK (certainty IS NULL OR certainty IN ('high', 'moderate', 'low', 'very_low')),
  usual_answer text CHECK (usual_answer IS NULL OR length(usual_answer) BETWEEN 1 AND 400),
  why_not_usual text CHECK (why_not_usual IS NULL OR length(why_not_usual) BETWEEN 1 AND 300),
  what_would_change_it text CHECK (what_would_change_it IS NULL OR length(what_would_change_it) BETWEEN 1 AND 300),
  who_else text CHECK (who_else IS NULL OR length(who_else) BETWEEN 1 AND 300),
  what_it_changes text CHECK (what_it_changes IS NULL OR length(what_it_changes) BETWEEN 1 AND 300),
  tags jsonb NOT NULL CHECK (
    jsonb_typeof(tags) = 'array'
    AND tags <@ '["full_text_read", "contradicts_common_answer", "overlooked_study", "documented_absence"]'::jsonb
  ),
  verified_bases jsonb NOT NULL CHECK (
    jsonb_typeof(verified_bases) = 'array'
    AND verified_bases <@ '["full_text_audit", "bounded_absence", "research_correction"]'::jsonb
  ),
  numbers jsonb NOT NULL CHECK (jsonb_typeof(numbers) = 'array'),
  research_checked_on date NOT NULL,
  made_with jsonb NOT NULL CHECK (jsonb_typeof(made_with) = 'object'),
  card_wording_key char(64) CHECK (card_wording_key IS NULL OR card_wording_key ~ '^[a-f0-9]{64}$'),
  accepted_wording_key char(64) CHECK (accepted_wording_key IS NULL OR accepted_wording_key ~ '^[a-f0-9]{64}$'),
  edited_at_acceptance boolean NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (finding_id, version_number),
  UNIQUE (claim_version_id, finding_id),
  CHECK (version_number = 1 OR NOT edited_at_acceptance)
);

CREATE INDEX IF NOT EXISTS atlas_finding_versions_card_key_idx
  ON atlas_finding_versions (card_wording_key)
  WHERE card_wording_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_finding_versions_accepted_key_idx
  ON atlas_finding_versions (accepted_wording_key)
  WHERE accepted_wording_key IS NOT NULL;

-- The links the AI declared and the owner agreed to (138b, applied to findings). Withdrawn by a separate row.
CREATE TABLE IF NOT EXISTS atlas_finding_links (
  link_id uuid PRIMARY KEY,
  from_finding_id uuid NOT NULL REFERENCES atlas_findings(finding_id),
  relation text NOT NULL CHECK (relation IN ('same_as', 'narrows', 'contradicts', 'replaces')),
  to_finding_id uuid NOT NULL REFERENCES atlas_findings(finding_id),
  disagreement text CHECK (
    disagreement IS NULL
    OR disagreement IN ('dose', 'population', 'outcome', 'follow_up', 'study_quality', 'analysis')
  ),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 1 AND 500),
  claim_edge_id uuid NOT NULL UNIQUE REFERENCES claim_edges(edge_id),
  decided_at timestamptz NOT NULL,
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (from_finding_id, to_finding_id, relation),
  CHECK (from_finding_id <> to_finding_id),
  CHECK ((relation = 'contradicts') = (disagreement IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS atlas_finding_links_to_idx ON atlas_finding_links (to_finding_id);

CREATE TABLE IF NOT EXISTS atlas_finding_link_withdrawals (
  link_id uuid PRIMARY KEY REFERENCES atlas_finding_links(link_id),
  public_note text NOT NULL CHECK (length(public_note) BETWEEN 1 AND 600),
  decided_at timestamptz NOT NULL,
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Change records, never overwritten. Each intent writes at most one change of a kind per finding, and the latest
-- change of a finding carries its current label.
CREATE TABLE IF NOT EXISTS atlas_finding_changes (
  change_id uuid PRIMARY KEY,
  finding_id uuid NOT NULL REFERENCES atlas_findings(finding_id),
  intent_id uuid NOT NULL REFERENCES atlas_intent_applications(intent_id),
  change_kind text NOT NULL CHECK (
    change_kind IN ('accepted', 'edited', 'corrected', 'withdrawn', 'rechecked', 'relabeled', 'wording_removed')
  ),
  claim_version_id uuid,
  label_before text CHECK (
    label_before IS NULL OR label_before IN ('checked', 'lead', 'contested', 'superseded', 'withdrawn')
  ),
  label_after text NOT NULL CHECK (label_after IN ('checked', 'lead', 'contested', 'superseded', 'withdrawn')),
  public_note text CHECK (public_note IS NULL OR length(public_note) BETWEEN 1 AND 600),
  link_id uuid REFERENCES atlas_finding_links(link_id),
  research_checked_on date,
  decided_at timestamptz NOT NULL,
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (intent_id, finding_id, change_kind),
  FOREIGN KEY (claim_version_id, finding_id) REFERENCES atlas_finding_versions (claim_version_id, finding_id),
  -- A correction and a withdrawal each carry a public dated note (5a).
  CHECK (change_kind NOT IN ('corrected', 'withdrawn') OR public_note IS NOT NULL),
  CHECK (change_kind NOT IN ('accepted', 'edited', 'corrected', 'withdrawn') OR claim_version_id IS NOT NULL),
  CHECK ((change_kind = 'accepted') = (label_before IS NULL)),
  CHECK ((change_kind = 'rechecked') = (research_checked_on IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS atlas_finding_changes_finding_idx
  ON atlas_finding_changes (finding_id, inserted_at);

-- The public record and retraction check of each source an intent bound, from the owner's call (the admin container
-- reaches only the database).
CREATE TABLE IF NOT EXISTS atlas_source_checks (
  check_id uuid PRIMARY KEY,
  source_family_id uuid NOT NULL REFERENCES source_families(family_id),
  provider text NOT NULL CHECK (provider IN ('crossref', 'pubmed', 'europe_pmc', 'clinicaltrials_gov')),
  title text CHECK (title IS NULL OR length(title) BETWEEN 1 AND 500),
  published_year smallint CHECK (published_year IS NULL OR published_year BETWEEN 1500 AND 2200),
  retraction_status text NOT NULL CHECK (retraction_status IN (
    'none_found', 'corrected_or_updated', 'expression_of_concern', 'retracted', 'not_applicable', 'unknown'
  )),
  notices jsonb NOT NULL CHECK (jsonb_typeof(notices) = 'array'),
  owner_confirmed boolean NOT NULL,
  envelope_sha256 char(64) NOT NULL CHECK (envelope_sha256 ~ '^[a-f0-9]{64}$'),
  checked_at timestamptz NOT NULL,
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- A retracted, corrected or concerned source is bound only after the owner confirmed it.
  CHECK (
    retraction_status NOT IN ('retracted', 'expression_of_concern', 'corrected_or_updated') OR owner_confirmed
  )
);

CREATE INDEX IF NOT EXISTS atlas_source_checks_family_idx
  ON atlas_source_checks (source_family_id, checked_at);

-- A version whose wording could identify a person (decision 7): the row erase_atlas_wording() needs before it may
-- replace that version's wording with the marker.
CREATE TABLE IF NOT EXISTS atlas_redactions (
  redaction_id uuid PRIMARY KEY,
  finding_id uuid NOT NULL REFERENCES atlas_findings(finding_id),
  claim_version_id uuid NOT NULL UNIQUE,
  reason_code text NOT NULL CHECK (reason_code = 'could_identify_a_person'),
  decided_at timestamptz NOT NULL,
  run_id uuid NOT NULL REFERENCES research_runs(run_id),
  inserted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (claim_version_id, finding_id) REFERENCES atlas_finding_versions (claim_version_id, finding_id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'atlas_intent_applications', 'atlas_findings', 'atlas_finding_versions', 'atlas_finding_links',
    'atlas_finding_link_withdrawals', 'atlas_finding_changes', 'atlas_source_checks', 'atlas_redactions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS append_only_guard ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

-- A version continues its finding's own claim, one line: version 1 starts the claim, version n supersedes n - 1.
CREATE OR REPLACE FUNCTION validate_atlas_finding_version() RETURNS trigger
LANGUAGE plpgsql
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  version_claim_id uuid;
  superseded_version_id uuid;
  finding_claim_id uuid;
  previous_version_id uuid;
BEGIN
  SELECT claimed.claim_id, claimed.supersedes_claim_version_id
    INTO version_claim_id, superseded_version_id
    FROM claim_versions claimed
   WHERE claimed.version_id = NEW.claim_version_id;
  SELECT finding.claim_id INTO finding_claim_id
    FROM atlas_findings finding
   WHERE finding.finding_id = NEW.finding_id;
  IF version_claim_id IS NULL OR finding_claim_id IS NULL OR version_claim_id <> finding_claim_id THEN
    RAISE EXCEPTION 'ATLAS_VERSION_LINEAGE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.version_number = 1 THEN
    IF superseded_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'ATLAS_VERSION_LINEAGE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT previous.claim_version_id INTO previous_version_id
      FROM atlas_finding_versions previous
     WHERE previous.finding_id = NEW.finding_id
       AND previous.version_number = NEW.version_number - 1;
    IF previous_version_id IS NULL OR superseded_version_id IS DISTINCT FROM previous_version_id THEN
      RAISE EXCEPTION 'ATLAS_VERSION_LINEAGE_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS atlas_finding_version_lineage_guard ON atlas_finding_versions;
CREATE TRIGGER atlas_finding_version_lineage_guard
  BEFORE INSERT ON atlas_finding_versions
  FOR EACH ROW EXECUTE FUNCTION validate_atlas_finding_version();

REVOKE ALL ON FUNCTION validate_atlas_finding_version() FROM PUBLIC;

-- Each finding's current state: the latest version, the label of its latest change, and its dates.
CREATE OR REPLACE VIEW atlas_finding_current AS
SELECT
  finding.public_number,
  finding.finding_id,
  finding.entry_kind,
  finding.lead_origin,
  latest.claim_version_id AS latest_claim_version_id,
  latest.version_number AS latest_version_number,
  latest_claim.status AS latest_status,
  latest_change.label_after AS label,
  topic.canonical_key AS topic_key,
  topic.label AS topic_label,
  question.normalized_question AS question,
  accepted.decided_at AS accepted_at,
  latest_change.decided_at AS last_changed_at,
  GREATEST(latest.research_checked_on, recheck.research_checked_on) AS research_checked_on
FROM atlas_findings finding
JOIN claims claim ON claim.claim_id = finding.claim_id
JOIN questions question ON question.question_id = claim.question_id
JOIN topics topic ON topic.topic_id = question.topic_id
JOIN LATERAL (
  SELECT newest.* FROM atlas_finding_versions newest
   WHERE newest.finding_id = finding.finding_id
   ORDER BY newest.version_number DESC
   LIMIT 1
) latest ON true
JOIN claim_versions latest_claim ON latest_claim.version_id = latest.claim_version_id
LEFT JOIN LATERAL (
  SELECT newest_change.label_after, newest_change.decided_at FROM atlas_finding_changes newest_change
   WHERE newest_change.finding_id = finding.finding_id
   ORDER BY newest_change.inserted_at DESC, newest_change.change_id DESC
   LIMIT 1
) latest_change ON true
LEFT JOIN LATERAL (
  SELECT acceptance.decided_at FROM atlas_finding_changes acceptance
   WHERE acceptance.finding_id = finding.finding_id AND acceptance.change_kind = 'accepted'
   LIMIT 1
) accepted ON true
LEFT JOIN LATERAL (
  SELECT max(recheck_change.research_checked_on) AS research_checked_on FROM atlas_finding_changes recheck_change
   WHERE recheck_change.finding_id = finding.finding_id AND recheck_change.change_kind = 'rechecked'
) recheck ON true;

-- Wording erasure (decision 7, choice 4a): the only change ever made to a canonical row --------------------------

-- Whether an UPDATE of a canonical row is erase_atlas_wording()'s replacement of the wording of the version its
-- redaction row names: the redaction it is applying (a transaction-local setting it sets) exists, the row belongs to
-- that version, and the only columns that differ are the version's text columns, each set from its text to the fixed
-- marker (the wording keys to 64 zeros). Everything else stays equal; a NULL stays NULL.
CREATE OR REPLACE FUNCTION atlas_redaction_permits(target_table text, old_row jsonb, new_row jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  erasing text := current_setting('askrigor.atlas_erasing_redaction', true);
  redaction atlas_redactions%ROWTYPE;
  version_column text;
  text_columns text[];
  key_columns text[] := ARRAY[]::text[];
  column_name text;
BEGIN
  IF erasing IS NULL OR erasing !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  SELECT * INTO redaction FROM atlas_redactions WHERE redaction_id = erasing::uuid;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF target_table = 'claim_versions' THEN
    version_column := 'version_id';
    text_columns := ARRAY[
      'normalized_assertion', 'population', 'program_or_exposure', 'comparator', 'outcome', 'horizon', 'setting'
    ];
  ELSIF target_table = 'atlas_finding_versions' THEN
    version_column := 'claim_version_id';
    text_columns := ARRAY['usual_answer', 'why_not_usual', 'what_would_change_it', 'who_else', 'what_it_changes'];
    key_columns := ARRAY['card_wording_key', 'accepted_wording_key'];
  ELSIF target_table = 'atlas_finding_changes' THEN
    version_column := 'claim_version_id';
    text_columns := ARRAY['public_note'];
  ELSE
    RETURN false;
  END IF;
  IF old_row ->> version_column IS DISTINCT FROM redaction.claim_version_id::text
     OR new_row ->> version_column IS DISTINCT FROM redaction.claim_version_id::text THEN
    RETURN false;
  END IF;
  IF target_table <> 'claim_versions' AND old_row ->> 'finding_id' IS DISTINCT FROM redaction.finding_id::text THEN
    RETURN false;
  END IF;
  IF (old_row - text_columns - key_columns) IS DISTINCT FROM (new_row - text_columns - key_columns) THEN
    RETURN false;
  END IF;
  FOREACH column_name IN ARRAY text_columns LOOP
    IF new_row -> column_name IS DISTINCT FROM old_row -> column_name
       AND (jsonb_typeof(old_row -> column_name) IS DISTINCT FROM 'string'
            OR new_row -> column_name IS DISTINCT FROM to_jsonb('[wording removed]'::text)) THEN
      RETURN false;
    END IF;
  END LOOP;
  FOREACH column_name IN ARRAY key_columns LOOP
    IF new_row -> column_name IS DISTINCT FROM old_row -> column_name
       AND (jsonb_typeof(old_row -> column_name) IS DISTINCT FROM 'string'
            OR new_row -> column_name IS DISTINCT FROM to_jsonb(repeat('0', 64))) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION atlas_redaction_permits(text, jsonb, jsonb) FROM PUBLIC;

-- Replaces the wording of the version a redaction row names: its claim version's text columns, its Atlas version's
-- texts and wording keys, and the notes of its change records. Writer only. Running it again changes nothing.
CREATE OR REPLACE FUNCTION erase_atlas_wording(target_redaction_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  redaction atlas_redactions%ROWTYPE;
  marker CONSTANT text := '[wording removed]';
  erased_key CONSTANT text := repeat('0', 64);
  changed integer := 0;
  touched integer;
BEGIN
  SELECT * INTO redaction FROM atlas_redactions WHERE redaction_id = target_redaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATLAS_REDACTION_NOT_FOUND' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('askrigor.atlas_erasing_redaction', target_redaction_id::text, true);
  UPDATE claim_versions erased
     SET normalized_assertion = marker,
         population = CASE WHEN erased.population IS NULL THEN NULL ELSE marker END,
         program_or_exposure = CASE WHEN erased.program_or_exposure IS NULL THEN NULL ELSE marker END,
         comparator = CASE WHEN erased.comparator IS NULL THEN NULL ELSE marker END,
         outcome = CASE WHEN erased.outcome IS NULL THEN NULL ELSE marker END,
         horizon = CASE WHEN erased.horizon IS NULL THEN NULL ELSE marker END,
         setting = CASE WHEN erased.setting IS NULL THEN NULL ELSE marker END
   WHERE erased.version_id = redaction.claim_version_id
     AND (erased.normalized_assertion <> marker
          OR coalesce(erased.population, marker) <> marker
          OR coalesce(erased.program_or_exposure, marker) <> marker
          OR coalesce(erased.comparator, marker) <> marker
          OR coalesce(erased.outcome, marker) <> marker
          OR coalesce(erased.horizon, marker) <> marker
          OR coalesce(erased.setting, marker) <> marker);
  GET DIAGNOSTICS touched = ROW_COUNT;
  changed := changed + touched;
  UPDATE atlas_finding_versions erased
     SET usual_answer = CASE WHEN erased.usual_answer IS NULL THEN NULL ELSE marker END,
         why_not_usual = CASE WHEN erased.why_not_usual IS NULL THEN NULL ELSE marker END,
         what_would_change_it = CASE WHEN erased.what_would_change_it IS NULL THEN NULL ELSE marker END,
         who_else = CASE WHEN erased.who_else IS NULL THEN NULL ELSE marker END,
         what_it_changes = CASE WHEN erased.what_it_changes IS NULL THEN NULL ELSE marker END,
         card_wording_key = CASE WHEN erased.card_wording_key IS NULL THEN NULL ELSE erased_key END,
         accepted_wording_key = CASE WHEN erased.accepted_wording_key IS NULL THEN NULL ELSE erased_key END
   WHERE erased.claim_version_id = redaction.claim_version_id
     AND erased.finding_id = redaction.finding_id
     AND (coalesce(erased.usual_answer, marker) <> marker
          OR coalesce(erased.why_not_usual, marker) <> marker
          OR coalesce(erased.what_would_change_it, marker) <> marker
          OR coalesce(erased.who_else, marker) <> marker
          OR coalesce(erased.what_it_changes, marker) <> marker
          OR coalesce(erased.card_wording_key::text, erased_key) <> erased_key
          OR coalesce(erased.accepted_wording_key::text, erased_key) <> erased_key);
  GET DIAGNOSTICS touched = ROW_COUNT;
  changed := changed + touched;
  UPDATE atlas_finding_changes erased
     SET public_note = marker
   WHERE erased.claim_version_id = redaction.claim_version_id
     AND erased.finding_id = redaction.finding_id
     AND erased.public_note IS NOT NULL
     AND erased.public_note <> marker;
  GET DIAGNOSTICS touched = ROW_COUNT;
  changed := changed + touched;
  PERFORM set_config('askrigor.atlas_erasing_redaction', '', true);
  RETURN changed;
END
$function$;

REVOKE ALL ON FUNCTION erase_atlas_wording(uuid) FROM PUBLIC;

-- 0001's guard, with its one exception. 0001 runs again first on every migrate and restores its plain body, so this
-- body, which 0017 applies after it in the same transaction, is the one in force. A later migration that redefines
-- the guard must keep this branch (tests/living-evidence-production-deployment.test.ts pins it).
CREATE OR REPLACE FUNCTION reject_living_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND TG_TABLE_SCHEMA = '__SCHEMA__'
     AND TG_TABLE_NAME IN ('claim_versions', 'atlas_finding_versions', 'atlas_finding_changes')
     AND __SCHEMA__.atlas_redaction_permits(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'APPEND_ONLY_TABLE mutation rejected for %', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

-- The review role's five functions (SECURITY DEFINER; provision-research-review-role.sh grants exactly these) -------

-- The owner's decisions on the given cards, with each decision's intent state.
CREATE OR REPLACE FUNCTION inspect_atlas_cards(target_card_numbers integer[])
RETURNS TABLE (
  card_number integer,
  item_kind text,
  item_number smallint,
  decision text,
  public_number text,
  card_sha256 text,
  owner_reason text,
  intent_id uuid,
  decided_at timestamptz,
  intent_kind text,
  intent_status text,
  intent_created_at timestamptz,
  intent_completed_at timestamptz,
  intent_failure_code text,
  intent_failed_at timestamptz,
  intent_retry_of_intent_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
  SELECT decision.card_number,
         decision.item_kind,
         decision.item_number,
         decision.decision,
         decision.public_number,
         decision.card_sha256::text,
         decision.owner_reason,
         decision.intent_id,
         decision.decided_at,
         intent.intent_kind,
         intent.status,
         intent.created_at,
         intent.completed_at,
         intent.failure_code,
         intent.failed_at,
         intent.retry_of_intent_id
    FROM atlas_card_decisions decision
    LEFT JOIN atlas_finding_intents intent ON intent.intent_id = decision.intent_id
   WHERE decision.card_number = ANY(target_card_numbers)
   ORDER BY decision.card_number, decision.item_kind, decision.item_number
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_cards(integer[]) FROM PUBLIC;

-- Records the owner's decision on one card item, with its PENDING intent in the same transaction: an accept takes the
-- next public number; a re-check names the finding it re-checks. The same decision again returns the stored one; a
-- decision whose intent ended FAILED may be made again, as a retry under the same number; anything else conflicts.
CREATE OR REPLACE FUNCTION decide_atlas_card_item(
  target_card_number integer,
  target_item_kind text,
  target_item_number integer,
  card_decision text,
  expected_card_sha256 text,
  supplied_owner_reason text,
  decision_time timestamptz,
  requested_intent_id uuid,
  intent_payload jsonb,
  intent_payload_sha256 text,
  rechecked_public_number text
)
RETURNS TABLE (
  card_number integer,
  item_kind text,
  item_number smallint,
  decision text,
  public_number text,
  card_sha256 text,
  owner_reason text,
  intent_id uuid,
  decided_at timestamptz,
  intent_kind text,
  intent_status text,
  intent_created_at timestamptz,
  intent_completed_at timestamptz,
  intent_failure_code text,
  intent_failed_at timestamptz,
  intent_retry_of_intent_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  current_decision atlas_card_decisions%ROWTYPE;
  current_intent atlas_finding_intents%ROWTYPE;
  desired_intent_kind text;
  assigned_number text;
BEGIN
  desired_intent_kind := CASE card_decision
    WHEN 'accepted' THEN 'accept'
    WHEN 'accepted_as_lead' THEN 'accept'
    WHEN 'rechecked' THEN 'recheck'
    ELSE NULL
  END;
  IF target_card_number IS NULL OR target_card_number < 1
     OR target_item_kind IS NULL OR target_item_kind NOT IN ('finding', 'open_lead')
     OR target_item_number IS NULL
     OR (target_item_kind = 'finding' AND target_item_number NOT BETWEEN 1 AND 5)
     OR (target_item_kind = 'open_lead' AND target_item_number NOT BETWEEN 1 AND 6)
     OR card_decision IS NULL OR card_decision NOT IN ('accepted', 'accepted_as_lead', 'rechecked', 'rejected')
     OR (target_item_kind = 'open_lead' AND card_decision = 'accepted')
     OR expected_card_sha256 IS NULL OR expected_card_sha256 !~ '^[a-f0-9]{64}$'
     OR (supplied_owner_reason IS NOT NULL AND (supplied_owner_reason <> btrim(supplied_owner_reason)
         OR length(supplied_owner_reason) NOT BETWEEN 1 AND 2000))
     OR decision_time IS NULL
     OR (card_decision = 'rejected' AND (supplied_owner_reason IS NULL OR requested_intent_id IS NOT NULL
         OR intent_payload IS NOT NULL OR intent_payload_sha256 IS NOT NULL OR rechecked_public_number IS NOT NULL))
     OR (desired_intent_kind IS NOT NULL AND (requested_intent_id IS NULL OR intent_payload IS NULL
         OR jsonb_typeof(intent_payload) <> 'object' OR intent_payload_sha256 IS NULL
         OR intent_payload_sha256 !~ '^[a-f0-9]{64}$'
         OR intent_payload ->> 'kind' IS DISTINCT FROM desired_intent_kind))
     OR (desired_intent_kind = 'accept' AND (rechecked_public_number IS NOT NULL OR intent_payload ? 'publicNumber'
         OR intent_payload ->> 'entryKind' IS DISTINCT FROM
            CASE card_decision WHEN 'accepted' THEN 'finding' ELSE 'lead' END
         OR intent_payload ->> 'leadOrigin' IS DISTINCT FROM
            CASE WHEN card_decision = 'accepted' THEN NULL
                 WHEN target_item_kind = 'open_lead' THEN 'open_lead'
                 ELSE 'unverified_finding' END))
     OR (desired_intent_kind = 'recheck' AND (rechecked_public_number IS NULL
         OR rechecked_public_number !~ '^F-[1-9][0-9]{3,}$'
         OR intent_payload ->> 'publicNumber' IS DISTINCT FROM rechecked_public_number))
  THEN
    RAISE EXCEPTION 'ATLAS_REVIEW_INPUT_INVALID';
  END IF;

  SELECT * INTO current_decision
    FROM atlas_card_decisions existing
   WHERE existing.card_number = target_card_number
     AND existing.item_kind = target_item_kind
     AND existing.item_number = target_item_number
   FOR UPDATE;

  IF NOT FOUND THEN
    IF desired_intent_kind = 'recheck' AND NOT EXISTS (
      SELECT 1 FROM atlas_finding_intents accepted
       WHERE accepted.public_number = rechecked_public_number
         AND accepted.intent_kind = 'accept' AND accepted.status <> 'FAILED'
    ) THEN
      RAISE EXCEPTION 'ATLAS_FINDING_NOT_FOUND';
    END IF;
    IF desired_intent_kind IS NOT NULL THEN
      assigned_number := CASE desired_intent_kind
        WHEN 'accept' THEN 'F-' || nextval('atlas_public_number_seq')::text
        ELSE rechecked_public_number
      END;
      INSERT INTO atlas_finding_intents
        (intent_id, intent_kind, public_number, payload_json, payload_sha256, owner_reason, status, created_at)
      VALUES
        (requested_intent_id, desired_intent_kind, assigned_number, intent_payload, intent_payload_sha256, NULL,
         'PENDING', decision_time);
    END IF;
    INSERT INTO atlas_card_decisions
      (card_number, item_kind, item_number, decision, public_number, card_sha256, owner_reason, intent_id, decided_at)
    VALUES
      (target_card_number, target_item_kind, target_item_number::smallint, card_decision, assigned_number,
       expected_card_sha256, supplied_owner_reason,
       CASE WHEN desired_intent_kind IS NULL THEN NULL ELSE requested_intent_id END, decision_time);
  ELSIF current_decision.decision <> card_decision THEN
    RAISE EXCEPTION 'ATLAS_DECISION_CONFLICT';
  ELSIF card_decision = 'rejected' THEN
    IF current_decision.card_sha256::text <> expected_card_sha256
       OR current_decision.owner_reason IS DISTINCT FROM supplied_owner_reason THEN
      RAISE EXCEPTION 'ATLAS_DECISION_CONFLICT';
    END IF;
  ELSE
    SELECT * INTO current_intent
      FROM atlas_finding_intents stored
     WHERE stored.intent_id = current_decision.intent_id;
    IF desired_intent_kind = 'recheck' AND current_decision.public_number <> rechecked_public_number THEN
      RAISE EXCEPTION 'ATLAS_DECISION_CONFLICT';
    END IF;
    IF current_intent.status = 'FAILED' THEN
      -- A retry: a new intent under the same number, which the decision now names.
      INSERT INTO atlas_finding_intents
        (intent_id, intent_kind, public_number, payload_json, payload_sha256, owner_reason, status, created_at,
         retry_of_intent_id)
      VALUES
        (requested_intent_id, desired_intent_kind, current_decision.public_number, intent_payload,
         intent_payload_sha256, NULL, 'PENDING', decision_time, current_intent.intent_id);
      UPDATE atlas_card_decisions stored
         SET card_sha256 = expected_card_sha256,
             owner_reason = supplied_owner_reason,
             intent_id = requested_intent_id,
             decided_at = decision_time
       WHERE stored.card_number = target_card_number
         AND stored.item_kind = target_item_kind
         AND stored.item_number = target_item_number;
    ELSIF current_decision.card_sha256::text <> expected_card_sha256
       OR current_intent.payload_sha256::text <> intent_payload_sha256
       OR current_decision.owner_reason IS DISTINCT FROM supplied_owner_reason THEN
      RAISE EXCEPTION 'ATLAS_DECISION_CONFLICT';
    END IF;
  END IF;

  RETURN QUERY
  SELECT inspected.*
    FROM inspect_atlas_cards(ARRAY[target_card_number]) inspected
   WHERE inspected.item_kind = target_item_kind
     AND inspected.item_number = target_item_number;
END
$function$;

REVOKE ALL ON FUNCTION decide_atlas_card_item(
  integer, text, integer, text, text, text, timestamptz, uuid, jsonb, text, text
) FROM PUBLIC;

-- Records a PENDING intent on a finding the owner already accepted: a revision, a withdrawal, a link, an unlink or an
-- erasure. The same request again (the same intent ID, or the same pending payload) returns the stored intent. A
-- retry names the FAILED intent of the same kind and number it repeats.
CREATE OR REPLACE FUNCTION record_atlas_finding_intent(
  requested_intent_id uuid,
  requested_intent_kind text,
  target_public_number text,
  intent_payload jsonb,
  intent_payload_sha256 text,
  supplied_owner_reason text,
  intent_time timestamptz,
  retry_of uuid DEFAULT NULL
)
RETURNS TABLE (
  intent_id uuid,
  queue_position bigint,
  intent_kind text,
  public_number text,
  payload_json jsonb,
  payload_sha256 text,
  owner_reason text,
  status text,
  created_at timestamptz,
  completed_at timestamptz,
  receipt_json jsonb,
  receipt_sha256 text,
  failure_code text,
  failed_at timestamptz,
  retry_of_intent_id uuid,
  texts_erased_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  existing atlas_finding_intents%ROWTYPE;
  retried atlas_finding_intents%ROWTYPE;
  recorded_intent_id uuid;
BEGIN
  IF requested_intent_id IS NULL
     OR requested_intent_kind IS NULL
     OR requested_intent_kind NOT IN ('revise', 'withdraw', 'link', 'unlink', 'erase')
     OR target_public_number IS NULL OR target_public_number !~ '^F-[1-9][0-9]{3,}$'
     OR intent_payload IS NULL OR jsonb_typeof(intent_payload) <> 'object'
     OR intent_payload ->> 'kind' IS DISTINCT FROM requested_intent_kind
     OR intent_payload ->> 'publicNumber' IS DISTINCT FROM target_public_number
     OR (requested_intent_kind IN ('link', 'unlink')
         AND (coalesce(intent_payload ->> 'toPublicNumber', '') !~ '^F-[1-9][0-9]{3,}$'
              OR intent_payload ->> 'toPublicNumber' = target_public_number))
     OR intent_payload_sha256 IS NULL OR intent_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR (supplied_owner_reason IS NOT NULL AND (supplied_owner_reason <> btrim(supplied_owner_reason)
         OR length(supplied_owner_reason) NOT BETWEEN 1 AND 2000))
     OR intent_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_REVIEW_INPUT_INVALID';
  END IF;

  SELECT * INTO existing FROM atlas_finding_intents stored WHERE stored.intent_id = requested_intent_id;
  IF FOUND THEN
    IF existing.intent_kind <> requested_intent_kind
       OR existing.public_number <> target_public_number
       OR existing.payload_sha256::text <> intent_payload_sha256 THEN
      RAISE EXCEPTION 'ATLAS_INTENT_CONFLICT';
    END IF;
    recorded_intent_id := existing.intent_id;
  ELSE
    SELECT * INTO existing
      FROM atlas_finding_intents stored
     WHERE stored.intent_kind = requested_intent_kind
       AND stored.public_number = target_public_number
       AND stored.payload_sha256 = intent_payload_sha256
       AND stored.status = 'PENDING'
     ORDER BY stored.queue_position
     LIMIT 1;
    IF FOUND THEN
      recorded_intent_id := existing.intent_id;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM atlas_finding_intents accepted
         WHERE accepted.public_number = target_public_number
           AND accepted.intent_kind = 'accept' AND accepted.status <> 'FAILED'
      ) OR (requested_intent_kind IN ('link', 'unlink') AND NOT EXISTS (
        SELECT 1 FROM atlas_finding_intents accepted
         WHERE accepted.public_number = intent_payload ->> 'toPublicNumber'
           AND accepted.intent_kind = 'accept' AND accepted.status <> 'FAILED'
      )) THEN
        RAISE EXCEPTION 'ATLAS_FINDING_NOT_FOUND';
      END IF;
      IF retry_of IS NOT NULL THEN
        SELECT * INTO retried FROM atlas_finding_intents stored WHERE stored.intent_id = retry_of;
        IF NOT FOUND OR retried.status <> 'FAILED' OR retried.intent_kind <> requested_intent_kind
           OR retried.public_number <> target_public_number THEN
          RAISE EXCEPTION 'ATLAS_REVIEW_INPUT_INVALID';
        END IF;
      END IF;
      INSERT INTO atlas_finding_intents
        (intent_id, intent_kind, public_number, payload_json, payload_sha256, owner_reason, status, created_at,
         retry_of_intent_id)
      VALUES
        (requested_intent_id, requested_intent_kind, target_public_number, intent_payload, intent_payload_sha256,
         supplied_owner_reason, 'PENDING', intent_time, retry_of);
      recorded_intent_id := requested_intent_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT stored.intent_id, stored.queue_position, stored.intent_kind, stored.public_number, stored.payload_json,
         stored.payload_sha256::text, stored.owner_reason, stored.status, stored.created_at, stored.completed_at,
         stored.receipt_json, stored.receipt_sha256::text, stored.failure_code, stored.failed_at,
         stored.retry_of_intent_id, stored.texts_erased_at
    FROM atlas_finding_intents stored
   WHERE stored.intent_id = recorded_intent_id;
END
$function$;

REVOKE ALL ON FUNCTION record_atlas_finding_intent(
  uuid, text, text, jsonb, text, text, timestamptz, uuid
) FROM PUBLIC;

-- The intents on the given findings (as the subject, or as a link's other side), or, given NULL, every pending intent
-- and every FAILED one no retry has followed: what list_findings shows first. At most 200, oldest first.
CREATE OR REPLACE FUNCTION inspect_atlas_finding_intents(target_public_numbers text[])
RETURNS TABLE (
  intent_id uuid,
  queue_position bigint,
  intent_kind text,
  public_number text,
  payload_json jsonb,
  payload_sha256 text,
  owner_reason text,
  status text,
  created_at timestamptz,
  completed_at timestamptz,
  receipt_json jsonb,
  receipt_sha256 text,
  failure_code text,
  failed_at timestamptz,
  retry_of_intent_id uuid,
  texts_erased_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
  SELECT intent.intent_id, intent.queue_position, intent.intent_kind, intent.public_number, intent.payload_json,
         intent.payload_sha256::text, intent.owner_reason, intent.status, intent.created_at, intent.completed_at,
         intent.receipt_json, intent.receipt_sha256::text, intent.failure_code, intent.failed_at,
         intent.retry_of_intent_id, intent.texts_erased_at
    FROM atlas_finding_intents intent
   WHERE (target_public_numbers IS NULL AND (
           intent.status = 'PENDING'
           OR (intent.status = 'FAILED' AND NOT EXISTS (
             SELECT 1 FROM atlas_finding_intents retry WHERE retry.retry_of_intent_id = intent.intent_id
           ))
         ))
      OR (target_public_numbers IS NOT NULL AND (
           intent.public_number = ANY(target_public_numbers)
           OR (intent.intent_kind IN ('link', 'unlink')
               AND intent.payload_json ->> 'toPublicNumber' = ANY(target_public_numbers))
         ))
   ORDER BY intent.queue_position
   LIMIT 200
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_finding_intents(text[]) FROM PUBLIC;

-- Decision 7: deletes the given cards' decision rows, the owner's private reasons with them, and returns each removed
-- row with whether another card's decision still names its F number. No other row names a card; the findings stay
-- while they are valid.
CREATE OR REPLACE FUNCTION forget_atlas_cards(target_card_numbers integer[], forget_time timestamptz)
RETURNS TABLE (
  card_number integer,
  item_kind text,
  item_number smallint,
  decision text,
  public_number text,
  public_number_named_elsewhere boolean,
  forgotten_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
#variable_conflict use_column
BEGIN
  IF target_card_numbers IS NULL
     OR cardinality(target_card_numbers) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(target_card_numbers) requested(card) WHERE requested.card IS NULL
                OR requested.card < 1)
     OR forget_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_REVIEW_INPUT_INVALID';
  END IF;
  RETURN QUERY
  WITH removed AS (
    DELETE FROM atlas_card_decisions forgotten
     WHERE forgotten.card_number = ANY(target_card_numbers)
    RETURNING forgotten.card_number, forgotten.item_kind, forgotten.item_number, forgotten.decision,
              forgotten.public_number
  )
  SELECT removed.card_number, removed.item_kind, removed.item_number, removed.decision, removed.public_number,
         CASE WHEN removed.public_number IS NULL THEN false ELSE EXISTS (
           SELECT 1 FROM atlas_card_decisions other
            WHERE other.public_number = removed.public_number
              AND NOT (other.card_number = ANY(target_card_numbers))
         ) END,
         forget_time
    FROM removed
   ORDER BY removed.card_number, removed.item_kind, removed.item_number;
END
$function$;

REVOKE ALL ON FUNCTION forget_atlas_cards(integer[], timestamptz) FROM PUBLIC;

REVOKE ALL ON SEQUENCE atlas_public_number_seq FROM PUBLIC;
