import { runInNewContext } from "node:vm";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { atlasSourceDigest } from "../apps/research-mcp/src/atlas/reuse.js";
import { FINAL_CHECK_PANEL_RENDER_SOURCE } from "../apps/research-mcp/src/final-check-panel.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import {
  READ_DEPTH_VALUES, communitySkipCaveat, finalizeResearch, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  ANSWER_READINGS, ANSWER_READING_LABELS, LINKED_READING_LABELS, READING_RESULT_WHEN, SHOWN_READINGS, compareReadings,
  declarableReading, deepestRead, deepestShown, identifierShown, judgeSourceReading, linkedReading, readingResultNote, readingShown,
  receiptReadingNote, receiptReadings, sourceReadingGuidance, sourceReadingQuoteSchema, verifiedAnswerReading,
  type AnswerReading, type ShownReading
} from "../apps/research-mcp/src/source-reading.js";
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// How each key study was read, said beside it (the owner, 5 Nov 2026: "make sure askrigor is enforcing that the AI tells
// people what it actually read, like 'In this study (abstract read/full text read/full text and images analyzed)'").
// source_reading, a later input of finalize_research, gives each key source's reading and copies the answer's words for
// it; under the read_depth blocking rule, a key source the draft cites needs an entry whose quote the draft shows and
// whose reading claims no more than the check verifies (the review of 5 Nov 2026). The studies, identifiers and
// receipts are synthetic fixtures, not evidence about a treatment.
const SECRET = "source-reading-test-secret-0123456789abcdefgh";
const TARGET = "Synthetic reading labels beside each study";
const DOI = "10.1000/reading-trial";
const OTHER_DOI = "10.1000/reading-cohort";
const PMID = "31415926";
const REASON = "Synthetic fixture isolates the reading labels.";
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: REASON };
const AUDITED = "full text read, methods audited by AskRigor";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const audit = sign("study_audit", { doi: DOI, content: "a".repeat(16) });
// The answer as the person sees it, ending with the community-skip sentence its declaration needs (owner question 125).
const draft = (...paragraphs: string[]) => [...paragraphs, communitySkipCaveat(REASON)].join("\n\n");
const STUDY = `[Trial](https://doi.org/${DOI}) (${AUDITED}) compared two routines.`;
const input = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  receipts: [audit], research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: REASON, commercial_review_applicability: NOT_APPLICABLE, intervention_identity: NOT_APPLICABLE,
  full_text_search: { status: "not_needed", reason: REASON }, lab_preparation: NOT_APPLICABLE,
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [],
  answer_draft: draft(STUDY),
  later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED }] },
  ...overrides
});
// An entry giving a reading and the words for it.
const entry = (source: string, reading: AnswerReading, quote = ANSWER_READING_LABELS[reading]) => ({ source, reading, quote });
const check = (overrides: Record<string, unknown> = {}) =>
  assertNextStepsContract(finalizeResearch(input(overrides), { secret: SECRET }));
const readingSteps = (result: FinalizeResearchOutput) => result.next_steps.filter((step) => step.includes("how it was read"));

// Each step, word for word.
const missing = (id: string, reading?: AnswerReading) => reading === undefined
  ? `Key source ${id} is cited in the answer without saying how it was read: give it a read_depth its receipts ` +
    "support, say beside it how it was read, in the answer's language, and give later_inputs.source_reading an entry " +
    `for it, with source ${id}, that reading, and quote those words copied from answer_draft.`
  : `Key source ${id} is cited in the answer without saying how it was read (${ANSWER_READING_LABELS[reading]}): say ` +
    "so beside it, in the answer's language, and give later_inputs.source_reading an entry for it, with source " +
    `${id}, reading ${reading}, and quote those words copied from answer_draft.`;
// The step for a reading claiming more: it names the verified reading, or with none what the receipts show, names the
// entry to remove or change exactly (the fourth check of 5 Nov 2026), and offers a lower reading a read_depth declares
// with no receipt (the recheck of 5 Nov 2026).
// With leadOnly, the receipts show no reading, only a lead that found that much readable (Greptile's review of 12 Nov
// 2026): the step names it as the most an entry may say, not as a reading the receipts show.
// With read too, they show that reading read beside the lead, which the step names and never denies (Greptile's review
// of #441, 13 Nov 2026).
const claimsMore = (id: string, given: AnswerReading, verified: AnswerReading,
  { shownOnly = false, offer = false, leadOnly = false, read }:
  { shownOnly?: boolean; offer?: boolean; leadOnly?: boolean; read?: AnswerReading } = {}) => `source_reading gives ${id} ` +
  `the reading ${given} (${ANSWER_READING_LABELS[given]}), more than this call's receipts show: ` +
  (leadOnly ? (read === undefined ? "they show no reading of it, only a full-text lead that"
    : `they show ${read} (${ANSWER_READING_LABELS[read]}), and a full-text lead that`) +
    ` found no more of it readable than ${verified} (${ANSWER_READING_LABELS[verified]}), the most an entry may say.`
    : (shownOnly ? "they show" : "this check verifies") + ` ${verified} (${ANSWER_READING_LABELS[verified]}).`) +
  " Remove the " +
  `source_reading entry claiming ${given} for ${id}, or change its reading to ${verified}, with the answer's words ` +
  "saying so, in its language, copied into its quote" +
  (offer ? `; or, if it was read so, give key_sources.read_depth ${given} for it, ` +
  "which needs no receipt." : given === "other_tool" ? "; or, if it was read through another tool, give it " +
  "other_route read in key_sources." : ".");
// The note for an entry set aside, its words not in the answer.
const setAside = (id: string, reading: AnswerReading) => `source_reading's entry claiming ${reading} for ${id} quotes ` +
  "words the answer doesn't show, so it is set aside: copy them exactly from answer_draft, or leave the entry out.";
const GUIDANCE_LEAD = "Say beside each study how it was read, in the answer's language, and give each in " +
  "later_inputs.source_reading as {source, reading, quote}: source its id as key_sources gives it, reading as named " +
  "here, and quote those words, copied from answer_draft: ";
const claimsLess = (id: string, given: AnswerReading, verified: AnswerReading) => `source_reading gives ${id} the ` +
  `reading ${given} (${ANSWER_READING_LABELS[given]}), less than this check verifies: ${verified} ` +
  `(${ANSWER_READING_LABELS[verified]}). The answer may say so beside it.`;
const unshown = (id: string, reading: AnswerReading) => `source_reading's quote for ${id} is not in the answer: say ` +
  `beside it how it was read (${ANSWER_READING_LABELS[reading]}), in the answer's language, and copy those words ` +
  "exactly from answer_draft into the entry's quote.";

