import { describe, expect, it } from "vitest";

import {
  ATLAS_PUBLICATION_SCHEMA_V2,
  ATLAS_PUBLICATION_SCHEMA_V3,
  InMemoryAtlasPageSource,
  atlasErasedContent,
  atlasVersionContentSchema,
  InMemoryAtlasPublicationStore,
  RESEARCH_USE_NOTICE_VERSION,
  atlasPublishedFindingSchema,
  sha256,
  type AtlasPageFinding,
  type AtlasPagePublication,
  type AtlasPageReads,
  type AtlasPageSource,
  type AtlasPublishedFinding,
} from "@askrigor/evidence-repository";

import { loadAtlasFinding, loadAtlasSearch } from "../apps/research-mcp/src/atlas/page-data.js";
import { atlasSearchQuery } from "../apps/research-mcp/src/atlas/search.js";
import { atlasPageProblems, escapeHtml, renderAtlasFinding } from "../apps/research-mcp/src/atlas/pages.js";

import {
  canonicalResearchOf,
  decidedPublicationDraft,
  planCardPublication,
  publicationHoldReasons,
  researchBehindOf,
  researchKeeping,
} from "../apps/research-mcp/src/atlas/publication.js";
import {
  findingsCardDigest,
  findingsCardSchema,
  laterFindingsCardSchema,
  withoutYouTubeData,
} from "../apps/research-mcp/src/findings/card.js";
import { parseFindingsRecordBody } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import {
  findingBackingFromReceipt,
  findingReadingFromReceipt,
  researchBehindProblems,
  signedBackingClaims,
  signedReadingClaims,
  signedThreadCommunities,
  signedThreadLinks,
  sourceIdKey,
  storedForumSignalOf,
  threadCommunitiesFromReceipt,
  threadLinksFromReceipt,
  type ResearchBehindContext,
} from "../apps/research-mcp/src/findings/research-behind.js";
import {
  forumLinkDigest, forumPublishedLink, forumReadLink, publishedThreadOf, registrableHost, sameThreadAtSite, shownCommunity,
  signedSubreddit,
} from "../apps/research-mcp/src/forum-thread-links.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { unsavedCardCopy } from "../apps/research-mcp/src/findings/unsaved-card.js";
import { FindingsSaveService, type FindingsRecord, type FindingsSaveAccount } from "../apps/research-mcp/src/findings/service.js";
import {
  RESEARCH_BEHIND_NOTE,
  backingRequestsOf,
  communitySkipCaveat,
  finalizeResearch as finalizeResearchUnwrapped,
  forumThreadDigest,
  parseFinalizeResearchInput,
  type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  receiptText,
  verifyResearchReceipt,
} from "../apps/research-mcp/src/research-receipts.js";
import { lookUpSourceLines, sourceLineDocument, type SourceLineDocument } from "../apps/research-mcp/src/source-lines.js";
import { FakeGitHub, storedRecordOf } from "./helpers/fake-github-findings.js";
import { withSourceReading } from "./helpers/source-reading.js";

// The owner, 5 Nov 2026: an answer says beside each key study it cites how it was read, its words copied in
// source_reading. These fixtures isolate other checks, so each call gets the shared helper's reading words.
const finalizeResearch = (...args: Parameters<typeof finalizeResearchUnwrapped>) =>
  finalizeResearchUnwrapped(withSourceReading(args[0], { check: args[1] }), args[1]);

// Owner answer 252a (5 Nov 2026): "we need all the research that backs the interesting finding right there for people
// to inspect", with "the forum signal we found as well for consilience". Plan:
// docs/superpowers/plans/2026-11-05-atlas-research-behind.md. Every study, thread and number here is invented.

const SECRET = "atlas-research-behind-test-secret-0123456789";
const SENTENCE = "Pain fell by 12 points in the exercise group at 6 months, against 3 points with usual care.";
const CONCLUSION = "Exercise therapy reduced pain, though the effect was small and faded after a year.";
const AGAINST = "A larger invented trial found no difference after a year.";
const HANDLE = `aft1_${"a".repeat(32)}`;
const STUDY = "10.1000/depth";
const THREAD = "https://www.reddit.com/r/KneePain/comments/abc123/my_knee_after_six_weeks_of_squats/";
const FORUM_THREAD = "https://forum.example.org/t/knee-squats/4512?utm_source=share#post-7";
// The literature search that found no study of what people report (the review of 5 November, finding 7).
const SEARCH = "slow squats knee pain";
const PAPER: SourceLineDocument = {
  kind: "full_text",
  blocks: [
    { text: "We enrolled adults with knee pain.", section: "Methods" },
    { text: SENTENCE, section: "Results" },
    { text: CONCLUSION, section: "Discussion" },
  ],
};
const QUOTE_FINDING_CLAIM = "Exercise therapy eased knee pain a little at six months in an invented trial.";
const FORUM_FINDING_CLAIM = "People on knee-pain forums report less pain after weeks of slow squats.";

const backingLine = { source: STUDY, sentence: SENTENCE, conclusion: CONCLUSION, against: AGAINST };
const signal = (overrides: Record<string, unknown> = {}) => ({
  threads: [THREAD, FORUM_THREAD],
  people: { better: 7, no_change: 2, worse: 1, mixed: 1 },
  report_quality: { detailed: 4, measured: 1, bare: 5 },
  mechanism: "Slow loading may strengthen the muscles around the knee, which takes load off the joint.",
  studies: "support_not_located",
  search_query: SEARCH,
  ...overrides,
});

function card(overrides: { quote?: Record<string, unknown>; forum?: Record<string, unknown> | null } = {}) {
  return {
    question: "Does exercise help adults with knee pain?",
    usual_answer: "Exercise may help a little, but painkillers are the usual answer.",
    findings: [{
      claim: QUOTE_FINDING_CLAIM,
      certainty: "moderate",
      applies_to: "Adults with knee pain",
      answer_quote: QUOTE_FINDING_CLAIM,
      sources: [STUDY],
      why_not_usual: "Quick answers lead with painkillers.",
      tags: [],
      what_would_change_it: "A larger trial finding no benefit.",
      kind: "effect",
      subject: "Exercise therapy",
      subject_type: "practice",
      direction: "benefit",
      numbers: [],
      backing: [backingLine],
      ...overrides.quote,
    }, ...(overrides.forum === null ? [] : [{
      claim: FORUM_FINDING_CLAIM,
      certainty: "low",
      applies_to: "Adults with knee pain who can squat",
      answer_quote: FORUM_FINDING_CLAIM,
      sources: [],
      why_not_usual: "Quick answers don't read what people report.",
      tags: [],
      what_would_change_it: "A trial of slow squats measuring pain.",
      kind: "overlooked_option",
      subject: "Slow squats",
      subject_type: "practice",
      direction: "benefit",
      numbers: [],
      forum_signal: signal(),
      ...overrides.forum,
    }])],
    public_value: { scope: "public", who_else: "Adults with knee pain", what_it_changes: "An option to try first." },
    topic: { key: "knee-pain", label: "Knee pain" },
    open_leads: [],
  };
}

const receipt = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, unknown>) =>
  issueResearchReceipt(kind, claims as never, { secret: SECRET });
// A Reddit read signs the subreddit the reader returned; a forum page's read signs its text's length, and no subreddit.
const threadRead = (url: string, claims: Record<string, unknown> = { n: 40, v: "reddit", c: "kneepain" }) =>
  receipt("forum_thread_read", { u: forumThreadDigest(url), ...claims });
const PAGE_READ = { n: 4_000, v: "page" };

function fixture(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  return {
    receipts: [
      receipt("study_audit", { doi: STUDY, content: "a".repeat(16), handle: HANDLE, fig: "consistent" }),
      receipt("literature_search", { src: "pubmed", q: discoveryQueryDigest([SEARCH]), n: 0 }),
      threadRead(THREAD),
      threadRead(FORUM_THREAD, PAGE_READ),
    ],
    research_target: "Synthetic research behind a finding", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the research behind a finding.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the research behind a finding." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: STUDY, status: "validated", read_depth: "full_text_audited", answer_marker: "[Smith 2021]" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: `[Smith 2021] [Étude](https://doi.org/10.1000/depth): "${SENTENCE}" "${CONCLUSION}"\n\n` +
      `${QUOTE_FINDING_CLAIM}\n\n${FORUM_FINDING_CLAIM}\n\n` +
      communitySkipCaveat("Synthetic fixture isolates the research behind a finding."),
    ...overrides,
  } as FinalizeResearchInput;
}

const OPTIONS = { secret: SECRET, findings: "save" as const };
const FOUND = { source: STUDY, sentence: "found", sentence_section: "Results", conclusion: "found",
  conclusion_section: "Discussion", text: "full_text" } as const;
const signedClaims = (token: string | undefined) => {
  const verified = verifyResearchReceipt(token!, { secret: SECRET });
  if (!verified.ok) throw new Error("unverified");
  return verified.claims;
};

describe("the card's later shape (owner answer 252a)", () => {
  it("takes backing lines, figures' sources and a forum signal, and a finding with no source, only in the later shape", () => {
    const given = card({ quote: { numbers: [] } });
    expect(laterFindingsCardSchema.safeParse(given).success).toBe(true);
    // The published card is fixed (owner answer 189a): none of it goes in its shape.
    expect(findingsCardSchema.safeParse(given).success).toBe(false);
    const parsed = parseFinalizeResearchInput({ ...fixture(), later_inputs: { findings_card: given } });
    expect(parsed.data?.findings_card?.findings[1]?.forum_signal?.studies).toBe("support_not_located");
    expect(parsed.data?.findings_card?.findings[0]?.backing).toEqual([backingLine]);
  });

  it.each([
    ["four backing lines", { quote: { backing: [backingLine, backingLine, backingLine, backingLine] } }],
    ["a quote longer than 300 characters", { quote: { backing: [{ ...backingLine, sentence: "a".repeat(301) }] } }],
    ["a negative count", { forum: { forum_signal: signal({ people: { better: -1, no_change: 0, worse: 0, mixed: 0 } }) } }],
    ["a count that isn't a whole number", { forum: { forum_signal: signal({ report_quality: { detailed: 1.5, measured: 0, bare: 0 } }) } }],
    ["a relationship to studies outside HRP's four", { forum: { forum_signal: signal({ studies: "refuted" }) } }],
    ["a forum signal with no thread", { forum: { forum_signal: signal({ threads: [] }) } }],
  ])("refuses %s", (_, overrides) => {
    expect(laterFindingsCardSchema.safeParse(card(overrides as never)).success).toBe(false);
  });
});

