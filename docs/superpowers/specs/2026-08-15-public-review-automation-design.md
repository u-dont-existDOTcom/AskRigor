# AskRigor Public Review Automation Design

**Status:** Owner-approved architecture; implemented and under pull-request
review

**Date:** 2026-08-15

**Repository scope:** Developer-only review tooling. This design does not change
the public MCP server, canonical protocols, provider behavior, health-research
policy, or production deployment.

## 1. Purpose

AskRigor has nine committed public review cases: six positive cases and three
negative cases. Manual testing in the ChatGPT product has confirmed that the
public server can return correct data, but the visible tool card has twice named
a different operation than the returned envelope. A screenshot or copied answer
therefore cannot reliably prove the exact tool name, arguments, call order, and
raw result that ChatGPT received.

The selected design automates the evidence that software can verify and leaves
one final ChatGPT product-interface spot check for the behavior that only the
product interface can establish. One explicit command will:

1. call the production MCP endpoint directly and validate every deterministic
   server contract;
2. ask an OpenAI model to execute every review prompt through the same remote MCP
   endpoint and validate the Responses API's raw `mcp_call` records; and
3. create a bounded, sanitized, machine-readable report plus a readable summary.

This replaces repetitive copy-and-paste testing. It does not claim that a model
API run is identical to the ChatGPT product interface.

## 2. Goals

- Run all nine cases in `docs/public-review-cases-v0.1.0.json`, or an explicitly
  selected subset, from one command.
- Distinguish a server-contract failure from a model tool-selection failure and
  from a ChatGPT-interface-only observation.
- Prove exact tool names, arguments, ordering, result fields, negative behavior,
  and absence of unexpected tool calls from raw API records.
- Preserve dynamic continuation semantics for the multi-call YouTube audit.
- Use only public test inputs and read-only AskRigor tools.
- Keep the OpenAI API key server-only and absent from arguments, logs, reports,
  repository files, process listings, and command history.
- Bound live cost, time, output, and concurrency.
- Write a useful partial report when a provider or model call fails, then return
  a nonzero exit code.
- Leave ordinary pull-request continuous integration hermetic and credential
  free.

## 3. Non-goals

- Automating a browser login or scraping the ChatGPT interface.
- Claiming that `chat-latest` reproduces every ChatGPT routing or display choice.
- Replacing the final human product-interface spot check.
- Making provider, GitHub, protocol, lesson, or deployment writes.
- Performing clinical interpretation or validating a source's clinical claims.
- Persisting full protocol text, YouTube comment bodies, commenter identities,
  continuation tokens, or unrestricted model output as review evidence.
- Scheduling recurring paid runs in the first version.
- Reusing or changing the lesson anonymizer's fixed model, privacy contract, or
  monthly budget.

## 4. Alternatives considered

### 4.1 Hybrid MCP and Responses API runner — selected

The runner uses two independent lanes. Direct MCP calls establish server
behavior. OpenAI Responses API calls establish model tool selection from raw
`mcp_call` records. Together they locate failures precisely and produce stronger
evidence than copied product text.

### 4.2 Cloud-browser ChatGPT automation — rejected

Browser automation would depend on session cookies, changing interface markup,
tool-card rendering, anti-automation controls, and product timing. It would also
reproduce the existing ambiguity: a rendered card can disagree with the
returned envelope. Browser automation may be reconsidered only if OpenAI offers
a supported product-test interface that exposes authoritative call receipts.

### 4.3 Direct MCP calls only — rejected

Direct calls prove the server but not whether a model selects the advertised
tool, supplies the right arguments, respects the required sequence, or declines
unsupported actions.

### 4.4 Fully manual review — rejected

Manual review remains useful for the final interface check, but repeating nine
cases by hand is slow, error-prone, and produces evidence that is difficult to
compare across releases.

## 5. Source of truth and execution modes

The committed case file is authoritative for prompts, fixtures, expected
workflows, required fields, and negative-case semantics. The runner validates
its versioned structure and records its SHA-256 before making live calls. It
must not silently repair, infer, or broaden a malformed case. The live command
has no case-file override: it can select only exact IDs from this committed
file. Before any network connection, it compares the working bytes with that
path at the reported commit and fails closed on a mismatch.

The command supports three explicit modes:

