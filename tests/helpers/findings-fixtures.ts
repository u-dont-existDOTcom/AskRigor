import { findingsCardSchema } from "../../apps/research-mcp/src/findings/card.js";

/** A findings card as a model would send it: a study summary with a link, statistics and a contraction. */
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
    sources: ["10.1002/art.41142", "aaaaaaaaaaa"],
    why_not_usual: "Quick answers treat exercise as a stopgap rather than the best-supported first option.",
    tags: ["full_text_read", "community_checked"],
    what_would_change_it: "A large trial finding no benefit of supervised exercise over usual care.",
  }],
  open_leads: ["Programs longer than twelve weeks"],
};

export const parsedCard = () => findingsCardSchema.parse(CARD);
