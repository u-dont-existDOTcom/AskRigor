import { createHash } from "node:crypto";

import type { YoutubeTranscriptEnvelope } from "@askrigor/sources";
import { describe, expect, it } from "vitest";

import {
  assessTreatmentLandscapeCoverage,
  createActionOnlyResearchRoutes,
  createTreatmentLandscapeCoverageActionRoute,
  createYoutubeTranscriptActionRoute,
  PROGRAM_NOT_DESCRIBED,
  projectDiscussionCoverageReceipt,
  projectTranscriptCoverageReceipt,
  youtubeTranscriptActionOutputSchema,
  type TreatmentLandscapeCoverageInput
} from "../apps/research-mcp/src/index.js";
import type { YoutubeVideoCommunityAuditOutput } from
  "../apps/research-mcp/src/youtube-video-community-audit.js";

const classSpecs = [
  ["strength", "Progressive resistance training", "progressive resistance training"],
  ["aquatic", "Aquatic exercise", "deep water interval walking"],
  ["nutrition", "Nutritional approach", "ketogenic carbohydrate restriction"],
  ["injection", "Injection procedure", "platelet rich plasma injection"],
  ["multimodal", "Multimodal conservative program", "education paced loading coaching"],
  ["surgery", "Surgery and recovery", "total joint replacement"]
] as const;

const completeInput = (): TreatmentLandscapeCoverageInput => {
  const treatmentClasses = classSpecs.map(([id, label]) => treatmentClass(id, label));
  const fingerprints = classSpecs.map(([id, , implementation]) =>
    fingerprint(`fp-${id}`, id, implementation)
  );
  const candidates = classSpecs.flatMap(([id], classIndex) =>
    Array.from({ length: 4 }, (_, candidateIndex) => candidateVideo({
      videoId: `v-${id}-${candidateIndex}`,
      classId: id,
      fingerprintId: `fp-${id}`,
      batchId: `batch-${id}`,
      channelId: `UC-${classIndex}-${candidateIndex}`,
      selected: candidateIndex === 0 || (classIndex < 2 && candidateIndex === 1)
    }))
  );
  const sparkVideo = candidates[0]!;
  const spark = sparkFrontier([sparkVideo.video_id]);
  return {
    research_target: "Compare materially different care approaches",
    broad_treatment_choice: true,
    substantial_youtube_corpus: "yes",
    discovery_batches: classSpecs.map(([id, , implementation], index) => ({
      batch_id: `batch-${id}`,
      query_or_scope: `Search ${implementation} outcomes, failures, and harms`,
      treatment_class_ids: [id],
      access_status: "api_visible_complete",
      pagination: { exhausted: true, next_cursor_present: false },
      candidate_video_ids: candidates
        .filter(({ treatment_class_id }) => treatment_class_id === id)
        .map(({ video_id }) => video_id),
      new_program_fingerprint_ids: index === classSpecs.length - 1 ? [] : [`fp-${id}`]
    })),
    specific_implementation_searches: classSpecs.map(([id, , implementation]) => ({
      search_id: `specific-${id}`,
      discovery_batch_id: `batch-${id}`,
      treatment_class_id: id,
      implementation_terms: [implementation],
      discriminator_terms: ["outcomes"],
      candidate_video_ids: candidates
        .filter(({ treatment_class_id }) => treatment_class_id === id)
        .map(({ video_id }) => video_id),
      result_status: "specific_candidates_found" as const
    })),
    treatment_classes: treatmentClasses,
    program_fingerprints: fingerprints,
    candidate_videos: candidates,
    external_scout_frontiers: [spark],
    external_scout_candidates: [{
      frontier_digest: spark.frontier_digest,
      source: "gemini_spark",
      video_id: sparkVideo.video_id,
      materiality: "material",
      redundancy: "distinct",
      screening_status: "screened",
      fingerprint_id: sparkVideo.fingerprint_id,
      omission_impact: "uncertain",
      omission_rationale: "The validated Spark lead was screened into the ordinary ledger."
    }],
    selected_videos: candidates
      .filter(({ selection_status }) => selection_status === "selected")
      .map(({ video_id, fingerprint_id, channel_id }) =>
        selectedVideo(video_id, fingerprint_id, channel_id)
      ),
    further_expansion_likely_to_improve_answer: "no",
    directional_searches: {
      benefit: directionalComplete(),
      no_effect_or_failure: directionalComplete(),
      harm: directionalComplete(),
      discontinuation: directionalComplete(),
      eventual_standard_treatment: directionalComplete()
    },
    access_boundaries: []
  };
};

