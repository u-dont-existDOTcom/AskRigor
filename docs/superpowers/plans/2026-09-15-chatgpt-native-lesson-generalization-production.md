# ChatGPT-native lesson generalization and production completion

Status: active owner-authorized release plan
Date: 2026-09-15
Parent outcome: finish the private lesson-incident workflow in production without charging a second model/API inference for lessons already generalized in the owner's ChatGPT conversation.

## Owner authority and scope

Owner source text SHA-256: `4b221a613a9ad3661dc6e6b329b02ae177a529c184192c84f23ee86952a6ce3e`.

The source message explicitly authorizes finishing the current AskRigor production work and clarifies the product billing boundary: paid API inference may later be appropriate for paid users of the owner's app, but the owner's ChatGPT-account path should not make an additional paid model call merely to generalize the same lesson a second time.

The provider/source message identity must be bound by the authenticated Mission Control admission record; this plan does not invent or substitute a provider message identifier.

This release does **not** activate paid-app-user model inference, create a paid API budget, authorize held-out validation use, or broaden access to raw incident text. A future paid-user inference path is a separate product/billing task and remains dormant here.

## Architecture fixed by Chat

For the owner's ChatGPT / Custom GPT lesson path:

1. ChatGPT identifies the correction and produces the generalized lesson candidate in the active conversation under the existing consent contract.
2. The private incident Action preserves the exact correction/conversation evidence in the encrypted owner-private vault.
3. The lesson Action receives only the already-generalized lesson candidate plus opaque incident provenance.
4. The server validates the candidate against the exact lesson schema and applies the deterministic privacy screen before queueing it.
5. The server performs **no second OpenAI/model API call** for this owner ChatGPT path.

`apps/research-mcp/src/lessons/openai-anonymizer.ts` may remain in source as a dormant implementation option for a later explicitly authorized paid-app-user runtime. It must not be wired into the owner ChatGPT production path in this release.

The owner runtime should omit the complete legacy inference configuration triplet together when the production environment permits it:

- `OPENAI_API_KEY`
- `ASKRIGOR_AI_BUDGET_LEDGER`
- `ASKRIGOR_AI_MONTHLY_BUDGET_USD`

If any of those variables are shared with another production feature, do not delete a shared secret/configuration blindly. Isolate the lesson runtime so the owner lesson path cannot consume or invoke it, and return the exact dependency as a supervisor fact if isolation requires a semantic/product decision.

## Source implementation already prepared

The task branch contains:

- `apps/research-mcp/src/lessons/local-generalizer.ts`: no-network local validation/privacy adapter for an already-generalized ChatGPT lesson candidate;
- `apps/research-mcp/src/lessons/runtime.ts`: owner lesson runtime uses the local adapter instead of constructing the OpenAI Responses client; no legacy AI variables are required when all three are absent, while a partially present legacy triplet still fails closed during migration;
- `tests/lesson-local-generalizer.test.ts`: verifies construction without OpenAI/API-budget settings and validates a safe generalized candidate without a model call.

These edits are unverified until the exact branch head passes the repository gates below.

## Residual execution directive

Semantic authority: none beyond this plan. Work/Codex may make bounded tactical repairs needed to satisfy these fixed semantics. Any proposed architecture change, paid inference, destructive infrastructure change, privacy weakening, retention/key-lifecycle change, or scope expansion must return to Chat.

### Phase 1 — recover, inspect, and verify source

1. First run `npm run lessons:status` with the maintainer's local GitHub authentication. Report the actual queue state; unavailable is not zero.
2. Fetch/reconcile the exact task branch against live `main` without discarding newer owner work.
3. Inspect the three source/test changes above and the current lesson Action path end to end.
4. Run focused/affected tests first, including:
   - `tests/lesson-local-generalizer.test.ts`
   - lesson Action/runtime/service/privacy tests
   - private lesson-incident vault/action regressions.
5. Prove the owner path cannot call OpenAI/model inference when the legacy triplet is absent. Evidence must cover the actual runtime seam, not only the helper in isolation.
6. Repair ordinary compile/test defects if needed without changing the fixed architecture.
7. Run the repository's complete release gate on the exact candidate head, including `npm run verify` and required hosted repository-policy/security checks.
8. Perform the final diff/privacy/history review. No raw incident conversations, decrypted payloads, private recovery labels, secrets, keys, owner-local filesystem locators, or held-out MAST material may enter GitHub, CI artifacts, logs, or fixtures.

### Phase 2 — review and merge the zero-duplicate-API source change

1. Open/update a PR against current `main` with plain-language explanation that the owner ChatGPT lesson path reuses the ChatGPT-generated generalized candidate and performs deterministic server validation rather than a second paid model call.
2. Bind all acceptance evidence to one exact head.
3. Merge only after the exact-head source, privacy, and hosted gates are green and merge is still confirmed not to auto-deploy production.
4. Do not describe dormant paid-app-user code as active production behavior.

### Phase 3 — production vault configuration and deployment

Before deployment, run `npm run lessons:status` again as required by repository policy.

