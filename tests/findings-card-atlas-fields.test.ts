import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  findingsCardDigest,
  findingsCardSchema,
  screenFindingsCard,
  withoutYouTubeData,
} from "../apps/research-mcp/src/findings/card.js";
import { cardFieldProblems, type CardFieldsContext } from "../apps/research-mcp/src/findings/card-fields.js";
import { saveResearchFindingsInputSchema } from "../apps/research-mcp/src/findings/contracts.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService } from "../apps/research-mcp/src/findings/service.js";
import {
  finalizeResearch,
  finalizeResearchPublishedInputSchema,
  type FinalizeResearchInput,
  type FinalizeResearchOutput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  verifyResearchReceipt,
} from "../apps/research-mcp/src/research-receipts.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { FakeGitHub } from "./helpers/fake-github-findings.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// Atlas phase 3 (docs/superpowers/plans/2026-10-22-atlas-phase-3-design.md, sections 1 to 4 and 7): the fields a
// findings card's research AI declares for the public Atlas while the papers are open, and the final check's exact
// parts. Everything here is invented, after the organization draft's worked example: Velmor syndrome, zentarine, the
// trial and its numbers; 10.0000/ marks synthetic identifiers. No figure is evidence about a treatment.

const SECRET = "atlas-card-fields-test-secret-0123456789abcdef";
const DOI = "10.0000/synthetic-velmor-a";
const QUERY = "zentarine children";
const TREMOR_SENTENCE = "In one invented trial of 240 adults, zentarine 20 mg halved the tremor score in 30 of 120 " +
  "against 18 of 120 on placebo over 12 weeks, a number needed to treat of 10.";
const NAUSEA_SENTENCE = "Over the same 12 weeks, nausea affected 12 of 120 on zentarine against 6 of 120 on placebo, " +
  "a number needed to harm of 20.";
const ABSENT_SENTENCE = "No trial of zentarine in people under 18 was found in PubMed.";

type BinaryResult = NonNullable<FinalizeResearchInput["binary_results"]>[number];
const TREMOR_RESULT: BinaryResult = {
  quote: TREMOR_SENTENCE, outcome: "tremor score halved", better: "more", option: "zentarine 20 mg",
  option_events: 30, option_total: 120, comparator: "placebo", comparator_events: 18, comparator_total: 120,
  follow_up: "12 weeks", nnt: 10, harms_quote: NAUSEA_SENTENCE,
};
const NAUSEA_RESULT: BinaryResult = {
  quote: NAUSEA_SENTENCE, outcome: "nausea", better: "fewer", option: "zentarine 20 mg", option_events: 12,
  option_total: 120, comparator: "placebo", comparator_events: 6, comparator_total: 120, follow_up: "12 weeks", nnh: 20,
};
const TREMOR = {
  outcome: "tremor score halved", better: "more", option: "zentarine 20 mg", option_events: 30, option_total: 120,
  comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks", nnt: 10,
} as const;
const NAUSEA = {
  outcome: "nausea", better: "fewer", option: "zentarine 20 mg", option_events: 12, option_total: 120,
  comparator: "placebo", comparator_events: 6, comparator_total: 120, follow_up: "12 weeks", nnh: 20,
} as const;

const EFFECT = {
  claim: "In one invented trial of 240 adults with Velmor syndrome, zentarine 20 mg halved the tremor score in 30 of " +
    "120 against 18 of 120 on placebo over 12 weeks, a number needed to treat of 10; nausea affected 12 of 120 " +
    "against 6 of 120, a number needed to harm of 20.",
  certainty: "low",
  applies_to: "Adults with Velmor syndrome",
  answer_quote: TREMOR_SENTENCE,
  sources: [DOI],
  why_not_usual: "Quick answers call it gentle and miss the trial's numbers, harms included.",
  tags: ["full_text_read"],
  what_would_change_it: "A second trial of similar size.",
  kind: "effect",
  subject: "Zentarine",
  subject_type: "supplement",
  direction: "benefit",
  numbers: [TREMOR, NAUSEA],
};
const NOTHING_FOUND = {
  claim: "No trial of zentarine in people under 18 was found in PubMed.",
  certainty: "moderate",
  applies_to: "Children and teenagers with Velmor syndrome",
  answer_quote: ABSENT_SENTENCE,
  sources: [DOI],
  why_not_usual: "Quick answers give the adult dose for children too.",
  tags: ["documented_absence"],
  what_would_change_it: "A trial in people under 18.",
  kind: "nothing_found",
  subject: "Zentarine",
  subject_type: "supplement",
  direction: "descriptive",
  searches: [{ database: "pubmed", query: QUERY }],
};
const CARD = {
  question: "Does zentarine ease the hand tremor of Velmor syndrome, and is it tested in children?",
  usual_answer: "Zentarine is a gentle supplement that eases the tremor at any age.",
  findings: [EFFECT, NOTHING_FOUND],
  public_value: {
    scope: "public",
    who_else: "People with Velmor syndrome and parents of children with it",
    what_it_changes: "It gives the trial's numbers, harms included, and says no child was studied.",
  },
  topic: { key: "velmor-syndrome", label: "Velmor syndrome" },
  open_leads: [],
};

