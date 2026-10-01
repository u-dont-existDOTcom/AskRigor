# TreatmentLandscapeAndVideoSelectionGate: coverage map

Replacement: `TreatmentLandscapeAndVideoSelectionGate.xml`. The root element and attributes are unchanged: `<TreatmentLandscapeAndVideoSelectionGate priority="Critical">`. All nine child names are kept.

## Sizes

| | Characters | UTF-8 bytes |
|---|---|---|
| Original element | 17,180 | 17,192 |
| Replacement element | 16,264 | 16,272 |
| Reduction | 916 (5.3%) | 920 |

**Method impact:** wording only, except one harmonization (N1 below), which is flagged NEEDS_OWNER_APPROVAL. The following are all unchanged:

- every threshold: 6 searches per batch; 20-40 screened; 8+ hypotheses; 8-15 audited; 6+ fingerprints; at most 2 per fingerprint; 4+ concentrated in 1-2; the 8/6 minimum;
- every trigger, class, fingerprint field, lock condition, and lock field name;
- the owner-approved 20.5.30 no-transcript-tool branch.

## Why this gate shrinks so little

- **Test pins.** tests/protocol.test.ts pins about 30 strings in this gate, including 8 whole sentences. Removing or rewording them breaks tests.
- **No server gate on the MCP connector.** Most of the gate is ledger and lock logic (inventory: 10 GATE_CANDIDATE rows and 5 MOVE_OUT_OF_RUNTIME rows). Only the controlled-session Action path enforces it: treatment-landscape-coverage-route.ts, research-treatment-finalization.ts, and research-candidate-frontier.ts. On the connector, finalize_research checks only that a survey receipt exists and that each material video has a terminal audit. It checks no classes, fingerprints, breadth minimum, or independence, so the prose must stay.
- **This gate is the home rule for others.** FinalSelfCheck FS184–FS189 and the batch-1 coverage docs point here.

The larger cuts are listed under "Options not applied" below.

## What the tests pin (all present in the replacement; verified)

Checked by running the real test suite on a copy of HRP_Full.xml with all four drafts spliced in. See Validation.

- **Whole-file, raw.** These are in tests/protocol.test.ts, the 20.5.19 and 20.5.20 tests.
  - The tag `<TreatmentLandscapeAndVideoSelectionGate priority="Critical">`.
  - The rule names `name="TreatmentSpaceInventoryBeforeSelection"`, `name="ExactProgramFingerprint"`, `name="DiversityBeforeConcentration"`, `name="AggregateLandscapeSynthesisLock"`, and `name="SpecificImplementationDiscoveryAndProvisionalScouts"`.
  - All 16 lock field names, from `treatment_classes_discovered` to `treatment_landscape_synthesis_lock`. They also appear in two ResearchAuditTemplates forms.
  - These phrases:
    - "every material umbrella class"
    - "exercise, physical therapy, diet, injection, surgery, conservative care, alternative treatment, program, approach, method". This one must stay on one line; it is kept on one line.
    - "Independently validate each"
    - "selected creator-content evidence still requires transcript"
    - "genuine terminal boundary permits only"
    - "configured external high-recall scout"
- **Whole-file, whitespace-normalized.** These are in the 20.5.19 test:
  - "reciprocally linked discovery-batch, class, candidate, fingerprint, and selection records"
  - "Derive a stable signature from the normalized program-field tuple"
  - "caller-supplied fingerprint IDs cannot establish diversity"
  - "stable source identifiers linked to retrieval receipts"
  - "Hard-block decision-relevant or uncertain omissions"
  - "only a terminal, nonretryable boundary after attempted recovery"
  - "caller-supplied claim that the corpus is small, narrow, or non-substantial cannot deactivate them"
  - "authenticated opaque continuation or server-held state proving one contiguous chain"
- **tests/protocol-sections.test.ts.** The section index summary is the Purpose. It is now 237 characters and fits the 240 limit untruncated; the original was truncated.
- **Referenced from other sections.**
  - FinalSelfCheck: FS185 names this section; FS184, FS186, FS187, FS188, and FS189 restate its rules.
  - The treatment-landscape trigger and the root revision entries.
  - This gate itself points to CommunityCorpusCompletionGate and OutputFormatting ReaderFacingAnswer.
