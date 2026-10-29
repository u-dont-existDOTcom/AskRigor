// Owner answer 195: these checks advise the model; only the five named integrity checks block.
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { describe, expect, it } from "vitest";
import {
  CORRECTION_REPORT_OFFER, finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { communitySkipCaveat, withCommunitySkip } from "./helpers/community-skip.js";
import { withHarmScreen } from "./helpers/harm-screen.js";

// Owner question 90 (lesson #23): what the answer puts forward for this person, with its safety check and, for long
// use, its follow-up and stopping. Owner question 92 (lessons #25, #27, #28, #29): a share of selected reports, how
// forum threads were chosen, whom and where a mechanism was tested, and corrections carried through the answer.
const SECRET = "recommendations-and-lessons-test-secret-0123456789";
const DOI = "10.1000/trial";
const RAT = "10.1002/rat";
const sign = (claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt("study_audit", claims, { secret: SECRET });
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates declaration checks." };
const LINKS = `[Trial](https://doi.org/${DOI}) and [Rat study](https://doi.org/${RAT}) were read.`;
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [
    sign({ id: DOI, status: "complete_no_unresolved_fields" }),
    sign({ id: RAT, status: "complete_no_unresolved_fields" })
  ],
  research_target: "Synthetic recommendation and lesson declarations", research_depth: "deep",
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
// The answer carries the sentence its no_real_world_outcome declaration requires (owner question 125); it follows the
// correction caveats and precedes the others, and its limit is the only one when nothing else needs stating. An
// answer with safety statements also screens its serious harms (owner answer "128b"), which adds no caveat here.
const SKIP = communitySkipCaveat("Synthetic fixture isolates structural checks.");
const check = (overrides: Partial<FinalizeResearchInput> = {}) =>
  assertNextStepsContract(finalizeResearch(withHarmScreen(withCommunitySkip(base(overrides))), { secret: SECRET }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}) =>
  advisoryNotes(check(overrides)).filter((step) => step !== TOOL_LIST_REFRESH_HINT);
type Recommendation = NonNullable<FinalizeResearchInput["recommendations"]>[number];

describe("finalize_research recommendations (owner question 90, lesson #23)", () => {
  const QUOTE = "A short course of the medicine could be discussed with your doctor.";
  const recommend = (overrides: Partial<Recommendation> = {}): Recommendation => ({
    quote: QUOTE, intervention: "the medicine", safety_check: "resolved", long_term_use: false, ...overrides
  });
  const draft = (...sentences: string[]) => `${LINKS}\n\n${[QUOTE, ...sentences].join(" ")}`;

  it("accepts a resolved short-term recommendation, and asks for one the answer does not show", () => {
    expect(check({ answer_draft: draft(), recommendations: [recommend()] }).status).toBe("ready_with_limits");
    expect(steps({ recommendations: [recommend()] })).toEqual([
      "recommendations[0] gives text the answer does not show: copy each sentence exactly from answer_draft."
    ]);
  });

  it("has an unresolved or conditional safety check say so, and asks what is still open", () => {
    const unresolved = "An option that needs a clinician's review before it could be recommended for you: the " +
      "medicine. What the review covers: a past severe reaction to a nerve-acting medicine.";
    const open = recommend({ safety_check: "unresolved", open_inputs: "a past severe reaction to a nerve-acting medicine" });
    expect(check({ answer_draft: draft(), recommendations: [open] }).caveats).toEqual([SKIP, unresolved]);
    expect(check({ answer_draft: draft(unresolved), recommendations: [open] }).status).toBe("ready_with_limits");
    const conditional = "An option that depends on something a clinician should confirm first: the medicine. What to " +
      "confirm: normal kidney function.";
    expect(check({
      answer_draft: draft(), recommendations: [recommend({ safety_check: "conditional", open_inputs: "normal kidney function." })]
    }).caveats).toEqual([SKIP, conditional]);
    expect(steps({ answer_draft: draft(), recommendations: [recommend({ safety_check: "unresolved" })] })).toEqual([
      "recommendations[0] is unresolved without open_inputs: name the conflicts or safety inputs still open, in a few words."
    ]);
  });

  it("holds a long-term medicine to follow-up matching its use and to covering stopping", () => {
    const longTerm = (overrides: Partial<Recommendation>) => recommend({
      long_term_use: true, longest_follow_up: "12 weeks", follow_up_matches_use: true, stopping_covered: true, ...overrides
    });
    expect(check({ answer_draft: draft(), recommendations: [longTerm({})] }).status).toBe("ready_with_limits");
    const shorter = "An option for long-term use whose evidence followed people for less time: the medicine. Longest " +
      "follow-up in that evidence: 12 weeks. Its benefits and harms over years of use, and how easily people stop it, " +
      "aren't established.";
    expect(check({ answer_draft: draft(), recommendations: [longTerm({ follow_up_matches_use: false })] }).caveats)
      .toEqual([SKIP, shorter]);
    expect(check({ answer_draft: draft(shorter), recommendations: [longTerm({ follow_up_matches_use: false })] }).status)
      .toBe("ready_with_limits");
    expect(steps({ answer_draft: draft(), recommendations: [longTerm({ stopping_covered: false })] })).toEqual([
      "recommendations[0] puts the medicine forward for long-term use without covering stopping: say what is known " +
        "about stopping, withdrawal and lasting harms, or that they are unknown, and mark stopping_covered."
    ]);
    expect(steps({ answer_draft: draft(), recommendations: [recommend({ long_term_use: true })] })).toEqual([
      "recommendations[0] is for long-term use without longest_follow_up, follow_up_matches_use, stopping_covered: " +
        "give the longest follow-up in its evidence, whether it matches how long it would be taken, and whether the " +
        "answer covers stopping."
    ]);
  });

  it("is required with an answer draft, with the tool-list refresh hint", () => {
    const input = base();
    delete input.recommendations;
    const result = assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result).some((step) => step.startsWith("recommendations is missing:"))).toBe(true);
    expect(advisoryNotes(result)).toContain(TOOL_LIST_REFRESH_HINT);
  });
});

