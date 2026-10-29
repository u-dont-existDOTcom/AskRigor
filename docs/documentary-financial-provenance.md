# Source-level financial and citation-provenance checking

Status: development addition, not deployed. Reuses AskRigor's video relationship inventory and existing `finalize_research` gate. **No new MCP tool, no modification of frozen tools/list, no public policy or clinical-evidence standard changed.**

## Existing controls reused

The extractor already separated outside paid placements, affiliates, gifts, own products, declined offers, study funding and explicit qualifications. It already treated model-read video claims as leads, not evidence. The finalizer already enforced source read depth and full-text method checks for treatment effects. These remain intact.

## Narrow extension

The video extractor recognizes `creator_product_advisory`, `research_author_employment_or_equity`, and `patent_or_licensing_interest`, plus `relationship_scope` (`this_content`, `creator_other_business`, `underlying_study`, `unknown`) and an exact/blank `quote`. The extractor is limited to what the video actually said or displayed; it does not search company websites or infer contract terms, compensation, equity or personal sponsorship from an advisory role. Legacy records with missing scope/quote default to **unknown/blank**, never paid.

`finalize_research` also accepts the optional newer input at `later_inputs.documentary_evidence`. This records a **documentary relationship assertion**, not a trial effect. Each item gives:
- `relation`, `relationship_scope`, and `source_type` (publisher paper, company webpage, register, creator statement, publisher-indexed excerpt or other);
- `source_read_depth` (`section_read`, `excerpt_only`, `not_read`) and `source_url`;
- `source_section` and short exact `source_quote`;
- `evidence_state` (`documented`, `bounded_not_found`, `unverified`), exact answer `answer_quote`, and `coverage_limit` for unknown/absence claims.

Deterministic checks ensure the answer's visible prose contains the asserted sentence and a genuine Markdown destination for the declared source, disallow a documented claim with unread or unquoted evidence, warn that not finding a relationship does not prove its absence, and reject a paid-video categorization when the only declared scope is a separate business role. Study funding must remain `underlying_study`. The finalizer **always adds a limitation that these source readings are model-declared and are not authenticated by its own acquisition receipts**. Thus this does not claim the host paper/company page is genuine.

Other existing clinical `key_sources` checks remain independent; a documentary record **does not validate medical efficacy**, produce a study audit receipt, or authorize a saved findings card. A mixed biomedical-and-documentary answer must meet its biomedical study gates unchanged.

## Synthetic regression cases and expected outcomes

| Case | Admission |
| --- | --- |
| Seller's public page says the creator is its formulation adviser; no contract information | Documented company claim, financial consideration unknown; **not** paid individual video |
| Study paper explicitly says an author is manufacturer-employed | `underlying_study` employment, not creator promotion |
| Study declares patent filing | Patent interest, not automatic royalty or fraud |
| Video says an offer was declined | Declined offer does not imply payment |
| Company-site link only in fenced code or source quotation invisible to reader | Source citation **not** established |
| Paper section not read but declaration says no financial conflicts | No documented negative claim |
| Clinical effect claim accompanies a perfectly cited adviser statement | Study audit still independently required |

Tests include synthetic video relationship/caveat fixtures, schema compatibility with current frozen published MCP tool inputs, documentary claim/visibility, and separate clinical read-depth enforcement. No real person's statements or private records needed.

## Citation-identity check for future work

Before accusing a commentator of a wrong paper or undisclosed funding, reconstruct the **whole article**, including later caveats and update notes. Verify DOI/title/author/version of the study described, then check the primary paper's full funding, competing-interest and acknowledgment sections. Keep the precise source statement separate from interpretation; an extractor's failure to find a section is `unknown`, not `no conflicts`. Cross-link a company's publicly asserted staff/adviser position by **date** before describing disclosure omission in another publication. Sponsor of a scientific trial ≠ paid sponsor of a creator's video. Different preparations/exposures and combined ingredients do not transfer an efficacy result to a consumer product.

## Release and limitations

The new source is a **draft implementation**, not a deployed or enabled production policy. A source-only test pass does not establish production interface or video-model behavior; live video extraction is paid and is not run without spend authorization. Existing owner release permission required before merge, deployment, plugin/package synchronization and live acceptance. If an untrusted external source contradicts its company-stated affiliation, preserve unknown status until independently checked.

Owner outcome remains identifying affordable alternatives with meaningful patient outcomes; provenance checking is supportive error prevention, not a new high-cost influencer-monitoring research lane.
