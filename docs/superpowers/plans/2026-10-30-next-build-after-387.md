# The build after #387

Branch `claude/next-build-20261030`, from main's merge of #387 (`00e9b6de`, live since 17:42 UTC on 30 Oct, owner
answer 204a). Built under owner rule 148a; a release needs the owner's explicit yes.

## Built

1. **#387's release record** (`docs/audits/2026-10-30-owner-answers-200a-205a-production-release.md`).
2. **A smaller final-check panel.** The owner, 30 Oct, of a panel for a dizziness question: "i got this massive
   askrigor check panel. i assume this is because of my account being a dev account? what do ordinary users see?"
   Every account sees the same panel; only the findings-card note depends on the account (free or paid), and a dev
   account only decides whether the card is saved, which the panel doesn't show. The five notes, written for the AI
   with tool and field names, came before the answer: they reached the panel on 29 Oct (193a, part 5), when notes were
   only format problems, and 195a turned every non-blocking check into a note. Now:
   - the notes come last under every status, folded under one closed line, "Notes for the AI (5)", that opens on a
     click; the result text the AI reads keeps them in full (`final-check-panel.ts`);
   - a limit about a key source names it by the answer's label, then its identifier (`"Cervicogenic dizziness
     review" (29340206)`), since the panel's "Only part of the text of 29340206" named a study by a number the answer
     never shows; a source labelled by its identifier is named once (`keySourceName`, five limits).

   No method changes (148a); the checked answer in the panel (194) and the limits under it (205a) stay.

## Next

