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
- **Owner answers 249a, 250a and 251a: HRP 20.6.40** (on `claude/next-build-20261105`, draft #414; SHA-256
  `afd3d881356337dd9190f6189b986469a4075e54a36c89855cd51fbf4769a7c1`). Besides the study map and single leads, 251a's two
  rules go in the same version, as its option a said, right after `ContextExtraction` in
  `CrowdSourcedAndClinicalSignalAudit`, outside the core: `ReportQualityBesideCounts` (how good people's reports are,
  beside how many said an option worked) and `SharedMechanismSearch` (each way an option could work, searched in studies
  and people's reports, with the options that work the same way). Edit record
  `tests/fixtures/protocol-edits/2026-11-05-study-map-single-leads-hrp.json` (five edits), test
  `tests/study-map-single-leads-protocol-2026-11-05.test.ts`. The owner's consilience point with 252a (a forum signal
  stands without studies, and a study contradicts it only if it measured the way the reports did) is already HRP's
  `FormalAbsenceCannotEraseCommunitySignal` and `MatchedContradictionAndOutcomeAlignment`, so it needed no edit.

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

12. **The loop from people's reports to studies (built)** (the owner, 5 Nov: "make sure that our feedback loop is
    working between forum signal and studies, i'm still not quite sure i'm seeing that in practice"). HRP already asks
    for it (`CommunityToFormalHypothesisTransfer`, with owner answer 250a's one tried, cheap, low-risk option;
    `FormalAbsenceCannotEraseCommunitySignal`; `MatchedContradictionAndOutcomeAlignment`). Judges read 18 recent runs
    lead by lead: of 98 options, doses, forms, responder groups and harms that forum threads or comments raised, 19 got a
    study search, most of them harms; 49 reached the answer only as reports, and 30 were dropped. Cheap options people
    had tried went unsearched (sleeping on a wedge, B vitamins, fish oil, sea buckthorn after omega-3 failed). No answer
    said that a reported lead went unsearched, and two described searches the run never made. The protocol's words
    don't move the model; the final check's notes do, so the loop gets an exact check of what the model declares.
    - **Built:** `community_leads`, a later input of `finalize_research` (`apps/research-mcp/src/community-leads.ts`;
      the frozen tool lists don't change). Each of up to 12 leads gives `lead`, `from` (a thread `read_forum_thread`
      read, or `video:<id>` for comments AskRigor read), and `searched` with the study search's exact query, what the
      studies showed (`corroborated`, `contradicted` only when they measured it the way the reports did,
      `support_not_located`, `outcome_mismatch`) and the answer's sentence, or `not_searched` with why. All checks are
      notes, in the `option_classes` pattern: a missing list after threads or comments were read (with how many); a
      `from` no read receipt shows; a search no `literature_search` receipt signed; a missing `studies`, sentence or
      reason. The leads not searched are one limit: "Leads from people's reports that this research did not search in
      studies: …". Entries are read one at a time, as the study map's are, so a dropped entry never moves the others'
      places in the notes. `read_forum_thread`, `get_youtube_comments`, `search_youtube_comments` and the two comment
      audits ask for the loop in their results. Test `tests/community-leads.test.ts`.
    - **Review fixes (5 Nov):** one lead, one entry (a repeat, compared in NFKC, lower case and without its closing
      mark, is noted and left out of every other check); threads the call declares in `community_searches` tie a lead
      to a read, and the missing-list note counts them apart from the reader's (outside review sites and pasted
      reports, as the forum note counts them); `read_forum_thread` asks for the loop only after a read; a lead needs a
      letter or digit; in the limit a semicolon inside a lead becomes a comma, and only a closing `.`, `,`, `:` or `;`
      (and their full-width and CJK forms) is left out, never `?` or `!`; `from` takes a YouTube link in any form
      `extract_youtube_video_claims` reads; a lead declared searched with no literature search passed under its query
      joins the limit, since AskRigor saw no such search; and a search whose receipts returned no records gets a note
      unless `studies` is `support_not_located`.
    - **Known limits, left as they are:** a study search made before the reports were read still counts (the lead was
      searched); read and search receipts carry no research target, so a read or search made for another question in
      the receipts' 24 hours counts; a same-site redirect to a login or index page could sign the link as asked (`a`),
      and the reader's own access states are the guard.
    - **Next:** the other direction, a study's finding followed up in the communities (HRP's
      `NoFixedStudiesThenCommunitySequence`: a formal finding that could explain or challenge the community pattern
      reopens community sampling). Then measure: rejudge the leads of a regression run on this build.

