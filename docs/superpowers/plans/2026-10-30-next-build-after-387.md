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

  The check (non-blocking notes, 195a; no new declaration): `not_relevant_basis` `emergency_before_triage` with key
  sources declared means research went past the warning, so the note says community evidence applies. The YouTube
  audit results carry the reporting reminder (title, channel, link, retrieved and classified counts, how chosen).
  Regression cases from #390's five scenarios and the owner's last-turn expectations.

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
- **The regression run on #387's build** (started 17:47:58 UTC, saving off), judged against 193's signals, the eleven
  low-calorie cases apart, with `q135-low-stakes` for 205a; and the news pilot's first digest (owner answer 203a).
- **Then:** payments against the Stripe sandbox (local and test mode only), and the model check's next draft (198).

## Verification

`npm run verify` on the branch: see the commit messages for each run's counts.
