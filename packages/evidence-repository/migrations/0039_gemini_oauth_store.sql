SET search_path TO __SCHEMA__, public;

-- Gemini's sign-in (owner answer 386b, 20 November 2026; design docs/superpowers/plans/2026-11-21-gemini-sign-in-design.md):
-- the state of AskRigor's own authorization server for Google's Gemini app. Every row is one record of the
-- oidc-provider library (a login session, an interaction, a code, a token, a grant or a client-assertion replay mark).
-- `key`, `grant_key`, `uid_key` and `account_ref` are HMAC-SHA-256 values under a server-held key, never a token, code,
-- session id or OAuth subject; `payload` is AES-256-GCM ciphertext under another server-held key, bound to its model
-- and key, and holds no code or token value.
CREATE TABLE IF NOT EXISTS gemini_oauth_store (
  model text NOT NULL CHECK (model IN (
    'Session', 'Interaction', 'AuthorizationCode', 'AccessToken', 'RefreshToken', 'Grant', 'ReplayDetection'
  )),
  key bytea NOT NULL CHECK (octet_length(key) = 32),
  payload bytea NOT NULL CHECK (octet_length(payload) BETWEEN 29 AND 65536),
  grant_key bytea CHECK (grant_key IS NULL OR octet_length(grant_key) = 32),
  uid_key bytea CHECK (uid_key IS NULL OR octet_length(uid_key) = 32),
  account_ref bytea CHECK (account_ref IS NULL OR octet_length(account_ref) = 32),
  expires_at timestamptz,
  consumed_at timestamptz,
  PRIMARY KEY (model, key),
  CHECK (account_ref IS NULL OR model = 'Grant'),
  CHECK (uid_key IS NULL OR model = 'Session')
);

CREATE INDEX IF NOT EXISTS gemini_oauth_store_grant_key ON gemini_oauth_store (grant_key) WHERE grant_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS gemini_oauth_store_uid_key ON gemini_oauth_store (uid_key) WHERE uid_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS gemini_oauth_store_account_ref ON gemini_oauth_store (account_ref)
  WHERE account_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS gemini_oauth_store_expires_at ON gemini_oauth_store (expires_at)
  WHERE expires_at IS NOT NULL;

REVOKE ALL ON TABLE gemini_oauth_store FROM PUBLIC;
-- The canonical reader's default table grants must not expose this private sign-in state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN
    REVOKE ALL ON TABLE gemini_oauth_store FROM askrigor_reader;
  END IF;
END
$$;