describe("treatment-landscape coverage Action", () => {
  it("is a public read-only Action and remains outside the frozen MCP registry", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as {
      RESEARCH_OPERATIONS: readonly { name: string }[];
    };
    const routes = createActionOnlyResearchRoutes();
    const route = routes.find(({ operationId }) =>
      operationId === "assess_treatment_landscape_coverage"
    );

    expect(routes).toHaveLength(8);
    expect(route).toMatchObject({
      method: "POST",
      path: "/actions/research/assess_treatment_landscape_coverage",
      operationId: "assess_treatment_landscape_coverage",
      consequential: false,
      public: true,
      publicResearch: true,
      maximumRequestBytes: 65_536,
      maximumResponseBytes: 60_000
    });
    expect(module.RESEARCH_OPERATIONS.map(({ name }) => name))
      .not.toContain("assess_treatment_landscape_coverage");
  });

  it("passes only a receipt-linked, internally consistent diverse ledger", () => {
    const result = assessTreatmentLandscapeCoverage(completeInput());

    expect(result).toMatchObject({
      coverage_claim: "ledger_consistency_only",
      treatment_classes_discovered: 6,
      materially_distinct_program_fingerprints: 6,
      candidate_videos_screened: 24,
      external_scout_candidates_screened: 1,
      external_scout_candidates_pending: [],
      broad_structural_minimums_applied: true,
      broad_structural_minimums_met: true,
      material_videos_selected: 8,
      material_videos_fully_audited: 8,
      materially_distinct_programs_fully_audited: 6,
      independent_channels_or_pools: 8,
      selection_coverage_lock: "pass",
      per_video_depth_lock: "pass",
      synthesis_lock: "pass",
      answer_boundary: "ledger_consistent_for_synthesis",
      blockers: []
    });
    expect(result.planning_warnings.join(" ")).not.toContain("8-15");
    expect(result.videos_actually_audited[0]).toMatchObject({
      canonical_url: "https://www.youtube.com/watch?v=v-strength-0",
      channel_id: "UC-0-0",
      program_fields_not_described: [],
      transcript_access_status: "api_visible_complete",
      transcript_is_auto_generated: false,
      discussion_access_status: "api_visible_complete",
      discussion_synthesis_lock: "pass"
    });
  });

  it("does not let a screened nonmaterial unspecified program invalidate material coverage", () => {
    const input = completeInput();
    const batch = input.discovery_batches[0]!;
    const classId = "screened-irrelevant";
    const fingerprintId = "fp-screened-irrelevant";
    const videoId = "v-screened-irrelevant";
    input.treatment_classes.push({
      ...treatmentClass(classId, "Screened irrelevant mention"),
      materiality: "not_material",
      formal_follow_up: "support_not_located",
      omission_impact: "not_decision_relevant",
      omission_rationale: "Semantic screening found no decision-relevant treatment program."
    });
    input.program_fingerprints.push({
      ...fingerprint(fingerprintId, classId, PROGRAM_NOT_DESCRIBED),
      materiality: "not_material",
      formal_follow_up: "support_not_located",
      omission_impact: "not_decision_relevant",
      omission_rationale: "The source was screened and did not describe a material program."
    });
    input.candidate_videos.push(candidateVideo({
      videoId,
      classId,
      fingerprintId,
      batchId: batch.batch_id,
      channelId: "UC-screened-irrelevant",
      selected: false,
      materiality: "not_material"
    }));
    batch.treatment_class_ids.push(classId);
    batch.candidate_video_ids.push(videoId);
    batch.new_program_fingerprint_ids.push(fingerprintId);

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.selection_coverage_lock).toBe("pass");
    expect(result.synthesis_lock).toBe("pass");
    expect(result.invalid_record_ids.program_fingerprints).not.toContain(fingerprintId);
  });

  it("blocks a broad substantial audit when the required Spark frontier is absent", () => {
    const input = completeInput();
    input.external_scout_frontiers = [];
    input.external_scout_candidates = [];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.selection_blockers.join(" ")).toContain(
      "validated Gemini Spark candidate frontier"
    );
  });

  it("does not count a selected video toward the structural minimum until both audits finish", () => {
    const input = completeInput();
    const video = input.selected_videos[0]!;
    video.transcript_receipt = {
      ...video.transcript_receipt,
      access_status: "partial",
      pagination: {
        ...video.transcript_receipt.pagination,
        exhausted: false,
        next_cursor_present: true
      }
    };

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.material_videos_selected).toBe(8);
    expect(result.material_videos_fully_audited).toBe(7);
    expect(result.broad_structural_minimums_applied).toBe(true);
    expect(result.broad_structural_minimums_met).toBe(false);
    expect(result.synthesis_lock).toBe("block");
  });

  it("blocks four audited videos even when they span four distinct programs", () => {
    const input = completeInput();
    const selectedIds = new Set(classSpecs.slice(0, 4).map(([id]) => `v-${id}-0`));
    input.candidate_videos = input.candidate_videos.map((candidate) => ({
      ...candidate,
      selection_status: selectedIds.has(candidate.video_id)
        ? "selected" as const
        : "screened_not_selected" as const
    }));
    input.selected_videos = input.selected_videos.filter(({ video_id }) =>
      selectedIds.has(video_id)
    );

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.material_videos_fully_audited).toBe(4);
    expect(result.materially_distinct_program_fingerprints).toBe(6);
    expect(result.synthesis_lock).toBe("block");
    expect(result.broad_structural_minimums_applied).toBe(true);
    expect(result.broad_structural_minimums_met).toBe(false);
  });

  it("blocks six audited videos when eight material candidates are available", () => {
    const input = completeInput();
    const selectedIds = new Set(classSpecs.map(([id]) => `v-${id}-0`));
    input.candidate_videos = input.candidate_videos.map((candidate) => ({
      ...candidate,
      selection_status: selectedIds.has(candidate.video_id)
        ? "selected" as const
        : "screened_not_selected" as const
    }));
    input.selected_videos = input.selected_videos.filter(({ video_id }) =>
      selectedIds.has(video_id)
    );

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.material_videos_fully_audited).toBe(6);
    expect(result.synthesis_lock).toBe("block");
    expect(result.broad_structural_minimums_met).toBe(false);
    expect(result.selection_blockers.join(" ")).toContain(
      "selecting at least eight material videos for full audit"
    );
  });

  it("blocks every condition when an umbrella class has not completed specific-program discovery", () => {
    const input = completeInput();
    input.research_target = "Compare care for any condition";
    input.specific_implementation_searches = input.specific_implementation_searches
      .filter(({ treatment_class_id }) => treatment_class_id !== "strength");

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.uncovered_material_treatment_classes).toContain("strength");
    expect(result.selection_blockers.join(" ")).toContain("specific-program discovery");
  });

  it("blocks a validated material Spark candidate until it is screened", () => {
    const input = completeInput();
    input.external_scout_frontiers = [sparkFrontier(["spark-candidate"])];
    input.external_scout_candidates = [{
      frontier_digest: input.external_scout_frontiers[0]!.frontier_digest,
      source: "gemini_spark",
      video_id: "spark-candidate",
      materiality: "material",
      redundancy: "distinct",
      screening_status: "unscreened",
      omission_impact: "uncertain",
      omission_rationale: "The lead may add a distinct program."
    }];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.external_scout_candidates_pending).toEqual(["spark-candidate"]);
    expect(result.selection_blockers.join(" ")).toContain("remains unscreened");
  });

  it("does not let materiality or duplicate labels waive Spark screening", () => {
    const input = completeInput();
    input.external_scout_frontiers = [sparkFrontier(["spark-candidate"])];
    input.external_scout_candidates = [{
      frontier_digest: input.external_scout_frontiers[0]!.frontier_digest,
      source: "gemini_spark",
      video_id: "spark-candidate",
      materiality: "not_material",
      redundancy: "duplicate",
      screening_status: "unscreened",
      omission_impact: "not_decision_relevant",
      omission_rationale: "Caller claims the lead is redundant."
    }];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.selection_blockers.join(" ")).toContain(
      "materiality and redundancy cannot waive screening"
    );
  });

  it("blocks when any identity-validated Spark candidate is omitted from reconciliation", () => {
    const input = completeInput();
    const video = input.candidate_videos[0]!;
    input.external_scout_frontiers = [sparkFrontier([
      video.video_id,
      "omitted-scout"
    ])];
    input.external_scout_candidates = [{
      frontier_digest: input.external_scout_frontiers[0]!.frontier_digest,
      source: "gemini_spark",
      video_id: video.video_id,
      materiality: "material",
      redundancy: "distinct",
      screening_status: "screened",
      fingerprint_id: video.fingerprint_id,
      omission_impact: "uncertain",
      omission_rationale: "The lead was reconciled with a material candidate."
    }];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.selection_blockers.join(" ")).toContain(
      "omitted-scout is missing from its complete frontier reconciliation"
    );
  });

  it("blocks an unresolved identity-validation result carried by the Spark frontier", () => {
    const input = completeInput();
    input.external_scout_frontiers = [sparkFrontier([], ["retryable-scout"])];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.selection_blockers.join(" ")).toContain(
      "retryable-scout has an unresolved identity-validation result"
    );
  });

  it("reconciles a screened Spark lead with the ordinary candidate ledger", () => {
    const input = completeInput();
    const video = input.candidate_videos[0]!;
    input.external_scout_frontiers = [sparkFrontier([video.video_id])];
    input.external_scout_candidates = [{
      frontier_digest: input.external_scout_frontiers[0]!.frontier_digest,
      source: "gemini_spark",
      video_id: video.video_id,
      materiality: "material",
      redundancy: "distinct",
      screening_status: "screened",
      fingerprint_id: video.fingerprint_id,
      omission_impact: "uncertain",
      omission_rationale: "The lead was reconciled with a material candidate."
    }];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("pass");
    expect(result.external_scout_candidates_screened).toBe(1);
    expect(result.external_scout_candidates_pending).toEqual([]);
  });

  it("rejects a false zero-result claim when a specific candidate is linked", () => {
    const input = completeInput();
    input.specific_implementation_searches[0]!.result_status =
      "exhausted_zero_results";

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.selection_blockers.join(" ")).toContain(
      "claims exhausted zero results while its own candidate list is nonempty"
    );
  });

  it("does not let an unrelated same-class candidate close a named implementation search", () => {
    const input = completeInput();
    input.specific_implementation_searches[0]!.implementation_terms = ["eccentric loading"];
    input.discovery_batches[0]!.query_or_scope =
      "Search eccentric loading outcomes, failures, and harms";

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.invalid_record_ids.specific_implementation_searches)
      .toContain("specific-strength");
    expect(result.selection_blockers.join(" ")).toContain(
      "described program matches"
    );
  });

  it("does not mistake a stage field for a named implementation", () => {
    const input = completeInput();
    input.specific_implementation_searches[0]!.implementation_terms = ["baseline reported"];
    input.specific_implementation_searches[0]!.discriminator_terms = ["outcomes"];
    input.discovery_batches[0]!.query_or_scope =
      "Search baseline reported outcomes, failures, and harms";

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.invalid_record_ids.specific_implementation_searches)
      .toContain("specific-strength");
    expect(result.selection_blockers.join(" ")).toContain(
      "described program matches"
    );
  });

  it("rejects a generic outcome label supplied as an implementation term", () => {
    const input = completeInput();
    input.specific_implementation_searches[0]!.implementation_terms = ["function"];
    input.discovery_batches[0]!.query_or_scope =
      "Search function outcomes, failures, and harms";

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.invalid_record_ids.specific_implementation_searches)
      .toContain("specific-strength");
    expect(result.selection_blockers.join(" ")).toContain(
      "distinct non-generic terms"
    );
  });

  it.each([
    "program", "program!", "specific program", "specific program.",
    "home exercise program", "care management"
  ])(
    "rejects generic implementation placeholder %s",
    (placeholder) => {
      const input = completeInput();
      input.specific_implementation_searches[0]!.implementation_terms = [placeholder];
      input.discovery_batches[0]!.query_or_scope =
        `Search ${placeholder} outcomes, failures, and harms`;

      const result = assessTreatmentLandscapeCoverage(input);

      expect(result.synthesis_lock).toBe("block");
      expect(result.invalid_record_ids.specific_implementation_searches)
        .toContain("specific-strength");
      expect(result.selection_blockers.join(" ")).toContain(
        "distinct non-generic terms"
      );
    }
  );

  it("treats punctuation variants as duplicate implementation and discriminator terms", () => {
    const input = completeInput();
    input.specific_implementation_searches[0]!.implementation_terms = [
      "progressive resistance training"
    ];
    input.specific_implementation_searches[0]!.discriminator_terms = [
      "progressive resistance training!"
    ];
    input.discovery_batches[0]!.query_or_scope =
      "Search progressive resistance training outcomes, failures, and harms";

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.invalid_record_ids.specific_implementation_searches)
      .toContain("specific-strength");
    expect(result.selection_blockers.join(" ")).toContain(
      "distinct non-generic terms"
    );
  });

  it("requires each search candidate to link reciprocally to its batch and class", () => {
    const input = completeInput();
    input.specific_implementation_searches[0]!.candidate_video_ids = [
      input.candidate_videos.find(({ treatment_class_id }) =>
        treatment_class_id === "aquatic"
      )!.video_id
    ];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.invalid_record_ids.specific_implementation_searches)
      .toContain("specific-strength");
    expect(result.selection_blockers.join(" ")).toContain(
      "nonreciprocal candidate links"
    );
  });

  it("does not accept an umbrella-only query as specific-program discovery", () => {
    const input = completeInput();
    input.discovery_batches[0]!.query_or_scope = "Search exercise outcomes";
    input.specific_implementation_searches[0]!.implementation_terms = ["exercise"];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.invalid_record_ids.specific_implementation_searches)
      .toContain("specific-strength");
    expect(result.selection_blockers.join(" ")).toContain(
      "non-generic terms reciprocally present"
    );
  });

  it("excludes an unreconciled screened scout from aggregate counts", () => {
    const input = completeInput();
    input.external_scout_frontiers = [sparkFrontier(["unlinked-scout"])];
    input.external_scout_candidates = [{
      frontier_digest: input.external_scout_frontiers[0]!.frontier_digest,
      source: "gemini_spark",
      video_id: "unlinked-scout",
      materiality: "material",
      redundancy: "distinct",
      screening_status: "screened",
      fingerprint_id: "fp-strength",
      omission_impact: "uncertain",
      omission_rationale: "The lead may add a distinct program."
    }];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.synthesis_lock).toBe("block");
    expect(result.external_scout_candidates_screened).toBe(0);
    expect(result.invalid_record_ids.external_scout_candidates).toEqual(["unlinked-scout"]);
  });

  it("derives diversity from normalized program contents, not caller IDs", () => {
    const input = completeInput();
    const first = input.program_fingerprints[0]!;
    input.program_fingerprints = input.program_fingerprints.map((entry) => ({
      ...entry,
      components: first.components,
      dose_or_intensity: first.dose_or_intensity,
      frequency: first.frequency,
      duration: first.duration,
      supervision: first.supervision,
      adherence_or_fidelity: first.adherence_or_fidelity,
      cointerventions: first.cointerventions,
      stage_or_baseline: first.stage_or_baseline,
      outcome: first.outcome,
      horizon: first.horizon,
      care_stage: first.care_stage
    }));
    input.candidate_videos = input.candidate_videos.map((candidate) => ({
      ...candidate,
      channel_id: "UC-SAME"
    }));
    input.selected_videos = input.selected_videos.map((video) => ({
      ...video,
      discussion_receipt: {
        ...video.discussion_receipt,
        channel_id: "UC-SAME"
      }
    }));
    input.specific_implementation_searches = input.specific_implementation_searches
      .map((search) => ({
        ...search,
        implementation_terms: ["progressive resistance training"]
      }));
    input.discovery_batches = input.discovery_batches.map((batch) => ({
      ...batch,
      query_or_scope: "Search progressive resistance training outcomes, failures, and harms"
    }));

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.materially_distinct_program_fingerprints).toBe(1);
    expect(result.independent_channels_or_pools).toBe(1);
    expect(result.selection_coverage_lock).toBe("block");
    expect(result.redundancy_flags.join(" ")).toContain("same normalized program");
    expect(result.selection_blockers.join(" ")).toContain("independent channels");
  });

  it("cannot turn a claimed aggregate screen count into broad coverage", () => {
    const input = completeInput();
    input.broad_treatment_choice = false;
    input.substantial_youtube_corpus = "no";
    const retainedClass = input.treatment_classes[0]!;
    const retainedFingerprint = input.program_fingerprints[0]!;
    input.treatment_classes = [retainedClass];
    input.program_fingerprints = [retainedFingerprint];
    input.candidate_videos = Array.from({ length: 20 }, (_, index) => candidateVideo({
      videoId: `one-class-${index}`,
      classId: retainedClass.class_id,
      fingerprintId: retainedFingerprint.fingerprint_id,
      batchId: "one-class-batch",
      channelId: `UC-ONE-${index}`,
      selected: index === 0
    }));
    input.discovery_batches = [{
      batch_id: "one-class-batch",
      query_or_scope: "Only strengthening was searched",
      treatment_class_ids: [retainedClass.class_id],
      access_status: "api_visible_complete",
      pagination: { exhausted: true, next_cursor_present: false },
      candidate_video_ids: input.candidate_videos.map(({ video_id }) => video_id),
      new_program_fingerprint_ids: []
    }];
    input.selected_videos = [{
      ...selectedVideo(
        input.candidate_videos[0]!.video_id, retainedFingerprint.fingerprint_id
      ),
      discussion_receipt: projectDiscussionCoverageReceipt(
        communityAuditOutput(
          input.candidate_videos[0]!.video_id,
          input.candidate_videos[0]!.channel_id
        )
      )
    }];

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.candidate_videos_screened).toBe(20);
    expect(result.selection_coverage_lock).toBe("block");
    expect(result.selection_blockers.join(" ")).toContain("Two or three videos");
    expect(result.selection_blockers.join(" ")).toContain(
      "caller labels cannot waive structural coverage"
    );
  });

  it("blocks four selected videos that repeat one program across typed channels", () => {
    const input = completeInput();
    input.broad_treatment_choice = false;
    input.substantial_youtube_corpus = "unknown";
    const retainedClass = input.treatment_classes[0]!;
    const retainedFingerprint = input.program_fingerprints[0]!;
    input.treatment_classes = [retainedClass];
    input.program_fingerprints = [retainedFingerprint];
    input.candidate_videos = Array.from({ length: 4 }, (_, index) => candidateVideo({
      videoId: `repeat-${index}`,
      classId: retainedClass.class_id,
      fingerprintId: retainedFingerprint.fingerprint_id,
      batchId: "repeat-batch",
      channelId: `UC-REPEAT-${index}`,
      selected: true
    }));
    input.discovery_batches = [{
      batch_id: "repeat-batch",
      query_or_scope: "Four channels repeating one program",
      treatment_class_ids: [retainedClass.class_id],
      access_status: "api_visible_complete",
      pagination: { exhausted: true, next_cursor_present: false },
      candidate_video_ids: input.candidate_videos.map(({ video_id }) => video_id),
      new_program_fingerprint_ids: []
    }];
    input.selected_videos = input.candidate_videos.map((candidate) => ({
      ...selectedVideo(candidate.video_id, candidate.fingerprint_id),
      discussion_receipt: projectDiscussionCoverageReceipt(
        communityAuditOutput(candidate.video_id, candidate.channel_id)
      )
    }));

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.material_videos_fully_audited).toBe(4);
    expect(result.materially_distinct_program_fingerprints).toBe(1);
    expect(result.selection_coverage_lock).toBe("block");
    expect(result.selection_blockers.join(" ")).toContain(
      "concentrated in one or two program fingerprints"
    );
    expect(result.planning_warnings.join(" ")).toContain(
      "narrow-scope label was ignored"
    );
  });

  it("normalizes every supported spelling of the missing-program sentinel", () => {
    for (const missing of [
      PROGRAM_NOT_DESCRIBED, "program_not_described", "PROGRAM-NOT-DESCRIBED",
      " program   not described "
    ]) {
      const input = completeInput();
      input.program_fingerprints[0] = {
        ...input.program_fingerprints[0]!,
        components: missing
      };
      const result = assessTreatmentLandscapeCoverage(input);
      expect(result.invalid_record_ids.program_fingerprints).toContain("fp-strength");
      expect(result.materially_distinct_program_fingerprints).toBe(5);
      expect(result.selection_coverage_lock).toBe("block");
    }
  });

  it("treats retryable boundaries as unfinished work, not bounded completion", () => {
    const input = completeInput();
    const video = input.selected_videos[0]!;
    input.access_boundaries = [accessBoundary({
      id: "discussion-rate-limit",
      scopeType: "video_discussion",
      scopeId: video.video_id,
      status: "rate_limited",
      terminal: false,
      retryable: true
    })];
    video.discussion_receipt = {
      ...video.discussion_receipt,
      access_status: "rate_limited",
      extraction_coverage: "completed_with_access_boundary",
      error_retryable: true,
      access_boundary_id: "discussion-rate-limit",
      receipt: {
        ...video.discussion_receipt.receipt,
        completion_state: "completed_with_access_boundary"
      }
    };

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.per_video_depth_lock).toBe("block");
    expect(result.answer_boundary).toBe("continue_research");
    expect(result.depth_blockers.join(" ")).toContain("executable");
  });

  it("cannot relabel a live transcript cursor as a terminal bounded result", () => {
    const input = completeInput();
    const video = input.selected_videos[0]!;
    input.access_boundaries = [{
      boundary_id: "terminal-partial-transcript",
      scope_type: "video_transcript",
      scope_id: video.video_id,
      access_status: "partial",
      materiality: "material",
      impact: "confidence_changing",
      terminal: true,
      retryable: false,
      recovery_attempted: true,
      description: "Caller claims a live cursor is terminal."
    }];
    video.transcript_receipt = {
      ...video.transcript_receipt,
      access_status: "partial",
      access_boundary_id: "terminal-partial-transcript",
      pagination: {
        ...video.transcript_receipt.pagination,
        exhausted: false,
        next_cursor_present: true
      }
    };

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.per_video_depth_lock).toBe("block");
    expect(result.answer_boundary).toBe("continue_research");
    expect(result.depth_blockers.join(" ")).toContain("executable work");
  });

  it("allows only a terminal, nonretryable, recovery-attempted boundary to bound the answer", () => {
    const input = completeInput();
    const video = input.selected_videos[0]!;
    input.access_boundaries = [accessBoundary({
      id: "comments-disabled",
      scopeType: "video_discussion",
      scopeId: video.video_id,
      status: "comments_disabled",
      terminal: true,
      retryable: false
    })];
    video.discussion_receipt = {
      ...video.discussion_receipt,
      access_status: "comments_disabled",
      extraction_coverage: "completed_with_access_boundary",
      access_boundary_id: "comments-disabled",
      receipt: {
        ...video.discussion_receipt.receipt,
        completion_state: "completed_with_access_boundary",
        top_level_pagination_exhausted: false
      }
    };

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.selection_coverage_lock).toBe("pass");
    expect(result.per_video_depth_lock).toBe("block");
    expect(result.answer_boundary).toBe("bounded_nonranking_only");
    expect(result.boundary_blockers.join(" ")).toContain("comments-disabled");
  });

  it("blocks ranking-relevant omissions but treats justified nondecision omissions as warnings", () => {
    const warningInput = completeInput();
    const omitted = warningInput.candidate_videos.find(({ selection_status }) =>
      selection_status === "screened_not_selected"
    )!;
    omitted.omission_impact = "not_decision_relevant";
    omitted.omission_rationale = "Same program, stage, outcome, and channel pool as selected evidence.";
    const warningResult = assessTreatmentLandscapeCoverage(warningInput);
    expect(warningResult.selection_coverage_lock).toBe("pass");
    expect(warningResult.planning_warnings.join(" ")).toContain(omitted.video_id);

    const blockingInput = completeInput();
    const rankingOmission = blockingInput.candidate_videos.find(({ selection_status }) =>
      selection_status === "screened_not_selected"
    )!;
    rankingOmission.omission_impact = "ranking_changing";
    rankingOmission.omission_rationale = "Reports a distinct failure trajectory.";
    const blockingResult = assessTreatmentLandscapeCoverage(blockingInput);
    expect(blockingResult.selection_coverage_lock).toBe("block");
    expect(blockingResult.selection_blockers.join(" ")).toContain("failure trajectory");
  });

  it("does not let an unsupported nondecision label waive a distinct unsearched class", () => {
    const input = completeInput();
    input.treatment_classes.push({
      ...treatmentClass("unsearched-distinct", "Distinct unsearched approach"),
      search_status: "unsearched",
      omission_impact: "not_decision_relevant",
      omission_rationale: "Caller says this distinct class does not matter."
    });
    input.program_fingerprints.push(
      fingerprint("fp-unsearched-distinct", "unsearched-distinct")
    );

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.selection_coverage_lock).toBe("block");
    expect(result.uncovered_material_treatment_classes).toContain("unsearched-distinct");
    expect(result.selection_blockers.join(" ")).toContain(
      "Caller says this distinct class does not matter"
    );
  });

  it("requires formal evidence follow-up for each material program fingerprint", () => {
    const input = completeInput();
    input.program_fingerprints[0] = {
      ...input.program_fingerprints[0]!,
      formal_follow_up: "incomplete",
      omission_impact: "not_decision_relevant",
      omission_rationale: "The class-level search was complete."
    };

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.selection_coverage_lock).toBe("block");
    expect(result.program_fingerprints_with_no_formal_evidence_follow_up)
      .toContain("fp-strength");
    expect(result.selection_blockers.join(" ")).toContain(
      "fp-strength lacks formal-evidence follow-up"
    );
  });

  it("projects deterministic coverage receipts from actual source output shapes", () => {
    const transcript = projectTranscriptCoverageReceipt(transcriptPages("receipt-video"));
    expect(transcript).toMatchObject({
      source_video_id: "receipt-video",
      access_status: "api_visible_complete",
      pagination: {
        chain_started_at_first_page: true,
        cursor_chain_reconciled: true,
        page_count: 2,
        records_returned_cumulative: 2,
        exhausted: true
      },
      selected_track: { language_code: "en", is_auto_generated: false },
      timestamp_provenance: "segment_timestamp_urls"
    });

    const discussion = projectDiscussionCoverageReceipt(
      communityAuditOutput("receipt-video", "UC-RECEIPT")
    );
    expect(discussion).toMatchObject({
      source_video_id: "receipt-video",
      channel_id: "UC-RECEIPT",
      top_level_comments_retrieved_cumulative: 8,
      replies_retrieved_cumulative: 4,
      records_retrieved_cumulative: 12,
      records_returned_for_analysis: 12,
      receipt: { synthesis_lock: "pass" }
    });
  });

  it("returns a server-produced coverage receipt from the transcript Action", async () => {
    const pages = transcriptPages("RcptVid0001");
    let call = 0;
    const route = createYoutubeTranscriptActionRoute({
      getTranscript: async () => pages[call++]!
    });
    const first = await route.handle({
      request: {} as never,
      clientIp: "127.0.0.1",
      body: { video_id_or_url: "RcptVid0001", page_size: 1 }
    });
    const actionCursor = youtubeTranscriptActionOutputSchema.parse(first.body)
      .pagination.next_cursor!;
    const result = await route.handle({
      request: {} as never,
      clientIp: "127.0.0.1",
      body: { video_id_or_url: "RcptVid0001", cursor: actionCursor }
    });

    expect(result).toMatchObject({
      status: 200,
      body: {
        coverage_receipt: {
          source_video_id: "RcptVid0001",
          access_status: "api_visible_complete",
          pagination: {
            chain_started_at_first_page: true,
            cursor_chain_reconciled: true,
            page_count: 2,
            records_returned_cumulative: 2,
            exhausted: true,
            next_cursor_present: false
          }
        }
      }
    });
  });

  it("excludes invalid records from every aggregate counter", () => {
    const input = completeInput();
    input.candidate_videos.push({ ...input.candidate_videos[0]! });

    const result = assessTreatmentLandscapeCoverage(input);

    expect(result.invalid_record_ids.candidate_videos).toContain("v-strength-0");
    expect(result.candidate_videos_screened).toBe(20);
    expect(result.material_videos_selected).toBe(6);
    expect(result.independent_channels_or_pools).toBe(6);
    expect(result.selection_coverage_lock).toBe("block");
  });

  it("strictly validates input and keeps a representative 15-video result under the route cap", async () => {
    const route = createTreatmentLandscapeCoverageActionRoute();
    const context = (body: unknown) => ({
      request: {} as never,
      clientIp: "127.0.0.1",
      body
    });
    await expect(route.handle(context({ ...completeInput(), extra: true })))
      .resolves.toEqual({
        status: 422,
        body: { error: { code: "action_input_invalid", retryable: false } }
      });

    const input = fifteenVideoInput();
    const maximumText = "x".repeat(160);
    input.candidate_videos = input.candidate_videos.map((candidate) => ({
      ...candidate,
      title: maximumText,
      channel_title: maximumText
    }));
    input.selected_videos = input.selected_videos.map((video) => ({
      ...video,
      stage_or_baseline: maximumText,
      outcome_and_horizon: maximumText,
      nonredundant_value: maximumText,
      what_it_changed: maximumText
    }));
    const result = await route.handle(context(input));
    expect(result.status).toBe(200);
    expect(Buffer.byteLength(JSON.stringify(input), "utf8")).toBeLessThan(65_536);
    expect(Buffer.byteLength(JSON.stringify(result.body), "utf8")).toBeLessThanOrEqual(60_000);

    const sixteenth = {
      ...input.selected_videos[0]!,
      video_id: "video-over-limit"
    };
    await expect(route.handle(context({
      ...input,
      selected_videos: [...input.selected_videos, sixteenth]
    }))).resolves.toMatchObject({ status: 422 });
  });
});

