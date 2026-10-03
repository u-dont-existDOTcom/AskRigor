# Protocol changes the owner asked for: shopping, claim checks, lesson 17

Date: 2026-10-03. Status: **exact texts on the owner questions page as questions 27 to 29**
(published 03:21 UTC); waiting for the owner's answers, on
`claude/protocol-changes-20261003`.

## Owner outcome

Owner question 26, answered "C" on 2026-10-03: the next release waits for
three protocol changes the owner asked for earlier. Each comes to the owner
questions page with its exact text first. Everything then ships in one
release: these changes, "check this video" (#270), the free-research saving
(#271), `/version` (#269), the fast-uri fix (#257) and Dependabot #263 to
#268.

The three changes:

1. **The shopping module.** The owner's message of 2026-09-30: "i want to
   integrate this shopping module into UDA and AskRigor universal
   instructions". The owner's 2026-10-01 correction asked for the stricter
   activation and coverage rules. Both are recorded as UDA suggested fixes in
   `suggested-fixes/AskRigor/` (`2026-09-30-shopping-module.md`,
   `2026-10-01-shopping-activation-and-coverage.md`).
2. **The claim-integrity checks.** The owner asked on 2026-09-27 that every
   public-facing project carry the checks that apply to it. The UDA pack is
   `portable/claim-integrity/CHECKS.md`; earlier attempt: PR #250.
3. **Lesson issue #17.** Its two rules with no current HRP coverage: causal
   coupling and conditional-subgroup nulls.

## Process (house practice)

- **Frozen sources.** The owner's shopping module is the exact file
  (7,998 bytes, SHA-256
  `650ff6659d48c2158d7de6c2e104f4516084ae7448bf0b7ebdca372470fb0cb5`). It was
  re-verified on 2026-10-03 from the UDA suggestion's embedded copy, plus a
  final newline.
- **Recorded edits.** The canonical XML changes only by exact [prior, new]
  edit pairs in `tests/fixtures/protocol-edits/2026-10-03-*.json`. Tests undo
  them to prove the prior bytes.
- **Versions.** Universal 20.5.33 becomes 20.5.34; HRP 20.6.8 becomes
  20.6.9. Each gets a revision entry, and the version pins move.
- **Nothing is deleted.** Where the owner's module overlaps the existing
  recommendation gate, both stay: the gate covers every recommendation, the
  module adds shopping depth.

## 1. Shopping (Universal)

- **The section.** A new top-level section, `shopping_research`, goes right
  after `recommendation_preflight_integrity_gate`. It is not a core section,
  so it loads only for shopping tasks and adds nothing to health research. It
  holds:
  - an `activation` line, which becomes the section's summary in the index
    (236 of 240 characters);
  - the owner's `<shopping_module>` element, byte for byte;
  - five rules for the 2026-10-01 behaviors, adapted from UDA's own wording
    in `patterns/shopping-research.md` § 0: `ActivateBeforeResearch`,
    `CoverageBreadth`, `UsConsumerGoodsReviewDefault`, `ExactOfferLive`, and
    `DeadOfferContinuation`;
  - two generic regression cases.
- **Size.** The section is 12,477 bytes: 7,998 are the owner's module, and the
  added text is 611 words (4,480 bytes).
- **The admission fields.** The suggestion's two "admission fields"
  (`coverage_breadth`, `exact_offer_live`) become the rules `CoverageBreadth`
  and `ExactOfferLive`. Universal has no pass-field checklist.
- **No personal queries.** The owner's two regression prompts stay out of the
  public protocol: the cases are generic, and the prompts can go into tests.
- **Why a wrapper.** A section's index summary comes from its `purpose` or
  `activation`. The module alone has neither: its CDATA would leave the
  summary blank.

## 2. Claim-integrity checks (Universal and HRP)

The UDA pack `portable/claim-integrity/CHECKS.md` is version 1 (SHA-256
`19bdb749…`, which matches UDA's transfer ledger). It holds CI-01 to CI-11
and the experimental CI-X1. AskRigor is a research and writing product, so
every check applies.

Coverage against Universal 20.5.33 and HRP 20.6.8, checked 2026-10-03:

- **CI-05, figures to the primary source:** covered. The anchors are
  Universal `sources` and the point-of-generation Citation-entailment check,
  plus HRP `CitationChainAudit`. Per the pack's adoption rule, AskRigor keeps
  its own rules and adds no copy.
- **Partly covered:**
  - CI-01: the restatement and described-person checks cover the user and
    the people they describe, not texts or earlier-read sources.
  - CI-07: Overcorrection and premise rule 6 exist; nothing says to recheck
    before agreeing.
  - CI-09: whole-argument rule 6 exists.
  - CI-10: premise rule 7 labels estimates; nothing compares an answer with
    earlier answers.
- **Missing:** CI-02, CI-03 (absence in a text or conversation), CI-04,
  CI-06, CI-08 and CI-11.
- **Left out:** CI-X1. It asks for its hits and misses to be recorded, and
  AskRigor has no place to record them. It was also evaluated only on short
  questions.

The text is #250's wording, rebased onto today's versions; #250 itself is
stale (versions 20.5.27 and 20.5.30 are taken). The Universal
point-of-generation and rule-14 hunks still apply. The HRP rule goes after
`NoPrescriptionFormatting` in `OutputFormatting`, because #250's anchor
sentence was removed in HRP 20.6.0.

The cost is about 690 words in Universal (point of generation grows from
18.4 KB to about 22 KB) and 151 in HRP (`OutputFormatting` grows from 10.3 KB
to about 11.3 KB). Both sections load on most runs. Owner question 28 states
this cost.

After merging, a UDA agent records the adoption, the coverage mapping and the
CI-X1 exclusion in `portable/TRANSFER-LEDGER.json`, and AskRigor's
`docs/suggested-fixes-ledger.md` records the outcomes.

## 3. Lesson 17 rules (HRP)

### Coverage check (2026-10-03, against HRP 20.6.8 and Universal 20.5.33)

None of issue #17's drafts landed. They were PR #210 (closed unmerged,
Universal only) and the `task/hypothesis-preserving-evaluation-gate-20260907`
branch.

- **Causal coupling:** no rule tests whether a marker travels with a benefit.
  The nearest are `MechanismDoesNotUpgradeAssociation`, `BiomarkerNotCause`,
  FS20 and FS30, and Universal's `specificity_check`.
- **Subgroup nulls:** time windows are covered (`RiskWindowMultiplicityAndAggregation`,
  `Multiplicity`, case `TemporalSubwindowCancellation`). No rule says an
  averaged null leaves a subgroup- or state-limited effect untested, or asks
  whether the design could detect it.
- **Forum denominators:** only partly covered, contrary to the 26 Sep note
  that `SilentDenominator` mostly covered them.
  - Population rates are well guarded: `NoPopulationRateFromForumSample`,
    `SilentDenominator`, `EvidenceLayerMisuseControl`, and the
    case-series capability.
  - But `RelativeForumSignal` still classifies "the visible searched sample".
    A sample assembled by outcome-aimed searches (`DirectionalSearchSymmetry`)
    has a mix that reflects the search terms.

### Drafts

The exact texts are in owner question 29:

- `CouplingBeforeMechanism` in `CofactorAndMechanismAudit`;
- `AverageNullDoesNotRuleOutConditionalEffect` in
  `StatisticalAndClinicalInterpretation`;
- optional: `DirectionLabelsNeedOutcomeNeutralSelection` in
  `CrowdSourcedAndClinicalSignalAudit`;
- three stress cases, which are not loaded at run time;
- self-checks FS207 to FS209.

The forum module's per-video `community_signal` and "directional summary"
stay compatible with the optional rule. They describe fully read comment sets,
and the answer says how each video was found.

## Owner questions

- **27:** the shopping section.
- **28:** the claim-integrity checks.
- **29:** the lesson-17 rules.

Each has its exact text, options and a recommendation. They are asked together,
as one round.
