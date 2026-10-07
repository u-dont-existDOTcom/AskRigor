# Exact product identity, whole-intervention identity and destination-bound shopping (owner requests, 2026-10-07)

Branch `claude/exact-product-identity-20261007`. Nothing merges or deploys without the owner's approval on the owner
questions page. Protocol text changes go to the owner as exact text.

## Sources

Two items in the UDA suggested-fix lane (`suggested-fixes/AskRigor/`), both owner requests filed by the ChatGPT
research-supervisor session from a male-vitality botanical research task:

- `2026-10-07-whole-intervention-identity-and-destination-shopping.md` (filed 04:48 UTC);
- `2026-10-07-item-level-community-product-identity.md` (filed 12:42 UTC), which extends the first item's product
  identity check to each review or comment.

## Owner outcome

1. When a study of a multi-ingredient or coded intervention reports a large practical effect, the intervention itself
   is traced (study label, registry code, sponsor or maker, formulation, current commercial product) before its
   ingredients are ranked. Example: the eight-herb trial product SHL 1046 and its close current descendant, SAVA
   Herbals MUSSK.
2. Community evidence about a named product counts only when each item is about that product. A search for SAVA
   Herbals MUSSK must not admit a SAVA Livstar video or an unrelated MUUCHSTAC face-wash video. A review on a page for
   Tianjin Lisheng Nan Bao that says it used Jilin Changhong Nan Bao is another variant's evidence, not Lisheng's.
3. A buy option in an answer is bound to the user's destination and to a live offer there. A domestic-only retailer
   can show identity, label, reviews or price, but is not presented as a place to buy unless its route to the
   destination is verified. When the domestic path fails, the search continues through international routes before a
   bounded no-result.
4. Silence about a little-used product is underexposure, not evidence of no effect. HRP 20.6.11 already has this
   (ExpectedObservabilityOfRealWorldTrace, owner question 40), so this plan adds nothing for it.

## What exists today (main c27ff3e)

- `audit_youtube_community` audits the comments of the first provider-ranked videos for each query, with no identity
  check. YouTube's search matches loosely, which is how the Livstar and MUUCHSTAC videos entered the MUSSK corpus.
  `survey_youtube_community`, `search_youtube` and `audit_youtube_video_community` have no identity check either.
- `finalize_research` requires the buyer-review lane for a product people buy (`commercial_review_applicability`,
  #285). `review_corpora` names the exact product and variant per review site, but nothing checks each review.
- HRP keeps the exact product and its ingredient as separate cohorts (ScopeAxesBeforeSampling,
  CompositeInterventionAttribution). It has no rule that promotes a whole tested intervention to its own candidate.
- Universal's shopping section says listed is not orderable (OrderabilityInvariant), but nothing binds an offer to
  the user's destination, and nothing in the final check enforces it.

## Design

Pattern matching decides only exact, structural questions here. Whether a video or review is about a product is a
judgment, so the model declares the product's names and the server checks exactly whether those names appear in the
provider's own metadata or text. The declarations below are the model's; the server checks their consistency and the
receipts they cite.

### 1. Product identity in the YouTube tools

Optional input `product_identity` on `audit_youtube_community`, `survey_youtube_community`, `search_youtube` and
`audit_youtube_video_community`:

- `names`: the exact product name as its label or maker writes it, plus documented aliases and other-script forms
  (1 to 6);
- `maker_names`: brand or maker names, given when several makers sell a product under this name (0 to 6);
- `other_variant_names`: names that mark another product or maker, such as sibling products or other manufacturers of
  the same formula (0 to 12).

Matching: NFKC, lowercase, every run of non-letter or non-number characters becomes one space, in both the names and
the text. A name matches at token boundaries, except on an edge whose character belongs to a script written without
spaces (Han, Hiragana, Katakana, Hangul, Thai, Lao, Khmer, Myanmar, Tibetan), where no boundary is needed. The text is
the video's title, description and tags as the provider returned them to the server.

A video's class:

| Names found | Class | Admitted |
| --- | --- | --- |
| no product name | `other_product` | no |
| product name and another variant's name, no maker name | `other_variant` | no |
| product name, maker name and another variant's name | `mixed_variants` | yes |
| product name; maker names declared but none found | `variant_unresolved` | yes |
| product name; maker found or none declared; no other variant | `exact` | yes |

- `audit_youtube_community` skips videos that are not admitted and continues down the same provider ranking until
  `max_videos` are admitted. It lists the skipped videos with their class.
- `survey_youtube_community` and `search_youtube` mark each video's class. The survey's candidates hold only admitted
  videos, and it lists the others separately.
- `audit_youtube_video_community` refuses a video that is not admitted, with a plain explanation. Without
  `product_identity` it can still be audited as general community evidence.

Each comment and reply in an admitted video gets a class too:
- it names another variant and no maker name: `other_variant`;
- it names a maker name and no other variant: `exact`;
- it names both: `variant_unresolved`;
- it names neither: it inherits the video's class (`exact` stays `exact`; `variant_unresolved` and `mixed_variants`
  give `variant_unresolved`).

Each video reports how many comments fall in each class. The receipts carry the product (its first normalized name)
and the admitted videos by class.

### 2. finalize_research declarations

These follow the `commercial_review_applicability` pattern.

