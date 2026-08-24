# Hermes worker pilot audit

Date: 2026-08-24

## Scope

This audit covers the Phase I private Hermes worker pilot. It does not cover a
production deployment, Custom GPT projection, n8n workflow, or live-provider
research-quality evaluation.

## Reviewed runtime

- upstream: `NousResearch/hermes-agent`
- release: `v2026.8.19`
- package: `0.20.5`
- exact commit: `fcbd1076a93841fa88855acce810e342a5b78101`
- runtime profile: one-shot process, no tools, no memory, no context files, no
  background review, no trajectories, no checkpoints

Before every turn, the AskRigor adapter refuses a different or dirty upstream
checkout and enforces that the resolved Python environment is outside the
checkout. The worker receives only its exact
semantic work package and a dedicated model credential; it never receives the
private AskRigor orchestration credential or production research-provider
credentials.

## Held-out controller benchmark

The hermetic benchmark covers three distinct terminal outcomes:

| Fixture outcome | Count | Meaning |
| --- | ---: | --- |
| server-authorized comparative completion | 1 | final prose may be released only with the server permit |
| server-bounded non-ranking completion | 1 | only the server-permitted bounded report may be released |
| rejected/incomplete worker result | 1 | no final prose may be released |

Aggregate fixture result:

- tasks: 3
- completion rate: 2/3 (authorized or bounded by the server)
- unnecessary/no-progress transitions: 1
- skipped-gate attempts detected: 1
- reported fixture cost: 1,200 nano-USD
- cost status: non-authoritative diagnostic only

These fixtures benchmark control behavior, not medical correctness or provider
model quality. A model's claimed completion, counts, cost, or prose cannot
change the server-owned result.

## Official-runtime smoke

The exact pinned Hermes runtime was launched twice against a loopback-only,
OpenAI-compatible deterministic fixture. Both one-shot processes returned the
same exact-package-bound module submission. The receipt was:

```json
{"smoke_version":"askrigor_hermes_official_runtime_smoke_v1","upstream_commit":"fcbd1076a93841fa88855acce810e342a5b78101","runs":2,"provider_requests":14,"work_type":"module_applicability","tools_available_to_worker":0,"finalization_authority_tested_elsewhere":true}
```

This proves the reviewed upstream library can be invoked repeatedly through
the AskRigor bridge with zero worker tools. It is deliberately not evidence of
live-provider semantic quality.

## Enforcement evidence

The focused suite proves that:

- deterministic work is requested through the AskRigor `/resume` operation and
  is not reimplemented by Hermes;
- module and candidate submissions are bound to exact session, state, work
  type, and discovery frontier;
- extra completion, synthesis, provider, and completed-operation fields fail
  schema validation;
- stale, cross-session, and cross-frontier submissions cannot advance state;
- a server denial, no-progress loop, malformed worker result, or exhausted
  transition limit is not success;
- the final-response guard releases output only for a matching server-issued
  comparative or bounded permit;
- the worker child environment excludes parent orchestration, Gemini scout,
  YouTube, OpenAI, home-directory, and other unallowlisted settings;
- the actual private HTTP controller can execute module routing,
  server-controlled Gemini/native discovery, and candidate screening, then
  preserve the server's denial when later required work remains.

## Boundary

The current private controller projects only module-applicability and candidate
screening semantic packages. Other semantic packages remain server-unexposed;
the worker stops honestly instead of inventing a model-authored replacement.
The public MCP and Custom GPT Action inventories remain unchanged.
