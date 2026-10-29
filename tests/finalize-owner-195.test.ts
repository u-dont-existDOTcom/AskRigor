import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { finalizeResearch } from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, researchTargetDigest, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const secret = "owner-195-final-check-test-secret-0123456789";
const options = { secret };
const target = "Independence of the two rat-ulcer reports";
const doi = "10.1000/rat-ulcer";
const page = "https://www.jgtps.com/admin/uploads/tUXQnG.pdf";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, options);
const audit = sign("study_audit", { id: doi, url: page });
const base = {
  research_target: target, receipts: [audit],
  answer_draft: `[Rat study](${page}) reports a provisional result.`,
  key_sources: [{ id: doi, status: "validated", read_depth: "full_text_audited", answer_marker: "Rat study" }]
};
const check = (overrides: Record<string, unknown> = {}) => finalizeResearch({ ...base, ...overrides }, options);

describe("owner answers 193a and 195: only five blocking checks", () => {
  it("passes a replay with every other declaration missing in one round, preserving notes, limits and the draft digest", () => {
    const result = check();
    expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [], round: { number: 1 } });
    expect(result.notes).toEqual(expect.arrayContaining([expect.stringContaining("absence_claims is missing")]));
    expect(new Set(result.notes).size).toBe(result.notes!.length);
    expect(result.limits.length).toBeGreaterThan(0);
    expect(result.checked_answer).toBe(base.answer_draft);
    const receipt = verifyResearchReceipt(result.finalization_receipt!, options);
    expect(receipt.ok && receipt.claims.answer).toBe(createHash("sha256").update(base.answer_draft).digest("hex"));
    const again = check({ round_token: result.round_token });
    expect(again).toMatchObject({ status: "ready_with_limits", round: { number: 1 }, next_steps: [] });
  });

  it.each([
    ["source receipt", { receipts: [] }, "no receipt"],
    ["source link", { answer_draft: "Rat study reports a provisional result." }, "no link"],
    ["read depth", { receipts: [sign("full_text_lead", { doi, state: "ABSTRACT_ONLY" })] }, "read_depth"],
    ["arithmetic", { binary_results: [{ quote: "30 of 100 versus 10 of 100 at 12 weeks: NNT 9.", outcome: "response", better: "more", option: "drug", option_events: 30, option_total: 100, comparator: "placebo", comparator_events: 10, comparator_total: 100, follow_up: "12 weeks", nnt: 9 }] }, "rounds up to 5"],
    ["shown figure", { binary_results: [{ quote: "99% versus 88%", outcome: "response", better: "more", option: "drug", option_events: 30, option_total: 100, comparator: "placebo", comparator_events: 10, comparator_total: 100, follow_up: "12 weeks" }] }, "quotes no figure"],
    ["harm screen", { safety_claims: [{ quote: "Harm was reported.", direction: "harm", exposure: "drug", basis: "not_quantified" }] }, "harm_screen"],
    ["retracted statement", { answer_draft: `${base.answer_draft}\n\nThe experiments were independent.`, corrections: [{ retracted: "The experiments were independent.", change: "Independence is unknown.", by_user: false }] }, "wrong statement still appears"]
  ])("still blocks %s", (_name, overrides, expected) => {
    const result = check(overrides);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.some((step) => step.includes(expected))).toBe(true);
    expect(result.next_step_kinds).toHaveLength(result.next_steps.length);
  });

  it("accepts a URL identified by a receipt, including the r329 publisher PDF, without a marker declaration", () => {
    const result = check({ key_sources: [{ id: page, status: "validated", read_depth: "full_text_audited" }] });
    expect(result.next_steps).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.sources.validated).toEqual([page]);
    expect(check({ receipts: [] , key_sources: [{ id: page, status: "lead_only", read_depth: "partial_text" }] }).status).toBe("not_ready");
    expect(check({ answer_draft: "[Rat study](https://example.org/wrong.pdf)" }).status).toBe("not_ready");
    expect(check({ key_sources: [{ id: page, status: "validated", read_depth: "full_text_audited" }],
      answer_draft: `[Rat study](${page.toLowerCase()})` }).status).toBe("not_ready");
    expect(check({ key_sources: [{ id: page, status: "validated", read_depth: "full_text_audited" }],
      answer_draft: `[Rat study](https://doi.org/${doi})` }).next_steps).toEqual([]);
  });

  it("counts a named search result, record, acquisition, audit, lead or route failure as source provenance", () => {
    for (const receipt of [
      sign("literature_search", { ids: [doi], src: "pubmed" }),
      sign("pubmed_record", { pmid: "123456", doi }),
      sign("full_text_read", { doi }), audit,
      sign("full_text_lead", { doi, state: "ABSTRACT_ONLY" }),
      sign("full_text_route_failure", { doi })
    ]) {
      const result = check({ receipts: [receipt], answer_draft: `[Rat study](https://doi.org/${doi})`,
        key_sources: [{ id: doi, status: "lead_only", read_depth: "metadata_only" }] });
      expect(result.next_steps, receipt).toEqual([]);
    }
    const rejected = check({ receipts: ["not a receipt"] });
    expect(rejected.receipts_verified).toBe(0);
    expect(rejected.notes).toEqual(expect.arrayContaining([expect.stringContaining("not a whole research receipt")]));
    expect(rejected.status).toBe("not_ready");
  });

  it.each([
    ["abstract_only", "Only the abstract"], ["partial_text", "Only part of the text"]
  ])("keeps a %s reading boundary as a limit when further acquisition is advisory", (read_depth, wording) => {
    const result = check({ receipts: [sign("pubmed_record", { pmid: "123456", doi })],
      key_sources: [{ id: doi, status: "lead_only", read_depth }],
      answer_draft: `[Rat study](https://doi.org/${doi}) is provisional.` });
    expect(result.next_steps).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual(expect.arrayContaining([expect.stringContaining(wording)]));
  });

  it("keeps scout candidates and a spent quota as notes and limits (#377)", () => {
    const scout = (q: string) => sign("youtube_scout", {
      target: researchTargetDigest(target), q, videos: [], unres: ["abcDEF12345"], open: 1, inc: 1, rl: 1
    });
    const result = check({ community_evidence: "researched", receipts: [audit, scout("first"), scout("second")] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.limits.join(" ")).toContain("daily search limit");
    expect(result.notes!.length).toBeGreaterThan(0);
  });

  it("notes an omitted community lane (#376) without making it a step", () => {
    const result = check({ community_evidence: "researched",
      principal_communities: [{ name: "Public forum", platform: "forum" }, { name: "Other forum", platform: "forum" }],
      community_searches: [{
      community: "Public forum", platform: "forum", queries: ["rat study"],
      threads_read: [{ url: "https://example.org/thread" }], benefit_reports: "No benefit reported.",
      no_effect_reports: "No change reported.", adverse_reports: "No harms reported.", effect_on_answer: "No change to the answer."
    }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.notes!.join(" ")).toContain("answer_quotes");
    expect(result.notes!.join(" ")).toContain("Public forum");
  });

  it("requires at least one named harm searched, while other screen defects are notes and its scope is a limit", () => {
    const safety_claims = [{ quote: "Harm was reported.", direction: "harm", exposure: "drug", basis: "not_quantified" }];
    for (const harm_screen of [undefined, [], [{ harm: "anaphylaxis", state: "not_checked" }]]) {
      expect(check({ safety_claims, harm_screen }).status).toBe("not_ready");
    }
    const result = check({ safety_claims, harm_screen: [
      { harm: "anaphylaxis", state: "not_found", search_query: "drug anaphylaxis", sources_searched: ["case_reports"] },
      { harm: "anaphylaxis", state: "reported_signal", sources_searched: ["trial_serious_events"] }
    ] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.notes!.join(" ")).toContain("same harm");
    expect(result.notes!.join(" ")).toContain("not the query");
    expect(result.limits.join(" ")).toContain("anaphylaxis");
    expect(result.limits.join(" ")).toContain("case reports");
  });

  it("blocks carried retractions even when other carried lists are omitted, and stops with only blocking rules", () => {
    const first = check({ corrections: [{ retracted: "The experiments were independent.", change: "Independence is unknown.", by_user: false }] });
    const input = { carried_state: first.carry_forward, answer_draft: `${base.answer_draft}\n\nThe experiments were independent.` };
    let result = check(input);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([expect.stringContaining("taken back earlier")]);
    for (let round = 2; round <= 3; round += 1) result = check({ ...input, round_token: result.round_token });
    expect(result.status).toBe("stopped");
    expect(result.check_report!.could_not).toHaveLength(1);
    expect(result.check_report!.limits).toEqual([]);
    expect(result.check_report!.could_not[0]!.rule).toContain("taken back earlier");
  });
});
