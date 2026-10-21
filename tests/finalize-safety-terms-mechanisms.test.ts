import { describe, expect, it } from "vitest";
import {
  FINALIZE_REMINDER, finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { communitySkipCaveat, withCommunitySkip } from "./helpers/community-skip.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { withHarmScreen } from "./helpers/harm-screen.js";

// Owner questions 86, 88 and 89 (issues #324, #325, #328, #330 and #331): harm and safety sentences, the terms a
// conclusion depends on, and mechanism claims, declared by the model and checked exactly by the final check.
const SECRET = "safety-terms-mechanisms-test-secret-012345678901";
const DOI = "10.1000/bacopa";
const RAT = "10.1002/ddr.21250";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates declaration checks." };
const LINKS = `[Trial](https://doi.org/${DOI}) and [Rat study](https://doi.org/${RAT}) were read.`;
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [
    sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" }),
    sign("study_audit", { id: RAT, status: "complete_no_unresolved_fields" })
  ],
  research_target: "Synthetic harm, term and mechanism declarations", research_depth: "deep",
  treatment_choice: "not_compared", community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Synthetic fixture isolates structural checks.",
  commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates declaration checks." },
  key_sources: [
    { id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" },
    { id: RAT, status: "validated", read_depth: "full_text_audited", answer_marker: "Rat study" }
  ],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: LINKS, ...overrides
});
// The answer carries the sentence its no_real_world_outcome declaration requires (owner question 125); it is the
// first caveat, and its limit the only one when nothing else needs stating. An answer with safety statements also
// screens its serious harms (owner answer "128b"), here one found on the label, which adds no caveat.
const SKIP = communitySkipCaveat("Synthetic fixture isolates structural checks.");
const check = (overrides: Partial<FinalizeResearchInput> = {}) =>
  assertNextStepsContract(finalizeResearch(withHarmScreen(withCommunitySkip(base(overrides))), { secret: SECRET }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}) =>
  check(overrides).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
type SafetyClaim = NonNullable<FinalizeResearchInput["safety_claims"]>[number];
const claim = (overrides: Partial<SafetyClaim>): SafetyClaim => ({
  quote: "Nausea occurred in 18% on the extract and 4% on placebo.", direction: "harm",
  exposure: "the extract at 300 mg a day for 12 weeks", basis: "comparative_rates",
  measured_exposure: "the extract at 300 mg a day for 12 weeks", studies: [DOI], ...overrides
});

