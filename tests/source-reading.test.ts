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
  ANSWER_READINGS, ANSWER_READING_LABELS, READING_RESULT_WHEN, compareReadings, identifierShown, readingResultNote,
  receiptReadingNote, sourceReadingGuidance, verifiedAnswerReading, type AnswerReading
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
// The step for a reading claiming more: it names the verified reading, or with none what the receipts show, and offers
// a lower reading a read_depth declares with no receipt (the recheck of 5 Nov 2026).
const claimsMore = (id: string, given: AnswerReading, verified: AnswerReading,
  { shownOnly = false, offer = false }: { shownOnly?: boolean; offer?: boolean } = {}) => `source_reading gives ${id} ` +
  `the reading ${given} (${ANSWER_READING_LABELS[given]}), more than this call's receipts show: ` +
  (shownOnly ? "they show" : "this check verifies") + ` ${verified} (${ANSWER_READING_LABELS[verified]}). Say that ` +
  `beside it instead, in the answer's language, and give source_reading reading ${verified} with those words as its ` +
  "quote, copied from answer_draft" + (offer ? `; or, if it was read so, give key_sources.read_depth ${given} for it, ` +
  "which needs no receipt." : given === "other_tool" ? "; or, if it was read through another tool, give it " +
  "other_route read in key_sources." : ".");
const GUIDANCE_LEAD = "Say beside each study how it was read, in the answer's language, and give each in " +
  "later_inputs.source_reading as {source, reading, quote}: source its id as key_sources gives it, reading as named " +
  "here, and quote those words, copied from answer_draft: ";
const claimsLess = (id: string, given: AnswerReading, verified: AnswerReading) => `source_reading gives ${id} the ` +
  `reading ${given} (${ANSWER_READING_LABELS[given]}), less than this check verifies: ${verified} ` +
  `(${ANSWER_READING_LABELS[verified]}). The answer may say so beside it.`;
const unshown = (id: string, reading: AnswerReading) => `source_reading's quote for ${id} is not in the answer: say ` +
  `beside it how it was read (${ANSWER_READING_LABELS[reading]}), in the answer's language, and copy those words ` +
  "exactly from answer_draft.";

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
  const say = (when: string, label: string) => `${when}, say "${label}" beside it in the answer, in the answer's ` +
    "language, and give those words in finalize_research's later_inputs.source_reading, with reading " +
    `${(Object.keys(ANSWER_READING_LABELS) as AnswerReading[]).find((key) => ANSWER_READING_LABELS[key] === label)}.`;

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
  // shows its own words, as the check's lead note gives them, and a copy whose abstract alone was readable is one
  // AskRigor read that far.
  it("words each lead's state as the check's note does, and shows the abstract a lead read", () => {
    const lead = (state: string) => sign("full_text_lead", { doi: DOI, state });
    const run = (state: string, depth: string) => check({ receipts: [lead(state)],
      key_sources: [{ id: DOI, status: "lead_only", read_depth: depth, answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${DOI}) (${ANSWER_READING_LABELS[depth as AnswerReading]}) ` +
        "compared two routines."),
      later_inputs: { source_reading: [entry(DOI, depth as AnswerReading)] } });
    const abstract = run("ABSTRACT_ONLY", "abstract_only");
    expect(abstract.next_steps).toEqual([]);
    expect(abstract.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "abstract_only", shown: true }]);
    expect(fold(render(abstract), "What AskRigor checked").children.map(({ textContent }) => textContent))
      .toContain(`What AskRigor read: "Trial" (${DOI}), abstract only.`);
    expect(run("PARTIAL_TEXT_READABLE", "partial_text").source_reading![0]).toMatchObject({ reading: "partial_text", shown: true });
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