function treatmentClass(id: string, label: string) {
  return {
    class_id: id,
    plain_language_label: label,
    materiality: "material" as const,
    search_status: "searched" as const,
    formal_follow_up: "complete" as const,
    omission_impact: "uncertain" as const,
    omission_rationale: "Omission could change the comparison until evaluated.",
    access_boundary_ids: []
  };
}

function fingerprint(id: string, classId: string, components = `A specific ${classId} program`) {
  return {
    fingerprint_id: id,
    treatment_class_id: classId,
    materiality: "material" as const,
    availability_status: "available" as const,
    formal_follow_up: "complete" as const,
    omission_impact: "uncertain" as const,
    omission_rationale: "A distinct program could change the comparison.",
    components,
    dose_or_intensity: `Moderate ${classId} intensity`,
    frequency: "Three times weekly",
    duration: "Twelve weeks",
    supervision: "Clinician supervised",
    adherence_or_fidelity: "Adherence reported",
    cointerventions: "None reported",
    stage_or_baseline: "Baseline reported",
    outcome: "Function",
    horizon: "Twelve weeks",
    care_stage: "Before surgery"
  };
}

function candidateVideo(input: {
  videoId: string;
  classId: string;
  fingerprintId: string;
  batchId: string;
  channelId: string;
  selected: boolean;
  materiality?: "material" | "not_material";
}) {
  return {
    video_id: input.videoId,
    title: `Video ${input.videoId}`,
    channel_id: input.channelId,
    channel_title: `Channel ${input.channelId}`,
    published_date: "not_reported" as const,
    treatment_class_id: input.classId,
    fingerprint_id: input.fingerprintId,
    discovery_batch_ids: [input.batchId],
    materiality: input.materiality ?? "material" as const,
    selection_status: input.selected ? "selected" as const : "screened_not_selected" as const,
    omission_impact: input.selected ? "uncertain" as const : "not_decision_relevant" as const,
    omission_rationale: input.selected
      ? "Selected for deep audit."
      : "Same program and outcome as the selected candidate."
  };
}

