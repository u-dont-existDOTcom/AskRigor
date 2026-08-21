# Gemini Spark MCP compatibility repair

**Goal:** Let an eligible Gemini Spark account connect to the existing public
AskRigor MCP endpoint without weakening the frozen read-only research surface or
changing canonical protocol behavior.

## Observed boundary

- The public endpoint returns `200` for a standard 2025-11-25 Streamable HTTP
  initialization, including when the request carries
  `Origin: https://gemini.google.com`.
- `OPTIONS /mcp` currently returns `405` and no CORS headers.
- The server currently accepts arbitrary Origin values. Current MCP transport
  rules require servers to validate a supplied Origin and return `403` for an
  invalid value.
- Google reports only a generic connection failure, and production access logs
  do not retain a request-level trace. Account-side acceptance therefore remains
  an external gate after the server repair.

## Repair

1. Allow only `https://gemini.google.com` when an Origin header is present.
2. Reject every other supplied Origin with a bounded JSON-RPC `403` response.
3. Return a bodyless `204` to a Gemini browser preflight and expose only the
   standard MCP methods and headers needed by Streamable HTTP.
4. Preserve origin-less server clients, stateless transport, all 17 tool
   definitions, Action routes, rate/concurrency behavior, and provider access.
5. Add regression tests for allowed preflight, allowed initialization, rejected
   origin, and unchanged origin-less client behavior.

## Verification and release

Run the targeted MCP transport tests, `npm run verify`, `git diff --check`, and
a bounded secret-pattern scan. Review and commit the exact diff. For production,
retain the current image as a reachable rollback tag, deploy only the MCP
container from the exact committed tree, and verify health, initialization,
tools/list, preflight, allowed Origin, rejected Origin, and unchanged Action
availability before asking the owner to retry Gemini.

Do not mark Gemini acceptance complete from local or public HTTP probes. Only a
successful account-side connection and synthetic Spark task can close that gate.

## Bounded diagnostic boundary

When connector troubleshooting needs request-level evidence, a maintainer may
temporarily set `ASKRIGOR_MCP_HANDSHAKE_DIAGNOSTICS=true`. The switch is false
unless it has the exact lowercase value `true`. Each eligible request can then
emit one fixed-shape record containing only a route class, method class, coarse
Origin/Accept/content-type/header-presence classes, a known JSON-RPC phase
class, initialization protocol-version class, completion class, response
status, and response media class.

The diagnostic must never retain a URL or query, IP/network address,
user-agent, header value, request or response body, JSON-RPC ID, tool name or
argument, prompt, provider payload, comment text, user identifier, or
credential. Logger failures cannot affect request handling. Routine production
keeps the switch disabled; any temporary diagnostic container must be recreated
with the switch disabled after the needed receipt is captured.

## Isolated compatible catalog

Captured account-side evidence established that CORS repair alone did not make
the standard catalog acceptable to Gemini. The compatibility endpoint is
therefore isolated at `/mcp/gemini` and advertises service name
`askrigor_research`. It uses the same ordered 17 read-only operations and the
same strict runtime handlers as `/mcp`, but its `tools/list` response omits
output-only catalog fields and removes function-schema keywords Google rejects.
Runtime constraints that would otherwise be omitted are preserved as
description hints; strict Zod validation remains authoritative when a tool is
called.

The standard `/mcp` catalog, Action surface, rate/concurrency controls,
provider adapters, and canonical protocols remain unchanged. In particular,
the Custom GPT-only YouTube transcript operation remains an Action and is not
added to either MCP catalog.

## 2026-08-21 canonical reconciliation

Production was found running the previously accepted compatibility image from
revision `4ccdf721ed4a41b1076a2370fce27372141f8901`, while canonical `main` at
`94062f8d5595ff8cef368f8c2b06732a4826ae57` contained the CORS repair but not
the compatible catalog or diagnostic implementation. The historical branches
also diverged across newer transcript and protocol work, so a branch merge
would create substantive conflicts and risk removing the transcript Action.

The reconciliation is an additive, test-first port onto current `main`:

1. preserve the current 19-operation Action document, including the
   Action-only transcript read;
2. add the isolated Gemini catalog and disabled diagnostic without copying the
   older server file;
3. adapt the compatibility assertions to Universal `20.5.14` and the current
   17-tool MCP inventory;
4. update the privacy disclosure before enabling the reconciled runtime; and
5. deploy only an exact reviewed merge with image, Compose, and site rollback
   points, then repeat both standard and Gemini endpoint acceptance.
