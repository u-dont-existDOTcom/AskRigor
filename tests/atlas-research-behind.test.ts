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
  planCardPublication,
  publicationHoldReasons,
  researchBehindOf,
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
  forumCommunityOf,
  publishedThreadLink,
  researchBehindProblems,
  signedBackingClaims,
  signedReadingClaims,
  sourceIdKey,
  type ResearchBehindContext,
} from "../apps/research-mcp/src/findings/research-behind.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
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
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
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
const threadRead = (url: string) => receipt("forum_thread_read", { u: forumThreadDigest(url), n: 40, v: "reddit" });

function fixture(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  return {
    receipts: [
      receipt("study_audit", { doi: STUDY, content: "a".repeat(16), handle: HANDLE, fig: "consistent" }),
      receipt("literature_search", { src: "pubmed", q: "0123456789abcdef", n: 0 }),
      threadRead(THREAD),
      threadRead(FORUM_THREAD),
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
    literatureSearched: true,
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
    expect(problems(card(), { literatureSearched: false }))
      .toEqual([expect.stringMatching(/support_not_located, but no literature search was passed here/u)]);
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

  it("refuses the card, not the answer, for a thread not read here", () => {
    const unread = card({ forum: { forum_signal: signal({ threads: ["https://forum.example.org/t/unread/9"] }) } });
    const result = finalizeResearch(fixture({ findings_card: laterFindingsCardSchema.parse(unread) }), OPTIONS);
    expect(result.status).toMatch(/^ready/u);
    expect(result.findings_card?.status).toBe("rejected");
    expect(result.findings_card?.problems.join(" ")).toMatch(/threads\[0\] was not read here/u);
    expect(signedClaims(result.finalization_receipt)).not.toHaveProperty("findings");
  });

  // 5 Nov 2026: a read receipt also signs the link as asked when the site sent the reader to another page of its own.
  // A forum signal may give either link, and each thread counts once, by the link the reader landed on.
  it("takes a thread by the link asked for when the site sent the reader to another, and counts it once", () => {
    const asked = "https://forum.example.org/forum/topic/4512-knee-squats/page-2";
    const landed = "https://forum.example.org/viewtopic.php?t=104512&start=30";
    const redirected = receipt("forum_thread_read",
      { u: forumThreadDigest(landed), a: forumThreadDigest(asked), n: 900, v: "page" });
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

describe("thread links and communities", () => {
  it("publishes a Reddit post by its id, never a user's name or the title's words", () => {
    expect(publishedThreadLink(THREAD)).toBe("https://www.reddit.com/comments/abc123/");
    expect(publishedThreadLink("https://old.reddit.com/user/some_person/comments/xyz789/a_title/")).toBe("https://www.reddit.com/comments/xyz789/");
    expect(publishedThreadLink("https://redd.it/abc123")).toBe("https://www.reddit.com/comments/abc123/");
    expect(publishedThreadLink("https://www.reddit.com/user/some_person/")).toBeUndefined();
  });

  it("keeps another forum's link as read, without its fragment, session or tracking, and refuses a person's page", () => {
    expect(publishedThreadLink(FORUM_THREAD)).toBe("https://forum.example.org/t/knee-squats/4512");
    expect(publishedThreadLink("https://forum.example.org/viewtopic.php?t=12&sid=abcdef")).toBe("https://forum.example.org/viewtopic.php?t=12");
    expect(publishedThreadLink("https://forum.example.org/members/someone.12/")).toBeUndefined();
    expect(publishedThreadLink("https://user:pass@forum.example.org/t/1")).toBeUndefined();
    expect(publishedThreadLink("https://youtu.be/aaaaaaaaaaa")).toBeUndefined();
  });

  it("names the community from the link", () => {
    expect(forumCommunityOf(THREAD)).toBe("r/KneePain");
    expect(forumCommunityOf("https://redd.it/abc123")).toBe("Reddit");
    expect(forumCommunityOf("https://www.healthforum.example/thread/1")).toBe("healthforum.example");
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
      bs: ["1.1.s:Results", "1.1.c:Discussion"] })).resolves.toMatchObject({ status: "saved" });
    const body = h.github.issue(42).body;
    const record = storedRecordOf(body) as FindingsRecord;
    const [quoted, forum] = record.card.findings;
    expect(quoted!.backing).toEqual([{ ...backingLine, sentence_section: "Results", conclusion_section: "Discussion",
      text: "full_text" }]);
    expect(quoted!.source_reading).toEqual([{ source: STUDY, read: "full_text_audited", figures: "consistent" }]);
    // A finding resting on its forum signal alone is saved, with no source. The free notice says a card's community
    // summary holds no links, so the signal keeps its communities and how many threads were read, never the links.
    expect(forum!.sources).toEqual([]);
    const { threads: _threads, ...counted } = signal();
    expect(forum!.forum_signal).toEqual({ ...counted, communities: ["r/KneePain", "forum.example.org"], threads_read: 2 });
    expect(record.stored_without).toEqual(["forum_thread_links"]);
    expect(body).not.toContain("abc123");
    expect(body).not.toContain("knee-squats");
    expect(body).toContain("- Research behind it, 10\\.1000/depth \\(found in the full text AskRigor fetched\\)");
    expect(body).toContain("- What people report: better 7, no change 2, worse 1, mixed 1");
    expect(body).toContain("- Forum threads read: 2, in r/KneePain, forum\\.example\\.org");
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
      await h.save(card(), {}, account);
      const body = h.github.issue(42).body;
      const signal = (storedRecordOf(body) as FindingsRecord).card.findings[1]!.forum_signal!;
      if (links) {
        expect(signal.threads).toEqual(["https://www.reddit.com/comments/abc123/", "https://forum.example.org/t/knee-squats/4512"]);
        expect(body).toContain("forum\\.example\\.org/t/knee\\-squats/4512");
      } else {
        expect(signal).not.toHaveProperty("threads");
        expect(body).not.toContain("abc123");
      }
      // Never the title's words, a username or a tracking parameter.
      expect(body).not.toMatch(/my_knee_after|utm_source|post-7/u);
      expect(parseFindingsRecordBody(body, "card")).not.toBe("tampered");
    }
  });

  it("treats the forum signal's words as card text, and leaves a YouTube thread out", () => {
    const given = laterFindingsCardSchema.parse(card({ forum: { forum_signal: signal({
      threads: [THREAD, "https://youtu.be/aaaaaaaaaaa"],
      mechanism: "As https://youtu.be/bbbbbbbbbbb shows, slow loading may strengthen the knee.",
    }) } }));
    const stored = withoutYouTubeData(given);
    expect(stored.card.findings[1]!.forum_signal).toMatchObject({ communities: ["r/KneePain"], threads_read: 1,
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
  const { threads: _threads, ...counted } = signal(overrides);
  return { ...counted, communities: ["r/KneePain", "forum.example.org"], threads_read: 2 };
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
        communities: ["r/KneePain", "forum.example.org"], threads_read: 2, threads: [],
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

  // Waiting for the owner (plan, owner questions): a signal that holds its threads' links, which the save stores only
  // once a notice covers them, publishes each as the pages show it.
  it("publishes a thread link as the pages show it, from a signal that holds one", () => {
    const research = researchBehindOf({ ...STORED_FORUM, forum_signal: { ...storedSignal(), threads: [THREAD, FORUM_THREAD,
      "https://forum.example.org/members/someone.12/"] } } as never, { sources: [], numbers: null });
    expect(research?.forum_signal?.threads).toEqual(["https://www.reddit.com/comments/abc123/",
      "https://forum.example.org/t/knee-squats/4512"]);
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
    expect(page).toContain("From 2 forum threads AskRigor’s own reader read, in r/KneePain, forum.example.org. " +
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
    expect(canonicalResearchOf(STORED_FORUM as never, [])?.forum_signal).toMatchObject({ communities: ["r/KneePain",
      "forum.example.org"], threads_read: 2, threads: [], studies: "support_not_located" });
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