function selectedVideo(videoId: string, fingerprintId: string, channelId?: string) {
  const channel = channelId ?? channelForVideo(videoId);
  return {
    video_id: videoId,
    fingerprint_id: fingerprintId,
    stage_or_baseline: "Baseline reported",
    outcome_and_horizon: "Function over twelve weeks",
    nonredundant_value: "Distinct program contribution",
    transcript_receipt: projectTranscriptCoverageReceipt(transcriptPages(videoId)),
    discussion_receipt: projectDiscussionCoverageReceipt(
      communityAuditOutput(videoId, channel)
    ),
    what_it_changed: "Added a distinct treatment hypothesis"
  };
}

function channelForVideo(videoId: string): string {
  const [, classId] = /^v-([^-]+)-/u.exec(videoId) ?? [];
  const index = classSpecs.findIndex(([id]) => id === classId);
  return index >= 0 ? `UC-${index}-0` : `UC-${videoId}`;
}

function directionalComplete() {
  return { status: "complete" as const };
}

function sparkFrontier(validatedVideoIds: string[], unresolvedVideoIds: string[] = []) {
  const payload = {
    source_candidate_video_ids: [...validatedVideoIds, ...unresolvedVideoIds],
    validated_candidate_video_ids: validatedVideoIds,
    terminally_rejected_video_ids: [],
    unresolved_candidate_video_ids: unresolvedVideoIds
  };
  return {
    frontier_digest: createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex"),
    source: "gemini_spark" as const,
    ...payload
  };
}

