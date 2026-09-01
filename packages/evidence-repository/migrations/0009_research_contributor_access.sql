CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS research_use_accounts (
  account_key char(64) PRIMARY KEY
    CHECK (account_key ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  mode text CHECK (mode IN ('FREE_CONTRIBUTOR', 'PAID_PRIVATE')),
  notice_version text,
  agreement_json jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(agreement_json) = 'object'),
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (
    (status = 'ACTIVE' AND mode IS NOT NULL AND activated_at IS NOT NULL
      AND revoked_at IS NULL)
    OR
    (status = 'REVOKED' AND mode IS NULL AND activated_at IS NULL
      AND revoked_at IS NOT NULL)
  ),
  CHECK (
    mode <> 'FREE_CONTRIBUTOR'
    OR (
      notice_version = 'free-contributor-v1-2026-09-01'
      AND agreement_json <> '{}'::jsonb
    )
  ),
  CHECK (
    mode <> 'PAID_PRIVATE'
    OR (notice_version IS NULL AND agreement_json = '{}'::jsonb)
  ),
  CHECK (created_at <= updated_at),
  CHECK (activated_at IS NULL OR created_at <= activated_at),
  CHECK (revoked_at IS NULL OR created_at <= revoked_at)
);

COMMENT ON TABLE research_use_accounts IS
  'Pseudonymous OAuth-subject HMAC keys and current AskRigor research-use mode. No raw OAuth subject or contact field is stored.';

CREATE TABLE IF NOT EXISTS research_private_entitlements (
  entitlement_id uuid PRIMARY KEY,
  account_key char(64) NOT NULL
    REFERENCES research_use_accounts(account_key),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  source text NOT NULL CHECK (source IN ('OWNER_GRANTED', 'BILLING_PROVIDER')),
  external_reference_sha256 char(64)
    CHECK (external_reference_sha256 IS NULL OR external_reference_sha256 ~ '^[a-f0-9]{64}$'),
  granted_at timestamptz NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at IS NULL OR granted_at < expires_at),
  CHECK (
    (status = 'ACTIVE' AND revoked_at IS NULL)
    OR (status = 'REVOKED' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS research_private_entitlements_lookup_idx
  ON research_private_entitlements (account_key, status, granted_at DESC);

COMMENT ON TABLE research_private_entitlements IS
  'Verified private-access entitlements only. The public runtime may inspect but never grant an entitlement.';

CREATE TABLE IF NOT EXISTS research_contribution_proposals (
  proposal_id uuid PRIMARY KEY,
  account_key char(64) NOT NULL
    REFERENCES research_use_accounts(account_key),
  proposal_kind text NOT NULL CHECK (
    proposal_kind IN ('RESEARCH_FRONTIER', 'SOURCE_ANALYSIS')
  ),
  payload_sha256 char(64) NOT NULL
    CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  privacy_boundary_json jsonb NOT NULL
    CHECK (jsonb_typeof(privacy_boundary_json) = 'object'),
  partial boolean NOT NULL,
  status text NOT NULL CHECK (
    status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN')
  ),
  created_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  review_reason text,
  UNIQUE (account_key, proposal_kind, payload_sha256),
  CHECK (
    (status = 'PENDING_REVIEW' AND reviewed_at IS NULL AND review_reason IS NULL)
    OR
    (status <> 'PENDING_REVIEW' AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS research_contribution_proposals_review_idx
  ON research_contribution_proposals
  (status, created_at, proposal_id)
  WHERE status = 'PENDING_REVIEW';

COMMENT ON TABLE research_contribution_proposals IS
  'Validated deidentified formal-research proposals awaiting separate review. Rows are not canonical evidence merely because they exist here.';