const withFinding = (index: number, overrides: Record<string, unknown>, card: Record<string, unknown> = CARD) => ({
  ...card,
  findings: (card.findings as Array<Record<string, unknown>>).map((finding, at) =>
    at === index ? { ...finding, ...overrides } : finding),
});
const without = (record: Record<string, unknown>, ...fields: string[]) =>
  Object.fromEntries(Object.entries(record).filter(([field]) => !fields.includes(field)));

const notApplicable = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the card's Atlas fields." };
const search = issueResearchReceipt("literature_search", { src: "pubmed", q: discoveryQueryDigest([QUERY]), ret: 3, n: 3 },
  { secret: SECRET });
const audit = issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields" }, { secret: SECRET });
const request = (card: unknown, overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  lab_preparation: notApplicable, commercial_review_applicability: notApplicable, intervention_identity: notApplicable,
  full_text_search: { status: "not_needed", reason: "Synthetic fixtures isolate the card's Atlas fields." },
  receipts: [audit, search],
  research_target: "Synthetic Atlas card fields fixture", research_depth: "deep",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: "Isolates the findings card's exact checks with synthetic receipts and text.",
  treatment_choice: "not_compared",
  key_sources: [{ read_depth: "full_text_audited", answer_marker: "Study", id: DOI, status: "validated" }],
  answer_draft: `${TREMOR_SENTENCE} ${NAUSEA_SENTENCE} ${ABSENT_SENTENCE}\n\n[Study](https://doi.org/${DOI})`,
  absence_claims: [{ quote: ABSENT_SENTENCE, state: "support_not_located" }], scale_results: [],
  binary_results: [TREMOR_RESULT, NAUSEA_RESULT], user_observations: [], proposed_tests: [], safety_claims: [],
  safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  findings_card: findingsCardSchema.parse(card),
  ...overrides,
});
/** The final check of a free contributor's answer with this card, its caveats carried as the answer would carry them. */
function check(card: unknown, overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchOutput {
  const options = { secret: SECRET, findings: "save" as const };
  const input = withCommunitySkip(request(card, overrides));
  const first = finalizeResearch(input, options);
  return assertNextStepsContract(finalizeResearch({
    ...input, answer_draft: [input.answer_draft, ...first.caveats].join("\n\n"),
  }, options));
}
const signedClaim = (result: FinalizeResearchOutput, claim: string) => {
  const verified = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
  return verified.ok ? verified.claims[claim] : "unverified";
};
const problemsOf = (card: unknown, overrides: Partial<FinalizeResearchInput> = {}) => check(card, overrides).findings_card;

describe("a findings card's Atlas fields (Atlas phase 3)", () => {
  it("checks and signs a public card with every field the pages need, and ends the answer as before", () => {
    const result = check(CARD);
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.findings_card).toEqual({ status: "checked", problems: [], beyond_quick_answer: 2, public_value: "public" });
    // Nothing new is signed: the card's digest covers its new fields. The search that found nothing is a checked
    // absence, so it rests on a verified basis.
    expect(signedClaim(result, "findings")).toBe(findingsCardDigest(findingsCardSchema.parse(CARD)));
    expect(signedClaim(result, "bases")).toEqual(["full_text_audit", "full_text_audit.bounded_absence"]);
  });

  it("is optional in the schema, so a card from an app whose tool list predates it parses with its digest unchanged", () => {
    const older = {
      ...without(CARD, "topic"),
      findings: CARD.findings.map((finding) =>
        without(finding, "kind", "subject", "subject_type", "direction", "numbers", "searches")),
    };
    const parsed = findingsCardSchema.parse(older);
    expect(JSON.stringify(parsed)).not.toMatch(/"(?:kind|subject|subject_type|direction|numbers|searches|topic)"/u);
    // The same card as phase 2 knew it: the new fields add nothing to its canonical text.
    expect(findingsCardDigest(parsed)).toBe(findingsCardDigest(findingsCardSchema.parse({ ...older })));
    expect(findingsCardDigest(parsed)).not.toBe(findingsCardDigest(findingsCardSchema.parse(CARD)));
  });

  it("requires every field on a public card, naming each, and lets the answer go ahead", () => {
    const plain = check(CARD);
    const cases: Array<[unknown, string]> = [
      [without(CARD, "topic"), "findings_card.topic is missing: with public_value public, give the condition or goal " +
        'the findings are about, as {"key":"velmor-syndrome","label":"Velmor syndrome"}. Without it the card is not ' +
        "saved or offered."],
      [withFinding(0, { kind: undefined, subject_type: undefined }), "findings_card.findings[0] is missing kind and " +
        "subject_type: with public_value public, give each as the findings description says. Without them the card " +
        "is not saved or offered."],
      [withFinding(1, { direction: undefined }), "findings_card.findings[1] is missing direction: with public_value " +
        "public, give it as the findings description says. Without it the card is not saved or offered."],
      [withFinding(0, { numbers: undefined }), "findings_card.findings[0] is of kind effect without numbers: give each " +
        "two-group yes-or-no figure its claim gives, as binary_results gives it without its quotes, or an empty list " +
        "if it gives none."],
      [withFinding(1, { searches: undefined }), "findings_card.findings[1] is of kind nothing_found without searches: " +
        "give each search that found nothing, by its database and exact query, made here with search_pubmed, " +
        "search_europe_pmc or search_clinical_trials and passed by its research_receipt."],
    ];
    for (const [card, problem] of cases) {
      const result = check(card);
      expect(result.findings_card, problem).toEqual({ status: "rejected", problems: [problem] });
      // A rejected card never holds back the answer, and is not signed.
      expect(result.status).toBe(plain.status);
      expect(result.next_steps).toEqual([]);
      expect(signedClaim(result, "findings")).toBeUndefined();
    }
  });

  it("does not require them on a card declared personal only, which is never saved, but checks any it gives", () => {
    const personal = {
      ...without(CARD, "topic"), public_value: { scope: "personal_only" },
      findings: CARD.findings.map((finding) => without(finding, "kind", "subject", "subject_type", "direction")),
    };
    expect(problemsOf(personal)).toEqual({ status: "checked", problems: [], beyond_quick_answer: 2,
      public_value: "personal_only" });
    expect(problemsOf(withFinding(1, { searches: [{ database: "pubmed", query: "zentarine adults" }] }, personal))
      .problems).toEqual([expect.stringMatching(/^findings_card\.findings\[1\]\.searches\[0\] is not a search passed here/u)]);
  });

  it("takes an empty numbers block for an effect with no two-group yes-or-no figure", () => {
    const continuous = withFinding(0, {
      claim: "In one invented trial, zentarine lowered the tremor score by 4 points more than placebo over 12 weeks.",
      numbers: [],
    });
    expect(problemsOf(continuous)).toMatchObject({ status: "checked", problems: [] });
  });
});