- **Digest pins.** Any byte change fails these tests until the new SHA-256 is recorded. That is the normal release step:
  - tests/protocol.test.ts (HRP_SHA_256)
  - tests/reasoning-selection-structure.test.ts
  - tests/whole-argument-reconstruction-structure.test.ts
  - tests/mcp-tools.test.ts (manifest)
  - tests/research-frontier-repository.test.ts (manifest)

## NEEDS_OWNER_APPROVAL (applied, low risk)

**N1. BroadDiscoveryBeforeDeepAudit: the 8/6 minimum is stated once, with the lock's surface-aware definition of "fully audited".**

- Original, BroadDiscoveryBeforeDeepAudit: "But when the valid ledger contains at least eight material candidate videos across at least six materially distinct available programs, eight fully audited material videos spanning at least six such programs are an availability-conditioned minimum for broad synthesis, not an optional target."
- Original, AggregateLandscapeSynthesisLock (updated for 20.5.30): "When a broad substantial valid ledger contains at least eight material candidate videos across at least six available distinct programs, selection_coverage_lock also blocks unless at least eight material videos across at least six such programs have completed the selected-video depth requirements that apply on the serving surface."
- New: "But when a broad, substantial valid ledger contains at least eight material candidate videos across at least six materially distinct available programs, eight fully audited material videos spanning at least six such programs are an availability-conditioned minimum for broad synthesis, not an optional target; a video counts as fully audited when it has completed the selected-video depth requirements that apply on the serving surface."
- The lock now says: "…; or the availability-conditioned minimum of BroadDiscoveryBeforeDeepAudit is unmet."
- Why this needs approval: the Broad rule now carries the lock's "broad, substantial" condition and the 20.5.30 surface-aware meaning of "fully audited". Read literally, the old Broad sentence could not be met on the connector, which has no transcript tool. The thresholds are unchanged.
- To revert: restore both original sentences.

## Element and clause map

