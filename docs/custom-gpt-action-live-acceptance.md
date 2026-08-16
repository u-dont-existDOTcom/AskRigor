# Custom GPT Action live acceptance

Status: candidate template only. Every case remains pending until it is run in
a new unpublished Custom GPT chat against the exact deployed candidate. Use
only synthetic, non-personal prompts. Do not record raw protocol text, provider
bodies, comments, continuation tokens, credentials, private issue content, or
health details.

## Deployment identity

| Field | Value |
| --- | --- |
| UTC time | `pending` |
| deployed commit | `pending` |
| deployed image | `pending` |
| rollback image/config | `pending` |
| OpenAPI SHA-256 | `pending` |
| instructions SHA-256 | `pending` |
| privacy URL/result | `pending` |
| direct GPT URL | `pending` |

For every case record: request class, pass/fail, sanitized result, and
limitation. `Result: pending` is not evidence.

### Case 1 — Universal complete protocol loading

- Request class: manifest → integrity verification → ordered protocol chunks.
- Required: every chunk index exactly once, contiguous byte coverage, chunk and
  whole-file hashes consistent, final `complete: true`.
- Protocol chunk coverage: `pending`.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 2 — HRP before bounded health research

- Request class: HRP manifest → integrity verification → ordered chunks, then a
  harmless synthetic health-research question.
- Required: no substantive research before complete HRP loading; exact protocol
  identity and complete chunk coverage recorded without text.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 3 — PubMed search and fetch

- Request class: public scholarly metadata retrieval.
- Required: literal access state, pagination, PMID provenance, and no fabricated
  full-text access.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 4 — ClinicalTrials.gov search and fetch

- Request class: public trial-registry metadata retrieval.
- Required: literal registry fields/access state and no inferred clinical
  efficacy or validity conclusion.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 5 — DOI resolution and retraction metadata

- Request class: public Crossref metadata retrieval.
- Required: preserve `metadata_only` and state that absence of a Crossref marker
  does not establish clinical validity or prove no update exists elsewhere.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 6 — YouTube survey and terminal per-video audit

- Request class: public community-evidence discovery and continuation.
- Required: survey first; follow every `continuation_recommended: true` token;
  stop only at a terminal receipt; require `synthesis_lock: pass` for full
  synthesis; preserve corpus counts when the analysis sample is transport-bound.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 7 — Malformed and oversized requests

- Request class: negative transport boundaries.
- Required: malformed input and an over-8,192-byte request fail with the
  declared non-secret errors; no provider call or partial success is inferred.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 8 — Shared rate and concurrency pressure

- Request class: public abuse-boundary pressure.
- Required: declared retryable failure without request content, credential,
  internal stack, or private detail; `/healthz` remains healthy.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 9 — Separately consented synthetic lesson

- Request class: consequential private-review write.
- Required: exact consent question, explicit `Yes`, any platform confirmation,
  one private-safe `ARL-####` receipt, and human-review notice.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 10 — Append-only duplicate synthetic lesson

- Request class: consequential duplicate write.
- Required: same candidate ID, incremented anonymous occurrence count,
  byte-identical original issue body, and count/timestamp-only generated comment.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

### Case 11 — Lesson failure isolation

- Request class: induced consequential-write failure plus read-only probes.
- Required: lesson failure reaches neither unsafe persistence nor a false
  success; research Actions, `/healthz`, and `/mcp` remain healthy.
- Result: `pending`
- Sanitized result: `pending`
- Limitation: `pending`

## Post-test freeze check

- post-test MCP inventory: `pending` — enumerate `/mcp` directly and require the
  exact frozen 17 tool names and inventory hash.
- Research Action operation count/security: `pending` — exactly 17 public
  non-consequential reads plus one authenticated consequential lesson write.
- protocol chunk coverage reconciliation: `pending`.
- Lesson queue status and synthetic cleanup disposition: `pending`.
- Publish/repoint decision: `pending`; do not repoint `gpt.askrigor.com` until
  every case passes and the actual direct `/g/...` URL is verified.
