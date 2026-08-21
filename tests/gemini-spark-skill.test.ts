import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const skillUrl = new URL(
  "../integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
  import.meta.url,
);
const setupUrl = new URL("../docs/gemini-spark-setup.md", import.meta.url);

describe("Gemini Spark AskRigor skill", () => {
  it("pins the clean-uploaded bytes and compact upload surface", async () => {
    const skill = await readFile(skillUrl, "utf8");
    const longestLine = Math.max(...skill.split(/\r?\n/u).map((line) => line.length));
    const sha256 = createHash("sha256").update(skill).digest("hex");

    expect(longestLine).toBeLessThanOrEqual(800);
    expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(36_000);
    expect(sha256).toBe("da64098a21da7bdcb12558958c5ad7699faa85ff4bb1c8613ec629761783202c");
  });

  it("keeps Gemini in the bounded YouTube scout role", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("name: scout-youtube-for-askrigor-staged");
    expect(skill).toContain("broad YouTube discovery");
    expect(skill).toContain("creator-content scans of the shortlisted candidates");
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
    expect(skill).toContain("14 to 22");
    expect(skill).toContain("model_generated_query_probe");
    expect(skill).toContain("search hypothesis, not a discovered remedy");
    expect(skill).toContain("exact_condition");
    expect(skill).toContain("umbrella_condition");
    expect(skill).toContain("anatomy_or_symptom");
    expect(skill).toContain("intervention_first");
    expect(skill).toContain("back-search");
    expect(skill).toContain("Do not quote the whole query");
    expect(skill).toContain("title, metadata, and lightweight content triage");
    expect(skill).toContain("remedy_extraction_scan");
    expect(skill).toContain("8 to 12");
    expect(skill).toContain("before selecting comment-audit seeds");
    expect(skill).toContain("specific_interventions");
    expect(skill).toContain("creator_claimed_mechanism");
    expect(skill).toContain("claimed_outcome_and_horizon");
    expect(skill).toContain("firsthand_or_practitioner");
    expect(skill).toContain("novel_search_vocabulary");
    expect(skill).toContain("discussion_hub_value");
    expect(skill).toContain("Search each promising intervention name individually");
    expect(skill).toContain("Do not produce full video summaries during seed discovery");
    expect(skill).toContain("two or three comment-audit seeds");
    expect(skill).toContain("heterodox_natural_hub");
    expect(skill).toContain("conventional_benefit_failure_hub");
    expect(skill).toContain("local_mechanical_hub");
    expect(skill).toContain("independent_exact_outcome");
    expect(skill).toContain("firsthand_clinician_self_management");
    expect(skill).toContain("contrarian_failure_or_anatomy");
    expect(skill).toContain("provider_reported_views");
    expect(skill).toContain("provider_reported_likes");
    expect(skill).toContain("provider_reported_comments");
    expect(skill).toContain("AskRigor comment-audit seed packet");
    expect(skill).toContain("youtube_rediscovery_packet");
    expect(skill).toContain("requested_askrigor_return_schema");
    expect(skill).toContain("AskRigor_after_protocol_governed_comment_audit");
    expect(skill).toContain("Never emit a live `youtube_rediscovery_packet:`");
    expect(skill).toContain("cannot be relabeled as community wording");
    expect(skill).toContain("reach breaks ties only and is not evidence");
    expect(skill).toContain("metadata access boundary");
    expect(skill).not.toContain("this requested return shape");
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

  it("self-identifies the staged contract before any report content", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("Scout contract: staged-remedy-scan-v15");
    expect(skill).not.toContain("Scout contract: staged-remedy-scan-v14");
    expect(skill).toContain("Mode: seed_discovery");
    expect(skill).toContain("Mode: targeted_rediscovery");
    expect(skill).toMatch(/Begin every response, before any heading or prose/);
    expect(skill).toMatch(/Never omit, paraphrase,\s+or move either diagnostic line/);
    expect(skill).toContain("ordinary Markdown text link");
    expect(skill).toContain("Never insert or attach a YouTube embed");
    expect(skill).toContain("standalone bare YouTube URL");
    expect(skill).toContain("do not append raw search-result panels");
    expect(skill).toContain("displayed outside the response is not controllable");
  });

  it("expands terse prompts and exposes evidence-neutral deepening choices", async () => {
    const skill = await readFile(skillUrl, "utf8");

    expect(skill).toContain("how can I fix my bad hip");
    expect(skill).toContain("diagnosis_not");
    expect(skill).toContain("overlooked_self_directed");
    expect(skill).toContain("conventional_real_world_feedback");
    expect(skill).toContain("successful_with_candidates");
    expect(skill).toContain("exhausted_zero_results");
    expect(skill).toContain("failed_or_unavailable");
    expect(skill).toContain("rebuild/rebuilt [anatomy]");
    expect(skill).toContain("regrow/regrew [joint/cartilage]");
    expect(skill).toContain("Display every scanned candidate");
    expect(skill).toContain("rabbit-hole map");
    expect(skill).toContain("retrieval_depth");
    expect(skill).toContain("dig into side-effect signal");
    expect(skill).toContain("dig into nutrition signal");
    expect(skill).toContain("dig into conventional-treatment feedback");
    expect(skill).toContain("not evidence quality");
    expect(skill).toContain("Seed roles and families must both be unique");
    expect(skill).toContain("Freeze and record each `model_generated_query_probe`");
    expect(skill).toContain("never backfill a published title or creator name");
    expect(skill).toContain("When `diagnosis_not specified`");
    expect(skill).toContain("diagnosis, structural state, or procedure");
    expect(skill).toContain("Include two to four separate `radical_outcome` probes");
    expect(skill).toContain("for example `\"growing my hip back\"`");
    expect(skill).toContain("For every probe, record one to three literal");
    expect(skill).toContain("grow/growing/grew [anatomy] back");
    expect(skill).toContain("A harm-only candidate cannot fill this role");
    expect(skill).toContain("audit_selection_rationale");
    expect(skill).toContain("comments uninspected");
    expect(skill).toContain("Never predict comment contents");
    expect(skill).toContain("candidate_row_ids");
    expect(skill).toContain("creator count computed from those rows");
    expect(skill).toContain("Never introduce a term, count, creator, or intervention absent from the cited rows");
    expect(skill).toContain("nutrition: `dig into nutrition signal`");
    expect(skill).toContain("the only permitted code block");
    expect(skill).toContain("six to twelve executed `discovery_batch` searches");
    expect(skill).toContain("Assign exactly one closed `probe_family`");
    expect(skill).toContain("at most three probes");
    expect(skill).toContain("one `probe_family` per batch");
    expect(skill).toContain("`radical_outcome`");
    expect(skill).toContain("`required_batch_anchors`");
    expect(skill).toContain("`anchor_coverage: pass | fail`");
    expect(skill).toContain("found in both its frozen query and the batch query");
    expect(skill).toContain("`batch_anchor_evidence`");
    expect(skill).not.toContain("Every probe, not only radical probes");
    expect(skill).not.toContain("never use `none` or `n/a`");
    expect(skill).toContain("Set `probe_granularity` to `single_intervention`");
    expect(skill).toContain("one bundled `OR` query counts as one probe");
    expect(skill).toContain("only when a probe in that family has passing batch coverage");
    expect(skill).toContain("never separate treatments");
    expect(skill).toContain("matched_candidate_row_ids");
    expect(skill).toContain("adjacent_candidate_row_ids");
    expect(skill).toContain("`claim_alignment: direct | adjacent_only | none`");
    expect(skill).toContain("`radical_claim_evidence: candidate_field -> exact creator-claim phrase`");
    expect(skill).toContain("rapid relief, temporary decompression");
    expect(skill).toContain("`overlooked_intervention_family_count`");
    expect(skill).toContain("outcome and conventional families do not count");
    expect(skill).toContain("`conventional_benefit_probe_count`");
    expect(skill).toContain("`conventional_negative_probe_count`");
    expect(skill).toContain("three conventional-negative rows");
    expect(skill).toContain("counting only rows with passing batch coverage");
    expect(skill).toContain("`independent_firsthand_probe_count`");
    expect(skill).toContain("three separately anchored `firsthand_outcome` rows");
    expect(skill).toContain("scanned fields directly support the searched claim");
    expect(skill).toContain("search-batch ledger");
    expect(skill).toContain("Complete broad triage before content inspection");
    expect(skill).toContain("Inspect content once for each shortlisted candidate");
    expect(skill).toContain("no more than 12 inspected");
    expect(skill).not.toContain("Do not invoke native YouTube search");
    expect(skill).not.toContain("attach YouTube entities");
    expect(skill).not.toContain("site:youtube.com/watch");
    expect(skill).toContain("Assign every candidate and seed exactly one canonical `intervention_family`");
    expect(skill).toContain("Never use a `probe_family` value here");
    expect(skill).toContain("Seed roles and families must both be unique");
    expect(skill).toContain("exercise, stretching, somatics, fascial work, loading, traction, gait, and cyclic motion");
    expect(skill).toContain("Never relabel to manufacture diversity");
    expect(skill).toContain("exercise alone cannot fill it");
    expect(skill).toContain("does not explicitly request surgery, prefer an independent self-directed nonsurgical outcome");
    expect(skill).toContain("cannot fill an unlocated independent-patient role");
    expect(skill).toContain("never a table");
    expect(skill).toContain("plain titles fail");
    expect(skill).toContain("A link is valid only if its literal Markdown contains");
    expect(skill).toContain("`remedy_extraction_scan_count`");
    expect(skill).toContain("`displayed_candidate_row_count`");
    expect(skill).toContain("numbered row IDs must be contiguous");
    expect(skill).toContain("Give every row a `video_identifier`");
    expect(skill).toContain("at or below 110 words");
    expect(skill).toContain("mechanism confirmation");
    expect(skill).toContain("what proportion");
    expect(skill).toContain("source_seed_row_ids");
    expect(skill).toContain("question_term_evidence");
    expect(skill).toContain("research_question_term_evidence");
    expect(skill).toContain("`unmapped_question_terms: none`");
    expect(skill).toContain("Run a literal banned-phrase scan");
    expect(skill).toContain("`response rate`");
    expect(skill).toContain("`measurable improvement`");
    expect(skill).toContain("Never use `e.g.` or `such as` unless every example is mapped");
    expect(skill).toContain("source_candidate_row_id");
    expect(skill).toContain("how common/commonly");
    expect(skill).toContain("Build `question_term_evidence` or `research_question_term_evidence` before drafting each question");
    expect(skill).toContain("the exact phrase must occur in that field");
    expect(skill).toContain("if any remain, remove or repair them");
    expect(skill).toContain("citing selected seeds only");
    expect(skill).not.toContain("compose the question using only those exact keys");
    expect(skill).not.toContain("Never invent a plausible concrete detail absent from the map");
    expect(skill).toContain("promote a worthwhile nonseed or omit its question");
    expect(skill).toContain("how many");
    expect(skill).toContain("verification, corroboration");
    expect(skill).toContain("verbatim `term_evidence` mappings");
    expect(skill).toContain("term_evidence");
    expect(skill).toContain("row_relevance");
    expect(skill).toContain("All cited rows must share the direction's exact canonical `intervention_family`");
    expect(skill).toContain("auditability");
    expect(skill).toContain("future_seed_candidate");
    expect(skill).toContain("scouting_access_gaps");
    expect(skill).toContain("research_questions_for_askrigor");
    expect(skill).toContain("not assertions about missing trials, imaging, verification, peer support, or evidence");
    expect(skill).toContain("Use only this closed `semantic_scope` enum");
    expect(skill).toContain("Never write `adjacent` or `remote` as `semantic_scope`");
    expect(skill).toContain("target_distance");
    expect(skill).toContain("`recognized_benefit_or_indication`");
    expect(skill).toContain("`real_world_limitation`");
    expect(skill).toContain("Repeat both in its seed record");
    expect(skill).toContain("one `next_work`, one exact-family shortcut");
    expect(skill).toContain("`dig into topical signal`");
    expect(skill).toContain("`dig into device signal`");
    expect(skill).toContain("`dig into regenerative signal`");
    expect(skill).toContain("once after the map, never as one direction's shortcut");
    expect(skill).toContain("parallel_handoff_note");
    expect(skill).toContain("Never instruct AskRigor to wait");
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
    expect(setup).toContain("scout-youtube-for-askrigor-staged");
    expect(setup).toContain("Scout contract: staged-remedy-scan-v15");
    expect(setup).toContain("complete broad result discovery before it inspects video\ncontent");
    expect(setup).toContain("how can I fix my bad hip");
    expect(setup).toContain("rabbit-hole map");
    expect(setup).toMatch(/unpopulated\s+return contract/);
    expect(setup).toContain("does not execute HRP");
    expect(setup).toContain("manual transfer at each stage");
    expect(setup).toContain("parallel high-recall lane");
    expect(setup).toContain("user remains the cross-app scheduler");
    expect(setup).toContain("the returned search-batch ledger includes `batch_anchor_evidence`");
    expect(setup).toContain("da64098a21da7bdcb12558958c5ad7699faa85ff4bb1c8613ec629761783202c");
    expect(setup).toContain("Question evidence maps are built before the questions");
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
    expect(setup).toContain("remedy_extraction_scan");
    expect(setup).toContain("title, metadata, and lightweight content triage");
    expect(setup).toContain("Do not treat the connection test as end-to-end HRP acceptance");
  });
});
