# Reciprocal research access and contribution proposals

Status: implementation contract for the 2026-09-01 vertical slice

## Product rule

AskRigor has two research-use modes:

- **Free contributor.** The person explicitly agrees that what AskRigor learns
  from their use is saved: eligible deidentified structured research progress
  may be submitted to AskRigor's shared living-evidence repository, and each
  finished research answer's findings card is saved to AskRigor's private
  findings library for review (owner decision Q11, 2026-09-30; see
  `docs/privacy-data-map.md`). This is the free product.
- **Paid private.** No research progress is submitted. Research findings and
  lesson feedback are saved only when the user accepts saving them for that
  answer. This mode activates only when the account already has a verified
  entitlement. The current slice offers no price, payment provider, or
  checkout.

This is an ordinary product access choice. It is not an institutional research
program, a study-enrollment system, a public forum, or a claim that product
usage itself is scientific evidence.

## Exact notice

The version is `free-contributor-v2-2026-09-30`. The server returns the complete
notice from `RESEARCH_USE_NOTICE`. Free mode activates only when all four
versioned agreement fields are literal `true`. Silence, inferred consent, a
different notice version, or a partially checked agreement is rejected.

The first version, `free-contributor-v1-2026-09-01`, did not mention findings
cards. A free account that accepted it inspects as `UNENROLLED`, and research
tools refuse it with `RESEARCH_ACCESS_REQUIRED`, until it accepts the current
version. Migration `0011_research_use_notice_v2` lets `research_use_accounts`
hold either version; the one-shot admin `migrate` applies it at release.

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
mode. It accepts one of three strict payload shapes:

1. `RESEARCH_FRONTIER`: formal discovery lanes, exact coverage windows and
   receipts, candidates and decisions, open/blocked trails, and partial state.
2. `SOURCE_ANALYSIS`: a source-bound study-method or review-method analysis,
   including the complete performed AskRigor-authored analysis when available,
   its exact hashes/receipts, domain findings, limitations, and future-analysis
   items.
3. `TOPIC_LINK` (owner answer 138b): two canonical topics, each named by its
   ID and key, one relation (`same`, `narrower`, `broader` or `related`) and a
   deidentified rationale. See "Merging" below.

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

A proposal these checks refuse comes back with every problem found (owner
question 127): each with its field path, its rule, what the contract expects
there and an example from AskRigor's own example records, bounded and in a fixed
order, privacy rules first. It never repeats a value sent, and a key the contract
does not define is shown as `*`. The tool description carries every record shape,
because ChatGPT's app shows the model no part of `payload`'s type; Claude's
surface also publishes the strict schema. Refusals by account (sign-in, mode, paid
private) still come first.

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

Canonical promotion remains a separate privileged operation. The one-shot
`living-evidence-admin promote-accepted` command locks one pending intent,
reruns the strict contribution preparation, dispatches to the
`contribute`, `contributeFrontier` or `contributeTopicLink` writer, and stores an exact stable-JSON
receipt and SHA-256. A crash after the canonical writer commits but before the
intent receipt commits leaves the intent pending; retry uses the canonical
writer's existing idempotency key and then completes the receipt. The command
promotes at most one intent per invocation. The deployed hardened five-minute
timer invokes only this command without arguments or a shell; it does not
change the review or scientific-decision boundary.

