import { describe, expect, it } from "vitest";

import {
  communitySkipCaveat, finalizeResearch, forumThreadDigest, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// The free Claude test of 5 Nov 2026: the answer declared a subreddit it never searched or read, and passed. An entry of
// community_searches rests on the AI's word, made for its own web search, and community checks are notes (owner answers
// 193a and 195a), so nothing asked for a receipt. Where AskRigor's own forum tools reach a community, one declared
// searched or read now needs this call's receipt for it, matched exactly; a note, since the sources check holds key
// sources, whose threads already need their read receipts there. Every community, thread and receipt here is invented.
const SECRET = "community-receipts-test-secret-0123456789abc";
const TARGET = "Leaves of a synthetic shrub for sleep";
const DOI = "10.1000/receipts-trial";
const AUDITED = "full text read, methods audited by AskRigor";
const REASON = "Synthetic fixture isolates the community receipts.";
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: REASON };
const THREAD = "https://www.reddit.com/r/herbalism/comments/q8x2zz/shrub_leaf_tea_for_sleep/";
const FORUM_THREAD = "https://forum.example.org/t/shrub-leaf-tea/9081";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const audit = sign("study_audit", { doi: DOI, content: "a".repeat(16) });
const read = (url: string) => sign("forum_thread_read", { u: forumThreadDigest(url), n: 12, v: "reddit" });
const redditSearch = (claims: Record<string, unknown>) =>
  sign("forum_search", { q: discoveryQueryDigest(["shrub leaf tea sleep"]), u: [], ...claims } as never);
const FINDINGS = {
  benefit_reports: "Two reported sleeping longer.", no_effect_reports: "One noticed no change.",
  adverse_reports: "None reported harms.", effect_on_answer: "These few reports cannot establish an effect."
};
type Entry = Record<string, unknown>;
const entry = (community: string, platform: string, extra: Entry = {}): Entry => ({
  community, platform, queries: ["shrub leaf tea sleep"], thread_selection: "all_found",
  report_identity: [{ exposure: "leaf tea", reports_read: 3, firsthand_exact: 2, exposure_unclear: 0,
    other_exposure: 0, not_firsthand: 1, measured_after: 0 }], ...FINDINGS, ...extra
});
const input = (searches: Entry[], receipts: string[] = []) => ({
  receipts: [audit, ...receipts], research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage", not_relevant_reason: REASON,
  commercial_review_applicability: NOT_APPLICABLE, intervention_identity: NOT_APPLICABLE, lab_preparation: NOT_APPLICABLE,
  full_text_search: { status: "not_needed", reason: REASON },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [],
  community_searches: searches,
  answer_draft: `[Trial](https://doi.org/${DOI}) (${AUDITED}) tested the leaves' extract.\n\n${communitySkipCaveat(REASON)}`,
  later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED }] }
});
const check = (searches: Entry[], receipts: string[] = []) =>
  assertNextStepsContract(finalizeResearch(input(searches, receipts), { secret: SECRET }));
const receiptNotes = (result: FinalizeResearchOutput) =>
  advisoryNotes(result).filter((note) => / declares (?:it searched|threads read), but no receipt/u.test(note));

// Each note, word for word.
const unsearchedSubreddit = (name: string, subreddit: string) => `community_searches for ${name} declares it ` +
  "searched, but no receipt in this call shows AskRigor searched or read it: search it with search_reddit_threads " +
  `(subreddit ${subreddit}) and read its threads with read_forum_thread, passing their research_receipts, or leave it ` +
  "out of community_searches and don't present it as searched.";
const unreadForum = (name: string) => `community_searches for ${name} declares threads read, but no receipt in this ` +
  "call shows AskRigor read any of them: read them with read_forum_thread and pass their research_receipts, or leave " +
  "the community out of community_searches and don't present it as read.";

