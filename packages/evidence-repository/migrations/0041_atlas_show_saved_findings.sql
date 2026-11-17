SET search_path TO __SCHEMA__, public;

-- Codex's review of 17 Nov 2026, finding 4. With ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS=enabled (the owner, 17 Nov 2026)
-- the save shows a finding on the pages at once, unreviewed, instead of keeping it for AskRigor's research until the
-- quick-answer test shows it (owner answer 240a). Its page then says nothing of the test, but the pages knew only the
-- setting, so turning it off made such a page say again that a separate AI had found a quick AI answer misses it. How a
-- publication reached the pages is now stored with it: shown_by is 'automatic_showing' when the save showed it at once,
-- and NULL otherwise, as for every publication before this migration: kept for the quick-answer test until the test
-- (or the owner) showed it, or published by the owner. publish_atlas_findings writes it from a draft's shownBy, which
-- only an unreviewed draft may carry; publishing a withdrawn finding again leaves it as it was. The reader reads the
-- column for the pages. Existing functions keep their shapes. Safe to run again: every migration runs on each start,
-- in one transaction.

ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS shown_by text;

ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_shown_by_check;
ALTER TABLE atlas_publications ADD CONSTRAINT atlas_publications_v1_shown_by_check CHECK (
  shown_by IS NULL OR shown_by = 'automatic_showing'
);

COMMENT ON COLUMN atlas_publications.shown_by IS
  'How the publication reached the pages: automatic_showing when the save showed it at once (ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS), so its page says nothing of the quick-answer test without a challenge mark; NULL when it was kept for the quick-answer test, or published by the owner.';

-- Publishes a card's findings: a new row for each finding without one for this card digest, each taking the next
-- public number, with how it reached the pages (shown_by) when its draft gives it. A finding already published is
-- returned as it is, unless revive_withdrawn (the owner's choice of card) finds it withdrawn because its card was set
-- aside or replaced or the owner unpublished it, with its texts still there: then it is published again with the fields
-- given, and its shown_by as it was. Each returned row says which happened. Its shape is migration 0021's.
CREATE OR REPLACE FUNCTION publish_atlas_findings(
  target_card_number integer,
  target_card_sha256 text,
  publication_drafts jsonb,
  publish_time timestamptz,
  revive_withdrawn boolean
)
RETURNS TABLE (
  publication_number text,
  card_number integer,
  card_sha256 text,
  finding_number smallint,
  published_json jsonb,
  state text,
  atlas_number text,
  held_because jsonb,
  withdrawn_because text,
  owner_reason text,
  published_at timestamptz,
  state_changed_at timestamptz,
  card_forgotten_at timestamptz,
  texts_erased_at timestamptz,
  outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  draft jsonb;
  draft_number integer;
  draft_state text;
  draft_atlas text;
  draft_held jsonb;
  draft_shown_by jsonb;
  existing atlas_publications%ROWTYPE;
  outcomes jsonb := '{}'::jsonb;
BEGIN
  IF target_card_number IS NULL OR target_card_number < 1
     OR target_card_sha256 IS NULL OR target_card_sha256 !~ '^[a-f0-9]{64}$'
     OR publication_drafts IS NULL OR jsonb_typeof(publication_drafts) <> 'array'
     OR jsonb_array_length(publication_drafts) NOT BETWEEN 1 AND 5
     OR publish_time IS NULL OR revive_withdrawn IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  FOR draft IN SELECT entry.draft_value FROM jsonb_array_elements(publication_drafts) AS entry(draft_value) LOOP
    IF jsonb_typeof(draft) <> 'object'
       OR coalesce(draft ->> 'findingNumber', '') !~ '^[1-5]$'
       OR jsonb_typeof(draft -> 'published') IS DISTINCT FROM 'object'
       OR coalesce(draft ->> 'state', '') NOT IN ('unreviewed', 'held', 'accepted', 'edited')
    THEN
      RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
    END IF;
    draft_number := (draft ->> 'findingNumber')::integer;
    draft_state := draft ->> 'state';
    draft_atlas := draft ->> 'atlasNumber';
    draft_held := NULLIF(draft -> 'heldBecause', 'null'::jsonb);
    draft_shown_by := NULLIF(draft -> 'shownBy', 'null'::jsonb);
    IF outcomes ? draft_number::text
       OR (draft_state IN ('accepted', 'edited')) <> (draft_atlas IS NOT NULL)
       OR (draft_atlas IS NOT NULL AND draft_atlas !~ '^F-[1-9][0-9]{3,}$')
       OR (draft_state = 'held') <> (draft_held IS NOT NULL)
       OR (draft_shown_by IS NOT NULL AND (draft_shown_by <> '"automatic_showing"'::jsonb OR draft_state <> 'unreviewed'))
    THEN
      RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
    END IF;

    SELECT * INTO existing
      FROM atlas_publications stored
     WHERE stored.card_sha256 = target_card_sha256
       AND stored.finding_number = draft_number
     FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO atlas_publications
        (publication_number, card_number, card_sha256, finding_number, published_json, state, atlas_number,
         held_because, published_at, state_changed_at, shown_by)
      VALUES
        ('P-' || nextval('atlas_publication_number_seq')::text, target_card_number, target_card_sha256,
         draft_number::smallint, draft -> 'published', draft_state, draft_atlas, draft_held, publish_time, publish_time,
         draft_shown_by #>> '{}')
      ON CONFLICT (card_sha256, finding_number) WHERE card_sha256 IS NOT NULL DO NOTHING;
      outcomes := outcomes || jsonb_build_object(draft_number::text, CASE WHEN FOUND THEN 'published' ELSE 'existing' END);
    ELSIF revive_withdrawn AND existing.state = 'withdrawn'
          AND existing.withdrawn_because IN ('card_set_aside', 'owner_unpublished', 'card_replaced')
          AND existing.texts_erased_at IS NULL AND existing.card_forgotten_at IS NULL THEN
      UPDATE atlas_publications stored
         SET published_json = draft -> 'published',
             state = draft_state,
             atlas_number = draft_atlas,
             held_because = draft_held,
             withdrawn_because = NULL,
             owner_reason = NULL,
             card_number = target_card_number,
             state_changed_at = greatest(publish_time, stored.state_changed_at)
       WHERE stored.publication_number = existing.publication_number;
      outcomes := outcomes || jsonb_build_object(draft_number::text, 'revived');
    ELSE
      outcomes := outcomes || jsonb_build_object(draft_number::text, 'existing');
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT stored.publication_number, stored.card_number, stored.card_sha256, stored.finding_number,
         stored.published_json, stored.state, stored.atlas_number, stored.held_because, stored.withdrawn_because,
         stored.owner_reason, stored.published_at, stored.state_changed_at, stored.card_forgotten_at,
         stored.texts_erased_at, outcomes ->> stored.finding_number::text
    FROM atlas_publications stored
   WHERE stored.card_sha256 = target_card_sha256
     AND outcomes ? stored.finding_number::text
   ORDER BY stored.finding_number;
END
$function$;

REVOKE ALL ON FUNCTION publish_atlas_findings(integer, text, jsonb, timestamptz, boolean) FROM PUBLIC;
