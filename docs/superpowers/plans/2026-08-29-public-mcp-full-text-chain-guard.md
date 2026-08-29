# Public MCP full-text chain guard

Status: implementation and release in progress

Assurance lane: release — the owner approved production deployment, ChatGPT
app refresh, and fresh product acceptance

## Objective

Make the already enforced open-full-text chain contract explicit at the public
MCP composition boundary. An ordinary ChatGPT run must not reacquire a second
handle, mix chains, continue an exhausted document, or report a validator
receipt whose document handle or source hash differs from acquisition.

## Observed composition failure

A default installed-app run acquired one complete public document but reported
a different acquisition handle from the one named in its validator coverage
receipt. A controlled replay that pinned the exact input schema, one acquisition,
the exhaustion rule, and byte-equal handle/hash checks completed correctly.
Backend routes and focused tests already bind validation to the server-held
document, so this repair targets the public wrapper rather than weakening or
duplicating the validator.

## Implementation

1. Add the exact input, handle, exhaustion, validation, mismatch, expiry, and
   no-chain-combination rules to the public MCP server instructions.
2. Put each local part of that contract in the descriptions for
   `acquire_open_full_text`, `continue_open_full_text`,
   `validate_study_method_audit`, and `validate_review_method_audit`.
3. Add composition-boundary regressions and regenerate the canonical tool
   inventory from `tools/list`.
4. Preserve the ordered 21-tool catalog, all input/output schemas, the
   five-operation Custom GPT Action surface, and both canonical XML files.

## Verification and release

- Run the affected MCP and open-full-text suites, then `npm run verify`.
- Review the complete diff, generated inventory, privacy impact, and lesson
  disposition. This change adds no new stored data or provider access.
- Open a pull request, require protected hosted checks, and merge the exact
  reviewed head.
- Before deployment, rerun `npm run lessons:status` and preserve the current
  image/Compose rollback point.
- Deploy the exact merge and verify health, the exact ordered 21-tool catalog,
  live HRP and Universal manifests, one read-only connector probe, and complete
  source/installed plugin-package receipts.
- Refresh the installed ChatGPT app and run a fresh ordinary-prompt full-text
  composition case. Acceptance requires one acquisition, no continuation when
  the first coverage receipt is exhausted, one matching validator, and exact
  acquisition-to-validation handle and source-hash equality.

## Non-goals

- No protocol, research-policy, schema, provider, or Custom GPT Action change.
- No durable full-text, transcript, comment, or research-result store.
- No implementation decision for the separately queued cumulative knowledge
  repository; that requires an owner design discussion and privacy review.

## Lesson disposition

Project-specific / no new universal lesson. The exact public tool names,
coverage fields, and model-composition failure belong to AskRigor. The
transferable requirement to test the wrapper-plus-worker composition boundary
and preserve a specialist contract is already current in the Universal
`executable-frontier-coherence` pattern. The cumulative repository request is
an owner product-design queue item, not validated implementation evidence.

## Local verification receipt

- The two new composition assertions failed on the previous public guidance as
  expected.
- The affected MCP, open-full-text, generated-inventory, release-packet, and
  shared-registry gate passes 76/76 tests.
- Typecheck and the production TypeScript build pass.
- The first canonical `npm run verify` attempt passed 1,419 tests and stopped
  on nine unrelated fixed-timeout failures while host load averaged 16.9. The
  same seven files reduced to three timeout-only failures under one worker.
- The complete load-tolerant rerun with two serialized workers and expanded
  timeouts passes 106 files with one declared live file skipped and 1,428 tests
  with six declared live tests skipped. Protected canonical CI remains required
  before merge.
- The generated inventory remains exactly 21 read-only tools with unchanged
  names and schemas; its new source-derived SHA-256 is
  `e8c3388befec97f5c2f666122c5605821c3cd7afec92e9aecd540593f5c880c5`.
- HRP, Universal, the five-operation Action schema, generated Custom GPT
  instructions, and all eight source plugin-package members are unchanged.
- PR #123 is open from the isolated task branch; merge, exact deployment, app
  refresh, and fresh product acceptance remain pending.