describe("the exact checks (owner answer 252a)", () => {
  const context: ResearchBehindContext = {
    sameSource: (left, right) => sourceIdKey(left) === sourceIdKey(right),
    keySource: (source) => sourceIdKey(source) === STUDY,
    threadRead: (url) => [THREAD, FORUM_THREAD].some((read) => read.replace(/[?#].*$/u, "") === url.replace(/[?#].*$/u, "")),
    comparableThread: (url) => url.replace(/[?#].*$/u, ""),
    threadCapacity: (url) => url.startsWith("https://www.reddit.com/") ? 41 : undefined,
    literatureSearched: (query) => query === SEARCH,
  };
  const problems = (given: ReturnType<typeof card>, overrides: Partial<ResearchBehindContext> = {}) =>
    researchBehindProblems(laterFindingsCardSchema.parse(given), { ...context, ...overrides });

  it("passes a card whose lines name its key sources and whose threads were read here", () => {
    expect(problems(card())).toEqual([]);
    // The same source in another form is the same source.
    expect(problems(card({ quote: { backing: [{ ...backingLine, source: "https://doi.org/10.1000/DEPTH" }] } }))).toEqual([]);
  });

  it("names a line whose source isn't the finding's key source, and a line given twice", () => {
    expect(problems(card({ quote: { backing: [{ ...backingLine, source: "10.1000/other" }] } }))[0])
      .toMatch(/^findings_card\.findings\[0\]\.backing\[0\]\.source is 10\.1000\/other/u);
    expect(problems(card({ quote: { backing: [backingLine, backingLine] } })))
      .toEqual([expect.stringMatching(/backing\[1\] repeats an earlier line/u)]);
    expect(problems(card(), { keySource: () => false })).toHaveLength(1);
  });

  it("names a figure whose source isn't one of the finding's", () => {
    const figure = { outcome: "pain halved", better: "more", option: "exercise", option_events: 30, option_total: 100,
      comparator: "usual care", comparator_events: 20, comparator_total: 100, follow_up: "6 months", source: "10.1000/other" };
    expect(problems(card({ quote: { numbers: [figure] } })))
      .toEqual([expect.stringMatching(/numbers\[0\]\.source is 10\.1000\/other/u)]);
  });

  it("checks each thread against this call's forum_thread_read receipts, refuses YouTube, and takes each thread once", () => {
    const unread = "https://forum.example.org/t/other/1";
    expect(problems(card({ forum: { forum_signal: signal({ threads: [THREAD, unread] }) } })))
      .toEqual([expect.stringMatching(/threads\[1\] was not read here: read it in full with read_forum_thread/u)]);
    expect(problems(card({ forum: { forum_signal: signal({ threads: ["https://www.youtube.com/watch?v=aaaaaaaaaaa"] }) } }))[0])
      .toMatch(/YouTube comments never go in a forum signal/u);
    expect(problems(card({ forum: { forum_signal: signal({ threads: [THREAD, `${THREAD}?share=1`] }) } })))
      .toEqual([expect.stringMatching(/threads\[1\] gives a thread already listed/u)]);
  });

  it("checks that the counts add up, people not comments", () => {
    expect(problems(card({ forum: { forum_signal: signal({ people: { better: 0, no_change: 0, worse: 0, mixed: 0 },
      report_quality: { detailed: 0, measured: 0, bare: 0 } }) } })))
      .toEqual([expect.stringMatching(/people counts no one/u)]);
    expect(problems(card({ forum: { forum_signal: signal({ report_quality: { detailed: 12, measured: 0, bare: 0 } }) } }))
      .join(" ")).toMatch(/report_quality\.detailed is 12, more than the 11 people counted/u);
    expect(problems(card({ forum: { forum_signal: signal({ report_quality: { detailed: 6, measured: 0, bare: 6 } }) } })))
      .toEqual([expect.stringMatching(/counts 12 people as detailed or bare one-liners/u)]);
  });

  it("keeps HRP's relationships to studies apart: what studies measured goes with outcome_mismatch only", () => {
    expect(problems(card({ forum: { forum_signal: signal({ studies: "outcome_mismatch" }) } }))[0])
      .toMatch(/outcome_mismatch without studies_measured/u);
    expect(problems(card({ forum: { forum_signal: signal({ studies_measured: "Cartilage thickness on scans." }) } }))[0])
      .toMatch(/studies_measured goes only with studies outcome_mismatch/u);
    // A study relationship other than "none found" cites the studies; "none found" rests on a search made here.
    expect(problems(card({ forum: { forum_signal: signal({ studies: "corroborated" }) } }))[0])
      .toMatch(/studies is corroborated, but the finding cites no study/u);
    expect(problems(card({ forum: { forum_signal: signal({ studies: "contradicted" }), sources: [STUDY] } }))).toEqual([]);
  });

  // The review of 5 November, finding 7: "none found" names its search, as option_classes does, and is compared with a
  // literature-search receipt of this call by the query's digest.
  it("takes support_not_located only with the query of a literature search passed here", () => {
    expect(problems(card({ forum: { forum_signal: signal({ search_query: undefined }) } })))
      .toEqual([expect.stringMatching(/studies is support_not_located without search_query/u)]);
    expect(problems(card({ forum: { forum_signal: signal({ search_query: "squats for knees" }) } })))
      .toEqual([expect.stringMatching(/search_query is not the query of any literature search passed here/u)]);
    expect(problems(card(), { literatureSearched: () => false })).toHaveLength(1);
  });

  // The reviews of 5 November: no more people than the threads hold, on Reddit each its comments read and its poster, on
  // a forum page one person for each 20 characters read; a page among the threads leaves the Reddit part bound.
  it("counts no more people than the threads read here hold, a forum page's included", () => {
    const reddit = { forum_signal: signal({ threads: [THREAD] }) };
    expect(problems(card({ forum: reddit }), { threadCapacity: () => 11 })).toEqual([]);
    expect(problems(card({ forum: reddit }), { threadCapacity: () => 10 }))
      .toEqual([expect.stringMatching(/people counts 11 people, more than the 10 the threads read here can hold/u)]);
    // Summed over the threads, each thread once.
    const two = "https://www.reddit.com/r/KneePain/comments/def456/";
    const both = { forum_signal: signal({ threads: [THREAD, two] }) };
    expect(problems(card({ forum: both }), { threadRead: () => true, threadCapacity: () => 6 })).toEqual([]);
    expect(problems(card({ forum: both }), { threadRead: () => true, threadCapacity: () => 5 })).toHaveLength(1);
    // A Reddit thread of 3 comments and a forum page of 2,000 characters hold 4 and 100 people: 5,000 don't fit.
    const crowd = signal({ people: { better: 5_000, no_change: 0, worse: 0, mixed: 0 } });
    expect(problems(card({ forum: { forum_signal: crowd } }), { threadCapacity: (url) => url === THREAD ? 4 : 100 }))
      .toEqual([expect.stringMatching(/people counts 5000 people, more than the 104 the threads read here can hold/u)]);
    expect(problems(card(), { threadCapacity: (url) => url === THREAD ? 4 : 100 })).toEqual([]);
    // A thread whose receipt names no reader leaves the signal unbound.
    expect(problems(card({ forum: { forum_signal: crowd } }), { threadCapacity: (url) => url === THREAD ? 4 : undefined }))
      .toEqual([]);
  });

  it("lets a finding rest on its forum signal alone, but not on nothing", () => {
    expect(problems(card())).toEqual([]);
    expect(problems(card({ forum: { forum_signal: undefined } })))
      .toEqual([expect.stringMatching(/findings\[1\]\.sources is empty: cite a key source, or, .* give its forum_signal/u)]);
  });
});

describe("the final check signs the research behind each finding", () => {
  it("checks the card, asks to look its backing lines up, and signs how each source was read", () => {
    const first = finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse(card()) }), OPTIONS);
    expect(first.status).toMatch(/^ready/u);
    expect(first.findings_card).toMatchObject({ status: "checked", problems: [] });
    expect(backingRequestsOf(first)).toEqual({
      lines: [{ finding: 0, line: 0, source: STUDY, sentence: SENTENCE, conclusion: CONCLUSION }],
      requests: [{ line: 0, keySource: true, handles: [HANDLE], pmids: [] }],
    });
    // Read from this call's receipts: the audit, with its printed figures matching its own data.
    expect(signedClaims(first.finalization_receipt).rd).toEqual(["1.1:full_text_audited:consistent"]);
    expect(signedClaims(first.finalization_receipt)).not.toHaveProperty("bl");
  });

  // Owner answer 254a: the threads AskRigor's reader read count as work a quick answer can't do, as studies it read do.
  it("counts the forum threads read for a forum signal as a verified basis, and names them in a paid save's offer", () => {
    const free = finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse(card()) }), OPTIONS);
    expect(free.findings_card).toMatchObject({ status: "checked", beyond_quick_answer: 2 });
    expect(signedClaims(free.finalization_receipt).bases).toEqual(["full_text_audit", "forum_read"]);
    const paid = finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse(card({ quote: { sources: [] ,
      backing: undefined }, forum: {} })) }), { ...OPTIONS, findings: "offer" as const });
    // A finding with no source that cites nothing is refused; one resting on its forum signal alone is offered.
    expect(paid.findings_card?.problems.join(" ")).toMatch(/findings\[0\]\.sources is empty/u);
    const forumOnly = finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse({ ...card(),
      findings: [card().findings[1]] }) }), { ...OPTIONS, findings: "offer" as const });
    expect(forumOnly.findings_card).toMatchObject({ status: "checked", beyond_quick_answer: 1 });
    expect(forumOnly.caveats.join(" ")).toContain("These findings rest on 2 forum threads read in full, work a quick " +
      "answer does not do.");
    expect(signedClaims(forumOnly.finalization_receipt).bases).toEqual(["forum_read"]);
  });

  it("signs what the lookups found, and the sections, once they ran; a lookup never holds the answer back", () => {
    const input = fixture({ findings_card: laterFindingsCardSchema.parse(card()) });
    const found = finalizeResearch(input, { ...OPTIONS, backingLookups: [{ finding: 0, line: 0, lookup: FOUND }] });
    expect(signedClaims(found.finalization_receipt)).toMatchObject({
      bl: ["1.1:ff:full_text"], bs: ["1.1.s:Results", "1.1.c:Discussion"], findings: findingsCardDigest(input.findings_card!),
    });
    expect(backingRequestsOf(found)).toBeUndefined();
    const missing = finalizeResearch(input, { ...OPTIONS,
      backingLookups: [{ finding: 0, line: 0, lookup: { ...FOUND, sentence: "not_found", sentence_section: undefined } }] });
    expect(missing.status).toBe(found.status);
    expect(missing.next_steps).toEqual(found.next_steps);
    expect(signedClaims(missing.finalization_receipt).bl).toEqual(["1.1:nf:full_text"]);
    expect(missing.notes).toContainEqual(expect.stringMatching(
      /^The sentence of findings_card\.findings\[0\]\.backing\[0\] isn't in the text AskRigor fetched, so the Atlas won't show it/u));
    const library = finalizeResearch(input, { ...OPTIONS,
      backingLookups: [{ finding: 0, line: 0, lookup: { ...FOUND, text: "library_copy" } }] });
    expect(library.notes).toContainEqual(expect.stringMatching(/found only in the owner's library copy, which the Atlas never quotes/u));
  });

  // The review of 5 November, findings 1 and 7: a Reddit read signs the subreddit its reader returned, which the final
  // check signs again for each of the card's Reddit threads; a forum page signs none; and the people counted must fit.
  it("signs each Reddit thread's subreddit as its reader's receipt signed it, and bounds the people by the comments read", () => {
    const given = laterFindingsCardSchema.parse(card());
    const checked = finalizeResearch(fixture({ findings_card: given }), OPTIONS);
    expect(checked.findings_card?.status).toBe("checked");
    expect(signedClaims(checked.finalization_receipt).ft).toEqual(["2.1:kneepain"]);
    // A post on a person's profile signs u_ alone, never the user's name; a read from before signs nothing.
    const profile = finalizeResearch(fixture({ findings_card: given, receipts: [...fixture().receipts.slice(0, 2),
      threadRead(THREAD, { n: 40, v: "reddit", c: "u_" }), threadRead(FORUM_THREAD, PAGE_READ)] }), OPTIONS);
    expect(signedClaims(profile.finalization_receipt).ft).toEqual(["2.1:u_"]);
    const older = finalizeResearch(fixture({ findings_card: given, receipts: [...fixture().receipts.slice(0, 2),
      threadRead(THREAD, { n: 40, v: "reddit" }), threadRead(FORUM_THREAD, PAGE_READ)] }), OPTIONS);
    expect(signedClaims(older.finalization_receipt)).not.toHaveProperty("ft");
    // Two Reddit threads of 4 and 5 comments read hold at most 11 people; the card's 11 fit, 12 don't. A thread's parts
    // read with more add up; reading it again adds nothing (the review of #417, finding 3).
    const two = "https://www.reddit.com/r/KneePain/comments/def456/";
    const reddit = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({ threads: [THREAD, two] }) } }));
    const kept = (...reads: string[]) => finalizeResearch(fixture({ findings_card: reddit,
      receipts: [...fixture().receipts.slice(0, 2), ...reads] }), OPTIONS);
    const fits = kept(threadRead(THREAD, { n: 3, v: "reddit", c: "kneepain" }),
      threadRead(THREAD, { n: 1, v: "reddit", c: "kneepain", m: "0123456789abcdef" }),
      threadRead(two, { n: 5, v: "reddit", c: "kneepain" }));
    expect(fits.findings_card?.status).toBe("checked");
    expect(signedClaims(fits.finalization_receipt).ft).toEqual(["2.1:kneepain", "2.2:kneepain"]);
    for (const crowded of [
      kept(threadRead(THREAD, { n: 3, v: "reddit", c: "kneepain" }), threadRead(two, { n: 5, v: "reddit", c: "kneepain" })),
      // The same first read again, or the same continuation again, adds nothing.
      kept(threadRead(THREAD, { n: 3, v: "reddit", c: "kneepain" }), threadRead(THREAD, { n: 2, v: "reddit", c: "kneepain" }),
        threadRead(two, { n: 5, v: "reddit", c: "kneepain" })),
      kept(threadRead(THREAD, { n: 3, v: "reddit", c: "kneepain" }), threadRead(two, { n: 4, v: "reddit", c: "kneepain" }),
        ...[1, 1].map(() => threadRead(two, { n: 1, v: "reddit", c: "kneepain", m: "fedcba9876543210" }))),
    ]) {
      expect(crowded.status).toMatch(/^ready/u);
      expect(crowded.findings_card?.status).toBe("rejected");
      expect(crowded.findings_card?.problems.join(" ")).toMatch(/people counts 11 people, more than the 10 the threads read/u);
    }
    // Reading a 10-comment thread three times holds 11 people, not 31.
    const once = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({ threads: [THREAD],
      people: { better: 12, no_change: 0, worse: 0, mixed: 0 } }) } }));
    const thrice = finalizeResearch(fixture({ findings_card: once, receipts: [...fixture().receipts.slice(0, 2),
      ...[1, 2, 3].map(() => threadRead(THREAD, { n: 10, v: "reddit", c: "kneepain" }))] }), OPTIONS);
    expect(thrice.findings_card?.problems.join(" ")).toMatch(/people counts 12 people, more than the 11 the threads read/u);
    // A forum page holds one person for each 20 characters read, each page once: 4,000 characters, 200 people.
    const crowd = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({
      people: { better: 5_000, no_change: 0, worse: 0, mixed: 0 } }) } }));
    const pages = finalizeResearch(fixture({ findings_card: crowd, receipts: [...fixture().receipts.slice(0, 2),
      threadRead(THREAD, { n: 3, v: "reddit", c: "kneepain" }), threadRead(FORUM_THREAD, { ...PAGE_READ, w: "aaaaaaaaaaaaaaaa" }),
      threadRead(FORUM_THREAD, { ...PAGE_READ, w: "aaaaaaaaaaaaaaaa" }), threadRead(FORUM_THREAD, { ...PAGE_READ, w: "bbbbbbbbbbbbbbbb" })] }),
    OPTIONS);
    expect(pages.findings_card?.problems.join(" ")).toMatch(/people counts 5000 people, more than the 404 the threads read/u);
  });

  // The recheck of #417: a read the reader was sent on to signs the link it was given only for the same thread at the
  // same site, and the two links are one thread, which holds its people once.
  it("counts a link the reader was sent on from as the thread it read, once", () => {
    const given = "https://example.org/viewtopic.php?t=4";
    const read = "https://talk.example.org/viewtopic.php?t=4";
    const page = (people: number, threads: string[]) => finalizeResearch(fixture({
      findings_card: laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({ threads,
        people: { better: people, no_change: 0, worse: 0, mixed: 0 }, report_quality: { detailed: 0, measured: 0, bare: 0 } }) } })),
      receipts: [...fixture().receipts.slice(0, 2),
        receipt("forum_thread_read", { u: forumThreadDigest(read), ur: forumThreadDigest(given), n: 200, v: "page", w: "aaaaaaaaaaaaaaaa" })],
    }), OPTIONS);
    // 200 characters hold 10 people, by either link.
    for (const link of [given, read]) {
      expect(page(10, [link]).findings_card?.status, link).toBe("checked");
      expect(page(11, [link]).findings_card?.problems.join(" "), link)
        .toMatch(/people counts 11 people, more than the 10 the threads read here can hold/u);
    }
    // Both links are one thread: given twice, refused as a repeat, and its people counted once.
    const both = page(20, [given, read]);
    expect(both.findings_card?.status).toBe("rejected");
    expect(both.findings_card?.problems.join(" ")).toMatch(/threads\[1\] gives a thread already listed/u);
    expect(both.findings_card?.problems.join(" ")).toMatch(/people counts 20 people, more than the 10/u);
  });

  // The recheck of #417: the final check signs a forum page's place (`fl`) only when the card's link is the one the
  // reader read, as the read's `l` signed it.
  it("signs a forum page's link for the save only when the card gives it as its reader read it", () => {
    const read = "https://www.example.org/viewtopic.php?t=12";
    const linked = (link: string) => signedClaims(finalizeResearch(fixture({
      findings_card: laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({ threads: [THREAD, link] }) } })),
      receipts: [...fixture().receipts.slice(0, 3),
        receipt("forum_thread_read", { u: forumThreadDigest(read), n: 4_000, v: "page", w: "aaaaaaaaaaaaaaaa",
          l: forumLinkDigest(read) })],
    }), OPTIONS).finalization_receipt);
    expect(linked(`${read}&highlight=jane`).fl).toEqual(["2.2"]);
    for (const other of ["http://www.example.org/viewtopic.php?t=12", "https://example.org/viewtopic.php?t=12"]) {
      const claims = linked(other);
      expect(claims.findings, other).toBeDefined();
      expect(claims, other).not.toHaveProperty("fl");
    }
  });

  it("refuses the card, not the answer, for a thread not read here", () => {
    const unread = card({ forum: { forum_signal: signal({ threads: ["https://forum.example.org/t/unread/9"] }) } });
    const result = finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse(unread) }), OPTIONS);
    expect(result.status).toMatch(/^ready/u);
    expect(result.findings_card?.status).toBe("rejected");
    expect(result.findings_card?.problems.join(" ")).toMatch(/threads\[0\] was not read here/u);
    expect(signedClaims(result.finalization_receipt)).not.toHaveProperty("findings");
  });

  // 5 Nov 2026: a read receipt also signs the link it was given (`ur`) when the site's own redirect sent the reader on to
  // another of its pages short of its front page (l34 on #412's build: LongeCity's topic link to viewtopic.php), or to the
  // same thread at the site's other host. A forum signal may give either link, and each thread counts once, by the link
  // the reader read: both links on one card are one thread listed twice.
  it("takes a thread by the link asked for when the site sent the reader to another, and counts it once", () => {
    const asked = "https://www.longecity.org/forum/topic/4512-knee-squats/page-2";
    const landed = "https://www.longecity.org/forum/viewtopic.php?t=104512&start=30";
    const redirected = receipt("forum_thread_read",
      { u: forumThreadDigest(landed), ur: forumThreadDigest(asked), n: 900, v: "page" });
    const receipts = [...fixture().receipts.slice(0, 2), threadRead(THREAD), redirected];
    const forumOnly = (threads: string[]) => laterFindingsCardSchema.parse({ ...card(),
      findings: [{ ...card().findings[1], forum_signal: signal({ threads }) }] });
    const byAsked = finalizeResearch(fixture({ receipts, findings_card: forumOnly([THREAD, asked]) }),
      { ...OPTIONS, findings: "offer" as const });
    expect(byAsked.findings_card).toMatchObject({ status: "checked", beyond_quick_answer: 1, problems: [] });
    expect(signedClaims(byAsked.finalization_receipt).bases).toEqual(["forum_read"]);
    expect(byAsked.caveats.join(" ")).toContain("These findings rest on 2 forum threads read in full");
    // The research's own count: two threads read, not three links.
    const reminded = finalizeResearch(fixture({ receipts }),
      { ...OPTIONS, researchMap: { mode: "remind" as const, account: "acct0123456789ab" } });
    expect(reminded.research_map?.note).toContain(" 2 forum threads read in full");
    const both = finalizeResearch(fixture({ receipts, findings_card: forumOnly([THREAD, asked, landed]) }), OPTIONS);
    expect(both.findings_card?.status).toBe("rejected");
    expect(both.findings_card?.problems.join(" ")).toMatch(/threads\[2\] gives a thread already listed/u);
  });

  it("names the new fields in a note when a public card's study finding gives no backing", () => {
    const bare = card({ quote: { backing: undefined }, forum: null });
    const result = finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse(bare) }), OPTIONS);
    expect(result.findings_card?.status).toBe("checked");
    expect(result.notes).toContain(RESEARCH_BEHIND_NOTE);
    expect(finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse(card()) }), OPTIONS).notes ?? [])
      .not.toContain(RESEARCH_BEHIND_NOTE);
  });
});

