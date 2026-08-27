# Candidate-screening semantic completeness repair

Status: candidate implemented and locally verified; protected review,
deployment, and fresh signed-in receipt pending

## Failure evidence

A fresh signed-in fixed acceptance challenge reached the server-owned
`candidate_screening` frontier with 45 reconciled candidates. The controlled
worker assembled the signed package but submitted a result rejected as
`research_semantic_work_mismatch`; a status read confirmed the authoritative
session and digest were unchanged. The exact rejected result did include all
45 identities, but it inferred duplicates from similar channels and treatment
themes. The server instead binds described-program redundancy to the exact
`program_signature` supplied in the package.

## Repair

- Add task-specific worker guidance that requires exact all-candidate
  membership, preserves every `video_id` exactly once, uses
  `program_signature` as the exact described-program redundancy key, and
  states the duplicate and selection invariants.
- Put the same completeness rule in the internal response-contract description
  so both the natural-language instruction and JSON Schema carry it.
- Keep the Action schema, protocol bytes, server authority, and rejection of
  incomplete or malformed submissions unchanged.

## Verification and release

- Add a regression for the exact candidate-screening worker instruction and
  internal response-contract description.
- Run focused tests, typecheck, and the complete deterministic gate.
- Review and submit the isolated branch through protected CI, deploy the exact
  merge with rollback preserved, and start a fresh signed-in acceptance
  challenge because acceptance traces are process-local.

## Candidate evidence

- Focused candidate/controlled-route tests: 13/13 passed.
- Typecheck: passed.
- Complete deterministic gate: 106 files and 1,403 tests passed; one file and
  six credential-bound live tests skipped as declared; production build passed.
- Product correction: the same preserved session accepted the exact
  `program_signature` rule and advanced from candidate screening to formal
  evidence with 35 selected videos.
