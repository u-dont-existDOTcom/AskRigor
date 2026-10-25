import type { AtlasNumberEntry } from "@askrigor/evidence-repository";

import { normalizedFindingsText } from "./findings/card.js";
import { includesAbsoluteNumber, numberReadings, withAsciiDigits } from "./unicode-numbers.js";

/**
 * Yes-or-no results for two groups: finalize_research's binary_results for an answer (AskRigor#356), and the numbers
 * the AI declares for a finding the owner accepts into the Atlas (Atlas phase 2 design, section 2; owner answers 149a
 * and 153b). For each figure the model declares each group's events and total, which direction is better and the
 * follow-up; the code here works out the arithmetic exactly, in integers. Whether the counts are the paper's own, and
 * what an outcome means, stay the model's declarations, and undeclared figures are invisible to these checks.
 */

/** The counts of a yes-or-no result's two groups, under the names binary_results gives their fields. */
export interface BinaryCounts {
  option: string;
  option_events: number;
  option_total: number;
  comparator: string;
  comparator_events: number;
  comparator_total: number;
}

/** A yes-or-no result's two groups as declared, by the prefix of their fields: the option's and the comparator's. */
export function binaryGroups(result: BinaryCounts) {
  return [
    { field: "option", name: withoutEndPunctuation(result.option), events: result.option_events,
      total: result.option_total },
    { field: "comparator", name: withoutEndPunctuation(result.comparator), events: result.comparator_events,
      total: result.comparator_total }
  ] as const;
}

/**
 * How a yes-or-no result's two rates differ, in exact integer arithmetic: the rates are compared by cross-multiplying,
 * option_events · comparator_total against comparator_events · option_total, so 1 / |risk difference| is
 * option_total · comparator_total / |difference|. Undefined when the rates are the same, which leaves no number
 * needed to treat or harm.
 */
export function binaryContrast(result: BinaryCounts):
  { optionHigher: boolean; reciprocal: number; roundedUp: number } | undefined {
  const option = BigInt(result.option_events) * BigInt(result.comparator_total);
  const comparator = BigInt(result.comparator_events) * BigInt(result.option_total);
  if (option === comparator) return undefined;
  const people = BigInt(result.option_total) * BigInt(result.comparator_total);
  const difference = option > comparator ? option - comparator : comparator - option;
  // Both are positive, so the quotient is rounded down.
  const roundedDown = people / difference;
  return {
    optionHigher: option > comparator,
    reciprocal: Number(people) / Number(difference),
    roundedUp: Number(people % difference === 0n ? roundedDown : roundedDown + 1n)
  };
}

/** Text without surrounding spaces or a closing sentence mark or semicolon, spaces made single. */
export function withoutEndPunctuation(text: string): string {
  let result = text.replace(/\s+/gu, " ").trim();
  for (let shorter = result.replace(/[\p{STerm};]$/u, "").trimEnd(); shorter !== result;
    shorter = result.replace(/[\p{STerm};]$/u, "").trimEnd()) {
    result = shorter;
  }
  return result;
}

// An Atlas finding's numbers have one definition: atlasNumberEntrySchema and atlasNumbersSchema in
// @askrigor/evidence-repository, which the owner's tool takes and the intents store. The checks below read them.

export const ATLAS_NUMBERS_PROBLEM_CODES = [
  "events_exceed_total",
  "same_rates",
  "nnt_and_nnh",
  "wrong_direction",
  "not_reciprocal_rounded_up",
  "group_figure_not_shown",
  "number_needed_not_shown",
  "follow_up_not_shown",
  "harms_missing",
  "harms_none_found_without_nnt"
] as const;

export type AtlasNumbersProblemCode = typeof ATLAS_NUMBERS_PROBLEM_CODES[number];

/** A problem with a declared figure: where it is (numbers[i]), its code, and what to change, in plain words. */
export interface AtlasNumbersProblem {
  at: string;
  code: AtlasNumbersProblemCode;
  message: string;
}

