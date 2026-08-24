# Phase H — Private orchestration interface

**Status:** Implemented and locally verified on
`agent/execution-control-phase-h-20260824` from
`main` merge `86c9455c63f94f832d3d933eb1a174d784e0a132`.

This plan implements Phase H of
`2026-08-23-execution-control-productionization-roadmap.md`. It does not
replace the canonical HRP or Universal protocols and does not introduce a
second execution controller.

## Objective

Expose the existing server-owned research-session controller through a small,
disabled-by-default, authenticated HTTP boundary for controlled workers. Keep
the public 21-tool MCP catalog and 26-Action OpenAPI document unchanged.

## Design decisions

1. Add a separate `/internal/research/v1/*` namespace. It is not an Action or
   MCP transport and is absent unless explicitly enabled.
2. Use a distinct Bearer secret, constant-time validation, strict JSON schemas,
   a 256 KiB request limit, a 512 KiB response limit, a private token bucket,
   and a private concurrency limiter. Reject every request carrying an Origin
   header; emit no CORS headers.
3. Reuse the existing research-session store and controller transitions. The
   interface supplies only start, resume, status, bounded semantic submission,
   and finalize operations.
4. Return a privacy-minimized orchestration projection: opaque session ID,
   controller state digest, authoritative status/boundary, next capabilities,
   retryable/terminal classifications, and at most one exact bounded semantic
   work package. Do not return the raw research target, transcript/comment/full
   text, unrestricted provider output, credentials, or caller-controlled
   completion state.
5. Keep provider coordination internal. The request schema has no provider
   completion switches or caller-authored operation/module state.
6. Use the encrypted Phase G checkpoint store when injected/configured and the
   in-memory store for hermetic tests. This phase does not activate production,
   change retention, or add an external service.
7. Correct the restart reconciliation gap for external-study evidence: if a
   restored checkpoint no longer has the ephemeral external-audit material
   required for claim recalculation, reopen the exact external-evidence step
   after source reacquisition while retaining a still-matching completed method
   audit. Reopening cannot authorize output.

## Implementation sequence

- [x] Add strict private transport schemas, safe projection, authentication,
      routing, limits, and disabled-by-default configuration.
- [x] Bind private start/resume/status/finalize to the same prototype service
      and store used by the existing non-production routes.
- [x] Add bounded semantic submission for module applicability and candidate
      screening, with exact package/state-digest binding and no completion
      assertions.
- [x] Repair the external-evidence restart reconciliation gap.
- [x] Add hostile integration tests for authentication, duplicate credentials,
      browser origins, content type/JSON/body/response bounds, rate and
      concurrency release, strict schemas, stale digests, completion/count/list
      injection, provider-toggle injection, unknown sessions, protocol drift,
      and finalization denial.
- [x] Prove public OpenAPI and MCP inventories are unchanged and private routes
      are absent while disabled.
- [x] Update current-state, privacy, roadmap, and release/deployment evidence.
- [ ] Run focused tests, `npm run test:run`, `npm run verify`, lesson closeout,
      inspect the complete diff, open a PR, review CI, and merge when green.

## Exit evidence

Phase H is complete only when an authenticated integration test advances the
same controller through supported work, hostile requests cannot manufacture
progress or completion, public inventories remain exactly 21 MCP tools and 26
Actions, the complete deterministic gate passes, and the reviewed PR is
merged.
