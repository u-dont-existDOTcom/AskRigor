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

    const repositoryControlFiles = new Set([
      "AGENTS.md",
      "CODEX-CURRENT-STATE.md",
      "CUSTOM_GPT_ACTION_MODULE.md"
    ]);
    expect(files.filter((file) => !repositoryControlFiles.has(file)).sort()).toEqual([
      "FORUM_SIGNAL_MODULE.md",
      "LESSON_CAPTURE_MODULE.md",
      "PROJECT_INSTRUCTIONS.md",
      "README.md"
    ]);
    expect(files.filter((file) => repositoryControlFiles.has(file)).sort()).toEqual([
      "AGENTS.md",
      "CODEX-CURRENT-STATE.md",
      "CUSTOM_GPT_ACTION_MODULE.md"
    ]);

    const readme = await projectFile("README.md");
    expect(readme).toContain(
      "`AGENTS.md` and `CODEX-CURRENT-STATE.md` are repository-control files, not ChatGPT installation inputs."
    );
    expect(readme).toContain(
      "`CUSTOM_GPT_ACTION_MODULE.md` is a generator source, not a direct ChatGPT installation input."
    );
  });

  it("uses a compact pre-HRP router with an irreversible sensitive trigger", async () => {
    const instructions = await projectFile("PROJECT_INSTRUCTIONS.md");
    const words = instructions.split(/\s+/).filter(Boolean);

    expect(words.length).toBeGreaterThan(100);
    expect(words.length).toBeLessThan(750);
    expect(instructions).not.toMatch(/<\/?(?:Protocol|Purpose|Research)/);
    expect(instructions).toContain("Run before HRP/research");
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
    expect(instructions).toContain("If uncertain, require it");
    expect(instructions).toContain("REQUIRED cannot become NOT REQUIRED");
    for (const explicitRequiredExample of [
      "treatment alternatives",
      "avoiding replacement",
      "avoiding joint replacement",
      "avoiding surgery",
    ]) {
      expect(instructions).toContain(explicitRequiredExample);
    }
    for (const implicitDecisionBoundary of [
      "personal or practical treatment decision",
      "good idea for me",
      "now versus wait or delay",
      "even if alternatives are unstated",
      "population-level",
      "A request to exclude forums limits execution, not applicability",
      "simple definition or terminology",
      "pure chemistry or mechanism with no real-world outcome or safety claim",
      "emergency triage before stabilization",
      "no meaningful user-experience corpus",
      "Omitted alternatives are not a nontrigger",
    ]) {
      expect(instructions).toContain(implicitDecisionBoundary);
    }
    expect(instructions).toContain(
      "`HRP-complete` requires executed ledger-required formal retrieval and all receipts passed."
    );
    expect(instructions).toContain("Do not emit the full-HRP opening until every required receipt has passed.");
    expect(instructions).toContain("or `incomplete` directional/bidirectional field");
    expect(instructions).toContain("`youtube_synthesis_lock: pass`");
    expect(instructions).toContain("every selected discussion audit's `synthesis_lock: pass`");
    expect(instructions).toContain("If `get_youtube_transcript` is unavailable");
    expect(instructions).toContain("`transcript_tool_unavailable`");
    expect(instructions).toContain("never call an undeclared tool");
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

    expect(instructions).toContain("up to three materially different candidates per batch");
    expect(instructions).toContain("`continuation_recommended: true`");
    expect(instructions).toContain(
      "That field is authoritative for immediate automatic resubmission"
    );
    expect(instructions).toContain(
      "false tokens are deferred recovery state"
    );
    expect(instructions).toContain("expected information gain is positive");
    expect(instructions).toContain("needs no ceremonial user approval");
    expect(instructions).toContain(
      "Continue executable work if `further_expansion_likely_to_improve_answer` would be `yes`."
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
    expect(module).toContain("If `get_youtube_transcript` is unavailable");
    expect(module).toContain("`transcript_tool_unavailable`");
    expect(module).toContain("never call an undeclared tool");
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
    expect(module).toContain("structural reversal, permanent cure, or causality");
    expect(module).toContain("Translate “cured” into the specific evidenced outcome");
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
      "canonical title link",
      "decision usefulness, novelty, and exact match",
      "failure, harm, discontinuation",
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

  it("makes formal non-erasure universal without leaking a held-out answer", async () => {
    const module = await projectFile("FORUM_SIGNAL_MODULE.md");

    expect(module).toContain("`support_not_located` is an evidence gap");
    expect(module).toContain("cannot alone downgrade the observed community signal");
    expect(module).toContain("steelman without inflation");
    expect(module).toContain("A reasonable trial needs baseline measurement");
    expect(module).not.toContain("gelatin, keto, or swimming");
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

  it("distinguishes the MCP Project package from the Custom GPT Action and existing chats", async () => {
    const readme = await projectFile("README.md");

    expect(readme).toContain("## ChatGPT Project with MCP");
    expect(readme).toContain("This MCP Project package is the read-only research integration.");
    expect(readme).toContain("The lesson submission Action is not an MCP tool");
    expect(readme).toContain("## Custom GPT with research and lesson Actions");
    expect(readme).toContain("`../docs/custom-gpt-instructions.md`");
    expect(readme).toContain("keep Knowledge empty");
    expect(readme).toContain("Action authentication and import are separate from the MCP Project connection.");
    expect(readme).toContain("Existing chats do not acquire the new standing-consent behavior");
    expect(readme).toContain("consent from an old chat never carries into a new one");
  });

  it("routes validated criticism to a separate lesson module without mixing it into HRP", async () => {
    const instructions = await projectFile("PROJECT_INSTRUCTIONS.md");
    const lessonHook = instructions.indexOf("## 5. Lesson capture hook");

    expect(lessonHook).toBeGreaterThan(-1);
    expect(instructions.slice(lessonHook)).toContain(
      "Read `LESSON_CAPTURE_MODULE.md` completely",
    );
    expect(instructions.slice(lessonHook)).toContain(
      "only after AskRigor rechecks and validates the user's concrete criticism"
    );
    expect(instructions.slice(lessonHook)).toContain(
      "Follow it for lesson handling; it does not change the HRP ledger."
    );
    expect(instructions.slice(0, lessonHook)).not.toContain("LESSON_CAPTURE_MODULE.md");
    expect(instructions).not.toContain("Submit this anonymized lesson to improve AskRigor?");
    expect(instructions.split(/\s+/).filter(Boolean).length).toBeLessThan(750);
  });
});
