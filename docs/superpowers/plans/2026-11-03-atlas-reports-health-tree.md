# People's reports, the Health tree and problem pages at a glance (owner answer 229a)

3 November 2026. Branch `claude/atlas-reports-20261103`, on top of the Atlas drafts (#396, #397, #403, #405, all
brought up to date with main at 16:00 UTC). The owner's direction page (private, owner-pages
`askrigor/atlas-direction-2026-11-03.md`) has the reasons, the test of the cards and the brainstorm. This plan is the
build.

## The owner's words

- 229a, typed in the next-build session at about 15:34 UTC: "229a i shouldn't need to approve reports from people
  unless they don't pass AI checks for safety (if it's safe to try, people can try it, if some warning needs adding, AI
  can add the warning as an AI warning). only send me the stuff you can't understand if it's safe to publish or if it's
  too crazy".
- In the same message, on GPT's private practitioner scorecard (atlas-ledger, `PRACTITIONER_EVIDENCE_AT_A_GLANCE.md`):
  "that's what i'm talking about for the atlas. make that prominent, we need to have more real value added things
  like that in the atlas."
- Earlier the same day: "One of the main points of the atlas is people can submit things that worked for them or their
  own experiences that are unique and interesting. like earthclinic, but with the additional research around it", and
  "All the health things should be in Health category and whatever applicable subcategories."

Done elsewhere, not here: the next-build session took 74 unchecked cards off the Atlas (229a, part 1). Owner question
231 asks whether the 41 accepted findings that failed the test are withdrawn now (A) or wait for a switch that takes an
accepted finding off the pages and can put it back (B); with B, that switch belongs in this build (step 7).

## Limits

- Zero model-API spend. The AI checks run on the owner's Claude plan (a Claude session with the AskRigor connector,
  signed in as the owner's reviewer login), a few reports a day. Reports sent through someone's own AI are researched
  on that person's plan; AskRigor's own check still runs before anything is published, because a person can tell their
  AI to call anything safe.
- The tool list is frozen (189a): new inputs go only in `later_inputs`, a new action only in a runtime enum, and the
  guidance that names them in results.
- Judgments of meaning (is it safe, is it promotion, does the research support what is shown) are the model's, never a
  word list. Code checks exact things: lengths, the shape of a verdict, contact details and links (the comment check),
  link hosts, identifiers.
- YouTube comment counts and anything drawn from YouTube comments stay off public pages (208b, 227); the page guard
  refuses YouTube links (171).
- The review tool is owner-only. Publishing a report that passed its checks is the owner's 229a rule, so it needs no
  per-item confirmation; a held report is published only with the owner's words for that report.
