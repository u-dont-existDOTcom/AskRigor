// Owner answer 187 (27 October 2026): shared by the stopped answer's caveats and the result panel.
export const COMPLETE_CHECKS_TIP = "To give AskRigor's checks more room to finish, ask it to complete its checks, " +
  'for example: "complete askrigor checks".';
// Owner answer 217b (2 November 2026): the panel's folded lines under a passing check, what the check covers and what the
// comparison with the quick answer is.
export const FINAL_CHECK_PANEL_SCOPE = "AskRigor's final check confirms that the sources are real and the ones named, " +
  "that each study is described the way it was read, that the figures shown match the counts declared from the " +
  "studies, that safety statements rest on a search for named harms, that nothing taken back earlier comes back, and " +
  "that a quick answer written down before the research is compared with this one. It does not judge the reasoning " +
  "or whether the conclusions are right.";
export const FINAL_CHECK_PANEL_DIFFERENCE_LEAD = "Before researching, the AI wrote down the quick answer it would have " +
  "given. What the research confirmed, corrected or qualified in it, and what backs each:";
// The owner, 8 Nov 2026 (#434: "i'm confused by the askrigor panel not showing me what a regular answer was going to
// give"): when a research account's checked answer has no note comparing it with the quick answer, the panel says why,
// by finalize_research's plain_answer.status, instead of showing nothing. note_off is the person's own choice and shows
// nothing.
export const FINAL_CHECK_PANEL_NO_COMPARISON = {
  no_receipt: "No comparison with a quick answer this time: no quick answer was written down before the research, or " +
    "the AI didn't pass its record to the check.",
  other_target: "No comparison with a quick answer this time: the quick answer was written down for a differently " +
    "worded question, so AskRigor couldn't match it to this research.",
  after_research: "No comparison with a quick answer this time: the quick answer was written down after the research " +
    "began, so it can't show what a quick answer would have said.",
  other_account: "No comparison with a quick answer this time: the quick answer was written down from another account.",
} as const;
// Owner answer 237a (4 November 2026): above the panel's list of the quotes looked up.
export const FINAL_CHECK_PANEL_SOURCE_LINES_LEAD = "The quotes behind key claims, looked up word for word. Finding a " +
  "quote shows the words are there, not that they are a fair summary of the paper:";
// Owner answer 237a's source line, by its exact fields (the owner regressions on #412's build, judged 6 Nov 2026): 11 of
// 12 runs first sent their lines with field names of their own (study_id, evidence_quote, supporting_sentence and the
// like), which the check dropped, so each cost a check. The result names the fields and shows one line, exactly as the
// later shape takes it (sourceLineSchema; a test holds the two together). No other name is read as one of them.
export const SOURCE_LINE_EXAMPLE = '{"source": "10.1000/example", "claim": "…", "sentence": "…", "conclusion": "…", ' +
  '"against": "…"}';
export const SOURCE_LINE_FIELDS = "source, the key_sources id; claim, the claim as the answer states it; sentence and " +
  "conclusion, the paper's sentence behind the claim and its own conclusion, each copied whole and exactly; and " +
  "against, the strongest thing against the claim";
/** The note for a source line dropped for its shape: the exact shape, so the next call's lines are looked up. */
export const SOURCE_LINE_SHAPE_NOTE = `source_lines: a line was left out because of its shape. Give each line as ` +
  `${SOURCE_LINE_EXAMPLE}, with these five fields and no others: ${SOURCE_LINE_FIELDS}. Then check the answer ` +
  "again, and AskRigor looks the lines up.";
// Owner answers 193a, 195 and 217b. Sent at runtime; the published tool catalog remains fixed (189a).
export const FINAL_CHECK_RUNTIME_DESCRIPTION = "Final check of a research answer before it is given. " +
  "Only six checks can return not_ready: source receipts and links match the named sources; declared read depth " +
  "matches receipts, and the answer says beside each key source it cites how it was read, that reading and its words " +
  "given in later_inputs.source_reading; binary arithmetic and shown figures match their declared counts; safety " +
  "statements have a " +
  "named-harm screen with at least one harm searched; retracted statements stay out; and a plain answer registered " +
  "before the research, passed in receipts, is compared claim by claim in plain_answer_comparison (unless the " +
  "account turned its note off). All other diagnostics are notes " +
  "for the AI to act on and do not consume rounds or stop the answer. The panel shows every limit beneath a passing " +
  "checked answer, so that answer states in the model's own words only the limits that change what the person should " +
  "believe or do; an answer whose check has not passed states every material limit. " +
  "The round limit and stuck-step report apply only to the six blocking checks. A usable answer_draft and " +
  "research_target are needed for the check to run. " +
  // Owner answer 237a.
  `A key claim can carry a source line: later_inputs.source_lines, a list of lines such as ${SOURCE_LINE_EXAMPLE}, ` +
  `each with these five fields and no others: ${SOURCE_LINE_FIELDS}; all are shown beside the claim. AskRigor then ` +
  "looks both quotes up in the text it fetched; this is optional and holds nothing back.";
