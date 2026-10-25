SET search_path TO __SCHEMA__, public;

-- Held YouTube findings (owner answer 173, 2026-10-25). AskRigor reads public YouTube data with a server key, which
-- YouTube's Developer Policies call Non-Authorized Data; their section III.E.4 lets an API client keep a limited amount
-- for no longer than 30 calendar days, then delete or refresh it. A findings card is stored without its findings drawn
-- from YouTube comments (owner answer 170); each one left out is kept here instead, apart from the card, for the owner's
-- review, and deleted 30 days after it was saved, with no refreshing.
--
-- A row holds only what AskRigor wrote, each in a column of its own: the claim, the certainty, whom it applies to, why
-- the usual answer misses it, what would change it, the kind, subject and direction when the card declared them, and
-- its tags and verified bases (fixed values). No column holds a source (a YouTube video ID), a link, the answer quote,
-- a contributor or thread key, or any comment text, name, channel, comment or video ID. The card is named by its ARF
-- issue number and the checked card's SHA-256, the finding by its place on that card, from 1. A row is deleted 30 days
-- (720 hours, whatever the time zone) after the save that left it out; until the purge deletes it, no read returns it.
--
-- The research server reaches the table only through the four SECURITY DEFINER functions below, each revoked from
-- PUBLIC: the research-access role holds findings at a save and purges (provision-research-access-role.sh); the review
-- role holds the findings moved out of stored cards, reads, deletes a card's early, and purges
-- (provision-research-review-role.sh). Every other grant on the table is removed, the public reader's default-privilege
-- SELECT included, so nothing else reads it. Safe to run again: every migration runs on each start, in one transaction.

CREATE TABLE IF NOT EXISTS held_youtube_findings (
  card_number integer NOT NULL CHECK (card_number > 0),
  card_sha256 char(64) NOT NULL CHECK (card_sha256 ~ '^[a-f0-9]{64}$'),
  finding_number smallint NOT NULL CHECK (finding_number BETWEEN 1 AND 5),
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
  expires_at timestamptz NOT NULL,
  CONSTRAINT held_youtube_findings_pkey PRIMARY KEY (card_number, card_sha256, finding_number),
  CONSTRAINT held_youtube_findings_v1_expiry_check CHECK (expires_at = saved_at + interval '720 hours')
);

CREATE INDEX IF NOT EXISTS held_youtube_findings_expiry_idx ON held_youtube_findings (expires_at);

COMMENT ON TABLE held_youtube_findings IS
  'Findings drawn from YouTube comments that a saved findings card leaves out, held for the owner''s review and deleted 30 days after the save (YouTube Developer Policies III.E.4; owner answer 173). AskRigor''s texts and fixed values only: never a source, link, answer quote, contributor or thread key, or comment text, name, channel, comment or video ID. Reached only through hold_youtube_findings, inspect_held_youtube_findings, delete_held_youtube_findings and purge_expired_held_youtube_findings.';

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

-- The four functions (SECURITY DEFINER; the provisioning scripts grant exactly these) --------------------------------