/** Where the problems of atlasNumbersProblems point, and what they call the text they read. */
export interface AtlasNumbersReading {
  /** Each entry's place, as numbers[i] by default; a findings card's are findings_card.findings[k].numbers[i]. */
  at?: (index: number) => string;
  /** What the text is called in the messages: "wording" (an accepted finding's, the default) or "claim" (a card's). */
  text?: string;
}

/**
 * The exact checks on an Atlas finding's numbers against its wording (owner answers 149a and 153b), as
 * finalize_research checks binary_results against an answer: events never exceed the group's total; a number needed to
 * treat or harm is 1 divided by the difference in rates, rounded up, and the one its counts support (an nnt when the
 * option did better); the wording shows each group's events and total or its rate, each number needed to treat or harm
 * and its follow-up, as figureShown reads them for the answer's quotes too; and beside a number needed to treat, the
 * numbers hold an entry for a harm (better: fewer) over the same follow-up, or say harms_none_found. Whether an entry is
 * a harm, and what its outcome means, stay the model's declarations. The final check runs the same checks on a findings
 * card's numbers block against its claim (Atlas phase 3), so a card it passes also passes the owner's acceptance.
 */
export function atlasNumbersProblems(
  numbers: readonly AtlasNumberEntry[],
  wording: string,
  reading: AtlasNumbersReading = {}
): AtlasNumbersProblem[] {
  const problems: AtlasNumbersProblem[] = [];
  const add = (at: string, code: AtlasNumbersProblemCode, message: string) => problems.push({ at, code, message });
  const place = reading.at ?? ((index: number) => `numbers[${index}]`);
  const named = reading.text ?? "wording";
  for (const [index, entry] of numbers.entries()) {
    const at = place(index);
    const overCounted = binaryGroups(entry).filter(({ events, total }) => events > total);
    for (const { field, name } of overCounted) {
      add(at, "events_exceed_total", `${at} gives more events than people for ${name}: ${field}_events counts the ` +
        `people in that group with the outcome, so it cannot exceed ${field}_total.`);
    }
    const stated = (["nnt", "nnh"] as const).filter((field) => entry[field] !== undefined);
    // The number the counts support: an nnt when the option did better, an nnh when it did worse.
    let supported: "nnt" | "nnh" | undefined;
    const contrast = overCounted.length > 0 ? undefined : binaryContrast(entry);
    if (overCounted.length === 0 && stated.length > 0 && contrast === undefined) {
      add(at, "same_rates", `${at}'s counts give the same rate in both groups, so there is no number needed to treat ` +
        `or harm: leave ${stated.join(" and ")} out.`);
    } else if (contrast !== undefined && stated.length > 0) {
      // The option did better when a larger share had an outcome more people should have, or a smaller share one
      // fewer should.
      const optionBetter = contrast.optionHigher === (entry.better === "more");
      supported = optionBetter ? "nnt" : "nnh";
      if (stated.length === 2) {
        add(at, "nnt_and_nnh", `${at} gives both nnt and nnh: give only ${supported}, the one its counts support.`);
      } else {
        const field = stated[0]!;
        const value = entry[field]!;
        if (field !== supported) {
          const [outcome, option, comparator] = [entry.outcome, entry.option, entry.comparator]
            .map(withoutEndPunctuation);
          add(at, "wrong_direction", `${at} gives ${field}, but by its counts a ` +
            `${contrast.optionHigher ? "larger" : "smaller"} share of people had ${outcome} with ${option} than ` +
            `with ${comparator}, and ${entry.better} is better, so it is a number needed to ` +
            `${optionBetter ? "treat" : "harm"}: give it as ${supported}.`);
        }
        // Only the reciprocal rounded up counts (owner answer 153b: "rounding the reciprocal up").
        if (value !== contrast.roundedUp) {
          add(at, "not_reciprocal_rounded_up", `${at} gives ${field} ${value}, but by its counts 1 divided by the ` +
            `difference in rates is ${contrast.reciprocal.toFixed(1)}, which rounds up to ${contrast.roundedUp}: ` +
            `give the reciprocal rounded up, recomputed from the groups' counts the ${named} uses, or correct the ` +
            "counts.");
        }
      }
    }
    // What the wording shows of the figure, read as the answer's binary_results quotes are.
    const shown = figureShown(entry, wording);
    for (const { name, events, total, rate } of shown.groupsNotShown) {
      add(at, "group_figure_not_shown", `${at} gives a figure the ${named} does not show for ${name}: the ${named} ` +
        `contains neither its events and total (${events} and ${total}) nor its rate (${Number(rate.toFixed(1))}%).`);
    }
    for (const field of shown.numbersNeededNotShown) {
      add(at, "number_needed_not_shown", `${at} gives a number needed to ${field === "nnt" ? "treat" : "harm"} ` +
        `the ${named} does not show: the ${named} does not contain ${entry[field]}.`);
    }
    if (stated.length > 0 && !shown.followUpShown) {
      add(at, "follow_up_not_shown", `${at} gives a number needed to treat or harm without its follow-up: the ` +
        `${named} does not contain the declared follow-up.`);
    }
    // Beside a benefit figure, the harms measured over the same follow-up, or that none were found (153b). An entry
    // whose counts make its number one needed to harm, or leave none, is not asked for them: its own problem changes
    // the number first.
    const followUp = followUpText(entry.follow_up);
    if (entry.nnt === undefined) {
      if (entry.harms_none_found === true) {
        add(at, "harms_none_found_without_nnt", `${at} gives harms_none_found without nnt: it goes only beside a ` +
          "number needed to treat. Leave it out here.");
      }
    } else if (supported === "nnt" && entry.harms_none_found !== true && !numbers.some((other, otherIndex) =>
      otherIndex !== index && other.better === "fewer" && followUpText(other.follow_up) === followUp)) {
      add(at, "harms_missing", `${at} gives nnt without the harms beside it: add an entry for each harm measured ` +
        `over the same follow-up (${withoutEndPunctuation(entry.follow_up)}), with better set to fewer, or set ` +
        `harms_none_found when none were found, and say so in the ${named}.`);
    }
  }
  return problems;
}