- Releasing anything waits for the owner's yes typed in the session that releases it. Nothing here touches production.
- The next build (#398) owns the forum reader, the final check and the meaning judge: their files stay untouched. The
  line that tells a person's AI about sharing a report belongs in a result the final check returns, so it waits until
  #398 is merged (step 5).

## 1. The Health tree

- One tree in code, `apps/research-mcp/src/atlas/health-tree.ts`: Health and its 22 subcategories, the names of the
  30 Oct channel-registry list (Colds, flu and infections; Dizziness, balance and ears; Neck and back pain; Joints,
  muscles and pain; Diet and weight; Blood sugar; Heart and blood pressure; Sleep; Mental health and stress; Gut health;
  Women's health; Men's health; Strength and fitness; Supplements; Long-term illnesses; Skin, hair and nails; Eyes;
  Brain and memory; Bladder and kidneys; Hospital care; Toxins and detox; Home and environment). Other fields get a
  top category of their own when their first item arrives.
- Where an item sits is data, not code: a placement per publication, accepted finding or report (one subcategory
  each), set with a new review action `place_items` (229a decided the rule, so no confirmation per item) and listed
  with `list_unplaced`. The direction page's placement of today's findings is the first input.
- Pages: `/atlas/health` (the subcategories with how many items each holds), `/atlas/health/<key>` (the subcategory:
  its problems at a glance first, then people's reports, then findings).

## 2. People's reports

**What a report holds:** the problem; what was tried (the product, the dose, how it was used, for how long); what
happened and how long it lasted; side effects; anything else that changed at the same time; the name it is published
under (the person's Atlas display name, or none); the door it came by; and its state. Each field has a length limit and
the comment check for contact details and links. Reports are numbered `R-1001` onwards.

**States:** received (private) -> published, published with an AI warning, held for the owner, or refused (promotion,
spam, not a report). A reporter can take theirs down at any time, which deletes it with its answers; deleting
everything from the account page deletes all of theirs.

**Door 1, the Atlas form** (`/atlas/share`, signed in as for comments): the fields above; the consent line, required:
"Publish my report on the Atlas in my own words, under my display name or no name. I can take it down at any time.";
a note that it is not medical advice; the refusal for contact details and links. After sending: its number, and that
it stays private until the checks pass. `/atlas/account/reports` lists the person's reports with a take-down button.

**Door 2, through the person's own AI:** `manage_research_access` with action `share_report` (runtime enum) and
`later_inputs.report` (the fields, the research block of section 3, the name choice, and `confirmed: true` after the
person saw exactly what would be published and said yes); `take_down_report` with `later_inputs.reportNumber`. The same
participant key as the Atlas sign-in, so the person sees and takes down both doors' reports in one place.

**"Worked for me too" and "didn't":** on a published report, one answer per signed-in person, shown as counts.

**Storage:** migration `0024_atlas_reports.sql`: `atlas_reports`, `atlas_report_answers`, `atlas_placements`, with the
same pattern as votes and comments: security-definer functions, the public runtime role writes only through its
functions, the review role through its own, and forgetting a participant removes their reports and answers.

## 3. The AI checks and the research

**The queue:** review actions `list_reports` (the received reports, oldest first, with their fields and research),
`check_report` (the checker's verdict) and `decide_report` (the owner's word on a held report). A verdict is one of:
- `publish`: safe to try as reported;
- `publish_with_warning`: publish, with a caution the AI writes, shown in a box labelled "AI warning";
- `hold`: for the owner, with the reason: not safe, the AI can't tell whether it is safe to publish, or too far out;
- `refuse`: promotion, spam, or not a report of someone's own experience.

Each verdict also places the report in one subcategory and, for form reports, carries the research. Code checks the
verdict's shape; the server publishes, holds or refuses accordingly and clears the pages' cache.

**The checker:** a Claude session on the owner's plan, run a few times a day from a short prompt kept in the repository
(`docs/atlas-report-check.md`): list the received reports, judge each, research the form reports with AskRigor's own
tools, record each verdict. No API key and no spend.

**The research block** (both doors): what others report (forum threads on the same remedy for the same problem, each
linked, with the outcome each person reported: better, no change, worse or mixed, counted by person); what the studies
show (title, year, identifier, what it found); safety (known harms, interactions, who should avoid it); and what isn't
known. Exact checks: links only to the forum hosts AskRigor reads and to study pages, never YouTube; identifiers well
formed; counts equal to the listed people.

**The report card** (`/atlas/reports/R-1001`): the person's report in their words at the top, labelled as written by a
person and checked by an AI; the AI warning, when there is one; the four research parts; the "worked for me too" and
"didn't" counts and buttons; "report a problem".

## 4. Problem pages at a glance

The shape of GPT's scorecard, made the first thing a visitor sees for a problem: the encouraging results first, each
with its comparison, its follow-up and its limit, in the scorecard's classes (a controlled benefit against a named
comparison; a named practitioner's published outcome series; a programme's outcomes; a historical lead worth chasing),
then what failed or harmed. People's reports for the problem are counted beside them.

- Rows come from the Atlas's own findings with numbers (a clear difference between two groups is a controlled row,
  computed from the finding's declared numbers), and from rows the owner approves.
- The practitioner scorecard becomes the first public one only after three checks: a source check of each row's
  numbers, a named-person screen (published outcomes only, no allegations), and the owner's yes to publish it.

## 5. Privacy, terms and the line that offers sharing

- The privacy page gets a section "Reports of what worked for you": what is collected, the consent, that the AI checks
  it before it is published (and what the checks look at), who sees a held report (the owner), the take-down, and the
  counts. The terms get a matching section. The data map gets the three tables and the two doors.
- The offer to a person's AI ("tell AskRigor what worked for you") goes in the final check's result, so it waits for
  #398 to merge, and then it is one small change.

## Order

1. This plan.
2. The Health tree: the tree, placements, `place_items` and `list_unplaced`, the pages.
3. Reports: the migration, the form, the card, take-down, answers, the account page; privacy, terms and data map.
4. The queue and the checker: the three review actions, the prompt.
5. Door 2: `share_report` and `take_down_report` (the offer line after #398 merges).
6. The research block's rendering and its exact checks.
7. Problem pages at a glance; with 231B, the switch for accepted findings.
8. The full gate (`npm run verify`), the private-map check, a draft pull request into #405's branch, and the owner
   page. Release only with the owner's yes.

## Progress

- 3 Nov, `b67569d5`: step 2 done. The Health tree (`apps/research-mcp/src/atlas/health-tree.ts`), migration 0024
  (`atlas_placements`; the review role's `set_atlas_placements` and `inspect_atlas_placements`), the review's
  `place_items` (`later_inputs.placements`) and `list_unplaced` (`apps/research-mcp/src/atlas/placement-review.ts`),
  `/atlas/health` and `/atlas/health/<key>` (`health-pages.ts`), and the Health link in the header.
- 3 Nov, `30162a77`: step 3's store. Migration 0025 (`atlas_reports`, `atlas_report_answers`; the access role's
  `submit_atlas_report`, `take_down_atlas_report`, `set_atlas_report_answer`, `forget_atlas_reports`; the review role's
  `inspect_atlas_reports`, `decide_atlas_report`), `packages/evidence-repository/src/atlas-reports.ts` (in memory and
  PostgreSQL), the pages' reads (`readReport`, `listReports`, `listOwnReports`). `npm run
  contributor-access:postgres-acceptance` runs a report through every role on a real database.
- Next in step 3: the HTTP side in `pages-http.ts` (the form at `/atlas/share`, the card at `/atlas/reports/R-<n>`,
  answers, `/atlas/account/reports` with take-down, and "delete everything" also calling `forgetReports`), the reports
  under their subcategory on the Health pages, and the privacy page, terms and data map. Then step 4 (the review's
  `list_reports`, `check_report`, `decide_report` over `AtlasReportReviewStore`, and `docs/atlas-report-check.md`).
- 3 Nov, `26cf961b`: step 3 done. The form, the report page, answers, take-down, the account page, the reports on
  their Health page, and the privacy page, terms and data map (the privacy page's date changes at release).
- 3 Nov: step 4. The review's `list_reports`, `check_report` (the AI check's verdict, no confirmation: 229a) and
  `decide_report` (the owner's word on a held report, with `confirm: true`), in `apps/research-mcp/src/atlas/report-review.ts`;
  the checker's steps in `docs/atlas-report-check.md`.
- Owner 232b: the four finding-page drafts wait and go out with this build. Owner 231a: findings kept for AskRigor's
  research but not shown are built on their own, in #410 into main; when this stack next takes in main, its migrations
  become 0025 (placements) and 0026 (reports), and the search index, map, sitemap and Health pages leave kept
  publications out.

