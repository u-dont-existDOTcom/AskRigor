# n8n control-plane pilot

Status: Phase J implementation; disabled by default and absent from public MCP,
Custom GPT Actions, deployment, and production inventory.

## Authority boundary

n8n is workflow plumbing around the existing AskRigor controller. It never
selects research modules, providers, treatment classes, evidence quotas, source
depth, semantic work, or completion. The n8n-facing adapter accepts only an
opaque control-plane execution ID after initialization. It returns exactly one
server-derived directive:

- `CONTINUE_NOW`
- `RETRY_AFTER`
- `OWNER_GATE`
- `STUCK`
- `BLOCKED`
- `COMPLETE`
- `BOUNDED_COMPLETE`

The AskRigor server's authenticated, digest-bound `advance` operation decides
whether the next step is deterministic controller work or one exact Hermes
semantic package. n8n cannot name that work, select its provider, submit a
count, or assert completion.

Only `COMPLETE` with `FINALIZATION_ALLOWED` or `BOUNDED_COMPLETE` with
`BOUNDED_NONRANKING_ONLY` can reach an n8n success response. Both require the
server projection to contain `permit_verified: true` and the matching
finalization-permit payload hash. Continue, retry exhaustion, owner gate,
stuck, blocked, unknown, and malformed results return a non-success response
and terminate through Stop And Error. Elapsed time is never evidence that
research is complete.

`OWNER_GATE` is a reserved server directive. The current controller does not
invent it from an ordinary terminal source boundary. If a later controller
phase emits it, this workflow synchronously notifies its authenticated caller
with the opaque execution ID and directive, then stops. Phase J adds no email,
chat, pager, or other external notification recipient.

## Data boundary

The ephemeral AskRigor-side pilot store contains only:

- opaque control-plane execution ID;
- opaque AskRigor session ID;
- current controller-state digest and server directive;
- bounded retry/no-progress counters;
- safe timestamps and reason codes; and
- only after authorization, output boundary and permit payload hash.

The n8n workflow sees only the opaque control-plane execution ID and the safe
projection above. It never receives the AskRigor session ID, research target,
diagnosis, semantic package, transcript/comment/full-text content, provider
response, model key, research-provider key, private-orchestration key, signing
secret, or final report. Execution-data saving is disabled for success, error,
progress, and manual runs in the disposable pilot.

The store is process-memory only. Restart from an existing AskRigor session
creates or recovers safe workflow state from current server authority rather
than caller history. No n8n database is approved as AskRigor's research-session
store.

## Runtime and workflow pin

- n8n release: `2.35.7`
- image tag: `docker.n8n.io/n8nio/n8n:2.35.7`
- immutable image digest:
  `sha256:166d7e3ca384afdffe75394bf00046c299d84a4bf17b19b35d6cf7773af0a147`
- workflow export:
  `ops/n8n/askrigor-control-plane.workflow.json`
- non-secret runtime template: `ops/n8n/runtime.env.example`
- workflow validator: `npm run validate:n8n-pilot`
- disposable real-runtime smoke: `npm run test:n8n-pilot`

The workflow uses only built-in Webhook, HTTP Request, Switch, Wait, If,
Respond to Webhook, and Stop And Error nodes. The validator rejects extra
nodes, code/command/file nodes, embedded credentials, pinned data, unbounded
retries, caller completion fields, private research fields, treatment/evidence
quota logic, permit-guard bypass, or rewiring an incomplete branch to success.

The tracked export is inactive. Import and publication are separate operator
actions. The real smoke imports the tracked bytes into a fresh temporary n8n
database, exports and revalidates them, publishes the workflow, runs success
and hostile paths, stops the container, and deletes the temporary database.

## Secrets and activation

The n8n adapter requires its own at-least-32-byte Bearer key, distinct from the
public Action key and the private research-orchestration key. Supply it only at
runtime as `ASKRIGOR_N8N_ADAPTER_BEARER`. n8n receives neither the inner
private-orchestration credential nor any model/provider credential.

Phase J does not authorize a paid n8n account, a durable n8n database, a public
webhook, an external notification service, a production deployment, or new
retention. Those changes require the later privacy/release gates.

## Verification and rollback

The pinned runtime smoke proves:

- import/export round-trip validity;
- comparative and bounded success only after their matching permit projection;
- retry followed by a permit can complete;
- worker/provider failure cannot directly complete;
- blocked, forged-completion, and incomplete results cannot return success; and
- no private research content is sent to n8n.

Rollback is to leave the private n8n adapter disabled and remove/stop the
ephemeral n8n instance. AskRigor session state and completion authority remain
with AskRigor; no research completion is lost or inherited from n8n.
