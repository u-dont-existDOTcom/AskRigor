# Decision 165a: answer sentences built from AskRigor's words plus a phrase the AI declared

Status: proposal for the owner (owner answer "165a", 23 Oct 2026: the server's words first, then a colon, then the
AI's phrase, and the sentence stays exact). Nothing is built until the owner has seen this list. Drafted by a Claude
helper from the code at c9e7c15a and the 23 Oct answers, checked by the maintainer session, which revised 19 rows
(A1, A3, R1–R3, C1–C4, C6–C11, U4, U5, P1, P3) so that the words just before each colon name what follows (rule 2).

Code: this repository at c9e7c15a (the build branch on 24 Oct). File paths below are relative to it, and
`gate` means `apps/research-mcp/src/research-finalization-gate.ts`.
Answers: the 89 delivered answers of the 23 Oct regression run against release #361 (kept on the maintainer's
laptop; the judgment is `docs/audits/2026-10-23-owner-regressions-judgment.md`). Between #361 (1582f063) and c9e7c15a the gate gained one caveat, the YouTube-quota sentence at gate:1796,
which holds only server words. Every template below therefore produced the 23 Oct answers.

## Summary

- **43 sentence templates** reach the answer with an AI phrase spliced into fixed wording. They come from 30 call
  sites, and some have one variant per case. All are in `gate`; `findings/card.ts` adds none, because its save offer
  inserts only counts. Two more templates already have the colon form and need no change: the
  community-skip caveat and the "Study focus / Community focus" captions. The plain-answer note already quotes the
  AI's claims after colons.
- **21 of the 43 are broken in the 23 Oct answers.** 9 more appear there but read correctly, and 13 do not appear at
  all. "Broken" here covers more than the judgment's 44 capital letters in 26 answers. It also counts a missing
  article ("in 2026 pilot"), an AI clause running into the server's wording ("…mobility; nine selected …
  reports …, so its reports are not evidence"), a doubled stop ("unspecified.).") and wording that misreads ("tested in
  crocin capsules").
- **Tests pin the wording of 42 of the 43.** There are 71 pinning sites in 13 test files. 61 are literal strings, and
  10 are built from the exported start constants, which stay valid if the colon goes inside the constant. Only "A
  search of {community} turned up no relevant reports." has no test. Four checks look only for a fragment, or for its
  absence, so a wording without that fragment would make them test nothing:
  `finalize-community-report-identity.test.ts:185`, `research-finalization-gate.test.ts:680` and `:1078`, and
  `finalize-next-steps-contract.test.ts:375`. The proposals keep the fragment three of them look for; `:185` must be
  pointed at the new start.
- **Documentation and the published tool list.** The tool description and six schema descriptions quote three of the
  templates: harm, option class and named target. Changing those wordings means regenerating
  `docs/tool-inventory-v0.1.0.json`, which `tests/release-packet.test.ts:618` compares byte for byte, and it moves the
  tool-list version. `docs/privacy-data-map.md:641–643` quotes the same three. No protocol, Custom GPT file or plugin
  file quotes any of these sentences.

## How the proposals are built

1. **One AI phrase.** The server's words name what follows, then a colon and the phrase, then a stop. The existing
   helper `completedCaveat` (gate:132) builds exactly this: it collapses white space, keeps the phrase's own end mark
   (as with "。") and adds "." otherwise. For the exported starts (harm and option classes), put the colon inside the
   constant, as `COMMUNITY_SKIP_CAVEAT_START` already does. Then `completedCaveat`, the descriptions written as
   `"${START} [harm]."` and the 10 test sites built from the constants all stay valid unchanged.
2. **Any rest of the old sentence** moves into a following sentence of server words, so the words just before the
   colon name the phrase, as in question 165's two examples ("Not tested as described in any study I found: {label}.").
   It stays before the colon only where the words just before the colon still name the phrase (A2, H1, H4, H5,
   U1–U3). Either way the AI's phrase ends its sentence.
3. **Two phrases of the same kind** (two options compared, two studies, several community names) share one colon and
   are separated by "; ". AI phrases contain commas and "and" ("Earth Clinic insomnia and topical remedy pages"), which
   makes today's ", … and …" join ambiguous.
4. **Phrases with different roles** (what was measured and what people use, an intervention and its open inputs, a
   product and its site, an exposure and its community, a study label) get the server's sentence first, then one short
   labelled sentence per phrase ("What was measured: {…}." "Source: {…}."). Each phrase still follows a colon and ends
   a sentence.
5. **The capital after the colon** is harmless. The answer check compares caveats with case ignored (`caveatText`,
   gate:4114), so the AI may keep the phrase's capital or drop it.

