# The Atlas quick-answer test

Owner answer 240a (4 November 2026). A saved AI-found finding stays off the Atlas's pages until this test shows it. It
stays in AskRigor's research lookup all the while. The test exists because the AI that did the research can't fairly
judge its own card.

## What runs it

A scheduled task on the owner's Claude plan, using the reviewer's AskRigor connector. It makes no API call and costs no
API money. It needs no review from the owner.

## The steps

1. `review_research_contribution` with `list_kept`. Take the items in state `unreviewed` whose reason is exactly
   `waiting for the quick-answer test (owner answer 240a)`.
2. For each, write the question a person with the problem would ask before they had heard of this option: "what can I
   do about X?", or "what else is there when Y hasn't worked?". Never name the treatment, product or practice, and leave
   out the finding's result. A search for a named option finds its trial almost every time, so that says nothing about
   whether a person would come across it.
3. Give that question to a fresh agent that has not seen the card. It may run at most two web searches, and it may not
   use AskRigor or the Atlas. It answers in at most 120 words. If its searches fail, run it again.
4. Compare the two. Whether it's new, whether it could help and how sure anyone is are three separate things, and this
   test judges the first two: a finding isn't failed for weak evidence, which its limits state.
   - **Pass:** the finding is really better than the quick answer, "to the point where someone would change their mind
     about something important" (the owner, 5 November 2026). A person who had read only the quick answer would, after
     reading the finding, choose differently, avoid a risk they didn't know about, or take up a clearly better option.
     The quick answer doesn't already give that point (what to do, for whom, and roughly how well) or gets it wrong, and
     the finding reads on its own. A passing mention in a list isn't the same as giving the point.
   - **Headline:** true and not in the quick answer, but it wouldn't change an important decision.
   - **Fail:** the quick answer already gives the finding's useful point, or offers something better.
5. A pass goes to `show_on_pages` once its card carries the whole picture (below). Until AskRigor can store that, a
   pass goes to `keep_for_research` with the reason `owner answer 240a: quick-answer test, passed, waiting for the whole
   picture`, so it isn't tested twice and can be shown once its card is complete. A headline or a fail goes to
   `keep_for_research` with the reason `owner answer 240a: quick-answer test, headline` or
   `owner answer 240a: quick-answer test, failed`, so it isn't tested twice.
6. Append each result to `askrigor/atlas-quick-answer-log.md` on owner-pages: the P number, the question, what the quick
   answer said, and the verdict.

Anything drawn from YouTube comments never reaches this test, since it is never published. A finding the tester can't
judge safe to show goes to the owner instead.

## Whether it challenges the usual view

The owner, 6 November 2026: "we should also have a section for results that challenge mainstream consensus even if it's
available with a standard ai answer, like this one", of a finding that after a year about half of people with obesity
and moderate-to-severe sleep apnea reached remission or mild sleep apnea without daytime sleepiness on tirzepatide, when
the usual advice is CPAP every night. So the tester makes one more judgment for each finding, apart from pass, headline
and fail, which it neither changes nor depends on:

