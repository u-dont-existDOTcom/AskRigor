# Final check: satisfiable next steps, linked key studies, no "not relevant" bypass (UDA lane, owner requests)

Branch `claude/finalizer-contract-20261007`, stacked on #288 (`claude/exact-product-identity-20261007`). Nothing merges
or deploys without the owner's approval on the owner questions page.

## Sources

Three owner-requested items in the UDA suggested-fix lane, filed by ChatGPT reasoning chats on 2026-10-07:

- `2026-10-07-finalizer-must-not-require-unexposed-schema-fields.md`: `finalize_research` asked for
  `commercial_review_applicability`, which that chat's copy of the tool list did not contain. The chat could not satisfy
  the step.
- `2026-10-07-canonical-source-links-must-survive-final-output.md`: an answer cited studies only as "PMID 34285282",
  although AskRigor's tools had returned their PubMed pages.
- `2026-10-07-forum-trigger-cannot-be-bypassed-by-not-relevant.md`: an answer comparing apple pectin with clinoptilolite
  as binders declared `community_evidence: not_relevant` (`no_real_world_outcome`) and passed.

## Why this goes before the next release

ChatGPT keeps a conversation's or connector's copy of AskRigor's tool list. #288 and #289 add five declarations the
final check requires: `product_corpora`, `item_identity`, `intervention_identity`, `shopping` and `scale_results`.
Without this fix, every chat holding the older list would meet next steps it cannot satisfy: the loop in the first
report, times five.

## Design

### 1. Every next step is satisfiable

- When a required declaration is missing, its next step names the field. Once per result, it also adds: if this
  chat's AskRigor tool list has no such field, the list is outdated, and refreshing the AskRigor connector in the app's
  settings and starting a new chat loads the current one. A user action is a legitimate route when the field truly
  cannot be sent.
- `finalize_research` output gains `contract: "2026-10-07"`, the server's input contract version, so a mismatch is
  visible. `get_protocol_manifest` reports the same value.
- **Contract test (CI):** run the gate over the existing fixture corpus and collect every `next_steps` text. Each
  snake_case identifier in them must be one of:
  - an input property of `finalize_research`, at any depth of its JSON schema;
  - an enum value in that schema;
  - a registered tool name;
  - an output field the step refers to (an explicit, reviewed allowlist).

  Any other identifier fails CI. A next step that names a field the tool doesn't accept can no longer ship.

### 2. Key studies are linked in the answer

With `answer_draft`, each `key_sources` entry needs at least one link in the answer's visible prose whose target
contains its identifier. The identifiers are:

- the PMID, as in `pubmed.ncbi.nlm.nih.gov/<pmid>` or `europepmc.org/abstract/MED/<pmid>`;
- the DOI, as in `doi.org/<doi>`, or in a URL path;
- the PMCID, as in `pmc.ncbi.nlm.nih.gov/articles/<pmcid>` or `europepmc.org/article/PMC/<pmcid>`;
- the DOI the PubMed receipt gives for a PMID.

Matching is case-insensitive and URL-decoded. A bare "PMID 34285282" with no such link gives a next step naming the
canonical page form, for example `https://pubmed.ncbi.nlm.nih.gov/34285282/`. URLs are never made up: the model links
what its tools returned. The check reads URLs and identifiers, so it works in any language.

### 3. "Not relevant" cannot cover a practical comparison or a product

`community_evidence: not_relevant` with basis `no_real_world_outcome` is refused when any of these holds:

- `treatment_choice` is `compared`;
- `commercial_review_applicability.status` is `required`;
- `shopping.status` is `buy_options` or `no_live_option_found`.

The next step says why: comparing options' real-world usefulness, or a product people buy, needs the community and
buyer-review layer. That layer can be researched, or completed with an access boundary.

`commercial_review_applicability` is also required with `not_relevant` (basis `no_real_world_outcome`) whenever
`key_sources` is not empty, so the product question is always answered.

The basis `emergency_before_triage` is unchanged.

These are exact checks between the model's own declarations. A model that misdeclares `treatment_choice` stays a
limit, which is stated.

## Implementation

- Changed `apps/research-mcp/src/research-finalization-gate.ts` and `register-tools.ts` for the contract, one refresh
  sentence, visible key-study links and declaration-consistency checks. Existing unsendable next-step references
  `rediscovery_leads`, `research_question`, `broad_treatment_choice` and `product_identity` now describe the action
  through a registered tool; internal status codes echoed by diagnostics are rendered as prose.
- Added `tests/finalize-next-steps-contract.test.ts` and `tests/helpers/finalize-next-steps-contract.ts`. The test names
  cover schema-derived identifiers, version skew, missing product declarations, PMID/DOI/PMCID links (including
  raw and URL-encoded parenthesized DOIs), receipt-derived
  DOI links, hidden links, French answers, the apple-pectin comparison, the mechanism exception, commercial/shopping
  contradictions, access-boundary completion and emergency triage. Each rule also runs through a loopback HTTP MCP
  endpoint. The helper checks next steps throughout the existing finalizer fixture suites.
- Adjusted study-link fixtures in `tests/research-finalization-gate.test.ts`, `finalize-product-review-requirement.test.ts`,
  `finalize-product-identity-and-shopping.test.ts`, `finalize-scale-results.test.ts`, `findings-save.test.ts` and
  `analysis-staging.test.ts`; mechanism fixtures also declare noncommercial applicability. Existing comparison
  fixtures already declare `researched`, so none paired `not_relevant` with `compared`. The three review-applicability
  bypass fixtures now explicitly exercise the unchanged `emergency_before_triage` exception. Existing diagnostic
  assertions exclude the separately tested refresh sentence, and findings-card expectations include it.
