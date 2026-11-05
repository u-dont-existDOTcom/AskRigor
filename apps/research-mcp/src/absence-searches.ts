import { z } from "zod";

/**
 * The searches a not-found claim needs first (the free Claude test of 5 Nov 2026, Claude Sonnet with AskRigor, on
 * Piliostigma reticulatum leaves): the answer passed the final check saying no mammal toxicity study exists, after
 * PubMed and Europe PMC searches under the plant's usual name. It missed PMID 11372139, whose title spells it
 * "Pilostigma", and a 2022 study in a journal neither index covers. HRP already asks for both searches:
 * UserNamedInterventionSweep (the exact identity and synonyms, widened when results are few),
 * HistoricalVocabularyAndCitationBackchain (historical names and spelling variants) and
 * NoHumanEvidenceAbsenceClaimBeforeSweep (registries and extended source classes before an absence claim). The protocol's
 * words didn't move the model, so a small search's result names them where the model reads it, and the final check asks
 * for them beside a not-found claim and checks what can be checked exactly: each name form declared searched, against a
 * literature search's receipt. Which forms a name has is the model's judgment, in any language.
 */

export const ABSENCE_SWEEP_RULES = "HRP UserNamedInterventionSweep, HistoricalVocabularyAndCitationBackchain and " +
  "NoHumanEvidenceAbsenceClaimBeforeSweep";

/**
 * What search_pubmed and search_europe_pmc add to a small search's result: at most WHOLE_SEARCH_RECORDS (50) records,
 * the same small search register-tools.ts reads whole before anything is called not found, since the model then sees
 * every record and a not-found claim is likeliest. The earlier threshold of 10 missed both searches the test's claim
 * rested on: PubMed has 11 records for "Piliostigma reticulatum", and Europe PMC 23 for it with "toxicity".
 */
export const SMALL_LITERATURE_SEARCH_NOTE = " Few records: before saying studies don't exist, search the key name's " +
  "other spellings, older names and synonyms, and a source beyond PubMed and Europe PMC: your own web search finds " +
  "journals they don't index, and search_clinical_trials covers trial registries " +
  `(${ABSENCE_SWEEP_RULES}).`;

/** search_coverage's values; other_journals is its newer form's (owner answer 189a), for an older app's fixed list. */
export const SEARCH_COVERAGE_VALUES = ["historical_terms", "citation_chains", "grey_literature", "other_journals"] as const;
export type SearchCoverage = typeof SEARCH_COVERAGE_VALUES[number];
export const searchCoverageSchema = z.array(z.enum(SEARCH_COVERAGE_VALUES)).max(SEARCH_COVERAGE_VALUES.length);

export const NAME_FORM_LIMITS = { forms: 12, formCharacters: 120, queryCharacters: 500 } as const;
export const nameFormSchema = z.object({
  form: z.string().trim().min(2).max(NAME_FORM_LIMITS.formCharacters)
    .describe("Another spelling, an older name or a synonym of the key name, as searched."),
  query: z.string().trim().min(1).max(NAME_FORM_LIMITS.queryCharacters)
    .describe("The exact query of the search_pubmed, search_europe_pmc or search_clinical_trials call that searched it, " +
      "whose research_receipt is passed in receipts.")
}).strict();
export type NameForm = z.output<typeof nameFormSchema>;
export const nameFormsSchema = z.array(nameFormSchema).max(NAME_FORM_LIMITS.forms);

/** Text as a name form and its query compare: Unicode's compatibility form, lower case, white space collapsed. */
function formKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

/** Whether a declared query searched the form it names: the form is in it, compared exactly, in any script. */
export function nameFormInQuery({ form, query }: NameForm): boolean {
  const key = formKey(form);
  return key !== "" && formKey(query).includes(key);
}
