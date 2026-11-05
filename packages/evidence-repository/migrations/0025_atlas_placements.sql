SET search_path TO __SCHEMA__, public;

-- Owner answer 229a (3 Nov 2026; plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, section 1): where
-- each Atlas item sits in the categories, one subcategory each: a publication (P-), an accepted finding (F-) or a
-- person's report (R-). The tree itself is in code (apps/research-mcp/src/atlas/health-tree.ts); a row holds only its
-- keys, which the review checks against the tree before it writes. Nothing here is about a person. The review role
-- writes through set_atlas_placements and reads through inspect_atlas_placements (the provisioning script grants
-- exactly those); the reader reads the table for the pages. Safe to run again: every migration runs on each start, in
-- one transaction.

CREATE TABLE IF NOT EXISTS atlas_placements (
  item_number text PRIMARY KEY CHECK (item_number ~ '^[PFR]-[1-9][0-9]{3,}$'),
  category_key text NOT NULL CHECK (category_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  subcategory_key text NOT NULL CHECK (subcategory_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  placed_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS atlas_placements_subcategory_idx ON atlas_placements (category_key, subcategory_key);

COMMENT ON TABLE atlas_placements IS
  'Where each Atlas item sits (owner answer 229a): one category and subcategory per publication, accepted finding or report, by their keys in the code''s tree; nothing about a person.';

-- Sets where these items sit, at most 200 at once and each item once; an entry whose category and subcategory are both
-- null takes the item out of the tree. Returns how many rows it set or removed.
CREATE OR REPLACE FUNCTION set_atlas_placements(new_placements jsonb, place_time timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  entry jsonb;
  changed integer := 0;
  touched integer;
BEGIN
  IF new_placements IS NULL OR jsonb_typeof(new_placements) <> 'array'
     OR jsonb_array_length(new_placements) NOT BETWEEN 1 AND 200 OR place_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PLACEMENT_INPUT_INVALID';
  END IF;
  FOR entry IN SELECT element.value FROM jsonb_array_elements(new_placements) AS element(value) LOOP
    IF jsonb_typeof(entry) <> 'object'
       OR coalesce(entry ->> 'item', '') !~ '^[PFR]-[1-9][0-9]{3,}$'
       OR NOT ((jsonb_typeof(entry -> 'category') = 'string' AND jsonb_typeof(entry -> 'subcategory') = 'string'
                AND (entry ->> 'category') ~ '^[a-z][a-z0-9-]{0,59}$'
                AND (entry ->> 'subcategory') ~ '^[a-z][a-z0-9-]{0,59}$')
               OR (jsonb_typeof(entry -> 'category') = 'null' AND jsonb_typeof(entry -> 'subcategory') = 'null'))
    THEN
      RAISE EXCEPTION 'ATLAS_PLACEMENT_INPUT_INVALID';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT element.value ->> 'item') FROM jsonb_array_elements(new_placements) AS element(value))
     <> jsonb_array_length(new_placements)
  THEN
    RAISE EXCEPTION 'ATLAS_PLACEMENT_INPUT_INVALID';
  END IF;
  FOR entry IN SELECT element.value FROM jsonb_array_elements(new_placements) AS element(value) LOOP
    IF jsonb_typeof(entry -> 'category') = 'null' THEN
      DELETE FROM atlas_placements stored WHERE stored.item_number = entry ->> 'item';
    ELSE
      INSERT INTO atlas_placements AS stored (item_number, category_key, subcategory_key, placed_at)
      VALUES (entry ->> 'item', entry ->> 'category', entry ->> 'subcategory', place_time)
      ON CONFLICT (item_number) DO UPDATE
        SET category_key = EXCLUDED.category_key,
            subcategory_key = EXCLUDED.subcategory_key,
            placed_at = EXCLUDED.placed_at;
    END IF;
    GET DIAGNOSTICS touched = ROW_COUNT;
    changed := changed + touched;
  END LOOP;
  RETURN changed;
END
$function$;

REVOKE ALL ON FUNCTION set_atlas_placements(jsonb, timestamptz) FROM PUBLIC;

-- Every placement, by item number.
CREATE OR REPLACE FUNCTION inspect_atlas_placements()
RETURNS TABLE (placement_item text, placement_category text, placement_subcategory text, placement_placed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT stored.item_number, stored.category_key, stored.subcategory_key, stored.placed_at
    FROM atlas_placements stored
   ORDER BY stored.item_number
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_placements() FROM PUBLIC;