- `community_findings.product_corpora`: needed when `commercial_review_applicability.status` is `required` and
  `community_findings` is present. One entry per listed product:
  - `product`;
  - `video_ids`: possibly empty;
  - `exact_product_signal`;
  - optionally `variant_unresolved_signal`.

  Each video must be covered by a comment-audit receipt for that product (the receipt's product name occurs in the
  product's label) that admitted it.
- `review_corpora[].item_identity`: `{ exact_product, variant_unresolved, other_variant_excluded }`. It is required for
  every review corpus, and the three counts must add up to `reviews_read`.
- `intervention_identity`, needed when `key_sources` is not empty, has two forms:
  - `not_applicable`, with a reason;
  - `checked`, with interventions. Each intervention has `study_ids`, which must be among `key_sources`; the study's
    `label`; and a `status` of `resolved` (with an `identity`: registry code, sponsor or maker, current product) or
    `unresolved`.

  An unresolved intervention adds a caveat: the exact product tested was not traced to a current product, so the
  answer does not present it as something to buy.
- `shopping`, needed when `commercial_review_applicability.status` is `required`, has three forms:
  - `not_requested`: no offers;
  - `buy_options`: a `destination` and offers;
  - `no_live_option_found`: a `destination` and `routes_searched`, at least three of international storefronts,
    marketplaces, exporters, specialist sellers and secondary marketplaces.

  Each offer has a `product`, a `url`, an `offer_state` and a `role` (`buy_option` or `context`). The offer states
  are `identity_only`, `domestic_orderable`, `international_storefront`, `destination_confirmed` and
  `live_destination_orderable`.
  - A `buy_option` must be `live_destination_orderable`, and its link must appear in `answer_draft`.
  - `no_live_option_found` adds a caveat that no seller with a live offer for the destination was found.

### 3. Protocol text (owner approval of exact text)

- HRP: a whole-intervention identity rule next to CompositeInterventionAttribution; item-level product identity in
  ScopeAxesBeforeSampling; stress cases for the four regressions.
- Universal: destination binding in the shopping section (OrderabilityInvariant and the pre-endorsement gate).

## Tests

- **YouTube:** a MUSSK audit whose provider ranking holds a SAVA Livstar video and a MUUCHSTAC face-wash video
  admits neither and audits the next matching video.
- **Nan Bao:** a Lisheng audit in which one comment names Changhong marks that comment `other_variant`.
- **Scripts without spaces:** a Chinese name (男宝) matches without spaces.
- **Review items:** a Lisheng review corpus with one Changhong review must count it in `other_variant_excluded`, and
  counts that do not add up are refused.
- **Intervention:** a coded multi-herb key study must be declared, and an unresolved one adds its caveat.
- **Shopping:** an India-only retailer declared `domestic_orderable` is refused as a buy option for a user outside
  India; `no_live_option_found` with fewer than three routes is refused; a buy option missing from the answer is
  refused.
- **Endpoint:** every rule through the real MCP endpoint, as in #285.

## Limits

- A video counts as being about the product only when its title, description or tags name it. A video that discusses
  the product without naming it there is left out; one that names it only in passing is let in, and the model still
  reads it.
- A comment that names no maker inherits its video's class.
- `item_identity`, `intervention_identity` and `shopping` are the model's declarations. The server checks that they
  are consistent and that their links appear in the answer; it does not check them against the web.

## Status

| Step | State |
| --- | --- |
| Lane items read, plan written | Done (2026-10-07) |
| Server changes (sections 1 and 2) | Implemented locally (2026-10-07); awaiting Claude's review |
| Protocol text (section 3) | Exact text to the owner |
| Endpoint acceptance, release | Local MCP regression acceptance passed (2026-10-07); external acceptance/release after review and owner approval |

## Implementation

- Shared matching, video/comment classes and receipt claims: `packages/sources/src/product-identity.ts`, with
  exports and classified record fields in `packages/sources/src/index.ts` and `packages/sources/src/youtube.ts`.
  Tool integration: `apps/research-mcp/src/youtube-community-audit.ts`, `youtube-community-survey.ts`,
  `youtube-video-community-audit.ts`, `youtube-audit-continuation.ts`, `youtube-mcp-sample.ts`, and `register-tools.ts`.
  Declaration checks and reporting: `apps/research-mcp/src/research-finalization-gate.ts`.
  `apps/research-mcp/src/gemini-tool-catalog.ts` compacts schema prose and constraint hints to preserve its existing
  catalog size limit while retaining the new inputs. Updated `docs/privacy-data-map.md` and regenerated
  `docs/tool-inventory-v0.1.0.json`; the standard catalog remains 33 tools.
- New tests: `tests/product-identity.test.ts` (Unicode normalization, both boundaries, all nine no-space scripts,
  all video/comment table rows and bounded receipt claims); `tests/youtube-product-identity.test.ts` (MUSSK
  exclusions, full descriptions, survey/search classifications, Nan Bao comments/replies, continuation binding
  and cumulative counts, refusals and MCP receipts); `tests/finalize-product-identity-and-shopping.test.ts`
  (review counts/exclusions, product-bound comment receipts, intervention identity, all offer states, destination,
  answer links and bounded shopping routes; each rule also through MCP). Existing fixtures/descriptions updated in
  `tests/finalize-product-review-requirement.test.ts`, `research-finalization-gate.test.ts`, `mcp-tools.test.ts`,
  `findings-save.test.ts`, and `analysis-staging.test.ts`.
- Validation: final `npm run verify` passed: typecheck and build passed; 208 test files passed and 1 skipped;
  2,367 tests passed and 6 skipped. Verification used Node 24.18.0, an external-socket guard, and loopback test servers. No external network or commits. Live GitHub bootstrap and lesson-queue status were
  unavailable under the owner's no-network constraint; no queue counts were inferred. Section 3, external
  acceptance and release remain with the owner/review process.
