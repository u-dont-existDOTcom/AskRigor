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
    expect(sha256).toBe("bde36dd81a862cc14696e3ea28ac7cff52acad498ada793b36a80d717fd51e08");
  });

  it("keeps Gemini in a candidate-only role", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("name: scout-youtube-candidates-for-askrigor");
    expect(skill).toContain("The goal is the right videos, not a generic quota");
    expect(skill).toContain("Do not call AskRigor tools");
    expect(skill).toContain("Do not call AskRigor tools, load protocols");
    expect(skill).toMatch(/Do not report views, likes, comment\s+counts/u);
    expect(skill).toContain("Attribute creator claims");
    expect(skill).toMatch(/Never invent a title/u);
    expect(skill).not.toContain("get_youtube_video");
    expect(skill).not.toContain("youtube_rediscovery_packet");
    expect(skill).not.toContain("rabbit-hole map");
    expect(skill).not.toContain("remedy_extraction_scan");
    expect(skill).not.toContain("targeted_rediscovery");
  });

  it("requires implementation-specific iterative discovery without a pseudo-audit ledger", async () => {
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
    expect(skill).toContain("Run 8 to 18 materially different searches");
    expect(skill).toContain("Normally return 6 to 16 unique");
    expect(skill).toContain("Suggest 1 to 8 IDs");
    expect(skill).toContain("Split each material umbrella class into specific implementations");
    expect(skill).toContain("Do not emit probe counts");
    expect(skill).toContain("Do not pad roles");
    expect(skill).toContain("diagnosis_not_specified");
    expect(skill).toContain("population/stage");
    expect(skill).toContain("outcome/horizon");
    expect(skill).toMatch(/AskRigor has not\s+transcript-verified/u);
    expect(skill).not.toContain("anchor_coverage");
    expect(skill).not.toContain("matched_candidate_row_ids");
    expect(skill).not.toContain("question_term_evidence");
  });

  it("emits the exact strict handoff shape and fixed disclosures", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("Return one raw JSON object");
    expect(skill).toMatch(/Emit no heading, diagnostic,\s+Markdown fence/u);
    expect(skill).not.toContain("Scout contract:");
    expect(skill).not.toContain("Mode: candidate_discovery");
    expect(skill).not.toContain("```json");
    expect(skill).toContain("one strict JSON object");
    expect(skill).toContain("Set `packet_name` to `gemini_youtube_candidate_handoff`");
    expect(skill).toContain("`packet_version` to\n`2.0`");
    expect(skill).toContain("https://www.youtube.com/watch?v=VIDEO_ID");
    expect(skill).toContain("`provider_metadata_not_validated_by_gemini`");
    expect(skill).toContain("`creator_claims_not_validated`");
    expect(skill).toContain("`provisional_specific_program`");
    expect(skill).toContain("`provisional_population_or_stage`");
    expect(skill).toContain("`provisional_outcome_and_horizon`");
    expect(skill).toContain("spark_public_video_context_not_transcript_verified_by_askrigor");
    expect(skill).toContain("Add no\nother keys");
    expect(skill).toContain("all five\npurposes occur");
    expect(skill).toMatch(/every suggested\s+ID exists among the candidates/u);
  });

  it("documents the one-pass upload and deterministic AskRigor validation path", async () => {
    const setup = await readFile(setupUrl, "utf8");

    expect(setup).toContain("scout-youtube-candidates-for-askrigor");
    expect(setup).toContain("Replace my existing AskRigor YouTube scout");
    expect(setup).toContain("Do not merge it with the old staged contract");
    expect(setup).toContain("old `staged-remedy-scan-v16` contract remains retired");
    expect(setup).toContain("there is no iterative owner-operated probe");
    expect(setup).toContain("npm run validate:gemini-handoff -- path/to/spark-response.md");
    expect(setup).toContain("one raw JSON");
    expect(setup).toContain("v1 packets remain accepted");
    expect(setup).toContain("validateGeminiYoutubeCandidateHandoff");
    expect(setup).toContain("read-only Custom GPT Action");
    expect(setup).toContain("17 expected");
    expect(setup).toContain("does not prove that comment");
    expect(setup).toContain("Do not ask the owner to diagnose or patch the skill");
    expect(setup).toContain("bde36dd81a862cc14696e3ea28ac7cff52acad498ada793b36a80d717fd51e08");
  });
});
