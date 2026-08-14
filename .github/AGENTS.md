# `.github/` Agent Instructions

- Treat every workflow, release, ownership, or repository-policy change as a privileged security change.
- Declare explicit least-privilege `permissions`; begin with `contents: read` and add write scopes only to the smallest job that needs them.
- Pin remote actions and reusable workflows to reviewed full 40-character commit SHAs; retain release tags only as comments and update through reviewed dependency automation.
- Never check out or execute untrusted pull-request code in a privileged `pull_request_target` context.
- Separate untrusted validation from publishing/release jobs. Prefer protected environments and short-lived/OIDC credentials.
- Never place AskRigor credentials, private health data, tokens, canonical protocol secrets, or secret values in workflows, examples, logs, artifacts, prompts, or state files.
- Do not alter protocol authority, required evidence gates, public package/release semantics, or security checks through workflow cleanup.
- PR templates must request exact verification evidence, risk/rollback, final-diff review, protocol/current-state updates, and residual uncertainty.
- CODEOWNERS does not prove branch protection. Do not claim rulesets, secret scanning, push protection, code scanning, or Actions settings are enabled without GitHub settings/API evidence.
- Do not rename required checks without verifying and updating the ruleset atomically.
- Run all repository-declared tests/audits and applicable live validation before reporting changes complete.