describe("the numbers block against the claim and the answer (owner answers 149a and 153b)", () => {
  const numbersProblems = (overrides: Record<string, unknown>, extra: Partial<FinalizeResearchInput> = {}) =>
    problemsOf(withFinding(0, overrides), extra).problems;

  it("refuses counts above their group's size", () => {
    expect(numbersProblems({ numbers: [{ ...TREMOR, option_events: 130 }, NAUSEA] })).toContain(
      "findings_card.findings[0].numbers[0] gives more events than people for zentarine 20 mg: option_events counts " +
      "the people in that group with the outcome, so it cannot exceed option_total.");
  });

  it("works the number needed to treat or harm out of the counts, rounded up, in the direction the counts support", () => {
    expect(numbersProblems({ numbers: [{ ...TREMOR, nnt: 9 }, NAUSEA] })).toEqual(expect.arrayContaining([
      "findings_card.findings[0].numbers[0] gives nnt 9, but by its counts 1 divided by the difference in rates is " +
        "10.0, which rounds up to 10: give the reciprocal rounded up, recomputed from the groups' counts the claim " +
        "uses, or correct the counts.",
    ]));
    expect(numbersProblems({ numbers: [TREMOR, { ...without(NAUSEA, "nnh"), nnt: 20 }] }).join(" "))
      .toContain("findings_card.findings[0].numbers[1] gives nnt, but by its counts a larger share of people had nausea " +
        "with zentarine 20 mg than with placebo, and fewer is better, so it is a number needed to harm: give it as nnh.");
    expect(numbersProblems({ numbers: [{ ...TREMOR, nnh: 10 }, NAUSEA] }).join(" "))
      .toContain("gives both nnt and nnh: give only nnt, the one its counts support.");
  });

  it("finds each group's figure, the number needed and the follow-up in the claim, in digits of any script", () => {
    // Arabic-Indic and Devanagari digits read as the same numbers.
    const arabic = "Zentarine 20 mg halved the tremor score in ٣٠ of ١٢٠ against ١٨ of ١٢٠ on placebo over 12 weeks, " +
      "a number needed to treat of ١٠; nausea affected ١٢ of ١٢٠ against ٦ of ١٢٠, a number needed to harm of २०.";
    expect(numbersProblems({ claim: arabic })).toEqual([]);
    // A claim in another language, with its labels in that language, against the answer's own figures in English.
    const french = "Dans un essai inventé de 240 adultes, le zentarine 20 mg a réduit de moitié le score de tremblement " +
      "chez 30 sur 120 contre 18 sur 120 sous placebo en 12 semaines, un nombre de sujets à traiter de 10 ; nausées " +
      "chez 12 sur 120 contre 6 sur 120, un nombre de sujets pour nuire de 20.";
    const inFrench = (entry: typeof TREMOR | typeof NAUSEA, outcome: string) =>
      ({ ...entry, outcome, option: "zentarine 20 mg", comparator: "placebo", follow_up: "12 semaines" });
    expect(numbersProblems({ claim: french, numbers: [inFrench(TREMOR, "score de tremblement réduit de moitié"),
      inFrench(NAUSEA, "nausées")] })).toEqual([]);
    // A rate rounded to a whole number shows a group's figure too.
    const rates = "Zentarine 20 mg halved the tremor score in 25% against 15% on placebo over 12 weeks, a number " +
      "needed to treat of 10; nausea affected 10% against 5%, a number needed to harm of 20.";
    expect(numbersProblems({ claim: rates })).toEqual([]);
    const unshown = numbersProblems({ claim: rates.replace("15%", "16%") });
    expect(unshown).toEqual(["findings_card.findings[0].numbers[0] gives a figure the claim does not show for placebo: " +
      "the claim contains neither its events and total (18 and 120) nor its rate (15%)."]);
    expect(numbersProblems({ claim: EFFECT.claim.replace("of 10;", "of ten;") })).toEqual([
      "findings_card.findings[0].numbers[0] gives a number needed to treat the claim does not show: the claim does not " +
        "contain 10."]);
    expect(numbersProblems({ claim: EFFECT.claim.replace("over 12 weeks", "over three months") })).toEqual(
      expect.arrayContaining(["findings_card.findings[0].numbers[0] gives a number needed to treat or harm without its " +
        "follow-up: the claim does not contain the declared follow-up."]));
  });

  it("puts beside a number needed to treat the harms over the same follow-up, or that none were found", () => {
    expect(numbersProblems({ numbers: [TREMOR] })).toEqual(["findings_card.findings[0].numbers[0] gives nnt without " +
      "the harms beside it: add an entry for each harm measured over the same follow-up (12 weeks), with better set to " +
      "fewer, or set harms_none_found when none were found, and say so in the claim."]);
    expect(numbersProblems({ numbers: [{ ...TREMOR, harms_none_found: true }] })).toEqual([]);
  });

  it("takes only figures the answer reported, as binary_results gives them", () => {
    expect(numbersProblems({}, { binary_results: [TREMOR_RESULT] })).toEqual([
      "findings_card.findings[0].numbers[1] gives a figure no binary_results entry of this call gives (12 of 120 " +
        "against 6 of 120, better fewer): each figure on the card is one the answer reports, so give it as " +
        "binary_results declares it, or leave it out."]);
    // The counts and which way is better must be the answer's, in the answer's order.
    const swapped = { ...NAUSEA, option: "placebo", comparator: "zentarine 20 mg", option_events: 6, comparator_events: 12,
      nnh: undefined, nnt: 20, harms_none_found: undefined };
    expect(numbersProblems({ numbers: [TREMOR, swapped] }).join(" "))
      .toContain("findings_card.findings[0].numbers[1] gives a figure no binary_results entry of this call gives");
  });
});