describe("finalize_research safety_claims: a share of selected reports (owner question 92, lesson #25)", () => {
  const QUOTE = "Cold was mentioned in 12% of the selected passages about compound A.";
  const claim = { quote: QUOTE, direction: "harm" as const, exposure: "compound A", basis: "share_of_reports" as const,
    measured_exposure: "compound A, as users described it" };
  const CAVEAT = "That figure is a share of selected reports, not of people, so how often this happens isn't known.";

  it("has the answer say that the share is not of people, without a study behind it", () => {
    expect(check({ answer_draft: `${LINKS}\n\n${QUOTE}`, safety_claims: [claim] }).caveats).toEqual([SKIP, CAVEAT]);
    expect(check({ answer_draft: `${LINKS}\n\n${QUOTE} ${CAVEAT}`, safety_claims: [claim] }).status)
      .toBe("ready_with_limits");
    expect(check({
      answer_draft: `${LINKS}\n\n${QUOTE}`, safety_claims: [{ ...claim, direction: "safety" }]
    }).caveats).toEqual([
      SKIP, "That figure is a share of selected reports, not of people, so it doesn't show how safe this exposure is: " +
        "compound A."
    ]);
  });

  it("needs the share in its sentence", () => {
    const vague = "Cold was often mentioned.";
    expect(steps({
      answer_draft: `${LINKS}\n\n${vague} ${CAVEAT}`, safety_claims: [{ ...claim, quote: vague }]
    })).toEqual([
      "safety_claims[0] rests on a share of selected reports, but its sentence gives no number: give the share in " +
        "that sentence."
    ]);
  });
});

describe("finalize_research mechanism_claims: species and tissue (owner question 92, lesson #28)", () => {
  const QUOTE = "Compound X widens blood vessels.";
  const mechanism = {
    quote: QUOTE, use_route: "oral" as const, evidence_route: "oral" as const, evidence_in: "animals" as const,
    studies: [RAT]
  };

  it("has an animal finding say it was not tested in people", () => {
    const caveat = "This finding comes from animal experiments; it was not tested in people. Source: Rat study.";
    expect(check({ answer_draft: `${LINKS}\n\n${QUOTE}`, mechanism_claims: [mechanism] }).caveats).toEqual([SKIP, caveat]);
    expect(check({ answer_draft: `${LINKS}\n\n${QUOTE} ${caveat}`, mechanism_claims: [mechanism] }).status)
      .toBe("ready_with_limits");
  });

  it("leaves a dish test to the route caveat, and has a finding from another tissue say where it was measured", () => {
    expect(check({
      answer_draft: `${LINKS}\n\n${QUOTE}`, mechanism_claims: [{ ...mechanism, evidence_route: "in_vitro" }]
    }).caveats).toEqual([
      SKIP, "This finding comes from test-tube experiments; use by mouth was not tested for it. Source: Rat study."
    ]);
    const tissue = "This finding was measured in a different tissue from the one this answer applies it to. Measured " +
      "in: the brain's cortex. Applied here to: the skin. Source: Rat study.";
    expect(check({
      answer_draft: `${LINKS}\n\n${QUOTE}`,
      mechanism_claims: [{ ...mechanism, evidence_in: "people", tissue: { measured: "the brain's cortex", claimed: "the skin." } }]
    }).caveats).toEqual([SKIP, tissue]);
  });

  it("needs whom the evidence came from", () => {
    const { evidence_in: _whom, ...unstated } = mechanism;
    expect(finalizeResearchInputSchema.safeParse({ ...base(), mechanism_claims: [unstated] }).success).toBe(false);
  });
});