function accessBoundary(input: {
  id: string;
  scopeType: "video_discussion";
  scopeId: string;
  status: "rate_limited" | "comments_disabled";
  terminal: boolean;
  retryable: boolean;
}) {
  return {
    boundary_id: input.id,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    access_status: input.status,
    materiality: "material" as const,
    impact: "confidence_changing" as const,
    terminal: input.terminal,
    retryable: input.retryable,
    recovery_attempted: true,
    description: "The public discussion could not be completed."
  };
}

function transcriptPages(videoId: string): YoutubeTranscriptEnvelope[] {
  const track = {
    language_code: "en",
    language_name: "English",
    is_auto_generated: false
  };
  const common = {
    provider: "youtube" as const,
    record_type: "youtube_transcript" as const,
    primary_identifier: videoId,
    retrieved_at: "2026-08-21T00:00:00.000Z",
    query: { video_id: videoId, language_code: "en" },
    source_identity: {
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Video ${videoId}`,
      authors_or_channel: ["Channel"]
    },
    limitations: [],
    raw_metadata: {
      access_method: "youtube_innertube_unofficial" as const,
      provider_reported_segments: 2,
      snapshot_sha256: "a".repeat(64),
      selected_track: track,
      available_tracks: [track]
    }
  };
  return [{
    ...common,
    pagination: {
      next_cursor: "cursor-2", page_size: 1, returned: 1, exhausted: false
    },
    access_status: "partial",
    data: [{
      index: 0, start_ms: 0, duration_ms: 1000, text: "First", language_code: "en",
      timestamp_url: `https://www.youtube.com/watch?v=${videoId}&t=0s`
    }]
  }, {
    ...common,
    pagination: {
      cursor: "cursor-2", page_size: 1, returned: 1, exhausted: true
    },
    access_status: "api_visible_complete",
    data: [{
      index: 1, start_ms: 1000, duration_ms: 1000, text: "Second", language_code: "en",
      timestamp_url: `https://www.youtube.com/watch?v=${videoId}&t=1s`
    }]
  }];
}

