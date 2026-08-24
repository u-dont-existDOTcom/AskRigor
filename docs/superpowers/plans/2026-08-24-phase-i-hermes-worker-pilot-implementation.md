# Phase I Hermes worker pilot implementation

**Status:** Implemented; post-change targeted/local coverage complete and
standard-concurrency hosted gate pending

**Roadmap authority:**
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`

## Outcome

Add Hermes as a bounded semantic worker around the existing private AskRigor
orchestration boundary. Hermes must be useful for persistent execution, but it
must be unable to advance authoritative state except through an exact
server-issued work package and the existing validated submission route. A task
may be reported successful only after the authenticated AskRigor server returns
an integrity-bound finalization permit or bounded-output permit.

## Prior-work and reuse decision

The official `NousResearch/hermes-agent` Python library already provides the
model conversation runtime. Phase I therefore adapts it rather than inventing a
second agent runtime.

- Upstream repository: `https://github.com/NousResearch/hermes-agent`
- Pinned release: `v2026.8.19` / package version `0.20.5`
- Pinned commit: `fcbd1076a93841fa88855acce810e342a5b78101`
- Reused API: `AIAgent(...).run_conversation(...)`
- Research-worker isolation: `enabled_toolsets=[]`, `skip_memory=True`,
  `skip_context_files=True`, `skip_background_review=True`, no trajectories,
  bounded iterations/time, fresh temporary home and working directory.

Hermes plugin hooks and managed configuration are not trusted as security or
completion boundaries: upstream hooks can fail open, and managed settings are
not an operating-system sandbox. The AskRigor-owned outer adapter validates
structured output and the AskRigor server remains the only state/finalization
authority.

The bespoke code is limited to the AskRigor-specific worker envelope, private
orchestration client, fail-closed final-response guard, launch isolation, and
benchmark accounting.

## Implementation steps

1. Define strict server-work and worker-result envelopes for the semantic work
   currently projected by the private controller. Bind every result to exact
   session, state digest, work type, package version, and frontier digest.
2. Add an authenticated private-orchestration client and a controller-driven
   worker loop. Deterministic work is requested only through `/resume`; Hermes
   never receives provider completion toggles.
3. Add a final-response guard. Worker prose or fields such as `complete=true`
   never authorize success. Only a matching server permit may release a final
   response.
4. Add a subprocess adapter for the pinned official Hermes source. Pass model
   credentials only through an allowlisted child environment, never arguments,
   logs, work packages, memory, repository files, or trajectories.
5. Add a read-only development-context builder that loads the repository
   `AGENTS.md`, project instructions, and complete canonical protocol bytes with
   hashes. Development work remains no-tools/read-only in this pilot and cannot
   write to `main` or access production secrets.
6. Add hostile tests for forged completion, cross-session/stale work, malformed
   semantic output, deterministic-work substitution, no-progress loops,
   secrets/private target leakage, and attempted final responses without a
   server permit.
7. Add held-out benchmark fixtures measuring authorized completion, unnecessary
   work, skipped-gate attempts, and reported cost. Cost is diagnostic only and
   cannot influence authoritative state.
8. Document installation/live-smoke requirements without activating a provider
   account or production worker.
9. Run focused tests, `npm run test:run`, and `npm run verify`; update roadmap,
   current state, privacy/security documentation, and lesson closeout; then
   open, review, and merge the Phase I pull request.

## Exit evidence

- Repeated controlled runs reach success only when the server issues a valid
  permit.
- The same runs remain denied when the server denies finalization, regardless
  of Hermes output.
- Semantic submissions are exact-package/source bound and validated by the
  existing server controller before state changes.
- Public MCP and Action inventories remain unchanged.
- No provider credential, Hermes memory, production deployment, or new durable
  private-content store is introduced.