describe("a search that found nothing (owner decision 3b's bounded absence)", () => {
  const searchProblems = (overrides: Record<string, unknown>, extra: Partial<FinalizeResearchInput> = {}) =>
    problemsOf(withFinding(1, overrides), extra).problems;

  it("binds each search to a literature search receipt of the same call, case and spacing aside", () => {
    expect(searchProblems({ searches: [{ database: "pubmed", query: "  Zentarine   CHILDREN " }] })).toEqual([]);
    const unbound = (database: string, query: string) =>
      `findings_card.findings[1].searches[0] is not a search passed here: no literature_search receipt of this call ` +
      `has database ${database} and that query. Give the query exactly as it was searched, and pass its research_receipt.`;
    expect(searchProblems({ searches: [{ database: "europepmc", query: QUERY }] })).toEqual([unbound("europepmc", QUERY)]);
    expect(searchProblems({ searches: [{ database: "pubmed", query: "zentarine adolescents" }] }))
      .toEqual([unbound("pubmed", "zentarine adolescents")]);
    // A receipt from another server's secret is not this call's.
    const foreign = issueResearchReceipt("literature_search", { src: "ctgov", q: discoveryQueryDigest(["zentarine"]) },
      { secret: "another-secret-0123456789abcdefghijklmnop" });
    expect(searchProblems({ searches: [{ database: "ctgov", query: "zentarine" }] }, { receipts: [audit, search, foreign] }))
      .toEqual([unbound("ctgov", "zentarine")]);
  });

  it("states no direction, since a study that found no difference is another kind of finding", () => {
    expect(searchProblems({ direction: "no_effect" })).toEqual(["findings_card.findings[1] is of kind nothing_found " +
      "with direction no_effect: a search that found nothing states no effect either way, so its direction is " +
      "descriptive. A study that found no difference is an effect or harm finding with direction no_effect."]);
  });

  it("is a sentence the answer declares as not found", () => {
    const notDeclared = { absence_claims: [] };
    expect(searchProblems({}, notDeclared)).toEqual(["findings_card.findings[1] is of kind nothing_found, but its " +
      "answer_quote is not the quote of an absence_claims entry of state support_not_located: declare that sentence " +
      "there, as something the searches made here did not find, or give the finding the kind it has."]);
    // Declared as a null result instead, it is not a search that found nothing.
    expect(searchProblems({}, { absence_claims: [{ quote: ABSENT_SENTENCE, state: "direct_null_evidence", studies: [DOI] }] }))
      .toEqual([expect.stringContaining("is not the quote of an absence_claims entry of state support_not_located")]);
  });

  it("keeps searches to a search that found nothing", () => {
    expect(problemsOf(withFinding(0, { searches: [{ database: "pubmed", query: QUERY }] })).problems).toEqual([
      "findings_card.findings[0] gives searches, which go only with kind nothing_found: leave them out."]);
  });

  it("is the kind of a finding whose sentence the answer declares only as not found (review finding 3)", () => {
    // The finding of the absent sentence, declared as another kind.
    const declaredAs = (overrides: Record<string, unknown>, extra: Partial<FinalizeResearchInput> = {}) =>
      problemsOf({ ...CARD, findings: [EFFECT, { ...without(NOTHING_FOUND, "searches"), numbers: [], ...overrides }] },
        extra).problems;
    const reverse = "findings_card.findings[1]'s answer_quote is declared in absence_claims only as " +
      "support_not_located, as something the searches made here did not find, so the finding is a search that found " +
      "nothing: give it kind nothing_found, direction descriptive and its searches. A study that found no difference " +
      "is declared another way in absence_claims (direct_null_evidence, say), and is an effect or harm finding with " +
      "direction no_effect.";
    expect(declaredAs({ kind: "effect", direction: "no_effect" })).toEqual([reverse]);
    expect(declaredAs({ kind: "harm", direction: "harm" })).toEqual([reverse]);
    // Declared as a null result, the sentence is an effect with no difference.
    expect(declaredAs({ kind: "effect", direction: "no_effect" },
      { absence_claims: [{ quote: ABSENT_SENTENCE, state: "direct_null_evidence", studies: [DOI] }] })).toEqual([]);
  });
});

