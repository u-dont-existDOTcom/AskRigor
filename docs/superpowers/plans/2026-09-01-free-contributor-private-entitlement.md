# Free contributor and paid-private access boundary

Date: 2026-09-01
Status: local candidate verified; protected release pending
Branch: `task/free-contributor-private-entitlement-20260901`
Assurance lane: iteration, with targeted authentication, privacy, and durable-write hard gates

## Owner outcome

AskRigor's free product is reciprocal: before using the research system, a
person explicitly agrees that eligible deidentified and structured research
progress from their use may be submitted to AskRigor's shared living-evidence
repository. A person who does not agree must use a paid private mode.

The paid-private mode excludes shared research contribution. This slice does
not choose a price, payment processor, tax treatment, or checkout design. It
accepts paid-private mode only for an already verified entitlement and otherwise
fails closed.

## Product boundary

This is a normal public product access rule, not an institutional research
program, pilot, public forum, participant registry, or scientific-governance
system. It does not make user frequency, proposal presence, or model output into
evidence.

The shared contribution boundary remains deliberately narrow:

- accepted input is one already-defined formal research-frontier contribution
  or one source-bound study/review analysis contribution;
- partial frontiers and partial analyses remain usable and explicitly labeled;
- raw chats, prompts, account/contact information, private health narratives,
  uploads, provider response bodies, raw source bodies, YouTube/community data,
  and credentials are prohibited;
- the public runtime writes only a pending proposal inbox, never canonical
  evidence tables;
- canonical promotion remains a separate reviewed writer operation using the
  existing deterministic contribution validators; and
- a contribution proposal has no scientific authority merely because it was
  submitted or repeated.

## Vertical slice

1. Add a PostgreSQL migration for pseudonymous research-use accounts, verified
   paid-private entitlements, and append-only contribution proposals.
2. Add in-memory and PostgreSQL stores plus a service that:
   - derives an account key with HMAC-SHA-256 from the OAuth subject;
   - records the exact free-contributor notice and confirmation;
   - activates paid-private mode only when an entitlement is active;
   - reports or revokes the current mode;
   - validates sanitized frontier or formal-analysis proposals with the
     existing exact schemas and privacy boundary; and
   - records valid proposals as pending review without importing them.
3. Add OAuth-scoped MCP operations to inspect/choose the mode and submit a
   proposal. Ordinary research operations require an active mode when the
   production access service is configured. The owner-only case-review tool
   retains its separate subject and `cases:review` boundary.
4. Add exact server configuration, least-privilege database-role provisioning,
   privacy/data-flow documentation, Custom GPT/plugin instructions, and a local
   acceptance script using synthetic identities and formal fixture content.
5. Run affected tests throughout. Run `npm run verify`, inspect the final diff,
   and use the protected PR/release path only after the local vertical slice
   passes.

## Free-contributor notice contract

The exact versioned notice must communicate all of these facts before free mode
is activated:

- free AskRigor use requires contribution to shared research learning;
- only eligible deidentified structured research progress is submitted;
- raw chat, identity/contact details, private health narratives, uploads, raw
  source/provider bodies, and YouTube/community content are excluded;
- proposals are reviewed and do not become evidence or conclusions merely by
  submission; and
- paid private access does not contribute, but requires an active verified
  entitlement.

The mode-selection write is consequential and must remain visibly declared as
such to MCP clients.

## Identity and authorization

The OAuth issuer remains responsible only for authentication. The repository
stores no email or raw OAuth subject. A server-held 32-byte-or-longer secret
derives an opaque account key. Contact/account information therefore remains
outside the research proposal body.

The current owner subject restriction moves from the general token verifier to
the case-review handler. This permits public OAuth identities to use the
research-access flow without allowing them to inspect another person's
evidence-gap submission.

The public research Action endpoints cannot bypass the access policy. When the
new access policy is enabled, ordinary use occurs through the OAuth MCP surface;
legacy anonymous research Actions fail closed.

## Acceptance

The slice is locally adequate when deterministic tests prove:

- an unauthenticated or unregistered caller cannot use an ordinary research
  operation;
- exact free consent activates access and can be inspected;
- ambiguous or incomplete free consent is rejected;
- paid-private activation fails without an active entitlement and succeeds
  with one;
- a free contributor can submit a valid partial frontier and a valid complete
  formal-source analysis proposal;
- paid-private mode cannot submit a shared proposal;
- prohibited keys/content classes and malformed contribution hashes fail before
  persistence;
- pending proposals do not appear in canonical frontier or analysis queries;
- identity linkage is absent from proposal JSON and raw OAuth subjects are not
  stored;
- revocation blocks later research calls;
- the owner-only case-review tool still rejects every non-owner subject; and
- the migration role can touch only the new access/proposal tables needed by
  the runtime.

Production release additionally requires exact Auth0 scope/readback,
least-privilege role acceptance, fresh ChatGPT connection and mode-selection
acceptance, a real pending synthetic proposal followed by cleanup, rollback
evidence, complete plugin-byte synchronization, and the repository's complete
deterministic gate.

## Explicitly deferred

- pricing, billing provider, checkout, invoicing, and refunds;
- automatic canonical promotion;
- public display of contributed knowledge;
- raw chat or personal-story retention;
- YouTube/community persistence;
- semantic/vector infrastructure; and
- causal, medical, or evidentiary conclusions from user contributions.