- `direct`: deterministic production MCP validation only;
- `model`: Responses API orchestration only; and
- `all`: direct followed by model, the default for an approved release review.

It also supports exact case IDs so a failed case can be repeated without paying
for unrelated successful cases. A normal full run is serial to respect public
rate limits and make call order auditable.

Defaults are:

- MCP endpoint: `https://mcp.askrigor.com/mcp`;
- model: `chat-latest`;
- case file: `docs/public-review-cases-v0.1.0.json`; and
- Responses storage: `store: false`.

The selected model is the closest documented API model for ChatGPT's current
Instant behavior and supports MCP tools. It is a behavioral proxy, not proof of
the ChatGPT product interface. The report records the requested model alias and
the exact returned model identity when supplied by the API.

## 6. Components

The implementation will add:

1. `scripts/public-review-eval-lib.mts`, containing case parsing, field-path
   checking, expected-call construction, response normalization, redaction,
   artifact scanning, and report generation;
2. `scripts/run-public-review-eval.mts`, the thin command-line entry point;
3. `tests/public-review-eval.test.ts`, the hermetic regression suite; and
4. the package script `review:public-live`, which invokes the runner with no
   hidden live defaults.

The runner will use the repository's existing Node and TypeScript toolchain,
native `fetch`, and the already installed MCP SDK where it is appropriate. It
will not add an OpenAI client dependency merely to send one bounded Responses
API request.

No repository script will contain the VPS address, a root path, a private-key
path, or a credential. A deployment-side invocation may inject
`OPENAI_API_KEY` from an existing root-readable file into an ephemeral process,
but that wrapper is an operator concern and must not print or copy the value.

## 7. Direct MCP lane

The direct lane initializes one public MCP client, records the advertised tool
inventory, and fails closed unless every advertised tool declares read-only,
non-destructive behavior. It then executes the exact workflow in each case.

For positive cases it verifies:

- exact operation and arguments;
- exact order for multi-call workflows;
- every declared structured field, including array paths such as
  `candidates[].canonical_url`;
- required protocol identity and integrity values;
- explicit provider access, pagination, and limitation states; and
- case-specific values needed to distinguish a related result from the required
  result.

The third call in `positive-6` uses the exact continuation token returned by the
second call and is made only when continuation is recommended. The raw token is
held in memory only. Evidence stores a digest, byte length, and equality result,
not the token.

Negative cases are tested as contracts:

- `negative-1` must fail MCP input-schema validation before a provider envelope
  is returned;
- `negative-2` must retain the explicit YouTube `inaccessible` visibility
  boundary with `youtube_video_not_visible`, an empty data object, and no
  fallback; and
- `negative-3` must confirm that the three requested write or recommendation
  operations are absent from the advertised inventory and make no tool call.

Provider unavailability, partial access, rate limiting, an unexpected envelope,
or missing continuation evidence remains a failure or blocked result. It is
never rewritten as complete evidence.

## 8. Responses API model lane

Each review case starts a fresh Responses API request so no conversation state
can hide a missing call. The request uses:

- the case prompt unchanged;
- one remote MCP server definition with an exact label and endpoint;
- `require_approval: "never"` only after the direct lane verifies that the
  advertised inventory is read-only and non-destructive;
- a case-specific `allowed_tools` list;
- `store: false`;
- an explicit maximum output size; and
- top-level `max_tool_calls` equal to the case's approved workflow length; and
- bounded request and case timeouts.

Positive cases expose only the operations declared by that case. The parser
validates raw `mcp_call` output items: server label, operation name, decoded
arguments, order, output, and error. Human-facing answer text can supplement the
evidence but cannot substitute for a required raw call record.

`positive-1` must contain the exact three-call protocol sequence.
`positive-6` must contain survey and first audit in order. It contains the
authenticated continuation call only when the first audit recommends one, and
that call must reuse the first audit's token exactly. The report records only
safe projections and token digests. If the Responses API exposes only opaque
output for the first audit, the runner records selection evidence but leaves
the model result blocked because neither the continuation decision nor token
equality is verifiable.

Negative cases intentionally test model restraint:

