SET search_path TO __SCHEMA__, public;

-- Owner, 3 Nov 2026, on GPT's practitioner scorecard: "that's what i'm talking about for the atlas. make that
-- prominent, we need to have more real value added things like that in the atlas." (Plan
-- docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, section 4.) Rows a problem's page shows at a glance
-- beside the ones computed from findings: a controlled result, a named practitioner's published outcome series, a
-- programme's outcomes, a historical lead worth chasing, or what failed or harmed, each with its result, comparison,
-- follow-up, limits and sources. A row is proposed (private), shown only on the owner's yes for that row, and can be
-- withdrawn. A row naming a person holds published outcomes only, never an allegation; the review says so before the
-- owner's yes. The review role writes through propose_atlas_glance_row and set_atlas_glance_row_state and reads through
-- inspect_atlas_glance_rows (the provisioning script grants exactly those); the reader reads shown rows for the pages.
-- Safe to run again: every migration runs on each start, in one transaction.

CREATE SEQUENCE IF NOT EXISTS atlas_glance_row_number_seq AS bigint START WITH 1001 MINVALUE 1001 NO CYCLE;

CREATE TABLE IF NOT EXISTS atlas_glance_rows (
  row_number bigint PRIMARY KEY CHECK (row_number >= 1001),
  category_key text NOT NULL CHECK (category_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  subcategory_key text NOT NULL CHECK (subcategory_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  row_class text NOT NULL CHECK (row_class IN ('controlled', 'practitioner', 'programme', 'lead', 'failed')),
  what text NOT NULL CHECK (what = btrim(what) AND length(what) BETWEEN 1 AND 300),
  result text NOT NULL CHECK (result = btrim(result) AND length(result) BETWEEN 1 AND 800),
  comparison text CHECK (comparison IS NULL OR (comparison = btrim(comparison) AND length(comparison) BETWEEN 1 AND 300)),
  follow_up text CHECK (follow_up IS NULL OR (follow_up = btrim(follow_up) AND length(follow_up) BETWEEN 1 AND 200)),
  limits text NOT NULL CHECK (limits = btrim(limits) AND length(limits) BETWEEN 1 AND 800),
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) BETWEEN 1 AND 10
    AND octet_length(sources::text) <= 4000),
  names_a_person boolean NOT NULL,
  state text NOT NULL CHECK (state IN ('proposed', 'shown', 'withdrawn')),
  proposed_at timestamptz NOT NULL,
  shown_at timestamptz,
  state_changed_at timestamptz NOT NULL,
  CONSTRAINT atlas_glance_rows_v1_state_check CHECK (
    (state = 'shown') = (shown_at IS NOT NULL) AND proposed_at <= state_changed_at
  )
);

CREATE INDEX IF NOT EXISTS atlas_glance_rows_shown_idx ON atlas_glance_rows (category_key, subcategory_key, row_number)
  WHERE state = 'shown';

COMMENT ON TABLE atlas_glance_rows IS
  'A problem''s rows at a glance beside those computed from findings (owner, 3 Nov 2026): shown only on the owner''s yes for each; a row naming a person holds published outcomes only.';

