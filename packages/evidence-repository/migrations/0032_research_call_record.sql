SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS research_call_record (
  account_key text NOT NULL,
  received_at timestamptz NOT NULL,
  tool text NOT NULL CHECK (tool ~ '^[a-z][a-z0-9_]{0,63}$'),
  action text CHECK (action ~ '^[a-z][a-z0-9_]{0,63}$'),
  route text NOT NULL CHECK (route IN ('/mcp', '/mcp/claude', '/mcp/gemini')),
  chatgpt boolean NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('answered', 'refused', 'failed')),
  code text CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 86400000)
);

CREATE INDEX IF NOT EXISTS research_call_record_account_received_at
  ON research_call_record (account_key, received_at DESC);
CREATE INDEX IF NOT EXISTS research_call_record_received_at ON research_call_record (received_at);

REVOKE ALL ON TABLE research_call_record FROM PUBLIC;
-- The canonical reader's default table grants must not expose this private account record.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE research_call_record FROM askrigor_reader;
  END IF;
END
$$;
