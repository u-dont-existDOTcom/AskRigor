# Reciprocal research access and contribution proposals

Status: implementation contract for the 2026-09-01 vertical slice

## Product rule

AskRigor has two research-use modes:

- **Free contributor.** The person explicitly agrees that eligible
  deidentified structured research progress from their use may be submitted to
  AskRigor's shared living-evidence repository. This is the free product.
- **Paid private.** Research progress is not submitted to the shared
  repository. This mode activates only when the account already has a verified
  entitlement. The current slice offers no price, payment provider, or checkout.

This is an ordinary product access choice. It is not an institutional research
program, a study-enrollment system, a public forum, or a claim that product
usage itself is scientific evidence.

## Exact notice

The version is `free-contributor-v1-2026-09-01`. The server returns the complete
notice from `RESEARCH_USE_NOTICE`. Free mode activates only when all four
versioned agreement fields are literal `true`. Silence, inferred consent, a
different notice version, or a partially checked agreement is rejected.

`manage_research_access` is the OAuth-scoped operation for `inspect`,
`accept_free_contributor`, `activate_paid_private`, and `revoke`. It is declared
as a write to MCP clients. Revocation blocks later research calls and withdraws
every still-pending proposal from that account. It does not silently rewrite an
already accepted deidentified canonical record.

## Identity boundary

Auth0 authenticates the connected account and supplies a stable OAuth subject.
AskRigor never stores that raw subject or an email/contact field in the research
repository. A server-held secret derives:

```text
HMAC-SHA-256("askrigor:research-use-account:v1\0" || oauth_subject)
```

Only the 64-character result is stored as `account_key`. Account/mode records
remain separate from the proposal JSON. The proposal JSON is forbidden from
containing an account identity.

The configured owner subject is no longer a global allowlist for ordinary
research users. It remains an independent allowlist inside
`review_evidence_gap_submissions` and `review_research_contribution`; a public
user cannot obtain cross-user case or proposal review merely by carrying
`cases:review` in a token.

## Proposal boundary

`submit_research_contribution` is available only in active free-contributor
mode. It accepts one of the two already canonical strict payload shapes:

1. `RESEARCH_FRONTIER`: formal discovery lanes, exact coverage windows and
   receipts, candidates and decisions, open/blocked trails, and partial state.
2. `SOURCE_ANALYSIS`: a source-bound study-method or review-method analysis,
   including the complete performed AskRigor-authored analysis when available,
   its exact hashes/receipts, domain findings, limitations, and future-analysis
   items.

Partial formal corpora are accepted and labeled `partial`; incomplete coverage
does not make observed records ineligible. A topic-only narrative is not a
source-analysis proposal. YouTube, Reddit, forums, and other community-source
records remain outside this durable boundary.

Every proposal repeats literal false markers for:

- raw chat;
- prompt text;
- account identity in the payload;
- private health narratives;
- upload content;
- raw source content;
- raw provider responses; and
- community data.

The existing prohibited-key walk, exact contribution schemas, whole-analysis
hash, deidentified-query hash, formal-provider constraints, and a basic obvious
contact/credential screen run before storage. These deterministic checks reduce
risk but do not prove complete deidentification; this is one reason proposals
remain pending review.

## No automatic evidence authority

The public runtime can insert only into `research_contribution_proposals`.
New rows are `PENDING_REVIEW`. It has no insert/update authority on canonical
analysis, claim, source, assessment, or frontier tables. A proposal does not
become evidence, raise evidence quality, establish causality, or become current
knowledge merely because it exists or is repeated.

`review_research_contribution` lets the allowlisted owner inspect one exact
proposal, query its status, or accept/reject it with a reason. Acceptance and
creation of a hash-bound `PENDING` promotion intent occur in the same database
transaction. Rejection creates no intent. The owner tool returns no account key
and has no canonical writer credential.

Canonical promotion remains a separate maintainer operation. The one-shot
`living-evidence-admin promote-accepted` command locks one pending intent,
reruns the strict contribution preparation, dispatches to the existing
`contribute` or `contributeFrontier` writer, and stores an exact stable-JSON
receipt and SHA-256. A crash after the canonical writer commits but before the
intent receipt commits leaves the intent pending; retry uses the canonical
writer's existing idempotency key and then completes the receipt. The command
processes at most one intent per invocation. Automatic scheduling is outside
this local slice.

## Database model

Migration `0009_research_contributor_access.sql` creates:

| Table | Stored data | Public runtime authority |
| --- | --- | --- |
| `research_use_accounts` | HMAC account key, active/revoked state, mode, exact notice/agreement, timestamps | select/insert/update |
| `research_private_entitlements` | HMAC account key, verified source, active/revoked state, optional hashed external reference, validity window | select only |
| `research_contribution_proposals` | HMAC account key outside payload JSON, kind, strict payload/hash, false privacy markers, partial label, review state/timestamps | select/insert only |

The role receives execute permission on one security-definer function that can
only turn pending rows for the supplied HMAC account key into `WITHDRAWN`.
The service derives that key from the authenticated OAuth subject and never
accepts it from a client. Account revocation and pending withdrawal commit in
one database transaction. A database trigger also refuses a proposal unless
its account is still active in free-contributor mode, closing a concurrent
late-submit race.
It cannot grant an entitlement, accept/reject a proposal, write canonical
evidence, delete/truncate data, create objects, or read unrelated repository
tables.

Migration `0010_research_contribution_review.sql` adds the
`research_contribution_promotions` outbox and two security-definer functions.
The distinct `askrigor_research_review` database role receives only schema use
and execute permission on those exact inspect/decide functions. It has no
direct table privilege. The functions omit `account_key`, lock a proposal for
each decision, require the owner-reviewed payload hash and a nonempty reason,
and bind an accepted intent to the proposal kind and hash with a composite
foreign key. The separate admin writer retains its existing canonical write
authority and processes the outbox independently.

## Runtime and failure behavior

When the OAuth resource server is configured, every ordinary MCP research
operation requires `research:use` and an active mode. The two mode/proposal
operations also require `research:use`; case and contribution review retain
`cases:review` plus the owner-subject allowlist. Invalid/stale tokens,
unregistered/revoked access,
expired private entitlement, an unavailable access store, and malformed
proposals fail closed.

Legacy public research Action routes are removed from the effective Action
catalog when OAuth research access is active so they cannot bypass the mode
choice. The lesson-feedback Action remains separately governed. The Gemini
compatibility catalog remains at 22 tools and does not expose the mode,
proposal-submission, proposal-review, catalog-search, or case-review operations;
the primary ChatGPT/Codex plugin is the supported surface for this slice.

## Known limitations and next slice

- There is no checkout or self-service purchase flow.
- Promotion scheduling is not active; an operator must invoke the one-shot
  command once per pending intent.
- The deterministic privacy screen cannot recognize every indirect identifier.
- Pending proposal retention is operator-managed rather than automatically
  expiring in this slice.
- This local candidate has not been merged, deployed, or installed into the
  owner ChatGPT/plugin surface.

The recommended next slice is bounded release synchronization: review and merge
the candidate, migrate and provision the distinct review role, deploy the exact
image, invoke one synthetic promotion, and perform fresh owner-interface
acceptance with rollback receipts.
