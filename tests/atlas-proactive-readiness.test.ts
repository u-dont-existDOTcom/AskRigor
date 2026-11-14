import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = async (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("automatic Atlas readiness: researcher-owned decision, existing save permissions", () => {
  it("instructs the research assistant before its first finalization rather than waiting for 'save to Atlas'", async () => {
    const skill = await read("skills/askrigor/SKILL.md");
    const project = await read("project/PROJECT_INSTRUCTIONS.md");
    expect(skill).toContain("Proactive Atlas readiness and submission");
    expect(skill).toContain("Before the first `finalize_research` call");
    expect(skill).toContain("do not wait for another");
    expect(project).toContain("Automatic Atlas readiness at each bounded pass");
    expect(project).toContain("Before the *first* final check");
    expect(project).toContain("automatically include a ready public `findings_card`");
  });

  it("requires evidence, novelty, Atlas reuse, and no duplicate or filler finding", async () => {
    const skill = await read("skills/askrigor/SKILL.md");
    for (const snippet of [
      "source identity/receipts", "population, intervention, comparison",
      "a quick web lookup", "`atlas_reuse`", "`updates`",
      "near-duplicate card", "If no finding clears"
    ]) expect(skill).toContain(snippet);
    expect(skill).toContain("not the number of papers");
  });

  it("preserves consent, personal-only, privacy, review, and validated-saving boundaries", async () => {
    const skill = await read("skills/askrigor/SKILL.md");
    const project = await read("project/PROJECT_INSTRUCTIONS.md");
    for (const snippet of [
      "For accepted free-contributor research",
      "For paid-private research, do not save unless",
      "personal-only", "privacy", "owner review",
      "If card validation rejects one", "not permission to invent a citation"
    ]) expect(skill).toContain(snippet);
    expect(project).toContain("existing card check");
    expect(project).toContain("paid-private per-answer permission");
  });

  it("records the opt-in behavior without adding a new blocking finalizer or paid inference", async () => {
    const decisions = await read("docs/design-decisions.md");
    expect(decisions).toContain("The AI prepares an Atlas submission on its own");
    expect(decisions).toContain("or a new seventh blocking final check");
    expect(decisions).toContain("adding a paid API call");
  });
});
