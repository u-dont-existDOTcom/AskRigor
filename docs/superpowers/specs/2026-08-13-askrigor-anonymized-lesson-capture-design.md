# AskRigor Anonymized Lesson Capture Design

**Status:** Approved design

**Date:** 2026-08-13

**Dependency:** The AskRigor Custom GPT Action adapter. This is a bounded
Action-only subsystem; it does not change the canonical MCP or research core.

## 1. Purpose

AskRigor users sometimes identify genuine failures that should become durable
product lessons: missing sources, conflicting claims, premature synthesis,
incorrect evidence weighting, incomplete community acquisition, or misuse of a
tool receipt. Today those corrections remain in one conversation. The product
needs a safe way to convert a validated correction into a private, reviewable
lesson candidate that can later become a regression test and an AskRigor
improvement.

The selected approach is a private GitHub issue queue in a separate repository
named `AskRigor-lessons`. It is deliberately not an automatic learning or
code-writing system. A lesson candidate cannot modify protocols, instructions,
code, branches, workflows, releases, or the public AskRigor repository.

## 2. Goals

- Detect concrete user-reported failures and require AskRigor to recheck them
  before proposing a lesson.
- Ask exactly: **“Submit this anonymized lesson to improve AskRigor?”**
- Support `Yes`, `Yes always in this chat`, and `No`.
- Submit only a short generalized lesson, never the raw conversation.
- Apply independent server-side privacy checks before any GitHub write.
- Create or update a reviewable issue in private `AskRigor-lessons` using a
  least-privilege GitHub App.
- Deduplicate recurring lessons and record an anonymous occurrence count.
- Give the user a private-safe receipt without exposing the private repository.
- Require human review and a regression-first incorporation workflow.
- Let future Codex sessions report the lesson-queue counts while working on
  AskRigor.

## 3. Non-goals

- Direct commits, pull requests, protocol edits, or automatic merges.
- Storing or submitting raw chat transcripts, user prompts, answers, uploads,
  user identities, or personal case histories.
- Treating every disagreement as a valid correction.
- Persisting `Yes always` across conversations.
- Adding a feedback tool to MCP or changing any existing MCP operation.
- Publicly exposing lesson candidates or private GitHub URLs.
- Running a background notification service in the first version.

## 4. Alternatives considered

### 4.1 Private GitHub issue queue — selected

The Custom GPT calls an Action endpoint that validates and anonymizes a
structured candidate, then creates or updates a private issue. This is the
smallest reviewable system, requires no content database, and supports
least-privilege issue-only credentials.

### 4.2 Server database with periodic GitHub export — rejected for v1

This would improve analytics and distributed deduplication, but would add
persistent chat-derived storage, backups, deletion logic, and a larger privacy
surface before there is evidence that the issue queue is insufficient.

### 4.3 Automatic commits or pull requests — rejected

This grants excessive authority to untrusted public feedback. A mistaken or
malicious lesson could influence future instructions or code before human
review. The submission service must never receive repository-contents or pull
request permission.

## 5. Eligibility and conversational consent

A lesson is eligible only when all of the following are true:

1. The user identifies a concrete defect rather than expressing a preference or
   unsupported disagreement.
2. AskRigor rechecks the relevant answer, sources, instructions, protocol state,
   or tool receipts.
3. AskRigor explicitly concludes that the criticism is valid.
4. The correction can be expressed as a general product lesson without an
   individual user's personal facts.

Finding a plausible criticism is not enough. If AskRigor cannot validate it, it
may acknowledge uncertainty or continue investigating, but it must not submit a
lesson candidate.

For an eligible lesson, the GPT displays:

> **Proposed anonymized lesson**
> When [general situation], AskRigor should [correct behavior] because [reason].
>
> **Submit this anonymized lesson to improve AskRigor?**
> Reply: **Yes**, **Yes always in this chat**, or **No**.

Consent is a conversation-local state machine:

- `Yes` authorizes one displayed candidate.
- `Yes always in this chat` authorizes later independently validated candidates
  in the same conversation. AskRigor displays each submitted lesson and its
  receipt after submission, but does not repeat its own consent question.
- `No`, silence, ambiguity, or changing the subject authorizes nothing.
- `Stop submitting lessons` clears conversation-local standing consent.
- Standing consent never crosses into another conversation and is never stored
  by the AskRigor server.

