CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS evidence_gap_submissions (
  submission_id uuid PRIMARY KEY,
  gap_slug text NOT NULL CHECK (gap_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  participant_pseudonym text NOT NULL UNIQUE
    CHECK (participant_pseudonym ~ '^ARCASE-[A-Z0-9]{12}$'),
  recovery_key_sha256 char(64) NOT NULL
    CHECK (recovery_key_sha256 ~ '^[a-f0-9]{64}$'),
  provenance text NOT NULL CHECK (provenance IN (
    'SELF', 'DIRECT_OBSERVER', 'SUBJECT_RELAYED', 'HEARSAY'
  )),
  narrative_key_id text,
  narrative_nonce text,
  narrative_ciphertext text,
  narrative_auth_tag text,
  structured_json jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(structured_json) = 'object'),
  consent_json jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(consent_json) = 'object'),
  status text NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'WITHDRAWN')),
  completeness_label text NOT NULL
    CHECK (completeness_label IN ('DRAFT', 'PARTIAL', 'SUBSTANTIAL')),
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(missing_fields) = 'array'),
  created_at timestamptz NOT NULL,
  narrative_saved_at timestamptz,
  structured_saved_at timestamptz,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz NOT NULL,
  CHECK (
    (narrative_ciphertext IS NULL AND narrative_key_id IS NULL
      AND narrative_nonce IS NULL AND narrative_auth_tag IS NULL)
    OR
    (narrative_ciphertext IS NOT NULL AND narrative_key_id IS NOT NULL
      AND narrative_nonce IS NOT NULL AND narrative_auth_tag IS NOT NULL)
  ),
  CHECK ((narrative_saved_at IS NULL) = (narrative_ciphertext IS NULL)),
  CHECK (structured_saved_at IS NULL OR narrative_saved_at IS NOT NULL),
  CHECK (submitted_at IS NULL OR (narrative_saved_at IS NOT NULL
    AND structured_saved_at IS NOT NULL)),
  CHECK ((status = 'SUBMITTED') = (submitted_at IS NOT NULL AND withdrawn_at IS NULL)),
  CHECK ((status = 'WITHDRAWN') = (withdrawn_at IS NOT NULL)),
  CHECK ((status = 'SUBMITTED') = (consent_json <> '{}'::jsonb)),
  CHECK (status <> 'SUBMITTED' OR completeness_label IN ('PARTIAL', 'SUBSTANTIAL')),
  CHECK (status <> 'WITHDRAWN' OR (
    narrative_ciphertext IS NULL AND structured_json = '{}'::jsonb
    AND consent_json = '{}'::jsonb AND missing_fields = '[]'::jsonb
  )),
  CHECK (created_at <= updated_at),
  CHECK (narrative_saved_at IS NULL OR created_at <= narrative_saved_at),
  CHECK (structured_saved_at IS NULL OR narrative_saved_at <= structured_saved_at),
  CHECK (submitted_at IS NULL OR structured_saved_at <= submitted_at),
  CHECK (withdrawn_at IS NULL OR created_at <= withdrawn_at)
);

CREATE INDEX IF NOT EXISTS evidence_gap_submissions_review_queue_idx
  ON evidence_gap_submissions (gap_slug, status, submitted_at, submission_id)
  WHERE status = 'SUBMITTED';

COMMENT ON TABLE evidence_gap_submissions IS
  'Private pseudonymous public-form submissions. Narrative bytes are application-encrypted; withdrawn rows retain no case content.';
