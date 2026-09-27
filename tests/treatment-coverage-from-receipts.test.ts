import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createAskRigorServer } from "../apps/research-mcp/src/server.js";

import {
  assessTreatmentCoverageFromReceipts,
  type TreatmentCoverageFromReceiptsInput
} from "../apps/research-mcp/src/treatment-coverage-from-receipts.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  pageKey,
  researchTargetDigest,
  verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";

const SECRET = "treatment-coverage-receipts-secret-0123456789";
const now = () => new Date("2026-09-27T12:00:00.000Z");
const TARGET = "Adults with hip osteoarthritis trying to avoid a replacement";
const BASE_ORDER = Date.parse("2026-09-27T11:00:00.000Z");

const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, unknown>, t: number) =>
  issueResearchReceipt(kind, { ...claims, t: BASE_ORDER + t } as never, { secret: SECRET, now });
const discovery = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, unknown>, t: number) =>
  sign(kind, { target: researchTargetDigest(TARGET), ...claims }, t);

const completeAudit = (video: string, channel: string, t: number) => sign("youtube_video_audit", {
  video, state: "api_visible_complete", lock: "pass", records: 120,
  ch: channel, ms: "api_visible_complete", acc: "api_visible_complete", cov: "api_visible_complete",
  prc: "120", top: 80, rep: 40, ret: 100, rtop: 70, rrep: 30, mm: 0, cr: 0, f: 1, tx: 1, rr: 1, bl: 0
}, t);

// Three rounds: a scout (A, B, C; X rejected), a specific collagen search (C, D)
// and a survey (E); audits of A, B and F complete on three channels.
const scout = discovery("youtube_scout", {
  videos: ["AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC", "FFFFFFFFFFF"], open: 0,
  q: discoveryQueryDigest([TARGET]), unres: [], rej: ["XXXXXXXXXXX"]
}, 1_000);
const collagenSearch = discovery("youtube_search", {
  videos: ["CCCCCCCCCCC", "DDDDDDDDDDD"], access: "complete", open: 0,
  q: discoveryQueryDigest(["collagen peptides hip pain"])
}, 2_000);
const survey = discovery("youtube_survey", {
  access: "complete", searches: 2, videos: ["EEEEEEEEEEE"], open: 0,
  q: discoveryQueryDigest(["progressive resistance training hip", "hip pain what worked"])
}, 3_000);
const receipts = [
  scout, collagenSearch, survey,
  completeAudit("AAAAAAAAAAA", "UCchannelAAAAAAAAAAAAAAA", 4_000),
  completeAudit("BBBBBBBBBBB", "UCchannelBBBBBBBBBBBBBBB", 5_000),
  completeAudit("FFFFFFFFFFF", "UCchannelFFFFFFFFFFFFFFF", 6_000)
];

const program = (id: string, classId: string, components: string, extra: Partial<Record<string, string>> = {}) => ({
  fingerprint_id: id,
  treatment_class_id: classId,
  materiality: "material" as const,
  availability_status: "available" as const,
  formal_follow_up: "complete" as const,
  omission_impact: "not_decision_relevant" as const,
  omission_rationale: "Selected and followed up.",
  components,
  dose_or_intensity: "three sessions a week",
  frequency: "three times weekly",
  duration: "twelve weeks",
  supervision: "self-directed",
  adherence_or_fidelity: "program not described",
  cointerventions: "program not described",
  stage_or_baseline: "severe hip osteoarthritis",
  outcome: "pain and walking",
  horizon: "three months",
  care_stage: "before surgery",
  ...extra
});

