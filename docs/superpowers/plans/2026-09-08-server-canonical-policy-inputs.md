# Server canonical policy inputs implementation plan

## Authority and fixed scope

- Base commit: `c9c148cd3c1a62ab0a8b4800222e50229f8f536e`
  (`d631cabfb034ce1c08f0ac14cee209e0d3a84f95`).
- Project Manager directive: `askrigor-server-canonical-policy-inputs-v1`,
  amended only for admission recovery by
  `askrigor-server-policy-inputs-admission-shape-recovery-v1` and
  `askrigor-server-policy-inputs-semantic-admission-recovery-v2`.
- The final request passed the installed structural parser and semantic authority
  evaluator before the authenticated runtime returned
  `ALLOW_BOUNDED_EXECUTION` with `mayExecute: true`.
- Deliver complete, exact, version-bound existing policy content only to the
  controlled Action worker input and the injected private executor input.
- Keep both canonical protocols, both project instruction documents,
  `AGENTS.md`, and `CURRENT-STATE.md` byte-identical to the fixed base.
- Keep the external Hermes adapter, Python prompt, installed Custom GPT,
  deployment, release, and the separate Reasoning Selection wording change out
  of this slice.

## Active lesson contract

1. **GitHub isolation and exact-base publication.** Work only in the named
   branch and isolated worktree. Stop on base or publication drift; do not
   rebase or overwrite concurrent work.
2. **Transformation preservation.** Derive every text digest from the exact
   UTF-8 bytes loaded through trusted fixed paths. Prove source documents are
   unchanged and reject omission, duplication, mismatch, malformed input, or
   session-binding drift.
3. **Task-time enforcement.** The shared assembler is the enforcement point.
   Both selected call sites must use it, and tests must demonstrate actual
   serialized or captured inputs rather than only the presence of helper code.
4. **Efficient verification.** Use focused tests while iterating, then run the
   complete deterministic gate once against the final candidate tree. Preserve
   failures as evidence and avoid redundant green reruns.

## Implementation

1. Extend `@askrigor/protocol` with a minimal snapshot loader returning text and
   its manifest from the same validated `readProtocol` operation.
2. Add one shared server-side policy-input module with a fixed document
   allowlist and order: Universal, HRP, project router, Forum Signal module.
   Record document IDs, repository paths, exact text, UTF-8 byte counts,
   SHA-256 digests, and protocol manifests. Compute one deterministic context
   digest over canonical JSON excluding the digest field itself.
3. Bind the loaded Universal and HRP identities to the current session tuple.
   Fail before payload issuance or executor dispatch on malformed, duplicate,
   mismatched, or unrepresentable inputs. Do not fall back to a policy-free
   input.
4. Add `policy_context` and the common task instruction plus the authorized
   bounded-execution clarification to both selected input envelopes. Preserve
   existing research context, evidence context, semantic work, response
   contract, state binding, and output schemas.
5. Add narrow named-file `COPY` instructions for the two project documents in
   both Docker stages.

## Offline acceptance

- Test exact snapshots, stable ordering and digest, UTF-8 and line-ending
  preservation, deterministic rereads, and session binding.
- Reject missing or duplicate documents, invalid UTF-8/XML, text/hash or
  manifest mismatch, and protocol drift.
- Exercise all ten semantic work kinds through the common input builder and
  cover the real controlled payload round trip and real private executor
  dispatch with capturing fixtures.
- Reassemble a realistically sized canonical controlled payload and verify all
  pages, terminal receipt, exact JSON, document bytes and hashes, and evidence
  preservation. Verify policy-shaped evidence cannot replace server-owned
  policy or instruction.
- Preserve required-module, no-tools, replay/state, protocol-drift, and
  finalization-denial behavior. Verify legacy interfaces outside this slice do
  not falsely claim policy delivery.
- Verify a temporary production-like layout and the Dockerfile's exact named
  copies without claiming a built image.
- Run focused changed-area tests, `npm run verify`, and `git diff --check` under
  Node `24.18.0`; inspect the final diff and source hashes.

## Remaining obligations

The canonical Reasoning Selection wording and concise project/agent
application remain a separate version-bound task. The external Hermes/private
view path, Python/provider boundary, installed consumer, deployment, release,
and product-interface acceptance also remain open and must not be reported as
repaired by this branch.

## R1 prospective acceptance recovery

The first R1 correction was specified by
`askrigor-server-policy-inputs-utf8-preservation-correction-v1`, source message
`31213b3b-c102-47e7-acbf-e35e697c9aed`, 13,659 UTF-8 bytes, SHA-256
`af131e9b818032ba49130433c9666ed661ddb884fb803e1af76c43432b186e81`.
The BOM-preservation correction, its initial tests, commit
`19bd1ef44cfcc01a6e7e6ddbaf81054f19cf139d`, tree
`4f41424fc2c8bd85888b8fe0f919dcf50b392a63`, and its first publication
occurred before the directive's fresh-admission requirement was visible. They
are recorded as an execution-order deviation and are not claimed as
retroactively authorized.