- `negative-1` exposes `fetch_pubmed_record`; the result passes only when the
  invalid input does not reach an upstream provider. An exact MCP input error,
  paired with the direct schema proof, is one passing model outcome. No MCP call
  is also a passing model-restraint
  outcome when, and only when, the direct lane has independently proved the
  schema rejection. Neither outcome alone is reported as proof of the other.
- `negative-2` exposes `get_youtube_video` and requires the explicit
  `inaccessible`/`youtube_video_not_visible` envelope. An empty successful
  `videos.list` result does not prove whether a video is deleted, private,
  restricted, or otherwise unavailable. A generic or opaque MCP error is
  selection evidence only and leaves the model result blocked.
- `negative-3` exposes the complete verified read-only AskRigor inventory, not an
  empty list. It passes only when no MCP tool is called and no write or medical
  recommendation is represented as completed.

Any operation outside the allowed set, unknown server label, malformed
arguments, missing required call, or unexpected extra call fails the case. The
runner will not weaken a case merely because the final natural-language answer
sounds correct.

When a response mixes opaque and structured MCP outputs, direct proof may cover
only the specific opaque call. Every structured result is still checked for its
own identity, access state, continuation decision, and terminal receipt. A
wrong structured result cannot be replaced by an unrelated direct-lane pass.

## 9. Credentials and execution boundary

The runner accepts the OpenAI credential only through the `OPENAI_API_KEY`
environment variable. It rejects any credential command-line option. It never
prints the environment value and never includes request authorization headers
in error objects.

The approved production execution path will read the existing root-only key on
the VPS into the environment of a single bounded process without exposing it to
the local workstation or storing it in an artifact. The command will be
constructed so the key is not present in a process argument. A preflight checks
only whether the variable exists and is nonempty.

All prompts and provider identifiers in these cases are public. The runner must
still reject an unapproved case file, an endpoint outside the configured HTTPS
origin, or any advertised mutable tool. It never calls the lesson-submission
Action or any GitHub integration.

## 10. Bounds, cost, and interruption behavior

The runner has independent bounds for:

- MCP connection and initialization time;
- per-request timeout;
- per-case elapsed time;
- full-run elapsed time;
- maximum Responses output tokens;
- maximum captured error length;
- maximum persisted safe-field length; and
- total report size.

Version 1 permits at most the nine approved cases, three workflow steps per
case, and a 1 MiB sanitized JSON report. Per-case and full-run deadlines race
the active operation rather than being checked only between cases; production
MCP requests also retain their smaller transport deadline and are aborted when
the case deadline expires.

MCP initialization has the same 45-second request bound, and its elapsed time is
deducted from the 30-minute full-run budget. The selected compound YouTube
target passes only when the survey itself is `complete`, the selected candidate
has complete metadata, and its provider-reported comment count is present.
Partial survey success is not borrowed from a later per-video audit.

It runs cases serially and records token usage when OpenAI supplies it. A live
run is opt-in and paid; it is not part of ordinary `npm run verify`, pull-request
CI, or a scheduled workflow. The live review budget is reported independently
and cannot consume or alter the lesson anonymizer's mechanically enforced
monthly budget.

The report is updated atomically after every completed case. Interruption,
timeout, HTTP 429, quota exhaustion, provider failure, or malformed output
therefore leaves a valid partial report with the exact unfinished cases. Reruns
can target only those case IDs.

## 11. Evidence artifact and redaction

Every run creates `.artifacts/public-review-eval/<UTC-run-id>/`, under an ignored
local artifact root, and prints the exact report and summary paths. It contains:

- a canonical sanitized JSON report;
- a short Markdown summary derived from that JSON; and
- a SHA-256 manifest covering both files.

The report records:

- repository commit and dirty-state flag;
- case-file path, version when present, and SHA-256;
- MCP endpoint origin;
- requested and returned model identity;
- start/end timestamps, durations, and token usage;
- advertised tool names and read-only annotation result;
- an explicit run-level MCP discovery or timeout failure class when inventory
  acquisition cannot complete;
- per-case lane, status, exact safe arguments, call order, validation checks,
  bounded errors, and explicit failure class; and
- a manual ChatGPT-interface status of `pending`, `pass`, `fail`, or
  `not_applicable`, kept separate from automated results.

The artifact must not contain:

- the OpenAI API key or authorization header;
- complete protocol text;
- YouTube comment text, display names, channel identifiers, or commenter
  metadata;