describe("finalize_research safety_claims (owner questions 86 and 89)", () => {
  it("accepts a harm warning that gives its rates against a comparator, in any language", () => {
    for (const quote of [
      "Nausea occurred in 18% on the extract and 4% on placebo.",
      "La nausée est survenue chez 18 % sous extrait et 4 % sous placebo.",
      "恶心发生率为提取物组18%，安慰剂组4%。"
    ]) {
      const result = check({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ quote })] });
      expect(result.status).toBe("ready_with_limits");
      expect(result.caveats).toEqual([SKIP]);
    }
  });

  it("refuses a bare 'can cause' warning declared as comparative or observed rates", () => {
    const quote = "Bacopa can cause nausea and cramps.";
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ quote })] })).toEqual([
      "safety_claims[0] rests on rates against a comparator, but its sentence gives fewer than two numbers: give the " +
        "rate in each group in that sentence."
    ]);
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ quote, basis: "observed_rates" })] }))
      .toEqual(["safety_claims[0] rests on an observed rate, but its sentence gives no number: give the rate in that sentence."]);
  });

  it("writes the caveat each basis needs, for warnings and for safety claims", () => {
    const cases: Array<[Partial<SafetyClaim>, string]> = [
      [{ basis: "case_reports" }, "Case reports show that this harm can happen, not how often it happens."],
      [{ basis: "hazard_measurement", exposure: "wild seaweed eaten as food", measured_exposure: "alginate extracted in a laboratory." },
        "This warning rests on measurements of alginate extracted in a laboratory, not on harm observed in people using " +
          "wild seaweed eaten as food, so how often it would cause harm wasn't measured."],
      [{ basis: "not_quantified", measured_exposure: undefined, studies: undefined },
        "How often this happens wasn't quantified in the sources found here."],
      [{ direction: "safety", basis: "hazard_measurement", exposure: "the thiolated gum", measured_exposure: "one acute high-dose rat test" },
        "This rests on one acute high-dose rat test, not on observed safety in people using the thiolated gum, so " +
          "long-term or rare harms are unmeasured."],
      [{ direction: "safety", basis: "case_reports", exposure: "the gum" },
        "Case reports can show that a harm happens, but not that the gum is safe."],
      [{ direction: "safety", basis: "not_quantified", exposure: "the gum", measured_exposure: undefined, studies: undefined },
        "How often harms occur with the gum wasn't quantified in the sources found here."]
    ];
    for (const [overrides, caveat] of cases) {
      const quote = "The sentence the model declared.";
      const result = check({ answer_draft: `${LINKS}\n\n${quote} ${caveat}`, safety_claims: [claim({ quote, ...overrides })] });
      expect(result.caveats).toEqual([SKIP, caveat]);
      expect(result.status).toBe("ready_with_limits");
      const missing = check({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ quote, ...overrides })] });
      expect(missing.status).toBe("not_ready");
      expect(missing.next_steps.join(" ")).toContain(`"${caveat}"`);
    }
  });

  it("needs what the evidence measured and key sources for every basis except not_quantified", () => {
    const quote = "Nausea occurred in 18% on the extract and 4% on placebo.";
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ measured_exposure: undefined })] })).toEqual([
      "safety_claims[0] has basis comparative_rates without measured_exposure: give what the cited evidence measured " +
        "and the key sources it rests on, or declare basis not_quantified."
    ]);
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ studies: ["10.1000/unlisted"] })] })).toEqual([
      "safety_claims[0] rests on 10.1000/unlisted, which key_sources does not list: add each to key_sources with its " +
        "read depth and link, so its reading is checked like any key study."
    ]);
  });

  it("checks that the declared sentence is in the answer", () => {
    expect(steps({ safety_claims: [claim({})] })).toEqual([
      "safety_claims[0] gives text the answer does not show: copy each sentence exactly from answer_draft."
    ]);
  });
});

describe("finalize_research key_terms (owner question 86, issue #328)", () => {
  const EXPLANATION = "Organic arsenic, the form in most seaweeds, is far less toxic than inorganic arsenic, the form " +
    "hijiki carries, which is the one linked to cancer.";
  it("accepts a term explained where the answer first uses it", () => {
    const result = check({
      answer_draft: `${LINKS}\n\n${EXPLANATION} Later, organic arsenic comes up again.`,
      key_terms: [{ term: "organic arsenic", explanation: EXPLANATION }, { term: "inorganic arsenic", explanation: EXPLANATION }]
    });
    expect(result.status).toBe("ready_with_limits");
  });

  it("refuses a term used before its explanation, a missing explanation, or one without the term", () => {
    expect(steps({
      answer_draft: `${LINKS}\n\nMost seaweeds carry organic arsenic.\n\n${EXPLANATION}`,
      key_terms: [{ term: "organic arsenic", explanation: EXPLANATION }]
    })).toEqual(["The answer uses \"organic arsenic\" before key_terms[0]'s explanation: explain it in plain words " +
      "where the answer first uses it."]);
    expect(steps({ key_terms: [{ term: "organic arsenic", explanation: EXPLANATION }] })).toEqual([
      "key_terms[0] gives an explanation the answer does not show: copy the sentence exactly from answer_draft."
    ]);
    expect(steps({
      answer_draft: `${LINKS}\n\n${EXPLANATION}`,
      key_terms: [{ term: "speciation", explanation: EXPLANATION }]
    })).toEqual(["key_terms[0]'s explanation does not contain its term \"speciation\": give the sentence that explains " +
      "it where the answer uses it."]);
  });

  it("counts whole words in cased scripts and exact matches elsewhere", () => {
    const alt = "ALT, a liver enzyme measured in the blood, rises when liver cells are damaged.";
    expect(check({
      answer_draft: `${LINKS}\n\nAlthough the trial was small, it measured liver tests. ${alt}`,
      key_terms: [{ term: "ALT", explanation: alt }]
    }).status).toBe("ready_with_limits");
    const japanese = "無機ヒ素とは、ひじきに多く含まれ、がんとの関連が知られている毒性の強い形のヒ素です。";
    expect(check({
      answer_draft: `${LINKS}\n\n${japanese}`,
      key_terms: [{ term: "無機ヒ素", explanation: japanese }]
    }).status).toBe("ready_with_limits");
    expect(steps({
      answer_draft: `${LINKS}\n\nひじきの無機ヒ素が問題です。\n\n${japanese}`,
      key_terms: [{ term: "無機ヒ素", explanation: japanese }]
    })).toEqual(["The answer uses \"無機ヒ素\" before key_terms[0]'s explanation: explain it in plain words where the " +
      "answer first uses it."]);
  });

  it("matches a term in any case, as at the start of a sentence", () => {
    const explanation = "Inorganic arsenic, the form hijiki carries, is the one linked to cancer.";
    expect(check({
      answer_draft: `${LINKS}\n\n${explanation} Later, inorganic arsenic comes up again.`,
      key_terms: [{ term: "inorganic arsenic", explanation }]
    }).status).toBe("ready_with_limits");
  });

  it("keeps the case of a term written in capitals, so the words its letters spell are not uses of it", () => {
    const explanation = "An odds ratio (OR) compares the odds of an outcome in two groups; 1 means no difference.";
    expect(check({
      answer_draft: `${LINKS}\n\nDiet or exercise may matter. ${explanation}`,
      key_terms: [{ term: "OR", explanation }]
    }).status).toBe("ready_with_limits");
    expect(steps({
      answer_draft: `${LINKS}\n\nThe OR was 2.1.\n\n${explanation}`,
      key_terms: [{ term: "OR", explanation }]
    })).toEqual(["The answer uses \"OR\" before key_terms[0]'s explanation: explain it in plain words where the " +
      "answer first uses it."]);
  });
});

