SET search_path TO __SCHEMA__, public;

-- The owner, 6 November 2026: "we should also have a section for results that challenge mainstream consensus even if
-- it's available with a standard ai answer, like this one" (a finding that, after a year, about half of people with
-- obesity and moderate-to-severe sleep apnea reached remission or mild sleep apnea without daytime sleepiness on
-- tirzepatide, when the usual advice is CPAP every night). A publication may carry a challenge mark: the usual view in
-- one plain line, its source (a label and an https link), the quick-answer test's verdict for the finding (pass,
-- headline or fail), who marked it (the reviewer login's digest, reviewer: and 16 hex characters, never the login
-- itself) and when. Marking shows nothing: a finding kept for research stays kept. The pages show the mark of a shown
-- finding, with its usual view and source, and list the shown ones on their own section page; a marked fail or headline
-- says a quick AI answer may already give the finding. The review role writes through mark_atlas_challenges and reads
-- through inspect_atlas_challenges (the provisioning script grants exactly those); the reader reads the columns for the
-- pages, never who marked it. Existing functions keep their shapes. Safe to run again: every migration runs on each
-- start, in one transaction.

ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS challenge_usual_view text;
ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS challenge_source_url text;
ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS challenge_source_label text;
ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS challenge_verdict text;
ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS challenge_marked_by text;
ALTER TABLE atlas_publications ADD COLUMN IF NOT EXISTS challenge_marked_at timestamptz;

ALTER TABLE atlas_publications DROP CONSTRAINT IF EXISTS atlas_publications_v1_challenge_check;
ALTER TABLE atlas_publications ADD CONSTRAINT atlas_publications_v1_challenge_check CHECK (
  (challenge_marked_at IS NULL) = (challenge_usual_view IS NULL)
  AND (challenge_marked_at IS NULL) = (challenge_source_url IS NULL)
  AND (challenge_marked_at IS NULL) = (challenge_source_label IS NULL)
  AND (challenge_marked_at IS NULL) = (challenge_verdict IS NULL)
  AND (challenge_marked_at IS NULL) = (challenge_marked_by IS NULL)
  AND (challenge_usual_view IS NULL OR (challenge_usual_view = btrim(challenge_usual_view)
    AND length(challenge_usual_view) BETWEEN 1 AND 300 AND challenge_usual_view !~ '[[:cntrl:]]'
    AND challenge_usual_view !~ '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]'))
  AND (challenge_source_label IS NULL OR (challenge_source_label = btrim(challenge_source_label)
    AND length(challenge_source_label) BETWEEN 1 AND 200 AND challenge_source_label !~ '[[:cntrl:]]'
    AND challenge_source_label !~ '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]'))
  AND (challenge_source_url IS NULL OR (challenge_source_url ~ '^https://[^[:space:][:cntrl:]]+$'
    AND challenge_source_url !~ '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]'
    AND length(challenge_source_url) <= 2000))
  AND (challenge_verdict IS NULL OR challenge_verdict IN ('pass', 'headline', 'fail'))
  AND (challenge_marked_by IS NULL OR challenge_marked_by ~ '^reviewer:[0-9a-f]{16}$')
);

CREATE INDEX IF NOT EXISTS atlas_publications_challenge_idx ON atlas_publications (publication_number)
  WHERE challenge_marked_at IS NOT NULL;

COMMENT ON COLUMN atlas_publications.challenge_usual_view IS
  'The usual view the finding challenges, in one plain line (the owner, 6 November 2026); the pages show it beside the finding.';
COMMENT ON COLUMN atlas_publications.challenge_source_url IS
  'The https link to the usual view''s source, such as a major guideline; the pages link it.';
COMMENT ON COLUMN atlas_publications.challenge_source_label IS
  'The words the pages show for the usual view''s source.';
COMMENT ON COLUMN atlas_publications.challenge_verdict IS
  'The quick-answer test''s verdict for the finding: pass, headline or fail. A marked headline or fail says a quick AI answer may already give it.';
COMMENT ON COLUMN atlas_publications.challenge_marked_by IS
  'Who marked it: reviewer: and 16 hex characters of a digest of the reviewer login; never shown on a page.';
COMMENT ON COLUMN atlas_publications.challenge_marked_at IS
  'When the challenge mark was set; NULL when the publication carries none.';