1. Preserve a non-secret receipt of the current production revision/package/registration and an explicit rollback target.
2. Use the current production host and existing infrastructure. Do not purchase or provision new infrastructure without a new owner decision.
3. Configure the reviewed private vault using the existing operations contract:
   - `ASKRIGOR_LESSON_INCIDENT_DIR`
   - `ASKRIGOR_LESSON_INCIDENT_KEY_ID`
   - `ASKRIGOR_LESSON_INCIDENT_KEY_BASE64URL`
4. Never print, commit, log, or return secret values. The vault key must be a secure 32-byte base64url key and the directory/mount must satisfy the reviewed ownership, mode, symlink, atomic-write, and fail-closed requirements.
5. Keep the incident vault separate from any usage-budget storage.
6. Remove/omit the complete legacy lesson-inference configuration triplet from the owner lesson runtime when safe, or isolate it from that runtime if another feature legitimately uses it.
7. Deploy the exact reviewed merged revision. Do not deploy an unreviewed working tree.
8. Verify the production process reports the same revision that was reviewed and merged.

### Phase 4 — production durability and direct acceptance

Use synthetic content only.

1. Capture a synthetic lesson incident through the production Action and verify authenticated read-back/digest integrity through the owner-maintenance path without exposing plaintext in public logs.
2. Prove durability across a real host reboot/provider remount/detach-reattach or the strongest production-equivalent remount event supported by the existing host. A mere process restart does not satisfy this boundary.
3. Verify fail-closed behavior if the vault mount/key is unavailable.
4. Exercise the complete correction path:
   - exact private incident capture succeeds;
   - ChatGPT-produced generalized candidate is accepted only after schema/privacy validation;
   - opaque incident provenance reaches the generalized lesson queue;
   - no raw conversation text reaches the public/generalized queue;
   - no outbound OpenAI/model API request occurs for this owner ChatGPT lesson flow.
5. Verify rollback remains usable after the durability drill.

If a safe reboot/remount drill cannot be performed on the current host without a destructive or unavailable-provider boundary, stop only that dependent acceptance step, preserve all completed deployment evidence, and return the precise blocker. Do not weaken the durability criterion to a process restart.

### Phase 5 — release/package synchronization

Complete the current AskRigor release contract on the deployed revision:

1. verify the exact 27-tool MCP catalog;
2. verify live HRP and Universal manifests;
3. perform one read-only connector probe;
4. verify the installed-package receipt covers `.codex-plugin/plugin.json`, every manifest-declared file under `skills/` including `skills/askrigor/SKILL.md`, and the complete packaged asset/inventory set;
5. if installed package bytes cannot be read back, reinstall the exact reviewed package after preserving a non-secret prior receipt and rollback path;
6. update/install the Custom GPT configuration only if the merged release changes the currently installed runtime/package contract, then perform fresh product-interface acceptance;
7. if the accepted-contribution promotion timer is active, bind it to the exact deployed reviewed image, run the hardened oneshot once, and verify the future timer trigger.

## Explicit prohibitions

- no paid model/API inference in the owner ChatGPT lesson path;
- no new infrastructure spend;
- no held-out MAST/validation consumption;
- no raw incident conversation or decrypted vault content in GitHub/logs/analytics/public receipts;
- no public raw-incident read surface;
- no secret/key disclosure;
- no destructive storage migration or key/retention lifecycle change without returning to Chat;
- no claim of deployment, durability, no-API behavior, package currency, or provider delivery without direct evidence.

## Work/Codex routing profile

Split execution when the surface supports separate tasks:

- source verification/localized repair and command-driven server deployment: **GPT-5.6 Sol Medium**; this is the lowest expected-sufficient tier because semantics are fixed but multi-file verification and production process state require bounded tactical judgment;
- any phase that materially requires Custom GPT browser/editor GUI work or visually dependent multi-app state: **GPT-6 Astra Low**, triggered by computer/GUI execution.

If one unavoidable task must span source verification, SSH/process state, reboot/remount recovery, and browser/editor acceptance, use **GPT-6 Astra Low** because the long dependent execution plus GUI/process-state recovery meets the Astra trigger. Work must still perform the required model/effort preflight before substantive execution and report an observable mismatch rather than silently over- or under-spending allowance.

## Required return packet

Return facts, not a new strategy:

- exact source head reviewed and merge revision;
- `lessons:status` result at start and pre-deploy;
- focused/full/hosted verification results;
- proof that the owner lesson runtime works with no legacy AI triplet and emits no model/API request;
- production revision before/after and rollback target, without secrets/private host locators;
- vault configuration names and permission/durability results, never values;
- synthetic capture/read/remount result;
- full correction-to-queue acceptance result;
- 27-tool/manifests/connector/package synchronization result;
- any exact blocker that requires a new owner/Chat decision.

Do not ask the owner to relay this packet manually. Use the registered supervisor/control-plane return route when available; if the execution surface cannot reach it, publish the smallest public-safe durable receipt permitted by current repository policy and accurately label transport state.