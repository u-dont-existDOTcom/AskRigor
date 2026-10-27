import { withAtlasLookupFixture } from "./helpers/atlas-lookup-fixture.js";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  FINDINGS_AND_MAP_SAVE_OFFER,
  FINDINGS_ATLAS_SENTENCE,
  FINDINGS_SAVE_OFFER,
  findingsAndMapSaveOffer,
  findingsCardDigest,
  findingsCardSchema,
  findingsSaveOffer
} from "../apps/research-mcp/src/findings/card.js";
import {
  finalizeResearch as finalizeResearchUnwrapped,
  MOBILE_NOTICE,
  TOOL_LIST_REFRESH_HINT,
  type RedditThreadCheck,
  normalizeIdentifier,
  protocolNamesFrom
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  pageKey,
  researchTargetDigest,
  verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";

import { communitySkipCaveat, COMMUNITY_SKIP_LIMIT } from "./helpers/community-skip.js";
import { assertNextStepsContract, fixtureStudyLinks } from "./helpers/finalize-next-steps-contract.js";
import { COMPLETE_CHECKS_TIP } from "../apps/research-mcp/src/final-check-messages.js";

// Pinned word for word: a lead receipt is signed only with the exact searches recorded.
const LEAD_RECEIPT_SEARCH_TEXT = "A lead receipt needs the public-copy search recorded: search for the exact DOI and the exact title, then pass those searches as public_copy_search and any public copy found as candidate_urls.";
// Pinned word for word: the step for each receipt that failed verification, by the verifier's reason.
const LEAVE_IT_OUT = "Leaving it out is allowed; work that rests only on it then needs its call again.";
const REJECTED_RECEIPT_STEPS = {
  signature_invalid: (index: number) => `receipts[${index}] does not verify, because it was changed in copying or ` +
    `issued by another AskRigor server: copy it again exactly as the tool returned it. ${LEAVE_IT_OUT}`,
  malformed: (index: number) => `receipts[${index}] is not a whole research receipt: copy the whole research_receipt ` +
    `value exactly as the tool returned it. ${LEAVE_IT_OUT}`,
  expired: (index: number) => `receipts[${index}] has expired, since a research receipt is valid for 24 hours: repeat ` +
    `the call it came from and pass the research_receipt it returns. ${LEAVE_IT_OUT}`,
  unknown_kind: (index: number) => `receipts[${index}] is a kind of receipt this AskRigor server does not know, perhaps ` +
    `from another version of AskRigor: repeat the call it came from and pass the research_receipt it returns. ${LEAVE_IT_OUT}`
} as const;

const finalizeResearchBare = (...args: Parameters<typeof finalizeResearchUnwrapped>) =>
  assertNextStepsContract(finalizeResearchUnwrapped(withAtlasLookupFixture(args[0], args[1]), args[1]));

// Detailed legacy assertions inspect diagnostics; the contract suite pins the refresh hint itself.
const SECRET = "research-finalization-test-secret-0123456789";
const now = () => new Date("2026-09-26T12:00:00.000Z");
const options = { secret: SECRET, now };
const TARGET = "Adults with hip osteoarthritis trying to avoid a replacement";
const NONCOMMERCIAL_EXERCISE = {
  status: "not_applicable",
  reason: "The research target concerns unbranded exercise, not a product or service people buy."
};
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
// The gate reads the answer before it reports ready. Tests of other checks
// pass this clean draft; a test can pass its own answer_draft, or undefined.
const CLEAN_DRAFT = "[Study](https://doi.org/10.1002/art.41142) reports exercise outcomes. Exercise therapy has the strongest evidence for hip osteoarthritis. People commenting on " +
  "YouTube videos about it reported less pain after several months; a few noticed no change, and none reported side " +
  "effects. The channels' creators sell programs; the commenters have no stake. This weak firsthand signal supports " +
  "trying exercise before surgery. On Reddit, members of " +
  "[r/HipOA](https://www.reddit.com/r/HipOA/comments/abc123/avoided_surgery/) reported slow improvement from exercise; " +
  "a few saw no change and none reported side effects, which is consistent with the YouTube comments. " +
  "Reports from this community come from my own web search, which AskRigor could not verify. Community: r/HipOA.";
// The default subreddit search carries no receipt, so the answer says so.
const FORUM_LIMIT = "The reports from r/HipOA come from your own web search, which AskRigor could not verify; say so, " +
  "and link the threads you read.";
const FORUM_CAVEAT = "Reports from this community come from my own web search, which AskRigor could not verify. " +
  "Community: r/HipOA.";
const FORUM_REPORT_LINE = "r/HipOA, exercise: 1 report(s) read; 1 firsthand report(s) of exactly this, 0 with a measurement after the change; 0 that don't say which form or product, 0 about something else and 0 advice or hearsay, not counted.";
// It also carries every caveat the gate writes, as the answer would, so tests
// of other checks pass the caveat check; its own tests pass drafts.
const PASS_ESTIMATE = "about 20 minutes and 15 YouTube searches";
const caveatedDraft = (input: Record<string, unknown>, gateOptions: typeof options): string => [
  CLEAN_DRAFT,
  ...finalizeResearchRaw({
    another_pass_estimate: PASS_ESTIMATE, ...communityDefaults(input), ...input, answer_draft: CLEAN_DRAFT
  }, gateOptions).caveats
].join(" ");
// Community research also searches beyond YouTube; tests of other checks get a
// map with YouTube and a subreddit, and a read of the subreddit.
const REDDIT_SEARCH = {
  community: "r/HipOA",
  report_identity: [{ exposure: "exercise", reports_read: 1, firsthand_exact: 1, exposure_unclear: 0, other_exposure: 0, not_firsthand: 0, measured_after: 0 }],
  platform: "reddit",
  queries: ["hip osteoarthritis avoided replacement"],
  threads_read: [{ url: "https://www.reddit.com/r/HipOA/comments/abc123/avoided_surgery/" }],
  benefit_reports: "About half of about 20 posters reported slow gains from exercise.",
  no_effect_reports: "A few reported no change.",
  adverse_reports: "None reported.",
  effect_on_answer: "Consistent with the YouTube comments.",
  // The answer's own sentences for each finding, as the model copies them from CLEAN_DRAFT.
  answer_quotes: {
    benefit_reports: "members of [r/HipOA](https://www.reddit.com/r/HipOA/comments/abc123/avoided_surgery/) " +
      "reported slow improvement from exercise",
    no_effect_reports: "a few saw no change",
    adverse_reports: "none reported side effects, which is consistent with the YouTube comments.",
    effect_on_answer: "which is consistent with the YouTube comments"
  }
};
const communityDefaults = (input: Record<string, unknown>) =>
  input.community_evidence !== "researched" || "principal_communities" in input ? {} : {
    principal_communities: [{ name: "YouTube", platform: "youtube" }, { name: "r/HipOA", platform: "reddit" }],
    community_searches: [REDDIT_SEARCH]
  };
// Every first pass ends by offering a deeper study review and deeper community
// research, with two or three focuses each; tests of other checks get two of each.
const STUDY_FOCUSES = [
  { direction: "studies", topic: "Longer trials", why: "The trials read lasted twelve weeks." },
  { direction: "studies", topic: "Results in people over 70", why: "Few trial participants were that old." }
];
const COMMUNITY_FOCUSES = [
  { direction: "community", topic: "Named walking programs", why: "Several were named but none was looked at closely." },
  { direction: "community", topic: "People who stopped", why: "Few described why they stopped." }
];
const offerDefaults = (input: Record<string, unknown>) =>
  input.research_depth === "deep" || "open_leads" in input ? {} : {
    open_leads: input.community_evidence === "researched" ? [...STUDY_FOCUSES, ...COMMUNITY_FOCUSES] : STUDY_FOCUSES
  };
const offerLimit = (community = true, unsaturated = false) =>
  `First pass only${unsaturated ? "; discovery had not saturated" : ""}. End the answer with the ` +
  `${community ? "two ways" : "way"} to go deeper, a sentence or two each, in plain language for the user (no video ` +
  "IDs or internal codes): a deeper study review (Longer trials; Results in people over 70)" +
  (community ? " and deeper community research (Named walking programs; People who stopped)" : "") +
  ". Say what each focus could change in this answer and why it looks promising, give roughly what another pass " +
  "would take, and ask which the user wants and which focus.";
const OFFER_LIMIT = offerLimit();
const STUDY_FOCUS_CAVEATS = [
  "Study focus: Longer trials. The trials read lasted twelve weeks.",
  "Study focus: Results in people over 70. Few trial participants were that old."
];
const OFFER_CAVEATS = [
  ...STUDY_FOCUS_CAVEATS,
  "Community focus: Named walking programs. Several were named but none was looked at closely.",
  "Community focus: People who stopped. Few described why they stopped.",
  `What another pass would take: ${PASS_ESTIMATE}. Would you like to go deeper into the studies or the communities, ` +
    "and which focus matters most to you?"
];
const STUDIES_OFFER_CAVEATS = [
  ...STUDY_FOCUS_CAVEATS,
  `What another pass would take: ${PASS_ESTIMATE}. Would you like to go deeper into the studies, and which focus ` +
    "matters most to you?"
];
// How the gate asks for the caveats an answer left out.
const leftOut = (...caveats: string[]) =>
  `The answer leaves out ${caveats.length === 1 ? "this caveat" : "these caveats"}; include each as its own ` +
  "sentence, as written (a link's text may change), or, in an answer not in English, in the answer's language with " +
  `the same links, given in caveat_renderings: ${caveats.map((caveat) => `"${caveat}"`).join(" ")}`;
// An answer states whether it says anything was not found; tests of other checks say it does not.
const absenceDefaults = (input: Record<string, unknown>) =>
  "absence_claims" in input || !("answer_draft" in input) ? {} : { absence_claims: [] };
const scaleDefaults = (input: Record<string, unknown>) =>
  "scale_results" in input || !("answer_draft" in input) ? {} : { scale_results: [], user_observations: [], proposed_tests: [], safety_claims: [], key_terms: [], mechanism_claims: [], recommendations: [] };
// The same for harm and safety sentences, key terms and mechanism claims (owner questions 86, 88 and 89), and for
// yes-or-no results and whether the question is about safety (AskRigor#356).
const claimDefaults = (input: Record<string, unknown>) => !("answer_draft" in input) ? {} : {
  ...("safety_claims" in input ? {} : { safety_claims: [] }),
  ...("key_terms" in input ? {} : { key_terms: [] }),
  ...("mechanism_claims" in input ? {} : { mechanism_claims: [] }),
  ...("recommendations" in input ? {} : { recommendations: [] }),
  ...("binary_results" in input ? {} : { binary_results: [] }),
  ...("safety_question" in input ? {} : { safety_question: false })
};
// An answer that compares treatments lists each plausible class of treatment, searched by name (owner answer 153a);
// tests of other checks searched exercise therapy in PubMed, which CLEAN_DRAFT reports in a sentence of its own. The
// search's receipt is signed without an issue order, so the other receipts keep theirs.
const EXERCISE_QUERY = "exercise therapy hip osteoarthritis";
const EXERCISE_SEARCH = issueResearchReceipt("literature_search", {
  src: "pubmed", q: discoveryQueryDigest([EXERCISE_QUERY]), ret: 20, n: 20
}, options);
const optionClassDefaults = (input: Record<string, unknown>) =>
  input.treatment_choice !== "compared" || "option_classes" in input || !Array.isArray(input.receipts) ? {} : {
    receipts: [...input.receipts, EXERCISE_SEARCH],
    option_classes: [{
      option_class: "exercise therapy", state: "researched", search_query: EXERCISE_QUERY,
      answer_quote: "Exercise therapy has the strongest evidence for hip osteoarthritis."
    }]
  };
// Threads read outside review sites say how they were chosen; tests of other
// checks read every relevant thread their searches found.
const threadSelectionDefaults = (input: Record<string, unknown>) => !Array.isArray(input.community_searches) ? {} : {
  community_searches: (input.community_searches as Array<Record<string, unknown>>).map((search) =>
    search.platform === "review_site" ? search : {
      report_identity: REDDIT_SEARCH.report_identity, thread_selection: "all_found", ...search
    })
};
// Every call gets the community, offer, absence, scale and option-class defaults unless it passes its own.
const finalizeResearchRaw = (input: Record<string, unknown>, gateOptions: Parameters<typeof finalizeResearchBare>[1]) =>
  finalizeResearchBare({
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixtures isolate other completion checks." },
    intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded or multi-ingredient product." },
    ...((input.community_evidence === "researched" || input.not_relevant_basis === "no_real_world_outcome")
      ? { commercial_review_applicability: NONCOMMERCIAL_EXERCISE } : {}),
    // Owner answer 149a: a skip says whether the question is about a symptom or a test result.
    ...(input.not_relevant_basis === "no_real_world_outcome" ? { question_about: "other" } : {}),
    comparison_claims: [],
    ...communityDefaults(input), ...offerDefaults(input), ...absenceDefaults(input), ...scaleDefaults(input), ...claimDefaults(input), ...input,
    ...optionClassDefaults(input),
    ...threadSelectionDefaults({ ...communityDefaults(input), ...input }),
    ...(typeof input.answer_draft === "string"
      ? { answer_draft: `${fixtureStudyLinks(input)}\n\n${input.answer_draft}${skipParagraph(input)}` } : {})
  }, gateOptions);
// An answer whose call declares community evidence not relevant for no real-world outcome states the server's sentence
// with the declared reason (owner question 125); fixtures of other checks carry it as a paragraph of its own.
function skipParagraph(input: Record<string, unknown>): string {
  return input.community_evidence === "not_relevant" && input.not_relevant_basis === "no_real_world_outcome" &&
    typeof input.not_relevant_reason === "string" ? `\n\n${communitySkipCaveat(input.not_relevant_reason)}` : "";
}
const finalizeResearchGate = (input: Record<string, unknown>, gateOptions: typeof options) => {
  const request = { another_pass_estimate: PASS_ESTIMATE, ...communityDefaults(input), ...input };
  return finalizeResearchRaw(
    "answer_draft" in input ? request : { ...request, answer_draft: caveatedDraft(input, gateOptions) },
    gateOptions
  );
};
// The sentences of CLEAN_DRAFT that report each YouTube finding; one serves three.
const YOUTUBE_QUOTES = {
  benefit_reports: "People commenting on YouTube videos about it reported less pain after several months; a few " +
    "noticed no change, and none reported side effects.",
  no_effect_reports: "People commenting on YouTube videos about it reported less pain after several months; a few " +
    "noticed no change, and none reported side effects.",
  adverse_reports: "People commenting on YouTube videos about it reported less pain after several months; a few " +
    "noticed no change, and none reported side effects.",
  creators_versus_commenters: "\u201CThe channels\u2019 creators sell programs; the commenters have no stake.\u201D",
  effect_on_answer: "This weak firsthand signal supports trying exercise before surgery."
};
const findingsFor = (videos: string[]) => ({
  videos_reviewed: videos,
  benefit_reports: "About a third of commenters reported less pain after several months.",
  no_effect_reports: "Several reported no change.",
  adverse_reports: "None reported.",
  creators_versus_commenters: "The creators sell programs; commenters have no stake.",
  effect_on_answer: "Supports trying it before surgery, as weak firsthand evidence.",
  answer_quotes: YOUTUBE_QUOTES
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
  it("asks every answer with key studies for the whole-intervention declaration, compared or not (owner question 47)", () => {
    const base = {
      community_evidence: "researched" as const, research_target: TARGET, research_depth: "deep" as const,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }],
      receipts: [survey, emptySearch, repeatScout, videoA, study], intervention_identity: undefined
    };
    for (const treatment_choice of ["not_compared", "compared"] as const) {
      expect(finalizeResearch({ ...base, treatment_choice }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" "), treatment_choice)
        .toContain("Give intervention_identity");
    }
  });

  it("binds a treatment comparison to the latest treatment-coverage check", () => {
    const target = TARGET;
    // Deep research runs the coverage lock; a first pass does not (below).
    const base = {
      community_evidence: "researched" as const,
      research_target: target,
      research_depth: "deep" as const,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
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
    expect(missing.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("call assess_treatment_landscape_coverage");

    // A blocking result binds the answer even when the caller says no comparison was made.
    const blocked = finalizeResearch({
      ...base, receipts: [...ready, coverage("continue_research", "2026-09-26T11:00:00.000Z")], treatment_choice: "not_compared"
    }, options);
    expect(blocked.status).toBe("not_ready");
    expect(blocked.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("was continue_research");

    const bounded = finalizeResearch({
      ...base, receipts: [...ready, coverage("bounded_nonranking_only", "2026-09-26T11:00:00.000Z")], treatment_choice: "compared"
    }, options);
    expect(bounded.status).toBe("ready_with_limits");
    expect(bounded.limits.join(" ")).toContain("do not rank or recommend");

    const firstPass = [...ready, coverage("first_pass_with_open_leads", "2026-09-26T11:00:00.000Z")];
    expect(finalizeResearch({ ...base, receipts: firstPass, treatment_choice: "compared" }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" "))
      .toContain("deep research needs ledger_consistent_for_synthesis");

    // A first pass does not run the lock: its comparison needs no check, is
    // provisional with no final ranking, and a check made anyway does not bind it.
    const provisional = "The treatment comparison rests on a first pass: present it as provisional, with no final ranking.";
    for (const receipts of [ready, [...ready, coverage("continue_research", "2026-09-26T11:00:00.000Z")]]) {
      const firstPassComparison = finalizeResearch({
        ...base, research_depth: "first_pass", receipts, treatment_choice: "compared"
      }, options);
      expect(firstPassComparison.status).toBe("ready_with_limits");
      expect(firstPassComparison.limits).toEqual([FORUM_LIMIT, provisional, OFFER_LIMIT]);
      expect(verifyResearchReceipt(firstPassComparison.finalization_receipt!, options))
        .toMatchObject({ ok: true, claims: { coverage: "none" } });
    }

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
    expect(later.status).toBe("ready_with_limits");
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
    expect(sameSecond.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("was continue_research");
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
    }, options).status).toBe("ready_with_limits");

    // A comparison needs the check run as a broad treatment choice.
    const narrow = finalizeResearch({
      ...base,
      receipts: [...ready, coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z", target, false)],
      treatment_choice: "compared"
    }, options);
    expect(narrow.status).toBe("not_ready");
    expect(narrow.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("with broad_treatment_choice true");

    // A check made for another target does not count, and the target must be passed to match one.
    const otherTarget = finalizeResearch({
      ...base,
      receipts: [...ready, coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z", "Adults with tinnitus")],
      treatment_choice: "compared"
    }, options);
    expect(otherTarget.status).toBe("not_ready");
    expect(otherTarget.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("was made for this research_target");
    // The research target is required, so a check can always be matched.
    const { research_target: _target, ...withoutTarget } = base;
    const missingTarget = finalizeResearch({
      ...withoutTarget,
      receipts: [...ready, coverage("ledger_consistent_for_synthesis", "2026-09-26T11:30:00.000Z")],
      treatment_choice: "compared"
    }, options);
    expect(missingTarget.status).toBe("not_ready");
    expect(missingTarget.receipts_verified).toBe(0);
    expect(missingTarget.next_steps.join("\n")).toContain("research_target:");

    // A check made for another question judged videos this research never found.
    const judged = (videos: string[]) => issueResearchReceipt(
      "treatment_coverage",
      { boundary: "ledger_consistent_for_synthesis", lock: "pass", videos, target: discoveryQueryDigest([target]), broad: true },
      options
    );
    expect(finalizeResearch({
      ...base, receipts: [...ready, judged(["aaaaaaaaaaa"])], treatment_choice: "compared"
    }, options).status).toBe("ready_with_limits");
    const foreign = finalizeResearch({
      ...base, receipts: [...ready, judged(["aaaaaaaaaaa", "zzzzzzzzzzz"])], treatment_choice: "compared"
    }, options);
    expect(foreign.status).toBe("not_ready");
    expect(foreign.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("judged video(s) zzzzzzzzzzz that no discovery receipt");
  });

  it("has a first pass or a bounded answer say that it does not rank, and leaves the wording to the model", () => {
    const base = {
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched" as const,
      treatment_choice: "compared" as const,
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }],
      community_findings: findingsFor(["aaaaaaaaaaa"])
    };
    const draftWith = (input: Record<string, unknown>, sentence: string) =>
      finalizeResearchRaw({
        another_pass_estimate: PASS_ESTIMATE, ...input, answer_draft: `${caveatedDraft(input, options)}\n\n${sentence}`
      }, options);
    // A first pass names no best option (HRP 20.6.6): the answer says so in the gate's words.
    const firstPass = draftWith(base, "Exercise and weight loss both help; which suits you depends on your goals.");
    expect(firstPass.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(firstPass.limits).toContain(
      "The treatment comparison rests on a first pass: present it as provisional, with no final ranking."
    );
    expect(firstPass.caveats).toContain(
      "This comparison rests on a first pass through the evidence, so treat it as provisional; it does not rank the " +
        "options."
    );
    // Whether a sentence names a best option is a judgment about meaning, in whatever language the answer is in;
    // no word list makes it, so the gate reads none (AGENTS.md code review rules). An answer that states the
    // caveat and still ranks gets past the gate: its reader sees both.
    expect(draftWith(base, "Of these, exercise is the best option for most people.").next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    // Deep research may rank once the coverage check allows it; a bounded result says it does not.
    const coverage = (boundary: string) => issueResearchReceipt("treatment_coverage", {
      boundary, lock: boundary === "ledger_consistent_for_synthesis" ? "pass" : "block",
      target: discoveryQueryDigest([TARGET]), broad: true
    }, { secret: SECRET, now: () => new Date("2026-09-26T11:00:00.000Z") });
    const deep = (boundary: string) => ({ ...base, research_depth: "deep", receipts: [...base.receipts, coverage(boundary)] });
    const bounded = draftWith(deep("bounded_nonranking_only"), "Physiotherapy suits most people.");
    expect(bounded.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(bounded.caveats).toContain(
      "The evidence check allows only a limited comparison here, so this answer does not rank or recommend among " +
        "the options."
    );
    expect(draftWith(deep("ledger_consistent_for_synthesis"), "Physiotherapy is your best bet.").caveats)
      .not.toContain(expect.stringMatching(/does not rank/u));
  });

  it("has forum threads say how they were chosen, and what threads chosen by outcome can show (lesson #27)", () => {
    const run = (thread_selection: unknown) => finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }],
      community_searches: [{ ...REDDIT_SEARCH, thread_selection }]
    }, options);
    const missing = run(undefined);
    expect(missing.status).toBe("not_ready");
    expect(missing.next_steps).toEqual([
      "community_searches for r/HipOA reads threads without thread_selection: say how they were chosen, such as " +
        "every relevant one the searches found, the ones ranked first, or ones found by searching for outcomes.",
      TOOL_LIST_REFRESH_HINT
    ]);
    expect(run("all_found").status).toBe("ready_with_limits");
    const chosen = run("outcome_keyword");
    expect(chosen.status).toBe("ready_with_limits");
    expect(chosen.caveats).toContain("The threads I read in this community were found by searching for outcomes, so " +
      "they show which experiences people report, not how common each one is. Community: r/HipOA.");
  });

  it("is ready when community and key studies are backed by receipts", () => {
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.limits).toEqual([FORUM_LIMIT, OFFER_LIMIT]);
    expect(result.community).toEqual({
      decision: "researched",
      surveys: 1,
      discovery_rounds: 3,
      saturated: true,
      depth: "first_pass",
      first_pass_complete: true,
      open_leads: ["Longer trials", "Results in people over 70", "Named walking programs", "People who stopped"],
      audited_videos: ["aaaaaaaaaaa"],
      material_videos: ["aaaaaaaaaaa"],
      principal_communities: ["YouTube", "r/HipOA"],
      communities_searched: ["YouTube", "r/HipOA"]
    });
    const permit = verifyResearchReceipt(result.finalization_receipt!, options);
    expect(permit.ok && permit.kind).toBe("finalization");
    expect(permit.ok && permit.claims.status).toBe("ready_with_limits");
    expect(result.answer_checked).toBe(true);
  });

  it("does not take YouTube research for the whole community lane (the HGH versus testosterone report)", () => {
    // Owner report, 29 Sep: "How much healthier is injecting HGH vs testosterone?" was answered after a YouTube
    // audit alone, though long-term users mostly report on Reddit and specialist forums. The receipts here are the
    // complete YouTube research of the ready case; only the community lane is under test.
    const youtubeOnly = {
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }]
    };
    const communities = [
      { name: "r/trt", platform: "reddit" },
      { name: "MESO-Rx", platform: "forum" },
      { name: "YouTube", platform: "youtube" }
    ];
    const trt = {
      community: "r/trt",
      report_identity: [{ ...REDDIT_SEARCH.report_identity[0]!, exposure: "growth hormone" }],
      platform: "reddit",
      queries: ["hgh vs trt long term side effects"],
      threads_read: [{ url: "https://old.reddit.com/r/trt/comments/xyz789/hgh_and_trt_five_years/" }],
      benefit_reports: "Most of about 30 long-term users reported better recovery on either.",
      no_effect_reports: "Several said growth hormone added little over testosterone.",
      adverse_reports: "Joint pain, carpal tunnel and raised blood sugar on growth hormone; acne and high hematocrit on testosterone.",
      effect_on_answer: "Supports naming the growth hormone side effects first.",
      answer_quotes: {
        benefit_reports: "most long-term users reported better recovery",
        no_effect_reports: "several saw no difference from growth hormone",
        adverse_reports: "some reported joint pain and raised blood sugar",
        effect_on_answer: "which supports naming its side effects first"
      }
    };
    const reported = `${CLEAN_DRAFT} On [r/trt](https://www.reddit.com/r/trt/comments/xyz789/hgh_and_trt_five_years/), ` +
      "most long-term users reported better recovery, several saw no difference from growth hormone, and some " +
      "reported joint pain and raised blood sugar, which supports naming its side effects first. Reports from this " +
      "community come from my own web search, which AskRigor could not verify. Community: r/trt. " +
      OFFER_CAVEATS.join(" ");
    const gate = (input: Record<string, unknown>) => finalizeResearch({ ...youtubeOnly, ...input }, options);

    // No map: YouTube alone does not finish the community lane.
    expect(finalizeResearchBare({ intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient product is involved." }, ...youtubeOnly, community_findings: findingsFor(["aaaaaaaaaaa"]) }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toContain(
        "Name where people discussing this actually talk in principal_communities, the dominant first (subreddits, " +
          "specialist forums, Facebook groups, patient organizations, YouTube). Then search the dominant one and at " +
          "least one independent one: YouTube with its tools, the others with your own web search, recorded in " +
          "community_searches."
      );
    // A map whose communities outside YouTube went unsearched.
    const unsearched = gate({ principal_communities: communities, community_searches: [] });
    expect(unsearched.status).toBe("not_ready");
    expect(unsearched.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Search r/trt, the community listed first, with your web search and record it in community_searches, or the " +
        "access boundary that stops you.",
      "Search at least one more community, independent of YouTube (r/trt, MESO-Rx): YouTube with its tools, the " +
        "others with your web search recorded in community_searches, or record the access boundary that stops you."
    ]);
    expect(unsearched.finalization_receipt).toBeUndefined();

    // The dominant subreddit, read and reported, completes it.
    const searched = gate({ principal_communities: communities, community_searches: [trt], answer_draft: reported });
    expect(searched.status).toBe("ready_with_limits");
    expect(searched.caveats).toEqual([
      "Reports from this community come from my own web search, which AskRigor could not verify. Community: r/trt.",
      ...OFFER_CAVEATS
    ]);
    // AskRigor cannot see the client's web search: the permit records the subreddit as unverified.
    expect(verifyResearchReceipt(searched.finalization_receipt!, options))
      .toMatchObject({ ok: true, claims: { status: "ready_with_limits", unverified: "1" } });
    // A search counts for a mapped community only on the same platform: a forum named r/trt is not the subreddit.
    const renamed = gate({
      principal_communities: communities,
      community_searches: [
        { ...trt, platform: "forum", threads_read: [{ url: "https://thinksteroids.com/community/threads/9/" }] },
        { ...trt, community: "MESO-Rx", platform: "forum", threads_read: [{ url: "https://thinksteroids.com/community/threads/2/" }] }
      ],
      answer_draft: reported
    });
    expect(renamed.status).toBe("not_ready");
    expect(renamed.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "Search r/trt, the community listed first, with your web search and record it in community_searches, or the " +
        "access boundary that stops you."
    );
    expect(searched.community).toMatchObject({
      principal_communities: ["r/trt", "MESO-Rx", "YouTube"],
      communities_searched: ["YouTube", "r/trt"]
    });
    expect(searched.must_report).toEqual([
      expect.stringMatching(/^YouTube comments \(1 video\(s\) read\): /u),
      "r/trt, growth hormone: 1 report(s) read; 1 firsthand report(s) of exactly this, 0 with a measurement after the change; 0 that don't say which form or product, 0 about something else and 0 advice or hearsay, not counted.",
      expect.stringMatching(/^r\/trt \(1 thread\(s\) read\): Benefits: Most of about 30 long-term users/u)
    ]);
    // The answer must report it: the model copies the sentences that report each finding, the answer must show
    // them, and a paragraph that reports it links a thread read there.
    const offer = OFFER_CAVEATS.join(" ");
    const withoutForums = `${CLEAN_DRAFT.replace(/ On Reddit, .*$/u, "")} Reports from this community come from my ` +
      `own web search, which AskRigor could not verify. Community: r/trt. ${offer}`;
    const unshown = "For r/trt, answer_quotes gives text the answer does not show (benefit_reports, no_effect_reports, " +
      "adverse_reports, effect_on_answer): report each finding in the answer, and copy the sentence(s) that report " +
      "it exactly, from one paragraph or list item.";
    expect(gate({
      principal_communities: communities, community_searches: [trt],
      answer_draft: `${CLEAN_DRAFT.replace(/ On Reddit, .*$/u, "")} ${offer}`
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      unshown,
      leftOut("Reports from this community come from my own web search, which AskRigor could not verify. Community: " +
        "r/trt.")
    ]);
    // Naming the community, as the caveat does, is not reporting what its posters said.
    expect(gate({ principal_communities: communities, community_searches: [trt], answer_draft: withoutForums }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([unshown]);
    const { answer_quotes: _quotes, ...unquoted } = trt;
    expect(gate({ principal_communities: communities, community_searches: [unquoted], answer_draft: reported }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([
        "Give answer_quotes for r/trt in its community_searches entry: for each finding, the sentence(s) of the answer " +
          "that report it, copied from answer_draft. The answer must report what r/trt showed, even if the signal is weak."
      ]);
    // Reported without a link to a thread read there, it cannot be checked.
    const unlinked = reported.replace(
      "On [r/trt](https://www.reddit.com/r/trt/comments/xyz789/hgh_and_trt_five_years/), ", "\n\nOn r/trt, ");
    expect(gate({ principal_communities: communities, community_searches: [trt], answer_draft: unlinked }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual(["Link a thread you read from r/trt in a paragraph that reports it, so a reader can check it."]);
    // Findings are needed for a community that was read.
    const { benefit_reports: _benefit, effect_on_answer: _effect, ...unreported } = trt;
    expect(gate({ principal_communities: communities, community_searches: [unreported] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "Say what r/trt showed: give benefit_reports, effect_on_answer in its community_searches entry, even if the " +
        "signal is weak or neutral."
    );

    // An access boundary counts as searched, and the answer says so.
    const facebook = [{ name: "TRT Facebook group", platform: "facebook" }, { name: "YouTube", platform: "youtube" }];
    const gated = {
      community: "TRT Facebook group", platform: "facebook", queries: ["hgh trt"], access_boundary: "login_required",
      url: "https://www.facebook.com/groups/trtmen"
    };
    const bounded = gate({ principal_communities: facebook, community_searches: [gated] });
    expect(bounded.status).toBe("ready_with_limits");
    expect(bounded.caveats).toContain("A community that needs a login to read: TRT Facebook group. Reports there are " +
      "not included.");
    // A failed fetch is not a site's refusal, and its caveat says what happened (the 2026-10-15 owner regressions).
    const failed = gate({ principal_communities: facebook, community_searches: [{ ...gated, access_boundary: "retrieval_failed" }] });
    expect(failed.status).toBe("ready_with_limits");
    expect(failed.caveats).toContain("A community whose pages could not be retrieved: TRT Facebook group. Reports there " +
      "are not included.");
    expect(failed.caveats.join(" ")).not.toContain("blocked access");
    const blocked = gate({ principal_communities: facebook, community_searches: [{ ...gated, access_boundary: "blocked" }] });
    expect(blocked.caveats).toContain("A community that blocked access: TRT Facebook group. Reports there are not " +
      "included.");
    // A search that turned up nothing relevant says so, and nothing more.
    const empty = gate({ principal_communities: facebook, community_searches: [{ ...gated, access_boundary: "no_relevant_results" }] });
    expect(empty.status).toBe("ready_with_limits");
    expect(empty.limits).toContain("The search of TRT Facebook group found no relevant reports; say so.");
    expect(empty.caveats).toContain("A community where a search turned up no relevant reports: TRT Facebook group.");
    expect(empty.caveats.join(" ")).not.toContain("Reports there are not included");
    // One site is one discussion pool, whatever each entry is called.
    const { platform: _reddit, threads_read: _threads, ...trtFindings } = trt;
    const meso = {
      ...trtFindings, community: "MESO-Rx", platform: "forum",
      threads_read: [{ url: "https://thinksteroids.com/community/threads/hgh-vs-trt.1/" }]
    };
    const mesoAgain = {
      ...meso, community: "MESO-Rx Men's Health",
      threads_read: [{ url: "https://www.thinksteroids.com/community/threads/trt-and-hgh.2/" }]
    };
    const onePool = gate({
      principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "MESO-Rx Men's Health", platform: "forum" }],
      community_searches: [meso, mesoAgain]
    });
    expect(onePool.status).toBe("not_ready");
    expect(onePool.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for MESO-Rx Men's Health is on thinksteroids.com, as MESO-Rx is: one site is one " +
        "discussion pool, so list its threads under one entry and search an independent community."
    );
    // A mobile or alternate front end is the same site, and a Facebook group is one pool however it is reached.
    const groupPost = {
      ...trtFindings, community: "HGH users group", platform: "facebook",
      threads_read: [{ url: "https://www.facebook.com/groups/hghusers/posts/101/" }]
    };
    const sameGroup = {
      ...groupPost, community: "HGH users (mobile)",
      threads_read: [{ url: "https://m.facebook.com/groups/hghusers/permalink/202/" }]
    };
    expect(gate({
      principal_communities: [{ name: "HGH users group", platform: "facebook" }, { name: "HGH users (mobile)", platform: "facebook" }],
      community_searches: [groupPost, sameGroup]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for HGH users (mobile) is on facebook.com/groups/hghusers, as HGH users group is: one site " +
        "is one discussion pool, so list its threads under one entry and search an independent community."
    );
    // A community read nowhere is known by its address, never by its name alone.
    const blockedGroup = { community: "HGH users group", platform: "facebook", queries: ["hgh"], access_boundary: "login_required" };
    const blockedMap = [{ name: "HGH users group", platform: "facebook" }, { name: "HGH users mobile", platform: "facebook" }];
    expect(gate({ principal_communities: blockedMap, community_searches: [blockedGroup] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for HGH users group records an access boundary but no url: give the community's address " +
        "(its forum, group or site link), so it is known by its site rather than its name; or record access_boundary " +
        "not_found when no site by that name could be found."
    );
    expect(gate({
      principal_communities: blockedMap,
      community_searches: [
        { ...blockedGroup, url: "https://www.facebook.com/groups/hghusers" },
        { ...blockedGroup, community: "HGH users mobile", url: "https://m.facebook.com/groups/hghusers/" }
      ]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for HGH users mobile is on facebook.com/groups/hghusers, as HGH users group is: one site is " +
        "one discussion pool, so list its threads under one entry and search an independent community."
    );
    // An address is checked against the platform like a thread link: a subreddit filed as a forum is still the
    // subreddit, and a subreddit's address is its own.
    const trtBoundary = { community: "r/trt", platform: "reddit", queries: ["hgh"], access_boundary: "no_relevant_results" };
    expect(gate({
      principal_communities: [{ name: "r/trt", platform: "reddit" }, { name: "TRT forum", platform: "forum" }],
      community_searches: [
        { ...trtBoundary, url: "https://www.reddit.com/r/trt/" },
        { ...trtBoundary, community: "TRT forum", platform: "forum", url: "https://reddit.com/r/trt" }
      ]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for TRT forum lists Reddit links; record them under platform reddit, as the subreddit they " +
        "are in."
    );
    expect(gate({
      principal_communities: communities,
      community_searches: [{ ...trtBoundary, url: "https://www.reddit.com/r/Testosterone/" }]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain("community_searches for r/trt gives a url outside r/trt; give the subreddit's own link.");
    // Facebook, Telegram and Discord live on their own hosts too: an entry there links only there, and their links
    // belong to them.
    const chat = { community: "TRT men chat", queries: ["hgh"], access_boundary: "login_required" };
    const facebookStep = "community_searches for TRT men chat gives Facebook links outside a group: give the group's " +
      "link (facebook.com/groups/…) and the posts in it you read.";
    const telegramStep = "community_searches for TRT men chat gives Telegram links that name no channel or group: " +
      "give a public channel's t.me link and the posts in it you read, or a private group's invite (t.me/+…) as url, " +
      "with the access boundary you hit.";
    for (const [search, step] of [
      [{ ...chat, platform: "facebook", url: "https://example.org/forum" },
        "community_searches for TRT men chat is on Facebook but lists links elsewhere; give the Facebook links of the " +
          "community and the posts you read."],
      [{ ...chat, platform: "telegram", url: "https://discord.gg/trtmen" },
        "community_searches for TRT men chat is on Telegram but lists links elsewhere; give the Telegram links of the " +
          "community and the posts you read."],
      [{ ...chat, platform: "forum", url: "https://m.facebook.com/groups/trtmen" },
        "community_searches for TRT men chat lists Facebook links; record them under platform facebook."],
      [{ ...chat, platform: "other", url: "https://discord.com/invite/trtmen" },
        "community_searches for TRT men chat lists Discord links; record them under platform discord."],
      // And a community there is a group, a public channel or a server, not any page of the platform.
      [{ ...chat, platform: "facebook", url: "https://www.facebook.com/groups/feed/" }, facebookStep],
      [{ ...chat, platform: "facebook", url: "https://www.facebook.com/groups/discover" }, facebookStep],
      [{ ...chat, platform: "facebook", url: "https://m.facebook.com/groups/create/" }, facebookStep],
      [{ ...chat, platform: "facebook", url: "https://www.facebook.com/help" },
        "community_searches for TRT men chat gives Facebook links outside a group: give the group's link " +
          "(facebook.com/groups/…) and the posts in it you read."],
      [{ ...chat, platform: "telegram", url: "https://telegram.org/faq" }, telegramStep],
      // An invite opens a group only members can read, so it is the entry's address, never a thread read.
      [{ ...chat, platform: "telegram", url: "https://t.me/trtmen", threads_read: [{ url: "https://t.me/+AbCdEf123" }] },
        telegramStep],
      [{ ...chat, platform: "discord", url: "https://discord.com/safety" },
        "community_searches for TRT men chat gives Discord links other than a server invite: Discord servers can be " +
          "read only by joining, so record the server's invite (discord.gg/…) as url, with the access boundary you hit."],
      [{ ...chat, platform: "discord", url: "https://discord.gg/trtmen",
        threads_read: [{ url: "https://discord.com/channels/123456789/987654321/111" }] },
        "community_searches for TRT men chat gives Discord links other than a server invite: Discord servers can be " +
          "read only by joining, so record the server's invite (discord.gg/…) as url, with the access boundary you hit."]
    ] as const) {
      expect(gate({ principal_communities: communities, community_searches: [search] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(step);
    }
    for (const search of [
      { ...chat, platform: "telegram", url: "https://t.me/trtmen" },
      { ...chat, platform: "telegram", url: "https://t.me/+AbCdEf123" },
      { ...chat, platform: "telegram", url: "https://t.me/joinchat/AbCdEf123" },
      { ...chat, platform: "discord", url: "https://discord.gg/trtmen" }
    ]) {
      expect(gate({ principal_communities: communities, community_searches: [search] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)
        .filter((step) => step.startsWith("community_searches for TRT men chat"))).toEqual([]);
    }
    // Two invites may open one Discord server, so Facebook, Telegram and Discord count once each toward
    // independence however many of their communities are listed.
    const servers = [{ name: "TRT Discord", platform: "discord" }, { name: "HGH Discord", platform: "discord" }];
    const invites = [
      { community: "TRT Discord", platform: "discord", queries: ["hgh"], access_boundary: "login_required", url: "https://discord.gg/trtmen" },
      { community: "HGH Discord", platform: "discord", queries: ["hgh"], access_boundary: "login_required", url: "https://discord.gg/Hgh2x" }
    ];
    expect(finalizeResearch({
      ...youtubeOnly, receipts: [study], principal_communities: servers, community_searches: invites
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "Search at least one more community, independent of TRT Discord, HGH Discord: YouTube with its tools, the others " +
        "with your web search recorded in community_searches, or record the access boundary that stops you. " +
        "Communities on one of Facebook, Telegram or Discord count once together: their links cannot show that they " +
        "are separate discussion pools."
    );
    // A search cannot both find nothing relevant and report the threads it read.
    expect(gate({
      principal_communities: communities, community_searches: [{ ...trt, access_boundary: "no_relevant_results" }]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for r/trt gives both threads read and access_boundary no_relevant_results; keep one: the " +
        "threads and what they showed, or the boundary if nothing relevant turned up."
    );

    // Two YouTube entries are one community: YouTube alone needs a stated reason.
    const twoYoutube = [{ name: "YouTube", platform: "youtube" }, { name: "YouTube TRT channels", platform: "youtube" }];
    expect(gate({ principal_communities: twoYoutube }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "principal_communities lists one community: name an independent one (another platform, forum or discussion " +
        "pool) and search it, or give single_community_reason."
    ]);
    const alone = gate({
      principal_communities: [{ name: "YouTube", platform: "youtube" }],
      single_community_reason: "Only YouTube channels discuss this program."
    });
    expect(alone.status).toBe("ready_with_limits");
    expect(alone.caveats).toContain("Only one community seems to discuss this, so the community evidence rests on a single group.");

    // Links are checked against the platform: YouTube goes through its own tools, and Reddit threads are on Reddit.
    const misfiled = gate({
      principal_communities: communities,
      community_searches: [
        { ...trt, threads_read: [{ url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }] },
        { ...trt, community: "MESO-Rx", platform: "reddit", threads_read: [{ url: "https://thinksteroids.com/community/threads/1/" }] },
        { community: "ExcelMale", platform: "forum", queries: ["hgh"] }
      ]
    });
    expect(misfiled.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).slice(0, 3)).toEqual([
      "community_searches for r/trt lists YouTube links; research YouTube with its own tools.",
      "community_searches for MESO-Rx is on Reddit but lists links elsewhere; list the Reddit threads you read.",
      "community_searches for ExcelMale lists no thread read: add the threads you read, or the access_boundary that " +
        "stopped the search."
    ]);
  });

  it("binds each community's lane, link and threads to that community", () => {
    // Deep research, so the answers below need no first-pass offer.
    const base = {
      research_depth: "deep",
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }]
    };
    const findings = {
      benefit_reports: "Most reported better recovery.",
      no_effect_reports: "Some saw no difference.",
      adverse_reports: "A few reported joint pain.",
      effect_on_answer: "Consistent with the trials."
    };
    const trtThread = "https://old.reddit.com/r/trt/comments/xyz789/hgh_and_trt_five_years/";
    const testosteroneThread = "https://www.reddit.com/r/Testosterone/comments/def456/ten_years_on_trt/";
    const subreddits = [
      { name: "r/trt", platform: "reddit" },
      { name: "r/Testosterone", platform: "reddit" },
      { name: "YouTube", platform: "youtube" }
    ];
    // The answer's sentences for each community's findings, as the model quotes them: one sentence reports all four.
    const quotesOf = (sentence: string) => ({
      benefit_reports: sentence, no_effect_reports: sentence, adverse_reports: sentence, effect_on_answer: sentence
    });
    const trtReport = "most reported better recovery; some saw no difference and a few reported side effects, " +
      "consistent with the trials.";
    const testosteroneReport = "most reported better recovery too; some saw no difference and a few reported side " +
      "effects, consistent with the trials.";
    const read = (community: string, url: string, platform = "reddit") => ({
      community, platform, queries: ["hgh vs trt"], threads_read: [{ url }], ...findings,
      answer_quotes: quotesOf(community === "r/Testosterone" ? testosteroneReport : trtReport)
    });
    const both = [read("r/trt", trtThread), read("r/Testosterone", testosteroneThread)];
    const caveat = "Reports from these communities come from my own web search, which AskRigor could not verify. " +
      "Communities: r/trt; r/Testosterone.";
    const gate = (input: Record<string, unknown>) =>
      finalizeResearch({ ...base, principal_communities: subreddits, ...input }, options);
    const unshown = (community: string) => `For ${community}, answer_quotes gives text the answer does not show ` +
      "(benefit_reports, no_effect_reports, adverse_reports, effect_on_answer): report each finding in the answer, " +
      "and copy the sentence(s) that report it exactly, from one paragraph or list item.";

    // A paragraph about "Reddit" that does not hold the sentences quoted for each subreddit reports for neither.
    const generic = `${CLEAN_DRAFT}\n\nOn Reddit, users reported better recovery; some saw no difference and a few ` +
      `reported side effects, consistent with the trials. See [one thread](${trtThread}) and [another](${testosteroneThread}).` +
      `\n\n${caveat}`;
    expect(gate({ community_searches: both, answer_draft: generic }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([unshown("r/trt"), unshown("r/Testosterone")]);
    // Quoted for both, it reports both: a thread from each is linked where it does.
    const genericQuotes = quotesOf("On Reddit, users reported better recovery; some saw no difference");
    expect(gate({
      community_searches: both.map((search) => ({ ...search, answer_quotes: genericQuotes })), answer_draft: generic
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    // A section per subreddit, each with its findings and its own thread, passes.
    const sections = `${CLEAN_DRAFT}\n\nOn [r/trt](${trtThread}), most reported better recovery; some saw no difference ` +
      "and a few reported side effects, consistent with the trials.\n\nOn " +
      `[r/Testosterone](${testosteroneThread}), most reported better recovery too; some saw no difference and a few ` +
      `reported side effects, consistent with the trials.\n\n${caveat}`;
    const passed = gate({ community_searches: both, answer_draft: sections });
    expect(passed.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(passed.status).toBe("ready_with_limits");
    // A share link, another slug or a comment permalink in the same thread is its link.
    for (const alias of ["https://www.reddit.com/r/trt/comments/xyz789/?utm_source=share&utm_medium=web2x#top",
      "https://redd.it/xyz789", "https://www.reddit.com/r/trt/comments/xyz789/other_slug/c0mm3nt/?context=3"]) {
      expect(gate({ community_searches: both, answer_draft: sections.replace(`[r/trt](${trtThread})`, `[r/trt](${alias})`) })
        .next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    }
    // A link to one subreddit's thread in another's section is not its link.
    const swapped = sections.replace(`[r/trt](${trtThread})`, `[r/trt](${testosteroneThread})`);
    expect(gate({ community_searches: both, answer_draft: swapped }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Link a thread you read from r/trt in a paragraph that reports it, so a reader can check it."
    ]);

    // A subreddit's entry names it, and its threads are in it; Reddit threads are Reddit's.
    expect(gate({
      community_searches: [read("r/trt", testosteroneThread), read("MESO-Rx", trtThread, "forum"), read("TRT forum", trtThread, "reddit")]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).slice(0, 3)).toEqual([
      "community_searches for r/trt lists links that are not threads in r/trt: list each thread you read by its " +
        "full link (reddit.com/r/trt/comments/…), under its own subreddit's entry.",
      "community_searches for MESO-Rx lists Reddit links; record them under platform reddit, as the subreddit " +
        "they are in.",
      "Name the Reddit community TRT forum by its subreddit, as r/<name>."
    ]);
    // A subreddit's front page, wiki, search or share link is not a thread read.
    for (const page of ["https://www.reddit.com/r/trt/", "https://www.reddit.com/r/trt/wiki/index/",
      "https://www.reddit.com/r/trt/search/?q=hgh", "https://www.reddit.com/r/trt/s/AbCdEf123", "https://redd.it/xyz789"]) {
      expect(gate({ community_searches: [read("r/trt", page), read("r/Testosterone", testosteroneThread)] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
        .toContain("community_searches for r/trt lists links that are not threads in r/trt: list each thread you read " +
          "by its full link (reddit.com/r/trt/comments/…), under its own subreddit's entry.");
    }
    // One thread counts for one community only.
    const forumThread = "https://thinksteroids.com/community/threads/2/";
    const twice = gate({
      principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "ExcelMale", platform: "forum" }],
      community_searches: [read("MESO-Rx", forumThread, "forum"), read("ExcelMale", forumThread, "forum")]
    });
    const alreadyListed = (community: string) => `community_searches for ${community} lists a thread already listed ` +
      "for another community; list each thread under the one community it belongs to.";
    expect(twice.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(alreadyListed("ExcelMale"));
    // A fragment, tracking parameter or trailing slash does not make it another thread...
    for (const alias of [`${forumThread}#post-12`, `${forumThread}?utm_source=share&fbclid=abc`, forumThread.slice(0, -1),
      forumThread.replace("https://", "http://www.")]) {
      expect(gate({
        principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "ExcelMale", platform: "forum" }],
        community_searches: [read("MESO-Rx", forumThread, "forum"), read("ExcelMale", alias, "forum")]
      }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(alreadyListed("ExcelMale"));
    }
    // ...nor does another subreddit's path: a Reddit post's id is the thread.
    expect(gate({
      community_searches: [read("r/trt", trtThread), read("r/Testosterone", trtThread.replace("/r/trt/", "/r/Testosterone/"))]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(alreadyListed("r/Testosterone"));
    // Nor does a page, post, session or sort order of the same forum thread.
    const phpbb = "https://forum.example.org/viewtopic.php?t=2";
    const xenforo = "https://thinksteroids.com/community/threads/hgh-and-trt.12345/";
    for (const [first, alias] of [
      [`${phpbb}&start=0`, `${phpbb}&start=20`],
      [phpbb, `${phpbb}&start=20&sid=0123abcd&sk=t&sd=d&st=0`],
      [xenforo, `${xenforo}page-2`],
      [xenforo, `${xenforo}post-678`],
      ["https://forum.example.org/t/hgh-results/123", "https://forum.example.org/t/hgh-results/123/45"],
      ["https://forum.example.org/showthread.php?t=9", "https://forum.example.org/showthread.php?t=9&page=3&s=5f3a"]
    ]) {
      expect(gate({
        principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "ExcelMale", platform: "forum" }],
        community_searches: [read("MESO-Rx", first!, "forum"), read("ExcelMale", alias!, "forum")]
      }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(alreadyListed("ExcelMale"));
    }
    // Nor does a post or forum id beside the thread id.
    for (const [first, alias] of [
      ["https://forum.example.org/showthread.php?t=9", "https://forum.example.org/showthread.php?t=9&p=42"],
      ["https://forum.example.org/viewtopic.php?t=2", "https://forum.example.org/viewtopic.php?f=3&t=2&p=77#p77"]
    ]) {
      expect(gate({
        principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "ExcelMale", platform: "forum" }],
        community_searches: [read("MESO-Rx", first!, "forum"), read("ExcelMale", alias!, "forum")]
      }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(alreadyListed("ExcelMale"));
    }
    // A query parameter or topic number that names the thread keeps two threads apart; so does a post id without one.
    expect(gate({
      principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "ExcelMale", platform: "forum" }],
      community_searches: [read("MESO-Rx", "https://forum.example.org/viewtopic.php?p=77", "forum"),
        read("ExcelMale", "https://forum.example.org/viewtopic.php?p=78", "forum")]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).not.toContain(alreadyListed("ExcelMale"));
    expect(gate({
      principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "ExcelMale", platform: "forum" }],
      community_searches: [read("MESO-Rx", "https://forum.example.org/t/hgh-results/123", "forum"),
        read("ExcelMale", "https://forum.example.org/t/hgh-results/124", "forum")]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).not.toContain(alreadyListed("ExcelMale"));
    const topic = (id: number) => `https://forum.example.org/viewtopic.php?t=${id}`;
    expect(gate({
      principal_communities: [{ name: "MESO-Rx", platform: "forum" }, { name: "ExcelMale", platform: "forum" }],
      community_searches: [read("MESO-Rx", topic(1), "forum"), read("ExcelMale", topic(2), "forum")]
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).not.toContain(alreadyListed("ExcelMale"));

    // The permit counts every community searched outside YouTube once, a boundary included.
    const facebook = { name: "TRT Facebook group", platform: "facebook" };
    const counted = gate({
      principal_communities: [...subreddits, facebook],
      community_searches: [
        read("r/trt", trtThread), read("r/trt", trtThread.replace("xyz789", "uvw456")),
        {
          community: "TRT Facebook group", platform: "facebook", queries: ["hgh trt"], access_boundary: "login_required",
          url: "https://www.facebook.com/groups/trtmen"
        }
      ],
      answer_draft: `${sections.replace(/\n\nOn \[r\/Testosterone\][\s\S]*$/u, "")}\n\nReports from this community ` +
        "come from my own web search, which AskRigor could not verify. Community: r/trt. A community that needs a " +
        "login to read: TRT Facebook group. Reports there are not included."
    });
    expect(counted.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(verifyResearchReceipt(counted.finalization_receipt!, options))
      .toMatchObject({ ok: true, claims: { unverified: "2" } });
  });

  it("checks each cited Reddit thread with Reddit itself", () => {
    const base = {
      research_depth: "deep",
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }],
      principal_communities: [{ name: "r/trt", platform: "reddit" }, { name: "r/Testosterone", platform: "reddit" }]
    };
    const findings = {
      benefit_reports: "Most reported better recovery.",
      no_effect_reports: "Some saw no difference.",
      adverse_reports: "A few reported joint pain.",
      effect_on_answer: "Consistent with the trials."
    };
    const trtThread = "https://old.reddit.com/r/trt/comments/xyz789/hgh_and_trt_five_years/";
    const testosteroneThread = "https://www.reddit.com/r/Testosterone/comments/def456/ten_years_on_trt/";
    // The sentence of the draft below that reports each subreddit, quoted for all four findings.
    const quotesOf = (sentence: string) => ({
      benefit_reports: sentence, no_effect_reports: sentence, adverse_reports: sentence, effect_on_answer: sentence
    });
    const searches = (trtTitle?: string) => [
      { community: "r/trt", platform: "reddit", queries: ["hgh vs trt"], ...findings,
        report_identity: [{ ...REDDIT_SEARCH.report_identity[0]!, exposure: "growth hormone" }],
        answer_quotes: quotesOf("most reported better recovery; some saw no difference"),
        threads_read: [{ url: trtThread, ...(trtTitle === undefined ? {} : { title: trtTitle }) }],
        thread_selection: "all_found" },
      { community: "r/Testosterone", platform: "reddit", queries: ["hgh vs trt"], ...findings,
        report_identity: [{ ...REDDIT_SEARCH.report_identity[0]!, exposure: "testosterone" }],
        answer_quotes: quotesOf("most reported better recovery too"), threads_read: [{ url: testosteroneThread }],
        thread_selection: "all_found" }
    ];
    const found = (subreddit: string, title: string) => ({ state: "found" as const, subreddit, title });
    const reddit = (trt: RedditThreadCheck) => new Map<string, RedditThreadCheck>([
      ["xyz789", trt], ["def456", found("testosterone", "Ten years on TRT")]
    ]);
    const gate = (trt: RedditThreadCheck, trtTitle?: string, draft?: string) => finalizeResearchBare({
      lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
      full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates Reddit thread verification." },
      ...base, commercial_review_applicability: NONCOMMERCIAL_EXERCISE,
      intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient product is involved." },
      community_findings: findingsFor(["aaaaaaaaaaa"]), community_searches: searches(trtTitle),
      ...(draft === undefined ? {} : { answer_draft: draft, absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [] })
    }, { ...options, redditThreads: reddit(trt) });

    // Both confirmed: the answer says Reddit confirmed the threads, not their content.
    const confirmed = gate(found("trt", "HGH and TRT: five years in"), "hgh and trt - five years in : r/trt");
    const confirmedCaveat = "Reddit confirms that the threads linked here from these subreddits exist, but what they " +
      "report is my own reading, which AskRigor could not verify. Subreddits: r/trt; r/Testosterone.";
    expect(confirmed.caveats).toContain(confirmedCaveat);
    expect(confirmed.caveats.join(" ")).not.toContain("come from my own web search");
    const draft = `${CLEAN_DRAFT.replace(/\n\nOn Reddit, [\s\S]*$/u, "")}\n\nOn [r/trt](${trtThread}), most reported better ` +
      "recovery; some saw no difference and a few reported side effects, consistent with the trials.\n\nOn " +
      `[r/Testosterone](${testosteroneThread}), most reported better recovery too; some saw no difference and a few ` +
      `reported side effects, consistent with the trials.\n\n${confirmedCaveat}`;
    expect(gate(found("trt", "HGH and TRT: five years in"), "HGH and TRT: five years in", draft).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);

    // A thread Reddit does not have, one it files elsewhere, or one under another title goes back.
    expect(gate({ state: "not_found" }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      `community_searches for r/trt lists thread(s) Reddit does not have (${trtThread}): list only threads you read, ` +
        "by the links you read them at."
    );
    expect(gate(found("evolutionreddit", "Facebook backs away")).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      `community_searches for r/trt lists thread(s) that Reddit files under another subreddit (${trtThread}): list ` +
        "each thread under its own subreddit's entry."
    );
    // A title other than Reddit's gets Reddit's own back, in any language: only case, spacing, punctuation and a
    // subreddit or "Reddit" tag are set aside, and no rewording is judged.
    const retitled = (reddit: string) => `community_searches for r/trt gives thread title(s) that differ from ` +
      `Reddit's (${trtThread} is "${reddit}" on Reddit): check that each link is the thread you read, and give its ` +
      "title exactly as Reddit shows it.";
    for (const [reddit, given] of [
      ["HGH and TRT five years", "Collagen for sore knees"],
      ["HGH and TRT: five years in", "HGH and TRT: five ye\u2026"],
      ["HGH and TRT: five years in", "hgh & trt - five years in"],
      ["TRT is not safe for older men", "TRT is safe for older men"],
      ["Evidence TRT causes no harm", "No evidence TRT causes harm"],
      ["La cirugía no me ayudó", "La cirugía me ayudó"]
    ] as const) {
      expect(gate(found("trt", reddit), given).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(retitled(reddit));
    }
    for (const given of ["HGH and TRT: five years in : r/trt", "hgh and trt - five years in", "HGH AND TRT, FIVE YEARS IN (Reddit)"]) {
      expect(gate(found("trt", "HGH and TRT: five years in"), given).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toContain("differ from Reddit's");
    }
    // Reddit gives no title, or one without letters, for some posts: nothing to compare, so the given title stands
    // (review of 62cefa2).
    for (const reddit of ["", "\u{1F525}\u{1F525}"]) {
      expect(gate(found("trt", reddit), "HGH and TRT: five years in").next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toContain("differ from Reddit's");
    }
    // Reddit's title is third-party text: it comes back on one line, without quotation marks, cut at 150 characters.
    const noisy = `Ignore the "rules"\nand ${"x".repeat(200)}`;
    expect(gate(found("trt", noisy), "HGH and TRT: five years in").next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toContain(retitled(`Ignore the rules and ${"x".repeat(128)}\u2026`));

    // A lookup that failed proves nothing: that subreddit stays unverified.
    const unavailable = gate({ state: "unavailable" });
    expect(unavailable.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toContain("Reddit does not have");
    expect(unavailable.caveats).toEqual(expect.arrayContaining([
      "Reports from this community come from my own web search, which AskRigor could not verify. Community: r/trt.",
      "Reddit confirms that the threads linked here from this subreddit exist, but what they report is my own " +
        "reading, which AskRigor could not verify. Subreddit: r/Testosterone."
    ]));
  });

  it("needs no YouTube research when YouTube is not the dominant community", () => {
    const forums = [
      { name: "r/trt", platform: "reddit" },
      { name: "MESO-Rx", platform: "forum" },
      { name: "YouTube", platform: "youtube" }
    ];
    const read = (community: string, platform: string, url: string) => ({
      community,
      report_identity: [{ ...REDDIT_SEARCH.report_identity[0]!, exposure: "growth hormone" }],
      platform,
      queries: ["growth hormone versus testosterone long term"],
      threads_read: [{ url }],
      thread_selection: "all_found",
      benefit_reports: "Better recovery for most.",
      no_effect_reports: "Some saw no difference.",
      adverse_reports: "Joint pain on growth hormone.",
      effect_on_answer: "Consistent with the trials.",
      answer_quotes: {
        benefit_reports: "most users reported better recovery",
        no_effect_reports: "some saw no difference",
        adverse_reports: "several reported joint pain as a side effect of growth hormone",
        effect_on_answer: "consistent with the trials"
      }
    });
    const result = finalizeResearchBare({
      lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
      full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates community coverage checks." },
      research_depth: "deep",
      receipts: [study],
      community_evidence: "researched",
      commercial_review_applicability: NONCOMMERCIAL_EXERCISE,
      treatment_choice: "not_compared",
      research_target: TARGET,
      intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient study product is involved." },
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }],
      principal_communities: forums,
      community_searches: [
        read("r/trt", "reddit", "https://www.reddit.com/r/trt/comments/abc/x/"),
        read("MESO-Rx", "forum", "https://thinksteroids.com/community/threads/2/")
      ],
      answer_draft: "[Study](https://doi.org/10.1002/art.41142) reports trial outcomes. Trials favour testosterone. On [r/trt](https://www.reddit.com/r/trt/comments/abc/x/) and " +
        "[MESO-Rx](https://thinksteroids.com/community/threads/2/), most users reported better recovery, some saw no " +
        "difference, and several reported joint pain as a side effect of growth hormone, consistent with the trials. " +
        "Reports from these communities come from my own web search, which AskRigor could not verify. Communities: " +
        "r/trt; MESO-Rx.",
      absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: []
    }, options);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.community.communities_searched).toEqual(["r/trt", "MESO-Rx"]);
  });

  it("takes a review site's reviews with their counts and selection, and says what a partial set can show", () => {
    // HRP ReviewCorpusSelectionAndCounts (owner question 30): reviews the site ranks first show which experiences
    // exist, not how common each is, so the answer says so; a frame not chosen by outcome needs no such caveat.
    const reviewsPage = "https://www.amazon.com/product-reviews/B0EXAMPLE1/";
    const forumThread = "https://adhd-parents.example/threads/41/";
    const amazon = (corpora?: unknown) => ({
      community: "Amazon",
      platform: "review_site",
      queries: ["humic acid drops ADHD"],
      threads_read: [{ url: reviewsPage }],
      ...(corpora === undefined ? {} : { review_corpora: corpora }),
      benefit_reports: "Several parents saw calmer evenings.",
      no_effect_reports: "Some saw no difference.",
      adverse_reports: "Two reported stomach upset.",
      effect_on_answer: "Shows the range of experiences only.",
      answer_quotes: {
        benefit_reports: "several parents saw calmer evenings",
        no_effect_reports: "some saw no difference",
        adverse_reports: "two reported stomach upset",
        effect_on_answer: "these show the range of experiences only"
      }
    });
    const forum = {
      community: "ADHD Parents Forum",
      report_identity: [{ ...REDDIT_SEARCH.report_identity[0]!, exposure: "humic acid" }],
      platform: "forum",
      queries: ["humic acid ADHD"],
      threads_read: [{ url: forumThread }],
      thread_selection: "all_found",
      benefit_reports: "One parent saw better sleep.",
      no_effect_reports: "Most saw no change.",
      adverse_reports: "None reported.",
      effect_on_answer: "Adds little.",
      answer_quotes: {
        benefit_reports: "one parent saw better sleep",
        no_effect_reports: "most saw no change",
        adverse_reports: "none reported side effects",
        effect_on_answer: "which adds little"
      }
    };
    const request = (corpora?: unknown, searches?: unknown[]) => ({
      lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
      full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates review corpus checks." },
      intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient study product is involved." },
      shopping: { status: "not_requested" },
      research_depth: "deep",
      receipts: [study],
      community_evidence: "researched",
      commercial_review_applicability: { status: "required", products: ["Humic Drops 2 oz"] },
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }],
      principal_communities: [
        { name: "Amazon", platform: "review_site" },
        { name: "ADHD Parents Forum", platform: "forum" }
      ],
      community_searches: searches ?? [amazon(corpora), forum],
      absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: []
    });
    const lanes = `[Study](https://doi.org/10.1002/art.41142) reports study outcomes.\n\nIn [the drops' reviews on Amazon](${reviewsPage}), several parents saw calmer evenings, some saw ` +
      "no difference, and two reported stomach upset; these show the range of experiences only. On the " +
      `[ADHD Parents Forum](${forumThread}), one parent saw better sleep, most saw no change, and none reported side ` +
      "effects, which adds little.";
    const product = "Humic Drops 2 oz";
    const topRanked = [{ outcome_search: { queries: ["humic acid ADHD outcomes"], directions: ["benefit", "no_effect", "worse"] }, product, reviews_shown: 2400, reviews_read: 8, item_identity: { exact_product: 8, variant_unresolved: 0, other_variant_excluded: 0 }, selection: "top_ranked" }];
    const first = finalizeResearchBare({ intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient product is involved." }, ...request(topRanked), answer_draft: lanes }, options);
    expect(first.limits).toContain(
      `The 8 Amazon review(s) of ${product} you read (of 2400 shown) were the ones the site ranks first; say they ` +
        "show which experiences people report, not how common each is."
    );
    const partialCaveat = "The reviews I read on this site were the ones the site ranks first, so they show which " +
      `experiences people report, not how common each one is. Product: ${product}. Site: Amazon.`;
    expect(first.caveats).toContain(partialCaveat);
    const ready = finalizeResearchBare({ intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient product is involved." }, ...request(topRanked), answer_draft: `${lanes} ${first.caveats.join(" ")}` }, options);
    expect(ready.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(ready.status).toBe("ready_with_limits");
    expect(ready.community.communities_searched).toEqual(["Amazon", "ADHD Parents Forum"]);
    // The answer must carry the caveat, as it must every caveat the gate writes.
    const dropped = finalizeResearchBare({
      ...request(topRanked),
      answer_draft: `${lanes} ${first.caveats.filter((sentence) => sentence !== partialCaveat).join(" ")}`
    }, options);
    expect(dropped.status).toBe("not_ready");

    // Every review mentioning the condition is a frame not chosen by outcome.
    const mentions = finalizeResearchBare({
      ...request([{ outcome_search: { queries: ["humic acid ADHD outcomes"], directions: ["benefit", "no_effect", "worse"] }, product, reviews_shown: 2400, reviews_read: 31, selection: "condition_mentions" }]),
      answer_draft: lanes
    }, options);
    expect(mentions.caveats.filter((sentence) => sentence.includes("how common each one is"))).toEqual([]);

    // Missing, misplaced or impossible counts go back to the model.
    expect(finalizeResearchBare(request(), options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for Amazon lists reviews read on a review site: give review_corpora, with each product, how " +
        "many reviews the site shows, how many you read and how you chose them."
    );
    const miscounted = "community_searches for Amazon gives review counts that do not fit (Humic Drops 2 oz): " +
      "reviews_read cannot exceed reviews_shown, and selection all means every review shown was read.";
    expect(finalizeResearchBare(request([{ outcome_search: { queries: ["humic acid ADHD outcomes"], directions: ["benefit", "no_effect", "worse"] }, product, reviews_shown: 5, reviews_read: 8, item_identity: { exact_product: 8, variant_unresolved: 0, other_variant_excluded: 0 }, selection: "top_ranked" }]), options)
      .next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(miscounted);
    expect(finalizeResearchBare(request([{ outcome_search: { queries: ["humic acid ADHD outcomes"], directions: ["benefit", "no_effect", "worse"] }, product, reviews_shown: 2400, reviews_read: 8, item_identity: { exact_product: 8, variant_unresolved: 0, other_variant_excluded: 0 }, selection: "all" }]), options)
      .next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(miscounted);
    expect(finalizeResearchBare(request(undefined, [amazon(topRanked), { ...forum, review_corpora: topRanked }]), options)
      .next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "community_searches for ADHD Parents Forum gives review_corpora, which are for review sites: record the site's " +
        "product reviews under platform review_site, or leave review_corpora out."
    );
  });

  it("finds the protocols' own names in the answer, acronym runs included", async () => {
    const names = protocolNamesFrom([
      '<Rule name="COINotAutomaticDisqualification" priority="High"/><Rule name="NNTAndNNH"/><LimitsNote>' +
        '<Section id="Purpose"/><Check id="FS190"/></LimitsNote>'
    ]);
    // Single words and codes are not names an answer could leak.
    expect([...names].sort()).toEqual(["COINotAutomaticDisqualification", "LimitsNote", "NNTAndNNH"]);
    const hrp = await readFile(new URL("../protocols/HRP_Full.xml", import.meta.url), "utf8");
    const canonical = protocolNamesFrom([hrp]);
    for (const name of ["COINotAutomaticDisqualification", "NNTAndNNH", "DeepForumAuditActivationPrompt"]) {
      expect(canonical.has(name)).toBe(true);
    }

    const result = finalizeResearchRaw({
      research_depth: "deep",
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }],
      community_findings: findingsFor(["aaaaaaaaaaa"]),
      answer_draft: `${CLEAN_DRAFT} Under COINotAutomaticDisqualification the funded trial still counts, and ` +
        "NNTAndNNH puts the benefit at about 1 in 8."
    }, { ...options, protocolNames: canonical });
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "The answer shows internal labels (COINotAutomaticDisqualification, NNTAndNNH): say what each means in plain " +
        "words, or leave it out."
    ]);
  });

  it("reads the answer before it reports ready", () => {
    // Deep research, so the drafts below need no first-pass offer.
    const request = {
      research_depth: "deep" as const,
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched" as const,
      treatment_choice: "not_compared" as const,
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }],
      community_findings: findingsFor(["aaaaaaaaaaa"])
    };
    // Everything else passes, so the gate asks for the answer itself.
    const withoutDraft = finalizeResearchRaw(request, options);
    expect(withoutDraft).toMatchObject({ status: "not_ready", answer_checked: false });
    expect(withoutDraft.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Pass the answer you are about to give as answer_draft, exactly as the user will see it; the final check reads it."
    ]);
    expect(withoutDraft.finalization_receipt).toBeUndefined();

    // What the option A rerun's answer did: internal labels, a bare video ID,
    // the pasted forum prompt, and no word on the YouTube comments.
    const leaky = finalizeResearchRaw({
      ...request,
      answer_draft: "REQUIRED_NOW: see a physiotherapist. CONTINGENT_LATER: an injection. The comments on " +
        "aaaaaaaaaaa and Z8jn_6WMquo were api_visible_complete with a synthesis lock pass, so finalize_research " +
        "is ready. DeepForumAuditActivationPrompt: Check forums for collagen in adults with hip osteoarthritis. " +
        "Use a strict-core cohort and separately labeled adjacent cohorts. Self-Report scales from " +
        "GlaxoSmithKline trials. [Hip exercises](https://www.youtube.com/watch?v=bbbbbbbbbbb&list=my_list_1)"
    }, { ...options, protocolNames: new Set(["DeepForumAuditActivationPrompt", "LimitsNote"]) });
    const allFindings = ["benefit_reports", "no_effect_reports", "adverse_reports", "creators_versus_commenters",
      "effect_on_answer"];
    const unshown = (lane: string, findings: readonly string[]) => `For ${lane}, answer_quotes gives text the answer ` +
      `does not show (${findings.join(", ")}): report each finding in the answer, and copy the sentence(s) that ` +
      "report it exactly, from one paragraph or list item.";
    expect(leaky).toMatchObject({ status: "not_ready", answer_checked: true });
    expect(leaky.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "The answer shows internal labels (REQUIRED_NOW, CONTINGENT_LATER, api_visible_complete, finalize_research, " +
        "DeepForumAuditActivationPrompt, synthesis lock): say what each means in plain words, or leave it out.",
      "The answer names video(s) by bare ID (Z8jn_6WMquo, aaaaaaaaaaa): give each its linked title instead.",
      "The answer pastes the full deep forum-audit prompt. Say what the deeper research would focus on and how to " +
        "start it, and offer the full prompt instead (\"Show me the full deeper-research prompt and help me fine-tune it\").",
      unshown("the YouTube comments", allFindings),
      unshown("r/HipOA", ["benefit_reports", "no_effect_reports", "adverse_reports", "effect_on_answer"]),
      leftOut(FORUM_CAVEAT)
    ]);

    // For each finding the model copies the answer's sentences that report it, and the answer must show them;
    // whether they report it is the model's judgment, in whatever language it wrote them. Each draft also
    // reports the subreddit the defaults searched.
    const subreddit = "On Reddit, members of [r/HipOA](https://www.reddit.com/r/HipOA/comments/abc123/avoided_surgery/) " +
      "reported slow improvement from exercise; a few saw no change and none reported side effects, which is " +
      `consistent with the YouTube comments. ${FORUM_CAVEAT}`;
    const youtubeLane = "People commenting on YouTube videos about it reported less pain after several months; a few " +
      "noticed no change, and none reported side effects. The channels' creators sell programs; the commenters have " +
      "no stake. This weak firsthand signal supports trying exercise before surgery.";
    const lane = (answerDraft: string, findings: Record<string, unknown> = request.community_findings) =>
      finalizeResearchRaw({ ...request, community_findings: findings, answer_draft: `${subreddit}\n\n${answerDraft}` }, options)
        .next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
    expect(lane(youtubeLane)).toEqual([]);
    // Naming YouTube is not reporting what its commenters said.
    expect(lane("Exercise helps most people with hip osteoarthritis. I also searched YouTube."))
      .toEqual([unshown("the YouTube comments", allFindings)]);
    // Only the findings the answer does not show go back.
    expect(lane(youtubeLane.replace(" This weak firsthand signal supports trying exercise before surgery.", "")))
      .toEqual([unshown("the YouTube comments", ["effect_on_answer"])]);
    // Without quotes the gate asks for them.
    const { answer_quotes: _quotes, ...unquoted } = request.community_findings;
    expect(lane(youtubeLane, unquoted)).toEqual([
      "Give answer_quotes for the YouTube comments in community_findings: for each finding, the sentence(s) of the " +
        "answer that report it, copied from answer_draft. The answer must report what the YouTube comments showed, " +
        "even if the signal is weak."
    ]);
    // A quote is compared as a reader sees it: case, spacing, emphasis, quotation marks around it and its end mark
    // aside, with a link by its text or its target.
    expect(lane(youtubeLane.replace("The channels' creators sell", "The **channels\u2019 creators**\n  sell"))).toEqual([]);
    const linkedLane = youtubeLane.replace("YouTube videos about it", "[YouTube videos about it](https://www.youtube.com/watch?v=aaaaaaaaaaa)");
    for (const benefit of [
      "People commenting on [YouTube videos about it](https://www.youtube.com/watch?v=aaaaaaaaaaa) reported less pain",
      "People commenting on [videos](https://www.youtube.com/watch?v=aaaaaaaaaaa) reported less pain",
      "People commenting on YouTube videos about it reported less pain"
    ]) {
      expect(lane(linkedLane, { ...request.community_findings, answer_quotes: { ...YOUTUBE_QUOTES, benefit_reports: benefit } }))
        .toEqual([]);
    }
    // Only what the reader sees shows a quote: not an HTML comment (Codex's case), an image description, a tag's
    // attribute, code, or a link's destination, title or reference label.
    for (const hiding of [
      `<!-- ${youtubeLane} -->`,
      `![${youtubeLane}](https://example.com/chart.png)`,
      `<span title="${youtubeLane}">Details</span>`,
      `\n\n\`\`\`\n${youtubeLane}\n\`\`\`\n`,
      `[details](https://example.com "${youtubeLane}")`,
      "[details](/helped/This-weak-firsthand-signal-supports-trying-exercise-before-surgery)",
      "[details][This weak firsthand signal supports trying exercise before surgery]"
    ]) {
      expect(lane(`Exercise helps most people with hip osteoarthritis.\n\n## YouTube comments\n\n${hiding}`))
        .toEqual([unshown("the YouTube comments", allFindings)]);
    }
    expect(lane(`Exercise helps most people with hip osteoarthritis.\n\n## YouTube comments\n\n- ${youtubeLane}`)).toEqual([]);

    // Links keep their IDs and underscores; a short command is fine.
    const clean = finalizeResearchRaw({
      ...request,
      answer_draft: `${CLEAN_DRAFT} See [Hip exercises that helped me](https://www.youtube.com/watch?v=aaaaaaaaaaa). ` +
        "To go deeper, reply: Check forums for collagen in adults with hip osteoarthritis, focusing on dose and pain."
    }, options);
    expect(clean).toMatchObject({ status: "ready_with_limits", next_steps: [], answer_checked: true });
  });

  it("reads an answer in any language: the model's own sentences for each lane, and each caveat in its language", () => {
    // A Spanish answer: the model quotes its own sentences for each finding and gives each caveat as the answer
    // states it. The gate checks that the answer shows them, as sentences of their own with the caveats' links;
    // whether they say what the findings and caveats say is the model's to answer for.
    const leadCaveat = "The full text of [this study](https://doi.org/10.1016/j.joca.2020.01.001) was not openly " +
      "available, so its methods were not checked.";
    const spanish = new Map([
      [FORUM_CAVEAT, "Los relatos de r/HipOA vienen de mi propia búsqueda web, que AskRigor no pudo verificar."],
      [leadCaveat, "El texto completo de [este estudio](https://doi.org/10.1016/j.joca.2020.01.001) no estaba " +
        "disponible en abierto, así que no se revisaron sus métodos."],
      [OFFER_CAVEATS[0]!, "Enfoque de estudios: ensayos más largos. Los ensayos leídos duraron doce semanas."],
      [OFFER_CAVEATS[1]!, "Enfoque de estudios: resultados en mayores de 70 años. Pocos participantes tenían esa edad."],
      [OFFER_CAVEATS[2]!, "Enfoque comunitario: programas de caminata con nombre. Se nombraron varios, pero ninguno " +
        "se examinó a fondo."],
      [OFFER_CAVEATS[3]!, "Enfoque comunitario: quienes lo dejaron. Pocos explicaron por qué."],
      [OFFER_CAVEATS[4]!, "Otra pasada llevaría unos 20 minutos y 15 búsquedas en YouTube. ¿Quieres profundizar en " +
        "los estudios o en las comunidades, y qué enfoque te importa más?"]
    ]);
    const lanes = "El ejercicio tiene la mejor evidencia para la artrosis de cadera. Quienes comentaron videos de " +
      "YouTube sobre el tema dijeron tener menos dolor tras varios meses; unos pocos no notaron cambios y nadie " +
      "mencionó efectos secundarios. Los creadores de los canales venden programas; quienes comentan no ganan nada " +
      "con ello. Esta señal débil apoya probar el ejercicio antes de la cirugía.\n\nEn " +
      "[r/HipOA](https://www.reddit.com/r/HipOA/comments/abc123/avoided_surgery/), varios miembros contaron una " +
      "mejora lenta con el ejercicio; unos pocos no vieron cambios y nadie reportó efectos secundarios, lo que " +
      "concuerda con los comentarios de YouTube.";
    const draft = `${lanes}\n\n${[...spanish.values()].join(" ")}`;
    const request = {
      receipts: [survey, emptySearch, repeatScout, videoA, study, lead],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "lead_only" }
      ],
      another_pass_estimate: PASS_ESTIMATE,
      community_findings: {
        ...findingsFor(["aaaaaaaaaaa"]),
        answer_quotes: {
          benefit_reports: "Quienes comentaron videos de YouTube sobre el tema dijeron tener menos dolor tras varios meses",
          no_effect_reports: "unos pocos no notaron cambios",
          adverse_reports: "nadie mencionó efectos secundarios",
          creators_versus_commenters: "«Los creadores de los canales venden programas; quienes comentan no ganan nada " +
            "con ello.»",
          effect_on_answer: "Esta señal débil apoya probar el ejercicio antes de la cirugía."
        }
      },
      community_searches: [{
        ...REDDIT_SEARCH,
        answer_quotes: {
          benefit_reports: "varios miembros contaron una mejora lenta con el ejercicio",
          no_effect_reports: "unos pocos no vieron cambios",
          adverse_reports: "nadie reportó efectos secundarios",
          effect_on_answer: "lo que concuerda con los comentarios de YouTube"
        }
      }],
      answer_draft: draft,
      answer_language: "es",
      caveat_renderings: [...spanish].map(([caveat, text]) => ({ caveat, text }))
    };
    const check = (input: Record<string, unknown>) => finalizeResearchRaw({ ...request, ...input }, options);
    const result = check({});
    expect(result.caveats).toEqual([FORUM_CAVEAT, leadCaveat, ...OFFER_CAVEATS]);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    // A link's text may change in a rendering too.
    expect(check({ answer_draft: draft.replace("[este estudio](", "[el estudio de 2020](") }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);

    // Accents written as one character or as a letter and a combining mark compare alike.
    const decomposed = "Esta sen\u0303al de\u0301bil apoya probar el ejercicio antes de la cirugi\u0301a.";
    expect(check({
      community_findings: {
        ...request.community_findings,
        answer_quotes: { ...request.community_findings.answer_quotes, effect_on_answer: decomposed }
      }
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);

    // Renderings count only for an answer declared in another language: an English one states each caveat as written.
    const englishOnly = "caveat_renderings counts only for an answer not in English: give answer_language (such as fr " +
      "or es), or state each caveat as written.";
    const allLeftOut = leftOut(FORUM_CAVEAT, leadCaveat, ...OFFER_CAVEATS);
    expect(check({ answer_language: undefined }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([englishOnly, allLeftOut]);
    expect(check({ answer_language: "en-GB" }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([englishOnly, allLeftOut]);
    // A rendering stands as a sentence of its own, as a caveat does: embedded, it is not stated.
    const forum = spanish.get(FORUM_CAVEAT)!;
    expect(check({ answer_draft: draft.replace(forum, `No es cierto que l${forum.slice(1)}`) }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([leftOut(FORUM_CAVEAT)]);
    // It keeps the caveat's links.
    const unlinked = (text: string) => text.replace("[este estudio](https://doi.org/10.1016/j.joca.2020.01.001)", "este estudio");
    expect(check({
      answer_draft: unlinked(draft),
      caveat_renderings: request.caveat_renderings.map(({ caveat, text }) => ({ caveat, text: unlinked(text) }))
    }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([`caveat_renderings drops the link(s) of this caveat; keep each link: "${leadCaveat}"`]);
    // A rendering with no letter or digit states nothing, and the check still ends (review of d71db54: an
    // empty rendering never ended the search, and one of marks alone matched any sentence end).
    for (const text of [".", "**", "___", "\u3002"]) {
      for (const answer of ["Une r\u00E9ponse sans point final", "Une r\u00E9ponse qui finit par un point."]) {
        expect(finalizeResearchRaw({
          research_depth: "deep", receipts: [], community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
          not_relevant_reason: "A lab value.",
          treatment_choice: "not_compared", research_target: TARGET, key_sources: [], answer_draft: answer,
          answer_language: "fr", caveat_renderings: [{ caveat: "No study's methods were checked in full text for this answer.", text }]
        }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([leftOut("No study's methods were checked in full text for this answer.")]);
      }
    }
    // Quotes are the answer's own words, in its language, and must be in it.
    expect(check({ answer_draft: draft.replace("nadie mencionó efectos secundarios", "nadie habló de daños") }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([
        "For the YouTube comments, answer_quotes gives text the answer does not show (adverse_reports): report each " +
          "finding in the answer, and copy the sentence(s) that report it exactly, from one paragraph or list item."
      ]);

    // Scripts that end sentences with 。 or ؟ need no space after them.
    const deep = {
      research_depth: "deep",
      receipts: [study, lead],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "A question about a lab value, which firsthand reports cannot answer.",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: request.key_sources
    };
    const japanese = "[この研究](https://doi.org/10.1016/j.joca.2020.01.001)の全文は公開されていなかったため、その方法は確認できませんでした。";
    const inJapanese = (answer: string) => finalizeResearchRaw({
      ...deep, answer_draft: answer, answer_language: "ja", caveat_renderings: [{ caveat: leadCaveat, text: japanese }]
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
    expect(inJapanese(`運動療法の効果は複数の試験で確認されています。${japanese}詳しくは主治医に相談してください。`)).toEqual([]);
    expect(inJapanese(`専門家によれば、${japanese}`)).toEqual([leftOut(leadCaveat)]);
    const arabic = "لم يكن النص الكامل لـ[هذه الدراسة](https://doi.org/10.1016/j.joca.2020.01.001) متاحًا، لذلك لم تُفحص طرقها.";
    expect(finalizeResearchRaw({
      ...deep, answer_language: "ar", caveat_renderings: [{ caveat: leadCaveat, text: arabic }],
      answer_draft: `هل التمارين مفيدة؟${arabic}`
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
  });

  it("bounds what the searches did not find and grounds a null result in audited studies (the geosmin report)", () => {
    // Owner report, 2026-09-30: "I found no evidence that 'smelling humic acid' treats neuroinflammation" left open
    // whether nothing was searched well, nothing was found, or studies found no effect. The model names each such
    // sentence with its state; the gate checks the rest.
    const pubmedSearch = sign("literature_search", { src: "pubmed", q: "p1p1p1p1p1p1", ret: 3, n: 3 }, options);
    const europePmcSearch = sign("literature_search", { src: "europepmc", q: "e1e1e1e1e1e1", ret: 2, n: 2 }, options);
    const base = {
      research_depth: "deep", community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "Isolates the absence checks.", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    };
    const notFound = "I did not locate a study of inhaled humic acid for neuroinflammation.";
    const answer = `Purified geosmin changed EEG readings in one small study. ${notFound}`;
    const check = (input: Record<string, unknown>) => finalizeResearchRaw({
      ...base, receipts: [pubmedSearch, europePmcSearch, study], answer_draft: answer,
      absence_claims: [{ quote: notFound, state: "support_not_located" }], ...input
    }, options);
    // Not located: the answer bounds it to the searches made, naming what they did not cover.
    const bounded = "Where this answer says something was not found, it means the searches made here (PubMed and Europe " +
      "PMC) did not find it, and they did not cover older or variant terms, citation chains and grey literature; that " +
      "is not evidence that it does not exist.";
    // The first caveat is the community search skipped for no real-world outcome (owner question 125).
    const skip = communitySkipCaveat(base.not_relevant_reason);
    expect(check({}).caveats).toEqual([skip, bounded]);
    expect(check({}).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([leftOut(bounded)]);
    expect(check({ answer_draft: `${answer} ${bounded}` })).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    const covered = "Where this answer says something was not found, it means the searches made here (PubMed and Europe " +
      "PMC) did not find it; that is not evidence that it does not exist.";
    expect(check({ search_coverage: ["historical_terms", "citation_chains", "grey_literature"] }).caveats).toEqual([skip, covered]);
    expect(check({ receipts: [study] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "The answer says something was not found, but no literature search receipt was passed: search with " +
        "search_pubmed or search_europe_pmc (and search_clinical_trials for trials) and pass their research receipts."
    );
    // The answer must say which it is: an absence it does not declare cannot be checked.
    expect(check({ absence_claims: undefined }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(
      "absence_claims is missing: it lists each sentence saying something was not found, not studied, has no " +
        "evidence or has no effect; that an option made no difference compared with another, worked as well as it, " +
        "or did no better or no worse than it; or calling an intervention's evidence unconvincing, weak, not " +
        "demonstrated or showing no benefit (an empty list means none). Evidence-strength sentences are absence " +
        "claims, declared with not_established and their key sources when studies were found, or support_not_located " +
        "with search coverage when none were."
    );
    expect(check({ absence_claims: [{ quote: "There is no evidence at all.", state: "support_not_located" }] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toContain("absence_claims[0] gives text the answer does not show: copy each sentence exactly from answer_draft.");
    // A null result or an exclusion rests on studies whose methods were audited, and gives its numbers.
    const nullResult = "The trial found no difference in pain (mean difference 0.1 points, 95% CI -0.4 to 0.6).";
    const withNull = (claim: Record<string, unknown>, text = nullResult) =>
      check({ answer_draft: `${answer} ${bounded} ${text}`, absence_claims: [
        { quote: notFound, state: "support_not_located" }, { quote: text, state: "direct_null_evidence", ...claim }
      ] }).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
    expect(withNull({ studies: ["10.1002/art.41142"] })).toEqual([]);
    expect(withNull({ studies: ["PMC10518852"] })).toEqual([]);
    expect(withNull({})).toEqual([
      "absence_claims[1] states a direct null result without the studies it rests on: " +
        "name them in studies, each read with a full-text method audit, or state it as support_not_located."
    ]);
    expect(withNull({ studies: ["10.1016/j.joca.2020.01.001"] })).toEqual([
      "absence_claims[1] states a direct null result on 10.1016/j.joca.2020.01.001, " +
        "which no full-text method audit here covers: an abstract or a lead cannot show a null result. Audit each, or " +
        "state it as support_not_located."
    ]);
    const vague = "The trial found no effect on pain.";
    expect(withNull({ studies: ["10.1002/art.41142"] }, vague)).toEqual([
      "absence_claims[1] states a direct null result: give the estimate and its interval in that sentence, " +
        "so a reader sees how large an effect the studies could have missed."
    ]);
  });

  it("accepts a Gemini scout round as community discovery without a YouTube survey", () => {
    const result = finalizeResearch({
      receipts: [repeatScout, videoB, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      material_video_ids: ["bbbbbbbbbbb"],
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    }, options);
    const steps = result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ");
    expect(steps).not.toMatch(/Find community videos/u);
    expect(steps).not.toMatch(/Survey community evidence/u);
  });

  it("is not ready when community research or a material video audit is missing", () => {
    const noSurvey = finalizeResearch({
      receipts: [study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(noSurvey.status).toBe("not_ready");
    expect(noSurvey.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toMatch(/scout_gemini_youtube_candidates .*survey_youtube_community only if the scout is unavailable.*rediscovery_leads/u);
    expect(noSurvey.finalization_receipt).toBeUndefined();

    const missingVideo = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      material_video_ids: ["aaaaaaaaaaa", "ccccccccccc"],
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(missingVideo.status).toBe("not_ready");
    expect(missingVideo.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
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
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const communityOnly = finalizeResearch({
      ...request,
      receipts: [communityAudit, emptySearch, repeatScout, study]
    }, options);
    expect(communityOnly.status).toBe("not_ready");
    expect(communityOnly.community).toMatchObject({ surveys: 1, discovery_rounds: 3, audited_videos: [] });
    expect(communityOnly.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Video aaaaaaaaaaa has only a one-call community audit. Audit video aaaaaaaaaaa with " +
        "audit_youtube_video_community and continue until the audit completes."
    ]);

    // The video's own audit satisfies it.
    const audited = finalizeResearch({
      ...request,
      receipts: [communityAudit, emptySearch, repeatScout, videoA, study]
    }, options);
    expect(audited.status).toBe("ready_with_limits");
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
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const silent = finalizeResearchGate(request, options);
    expect(silent.status).toBe("not_ready");
    expect(silent.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Say what the comments you read showed: give community_findings (benefit, no-effect and adverse reports, " +
        "creators versus independent commenters, and the effect on the answer), even if the signal is weak or neutral."
    ]);
    // Only the subreddit's lane: the YouTube findings are still missing.
    expect(silent.must_report).toEqual([FORUM_REPORT_LINE, expect.stringMatching(/^r\/HipOA \(1 thread\(s\) read\): /u)]);

    const partial = finalizeResearchGate({
      ...request,
      community_findings: findingsFor(["aaaaaaaaaaa", "ccccccccccc", "ddddddddddd"])
    }, options);
    expect(partial.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
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
      /^YouTube comments \(3 video\(s\) read\): Benefits: Two commenters reported deeper sleep\. .*Effect on the answer: Adds no strong independent signal; the answer rests on the studies\. Report this lane in the answer even if later sources dominate; if its signal is weak, say so\. Then copy the sentences that report it into community_findings\.answer_quotes\.$/u
    ), FORUM_REPORT_LINE, expect.stringMatching(/^r\/HipOA \(1 thread\(s\) read\): /u)]);
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
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const receipts = [survey, emptySearch, repeatScout, videoA, disabled, study];
    const onlyRead = finalizeResearchGate({
      ...request, receipts, community_findings: findingsFor(["aaaaaaaaaaa"])
    }, options);
    expect(onlyRead.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(onlyRead.must_report).toEqual([
      expect.stringMatching(/^YouTube comments \(1 video\(s\) read\): /u),
      FORUM_REPORT_LINE,
      expect.stringMatching(/^r\/HipOA \(1 thread\(s\) read\): /u)
    ]);
    // Listing the disabled video is allowed, and it is not counted as read.
    const both = finalizeResearchGate({
      ...request, receipts, community_findings: findingsFor(["aaaaaaaaaaa", "bbbbbbbbbbb"])
    }, options);
    expect(both.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(both.must_report).toEqual([
      expect.stringMatching(/^YouTube comments \(1 video\(s\) read\): /u),
      FORUM_REPORT_LINE,
      expect.stringMatching(/^r\/HipOA \(1 thread\(s\) read\): /u)
    ]);

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
    expect(finalizeResearchGate(oneCallRequest, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Say what the comments you read showed: give community_findings (benefit, no-effect and adverse reports, " +
        "creators versus independent commenters, and the effect on the answer), even if the signal is weak or neutral."
    ]);
    const covered = finalizeResearchGate({ ...oneCallRequest, community_findings: findingsFor(["ddddddddddd"]) }, options);
    expect(covered.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(covered.must_report).toHaveLength(3);
    expect(covered.must_report).toContain(FORUM_REPORT_LINE);

    // Findings cover the comments the audit's final view returned: a comment
    // too large for any view was retrieved but never shown.
    const unshown = sign("youtube_video_audit", {
      video: "bbbbbbbbbbb", state: "api_visible_complete", lock: "pass", records: 1, shown: 0
    }, options);
    expect(finalizeResearchGate({
      ...request, receipts: [survey, emptySearch, repeatScout, videoA, unshown, study],
      community_findings: findingsFor(["aaaaaaaaaaa"])
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    const shownOne = sign("youtube_video_audit", {
      video: "bbbbbbbbbbb", state: "api_visible_complete", lock: "pass", records: 1, shown: 1
    }, options);
    expect(finalizeResearchGate({
      ...request, receipts: [survey, emptySearch, repeatScout, videoA, shownOne, study],
      community_findings: findingsFor(["aaaaaaaaaaa"])
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Add bbbbbbbbbbb to community_findings.videos_reviewed: their comments were read, so the findings must account for them."
    ]);

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
      expect(reread.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
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
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1000/unattempted", status: "lead_only", reason: "paywalled" }
      ]
    }, options);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toHaveLength(2);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)[0]).toMatch(/^For 10\.1002\/art\.41142: acquire_open_full_text/u);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)[1]).toMatch(/^Try acquire_open_full_text for 10\.1000\/unattempted/u);
  });

  // The caveat says what stopped the reading: a public copy read only in part
  // was not unavailable (the 2026-10-15 owner regressions).
  const LEAD_LINK = "[this study](https://doi.org/10.1016/j.joca.2020.01.001)";
  it.each([
    ["NO_COPY_FOUND_AFTER_EXPANDED_SEARCH", "no public full text was found after an exact search",
      `The full text of ${LEAD_LINK} was not openly available, so its methods were not checked.`],
    ["PAYWALL_OR_LOGIN_REQUIRED", "its full text needs a login or a subscription",
      `The full text of ${LEAD_LINK} was not openly available, so its methods were not checked.`],
    ["CANDIDATE_FOUND_FETCH_BLOCKED", "a possible public copy was found, but AskRigor could not fetch it to check it",
      `A public copy of ${LEAD_LINK} was found, but AskRigor could not fetch it, so its methods were not checked.`],
    ["ABSTRACT_ONLY", "only its abstract was readable",
      `Only the abstract of ${LEAD_LINK} was readable, so its methods were not checked.`],
    ["PARTIAL_TEXT_READABLE", "only part of its text was readable",
      `AskRigor could read only part of ${LEAD_LINK}, so its methods were not checked.`],
    ["IDENTITY_MISMATCH", "no copy found could be verified as the same paper",
      `No copy of ${LEAD_LINK} could be verified as the same paper, so its methods were not checked.`]
  ])("prints the signed lead boundary for %s", (state, limit, caveat) => {
    const id = "10.1016/j.joca.2020.01.001";
    const receipt = sign("full_text_lead", { doi: id, state }, options);
    const result = finalizeResearch({ receipts: [survey, emptySearch, repeatScout, videoA, videoB, study, receipt],
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id, status: "lead_only" }] }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toContain(`Cite ${id} as a lead: ${limit}, so its methods were not audited.`);
    expect(result.caveats).toContain(caveat);
  });

  // Owner answer 147a (2026-10-21, from UDA #411): a lead read through another of the app's full-text tools is
  // reported as read that way, never as abstract-only and never as AskRigor's audit; the other answers keep the lead.
  it("reports a lead read through another tool as read there, not audited by AskRigor", () => {
    const id = "10.1016/j.joca.2020.01.001";
    const receipt = sign("full_text_lead", { doi: id, state: "PAYWALL_OR_LOGIN_REQUIRED" }, options);
    const check = (other_route: "read" | "unavailable" | "cost" | "none") => finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, videoB, study, receipt],
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id, status: "lead_only", other_route }]
    }, options);
    const read = check("read");
    expect(read.status).toBe("ready_with_limits");
    expect(read.sources.lead_only).toEqual([id]);
    expect(read.limits).toContain(`Cite ${id} as read through another tool, not audited by AskRigor.`);
    expect(read.caveats).toContain(`One key study, ${LEAD_LINK}, was read through another tool, not audited by AskRigor.`);
    expect(read.caveats.join(" ")).not.toContain("was not openly available");
    for (const other of ["unavailable", "cost", "none"] as const) {
      const lead = check(other);
      expect(lead.caveats).toContain(`The full text of ${LEAD_LINK} was not openly available, so its methods were not checked.`);
      expect(lead.caveats.join(" ")).not.toContain("read through another tool");
    }
  });

  it("states that PubMed lists a key study without a DOI, without calling it unavailable", () => {
    const noDoiRecord = sign("pubmed_record", { pmid: "31234567" }, options);
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study, noDoiRecord],
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ read_depth: "abstract_only", answer_marker: "Study", id: "PMID: 31234567", status: "lead_only" }]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.sources.lead_only).toEqual(["PMID: 31234567"]);
    expect(result.caveats).toContain(
      "AskRigor could not fetch the full text of [this study](https://pubmed.ncbi.nlm.nih.gov/31234567/), which PubMed " +
        "lists without a DOI, so its methods were not checked."
    );
    expect(result.caveats.join(" ")).not.toContain("not openly available");
  });

  describe("owner question 113: repeated primary-service failures", () => {
    const id = "10.1016/j.joca.2020.01.001";
    const pmcid = "PMC9990001";
    const caveat = `AskRigor could not fetch the full text of [this study](https://doi.org/${id}) because a ` +
      "full-text service kept failing, so its methods were not checked.";
    const retry = `A full-text service failed for ${id}: call acquire_open_full_text again at least a minute after ` +
      "the first attempt; if it fails again, pass the research_receipt from each attempt and cite it as a lead.";
    // Deliberately decouple the signed issue time from the ordering claim t.
    const failure = (seconds: number, claims: Record<string, string | string[]> = {}) => issueResearchReceipt(
      "full_text_route_failure", { doi: id, pmcid, routes: ["europe_pmc"], http: ["500"],
        state: "PROVIDER_UNAVAILABLE", t: "1", ...claims },
      { secret: SECRET, now: () => new Date(now().getTime() - 120_000 + seconds * 1000) }
    );
    const run = (receipts: string[], overrides: Record<string, unknown> = {}) => finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, videoB, study, ...receipts],
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ id, read_depth: "partial_text", answer_marker: "Study", status: "lead_only" }], ...overrides
    }, options);

    it("accepts two signed issue times exactly 60 seconds apart, in either order", () => {
      const receipts = [failure(0), failure(60)];
      for (const ordered of [receipts, [...receipts].reverse()]) {
        const result = run(ordered);
        expect(result.status).toBe("ready_with_limits");
        expect(result.sources.lead_only).toEqual([id]);
        expect(result.limits).toContain(`Cite ${id} as a lead: a full-text service kept failing when AskRigor tried ` +
          "to fetch it, so its methods were not audited.");
        expect(result.caveats).toContain(caveat);
        expect(result.next_steps).toEqual([]);
      }
    });

    it.each([[0], [0, 30], [0, 59], [0, 0]])("asks for a retry for issue times %j", (...seconds) => {
      const receipts = seconds.map((second, index) => failure(second, { t: String(index * 600_000) }));
      const result = run(receipts);
      expect(result.status).toBe("not_ready");
      expect(result.sources.lead_only).toEqual([]);
      expect(result.next_steps).toEqual([retry]);
      expect(result.caveats).not.toContain(caveat);
    });

    it("another DOI's receipt does not make a second attempt", () => {
      expect(run([failure(0), failure(60, { doi: "10.1000/other-study", pmcid: "PMC9990002" })]).next_steps)
        .toEqual([retry]);
      expect(run([failure(0, { doi: "10.1000/other-study", pmcid: "PMC9990002" }),
        failure(60, { doi: "10.1000/other-study", pmcid: "PMC9990002" })]).next_steps)
        .toEqual([`Try acquire_open_full_text for ${id} before treating it as lead_only; pass the research_receipt it ` +
          `returns. ${LEAD_RECEIPT_SEARCH_TEXT}`]);
    });

    it("rejects a forged receipt, including a modified issue time", () => {
      const token = failure(60).split("~");
      token[3] = String(Number(token[3]) + 60);
      const result = run([failure(0), token.join("~")]);
      expect(result.status).toBe("not_ready");
      expect(result.sources.lead_only).toEqual([]);
      expect(result.next_steps).toContain(retry);
      expect(result.receipts_rejected).toEqual([{ index: 7, reason: "signature_invalid" }]);
    });

    it("validated still needs an audit", () => {
      const result = run([failure(0), failure(60)], {
        key_sources: [{ id, read_depth: "partial_text", answer_marker: "Study", status: "validated" }]
      });
      expect(result.status).toBe("not_ready");
      expect(result.sources.lead_only).toEqual([]);
      expect(result.next_steps).toEqual([`For ${id}: acquire_open_full_text, continue_open_full_text until exhausted, ` +
        "then validate_study_method_audit (or validate_review_method_audit) and pass its research_receipt. If no open " +
        `full text exists, the acquisition receipt lets you list it as lead_only. ${LEAD_RECEIPT_SEARCH_TEXT}`]);
    });

    it("a completed lead takes precedence, even before the retry interval", () => {
      const completed = sign("full_text_lead", { doi: id, state: "PARTIAL_TEXT_READABLE" }, options);
      const result = run([failure(0), completed]);
      expect(result.status).toBe("ready_with_limits");
      expect(result.caveats).toContain(`AskRigor could read only part of [this study](https://doi.org/${id}), ` +
        "so its methods were not checked.");
      expect(result.caveats).not.toContain(caveat);
      expect(result.next_steps).not.toContain(retry);
    });

    it("a full-text method audit takes precedence", () => {
      const audited = sign("study_audit", { doi: id, status: "complete_no_unresolved_fields" }, options);
      const result = run([failure(0), failure(60), audited]);
      expect(result.status).toBe("ready_with_limits");
      expect(result.sources.validated).toEqual([id]);
      expect(result.sources.lead_only).toEqual([]);
      expect(result.caveats).not.toContain(caveat);
    });

    it("groups several failed studies into one exact plural caveat", () => {
      const other = "10.1000/other-study";
      const result = run([failure(0), failure(60), failure(0, { doi: other, pmcid: "PMC9990002" }),
        failure(60, { doi: other, pmcid: "PMC9990002" })], { key_sources: [
        { id, read_depth: "partial_text", answer_marker: "Study", status: "lead_only" },
        { id: other, read_depth: "partial_text", answer_marker: "Study", status: "lead_only" }
      ] });
      expect(result.status).toBe("ready_with_limits");
      expect(result.sources.lead_only).toEqual([id, other]);
      expect(result.caveats.filter((text) => text.includes("full-text services kept failing"))).toEqual([
        `AskRigor could not fetch the full texts of [this study](https://doi.org/${id}) and ` +
        `[this study](https://doi.org/${other}) because full-text services kept failing, so their methods were not checked.`
      ]);
    });

    it("keeps the PubMed open-copy check and accepts the named PMCID once tried", () => {
      const record = sign("pubmed_record", { doi: id, pmid: "99900001", pmcid }, options);
      const result = run([failure(0, { pmcid: "PMC9990002" }), failure(60, { pmcid: "PMC9990002" }), record]);
      expect(result.status).toBe("not_ready");
      expect(result.next_steps).toEqual([
        `PubMed lists an open copy of ${id} in PubMed Central (${pmcid}) that the full-text attempt did not ` +
        `try: call acquire_open_full_text with DOI ${id} and pmcid ${pmcid}, then audit it, or pass the new ` +
        `research_receipt if it still finds no full text. ${LEAD_RECEIPT_SEARCH_TEXT}`
      ]);
      expect(run([failure(0), failure(60), record]).status).toBe("ready_with_limits");
      expect(run([failure(0), failure(60), record], { key_sources: [
        { id: "PMID: 99900001", read_depth: "abstract_only", answer_marker: "Study", status: "lead_only" }
      ] }).status).toBe("ready_with_limits");
      expect(run([failure(0), failure(60)], { key_sources: [
        { id: pmcid, read_depth: "partial_text", answer_marker: "Study", status: "lead_only" }
      ] }).status).toBe("ready_with_limits");
    });

    it.each(["not_established", "direct_null_evidence"])("%s still needs a full-text audit", (state) => {
      const quote = "The trial found no difference in pain (mean difference 0.1 points, 95% CI -0.4 to 0.6).";
      const receipts = [failure(0), failure(60)];
      const clean = run(receipts);
      const result = run(receipts, {
        answer_draft: `${CLEAN_DRAFT} ${clean.caveats.join(" ")} ${quote}`,
        absence_claims: [{ quote, state, studies: [id] }]
      });
      expect(result.status).toBe("not_ready");
      expect(result.next_steps.some((step) => step.includes("no full-text method audit here covers"))).toBe(true);
    });

    it("holds an answer that omits the exact service-failure caveat", () => {
      const receipts = [failure(0), failure(60)];
      const clean = run(receipts);
      const result = run(receipts, { answer_draft: `${CLEAN_DRAFT} ${clean.caveats.filter((text) => text !== caveat).join(" ")}` });
      expect(result.status).toBe("not_ready");
      expect(result.next_steps).toContain(leftOut(caveat));
    });
  });

  it("turns bounded audits and server-proven leads into limits", () => {
    const noDoiRecord = sign("pubmed_record", { pmid: "31234567" }, options);
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, videoB, study, lead, noDoiRecord],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "validated" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "PMID: 31234567", status: "lead_only", reason: "abstract only; no DOI" }
      ]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.sources).toEqual({
      validated: ["10.1002/art.41142"],
      lead_only: ["10.1016/j.joca.2020.01.001", "PMID: 31234567"]
    });
    expect(result.limits).toEqual([
      "Comments on video bbbbbbbbbbb were only partly accessible; treat its community signal as bounded.",
      FORUM_LIMIT,
      "Cite 10.1016/j.joca.2020.01.001 as a lead: no open full text was available, so its methods were not audited.",
      "Cite PMID: 31234567 as a lead: PubMed lists no DOI; acquire_open_full_text requires a DOI, so its methods were not audited.",
      OFFER_LIMIT
    ]);
    expect(result.finalization_receipt).toBeDefined();

    // Lead-only studies with different reasons get separate caveats, and the bounded video has its own.
    expect(result.caveats).toEqual([
      "Some comments on [this video](https://www.youtube.com/watch?v=bbbbbbbbbbb) could not be read, so its comment " +
        "evidence is incomplete.",
      FORUM_CAVEAT,
      "The full text of [this study](https://doi.org/10.1016/j.joca.2020.01.001) was not openly available, so its " +
        "methods were not checked.",
      "AskRigor could not fetch the full text of [this study](https://pubmed.ncbi.nlm.nih.gov/31234567/), which PubMed " +
        "lists without a DOI, so its methods were not checked.",
      ...OFFER_CAVEATS
    ]);
    // The subreddit's caveat is in CLEAN_DRAFT, and the drafts below are deep
    // research's, with no first-pass offer; the checks concern the others.
    const caveats = result.caveats.filter((caveat) => caveat !== FORUM_CAVEAT);
    const request = {
      research_depth: "deep" as const,
      receipts: [survey, emptySearch, repeatScout, videoA, videoB, study, lead, noDoiRecord],
      community_evidence: "researched" as const,
      treatment_choice: "not_compared" as const,
      research_target: TARGET,
      community_findings: findingsFor(["aaaaaaaaaaa", "bbbbbbbbbbb"]),
      key_sources: [
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "validated" as const },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "PMID: 31234567", status: "lead_only" as const, reason: "abstract only; no DOI" }
      ]
    };
    const answerWith = (...sentences: string[]) =>
      finalizeResearchRaw({ ...request, answer_draft: [CLEAN_DRAFT, ...sentences].join(" ") }, options);
    // Qualifying one study does not stand for the other study's caveat, and other words are not the caveat.
    const studiesCaveat = caveats[2]!;
    const oneStudy = "The full text of [this study](https://doi.org/10.1016/j.joca.2020.01.001) was not openly " +
      "available, so its methods were not checked.";
    expect(answerWith(caveats[0]!, oneStudy, "The PubMed study was only an abstract.").next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      leftOut(studiesCaveat)
    ]);
    // A link's text may change, and formatting and line breaks do not matter.
    expect(answerWith(
      caveats[0]!.replace("[this video]", "[Hip exercises that helped me]"),
      caveats[1]!,
      studiesCaveat.replace("[this study]", "[Smith and colleagues, 2019]").replace("could not", "**could not**")
        .replace("so its methods", "so\nits methods").replace("were not checked", "were\u00a0not checked")
    )).toMatchObject({ status: "ready_with_limits", next_steps: [] });

    // A DOI with parentheses keeps a working link, whose text may change too.
    const parenthesized = "10.1016/S0140-6736(20)30183-5";
    const parenthesizedRequest = {
      ...request,
      receipts: [...request.receipts, sign("full_text_lead", { doi: parenthesized }, options)],
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: parenthesized, status: "lead_only" as const }]
    };
    const parenthesizedCaveat = "The full text of [this study](https://doi.org/10.1016/s0140-6736%2820%2930183-5) was " +
      "not openly available, so its methods were not checked.";
    expect(finalizeResearchRaw({ ...parenthesizedRequest, answer_draft: CLEAN_DRAFT }, options).caveats)
      .toContain(parenthesizedCaveat);
    expect(finalizeResearchRaw({
      ...parenthesizedRequest,
      answer_draft: [CLEAN_DRAFT, caveats[0]!, parenthesizedCaveat.replace("[this study]", "[The Lancet, 2020]")].join(" ")
    }, options)).toMatchObject({ status: "ready_with_limits", next_steps: [] });
  });

  it("tries a PubMed Central copy that PubMed links to a study before accepting it as a lead", () => {
    const linked = sign("pubmed_record", {
      pmid: "31234567", doi: "10.1016/j.joca.2020.01.001", pmcid: "PMC7654321"
    }, options);
    const base = {
      receipts: [survey, emptySearch, repeatScout, videoA, study, lead, linked],
      community_evidence: "researched" as const,
      treatment_choice: "not_compared" as const,
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "lead_only" as const, reason: "paywalled" }]
    };
    // The lead receipt came from a DOI-only attempt; the open copy was never tried.
    const untried = finalizeResearch(base, options);
    expect(untried.status).toBe("not_ready");
    expect(untried.sources.lead_only).toEqual([]);
    expect(untried.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "PubMed lists an open copy of 10.1016/j.joca.2020.01.001 in PubMed Central (PMC7654321) that the full-text " +
        "attempt did not try: call acquire_open_full_text with DOI 10.1016/j.joca.2020.01.001 and pmcid PMC7654321, " +
        "then audit it, or pass the new research_receipt if it still finds no full text. " +
        LEAD_RECEIPT_SEARCH_TEXT
    ]);
    const byPmid = finalizeResearch({ ...base, key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMID: 31234567", status: "lead_only" as const }] }, options);
    expect(byPmid.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      expect.stringMatching(/^PubMed lists an open copy of PMID: 31234567 in PubMed Central \(PMC7654321\)/u)
    ]);
    // Once that copy was tried and still gave no full text, the lead stands.
    const triedCopy = sign("full_text_lead", { doi: "10.1016/j.joca.2020.01.001", pmcid: "PMC7654321" }, options);
    const tried = finalizeResearch({ ...base, receipts: [...base.receipts, triedCopy] }, options);
    expect(tried.status).toBe("ready_with_limits");
    expect(tried.sources.lead_only).toEqual(["10.1016/j.joca.2020.01.001"]);
  });

  it("keeps a DOI-less PMID as a lead even when PMC hosts a copy the acquisition tool cannot request", () => {
    const pmcRecord = sign("pubmed_record", { pmid: "31234567", pmcid: "PMC7654321" }, options);
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study, pmcRecord],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "PMID: 31234567", status: "lead_only", reason: "no DOI" }
      ]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.sources.lead_only).toEqual(["PMID: 31234567"]);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.caveats.join(" ")).toContain("which PubMed lists without a DOI");
  });

  it("binds material videos to discovery receipts passed in the same call", () => {
    const otherSurvey = sign("youtube_survey", { access: "complete", searches: 2, videos: ["zzzzzzzzzzz"], q: "d4d4d4d4d4d4" }, options);
    const unbound = finalizeResearch({
      receipts: [otherSurvey, emptySearch, videoA, study],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(unbound.status).toBe("not_ready");
    expect(unbound.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
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
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    }, options).status).toBe("ready_with_limits");
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
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual([
      "1 community survey(s) were only partly completed (some searches failed or hit limits); say the community picture may be incomplete.",
      FORUM_LIMIT,
      OFFER_LIMIT
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
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC123", status: "lead_only", reason: "not retrieved" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "PMID 999", status: "lead_only", reason: "abstract only" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "4242", status: "lead_only" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "WHO guideline 2024", status: "lead_only", reason: "no identifier" }
      ]
    }, options);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Fetch PMID 999 with fetch_pubmed_record and pass its research_receipt; if it has a DOI, try acquire_open_full_text.",
      "Try acquire_open_full_text for 4242 (DOI 10.1016/j.joca.2020.01.001) before treating it as lead_only; pass the research_receipt it returns. " +
        LEAD_RECEIPT_SEARCH_TEXT,
      "Key source WHO guideline 2024 has no answer_marker on the same line as its link in answer_draft; put its answer_marker there.",
      "Identify WHO guideline 2024 by DOI, PMID or PMCID, or leave it out of key_sources and label it unverified in the answer."
    ]);

    // The PMID's DOI links it to an acquisition lead and to a validated audit.
    const byDoi = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, withDoi, lead],
      community_evidence: "researched",
      treatment_choice: "not_compared",
      research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "4242", status: "lead_only" }]
    }, options);
    expect(byDoi.sources.lead_only).toEqual(["4242"]);
  });

  it("never asks a source known only by PMCID for a DOI it does not have", () => {
    const result = finalizeResearch({
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ id: "PMC5640576", status: "lead_only", read_depth: "partial_text", answer_marker: "Study" }]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.sources.lead_only).toEqual(["PMC5640576"]);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.caveats.join(" ")).toContain("its full-text tool requires a DOI and none was known");
    expect(result.caveats.join(" ")).toContain("PMC5640576");
  });

  it("closes a material video's bounded audit and requires its count and non-ranking caveats", () => {
    const bounded = sign("youtube_video_audit", {
      video: "bbbbbbbbbbb", state: "completed_with_access_boundary", lock: "pass",
      boundary: "identifier_membership", records: 520, shown: 0
    }, options);
    const request = {
      receipts: [survey, emptySearch, repeatScout, videoA, bounded, study],
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      research_depth: "deep", material_video_ids: ["aaaaaaaaaaa", "bbbbbbbbbbb"],
      key_sources: [{ id: "10.1002/art.41142", status: "validated", read_depth: "partial_text", answer_marker: "Study" }],
      community_findings: findingsFor(["aaaaaaaaaaa"])
    };
    const result = finalizeResearch(request, options);
    const sentence = "The audit of [this video](https://www.youtube.com/watch?v=bbbbbbbbbbb) stopped at 520 comments, " +
      "before the end of its comments, so no complete-corpus claim is made.";
    const noRanking = "These comments support only a bounded account, so the answer does not use them to rank or recommend options.";
    expect(result.status).toBe("ready_with_limits");
    expect(result.community.audited_videos).toContain("bbbbbbbbbbb");
    expect(result.caveats).toContain(sentence);
    expect(result.caveats).toContain(noRanking);
    const omitted = finalizeResearchRaw({ ...request, answer_draft: CLEAN_DRAFT }, options);
    expect(omitted.status).toBe("not_ready");
    expect(omitted.next_steps.join(" ")).toContain(sentence);
    expect(omitted.next_steps.join(" ")).toContain(noRanking);
    expect(omitted.next_steps.join(" ")).not.toContain("continue until the audit completes");
  });

  it("keeps discovering until two rounds from new angles add no video worth auditing", () => {
    // Deep research runs to saturation; a first pass would stop at its cap.
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }], research_depth: "deep" as const
    };

    const oneRound = finalizeResearch({ ...base, receipts: [survey, videoA, study] }, options);
    expect(oneRound.status).toBe("not_ready");
    expect(oneRound.community.saturated).toBe(false);
    expect(oneRound.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(/^Run another discovery round from a new angle/u)]);

    // Video d first turned up in the last round, so the search is still finding material.
    const lateFind = sign("youtube_scout", { videos: ["ddddddddddd"], open: 0, q: "g7g7g7g7g7g7" }, options);
    const videoD = sign("youtube_video_audit", { video: "ddddddddddd", state: "api_visible_complete", lock: "pass", records: 90 }, options);
    const fresh = finalizeResearch({ ...base, receipts: [survey, emptySearch, lateFind, videoA, videoD, study] }, options);
    expect(fresh.status).toBe("not_ready");
    expect(fresh.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(/^Discovery has not saturated: ddddddddddd first turned up/u)]);

    // Two more rounds from different angles that add nothing new close it,
    // wherever the caller puts them in the list.
    const laterSearch = sign("youtube_search", { videos: ["ddddddddddd"], q: "h8h8h8h8h8h8" }, options);
    const closingScout = sign("youtube_scout", { videos: ["bbbbbbbbbbb"], open: 0, q: "c3c3c3c3c3c3" }, options);
    const closed = finalizeResearch({
      ...base,
      receipts: [closingScout, laterSearch, survey, lateFind, emptySearch, videoA, videoD, study]
    }, options);
    expect(closed.status).toBe("ready_with_limits");
    expect(closed.community).toMatchObject({ discovery_rounds: 5, saturated: true, material_videos: ["aaaaaaaaaaa", "ddddddddddd"] });
  });

  it("does not count repeated searches or unverified scout candidates as saturation", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }], research_depth: "deep" as const
    };
    // A later call repeating the same query (a byte-identical receipt would count once).
    const sameAngle = sign("youtube_search", { videos: ["zzzzzzzzzzz"], q: "b2b2b2b2b2b2" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, sameAngle, videoA, study] }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([expect.stringMatching(/^The last two discovery rounds repeated the same searches/u)]);

    const openScout = sign("youtube_scout", { videos: [], open: 3, q: "i9i9i9i9i9i9" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, openScout, videoA, study] }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([expect.stringMatching(/^A recent round left results unchecked/u)]);

    // A search whose results continue on an unread page is not a settled round.
    const unreadPage = sign("youtube_search", { videos: [], open: 1, q: "j0j0j0j0j0j0" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, unreadPage, videoA, study] }, options)).toMatchObject({
      status: "not_ready",
      community: { saturated: false },
      next_steps: [expect.stringContaining("Continue a search with its next cursor")]
    });
  });

  it("lets a later page settle the page it continued", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }], research_depth: "deep" as const
    };
    const next = pageKey("hip pain what worked", "CAoQAA");
    const pageOne = sign("youtube_search", { videos: [], open: 1, nx: next, q: "j0j0j0j0j0j0" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, emptySearch, pageOne, videoA, study] }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([expect.stringContaining("Continue a search with its next cursor")]);
    // Page two read the rest: nothing is left unread, though two pages of one
    // query are one angle, so saturation still needs a new one.
    const pageTwo = sign("youtube_search", { videos: [], open: 0, pg: next, q: "j0j0j0j0j0j0" }, options);
    expect(finalizeResearch({ ...base, receipts: [survey, pageOne, pageTwo, videoA, study] }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([expect.stringMatching(/^The last two discovery rounds repeated the same searches/u)]);
  });

  it("q132: quota-blocked deep discovery passes with a later-turn caveat; first passes keep their caveat", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    // One search finished with no next page and the daily quota stopped the
    // other: nothing is unread, but the round is not settled.
    const mixedSurvey = sign("youtube_survey", {
      access: "partial", searches: 2, rl: 1, inc: 1, videos: [], open: 0, q: "l2l2l2l2l2l2"
    }, options);
    const receipts = [survey, emptySearch, mixedSurvey, videoA, study];
    const deep = finalizeResearch({ ...base, receipts, research_depth: "deep" }, options);
    expect(deep.status).toBe("ready_with_limits");
    expect(deep.community.saturated).toBe(false);
    expect(deep.next_steps).toEqual([]);
    expect(deep.caveats).toContain("YouTube's daily search limit stopped 1 search in this research; a later turn can rerun it after the limit resets.");
    // Rechecks retain a limit; it cannot become a stuck step.
    const quotaRequest = { ...base, receipts, research_depth: "deep" as const };
    let result = deep;
    for (let round = 2; round <= 4; round += 1) {
      result = finalizeResearch({ ...quotaRequest, round_token: result.round_token }, options);
      expect(result.status).toBe("ready_with_limits");
      expect(result.next_steps).toEqual([]);
      expect(result.stopped).toBeUndefined();
    }

    // A first pass cannot rerun them until the limit resets, so it ends with them as open leads.
    const firstPass = { ...base, receipts, research_depth: "first_pass" as const };
    expect(finalizeResearch({ ...firstPass, open_leads: [] }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "List two or three open_leads with direction studies: studies whose methods were not audited in full text, or " +
        "questions not yet searched, each with what it could change in this answer (the conclusion, a ranking, the " +
        "confidence, or only detail) and why it looks promising.",
      "List two or three open_leads with direction community: communities, options or subgroups not yet reached, each " +
        "with what it could change in this answer (the conclusion, a ranking, the confidence, or only detail) and why " +
        "it looks promising. Discovery has not saturated, so include the topics where more community signal " +
        "is likely and the searches YouTube's rate limit or daily quota stopped."
    ]);
    // Two or three focuses each, not more.
    expect(finalizeResearch({
      ...firstPass,
      open_leads: [
        ...STUDY_FOCUSES,
        ...STUDY_FOCUSES.map((lead) => ({ ...lead, topic: `${lead.topic}, in more depth` })),
        ...COMMUNITY_FOCUSES
      ]
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "open_leads lists 4 focuses with direction studies; keep the two or three most promising."
    ]);
    const withLeads = finalizeResearch({
      ...firstPass,
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "What commenters say helped", why: "The daily quota stopped one search before it ran." },
        COMMUNITY_FOCUSES[1]
      ]
    }, options);
    expect(withLeads.status).toBe("ready_with_limits");
    expect(withLeads.limits).toContain(
      "YouTube's rate limit or daily quota stopped 1 search(es) in the latest discovery rounds; a later turn can rerun them after the limit resets."
    );
    // The answer carries the gate's caveat itself; a denial of it does not count.
    const rateLimited = {
      ...firstPass,
      community_findings: findingsFor(["aaaaaaaaaaa"]),
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "What commenters say helped", why: "Commenters named remedies no search covered." },
        COMMUNITY_FOCUSES[1]
      ]
    };
    const rateCaveat = "YouTube's daily search limit stopped 1 search in this first pass; another pass can rerun it " +
      "after the limit resets.";
    const fullDraft = caveatedDraft(rateLimited, options);
    expect(fullDraft).toContain(rateCaveat);
    const answered = (answerDraft: string) => finalizeResearchRaw({
      ...rateLimited, another_pass_estimate: PASS_ESTIMATE, answer_draft: answerDraft
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
    expect(answered(fullDraft)).toEqual([]);
    const leftOutRate = [
      leftOut(rateCaveat)
    ];
    expect(answered(fullDraft.replace(rateCaveat,
      "YouTube's quota did not stop any searches, but another pass can rerun them once it resets."))).toEqual(leftOutRate);
    // The caveat must stand as its own sentence: not embedded, quoted, continued or in a quotation block.
    for (const denial of [
      `It is false that ${rateCaveat}`,
      `"${rateCaveat}" That is wrong.`,
      `${rateCaveat.replace(/\.$/u, "")}, but that is not what happened.`,
      `\n\n> ${rateCaveat}\n\nThat claim is false.\n\n`,
      // Shown as code or hidden in a comment, it is not stated either.
      `\`${rateCaveat}\``,
      `\`\`\`\`${rateCaveat}\`\`\`\``,
      `\n\n\`\`\` ${rateCaveat} \`\`\`\n\n`,
      `\n\n\`\`\`\n${rateCaveat}\n\`\`\`\n\n`,
      `\n\n    ${rateCaveat}\n\n`,
      `<!-- ${rateCaveat} -->`,
      // Blank lines inside the code block or comment do not bring the caveat out.
      `\n\n\`\`\`\n\n${rateCaveat}\n\n\`\`\`\n\n`,
      // A fence line with text after its marker does not close the block.
      `\n\n\`\`\`\nsearch log\n\`\`\` not a closing fence\n\n${rateCaveat}\n\n\`\`\`\n\n`,
      // Nor does one indented four spaces at the top level, which CommonMark reads as code.
      `\n\n\`\`\`\nsearch log\n    \`\`\`\n${rateCaveat}\n\n`,
      // A fence indented three spaces still opens one.
      `\n\n   \`\`\`\n${rateCaveat}\n\`\`\`\n\n`,
      // Inside a list item, a fence holds it as code, and so does a line four spaces past the item's content.
      `\n\n- Search log:\n\n    \`\`\`\n\n    ${rateCaveat}\n\n    \`\`\`\n\n`,
      `\n\n- Search log:\n\n        ${rateCaveat}\n\n`,
      `\n\n<!--\n\n${rateCaveat}\n\n-->\n\n`,
      // An item's content starts after its marker and spaces: four spaces do not reach "100. " content,
      // so after a blank line the caveat is top-level indented code (Codex's case), and likewise for an indented marker.
      `\n\n100. Search log\n\n    ${rateCaveat}\n\n`,
      `\n\n   - Search log\n\n    ${rateCaveat}\n\n`,
      // Five spaces after a marker make the item's content indented code.
      `\n\n-     ${rateCaveat}\n\n`,
      // A fence ends with its item, and an unindented fence line then opens a new one.
      `\n\n- Search log\n  \`\`\`\n\`\`\`\n${rateCaveat}\n\n`,
      // An HTML block runs to the next blank line, list marker and all.
      `\n\n<div>\n- Search log\n</div>\n\n    ${rateCaveat}\n\n`,
      // An image's description, a link definition's title and a tag's attributes are not shown.
      `\n\nSee ![Search log. ${rateCaveat}](https://example.com/log.png)\n\n`,
      `\n\n[1]: https://example.com "Search log. ${rateCaveat}"\n\n`,
      `\n\nSee <span title="Search log. ${rateCaveat}">the log</span>.\n\n`,
      // A comment that opens inside a paragraph cannot hide the fence on the next line.
      `\n\nSearch log <!--\n\`\`\`\n--> ${rateCaveat}\n\n`,
      // Nor is a link's title or angle-bracket destination shown.
      `\n\nSee [the log](https://example.com "Search log. ${rateCaveat}").\n\n`,
      `\n\nSee [the log](<Search log. ${rateCaveat}>).\n\n`
    ]) {
      expect(answered(fullDraft.replace(rateCaveat, denial))).toEqual(leftOutRate);
    }
    // In a list item, after a heading or in bold it is stated.
    for (const stated of [
      `\n\n**Limits**\n\n- ${rateCaveat}\n\n`,
      `\n\n## Limits\n1. **${rateCaveat}**\n\n`,
      // An indented paragraph under a list item continues it; text after a closed code block counts.
      `\n\n- Limits of this pass:\n\n    ${rateCaveat}\n\n`,
      `\n\n\`\`\`\nsearch log\n\`\`\`\n\n${rateCaveat}`,
      // A line that opens with inline code is not a fence, so what follows still counts.
      `\n\n\`\`\`search log\`\`\` shown above.\n\n${rateCaveat}`,
      // A list nested four spaces in is still a list, and its items still count.
      `\n\n- Limits of this pass:\n    - ${rateCaveat}\n    - Nothing else was stopped.\n\n`,
      // A closed list fence ends the code; the caveat after it counts.
      `\n\n- Search log:\n\n    \`\`\`\n    queries\n    \`\`\`\n\n${rateCaveat}`,
      // Four spaces in at the top level, three backticks are indented code, not a fence left open.
      `\n\n    \`\`\`\n\n${rateCaveat}`,
      // Five spaces reach "100. " content, and a nested item's content counts too.
      `\n\n100. Search log\n\n     ${rateCaveat}\n\n`,
      `\n\n- Limits\n  - Searches\n\n    ${rateCaveat}\n\n`,
      // Bold tags are not shown, but the caveat inside them is.
      `\n\n<b>${rateCaveat}</b>`
    ]) {
      expect(answered(fullDraft.replace(rateCaveat, stated))).toEqual([]);
    }

    // A search that failed for another reason is rerun: in deep research, and in
    // a first pass that has not yet completed its two rounds.
    const failedSearch = sign("youtube_search", { videos: [], access: "error", rl: 0, inc: 1, open: 0, q: "n4n4n4n4n4n4" }, options);
    const rerun = /^1 search\(es\) in the latest discovery rounds did not complete\. Rerun them and pass the new research_receipt\./u;
    expect(finalizeResearch({ ...base, research_depth: "deep", receipts: [survey, emptySearch, failedSearch, videoA, study] }, options)
      .next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(rerun)]);
    expect(finalizeResearch({ ...firstPass, receipts: [survey, failedSearch, videoA, study] }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([expect.stringMatching(rerun)]);

    // The quota stopped the only round before any video turned up: YouTube
    // evidence is unchecked, not thin.
    const stoppedSurvey = sign("youtube_survey", {
      access: "rate_limited", searches: 2, rl: 2, inc: 2, videos: [], open: 0, q: "m3m3m3m3m3m3"
    }, options);
    const nothingYet = finalizeResearch({
      ...firstPass,
      receipts: [stoppedSurvey, study],
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "Firsthand experience with hip programs", why: "The daily quota stopped discovery." },
        COMMUNITY_FOCUSES[1]
      ]
    }, options);
    expect(nothingYet.status).toBe("ready_with_limits");
    expect(nothingYet.limits).toContain(
      "No video turned up before YouTube's rate limit or daily quota stopped discovery; say that YouTube evidence " +
        "could not be checked yet, not that it is thin."
    );
    expect(nothingYet.limits.join(" ")).not.toContain("community evidence on this is thin");

    // A video found another way and read after the quota stopped discovery (s359 T1b, 23 Oct): YouTube evidence was
    // checked, so the check says the search was incomplete, not that nothing could be checked.
    const readAnyway = finalizeResearch({
      ...firstPass,
      receipts: [stoppedSurvey, videoA, study],
      material_video_ids: [],
      no_material_video_reason: "The video read does not show the routine asked about.",
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "Firsthand experience with hip programs", why: "The daily quota stopped discovery." },
        COMMUNITY_FOCUSES[1]
      ]
    }, options);
    expect(readAnyway.limits.join(" ")).not.toContain("No video turned up before");
    expect(readAnyway.caveats.join(" ")).not.toContain("before any video turned up");
    expect(readAnyway.caveats).toContain(
      "YouTube's search limit stopped discovery, so the video read here was found another way, not by a complete search."
    );
    // A video found another way whose audit read no comments still turned up: "before any video turned up" would be false.
    const noComments = sign("youtube_video_audit", {
      video: "aaaaaaaaaaa", state: "api_visible_complete", lock: "pass", records: 0
    }, options);
    const readNoComments = finalizeResearch({
      ...firstPass,
      receipts: [stoppedSurvey, noComments, study],
      material_video_ids: [],
      no_material_video_reason: "The video read does not show the routine asked about.",
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "Firsthand experience with hip programs", why: "The daily quota stopped discovery." },
        COMMUNITY_FOCUSES[1]
      ]
    }, options);
    expect(readNoComments.caveats.join(" ")).not.toContain("before any video turned up");
    expect(readNoComments.caveats).toContain(
      "YouTube's search limit stopped discovery, so the video read here was found another way, not by a complete search."
    );
  });

  it("requires caveats and check lines outside details, while allowing other text inside", () => {
    const request = {
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ read_depth: "full_text_audited", answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }],
      receipts: [survey, emptySearch, repeatScout, videoA, study], community_findings: findingsFor(["aaaaaaaaaaa"])
    };
    const draft = caveatedDraft(request, options);
    const caveat = STUDY_FOCUS_CAVEATS[0]!;
    const check = (answer_draft: string, extra = {}) => finalizeResearch({ ...request, answer_draft, ...extra }, options);
    expect(check(draft).status).toBe("ready_with_limits");
    for (const collapsed of [
      `<details><summary>Limits</summary>\n\n${caveat}\n\n</details>`,
      `<DETAILS open data-note="a > b"\n class='limits'><summary>${caveat}</summary></DETAILS>`,
      `<details données='a > b'><summary>Limites</summary>\n\n${caveat}\n\n</details>`,
      `<details><summary>Outer</summary><details><summary>Inner</summary>\n\n${caveat}\n\n</details></details>`,
      `<details><summary>Limits</summary>\n\n![Chart](https://example.com/chart.png)\n\n${caveat}\n\n</details>`,
      `<details><summary>Limits</summary>\n\n${caveat}`
    ]) {
      const result = check(draft.replace(caveat, collapsed));
      expect(result.status).toBe("not_ready");
      expect(result.next_steps, collapsed).toEqual(expect.arrayContaining([expect.stringContaining(
        "Move these caveat sentences out of the <details> block so they are " +
        `visible without expanding it: ${JSON.stringify(caveat)}`)]));
    }
    // An outside copy does not excuse a second copy inside the element.
    expect(check(`${draft}\n\n<details><summary>Limits</summary>\n\n${caveat}\n\n</details>`).status).toBe("not_ready");
    const rendering = "Étude à approfondir : des essais plus longs. Les essais lus duraient douze semaines.";
    expect(check(draft.replace(caveat, `<details><summary>Limites</summary>\n\n${rendering}\n\n</details>`), {
      answer_language: "fr", caveat_renderings: [{ caveat, text: rendering }]
    }).next_steps.join("\n")).toContain(JSON.stringify(rendering));
    for (const line of [
      "Checked with AskRigor's final check.",
      "Checked with AskRigor's final check, with the limits above.",
      "AskRigor's final check has not passed: some of its statements were not checked."
    ]) {
      const result = check(`${draft}\n\n<details><summary>Check</summary>\n\n${line}\n\n</details>`);
      expect(result.status).toBe("not_ready");
      expect(result.next_steps).toContain("Move the check line or unchecked line out of the <details> block so its " +
        "full sentence is visible without expanding it.");
      expect(check(`${draft}\n\n${line}`).status).toBe("ready_with_limits");
    }
    expect(check(`${draft}\n\n<details><summary>Search log</summary>\n\nAdditional search notes.\n\n</details>`)
      .status).toBe("ready_with_limits");
    for (const literal of [
      "`<details>`", "```html\n<details>\n```", "~~~html\n<details>\n~~~", "    <details>",
      "<!-- <details> -->", '<span title="<details>">Example.</span>', "\\<details>",
      "[Example](https://example.com/<details>)"
    ]) {
      expect(check(`${literal}\n\n${draft}`).status, literal).toBe("ready_with_limits");
    }
    expect(check(draft.replace(caveat,
      `<details><summary>Limits</summary>\n\n\`</details>\`\n\n${caveat}\n\n</details>`))
      .next_steps.join("\n")).toContain(`visible without expanding it: ${JSON.stringify(caveat)}`);
    const linkedRequest = { ...request, receipts: [...request.receipts, videoB],
      community_findings: findingsFor(["aaaaaaaaaaa", "bbbbbbbbbbb"]) };
    const linkedDraft = caveatedDraft(linkedRequest, options);
    const linkedCaveat = finalizeResearch(linkedRequest, options).caveats.find((text) => text.startsWith("Some comments on"))!;
    expect(linkedCaveat).toContain("](https://");
    expect(finalizeResearch({ ...linkedRequest, answer_draft: linkedDraft.replace(linkedCaveat,
      `<details><summary>Limits</summary>\n\n${linkedCaveat}\n\n</details>`) }, options).next_steps)
      .toContain("Move these caveat sentences out of the <details> block so they are visible without expanding it: " +
        JSON.stringify(linkedCaveat));
  });

  it("adds a sentence end to study and community focuses only when needed", () => {
    const result = finalizeResearch({
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ read_depth: "full_text_audited", answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }],
      receipts: [survey, emptySearch, repeatScout, videoA, study],
      open_leads: [
        { direction: "studies", topic: "Longer-term results.", why: "Could change confidence." },
        { direction: "studies", topic: "高齢者の結果。", why: "Could change applicability." },
        { direction: "community", topic: "People who stopped?", why: "Could reveal harms." },
        { direction: "community", topic: "Named programs", why: "Could change detail." }
      ]
    }, options);
    expect(result.status).toBe("ready_with_limits");
    expect(result.caveats).toEqual(expect.arrayContaining([
      "Study focus: Longer-term results. Could change confidence.",
      "Study focus: 高齢者の結果。 Could change applicability.",
      "Community focus: People who stopped? Could reveal harms.",
      "Community focus: Named programs. Could change detail."
    ]));
    expect(result.caveats.join(" ")).not.toContain("..");
  });

  it("sends back an answer that leaves out a caveat the gate wrote", () => {
    // A first pass that stopped at its cap, with open leads, after a partly completed survey.
    const partialSurvey = sign("youtube_survey", {
      access: "partial", searches: 4, videos: ["aaaaaaaaaaa", "bbbbbbbbbbb"], q: "p1p1p1p1p1p1"
    }, options);
    const round = (q: string, videos: string[]) => sign("youtube_search", { videos, q }, options);
    const lateVideo = sign("youtube_video_audit", { video: "eeeeeeeeeee", state: "api_visible_complete", lock: "pass", records: 50 }, options);
    const request = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }],
      receipts: [partialSurvey, round("q2q2q2q2q2q2", []), round("q3q3q3q3q3q3", []), round("q4q4q4q4q4q4", ["eeeeeeeeeee"]),
        videoA, lateVideo, study],
      community_findings: findingsFor(["aaaaaaaaaaa", "eeeeeeeeeee"]),
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "Gelatin and collagen for hip pain", why: "Several commenters report it." },
        { direction: "community", topic: "Named physiotherapy programs", why: "comments name two programs no search covered" }
      ],
      another_pass_estimate: "about 20 minutes and 15 YouTube searches."
    };
    const check = (answerDraft: string) => finalizeResearchRaw({ ...request, answer_draft: answerDraft }, options);

    const partialCaveat = "Some YouTube searches failed or hit limits, so the community picture may be incomplete.";
    const leadCaveats = [
      "Community focus: Gelatin and collagen for hip pain. Several commenters report it.",
      "Community focus: Named physiotherapy programs. Comments name two programs no search covered."
    ];
    const passCaveat = "What another pass would take: about 20 minutes and 15 YouTube searches. Would you like to go " +
      "deeper into the studies or the communities, and which focus matters most to you?";
    const expected = [partialCaveat, ...STUDY_FOCUS_CAVEATS, ...leadCaveats, passCaveat];
    expect(check(CLEAN_DRAFT)).toMatchObject({
      status: "not_ready", caveats: [partialCaveat, FORUM_CAVEAT, ...expected.slice(1)], next_steps: [leftOut(...expected)]
    });
    expect(check([CLEAN_DRAFT, ...expected].join(" "))).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    // Naming the leads in other words is not the caveat.
    const studies = STUDY_FOCUS_CAVEATS.join(" ");
    expect(check(`${CLEAN_DRAFT} ${partialCaveat} ${studies} Collagen and physiotherapy are mentioned above. ${passCaveat}`)
      .next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([leftOut(...leadCaveats)]);
    // A lead of short words must appear itself, not just words around it.
    expect(finalizeResearchRaw({
      ...request,
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "PRP for hip pain", why: "Two commenters credit injections with relief." },
        COMMUNITY_FOCUSES[1]
      ],
      answer_draft: `${CLEAN_DRAFT} ${partialCaveat} ${studies} Comments suggest hip pain needs more study. ` +
        `${OFFER_CAVEATS[3]} ${passCaveat}`
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([leftOut("Community focus: PRP for hip pain. Two commenters credit injections with relief.")]);
    // A long draft is read in linear time, however many brackets or backticks it has.
    const started = Date.now();
    expect(check(`${CLEAN_DRAFT} ${"[a](".repeat(14_000)}`).status).toBe("not_ready");
    expect(check(`${CLEAN_DRAFT} ${"``a`".repeat(14_000)}`).status).toBe("not_ready");
    expect(check(`${CLEAN_DRAFT} ${"<!--".repeat(14_000)}`).status).toBe("not_ready");
    expect(check(`${CLEAN_DRAFT} ${Array.from({ length: 11_000 }, (_, index) => `${"`".repeat(index % 7 + 1)}a`).join("")}`).status)
      .toBe("not_ready");
    expect(Date.now() - started).toBeLessThan(1_000);
    // Another pass needs an estimate with a number, in digits of any script, and a unit in any language.
    const estimateStep = "Give another_pass_estimate: roughly what another pass over the open leads would take, with " +
      "a number in digits and a unit (for example, \"about 20 minutes and 15 YouTube searches\").";
    const estimated = (estimate: string | undefined) =>
      finalizeResearchRaw({ ...request, another_pass_estimate: estimate, answer_draft: CLEAN_DRAFT }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
    for (const estimate of [undefined, "a while", "half an hour"]) expect(estimated(estimate)).toContain(estimateStep);
    for (const estimate of ["unas 2 horas y 10 b\u00FAsquedas", "\u7D04\uFF12\uFF10\u5206", "\u062D\u0648\u0627\u0644\u064A \u0662\u0660 \u062F\u0642\u064A\u0642\u0629"]) {
      expect(estimated(estimate)).not.toContain(estimateStep);
    }
  });

  it("lets a first pass stop at its cap and hand back open leads instead of searching on", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }] };
    // Two rounds, the last still finding a video worth auditing: not saturated, but the first pass is done.
    const round = (q: string, videos: string[]) => sign("youtube_search", { videos, q }, options);
    const lateVideo = sign("youtube_video_audit", { video: "eeeeeeeeeee", state: "api_visible_complete", lock: "pass", records: 50 }, options);
    const receipts = [survey, round("m3m3m3m3m3m3", ["eeeeeeeeeee"]), videoA, lateVideo, study];

    const noLeads = finalizeResearch({ ...base, receipts, open_leads: [] }, options);
    expect(noLeads.status).toBe("not_ready");
    expect(noLeads.community).toMatchObject({ saturated: false, first_pass_complete: true });
    expect(noLeads.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "List two or three open_leads with direction studies: studies whose methods were not audited in full text, or " +
        "questions not yet searched, each with what it could change in this answer (the conclusion, a ranking, the " +
        "confidence, or only detail) and why it looks promising.",
      "List two or three open_leads with direction community: communities, options or subgroups not yet reached, each " +
        "with what it could change in this answer (the conclusion, a ranking, the confidence, or only detail) and why " +
        "it looks promising. Discovery has not saturated, so include the topics where more community signal " +
        "is likely."
    ]);

    const withLeads = finalizeResearch({
      ...base,
      receipts,
      open_leads: [
        ...STUDY_FOCUSES,
        { direction: "community", topic: "Gelatin and collagen for hip pain", why: "Several commenters report it; no video on it was audited yet." },
        { direction: "community", topic: "Named physiotherapy programs", why: "Comments name two programs that no search has covered." }
      ]
    }, options);
    expect(withLeads.status).toBe("ready_with_limits");
    expect(withLeads.community.open_leads).toEqual([
      "Longer trials", "Results in people over 70", "Gelatin and collagen for hip pain", "Named physiotherapy programs"
    ]);
    expect(withLeads.limits).toEqual([
      FORUM_LIMIT,
      "First pass only; discovery had not saturated. End the answer with the two ways to go deeper, a sentence or two " +
        "each, in plain language for the user (no video IDs or internal codes): a deeper study review (Longer trials; " +
        "Results in people over 70) and deeper community research (Gelatin and collagen for hip pain; Named " +
        "physiotherapy programs). Say what each focus could change in this answer and why it looks promising, give " +
        "roughly what another pass would take, and ask which the user wants and which focus."
    ]);
    // Without community research, the answer offers the study review alone.
    const studiesOnly = finalizeResearch({
      receipts: [study], community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "A question about one lab value.",
      treatment_choice: "not_compared", research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    }, options);
    expect(studiesOnly).toMatchObject({ status: "ready_with_limits", limits: [COMMUNITY_SKIP_LIMIT, offerLimit(false)] });
    expect(studiesOnly.caveats).toEqual([communitySkipCaveat("A question about one lab value."), ...STUDIES_OFFER_CAVEATS]);
    // An answer that researched neither studies nor communities has nothing to offer.
    expect(finalizeResearch({
      receipts: [], community_evidence: "not_relevant", not_relevant_reason: "A dose arithmetic question.",
      treatment_choice: "not_compared", research_target: TARGET, key_sources: []
    }, options).limits).toEqual(["No study was declared decision-critical; say that no study's methods were checked in full text."]);

    // Three fully audited videos complete it too, after a single round.
    const videoC = sign("youtube_video_audit", { video: "ccccccccccc", state: "api_visible_complete", lock: "pass", records: 70 }, options);
    const audited = finalizeResearch({ ...base, receipts: [survey, videoA, videoB, videoC, study] }, options);
    expect(audited.community).toMatchObject({ discovery_rounds: 1, saturated: false, first_pass_complete: true });

    // Deep research keeps going until discovery saturates.
    const deep = finalizeResearch({ ...base, receipts, research_depth: "deep" }, options);
    expect(deep.status).toBe("not_ready");
    expect(deep.community).toMatchObject({ depth: "deep", first_pass_complete: false });
    expect(deep.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      expect.stringMatching(/^Discovery has not saturated: aaaaaaaaaaa, eeeeeeeeeee first turned up/u)
    ]);
  });

  it("does not count a repeated receipt or a repeated query toward the first-pass cap", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const round = sign("youtube_search", { videos: ["aaaaaaaaaaa"], q: "k1k1k1k1k1k1" }, options);
    const duplicated = finalizeResearch({ ...base, receipts: [round, round, round, round, videoA, study] }, options);
    expect(duplicated.receipts_verified).toBe(4);
    expect(duplicated.community).toMatchObject({ discovery_rounds: 1, first_pass_complete: false });
    expect(duplicated.status).toBe("not_ready");

    // Distinct receipts that repeat one query are still one angle.
    const sameQuery = ["aaaaaaaaaaa", "ggggggggggg", "hhhhhhhhhhh"].map((video) =>
      sign("youtube_search", { videos: [video], q: "k1k1k1k1k1k1" }, options)
    );
    const repeated = finalizeResearch({ ...base, receipts: [...sameQuery, videoA, study] }, options);
    expect(repeated.community).toMatchObject({ discovery_rounds: 3, first_pass_complete: false });
    expect(repeated.status).toBe("not_ready");
  });

  it("does not count a round whose searches failed toward the first-pass cap", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const failed = (q: string) => sign("youtube_search", { videos: [], access: "error", rl: 0, inc: 1, open: 0, q }, options);
    const round = (q: string, videos: string[]) => sign("youtube_search", { videos, q }, options);
    const lateVideo = sign("youtube_video_audit", { video: "eeeeeeeeeee", state: "api_visible_complete", lock: "pass", records: 50 }, options);
    // Three angles, but two rounds errored and read nothing: one covered its angle.
    const earlier = finalizeResearch({
      ...base,
      receipts: [failed("p5p5p5p5p5p5"), failed("q6q6q6q6q6q6"), round("r7r7r7r7r7r7", ["eeeeeeeeeee"]),
        round("r7r7r7r7r7r7", []), lateVideo, study]
    }, options);
    expect(earlier.community).toMatchObject({ discovery_rounds: 4, first_pass_complete: false });
    expect(earlier.status).toBe("not_ready");
    expect(earlier.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(/^Discovery has not saturated: eeeeeeeeeee first turned up/u)]);

    // Failed searches in the latest rounds are rerun, not counted.
    const latest = finalizeResearch({
      ...base,
      receipts: [round("r7r7r7r7r7r7", ["eeeeeeeeeee"]), failed("p5p5p5p5p5p5"), failed("q6q6q6q6q6q6"), lateVideo, study]
    }, options);
    expect(latest.community).toMatchObject({ discovery_rounds: 3, first_pass_complete: false });
    expect(latest.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      expect.stringMatching(/^2 search\(es\) in the latest discovery rounds did not complete\. Rerun them/u)
    ]);
  });

  it("does not let a first pass stop before it has audited or searched enough", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }] };
    const lateFind = sign("youtube_scout", { videos: ["ddddddddddd"], open: 0, q: "g7g7g7g7g7g7" }, options);
    const videoD = sign("youtube_video_audit", { video: "ddddddddddd", state: "api_visible_complete", lock: "pass", records: 90 }, options);
    const early = finalizeResearch({ ...base, receipts: [lateFind, videoD, study] }, options);
    expect(early.status).toBe("not_ready");
    expect(early.community.first_pass_complete).toBe(false);
    expect(early.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)[0]).toMatch(/A first pass may also stop once 3 material videos are audited or 2 rounds are done/u);
  });

  it("lets a niche topic finish with no video once discovery has saturated", () => {
    const base = { community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET, key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }] };
    const emptySurvey = sign("youtube_survey", { access: "complete", searches: 6, videos: [], q: "j0j0j0j0j0j0" }, options);
    const nothing = finalizeResearch({
      ...base, receipts: [emptySurvey, emptySearch, study], community_searches: [REDDIT_SEARCH]
    }, options);
    expect(nothing.status).toBe("ready_with_limits");
    expect(nothing.limits).toEqual([
      "No video turned up in 2 discovery rounds; say that YouTube evidence on this is thin.", FORUM_LIMIT, OFFER_LIMIT
    ]);
    const thinCaveat = "No relevant video turned up in 2 rounds of searching, so YouTube evidence on this is thin.";
    expect(nothing.caveats).toEqual([thinCaveat, FORUM_CAVEAT, ...OFFER_CAVEATS]);
    expect(nothing.must_report).toContain(FORUM_REPORT_LINE);
    expect(nothing.caveats.join(" ")).toContain("YouTube evidence on this is thin");
    expect(nothing.caveats.join(" ")).not.toContain("community evidence on this is thin");
    const thinDraft = (text: string) => finalizeResearchRaw({
      ...base, receipts: [emptySurvey, emptySearch, study], another_pass_estimate: PASS_ESTIMATE,
      answer_draft: `${CLEAN_DRAFT} ${text} ${OFFER_CAVEATS.join(" ")}`
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
    expect(thinDraft("A few commenters on YouTube reported relief.")).toEqual([
      leftOut(thinCaveat)
    ]);
    expect(thinDraft(thinCaveat)).toEqual([]);

    // Videos were found but none was audited: the model must say why.
    const unexplained = finalizeResearch({ ...base, receipts: [survey, emptySearch, repeatScout, study] }, options);
    expect(unexplained.status).toBe("not_ready");
    expect(unexplained.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(/^Discovery found 3 video\(s\) but none is in material_video_ids/u)]);
    const explained = finalizeResearch({
      ...base,
      receipts: [survey, emptySearch, repeatScout, study],
      no_material_video_reason: "All three are product advertisements with comments disabled."
    }, options);
    expect(explained.status).toBe("ready_with_limits");
    expect(explained.limits).toEqual([
      "None of the 3 video(s) found in 3 discovery rounds was worth auditing; say that YouTube evidence on this is thin.",
      FORUM_LIMIT,
      OFFER_LIMIT
    ]);
  });

  it("requires missing-video caveats only when no verified audit shows comments read", () => {
    const base = {
      community_evidence: "researched", treatment_choice: "not_compared", research_target: TARGET,
      material_video_ids: [], no_material_video_reason: "The discovered videos do not match the exact routine.",
      key_sources: [{ read_depth: "full_text_audited", answer_marker: "Study", id: "10.1002/art.41142", status: "validated" }]
    };
    const single = sign("youtube_survey", { access: "complete", videos: ["aaaaaaaaaaa"], q: "single" }, options);
    const empty = sign("youtube_survey", { access: "complete", videos: [], q: "none" }, options);
    const noComments = sign("youtube_video_audit", {
      video: "aaaaaaaaaaa", state: "api_visible_complete", lock: "pass", records: 0
    }, options);
    const communityAudit = sign("youtube_community_audit", {
      videos: ["aaaaaaaaaaa"], read: ["aaaaaaaaaaa"], q: "comments"
    }, options);
    for (const discovery of [[single, emptySearch], [survey, emptySearch, repeatScout], [empty, emptySearch]]) {
      const without = finalizeResearch({ ...base, receipts: [...discovery, study] }, options);
      expect(without.caveats.join(" ")).toContain("YouTube evidence on this is thin.");
      for (const receipt of [videoA, communityAudit]) {
        const withComments = finalizeResearch({ ...base, receipts: [...discovery, receipt, study] }, options);
        expect(withComments.status).toBe("ready_with_limits");
        expect(withComments.caveats.join(" ")).not.toContain("YouTube evidence on this is thin");
        expect(withComments.caveats.join(" ")).not.toContain("evidence could not be checked yet");
      }
    }
    for (const receipt of [noComments, `${videoA}changed`]) {
      expect(finalizeResearch({ ...base, receipts: [single, emptySearch, receipt, study] }, options).caveats)
        .toContain("The only video found was not worth a close look, so YouTube evidence on this is thin.");
    }
  });

  it("counts the candidates a scout left to the model's judgment as found by its round", () => {
    // A scout candidate whose YouTube title is not the scout's, or one of YouTube's closest results for a title the
    // scout named, is the model's to judge; the scout receipt signs those IDs (`alt`), and auditing one is that
    // judgment (review of 62cefa2: the scout told the model to audit them, and the gate then refused them).
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const judgedScout = sign("youtube_scout", { videos: [], alt: ["fffffffffff", "hhhhhhhhhhh"], open: 0, q: "k1k1k1k1k1k1" }, options);
    const videoF = sign("youtube_video_audit", {
      video: "fffffffffff", state: "api_visible_complete", lock: "pass", records: 60
    }, options);
    const audited = finalizeResearch({
      ...base, receipts: [survey, emptySearch, judgedScout, videoF, study], material_video_ids: ["fffffffffff"]
    }, options);
    expect(audited.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toMatch(/is not among the videos found/u);
    expect(audited.community.material_videos).toEqual(["fffffffffff"]);
    // Rounds whose candidates were all left to judgment found videos: unaudited, the model says why, and the answer
    // does not say that none turned up.
    const secondJudged = sign("youtube_scout", { videos: [], alt: ["iiiiiiiiiii"], open: 0, q: "l2l2l2l2l2l2" }, options);
    const unaudited = finalizeResearch({ ...base, receipts: [judgedScout, secondJudged, study] }, options);
    expect(unaudited.caveats.join(" ")).not.toMatch(/No relevant video turned up/u);
    expect(unaudited.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(/^Discovery found 3 video\(s\) but none is in material_video_ids/u)]);
    // An ID no receipt signed is still refused.
    const videoG = sign("youtube_video_audit", {
      video: "ggggggggggg", state: "api_visible_complete", lock: "pass", records: 60
    }, options);
    expect(finalizeResearch({
      ...base, receipts: [survey, emptySearch, judgedScout, videoG, study], material_video_ids: ["ggggggggggg"]
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toMatch(/Video ggggggggggg is not among the videos found/u);
  });

  it("counts a video the person gave, which Gemini read, as found, but not as a discovery round", () => {
    // "Check this video" (AskRigor#248): the person's own video is audited for comments like any material video.
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const reading = sign("youtube_video_claims", { video: "ggggggggggg", mode: "claims", n: 4 }, options);
    const videoG = sign("youtube_video_audit", {
      video: "ggggggggggg", state: "api_visible_complete", lock: "pass", records: 60
    }, options);
    const audited = finalizeResearch({
      ...base, receipts: [survey, emptySearch, reading, videoG, study], material_video_ids: ["ggggggggggg"]
    }, options);
    expect(audited.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toMatch(/is not among the videos found/u);
    expect(audited.community.material_videos).toEqual(["ggggggggggg"]);
    // Reading the video does not replace community discovery.
    expect(finalizeResearch({
      ...base, receipts: [reading, videoG, study], material_video_ids: ["ggggggggggg"]
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toMatch(/^Find community videos with scout_gemini_youtube_candidates/u);
  });

  it("counts a video the person gave that Gemini could not read as found too, and says it was not watched", () => {
    // AskRigor#359: its comments can still be audited, and the answer says the video itself was not watched.
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
    };
    const notRead = sign("youtube_video_unread", { video: "ggggggggggg", code: "gemini_video_not_completed" }, options);
    const videoG = sign("youtube_video_audit", {
      video: "ggggggggggg", state: "api_visible_complete", lock: "pass", records: 60
    }, options);
    const audited = finalizeResearch({
      ...base, receipts: [survey, emptySearch, notRead, videoG, study], material_video_ids: ["ggggggggggg"]
    }, options);
    expect(audited.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toMatch(/is not among the videos found/u);
    expect(audited.community.material_videos).toEqual(["ggggggggggg"]);
    expect(audited.caveats).toContain("I could not watch [this video](https://www.youtube.com/watch?v=ggggggggggg), so " +
      "what this answer says about it comes only from its title and description.");
    // It is no discovery round either.
    expect(finalizeResearch({
      ...base, receipts: [notRead, videoG, study], material_video_ids: ["ggggggggggg"]
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toMatch(/^Find community videos with scout_gemini_youtube_candidates/u);
  });

  it("lists rejected receipts and skips community research only on one of HRP's bases, with a reason", () => {
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
    // One step for each rejected receipt, with its own way out (UDA lane item
    // 2026-10-12-finalizer-bounded-completion-and-receipt-diagnostics), then the declaration the skip needs.
    const receiptSteps = result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
    expect(receiptSteps).toHaveLength(3);
    expect(receiptSteps.slice(0, 2)).toEqual([REJECTED_RECEIPT_STEPS.signature_invalid(0), REJECTED_RECEIPT_STEPS.malformed(1)]);

    // HRP ForumSignalNonTrigger: nonactivation is affirmative, for a question with no real-world outcome or an
    // emergency before triage. A question whether smelling geosmin helps is neither (owner report, 2026-09-30).
    const skipStep = "Community evidence is not_relevant only for a definition, calculation, or chemical or mechanistic " +
      "question with no real-world outcome (not_relevant_basis no_real_world_outcome) or an emergency before triage " +
      "(emergency_before_triage), with not_relevant_reason. Otherwise research it: name where people discussing this " +
      "talk in principal_communities and search the dominant one and an independent one (YouTube with " +
      "scout_gemini_youtube_candidates and audit_youtube_video_community, the others with your web search); a topic " +
      "nobody discusses is searched and its access boundary recorded.";
    expect(finalizeResearch({
      receipts: [study], community_evidence: "not_relevant", treatment_choice: "not_compared", research_target: TARGET,
      not_relevant_reason: "The user asked about studies of smelling geosmin, not about experiences.",
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }]
    }, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(skipStep);
    const reasoned = finalizeResearch({
      receipts: [study],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome",
      treatment_choice: "not_compared",
      research_target: TARGET,
      not_relevant_reason: "Dose conversion question with no treatment choice.",
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }]
    }, options);
    // Its limits are the skipped community search, which the answer states with the reason (owner question 125), and
    // the first pass's offer of a deeper study review.
    expect(reasoned).toMatchObject({ status: "ready_with_limits", limits: [COMMUNITY_SKIP_LIMIT, offerLimit(false)] });
    expect(finalizeResearch({
      receipts: [study], community_evidence: "not_relevant", treatment_choice: "not_compared", research_target: TARGET,
      not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "Dose conversion question with no treatment choice.", research_depth: "deep",
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }]
    }, options)).toMatchObject({ status: "ready_with_limits", limits: [COMMUNITY_SKIP_LIMIT] });
  });

  it("gives each receipt that fails verification its own reason and way out, without repeating it", () => {
    const hours = (count: number) => () => new Date(now().getTime() - count * 60 * 60 * 1000);
    const claims = { id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields" };
    const cases = {
      signature_invalid: `${study.slice(0, -2)}xx`,
      malformed: study.split("~").slice(0, 3).join("~"),
      expired: issueResearchReceipt("study_audit", claims, { secret: SECRET, now: hours(25) }),
      // Signed here, but of a kind this server does not know, as from another version of AskRigor.
      unknown_kind: issueResearchReceipt("retired_kind" as Parameters<typeof issueResearchReceipt>[0], claims, options)
    } as const;
    const deep = {
      community_evidence: "not_relevant" as const, not_relevant_basis: "no_real_world_outcome" as const,
      not_relevant_reason: "A question about one lab value.", treatment_choice: "not_compared" as const,
      research_target: TARGET, research_depth: "deep" as const, key_sources: [],
      answer_draft: "One lab value is explained. No study's methods were checked in full text for this answer."
    };
    for (const [reason, token] of Object.entries(cases) as Array<[keyof typeof cases, string]>) {
      // The rejected receipt comes after a valid one, so its step names its own place in receipts.
      const result = finalizeResearch({ ...deep, receipts: [study, token] }, options);
      expect(result.status, reason).toBe("not_ready");
      expect(result.receipts_rejected, reason).toEqual([{ index: 1, reason }]);
      expect(result.receipts_verified, reason).toBe(2);
      const steps = result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);
      expect(steps, reason).toEqual([REJECTED_RECEIPT_STEPS[reason](1)]);
      // Nothing of the receipt or the signing secret is repeated.
      for (const part of [token, ...token.split("~").filter((piece) => piece.length >= 8)]) {
        expect(steps.join("\n"), reason).not.toContain(part);
      }
      expect(steps.join("\n"), reason).not.toContain(SECRET);
    }
    // Every rejected receipt gets its own step, in the order passed.
    const all = finalizeResearch({ ...deep, receipts: Object.values(cases) }, options);
    expect(all.receipts_rejected).toEqual(Object.keys(cases).map((reason, index) => ({ index, reason })));
    expect(all.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual((Object.keys(cases) as Array<keyof typeof cases>).map((reason, index) => REJECTED_RECEIPT_STEPS[reason](index)));
    // Leaving the rejected receipts out is allowed: without them the answer passes.
    expect(finalizeResearch({ ...deep, receipts: [study] }, options).next_steps).toEqual([]);
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
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }]
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
    expect(reused.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("3 discovery receipt(s) passed here were made for another research target");
    expect(reused.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("Video aaaaaaaaaaa was found only by discovery for another research target");

    // A search run without a research target does not count either.
    const untargeted = sign("youtube_search", { videos: [], q: "n1n1n1n1n1n1", target: undefined }, options);
    const withUntargeted = finalizeResearch({
      ...base, research_target: TARGET, receipts: [survey, emptySearch, repeatScout, untargeted, videoA, study]
    }, options);
    expect(withUntargeted.receipts_rejected).toEqual([{ index: 3, reason: "no_research_target" }]);
    expect(withUntargeted.community.discovery_rounds).toBe(3);
    expect(withUntargeted.status).toBe("ready_with_limits");

    // Case and spacing do not change the target.
    expect(finalizeResearch({
      ...base, research_target: `  ${TARGET.toUpperCase()} `, receipts: [survey, emptySearch, repeatScout, videoA, study]
    }, options).status).toBe("ready_with_limits");
  });

  it("orders rounds by their signed issue order, not by the caller", () => {
    const base = {
      community_evidence: "researched" as const, treatment_choice: "not_compared" as const, research_target: TARGET,
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1002/art.41142", status: "validated" as const }], research_depth: "deep" as const
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
    expect(reordered.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(/^Discovery has not saturated: fffffffffff first turned up/u)]);

    // Rounds the signed order cannot separate all count as recent.
    const tied = inSecond("p4p4p4p4p4p4", [], second + 300);
    const withTie = finalizeResearch({ ...base, receipts: [survey, empty1, finder, tied, videoA, videoF, study] }, options);
    expect(withTie.community.saturated).toBe(false);
    expect(withTie.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([expect.stringMatching(/^Discovery has not saturated: fffffffffff/u)]);
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

// Owner decisions Q9 to Q11 (2026-09-30): the final gate checks a findings card. A free contributor's answer
// needs one, and a checked card is signed into the receipt for the library to save; a rejected card is never
// saved and never holds the answer back. Nothing is offered to the user, and other research is private.
describe("findings card at the final gate", () => {
  // A free contributor's answer; a closed library and private research are tested last.
  const options = { secret: SECRET, now, findings: "save" as const };
  const closedOptions = { secret: SECRET, now };
  const READY = {
    receipts: [survey, emptySearch, repeatScout, videoA, study],
    community_evidence: "researched",
    treatment_choice: "not_compared",
    research_target: TARGET,
    key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "https://doi.org/10.1002/ART.41142", status: "validated" }]
  };
  const CARD = {
    question: "Does exercise therapy help adults with hip osteoarthritis avoid a joint replacement?",
    usual_answer: "Exercise may help a little, but most people end up needing a replacement.",
    findings: [{
      claim: "Exercise therapy has the strongest evidence among the options for hip osteoarthritis.",
      certainty: "moderate",
      applies_to: "Adults with hip osteoarthritis considering surgery",
      answer_quote: "Exercise therapy has the strongest evidence for hip osteoarthritis.",
      sources: ["10.1002/art.41142", "aaaaaaaaaaa"],
      why_not_usual: "Quick answers treat exercise as a stopgap.",
      tags: ["full_text_read", "community_checked"],
      what_would_change_it: "A large trial finding no benefit over usual care.",
      // Atlas phase 3: what the pages need; the claim gives no two-group figure.
      kind: "effect",
      subject: "Exercise therapy",
      subject_type: "practice",
      direction: "benefit",
      numbers: []
    }],
    public_value: {
      scope: "public",
      who_else: "Adults with hip osteoarthritis considering surgery",
      what_it_changes: "Exercise therapy becomes a first option with real evidence."
    },
    topic: { key: "hip-osteoarthritis", label: "Hip osteoarthritis" }
  };
  const withFinding = (overrides: Record<string, unknown>) => ({ ...CARD, findings: [{ ...CARD.findings[0], ...overrides }] });
  const signedClaim = (claim: string) => (receipt: string | undefined) => {
    const verified = verifyResearchReceipt(receipt!, options);
    return verified.ok ? verified.claims[claim] : "unverified";
  };
  const findingsClaim = signedClaim("findings");
  const basesClaim = signedClaim("bases");
  // The card's one finding cites the study audited here and a video whose 240 comments were read.
  const CARD_OFFER = findingsSaveOffer({ studies: 1, videos: 1, absences: 0, corrections: 0 });

  it("checks a card the answer shows and this call's receipts back, and signs it without offering anything", () => {
    const plain = finalizeResearch(READY, closedOptions);
    const carded = finalizeResearch({ ...READY, findings_card: CARD }, options);
    expect(carded.findings_card).toEqual({ status: "checked", problems: [], beyond_quick_answer: 1, public_value: "public" });
    // The answer's own result is what it would be without the library: no caveat offers a save.
    expect(carded.status).toBe("ready_with_limits");
    expect(carded.status).toBe(plain.status);
    expect(carded.limits).toEqual(plain.limits);
    expect(carded.caveats).toEqual(plain.caveats);
    expect(findingsClaim(carded.finalization_receipt)).toBe(findingsCardDigest(findingsCardSchema.parse(CARD)));
    // Each finding's work beyond a quick answer is signed with the card, for the library to stamp (owner answer 139c).
    expect(basesClaim(carded.finalization_receipt)).toEqual(["full_text_audit.comment_audit"]);
    expect(findingsClaim(plain.finalization_receipt)).toBeUndefined();
    expect(basesClaim(plain.finalization_receipt)).toBeUndefined();
  });

  // Owner answer 139c (2026-10-20): what a quick answer can't do, derived exactly from the call's own receipts.
  it("derives each finding's basis from this call's receipts alone: full-text audits and comments read", () => {
    const silent = sign("youtube_video_audit", {
      video: "ccccccccccc", state: "api_visible_complete", lock: "pass", records: 0
    }, options);
    const input = {
      ...READY,
      receipts: [...READY.receipts, silent, lead],
      key_sources: [...READY.key_sources,
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "lead_only" }]
    };
    const finding = (sources: string[]) => ({ ...CARD.findings[0], sources, tags: [] });
    const card = { ...CARD, findings: [
      finding(["10.1002/art.41142"]),
      finding(["aaaaaaaaaaa"]),
      // A lead was not read in full text, and a video whose audit found no comments had none read.
      finding(["10.1016/j.joca.2020.01.001"]),
      finding(["ccccccccccc"]),
      finding(["10.1016/j.joca.2020.01.001", "aaaaaaaaaaa", "10.1002/art.41142"])
    ] };
    const result = finalizeResearch({ ...input, findings_card: card }, options);
    expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(result.findings_card).toEqual({ status: "checked", problems: [], beyond_quick_answer: 3, public_value: "public" });
    expect(basesClaim(result.finalization_receipt)).toEqual([
      "full_text_audit", "comment_audit", "none", "none", "full_text_audit.comment_audit"
    ]);
    // A tag is still the model's declaration, and a basis does not depend on it.
    expect(finalizeResearch({ ...input, findings_card: withFinding({ tags: [] }) }, options).findings_card)
      .toMatchObject({ status: "checked", beyond_quick_answer: 1 });
  });

  it("derives a checked absence claim or the research's own correction as a basis, in the answer's language", () => {
    const absenceQuery = "médicament élimination enfant";
    const pubmedSearch = sign("literature_search", { src: "pubmed", q: discoveryQueryDigest([absenceQuery]), ret: 0, n: 0 },
      options);
    const base = {
      receipts: [study, lead, pubmedSearch],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
      treatment_choice: "not_compared",
      research_target: TARGET,
      research_depth: "deep",
      answer_language: "fr",
      key_sources: [
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" },
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "lead_only" }
      ]
    };
    // A study read only as a lead is verified for a card, but not read in full text.
    const LEAD = ["10.1016/j.joca.2020.01.001"];
    // The answer's sentences, and the same sentences as the declarations copy them, with other quotation marks.
    const absent = "Aucune étude n’a mesuré cet effet chez l’enfant.";
    const corrected = "Le foie élimine ce médicament en quelques heures, et non en quelques jours.";
    const finding = (answer_quote: string) => ({ ...CARD.findings[0], answer_quote, sources: ["10.1000/never-read"], tags: [] });
    const declarations = {
      absence_claims: [{ quote: "Aucune étude n'a mesuré cet effet chez l'enfant", state: "support_not_located" }],
      corrections: [{ retracted: "Le foie élimine ce médicament en quelques jours.", change: corrected, by_user: false }]
    };
    // Atlas phase 3 (review finding 3): a sentence the answer declares only as not found is a search that found
    // nothing, with the search it made.
    const notFound = { kind: "nothing_found", direction: "descriptive", searches: [{ database: "pubmed", query: absenceQuery }] };
    const check = (overrides: Record<string, unknown>, sources = ["PMC10518852"]) => {
      const card = { ...CARD, findings: [{ ...finding(absent), sources, ...notFound }, { ...finding(corrected), sources }] };
      const draft = `${absent} ${corrected}`;
      const first = finalizeResearchRaw({ ...base, ...declarations, findings_card: card, answer_draft: draft, ...overrides }, options);
      return finalizeResearchRaw({
        ...base, ...declarations, findings_card: card, answer_draft: [draft, ...first.caveats].join("\n\n"), ...overrides
      }, options);
    };
    const both = check({});
    expect(both).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(basesClaim(both.finalization_receipt)).toEqual(["full_text_audit.bounded_absence", "full_text_audit.research_correction"]);
    // A correction the user pointed out is not the research's own, and what the searches did not find counts only
    // once it is bounded to searches passed here.
    const userCorrected = check({ corrections: [{ ...declarations.corrections[0], by_user: true }] }, LEAD);
    expect(userCorrected.findings_card).toMatchObject({ status: "checked", beyond_quick_answer: 1 });
    // With no search passed here, the search that found nothing is not bound to one, so the card is not saved (before
    // the Atlas fields, it was saved without the bounded_absence basis).
    const unsearched = check({ receipts: [study, lead] }, LEAD);
    expect(unsearched.status).toBe("not_ready");
    expect(unsearched.findings_card).toMatchObject({ status: "rejected",
      problems: [expect.stringContaining("findings_card.findings[0].searches[0] is not a search passed here")] });
    const leadsOnly = check({}, LEAD);
    expect(basesClaim(leadsOnly.finalization_receipt)).toEqual(["bounded_absence", "research_correction"]);
  });

  it("does not ask for a card when the answer cites no study or audited video (2026-10-15 owner regressions)", () => {
    const sourceFree = finalizeResearch({ ...READY, receipts: [], key_sources: [] }, options);
    expect(sourceFree.next_steps.some((step) => step.startsWith("Give findings_card"))).toBe(false);
    expect(sourceFree.findings_card).toEqual({ status: "absent", problems: [] });
    // A study whose method audit ran here can be cited, even when it is not a key source.
    const auditedOnly = finalizeResearch({ ...READY, receipts: [study], key_sources: [] }, options);
    expect(auditedOnly.next_steps.some((step) => step.startsWith("Give findings_card"))).toBe(true);
  });

  it("leads a phone's caveats with the owner's mobile notice, without changing the result (2026-10-15)", () => {
    const desktop = finalizeResearch(READY, closedOptions);
    const phoneOptions = { ...closedOptions, mobileClient: true };
    const phone = finalizeResearch(READY, phoneOptions);
    expect(desktop.status).toBe("ready_with_limits");
    expect(phone.caveats).toEqual([MOBILE_NOTICE, ...desktop.caveats]);
    expect(phone).toMatchObject({ status: desktop.status, limits: desktop.limits, next_steps: [] });
    // The answer carries the notice like any caveat: without it, the check sends the answer back.
    const draft = [CLEAN_DRAFT, ...desktop.caveats].join(" ");
    const missing = finalizeResearch({ ...READY, answer_draft: draft }, phoneOptions);
    expect(missing.status).toBe("not_ready");
    expect(missing.next_steps.join(" ")).toContain(MOBILE_NOTICE);
    expect(finalizeResearch({ ...READY, answer_draft: `${MOBILE_NOTICE}\n\n${draft}` }, phoneOptions).status)
      .toBe(desktop.status);
  });

  it("needs a card with a free contributor's answer", () => {
    const missing = finalizeResearch(READY, options);
    expect(missing).toMatchObject({
      status: "not_ready",
      next_steps: [expect.stringMatching(/^Give findings_card with answer_draft: this account's research is saved to AskRigor's findings library/u), TOOL_LIST_REFRESH_HINT],
      findings_card: { status: "absent", problems: [] }
    });
    // Owner answer 156a: the step asks for the declaration with the card.
    expect(missing.next_steps[0]).toBe("Give findings_card with answer_draft: this account's research is saved to " +
      "AskRigor's findings library for the owner's review. Put in the answer's best findings, none the user corrected, " +
      "and no personal details, and say in public_value whether they would help anyone beyond this person. A public " +
      "card also gives its topic, and each finding its kind, subject, subject_type, direction, numbers (for an " +
      "effect, harm or overlooked_option) and searches (for nothing_found), as the findings description says.");
    expect(missing.finalization_receipt).toBeUndefined();
    // The card is asked for with the answer, not before it.
    expect(finalizeResearchRaw(READY, options).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).some((step) => step.startsWith("Give findings_card"))).toBe(false);
  });

  it("leaves the answer's status alone when the card has problems, and does not sign it", () => {
    const plain = finalizeResearch(READY, closedOptions);
    const cases: Array<[Record<string, unknown>, string]> = [
      [withFinding({ answer_quote: "Exercise cures hip osteoarthritis." }),
        "findings_card.findings[0].answer_quote gives text the answer does not show"],
      // Video IDs are case-sensitive; a trial registration has no receipt of its own here.
      [withFinding({ sources: ["10.1000/never-read", "NCT01234567", "AAAAAAAAAAA"], tags: [] }),
        "findings_card.findings[0].sources lists 10.1000/never-read, NCT01234567, AAAAAAAAAAA, which this call did not verify"],
      [withFinding({ sources: ["aaaaaaaaaaa"], tags: ["full_text_read"] }),
        "findings_card.findings[0] is tagged full_text_read, but none of its sources was read with a full-text method audit here."],
      [withFinding({ sources: ["10.1002/art.41142"], tags: ["community_checked"] }),
        "findings_card.findings[0] is tagged community_checked, but none of its sources is a video whose comments were audited here."],
      [withFinding({ tags: ["overlooked_study", "overlooked_study"] }), "findings_card.findings[0].tags lists a tag more than once."],
      [{ ...CARD, open_leads: ["Call the clinic on 555-123-4567 first."] },
        "findings_card.open_leads[0] looks like it holds contact details, an address or a number shaped like a phone number"],
      // Owner answer 156a (2026-10-22): a card says whom its findings would help. Without it, as from an app whose tool
      // list predates the field, the card is reported like any other problem and the answer goes ahead.
      [{ ...CARD, public_value: undefined },
        "findings_card.public_value is missing: say whether these findings would help other people, as " +
          '{"scope":"public","who_else":"…","what_it_changes":"…"}, or only this person, as {"scope":"personal_only"}. ' +
          "Without it the card is not saved or offered."],
      [{ ...CARD, public_value: { scope: "public", what_it_changes: CARD.public_value.what_it_changes } },
        "findings_card.public_value.who_else is missing: with scope public, say who else faces these findings, in " +
          "general terms."],
      [{ ...CARD, public_value: { scope: "public", who_else: CARD.public_value.who_else } },
        "findings_card.public_value.what_it_changes is missing: with scope public, say what these findings could " +
          "change in what those people do or believe."],
      [{ ...CARD, public_value: { ...CARD.public_value, who_else: "I was diagnosed with hip osteoarthritis last year." } },
        "findings_card.public_value.who_else looks like it holds a first-person health story, or a personal age or date"]
    ];
    for (const offered of [false, true]) {
      const gateOptions = offered ? { secret: SECRET, now, findings: "offer" as const } : options;
      for (const [card, problem] of cases) {
        const result = finalizeResearch({ ...READY, findings_card: card }, gateOptions);
        expect(result.findings_card).toEqual({ status: "rejected", problems: [expect.stringContaining(problem)] });
        expect(result.status).toBe(plain.status);
        expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual(plain.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT));
        expect(result.limits).toEqual(plain.limits);
        // A paid private answer offers no save for a rejected card either.
        expect(result.caveats).toEqual(plain.caveats);
        expect(findingsClaim(result.finalization_receipt)).toBeUndefined();
      }
    }
  });

  // Owner answer 156a (2026-10-22): "personal-only findings are neither saved for the Atlas nor offered". The card is
  // checked and signed like any other, so a save asked for anyway is refused by the declaration the check signed.
  it("checks and signs a card declared personal only, and a paid private answer offers no save for it", () => {
    const offerOptions = { secret: SECRET, now, findings: "offer" as const };
    const personal = { ...CARD, public_value: { scope: "personal_only" } };
    const plain = finalizeResearch(READY, closedOptions);
    for (const gateOptions of [options, offerOptions]) {
      const result = finalizeResearch({ ...READY, findings_card: personal }, gateOptions);
      expect(result).toMatchObject({ status: plain.status, next_steps: plain.next_steps, limits: plain.limits });
      expect(result.findings_card).toEqual({
        status: "checked", problems: [], beyond_quick_answer: 1, public_value: "personal_only"
      });
      expect(result.caveats).toEqual(plain.caveats);
      expect(findingsClaim(result.finalization_receipt)).toBe(findingsCardDigest(findingsCardSchema.parse(personal)));
    }
    // The same findings declared public are offered, with what they rest on.
    expect(finalizeResearch({ ...READY, findings_card: CARD }, offerOptions).caveats).toEqual([...plain.caveats, CARD_OFFER]);
    // With personal_only, who_else and what_it_changes are not used: the card still checks, and is still not offered.
    const explained = { ...CARD, public_value: { ...CARD.public_value, scope: "personal_only" } };
    expect(finalizeResearch({ ...READY, findings_card: explained }, offerOptions)).toMatchObject({
      caveats: plain.caveats, findings_card: { status: "checked", public_value: "personal_only" }
    });
  });

  // On the connector the offer's one sentence also asks to file this research's map (owner answer 143a), so with no
  // offer for a personal-only card there is no map offer either, as for a card with no work beyond a quick answer.
  it("offers no research map with a personal-only card, since the map is asked for only in the card's offer", () => {
    const mapOptions = { secret: SECRET, now, findings: "offer" as const, researchMap: { mode: "offer" as const, account: "acct0123456789ab" } };
    const plain = finalizeResearch(READY, closedOptions);
    const offered = finalizeResearch({ ...READY, findings_card: CARD }, mapOptions);
    expect(offered).toMatchObject({ research_map: { status: "offered" } });
    expect(offered.caveats).toEqual([...plain.caveats, findingsAndMapSaveOffer({ studies: 1, videos: 1, absences: 0, corrections: 0 })]);
    expect(signedClaim("map")(offered.finalization_receipt)).toBe("offered");
    const personal = finalizeResearch({ ...READY, findings_card: { ...CARD, public_value: { scope: "personal_only" } } }, mapOptions);
    expect(personal).not.toHaveProperty("research_map");
    expect(personal.caveats).toEqual(plain.caveats);
    expect(signedClaim("map")(personal.finalization_receipt)).toBeUndefined();
  });

  it("counts a lead as verified but not as read in full text, and a PMID by its PubMed DOI", () => {
    const pubmed = sign("pubmed_record", { pmid: "31999999", doi: "10.1002/art.41142" }, options);
    const withLead = {
      ...READY,
      receipts: [...READY.receipts, lead, pubmed],
      key_sources: [...READY.key_sources, { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "lead_only" }]
    };
    expect(finalizeResearch({
      ...withLead, findings_card: withFinding({ sources: ["10.1016/J.JOCA.2020.01.001", "PMID: 31999999"], tags: ["full_text_read"] })
    }, options).findings_card).toEqual({ status: "checked", problems: [], beyond_quick_answer: 1, public_value: "public" });
    expect(finalizeResearch({
      ...withLead, findings_card: withFinding({ sources: ["10.1016/j.joca.2020.01.001"], tags: ["full_text_read"] })
    }, options).findings_card.problems).toEqual([expect.stringContaining("is tagged full_text_read")]);
  });

  it("checks a card in the answer's own language, with no rendering asked of it", () => {
    const base = {
      receipts: [study],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
      treatment_choice: "not_compared",
      research_target: TARGET,
      research_depth: "deep",
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }]
    };
    const quote = "Le foie élimine ce médicament en quelques heures.";
    const card = withFinding({ answer_quote: quote, sources: ["PMC10518852"], tags: ["full_text_read"] });
    const french = finalizeResearch({ ...base, findings_card: card, answer_draft: quote, answer_language: "fr" }, options);
    // Its one limit and caveat are the skipped community search, which the fixture states (owner question 125).
    expect(french).toMatchObject({
      status: "ready_with_limits", next_steps: [], limits: [COMMUNITY_SKIP_LIMIT],
      caveats: [communitySkipCaveat(base.not_relevant_reason)], findings_card: { status: "checked" }
    });
    expect(findingsClaim(french.finalization_receipt)).toBe(findingsCardDigest(findingsCardSchema.parse(card)));
  });

  it("checks a card only with the answer, on a server that can verify receipts", () => {
    expect(finalizeResearchRaw({ ...READY, findings_card: CARD }, options).findings_card).toEqual({
      status: "rejected",
      problems: ["A findings card is checked against the answer: pass answer_draft with it."]
    });
    const unverifiable = finalizeResearchBare({ intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient product is involved." }, ...READY, findings_card: CARD }, { secret: undefined, findings: "save" });
    expect(unverifiable.status).toBe("receipts_unavailable");
    expect(unverifiable.findings_card).toEqual({
      status: "rejected",
      problems: ["This AskRigor server cannot verify research receipts, so it cannot check or save a findings card."]
    });
    expect(finalizeResearchBare({ intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient product is involved." }, ...READY }, { secret: undefined }).findings_card).toEqual({ status: "absent", problems: [] });
  });

  it("while the library is closed, needs no card and checks none", () => {
    const closed = finalizeResearch({ ...READY, findings_card: CARD }, closedOptions);
    expect(closed.findings_card).toEqual({
      status: "closed",
      problems: ["AskRigor's findings library is not open yet, so the card was not checked or saved."]
    });
    expect(closed.caveats.some((caveat) => caveat.includes("findings library"))).toBe(false);
    expect(findingsClaim(closed.finalization_receipt)).toBeUndefined();
    expect(finalizeResearch(READY, closedOptions)).toMatchObject({ status: "ready_with_limits", findings_card: { status: "absent" } });
  });

  // A paid private account: the answer offers the save, which waits for the user's yes.
  it("offers a paid private answer's checked card and signs it only once the answer carries the offer", () => {
    const offerOptions = { secret: SECRET, now, findings: "offer" as const };
    const plain = finalizeResearch(READY, closedOptions);
    const carded = finalizeResearch({ ...READY, findings_card: CARD }, offerOptions);
    expect(carded.findings_card).toEqual({ status: "checked", problems: [], beyond_quick_answer: 1, public_value: "public" });
    // The offer names what was done, with this call's counts (owner answer 139c), and ends with the sentence on the
    // public Atlas (owner answers 159 and 160b).
    expect(CARD_OFFER).toBe("These findings rest on a full-text audit of 1 study and audited comments on 1 video, " +
      `work a quick answer does not do. ${FINDINGS_SAVE_OFFER} ${FINDINGS_ATLAS_SENTENCE}`);
    expect(carded.caveats).toEqual([...plain.caveats, CARD_OFFER]);
    expect(findingsClaim(carded.finalization_receipt)).toBe(findingsCardDigest(findingsCardSchema.parse(CARD)));

    const draft = [CLEAN_DRAFT, ...plain.caveats].join(" ");
    const missing = finalizeResearch({ ...READY, findings_card: CARD, answer_draft: draft }, offerOptions);
    expect(missing).toMatchObject({ status: "not_ready", next_steps: [leftOut(CARD_OFFER)] });
    expect(missing.finalization_receipt).toBeUndefined();
    const stated = finalizeResearch(
      { ...READY, findings_card: CARD, answer_draft: `${draft} ${CARD_OFFER}` }, offerOptions
    );
    expect(stated).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(findingsClaim(stated.finalization_receipt)).toBe(findingsCardDigest(findingsCardSchema.parse(CARD)));

    // The answer needs a card; a rejected one is neither offered nor signed, and holds nothing back.
    expect(finalizeResearch(READY, offerOptions)).toMatchObject({
      status: "not_ready",
      next_steps: [expect.stringMatching(/^Give findings_card with answer_draft: the answer offers to save its findings/u), TOOL_LIST_REFRESH_HINT]
    });
    const rejected = finalizeResearch({ ...READY, findings_card: withFinding({ answer_quote: "Not in the answer." }) }, offerOptions);
    expect(rejected).toMatchObject({ status: "ready_with_limits", findings_card: { status: "rejected" } });
    expect(rejected.caveats).toEqual(plain.caveats);
    expect(findingsClaim(rejected.finalization_receipt)).toBeUndefined();
  });

  it("offers a paid private save only when a finding rests on work a quick answer can't do, counting each paper once", () => {
    const offerOptions = { secret: SECRET, now, findings: "offer" as const };
    const pubmed = sign("pubmed_record", { pmid: "31999999", doi: "10.1002/art.41142" }, options);
    const input = {
      ...READY,
      receipts: [...READY.receipts, lead, pubmed, videoB],
      material_video_ids: ["aaaaaaaaaaa", "bbbbbbbbbbb"],
      key_sources: [...READY.key_sources,
        { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1016/j.joca.2020.01.001", status: "lead_only" }]
    };
    const plain = finalizeResearch(input, closedOptions);
    // A card resting on a lead alone has no offer line; its receipt still signs it, so the user can still ask.
    const leadOnly = finalizeResearch({ ...input, findings_card: withFinding({ sources: ["10.1016/j.joca.2020.01.001"], tags: [] }) }, offerOptions);
    expect(leadOnly).toMatchObject({ status: plain.status, next_steps: [], findings_card: { status: "checked", beyond_quick_answer: 0 } });
    expect(leadOnly.caveats).toEqual(plain.caveats);
    expect(leadOnly.caveats.some((caveat) => caveat.includes(FINDINGS_SAVE_OFFER))).toBe(false);
    expect(basesClaim(leadOnly.finalization_receipt)).toEqual(["none"]);
    expect(findingsClaim(leadOnly.finalization_receipt)).toBe(findingsCardDigest(findingsCardSchema.parse(
      withFinding({ sources: ["10.1016/j.joca.2020.01.001"], tags: [] }))));
    // One paper cited by its DOI in one finding and by its PMID in another is one study; two videos are two.
    const card = { ...CARD, findings: [
      { ...CARD.findings[0], sources: ["https://doi.org/10.1002/ART.41142", "aaaaaaaaaaa"] },
      { ...CARD.findings[0], sources: ["PMID: 31999999", "bbbbbbbbbbb"], tags: [] }
    ] };
    const offer = findingsSaveOffer({ studies: 1, videos: 2, absences: 0, corrections: 0 });
    expect(offer).toBe("These findings rest on a full-text audit of 1 study and audited comments on 2 videos, work a " +
      `quick answer does not do. ${FINDINGS_SAVE_OFFER} ${FINDINGS_ATLAS_SENTENCE}`);
    const counted = finalizeResearch({ ...input, findings_card: card }, offerOptions);
    expect(counted).toMatchObject({ status: plain.status, next_steps: [], findings_card: { status: "checked", beyond_quick_answer: 2 } });
    expect(counted.caveats).toEqual([...plain.caveats, offer]);
    // The owner's example (139c), word for word, then the sentence on the public Atlas (owner answers 159 and 160b),
    // word for word as drafted for the owner's approval.
    expect(findingsSaveOffer({ studies: 2, videos: 3, absences: 0, corrections: 0 })).toBe("These findings rest on " +
      "full-text audits of 2 studies and audited comments on 3 videos, work a quick answer does not do. If you want " +
      "them saved to AskRigor's findings library for review, say yes; nothing is saved otherwise. Saved findings " +
      "that AskRigor's owner accepts may be published in AskRigor's public Atlas, written without you.");
    expect(findingsSaveOffer({ studies: 2, videos: 3, absences: 2, corrections: 1 })).toBe("These findings rest on " +
      "full-text audits of 2 studies, audited comments on 3 videos, 2 checks of what the evidence does not show and a " +
      `correction the research made to an earlier statement, work a quick answer does not do. ${FINDINGS_SAVE_OFFER} ` +
      FINDINGS_ATLAS_SENTENCE);
  });

  // Owner answers 159 (1b and 7) and 160b (2026-10-22): after the offer, with or without the map, one sentence says that
  // saved findings the owner accepts may be published in the public Atlas. The offer's other words are unchanged, and
  // an answer that leaves the sentence out leaves out the caveat.
  it("ends a paid private offer, with or without the map, with the sentence on the public Atlas", () => {
    expect(FINDINGS_ATLAS_SENTENCE).toBe("Saved findings that AskRigor's owner accepts may be published in AskRigor's " +
      "public Atlas, written without you.");
    expect(FINDINGS_SAVE_OFFER).toBe("If you want them saved to AskRigor's findings library for review, say yes; " +
      "nothing is saved otherwise.");
    expect(FINDINGS_AND_MAP_SAVE_OFFER).toBe("If you want them saved to AskRigor's findings library for review, and " +
      "this research's map (the searches, the studies found and the leads left open, never this chat) filed to " +
      "AskRigor's shared research repository for review, say yes; nothing is saved or filed otherwise.");
    const work = { studies: 1, videos: 0, absences: 0, corrections: 0 };
    expect(findingsSaveOffer(work)).toBe("These findings rest on a full-text audit of 1 study, work a quick answer " +
      `does not do. ${FINDINGS_SAVE_OFFER} ${FINDINGS_ATLAS_SENTENCE}`);
    expect(findingsAndMapSaveOffer(work)).toBe("These findings rest on a full-text audit of 1 study, work a quick " +
      `answer does not do. ${FINDINGS_AND_MAP_SAVE_OFFER} ${FINDINGS_ATLAS_SENTENCE}`);

    const offerOptions = { secret: SECRET, now, findings: "offer" as const };
    const plain = finalizeResearch(READY, closedOptions);
    const draft = [CLEAN_DRAFT, ...plain.caveats].join(" ");
    const withoutAtlas = CARD_OFFER.slice(0, -FINDINGS_ATLAS_SENTENCE.length).trim();
    expect(withoutAtlas.endsWith(FINDINGS_SAVE_OFFER)).toBe(true);
    const dropped = finalizeResearch({ ...READY, findings_card: CARD, answer_draft: `${draft} ${withoutAtlas}` }, offerOptions);
    expect(dropped).toMatchObject({ status: "not_ready", next_steps: [leftOut(CARD_OFFER)] });
    expect(dropped.finalization_receipt).toBeUndefined();
    const stated = finalizeResearch({ ...READY, findings_card: CARD, answer_draft: `${draft} ${CARD_OFFER}` }, offerOptions);
    expect(stated).toMatchObject({ status: "ready_with_limits", next_steps: [] });
  });

  it("lets a paid private answer in another language give the offer in that language", () => {
    const base = {
      receipts: [study],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
      treatment_choice: "not_compared",
      research_target: TARGET,
      research_depth: "deep",
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }]
    };
    const offerOptions = { secret: SECRET, now, findings: "offer" as const };
    const quote = "Le foie élimine ce médicament en quelques heures.";
    const english = findingsSaveOffer({ studies: 1, videos: 0, absences: 0, corrections: 0 });
    const offer = "Ces résultats reposent sur l'audit du texte intégral d'une étude, un travail qu'une réponse rapide ne " +
      "fait pas. Si vous voulez enregistrer ces résultats dans la bibliothèque d'AskRigor pour examen, dites oui ; " +
      "rien n'est enregistré sinon. Les résultats enregistrés que le propriétaire d'AskRigor accepte peuvent être " +
      "publiés dans l'Atlas public d'AskRigor, rédigés sans vous.";
    const card = withFinding({ answer_quote: quote, sources: ["PMC10518852"], tags: ["full_text_read"] });
    const translated = finalizeResearch({
      ...base, findings_card: card, answer_draft: `${quote} ${offer}`, answer_language: "fr",
      caveat_renderings: [{ caveat: english, text: offer }]
    }, offerOptions);
    expect(translated).toMatchObject({
      status: "ready_with_limits", next_steps: [], limits: [COMMUNITY_SKIP_LIMIT],
      caveats: [communitySkipCaveat(base.not_relevant_reason), english], findings_card: { status: "checked" }
    });
    expect(finalizeResearch({ ...base, findings_card: card, answer_draft: quote, answer_language: "fr" }, offerOptions).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT))
      .toEqual([leftOut(english)]);
  });

  it("keeps research without a research account private: no card is needed, checked or signed", () => {
    const privateOptions = { secret: SECRET, now, findings: "private" as const };
    for (const input of [READY, { ...READY, findings_card: CARD }]) {
      const result = finalizeResearch(input, privateOptions);
      expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [], findings_card: { status: "private", problems: [] } });
      expect(findingsClaim(result.finalization_receipt)).toBeUndefined();
    }
    expect(finalizeResearchBare({ intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient product is involved." }, ...READY, findings_card: CARD }, { secret: undefined, findings: "private" }).findings_card)
      .toEqual({ status: "private", problems: [] });
  });
});


describe("27 Oct quota-only check regressions", () => {
  const target = "Synthetic community coverage fixture";
  const declaration = { status: "not_applicable", reason: "Synthetic fixture isolates a search limit." };
  const make = (incomplete = 2) => ({
    receipts: [issueResearchReceipt("youtube_search", { target: researchTargetDigest(target),
      access: "rate_limited", videos: [], rl: 2, inc: incomplete, open: 0, q: "synthetic-angle" }, options),
      issueResearchReceipt("study_audit", { id: "10.1000/synthetic", status: "complete_no_unresolved_fields" }, options)],
    research_target: target, research_depth: "deep", treatment_choice: "not_compared", community_evidence: "researched",
    principal_communities: [{ name: "YouTube", platform: "youtube" }, { name: "Example Forum", platform: "forum" }],
    community_searches: [{ community: "Example Forum", platform: "forum", queries: ["synthetic fixture"], threads_read: [],
      access_boundary: "no_web_search", url: "https://forum.example/" }],
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates a search limit." },
    key_sources: [{ id: "10.1000/synthetic", status: "validated", read_depth: "partial_text", answer_marker: "Study" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Study](https://doi.org/10.1000/synthetic) describes the synthetic fixture."
  });
  const checkQuota = (input: ReturnType<typeof make>) => {
    const first = finalizeResearchBare(input, options);
    return finalizeResearchBare({ ...input, answer_draft: input.answer_draft + "\n\n" + first.caveats.join("\n\n") }, options);
  };
  it("s360-studies: a quota rerun as the only open item passes with limits in the same call", () => {
    const result = checkQuota(make());
    expect(result.next_steps).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.stuck_steps).toBeUndefined();
    expect(result.caveats).toContain("YouTube's daily search limit stopped 2 searches in this research; a later turn can rerun them after the limit resets.");
  });
  it("q132: a quota boundary does not hide a transient search failure that can still be retried", () => {
    const result = checkQuota(make(3));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.some((step) => step.startsWith("1 search(es) in the latest discovery rounds did not complete. Rerun them"))).toBe(true);
  });
});
