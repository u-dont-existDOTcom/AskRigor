# Phase J n8n control-plane pilot

**Status:** In progress

**Roadmap authority:**
`docs/superpowers/plans/2026-08-23-execution-control-productionization-roadmap.md`

## Outcome

Add a self-contained n8n pilot that persists only opaque execution identity and
safe controller metadata, retries bounded infrastructure failures, makes stuck
and owner-gate states visible, and can reach its research-complete output only
after AskRigor returns a valid finalization permit.

n8n remains workflow plumbing. It does not reproduce HRP, treatment-space,
source-depth, provider, or finalization rules. The AskRigor server derives one
machine directive and performs one exact controller-selected work step. The
n8n workflow branches only on that directive.

## Prior-work and reuse decision

Phase J extends, rather than duplicates:

- the Phase H authenticated private orchestration boundary;
- the server-owned research-session controller and finalization permit;
- the Phase I exact-package-bound Hermes semantic executor;
- existing retryable versus terminal boundary classifications;
- the Phase G bounded encrypted session store when later configured.

The pilot uses only built-in n8n trigger, HTTP, switch/if, wait, response, and
stop/error nodes. It adds no custom node and no model/provider credential to
n8n.

Official implementation baseline checked on 2026-08-24:

- n8n release `2.35.7`, published 2026-08-21;
- exact container digest to be recorded after pulling the official image;
- workflow import/export through the official CLI;
- built-in HTTP retry settings (`retryOnFail`, bounded `maxTries`, explicit
  wait/timeout);
- execution-data saving disabled for success, error, progress, and manual runs
  in the ephemeral pilot;
- risky command/file nodes explicitly excluded.

## Implementation steps

1. Extract the Phase I semantic worker envelope into a transport-neutral shared
   module so the private server and Hermes parent validate the same exact
   package/result contract without an import cycle.
2. Add one authenticated state-bound private `advance` operation. The server
   alone decides whether the next exact step is a deterministic continuation or
   Hermes semantic work; the request cannot select a provider, module, count,
   completion state, or operation.
3. Add a transport-independent n8n control-plane core with an ephemeral safe
   store. It retains only an opaque n8n execution ID, opaque AskRigor session
   ID, current digest/directive, bounded retry/no-progress counters, and safe
   timestamps/reason codes.
4. Derive directives only from strict AskRigor responses:
   `CONTINUE_NOW`, `RETRY_AFTER`, `OWNER_GATE`, `STUCK`, `BLOCKED`,
   `COMPLETE`, or `BOUNDED_COMPLETE`. Time can trigger monitoring but never
   evidence saturation or completion.
5. Verify every final permit through the existing finalization schema and bind
   the safe complete state to its session/state/output boundary/payload hash.
   A denial, worker death, retryable failure, stale state, no-progress loop, or
   terminal boundary without a permit cannot become complete.
6. Add a small authenticated private n8n adapter with start/tick/status. The
   external n8n workflow receives only its opaque execution ID. It never
   receives the research target, semantic package, source corpus, private
   orchestration key, Hermes/provider key, or final report.
7. Commit a strict n8n workflow export and validator. Retryable directives pass
   through a bounded Wait loop; owner-gate/stuck/blocked paths terminate through
   Stop And Error; only complete directives with permit-bound fields reach the
   success response.
8. Add hostile tests for caller-authored completion/counts, forged permits,
   worker kill/restart, retry exhaustion, stale replay, time-only completion,
   blocked-to-success rewiring, custom/risky nodes, secret/private-field
   persistence, and an n8n IF node that tries to recreate research quotas.
9. Run an actual pinned n8n import/export and execution smoke in a disposable
   container/tmpfs. Keep execution saving disabled and remove the container and
   temporary state afterward. Do not activate a durable n8n instance, paid
   account, external notification channel, or production service in Phase J.
10. Update privacy, threat, orchestration, roadmap, current-state, and workflow
    backup/version documentation; run repository gates and lesson closeout;
    open, review, and merge the Phase J PR.

## Exit evidence

- A worker killed before submission leaves AskRigor unchanged and n8n retrying
  or stuck, never complete.
- A retryable deterministic/provider failure remains retryable until bounded
  retry exhaustion; elapsed time does not convert it into evidence saturation.
- Restarting the ephemeral n8n worker from the same opaque AskRigor session
  resumes from current server state rather than caller history.
- A forged `complete=true`, result count, renamed operation, or permit hash is
  rejected.
- Actual n8n `2.35.7` accepts the committed export, the success fixture requires
  a server permit, and denial/worker-failure fixtures do not report research
  completion.
- Public MCP and Custom GPT Action inventories remain unchanged.

## Explicit non-goals and later gates

- No production n8n deployment or durable n8n database.
- No external owner-notification service; the pilot uses n8n failed/owner-gate
  execution visibility. Selecting email, chat, pager, or another recipient is a
  later privacy/authority decision.
- No private research text in n8n execution history or workflow JSON.
- No n8n protocol logic, treatment quotas, provider checklists, or completion
  thresholds.
- No Custom GPT/plugin projection; that is Phase K after this phase merges.

