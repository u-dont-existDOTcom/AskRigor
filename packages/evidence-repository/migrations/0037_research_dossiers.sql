SET search_path TO __SCHEMA__, public;

-- AskRigor#477, stage 1 (owner answer 329a, 16 November 2026): a free contributor's research dossier, saved privately
-- for the owner's review under notice v6, which covers its twelve parts. One dossier per account, research target and
-- question (dossier_key, an HMAC the server makes); one version per research run that saves; nothing is ever shown on
-- a page. Versions never change except by erasure, which clears every part of them that holds the research or ties it
-- to the account; what happened to each version (submitted, withdrawn when the account is revoked, accepted or
-- rejected by the owner, erased) is an append-only event. The research-access role appends and reads back only through
-- the functions below, and the review role erases; neither can read or change a table, and PUBLIC and the canonical
-- reader get nothing. Additive and safe to run again: an earlier image never reads these tables.

CREATE SEQUENCE IF NOT EXISTS research_dossier_number_seq AS bigint START WITH 1;

CREATE TABLE IF NOT EXISTS research_dossiers (
  dossier_number text PRIMARY KEY CHECK (dossier_number ~ '^ARD-[0-9]{4,}$'),
  dossier_key char(64) UNIQUE CHECK (dossier_key ~ '^[a-f0-9]{64}$'),
  account_key char(64) REFERENCES research_use_accounts(account_key) ON DELETE SET NULL,
  thread_key char(64) CHECK (thread_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  erased_at timestamptz,
  CHECK ((erased_at IS NULL) = (dossier_key IS NOT NULL)),
  CHECK (erased_at IS NULL OR (account_key IS NULL AND thread_key IS NULL))
);

CREATE INDEX IF NOT EXISTS research_dossiers_thread_idx
  ON research_dossiers (thread_key) WHERE thread_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS research_dossiers_account_idx
  ON research_dossiers (account_key) WHERE account_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS research_dossier_versions (
  version_id uuid PRIMARY KEY,
  dossier_number text NOT NULL REFERENCES research_dossiers(dossier_number),
  version_number integer NOT NULL CHECK (version_number >= 1),
  previous_version_id uuid UNIQUE REFERENCES research_dossier_versions(version_id),
  request_key char(64) UNIQUE CHECK (request_key ~ '^[a-f0-9]{64}$'),
  input_sha256 char(64) CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb CHECK (payload_json IS NULL OR jsonb_typeof(payload_json) = 'object'),
  payload_sha256 char(64) CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  card_number integer CHECK (card_number IS NULL OR card_number > 0),
  written_alongside boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  erased_at timestamptz,
  UNIQUE (dossier_number, version_number),
  CHECK ((version_number = 1) = (previous_version_id IS NULL)),
  CHECK ((erased_at IS NULL) = (payload_json IS NOT NULL)),
  CHECK ((erased_at IS NULL) = (request_key IS NOT NULL AND input_sha256 IS NOT NULL AND payload_sha256 IS NOT NULL)),
  CHECK (erased_at IS NULL OR card_number IS NULL)
);

-- One first version per dossier (as analysis_one_initial_version in 0001): a unique nullable predecessor alone would
-- admit several.
CREATE UNIQUE INDEX IF NOT EXISTS research_dossier_one_first_version
  ON research_dossier_versions (dossier_number) WHERE previous_version_id IS NULL;
CREATE INDEX IF NOT EXISTS research_dossier_versions_card_idx
  ON research_dossier_versions (card_number) WHERE card_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS research_dossier_identifiers (
  version_id uuid NOT NULL REFERENCES research_dossier_versions(version_id),
  scheme text NOT NULL CHECK (scheme IN ('doi', 'pmid', 'pmcid', 'nct')),
  value text NOT NULL CHECK (length(value) BETWEEN 1 AND 300),
  PRIMARY KEY (version_id, scheme, value)
);

CREATE INDEX IF NOT EXISTS research_dossier_identifiers_value_idx
  ON research_dossier_identifiers (scheme, value);

CREATE TABLE IF NOT EXISTS research_dossier_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES research_dossier_versions(version_id),
  event text NOT NULL CHECK (event IN ('submitted', 'withdrawn', 'accepted', 'rejected', 'erased')),
  reason text CHECK (reason IS NULL OR (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 200)),
  happened_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS research_dossier_events_version_idx
  ON research_dossier_events (version_id, event_id);

COMMENT ON TABLE research_dossiers IS
  'AskRigor#477 stage 1 (owner answer 329a): one private research dossier per account, research target and question, for the owner''s review; never shown on a page.';
COMMENT ON COLUMN research_dossiers.dossier_key IS
  'HMAC of the account key, the research target''s digest and the question''s key, made by the server; NULL once erased.';
COMMENT ON COLUMN research_dossiers.thread_key IS
  'The findings card''s research-thread key, so forget_card finds the dossier; NULL once erased.';
COMMENT ON TABLE research_dossier_versions IS
  'One version per research run that saved the dossier. Only erasure changes a row: it clears the payload, its digests, the request key and the card number.';
COMMENT ON COLUMN research_dossier_versions.request_key IS
  'Digest of the dossier key, the checked answer''s digest and the dossier''s own digest: a retry returns its original version.';
COMMENT ON COLUMN research_dossier_versions.written_alongside IS
  'True when another version landed between the start of this research''s final check and its save.';
COMMENT ON TABLE research_dossier_identifiers IS
  'Each study identifier a version names, for later lookup; deleted when the version is erased.';
COMMENT ON TABLE research_dossier_events IS
  'Append-only: submitted, withdrawn (the account was revoked), accepted, rejected, erased.';

-- A version changes only by erasure, and is never deleted.
CREATE OR REPLACE FUNCTION research_dossier_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL
     AND NEW.payload_json IS NULL AND NEW.payload_sha256 IS NULL AND NEW.request_key IS NULL
     AND NEW.input_sha256 IS NULL AND NEW.card_number IS NULL
     AND NEW.version_id = OLD.version_id AND NEW.dossier_number = OLD.dossier_number
     AND NEW.version_number = OLD.version_number
     AND NEW.previous_version_id IS NOT DISTINCT FROM OLD.previous_version_id
     AND NEW.written_alongside = OLD.written_alongside AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RESEARCH_DOSSIER_VERSION_IMMUTABLE' USING ERRCODE = '55000';
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_version_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS research_dossier_version_guard ON research_dossier_versions;
CREATE TRIGGER research_dossier_version_guard
  BEFORE UPDATE OR DELETE ON research_dossier_versions
  FOR EACH ROW EXECUTE FUNCTION research_dossier_version_guard();

DROP TRIGGER IF EXISTS append_only_guard ON research_dossier_events;
CREATE TRIGGER append_only_guard
  BEFORE UPDATE OR DELETE ON research_dossier_events
  FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation();

-- Appends one version for an active free contributor whose yes covers notice v6, with card saving on, checked in this
-- transaction. The dossier row is locked, so writers of one dossier queue. A request key already stored returns its
-- own version, and content equal to the newest version returns that version; neither writes anything.
CREATE OR REPLACE FUNCTION append_research_dossier_version(
  target_account_key text,
  target_dossier_key text,
  target_thread_key text,
  target_request_key text,
  target_input_sha256 text,
  target_payload jsonb,
  target_payload_sha256 text,
  target_card_number integer,
  target_identifiers jsonb,
  expected_previous_version_id uuid,
  target_version_id uuid,
  change_time timestamptz
)
RETURNS TABLE (
  outcome text,
  dossier_number text,
  version_number integer,
  version_id uuid,
  payload_sha256 text,
  written_alongside boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  account_row record;
  dossier_row research_dossiers%ROWTYPE;
  existing research_dossier_versions%ROWTYPE;
  latest research_dossier_versions%ROWTYPE;
  has_latest boolean;
  next_number integer;
  alongside boolean;
BEGIN
  IF target_account_key IS NULL OR target_account_key !~ '^[a-f0-9]{64}$'
     OR target_dossier_key IS NULL OR target_dossier_key !~ '^[a-f0-9]{64}$'
     OR target_thread_key IS NULL OR target_thread_key !~ '^[a-f0-9]{64}$'
     OR target_request_key IS NULL OR target_request_key !~ '^[a-f0-9]{64}$'
     OR target_input_sha256 IS NULL OR target_input_sha256 !~ '^[a-f0-9]{64}$'
     OR target_payload_sha256 IS NULL OR target_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR target_payload IS NULL OR jsonb_typeof(target_payload) <> 'object'
     OR target_identifiers IS NULL OR jsonb_typeof(target_identifiers) <> 'array'
     OR jsonb_array_length(target_identifiers) > 400
     OR (target_card_number IS NOT NULL AND target_card_number <= 0)
     OR target_version_id IS NULL OR change_time IS NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_INPUT_INVALID';
  END IF;

  SELECT account.status, account.mode, account.notice_version, account.findings_save
    INTO account_row
    FROM research_use_accounts account
   WHERE account.account_key = target_account_key
   FOR KEY SHARE;
  IF NOT FOUND OR account_row.status <> 'ACTIVE' OR account_row.mode IS DISTINCT FROM 'FREE_CONTRIBUTOR'
     OR account_row.notice_version IS DISTINCT FROM 'free-contributor-v6-2026-11-15'
     OR account_row.findings_save IS NOT TRUE THEN
    RETURN QUERY SELECT 'account_refused'::text, NULL::text, NULL::integer, NULL::uuid, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  SELECT * INTO dossier_row FROM research_dossiers stored WHERE stored.dossier_key = target_dossier_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO research_dossiers (dossier_number, dossier_key, account_key, thread_key, created_at)
    VALUES ('ARD-' || lpad(nextval('research_dossier_number_seq')::text, 4, '0'), target_dossier_key,
      target_account_key, target_thread_key, change_time)
    ON CONFLICT (dossier_key) DO NOTHING;
    SELECT * INTO dossier_row FROM research_dossiers stored WHERE stored.dossier_key = target_dossier_key FOR UPDATE;
  END IF;
  IF dossier_row.account_key IS DISTINCT FROM target_account_key
     OR dossier_row.thread_key IS DISTINCT FROM target_thread_key THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_IDENTITY_MISMATCH';
  END IF;

  SELECT * INTO existing FROM research_dossier_versions stored WHERE stored.request_key = target_request_key;
  IF FOUND THEN
    IF existing.dossier_number <> dossier_row.dossier_number OR existing.input_sha256 <> target_input_sha256 THEN
      RAISE EXCEPTION 'RESEARCH_DOSSIER_REQUEST_KEY_MISMATCH';
    END IF;
    RETURN QUERY SELECT 'replayed'::text, existing.dossier_number, existing.version_number, existing.version_id,
      existing.payload_sha256::text, existing.written_alongside;
    RETURN;
  END IF;

  SELECT * INTO latest FROM research_dossier_versions stored
   WHERE stored.dossier_number = dossier_row.dossier_number
   ORDER BY stored.version_number DESC
   LIMIT 1;
  has_latest := FOUND;
  IF has_latest AND latest.input_sha256 = target_input_sha256 THEN
    RETURN QUERY SELECT 'same_as_latest'::text, latest.dossier_number, latest.version_number, latest.version_id,
      latest.payload_sha256::text, latest.written_alongside;
    RETURN;
  END IF;
  next_number := CASE WHEN has_latest THEN latest.version_number + 1 ELSE 1 END;
  alongside := has_latest AND expected_previous_version_id IS DISTINCT FROM latest.version_id;

  INSERT INTO research_dossier_versions (version_id, dossier_number, version_number, previous_version_id, request_key,
    input_sha256, payload_json, payload_sha256, card_number, written_alongside, created_at)
  VALUES (target_version_id, dossier_row.dossier_number, next_number,
    CASE WHEN has_latest THEN latest.version_id END, target_request_key, target_input_sha256, target_payload,
    target_payload_sha256, target_card_number, alongside, change_time);
  INSERT INTO research_dossier_identifiers (version_id, scheme, value)
  SELECT target_version_id, item ->> 'scheme', item ->> 'value'
    FROM jsonb_array_elements(target_identifiers) AS item
  ON CONFLICT DO NOTHING;
  INSERT INTO research_dossier_events (version_id, event, reason, happened_at)
  VALUES (target_version_id, 'submitted', NULL, change_time);

  RETURN QUERY SELECT 'inserted'::text, dossier_row.dossier_number, next_number, target_version_id,
    target_payload_sha256, alongside;
END
$function$;

REVOKE ALL ON FUNCTION append_research_dossier_version(
  text, text, text, text, text, jsonb, text, integer, jsonb, uuid, uuid, timestamptz
) FROM PUBLIC;

-- The newest version of one of the account's dossiers, which the final check reads when it starts.
CREATE OR REPLACE FUNCTION latest_research_dossier_version(target_account_key text, target_dossier_key text)
RETURNS TABLE (version_id uuid, version_number integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT stored.version_id, stored.version_number
    FROM research_dossiers dossier
    JOIN research_dossier_versions stored ON stored.dossier_number = dossier.dossier_number
   WHERE dossier.dossier_key = target_dossier_key AND dossier.account_key = target_account_key
   ORDER BY stored.version_number DESC
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION latest_research_dossier_version(text, text) FROM PUBLIC;

-- Reads back one of the account's own versions exactly as stored, for the save's confirmation.
CREATE OR REPLACE FUNCTION read_research_dossier_version(target_account_key text, target_version_id uuid)
RETURNS TABLE (dossier_number text, version_number integer, payload_json jsonb, payload_sha256 text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT stored.dossier_number, stored.version_number, stored.payload_json, stored.payload_sha256::text
    FROM research_dossier_versions stored
    JOIN research_dossiers dossier ON dossier.dossier_number = stored.dossier_number
   WHERE stored.version_id = target_version_id AND dossier.account_key = target_account_key;
$function$;

REVOKE ALL ON FUNCTION read_research_dossier_version(text, uuid) FROM PUBLIC;

-- forget_card: erases every dossier of the research thread, and of any thread a version of which was saved with one of
-- the cards, leaving content-free rows and an 'erased' event. Returns how many versions it erased.
CREATE OR REPLACE FUNCTION erase_research_dossiers(
  target_thread_key text,
  target_card_numbers integer[],
  change_time timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  thread_keys text[];
  target_number text;
  erased_versions integer := 0;
  changed integer;
BEGIN
  IF (target_thread_key IS NOT NULL AND target_thread_key !~ '^[a-f0-9]{64}$')
     OR target_card_numbers IS NULL OR cardinality(target_card_numbers) > 1000
     OR EXISTS (SELECT 1 FROM unnest(target_card_numbers) AS given(number) WHERE given.number IS NULL OR given.number <= 0)
     OR (target_thread_key IS NULL AND cardinality(target_card_numbers) = 0)
     OR change_time IS NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_ERASE_INPUT_INVALID';
  END IF;
  SELECT array_agg(DISTINCT keys.thread_key) INTO thread_keys FROM (
    SELECT target_thread_key AS thread_key WHERE target_thread_key IS NOT NULL
    UNION
    SELECT dossier.thread_key::text
      FROM research_dossiers dossier
      JOIN research_dossier_versions stored ON stored.dossier_number = dossier.dossier_number
     WHERE stored.card_number = ANY(target_card_numbers) AND dossier.thread_key IS NOT NULL
  ) keys;
  IF thread_keys IS NULL THEN
    RETURN 0;
  END IF;
  FOR target_number IN
    SELECT dossier.dossier_number FROM research_dossiers dossier
     WHERE dossier.thread_key::text = ANY(thread_keys) AND dossier.erased_at IS NULL
     ORDER BY dossier.dossier_number
     FOR UPDATE
  LOOP
    DELETE FROM research_dossier_identifiers identifier
     USING research_dossier_versions stored
     WHERE identifier.version_id = stored.version_id AND stored.dossier_number = target_number;
    INSERT INTO research_dossier_events (version_id, event, reason, happened_at)
    SELECT stored.version_id, 'erased', 'deletion_requested', change_time
      FROM research_dossier_versions stored
     WHERE stored.dossier_number = target_number AND stored.erased_at IS NULL;
    UPDATE research_dossier_versions stored
       SET payload_json = NULL, payload_sha256 = NULL, request_key = NULL, input_sha256 = NULL, card_number = NULL,
           erased_at = change_time
     WHERE stored.dossier_number = target_number AND stored.erased_at IS NULL;
    GET DIAGNOSTICS changed = ROW_COUNT;
    erased_versions := erased_versions + changed;
    UPDATE research_dossiers dossier
       SET dossier_key = NULL, account_key = NULL, thread_key = NULL, erased_at = change_time
     WHERE dossier.dossier_number = target_number;
  END LOOP;
  RETURN erased_versions;
END
$function$;

REVOKE ALL ON FUNCTION erase_research_dossiers(text, integer[], timestamptz) FROM PUBLIC;

-- Revoking an account withdraws its dossier versions still waiting for review, as revocation withdraws its pending
-- proposals. A trigger, so an earlier image's revocation, which knows nothing of dossiers, withdraws them too.
CREATE OR REPLACE FUNCTION withdraw_research_dossiers_on_revocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  INSERT INTO research_dossier_events (version_id, event, reason, happened_at)
  SELECT stored.version_id, 'withdrawn', 'contributor_access_revoked', coalesce(NEW.revoked_at, clock_timestamp())
    FROM research_dossiers dossier
    JOIN research_dossier_versions stored ON stored.dossier_number = dossier.dossier_number
   WHERE dossier.account_key = NEW.account_key AND stored.erased_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM research_dossier_events event
        WHERE event.version_id = stored.version_id AND event.event <> 'submitted'
     );
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION withdraw_research_dossiers_on_revocation() FROM PUBLIC;

DROP TRIGGER IF EXISTS research_dossiers_withdraw_on_revocation ON research_use_accounts;
CREATE TRIGGER research_dossiers_withdraw_on_revocation
  AFTER UPDATE OF status ON research_use_accounts
  FOR EACH ROW WHEN (OLD.status = 'ACTIVE' AND NEW.status = 'REVOKED')
  EXECUTE FUNCTION withdraw_research_dossiers_on_revocation();

REVOKE ALL ON TABLE research_dossiers FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_versions FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_identifiers FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE research_dossier_number_seq FROM PUBLIC;
-- The canonical reader's default table grants must not expose a private dossier.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE research_dossiers FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_versions FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_identifiers FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_events FROM askrigor_reader;
    REVOKE ALL ON SEQUENCE research_dossier_number_seq FROM askrigor_reader;
  END IF;
END
$$;
