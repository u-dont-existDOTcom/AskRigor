# Phase K2 compact controlled Action projection

**Status:** implemented and locally verified on
`agent/execution-control-phase-k2-20260825`; PR/hosted review and merge pending

## Objective

Replace the Custom GPT's low-level research Action graph with four authenticated
operations over the existing server-owned research-session controller. Keep the
21-tool MCP catalog and the internal deterministic source/provider executors
unchanged. The GPT may perform only one exact server-issued semantic work
package; it may never select research work, recreate retrieval receipts, claim
completion, or synthesize outside the server-authorized reader report.

## Baseline and preserved authority

- Base: merged K1 commit `42c36ae70651e8c33e7da665cc706a285fe83118`.
- Reuse `research-session-advance.ts`, the existing session stores, runtime
  dependencies, protocol recheck, finalization permit, evidence caches, and all
  deterministic source executors.
- Gemini/Spark remains the current automatic server-side high-recall scout. No
  Gemini key, packet, prompt relay, or manual user handoff enters the GPT.
- Canonical Universal `20.5.15` and HRP `20.5.23` bytes are unchanged.
- The public educational-health boundary remains unchanged.

## Design

### 1. Transport-independent controlled session service

Add one service over the existing controller/store/advancement engine. It owns
no research policy. It provides start, continue, status, and finalize methods;
rechecks exact protocol identities; rejects stale state; executes exactly one
deterministic transition; applies one exact semantic result; and projects only
the current server directive.

`continue` accepts either no semantic result or one result for the exact current
work package. Extra caller completion flags, counts, operation lists, provider
claims, renamed work, stale digests, cross-session results, and deterministic
receipt assertions are rejected.

### 2. Bounded semantic evidence transport

The service returns the current semantic work package, its exact output JSON
Schema, and source evidence supplied by K1's runtime evidence-context resolver.
Serialize that transient evidence into bounded UTF-8 JSON chunks. Continue the
chain only with an opaque signed handle bound to session, state digest, work
digest, evidence digest, chunk position, expiry, and key identity.

The terminal page returns a signed evidence receipt. A semantic result that
requires evidence cannot advance state without that exact terminal receipt.
Restarting a lost/expired chain reacquires the same current evidence; changed
evidence or state fails closed. Evidence chunks and raw source material never
enter the session checkpoint, reader report, acceptance receipt, or logs.

### 3. Four authenticated Action routes

Expose only:

- `start_research_session`
- `continue_research_session`
- `get_research_session_status`
- `finalize_research_report`

All four are nonconsequential but Bearer-authenticated. They use strict runtime
schemas, bounded request/response sizes, no-cache responses, the existing
Action router, and one lifetime-shared store/runtime graph. Low-level research
route factories remain internal code used by the runtime and technical tests;
they are removed from the installed/live Custom GPT Action inventory. The MCP
catalog remains exactly 21 tools.

### 4. Compact generated GPT projection

Create one dedicated checked-in instruction source for the controlled client.
Generate the editor Instructions directly from it rather than transforming the
full AskRigor plugin skill. The contract tells the GPT to:

1. convert personal prompts into a de-identified population-level research
   target within the public educational boundary;
2. start or resume one server-owned session;
3. keep calling continue while the server has deterministic work;
4. when issued semantic work, retrieve every signed evidence page, produce only
   the exact requested JSON, and submit it through continue;
5. call finalize only when directed;
6. render only the exact authorized reader packet in ordinary language; and
7. never ask the user to run or copy Gemini/Spark work, expose internal jargon,
   or invent a partial/full completion claim.

Retain the exact lesson-consent shell and the existing authenticated lesson
write. Generate a small runtime bundle manifest so signed acceptance receipts
bind the exact Instructions/OpenAPI/Spark-skill bundle without reading `docs/`
inside the production image.

### 5. Server-signed product acceptance receipt

Replace the caller-authored acceptance fixture with a server-issued receipt
available only for a fixed synthetic challenge identity. Bind it to the exact
installation bundle, protocol identities, opaque session, ordered transition
trace, final boundary, finalization-permit payload digest, report digest, issue
time, and signing key. Include no prompt, diagnosis, evidence text, provider
body, transcript, comment, credential, or personal data.

Use domain-separated HMAC-SHA256 with the existing finalization signing secret.
Mutated, cross-session, cross-bundle, cross-protocol, expired, unsigned, or
caller-authored receipts fail verification. Real-product K3 acceptance must
obtain this receipt from the deployed server rather than constructing JSON.

## Hostile tests

- Four controlled research operations plus one lesson write are the entire
  generated Action document; every controlled operation requires Bearer auth.
- MCP remains exactly 21 tools and low-level route factories remain usable
  internally.
- Caller cannot inject completion, counts, completed-operation lists,
  provider/source receipts, or a semantic work type.
- Stale/unknown/cross-session state cannot advance.
- Protocol drift prevents continuation/finalization.
- Semantic work cannot advance without the exact terminal evidence receipt;
  skipped, reordered, expired, mutated, cross-work, and cross-session paging
  chains fail.
- Deterministic work is executed server-side and cannot be submitted by the
  GPT.
- Retryable work remains retryable; terminal boundaries do not become full
  completion.
- Finalize cannot release a report without the current permit-bound reader
  packet.
- Acceptance receipt mutation, replay, wrong bundle/protocol/session/report,
  and private-content injection fail.
- Generated artifacts reproduce exactly from their checked-in sources and
  retain the public boundary and consent shell.
- Deliberate mutants that reintroduce a low-level Action, remove auth, accept a
  completion field, bypass state/evidence binding, or render unsanctioned prose
  are detected.

## Verification and closeout

Run focused tests through the repository test-efficiency observer, then
`npm run test:run` and `npm run verify` at the checkpoint defined by the
verification-budget policy. Inspect the complete diff, update current-state,
roadmap, privacy/threat/release documentation and lesson disposition, open a
PR, review hosted checks and actual diff, merge only when green, then begin K3
from fresh `main`.