13. **How each study was read, said beside it (built)** (the owner, 5 Nov: "make sure askrigor is enforcing that the AI
    tells people what it actually read, like 'In this study (abstract read/full text read/full text and images
    analyzed)' that will make it much easier to understand the evidentiary basis"). HRP's `StudyReadDepthDisclosure`
    already asks for it, and the final check already held each declared `read_depth` to its receipts, but nothing made
    the answer say it. No seventh blocking rule: the reading-depth rule now covers the answer's words too.
    - **Built:** `source_reading`, a later input of `finalize_research` (`apps/research-mcp/src/source-reading.ts`; the
      frozen tool lists don't change): one entry per key source, its id as `key_sources` gives it and the answer's own
      words on how it was read, copied from the draft, in any language. A key source the draft cites (a link its
      receipts tie to it, or its DOI, PMID or PMCID in the prose) needs an entry whose quote the draft shows, compared as
      the other declared quotes are; a missing entry or an unshown quote is a blocking step under `read_depth`. A key
      source the draft doesn't cite needs nothing; an entry naming no key source, or a second one for a source, is a
      note. Which words say how it was read stays the model's declaration. Each step names the reading the check
      verified: a checked Atlas finding, "from a checked Atlas finding"; an audit receipt, "full text read, methods
      audited by AskRigor" (of the AI's search copy, "full text read from a copy the AI found, methods audited by
      AskRigor", as the Atlas reads a card's sources); a completed reading, "full text read"; a lead read through
      another tool, "read through another tool, not checked by AskRigor"; otherwise the declared lower depth ("part of
      the text read", "abstract
      only" for an abstract or a conference abstract, "only another source's description of it read", "only its title
      and record read", "not read, no access to it", "not read, it could not be fetched"). A declared audit with only a
      completed reading behind it reads as "full text read"; any other refused full-text or Atlas declaration has no
      reading until it matches its receipts, and its step asks for a `read_depth` they support.
    - **Up front and in the panel:** every result with key sources carries the runtime `source_reading` (each key
      source's id, its name as limits give it, its reading) and a line, "Say beside each study how it was read: …", so
      the answer can say it before a check blocks; under a passing check the panel lists "What AskRigor read: …", so
      the reader sees it even when the answer is reworded. The runtime tool description says the read-depth check now
      covers the answer's words.
    - **Named before the first check, so no round is lost:** the results of a signed `fetch_pubmed_record` ("abstract
      only", or "only its title and record read" without an abstract), of `acquire_open_full_text` and
      `continue_open_full_text` once the text is read to its end ("full text read"), and of the two method audits once
      validated, name the reading's words, to say beside the study and give in `later_inputs.source_reading`
      (runtime result text; the frozen tool lists don't change). The AskRigor skill says the same in one sentence, so
      the plugin package changes and the release reinstalls it.
    - **Merged with #416's Atlas (5 Nov):** the Atlas's own reading of a card's sources (`ATLAS_SOURCE_READINGS`,
      signed into the finalization receipt) stays as it is; this module's names were changed (`ANSWER_READINGS`,
      `AnswerReading`) so the two no longer share `SourceReading` and `SOURCE_READINGS`. A library copy reads as any
      full text; card backing lines need nothing from `source_reading`, since the Atlas words each source's reading
      itself.
    - **Waits for figure reading:** "full text and figures analyzed", the owner's third example, waits for item 2
      (figures as images); no receipt yet shows a figure was read, so no label says so. When item 2 is built, its
      receipt can earn a reading of its own.
    - **Tests:** `tests/source-reading.test.ts`. Existing fixtures whose drafts cite key sources get their entries from
      the shared helper `tests/helpers/source-reading.ts` (`withSourceReading`), which quotes each key source's declared
      reading and adds the words in a paragraph of their own when the draft lacks them, as `withHarmScreen` does.
    - **Known limits:** the words are the model's, so an entry can quote a sentence that doesn't say how the source was
      read; where the words sit isn't checked; a key source with no `read_depth` and no receipt showing a reading has
      no reading, so the result's list and the panel leave it out.

14. **Three lessons from the free Claude test (built)** (5 Nov; Claude Sonnet with AskRigor, on Piliostigma reticulatum
    leaves). The answer passed the final check but missed PMID 11372139, whose title spells the plant "Pilostigma", and
    a 2022 study neither PubMed nor Europe PMC indexes, so it said no mammal toxicity study exists; and it declared a
    community, r/herbalism, it never read. HRP already has the rules (`UserNamedInterventionSweep`,
    `HistoricalVocabularyAndCitationBackchain`, `NoHumanEvidenceAbsenceClaimBeforeSweep`): no protocol edit, no new
    blocking rule, and the frozen tool lists don't change.
    - **Other spellings and a source beyond the indexes, before a not-found claim** (`absence-searches.ts`): a PubMed or
      Europe PMC result with 50 records or fewer names both searches and the three rules once in its text; 50 is the
      small search already read whole before anything is called not found, and the test's own searches had 11 (PubMed,
      the plant's name) and 23 (Europe PMC, with "toxicity"), which the old threshold of 10 missed. Beside a
      `support_not_located` absence claim, a note asks for what is missing. `name_forms` (a later input) declares each form
      searched with its query, checked exactly against the call's literature-search receipts and for the form inside it,
      in any script; a form searched covers "older or variant terms" in the limit. `search_coverage`'s newer form adds
      `other_journals`; without it the not-found limit names "journals outside PubMed and Europe PMC". One sentence in
      the AskRigor skill, within its 1,250-word cap.
    - **A community may not be declared unread:** the placeholder fits `community_searches`, which takes the AI's word
      for its own web search and whose checks are notes, so an entry like r/herbalism with no thread and
      `no_relevant_results` passed with a limit. Where AskRigor's forum tools reach a community, one declared searched or
      read now needs this call's receipt for it (a thread read or listed, or a search limited to the subreddit, whose
      receipt now signs it as `sr`). A note: the sources check holds key sources, whose threads already block without
      their read receipt, and `community_searches` entries are not key sources.
    - **Test runs never save cards:** a `later_inputs.findings_save` `"off"` marker on `finalize_research` saves no card
      and keeps no copy, whatever the account's switch; it can only turn saving off. The harness reaches AskRigor
      through the ChatGPT app in Codex (`codex_apps`), whose connection OpenAI makes, so it can't send a header; the
      runbook (`docs/owner-regressions.md`) says how the harness marks every call and checks for the marker. The
      harness files are the coordinator's to change.
    - **The independent review of #414 at 8e5eafa8 (5 Nov 2026), nine fixes**, no new blocking rule, frozen tool lists
      unchanged:
      1. One bad later_inputs key no longer drops them all: `finalize_research` keeps the usable keys, drops each bad one
         with a note naming it, takes a key given in both places in its later_inputs form with a note, and reads
         `findings_save` from the raw call on its own (`mergeLaterInputs` with `keepUsable`, `findingsSaveOff`).
      2. Each `source_reading` entry declares `reading`, from the fixed set; one claiming more than the check verifies
         blocks under read_depth with a step naming the verified reading, by depth and, for a full text, by whose copy;
         one claiming less is a note; another tool's reading stays the AI's own declaration and never claims more. The
         quote's words stay the model's (docs/final-check.md says so).
      3. The marker reaches every account and the save tool: no save offer or research-map offer or reminder, the
         finalization receipt signs `fs` `off` so `save_research_findings` and the save refuse its card
         (`call_saving_off`), and a marked free check files no held analysis and drops those its own audits name.
      4. The panel lists only the readings AskRigor's receipts show under "What AskRigor read", and the others apart,
         as the AI gives them, with what the receipts show ("found in a search, not read"; a PubMed record's receipt now
         signs whether it had an abstract).
      5. The small-search note has the owner's words of 30 Sep 2026 back, before the not-found asks; the tool test
         checks them again.
      6. Community notes: platform `other` is no longer checked; a search the reader's host answers
         `WEBSITE_FORMAT_CHANGED` is signed with no thread and counts only as a search of its subreddit; subreddit
         names are read in any case, with a slash or their reddit.com address before them.
      7. `name_forms`: one-character forms; each word of a form among its query's words, a word in a script without
         spaces inside the query; queries digested in Unicode's composed form; and `key_name`, the key name as the
         answer writes it, so only a form other than it counts and the usual name alone leaves the ask.
      8. Any `source_reading` entry for a source that passes will do.
      9. A full reading of the AI's own copy signs its provenance and reads "full text read from a copy the AI found"
         (`search_copy_read`), in the answer and in the Atlas.

## Measures waiting

- **How much the scout adds** (the owner, 5 Nov): the regression run on #412's build has the scout off; its YouTube-heavy
  cases rerun with the scout once it works, judged blind.
- **The two sleep apnea cases** in that run (`new-case-criteria.md` in its folder): whether AskRigor finds the
  didgeridoo trial and the myofunctional-therapy comparison, and says how individual results varied.