-- A proposed row, private until the owner's yes. Returns its id, G-<n>.
CREATE OR REPLACE FUNCTION propose_atlas_glance_row(new_row jsonb, propose_time timestamptz)
RETURNS TABLE (row_public_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  next_number bigint;
  field text;
BEGIN
  IF new_row IS NULL OR jsonb_typeof(new_row) <> 'object' OR propose_time IS NULL
     OR jsonb_typeof(new_row -> 'namesAPerson') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(new_row -> 'sources') IS DISTINCT FROM 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(new_row -> 'sources') AS source(value)
                 WHERE jsonb_typeof(source.value) <> 'string' OR length(source.value #>> '{}') NOT BETWEEN 1 AND 300)
  THEN
    RAISE EXCEPTION 'ATLAS_GLANCE_INPUT_INVALID';
  END IF;
  FOR field IN SELECT jsonb_object_keys(new_row) LOOP
    IF field NOT IN ('category', 'subcategory', 'rowClass', 'what', 'result', 'comparison', 'followUp', 'limits',
                     'sources', 'namesAPerson') THEN
      RAISE EXCEPTION 'ATLAS_GLANCE_INPUT_INVALID';
    END IF;
  END LOOP;
  next_number := nextval('atlas_glance_row_number_seq');
  BEGIN
    INSERT INTO atlas_glance_rows
      (row_number, category_key, subcategory_key, row_class, what, result, comparison, follow_up, limits, sources,
       names_a_person, state, proposed_at, state_changed_at)
    VALUES
      (next_number, new_row ->> 'category', new_row ->> 'subcategory', new_row ->> 'rowClass', new_row ->> 'what',
       new_row ->> 'result', new_row ->> 'comparison', new_row ->> 'followUp', new_row ->> 'limits',
       new_row -> 'sources', (new_row ->> 'namesAPerson')::boolean, 'proposed', propose_time, propose_time);
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'ATLAS_GLANCE_INPUT_INVALID';
  END;
  RETURN QUERY SELECT 'G-' || next_number::text;
END
$function$;

REVOKE ALL ON FUNCTION propose_atlas_glance_row(jsonb, timestamptz) FROM PUBLIC;

-- The owner's yes ('shown'), or a withdrawal ('withdrawn'); a withdrawn row stays withdrawn. No row when no row has
-- that id.
CREATE OR REPLACE FUNCTION set_atlas_glance_row_state(target_public_id text, new_state text, change_time timestamptz)
RETURNS TABLE (row_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_glance_rows%ROWTYPE;
BEGIN
  IF target_public_id IS NULL OR target_public_id !~ '^G-[1-9][0-9]{3,}$'
     OR new_state IS NULL OR new_state NOT IN ('shown', 'withdrawn') OR change_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_GLANCE_INPUT_INVALID';
  END IF;
  SELECT * INTO target FROM atlas_glance_rows stored
   WHERE stored.row_number = substr(target_public_id, 3)::bigint
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF target.state = 'withdrawn' THEN
    RAISE EXCEPTION 'ATLAS_GLANCE_WITHDRAWN';
  END IF;
  UPDATE atlas_glance_rows stored
     SET state = new_state,
         shown_at = CASE WHEN new_state = 'shown' THEN coalesce(stored.shown_at, change_time) ELSE NULL END,
         state_changed_at = greatest(change_time, stored.state_changed_at)
   WHERE stored.row_number = target.row_number;
  RETURN QUERY SELECT stored.state FROM atlas_glance_rows stored WHERE stored.row_number = target.row_number;
END
$function$;

REVOKE ALL ON FUNCTION set_atlas_glance_row_state(text, text, timestamptz) FROM PUBLIC;

-- Rows in one state, oldest first, after a row number when given.
CREATE OR REPLACE FUNCTION inspect_atlas_glance_rows(state_filter text, after_number bigint, row_limit integer)
RETURNS TABLE (
  row_number bigint, category_key text, subcategory_key text, row_class text, what text, result text,
  comparison text, follow_up text, limits text, sources jsonb, names_a_person boolean, state text,
  proposed_at timestamptz, shown_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF state_filter IS NULL OR state_filter NOT IN ('proposed', 'shown', 'withdrawn')
     OR row_limit IS NULL OR row_limit NOT BETWEEN 1 AND 50
  THEN
    RAISE EXCEPTION 'ATLAS_GLANCE_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT stored.row_number, stored.category_key, stored.subcategory_key, stored.row_class, stored.what, stored.result,
         stored.comparison, stored.follow_up, stored.limits, stored.sources, stored.names_a_person, stored.state,
         stored.proposed_at, stored.shown_at
    FROM atlas_glance_rows stored
   WHERE stored.state = state_filter AND (after_number IS NULL OR stored.row_number > after_number)
   ORDER BY stored.row_number
   LIMIT row_limit;
END
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_glance_rows(text, bigint, integer) FROM PUBLIC;

REVOKE ALL ON SEQUENCE atlas_glance_row_number_seq FROM PUBLIC;
