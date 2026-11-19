SET search_path TO __SCHEMA__, public;

-- Atlas Release B (design of 19 Nov 2026, sections 4.6 and 4.7; the owner's 353b, 356a and wording; Fable's recheck):
-- a claim about a named person that no source AskRigor could open supports is shown with a mark, and comes off at once
-- when the person disputes it. Nothing here holds a publication back: the pages decide, from a reading bound to the
-- digest of everything they show for a publication, and the safe direction is more marking, never less showing.
--
-- - atlas_person_readings: one row per publication, its last reading (the digest it was read for, and one label per
--   sentence), and the failed attempts for its current digest; three park it (Fable 4.6a). The public runtime's
--   reader reads it.
-- - atlas_person_removals: each disputed sentence's state (taken off, shown as disputed, put back) by its key, with the
--   folded names the pages hide while a finding is unread. The reader reads it.
-- - atlas_person_removed_texts, atlas_person_disputes, atlas_person_reading_spend: private. The reader is refused them;
--   the review role reaches them only through the functions below. A dispute's text, source link and email address are
--   deleted after 90 days; its short record (date, sentence, outcome) stays (Fable 4.7). A taken-off sentence's words
--   are kept for three years so the claim cannot come back without a source.
-- Every row is keyed by a general subject (the Atlas news design v3, 3.8): a publication ("publication", P-1003) or,
-- from the news release on, a news item ("news", N-12), so news items take the same mark, dispute and withdrawal with no
-- change to these tables; atlas_person_subject_known is the one check a later migration extends for news items.
-- Every writer goes through these SECURITY DEFINER functions, granted to the review role
-- (provision-research-review-role.sh). Safe to run again: every migration runs on each start, in one transaction.

CREATE TABLE IF NOT EXISTS atlas_person_readings (
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')),
  digest text CHECK (digest IS NULL OR digest ~ '^[a-f0-9]{64}$'),
  sentences jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sentences) = 'array'),
  read_at timestamptz,
  model text CHECK (model IS NULL OR length(model) BETWEEN 1 AND 100),
  attempt_digest text CHECK (attempt_digest IS NULL OR attempt_digest ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1000),
  parked boolean NOT NULL DEFAULT false,
  -- The last failure's class only ("refusal:<category>", "unreadable", ...), kept for the main session; never text.
  last_failure text CHECK (last_failure IS NULL OR last_failure ~ '^[a-z_:]{1,80}$'),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (subject_kind, subject_id)
);

CREATE TABLE IF NOT EXISTS atlas_person_removals (
  removal_number bigserial PRIMARY KEY,
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')),
  sentence_key text NOT NULL CHECK (sentence_key ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('taken_off', 'disputed', 'restored')),
  folded_names text[] NOT NULL DEFAULT '{}',
  changed_at timestamptz NOT NULL,
  UNIQUE (subject_kind, subject_id, sentence_key)
);

CREATE TABLE IF NOT EXISTS atlas_person_removed_texts (
  removal_number bigint PRIMARY KEY REFERENCES atlas_person_removals (removal_number) ON DELETE CASCADE,
  sentence text NOT NULL CHECK (length(sentence) BETWEEN 1 AND 4000)
);

CREATE TABLE IF NOT EXISTS atlas_person_disputes (
  dispute_number bigserial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')),
  sentence_key text NOT NULL CHECK (sentence_key ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('wrong', 'missed')),
  outcome text NOT NULL CHECK (outcome IN ('taken_off', 'marked_disputed', 'queued', 'over_ceiling')),
  legal boolean NOT NULL,
  address_key text NOT NULL CHECK (address_key ~ '^[a-f0-9]{64}$'),
  folded_names text[] NOT NULL DEFAULT '{}',
  what_is_wrong text CHECK (what_is_wrong IS NULL OR length(what_is_wrong) BETWEEN 1 AND 4000),
  source_link text CHECK (source_link IS NULL OR length(source_link) BETWEEN 1 AND 600),
  email text CHECK (email IS NULL OR length(email) BETWEEN 3 AND 254),
  sentence text CHECK (sentence IS NULL OR length(sentence) <= 4000),
  received_at timestamptz NOT NULL,
  text_deleted_at timestamptz,
  hint_taken_at timestamptz,
  hint_leased_until timestamptz,
  resolved_at timestamptz,
  resolution text CHECK (resolution IS NULL OR length(resolution) <= 500)
);
CREATE INDEX IF NOT EXISTS atlas_person_disputes_received ON atlas_person_disputes (received_at);

