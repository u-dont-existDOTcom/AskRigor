SET search_path TO __SCHEMA__, public;

-- Codex's re-review of 17 Nov 2026, finding 4: the owner's publish_cards stored no route either, and its page said the
-- quick-answer test had happened. Four routes are stored apart: owner_action, written by publish_atlas_findings from a
-- draft the owner publishes (publish_cards, a decision's publication), and by keep_atlas_publications when it shows a
-- kept finding again; quick_answer_test, written by keep_atlas_publications only when the finding it shows again was
-- kept with the quick-answer test's own pass reason (docs/atlas-quick-answer-test.md, step 5); automatic_showing, as
-- below; and NULL, not recorded. The pages say the test happened only for quick_answer_test, or from a challenge mark.
-- keep_atlas_publications keeps 0024's shape, so its grant stands. This migration is unreleased, so it is edited in
-- place.
--
-- Codex's review of 17 Nov 2026, finding 4. With ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS=enabled (the owner, 17 Nov 2026)
-- the save shows a finding on the pages at once, unreviewed, instead of keeping it for AskRigor's research until the
-- quick-answer test shows it (owner answer 240a). Its page then says nothing of the test, but the pages knew only the
-- setting, so turning it off made such a page say again that a separate AI had found a quick AI answer misses it. How a
-- publication reached the pages is now stored with it: shown_by is 'automatic_showing' when the save published it under
-- that setting rather than keeping it for the quick-answer test, so the test never showed it; the other routes are as
-- above, and NULL is not recorded, as for every publication before this migration. publish_atlas_findings writes it
-- from a draft's shownBy (automatic_showing only for an unreviewed draft, owner_action only for one that shows);
-- publishing a withdrawn finding again takes the draft's route when it gives one and otherwise leaves it as it was. The
-- reader reads the column for the pages.
--
-- Codex's review of 17 Nov 2026, finding 1 (P0): under that setting, a finding whose card doesn't declare, as the final
-- check signed, that it names no living person is kept off the pages for the owner's decision. So that a keep that
-- fails after the publishing never leaves it shown, an unreviewed draft may carry keptReason, which
-- publish_atlas_findings sets as the new row's kept reason in the same write (0024's columns and check). Existing
-- functions keep their shapes. Safe to run again: every migration runs on each start, in one transaction.

ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS shown_by text;

ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_shown_by_check;
ALTER TABLE atlas_publications ADD CONSTRAINT atlas_publications_v1_shown_by_check CHECK (
  shown_by IS NULL OR shown_by IN ('owner_action', 'quick_answer_test', 'automatic_showing')
);

COMMENT ON COLUMN atlas_publications.shown_by IS
  'How the publication reached the pages: owner_action when the owner published it (publish_cards, a decision) or showed it again after it was kept; quick_answer_test when it was shown again after the quick-answer test kept it with its pass; automatic_showing when the save published it while saved findings show at once (ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS); NULL when not recorded: a publication from before this migration, one an earlier image published, or one still kept since its save. Its page says the quick-answer test happened only for quick_answer_test, or from a challenge mark''s stored verdict.';

