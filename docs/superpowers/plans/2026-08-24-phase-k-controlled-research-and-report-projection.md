# Phase K controlled research and report projection

Status: owner-directed implementation plan; execute as Phase K sub-gates from
current `main`

## Why this repair is required

The Phase H private transport and Phase J control plane prove server ownership
only through module routing, automated/native discovery, and candidate
screening. They do not yet execute the controller's later transcript,
discussion, formal-evidence, full-text, method-audit, bidirectional, treatment,
and final-audit capabilities. The current finalization result also contains an
authorization permit and limitations but no source-linked reader evidence.

Projecting only `start`, `continue`, `status`, and `finalize` into the Custom GPT
in that state would recreate the product failure: the server would stop after
candidate screening and the GPT would either stop or manufacture the missing
synthesis. This is an implementation gap in the Phase K prerequisites, not a
reason to add more model instructions.

## Governing decisions

1. Extend the existing controller and source/receipt executors. Do not create a
   parallel controller or encode completion policy in the Custom GPT.
2. One transport-independent advancement engine chooses and executes exactly
   one current server-derived capability per call. Private orchestration and
   the later public Action projection share it.
3. Deterministic source operations are executed and ingested by the server.
   A model never recreates transcript, discussion, search, full-text, provider,
   or completion receipts as JSON.
4. Semantic work is exact-session, exact-state, exact-frontier, and exact-source
   bound. The server validates structure and provenance; validation is not
   mislabeled as semantic truth.
5. Preserve short source-linked semantic findings needed for the answer, but
   never raw transcripts, comments, article text, provider bodies, commenter
   identity, credentials, or private chat.
6. Reuse the Phase G encrypted research-session checkpoint and its existing
   72-hour idle/seven-day absolute expiry, byte limits, deletion, backup
   exclusion, and rollback. Add no standalone or external evidence database.
7. Add a server-directed report-synthesis work package after treatment
   finalization. Its strict reader packet is bound to current evidence and
   claim capabilities. It cannot authorize completion.
8. The final completion audit requires a current report packet, and the final
   permit binds that packet's digest. Finalization returns the exact reader
   packet plus authorization; the Custom GPT renders rather than synthesizes.
9. Keep provider-specific controls internal. Keep the public educational health
   boundary and plain-language output. Technical codes appear only on explicit
   audit/debug request.
10. The minimum Custom GPT Action projection is four controlled research
    operations (`start_research_session`, `continue_research_session`,
    `get_research_session_status`, `finalize_research_report`) plus the existing
    consented lesson write. The 21-tool MCP catalog remains unchanged.

## K0 — transport-independent advancement engine

Status: merged through PR #85 at
`bf592f03d71a891edab3ab73f300fd3686a66cac`; hosted and exact post-merge
checks passed.

- Extract a lifetime-shared dependency bundle and a one-transition advancement
  engine from the private route.
- Support protocol recheck/restart classification, module applicability,
  automated scouting, native discovery/identity retry, candidate screening,
  transcript acquisition, discussion audit, formal search/screening, lawful
  full-text acquisition, source method audit, external evidence, linked-work
  reconciliation, claim recalculation, bidirectional iteration/return search,
  treatment finalization, and final audit.
- Extend the strict semantic-work union only for work that genuinely requires
  judgment. Each package and submission is bound to exact state and evidence.
- Make unsupported/no-progress capability states fail closed; a repeated no-op
  is never completion or a terminal access boundary.
- Configure one shared runtime dependency graph. Do not instantiate new stores
  or handle registries per HTTP request.

Hostile gate: every controller capability either advances through its real
executor, returns one exact semantic package, returns a protocol-recognized
boundary, or fails closed. Stale/cross-session/cross-source/cross-frontier
submissions, deterministic receipt assertions, unsupported capabilities, and
no-progress loops are rejected.

## K1 — bounded evidence projection and report gate

Status: implemented and locally verified on the K1 candidate; final diff,
lesson closeout, PR, hosted checks, and merge remain required.

- [x] Preserve bounded transcript-verified creator findings with timestamps and
  transcript receipt binding.