describe("source lines: the owner's library copy is a kind of its own", () => {
  it("reads an owner-library text as library_copy, and looks a line up with no conclusion", async () => {
    const index = { source: { provider: "owner_library" }, blocks: [{ text: SENTENCE, section_path: ["Results"] }] };
    expect(sourceLineDocument(index as never).kind).toBe("library_copy");
    const viaLibrary = { source: { provider: "europe_pmc", retrieval_provider: "owner_library" }, blocks: [] };
    expect(sourceLineDocument(viaLibrary as never).kind).toBe("library_copy");
    const [lookup] = await lookUpSourceLines([{ source: STUDY, sentence: SENTENCE }],
      [{ line: 0, keySource: true, handles: [HANDLE], pmids: [] }], { fullText: () => PAPER, abstract: async () => undefined });
    expect(lookup).toEqual({ source: STUDY, sentence: "found", sentence_section: "Results", conclusion: "not_checked",
      text: "full_text" });
  });
});

describe("the receipt's claims and what the save keeps of them", () => {
  const given = laterFindingsCardSchema.parse(card({ quote: { sources: [STUDY, "10.1000/second"],
    backing: [backingLine, { source: "10.1000/second", sentence: "Fewer people stopped exercising in the supervised group.",
      against: "The second study was small." }] } }));

  it("keeps only quotes found word for word in a full text AskRigor fetched itself or a PubMed abstract", () => {
    const { bl, bs } = signedBackingClaims([
      { finding: 0, line: 0, lookup: FOUND },
      { finding: 0, line: 1, lookup: { source: "10.1000/second", sentence: "found", conclusion: "not_checked", text: "search_copy" } },
    ]);
    expect(bl).toEqual(["1.1:ff:full_text", "1.2:fu:search_copy"]);
    const kept = findingBackingFromReceipt(bl, bs, given, () => undefined);
    expect(kept.get(0)).toEqual([{ source: STUDY, sentence: SENTENCE, sentence_section: "Results", conclusion: CONCLUSION,
      conclusion_section: "Discussion", text: "full_text", against: AGAINST }]);
    const abstract = findingBackingFromReceipt(["1.1:fn:abstract"], [], given, () => undefined);
    expect(abstract.get(0)).toEqual([{ source: STUDY, sentence: SENTENCE, text: "abstract", against: AGAINST }]);
    for (const kind of ["library_copy", "search_copy", "none"]) {
      expect(findingBackingFromReceipt([`1.1:ff:${kind}`], [], given, () => undefined).size).toBe(0);
    }
  });

  it("leaves out a quote the privacy screen refuses, never the card, and reads nothing it can't", () => {
    const screen = (value: string) => value === SENTENCE ? "phone_number" : undefined;
    expect(findingBackingFromReceipt(["1.1:ff:full_text"], [], given, screen).get(0))
      .toEqual([{ source: STUDY, conclusion: CONCLUSION, text: "full_text", against: AGAINST }]);
    expect(findingBackingFromReceipt(["1.1:fn:full_text"], [], given, screen).size).toBe(0);
    expect(findingBackingFromReceipt(["9.9:ff:full_text", "1.1:ff:paper", "junk"], undefined, given, () => undefined).size).toBe(0);
    expect(findingBackingFromReceipt(undefined, undefined, given, () => undefined).size).toBe(0);
  });

  it("signs and reads how each source was read, by the finding's sources in order", () => {
    const signed = signedReadingClaims(given, (source) => source === STUDY
      ? { read: "full_text_audited", figures: "internally_inconsistent" } : { read: "abstract_only" });
    expect(signed).toEqual(["1.1:full_text_audited:internally_inconsistent", "1.2:abstract_only:-"]);
    expect(findingReadingFromReceipt(signed, given).get(0)).toEqual([
      { source: STUDY, read: "full_text_audited", figures: "internally_inconsistent" },
      { source: "10.1000/second", read: "abstract_only" },
    ]);
    expect(findingReadingFromReceipt(["1.1:read_by_magic:-", "3.1:abstract_only:-"], given).size).toBe(0);
  });
});

