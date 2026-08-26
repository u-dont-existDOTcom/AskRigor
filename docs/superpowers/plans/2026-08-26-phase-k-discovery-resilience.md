# Phase K discovery resilience repair

Status: PR #101 merged and exactly deployed; one live-discovered progress-view
follow-up is in progress on `agent/phase-k-progress-projection-20260826`

## Failure evidence

The fixed synthetic Custom GPT acceptance session
`ars1_VfivvctoY04Mxpdu0sBa1S9zuKm6e_3u` did not reach candidate screening.
Its encrypted server checkpoint showed two independent failures:

1. The Gemini scout request exceeded the current 45-second synchronous client
   timeout. The resulting no-status transport error was incorrectly marked
   non-retryable, so the controller recorded a terminal scout boundary.
2. Native fallback then executed six exhausted searches with zero candidates.
   Each query repeated the complete 746-character synthetic research target;
   the first query was 767 characters. A bounded live comparison returned zero
   results for that query and candidates for concise and deterministically
   truncated variants.

These are execution defects. They are not evidence that the treatment corpus
is empty, and they must not be repaired with a condition-specific exception or
more Custom GPT prose.

## Governing repair

1. Bound native fallback query subjects generically at a word boundary while
   preserving the leading decision-important terms. Keep every final YouTube
   query within a documented deterministic maximum.
2. Run controlled Gemini scouting through the provider's background
   Interaction mode. Store only the opaque interaction checkpoint and bounded
   public search-query receipts in the encrypted AskRigor session.
3. Treat provider work in progress as controller `IN_PROGRESS`, not as an
   access boundary. Start and poll are separate server-authorized transitions;
   client assertions cannot provide or replace the job checkpoint.
4. Use temporary provider storage only for the already-screened de-identified
   population target and public scout instructions. Request deletion as soon as
   each completed interaction has been consumed. Do not claim deletion erases
   provider backups or retention required by provider policy.
5. Charge the existing conservative maximum budget when a background job is
   started. Continuation polls do not reserve or charge again. The existing
   monthly cap remains unchanged.
6. Preserve the existing synchronous scout for its current technical surface,
   but classify network/timeout failures as retryable. The controlled product
   path uses the resumable background executor.
7. Keep the public Custom GPT operation count, MCP tool count, protocol bytes,
   and treatment-completion authority unchanged.

## Implementation slices

### A. Hostile regressions first

- A long research target produces six distinct native queries below the fixed
  query ceiling and preserves its leading condition/stage terms.
- Removing the bounded-subject transform recreates the overlong-query failure.
- A timeout/network failure is retryable and cannot become a terminal scout
  boundary.
- A background start records an opaque controller checkpoint and `IN_PROGRESS`.
- Polling an in-progress job cannot advance candidate evidence or completion.
- A completed grounded job is parsed, independently identity-validated, deleted
  at the provider, and ingested exactly once.
- A repair interaction remains bound to the original executed query set.
- Restart/restore preserves only the bounded opaque checkpoint and resumes it.
- Caller-authored job IDs, completion claims, or counts remain impossible.
- A background poll never reserves the AI budget a second time.

### B. Source transport

- Add start/poll/delete helpers for Gemini background Interactions.
- Reuse the existing prompt, structured packet decoder, query reconciliation,
  one bounded correction, limitations, and error mapping.
- Return a strict progress/completion/boundary union with no raw provider body.
- Delete the initial interaction before starting a correction and delete the
  correction before returning its result.

### C. Controller/runtime integration

- Add an optional bounded background-scout checkpoint to session state and an
  `IN_PROGRESS` scout projection.
- Add a controller-only progress transition and clear stale retry boundaries
  when a new provider job starts.
- Make the runtime start or resume according to exact server state.
- Keep a retryable provider/job failure executable and a genuine terminal
  identity boundary bounded.

### D. Truthful privacy and recovery records

- Update the privacy data map, threat model, Gemini setup, Phase K plan, and
  recovery/current-state record for temporary background storage, deletion
  requests, encrypted checkpoints, and conservative budget charging.
- Do not change the canonical protocols: this is faithful execution of their
  existing required automated-scout lane.

### E. Verification, release, and acceptance

- Run focused source/controller/runtime/route tests, then `npm run test:run`
  and `npm run verify`.
- Confirm public inventories remain five Custom GPT operations and 21 MCP
  tools, and generated Custom GPT Instructions/OpenAPI are unchanged unless an
  exact generated diff proves otherwise.
- Open a PR, review CI and the full diff, merge, and deploy the exact merge with
  a rollback commit.
- Run bounded live native and Gemini background probes, then the fixed
  server-side controlled acceptance. Ask for a fresh Custom GPT replay only
  after that path advances beyond discovery.
- Accept Phase K only from a valid server-issued signed
  `product_acceptance_receipt`; never invent or replace one.

## Non-goals

- No hip-specific search exception.
- No new protocol policy or completion rule.
- No new public Action/MCP operation.
- No raw provider output, personal health content, transcript, comment, or
  credential persistence.
- No indefinite polling or silent conversion of retryable work into a terminal
  boundary.

## Candidate status at 2026-08-26

- [x] Generic native-query bound implemented and regression-tested against the
  exact long acceptance target.
- [x] Resumable background Gemini start/poll/delete transport implemented.
- [x] Controller/runtime progress, restore, single-charge, and retryable
  boundary behavior covered by hostile tests.
- [x] Privacy notice, data map, threat model, setup, release, roadmap, and
  recovery records updated.
- [x] Focused suites pass; complete host suite passes 1,393 tests with six
  declared credential-gated skips; `npm run verify`, four-page site validation,
  28 deployment tests, and the production dependency audit pass.
- [x] Generated Custom GPT Instructions/OpenAPI/synchronization artifacts are
  byte-identical to the installed bundle; the five-operation Action projection
  and 21-tool MCP catalog are unchanged.
- [x] Personal plugin source and installed cache contain all eight reviewed
  inventory members and match source content byte-for-byte; only the installed
  manifest's intentional cache-buster differs.
- [x] Reviewed PR #101, required CI, and merge
  `50a766e7eaddc7d718ceb7d0ad3ab65351e79a9a`.
- [x] Exact production and privacy-site deployment with retained rollback.
- [x] Exact-target provider discovery replay on the deployed image: Gemini
  completed after 20 polls/14 searches with 10 candidates and six independently
  validated; all six bounded native fallback searches completed and returned a
  candidate.
- [ ] Direct controlled discovery replay on the exact deployment. The first
  replay exposed the missing `IN_PROGRESS` view projection and therefore does
  not count as acceptance.
- [x] Progress-view follow-up passes its 37 focused tests, standalone 1,394-test
  full suite, complete `npm run verify`, typecheck, and build.
- [x] Exact PR-head isolated candidate renders repeated background progress,
  completes Gemini and native discovery, and reaches candidate screening with
  51 reconciled candidates without replacing production.
- [ ] Fresh signed-in product replay with a valid server-issued acceptance
  receipt.