- raw continuation tokens;
- unrestricted provider response bodies; or
- unrestricted model answer text.

For intentionally omitted values, the report may store field presence, type,
count, byte length, SHA-256, and the minimum public values required by the case.
An artifact scanner runs before success and rejects known credential patterns,
the current secret value, authorization headers, protocol XML markers, raw
continuation tokens, and unexpected large strings. The manifest is produced
only after that scan passes.

## 12. Test-driven implementation

Behavioral work begins with failing tests. The hermetic suite will cover:

- case-file parsing and rejection of missing or unknown workflow shapes;
- exact tool order and deep argument equality;
- dotted field paths and array field paths;
- dynamic continuation substitution and equality checking;
- separation of direct, model, and interface statuses;
- direct MCP result normalization;
- raw Responses `mcp_call` normalization, including string-encoded arguments
  and structured output variants actually observed in fixtures;
- positive, schema-rejection, not-found, and no-tool-call cases;
- unexpected, missing, duplicate, and extra calls;
- read-only inventory enforcement;
- time, token, and report-size bounds;
- partial-report generation on timeout, quota, or provider failure;
- redaction and artifact secret scanning; and
- nonzero command exit when any required automated check fails.

Tests mock MCP and Responses API traffic. They never need credentials, public
network access, or provider data. The final candidate must pass the repository's
canonical deterministic verification command before a live run is accepted.

## 13. Failure classification

Each case ends in exactly one automated state: `pass`, `fail`, or `blocked`.
Failures also carry one of these bounded classes:

- `case_contract`;
- `mcp_discovery`;
- `mcp_schema`;
- `provider_result`;
- `model_transport`;
- `model_tool_selection`;
- `model_output`;
- `quota_or_rate_limit`;
- `timeout`;
- `artifact_safety`; or
- `unexpected_internal_error`.

A direct-lane failure blocks the corresponding model lane when continuing would
make the result unsafe or uninterpretable. An OpenAI quota error does not erase
a passing direct result. A ChatGPT card/display mismatch is recorded as an
interface failure and does not rewrite raw API or server evidence.

## 14. Completion and durable release evidence

Automation is successful only when:

- the direct lane passes all nine committed cases;
- the model lane passes all nine committed cases;
- no unexpected operation or mutable capability is discovered;
- the sanitized artifact scan and manifest verification pass;
- exact commit, endpoint, case-file hash, model identity, and timings are
  recorded; and
- the final manual ChatGPT-interface spot check is clearly identified rather
  than implied.

After a successful live run, only a reviewed bounded summary and artifact hashes
may be promoted into durable release evidence. Raw local reports remain ignored
unless their precise content is reviewed and intentionally added. README,
documentation indexes, the public-review checklist, release evidence, and the
current-state checkpoint are updated only after the runner and live evidence
exist; they must not promise automation before it works.

The final interface check uses one fresh ChatGPT conversation and verifies that
the AskRigor connection is selectable, a representative prompt completes, the
visible receipt is intelligible, and no confirmation appears for read-only
calls. It is product acceptance, not a substitute for the nine raw automated
receipts.

## 15. Lesson closeout

The project-specific finding is that AskRigor's public review needs separate
server, model-selection, and product-interface evidence because rendered tool
cards can disagree with returned envelopes. A transferable lesson may be
promoted to `universal-dev-architecture` only after the runner demonstrates it:
for tool-using products, validate raw machine call records and deterministic
server contracts separately from interface acceptance, while stating the limit
that an API model is not necessarily the hosted product model.

## 16. Primary documentation basis

Reviewed on 2026-08-15:

- OpenAI Responses create reference (`max_tool_calls` is a top-level total
  built-in-tool-call bound across the response):
  <https://developers.openai.com/api/reference/resources/responses/methods/create>
- OpenAI remote MCP and connectors guide:
  <https://developers.openai.com/api/docs/guides/tools-connectors-mcp>
- OpenAI `chat-latest` model reference:
  <https://developers.openai.com/api/docs/models/chat-latest>
- OpenAI ChatGPT plugin testing guidance:
  <https://developers.openai.com/plugins/deploy/connect-chatgpt>

These links support the available API mechanism and its raw `mcp_call` evidence.
They do not establish equivalence between the Responses API and ChatGPT product
rendering.
