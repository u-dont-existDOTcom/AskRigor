SET search_path TO __SCHEMA__, public;

-- Owner answer 403 1b 2a, 22 Nov 2026. Public review labels; no contributor or account data.
CREATE TABLE IF NOT EXISTS atlas_tradition_labels (
  item_number text NOT NULL CHECK (item_number ~ '^[PF]-[1-9][0-9]{3,}$'),
  section_key text NOT NULL CHECK (section_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  label jsonb NOT NULL,
  labeled_at timestamptz NOT NULL,
  PRIMARY KEY (item_number, section_key)
);
CREATE TABLE IF NOT EXISTS atlas_tradition_disagreements (
  tcm_item text NOT NULL CHECK (tcm_item ~ '^[PF]-[1-9][0-9]{3,}$'),
  ccm_item text NOT NULL CHECK (ccm_item ~ '^[PF]-[1-9][0-9]{3,}$'),
  line text NOT NULL CHECK (length(btrim(line)) > 0 AND length(line) < 200),
  PRIMARY KEY (tcm_item, ccm_item)
);
CREATE INDEX IF NOT EXISTS atlas_tradition_section_idx ON atlas_tradition_labels (section_key);

CREATE OR REPLACE FUNCTION set_atlas_traditions(changes jsonb, disagreements jsonb, label_time timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp AS $function$
DECLARE entry jsonb; tag jsonb;
BEGIN
  IF jsonb_typeof(changes) IS DISTINCT FROM 'array' OR label_time IS NULL THEN
    RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID';
  END IF;
  IF jsonb_array_length(changes) > 200 OR (jsonb_array_length(changes) = 0 AND disagreements IS NULL) OR
    (SELECT count(DISTINCT value ->> 'item') FROM jsonb_array_elements(changes)) <> jsonb_array_length(changes) THEN
    RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(changes) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR coalesce(entry ->> 'item', '') !~ '^[PF]-[1-9][0-9]{3,}$'
      OR jsonb_typeof(entry -> 'labels') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID';
    END IF;
    IF jsonb_array_length(entry -> 'labels') > 200 OR
      (SELECT count(DISTINCT value ->> 'section') FROM jsonb_array_elements(entry -> 'labels')) <>
      jsonb_array_length(entry -> 'labels') THEN RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID'; END IF;
    FOR tag IN SELECT value FROM jsonb_array_elements(entry -> 'labels') LOOP
      IF jsonb_typeof(tag) IS DISTINCT FROM 'object' OR
        tag - ARRAY['section','tradition','region','preparation','modern_check','match','list','quick_answer_misses'] <> '{}'::jsonb OR coalesce(tag ->> 'section', '') !~ '^[a-z][a-z0-9-]{0,59}$'
        OR jsonb_typeof(tag -> 'tradition') IS DISTINCT FROM 'string' OR length(btrim(tag ->> 'tradition')) = 0
        OR length(tag ->> 'tradition') > 160 OR jsonb_typeof(tag -> 'match') IS DISTINCT FROM 'string'
        OR length(btrim(tag ->> 'match')) = 0 OR length(tag ->> 'match') > 120
        OR coalesce(tag ->> 'modern_check', '') NOT IN
          ('supports','corrects','contradicts','mixed','too_little_evidence','not_tested_as_used')
        OR coalesce(tag ->> 'list', '') NOT IN ('useful','correction','untested')
        OR jsonb_typeof(tag -> 'quick_answer_misses') IS DISTINCT FROM 'boolean'
        OR (tag ? 'region' AND (jsonb_typeof(tag -> 'region') IS DISTINCT FROM 'string'
          OR length(btrim(tag ->> 'region')) = 0 OR length(tag ->> 'region') > 80))
        OR (tag ? 'preparation' AND (jsonb_typeof(tag -> 'preparation') IS DISTINCT FROM 'string'
          OR length(btrim(tag ->> 'preparation')) = 0 OR length(tag ->> 'preparation') > 120))
      THEN RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID'; END IF;
    END LOOP;
  END LOOP;
  IF disagreements IS NOT NULL THEN
    IF jsonb_typeof(disagreements) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID'; END IF;
    IF jsonb_array_length(disagreements) > 200 OR
      (SELECT count(DISTINCT (value ->> 'tcm_item', value ->> 'ccm_item')) FROM jsonb_array_elements(disagreements)) <>
      jsonb_array_length(disagreements) THEN RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID'; END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(disagreements) LOOP
      IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR entry - ARRAY['tcm_item','ccm_item','line'] <> '{}'::jsonb
        OR coalesce(entry ->> 'tcm_item', '') !~ '^[PF]-[1-9][0-9]{3,}$'
        OR coalesce(entry ->> 'ccm_item', '') !~ '^[PF]-[1-9][0-9]{3,}$'
        OR jsonb_typeof(entry -> 'line') IS DISTINCT FROM 'string' OR length(btrim(entry ->> 'line')) = 0
        OR length(entry ->> 'line') >= 200 OR (entry ->> 'line') ~ E'[\\r\\n]' THEN RAISE EXCEPTION 'ATLAS_TRADITION_INPUT_INVALID'; END IF;
    END LOOP;
  END IF;
  -- Validate the whole request before replacing anything. A function call is atomic.
  FOR entry IN SELECT value FROM jsonb_array_elements(changes) LOOP
    DELETE FROM atlas_tradition_labels WHERE item_number = entry ->> 'item';
    INSERT INTO atlas_tradition_labels (item_number, section_key, label, labeled_at)
      SELECT entry ->> 'item', value ->> 'section', value, label_time FROM jsonb_array_elements(entry -> 'labels');
  END LOOP;
  IF disagreements IS NOT NULL THEN
    DELETE FROM atlas_tradition_disagreements;
    INSERT INTO atlas_tradition_disagreements SELECT value ->> 'tcm_item', value ->> 'ccm_item', value ->> 'line'
      FROM jsonb_array_elements(disagreements);
  END IF;
  RETURN jsonb_array_length(changes);
END $function$;
REVOKE ALL ON FUNCTION set_atlas_traditions(jsonb, jsonb, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION inspect_atlas_traditions() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp AS $function$
  SELECT jsonb_build_object(
    'labels', coalesce((SELECT jsonb_agg(label || jsonb_build_object('item', item_number, 'labeledAt', labeled_at)
      ORDER BY item_number, section_key) FROM atlas_tradition_labels), '[]'::jsonb),
    'disagreements', coalesce((SELECT jsonb_agg(jsonb_build_object('tcm_item', tcm_item, 'ccm_item', ccm_item, 'line', line)
      ORDER BY tcm_item, ccm_item) FROM atlas_tradition_disagreements), '[]'::jsonb))
$function$;
REVOKE ALL ON FUNCTION inspect_atlas_traditions() FROM PUBLIC;
