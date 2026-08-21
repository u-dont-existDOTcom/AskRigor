import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const skillUrl = new URL(
  "../integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
  import.meta.url
);
const setupUrl = new URL("../docs/gemini-spark-setup.md", import.meta.url);

describe("Gemini Spark AskRigor candidate scout", () => {
  it("pins the materially smaller replacement bytes", async () => {
    const skill = await readFile(skillUrl, "utf8");
    const longestLine = Math.max(...skill.split(/\r?\n/u).map((line) => line.length));
    const sha256 = createHash("sha256").update(skill).digest("hex");

    expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(8_000);
    expect(longestLine).toBeLessThanOrEqual(500);
    expect(sha256).toBe("1ecd387b95af48050590f8f5d8a6ea900b7cfb79b18a9dd8562057929560b02b");
  });

  it("keeps Gemini in a candidate-only role", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("name: scout-youtube-candidates-for-askrigor");
    expect(skill).toContain("Find useful public YouTube candidates");
    expect(skill).toContain("Do not call AskRigor tools");
    expect(skill).toContain("Do not load or interpret Universal or HRP");
    expect(skill).toMatch(/Do not report views, likes, comment\s+counts/u);
    expect(skill).toContain("Describe only claims made by the creator");
    expect(skill).toMatch(/Never invent a\s+title/u);
    expect(skill).not.toContain("get_youtube_video");
    expect(skill).not.toContain("youtube_rediscovery_packet");
    expect(skill).not.toContain("rabbit-hole map");
    expect(skill).not.toContain("remedy_extraction_scan");
    expect(skill).not.toContain("targeted_rediscovery");
  });

  it("requires broad discovery without the failed probe ledger", async () => {
    const skill = await readFile(skillUrl, "utf8");

    for (const value of [
      "firsthand_outcome",
      "radical_outcome",
      "overlooked_intervention",
      "conventional_benefit",
      "conventional_negative"
    ]) {
      expect(skill).toContain(value);
    }
    expect(skill).toContain("Run 6 to 12 materially different searches");
    expect(skill).toContain("Return 3 to 12 unique videos");
    expect(skill).toContain("Suggest 1 to 4 candidate IDs");
    expect(skill).toContain("does not contain probe");
    expect(skill).toContain("Do not pad missing roles");
    expect(skill).toContain("diagnosis_not_specified");
    expect(skill).not.toContain("anchor_coverage");
    expect(skill).not.toContain("matched_candidate_row_ids");
    expect(skill).not.toContain("question_term_evidence");
  });

  it("emits the exact strict handoff shape and fixed disclosures", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("Return one raw JSON object");
    expect(skill).toContain("Emit no heading, diagnostic line, Markdown fence");
    expect(skill).not.toContain("Scout contract:");
    expect(skill).not.toContain("Mode: candidate_discovery");
    expect(skill).not.toContain("```json");
    expect(skill).toContain("one strict JSON object");
    expect(skill).toContain("Set `packet_name` to `gemini_youtube_candidate_handoff`");
    expect(skill).toContain("`packet_version` to\n`1.0`");
    expect(skill).toContain("https://www.youtube.com/watch?v=VIDEO_ID");
    expect(skill).toContain("`provider_metadata_not_validated_by_gemini`");
    expect(skill).toContain("`creator_claims_not_validated`");
    expect(skill).toContain("Add no keys");
    expect(skill).toContain("all five search purposes occur");
    expect(skill).toContain("every suggested ID exists among the candidates");
  });

  it("documents the one-pass upload and deterministic AskRigor validation path", async () => {
    const setup = await readFile(setupUrl, "utf8");

    expect(setup).toContain("scout-youtube-candidates-for-askrigor");
    expect(setup).toContain("Replace my existing AskRigor YouTube scout");
    expect(setup).toContain("Do not merge it with the old staged contract");
    expect(setup).toContain("old `staged-remedy-scan-v16` contract is retired");
    expect(setup).toContain("there is no iterative owner-operated probe");
    expect(setup).toContain("npm run validate:gemini-handoff -- path/to/spark-response.md");
    expect(setup).toContain("one raw JSON");
    expect(setup).toContain("legacy framed packets");
    expect(setup).toContain("validateGeminiYoutubeCandidateHandoff");
    expect(setup).toContain("not a new public MCP or Action operation");
    expect(setup).toContain("17 expected");
    expect(setup).toContain("does not prove that comment");
    expect(setup).toContain("Do not ask the owner to diagnose or patch the skill");
    expect(setup).toContain("1ecd387b95af48050590f8f5d8a6ea900b7cfb79b18a9dd8562057929560b02b");
  });
});
