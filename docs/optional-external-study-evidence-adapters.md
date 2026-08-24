# Optional external study-evidence adapters

Status at 2026-08-24: internal Phase D5 adapter and controller boundary. PubPeer
and Epistemonikos live transports are deliberately disabled. No provider key,
token, endpoint, host allowlist, public operation, deployment setting, account,
or recurring cost is added by this phase.

## Why the live transports are disabled

PubPeer's official FAQ says data API access requires contacting PubPeer for an
API key. It does not publish a stable response schema that AskRigor can safely
implement from current public documentation. The FAQ also says comments are
not scientifically reviewed or warranted as true and describes editing and
moderation behavior. AskRigor therefore must not treat a comment, count, or
provider label as proof of error, misconduct, invalidity, or scientific truth.

- PubPeer FAQ: <https://pubpeer.com/static/faq>
- Official PubPeer browser extensions: <https://github.com/PubPeerFoundation>

Epistemonikos' official API page describes a restricted beta whose documented
version is dated 2017-08-07 and requires a private access token. AskRigor has no
current authorized token, negotiated usage terms, or verified live response
shape for this phase.

- Epistemonikos API: <https://www.epistemonikos.org/en/api>

Live activation requires a separate reviewed change that verifies the current
official contract and terms, maps the exact provider response into the strict
records below, adds only the necessary server-side secret and fixed transport,
and passes a bounded live smoke without logging raw provider bodies or tokens.
It must also update deployment, privacy, and release evidence. A model or
caller cannot supply or select a provider transport.

## Versioned server-side record boundary

The source package exposes two strict normalization contracts:

- `askrigor.pubpeer-authorized-response.v1` and
  `askrigor.pubpeer-authorized-failure.v1`;
- `askrigor.epistemonikos-authorized-response.v1` and
  `askrigor.epistemonikos-authorized-failure.v1`.

They are not public request formats. A future authorized server transport must
construct one of these minimized records after checking the current provider
response. Unknown fields, identifier mismatch, oversized collections or text,
inconsistent counts, duplicate identities, and malformed pagination fail
closed.

The PubPeer adapter preserves exact queried DOI, canonical thread identity,
comment versus identified-author reply, posted and updated times, revision ID,
visible/edited/deleted-or-unavailable state, bounded text and links, raw
classification provenance, provider counts, cursor, and exhaustion. Deleted
content is never reconstructed. Visible messages remain unaudited leads with
unknown materiality.

The Epistemonikos adapter preserves exact queried DOI, provider relation ID,
include/exclude/cite/update relationship, raw relationship, current/removed/
unknown state, raw classification provenance, bounded review identity, counts,
cursor, and exhaustion. A provider-reported review relationship is metadata,
not approval of a study, review, method, result, or conclusion.

## Controller enforcement

The existing server-owned external-evidence coordinator accepts these
executors only at construction. For every configured provider it:

1. verifies the queried study identity through the existing exact DOI gate;
2. executes the provider exactly once;
3. stores the normalized envelope in the bounded content-addressed artifact
   store;
4. binds the provider attempt and artifact hash into the signed receipt;
5. propagates retryable, nonretryable, partial, no-match, or successful state;
6. turns visible post-publication messages and exact current review links into
   source-linked downstream audit work; and
7. preserves unavailable/removed/bibliographic-only records as bounded
   limitations rather than favorable or unfavorable evidence.

An omitted unconfigured provider remains an explicit `not_configured` coverage
gap. Once supplied by server configuration, it cannot be skipped while the
coordinator returns a successful receipt. Provider content and labels cannot
create claim capability, a study-quality score, or a finalization permit.

## Storage and privacy

This phase reuses only the existing bounded in-memory artifact store. The
portable receipt contains provider identity, normalized artifact ID/hash/size,
status, and limitations, not provider bodies, discussion text, tokens, or
signing secrets. No database, durable cache, transcript/comment corpus,
retention change, or new third-party disclosure is introduced.

Fixtures are synthetic. No live PubPeer or Epistemonikos request is part of
hermetic tests, ordinary runtime, the public MCP catalog, or Custom GPT
Actions.
