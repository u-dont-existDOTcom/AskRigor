# Execution-control Phase A implementation plan

Date: 2026-08-23

Branch: `agent/execution-control-phase-a-20260823`

Pull request: #69

Base: `origin/main` at `030d03abaac8f75a559d6e50ce862709cade9655`

Authority: current owner requirements, complete canonical HRP and Universal
bytes, `AGENTS.md`, the Project router and Forum Signal module, then the
productionization roadmap. This plan implements Phase A only and does not amend
research policy.

## Objective

Move authoritative research-session state and transition decisions out of the
prototype Action transport into a reusable pure controller. The controller must
make premature synthesis, caller-authored completion, module demotion, and
silent protocol drift fail closed. It must define—but not yet issue—the future
successful finalization permit.

## Design

1. Add a transport-independent controller module that owns:
   - exact protocol bindings and monotonic drift state;
   - explicit applicability/execution state for all six router modules;
   - structured operation state instead of caller-shaped completion counts or
     lists;
   - machine-readable next capabilities derived from state;
   - the canonical `CONTINUE_RESEARCH`, `BOUNDED_NONRANKING_ONLY`, and
     `FINALIZATION_ALLOWED` output-boundary vocabulary;
   - server-derived scout transitions;
   - treatment-landscape boundary mapping;
   - denial-only Phase A finalization evaluation plus the future permit schema.
2. Make the bounded in-memory store validate monotonic controller transitions.
3. Reduce the prototype routes to transport validation, provider execution,
   manifest rechecks, store coordination, and controller projection.
4. Add hostile controller and route tests for every Phase A minimum, including
   a completion-condition mutation matrix.
5. Keep the prototype absent from runtime route registration. Do not change
   generated Custom GPT Instructions, MCP tools, public Actions, provider
   footprints, privacy retention, or deployment configuration.

## Verification

- Focused controller/prototype tests.
- Inventory snapshot tests proving 21 MCP tools and 26 public Actions remain.
- `npm run test:run`.
- `npm run verify`.
- Complete diff and generated-artifact review.
- Required lesson checkpoint and closeout.

## Recovery

The work is isolated in the branch/worktree above. `origin/main` is the exact
rollback point. No production inventory or deployment is changed in Phase A.

## Verified result

- Focused controller/prototype hostile tests: 12/12 passed.
- Complete host-boundary test suite: 1,146 passed, 6 declared skips.
- `npm run verify`: typecheck, complete test suite, and production build passed.
- Public inventory remains 21 MCP tools and 26 Actions; the prototype is not
  registered.
- No generated Custom GPT, Action OpenAPI, plugin, privacy, provider, runtime,
  or deployment surface changed.
- Pre-PR lesson status at `2026-08-23T22:22:00.222Z`: 1 open, 1 needing
  review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
  deletion eligible.
- Lesson disposition: project-specific/no-new-lesson. This phase implements the
  already approved server-owned-controller architecture and existing universal
  Git/continuity patterns; it did not expose a new transferable failure.
