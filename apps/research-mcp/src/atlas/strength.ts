import { differenceRange } from "../difference-range.js";

/**
 * How strong a finding's claim is (the owner, 2 Nov 2026: "the stronger the claim is, the higher it ranks, but the more
 * it needs checking"; what matters is "high quality useful information especially that is hard to find with a regular
 * chatgpt or claude chat or that's anti-common sense"). A first rule for the owner to correct, computed only from
 * declared fields, so it reads every language alike:
 * - how sure AskRigor is: high 3, moderate 2, low 1, very low 0;
 * - its kind: a correction of a common claim, an overlooked option or a tested-against-sold comparison 2 (what a quick
 *   answer misses), an effect or a harm 1, a search that found nothing or a finding of no declared kind 0;
 * - its largest clear difference between two groups (one whose 95% range leaves out no difference): 1 point for each
 *   10 out of 100, at most 3.
 * Nothing about who wrote it, votes or comments counts.
 */

export type StrengthCertainty = "high" | "moderate" | "low" | "very_low";

/** The declared fields the strength reads, from a page's finding or a stored card's. */
export interface StrengthInput {
  certainty: StrengthCertainty | null;
  kind: string | null | undefined;
  numbers: ReadonlyArray<{ optionEvents: number; optionTotal: number; comparatorEvents: number; comparatorTotal: number }>;
}

export interface ClaimStrength {
  certainty: number;
  kind: number;
  difference: number;
  total: number;
}

const CERTAINTY_POINTS: Record<StrengthCertainty, number> = { high: 3, moderate: 2, low: 1, very_low: 0 };
const HARD_TO_FIND = new Set(["correction", "overlooked_option", "tested_vs_sold"]);
const EFFECT = new Set(["effect", "harm"]);

/** At or above this, an unreviewed finding is marked as needing checking: its claim is strong. */
export const STRONG_CLAIM = 5;

/** The rule in one plain sentence, as the pages say it. */
export const STRENGTH_RULE = "Stronger claims come first: a finding gets 3 points if AskRigor is highly sure of it, 2 if " +
  "moderately and 1 if a little; 2 if it corrects a common claim, finds an overlooked option or compares what was tested " +
  "with what is sold, or 1 for another effect or harm; and 1 for every 10 out of 100 of a clear difference between two " +
  "groups, up to 3.";

export function claimStrength(input: StrengthInput): ClaimStrength {
  const certainty = input.certainty === null ? 0 : CERTAINTY_POINTS[input.certainty];
  const kind = input.kind == null ? 0 : HARD_TO_FIND.has(input.kind) ? 2 : EFFECT.has(input.kind) ? 1 : 0;
  let largest = 0;
  for (const entry of input.numbers) {
    const range = differenceRange({ option_events: entry.optionEvents, option_total: entry.optionTotal,
      comparator_events: entry.comparatorEvents, comparator_total: entry.comparatorTotal });
    if (range.clear) largest = Math.max(largest, Math.abs(range.difference));
  }
  // Out of 100, in whole tens; the small offset keeps an exact 10 out of 100 from rounding down.
  const difference = Math.min(3, Math.floor(largest * 10 + 1e-9));
  return { certainty, kind, difference, total: certainty + kind + difference };
}

/** A stored card's finding's strength, its numbers block in the card's own field names. */
export function storedClaimStrength(finding: {
  certainty: StrengthCertainty;
  kind?: string | undefined;
  numbers?: ReadonlyArray<{ option_events: number; option_total: number; comparator_events: number; comparator_total: number }>;
}): ClaimStrength {
  return claimStrength({
    certainty: finding.certainty,
    kind: finding.kind,
    numbers: (finding.numbers ?? []).map((entry) => ({ optionEvents: entry.option_events, optionTotal: entry.option_total,
      comparatorEvents: entry.comparator_events, comparatorTotal: entry.comparator_total })),
  });
}
