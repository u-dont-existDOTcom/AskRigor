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
-- ran; the account's unaccepted copies leave the pages. The pages' reader sees only the shown copies, their history,
-- the topics they are on and a number that changes with every change to them, through four views; it reads no table.
-- Additive and safe to run again: an earlier image never reads these tables, and the triggers keep the copies in step
-- with what an earlier image's revocation and forget_card do to the private versions.

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
  -- The copy's own version, 1, 2, ... for each public number: a published private version or a reviewed revision.
  version_number integer NOT NULL CHECK (version_number >= 1),
  -- The private version it copies; NULL once detached (losing access, as erasure, cuts the link to the account). A
  -- reviewed revision copies the same private version as the copy it revises.
  version_id uuid REFERENCES research_dossier_versions(version_id),
  detached_at timestamptz,
  -- A reviewed revision of an importance mark (Codex's review of stage 2, finding 7): the version it revises, who revised
  -- it (the reviewer login's digest) and the reason typed, kept until erasure. Never an edit in place.
  revision_of integer CHECK (revision_of >= 1),
  revised_by text CHECK (revised_by ~ '^reviewer:[0-9a-f]{16}$'),
  revision_reason text CHECK (revision_reason = btrim(revision_reason) AND length(revision_reason) BETWEEN 1 AND 200),
  state text NOT NULL CHECK (state IN ('shown', 'held', 'superseded', 'taken_down', 'erased')),
  topic_key text CHECK (topic_key IS NULL OR topic_key ~ '^[a-z0-9][a-z0-9._-]{0,199}$'),
  related_topic_keys text[] NOT NULL DEFAULT '{}' CHECK (cardinality(related_topic_keys) <= 10),
  -- The topic's key and names, its other names and the forms, lower-cased: where another dossier may meet it under
  -- another name, for the conflict check's candidates (Codex's review of stage 2, finding 3).
  topic_names text[] NOT NULL DEFAULT '{}' CHECK (cardinality(topic_names) <= 30),
  public_payload jsonb CHECK (public_payload IS NULL OR jsonb_typeof(public_payload) = 'object'),
  public_sha256 char(64) CHECK (public_sha256 IS NULL OR public_sha256 ~ '^[a-f0-9]{64}$'),
  hold_reasons text[] NOT NULL DEFAULT '{}' CHECK (hold_reasons <@ ARRAY['not_high_confidence', 'names_living_people',
    'living_people_undeclared', 'important_conflict', 'owner_hold', 'privacy_reading_pending',
    'conflict_check_pending']::text[]),
  conflicts_with text[] NOT NULL DEFAULT '{}' CHECK (cardinality(conflicts_with) <= 50),
  -- Where the research ran (332a: the plugin, ChatGPT or the runner), for the review only; never on a page.
  origin jsonb NOT NULL CHECK (jsonb_typeof(origin) = 'object'),
  -- Whether AskRigor's semantic privacy reading passed exactly the saved content; a copy without it never shows
  -- (Codex's review of stage 2, finding 1).
  privacy_read boolean NOT NULL,
  -- A privacy reading made later, for a copy no reading passed when it was saved (Codex's re-review of stage 2, P1): of
  -- its public content, on the owner's action or by the server once the reader is available again, bound to the digest
  -- of the content it read. Its outcome is final for that content: passed, or refused with the reader's reason and the
  -- field it named. A reading that could not be made (the reader off or unavailable, no money left that day) is stored
  -- apart, as the last temporary failure, and leaves the copy waiting.
  privacy_reading_outcome text CHECK (privacy_reading_outcome IN ('passed', 'refused')),
  privacy_reading_sha256 char(64) CHECK (privacy_reading_sha256 ~ '^[a-f0-9]{64}$'),
  privacy_reading_reason text CHECK (privacy_reading_reason IN ('names_a_person', 'birth_date', 'where_someone_lives',
    'contact_details', 'personal_health_story', 'relative_or_household', 'copied_conversation', 'other_personal_detail')),
  privacy_reading_path text CHECK (privacy_reading_path ~ '^[a-z_]+(\[[0-9]+\]|\.[a-z_]+)*$'
    AND length(privacy_reading_path) <= 200),
  privacy_reading_at timestamptz,
  privacy_unavailable_reason text CHECK (privacy_unavailable_reason IN ('off', 'too_long', 'daily_budget', 'timeout',
    'error', 'refusal', 'unreadable')),
  privacy_unavailable_at timestamptz,
  -- A claim names a living person (the AI's declaration): true, false, or NULL when the AI did not say. A copy that
  -- names one shows only on the owner's own decision, with who decided, when and the reason he typed (Codex's review of
  -- stage 2, finding 2); nothing else clears it.
  names_living_person boolean,
  -- "Didn't say" is not "no" (Codex's re-review of stage 2, P0): for a copy whose AI did not say, the owner's own
  -- statement, made once, with who made it (the reviewer login's digest) and when. names_no_living_person lets the
  -- ordinary show work; names_a_living_person leaves only his separate decision above. Nothing else resolves it.
  living_person_statement text CHECK (living_person_statement IN ('names_no_living_person', 'names_a_living_person')),
  living_person_stated_by text CHECK (living_person_stated_by ~ '^reviewer:[0-9a-f]{16}$'),
  living_person_stated_at timestamptz,
  living_person_decided_by text CHECK (living_person_decided_by ~ '^reviewer:[0-9a-f]{16}$'),
  living_person_decided_at timestamptz,
  living_person_reason text CHECK (living_person_reason = btrim(living_person_reason)
    AND length(living_person_reason) BETWEEN 1 AND 200),
  accepted_at timestamptz,
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  erased_at timestamptz,
  PRIMARY KEY (public_number, version_number),
  CHECK ((revision_of IS NULL) = (revised_by IS NULL)),
  CHECK (revision_of IS NULL OR revision_of < version_number),
  CHECK (revision_reason IS NULL OR revision_of IS NOT NULL),
  CHECK (erased_at IS NOT NULL OR (revision_of IS NULL) = (revision_reason IS NULL)),
  CHECK ((version_id IS NULL) = (detached_at IS NOT NULL)),
  CHECK (version_id IS NOT NULL OR origin = '{}'::jsonb),
  CHECK ((state = 'erased') = (erased_at IS NOT NULL)),
  CHECK ((erased_at IS NULL) = (public_payload IS NOT NULL AND public_sha256 IS NOT NULL AND topic_key IS NOT NULL)),
  CHECK (state <> 'held' OR cardinality(hold_reasons) > 0),
  CHECK ((privacy_reading_outcome IS NULL) = (privacy_reading_sha256 IS NULL)
    AND (privacy_reading_outcome IS NULL) = (privacy_reading_at IS NULL)),
  CHECK ((privacy_reading_outcome IS NOT DISTINCT FROM 'refused') = (privacy_reading_reason IS NOT NULL)),
  CHECK (privacy_reading_path IS NULL OR privacy_reading_reason IS NOT NULL),
  CHECK (privacy_reading_outcome IS NULL OR NOT privacy_read),
  CHECK ((privacy_unavailable_reason IS NULL) = (privacy_unavailable_at IS NULL)),
  -- Shown only once a privacy reading passed its content: when it was saved, or later, bound to exactly this content.
  CHECK (state <> 'shown' OR privacy_read OR (privacy_reading_outcome IS NOT DISTINCT FROM 'passed'
    AND privacy_reading_sha256 IS NOT DISTINCT FROM public_sha256)),
  CHECK ((living_person_decided_at IS NULL) = (living_person_decided_by IS NULL)
    AND (living_person_decided_at IS NULL) = (living_person_reason IS NULL)),
  CHECK ((living_person_statement IS NULL) = (living_person_stated_by IS NULL)
    AND (living_person_statement IS NULL) = (living_person_stated_at IS NULL)),
  CHECK (living_person_statement IS NULL OR names_living_person IS NULL),
  CHECK (living_person_decided_at IS NULL OR names_living_person IS TRUE
    OR living_person_statement IS NOT DISTINCT FROM 'names_a_living_person'),
  -- Shown only when no claim names a living person, by the AI's declaration or, when it did not say, by the owner's
  -- statement; or on the owner's own decision to show a claim that names one.
  CHECK (state <> 'shown' OR living_person_decided_at IS NOT NULL OR names_living_person IS FALSE
    OR (names_living_person IS NULL AND living_person_statement IS NOT DISTINCT FROM 'names_no_living_person')),
  CHECK (accepted_at IS NULL OR state IN ('shown', 'superseded', 'taken_down'))
);

-- One published copy per private version; reviewed revisions copy it again.
CREATE UNIQUE INDEX IF NOT EXISTS research_dossier_public_one_copy_per_version
  ON research_dossier_public_versions (version_id) WHERE revision_of IS NULL AND version_id IS NOT NULL;
-- At most one shown copy per dossier.
CREATE UNIQUE INDEX IF NOT EXISTS research_dossier_public_one_shown
  ON research_dossier_public_versions (public_number) WHERE state = 'shown';
CREATE INDEX IF NOT EXISTS research_dossier_public_topic_idx
  ON research_dossier_public_versions (topic_key) WHERE state IN ('shown', 'held');
CREATE INDEX IF NOT EXISTS research_dossier_public_names_idx
  ON research_dossier_public_versions USING gin (topic_names) WHERE state = 'shown';
CREATE INDEX IF NOT EXISTS research_dossier_public_related_idx
  ON research_dossier_public_versions USING gin (related_topic_keys) WHERE state = 'shown';
CREATE INDEX IF NOT EXISTS research_dossier_public_state_idx
  ON research_dossier_public_versions (state, decided_at);

CREATE TABLE IF NOT EXISTS research_dossier_public_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_number text NOT NULL,
  version_number integer NOT NULL,
  event text NOT NULL CHECK (event IN ('shown', 'held', 'superseded', 'taken_down', 'accepted', 'erased',
    'living_person_decided', 'living_person_stated', 'detached', 'revised', 'privacy_reading_passed',
    'privacy_reading_refused')),
  reason text CHECK (reason IS NULL OR (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 200)),
  happened_at timestamptz NOT NULL,
  FOREIGN KEY (public_number, version_number)
    REFERENCES research_dossier_public_versions (public_number, version_number)
);

CREATE INDEX IF NOT EXISTS research_dossier_public_events_version_idx
  ON research_dossier_public_events (public_number, version_number, event_id);

-- One number that changes with every write to the copies, in the same transaction, whichever process or trigger made
-- it (a publication, a decision, a revocation, an erasure): each server's pages read it before a cached dossier page
-- and render again when it moved (Codex's review of stage 2, finding 9).
CREATE TABLE IF NOT EXISTS research_dossier_public_generation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation bigint NOT NULL CHECK (generation >= 1)
);

COMMENT ON TABLE research_dossier_public_notices IS
  'AskRigor#477 stage 2: the free contributor notices whose yes covers a dossier on the public Atlas. Empty until notice v7 is released on the owner''s yes.';
COMMENT ON TABLE research_dossier_publications IS
  'AskRigor#477 stage 2: a dossier''s public number (D-1001 onward), which never shows its private ARD number.';
COMMENT ON TABLE research_dossier_public_versions IS
  'One public copy per saved dossier version: shown (marked unreviewed until accepted), held for AskRigor''s check, superseded by a newer one, taken down, or erased with its private version.';
COMMENT ON COLUMN research_dossier_public_versions.origin IS
  'Where the research ran (owner answer 332a): the connector surface, whether the caller made the AI readings, and the runner''s own declaration. For the review only.';
COMMENT ON TABLE research_dossier_public_generation IS
  'AskRigor#477 stage 2: one row, its number raised by every write to research_dossier_public_versions, so every server drops its cached dossier pages.';
COMMENT ON TABLE research_dossier_public_events IS
  'Append-only: shown, held, superseded, taken_down, accepted, erased, living_person_decided (the owner''s decision to show a copy whose claim names a living person), living_person_stated (the owner''s statement, for a copy whose AI did not say, of whether a claim names a living person), privacy_reading_passed and privacy_reading_refused (a privacy reading made later, bound to the content read), detached (its contributor lost access), revised (a reviewed revision of an importance mark, on the new version).';

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
     OR NEW.privacy_read <> OLD.privacy_read OR NEW.names_living_person IS DISTINCT FROM OLD.names_living_person
     OR NEW.revision_of IS DISTINCT FROM OLD.revision_of OR NEW.revised_by IS DISTINCT FROM OLD.revised_by THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF OLD.erased_at IS NOT NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLIC_VERSION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF NEW.erased_at IS NULL AND (NEW.public_payload IS DISTINCT FROM OLD.public_payload
     OR NEW.public_sha256 IS DISTINCT FROM OLD.public_sha256 OR NEW.topic_key IS DISTINCT FROM OLD.topic_key
     OR NEW.related_topic_keys IS DISTINCT FROM OLD.related_topic_keys
     OR NEW.topic_names IS DISTINCT FROM OLD.topic_names
     OR NEW.revision_reason IS DISTINCT FROM OLD.revision_reason
     -- The owner's decision on a named living person is made once and never changed.
     OR (OLD.living_person_decided_at IS NOT NULL AND (NEW.living_person_decided_at IS DISTINCT FROM
       OLD.living_person_decided_at OR NEW.living_person_decided_by IS DISTINCT FROM OLD.living_person_decided_by
       OR NEW.living_person_reason IS DISTINCT FROM OLD.living_person_reason))
     -- A privacy reading made later is final for the content it read.
     OR (OLD.privacy_reading_outcome IS NOT NULL AND (NEW.privacy_reading_outcome IS DISTINCT FROM
       OLD.privacy_reading_outcome OR NEW.privacy_reading_sha256 IS DISTINCT FROM OLD.privacy_reading_sha256
       OR NEW.privacy_reading_reason IS DISTINCT FROM OLD.privacy_reading_reason
       OR NEW.privacy_reading_path IS DISTINCT FROM OLD.privacy_reading_path
       OR NEW.privacy_reading_at IS DISTINCT FROM OLD.privacy_reading_at))
     -- So is his statement, for a copy whose AI did not say.
     OR (OLD.living_person_statement IS NOT NULL AND (NEW.living_person_statement IS DISTINCT FROM
       OLD.living_person_statement OR NEW.living_person_stated_by IS DISTINCT FROM OLD.living_person_stated_by
       OR NEW.living_person_stated_at IS DISTINCT FROM OLD.living_person_stated_at))) THEN
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

CREATE OR REPLACE FUNCTION research_dossier_public_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  INSERT INTO research_dossier_public_generation AS kept (singleton, generation) VALUES (true, 1)
  ON CONFLICT (singleton) DO UPDATE SET generation = kept.generation + 1;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_public_changed() FROM PUBLIC;

DROP TRIGGER IF EXISTS research_dossier_public_changed ON research_dossier_public_versions;
CREATE TRIGGER research_dossier_public_changed
  AFTER INSERT OR UPDATE ON research_dossier_public_versions
  FOR EACH STATEMENT EXECUTE FUNCTION research_dossier_public_changed();

DROP TRIGGER IF EXISTS append_only_guard ON research_dossier_public_events;
CREATE TRIGGER append_only_guard
  BEFORE UPDATE OR DELETE ON research_dossier_public_events
  FOR EACH ROW EXECUTE FUNCTION reject_living_evidence_mutation();

-- The public part of a saved dossier, derived here from the private record field by field, exactly as the server's
-- publicDossierOf makes it (dossier-publication.ts): whatever else the record holds never reaches a page. The publish
-- function derives it itself and refuses a copy that is anything else (Codex's review of stage 2, finding 10).
CREATE OR REPLACE FUNCTION research_dossier_pick(source jsonb, wanted text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(source) = 'object' THEN source ELSE '{}'::jsonb END) AS field
   WHERE field.key = ANY(wanted);
$function$;

REVOKE ALL ON FUNCTION research_dossier_pick(jsonb, text[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION research_dossier_public_projection(stored jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  WITH parts AS (
    SELECT stored -> 'topic' ->> 'key' AS topic_key,
           coalesce(stored -> 'stamp', '{}'::jsonb) AS stamp,
           CASE WHEN jsonb_typeof(stored -> 'value' -> 'adds') = 'array' THEN stored -> 'value' -> 'adds'
             ELSE '[]'::jsonb END AS adds
  )
  SELECT jsonb_build_object(
    'schema', 'askrigor.public-dossier.v1',
    'question', stored -> 'question',
    'topic', jsonb_build_object(
      'key', stored -> 'topic' -> 'key',
      'name', stored -> 'topic' -> 'name',
      'other_names', coalesce(stored -> 'topic' -> 'other_names', '[]'::jsonb),
      'related', (SELECT coalesce(jsonb_agg(to_jsonb(related.key) ORDER BY related.first), '[]'::jsonb)
        FROM (SELECT element.key, min(element.place) AS first
                FROM jsonb_array_elements_text(coalesce(stored -> 'topic' -> 'related', '[]'::jsonb))
                     WITH ORDINALITY AS element(key, place)
               WHERE element.key IS DISTINCT FROM parts.topic_key AND element.key ~ '^[a-z0-9][a-z0-9._-]{0,199}$'
               GROUP BY element.key
               ORDER BY min(element.place)
               LIMIT 10) AS related)),
    'forms', coalesce(stored -> 'forms', '[]'::jsonb),
    'searches', (SELECT coalesce(jsonb_agg(research_dossier_pick(item.value, ARRAY['id', 'database', 'query',
        'date_range', 'records_found']) ORDER BY item.place), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(stored -> 'searches', '[]'::jsonb)) WITH ORDINALITY AS item(value, place)),
    'studies', (SELECT coalesce(jsonb_agg(research_dossier_pick(item.value, ARRAY['id', 'identifiers', 'kind', 'form',
        'dose', 'route', 'population', 'comparator', 'design', 'participants', 'read', 'decision', 'decision_reason'])
        ORDER BY item.place), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(stored -> 'studies', '[]'::jsonb)) WITH ORDINALITY AS item(value, place)),
    'results', (SELECT coalesce(jsonb_agg(research_dossier_pick(item.value, ARRAY['id', 'study', 'outcome', 'comparator',
        'follow_up', 'direction', 'certainty', 'figure', 'provenance', 'calculation', 'group_sizes'])
        ORDER BY item.place), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(stored -> 'results', '[]'::jsonb)) WITH ORDINALITY AS item(value, place)),
    'findings', (SELECT coalesce(jsonb_agg(research_dossier_pick(item.value, ARRAY['id', 'claim', 'certainty', 'kind',
        'applies_to', 'form', 'population_key', 'rests_on', 'what_would_change_it', 'importance'])
        || jsonb_build_object('hard_to_find', coalesce(parts.adds ? (item.value ->> 'id'), false))
        ORDER BY item.place), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(stored -> 'findings', '[]'::jsonb)) WITH ORDINALITY AS item(value, place)),
    'coverage', (SELECT coalesce(jsonb_object_agg(area.key, research_dossier_pick(area.value,
        ARRAY['status', 'search', 'reason'])), '{}'::jsonb)
      FROM jsonb_each(coalesce(stored -> 'coverage', '{}'::jsonb)) AS area),
    'open_trails', coalesce(stored -> 'open_trails', '[]'::jsonb),
    'value', research_dossier_pick(stored -> 'value', ARRAY['quick_answer', 'reason', 'confidence'])
      || '{"judged_by": "researching_ai"}'::jsonb,
    'checked', jsonb_build_object(
      'on', left(coalesce(parts.stamp ->> 'saved_at', ''), 10),
      'askrigor_version', coalesce(parts.stamp ->> 'askrigor_version', ''),
      'receipts_checked', coalesce((parts.stamp ->> 'receipts_checked')::numeric, 0),
      'checks', coalesce(parts.stamp -> 'checks', '[]'::jsonb),
      'not_checked', coalesce(parts.stamp -> 'not_checked', '[]'::jsonb),
      'privacy_reading', coalesce(parts.stamp ->> 'privacy_reading' = 'pass', false))
      || CASE WHEN jsonb_typeof(parts.stamp -> 'hrp') = 'string' THEN jsonb_build_object('hrp', parts.stamp -> 'hrp')
           ELSE '{}'::jsonb END
  ) || CASE WHEN stored ? 'community' THEN jsonb_build_object('community', research_dossier_pick(stored -> 'community',
         ARRAY['communities', 'threads_read', 'people', 'report_quality'])) ELSE '{}'::jsonb END
    FROM parts;
$function$;

REVOKE ALL ON FUNCTION research_dossier_public_projection(jsonb) FROM PUBLIC;

-- The owner's standing rule for anything public, "sizes go with every comparison" (publicSizeProblems): every result
-- that compares groups gives each group's size, and every finding that says something helps, harms, makes no measured
-- difference or is mixed rests on a result or study with its size, or on people's reports.
CREATE OR REPLACE FUNCTION research_dossier_public_sizes_complete(dossier jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(dossier -> 'results') AS result(value)
     WHERE (result.value -> 'figure' ->> 'kind' = 'counts' OR result.value ? 'comparator')
       AND result.value -> 'figure' ->> 'kind' IS DISTINCT FROM 'counts'
       AND result.value -> 'group_sizes' -> 'comparator' IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(dossier -> 'findings') AS finding(value)
     WHERE finding.value ->> 'kind' IN ('helps', 'harms', 'no_difference', 'mixed')
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(finding.value -> 'rests_on') AS reference(id)
          WHERE (reference.id = 'community' AND dossier ? 'community')
             OR EXISTS (SELECT 1 FROM jsonb_array_elements(dossier -> 'results') AS result(value)
                 WHERE result.value ->> 'id' = reference.id
                   AND (result.value -> 'figure' ->> 'kind' = 'counts' OR result.value ? 'group_sizes'
                     OR EXISTS (SELECT 1 FROM jsonb_array_elements(dossier -> 'studies') AS study(value)
                       WHERE study.value ->> 'id' = result.value ->> 'study' AND study.value ? 'participants')))
             OR EXISTS (SELECT 1 FROM jsonb_array_elements(dossier -> 'studies') AS study(value)
                 WHERE study.value ->> 'id' = reference.id AND study.value ? 'participants')));
$function$;

REVOKE ALL ON FUNCTION research_dossier_public_sizes_complete(jsonb) FROM PUBLIC;

-- The pages' last check, repeated at admission (Codex's re-review of stage 2, P2: a copy was stored as shown that the
-- pages then left out, and its page answered 404). The pages write every text escaped, so of their last check
-- (atlas/page-guard.ts, rowPassesPageGuard) only two things can stop a text: a findings card's reference (ARF- and four
-- digits) or a YouTube host's name (youtube.com, youtube-nocookie.com, youtu.be), whatever the case, read without
-- Unicode's format characters (Cf, as of Unicode 17, the server's), and with the Kelvin sign read as the k it folds to,
-- the one character outside ASCII that the pages' case-blind check folds onto one of these letters. Each text of the
-- public part, at any depth, is read so; any that would stop a page refuses the copy.
CREATE OR REPLACE FUNCTION research_dossier_public_passes_page_guard(projection jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
      FROM jsonb_path_query(projection, 'strict $.**') AS item(value),
           LATERAL (SELECT translate(regexp_replace(item.value #>> '{}',
             '[­؀-؅؜۝܏࢐-࢑࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F]',
             '', 'g'), chr(8490), 'k') AS shown) AS reading
     WHERE jsonb_typeof(item.value) = 'string'
       AND (reading.shown ~ '[Aa][Rr][Ff]-[0-9]{4}'
         OR reading.shown ~
           '[Yy][Oo][Uu][Tt][Uu]([Bb][Ee](-[Nn][Oo][Cc][Oo][Oo][Kk][Ii][Ee])?\.[Cc][Oo][Mm]|\.[Bb][Ee])'));
$function$;

REVOKE ALL ON FUNCTION research_dossier_public_passes_page_guard(jsonb) FROM PUBLIC;

-- A public part's key, names, other names and forms, trimmed and lower-cased, each once: where another dossier may meet
-- it under another name (research_dossier_public_versions.topic_names).
CREATE OR REPLACE FUNCTION research_dossier_topic_names(projection jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT coalesce(array_agg(DISTINCT name ORDER BY name), '{}'::text[]) FROM (
    SELECT lower(btrim(projection -> 'topic' ->> 'key')) AS name
    UNION ALL SELECT lower(btrim(projection -> 'topic' ->> 'name'))
    UNION ALL SELECT lower(btrim(other)) FROM jsonb_array_elements_text(projection -> 'topic' -> 'other_names') AS other
    UNION ALL SELECT lower(btrim(form)) FROM jsonb_array_elements_text(projection -> 'forms') AS form
  ) AS names
   WHERE name IS NOT NULL AND name <> '';
$function$;

REVOKE ALL ON FUNCTION research_dossier_topic_names(jsonb) FROM PUBLIC;

-- The conflict check's candidates for a new public part (Codex's review of stage 2, finding 3): every shown copy on the
-- same topic or a linked one (either names the other among its related topics), or that meets it under another name
-- (a shared name, other name or form), the dossier's own earlier copy included, with no cap. Ordered by public number.
CREATE OR REPLACE FUNCTION research_dossier_conflict_matches(projection jsonb)
RETURNS TABLE (public_number text, version_number integer, topic_key text, public_payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  WITH target AS (
    SELECT projection -> 'topic' ->> 'key' AS topic,
           ARRAY(SELECT jsonb_array_elements_text(projection -> 'topic' -> 'related')) AS related,
           research_dossier_topic_names(projection) AS names
  )
  SELECT copy.public_number, copy.version_number, copy.topic_key, copy.public_payload
    FROM research_dossier_public_versions copy, target
   WHERE copy.state = 'shown' AND copy.erased_at IS NULL
     AND (copy.topic_key = target.topic OR copy.topic_key = ANY(target.related)
       OR target.topic = ANY(copy.related_topic_keys) OR copy.topic_names && target.names)
   ORDER BY length(copy.public_number), copy.public_number, copy.version_number;
$function$;

REVOKE ALL ON FUNCTION research_dossier_conflict_matches(jsonb) FROM PUBLIC;

-- The candidates for one of the account's own saved versions, a page at a time after a public number and version:
-- the research-access role pages through all of them before its conflict check.
CREATE OR REPLACE FUNCTION research_dossier_conflict_candidates(
  target_account_key text,
  target_version_id uuid,
  after_public_number text,
  after_version_number integer,
  target_limit integer
)
RETURNS TABLE (public_number text, version_number integer, topic_key text, public_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  stored jsonb;
BEGIN
  IF target_account_key IS NULL OR target_account_key !~ '^[a-f0-9]{64}$' OR target_version_id IS NULL
     OR target_limit IS NULL OR target_limit < 1 OR target_limit > 200
     OR (after_public_number IS NULL) <> (after_version_number IS NULL)
     OR (after_public_number IS NOT NULL AND after_public_number !~ '^D-[1-9][0-9]{3,}$') THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_PUBLISH_INPUT_INVALID';
  END IF;
  SELECT version.payload_json INTO stored
    FROM research_dossier_versions version
    JOIN research_dossiers dossier ON dossier.dossier_number = version.dossier_number
   WHERE version.version_id = target_version_id AND dossier.account_key = target_account_key
     AND version.erased_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT match.public_number, match.version_number, match.topic_key, match.public_payload
    FROM research_dossier_conflict_matches(research_dossier_public_projection(stored)) AS match
   WHERE after_public_number IS NULL
      OR (length(match.public_number), match.public_number, match.version_number)
         > (length(after_public_number), after_public_number, after_version_number)
   ORDER BY length(match.public_number), match.public_number, match.version_number
   LIMIT target_limit;
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_conflict_candidates(text, uuid, text, integer, integer) FROM PUBLIC;

-- The per-topic locks (Codex's review of stage 2, finding 4, and his re-review, P0): one transaction-level lock for each
-- topic key, name, other name, form and related topic given, taken in one fixed order (by the lock number), so two
-- writers whose copies could be each other's conflict candidates go one at a time and never wait on each other in a
-- circle. Automatic publication takes them for its new copy; every review transition that changes what is shown takes
-- them for its copies through research_dossier_lock_copy_topics. The only place the locks are taken.
CREATE OR REPLACE FUNCTION research_dossier_lock_topics(keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  lock_key integer;
BEGIN
  FOR lock_key IN
    SELECT DISTINCT hashtext('research_dossier_topic:' || key) FROM unnest(keys) AS key WHERE key IS NOT NULL ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(477002, lock_key);
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_lock_topics(text[]) FROM PUBLIC;

-- A review transition's topic locks (Codex's re-review of stage 2, P0: a review's show committed while an automatic
-- publication waited, and both showed though neither was compared with the other): the same locks automatic
-- publication takes for a copy, for the copy decided and for its dossier's shown copy, which a show supersedes, taken
-- before the transition locks or writes any row. A copy's topics never change (an erasure empties them, and an erased
-- copy is decided no further), so they are read before the locks.
CREATE OR REPLACE FUNCTION research_dossier_lock_copy_topics(target_public_number text, target_version_number integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
BEGIN
  PERFORM research_dossier_lock_topics(ARRAY(
    SELECT key FROM research_dossier_public_versions copy, unnest(copy.topic_names || copy.related_topic_keys) AS key
     WHERE copy.public_number = target_public_number
       AND (copy.version_number = target_version_number OR copy.state = 'shown')));
END
$function$;

REVOKE ALL ON FUNCTION research_dossier_lock_copy_topics(text, integer) FROM PUBLIC;

-- Writes one public copy of a saved version, already in its final state: shown, or held with its reasons. Only for an
-- active free contributor with card saving on whose accepted notice research_dossier_public_notices lists, checked
-- under the same account lock as the private append (0037), so a revocation, a change of mode or the saving switch
-- waits for it or wins. Only the newest version of one of the account's own dossiers, neither withdrawn, rejected nor
-- erased. A copy already written for the version is returned as it is (a retry). A shown copy supersedes the dossier's
-- older shown and held copies; a held one supersedes only older held ones, so a shown copy stays until its successor
-- is checked.
--
-- It takes nothing on trust from the access role (Codex's review of stage 2, finding 10): the public copy, its topic,
-- related topics and digest, where its research ran, whether a privacy reading passed it and whether a claim names a
-- living person are all derived here from the private record. The payload the server checked must be exactly that
-- derivation, and must keep the sizes rule and pass the pages' last check, or nothing is written (payload_refused). Why it is held is derived too:
-- waiting for the privacy reading, not highly confident, names a living person or did not say; only the conflict
-- check's result comes from the server, which made it with AskRigor's paid reader.
--
-- Admission is serialized per topic (Codex's review of stage 2, finding 4): it takes one lock for each of its topic's
-- key, names, other names, forms and related topics, in a fixed order (research_dossier_lock_topics), as every review
-- transition that changes what is shown takes them too (his re-review, P0), so two copies that could be each other's
-- candidates are admitted one at a time; under them it lists the candidates again, and a conflict check made against
-- any other set is refused (comparison_stale), so the server compares again. A check the reader could not make holds
-- the copy, waiting for the conflict check, whenever any shown copy is a candidate.
CREATE OR REPLACE FUNCTION publish_research_dossier_version(
  target_account_key text,
  target_version_id uuid,
  target_payload jsonb,
  target_compared text[],
  target_conflict_check text,
  target_conflicts_with text[],
  target_important_conflict boolean,
  change_time timestamptz
)
RETURNS TABLE (outcome text, public_number text, state text, hold_reasons text[])
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
  next_version integer;
  projection jsonb;
  stamp jsonb;
  reasons text[];
  next_state text;
  topic text;
  related text[];
  names text[];
  candidates text[];
  pending boolean;
BEGIN
  IF target_account_key IS NULL OR target_account_key !~ '^[a-f0-9]{64}$'
     OR target_version_id IS NULL OR change_time IS NULL
     OR target_payload IS NULL OR jsonb_typeof(target_payload) <> 'object'
     OR target_compared IS NULL
     OR EXISTS (SELECT 1 FROM unnest(target_compared) AS compared WHERE compared IS NULL
       OR compared !~ '^D-[1-9][0-9]{3,}/[1-9][0-9]*$')
     OR target_conflict_check IS NULL OR target_conflict_check NOT IN ('read', 'not_read')
     OR (target_conflict_check = 'not_read' AND (target_important_conflict OR cardinality(target_conflicts_with) > 0))
     OR target_conflicts_with IS NULL OR cardinality(target_conflicts_with) > 50
     OR EXISTS (SELECT 1 FROM unnest(target_conflicts_with) AS other WHERE other IS NULL
       OR other !~ '^D-[1-9][0-9]{3,}$')
     OR target_important_conflict IS NULL
     OR (target_important_conflict AND cardinality(target_conflicts_with) = 0) THEN
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
    RETURN QUERY SELECT 'account_refused'::text, NULL::text, NULL::text, NULL::text[];
    RETURN;
  END IF;

  SELECT stored.version_id, stored.dossier_number, stored.version_number, stored.erased_at, stored.payload_json
    INTO version_row
    FROM research_dossier_versions stored
    JOIN research_dossiers dossier ON dossier.dossier_number = stored.dossier_number
   WHERE stored.version_id = target_version_id AND dossier.account_key = target_account_key
     AND dossier.erased_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'version_refused'::text, NULL::text, NULL::text, NULL::text[];
    RETURN;
  END IF;
  -- Writers of one dossier queue, as the private append's do.
  PERFORM 1 FROM research_dossiers dossier WHERE dossier.dossier_number = version_row.dossier_number FOR UPDATE;

  SELECT * INTO existing FROM research_dossier_public_versions copy
   WHERE copy.version_id = target_version_id AND copy.revision_of IS NULL;
  IF FOUND THEN
    RETURN QUERY SELECT 'replayed'::text, existing.public_number, existing.state, existing.hold_reasons;
    RETURN;
  END IF;

  IF version_row.erased_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM research_dossier_versions newer
       WHERE newer.dossier_number = version_row.dossier_number AND newer.version_number > version_row.version_number)
     OR EXISTS (SELECT 1 FROM research_dossier_events event
       WHERE event.version_id = target_version_id AND event.event IN ('withdrawn', 'rejected', 'erased')) THEN
    RETURN QUERY SELECT 'version_refused'::text, NULL::text, NULL::text, NULL::text[];
    RETURN;
  END IF;

  -- The copy, its topic and what holds it, from the private record alone.
  projection := research_dossier_public_projection(version_row.payload_json);
  stamp := coalesce(version_row.payload_json -> 'stamp', '{}'::jsonb);
  topic := projection -> 'topic' ->> 'key';
  IF target_payload IS DISTINCT FROM projection OR topic IS NULL OR topic !~ '^[a-z0-9][a-z0-9._-]{0,199}$'
     OR NOT research_dossier_public_sizes_complete(projection)
     -- The pages' last check, repeated here, so no copy is stored as shown that a page would leave out.
     OR NOT research_dossier_public_passes_page_guard(projection) THEN
    RETURN QUERY SELECT 'payload_refused'::text, NULL::text, NULL::text, NULL::text[];
    RETURN;
  END IF;
  related := ARRAY(SELECT jsonb_array_elements_text(projection -> 'topic' -> 'related'));
  names := research_dossier_topic_names(projection);

  -- One lock per topic key and name, in a fixed order; then the comparison set, which must be the one compared.
  PERFORM research_dossier_lock_topics(names || related);
  candidates := ARRAY(SELECT candidate FROM (SELECT match.public_number || '/' || match.version_number AS candidate
    FROM research_dossier_conflict_matches(projection) AS match) AS listed ORDER BY candidate COLLATE "C");
  IF target_conflict_check = 'read' AND (candidates IS DISTINCT FROM
       ARRAY(SELECT compared FROM unnest(target_compared) AS compared ORDER BY compared COLLATE "C")
     OR EXISTS (SELECT 1 FROM unnest(target_conflicts_with) AS other
       WHERE NOT EXISTS (SELECT 1 FROM unnest(candidates) AS candidate WHERE split_part(candidate, '/', 1) = other))) THEN
    RETURN QUERY SELECT 'comparison_stale'::text, NULL::text, NULL::text, NULL::text[];
    RETURN;
  END IF;
  pending := target_conflict_check = 'not_read' AND cardinality(candidates) > 0;

  reasons := ARRAY(SELECT reason FROM unnest(ARRAY[
      CASE WHEN NOT (projection -> 'checked' -> 'privacy_reading' = 'true'::jsonb) THEN 'privacy_reading_pending' END,
      CASE WHEN projection -> 'value' ->> 'confidence' IS DISTINCT FROM 'high' THEN 'not_high_confidence' END,
      CASE WHEN version_row.payload_json -> 'names_living_people' = 'true'::jsonb THEN 'names_living_people'
        WHEN jsonb_typeof(version_row.payload_json -> 'names_living_people') IS DISTINCT FROM 'boolean'
          THEN 'living_people_undeclared' END,
      CASE WHEN target_important_conflict THEN 'important_conflict' END,
      CASE WHEN pending THEN 'conflict_check_pending' END]) AS reason WHERE reason IS NOT NULL);
  next_state := CASE WHEN cardinality(reasons) = 0 THEN 'shown' ELSE 'held' END;

  SELECT publication.public_number INTO number_text
    FROM research_dossier_publications publication WHERE publication.dossier_number = version_row.dossier_number;
  IF NOT FOUND THEN
    next_public := nextval('research_dossier_public_number_seq');
    number_text := 'D-' || next_public::text;
    INSERT INTO research_dossier_publications (public_number, dossier_number, created_at)
    VALUES (number_text, version_row.dossier_number, change_time);
  END IF;

  -- The copy's own version number, after every copy and revision of the dossier so far.
  SELECT coalesce(max(copy.version_number), 0) + 1 INTO next_version
    FROM research_dossier_public_versions copy WHERE copy.public_number = number_text;

  -- Older copies this one replaces, each with its event.
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  SELECT copy.public_number, copy.version_number, 'superseded', NULL, change_time
    FROM research_dossier_public_versions copy
   WHERE copy.public_number = number_text
     AND (copy.state = 'held' OR (next_state = 'shown' AND copy.state = 'shown'));
  UPDATE research_dossier_public_versions copy
     SET state = 'superseded', hold_reasons = '{}', decided_at = change_time
   WHERE copy.public_number = number_text
     AND (copy.state = 'held' OR (next_state = 'shown' AND copy.state = 'shown'));

  INSERT INTO research_dossier_public_versions (version_id, public_number, version_number, state, topic_key,
    related_topic_keys, topic_names, public_payload, public_sha256, hold_reasons, conflicts_with, origin, privacy_read,
    names_living_person, decided_at, created_at)
  VALUES (target_version_id, number_text, next_version, next_state, topic, related, names, projection,
    encode(sha256(convert_to(projection::text, 'UTF8')), 'hex'), reasons, target_conflicts_with,
    CASE WHEN jsonb_typeof(stamp -> 'origin') = 'object' THEN stamp -> 'origin' ELSE '{}'::jsonb END,
    projection -> 'checked' -> 'privacy_reading' = 'true'::jsonb,
    CASE WHEN jsonb_typeof(version_row.payload_json -> 'names_living_people') = 'boolean'
      THEN (version_row.payload_json ->> 'names_living_people')::boolean END, change_time, change_time);
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  VALUES (number_text, next_version, next_state,
    CASE WHEN next_state = 'held' THEN array_to_string(reasons, ' ') END, change_time);

  RETURN QUERY SELECT 'published'::text, number_text, next_state, reasons;
END
$function$;

REVOKE ALL ON FUNCTION publish_research_dossier_version(
  text, uuid, jsonb, text[], text, text[], boolean, timestamptz
) FROM PUBLIC;

-- The review's list (the owner's, and AskRigor's check of held copies): newest decision first, in a state or every
-- state but erased. No account key; the question and the topic from the copy.
CREATE OR REPLACE FUNCTION list_research_dossier_publications(target_state text, target_limit integer)
RETURNS TABLE (public_number text, version_number integer, dossier_number text, state text, topic_key text,
  question text, hold_reasons text[], conflicts_with text[], origin jsonb, privacy_read boolean, accepted boolean,
  decided_at timestamptz, names_living_person boolean, living_person_decided_by text,
  living_person_decided_at timestamptz, living_person_reason text, revision_of integer, revised_by text,
  revision_reason text, living_person_statement text, living_person_stated_by text, living_person_stated_at timestamptz,
  privacy_reading_outcome text, privacy_reading_reason text, privacy_reading_path text, privacy_reading_at timestamptz,
  privacy_unavailable_reason text, privacy_unavailable_at timestamptz)
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
    copy.living_person_decided_at, copy.living_person_reason, copy.revision_of, copy.revised_by, copy.revision_reason,
    copy.living_person_statement, copy.living_person_stated_by, copy.living_person_stated_at,
    copy.privacy_reading_outcome, copy.privacy_reading_reason, copy.privacy_reading_path, copy.privacy_reading_at,
    copy.privacy_unavailable_reason, copy.privacy_unavailable_at
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
  living_person_decided_by text, living_person_decided_at timestamptz, living_person_reason text, revision_of integer,
  revised_by text, revision_reason text, living_person_statement text, living_person_stated_by text,
  living_person_stated_at timestamptz, privacy_reading_outcome text, privacy_reading_reason text,
  privacy_reading_path text, privacy_reading_at timestamptz, privacy_unavailable_reason text,
  privacy_unavailable_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT copy.public_number, copy.version_number, publication.dossier_number, copy.state, copy.topic_key,
    copy.related_topic_keys, copy.public_payload, copy.public_sha256::text, copy.hold_reasons, copy.conflicts_with,
    copy.origin, copy.privacy_read, copy.accepted_at IS NOT NULL, copy.decided_at, copy.names_living_person,
    copy.living_person_decided_by, copy.living_person_decided_at, copy.living_person_reason, copy.revision_of,
    copy.revised_by, copy.revision_reason, copy.living_person_statement, copy.living_person_stated_by,
    copy.living_person_stated_at, copy.privacy_reading_outcome, copy.privacy_reading_reason, copy.privacy_reading_path,
    copy.privacy_reading_at, copy.privacy_unavailable_reason, copy.privacy_unavailable_at
    FROM research_dossier_public_versions copy
    JOIN research_dossier_publications publication ON publication.public_number = copy.public_number
   WHERE copy.public_number = target_public_number
   ORDER BY copy.version_number DESC;
$function$;

REVOKE ALL ON FUNCTION inspect_research_dossier_publication(text) FROM PUBLIC;

-- The review's decision on one copy: show (a held or taken-down copy), hold (send a shown copy the owner has not
-- accepted back for the check), take_down, or accept (it shows, checked by supervisors). Only the dossier's newest copy can be shown or accepted, and
-- only while its private version is neither withdrawn, rejected nor erased and a privacy reading passed its saved
-- content, when it was saved or later (record_research_dossier_privacy_reading); showing or accepting supersedes the
-- dossier's other shown copy. A copy whose claim names a living person is
-- refused here until the owner's own decision (decide_research_dossier_living_person) has shown it, and so is one whose
-- AI did not say until the owner has stated that no claim names one (state_research_dossier_living_person; Codex's
-- re-review of stage 2, P0: "didn't say" is not "no").
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
  -- The topic's locks, as automatic publication takes them, before any row; then one decision on a dossier at a time.
  PERFORM research_dossier_lock_copy_topics(target_public_number, target_version_number);
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
     OR (target_decision IN ('show', 'accept') AND (copy_row.version_number <> newest
       OR NOT (copy_row.privacy_read OR (copy_row.privacy_reading_outcome IS NOT DISTINCT FROM 'passed'
         AND copy_row.privacy_reading_sha256 IS NOT DISTINCT FROM copy_row.public_sha256))
       OR NOT (copy_row.living_person_decided_at IS NOT NULL OR copy_row.names_living_person IS FALSE
         OR (copy_row.names_living_person IS NULL
           AND copy_row.living_person_statement IS NOT DISTINCT FROM 'names_no_living_person'))
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
-- are published only on his explicit decision; Codex's review of stage 2, finding 2), by its AI's declaration or, when
-- the AI did not say, by his own statement (state_research_dossier_living_person). It needs his typed reason and
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
  -- The topic's locks, as automatic publication takes them, before any row (Codex's re-review of stage 2, P0).
  PERFORM research_dossier_lock_copy_topics(target_public_number, target_version_number);
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
  IF NOT (copy_row.names_living_person IS TRUE
       OR copy_row.living_person_statement IS NOT DISTINCT FROM 'names_a_living_person')
     OR copy_row.living_person_decided_at IS NOT NULL
     OR copy_row.state NOT IN ('held', 'taken_down') OR copy_row.version_number <> newest
     OR NOT (copy_row.privacy_read OR (copy_row.privacy_reading_outcome IS NOT DISTINCT FROM 'passed'
       AND copy_row.privacy_reading_sha256 IS NOT DISTINCT FROM copy_row.public_sha256))
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

-- "Didn't say" is not "no" (Codex's re-review of stage 2, P0): the owner's own statement on a copy whose AI did not say
-- whether a claim names a living person, made once and recorded with who made it (the reviewer login's digest) and
-- when. names_no_living_person lets the ordinary show and accept work; names_a_living_person leaves only his separate
-- decision with a typed reason (decide_research_dossier_living_person). Only the dossier's newest copy, held or taken
-- down, and not yet stated. It shows nothing itself.
CREATE OR REPLACE FUNCTION state_research_dossier_living_person(
  target_public_number text,
  target_version_number integer,
  target_statement text,
  target_stated_by text,
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
     OR target_statement IS NULL OR target_statement NOT IN ('names_no_living_person', 'names_a_living_person')
     OR target_stated_by IS NULL OR target_stated_by !~ '^reviewer:[0-9a-f]{16}$'
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
  IF copy_row.names_living_person IS NOT NULL OR copy_row.living_person_statement IS NOT NULL
     OR copy_row.state NOT IN ('held', 'taken_down') OR copy_row.version_number <> newest THEN
    RETURN QUERY SELECT 'not_decidable'::text, copy_row.state, copy_row.accepted_at IS NOT NULL;
    RETURN;
  END IF;
  UPDATE research_dossier_public_versions copy
     SET living_person_statement = target_statement, living_person_stated_by = target_stated_by,
         living_person_stated_at = change_time
   WHERE copy.public_number = copy_row.public_number AND copy.version_number = copy_row.version_number;
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  VALUES (copy_row.public_number, copy_row.version_number, 'living_person_stated', target_statement, change_time);
  RETURN QUERY SELECT 'stated'::text, copy_row.state, copy_row.accepted_at IS NOT NULL;
END
$function$;

REVOKE ALL ON FUNCTION state_research_dossier_living_person(text, integer, text, text, timestamptz) FROM PUBLIC;

-- The copies waiting for a privacy reading that the server makes once the reader is available again (Codex's re-review
-- of stage 2, P1): held, no reading passed when saved and none made since, least recently tried first; one that was
-- too long for a reading is left to the owner, since its content never changes. With the content and its digest, which
-- the reading is bound to.
CREATE OR REPLACE FUNCTION list_research_dossier_privacy_pending(target_limit integer)
RETURNS TABLE (public_number text, version_number integer, public_payload jsonb, public_sha256 text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
BEGIN
  IF target_limit IS NULL OR target_limit < 1 OR target_limit > 50 THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_REVIEW_INPUT_INVALID';
  END IF;
  RETURN QUERY
  SELECT copy.public_number, copy.version_number, copy.public_payload, copy.public_sha256::text
    FROM research_dossier_public_versions copy
   WHERE copy.state = 'held' AND copy.erased_at IS NULL AND NOT copy.privacy_read
     AND copy.privacy_reading_outcome IS NULL AND copy.privacy_unavailable_reason IS DISTINCT FROM 'too_long'
   ORDER BY copy.privacy_unavailable_at NULLS FIRST, copy.decided_at, copy.public_number, copy.version_number
   LIMIT target_limit;
END
$function$;

REVOKE ALL ON FUNCTION list_research_dossier_privacy_pending(integer) FROM PUBLIC;

-- Records a privacy reading made later of one copy's public content (Codex's re-review of stage 2, P1), on the owner's
-- action or the server's: only for a copy held or taken down that no reading passed when it was saved and none since,
-- and only when the digest of the content read is the copy's own. passed and refused are final for that content, each
-- with its event; unavailable is temporary, kept as the last failed try, and the copy stays waiting. It shows nothing
-- itself: a pass lets the ordinary show and accept work.
CREATE OR REPLACE FUNCTION record_research_dossier_privacy_reading(
  target_public_number text,
  target_version_number integer,
  target_content_sha256 text,
  target_outcome text,
  target_reason text,
  target_path text,
  change_time timestamptz
)
RETURNS TABLE (outcome text, state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  copy_row research_dossier_public_versions%ROWTYPE;
BEGIN
  IF target_public_number IS NULL OR target_public_number !~ '^D-[1-9][0-9]{3,}$'
     OR target_version_number IS NULL OR target_version_number < 1
     OR target_content_sha256 IS NULL OR target_content_sha256 !~ '^[a-f0-9]{64}$'
     OR target_outcome IS NULL OR target_outcome NOT IN ('passed', 'refused', 'unavailable')
     OR (target_outcome = 'passed' AND (target_reason IS NOT NULL OR target_path IS NOT NULL))
     OR (target_outcome <> 'passed' AND target_reason IS NULL)
     OR (target_outcome = 'unavailable' AND target_path IS NOT NULL)
     OR change_time IS NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_REVIEW_INPUT_INVALID';
  END IF;
  PERFORM 1 FROM research_dossier_publications publication
   WHERE publication.public_number = target_public_number FOR UPDATE;
  SELECT * INTO copy_row FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number AND copy.version_number = target_version_number
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text;
    RETURN;
  END IF;
  IF copy_row.state NOT IN ('held', 'taken_down') OR copy_row.privacy_read
     OR copy_row.privacy_reading_outcome IS NOT NULL
     OR copy_row.public_sha256 IS DISTINCT FROM target_content_sha256 THEN
    RETURN QUERY SELECT 'not_readable'::text, copy_row.state;
    RETURN;
  END IF;
  IF target_outcome = 'unavailable' THEN
    UPDATE research_dossier_public_versions copy
       SET privacy_unavailable_reason = target_reason, privacy_unavailable_at = change_time
     WHERE copy.public_number = copy_row.public_number AND copy.version_number = copy_row.version_number;
  ELSE
    UPDATE research_dossier_public_versions copy
       SET privacy_reading_outcome = target_outcome, privacy_reading_sha256 = target_content_sha256,
           privacy_reading_reason = target_reason, privacy_reading_path = target_path, privacy_reading_at = change_time
     WHERE copy.public_number = copy_row.public_number AND copy.version_number = copy_row.version_number;
    INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
    VALUES (copy_row.public_number, copy_row.version_number, 'privacy_reading_' || target_outcome, target_reason,
      change_time);
  END IF;
  RETURN QUERY SELECT 'recorded'::text, copy_row.state;
END
$function$;

REVOKE ALL ON FUNCTION record_research_dossier_privacy_reading(
  text, integer, text, text, text, text, timestamptz
) FROM PUBLIC;

-- A reviewed revision of one finding's importance mark (Codex's review of stage 2, finding 7): never an edit in place,
-- but a new version of the dossier's newest copy, shown or held as it was, with the mark changed and everything else
-- the same, who revised it (the reviewer login's digest) and the reason he typed; the copy it revises is superseded and
-- kept as it was. An accepted copy's revision stays accepted, since the review made it.
CREATE OR REPLACE FUNCTION revise_research_dossier_importance(
  target_public_number text,
  target_version_number integer,
  target_finding text,
  target_importance text,
  target_reason text,
  target_revised_by text,
  change_time timestamptz
)
RETURNS TABLE (outcome text, version_number integer, state text, previous_importance text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  copy_row research_dossier_public_versions%ROWTYPE;
  newest integer;
  place integer;
  previous text;
  revised jsonb;
BEGIN
  IF target_public_number IS NULL OR target_public_number !~ '^D-[1-9][0-9]{3,}$'
     OR target_version_number IS NULL OR target_version_number < 1
     OR target_finding IS NULL OR target_finding !~ '^[a-z][a-z0-9_-]{0,31}$'
     OR target_importance IS NULL OR target_importance NOT IN ('decision_changing', 'important', 'context')
     OR target_reason IS NULL OR target_reason <> btrim(target_reason) OR length(target_reason) NOT BETWEEN 1 AND 200
     OR target_revised_by IS NULL OR target_revised_by !~ '^reviewer:[0-9a-f]{16}$'
     OR change_time IS NULL THEN
    RAISE EXCEPTION 'RESEARCH_DOSSIER_REVIEW_INPUT_INVALID';
  END IF;
  -- The topic's locks, as automatic publication takes them, before any row (Codex's re-review of stage 2, P0).
  PERFORM research_dossier_lock_copy_topics(target_public_number, target_version_number);
  PERFORM 1 FROM research_dossier_publications publication
   WHERE publication.public_number = target_public_number FOR UPDATE;
  SELECT * INTO copy_row FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number AND copy.version_number = target_version_number
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::integer, NULL::text, NULL::text;
    RETURN;
  END IF;
  SELECT max(copy.version_number) INTO newest FROM research_dossier_public_versions copy
   WHERE copy.public_number = target_public_number;
  SELECT item.place - 1, item.value ->> 'importance' INTO place, previous
    FROM jsonb_array_elements(copy_row.public_payload -> 'findings') WITH ORDINALITY AS item(value, place)
   WHERE item.value ->> 'id' = target_finding;
  IF copy_row.state NOT IN ('shown', 'held') OR copy_row.version_number <> newest OR place IS NULL
     OR previous = target_importance THEN
    RETURN QUERY SELECT 'not_revisable'::text, NULL::integer, copy_row.state, previous;
    RETURN;
  END IF;
  revised := jsonb_set(copy_row.public_payload, ARRAY['findings', place::text, 'importance'], to_jsonb(target_importance));
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  VALUES (copy_row.public_number, copy_row.version_number, 'superseded', NULL, change_time);
  UPDATE research_dossier_public_versions copy SET state = 'superseded', hold_reasons = '{}', decided_at = change_time
   WHERE copy.public_number = copy_row.public_number AND copy.version_number = copy_row.version_number;
  INSERT INTO research_dossier_public_versions (public_number, version_number, version_id, detached_at, revision_of,
    revised_by, revision_reason, state, topic_key, related_topic_keys, topic_names, public_payload, public_sha256,
    hold_reasons, conflicts_with, origin, privacy_read, names_living_person, living_person_statement,
    living_person_stated_by, living_person_stated_at, living_person_decided_by,
    living_person_decided_at, living_person_reason, privacy_reading_outcome, privacy_reading_sha256,
    privacy_reading_reason, privacy_reading_path, privacy_reading_at, privacy_unavailable_reason, privacy_unavailable_at,
    accepted_at, decided_at, created_at)
  VALUES (copy_row.public_number, newest + 1, copy_row.version_id, copy_row.detached_at, copy_row.version_number,
    target_revised_by, target_reason, copy_row.state, copy_row.topic_key, copy_row.related_topic_keys,
    copy_row.topic_names, revised, encode(sha256(convert_to(revised::text, 'UTF8')), 'hex'), copy_row.hold_reasons,
    copy_row.conflicts_with, copy_row.origin, copy_row.privacy_read, copy_row.names_living_person,
    copy_row.living_person_statement, copy_row.living_person_stated_by, copy_row.living_person_stated_at,
    copy_row.living_person_decided_by, copy_row.living_person_decided_at, copy_row.living_person_reason,
    -- A revised mark changes one of three fixed words and no text, so a later reading carries to the new version,
    -- bound to its content's digest: a refusal stays final, and a pass is not asked for again.
    copy_row.privacy_reading_outcome, CASE WHEN copy_row.privacy_reading_outcome IS NOT NULL
      THEN encode(sha256(convert_to(revised::text, 'UTF8')), 'hex') END, copy_row.privacy_reading_reason,
    copy_row.privacy_reading_path, copy_row.privacy_reading_at, copy_row.privacy_unavailable_reason,
    copy_row.privacy_unavailable_at,
    copy_row.accepted_at, change_time, change_time);
  INSERT INTO research_dossier_public_events (public_number, version_number, event, reason, happened_at)
  VALUES (copy_row.public_number, newest + 1, 'revised', target_reason, change_time),
         (copy_row.public_number, newest + 1, copy_row.state, NULL, change_time);
  RETURN QUERY SELECT 'revised'::text, newest + 1, copy_row.state, previous;
END
$function$;

REVOKE ALL ON FUNCTION revise_research_dossier_importance(
  text, integer, text, text, text, text, timestamptz
) FROM PUBLIC;

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
           topic_names = '{}', hold_reasons = '{}', conflicts_with = '{}', origin = '{}'::jsonb,
           living_person_decided_by = NULL, living_person_decided_at = NULL, living_person_reason = NULL,
           living_person_statement = NULL, living_person_stated_by = NULL, living_person_stated_at = NULL,
           privacy_reading_outcome = NULL, privacy_reading_sha256 = NULL, privacy_reading_reason = NULL,
           privacy_reading_path = NULL, privacy_reading_at = NULL, privacy_unavailable_reason = NULL,
           privacy_unavailable_at = NULL,
           revision_reason = NULL, erased_at = NEW.happened_at,
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
           topic_names = '{}', hold_reasons = '{}', conflicts_with = '{}', origin = '{}'::jsonb,
           living_person_decided_by = NULL, living_person_decided_at = NULL, living_person_reason = NULL,
           living_person_statement = NULL, living_person_stated_by = NULL, living_person_stated_at = NULL,
           privacy_reading_outcome = NULL, privacy_reading_sha256 = NULL, privacy_reading_reason = NULL,
           privacy_reading_path = NULL, privacy_reading_at = NULL, privacy_unavailable_reason = NULL,
           privacy_unavailable_at = NULL,
           revision_reason = NULL, erased_at = change_time,
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
  copy.decided_at, copy.revision_of IS NOT NULL AS revised
  FROM research_dossier_public_versions copy
 WHERE copy.state IN ('shown', 'superseded') AND copy.erased_at IS NULL
   AND EXISTS (SELECT 1 FROM research_dossier_public_pages shown WHERE shown.public_number = copy.public_number);

-- The topics the pages list (Codex's review of stage 2, finding 8): each shown topic once, with its newest copy's name and
-- how many findings and dossiers it shows, so the list never reads every copy.
CREATE OR REPLACE VIEW research_dossier_public_topics WITH (security_barrier = true) AS
SELECT shown.topic_key,
  (array_agg(shown.public_payload -> 'topic' ->> 'name' ORDER BY shown.shown_at DESC, shown.public_number))[1] AS name,
  sum(jsonb_array_length(shown.public_payload -> 'findings'))::integer AS findings, count(*)::integer AS dossiers
  FROM research_dossier_public_pages shown
 GROUP BY shown.topic_key;

-- The number that moves with every change to the copies, for the pages' caches.
CREATE OR REPLACE VIEW research_dossier_public_changes WITH (security_barrier = true) AS
SELECT coalesce((SELECT kept.generation FROM research_dossier_public_generation kept), 0) AS generation;

COMMENT ON VIEW research_dossier_public_pages IS
  'AskRigor#477 stage 2: the dossier copies the public Atlas shows, for the pages'' reader role.';
COMMENT ON VIEW research_dossier_public_history IS
  'AskRigor#477 stage 2: each shown dossier''s shown and superseded copies, without their content, for its history.';
COMMENT ON VIEW research_dossier_public_topics IS
  'AskRigor#477 stage 2: each topic with shown dossiers, its name and its counts, for the topics list.';
COMMENT ON VIEW research_dossier_public_changes IS
  'AskRigor#477 stage 2: a number that changes with every change to the dossier copies, for the pages'' caches.';

REVOKE ALL ON TABLE research_dossier_public_notices FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_publications FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_versions FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_events FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_pages FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_history FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_topics FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_changes FROM PUBLIC;
REVOKE ALL ON TABLE research_dossier_public_generation FROM PUBLIC;
REVOKE ALL ON SEQUENCE research_dossier_public_number_seq FROM PUBLIC;
-- The reader's default table grants must not expose a held copy, a private origin or the notices list; it reads the
-- four views only.
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
    REVOKE ALL ON TABLE research_dossier_public_topics FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_public_changes FROM askrigor_reader;
    REVOKE ALL ON TABLE research_dossier_public_generation FROM askrigor_reader;
    GRANT SELECT ON TABLE research_dossier_public_pages TO askrigor_reader;
    GRANT SELECT ON TABLE research_dossier_public_history TO askrigor_reader;
    GRANT SELECT ON TABLE research_dossier_public_topics TO askrigor_reader;
    GRANT SELECT ON TABLE research_dossier_public_changes TO askrigor_reader;
  END IF;
END
$$;
