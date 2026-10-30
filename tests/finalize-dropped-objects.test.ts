import { describe, expect, it } from "vitest";
import { finalizeResearch, type FinalizeResearchInput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { withCommunitySkip } from "./helpers/community-skip.js";

// The 30 Oct rerun on #384's build: four calls were refused by the connector ("community_findings.videos_reviewed
// [required]: Missing required property") because the check's note said only that the empty videos_reviewed was
// dropped, so the AI deleted the field. The server had dropped community_findings as a whole; the note now says so,
// and how to send it again.
const SECRET = "dropped-objects-test-secret-0123456789abcdef";
const DOI = "10.1000/x";
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates input reading." };
const base = (overrides: Record<string, unknown> = {}): FinalizeResearchInput => withCommunitySkip({
  lab_preparation: declaration, commercial_review_applicability: declaration, intervention_identity: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates input reading." },
  receipts: [issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields" }, { secret: SECRET })],
  research_target: "Synthetic input reading", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: "Synthetic fixture isolates input reading.",
  key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: DOI, status: "validated" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
  safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: `[Study](https://doi.org/${DOI}) describes ion exchange.`, ...overrides
} as FinalizeResearchInput);
const notes = (overrides: Record<string, unknown>) =>
  (finalizeResearch(base(overrides), { secret: SECRET }).notes ?? []).filter((note) => /: dropped/u.test(note));

describe("finalize_research names an object dropped with its unusable field", () => {
  it("says community_findings went as a whole, so the AI sends it again or leaves it out", () => {
    expect(notes({ community_findings: { videos_reviewed: [], benefit_reports: "None.", no_effect_reports: "None.",
      adverse_reports: "None.", creators_versus_commenters: "None.", effect_on_answer: "None." } })).toEqual([
      "community_findings.videos_reviewed: dropped: needs at least 1 item.",
      "community_findings: dropped as a whole, since its required videos_reviewed could not be used: send it again " +
        "with that field usable, or leave it out."
    ]);
  });

  it("names every field an open lead lost, required or not", () => {
    expect(notes({ research_depth: "first_pass", open_leads: [{ direction: "forums", topic: "", why: "Could change the ranking." }] }))
      .toEqual([
        "open_leads[0].direction: dropped: not a supported value; use studies, community.",
        "open_leads[0].topic: dropped: needs at least 1 character.",
        "open_leads[0]: dropped as a whole, since its direction and topic could not be used: send it again with those " +
          "fields usable, or leave it out."
      ]);
  });

  it("keeps an object whose unusable field is optional, with only that field's note", () => {
    expect(notes({ community_findings: { videos_reviewed: ["aaaaaaaaaaa"], product_corpora: 3,
      benefit_reports: "None.", no_effect_reports: "None.", adverse_reports: "None.", creators_versus_commenters: "None.",
      effect_on_answer: "None." } })).toEqual(["community_findings.product_corpora: dropped: expected a list."]);
  });
});
