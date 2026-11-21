SET search_path TO __SCHEMA__, public;

-- Atlas news, stage 1 (the owner, 17 and 18 Nov 2026: "make sure these are auto-published on the site's atlas news
-- section"; "news sorted by impact with the verdict in the title and a list of "science news not worth reading"";
-- design v4 in the owner's private pages, sections 3.3 and 3.8; plan docs/superpowers/plans/2026-11-21-atlas-news-stage1.md).
-- Each day's news check stages the card its final check passed (stage_atlas_news_card, the research-access role, inside
-- finalize_research); one owner call a day commits the day (commit_atlas_news_day, the review role): its new items,
-- its seven-day order, its "not worth reading" lines and its footer, stored whole or not at all, never after the run's
-- deadline. In stage 1 committed items take the state 'shadow', which no page shows. No role has any right on the
-- tables: the research-access role stages through its one function, the review role commits, withdraws and inspects
-- through its three (the provisioning scripts grant exactly those), and PUBLIC and the canonical reader get nothing,
-- so no page can read a shadow item or a draft. Additive and safe to run again: an earlier image never reads these.

CREATE SEQUENCE IF NOT EXISTS atlas_news_number_seq AS bigint START WITH 1001 MINVALUE 1001 NO CYCLE;

CREATE TABLE IF NOT EXISTS atlas_news_items (
  news_number bigint PRIMARY KEY CHECK (news_number >= 1001),
  item_id text NOT NULL CHECK (item_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
  check_id text NOT NULL CHECK (check_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
  card jsonb NOT NULL CHECK (jsonb_typeof(card) = 'object' AND octet_length(card::text) <= 32768),
  card_sha256 text NOT NULL CHECK (card_sha256 ~ '^[a-f0-9]{64}$'),
  draft text NOT NULL CHECK (length(draft) BETWEEN 1 AND 60000),
  draft_sha256 text NOT NULL CHECK (draft_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_claims jsonb NOT NULL CHECK (jsonb_typeof(receipt_claims) = 'object'
    AND octet_length(receipt_claims::text) <= 40000),
  receipt_issued_at timestamptz NOT NULL,
  doi text CHECK (doi IS NULL OR (length(doi) <= 320 AND doi ~ '^10\.[0-9]{4,9}/\S+$')),
  staged_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('staged', 'shadow', 'kept_back', 'withdrawn')),
  item_kind text CHECK (item_kind IS NULL OR item_kind IN ('main', 'line')),
  kept_reasons jsonb CHECK (kept_reasons IS NULL OR (jsonb_typeof(kept_reasons) = 'array'
    AND jsonb_array_length(kept_reasons) BETWEEN 1 AND 20)),
  committed_day date,
  committed_version integer CHECK (committed_version IS NULL OR committed_version >= 1),
  reading jsonb CHECK (reading IS NULL OR (jsonb_typeof(reading) = 'object' AND octet_length(reading::text) <= 16000)),
  reading_model text CHECK (reading_model IS NULL OR length(reading_model) BETWEEN 1 AND 100),
  retraction_status text CHECK (retraction_status IS NULL OR retraction_status IN
    ('no_retraction_record_found', 'corrected_or_updated', 'expression_of_concern', 'retracted', 'unknown', 'no_doi')),
  withdrawn_reason text CHECK (withdrawn_reason IS NULL OR withdrawn_reason IN ('owner_unpublished', 'replaced')),
  owner_reason text CHECK (owner_reason IS NULL OR length(owner_reason) BETWEEN 1 AND 2000),
  changed_at timestamptz NOT NULL,
  CONSTRAINT atlas_news_items_card_once UNIQUE (item_id, card_sha256),
  CONSTRAINT atlas_news_items_v1_state_check CHECK (
    (state = 'staged') = (committed_day IS NULL AND item_kind IS NULL)
    OR state = 'withdrawn'
  ),
  CONSTRAINT atlas_news_items_v1_kept_check CHECK ((state = 'kept_back') = (kept_reasons IS NOT NULL)),
  CONSTRAINT atlas_news_items_v1_withdrawn_check CHECK ((state = 'withdrawn') = (withdrawn_reason IS NOT NULL)),
  CONSTRAINT atlas_news_items_v1_times_check CHECK (staged_at <= changed_at)
);

CREATE INDEX IF NOT EXISTS atlas_news_items_staged_idx ON atlas_news_items (staged_at);
CREATE INDEX IF NOT EXISTS atlas_news_items_committed_idx ON atlas_news_items (committed_day, committed_version);
CREATE INDEX IF NOT EXISTS atlas_news_items_item_idx ON atlas_news_items (item_id);

COMMENT ON TABLE atlas_news_items IS
  'Atlas news, stage 1: each news check''s card as its final check passed it, with its draft and the receipt''s news claims; committed by the owner''s day call; never shown in stage 1.';

CREATE TABLE IF NOT EXISTS atlas_news_days (
  news_day date NOT NULL,
  day_version integer NOT NULL CHECK (day_version >= 1),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  base_day date,
  base_version integer CHECK (base_version IS NULL OR base_version >= 1),
  rerank boolean NOT NULL,
  stored_order jsonb NOT NULL CHECK (jsonb_typeof(stored_order) = 'array' AND jsonb_array_length(stored_order) <= 200),
  moves jsonb NOT NULL CHECK (jsonb_typeof(moves) = 'array' AND octet_length(moves::text) <= 200000),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND octet_length(lines::text) <= 200000),
  footer jsonb CHECK (footer IS NULL OR (jsonb_typeof(footer) = 'object' AND octet_length(footer::text) <= 16000)),
  kept_back jsonb NOT NULL CHECK (jsonb_typeof(kept_back) = 'array'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (news_day, day_version),
  CONSTRAINT atlas_news_days_payload_once UNIQUE (news_day, payload_sha256),
  CONSTRAINT atlas_news_days_v1_base_check CHECK ((base_day IS NULL) = (base_version IS NULL)
    AND (base_day IS NULL OR base_day < news_day))
);

COMMENT ON TABLE atlas_news_days IS
  'Atlas news, stage 1: each day the owner''s day call committed, whole: its stored order, its lines and its footer.';

-- The access role's one function: stage a passing news check's card, idempotent on (item, card digest). At most 20
-- staged cards a UTC day, a bound should the dev-account test ever fail. Returns the card's news number, N-<n>.
CREATE OR REPLACE FUNCTION stage_atlas_news_card(new_item jsonb, stage_time timestamptz)
RETURNS TABLE (news_public_id text, staged_card_sha256 text, already_staged boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  field text;
  found_number bigint;
  next_number bigint;
  staged_today integer;
BEGIN
  IF new_item IS NULL OR jsonb_typeof(new_item) <> 'object' OR stage_time IS NULL
     OR jsonb_typeof(new_item -> 'card') IS DISTINCT FROM 'object'
     OR jsonb_typeof(new_item -> 'receiptClaims') IS DISTINCT FROM 'object'
     OR jsonb_typeof(new_item -> 'itemId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(new_item -> 'checkId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(new_item -> 'cardSha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(new_item -> 'draft') IS DISTINCT FROM 'string'
     OR jsonb_typeof(new_item -> 'draftSha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(new_item -> 'receiptIssuedAt') IS DISTINCT FROM 'string'
     OR (new_item ? 'doi' AND jsonb_typeof(new_item -> 'doi') NOT IN ('string', 'null'))
  THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END IF;
  FOR field IN SELECT jsonb_object_keys(new_item) LOOP
    IF field NOT IN ('itemId', 'checkId', 'card', 'cardSha256', 'draft', 'draftSha256', 'receiptClaims',
                     'receiptIssuedAt', 'doi') THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
  END LOOP;
  -- One staging at a time, so the day's count and the idempotency read see every earlier staging.
  PERFORM pg_advisory_xact_lock(hashtext('atlas_news_items'));
  SELECT stored.news_number INTO found_number FROM atlas_news_items stored
   WHERE stored.item_id = new_item ->> 'itemId' AND stored.card_sha256 = new_item ->> 'cardSha256';
  IF FOUND THEN
    -- The same card checked again with another draft, still staged, by a newer receipt: it takes that draft and its
    -- receipt's claims, so the day call's reading is bound to the draft the news check's last passing call checked; an
    -- older receipt delivered late changes nothing. A committed or withdrawn card keeps what it had.
    BEGIN
      UPDATE atlas_news_items stored
         SET draft = new_item ->> 'draft', draft_sha256 = new_item ->> 'draftSha256',
             receipt_claims = new_item -> 'receiptClaims',
             receipt_issued_at = (new_item ->> 'receiptIssuedAt')::timestamptz,
             changed_at = greatest(stage_time, stored.changed_at)
       WHERE stored.news_number = found_number AND stored.state = 'staged'
         AND stored.draft_sha256 <> new_item ->> 'draftSha256'
         AND (new_item ->> 'receiptIssuedAt')::timestamptz > stored.receipt_issued_at;
    EXCEPTION WHEN check_violation OR not_null_violation OR invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END;
    RETURN QUERY SELECT 'N-' || found_number::text, new_item ->> 'cardSha256', true;
    RETURN;
  END IF;
  SELECT count(*) INTO staged_today FROM atlas_news_items stored
   WHERE (stored.staged_at AT TIME ZONE 'UTC')::date = (stage_time AT TIME ZONE 'UTC')::date;
  IF staged_today >= 20 THEN
    RAISE EXCEPTION 'ATLAS_NEWS_DAY_FULL';
  END IF;
  next_number := nextval('atlas_news_number_seq');
  BEGIN
    INSERT INTO atlas_news_items
      (news_number, item_id, check_id, card, card_sha256, draft, draft_sha256, receipt_claims, receipt_issued_at, doi,
       staged_at, state, changed_at)
    VALUES
      (next_number, new_item ->> 'itemId', new_item ->> 'checkId', new_item -> 'card', new_item ->> 'cardSha256',
       new_item ->> 'draft', new_item ->> 'draftSha256', new_item -> 'receiptClaims',
       (new_item ->> 'receiptIssuedAt')::timestamptz, new_item ->> 'doi', stage_time, 'staged', stage_time);
  EXCEPTION WHEN check_violation OR not_null_violation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END;
  RETURN QUERY SELECT 'N-' || next_number::text, new_item ->> 'cardSha256', false;
END
$function$;

REVOKE ALL ON FUNCTION stage_atlas_news_card(jsonb, timestamptz) FROM PUBLIC;

-- The review role's day call: commits one UTC day whole, or nothing. A payload already committed for its day returns
-- that version (a replay). A base that isn't the latest committed day before this one stores nothing and returns the
-- latest (stale_base). The order's carried items are exactly the base's stored order less the items older than seven
-- days and those withdrawn since; on a weekday they keep the base's order, and only a Sunday's re-rank may move them.
-- Each new item must be staged, on this UTC day and within 24 hours, or it is kept back whatever the application
-- decided. As its last step the function compares commit_deadline (the earlier of the run's not_after and the
-- handler's own limit) with clock_timestamp(), not the transaction's start: past it, nothing is stored.
CREATE OR REPLACE FUNCTION commit_atlas_news_day(day_commit jsonb, commit_time timestamptz, commit_deadline timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  field text;
  target_day date;
  payload_digest text;
  given_base_day date;
  given_base_version integer;
  latest atlas_news_days%ROWTYPE;
  replayed atlas_news_days%ROWTYPE;
  carried_expected jsonb := '[]'::jsonb;
  carried_given jsonb := '[]'::jsonb;
  withdrawn_base jsonb := '[]'::jsonb;
  new_numbers jsonb := '[]'::jsonb;
  entry jsonb;
  decision jsonb;
  stored atlas_news_items%ROWTYPE;
  number_text text;
  item_number bigint;
  forced text;
  row_found boolean;
  given_reading jsonb;
  kept jsonb := '[]'::jsonb;
  kept_numbers jsonb := '[]'::jsonb;
  passed_numbers jsonb := '[]'::jsonb;
  final_order jsonb := '[]'::jsonb;
  final_lines jsonb := '[]'::jsonb;
  next_version integer;
  is_rerank boolean;
BEGIN
  IF day_commit IS NULL OR jsonb_typeof(day_commit) <> 'object' OR commit_time IS NULL OR commit_deadline IS NULL
     OR jsonb_typeof(day_commit -> 'day') IS DISTINCT FROM 'string'
     OR jsonb_typeof(day_commit -> 'payloadSha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(day_commit -> 'rerank') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(day_commit -> 'order') IS DISTINCT FROM 'array'
     OR jsonb_typeof(day_commit -> 'decisions') IS DISTINCT FROM 'array'
     OR jsonb_typeof(day_commit -> 'moves') IS DISTINCT FROM 'array'
     OR jsonb_typeof(day_commit -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_typeof(day_commit -> 'base') NOT IN ('object', 'null')
     OR jsonb_typeof(day_commit -> 'footer') NOT IN ('object', 'null')
     OR (day_commit ->> 'payloadSha256') !~ '^[a-f0-9]{64}$'
     OR (day_commit ->> 'day') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END IF;
  FOR field IN SELECT jsonb_object_keys(day_commit) LOOP
    IF field NOT IN ('day', 'payloadSha256', 'base', 'rerank', 'order', 'decisions', 'moves', 'lines', 'footer') THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
  END LOOP;
  target_day := (day_commit ->> 'day')::date;
  payload_digest := day_commit ->> 'payloadSha256';
  is_rerank := (day_commit ->> 'rerank')::boolean;
  -- One day call at a time.
  PERFORM pg_advisory_xact_lock(hashtext('atlas_news_days'));

  -- A replay is recognised before anything else is checked.
  SELECT * INTO replayed FROM atlas_news_days days
   WHERE days.news_day = target_day AND days.payload_sha256 = payload_digest;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'replayed', 'day', replayed.news_day::text, 'version', replayed.day_version,
      'order', replayed.stored_order, 'keptBack', replayed.kept_back, 'lines', replayed.lines);
  END IF;
  -- The server's own bound: only the current UTC date, whatever the payload says.
  IF target_day <> (commit_time AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'ATLAS_NEWS_OTHER_DAY';
  END IF;
  IF is_rerank AND extract(isodow FROM target_day) <> 7 THEN
    RAISE EXCEPTION 'ATLAS_NEWS_ORDER_INVALID';
  END IF;

  -- The base: the latest committed day before this one, its latest version.
  SELECT * INTO latest FROM atlas_news_days days WHERE days.news_day < target_day
   ORDER BY days.news_day DESC, days.day_version DESC LIMIT 1;
  IF jsonb_typeof(day_commit -> 'base') = 'object' THEN
    IF jsonb_typeof(day_commit -> 'base' -> 'day') IS DISTINCT FROM 'string'
       OR jsonb_typeof(day_commit -> 'base' -> 'version') IS DISTINCT FROM 'number'
       OR (day_commit -> 'base' ->> 'day') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
    given_base_day := (day_commit -> 'base' ->> 'day')::date;
    given_base_version := (day_commit -> 'base' ->> 'version')::integer;
  END IF;
  IF (latest.news_day IS NULL) <> (given_base_day IS NULL)
     OR (latest.news_day IS NOT NULL AND (latest.news_day <> given_base_day OR latest.day_version <> given_base_version))
  THEN
    RETURN jsonb_build_object('status', 'stale_base', 'latest', CASE WHEN latest.news_day IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('day', latest.news_day::text, 'version', latest.day_version, 'order', latest.stored_order)
      END);
  END IF;

  -- The carried items the order must hold: the base's stored order, less items older than seven days and withdrawn.
  -- A base item withdrawn since (by the owner, or replaced by a newer card) may still be in the order, as the news
  -- check doesn't know of the withdrawal; it is left out of the stored order.
  IF latest.news_day IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(to_jsonb('N-' || items.news_number::text) ORDER BY base_order.place)
             FILTER (WHERE items.state = 'shadow'), '[]'::jsonb),
           coalesce(jsonb_agg(to_jsonb('N-' || items.news_number::text)) FILTER (WHERE items.state = 'withdrawn'),
             '[]'::jsonb)
      INTO carried_expected, withdrawn_base
      FROM jsonb_array_elements_text(latest.stored_order) WITH ORDINALITY AS base_order(number_text, place)
      JOIN atlas_news_items items ON items.news_number = substr(base_order.number_text, 3)::bigint
     WHERE items.committed_day >= target_day - 6;
  END IF;

  -- The order as given: each number once, each carried, withdrawn since or new.
  FOR entry IN SELECT value FROM jsonb_array_elements(day_commit -> 'order') LOOP
    IF jsonb_typeof(entry) <> 'string' OR (entry #>> '{}') !~ '^N-[1-9][0-9]{3,}$' THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
    IF carried_given @> jsonb_build_array(entry) OR new_numbers @> jsonb_build_array(entry) THEN
      RAISE EXCEPTION 'ATLAS_NEWS_ORDER_INVALID';
    END IF;
    IF carried_expected @> jsonb_build_array(entry) THEN
      carried_given := carried_given || jsonb_build_array(entry);
    ELSIF NOT withdrawn_base @> jsonb_build_array(entry) THEN
      new_numbers := new_numbers || jsonb_build_array(entry);
    END IF;
  END LOOP;
  -- Every carried item is in the order; on a weekday in the base's order.
  IF jsonb_array_length(carried_given) <> jsonb_array_length(carried_expected)
     OR (NOT is_rerank AND carried_given <> carried_expected) THEN
    RAISE EXCEPTION 'ATLAS_NEWS_ORDER_INVALID';
  END IF;

  -- The decisions: exactly one for each new number in the order, and for each "checked" line's card.
  FOR decision IN SELECT value FROM jsonb_array_elements(day_commit -> 'decisions') LOOP
    IF jsonb_typeof(decision) <> 'object'
       OR jsonb_typeof(decision -> 'number') IS DISTINCT FROM 'string'
       OR (decision ->> 'number') !~ '^N-[1-9][0-9]{3,}$'
       OR jsonb_typeof(decision -> 'kind') IS DISTINCT FROM 'string'
       OR (decision ->> 'kind') NOT IN ('main', 'line')
       OR jsonb_typeof(decision -> 'passed') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(decision -> 'reasons') IS DISTINCT FROM 'array'
       OR jsonb_array_length(decision -> 'reasons') > 20
       OR ((decision ->> 'passed')::boolean = (jsonb_array_length(decision -> 'reasons') > 0))
       OR (jsonb_typeof(decision -> 'reading') = 'object' AND octet_length((decision -> 'reading')::text) > 16000)
       OR jsonb_typeof(decision -> 'reading') NOT IN ('object', 'null')
       OR jsonb_typeof(decision -> 'readingModel') NOT IN ('string', 'null')
       OR jsonb_typeof(decision -> 'retraction') NOT IN ('string', 'null')
       OR ((decision ->> 'kind') = 'main') <> (new_numbers @> jsonb_build_array(decision -> 'number'))
       OR carried_expected @> jsonb_build_array(decision -> 'number')
       OR withdrawn_base @> jsonb_build_array(decision -> 'number')
    THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(day_commit -> 'decisions') d WHERE d.value ->> 'kind' = 'main')
       <> jsonb_array_length(new_numbers)
     OR (SELECT count(DISTINCT d.value ->> 'number') FROM jsonb_array_elements(day_commit -> 'decisions') d)
       <> jsonb_array_length(day_commit -> 'decisions') THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END IF;
  -- At most one passing decision for each news check item: the application keeps back every other version of it.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(day_commit -> 'decisions') d
               JOIN atlas_news_items items ON items.news_number = substr(d.value ->> 'number', 3)::bigint
              WHERE (d.value ->> 'passed')::boolean
              GROUP BY items.item_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END IF;

  SELECT coalesce(max(days.day_version), 0) + 1 INTO next_version FROM atlas_news_days days
   WHERE days.news_day = target_day;

  -- Each new item: staged, on this UTC day, within 24 hours; otherwise kept back whatever the application decided.
  FOR decision IN SELECT value FROM jsonb_array_elements(day_commit -> 'decisions') LOOP
    number_text := decision ->> 'number';
    item_number := substr(number_text, 3)::bigint;
    forced := NULL;
    given_reading := CASE WHEN jsonb_typeof(decision -> 'reading') = 'object' THEN decision -> 'reading' ELSE NULL END;
    SELECT * INTO stored FROM atlas_news_items items WHERE items.news_number = item_number FOR UPDATE;
    row_found := FOUND;
    -- Staged today, or committed by an earlier version of today's call: a changed payload makes a new version.
    IF NOT row_found OR NOT (stored.state = 'staged'
        OR (stored.state IN ('shadow', 'kept_back') AND stored.committed_day = target_day)) THEN
      forced := 'not_staged';
    ELSIF (stored.staged_at AT TIME ZONE 'UTC')::date <> target_day THEN
      forced := 'other_day';
    ELSIF stored.staged_at < commit_time - interval '24 hours' THEN
      forced := 'expired';
    ELSIF (decision ->> 'passed')::boolean AND (given_reading IS NULL
        OR given_reading ->> 'card' IS DISTINCT FROM stored.card_sha256
        OR given_reading ->> 'draft' IS DISTINCT FROM stored.draft_sha256) THEN
      -- A passing item's reading must name the card and the draft this row holds now: a card staged again with a newer
      -- draft after the application read it is kept back, never kept with a reading of another draft.
      forced := 'reading_not_bound';
    END IF;
    IF forced IS NULL AND (decision ->> 'passed')::boolean THEN
      IF decision ->> 'kind' = 'main' THEN
        passed_numbers := passed_numbers || jsonb_build_array(number_text);
      END IF;
      UPDATE atlas_news_items items
         SET state = 'shadow', item_kind = decision ->> 'kind', committed_day = target_day,
             committed_version = next_version, reading = given_reading,
             reading_model = decision ->> 'readingModel', retraction_status = decision ->> 'retraction',
             kept_reasons = NULL, changed_at = greatest(commit_time, items.changed_at)
       WHERE items.news_number = item_number;
      -- A newer card of an item already committed takes its place.
      UPDATE atlas_news_items items
         SET state = 'withdrawn', withdrawn_reason = 'replaced', changed_at = greatest(commit_time, items.changed_at)
       WHERE items.item_id = stored.item_id AND items.news_number <> item_number AND items.state = 'shadow';
    ELSE
      kept := kept || jsonb_build_array(jsonb_build_object('number', number_text, 'reasons',
        CASE WHEN forced IS NULL THEN decision -> 'reasons' ELSE jsonb_build_array(forced) END));
      IF decision ->> 'kind' = 'main' THEN
        kept_numbers := kept_numbers || jsonb_build_array(number_text);
      END IF;
      IF row_found AND (stored.state = 'staged'
          OR (stored.state IN ('shadow', 'kept_back') AND stored.committed_day = target_day)) THEN
        UPDATE atlas_news_items items
           SET state = 'kept_back', item_kind = decision ->> 'kind', committed_day = target_day,
               committed_version = next_version, reading = given_reading,
               reading_model = decision ->> 'readingModel', retraction_status = decision ->> 'retraction',
               kept_reasons = CASE WHEN forced IS NULL THEN decision -> 'reasons' ELSE jsonb_build_array(forced) END,
               changed_at = greatest(commit_time, items.changed_at)
         WHERE items.news_number = item_number;
      END IF;
    END IF;
  END LOOP;

  -- The stored order: the order as given, less the new items kept back and every item now withdrawn (since the base,
  -- or replaced by a newer card in this call).
  SELECT coalesce(jsonb_agg(given.value ORDER BY given.place), '[]'::jsonb) INTO final_order
    FROM jsonb_array_elements(day_commit -> 'order') WITH ORDINALITY AS given(value, place)
    JOIN atlas_news_items items ON items.news_number = substr(given.value #>> '{}', 3)::bigint
   WHERE NOT kept_numbers @> jsonb_build_array(given.value) AND items.state <> 'withdrawn';

  -- Each "checked" line takes its card's final state, as stored here, never the application's earlier decision: it
  -- passes only when its card was committed in this call and is on show.
  SELECT coalesce(jsonb_agg(CASE WHEN line.value ->> 'kind' = 'checked' THEN
           line.value || jsonb_build_object(
             'passed', coalesce(items.state = 'shadow' AND items.committed_day = target_day
               AND items.committed_version = next_version, false),
             'reasons', CASE WHEN coalesce(items.state = 'shadow' AND items.committed_day = target_day
                 AND items.committed_version = next_version, false) THEN '[]'::jsonb
               WHEN items.state = 'withdrawn' THEN jsonb_build_array('withdrawn')
               ELSE coalesce((SELECT held.value -> 'reasons' FROM jsonb_array_elements(kept) AS held(value)
                              WHERE held.value ->> 'number' = line.value ->> 'number' LIMIT 1),
                             jsonb_build_array('not_staged')) END)
           ELSE line.value END ORDER BY line.place), '[]'::jsonb)
    INTO final_lines
    FROM jsonb_array_elements(day_commit -> 'lines') WITH ORDINALITY AS line(value, place)
    LEFT JOIN atlas_news_items items ON line.value ->> 'kind' = 'checked'
      AND items.news_number = substr(line.value ->> 'number', 3)::bigint;

  BEGIN
    INSERT INTO atlas_news_days
      (news_day, day_version, payload_sha256, base_day, base_version, rerank, stored_order, moves, lines, footer,
       kept_back, committed_at)
    VALUES
      (target_day, next_version, payload_digest, given_base_day, given_base_version, is_rerank, final_order,
       day_commit -> 'moves', final_lines,
       CASE WHEN jsonb_typeof(day_commit -> 'footer') = 'object' THEN day_commit -> 'footer' ELSE NULL END,
       kept, commit_time);
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END;

  -- The last step, the final acceptance check: past the deadline, or once the database's own UTC date is no longer
  -- the day's, nothing of this call is stored (the transaction's commit then follows at once).
  IF clock_timestamp() > commit_deadline OR (clock_timestamp() AT TIME ZONE 'UTC')::date <> target_day THEN
    RAISE EXCEPTION 'ATLAS_NEWS_LATE';
  END IF;
  RETURN jsonb_build_object('status', 'committed', 'day', target_day::text, 'version', next_version,
    'order', final_order, 'keptBack', kept, 'lines', final_lines);
END
$function$;

REVOKE ALL ON FUNCTION commit_atlas_news_day(jsonb, timestamptz, timestamptz) FROM PUBLIC;

-- The owner's withdrawal: one item by its N-number, or every item at once ('all'), with the owner's private reason.
-- A withdrawn item stays withdrawn, and a withdrawn staged card can no longer be committed.
CREATE OR REPLACE FUNCTION withdraw_atlas_news_items(target text, reason text, change_time timestamptz)
RETURNS TABLE (news_public_id text, item_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  IF target IS NULL OR (target <> 'all' AND target !~ '^N-[1-9][0-9]{3,}$') OR change_time IS NULL
     OR reason IS NULL OR length(reason) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END IF;
  -- The day call's own lock: a withdrawal waits for a commit in progress, and a commit for a withdrawal.
  PERFORM pg_advisory_xact_lock(hashtext('atlas_news_days'));
  RETURN QUERY
  WITH changed AS (
    UPDATE atlas_news_items items
       SET state = 'withdrawn', withdrawn_reason = 'owner_unpublished', owner_reason = reason, kept_reasons = NULL,
           changed_at = greatest(change_time, items.changed_at)
     WHERE items.state <> 'withdrawn'
       AND (target = 'all' OR items.news_number = substr(target, 3)::bigint)
    RETURNING items.news_number AS changed_number, items.state AS changed_state)
  SELECT 'N-' || changed.changed_number::text, changed.changed_state FROM changed ORDER BY changed.changed_number;
END
$function$;

REVOKE ALL ON FUNCTION withdraw_atlas_news_items(text, text, timestamptz) FROM PUBLIC;

-- What the owner's actions read: {"day": D} gives that day's latest record and the items staged or committed on it,
-- without their drafts; {"before": D} the latest committed day before D, with the commit day and state of each item in
-- its order; {"numbers": [N, ...]} those items in full, drafts included (at most 20). A staged card older than 24
-- hours reads as expired.
CREATE OR REPLACE FUNCTION inspect_atlas_news(request jsonb, inspect_time timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target_day date;
  latest atlas_news_days%ROWTYPE;
  numbers bigint[];
BEGIN
  IF request IS NULL OR jsonb_typeof(request) <> 'object' OR inspect_time IS NULL THEN
    RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
  END IF;
  IF jsonb_typeof(request -> 'numbers') = 'array' THEN
    IF jsonb_array_length(request -> 'numbers') NOT BETWEEN 1 AND 20 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(request -> 'numbers') AS given(value)
       WHERE jsonb_typeof(given.value) <> 'string' OR (given.value #>> '{}') !~ '^N-[1-9][0-9]{3,}$') THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
    SELECT array_agg(substr(given.value #>> '{}', 3)::bigint) INTO numbers
      FROM jsonb_array_elements(request -> 'numbers') AS given(value);
    RETURN jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'number', 'N-' || items.news_number::text, 'itemId', items.item_id, 'checkId', items.check_id,
        'card', items.card, 'cardSha256', items.card_sha256, 'draft', items.draft, 'draftSha256', items.draft_sha256,
        'receiptClaims', items.receipt_claims, 'receiptIssuedAt', items.receipt_issued_at, 'doi', items.doi,
        'stagedAt', items.staged_at,
        'state', CASE WHEN items.state = 'staged' AND items.staged_at < inspect_time - interval '24 hours'
          THEN 'expired' ELSE items.state END,
        'kind', items.item_kind, 'keptReasons', items.kept_reasons, 'committedDay', items.committed_day,
        'committedVersion', items.committed_version, 'reading', items.reading, 'readingModel', items.reading_model,
        'retraction', items.retraction_status, 'withdrawnReason', items.withdrawn_reason)
        ORDER BY items.news_number)
      FROM atlas_news_items items WHERE items.news_number = ANY (numbers)), '[]'::jsonb));
  END IF;
  IF jsonb_typeof(request -> 'before') = 'string' THEN
    IF (request ->> 'before') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
    SELECT * INTO latest FROM atlas_news_days days WHERE days.news_day < (request ->> 'before')::date
     ORDER BY days.news_day DESC, days.day_version DESC LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('latest', 'null'::jsonb);
    END IF;
    RETURN jsonb_build_object('latest', jsonb_build_object('day', latest.news_day::text, 'version', latest.day_version,
      'order', latest.stored_order, 'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'number', 'N-' || items.news_number::text, 'state', items.state, 'committedDay', items.committed_day::text)
        ORDER BY items.news_number)
      FROM atlas_news_items items WHERE ('N-' || items.news_number::text) IN
        (SELECT value FROM jsonb_array_elements_text(latest.stored_order))), '[]'::jsonb)));
  END IF;
  IF jsonb_typeof(request -> 'day') = 'string' THEN
    IF (request ->> 'day') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
    END IF;
    target_day := (request ->> 'day')::date;
    IF jsonb_typeof(request -> 'payloadSha256') = 'string' THEN
      -- A replay's own version, by its payload's digest.
      SELECT * INTO latest FROM atlas_news_days days
       WHERE days.news_day = target_day AND days.payload_sha256 = request ->> 'payloadSha256';
    ELSE
      SELECT * INTO latest FROM atlas_news_days days WHERE days.news_day = target_day
       ORDER BY days.day_version DESC LIMIT 1;
    END IF;
    RETURN jsonb_build_object(
      'day', CASE WHEN latest.news_day IS NULL THEN 'null'::jsonb ELSE jsonb_build_object(
        'day', latest.news_day::text, 'version', latest.day_version, 'payloadSha256', latest.payload_sha256,
        'base', CASE WHEN latest.base_day IS NULL THEN 'null'::jsonb
          ELSE jsonb_build_object('day', latest.base_day::text, 'version', latest.base_version) END,
        'rerank', latest.rerank, 'order', latest.stored_order, 'moves', latest.moves, 'lines', latest.lines,
        'footer', latest.footer, 'keptBack', latest.kept_back, 'committedAt', latest.committed_at) END,
      'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'number', 'N-' || items.news_number::text, 'itemId', items.item_id, 'checkId', items.check_id,
        'cardSha256', items.card_sha256, 'label', items.card ->> 'label', 'finding', items.card ->> 'finding',
        'doi', items.doi, 'stagedAt', items.staged_at,
        'state', CASE WHEN items.state = 'staged' AND items.staged_at < inspect_time - interval '24 hours'
          THEN 'expired' ELSE items.state END,
        'kind', items.item_kind, 'keptReasons', items.kept_reasons, 'committedVersion', items.committed_version,
        'readingModel', items.reading_model, 'retraction', items.retraction_status,
        'withdrawnReason', items.withdrawn_reason)
        ORDER BY items.news_number)
      FROM atlas_news_items items
      WHERE (items.staged_at AT TIME ZONE 'UTC')::date = target_day OR items.committed_day = target_day), '[]'::jsonb));
  END IF;
  RAISE EXCEPTION 'ATLAS_NEWS_INPUT_INVALID';
END
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_news(jsonb, timestamptz) FROM PUBLIC;

REVOKE ALL ON TABLE atlas_news_items FROM PUBLIC;
REVOKE ALL ON TABLE atlas_news_days FROM PUBLIC;
REVOKE ALL ON SEQUENCE atlas_news_number_seq FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE atlas_news_items FROM askrigor_reader;
    REVOKE ALL ON TABLE atlas_news_days FROM askrigor_reader;
    REVOKE ALL ON SEQUENCE atlas_news_number_seq FROM askrigor_reader;
  END IF;
END
$grants$;