The submission operation is an external write and is declared
`x-openai-isConsequential: true` in OpenAPI. Consequently, ChatGPT may still
display its platform confirmation for every call even after conversational
`Yes always`. The implementation must not mislabel the operation to suppress
that safeguard.

## 6. Architecture and isolation

```text
Custom GPT validates correction and obtains consent
                         |
                         v
           submit_lesson_candidate Action
                         |
       strict schema + deterministic screening
                         |
       fixed-model privacy check and generalization
                         |
        server revalidation + duplicate lock
                         |
                         v
      private AskRigor-lessons GitHub issue queue
                         |
                         v
            private-safe submission receipt
```

`submit_lesson_candidate` is an Action-only endpoint layered beside the shared
research-operation adapter. It is not a research operation and has no MCP
equivalent. Existing MCP registration, schemas, semantics, tests, and public
tool inventory remain unchanged.

The service has five focused components:

1. A transport schema that accepts only the approved derived fields.
2. A privacy gate that fails closed.
3. A canonicalizer and duplicate fingerprint generator.
4. A single-writer GitHub issue client with least privilege.
5. A private-safe receipt mapper.

The public Action API key authenticates the Custom GPT to AskRigor. A separate
GitHub App credential authenticates AskRigor to GitHub. Neither credential is
accepted in request bodies, returned to clients, written to logs, or committed
to the repository.

## 7. Request contract

The endpoint accepts a bounded object containing only:

- `category`: one of `missing_sources`, `conflicting_claims`,
  `incomplete_research`, `evidence_weighting`, `community_corpus`,
  `tool_semantics`, `protocol_execution`, `privacy_or_safety`, `usability`, or
  `other`;
- `general_lesson`: a concise product-level invariant;
- `expected_behavior`: what AskRigor should do instead;
- `failure_reason`: why the previous behavior was defective;
- `synthetic_regression_example`: a generalized test case that contains no raw
  user wording or case-specific personal facts;
- `evidence_basis`: one of `assistant_self_check`, `tool_receipt_conflict`,
  `source_recheck`, or `instruction_mismatch`;
- `askrigor_version`: the displayed application version when available;
- `protocol_identities`: bounded protocol name/version/integrity identifiers
  when relevant; and
- `consent_scope`: `once` or `conversation`, used for audit semantics rather
  than persistent preference storage.

Every free-text field has a strict character limit. The request has no field for
raw user text, raw assistant text, a conversation ID, user identity, email,
account identifier, upload, location, or medical history. Unknown fields are
rejected instead of ignored.

The exact v1 bounds are:

- `general_lesson`: 40–600 characters;
- `expected_behavior`: 40–1,200 characters;
- `failure_reason`: 20–800 characters;
- `synthetic_regression_example`: 20–1,200 characters;
- `askrigor_version`: at most 64 characters;
- no more than four protocol identities, with names and versions at most 64
  characters and an optional exact 64-hex-character SHA-256; and
- at most 8,192 UTF-8 bytes for the complete decoded request body.

The server computes the idempotency fingerprint from canonicalized category,
general lesson, and expected behavior. The client cannot choose the fingerprint
or GitHub issue number.

## 8. Privacy gate

Privacy protection is defense in depth:

1. Parse strict JSON and reject unknown, missing, oversized, or malformed
   fields.
2. Deterministically reject secrets, API-key-like strings, emails, phone
   numbers, account identifiers, exact addresses, identifying URL query data,
   long quotations, and obvious raw-conversation formatting.
3. Send only the already-derived candidate fields—not the conversation—to the
   fixed `gpt-5-nano-2025-08-07` privacy model with structured output. Do not use
   a moving model alias. Changing the snapshot requires an explicit reviewed
   release change and privacy regression run. The model returns `safe`,
   generalized fields, and detected-risk codes.
4. Re-run the strict schema and deterministic screening on the model output.
5. Reject the submission if either screening stage is uncertain, the model is
   unavailable, structured output is invalid, or any personal narrative
   remains.

The privacy model is a checker and generalizer, not an adjudicator of whether
the lesson is scientifically correct. It cannot receive the raw chat and cannot
override a rejection. Its cost is included in the same mechanically enforced
monthly AI budget as the Action adapter. Budget exhaustion produces
`anonymizer_unavailable`; it never bypasses the gate.

