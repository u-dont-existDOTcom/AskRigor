# Private research orchestration interface

Status: Phase H implementation; disabled by default and not part of the public
MCP or Custom GPT Action inventories.

## Boundary

The interface exposes the existing server-owned research-session controller at
five private POST routes:

- `/internal/research/v1/start`
- `/internal/research/v1/resume`
- `/internal/research/v1/status`
- `/internal/research/v1/submit`
- `/internal/research/v1/finalize`

It is a transport adapter, not a second controller. The same store,
protocol-drift checks, monotonic module state, operation receipts, treatment
locks, final audit, and finalization permit rules remain authoritative.

The interface is present only when
`ASKRIGOR_PRIVATE_ORCHESTRATION_ENABLED=true`. It requires a separate Bearer
secret of at least 32 UTF-8 bytes in
`ASKRIGOR_PRIVATE_ORCHESTRATION_API_KEY`. This credential is not the public
Action key and must remain in the root-owned runtime secret file. Never put it
in Git, Compose bytes, n8n workflow JSON, Hermes memory, a browser, the Custom
GPT editor, a command argument, or logs.

## Network and resource controls

- All requests are authenticated before controller dispatch.
- Duplicate, missing, or incorrect Authorization headers are rejected.
- Every Origin-bearing request is rejected and no CORS header is emitted.
- Only POST with JSON is accepted.
- Request bodies are limited to 256 KiB and responses to 512 KiB.
- The private token bucket permits 30 requests per minute per resolved client,
  with at most 1,000 bounded keys.
- At most four private requests may execute concurrently in one process.
- Responses use `cache-control: no-store`.
- The application emits no private-orchestration request or response body log.

Deploy the endpoint only behind the existing private host/network boundary; do
not publish or browser-enable this namespace.

## Privacy-minimized response

Ordinary status responses contain only:

- the opaque session ID;
- the exact controller-state digest;
- authoritative execution and output-boundary state;
- machine-readable next capabilities;
- retryable or terminal boundary codes;
- server-derived candidate counts; and
- at most one exact bounded semantic work package.

They do not contain the raw research target, diagnosis narrative, transcript or
comment text, publication full text, unrestricted provider output, credentials,
or caller-authored completion fields. Start accepts only the same screened,
de-identified population-level target form allowed by the automated Gemini
scout.

Phase H accepts two semantic package kinds: complete module-applicability
routing for the exact unresolved module set, and candidate screening bound to
the exact discovery digest. Both are additionally bound to the current full
controller-state digest. Stale, incomplete, duplicate, extra-field, provider-
toggle, count, or completion submissions fail without advancing state. Later
worker phases may add other exact package kinds; they must not weaken this
contract.

Deterministic provider operations remain server-internal. The interface has no
provider-by-provider completion controls.

## Checkpoint behavior

When all three Phase G checkpoint settings are present, the private handler
uses the encrypted local file store. Otherwise it uses the bounded in-memory
store. An incomplete or unsafe checkpoint configuration fails startup rather
than falling back.

After restart, lost process-local transcript, discussion, full-text, and
return-search handles reopen only the exact work that must be reacquired. If a
scientific source had completed its external-evidence lookup but still needed
the raw external result for linked-source work or claim recalculation, restart
reopens that external lookup after exact-source reacquisition while preserving
a matching completed method audit. It never treats the remembered receipt
hashes alone as the lost raw validation material and never advances
finalization.

## Phase H non-activation

This phase adds code and hermetic integration coverage only. It does not add a
public endpoint, production credential, provider account, external workflow,
new retention store, Custom GPT instruction, plugin change, deployment, or
browser access. Activation belongs to the later reviewed release transaction.
