# Custom GPT Forum Signal Regression Repair Plan

**Goal:** Repair the published Custom GPT instruction packet so treatment-alternative questions cannot be labeled HRP-complete without required formal retrieval and a passing Forum Signal receipt, while preserving fail-closed lesson privacy and allowing a fully generalized protocol-execution lesson through the privacy-only model contract.

**Baseline:** PR #35 merge `f603a384efbb028d1865c57c232bd134d8c5584b`. Production remains PR #32 merge `d1af238325ee1e0584574e47bbcbe7764d17cf7e`. The observed failed lesson submission is non-retryable and must not be resubmitted.

## Constraints

- Do not modify either canonical protocol XML file or reinterpret protocol authority.
- Preserve the public non-tailored health-research boundary.
- Preserve the exact 17 read-only MCP tools, 18-operation Custom GPT Action surface, lesson consent shell, and fail-closed deterministic/model privacy gates.
- Treat `skills/askrigor/SKILL.md` and `project/CUSTOM_GPT_ACTION_MODULE.md` as the generated instruction sources; regenerate, never hand-edit, `docs/custom-gpt-instructions.md` or `docs/custom-gpt-sync.json`.
- Keep Custom GPT instructions within the tested 7,800-character bound and the plugin skill below 500 words.
- Use synthetic fixtures only. Do not retry the failed candidate, create a GitHub lesson, call a live provider, deploy, update the GPT editor, push, or publish during the local repair pass.
- Preserve the dirty original checkout and its untracked files.

## TDD sequence

1. Add failing router/package/packet assertions that explicitly classify questions about treatment alternatives, avoiding replacement, avoiding joint replacement, or avoiding surgery as Forum Signal-required. Assert that HRP-complete is forbidden until all formal retrieval required by the applicability ledger and the Forum Signal receipt pass, including the Project aggregate lock and each Custom GPT Action-returned per-video lock.
2. Add a failing anonymizer contract test with a synthetic `protocol_execution` candidate containing no medical topic, prompt, quotation, URL, turn reference, transcript, or identifier. Assert that the privacy prompt classifies that shape solely for privacy/security and explicitly treats an already-generalized required-module/receipt lesson as safe.
3. Run the focused tests and retain the expected RED result before changing production sources.
4. Tighten `project/PROJECT_INSTRUCTIONS.md` and `skills/askrigor/SKILL.md` with the narrow explicit trigger and completion gate. Add the protocol-execution safe-example guidance to `PRIVACY_SYSTEM_PROMPT` without weakening uncertainty, metadata preservation, deterministic re-screening, or fail-closed behavior.
5. Regenerate the Custom GPT packet with `npm run generate:custom-gpt` and verify only the expected instruction/sync artifacts change.
6. Run focused tests, `npm run verify`, the required lesson-status checkpoint, diff/secret/generated-artifact checks, and independent review.
7. Update `project/CODEX-CURRENT-STATE.md` and applicable release/acceptance evidence with local truth only. Record deployment, editor installation, and fresh UI acceptance as pending until they actually occur.

## Acceptance criteria

- Source and generated instructions contain the explicit treatment-alternative trigger and completion rule in matching semantics.
- No HRP-complete label or full-HRP opening is allowed while ledger-required formal retrieval is unexecuted or a required Forum Signal receipt/directional field/Action-returned per-video lock is missing or blocked.
- The synthetic generalized protocol-execution candidate passes deterministic screening, and the fixed privacy prompt explicitly tells the model not to reject that safe class for non-privacy reasons.
- All existing privacy, consent, public-health, action-schema, tool-inventory, protocol-byte, and deterministic verification gates remain green.
- The recovery checkpoint truthfully separates locally completed work from pending deployment and fresh product-interface acceptance.