// The review of 5 November, findings 1 and 2: a thread is published from the verified parts of its read, never from the
// AI's link: a Reddit post's community from the subreddit its reader's receipt signed, and its link by its id alone;
// another forum's registrable host, and a link only in one of four structural, id-only forms.
describe("thread links and communities, from the verified read", () => {
  // linkRead: the final check signed each forum page's link as the one its reader read (`fl`).
  const stored = (threads: string[], subreddit?: string, linkRead = true) => storedForumSignalOf(
    laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({ threads }) } })).findings[1]!.forum_signal!,
    (value) => value, true, () => subreddit, () => linkRead);

  it("publishes a Reddit post as r/<subreddit> from its signed subreddit, and its link by its id, whatever the AI's link says", () => {
    expect(publishedThreadOf(THREAD, "kneepain")).toEqual({ key: "reddit.com/comments/abc123", community: "r/kneepain",
      link: "https://www.reddit.com/comments/abc123/" });
    // A wrong subreddit in the AI's link: the community is the one the reader returned.
    expect(stored(["https://www.reddit.com/r/cancer/comments/abc123/x/"], "askdocs"))
      .toMatchObject({ communities: ["r/askdocs"], threads_read: 1, threads: ["https://www.reddit.com/comments/abc123/"] });
    expect(publishedThreadOf("https://redd.it/abc123", "kneepain")?.link).toBe("https://www.reddit.com/comments/abc123/");
    // A post on a person's profile counts, with no community and no link; so does a read with no subreddit signed.
    for (const subreddit of ["u_", "u_JaneDoe1980", undefined]) {
      expect(stored(["https://www.reddit.com/r/u_JaneDoe1980/comments/abc123/my_story/"], subreddit))
        .toEqual(expect.objectContaining({ communities: [], threads_read: 1 }));
      expect(stored(["https://www.reddit.com/r/u_JaneDoe1980/comments/abc123/my_story/"], subreddit)).not.toHaveProperty("threads");
    }
    expect(signedSubreddit("u_JaneDoe1980")).toBe("u_");
    expect(signedSubreddit("KneePain")).toBe("kneepain");
    expect(signedSubreddit("not a subreddit")).toBeUndefined();
  });

  it("publishes another forum's link only in an id-only form at its own host, never a title, a slug or a query value", () => {
    const linkOf = (url: string) => publishedThreadOf(url, undefined, true)?.link;
    expect(linkOf("https://example.org/viewtopic.php?t=123&highlight=jane+doe+says+i+cured+it"))
      .toBe("https://example.org/viewtopic.php?t=123");
    expect(linkOf("https://example.org/viewtopic.php?t=123&p=anything-at-all&start=40&sid=abcdef"))
      .toBe("https://example.org/viewtopic.php?t=123");
    expect(linkOf("https://www.example.co.uk/showthread.php?t=77&page=3")).toBe("https://www.example.co.uk/showthread.php?t=77");
    expect(linkOf("https://example.org/threads/my-husband-john-smith-cured-his-back.12345/page-2"))
      .toBe("https://example.org/threads/12345/");
    expect(linkOf("https://example.net/t/my-title-slug/4512/7")).toBe("https://example.net/t/4512");
    // The form keeps the link's scheme and host; any other port, never.
    expect(linkOf("http://example.org/viewtopic.php?t=12")).toBe("http://example.org/viewtopic.php?t=12");
    expect(linkOf("https://example.org:8443/viewtopic.php?t=12")).toBeUndefined();
    // With no sign that it is the link read, a page is named and counted, never linked.
    expect(publishedThreadOf("https://example.org/viewtopic.php?t=12")).toEqual({ key: "example.org/viewtopic.php?t=12",
      community: "example.org" });
    // Anything else is counted, never linked: a host that isn't the forum's own (a person's subdomain, a mobile or
    // "new" host), a session in the path, a person's or a blog's page, Quora's answer slugs, Earth Clinic's pages for
    // now, a Discourse post that names no topic apart from it, an install under a folder.
    for (const url of ["https://janedoe.forumhost.example/viewtopic.php?t=12", "https://m.example.org/threads/5/",
      "https://forum.example.org/t/knee-squats/4512", "https://example.org/thread/123;jsessionid=0123ABCDEF",
      "https://example.org/members/jane-doe.12/", "https://medium.com/@janedoe/how-i-beat-x-9f8e7d",
      "https://janedoe.substack.com/p/my-recovery", "https://www.quora.com/Does-X-cure-Y/answer/Jane-Doe-42",
      "https://www.earthclinic.com/cures/knee-pain.html", "https://example.net/t/4512/7",
      "https://example.org/forum/viewtopic.php?t=123", "https://example.org/viewtopic.php?t=12ab"]) {
      expect(linkOf(url), url).toBeUndefined();
    }
    expect(linkOf("https://user:pass@example.org/t/1")).toBe("https://example.org/t/1");
    expect(publishedThreadOf("not a link")).toBeUndefined();
  });

  it("names a forum by its registrable host only for a thread in an id-only form at that host, and nothing else", () => {
    // Pages that may be a person's, a blog's or a site no one approved count as another website, with no name.
    expect(stored(["https://janedoe.substack.com/p/my-recovery", "https://janedoe.blogspot.com/2024/05/my-story.html",
      "https://www.quora.com/Does-X-cure-Y/answer/Jane-Doe-42", "https://medium.com/@janedoe/how-i-beat-x-9f8e7d",
      "https://www.janedoe.com/2024/05/my-story.html", "https://jane.doe.name/blog/1", "https://janedoe.id.au/recovery",
      "https://janedoe.forumhost.example/viewtopic.php?t=12", "https://www.earthclinic.com/cures/knee-pain.html"]))
      .toEqual(expect.objectContaining({ communities: ["another website"], threads_read: 9 }));
    expect(stored(["https://example.org/t/knee-squats/4512", THREAD, "https://www.example.co.uk/showthread.php?t=77"],
      "kneepain")).toEqual(expect.objectContaining({ communities: ["example.org", "r/kneepain", "example.co.uk"],
      threads: ["https://example.org/t/4512", "https://www.reddit.com/comments/abc123/",
        "https://www.example.co.uk/showthread.php?t=77"] }));
    // Named ones first, then the rest once.
    expect(stored([FORUM_THREAD, "https://example.org/t/knee-squats/4512"]))
      .toEqual(expect.objectContaining({ communities: ["example.org", "another website"], threads_read: 2 }));
    expect(registrableHost("forum.example.org")).toBe("example.org");
    expect(registrableHost("forums.example.co.uk")).toBe("example.co.uk");
    expect(registrableHost("www.earthclinic.com")).toBe("earthclinic.com");
    expect(registrableHost("192.168.0.1")).toBeUndefined();
    // The same thread twice counts once; a YouTube link is never a thread.
    expect(stored([FORUM_THREAD, "https://forum.example.org/t/knee-squats/4512/9", "https://youtu.be/aaaaaaaaaaa"]))
      .toEqual(expect.objectContaining({ communities: ["another website"], threads_read: 1 }));
  });

  // The review of #417 (findings 5 and 8) and its recheck: a www host and the bare one compare as one, and only Reddit's
  // other prefixes are set aside; a punycode host shows in Unicode only when its letters are in one script.
  it("compares a www host and the bare one as one, keeps the rest of a host, and shows Unicode only in one script", () => {
    expect(forumThreadDigest("https://www.example.org/t/1")).toBe(forumThreadDigest("https://example.org/t/1"));
    expect(forumThreadDigest("https://new.example.org/t/1")).not.toBe(forumThreadDigest("https://example.org/t/1"));
    expect(forumThreadDigest("https://m.example.org/t/1")).not.toBe(forumThreadDigest("https://example.org/t/1"));
    expect(forumThreadDigest("https://old.reddit.com/r/KneePain/comments/abc123/")).toBe(forumThreadDigest("https://redd.it/abc123"));
    expect(forumThreadDigest("http://example.org/t/1/")).toBe(forumThreadDigest("https://example.org/t/1"));
    const idn = stored(["https://xn--e1afmkfd.xn--p1ai/viewtopic.php?t=5"]);
    expect(idn).toEqual(expect.objectContaining({ communities: ["xn--e1afmkfd.xn--p1ai"],
      threads: ["https://xn--e1afmkfd.xn--p1ai/viewtopic.php?t=5"] }));
    expect(shownCommunity("xn--e1afmkfd.xn--p1ai")).toBe("пример.рф");
    expect(shownCommunity("xn--bcher-kva.de")).toBe("bücher.de");
    expect(shownCommunity("xn--hxargifdar.xn--qxam")).toBe("ελληνικά.ελ");
    // A look-alike: a Cyrillic а among Latin letters, a Cyrillic label before a Latin one (аррӏе.com), or two scripts in
    // a label. A label in one script under a Latin one shows as read too, whoever it is (ελληνικά.gr).
    for (const host of ["xn--pple-43d.com", "xn--80ak6aa92e.com", "xn--e1afmkfd.com", "xn--r8jz45g.xn--zckzah",
      "xn--hxargifdar.gr"]) {
      expect(shownCommunity(host), host).toBe(host);
    }
    expect(shownCommunity("r/kneepain")).toBe("r/kneepain");
    expect(shownCommunity("another website")).toBe("another website");
    expect(shownCommunity("example.org")).toBe("example.org");
  });

  // The recheck of #417: a forum page's link is published only as its reader read it, by the read's `l` and the final
  // check's `fl`, never the AI's own http:// or host.
  it("publishes no rewrite the reader didn't fetch: a page read at another link is named and counted, not linked", () => {
    expect(forumReadLink("https://example.org/t/2024")).toBe("https://example.org/t/2024");
    expect(forumReadLink("https://example.org/t/events/2024")).toBeUndefined();
    expect(forumReadLink("https://www.example.org/threads/my-story.12/page-3")).toBeUndefined();
    expect(forumReadLink("https://www.example.org/threads/12/")).toBe("https://www.example.org/threads/12/");
    expect(forumReadLink("https://example.org/viewtopic.php?t=12&start=25")).toBeUndefined();
    expect(forumReadLink(THREAD)).toBeUndefined();
    // Read at /t/events/2024, which signs no link: the card's page is named and counted, and no fl is signed for it.
    const given = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({
      threads: [THREAD, "https://example.org/t/events/2024"] }) } }));
    expect(signedThreadLinks(given, () => new Set())).toEqual([]);
    expect(stored(["https://example.org/t/events/2024"], undefined, false))
      .toEqual(expect.objectContaining({ communities: ["example.org"], threads_read: 1 }));
  });

  it("links a forum page only as its reader read it, and names and counts it either way", () => {
    const given = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({ threads: [
      "https://www.example.org/viewtopic.php?t=12&highlight=x", "http://www.example.org/viewtopic.php?t=13",
      "https://example.org/viewtopic.php?t=14", THREAD, "https://janedoe.substack.com/p/my-recovery"] }) } }));
    const read = new Set(["https://www.example.org/viewtopic.php?t=12", "https://www.example.org/viewtopic.php?t=13",
      "https://www.example.org/viewtopic.php?t=14"].map(forumLinkDigest));
    const signed = signedThreadLinks(given, () => read);
    expect(signed).toEqual(["2.1"]);
    expect(threadLinksFromReceipt(signed, given)).toEqual(new Map([[1, new Set([0])]]));
    expect(threadLinksFromReceipt(["2.9", "1.1", "2.1:x", "junk"], given).size).toBe(0);
    expect(stored(["https://example.org/viewtopic.php?t=14"], undefined, false))
      .toEqual(expect.objectContaining({ communities: ["example.org"], threads_read: 1 }));
    expect(stored(["https://example.org/viewtopic.php?t=14"], undefined, false)).not.toHaveProperty("threads");
    expect(forumPublishedLink("https://www.example.org/threads/my-story.12/page-3")).toBe("https://www.example.org/threads/12/");
    expect(forumPublishedLink(THREAD)).toBeUndefined();
    expect(forumPublishedLink("https://janedoe.substack.com/p/my-recovery")).toBeUndefined();
  });

  // The recheck of #417: a link the reader was sent on from counts as the thread read only for the same thread at the
  // same registrable host.
  it("takes a link the reader was sent on from as the thread read only for the same thread at the same site", () => {
    expect(sameThreadAtSite("https://example.org/viewtopic.php?t=4", "https://talk.example.org/viewtopic.php?t=4&sid=1"))
      .toBe(true);
    expect(sameThreadAtSite("https://example.org/viewtopic.php?t=4", "https://example.net/viewtopic.php?t=4")).toBe(false);
    expect(sameThreadAtSite("https://example.org/viewtopic.php?t=4", "https://example.org/viewtopic.php?t=5")).toBe(false);
    expect(sameThreadAtSite("https://example.org/viewtopic.php?t=4", "https://example.org/login")).toBe(false);
    expect(sameThreadAtSite(THREAD, "https://www.reddit.com/comments/abc123/")).toBe(false);
    expect(sameThreadAtSite("not a link", "https://example.org/t/1")).toBe(false);
  });

  it("signs and reads each Reddit thread's subreddit by the finding's place and the thread's", () => {
    const given = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({
      threads: [FORUM_THREAD, THREAD, "https://www.reddit.com/r/u_JaneDoe1980/comments/xyz789/"] }) } }));
    const signed = signedThreadCommunities(given, (url) => url === THREAD ? "kneepain" : url.includes("xyz789") ? "u_" : undefined);
    expect(signed).toEqual(["2.2:kneepain", "2.3:u_"]);
    expect(threadCommunitiesFromReceipt(signed, given)).toEqual(new Map([[1, new Map([[1, "kneepain"], [2, "u_"]])]]));
    // Nothing it can't read, for a thread the card doesn't have, or a name that isn't one.
    expect(threadCommunitiesFromReceipt(["2.9:kneepain", "1.1:kneepain", "2.2:Knee Pain", "junk"], given).size).toBe(0);
  });
});

