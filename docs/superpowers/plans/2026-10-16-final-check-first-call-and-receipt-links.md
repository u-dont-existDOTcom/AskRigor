# Final check: first calls that pass ChatGPT's connector, and key-study links AskRigor's receipts tie

## Authority and scope

- The owner regression run of 16 October 2026 (build `5c4fc93`, HRP 20.6.25, Universal 20.5.43), run through Codex
  with the refreshed ChatGPT app; its record is release-record pull request #339. The owner questions page lists the
  fixes it points to under "Coming up" (server only, no protocol wording; default: built as their own pull request,
  then a release question).
- The server changes need no protocol wording. Owner question 103 (the corrected FormSpecificForumReports stress
  case) was answered "103 a" while this was built, so HRP 20.6.26 joins it; Universal stays 20.5.43.

## Evidence

1. **Connector rejections.** Of 101 `finalize_research` calls in the 21 answers (with the r324 rerun) and 17 in the
   four-turn #336 test, 39 and 3 were rejected by ChatGPT's connector schema validation before reaching AskRigor,
   including 20 of the 21 first calls in the regression list (all but q79's). The rejection text shows the model the
   first three errors and a count of the rest, so `full_text_search` came first in most of them. The complete error
   lists show the first calls rejected for `findings_card` (15), `intervention_identity` (14), `full_text_search`
   (13), `community_searches` (12), five fields twice each and three once; only one first call failed on
   `full_text_search` alone. Most runs whose check did not pass stopped at the budget of about 60 calls (8 of 9 in the
   first 17 judged).
2. **What the model sees.** Read-only Codex probes (16 October, 21:50 to 21:58 UTC, no AskRigor call) asked the model
   to copy its definition of `finalize_research` once the AskRigor skill had loaded the app's tools. It sees the
   tool's own description in full and a TypeScript-like type with no parameter description at any level. The
   two-branch `oneOf` of `full_text_search` is `unknown`, and so is every object or array nested below the second
   level: `intervention_identity.interventions` items, `findings_card.findings` items, and a community search's
   `queries`, `threads_read`, `report_identity` and `review_corpora`. Every rejected field lies in such a hidden part
   (`studies` lists, comparison `arms`, a scale's `range`, `values` and `benchmark`, a mechanism's `tissue`) or breaks
   a limit the type does not show (`answer_marker` up to 80 characters, `another_pass_estimate` up to 200,
   `answer_language`'s tag pattern). The invented `coverage` copies `search_europe_pmc`'s `full_text_scope.coverage`
   output.
3. **Key-study links (#336, turn 4).** Two key studies were audited from Europe PMC copies, whose receipts tie each
   DOI to its PMID and PMCID. The answer linked both studies' publisher pages from the AI's own web search, and those
   are exactly the pages the DOIs are registered to (Crossref's `resource.primary.URL`, which is also the DOI handle's
   URL). The check answered "has no link in the answer" four times; the model kept the links and explained them in the
   answer instead. A Europe PMC link would also have been refused: a DOI was tied only to the PMIDs of PubMed records.
4. **Report identity.** l30 sent a community's `report_identity` as one object; the type shows it only as `unknown`.

## Recurring-finding check

- **First calls rejected by the connector.** The class is a declaration shape the client hides from the model, not
  one field. A description on `full_text_search` itself would not reach the model (no parameter description is shown),
  and fixing that field alone would have let one more first call through. The mechanism fix: flatten the two top-level
  unions the type collapses, put the literal shape of every hidden part, and the three hidden limits, in the one text
  the model sees (the tool's description), generate that text from examples the schema parses, and test that every
  hidden part of the published schema is covered, so a later nested field cannot silently reopen the class.
- **A link to the right paper that the check cannot tie.** #337 tied PubMed pages; #336 found publisher and Europe
  PMC pages. The mechanism fix ties every identifier and URL that AskRigor's own receipts bind to the paper, never a
  host list, and names the refused link and the pages that count, so a model that kept its link knows why.

## Changes

1. `full_text_search` and `lab_preparation` become one object each: `status` plus the optional `queries` or `reason`
   (`answer_quotes` or `reason`). The final check asks for the field the status needs, as the declaration step it
   already uses, and leaves the other field unused. Every previously valid value stays valid.
2. `finalize_research`'s description gains one descriptive passage: the JSON of every part the type hides, built
   from typed examples, and the hidden limits.
3. `community_searches[].report_identity` accepts one object, normalized to a one-item list.
4. **Receipt-bound links.**
   - Identifiers: the DOI, PMID and PMCID that a PubMed record, a full-text reading or a study or review audit names
     together identify one paper; a link with any of them counts. A lead receipt's PMCID is left out, since no copy
     confirmed it.
   - URLs: `resolve_doi` returns the DOI's registered landing page and signs it with the DOI in a new
     `doi_resolution` receipt; full-text readings and audits sign the URL of the copy AskRigor fetched (not a
     search-index copy the AI supplied, and not candidate URLs, which were never read). Links are compared as the
     check compares thread links.
   - When the line with a study's label links something its receipts do not tie to it, one step names that link and
     the pages that count, and offers `resolve_doi` for the publisher page.
5. Documentation: the privacy data map (the landing page and its receipt; the copy's URL in full-text receipts), the
   tool inventory, and this plan.
6. HRP 20.6.26: stress case FormSpecificForumReports replaced word for word with owner question 103's text (its first
   version said both that no one in the thread took form A and that one person did), with one revision entry and
   nothing else changed; built like 20.6.25 (`86a6b9c9`), with a reversible edit fixture chained from 97-99, the
   approved text tested word for word and in place, and every current pin moved. The same correction goes into
   `docs/owner-regressions.md`'s lesson #30 row.

7. **The owner's first look at the panel in ChatGPT** (16 October, 21:29 UTC; added at the parent session's request):
   - the lane lines carried instructions meant for the model ("Then copy the sentences that report it into the
     entry's answer_quotes"): `must_report` keeps them for the model, and the tool result's `_meta` carries the
     panel's copy without them (`mustReportFindings`, which removes only the gate's own instruction sentences).
     OpenAI's Apps SDK reference says a result's `_meta` reaches the component and is hidden from the model; MCP
     Apps passes the whole result to the panel;
   - the findings card shows only when it was checked or rejected, in plain words;
   - a not-ready panel says "This answer was given before AskRigor's final check passed.";
   - the "CSP off" badge: its meaning is unverified. The panel's resource declares ChatGPT's dedicated origin under
     OpenAI's own key, `openai/widgetDomain`, from the configured resource URL. `ui.domain` stays unset: Claude
     accepts only its hashed `claudemcpcontent.com` form there and shows an error instead of the panel otherwise
     (Claude's MCP Apps troubleshooting guide). The owner checks after release whether the badge goes.
8. **Universal's correction-report rule** (owner question 78; the 16 October lemon conversation said "You're right"
   and offered no report): `corrections[].by_user` declares whether the user pointed the error out, and after such a
   correction the answer must carry the question `CORRECTION_REPORT_OFFER`, a fixed sentence checked like the other
   caveats (in the answer's language through `caveat_renderings`). It rests on the model's declaration, and whether
   the answer also shows the report it would send stays the model's.

## Tests

- The published schema has no `oneOf` for the two flattened declarations; each status without its field gets the
  declaration step; old values pass as before.
- Every example in the description parses with the schema at its path, and every hidden part of the published input
  schema (objects and arrays below the second level, and any `oneOf` or `anyOf`) appears in the passage.
- `report_identity` as one object is accepted and counted as a one-item list.
- Links: Europe PMC, PMC and PubMed pages count once a receipt ties their identifier to the DOI; a lead receipt's
  PMCID does not; a publisher page counts after a `doi_resolution` receipt and is refused, by name, without one; the
  untied-link step replaces the two steps it used to cause.
- `resolve_doi` signs the landing page; full-text receipts carry the fetched copy's URL and never a search-index or
  candidate URL.

## Not changed

- `SERVER_INSTRUCTIONS`, Universal, HRP apart from the one stress case, and the Gemini catalog (it omits
  `finalize_research`; `resolve_doi`'s inputs and description are unchanged).
- A declaration the model leaves out is still invisible to the check, and sources without a DOI, PMID or PMCID
  (ResearchGate pages, conference abstracts) still cannot be checked.

## Validation and release

`npm run verify`, then CI on the pull request. Merge and deploy wait for the owner's typed answer to the release
question on the owner questions page.
