import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  COMMUNITY_LEAD_STATES, COMMUNITY_LEAD_STUDIES, communityLeadVideo, leadKey, leadPhrase, type CommunityLead
} from "../apps/research-mcp/src/community-leads.js";
import { PUBLIC_RATE_LIMIT } from "../apps/research-mcp/src/config.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import { createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import {
  NOT_SEARCHED_LEADS_CAVEAT_STARTS,
  finalizeResearch as finalizeResearchUnwrapped,
  forumThreadDigest,
  notSearchedLeadsCaveat,
  type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest, issueResearchReceipt, researchTargetDigest
} from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import { COMMUNITY_LEADS_MISSING, advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { withSourceReading } from "./helpers/source-reading.js";

// The owner, 5 Nov 2026: an answer says beside each key study it cites how it was read, its words copied in
// source_reading. These fixtures isolate other checks, so each call gets the shared helper's reading words.
const finalizeResearch = (...args: Parameters<typeof finalizeResearchUnwrapped>) =>
  finalizeResearchUnwrapped(withSourceReading(args[0]), args[1]);

// The loop from people's reports to studies (the owner, 5 Nov 2026: "make sure that our feedback loop is working between
// forum signal and studies"). Judges reading 18 runs found 19 of 98 leads from forum threads or comments searched in
// studies, and no answer saying a lead went unsearched. community_leads, a later input of finalize_research, declares
// each lead and the study search that followed it, or why none did; the check is exact on what it declares, and every
// finding is a note, never a step. The threads, videos, studies, counts and identifiers are synthetic fixtures, not
// evidence about a treatment, and match no private comment map.
const SECRET = "community-leads-test-secret-0123456789abcdefgh";
const TARGET = "Dry eye that persists despite omega-3 capsules";
const THREAD = "https://www.reddit.com/r/DryEyes/comments/dq7k2m/what_finally_helped/";
const OTHER_THREAD = "https://forum.example.org/t/dry-eye-routine/4812";
const REVIEWS_PAGE = "https://reviews.example.com/p/sea-buckthorn-capsules";
const VIDEO = "Lk3Fq9Zt2Wm";
const OTHER_VIDEO = "Qp7Rs2Vx8Yn";
const DOI = "10.1000/dry-eye-trial";
const QUERY = "sea buckthorn oil dry eye";
const STUDY_LINE = `[Trial](https://doi.org/${DOI}) compared warm compresses with usual care in adults with dry eye.`;
const SEARCHED = "People in these threads tried sea buckthorn oil after omega-3 failed; a PubMed search for it found one " +
  "small trial, which reported less dryness.";
const NOT_FOUND = "People in these threads also slept with the head raised; a PubMed search for that found no study of it.";
const REASON = "Raising the head is a sleeping position with no plausible harm, so no study search was run in this pass.";
// Every receipt signs its issue order, one second apart, as the tools do.
let order = Date.parse("2026-11-05T09:00:00.000Z");
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1],
  secret = SECRET) => issueResearchReceipt(kind, { t: (order += 1_000), ...claims }, { secret });
const threadRead = sign("forum_thread_read", { u: forumThreadDigest(THREAD), n: 37, v: "reddit" });
const commentsRead = sign("youtube_comments_read", { video: VIDEO, records: 23 });
const audit = sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" });
const search = (query = QUERY, src: "pubmed" | "europepmc" | "ctgov" = "pubmed", returned = 1) =>
  sign("literature_search", { src, q: discoveryQueryDigest([query]), ret: returned, n: returned });
const seaBuckthorn: CommunityLead = {
  lead: "sea buckthorn oil", from: [THREAD, `video:${VIDEO}`], state: "searched", search_query: QUERY,
  studies: "corroborated", answer_quote: SEARCHED
};
const wedge: CommunityLead = { lead: "sleeping with the head raised", from: [THREAD], state: "not_searched", reason: REASON };
// A community searched with the AI's own web search, as community_searches declares it.
const ownSearch = (urls: readonly string[], extra: Record<string, unknown> = {}) => ({
  community: "r/DryEyes", platform: "reddit", queries: ["dry eye what finally helped"],
  threads_read: urls.map((url) => ({ url })), ...extra
});
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the community leads." };
// The emergency basis keeps community research out of this fixture; its own note says so, and nothing else here does.
const EMERGENCY = "Research went past the emergency warning, so community evidence applies:";
type Leads = readonly CommunityLead[] | undefined;
const packageFor = (leads: Leads, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  receipts: [threadRead, commentsRead, audit, search()], research_target: TARGET, research_depth: "deep",
  treatment_choice: "not_compared", community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic fixture isolates the community leads.",
  lab_preparation: NOT_APPLICABLE, intervention_identity: NOT_APPLICABLE, commercial_review_applicability: NOT_APPLICABLE,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the community leads." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  mechanism_claims: [], recommendations: [], safety_claims: [], safety_question: false,
  answer_draft: `${STUDY_LINE}\n\n${SEARCHED}`,
  ...(leads === undefined ? {} : { later_inputs: { community_leads: leads } }),
  ...overrides
});

