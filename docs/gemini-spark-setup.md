# Gemini Spark YouTube candidate scout for AskRigor

This is an owner-operated, optional high-recall lane. Gemini finds public
YouTube candidates; AskRigor independently validates their identities and
decides which sources merit protocol-governed research. Gemini does not execute
HRP, audit comments, validate treatment claims, or replace AskRigor.

## Prerequisites

Google currently requires Gemini Spark access, age 18+, a personal Google
Account, Keep Activity enabled, and presence in the United States for custom
apps. Spark requires Google AI Pro or Ultra. These external requirements were
rechecked on 2026-08-19. Gemini API billing does not change consumer Gemini or
Spark eligibility.

The candidate-only skill does not call the AskRigor custom app. An existing
connection to `https://mcp.askrigor.com/mcp/gemini` may remain installed, but it
is not required for this workflow. The public endpoint remains at 17 expected
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
`a681a1d4f71e8b6bcc1d138b555a8ea70f9f14651153ea47176466f76e4b54dd`. The
old `staged-remedy-scan-v16` contract is retired. Do not repair, merge, or run it
again; its forward test found useful videos but failed its own counts, joins,
classification, evidence-map, and metadata contracts.

## Run a scout task

Give Spark only the de-identified research question and select
`/scout-youtube-candidates-for-askrigor`. The response must begin exactly with:

`Scout contract: youtube-candidate-handoff-v1`

`Mode: candidate_discovery`

The remainder must be one `## AskRigor candidate handoff` heading and one JSON
block. It contains executed discovery queries, 3–12 candidate IDs with
provisional creator-claim annotations, 1–4 suggested seed IDs, observed search
gaps, and fixed disclosures. It contains no AskRigor access status, provider
statistics, comment findings, evidence verdict, rabbit-hole map, or return-
packet contract.

Copy or save the complete response unchanged. This is the only manual transfer
in the optional lane; there is no iterative owner-operated probe or correction
loop.

## Validate in AskRigor

The deterministic validator checks the complete response before trusting any
candidate. With `YOUTUBE_API_KEY` already present in the environment, run:

`npm run validate:gemini-handoff -- path/to/spark-response.md`

Use `-` instead of a path to read standard input. Do not place the API key in
the command or the packet. The command:

1. requires the exact marker, mode, heading, single JSON fence, field bounds,
   closed enums, unique IDs and queries, canonical links, all five query
   purposes, 32 KiB response ceiling, seed-subset rule, and disclosures;
2. calls the existing AskRigor YouTube adapter for every candidate;
3. compares the declared ID, canonical URL, title, and channel with provider
   metadata;
4. preserves provider access states, statistics, errors, and limitations;
5. marks a suggested seed mechanically eligible only when its identity is
   validated, its reported privacy state is public, its provider comment count
   is positive, and an earlier eligible suggestion does not use the same
   provider channel; and
6. emits `accepted`, `partial`, or `rejected` with exact machine-readable
   reasons.

An `accepted` receipt validates structure, provider identity, and mechanical
comment-audit eligibility only. Gemini intervention labels and creator summaries
remain provisional. A positive comment count does not prove that comment
retrieval will be accessible or complete. AskRigor must still choose material
seeds, retrieve required corpora, preserve completion receipts, research formal
and other community sources, and obey the synthesis gate.

The validator is available as
`validateGeminiYoutubeCandidateHandoff` from `@askrigor/sources` for an
authorized supervisor or agent that already has the complete response. It is
not a new public MCP or Action operation.

## Acceptance check

Use the de-identified prompt `how can I fix my bad hip`. Confirm that Spark:

1. emits the exact `youtube-candidate-handoff-v1` framing and strict JSON;
2. preserves `diagnosis_not_specified`;
3. records 6–12 unique executed searches spanning firsthand outcome, radical
   outcome, overlooked intervention, conventional benefit, and conventional
   negative purposes;
4. returns 3–12 unique surfaced videos and 1–4 suggested IDs drawn from them;
5. attributes every creator claim and omits metadata status, counts, comment
   findings, efficacy, safety, causality, and treatment recommendations; and
6. passes the deterministic validator against independent YouTube metadata.

If Spark violates the JSON contract, keep the rejected receipt and exact issue
paths. Do not ask the owner to diagnose or patch the skill. Repair the repository
contract only if repeated independent runs expose the same decision-relevant
failure.

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