function input(overrides: Partial<TreatmentCoverageFromReceiptsInput> = {}): unknown {
  return {
    research_target: TARGET,
    broad_treatment_choice: true,
    substantial_youtube_corpus: "no",
    further_expansion_likely_to_improve_answer: "no",
    receipts,
    treatment_classes: [
      {
        class_id: "exercise", plain_language_label: "Exercise programs", materiality: "material",
        search_status: "searched", formal_follow_up: "complete",
        omission_impact: "not_decision_relevant", omission_rationale: "Covered."
      },
      {
        class_id: "nutrition", plain_language_label: "Nutrition and supplements", materiality: "material",
        search_status: "searched", formal_follow_up: "complete",
        omission_impact: "not_decision_relevant", omission_rationale: "Covered."
      }
    ],
    program_fingerprints: [
      program("fp_strength", "exercise", "progressive resistance training"),
      program("fp_collagen", "nutrition", "collagen peptides with vitamin C", { dose_or_intensity: "10 g daily" }),
      program("fp_aquatic", "exercise", "aquatic walking program", { supervision: "group class" })
    ],
    rounds: [
      { receipt: 1, treatment_class_ids: ["nutrition"], queries: ["collagen peptides hip pain"] },
      { receipt: 2, treatment_class_ids: ["exercise"], queries: ["progressive resistance training hip", "hip pain what worked"] }
    ],
    selected_videos: [
      { video_id: "AAAAAAAAAAA", fingerprint_id: "fp_strength", stage_or_baseline: "Severe OA, walking with a cane",
        outcome_and_horizon: "Less pain after three months", nonredundant_value: "Detailed strength routine",
        what_it_changed: "Adds a self-directed strength option" },
      { video_id: "BBBBBBBBBBB", fingerprint_id: "fp_collagen", stage_or_baseline: "Moderate to severe OA",
        outcome_and_horizon: "Reported easier walking at two months", nonredundant_value: "Collagen dose and timing",
        what_it_changed: "Adds a nutrition option" },
      { video_id: "FFFFFFFFFFF", fingerprint_id: "fp_aquatic", stage_or_baseline: "Severe OA, overweight",
        outcome_and_horizon: "Walked farther after eight weeks", nonredundant_value: "Low-impact pool program",
        what_it_changed: "Adds a pool option" }
    ],
    screened_videos: [
      { video_id: "CCCCCCCCCCC", fingerprint_id: "fp_collagen", materiality: "material",
        omission_impact: "not_decision_relevant", omission_rationale: "Same collagen program as the selected video." }
    ],
    not_material_videos: [{ treatment_class_id: "exercise", video_ids: ["DDDDDDDDDDD", "EEEEEEEEEEE"] }],
    specific_searches: [
      { round: 1, treatment_class_id: "nutrition", implementation_terms: ["collagen peptides"], discriminator_terms: ["hip pain"] },
      { round: 2, treatment_class_id: "exercise", implementation_terms: ["progressive resistance training"], discriminator_terms: ["hip"] }
    ],
    directional_searches: {
      benefit: { status: "complete" },
      no_effect_or_failure: { status: "complete" },
      harm: { status: "complete" },
      discontinuation: { status: "no_material_reports" },
      eventual_standard_treatment: { status: "complete" }
    },
    access_boundaries: [],
    ...overrides
  };
}

