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
