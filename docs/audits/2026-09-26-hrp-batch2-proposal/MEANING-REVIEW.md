# HRP batch 2: meaning reviews and adoption status

These drafts shorten ten HRP 20.6.1 sections, with the goal of keeping every
rule's meaning. They are proposals only. `protocols/HRP_Full.xml` does not
change until the owner approves adoption, because the sections carry
clinical and scientific method content.

## Scope

- In scope (10): BidirectionalEvidenceDiscoveryAndTriangulationLoop,
  CommunityCorpusCompletionGate,
  CommunityEvidenceIndependenceAndActionabilityGate,
  ComparatorLineageAndProgramCongruenceAudit,
  CrowdSourcedAndClinicalSignalAudit,
  DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch,
  ExtendedHumanEvidenceAndGreyLiteratureSweep,
  QuantitativeRiskAndResearchAudit, SourceVerificationAndCitationAudit, and
  UniversalFullTextAcquisitionProtocol.
- Excluded:
  - TreatmentLandscapeAndVideoSelectionGate: its draft predates HRP 20.6.1.
  - PatientHistoryAndRecurrenceEvidenceGate: its draft replaces eight rules
    with pointers to Universal rules, so a later Universal edit would change
    HRP with no HRP diff. Keeping HRP's own text avoids that dependency.
- Several drafts move content into a sibling draft (for example CrowdSourced
  and ExtendedHuman into Bidirectional). Adopt the set together or not at
  all.

## Review 1 (independent, 2026-09-27)

- Verdicts: 5 of 11 drafts passed. 6 failed with 11 meaning issues (2
  moderate, 9 minor).
- The moderate issues:
  - DoseRegime OutputMinimum made its harm-reduction and threshold outputs
    conditional.
  - Bidirectional turned the per-run extraction of video, comment, reply and
    author identity, dates and thread structure into a description of the
    connector's records.
- Fixed in `bea60f1`, as follows.
  - Bidirectional:
    - the stand-alone "any case where" trigger;
    - "explicitly" in the source-layer exception;
    - "can be" for creator replies;
    - the scope of identity minimization;
    - adherence pattern as a search target.
  - QuantitativeRisk: QA9's opening sentence restored, and a dangling rule
    reference removed.
  - SourceVerification: the ban on fabricating identifiers, quotations,
    results, URLs, search terms and signal classifications.
  - UniversalFullText: "exposure or intervention dose".

## Review 2 (independent, 2026-09-27)

- It confirmed all 11 fixes against the original HRP text.
- It found 2 new minor issues in DoseRegime, fixed in the commit that adds
  this file:
  - D2 (safety-relevant), ThreeThresholdModel: "when the question requires
    it" had moved to the front and made the three-threshold distinction
    optional. The draft now keeps the original structure.
  - D3, Activation: an added "or" created a trigger without "Structured or
    deep". The original list is restored.
- It also flagged an inaccurate parenthetical in Bidirectional ("on
  connector runs the audit records carry these"), which is removed.
- With these applied, no section fails. Nits remain (wording that is
  stricter or equivalent), listed in the reviewers' reports.
- Splice check:
  - the spliced HRP is well-formed and keeps 60 top-level sections;
  - it has no dangling references;
  - it goes from 516,263 to about 504,000 characters (-2.4%), and the ten
    sections shrink by about 11%;
  - no literal test pin on HRP text is lost.

## What adoption needs

- Owner approval.
- Splice the ten drafts into `protocols/HRP_Full.xml`, bumping the version to
  20.6.2 and adding a RevisionHistory entry.
- Nothing to restore for priorities. Three drafts (Bidirectional, DoseRegime,
  ExtendedHuman) drop the `priority` attribute on 40 rules and say instead
  that every rule, or every unmarked rule, is Critical. All 40 were Critical
  in HRP 20.6.1, and no marked rule changed priority.
- Update the six SHA-256 pins of `HRP_Full.xml` in the tests, and the
  batch-1 audit files that name deleted rules as the home of removed checks.
- Run `npm run verify`.
