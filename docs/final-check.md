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

For a usable call, `not_ready` means at least one of the five fails. With none failing, a nonempty `limits`
list gives `ready_with_limits`; otherwise the result is `ready`. Material boundaries remain in `limits`,
including abstract-only reading, a search stopped by quota and a case-report basis. The model includes them
in its own words, following HRP. Their absence, translation or rewording in the draft does not create a step.
The panel displays every limit beneath a passing checked answer, even when the draft omitted it, and also
displays the advisory notes.

The check line, unchecked line, checked-draft digest, second reading and stopped-check report still operate.
The [strict runner](askrigor-strict-runner.md) still compares the delivered answer to the exact checked draft;
that integrity check is separate from wording a limit. A passing check does not certify that the AI acted
on every note or completed the research method: the AI remains responsible for that work and its limits.

Runtime operation descriptions, later-input guidance and result text carry these rules. The published
tool definitions and `tests/fixtures/frozen-tool-lists/` retain their exact bytes under owner answer 189a.
Historical plans and dated audits describe the behavior at their recorded dates, rather than the current
blocking set.