describe("source_reading: its shape and words", () => {
  it("is a later input of finalize_research, with a reading for each read_depth, search copies, a listing and another tool", () => {
    expect(laterInputNames("finalize_research")).toContain("source_reading");
    expect([...ANSWER_READINGS].sort())
      .toEqual([...READ_DEPTH_VALUES, "search_copy_audited", "search_copy_read", "found_in_search", "other_tool"].sort());
  });

  it("words each reading as the owner's examples do, with no semicolon to blur the list", () => {
    expect(ANSWER_READING_LABELS).toMatchObject({
      full_text_audited: "full text read, methods audited by AskRigor",
      // As the Atlas reads a card's sources (owner answer 252a): an audit of a copy AskRigor didn't fetch says so.
      search_copy_audited: "full text read from a copy the AI found, methods audited by AskRigor",
      full_text_read: "full text read",
      // The review of 5 Nov 2026: a full reading of the AI's own copy says so too, and a search's listing is no reading.
      search_copy_read: "full text read from a copy the AI found",
      found_in_search: "found in a search, not read",
      partial_text: "part of the text read",
      abstract_only: "abstract only",
      conference_abstract: "abstract only",
      atlas_checked: "from a checked Atlas finding",
      other_tool: "read through another tool, not checked by AskRigor"
    });
    for (const label of Object.values(ANSWER_READING_LABELS)) expect(label).not.toMatch(/[;；]/u);
    // "Full text and figures analyzed" waits for AskRigor's figure reading, which isn't built: no label claims it.
    expect(Object.values(ANSWER_READING_LABELS).join(" ")).not.toMatch(/figure|image/iu);
  });

  it("reads what the check verified first, then a lower declaration no receipt can contradict", () => {
    const none = { audited: false, read: false, atlasChecked: false };
    expect(verifiedAnswerReading("atlas_checked", { ...none, atlasChecked: true })).toBe("atlas_checked");
    expect(verifiedAnswerReading("atlas_checked", none)).toBeUndefined();
    expect(verifiedAnswerReading("atlas_checked", { ...none, audited: true, read: true })).toBe("full_text_audited");
    expect(verifiedAnswerReading("partial_text", { ...none, audited: true, read: true })).toBe("full_text_audited");
    expect(verifiedAnswerReading("full_text_audited", { ...none, audited: true, searchCopy: true, read: true }))
      .toBe("search_copy_audited");
    expect(verifiedAnswerReading("full_text_audited", { ...none, read: true })).toBe("full_text_read");
    expect(verifiedAnswerReading("full_text_read", { ...none, read: true, readSearchCopy: true })).toBe("search_copy_read");
    expect(verifiedAnswerReading("full_text_audited", none)).toBeUndefined();
    expect(verifiedAnswerReading("full_text_read", none)).toBeUndefined();
    expect(verifiedAnswerReading(undefined, none)).toBeUndefined();
    for (const declared of ["partial_text", "abstract_only", "conference_abstract", "secondary_only", "metadata_only",
      "inaccessible", "route_error"] as const) {
      expect(verifiedAnswerReading(declared, { ...none, atlasChecked: true })).toBe(declared);
    }
  });

  it("names a source by its identifier exactly, in any language's punctuation", () => {
    expect(identifierShown(`See doi:${DOI.toUpperCase()}.`, DOI)).toBe(true);
    expect(identifierShown(`(${DOI}), then`, DOI)).toBe(true);
    expect(identifierShown(`見る ${DOI}。次の文`, DOI)).toBe(true);
    expect(identifierShown(`${DOI}.2 is another paper`, DOI)).toBe(false);
    expect(identifierShown(`${DOI}-b is another paper`, DOI)).toBe(false);
    expect(identifierShown(`${DOI}s is another paper`, DOI)).toBe(false);
    expect(identifierShown(`PMID ${PMID}.`, PMID)).toBe(true);
    expect(identifierShown(`PMID ${PMID}1.`, PMID)).toBe(false);
    expect(identifierShown(`2${PMID}`, PMID)).toBe(false);
    expect(identifierShown("PMCID pmc7654321;", "PMC7654321")).toBe(true);
    expect(identifierShown("PMC76543210", "PMC7654321")).toBe(false);
    // A web address names its page as a link, which the gate's link check reads.
    expect(identifierShown("https://example.org/a", "https://example.org/a")).toBe(false);
  });
});

// Each reading, from the receipts and the declaration, with the source it applies to.
const PUBMED = sign("pubmed_record", { pmid: PMID, doi: DOI });
// Another paper, a cohort known by its PubMed record.
const COHORT = sign("pubmed_record", { pmid: PMID, doi: OTHER_DOI });
const LEAD = sign("full_text_lead", { doi: DOI, state: "ABSTRACT_ONLY" });
const ATLAS_URL = "https://askrigor.com/atlas/findings/P-1001";
const ATLAS_QUOTE = `The Atlas holds [this finding](${ATLAS_URL}) on the same trial.`;
const atlasLookup = issueResearchReceipt("atlas_lookup", {
  words: ["synthetic"], target: researchTargetDigest(TARGET), origin: "https://askrigor.com",
  found: [`P-1001|F-1001|c|${atlasSourceDigest({ scheme: "doi", value: DOI })}`]
}, { secret: SECRET });
// Each case: the reading, the call's receipts, the key source, and what AskRigor's receipts show when they don't show the
// reading itself (the review of 5 Nov 2026), for the panel to list it apart.
type Case = [AnswerReading, Record<string, unknown>, Record<string, unknown>, AnswerReading | undefined, boolean];
const CASES: ReadonlyArray<Case> = [
  ["full_text_audited", { receipts: [audit] }, { status: "validated", read_depth: "full_text_audited" }, undefined, true],
  ["search_copy_audited", { receipts: [sign("study_audit", { doi: DOI, content: "c".repeat(16),
    retrieval_provider: "client_search_index", host: "copies.example.org" })] },
  { status: "validated", read_depth: "full_text_audited" }, undefined, true],
  ["full_text_read", { receipts: [sign("full_text_read", { doi: DOI, content: "b".repeat(16) })] },
    { status: "validated", read_depth: "full_text_read" }, undefined, true],
  ["search_copy_read", { receipts: [sign("full_text_read", { doi: DOI, content: "b".repeat(16),
    retrieval_provider: "client_search_index", host: "copies.example.org" })] },
  { status: "validated", read_depth: "full_text_read" }, undefined, true],
  // A PubMed record shows its abstract, its record and a listing; the rest of these are the AI's own account.
  ...(["partial_text", "abstract_only", "conference_abstract", "secondary_only", "metadata_only", "inaccessible",
    "route_error"] as const).map((read_depth): Case => {
    const shown = ["abstract_only", "conference_abstract", "metadata_only"].includes(read_depth);
    return [read_depth, { receipts: [PUBMED] }, { status: "lead_only", read_depth }, shown ? undefined : "abstract_only", shown];
  }),
  ["other_tool", { receipts: [LEAD] }, { status: "lead_only", read_depth: "abstract_only", other_route: "read" },
    "lead_abstract_readable", false],
  ["atlas_checked", {
    receipts: [atlasLookup],
    atlas_reuse: [{ number: "P-1001", relation: "confirms", answer_quote: ATLAS_QUOTE, page_url: ATLAS_URL }]
  }, { status: "validated", read_depth: "atlas_checked" }, undefined, true]
];

describe("each reading, as the check verified it", () => {
  it.each(CASES)("%s: named up front, asked for beside a cited study, and met by the answer's words", (reading, extra, source, receipts, shown) => {
    const label = ANSWER_READING_LABELS[reading];
    const keySources = [{ id: DOI, answer_marker: "Trial", ...source }];
    const atlas = reading === "atlas_checked" ? [ATLAS_QUOTE] : [];
    const cited = `[Trial](https://doi.org/${DOI}) compared two routines`;
    const blocked = check({ ...extra, key_sources: keySources, later_inputs: {},
      answer_draft: draft(`${cited}.`, ...atlas) });
    expect(blocked.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading, shown,
      ...(receipts === undefined ? {} : { receipts }) }]);
    expect(blocked.status).toBe("not_ready");
    expect(readingSteps(blocked)).toEqual([missing(DOI, reading)]);
    const met = check({ ...extra, key_sources: keySources, answer_draft: draft(`${cited} (${label}).`, ...atlas),
      later_inputs: { source_reading: [entry(DOI, reading)] } });
    expect(met.next_steps).toEqual([]);
    expect(met.status).toMatch(/^ready/u);
    expect(advisoryNotes(met).join(" ")).not.toContain("source_reading");
    expect(met.source_reading).toEqual(blocked.source_reading);
  });

  it("asks for a read_depth its receipts support when the reading is not known", () => {
    const result = check({ receipts: [PUBMED], later_inputs: {},
      key_sources: [{ id: DOI, status: "lead_only", answer_marker: "Trial" }] });
    expect(result.source_reading).toBeUndefined();
    expect(readingSteps(result)).toEqual([missing(DOI)]);
    expect(advisoryNotes(result)).toEqual(expect.arrayContaining([expect.stringContaining("Give key_sources.read_depth")]));
  });

  it("names what the receipts show when a declared reading is refused", () => {
    const result = check({ receipts: [sign("full_text_read", { doi: DOI, content: "b".repeat(16) })], later_inputs: {} });
    expect(result.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "full_text_read", shown: true }]);
    expect(result.next_steps).toEqual([
      `Key source ${DOI} cannot support read_depth full_text_audited with these receipts; give read_depth ` +
        "full_text_read, or pass its matching research_receipt.",
      missing(DOI, "full_text_read")
    ]);
  });
});

