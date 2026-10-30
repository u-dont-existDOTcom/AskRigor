import { describe, expect, it } from "vitest";
import { RESEARCH_OPERATIONS } from "../apps/research-mcp/src/register-tools.js";
import { laterInputShape } from "../apps/research-mcp/src/later-inputs.js";

describe("owner 195 runtime guidance", () => {
  it("describes only the five blocking checks, and which limits the answer states in the model's own words", () => {
    const operation = RESEARCH_OPERATIONS.find(({ name }) => name === "finalize_research")!;
    const description = operation.description;
    expect(operation.runtimeInputSchema.shape.answer_draft.description).toContain("their exact wording is not checked");
    expect(operation.runtimeOutputSchema.shape.caveats.description).toContain("does not block");
    expect(operation.runtimeOutputSchema.shape.next_step_kinds.description).toContain("Only the five blocking checks");
    expect(operation.runtimeOutputSchema.shape.round.description).toContain("Only calls with blocking steps");
    expect(description).toContain("Only five checks can return not_ready");
    expect(description).toContain("source receipts and links");
    expect(description).toContain("read depth");
    expect(description).toContain("arithmetic and shown figures");
    expect(description).toContain("safety statements have a named-harm screen");
    expect(description).toContain("retracted statements stay out");
    // Owner answer 205a (30 Oct): the panel lists every limit beneath a passing check, so its answer states only
    // the limits that matter for the person; an answer whose check has not passed states them all.
    expect(description).toContain("in the model's own words only the limits that change what the person should believe or do");
    expect(description).toContain("an answer whose check has not passed states every material limit");
    expect(description).not.toContain("each as its own sentence and as written");
    expect(description).toContain("other diagnostics are notes");
  });

  it("keeps later community and treatment declarations advisory", () => {
    const later = laterInputShape("finalize_research");
    expect(later.community_evidence.description).toContain("notes");
    expect(later.treatment_choice.description).toContain("notes");
  });
});
