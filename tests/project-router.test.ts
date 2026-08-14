import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

async function projectFile(path: string): Promise<string> {
  try {
    return await readFile(rootFile(`project/${path}`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

describe("AskRigor ChatGPT Project router", () => {
  it("ships the exact copy-ready Project package alongside governance metadata", async () => {
    let files: string[] = [];
    try {
      files = await readdir(rootFile("project"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    expect(files.sort()).toEqual([
      "AGENTS.md",
      "CODEX-CURRENT-STATE.md",
      "FORUM_SIGNAL_MODULE.md",
      "PROJECT_INSTRUCTIONS.md",
      "README.md"
    ]);
  });

  it("uses a compact pre-HRP router with an irreversible sensitive trigger", async () => {
    const instructions = await projectFile("PROJECT_INSTRUCTIONS.md");
    const words = instructions.split(/\s+/).filter(Boolean);

    expect(words.length).toBeGreaterThan(100);
    expect(words.length).toBeLessThan(500);
    expect(instructions).not.toMatch(/<\/?(?:Protocol|Purpose|Research)/);
    expect(instructions).toContain("Run this routing gate before loading or applying the full HRP");
    for (const trigger of [
      "firsthand experience",
      "implementation differences",
      "treatment tolerability",
      "real-world outcomes",
      "adherence",
      "harms",
      "discontinuation",
      "patient decision-making"
    ]) {
      expect(instructions).toContain(trigger);
    }
    expect(instructions).toContain("When uncertain, mark FORUM_SIGNAL REQUIRED");
    expect(instructions).toContain("REQUIRED cannot become NOT REQUIRED");
  });

  it("permanently blocks the exact hip/RCT early-synthesis failure", async () => {
    const instructions = await projectFile("PROJECT_INSTRUCTIONS.md");

    expect(instructions).toContain(
      "@AskRigor best way to fix an old hip that barely works and hurts"
    );
    expect(instructions).toContain("Finding an excellent RCT does not satisfy or deselect FORUM_SIGNAL");
    expect(instructions).toContain("`survey_youtube_community`");
    expect(instructions).toContain("`audit_youtube_video_community`");
    expect(instructions).toContain("Do not emit a final verdict");
    expect(instructions).toContain("Do not emit the full-HRP opening");
    expect(instructions).toContain("synthesis_lock: pass");
  });

  it("automatically continues adaptive YouTube work while information gain remains positive", async () => {
    const instructions = await projectFile("PROJECT_INSTRUCTIONS.md");

    expect(instructions).toContain("up to three materially different videos");
    expect(instructions).toContain("`continuation_recommended: true`");
    expect(instructions).toContain(
      "`continuation_recommended` is authoritative for immediate automatic resubmission"
    );
    expect(instructions).toContain(
      "A token paired with `continuation_recommended: false` is deferred recovery state"
    );
    expect(instructions).toContain("expected information gain is positive");
    expect(instructions).toContain("does not require ceremonial user approval");
    expect(instructions).toContain(
      "If `further_expansion_likely_to_improve_answer` would be `yes` and the work is executable, continue researching."
    );
    expect(instructions).toContain("A final answer may report only `no` or `blocked` with a reason.");
  });

  it("defines a directional, bidirectional Forum Signal receipt for HRP synthesis", async () => {
    const module = await projectFile("FORUM_SIGNAL_MODULE.md");

    for (const direction of ["benefit", "no_effect", "harm", "discontinuation"]) {
      expect(module).toContain(`${direction}: complete | no_material_reports | incomplete`);
    }
    expect(module).toContain(
      "community_to_formal: complete | no_material_transferable_hypotheses | incomplete"
    );
    expect(module).toContain(
      "formal_to_community: complete | no_material_discriminators | incomplete"
    );
    expect(module).toContain("youtube_synthesis_lock: pass | block");
    expect(module).toContain("confidence_effect: <explicit text>");
    expect(module.toLowerCase()).toContain("query-bounded comment search is discovery-only");
    expect(module).toContain("person × treatment episode");
    expect(module).toContain("This receipt is an input to HRP synthesis, not a treatment verdict");
  });

  it("defines intervention-level independent evidence weighting without formal-evidence erasure", async () => {
    const module = await projectFile("FORUM_SIGNAL_MODULE.md");

    for (const field of [
      "intervention_signal:",
      "reported_outcome:",
      "diagnosis_alignment: confirmed | likely | uncertain | mismatched",
      "community_signal: promising | mixed | weak | concerning | indeterminate",
      "formal_relationship: corroborated | contradicted | support_not_located | outcome_mismatch",
      "risk_cost_reversibility:",
      "opportunity_cost: low | moderate | high | uncertain",
      "actionability: reasonable_time_bounded_trial | clinician_supervised_trial | insufficient_basis | avoid",
      "measurement_and_stop_rules:"
    ]) {
      expect(module).toContain(field);
    }
    expect(module).toContain(
      "`support_not_located` is an evidence gap, not evidence that the reports are false"
    );
    expect(module).toContain(
      "Formal contradiction requires materially aligned population, intervention, comparator, outcome, and timeframe"
    );
    expect(module).toContain("structural regeneration");
    expect(module).toContain("pain, function, range of motion, or avoided surgery");
    expect(module).toContain("must not delay urgent diagnosis or time-sensitive effective care");
  });

  it("requires deep-enough YouTube acquisition, clickable video receipts, and adaptive saturation", async () => {
    const module = await projectFile("FORUM_SIGNAL_MODULE.md");

    for (const required of [
      "`survey_youtube_community`",
      "`audit_youtube_video_community`",
      "provider_reported_comments",
      "top_level_comments_retrieved_cumulative",
      "replies_retrieved_cumulative",
      "records_retrieved_cumulative",
      "records_returned_for_analysis",
      "Videos worth watching",
      "clickable canonical",
      "decision usefulness, not positivity",
      "failures, harms, or difficult recovery",
      "two consecutive wider expansions",
      "one creator or discussion pool",
      "elapsed time is not evidence saturation",
      "further_expansion_likely_to_improve_answer: yes | no | blocked",
      "A final answer may contain only `no` or `blocked`",
      "Normal Project chat is the primary YouTube pagination workflow",
      "Deep Research does not make YouTube pagination faster"
    ]) {
      expect(module.toLowerCase()).toContain(required.toLowerCase());
    }
    expect(module).toContain("at least 300");
    expect(module).toContain("fewer than 300");
    expect(module).toContain("`insufficient_depth`");
    expect(module).toContain("`retrieved` does not mean persisted or user-downloadable");
  });

  it("emits the expansion report and lawful deeper-literature handoff", async () => {
    const module = await projectFile("FORUM_SIGNAL_MODULE.md");

    for (const field of [
      "youtube_expansion_report:",
      "deeper_expansion_performed: yes | no",
      "deeper_calls:",
      "wider_expansion_performed: yes | no",
      "wider_searches:",
      "material_new_information:",
      "stopping_reason:",
      "deeper_literature_handoff:",
      "unresolved_claims:",
      "population_intervention_outcomes:",
      "synonyms_and_searches_run:",
      "papers_and_identifiers_inspected:",
      "missing_evidence:"
    ]) {
      expect(module).toContain(field);
    }
    expect(module).not.toMatch(/sci[- ]?(?:bot|hub)/i);
  });

  it("turns the exact hip community signal into a non-erasure regression", async () => {
    const module = await projectFile("FORUM_SIGNAL_MODULE.md");

    expect(module).toContain("gelatin, keto, or swimming");
    expect(module).toContain("promising for the specific reported outcome");
    expect(module).toContain("must not become `weak`, `ineffective`, or `disproved`");
    expect(module).toContain("matched formal support was not located");
    expect(module).toContain("measured time-bounded trial");
  });

  it("explains the one-time manual Project installation boundary", async () => {
    const readme = await projectFile("README.md");

    expect(readme).toContain("ChatGPT Project instructions");
    expect(readme).toContain("PROJECT_INSTRUCTIONS.md");
    expect(readme).toContain("FORUM_SIGNAL_MODULE.md");
    expect(readme).toContain("does not update an existing ChatGPT Project automatically");
    expect(readme).toContain("refresh the AskRigor developer-mode connection");
    expect(readme).toContain("survey_youtube_community");
    expect(readme).toContain("audit_youtube_video_community");
    expect(readme).toMatch(/start a new chat/i);
  });
});