Application and reverse-proxy logs exclude request and response bodies. Allowed
operational logs are timestamp, endpoint, status code, latency, error code, and
a short non-reversible fingerprint prefix. The public privacy notice must
disclose voluntary anonymized feedback transfer to AskRigor, the OpenAI privacy
check, private GitHub storage, review purpose, retention, and deletion requests.

## 9. GitHub boundary and issue format

Create a private repository named `AskRigor-lessons`. Install a dedicated
GitHub App only on that repository with:

- repository metadata: read;
- issues: read and write; and
- no contents, commits, pull requests, actions, administration, secrets, or
  organization-wide permission.

Each new issue contains:

- title: `[category] concise generalized lesson`;
- stable private candidate ID derived from the GitHub issue number;
- general lesson;
- expected behavior;
- failure reason;
- synthetic regression example;
- evidence-basis classification;
- AskRigor and protocol identities when supplied;
- privacy-gate result;
- duplicate fingerprint marker;
- initial anonymous occurrence count; and
- first submission timestamp.

Later duplicate occurrences are private append-only generated issue comments.
Each contains only the next anonymous count, its observation timestamp, and a
canonical fingerprint marker; it repeats no candidate text. The latest
canonical generated comment supplies the current count and last-seen time.

Initial labels are `lesson-candidate`, `needs-review`, `source-custom-gpt`, and
`category:<category>`.

The v1 deployment has exactly one lesson-submission writer. It serializes issue
creation by fingerprint and checks all non-deleted issues for the exact marker
before creating one. This avoids a new database while making concurrent retries
idempotent. A future multi-replica deployment must add a distributed lock before
enabling more than one writer.

If the fingerprint matches an active issue, the service leaves the issue body
byte-identical and appends an anonymous occurrence comment. It reconstructs the
next count from the issue's backward-compatible base metadata plus fully
paginated canonical occurrence comments. It does not add candidate text, user,
network, conversation, or medical information. A response lost after a
successful GitHub write can therefore be retried without creating a second
candidate.

If the matching issue is already terminal, a new occurrence is not silently
discarded. A match to `incorporated` creates a new active candidate labeled
`possible-regression` and links the earlier issue. A match to `rejected`,
`duplicate`, or `insufficient-evidence` creates a new active candidate linked to
the earlier decision so new evidence can be reviewed independently. Once that
new issue exists, identical retries converge on it.

## 10. Response and errors

The endpoint returns raw structured data for ChatGPT to render:

- `status`: `submitted`, `existing_candidate`, `privacy_rejected`,
  `rate_limited`, `anonymizer_unavailable`, or `github_unavailable`;
- `candidate_id` for successful or duplicate submissions;
- `occurrence_count` when available;
- `retryable`; and
- a bounded machine-readable `reason_code` when unsuccessful.

It never returns a private repository URL, GitHub credential, issue body, other
user's lesson, or internal moderation detail. The user-facing success language
is:

> Anonymized lesson submitted as candidate `ARL-0042`. It requires review before
> changing AskRigor.

Rate limiting begins conservatively at 20 accepted attempts per hour and 100 per
day across the public lesson endpoint, with duplicate hits counted separately
for abuse control but not as new issues. HTTP 429 is returned truthfully. Limits
may be raised after observing legitimate usage and cost.

## 11. Human review and incorporation

The issue lifecycle is:

```text
needs-review
  -> accepted
  -> failing regression created
  -> correct enforcement layer changed
  -> verified
  -> incorporated
```

Alternative terminal labels are `rejected`, `duplicate`, and
`insufficient-evidence`.

Review determines which layer owns the correction:

- Project or Custom GPT instructions for short routing failures;
- Forum Signal module for community acquisition and analysis failures;
- HRP for scientific-method invariants;
- controller/runtime for mechanically enforceable completion failures; or
- provider/transport code for tool defects.

Where practical, an accepted lesson becomes a failing regression test before
the behavior changes. The eventual commit or pull request is linked from the
private issue, which is then labeled `incorporated`. A candidate is never
accepted solely because the submitting GPT agreed with the user.

Rejected or incorporated issues are eligible for deletion 90 days after their
terminal label. The maintainer status command flags expired candidates; deletion
remains a deliberate maintainer action in v1. A user may request earlier
deletion using the private-safe candidate ID and the public privacy contact.

## 12. Maintainer queue visibility

Add a read-only `lessons:status` command that uses the maintainer's local GitHub
authentication, not the public Action credential. It reports:

