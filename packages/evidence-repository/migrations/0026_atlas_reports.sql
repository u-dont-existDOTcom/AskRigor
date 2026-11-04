SET search_path TO __SCHEMA__, public;

-- Owner answer 229a (3 Nov 2026; plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, sections 2 and
-- 3): people's own reports of what they tried for a health problem and what happened, published in their words once
-- the AI checks pass ("if it's safe to try, people can try it, if some warning needs adding, AI can add the warning as
-- an AI warning"), with "worked for me too" and "didn't" answers from other signed-in people.
--
-- A report is known by its participant key only (the HMAC of the account key the connector derives, never an email
-- address or an OAuth subject), and published under the name its author chose for it, or none. It arrives received
-- (private), and the review's check moves it once: published (with an AI warning when the check wrote one), held for
-- the owner (not safe, unsure, or too far out), or refused (promotion, spam, or not a report of the author's own
-- experience). A refused report keeps only its number, state and reason: its text is deleted when it is refused. Its
-- author can take it down at any time, which deletes it with its answers and its place; deleting everything deletes
-- all of theirs. Answers are shown only as totals. The public runtime's access role writes through the four report
-- functions and the review role through its three (the provisioning scripts grant exactly those); the reader reads the
-- tables for the pages. Safe to run again: every migration runs on each start, in one transaction.

CREATE SEQUENCE IF NOT EXISTS atlas_report_number_seq AS bigint START WITH 1001 MINVALUE 1001 NO CYCLE;

CREATE TABLE IF NOT EXISTS atlas_reports (
  report_number bigint PRIMARY KEY CHECK (report_number >= 1001),
  participant_key text NOT NULL CHECK (participant_key ~ '^[a-f0-9]{64}$'),
  door text NOT NULL CHECK (door IN ('form', 'ai_app')),
  -- The name it is published under, or null for none.
  display_name text CHECK (display_name IS NULL OR (display_name = btrim(display_name) AND length(display_name) BETWEEN 1 AND 40)),
  -- The report, in its author's words; all null once refused.
  problem text CHECK (problem IS NULL OR (problem = btrim(problem) AND length(problem) BETWEEN 1 AND 300)),
  tried text CHECK (tried IS NULL OR (tried = btrim(tried) AND length(tried) BETWEEN 1 AND 300)),
  dose text CHECK (dose IS NULL OR (dose = btrim(dose) AND length(dose) BETWEEN 1 AND 300)),
  how_used text CHECK (how_used IS NULL OR (how_used = btrim(how_used) AND length(how_used) BETWEEN 1 AND 1000)),
  how_long text CHECK (how_long IS NULL OR (how_long = btrim(how_long) AND length(how_long) BETWEEN 1 AND 300)),
  what_happened text CHECK (what_happened IS NULL OR (what_happened = btrim(what_happened)
    AND length(what_happened) BETWEEN 1 AND 3000)),
  how_long_lasted text CHECK (how_long_lasted IS NULL OR (how_long_lasted = btrim(how_long_lasted)
    AND length(how_long_lasted) BETWEEN 1 AND 300)),
  side_effects text CHECK (side_effects IS NULL OR (side_effects = btrim(side_effects) AND length(side_effects) BETWEEN 1 AND 2000)),
  other_changes text CHECK (other_changes IS NULL OR (other_changes = btrim(other_changes)
    AND length(other_changes) BETWEEN 1 AND 2000)),
  -- The research around it (section 3): from the author's AI, or the check's; the application checks its shape.
  research jsonb CHECK (research IS NULL OR (jsonb_typeof(research) = 'object' AND octet_length(research::text) <= 65536)),
  state text NOT NULL CHECK (state IN ('received', 'published', 'held', 'refused')),
  ai_warning text CHECK (ai_warning IS NULL OR (ai_warning = btrim(ai_warning) AND length(ai_warning) BETWEEN 1 AND 800)),
  hold_reason text CHECK (hold_reason IS NULL OR hold_reason IN ('not_safe', 'unsure', 'too_far_out')),
  refuse_reason text CHECK (refuse_reason IS NULL OR refuse_reason IN ('promotion', 'spam', 'not_a_report')),
  received_at timestamptz NOT NULL,
  checked_at timestamptz,
  state_changed_at timestamptz NOT NULL,
  CONSTRAINT atlas_reports_v1_state_check CHECK (
    (state = 'refused') = (refuse_reason IS NOT NULL)
    AND (state = 'held') = (hold_reason IS NOT NULL)
    AND (ai_warning IS NULL OR state IN ('published', 'held'))
    AND (state = 'received' OR checked_at IS NOT NULL)
    AND (state = 'refused' OR (problem IS NOT NULL AND tried IS NOT NULL AND what_happened IS NOT NULL))
    AND (state <> 'refused' OR (problem IS NULL AND tried IS NULL AND dose IS NULL AND how_used IS NULL
      AND how_long IS NULL AND what_happened IS NULL AND how_long_lasted IS NULL AND side_effects IS NULL
      AND other_changes IS NULL AND research IS NULL AND display_name IS NULL AND ai_warning IS NULL))
  ),
  CONSTRAINT atlas_reports_v1_times_check CHECK (
    received_at <= state_changed_at AND (checked_at IS NULL OR received_at <= checked_at)
  )
);

CREATE INDEX IF NOT EXISTS atlas_reports_state_idx ON atlas_reports (state, report_number);
CREATE INDEX IF NOT EXISTS atlas_reports_participant_idx ON atlas_reports (participant_key);

-- "It worked for me too" or "it didn't", one per published report and signed-in person, never its author's.
CREATE TABLE IF NOT EXISTS atlas_report_answers (
  report_number bigint NOT NULL REFERENCES atlas_reports(report_number) ON DELETE CASCADE,
  participant_key text NOT NULL CHECK (participant_key ~ '^[a-f0-9]{64}$'),
  answer text NOT NULL CHECK (answer IN ('worked', 'did_not')),
  answered_at timestamptz NOT NULL,
  PRIMARY KEY (report_number, participant_key)
);

CREATE INDEX IF NOT EXISTS atlas_report_answers_participant_idx ON atlas_report_answers (participant_key);

COMMENT ON TABLE atlas_reports IS
  'People''s own reports of what they tried and what happened (owner answer 229a), by a participant key, never an email address or OAuth subject; published in their words once the AI check passes; a refused report keeps no text; its author can delete it at any time.';
COMMENT ON TABLE atlas_report_answers IS
  '"It worked for me too" or "it didn''t" on a published report, one per participant key, shown only as totals; deleted with the report or when its author deletes everything they hold.';

-- The public runtime's access role -------------------------------------------------------------------------------------

-- A new report, received (private). At most 5 a day and 20 waiting for the check per author. Returns its id, R-<n>.
CREATE OR REPLACE FUNCTION submit_atlas_report(
  target_participant_key text,
  report_door text,
  report jsonb,
  submit_time timestamptz
)
RETURNS TABLE (report_public_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  next_number bigint;
  field text;
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR report_door IS NULL OR report_door NOT IN ('form', 'ai_app')
     OR report IS NULL OR jsonb_typeof(report) <> 'object' OR submit_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
  END IF;
  FOR field IN SELECT jsonb_object_keys(report) LOOP
    IF field NOT IN ('displayName', 'problem', 'tried', 'dose', 'howUsed', 'howLong', 'whatHappened', 'howLongLasted',
                     'sideEffects', 'otherChanges', 'research') THEN
      RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
    END IF;
    IF field <> 'research' AND jsonb_typeof(report -> field) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM atlas_reports stored
       WHERE stored.participant_key = target_participant_key
         AND stored.received_at >= date_trunc('day', submit_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') >= 5
     OR (SELECT count(*) FROM atlas_reports stored
          WHERE stored.participant_key = target_participant_key AND stored.state = 'received') >= 20
  THEN
    RAISE EXCEPTION 'ATLAS_REPORT_LIMIT';
  END IF;
  next_number := nextval('atlas_report_number_seq');
  BEGIN
    INSERT INTO atlas_reports
      (report_number, participant_key, door, display_name, problem, tried, dose, how_used, how_long, what_happened,
       how_long_lasted, side_effects, other_changes, research, state, received_at, state_changed_at)
    VALUES
      (next_number, target_participant_key, report_door, report ->> 'displayName', report ->> 'problem',
       report ->> 'tried', report ->> 'dose', report ->> 'howUsed', report ->> 'howLong', report ->> 'whatHappened',
       report ->> 'howLongLasted', report ->> 'sideEffects', report ->> 'otherChanges',
       CASE WHEN jsonb_typeof(report -> 'research') = 'object' THEN report -> 'research' END,
       'received', submit_time, submit_time);
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
  END;
  RETURN QUERY SELECT 'R-' || next_number::text;
END
$function$;

REVOKE ALL ON FUNCTION submit_atlas_report(text, text, jsonb, timestamptz) FROM PUBLIC;

-- Its author takes a report down: it is deleted with its answers and its place. False when they have no such report.
CREATE OR REPLACE FUNCTION take_down_atlas_report(target_participant_key text, target_public_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  removed bigint;
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR target_public_id IS NULL OR target_public_id !~ '^R-[1-9][0-9]{3,}$'
  THEN
    RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
  END IF;
  DELETE FROM atlas_reports stored
   WHERE stored.report_number = substr(target_public_id, 3)::bigint
     AND stored.participant_key = target_participant_key
  RETURNING stored.report_number INTO removed;
  IF removed IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM atlas_placements stored WHERE stored.item_number = target_public_id;
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION take_down_atlas_report(text, text) FROM PUBLIC;

-- "It worked for me too" ('worked'), "it didn't" ('did_not'), or null to take the answer back, on a published report
-- someone else wrote. Returns the report's totals after it.
CREATE OR REPLACE FUNCTION set_atlas_report_answer(
  target_participant_key text,
  target_public_id text,
  new_answer text,
  answer_time timestamptz
)
RETURNS TABLE (worked bigint, did_not bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_reports%ROWTYPE;
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$'
     OR target_public_id IS NULL OR target_public_id !~ '^R-[1-9][0-9]{3,}$'
     OR (new_answer IS NOT NULL AND new_answer NOT IN ('worked', 'did_not')) OR answer_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
  END IF;
  SELECT * INTO target FROM atlas_reports stored
   WHERE stored.report_number = substr(target_public_id, 3)::bigint
   FOR SHARE;
  IF NOT FOUND OR target.state <> 'published' THEN
    RAISE EXCEPTION 'ATLAS_REPORT_NOT_SHOWN';
  END IF;
  IF target.participant_key = target_participant_key THEN
    RAISE EXCEPTION 'ATLAS_REPORT_OWN';
  END IF;
  IF new_answer IS NULL THEN
    DELETE FROM atlas_report_answers stored
     WHERE stored.report_number = target.report_number AND stored.participant_key = target_participant_key;
  ELSE
    INSERT INTO atlas_report_answers AS stored (report_number, participant_key, answer, answered_at)
    VALUES (target.report_number, target_participant_key, new_answer, answer_time)
    ON CONFLICT (report_number, participant_key) DO UPDATE
      SET answer = EXCLUDED.answer, answered_at = EXCLUDED.answered_at;
  END IF;
  RETURN QUERY
  SELECT count(*) FILTER (WHERE stored.answer = 'worked'), count(*) FILTER (WHERE stored.answer = 'did_not')
    FROM atlas_report_answers stored
   WHERE stored.report_number = target.report_number;
END
$function$;

REVOKE ALL ON FUNCTION set_atlas_report_answer(text, text, text, timestamptz) FROM PUBLIC;

-- Deleting everything a participant holds, for reports: their reports (with their answers and places) and their
-- answers on other reports.
CREATE OR REPLACE FUNCTION forget_atlas_reports(target_participant_key text)
RETURNS TABLE (reports_deleted bigint, answers_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  report_rows bigint;
  answer_rows bigint;
BEGIN
  IF target_participant_key IS NULL OR target_participant_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
  END IF;
  DELETE FROM atlas_placements stored
   WHERE stored.item_number IN (SELECT 'R-' || own.report_number::text FROM atlas_reports own
                                 WHERE own.participant_key = target_participant_key);
  DELETE FROM atlas_reports stored WHERE stored.participant_key = target_participant_key;
  GET DIAGNOSTICS report_rows = ROW_COUNT;
  DELETE FROM atlas_report_answers stored WHERE stored.participant_key = target_participant_key;
  GET DIAGNOSTICS answer_rows = ROW_COUNT;
  RETURN QUERY SELECT report_rows, answer_rows;
END
$function$;

REVOKE ALL ON FUNCTION forget_atlas_reports(text) FROM PUBLIC;

-- The review role -----------------------------------------------------------------------------------------------------

-- Reports in one state (received by default: the check's queue), oldest first, after a report number when given.
CREATE OR REPLACE FUNCTION inspect_atlas_reports(state_filter text, after_number bigint, row_limit integer)
RETURNS TABLE (
  report_number bigint, door text, display_name text, problem text, tried text, dose text, how_used text,
  how_long text, what_happened text, how_long_lasted text, side_effects text, other_changes text, research jsonb,
  state text, ai_warning text, hold_reason text, refuse_reason text, received_at timestamptz,
  checked_at timestamptz, answers_worked bigint, answers_did_not bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF state_filter IS NULL OR state_filter NOT IN ('received', 'published', 'held', 'refused')
     OR row_limit IS NULL OR row_limit NOT BETWEEN 1 AND 20
  THEN
    RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT stored.report_number, stored.door, stored.display_name, stored.problem, stored.tried, stored.dose,
         stored.how_used, stored.how_long, stored.what_happened, stored.how_long_lasted, stored.side_effects,
         stored.other_changes, stored.research, stored.state, stored.ai_warning, stored.hold_reason,
         stored.refuse_reason, stored.received_at, stored.checked_at,
         (SELECT count(*) FROM atlas_report_answers answer
           WHERE answer.report_number = stored.report_number AND answer.answer = 'worked'),
         (SELECT count(*) FROM atlas_report_answers answer
           WHERE answer.report_number = stored.report_number AND answer.answer = 'did_not')
    FROM atlas_reports stored
   WHERE stored.state = state_filter AND (after_number IS NULL OR stored.report_number > after_number)
   ORDER BY stored.report_number
   LIMIT row_limit;
END
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_reports(text, bigint, integer) FROM PUBLIC;

-- The check's verdict on a received report, or the owner's word on a held one ('publish', 'publish_with_warning',
-- 'hold' or 'refuse'; a held report cannot be held again). Publishing places it under the subcategory given; refusing
-- deletes its text. Returns the report's state after it; no row when no report has that id.
CREATE OR REPLACE FUNCTION decide_atlas_report(
  target_public_id text,
  verdict text,
  warning_text text,
  reason text,
  research_block jsonb,
  category text,
  subcategory text,
  decide_time timestamptz
)
RETURNS TABLE (report_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_reports%ROWTYPE;
BEGIN
  IF target_public_id IS NULL OR target_public_id !~ '^R-[1-9][0-9]{3,}$'
     OR verdict IS NULL OR verdict NOT IN ('publish', 'publish_with_warning', 'hold', 'refuse')
     OR (verdict = 'publish_with_warning') <> (warning_text IS NOT NULL)
     OR (verdict = 'hold' AND (reason IS NULL OR reason NOT IN ('not_safe', 'unsure', 'too_far_out')))
     OR (verdict = 'refuse' AND (reason IS NULL OR reason NOT IN ('promotion', 'spam', 'not_a_report')))
     OR (verdict IN ('publish', 'publish_with_warning') AND reason IS NOT NULL)
     OR (verdict IN ('publish', 'publish_with_warning')) <> (category IS NOT NULL AND subcategory IS NOT NULL)
     OR (category IS NOT NULL AND category !~ '^[a-z][a-z0-9-]{0,59}$')
     OR (subcategory IS NOT NULL AND subcategory !~ '^[a-z][a-z0-9-]{0,59}$')
     OR (research_block IS NOT NULL AND jsonb_typeof(research_block) <> 'object')
     OR decide_time IS NULL
  THEN
    RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
  END IF;
  SELECT * INTO target FROM atlas_reports stored
   WHERE stored.report_number = substr(target_public_id, 3)::bigint
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF target.state NOT IN ('received', 'held') OR (target.state = 'held' AND verdict = 'hold') THEN
    RAISE EXCEPTION 'ATLAS_REPORT_ALREADY_DECIDED';
  END IF;
  IF verdict = 'refuse' THEN
    UPDATE atlas_reports stored
       SET display_name = NULL, problem = NULL, tried = NULL, dose = NULL, how_used = NULL, how_long = NULL,
           what_happened = NULL, how_long_lasted = NULL, side_effects = NULL, other_changes = NULL, research = NULL,
           ai_warning = NULL, hold_reason = NULL, refuse_reason = reason, state = 'refused',
           checked_at = decide_time, state_changed_at = greatest(decide_time, stored.state_changed_at)
     WHERE stored.report_number = target.report_number;
  ELSE
    BEGIN
      UPDATE atlas_reports stored
         SET state = CASE WHEN verdict = 'hold' THEN 'held' ELSE 'published' END,
             ai_warning = CASE WHEN verdict = 'publish_with_warning' THEN warning_text
                               WHEN verdict = 'hold' THEN warning_text ELSE NULL END,
             hold_reason = CASE WHEN verdict = 'hold' THEN reason END,
             research = coalesce(research_block, stored.research),
             checked_at = decide_time,
             state_changed_at = greatest(decide_time, stored.state_changed_at)
       WHERE stored.report_number = target.report_number;
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'ATLAS_REPORT_INPUT_INVALID';
    END;
    IF verdict IN ('publish', 'publish_with_warning') THEN
      INSERT INTO atlas_placements AS stored (item_number, category_key, subcategory_key, placed_at)
      VALUES (target_public_id, category, subcategory, decide_time)
      ON CONFLICT (item_number) DO UPDATE
        SET category_key = EXCLUDED.category_key, subcategory_key = EXCLUDED.subcategory_key,
            placed_at = EXCLUDED.placed_at;
    END IF;
  END IF;
  RETURN QUERY SELECT stored.state FROM atlas_reports stored WHERE stored.report_number = target.report_number;
END
$function$;

REVOKE ALL ON FUNCTION decide_atlas_report(text, text, text, text, jsonb, text, text, timestamptz) FROM PUBLIC;

REVOKE ALL ON SEQUENCE atlas_report_number_seq FROM PUBLIC;
