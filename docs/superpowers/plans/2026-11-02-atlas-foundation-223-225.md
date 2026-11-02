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
2. **224a, holding risky findings** (built for the declared fields; the declaration below waits for #398's later card
   shape): a finding whose declared fields show it (subject type product, kind or direction
   harm, kind `tested_vs_sold`) waits for the owner's review instead of publishing at its save or through
   `publish_cards`; accepting it publishes it, through the path a paid private card's findings take. Reasons no
   declared field shows (inhaled, injected or bladder use; a paper that misreports its own results; a serious illness)
   come from an optional per-finding declaration in the card's later shape: a declared reason holds the finding, and a
   card that declares none gets a note only. The stored finding's `review_first` field and the rule that reads it are
   here; the declaration itself extends the later card shape #398 adds for owner answer 219b, so it is built on top of
   #398. `publish_cards` takes an older unreviewed publication of such a finding down until a decision, and accepting
   it brings it back under the same number (no migration: the hold reasons' list in the database is unchanged).
3. **225a, numbers:** each group as "N out of 100", the difference's 95% range by Newcombe's score method (hybrid
   Wilson), a number needed to treat or harm only when that range leaves out zero, and "no clear difference" otherwise;
   the range assumes two independent groups, which the page says. The final check and the owner's accept check refuse a
   card's number needed to treat or harm when the difference is not clear.
4. **Question pages** open with a bottom-line box ("a quick answer says / the checked studies show / what to try first,
   what to avoid, what's unknown"), each line linked to its findings; code checks that the box claims no more certainty
   than its weakest finding. New cards carry it in the card's later shape; existing cards get it from the owner's
   approved rewrite batches.
5. **Votes become "report a problem"**, with a reason, sending the finding to review; nothing ranks by reports.

The "Colds and flu" page waits for the owner's approval of the respiratory batch.
