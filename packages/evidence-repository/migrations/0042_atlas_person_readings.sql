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
-- Every row is keyed by a general subject (the Atlas news design v3, 3.8): a publication ("publication", P-1003), one
-- of the owner's curated scorecard rows ("glance", G-1001: read like a finding, never disputed by form) or, from the
-- news release on, a news item ("news", N-12), so news items take the same mark, dispute and withdrawal with no change
-- to these tables; atlas_person_subject_known is the one check a later migration extends for news items.
-- - atlas_person_changes: the public history of each sentence's dispute state (no words, no names); the reader reads
--   it for the changes page.
-- - atlas_person_owner_notices: private. What the owner must hear of (a legal letter or data request, a refusal, a
--   parked finding, a claim changed on a finding he checked), sent to his channel until delivered and again each day
--   until he acknowledges it.
-- Every writer goes through these SECURITY DEFINER functions, granted to the review role
-- (provision-research-review-role.sh). Safe to run again: every migration runs on each start, in one transaction.

CREATE TABLE IF NOT EXISTS atlas_person_readings (
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news', 'glance')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')
    OR (subject_kind = 'glance' AND subject_id ~ '^G-[1-9][0-9]{3,}$')),
  digest text CHECK (digest IS NULL OR digest ~ '^[a-f0-9]{64}$'),
  sentences jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sentences) = 'array'),
  read_at timestamptz,
  model text CHECK (model IS NULL OR length(model) BETWEEN 1 AND 100),
  attempt_digest text CHECK (attempt_digest IS NULL OR attempt_digest ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1000),
  parked boolean NOT NULL DEFAULT false,
  -- One process at a time reads a digest: its claim, until the call ends or this time passes.
  claimed_until timestamptz,
  -- The last failure's class only ("refusal:<category>", "unreadable", ...), kept for the main session; never text.
  last_failure text CHECK (last_failure IS NULL OR last_failure ~ '^[a-z_:]{1,80}$'),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (subject_kind, subject_id)
);

CREATE TABLE IF NOT EXISTS atlas_person_removals (
  removal_number bigserial PRIMARY KEY,
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news', 'glance')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')
    OR (subject_kind = 'glance' AND subject_id ~ '^G-[1-9][0-9]{3,}$')),
  sentence_key text NOT NULL CHECK (sentence_key ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('taken_off', 'disputed', 'restored')),
  folded_names text[] NOT NULL DEFAULT '{}',
  -- The context of the finding it was taken off (its topic and its sources' identifiers): a finding sharing any of it
  -- is read again with this removal's words, so a paraphrase under another name or a role can be judged a repeat.
  context_keys text[] NOT NULL DEFAULT '{}' CHECK (cardinality(context_keys) <= 40),
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
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news', 'glance')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')
    OR (subject_kind = 'glance' AND subject_id ~ '^G-[1-9][0-9]{3,}$')),
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
  resolution text CHECK (resolution IS NULL OR length(resolution) <= 500),
  -- An automatic removal is checked again against the finding it was judged on (Codex's third review of B): the digest
  -- of that finding's texts and evidence, and when the check ran. Until then it is listed for the check.
  judged_digest text CHECK (judged_digest IS NULL OR judged_digest ~ '^[a-f0-9]{64}$'),
  checked_at timestamptz
);
CREATE INDEX IF NOT EXISTS atlas_person_disputes_received ON atlas_person_disputes (received_at);

CREATE TABLE IF NOT EXISTS atlas_person_reading_spend (
  day date PRIMARY KEY,
  reserved_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  spent_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
  calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  hints integer NOT NULL DEFAULT 0 CHECK (hints >= 0)
);

CREATE TABLE IF NOT EXISTS atlas_person_changes (
  change_number bigserial PRIMARY KEY,
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news', 'glance')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')
    OR (subject_kind = 'glance' AND subject_id ~ '^G-[1-9][0-9]{3,}$')),
  state text NOT NULL CHECK (state IN ('taken_off', 'disputed', 'restored')),
  changed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS atlas_person_changes_changed ON atlas_person_changes (changed_at);

