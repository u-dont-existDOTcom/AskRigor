SET search_path TO __SCHEMA__, public;

-- Atlas phase 3 (docs/superpowers/plans/2026-10-22-atlas-phase-3-design.md, section 6): the fields a findings card's
-- research AI declares for the pages, stored with each Atlas finding version. Three nullable columns on
-- atlas_finding_versions, which 0017's append_only_guard already covers: the kind, the subject's type, and the searches
-- that found nothing. The subject and the direction go to claim_versions' own program_or_exposure and direction, and
-- the kind gives claims.claim_type, so no other table changes. A version written before this migration, or from a
-- decision that declared none of them, holds NULL. Decision 7's wording erasure now also sets each search's query to
-- the fixed marker. No role, grant, sequence or table is added, and no row is changed. Safe to run again: every
-- migration runs on each start, in one transaction.

ALTER TABLE atlas_finding_versions ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE atlas_finding_versions ADD COLUMN IF NOT EXISTS subject_type text;
ALTER TABLE atlas_finding_versions ADD COLUMN IF NOT EXISTS search_scope jsonb;

-- The values, in step with ATLAS_FINDING_KINDS and ATLAS_SUBJECT_TYPES, and the searches only on a version of kind
-- nothing_found, one to ten of them. Replaced on every run, so the rule here is always the one in force (as 0017 does
-- for its failure codes). A NULL kind never admits searches: a CHECK passes on NULL, so the kind is tested for NULL
-- first, and the array's length is read only once it is known to be an array.
ALTER TABLE atlas_finding_versions DROP CONSTRAINT IF EXISTS atlas_finding_versions_card_fields_check;
ALTER TABLE atlas_finding_versions ADD CONSTRAINT atlas_finding_versions_card_fields_check CHECK (
  (kind IS NULL OR kind IN ('effect', 'harm', 'overlooked_option', 'correction', 'nothing_found', 'tested_vs_sold'))
  AND (subject_type IS NULL OR subject_type IN (
    'condition', 'symptom', 'test', 'treatment', 'supplement', 'product', 'food', 'practice'
  ))
  AND (search_scope IS NULL OR (
    kind IS NOT NULL AND kind = 'nothing_found'
    AND CASE WHEN jsonb_typeof(search_scope) = 'array' THEN jsonb_array_length(search_scope) BETWEEN 1 AND 10
        ELSE false END
  ))
);

-- Wording erasure (decision 7, choice 4a), extended to the searches --------------------------------------------------

