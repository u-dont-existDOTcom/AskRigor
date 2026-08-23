# Automated Gemini YouTube scout integration plan

**Status:** PR #67 merged as
`8b26dcef2d4f9b892df909391f8253545dd67399`; its exact runtime and privacy
site are deployed. A paid live replay exercised and passed the single
no-search correction, then independently validated 6 of 8 candidate identities
with 2 terminal channel mismatches and 0 unresolved. The protected key and
personal plugin are current. Exact Custom GPT editor save/schema refresh and a
fresh product replay remain pending because no authenticated editor-control
capability is exposed in this environment.

The replacement key is now installed. The first paid replay failed closed
before search/candidate acceptance because the full nested provider schema was
rejected. PR #66 replaced only that provider-facing schema and deployed exact
merge `c1dc216bd8a203fe3a49ac8c876f5d1d00320c80`. The next paid replay reached
Google Search and model output but failed strict validation: an unconstrained
nested `candidates` shape did not reliably preserve the canonical packet.
Sanitized probes then proved that Gemini reliably emits a compact fixed-column
packet whose complete top-level and row shapes are constrained. Branch
`agent/gemini-scout-compact-packet-20260823` decodes that transport into the
unchanged strict AskRigor contract. If validation fails, one storage-disabled
no-search correction receives only the public candidate output, exact executed
queries, and safe validation issues; the server validates again and fails
closed rather than looping. PR #67 merged and deployed this implementation; the
fresh paid replay passed through the correction path.

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
   - Encode provider output as fixed-column rows, reconstruct the canonical
     object packet server-side, and keep the existing strict parser authoritative.
   - On a strict-validation failure, permit exactly one no-search correction
     containing only bounded public candidate data, executed public query
     receipts, and safe validation issues; never blindly rerun discovery.
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

## Activation decision

Google Search grounding for the selected production model requires a paid
Gemini API project. On 2026-08-23 the owner explicitly authorized:

- using a paid Gemini API project and server-side API key;
- sending only the de-identified target and public scout prompt to Google;
- sharing the existing fixed monthly AskRigor AI budget ledger; and
- setting a provider-account budget/quota as defense in depth.

The selected implementation remains paid-tier `gemini-3.6-flash`, storage-disabled requests,
de-identified input enforcement, existing aggregate $50 monthly application
cap, and a matching Google project budget alert/quota. Do not activate a free
tier that permits submitted content to be used to improve Google products.

The protected key is installed in the root-owned mode-0600 production runtime
environment and must never be pasted into chat, Git, logs, the GPT editor, or
command output. On 2026-08-23 the owner additionally confirmed that Google may
process the bounded same-provider correction payload under its own policies.

## Completion boundary

The integration is not complete merely because the Action appears in OpenAPI.
Completion requires a live, de-identified quality replay whose Gemini search
queries reconcile, whose candidate packet validates independently against
YouTube, whose response remains within the public Action bound, and whose
installed Custom GPT invokes the automated operation without requesting a
manual packet.

## Verification checkpoint

Deployed/live compact repair:

- PR #67 merge: `8b26dcef2d4f9b892df909391f8253545dd67399`;
- image: `sha256:bac9483e2bb2b96c0ea3da6ff12f3af840ef3bc40e3176a2f9c0b4d3583de917`;
- public inventories: 26 Actions, 21 MCP tools;
- live compact OpenAPI SHA-256:
  `51ed214117ededcecd46162fddcfb08ede1f0b56067f6b6dd137c831d14190f4`;
- live privacy/source SHA-256:
  `05f3a15dd6918f27636b7d42dd03e1a1ddfe4ac8787fd533a2d5f5ef617515ff`;
- paid replay: HTTP 200, no boundary, 10 grounded searches, correction used,
  2 interactions, 8 source / 6 validated / 2 terminally rejected / 0
  unresolved, frontier digest
  `1a4201faa116002299bd2b339614f6ee7f6013ab8adde5575a03e4582c7d631d`;
- plugin: validated and source/installed byte-identical at
  `0.1.0+codex.20260823192716`;
- editor: exact Instructions copied and exact editor opened once; signed-in
  save/schema refresh and product replay not yet observable.

Compact-packet repair candidate:

- focused adapter/Action/OpenAPI tests: 26/26 passed;
- `npm run verify`: 1,138 passed, six declared skips, typecheck and build passed;
- `npm run test:site`: all four public pages passed;
- `npm run test:site-deploy`: 28/28 passed;
- `npm audit --omit=dev`: zero vulnerabilities;
- source Action inventory remains 26 and MCP remains 21;
- required lesson status at `2026-08-23T21:13:53.413Z`: 1 open, 1 needing
  review, 0 accepted not incorporated, 3 incorporated or closed, 0 deletion
  eligible.

- `npm run test:run`: 1,135 passed, 6 declared skips, 79 passing files and 1
  skipped file.
- `npm run verify`: passed typecheck, the same complete deterministic suite,
  and the production build.
- `npm run test:site`: validated all 4 public pages.
- `npm run test:site-deploy`: 28/28 passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- Source Action inventory: 26 operations; MCP inventory: unchanged at 21.
- Deployment image ID:
  `sha256:bec3fa4f4f19ca76e123a546b818f572f05df49d68281feb67558880eea32da3`.
- Compact live OpenAPI SHA-256:
  `5f0a6dfffc02247eb94b2af29a9e9aff83c8a24d78c6cec19a61f3d1d989b372`.
- Live privacy bytes match source SHA-256
  `c234035bd1ebf91a809896d2074bcb1b3d40123065d9ff0de70ea8a8ad8a4092`.
- Personal plugin source and installed package are
  `0.1.0+codex.20260823192716`, SHA-256
  `7846db90fe54b1a1f896b29f6d90150dc3a468f01758db1fc57c424ad6a5d12e`.
- No live Gemini call was made because production has no installed Gemini key.