CREATE TABLE IF NOT EXISTS atlas_person_owner_notices (
  notice_number bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('legal', 'dispute', 'refusal', 'parked', 'recheck')),
  subject_kind text NOT NULL CHECK (subject_kind IN ('publication', 'news', 'glance')),
  subject_id text NOT NULL,
  CHECK ((subject_kind = 'publication' AND subject_id ~ '^P-[1-9][0-9]{3,}$')
    OR (subject_kind = 'news' AND subject_id ~ '^N-[1-9][0-9]*$')
    OR (subject_kind = 'glance' AND subject_id ~ '^G-[1-9][0-9]{3,}$')),
  dispute_number bigint,
  detail text CHECK (detail IS NULL OR detail ~ '^[a-z_:]{1,80}$'),
  created_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by text CHECK (acknowledged_by IS NULL OR acknowledged_by ~ '^[a-z0-9_-]{1,40}$')
);

REVOKE ALL ON atlas_person_readings, atlas_person_removals, atlas_person_removed_texts, atlas_person_disputes,
  atlas_person_reading_spend, atlas_person_changes, atlas_person_owner_notices FROM PUBLIC;
-- The public runtime's reader selects every table by default privilege (init-reader.sh); the private three are not its.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON atlas_person_removed_texts, atlas_person_disputes, atlas_person_reading_spend,
      atlas_person_owner_notices FROM askrigor_reader;
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
    WHEN p_kind = 'glance' THEN p_id ~ '^G-[1-9][0-9]{3,}$'
      AND EXISTS (SELECT 1 FROM atlas_glance_rows glance WHERE glance.row_number = substr(p_id, 3)::bigint)
    WHEN p_kind = 'news' THEN p_id ~ '^N-[1-9][0-9]*$'
    ELSE false
  END
$function$;
REVOKE ALL ON FUNCTION atlas_person_subject_known(text, text) FROM PUBLIC;