// The save, GitHub in memory, with a receipt signing what a check with lookups signs.
function saveHarness() {
  const github = new FakeGitHub();
  const library = new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    queue: new GitHubFindingsQueue({ tokenProvider: { getToken: async () => "synthetic-token" }, fetch: github.fetch,
      repository: DEFAULT_FINDINGS_REPOSITORY }),
    protocols: async () => [{ name: "HRP", version: "20.6.40", sha256: sha256("synthetic-hrp") }],
    version: "0.1.0",
    build: "0123abc",
    now: () => new Date("2026-11-05T12:00:00.000Z"),
  });
  return {
    github,
    async save(given: object, claims: Record<string, unknown>, account?: FindingsSaveAccount) {
      const parsed = laterFindingsCardSchema.parse(given);
      return library.save({
        findings_card: given,
        contributor: "1".repeat(64),
        finalization_receipt: issueResearchReceipt("finalization", { status: "ready", depth: "deep",
          target: "0123456789ab", findings: findingsCardDigest(parsed), bases: ["full_text_audit", "none"], ...claims } as never,
        { secret: SECRET, now: () => new Date("2026-11-05T11:59:00.000Z") }),
      }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64), ...(account === undefined ? {} : { account }) });
    },
  };
}

describe("the save stores the research behind each finding", () => {
  it("stores the found quotes, the readings and the forum signal, and the review reads it against the signed digest", async () => {
    const h = saveHarness();
    await expect(h.save(card(), { rd: ["1.1:full_text_audited:consistent"], bl: ["1.1:ff:full_text"],
      bs: ["1.1.s:Results", "1.1.c:Discussion"], ft: ["2.1:kneepain"] })).resolves.toMatchObject({ status: "saved" });
    const body = h.github.issue(42).body;
    const record = storedRecordOf(body) as FindingsRecord;
    const [quoted, forum] = record.card.findings;
    expect(quoted!.backing).toEqual([{ ...backingLine, sentence_section: "Results", conclusion_section: "Discussion",
      text: "full_text" }]);
    expect(quoted!.source_reading).toEqual([{ source: STUDY, read: "full_text_audited", figures: "consistent" }]);
    // A finding resting on its forum signal alone is saved, with no source. With no account whose notice covers links,
    // the signal keeps how many threads were read and their communities, as the verified reads give them: the Reddit
    // post's subreddit as its receipt signed it; a forum on a subdomain, not its own host, as another website. Never the
    // links or the search's query.
    expect(forum!.sources).toEqual([]);
    const { threads: _threads, search_query: _query, ...counted } = signal();
    expect(forum!.forum_signal).toEqual({ ...counted, communities: ["r/kneepain", "another website"], threads_read: 2 });
    expect(record.stored_without).toEqual(["forum_thread_links"]);
    expect(body).not.toContain("abc123");
    expect(body).not.toContain("knee-squats");
    expect(body).not.toContain(SEARCH);
    expect(body).toContain("- Research behind it, 10\\.1000/depth \\(found in the full text AskRigor fetched\\)");
    expect(body).toContain("- What people report: better 7, no change 2, worse 1, mixed 1");
    expect(body).toContain("- Forum threads read: 2, in r/kneepain, another website");
    // A receipt that signed no subreddit names no community for the Reddit post.
    const unsigned = saveHarness();
    await unsigned.save(card(), {});
    const unsignedSignal = (storedRecordOf(unsigned.github.issue(42).body) as FindingsRecord).card.findings[1]!.forum_signal;
    expect(unsignedSignal).toMatchObject({ communities: ["another website"], threads_read: 2 });
    expect(parseFindingsRecordBody(body, "card")).toMatchObject({ record: { stored_without: ["forum_thread_links"] } });
    // With every quote kept and no forum signal, the stored card, what the save adds set aside, is the card the final
    // check signed, so the review reads it against that digest.
    const whole = saveHarness();
    await whole.save(card({ forum: null }), { rd: ["1.1:full_text_audited:consistent"], bl: ["1.1:ff:full_text"],
      bs: ["1.1.s:Results", "1.1.c:Discussion"] });
    const wholeBody = whole.github.issue(42).body;
    expect((storedRecordOf(wholeBody) as FindingsRecord).stored_without).toBeUndefined();
    expect(parseFindingsRecordBody(wholeBody, "card")).toMatchObject({ record: { card_sha256: findingsCardDigest(
      laterFindingsCardSchema.parse(card({ forum: null }))) } });
    // A stored card edited by hand no longer reads as the one checked.
    expect(parseFindingsRecordBody(wholeBody.replaceAll("A larger invented trial", "A larger trial"), "card")).toBe("tampered");
  });

  it("names the quotes it didn't keep, stores none for an older receipt, and keeps a declaration out", async () => {
    const h = saveHarness();
    await h.save(card({ quote: { draws_on_youtube_comments: false } }), { bl: ["1.1:fn:full_text"] });
    const record = storedRecordOf(h.github.issue(42).body) as FindingsRecord;
    expect(record.card.findings[0]!.backing).toEqual([{ source: STUDY, sentence: SENTENCE, text: "full_text", against: AGAINST }]);
    expect(record.stored_without).toEqual(["youtube_comment_declarations", "backing_quotes_not_kept", "forum_thread_links"]);
    expect(parseFindingsRecordBody(h.github.issue(42).body, "card")).toMatchObject({ record: { stored_without: record.stored_without } });
    const older = saveHarness();
    await older.save(card(), {});
    const plain = storedRecordOf(older.github.issue(42).body) as FindingsRecord;
    expect(plain.card.findings[0]).not.toHaveProperty("backing");
    expect(plain.card.findings[0]).not.toHaveProperty("source_reading");
    expect(plain.stored_without).toEqual(["backing_quotes_not_kept", "forum_thread_links"]);
  });

  it("stores no quote naming YouTube, and no YouTube link's address in the words against a finding", async () => {
    const h = saveHarness();
    const linked = { ...backingLine, conclusion: "Videos at https://www.youtube.com/watch?v=aaaaaaaaaaa showed the exercises.",
      against: "A video, https://youtu.be/bbbbbbbbbbb, shows people who stopped." };
    await h.save(card({ quote: { backing: [linked] }, forum: null }), { bl: ["1.1:ff:full_text"] });
    const record = storedRecordOf(h.github.issue(42).body) as FindingsRecord;
    expect(record.card.findings[0]!.backing).toEqual([{ source: STUDY, sentence: SENTENCE, text: "full_text",
      against: "A video, (YouTube video), shows people who stopped." }]);
    expect(record.stored_without).toEqual(["youtube_video_ids_and_links", "backing_quotes_not_kept"]);
    expect(h.github.issue(42).body).not.toMatch(/youtube\.com|youtu\.be/u);
  });

  // Owner answer 253a: notice version 5 covers the forum threads' links; an account still on version 4 gets none stored.
  it("stores each thread's link as the Atlas publishes it, only for an account whose notice covers it", async () => {
    const accounts: Array<[FindingsSaveAccount, boolean]> = [
      [{ mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION }, true],
      [{ mode: "PAID_PRIVATE", noticeVersion: null }, true],
      [{ mode: "FREE_CONTRIBUTOR", noticeVersion: "free-contributor-v4-2026-10-25" }, false],
    ];
    for (const [account, links] of accounts) {
      const h = saveHarness();
      await h.save(card(), { ft: ["2.1:kneepain"] }, account);
      const body = h.github.issue(42).body;
      const signal = (storedRecordOf(body) as FindingsRecord).card.findings[1]!.forum_signal!;
      if (links) {
        // Rebuilt from the verified reads: the Reddit post by its id; the forum's topic, on a subdomain, not at all.
        expect(signal.threads).toEqual(["https://www.reddit.com/comments/abc123/"]);
        expect(body).not.toContain("forum\\.example\\.org");
        expect(body).not.toContain("knee\\-squats");
      } else {
        expect(signal).not.toHaveProperty("threads");
        expect(body).not.toContain("abc123");
      }
      // Never the title's words, a username or a tracking parameter.
      expect(body).not.toMatch(/my_knee_after|utm_source|post-7/u);
      expect(parseFindingsRecordBody(body, "card")).not.toBe("tampered");
    }
  });

  // The recheck of #417: a forum page's link is stored only where the receipt signed it as the link its reader read.
  it("stores a forum page's link only where the receipt signed it as read", async () => {
    const forum = "https://www.example.org/viewtopic.php?t=12";
    const given = card({ forum: { forum_signal: signal({ threads: [THREAD, forum] }) } });
    for (const [claims, threads] of [
      [{ ft: ["2.1:kneepain"], fl: ["2.2"] }, ["https://www.reddit.com/comments/abc123/", forum]],
      [{ ft: ["2.1:kneepain"] }, ["https://www.reddit.com/comments/abc123/"]],
    ] as const) {
      const h = saveHarness();
      await h.save(given, claims, { mode: "PAID_PRIVATE", noticeVersion: null });
      const stored = (storedRecordOf(h.github.issue(42).body) as FindingsRecord).card.findings[1]!.forum_signal!;
      expect(stored.communities).toEqual(["r/kneepain", "example.org"]);
      expect(stored.threads).toEqual(threads);
    }
  });

  it("treats the forum signal's words as card text, and leaves a YouTube thread out", () => {
    const given = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({
      threads: [THREAD, "https://youtu.be/aaaaaaaaaaa"],
      mechanism: "As https://youtu.be/bbbbbbbbbbb shows, slow loading may strengthen the knee.",
    }) } }));
    const stored = withoutYouTubeData(given, new Set(), { threadCommunities: new Map([[1, new Map([[0, "kneepain"]])]]) });
    expect(stored.card.findings[1]!.forum_signal).toMatchObject({ communities: ["r/kneepain"], threads_read: 1,
      mechanism: "As (YouTube video) shows, slow loading may strengthen the knee." });
    expect(stored.card.findings[1]!.forum_signal).not.toHaveProperty("threads");
    expect(stored.omitted).toBe(true);
    expect(stored.card.findings[0]).not.toHaveProperty("backing");
  });
});

