# Automated Gemini YouTube scout integration plan

**Status:** Implementation and deterministic verification complete on
`agent/automated-gemini-scout-20260823`; paid-provider/privacy activation gate,
PR, deployment, plugin synchronization, and live product acceptance pending.

**Goal:** Replace the owner-operated Gemini Spark packet transfer with one
public, read-only AskRigor Action that runs a server-side Gemini Google-Search
scout, independently validates every returned YouTube identity, and returns
the existing receipt-linked candidate frontier. Consumer Gemini Spark remains
an optional historical/manual tool, not an execution dependency.

## Owner requirements preserved

- No person copies a Gemini packet into AskRigor.
- Candidate summaries remain provisional until AskRigor retrieves captions.
- The objective is materially useful, treatment-specific videos rather than a
  raw video quota.
- A provider/configuration failure is not mislabeled as a missing Action.
- No raw personal health narrative, identifier, credential, chat transcript,
  comment corpus, or unrestricted provider output is sent to Gemini or stored
  in the aggregate cost ledger.
- After this integration is released, resume the separate execution-control
  roadmap at Phase A from fresh `main`; do not mix that controller refactor
  into this provider task.

## Implementation

1. Harden the existing Gemini Interactions adapter.
   - Use the current stable `gemini-3.6-flash` model through the official
     Interactions API and Google Search tool.
   - Set `store:false`, bound output/thinking, preserve aggregate usage, and
     require the packet's declared queries to reconcile with actual
     `google_search_call` receipts.
   - Never retain or return raw invalid provider output, search-result HTML, or
     model thought content.

2. Add an automated Action and service boundary.
   - Input: de-identified population-level research target plus the closed
     diagnosis-status enum.
   - Deterministically reject private/personal/identifier-bearing input before
     any provider request.
   - Reserve a conservative per-call amount from the existing fixed monthly AI
     budget before the request; commit only aggregate calculated usage.
   - Invoke Gemini, then immediately run the existing independent YouTube
     identity validator. Return the existing complete frontier receipt.
   - Distinguish provider-not-configured, budget, access, rate-limit, malformed
     provider output, and YouTube validation boundaries.

3. Add hostile and compatibility tests.
   - No key in URL/body/output; `store:false`; bounded generation.
   - Personal or identified input causes zero Gemini calls.
   - Missing configuration is a provider boundary, not a missing-tool claim.
   - Invalid/ungrounded/query-mismatched Gemini output cannot reach validation.
   - Paid calls cannot occur without a budget reservation.
   - Raw provider failures and credentials never appear in receipts.
   - MCP inventory remains unchanged; the public Action inventory gains only
     the automated scout operation; the old validator stays backward
     compatible.

4. Update projections and operational evidence.
   - Custom GPT instructions call the automated scout directly and never ask
     the owner to supply a packet.
   - Update setup, privacy, release, synchronization, current-state, plugin,
     and generated Action artifacts.
   - Run focused tests, `npm run test:run`, `npm run verify`, site/deploy checks,
     diff review, lesson closeout, PR/CI, merge, deployment, direct live
     acceptance, plugin reinstall, clipboard installation bundle, and fresh
     Custom GPT acceptance where technically available.

## Explicit activation gate

Google Search grounding for the selected production model requires a paid
Gemini API project. Code, hermetic tests, documentation, schema generation, and
review can proceed without it. Before a live provider call or production
activation, obtain the owner's explicit decision on:

- using a paid Gemini API project and server-side API key;
- sending only the de-identified target and public scout prompt to Google;
- sharing the existing fixed monthly AskRigor AI budget ledger; and
- setting a provider-account budget/quota as defense in depth.

Recommended default: paid-tier `gemini-3.6-flash`, stateless requests,
de-identified input enforcement, existing aggregate $50 monthly application
cap, and a matching Google project budget alert/quota. Do not activate a free
tier that permits submitted content to be used to improve Google products.

## Completion boundary

The integration is not complete merely because the Action appears in OpenAPI.
Completion requires a live, de-identified quality replay whose Gemini search
queries reconcile, whose candidate packet validates independently against
YouTube, whose response remains within the public Action bound, and whose
installed Custom GPT invokes the automated operation without requesting a
manual packet.

## Verification checkpoint

- `npm run test:run`: 1,134 passed, 6 declared skips, 79 passing files and 1
  skipped file.
- `npm run verify`: passed typecheck, the same complete deterministic suite,
  and the production build.
- `npm run test:site`: validated all 4 public pages.
- `npm run test:site-deploy`: 28/28 passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- Source Action inventory: 26 operations; MCP inventory: unchanged at 21.
- No live Gemini call was made because production has no approved Gemini key.
