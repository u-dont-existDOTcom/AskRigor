import { describe, expect, it } from "vitest";

import {
  finalizeResearch as finalizeResearchGate,
  normalizeIdentifier
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  researchTargetDigest,
  verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";

const SECRET = "research-finalization-test-secret-0123456789";
const now = () => new Date("2026-09-26T12:00:00.000Z");
const options = { secret: SECRET, now };
const TARGET = "Adults with hip osteoarthritis trying to avoid a replacement";
const DISCOVERY_KINDS = new Set(["youtube_survey", "youtube_search", "youtube_scout", "youtube_community_audit"]);
// As the MCP tools do, discovery receipts sign the research target and every
// receipt signs its issue order `t`; here receipts are issued in the order the
// code creates them, one second apart, unless a claim overrides it.
let issueOrder = Date.parse("2026-09-26T11:00:00.000Z");
const sign = (...args: Parameters<typeof issueResearchReceipt>) =>
  issueResearchReceipt(args[0], {
    ...(DISCOVERY_KINDS.has(args[0]) ? { target: researchTargetDigest(TARGET) } : {}),
    t: (issueOrder += 1_000),
    ...args[1]
  }, options);

// The gate needs community_findings whenever comments were read. Tests of
// other checks get findings for exactly the videos their receipts audited; a
// test can pass its own community_findings, or undefined, to check them.
const commentVideos = (receipts: readonly string[]) => [...new Set(receipts.flatMap((receipt) => {
  const verified = verifyResearchReceipt(receipt, options);
  if (!verified.ok) return [];
  const videos = verified.kind === "youtube_video_audit"
    ? verified.claims.video
    : verified.kind === "youtube_community_audit" ? verified.claims.videos : undefined;
  return videos === undefined ? [] : typeof videos === "string" ? [videos] : videos;
}))];
const findingsFor = (videos: string[]) => ({
  videos_reviewed: videos,
  benefit_reports: "About a third of commenters reported less pain after several months.",
  no_effect_reports: "Several reported no change.",
  adverse_reports: "None reported.",
  creators_versus_commenters: "The creators sell programs; commenters have no stake.",
  effect_on_answer: "Supports trying it before surgery, as weak firsthand evidence."
});
const finalizeResearch = (input: Record<string, unknown> & { receipts: string[] }, gateOptions: typeof options) => {
  const videos = commentVideos(input.receipts);
  return finalizeResearchGate(
    videos.length === 0 ? input : { community_findings: findingsFor(videos), ...input },
    gateOptions
  );
};

const survey = sign("youtube_survey", {
  access: "complete", searches: 4, videos: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"], q: "a1a1a1a1a1a1"
}, options);
// Two later rounds from new angles that add nothing new: discovery has saturated.
const emptySearch = sign("youtube_search", { videos: [], q: "b2b2b2b2b2b2" }, options);
const repeatScout = sign("youtube_scout", { videos: ["bbbbbbbbbbb"], open: 0, q: "c3c3c3c3c3c3" }, options);
const videoA = sign("youtube_video_audit", {
  video: "aaaaaaaaaaa", state: "api_visible_complete", lock: "pass", records: 240
}, options);
const videoB = sign("youtube_video_audit", {
  video: "bbbbbbbbbbb", state: "completed_with_access_boundary", lock: "pass", records: 80
}, options);
const study = sign("study_audit", {
  id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields"
}, options);
const lead = sign("full_text_lead", { doi: "10.1016/j.joca.2020.01.001" }, options);

describe("finalize_research gate", () => {
  it("binds a treatment comparison to the latest treatment-coverage check", () => {
    const target = TARGET;
    const base = {
      community_evidence: "researched" as const,
      research_target: target,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }]
    };
    const ready = [survey, emptySearch, repeatScout, videoA, study];
    const coverage = (boundary: string, at: string, forTarget = target, broad = true) => issueResearchReceipt(
      "treatment_coverage", {
        boundary,
        lock: boundary === "ledger_consistent_for_synthesis" ? "pass" : "block",
        target: discoveryQueryDigest([forTarget]),
        broad
      },
      { secret: SECRET, now: () => new Date(at) }
    );

    const missing = finalizeResearch({ ...base, receipts: ready, treatment_choice: "compared" }, options);
    expect(missing.status).toBe("not_ready");
    expect(missing.next_steps.join(" ")).toContain("call assess_treatment_landscape_coverage");

    // A blocking result binds the answer even when the caller says no comparison was made.
    const blocked = finalizeResearch({
      ...base, receipts: [...ready, coverage("continue_research", "2026-09-26T11:00:00.000Z")], treatment_choice: "not_compared"
    }, options);
    expect(blocked.status).toBe("not_ready");
    expect(blocked.next_steps.join(" ")).toContain("was continue_research");

    const bounded = finalizeResearch({
      ...base, receipts: [...ready, coverage("bounded_nonranking_only", "2026-09-26T11:00:00.000Z")], treatment_choice: "compared"
    }, options);
    expect(bounded.status).toBe("ready_with_limits");
    expect(bounded.limits.join(" ")).toContain("do not rank or recommend");

    const firstPass = [...ready, coverage("first_pass_with_open_leads", "2026-09-26T11:00:00.000Z")];
    expect(finalizeResearch({ ...base, receipts: firstPass, treatment_choice: "compared" }, options).limits.join(" "))
      .toContain("present it as provisional");
    expect(finalizeResearch({
      ...base, receipts: firstPass, treatment_choice: "compared", research_depth: "deep"
    }, options).next_steps.join(" ")).toContain("deep research needs ledger_consistent_for_synthesis");

    // The latest check wins, whatever order the receipts are passed in.
    const later = finalizeResearch({
      ...base,
      receipts: [
        coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z"),
        ...ready,
        coverage("continue_research", "2026-09-26T11:00:00.000Z")
      ],
      treatment_choice: "compared"
    }, options);
    expect(later.status).toBe("ready");
    expect(verifyResearchReceipt(later.finalization_receipt!, options)).toMatchObject({
      ok: true, claims: { coverage: "ledger_consistent_for_synthesis" }
    });

    // Checks issued in the same second are all the latest: the stricter one binds, whatever the order.
    const sameSecond = finalizeResearch({
      ...base,
      receipts: [
        ...ready,
        coverage("continue_research", "2026-09-26T11:30:00.000Z"),
        coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z")
      ],
      treatment_choice: "compared"
    }, options);
    expect(sameSecond.status).toBe("not_ready");
    expect(sameSecond.next_steps.join(" ")).toContain("was continue_research");
    // The signed issue order separates checks within one second.
    const ordered = (boundary: string, t: number) => issueResearchReceipt("treatment_coverage", {
      boundary,
      lock: boundary === "ledger_consistent_for_synthesis" ? "pass" : "block",
      target: researchTargetDigest(target),
      broad: true,
      t
    }, { secret: SECRET, now: () => new Date("2026-09-26T11:30:00.000Z") });
    const baseOrder = Date.parse("2026-09-26T11:30:00.000Z");
    expect(finalizeResearch({
      ...base,
      receipts: [
        ...ready,
        ordered("ledger_consistent_for_synthesis", baseOrder + 400),
        ordered("continue_research", baseOrder + 100)
      ],
      treatment_choice: "compared"
    }, options).status).toBe("ready");

    // A comparison needs the check run as a broad treatment choice.
    const narrow = finalizeResearch({
      ...base,
      receipts: [...ready, coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z", target, false)],
      treatment_choice: "compared"
    }, options);
    expect(narrow.status).toBe("not_ready");
    expect(narrow.next_steps.join(" ")).toContain("broad_treatment_choice true");

    // A check made for another target does not count, and the target must be passed to match one.
    const otherTarget = finalizeResearch({
      ...base,
      receipts: [...ready, coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z", "Adults with tinnitus")],
      treatment_choice: "compared"
    }, options);
    expect(otherTarget.status).toBe("not_ready");
    expect(otherTarget.next_steps.join(" ")).toContain("was made for this research_target");
    // The research target is required, so a check can always be matched.
    const { research_target: _target, ...withoutTarget } = base;
    expect(() => finalizeResearch({
      ...withoutTarget,
      receipts: [...ready, coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z")],
      treatment_choice: "compared"
    }, options)).toThrow();

    // A check made for another question judged videos this research never found.
    const judged = (videos: string[]) => issueResearchReceipt(
      "treatment_coverage",
      { boundary: "ledger_consistent_for_synthesis", lock: "pass", videos, target: discoveryQueryDigest([target]), broad: true },
      options
    );
    expect(finalizeResearch({
      ...base, receipts: [...ready, judged(["aaaaaaaaaaa"])], treatment_choice: "compared"
    }, options).status).toBe("ready");
    const foreign = finalizeResearch({
      ...base, receipts: [...ready, judged(["aaaaaaaaaaa", "zzzzzzzzzzz"])], treatment_choice: "compared"
    }, options);
    expect(foreign.status).toBe("not_ready");
    expect(foreign.next_steps.join(" ")).toContain("judged video(s) zzzzzzzzzzz that no discovery receipt");
  });

  it("is ready when community and key studies are backed by receipts", () => {
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ id: "https://doi.org/10.1002/ART.41142", status: "validated" }]
    }, options);
    expect(result.status).toBe("ready");
    expect(result.next_steps).toEqual([]);
    expect(result.limits).toEqual([]);
    expect(result.community).toEqual({
      decision: "researched",
      surveys: 1,
      discovery_rounds: 3,
      saturated: true,
      depth: "first_pass",
      first_pass_complete: true,
      open_leads: [],
      audited_videos: ["aaaaaaaaaaa"],
      material_videos: ["aaaaaaaaaaa"]
    });
    const permit = verifyResearchReceipt(result.finalization_receipt!, options);
    expect(permit.ok && permit.kind).toBe("finalization");
    expect(permit.ok && permit.claims.status).toBe("ready");
  });

  it("accepts a Gemini scout round as community discovery without a YouTube survey", () => {
    const result = finalizeResearch({
      receipts: [repeatScout, videoB, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      material_video_ids: ["bbbbbbbbbbb"],
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    const steps = result.next_steps.join(" ");
    expect(steps).not.toMatch(/Find community videos/u);
    expect(steps).not.toMatch(/Survey community evidence/u);
  });

  it("is not ready when community research or a material video audit is missing", () => {
    const noSurvey = finalizeResearch({
      receipts: [study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(noSurvey.status).toBe("not_ready");
    expect(noSurvey.next_steps.join(" ")).toMatch(/scout_gemini_youtube_candidates .*survey_youtube_community only if the scout is unavailable.*rediscovery_leads/u);
    expect(noSurvey.finalization_receipt).toBeUndefined();

    const missingVideo = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      material_video_ids: ["aaaaaaaaaaa", "ccccccccccc"],
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(missingVideo.status).toBe("not_ready");
    expect(missingVideo.next_steps).toEqual([
      "Audit video ccccccccccc with audit_youtube_video_community and continue until the audit completes."
    ]);
  });

  it("does not count a one-call community audit as an audit of each video", () => {
    // Issued before the other rounds, so the later two still show saturation.
    const communityAudit = sign("youtube_community_audit", {
      videos: ["aaaaaaaaaaa", "bbbbbbbbbbb"], state: "api_visible_complete", lock: "pass", q: "d4d4d4d4d4d4",
      open: 0, t: Date.parse("2026-09-26T10:00:00.000Z")
    }, options);
    const request = {
      community_evidence: "researched" as const,
      treatment_choice: "not_compared" as const,
      research_target: TARGET,
      material_video_ids: ["aaaaaaaaaaa"],
      key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }]
    };
    const communityOnly = finalizeResearch({
      ...request,
      receipts: [communityAudit, emptySearch, repeatScout, study]
    }, options);
    expect(communityOnly.status).toBe("not_ready");
    expect(communityOnly.community).toMatchObject({ surveys: 1, discovery_rounds: 3, audited_videos: [] });
    expect(communityOnly.next_steps).toEqual([
      "Video aaaaaaaaaaa has only a one-call community audit. Audit video aaaaaaaaaaa with " +
        "audit_youtube_video_community and continue until the audit completes."
    ]);

    // The video's own audit satisfies it.
    const audited = finalizeResearch({
      ...request,
      receipts: [communityAudit, emptySearch, repeatScout, videoA, study]
    }, options);
    expect(audited.status).toBe("ready");
    expect(audited.community).toMatchObject({ audited_videos: ["aaaaaaaaaaa"] });
  });

  it("carries the comments that were read into the answer, even when later sources dominate", () => {
    // The reported failure: a one-call audit read three videos' comments, then
    // PubMed and web searches followed and the answer never mentioned YouTube.
    const communityAudit = sign("youtube_community_audit", {
      videos: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"], state: "api_visible_complete", lock: "pass",
      q: "e5e5e5e5e5e5", open: 0, t: Date.parse("2026-09-26T10:00:00.000Z")
    }, options);
    const request = {
      receipts: [communityAudit, emptySearch, repeatScout, study],
      community_evidence: "researched" as const,
      treatment_choice: "not_compared" as const,
      research_target: TARGET,
      no_material_video_reason: "The comments were read in the one-call audit and add no approach worth a full audit.",
      key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }]
    };
    const silent = finalizeResearchGate(request, options);
    expect(silent.status).toBe("not_ready");
    expect(silent.next_steps).toEqual([
      "Say what the comments you read showed: give community_findings (benefit, no-effect and adverse reports, " +
        "creators versus independent commenters, and the effect on the answer), even if the signal is weak or neutral."
    ]);
    expect(silent.must_report).toEqual([]);

    const partial = finalizeResearchGate({
      ...request,
      community_findings: findingsFor(["aaaaaaaaaaa", "ccccccccccc", "ddddddddddd"])
    }, options);
    expect(partial.next_steps).toEqual([
      "Add bbbbbbbbbbb to community_findings.videos_reviewed: their comments were read, so the findings must account for them.",
      "community_findings.videos_reviewed lists ddddddddddd, but no comment-audit receipt passed here covers them; " +
        "pass the receipt or drop them."
    ]);

    // A weak lane still reaches the answer.
    const weak = finalizeResearchGate({
      ...request,
      community_findings: {
        ...findingsFor(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]),
        benefit_reports: "Two commenters reported deeper sleep.",
        effect_on_answer: "Adds no strong independent signal; the answer rests on the studies."
      }
    }, options);
    expect(weak.status).not.toBe("not_ready");
    expect(weak.must_report).toEqual([expect.stringMatching(
      /^YouTube comments \(3 video\(s\) read\): Benefits: Two commenters reported deeper sleep\. .*Effect on the answer: Adds no strong independent signal; the answer rests on the studies\. Report this lane in the answer even if later sources dominate; if its signal is weak, say so\.$/u
    )]);
  });

  it("needs findings only for videos whose comments were read", () => {
    // Comments disabled: the audit ends at an access boundary with nothing read.
    const disabled = sign("youtube_video_audit", {
      video: "bbbbbbbbbbb", state: "completed_with_access_boundary", lock: "pass", records: 0
    }, options);
    const request = {
      community_evidence: "researched" as const,
      treatment_choice: "not_compared" as const,
      research_target: TARGET,
      material_video_ids: ["aaaaaaaaaaa", "bbbbbbbbbbb"],
      key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }]
    };
    const receipts = [survey, emptySearch, repeatScout, videoA, disabled, study];
    const onlyRead = finalizeResearchGate({
      ...request, receipts, community_findings: findingsFor(["aaaaaaaaaaa"])
    }, options);
    expect(onlyRead.next_steps).toEqual([]);
    expect(onlyRead.must_report).toEqual([expect.stringMatching(/^YouTube comments \(1 video\(s\) read\): /u)]);
    // Listing the disabled video is allowed, and it is not counted as read.
    const both = finalizeResearchGate({
      ...request, receipts, community_findings: findingsFor(["aaaaaaaaaaa", "bbbbbbbbbbb"])
    }, options);
    expect(both.next_steps).toEqual([]);
    expect(both.must_report).toEqual([expect.stringMatching(/^YouTube comments \(1 video\(s\) read\): /u)]);

    // A one-call audit signs which of its videos it read.
    const oneCall = sign("youtube_community_audit", {
      videos: ["ddddddddddd", "eeeeeeeeeee"], read: ["ddddddddddd"], state: "completed_with_access_boundary",
      lock: "pass", q: "f6f6f6f6f6f6", open: 0, t: Date.parse("2026-09-26T10:00:00.000Z")
    }, options);
    const oneCallRequest = {
      ...request,
      material_video_ids: undefined,
      no_material_video_reason: "Only the one-call audit read these comments.",
      receipts: [oneCall, emptySearch, repeatScout, study]
    };
    expect(finalizeResearchGate(oneCallRequest, options).next_steps).toEqual([
      "Say what the comments you read showed: give community_findings (benefit, no-effect and adverse reports, " +
        "creators versus independent commenters, and the effect on the answer), even if the signal is weak or neutral."
    ]);
    const covered = finalizeResearchGate({ ...oneCallRequest, community_findings: findingsFor(["ddddddddddd"]) }, options);
    expect(covered.next_steps).toEqual([]);
    expect(covered.must_report).toHaveLength(1);

    // Comments once read stay read: a complete audit that later finds none
    // (deleted or since disabled) does not drop them, in either order.
    const bounded = sign("youtube_video_audit", {
      video: "bbbbbbbbbbb", state: "completed_with_access_boundary", lock: "pass", records: 50
    }, options);
    const emptied = sign("youtube_video_audit", {
      video: "bbbbbbbbbbb", state: "api_visible_complete", lock: "pass", records: 0
    }, options);
    for (const audits of [[bounded, emptied], [emptied, bounded]]) {
      const reread = finalizeResearchGate({
        ...request,
        receipts: [survey, emptySearch, repeatScout, videoA, ...audits, study],
        community_findings: findingsFor(["aaaaaaaaaaa"])
      }, options);
      expect(reread.next_steps).toEqual([
        "Add bbbbbbbbbbb to community_findings.videos_reviewed: their comments were read, so the findings must account for them."
      ]);
    }
  });

  it("does not accept model-reported validation or lead status without receipts", () => {
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [
        { id: "10.1002/art.41142", status: "validated" },
        { id: "10.1000/unattempted", status: "lead_only", reason: "paywalled" }
      ]
    }, options);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toHaveLength(2);
    expect(result.next_steps[0]).toMatch(/^For 10\.1002\/art\.41142: acquire_open_full_text/u);
    expect(result.next_steps[1]).toMatch(/^Try acquire_open_full_text for 10\.1000\/unattempted/u);
  });

  it("turns bounded audits and server-proven leads into limits", () => {
    const noDoiRecord = sign("pubmed_record", { pmid: "31234567" }, options);
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, videoB, study, lead, noDoiRecord],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [
        { id: "10.1002/art.41142", status: "validated" },
        { id: "10.1016/j.joca.2020.01.001", status: "validated" },
        { id: "PMID: 31234567", status: "lead_only", reason: "abstract only; no DOI" }
      ]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.sources).toEqual({
      validated: ["10.1002/art.41142"],
      lead_only: ["10.1016/j.joca.2020.01.001", "PMID: 31234567"]
    });
    expect(result.limits).toEqual([
      "Comments on video bbbbbbbbbbb were only partly accessible; treat its community signal as bounded.",
      "Cite 10.1016/j.joca.2020.01.001 as a lead: no open full text was available, so its methods were not audited.",
      "Cite PMID: 31234567 as a lead: PubMed lists no DOI, so no open full text could be acquired and its methods were not audited."
    ]);
    expect(result.finalization_receipt).toBeDefined();
  });

  it("does not accept a DOI-less PMID as a lead when PubMed lists an open copy in PMC", () => {
    const pmcRecord = sign("pubmed_record", { pmid: "31234567", pmcid: "PMC7654321" }, options);
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study, pmcRecord],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [
        { id: "10.1002/art.41142", status: "validated" },
        { id: "PMID: 31234567", status: "lead_only", reason: "no DOI" }
      ]
    }, options);
    expect(result.status).toBe("not_ready");
    expect(result.sources.lead_only).toEqual([]);
    expect(result.next_steps).toEqual([
      "PubMed lists an open full text in PubMed Central (PMC7654321) for PMID 31234567 but no DOI. Find its DOI " +
        "(search_europe_pmc for PMC7654321) and read it with acquire_open_full_text and that pmcid, or leave it out of " +
        "key_sources and label its claims unverified."
    ]);
  });

  it("binds material videos to discovery receipts passed in the same call", () => {
    const otherSurvey = sign("youtube_survey", { access: "complete", searches: 2, videos: ["zzzzzzzzzzz"], q: "d4d4d4d4d4d4" }, options);
    const unbound = finalizeResearch({
      receipts: [otherSurvey, emptySearch, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(unbound.status).toBe("not_ready");
    expect(unbound.next_steps).toEqual([
      "Video aaaaaaaaaaa is not among the videos found by the surveys, scouts or searches whose receipts were passed; " +
        "pass the receipt of the discovery call that found it, or drop it from material_video_ids."
    ]);

    const scout = sign("youtube_scout", {
      videos: ["aaaaaaaaaaa"], open: 0, q: "e5e5e5e5e5e5", t: Date.parse("2026-09-26T10:00:00.000Z")
    }, options);
    expect(finalizeResearch({
      receipts: [scout, otherSurvey, emptySearch, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options).status).toBe("ready");
  });

  it("states a partial survey as a limit", () => {
    // The first round, as the survey it replaces was.
    const partial = sign("youtube_survey", {
      access: "partial", searches: 3, videos: ["aaaaaaaaaaa"], q: "f6f6f6f6f6f6", t: Date.parse("2026-09-26T10:00:00.000Z")
    }, options);
    const result = finalizeResearch({
      receipts: [partial, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual([
      "1 community survey(s) were only partly completed (some searches failed or hit limits); say the community picture may be incomplete."
    ]);
  });

  it("needs server evidence before accepting PMID, PMCID or other leads", () => {
    const withDoi = sign("pubmed_record", { pmid: "4242", doi: "10.1016/j.joca.2020.01.001" }, options);
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, withDoi],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [
        { id: "PMC123", status: "lead_only", reason: "not retrieved" },
        { id: "PMID 999", status: "lead_only", reason: "abstract only" },
        { id: "4242", status: "lead_only" },
        { id: "WHO guideline 2024", status: "lead_only", reason: "no identifier" }
      ]
    }, options);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      "Try acquire_open_full_text for PMC123 with its DOI and this pmcid before treating it as lead_only; pass the research_receipt it returns.",
      "Fetch PMID 999 with fetch_pubmed_record and pass its research_receipt; if it has a DOI, try acquire_open_full_text.",
      "Try acquire_open_full_text for 4242 (DOI 10.1016/j.joca.2020.01.001) before treating it as lead_only; pass the research_receipt it returns.",
      "Identify WHO guideline 2024 by DOI, PMID or PMCID, or leave it out of key_sources and label it unverified in the answer."
    ]);

    // The PMID's DOI links it to an acquisition lead and to a validated audit.
    const byDoi = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, withDoi, lead],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ id: "4242", status: "lead_only" }]
    }, options);
    expect(byDoi.sources.lead_only).toEqual(["4242"]);
  });

  it("keeps discovering until two rounds from new angles add no video worth auditing", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };

    const oneRound = finalizeResearch({ ...base, receipts: [survey, videoA, study] }, options);
    expect(oneRound.status).toBe("not_ready");
    expect(oneRound.community.saturated).toBe(false);
    expect(oneRound.next_steps).toEqual([expect.stringMatching(/^Run another discovery round from a new angle/u)]);

    // Video d first turned up in the last round, so the search is still finding material.
    const lateFind = sign("youtube_scout", { videos: ["ddddddddddd"], open: 0, q: "g7g7g7g7g7g7" }, options);
    const videoD = sign("youtube_video_audit", { video: "ddddddddddd", state: "api_visible_complete", lock: "pass", records: 90 }, options);
    const fresh = finalizeResearch({ ...base, receipts: [survey, emptySearch, lateFind, videoA, videoD, study] }, options);
    expect(fresh.status).toBe("not_ready");
    expect(fresh.next_steps).toEqual([expect.stringMatching(/^Discovery has not saturated: ddddddddddd first turned up/u)]);

    // Two more rounds from different angles that add nothing new close it,
    // wherever the caller puts them in the list.
    const laterSearch = sign("youtube_search", { videos: ["ddddddddddd"], q: "h8h8h8h8h8h8" }, options);
    const closingScout = sign("youtube_scout", { videos: ["bbbbbbbbbbb"], open: 0, q: "c3c3c3c3c3c3" }, options);
    const closed = finalizeResearch({
      ...base,
      receipts: [closingScout, laterSearch, survey, lateFind, emptySearch, videoA, videoD, study]
    }, options);
    expect(closed.status).toBe("ready");
    expect(closed.community).toMatchObject({ discovery_rounds: 5, saturated: true, material_videos: ["aaaaaaaaaaa", "ddddddddddd"] });
  });

  it("does not count repeated searches or unverified scout candidates as saturation", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
    // A later call repeating the same query (a byte-identical receipt would count once).
    const sameAngle = sign("youtube_search", { videos: ["zzzzzzzzzzz"], q: "b2b2b2b2b2b2" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, sameAngle, videoA, study] }, options).next_steps)
      .toEqual([expect.stringMatching(/^The last two discovery rounds repeated the same searches/u)]);

    const openScout = sign("youtube_scout", { videos: [], open: 3, q: "i9i9i9i9i9i9" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, openScout, videoA, study] }, options).next_steps)
      .toEqual([expect.stringMatching(/^A recent round left results unchecked/u)]);

    // A search whose results continue on an unread page is not a settled round.
    const unreadPage = sign("youtube_search", { videos: [], open: 1, q: "j0j0j0j0j0j0" }, options);
    expect(finalizeResearch({
      ...base, receipts: [survey, emptySearch, unreadPage, videoA, study], research_depth: "deep"
    }, options)).toMatchObject({
      status: "not_ready",
      community: { saturated: false },
      next_steps: [expect.stringContaining("Continue a search with its next cursor")]
    });
  });

  it("lets a first pass stop at its cap and hand back open leads instead of searching on", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
    // Four rounds, the last still finding a video worth auditing: not saturated, but the first pass is done.
    const round = (q: string, videos: string[]) => sign("youtube_search", { videos, q }, options);
    const lateVideo = sign("youtube_video_audit", { video: "eeeeeeeeeee", state: "api_visible_complete", lock: "pass", records: 50 }, options);
    const receipts = [survey, round("k1k1k1k1k1k1", []), round("l2l2l2l2l2l2", []), round("m3m3m3m3m3m3", ["eeeeeeeeeee"]), videoA, lateVideo, study];

    const noLeads = finalizeResearch({ ...base, receipts }, options);
    expect(noLeads.status).toBe("not_ready");
    expect(noLeads.community).toMatchObject({ saturated: false, first_pass_complete: true });
    expect(noLeads.next_steps).toEqual([expect.stringMatching(/^The first pass is done but discovery has not saturated: list open_leads/u)]);

    const withLeads = finalizeResearch({
      ...base,
      receipts,
      open_leads: [
        { topic: "Gelatin and collagen for hip pain", why: "Several commenters report it; no video on it was audited yet." },
        { topic: "Named physiotherapy programs", why: "Comments name two programs that no search has covered." }
      ]
    }, options);
    expect(withLeads.status).toBe("ready_with_limits");
    expect(withLeads.community.open_leads).toEqual(["Gelatin and collagen for hip pain", "Named physiotherapy programs"]);
    expect(withLeads.limits).toEqual([
      "First pass only; discovery had not saturated. End the answer with the open leads (Gelatin and collagen for hip pain; " +
        "Named physiotherapy programs), in plain language for the user (no video IDs or internal codes), why each looks " +
        "promising and roughly what another pass would cost, and ask whether to continue on all or part."
    ]);

    // Deep research keeps going until discovery saturates.
    const deep = finalizeResearch({ ...base, receipts, research_depth: "deep" }, options);
    expect(deep.status).toBe("not_ready");
    expect(deep.community).toMatchObject({ depth: "deep", first_pass_complete: false });
    expect(deep.next_steps).toEqual([expect.stringMatching(/^Discovery has not saturated: eeeeeeeeeee first turned up/u)]);
  });

  it("does not count a repeated receipt or a repeated query toward the first-pass cap", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }],
      open_leads: [{ topic: "Anything else", why: "Stopping early." }]
    };
    const round = sign("youtube_search", { videos: [], q: "k1k1k1k1k1k1" }, options);
    const duplicated = finalizeResearch({ ...base, receipts: [survey, round, round, round, round, videoA, study] }, options);
    expect(duplicated.receipts_verified).toBe(4);
    expect(duplicated.community).toMatchObject({ discovery_rounds: 2, first_pass_complete: false });
    expect(duplicated.status).toBe("not_ready");

    // Distinct receipts that repeat one query are still one angle.
    const sameQuery = ["fffffffffff", "ggggggggggg", "hhhhhhhhhhh"].map((video) =>
      sign("youtube_search", { videos: [video], q: "k1k1k1k1k1k1" }, options)
    );
    const repeated = finalizeResearch({ ...base, receipts: [survey, ...sameQuery, videoA, study] }, options);
    expect(repeated.community).toMatchObject({ discovery_rounds: 4, first_pass_complete: false });
    expect(repeated.status).toBe("not_ready");
  });

  it("does not let a first pass stop before it has audited or searched enough", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
    const lateFind = sign("youtube_scout", { videos: ["ddddddddddd"], open: 0, q: "g7g7g7g7g7g7" }, options);
    const videoD = sign("youtube_video_audit", { video: "ddddddddddd", state: "api_visible_complete", lock: "pass", records: 90 }, options);
    const early = finalizeResearch({
      ...base,
      receipts: [survey, emptySearch, lateFind, videoA, videoD, study],
      open_leads: [{ topic: "Anything else", why: "Stopping early." }]
    }, options);
    expect(early.status).toBe("not_ready");
    expect(early.community.first_pass_complete).toBe(false);
    expect(early.next_steps[0]).toMatch(/A first pass may also stop once 6 material videos are audited or 4 rounds are done/u);
  });

  it("lets a niche topic finish with no video once discovery has saturated", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
    const emptySurvey = sign("youtube_survey", { access: "complete", searches: 6, videos: [], q: "j0j0j0j0j0j0" }, options);
    const nothing = finalizeResearch({ ...base, receipts: [emptySurvey, emptySearch, study] }, options);
    expect(nothing.status).toBe("ready_with_limits");
    expect(nothing.limits).toEqual(["No video turned up in 2 discovery rounds; say that community evidence on this is thin."]);

    // Videos were found but none was audited: the model must say why.
    const unexplained = finalizeResearch({ ...base, receipts: [survey, emptySearch, repeatScout, study] }, options);
    expect(unexplained.status).toBe("not_ready");
    expect(unexplained.next_steps).toEqual([expect.stringMatching(/^Discovery found 3 video\(s\) but none is in material_video_ids/u)]);
    const explained = finalizeResearch({
      ...base,
      receipts: [survey, emptySearch, repeatScout, study],
      no_material_video_reason: "All three are product advertisements with comments disabled."
    }, options);
    expect(explained.status).toBe("ready_with_limits");
    expect(explained.limits).toEqual([
      "None of the 3 video(s) found in 3 discovery rounds was worth auditing; say that community evidence on this is thin."
    ]);
  });

  it("lists rejected receipts and requires a reason to skip community research", () => {
    const result = finalizeResearch({
      receipts: [`${study.slice(0, -2)}xx`, "not-a-receipt"],
      community_evidence: "not_relevant",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: []
    }, options);
    expect(result.status).toBe("not_ready");
    expect(result.receipts_rejected).toEqual([
      { index: 0, reason: "signature_invalid" },
      { index: 1, reason: "malformed" }
    ]);
    expect(result.next_steps).toHaveLength(2);

    const reasoned = finalizeResearch({
      receipts: [study],
      community_evidence: "not_relevant",
      treatment_choice: "not_compared",
      research_target: TARGET,
      not_relevant_reason: "Dose conversion question with no treatment choice.",
      key_sources: [{ id: "PMC10518852", status: "validated" }]
    }, options);
    expect(reasoned.status).toBe("ready");
  });

  it("reports when receipts cannot be verified on this server", () => {
    const result = finalizeResearch({
      receipts: [],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: []
    }, { secret: undefined });
    expect(result.status).toBe("receipts_unavailable");
    expect(result.finalization_receipt).toBeUndefined();
  });

  it("counts only the discovery done for this research target", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }]
    };
    // Saturated rounds and an audit from an earlier question in the same chat.
    const migraine = researchTargetDigest("Adults with chronic migraine trying to cut attacks");
    const earlier = [
      sign("youtube_survey", { access: "complete", searches: 3, videos: ["aaaaaaaaaaa"], q: "m1m1m1m1m1m1", target: migraine }, options),
      sign("youtube_search", { videos: [], q: "m2m2m2m2m2m2", target: migraine }, options),
      sign("youtube_scout", { videos: [], open: 0, q: "m3m3m3m3m3m3", target: migraine }, options)
    ];
    const reused = finalizeResearch({
      ...base, research_target: "Adults with a rare cancer looking at options", receipts: [...earlier, videoA, study]
    }, options);
    expect(reused.status).toBe("not_ready");
    expect(reused.community).toMatchObject({ discovery_rounds: 0, surveys: 0 });
    expect(reused.receipts_rejected).toEqual([0, 1, 2].map((index) => ({ index, reason: "other_research_target" })));
    expect(reused.next_steps.join(" ")).toContain("3 discovery receipt(s) passed here were made for another research target");
    expect(reused.next_steps.join(" ")).toContain("Video aaaaaaaaaaa was found only by discovery for another research target");

    // A search run without a research target does not count either.
    const untargeted = sign("youtube_search", { videos: [], q: "n1n1n1n1n1n1", target: undefined }, options);
    const withUntargeted = finalizeResearch({
      ...base, research_target: TARGET, receipts: [survey, emptySearch, repeatScout, untargeted, videoA, study]
    }, options);
    expect(withUntargeted.receipts_rejected).toEqual([{ index: 3, reason: "no_research_target" }]);
    expect(withUntargeted.community.discovery_rounds).toBe(3);
    expect(withUntargeted.status).toBe("ready");

    // Case and spacing do not change the target.
    expect(finalizeResearch({
      ...base, research_target: `  ${TARGET.toUpperCase()} `, receipts: [survey, emptySearch, repeatScout, videoA, study]
    }, options).status).toBe("ready");
  });

  it("orders rounds by their signed issue order, not by the caller", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }], research_depth: "deep" as const
    };
    // Three searches issued within one second; the last one found video F.
    const second = Date.parse("2026-09-26T11:59:59.000Z");
    const inSecond = (q: string, videos: string[], t: number) =>
      issueResearchReceipt("youtube_search", { videos, q, target: researchTargetDigest(TARGET), t }, {
        secret: SECRET, now: () => new Date(second)
      });
    const empty1 = inSecond("p1p1p1p1p1p1", [], second + 100);
    const empty2 = inSecond("p2p2p2p2p2p2", [], second + 200);
    const finder = inSecond("p3p3p3p3p3p3", ["fffffffffff"], second + 300);
    const videoF = sign("youtube_video_audit", { video: "fffffffffff", state: "api_visible_complete", lock: "pass", records: 30 }, options);
    const reordered = finalizeResearch({ ...base, receipts: [survey, finder, empty1, empty2, videoA, videoF, study] }, options);
    expect(reordered.status).toBe("not_ready");
    expect(reordered.next_steps).toEqual([expect.stringMatching(/^Discovery has not saturated: fffffffffff first turned up/u)]);

    // Rounds the signed order cannot separate all count as recent.
    const tied = inSecond("p4p4p4p4p4p4", [], second + 300);
    const withTie = finalizeResearch({ ...base, receipts: [survey, empty1, finder, tied, videoA, videoF, study] }, options);
    expect(withTie.community.saturated).toBe(false);
    expect(withTie.next_steps).toEqual([expect.stringMatching(/^Discovery has not saturated: fffffffffff/u)]);
  });

  it("normalizes DOI, PMID and PMCID spellings", () => {
    expect(normalizeIdentifier(" doi:10.1002/ART.41142 ")).toBe("10.1002/art.41142");
    expect(normalizeIdentifier("https://dx.doi.org/10.1002/art.41142")).toBe("10.1002/art.41142");
    expect(normalizeIdentifier("pmc123")).toBe("PMC123");
    expect(normalizeIdentifier("PMID: 42")).toBe("42");
    expect(normalizeIdentifier("PMID 42")).toBe("42");
    expect(normalizeIdentifier("PMCID PMC7")).toBe("PMC7");
  });
});