describe("finalize_research corrections (owner question 92, lesson #29)", () => {
  const WRONG = "Coldness affected 40% of people on compound A.";
  const CHANGE = "Earlier I gave 40% for compound A; that figure is compound B's, and compound A's is 7%.";

  const found = { retracted: WRONG, change: CHANGE, by_user: false };

  it("passes once the wrong statement is gone outside the sentence saying what changed", () => {
    expect(check({ answer_draft: `${LINKS}\n\n${CHANGE}`, corrections: [found] }).status).toBe("ready_with_limits");
  });

  it("sends back an answer that still shows the wrong statement in a heading or a table", () => {
    const problem = "corrections[0]'s wrong statement still appears in the answer outside its change sentence: " +
      "correct it everywhere, including headings, tables and summaries.";
    for (const leftover of [`## ${WRONG}`, `| Effect | Note |\n|---|---|\n| Cold | ${WRONG} |`]) {
      expect(check({ answer_draft: `${LINKS}\n\n${leftover}\n\n${CHANGE}`, corrections: [found] }).next_steps).toEqual([problem]);
    }
  });

  it("needs the change sentence in the answer", () => {
    expect(steps({ corrections: [found] })).toEqual([
      "corrections[0].change gives text the answer does not show: copy each sentence exactly from answer_draft."
    ]);
  });

  // Universal's correction-report rule (owner question 78; the owner's 16 Oct lemon conversation said "You're right"
  // and offered no report): after a correction the user pointed out, the answer asks whether to send a bug report.
  it("asks who pointed the error out, once", () => {
    expect(advisoryNotes(check({ answer_draft: `${LINKS}\n\n${CHANGE}`, corrections: [{ retracted: WRONG, change: CHANGE }] })))
      .toEqual([
        "Give corrections[0].by_user: true when the user pointed out the error and a recheck showed the user was " +
          "right, false when the research found it.",
        TOOL_LIST_REFRESH_HINT
      ]);
  });

  it("requires the bug-report question after the user's correction, in the answer's language too", () => {
    const byUser = { ...found, by_user: true, report: CHANGE, preventing_rule: "no_rule", missing_rule: "Carry corrections through all rendered forms." };
    const ruleLine = `Missing rule: ${byUser.missing_rule}`;
    const asked = check({ answer_draft: `${LINKS}\n\n${CHANGE}`, corrections: [byUser] });
    expect(asked.status).toBe("ready_with_limits");
    expect(asked.caveats).toEqual([ruleLine, CORRECTION_REPORT_OFFER, SKIP]);
    expect(check({ answer_draft: `${LINKS}\n\n${CHANGE}\n\n${ruleLine}\n\n${CORRECTION_REPORT_OFFER}`, corrections: [byUser] }).status)
      .toBe("ready_with_limits");
    const rendering = "AskRigor peut-il envoyer un rapport de bogue sur cette correction, ou voulez-vous d'abord préciser quelque chose ?";
    expect(check({
      answer_draft: `${LINKS}\n\n${CHANGE}\n\n${ruleLine}\n\n${rendering}`, corrections: [byUser], answer_language: "fr",
      caveat_renderings: [{ caveat: CORRECTION_REPORT_OFFER, text: rendering }]
    }).status).toBe("ready_with_limits");
    expect(check({ answer_draft: `${LINKS}\n\n${CHANGE}`, corrections: [found] }).caveats).toEqual([SKIP]);
  });
});

describe("finalize_research key-source links (the 2026-10-15 owner regressions)", () => {
  const PMID = "25959135";
  const pubmed = issueResearchReceipt("pubmed_record", { pmid: PMID, doi: DOI }, { secret: SECRET });
  const VIA_PUBMED = `[Trial](https://pubmed.ncbi.nlm.nih.gov/${PMID}/) and [Rat study](https://doi.org/${RAT}) were read.`;
  const linkSteps = (receipts: string[]) => check({ answer_draft: VIA_PUBMED, receipts }).next_steps
    .filter((step) => step.startsWith(`Key study ${DOI} `) || step.startsWith(`Key source ${DOI} has no answer_marker`));

  it("accepts a DOI key source's PubMed page once a PubMed receipt matched the two", () => {
    expect(linkSteps([...base().receipts, pubmed])).toEqual([]);
  });

  it("names the PubMed link and the ways to tie it when nothing matched the PubMed record to the DOI", () => {
    expect(linkSteps(base().receipts)).toEqual([
      `Key study ${DOI} is linked by https://pubmed.ncbi.nlm.nih.gov/${PMID}/, which no receipt passed here ties to it: ` +
        `link https://doi.org/${DOI} instead, or pass the research_receipt that ties that page: resolve_doi with ${DOI} ` +
        "ties the page the DOI is registered to, and fetch_pubmed_record ties the study's PubMed page."
    ]);
  });
});