describe("the new texts' privacy and storage", () => {
  it("screens the subject, each figure's labels, each query and the topic's label, naming the field", () => {
    const screened = (card: unknown) => screenFindingsCard(findingsCardSchema.parse(card));
    expect(screened(CARD)).toEqual([]);
    expect(screened(withFinding(0, { subject: "Call 555-123-4567 for zentarine" })))
      .toEqual([{ field: "findings[0].subject", reasonCode: "direct_identifier" }]);
    expect(screened(withFinding(0, { numbers: [{ ...TREMOR, follow_up: "I was diagnosed with it in my youth" }, NAUSEA] })))
      .toEqual([{ field: "findings[0].numbers[0].follow_up", reasonCode: "personal_narrative" }]);
    expect(screened(withFinding(1, { searches: [{ database: "pubmed", query: "write to someone@example.org" }] })))
      .toEqual([{ field: "findings[1].searches[0].query", reasonCode: "direct_identifier" }]);
    expect(screened({ ...CARD, topic: { key: "velmor-syndrome", label: "See https://www.reddit.com/r/x/comments/y/" } }))
      .toEqual([{ field: "topic.label", reasonCode: "unsafe_url" }]);
    // At the final check a screened card is rejected with the rule it breaks.
    expect(problemsOf(withFinding(0, { subject: "Call 555-123-4567 for zentarine" })).problems).toEqual([
      expect.stringMatching(/^findings_card\.findings\[0\]\.subject looks like it holds contact details/u)]);
  });

  it("stores no YouTube link in any new text, and keeps a field the card leaves out out", () => {
    const link = "https://youtu.be/aaaaaaaaaaa";
    const linked = {
      ...withFinding(0, {
        subject: `Zentarine, as in ${link}`,
        numbers: [{ ...TREMOR, outcome: `tremor score halved (${link})` }, NAUSEA],
      }),
      topic: { key: "velmor-syndrome", label: `Velmor syndrome ${link}` },
    };
    const { card, omitted } = withoutYouTubeData(findingsCardSchema.parse(withFinding(1, {
      searches: [{ database: "pubmed", query: `zentarine ${link}` }],
    }, linked)));
    expect(omitted).toBe(true);
    expect(JSON.stringify(card)).not.toMatch(/youtu/u);
    expect(card.findings[0]!.subject).toBe("Zentarine, as in (YouTube video)");
    expect(card.findings[0]!.numbers![0]!.outcome).toBe("tremor score halved ((YouTube video))");
    expect(card.findings[1]!.searches![0]!.query).toBe("zentarine (YouTube video)");
    expect(card.topic!.label).toBe("Velmor syndrome (YouTube video)");
    const older = withoutYouTubeData(findingsCardSchema.parse({ ...without(CARD, "topic"),
      findings: [without(EFFECT, "kind", "subject", "subject_type", "direction", "numbers")] })).card;
    expect(Object.keys(older)).not.toContain("topic");
    expect(Object.keys(older.findings[0]!)).not.toContain("numbers");
  });

  it("saves the fields with the card, shows them in the owner's inbox, and reads old and new records back", async () => {
    const github = new FakeGitHub({ firstIssueNumber: 70 });
    const tokenProvider = { getToken: async () => "synthetic-findings-token" };
    const now = () => new Date("2026-11-02T10:00:00.000Z");
    const library = new FindingsSaveService({
      receiptSecret: () => SECRET,
      limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
      queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
      protocols: async () => [{ name: "HRP", version: "20.6.31", sha256: "a".repeat(64) }],
      version: "0.1.0",
      build: "0123abc",
      now,
    });
    const save = async (card: Record<string, unknown>, contributor: string) => library.save({
      findings_card: card,
      contributor,
      finalization_receipt: issueResearchReceipt("finalization", {
        status: "ready", depth: "deep", target: contributor.slice(0, 12),
        findings: findingsCardDigest(findingsCardSchema.parse(card)), bases: ["full_text_audit", "bounded_absence"],
      }, { secret: SECRET, now }),
    }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) });
    expect(await save(CARD, "1".repeat(64))).toMatchObject({ status: "saved", card_id: "ARF-0070" });
    const older = { ...without(CARD, "topic"), question: "Does zentarine help Velmor syndrome?",
      findings: [without(EFFECT, "kind", "subject", "subject_type", "direction", "numbers")] };
    expect(await save(older, "2".repeat(64))).toMatchObject({ status: "saved", card_id: "ARF-0071" });

    const body = github.issue(70).body;
    expect(body).toContain("## Topic, as the AI declared it\n\nVelmor syndrome \\(velmor\\-syndrome\\)");
    expect(body).toContain("- Kind: effect\n- Subject: Zentarine \\(supplement\\)\n- Direction: benefit\n- Numbers: " +
      "tremor score halved at 12 weeks: 30 of 120 with zentarine 20 mg \\(25%\\) against 18 of 120 with placebo " +
      "\\(15%\\), more is better, NNT 10; nausea at 12 weeks: 12 of 120 with zentarine 20 mg \\(10%\\) against 6 of " +
      "120 with placebo \\(5%\\), fewer is better, NNH 20");
    expect(body).toContain("- Searches that found nothing: pubmed: zentarine children");
    expect(github.issue(71).body).not.toMatch(/Kind:|Topic, as the AI|Numbers:/u);

    const inbox = new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY });
    const read = await inbox.readCard(70);
    expect(read.status).toBe("found");
    if (read.status !== "found") return;
    expect(read.card.record.card.topic).toEqual(CARD.topic);
    expect(read.card.record.card.findings[1]).toMatchObject({ kind: "nothing_found", direction: "descriptive",
      searches: [{ database: "pubmed", query: QUERY }] });
    expect(read.card.record.card.findings[0]!.numbers).toEqual([TREMOR, NAUSEA]);
    expect((await inbox.readCard(71)).status).toBe("found");
  });
});

