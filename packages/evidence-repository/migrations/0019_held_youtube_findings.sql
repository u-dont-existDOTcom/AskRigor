SET search_path TO __SCHEMA__, public;

-- Held YouTube findings (owner answer 173, 2026-10-25). A findings card is stored without its findings drawn from
-- YouTube comments (owner answer 170); each one left out is kept here instead, apart from the card, for the owner's
-- review. A card whose findings all rest on YouTube comments is not saved as a card; its findings are kept here the
-- same way, with no card number. The owner's rule, 25 Oct: "don't delete the summaries unless YT tells us to do that".
-- So a row stays until it is deleted: on request, by the owner (a card's, or a save's with no card), when its card is
-- forgotten, or with every other row at once if YouTube asks AskRigor to delete them. Nothing deletes a row by its age.
--
-- A row holds only what AskRigor wrote, each in a column of its own: the claim, the certainty, whom it applies to, why
-- the usual answer misses it, what would change it, the kind, subject and direction when the card declared them, and
-- its tags and verified bases (fixed values); and, for a card not saved as a card, the card's own general wording of
-- the research question and its topic's key and label. No column holds a source (a YouTube video ID), a link, the
-- answer quote, a contributor or thread key, or any comment text, name, channel, comment or video ID. A saved card's
-- finding is named by the card's ARF issue number, the checked card's SHA-256 and its place on that card, from 1; one of
-- a card not saved by the SHA-256 and its place.
--
-- The research server reaches the table only through the six SECURITY DEFINER functions below, each revoked from
-- PUBLIC: the research-access role holds findings at a save (provision-research-access-role.sh); the review role holds
-- the findings moved out of stored cards, reads, deletes a card's or a save's, and deletes every row at once
-- (provision-research-review-role.sh). Every other grant on the table is removed, the public reader's default-privilege
-- SELECT included, so nothing else reads it. Safe to run again: every migration runs on each start, in one transaction.

CREATE TABLE IF NOT EXISTS held_youtube_findings (
  card_number integer CHECK (card_number IS NULL OR card_number > 0),
  card_sha256 char(64) NOT NULL CHECK (card_sha256 ~ '^[a-f0-9]{64}$'),
  finding_number smallint NOT NULL CHECK (finding_number BETWEEN 1 AND 5),
  question text CHECK (question IS NULL OR length(question) BETWEEN 1 AND 300),
  topic_key text CHECK (topic_key IS NULL OR topic_key ~ '^[a-z0-9][a-z0-9._-]{0,199}$'),
  topic_label text CHECK (topic_label IS NULL OR length(topic_label) BETWEEN 1 AND 200),
  claim text NOT NULL CHECK (length(claim) BETWEEN 1 AND 500),
  certainty text NOT NULL CHECK (certainty IN ('high', 'moderate', 'low', 'very_low')),
  applies_to text NOT NULL CHECK (length(applies_to) BETWEEN 1 AND 300),
  why_not_usual text NOT NULL CHECK (length(why_not_usual) BETWEEN 1 AND 300),
  what_would_change_it text NOT NULL CHECK (length(what_would_change_it) BETWEEN 1 AND 300),
  kind text CHECK (
    kind IS NULL OR kind IN ('effect', 'harm', 'overlooked_option', 'correction', 'nothing_found', 'tested_vs_sold')
  ),
  subject text CHECK (subject IS NULL OR length(subject) BETWEEN 1 AND 120),
  direction text CHECK (direction IS NULL OR direction IN ('benefit', 'harm', 'no_effect', 'mixed', 'descriptive')),
  tags jsonb NOT NULL CHECK (
    jsonb_typeof(tags) = 'array'
    AND tags <@ '["full_text_read", "community_checked", "contradicts_common_answer", "overlooked_study", "documented_absence"]'::jsonb
  ),
  verified_bases jsonb NOT NULL CHECK (
    jsonb_typeof(verified_bases) = 'array'
    AND verified_bases <@ '["full_text_audit", "comment_audit", "bounded_absence", "research_correction"]'::jsonb
  ),
  saved_at timestamptz NOT NULL,
  -- A saved card names its findings; a card not saved as a card brings its question, and its topic or none.
  CONSTRAINT held_youtube_findings_v1_card_check CHECK (
    (card_number IS NOT NULL AND question IS NULL AND topic_key IS NULL AND topic_label IS NULL)
    OR (card_number IS NULL AND question IS NOT NULL AND (topic_key IS NULL) = (topic_label IS NULL))
  )
);

-- One row per finding of one save: of a card, by its number, the checked card's SHA-256 and the place; of no card, by
-- the SHA-256 and the place (no card has number 0).
CREATE UNIQUE INDEX IF NOT EXISTS held_youtube_findings_key
  ON held_youtube_findings ((coalesce(card_number, 0)), card_sha256, finding_number);

