import { describe, expect, it } from "vitest";

import {
  finalizeResearch,
  normalizeIdentifier
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  issueResearchReceipt,
  verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";

const SECRET = "research-finalization-test-secret-0123456789";
const now = () => new Date("2026-09-26T12:00:00.000Z");
const options = { secret: SECRET, now };
const sign = (...args: Parameters<typeof issueResearchReceipt>) =>
  issueResearchReceipt(args[0], args[1], options);

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
  it("is ready when community and key studies are backed by receipts", () => {
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
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

  it("is not ready when community research or a material video audit is missing", () => {
    const noSurvey = finalizeResearch({
      receipts: [study],
      community_evidence: "researched",
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(noSurvey.status).toBe("not_ready");
    expect(noSurvey.next_steps.join(" ")).toMatch(/survey_youtube_community/u);
    expect(noSurvey.finalization_receipt).toBeUndefined();

    const missingVideo = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      material_video_ids: ["aaaaaaaaaaa", "ccccccccccc"],
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(missingVideo.status).toBe("not_ready");
    expect(missingVideo.next_steps).toEqual([
      "Audit video ccccccccccc with audit_youtube_video_community and continue until the audit completes."
    ]);
  });

  it("does not accept model-reported validation or lead status without receipts", () => {
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA],
      community_evidence: "researched",
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

  it("binds material videos to discovery receipts passed in the same call", () => {
    const otherSurvey = sign("youtube_survey", { access: "complete", searches: 2, videos: ["zzzzzzzzzzz"], q: "d4d4d4d4d4d4" }, options);
    const unbound = finalizeResearch({
      receipts: [otherSurvey, emptySearch, videoA, study],
      community_evidence: "researched",
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(unbound.status).toBe("not_ready");
    expect(unbound.next_steps).toEqual([
      "Video aaaaaaaaaaa is not among the videos found by the surveys, scouts or searches whose receipts were passed; " +
        "pass the receipt of the discovery call that found it, or drop it from material_video_ids."
    ]);

    const scout = sign("youtube_scout", { videos: ["aaaaaaaaaaa"], open: 0, q: "e5e5e5e5e5e5" }, options);
    expect(finalizeResearch({
      receipts: [scout, otherSurvey, emptySearch, videoA, study],
      community_evidence: "researched",
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options).status).toBe("ready");
  });

  it("states a partial survey as a limit", () => {
    const partial = sign("youtube_survey", { access: "partial", searches: 3, videos: ["aaaaaaaaaaa"], q: "f6f6f6f6f6f6" }, options);
    const result = finalizeResearch({
      receipts: [partial, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
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
      key_sources: [{ id: "4242", status: "lead_only" }]
    }, options);
    expect(byDoi.sources.lead_only).toEqual(["4242"]);
  });

  it("keeps discovering until two rounds from new angles add no video worth auditing", () => {
    const base = { community_evidence: "researched" as const, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };

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

    // Two more empty rounds from different angles close it.
    const laterSearch = sign("youtube_search", { videos: ["ddddddddddd"], q: "h8h8h8h8h8h8" }, options);
    const closed = finalizeResearch({
      ...base,
      receipts: [survey, emptySearch, lateFind, laterSearch, repeatScout, videoA, videoD, study]
    }, options);
    expect(closed.status).toBe("ready");
    expect(closed.community).toMatchObject({ discovery_rounds: 5, saturated: true, material_videos: ["aaaaaaaaaaa", "ddddddddddd"] });
  });

  it("does not count repeated searches or unverified scout candidates as saturation", () => {
    const base = { community_evidence: "researched" as const, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
    const sameAngle = sign("youtube_search", { videos: [], q: "b2b2b2b2b2b2" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, sameAngle, videoA, study] }, options).next_steps)
      .toEqual([expect.stringMatching(/^The last two discovery rounds repeated the same searches/u)]);

    const openScout = sign("youtube_scout", { videos: [], open: 3, q: "i9i9i9i9i9i9" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, openScout, videoA, study] }, options).next_steps)
      .toEqual([expect.stringMatching(/^A recent scout round left candidates it could not verify/u)]);
  });

  it("lets a first pass stop at its cap and hand back open leads instead of searching on", () => {
    const base = { community_evidence: "researched" as const, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
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
        "Named physiotherapy programs), why each looks promising and roughly what another pass would cost, and ask whether to continue on all or part."
    ]);

    // Deep research keeps going until discovery saturates.
    const deep = finalizeResearch({ ...base, receipts, research_depth: "deep" }, options);
    expect(deep.status).toBe("not_ready");
    expect(deep.community).toMatchObject({ depth: "deep", first_pass_complete: false });
    expect(deep.next_steps).toEqual([expect.stringMatching(/^Discovery has not saturated: eeeeeeeeeee first turned up/u)]);
  });

  it("does not let a first pass stop before it has audited or searched enough", () => {
    const base = { community_evidence: "researched" as const, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
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
    const base = { community_evidence: "researched" as const, key_sources: [{ id: "10.1002/art.41142", status: "validated" as const }] };
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
      not_relevant_reason: "Dose conversion question with no treatment choice.",
      key_sources: [{ id: "PMC10518852", status: "validated" }]
    }, options);
    expect(reasoned.status).toBe("ready");
  });

  it("reports when receipts cannot be verified on this server", () => {
    const result = finalizeResearch({
      receipts: [],
      community_evidence: "researched",
      key_sources: []
    }, { secret: undefined });
    expect(result.status).toBe("receipts_unavailable");
    expect(result.finalization_receipt).toBeUndefined();
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
