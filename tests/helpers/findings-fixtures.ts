import { findingsCardSchema } from "../../apps/research-mcp/src/findings/card.js";

/**
 * A findings card as a model would send it: a study summary with a link, statistics and a contraction. Its finding rests
 * on a study only; a finding drawn from YouTube comments is left out of the stored card (owner answer 170), and the
 * tests that need one add it.
 */
export const CARD = {
  question: "Does supervised exercise help adults with hip osteoarthritis avoid a joint replacement?",
  usual_answer: "Exercise may ease pain a little, but most people end up needing a replacement.",
  findings: [{
    claim: "Supervised exercise therapy reduced pain more than usual care (standardized difference 0.45, 95% CI " +
      "0.21-0.69) across trials from 2015-2020.",
    certainty: "moderate",
    applies_to: "Adults with hip osteoarthritis who can still walk unaided",
    answer_quote: "In [a 2020 review](https://doi.org/10.1002/art.41142), supervised exercise eased pain more " +
      "than usual care; it's the best-supported option before surgery.",
    sources: ["10.1002/art.41142"],
    why_not_usual: "Quick answers treat exercise as a stopgap rather than the best-supported first option.",
    tags: ["full_text_read"],
    what_would_change_it: "A large trial finding no benefit of supervised exercise over usual care.",
    // Atlas phase 3: what the pages need. A standardized difference is no two-group yes-or-no figure, so the effect's
    // numbers block is declared empty.
    kind: "effect",
    subject: "Supervised exercise therapy",
    subject_type: "practice",
    direction: "benefit",
    numbers: [],
  }],
  // Owner answer 156a (2026-10-22): whom the findings would help, as the model declares it.
  public_value: {
    scope: "public",
    who_else: "Adults with hip osteoarthritis who are weighing a joint replacement",
    what_it_changes: "It makes supervised exercise a first option with real evidence, not a stopgap before surgery.",
  },
  topic: { key: "hip-osteoarthritis", label: "Hip osteoarthritis" },
  open_leads: ["Programs longer than twelve weeks"],
};

export const parsedCard = () => findingsCardSchema.parse(CARD);
