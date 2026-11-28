SET search_path TO __SCHEMA__, public;

-- NULL takes the server or developer-account default. Only the signed-in account form sets a preference.
ALTER TABLE research_use_accounts ADD COLUMN IF NOT EXISTS keep_failed_searches boolean;

-- No row contents in WAL or physical replicas. Exclude the data from logical backups as well.
CREATE UNLOGGED TABLE IF NOT EXISTS research_error_log (
  received_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 86400000),
  tool text NOT NULL CHECK (tool ~ '^[a-z][a-z0-9_]{0,63}$'),
  outcome text NOT NULL CHECK (outcome IN ('error', 'slow')),
  app text NOT NULL CHECK (app IN ('chatgpt', 'claude', 'gemini', 'other', 'unknown')),
  paper_identifiers jsonb NOT NULL CHECK (jsonb_typeof(paper_identifiers) = 'array'),
  kind text CHECK (kind IN ('source_timeout', 'source_http_error', 'source_unavailable',
    'rate_limited', 'validation_error', 'auth_refused', 'internal_error')),
  source text CHECK (source IN ('pubmed', 'europe_pmc', 'openalex', 'clinicaltrials_gov',
    'crossref', 'retraction_watch', 'unpaywall', 'infoaccess', 'publisher', 'youtube', 'gemini', 'reddit', 'atlas', 'server')),
  http_status_class text CHECK (http_status_class IN ('4xx', '5xx')),
  shape jsonb CHECK (jsonb_typeof(shape) = 'object'),
  search_words jsonb CHECK (jsonb_typeof(search_words) = 'object'),
  CHECK ((outcome = 'error' AND kind IS NOT NULL AND source IS NOT NULL AND shape IS NOT NULL)
    OR (outcome = 'slow' AND duration_ms > 10000 AND kind IS NULL AND source IS NULL AND
      http_status_class IS NULL AND shape IS NULL AND search_words IS NULL)),
  CHECK (search_words IS NULL OR source NOT IN ('youtube', 'gemini'))
);

CREATE INDEX IF NOT EXISTS research_error_log_received_at ON research_error_log (received_at);

REVOKE ALL ON TABLE research_error_log FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE research_error_log FROM askrigor_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_research_access') THEN
    GRANT INSERT, DELETE ON TABLE research_error_log TO askrigor_research_access;
    GRANT SELECT (received_at) ON TABLE research_error_log TO askrigor_research_access;
    GRANT UPDATE (keep_failed_searches) ON TABLE research_use_accounts TO askrigor_research_access;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_error_log_reader') THEN
    GRANT USAGE ON SCHEMA __SCHEMA__ TO askrigor_error_log_reader;
    GRANT SELECT ON TABLE research_error_log TO askrigor_error_log_reader;
  END IF;
END
$grants$;
