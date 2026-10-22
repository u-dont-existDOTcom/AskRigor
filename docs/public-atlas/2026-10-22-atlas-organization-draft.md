# How the public Atlas is organized

22 October 2026. **Draft for the owner. The decisions in section 6 were made on 22 October; nothing here is built yet.**

This is the page structure promised with your answer 156a ("What goes into the Atlas"). It builds on the 30 August
Atlas design (`docs/superpowers/specs/2026-08-30-public-discovery-atlas-design.md`); section 8 says what it keeps,
changes and leaves for later. **Your decisions are in section 6.**

Words used here:

- **Card:** a saved findings card in your review inbox (the private findings repository), with one to five findings.
- **Atlas database:** AskRigor's main evidence database, where accepted research maps, study audits and topic links go
  today.
- **Exists:** a card field or stored value fills it today. **Derived:** code works it out from stored values.
  **Needs new data:** nothing collects it yet. **Yours:** your judgment at review.

## 1. Rules this draft follows

- Nothing is public until you accept it (156a). You accept each finding, not each card.
- The AI and you judge meaning. Code works out exact things: identifiers, dates, matches, rates from counts.
- Code builds the pages from the card and your edits, with no model call.
- Pages never show a person: no account, no ARF number, no chat, no sentence from the private answer (`answer_quote`).
- Community content stays out of the Atlas database while the YouTube compliance review is open (decision 4).

## 2. Page types

Each table lists a page's sections in order and what fills each today.

### 2.1 Home page

| Section | Filled by |
| --- | --- |
| 1. What the Atlas is; search | Fixed text. Search covers topic names (exist), questions (`question`, exists), treatment and product names (needs new data) |
| 2. Most important now | Decision 2 |
| 3. Most unexpected, with credible evidence | Derived: `usual_answer`, `why_not_usual`, tags, `certainty`, `verified_bases` |
| 4. Recently changed | Needs new data: change records |
| 5. Contested | Needs new data: accepted "contradicts" links |
| 6. Conditions and goals, A to Z | Topics (exist); each finding's topic needs new data |
| 7. Questions people asked | `question` (exists) |
| 8. How the Atlas works | Fixed text: the test, your review, the labels, not medical advice |

A lane item shows the claim, its label, how sure, whom it applies to, when it was last checked, and why it is there.

### 2.2 Condition or goal page (OCD, IBS, sleep, colds)

| Section | Filled by |
| --- | --- |
| 1. Name and other names | Topic and other names (exist); the finding's topic needs new data |
| 2. At a glance: findings by label, last checked | Derived |
| 3. Options: treatments, supplements, foods, practices | Needs new data: kind and subject |
| 4. Harms | Needs new data: kind |
| 5. Tests | Needs new data: subject type |
| 6. Products: what was tested and what is sold | Needs new data: kind |
| 7. Common claims corrected | Tag `contradicts_common_answer`, basis `research_correction` (exist) |
| 8. Searched, nothing found | Tag `documented_absence`, basis `bounded_absence` (exist); the search's scope needs new data |
| 9. Questions people asked | `question` (exists) |
| 10. Not yet checked (leads) | `open_leads` (exists); open trails of accepted research maps (exist). Decision 3 |
| 11. Related conditions and goals | Topic links: same, narrower, broader, related (exist, 138b) |
| 12. What changed here | Needs new data: change records |

Within a section: checked findings first, by certainty, then newest. Superseded findings move to "Earlier findings".

### 2.3 Finding page

