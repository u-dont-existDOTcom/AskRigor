import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const skillUrl = new URL(
  "../integrations/gemini-spark/askrigor-research/SKILL.md",
  import.meta.url,
);
const setupUrl = new URL("../docs/gemini-spark-setup.md", import.meta.url);

describe("Gemini Spark AskRigor skill", () => {
  it("loads canonical protocols at runtime and preserves the public boundary", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("name: run-askrigor-research");
    expect(skill).toContain("get_protocol_manifest");
    expect(skill).toContain("verify_protocol_integrity");
    expect(skill).toContain("complete: true");
    expect(skill).toContain("population-level evidence research");
    expect(skill).toMatch(/Do not\s+diagnose a user/);
  });

  it("uses only tools in the frozen public MCP inventory", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("survey_youtube_community");
    expect(skill).toContain("audit_youtube_video_community");
    expect(skill).toContain("get_youtube_video");
    expect(skill).not.toMatch(/call `get_youtube_transcript`/);
    expect(skill).not.toContain("submit_lesson_candidate");
  });

  it("does not turn consumer Gemini output into transcript evidence", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("model-mediated consumer output");
    expect(skill).toContain("cannot prove");
    expect(skill).toContain("do not claim `HRP-complete`");
    expect(skill).toContain(
      "Keep creator-summary claims separate from independently\nretrieved comments",
    );
  });

  it("documents one-time credential-free connection and honest acceptance", async () => {
    const setup = await readFile(setupUrl, "utf8");

    expect(setup).toContain("https://mcp.askrigor.com/mcp");
    expect(setup).toContain("presence in the United States for custom\napps");
    expect(setup).toContain("Google AI Pro or Ultra");
    expect(setup).toContain("Keep Activity is enabled");
    expect(setup).toContain("API billing does not change");
    expect(setup).toMatch(/needs\s+no credential/);
    expect(setup).toContain("17 expected tools");
    expect(setup).toContain("not manual transcript or summary transfer");
    expect(setup).toContain("do not infer it passed");
  });
});
