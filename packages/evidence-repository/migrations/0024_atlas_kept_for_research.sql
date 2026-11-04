SET search_path TO __SCHEMA__, public;

-- Owner answers 229a and 231a (3 Nov 2026): "the atlas can have answers that askrigor can draw from btw that was also
-- the point, to not -redo research that was already done, but the public facing display should not just be all the
-- stored research, we want to give humans only what's high value they can't easily find elsewhere." A publication
-- kept for AskRigor's research stays in the research lookup and keeps its page at its own address, but no list,
-- topic, home page, search, map or sitemap shows it, and its page is kept out of search engines and says why. The
-- owner keeps it, with a private reason, or shows it again. An unpublished card (owner_unpublished, never accepted)
-- comes back unreviewed and kept; a held, rejected, forgotten, set-aside or replaced publication can't be kept. The
-- review role writes through keep_atlas_publications and reads through inspect_atlas_kept_publications (the
-- provisioning script grants exactly those); the reader reads the columns for the pages. Existing functions keep their
-- shapes. Safe to run again: every migration runs on each start, in one transaction.

ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS kept_for_research_at timestamptz;
ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS kept_reason text;

ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_kept_check;
ALTER TABLE atlas_publications ADD CONSTRAINT atlas_publications_v1_kept_check CHECK (
  (kept_for_research_at IS NULL) = (kept_reason IS NULL)
  AND (kept_reason IS NULL OR (kept_reason = btrim(kept_reason) AND length(kept_reason) BETWEEN 1 AND 2000))
);

CREATE INDEX IF NOT EXISTS atlas_publications_kept_idx ON atlas_publications (publication_number)
  WHERE kept_for_research_at IS NOT NULL;

COMMENT ON COLUMN atlas_publications.kept_for_research_at IS
  'When the owner kept this publication for AskRigor''s research only (owner answers 229a and 231a): it stays in the research lookup and keeps its page, but no list, topic, home page, search, map or sitemap shows it.';
COMMENT ON COLUMN atlas_publications.kept_reason IS
  'The owner''s private reason for keeping it for research only; never shown on a page.';

-- Keeps the publications named, by P number or by F number (every publication naming it), for research only, with
-- the owner's private reason; with keep false, shows them on the pages again. At most 100 numbers each. Raises
-- ATLAS_PUBLICATION_NOT_KEEPABLE, and changes nothing, when one of them is in a state that can't be kept.
CREATE OR REPLACE FUNCTION keep_atlas_publications(
  target_publication_numbers text[],
  target_atlas_numbers text[],
  keep boolean,
  reason text,
  change_time timestamptz
)
RETURNS TABLE (kept_publication_number text, kept_state text, kept_atlas_number text, kept boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_publications%ROWTYPE;
BEGIN
  IF target_publication_numbers IS NULL OR target_atlas_numbers IS NULL
     OR cardinality(target_publication_numbers) + cardinality(target_atlas_numbers) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(target_publication_numbers) AS given(number) WHERE given.number !~ '^P-[1-9][0-9]{3,}$')
     OR EXISTS (SELECT 1 FROM unnest(target_atlas_numbers) AS given(number) WHERE given.number !~ '^F-[1-9][0-9]{3,}$')
     OR keep IS NULL OR change_time IS NULL
     OR (keep AND (reason IS NULL OR reason <> btrim(reason) OR length(reason) NOT BETWEEN 1 AND 2000))
     OR (NOT keep AND reason IS NOT NULL)
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  FOR target IN
    SELECT * FROM atlas_publications stored
     WHERE stored.publication_number = ANY(target_publication_numbers)
        OR stored.atlas_number = ANY(target_atlas_numbers)
     ORDER BY substring(stored.publication_number FROM 3)::bigint
     FOR UPDATE
  LOOP
    IF keep THEN
      IF target.state = 'withdrawn' AND target.withdrawn_because = 'owner_unpublished' AND target.atlas_number IS NULL
         AND target.published_json IS NOT NULL THEN
        UPDATE atlas_publications stored
           SET state = 'unreviewed', withdrawn_because = NULL, owner_reason = NULL,
               kept_for_research_at = change_time, kept_reason = reason,
               state_changed_at = greatest(change_time, stored.state_changed_at)
         WHERE stored.publication_number = target.publication_number;
      ELSIF (target.state = 'unreviewed' AND target.published_json IS NOT NULL) OR target.state IN ('accepted', 'edited') THEN
        UPDATE atlas_publications stored
           SET kept_for_research_at = change_time, kept_reason = reason
         WHERE stored.publication_number = target.publication_number;
      ELSE
        RAISE EXCEPTION 'ATLAS_PUBLICATION_NOT_KEEPABLE';
      END IF;
    ELSE
      UPDATE atlas_publications stored
         SET kept_for_research_at = NULL, kept_reason = NULL
       WHERE stored.publication_number = target.publication_number;
    END IF;
  END LOOP;
  RETURN QUERY
  SELECT stored.publication_number, stored.state, stored.atlas_number, stored.kept_for_research_at IS NOT NULL
    FROM atlas_publications stored
   WHERE stored.publication_number = ANY(target_publication_numbers)
      OR stored.atlas_number = ANY(target_atlas_numbers)
   ORDER BY substring(stored.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION keep_atlas_publications(text[], text[], boolean, text, timestamptz) FROM PUBLIC;

-- Every publication kept for research, with the owner's private reason.
CREATE OR REPLACE FUNCTION inspect_atlas_kept_publications()
RETURNS TABLE (kept_publication_number text, kept_state text, kept_atlas_number text, kept_reason text,
  kept_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT stored.publication_number, stored.state, stored.atlas_number, stored.kept_reason, stored.kept_for_research_at
    FROM atlas_publications stored
   WHERE stored.kept_for_research_at IS NOT NULL
   ORDER BY substring(stored.publication_number FROM 3)::bigint
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_kept_publications() FROM PUBLIC;
