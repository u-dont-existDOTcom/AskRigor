SET search_path TO __SCHEMA__, public;

-- Decision 171, section 4E (owner answers 168a and "171 approved", 24 Oct 2026; plan
-- docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md, design
-- docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, section E): votes and comments on the Atlas's
-- published findings, from people signed in with an AskRigor account, and the owner's picks for the home page.
--
-- A participant is known only by a key the server derives from the account key the connector derives, an HMAC under a
-- separate secret: never an email address, an OAuth subject or anything else the login holds. A participant's row holds
-- that key, a tag the owner's review names them by, the display name they chose with their first comment, whether the
-- owner stopped them from commenting, and its times. It exists only while it holds a vote, a comment or the owner's
-- stop; deleting the last of them deletes the row, display name and all. Votes are shown only as totals; a comment is
-- public with the display name its author chose; a report holds the reporter's key, or a hash of the reporter's
-- address under a salt the server keeps in memory for one day, never the address, and is deleted with its comment, when
-- the owner shows the comment (the reports are then dealt with) or when its reporter deletes everything they hold. A
-- participant can delete all their votes, comments and reports at once. Signing out everywhere, or deleting everything,
-- ends every session signed in before it: the server keeps when a participant's sessions last ended, by a hash of their
-- key, for the 30 days a session can last. The public runtime's access role writes through the nine participation
-- functions below and the review role moderates through the five moderation functions (the provisioning scripts grant
-- exactly those); the reader reads the tables for the pages. Safe to run again: every migration runs on each start, in
-- one transaction.

CREATE SEQUENCE IF NOT EXISTS atlas_comment_number_seq AS bigint START WITH 1001 MINVALUE 1001 NO CYCLE;

CREATE TABLE IF NOT EXISTS atlas_participants (
  participant_key text PRIMARY KEY CHECK (participant_key ~ '^[a-f0-9]{64}$'),
  commenter_tag text NOT NULL UNIQUE CHECK (commenter_tag ~ '^U-[a-f0-9]{12}$'),
  -- A random salt for the mark the pages show after a comment's name (with the key and that name): new with each row,
  -- and drawn again when the participant deletes everything, so the mark links their comments under one name only.
  mark_salt text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') CHECK (mark_salt ~ '^[a-f0-9]{32}$'),
  display_name text CHECK (
    display_name IS NULL OR (display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 40)
  ),
  stopped_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT atlas_participants_v1_times_check CHECK (
    created_at <= updated_at AND (stopped_at IS NULL OR created_at <= stopped_at)
  )
);

CREATE TABLE IF NOT EXISTS atlas_votes (
  publication_number text NOT NULL REFERENCES atlas_publications(publication_number),
  participant_key text NOT NULL REFERENCES atlas_participants(participant_key),
  vote text NOT NULL CHECK (vote IN ('agree', 'disagree')),
  voted_at timestamptz NOT NULL,
  PRIMARY KEY (publication_number, participant_key)
);

CREATE INDEX IF NOT EXISTS atlas_votes_participant_idx ON atlas_votes (participant_key);

CREATE TABLE IF NOT EXISTS atlas_comments (
  comment_number bigint PRIMARY KEY CHECK (comment_number >= 1001),
  publication_number text NOT NULL REFERENCES atlas_publications(publication_number),
  participant_key text NOT NULL REFERENCES atlas_participants(participant_key),
  -- The display name as it was when the comment was posted.
  display_name text NOT NULL CHECK (display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 40),
  body text NOT NULL CHECK (body = btrim(body) AND length(body) BETWEEN 1 AND 2000),
  state text NOT NULL CHECK (state IN ('shown', 'hidden')),
  report_count integer NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  posted_at timestamptz NOT NULL,
  state_changed_at timestamptz NOT NULL,
  CONSTRAINT atlas_comments_v1_times_check CHECK (posted_at <= state_changed_at)
);

CREATE INDEX IF NOT EXISTS atlas_comments_publication_idx ON atlas_comments (publication_number, comment_number);
CREATE INDEX IF NOT EXISTS atlas_comments_participant_idx ON atlas_comments (participant_key);
CREATE INDEX IF NOT EXISTS atlas_comments_reported_idx ON atlas_comments (comment_number) WHERE report_count > 0;