// The review of 5 Nov 2026: an answer saying "full text read" passed on a PubMed record alone, once read_depth was
// lowered, and a quote with no reading in it passed too. Each entry now gives its reading, held exactly to the one the
// check verifies; the words stay the model's, in any language.
describe("the reading each entry gives, held to what the check verifies", () => {
  const ABSTRACT = "abstract only";
  const fromRecord = (given: AnswerReading, words = ANSWER_READING_LABELS[given], depth = "abstract_only") => check({
    receipts: [PUBMED],
    key_sources: [{ id: DOI, status: "lead_only", read_depth: depth, answer_marker: "Trial" }],
    answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${words}) compared two routines.`),
    later_inputs: { source_reading: [entry(DOI, given, words)] }
  });

  it("blocks a reading claiming more than the receipts show, under read_depth, naming the verified one", () => {
    for (const given of ["full_text_audited", "full_text_read", "search_copy_read", "partial_text"] as const) {
      const result = fromRecord(given);
      expect(result.status, given).toBe("not_ready");
      expect(result.next_steps).toEqual([claimsMore(DOI, given, "abstract_only", { offer: given === "partial_text" })]);
      expect(result.next_step_kinds).toEqual(["answer_draft"]);
    }
    // Lowering read_depth alone, the words and the reading left as they were, still blocks (the probe's second round).
    const lowered = fromRecord("full_text_read", "full text read");
    expect(lowered.next_steps).toEqual([claimsMore(DOI, "full_text_read", "abstract_only")]);
    // Said as the check verifies it, it passes.
    expect(fromRecord("abstract_only", ABSTRACT).next_steps).toEqual([]);
  });

  it("holds a full text AskRigor fetched apart from a copy the AI found, however deep the copy was read", () => {
    const copy = { retrieval_provider: "client_search_index", host: "copies.example.org" };
    const run = (receipt: string, depth: string, given: AnswerReading) => check({
      receipts: [receipt], key_sources: [{ id: DOI, status: "validated", read_depth: depth, answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ANSWER_READING_LABELS[given]}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, given)] }
    });
    const read = sign("full_text_read", { doi: DOI, content: "b".repeat(16), ...copy });
    expect(run(read, "full_text_read", "full_text_read").next_steps)
      .toEqual([claimsMore(DOI, "full_text_read", "search_copy_read")]);
    expect(run(read, "full_text_read", "search_copy_read").next_steps).toEqual([]);
    const audited = sign("study_audit", { doi: DOI, content: "c".repeat(16), ...copy });
    expect(run(audited, "full_text_audited", "full_text_read").next_steps)
      .toEqual([claimsMore(DOI, "full_text_read", "search_copy_audited")]);
    expect(run(audited, "full_text_audited", "full_text_audited").next_steps)
      .toEqual([claimsMore(DOI, "full_text_audited", "search_copy_audited")]);
    // AskRigor's own copy, said to be the AI's, claims less: a note.
    const own = run(audit, "full_text_audited", "search_copy_audited");
    expect(own.next_steps).toEqual([]);
    expect(advisoryNotes(own)).toContain(claimsLess(DOI, "search_copy_audited", "full_text_audited"));
  });

  it("notes a reading claiming less, and blocks nothing", () => {
    const result = check({ answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ABSTRACT}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "abstract_only", ABSTRACT)] } });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result)).toContain(claimsLess(DOI, "abstract_only", "full_text_audited"));
  });

  it("takes another tool's reading as the AI's own account, only where key_sources declares it read so", () => {
    const lead = { status: "lead_only", read_depth: "abstract_only", other_route: "read", answer_marker: "Trial" };
    const words = ANSWER_READING_LABELS.other_tool;
    const result = check({ receipts: [LEAD], key_sources: [{ id: DOI, ...lead }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${words}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "other_tool")] } });
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result).join(" ")).not.toContain("source_reading gives");
    // A full text read by AskRigor, said of a lead read through another tool, claims more.
    const more = check({ receipts: [LEAD], key_sources: [{ id: DOI, ...lead }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (full text read) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_read")] } });
    expect(more.next_steps).toEqual([claimsMore(DOI, "full_text_read", "other_tool")]);
    // The recheck of 5 Nov 2026: for a source key_sources doesn't declare read through another tool (other_route
    // read), it is no reading AskRigor can set aside: it claims more than the check verifies, whatever that is.
    const unrouted = check({ receipts: [PUBMED], key_sources: [{ ...lead, id: DOI, other_route: undefined }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${words}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "other_tool")] } });
    expect(unrouted.next_steps).toEqual([claimsMore(DOI, "other_tool", "abstract_only")]);
    const audited = check({ answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${words}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "other_tool")] } });
    expect(audited.next_steps).toEqual([claimsMore(DOI, "other_tool", "full_text_audited")]);
  });

  // The recheck of 5 Nov 2026: an honest entry beside one claiming more no longer lets it pass.
  it("blocks any entry whose quote the answer shows that claims more, beside an honest one", () => {
    const both = check({ receipts: [PUBMED],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${AUDITED}) compared two routines.`,
        `Of [Trial](https://doi.org/${DOI}), only the abstract only was available.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited"), entry(DOI, "abstract_only", ABSTRACT)] } });
    expect(both.status).toBe("not_ready");
    expect(both.next_steps).toEqual([claimsMore(DOI, "full_text_audited", "abstract_only")]);
    // An entry claiming more whose quote the answer doesn't show is set aside, as a stale one is.
    const stale = check({ receipts: [PUBMED],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ABSTRACT}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited"), entry(DOI, "abstract_only", ABSTRACT)] } });
    expect(stale.next_steps).toEqual([]);
  });

  // The fourth check of 5 Nov 2026: which words are about which study is the AI's declaration. Tying an entry to the
  // block that cites its source (the third check's fix) blocked honest answers in common layouts, so an entry's words
  // count wherever the answer shows them, for the source it names, and its reading is held to that source's receipts.
  it("counts an entry's words for the source it names, wherever the answer shows them", () => {
    const COHORT_DOI = "10.1000/reading-cohort-b";
    const readB = sign("full_text_read", { doi: COHORT_DOI, content: "b".repeat(16) });
    const keys = [{ id: DOI, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial" },
      { id: COHORT_DOI, status: "lead_only", read_depth: "full_text_read", answer_marker: "Cohort" }];
    const answer = draft(`[Trial](https://doi.org/${DOI}) (abstract only) compared two routines.`,
      `[Cohort](https://doi.org/${COHORT_DOI}) (full text read) followed people for a year.`);
    const honest = [entry(DOI, "abstract_only"), entry(COHORT_DOI, "full_text_read")];
    const run = (entries: ReturnType<typeof entry>[]) => check({ receipts: [PUBMED, readB], key_sources: keys,
      answer_draft: answer, later_inputs: { source_reading: entries } });
    expect(run(honest).next_steps).toEqual([]);
    // A stale entry claiming more for the trial blocks once, naming the entry to remove; removed, the answer passes.
    const stale = run([entry(DOI, "full_text_read"), ...honest]);
    expect(stale.status).toBe("not_ready");
    expect(stale.next_steps).toEqual([claimsMore(DOI, "full_text_read", "abstract_only")]);
    expect(stale.next_steps[0]).toContain(`Remove the source_reading entry claiming full_text_read for ${DOI}`);
    expect(run(honest).status).toBe("ready_with_limits");
    // An entry whose words the answer doesn't show is set aside, with a note, beside one it does show.
    const unquoted = run([entry(DOI, "abstract_only"), entry(DOI, "full_text_read", "read twice over"),
      entry(COHORT_DOI, "full_text_read")]);
    expect(unquoted.next_steps).toEqual([]);
    expect(advisoryNotes(unquoted)).toContain(setAside(DOI, "full_text_read"));
    // Words in a paragraph citing no study count for the source the entry names.
    expect(check({ receipts: [PUBMED],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) compared two routines.`, "How the studies were read: abstract only."),
      later_inputs: { source_reading: [entry(DOI, "abstract_only")] } }).next_steps).toEqual([]);
  });

  // The fourth check of 5 Nov 2026: four layouts where the words sit apart from the link, each ready before the third
  // check's block tying, and so again. A check that read the layout to decide which study words are about would block.
  it.each([
    ["a heading cites it, the next paragraph says how", [`### [Trial](https://doi.org/${DOI})`,
      "Abstract only. It compared two routines in 120 adults."]],
    ["a numbered reference list cites it", ["Trial [1] compared two routines in 120 adults (Abstract only).",
      "**References**", `1. [Trial](https://doi.org/${DOI})`]],
    ["a parent bullet cites it, a child bullet says how", [`- [Trial](https://doi.org/${DOI})\n  - Abstract only; it ` +
      "compared two routines in 120 adults."]],
    ["a bold label says how, a separate line cites it", ["**Trial** (Abstract only) compared two routines in 120 adults.",
      `Source: [Trial](https://doi.org/${DOI})`]]
  ])("passes when %s", (_layout, paragraphs) => {
    const result = check({ receipts: [PUBMED],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial" }],
      answer_draft: draft(...paragraphs), later_inputs: { source_reading: [entry(DOI, "abstract_only", "Abstract only")] } });
    expect(result.next_steps).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "abstract_only", shown: true }]);
  });

  it("sets aside an entry whose words show only inside another of its own entries' words", () => {
    const copyRead = sign("full_text_read", { doi: DOI, content: "c".repeat(16), retrieval_provider: "client_search_index",
      host: "copies.example.org" });
    const run = (words: string) => check({ receipts: [copyRead],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: "full_text_read", answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${words}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_read"), entry(DOI, "search_copy_read")] } });
    const corrected = run(ANSWER_READING_LABELS.search_copy_read);
    expect(corrected.status).toBe("ready_with_limits");
    expect(corrected.next_steps).toEqual([]);
    // Said on its own too, the stale words claim more than the AI's copy, and are named for removal.
    expect(run(`${ANSWER_READING_LABELS.search_copy_read}; full text read`).next_steps)
      .toEqual([claimsMore(DOI, "full_text_read", "search_copy_read")]);
  });

  // The recheck of 5 Nov 2026: with read_depth left out the check verifies no reading, so an entry is held to what the
  // receipts show.
  it("holds an entry to what the receipts show when read_depth is left out", () => {
    const run = (receipts: string[], given: AnswerReading) => check({ receipts,
      key_sources: [{ id: DOI, status: "lead_only", answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ANSWER_READING_LABELS[given]}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, given)] } });
    expect(run([PUBMED], "full_text_audited").next_steps)
      .toEqual([claimsMore(DOI, "full_text_audited", "abstract_only", { shownOnly: true })]);
    expect(run([PUBMED], "abstract_only").next_steps).toEqual([]);
    // A lead's state is what its receipt shows: a paywall shows no access.
    expect(run([sign("full_text_lead", { doi: DOI, state: "PAYWALL_OR_LOGIN_REQUIRED" })], "full_text_read").next_steps)
      .toEqual([claimsMore(DOI, "full_text_read", "inaccessible", { shownOnly: true })]);
    // A lead that found the abstract readable holds an entry to no more than an abstract, as it did before Greptile's
    // review of 12 Nov 2026, which changed what the panel lists as read and nothing this check holds back.
    expect(run([LEAD], "abstract_only").next_steps).toEqual([]);
    // The step no longer says the receipts show an abstract: the lead gave the AI none of it.
    expect(run([LEAD], "full_text_read").next_steps)
      .toEqual([claimsMore(DOI, "full_text_read", "abstract_only", { leadOnly: true })]);
    expect(run([LEAD], "full_text_read").next_steps.join(" ")).not.toContain("they show abstract_only");
    // Greptile's review of #441 (13 Nov 2026): beside a PubMed record's abstract, a lead that found part of the text
    // readable sets the bar at part of the text, and the step named no reading at all ("they show no reading of
    // it"), though the abstract was read. It now names the abstract, and the lead as the reason for the bar.
    const PART_LEAD = sign("full_text_lead", { doi: DOI, state: "PARTIAL_TEXT_READABLE" });
    const beside = run([PUBMED, PART_LEAD], "full_text_read").next_steps;
    expect(beside).toEqual([claimsMore(DOI, "full_text_read", "partial_text", { leadOnly: true, read: "abstract_only",
      offer: false })]);
    expect(beside.join(" ")).toContain("they show abstract_only (abstract only), and a full-text lead that found no " +
      "more of it readable than partial_text (part of the text read), the most an entry may say.");
    expect(beside.join(" ")).not.toContain("no reading of it");
    // With the lead alone there is no reading to name.
    expect(run([PART_LEAD], "full_text_read").next_steps)
      .toEqual([claimsMore(DOI, "full_text_read", "partial_text", { leadOnly: true })]);
    expect(deepestRead(new Set(["abstract_only", "lead_part_readable"]))).toBe("abstract_only");
    expect(deepestRead(new Set(["found_in_search", "lead_abstract_readable"]))).toBe("found_in_search");
    expect(deepestRead(new Set(["lead_part_readable"]))).toBeUndefined();
    expect(deepestRead(new Set(["lead_paywalled", "lead_abstract_readable"]))).toBeUndefined();
  });

  // The recheck of 5 Nov 2026: an abstract the AI read through its own search, behind a paywall AskRigor met, is a
  // reading a read_depth declares with no receipt, so the step offers that rather than only "no access".
  it("offers declaring a lower reading no receipt can show, rather than only understating it", () => {
    const paywall = sign("full_text_lead", { doi: DOI, state: "PAYWALL_OR_LOGIN_REQUIRED" });
    const run = (depth: string) => check({ receipts: [paywall],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: depth, answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ABSTRACT}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, "abstract_only", ABSTRACT)] } });
    expect(run("inaccessible").next_steps).toEqual([claimsMore(DOI, "abstract_only", "inaccessible", { offer: true })]);
    const raised = run("abstract_only");
    expect(raised.next_steps).toEqual([]);
    // Declared so, it stands as the AI's account, which the panel lists apart, with what the receipt shows.
    expect(raised.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "abstract_only",
      shown: false, receipts: "lead_paywalled" }]);
  });

  it("leaves the words to the model, in any language, once the reading is right", () => {
    for (const words of ["抄録のみ確認", "قرأنا الملخص فقط", "**(abstract only)**"]) {
      expect(fromRecord("abstract_only", words).next_steps, words).toEqual([]);
    }
    // The words are not read for meaning: an entry quoting words that say no reading passes on its reading alone.
    expect(fromRecord("abstract_only", "compared two routines").next_steps).toEqual([]);
  });

  it("drops an entry without a reading, with a note, so a cited source still needs one", () => {
    const result = check({ later_inputs: { source_reading: [{ source: DOI, quote: AUDITED }] } });
    expect(result.next_steps).toEqual([missing(DOI, "full_text_audited")]);
    expect(result.notes!.join("\n")).toContain("source_reading");
  });

  it("is exact: each pair of readings compares the same way every time", () => {
    for (const given of ANSWER_READINGS) {
      expect(compareReadings(given, given)).toBe("same");
      for (const verified of ANSWER_READINGS) {
        const forth = compareReadings(given, verified);
        expect(["same", "more", "less"]).toContain(forth);
        expect(compareReadings(given, verified)).toBe(forth);
      }
    }
    expect(compareReadings("conference_abstract", "abstract_only")).toBe("same");
    expect(compareReadings("full_text_audited", "abstract_only")).toBe("more");
    expect(compareReadings("abstract_only", "full_text_audited")).toBe("less");
    expect(compareReadings("inaccessible", "route_error")).toBe("same");
    expect(compareReadings("atlas_checked", "full_text_audited")).toBe("more");
    expect(compareReadings("abstract_only", "atlas_checked")).toBe("less");
  });
});

