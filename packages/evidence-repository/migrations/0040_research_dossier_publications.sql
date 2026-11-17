SET search_path TO __SCHEMA__, public;

-- AskRigor#477, stage 2 (owner answers 331a, 332a and 333a, 16 November 2026): a research dossier on the public Atlas.
-- Each saved dossier version (0037) may get one public copy: the public part of its payload, which the server makes,
-- with the topic it joins, under a public number D-1001 onward that never names the private ARD number. The researching
-- AI's own judgement decides (332a): a copy is written shown, marked "Not checked by supervisors yet", or held for
-- AskRigor's check when the AI is not highly confident, when a claim names a living person, or when it conflicts on an
-- important finding with a dossier already shown; the owner's review shows, holds, takes down or accepts it. Publishing
-- is one write: the copy is written in its final state, never shown and then kept.
--
-- Consent is the database's own: an account's copy is written only when its accepted notice is one that
-- research_dossier_public_notices lists. The table is empty, so nothing can be published: notice v7, which says that
-- dossiers appear on the Atlas, is added there by its release, on the owner's yes, never here.
--
-- The copy follows its private version: a withdrawn or rejected version's copy leaves the pages, and an erased
-- version's copy is erased with it, unless the owner had accepted it, which then stays, written without the person
-- (design 3.7). Losing access is treated like erasure for an accepted copy (Codex's review of stage 2, finding 5): its
-- dossier's copies are detached from the private versions and the account, and keep no record of where the research
-- ran; the account's unaccepted copies leave the pages. The pages' reader sees only the shown copies, through two views; it reads no table. Additive and safe to
-- run again: an earlier image never reads these tables, and the triggers keep the copies in step with what an earlier
-- image's revocation and forget_card do to the private versions.

CREATE SEQUENCE IF NOT EXISTS research_dossier_public_number_seq AS bigint START WITH 1001;

CREATE TABLE IF NOT EXISTS research_dossier_public_notices (
  notice_version text PRIMARY KEY CHECK (notice_version ~ '^free-contributor-v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  added_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS research_dossier_publications (
  public_number text PRIMARY KEY CHECK (public_number ~ '^D-[1-9][0-9]{3,}$'),
  -- The private dossier; NULL once detached, when its contributor lost access with an accepted copy.
  dossier_number text UNIQUE REFERENCES research_dossiers(dossier_number),
  created_at timestamptz NOT NULL,
  detached_at timestamptz,
  CHECK ((dossier_number IS NULL) = (detached_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS research_dossier_public_versions (
  public_number text NOT NULL REFERENCES research_dossier_publications(public_number),
  version_number integer NOT NULL CHECK (version_number >= 1),
  -- The private version it copies; NULL once detached (losing access, as erasure, cuts the link to the account).
  version_id uuid UNIQUE REFERENCES research_dossier_versions(version_id),
  detached_at timestamptz,
  state text NOT NULL CHECK (state IN ('shown', 'held', 'superseded', 'taken_down', 'erased')),
  topic_key text CHECK (topic_key IS NULL OR topic_key ~ '^[a-z0-9][a-z0-9._-]{0,199}$'),
  related_topic_keys text[] NOT NULL DEFAULT '{}' CHECK (cardinality(related_topic_keys) <= 10),
  public_payload jsonb CHECK (public_payload IS NULL OR jsonb_typeof(public_payload) = 'object'),
  public_sha256 char(64) CHECK (public_sha256 IS NULL OR public_sha256 ~ '^[a-f0-9]{64}$'),
  hold_reasons text[] NOT NULL DEFAULT '{}' CHECK (hold_reasons <@ ARRAY['not_high_confidence', 'names_living_people',
    'living_people_undeclared', 'important_conflict', 'owner_hold', 'privacy_reading_pending']::text[]),
  conflicts_with text[] NOT NULL DEFAULT '{}' CHECK (cardinality(conflicts_with) <= 50),
  -- Where the research ran (332a: the plugin, ChatGPT or the runner), for the review only; never on a page.
  origin jsonb NOT NULL CHECK (jsonb_typeof(origin) = 'object'),
  -- Whether AskRigor's semantic privacy reading passed exactly the saved content; a copy without it never shows
  -- (Codex's review of stage 2, finding 1).
  privacy_read boolean NOT NULL,
  -- A claim names a living person (the AI's declaration). Such a copy shows only on the owner's own decision, with
  -- who decided, when and the reason he typed (Codex's review of stage 2, finding 2); nothing else clears it.
  names_living_person boolean NOT NULL,
  living_person_decided_by text CHECK (living_person_decided_by ~ '^reviewer:[0-9a-f]{16}$'),
  living_person_decided_at timestamptz,
  living_person_reason text CHECK (living_person_reason = btrim(living_person_reason)
    AND length(living_person_reason) BETWEEN 1 AND 200),
  accepted_at timestamptz,
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  erased_at timestamptz,
  PRIMARY KEY (public_number, version_number),
  CHECK ((version_id IS NULL) = (detached_at IS NOT NULL)),
  CHECK (version_id IS NOT NULL OR origin = '{}'::jsonb),
  CHECK ((state = 'erased') = (erased_at IS NOT NULL)),
  CHECK ((erased_at IS NULL) = (public_payload IS NOT NULL AND public_sha256 IS NOT NULL AND topic_key IS NOT NULL)),
  CHECK (state <> 'held' OR cardinality(hold_reasons) > 0),
  CHECK (state <> 'shown' OR privacy_read),
  CHECK ((living_person_decided_at IS NULL) = (living_person_decided_by IS NULL)
    AND (living_person_decided_at IS NULL) = (living_person_reason IS NULL)),
  CHECK (living_person_decided_at IS NULL OR names_living_person),
  CHECK (state <> 'shown' OR NOT names_living_person OR living_person_decided_at IS NOT NULL),
  CHECK (accepted_at IS NULL OR state IN ('shown', 'superseded', 'taken_down'))
);

-- At most one shown copy per dossier.
CREATE UNIQUE INDEX IF NOT EXISTS research_dossier_public_one_shown
  ON research_dossier_public_versions (public_number) WHERE state = 'shown';
CREATE INDEX IF NOT EXISTS research_dossier_public_topic_idx
  ON research_dossier_public_versions (topic_key) WHERE state IN ('shown', 'held');
CREATE INDEX IF NOT EXISTS research_dossier_public_state_idx
  ON research_dossier_public_versions (state, decided_at);

CREATE TABLE IF NOT EXISTS research_dossier_public_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_number text NOT NULL,
  version_number integer NOT NULL,
  event text NOT NULL CHECK (event IN ('shown', 'held', 'superseded', 'taken_down', 'accepted', 'erased',
    'living_person_decided', 'detached')),
  reason text CHECK (reason IS NULL OR (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 200)),
  happened_at timestamptz NOT NULL,
  FOREIGN KEY (public_number, version_number)
    REFERENCES research_dossier_public_versions (public_number, version_number)
);

CREATE INDEX IF NOT EXISTS research_dossier_public_events_version_idx
  ON research_dossier_public_events (public_number, version_number, event_id);

COMMENT ON TABLE research_dossier_public_notices IS
  'AskRigor#477 stage 2: the free contributor notices whose yes covers a dossier on the public Atlas. Empty until notice v7 is released on the owner''s yes.';
COMMENT ON TABLE research_dossier_publications IS
  'AskRigor#477 stage 2: a dossier''s public number (D-1001 onward), which never shows its private ARD number.';
COMMENT ON TABLE research_dossier_public_versions IS
  'One public copy per saved dossier version: shown (marked unreviewed until accepted), held for AskRigor''s check, superseded by a newer one, taken down, or erased with its private version.';
COMMENT ON COLUMN research_dossier_public_versions.origin IS
  'Where the research ran (owner answer 332a): the connector surface, whether the caller made the AI readings, and the runner''s own declaration. For the review only.';
COMMENT ON TABLE research_dossier_public_events IS
  'Append-only: shown, held, superseded, taken_down, accepted, erased, living_person_decided (the owner''s decision to show a copy whose claim names a living person), detached (its contributor lost access).';

-- A copy's content changes only by erasure; its state, its hold reasons and its acceptance change by the functions
-- below; it is never deleted.
CREATE OR REPLACE FUNCTION research_dossier_public_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  -- A copy's private version changes only by detaching it (NULL, once).
  IF (NEW.version_id IS DISTINCT FROM OLD.version_id AND NOT (OLD.version_id IS NOT NULL AND NEW.version_id IS NULL
       AND NEW.detached_at IS NOT NULL))
     OR NEW.detached_at IS DISTINCT FROM OLD.detached_at AND OLD.detached_at IS NOT NULL
     OR NEW.public_number <> OLD.public_number
     OR NEW.version_number <> OLD.version_number OR NEW.created_at <> OLD.created_at
     OR NEW.privacy_read <> OLD.privacy_read OR NEW.names_living_person <> OLD.names_living_person THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF OLD.erased_at IS NOT NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.erased_at IS NULL AND (NEW.public_payload IS DISTINCT FROM OLD.public_payload
     OR NEW.public_sha256 IS DISTINCT FROM OLD.public_sha256 OR NEW.topic_key IS DISTINCT FROM OLD.topic_key
     OR NEW.related_topic_keys IS DISTINCT FROM OLD.related_topic_keys
     -- The owner's decision on a named living person is made once and never changed.
     OR (OLD.living_person_decided_at IS NOT NULL AND (NEW.living_person_decided_at IS DISTINCT FROM
       OLD.living_person_decided_at OR NEW.living_person_decided_by IS DISTINCT FROM OLD.living_person_decided_by
       OR NEW.living_person_reason IS DISTINCT FROM OLD.living_person_reason))) THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_public_version_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS research_dossier_public_version_guard ON research_dossier_public_versions;
CREATE TRIGGER research_dossier_public_version_guard
  BEFORE UPDATE OR DELETE ON research_dossier_public_versions
  FOR EACH ROW EXECUTE FUNCTION research_dossier_public_version_guard();

DROP TRIGGER IF EXISTS append_only_guard ON research_dossier_public_events;
CREATE TRIGGER append_only_guard
  BEFORE UPDATE OR DELETE ON research_dossier_public_events
  FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation();

-- Writes one public copy of a saved version, already in its final state: shown, or held with its reasons. Only for an
-- active free contributor with card saving on whose accepted notice research_dossier_public_notices lists, checked
-- under the same account lock as the private append (0037), so a revocation, a change of mode or the saving switch
-- waits for it or wins. Only the newest version of one of the account's own dossiers, neither withdrawn, rejected nor
-- erased. A copy already written for the version is returned as it is (a retry). A shown copy supersedes the dossier's
-- older shown and held copies; a held one supersedes only older held ones, so a shown copy stays until its successor
-- is checked.
CREATE OR REPLACE FUNCTION publish_research_dossier_version(
  target_account_key text,
  target_version_id uuid,
  target_topic_key text,
  target_related_topic_keys text[],
  target_payload jsonb,
  target_payload_sha256 text,
  target_state text,
  target_hold_reasons text[],
  target_conflicts_with text[],
  target_origin jsonb,
  target_privacy_read boolean,
  change_time timestamptz
)
RETURNS TABLE (outcome text, public_number text, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  account_row record;
  version_row record;
  existing research_dossier_public_versions%ROWTYPE;
  number_text text;
  next_public bigint;
BEGIN
  IF target_account_key IS NULL OR target_account_key !~ '^[a-f0-9]{64}$'
     OR target_version_id IS NULL OR change_time IS NULL
     OR target_topic_key IS NULL OR target_topic_key !~ '^[a-z0-9][a-z0-9._-]{0,199}$'
     OR target_related_topic_keys IS NULL OR cardinality(target_related_topic_keys) > 10
     OR EXISTS (SELECT 1 FROM unnest(target_related_topic_keys) AS key WHERE key IS NULL
       OR key !~ '^[a-z0-9][a-z0-9._-]{0,199}$')
     OR target_payload IS NULL OR jsonb_typeof(target_payload) <> 'object'
     OR target_payload_sha256 IS NULL OR target_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR target_state IS NULL OR target_state NOT IN ('shown', 'held')
     OR target_hold_reasons IS NULL OR target_conflicts_with IS NULL
     OR (target_state = 'held') <> (cardinality(target_hold_reasons) > 0)
     OR NOT (target_hold_reasons <@ ARRAY['not_high_confidence', 'names_living_people', 'living_people_undeclared',
       'important_conflict', 'privacy_reading_pending']::text[])
     OR target_privacy_read IS NULL
     OR ('privacy_reading_pending' = ANY(target_hold_reasons)) = target_privacy_read
     OR cardinality(target_conflicts_with) > 50
     OR EXISTS (SELECT 1 FROM unnest(target_conflicts_with) AS other WHERE other IS NULL
       OR other !~ '^D-[1-9][0-9]{3,}$')
     OR target_origin IS NULL OR jsonb_typeof(target_origin) <> 'object'
     OR target_privacy_read IS NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLISH_INPUT_INVALID';
  END IF;

  SELECT account.status, account.mode, account.notice_version, account.findings_save
    INTO account_row
    FROM research_use_accounts account
   WHERE account.account_key = target_account_key
   FOR NO KEY UPDATE;
  IF NOT FOUND OR account_row.status <> 'ACTIVE' OR account_row.mode IS DISTINCT FROM 'FREE_CONTRIBUTOR'
     OR account_row.findings_save IS NOT TRUE
     OR NOT EXISTS (SELECT 1 FROM research_dossier_public_notices notice
       WHERE notice.notice_version = account_row.notice_version) THEN
    RETURN QUERY SELECT 'account_refused'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT stored.version_id, stored.dossier_number, stored.version_number, stored.erased_at
    INTO version_row
    FROM research_dossier_versions stored
    JOIN research_dossiers dossier ON dossier.dossier_number = stored.dossier_number
   WHERE stored.version_id = target_version_id AND dossier.account_key = target_account_key
     AND dossier.erased_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'version_refused'::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  -- Writers of one dossier queue, as the private append's do.
  PERFORM 1 FROM research_dossiers dossier WHERE dossier.dossier_number = version_row.dossier_number FOR UPDATE;

  SELECT * INTO existing FROM research_dossier_public_versions copy WHERE copy.version_id = target_version_id;
  IF FOUND THEN
    RETURN QUERY SELECT 'replayed'::text, existing.public_number, existing.state;
    RETURN;
  END IF;

  IF version_row.erased_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM research_dossier_versions newer
       WHERE newer.dossier_number = version_row.dossier_number AND newer.version_number > version_row.version_number)
     OR EXISTS (SELECT 1 FROM research_dossier_events event
       WHERE event.version_id = target_version_id AND event.event IN ('withdrawn', 'rejected', 'erased')) THEN
    RETURN QUERY SELECT 'version_refused'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT publication.public_number INTO number_text
    FROM research_dossier_publications publication WHERE publication.dossier_number = version_row.dossier_number;
  IF NOT FOUND THEN
    next_public := nextval('research_dossier_public_number_seq');
    number_text := 'D-' || next_public::text;
    INSERT INTO research_dossier_publications (public_number, dossier_number, created_at)
    VALUES (number_text, version_row.dossier_number, change_time);
  END IF;

  -- Older copies this one replaces, each with its event.
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  SELECT copy.public_number, copy.version_number, 'superseded', NULL, change_time
    FROM research_dossier_public_versions copy
   WHERE copy.public_number = number_text
     AND (copy.state = 'held' OR (target_state = 'shown' AND copy.state = 'shown'));
  UPDATE research_dossier_public_versions copy
     SET state = 'superseded', hold_reasons = '{}', decided_at = change_time
   WHERE copy.public_number = number_text
     AND (copy.state = 'held' OR (target_state = 'shown' AND copy.state = 'shown'));

  INSERT INTO research_dossier_public_versions (version_id, public_number, version_number, state, topic_key,
    related_topic_keys, public_payload, public_sha256, hold_reasons, conflicts_with, origin, privacy_read,
    names_living_person, decided_at, created_at)
  VALUES (target_version_id, number_text, version_row.version_number, target_state, target_topic_key,
    target_related_topic_keys, target_payload, target_payload_sha256, target_hold_reasons, target_conflicts_with,
    target_origin, target_privacy_read, 'names_living_people' = ANY(target_hold_reasons), change_time, change_time);
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  VALUES (number_text, version_row.version_number, target_state,
    CASE WHEN target_state = 'held' THEN array_to_string(target_hold_reasons, ' ') END, change_time);

  RETURN QUERY SELECT 'published'::text, number_text, target_state;
END
$function$;

REVOKE ALL ON FUNCTION publish_research_dossier_version(
  text, uuid, text, text[], jsonb, text, text, text[], text[], jsonb, boolean, timestamptz
) FROM PUBLIC;

-- The copies shown on a topic, for the conflict check of a new one (332a): their public numbers, dossiers and payloads.
CREATE OR REPLACE FUNCTION research_dossier_topic_publications(target_topic_key text)
RETURNS TABLE (public_number text, version_number integer, dossier_number text, public_payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT copy.public_number, copy.version_number, publication.dossier_number, copy.public_payload
    FROM research_dossier_public_versions copy
    JOIN research_dossier_publications publication ON publication.public_number = copy.public_number
   WHERE copy.topic_key = target_topic_key AND copy.state = 'shown' AND copy.erased_at IS NULL
   ORDER BY copy.public_number
   LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION research_dossier_topic_publications(text) FROM PUBLIC;

-- The review's list (the owner's, and AskRigor's check of held copies): newest decision first, in a state or every
-- state but erased. No account key; the question and the topic from the copy.
CREATE OR REPLACE FUNCTION list_research_dossier_publications(target_state text, target_limit integer)
RETURNS TABLE (public_number text, version_number integer, dossier_number text, state text, topic_key text,
  question text, hold_reasons text[], conflicts_with text[], origin jsonb, privacy_read boolean, accepted boolean,
  decided_at timestamptz, names_living_person boolean, living_person_decided_by text,
  living_person_decided_at timestamptz, living_person_reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF target_limit IS NULL OR target_limit < 1 OR target_limit > 200
     OR (target_state IS NOT NULL AND target_state NOT IN ('shown', 'held', 'superseded', 'taken_down', 'erased')) THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_REVIEW_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT copy.public_number, copy.version_number, publication.dossier_number, copy.state, copy.topic_key,
    copy.public_payload ->> 'question', copy.hold_reasons, copy.conflicts_with, copy.origin, copy.privacy_read,
    copy.accepted_at IS NOT NULL, copy.decided_at, copy.names_living_person, copy.living_person_decided_by,
    copy.living_person_decided_at, copy.living_person_reason
    FROM research_dossier_public_versions copy
    JOIN research_dossier_publications publication ON publication.public_number = copy.public_number
   WHERE (target_state IS NULL AND copy.state <> 'erased') OR copy.state = target_state
   ORDER BY copy.decided_at DESC, copy.public_number, copy.version_number DESC
   LIMIT target_limit;
END
$function$;

REVOKE ALL ON FUNCTION list_research_dossier_publications(text, integer) FROM PUBLIC;

-- Every copy of one dossier, with its payload, for the review's inspection.
CREATE OR REPLACE FUNCTION inspect_research_dossier_publication(target_public_number text)
RETURNS TABLE (public_number text, version_number integer, dossier_number text, state text, topic_key text,
  related_topic_keys text[], public_payload jsonb, public_sha256 text, hold_reasons text[], conflicts_with text[],
  origin jsonb, privacy_read boolean, accepted boolean, decided_at timestamptz, names_living_person boolean,
  living_person_decided_by text, living_person_decided_at timestamptz, living_person_reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT copy.public_number, copy.version_number, publication.dossier_number, copy.state, copy.topic_key,
    copy.related_topic_keys, copy.public_payload, copy.public_sha256::text, copy.hold_reasons, copy.conflicts_with,
    copy.origin, copy.privacy_read, copy.accepted_at IS NOT NULL, copy.decided_at, copy.names_living_person,
    copy.living_person_decided_by, copy.living_person_decided_at, copy.living_person_reason
    FROM research_dossier_public_versions copy
    JOIN research_dossier_publications publication ON publication.public_number = copy.public_number
   WHERE copy.public_number = target_public_number
   ORDER BY copy.version_number DESC;
$function$;

REVOKE ALL ON FUNCTION inspect_research_dossier_publication(text) FROM PUBLIC;

-- The review's decision on one copy: show (a held or taken-down copy), hold (send a shown copy the owner has not
-- accepted back for the check), take_down, or accept (it shows, checked by supervisors). Only the dossier's newest copy can be shown or accepted, and
-- only while its private version is neither withdrawn, rejected nor erased and a privacy reading passed its saved
-- content; showing or accepting supersedes the dossier's other shown copy. A copy whose claim names a living person is
-- refused here until the owner's own decision (decide_research_dossier_living_person) has shown it.
CREATE OR REPLACE FUNCTION decide_research_dossier_publication(
  target_public_number text,
  target_version_number integer,
  target_decision text,
  target_reason text,
  change_time timestamptz
)
RETURNS TABLE (outcome text, state text, accepted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  copy_row research_dossier_public_versions%ROWTYPE;
  newest integer;
  next_state text;
BEGIN
  IF target_public_number IS NULL OR target_public_number !~ '^D-[1-9][0-9]{3,}$'
     OR target_version_number IS NULL OR target_version_number < 1
     OR target_decision IS NULL OR target_decision NOT IN ('show', 'hold', 'take_down', 'accept')
     OR (target_reason IS NOT NULL AND (target_reason <> btrim(target_reason) OR length(target_reason) NOT BETWEEN 1 AND 200))
     OR change_time IS NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_REVIEW_INPUT_INVALID';
  END IF;
  -- One decision on a dossier at a time.
  PERFORM 1 FROM research_dossier_publications publication
   WHERE publication.public_number = target_public_number FOR UPDATE;
  SELECT * INTO copy_row FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number AND copy.version_number = target_version_number
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;
  SELECT max(copy.version_number) INTO newest FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number;

  IF copy_row.state = 'erased'
     OR (target_decision = 'hold' AND (copy_row.state <> 'shown' OR copy_row.accepted_at IS NOT NULL))
     OR (target_decision = 'take_down' AND copy_row.state NOT IN ('shown', 'held'))
     OR (target_decision = 'show' AND copy_row.state NOT IN ('held', 'taken_down'))
     OR (target_decision = 'accept' AND copy_row.state NOT IN ('shown', 'held', 'taken_down'))
     OR (target_decision IN ('show', 'accept') AND (copy_row.version_number <> newest OR NOT copy_row.privacy_read
       OR (copy_row.names_living_person AND copy_row.living_person_decided_at IS NULL)
       OR (copy_row.accepted_at IS NULL AND (copy_row.version_id IS NULL OR EXISTS (SELECT 1 FROM research_dossier_events event
         WHERE event.version_id = copy_row.version_id AND event.event IN ('withdrawn', 'rejected', 'erased')))))) THEN
    RETURN QUERY SELECT 'not_decidable'::text, copy_row.state, copy_row.accepted_at IS NOT NULL;
    RETURN;
  END IF;

  next_state := CASE target_decision WHEN 'hold' THEN 'held' WHEN 'take_down' THEN 'taken_down' ELSE 'shown' END;
  IF next_state = 'shown' THEN
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    SELECT copy.public_number, copy.version_number, 'superseded', NULL, change_time FROM research_dossier_public_versions copy
     WHERE copy.public_number = target_public_number AND copy.state = 'shown'
       AND copy.version_number <> copy_row.version_number;
    UPDATE research_dossier_public_versions copy SET state = 'superseded', decided_at = change_time
     WHERE copy.public_number = target_public_number AND copy.state = 'shown'
       AND copy.version_number <> copy_row.version_number;
  END IF;
  UPDATE research_dossier_public_versions copy
     SET state = next_state,
         hold_reasons = CASE WHEN next_state = 'held' THEN ARRAY['owner_hold']::text[]
           WHEN next_state = 'shown' THEN '{}'::text[] ELSE copy.hold_reasons END,
         accepted_at = CASE WHEN target_decision = 'accept' THEN coalesce(copy.accepted_at, change_time)
           ELSE copy.accepted_at END,
         decided_at = change_time
   WHERE copy.public_number = copy_row.public_number AND copy.version_number = copy_row.version_number;
  IF copy_row.state <> next_state THEN
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    VALUES (copy_row.public_number, copy_row.version_number, next_state, target_reason, change_time);
  END IF;
  IF target_decision = 'accept' AND copy_row.accepted_at IS NULL THEN
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    VALUES (copy_row.public_number, copy_row.version_number, 'accepted', target_reason, change_time);
  END IF;
  RETURN QUERY SELECT 'decided'::text, next_state,
    target_decision = 'accept' OR copy_row.accepted_at IS NOT NULL;
END
$function$;

REVOKE ALL ON FUNCTION decide_research_dossier_publication(text, integer, text, text, timestamptz) FROM PUBLIC;

-- The owner's own decision to show a copy held because a claim names a living person (his standing rule: such claims
-- are published only on his explicit decision; Codex's review of stage 2, finding 2). It needs his typed reason and
-- records who decided (the reviewer login's digest) and when, once; nothing else clears the hold. Only the dossier's
-- newest copy, held or taken down, whose private version is neither withdrawn, rejected nor erased and whose saved
-- content a privacy reading passed; it shows the copy and supersedes the dossier's other shown copy.
CREATE OR REPLACE FUNCTION decide_research_dossier_living_person(
  target_public_number text,
  target_version_number integer,
  target_reason text,
  target_decided_by text,
  change_time timestamptz
)
RETURNS TABLE (outcome text, state text, accepted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  copy_row research_dossier_public_versions%ROWTYPE;
  newest integer;
BEGIN
  IF target_public_number IS NULL OR target_public_number !~ '^D-[1-9][0-9]{3,}$'
     OR target_version_number IS NULL OR target_version_number < 1
     OR target_reason IS NULL OR target_reason <> btrim(target_reason) OR length(target_reason) NOT BETWEEN 1 AND 200
     OR target_decided_by IS NULL OR target_decided_by !~ '^reviewer:[0-9a-f]{16}$'
     OR change_time IS NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_REVIEW_INPUT_INVALID';
  END IF;
  PERFORM 1 FROM research_dossier_publications publication
   WHERE publication.public_number = target_public_number FOR UPDATE;
  SELECT * INTO copy_row FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number AND copy.version_number = target_version_number
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;
  SELECT max(copy.version_number) INTO newest FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number;
  IF NOT copy_row.names_living_person OR copy_row.living_person_decided_at IS NOT NULL
     OR copy_row.state NOT IN ('held', 'taken_down') OR copy_row.version_number <> newest OR NOT copy_row.privacy_read
     OR (copy_row.accepted_at IS NULL AND (copy_row.version_id IS NULL OR EXISTS (SELECT 1 FROM research_dossier_events event
       WHERE event.version_id = copy_row.version_id AND event.event IN ('withdrawn', 'rejected', 'erased')))) THEN
    RETURN QUERY SELECT 'not_decidable'::text, copy_row.state, copy_row.accepted_at IS NOT NULL;
    RETURN;
  END IF;
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  SELECT copy.public_number, copy.version_number, 'superseded', NULL, change_time FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number AND copy.state = 'shown'
     AND copy.version_number <> copy_row.version_number;
  UPDATE research_dossier_public_versions copy SET state = 'superseded', decided_at = change_time
   WHERE copy.public_number = target_public_number AND copy.state = 'shown'
     AND copy.version_number <> copy_row.version_number;
  UPDATE research_dossier_public_versions copy
     SET state = 'shown', hold_reasons = '{}', living_person_decided_by = target_decided_by,
         living_person_decided_at = change_time, living_person_reason = target_reason, decided_at = change_time
   WHERE copy.public_number = copy_row.public_number AND copy.version_number = copy_row.version_number;
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  VALUES (copy_row.public_number, copy_row.version_number, 'living_person_decided', target_reason, change_time),
         (copy_row.public_number, copy_row.version_number, 'shown', target_reason, change_time);
  RETURN QUERY SELECT 'decided'::text, 'shown'::text, copy_row.accepted_at IS NOT NULL;
END
$function$;

REVOKE ALL ON FUNCTION decide_research_dossier_living_person(text, integer, text, text, timestamptz) FROM PUBLIC;

-- The copy follows its private version, whatever image records the change: a withdrawn or rejected version's copy
-- leaves the pages (taken down) unless the owner accepted it, and an erased version's copy is erased with it unless
-- the owner accepted it; an accepted copy then keeps nothing of where the research ran.
CREATE OR REPLACE FUNCTION research_dossier_public_follow_private()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF NEW.event IN ('withdrawn', 'rejected') THEN
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    SELECT copy.public_number, copy.version_number, 'taken_down', 'private_version_' || NEW.event, NEW.happened_at
      FROM research_dossier_public_versions copy
     WHERE copy.version_id = NEW.version_id AND copy.state IN ('shown', 'held') AND copy.accepted_at IS NULL;
    UPDATE research_dossier_public_versions copy SET state = 'taken_down', decided_at = NEW.happened_at
     WHERE copy.version_id = NEW.version_id AND copy.state IN ('shown', 'held') AND copy.accepted_at IS NULL;
  ELSIF NEW.event = 'erased' THEN
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    SELECT copy.public_number, copy.version_number, 'erased', 'deletion_requested', NEW.happened_at
      FROM research_dossier_public_versions copy
     WHERE copy.version_id = NEW.version_id AND copy.erased_at IS NULL AND copy.accepted_at IS NULL;
    UPDATE research_dossier_public_versions copy
       SET state = 'erased', public_payload = NULL, public_sha256 = NULL, topic_key = NULL, related_topic_keys = '{}',
           hold_reasons = '{}', conflicts_with = '{}', origin = '{}'::jsonb, living_person_decided_by = NULL,
           living_person_decided_at = NULL, living_person_reason = NULL, erased_at = NEW.happened_at,
           decided_at = NEW.happened_at
     WHERE copy.version_id = NEW.version_id AND copy.erased_at IS NULL AND copy.accepted_at IS NULL;
    UPDATE research_dossier_public_versions copy SET origin = '{}'::jsonb
     WHERE copy.version_id = NEW.version_id AND copy.erased_at IS NULL AND copy.accepted_at IS NOT NULL;
  END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_public_follow_private() FROM PUBLIC;

DROP TRIGGER IF EXISTS research_dossier_public_follow_private ON research_dossier_events;
CREATE TRIGGER research_dossier_public_follow_private
  AFTER INSERT ON research_dossier_events
  FOR EACH ROW WHEN (NEW.event IN ('withdrawn', 'rejected', 'erased'))
  EXECUTE FUNCTION research_dossier_public_follow_private();

-- Losing access is treated like erasure for an accepted copy (Codex's review of stage 2, finding 5): when an account is
-- revoked, every unaccepted shown or held copy of its dossiers leaves the pages, whatever its private version's events
-- (a version the owner reviewed privately is not withdrawn), and every copy of a dossier with an accepted copy is
-- detached: no private version, no private dossier and no record of where its research ran, so nothing ties the public
-- copy to the account. The accepted copy stays, written without the person; that dossier's unaccepted copies are erased
-- as they are detached, since a later deletion request could no longer find them. On the same revocation as 0037's
-- trigger.
CREATE OR REPLACE FUNCTION research_dossier_public_on_revocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  change_time timestamptz := coalesce(NEW.revoked_at, clock_timestamp());
  target_number text;
BEGIN
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  SELECT copy.public_number, copy.version_number, 'taken_down', 'contributor_access_revoked', change_time
    FROM research_dossier_public_versions copy
    JOIN research_dossier_versions stored ON stored.version_id = copy.version_id
    JOIN research_dossiers dossier ON dossier.dossier_number = stored.dossier_number
   WHERE dossier.account_key = NEW.account_key AND copy.state IN ('shown', 'held') AND copy.accepted_at IS NULL;
  UPDATE research_dossier_public_versions copy SET state = 'taken_down', decided_at = change_time
    FROM research_dossier_versions stored, research_dossiers dossier
   WHERE stored.version_id = copy.version_id AND dossier.dossier_number = stored.dossier_number
     AND dossier.account_key = NEW.account_key AND copy.state IN ('shown', 'held') AND copy.accepted_at IS NULL;
  FOR target_number IN
    SELECT publication.public_number FROM research_dossier_publications publication
      JOIN research_dossiers dossier ON dossier.dossier_number = publication.dossier_number
     WHERE dossier.account_key = NEW.account_key
       AND EXISTS (SELECT 1 FROM research_dossier_public_versions copy
         WHERE copy.public_number = publication.public_number AND copy.accepted_at IS NOT NULL)
     ORDER BY publication.public_number
     FOR UPDATE OF publication
  LOOP
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    SELECT copy.public_number, copy.version_number, 'erased', 'contributor_access_revoked', change_time
      FROM research_dossier_public_versions copy
     WHERE copy.public_number = target_number AND copy.accepted_at IS NULL AND copy.erased_at IS NULL;
    UPDATE research_dossier_public_versions copy
       SET state = 'erased', public_payload = NULL, public_sha256 = NULL, topic_key = NULL, related_topic_keys = '{}',
           hold_reasons = '{}', conflicts_with = '{}', origin = '{}'::jsonb, living_person_decided_by = NULL,
           living_person_decided_at = NULL, living_person_reason = NULL, erased_at = change_time,
           decided_at = change_time, version_id = NULL, detached_at = change_time
     WHERE copy.public_number = target_number AND copy.accepted_at IS NULL AND copy.erased_at IS NULL;
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    SELECT copy.public_number, copy.version_number, 'detached', 'contributor_access_revoked', change_time
      FROM research_dossier_public_versions copy
     WHERE copy.public_number = target_number AND copy.version_id IS NOT NULL AND copy.erased_at IS NULL;
    UPDATE research_dossier_public_versions copy
       SET version_id = NULL, detached_at = change_time, origin = '{}'::jsonb
     WHERE copy.public_number = target_number AND copy.version_id IS NOT NULL AND copy.erased_at IS NULL;
    UPDATE research_dossier_publications publication SET dossier_number = NULL, detached_at = change_time
     WHERE publication.public_number = target_number;
  END LOOP;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_public_on_revocation() FROM PUBLIC;

DROP TRIGGER IF EXISTS research_dossier_public_on_revocation ON research_use_accounts;
CREATE TRIGGER research_dossier_public_on_revocation
  AFTER UPDATE OF status, revoked_at ON research_use_accounts
  FOR EACH ROW WHEN (NEW.status = 'REVOKED'
    AND (OLD.status IS DISTINCT FROM 'REVOKED' OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at))
  EXECUTE FUNCTION research_dossier_public_on_revocation();

-- What the pages read, as the reader role: the shown copies, and the shown dossiers' history. The view holds the
-- private version's state too, so a copy whose version was withdrawn, rejected or erased never shows, even if a
-- trigger had not run; an accepted copy shows as the owner accepted it.
CREATE OR REPLACE VIEW research_dossier_public_pages WITH (security_barrier = true) AS
SELECT copy.public_number, copy.version_number, copy.topic_key, copy.related_topic_keys, copy.public_payload,
  copy.public_sha256, copy.accepted_at IS NOT NULL AS accepted, copy.decided_at AS shown_at, copy.conflicts_with
  FROM research_dossier_public_versions copy
 WHERE copy.state = 'shown' AND copy.erased_at IS NULL
   AND (copy.accepted_at IS NOT NULL OR (copy.version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM research_dossier_events event
     WHERE event.version_id = copy.version_id AND event.event IN ('withdrawn', 'rejected', 'erased'))));

CREATE OR REPLACE VIEW research_dossier_public_history WITH (security_barrier = true) AS
SELECT copy.public_number, copy.version_number, copy.state, copy.accepted_at IS NOT NULL AS accepted,
  copy.decided_at
  FROM research_dossier_public_versions copy
 WHERE copy.state IN ('shown', 'superseded') AND copy.erased_at IS NULL
   AND EXISTS (SELECT 1 FROM research_dossier_public_pages shown WHERE shown.public_number = copy.public_number);

COMMENT ON VIEW research_dossier_public_pages IS
  'AskRigor#477 stage 2: the dossier copies the public Atlas shows, for the pages'' reader role.';
COMMENT ON VIEW research_dossier_public_history IS
  'AskRigor#477 stage 2: each shown dossier''s shown and superseded copies, without their content, for its history.';

REVOKE ALL ON TABLE research_dossier_public_notices FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_publications FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_versions FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_events FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_pages FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_history FROM PUBLIC;
REVOKE ALL ON SEQUENCE research_dossier_public_number_seq FROM PUBLIC;
-- The reader's default table grants must not expose a held copy, a private origin or the notices list; it reads the
-- two views only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE research_dossier_public_notices FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_publications FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_public_versions FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_public_events FROM askrigor_reader;
    REVOKE ALL ON SEQUENCE research_dossier_public_number_seq FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_public_pages FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_public_history FROM askrigor_reader;
    GRANT SELECT ON TABLE research_dossier_public_pages TO askrigor_reader;
    GRANT SELECT ON TABLE research_dossier_public_history TO askrigor_reader;
  END IF;
END
$$;