- [x] Preserve de-identified community findings/counter-signals with discussion
  corpus/receipt binding.
- [x] Preserve source method findings, applicability, exact program/comparator,
  outcomes/horizon, material limitations, and claim capabilities with exact
  document/block/audit binding.
- [x] Preserve selected-video treatment interpretations rather than only their
  digest.
- [x] Retain or safely reacquire the exact bounded external-audit input required by
  claim recalculation; never accept caller-recreated provider receipts.
- [x] Add a strict `report_synthesis` package and submission. The reader packet maps
  every material claim to capable current sources and carries explicit
  inference, population/stage, program, outcome/horizon, uncertainty,
  alternatives, harms/counter-signals, videos actually audited, and
  provider/access limitations.
- [x] Validate all report references against current state. A retracted,
  effect-excluded, inaccessible, or unaudited source cannot silently support an
  effect claim. Permit-bound limitations must be represented.
- [x] Bind the current report-package SHA-256 into final completion and the signed
  permit. Return the exact packet on authorized or bounded finalization.
- [x] Keep the ordinary reader packet within the existing Action response limit.
  A later optional technical projection may paginate details but cannot unlock
  completion.

Hostile gate: deleting or mutating a source, receipt, claim capability,
limitation, report reference, report digest, or report-completeness check makes
finalization fail. Raw source/private/provider content cannot enter the
checkpoint or reader packet.

## K2 — compact public Action projection

- Add the four authenticated controlled Action routes over the same controller.
- Remove low-level research operations from the generated Custom GPT Action
  document only after K0/K1 pass; retain server/MCP routes needed by controlled
  internal execution and technical clients.
- Generate compact Custom GPT Instructions from a dedicated checked-in source,
  not from the full plugin skill. The GPT starts/resumes, performs only the
  exact returned semantic package when asked, continues while required, and
  renders only the server-authorized reader packet.
- Keep Spark/Gemini an internal automated high-recall scout. No user handoff,
  pasted packet, or Gemini key enters the GPT.
- Replace caller-authored product-acceptance JSON with a signed server-issued
  acceptance receipt containing the exact bundle/protocol/session transition
  trace, final boundary, permit digest, report digest, fixed synthetic challenge
  identity, and no private content.
- Prove the GPT projection is exactly four research reads plus the lesson write,
  while the MCP catalog remains 21 tools.

## K3 — reversible candidate deployment and real product acceptance

Phase K product replay cannot test branch-only endpoints at the production
Action origin. Therefore the Phase K exit sequence is:

1. merge the reviewed implementation candidate;
2. perform a reversible exact-commit candidate deployment with retained
   rollback and no Phase-L completeness claim;
3. import the exact generated Instructions/OpenAPI once in the existing signed-
   in GPT editor;
4. run Preview and repeated fresh chats for the known failure shape and held-out
   treatment questions;
5. capture server-issued signed acceptance receipts and compare them with the
   installed bundle digest;
6. record failures honestly and repair from fresh `main`; and
7. mark Phase K complete only when every planned real-product replay passes.

The product cases include a corrected/retracted study, a FORRT-linked
repetition, optional unconfigured providers, varied treatment-program
fingerprints (no generic pooling of “exercise” or another class), plain
language, and provider-scoped limitations. If the GPT repeatedly bypasses the
compact contract, final synthesis remains on the controlled AskRigor surface
and the GPT is downgraded to an optional client.

## Verification and closeout for each sub-gate

- Add focused hostile and mutation/regression tests before implementation.
- Run focused tests continuously, then `npm run test:run` and `npm run verify`.
- Preserve exactly 21 MCP tools until an explicit later inventory decision.
- Review the complete diff, privacy/threat/recovery/release effects, and lesson
  disposition.
- Use a PR and hosted checks for each independently reviewable sub-gate. Merge
  only passing work, refresh from `main`, and continue to the next Phase K
  sub-gate without ceremonial owner confirmation.

Phase L remains the final release/deployment/plugin synchronization and
closeout phase after Phase K's real product acceptance. A Phase K candidate
deployment is necessary test setup, not evidence that Phase L is complete.
