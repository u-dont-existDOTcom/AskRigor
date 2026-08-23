# Automated Gemini YouTube candidate scout for AskRigor

AskRigor uses Gemini as an optional high-recall discovery worker. The server
sends a de-identified population-level research target to the Gemini API,
enables Google Search, requires strict candidate JSON, and then independently
validates every returned YouTube identity. No person copies a packet between
Gemini and AskRigor.

Gemini does not execute HRP, audit comments, validate treatment claims, or
authorize synthesis. Its program, population/stage, outcome/horizon, and
creator-summary fields are provisional discovery annotations until AskRigor
retrieves and checks the selected caption track.

## Supported provider route

The integration uses Google's official Interactions API at
`https://generativelanguage.googleapis.com/v1beta/interactions`, the stable
fixed model `gemini-3.6-flash`, and the built-in `google_search` tool. Requests
set `store:false`, use a bounded output and low thinking level, and send the API
key only in the `x-goog-api-key` header.

Google Search grounding for this model requires a paid Gemini API project.
Consumer Gemini AI Pro/Ultra or a consumer Spark subscription is separate and
does not supply this API credential. Create the key in the approved Google AI
Studio/Google Cloud project, restrict it to the Gemini API where supported,
and install it only as the server secret `ASKRIGOR_GEMINI_API_KEY`. Never put
the key in the Custom GPT schema, Instructions, browser, request body, URL,
repository, logs, or candidate packet.

The model is fixed in source. There is deliberately no environment-controlled
model alias that can silently change quality or price.

## Cost boundary

Every request reserves at most $1.00 from the existing aggregate AskRigor AI
budget before Gemini is called. Successful calls commit a conservative amount
from reported input, output, thought, and Google Search-query usage at the
reviewed list prices. Missing or implausible usage commits the full reservation;
provider failures forfeit it conservatively. The shared application ledger
retains only UTC month, fixed monthly limit, aggregate charged nano-USD, update
time, and schema version—never target text, candidates, credentials, or raw
provider output.

The application budget remains fixed at $50.00 per UTC month. Configure a
matching Google-project budget alert and the narrowest available provider quota
as defense in depth; the API does not expose a request field that can guarantee
an upper bound on internally generated Google Search queries before execution.

## Public Action

The read-only Action operation is:

`scout_gemini_youtube_candidates`

Input contains only:

- `research_target`: a de-identified population-level research target; and
- `diagnosis_status`: `diagnosis_not_specified` or
  `user_supplied_diagnosis`.

The server rejects first-person narratives, direct identifiers, secret-like
text, raw chat framing, URLs, control characters, and prompt-injection-like
text before checking credentials, reserving budget, or contacting Gemini. A
client should rewrite a personal prompt into a generic research population; it
must not redact by guesswork or forward the original chat.

The operation then:

1. loads the checked-in candidate-scout instructions;
2. runs 8–18 materially different Google searches through Gemini;
3. requires every declared discovery query to reconcile with the API's actual
   `google_search_call` receipts;
4. parses the strict version-2 candidate packet without retaining raw invalid
   model output or Google search-result HTML;
5. independently fetches YouTube metadata for every candidate;
6. partitions every ID into validated, terminally rejected, or unresolved
   state and emits a SHA-256 frontier receipt; and
7. returns the executed queries, observed gaps, provisional annotations,
   mechanical seed eligibility, explicit limitations, and aggregate usage.

Only literal YouTube not-found/not-visible results or verified identity
mismatches terminally reject a candidate. Credential, configuration, budget,
access, rate-limit, malformed-response, runtime, and other non-identity
failures remain unresolved. The response distinguishes these provider
boundaries from a genuinely absent Action operation.

The earlier `validate_gemini_youtube_candidate_handoff` remains available for
backward-compatible technical validation of historical packets, but ordinary
AskRigor research must not ask the owner to run Gemini or transfer a packet.

## Candidate contract

The provider output remains `gemini_youtube_candidate_handoff` version `2.0`.
It contains 8–18 executed searches, 3–16 unique YouTube candidates, 1–8
suggested IDs, concrete search gaps, and fixed disclosures. Each candidate
records a specific program or `not described`, provisional population/stage,
provisional outcome/horizon, and a creator-attributed summary.

The current summary basis is:

`gemini_public_search_or_video_context_not_transcript_verified_by_askrigor`

Older version-2 packets using the former Spark-specific summary-basis value
remain parser-compatible. New automated responses must use the current value
because Google Search context must not be mislabeled as consumer Spark video
understanding.

The checked-in scout instructions are
`integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`. The
directory name remains for historical continuity; the server reads these
instructions directly, so installing that file in consumer Spark is not part
of the production workflow.

## Acceptance

Use the de-identified target:

`adults with unspecified hip pain comparing materially different treatment programs`

Acceptance requires:

1. the Action exists in the public OpenAPI document while MCP remains unchanged;
2. the target passes the outbound privacy screen and a first-person version is
   rejected before any provider call;
3. Gemini returns the current strict packet with 8–18 receipt-reconciled Google
   searches and no raw provider details;
4. every public YouTube identity is independently reconciled;
5. at least one useful candidate frontier reaches `accepted` or `partial`
   without invented identifiers;
6. the response stays within the public Action size boundary;
7. the installed Custom GPT invokes the automated Action and never asks for a
   manual packet; and
8. captions, discussions, formal evidence, method audits, treatment coverage,
   and finalization remain visibly downstream work rather than being inferred
   from Gemini's output.

## Privacy and removal

The request is stateless and is not retained as a Gemini Interaction object.
Google still processes the request under the configured API project's terms.
Use the paid tier so submitted content is not used to improve Google products,
and enforce de-identification before the request.

To disable the lane, remove `ASKRIGOR_GEMINI_API_KEY` from the protected server
environment and recreate only the research service. The Action remains present
and returns a precise provider-not-configured boundary; no AskRigor Action API
key, YouTube key, or Custom GPT bearer credential needs rotation.
