import { communitySkipCaveat, type FinalizeResearchInput } from "../../apps/research-mcp/src/research-finalization-gate.js";

export { COMMUNITY_SKIP_LIMIT, communitySkipCaveat } from "../../apps/research-mcp/src/research-finalization-gate.js";

/**
 * Owner question 125: an answer whose final check declares community evidence not relevant for no real-world outcome
 * states the server's sentence with the declared reason. Fixtures that isolate other checks append it to their draft
 * as its own paragraph, so it changes no other check.
 */
export function withCommunitySkip<T extends Partial<FinalizeResearchInput>>(input: T): T {
  if (input.answer_draft === undefined || input.community_evidence !== "not_relevant" ||
    input.not_relevant_basis !== "no_real_world_outcome" || input.not_relevant_reason === undefined) return input;
  // Owner answer 149a: the skip also says the question is not about a symptom or a test result, unless a fixture
  // declares otherwise.
  return {
    ...input,
    question_about: input.question_about ?? "other",
    answer_draft: `${input.answer_draft}\n\n${communitySkipCaveat(input.not_relevant_reason)}`,
  };
}
