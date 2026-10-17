import { describe, expect, it } from "vitest";
import {
  finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
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
  absence_claims: [{ quote, state: "not_established", studies: [DOI] }], scale_results: [], user_observations: [], proposed_tests: [], safety_claims: [], key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: `[Study](https://doi.org/${DOI}) was read. ${quote}`, ...overrides
});
const check = (overrides: Partial<FinalizeResearchInput> = {}) =>
  assertNextStepsContract(finalizeResearch(base(overrides), { secret: SECRET }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}) =>
  check(overrides).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);

describe("declared contested intervention evidence-strength verdicts", () => {
  it.each([
    quote, "The intervention's evidence is weak.", "The effect is not demonstrated.", "The studies show no benefit.",
    "Les études ne démontrent pas cet effet.", "الدراسات لا تثبت هذا التأثير.", "研究では効果が示されていません。"
  ])("accepts an audited not_established declaration: %s", (text) => {
    const result = check({ answer_draft: `[Study](https://doi.org/${DOI}). ${text}`,
      absence_claims: [{ quote: text, state: "not_established", studies: [DOI] }] });
    expect(result.status).toBe("ready");
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
      absence_claims: [{ quote, state: "not_established", studies: [DOI, "1234", "PMC12345"] }] }).status).toBe("ready");
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
        "evidence or has no effect, or calling an intervention's evidence unconvincing, weak, not demonstrated or " +
        "showing no benefit (an empty list means none). Evidence-strength sentences are absence claims, declared " +
        "with not_established and their key sources when studies were found, or support_not_located with search " +
        "coverage when none were."
    );
    expect(missing.next_steps.filter((step) => step === TOOL_LIST_REFRESH_HINT)).toHaveLength(1);
    expect(check({ absence_claims: [] }).status).toBe("ready");
  });
  it.each(["direct_null_evidence", "bounded_exclusion"] as const)("preserves %s source and numeric checks", (state) => {
    const text = "The trial found no benefit (difference 0.1, 95% CI -0.4 to 0.6).";
    expect(check({ answer_draft: `[Study](https://doi.org/${DOI}). ${text}`,
      absence_claims: [{ quote: text, state, studies: [DOI] }] }).status).toBe("ready");
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
    expect(result.caveats).toEqual([
      "Where this answer says something was not found, it means the searches made here (PubMed) did not find it; " +
        "that is not evidence that it does not exist."
    ]);
    expect(check({ ...notLocated, receipts, search_coverage: ["historical_terms", "citation_chains", "grey_literature"],
      answer_draft: `${base().answer_draft} ${result.caveats[0]}` }).status).toBe("ready_with_limits");
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
        "has no effect, or calls an intervention's evidence unconvincing, weak, not demonstrated or showing no benefit " +
        "(an empty list if none). Evidence-strength sentences are absence claims, declared with not_established and " +
        "their key sources when studies were found, or support_not_located with search coverage when none were."
    );
    expect(absence.items.properties.studies.description).toContain("not_established");
    expect(finalizeResearchInputSchema.parse(base()).absence_claims?.[0]?.state).toBe("not_established");
  });
});