-- One report per comment and reporter: a participant's key (p:) or a daily-salted hash of the address (a:).
CREATE TABLE IF NOT EXISTS atlas_comment_reports (
  comment_number bigint NOT NULL REFERENCES atlas_comments(comment_number) ON DELETE CASCADE,
  reporter_key text NOT NULL CHECK (reporter_key ~ '^[pa]:[a-f0-9]{64}$'),
  reported_at timestamptz NOT NULL,
  PRIMARY KEY (comment_number, reporter_key)
);

-- The owner's "most important now" picks (decision 2a), up to five, each with the owner's public reason.
CREATE TABLE IF NOT EXISTS atlas_home_picks (
  slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 5),
  publication_number text NOT NULL UNIQUE REFERENCES atlas_publications(publication_number),
  reason text NOT NULL CHECK (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 300),
  set_at timestamptz NOT NULL
);

-- When a participant's sessions last ended (signing out everywhere, deleting everything), by a hash of their key: every
-- session signed in up to then is over. Kept for the 30 days a session can last, then deleted.
CREATE TABLE IF NOT EXISTS atlas_session_ends (
  session_key_hash text PRIMARY KEY CHECK (session_key_hash ~ '^[a-f0-9]{64}$'),
  ended_at timestamptz NOT NULL,
  keep_until timestamptz NOT NULL,
  CONSTRAINT atlas_session_ends_v1_times_check CHECK (ended_at < keep_until)
);

CREATE INDEX IF NOT EXISTS atlas_session_ends_keep_until_idx ON atlas_session_ends (keep_until);

COMMENT ON TABLE atlas_participants IS
  'People who vote or comment in the Atlas (decision 171), by a key derived from the account key, never an email address or OAuth subject; a row exists only while it holds a vote, a comment or the owner''s stop.';
COMMENT ON TABLE atlas_comment_reports IS
  'Reports of Atlas comments: a participant key (p:) or a daily-salted hash of the reporter''s address (a:), never the address; deleted with the comment, when the owner shows it, or when the reporter deletes everything they hold.';

-- Whether a publication shows on the pages, as the pages decide it (apps/research-mcp/src/atlas/page-data.ts): an
-- unreviewed one with its published fields, or an accepted or edited one whose F number the writer has written, whose
-- latest version is not withdrawn and whose wording no redaction erased (erase_atlas_wording records one per version).
CREATE OR REPLACE FUNCTION atlas_publication_open(target_publication_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM atlas_publications stored
     WHERE stored.publication_number = target_publication_number
       AND (
         (stored.state = 'unreviewed' AND stored.published_json IS NOT NULL)
         OR (stored.state IN ('accepted', 'edited') AND EXISTS (
           SELECT 1 FROM atlas_finding_current current_finding
            WHERE current_finding.public_number = stored.atlas_number
              AND current_finding.label IS DISTINCT FROM 'withdrawn'
              AND NOT EXISTS (
                SELECT 1 FROM atlas_redactions redaction
                 WHERE redaction.claim_version_id = current_finding.latest_claim_version_id
              )
         ))
       )
  )
$function$;

REVOKE ALL ON FUNCTION atlas_publication_open(text) FROM PUBLIC;

-- Deletes a participant's row once it holds nothing: no vote, no comment and no stop.
CREATE OR REPLACE FUNCTION atlas_forget_idle_participant(target_participant_key text)
RETURNS void
LANGUAGE sql
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  DELETE FROM atlas_participants stored
   WHERE stored.participant_key = target_participant_key
     AND stored.stopped_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM atlas_votes vote WHERE vote.participant_key = target_participant_key)
     AND NOT EXISTS (SELECT 1 FROM atlas_comments comment_row WHERE comment_row.participant_key = target_participant_key)
$function$;

REVOKE ALL ON FUNCTION atlas_forget_idle_participant(text) FROM PUBLIC;

