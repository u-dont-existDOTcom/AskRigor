/**
 * The 95% range of a yes-or-no result's difference in rates, in a module of its own with no imports, so the Atlas's
 * page data can rank by it (atlas/strength.ts) without importing the final check's figure reading (binary-results.ts).
 */

/** The counts of a yes-or-no result's two groups, under the names binary_results gives their fields. */
interface GroupCounts {
  option_events: number;
  option_total: number;
  comparator_events: number;
  comparator_total: number;
}

// The 97.5th percentile of the standard normal distribution, for two-sided 95% ranges.
const Z_95 = 1.959963984540054;

/** The Wilson score interval of one group's rate, events of total, at 95%. */
function wilsonInterval(events: number, total: number): { rate: number; lower: number; upper: number } {
  const z2 = Z_95 * Z_95;
  const centre = (events + z2 / 2) / (total + z2);
  const half = Z_95 * Math.sqrt(events * (total - events) / total + z2 / 4) / (total + z2);
  return { rate: events / total, lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
}

/**
 * The 95% range of a yes-or-no result's difference in rates, the option's minus the comparator's (owner answer 225a,
 * 2 Nov 2026), by Newcombe's hybrid score method (method 10 of Newcombe 1998, from each group's Wilson interval), which
 * holds up with small counts and with no events in a group. It treats the two groups as independent: it does not allow
 * for a crossover or clustered design. The difference is clear when the range leaves out zero.
 */
export function differenceRange(result: GroupCounts): { difference: number; lower: number; upper: number; clear: boolean } {
  const option = wilsonInterval(result.option_events, result.option_total);
  const comparator = wilsonInterval(result.comparator_events, result.comparator_total);
  const difference = option.rate - comparator.rate;
  const lower = difference - Math.sqrt((option.rate - option.lower) ** 2 + (comparator.upper - comparator.rate) ** 2);
  const upper = difference + Math.sqrt((option.upper - option.rate) ** 2 + (comparator.rate - comparator.lower) ** 2);
  return { difference, lower, upper, clear: lower > 0 || upper < 0 };
}

