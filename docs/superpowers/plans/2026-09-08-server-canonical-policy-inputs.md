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
