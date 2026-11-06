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

1. **The YouTube scout's refusals (done, below) and budget.** November's $50 was used by 22:21 UTC on 1 Nov: all 50
   charges were `gemini_youtube_scout_request_failed` from the catch-all of `scoutFailureEnvelope`, non-retryable, so
   Google answered the request that creates the background job with a 4xx (not 401, 402, 403 or 429) before any polling
   (11 just after midnight in the run on #389's build, 6 rerun and 33 in the run on #393's build; none was resumed, and the
   AI started 15 new scouts after a failure). Each forfeited the full $1, though Google most likely billed nothing. The
   scout has completed nothing since about 04:38 UTC on 28 Oct, while `extract_youtube_video_claims`, with the same key,
   endpoint, model and background mode, completed 21 times in that run: the refusal is about something only the scout
   sends (its search tool, response schema or instructions), still to be read from Google's reason.
   - **Done:** a never-started refusal commits $0, carries the HTTP status and Google's message (one line, the key
     removed, at most 300 characters) and tells the AI not to call the scout again in that research and to use
     `survey_youtube_community`. Everything else still forfeits the full reservation.
   - **At the release (the owner's yes):** set November's ledger to what the scout really cost (owner answer 245a's
     condition holds), then one scout call reads Google's reason, and the request is fixed.
   - **Still to build:** test runs get their own small allowance, so a regression run can't use the production budget.
   - **Not changed:** the Custom GPT Action's one-call route still forfeits on a refusal (its receipt schema would change);
     a failed repair still surfaces as an unclassified failure and is charged in full.
2. **Figures as images.** `acquire_open_full_text` turns a PDF into text page by page, so a figure arrives as its caption
   and axis labels. A new input (sent in `later_inputs`, so the frozen tool lists don't change) returns a named page as
   an image for the AI to read. Test in Claude and in the ChatGPT app before release: whether ChatGPT passes images in
   tool results to its model is not confirmed.
3. **The account page lists the features in use (built)** (the owner, 5 Nov: "i should be able to see all of the
   features i'm using on the askrigor accounts page"). `/atlas/account` now shows, to the signed-in reader only, each
   feature: on or off for them, who pays and its limit, in plain words, read at each view from their research account
   (through the research access service, on the access role the Atlas already uses: no new grant, migration or tool)
   and from which server settings are present (never a value). **Privacy change for the owner's sign-off:** the sealed
   Atlas session cookie now also carries the reader's research account key, so the page can read that one account;
   before, the sign-in dropped it at once. Sessions sealed before then ask the reader to sign in again to see the list.
4. **From the 4 Nov CPAP test through this account's connector: nothing to fix.** The final check's round counter stayed
   at 1 over four calls because all four passed: a round counts only when a blocking check stops the answer, and notes
   consume no rounds (owner answers 193a and 195a; `countRound` in `apps/research-mcp/src/check-rounds.ts`). In the 115
   runs on #412's build, 112 stayed at round 1 and 3 reached round 2, each at its second `not_ready`; every call after
   the first sent its round token back. The note asking to cite two leads came once and the next draft answered it.
5. **The meaning judge (owner answer 221).** Its validation on #394's run (`docs/audits/2026-11-04-meaning-judge-validation.md`)
   found comparison backing at 68 of 90; revise the near-miss and guidance rules on #394's run, now development data,
   freeze, and validate on the regression run on #412's build. It stays off until the owner says otherwise.

6. **A literature index's own failure is named (built).** In the regression run on #412's build (5 Nov), NCBI's PubMed
   search failed for everyone from 03:49 UTC (HTTP 500 at NCBI's end, and 200s with unreadable bodies; still about 85%
   of requests from the laptop at 10:06 UTC), and from about 04:26 to 09:48 UTC Europe PMC often failed from the server
   (503, or no answer). Each result said only "access status error", and some answers never said a source could not be
   searched. Now, when the provider's own service fails (5xx, an unreadable body, its rate limit, no answer), the result
   says it is the provider's side, so nothing is shown about whether studies exist; names the other index (Europe PMC
   holds PubMed's records); and asks the answer to say so if the failure lasts. A refusal of the query (4xx) or of
   access keeps the old text. Result text only: the frozen tool lists don't change. Test
   `tests/literature-outage-note.test.ts`. The run's 61 cases with a failed literature search wait for a rerun (owner
   question 248).

7. **The private-map check reads the maps store (built).** The six Neal K. Shah maps were written on the owner's private
   page as one summary table without video links, so the pre-push check read 13 maps, not 19, and protected none of the
   six until that was noticed on 5 Nov (the page is now in the per-video form). The check now also reads
   `askrigor/comment-maps.json` (schema `askrigor.comment-maps.v1`), so a page's layout can't hide a map.

8. **Reddit's rate limit is a wait, not a block (built).** In the run on #412's build, Reddit limited the forum
   reader's host three times for a few minutes (about 02:36, 06:28 and 07:15 UTC). The host's `RATE_LIMITED` had no
   entry in the client's code table, so each call came back "unavailable" with no time to retry, and runs called the
   communities blocked (n389-forum-depth read 2 threads, against 14 on #394's build). Now it is `busy` with a retry
   time (the host's, or 60 seconds), the note says it isn't a block, and for that time every call of the process
   answers busy without asking the host, so Reddit gets nothing while it is limiting.
9. **A short Reddit search page is not a total (built).** #398 asked the host for pages of 25, but it still returns
   what Reddit's rendered search page shows first: 7 threads in 132 of 144 searches in the run, none with a next
   page, and 7 in a direct test asking for 25. The result called such a page "all this search found" and the receipt
   signed it as the last page, so the final check's note told the AI to say few threads exist. Now a page without a
   next page is "whether more exist is unknown", the receipt signs nothing about more, and the guidance asks for
   other wordings, sorts and subreddits.

10. **One passage given as both quotes of a source line is one passage (built).** In the run on #412's build, 9 of 15
    lines in one part and 5 of 6 in another gave the same sentence as the claim's sentence and as the paper's
    conclusion, and the answers still showed "✓ AskRigor found both in the paper." Such a line is now looked up once
    (reason `same_quote`): it can't be marked as both found, the panel says so, and a note asks for the paper's own
    conclusion as the second quote. Exact text comparison, in any language.

11. **Still to design, from the judging of #412's run (recurring classes, not local fixes):**
    - **Notes repeat at every check, with a cost.** A note like "Cite X as read through another tool, not audited by
      AskRigor" comes back on every call while the declaration stands, although the limit already says it and the
      drafts said it in their own words; runs removed the study from the answer to quiet it. `docs/final-check.md`
      says other diagnostics "return once in notes". Decide what once means: a note given in this turn and unchanged
      could come back as a one-line reminder, with the round token's carried step counts telling which.
    - **The de-identification screen** refuses research text for "I" and "me" ("copper(I)", a quoted "makes me
      sleepy"), in every run since #389's. It is a word list judging meaning; the fix is a different mechanism, not
      another exception.
    - **Nothing checks the delivered answer:** post-check rewording replaced the plain-answer note in 5 of 48 turns.
    - **`user_observations`** has no value for a report whose writer never tried the method.
    - **Misfit limits and holds:** the self-test limit for any unblinded test; the harm-screen hold for distress
      reported from a writing exercise; the web-search limit for a page the reader read under another link form;
      a zero-hit Reddit search reported as a host failure ("WEBSITE_FORMAT_CHANGED").

## Measures waiting

- **How much the scout adds** (the owner, 5 Nov): the regression run on #412's build has the scout off; its YouTube-heavy
  cases rerun with the scout once it works, judged blind.
- **The two sleep apnea cases** in that run (`new-case-criteria.md` in its folder): whether AskRigor finds the
  didgeridoo trial and the myofunctional-therapy comparison, and says how individual results varied.