-- The owner's list of the saves with no card, newest first, a page at a time.
CREATE INDEX IF NOT EXISTS held_youtube_findings_without_card_idx
  ON held_youtube_findings (saved_at DESC, card_sha256) WHERE card_number IS NULL;

COMMENT ON TABLE held_youtube_findings IS
  'Findings drawn from YouTube comments that a saved findings card leaves out, or of a card whose findings all rest on them and which is not saved as a card, kept for the owner''s review until deleted: on request, when the card is forgotten, or if YouTube asks (owner answer 173). AskRigor''s texts and fixed values only, with the question and topic of a card not saved: never a source, link, answer quote, contributor or thread key, or comment text, name, channel, comment or video ID. Reached only through hold_youtube_findings, inspect_held_youtube_findings, inspect_cardless_held_youtube_findings, delete_held_youtube_findings, delete_cardless_held_youtube_findings and delete_all_held_youtube_findings.';

REVOKE ALL ON TABLE held_youtube_findings FROM PUBLIC;

-- Default privileges can grant other roles access to every table the migrator creates (the public reader gets SELECT
-- that way). Remove every grant on the table except its owner's own, on every run.
DO $revoke$
DECLARE
  grantee_role text;
BEGIN
  FOR grantee_role IN
    SELECT DISTINCT acl.grantee::regrole::text
      FROM pg_class AS class, aclexplode(class.relacl) AS acl
     WHERE class.oid = 'held_youtube_findings'::regclass
       AND acl.grantee <> 0
       AND acl.grantee <> class.relowner
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE held_youtube_findings FROM %s', grantee_role);
  END LOOP;
END
$revoke$;

-- The six functions (SECURITY DEFINER; the provisioning scripts grant exactly these) ---------------------------------

