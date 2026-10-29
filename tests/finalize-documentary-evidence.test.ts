import { describe, expect, it } from "vitest";

import { checkDocumentaryEvidence, documentaryEvidenceSchema } from "../apps/research-mcp/src/documentary-evidence.js";
import { finalizeResearch, parseFinalizeResearchInput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";

const SOURCE = "https://example.org/company/science-team";
const SENTENCE = "The seller's official team page reports a formulation-adviser role.";
const entry = {
  relation: "creator_product_advisory" as const,
  relationship_scope: "creator_other_business" as const,
  source_type: "company_page" as const,
  source_read_depth: "section_read" as const,
  source_url: SOURCE,
  source_section: "Team",
  source_quote: "Senior Formulation Advisor",
  evidence_state: "documented" as const,
  answer_quote: SENTENCE
};
const draft = SENTENCE + " [Company team](" + SOURCE + ")";

const base = {
  receipts: [],
  research_target: "A synthetic documentary claim, not a treatment efficacy comparison",
  community_evidence: "not_relevant" as const,
  not_relevant_basis: "no_real_world_outcome" as const,
  not_relevant_reason: "This tests a cited documentary assertion, not an effect or symptom.",
  question_about: "other" as const,
  treatment_choice: "not_compared" as const,
  commercial_review_applicability: { status: "not_applicable" as const, reason: "No shopping or product recommendation." },
  key_sources: [],
  answer_draft: draft,
  absence_claims: [],
  key_terms: [], mechanism_claims: [], recommendations: [], user_observations: [], proposed_tests: [],
  safety_claims: [], safety_question: false,
  scale_results: [], binary_results: []
};

describe("documentary source-purpose checks", () => {
  it("admits the new field via later_inputs without changing the published tool list", () => {
    expect(laterInputNames("finalize_research")).toContain("documentary_evidence");
    const parsed = parseFinalizeResearchInput({ ...base, later_inputs: { documentary_evidence: [entry] } });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.documentary_evidence).toEqual([entry]);
    // Runtime also accepts an explicit newer top-level form; only the published tool-list shape is frozen.
    expect(parseFinalizeResearchInput({ ...base, documentary_evidence: [entry] }).success).toBe(true);
  });

  it("accepts an outside adviser statement as a bounded documentary claim without demanding a medical audit", () => {
    expect(checkDocumentaryEvidence([entry], draft)).toMatchObject({ steps: [] });
    const result = finalizeResearch({ ...base, later_inputs: { documentary_evidence: [entry] } },
      { secret: "synthetic-documentary-research-0123456789", findings: "closed" });
    expect(result.next_steps.join("\n")).not.toContain("documentary_evidence");
    expect(result.next_steps.join("\n")).not.toContain("PubMed");
    expect(result.caveats.join("\n")).toContain("rather than independently authenticated by an AskRigor receipt");
    expect(result.sources.validated).toEqual([]);
  });

  it("rejects a documented relationship with an unread source or missing actual wording", () => {
    expect(checkDocumentaryEvidence([{ ...entry, source_read_depth: "not_read", source_quote: "" }], draft)
      .steps.join("\n")).toContain("source was not read");
    expect(checkDocumentaryEvidence([{ ...entry, source_read_depth: "not_read", source_quote: "" }], draft)
      .steps.join("\n")).toContain("actual source wording");
  });

  it("refuses a paid-video attribution derived from a creator's separate business role", () => {
    const problems = checkDocumentaryEvidence([{
      ...entry, relation: "outside_paid_placement", relationship_scope: "creator_other_business"
    }], draft).steps.join("\n");
    expect(problems).toContain("cannot label payment for this content");
    const result = finalizeResearch({ ...base, later_inputs: { documentary_evidence: [{
      ...entry, relation: "outside_paid_placement", relationship_scope: "creator_other_business"
    }] } }, { secret: "synthetic-documentary-research-0123456789", findings: "closed" });
    expect(result.next_steps.join("\n")).toContain("cannot label payment for this content");
  });

  it("never promotes a bounded absence into proof that no payment or affiliation exists", () => {
    const bounded = { ...entry, evidence_state: "bounded_not_found" as const, source_quote: "",
      coverage_limit: "Only the team biography page and article references were inspected." };
    const checked = checkDocumentaryEvidence([bounded], draft);
    expect(checked.steps).toEqual([]);
    expect(checked.caveats.join("\n")).toContain("does not establish that no such relationship exists");
    expect(checkDocumentaryEvidence([{ ...bounded, coverage_limit: undefined }], draft)
      .steps.join("\n")).toContain("not verified does not prove absent");
    expect(checkDocumentaryEvidence([{ ...bounded, source_read_depth: "not_read" }], draft)
      .steps.join("\n")).toContain("cannot claim a bounded absence without reading");
  });

  it("preserves clinical-effect source gates when documentary evidence is also present", () => {
    const input = { ...base, later_inputs: { documentary_evidence: [entry] },
      key_sources: [{ id: "10.1000/clinical-trial", status: "validated" as const,
        read_depth: "full_text_audited" as const, answer_marker: "Clinical trial" }],
      answer_draft: draft + "\n[Clinical trial](https://doi.org/10.1000/clinical-trial)" };
    const result = finalizeResearch(input, { secret: "synthetic-documentary-research-0123456789", findings: "closed" });
    expect(result.next_steps.join("\n")).toContain("cannot support read_depth full_text_audited");
    expect(result.status).toBe("not_ready");
  });

  it("requires the visible answer to quote the claim and link the right documentary source", () => {
    expect(checkDocumentaryEvidence([entry], "The seller reports a relationship.").steps).toHaveLength(2);
    expect(checkDocumentaryEvidence([entry], SENTENCE + " `" + SOURCE + "`").steps.join(" ")).toContain("visible source link");
    expect(checkDocumentaryEvidence([entry], "`" + SENTENCE + "` [Company](" + SOURCE + ")").steps.join(" ")).toContain("visible answer_draft");
    expect(documentaryEvidenceSchema.safeParse([{ ...entry, source_url: "not-a-web-address" }]).success)
      .toBe(false);
  });
});
