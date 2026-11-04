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
4. Compare the two:
   - **Pass:** the finding names something a person could act on or a specific risk, the quick answer doesn't name it or
     gets it wrong, and the finding reads on its own.
   - **Headline:** true and missed by the quick answer, but too small to change what someone does.
   - **Fail:** the quick answer names the same option or makes the same point, or offers something better.
5. A pass goes to `show_on_pages`. A headline or a fail goes to `keep_for_research` with the reason
   `owner answer 240a: quick-answer test, headline` or `owner answer 240a: quick-answer test, failed`, so it isn't
   tested twice.
6. Append each result to `askrigor/atlas-quick-answer-log.md` on owner-pages: the P number, the question, what the quick
   answer said, and the verdict.

Anything drawn from YouTube comments never reaches this test, since it is never published. A finding the tester can't
judge safe to show goes to the owner instead.

## Limits

- It is one quick AI's answer, so a pass means "missed by this search", not "unknown".
- The same agent that writes the question has seen the card, so the question can leak a hint. Step 2 guards against it.
  On 4 November the first tests named the treatment in the question, and so failed findings a person would never have
  come across. The first sets were retested the fair way.
- If keeping a saved finding fails, it stays on the pages until the next run sees it. A failed keep never fails the save.
