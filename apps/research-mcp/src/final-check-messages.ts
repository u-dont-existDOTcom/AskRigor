// Owner answer 187 (27 October 2026): shared by the stopped answer's caveats and the result panel.
export const COMPLETE_CHECKS_TIP = "To give AskRigor's checks more room to finish, ask it to complete its checks, " +
  'for example: "complete askrigor checks".';
// Owner answers 193a and 195. Sent at runtime; the published tool catalog remains fixed (189a).
export const FINAL_CHECK_RUNTIME_DESCRIPTION = "Final check of a research answer before it is given. " +
  "Only five checks can return not_ready: source receipts and links match the named sources; declared read depth " +
  "matches receipts; binary arithmetic and shown figures match their declared counts; safety statements have a " +
  "named-harm screen with at least one harm searched; retracted statements stay out. All other diagnostics are notes " +
  "for the AI to act on and do not consume rounds or stop the answer. Include the result's material limits in the " +
  "model's own words; the panel also shows every limit beneath a passing checked answer. " +
  "The round limit and stuck-step report apply only to the five blocking checks. A usable answer_draft and " +
  "research_target are needed for the check to run.";
