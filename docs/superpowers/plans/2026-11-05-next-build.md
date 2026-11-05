# The next build after #412 (5 Nov 2026)

Branch `claude/next-build-20261104b` (draft #413). Each item is built under owner rule 148a unless marked as the
owner's; the release needs the owner's explicit yes, as always.

## Done

- **Owner answer 244a: HRP 20.6.39.** `SpreadOfIndividualResults`, in `StatisticalAndClinicalInterpretation` (outside
  the core, which is unchanged), with the wording the owner approved: compare how much individual results varied in
  each arm, say whether people seem to respond differently with the arms' sizes and the role of chance, and say so when
  a split shows only in a figure the research could not read. The question proposed placing it beside
  `PopulationAverageVsSubgroup`, but that rule sits in `PublicHealthInterventionAudit`, which a trial question doesn't
  load; the owner was told of the move. Edit record `tests/fixtures/protocol-edits/2026-11-05-response-spread-hrp.json`,
  test `tests/response-spread-protocol-2026-11-05.test.ts`.

## To build

1. **The YouTube scout's budget (question 246).** November's $50 was used by 22:21 UTC on 1 Nov, in one evening of
   the regression run on #393's build: 33 scout requests ended as `gemini_youtube_scout_request_failed`, each charged
   the full $1 reservation, beside about 30 that finished at roughly $0.60 each. Two causes to fix:
   - why half the requests fail: a background interaction that is still running after the bounded number of polls is
     deleted, so a client that polls quickly may stop jobs that would have finished. Measure the poll timing in the
     #393 logs, then bound the wait by elapsed time rather than by the number of calls, or wait inside one call;
   - test runs spend the production budget: give regression and trial runs their own small allowance.
   A refund of the failed requests' charges was not made: they were Gemini jobs that ran until stopped and probably
   cost real money (question 245).
2. **Figures as images.** `acquire_open_full_text` turns a PDF into text page by page, so a figure arrives as its caption
   and axis labels. A new input (sent in `later_inputs`, so the frozen tool lists don't change) returns a named page as
   an image for the AI to read. Test in Claude and in the ChatGPT app before release: whether ChatGPT passes images in
   tool results to its model is not confirmed.
3. **The account page lists the features in use** (the owner, 5 Nov: "i should be able to see all of the features i'm
   using on the askrigor accounts page"): `/atlas/account` shows only the Atlas name, comments and deletion. Add each
   feature, on or off for this account, who pays and its daily cap.
4. **From the 4 Nov CPAP test through this account's connector:** the final check's round counter stayed at 1 over four
   calls; notes asking to cite two leads came back after the answer did.
5. **The meaning judge (owner answer 221).** Its validation on #394's run (`docs/audits/2026-11-04-meaning-judge-validation.md`)
   found comparison backing at 68 of 90; revise the near-miss and guidance rules on #394's run, now development data,
   freeze, and validate on the regression run on #412's build. It stays off until the owner says otherwise.

## Measures waiting

- **How much the scout adds** (the owner, 5 Nov): the regression run on #412's build has the scout off; its YouTube-heavy
  cases rerun with the scout once it works, judged blind.
- **The two sleep apnea cases** in that run (`new-case-criteria.md` in its folder): whether AskRigor finds the
  didgeridoo trial and the myofunctional-therapy comparison, and says how individual results varied.