-- The hash a participant's ended sessions are kept under: not the key itself.
CREATE OR REPLACE FUNCTION atlas_session_key_hash(target_participant_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT encode(sha256(convert_to('askrigor-atlas-sessions:v1:' || target_participant_key, 'UTF8')), 'hex')
$function$;

REVOKE ALL ON FUNCTION atlas_session_key_hash(text) FROM PUBLIC;

-- Ends every session of the participant signed in up to end_time, and deletes the ends whose 30 days are over.
CREATE OR REPLACE FUNCTION atlas_end_sessions(target_participant_key text, end_time timestamptz)
RETURNS void
LANGUAGE sql
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  DELETE FROM atlas_session_ends lapsed WHERE lapsed.keep_until < end_time;
  INSERT INTO atlas_session_ends AS stored (session_key_hash, ended_at, keep_until)
  VALUES (atlas_session_key_hash(target_participant_key), end_time, end_time + interval '30 days')
  ON CONFLICT (session_key_hash) DO UPDATE
    SET ended_at = greatest(stored.ended_at, EXCLUDED.ended_at),
        keep_until = greatest(stored.keep_until, EXCLUDED.keep_until);
$function$;

REVOKE ALL ON FUNCTION atlas_end_sessions(text, timestamptz) FROM PUBLIC;

-- The participation functions (SECURITY DEFINER; provision-research-access-role.sh grants exactly these) -----------

-- The participant's own display name and whether the owner stopped them from commenting; no row when they hold nothing.
CREATE OR REPLACE FUNCTION inspect_atlas_participant(target_participant_key text)
RETURNS TABLE (participant_display_name text, participant_stopped boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT stored.display_name, stored.stopped_at IS NOT NULL
    FROM atlas_participants stored
   WHERE stored.participant_key = target_participant_key;
END
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_participant(text) FROM PUBLIC;

-- Changes the participant's display name; the first one comes with their first comment (post_atlas_comment), so a
-- participant without one is refused. Comments already posted keep the name they were posted with.
CREATE OR REPLACE FUNCTION set_atlas_display_name(
  target_participant_key text,
  new_display_name text,
  change_time timestamptz
)
RETURNS TABLE (participant_display_name text, participant_stopped boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR new_display_name IS NULL OR new_display_name <> btrim(new_display_name)
     OR length(new_display_name) NOT BETWEEN 1 AND 40
     OR change_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  UPDATE atlas_participants stored
     SET display_name = new_display_name,
         updated_at = greatest(change_time, stored.updated_at)
   WHERE stored.participant_key = target_participant_key
     AND stored.display_name IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_DISPLAY_NAME_REQUIRED';
  END IF;
  RETURN QUERY
  SELECT stored.display_name, stored.stopped_at IS NOT NULL
    FROM atlas_participants stored
   WHERE stored.participant_key = target_participant_key;
END
$function$;

REVOKE ALL ON FUNCTION set_atlas_display_name(text, text, timestamptz) FROM PUBLIC;

-- Records the participant's vote on a publication that shows, or clears it (new_vote NULL); returns the totals.
CREATE OR REPLACE FUNCTION set_atlas_vote(
  target_participant_key text,
  target_publication_number text,
  new_vote text,
  vote_time timestamptz
)
RETURNS TABLE (agree_count bigint, disagree_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR target_publication_number IS NULL OR target_publication_number !~ '^P-[1-9][0-9]{3,}$'
     OR (new_vote IS NOT NULL AND new_vote NOT IN ('agree', 'disagree'))
     OR vote_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  IF new_vote IS NULL THEN
    DELETE FROM atlas_votes stored
     WHERE stored.publication_number = target_publication_number
       AND stored.participant_key = target_participant_key;
    PERFORM atlas_forget_idle_participant(target_participant_key);
  ELSE
    IF NOT atlas_publication_open(target_publication_number) THEN
      RAISE EXCEPTION 'ATLAS_PARTICIPATION_NOT_SHOWN';
    END IF;
    INSERT INTO atlas_participants (participant_key, commenter_tag, created_at, updated_at)
    VALUES (
      target_participant_key,
      'U-' || substr(encode(sha256(convert_to('askrigor-atlas-commenter:v1:' || target_participant_key, 'UTF8')), 'hex'), 1, 12),
      vote_time, vote_time
    )
    ON CONFLICT (participant_key) DO NOTHING;
    INSERT INTO atlas_votes AS stored (publication_number, participant_key, vote, voted_at)
    VALUES (target_publication_number, target_participant_key, new_vote, vote_time)
    ON CONFLICT (publication_number, participant_key) DO UPDATE
      SET vote = EXCLUDED.vote, voted_at = EXCLUDED.voted_at;
  END IF;
  RETURN QUERY
  SELECT count(*) FILTER (WHERE counted.vote = 'agree'), count(*) FILTER (WHERE counted.vote = 'disagree')
    FROM atlas_votes counted
   WHERE counted.publication_number = target_publication_number;
END
$function$;

REVOKE ALL ON FUNCTION set_atlas_vote(text, text, text, timestamptz) FROM PUBLIC;

-- Posts a comment, shown at once (the server checked it and the display name for contact details and links first),
-- under the participant's display name, or under new_display_name, which becomes theirs, when they have none yet.
-- Refused without a display name, for a participant the owner stopped, and on a publication that does not show; a
-- refusal leaves nothing behind.
CREATE OR REPLACE FUNCTION post_atlas_comment(
  target_participant_key text,
  target_publication_number text,
  comment_body text,
  new_display_name text,
  post_time timestamptz
)
RETURNS TABLE (comment_public_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  author atlas_participants%ROWTYPE;
  next_number bigint;
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR target_publication_number IS NULL OR target_publication_number !~ '^P-[1-9][0-9]{3,}$'
     OR comment_body IS NULL OR comment_body <> btrim(comment_body) OR length(comment_body) NOT BETWEEN 1 AND 2000
     OR (new_display_name IS NOT NULL AND (new_display_name <> btrim(new_display_name)
         OR length(new_display_name) NOT BETWEEN 1 AND 40))
     OR post_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  IF NOT atlas_publication_open(target_publication_number) THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_NOT_SHOWN';
  END IF;
  SELECT * INTO author FROM atlas_participants stored
   WHERE stored.participant_key = target_participant_key
   FOR UPDATE;
  IF FOUND AND author.stopped_at IS NOT NULL THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_STOPPED';
  END IF;
  IF NOT FOUND OR author.display_name IS NULL THEN
    IF new_display_name IS NULL THEN
      RAISE EXCEPTION 'ATLAS_PARTICIPATION_DISPLAY_NAME_REQUIRED';
    END IF;
    INSERT INTO atlas_participants AS stored
      (participant_key, commenter_tag, display_name, created_at, updated_at)
    VALUES (
      target_participant_key,
      'U-' || substr(encode(sha256(convert_to('askrigor-atlas-commenter:v1:' || target_participant_key, 'UTF8')), 'hex'), 1, 12),
      new_display_name, post_time, post_time
    )
    ON CONFLICT (participant_key) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          updated_at = greatest(EXCLUDED.updated_at, stored.updated_at)
    RETURNING * INTO author;
  END IF;
  next_number := nextval('atlas_comment_number_seq');
  INSERT INTO atlas_comments
    (comment_number, publication_number, participant_key, display_name, body, state, report_count, posted_at,
     state_changed_at)
  VALUES
    (next_number, target_publication_number, target_participant_key, author.display_name, comment_body, 'shown', 0,
     post_time, post_time);
  RETURN QUERY SELECT 'C-' || next_number::text;
END
$function$;

REVOKE ALL ON FUNCTION post_atlas_comment(text, text, text, text, timestamptz) FROM PUBLIC;

-- Deletes the participant's own comment, with its reports; returns whether it did.
CREATE OR REPLACE FUNCTION delete_atlas_comment(target_participant_key text, target_public_id text)
RETURNS TABLE (comment_deleted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  removed integer;
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR target_public_id IS NULL OR target_public_id !~ '^C-[1-9][0-9]{3,}$'
  THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  DELETE FROM atlas_comments stored
   WHERE stored.comment_number = substring(target_public_id FROM 3)::bigint
     AND stored.participant_key = target_participant_key;
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM atlas_forget_idle_participant(target_participant_key);
  RETURN QUERY SELECT removed > 0;
END
$function$;

REVOKE ALL ON FUNCTION delete_atlas_comment(text, text) FROM PUBLIC;

-- Reports a comment that shows, once per reporter: reported, already_reported or not_found.
CREATE OR REPLACE FUNCTION report_atlas_comment(target_reporter_key text, target_public_id text, report_time timestamptz)
RETURNS TABLE (report_outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target_number bigint;
  added integer;
BEGIN
  IF target_reporter_key IS NULL OR target_reporter_key !~ '^[pa]:[a-f0-9]{64}$'
     OR target_public_id IS NULL OR target_public_id !~ '^C-[1-9][0-9]{3,}$'
     OR report_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  target_number := substring(target_public_id FROM 3)::bigint;
  PERFORM 1 FROM atlas_comments stored WHERE stored.comment_number = target_number AND stored.state = 'shown' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text;
    RETURN;
  END IF;
  INSERT INTO atlas_comment_reports (comment_number, reporter_key, reported_at)
  VALUES (target_number, target_reporter_key, report_time)
  ON CONFLICT (comment_number, reporter_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  IF added = 0 THEN
    RETURN QUERY SELECT 'already_reported'::text;
    RETURN;
  END IF;
  UPDATE atlas_comments stored SET report_count = stored.report_count + 1 WHERE stored.comment_number = target_number;
  RETURN QUERY SELECT 'reported'::text;
END
$function$;

REVOKE ALL ON FUNCTION report_atlas_comment(text, text, timestamptz) FROM PUBLIC;

-- Signing out everywhere: every session of the participant signed in up to end_time is over.
CREATE OR REPLACE FUNCTION end_atlas_sessions(target_participant_key text, end_time timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$' OR end_time IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  PERFORM atlas_end_sessions(target_participant_key, end_time);
END
$function$;

REVOKE ALL ON FUNCTION end_atlas_sessions(text, timestamptz) FROM PUBLIC;

-- Whether a session signed in at signed_in_at is still current: no end of the participant's sessions since. Deletes the
-- ends whose 30 days are over, so none outlives them for long.
CREATE OR REPLACE FUNCTION atlas_session_current(
  target_participant_key text,
  signed_in_at timestamptz,
  check_time timestamptz
)
RETURNS TABLE (session_current boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR signed_in_at IS NULL OR check_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  DELETE FROM atlas_session_ends lapsed WHERE lapsed.keep_until < check_time;
  RETURN QUERY SELECT NOT EXISTS (
    SELECT 1 FROM atlas_session_ends stored
     WHERE stored.session_key_hash = atlas_session_key_hash(target_participant_key)
       AND stored.ended_at >= signed_in_at
  );
END
$function$;

REVOKE ALL ON FUNCTION atlas_session_current(text, timestamptz, timestamptz) FROM PUBLIC;

-- Deletes everything the participant holds in the Atlas: their votes, their comments (with the reports on them) and
-- their own reports of other comments; then their row, unless the owner stopped them, in which case only the stop is
-- kept (their display name goes), so deleting cannot undo a stop; and ends every session they signed in with. Returns
-- how many votes, comments and reports went.
CREATE OR REPLACE FUNCTION forget_atlas_participant(target_participant_key text, forget_time timestamptz)
RETURNS TABLE (votes_deleted bigint, comments_deleted bigint, reports_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  vote_rows bigint;
  comment_rows bigint;
  report_rows bigint;
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$' OR forget_time IS NULL THEN
    RAISE EXCEPTION 'ATLAS_PARTICIPATION_INPUT_INVALID';
  END IF;
  PERFORM 1 FROM atlas_participants stored WHERE stored.participant_key = target_participant_key FOR UPDATE;
  DELETE FROM atlas_votes stored WHERE stored.participant_key = target_participant_key;
  GET DIAGNOSTICS vote_rows = ROW_COUNT;
  DELETE FROM atlas_comments stored WHERE stored.participant_key = target_participant_key;
  GET DIAGNOSTICS comment_rows = ROW_COUNT;
  -- One report per comment and reporter, so each comment the participant reported loses exactly one.
  UPDATE atlas_comments stored
     SET report_count = stored.report_count - 1
   WHERE stored.comment_number IN (
     SELECT own.comment_number FROM atlas_comment_reports own WHERE own.reporter_key = 'p:' || target_participant_key
   );
  DELETE FROM atlas_comment_reports stored WHERE stored.reporter_key = 'p:' || target_participant_key;
  GET DIAGNOSTICS report_rows = ROW_COUNT;
  UPDATE atlas_participants stored
     SET display_name = NULL,
         mark_salt = replace(gen_random_uuid()::text, '-', ''),
         updated_at = greatest(forget_time, stored.updated_at)
   WHERE stored.participant_key = target_participant_key
     AND stored.stopped_at IS NOT NULL;
  PERFORM atlas_forget_idle_participant(target_participant_key);
  PERFORM atlas_end_sessions(target_participant_key, forget_time);
  RETURN QUERY SELECT vote_rows, comment_rows, report_rows;
END
$function$;

REVOKE ALL ON FUNCTION forget_atlas_participant(text, timestamptz) FROM PUBLIC;

-- The moderation functions (SECURITY DEFINER; provision-research-review-role.sh grants exactly these) ---------------

-- Comments newest first, every state, or only those with reports; before the given comment number when paging.
CREATE OR REPLACE FUNCTION inspect_atlas_comments(reported_only boolean, before_number bigint, row_limit integer)
RETURNS TABLE (
  comment_public_id text,
  comment_publication_number text,
  comment_commenter_tag text,
  comment_commenter_stopped boolean,
  comment_display_name text,
  comment_body text,
  comment_state text,
  comment_report_count integer,
  comment_posted_at timestamptz,
  comment_state_changed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF reported_only IS NULL OR row_limit IS NULL OR row_limit NOT BETWEEN 1 AND 200
     OR (before_number IS NOT NULL AND before_number < 1)
  THEN
    RAISE EXCEPTION 'ATLAS_MODERATION_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT 'C-' || stored.comment_number::text, stored.publication_number, author.commenter_tag,
         author.stopped_at IS NOT NULL, stored.display_name, stored.body, stored.state, stored.report_count,
         stored.posted_at, stored.state_changed_at
    FROM atlas_comments stored
    JOIN atlas_participants author ON author.participant_key = stored.participant_key
   WHERE (NOT reported_only OR stored.report_count > 0)
     AND (before_number IS NULL OR stored.comment_number < before_number)
   ORDER BY stored.comment_number DESC
   LIMIT row_limit;
END
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_comments(boolean, bigint, integer) FROM PUBLIC;

-- The owner hides a comment (it leaves the pages and stays in the review), shows it (it is on the pages, and its
-- reports, now dealt with, are deleted), or removes it (it is deleted, with its reports). Returns the comment as it was
-- moderated, its state hidden, shown or removed.
CREATE OR REPLACE FUNCTION moderate_atlas_comment(target_public_id text, moderation text, moderation_time timestamptz)
RETURNS TABLE (
  comment_public_id text,
  comment_publication_number text,
  comment_commenter_tag text,
  comment_commenter_stopped boolean,
  comment_display_name text,
  comment_body text,
  comment_state text,
  comment_report_count integer,
  comment_posted_at timestamptz,
  comment_state_changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_comments%ROWTYPE;
  author atlas_participants%ROWTYPE;
BEGIN
  IF target_public_id IS NULL OR target_public_id !~ '^C-[1-9][0-9]{3,}$'
     OR moderation IS NULL OR moderation NOT IN ('hide', 'show', 'remove')
     OR moderation_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_MODERATION_INPUT_INVALID';
  END IF;
  SELECT * INTO target FROM atlas_comments stored
   WHERE stored.comment_number = substring(target_public_id FROM 3)::bigint
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT * INTO author FROM atlas_participants stored WHERE stored.participant_key = target.participant_key;
  IF moderation = 'remove' THEN
    DELETE FROM atlas_comments stored WHERE stored.comment_number = target.comment_number;
    PERFORM atlas_forget_idle_participant(target.participant_key);
    RETURN QUERY SELECT 'C-' || target.comment_number::text, target.publication_number, author.commenter_tag,
      author.stopped_at IS NOT NULL, target.display_name, target.body, 'removed'::text, target.report_count,
      target.posted_at, greatest(moderation_time, target.state_changed_at);
    RETURN;
  END IF;
  UPDATE atlas_comments stored
     SET state = CASE WHEN moderation = 'hide' THEN 'hidden' ELSE 'shown' END,
         state_changed_at = greatest(moderation_time, stored.state_changed_at)
   WHERE stored.comment_number = target.comment_number
     AND stored.state IS DISTINCT FROM CASE WHEN moderation = 'hide' THEN 'hidden' ELSE 'shown' END;
  IF moderation = 'show' THEN
    DELETE FROM atlas_comment_reports stored WHERE stored.comment_number = target.comment_number;
    UPDATE atlas_comments stored SET report_count = 0
     WHERE stored.comment_number = target.comment_number AND stored.report_count <> 0;
  END IF;
  RETURN QUERY
  SELECT 'C-' || stored.comment_number::text, stored.publication_number, author.commenter_tag,
         author.stopped_at IS NOT NULL, stored.display_name, stored.body, stored.state, stored.report_count,
         stored.posted_at, stored.state_changed_at
    FROM atlas_comments stored
   WHERE stored.comment_number = target.comment_number;
END
$function$;

REVOKE ALL ON FUNCTION moderate_atlas_comment(text, text, timestamptz) FROM PUBLIC;

-- Stops a commenter (by the tag the review shows) from commenting, or lets them comment again; their comments stay
-- as they are. Returns the commenter's tag, whether they are stopped and how many comments they have, or no row.
CREATE OR REPLACE FUNCTION set_atlas_commenter_stopped(target_commenter_tag text, stop boolean, change_time timestamptz)
RETURNS TABLE (commenter_tag_now text, commenter_stopped_now boolean, commenter_comment_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_participants%ROWTYPE;
BEGIN
  IF target_commenter_tag IS NULL OR target_commenter_tag !~ '^U-[a-f0-9]{12}$' OR stop IS NULL OR change_time IS NULL THEN
    RAISE EXCEPTION 'ATLAS_MODERATION_INPUT_INVALID';
  END IF;
  UPDATE atlas_participants stored
     SET stopped_at = CASE WHEN stop THEN coalesce(stored.stopped_at, greatest(change_time, stored.created_at)) ELSE NULL END,
         updated_at = greatest(change_time, stored.updated_at)
   WHERE stored.commenter_tag = target_commenter_tag
  RETURNING * INTO target;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT target.commenter_tag, target.stopped_at IS NOT NULL,
         (SELECT count(*) FROM atlas_comments counted WHERE counted.participant_key = target.participant_key);
  IF NOT stop THEN
    PERFORM atlas_forget_idle_participant(target.participant_key);
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION set_atlas_commenter_stopped(text, boolean, timestamptz) FROM PUBLIC;

-- Replaces the home page's picks: up to five publications that show, each with the owner's public reason, in order.
CREATE OR REPLACE FUNCTION set_atlas_home_picks(new_picks jsonb, pick_time timestamptz)
RETURNS TABLE (pick_slot smallint, pick_publication_number text, pick_reason text, pick_set_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  pick jsonb;
  position_now integer := 0;
BEGIN
  IF new_picks IS NULL OR jsonb_typeof(new_picks) <> 'array' OR jsonb_array_length(new_picks) > 5
     OR pick_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_MODERATION_INPUT_INVALID';
  END IF;
  FOR pick IN SELECT entry.value FROM jsonb_array_elements(new_picks) AS entry(value) LOOP
    IF jsonb_typeof(pick) <> 'object'
       OR coalesce(pick ->> 'publicationNumber', '') !~ '^P-[1-9][0-9]{3,}$'
       OR jsonb_typeof(pick -> 'reason') IS DISTINCT FROM 'string'
       OR (pick ->> 'reason') <> btrim(pick ->> 'reason')
       OR length(pick ->> 'reason') NOT BETWEEN 1 AND 300
    THEN
      RAISE EXCEPTION 'ATLAS_MODERATION_INPUT_INVALID';
    END IF;
    IF NOT atlas_publication_open(pick ->> 'publicationNumber') THEN
      RAISE EXCEPTION 'ATLAS_PICK_NOT_PUBLISHED';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT entry.value ->> 'publicationNumber') FROM jsonb_array_elements(new_picks) AS entry(value))
     <> jsonb_array_length(new_picks)
  THEN
    RAISE EXCEPTION 'ATLAS_MODERATION_INPUT_INVALID';
  END IF;
  DELETE FROM atlas_home_picks;
  FOR pick IN SELECT entry.value FROM jsonb_array_elements(new_picks) WITH ORDINALITY AS entry(value, ordinal)
               ORDER BY entry.ordinal LOOP
    position_now := position_now + 1;
    INSERT INTO atlas_home_picks (slot, publication_number, reason, set_at)
    VALUES (position_now, pick ->> 'publicationNumber', pick ->> 'reason', pick_time);
  END LOOP;
  RETURN QUERY
  SELECT stored.slot, stored.publication_number, stored.reason, stored.set_at
    FROM atlas_home_picks stored
   ORDER BY stored.slot;
END
$function$;

REVOKE ALL ON FUNCTION set_atlas_home_picks(jsonb, timestamptz) FROM PUBLIC;

-- The home page's picks, in order.
CREATE OR REPLACE FUNCTION inspect_atlas_home_picks()
RETURNS TABLE (pick_slot smallint, pick_publication_number text, pick_reason text, pick_set_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT stored.slot, stored.publication_number, stored.reason, stored.set_at
    FROM atlas_home_picks stored
   ORDER BY stored.slot
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_home_picks() FROM PUBLIC;

REVOKE ALL ON SEQUENCE atlas_comment_number_seq FROM PUBLIC;