// A stored record as the save writes it, for the publisher.
function record(findings: FindingsRecord["card"]["findings"]): FindingsRecord {
  const checked = card();
  return {
    schema: "askrigor.findings-card.v1",
    card: { ...checked, findings } as FindingsRecord["card"],
    card_sha256: "d".repeat(64),
    stamp: {
      saved_at: "2026-11-05T12:00:00.000Z", askrigor_version: "0.1.0", askrigor_build: "0123abc", protocols: [],
      tool_catalog_sha256: "c".repeat(64), surface: "/mcp/claude", research: { finalized_at: "2026-11-05T11:59:00.000Z" },
    },
  };
}
const STORED_QUOTED = {
  ...card().findings[0]!,
  sources: [STUDY],
  numbers: [{ outcome: "pain halved", better: "more" as const, option: "exercise", option_events: 30, option_total: 100,
    comparator: "usual care", comparator_events: 20, comparator_total: 100, follow_up: "6 months", source: STUDY }],
  backing: [{ ...backingLine, sentence_section: "Results", conclusion_section: "Discussion", text: "full_text" as const }],
  source_reading: [{ source: STUDY, read: "full_text_audited" as const, figures: "consistent" as const }],
  verified_bases: ["full_text_audit" as const],
} as unknown as FindingsRecord["card"]["findings"][number];
const storedSignal = (overrides: Record<string, unknown> = {}) => {
  const { threads: _threads, search_query: _query, ...counted } = signal(overrides);
  return { ...counted, communities: ["r/kneepain", "example.org"], threads_read: 2 };
};
const STORED_FORUM = { ...card().findings[1]!, sources: [], forum_signal: storedSignal() } as unknown as
  FindingsRecord["card"]["findings"][number];
const ROUTE = { route: "save" as const, account: { mode: "FREE_CONTRIBUTOR" as const, noticeVersion: RESEARCH_USE_NOTICE_VERSION } };
const TITLES = new Map([[STUDY, { title: "An invented trial of exercise for knee pain", year: 2021, retraction: "expression_of_concern" as const }]]);

describe("publication version 3", () => {
  it("publishes the research behind a finding, the figures' sources, the retraction status and the forum signal", () => {
    const plan = planCardPublication({ record: record([STORED_QUOTED, STORED_FORUM]), setAside: false, route: ROUTE,
      sourceTitles: TITLES });
    expect(plan.leftOut).toEqual([]);
    const [quoted, forum] = plan.drafts.map(({ published }) => published);
    expect(quoted).toMatchObject({
      schema: ATLAS_PUBLICATION_SCHEMA_V3,
      backing: [{ source: STUDY, sentence: SENTENCE, sentence_section: "Results", conclusion: CONCLUSION, text: "full_text",
        against: AGAINST }],
      source_reading: [{ source: STUDY, read: "full_text_audited", figures: "consistent" }],
      source_details: [{ source: STUDY, title: "An invented trial of exercise for knee pain", year: 2021,
        retraction: "expression_of_concern" }],
    });
    expect(quoted!.numbers![0]!.source).toBe(STUDY);
    // A finding resting on its forum signal alone is published, with its communities and how many threads, no link.
    expect(forum).toMatchObject({
      schema: ATLAS_PUBLICATION_SCHEMA_V3,
      sources: [],
      forum_signal: {
        communities: ["r/kneepain", "example.org"], threads_read: 2, threads: [],
        people: { better: 7, no_change: 2, worse: 1, mixed: 1 }, report_quality: { detailed: 4, measured: 1, bare: 5 },
        studies: "support_not_located",
      },
    });
    expect(plan.drafts.map(({ state }) => state)).toEqual(["unreviewed", "unreviewed"]);
  });

  it("stays version 2 for a finding without the research behind it, and never takes version 3's fields there", () => {
    const { backing: _b, source_reading: _r, numbers: _n, ...older } = STORED_QUOTED as never as Record<string, unknown>;
    const plan = planCardPublication({ record: record([{ ...older, numbers: [] } as never]), setAside: false, route: ROUTE,
      sourceTitles: TITLES });
    const published = plan.drafts[0]!.published;
    expect(published.schema).toBe(ATLAS_PUBLICATION_SCHEMA_V2);
    expect(published.source_details).toEqual([{ source: STUDY, title: "An invented trial of exercise for knee pain", year: 2021 }]);
    expect(atlasPublishedFindingSchema.safeParse({ ...published, backing: [{ source: STUDY, sentence: SENTENCE,
      text: "full_text", against: AGAINST }] }).success).toBe(false);
    expect(atlasPublishedFindingSchema.safeParse({ ...published, sources: [] }).success).toBe(false);
  });

  it("leaves out a quote, a section or a link the pages never show, and holds the finding for the AI's own words", () => {
    const email = { ...STORED_QUOTED, backing: [{ ...(STORED_QUOTED as never as { backing: object[] }).backing[0],
      sentence: "Write to trial.office@example.org for the protocol of this invented trial please." }] } as never;
    const [quoteLeftOut] = planCardPublication({ record: record([email]), setAside: false, route: ROUTE }).drafts;
    expect(quoteLeftOut!.state).toBe("unreviewed");
    expect(quoteLeftOut!.published.backing).toEqual([{ source: STUDY, conclusion: CONCLUSION, conclusion_section: "Discussion",
      text: "full_text", against: AGAINST }]);
    const against = { ...STORED_QUOTED, backing: [{ ...(STORED_QUOTED as never as { backing: object[] }).backing[0],
      against: "Ask the author at trial.office@example.org." }] } as never;
    const [held] = planCardPublication({ record: record([against]), setAside: false, route: ROUTE }).drafts;
    expect(held).toMatchObject({ state: "held", heldBecause: ["email_address"] });
    const mechanism = { ...STORED_FORUM, forum_signal: storedSignal({ mechanism: "Call +1 415 555 0134 to learn how it works." }) } as never;
    expect(publicationHoldReasons(planCardPublication({ record: record([mechanism]), setAside: false, route: ROUTE })
      .drafts[0]!.published)).toEqual(["phone_number"]);
  });

  // Owner answer 253a, and the review of 5 November (finding 1): a signal that holds its threads' links, which the save
  // stores only once a notice covers them, publishes only those in the Atlas's own forms, and only such communities.
  it("publishes only a thread link and a community in the Atlas's own forms", () => {
    const research = researchBehindOf({ ...STORED_FORUM, forum_signal: { ...storedSignal(),
      communities: ["r/kneepain", "example.org", "r/u_janedoe", "Jane's forum"],
      threads: ["https://www.reddit.com/comments/abc123/", "https://forum.example.org/t/4512", THREAD, FORUM_THREAD,
        "https://forum.example.org/members/someone.12/"] } } as never, { sources: [], numbers: null });
    expect(research?.forum_signal?.communities).toEqual(["r/kneepain", "example.org"]);
    expect(research?.forum_signal?.threads).toEqual(["https://www.reddit.com/comments/abc123/", "https://forum.example.org/t/4512"]);
    // A signal whose threads were all posts on people's profiles publishes its counts, with no community.
    const profiles = researchBehindOf({ ...STORED_FORUM, forum_signal: { ...storedSignal(), communities: [] } } as never,
      { sources: [], numbers: null });
    expect(profiles?.forum_signal).toMatchObject({ communities: [], threads_read: 2, threads: [] });
    expect(atlasPublishedFindingSchema.safeParse(planCardPublication({ record: record([{ ...STORED_FORUM,
      forum_signal: { ...storedSignal(), communities: [] } } as never]), setAside: false, route: ROUTE })
      .drafts[0]!.published).success).toBe(true);
  });

  it("maps a line's source to the publication's own form of it", () => {
    const research = researchBehindOf({ ...STORED_QUOTED, backing: [{ source: "https://doi.org/10.1000/DEPTH",
      sentence: SENTENCE, text: "abstract", against: AGAINST }] } as never, { sources: [STUDY], numbers: null });
    expect(research?.backing).toEqual([{ source: STUDY, sentence: SENTENCE, text: "abstract", against: AGAINST }]);
  });

  it("stores version 3 in the publication store as it is", async () => {
    const store = new InMemoryAtlasPublicationStore();
    const plan = planCardPublication({ record: record([STORED_QUOTED, STORED_FORUM]), setAside: false, route: ROUTE,
      sourceTitles: TITLES });
    await store.publish({ cardNumber: 42, cardSha256: "d".repeat(64), findings: plan.drafts,
      publishedAt: "2026-11-05T12:00:00.000Z", revive: false });
    const rows = await store.inspect({});
    expect(rows.map(({ published }) => (published as AtlasPublishedFinding).schema))
      .toEqual([ATLAS_PUBLICATION_SCHEMA_V3, ATLAS_PUBLICATION_SCHEMA_V3]);
  });
});

// The pages ------------------------------------------------------------------------------------------------------------

async function publishedSource(findings: FindingsRecord["card"]["findings"]) {
  const publications = new InMemoryAtlasPublicationStore();
  const plan = planCardPublication({ record: record(findings), setAside: false, route: ROUTE, sourceTitles: TITLES });
  await publications.publish({ cardNumber: 42, cardSha256: "d".repeat(64), findings: plan.drafts,
    publishedAt: "2026-11-05T12:00:00.000Z", revive: false });
  return new InMemoryAtlasPageSource({ publications });
}

async function publishedPages(findings: FindingsRecord["card"]["findings"]) {
  const source = await publishedSource(findings);
  return async (number: string) => renderAtlasFinding((await loadAtlasFinding(source, number))!);
}

