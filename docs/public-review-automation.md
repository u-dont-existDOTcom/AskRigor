# AskRigor public review automation

This developer-only runner validates the nine committed public review cases in
two separate automated lanes:

1. **Direct MCP:** calls the production Model Context Protocol (MCP) endpoint and
   checks the exact tool, arguments, ordering, structured fields, failure
   boundaries, and read-only inventory.
2. **Model selection:** sends each literal prompt to the OpenAI Responses API
   with the same remote MCP endpoint and checks the raw `mcp_call` records.

The second lane defaults to `chat-latest`, the documented API model closest to
ChatGPT's current Instant behavior. It does not prove that the ChatGPT product
interface will use or display a tool identically. One fresh-chat interface spot
check remains a separate final acceptance step.

## Protected normal run

The normal entry point is:

```sh
npm run review:public-live -- --live
```

This is an explicit paid live run. Before starting it, the operator must load
`OPENAI_API_KEY` through the protected server mechanism. Never paste the key
into the command, shell history, a command-line option, a repository file, or a
report. The AskRigor VPS invocation mounts its root-only key into an ephemeral
container, reads it inside that container without printing it, and immediately
executes the command. The runner deliberately has no API-key command-line
option.

Useful bounded reruns are:

```sh
npm run review:public-live -- --live --mode direct
npm run review:public-live -- --live --case positive-6
npm run review:public-live -- --live --mode model --case negative-3
```

`direct`, `model`, and `all` are the only modes. Cases run serially in the
committed order. Model or all mode requires the protected OpenAI environment;
direct mode does not. The live runner always reads the committed
`docs/public-review-cases-v0.1.0.json`; there is deliberately no case-file or
endpoint override. Before connecting, the runner compares those bytes with the
same path at the reported commit and rejects a dirty or substituted copy. A
rerun may narrow that approved set only by exact case ID.

## Bounds and failure behavior

- production endpoint fixed to `https://mcp.askrigor.com/mcp`;
- one fresh Responses request per case;
- `store: false` for every Responses request;
- only the case's expected tools are exposed, except the unsupported-action
  case, which intentionally exposes the complete verified read-only inventory;
- 4,096 maximum model output tokens;
- top-level Responses `max_tool_calls` equal to the selected case's one-to-three
  approved workflow steps;
- 45-second request deadline;
- 180-second case budget and 30-minute full-run budget;
- at most nine cases and three workflow calls per case;
- 1 MiB maximum sanitized JSON report;
- serial execution with no scheduled or recurring paid run; and
- nonzero exit when any required automated lane fails or remains blocked.

Direct-case expiry aborts the active MCP request as well as returning a timeout
result. MCP initialization is also aborted at 45 seconds and its elapsed time is
deducted from the 30-minute full-run budget. The MCP transport retains its
smaller request timeout as a second bound.

Provider unavailability, partial access, rate limiting, quota exhaustion,
timeouts, and malformed results remain explicit. The runner writes a valid
partial report after completed work; it never turns an unavailable result into
a pass.

Opaque model receipts can still prove that a model selected a named tool with
bounded arguments, but they cannot prove conditional continuation or a specific
negative result. The model lane therefore remains `BLOCKED` when the Responses
API does not expose the first YouTube audit's continuation fields or returns
only a generic MCP error. A canonical input-validation or
`youtube_video_not_visible` error code may pass only with the corresponding
direct-lane proof. This preserves useful selection evidence without calling an
unverifiable result complete.

Positive provider cases also require their case-specific success state:
PubMed and ClinicalTrials.gov must be `api_visible_complete`, Crossref must be
the expected `metadata_only` record, and the YouTube comments case must be
`api_visible_complete` with at least one API-visible record. Partial,
rate-limited, inaccessible, error, or empty positive results do not pass.
The compound YouTube case additionally requires a `complete` survey, complete
metadata for the selected target, and that target's provider-reported comment
count before either direct or model evidence can pass.

Run-level MCP discovery or timeout failures are recorded explicitly in the
sanitized report instead of being collapsed into an unexplained global failure.

## Evidence bundle

Each invocation creates:

```text
.artifacts/public-review-eval/<UTC-run-id>/report.json
.artifacts/public-review-eval/<UTC-run-id>/SUMMARY.md
.artifacts/public-review-eval/<UTC-run-id>/SHA256SUMS
```

The command prints the three exact absolute paths. Files and their directory are
private to the executing user. `SHA256SUMS` covers the JSON report and Markdown
summary.

The report records the exact commit, case-file SHA-256, endpoint origin,
requested and returned model identities, safe tool names/arguments, required
field presence, lane status, durations, token usage, and fixed failure class. It
does not store:

- API keys or authorization data;
- complete protocol text;
- YouTube comment text or commenter/channel identities;
- raw continuation tokens;
- unrestricted provider response bodies; or
- unrestricted model answer text.

Omitted sensitive values are represented only by presence/type/count or, where
needed, byte length and SHA-256. A final safety scan runs before the manifest is
written and rejects credentials, protocol XML, raw continuation-token fields,
credential-like object keys, unexpectedly large strings, and an oversized
report.

## Interpreting completion

An automated pass establishes the deterministic production MCP contract and the
selected API model's raw tool-call behavior for this run. It does not establish
clinical validity, provider completeness beyond the returned access state, or
ChatGPT interface equivalence.

The remaining product check uses one fresh ChatGPT conversation. Confirm that
the AskRigor connection is selectable, one representative read-only prompt
completes, its visible receipt is understandable, and no write confirmation is
shown. Record that interface result separately; do not overwrite the automated
server or model evidence.

Sources of truth:

- cases: `docs/public-review-cases-v0.1.0.json`;
- design: `docs/superpowers/specs/2026-08-15-public-review-automation-design.md`;
- implementation plan:
  `docs/superpowers/plans/2026-08-15-public-review-automation-implementation.md`;
- release gate: `docs/public-review-checklist.md`.