The Project Manager retained that commit as the review candidate and issued
`askrigor-server-policy-inputs-r1-prospective-acceptance-recovery-v1`, source
message `0cf54be9-48b5-4b4d-b918-be5fd84ae399`, 18,602 UTF-8 bytes, SHA-256
`50578a19bcfe6ce3bd5b2dbfd09abc4e450f272f9dac88a38a2fadd1b0acb24f`.
Before any further repository tests or changes, the exact frozen 3,828-byte
admission request (SHA-256
`13fcde019add56efea6e600b0b27161c8df9b109159a0fe465d05603376c2d8e`)
passed the local AskRigor authority gate, the installed structural parser, and
the semantic evaluator. The sole prospective recovery submission returned an
841-byte response (SHA-256
`f5040baf511e0d5e5de4da0c7cf79e30e309b07d6c34250750aad167447e1cc7`)
for request
`admission:askrigor:server-policy-inputs-r1-prospective:0cf54be9:19bd1ef:draft-pr:zero-spend:20260908`
with `admitted: true`, `mayExecute: true`,
`ALLOW_BOUNDED_EXECUTION`, `providerDeliveryState: NOT_REQUIRED`, and no owner
relay or route event. This was the one additional allowed HTTP submission; the
three historical related admissions remain preserved.

The prospective negative comparison used immutable pre-repair implementation
`169ffd3c46e21c27ff7984f74444d83cc7eec650` in detached worktree
`/tmp/askrigor-r1-pre-repair-comparison`. Only the four final regression test
files were overlaid as tracked source changes. Their SHA-256 values were:

- `tests/protocol.test.ts`:
  `c6eec16af799e8116a5da1fa9589ddd65ab643b4d0c87a880757bab9bcb383c3`
- `tests/research-semantic-policy-input.test.ts`:
  `5bd96a38736cbdde39225d6a9972dbdfa2675a23b58add5bd33a40b76f952581`
- `tests/controlled-research-route.test.ts`:
  `907d1923a41542e85413e3d2ccd39b03ea96bfcfcc971fa943c83aca2c82723a`
- `tests/private-research-orchestration.test.ts`:
  `89af60bd4264d6c0fd35bea713f688cb82b039ae0833b804c80604fc3646d544`

Under Node `v24.18.0`, the exact command
`npx vitest run tests/protocol.test.ts tests/research-semantic-policy-input.test.ts tests/controlled-research-route.test.ts tests/private-research-orchestration.test.ts`
ran from `2026-09-08T04:38:25Z` to `2026-09-08T04:39:33Z`. It failed with
exit status 1: 7 BOM-specific failures and 50 passes. Both protocol snapshots,
both project-document contexts, both controlled payload reconstructions, and
the private executor boundary lost the leading BOM under the unchanged old
implementation. The captured log SHA-256 was
`1108890be5bfcfa1a57a09f4dc4f9f92bc20b7bafba23cb445c6f5a7ff6a54cc`.

The identical four-file overlay and command then ran against retained candidate
`19bd1ef44cfcc01a6e7e6ddbaf81054f19cf139d` from
`2026-09-08T04:39:52Z` to `2026-09-08T04:41:00Z`: all 57 tests passed. The
captured log SHA-256 was
`028a46ce387228a2305f42923306adbdd65e018cdeafbd4cbea892f80d38b6e0`.
The accepted regressions now cover both project document IDs with exact BOM
text, original byte counts and SHA-256 values, exact UTF-8 re-encoding, and
distinct document/context digests after removing only the BOM; both protocol
IDs while retaining malformed-UTF-8 and malformed-XML rejection; real
controlled-route reconstruction with prior cursor and terminal-receipt
rejection plus unchanged state; and exact delivery of both BOM-bearing project
documents to the real private executor boundary while preserving the existing
pre-dispatch failure regression.

The final repository-wide gate used the repository's exact `npm run verify`
command under Node `v24.18.0`. A first non-PTY execution was terminated by the
execution channel with exit status 143 after about 100 seconds while Vitest was
still running and emitted no test failure. The unchanged command was therefore
rerun in a persistent PTY and completed successfully: typecheck passed, 152
test files passed with 1 skipped, 1,827 tests passed with 6 skipped, and the
final build passed. `git diff --check` passed. The canonical Universal, HRP,
project router, Forum Signal module, `AGENTS.md`, and current-state files remain
byte-identical to base commit `c9c148cd3c1a62ab0a8b4800222e50229f8f536e`;
their SHA-256 values are respectively
`e996eb5385062c7dd445c9dae3c6950bc2da045440526e1ba67b4108e0ddd752`,
`dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1`,
`805253e162310527d85fadb46dcfd34d54ecc93afdb73e29a6b0a641a4b520c6`,
`75c088ba0edeb821d3d664d2f0b48b33f7dd3e627c01dfe830053d6dac2aed13`,
`3d53b2f2d7a1cfbb56055c7a6963347cc364368b84f2560b825d28ee56ac1f1b`,
and `bf6581b2397f55cfd9f03b05c2e6795f52760ba6a7b4e8843485b7a2f488c450`.
The lesson queue was available at `2026-09-08T04:51:13.433Z`: 1 open
candidate, 1 needs review, 0 accepted but not incorporated, 4 incorporated or
closed, and 0 deletion eligible. No lesson expanded this bounded task.
