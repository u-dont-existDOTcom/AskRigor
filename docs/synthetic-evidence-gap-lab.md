# Synthetic evidence-gap lab

This local laboratory proves the smallest usable AskRigor gap-to-research loop
without enabling a public forum, real recruitment, or real health-data intake.
Its fixed acceptance question is **What precedes spontaneous prolactinoma
remission?**

## Run it

```bash
npm run evidence-gap:synthetic-lab
```

Open the printed loopback route, normally:

```text
http://127.0.0.1:43150/evidence-gaps/prolactinoma-spontaneous-remission
```

Run the complete UI path in an isolated headless Brave profile:

```bash
npm run evidence-gap:synthetic-acceptance
```

The acceptance command creates an ephemeral loopback server and browser
profile, clicks through contribution, challenge, correction, and withdrawal,
writes a temporary screenshot, closes Brave, and removes the profile.

## Composition boundary

`SyntheticProlactinomaGapLoop` is a thin in-memory orchestrator over existing
AskRigor services:

- `SyntheticCommunityComposerService` owns direct-intake steps, deidentified
  preview, permission, acknowledgement, and publication intent.
- `SyntheticCommunityLeadService` owns lead versions, public projections,
  challenges, corrections, source-independent clustering, and withdrawal.
- `buildSyntheticCommunityFrontierView` preserves direction-balanced ordering,
  missingness, verification, source distance, and the no-denominator boundary.
- `SyntheticCommunityResearchPipelineService` links the active cluster to an
  evidence check, research question, and review-required draft proposal.

No contract, ontology, migration, PostgreSQL table, or public MCP operation is
added. The static public `site/` is not modified.

## Contribution lifecycle

1. Choose explicit provenance: self, direct observer, subject-relayed, or
   multi-hop hearsay.
2. Save a raw unprompted **synthetic** account before candidate fields appear.
3. Record bounded outcome, transition, treatment context, timing, persistence,
   and document-metadata availability.
4. Review the exact deidentified public-lead preview and opt in explicitly.
5. See the projected lead in the direction-balanced frontier at its actual
   verification, capability, and completeness level.
6. Challenge scope, add a contiguous correction, or withdraw the projection.
7. See the linked research dependency marked for review; no research action is
   launched automatically.

The raw account is held only in the in-memory private draft. Public snapshots
expose booleans and a safe preview, not the raw account or synthetic account ID.
The HTTP server rejects non-loopback Host/Origin values and binds only to
`127.0.0.1`.

## Comparator semantics

The lab starts with one synthetic pregnancy/postpartum non-remission case. A
new reported-remission lead therefore appears beside a same-transition
comparison case. The frontier interleaves directions and explicitly states
that counts are submitted leads, not a denominator. Discussion activity cannot
change evidence state and no effectiveness percentage is permitted.

Public visibility and evidence strength remain independent. In particular, a
multi-hop hearsay lead may be visible in the local frontier while retaining
`UNVERIFIED` and `LEAD_ONLY` labels.

## Correction and withdrawal

A correction adds only synthetic baseline-documentation metadata. It creates
the next contiguous lead version, removes that one missingness label, retains
all other missing fields, and does not upgrade verification or causal scope.

Withdrawal removes the current projection from the visible frontier and leaves
a no-content tombstone for every corrected public version. The active cluster,
question, evidence check, and draft proposal are regenerated at a new exact
version and marked for dependency review. The originating raw account is not
placed in any tombstone.

## Known MVP limitations

- State is intentionally ephemeral and single-process.
- The page has no account authentication because it accepts only fictional
  synthetic data on loopback.
- There is no document upload, OCR, clinical verification, email, follow-up
  scheduler, external researcher contact, or public indexing.
- The linked proposal is a synthetic review boundary with ethics, privacy,
  safety, and methods review still required. `recruitmentActive` is always
  false.
- Aggregate association, frequency estimation, causal inference, and treatment
  conclusions are outside this slice.
- A real invite-only pilot requires the consolidated owner gate documented in
  issue #150.