-- Holds the findings one save left out of one card. A save time ahead of this database's clock counts from now, so no
-- row outlives 30 days by this clock; a finding whose 30 days have already ended is not held. A finding of the same
-- card, checked card and place held before keeps its own save time and expiry (no refreshing), unless it has expired,
-- when it is deleted and held anew. Returns each of the call's findings held after the call, with whether this call
-- held it.
CREATE OR REPLACE FUNCTION hold_youtube_findings(
  target_card_number integer,
  target_card_sha256 text,
  saved_time timestamptz,
  held_findings jsonb
)
RETURNS TABLE (
  card_number integer,
  card_sha256 text,
  finding_number smallint,
  saved_at timestamptz,
  expires_at timestamptz,
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
  IF target_card_number IS NULL OR target_card_number < 1
     OR target_card_sha256 IS NULL OR target_card_sha256 !~ '^[a-f0-9]{64}$'
     OR saved_time IS NULL
     OR held_findings IS NULL OR jsonb_typeof(held_findings) IS DISTINCT FROM 'array'
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

  stored_saved_at := LEAST(saved_time, now());
  DELETE FROM held_youtube_findings held
   WHERE held.card_number = target_card_number
     AND held.card_sha256 = target_card_sha256
     AND held.finding_number = ANY(requested_numbers)
     AND held.expires_at <= now();
  IF stored_saved_at + interval '720 hours' > now() THEN
    BEGIN
      WITH inserted AS (
        INSERT INTO held_youtube_findings AS held
          (card_number, card_sha256, finding_number, claim, certainty, applies_to, why_not_usual,
           what_would_change_it, kind, subject, direction, tags, verified_bases, saved_at, expires_at)
        SELECT target_card_number, target_card_sha256, (element.value ->> 'finding_number')::smallint,
               element.value ->> 'claim', element.value ->> 'certainty', element.value ->> 'applies_to',
               element.value ->> 'why_not_usual', element.value ->> 'what_would_change_it',
               element.value ->> 'kind', element.value ->> 'subject', element.value ->> 'direction',
               element.value -> 'tags', element.value -> 'verified_bases',
               stored_saved_at, stored_saved_at + interval '720 hours'
          FROM jsonb_array_elements(held_findings) AS element
        ON CONFLICT ON CONSTRAINT held_youtube_findings_pkey DO NOTHING
        RETURNING held.finding_number
      )
      SELECT coalesce(array_agg(inserted.finding_number), ARRAY[]::smallint[]) INTO inserted_numbers FROM inserted;
    EXCEPTION
      WHEN check_violation OR not_null_violation OR string_data_right_truncation THEN
        RAISE EXCEPTION 'HELD_YOUTUBE_FINDINGS_INPUT_INVALID';
    END;
  END IF;

  RETURN QUERY
  SELECT held.card_number, held.card_sha256::text, held.finding_number, held.saved_at, held.expires_at,
         held.finding_number = ANY(inserted_numbers)
    FROM held_youtube_findings held
   WHERE held.card_number = target_card_number
     AND held.card_sha256 = target_card_sha256
     AND held.finding_number = ANY(requested_numbers)
     AND held.expires_at > now()
   ORDER BY held.finding_number;
END
$function$;

REVOKE ALL ON FUNCTION hold_youtube_findings(integer, text, timestamptz, jsonb) FROM PUBLIC;

-- The held findings of the given cards whose 30 days have not ended by this database's clock, by card, then oldest
-- save first: what the owner's card view lists. A row past its expiry is never returned, purged yet or not.
CREATE OR REPLACE FUNCTION inspect_held_youtube_findings(target_card_numbers integer[])
RETURNS TABLE (
  card_number integer,
  card_sha256 text,
  finding_number smallint,
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
  saved_at timestamptz,
  expires_at timestamptz
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
  SELECT held.card_number, held.card_sha256::text, held.finding_number, held.claim, held.certainty, held.applies_to,
         held.why_not_usual, held.what_would_change_it, held.kind, held.subject, held.direction, held.tags,
         held.verified_bases, held.saved_at, held.expires_at
    FROM held_youtube_findings held
   WHERE held.card_number = ANY(target_card_numbers)
     AND held.expires_at > now()
   ORDER BY held.card_number, held.saved_at, held.card_sha256, held.finding_number;
END
$function$;

REVOKE ALL ON FUNCTION inspect_held_youtube_findings(integer[]) FROM PUBLIC;

-- Deletes every held finding of the given cards now, before their 30 days end: the owner's early deletion, and
-- forget_card's. Returns how many rows it deleted.
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

-- Deletes every held finding whose 30 days have ended by this database's clock: the research server runs it at start
-- and then every hour. It takes no time from the caller, so no caller can delete a finding before its 30 days end
-- through it. Returns how many rows it deleted.
CREATE OR REPLACE FUNCTION purge_expired_held_youtube_findings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog
AS $function$
DECLARE
  removed integer;
BEGIN
  DELETE FROM held_youtube_findings held WHERE held.expires_at <= now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$function$;

REVOKE ALL ON FUNCTION purge_expired_held_youtube_findings() FROM PUBLIC;
