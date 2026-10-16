# Lessons #30 and #31: forum reports of one exact exposure, comparisons with their doses, communities the user names, and a final check the reader can see

## Authority and scope

- Lesson candidates #30 and #31 in the private lessons queue, filed 2026-10-16 through the MCP connector
  (`source-connector`), both `needs-review`. Their case details stay in that queue; this public plan describes them in
  general terms.
- **What they report** (one research conversation comparing two chemical forms of a mineral supplement for raising a
  low blood marker):
  - **#30:** a forum discussion was praised as useful although no one in it verifiably took the form in question; a
    report comparing that form with a different kind of supplement was read as evidence that it beats the other form;
    the marker's values in the thread were not kept apart from an effect of the form; no one said that zero qualifying
    reports were found.
  - **#31:** the answer was given without `finalize_research`; a switch between the two forms that also cut the dose
    several-fold was counted as a comparison of the forms; a report that never named the form was included; the two
    communities the user named were not searched; unreadable pages and missing follow-up measurements were not
    reported.
- **Owner decision pending:** owner question 99 (owner questions page, 2026-10-16) proposes the HRP wording below,
  the server checks, and the visible final-check line. The lessons stay `needs-review` and nothing here is built until
  the owner answers (AGENTS.md: unreviewed lessons do not silently expand scope).

## What already covered them

A read of HRP 20.6.24, Universal 20.5.43, the forum module and `finalize_research` at the head of #337 split the two
lessons into 12 requests:

- **Covered and checked (1), only when `finalize_research` runs:** community coverage before concluding
  (`MandatoryTriggeredModuleCompletion`, `NoShortcutCompletion`; the server requires the community decision, the
  principal communities, the dominant one and an independent one).
- **Covered by rules, not checked (6):** firsthand use of the exact form, with unspecified and other forms left out
  (`UniqueFirsthandUnit`, `NoForumSignalByProxy`, `ScopeAxesBeforeSampling`); reading the thread before calling it
  useful (`UnverifiedSpecificsLimitConfidence`); marker values kept apart from outcomes (`ObjectiveSubjectiveSeparation`,
  `ContextExtraction`); zero qualifying reports said (`RelativeForumSignal`); dose-changed switches
  (`DoseExposureComparability`, `NoCrossDoseEvidenceLaundering`, FS220); and calling `finalize_research` (`FinalizeResearch`,
  `ServerCompletionGate`, Universal `canonical_protocol_execution_gate` items 4 and 7).
- **Covered in part (5):** the comparator of a forum report (comparators are named for studies and product reviews
  only); communities the user names (required only in continuing missions, `PrimaryOutcomeContinuity`); harm reports in
  a named community (`DirectionalSearchSymmetry`, with search directions checked only on review sites); pages that
  could not be read (`NoSilentAccessFailure`, checked per community as `access_boundary`); and missing follow-up
  measurements (nothing asks for their count).

On the server, forum threads record only their link, title, how they were chosen, and prose findings. Identity is
enforced elsewhere: study audits declare what each study tested (`intervention_identity`), YouTube comment corpora
separate the exact product, and review sites count each review as the exact product, an unresolved variant or another
variant (`review_corpora[].item_identity`).

## Recurring-finding check

Both lessons repeat classes that were fixed before, so per UDA's recurring-finding check
(`patterns/reasoning-selection.md`) this plan names each class and fixes its mechanism rather than adding a local
exception.

