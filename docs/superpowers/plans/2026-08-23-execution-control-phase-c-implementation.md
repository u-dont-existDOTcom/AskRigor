# Execution-control Phase C implementation plan

Date: 2026-08-23

Branch: `agent/execution-control-phase-c-20260823`

Base: Phase B merge `f4800e45e810a34e03657334949b6e8fef883b50`

Authority: current owner requirements, unchanged complete canonical HRP and
Universal bytes, Project router/Forum Signal module, and Phase C of the
productionization roadmap. This phase implements existing retrieval-depth
policy; it does not change health or treatment policy.

## Objective

Make transcript and per-video community depth authoritative session state.
The next retrieval call, continuation identity, completion state, and bounded
access outcome must be derived from selected stable video identities and the
existing server-produced Action receipts. A worker or client cannot supply an
exhaustion claim, substitute one audited discussion for several selected
videos, or combine restarted chains.

## Design

1. Add an exact candidate-screening work package as the inseparable semantic
   prerequisite:
   - package every reconciled candidate and source provenance under one
     server-derived discovery-state digest;
   - accept exactly one bounded decision for every packaged candidate;
   - validate stable identities, described-program signatures, duplicate
     targets, materiality, and selection status before advancement;
   - preserve that schema validation binds the work to sources but does not
     make the semantic judgment automatically true.
2. Add a transport-independent, receipt-only per-video depth state:
   - initialize exact transcript and discussion records from selected
     candidate identities;
   - retain public source identity, operation status, attempt number, the
     latest bounded coverage receipt, and only short opaque Action continuation
     handles;
   - never retain transcript segments, comment text, raw corpora, provider
     cursors, credentials, or unrestricted provider output.
3. Derive the next exact Action input server-side:
   - first-page calls use only the selected video identity;
   - continuation calls use only the prior server-returned opaque handle;
   - a restart discards the old chain receipt/counts and begins only that video
     again with a higher attempt number.
4. Ingest the existing transcript and community Action outputs:
   - validate source identity, first-page/continuation relationship, monotonic
     receipt fields, selected track, timestamps, cumulative counts, and
     completion locks;
   - keep retryable work executable;
   - recognize only real terminal boundaries as bounded;
   - require every selected video to reach its own complete or terminal state
     before the global operation can become complete or terminal.
5. Project exact per-video work packages and diagnostics through the research
   session view. Raw counts remain evidence receipts, not completion claims.
6. Keep the prototype outside public inventories. Phase C supplies the
   controller/executor boundary needed by later private orchestration; it does
   not add Custom GPT or public Action endpoints.

## Hostile tests

- candidate screening cannot omit/add/rename identities or use the wrong
  discovery digest;
- duplicate described programs cannot both be called distinct or selected as
  independent coverage;
- transcript or discussion output for the wrong selected video is rejected;
- caller-supplied cursors/exhaustion/counts cannot enter session state;
- a continuation cannot skip, replay, decrease counts, or mix selected videos;
- a restart clears old chain receipts/counts and increments only that video's
  attempt;
- retryable boundaries remain executable;
- one completed transcript/discussion among several selected videos cannot
  complete the global operation;
- creator-depth completion requires a complete timestamped transcript receipt;
- community completion requires `synthesis_lock: pass`; incomplete locks never
  advance;
- terminal access boundaries permit only the existing bounded path, never
  full completion;
- public MCP/Action inventories remain 21/26 and the prototype remains
  unregistered.

## Verification and recovery

Run focused screening/depth/controller/prototype/inventory tests, then the
complete host-boundary `npm run test:run` and `npm run verify` gates. Update the
roadmap/current-state checkpoint, complete lesson closeout, inspect the exact
diff, open and review a PR, wait for protected CI/CodeQL, merge, discard this
worktree, and begin Phase D from fresh `main`. The exact base commit above is
the rollback point; no production deployment is part of Phase C.
