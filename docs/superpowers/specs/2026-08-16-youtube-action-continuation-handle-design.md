# YouTube Action continuation handle design

## Objective

Make multi-call YouTube community audits reliable in a Custom GPT without
changing the frozen 17-operation MCP surface or weakening the audit completion
lock. ChatGPT must relay a short continuation handle rather than reproduce a
multi-kilobyte authenticated continuation token exactly.

## Evidence and root cause

The approved product test surveyed 15 candidate videos, selected
`nIRABXSJwSw`, and retrieved 66 API-visible records over a restarted audit.
Both model-mediated continuation attempts were rejected as invalid. The final
receipt correctly blocked synthesis, but it returned no records for analysis
and could not preserve the preceding chain state.

The server's stateless continuation encoder, decoder, tamper check, expiry
check, and exact programmatic reuse tests pass. A representative token after 66
random-looking comment identifiers remains several thousand characters even
when compressed. The failure is therefore the Custom GPT's exact relay of a
large opaque value, not provider retrieval or server signature verification.

## Approaches considered

1. **Action-only transient handle (selected):** keep the MCP operation and its
   signed stateless token unchanged. At only the Custom GPT Action adapter,
   retain that token in bounded process memory for at most one hour and return
   an unguessable short handle. Resolve the handle before the next shared
   operation call.
2. Compress the stateless token. Rejected because random provider identifiers
   preserve enough entropy that the result remains thousands of characters and
   does not remove the demonstrated relay risk.
3. Increase work per Action call. Rejected because long calls increase timeout
   and quota risk, and large videos would still need a continuation boundary.

The owner approved approach 1 after disclosure that it adds short-lived
server-side continuation metadata and that a process restart or bounded
eviction invalidates an active Action chain.

## Architecture

Add a focused Action continuation-handle store with these invariants:

- a handle is `arh1_` plus 192 random bits encoded as base64url;
- only the existing signed stateless token is retained—never comment text,
  author identity, provider credentials, or protocol text;
- entries expire without renewal after one hour;
- the store is bounded to 2,048 entries and 16 MiB of token-plus-handle bytes;
- expired entries are removed lazily and the oldest entry is evicted when a
  hard bound would otherwise be exceeded;
- nothing is written to disk or application logs; and
- an unknown, expired, evicted, or malformed Action handle fails closed with a
  stable non-retryable 422 error that tells the controller to restart from the
  video identifier.

`createResearchActionRoutes` owns one store for the lifetime of its route set.
Only `audit_youtube_video_community` uses it. A new audit still sends a video
identifier to the unchanged shared operation. When that operation returns a
signed continuation token, the Action adapter replaces it with a short handle
before transport bounding. On the next Action call, the adapter resolves the
handle to the exact signed token before schema-valid shared execution. A
successful next segment revokes the preceding handle after its successor is
issued; a successful terminal segment revokes it without replacement. A
failed provider call leaves the current handle usable.

Raw stateless tokens remain accepted at the Action boundary for conversations
started before deployment. Direct MCP clients continue to receive and resend
the original stateless token. The MCP operation name, input/output schemas,
description, and frozen inventory bytes do not change.

## Privacy and operational boundaries

The public privacy notice, repository data map, README, setup guide, and release
evidence must distinguish the unchanged stateless MCP path from the Custom GPT
Action's bounded in-memory handle map. The notice must explain the one-hour
maximum, minimized fields, no text/credentials, no disk or log persistence,
and restart/eviction limitation before the new behavior is activated.

No new environment secret is required. The existing server-side YouTube
continuation secret continues to authenticate the underlying token. The short
handle is an unguessable bearer capability and is not bound to client IP
because successive ChatGPT Action calls may use different egress addresses.

## Verification and release

Use a red-green test at the Action route boundary that reproduces a long token,
requires a short handle, and proves the exact original token reaches the shared
operation on continuation. Add focused store tests for expiry and bounded
oldest eviction, an invalid-handle 422 contract test, an HTTP integration test
showing one store survives across Action requests, and a regression that the
MCP inventory is byte-identical.

Regenerate the Custom GPT packet, run the complete deterministic, site,
deployment-policy, and portable audit gates, and review the final diff for
privacy drift or secrets. Merge only after protected checks pass. Deploy the
exact merge reversibly, update the privacy site transactionally before or with
Action activation, then repeat the live YouTube continuation test in a fresh
private Custom GPT chat. Full acceptance requires at least one real
continuation followed to `synthesis_lock: pass`; a short handle alone is not
proof of chain completion.