| Section | Filled by |
| --- | --- |
| 1. Label; last checked | Derived (section 3) |
| 2. The claim in plain words | `claim` (exists) |
| 3. Whom it applies to; who else faces it | `applies_to` (exists); `public_value.who_else` (exists, one per card) |
| 4. How sure, and how it was checked | `certainty` (exists; shown as AskRigor's rating, not formal GRADE); `verified_bases` (exists); which source was audited: needs new data |
| 5. The numbers: each group's count and size, follow-up, NNT, NNH | Needs new data: a numbers block. Code works out rates, NNT and NNH (rounded up, 153b), none without group sizes (149a) |
| 6. Harms over the same follow-up | Needs new data: the same block |
| 7. What a quick answer says, and why it misses this | `usual_answer`, `why_not_usual` (exist) |
| 8. What it could change | `public_value.what_it_changes` (exists, one per card) |
| 9. What communities report, as reports | Needs new data: one sentence kept apart from the claim. Decision 4 |
| 10. What would change it | `what_would_change_it` (exists) |
| 11. Sources | `sources` (exists); titles, years and retraction status derived from public records |
| 12. Related findings | Same study: derived from identifiers. Same subject or harm: needs new data |
| 13. Questions it answers | `question` (exists) |
| 14. History | Needs new data: change records (later saves exist as comments in your inbox) |
| 15. How it was made | The card's stamp: AskRigor and protocol versions, dates (exists) |

### 2.4 Intervention or product page

| Section | Filled by |
| --- | --- |
| 1. Name, type, other names | Needs new data: a subject record. Types from the 156 test: test, treatment, supplement, product, food, practice |
| 2. Across conditions: a row per condition with effect, certainty, label | Derived once findings carry a subject and topic |
| 3. Harms, and the same harm in other products | Needs new data: kind and the harm's name |
| 4. What was tested and what is sold | Needs new data: kind |
| 5. Searched, nothing found | Basis `bounded_absence` (exists); subject needs new data |
| 6. Studies behind these findings | Derived from `sources` |
| 7. Questions people asked | `question` (exists) |
| 8. What changed | Needs new data: change records |

### 2.5 Question page

| Section | Filled by |
| --- | --- |
| 1. The question, without the person | `question` (exists, already in general terms; you may edit it at acceptance) |
| 2. Findings that answer it, with label and how sure | Derived from accepted findings of cards with this question |
| 3. What a quick AI answer says, marked "not checked" | `usual_answer` (exists) |
| 4. Still open | `open_leads` (exists), if decision 3 allows |
| 5. Similar questions | Identical wording merges by code; similar wording is linked when the AI declares it and you accept (needs new data) |
| 6. Last checked | Derived |

There is no written summary answer: that would need a model, or more writing at review.

### 2.6 What changed (history)

| Section | Filled by |
| --- | --- |
| 1. Filter: new, corrected, re-checked, relabeled, withdrawn | Derived from change records |
| 2. Entries, newest first: date, finding, old and new, why | Needs new data: a change record at each acceptance, correction, re-check or label change |
| 3. Each finding's versions, with each wording | Needs new data; the Atlas database already keeps versions without overwriting |

## 3. From a saved card to pages

1. **Saved (exists).** The final check verifies the card against the answer and the sources read; personal-only cards
   stop there. A public card reaches your inbox labeled `pending-review`, plus `beyond-quick-answer` when a finding has
   a verified basis. A later save of the same question and claims joins the open card. When one account researches
   the same question again, its newer card replaces its earlier one.
2. **Accepted (needs building).** You accept, edit or reject each finding, with the AI's declaration in view. Code
   checks first: at least one verified basis (139c; without one, a finding can only be a lead), group sizes for any
   numbers, and a public record and retraction status for each source. Your decision, date and reason are kept, and
   the accepted wording is version 1. The finding is then written into the Atlas database, as accepted research maps
   are. Cards saved before the 22 October release have no verified bases, and none yet has the 156a declaration;
   decision 1 settles whether they count.
3. **Merged.** Today 138b works in the Atlas database: the same topic, question or study continues one record, and
   differently worded topics can be linked. Cards merge only by exact wording. Once findings are in the Atlas database:
   - by code: a study is one record however many findings cite it; a later card with an accepted finding's exact
     question and claims counts as a re-check;
   - by meaning: the AI declares that a finding is the same as, narrows, contradicts or replaces an accepted one, or
     that two names mean one subject or question; you accept; nothing is moved or deleted (138b's topic link, applied
     to findings, subjects and questions).
4. **Labeled.**
   - **Lead:** not yet checked: a card's open lead, an open trail of an accepted research map, or a finding with no
     verified basis. Never in lanes.
   - **Checked:** accepted, with a verified basis, neither contested nor superseded.
   - **Contested:** you accepted a "contradicts" link between two current findings. Both pages name the disagreement
     (dose, population, outcome, follow-up, study quality or analysis) and link each other. Code can flag candidates
     exactly (same question or subject, opposite direction); the AI and you judge.
   - **Superseded:** you accepted a newer finding that replaces it. The old page stays and points to the new one.
   - Corrections are new versions (decision 5). A retracted key study and "due for re-check" are warnings
     (decision 6). The Atlas database's claim versions, statuses and links (supports, contradicts, supersedes) can
     hold all this.
5. **Last checked.** Each finding page shows two dates. Research last checked: the newest final check that reached the
   finding (the accepted card's, a later save's, or a re-check you accepted; `stamp.research.finalized_at`), with its
   AskRigor and protocol versions. Studies last checked: the newest retraction and correction check of its sources.
   A scheduled re-check is new research, in a chat on your plan or as a new spending decision; it is left for later.

## 4. Ranking the lanes

No single right order of all health findings exists (30 August scan). Each lane names its basis and shows the values
behind each item. Repeats never raise certainty or rank.

| Dimension (30 August design) | Today |
| --- | --- |
| Severity or burden of the condition | Needs new data: a 0 to 3 rating with a public source |
| Reach: how many people face it | Needs new data. Later saves show demand, not reach |
| Size of effect, or what it changes | Partly: `what_it_changes` (text); the numbers block needs new data |
| Certainty | Exists: `certainty`, `verified_bases` |
| Actionability | Yours; kind (needs new data) helps |
| Benefit against harm | Needs new data: the numbers block |
| Access and cost | Needs new data; later |
| Equity | Later |
| Neglect or information gap | Partly: tags `overlooked_study`, `contradicts_common_answer`, `documented_absence`; bases `research_correction`, `bounded_absence` |
| Freshness or change | Dates exist; how much changed needs change records |

- **Most important now:** decision 2.
- **Most unexpected, with credible evidence:** computable today. Basis: unlike what a quick AI answer says; each item
  shows that answer and why it misses. Only checked findings at moderate or high certainty, with a verified basis, not
  contested. No surprise score (kept from 30 August); order by certainty, then newest.
- **Recently changed** and **Contested:** newest first, naming the change or the disagreement. Both need new records.

## 5. Worked example (invented)

Everything here is invented: Velmor syndrome, zentarine, the trials, the label survey, the numbers, the dates and the
identifiers (`10.0000/` marks synthetic records in AskRigor's tests).

**The card**, saved 2 Nov 2026, declared public. Question: "Does zentarine help the hand tremor of Velmor syndrome in
adults, and what are its side effects?" Quick answer: "A natural supplement that may ease the tremor and is generally
well tolerated."

- Finding 1 (low certainty; full-text audit): one trial of 240 adults, 400 mg twice a day for 12 weeks
  (`10.0000/synthetic-a`).
- Finding 2 (moderate; full-text audit): the trial used 800 mg a day; a published label survey found 50 to 100 mg per
  capsule, so 8 to 16 capsules a day (`10.0000/synthetic-c`).
- Finding 3 (moderate; checked absence): no trial in people under 18 in PubMed, Europe PMC or ClinicalTrials.gov to
  31 Oct 2026.
- Open lead: a small lower-dose study, read only as an abstract.

**You accept all three on 4 Nov.** Finding 1's page:

> **Checked** · research last checked 2 Nov 2026 · studies checked for retractions 4 Nov 2026
>
> In one trial of 240 adults with Velmor syndrome, zentarine for 12 weeks halved the tremor score in 1 more person in
> 10 than placebo, and caused nausea in 1 more person in 20.
>
> How sure: low, one trial (AskRigor's rating, not formal GRADE). Checked by a full-text audit.
>
> At 12 weeks: tremor score halved in 30 of 120 on zentarine (25%) and 18 of 120 on placebo (15%): NNT 10. Nausea in
> 12 of 120 (10%) and 6 of 120 (5%): NNH 20.
>
> A quick answer says it is well tolerated. It misses the trial's numbers and the nausea.
>
> What would change it: a second trial of similar size. Source: Synthetic Trial A.

On the Velmor syndrome page, finding 1 sits under Options, 2 under Products, 3 under "Searched, nothing found", and the
lead under "Not yet checked" (if decision 3 is b). The zentarine page shows a Velmor syndrome row, nausea under Harms,
and finding 2 under "What was tested and what is sold". The question page lists the three findings and the quick
answer, marked "not checked". Finding 2 can enter "Most unexpected"; finding 1 cannot, as its certainty is low.

**Later (hypothetical).** A new accepted card reports Synthetic Trial B: 180 adults, 200 mg twice a day, no difference
in tremor. Its AI declares that it contradicts finding 1 at a lower dose; you accept, and both pages turn
**Contested**, naming the dose. If a pooled analysis later replaces finding 1, it turns **Superseded** and points there.

## 6. Decisions for you

**Decided by the owner, 22 October 2026, about 14:39 UTC:** "159 1b (nobody agreed to anything yet except me) 2a 3b
4a 5a 6a 7 when someone deletes a findings card they should explain why. if the findings are still valid they can't
remove valid findings, only if they realized the findings were invalid".

1. **b:** add the publishing sentence first, and publish from older cards too. Until now only the owner has agreed to
   any notice, so every older card is the owner's.
2. **a:** "Most important now" holds the owner's picks, up to 5, each with the owner's reason.
3. **b:** leads appear in a "Not yet checked" list on condition, product and question pages, never in lanes or search.
4. **a:** the community section is built switched off until the YouTube compliance review ends and the owner approves
   a field-by-field rule.
5. **a:** a correction shows the corrected text with a dated note, and the old wording stays in the history.
6. **a:** a retracted or corrected key study, or 12 months without a check, raises a warning at once, and the finding
   leaves the lanes.
7. **The owner's rule**, with the distinction proposed in reply at 14:47 UTC, which the owner agreed to ("on 7 i agree", about 15:35 UTC):
   - What ties a card to its contributor (the account link, the ARF record) is removed whenever the contributor asks,
     with no reason required; asking why is optional. This is a privacy-law right, and the privacy page promises it.
   - A published finding is general knowledge written without the person, so it stays while it is valid. Anyone who
     thinks it is wrong explains why, and the owner reviews it as a correction (5a).
   - A finding that could identify the person is rewritten or removed.
   - The notice wording from 1 says this before anyone contributes.

The options as they were put follow.

Everything not listed follows your earlier answers. Answer by number and letter, for example `2: a`.

**1. Wording before anything is published.** The privacy page, terms, free notice and paid save offer say cards are
saved for review. None says accepted findings may be published.

- a) First add a sentence saying accepted findings may be published, written without the person. Free contributors
  accept the new notice once. Publish only from cards saved after that; an older finding gets in when a later answer
  finds it again.
- b) As a, and also publish from older cards, since cards hold no personal details.
- Recommended: **a**. It is what people agreed to.

**2. How "Most important now" is ordered.**

- a) Your picks: up to 5, each with your one-line reason shown. Nothing new to build; it takes your time.
- b) A named formula: at review you confirm the AI's 0 to 3 ratings for burden, reach and what it changes (burden and
  reach with a public source). The lane sorts by them and certainty, and shows each value.