/** A yes-or-no figure as figureShown reads it against a text: its groups' counts, its follow-up and any number needed. */
export interface BinaryFigure extends BinaryCounts {
  follow_up: string;
  nnt?: number;
  nnh?: number;
}

/** What a text shows of a yes-or-no figure, as figureShown reads it. */
export interface FigureShown {
  /** Each group whose figure the text shows neither as its events and total nor as its rate, the option first. */
  groupsNotShown: Array<{ field: "option" | "comparator"; name: string; events: number; total: number; rate: number }>;
  /** Each number needed to treat or harm the figure gives that the text does not contain, nnt first. */
  numbersNeededNotShown: Array<"nnt" | "nnh">;
  /** Whether the text shows the declared follow-up, standing as its own number. */
  followUpShown: boolean;
}

/**
 * What a text shows of a yes-or-no figure: the one reading for the answer's binary_results quotes (AskRigor#356) and
 * for an Atlas finding's numbers against its claim or wording (owner answers 149a and 153b), so the two checks cannot
 * read a figure differently, as their copies once did (review findings 9 and 10, then the same in the answer's copy).
 * Each part is exact, and the same in any language:
 * - each number counts in every reading, in digits of any script (numberReadings), so a total of 1,000 or more may be
 *   written with a grouping separator;
 * - a group's figure is shown as its events and total, or as its rate rounded to a whole number or one decimal;
 * - the follow-up is shown when the text contains it as declared, both compared in figureText's form (each markdown
 *   link by its text, then Unicode compatibility form, invisible characters, case, spacing, quotation marks, dashes and
 *   emphasis set aside, and digits of any script written as ASCII ones), standing as its own number: a digit at either
 *   end of it continues no number of the text, so "2 years" is not shown by "12 years" or "1.2 years", nor "week 1" by
 *   "week 12";
 * - the numbers of a follow-up the text shows show no rate: one occurrence of each is set aside before rates are
 *   matched, so "12 weeks" does not show a rate of 12.3%, while "12% at 12 weeks" still shows 12%. Events, totals and a
 *   number needed to treat or harm are matched in every number.
 * Whether the text reports the declared outcome stays the model's declaration.
 */
