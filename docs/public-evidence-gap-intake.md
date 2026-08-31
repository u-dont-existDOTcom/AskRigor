# Public evidence-gap intake

## Product intent

This slice lets a visitor help answer one specific unresolved question by
describing a case as best they can. It is a public self-serve form, not a
community forum, clinical study workflow, or institutional research program.

The first route is:

`/evidence-gaps/prolactinoma-spontaneous-remission`

The page asks for remission cases and equal-value comparison cases, including
people who experienced the same suspected transition without remission. It
accepts incomplete structured fields and labels the submission `PARTIAL`
instead of excluding it.

AskRigor's plugin remains publicly installable. Its 22 research operations and
this contribution form do not require login. Authentication is limited to the
operation that retrieves stored submissions belonging to other users.

## Participant flow

1. The visitor states whether the account is firsthand, directly observed,
   relayed by the subject, or hearsay.
2. AskRigor saves an unprompted account before showing candidate transitions.
3. The visitor adds whatever structured context they know. Every field at this
   stage is optional.
4. The visitor explicitly permits private AskRigor/GPT analysis and acknowledges
   that the form is observational, not diagnosis or treatment advice.
5. AskRigor returns a pseudonymous case ID and one-time recovery key. The key
   can inspect or withdraw that case; the database retains only its SHA-256.

There is no account, name, email address, public participant profile, or public
case page in this slice. Follow-up means a participant can return with the
recovery key; no outbound contact system is implied.

## Data and service boundary

Migration `0008_public_evidence_gap_intake.sql` creates one private table,
`evidence_gap_submissions`. The service boundary is
`PublicEvidenceGapIntakeService` with in-memory and PostgreSQL stores.

Stored fields are:

- UUID submission ID and random pseudonym;
- recovery-key SHA-256;
- provenance class;
- AES-256-GCM narrative envelope and key identifier;
- optional structured health/timing fields;
- consent state, completeness/missingness, lifecycle state, and timestamps.

The encryption key is a runtime secret and is not stored in PostgreSQL. The
structured JSON remains private database content but is not independently
application-encrypted in this MVP. A withdrawal clears the narrative envelope,
structured JSON, consent, and review-queue membership from the active row. A
content-free withdrawal record remains. Any production backup-retention effect
must be stated accurately in the public privacy notice before deployment.

## Runtime configuration

The feature is absent unless all settings are valid:

- `ASKRIGOR_EVIDENCE_GAP_INTAKE_ENABLED=true`
- `ASKRIGOR_EVIDENCE_GAP_DATABASE_URL`
- `ASKRIGOR_EVIDENCE_GAP_DATABASE_SCHEMA` (defaults to `living_evidence`)
- `ASKRIGOR_EVIDENCE_GAP_DATABASE_SSLMODE=disable|require`
- `ASKRIGOR_EVIDENCE_GAP_ENCRYPTION_KEY_BASE64URL` (exactly 32 bytes decoded)
- `ASKRIGOR_EVIDENCE_GAP_ENCRYPTION_KEY_ID`
- `ASKRIGOR_EVIDENCE_GAP_REVIEW_API_KEY` (at least 32 UTF-8 bytes)

The optional ChatGPT/Codex review operation additionally requires:

- `ASKRIGOR_OAUTH_ENABLED=true`
- `ASKRIGOR_OAUTH_RESOURCE_URL` (the canonical HTTPS MCP resource URL)
- `ASKRIGOR_OAUTH_ISSUER_URL` (the exact authorization-server issuer)
- `ASKRIGOR_OAUTH_JWKS_URL` (the issuer's HTTPS signing-key set)

The authorization server is external to this slice and must support the MCP
OAuth 2.1 flow. AskRigor verifies JWT signature, issuer, audience, expiry,
client identity, and scopes. The private tool additionally requires
`cases:review`. Invalid or stale tokens do not disable anonymous research
tools; they are treated as unauthenticated for the protected tool.

Public mutation routes are JSON-only, same-origin when an Origin header is
present, request-size limited, rate limited, and honeypot checked. Participant
inspection and withdrawal require that case's recovery key. The private review
route requires the separate review bearer secret.

## GPT review projection

`GET /internal/evidence-gaps/:slug/review-queue` returns only submitted cases
to an authenticated AskRigor/GPT consumer. Each item preserves:

- provenance;
- `PARTIAL` versus `SUBSTANTIAL` completeness and named missing fields;
- participant-reported structured data;
- the unprompted narrative after basic email, phone, and URL pattern removal;
- `L1_STRUCTURED_CASE` and `PARTICIPANT_REPORTED_UNVERIFIED` labels;
- a warning that deterministic redaction cannot guarantee removal of names,
  places, rare events, or indirect identifiers.

The projection includes descriptive counts of remission/regression and
non-remission/comparison cases. It returns `causalAnalysisPermitted: false`.
The system does not diagnose remission, infer cause, recommend treatment, or
equate completeness with verification.

The public MCP catalog exposes the same projection through
`review_evidence_gap_submissions`. Its per-tool security metadata requires
OAuth scope `cases:review`; an unauthenticated invocation returns the standard
MCP `mcp/www_authenticate` challenge. Participant recovery keys still authorize
only inspection and withdrawal of that participant's own case and cannot call
the cross-user review operation.

## Adding another evidence gap

The current allowlist intentionally contains only the prolactinoma gap. A new
gap should add a reviewed definition and slug, then reuse the same intake and
review service. Future event types belong in optional structured attributes;
they should not make a participant's otherwise useful submission ineligible.

## MVP limitations

- No document uploads, OCR, or document-derived verification.
- No email/contact collection or outbound follow-up delivery.
- No public aggregate dashboard or public case display.
- No automated causal or statistical analysis.
- Basic narrative contact redaction is not full de-identification.
- Production deployment, final public privacy-notice text, provider disclosure,
  retention/backups, and encryption-key operation are not completed by this
  local implementation slice.
