# Product reviews as community evidence (owner question 30)

Date: 2026-10-03. Status: **exact text on the owner questions page as
question 30**; built on `claude/forum-review-platforms-20261003`, stacked on
`claude/protocol-changes-20261003` (#273). Nothing merges until the owner
answers.

## Owner outcome

On 2026-10-03 the owner pasted, without words of their own, an "AskRigor
Forum Signal review-platform repair" in twelve items: treat consumer review
platforms such as Amazon as first-class community evidence for products
people buy, record review counts and how reviews were chosen, deduplicate
across listings, label review sources, keep carers' observations as their
own cohort, add receipt fields and regression tests, keep acquisition
provider-agnostic, and keep HRP's independence rule. It also said not to add
a parallel Amazon module, and that `NoForumSignalByProxy` is too coarse for a
parent reporting on a child with ADHD.

A protocol change needs the owner's approval of its exact text, and pasted
text is acted on only as far as the owner's own message asks. So the change
is built on a branch and comes to the owner as question 30.

## Where each item went (HRP 20.6.10)

Merged into the rule that already covers each concern, as the owner asked
for question 27; two new rules only.

| Item | Edit |
|---|---|
| 1, 2. Review-platform trigger and mapping before sampling | `PrincipalPlatformMapping` (appended); module acquisition step 1 |
| 3. Product versus ingredient, label check | `ScopeAxesBeforeSampling` (appended), pointing to `CompositeInterventionAttribution` |
| 4. Symmetric review-text search | `DirectionalSearchSymmetry` (appended); the ADHD terms are in a stress case |
| 5. Top, keyword and snippet reviews are discovery; counts and selection | new `ReviewCorpusSelectionAndCounts`, after `SnippetAndPartialAccessTier`; `ModuleOutputs` reports the counts |
| 6. Deduplication across variants and listings | `UniqueFirsthandUnit` (appended) |
| 7. Evidence classes and incentives | `CommercialAndCommunityBias` (appended) |
| 8. Caregiver cohort | `NoForumSignalByProxy` (one sentence) and new `CaregiverObservedCohort` |
| 9. Receipt fields beyond YouTube | module `review_platforms` receipt; `finalize_research` `review_corpora` |
| 10. Regression tests | stress cases `ProductReviewCorpusForSupplementQuestion`, `ParentReviewOfChildOutcome`; FS210, FS211; tests below |
| 11. Provider-agnostic acquisition | `ClosedPlatformAndAccessDisclosure` (appended): "an authorized structured route", no provider named |
| 12. HRP independence rule kept | `MultipleIndependentCommunities` and the attribution rules unchanged, checked byte for byte |

## Departures from the paste

- **Reviewer identity.** The paste deduplicates by reviewer and review IDs.
  The rule allows names, handles and IDs only for matching within the
  analysis and says never to report or save them, as AskRigor already does
  for commenters.
- **Direction frames.** "Keyword" is split: every review mentioning the
  condition is a frame not chosen by outcome, so it may show a direction;
  reviews found by outcome words may not
  (`DirectionLabelsNeedOutcomeNeutralSelection`, HRP 20.6.9).
- **Server check.** `finalize_research` takes `review_corpora` for a
  `review_site` entry: the product, reviews shown and read, and how they were
  chosen. A top-ranked, outcome-word or other partial set adds a caveat the
  answer must carry: the reviews show which experiences people report, not
  how common each is.

## Verification

- `tests/fixtures/protocol-edits/2026-10-03-forum-review-platforms.json`: 13
  exact edits; the HRP chain test undoes them to 20.6.9's bytes
  (`0a4cb419…`).
- `tests/forum-review-platforms-2026-10-03.test.ts`: placements, the
  privacy sentence, no provider named, unchanged independence rules, cases
  and checks, and the module receipt's selections matching the server's.
- `tests/research-finalization-gate.test.ts`: review corpora, the partial-set
  caveat, and the counts sent back.
- Privacy data map: the `community_searches` entry names the review counts
  and product; both are public and processed for the call only.
- `npm run verify` on the branch.