describe("finalize_research mechanism_claims (owner question 88, issue #330)", () => {
  const QUOTE = "The gum did not suppress acid secretion.";
  const CAVEAT = "This finding comes from injection into the abdomen in animals in Rat study; use by mouth in people " +
    "was not tested for it.";
  it("asks for the route caveat when the use and the evidence used different routes", () => {
    const mechanism = {
      quote: QUOTE, use_route: "oral" as const, evidence_route: "intraperitoneal" as const, evidence_in: "animals" as const,
      studies: [RAT]
    };
    const missing = check({ answer_draft: `${LINKS}\n\n${QUOTE}`, mechanism_claims: [mechanism] });
    expect(missing.status).toBe("not_ready");
    expect(missing.caveats).toEqual([SKIP, CAVEAT]);
    const stated = check({ answer_draft: `${LINKS}\n\n${QUOTE} ${CAVEAT}`, mechanism_claims: [mechanism] });
    expect(stated.status).toBe("ready_with_limits");
  });

  it("needs no caveat when the routes match, and binds the studies to key sources", () => {
    expect(check({
      answer_draft: `${LINKS}\n\n${QUOTE}`,
      mechanism_claims: [{ quote: QUOTE, use_route: "oral", evidence_route: "oral", evidence_in: "people", studies: [RAT] }]
    }).status).toBe("ready_with_limits");
    expect(steps({
      answer_draft: `${LINKS}\n\n${QUOTE}`,
      mechanism_claims: [{
        quote: QUOTE, use_route: "oral", evidence_route: "oral", evidence_in: "people", studies: ["10.1000/unlisted"]
      }]
    })).toEqual(["mechanism_claims[0] rests on 10.1000/unlisted, which key_sources does not list: add each to " +
      "key_sources with its read depth and link, so its reading is checked like any key study."]);
    expect(finalizeResearchInputSchema.safeParse({
      ...base(), mechanism_claims: [{
        quote: QUOTE, use_route: "by mouth", evidence_route: "oral", evidence_in: "people", studies: [RAT]
      }]
    }).success).toBe(false);
  });
});

describe("the three declarations are required with an answer draft", () => {
  it.each(["safety_claims", "key_terms", "mechanism_claims"] as const)("asks for %s and the refresh hint", (field) => {
    const input = base();
    delete input[field];
    const result = assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.some((step) => step.startsWith(`${field} is missing:`))).toBe(true);
    expect(result.next_steps).toContain(TOOL_LIST_REFRESH_HINT);
  });

  it("states the research-result reminder as one sentence", () => {
    expect(FINALIZE_REMINDER).toBe("Answers that use this research are checked with finalize_research before they " +
      "are given, in this turn or a later one.");
  });
});