-- Marks the publications named, by P number, as challenging the usual view, with that view, its source, the
-- quick-answer test's verdict and who marked them; with every mark field NULL, clears their marks. At most 100
-- numbers. Only a publication the pages can show, or one kept for research, can be marked: ATLAS_PUBLICATION_NOT_MARKABLE,
-- and nothing changes, for a held, rejected or withdrawn one. Clearing takes any but one that shows unreviewed, not kept,
-- with the verdict headline or fail, which only its mark explains: ATLAS_PUBLICATION_NOT_CLEARABLE, and nothing changes
-- (keep it for research first, or its page would say a quick AI answer misses it). The text checks of the mark refuse
-- control characters and the text-direction and zero-width characters (the store refuses every Unicode format
-- character before it calls this). Returns each publication named.
CREATE OR REPLACE FUNCTION mark_atlas_challenges(
  target_publication_numbers text[],
  usual_view text,
  source_url text,
  source_label text,
  verdict text,
  marked_by text,
  change_time timestamptz
)
RETURNS TABLE (mark_publication_number text, mark_state text, mark_atlas_number text, mark_kept boolean,
  mark_usual_view text, mark_source_url text, mark_source_label text, mark_verdict text, mark_marked_by text,
  mark_marked_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
DECLARE
  target atlas_publications%ROWTYPE;
  marking boolean := usual_view IS NOT NULL;
BEGIN
  IF target_publication_numbers IS NULL
     OR cardinality(target_publication_numbers) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(target_publication_numbers) AS given(number) WHERE given.number IS NULL
                OR given.number !~ '^P-[1-9][0-9]{3,}$')
     OR change_time IS NULL
     OR (marking AND (source_url IS NULL OR source_label IS NULL OR verdict IS NULL OR marked_by IS NULL))
     OR (NOT marking AND (source_url IS NOT NULL OR source_label IS NOT NULL OR verdict IS NOT NULL
                          OR marked_by IS NOT NULL))
     OR (marking AND (usual_view <> btrim(usual_view) OR length(usual_view) NOT BETWEEN 1 AND 300
                      OR usual_view ~ '[[:cntrl:]]'
                      OR usual_view ~ '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]'
                      OR source_label <> btrim(source_label) OR length(source_label) NOT BETWEEN 1 AND 200
                      OR source_label ~ '[[:cntrl:]]'
                      OR source_label ~ '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]'
                      OR source_url !~ '^https://[^[:space:][:cntrl:]]+$' OR length(source_url) > 2000
                      OR source_url ~ '[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]'
                      OR verdict NOT IN ('pass', 'headline', 'fail')
                      OR marked_by !~ '^reviewer:[0-9a-f]{16}$'))
  THEN
    RAISE EXCEPTION 'ATLAS_PUBLICATION_INPUT_INVALID';
  END IF;
  FOR target IN
    SELECT * FROM atlas_publications stored
     WHERE stored.publication_number = ANY(target_publication_numbers)
     ORDER BY substring(stored.publication_number FROM 3)::bigint
     FOR UPDATE
  LOOP
    IF marking THEN
      IF NOT ((target.state = 'unreviewed' AND target.published_json IS NOT NULL) OR target.state IN ('accepted', 'edited'))
      THEN
        RAISE EXCEPTION 'ATLAS_PUBLICATION_NOT_MARKABLE';
      END IF;
      UPDATE atlas_publications stored
         SET challenge_usual_view = usual_view, challenge_source_url = source_url,
             challenge_source_label = source_label, challenge_verdict = verdict,
             challenge_marked_by = marked_by, challenge_marked_at = change_time
       WHERE stored.publication_number = target.publication_number;
    ELSE
      IF target.state = 'unreviewed' AND target.kept_for_research_at IS NULL AND target.challenge_verdict IS NOT NULL
         AND target.challenge_verdict <> 'pass' THEN
        RAISE EXCEPTION 'ATLAS_PUBLICATION_NOT_CLEARABLE';
      END IF;
      UPDATE atlas_publications stored
         SET challenge_usual_view = NULL, challenge_source_url = NULL, challenge_source_label = NULL,
             challenge_verdict = NULL, challenge_marked_by = NULL, challenge_marked_at = NULL
       WHERE stored.publication_number = target.publication_number;
    END IF;
  END LOOP;
  RETURN QUERY
  SELECT stored.publication_number, stored.state, stored.atlas_number, stored.kept_for_research_at IS NOT NULL,
         stored.challenge_usual_view, stored.challenge_source_url, stored.challenge_source_label,
         stored.challenge_verdict, stored.challenge_marked_by, stored.challenge_marked_at
    FROM atlas_publications stored
   WHERE stored.publication_number = ANY(target_publication_numbers)
   ORDER BY substring(stored.publication_number FROM 3)::bigint;
END
$function$;

REVOKE ALL ON FUNCTION mark_atlas_challenges(text[], text, text, text, text, text, timestamptz) FROM PUBLIC;

-- Every publication that carries a challenge mark, shown, kept or not, with who marked it and when.
CREATE OR REPLACE FUNCTION inspect_atlas_challenges()
RETURNS TABLE (mark_publication_number text, mark_state text, mark_atlas_number text, mark_kept boolean,
  mark_usual_view text, mark_source_url text, mark_source_label text, mark_verdict text, mark_marked_by text,
  mark_marked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = __SCHEMA__, pg_catalog, pg_temp
AS $function$
  SELECT stored.publication_number, stored.state, stored.atlas_number, stored.kept_for_research_at IS NOT NULL,
         stored.challenge_usual_view, stored.challenge_source_url, stored.challenge_source_label,
         stored.challenge_verdict, stored.challenge_marked_by, stored.challenge_marked_at
    FROM atlas_publications stored
   WHERE stored.challenge_marked_at IS NOT NULL
   ORDER BY substring(stored.publication_number FROM 3)::bigint
$function$;

REVOKE ALL ON FUNCTION inspect_atlas_challenges() FROM PUBLIC;