-- A version's searches with each query set to the fixed marker; each database stays. Writer only.
CREATE OR REPLACE FUNCTION atlas_search_scope_without_queries(search_scope jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog
AS $function$
  SELECT CASE WHEN jsonb_typeof(search_scope) IS DISTINCT FROM 'array' THEN search_scope ELSE coalesce((
    SELECT jsonb_agg(
             CASE WHEN jsonb_typeof(entry.value) = 'object' AND jsonb_typeof(entry.value -> 'query') = 'string'
               THEN entry.value || jsonb_build_object('query', '[wording removed]')
               ELSE entry.value END
             ORDER BY entry.position)
      FROM jsonb_array_elements(search_scope) WITH ORDINALITY AS entry(value, position)
  ), '[]'::jsonb) END
$function$;

REVOKE ALL ON FUNCTION atlas_search_scope_without_queries(jsonb) FROM PUBLIC;

-- 0017's atlas_redaction_permits(), with one change: on atlas_finding_versions, the searches may change too, and only
-- by having their queries set to the fixed marker (atlas_search_scope_without_queries). 0017 runs before this on
-- every migrate and puts back its own body, so this body, applied after it in the same transaction, is the one in
-- force. Whether an UPDATE of a canonical row is erase_atlas_wording()'s replacement of wording under the redaction it
-- is applying (a transaction-local setting it sets, naming an existing redaction row): the row is that version's (its
-- claim version, its Atlas version or one of its change records), a link that touches the redaction's finding or such
-- a link's withdrawal, or the finding's question while atlas_question_erasable() holds; and the only columns that
-- differ are the table's text columns, each set from its text to the fixed marker, its wording keys, each set to 64
-- zeros, its numbers, whose text labels alone become the marker, and its searches, whose queries alone become the
-- marker. Everything else stays equal; a NULL stays NULL.
CREATE OR REPLACE FUNCTION atlas_redaction_permits(target_table text, old_row jsonb, new_row jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  erasing text := current_setting('askrigor.atlas_erasing_redaction', true);
  redaction atlas_redactions%ROWTYPE;
  text_columns text[];
  key_columns text[] := ARRAY[]::text[];
  label_columns text[] := ARRAY[]::text[];
  scope_columns text[] := ARRAY[]::text[];
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
    text_columns := ARRAY[
      'normalized_assertion', 'population', 'program_or_exposure', 'comparator', 'outcome', 'horizon', 'setting'
    ];
    IF old_row ->> 'version_id' IS DISTINCT FROM redaction.claim_version_id::text THEN
      RETURN false;
    END IF;
  ELSIF target_table = 'atlas_finding_versions' THEN
    text_columns := ARRAY['usual_answer', 'why_not_usual', 'what_would_change_it', 'who_else', 'what_it_changes'];
    key_columns := ARRAY['card_wording_key', 'accepted_wording_key'];
    label_columns := ARRAY['numbers'];
    scope_columns := ARRAY['search_scope'];
    IF old_row ->> 'claim_version_id' IS DISTINCT FROM redaction.claim_version_id::text
       OR old_row ->> 'finding_id' IS DISTINCT FROM redaction.finding_id::text THEN
      RETURN false;
    END IF;
  ELSIF target_table = 'atlas_finding_changes' THEN
    text_columns := ARRAY['public_note'];
    IF old_row ->> 'claim_version_id' IS DISTINCT FROM redaction.claim_version_id::text
       OR old_row ->> 'finding_id' IS DISTINCT FROM redaction.finding_id::text THEN
      RETURN false;
    END IF;
  ELSIF target_table = 'atlas_finding_links' THEN
    text_columns := ARRAY['rationale'];
    IF old_row ->> 'from_finding_id' IS DISTINCT FROM redaction.finding_id::text
       AND old_row ->> 'to_finding_id' IS DISTINCT FROM redaction.finding_id::text THEN
      RETURN false;
    END IF;
  ELSIF target_table = 'atlas_finding_link_withdrawals' THEN
    text_columns := ARRAY['public_note'];
    IF NOT EXISTS (
      SELECT 1 FROM atlas_finding_links touching
       WHERE touching.link_id::text = old_row ->> 'link_id'
         AND (touching.from_finding_id = redaction.finding_id OR touching.to_finding_id = redaction.finding_id)
    ) THEN
      RETURN false;
    END IF;
  ELSIF target_table = 'questions' THEN
    text_columns := ARRAY['normalized_question'];
    IF NOT EXISTS (
      SELECT 1 FROM atlas_findings finding
        JOIN claims claim ON claim.claim_id = finding.claim_id
       WHERE finding.finding_id = redaction.finding_id
         AND claim.question_id::text = old_row ->> 'question_id'
    ) OR NOT atlas_question_erasable(redaction.finding_id) THEN
      RETURN false;
    END IF;
  ELSE
    RETURN false;
  END IF;
  IF (old_row - text_columns - key_columns - label_columns - scope_columns) IS DISTINCT FROM
     (new_row - text_columns - key_columns - label_columns - scope_columns) THEN
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
  FOREACH column_name IN ARRAY label_columns LOOP
    IF new_row -> column_name IS DISTINCT FROM old_row -> column_name
       AND new_row -> column_name IS DISTINCT FROM atlas_numbers_without_labels(old_row -> column_name) THEN
      RETURN false;
    END IF;
  END LOOP;
  FOREACH column_name IN ARRAY scope_columns LOOP
    IF new_row -> column_name IS DISTINCT FROM old_row -> column_name
       AND new_row -> column_name IS DISTINCT FROM atlas_search_scope_without_queries(old_row -> column_name) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION atlas_redaction_permits(text, jsonb, jsonb) FROM PUBLIC;

-- 0017's erase_atlas_wording(), with one change: an Atlas version's searches lose their queries to the fixed marker
-- with its other texts. Replaces with the fixed marker the wording a redaction row covers: its version's claim text
-- columns (the subject, program_or_exposure, among them), its Atlas version's texts, wording keys, numbers' text labels
-- and searches' queries, and the notes of its change records; the rationale of every link that touches its finding and
-- the note of each such link's withdrawal; and the finding's question, when atlas_question_erasable() holds. Writer
-- only. Running it again changes nothing.
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
         accepted_wording_key = CASE WHEN erased.accepted_wording_key IS NULL THEN NULL ELSE erased_key END,
         numbers = atlas_numbers_without_labels(erased.numbers),
         search_scope = atlas_search_scope_without_queries(erased.search_scope)
   WHERE erased.claim_version_id = redaction.claim_version_id
     AND erased.finding_id = redaction.finding_id
     AND (coalesce(erased.usual_answer, marker) <> marker
          OR coalesce(erased.why_not_usual, marker) <> marker
          OR coalesce(erased.what_would_change_it, marker) <> marker
          OR coalesce(erased.who_else, marker) <> marker
          OR coalesce(erased.what_it_changes, marker) <> marker
          OR coalesce(erased.card_wording_key::text, erased_key) <> erased_key
          OR coalesce(erased.accepted_wording_key::text, erased_key) <> erased_key
          OR erased.numbers IS DISTINCT FROM atlas_numbers_without_labels(erased.numbers)
          OR erased.search_scope IS DISTINCT FROM atlas_search_scope_without_queries(erased.search_scope));
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
  UPDATE atlas_finding_links erased
     SET rationale = marker
   WHERE (erased.from_finding_id = redaction.finding_id OR erased.to_finding_id = redaction.finding_id)
     AND erased.rationale <> marker;
  GET DIAGNOSTICS touched = ROW_COUNT;
  changed := changed + touched;
  UPDATE atlas_finding_link_withdrawals erased
     SET public_note = marker
   WHERE erased.link_id IN (
           SELECT touching.link_id FROM atlas_finding_links touching
            WHERE touching.from_finding_id = redaction.finding_id OR touching.to_finding_id = redaction.finding_id
         )
     AND erased.public_note <> marker;
  GET DIAGNOSTICS touched = ROW_COUNT;
  changed := changed + touched;
  IF atlas_question_erasable(redaction.finding_id) THEN
    UPDATE questions erased
       SET normalized_question = marker
     WHERE erased.question_id = (
             SELECT claim.question_id FROM atlas_findings finding
               JOIN claims claim ON claim.claim_id = finding.claim_id
              WHERE finding.finding_id = redaction.finding_id
           )
       AND erased.normalized_question <> marker;
    GET DIAGNOSTICS touched = ROW_COUNT;
    changed := changed + touched;
  END IF;
  PERFORM set_config('askrigor.atlas_erasing_redaction', '', true);
  RETURN changed;
END
$function$;

REVOKE ALL ON FUNCTION erase_atlas_wording(uuid) FROM PUBLIC;

COMMENT ON COLUMN atlas_finding_versions.kind IS
  'The finding''s kind (Atlas phase 3): effect, harm, overlooked_option, correction, nothing_found or tested_vs_sold; NULL when not declared.';
COMMENT ON COLUMN atlas_finding_versions.subject_type IS
  'The type of the finding''s subject (claim_versions.program_or_exposure); NULL when not declared.';
COMMENT ON COLUMN atlas_finding_versions.search_scope IS
  'For kind nothing_found: the searches that found nothing, each {database, query} as the final check bound it to a literature_search receipt; the query is erased with the version''s wording.';