| Original element or clause | Disposition | New location or home | Note |
|---|---|---|---|
| Purpose | KEPT | Purpose | "separately" dropped; "for each selected" became "per selected" so the index summary is no longer truncated. |
| TreatmentSpaceInventoryBeforeSelection: trigger, class derivation, 10-class list, "discovery taxonomy" caveat | KEPT | same rule | The two opening sentences are joined. |
| same: per-class record (id and label, materiality, search state, omission impact 5-way with rationale, class-level follow-up, boundary) | KEPT | same rule | Wording only. |
| same: per-fingerprint follow-up state and boundary | KEPT | same rule | |
| same: per-batch record (query or scope, access and pagination, classes, candidate IDs, new hypotheses) | KEPT | same rule | |
| same: reciprocal candidate links; counts derived from records; no unitemized aggregate count | KEPT | same rule | "never accept … as proof of breadth" became "never from an unitemized aggregate count". |
| same: "Do not collapse distinct programs into exercise, physical therapy, conservative care, diet, injections, supplements, or alternative treatment." | MERGED | ExactProgramFingerprint | Verbatim. |
| ExactProgramFingerprint: 11 fingerprint fields | KEPT | same rule | Verbatim. |
| same: "program not described" sentinel; missing details cannot support class-wide claims | KEPT | same rule | |
| same: structured fields; missing-field state derived from values | KEPT | same rule | |
| same: sentinel normalization (legacy spacing, hyphen, underscore, case variants) | KEPT | same rule | Now "(spacing, hyphen, underscore, and case variants are the same sentinel)". |
| same: stable signature; caller IDs cannot establish diversity; same tuple is one program | KEPT | same rule | Verbatim (test-pinned). |
| same: free text or completeness boolean cannot complete a fingerprint; empty fingerprint is not distinct coverage | KEPT | same rule | "boolean" became "flag". |
| SpecificImplementationDiscoveryAndProvisionalScouts para 1: descend from every material umbrella class; search vocabulary list | KEPT | same rule | Verbatim. |
| same: generic placeholder list (inventory NOA=true) | KEPT | same rule | Verbatim, on one line (test-pinned). |
| same: per-class reciprocal receipt (query, non-generic terms, batch, literal result, per-search IDs, pagination, exhaustion or boundary) | KEPT | same rule | |
| same: "Each returned candidate must link reciprocally to that batch and class" | REMOVED_REDUNDANT | TreatmentSpaceInventoryBeforeSelection ("Link each candidate reciprocally to a discovery batch, class, and fingerprint") | A returned candidate's batch is that search's batch. The component-match requirement is kept. |
| same: components must match a named implementation term; discriminator fields cannot establish the match; another candidate cannot close the search; reopen searches | KEPT | same rule | |
| same para 2: scout frontier is provisional; validate identity; frontier digest and partition; terminal rejection only on literal not-found or verified mismatch; non-identity failures unresolved; screen every validated lead | KEPT | same rule | Only "whether an immediate retry is possible does not turn them into negative evidence" was reworded, to "remain unresolved and never become negative evidence, whether or not an immediate retry is possible". |
| same para 3: scout summary for discovery only; plain-language disclosure; never evidence; transcript branch; no-transcript branch (20.5.30, owner-approved); comments, metadata, and summaries never verified creator content | KEPT | same rule | Wording only. The 20.5.30 method is unchanged. |
| BroadDiscoveryBeforeDeepAudit: batches of no more than six searches; later batches target uncovered classes and hypotheses | KEPT | same rule | |
| same: planning ranges 20-40, 8+, 8-15, 6+, multiple independent pools | KEPT | same rule | Verbatim numbers. |
| same: independence from stable IDs; unknown independence affects the lock | KEPT | same rule | Test-pinned. |
| same: breadth applicability derived from ledger; caller corpus-size claim cannot deactivate | KEPT | same rule | Test-pinned. |
| same: "Screening ranges remain planning heuristics" and the 8/6 availability minimum | KEPT + NEEDS_OWNER_APPROVAL (N1) | same rule | See N1. |
| DiversityBeforeConcentration: coverage before concentration; at most two per fingerprint; rank and views are not credibility; preference list | KEPT | same rule | Verbatim. |
| same: two or three videos cannot establish broad coverage; ten redundant videos do not repair it | KEPT | same rule | Now "adding redundant videos, even ten, does not repair that failure". |
| same: "Depth of audit within selected sources and breadth of source selection are separate completion conditions." | REMOVED_REDUNDANT | Purpose (selection-space adequacy here, depth in CommunityCorpusCompletionGate); AggregateLandscapeSynthesisLock ("The two component locks are independent, and the overall lock passes only when both pass") | Fourth statement of breadth versus depth (inventory #breadth-vs-depth, MERGE). |
| BidirectionalLandscapeReopening: community-to-formal and formal-to-community reopening; open hypotheses until selected or structurally omitted with a formal return pass; continue while decision-relevant or positive information gain | KEPT | same rule | Kept here, not pointed to the bidirectional loop. Its lists ("comparator weakness", "stage differences", "eventual standard treatment") are not all in that loop's rules, and that section is being consolidated in parallel. |
| SelectedVideoTreatmentRecord: 12 record fields | KEPT | same rule | Verbatim. |
| same: consume server-produced receipts from the production transcript and discussion Actions | KEPT | same rule | |
| same: transcript and discussion receipt fields to preserve; reconcile before aggregating | KEPT | same rule | |
| same: "Videos actually audited" in plain language | KEPT | same rule | |
| same: "Do not expose raw internal status codes unless the user requests a technical audit or debug export." | POINTER | OutputFormatting ReaderFacingAnswer ("no retrieval codes, receipt or lock names …; the full audit record … only in a technical audit or debug export or when asked") | Pointer kept in the sentence. |
| same: transcript chain integrity (authenticated continuation; unsigned offset, skipped pages, mixed counts fail) | KEPT | same rule | Test-pinned; FS184 restates it. |
| AggregateLandscapeSynthesisLock: ledger field list (16 named fields plus directional searches, unaudited ranking-relevant candidates, access boundaries) | KEPT | same rule | Verbatim. |
| same: component locks independent; overall passes only when both pass | KEPT | same rule | |
| same: 11 selection-lock conditions | KEPT | same rule | Verbatim. |
| same: 8/6 availability minimum as a lock condition | MERGED | the lock's condition list ("the availability-conditioned minimum of BroadDiscoveryBeforeDeepAudit is unmet") | See N1. |
| same: derive conditions and counts from valid reciprocally linked records | KEPT | same rule | Test-pinned. |
| same: hard-block decision-relevant or uncertain omissions; structural-only warning; caller assertion cannot waive | KEPT | same rule | Test-pinned. |
| same: "A caller's optimistic aggregate, corpus-size or scope label, renamed ID, or unsupported relevance label cannot turn discoverable material into coverage or disable a structural check." | REMOVED_REDUNDANT | Each part has a home in this gate: TreatmentSpaceInventoryBeforeSelection ("never from an unitemized aggregate count"); BroadDiscoveryBeforeDeepAudit (caller corpus-size claim cannot deactivate the breadth rules); ExactProgramFingerprint (caller IDs, same tuple is one program); this lock ("caller assertion alone cannot waive …") | Summary of four rules. |
| same: per_video_depth_lock (transcript branch on surfaces with a transcript tool; discussion audit's own lock); live cursor, continuation, and retryable errors remain work; no favorable normalization | KEPT (partly SERVER_GATE on the connector) | same rule | On the connector, finalize_research requires a terminal audit_youtube_video_community receipt for each material video and reports a blocked audit lock as a limit. The prose stays because the server does not block on it. |
| same: overall lock conditions; the controller checks consistency only within the ledger | KEPT | same rule | |
| same: terminal boundary is not negative evidence; bounded non-ranking answer only with a structured reconciled boundary (listed fields); executable work continues; asserted boundary fails closed; no ranking while blocked | KEPT | same rule | Test-pinned phrase kept. |
| same: "Keep the Action request and response under their declared transport limits using strict input bounds, compact selected-video output, and causal worst-case transport tests." | REMOVED_META | none (engineering) | Server engineering instruction with no runtime meaning (inventory #transport-limits, MAINTAINER_ONLY). RESEARCH_ACTION_RESPONSE_MAX_BYTES and the schema bounds implement it. |
| same: "Screening heuristics alone create warnings; the availability-conditioned audit minimum and the explicit decision-relevant omissions above create blockers." | MERGED | BroadDiscoveryBeforeDeepAudit ("Screening ranges are planning heuristics and alone create only warnings"); the lock ("Hard-block decision-relevant or uncertain omissions"; minimum as a lock condition) | |

## Options not applied (each needs owner approval; savings approximate)

| Id | Change | Saves | What changes |
|---|---|---|---|
| TO4 | Expose the existing controlled-session treatment-landscape assessor as an MCP tool returning a signed receipt that finalize_research checks. Then shrink the gate to its principles: classes, fingerprints, diversity, scout status, the 8/6 minimum, "pass the assessor". | ~12,000 | Ledger and lock mechanics move from prose to server, as the owner intends. This is the only route to halving this gate. It subsumes TO1–TO3. |
| TO1 | Move assessor input-contract text out of runtime: sentinel normalization and signature rules; independence derivation; transcript chain proof; boundary-record fields; scout frontier partition mechanics. Put it in ResearchAuditTemplates or server docs, leaving one-line principles. | ~2,200 | The whole-file test pins still pass if the sentences move into the templates section. On the connector no assessor enforces them, so the model would lose these anti-gaming rules. |
| TO2 | Replace the lock's ledger field list with a pointer to the ForumSignalAudit template, keeping the three lock names. | ~630 | Tests pass (the fields are in the templates), but ordinary runs would no longer see the field list. |
| TO3 | Replace the receipt field enumeration with "carry each transcript and discussion receipt unchanged, including its synthesis lock". | ~285 | Relies on receipts carrying the fields, which they do. |

## Validation

- **Splice and tests.** Spliced into a copy of HRP_Full.xml (_work/splice.py) and ran the full suite (npx vitest run) in the copy. Result: 1,999 passed and 6 failed.
  - Five failures are the SHA-256 digest pins listed above.
  - The sixth, live-suite-security-scan, needs a .git directory, which the copy lacks.
  - All pins for this section pass, and the section count (60) and summaries pass.
- **Well-formedness.** The XML is well-formed; the loader's XMLValidator and protocolSections accept it.
