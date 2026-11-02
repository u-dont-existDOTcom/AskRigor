# The Atlas foundation: owner answers 223a, 224a and 225a (plan, 2 November 2026)

Status: being built on `claude/atlas-foundation-20261102`, stacked on #397. A draft, released later with the owner's
own words. The owner's answers, typed in session 98963f67 at about 19:05 UTC on 2 November: "223a 224a 225 a". The
questions as asked are 223 to 225 on the owner questions page; the plan they come from is the owner's private
`atlas-ideas-2026-11-02.md`.

## What the answers decided

- **223a:** the foundation first (fix the faults; keep unreviewed findings out of search engines and label them; a
  Claude session sorts and rewrites the published findings into batches for the owner; question pages open with a
  bottom-line box), then "Colds and flu: what the trials show", then product checks, then evidence watch. Votes become
  "report a problem", and the side-by-side table replaces the circle map as the main picture.
- **224a:** findings still publish at once, but unreviewed ones are kept out of search engines and labelled "written by
  an AI, not yet reviewed by a person", and only reviewed findings go in the sitemap. Findings that name a product or
  company, report a harm, involve inhaled, injected or bladder use, say a paper misreports its own results, or concern
  a serious illness wait for the owner's review instead. This changes owner answers 171 and 168a for those findings.
- **225a:** results as "out of 100" with a range worked out in code; a number needed to treat or harm only when the
  difference is clear, and otherwise "no clear difference". This changes owner answer 153b.

## The order of the build

1. **224a, pages** (built): unreviewed finding pages, and lists whose findings are all unreviewed, carry
   `<meta name="robots" content="noindex">`; searches, accounts and messages always do. Every unreviewed finding,
   on its page and in every list, carries the label "Written by an AI, not yet reviewed by a person".
   `askrigor.com/robots.txt` names the sitemap and keeps crawlers out of searches, sign-in and accounts only (a finding
   page's noindex has to be read). `/atlas/sitemap.xml` lists the topics index, and, once anything is reviewed, the
   home and "What changed" pages, the topics holding a reviewed finding and each reviewed finding's page.
2. **224a's holds, withdrawn.** The owner, about 19:52 UTC on 2 November: "the rules are too strict here i don't
   care if a product is named or a serious illness or inhaled use or anything like that i don't recall approving those
   rules sorry but all that i care about is making sure we are giving high quality useful information especially that
   is hard to find with a regular chatgpt or claude chat or that's anti-common sense. the stronger the claim is, the
   higher it ranks, but the more it needs checking". No finding is held for its category, and the review-first
   declaration (draft #400) was closed unmerged. Instead, findings are ranked by the strength of their claim (below).
3. **225a, numbers** (built): each group as "N out of 100", the difference's 95% range by Newcombe's score method (hybrid
   Wilson), a number needed to treat or harm only when that range leaves out zero, and "no clear difference" otherwise;
   the range assumes two independent groups, which the page says. The final check and the owner's accept check refuse a
   card's number needed to treat or harm when the difference is not clear (`difference_not_clear`, with the range in
   percentage points). The tests' worked example moved from 30 of 120 against 18 of 120 (range -0.2 to 20 points, not
   clear) to 60 of 240 against 36 of 240 (2.8 to 17.1): the same rates and numbers needed. Newcombe's published examples
   check the range.
4. **Question pages** open with a bottom-line box ("a quick answer says / the checked studies show / what to try first,
   what to avoid, what's unknown"), each line linked to its findings; code checks that the box claims no more certainty
   than its weakest finding. New cards carry it in the card's later shape; existing cards get it from the owner's
   approved rewrite batches.
5. **Votes become "report a problem"**, with a reason, sending the finding to review; nothing ranks by reports.

The "Colds and flu" page waits for the owner's approval of the respiratory batch.

## Still to build, and where

- **The bottom-line box's card shape** (223a's question pages) extends the card's later shape that #398 adds for owner
  answer 219b, so it is built on top of #398.
- **Question pages** (here): one page per research answer, opening with the bottom-line box ("a quick answer says / the
  checked studies show / what to try first, what to avoid, what's unknown"), each line linked to its findings, then the
  card's shown findings. The box is read from the published fields when a card carries one; a place is left for the
  owner's approved rewrites of existing cards. Code checks that the box claims no more certainty than its weakest
  finding.
- **"Report a problem"** (here): the vote form becomes a report with a reason (a wrong number, a misread study, a
  retraction, unclear, unsafe, or a missing study, whose PubMed or DOI number code checks). A report sends the finding to
  the owner's review queue; nothing is ranked by reports. It changes what is collected, so it needs a migration, the
  privacy data map, the privacy page and the terms.