- c) Only what exists: certainty, depth of checking, recency. It ranks how well a finding was checked, not how much it
  matters.
- Recommended: **a** at launch, **b** from about 50 accepted findings.

**3. Leads (not yet checked).**

- a) Not public.
- b) On condition, product and question pages, in a "Not yet checked" list; never in lanes or search. Each still needs
  your acceptance.
- c) As b, plus a home-page lane.
- Recommended: **b**.

**4. Community reports on finding pages.** The storage policy keeps community content out of the Atlas database until
the YouTube compliance review ends and you approve a field-by-field rule. Under 156a nothing shows before you accept
it.

- a) Build the section now and keep it off until then. Afterwards only what you accepted shows: reports, not rates,
  with how many videos or threads were read.
- b) No community section; community reports stay in your review.
- Recommended: **a**.

**5. How a correction is shown.**

- a) The corrected text, with a dated note at the top saying what changed and why. The old wording stays in the
  history, and the change appears under "Recently changed".
- b) As a, and the old wording also stays on the page, struck through, for 90 days.
- Recommended: **a**.

**6. Warnings without your review.** When AskRigor's retraction check finds a key study retracted or corrected, or a
finding has gone 12 months without a check:

- a) A warning shows at once and the finding leaves the lanes; you confirm or clear it later. A narrow exception to
  156a: a warning can only lower confidence.