Field names in braces below are the AI's declarations unless marked as server values.

---

## A. Studies and audits

**A1. Figures that don't match the study's own data.** `gate:2335` (`caveatOnce` at 2334)
- Current: `The reported figures in {marker} don't match the study's own data, so its results stay unreliable until they are reconciled.`
- Inserted: AI: `marker`, which is `key_sources[].answer_marker` (3–80 characters), or the source's identifier when that
  is missing (gate:2323).
- 23 Oct: **broken**. In about 12 of 25 occurrences the label has no article or starts with a capital: *"The reported figures in
  2026 pilot don't match the study's own data…"* (o354-changed-after-check). Others: "in Occipital-stimulation study",
  "in supervised keto with ongoing medication and psychotherapy", "in published example".
- Proposed: `A study whose reported figures don't match its own data: {marker}. Its results stay unreliable until they are reconciled.`
- Delicate: `tests/study-audit-reported-figures.test.ts:209`.

**A2. A value impossible as printed.** `gate:2340` (2339)
- Current: `The value {value} in {marker} is physically impossible as printed, so it is not used.`
- Inserted: AI: `value`, the audit's declared printed figure (`validate_study_method_audit` `reported_figures[].reported`,
  up to 80 characters, cut to 40 in the receipt at `register-tools.ts:3272`), and `marker` as in A1.
- 23 Oct: **broken**, 2 of 4: *"The value Mean 0.75, SD 0.96 in Zhou and colleagues, 2023 is physically impossible as
  printed…"* (s360-studies) and "The value 97.7 in Zinc supplement case…" (q132-copper-b12).
- Proposed: `A value that is physically impossible as printed, so it is not used: {value}. Study: {marker}.`
- Delicate: `tests/study-audit-reported-figures.test.ts:211`. The value can arrive cut short at 40 characters.

**A3. Two studies with identical results.** `gate:2351` (2350)
- Current: `{a} and {b} report identical results, so they are counted once, not as independent replication.` The sentence
  starts with an AI phrase.
- Inserted: AI: two markers, or both identifiers when the two labels are equal (gate:2348–2349).
- 23 Oct: not seen.
- Proposed: `Two studies that report identical results: {a}; {b}. They are counted once, not as independent replication.`
- Delicate: `tests/study-audit-reported-figures.test.ts:190`.