- Updated pinned descriptive text in `tests/mcp-tools.test.ts` and the new contract suite. After `npm run typecheck`,
  regenerated `docs/tool-inventory-v0.1.0.json` with `npx tsx scripts/generate-tool-inventory.mts --write`: 33 tools.
- Validation: `npm run verify` passed on Node 24.18.0 (211 test files passed, one skipped; 2,559 tests passed,
  six skipped; typecheck and build passed). `git diff --check` passed.
- No protocol edits, external network, commits, merge or deployment. The requested local implementation is complete;
  live UDA bootstrap and GitHub lesson-queue status were unavailable under the owner's no-network restriction.
  Scientific applicability remains the model's declaration, as specified above.

## Tests

- **Contract test:** the corpus scan; and a version-skew test, where a request without the newer fields gets next steps
  that each name a schema field and carry the refresh hint once.
- **Links:** PMID-only fails; a PubMed link passes. DOI-only, PMCID, a PMID whose DOI link comes from its PubMed
  receipt, and an answer in another language are covered too.
- **Applicability:** the apple pectin versus clinoptilolite comparison with `not_relevant` fails. The clinoptilolite
  ion-exchange mechanism question with `not_relevant` passes.
- **Endpoint:** each rule through the real MCP endpoint.

## Status

| Step | State |
| --- | --- |
| Plan | Done (2026-10-07) |
| Implementation | Codex, then Claude's review |
| Release | With #288, owner question |

## 4. Buyer reviews are searched for the outcome, not just previewed (lane item of 2026-10-08)

Source: `2026-10-08-targeted-health-product-review-audit-enforcement.md` (owner request). A supplement's iHerb page showed
about 65,000 star ratings. The answer read 10 default first-page reviews and never searched the review text for the
outcome (fibrosis, FibroScan, ALT/AST, liver enzymes, or their failure). It still presented that as a product-review
audit. HRP already requires the search (DirectionalSearchSymmetry, ReviewCorpusSelectionAndCounts); the final check did
not enforce it.

Each `community_searches[].review_corpora[]` entry gains these fields:

- `outcome_search`: `{ queries: string[] (1 to 12, each 1 to 200 characters), directions: ("benefit" | "no_effect" |
  "worse" | "adverse" | "stopped")[] (1 to 5, unique) }`. These are the searches run in the site's review text, in
  the reviewers' everyday words and languages.
- `outcome_search_boundary`: `"no_text_search" | "search_blocked" | "login_required"`, when the site offers no
  review-text search or it could not be used.
- `ratings_shown`: an optional integer, the star-rating count. It stays separate from `reviews_shown`, the written
  reviews.

These are the rules:

1. Each review corpus needs exactly one of `outcome_search` or `outcome_search_boundary`. A missing one is a missing
   declaration: it gets the refresh hint, and its next step names both fields.
2. `outcome_search.directions` must include `benefit`, `no_effect`, and `worse` or `adverse`. The next step names the
   missing directions.
3. With `outcome_search_boundary`, a required limit and caveat: "On <community>, the reviews of <product> could not be
   searched for the outcome, so the <reviews_read> read are a preview, not a measure of how often it helps or harms."
4. Selection `ranked_first` (or another partial frame) without `outcome_search` gets that same preview caveat.
5. The corpus's must_report line states the denominators: star ratings when given, written reviews shown, reviews read
   and their selection, and the outcome-search directions or the boundary.

These are exact checks on the model's declarations. Whether the queries really ran stays the model's declaration, a
stated limit. Tests:

- the iHerb case: ratings shown, 10 reviews ranked first, no outcome search, which gets a next step;
- the same with `outcome_search_boundary`, which passes with the preview caveat;
- a full three-direction search, which passes with no preview caveat;
- missing directions;
- ratings and written reviews kept apart in must_report;
- the real MCP endpoint;
- the contract test still passing.

## Implementation (section 4)

- Changed `apps/research-mcp/src/research-finalization-gate.ts` for the search-or-boundary declarations,
  directional checks, required preview limit/caveat, separate rating and written-review denominators in
  `must_report`, and the stated limit that searches remain the model's declaration.
- Added `tests/finalize-review-outcome-search.test.ts`, running the rules through the gate and a loopback HTTP MCP
  endpoint. Test names include "blocks the iHerb first-page preview without outcome_search or outcome_search_boundary",
  "accepts %s with the required preview caveat", "accepts benefit, no_effect and %s without a preview caveat",
  "names missing directions: $missing", "refuses both the outcome search and its boundary",
  "requires the preview caveat for %s without outcome search", "requires a search declaration for every corpus,
  including all written reviews", and "keeps star ratings apart from written-review denominators and omitted counts".
  Input-contract tests cover multilingual queries, bounds, unique directions and integer rating counts.
- Adjusted review-corpus fixtures in `tests/finalize-product-review-requirement.test.ts`,
  `tests/finalize-product-identity-and-shopping.test.ts`, `tests/research-finalization-gate.test.ts` and
  `tests/finalize-next-steps-contract.test.ts` with the minimal `outcome_search` declaration for `benefit`, `no_effect`
  and `worse`. The contract suite also pins the new descriptive field text and published identifiers.
- After `npm run typecheck`, regenerated `docs/tool-inventory-v0.1.0.json` with
  `npx tsx scripts/generate-tool-inventory.mts --write` (33 tools).
- Validation: `npm run verify` passed on Node 24.18.0: 213 test files passed, one skipped; 2,611 tests passed,
  six skipped; typecheck and build passed. The next-step contract suite and `git diff --check` passed.
- No protocol edits, external network or commits. Live UDA bootstrap and lesson-queue status are unavailable under
  the owner's no-network constraint; no queue totals are inferred.
