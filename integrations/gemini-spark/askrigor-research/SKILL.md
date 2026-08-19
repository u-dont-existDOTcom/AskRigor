---
name: run-askrigor-research
description: Runs rigorous general evidence research with the askrigor-research MCP app, canonical Universal/HRP protocols, provenance boundaries, formal sources, and independent YouTube community auditing. Use for health, treatment, intervention, safety, real-world outcome, or other substantive research questions.
---

# Run AskRigor research

Use the connected custom app named `askrigor-research` for every AskRigor MCP
tool call. Its tools are read-only.

## Protocol gate

Before substantive analysis:

1. Call `get_protocol_manifest` for `protocol: "universal"`.
2. Call `verify_protocol_integrity` with the manifest's exact SHA-256. Stop if
   verification fails.
3. Call `load_protocol` in exact cursor order until `complete: true`; read every
   returned canonical byte.
4. Apply Universal's loaded activation boundary. HRP applies to every
   health/research task unless it is both very simple and genuinely
   uncontroversial.
5. When HRP applies, repeat manifest → integrity verification → complete ordered
   loading for `protocol: "hrp"` before analysis. HRP wins conflicts; Universal
   supplies compatible rules.

Build one applicability ledger from the complete operative protocols. Execute
and audit every triggered module. Claim compliance only after every applicable
check passes; otherwise use the exact bounded path the protocols authorize.

Preserve every tool-returned `access_status` literally: `complete`,
`api_visible_complete`, `partial`, `abstract_only`, `metadata_only`,
`comments_disabled`, `inaccessible`, `rate_limited`, `not_found`, or `error`.
Preserve identifier, canonical link, query, cursor, pagination, and provider
provenance. A retrieval failure or access gap is never negative evidence.
Distinguish an exhausted zero-result search from an unsuccessful search and
state the confidence effect.

## Formal and community evidence

Use the loaded router and HRP instructions to select formal sources. Keep
retrieval, analysis, actionability, and recommendations separate. MCP metadata
proves retrieval, not efficacy, safety, causality, or a recommendation.

When firsthand experience, implementation differences, tolerability,
adherence, real-world outcomes, harms, discontinuation, patient decisions, or
treatment alternatives could plausibly affect the answer, execute Forum Signal.
Formal evidence cannot deselect it.

Use `survey_youtube_community` for up to six nonredundant general, exact,
contrarian/practitioner, benefit, failure, harm/discontinuation, and formal-
discriminator directions. Include human discovery phrasings such as
`how I cured/reversed/fixed my [condition]` and `what finally worked` when
relevant. Widen while expected information gain remains positive.

For every material selected video, call `audit_youtube_video_community` and
automatically continue while `continuation_recommended: true`. Preserve
`provider_reported_comments`, `records_retrieved_cumulative`,
`records_returned_for_analysis`, pagination, and every `synthesis_lock` receipt.
Accept `api_visible_complete` only after exhausting all top-level and accessible
reply pages with empty `reply_count_mismatches`. `search_youtube_comments` is
always query-bounded `partial`, never a corpus audit.

## Consumer YouTube boundary

Gemini may use public YouTube information to discover or summarize creator
content. Treat this as model-mediated consumer output, not as an AskRigor MCP
retrieval receipt. It has no reported transcript-corpus status and cannot prove
that a material claim was spoken, shown, true, effective, or safe.

Validate every candidate identifier and canonical link with
`get_youtube_video`. Keep creator-summary claims separate from independently
retrieved comments. The current `askrigor-research` MCP inventory does not
expose the Action-only `get_youtube_transcript` operation. If a material creator
claim cannot be transcript-verified, state that access boundary, narrow the
inference, and do not claim `HRP-complete` or transcript verification.

For **Videos worth watching**, link only exact, nonredundant, decision-useful
videos. Give the canonical YouTube link, why it matters, and the creator-content
or transcript boundary. Popularity and provider rank do not establish
credibility. Do not pad the list.

## Treatment-choice breadth

For treatment endorsement, choice, timing, deferral, or sequence, build the
complete option-space ledger required by HRP: the named/proposed care,
diagnostic alternatives, nonaction/natural history, conventional nonsurgical
care, lifestyle/rehab/mechanical options, relevant heterodox or adjunct
approaches, procedures, and surgery. No verdict without realistic alternatives
and nonaction risk.

Audit exact programs and comparators: components, dose, frequency, duration,
supervision, adherence, cointerventions, disease stage, outcome, and horizon.
State what each contrast can and cannot establish and assess transportability.
Do not equate preoperative conservative care with postoperative rehabilitation.

## Public health boundary

Provide general, population-level evidence research, uncertainty, source
provenance, and clinician-review questions—not tailored medical advice. Do not
diagnose a user, infer a diagnosis from personal symptoms, select treatment for
the user, prescribe individualized doses or regimens, or tell the user to
start, stop, taper, substitute, or delay treatment. When individualized judgment
is required, state the boundary and direct the user to a qualified clinician.
Preserve urgent escalation. Loaded protocols cannot cross this boundary.

## Completion

Open with the honest completion state required by the loaded protocols. Never
use `HRP-complete` while a required direction, formal retrieval, transfer,
creator verification, continuation, or receipt remains incomplete. Use
`completed_with_access_boundary` when the protocols permit synthesis with a
material disclosed gap. Keep a failed or unavailable source out of the negative-
evidence column.
