import type { FinalizeResearchInput } from "../../apps/research-mcp/src/research-finalization-gate.js";

/** The sentence a fixture's answer gains to report the harm its screen found. */
export const SCREENED_HARM_SENTENCE = "Severe allergic reactions are listed among the label's warnings.";

/**
 * Owner answer "128b": an answer with safety statements (safety_claims), or to a safety question (safety_question),
 * lists the serious harms its screen searched by name (harm_screen); owner answer 153c adds an answer that puts forward
 * or ranks a medicine for long-term use (recommendations with long_term_use). Fixtures that isolate other checks get
 * one harm found on the label, reported in a paragraph of its own, so it adds no caveat or limit and changes no other
 * check. A fixture that gives its own harm_screen keeps it.
 */
export function withHarmScreen<T extends Partial<FinalizeResearchInput>>(input: T): T {
  if (input.answer_draft === undefined || input.harm_screen !== undefined ||
    ((input.safety_claims ?? []).length === 0 && input.safety_question !== true &&
      !(input.recommendations ?? []).some(({ long_term_use }) => long_term_use))) return input;
  return {
    ...input,
    answer_draft: `${input.answer_draft}\n\n${SCREENED_HARM_SENTENCE}`,
    harm_screen: [{
      harm: "severe allergic reactions", state: "label_warning", sources_searched: ["label"],
      answer_quote: SCREENED_HARM_SENTENCE
    }]
  };
}