// Each note, word for word.
const missing = (read: string) => `${COMMUNITY_LEADS_MISSING}${read}. In later_inputs.community_leads, list each ` +
  "option, form, dose, timing, responder group, harm or way it could work that those reports raised and the question " +
  "didn't name, as {lead, from, state, search_query, studies, answer_quote, reason}: from gives the links of the " +
  "threads read (with read_forum_thread, or declared in community_searches), or video:<id> for the comments read; " +
  "searched gives the exact search_query of the search_pubmed, search_europe_pmc or search_clinical_trials call that " +
  "followed, studies (corroborated, contradicted, outcome_mismatch or support_not_located) and the answer's sentence " +
  "on what it found as answer_quote; not_searched gives reason. An empty list means the reports raised nothing new.";
const unread = (index: number, places: string, several = false) => `community_leads[${index}].${places} ` +
  `${several ? "are not reads" : "is not a read"} this call shows: give the link of a thread that read_forum_thread ` +
  "read (with its research_receipt in receipts) or that community_searches declares in threads_read, or video:<id> " +
  "for a video whose comments AskRigor read; or leave it out of from.";
const repeated = (index: number, first: number) => `community_leads[${index}] names the same lead as ` +
  `community_leads[${first}]: give each lead one entry.`;
const noQuery = (index: number, lead: string) => `community_leads[${index}] is searched without search_query: give ` +
  `the exact query ${lead} was searched with in search_pubmed, search_europe_pmc or search_clinical_trials, and pass ` +
  "that search's research_receipt, or declare it not_searched with reason.";
const unsigned = (index: number, lead: string) => `community_leads[${index}].search_query is not the query of any ` +
  `literature search passed here: search ${lead} with search_pubmed, search_europe_pmc or search_clinical_trials, ` +
  "give that exact query, and pass its research_receipt, or declare it not_searched with reason.";
const noStudies = (index: number, lead: string) => `community_leads[${index}] is searched without studies: say what ` +
  `the studies showed about ${lead} as corroborated, contradicted (only when they measured it the way the reports ` +
  "did), outcome_mismatch (they measured something else) or support_not_located (the search found no study of it).";
const noRecords = (index: number) => `community_leads[${index}]'s search returned no records: give ` +
  "support_not_located as studies, or, as search_query, the query of the search that found the studies.";
const noQuote = (index: number, lead: string) => `community_leads[${index}] is searched without answer_quote: say in ` +
  `the answer what the search for ${lead} found, and copy that sentence from answer_draft.`;
const noneFoundNoQuote = (index: number, lead: string) => `community_leads[${index}]'s search found no study of ` +
  `${lead}, and it gives no answer_quote: say in the answer that the search found none, and copy that sentence from ` +
  "answer_draft.";
const unshown = (index: number) => `community_leads[${index}].answer_quote gives text the answer does not show: copy ` +
  "each sentence exactly from answer_draft.";
const noReason = (index: number, lead: string) => `community_leads[${index}] is not_searched without reason: say why ` +
  `${lead} was not searched in studies, in 10 to 300 characters.`;
const notSearched = (...leads: string[]) => `${NOT_SEARCHED_LEADS_CAVEAT_STARTS[leads.length === 1 ? "one" : "several"]} ` +
  `${leads.join("; ")}.`;
const ONE_NOT_SEARCHED = notSearched("sleeping with the head raised");

