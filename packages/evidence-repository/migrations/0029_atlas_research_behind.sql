SET search_path TO __SCHEMA__, public;

-- The research behind each Atlas finding (owner answers 252a, 254a and 255a, 5 November 2026; plan
-- docs/superpowers/plans/2026-11-05-atlas-research-behind.md). Renumber this migration when the Atlas stack next takes
-- in main: main's last is 0024, and this stack holds 0025 to 0029.
--
-- 254a: forum threads AskRigor's own reader read count as work a quick answer can't do, so the verified bases an Atlas
-- version and a held YouTube finding hold admit forum_read. Each check is replaced only while it lacks it, inside the
-- migration's transaction; 0017 and 0019 create their tables only when missing, so they never put the narrower check
-- back. 255a: an Atlas version keeps the research behind it (its quotes found word for word, how each source was read,
-- each figure's source and the forum signal), so that an accepted finding from any card shows it: one nullable jsonb
-- column, which 0017's append-only guard already covers. Decision 7's wording erasure removes it whole. No role, grant,
-- sequence or table is added, and no row is changed. Safe to run again: every migration runs on each start, in one
-- transaction.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'atlas_finding_versions'::regclass
       AND conname = 'atlas_finding_versions_verified_bases_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%forum_read%'
  ) THEN
    ALTER TABLE atlas_finding_versions DROP CONSTRAINT atlas_finding_versions_verified_bases_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'atlas_finding_versions'::regclass
       AND conname = 'atlas_finding_versions_verified_bases_check'
  ) THEN
    ALTER TABLE atlas_finding_versions ADD CONSTRAINT atlas_finding_versions_verified_bases_check CHECK (
      jsonb_typeof(verified_bases) = 'array'
      AND verified_bases <@ '["full_text_audit", "bounded_absence", "research_correction", "forum_read"]'::jsonb
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'held_youtube_findings'::regclass
       AND conname = 'held_youtube_findings_verified_bases_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%forum_read%'
  ) THEN
    ALTER TABLE held_youtube_findings DROP CONSTRAINT held_youtube_findings_verified_bases_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'held_youtube_findings'::regclass
       AND conname = 'held_youtube_findings_verified_bases_check'
  ) THEN
    ALTER TABLE held_youtube_findings ADD CONSTRAINT held_youtube_findings_verified_bases_check CHECK (
      jsonb_typeof(verified_bases) = 'array'
      AND verified_bases <@ '["full_text_audit", "comment_audit", "bounded_absence", "research_correction", "forum_read"]'::jsonb
    );
  END IF;
END
$$;

ALTER TABLE atlas_finding_versions ADD COLUMN IF NOT EXISTS research jsonb;
ALTER TABLE atlas_finding_versions DROP CONSTRAINT IF EXISTS atlas_finding_versions_research_check;
ALTER TABLE atlas_finding_versions ADD CONSTRAINT atlas_finding_versions_research_check CHECK (
  research IS NULL OR jsonb_typeof(research) = 'object'
);

COMMENT ON COLUMN atlas_finding_versions.research IS
  'The research behind the finding (owner answers 252a and 255a): quotes found word for word in a text AskRigor fetched itself, the strongest thing against each in AskRigor''s words, how each source was read, each figure''s source and the forum signal; NULL before it, or once erased.';

-- 0018's atlas_redaction_permits(), with one change: on atlas_finding_versions, the research behind a finding may
-- change too, and only by being removed whole. 0017 and 0018 run before this on every migrate and put back their own
-- bodies, so this body, applied after them in the same transaction, is the one in force.
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
  research_columns text[] := ARRAY[]::text[];
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
    research_columns := ARRAY['research'];
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
  IF (old_row - text_columns - key_columns - label_columns - scope_columns - research_columns) IS DISTINCT FROM
     (new_row - text_columns - key_columns - label_columns - scope_columns - research_columns) THEN
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
  -- The research behind a finding may only be removed whole: its row then holds NULL, which to_jsonb() writes as null.
  FOREACH column_name IN ARRAY research_columns LOOP
    IF new_row -> column_name IS DISTINCT FROM old_row -> column_name
       AND new_row -> column_name IS DISTINCT FROM 'null'::jsonb THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION atlas_redaction_permits(text, jsonb, jsonb) FROM PUBLIC;

-- 0018's erase_atlas_wording(), with one change: an Atlas version's research behind it is removed whole with its
-- other texts. Writer only. Running it again changes nothing.
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
         search_scope = atlas_search_scope_without_queries(erased.search_scope),
         research = NULL
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
          OR erased.search_scope IS DISTINCT FROM atlas_search_scope_without_queries(erased.search_scope)
          OR erased.research IS NOT NULL);
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
