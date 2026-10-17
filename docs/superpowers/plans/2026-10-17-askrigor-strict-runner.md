# Strict runner — owner question 116, answer 116a

Authority: the owner's 2026-10-17 bounded build brief in this session. The design,
fixed sentences, restricted Codex commands, privacy boundary and fixture-only
acceptance come from that brief. Local build only; no commit, push, deployment,
API inference or Codex execution in tests. Existing isolated task branch retained.

Lane: iteration, with the owner's complete `npm run verify` gate required.

## Plan and acceptance

1. Read live Universal bootstrap, local development inheritance, event-log shapes
   and existing validation conventions. Check lesson status and authority policy.
2. Implement the CLI and a pure event parser/gate with injected execution for tests.
3. Exercise the owner's complete fixture checklist, runtime command construction,
   permissions and content-free runner state without invoking Codex.
4. Document installation, use, exact guarantees and privacy limitations; index it.
5. Run focused tests, `npm run verify`, inspect the diff and record closeout here.

## Active contract

Activation: ACTIVE via the owner's mandatory live GitHub bootstrap; current
default-branch UDA AGENTS, LESSON-INDEX and task-relevant patterns were fetched
and read, followed by `project/DEVELOPMENT_INHERITANCE.md` and local router.

- Owner brief, exact strings and bounded scope: preserve the specified behavior;
  fixtures enforce prompts, footer, retries and tool restrictions. Any conflict
  or impossible requirement is reported rather than redesigned.
- UDA reasoning-selection / pattern-matching fit: exact identifiers, statuses,
  text normalization and model-declared NOT RESEARCH are structural checks;
  no keyword classifier for whether an answer is research. Failure means repair
  the mechanism rather than add semantic word lists. Mechanical enforcement.
- UDA task-time-lesson-activation / boundary binding: test the displayed answer,
  command arguments and persisted state, not merely intermediate assertions.
  Repair any unmet requirement before delivery. Mechanical plus source review.
- UDA development-assurance-lanes and local zero-spend authority: fixture-only
  iteration and the explicitly required full verification; no live invocation,
  API spend, release, or unrelated lesson-queue expansion. Command/diff review.
- UDA codex-github-operating-system / continuation: finish the bounded local
  artifacts and verification; no commit or external mutation. Preserve exact
  remaining gaps if verification fails. Final diff and receipt review.

Bootstrap checks: clean requested branch; `CHAT_WORK_AUTHORITY_GATE_PASS`;
lesson queue available: 20 open, 0 needs review, 6 accepted not incorporated,
19 incorporated/closed, 0 deletion eligible, 0 unrecorded suggested fixes.

## Execution receipt

Completed the CLI, pure parser/gate, fixture tests, user documentation and index
entry. The implementation keeps tool violations across fix rounds, accepts only
the last finalization, shares the fix budget across all three repair conditions,
and asks the model exactly once to classify an answer without a finalizer. Event
streaming, command construction, state permissions, private logs and safe error
output are tested with an injected transport; no Codex process was run.

Validation:

- `npm run test:run -- tests/askrigor-strict.test.ts`: 1 file, 43 tests passed.
- Standalone strict TypeScript check of the new CLI/library/tests, using
  `--types node`: passed. The initial standalone command omitted Node types and
  failed on missing ambient definitions; no source fix or dependency was needed.
- `npx tsx scripts/askrigor-strict.mts --help`: passed without invoking Codex.
- `npm run verify`: exit 0; typecheck and build passed; 247 test files passed,
  1 skipped (248 total); 3,551 tests passed, 6 skipped (3,557 total).
- Final source/diff and whitespace review: passed; only the six intended paths
  changed; verification introduced no generated tracked/untracked drift.

Pre-delivery contract: PASS for exact sentences and fixtures; PASS for structural
checks with model-owned research classification; PASS for actual command/state/
output boundary tests; PASS for zero-spend fixture-only scope; PASS for completed
bounded artifacts and verification. These are execution evidence, not a live
product or scientific-adequacy certification.

Privacy clarification: the runner saves no content without `--keep-log`, but
Codex's independent session history supports resume and is not controlled by
this flag. The docs distinguish local wrapper artifacts from normal provider
requests and Codex history. No implementation design change was made.

Lesson closeout: no new general lesson beyond the activated exact-boundary and
semantic-classification rules; their application is captured by the fixture
tests. No lesson issue, suggested-fix, remote write or unrelated change made.

Stop admission: bounded owner outcome SATISFIED. All six local artifacts and
required verification are complete. No executable in-scope work remains.
Live Codex acceptance was deliberately not run; commit, push, Git configuration
changes and release are outside this owner's build authorization.

## Supervisor review and live acceptance (2026-10-17, Claude session)

- **Fix 1, server overrides:** `codex mcp list` also lists servers that config.toml does not define (a plugin's or a
  built-in one, here `cua_repl` and `node_repl`); `-c mcp_servers.<name>.enabled=false` on those stops Codex from
  starting ("invalid transport"). The runner now tries each override with `codex mcp list --json` first and keeps only
  those Codex accepts; the browser and computer-use switches always apply, and the gate still names any other tool a
  turn uses. Test added.
- **Fix 2, shell commands:** the build made any shell command block the answer, against the design (count only). The
  first live run was refused for one shell command (the AI reading the clock for its timestamp line). Shell commands
  are now reported by count and do not block; other apps' and servers' tools still do.
- **Live acceptance:** one run on a made-up question (magnesium glycinate and sleep in healthy adults) against the
  live AskRigor (build 141c229f): 32 AskRigor calls, 1 shell command, no other tools; the final check ran five times
  (`not_ready` three times, then `ready_with_limits`); the final message equals the last checked draft exactly (5,185
  characters). Under fix 2 the runner shows it with the footer; state.json held only the thread id and the update
  time (the live build returns no carried state yet).