**A4–A7. The named target no key study tested as described.** Helper `namedTargetCaveat` at `gate:247–265`, called at
2473–2475. Inserted: AI: `named_target.label` (up to 160 characters, end punctuation removed). Server: `fields`, from
`TARGET_FIELD_WORDS` (gate:215).

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| A4, one study, fields differ | 257 | `The study I found did not test {label} as described: it differs in {fields}, so it is indirect evidence about it.` | **broken**, 1–2 of 5: *"The study I found did not test garden sleeping net as described…"* (q120-mosquito-net); "did not test your situation" (o354-emergency-first) | `Not tested as described in the study I found: {label}. The study differs from it in {fields}, so it is indirect evidence about it.` |
| A5, several studies, fields differ | 258 | `None of the studies I found tested {label} as described: they differ in {fields}, so they are indirect evidence about it.` | **broken**, 15 of 31 start with a capital: *"None of the studies I found tested Occasional ordinary edible kelp as described…"* (l22-kelp-iodine); also "Y for X-induced chills", "the described … routine as described" | `Not tested as described in any study I found: {label}. The studies differ from it in {fields}, so they are indirect evidence about it.` (the owner's example) |
| A6, one study, nothing comparable | 262 | `The study I found is not known to have tested {label} as described: {fields} could not be compared, so how directly it applies is not known.` | not seen | `Not known to have been tested as described in the study I found: {label}. {Fields} could not be compared, so how directly the study applies is not known.` |
| A7, several studies, nothing comparable | 263 | `None of the studies I found is known to have tested {label} as described: {fields} could not be compared, so how directly they apply is not known.` | **broken**, 1 of 2: *"None of the studies I found is known to have tested Daily beetroot juice as described…"* (l49-b-label) | `Not known to have been tested as described in any study I found: {label}. {Fields} could not be compared, so how directly the studies apply is not known.` |

- Delicate:
  - Tests: `tests/finalize-named-target.test.ts:91` (INDIRECT), `:134–142` (the helper's four outputs), `:228`, `:412`
    and `:426`; `:438` and `:455` call the helper.
  - Two schema descriptions quote the sentence. At `gate:584–586`, `named_target.label` says *so that "None of the
    studies I found tested [label] as described." reads as a sentence*; that guidance can go. At `gate:612–613`,
    `named_target` quotes the whole caveat. Both feed the tool inventory (`docs/tool-inventory-v0.1.0.json`, around
    line 17076) and the tool-list version. `docs/privacy-data-map.md:643` also quotes it.
  - In A6 and A7, the fields now start a sentence, so their first word ("the …") needs a capital.
  - The limit at `gate:2473`, which is addressed to the AI, keeps the old shape ("No key study is shown to have tested
    {label} as described"). It is out of scope, but `finalize-named-target.test.ts:102` pins it if it is changed to
    match.

**A8–A11. Mechanism caveats.** `gate:2853–2866`. Server: route words from `EVIDENCE_ROUTE_WORDS` and `USE_ROUTE_WORDS`
(`administration-routes.ts:24–51`). AI: `marker`, which is the first study's `answer_marker`, else its identifier
(`markerFor`, gate:2689).

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| A8, other route, in animals | 2855–2856 | `This finding comes from {evidence route} in animals in {marker}; {use route} in people was not tested for it.` | not seen | `This finding comes from {evidence route} in animals; {use route} in people was not tested for it. Source: {marker}.` |
| A9, other route | 2857–2858 | `This finding comes from {evidence route} in {marker}; {use route} was not tested for it.` | **broken**, 3 of 4: *"This finding comes from test-tube experiments in Weak-acid experiments; use on the skin was not tested for it."* (l36); "in review of odor experiments" (l32) | `This finding comes from {evidence route}; {use route} was not tested for it. Source: {marker}.` |
| A10, animal experiments | 2861 | `This finding comes from animal experiments in {marker}; it was not tested in people.` | seen once, reads correctly ("in Carvalho et al. 2015", r330) | `This finding comes from animal experiments; it was not tested in people. Source: {marker}.` |
| A11, another tissue | 2865–2866 | `This finding was measured in {tissue.measured} in {marker}, not in {tissue.claimed}.` It has three AI phrases (each tissue up to 120 characters). | **broken**, 2 of 2: *"This finding was measured in human laboratory memory and physiological measures under electrical stimulation in Occipital-stimulation study, not in human subjective focus after vinegar application."* (l36) | `This finding was measured in a different tissue from the one this answer applies it to. Measured in: {measured}. Applied here to: {claimed}. Source: {marker}.` |

- Delicate: tests `tests/finalize-safety-terms-mechanisms.test.ts:189` (A8),
  `tests/finalize-recommendations-and-lesson-checks.test.ts:154` (A9), `:144` (A10) and `:156` (A11).

## H. Harms and safety

Inserted: AI: `safety_claims[].exposure` (up to 300 characters) and `measured_exposure` (up to 300), both passed
through `plainPhrase`, which removes end punctuation. These sentences sit at `gate:2729–2756`.

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| H1, share of reports (safety) | 2732 | `That figure is a share of selected reports, not of people, so it doesn't show how safe {exposure} is.` | not seen | `That figure is a share of selected reports, not of people, so it doesn't show how safe this exposure is: {exposure}.` |
| H2, harm from a measurement | 2739–2740 | `This warning rests on measurements of {measured}, not on harm observed in people using {exposure}, so how often it would cause harm wasn't measured.` | **broken**, 1 of 3: *"This warning rests on measurements of Infant salivary cortisol before sleep … not on harm observed in people using Residential extinction program, so how often it would cause harm wasn't measured."* (i45) | `This warning rests on measurements, not on harm observed in people, so how often it would cause harm wasn't measured. What was measured: {measured}. What people would use: {exposure}.` |
| H3, safety from a measurement | 2748–2749 | `This rests on {measured}, not on observed safety in people using {exposure}, so long-term or rare harms are unmeasured.` | seen twice, reads correctly (r325, q81) | `This rests on a measurement or an animal test, not on observed safety in people, so long-term or rare harms are unmeasured. What it rests on: {measured}. What people would use: {exposure}.` |
| H4, safety from case reports | 2752 | `Case reports can show that a harm happens, but not that {exposure} is safe.` | not seen | `Case reports can show that a harm happens, but not that this exposure is safe: {exposure}.` |
| H5, safety not quantified | 2755 | `How often harms occur with {exposure} wasn't quantified in the sources found here.` | **broken**, about 4 of 14: *"How often harms occur with 20-minute early-afternoon nap in adults with good nighttime sleep wasn't quantified…"* (q135-low-stakes); "with Brief mindful observation of a spontaneous aura" (q126-40); "with unknown-concentration vinegar wraps plus elevation and usual care, one month" (l35) | `How often harms occur wasn't quantified in the sources found here for this exposure: {exposure}.` |

- Delicate:
  - Tests: `tests/finalize-safety-terms-mechanisms.test.ts:78` (H2), `:83` (H3), `:86` (H4) and `:88` (H5), and
    `tests/finalize-recommendations-and-lesson-checks.test.ts:121` (H1). The fixture at `:77` passes a phrase ending
    in "." and depends on `plainPhrase` removing it.
  - The second reader ignores "the answer's caveat sentences" by their meaning, not their words
    (`second-reader.ts:25–26`), so it needs no change.

**H6. A serious harm not checked.** `HARM_NOT_CHECKED_CAVEAT_START` is at `gate:176`, helper `harmNotCheckedCaveat` at
179–181 (through `completedCaveat`), called at 2838–2839.
- Current: `This answer did not check {harm}.`
- Inserted: AI: `harm_screen[].harm` (up to 150 characters).
- 23 Oct: seen in 10 answers, all reading correctly ("This answer did not check serious vaccine adverse reactions.",
  q130). The capital in "Velloria-specific" is a product name.
- Proposed: put the colon in the constant, `HARM_NOT_CHECKED_CAVEAT_START = "A serious harm this answer did not
  check:"`, which gives `A serious harm this answer did not check: {harm}.` This keeps the words the owner gave in
  128b ("This answer did not check [harm].") but changes their shape; 165a overrides that.
- Delicate:
  - Tests: `tests/finalize-harm-screen.test.ts:96` (NOT_CHECKED, a literal string). `:365`, `:367`, `:388`, `:416`,
    `:614` and `:637` use the constant and hold if the colon is inside it.
  - The tool description at `register-tools.ts:2223–2224` and the schema at `gate:748–750` and `:771` quote
    `"${START} [harm]."`. The "so that … reads as a sentence" guidance at 748–750 can go. Either way the tool inventory
    is regenerated and the tool-list version moves. `docs/privacy-data-map.md:641` also quotes the sentence.

## R. Options put forward for the person

Inserted: AI: `recommendations[].intervention` (up to 200 characters; `sentenceStart`, gate:2877–2880, adds a capital at
the start of the sentence), `open_inputs` (up to 300) and `longest_follow_up` (up to 120).

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| R1, safety unresolved | 2894 | `{Intervention} needs a clinician's review of {open} before it could be recommended for you.` | not seen | `An option that needs a clinician's review before it could be recommended for you: {intervention}. What the review covers: {open}.` |
| R2, safety conditional | 2895 | `{Intervention} depends on {open}, which a clinician should confirm first.` | seen 16 times, reads correctly, because the intervention starts the sentence ("SSRI treatment depends on medical-history and interaction screening, which a clinician should confirm first.", o355-best-ocd) | `An option that depends on something a clinician should confirm first: {intervention}. What to confirm: {open}.` |
| R3, long-term use, shorter evidence | 2916–2918 | `The evidence on {intervention} followed people for {longest_follow_up}, so its benefits and harms over years of use, and how easily people stop it, aren't established.` | **broken**, 3 of 11: *"The evidence on Specialist medication augmentation followed people for eight weeks in the directly audited risperidone comparison…"* and "followed people for continuation studies lasting up to one year" (o355-supplement-table); "for six months in cited STRIVE trial" (q137) | `An option for long-term use whose evidence followed people for less time: {intervention}. Longest follow-up in that evidence: {longest_follow_up}. Its benefits and harms over years of use, and how easily people stop it, aren't established.` |

- Delicate:
  - Tests: `tests/finalize-recommendations-and-lesson-checks.test.ts:62` (R1), `:67` (R2) and `:81` (R3), and
    `tests/finalize-harm-screen.test.ts:90` (R2).
  - `sentenceStart` becomes unnecessary.

## O. Research coverage and the another-pass offer

**O1–O2. A class of treatment not researched, or out of reach.** `OPTION_CLASS_CAVEAT_STARTS` is at `gate:190–193`,
helper `optionClassCaveat` at 196–198, called at 2039–2043.
- Current: `This answer did not research {class}.` (191) and `This answer could not reach the research on {class}.` (192).
- Inserted: AI: `option_classes[].option_class` (up to 120 characters).
- 23 Oct: O1 is **broken**, 2 of 7: *"This answer did not research Inositol, CBD/cannabis, probiotics and other integrative
  approaches."* and "This answer did not research Exercise and lifestyle support." (o355-supplement-table). O2 is
  not seen.
- Proposed: put the colon in the constants. `not_researched: "A class of treatment this answer did not research:"`
  gives `…: {class}.`, and `inaccessible: "A class of treatment whose research this answer could not reach:"` gives
  `…: {class}.` This keeps 153a's words in the new shape.
- Delicate:
  - Tests: `tests/finalize-option-classes.test.ts:56–57` and `tests/finalize-next-steps-contract.test.ts:385` are
    literal. `finalize-option-classes.test.ts:100`, `:311`, `:325` and `:415` use the constants.
  - Schema descriptions at `gate:366–368` (with the same "reads as a sentence" guidance) and `gate:382–384` feed the
    tool inventory (around line 16648). `docs/privacy-data-map.md:642` also quotes the sentences.

**O3–O4. The another-pass offer.** Part of the `requireLimit` at `gate:2514–2530`. The estimate is
`withoutEndPunctuation(another_pass_estimate)` (gate:2507), up to 200 characters with at least one digit.

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| O3, studies and communities | 2526–2527 | `Another pass would take {estimate}; would you like to go deeper into the studies or the communities, and which focus matters most to you?` | **broken**, 14 of 50 start with a capital, and some estimates run their own clauses into the question: *"Another pass would take About 20–40 minutes for 2 paper audits or a focused community pass…; would you like to go deeper…"* (q126-40); "Roughly 10–20 additional source checks" (o354-continue); "about 30–60 minutes; access may limit the results; would you like…" (l30) | `What another pass would take: {estimate}. Would you like to go deeper into the studies or the communities, and which focus matters most to you?` |
| O4, studies only | 2528–2529 | `Another pass would take {estimate}; would you like to go deeper into the studies, and which focus matters most to you?` | seen 3 times, no capital, but one runs on: "Another pass would take 15–30 minutes for 1 optional study-method pass; access may remain limited; would you like…" (l33 turn 2) | `What another pass would take: {estimate}. Would you like to go deeper into the studies, and which focus matters most to you?` |

- Delicate:
  - The owner's example label is "Time another pass would take:". 5 of the 53 estimates on 23 Oct were not times,
    so I suggest "What another pass would take:" unless `another_pass_estimate`'s description (gate:405–407) is
    tightened to ask for a time. Those five are "Roughly 10–20 additional source checks", "10–20 targeted source
    checks", "20–30 tool calls…", "roughly 2–4 additional full-text study audits or 2–3 discussion pools" and "about
    15–25 focused tool calls".
  - Keep the question in the same caveat as a second sentence (the focus captions already have two sentences), or
    split it into its own caveat.
  - Tests: `tests/research-finalization-gate.test.ts:162` (OFFER_CAVEATS, reused across that file), `:167`
    (STUDIES_OFFER_CAVEATS) and `:2594`. No description quotes the sentence.

**Already in the colon form, no change:**
- The focus captions at `gate:2524`: `Study focus: {topic}. {Why}.` and `Community focus: {topic}. {Why}.` Here
  `open_leads[].why` is the AI's whole sentence, which `asSentence` (gate:4211) capitalises and closes. They appear
  about 200 times on 23 Oct, all reading correctly. Tests: `research-finalization-gate.test.ts:155–161`, `:2591–2592`
  and `:2615`.
- The community skip at `gate:127` and `138–140`, called at 1734: `I did not search firsthand reports or community
  discussions for this answer: {not_relevant_reason}.` It appears in 37 answers on 23 Oct, all reading correctly,
  with and without a capital after the colon. Tests: `finalize-community-skip-caveat.test.ts:48` and
  `mcp-tools.test.ts:914`. It is also quoted at `gate:349–350`, `register-tools.ts:2201` and
  `docs/owner-regressions.md:120`.

## C. Communities and forums

**C1–C6. A community's access boundary.** `boundaryCaveat` is at `gate:4785–4794`, called at 5056–5062. Inserted: AI:
`community_searches[].community` (up to 120 characters). C2 and C3 start with the AI's phrase, so a lowercase name
would also start the sentence in lowercase.

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| C1, no_web_search | 4787 | `I could not search {name} from this app, so reports there are not included.` | not seen | `A community I could not search from this app: {name}. Reports there are not included.` |
| C2, login_required | 4788 | `{name} needs a login to read, so reports there are not included.` | not seen | `A community that needs a login to read: {name}. Reports there are not included.` |
| C3, blocked | 4789 | `{name} blocked access, so reports there are not included.` | not seen | `A community that blocked access: {name}. Reports there are not included.` |
| C4, retrieval_failed | 4790 | `Pages from {name} could not be retrieved, so reports there are not included.` | **broken**, 1 of 6: *"Pages from iHerb individual written Bacopa reviews could not be retrieved, so reports there are not included."* (r324) | `A community whose pages could not be retrieved: {name}. Reports there are not included.` |
| C5, no_relevant_results | 4791 | `A search of {name} turned up no relevant reports.` | **broken**, 2 of 11: *"A search of MyFitnessPal public fitness forum turned up no relevant reports."* (s359-t5); "A search of OCD-UK public forum…" (o356-ssris-years) | `A community where a search turned up no relevant reports: {name}.` |
| C6, not_found | 4792 | `I could not find {name}, so reports there are not included.` | **broken**, 2 of 5: *"I could not find Unidentified practitioner's publication and its comments, so reports there are not included."* and "I could not find Comments on the unidentified practitioner's publication…" (l24) | `A community I could not find: {name}. Reports there are not included.` |

- Delicate:
  - Tests: C1 has only the fragment `toContain("could not search")` at `finalize-next-steps-contract.test.ts:375`; the
    proposal keeps the phrase, but only by chance. C2: `finalize-product-review-requirement.test.ts:202`, and
    `research-finalization-gate.test.ts:675` and `:1019` (inside an answer text). C3 has only the negative
    `not.toContain("blocked access")` at `research-finalization-gate.test.ts:680`, which the proposal keeps meaningful.
    C4: `research-finalization-gate.test.ts:679`. C5: no test. C6: `finalize-community-report-identity.test.ts:260`.
  - The label "community" also covers review sites and single pages ("the brand's testimonial page", "iHerb
    individual written Bacopa reviews"). "A source of reports" would be the neutral alternative.

**C7. No firsthand report of the exact exposure.** `gate:5087` (`requireLimit` at 5085)
- Current: `In {community}, no one described their own use of {exposure}, so its reports are not evidence about it.`
- Inserted: AI: `community` and `report_identity[].exposure` (up to 200 characters).
- 23 Oct: **broken**, 9 of 26 with a capital, and some that misread: *"In r/Rebounding, no one described their own use of Two-minute floor bouncing for fascia
  hydration and mobility; nine selected outcome-bearing reports about adjacent mini-trampoline routines informed the
  discussion, so its reports are not evidence about it."* (s359-t3). Others: "use of Copper(I)" (l30), "use of The
  unnamed botanical treatment" (l24), "use of wrist-applied menthol balm and measured memory performance" (l34).
- Proposed: `No one in this community described their own use of what was asked about, so its reports are not evidence about it. Community: {community}. Asked about: {exposure}.`
- Delicate: `tests/finalize-community-report-identity.test.ts:83`. The limit at `:123` is addressed to the AI and pinned too,
  if it is changed to match.

**C8. How the threads read were chosen.** `gate:5103–5104` (5100)
- Current: `The {community} threads that I read were {chosen}, so they show which experiences people report, not how common each one is.`
- Inserted: AI: `community`. Server: `chosen`, from `PARTIAL_THREAD_SELECTIONS` (gate:94–98).
- 23 Oct: **broken**, 1–2 of 100: *"The Earth Clinic insomnia and topical remedy pages threads that I read were found by
  searching for outcomes…"* (l35). Subreddit names read correctly.
- Proposed: `The threads I read in this community were {chosen}, so they show which experiences people report, not how common each one is. Community: {community}.`
- Delicate: `tests/research-finalization-gate.test.ts:507`.

**C9. How the reviews read were chosen.** `gate:5114–5115` (5111)
- Current: `The {community} reviews of {product} that I read were {chosen}, so they show which experiences people report, not how common each one is.`
- Inserted: AI: `community` and `review_corpora[].product` (up to 200 characters). Server: `chosen`, from
  `PARTIAL_REVIEW_SELECTIONS` (gate:83–87).
- 23 Oct: **broken**, 1 of 3: *"The iHerb reviews displayed on Vitacost reviews of Nature's Answer gotu kola 475mg
  capsule listing that I read were a partial set…"* (r326-continue).
- Proposed: `The reviews I read on this site were {chosen}, so they show which experiences people report, not how common each one is. Product: {product}. Site: {community}.`
- Delicate: `tests/research-finalization-gate.test.ts:1253`.

**C10. Reports from the AI's own web search.** `gate:5150` (5147). The names are joined with `joinNames`, ", … and …"
(gate:5238).
- Current: `The reports from {names} come from my own web search, which AskRigor could not verify.`
- Inserted: AI: one or more community names.
- 23 Oct: seen 27 times. They read correctly, though "The reports from Earth Clinic insomnia and topical remedy pages
  come from my own web search…" (l35) shows how an "and" inside a name blurs the list.
- Proposed, for one name: `Reports from this community come from my own web search, which AskRigor could not verify. Community: {name}.` For several:
  `Reports from these communities come from my own web search, which AskRigor could not verify. Communities: {name}; {name}.`
- Delicate:
  - Tests: `tests/research-finalization-gate.test.ts:91` (in CLEAN_DRAFT), `:95` (FORUM_CAVEAT), `:577`, `:603`,
    `:644`, `:888`, `:1019`, `:1126` and `:1175`.
  - The negative check `not.toContain("come from my own web search")` at `:1078` stays meaningful only if the phrase
    is kept.
  - The singular and plural forms need two templates.

**C11. Reddit confirmed the threads.** `gate:5159–5160` (5156)
- Current: `Reddit confirms that the {names} threads linked here exist, but what they report is my own reading, which AskRigor could not verify.`
- Inserted: AI: subreddit names. Their format is checked as `r/<name>` (`SUBREDDIT_NAME`, gate:4454), so they cannot
  hold spaces, capitals as prose or "and".
- 23 Oct: seen 46 times, all reading correctly.
- Proposed, for one: `Reddit confirms that the threads linked here from this subreddit exist, but what they report is my own reading, which AskRigor could not verify. Subreddit: {r/name}.`
  For several: the same with "from these subreddits" and "Subreddits:", the names joined with "; " as in every other
  list.
- Delicate: `tests/research-finalization-gate.test.ts:1075` and `:1127`.

## U. The user's reports and community comparisons

**U1–U3. Comparisons drawn from community reports.** `gate:1505–1517`. Inserted: AI: `comparison_claims[].arms[].exposure`
(up to 200 characters each), and in U1 the units (`arms[].unit`, up to 40), which I keep attached to their numbers as
a dose.

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| U1, doses differ | 1508 | `The reports comparing {A} with {B} changed the dose as well ({doseA} {unitA} against {doseB} {unitB}), so they cannot show which works better.` | seen once, reads correctly ("copper(II) with copper(I) … (6 mg/day against 0.9 mg/day)", l31) | `Reports comparing two options changed the dose as well, so they cannot show which works better: {A} at {doseA} {unitA}; {B} at {doseB} {unitB}.` |
| U2, doses not given | 1509 | `The reports comparing {A} with {B} did not give both doses, so they cannot show which works better at the same dose.` | **broken**, 1 of 1: *"The reports comparing Terrace sleeping during heat or outdoor hammock with Indoor sleeping or bed did not give both doses…"* (q120-sleep-inside-outside turn 2) | `Reports comparing two options did not give both doses, so they cannot show which works better at the same dose: {A}; {B}.` |
| U3, not the same people | 1515 | `The reports comparing {A} with {B} did not come from people who used both, so they are not a direct comparison of the two.` | not seen | `Reports comparing two options did not come from people who used both, so they are not a direct comparison of the two: {A}; {B}.` |

- Delicate: tests `tests/finalize-community-report-identity.test.ts:86` (U2), `:193` (U1) and `:210` (U3). The
  negative `startsWith("The reports comparing")` at `:185` would pass without testing anything after the change, so
  point it at the new start.

**U4–U5. A report its source no longer stands behind.** `gate:1526–1531`. Inserted: AI: `user_observations[].observation`
(up to 200 characters; `carried-state.ts:10`).

| Row | Line | Current | 23 Oct | Proposed |
|---|---|---|---|---|
| U4, uncertain | 1528 | `A report its source is no longer sure of counts neither for nor against an effect ({observation}).` | **broken**, 2 of 2, with a doubled stop: *"…counts neither for nor against an effect (Friend reported feeling drowsy after temple peppermint oil rub; repeatability, formulation identity and amount unspecified.)."* (l33 turn 2) | `A report its source is no longer sure of: {observation}. It counts neither for nor against an effect.` |
| U5, withdrawn | 1531 | `A report its source has taken back counts neither for nor against an effect ({observation}).` | seen once, acceptable ("(No established personal indoor versus outdoor sleep comparison)", q120 turn 2) | `A report its source has taken back: {observation}. It counts neither for nor against an effect.` |

- Delicate: tests `tests/finalize-carried-state.test.ts:171` (U4) and `:33` (U5). Building these with `completedCaveat`
  also removes the ".)." defect.

## P. Products

| Row | Line | Current | Inserted | 23 Oct | Proposed |
|---|---|---|---|---|---|
| P1, product not traced | 4707 (`requireLimit` at 4706) | `The exact product tested in {label} was not traced to a current product, so this answer does not present it as something to buy.` | AI: `intervention_identity.interventions[].label` (up to 200) | **broken**, most of 7: *"The exact product tested in crocin capsules was not traced to a current product…"* (o355-saffron-fluvoxamine); "in Standardized Petasites hybridus root extract", "in Liquid CoQ10 MSE 2001/guttaQuinon" (q137) | `Tested in a key study but not traced to a current product: {label}. This answer does not present it as something to buy.` |
| P2, no live offer | 4743 (4742) | `No seller with a live offer for {destination} was found for {product}.` | AI: `shopping.destination` (up to 200) and `commercial_review_applicability.products[]` (up to 200) | not seen | `No seller with a live offer was found for this product: {product}. Destination: {destination}.` |
| P3, reviews a preview | 4676 (`requireLimit(preview, preview)` at 4677) | `On {community}, the reviews of {product} could not be searched for the outcome, so the {n} read are a preview, not a measure of how often it helps or harms.` | AI: `community` and `review_corpora[].product`; server: `n`, the number read | not seen | `The reviews on this site could not be searched for the outcome, so the {n} read are a preview, not a measure of how often it helps or harms. Product: {product}. Site: {community}.` |

- Delicate:
  - Tests: `tests/finalize-product-identity-and-shopping.test.ts:69` (P1) and `:70` (P2), and
    `tests/finalize-review-outcome-search.test.ts:28` (P3).
  - P3's limit is the same string, so it changes with the caveat.
  - `finalize-next-steps-contract.test.ts:122` pins the `outcome_search_boundary` description, which does not quote
    this sentence.

---

## Points that apply to every row

1. **The published tool list.**
   - The harm start appears in `register-tools.ts:2223–2224` and `gate:748–750` and `:771`. The option-class starts
     appear at `gate:366–368` and `:382–384`. The named-target sentence appears at `gate:584–586` and `:612–613`.
   - Changing any of them requires regenerating `docs/tool-inventory-v0.1.0.json` with
     `scripts/generate-tool-inventory.mts --write`, because `tests/release-packet.test.ts:618` compares it byte for
     byte.
   - It also changes the tool-list version, which is a hash of tools/list (`tool-list-currency.ts:46`). Apps holding
     the old list then get the refresh notice when a declaration is missing. This release already changes the tool
     list (the Atlas phase 3 card fields), so this likely adds no new notice.
2. **`docs/privacy-data-map.md:641–643`** quotes the harm, option-class and named-target sentences.
3. **Checks tied to a fragment of the old words:** `finalize-community-report-identity.test.ts:185`,
   `research-finalization-gate.test.ts:680` and `:1078`, and `finalize-next-steps-contract.test.ts:375`. Each would
   test nothing once its fragment is gone. The proposals keep "blocked access", "come from my own web search" and
   "could not search"; `:185` needs the new start.
4. **Translation (`caveat_renderings`) is not affected by the wording.** The answer check tests only the rendering's
   place and links (gate:3707–3736). The rendering tests build their expected caveats from the constants
   (`finalize-harm-screen.test.ts:392–416`, `finalize-option-classes.test.ts:315–325`).
5. **Matching.** `caveatOnce` removes duplicates by exact text (gate:1492–1494), and `caveatHolding` (gate:1085–1091)
   compares corrections with the caveats' text. Every proposal keeps all inserted values word for word, so both behave
   as before.
6. **The tool result writes "The answer must contain, as written: {caveat}"** (`register-tools.ts:2371`), so a colon
   caveat now follows another colon. Quoting the caveat there would make the boundary clearer. This is optional.
7. **Historical records** (`docs/audits/*`, `docs/superpowers/plans/*`) quote the old sentences and should stay as they
   are.

## Checked and out of scope

- `gate:2086`: `The full text of {DOI or id} came from the AI's search-index copy of {host}; AskRigor did not fetch it.`
  Both values are an identifier and a host from the signed audit receipt. The sentence reads correctly on 23 Oct (i336,
  i45) and is pinned at `full-text-search-copies.test.ts:301`.
- Sentences that insert only links or counts:
  - video caveats at 1863–1873 (links), `unwatchedVideoCaveat` at 238–241 (a link and a server choice), and
    1796–1831 and 2536 (counts);
  - `unreadStudiesCaveats` at 4159–4209 (links);
  - the save offer in `findings/card.ts:265–274` (counts).
- Sentences with server words only: gate:1380, 1383, 1541, 1763, 1931, 1976, 2358, 2731, 2736, 2743, 2967, 2992 (its
  names come from the server) and 5200.
- `plain_answer_note` (gate:4061–4069) already uses the shape `…would have said: “{claim}.” This research {outcome}
  that, from {work}: “{quote}.”`.
- Limits, next steps and `must_report` are addressed to the AI.