describe("the finding page (owner answer 252a)", () => {
  it("shows the research behind it after the numbers: each source, how it was read, its quotes and what is against it", async () => {
    const page = await (await publishedPages([STORED_QUOTED, STORED_FORUM]))("P-1001");
    expect(atlasPageProblems(page)).toEqual([]);
    expect(page).toContain('<h2 id="research">The research behind it</h2>');
    expect(page.indexOf('id="research"')).toBeGreaterThan(page.indexOf('id="numbers"'));
    expect(page).toContain("<h3><cite>An invented trial of exercise for knee pain</cite> (2021)</h3>");
    expect(page).toContain("This paper carries an expression of concern from its journal.");
    expect(page).toContain("<strong>How AskRigor read it:</strong> Full text, with its methods audited by AskRigor. " +
      "Its printed figures match its own data.");
    expect(page).toContain(`<blockquote class="quote"><p>${escapeHtml(SENTENCE)}</p>`);
    expect(page).toContain("The paper’s sentence behind this finding. Found word for word in the full text AskRigor fetched, in Results.");
    expect(page).toContain(`<blockquote class="quote"><p>${escapeHtml(CONCLUSION)}</p>`);
    expect(page).toContain(`<strong>The strongest thing against it</strong> (AskRigor’s words): ${escapeHtml(AGAINST)}`);
    // Which study each figure comes from.
    expect(page).toContain('<p class="meta">From <cite>An invented trial of exercise for knee pain</cite> (2021).</p>');
    expect(page).not.toContain('id="people"');
  });

  it("shows what people report: counts of people, how good the reports are, the mechanism as one, and no study found", async () => {
    const page = await (await publishedPages([STORED_QUOTED, STORED_FORUM]))("P-1002");
    expect(atlasPageProblems(page)).toEqual([]);
    expect(page).toContain('<h2 id="people">What people report</h2>');
    expect(page).toContain("From 2 forum threads AskRigor’s own reader read, in r/kneepain, example.org. " +
      "AskRigor counts people, not comments, and quotes no one.");
    expect(page).toContain("<dt>Better</dt><dd>7 people</dd>");
    expect(page).toContain("<dt>Worse</dt><dd>1 person</dd>");
    expect(page).toContain("<strong>How good the reports are:</strong> of 11 people, 4 gave the details (what, how much, " +
      "how long, and what else changed at the same time), 1 measured the change, and 5 wrote a bare one-liner.");
    expect(page).toContain("<strong>A way it could work</strong> (a mechanism, in AskRigor’s words: it makes the reports " +
      "plausible, but it isn’t a result):");
    expect(page).toContain("No studies on this were found in the searches made for this research.");
    // No thread's link, title words or username; and a finding with no source lists none.
    for (const never of ["abc123", "my_knee_after", "knee-squats", "thread-list", 'id="sources"', 'id="research"']) {
      expect(page).not.toContain(never);
    }
  });

  it.each([
    ["outcome_mismatch", { studies: "outcome_mismatch", studies_measured: "cartilage thickness on scans, not pain" },
      "The studies found measured something else: cartilage thickness on scans, not pain. They don’t count against these reports."],
    ["contradicted", { studies: "contradicted" }, "Studies that measured it the way these reports did found otherwise."],
    ["corroborated", { studies: "corroborated" }, "Studies agree with these reports."],
  ])("says how studies relate to the reports in plain words: %s", async (_, overrides, words) => {
    const forum = { ...STORED_FORUM, sources: [STUDY], forum_signal: storedSignal(overrides) } as never;
    const page = await (await publishedPages([forum]))("P-1001");
    expect(page).toContain(`<strong>Studies:</strong> ${escapeHtml(words)}`);
  });

  it("lets search find a finding by the research behind it and by what people report", async () => {
    const source = await publishedSource([STORED_QUOTED, STORED_FORUM]);
    const found = async (text: string) => (await loadAtlasSearch(source, { search: atlasSearchQuery(text).query! })).results
      .map(({ finding, foundIn }) => [finding.publicationNumber, foundIn]);
    expect(await found("faded")).toEqual([["P-1001", ["research"]]]);
    expect(await found("strengthen")).toEqual([["P-1002", ["people"]]]);
  });

  it("escapes every text, and shows nothing of it for an older publication", async () => {
    const marked = { ...STORED_QUOTED, backing: [{ ...(STORED_QUOTED as never as { backing: object[] }).backing[0],
      sentence: "Pain <b>fell</b> by 12 points & stayed lower at 6 months in the exercise group." }] } as never;
    const page = await (await publishedPages([marked]))("P-1001");
    expect(page).toContain("Pain &lt;b&gt;fell&lt;/b&gt; by 12 points &amp; stayed lower");
    const { backing: _b, source_reading: _r, numbers: _n, ...older } = STORED_QUOTED as never as Record<string, unknown>;
    const plain = await (await publishedPages([{ ...older, numbers: [] } as never]))("P-1001");
    expect(plain).not.toContain('id="research"');
    expect(plain).not.toContain('id="people"');
  });

  it("shows an accepted finding's research behind it from its publication, with its canonical sources", async () => {
    const plan = planCardPublication({ record: record([STORED_QUOTED]), setAside: false, route: ROUTE, sourceTitles: TITLES });
    const publication: AtlasPagePublication = { publicationNumber: "P-1001", state: "accepted", atlasNumber: "F-1001",
      published: plan.drafts[0]!.published, publishedAt: "2026-11-05T12:00:00.000Z", stateChangedAt: "2026-11-06T09:00:00.000Z",
      kept: false };
    const canonicalFinding = {
      atlasNumber: "F-1001", question: "Does exercise help adults with knee pain?", links: [], entryKind: "finding",
      label: "checked", topic: { key: "knee-pain", label: "Knee pain" }, versionNumber: 1,
      content: { wording: "The owner's wording of the finding.", appliesTo: "Adults with knee pain", certainty: "moderate",
        usualAnswer: null, whyNotUsual: null, whatWouldChangeIt: null, whoElse: null, whatItChanges: null, tags: [],
        verifiedBases: ["full_text_audit"], numbers: [{ outcome: "pain halved", better: "more", option: "exercise",
          option_events: 30, option_total: 100, comparator: "usual care", comparator_events: 20, comparator_total: 100,
          follow_up: "6 months" }] },
      erased: false, acceptedOn: "2026-11-06", researchCheckedOn: "2026-11-05", askrigorVersion: "0.1.0",
      sources: [{ identifiers: [{ scheme: "doi", value: STUDY }], title: "The canonical record's title", year: 2021 }],
      contradicts: [], replacedBy: [],
    } as unknown as AtlasPageFinding;
    const source: AtlasPageSource = {
      read: async (work) => await work({
        listPublications: async () => [publication],
        readFindings: async () => [canonicalFinding],
        listCardSiblings: async () => [],
      } as unknown as AtlasPageReads),
    } as AtlasPageSource;
    const page = renderAtlasFinding((await loadAtlasFinding(source, "P-1001"))!);
    expect(page).toContain("The owner&#39;s wording of the finding.");
    expect(page).toContain("<h3><cite>The canonical record’s title</cite> (2021)</h3>".replace("’", "&#39;"));
    expect(page).toContain(`<blockquote class="quote"><p>${escapeHtml(SENTENCE)}</p>`);
    expect(page).toContain('<p class="meta">From <cite>The canonical record&#39;s title</cite> (2021).</p>');
  });
});

// Owner answer 255a: an accepted finding keeps the research behind it with its version, so one from a paid private card,
// whose publication keeps version 1's fields, shows it like any other; an erasure removes it whole.
describe("the research behind an accepted finding (owner answer 255a)", () => {
  const CARD_FIGURE = { outcome: "pain halved", better: "more" as const, option: "exercise", option_events: 30,
    option_total: 100, comparator: "usual care", comparator_events: 20, comparator_total: 100, follow_up: "6 months" };

  it("keeps what the publication would show, with each figure's source by its place while the figures are the card's", () => {
    const research = canonicalResearchOf(STORED_QUOTED as never, [CARD_FIGURE]);
    expect(research).toEqual({
      backing: [{ source: STUDY, sentence: SENTENCE, sentence_section: "Results", conclusion: CONCLUSION,
        conclusion_section: "Discussion", text: "full_text", against: AGAINST }],
      source_reading: [{ source: STUDY, read: "full_text_audited", figures: "consistent" }],
      figure_sources: [STUDY],
    });
    expect(canonicalResearchOf(STORED_QUOTED as never, [{ ...CARD_FIGURE, option_events: 31 }])).not.toHaveProperty("figure_sources");
    expect(canonicalResearchOf(STORED_FORUM as never, [])?.forum_signal).toMatchObject({ communities: ["r/kneepain",
      "example.org"], threads_read: 2, threads: [], studies: "support_not_located" });
    const { backing: _b, source_reading: _r, numbers: _n, ...older } = STORED_QUOTED as never as Record<string, unknown>;
    expect(canonicalResearchOf({ ...older, numbers: [] } as never, [])).toBeUndefined();
  });

  it("is a version's optional content, its figures' sources one a figure, and an erasure removes it whole", () => {
    const content = { wording: "Exercise eased knee pain a little.", appliesTo: "Adults with knee pain", certainty: "moderate",
      usualAnswer: null, whyNotUsual: "Quick answers lead with painkillers.", whatWouldChangeIt: "A larger trial.",
      whoElse: null, whatItChanges: null, tags: [], verifiedBases: ["full_text_audit"], numbers: [CARD_FIGURE],
      research: canonicalResearchOf(STORED_QUOTED as never, [CARD_FIGURE]) };
    const parsed = atlasVersionContentSchema.parse(content);
    expect(parsed.research?.figure_sources).toEqual([STUDY]);
    expect(atlasVersionContentSchema.safeParse({ ...content, numbers: [] }).success).toBe(false);
    expect(atlasVersionContentSchema.safeParse({ ...content, research: { backing: [{ source: STUDY,
      sentence: "Shared as ARF-0042 in the queue.", text: "full_text", against: AGAINST }] } }).success).toBe(false);
    expect(atlasErasedContent(parsed)).not.toHaveProperty("research");
    // A version stored before has none, and reads as it did.
    const { research: _research, ...before } = content;
    expect(atlasVersionContentSchema.parse(before)).not.toHaveProperty("research");
  });

  it("shows an accepted finding's own research, a paid private card's too, whose publication keeps version 1", async () => {
    const figure = CARD_FIGURE;
    const research = { ...canonicalResearchOf(STORED_QUOTED as never, [figure])!,
      forum_signal: canonicalResearchOf(STORED_FORUM as never, [])!.forum_signal };
    const publication: AtlasPagePublication = { publicationNumber: "P-1001", state: "accepted", atlasNumber: "F-1001",
      published: { ...planCardPublication({ record: record([STORED_QUOTED]), setAside: false,
        route: { route: "owner", paidPrivate: false } }).drafts[0]!.published, schema: "askrigor.atlas-publication.v1" } as never,
      publishedAt: "2026-11-05T12:00:00.000Z", stateChangedAt: "2026-11-06T09:00:00.000Z", kept: false };
    const canonicalFinding = {
      atlasNumber: "F-1001", question: "Does exercise help adults with knee pain?", links: [], entryKind: "finding",
      label: "checked", topic: { key: "knee-pain", label: "Knee pain" }, versionNumber: 1,
      content: { wording: "The owner's wording of the finding.", appliesTo: "Adults with knee pain", certainty: "moderate",
        usualAnswer: null, whyNotUsual: null, whatWouldChangeIt: null, whoElse: null, whatItChanges: null, tags: [],
        verifiedBases: ["full_text_audit", "forum_read"], numbers: [figure], research },
      erased: false, acceptedOn: "2026-11-06", researchCheckedOn: "2026-11-05", askrigorVersion: "0.1.0",
      sources: [{ identifiers: [{ scheme: "doi", value: STUDY }], title: "The canonical record's title", year: 2021,
        retraction: "retracted" }],
      contradicts: [], replacedBy: [],
    } as unknown as AtlasPageFinding;
    const source: AtlasPageSource = {
      read: async (work) => await work({
        listPublications: async () => [publication],
        readFindings: async () => [canonicalFinding],
        listCardSiblings: async () => [],
      } as unknown as AtlasPageReads),
    } as AtlasPageSource;
    const page = renderAtlasFinding((await loadAtlasFinding(source, "P-1001"))!);
    expect(page).toContain('<h2 id="research">The research behind it</h2>');
    expect(page).toContain(`<blockquote class="quote"><p>${escapeHtml(SENTENCE)}</p>`);
    expect(page).toContain("This paper has been retracted.");
    expect(page).toContain('<p class="meta">From <cite>The canonical record&#39;s title</cite> (2021).</p>');
    expect(page).toContain('<h2 id="people">What people report</h2>');
    expect(page).toContain("forum threads read in full by AskRigor");
  });
});