describe("the community sentence (owner decision 4a), switched off", () => {
  it("is in no schema: a card, a save or a stored record that sends it does not read", async () => {
    const community = withFinding(0, { community_report: "Commenters reported less tremor after a few weeks." });
    expect(findingsCardSchema.safeParse(community).success).toBe(false);
    expect(saveResearchFindingsInputSchema.safeParse({
      findings_card: community, finalization_receipt: "rr1~finalization~x~1~y", user_consent: "yes_to_this_save",
    }).success).toBe(false);
    for (const field of ["community_report", "community_sentence", "community"]) {
      expect(findingsCardSchema.safeParse({ ...CARD, [field]: "Reports, not rates." }).success, field).toBe(false);
    }
    // A record in the inbox that holds one does not read as the library saved it.
    const github = new FakeGitHub({ firstIssueNumber: 80 });
    const tokenProvider = { getToken: async () => "synthetic-findings-token" };
    const now = () => new Date("2026-11-02T10:00:00.000Z");
    const library = new FindingsSaveService({
      receiptSecret: () => SECRET,
      limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
      queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
      protocols: async () => [{ name: "HRP", version: "20.6.31", sha256: "a".repeat(64) }],
      version: "0.1.0", build: "0123abc", now,
    });
    await library.save({
      findings_card: CARD, contributor: "3".repeat(64),
      finalization_receipt: issueResearchReceipt("finalization", {
        status: "ready", depth: "deep", target: "333333333333", findings: findingsCardDigest(findingsCardSchema.parse(CARD)),
      }, { secret: SECRET, now }),
    }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) });
    const issue = github.issue(80);
    issue.body = issue.body.replace('"kind": "effect",', '"kind": "effect",\n        "community_report": "Reports.",');
    expect(issue.body).toContain("community_report");
    const inbox = new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY });
    expect((await inbox.readCard(80)).status).toBe("unreadable");
  });
});