- b) Nothing changes until you review.
- Recommended: **a**.

**7. Deleting a card whose findings are public.** People can ask to delete their card by its ARF number.

- a) Findings that rest only on that card come off the Atlas; their pages say "withdrawn" with the date. A finding
  another accepted card also reached stays.
- b) The card leaves your inbox; published findings stay, since they hold no personal details.
- Recommended: **a**.

## 7. What exists and what needs building

| Part | Exists | Needs building |
| --- | --- | --- |
| Storage | Cards in your private inbox, with stamps and later saves. The Atlas database: topics, questions, studies, study audits, claim versions with statuses and links, research maps | Accepted findings in the Atlas database, tied to their studies; new card fields; change records; public finding numbers, never ARF numbers |
| Review | You read cards in the inbox. Research maps have an owner review tool with related records and a dry run | Accept, edit or reject per finding, as an owner action in an existing tool (the connector stays at 33 tools) |
| Merging | Cards: exact wording; one account's newer card on the same question replaces its earlier one. Atlas database (138b): one record per topic, question or study; topic links by meaning | Links by meaning for findings, subjects and questions; re-saves of accepted findings counted as re-checks |
| Public site | askrigor.com: home, privacy, terms and support pages, built ahead of time, no cookies. No Atlas pages | Code that builds pages from accepted records, with no model call; decision 1's wording; privacy data map rows |
| Search | The connector's catalog search over topic names and questions, for research | A search index built with the pages |

New card fields, per finding: kind (the 156 test's six: effect, harm, overlooked option, correction, nothing found,
tested against sold), subject and its type, direction, the numbers block, the community sentence, and the scope of a
search that found nothing; per card, the topic. The research AI fills them while the papers are open; code checks the
exact parts; you confirm at review.

## 8. Against the 30 August design

**Kept:** pages built from the Atlas database; a person accepts everything first; the four home lanes; named,
versioned ranking with visible parts and no single score; certainty that names its basis; history that never
overwrites; repeats and votes never raise certainty.

**Changed:** findings come from checked research answers through cards and your review, not from a team of research
workers. The nine finding classes become the 156 test's six kinds and your four labels ("original discovery" needs a
novelty scan, so it is not used), and the six public states become your four labels plus two warnings. "Unexpected"
is measured against the card's quick answer, not a separate dated expectation record. The "provocative but
provisional" lane leaves the home page. Intervention or product pages and question pages are new.

**Later:** the evidence explorer (forest plots, study tables, risk-of-bias detail); live follow-up questions (each
needs a model call, so a new spending decision); a feedback form; access, cost and equity ratings; MeSH condition
names; a full web app, public API and database search; "since your last visit", which would store something in the
visitor's browser, which the privacy page rules out today.