-- Holds the findings one save left out of one card: under the saved card's number, or, for a card not saved as a card,
-- with no number and the card's question and its topic (both its key and label, or neither). The save time is kept to
-- the millisecond, so a page of the list names a save exactly, and one ahead of this database's clock counts from now.
-- A finding of the same card (or of no card), checked card and place held before keeps its own save time: holding it
-- again changes nothing. Returns each of the call's findings held after the call, with whether this call held it.
CREATE OR REPLACE FUNCTION hold_youtube_findings(
  target_card_number integer,
  target_card_sha256 text,
  saved_time timestamptz,
  held_findings jsonb,
  card_question text,
  card_topic_key text,
  card_topic_label text
)
RETURNS TABLE (
  card_number integer,
  card_sha256 text,
  finding_number smallint,
  saved_at timestamptz,
  held_now boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
#variable_conflict use_column
DECLARE
  supplied jsonb;
  requested_numbers smallint[] := ARRAY[]::smallint[];
  inserted_numbers smallint[] := ARRAY[]::smallint[];
  stored_saved_at timestamptz;
BEGIN
  IF (target_card_number IS NOT NULL AND target_card_number < 1)
     OR target_card_sha256 IS NULL OR target_card_sha256 !~ '^[a-f0-9]{64}$'
     OR saved_time IS NULL
     OR held_findings IS NULL OR jsonb_typeof(held_findings) IS DISTINCT FROM 'array'
     OR (target_card_number IS NOT NULL
         AND (card_question IS NOT NULL OR card_topic_key IS NOT NULL OR card_topic_label IS NOT NULL))
     OR (target_card_number IS NULL AND card_question IS NULL)
     OR ((card_topic_key IS NULL) <> (card_topic_label IS NULL))
  THEN
    RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
  END IF;
  IF jsonb_array_length(held_findings) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
  END IF;
  -- Each finding holds exactly the columns' keys, each of its type; the columns' checks then test the values.
  FOR supplied IN SELECT element.value FROM jsonb_array_elements(held_findings) AS element LOOP
    IF jsonb_typeof(supplied) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
    END IF;
    IF EXISTS (
         SELECT 1 FROM jsonb_object_keys(supplied) AS supplied_key(name)
          WHERE supplied_key.name NOT IN ('finding_number', 'claim', 'certainty', 'applies_to', 'why_not_usual',
                                          'what_would_change_it', 'kind', 'subject', 'direction', 'tags',
                                          'verified_bases')
       )
       OR jsonb_typeof(supplied -> 'finding_number') IS DISTINCT FROM 'number'
       OR jsonb_typeof(supplied -> 'claim') IS DISTINCT FROM 'string'
       OR jsonb_typeof(supplied -> 'certainty') IS DISTINCT FROM 'string'
       OR jsonb_typeof(supplied -> 'applies_to') IS DISTINCT FROM 'string'
       OR jsonb_typeof(supplied -> 'why_not_usual') IS DISTINCT FROM 'string'
       OR jsonb_typeof(supplied -> 'what_would_change_it') IS DISTINCT FROM 'string'
       OR (supplied ? 'kind' AND jsonb_typeof(supplied -> 'kind') IS DISTINCT FROM 'string')
       OR (supplied ? 'subject' AND jsonb_typeof(supplied -> 'subject') IS DISTINCT FROM 'string')
       OR (supplied ? 'direction' AND jsonb_typeof(supplied -> 'direction') IS DISTINCT FROM 'string')
       OR jsonb_typeof(supplied -> 'tags') IS DISTINCT FROM 'array'
       OR jsonb_typeof(supplied -> 'verified_bases') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
    END IF;
    IF (supplied ->> 'finding_number') !~ '^[1-5]$' THEN
      RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
    END IF;
    IF (supplied ->> 'finding_number')::smallint = ANY(requested_numbers)
       OR jsonb_array_length(supplied -> 'tags') <> (
         SELECT count(DISTINCT listed.value) FROM jsonb_array_elements(supplied -> 'tags') AS listed
       )
       OR jsonb_array_length(supplied -> 'verified_bases') <> (
         SELECT count(DISTINCT listed.value) FROM jsonb_array_elements(supplied -> 'verified_bases') AS listed
       )
    THEN
      RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
    END IF;
    requested_numbers := requested_numbers || (supplied ->> 'finding_number')::smallint;
  END LOOP;

  stored_saved_at := date_trunc('milliseconds', LEAST(saved_time, now()));
  BEGIN
    WITH inserted AS (
      INSERT INTO held_youtube_findings AS held
        (card_number, card_sha256, finding_number, question, topic_key, topic_label, claim, certainty, applies_to,
         why_not_usual, what_would_change_it, kind, subject, direction, tags, verified_bases, saved_at)
      SELECT target_card_number, target_card_sha256, (element.value ->> 'finding_number')::smallint,
             card_question, card_topic_key, card_topic_label,
             element.value ->> 'claim', element.value ->> 'certainty', element.value ->> 'applies_to',
             element.value ->> 'why_not_usual', element.value ->> 'what_would_change_it',
             element.value ->> 'kind', element.value ->> 'subject', element.value ->> 'direction',
             element.value -> 'tags', element.value -> 'verified_bases',
             stored_saved_at
        FROM jsonb_array_elements(held_findings) AS element
      ON CONFLICT DO NOTHING
      RETURNING held.finding_number
    )
    SELECT coalesce(array_agg(inserted.finding_number), ARRAY[]::smallint[]) INTO inserted_numbers FROM inserted;
  EXCEPTION
    WHEN check_violation OR not_null_violation OR string_data_right_truncation THEN
      RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
  END;

  RETURN QUERY
  SELECT held.card_number, held.card_sha256::text, held.finding_number, held.saved_at,
         held.finding_number = ANY(inserted_numbers)
    FROM held_youtube_findings held
   WHERE held.card_number IS NOT DISTINCT FROM target_card_number
     AND held.card_sha256::text = target_card_sha256
     AND held.finding_number = ANY(requested_numbers)
   ORDER BY held.finding_number;
END
$function$;

REVOKE ALL ON FUNCTION hold_youtube_findings(integer, text, timestamptz, jsonb, text, text, text) FROM PUBLIC;

-- Every held finding of the given saved cards, by card, then oldest save first: what the owner's card view lists.
CREATE OR REPLACE FUNCTION inspect_held_youtube_findings(target_card_numbers integer[])
RETURNS TABLE (
  card_number integer,
  card_sha256 text,
  finding_number smallint,
  question text,
  topic_key text,
  topic_label text,
  claim text,
  certainty text,
  applies_to text,
  why_not_usual text,
  what_would_change_it text,
  kind text,
  subject text,
  direction text,
  tags jsonb,
  verified_bases jsonb,
  saved_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
#variable_conflict use_column
BEGIN
  IF target_card_numbers IS NULL
     OR cardinality(target_card_numbers) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(target_card_numbers) requested(card) WHERE requested.card IS NULL
                OR requested.card < 1)
  THEN
    RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT held.card_number, held.card_sha256::text, held.finding_number, held.question, held.topic_key,
         held.topic_label, held.claim, held.certainty, held.applies_to, held.why_not_usual, held.what_would_change_it,
         held.kind, held.subject, held.direction, held.tags, held.verified_bases, held.saved_at
    FROM held_youtube_findings held
   WHERE held.card_number = ANY(target_card_numbers)
   ORDER BY held.card_number, held.saved_at, held.card_sha256, held.finding_number;
END
$function$;

REVOKE ALL ON FUNCTION inspect_held_youtube_findings(integer[]) FROM PUBLIC;

-- The held findings of cards not saved as cards, a page at a time: what the owner's list of held findings with no card
-- shows. A page is every held finding of the next save_limit saves (from 1 to 100) in the order newest first, by save
-- time and then the checked card's SHA-256: from the newest save when no save is named, or else after the named one.
-- Paging on returns every held row.
CREATE OR REPLACE FUNCTION inspect_cardless_held_youtube_findings(
  after_saved_at timestamptz,
  after_card_sha256 text,
  save_limit integer
)
RETURNS TABLE (
  card_number integer,
  card_sha256 text,
  finding_number smallint,
  question text,
  topic_key text,
  topic_label text,
  claim text,
  certainty text,
  applies_to text,
  why_not_usual text,
  what_would_change_it text,
  kind text,
  subject text,
  direction text,
  tags jsonb,
  verified_bases jsonb,
  saved_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
#variable_conflict use_column
BEGIN
  IF save_limit IS NULL OR save_limit NOT BETWEEN 1 AND 100
     OR (after_saved_at IS NULL) <> (after_card_sha256 IS NULL)
     OR (after_card_sha256 IS NOT NULL AND after_card_sha256 !~ '^[a-f0-9]{64}$')
  THEN
    RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
  END IF;
  RETURN QUERY
  WITH page AS (
    SELECT DISTINCT held.saved_at AS saved, held.card_sha256::text AS digest
      FROM held_youtube_findings held
     WHERE held.card_number IS NULL
       AND (after_saved_at IS NULL
            OR held.saved_at < after_saved_at
            OR (held.saved_at = after_saved_at AND held.card_sha256::text > after_card_sha256))
     ORDER BY saved DESC, digest
     LIMIT save_limit
  )
  SELECT held.card_number, held.card_sha256::text, held.finding_number, held.question, held.topic_key,
         held.topic_label, held.claim, held.certainty, held.applies_to, held.why_not_usual, held.what_would_change_it,
         held.kind, held.subject, held.direction, held.tags, held.verified_bases, held.saved_at
    FROM held_youtube_findings held
    JOIN page ON page.saved = held.saved_at AND page.digest = held.card_sha256::text
   WHERE held.card_number IS NULL
   ORDER BY held.saved_at DESC, held.card_sha256::text, held.finding_number;
END
$function$;

REVOKE ALL ON FUNCTION inspect_cardless_held_youtube_findings(timestamptz, text, integer) FROM PUBLIC;

-- Deletes every held finding of the given saved cards: the owner's deletion, and forget_card's. Returns how many rows
-- it deleted.
CREATE OR REPLACE FUNCTION delete_held_youtube_findings(target_card_numbers integer[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  removed integer;
BEGIN
  IF target_card_numbers IS NULL
     OR cardinality(target_card_numbers) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(target_card_numbers) requested(card) WHERE requested.card IS NULL
                OR requested.card < 1)
  THEN
    RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
  END IF;
  DELETE FROM held_youtube_findings held WHERE held.card_number = ANY(target_card_numbers);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$function$;

REVOKE ALL ON FUNCTION delete_held_youtube_findings(integer[]) FROM PUBLIC;

-- Deletes every held finding of the given cards not saved as cards, by their checked cards' SHA-256: the owner's
-- deletion. A saved card's findings are never deleted through it. Returns how many rows it deleted.
CREATE OR REPLACE FUNCTION delete_cardless_held_youtube_findings(target_card_sha256s text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  removed integer;
BEGIN
  IF target_card_sha256s IS NULL
     OR cardinality(target_card_sha256s) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(target_card_sha256s) requested(digest) WHERE requested.digest IS NULL
                OR requested.digest !~ '^[a-f0-9]{64}$')
  THEN
    RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
  END IF;
  DELETE FROM held_youtube_findings held
   WHERE held.card_number IS NULL
     AND held.card_sha256::text = ANY(target_card_sha256s);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$function$;

REVOKE ALL ON FUNCTION delete_cardless_held_youtube_findings(text[]) FROM PUBLIC;

-- Deletes every held finding at once, of every saved card and every card not saved as a card: for the day YouTube asks
-- AskRigor to delete them. Only the review role holds it, and the owner's review tool calls it only when the call
-- confirms it explicitly. Returns how many rows it deleted.
CREATE OR REPLACE FUNCTION delete_all_held_youtube_findings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  removed integer;
BEGIN
  DELETE FROM held_youtube_findings held WHERE true;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$function$;

REVOKE ALL ON FUNCTION delete_all_held_youtube_findings() FROM PUBLIC;