- total open candidates;
- `needs-review` count;
- `accepted` but not incorporated count;
- incorporated/closed count;
- terminal candidates older than the 90-day deletion threshold; and
- optionally, candidates matching a supplied category relevant to current work.

Add a root `AGENTS.md` instruction requiring future Codex sessions to run the
status command:

- at the beginning of an AskRigor development session;
- before designing a related change;
- before a release or deployment; and
- whenever the user asks for project status.

The user-facing report is concise. If GitHub authentication or the private
repository is unavailable, the command returns an explicit unavailable state
and nonzero exit; the agent must never report an invented zero. Unreviewed
lessons do not silently broaden a task or block an unrelated release, but a
potentially critical relevant lesson is brought to the user's attention.

## 13. Testing

### 13.1 Conversational contract

- A concrete validated failure produces the exact consent question.
- `Yes` submits once.
- `Yes always in this chat` suppresses only AskRigor's later conversational
  prompt in that chat and is cleared by `Stop submitting lessons`.
- `No`, ambiguity, ordinary disagreement, and unverified criticism do not call
  the Action.
- A new conversation has no standing consent.

### 13.2 Privacy and schema

- Unknown fields, raw transcript fields, oversized inputs, secrets, emails,
  phone numbers, identifying URLs, personal medical narratives, and long direct
  quotations fail closed.
- The privacy model sees only structured derived fields.
- Model failure, budget exhaustion, invalid output, and uncertain classification
  never fall back to unreviewed submission.
- The post-model deterministic pass catches reintroduced prohibited data.
- Request and response bodies are absent from captured application/proxy logs.

### 13.3 GitHub and idempotency

- The mocked GitHub issue contains exactly the approved fields and labels.
- The credential fixture has no contents or pull-request permission.
- Sequential retries, concurrent identical requests, and a simulated lost
  response create one issue and return the same candidate ID.
- A repeated lesson increments only anonymous occurrence metadata.
- GitHub unavailability returns a truthful retryable error.

### 13.4 Action and compatibility

- The OpenAPI document validates and marks the POST operation
  `x-openai-isConsequential: true`.
- Action API-key authentication is required.
- Existing MCP schemas, tool count, tool inventory, and operation behavior
  remain unchanged by this subsystem, and every pre-existing MCP test continues
  to pass.
- The privacy data map, public privacy notice, and release checks match the
  implemented processing and retention boundary.

### 13.5 Maintainer workflow

- `lessons:status` returns exact label counts from fixtures.
- Missing auth, inaccessible repository, pagination, and rate-limit errors are
  reported as unavailable rather than zero.
- Relevant-category filtering and the 90-day deletion flag are deterministic.

### 13.6 Live acceptance

Create one synthetic non-personal lesson through the imported Custom GPT,
confirm that it appears only in private `AskRigor-lessons`, confirm the returned
candidate ID, verify labels/body/permissions/log exclusion, exercise the
duplicate path, and mark the issue as a test candidate. Run the full existing
MCP and Action-adapter verification suites afterward.

## 14. Deployment and documentation

Implementation order is:

1. Complete the shared HTTP/OpenAPI foundation of the Custom GPT Action adapter.
2. Create private `AskRigor-lessons` and the repository-scoped GitHub App.
3. Install Action, GitHub App, and OpenAI privacy-check credentials as server
   secrets.
4. Add the Action-only lesson endpoint, privacy gate, idempotent GitHub client,
   and rate limits.
5. Add Custom GPT instructions for eligibility, consent, and receipts.
6. Update the privacy data map, public privacy policy, OpenAPI document, Action
   setup instructions, and release evidence.
7. Add `lessons:status` and the root `AGENTS.md` checkpoint instructions.
8. Run synthetic live acceptance and the complete regression matrix before
   deployment.

No secret appears in Git, the OpenAPI document, logs, issue bodies, user-facing
receipts, or Custom GPT instructions.

## 15. Definition of done

- The exact approved consent interaction works, including conversation-local
  `Yes always` and cancellation.
- Only independently screened generalized fields reach GitHub.
- The private GitHub App cannot read or write repository contents or pull
  requests.
- Duplicates and retries converge on one candidate.
- Human review and regression-first incorporation remain mandatory.
- Future AskRigor work reports truthful lesson-queue counts at the approved
  checkpoints.
- Public privacy and retention documentation matches reality.
- Existing MCP behavior and tests remain unchanged.
- A live Custom GPT synthetic lesson submission succeeds end to end.
