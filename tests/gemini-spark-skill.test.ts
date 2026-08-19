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
    expect(skill).toContain("clickable timestamp deep link");
    expect(skill).toContain(
      "[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s)",
    );
    expect(skill).toContain("Never emit a bare bracketed timestamp");
    expect(skill).toContain("`not located`");
    expect(skill).not.toContain("Do not request or output timestamps");
    expect(skill).toContain("segment cue");
    expect(skill).toContain("exact_outcome_match");
    expect(skill).toContain("adjacent_implementation");
    expect(skill).toContain("independent_patient_self_learning");
    expect(skill).toContain("independent_provider_treatment_review");
    expect(skill).toContain("clinic_patient_testimonial");
    expect(skill).toContain("independence_unclear");
    expect(skill).toContain("firsthand_clinician_self_management");
    expect(skill).toContain("practitioner_reported_case");
    expect(skill).toContain("min(3, ceil(dossier size / 2))");
    expect(skill).toContain("patient-account coverage shortfall");
    expect(skill).toContain("Do not pad, relabel, or invent");
    expect(skill).toContain(
      "\"[condition]\" \"what I learned\" -clinic -hospital -doctor -center",
    );
    expect(skill).toContain(
      "\"how I avoided [surgery]\" \"what worked for me\" \"my routine\"",
    );
    expect(skill).toContain("-\"patient testimonial\"");
    expect(skill).toContain("self-directed learning process");
    expect(skill).toContain("does not count toward the patient quota");
    expect(skill).toContain("Uncertain independence does not count");
    expect(skill).toContain("commercial_or_promotional");
    expect(skill).toContain("creator relationship or incentive");
    expect(skill).toContain("the creator claims");
    expect(skill).toContain("exact query or discovery direction");
    expect(skill).toContain("Run the exact-outcome lane first");
    expect(skill).toContain("zero exact outcome matches");
    expect(skill).toMatch(/Do not let an adjacent tutorial\s+displace/);
    expect(skill).toContain("Only optimize mechanism diversity after");
    expect(skill).toContain("## Final self-check");
    expect(skill).toContain("metadata-validated");
  });

  it("uses a staged browse graph instead of prematurely summarizing a slate", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("seed_discovery");
    expect(skill).toContain("targeted_rediscovery");
    expect(skill).toContain("12 to 20");
    expect(skill).toContain("model_generated_query_probe");
    expect(skill).toContain("search hypothesis, not a discovered remedy");
    expect(skill).toContain("exact_condition");
    expect(skill).toContain("umbrella_condition");
    expect(skill).toContain("anatomy_or_symptom");
    expect(skill).toContain("intervention_first");
    expect(skill).toContain("back-search");
    expect(skill).toContain("Do not quote the whole query");
    expect(skill).toContain("title and metadata triage");
    expect(skill).toContain("Do not produce full video summaries during seed discovery");
    expect(skill).toContain("two or three comment-audit seeds");
    expect(skill).toContain("broad_comment_hub");
    expect(skill).toContain("independent_exact_outcome");
    expect(skill).toContain("contrarian_failure_or_anatomy");
    expect(skill).toContain("provider_reported_comments");
    expect(skill).toContain("AskRigor comment-audit seed packet");
    expect(skill).toContain("youtube_rediscovery_packet");
    expect(skill).toContain("non_identifying_community_wording");
    expect(skill).toContain("suggested_queries");
    expect(skill).toContain("no_material_rediscovery_leads");
    expect(skill).toContain("comment_signal");
    expect(skill).toContain("named_video_or_creator");
    expect(skill).toContain("one discussion pool");
    expect(skill).toContain("hypothesis and vocabulary source");
    expect(skill).not.toContain("How I Grew My Hip Back");
    expect(skill).not.toContain("Dr. Eric Berg");
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
    expect(setup).toContain("manual transfer at each stage");
    expect(setup).toContain(
      "[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s)",
    );
    expect(setup).toContain("independent_patient_self_learning");
    expect(setup).toContain("independent_provider_treatment_review");
    expect(setup).toContain("clinic_patient_testimonial");
    expect(setup).toContain("min(3, ceil(dossier size / 2))");
    expect(setup).toContain("patient-account coverage shortfall");
    expect(setup).toContain("seed_discovery");
    expect(setup).toContain("targeted_rediscovery");
    expect(setup).toContain("AskRigor comment-audit seed packet");
    expect(setup).toContain("youtube_rediscovery_packet");
    expect(setup).toContain("Do not treat the connection test as end-to-end HRP acceptance");
  });
});
