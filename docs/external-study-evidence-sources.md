# External study-evidence source boundaries

Status at 2026-08-24: internal Phase D1 source primitives only. They are not
registered as public MCP tools or Custom GPT Actions, are not connected to the
non-production research-session controller yet, and cannot authorize synthesis
or finalization.

## Crossref publication-integrity metadata

The existing Crossref adapter now has an internal rich lookup that preserves an
ordered history of publisher- or Retraction-Watch-attributed Crossmark
assertions. Supported normalized event kinds are retraction, withdrawal,
expression of concern, correction, update, reinstatement, and other. Each event
keeps the original and notice DOI roles, inbound or outbound direction, raw
type and label, date, reasons, provider record ID when supplied, source, and
deterministic hashes. Duplicate assertions are removed without merging away
distinct sources.

This is metadata about publication updates, not a study-quality judgment. A
successful response with no marker means only `no_update_marker_found` in the
checked Crossref record. It does not mean clean, valid, unretracted everywhere,
reproducible, or methodologically sound. Conflicting current assertions produce
an uncertain state. Retrieval failure, denial, rate limiting, and missing
records remain distinct from a successful no-marker result.

The existing public backward-compatible retraction lookup retains its prior
payload shape. The richer event history is internal in Phase D1.

## FORRT FLoRA replication relationships

The internal FORRT adapter accepts one canonical public DOI and calls only:

`https://rep-api.forrt.org/v1/original-lookup?dois=<doi>`

It has no caller-supplied base URL, credentials, arbitrary path, or batch input.
Only the exact `rep-api.forrt.org` hostname was added to the HTTPS allowlist.
The adapter normalizes forward replications, forward reproductions, and reverse
links to originals. It retains the provider's raw outcome wording and maps only
explicit supported values to `successful`, `failed`, `mixed`, or `unclear`;
anything else is `not_reported`.

Every linked relationship remains marked as not yet implementation-matched and
not yet source-audited. A FORRT outcome is therefore a lead to inspect, not a
verified replication verdict. A successful null result means only
`no_match_in_provider`; it does not establish that no replication or
reproduction exists. Partial, malformed, inaccessible, rate-limited, missing,
and failed responses remain separate states.

FLoRA-derived records preserve this attribution:

- Dataset: FORRT Library of Replication Attempts (FLoRA)
- Dataset DOI: `10.17605/OSF.IO/9R62X`
- License: CC BY 4.0
- Project: `https://forrt.org/fred/`

AskRigor stores no FORRT credential because the verified endpoint is public.
The adapter sends only the requested public DOI and fixed content negotiation
and user-agent headers. Raw provider bodies are not returned on errors.

## Shared contract boundary

`packages/contracts/src/study-external-evidence.ts` defines strict, bounded
records for later controller work: canonical identities, provider attempts,
publication events, replication/reproduction relationships, post-publication
threads, citation-context aggregates, review ancestry, result-specific
risk-of-bias imports, controller directives, unresolved items, and claim-local
limitations.

The contract deliberately has no global scientific, validity, reliability,
quality, or replication-verification score. Publication status, methods,
replication implementation match, result-specific bias, applicability, and
source access remain separate questions. Phase D2 will add the composite
coordinator and integrity receipt; Phase D3 will connect that evidence to
server-owned execution state.

## Storage, activation, and verification

Phase D1 adds no database, durable artifact store, session retention, public
operation, provider credential, deployment setting, or production provider
call. Hermetic fixtures cover all normalized event and relationship classes,
duplicates, reverse links, malformed data, no match, access failure, rate
limiting, upstream failure, and transport failure. Public inventories remain
21 MCP tools and 26 Actions.