describe("the check: a cited key source says how it was read", () => {
  it("passes an answer that says it, its words copied in source_reading", () => {
    const result = check();
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result).join(" ")).not.toContain("source_reading");
  });

  it("blocks a cited key source with no entry, under read_depth, as a step on the draft", () => {
    const result = check({ later_inputs: {} });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([missing(DOI, "full_text_audited")]);
    expect(result.next_step_kinds).toEqual(["answer_draft"]);
    expect(result.round).toEqual({ number: 1, limit: 10 });
  });

  it("blocks an entry whose quote the answer doesn't show", () => {
    const result = check({ later_inputs: { source_reading: [entry(DOI, "full_text_audited", "full text read and audited")] } });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([unshown(DOI, "full_text_audited")]);
    expect(result.next_step_kinds).toEqual(["answer_draft"]);
    // The same answer, the label left out of it.
    const dropped = check({ answer_draft: draft(`[Trial](https://doi.org/${DOI}) compared two routines.`) });
    expect(dropped.next_steps).toEqual([unshown(DOI, "full_text_audited")]);
  });

  it("compares the quote as the other declared quotes are compared", () => {
    for (const quote of [`"${AUDITED.toUpperCase()}."`, AUDITED.replace("AskRigor", "*AskRigor*"),
      `[Trial](https://doi.org/${DOI}) (${AUDITED})`, `Trial (${AUDITED})`]) {
      expect(check({ later_inputs: { source_reading: [entry(DOI, "full_text_audited", quote)] } }).next_steps, quote).toEqual([]);
    }
    expect(check({ answer_draft: draft(`[Trial](https://doi.org/${DOI}) (full text read – methods audited by AskRigor).`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited", "full text read - methods audited by AskRigor")] } })
      .next_steps).toEqual([]);
    // A quote of marks alone shows nothing.
    expect(check({ later_inputs: { source_reading: [entry(DOI, "full_text_audited", "()")] } }).next_steps)
      .toEqual([unshown(DOI, "full_text_audited")]);
  });

  it("matches an entry to its key source by the identifier as the gate normalizes it", () => {
    expect(check({ later_inputs: { source_reading: [entry(`https://doi.org/${DOI.toUpperCase()}`, "full_text_audited")] } })
      .next_steps).toEqual([]);
  });

  it("asks nothing of a key source the draft doesn't cite", () => {
    const keySources = [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" },
      { id: OTHER_DOI, status: "lead_only", read_depth: "abstract_only", answer_marker: "Cohort" }];
    const result = check({ receipts: [audit, sign("pubmed_record", { pmid: "27182818", doi: OTHER_DOI })],
      key_sources: keySources });
    // Its link is still asked for, under the sources check; the reading waits until the draft cites it.
    expect(result.next_steps).toEqual([`Key study ${OTHER_DOI} has no link in the answer; link it to the page ` +
      `AskRigor's tools returned, such as https://doi.org/${OTHER_DOI} or https://pubmed.ncbi.nlm.nih.gov/27182818/.`]);
    expect(result.source_reading).toEqual([
      { source: DOI, name: `"Trial" (${DOI})`, reading: "full_text_audited", shown: true },
      { source: OTHER_DOI, name: `"Cohort" (${OTHER_DOI})`, reading: "abstract_only", shown: true }
    ]);
  });

  it("counts a key source the prose names by its identifier as cited", () => {
    const result = check({ receipts: [audit, COHORT],
      key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" },
        { id: PMID, status: "lead_only", read_depth: "abstract_only", answer_marker: "Cohort" }],
      answer_draft: draft(STUDY, `A cohort (PMID ${PMID}) found the same.`) });
    expect(readingSteps(result)).toEqual([missing(PMID, "abstract_only")]);
  });

  it("takes the answer's own words in any language", () => {
    const french = "texte intégral lu, méthodes vérifiées par AskRigor";
    expect(check({ answer_draft: draft(`[L'essai](https://doi.org/${DOI}) (${french}) a comparé deux routines.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited", french)] } }).next_steps).toEqual([]);
    const japanese = "全文を読み、AskRigorが方法を監査済み";
    expect(check({ answer_draft: draft(`[試験](https://doi.org/${DOI})（${japanese}）は二つの方法を比べた。`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited", japanese)] } }).next_steps).toEqual([]);
    expect(check({ answer_draft: draft(`[試験](https://doi.org/${DOI})は二つの方法を比べた。`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited", japanese)] } }).next_steps)
      .toEqual([unshown(DOI, "full_text_audited")]);
  });

  it("notes an entry naming no key source, and takes any entry for a source that passes (the review of 5 Nov 2026)", () => {
    const result = check({ later_inputs: { source_reading: [entry(DOI, "full_text_audited"),
      entry(OTHER_DOI, "abstract_only"), entry(DOI.toUpperCase(), "full_text_read")] } });
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result)).toEqual(expect.arrayContaining([
      `source_reading names ${OTHER_DOI}, which key_sources does not list: give each key source's id as key_sources ` +
        "gives it, or leave the entry out."
    ]));
    expect(advisoryNotes(result).join(" ")).not.toContain("more than once");
    // A stale first entry does no harm when a later one passes, in either order.
    for (const entries of [[entry(DOI, "full_text_audited", "full text read and audited"), entry(DOI, "full_text_audited")],
      [entry(DOI, "full_text_audited"), entry(DOI, "full_text_audited", "full text read and audited")],
      [entry(DOI, "abstract_only", AUDITED), entry(DOI, "full_text_audited")]]) {
      expect(check({ later_inputs: { source_reading: entries } }).next_steps).toEqual([]);
    }
    // With none passing, an entry whose quote the answer shows says what its reading claims; otherwise the quote's step.
    expect(check({ answer_draft: draft(`[Trial](https://doi.org/${DOI}) (full text read) compared two routines.`),
      receipts: [sign("full_text_read", { doi: DOI, content: "b".repeat(16) })],
      key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_read", answer_marker: "Trial" }],
      later_inputs: { source_reading: [entry(DOI, "full_text_read", "full text read, audited"),
        entry(DOI, "full_text_audited", "full text read")] } }).next_steps)
      .toEqual([claimsMore(DOI, "full_text_audited", "full_text_read")]);
    expect(check({ later_inputs: { source_reading: [entry(DOI, "full_text_audited", "full text read and audited"),
      entry(DOI, "full_text_audited", "read twice")] } }).next_steps).toEqual([unshown(DOI, "full_text_audited")]);
  });

  it("changes nothing for a call without key sources", () => {
    const plain = { key_sources: [], receipts: [], answer_draft: draft("A synthetic answer without studies.") };
    const without = check({ ...plain, later_inputs: {} });
    expect(without.source_reading).toBeUndefined();
    expect(without.status).toBe("ready_with_limits");
    expect(without.next_steps).toEqual([]);
    expect(advisoryNotes(without).join(" ")).not.toContain("source_reading");
    // A stray entry is a note, and nothing else changes.
    const stray = check({ ...plain, later_inputs: { source_reading: [entry(DOI, "abstract_only")] } });
    expect(stray).toMatchObject({ status: without.status, next_steps: [], limits: without.limits });
    expect(advisoryNotes(stray).filter((note) => !advisoryNotes(without).includes(note))).toEqual([
      `source_reading names ${DOI}, which key_sources does not list: give each key source's id as key_sources gives ` +
        "it, or leave the entry out."
    ]);
  });

  it("keeps the reading's words, and masks the source, in a stopped check's report", () => {
    let round_token: string | undefined;
    let result: FinalizeResearchOutput | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = check({ later_inputs: {}, round_token });
      round_token = result.round_token;
    }
    expect(result!.status).toBe("stopped");
    expect(result!.check_report!.could_not.map(({ rule }) => rule)).toEqual([
      "Key source … is cited in the answer without saying how it was read (full text read, methods audited by " +
        "AskRigor): say so beside it, in the answer's language, and give later_inputs.source_reading an entry for it, " +
        "with source …, reading full_text_audited, and quote those words copied from answer_draft."
    ]);
  });
});

// 5 Nov 2026: the results of the tools that establish how a paper was read name its words, so the answer says them
// before its first final check instead of after a blocked round. fetch_pubmed_record, the full-text reading and the
// audits carry these sentences in their result text (tests/mcp-full-text-read-receipt.test.ts,
// tests/analysis-staging.test.ts and tests/mcp-tools.test.ts check them there).
describe("the tools that read a paper name its words before the first final check", () => {
  // 11 Nov 2026: the entry's exact fields, from the first call, and what happens without it.
  const say = (when: string, label: string) => `${when}, say "${label}" beside it in the answer, in the answer's ` +
    "language, and give finalize_research, from its first call, an entry in later_inputs.source_reading as " +
    "{source, reading, quote}: source this study's id as key_sources gives it, reading " +
    `${(Object.keys(ANSWER_READING_LABELS) as AnswerReading[]).find((key) => ANSWER_READING_LABELS[key] === label)}, ` +
    "and quote those words as answer_draft has them. The final check holds back an answer that cites this study as a " +
    "key source without saying how it was read.";

  it("words each reading tool's sentence", () => {
    expect(readingResultNote(READING_RESULT_WHEN.record, "abstract_only")).toBe(say("If the answer cites this study " +
      "from this record alone", "abstract only"));
    expect(readingResultNote(READING_RESULT_WHEN.record, "metadata_only")).toBe(say("If the answer cites this study " +
      "from this record alone", "only its title and record read"));
    expect(readingResultNote(READING_RESULT_WHEN.fullText, "full_text_read"))
      .toBe(say("With this study's full text read to its end", "full text read"));
    expect(readingResultNote(READING_RESULT_WHEN.audit, "full_text_audited"))
      .toBe(say("With this study's methods audited", AUDITED));
  });

  it("reads the receipt a full-text or audit result just signed, and adds nothing for another", () => {
    const full = say("With this study's full text read to its end", "full text read");
    const audited = say("With this study's methods audited", AUDITED);
    expect(receiptReadingNote(sign("full_text_read", { doi: DOI, content: "b".repeat(16) }), SECRET)).toBe(full);
    expect(receiptReadingNote(audit, SECRET)).toBe(audited);
    expect(receiptReadingNote(sign("review_audit", { doi: DOI, status: "validated" }), SECRET)).toBe(audited);
    expect(receiptReadingNote(sign("study_audit", { doi: DOI, retrieval_provider: "client_search_index",
      host: "copies.example.org" }), SECRET)).toBe(say("With this study's methods audited",
      "full text read from a copy the AI found, methods audited by AskRigor"));
    // The review of 5 Nov 2026: a full reading of the AI's own copy says so too.
    expect(receiptReadingNote(sign("full_text_read", { doi: DOI, content: "b".repeat(16),
      retrieval_provider: "client_search_index", host: "copies.example.org" }), SECRET))
      .toBe(say("With this study's full text read to its end", "full text read from a copy the AI found"));
    expect(receiptReadingNote(PUBMED, SECRET)).toBe("");
    expect(receiptReadingNote(LEAD, SECRET)).toBe("");
    expect(receiptReadingNote(undefined, SECRET)).toBe("");
    expect(receiptReadingNote(audit, undefined)).toBe("");
    expect(receiptReadingNote(audit, `${SECRET}-other`)).toBe("");
  });

  // The review of 11 Nov 2026: Gemini's catalog has no finalize_research, so its sentence stops at the answer's words.
  it("leaves the final check out of the sentence on Gemini", () => {
    for (const when of Object.values(READING_RESULT_WHEN)) {
      const words = readingResultNote(when, "abstract_only", false);
      expect(words).toBe(`${when}, say "abstract only" beside it in the answer, in the answer's language.`);
      expect(words).not.toContain("finalize_research");
      expect(words).not.toContain("final check");
    }
    expect(receiptReadingNote(audit, SECRET, false)).toBe("With this study's methods audited, say " +
      `"${AUDITED}" beside it in the answer, in the answer's language.`);
    expect(receiptReadingNote(sign("full_text_read", { doi: DOI, content: "b".repeat(16) }), SECRET, false))
      .toBe("With this study's full text read to its end, say \"full text read\" beside it in the answer, in the " +
        "answer's language.");
  });

  // The timing runs of 10 Nov 2026: all 17 checks that held an answer back were a turn's first, most over a reading the
  // receipts already showed, sent with guessed field names or none.
  it("names the entry's exact fields, and an answer that follows the sentence passes the reading check first time", () => {
    expect(Object.keys(sourceReadingQuoteSchema.shape)).toEqual(["source", "reading", "quote"]);
    for (const when of Object.values(READING_RESULT_WHEN)) {
      for (const reading of ANSWER_READINGS) expect(readingResultNote(when, reading)).toContain("{source, reading, quote}");
    }
    // The audit's sentence, followed: the label beside the study, and the entry as the sentence words it.
    const result = check({ later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED }] } });
    expect(result.status).not.toBe("not_ready");
    expect(result.next_step_kinds ?? []).not.toContain("read_depth");
    expect(readingSteps(result)).toEqual([]);
  });
});

describe("the result names each reading up front, and the panel lists it", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("words the result's line from each key source's name and reading", () => {
    expect(sourceReadingGuidance([
      { source: DOI, name: `"Trial" (${DOI})`, reading: "full_text_audited", shown: true },
      { source: PMID, name: PMID, reading: "abstract_only", shown: false, receipts: "found_in_search" },
      { source: OTHER_DOI, name: OTHER_DOI, reading: "partial_text", shown: false },
      { source: "PMC7654321", name: "PMC7654321", reading: "other_tool", shown: false, receipts: "inaccessible" }
    ])).toBe(GUIDANCE_LEAD + `"Trial" (${DOI}), "full text read, methods audited by AskRigor" (full_text_audited); ` +
      `${PMID}, "abstract only" (abstract_only), by your account alone: AskRigor's receipts show "found in a search, ` +
      `not read"; ${OTHER_DOI}, "part of the text read" (partial_text), by your account alone: no receipt here shows ` +
      `it; PMC7654321, "read through another tool, not checked by AskRigor" (other_tool).`);
  });

  it.each(["/mcp", "/mcp/claude"] as const)("gives the line on %s before a check blocks, and none without key sources", async (mcpSurface) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { mcpSurface, researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "source-reading-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const text = async (args: Record<string, unknown>) => {
        const response = await client.callTool({ name: "finalize_research", arguments: args });
        expect(response.isError).not.toBe(true);
        return { output: response.structuredContent as FinalizeResearchOutput,
          text: (response.content as Array<{ text: string }>)[0]!.text };
      };
      const line = `\n${GUIDANCE_LEAD}"Trial" (${DOI}), "full text read, methods audited by AskRigor" (full_text_audited).`;
      const blocked = await text(input({ later_inputs: {} }));
      expect(blocked.output.status).toBe("not_ready");
      expect(blocked.text).toContain(line);
      const passed = await text(input());
      expect(passed.output.status).toBe("ready_with_limits");
      expect(passed.text).toContain(line);
      const none = await text(input({ key_sources: [], receipts: [], later_inputs: {},
        answer_draft: draft("A synthetic answer without studies.") }));
      expect(none.output.source_reading).toBeUndefined();
      expect(none.text).not.toContain("Say beside each study");
    } finally { await client.close(); await server.close(); }
  });

  it("lists what AskRigor read under a passing check, and nothing under one that has not passed", () => {
    const passed = check({ receipts: [audit, COHORT],
      key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" },
        { id: PMID, status: "lead_only", read_depth: "abstract_only" }],
      answer_draft: draft(STUDY, `[A cohort](https://pubmed.ncbi.nlm.nih.gov/${PMID}/) (abstract only) agreed.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited"), entry(PMID, "abstract_only")] } });
    expect(passed.status).toBe("ready_with_limits");
    const checked = fold(render(passed), "What AskRigor checked");
    expect(checked.children.map(({ textContent }) => textContent)).toContain(`What AskRigor read: "Trial" (${DOI}), ` +
      `full text read, methods audited by AskRigor; ${PMID}, abstract only.`);
    expect(checked.textContent).not.toContain("As the AI gives them");
    const blocked = check({ later_inputs: {} });
    expect(blocked.source_reading).toHaveLength(1);
    expect(render(blocked).textContent).not.toContain("What AskRigor read");
    expect(render(blocked).textContent).not.toContain("As the AI gives them");
    // Only the panel's own words: an entry it does not know is left out.
    expect(fold(render({ ...passed, source_reading: [{ source: DOI, name: "Trial", reading: "figures_read" }] }),
      "What AskRigor checked").textContent).not.toContain("What AskRigor read");
  });
});

// The review of 5 Nov 2026: a search's listing alone showed "abstract only" under "What AskRigor read". The panel lists
// only the readings AskRigor's receipts show, and the others apart, as the AI gives them, with what the receipts show.
describe("the panel lists apart the readings AskRigor's receipts don't show", () => {
  it("names what the receipts do show beside the AI's own account", () => {
    const listed = sign("literature_search", { src: "pubmed", q: discoveryQueryDigest(["reading trial"]), ret: 1,
      ids: [PMID], n: 1 });
    const lead = { status: "lead_only", read_depth: "abstract_only", other_route: "read", answer_marker: "Elsewhere" };
    const passed = check({ receipts: [audit, listed, sign("full_text_lead", { doi: OTHER_DOI, state: "ABSTRACT_ONLY" })],
      key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" },
        { id: PMID, status: "lead_only", read_depth: "abstract_only" }, { id: OTHER_DOI, ...lead }],
      answer_draft: draft(STUDY, `[A cohort](https://pubmed.ncbi.nlm.nih.gov/${PMID}/) (abstract only) agreed.`,
        `[Elsewhere](https://doi.org/${OTHER_DOI}) (${ANSWER_READING_LABELS.other_tool}) agreed too.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited"), entry(PMID, "abstract_only"),
        entry(OTHER_DOI, "other_tool")] } });
    expect(passed.status).toBe("ready_with_limits");
    expect(passed.source_reading).toEqual([
      { source: DOI, name: `"Trial" (${DOI})`, reading: "full_text_audited", shown: true },
      { source: PMID, name: PMID, reading: "abstract_only", shown: false, receipts: "found_in_search" },
      { source: OTHER_DOI, name: `"Elsewhere" (${OTHER_DOI})`, reading: "other_tool", shown: false,
        receipts: "lead_abstract_readable" }
    ]);
    const lines = fold(render(passed), "What AskRigor checked").children.map(({ textContent }) => textContent);
    expect(lines).toContain(`What AskRigor read: "Trial" (${DOI}), full text read, methods audited by AskRigor.`);
    expect(lines).toContain(`As the AI gives them, which AskRigor's receipts don't show: ${PMID}, abstract only ` +
      `(AskRigor's receipts show: found in a search, not read); "Elsewhere" (${OTHER_DOI}), read through another tool, ` +
      "not checked by AskRigor.");
    // A PubMed record without an abstract shows its record, not an abstract.
    const bare = sign("pubmed_record", { pmid: PMID, doi: OTHER_DOI, abs: "0" });
    const record = check({ receipts: [audit, bare],
      key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" },
        { id: PMID, status: "lead_only", read_depth: "abstract_only" }],
      answer_draft: draft(STUDY, `[A cohort](https://pubmed.ncbi.nlm.nih.gov/${PMID}/) (abstract only) agreed.`),
      later_inputs: { source_reading: [entry(DOI, "full_text_audited"), entry(PMID, "abstract_only")] } });
    expect(record.source_reading![1]).toEqual({ source: PMID, name: PMID, reading: "abstract_only", shown: false,
      receipts: "metadata_only" });
  });

  // The recheck of 5 Nov 2026: a lead whose abstract was readable showed "not read, no access to it". Each lead state
  // shows its own words, as the check's lead note gives them. That recheck also took a copy whose abstract alone, or
  // part of whose text, was readable as one AskRigor read that far, and listed it under "What AskRigor read".
  // Greptile's review of 12 Nov 2026: a lead's result gives the AI where a copy is and what state it is in, and none of
  // its text, so what was readable at a source is no reading AskRigor's receipts show. The answer's "abstract only"
  // still passes, as the AI's own account, and the panel lists it apart, with the lead's own words beside it.
  it("words each lead's state as the check's note does, and lists apart an abstract or a part only a lead found readable", () => {
    const lead = (state: string) => sign("full_text_lead", { doi: DOI, state });
    const run = (state: string, depth: string) => check({ receipts: [lead(state)],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: depth, answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ANSWER_READING_LABELS[depth as AnswerReading]}) ` +
        "compared two routines."),
      later_inputs: { source_reading: [entry(DOI, depth as AnswerReading)] } });
    const lines = (result: FinalizeResearchOutput) => fold(render(result), "What AskRigor checked").children
      .map(({ textContent }) => textContent);
    const abstract = run("ABSTRACT_ONLY", "abstract_only");
    expect(abstract.status).toBe("ready_with_limits");
    expect(abstract.next_steps).toEqual([]);
    expect(abstract.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "abstract_only",
      shown: false, receipts: "lead_abstract_readable" }]);
    expect(lines(abstract)).toContain(`As the AI gives them, which AskRigor's receipts don't show: "Trial" (${DOI}), ` +
      "abstract only (AskRigor's receipts show: only its abstract was readable).");
    expect(lines(abstract).join("\n")).not.toContain("What AskRigor read");
    // The result's line tells the AI the same, before the answer is written.
    expect(sourceReadingGuidance(abstract.source_reading!)).toBe(GUIDANCE_LEAD + `"Trial" (${DOI}), "abstract only" ` +
      "(abstract_only), by your account alone: AskRigor's receipts show \"only its abstract was readable\".");
    const part = run("PARTIAL_TEXT_READABLE", "partial_text");
    expect(part.status).toBe("ready_with_limits");
    expect(part.next_steps).toEqual([]);
    expect(part.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "partial_text",
      shown: false, receipts: "lead_part_readable" }]);
    expect(lines(part)).toContain(`As the AI gives them, which AskRigor's receipts don't show: "Trial" (${DOI}), ` +
      "part of the text read (AskRigor's receipts show: only part of its text was readable).");
    expect(lines(part).join("\n")).not.toContain("What AskRigor read");
    // An abstract said to be read where a lead found part of the text readable is the AI's account too.
    expect(run("PARTIAL_TEXT_READABLE", "abstract_only").source_reading).toEqual([{ source: DOI,
      name: `"Trial" (${DOI})`, reading: "abstract_only", shown: false, receipts: "lead_part_readable" }]);
    // A lead that read nothing still shows why nothing was read.
    expect(run("PAYWALL_OR_LOGIN_REQUIRED", "inaccessible").source_reading![0]).toMatchObject({ reading: "inaccessible", shown: true });
    expect(run("CANDIDATE_FOUND_FETCH_BLOCKED", "route_error").source_reading![0]).toMatchObject({ reading: "route_error", shown: true });
    // A secondary account stands apart, with the lead's own words beside it.
    const words = (state: string) => fold(render(run(state, "secondary_only")), "What AskRigor checked").children
      .map(({ textContent }) => textContent).find((line) => line.startsWith("As the AI gives them"));
    expect(words("ABSTRACT_ONLY")).toContain("(AskRigor's receipts show: only its abstract was readable)");
    expect(words("PARTIAL_TEXT_READABLE")).toContain("(AskRigor's receipts show: only part of its text was readable)");
    expect(words("PAYWALL_OR_LOGIN_REQUIRED")).toContain("(AskRigor's receipts show: not read, its full text needs a login or a subscription)");
    expect(words("CANDIDATE_FOUND_FETCH_BLOCKED")).toContain("(AskRigor's receipts show: not read, a possible public copy " +
      "was found but couldn't be fetched to check it)");
    expect(words("NO_COPY_FOUND_AFTER_EXPANDED_SEARCH")).toContain("(AskRigor's receipts show: not read, no public full " +
      "text was found after an exact search)");
    expect(words("IDENTITY_MISMATCH")).toContain("(AskRigor's receipts show: not read, no copy found could be verified as " +
      "the same paper)");
    expect(words("PROVIDER_UNAVAILABLE")).toContain("(AskRigor's receipts show: not read, no open full text was available)");
  });

  // Greptile's review of 12 Nov 2026: what another receipt shows read is still shown with such a lead beside it, and
  // no deeper than that receipt shows.
  it("lists under What AskRigor read the abstract a PubMed record gave the AI, with a lead beside it", () => {
    const run = (state: string, depth: AnswerReading) => check({
      receipts: [PUBMED, sign("full_text_lead", { doi: DOI, state })],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: depth, answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ANSWER_READING_LABELS[depth]}) compared two routines.`),
      later_inputs: { source_reading: [entry(DOI, depth)] } });
    for (const state of ["ABSTRACT_ONLY", "PARTIAL_TEXT_READABLE"]) {
      const result = run(state, "abstract_only");
      expect(result.next_steps).toEqual([]);
      expect(result.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "abstract_only", shown: true }]);
      expect(fold(render(result), "What AskRigor checked").children.map(({ textContent }) => textContent))
        .toContain(`What AskRigor read: "Trial" (${DOI}), abstract only.`);
    }
    // Part of the text is more than the record's abstract, and the lead gave the AI none of it.
    const part = run("PARTIAL_TEXT_READABLE", "partial_text");
    expect(part.next_steps).toEqual([]);
    expect(part.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "partial_text", shown: false,
      receipts: "lead_part_readable" }]);
  });

  // The same review: the six blocking checks stay as they were. What a lead found readable at a source is no reading
  // the receipts show, but it still bounds what an entry may say, so the read_depth check holds back the answers it
  // held back before, and no others.
  it("shows no reading of the text from what a lead found readable, and holds an entry to the same bar as before", () => {
    const shownBy = (...receipts: Array<[string, Record<string, unknown>]>) =>
      receiptReadings(receipts.map(([kind, claims]) => ({ kind, claims })), false);
    const abstractLead = shownBy(["full_text_lead", { doi: DOI, state: "ABSTRACT_ONLY" }]);
    const partLead = shownBy(["full_text_lead", { doi: DOI, state: "PARTIAL_TEXT_READABLE" }]);
    expect([...abstractLead]).toEqual(["lead_abstract_readable"]);
    expect([...partLead]).toEqual(["lead_part_readable"]);
    for (const reading of ["partial_text", "abstract_only", "conference_abstract", "metadata_only", "found_in_search"] as const) {
      expect(readingShown(reading, abstractLead), reading).toBe(false);
      expect(readingShown(reading, partLead), reading).toBe(false);
    }
    // The lead's own words are what its receipt shows.
    expect(readingShown("lead_abstract_readable", abstractLead)).toBe(true);
    expect(deepestShown(abstractLead)).toBe("lead_abstract_readable");
    expect(deepestShown(partLead)).toBe("lead_part_readable");
    // Beside the lead, a PubMed record shows its abstract, its record and a listing, and no part of the text.
    const withRecord = shownBy(["pubmed_record", { pmid: PMID, doi: DOI }],
      ["full_text_lead", { doi: DOI, state: "PARTIAL_TEXT_READABLE" }]);
    for (const reading of ["abstract_only", "conference_abstract", "metadata_only", "found_in_search"] as const) {
      expect(readingShown(reading, withRecord), reading).toBe(true);
    }
    expect(readingShown("partial_text", withRecord)).toBe(false);
    // A lead that read nothing shows why, as before, and a full reading shows what it shows.
    expect(readingShown("inaccessible", shownBy(["full_text_lead", { doi: DOI, state: "PAYWALL_OR_LOGIN_REQUIRED" }]))).toBe(true);
    expect(readingShown("route_error", shownBy(["full_text_lead", { doi: DOI, state: "CANDIDATE_FOUND_FETCH_BLOCKED" }]))).toBe(true);
    expect(readingShown("partial_text", shownBy(["full_text_read", { doi: DOI }]))).toBe(true);
    // The bar an entry is held to is as it was: no more than the lead found readable, whatever read_depth declares.
    expect(declarableReading("lead_abstract_readable")).toBe("abstract_only");
    expect(declarableReading("lead_part_readable")).toBe("partial_text");
    expect(judgeSourceReading("abstract_only", "abstract_only", abstractLead)).toBe("same");
    expect(judgeSourceReading("abstract_only", "inaccessible", abstractLead)).toBe("same");
    expect(judgeSourceReading("metadata_only", "abstract_only", abstractLead)).toBe("less");
    expect(judgeSourceReading("partial_text", "abstract_only", abstractLead)).toBe("more");
    expect(judgeSourceReading("full_text_read", "abstract_only", abstractLead)).toBe("more");
    expect(judgeSourceReading("partial_text", "partial_text", partLead)).toBe("same");
    expect(judgeSourceReading("abstract_only", "partial_text", partLead)).toBe("less");
    expect(judgeSourceReading("full_text_read", "partial_text", partLead)).toBe("more");
  });

  // The same review, for a study the answer links that isn't a key source, which on such a lead alone read "abstract
  // only" or "part of the text read": linkedReading gives it as found, not read, and every other study as before.
  it("gives a linked study the deepest reading its receipts show read, and found, not read, on such a lead alone", () => {
    const of = (...shown: ShownReading[]) => linkedReading(new Set(shown));
    expect(of("lead_abstract_readable")).toBe("found_in_search");
    expect(of("lead_part_readable")).toBe("found_in_search");
    expect(LINKED_READING_LABELS[of("lead_abstract_readable")]).toBe("found in a search, not read");
    // Beside the lead, what another receipt shows read is the reading, and no deeper.
    expect(of("lead_part_readable", "abstract_only")).toBe("abstract_only");
    expect(of("lead_abstract_readable", "metadata_only")).toBe("metadata_only");
    expect(of("lead_abstract_readable", "found_in_search")).toBe("found_in_search");
    expect(of("lead_part_readable", "full_text_read")).toBe("full_text_read");
    // Some of it was readable, so another attempt's paywall or failure doesn't make it "no access".
    expect(of("lead_abstract_readable", "lead_paywalled")).toBe("found_in_search");
    expect(of("lead_part_readable", "route_error")).toBe("found_in_search");
    expect(of()).toBe("not_looked_up");
    expect(of("lead_paywalled")).toBe("inaccessible");
    // Without such a lead, every set of readings gives what the deepest shown gave before.
    const others = SHOWN_READINGS.filter((reading) => reading !== "lead_abstract_readable" && reading !== "lead_part_readable");
    for (let mask = 0; mask < 1 << others.length; mask += 1) {
      const shown = new Set(others.filter((_, bit) => (mask & (1 << bit)) !== 0));
      const deepest = deepestShown(shown);
      if (linkedReading(shown) !== (deepest === undefined ? "not_looked_up" : declarableReading(deepest))) {
        throw new Error(`linkedReading changed for ${[...shown].join(", ")}`);
      }
    }
  });
});

// The repository has no DOM library; this shim, like the panel tests', rejects HTML assignment.
class Element {
  children: Element[] = [];
  private text = "";
  constructor(readonly tagName: string) {}
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  set innerHTML(_value: string) { throw new Error("Result text must never be HTML"); }
  appendChild(child: Element): Element { this.children.push(child); return child; }
  replaceChildren(): void { this.children = []; this.text = ""; }
}
function render(result: unknown): Element {
  const root = new Element("main");
  const document = { getElementById: (id: string) => id === "final-check-panel" ? root : null,
    createElement: (tag: string) => new Element(tag) };
  runInNewContext(`${FINAL_CHECK_PANEL_RENDER_SOURCE}\nrenderFinalCheck(document, result);`, { document, result });
  return root;
}
function fold(root: Element, opening: string): Element {
  const found = root.children.filter(({ tagName, children }) =>
    tagName === "details" && children[0]?.tagName === "summary" && children[0].textContent.startsWith(opening));
  expect(found).toHaveLength(1);
  return found[0]!;
}
