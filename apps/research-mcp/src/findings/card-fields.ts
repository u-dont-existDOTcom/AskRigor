import {
  ATLAS_KINDS_WITH_NUMBERS,
  ATLAS_SEARCH_KIND,
  type AtlasFindingDirection,
  type AtlasFindingKind,
} from "@askrigor/evidence-repository";

import { atlasNumbersProblems } from "../binary-results.js";
import type { FindingsCard } from "./card.js";

/**
 * The exact checks on a findings card's Atlas fields (Atlas phase 3, design section 2), which the final check runs with
 * the card's other checks. The kind, subject, subject type, direction and topic are the research AI's declarations and
 * are taken as given, except for the contradictions code can show exactly: a search that found nothing states no
 * direction, its sentence is one the answer declares as not found, and a sentence the answer declares only as not found
 * is a search that found nothing, whatever kind it is given (review finding 3). What is exact: a public card has every
 * field the pages need; a kind that needs numbers or searches has them; the numbers' counts and arithmetic, and the
 * claim showing them, in digits of any script (atlasNumbersProblems, which the owner's acceptance runs too); each figure
 * is one the answer's binary_results gives; and each search is one a literature_search receipt of the same call names.
 * Every comparison is of closed vocabularies, integers, receipt digests or quotes, the same in any language.
 */

/** A figure as binary_results gives it for the answer: its counts and which way is better. */
export interface AnswerFigure {
  better: "fewer" | "more";
  option_events: number;
  option_total: number;
  comparator_events: number;
  comparator_total: number;
}

export interface CardFieldsContext {
  /** Whether the card declares its findings public: the fields the pages need are then required. */
  required: boolean;
  /** The two-group figures this call's binary_results gives, which the card's figures are among. */
  answerFigures: readonly AnswerFigure[];
  /** Whether a literature_search receipt verified in this call names this database and the digest of this query. */
  searched(database: string, query: string): boolean;
  /**
   * The states of this call's absence_claims entries whose quote is this sentence, compared as the gate compares quotes;
   * empty when the answer declares it in none.
   */
  absenceStates(quote: string): readonly string[];
}

const NOT_LOCATED = "support_not_located";

/** Each problem with a card's Atlas fields, as a sentence that names the field and what to change; none when they pass. */
export function cardFieldProblems(card: FindingsCard, context: CardFieldsContext): string[] {
  const problems: string[] = [];
  if (context.required && card.topic === undefined) {
    problems.push("findings_card.topic is missing: with public_value public, give the condition or goal the " +
      'findings are about, as {"key":"velmor-syndrome","label":"Velmor syndrome"}. Without it the card is not saved ' +
      "or offered.");
  }
  card.findings.forEach((finding, index) => {
    const at = `findings_card.findings[${index}]`;
    if (context.required) {
      const missing = (["kind", "subject", "subject_type", "direction"] as const)
        .filter((field) => finding[field] === undefined);
      if (missing.length > 0) {
        problems.push(`${at} is missing ${listed(missing)}: with public_value public, give ${missing.length === 1
          ? "it" : "each"} as the findings description says. Without ${missing.length === 1 ? "it" : "them"} the card ` +
          "is not saved or offered.");
      }
    }
    const kind = finding.kind;
    if (kind !== undefined && (ATLAS_KINDS_WITH_NUMBERS as readonly string[]).includes(kind) &&
      finding.numbers === undefined) {
      problems.push(`${at} is of kind ${kind} without numbers: give each two-group yes-or-no figure its claim gives, ` +
        "as binary_results gives it without its quotes, or an empty list if it gives none.");
    }
    problems.push(...findingFieldContradictions(finding, at));
    if (kind === ATLAS_SEARCH_KIND) {
      if ((finding.searches ?? []).length === 0) {
        problems.push(`${at} is of kind nothing_found without searches: give each search that found nothing, by its ` +
          "database and exact query, made here with search_pubmed, search_europe_pmc or search_clinical_trials and " +
          "passed by its research_receipt.");
      }
      if (!context.absenceStates(finding.answer_quote).includes(NOT_LOCATED)) {
        problems.push(`${at} is of kind nothing_found, but its answer_quote is not the quote of an absence_claims ` +
          "entry of state support_not_located: declare that sentence there, as something the searches made here did " +
          "not find, or give the finding the kind it has.");
      }
    } else if (kind !== undefined) {
      // The other direction (review finding 3): a sentence the answer declares only as not found is a search that
      // found nothing, whatever kind the finding declares, since "not found" and "no effect" are kept apart.
      const states = context.absenceStates(finding.answer_quote);
      if (states.length > 0 && states.every((state) => state === NOT_LOCATED)) {
        problems.push(`${at}'s answer_quote is declared in absence_claims only as support_not_located, as something ` +
          "the searches made here did not find, so the finding is a search that found nothing: give it kind " +
          "nothing_found, direction descriptive and its searches. A study that found no difference is declared another " +
          "way in absence_claims (direct_null_evidence, say), and is an effect or harm finding with direction no_effect.");
      }
    }
    // Searches that go with another kind are refused above; only a search that found nothing is bound to a receipt.
    if (kind === ATLAS_SEARCH_KIND || kind === undefined) {
      (finding.searches ?? []).forEach((search, place) => {
        if (!context.searched(search.database, search.query)) {
          problems.push(`${at}.searches[${place}] is not a search passed here: no literature_search receipt of this ` +
            `call has database ${search.database} and that query. Give the query exactly as it was searched, and pass ` +
            "its research_receipt.");
        }
      });
    }
    const numbers = finding.numbers ?? [];
    problems.push(...atlasNumbersProblems(numbers, finding.claim, {
      at: (place) => `${at}.numbers[${place}]`,
      text: "claim",
    }).map(({ message }) => message));
    numbers.forEach((entry, place) => {
      const reported = context.answerFigures.some((figure) => figure.better === entry.better &&
        figure.option_events === entry.option_events && figure.option_total === entry.option_total &&
        figure.comparator_events === entry.comparator_events && figure.comparator_total === entry.comparator_total);
      if (!reported) {
        problems.push(`${at}.numbers[${place}] gives a figure no binary_results entry of this call gives ` +
          `(${entry.option_events} of ${entry.option_total} against ${entry.comparator_events} of ` +
          `${entry.comparator_total}, better ${entry.better}): each figure on the card is one the answer reports, so ` +
          "give it as binary_results declares it, or leave it out.");
      }
    });
  });
  return problems;
}

/**
 * The contradictions code can show between a finding's own declarations, at the final check and at the owner's
 * acceptance: searches go only with a search that found nothing, and such a finding states no direction, since a study
 * that found no difference is an effect or harm finding with direction no_effect.
 */
export function findingFieldContradictions(
  finding: { kind?: AtlasFindingKind; direction?: AtlasFindingDirection; searches?: readonly unknown[] },
  at: string,
): string[] {
  const problems: string[] = [];
  // An empty list of searches is no searches (review finding 7).
  if ((finding.searches ?? []).length > 0 && finding.kind !== undefined && finding.kind !== ATLAS_SEARCH_KIND) {
    problems.push(`${at} gives searches, which go only with kind nothing_found: leave them out.`);
  }
  if (finding.kind === ATLAS_SEARCH_KIND && finding.direction !== undefined && finding.direction !== "descriptive") {
    problems.push(`${at} is of kind nothing_found with direction ${finding.direction}: a search that found nothing ` +
      "states no effect either way, so its direction is descriptive. A study that found no difference is an effect or " +
      "harm finding with direction no_effect.");
  }
  return problems;
}

/** A list in words: "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