- **Community signals the way the owner's last turn did them (AskRigor#390, 30 Oct; owner rule 148a, and the owner's
  words "so you can see how i want the forum signals done, look at the last turn").** HRP's
  `CrowdSourcedAndClinicalSignalAudit` already has 35 rules, including counts and outcome-neutral selection
  (`ReviewCorpusSelectionAndCounts`, `DirectionLabelsNeedOutcomeNeutralSelection`), YouTube comment handling, context
  extraction, saturation and the three-part conclusion; the run skipped them, and some don't reach every corpus. What
  is missing, outside the core:
  1. the emergency exemption (`NonActivation`, "emergency triage before stabilization") covers only an answer that is
     the warning itself; once the warning is given and research goes on, the module applies;
  2. the answer names every source it analysed (a video's title, channel, date and link; each thread's link), so the
     reader can check its relevance;
  3. the counts `ReviewCorpusSelectionAndCounts` asks of review platforms apply to every community corpus: how many
     comments or threads were retrieved, how many were classified, and how they were chosen (every one, every k-th in
     the platform's order, random, ranked or found by outcome words);
  4. outcomes are counted per named method (Mulligan mobilisation, chin tucks, SCM self-massage), never for a category
     ("physical therapy"), with how much, how fast and how long, and each source's numbers kept apart;
  5. the conclusion adds a fourth part to the three: what a person could try first and what to avoid, ordered by risk,
     and what would change that;
  6. one search uses the person's own combination of symptoms (the owner's video ranked first for it), and the answer
     covers the whole cluster, not its most textbook symptom.

  7. **The loop, both ways** (the owner, 30 Oct: "make sure that the forum signal is doing a feedback loop, that's how
     it was originally designed, but i feel like we have often fallen into forum signal being a check on what you find
     via studies. forum signal should be also informing which studies to look at"). HRP's
     `BidirectionalEvidenceDiscoveryAndTriangulationLoop` already says it (`NoFixedStudiesThenCommunitySequence`:
     "Never search studies, finish the literature conclusion, and only then check forums";
     `CommunityToFormalHypothesisTransfer`, `FormalToCommunityDiscriminatorTransfer`), and the forum module's
     "Community → formal" does too; the runs still go studies first and use the forums as a check. In #390's run the
     loop worked once, by accident: the forums raised SCM syndrome, and a search for it found two case reports. So:
     `CommunityToFormalHypothesisTransfer`'s "Record which community leads materially changed the formal search map"
     becomes "say in the answer", with the study findings taken back to the communities.

  The check (non-blocking notes, 195a; no new declaration): `not_relevant_basis` `emergency_before_triage` with key
  sources declared means research went past the warning, so the note says community evidence applies; and when
  YouTube community receipts exist but no literature-search receipt was issued after the first of them, a note says the
  community leads never reached the study search (an exact check of signed issue times; forums the AI reads through
  its own web search sign no receipt, so the note can't see them). The community tools' results (scout, survey,
  community and video audits) carry two reminders: the loop (turn the interventions, diagnoses, subgroups and harms
  these reports name into study searches before concluding) and the reporting (title, channel, link, retrieved and
  classified counts, how chosen). Regression cases from #390's five scenarios, the owner's last-turn expectations, and
  one for the loop: a community-only treatment the first study search missed must reach a study search.

- **YouTube within its terms (owner answer 206a, 30 Oct: searches stay on the API).** Steps 2 and 3 of the owner
  page's plan, before any public launch:
  1. find videos without YouTube's search: the Gemini scout's candidates and the AI's own web search, each read by its
     ID (1 unit of the 110,000 a day, none of the 200 searches); move the surveys', audits' and title lookups' searches
     to lookups by ID where they can;
  2. a fair daily share of searches per account, kept as a count per keyed account digest and UTC day, so one heavy
     user or a regression run can't spend everyone's; a spent share is a stated limit, never a stop (193a).

  Scoped 30 Oct (step 1), before building:
  - **Where searches are spent:** `search_youtube`, `survey_youtube_community` and `audit_youtube_community` (one search
    per distinct query each), and the scout's exact-title lookups (`scout-title-lookup.ts`, at most four a call, only
    for finds with no usable ID). Videos with IDs are already read by ID.
  - **Guidance goes in results and HRP only:** the descriptions are in the frozen tool lists (189a). The scout's result
    now tells the AI to search a title it could not identify with `search_youtube` (100 units each); it should first
    suggest finding the watch link with the AI's own web search and auditing it by ID.
  - **The check's discovery note:** a material video found by the AI's own web search has no discovery receipt, so the
    check's note asks for one or to drop the video (non-blocking since 195a, but it pushes against 206a). The likely
    fix: let `get_youtube_video`'s signed read count as found for that one video, bound to the research target through a
    later input as `search_youtube` already takes one, and never as a round, as `youtube_video_claims` does. No new
    declaration (195a).
  - **HRP:** one sentence outside the core, in the community-evidence rules: discover through the scout and the AI's web
    search first, and spend YouTube searches on what those miss.
  - **Then measure** searches per answer in the next run, so the fair share's size (step 2) goes to the owner with
    numbers, including whether the owner's dev login, which runs the regression list, gets a larger share.
  - **A registry of high-value channels, by category** (the owner, 30 Oct: "we should look for the highest-value
    influencers in various categories (starting with health categories for now) so we aren't only crossing our fingers
    and hoping when we search videos"). In #390's run the most relevant video came from a channel no search had reached.
    - **Categories first:** neck and back pain, dizziness and balance, joints and sports injuries, diet and weight,
      blood sugar, heart and blood pressure, sleep, mental health, gut health, women's health, strength and fitness,
      supplements, and long-term illnesses (long COVID, ME/CFS).
    - **What "high-value" means for AskRigor**, recorded per channel as the kind of value it has: it demonstrates
      specific methods (named exercises, exact doses), not general advice; its claims hold up when checked against
      studies; it discloses sponsors and products; and its comments carry firsthand outcomes, benefit and harm, for the
      forum signal. Credentials count but aren't required: a patient's channel can be the best source of long-term
      outcomes, and a heterodox one the best source of leads, each labelled as such.
    - **The owner's two additions (30 Oct):** the good-to-bad ratio ("how else will we see if it's actually working
      for people?"), counted within a sample drawn without regard to outcome (every k-th comment), per video and per
      method, with its counts, as the owner's last turn on #390 did; and channels that take "hard cases", people
      others couldn't help, and show their tests and reasoning (the owner's example: Dr. Rahim). The seed, 46 channels
      confirmed through the API with the owner's picks and Gemini's candidates, is `docs/youtube-channel-registry.md`.
    - **Use:** for a question in a category, list each registry channel's uploads through the API (`playlistItems`,
      1 unit per 50 videos, none of the 200 searches), have the model pick the videos that fit, and read them by ID.
      Open discovery stays, so the registry adds sources and never narrows them (HRP's creator-success and platform
      selection limits still apply). The owner, 30 Oct: "if the channel fits the search you could check it along with
      whatever pops up"; small channels with recovery stories can be the most valuable, and open search is how they are
      found.
    - **Building it:** candidates from web search, the Gemini scout and the channels that surfaced in past runs; each
      checked through the API (`channels`, 1 unit) and judged on the criteria by AskRigor's own checks of a few of its
      videos. The registry keeps channel IDs and our own notes, and fetches the rest live; YouTube's developer policies
      on storing API data are to be read before any caching of upload lists.
    - **It also feeds the digest:** new uploads from registry channels can be checked like news stories (the owner's
      influencer idea for the news check).
- **The regression run on #387's build** (started 17:47:58 UTC, saving off), judged against 193's signals, the eleven
  low-calorie cases apart, with `q135-low-stakes` for 205a; and the news pilot's first digest (owner answer 203a).
- **Then:** payments against the Stripe sandbox (local and test mode only), and the model check's next draft (198).

## Verification

`npm run verify` on the branch: see the commit messages for each run's counts.
