// Owner answer 195: these checks advise the model; only the five named integrity checks block.
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { describe, expect, it } from "vitest";
import {
  FINALIZE_REMINDER, finalizeResearch as finalizeResearchUnwrapped, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { communitySkipCaveat, withCommunitySkip } from "./helpers/community-skip.js";
import { withHarmScreen } from "./helpers/harm-screen.js";
import { withSourceReading } from "./helpers/source-reading.js";

// The owner, 5 Nov 2026: an answer says beside each key study it cites how it was read, its words copied in
// source_reading. These fixtures isolate other checks, so each call gets the shared helper's reading words.
const finalizeResearch = (...args: Parameters<typeof finalizeResearchUnwrapped>) =>
  finalizeResearchUnwrapped(withSourceReading(args[0], { check: args[1] }), args[1]);

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
  treatment_choice: "not_compared", community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
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
  advisoryNotes(check(overrides)).filter((step) => step !== TOOL_LIST_REFRESH_HINT);
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
        "This warning rests on measurements, not on harm observed in people, so how often it would cause harm wasn't " +
          "measured. What was measured: alginate extracted in a laboratory. What people would use: wild seaweed eaten " +
          "as food."],
      [{ basis: "not_quantified", measured_exposure: undefined, studies: undefined },
        "How often this harm happens wasn't quantified in the sources found here for this exposure: the extract at " +
          "300 mg a day for 12 weeks."],
      [{ direction: "safety", basis: "hazard_measurement", exposure: "the thiolated gum", measured_exposure: "one acute high-dose rat test" },
        "This rests on a measurement or an animal test, not on observed safety in people, so long-term or rare harms " +
          "are unmeasured. What it rests on: one acute high-dose rat test. What people would use: the thiolated gum."],
      [{ direction: "safety", basis: "case_reports", exposure: "the gum" },
        "Case reports can show that a harm happens, but not that this exposure is safe: the gum."],
      [{ direction: "safety", basis: "not_quantified", exposure: "the gum", measured_exposure: undefined, studies: undefined },
        "How often harms occur wasn't quantified in the sources found here for this exposure: the gum."]
    ];
    for (const [overrides, caveat] of cases) {
      const quote = "The sentence the model declared.";
      const result = check({ answer_draft: `${LINKS}\n\n${quote} ${caveat}`, safety_claims: [claim({ quote, ...overrides })] });
      expect(result.limits).toEqual([SKIP, caveat, "The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked."]);
      expect(result.caveats).toEqual([SKIP]);
      expect(result.status).toBe("ready_with_limits");
      const missing = check({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ quote, ...overrides })] });
      expect(missing.status).toBe("ready_with_limits");
      expect(missing.limits).toContain(caveat);
      expect(missing.next_steps).toEqual([]);
    }
  });

  it("needs what the evidence measured and key sources for every basis except not_quantified", () => {
    const quote = "Nausea occurred in 18% on the extract and 4% on placebo.";
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ measured_exposure: undefined })] })).toEqual([
      "safety_claims[0] has basis comparative_rates without measured_exposure: give measured_exposure first, what the " +
        "cited evidence measured. Declare basis not_quantified instead only when no source here gives a rate for this harm."
    ]);
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ studies: [] })] })).toEqual([
      "safety_claims[0] has basis comparative_rates without studies: give in studies the key sources it rests on. " +
        "Declare basis not_quantified instead only when no source here gives a rate for this harm."
    ]);
    // Looked up here, it is asked into key_sources; not looked up, it is asked for its lookup first, since the sources
    // check would refuse it in key_sources (n389-forum-depth on #394's build: a label and a PMC page, refused there).
    const resolved = sign("doi_resolution", { doi: "10.1000/unlisted", url: "https://journal.example/unlisted" });
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ studies: ["10.1000/unlisted"] })],
      receipts: [...base().receipts, resolved] })).toEqual([
      "safety_claims[0] rests on 10.1000/unlisted, which key_sources does not list: add each to key_sources with its " +
        "read depth and link, so its reading is checked like any key study."
    ]);
    const label = "https://labels.example/drug?setid=synthetic";
    expect(steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ studies: ["10.1000/unlisted", label] })] })).toEqual([
      `safety_claims[0] rests on 10.1000/unlisted, ${label}, which no receipt passed here shows was found or looked up, ` +
        "so key_sources cannot list it yet: look each up with AskRigor first (resolve_doi for a DOI, fetch_pubmed_record " +
        "for a PMID, acquire_open_full_text for a PMCID, read_forum_thread for a forum thread), pass its research_receipt, " +
        "then add it to key_sources with its read depth and link. A source no AskRigor tool can look up, such as a page " +
        "only your own search found, is not a key source: say in the answer that AskRigor did not look it up."
    ]);
  });

  // The owner regressions on #412's build (judged 6 Nov 2026): r325 declared two warnings hazard_measurement without
  // measured_exposure; the note offered not_quantified "when no source here gives a rate", which a measurement never
  // gives, so the run took it and lost the measurement's caveat. The note asks for what was measured first, and says
  // not_quantified fits only where no source measured or reported the harm at all.
  it("asks a basis that gives no rate for what was measured, and keeps not_quantified for no source at all", () => {
    const quote = "Hijiki can carry enough inorganic arsenic to avoid it.";
    const measured = (overrides: Partial<SafetyClaim>) =>
      steps({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ quote, ...overrides })] });
    expect(measured({ basis: "hazard_measurement", measured_exposure: undefined })).toEqual([
      "safety_claims[0] has basis hazard_measurement without measured_exposure: give measured_exposure first, what the " +
        "laboratory, animal or composition measurement measured: the substance, its form and amount, and the test. A " +
        "laboratory, animal or composition measurement gives no rate and needs none: declare basis not_quantified only " +
        "when no source here measured or reported this at all."
    ]);
    expect(measured({ basis: "hazard_measurement", measured_exposure: undefined, studies: undefined })).toEqual([
      "safety_claims[0] has basis hazard_measurement without measured_exposure or studies: give measured_exposure " +
        "first, what the laboratory, animal or composition measurement measured: the substance, its form and amount, " +
        "and the test, and in studies the key sources it rests on. A laboratory, animal or composition measurement " +
        "gives no rate and needs none: declare basis not_quantified only when no source here measured or reported this " +
        "at all."
    ]);
    expect(measured({ basis: "case_reports", measured_exposure: undefined })).toEqual([
      "safety_claims[0] has basis case_reports without measured_exposure: give measured_exposure first, what the cited " +
        "evidence measured. A case report gives no rate and needs none: declare basis not_quantified only when no " +
        "source here measured or reported this at all."
    ]);
    // Given what was measured, the measurement's caveat follows, and nothing is asked.
    const filled = check({ answer_draft: `${LINKS}\n\n${quote}`, safety_claims: [claim({ quote, basis: "hazard_measurement",
      exposure: "hijiki eaten as food", measured_exposure: "inorganic arsenic measured in dried hijiki" })] });
    expect(advisoryNotes(filled).filter((step) => step.includes("has basis"))).toEqual([]);
    expect(filled.limits).toContainEqual(expect.stringMatching(/^This warning rests on measurements, not on harm observed in people/u));
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
  const CAVEAT = "This finding comes from injection into the abdomen in animals; use by mouth in people was not " +
    "tested for it. Source: Rat study.";
  it("asks for the route caveat when the use and the evidence used different routes", () => {
    const mechanism = {
      quote: QUOTE, use_route: "oral" as const, evidence_route: "intraperitoneal" as const, evidence_in: "animals" as const,
      studies: [RAT]
    };
    const missing = check({ answer_draft: `${LINKS}\n\n${QUOTE}`, mechanism_claims: [mechanism] });
    expect(missing.status).toBe("ready_with_limits");
    expect(missing.limits).toEqual([SKIP, CAVEAT]);
    expect(missing.caveats).toEqual([SKIP]);
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
    })).toEqual(["mechanism_claims[0] rests on 10.1000/unlisted, which no receipt passed here shows was found or " +
      "looked up, so key_sources cannot list it yet: look each up with AskRigor first (resolve_doi for a DOI, " +
      "fetch_pubmed_record for a PMID, acquire_open_full_text for a PMCID, read_forum_thread for a forum thread), pass " +
      "its research_receipt, then add it to key_sources with its read depth and link. A source no AskRigor tool can " +
      "look up, such as a page only your own search found, is not a key source: say in the answer that AskRigor did " +
      "not look it up."]);
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
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result).some((step) => step.startsWith(`${field} is missing:`))).toBe(true);
    expect(advisoryNotes(result)).toContain(TOOL_LIST_REFRESH_HINT);
  });

  // The 30 Oct rerun's r377-continue built its safety_claims from this note alone and was refused by the connector
  // for the one required field the note did not name ("safety_claims[0].direction [required]").
  it("names each required choice, so items built from the note pass the connector's schema", () => {
    const input = base();
    delete input.safety_claims;
    delete input.mechanism_claims;
    const notes = advisoryNotes(assertNextStepsContract(finalizeResearch(input, { secret: SECRET })));
    const note = (field: string) => notes.find((step) => step.startsWith(`${field} is missing:`)) ?? "";
    expect(note("safety_claims")).toContain("(direction harm)");
    expect(note("safety_claims")).toContain("(direction safety)");
    expect(note("mechanism_claims")).toContain("in people or animals");
  });

  // 11 Nov 2026: the reminder also says how a research turn ends, and to stop while an ask waits for the person.
  it("states the research-result reminder: the final check, and how a research turn ends", () => {
    expect(FINALIZE_REMINDER).toBe("Answers that use this research are checked with finalize_research before they " +
      "are given, in this turn or a later one; HRP's OutputFormatting section sets a health answer's shape. A research " +
      "turn ends with the answer that check says to give, or with a question an AskRigor result said to ask and wait " +
      "on, never with a progress report: if such a question is still unanswered, stop researching, send it and end " +
      "your turn.");
  });
});
