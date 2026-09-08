# Hermes server policy bridge plan

Status: source-bound implementation candidate for one draft pull request. This
slice does not authorize readiness, merge, deployment, provider inference,
private research, release, configuration changes, or spending.

## Authority and fixed scope

- Base commit: `bc4ba9b59b8223c3a85f1188ec144a9db803da3f`, tree
  `4b44a6c4d21c8c1d357d6afcc3270cc82a2806bb`.
- Project Manager directive: `askrigor-hermes-server-policy-bridge-v1`, source
  message `d466c37a-2bad-44e0-a9b3-ac9cced1ff49`, 25,015 UTF-8 bytes,
  SHA-256
  `65b69c1e71972b297fe1075cded86cf32aeb5d4a3c81c484b3c05d230589b8bc`.
  This valid transport revision 2 supersedes the malformed, unexecuted source
  message `c8b5b9f4-babb-4d4e-af7e-fd59bf03b403`; it changes only the syntax
  command from an invalid quoted string to an argv array.
- The 2,977-byte admission request, SHA-256
  `489d8a02173794207e92efd1c3876f28b74977ca050cc758f24e9515f0e8c2e2`,
  passed the repository authority gate and the installed Mission Control
  parser/evaluator before the single authenticated submission. The complete
  833-byte response, SHA-256
  `cdf7b335fe425ed35f44b765fa34cae8b12ee2c9aa81f357524503cb926bba6a`,
  returned HTTP 200, `admitted: true`, `mayExecute: true`,
  `ALLOW_BOUNDED_EXECUTION`, `providerDeliveryState: NOT_REQUIRED`, and no
  routed action or owner relay.
- Work only on branch `task/hermes-server-policy-bridge-20260908`. Change only
  the two bridge files, the four named test files if needed, and this plan.
- Keep canonical protocols, project instructions, Forum Signal, the shared
  policy builder/validator, private status schema and routes, dependencies,
  lockfile, Dockerfile, workflows, production wiring, and historical evidence
  unchanged.

## Source and derivation graph

The private server handler already calls
`createResearchSemanticPolicyInputs`, which reads the exact four canonical
documents and builds the server-owned `instruction` and `policy_context`. It
passes those fields with `semantic_work`, `response_contract`, session/state
identity, and optional research/evidence context to the injected executor.
`createHermesProcessSemanticExecutor` is the concrete subprocess adapter. It
currently verifies the pinned runtime before validating policy input and lets
`spawnJsonProcess` call `JSON.stringify` at the final write. The Python bridge
currently reads at most 512 KiB and uses only its static `system_prompt()`.
The repair belongs at these two transport boundaries; the existing server
builder and validator remain the source of truth.

## Prospective acceptance sequence

1. Add externally observable tests before production edits. Use the real
   canonical builder, all ten semantic work kinds, the actual TypeScript
   serialization/process seam, the repository Python bridge, a fake
   `run_agent.AIAgent`, and synthetic research/evidence data only.
2. Record the complete current envelope's exact serialized UTF-8 size and
   demonstrate that the unchanged 512 KiB Python limit rejects it without an
   agent call. Record the causal negative-test result separately.
3. In TypeScript, require and validate the top-level instruction,
   `policy_context`, `semantic_work`, and response contract before pin checks or
   process launch. Reuse `validateResearchSemanticPolicyContext`, reconstructing
   the expected protocol tuple from packet manifests only for internal
   consistency. Serialize once, enforce the 2,097,152-byte input ceiling, and
   write those same bytes to stdin.
4. In Python, read at most 2,097,153 bytes, reject overflow, then validate the
   four fixed document identities, paths, text re-encoding, byte counts,
   SHA-256 values, protocol-manifest consistency, and the unchanged aggregate
   digest before importing or constructing the agent. Missing policy or
   instruction maps to `POLICY_INPUT_REQUIRED`; malformed or inconsistent
   policy maps to `POLICY_INPUT_INVALID`.
5. Compose the effective prompt as the unchanged `system_prompt()` return,
   exactly two LF bytes, and the exact top-level instruction. Preserve the
   complete decoded work object, optional contexts, no-tools/no-memory flags,
   child-environment allowlist, pin, output/stderr limits, sanitized failures,
   result binding, replay, finalization, and server authority.
6. Cover exact-limit acceptance and one-byte-over rejection on both sides;
   missing, duplicate and tampered policy; misleading policy-shaped evidence;
   BOM, non-ASCII and mixed-line-ending preservation; all ten work kinds; the
   real private handler; and explicit rejection of the legacy policy-less
   status-view package without provider execution.

## Validation and publication boundary

- Run the focused Vitest command named by the directive, the Python standard
  library unittest through Vitest, the Python AST syntax check, `npm run
  verify`, and `git diff --check` under Node 24.18.0. Record the Python version.
- Verify the final changed-path allowlist and the fixed canonical-source
  SHA-256 values. Inspect the complete diff against the exact base and recheck
  remote `main` before publication.
- Commit the final candidate, publish the branch once without force, create one
  draft PR, and observe its naturally triggered checks. Return exact receipts
  to the Project Manager. Stop before readiness, merge, deployment, release,
  provider use, private research, or installed-consumer work.

## Remaining obligations

The policy-less legacy `runHermesResearchTask` status-view package remains an
explicit compatibility gap: the concrete executor must reject it, while this
slice does not redesign its orchestration. Actual pinned-upstream/provider
acceptance, private status-view delivery, production deployment, installed
Custom GPT/plugin currency, and release acceptance remain separate and open.
