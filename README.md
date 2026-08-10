# AskRigor

AskRigor v0 is a protocol-aware research plugin with a read-only, deterministic
Model Context Protocol (MCP) server. The server exposes protocol manifests and
source adapters; it does not provide medical interpretation or treatment advice.

## Requirements and verification

- Node.js 24.x and npm
- Install pinned dependencies with `npm ci`
- Run the deterministic fixture suite with `npm run test:run`
- Run the release verification sequence with `npm run verify`

The default test commands do not contact external providers or consume provider
quota. They replay recorded fixtures and verify stable identifiers, explicit
access states, pagination/reply reconciliation, and data-derived protocol
manifests. MCP transport tests do bind a temporary localhost loopback server;
that local socket is not external provider access.

## Opt-in live provider smoke tests

Live smoke tests are separate from the default suite:

```sh
npm run test:live
```

That command explicitly enables the guarded live suite. It makes only bounded,
small calls and checks stable semantics rather than changing exact result or
comment counts.

- Europe PMC and ClinicalTrials.gov use their public endpoints.
- PubMed runs only when `NCBI_EMAIL` is present. `NCBI_TOOL` and
  `NCBI_API_KEY` are optional.
- Crossref runs only when `CROSSREF_MAILTO` is present.
- YouTube runs only when both `YOUTUBE_API_KEY` and
  `ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID` are present; otherwise it reports a clear
  skip. Choose a deliberately bounded public video whose comments are enabled.
  The adapter—not merely the Vitest timeout—is capped at 30 provider attempts,
  2 top-level-comment pages, 20 independent reply pages, 200 top-level threads,
  500 total comments/replies, 1 MiB of normalized text, 2 MiB of normalized
  output, and 20 seconds elapsed. The surrounding test timeout is 30 seconds.
  When it runs, the test requires API-visible page exhaustion and
  top-level/reply reconciliation without asserting an exact changing count. If
  the selected video exceeds a ceiling, becomes unavailable, or disables
  comments, the smoke test fails truthfully; select a smaller fitting public
  comments-enabled video rather than treating the partial result as complete.

For example, after setting values in your shell or secret manager:

```sh
NCBI_EMAIL="$NCBI_EMAIL" \
CROSSREF_MAILTO="$CROSSREF_MAILTO" \
YOUTUBE_API_KEY="$YOUTUBE_API_KEY" \
ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID="$ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID" \
npm run test:live
```

Do not commit provider credentials. See `.env.example` for the provider
configuration variables; `ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID` is test-only and may
be set directly in the shell running the smoke test.

## Run the local MCP server

```sh
npm run dev:mcp
```

The local HTTP transport serves `/mcp`; `/healthz` is available for a basic
process check. Adapter responses preserve explicit states such as `complete`,
`metadata_only`, `inaccessible`, `rate_limited`, and `error` instead of
silently upgrading partial evidence.

Protocol version and SHA-256 values are derived from the canonical XML bytes at
runtime. Replacing a valid protocol file therefore updates its manifest without
source-code changes.
