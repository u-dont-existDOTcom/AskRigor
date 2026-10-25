SET search_path TO __SCHEMA__, public;

-- Decision 171, section 4B (owner answers 168a and "171 approved", 24 Oct 2026; plan
-- docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md): a findings card saved in free contributor
-- mode is published in the Atlas as soon as it is saved, one row per finding, marked "Not checked by supervisors yet"
-- until the owner reviews it. The owner's call and the save path write the rows through the six review-role functions
-- below (provision-research-review-role.sh grants exactly these); nothing writes the table directly.
--
-- A row holds a public number (P-1001 onward, from its own sequence, never derived from an ARF number), the card's
-- issue number and digest with the finding's place on it (for moderation and idempotent publishing, never in the
-- published fields), the published fields, and the state: unreviewed, accepted (with its F number), edited (accepted
-- with the owner's wording, or corrected after; the pages show the Atlas finding the F number names), rejected,
-- withdrawn (the card was deleted, set aside or replaced, or the owner unpublished it) or held (its text holds contact
-- details, a card reference or a YouTube link, and waits for the owner). The published fields are the card's topic and
-- the finding's own texts, figures, searches, sources and bases, the save date and the AskRigor version: never the ARF
-- number, the account or contributor, the thread key, the answer quote, the surface or the reported model.
--
-- Deleting a card (decision 7) withdraws its publications that are not accepted and erases their published fields;
-- every row of the card loses its digest. Erasing a finding's wording (decision 7) erases the published fields of the
-- rows that name its F number. Safe to run again: every migration runs on each start, in one transaction.

CREATE SEQUENCE IF NOT EXISTS atlas_publication_number_seq AS bigint START WITH 1001 MINVALUE 1001 NO CYCLE;

CREATE TABLE IF NOT EXISTS atlas_publications (
  publication_number text PRIMARY KEY CHECK (publication_number ~ '^P-[1-9][0-9]{3,}$'),
  card_number integer NOT NULL CHECK (card_number > 0),
  card_sha256 text CHECK (card_sha256 IS NULL OR card_sha256 ~ '^[a-f0-9]{64}$'),
  finding_number smallint NOT NULL CHECK (finding_number BETWEEN 1 AND 5),
  published_json jsonb CHECK (published_json IS NULL OR jsonb_typeof(published_json) = 'object'),
  state text NOT NULL CHECK (state IN ('unreviewed', 'accepted', 'edited', 'rejected', 'withdrawn', 'held')),
  atlas_number text CHECK (atlas_number IS NULL OR atlas_number ~ '^F-[1-9][0-9]{3,}$'),
  held_because jsonb,
  withdrawn_because text,
  owner_reason text CHECK (
    owner_reason IS NULL OR (owner_reason = btrim(owner_reason) AND length(owner_reason) BETWEEN 1 AND 2000)
  ),
  published_at timestamptz NOT NULL,
  state_changed_at timestamptz NOT NULL,
  card_forgotten_at timestamptz,
  texts_erased_at timestamptz,
  -- An accepted or edited publication names its F number; one not reviewed, held or rejected names none.
  CONSTRAINT atlas_publications_v1_state_check CHECK (
    (state IN ('accepted', 'edited') AND atlas_number IS NOT NULL)
    OR (state IN ('unreviewed', 'held', 'rejected') AND atlas_number IS NULL)
    OR state = 'withdrawn'
  ),
  -- The owner's private reason goes only with an owner's unpublishing.
  CONSTRAINT atlas_publications_v1_withdrawn_check CHECK (
    (state = 'withdrawn') = (withdrawn_because IS NOT NULL)
    AND (owner_reason IS NULL OR withdrawn_because = 'owner_unpublished')
    AND (withdrawn_because IS DISTINCT FROM 'owner_unpublished' OR owner_reason IS NOT NULL)
  ),
  CONSTRAINT atlas_publications_v1_texts_check CHECK ((published_json IS NULL) = (texts_erased_at IS NOT NULL)),
  -- A forgotten card's rows keep no digest, and only an accepted one stays published.
  CONSTRAINT atlas_publications_v1_forgotten_check CHECK (
    (card_sha256 IS NULL) = (card_forgotten_at IS NOT NULL)
    AND (card_forgotten_at IS NULL OR state IN ('accepted', 'withdrawn'))
  ),
  CONSTRAINT atlas_publications_v1_times_check CHECK (
    published_at <= state_changed_at
    AND (card_forgotten_at IS NULL OR published_at <= card_forgotten_at)
    AND (texts_erased_at IS NULL OR published_at <= texts_erased_at)
  )
);

-- The closed lists of reasons, in step with ATLAS_PUBLICATION_HOLD_REASONS and ATLAS_PUBLICATION_WITHDRAWN_REASONS;
-- replaced on every run so the lists here are always the ones in force (as 0017 does for its failure codes).
ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_held_check;
ALTER TABLE atlas_publications ADD CONSTRAINT atlas_publications_v1_held_check CHECK (
  (state <> 'held' OR held_because IS NOT NULL)
  AND (held_because IS NULL OR (
    jsonb_typeof(held_because) = 'array'
    AND jsonb_array_length(held_because) BETWEEN 1 AND 5
    AND held_because <@ '["email_address", "phone_number", "messaging_handle", "card_reference", "youtube_link"]'::jsonb
  ))
);
ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_withdrawn_reason_check;
ALTER TABLE atlas_publications ADD CONSTRAINT atlas_publications_v1_withdrawn_reason_check CHECK (
  withdrawn_because IS NULL
  OR withdrawn_because IN ('card_forgotten', 'card_set_aside', 'owner_unpublished', 'card_replaced')
);

-- Publishing is idempotent by the card's digest and the finding's place on it.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_publications_card_finding_idx
  ON atlas_publications (card_sha256, finding_number)
  WHERE card_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_publications_card_number_idx
  ON atlas_publications (card_number, finding_number);

CREATE INDEX IF NOT EXISTS atlas_publications_atlas_number_idx
  ON atlas_publications (atlas_number)
  WHERE atlas_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_publications_state_idx
  ON atlas_publications (state);

COMMENT ON TABLE atlas_publications IS
  'Findings published in the Atlas from saved findings cards (decision 171), one row per finding. The published fields hold the card topic and the finding''s texts, figures, searches, sources, bases, save date and AskRigor version; never an ARF number, account, contributor, thread key, answer quote, surface or reported model. The card number and digest are for moderation and idempotent publishing only.';

-- The review role's six functions (SECURITY DEFINER; provision-research-review-role.sh grants exactly these) -------

-- The publications of the given states, cards, public numbers or F numbers (each filter NULL for any), newest first,
-- before the given number when paging.
CREATE OR REPLACE FUNCTION inspect_atlas_publications(
  target_states text[],
  target_card_numbers integer[],
  target_publication_numbers text[],
  target_atlas_numbers text[],
  before_number bigint,
  row_limit integer
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
  texts_erased_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF row_limit IS NULL OR row_limit NOT BETWEEN 1 AND 500
     OR (before_number IS NOT NULL AND before_number < 1)
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT stored.publication_number, stored.card_number, stored.card_sha256, stored.finding_number,
         stored.published_json, stored.state, stored.atlas_number, stored.held_because, stored.withdrawn_because,
         stored.owner_reason, stored.published_at, stored.state_changed_at, stored.card_forgotten_at,
         stored.texts_erased_at
    FROM atlas_publications stored
   WHERE (target_states IS NULL OR stored.state = ANY(target_states))
     AND (target_card_numbers IS NULL OR stored.card_number = ANY(target_card_numbers))
     AND (target_publication_numbers IS NULL OR stored.publication_number = ANY(target_publication_numbers))
     AND (target_atlas_numbers IS NULL OR stored.atlas_number = ANY(target_atlas_numbers))
     AND (before_number IS NULL OR substring(stored.publication_number FROM 3)::bigint < before_number)
   ORDER BY substring(stored.publication_number FROM 3)::bigint DESC
   LIMIT row_limit;
END
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_publications(text[], integer[], text[], text[], bigint, integer) FROM PUBLIC;

-- Publishes a card's findings: a new row for each finding without one for this card digest, each taking the next
-- public number. A finding already published is returned as it is, unless revive_withdrawn (the owner's choice of
-- card) finds it withdrawn because its card was set aside or replaced or the owner unpublished it, with its texts
-- still there: then it is published again with the fields given. Each returned row says which happened.
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
    IF outcomes ? draft_number::text
       OR (draft_state IN ('accepted', 'edited')) <> (draft_atlas IS NOT NULL)
       OR (draft_atlas IS NOT NULL AND draft_atlas !~ '^F-[1-9][0-9]{3,}$')
       OR (draft_state = 'held') <> (draft_held IS NOT NULL)
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
         held_because, published_at, state_changed_at)
      VALUES
        ('P-' || nextval('atlas_publication_number_seq')::text, target_card_number, target_card_sha256,
         draft_number::smallint, draft -> 'published', draft_state, draft_atlas, draft_held, publish_time, publish_time)
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

-- The owner's decision on a card's finding moves its publications that are not withdrawn: accepted or edited with the
-- F number, or rejected. Returns the rows it changed.
CREATE OR REPLACE FUNCTION decide_atlas_publications(
  target_card_number integer,
  target_finding_number integer,
  target_state text,
  target_atlas_number text,
  decision_time timestamptz
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
  texts_erased_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF target_card_number IS NULL OR target_card_number < 1
     OR target_finding_number IS NULL OR target_finding_number NOT BETWEEN 1 AND 5
     OR target_state IS NULL OR target_state NOT IN ('accepted', 'edited', 'rejected')
     OR (target_state = 'rejected') <> (target_atlas_number IS NULL)
     OR (target_atlas_number IS NOT NULL AND target_atlas_number !~ '^F-[1-9][0-9]{3,}$')
     OR decision_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  RETURN QUERY
  WITH moved AS (
    UPDATE atlas_publications stored
       SET state = target_state,
           atlas_number = target_atlas_number,
           state_changed_at = greatest(decision_time, stored.state_changed_at)
     WHERE stored.card_number = target_card_number
       AND stored.finding_number = target_finding_number
       AND stored.card_forgotten_at IS NULL
       AND stored.state IN ('unreviewed', 'held', 'accepted', 'edited', 'rejected')
       AND (stored.state IS DISTINCT FROM target_state OR stored.atlas_number IS DISTINCT FROM target_atlas_number)
    RETURNING stored.*
  )
  SELECT moved.publication_number, moved.card_number, moved.card_sha256, moved.finding_number, moved.published_json,
         moved.state, moved.atlas_number, moved.held_because, moved.withdrawn_because, moved.owner_reason,
         moved.published_at, moved.state_changed_at, moved.card_forgotten_at, moved.texts_erased_at
    FROM moved
   ORDER BY substring(moved.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION decide_atlas_publications(integer, integer, text, text, timestamptz) FROM PUBLIC;

-- An edit of an accepted finding (edit_finding after acceptance) moves the publications that name its F number from
-- accepted to edited; one whose card was forgotten is withdrawn instead, its published fields erased, as deleting the
-- card does with an edited one. Returns the rows it changed.
CREATE OR REPLACE FUNCTION edit_atlas_publications(target_atlas_number text, edit_time timestamptz)
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
  texts_erased_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF target_atlas_number IS NULL OR target_atlas_number !~ '^F-[1-9][0-9]{3,}$' OR edit_time IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  RETURN QUERY
  WITH moved AS (
    UPDATE atlas_publications stored
       SET state = CASE WHEN stored.card_forgotten_at IS NULL THEN 'edited' ELSE 'withdrawn' END,
           withdrawn_because = CASE WHEN stored.card_forgotten_at IS NULL THEN NULL ELSE 'card_forgotten' END,
           published_json = CASE WHEN stored.card_forgotten_at IS NULL THEN stored.published_json ELSE NULL END,
           texts_erased_at = CASE WHEN stored.card_forgotten_at IS NULL THEN stored.texts_erased_at
                                  ELSE coalesce(stored.texts_erased_at, greatest(edit_time, stored.published_at)) END,
           state_changed_at = greatest(edit_time, stored.state_changed_at)
     WHERE stored.atlas_number = target_atlas_number
       AND stored.state = 'accepted'
    RETURNING stored.*
  )
  SELECT moved.publication_number, moved.card_number, moved.card_sha256, moved.finding_number, moved.published_json,
         moved.state, moved.atlas_number, moved.held_because, moved.withdrawn_because, moved.owner_reason,
         moved.published_at, moved.state_changed_at, moved.card_forgotten_at, moved.texts_erased_at
    FROM moved
   ORDER BY substring(moved.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION edit_atlas_publications(text, timestamptz) FROM PUBLIC;

-- Withdraws publications, with the reason:
-- card_forgotten (decision 7): every row of the given cards loses its card digest, and each one not accepted is
--   withdrawn with its published fields erased and the owner's private reason gone; an accepted one stays;
-- card_set_aside: the given cards' rows that are published, held or reviewed into the Atlas are withdrawn;
-- card_replaced: the given cards' rows not reviewed yet (a later save of the same research thread replaced the card);
-- owner_unpublished: the given publications, by number, with the owner's private reason.
-- Returns the rows it changed.
CREATE OR REPLACE FUNCTION withdraw_atlas_publications(
  target_card_numbers integer[],
  target_publication_numbers text[],
  withdrawal_reason text,
  supplied_owner_reason text,
  withdraw_time timestamptz
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
  texts_erased_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF withdrawal_reason IS NULL
     OR withdrawal_reason NOT IN ('card_forgotten', 'card_set_aside', 'owner_unpublished', 'card_replaced')
     OR withdraw_time IS NULL
     OR (withdrawal_reason = 'owner_unpublished' AND (
       target_publication_numbers IS NULL OR target_card_numbers IS NOT NULL
       OR cardinality(target_publication_numbers) NOT BETWEEN 1 AND 100
       OR EXISTS (SELECT 1 FROM unnest(target_publication_numbers) requested(publication)
                   WHERE requested.publication IS NULL OR requested.publication !~ '^P-[1-9][0-9]{3,}$')
       OR supplied_owner_reason IS NULL OR supplied_owner_reason <> btrim(supplied_owner_reason)
       OR length(supplied_owner_reason) NOT BETWEEN 1 AND 2000))
     OR (withdrawal_reason <> 'owner_unpublished' AND (
       target_card_numbers IS NULL OR target_publication_numbers IS NOT NULL OR supplied_owner_reason IS NOT NULL
       OR cardinality(target_card_numbers) NOT BETWEEN 1 AND 1000
       OR EXISTS (SELECT 1 FROM unnest(target_card_numbers) requested(card)
                   WHERE requested.card IS NULL OR requested.card < 1)))
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;

  IF withdrawal_reason = 'card_forgotten' THEN
    RETURN QUERY
    WITH changed AS (
      UPDATE atlas_publications stored
         SET state = CASE WHEN stored.state = 'accepted' THEN 'accepted' ELSE 'withdrawn' END,
             withdrawn_because = CASE WHEN stored.state = 'accepted' THEN NULL ELSE 'card_forgotten' END,
             owner_reason = NULL,
             published_json = CASE WHEN stored.state = 'accepted' THEN stored.published_json ELSE NULL END,
             texts_erased_at = CASE WHEN stored.state = 'accepted' THEN stored.texts_erased_at
                                    ELSE coalesce(stored.texts_erased_at, greatest(withdraw_time, stored.published_at)) END,
             card_sha256 = NULL,
             card_forgotten_at = greatest(withdraw_time, stored.published_at),
             state_changed_at = CASE WHEN stored.state = 'accepted' THEN stored.state_changed_at
                                     ELSE greatest(withdraw_time, stored.state_changed_at) END
       WHERE stored.card_number = ANY(target_card_numbers)
         AND stored.card_forgotten_at IS NULL
      RETURNING stored.*
    )
    SELECT changed.publication_number, changed.card_number, changed.card_sha256, changed.finding_number,
           changed.published_json, changed.state, changed.atlas_number, changed.held_because,
           changed.withdrawn_because, changed.owner_reason, changed.published_at, changed.state_changed_at,
           changed.card_forgotten_at, changed.texts_erased_at
      FROM changed
     ORDER BY substring(changed.publication_number FROM 3)::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  WITH changed AS (
    UPDATE atlas_publications stored
       SET state = 'withdrawn',
           withdrawn_because = withdrawal_reason,
           owner_reason = supplied_owner_reason,
           state_changed_at = greatest(withdraw_time, stored.state_changed_at)
     WHERE stored.card_forgotten_at IS NULL
       AND CASE withdrawal_reason
             WHEN 'owner_unpublished' THEN stored.publication_number = ANY(target_publication_numbers)
               AND stored.state IN ('unreviewed', 'held', 'accepted', 'edited')
             WHEN 'card_set_aside' THEN stored.card_number = ANY(target_card_numbers)
               AND stored.state IN ('unreviewed', 'held', 'accepted', 'edited')
             ELSE stored.card_number = ANY(target_card_numbers)
               AND stored.state IN ('unreviewed', 'held')
           END
    RETURNING stored.*
  )
  SELECT changed.publication_number, changed.card_number, changed.card_sha256, changed.finding_number,
         changed.published_json, changed.state, changed.atlas_number, changed.held_because, changed.withdrawn_because,
         changed.owner_reason, changed.published_at, changed.state_changed_at, changed.card_forgotten_at,
         changed.texts_erased_at
    FROM changed
   ORDER BY substring(changed.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION withdraw_atlas_publications(integer[], text[], text, text, timestamptz) FROM PUBLIC;

-- Decision 7: erasing a finding's wording erases the published fields of every publication that names its F number.
-- Returns the rows it changed.
CREATE OR REPLACE FUNCTION erase_atlas_publication_texts(target_atlas_number text, erase_time timestamptz)
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
  texts_erased_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF target_atlas_number IS NULL OR target_atlas_number !~ '^F-[1-9][0-9]{3,}$' OR erase_time IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  RETURN QUERY
  WITH erased AS (
    UPDATE atlas_publications stored
       SET published_json = NULL,
           texts_erased_at = greatest(erase_time, stored.published_at)
     WHERE stored.atlas_number = target_atlas_number
       AND stored.texts_erased_at IS NULL
    RETURNING stored.*
  )
  SELECT erased.publication_number, erased.card_number, erased.card_sha256, erased.finding_number,
         erased.published_json, erased.state, erased.atlas_number, erased.held_because, erased.withdrawn_because,
         erased.owner_reason, erased.published_at, erased.state_changed_at, erased.card_forgotten_at,
         erased.texts_erased_at
    FROM erased
   ORDER BY substring(erased.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION erase_atlas_publication_texts(text, timestamptz) FROM PUBLIC;

REVOKE ALL ON SEQUENCE atlas_publication_number_seq FROM PUBLIC;