function communityAuditOutput(
  videoId: string,
  channelId: string
): YoutubeVideoCommunityAuditOutput {
  return {
    provider: "youtube",
    record_type: "youtube_video_community_audit",
    retrieved_at: "2026-08-21T00:00:00.000Z",
    video_id: videoId,
    canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
    analysis_limit: 500,
    segment_index: 0,
    metadata_access_status: "api_visible_complete",
    title: `Video ${videoId}`,
    channel_id: channelId,
    channel_title: `Channel ${channelId}`,
    provider_reported_comments: "12",
    access_status: "api_visible_complete",
    extraction_coverage: "api_visible_complete",
    limitations: [],
    top_level_comments_retrieved_this_call: 8,
    replies_retrieved_this_call: 4,
    records_retrieved_this_call: 12,
    comment_thread_pages_this_call: 1,
    reply_pages_this_call: 1,
    top_level_comments_retrieved_cumulative: 8,
    replies_retrieved_cumulative: 4,
    records_retrieved_cumulative: 12,
    comment_thread_pages_cumulative: 1,
    reply_pages_cumulative: 1,
    records_returned_for_analysis: 12,
    top_level_records_returned_for_analysis: 8,
    reply_records_returned_for_analysis: 4,
    reply_count_mismatches: [],
    corpus_rolling_sha256: "b".repeat(64),
    insufficient_depth: false,
    continuation_recommended: false,
    sample: {
      mode: "all",
      corpus_count: 12,
      sampled_count: 12,
      comments: []
    },
    receipt: {
      completion_state: "api_visible_complete",
      synthesis_lock: "pass",
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: true,
      replies_reconciled: true,
      query_bounded_comments_used_as_corpus: false,
      blockers: []
    }
  };
}