describe("the leads people's reports raised: shape and caveat", () => {
  it("is a later input of finalize_research, with HRP's four relationships of studies to reports", () => {
    expect(laterInputNames("finalize_research")).toContain("community_leads");
    expect(COMMUNITY_LEAD_STATES).toEqual(["searched", "not_searched"]);
    // HRP FormalAbsenceCannotEraseCommunitySignal: corroborated | contradicted | support_not_located | outcome_mismatch.
    expect(COMMUNITY_LEAD_STUDIES).toEqual(["corroborated", "contradicted", "support_not_located", "outcome_mismatch"]);
  });

  it("names the leads not searched in one sentence, in the colon form, each lead as declared", () => {
    expect(notSearchedLeadsCaveat(["sleeping with the head raised"])).toBe(ONE_NOT_SEARCHED);
    expect(notSearchedLeadsCaveat(["  sleeping with\n the head raised. ", "B vitamins."])).toBe(
      `${NOT_SEARCHED_LEADS_CAVEAT_STARTS.several} sleeping with the head raised; B vitamins.`);
  });

  it("keeps the leads' separator unambiguous: a semicolon inside a lead becomes a comma (review of 5 Nov 2026)", () => {
    expect(notSearchedLeadsCaveat(["magnesium; zinc"])).toBe(`${NOT_SEARCHED_LEADS_CAVEAT_STARTS.one} magnesium, zinc.`);
    expect(notSearchedLeadsCaveat(["a; b", "c"])).toBe(`${NOT_SEARCHED_LEADS_CAVEAT_STARTS.several} a, b; c.`);
    expect(notSearchedLeadsCaveat(["マグネシウム；亜鉛"])).toBe(`${NOT_SEARCHED_LEADS_CAVEAT_STARTS.one} マグネシウム，亜鉛.`);
  });

  it("leaves out only a closing . , : or ; (full-width and CJK forms too), never a ? or !, which carry meaning", () => {
    expect(notSearchedLeadsCaveat(["B vitamins:"])).toBe(`${NOT_SEARCHED_LEADS_CAVEAT_STARTS.one} B vitamins.`);
    expect(notSearchedLeadsCaveat(["睡眠時に頭を高くする。"])).toBe(`${NOT_SEARCHED_LEADS_CAVEAT_STARTS.one} 睡眠時に頭を高くする.`);
    expect(notSearchedLeadsCaveat(["睡眠時に頭を高くする。", "ビタミンB群、", "亜鉛；"])).toBe(
      `${NOT_SEARCHED_LEADS_CAVEAT_STARTS.several} 睡眠時に頭を高くする; ビタミンB群; 亜鉛.`);
    expect(notSearchedLeadsCaveat(["¿magnesio?"])).toBe(`${NOT_SEARCHED_LEADS_CAVEAT_STARTS.one} ¿magnesio?`);
    expect(notSearchedLeadsCaveat(["¡zinc!", "fish oil."])).toBe(`${NOT_SEARCHED_LEADS_CAVEAT_STARTS.several} ¡zinc!; fish oil.`);
    expect(leadPhrase("  fish\n oil ;  ")).toBe("fish oil");
  });

  it("tells leads apart by Unicode's compatibility form, case without a locale, white space and closing mark only", () => {
    for (const [one, other] of [["B vitamins.", "b   VITAMINS"], ["B vitamins", "Ｂ vitamins"], ["ビタミンB群。", "ビタミンＢ群"],
      ["Fish oil;", "fish oil"], ["ﬁsh oil", "fish oil"]]) {
      expect(leadKey(one!), `${one} / ${other}`).toBe(leadKey(other!));
    }
    for (const [one, other] of [["¿magnesio?", "magnesio"], ["zinc!", "zinc"], ["fish oil", "omega-3"]]) {
      expect(leadKey(one!), `${one} / ${other}`).not.toBe(leadKey(other!));
    }
  });

  it("reads a video as video:<YouTube id>, or a YouTube link in any form the video tool reads, and anything else as a link", () => {
    for (const source of [`video:${VIDEO}`, `Video: ${VIDEO}`, VIDEO, `https://www.youtube.com/watch?v=${VIDEO}`,
      `https://youtube.com/watch?v=${VIDEO}`, `https://m.youtube.com/watch?v=${VIDEO}`,
      `https://music.youtube.com/watch?v=${VIDEO}&list=RD`, `https://www.youtube.com/watch?v=${VIDEO}&t=42s`,
      `https://youtu.be/${VIDEO}?si=AbCdEf`, `http://www.youtube.com/watch?v=${VIDEO}`, `youtu.be/${VIDEO}`,
      `https://www.youtube.com/shorts/${VIDEO}`, `https://www.youtube.com/live/${VIDEO}?feature=share`,
      `https://www.youtube.com/embed/${VIDEO}`, `video:https://youtu.be/${VIDEO}`]) {
      expect(communityLeadVideo(source), source).toBe(VIDEO);
    }
    for (const source of [THREAD, OTHER_THREAD, "video:abc", "video:", `video:${VIDEO}x`,
      `https://www.youtube.com.evil.example/watch?v=${VIDEO}`, "https://www.youtube.com/@channel"]) {
      expect(communityLeadVideo(source), source).toBeUndefined();
    }
  });
});

