import { describe, expect, it } from "vitest";

import {
  communitySkipCaveat, finalizeResearch, forumThreadDigest, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { forumPageDigest } from "../apps/research-mcp/src/forum-thread-links.js";
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

  // The recheck of 5 Nov 2026: the host answers WEBSITE_FORMAT_CHANGED both when Reddit finds nothing and when the
  // reader is broken, so that answer shows only that AskRigor couldn't search there, never that nothing was found.
  it("takes a search the host answered WEBSITE_FORMAT_CHANGED as one AskRigor couldn't make, and as nothing else", () => {
    const placeholder = entry("r/herbalism", "reddit", { access_boundary: "no_relevant_results" });
    const changed = redditSearch({ sr: "herbalism", h: "format_changed" });
    expect(receiptNotes(check([placeholder], [changed]))).toEqual([]);
    expect(advisoryNotes(check([placeholder], [changed]))).toContain("community_searches for r/herbalism declares it " +
      "searched with nothing relevant found, but AskRigor's reader couldn't search it: its host answered " +
      "WEBSITE_FORMAT_CHANGED, as it does when Reddit finds nothing and when the reader is broken. Search it again with " +
      "other words (subreddit herbalism); if that fails too, give its access_boundary as retrieval_failed and say in the " +
      "answer that the reader couldn't search it.");
    // Declared as a search that failed, it asks nothing; a search that worked there settles it too.
    const failed = entry("r/herbalism", "reddit", { access_boundary: "retrieval_failed" });
    expect(advisoryNotes(check([failed], [changed])).join("\n")).not.toContain("r/herbalism declares");
    expect(advisoryNotes(check([placeholder], [changed, redditSearch({ sr: "herbalism" })])).join("\n"))
      .not.toContain("r/herbalism declares");
    // It lists no thread, so threads declared read still need their own receipts, and it counts in no search total.
    const declared = entry("r/herbalism", "reddit", { threads_read: [{ url: THREAD }] });
    expect(receiptNotes(check([declared], [changed]))).toEqual([unsearchedSubreddit("r/herbalism", "herbalism")]);
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

  // The third check of 5 Nov 2026: a thread key source with no read_depth took any reading, an audit among them. A
  // thread's read receipt is its verified reading: read to its end, the plain full reading; part-way, part of it; and
  // never a method audit or an abstract.
  it("reads a forum thread key source as its read receipt signs, and holds its reading to that", () => {
    const words = { full_text_read: "full text read", partial_text: "part of the text read", full_text_audited: AUDITED };
    const thread = (reading: keyof typeof words, receipt: string, depth?: string) => assertNextStepsContract(finalizeResearch({
      ...input([], [receipt]),
      key_sources: [...input([]).key_sources, { id: THREAD, status: "lead_only", answer_marker: "Thread",
        ...(depth === undefined ? {} : { read_depth: depth }) }],
      answer_draft: `${input([]).answer_draft}\n\n[Thread](${THREAD}) (${words[reading]}) describes the tea.`,
      later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED },
        { source: THREAD, reading, quote: words[reading] }] }
    }, { secret: SECRET }));
    const toEnd = sign("forum_thread_read", { u: forumThreadDigest(THREAD), n: 12, v: "reddit", e: "1" });
    const partWay = sign("forum_thread_read", { u: forumThreadDigest(THREAD), n: 12, v: "reddit", e: "0" });
    const step = (given: string, verified: string, label: string) => `source_reading gives ${THREAD} the reading ` +
      `${given} (${given === "full_text_audited" ? AUDITED : given === "full_text_read" ? "full text read" : "part of the text read"}), ` +
      `more than this call's receipts show: this check verifies ${verified} (${label}). Remove the source_reading entry ` +
      `claiming ${given} for ${THREAD}, or change its reading to ${verified}, with the answer's words saying so, in its ` +
      "language, copied into its quote.";
    // An audit claimed of a thread, read_depth left out: it claims more than the thread's read, under read_depth.
    const audited = thread("full_text_audited", toEnd);
    expect(audited.status).toBe("not_ready");
    expect(audited.next_steps).toEqual([step("full_text_audited", "full_text_read", "full text read")]);
    // Read to its end, it is fully read, and shown.
    const plain = thread("full_text_read", toEnd);
    expect(plain.next_steps).toEqual([]);
    expect(plain.source_reading).toContainEqual({ source: THREAD, name: `"Thread" (${THREAD})`, reading: "full_text_read",
      shown: true });
    // A receipt from before the reader said counts as part-way, the under-claim (the fourth check of 5 Nov 2026).
    expect(thread("full_text_read", read(THREAD)).next_steps)
      .toEqual([step("full_text_read", "partial_text", "part of the text read")]);
    expect(thread("partial_text", read(THREAD)).next_steps).toEqual([]);
    expect(thread("full_text_read", toEnd, "full_text_read").next_steps).toEqual([]);
    // Read part-way, it is part read: a full reading claims more, and read_depth full_text_read is refused.
    expect(thread("full_text_read", partWay).next_steps).toEqual([step("full_text_read", "partial_text", "part of the text read")]);
    expect(thread("partial_text", partWay).next_steps).toEqual([]);
    expect(thread("partial_text", partWay, "full_text_read").next_steps).toEqual([`Key source ${THREAD} cannot support ` +
      "read_depth full_text_read with these receipts; give read_depth partial_text or another lower value reflecting what " +
      "was read, or pass its matching research_receipt."]);
    // A method audit can never be a thread's read_depth.
    expect(thread("full_text_read", toEnd, "full_text_audited").next_steps).toEqual([`Key source ${THREAD} cannot support ` +
      "read_depth full_text_audited with these receipts; give read_depth full_text_read, or pass its matching research_receipt."]);
  });

  // The owner regressions on #412's build (judged 6 Nov 2026): r376-later-phase read both pages of a thread, its second at
  // ?p=2, and was asked for partial_text. Each way of stitching separate page reads into a whole let a part pass as the
  // whole (the review of #421: a run from page 2, a last page read alone, a post's link sharing page 1's digest, a page
  // whose rel="prev" the reader couldn't follow). So a forum thread is read in full only by one read of a page with
  // nothing before it and nothing after it: a whole thread on one page. A thread of several pages is part read, however
  // many of its pages were read, and the step says so.
  it("reads a forum thread in full only from one page with nothing before or after it", () => {
    const cite = (id: string, receipts: string[], depth = "full_text_read") =>
      assertNextStepsContract(finalizeResearch({ ...input([], receipts),
        key_sources: [...input([]).key_sources, { id, status: "lead_only", read_depth: depth, answer_marker: "Thread" }],
        answer_draft: `${input([]).answer_draft}\n\n[Thread](${id}) (${depth === "full_text_read" ? "full text read"
          : "part of the text read"}) describes the tea.`,
        later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED },
          { source: id, reading: depth, quote: depth === "full_text_read" ? "full text read" : "part of the text read" }] }
      }, { secret: SECRET }));
    const page = (url: string, claims: Record<string, string>) => sign("forum_thread_read",
      { u: forumThreadDigest(url), w: forumPageDigest(url), n: 2_000, v: "page", ...claims });
    const severalPages = (id: string) => `Key source ${id} is a forum thread of several pages, which AskRigor counts as ` +
      "part read however many of its pages were read: give read_depth partial_text.";
    const first = "https://forum.example.org/health-fitness/q1234567-synthetic-weight-question";
    const second = `${first}?p=2`;
    // A whole thread on one page, read to its end: read in full.
    expect(cite(first, [page(first, { pv: "0", pa: "0", e: "1" })]).next_steps).toEqual([]);
    // Both pages of a two-page thread, read one after the other: part read, and the step asks for partial_text.
    const both = [page(first, { pv: "0", pa: "1", e: "0" }), page(second, { pv: "1", pa: "0", e: "1" })];
    expect(cite(first, both).next_steps).toContain(severalPages(first));
    expect(cite(second, both).next_steps).toContain(severalPages(second));
    expect(cite(first, both, "partial_text").next_steps).toEqual([]);
    // A later page read alone, its page before marked or picked by its link: part read.
    expect(cite(second, [page(second, { pv: "1", pa: "0", e: "1" })]).next_steps).toContain(severalPages(second));
    const topic = "https://forum.example.org/viewtopic.php?t=4242";
    expect(cite(topic, [page(`${topic}&start=60`, { pv: "1", pa: "0", e: "1" })]).next_steps).toContain(severalPages(topic));
    // A page cut at the size limit, or a receipt from before pv: part read, under the plain step.
    const refused = `Key source ${first} cannot support read_depth full_text_read with these receipts; give read_depth ` +
      "partial_text or another lower value reflecting what was read, or pass its matching research_receipt.";
    expect(cite(first, [page(first, { pv: "0", pa: "0", e: "0" })]).next_steps).toContain(refused);
    expect(cite(first, [page(first, { e: "1" })]).next_steps).toContain(refused);
  });

  // The follow-up of 5 Nov 2026 (l34 on #412's build): a thread the site sent the reader on from to another of its pages
  // is that thread, by the link given (`ur`), so an answer citing the link given has its receipt.
  it("takes a key source thread by the link the site sent the reader on from", () => {
    const asked = "https://www.longecity.org/forum/topic/63977-synthetic-topic/";
    const landed = "https://www.longecity.org/forum/viewtopic.php?t=1063977";
    const redirected = sign("forum_thread_read", { u: forumThreadDigest(landed), ur: forumThreadDigest(asked),
      w: forumPageDigest(landed), pv: "0", pa: "0", n: 1_500, v: "page", e: "1" });
    const cite = (receipts: string[]) => assertNextStepsContract(finalizeResearch({ ...input([], receipts),
      key_sources: [...input([]).key_sources, { id: asked, status: "lead_only", read_depth: "full_text_read",
        answer_marker: "Thread" }],
      answer_draft: `${input([]).answer_draft}\n\n[Thread](${asked}) (full text read) describes the tea.`,
      later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED },
        { source: asked, reading: "full_text_read", quote: "full text read" }] }
    }, { secret: SECRET }));
    expect(cite([redirected]).next_steps).toEqual([]);
    // Sent on to the thread's second page (start=30), it is the same thread, but one of several pages: part read.
    const laterPage = "https://www.longecity.org/forum/viewtopic.php?t=1063977&start=30";
    const second = sign("forum_thread_read", { u: forumThreadDigest(laterPage), ur: forumThreadDigest(asked),
      w: forumPageDigest(laterPage), pv: "1", pa: "0", n: 1_500, v: "page", e: "1" });
    expect(cite([second]).next_steps[0]).toBe(`Key source ${asked} is a forum thread of several pages, which AskRigor ` +
      "counts as part read however many of its pages were read: give read_depth partial_text.");
    // Without the link given in its receipt, the asked link has no receipt (and so no reading either).
    const unsigned = sign("forum_thread_read", { u: forumThreadDigest(landed), w: forumPageDigest(landed), pv: "0",
      pa: "0", n: 1_500, v: "page", e: "1" });
    // Compared as a prefix, not a pattern built from the link (CodeQL: a link is no regular expression).
    const unreceipted = `Key source ${asked} has no receipt showing it was found or looked up`;
    expect(cite([unsigned]).next_steps[0]?.slice(0, unreceipted.length)).toBe(unreceipted);
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
    const unreceipted = `Key source ${THREAD} has no receipt showing it was found or looked up`;
    expect(asSource.next_steps).toHaveLength(1);
    expect(asSource.next_steps[0]?.slice(0, unreceipted.length)).toBe(unreceipted);
  });
});
