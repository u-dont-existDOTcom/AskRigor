# What the final check can stop

Owner answers 193a and 195a (29 October 2026) limit `finalize_research` to five blocking checks:

1. Each declared key source has a verified receipt from this research tying its identity to a search result,
   record, full-text acquisition, audit, lead or route failure. Its answer link must lead to that source.
   A receipt-tied web address works without a DOI or an answer marker. A receipt that fails verification
   does not count and produces a note.
2. A study's declared `read_depth` matches its receipts.
3. Declared `binary_results` arithmetic is correct, and a figure shown in the answer agrees with its declared counts.
4. Declared `safety_claims` have a `harm_screen` naming at least one harm actually searched. Duplicates, other
   values, quotes and a `not_found` query without a receipt produce notes. The harms and source types searched
   remain in the limits so the model can state the screen's scope and the panel can display it.
5. A retracted statement carried from an earlier turn stays out, and a statement corrected in this answer
   is not still shown.

`FINAL_CHECK_BLOCKING_RULES` in `research-finalization-gate.ts` names this set. A single admission point checks
every proposed step against it. All other diagnostics return once in `notes`, worded for the AI to act on:
missing declarations, wording and quote guidance, key terms, unfinished research or leads, discovery and
landscape coverage, Atlas lookups, community reports and their counts, omitted carried lists and tool-list
currency. These notes never become next steps or consume check rounds. The round limit, stuck-step logic and
stopped-check report apply only to the five blocking checks. A usable draft and research target are still needed
to run a check; an unusable call is reported as such.

A field the check cannot use is dropped, with a note naming it and why. An object goes as a whole when a field it
requires is unusable (an open lead goes with any field it loses), and a second note says so: the AI then sends the
object again with that field usable, or leaves the object out. Told only that the field was dropped, the AI deleted
the field, which the app's copy of the tool's schema requires, and the app refused the next call before it reached
AskRigor (four runs of the 30 Oct rerun on #384's build). For the same reason, the notes asking for a missing
`safety_claims` or `mechanism_claims` name the required choice their field lists left out: each claim's direction,
and whether its experiment was in people or animals (the same rerun's `r377-continue`). `named_target.described_from`
says `video_description_only` where `unwatched_videos[].content_from` says `description_only`, and the app refused the
first word in the second field (the same rerun's `l22`), so the step asking the two to agree names the matching pair.
The two spellings can become one only when the tool list next changes (owner answer 189a), which
`tool-list-changes-waiting.md` records.

For a usable call, `not_ready` means at least one of the five fails. With none failing, a nonempty `limits`
list gives `ready_with_limits`; otherwise the result is `ready`. Material boundaries remain in `limits`,
including abstract-only reading, a search stopped by quota and a case-report basis. The model includes them
in its own words, following HRP. Their absence, translation or rewording in the draft does not create a step.
The panel displays every limit beneath a passing checked answer, even when the draft omitted it, and also
displays the advisory notes.

The check line, unchecked line, checked-draft digest, second reading and stopped-check report still operate.
When the server keeps shared answers and the caller has a research account, the result also carries a runtime-only
`share_offer` (owner answer 200a): its `line`, the owner's sentence word for word, ends the delivered answer after the
check line or the unchecked line, and its `on_yes` says how to share a de-identified copy, only after the person
confirms it ([the data map](privacy-data-map.md#shared-questions-and-answers-owner-answer-200a-30-october-2026)).
The [strict runner](askrigor-strict-runner.md) still compares the delivered answer to the exact checked draft;
that integrity check is separate from wording a limit. A passing check does not certify that the AI acted
on every note or completed the research method: the AI remains responsible for that work and its limits.

Runtime operation descriptions, later-input guidance and result text carry these rules. The published
tool definitions and `tests/fixtures/frozen-tool-lists/` retain their exact bytes under owner answer 189a.
Historical plans and dated audits describe the behavior at their recorded dates, rather than the current
blocking set.
