# Hermes worker pilot

Phase I uses Hermes for persistence of effort, never for research-policy or
completion authority. The AskRigor server chooses the next capability,
validates every semantic submission, advances the authoritative session, and
issues the only permit that can release a final response.

This pilot remains outside the public MCP and Custom GPT Action inventories and
is not deployed by default.

## Reviewed upstream

Use a clean checkout of the official
[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent)
repository at:

- release `v2026.8.19`;
- package version `0.20.5`;
- commit `fcbd1076a93841fa88855acce810e342a5b78101`.

Create its Python environment **outside** the checkout, following upstream's
installation instructions. Before every worker turn, the adapter resolves both
paths, enforces that separation, verifies the exact commit, and refuses a dirty
checkout.

## Isolation and authority

Each semantic package starts a fresh one-shot Hermes process with:

- no Hermes toolsets;
- no filesystem, shell, browser, MCP, repository, or AskRigor API tool;
- no Hermes memory, context-file loading, background review, trajectory saving,
  or checkpoints;
- a fresh temporary `HERMES_HOME` and working directory deleted after the turn;
- a bounded iteration count, output size, and runtime;
- only a small environment allowlist plus a dedicated model credential.

The research worker does not receive the private orchestration API key. It
cannot call `/resume`, `/submit`, or `/finalize`; the AskRigor-owned parent does
that. Production secrets such as YouTube, Crossref, PubMed, OpenAI, Gemini
scout, finalization-signing, and external-evidence receipt credentials are not
forwarded.

For a newly started session, Hermes receives the same de-identified research
target already accepted by the private AskRigor start boundary. The target is
transient: memory, trajectories, and checkpoints are disabled. Candidate work
contains public YouTube identities and provisional public-source annotations.
No raw comment corpus, transcript corpus, private medical record, or unrestricted
provider output is included in the current pilot envelope.

Development tasks use a separate read-only/no-tools context builder. It loads
the exact current `AGENTS.md`, project instructions, and complete canonical HRP
and Universal files with hashes. It grants no repository write capability,
does not use Hermes memory, and cannot write to `main` or alter protocol policy.

## Configuration

The parent process requires:

| Setting | Purpose |
| --- | --- |
| `ASKRIGOR_PRIVATE_ORCHESTRATION_URL` | Private AskRigor server base URL |
| `ASKRIGOR_PRIVATE_ORCHESTRATION_API_KEY` | Dedicated private server credential; parent only |
| `ASKRIGOR_HERMES_CHECKOUT` | Clean pinned official source checkout |
| `ASKRIGOR_HERMES_PYTHON` | Python executable from an environment outside that checkout |
| `ASKRIGOR_HERMES_PROVIDER` | Hermes model-provider identifier |
| `ASKRIGOR_HERMES_MODEL` | Exact model name |
| `ASKRIGOR_HERMES_MODEL_API_KEY` | Dedicated model credential passed only to the one-shot child |
| `ASKRIGOR_HERMES_BASE_URL` | Optional provider base URL |

For the Gemini pilot, use provider `gemini` and an available Gemini model. A
separate restricted Gemini API key is preferred because it makes revocation and
usage attribution independent from the automated Spark/YouTube scout. Reusing
the existing restricted Gemini project key is technically possible, but it
couples revocation and accounting. Neither choice gives Hermes access to the
server's `ASKRIGOR_GEMINI_API_KEY`; the configured child credential is supplied
explicitly by the operator.

Do not put credentials in command arguments, stdin, repository files, Hermes
memory, or workflow JSON. Supply them through the deployment secret mechanism.

## One-shot run

Start the private AskRigor server with its separate private orchestration
boundary enabled, then pipe one small JSON object to:

```sh
npm run pilot:hermes
```

New-session input:

```json
{
  "research_target": "de-identified treatment comparison",
  "diagnosis_status": "diagnosis_not_specified"
}
```

Resume input:

```json
{
  "existing_session_id": "ars1_<opaque-id>",
  "deidentified_research_context": "the same de-identified target, if module routing remains"
}
```

The command returns a machine result. `SERVER_AUTHORIZED` and `SERVER_BOUNDED`
are possible only when the server response includes a matching permit.
`SERVER_DENIED`, `WORKER_OUTPUT_REJECTED`, `NO_PROGRESS`, and
`TRANSITION_LIMIT_EXHAUSTED` are not success and cannot release report prose.

## Current pilot boundary

The current private server projects module-applicability and public-candidate
screening semantic packages. Later source-method and treatment-landscape
packages already exist in the controller but are not exposed to this external
worker yet. The runner therefore stops honestly if the private server has no
executable transition; it does not invent a completion claim or replace a
missing server capability with model JSON.

This is a Phase I pilot, not a production deployment. Live model validation is
separate from hermetic tests and requires an operator-supplied provider key.
