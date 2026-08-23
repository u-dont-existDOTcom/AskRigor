# Gemini Spark YouTube candidate scout for AskRigor

This is an owner-operated, optional high-recall lane. Spark finds and
provisionally summarizes treatment-specific public YouTube candidates;
AskRigor independently validates their identities and decides which sources
merit protocol-governed research. Spark does not execute HRP, audit comments,
validate treatment claims, or replace AskRigor.

## Prerequisites

Google currently requires Gemini Spark access, age 18+, a personal Google
Account, Keep Activity enabled, and presence in the United States for custom
apps. Spark requires Google AI Pro or Ultra. These external requirements were
rechecked on 2026-08-19. Gemini API billing does not change consumer Gemini or
Spark eligibility.

The candidate-only skill does not call the AskRigor custom app. An existing
connection to `https://mcp.askrigor.com/mcp/gemini` may remain installed, but it
is not required for this workflow. The public endpoint currently exposes 21
read-only tools; this change adds no deployed tool or credential.

## Install the replacement skill once

Attach
`integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md` to a
Spark conversation and say:

> Replace my existing AskRigor YouTube scout with this exact complete skill.
> Do not merge it with the old staged contract or rewrite it. Recheck an
> initial scanner warning once against the actual file before reporting the
> final result.

The installed skill name is `scout-youtube-candidates-for-askrigor`. Delete or
disable `scout-youtube-for-askrigor-staged` and any older AskRigor YouTube scout
copy so only the candidate-only replacement can trigger.

The exact repository file has SHA-256
`bde36dd81a862cc14696e3ea28ac7cff52acad498ada793b36a80d717fd51e08`.
The old `staged-remedy-scan-v16` contract remains retired: its forward test
found useful videos but failed its own counts, joins, classifications,
evidence-map, and metadata contracts. The current v2 skill restores its useful
high-recall and provisional video-understanding behavior without restoring
those unsupported pseudo-audit receipts.

## Run a scout task

Give Spark only the de-identified research question and select
`/scout-youtube-candidates-for-askrigor`. The response must be one raw JSON
object identified by `packet_name: gemini_youtube_candidate_handoff` and
`packet_version: 2.0`, with no diagnostic lines, Markdown fence, heading, or
trailing prose. It contains 8–18 executed discovery queries, 3–16 candidate IDs
with provisional creator-claim, specific-program, population/stage, and
outcome/horizon annotations, 1–8 suggested IDs, observed search gaps, and fixed
disclosures. It contains no AskRigor access status, provider statistics,
comment findings, evidence verdict, rabbit-hole map, or return-packet contract.

Copy or save the complete response unchanged. This is the only manual transfer
in the optional lane; there is no iterative owner-operated probe or correction
loop.

## Validate in AskRigor

The Custom GPT can call `validate_gemini_youtube_candidate_handoff` with the
complete packet. For local operator validation, with `YOUTUBE_API_KEY` already
present in the environment, run:

`npm run validate:gemini-handoff -- path/to/spark-response.md`

Use `-` instead of a path to read standard input. Do not place the API key in
the command or the packet. The command:

1. requires one strict raw JSON object, field bounds, closed enums, unique IDs
   and queries, canonical links, all five query purposes, the 32 KiB response
   ceiling, seed-subset rule, provisional summary basis, and disclosures; exact
   v1 packets remain accepted only for backward compatibility;
2. calls the existing AskRigor YouTube adapter for every candidate;
3. compares the declared ID, canonical URL, title, and channel with provider
   metadata;
4. preserves provider access states, retryability, statistics, errors, and
   limitations; only literal not-found/not-visible results or verified identity
   mismatches reject a lead, while every other validation failure remains
   unresolved regardless of immediate retryability;
5. marks a suggested seed mechanically eligible only when its identity is
   validated, its reported privacy state is public, its provider comment count
   is positive, and an earlier eligible suggestion does not use the same
   provider channel; and
6. emits `accepted`, `partial`, `rejected`, or `blocked` with exact
   machine-readable reasons and a SHA-256 frontier receipt partitioning every
   supplied ID into validated, terminally rejected, or unresolved state.

An `accepted` receipt validates structure, provider identity, and mechanical
comment-audit eligibility only. Spark's program, population/stage,
outcome/horizon, and creator summaries remain provisional and were not checked
against an AskRigor transcript. They may guide discovery and selection but not
support efficacy, safety, causality, comparison, or recommendation claims. A
positive comment count does not prove that comment retrieval will be accessible
or complete. AskRigor must still choose material
seeds, carry the complete frontier into coverage assessment, screen every
validated lead regardless of caller materiality or redundancy labels, retrieve
required corpora, preserve completion receipts, research formal
and other community sources, and obey the synthesis gate.

The validator is also available as
`validateGeminiYoutubeCandidateHandoff` from `@askrigor/sources` for an
authorized supervisor or agent that already has the complete response. The
read-only Custom GPT Action is intentionally absent from the frozen MCP catalog.

## Acceptance check

Use the de-identified prompt `how can I fix my bad hip`. Confirm that Spark:

1. emits one raw strict `gemini_youtube_candidate_handoff` v2.0 JSON object;
2. preserves `diagnosis_not_specified`;
3. records 8–18 unique executed searches spanning firsthand outcome, radical
   outcome, overlooked intervention, conventional benefit, and conventional
   negative purposes;
4. returns 3–16 unique surfaced videos and 1–8 suggested IDs drawn from them;
5. splits umbrella classes into specific implementations, records provisional
   population/stage and outcome/horizon, attributes every creator claim, and
   omits metadata status, counts, comment findings, efficacy, safety, causality,
   and treatment recommendations; and
6. passes the deterministic validator against independent YouTube metadata.

If Spark violates the JSON contract, keep the rejected receipt and exact issue
paths. Do not ask the owner to diagnose or patch the skill. Repair the repository
contract only if repeated independent runs expose the same decision-relevant
failure.

## Prior accepted v1 packet

The 2026-08-21 forward run for `how can i fix my bad hip` returned the former
raw JSON form. The strict packet schema accepted all 10 unique searches, all 7
unique candidates, and all 3 suggested seeds. Independent AskRigor metadata
receipts found every declared ID, canonical URL, exact title, and channel public
and `api_visible_complete`.

The suggested seeds `Hz3Gd51hBn0`, `LnlhK4MBaPw`, and `stZdnA9zeQE` were
mechanically eligible, with provider-reported comment counts 343, 545, and 32
respectively and three distinct provider channels. The result validates the
handoff structure, source identities, and mechanical audit eligibility only.
Gemini's labels, summaries, and seed usefulness remained provisional; no
comments, transcripts, treatment claims, or medical conclusions were
validated. That packet remains parser-compatible evidence history, not the
current v2 acceptance artifact.

## Evidence and privacy boundary

Use a de-identified research target. The packet contains public video
identifiers, titles, channel names, creator-attributed summaries, and search
queries. It must not contain private health records, user identity, credentials,
raw comments, or unrestricted provider output. Validation retrieves bounded
public video metadata only and does not retrieve transcripts or comments.

## Removal

Disable or delete `scout-youtube-candidates-for-askrigor` in Spark. If the old
custom app is no longer useful for another workflow, remove AskRigor from
Gemini Connected Apps; no AskRigor credential requires rotation.
