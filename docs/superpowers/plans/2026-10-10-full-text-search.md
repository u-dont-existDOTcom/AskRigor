# Full-text search when the answer is not in abstracts (owner request, 2026-10-10)

## Authority and scope

- **Owner, 2026-10-10:** "yes draft the plan for that", after a brainstorm on when to search full texts instead of
  searching abstracts and then reading the papers found.
- This is a plan only. The HRP rule comes to the owner as exact text before anything ships.
- Related open lesson candidates (lesson queue, 2026-10-09), not in scope here: #17 on conditional-subgroup nulls,
  and #20 on clinician endorsements.

## Why

Abstract-first discovery finds a study's main question reliably: PubMed holds about 41.2 million records, nearly
all with titles and most with abstracts. It misses evidence that is reported only in the body of a paper.

Europe PMC example, measured 2026-10-10: 12,305 records mention levodopa in the abstract but not carbidopa. In 905
of them carbidopa appears in the full text, and in 305 of those in the methods. This is the owner's L-dopa case of
2026-10-07, where the "L-DOPA" condition was really L-dopa plus carbidopa.

The answer often sits outside the abstract for:

- harms and adverse events, often reported only in results tables;
- co-interventions, background or rescue treatment, and the comparator's exact makeup;
- an exact product, formulation, dose or schedule;
- secondary outcomes, and results measured but not highlighted, nulls included;
- funding and competing interests, which the independent-versus-sponsored rule depends on;
- details reported only in case narratives;
- records with no abstract (older papers, letters, many non-English papers), and abstract searches that return few
  studies;
- checking that a paper says what a source claims it says.

## Coverage, measured

- Europe PMC searches article sections: `INTRO`, `METHODS`, `RESULTS`, `DISCUSS`, `CONCL`, `TABLE`, `FIG`, `SUPPL`,
  `ACK_FUND`, `COMP_INT`, `CASE`, `REF` and `BODY`. A made-up field returns 0 hits, so the counts are real.
- It holds full texts for about 12.4 million records (`HAS_FT:y`), roughly 30% of PubMed. A section search sees only
  those.
- So finding nothing in a full-text search shows less than finding nothing in an abstract search, and an answer that
  relies on it must say so.

## Design, version 1 (no new tool)

1. **Europe PMC section search:**
   - `search_europe_pmc` already passes the query through, so section fields work today.
   - Its description names them, in descriptive wording.
   - Its output adds `full_text_scope` when the query uses a section field: the sections searched, and the coverage
     note "Europe PMC full texts only, about 30% of PubMed records".
   - Detecting the section fields in a query is an exact, structural check on the provider's field syntax. It is not
     a judgment of meaning.
2. **The AI's own search (plugin):** the HRP rule also points the AI's web search at exact phrases. Google Scholar,
   for example, indexes full texts. Copies it finds go through `candidate_urls` and `candidate_texts`, as now.
3. **Evidence handling:**
   - A full-text hit is a lead until the passage is read in the acquired paper (`acquire_open_full_text`, then the
     audits).
   - A match in an introduction or reference list is not a finding.
   - Absence claims based on full-text search state its coverage. The existing `absence_claims` declaration carries
     that limit.
4. **Final check, through a model declaration checked exactly (the `commercial_review_applicability` pattern):**
   - `full_text_search` is either `run`, with the section queries declared, or `not_needed`, with a reason.
   - For `run`, each declared query must match a `search_europe_pmc` receipt whose query uses a section field.
   - The server never judges whether a trigger applies; the model declares it, and the server checks the
     declaration exactly.
   - The existing refresh hint covers chats with an older tool list.
5. **HRP rule (draft, for the owner's exact-text approval):**
   > FullTextSearchTriggers. Abstracts report a study's main question. Also search full texts when the answer may sit
   > only there: harms and adverse events; co-interventions, background or rescue treatment, and the comparator's
   > exact makeup; an exact product, formulation, dose or schedule; secondary outcomes and unhighlighted null
   > results; funding and competing interests; details given only in case narratives; and when an abstract search
   > returns few studies or a record has no abstract. Use section searches (methods, results, tables, funding, case
   > reports) where the index offers them. A full-text hit is a lead until the passage is read in the acquired paper,
   > and a match in an introduction or reference list is not a finding. State the coverage searched: a full-text
   > index holds only part of the literature, so finding nothing there does not show that nothing was reported.

## Version 2 (later, separate owner items)

- **The owner's library:** InfoAccess `search_articles` for the owner. It costs 10,000 InfoAccess credits per call, so
  it is opt-in per call. For paid accounts it only finds papers, as approved in question 59.
- **Privacy:** that search would send query terms to the library, which the current notice does not cover (it says
  "only the study's DOI"). So version 2 needs new privacy wording first.

## Tests (no network)

- `full_text_scope` is present exactly when a section field is used, including mixed and nested queries, and absent
  for plain or `ABSTRACT` queries.
- Section field detection ignores the same words inside quoted phrases.
- The `full_text_search` declaration: a declared query with no matching receipt is refused; `not_needed` without a
  reason is refused; a receipt without a section field doesn't count.
- The next-step contract test: every step names only published fields.
- The Gemini catalog stays within its byte budget, and the tool inventory is regenerated.

## Owner items

1. Build version 1 as planned.
2. The HRP rule's exact wording, approved before release.
3. The release question.