export function figureShown(figure: BinaryFigure, text: string): FigureShown {
  const readings = numberReadings(text);
  const followUpShown = showsFollowUp(figureText(text.replace(MARKDOWN_LINK, "$1")), followUpText(figure.follow_up));
  const rateReadings = followUpShown ? setAside(readings, numberReadings(figure.follow_up)) : readings;
  const groupsNotShown: FigureShown["groupsNotShown"] = [];
  for (const { field, name, events, total } of binaryGroups(figure)) {
    // More events than people has its own problem, and no rate.
    if (events > total) continue;
    const rate = 100 * events / total;
    // A rate rounded to a whole number or to one decimal is within 0.5 of it.
    const rateShown = rateReadings.some((number) => Math.abs(number - rate) <= 0.5 + 1e-9);
    if (!rateShown && !(includesAbsoluteNumber(readings, events) && includesAbsoluteNumber(readings, total))) {
      groupsNotShown.push({ field, name, events, total, rate });
    }
  }
  const numbersNeededNotShown = (["nnt", "nnh"] as const)
    .filter((field) => figure[field] !== undefined && !includesAbsoluteNumber(readings, figure[field]!));
  return { groupsNotShown, numbersNeededNotShown, followUpShown };
}

// A markdown link, bounded and closed to brackets and parentheses, read by its text as the answer check reads one.
const MARKDOWN_LINK = /\[([^[\]\n]{0,500})\]\([^\s()[\]]{1,2048}\)/gu;
// A decimal or grouping mark, which joins the digits on either side of it into one number, as numberReadings reads it.
const NUMBER_MARK = /[.,'\u066B\u066C]/u;
const DIGIT = /\d/u;

/**
 * Text as figureShown compares a follow-up with it: as the findings library compares wording (Unicode compatibility
 * form, invisible characters, spacing and case set aside), with curly quotation marks, dashes and emphasis marks set
 * aside too, and each digit written as its ASCII digit, so a follow-up declared as "12 weeks" is found in text that
 * writes it "١٢ weeks", as the figures are read in digits of any script (review finding 9).
 */
function figureText(text: string): string {
  return withAsciiDigits(normalizedFindingsText(text))
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[“”]/gu, "\"")
    .replace(/[‐-―−]/gu, "-")
    .replace(/[*_`]/gu, "")
    .replace(/ {2,}/gu, " ")
    .trim();
}

/** A declared follow-up as figureShown compares it: in figureText's form, without quotation marks around it or a closing mark. */
function followUpText(followUp: string): string {
  return figureText(followUp).replace(/^["'\p{Pi}\p{Pf}]+/u, "").replace(/["'\p{Pi}\p{Pf}\p{STerm}; ]+$/u, "");
}

/**
 * Whether a text, in figureText's form, contains a follow-up, in followUpText's form, standing as its own number: where
 * the follow-up begins with a digit, the text has neither a digit just before it nor a decimal or grouping mark after a
 * digit there; where it ends with a digit, the same just after it. The digits of both are ASCII by now, so this holds in
 * any script.
 */
function showsFollowUp(text: string, followUp: string): boolean {
  if (!/[\p{L}\p{N}]/u.test(followUp)) return false;
  const first = DIGIT.test(followUp.charAt(0));
  const last = DIGIT.test(followUp.charAt(followUp.length - 1));
  for (let at = text.indexOf(followUp); at >= 0; at = text.indexOf(followUp, at + 1)) {
    const end = at + followUp.length;
    const longerBefore = first && (DIGIT.test(text.charAt(at - 1)) ||
      (NUMBER_MARK.test(text.charAt(at - 1)) && DIGIT.test(text.charAt(at - 2))));
    const longerAfter = last && (DIGIT.test(text.charAt(end)) ||
      (NUMBER_MARK.test(text.charAt(end)) && DIGIT.test(text.charAt(end + 1))));
    if (!longerBefore && !longerAfter) return true;
  }
  return false;
}

/** The readings left once each of the others is set aside, one occurrence of it each. */
function setAside(readings: readonly number[], others: readonly number[]): number[] {
  const left = [...readings];
  for (const number of others) {
    const at = left.indexOf(number);
    if (at >= 0) left.splice(at, 1);
  }
  return left;
}