describe("a community declared searched or read needs this call's receipt for it", () => {
  it("notes a subreddit declared searched with nothing found that no search here covered, and blocks nothing", () => {
    const placeholder = entry("r/herbalism", "reddit", { access_boundary: "no_relevant_results" });
    const result = check([placeholder]);
    expect(receiptNotes(result)).toEqual([unsearchedSubreddit("r/herbalism", "herbalism")]);
    expect(result.status).toBe("ready");
    expect(result.next_steps).toEqual([]);
    expect(result.round).toEqual({ number: 1, limit: 10 });
    // A search limited to that subreddit, signed by search_reddit_threads, is its receipt; one of another is not.
    expect(receiptNotes(check([placeholder], [redditSearch({ sr: "herbalism" })]))).toEqual([]);
    expect(receiptNotes(check([placeholder], [redditSearch({ sr: "herbs" })])))
      .toEqual([unsearchedSubreddit("r/herbalism", "herbalism")]);
    expect(receiptNotes(check([placeholder], [redditSearch({})])))
      .toEqual([unsearchedSubreddit("r/herbalism", "herbalism")]);
  });

  it("notes a subreddit whose declared threads no receipt shows, and takes a read or a listing as one", () => {
    const declared = entry("r/herbalism", "reddit", { threads_read: [{ url: THREAD }] });
    expect(receiptNotes(check([declared]))).toEqual([unsearchedSubreddit("r/herbalism", "herbalism")]);
    expect(receiptNotes(check([declared], [read(THREAD)]))).toEqual([]);
    // Any link to the same thread is the thread.
    expect(receiptNotes(check([declared], [read(THREAD.replace("www.", "old."))]))).toEqual([]);
    expect(receiptNotes(check([declared], [redditSearch({ u: [forumThreadDigest(THREAD)] })]))).toEqual([]);
  });

  it("notes another forum's threads declared read that the reader never read", () => {
    const forum = entry("Shrub Forum", "forum", { threads_read: [{ url: FORUM_THREAD }] });
    expect(receiptNotes(check([forum]))).toEqual([unreadForum("Shrub Forum")]);
    expect(receiptNotes(check([forum], [read(FORUM_THREAD)]))).toEqual([]);
  });

  // The review of 5 Nov 2026: a subreddit is read from its name exactly, in any case, with its address or a slash before
  // it, and a search the host answered WEBSITE_FORMAT_CHANGED is a search of its subreddit.
  it("reads a subreddit's name in any case, with its reddit.com address or a slash before it", () => {
    for (const name of ["reddit.com/r/herbalism", "R/Herbalism", "/r/herbalism", "https://www.reddit.com/r/Herbalism/",
      "old.reddit.com/r/herbalism"]) {
      const placeholder = entry(name, "reddit", { access_boundary: "no_relevant_results" });
      expect(receiptNotes(check([placeholder])), name).toEqual([unsearchedSubreddit(name, "herbalism")]);
      expect(receiptNotes(check([placeholder], [redditSearch({ sr: "herbalism" })])), name).toEqual([]);
      expect(advisoryNotes(check([placeholder])).join("\n"), name).not.toContain("by its subreddit, as r/<name>");
    }
    // A bare name is not a subreddit: "Reddit" alone names the site, so no search of a subreddit is asked for.
    expect(receiptNotes(check([entry("Reddit", "reddit", { access_boundary: "no_relevant_results" })]))).toEqual([]);
  });

  it("takes a search the host answered WEBSITE_FORMAT_CHANGED as a search of its subreddit, and as nothing else", () => {
    const placeholder = entry("r/herbalism", "reddit", { access_boundary: "no_relevant_results" });
    const changed = redditSearch({ sr: "herbalism", h: "format_changed" });
    expect(receiptNotes(check([placeholder], [changed]))).toEqual([]);
    // It lists no thread, so threads declared read still need their own receipts.
    const declared = entry("r/herbalism", "reddit", { threads_read: [{ url: THREAD }] });
    expect(receiptNotes(check([declared], [changed]))).toEqual([]);
    expect(advisoryNotes(check([declared], [changed])).join("\n")).not.toContain("AskRigor's searches found");
  });

  it("asks nothing where the reader can't reach, nothing was read, or the site refused access", () => {
    const quiet = [
      entry("Shrub Lovers", "facebook", { threads_read: [{ url: "https://www.facebook.com/groups/shrublovers/posts/1" }] }),
      // Platform other covers sites the reader can't open, read through the AI's own search (the review of 5 Nov 2026).
      entry("Xiaohongshu", "other", { threads_read: [{ url: "https://www.xiaohongshu.com/explore/64b1c2d3e4f5a6b7c8d9e0f1" }] }),
      entry("Shrub Forum", "forum", { access_boundary: "no_relevant_results", url: "https://forum.example.org/" }),
      entry("r/shrubs", "reddit", { access_boundary: "login_required" }),
      entry("r/sleep", "reddit", { access_boundary: "blocked" }),
      entry("Elsewhere", "forum", { access_boundary: "not_found" })
    ];
    for (const one of quiet) expect(receiptNotes(check([one])), String(one.community)).toEqual([]);
  });

  it("still holds a thread given as a key source to its read receipt, under the sources check", () => {
    const result = check([]);
    const asSource = assertNextStepsContract(finalizeResearch({ ...input([]), key_sources: [
      ...input([]).key_sources, { id: THREAD, status: "lead_only", read_depth: "partial_text", answer_marker: "Thread" }],
      answer_draft: `${input([]).answer_draft}\n\n[Thread](${THREAD}) (part of the text read) describes the tea.`,
      later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED },
        { source: THREAD, reading: "partial_text", quote: "part of the text read" }] }
    }, { secret: SECRET }));
    expect(result.status).toBe("ready");
    expect(asSource.status).toBe("not_ready");
    expect(asSource.next_steps).toEqual([expect.stringMatching(new RegExp(`^Key source ${THREAD.replace(/[.?]/gu, "\\$&")} ` +
      "has no receipt showing it was found or looked up"))]);
  });
});