describe.each(["gate", "MCP endpoint"] as const)("finalize_research community_leads through the %s", (surface) => {
  let server: Server | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    // These tests call the endpoint more often than the public 60-a-minute limit allows one address.
    server = createAskRigorHttpServer({
      publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false,
      privateOrchestrationEnabled: false,
      rateLimiter: createTokenBucketLimiter({ ...PUBLIC_RATE_LIMIT, capacity: 1_000 })
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    client = new Client({ name: "community-leads-test", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  });
  afterAll(async () => {
    await client?.close();
    if (server !== undefined) await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    vi.unstubAllEnvs();
  });
  // Leads are always given, undefined when the call leaves community_leads out.
  const call = async (leads: Leads, overrides: Record<string, unknown> = {}): Promise<FinalizeResearchOutput> => {
    const input = packageFor(leads, overrides);
    if (surface === "gate") return assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    const result = await client!.callTool({ name: "finalize_research", arguments: withSourceReading(input) });
    expect(result.isError).not.toBe(true);
    return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
  };
  // All notes but the fixture's own.
  const notes = (result: FinalizeResearchOutput) => advisoryNotes(result).filter((note) => !note.startsWith(EMERGENCY));
  const noted = async (leads: Leads, overrides: Record<string, unknown> = {}) => notes(await call(leads, overrides));
  const leadNotes = async (leads: Leads, overrides: Record<string, unknown> = {}) =>
    (await noted(leads, overrides)).filter((note) => note.includes("community_leads"));

  it("passes leads searched in studies, read here and reported in the answer, with no note, caveat or limit", async () => {
    const result = await call([seaBuckthorn]);
    expect({ ...result, notes: notes(result) }).toMatchObject({
      status: "ready", next_steps: [], next_step_kinds: [], notes: [], caveats: [], limits: []
    });
    // The fixture's own note is the only one.
    expect(advisoryNotes(result)).toEqual([expect.stringMatching(new RegExp(`^${EMERGENCY}`, "u"))]);
  });

  it("takes an empty list as the reports raising nothing new", async () => {
    expect(await call([])).toMatchObject({ status: "ready", next_steps: [], caveats: [], limits: [] });
    expect(await noted([])).toEqual([]);
  });

  describe("when people's reports were read and nothing is declared", () => {
    it("asks once for later_inputs.community_leads, with the threads and videos read, as a note", async () => {
      const result = await call(undefined);
      expect({ ...result, notes: notes(result) }).toMatchObject({
        status: "ready", next_steps: [], next_step_kinds: [], limits: [],
        notes: [missing("1 forum thread and the comments of 1 video")]
      });
      // A later input travels in later_inputs, which every app's tool list has: no tool-list refresh hint.
      expect(notes(result).some((note) => note.includes("tool list"))).toBe(false);
    });

    it("counts each thread and each video once, and says only what was read", async () => {
      const otherThreadRead = sign("forum_thread_read", { u: forumThreadDigest(OTHER_THREAD), n: 1_200, v: "page" });
      expect(await noted(undefined, { receipts: [threadRead, otherThreadRead, threadRead, audit, search()] }))
        .toEqual([missing("2 forum threads")]);
      expect(await noted(undefined, { receipts: [commentsRead, audit, search()] }))
        .toEqual([missing("the comments of 1 video")]);
      const otherComments = sign("youtube_comments_read", { video: OTHER_VIDEO, records: 9 });
      expect(await noted(undefined, { receipts: [threadRead, commentsRead, otherComments, audit, search()] }))
        .toEqual([missing("1 forum thread and the comments of 2 videos")]);
    });

    it("counts the threads declared from the AI's own web search, apart from those AskRigor's reader read", async () => {
      // Only declared: no read receipt at all.
      expect(await leadNotes(undefined, { receipts: [audit, search()],
        community_searches: [ownSearch([THREAD, OTHER_THREAD])] }))
        .toEqual([missing("2 forum threads declared from your own web search")]);
      // Both: a declared thread the reader read counts once, as the reader's.
      expect(await leadNotes(undefined, { community_searches: [ownSearch([THREAD, OTHER_THREAD])] }))
        .toEqual([missing("2 forum threads (1 with AskRigor's reader, 1 declared from your own web search) and the " +
          "comments of 1 video")]);
      // A review site's page and reports the user pasted are not forum threads this research read, as the forum note
      // counts them.
      expect(await leadNotes(undefined, { receipts: [audit, search()], community_searches: [
        ownSearch([OTHER_THREAD], { access_boundary: "supplied_by_user" }),
        { community: "Example Reviews", platform: "review_site", queries: ["sea buckthorn capsules"],
          threads_read: [{ url: REVIEWS_PAGE }] }
      ] })).toEqual([]);
    });

    it("counts the videos a comment audit or a one-call community audit read", async () => {
      const videoAudit = sign("youtube_video_audit", {
        video: OTHER_VIDEO, state: "api_visible_complete", lock: "pass", records: 31, shown: 17
      });
      const communityAudit = sign("youtube_community_audit", {
        videos: [VIDEO, OTHER_VIDEO], read: [VIDEO], state: "api_visible_complete", lock: "pass",
        target: researchTargetDigest(TARGET), q: discoveryQueryDigest(["dry eye what finally worked"]), access: "complete"
      });
      // Their comments need community_findings too, which this fixture leaves to its own tests.
      expect(await leadNotes(undefined, { receipts: [videoAudit, communityAudit, audit, search()] }))
        .toEqual([missing("the comments of 2 videos")]);
    });
  });

  describe("changes nothing when no people's reports were read", () => {
    it("adds no note, caveat or limit to a call without read receipts", async () => {
      for (const leads of [undefined, []] as const) {
        const result = await call(leads, { receipts: [audit, search()], answer_draft: STUDY_LINE });
        expect({ ...result, notes: notes(result) }, String(leads)).toMatchObject({
          status: "ready", next_steps: [], next_step_kinds: [], notes: [], caveats: [], limits: [], must_report: []
        });
      }
    });

    it("never counts a forum or YouTube search, an audit that read no comment, a read for another question or a forged read", async () => {
      const receipts = [
        sign("forum_search", { q: discoveryQueryDigest(["dry eye what helped"]), u: [forumThreadDigest(THREAD)] }),
        sign("youtube_search", { q: discoveryQueryDigest(["dry eye routine"]), videos: [VIDEO], target: researchTargetDigest(TARGET) }),
        sign("youtube_video_audit", { video: OTHER_VIDEO, state: "api_visible_complete", lock: "pass", records: 0, shown: 0 }),
        sign("youtube_community_audit", { videos: [VIDEO], read: [VIDEO], state: "api_visible_complete", lock: "pass",
          target: researchTargetDigest("Another question entirely"), q: discoveryQueryDigest(["other"]), access: "complete" }),
        sign("forum_thread_read", { u: forumThreadDigest(THREAD), n: 37, v: "reddit" }, "another-server-secret-0123456789abcdefghijkl"),
        audit, search()
      ];
      const result = await call(undefined, { receipts });
      expect(advisoryNotes(result).filter((note) => note.startsWith(COMMUNITY_LEADS_MISSING))).toEqual([]);
      expect(result.receipts_rejected).toContainEqual({ index: 4, reason: "signature_invalid" });
    });
  });

  describe("each lead was read here", () => {
    it("notes each place the call doesn't show read, by its place in from", async () => {
      expect(await noted([{ ...seaBuckthorn, from: [THREAD, OTHER_THREAD] }])).toEqual([unread(0, "from[1]")]);
      expect(await noted([seaBuckthorn, { ...seaBuckthorn, lead: "omega-3 at a higher dose",
        from: [OTHER_THREAD, THREAD, `video:${OTHER_VIDEO}`] }]))
        .toEqual([unread(1, "from[0] and from[2]", true)]);
      // Free text is no read either.
      expect(await noted([{ ...seaBuckthorn, from: ["a Reddit thread about dry eye"] }])).toEqual([unread(0, "from[0]")]);
    });

    it("matches a thread by its comparable link, and the link the reader was sent from", async () => {
      expect(await noted([{ ...seaBuckthorn, from: [
        "https://old.reddit.com/r/DryEyes/comments/dq7k2m/what_finally_helped/abc12de/?context=3", `video:${VIDEO}`
      ] }])).toEqual([]);
      const asked = "https://forum.example.org/forum/topic/4812-dry-eye-routine/page-2";
      const landed = "https://forum.example.org/forum/viewtopic.php?t=4812&start=30";
      const redirected = sign("forum_thread_read", { u: forumThreadDigest(landed), a: forumThreadDigest(asked), n: 900, v: "page" });
      for (const link of [asked, landed]) {
        expect(await noted([{ ...seaBuckthorn, from: [link] }], { receipts: [redirected, audit, search()] }), link)
          .toEqual([]);
      }
    });

    it("ties a lead to a thread the call declares in community_searches: own web search, a review page or pasted reports", async () => {
      const receipts = [audit, search()];
      const community_searches = [ownSearch([OTHER_THREAD]),
        ownSearch(["https://www.reddit.com/r/DryEyes/comments/zz91xq/pasted/"], { access_boundary: "supplied_by_user" }),
        { community: "Example Reviews", platform: "review_site", queries: ["sea buckthorn capsules"],
          threads_read: [{ url: REVIEWS_PAGE }] }];
      expect(await leadNotes([{ ...seaBuckthorn, from: [
        `${OTHER_THREAD}#post-3`, "https://www.reddit.com/r/DryEyes/comments/zz91xq/", REVIEWS_PAGE
      ] }], { receipts, community_searches })).toEqual([]);
      // A link no entry declares and no receipt shows is still no read.
      expect(await leadNotes([{ ...seaBuckthorn, from: [THREAD] }], { receipts, community_searches }))
        .toEqual([unread(0, "from[0]")]);
    });

    it("never counts a read whose receipt does not verify", async () => {
      const forged = sign("forum_thread_read", { u: forumThreadDigest(THREAD), n: 37, v: "reddit" },
        "another-server-secret-0123456789abcdefghijkl");
      const result = await call([{ ...seaBuckthorn, from: [THREAD] }], { receipts: [forged, audit, search()] });
      expect(result.receipts_rejected).toEqual([{ index: 0, reason: "signature_invalid" }]);
      expect(notes(result).filter((note) => note.startsWith("community_leads"))).toEqual([unread(0, "from[0]")]);
    });
  });

  describe("a lead from YouTube comments, as video:<id> or a YouTube link", () => {
    it("is read when get_youtube_comments or search_youtube_comments returned its comments", async () => {
      for (const source of [`video:${VIDEO}`, `https://youtube.com/watch?v=${VIDEO}`, `https://m.youtube.com/watch?v=${VIDEO}`,
        `https://www.youtube.com/watch?v=${VIDEO}&t=42s`, `https://youtu.be/${VIDEO}?si=AbCdEf`,
        `http://www.youtube.com/watch?v=${VIDEO}`, `https://music.youtube.com/watch?v=${VIDEO}`]) {
        expect(await noted([{ ...seaBuckthorn, from: [source] }], { receipts: [commentsRead, audit, search()] }), source)
          .toEqual([]);
      }
      expect(await noted([{ ...seaBuckthorn, from: [`video:${OTHER_VIDEO}`] }])).toEqual([unread(0, "from[0]")]);
    });

    it("is read when an audit of the video, or a one-call audit reading it, returned its comments", async () => {
      const videoAudit = sign("youtube_video_audit", {
        video: OTHER_VIDEO, state: "api_visible_complete", lock: "pass", records: 31, shown: 17
      });
      const communityAudit = sign("youtube_community_audit", {
        videos: [VIDEO, OTHER_VIDEO], read: [VIDEO], state: "api_visible_complete", lock: "pass",
        target: researchTargetDigest(TARGET), q: discoveryQueryDigest(["dry eye what finally worked"]), access: "complete"
      });
      const lead = { ...seaBuckthorn, from: [`video:${VIDEO}`, `video:${OTHER_VIDEO}`] };
      expect(await leadNotes([lead], { receipts: [videoAudit, communityAudit, audit, search()] })).toEqual([]);
      // A video the one-call audit selected but whose comments did not reach the model was not read.
      expect(await leadNotes([lead], { receipts: [communityAudit, audit, search()] })).toEqual([unread(0, "from[1]")]);
    });
  });

  describe("a lead searched in studies rests on a literature search passed here", () => {
    it("needs its query, and without one is a lead AskRigor saw no study search for", async () => {
      const result = await call([{ ...seaBuckthorn, search_query: undefined }]);
      expect({ ...result, notes: notes(result) }).toMatchObject({
        status: "ready_with_limits", next_steps: [], notes: [noQuery(0, "sea buckthorn oil")],
        limits: [notSearched("sea buckthorn oil")]
      });
    });

    it("notes a query no literature search passed here signed, and puts the lead in the limit, without consuming a round", async () => {
      const result = await call([{ ...seaBuckthorn, search_query: "sea buckthorn oil meibomian gland" }, wedge]);
      expect({ ...result, notes: notes(result) }).toMatchObject({
        status: "ready_with_limits", next_steps: [], next_step_kinds: [], notes: [unsigned(0, "sea buckthorn oil")],
        limits: [notSearched("sea buckthorn oil", "sleeping with the head raised")]
      });
      // No literature search at all: the same note and limit.
      const none = await call([seaBuckthorn], { receipts: [threadRead, commentsRead, audit] });
      expect({ notes: notes(none), limits: none.limits })
        .toEqual({ notes: [unsigned(0, "sea buckthorn oil")], limits: [notSearched("sea buckthorn oil")] });
    });

    it("never takes another search's receipt for it: a forum or YouTube search of the same words, or another study search", async () => {
      const forumSearch = sign("forum_search", { q: discoveryQueryDigest([QUERY]), u: [forumThreadDigest(THREAD)] });
      const youtubeSearch = sign("youtube_search", { q: discoveryQueryDigest([QUERY]), videos: [VIDEO], target: researchTargetDigest(TARGET) });
      for (const receipts of [
        [threadRead, commentsRead, audit, forumSearch],
        [threadRead, commentsRead, audit, youtubeSearch],
        [threadRead, commentsRead, audit, search("omega-3 dry eye")]
      ]) {
        const result = await call([seaBuckthorn], { receipts });
        expect(notes(result).filter((note) => note.startsWith("community_leads"))).toEqual([unsigned(0, "sea buckthorn oil")]);
        expect(result.limits).toEqual([notSearched("sea buckthorn oil")]);
      }
    });

    it("compares the query as search receipts sign it, and counts Europe PMC and ClinicalTrials.gov", async () => {
      expect(await noted([{ ...seaBuckthorn, search_query: "  Sea Buckthorn\n OIL   dry eye " }])).toEqual([]);
      for (const src of ["europepmc", "ctgov"] as const) {
        const result = await call([seaBuckthorn], { receipts: [threadRead, commentsRead, audit, search(QUERY, src)] });
        expect({ notes: notes(result), limits: result.limits }, src).toEqual({ notes: [], limits: [] });
      }
    });

    it("needs what the studies showed, with contradicted kept for studies that measured it as the reports did", async () => {
      expect(await noted([{ ...seaBuckthorn, studies: undefined }])).toEqual([noStudies(0, "sea buckthorn oil")]);
      for (const studies of COMMUNITY_LEAD_STUDIES) {
        expect(await noted([{ ...seaBuckthorn, studies }]), studies).toEqual([]);
      }
    });

    it("notes a search whose receipts returned no records unless the studies field says support_not_located", async () => {
      const empty = (src: "pubmed" | "europepmc" = "pubmed") => search(QUERY, src, 0);
      const receipts = [threadRead, commentsRead, audit, empty()];
      for (const studies of ["corroborated", "contradicted", "outcome_mismatch"] as const) {
        expect(await noted([{ ...seaBuckthorn, studies }], { receipts }), studies).toEqual([noRecords(0)]);
      }
      expect(await noted([{ ...seaBuckthorn, studies: "support_not_located" }], { receipts })).toEqual([]);
      expect(await noted([{ ...seaBuckthorn, studies: undefined }], { receipts }))
        .toEqual([noStudies(0, "sea buckthorn oil"), noRecords(0)]);
      // Another database that returned records under the same query found studies.
      expect(await noted([seaBuckthorn], { receipts: [...receipts, search(QUERY, "europepmc", 3)] })).toEqual([]);
      // A receipt that signs no count says nothing either way.
      const uncounted = sign("literature_search", { src: "pubmed", q: discoveryQueryDigest([QUERY]) });
      expect(await noted([seaBuckthorn], { receipts: [threadRead, commentsRead, audit, uncounted] })).toEqual([]);
      // Searched with a receipt, the lead is not in the limit, whatever the search returned.
      expect((await call([seaBuckthorn], { receipts })).limits).toEqual([]);
    });
  });

  describe("a lead searched in studies is reported in the answer", () => {
    it("needs the answer's sentence on what the search found", async () => {
      expect(await noted([{ ...seaBuckthorn, answer_quote: undefined }])).toEqual([noQuote(0, "sea buckthorn oil")]);
    });

    it("asks a search that found no study to say so in the answer: the same quote rule, no meaning test", async () => {
      const head = { lead: "sleeping with the head raised", from: [THREAD], state: "searched" as const,
        search_query: "head elevation sleep dry eye", studies: "support_not_located" as const };
      const receipts = [threadRead, commentsRead, audit, search(), search("head elevation sleep dry eye", "pubmed", 0)];
      expect(await noted([seaBuckthorn, head], { receipts }))
        .toEqual([noneFoundNoQuote(1, "sleeping with the head raised")]);
      expect(await noted([seaBuckthorn, { ...head, answer_quote: NOT_FOUND }],
        { receipts, answer_draft: `${STUDY_LINE}\n\n${SEARCHED} ${NOT_FOUND}` })).toEqual([]);
    });

    it("refuses a sentence the answer does not show, or shows only outside its prose", async () => {
      for (const draft of [STUDY_LINE, `${STUDY_LINE}\n\n\`\`\`\n${SEARCHED}\n\`\`\``, `${STUDY_LINE}\n\n<!-- ${SEARCHED} -->`]) {
        const result = await call([seaBuckthorn], { answer_draft: draft });
        expect(notes(result), draft).toEqual([unshown(0)]);
        expect(result).toMatchObject({ status: "ready", next_steps: [] });
      }
    });

    it("does not use another state's field", async () => {
      // A lead not searched has no search to check and no sentence to show: only its reason and its caveat apply.
      const result = await call([seaBuckthorn, { ...wedge, search_query: "a query no receipt has",
        studies: "contradicted", answer_quote: "A sentence the answer does not show." }]);
      expect({ ...result, notes: notes(result) }).toMatchObject({ notes: [], limits: [ONE_NOT_SEARCHED] });
    });
  });

  describe("a lead not searched in studies reaches the answer", () => {
    it("as one limit naming it, and needs the reason it was not searched", async () => {
      const result = await call([seaBuckthorn, wedge]);
      expect({ ...result, notes: notes(result) }).toMatchObject({
        status: "ready_with_limits", next_steps: [], next_step_kinds: [], notes: [], caveats: [], limits: [ONE_NOT_SEARCHED]
      });
      expect(await noted([seaBuckthorn, { ...wedge, reason: undefined }]))
        .toEqual([noReason(1, "sleeping with the head raised")]);
      // A reason too short to say why is dropped, with its own note.
      expect(await noted([seaBuckthorn, { ...wedge, reason: "cheap" }])).toEqual([
        "community_leads[1].reason: dropped: needs at least 10 characters.",
        noReason(1, "sleeping with the head raised")
      ]);
    });

    it("names each lead AskRigor saw no study search for once, in the order declared, in one limit", async () => {
      const vitamins: CommunityLead = { lead: "B vitamins.", from: [`video:${VIDEO}`], state: "not_searched", reason: REASON };
      const unconfirmed: CommunityLead = { ...seaBuckthorn, lead: "fish oil; krill oil", search_query: "krill oil dry eye" };
      const result = await call([wedge, seaBuckthorn, vitamins, unconfirmed]);
      expect(result.limits).toEqual([notSearched("sleeping with the head raised", "B vitamins", "fish oil, krill oil")]);
      expect(notes(result)).toEqual([unsigned(3, "fish oil, krill oil")]);
      expect(result.status).toBe("ready_with_limits");
    });

    it("gives the lead in plain words, as the caveat shows it to the reader", async () => {
      const labelled = "community_leads[0].lead shows internal labels (fish_oil_dose): the answer names this lead in its " +
        "caveat, so give it in plain words.";
      expect(await noted([{ ...wedge, lead: "fish_oil_dose" }])).toEqual([labelled]);
      // A lead declared searched without a search shown reaches the caveat too.
      expect(await noted([{ ...seaBuckthorn, lead: "fish_oil_dose", search_query: "fish oil dose dry eye" }]))
        .toEqual([unsigned(0, "fish_oil_dose"), labelled]);
      // One searched as declared doesn't.
      expect(await noted([{ ...seaBuckthorn, lead: "fish_oil_dose" }])).toEqual([]);
    });
  });

  describe("one lead, one entry (review of 5 Nov 2026)", () => {
    it("notes a second entry naming the same lead and leaves it out of every other check and the limit", async () => {
      // The same lead searched in one entry and declared not searched in another: the first stands.
      const result = await call([seaBuckthorn, { lead: "Sea Buckthorn  oil.", from: [`video:${OTHER_VIDEO}`],
        state: "not_searched" }]);
      expect({ ...result, notes: notes(result) }).toMatchObject({
        status: "ready", next_steps: [], notes: [repeated(1, 0)], limits: []
      });
      // A repeat's quote is not checked either; the first's is.
      expect(await noted([seaBuckthorn, { ...seaBuckthorn, lead: "SEA BUCKTHORN OIL", answer_quote: "Not in the answer." }]))
        .toEqual([repeated(1, 0)]);
      // Not searched first, then searched: the first stands, and its limit.
      const reversed = await call([{ ...wedge, lead: "sea buckthorn oil" }, seaBuckthorn]);
      expect({ notes: notes(reversed), limits: reversed.limits })
        .toEqual({ notes: [repeated(1, 0)], limits: [notSearched("sea buckthorn oil")] });
    });

    it("compares leads in any language, by their compatibility form, case and closing mark only", async () => {
      const japanese: CommunityLead = { lead: "ビタミンB群。", from: [THREAD], state: "not_searched", reason: REASON };
      const result = await call([japanese, { ...japanese, lead: "ビタミンＢ群" }, { ...wedge, lead: "¿magnesio?" },
        { ...wedge, lead: "magnesio" }, { ...wedge, lead: "MAGNESIO;" }]);
      expect(notes(result)).toEqual([repeated(1, 0), repeated(4, 3)]);
      expect(result.limits).toEqual([notSearched("ビタミンB群", "¿magnesio?", "magnesio")]);
    });

    it("names the entries by their places as given, though an entry before them was left out", async () => {
      expect(await noted([{ ...wedge, lead: "x" }, wedge, { ...wedge, lead: "Sleeping with the head raised." }])).toEqual([
        "community_leads[0].lead: dropped: needs at least 3 characters.",
        "community_leads[0]: dropped as a whole, since its required lead could not be used: send it again with that " +
          "field usable, or leave it out.",
        repeated(2, 1)
      ]);
    });
  });

  it("works in any language: a non-English lead, query and quote", async () => {
    const query = "huile d'argousier sécheresse oculaire";
    const quote = "Les membres de ces fils ont essayé l'huile d'argousier après l'échec des oméga-3 ; une recherche " +
      "PubMed a trouvé un petit essai, qui rapportait moins de sécheresse.";
    const french: CommunityLead = { lead: "huile d'argousier", from: [THREAD], state: "searched", search_query: query,
      studies: "outcome_mismatch", answer_quote: quote };
    const japanese: CommunityLead = { lead: "睡眠時に頭を高くする", from: [`video:${VIDEO}`], state: "not_searched",
      reason: "費用がかからず害もほとんどないため、今回は研究を検索しなかった。" };
    const result = await call([french, japanese], {
      receipts: [threadRead, commentsRead, audit, search(query)], answer_draft: `${STUDY_LINE}\n\n${quote}`
    });
    expect({ ...result, notes: notes(result) }).toMatchObject({
      status: "ready_with_limits", next_steps: [], notes: [], limits: [notSearched("睡眠時に頭を高くする")]
    });
    expect(await noted([{ ...french, answer_quote: "Une phrase que la réponse ne montre pas." }], {
      receipts: [threadRead, commentsRead, audit, search(query)], answer_draft: `${STUDY_LINE}\n\n${quote}`
    })).toEqual([unshown(0)]);
  });

  it("keeps the declaration within its limits, dropping only what it cannot use, each entry at its place as given", async () => {
    const many = Array.from({ length: 13 }, (_, place) => ({ ...seaBuckthorn, lead: `sea buckthorn oil, form ${place + 1}` }));
    expect(await noted(many)).toEqual(["community_leads: kept at most 12 items to stay within the list's size limit."]);
    // An entry without its lead goes as a whole; the others stay, are checked and keep their places in the notes.
    const result = await call([{ ...seaBuckthorn, lead: "" }, { ...wedge, reason: undefined },
      { ...seaBuckthorn, lead: "omega-3 at a higher dose", from: [OTHER_THREAD], extra: "x" } as CommunityLead]);
    expect(notes(result)).toEqual([
      "community_leads[0].lead: dropped: needs at least 3 characters.",
      "community_leads[0]: dropped as a whole, since its required lead could not be used: send it again with that " +
        "field usable, or leave it out.",
      "community_leads[2].extra: dropped an unknown field.",
      noReason(1, "sleeping with the head raised"),
      unread(2, "from[0]")
    ]);
    expect(result.limits).toEqual([ONE_NOT_SEARCHED]);
    // A quote the answer doesn't show is named at its place as given too.
    expect(await noted([{ ...wedge, lead: "x" }, { ...seaBuckthorn, answer_quote: "Not in the answer." }])).toEqual([
      "community_leads[0].lead: dropped: needs at least 3 characters.",
      "community_leads[0]: dropped as a whole, since its required lead could not be used: send it again with that " +
        "field usable, or leave it out.",
      unshown(1)
    ]);
    // Something other than a list is dropped, and the reads then still ask for the declaration.
    expect(await noted({ lead: "sea buckthorn oil" } as unknown as CommunityLead[])).toEqual([
      "community_leads: dropped: expected a list.", missing("1 forum thread and the comments of 1 video")
    ]);
  });

  it("needs a lead to hold a letter or digit, in any script, or leaves the entry out (review of 5 Nov 2026)", async () => {
    for (const lead of ["...", "★★★", "—·—"]) {
      expect(await noted([{ ...wedge, lead }, { ...wedge, lead: "zinc" }]), lead).toEqual([
        "community_leads[0].lead: dropped: needs at least one letter or digit.",
        "community_leads[0]: dropped as a whole, since its required lead could not be used: send it again with that " +
          "field usable, or leave it out."
      ]);
    }
    for (const lead of ["B12", "亜鉛だ", "٣ مرات"]) {
      expect((await call([{ ...wedge, lead }])).limits, lead).toEqual([notSearched(lead)]);
    }
  });
});