// A passing check is the turn's last unless the draft itself changes, and then once more (11 November 2026). In the 10
// Nov timing runs, 49 of 88 final-check calls came after the check had passed in the same turn, 0 to 6 a turn, invited by
// "to change anything in it, call finalize_research again" on every pass and by notes about later inputs. HRP asks for
// another call only on not_ready. The 22 Oct rule stays: a draft changed after a pass is checked again, once.
// AskRigor lesson 56 (5 Nov 2026): a research lane read a ready_with_limits pass as the end of discovery and closed with
// YouTube never searched and Reddit rate-limited. The panel already says the check "does not judge the reasoning or
// whether the conclusions are right"; every passing result now says it to the AI too, inside its pass sentence.
export const PASS_SCOPE = "a pass covers the six checks, not whether the search was complete";
// What the passing result itself asks the answer to include (the sentences it gives as written, such as a caveat or the
// reading sentence, and the closing questions) is not a change to the checked draft (11 Nov 2026, the review).
const INCLUDED_IS_NOT_A_CHANGE = "adding what this result asks the answer to include (its sentences given as written, " +
  "and the closing questions it asks for) is not a change to the draft";
// A note that asks for an input waits for a later answer; a note that says the answer itself is wrong (a quote not in the
// paper, two studies that may be one dataset) is fixed now, which changes the draft (11 Nov 2026, the review).
export const FIRST_PASS_GUIDANCE = `This check passed (${PASS_SCOPE}): give the user the checked answer_draft now, ` +
  `word for word, followed only by the lines this result gives for its end; ${INCLUDED_IS_NOT_A_CHANGE}. A note ` +
  "asking you to add or resend an input (study_map, findings_card, source_lines or community_leads) is for a later " +
  "answer: send none of them again in this turn. Change the draft only to fix the answer itself (something a note " +
  "here says is wrong in it, a limit listed here that changes what this person should believe or do, limits it " +
  "repeats word for word, or an error you found in it); then call finalize_research once more with the changed " +
  "draft, the turn's last check.";
// A pass after a pass in the same turn (finalize_research's turn_already_passed), known from the carried state and the
// round token without stored state.
export const REPEAT_PASS_GUIDANCE = `This turn's check had already passed before this call (${PASS_SCOPE}), so this ` +
  "result is the turn's last check: give this checked answer_draft now, word for word, followed only by the lines " +
  "this result gives for its end, and don't call finalize_research again in this turn; make in the answer, with no " +
  "further check, any fix its notes and limits call for. " +
  `${INCLUDED_IS_NOT_A_CHANGE.charAt(0).toUpperCase()}${INCLUDED_IS_NOT_A_CHANGE.slice(1)}.`;
// The notes' heading under a passing check: a note asking for an input is for a later answer, and one saying the answer
// is wrong is fixed now, checked once more after a first pass, and with no further check after a repeat pass.
export const PASSING_NOTES_HEADING = "Notes about the call (the check passed: a note asking you to add or resend an " +
  "input is for a later answer and needs no new check in this turn; a note saying something in the answer is wrong is " +
  "fixed in the draft now, and the changed draft is checked once more):";
export const REPEAT_PASS_NOTES_HEADING = "Notes about the call (this turn's check had already passed: a note asking " +
  "you to add or resend an input is for a later answer; a note saying something in the answer is wrong is fixed in " +
  "the answer, with no further check in this turn):";
// Owner answer 205a (30 October 2026): beside the limits of a passing check, which the panel lists in full.
export const PASSING_LIMITS_GUIDANCE = "The panel lists every limit below beneath the checked answer, so the answer " +
  "need not repeat them. The answer " +
  "states, in its own words, only those that change what this person should believe or do; if the checked draft " +
  "leaves out one that does, add it and call finalize_research again with the changed draft. The panel's limits, " +
  "for reference only and not to copy:";
// The same after a pass that followed a pass in this turn, the turn's last check (11 Nov 2026): no further call.
export const REPEAT_PASS_LIMITS_GUIDANCE = "The panel lists every limit below beneath the checked answer, so the " +
  "answer need not repeat them. The answer states, in its own words, only those that change what this person should " +
  "believe or do; if the checked draft leaves out one that does, add it, with no further check in this turn. The " +
  "panel's limits, for reference only and not to copy:";
// The owner's comparison of 6 November 2026 (a lesson): free ChatGPT without AskRigor ended its tirzepatide answer with
// three numbered questions (an alternative to CPAP or an add-on; obesity, overweight or normal weight; the person's AHI,
// with examples) and said what it would do with the answers, while AskRigor's answer never asked about weight, though the
// trials and the US approval cover only people with obesity. HRP ComplexAnswerFooter already asks for the most
// decision-changing next data. Under every status; no word list or check reads the questions, in any field or language.
export const CLOSING_QUESTIONS_GUIDANCE = "When the answer depends on the person's situation, close it, before the lines " +
  "this result puts at its end, with at most three questions whose answers would most change it (HRP " +
  "ComplexAnswerFooter: the most decision-changing next data): what they are deciding (for example, instead of what " +
  "they use now, or as well as it); whether they match the people the key studies enrolled (such as weight, age, " +
  "severity or other conditions); and their key measurement. Make each easy to answer, with example answers, and say " +
  "what each answer would change.";