// The independent review of 5 November 2026, after #416 merged: what an accepted finding's page shows, a section cut
// through a character, and the review's digest read of a card saved since #398.
describe("the review of 5 November", () => {
  const pageOf = async (publication: AtlasPagePublication, finding: AtlasPageFinding) => renderAtlasFinding(
    (await loadAtlasFinding({
      read: async (work) => await work({
        listPublications: async () => [publication],
        readFindings: async () => [finding],
        listCardSiblings: async () => [],
      } as unknown as AtlasPageReads),
    } as AtlasPageSource, publication.publicationNumber))!);
  const canonical = (content: Record<string, unknown>, sources: unknown[]) => ({
    atlasNumber: "F-1001", question: "Does exercise help adults with knee pain?", links: [], entryKind: "finding",
    label: "checked", topic: { key: "knee-pain", label: "Knee pain" }, versionNumber: 1,
    content: { wording: "The owner's wording of the finding.", appliesTo: "Adults with knee pain", certainty: "low",
      usualAnswer: null, whyNotUsual: null, whatWouldChangeIt: null, whoElse: null, whatItChanges: null, tags: [],
      verifiedBases: ["forum_read"], numbers: [], ...content },
    erased: false, acceptedOn: "2026-11-06", researchCheckedOn: "2026-11-05", askrigorVersion: "0.1.0",
    sources, contradicts: [], replacedBy: [],
  }) as unknown as AtlasPageFinding;

  // Finding 3: a decided draft goes through the version 3 path, so an accepted forum-only finding gets its page, from a
  // paid private card's acceptance or from a card that has no publication.
  it("publishes an accepted forum-only finding as version 3, and its page shows what people report", async () => {
    const forumRecord = record([STORED_FORUM]);
    const draft = decidedPublicationDraft(forumRecord, 1, { state: "accepted", atlasNumber: "F-1001" });
    expect(draft).toMatchObject({ findingNumber: 1, state: "accepted", atlasNumber: "F-1001", heldBecause: null,
      published: { schema: ATLAS_PUBLICATION_SCHEMA_V3, sources: [], forum_signal: { threads_read: 2 } } });
    const owner = planCardPublication({ record: forumRecord, setAside: false, route: { route: "owner", paidPrivate: false },
      decided: new Map([[1, { state: "accepted" as const, atlasNumber: "F-1001" }]]) });
    expect(owner).toMatchObject({ problems: [], leftOut: [],
      drafts: [{ state: "accepted", atlasNumber: "F-1001", published: { schema: ATLAS_PUBLICATION_SCHEMA_V3 } }] });
    // A decided finding with sources takes its card's context too.
    const quoted = planCardPublication({ record: record([STORED_QUOTED]), setAside: false,
      route: { route: "owner", paidPrivate: false }, decided: new Map([[1, { state: "edited" as const, atlasNumber: "F-1001" }]]),
      sourceTitles: TITLES });
    expect(quoted.drafts[0]).toMatchObject({ state: "edited", published: { schema: ATLAS_PUBLICATION_SCHEMA_V3,
      source_details: [{ source: STUDY, retraction: "expression_of_concern" }] } });
    const publication: AtlasPagePublication = { publicationNumber: "P-1001", state: "accepted", atlasNumber: "F-1001",
      published: draft!.published, publishedAt: "2026-11-05T12:00:00.000Z", stateChangedAt: "2026-11-06T09:00:00.000Z",
      kept: false };
    const page = await pageOf(publication, canonical({ research: canonicalResearchOf(STORED_FORUM as never, []) }, []));
    expect(atlasPageProblems(page)).toEqual([]);
    expect(page).toContain("The owner&#39;s wording of the finding.");
    expect(page).toContain('<h2 id="people">What people report</h2>');
    expect(page).toContain("From 2 forum threads AskRigor’s own reader read, in r/kneepain, example.org.");
  });

  // Finding 4: the owner keeps one study and drops another, a retracted one: neither the version's research nor the
  // page shows the dropped one, and each source shown has its retraction status looked up.
  it("never shows a source the owner dropped, and shows each kept source's retraction status", async () => {
    const dropped = "10.1000/dropped-retracted";
    const twoSources = { ...STORED_QUOTED, sources: [dropped, STUDY], numbers: [],
      backing: [{ source: dropped, sentence: "Pain fell by 12 points in the dropped trial.", text: "full_text", against: "Small." },
        ...(STORED_QUOTED as never as { backing: object[] }).backing],
      source_reading: [{ source: dropped, read: "full_text_audited" }, { source: STUDY, read: "full_text_audited" }],
    } as never;
    const keptOnly = canonicalResearchOf(twoSources, [], [STUDY]);
    expect(keptOnly?.backing?.map(({ source }) => source)).toEqual([STUDY]);
    expect(keptOnly?.source_reading?.map(({ source }) => source)).toEqual([STUDY]);
    expect(canonicalResearchOf(twoSources, [], ["https://doi.org/10.1000/DEPTH"])?.backing).toHaveLength(1);
    expect(researchKeeping(canonicalResearchOf(twoSources, [])!, (source) => source === STUDY)).toEqual(keptOnly);
    expect(researchKeeping({ backing: keptOnly!.backing! }, () => false)).toBeUndefined();
    // Even a version whose research still holds the dropped source, and a publication that does, show only the kept one.
    const sources = [{ identifiers: [{ scheme: "doi", value: STUDY }], title: "The kept trial", year: 2021, retraction: "retracted" }];
    const publication: AtlasPagePublication = { publicationNumber: "P-1001", state: "accepted", atlasNumber: "F-1001",
      published: planCardPublication({ record: record([twoSources]), setAside: false, route: ROUTE }).drafts[0]!.published,
      publishedAt: "2026-11-05T12:00:00.000Z", stateChangedAt: "2026-11-06T09:00:00.000Z", kept: false };
    for (const research of [canonicalResearchOf(twoSources, []), undefined]) {
      const page = await pageOf(publication, canonical({ verifiedBases: ["full_text_audit"],
        ...(research === undefined ? {} : { research }) }, sources));
      expect(page).not.toContain("dropped");
      expect(page).toContain("<h3><cite>The kept trial</cite> (2021)</h3>");
      expect(page).toContain("This paper has been retracted.");
      expect(page).toContain(`<blockquote class="quote"><p>${escapeHtml(SENTENCE)}</p>`);
    }
  });

  // Finding 6: a section is cut at whole characters before the receipt encodes it, so a character outside the Basic
  // Multilingual Plane at the limit never leaves half of itself to stop the final check.
  it("cuts a section at whole characters, with 𝛽 at the limit, and the receipt is issued", () => {
    const section = `${"Effects of oat supplementation on pain: ".padEnd(79, "x")}𝛽-glucan arm`;
    expect(section.length).toBeGreaterThan(80);
    const { bs } = signedBackingClaims([{ finding: 0, line: 0, lookup: { ...FOUND, sentence_section: section } }]);
    expect(bs[0]).toBe(`1.1.s:${section.slice(0, 79)}`);
    expect(() => issueResearchReceipt("finalization", { status: "ready", bs }, { secret: SECRET })).not.toThrow();
    // Room for the whole character keeps it whole.
    const fits = `${"x".repeat(78)}𝛽 and more`;
    expect(signedBackingClaims([{ finding: 0, line: 0, lookup: { ...FOUND, sentence_section: fits } }]).bs[0])
      .toBe(`1.1.s:${"x".repeat(78)}𝛽`);
    expect(receiptText("ab\ud835", 10)).toBe("ab�");
    expect(receiptText(`${"x".repeat(119)}𝛽`, 120)).toBe("x".repeat(119));
    const index = { source: { provider: "europe_pmc" }, blocks: [{ text: SENTENCE, section_path: [`${"x".repeat(119)}𝛽`] }] };
    expect(sourceLineDocument(index as never).blocks[0]!.section).toBe("x".repeat(119));
    // What the save reads back is the same section.
    const given = laterFindingsCardSchema.parse(card());
    expect(findingBackingFromReceipt(["1.1:ff:full_text"], bs, given, () => undefined).get(0)![0]!.sentence_section)
      .toBe(section.slice(0, 79));
  });

  // Finding 8: a card saved after #398 and before its record named the declarations it leaves out stored its findings
  // without draws_on_youtube_comments, false on each: the review reads it against either form of the digest.
  it("reads a card saved since #398 with its declarations left out unnamed against either digest form", async () => {
    const declared = card({ quote: { draws_on_youtube_comments: false }, forum: null });
    const h = saveHarness();
    await h.save(declared, { rd: ["1.1:full_text_audited:consistent"], bl: ["1.1:ff:full_text"],
      bs: ["1.1.s:Results", "1.1.c:Discussion"] });
    const body = h.github.issue(42).body;
    expect((storedRecordOf(body) as FindingsRecord).stored_without).toEqual(["youtube_comment_declarations"]);
    // The record as a save before the marker wrote it: no stored_without at all.
    const unmarked = body.replace(/,\n {2}"stored_without": \[\n {4}"youtube_comment_declarations"\n {2}\]/u, "");
    expect(unmarked).not.toBe(body);
    expect((storedRecordOf(unmarked) as FindingsRecord).stored_without).toBeUndefined();
    expect(parseFindingsRecordBody(unmarked, "card")).toMatchObject({ record: { card_sha256: findingsCardDigest(
      laterFindingsCardSchema.parse(declared)) } });
    // Hand-edited, it reads as tampered under both forms.
    expect(parseFindingsRecordBody(unmarked.replaceAll("A larger invented trial", "A larger trial"), "card")).toBe("tampered");
  });

  // The review of #417 (finding 6): a production card holds draws_on_youtube_comments false on its first finding and
  // none on its second, as the check had them. The stored form is read exactly as stored first.
  it("reads a card stored with its findings' declarations as the check had them, mixed included", async () => {
    const { backing: _backing, ...quoted } = card({ forum: null }).findings[0]!;
    const first = { ...quoted, draws_on_youtube_comments: false };
    const second = { ...quoted, claim: "A second invented finding about knee pain at night.",
      answer_quote: "A second invented finding about knee pain at night." };
    const mixed = { ...card({ forum: null }), findings: [first, second] };
    const h = saveHarness();
    await h.save(mixed, {});
    const body = h.github.issue(42).body;
    const record = storedRecordOf(body) as FindingsRecord & { card: { findings: Array<Record<string, unknown>> } };
    // The record as such a save wrote it: the first finding's declaration kept, none named as left out.
    const { stored_without: _without, ...rest } = record;
    const asStored = { ...rest, card: { ...record.card, findings: [{ ...record.card.findings[0], draws_on_youtube_comments: false },
      record.card.findings[1]] } };
    const production = body.replace(/(`{3,})json\n[\s\S]*?\n\1/u, (_, fence: string) =>
      `${fence}json\n${JSON.stringify(asStored, null, 2)}\n${fence}`);
    expect(parseFindingsRecordBody(production, "card")).toMatchObject({ record: { card_sha256: findingsCardDigest(
      laterFindingsCardSchema.parse(mixed)) } });
    expect(parseFindingsRecordBody(production.replaceAll("Quick answers lead with painkillers.",
      "Quick answers lead with something else."), "card")).toBe("tampered");
    // The recheck of #417: a record that left both declarations out unnamed reads against the digest of the card the
    // check had, one finding declared false and the other not declaring: each finding's form is tried apart.
    const leftOut = { ...rest, card: { ...record.card, findings: record.card.findings.map((finding) => {
      const { draws_on_youtube_comments: _declared, ...kept } = finding;
      return kept;
    }) } };
    const unnamed = body.replace(/(`{3,})json\n[\s\S]*?\n\1/u, (_, fence: string) =>
      `${fence}json\n${JSON.stringify(leftOut, null, 2)}\n${fence}`);
    expect(parseFindingsRecordBody(unnamed, "card")).toMatchObject({ record: { card_sha256: findingsCardDigest(
      laterFindingsCardSchema.parse(mixed)) } });
    expect(parseFindingsRecordBody(unnamed.replaceAll("Quick answers lead with painkillers.",
      "Quick answers lead with something else."), "card")).toBe("tampered");
    // A stored finding declared as drawing on YouTube comments is never published, as one held at the save is not.
    const drawn = { ...(record.card.findings[1] as object), draws_on_youtube_comments: true } as never;
    expect(planCardPublication({ record: { ...rest, card: { ...record.card, findings: [record.card.findings[0], drawn] } } as never,
      setAside: false, route: ROUTE }).leftOut).toEqual([{ findingNumber: 2, reason: "youtube_comments" }]);
  });

  // The review of #417 (finding 7): the literature search's query is checked, never kept, a kept copy of an unsaved card
  // included; (finding 8) a punycode community shows in Unicode on its page.
  it("keeps no search query in an unsaved card's copy, and shows a punycode community in Unicode", async () => {
    const copy = unsavedCardCopy(card(), false)!;
    expect(JSON.stringify(copy.card)).not.toContain(SEARCH);
    expect(copy.leftOut).toContain("findings[1].forum_signal.search_query: the literature search's query, which is checked, never kept");
    const idn = { ...STORED_FORUM, forum_signal: { ...storedSignal(), communities: ["r/kneepain", "xn--e1afmkfd.xn--p1ai"] } } as never;
    const page = await (await publishedPages([idn]))("P-1001");
    expect(page).toContain("in r/kneepain, пример.рф.");
    expect(page).not.toContain("xn--e1afmkfd");
  });
});