-- The one serialization rule for a subject's reading and its automatic removals (Codex's second review of B): saving a
-- reading, claiming one and judging a dispute against one each hold this lock until their transaction ends.
CREATE OR REPLACE FUNCTION atlas_person_lock_subject(p_kind text, p_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT pg_advisory_xact_lock(hashtextextended('atlas_person_subject:' || p_kind || ':' || p_id, 0))
$function$;
REVOKE ALL ON FUNCTION atlas_person_lock_subject(text, text) FROM PUBLIC;

-- A notice for the owner, written in the transaction of what it reports.
CREATE OR REPLACE FUNCTION atlas_person_notify(p_kind text, p_subject_kind text, p_subject_id text, p_dispute bigint,
  p_detail text, p_at timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  INSERT INTO atlas_person_owner_notices (kind, subject_kind, subject_id, dispute_number, detail, created_at)
  VALUES (p_kind, p_subject_kind, p_subject_id, p_dispute, p_detail, p_at)
$function$;
REVOKE ALL ON FUNCTION atlas_person_notify(text, text, text, bigint, text, timestamptz) FROM PUBLIC;

-- A sentence's state change, in the public history; a finding the owner checked (it has an F number) goes back before
-- him whenever one of its claims is taken off or disputed (design 4.6; Codex's second review of B).
CREATE OR REPLACE FUNCTION atlas_person_record_change(p_subject_kind text, p_subject_id text, p_state text,
  p_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  INSERT INTO atlas_person_changes (subject_kind, subject_id, state, changed_at)
  VALUES (p_subject_kind, p_subject_id, p_state, p_at);
  IF p_subject_kind = 'publication' AND p_state IN ('taken_off', 'disputed') AND EXISTS (SELECT 1
      FROM atlas_publications publication WHERE publication.publication_number = p_subject_id
       AND publication.atlas_number IS NOT NULL) THEN
    PERFORM atlas_person_notify('recheck', p_subject_kind, p_subject_id, NULL, p_state, p_at);
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION atlas_person_record_change(text, text, text, timestamptz) FROM PUBLIC;

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
  PERFORM atlas_person_lock_subject(p_subject_kind, p_subject_id);
  INSERT INTO atlas_person_readings AS stored (subject_kind, subject_id, digest, sentences, read_at, model,
    attempt_digest, attempts, parked, updated_at)
  VALUES (p_subject_kind, p_subject_id, p_digest, p_sentences, p_at, p_model, NULL, 0, false, p_at)
  ON CONFLICT (subject_kind, subject_id) DO UPDATE SET digest = EXCLUDED.digest, sentences = EXCLUDED.sentences,
    read_at = EXCLUDED.read_at, model = EXCLUDED.model, attempt_digest = NULL, attempts = 0, parked = false,
    claimed_until = NULL, updated_at = EXCLUDED.updated_at;
END
$function$;
REVOKE ALL ON FUNCTION save_atlas_person_reading(text, text, text, jsonb, text, timestamptz) FROM PUBLIC;

-- A failed call's class, after its attempt was counted by its claim (below); "attempt" counts one itself (a finding too
-- long to read). Three park it, and the owner hears of every refusal and every parked finding (Codex's review of B).
CREATE OR REPLACE FUNCTION fail_atlas_person_reading(p_subject_kind text, p_subject_id text, p_digest text,
  p_reason text, p_at timestamptz, p_limit integer)
RETURNS TABLE (attempts integer, parked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  was_parked boolean;
  now_attempts integer;
  now_parked boolean;
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR p_at IS NULL OR p_limit IS NULL OR p_limit < 1
    OR p_limit > 100 OR p_reason IS NULL OR p_reason !~ '^[a-z_:]{1,80}$' THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_INVALID';
  END IF;
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_UNKNOWN_SUBJECT';
  END IF;
  PERFORM atlas_person_lock_subject(p_subject_kind, p_subject_id);
  SELECT stored.parked AND stored.attempt_digest = p_digest INTO was_parked FROM atlas_person_readings stored
   WHERE stored.subject_kind = p_subject_kind AND stored.subject_id = p_subject_id;
  INSERT INTO atlas_person_readings AS stored (subject_kind, subject_id, attempt_digest, attempts, parked, last_failure,
    updated_at)
  VALUES (p_subject_kind, p_subject_id, p_digest, 1, 1 >= p_limit, p_reason, p_at)
  ON CONFLICT (subject_kind, subject_id) DO UPDATE SET
    attempts = CASE WHEN stored.attempt_digest = EXCLUDED.attempt_digest THEN stored.attempts + CASE WHEN EXCLUDED.last_failure = 'attempt' THEN 1 ELSE 0 END ELSE 1 END,
    parked = (CASE WHEN stored.attempt_digest = EXCLUDED.attempt_digest THEN stored.attempts + CASE WHEN EXCLUDED.last_failure = 'attempt' THEN 1 ELSE 0 END ELSE 1 END) >= p_limit,
    attempt_digest = EXCLUDED.attempt_digest,
    last_failure = EXCLUDED.last_failure,
    claimed_until = NULL,
    updated_at = EXCLUDED.updated_at
  RETURNING stored.attempts, stored.parked INTO now_attempts, now_parked;
  IF p_reason LIKE 'refusal:%' THEN
    PERFORM atlas_person_notify('refusal', p_subject_kind, p_subject_id, NULL, p_reason, p_at);
  END IF;
  IF now_parked AND (p_reason <> 'attempt' OR NOT coalesce(was_parked, false)) THEN
    PERFORM atlas_person_notify('parked', p_subject_kind, p_subject_id, NULL, p_reason, p_at);
  END IF;
  RETURN QUERY SELECT now_attempts, now_parked;
END
$function$;
REVOKE ALL ON FUNCTION fail_atlas_person_reading(text, text, text, text, timestamptz, integer) FROM PUBLIC;

-- The one claim on a digest's reading, across processes and restarts (Codex's second review of B): refused when that
-- digest is already read, parked, or claimed by a call still running; otherwise it counts the attempt before the call
-- (a crash mid-call still uses one) and holds the digest until the call ends or the lease passes.
CREATE OR REPLACE FUNCTION claim_atlas_person_reading(p_subject_kind text, p_subject_id text, p_digest text,
  p_again boolean, p_at timestamptz, p_limit integer, p_lease_seconds integer)
RETURNS TABLE (claimed boolean, attempts integer, parked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  stored_row record;
  next_attempts integer;
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR p_at IS NULL OR p_limit IS NULL OR p_limit < 1
    OR p_limit > 100 OR p_again IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_INVALID';
  END IF;
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_READING_UNKNOWN_SUBJECT';
  END IF;
  PERFORM atlas_person_lock_subject(p_subject_kind, p_subject_id);
  INSERT INTO atlas_person_readings (subject_kind, subject_id, updated_at) VALUES (p_subject_kind, p_subject_id, p_at)
  ON CONFLICT (subject_kind, subject_id) DO NOTHING;
  SELECT stored.digest, stored.attempt_digest, stored.attempts, stored.parked, stored.claimed_until INTO stored_row
    FROM atlas_person_readings stored
   WHERE stored.subject_kind = p_subject_kind AND stored.subject_id = p_subject_id
     FOR UPDATE;
  -- A missed-claim report reads a digest again although it is read (p_again); parking and a running claim still hold.
  -- One call at a time on a subject, whatever its digest (Codex's third review of B): a running claim on another digest
  -- also refuses, so no claim can replace another's while its call runs.
  IF (NOT p_again AND stored_row.digest IS NOT DISTINCT FROM p_digest) OR coalesce(stored_row.claimed_until > p_at, false)
    OR (stored_row.attempt_digest IS NOT DISTINCT FROM p_digest AND stored_row.parked) THEN
    RETURN QUERY SELECT false, stored_row.attempts, stored_row.parked;
    RETURN;
  END IF;
  next_attempts := CASE WHEN stored_row.attempt_digest IS NOT DISTINCT FROM p_digest THEN stored_row.attempts + 1 ELSE 1 END;
  UPDATE atlas_person_readings AS stored SET attempt_digest = p_digest, attempts = next_attempts,
    parked = next_attempts >= p_limit, claimed_until = p_at + make_interval(secs => p_lease_seconds),
    last_failure = 'attempt', updated_at = p_at
   WHERE stored.subject_kind = p_subject_kind AND stored.subject_id = p_subject_id;
  RETURN QUERY SELECT true, next_attempts, next_attempts >= p_limit;
END
$function$;
REVOKE ALL ON FUNCTION claim_atlas_person_reading(text, text, text, boolean, timestamptz, integer, integer) FROM PUBLIC;

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
  p_sentence_key text, p_kind text, p_wanted text, p_legal boolean, p_address text, p_names text[], p_context text[],
  p_sentence text, p_what text, p_link text,
  p_email text, p_at timestamptz, p_ceiling integer, p_per_address integer, p_per_sentence integer, p_per_name integer,
  p_reading_digest text, p_content_digest text)
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
    OR p_address !~ '^[a-f0-9]{64}$' OR p_names IS NULL OR cardinality(p_names) > 20 OR p_context IS NULL
    OR cardinality(p_context) > 40 OR p_sentence IS NULL
    OR length(p_sentence) NOT BETWEEN 1 AND 4000 OR p_what IS NULL OR length(p_what) NOT BETWEEN 1 AND 4000
    OR (p_link IS NOT NULL AND length(p_link) NOT BETWEEN 1 AND 600)
    OR (p_email IS NOT NULL AND length(p_email) NOT BETWEEN 3 AND 254) OR p_at IS NULL OR p_ceiling IS NULL
    OR p_per_address IS NULL OR p_per_sentence IS NULL OR p_per_name IS NULL
    OR (p_content_digest IS NOT NULL AND p_content_digest !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'ATLAS_PERSON_DISPUTE_INVALID';
  END IF;
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_DISPUTE_UNKNOWN_SUBJECT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('atlas_person_disputes'));
  PERFORM atlas_person_lock_subject(p_subject_kind, p_subject_id);
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
  -- Codex's reviews of B (P1): an automatic removal stands only on the reading the form was judged by, and only while
  -- that reading is current for the page the form saw (the caller passes no digest for a page whose reading is stale).
  -- The reading's row is locked with the subject, so no reading can replace it before this transaction ends; the caller
  -- checks the page again after it, and hands the dispute back to the main session if the finding changed meanwhile.
  IF chosen = 'taken_off' THEN
    PERFORM 1 FROM atlas_person_readings reading
      WHERE reading.subject_kind = p_subject_kind AND reading.subject_id = p_subject_id
        AND p_reading_digest IS NOT NULL AND reading.digest = p_reading_digest
      FOR UPDATE;
    IF NOT FOUND OR p_content_digest IS NULL THEN
      chosen := 'queued';
    END IF;
  END IF;
  IF chosen = 'taken_off' THEN
    INSERT INTO atlas_person_removals AS stored (subject_kind, subject_id, sentence_key, state, folded_names, context_keys,
      changed_at)
    VALUES (p_subject_kind, p_subject_id, p_sentence_key, 'taken_off', p_names, p_context, p_at)
    ON CONFLICT (subject_kind, subject_id, sentence_key) DO UPDATE SET state = 'taken_off', changed_at = EXCLUDED.changed_at,
      folded_names = ARRAY(SELECT DISTINCT merged.name FROM unnest(stored.folded_names || EXCLUDED.folded_names)
        AS merged(name) ORDER BY merged.name),
      context_keys = ARRAY(SELECT DISTINCT merged.key FROM unnest(stored.context_keys || EXCLUDED.context_keys)
        AS merged(key) ORDER BY merged.key LIMIT 40)
    RETURNING stored.removal_number INTO removal;
    INSERT INTO atlas_person_removed_texts (removal_number, sentence) VALUES (removal, p_sentence)
    ON CONFLICT (removal_number) DO UPDATE SET sentence = EXCLUDED.sentence;
    PERFORM atlas_person_record_change(p_subject_kind, p_subject_id, 'taken_off', p_at);
  ELSIF chosen = 'marked_disputed' THEN
    INSERT INTO atlas_person_removals AS stored (subject_kind, subject_id, sentence_key, state, folded_names, changed_at)
    VALUES (p_subject_kind, p_subject_id, p_sentence_key, 'disputed', p_names, p_at)
    ON CONFLICT (subject_kind, subject_id, sentence_key) DO UPDATE SET
      state = CASE WHEN stored.state = 'taken_off' THEN 'taken_off' ELSE 'disputed' END,
      changed_at = EXCLUDED.changed_at;
    PERFORM atlas_person_record_change(p_subject_kind, p_subject_id, 'disputed', p_at);
  END IF;
  INSERT INTO atlas_person_disputes AS stored (idempotency_key, subject_kind, subject_id, sentence_key, kind, outcome,
    legal, address_key, folded_names, what_is_wrong, source_link, email, sentence, received_at, judged_digest)
  VALUES (p_key, p_subject_kind, p_subject_id, p_sentence_key, p_kind, chosen, p_legal, p_address, p_names, p_what, p_link, p_email,
    p_sentence, p_at, CASE WHEN chosen = 'taken_off' THEN p_content_digest END)
  RETURNING stored.dispute_number INTO stored_number;
  -- Fable 4.7 and Codex's reviews of B: every dispute reaches the owner's channel in this transaction, a legal letter or
  -- data request flagged as one; a request in any language is therefore delivered, whatever the classifier saw.
  PERFORM atlas_person_notify(CASE WHEN p_legal THEN 'legal' ELSE 'dispute' END, p_subject_kind, p_subject_id,
    stored_number, NULL, p_at);
  RETURN QUERY SELECT chosen, stored_number, false;
END
$function$;
REVOKE ALL ON FUNCTION submit_atlas_person_dispute(text, text, text, text, text, text, boolean, text, text[], text[], text,
  text, text, text, timestamptz, integer, integer, integer, integer, text, text) FROM PUBLIC;

-- The main session's or the owner's decision on a sentence: take it off, or put it back (which also clears a dispute
-- mark). Every state can be reversed (design 4.6). "requeue" is the dispute form's own: an automatic removal whose
-- finding changed while it was judged is put back and its dispute handed to the main session, unresolved.
CREATE OR REPLACE FUNCTION decide_atlas_person_claim(p_subject_kind text, p_subject_id text, p_sentence_key text,
  p_action text, p_sentence text, p_names text[], p_context text[], p_dispute bigint, p_resolution text,
  p_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  removal bigint;
BEGIN
  IF NOT coalesce(atlas_person_subject_known(p_subject_kind, p_subject_id), false) OR p_sentence_key IS NULL
    OR p_sentence_key !~ '^[a-f0-9]{64}$' OR p_action IS NULL
    OR p_action NOT IN ('take_off', 'restore', 'clear_dispute', 'requeue', 'confirm') OR p_names IS NULL OR p_context IS NULL
    OR cardinality(p_context) > 40 OR p_resolution IS NULL OR length(p_resolution) > 500 OR p_at IS NULL
    OR (p_action IN ('requeue', 'confirm') AND p_dispute IS NULL)
    OR (p_action = 'take_off' AND (p_sentence IS NULL OR length(p_sentence) NOT BETWEEN 1 AND 4000)) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_DECISION_INVALID';
  END IF;
  PERFORM atlas_person_lock_subject(p_subject_kind, p_subject_id);
  -- The check of an automatic removal found its finding unchanged: it stands, and is no longer listed for the check.
  IF p_action = 'confirm' THEN
    UPDATE atlas_person_disputes AS dispute SET checked_at = p_at
     WHERE dispute.dispute_number = p_dispute AND dispute.checked_at IS NULL;
    RETURN FOUND;
  END IF;
  IF p_action = 'take_off' THEN
    INSERT INTO atlas_person_removals AS stored (subject_kind, subject_id, sentence_key, state, folded_names, context_keys,
      changed_at)
    VALUES (p_subject_kind, p_subject_id, p_sentence_key, 'taken_off', p_names, p_context, p_at)
    ON CONFLICT (subject_kind, subject_id, sentence_key) DO UPDATE SET state = 'taken_off', changed_at = EXCLUDED.changed_at,
      folded_names = ARRAY(SELECT DISTINCT merged.name FROM unnest(stored.folded_names || EXCLUDED.folded_names)
        AS merged(name) ORDER BY merged.name),
      context_keys = ARRAY(SELECT DISTINCT merged.key FROM unnest(stored.context_keys || EXCLUDED.context_keys)
        AS merged(key) ORDER BY merged.key LIMIT 40)
    RETURNING stored.removal_number INTO removal;
    INSERT INTO atlas_person_removed_texts (removal_number, sentence) VALUES (removal, p_sentence)
    ON CONFLICT (removal_number) DO UPDATE SET sentence = EXCLUDED.sentence;
    PERFORM atlas_person_record_change(p_subject_kind, p_subject_id, 'taken_off', p_at);
  ELSE
    UPDATE atlas_person_removals AS stored SET state = 'restored', changed_at = p_at
     WHERE stored.subject_kind = p_subject_kind AND stored.subject_id = p_subject_id
       AND stored.sentence_key = p_sentence_key;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    PERFORM atlas_person_record_change(p_subject_kind, p_subject_id, 'restored', p_at);
  END IF;
  IF p_action = 'requeue' THEN
    UPDATE atlas_person_disputes AS dispute SET outcome = 'queued', checked_at = p_at WHERE dispute.dispute_number = p_dispute;
    RETURN true;
  END IF;
  IF p_dispute IS NOT NULL THEN
    UPDATE atlas_person_disputes AS dispute SET resolved_at = p_at, resolution = p_resolution
     WHERE dispute.dispute_number = p_dispute;
  END IF;
  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION decide_atlas_person_claim(text, text, text, text, text, text[], text[], bigint, text,
  timestamptz) FROM PUBLIC;

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

-- The taken-off sentences a finding's reading is given: those its names or its context make relevant, by number.
CREATE OR REPLACE FUNCTION atlas_person_removed_texts_for(p_numbers bigint[])
RETURNS TABLE (removal_number bigint, sentence text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  RETURN QUERY SELECT removal.removal_number, kept.sentence
    FROM atlas_person_removals removal
    JOIN atlas_person_removed_texts kept ON kept.removal_number = removal.removal_number
   WHERE removal.state = 'taken_off' AND removal.removal_number = ANY (coalesce(p_numbers, '{}'::bigint[]))
   ORDER BY removal.removal_number;
END
$function$;
REVOKE ALL ON FUNCTION atlas_person_removed_texts_for(bigint[]) FROM PUBLIC;

-- The automatic removals not yet checked again against the finding they were judged on: the dispute form checks each at
-- once, and a reconciliation pass checks what a crash or a failed read left (Codex's third review of B).
CREATE OR REPLACE FUNCTION list_atlas_person_unchecked_removals(p_limit integer)
RETURNS TABLE (dispute_number bigint, subject_kind text, subject_id text, sentence_key text, judged_digest text,
  received_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  RETURN QUERY SELECT d.dispute_number, d.subject_kind, d.subject_id, d.sentence_key, d.judged_digest, d.received_at
    FROM atlas_person_disputes d
   WHERE d.outcome = 'taken_off' AND d.checked_at IS NULL
   ORDER BY d.dispute_number
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 500);
END
$function$;
REVOKE ALL ON FUNCTION list_atlas_person_unchecked_removals(integer) FROM PUBLIC;

-- The owner's channel (Codex's reviews of B, owner delivery): each notice not yet acknowledged is handed out to be sent
-- until it is delivered, and again each day until the owner acknowledges it; a failed send waits longer each time (at
-- most an hour). A notice handed out is skipped by every other process until its wait passes.
CREATE OR REPLACE FUNCTION take_atlas_person_notices(p_limit integer, p_at timestamptz)
RETURNS TABLE (notice_number bigint, kind text, subject_kind text, subject_id text, dispute_number bigint, detail text,
  created_at timestamptz, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF p_at IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PERSON_NOTICES_INVALID';
  END IF;
  -- Legal mail first, then in the order they came.
  RETURN QUERY WITH taken AS (
    UPDATE atlas_person_owner_notices AS n SET attempts = n.attempts + 1,
        next_attempt_at = p_at + least(interval '1 hour', interval '1 minute' * power(2, least(n.attempts, 6)))
     WHERE n.notice_number IN (SELECT due.notice_number FROM atlas_person_owner_notices due
       WHERE due.acknowledged_at IS NULL AND (due.next_attempt_at IS NULL OR due.next_attempt_at <= p_at)
         AND (due.delivered_at IS NULL OR due.delivered_at <= p_at - interval '24 hours')
       ORDER BY due.kind = 'legal' DESC, due.notice_number
       LIMIT least(greatest(coalesce(p_limit, 20), 1), 100) FOR UPDATE SKIP LOCKED)
    RETURNING n.notice_number, n.kind, n.subject_kind, n.subject_id, n.dispute_number, n.detail, n.created_at, n.attempts)
  SELECT taken.notice_number, taken.kind, taken.subject_kind, taken.subject_id, taken.dispute_number, taken.detail,
      taken.created_at, taken.attempts
    FROM taken ORDER BY taken.kind = 'legal' DESC, taken.notice_number;
END
$function$;
REVOKE ALL ON FUNCTION take_atlas_person_notices(integer, timestamptz) FROM PUBLIC;

-- A send's receipt ("delivered": the owner's channel took it) or the owner's acknowledgement, with who gave it.
CREATE OR REPLACE FUNCTION record_atlas_person_notice(p_notice bigint, p_action text, p_by text, p_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF p_notice IS NULL OR p_action IS NULL OR p_action NOT IN ('delivered', 'acknowledged') OR p_at IS NULL
    OR (p_action = 'acknowledged' AND (p_by IS NULL OR p_by !~ '^[a-z0-9_-]{1,40}$')) THEN
    RAISE EXCEPTION 'ATLAS_PERSON_NOTICES_INVALID';
  END IF;
  IF p_action = 'delivered' THEN
    UPDATE atlas_person_owner_notices AS n SET delivered_at = p_at WHERE n.notice_number = p_notice;
  ELSE
    UPDATE atlas_person_owner_notices AS n SET acknowledged_at = p_at, acknowledged_by = p_by
     WHERE n.notice_number = p_notice AND n.acknowledged_at IS NULL;
  END IF;
  RETURN FOUND;
END
$function$;
REVOKE ALL ON FUNCTION record_atlas_person_notice(bigint, text, text, timestamptz) FROM PUBLIC;

-- The notices not yet acknowledged, legal mail first, with their delivery state.
CREATE OR REPLACE FUNCTION list_atlas_person_notices(p_limit integer)
RETURNS TABLE (notice_number bigint, kind text, subject_kind text, subject_id text, dispute_number bigint, detail text,
  created_at timestamptz, attempts integer, delivered_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  RETURN QUERY SELECT n.notice_number, n.kind, n.subject_kind, n.subject_id, n.dispute_number, n.detail, n.created_at,
      n.attempts, n.delivered_at
    FROM atlas_person_owner_notices n
   WHERE n.acknowledged_at IS NULL
   ORDER BY n.kind = 'legal' DESC, n.notice_number
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 500);
END
$function$;
REVOKE ALL ON FUNCTION list_atlas_person_notices(integer) FROM PUBLIC;

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
  UPDATE atlas_person_removals AS removal SET folded_names = '{}', context_keys = '{}'
   WHERE removal.changed_at < p_before - interval '1005 days'
     AND (cardinality(removal.folded_names) > 0 OR cardinality(removal.context_keys) > 0);
  RETURN purged;
END
$function$;
REVOKE ALL ON FUNCTION purge_atlas_person_disputes(timestamptz) FROM PUBLIC;