- **Community reports counted as evidence without their identity (#27, then #30 and #31).** The attractor is topical
  relevance read as evidential relevance: a thread about an exposure is taken as evidence about it, and a person's
  switch is taken as a comparison. The fix for #27 recorded how threads were chosen; nothing recorded what each report
  shows. The fix extends the identity count that review sites already have to forum reports, and moves the
  dose-comparability judgment that failed in #31 from the model to a comparison of declared numbers.
- **A research answer given without the final check (issue #326, then #31).** The 12 to 14 October fix was text:
  Universal item 7 and one reminder sentence on every receipt-bearing research result. The check is advisory by
  construction: the connector transport is stateless, the server never sees the answer and cannot hold it back, and it
  keeps no request logs (a privacy promise), so it cannot count skipped checks. Research done only with the client's
  own web search, as forum research is, never receives the reminder. More reminder text has diminishing returns. The
  mechanism that still fits is visibility: every checked answer carries one line produced by the check, so a missing
  line shows the reader, and the owner's regression runs, that the check did not run (owner question 99, part 3). A
  heavier alternative, holding connector research in server-side session state as the Custom GPT's controlled session
  does, would let the server notice a skipped check, but it is a large architectural change and is not proposed now.

## Design

### Protocol (owner question 99, part 1; exact text on the owner questions page)

- `ScopeAxesBeforeSampling`: the comparator as a forum axis; a comparison counts only reports from people who used
  both; a switch that also changed the dose, timing or other treatments shows the combined change.
- `PrincipalPlatformMapping`: every community the user names is searched, or what stopped the search is said.
- `ObjectiveSubjectiveSeparation`: how many firsthand reports gave a measurement after the change, including none, and
  a measurement before the change kept apart from a measured change after it.
- Final check FS234 and stress cases `FormSpecificForumReports` (#30) and `DoseChangedFormSwitch` (#31).
- One revision entry. If owner question 97 is approved too, its rule comes first in the same HRP version.

### Forum report identity (`finalize_research`)

Each `community_searches` entry outside review sites that lists threads read declares, for each exposure the answer
draws on (one to four), `report_identity[]`:

- `exposure`: the exact exposure as reports name it (a form, product, dose or program);
- `reports_read`: firsthand and other reports read in that community about it;
- `firsthand_exact`, `exposure_unclear`, `other_exposure`, `not_firsthand`: people describing their own use of exactly
  that exposure; firsthand reports that do not say which form or product; firsthand reports of something else; and
  advice, hearsay, questions or speculation. They add up to `reports_read`;
- `measured_after`: of the `firsthand_exact` reports, those giving a measurement after the change (a laboratory value
  or test), not only how the person felt.

Exact checks: threads read with no `report_identity` get a declaration step (with the existing tool-list refresh
hint); counts that do not add up, or a `measured_after` above `firsthand_exact`, get a next step; each entry's counts
reach the answer through `must_report`, zeros included; and `firsthand_exact` of zero requires the caveat "In
{community}, no one described their own use of {exposure}, so its reports are not evidence about it."

### Comparisons with their doses (`finalize_research`)

`comparison_claims[]`, required (possibly empty) when `treatment_choice` is `compared` and forum threads were read: each
comparison the answer draws from community reports, with

- `quote`: the answer's sentence, which must appear in `answer_draft` exactly (after the usual normalization);
- `arms`: exactly two, each `exposure`, `dose` (a number, or null when not reported) and `unit`;
- `same_people`: whether the reports come from people who used both arms.

The server compares the numbers itself: a null dose, different units or different values require the caveat that the
dose changed along with the form, so the reports cannot show which works better; `same_people: false` requires the
caveat that the reports are not a comparison of the two. Meaning (which sentence is a comparison, which reports are
behind it) stays the model's declaration; the dose judgment that failed in #31 becomes a numeric check.

### Communities the user names (`finalize_research`)

`principal_communities[].named_by_user: true` marks each community the user asked to be searched. Each needs its own
research: YouTube through AskRigor's YouTube tools for the research target, the others a `community_searches` entry
with threads read or an `access_boundary`. A named community left unsearched is a next step, not a caveat.

### The visible final-check line (owner question 99, part 3)

If approved: a passing check ends its caveats with one line the answer carries like any caveat, for example "Checked
with AskRigor's final check." (`ready`) or "Checked with AskRigor's final check, with the limits above."
(`ready_with_limits`), translated like the other caveats. An answer without the line was not checked. The line is a
caveat, which the protocols already require answers to carry, so it needs no protocol text.

### Not built

- Per-page records of pages the client could not open: the client's own fetches are invisible to the server;
  `access_boundary` (with `retrieval_failed`, #337) stays per community.
- Search directions for forums like those for review sites: the named-community check and the existing required
  `adverse_reports` cover the reported gap; a direction check would add a declaration to every forum entry.

## Tests

- A new `tests/finalize-community-report-identity.test.ts`: the declaration step and refresh hint; each sum and bound
  step; the must-report line with zeros; the zero-firsthand caveat; `comparison_claims` quote matching, numeric dose
  comparison (equal, different, null, different units) and `same_people`; user-named YouTube and forum communities;
  the visible line for `ready` and `ready_with_limits`, and its absence for `not_ready`.
- The exact protocol text and its byte-exact reversal, as for earlier HRP builds.
- Both stress cases join `docs/owner-regressions.md`.

## Privacy

The new inputs are counts, doses and short labels the model declares for one call; they are request-local and not
stored or logged. `docs/privacy-data-map.md` records them with the other `finalize_research` declarations.

Status: planned 2026-10-16; waiting for owner question 99.
