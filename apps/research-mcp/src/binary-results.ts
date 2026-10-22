import { z } from "zod";

import { normalizedFindingsText } from "./findings/card.js";
import { includesAbsoluteNumber, numberReadings } from "./unicode-numbers.js";

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

const groupName = (description: string) => z.string().trim().min(1).max(120).describe(description);

/**
 * One yes-or-no figure of an Atlas finding's wording: binary_results' flat entry without its quote, since the wording
 * is what shows it, and with harms_none_found in place of harms_quote. Flat fields only, as binary_results' are, so
 * ChatGPT's app shows the model every field. The same entry is phase 3's numbers block on findings cards.
 */
export const atlasNumberSchema = z.object({
  outcome: z.string().trim().min(1).max(200)
    .describe("The yes-or-no outcome as the wording names it, such as response or any adverse event."),
  better: z.enum(["fewer", "more"])
    .describe("Whether fewer or more people with this outcome is better: fewer for a harm or a relapse, more for a " +
      "response or a remission."),
  option: groupName("The option the figure is about, as the wording names it."),
  option_events: z.number().int().nonnegative().describe("How many people in the option's group had the outcome."),
  option_total: z.number().int().min(1).describe("How many people were in the option's group."),
  comparator: groupName("What the option was compared with, as the wording names it, such as placebo."),
  comparator_events: z.number().int().nonnegative()
    .describe("How many people in the comparator's group had the outcome."),
  comparator_total: z.number().int().min(1).describe("How many people were in the comparator's group."),
  follow_up: z.string().trim().min(1).max(120)
    .describe("How long people were followed for this outcome, as the wording writes it, such as 12 weeks."),
  nnt: z.number().positive().optional()
    .describe("The number needed to treat the wording gives for this outcome, if it gives one: 1 divided by the " +
      "difference in the groups' rates, rounded up."),
  nnh: z.number().positive().optional()
    .describe("The number needed to harm the wording gives for this outcome, if it gives one: 1 divided by the " +
      "difference in the groups' rates, rounded up."),
  harms_none_found: z.boolean().optional()
    .describe("With nnt: true when no harms were found over the same follow-up. Otherwise each harm measured over it " +
      "is its own entry, with better set to fewer.")
}).strict();

export type AtlasNumber = z.output<typeof atlasNumberSchema>;

/** The figures an Atlas finding's wording gives for two groups: an empty list when it gives none. */
export const atlasNumbersSchema = z.array(atlasNumberSchema).max(20)
  .describe("Each yes-or-no figure the wording gives for two groups, or with a number needed to treat or harm (an " +
    "empty list if none). The wording shows each group's events and total, or its rate as a percentage, in digits of " +
    "any script; nnt (the option did better) or nnh (it did worse) is checked against 1 divided by the difference in " +
    "the groups' rates, rounded up, and the wording shows it with the follow-up. Beside an nnt, an entry for a harm " +
    "(better: fewer) over the same follow-up, or harms_none_found.");

export type AtlasNumbers = z.output<typeof atlasNumbersSchema>;

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

/**
 * The exact checks on an Atlas finding's numbers against its wording (owner answers 149a and 153b), as
 * finalize_research checks binary_results against an answer: events never exceed the group's total; a number needed to
 * treat or harm is 1 divided by the difference in rates, rounded up, and the one its counts support (an nnt when the
 * option did better); the wording shows each group's events and total or its rate, in digits of any script; it shows
 * each number needed to treat or harm with its follow-up; and beside a number needed to treat, the numbers hold an
 * entry for a harm (better: fewer) over the same follow-up, or say harms_none_found. Whether an entry is a harm, and
 * what its outcome means, stay the model's declarations.
 */
export function atlasNumbersProblems(numbers: readonly AtlasNumber[], wording: string): AtlasNumbersProblem[] {
  const problems: AtlasNumbersProblem[] = [];
  const add = (at: string, code: AtlasNumbersProblemCode, message: string) => problems.push({ at, code, message });
  // A total of 1,000 or more may be written with a grouping separator, so each number counts in every reading.
  const readings = numberReadings(wording);
  const shownWording = comparableText(wording);
  for (const [index, entry] of numbers.entries()) {
    const at = `numbers[${index}]`;
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
            "give the reciprocal rounded up, recomputed from the groups' counts the wording uses, or correct the " +
            "counts.");
        }
      }
    }
    // What the wording shows: each group's figure, as its events and total or its rate as a percentage.
    for (const { name, events, total } of binaryGroups(entry)) {
      // More events than people has its own problem, and no rate.
      if (events > total) continue;
      const rate = 100 * events / total;
      // A rate rounded to a whole number or to one decimal is within 0.5 of it.
      const rateShown = readings.some((number) => Math.abs(number - rate) <= 0.5 + 1e-9);
      if (!rateShown && !(includesAbsoluteNumber(readings, events) && includesAbsoluteNumber(readings, total))) {
        add(at, "group_figure_not_shown", `${at} gives a figure the wording does not show for ${name}: the wording ` +
          `contains neither its events and total (${events} and ${total}) nor its rate (${Number(rate.toFixed(1))}%).`);
      }
    }
    for (const field of stated) {
      if (!includesAbsoluteNumber(readings, entry[field]!)) {
        add(at, "number_needed_not_shown", `${at} gives a number needed to ${field === "nnt" ? "treat" : "harm"} ` +
          `the wording does not show: the wording does not contain ${entry[field]}.`);
      }
    }
    const followUp = comparableFollowUp(entry.follow_up);
    if (stated.length > 0 && !(/[\p{L}\p{N}]/u.test(followUp) && shownWording.includes(followUp))) {
      add(at, "follow_up_not_shown", `${at} gives a number needed to treat or harm without its follow-up: the ` +
        "wording does not contain the declared follow-up.");
    }
    // Beside a benefit figure, the harms measured over the same follow-up, or that none were found (153b). An entry
    // whose counts make its number one needed to harm, or leave none, is not asked for them: its own problem changes
    // the number first.
    if (entry.nnt === undefined) {
      if (entry.harms_none_found === true) {
        add(at, "harms_none_found_without_nnt", `${at} gives harms_none_found without nnt: it goes only beside a ` +
          "number needed to treat. Leave it out here.");
      }
    } else if (supported === "nnt" && entry.harms_none_found !== true && !numbers.some((other, otherIndex) =>
      otherIndex !== index && other.better === "fewer" && comparableFollowUp(other.follow_up) === followUp)) {
      add(at, "harms_missing", `${at} gives nnt without the harms beside it: add an entry for each harm measured ` +
        `over the same follow-up (${withoutEndPunctuation(entry.follow_up)}), with better set to fewer, or set ` +
        "harms_none_found when none were found, and say so in the wording.");
    }
  }
  return problems;
}

/**
 * Text as these checks compare a follow-up with the wording: as the findings library compares wording (Unicode
 * compatibility form, invisible characters, spacing and case set aside), with curly quotation marks, dashes and
 * emphasis marks set aside too. Exact, and the same in any language.
 */
function comparableText(text: string): string {
  return normalizedFindingsText(text)
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[“”]/gu, "\"")
    .replace(/[‐-―−]/gu, "-")
    .replace(/[*_`]/gu, "")
    .replace(/ {2,}/gu, " ")
    .trim();
}

/** A declared follow-up as the checks compare it: without a closing sentence mark, then as comparableText. */
const comparableFollowUp = (followUp: string): string => comparableText(withoutEndPunctuation(followUp));