-- Publishes a card's findings: a new row for each finding without one for this card digest, each taking the next
-- public number, with how it reached the pages (shown_by) and the reason it is kept off them for the owner when its
-- draft gives them. A finding already published is returned as it is, unless revive_withdrawn (the owner's choice of
-- card) finds it withdrawn because its card was set aside or replaced or the owner unpublished it, with its texts still
-- there: then it is published again with the fields given, its shown_by from the draft when the draft gives one (the
-- owner's) and as it was otherwise, and its kept reason as it was. Each returned row says which happened. Its shape is
-- migration 0021's.
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
  draft_kept jsonb;
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
    draft_kept := NULLIF(draft -> 'keptReason', 'null'::jsonb);
    IF outcomes ? draft_number::text
       OR (draft_state IN ('accepted', 'edited')) <> (draft_atlas IS NOT NULL)
       OR (draft_atlas IS NOT NULL AND draft_atlas !~ '^F-[1-9][0-9]{3,}$')
       OR (draft_state = 'held') <> (draft_held IS NOT NULL)
       OR (draft_shown_by IS NOT NULL AND NOT (
             (draft_shown_by = '"automatic_showing"'::jsonb AND draft_state = 'unreviewed')
             OR (draft_shown_by = '"owner_action"'::jsonb AND draft_state IN ('unreviewed', 'accepted', 'edited'))))
       OR (draft_kept IS NOT NULL AND (jsonb_typeof(draft_kept) <> 'string' OR draft_state <> 'unreviewed'
           OR draft_kept #>> '{}' <> btrim(draft_kept #>> '{}') OR length(draft_kept #>> '{}') NOT BETWEEN 1 AND 2000))
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
         held_because, published_at, state_changed_at, shown_by, kept_for_research_at, kept_reason)
      VALUES
        ('P-' || nextval('atlas_publication_number_seq')::text, target_card_number, target_card_sha256,
         draft_number::smallint, draft -> 'published', draft_state, draft_atlas, draft_held, publish_time, publish_time,
         draft_shown_by #>> '{}', CASE WHEN draft_kept IS NULL THEN NULL ELSE publish_time END, draft_kept #>> '{}')
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
             shown_by = coalesce(draft_shown_by #>> '{}', stored.shown_by),
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

-- Keeps the publications named for research only, with the owner's private reason, or with keep false shows them on the
-- pages again: 0024's function, which showing again now also records how a kept publication reached the pages
-- (shown_by): quick_answer_test when the quick-answer test kept it with its own pass reason, owner_action otherwise.
-- Showing one that isn't kept changes nothing of it. Its shape is migration 0024's.
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
         SET kept_for_research_at = NULL, kept_reason = NULL,
             shown_by = CASE
               WHEN target.kept_for_research_at IS NULL THEN stored.shown_by
               WHEN target.kept_reason = 'owner answer 240a: quick-answer test, passed'
                 OR target.kept_reason LIKE 'owner answer 240a: quick-answer test, passed,%' THEN 'quick_answer_test'
               ELSE 'owner_action'
             END
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

-- Codex's third review of 17 Nov 2026, finding 1 (P0): a later save of the same question and claims lands on the open
-- card (existing_card) and publishes nothing of its own, so a "yes" it carries, declared or the meaning judge's, left
-- the first save's publication public. The save path now holds every publication of that card whose claim matches a
-- finding the later save says names a living person, through hold_atlas_publications_for_living_person, unless the
-- owner has decided it: accepted or edited, or shown by his own action (shown_by owner_action), which a save never
-- undoes. Such a publication instead gets living_person_noted_at, which the owner's list_publications reads through
-- inspect_atlas_living_person_notes. The review role runs both (provision-research-review-role.sh grants them).

ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS living_person_noted_at timestamptz;

COMMENT ON COLUMN atlas_publications.living_person_noted_at IS
  'When a later save of its card first said this finding may name a living person after the owner had decided it (accepted or edited, or shown by his own action): the save never undoes his decision, and his list_publications says so. NULL otherwise.';

-- Holds each publication named that the owner hasn't decided for living_person_review, with no page: an unreviewed one
-- with its texts, kept or not, becomes held; a held one gains the reason. One the owner decided (accepted, edited, or
-- unreviewed and shown by his own action) stays as it is and is noted. A rejected or withdrawn one, or one whose texts
-- are erased, has no page and stays as it is. Each row returned says which happened: held, reason_added,
-- already_held, noted or unchanged. At most 100 numbers.
CREATE OR REPLACE FUNCTION hold_atlas_publications_for_living_person(
  target_publication_numbers text[],
  hold_time timestamptz
)
RETURNS TABLE (held_publication_number text, held_state text, held_reasons jsonb, held_outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_publications%ROWTYPE;
  outcomes jsonb := '{}'::jsonb;
  outcome text;
BEGIN
  IF target_publication_numbers IS NULL OR cardinality(target_publication_numbers) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(target_publication_numbers) AS given(number)
                 WHERE given.number IS NULL OR given.number !~ '^P-[1-9][0-9]{3,}$')
     OR hold_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  FOR target IN
    SELECT * FROM atlas_publications stored
     WHERE stored.publication_number = ANY(target_publication_numbers)
     ORDER BY substring(stored.publication_number FROM 3)::bigint
     FOR UPDATE
  LOOP
    IF target.state IN ('accepted', 'edited') OR (target.state = 'unreviewed' AND target.shown_by = 'owner_action') THEN
      UPDATE atlas_publications stored
         SET living_person_noted_at = coalesce(stored.living_person_noted_at, hold_time)
       WHERE stored.publication_number = target.publication_number;
      outcome := 'noted';
    ELSIF target.state = 'held' AND target.held_because ? 'living_person_review' THEN
      outcome := 'already_held';
    ELSIF target.state = 'held' THEN
      -- living_person_review is the last of 0021's reasons, so adding it at the end keeps their order.
      UPDATE atlas_publications stored
         SET held_because = stored.held_because || '["living_person_review"]'::jsonb,
             state_changed_at = greatest(hold_time, stored.state_changed_at)
       WHERE stored.publication_number = target.publication_number;
      outcome := 'reason_added';
    ELSIF target.state = 'unreviewed' AND target.published_json IS NOT NULL THEN
      UPDATE atlas_publications stored
         SET state = 'held', held_because = '["living_person_review"]'::jsonb,
             state_changed_at = greatest(hold_time, stored.state_changed_at)
       WHERE stored.publication_number = target.publication_number;
      outcome := 'held';
    ELSE
      outcome := 'unchanged';
    END IF;
    outcomes := outcomes || jsonb_build_object(target.publication_number, outcome);
  END LOOP;
  RETURN QUERY
  SELECT stored.publication_number, stored.state, stored.held_because, outcomes ->> stored.publication_number
    FROM atlas_publications stored
   WHERE outcomes ? stored.publication_number
   ORDER BY substring(stored.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION hold_atlas_publications_for_living_person(text[], timestamptz) FROM PUBLIC;

-- The publications named that a later save noted as possibly naming a living person after the owner had decided them,
-- with when, for the owner's list_publications. At most 500 numbers.
CREATE OR REPLACE FUNCTION inspect_atlas_living_person_notes(target_publication_numbers text[])
RETURNS TABLE (noted_publication_number text, noted_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF target_publication_numbers IS NULL OR cardinality(target_publication_numbers) > 500
     OR EXISTS (SELECT 1 FROM unnest(target_publication_numbers) AS given(number)
                 WHERE given.number IS NULL OR given.number !~ '^P-[1-9][0-9]{3,}$')
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT stored.publication_number, stored.living_person_noted_at
    FROM atlas_publications stored
   WHERE stored.publication_number = ANY(target_publication_numbers)
     AND stored.living_person_noted_at IS NOT NULL
   ORDER BY substring(stored.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_living_person_notes(text[]) FROM PUBLIC;
