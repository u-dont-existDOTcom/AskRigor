# AskRigor Custom GPT lesson Action setup

This runbook installs the optional lesson-submission Action after the reviewed
server build and the August 13, 2026 privacy notice are ready. GPT Actions can
import OpenAPI JSON or YAML and can use an API key sent as a Bearer token. A
public GPT Action also requires a valid public privacy-policy URL, and users may
still be asked to approve a consequential call.

The OpenAI API project and its billing are operationally separate from a
ChatGPT subscription: **API billing is separate from ChatGPT billing**. The
privacy-check API key stays only in the protected VPS runtime environment. The
dedicated Action Bearer key is installed only in the protected VPS environment
and the GPT editor's authentication control. Neither key belongs in GPT
instructions, the OpenAPI file, repository, image, issue queue, logs,
screenshots, or chat.

## 1. Prepare the private GitHub boundary

Create the private repository `u-dont-existDOTcom/AskRigor-lessons`; do not put
a link to it in any public surface. Create a dedicated GitHub App named
`AskRigor Lesson Submitter`, disable its webhook, restrict installation to only
that repository, and grant exactly:

- Metadata: Read-only
- Issues: Read and write
- Contents, pull requests, actions, administration, secrets, organization, and
  account permissions: No access

Generate one App private key and record the App ID and installation ID. Encode
the PEM locally for the single runtime value, then remove any unneeded local
copy. Do not paste a PEM or any credential into a command line, shell history,
chat, issue, test fixture, or tracked file. Before enabling the Action, verify
that an installation token reports selected-repository access to exactly the
private lesson repository and permissions of only `issues:write` and
`metadata:read`.

## 2. Prepare protected state and environment

Keep exactly one lesson-submission writer. Create a runtime-owned directory
with mode `0700`, mount it read/write only at `/var/lib/askrigor-actions`, and
keep the ledger file mode `0600`. Install values with a hidden-input editor,
secret manager, or an equivalent stdin-safe mechanism that does not expose
values in process arguments or output. Verify only names, ownership, mode, and
nonempty status; never print secret values.

The runtime requires these exact names and constraints:

| Environment variable | Required value or boundary |
| --- | --- |
| `ASKRIGOR_ACTIONS_ENABLED` | Exact literal `true` only when ready to accept Actions. |
| `ASKRIGOR_ACTIONS_API_KEY` | Dedicated high-entropy Action Bearer secret. |
| `OPENAI_API_KEY` | Dedicated OpenAI API project key for the privacy check; VPS only. |
| `ASKRIGOR_AI_BUDGET_LEDGER` | Absolute path `/var/lib/askrigor-actions/ai-budget.json`. |
| `ASKRIGOR_AI_MONTHLY_BUDGET_USD` | Exact literal `50.00`. |
| `ASKRIGOR_GITHUB_APP_ID` | Positive decimal App ID. |
| `ASKRIGOR_GITHUB_INSTALLATION_ID` | Positive decimal installation ID. |
| `ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64` | Base64-encoded dedicated App private key; VPS only. |
| `ASKRIGOR_LESSONS_REPOSITORY` | Exact private repository name `u-dont-existDOTcom/AskRigor-lessons`. |

The server enforces a hard monthly cap of **$50.00**, recorded as an aggregate
nano-USD ledger. It uses only the fixed privacy model
`gpt-5-nano-2025-08-07` with `store: false`. Budget exhaustion, ledger failure,
privacy-model failure, or invalid structured output fails closed; none bypasses
screening or reaches GitHub.

## 3. Configure the Custom GPT

1. Confirm `https://askrigor.com/privacy` serves the reviewed current notice.
2. In the Custom GPT editor, import
   `https://mcp.askrigor.com/actions/openapi.json`. The import is an OpenAPI
   JSON document; a YAML representation would also be accepted by GPT Actions.
3. Select **API Key**, choose **Bearer**, and store only the dedicated Action
   key in the editor's authentication control.
4. Set the privacy URL to `https://askrigor.com/privacy`. A public Action must
   have this valid privacy-policy URL.
5. Install the complete instruction set from `PROJECT_INSTRUCTIONS.md`,
   `FORUM_SIGNAL_MODULE.md`, and `LESSON_CAPTURE_MODULE.md`.
6. Confirm the lesson operation remains consequential. ChatGPT may ask the user
   to approve each call; do not weaken or bypass that safeguard.

The instructions must display this exact question before the first eligible
submission unless conversation-local standing consent already applies:

> Submit this anonymized lesson to improve AskRigor?

The reply choices are `Yes`, `Yes always in this chat`, or `No`. Existing chats
do not acquire new standing-consent behavior after an instruction update.
Start a new chat for acceptance testing, and never carry standing consent
between chats.

## 4. Synthetic acceptance and queue status

Use only synthetic, non-personal text. A suitable test correction is:

> You made a material factual claim without showing any source. After
> rechecking, do you agree that this is a valid AskRigor failure?

Require the exact consent question, answer `Yes`, and accept any separate
ChatGPT platform confirmation. A success must return an `ARL-####` receipt and
say that human review is required. Privately verify that the candidate contains
only the generalized fields, privacy marker, labels, anonymous occurrence
metadata, and no raw prompt. Repeat the same synthetic lesson and require the
same candidate ID with an incremented anonymous occurrence count. Mark the test
candidate as synthetic and do not treat it as a product lesson.

Run `npm run lessons:status` with the maintainer's local GitHub authentication.
Record either the available queue counts or the explicit unavailable reason;
unavailable never means zero.

## 5. Rollback

Set `ASKRIGOR_ACTIONS_ENABLED` to a value other than `true` and recreate only
the research service, or revoke the dedicated GitHub App installation to stop
new lesson writes. Verify that `/actions/*` is unavailable while `/healthz` and
the canonical `/mcp` endpoint remain healthy. **MCP remains available** because
the lesson Action is isolated and is not an MCP tool. Rolling back the lesson
Action does not delete existing private candidates or the aggregate budget
ledger; retention and deletion remain deliberate maintainer operations.

## 6. Key rotation

For Action-key rotation, create a new high-entropy value through the protected
secret workflow, update the VPS and the GPT editor without displaying it, test
the new key, then invalidate the old value. For OpenAI-key rotation, create a
replacement in the dedicated API project, install and test it on the VPS, then
revoke the old key. For GitHub App key rotation, generate and install a new App
private key, verify exact repository selection and permissions, then delete the
old App key. Never reuse one credential for another boundary, and never print a
credential while verifying rotation.