function fifteenVideoInput(): TreatmentLandscapeCoverageInput {
  const input = completeInput();
  const classes = Array.from({ length: 15 }, (_, index) => `class-${index}`);
  input.treatment_classes = classes.map((id) => treatmentClass(id, `Treatment ${id}`));
  input.program_fingerprints = classes.map((id) => fingerprint(`fp-${id}`, id));
  input.candidate_videos = classes.map((id, index) => candidateVideo({
    videoId: `video-${index}`,
    classId: id,
    fingerprintId: `fp-${id}`,
    batchId: `batch-${id}`,
    channelId: `UC-LARGE-${index}`,
    selected: true
  }));
  input.discovery_batches = classes.map((id, index) => ({
    batch_id: `batch-${id}`,
    query_or_scope: `Search ${id}`,
    treatment_class_ids: [id],
    access_status: "api_visible_complete" as const,
    pagination: { exhausted: true, next_cursor_present: false },
    candidate_video_ids: [`video-${index}`],
    new_program_fingerprint_ids: []
  }));
  input.selected_videos = input.candidate_videos.map(({ video_id, fingerprint_id, channel_id }) => ({
    ...selectedVideo(video_id, fingerprint_id),
    discussion_receipt: projectDiscussionCoverageReceipt(
      communityAuditOutput(video_id, channel_id)
    )
  }));
  return input;
}
