# Keep review auditability, reviewer genuineness and product efficacy apart (owner lesson, 2026-10-09)

## Authority and scope

- UDA lane `2026-10-09-shopping-review-provenance-and-efficacy.md`, filed in the lane on 2026-10-12 (UDA #346). The
  owner asked on 2026-10-09, in a private ChatGPT research chat, that this shopping lesson be sent to AskRigor. The
  item asks AskRigor to confirm with the owner before declining or deferring it.
- It changes Universal's shopping module, so it ships only as exact text the owner approves (owner question 82).
- The case below is synthetic.

## What the lesson is about

- An audit of a supplement's reviews found:
  - older five-star testimonials hosted by the seller;
  - a review feed that returned nothing beyond them;
  - unclear purchase verification;
  - a separate buyer platform with many brief five-star ratings and a few specific reports of benefit and of no
    effect.
- Two opposite errors tempt: calling the seller's testimonials fabricated and writing off the product, or reading
  the buyer platform's high stars as proof that it works.

## What exists

- **Universal shopping module, sections 6 and 7:**
  - ratings stay apart by platform, with no cross-platform averaging;
  - seller-controlled silence is weak reassurance, and copies are not independent;
  - details, stars, badges and AI detectors certify neither truth nor fakery;
  - incentives don't make a review false;
  - selected accounts can't establish how common an outcome is.
- **Section 9** says testimonials do not prove efficacy.
- **HRP `CrowdSourcedAndClinicalSignalAudit`** covers exact-product versus ingredient cohorts, neutral sampling and
  reports in every direction.
- **`finalize_research`'s `review_corpora`** already records ratings shown, written reviews shown, reviews read and
  how they were selected.

## Gaps

1. Nothing tells the AI to keep three questions apart: whether a seller's review display can be audited, whether each
   review reflects a real buyer, and whether the product works.
2. A failed "load more" or an empty review feed has no stated meaning, so it can be read as fabrication.
3. Nothing asks for platforms to be reconciled before a mismatch is read as manipulation: imports and syndication,
   order-ID eligibility, earlier product IDs, migrated testimonials.
4. Detailed firsthand reports aren't ranked above content-free praise, so the AI can discard real signals along with
   suspect ones.

## Design

1. One compact paragraph at the end of the module's section 7 (draft below), and the module header goes from v0.3 to
   v0.4. No new section or parallel policy; HRP is unchanged.
2. One regression case in the module's `regression_cases`.
3. Tests: exact text and placement, a reversible fixture chained from the Universal version current at build time,
   and the independent approved constants.
4. Acceptance: the synthetic case through the AskRigor connector in a Claude session (no API spend).

## Draft wording (for the owner's exact-text approval)

- **Section 7, new last paragraph:**
  > Keep three questions apart: whether a seller's review display can be audited, whether each review reflects a real
  > buyer, and whether the product works; an answer to one settles neither of the others. Record each review's
  > provenance (seller-curated, embedded testimonial, independent platform, imported or syndicated, email- or
  > order-verified, incentivized, unknown) and compare displayed totals with the texts actually read; a failed "load
  > more" or an empty review feed is an access boundary, not evidence of fabrication. Before reading a cross-platform
  > mismatch as manipulation, check imports, order-ID eligibility, earlier product IDs and migrated testimonials.
  > Weigh specific firsthand reports (symptom or function, duration, co-exposures, stop and restart, objective
  > measures) above content-free praise, in both directions: they can raise the probability that some buyers benefit,
  > never establish how many or how much. A questionable review practice and a working product are compatible.
- **Regression case `ReviewProvenanceVersusEfficacy`:**
  > A supplement seller's widget claims 600 reviews but shows five old five-star testimonials and returns nothing for
  > the rest; a buyer app shows 490 ratings with generic praise, a few detailed improvements and some nonresponse, and
  > excludes imports without order IDs: explain the incomplete corpus and the different verification rules, allege no
  > fraud from the mismatch or the empty feed, keep both detailed positive and negative buyer reports as low-certainty
  > signals, and give no buyer benefit percentage or efficacy conclusion.
- **Revision entry:**
  > Owner-approved, question 82 (2026-10-12): the shopping module keeps review auditability, reviewer genuineness and
  > product efficacy apart, records review provenance against the texts actually read, reconciles platforms before
  > reading a mismatch as manipulation, and weighs specific firsthand reports in both directions, with a regression
  > case.

## Owner items

1. Question 82: this wording. A: as drafted; B: change a wording; C: decline, with your reason.
2. The release question, after the build. It stacks with question 78's Universal change if both are approved.
