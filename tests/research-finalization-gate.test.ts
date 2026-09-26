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
  access: "complete", searches: 4, videos: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]
}, options);
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
      receipts: [survey, videoA, study],
      community_evidence: "researched",
      key_sources: [{ id: "https://doi.org/10.1002/ART.41142", status: "validated" }]
    }, options);
    expect(result.status).toBe("ready");
    expect(result.next_steps).toEqual([]);
    expect(result.limits).toEqual([]);
    expect(result.community).toEqual({
      decision: "researched",
      surveys: 1,
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
      receipts: [survey, videoA, study],
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
      receipts: [survey, videoA],
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
      receipts: [survey, videoA, videoB, study, lead, noDoiRecord],
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
    const otherSurvey = sign("youtube_survey", { access: "complete", searches: 2, videos: ["zzzzzzzzzzz"] }, options);
    const unbound = finalizeResearch({
      receipts: [otherSurvey, videoA, study],
      community_evidence: "researched",
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(unbound.status).toBe("not_ready");
    expect(unbound.next_steps).toEqual([
      "Video aaaaaaaaaaa is not among the videos found by the surveys, scouts or searches whose receipts were passed; " +
        "pass the receipt of the discovery call that found it, or drop it from material_video_ids."
    ]);

    const scout = sign("youtube_scout", { videos: ["aaaaaaaaaaa"] }, options);
    expect(finalizeResearch({
      receipts: [otherSurvey, scout, videoA, study],
      community_evidence: "researched",
      key_sources: [{ id: "10.1002/art.41142", status: "validated" }]
    }, options).status).toBe("ready");
  });

  it("states a partial survey as a limit", () => {
    const partial = sign("youtube_survey", { access: "partial", searches: 3, videos: ["aaaaaaaaaaa"] }, options);
    const result = finalizeResearch({
      receipts: [partial, videoA, study],
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
      receipts: [survey, videoA, withDoi],
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
      receipts: [survey, videoA, withDoi, lead],
      community_evidence: "researched",
      key_sources: [{ id: "4242", status: "lead_only" }]
    }, options);
    expect(byDoi.sources.lead_only).toEqual(["4242"]);
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
