# What the final check can stop

Owner answers 193a and 195a (29 October 2026) limited `finalize_research` to five blocking checks, and owner answer 217b (2 November 2026) adds a sixth:

1. Each declared key source has a verified receipt from this research tying its identity to a search result,
   record, full-text acquisition, audit, lead or route failure. Its answer link must lead to that source.
   A receipt-tied web address works without a DOI or an answer marker. A receipt that fails verification
   does not count and produces a note. A link counts wherever the answer writes it, inside parentheses too, and a
   step offers only pages a source's kind has (until the 30 Oct rerun, "([label](URL))." read as "URL))." and was
   refused, and web addresses were offered as doi.org links). A forum thread `read_forum_thread` read counts by its
   verified `forum_thread_read` receipt, matched by the thread's comparable link, and any link to the same thread is
   its link; it is not asked for a DOI, full text or lead (#394's run, 3 November 2026, refused two such threads). A
   note asks for a study a claim rests on to be added to `key_sources` only when this check would accept it there;
   otherwise it asks for the study to be looked up first.
2. A study's declared `read_depth` matches its receipts, and an answer citing a key source says beside it how it was
   read, in its own words, which `source_reading` copies (5 November 2026, not yet released; below).
3. Declared `binary_results` arithmetic is correct, and a figure shown in the answer agrees with its declared counts.
4. Declared `safety_claims` have a `harm_screen` naming at least one harm actually searched. Duplicates, other
   values, quotes and a `not_found` query without a receipt produce notes. The harms and source types searched
   remain in the limits so the model can state the screen's scope and the panel can display it.
5. A retracted statement carried from an earlier turn stays out, and a statement corrected in this answer
   is not still shown.
6. A plain answer registered before the research and passed in `receipts` is compared with the answer in
   `plain_answer_comparison`, one entry for each of its claims (owner answer 217b, 2 November 2026), so the note on
   how the answer differs from a quick answer is always there. The
   entries' own problems (an unshown quote, nothing behind a change) stay notes, and the note gives such a claim
   as "This research did not check that." When the account turned the note off, a missing comparison stays a
   note. A plain answer whose receipt is not passed cannot be required: AskRigor keeps no copy of it, only the
   signed digests of its claims in the receipt it hands back.

`FINAL_CHECK_BLOCKING_RULES` in `research-finalization-gate.ts` names this set. A single admission point checks
every proposed step against it. All other diagnostics return once in `notes`, worded for the AI to act on:
missing declarations, wording and quote guidance, key terms, unfinished research or leads, discovery and
landscape coverage, Atlas lookups, community reports and their counts, the leads people's reports raised and the study
searches that followed them, omitted carried lists and tool-list currency. Once means once per turn (5 November 2026, not yet released): the carried state keeps a short digest of each
note its turn's checks gave, and a later check of that turn leaves those out, with one line saying how many and that a
note still stands unless the draft or the call's declarations already meet it; a note whose words changed is new, and
the next turn gives notes again. Notes on the call's own input or the conversation's continuity (input problems,
receipts, carried state, the tool-list hint) come back at every check while they stand, since their wording can stay
the same while the entry they name changes. Three come from counts and signed times (the owner, 30 and 31 October 2026, plan
`docs/superpowers/plans/2026-10-31-video-comment-maps.md`): forum evidence resting on fewer than five threads read, or
on one community (each thread once by its comparable link, counting those the reader's verified receipts show read
as well as those declared); no study search issued after the first YouTube community receipt (the loop); and the emergency
exemption declared while key sources show the research went on. These notes never become next steps or consume check
rounds. The round limit, stuck-step logic and
stopped-check report apply only to the six blocking checks. A usable draft and research target are still needed
to run a check; an unusable call is reported as such.

A field the check cannot use is dropped, with a note naming it and why. An object goes as a whole when a field it
requires is unusable (an open lead goes with any field it loses), and a second note says so: the AI then sends the
object again with that field usable, or leaves the object out. Told only that the field was dropped, the AI deleted
the field, which the app's copy of the tool's schema requires, and the app refused the next call before it reached
AskRigor (four runs of the 30 Oct rerun on #384's build). For the same reason, the notes asking for a missing
`safety_claims` or `mechanism_claims` name the required choice their field lists left out: each claim's direction,
and whether its experiment was in people or animals (the same rerun's `r377-continue`). `named_target.described_from` and `unwatched_videos[].content_from` now both publish
`description_only`; the runtime still accepts the former field's older `video_description_only` spelling for an app
with a stale list. `acquire_open_full_text` accepts a DOI, PMCID or PMID. Without a DOI it reads Europe PMC by PMCID,
or resolves a PMID to one there, and does not try Unpaywall or the owner library. No identifier returns an ordinary
refusal rather than a hidden tool error.

For a usable call, `not_ready` means at least one of the six fails. With none failing, a nonempty `limits`
list gives `ready_with_limits`; otherwise the result is `ready`. Material boundaries remain in `limits`,
including abstract-only reading, a search stopped by quota and a case-report basis. A limit about a key source names
it by the answer's label, then its identifier (`"Cervicogenic dizziness review" (29340206)`), so a reader can tell
which study it means; a source labelled by its identifier is named once. Under a passing check the panel shows one
line and folds the rest under closed lines that open on a click (owner answer 217b, 2 November 2026: "keep it
folded, people can unfold if they want to see how the answer is different"): first the plain-answer note, how the
answer differs from the quick answer written before the research and what backs each change; then what the check
covers, with the counts of audited key studies, leads and communities searched, the figures of the checked answer,
and every limit, even one the draft omitted. It no longer repeats the checked answer. AskRigor never sees the answer
the AI writes after the check, so the figures make a change visible (owner answer 220a, 2 November 2026): any other
figure in the answer, apart from those the plain-answer note quotes, was added or changed after the check. A figure is
a number in digits of any script, as written, with its decimal or group separators, a fraction's slash and a percent
sign; links, DOIs, PubMed numbers, citation markers, list numbers and the digits of a name such as COVID-19 are not
figures. The advisory notes, written for the AI, come last in the panel
under every status, folded under one closed line, "Notes for the AI", that opens on a click (the owner on 30 October
2026, of a panel whose five notes came before the answer). So, following HRP 20.6.34 (owner answer 205a, 30 October 2026), a passing check's answer states in its own words
only the limits that change what the person should believe or do, with which limits matter left to the AI; the
result gives all limits for reference on one numbered line (`[1] ... [2] ...`) after guidance not to copy them,
adds a non-blocking note, which asks for the check again, without consuming a round when the passing draft
repeats three or more verbatim
(whitespace and straight/curly quotes normalized), and asks the AI to add any omitted limit that matters and check
the draft again. Under a check that has not passed, the panel shows no limits, so each
stays a `Limit to include in your own words` line and the answer states them all. Their absence, translation or
rewording in the draft does not create a step either way. A passing check's line with limits reads "Checked with
AskRigor's final check, with the limits it found.", since the answer may state only some of them.

Under every check status, `caveats` holds only sentences the answer shows as written: the mobile notice, the
findings save offer, the correction-report question (owner question 78) and the community-skip sentence (owner
question 125). The last two are limits too, so the panel still lists them, but the reference line leaves them out
and the result gives each on its own `Include as written, translated when the answer is not in English` line.
Material limits stay in `limits` under passing, not-ready and stopped checks; the stopped-check completion tip is shown as written in `caveats`. The published schema and tool description now say the same thing, in this tool-list change.
Missing or reworded limit text still creates no step.

The check line, unchecked line, checked-draft digest, second reading and stopped-check report still operate.
When the server keeps shared answers and the caller has a research account, the result also carries a runtime-only
`share_offer` (owner answer 200a): its `line`, the owner's sentence word for word, ends the delivered answer after the
check line or the unchecked line, and its `on_yes` says how to share a de-identified copy, only after the person
confirms it ([the data map](privacy-data-map.md#shared-questions-and-answers-owner-answer-200a-30-october-2026)).
The [strict runner](askrigor-strict-runner.md) still compares the delivered answer to the exact checked draft;
that integrity check is separate from wording a limit. A passing check does not certify that the AI acted
on every note or completed the research method: the AI remains responsible for that work and its limits.

Runtime operation descriptions, later-input guidance and result text carry these rules. This build adds two tools, so the published definitions and `tests/fixtures/frozen-tool-lists/` change once,
including the waiting schema corrections. The release requires one refresh in each app; subsequent definitions
remain fixed under owner answer 189a.
Historical plans and dated audits describe the behavior at their recorded dates, rather than the current
blocking set.

The 31 October regression repairs keep “Cite … as a lead” and “Cite … as read through another tool” instructions
in the advisory notes and result text; the panel's limits retain the corresponding reader-worded source boundary.
Figure parsing accepts an interdigit middle dot as a decimal point, including study-audit recomputations and answer
figures, while a spaced list separator stays separate. The unblinded-test limit describes the person's knowledge of
what they took or did without assuming who runs the test.

A plain-answer confirmation or correction needs the same backing as a qualification (a first-turn correction too, since
#394's run printed an unbacked one as the research's): a study audited in full text here, a video whose
comments were read here, a sentence the answer declares as not found or as a correction it found, or, since owner answer
210b (1 November 2026), a forum thread this call declares it read, for a claim about what people report. Which claims
those are is the AI's declaration. The note names up to three such threads. When every thread behind a claim has a verified `forum_thread_read`
receipt it says "1 forum thread read here" or "2 forum threads read here"; otherwise it says "my own reading".
A review site does not count. A claim that can't be shown as
declared (nothing behind it, or a quote the answer doesn't show, repeats or ends in a colon) goes in the note as "This
research did not check that.", with an advisory note saying how to show it, and the rest of the note stays. Only a
registered claim left out of the comparison holds the note back, since no text of it is kept to show. The note quotes
each registered claim with its figures, including figures absent from the checked draft; a confirmed or qualified claim
with such figures says the research did not confirm them. If a receipt marked plain_answer does not verify, the result
says so and explains exact-copy recovery; an omitted receipt's message also explains that recovery. No declaration,
required field, caveat or blocking check is added. The published tool definitions remain frozen, including their
older description of the note's figure replacement and of a first-turn correction's sources
(`docs/tool-list-changes-waiting.md`); the runtime result supplies the actual note. A plain answer registered after
research began is not compared, and the registration's result no longer says it was registered before research: the
server keeps no record of the research, so only the final check can tell, by the receipts' signed order.


Owner answer 237a (4 November 2026) adds one optional field and no blocking rule. `source_lines`, a later input of
`finalize_research`, gives for each key claim the key source's id, the claim, the paper's sentence and its own
conclusion, each copied whole and exactly, and the strongest thing against the claim. Once a check passes, AskRigor
looks both quotes up word for word in the text it fetched: the full text it still holds, through the handle the
source's verified `full_text_read` or audit receipt signs, or otherwise the PubMed abstract. Spacing, case, Unicode
form, curly quotation marks, dashes and emphasis are set aside and nothing else, so a changed word, number or sign is
not found, in any language, with no model. The result's runtime `source_lines` and the panel say which quotes were
found and in which section. Only a line with both found in a paper AskRigor fetched may carry "✓ AskRigor found both
in the paper"; a copy the AI supplied is named as one and gets no tick. A quote not found is a note and a line in the
panel, not a step, since the six blocking checks don't name it. Finding a quote shows the words exist, not that they
are fair, which is why the conclusion and the strongest thing against the claim sit beside it; whether they back the
claim is meaning, and the meaning judge reads it where it is on (its job 5). Limits: AskRigor holds a full text for an
hour after its last read, so a later check leaves those quotes unchecked and says so; a source with no full text held
and no PMID has nothing to look in; and the check can't say what the answer shows after it.

Owner answer 249a (5 November 2026) adds the study map, an optional later input, and no blocking rule
(`apps/research-mcp/src/study-map.ts`; plan `docs/superpowers/plans/2026-11-05-study-map.md`). When a conclusion
combines studies, `study_map` names them, the group of people behind each, the links between them and, per claim, how
many independent groups of people it counts. Once a check passes, AskRigor looks each passage up word for word in its
own study's text (found through the verified receipts, as a source line's), and each declared registry number in the
study's text and on ClinicalTrials.gov, saying when a trial was registered after it started. Groups of people come only
from the map's own declarations: a link of shared people to one study, or the same group. A claim counting more groups
than those declarations allow gets a note; a study holding several groups (a review citing trials, or a reanalysis or
extension of two or more studies) joins none, and a claim resting on one isn't counted. Whether two studies share
people is meaning, so what AskRigor finds (the same registration given twice, a registry number in an abstract, a
registration listing another study's paper, identical figures) joins nothing: each is a hint, worded as a question for
the AI that names the link each answer calls for. Every finding is a note naming each item by its place as given, beside the runtime `study_map` result, and
consumes no round; what the shared deadline allowed is kept.

The loop from people's reports to studies (the owner, 5 November 2026: "make sure that our feedback loop is working
between forum signal and studies"; not yet released) adds one optional later input and no blocking rule
(`apps/research-mcp/src/community-leads.ts`). HRP already asks for the loop: `CommunityToFormalHypothesisTransfer` turns
repeated or high-value community observations into study searches, `FormalAbsenceCannotEraseCommunitySignal` records
how studies relate to the signal, and `MatchedContradictionAndOutcomeAlignment` lets a study contradict reports only when
it measured the same thing. Yet judges reading 18 runs lead by lead found 19 of the 98 leads forum threads or comments
raised searched in studies, and no answer saying a lead went unsearched. `community_leads`, sent in `later_inputs`, lists
up to 12 leads, one entry each: the option, form, dose, timing, responder group, harm or way it could work that the
reports raised and the question didn't name, with at least one letter or digit; where each was read (`from`: a thread's
link that `read_forum_thread` read or a `community_searches` entry declares, or `video:<id>` or the video's YouTube link
in any form the video tool reads, for comments AskRigor read); and either `searched`, with the exact query of the study
search that followed, what the studies showed (`corroborated`; `contradicted`, only when they measured it the way the
reports did; `outcome_mismatch`; or `support_not_located`) and the answer's sentence on it, or `not_searched`, with why.
An empty list means the reports raised nothing new. Each check is exact, and each finding is a note naming the entry by
its place as given: no list while threads or comments were read, with how many (threads AskRigor's reader read, by a
verified `forum_thread_read`, apart from those `community_searches` declares from the AI's own web search outside review
sites and pasted reports, as the forum note counts them; and the videos whose comments the model received, by
`youtube_comments_read`, a video audit that returned comments, or a one-call audit for this research target); a second
entry naming the same lead (compared in Unicode's compatibility form, in lower case, without its closing mark), which is
then left out of every other check; a `from` the call doesn't show read; a searched lead without its query, or with a
query no `literature_search` receipt signed (a forum or YouTube search of the same words is not a study search), without
`studies`, with a search whose receipts returned no records though `studies` isn't `support_not_located`, or without a
sentence the answer shows (for `support_not_located`, the sentence that the search found none); and a lead not searched
without its reason. A declaration in `community_searches` only ties a lead to a read the call reports; the limits on
reports from the AI's own web search stand. The leads AskRigor saw no study search for, those declared `not_searched` and
those declared `searched` with no literature search passed under their query, are one limit, "Leads from people's
reports that this research did not search in studies: …" ("A lead …" for one), which is true from AskRigor's view. In it
a semicolon inside a lead becomes a comma, so "; " stays the only separator, and a lead's closing `.`, `,`, `:` or `;`
(with their full-width and CJK forms) is left out, never a `?` or `!`. Which reports raise a lead, and what the studies
showed, stay the AI's judgment, in any language. The results of `read_forum_thread` (only when it read the page),
`get_youtube_comments`, `search_youtube_comments` and the two comment audits ask for the loop where the reports are
read. Limits: a study search made before the reports were read still counts, since the lead was searched; read and
search receipts sign no research target, so a read or search made for another question within the receipts' 24 hours
counts too; and a same-site redirect to a login or index page could sign the link as asked (the reader's own access
states are the guard). The other direction, a study's finding followed up in the communities, is next.

How each study was read, said beside it (the owner, 5 November 2026: "make sure askrigor is enforcing that the AI tells
people what it actually read, like 'In this study (abstract read/full text read/full text and images analyzed)' that will
make it much easier to understand the evidentiary basis"; not yet released) adds one later input and no blocking rule:
the read-depth check (rule 2) now covers the answer's words too (`apps/research-mcp/src/source-reading.ts`). HRP's
`StudyReadDepthDisclosure` already asks the answer to say beside each supporting study what was actually read, and the
check already held each declared `read_depth` to its receipts, but nothing made the answer say it. `source_reading`,
sent in `later_inputs`, gives one entry per key source: `source`, its id as `key_sources` gives it, and `quote`, the
answer's own words saying how it was read, beside or in the sentence citing it, in the answer's language, copied from
`answer_draft`. A key source the draft cites (a link its receipts tie to it, or its identifier in the prose a reader
sees: a DOI in any case, a PMID or PMCID as a whole number) needs an entry whose quote the draft shows, compared as the
other declared quotes are; a missing entry or a quote not shown is a blocking step under `read_depth`. Whether the words
say how it was read is the AI's declaration, since no word list can judge that in every language. A key source the
draft doesn't cite needs nothing (its link is asked for under rule 1 already); an entry naming no key source, or a
second entry for one, is a note, and only the first entry for a source is checked. Each step gives the reading the
check verified, for the AI to put in its own words: a checked Atlas finding the call uses, "from a checked Atlas
finding"; an audit receipt, "full text read, methods audited by AskRigor" ("full text read from a copy the AI found,
methods audited by AskRigor" when every audit was of the AI's search copy, as the Atlas reads a card's sources; a copy
from the owner's library is one AskRigor fetched, so it reads as any full text); a completed reading, "full text read"; a lead
read through another tool, "read through another tool, not checked by AskRigor"; otherwise the declared lower depth:
"part of the text read", "abstract only" (for a conference abstract too), "only another source's description of it
read", "only its title and record read", "not read, no access to it" or "not read, it could not be fetched". A declared
audit with only a completed reading behind it reads as "full text read"; any other declared full-text reading or Atlas
finding its receipts don't support has no reading until the declaration matches (rule 2's own step names what to
give), and its step asks for a `read_depth` the receipts support. On any check with key sources
the result names each one's reading up front ("Say beside each study how it was read: …"), from the runtime
`source_reading` (each key source's id, its name as a limit gives it and its reading), so the answer can say it before a
check blocks; under a passing check the panel lists the same, "What AskRigor read: "Trial" (10.1000/…), full text read,
methods audited by AskRigor; …", so the reader sees it even when the answer is reworded. Before any check, the tools
that establish a reading name its words in their results, with where to give them: a signed `fetch_pubmed_record`
("abstract only", or "only its title and record read" for a record without an abstract, for a study cited from the
record alone), `acquire_open_full_text` or `continue_open_full_text` once the text is read to its end ("full text
read"), and `validate_study_method_audit` and `validate_review_method_audit` once an audit validates; the AskRigor
skill says the same in one sentence, so an answer need not lose a round to learn it. "Full text and figures
analyzed", the owner's third example, waits for AskRigor's figure reading (the next build's item 2), which isn't built:
no receipt yet shows that a figure was read. Limits: the words are the AI's, so an entry can quote a sentence that
doesn't say how the source was read; where they sit is not checked; and a key source with no `read_depth` and no
receipt showing a reading has no reading, so the result and the panel leave it out.

Owner answer 219b (2 November 2026) adds one declaration and no blocking rule: each finding of a findings card may
say whether it draws on YouTube comments (`draws_on_youtube_comments`, true or false). The published card stays fixed
(owner answer 189a), so the declaration is a field of the card's later shape: the AI sends the whole card in
`later_inputs.findings_card` (the runtime also takes it at the top level). Whether a finding draws on comments is the
AI's judgment, in any language; the check only reads what is declared. When this call's verified receipts show that
YouTube comments were read (a video audit whose final view returned comments, the videos a one-call community audit
read, or comments `get_youtube_comments` or `search_youtube_comments` returned), a finding declared true, or one that
declares nothing, is held privately for the owner's review and never published, the same as a finding with a video among its sources, `community_checked` or audited comments behind it; a
note names each finding that declares nothing and asks for the declaration. A finding declared false is saved as
before, and a finding declared true is held even when no comments were read here. With no comments read, no
declaration is needed. The finalization receipt signs the held findings' places on the card (`held`), and the
runtime result lists them in `findings_card.held`. The card's digest covers the declarations, so a paid-private save
sends the card exactly as checked, declarations included. Card ARF-0272's third finding, about people commenting on a
public demonstration, listed two DOIs and so was published; a declaration now holds such a finding, though it still
depends on the AI declaring truthfully. The receipt from `get_youtube_comments` and `search_youtube_comments`
(`youtube_comments_read`) counts only here: it is no audit, so community evidence is checked as before. An AI that
leaves the receipt out gets no hold on a finding that declares nothing, as with any receipt left out.

Owner answer 221 (2 November 2026) adds the meaning judge, for the owner's dev accounts only, and no blocking rule.
Exact comparisons cannot judge meaning, so once a dev account's check passes, AskRigor makes one Claude API call
(`apps/research-mcp/src/meaning-judge.ts`; `claude-opus-5-5` at effort low by default, structured JSON output, a fixed
rubric) and reads the check again with its reply. It has four jobs:

1. When this call's receipts show YouTube comments were read, whether each finding of the checked card rests on them.
   A finding it reads so is held like a declared one (the safe direction), signed in the receipt's `held`, with a note.
2. Whether each change the plain-answer note credits to its work is backed by what it names: a study backs only what
   it examined, a video's comments only what commenters reported, a forum link only what people there reported. Any
   audited study used to count as backing; the judge's doubt is a note.
3. Whether each limit applies to this answer; a limit whose premise is false here (an unblinded-test limit when the
   only test is clinical monitoring, a different-tissue limit naming the same tissue twice) gets a note. The panel
   still lists every limit.
4. Whether each card finding makes sense on its own to a reader of the public Atlas who never saw the question; a
   fragment such as Atlas publication P-1020's ("The camping bundles do not isolate…", applying to "Interpretation of
   the two audited camping papers.") gets a note asking for a rewrite.

Jobs 2 to 4 only add notes. A failure, timeout, refusal or reached daily cap leaves the check as it was and adds one
note saying the judge did not run. The runtime result reports `meaning_judge` (`status`, `reason`, `held`, `notes`).
It is off unless `ASKRIGOR_MEANING_JUDGE=on`, with the key read from `ASKRIGOR_MEANING_JUDGE_KEY_FILE` (a read-only
mounted secret), `ASKRIGOR_MEANING_JUDGE_WORKSPACE_ID` for an organization-scoped key, and optional
`ASKRIGOR_MEANING_JUDGE_MODEL`, `_EFFORT` (`low` or `medium`), `_DAILY_CAP_USD` (default 3, the owner's "hard cap of $3 a
day") and `_TIMEOUT_SECONDS`
(default 60). It is paid from the owner's monthly Claude API credits under the policy's `OWNER_ANSWER_221`. Its
development measurement on #393's run is `docs/audits/2026-11-02-meaning-judge-development.md`; as the owner's
question put it, it returns notes only and stops no answer until a regression run has measured it against the
owner's judges.

The forum reader (owner answers 211a and 213b) adds no declaration or blocking rule. A `threads_read` URL with a
verified `forum_thread_read` receipt was read through AskRigor. A community or subreddit all of whose declared
threads have those receipts is left out of the own-web-search and Reddit-existence-only limits. A partially
receipt-backed community retains its limit. Receipts use the same comparable-URL rules as the answer links,
including Reddit front ends and within-thread pagination.

The existing forum-depth note adds "AskRigor's searches found Z threads." when verified `forum_search` receipts
are present, counting their distinct thread digests. With at least two successful searches and fewer than five
threads, it also says "Only Z turned up in S searches: if other wordings find no more, say in the answer that few
threads exist." These remain advisory notes and consume no rounds. Search and reading results ask the AI to read
relevant threads in full, continue when `more` or `next_page` is present, count people rather than comments, and
report how many threads it found and read and why it stopped. A receipt records actual retrieval, not the truth or
representativeness of a public report.
