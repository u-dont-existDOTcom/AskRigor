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

11. **From the judging of #412's run (recurring classes, not local fixes).** Built on `claude/next-build-20261105`:
    - **Notes repeat at every check, with a cost** (runs removed a study to quiet "Cite X as read through another
      tool", which their drafts met in their own words). Once now means once per turn: the carried state keeps a
      12-character digest of each note its turn's checks gave, and a later check of that turn leaves those out, with
      one line saying how many and that each still stands unless the draft or the call's declarations meet it. A note
      whose words changed is new; the next turn gives notes again. Notes on the call's own input or continuity (input
      problems, receipts, carried state, the tool-list hint) always repeat, since their wording can stay the same
      while the entry they name changes (review of 5 Nov). Source-line and study-map notes, added after the check,
      still repeat.
    - **The de-identification screen** refused "copper(I)" and "makes me sleepy" in forum searches, each in quotes,
      in every run since #389's: a word list judging whether words are the person's. For a forum query, a first-person
      word now passes inside a closed pair of double quotes, the model's declared phrase others write or term; every
      other part of the screen reads quoted text too, and scout targets and leads are unchanged. Straight quotes count
      only in pairs opening and closing at word edges (inch marks and a stray quote hide nothing), curly quotes and
      guillemets only when all are closed (review of 5 Nov).
    - **`user_observations`:** a check may now reword or drop what an earlier check of its own turn declared (the
      carried state marks those places), so a reworded entry is no longer called left out and declared twice; an
      earlier turn's entry is still asked for, in its exact words, as the note now says. A call that leaves the list
      out declares nothing new and carries the state as it was (review of 5 Nov: leaving it out, or a `later_inputs`
      problem dropping it, erased the turn's entries). Its newer form in `later_inputs` adds `not_tried`, with the
      limit "A report from someone who never tried it", and `proposed_tests.repeats` can't name such a report. Limit:
      the turn is the round token's, so a model passing an earlier turn's token back could reword that turn's entries.

    - **A page the reader read drew the web-search limit** (l34): the declared link was the one asked for
      (LongeCity's `/forum/topic/63977-…/page-2`) and the reader landed on another (`viewtopic.php?t=1063977&start=30`),
      a site's own mapping no link rule can know. The read receipt now also signs the asked link when it differs, the
      check matches either, and the forum note counts the read once; a redirect to another site or to the site's front
      page (a removed thread) signs only where it landed (review of 5 Nov).

    - **A zero-hit Reddit search came back as a host failure** ("WEBSITE_FORMAT_CHANGED"; all six in the run were
      searches for made-up names, and one run then called the community's pages unretrievable). The host doesn't say
      which, so the guidance now says both: the host couldn't read the page in its known form, which has also come
      back when Reddit found nothing, so it doesn't show the community can't be reached.

    **Still to design:**
    - **Nothing checks the delivered answer:** post-check rewording replaced the plain-answer note in 5 of 48 turns.
    - **Misfit limits and holds:** the self-test limit for any unblinded test; the harm-screen hold for distress
      reported from a writing exercise; the web-search limit for a page the reader read under another link form;
      a zero-hit Reddit search reported as a host failure ("WEBSITE_FORMAT_CHANGED").

## Measures waiting

- **How much the scout adds** (the owner, 5 Nov): the regression run on #412's build has the scout off; its YouTube-heavy
  cases rerun with the scout once it works, judged blind.
- **The two sleep apnea cases** in that run (`new-case-criteria.md` in its folder): whether AskRigor finds the
  didgeridoo trial and the myofunctional-therapy comparison, and says how individual results varied.
