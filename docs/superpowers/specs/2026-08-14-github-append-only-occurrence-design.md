# GitHub append-only lesson occurrence design

**Date:** 2026-08-14
**Branch:** `feature/anonymized-lesson-capture`
**Scope:** Active duplicate lesson occurrences only

## Problem

The first authorized live lesson submission created exactly one private issue.
The byte-identical second submission found that active issue but failed closed
with `github_unavailable` before incrementing its anonymous occurrence count.
Production was immediately restored to the pre-Action image with Actions
disabled; no duplicate issue was created.

A read-only diagnostic proved that the selected-repository GitHub App token,
issue listing, canonical private metadata marker, issue detail read, and ETag
were all valid. GitHub returned a weak ETag for the issue detail. A no-content-
change reproduction of the queue's exact conditional PATCH returned HTTP 400,
without rate limiting or an authentication failure.

GitHub's current REST best-practices documentation states that conditional
requests for unsafe methods such as PATCH are unsupported unless a specific
endpoint says otherwise. The Update an issue endpoint does not document
conditional PATCH support:

- <https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api?apiVersion=2022-11-28#use-conditional-requests>
- <https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#update-an-issue>

The existing implementation therefore relies on a concurrency primitive that
the live GitHub endpoint does not provide.

## Constraints

- Preserve one private issue per active fingerprint and the same public
  `ARL-####` candidate ID.
- Preserve the reviewed single-writer deployment boundary; multiple replicas
  still require a distributed coordination design before activation.
- Never overwrite a maintainer's issue-body text or comments.
- Store no raw request, model output, user identity, network identity, health
  information, credential, or conversation text in duplicate-occurrence data.
- Retain the exact GitHub App boundary: one selected private repository with
  `issues:write` and `metadata:read` only.
- Retain list-before-create idempotency, terminal-label behavior, fixed
  timeouts, pagination bounds, sanitized errors, and public response schemas.
- Keep the already-created synthetic issue compatible with the corrected
  implementation.

## Considered approaches

### 1. Append-only generated occurrence comments — selected

Keep the original issue body immutable after creation. For each duplicate of an
active fingerprint, append one private machine-owned issue comment containing
only an anonymous sequence number, observation timestamp, and canonical hidden
marker. Reconstruct the next count from the issue's original metadata plus all
canonical generated occurrence comments.

This uses an operation GitHub supports, never replaces owner-authored bytes,
retains one issue and the current App permission set, and remains recoverable
after process restart.

### 2. Remove `If-Match` and PATCH the issue body — rejected

This would make the immediate live call succeed, but a maintainer edit between
the detail GET and PATCH could be silently overwritten. Post-write comparison
cannot recover bytes that were already lost.

### 3. Add a database or broader GitHub locking permission — rejected

A distributed store or Git-ref lock could provide stronger multi-replica
coordination, but adds infrastructure or privileges that the current
single-writer deployment does not need. It would exceed the bounded acceptance
fix and weaken the present least-privilege posture.

## Design

The initial issue body and its canonical `askrigor-lesson-metadata` marker stay
unchanged. Its `occurrence_count` is the starting count for backward
compatibility with any issue created or updated by the original format.

When an active matching issue exists, the queue will:

1. fetch the issue detail and revalidate its state, terminal labels, body, and
   exact fingerprint marker;
2. fully paginate `/issues/{number}/comments?per_page=100&page=N`;
3. distinguish ordinary maintainer comments from exact generated occurrence
   markers;
4. fail closed on a malformed generated marker that claims this queue's
   namespace, while ignoring unrelated comments and foreign fingerprints;
5. calculate the next count from the highest canonical stored count, starting
   with the issue-body count;
6. POST one comment containing only the new anonymous count, canonical UTC
   observation time, and a canonical base64url JSON marker; and
7. return `existing_candidate` with the same issue number and new count only
   after GitHub confirms comment creation.

The comment will have a fixed human-readable shape and a final marker carrying
exactly:

```json
{
  "fingerprint": "64 lowercase hexadecimal characters",
  "occurrence_count": 2,
  "observed_at": "canonical ISO-8601 UTC timestamp"
}
```

No candidate text is repeated in the comment. The issue body remains the
bounded generalized lesson; subsequent comments are anonymous occurrence
events. The latest canonical generated comment supplies the current count and
last-seen time.

The queue remains serialized by its existing process-local promise chain. A
future multi-replica deployment is still prohibited without distributed
coordination. A maintainer can change labels between the final read and comment
creation because GitHub offers no atomic issue-state/comment transaction; that
race may leave a harmless occurrence comment on an issue just made terminal,
but cannot overwrite or delete owner work. The next submission will observe
the terminal state and follow the existing replacement-candidate rule.

## Verification

Test-driven implementation will begin with failing queue tests that require:

- an active duplicate to leave the issue body byte-identical and use no issue
  PATCH;
- one exact generated comment and an incremented public occurrence count;
- complete comment pagination and correct reconstruction from an older body
  count;
- ordinary maintainer and foreign-fingerprint comments to remain untouched;
- malformed queue-owned markers to fail closed without writing;
- concurrent identical in-process submissions to serialize into one issue and
  distinct occurrence counts;
- a lost comment response followed by retry to retain one issue;
- hung comment listing or creation to respect the existing sanitized timeout;
  and
- unchanged issue creation, terminal-label, privacy, App-scope, and response
  tests.

After focused and full deterministic gates pass, build a new immutable image
from the exact commit and repeat the existing local no-secret container gate.
Transactionally deploy only `research-mcp` with the saved rollback boundary.
The already-created synthetic issue is occurrence one; one byte-identical live
submission must return `existing_candidate`, the same `ARL-0004` identifier,
and occurrence count two without creating another issue. Verify the generated
comment privately, run the failure-isolation and MCP gates, mark the issue as
synthetic/rejected, and close it.

## Rollback

On any failed deterministic, container, deployment, or live gate, restore the
saved pre-Action Compose file and prior image, set
`ASKRIGOR_ACTIONS_ENABLED=false`, recreate only `research-mcp`, and require the
Action path to return 404 while health and MCP remain available.
