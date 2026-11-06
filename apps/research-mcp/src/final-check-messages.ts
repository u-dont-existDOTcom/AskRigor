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
// Owner answer 205a (30 October 2026): beside the limits of a passing check, which the panel lists in full.
export const PASSING_LIMITS_GUIDANCE = "The panel lists every limit below beneath the checked answer, so the answer " +
  "need not repeat them. The answer " +
  "states, in its own words, only those that change what this person should believe or do; if the checked draft " +
  "leaves out one that does, add it and call finalize_research again with the changed draft. The panel's limits, " +
  "for reference only and not to copy:";
