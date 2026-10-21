import { describe, expect, it } from "vitest";
import {
  finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { communitySkipCaveat, withCommunitySkip } from "./helpers/community-skip.js";
import { assertNextStepsContract, inventory } from "./helpers/finalize-next-steps-contract.js";

const SECRET = "contested-evidence-test-secret-0123456789012345";
const DOI = "10.1000/contested";
const OTHER = "10.1000/other";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const quote = "The intervention's evidence is unconvincing.";
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates absence declarations." };
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" })],
  research_target: "Synthetic contested intervention evidence", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Synthetic fixture isolates structural checks.",
  commercial_review_applicability: declaration, intervention_identity: declaration,
  lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates absence checks." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Study" }],
  absence_claims: [{ quote, state: "not_established", studies: [DOI] }], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: `[Study](https://doi.org/${DOI}) was read. ${quote}`, ...overrides
});
// The answer carries the sentence its no_real_world_outcome declaration requires (owner question 125).
const check = (overrides: Partial<FinalizeResearchInput> = {}) =>
  assertNextStepsContract(finalizeResearch(withCommunitySkip(base(overrides)), { secret: SECRET }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}) =>
  check(overrides).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);

describe("declared contested intervention evidence-strength verdicts", () => {
  it.each([
    quote, "The intervention's evidence is weak.", "The effect is not demonstrated.", "The studies show no benefit.",
    "Les études ne démontrent pas cet effet.", "الدراسات لا تثبت هذا التأثير.", "研究では効果が示されていません。"
  ])("accepts an audited not_established declaration: %s", (text) => {
    const result = check({ answer_draft: `[Study](https://doi.org/${DOI}). ${text}`,
      absence_claims: [{ quote: text, state: "not_established", studies: [DOI] }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.finalization_receipt).toBeDefined();
  });
  it.each([undefined, []])("requires key sources when studies is %s", (studies) => {
    const input = { absence_claims: [{ quote, state: "not_established" as const, studies }] };
    const result = check(input);
    expect(result.status).toBe("not_ready");
    expect(result.finalization_receipt).toBeUndefined();
    expect(steps(input)).toEqual([
      "absence_claims[0] states that studies do not establish the effect without the studies it rests on: " +
        "studies lists its key sources (DOI, PMID or PMCID), each covered by a full-text method audit."
    ]);
  });
  it("requires an audit of each declared source rather than a different study or an abstract", () => {
    expect(steps({ absence_claims: [{ quote, state: "not_established", studies: [DOI, OTHER] }],
      receipts: [...base().receipts, sign("pubmed_record", { pmid: "1234", doi: OTHER })] })).toEqual([
      `absence_claims[0] states that studies do not establish the effect on ${OTHER}, which no full-text method ` +
        "audit here covers: an abstract or a lead cannot establish this evidence-strength verdict. " +
        "Each listed study needs a full-text method audit."
    ]);
  });
  it.each(["study_audit", "review_audit"] as const)("uses the same source resolution for %s", (kind) => {
    const receipts = [sign(kind, { id: DOI, status: "complete_no_unresolved_fields" }),
      sign(kind, { id: "PMC12345", status: "complete_no_unresolved_fields" }),
      sign("pubmed_record", { pmid: "1234", doi: DOI })];
    expect(check({ receipts,
      absence_claims: [{ quote, state: "not_established", studies: [DOI, "1234", "PMC12345"] }] }).status).toBe("ready_with_limits");
  });
  it("requires the declared quote to occur in answer_draft", () => {
    expect(steps({ answer_draft: `[Study](https://doi.org/${DOI}) was read.` })).toEqual([
      "absence_claims[0] gives text the answer does not show: copy each sentence exactly from answer_draft."
    ]);
  });
  it("requires a declaration but never infers a sentence's meaning", () => {
    const missing = check({ absence_claims: undefined });
    expect(missing.status).toBe("not_ready");
    expect(missing.next_steps).toContain(
      "absence_claims is missing: it lists each sentence saying something was not found, not studied, has no " +
        "evidence or has no effect; that an option made no difference compared with another, worked as well as it, " +
        "or did no better or no worse than it; or calling an intervention's evidence unconvincing, weak, not " +
        "demonstrated or showing no benefit (an empty list means none). Evidence-strength sentences are absence " +
        "claims, declared with not_established and their key sources when studies were found, or support_not_located " +
        "with search coverage when none were."
    );
    expect(missing.next_steps.filter((step) => step === TOOL_LIST_REFRESH_HINT)).toHaveLength(1);
    expect(check({ absence_claims: [] }).status).toBe("ready_with_limits");
  });
  it.each(["direct_null_evidence", "bounded_exclusion"] as const)("preserves %s source and numeric checks", (state) => {
    const text = "The trial found no benefit (difference 0.1, 95% CI -0.4 to 0.6).";
    expect(check({ answer_draft: `[Study](https://doi.org/${DOI}). ${text}`,
      absence_claims: [{ quote: text, state, studies: [DOI] }] }).status).toBe("ready_with_limits");
    expect(steps({ absence_claims: [{ quote, state, studies: [DOI] }] })).toEqual([
      `absence_claims[0] states ${state === "direct_null_evidence" ? "a direct null result" : "a bounded exclusion"}: ` +
        "give the estimate and its interval in that sentence, so a reader sees how large an effect the studies could have missed."
    ]);
  });
  it("preserves support_not_located search receipts and coverage requirements", () => {
    const notLocated = { absence_claims: [{ quote, state: "support_not_located" as const }] };
    expect(steps(notLocated)).toContain(
      "The answer says something was not found, but no literature search receipt was passed: search with " +
        "search_pubmed or search_europe_pmc (and search_clinical_trials for trials) and pass their research receipts."
    );
    const receipts = [...base().receipts, sign("literature_search", { src: "pubmed", q: "a".repeat(12), ret: 0, n: 0 })];
    const result = check({ ...notLocated, receipts, search_coverage: ["historical_terms", "citation_chains", "grey_literature"] });
    expect(result.status).toBe("not_ready");
    const notFound = "Where this answer says something was not found, it means the searches made here (PubMed) did " +
      "not find it; that is not evidence that it does not exist.";
    expect(result.caveats).toEqual([communitySkipCaveat(base().not_relevant_reason!), notFound]);
    expect(check({ ...notLocated, receipts, search_coverage: ["historical_terms", "citation_chains", "grey_literature"],
      answer_draft: `${base().answer_draft} ${notFound}` }).status).toBe("ready_with_limits");
  });
  it("publishes the new state and descriptive evidence-strength declaration in the generated catalog", () => {
    const tool = inventory.tools.find(({ name }) => name === "finalize_research")!;
    const properties = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
    const absence = properties.absence_claims as {
      description: string; items: { properties: { state: { enum: string[] }; studies: { description: string } } }
    };
    expect(absence.items.properties.state.enum).toEqual([
      "support_not_located", "direct_null_evidence", "not_established", "bounded_exclusion"
    ]);
    expect(absence.description).toBe(
      "With answer_draft: each place the answer says something was not found, not studied, has no evidence or " +
        "has no effect; that an option made no difference compared with another, worked as well as it, or did no " +
        "better or no worse than it; or calls an intervention's evidence unconvincing, weak, not demonstrated or " +
        "showing no benefit (an empty list if none). Evidence-strength sentences are absence claims, declared with " +
        "not_established and their key sources when studies were found, or support_not_located with search coverage " +
        "when none were."
    );
    expect(absence.items.properties.studies.description).toContain("not_established");
    expect(finalizeResearchInputSchema.parse(base()).absence_claims?.[0]?.state).toBe("not_established");
  });
});

// AskRigor#355: an answer called saffron "as effective as fluvoxamine" for OCD from a trial that found no significant
// difference and set no equivalence margin. A sentence saying one option worked as well as another, made no difference
// against it, or did no better or worse is an absence claim, so a null comparison gives its numbers like any null
// result. The sentences are synthetic gate fixtures shaped like that answer's, not evidence about either treatment.
describe("comparative null sentences are absence claims (AskRigor#355)", () => {
  const NUMBERS = " Symptom scores fell by 13.2 and 14.1 points, a difference of 0.9 points (95% CI -2.6 to 4.4).";
  const NO_NUMBERS = "absence_claims[0] states a direct null result: give the estimate and its interval in that " +
    "sentence, so a reader sees how large an effect the studies could have missed.";
  const declared = (text: string, state: "direct_null_evidence" | "bounded_exclusion" | "not_established") => ({
    answer_draft: `[Study](https://doi.org/${DOI}) was read. ${text}`,
    absence_claims: [{ quote: text, state, studies: [DOI] }]
  });

  it.each([
    "Saffron was as effective as fluvoxamine for OCD.",
    "Saffron made no difference compared with fluvoxamine.",
    "Saffron did no better or worse than fluvoxamine.",
    "Le safran a été aussi efficace que la fluvoxamine."
  ])("asks a direct null comparison for its estimate and interval: %s", (text) => {
    expect(steps(declared(text, "direct_null_evidence"))).toEqual([NO_NUMBERS]);
  });

  it("passes it with each arm's change and the difference with its interval", () => {
    const text = `Saffron was as effective as fluvoxamine for OCD.${NUMBERS}`;
    const result = check(declared(text, "direct_null_evidence"));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    const french = "Le safran a été aussi efficace que la fluvoxamine : les scores ont baissé de 13,2 et 14,1 points, " +
      "soit 0,9 point d'écart (IC à 95 % de -2,6 à 4,4).";
    expect(check(declared(french, "direct_null_evidence")).status).toBe("ready_with_limits");
  });

  it("checks a bounded exclusion between options the same way", () => {
    const text = "Saffron did no worse than fluvoxamine by more than 4.4 points (difference 0.9, 95% CI -2.6 to 4.4).";
    expect(check(declared(text, "bounded_exclusion")).status).toBe("ready_with_limits");
    expect(steps(declared("Saffron did no worse than fluvoxamine.", "bounded_exclusion"))).toEqual([
      "absence_claims[0] states a bounded exclusion: give the estimate and its interval in that sentence, so a " +
        "reader sees how large an effect the studies could have missed."
    ]);
  });

  it("needs no numbers for studies that do not establish whether the options differ", () => {
    const text = "The studies do not establish whether saffron differs from fluvoxamine.";
    const result = check(declared(text, "not_established"));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
  });

  it("describes the comparative states in the generated catalog", () => {
    const tool = inventory.tools.find(({ name }) => name === "finalize_research")!;
    const absence = (tool.inputSchema as { properties: Record<string, unknown> }).properties.absence_claims as {
      items: { properties: { state: { description: string } } }
    };
    expect(absence.items.properties.state.description).toBe(
      "support_not_located: the searches did not find it; direct_null_evidence: studies found no effect, or no " +
        "difference between the options compared; not_established: studies were found but do not establish the " +
        "effect; bounded_exclusion: precise studies rule out an effect, or a difference between options, above a " +
        "stated size."
    );
  });
});