describe("the published schemas, as each app shows them", () => {
  type Node = { description?: string; type?: string; enum?: unknown[]; required?: string[];
    properties?: Record<string, Node>; items?: Node };
  it("keeps every new field optional and names each in the findings description ChatGPT's app shows", () => {
    // ChatGPT's surface publishes a finding's own fields as nothing at all, so the findings description carries them.
    const relaxed = (finalizeResearchPublishedInputSchema({ relaxed: true }) as Node).properties!.findings_card!;
    expect(relaxed.properties!.findings!.items).toEqual({});
    expect(Object.keys(relaxed.properties!.topic!.properties!)).toEqual(["key", "label"]);
    for (const field of ["kind", "subject", "subject_type", "direction", "numbers", "searches"]) {
      expect(relaxed.properties!.findings!.description).toContain(field);
    }
    for (const schema of [
      finalizeResearchPublishedInputSchema({ relaxed: false }),
      z.toJSONSchema(saveResearchFindingsInputSchema, { target: "draft-7", io: "input" }),
    ]) {
      const card = (schema as Node).properties!.findings_card!;
      expect(card.required ?? []).not.toContain("topic");
      // The topic is one object of two plain fields, which ChatGPT's app shows.
      expect(Object.keys(card.properties!.topic!.properties!)).toEqual(["key", "label"]);
      const findings = card.properties!.findings!;
      const finding = findings.items!;
      for (const field of ["kind", "subject", "subject_type", "direction", "numbers", "searches"]) {
        expect(Object.keys(finding.properties!)).toContain(field);
        expect(finding.required ?? []).not.toContain(field);
        expect(findings.description).toContain(field);
      }
      expect(finding.properties!.kind!.enum).toEqual(["effect", "harm", "overlooked_option", "correction",
        "nothing_found", "tested_vs_sold"]);
      expect(finding.properties!.subject_type!.enum).toEqual(["condition", "symptom", "test", "treatment",
        "supplement", "product", "food", "practice"]);
      expect(finding.properties!.direction!.enum).toEqual(["benefit", "harm", "no_effect", "mixed", "descriptive"]);
      for (const value of ["overlooked_option", "tested_vs_sold", "symptom", "practice", "no_effect", "descriptive",
        "pubmed", "europepmc", "ctgov"]) {
        expect(findings.description, value).toContain(value);
      }
    }
  });
});

