import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const skillUrl = new URL(
  "../integrations/gemini-spark/askrigor-youtube-scout/SKILL.md",
  import.meta.url,
);
const setupUrl = new URL("../docs/gemini-spark-setup.md", import.meta.url);

describe("Gemini Spark AskRigor skill", () => {
  it("keeps Gemini in the bounded YouTube scout role", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("name: scout-youtube-for-askrigor");
    expect(skill).toContain("YouTube discovery and creator-content summarization");
    expect(skill).toContain("Do not load or interpret Universal or HRP");
    expect(skill).toContain("Do not decide which HRP modules apply");
    expect(skill).toContain("Do not produce the final AskRigor evidence synthesis");
    expect(skill).not.toContain("get_protocol_manifest");
    expect(skill).not.toContain("verify_protocol_integrity");
  });

  it("uses the AskRigor MCP only to validate exact candidate identities", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("get_youtube_video");
    expect(skill).toContain("api_visible_complete");
    expect(skill).toContain("`available` is not an AskRigor `access_status`");
    expect(skill).toMatch(/Do not paraphrase, normalize, or\s+invent the status/);
    expect(skill).not.toContain("survey_youtube_community");
    expect(skill).not.toContain("audit_youtube_video_community");
    expect(skill).not.toContain("get_youtube_transcript");
    expect(skill).not.toContain("submit_lesson_candidate");
  });

  it("returns decision-useful summaries and exact watch links", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("Surprising or hard-to-find claim");
    expect(skill).toContain("Concrete intervention details");
    expect(skill).toContain("Visual inspection needed");
    expect(skill).toContain("AskRigor handoff");
    expect(skill).toContain("Videos worth watching");
    expect(skill).toContain("canonical YouTube link");
    expect(skill).toContain("`creator_summary` or `visual_observation`");
    expect(skill).toContain("Do not request or output timestamps");
    expect(skill).toContain("segment cue");
    expect(skill).toContain("exact_outcome_match");
    expect(skill).toContain("adjacent_implementation");
    expect(skill).toContain("commercial_or_promotional");
    expect(skill).toContain("creator relationship or incentive");
    expect(skill).toContain("the creator claims");
    expect(skill).toContain("exact query or discovery direction");
    expect(skill).toContain("Run the exact-outcome lane first");
    expect(skill).toContain("zero exact outcome matches");
    expect(skill).toMatch(/Do not let an adjacent tutorial\s+displace/);
    expect(skill).toContain("## Final self-check");
    expect(skill).toContain("metadata-validated");
  });

  it("documents the one-time connection and per-task scout handoff honestly", async () => {
    const setup = await readFile(setupUrl, "utf8");

    expect(setup).toContain("https://mcp.askrigor.com/mcp/gemini");
    expect(setup).toContain("presence in the United States for custom\napps");
    expect(setup).toContain("Google AI Pro or Ultra");
    expect(setup).toContain("Keep Activity is enabled");
    expect(setup).toContain("API billing does not change");
    expect(setup).toMatch(/needs\s+no credential/);
    expect(setup).toContain("17 expected tools");
    expect(setup).toContain("scout-youtube-for-askrigor");
    expect(setup).toContain("does not execute HRP");
    expect(setup).toContain("one handoff per research task");
    expect(setup).toContain("Do not treat the connection test as end-to-end HRP acceptance");
  });
});