CREATE TABLE IF NOT EXISTS atlas_person_reading_spend (
  day date PRIMARY KEY,
  reserved_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  spent_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
  calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  hints integer NOT NULL DEFAULT 0 CHECK (hints >= 0)
);

REVOKE ALL ON atlas_person_readings, atlas_person_removals, atlas_person_removed_texts, atlas_person_disputes,
  atlas_person_reading_spend FROM PUBLIC;
-- The public runtime's reader selects every table by default privilege (init-reader.sh); the private three are not its.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON atlas_person_removed_texts, atlas_person_disputes, atlas_person_reading_spend FROM askrigor_reader;
  END IF;
END
$grants$;

-- Whether a subject exists: a publication by its row; a news item only by its number's form until the news release's
-- migration replaces this function to read its own table.
CREATE OR REPLACE FUNCTION atlas_person_subject_known(p_kind text, p_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT CASE
    WHEN p_kind = 'publication' THEN p_id ~ '^P-[1-9][0-9]{3,}$'
      AND EXISTS (SELECT 1 FROM atlas_publications publication WHERE publication.publication_number = p_id)
    WHEN p_kind = 'news' THEN p_id ~ '^N-[1-9][0-9]*$'
    ELSE false
  END
$function$;
REVOKE ALL ON FUNCTION atlas_person_subject_known(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION save_atlas_person_reading(p_subject_kind text, p_subject_id text, p_digest text,
  p_sentences jsonb, p_model text, p_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR p_sentences IS NULL OR jsonb_typeof(p_sentences) <> 'array'
    OR p_model IS NULL OR p_at IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_INVALID';
  END IF;
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_UNKNOWN_SUBJECT';
  END IF;
  INSERT INTO atlas_person_readings AS stored (subject_kind, subject_id, digest, sentences, read_at, model,
    attempt_digest, attempts, parked, updated_at)
  VALUES (p_subject_kind, p_subject_id, p_digest, p_sentences, p_at, p_model, NULL, 0, false, p_at)
  ON CONFLICT (subject_kind, subject_id) DO UPDATE SET digest = EXCLUDED.digest, sentences = EXCLUDED.sentences,
    read_at = EXCLUDED.read_at, model = EXCLUDED.model, attempt_digest = NULL, attempts = 0, parked = false,
    updated_at = EXCLUDED.updated_at;
END
$function$;
REVOKE ALL ON FUNCTION save_atlas_person_reading(text, text, text, jsonb, text, timestamptz) FROM PUBLIC;

-- An attempt is counted before its call (Codex's review of B, P2): a crash or a restart mid-call still uses one.
CREATE OR REPLACE FUNCTION fail_atlas_person_reading(p_subject_kind text, p_subject_id text, p_digest text,
  p_reason text, p_at timestamptz, p_limit integer)
RETURNS TABLE (attempts integer, parked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR p_at IS NULL OR p_limit IS NULL OR p_limit < 1
    OR p_limit > 100 OR p_reason IS NULL OR p_reason !~ '^[a-z_:]{1,80}$' THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_INVALID';
  END IF;
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_UNKNOWN_SUBJECT';
  END IF;
  RETURN QUERY
  INSERT INTO atlas_person_readings AS stored (subject_kind, subject_id, attempt_digest, attempts, parked, last_failure,
    updated_at)
  VALUES (p_subject_kind, p_subject_id, p_digest, 1, 1 >= p_limit, p_reason, p_at)
  ON CONFLICT (subject_kind, subject_id) DO UPDATE SET
    attempts = CASE WHEN stored.attempt_digest = EXCLUDED.attempt_digest THEN stored.attempts + CASE WHEN EXCLUDED.last_failure = 'attempt' THEN 1 ELSE 0 END ELSE 1 END,
    parked = (CASE WHEN stored.attempt_digest = EXCLUDED.attempt_digest THEN stored.attempts + CASE WHEN EXCLUDED.last_failure = 'attempt' THEN 1 ELSE 0 END ELSE 1 END) >= p_limit,
    attempt_digest = EXCLUDED.attempt_digest,
    last_failure = EXCLUDED.last_failure,
    updated_at = EXCLUDED.updated_at
  RETURNING stored.attempts, stored.parked;
END
$function$;
REVOKE ALL ON FUNCTION fail_atlas_person_reading(text, text, text, text, timestamptz, integer) FROM PUBLIC;

-- The day's spend, reserved before each call and settled after it, across workers and restarts (design 5.2). A
-- reservation a crash leaves behind stays reserved until the day ends: the safe direction.
CREATE OR REPLACE FUNCTION reserve_atlas_person_spend(p_day date, p_amount numeric, p_cap numeric, p_hint boolean,
  p_hint_cap integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  reserved boolean;
BEGIN
  IF p_day IS NULL OR p_amount IS NULL OR p_amount < 0 OR p_cap IS NULL OR p_cap < 0 OR p_hint IS NULL
    OR p_hint_cap IS NULL OR p_hint_cap < 0 THEN
    RAISE EXCEPTION 'ATLAS_PERSON_SPEND_INVALID';
  END IF;
  INSERT INTO atlas_person_reading_spend (day) VALUES (p_day) ON CONFLICT (day) DO NOTHING;
  UPDATE atlas_person_reading_spend AS spend SET reserved_usd = spend.reserved_usd + p_amount, calls = spend.calls + 1,
    hints = spend.hints + CASE WHEN p_hint THEN 1 ELSE 0 END
   WHERE spend.day = p_day AND spend.spent_usd + spend.reserved_usd + p_amount <= p_cap
     AND (NOT p_hint OR spend.hints < p_hint_cap)
  RETURNING true INTO reserved;
  RETURN coalesce(reserved, false);
END
$function$;
REVOKE ALL ON FUNCTION reserve_atlas_person_spend(date, numeric, numeric, boolean, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION settle_atlas_person_spend(p_day date, p_reserved numeric, p_spent numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_day IS NULL OR p_reserved IS NULL OR p_reserved < 0 OR p_spent IS NULL OR p_spent < 0 THEN
    RAISE EXCEPTION 'ATLAS_PERSON_SPEND_INVALID';
  END IF;
  UPDATE atlas_person_reading_spend AS spend SET reserved_usd = greatest(spend.reserved_usd - p_reserved, 0),
    spent_usd = spend.spent_usd + p_spent
   WHERE spend.day = p_day;
END
$function$;
REVOKE ALL ON FUNCTION settle_atlas_person_spend(date, numeric, numeric) FROM PUBLIC;

-- A dispute (design 4.6, Fable 2.3, 4.3, 4.7). The caller says what the sentence's reading allows (taken off at once,
-- shown as disputed, or waiting for the main session); this decides, one dispute at a time, against the day's limits
-- per address, per sentence and per name, and the site-wide ceiling on automatic removals. The same form submitted
-- twice is one dispute.
CREATE OR REPLACE FUNCTION submit_atlas_person_dispute(p_key text, p_subject_kind text, p_subject_id text,
  p_sentence_key text, p_kind text, p_wanted text, p_legal boolean, p_address text, p_names text[], p_sentence text, p_what text, p_link text,
  p_email text, p_at timestamptz, p_ceiling integer, p_per_address integer, p_per_sentence integer, p_per_name integer,
  p_reading_digest text)
RETURNS TABLE (outcome text, dispute_number bigint, duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  prior record;
  chosen text;
  day_start timestamptz;
  day_end timestamptz;
  stored_number bigint;
  removal bigint;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{16,64}$' OR p_sentence_key IS NULL OR p_sentence_key !~ '^[a-f0-9]{64}$'
    OR p_kind IS NULL OR p_kind NOT IN ('wrong', 'missed') OR p_wanted IS NULL
    OR p_wanted NOT IN ('taken_off', 'marked_disputed', 'queued') OR p_legal IS NULL OR p_address IS NULL
    OR p_address !~ '^[a-f0-9]{64}$' OR p_names IS NULL OR cardinality(p_names) > 20 OR p_sentence IS NULL
    OR length(p_sentence) NOT BETWEEN 1 AND 4000 OR p_what IS NULL OR length(p_what) NOT BETWEEN 1 AND 4000
    OR (p_link IS NOT NULL AND length(p_link) NOT BETWEEN 1 AND 600)
    OR (p_email IS NOT NULL AND length(p_email) NOT BETWEEN 3 AND 254) OR p_at IS NULL OR p_ceiling IS NULL
    OR p_per_address IS NULL OR p_per_sentence IS NULL OR p_per_name IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PERSON_DISPUTE_INVALID';
  END IF;
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_DISPUTE_UNKNOWN_SUBJECT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atlas_person_disputes'));
  SELECT dispute.outcome AS outcome, dispute.dispute_number AS dispute_number INTO prior
    FROM atlas_person_disputes dispute WHERE dispute.idempotency_key = p_key;
  IF FOUND THEN
    RETURN QUERY SELECT prior.outcome::text, prior.dispute_number::bigint, true;
    RETURN;
  END IF;
  day_start := date_trunc('day', p_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  day_end := day_start + interval '1 day';
  IF (SELECT count(*) FROM atlas_person_disputes d WHERE d.address_key = p_address AND d.received_at >= day_start
      AND d.received_at < day_end) >= p_per_address
    OR (SELECT count(*) FROM atlas_person_disputes d WHERE d.subject_kind = p_subject_kind
      AND d.subject_id = p_subject_id AND d.sentence_key = p_sentence_key AND d.received_at >= day_start AND d.received_at < day_end) >= p_per_sentence
    OR EXISTS (SELECT 1 FROM unnest(p_names) AS named(name) WHERE (SELECT count(*) FROM atlas_person_disputes d
      WHERE named.name = ANY (d.folded_names) AND d.received_at >= day_start AND d.received_at < day_end) >= p_per_name)
  THEN
    RETURN QUERY SELECT 'limited'::text, NULL::bigint, false;
    RETURN;
  END IF;
  chosen := p_wanted;
  IF chosen = 'taken_off' AND (SELECT count(*) FROM atlas_person_disputes d WHERE d.outcome = 'taken_off'
      AND d.received_at >= day_start AND d.received_at < day_end) >= p_ceiling THEN
    chosen := 'over_ceiling';
  END IF;
  -- Codex's review of B (P1): an automatic removal stands only on the reading the form was judged by; if the subject
  -- has been read again since (a source may have turned up), the dispute waits for the main session instead.
  IF chosen = 'taken_off' AND NOT EXISTS (SELECT 1 FROM atlas_person_readings reading
      WHERE reading.subject_kind = p_subject_kind AND reading.subject_id = p_subject_id
        AND reading.digest = p_reading_digest) THEN
    chosen := 'queued';
  END IF;
  IF chosen = 'taken_off' THEN
    INSERT INTO atlas_person_removals AS stored (subject_kind, subject_id, sentence_key, state, folded_names, changed_at)
    VALUES (p_subject_kind, p_subject_id, p_sentence_key, 'taken_off', p_names, p_at)
    ON CONFLICT (subject_kind, subject_id, sentence_key) DO UPDATE SET state = 'taken_off', changed_at = EXCLUDED.changed_at,
      folded_names = ARRAY(SELECT DISTINCT merged.name FROM unnest(stored.folded_names || EXCLUDED.folded_names)
        AS merged(name) ORDER BY merged.name)
    RETURNING stored.removal_number INTO removal;
    INSERT INTO atlas_person_removed_texts (removal_number, sentence) VALUES (removal, p_sentence)
    ON CONFLICT (removal_number) DO UPDATE SET sentence = EXCLUDED.sentence;
  ELSIF chosen = 'marked_disputed' THEN
    INSERT INTO atlas_person_removals AS stored (subject_kind, subject_id, sentence_key, state, folded_names, changed_at)
    VALUES (p_subject_kind, p_subject_id, p_sentence_key, 'disputed', p_names, p_at)
    ON CONFLICT (subject_kind, subject_id, sentence_key) DO UPDATE SET
      state = CASE WHEN stored.state = 'taken_off' THEN 'taken_off' ELSE 'disputed' END,
      changed_at = EXCLUDED.changed_at;
  END IF;
  INSERT INTO atlas_person_disputes AS stored (idempotency_key, subject_kind, subject_id, sentence_key, kind, outcome,
    legal, address_key, folded_names, what_is_wrong, source_link, email, sentence, received_at)
  VALUES (p_key, p_subject_kind, p_subject_id, p_sentence_key, p_kind, chosen, p_legal, p_address, p_names, p_what, p_link, p_email,
    p_sentence, p_at)
  RETURNING stored.dispute_number INTO stored_number;
  RETURN QUERY SELECT chosen, stored_number, false;
END
$function$;
REVOKE ALL ON FUNCTION submit_atlas_person_dispute(text, text, text, text, text, text, boolean, text, text[], text, text,
  text, text, timestamptz, integer, integer, integer, integer, text) FROM PUBLIC;

-- The main session's or the owner's decision on a sentence: take it off, or put it back (which also clears a dispute
-- mark). Every state can be reversed (design 4.6).
CREATE OR REPLACE FUNCTION decide_atlas_person_claim(p_subject_kind text, p_subject_id text, p_sentence_key text,
  p_action text, p_sentence text, p_names text[], p_dispute bigint, p_resolution text, p_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  removal bigint;
BEGIN
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) OR p_sentence_key IS NULL
    OR p_sentence_key !~ '^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN ('take_off', 'restore', 'clear_dispute')
    OR p_names IS NULL OR p_resolution IS NULL OR length(p_resolution) > 500 OR p_at IS NULL
    OR (p_action = 'take_off' AND (p_sentence IS NULL OR length(p_sentence) NOT BETWEEN 1 AND 4000)) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_DECISION_INVALID';
  END IF;
  IF p_action = 'take_off' THEN
    INSERT INTO atlas_person_removals AS stored (subject_kind, subject_id, sentence_key, state, folded_names, changed_at)
    VALUES (p_subject_kind, p_subject_id, p_sentence_key, 'taken_off', p_names, p_at)
    ON CONFLICT (subject_kind, subject_id, sentence_key) DO UPDATE SET state = 'taken_off', changed_at = EXCLUDED.changed_at,
      folded_names = ARRAY(SELECT DISTINCT merged.name FROM unnest(stored.folded_names || EXCLUDED.folded_names)
        AS merged(name) ORDER BY merged.name)
    RETURNING stored.removal_number INTO removal;
    INSERT INTO atlas_person_removed_texts (removal_number, sentence) VALUES (removal, p_sentence)
    ON CONFLICT (removal_number) DO UPDATE SET sentence = EXCLUDED.sentence;
  ELSE
    UPDATE atlas_person_removals AS stored SET state = 'restored', changed_at = p_at
     WHERE stored.subject_kind = p_subject_kind AND stored.subject_id = p_subject_id
       AND stored.sentence_key = p_sentence_key;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
  END IF;
  IF p_dispute IS NOT NULL THEN
    UPDATE atlas_person_disputes AS dispute SET resolved_at = p_at, resolution = p_resolution
     WHERE dispute.dispute_number = p_dispute;
  END IF;
  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION decide_atlas_person_claim(text, text, text, text, text, text[], bigint, text, timestamptz)
  FROM PUBLIC;

-- The main session's list: legal letters and data requests first, then what waits for a person's reading.
CREATE OR REPLACE FUNCTION list_atlas_person_queue(p_limit integer)
RETURNS TABLE (dispute_number bigint, subject_kind text, subject_id text, sentence_key text, kind text, outcome text,
  legal boolean, received_at timestamptz, what_is_wrong text, source_link text, email text, sentence text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  RETURN QUERY SELECT d.dispute_number, d.subject_kind, d.subject_id, d.sentence_key, d.kind, d.outcome, d.legal, d.received_at,
      d.what_is_wrong, d.source_link, d.email, d.sentence
    FROM atlas_person_disputes d
   -- Every open dispute, legal mail first (Codex's review of B: legal requests in any language reach a person).
   WHERE d.resolved_at IS NULL
   ORDER BY d.legal DESC, d.dispute_number
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 500);
END
$function$;
REVOKE ALL ON FUNCTION list_atlas_person_queue(integer) FROM PUBLIC;

-- Missed-claim reports and disputes on sentences not yet read, each handed to the reading once (Fable 4.6c: by sentence
-- key only, never the reporter's words).
CREATE OR REPLACE FUNCTION take_atlas_person_hints(p_kind text, p_limit integer, p_at timestamptz)
RETURNS TABLE (dispute_number bigint, subject_kind text, subject_id text, sentence_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_at IS NULL OR p_kind IS NULL OR p_kind NOT IN ('publication', 'news') THEN
    RAISE EXCEPTION 'ATLAS_PERSON_HINTS_INVALID';
  END IF;
  -- Leased for 15 minutes, not consumed: a hint is acknowledged only once its reading ran (Codex's review of B).
  RETURN QUERY UPDATE atlas_person_disputes AS d SET hint_leased_until = p_at + interval '15 minutes'
   WHERE d.dispute_number IN (SELECT waiting.dispute_number FROM atlas_person_disputes waiting
     WHERE waiting.hint_taken_at IS NULL AND waiting.kind = 'missed' AND waiting.subject_kind = p_kind
       AND (waiting.hint_leased_until IS NULL OR waiting.hint_leased_until < p_at)
     ORDER BY waiting.dispute_number LIMIT least(greatest(coalesce(p_limit, 10), 1), 100) FOR UPDATE SKIP LOCKED)
  RETURNING d.dispute_number, d.subject_kind, d.subject_id, d.sentence_key;
END
$function$;
REVOKE ALL ON FUNCTION take_atlas_person_hints(text, integer, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ack_atlas_person_hint(p_dispute bigint, p_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_dispute IS NULL OR p_at IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PERSON_HINTS_INVALID';
  END IF;
  UPDATE atlas_person_disputes AS d SET hint_taken_at = p_at WHERE d.dispute_number = p_dispute;
END
$function$;
REVOKE ALL ON FUNCTION ack_atlas_person_hint(bigint, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION atlas_person_removed_texts_for(p_names text[])
RETURNS TABLE (removal_number bigint, sentence text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  RETURN QUERY SELECT removal.removal_number, kept.sentence
    FROM atlas_person_removals removal
    JOIN atlas_person_removed_texts kept ON kept.removal_number = removal.removal_number
   WHERE removal.state = 'taken_off' AND removal.folded_names && coalesce(p_names, '{}'::text[])
   ORDER BY removal.removal_number
   LIMIT 50;
END
$function$;
REVOKE ALL ON FUNCTION atlas_person_removed_texts_for(text[]) FROM PUBLIC;

-- Dispute texts, source links and email addresses after 90 days (the caller's cutoff); a taken-off sentence's words
-- and folded names after three years. The short record of each dispute stays.
CREATE OR REPLACE FUNCTION purge_atlas_person_disputes(p_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  purged integer;
BEGIN
  IF p_before IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PERSON_PURGE_INVALID';
  END IF;
  UPDATE atlas_person_disputes AS d SET what_is_wrong = NULL, source_link = NULL, email = NULL,
    text_deleted_at = p_before + interval '90 days'
   WHERE d.received_at < p_before AND d.text_deleted_at IS NULL;
  GET DIAGNOSTICS purged = ROW_COUNT;
  DELETE FROM atlas_person_removed_texts AS kept USING atlas_person_removals AS removal
   WHERE kept.removal_number = removal.removal_number AND removal.changed_at < p_before - interval '1005 days';
  UPDATE atlas_person_removals AS removal SET folded_names = '{}'
   WHERE removal.changed_at < p_before - interval '1005 days' AND cardinality(removal.folded_names) > 0;
  RETURN purged;
END
$function$;
REVOKE ALL ON FUNCTION purge_atlas_person_disputes(timestamptz) FROM PUBLIC;