describe("cardFieldProblems, the checks alone", () => {
  const context = (overrides: Partial<CardFieldsContext> = {}): CardFieldsContext => ({
    required: true,
    answerFigures: [TREMOR_RESULT, NAUSEA_RESULT],
    searched: (database, query) => database === "pubmed" && discoveryQueryDigest([query]) === discoveryQueryDigest([QUERY]),
    absenceStates: (quote) => quote === ABSENT_SENTENCE ? ["support_not_located"] : [],
    ...overrides,
  });
  const parsed = findingsCardSchema.parse(CARD);

  it("passes the worked example, and requires nothing of a card that is not public", () => {
    expect(cardFieldProblems(parsed, context())).toEqual([]);
    const bare = findingsCardSchema.parse({ ...without(CARD, "topic"),
      findings: [without(EFFECT, "kind", "subject", "subject_type", "direction", "numbers")] });
    expect(cardFieldProblems(bare, context({ required: false }))).toEqual([]);
    expect(cardFieldProblems(bare, context())).toHaveLength(2);
  });

  it("asks for numbers of an effect, a harm and an overlooked option, and of no other kind", () => {
    for (const kind of ["effect", "harm", "overlooked_option"]) {
      expect(cardFieldProblems(findingsCardSchema.parse(withFinding(0, { kind, numbers: undefined })), context()),
        kind).toEqual([`findings_card.findings[0] is of kind ${kind} without numbers: give each two-group yes-or-no ` +
          "figure its claim gives, as binary_results gives it without its quotes, or an empty list if it gives none."]);
    }
    for (const kind of ["correction", "tested_vs_sold"]) {
      const card = findingsCardSchema.parse(withFinding(0, { kind, numbers: undefined, direction: "descriptive" }));
      expect(cardFieldProblems(card, context()), kind).toEqual([]);
    }
  });

  it("asks for nothing_found only when every absence claim of the sentence is support_not_located (review finding 3)", () => {
    const effectOfAbsence = findingsCardSchema.parse({ ...CARD, findings: [EFFECT,
      { ...without(NOTHING_FOUND, "searches"), kind: "effect", direction: "no_effect", numbers: [] }] });
    const reverse = expect.stringContaining("is declared in absence_claims only as support_not_located");
    expect(cardFieldProblems(effectOfAbsence, context())).toEqual([reverse]);
    // Also declared in another state, the sentence is not only "not found", and its finding may be another kind.
    expect(cardFieldProblems(effectOfAbsence, context({
      absenceStates: (quote) => quote === ABSENT_SENTENCE ? ["support_not_located", "direct_null_evidence"] : [],
    }))).toEqual([]);
    // A finding that declares no kind, on a card that is not public, is not asked for one.
    const undeclared = findingsCardSchema.parse({ ...CARD, findings: [EFFECT,
      without(NOTHING_FOUND, "searches", "kind", "direction", "subject", "subject_type")] });
    expect(cardFieldProblems(undeclared, context({ required: false }))).toEqual([]);
  });
});