describe("treatment coverage from signed receipts", () => {
  it("builds the ledger from receipts and passes a complete check", () => {
    const result = assessTreatmentCoverageFromReceipts(input(), { secret: SECRET, now });
    expect(result.receipt_derivation).toEqual({
      access_boundaries_derived: 0,
      receipts_verified: 6,
      receipts_rejected: [],
      discovery_rounds: 3,
      rounds_for_other_targets: 0,
      candidate_videos: 6,
      unscreened_videos: [],
      audited_videos: ["AAAAAAAAAAA", "BBBBBBBBBBB", "FFFFFFFFFFF"],
      scout_frontier_videos: 4,
      open_scout_titles: 0,
      input_problems: []
    });
    expect(result.blockers).toEqual([]);
    expect(result).toMatchObject({
      answer_boundary: "ledger_consistent_for_synthesis",
      synthesis_lock: "pass",
      material_videos_fully_audited: 3,
      materially_distinct_programs_fully_audited: 3,
      independent_channels_or_pools: 3,
      discovery_saturated: true,
      creator_content_unverified_videos: 3
    });
    expect(result.specific_implementation_search_status_by_class).toEqual([
      { treatment_class_id: "exercise", status: "exhausted_zero_results" },
      { treatment_class_id: "nutrition", status: "specific_candidates_found" }
    ]);
    expect(result.videos_actually_audited.map(({ video_id, channel_id }) => [video_id, channel_id])).toEqual([
      ["AAAAAAAAAAA", "UCchannelAAAAAAAAAAAAAAA"],
      ["BBBBBBBBBBB", "UCchannelBBBBBBBBBBBBBBB"],
      ["FFFFFFFFFFF", "UCchannelFFFFFFFFFFFFFFF"]
    ]);
  });

  it("counts only this target's discovery and requires every discovered video to be screened", () => {
    const otherTarget = sign("youtube_search", {
      videos: ["GGGGGGGGGGG"], access: "complete", open: 0, q: discoveryQueryDigest(["tinnitus"]),
      target: researchTargetDigest("Adults with tinnitus")
    }, 7_000);
    const unscreenedRound = discovery("youtube_search", {
      videos: ["HHHHHHHHHHH"], access: "complete", open: 0, q: discoveryQueryDigest(["hip gelatin"])
    }, 8_000);
    const result = assessTreatmentCoverageFromReceipts(input({
      receipts: [...receipts, otherTarget, unscreenedRound],
      not_material_videos: [{ treatment_class_id: "exercise", video_ids: ["DDDDDDDDDDD", "EEEEEEEEEEE", "GGGGGGGGGGG"] }]
    }), { secret: SECRET, now });
    expect(result.receipt_derivation).toMatchObject({
      discovery_rounds: 4,
      rounds_for_other_targets: 1,
      unscreened_videos: ["HHHHHHHHHHH"],
      input_problems: [expect.stringContaining("Video GGGGGGGGGGG is not among the videos this research target's discovery receipts found")]
    });
    expect(result.answer_boundary).toBe("continue_research");
    expect(result.blockers.join(" ")).toContain("Candidate video HHHHHHHHHHH was screened but not selected: Discovered but not screened");
  });

  it("checks specific-program queries against the signed digest", () => {
    const result = assessTreatmentCoverageFromReceipts(input({
      rounds: [
        { receipt: 1, treatment_class_ids: ["nutrition"], queries: ["collagen hip"] },
        { receipt: 2, treatment_class_ids: ["exercise"], queries: ["progressive resistance training hip", "hip pain what worked"] }
      ]
    }), { secret: SECRET, now });
    expect(result.receipt_derivation.input_problems).toEqual([
      expect.stringContaining("The queries given for receipt 1 do not match what that round signed"),
      expect.stringContaining("specific_searches[0] needs the exact queries of receipt 1")
    ]);
    expect(result.answer_boundary).toBe("continue_research");
  });

  it("needs a completed, signed audit for every selected video", () => {
    const missing = assessTreatmentCoverageFromReceipts(input({
      receipts: receipts.slice(0, 5)
    }), { secret: SECRET, now });
    expect(missing.blockers.join(" ")).toContain(
      "Candidate video FFFFFFFFFFF is marked selected without a valid selected-video audit."
    );

    // An audit receipt without the depth claims reads as work still to do.
    const legacy = sign("youtube_video_audit", {
      video: "FFFFFFFFFFF", state: "api_visible_complete", lock: "pass", records: 120
    }, 9_000);
    const old = assessTreatmentCoverageFromReceipts(input({
      receipts: [...receipts.slice(0, 5), legacy]
    }), { secret: SECRET, now });
    expect(old.depth_blockers.join(" ")).toContain("Video FFFFFFFFFFF discussion audit still has executable work.");
    expect(old.answer_boundary).toBe("continue_research");
  });

  it("refuses reserved IDs and asks for a per-video audit of a selected video", () => {
    const reserved = assessTreatmentCoverageFromReceipts(input({
      program_fingerprints: [
        program("fp_strength", "exercise", "progressive resistance training"),
        program("fp_collagen", "nutrition", "collagen peptides with vitamin C", { dose_or_intensity: "10 g daily" }),
        program("fp_aquatic", "exercise", "aquatic walking program", { supervision: "group class" }),
        program("server:unscreened", "exercise", "a program named like a server record")
      ]
    }), { secret: SECRET, now });
    expect(reserved.receipt_derivation.input_problems).toEqual([
      "ID server:unscreened is reserved for server-made records; rename it."
    ]);
    expect(reserved.answer_boundary).toBe("continue_research");

    const communityOnly = discovery("youtube_community_audit", {
      videos: ["FFFFFFFFFFF"], state: "api_visible_complete", lock: "pass", q: discoveryQueryDigest(["pool walking hip"]), open: 0
    }, 9_500);
    const result = assessTreatmentCoverageFromReceipts(input({
      receipts: [...receipts.slice(0, 5), communityOnly]
    }), { secret: SECRET, now });
    expect(result.receipt_derivation.input_problems).toEqual([
      expect.stringContaining("Selected video FFFFFFFFFFF has only a one-call community audit")
    ]);
  });

  it("keeps a scout's unsearched titles open and links a round's access boundary", () => {
    // The scout named two titles it could not look up: its open count exceeds its unresolved IDs.
    const scoutWithTitles = discovery("youtube_scout", {
      videos: ["AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC", "FFFFFFFFFFF"], open: 2,
      q: discoveryQueryDigest([TARGET]), unres: [], rej: ["XXXXXXXXXXX"]
    }, 1_000);
    const open = assessTreatmentCoverageFromReceipts(input({
      receipts: [scoutWithTitles, ...receipts.slice(1)]
    }), { secret: SECRET, now });
    expect(open.receipt_derivation.open_scout_titles).toBe(2);
    expect(open.answer_boundary).not.toBe("ledger_consistent_for_synthesis");
    expect(open.breadth_gaps).toContain("Discovery batch r0 still has an executable continuation cursor.");

    // A partial survey round with a terminal boundary is a stated limit, not a record problem.
    const partialSurvey = discovery("youtube_survey", {
      access: "partial", searches: 2, videos: ["EEEEEEEEEEE"], open: 0,
      q: discoveryQueryDigest(["progressive resistance training hip", "hip pain what worked"])
    }, 3_000);
    const bounded = assessTreatmentCoverageFromReceipts(input({
      receipts: [...receipts.slice(0, 2), partialSurvey, ...receipts.slice(3)],
      specific_searches: [
        { round: 1, treatment_class_id: "nutrition", implementation_terms: ["collagen peptides"], discriminator_terms: ["hip pain"] }
      ],
      access_boundaries: [{
        boundary_id: "survey_limit", scope_type: "discovery_batch", scope_id: "r2", access_status: "partial",
        materiality: "uncertain", impact: "confidence_changing", terminal: true, retryable: false,
        recovery_attempted: true, description: "Two survey searches hit the daily search cap and were not rerun."
      }]
    }), { secret: SECRET, now });
    expect(bounded.blockers.join(" ")).not.toMatch(/lacks a structured access boundary|not linked to its claimed scope/u);
    expect(bounded.access_boundary_ids_used).toContain("survey_limit");
  });

  it("lets a later page settle the page it continued, but not a page it failed to read", () => {
    // Page one of the collagen search left a next page.
    const next = pageKey("collagen peptides hip pain", "CAoQAA");
    const pageOne = discovery("youtube_search", {
      videos: ["CCCCCCCCCCC", "DDDDDDDDDDD"], access: "complete", open: 1, nx: next,
      q: discoveryQueryDigest(["collagen peptides hip pain"])
    }, 2_000);
    const withPageTwo = (pageTwo: string) => assessTreatmentCoverageFromReceipts(input({
      receipts: [receipts[0]!, pageOne, receipts[2]!, pageTwo, ...receipts.slice(3)],
      rounds: [
        { receipt: 1, treatment_class_ids: ["nutrition"], queries: ["collagen peptides hip pain"] },
        { receipt: 2, treatment_class_ids: ["exercise"], queries: ["progressive resistance training hip", "hip pain what worked"] },
        { receipt: 3, treatment_class_ids: ["nutrition"], queries: ["collagen peptides hip pain"] }
      ]
    }), { secret: SECRET, now });

    // Page two read the rest of the results: every page was read.
    const read = withPageTwo(discovery("youtube_search", {
      videos: [], access: "complete", rl: 0, inc: 0, open: 0, pg: next,
      q: discoveryQueryDigest(["collagen peptides hip pain"])
    }, 3_500));
    expect(read.breadth_gaps.join(" ")).not.toContain("continuation cursor");
    expect(read.answer_boundary).toBe("ledger_consistent_for_synthesis");

    // The daily quota stopped page two, so it signed no page read: page one
    // stays open and page two is a rate-limited round.
    const stopped = withPageTwo(discovery("youtube_search", {
      videos: [], access: "rate_limited", rl: 1, inc: 1, open: 0,
      q: discoveryQueryDigest(["collagen peptides hip pain"])
    }, 3_500));
    expect(stopped.breadth_gaps).toEqual(expect.arrayContaining([
      "Discovery batch r1 still has an executable continuation cursor.",
      "Discovery batch r3 stopped at a rate limit or daily quota; rerun it once the limit resets."
    ]));
    expect(stopped.answer_boundary).toBe("first_pass_with_open_leads");
  });

  it("states a round's access limit from its receipt", () => {
    // The option A rerun's loop: the daily search cap stopped survey searches,
    // and every check rejected the boundary the model wrote for it.
    const cappedSurvey = discovery("youtube_survey", {
      access: "partial", rl: 2, inc: 2, searches: 3, videos: ["EEEEEEEEEEE"], open: 0,
      q: discoveryQueryDigest(["progressive resistance training hip", "hip pain what worked"])
    }, 3_000);
    const firstPass = assessTreatmentCoverageFromReceipts(input({
      receipts: [...receipts.slice(0, 2), cappedSurvey, ...receipts.slice(3)],
      specific_searches: [
        { round: 1, treatment_class_id: "nutrition", implementation_terms: ["collagen peptides"], discriminator_terms: ["hip pain"] }
      ],
      // A supplied boundary for the same round is set aside.
      access_boundaries: [{
        boundary_id: "cap", scope_type: "discovery_batch", scope_id: "r2", access_status: "rate_limited",
        materiality: "uncertain", impact: "uncertain", terminal: true, retryable: true,
        recovery_attempted: false, description: "Search cap."
      }]
    }), { secret: SECRET, now });
    expect(firstPass.receipt_derivation.access_boundaries_derived).toBe(1);
    expect(firstPass.receipt_derivation.input_problems).toEqual([]);
    expect(firstPass.answer_boundary).toBe("first_pass_with_open_leads");
    expect(firstPass.breadth_gaps).toContain(
      "Discovery batch r2 stopped at a rate limit or daily quota; rerun it once the limit resets."
    );
    expect(firstPass.access_boundary_ids_used).toEqual(["server:access:r2"]);
    expect(firstPass.blockers.join(" ")).not.toMatch(/both retryable and terminal|lacks a structured access boundary/u);

    // Deep research waits for the limit to reset.
    const deep = assessTreatmentCoverageFromReceipts(input({
      receipts: [...receipts.slice(0, 2), cappedSurvey, ...receipts.slice(3)],
      specific_searches: [
        { round: 1, treatment_class_id: "nutrition", implementation_terms: ["collagen peptides"], discriminator_terms: ["hip pain"] }
      ],
      research_depth: "deep"
    }), { secret: SECRET, now });
    expect(deep.answer_boundary).toBe("continue_research");

    // A refused search is a terminal limit the answer states, not more work.
    const refused = discovery("youtube_search", {
      videos: ["CCCCCCCCCCC", "DDDDDDDDDDD"], access: "inaccessible", open: 0,
      q: discoveryQueryDigest(["collagen peptides hip pain"])
    }, 2_000);
    const bounded = assessTreatmentCoverageFromReceipts(input({
      receipts: [receipts[0]!, refused, ...receipts.slice(2)]
    }), { secret: SECRET, now });
    expect(bounded.access_boundary_ids_used).toContain("server:access:r1");
    expect(bounded.blockers.join(" ")).not.toMatch(/r1 lacks a structured access boundary|still has executable recovery work/u);

    // server: IDs stay the server's.
    const reserved = assessTreatmentCoverageFromReceipts(input({
      access_boundaries: [{
        boundary_id: "server:access:r9", scope_type: "other", scope_id: "x", access_status: "partial",
        materiality: "uncertain", impact: "uncertain", terminal: false, retryable: true,
        recovery_attempted: false, description: "Taken ID."
      }]
    }), { secret: SECRET, now });
    expect(reserved.receipt_derivation.input_problems).toContain(
      "ID server:access:r9 is reserved for server-made records; rename it."
    );
  });

  it("reports tampered receipts and never lets a tie hide a late find", () => {
    const tampered = assessTreatmentCoverageFromReceipts(input({
      receipts: [...receipts, `${survey.slice(0, -2)}xx`]
    }), { secret: SECRET, now });
    expect(tampered.receipt_derivation.receipts_rejected).toEqual([{ index: 6, reason: "signature_invalid" }]);
    expect(tampered.answer_boundary).toBe("continue_research");

    // A round signed at the same moment as the last one, which found a new
    // material program, counts as the latest: discovery has not saturated.
    const tiedFind = discovery("youtube_search", {
      videos: ["JJJJJJJJJJJ"], access: "complete", open: 0, q: discoveryQueryDigest(["hip cycling program"])
    }, 3_000);
    const tied = assessTreatmentCoverageFromReceipts(input({
      receipts: [tiedFind, ...receipts],
      rounds: [
        { receipt: 2, treatment_class_ids: ["nutrition"], queries: ["collagen peptides hip pain"] },
        { receipt: 3, treatment_class_ids: ["exercise"], queries: ["progressive resistance training hip", "hip pain what worked"] }
      ],
      program_fingerprints: [
        program("fp_strength", "exercise", "progressive resistance training"),
        program("fp_collagen", "nutrition", "collagen peptides with vitamin C", { dose_or_intensity: "10 g daily" }),
        program("fp_aquatic", "exercise", "aquatic walking program", { supervision: "group class" }),
        program("fp_cycling", "exercise", "stationary cycling program", { formal_follow_up: "incomplete" })
      ],
      screened_videos: [
        { video_id: "CCCCCCCCCCC", fingerprint_id: "fp_collagen", materiality: "material",
          omission_impact: "not_decision_relevant", omission_rationale: "Same collagen program as the selected video." },
        { video_id: "JJJJJJJJJJJ", fingerprint_id: "fp_cycling", materiality: "material",
          omission_impact: "confidence_changing", omission_rationale: "Not audited yet." }
      ],
      specific_searches: [
        { round: 2, treatment_class_id: "nutrition", implementation_terms: ["collagen peptides"], discriminator_terms: ["hip pain"] },
        { round: 3, treatment_class_id: "exercise", implementation_terms: ["progressive resistance training"], discriminator_terms: ["hip"] }
      ]
    }), { secret: SECRET, now });
    expect(tied.discovery_saturated).toBe(false);
  });

  it("runs as the MCP tool and signs the result for finalize_research", async () => {
    const previous = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    const previousFinalization = process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = SECRET;
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    const server = createAskRigorServer();
    const client = new Client({ name: "askrigor-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      // Receipts signed now, so they have not expired.
      const fresh = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, unknown>, t: number) =>
        issueResearchReceipt(kind, { ...claims, t: Date.now() + t } as never, { secret: SECRET });
      const target = researchTargetDigest(TARGET);
      const liveReceipts = [
        fresh("youtube_scout", { videos: ["AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC", "FFFFFFFFFFF"], open: 0,
          q: discoveryQueryDigest([TARGET]), unres: [], rej: ["XXXXXXXXXXX"], target }, 1),
        fresh("youtube_search", { videos: ["CCCCCCCCCCC", "DDDDDDDDDDD"], access: "complete", open: 0,
          q: discoveryQueryDigest(["collagen peptides hip pain"]), target }, 2),
        fresh("youtube_survey", { access: "complete", searches: 2, videos: ["EEEEEEEEEEE"], open: 0,
          q: discoveryQueryDigest(["progressive resistance training hip", "hip pain what worked"]), target }, 3),
        ...["AAAAAAAAAAA", "BBBBBBBBBBB", "FFFFFFFFFFF"].map((video, position) => fresh("youtube_video_audit", {
          video, state: "api_visible_complete", lock: "pass", records: 120,
          ch: `UCchannel${video}${"x".repeat(4)}`, ms: "api_visible_complete", acc: "api_visible_complete",
          cov: "api_visible_complete", prc: "120", top: 80, rep: 40, ret: 100, rtop: 70, rrep: 30,
          mm: 0, cr: 0, f: 1, tx: 1, rr: 1, bl: 0
        }, 4 + position))
      ];
      const result = await client.callTool({
        name: "assess_treatment_landscape_coverage",
        arguments: input({ receipts: liveReceipts }) as Record<string, unknown>
      });
      expect(result.isError).not.toBe(true);
      const output = result.structuredContent as { answer_boundary: string; research_receipt: string };
      expect(output.answer_boundary).toBe("ledger_consistent_for_synthesis");
      expect(verifyResearchReceipt(output.research_receipt, { secret: SECRET })).toMatchObject({
        ok: true,
        kind: "treatment_coverage",
        claims: {
          boundary: "ledger_consistent_for_synthesis",
          target,
          broad: "true",
          videos: ["AAAAAAAAAAA", "BBBBBBBBBBB", "FFFFFFFFFFF"]
        }
      });
    } finally {
      if (previous === undefined) delete process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
      else process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = previous;
      if (previousFinalization !== undefined) process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = previousFinalization;
      await client.close();
      await server.close();
    }
  });
});