1. Ask a second fresh helper, which has seen neither the card nor the quick answer, what most doctors and major
   guidelines currently advise for the problem. Use step 2's question, with nothing of the finding, its option or its
   result. It may run at most two web searches, it may not use AskRigor or the Atlas, and it names its source (a
   guideline, a professional society's statement or a major review) with the source's link.
2. Compare the finding's result with that usual view. The finding challenges it when its result goes against it: what
   the usual view advises, for whom, or how well it says something works. A finding that only adds an option the usual
   view doesn't mention doesn't challenge it; whether a quick answer misses it is what steps 3 and 4 judge. As in step
   4, a finding isn't judged on its evidence's strength, which its limits state.
3. When it challenges the usual view, mark it with `review_research_contribution`, action `mark_challenge`, and in
   `later_inputs`: `items`, its P number; `usual_view`, the usual view in one plain line of at most 300 characters;
   `usual_view_source_url`, the source's https link (never a YouTube link); `usual_view_source_label`, the source's name
   as a reader should see it, such as the guideline and its year; and `quick_answer_verdict`, the finding's verdict from
   step 4: `pass`, `headline` or `fail`. Only the reviewer login can mark, as with `keep_for_research`; the mark keeps
   who marked it, as a digest of that login, and when. A mark whose texts hold contact details, a findings card's
   reference or a YouTube link is refused, since the pages never show them: the link by the host a browser opens it at
   (so `youtube%2Ecom` or full-width letters are YouTube too), and the texts with no control or format character, such as
   a text-direction control or a zero-width character, which can make a text show something other than it holds. The
   link is kept as a browser opens it.
4. Marking shows nothing: showing is still `show_on_pages`. Whether the daily task shows a marked finding right away is
   the owner's to decide (question 272), so the method fits either answer:
   - if the owner says marked findings are shown right away, a marked finding goes to `show_on_pages` whatever its
     verdict, instead of step 5's `keep_for_research`;
   - otherwise it goes to `keep_for_research` as step 5 says, with `, challenges the usual view` added at the end of
     its reason (`owner answer 240a: quick-answer test, failed, challenges the usual view`), and waits for the owner;
     `list_challenges` lists every marked finding, kept or shown, with its usual view, source and verdict.
5. Add the usual view, its source and the judgment to the finding's log line (step 6), marked or not.

`clear_challenge` takes a mark off, except from a finding that shows unreviewed only because it challenges the usual
view (a headline or a fail): without its mark its page would say a quick AI answer misses it, so `clear_challenge`
refuses it, naming it, until `keep_for_research` has kept it. A shown finding that carries a mark is listed on `/atlas/challenges`, "Findings
that challenge the usual view" (linked from the Atlas's home page and its list of all findings), with the usual view and
its source beside it and its own limits: how sure it is, whom it applies to and what would change it. Its page carries a
box saying it challenges the usual view, with the view and its source. An unreviewed finding's status says, from the
stored verdict, that a separate AI found a quick AI answer misses it (a pass), or that a quick AI answer may already
give it and that it's shown because it challenges the usual view (a headline or a fail), and its box says the same. A
finding kept for research is on no list, the section page included, and its page, its box too, says nothing of the
quick-answer test. These pages are kept out of
search engines like every page of an unreviewed finding. The pages show no one's login and no YouTube comment data.

Limits: the usual view is one helper's answer from two searches, so it can miss a newer or a regional guideline; its
source link shows where it came from. Whether a result goes against it is the tester's judgment, in any language; the
code checks only the mark's form.

## What a shown card holds

The owner, 5 November 2026: once published, a card "should not just have what's better than the regular answer, since
then that wouldn't be enough to base a decision on, it should be comprehensive, with the better parts highlighted".

So a shown card carries the whole checked answer: what's known, what isn't, the options, the safety, and the research
and people's reports behind them. It is written in general terms, with nothing about the person who asked. Its findings
that passed this test are highlighted inside it. Today a card holds only its findings, so AskRigor still has to build
that part: the AI writes it from its checked answer, the final check screens it like the rest of the card, and the
Atlas page shows it with the passing findings marked. Until then no finding is shown on this test's pass alone.

## Cards that weren't saved

A free contributor's card that the final check refused, that didn't read as a card, whose answer hadn't passed or whose
save failed is kept privately as an issue labeled `unsaved-card` in the findings repository (the owner, 4 November 2026:
"so we don't lose findings on technicalities"). The card check is about a card's form, not a finding's worth, so a copy
is a finding nobody has judged yet. It is never published, and nothing in it is checked.

A run also reads the open copies. Each one lists what stopped it and what its copy leaves out. A finding that would pass
the test above goes in the log for a rescue: someone reads its paper again and sends a corrected card through the final
check, so nothing unverified reaches a page. A copy closes by itself once a card saved from the same research carries
every claim it holds. Otherwise the reviewer closes it with a comment saying why.

## Limits

- It is one quick AI's answer, so a pass means "missed by this search", not "unknown".
- The same agent that writes the question has seen the card, so the question can leak a hint. Step 2 guards against it.
  On 4 November the first tests named the treatment in the question, and so failed findings a person would never have
  come across. The first sets were retested the fair way.
- If keeping a saved finding fails, it stays on the pages until the next run sees it. A failed keep never fails the save.