Owner answer 138b (2026-10-20): "a conflicting record is marked failed with its
reason and stops blocking the queue, and run times in any valid format are
accepted at promotion." The writer compares stored dates and times with the
payload's as values in SQL, so `...:00Z`, `...+02:00` and microseconds name the
instant they name. When the writer refuses the exact payload because it
conflicts with what the append-only store holds, the intent ends `FAILED` with
one code from a closed list (`RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES`,
the same list as migration `0012`'s check) and its failure time, and the same
invocation tries the next accepted intent, at most 20 failures per invocation.
A lost connection, a timeout, a serialization failure or an unexpected error
leaves the intent `PENDING` for the next activation. The owner review `inspect`
and `status` actions show a failed promotion and its code
(`accepted_promotion_failed`), and the admin receipt lists each failed intent's
UUIDs, kind and code. A latent collision the writer used to meet as a raw
constraint error now has its own code: `TOPIC_KEY_CONFLICT`,
`RESEARCH_FRONTIER_QUESTION_CONFLICT`, `FRONTIER_LANE_KEY_CONFLICT`,
`FRONTIER_CANDIDATE_IDENTITY_CONFLICT`, `SOURCE_FAMILY_IDENTITY_CONFLICT` and
`SOURCE_VERSION_IDENTITY_CONFLICT`.

## Merging (owner answer 138b)

Owner answer 138b (2026-10-20): "exact merging (the same topic, question or
study continues the existing record; a finished version replaces the same
account's draft; related records shown when you review), plus merging by
meaning (the AI may declare two differently worded topics the same, linked on
your acceptance, nothing moved or deleted)". Every check below is exact; none
judges meaning, so each works in any language.

**A frontier continues the canonical records it names.** Before a
`RESEARCH_FRONTIER` proposal is stored, the service reads the canonical store
through the public runtime's read-only reader and reconciles the frontier by
exact identity: the topic by its key (keeping the canonical topic's ID and
label); the question and frontier by ID, or by the exact normalized question and
all six dimensions within the topic; a lane by key when its provider, source
class and coverage basis match; a candidate by the hash of its identifiers, as a
new version chained to the candidate's current version. Passes and trails stay
as sent. The result lists each ID set to a canonical one (`proposal.reconciled`,
IDs only, all already public through the catalog tools), and the stored payload
and its hash are the reconciled ones, which the owner reviews. A canonical ID
named with other content is refused with a field-level problem
(`canonical_conflict` or `canonical_missing`). When the reader cannot be read,
the frontier is filed as sent (`canonicalCheck: "unavailable"`).

**A second audit of a study joins the study's record.** An analysis the server
files after `finalize_research` is its own analysis, keyed by its audit and
protocols, so two audits of one study never both claim an `initial` version.
When the source's identifiers name one canonical source family and no
identifier conflicts, the analysis carries that family's ID, title, version of
the same bytes and freshness policy. An audit the canonical store already holds
under the same protocols, or one this account already filed, is not filed
again. Whether one audit supersedes another stays a human judgment.

**A finished version replaces the account's own draft.** An optional
`supersedesProposalId` names this account's own pending proposal of the same
kind. Accepting the new proposal rejects that draft, with the reason
"superseded by <id>", in the same transaction; rejecting it leaves the draft.
A database trigger refuses any other UUID with one problem
(`superseded_proposal`) that says nothing about whether the UUID names another
account's proposal.

**The review shows what is related, and what promotion would meet.**
`review_research_contribution` `inspect` returns `related.proposals`: the other
proposals pending review or queued for promotion that share the topic key or
ID, the frontier, the question, the source family, or a candidate or source
identifier, by proposal ID, kind, state and the kinds of identity shared (at
most 25 shown, with a count of the rest), never an account key or another
proposal's content. It also returns `related.canonical`, the canonical records
sharing those identities (IDs only), and `preflight`: a read-only dry run of
the canonical writer's identity checks that names each conflict by its failure
code and payload path (`clear`, `conflicts`, `replay` or `unavailable`). The
proposals come through `inspect_research_contribution_context`; the canonical
records and the preflight through the public runtime's read-only reader.
Nothing in them is stored.

**Merging by meaning is a topic link.** Whether two differently worded topics
are the same, or one is narrower than, broader than or related to the other, is
the model's declaration and the owner's judgment at review; the review text
says so. The intake checks only what is exact, against the canonical store: both
topics exist under the IDs and keys named, they differ, and no stored link
contradicts or repeats this one (topics linked as the same have no hierarchy
between them, a hierarchy runs one way and makes no cycle, a link is not stored
twice, no third topic already has the alias "same" would write, and the link's
UUID is new). A link is not filed when the canonical reader cannot be read. On
promotion the canonical writer repeats those checks under its lock and appends a
`topic_link_contributions` row: for `same`, each topic's label as the other's
alias, which `search_research_frontiers` reads; otherwise one `topic_edges` row
under the link's UUID. It never moves, changes or deletes either topic or
anything filed under it. A conflict ends the promotion `FAILED` with
`TOPIC_LINK_CONFLICT`, `TOPIC_ALIAS_CONFLICT`, `TOPIC_LINK_TOPIC_MISSING`,
`TOPIC_LINK_ID_CONFLICT` or `TOPIC_LINK_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.

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
Migration `0012_research_contribution_merging.sql` adds the `FAILED` state,
`failure_code` and `failed_at`, the proposal's optional
`supersedes_proposal_id` with its same-account trigger, the `TOPIC_LINK` kind,
the append-only canonical `topic_link_contributions` table (written only by the
canonical writer), and a third security-definer function,
`inspect_research_contribution_context`, which returns what the review needs
beyond 0010's projection as one JSON object and never an account key.
The distinct `askrigor_research_review` database role receives only schema use
and execute permission on those exact inspect/decide/context functions. It has no
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

A refusal says why, to the caller only. With no sign-in it says the call
carried none. With a refused token it names a fixed class taken from the
verifier's exact error identity: `expired`, `wrong_audience`, `wrong_issuer`,
`not_a_signed_token` (for example an opaque token issued without this API's
audience), `bad_signature`, `client_not_allowed`, `subject_not_allowed`,
`invalid_claims` or `unverifiable` (AskRigor could not check it). With no
mode chosen it names the `manage_research_access` inspect call. Nothing is
logged, and the token and its claims are never returned.

ChatGPT showed every refused research call only as "The tool failed
internally" (owner reports, 2026-10-03 and 2026-10-06), so `get_protocol_manifest`,
which needs no sign-in, also reports the connection: `connection.sign_in`
(`absent`, `refused` with `sign_in_refusal`, or `accepted`),
`connection.research_access` (`ready`, `sign_in_needed`, `permission_missing`,
`mode_not_chosen`, `revoked`, `entitlement_inactive` or `unavailable`) and a
`next_step` sentence, which its text repeats. Its security schemes list
`noauth` and then `oauth2` with `research:use`, so a signed-in client sends its
token with it. The field is absent where `/mcp` has no OAuth and on Action
calls.

Legacy public research Action routes are removed from the effective Action
catalog when OAuth research access is active so they cannot bypass the mode
choice. The lesson-feedback Action remains separately governed. The Gemini
compatibility catalog remains at 22 tools and does not expose the mode,
proposal-submission, proposal-review, catalog-search, or case-review operations;
the primary ChatGPT/Codex plugin is the supported surface for this slice.

## Known limitations and next slice

- There is no checkout or self-service purchase flow.
- The protected owner-review, one-shot promotion runner, and hardened five-
  minute accepted-intent scheduler are deployed. The timer processes at most
  one already accepted exact-hash intent per activation; manual invocation
  remains available for immediate handling or rollback operation.
- The deterministic privacy screen cannot recognize every indirect identifier.
- Pending proposal retention is operator-managed rather than automatically
  expiring in this slice.
- Exact merging joins only exact matches: a question worded differently, or a
  study with a conflicting identifier, stays its own record. A topic link joins
  differently worded topics, not questions or studies.
- An accepted topic link stays in the append-only store; there is no record yet
  that withdraws a wrong one.

The scheduler release evidence is in
`audits/2026-09-01-promotion-scheduler-production-release.md` and its machine
JSON. It does not alter scientific review, proposal contents, or canonical
writer semantics.
