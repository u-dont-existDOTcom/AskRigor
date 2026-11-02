# What the final check can stop

Owner answers 193a and 195a (29 October 2026) limited `finalize_research` to five blocking checks, and owner answer 217b (2 November 2026) adds a sixth:

1. Each declared key source has a verified receipt from this research tying its identity to a search result,
   record, full-text acquisition, audit, lead or route failure. Its answer link must lead to that source.
   A receipt-tied web address works without a DOI or an answer marker. A receipt that fails verification
   does not count and produces a note. A link counts wherever the answer writes it, inside parentheses too, and a
   step offers only pages a source's kind has (until the 30 Oct rerun, "([label](URL))." read as "URL))." and was
   refused, and web addresses were offered as doi.org links).
2. A study's declared `read_depth` matches its receipts.
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
landscape coverage, Atlas lookups, community reports and their counts, omitted carried lists and tool-list
currency. Three come from counts and signed times (the owner, 30 and 31 October 2026, plan
`docs/superpowers/plans/2026-10-31-video-comment-maps.md`): forum evidence resting on fewer than five threads read, or
on one community; no study search issued after the first YouTube community receipt (the loop); and the emergency
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

A plain-answer confirmation needs the same backing as a qualification: a study audited in full text here, a video whose
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
older description of the note's figure replacement; the runtime result supplies the actual note.


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
