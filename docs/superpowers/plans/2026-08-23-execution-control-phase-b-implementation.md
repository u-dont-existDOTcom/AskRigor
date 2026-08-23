# Execution-control Phase B implementation plan

Date: 2026-08-23

Branch: `agent/execution-control-phase-b-20260823`

Base: Phase A merge `1dd18f91fa94da391c3b5e30c604850e3813f4de`

Authority: current owner requirements, unchanged complete canonical HRP and
Universal bytes, Project router/Forum Signal module, and Phase B of the
productionization roadmap. This phase implements existing policy; it does not
change treatment or health policy.

## Objective

Make external and native video discovery authoritative server-owned state.
Candidates must enter that state only from exact provider/validation results,
with stable identity, provenance, provisional program information, access
state, and deterministic reconciliation. Counts remain diagnostics and cannot
authorize advancement.

## Design

1. Add a bounded transport-independent candidate-frontier controller that:
   - ingests the existing independently validated Gemini receipt and exact
     packet/query provenance;
   - ingests the existing native YouTube survey output;
   - normalizes validated candidates into stable records;
   - retains unresolved/rejected identities at frontier scope rather than
     promoting them into decision-relevant candidate state;
   - merges duplicate video identities across sources with reciprocal origin
     links;
   - derives program signatures with the existing treatment-landscape
     normalization and preserves missing fields as `program not described`;
   - exposes derived diagnostics for raw counts, unresolved identities,
     multiple-source overlap, and signature groups.
2. Extend session state with a required native-discovery operation. External
   scout completion no longer makes candidate screening available by itself.
3. Run native YouTube discovery as the next server-owned prototype transition,
   using at most six deterministically selected queries from the validated
   scout packet. The model cannot submit a replacement frontier or count.
4. Make candidate-screening eligibility depend on both real frontier results,
   exact reciprocal links, resolved public identities, and unresolved semantic
   screening work—not quotas.
5. Keep later semantic materiality/redundancy decisions pending as bounded work
   packages; Phase B will not let a client mark them complete.

## Hostile tests

- forged candidate counts/lists cannot alter state;
- external candidates without independent validation cannot enter the ledger;
- missing or one-way frontier/candidate links fail schema validation;
- duplicate video identities merge rather than inflate counts;
- renamed candidates with the same described program signature cannot count as
  distinct while redundancy remains unresolved;
- unresolved external/native identities block screening advancement;
- external-only or native-only discovery does not satisfy the combined gate;
- `program not described` is retained for unavailable fields;
- public MCP/Action inventories remain 21/26 and the prototype stays
  unregistered.

## Verification and recovery

Run focused frontier/controller/prototype/inventory tests, then
`npm run test:run` and `npm run verify` at the host boundary. Update roadmap and
current state, complete lesson closeout, review the exact diff, open a PR, wait
for protected CI/CodeQL, merge, and begin Phase C from fresh `main`. The exact
base commit above is the rollback point; no production deployment is part of
Phase B.
