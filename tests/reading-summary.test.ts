import { runInNewContext } from "node:vm";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  availableOpenFullTextActionOutputSchema, openFullTextLeadActionOutputSchema
} from "../apps/research-mcp/src/actions/open-full-text-route.js";
import { FINAL_CHECK_PANEL_RENDER_SOURCE } from "../apps/research-mcp/src/final-check-panel.js";
import {
  europePmcRecordGroups, readingSummarySentence, researchReadingSummary, type ReadingSummary
} from "../apps/research-mcp/src/reading-summary.js";
import {
  communitySkipCaveat, finalizeResearch, normalizeIdentifier, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest, issueResearchReceipt, verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  ANSWER_READING_LABELS, LINKED_READING_LABELS, linkedReadingGuidance, STUDY_LINK_GUIDANCE, STUDY_READING_DISCLOSURE
} from "../apps/research-mcp/src/source-reading.js";
import { fullTextCandidateSchema } from "../packages/sources/src/full-text-admission.js";
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// The owner, 6 Nov 2026: "make sure we get it working so it tells you to what extent it read the studies". Two ChatGPT
// answers made with AskRigor that morning named some studies' readings and not others (a "Tanzania cohort" link gave
// none), and neither said how many studies the research found against how many it read. The studies, identifiers and
// receipts here are synthetic fixtures, not evidence about a treatment.
const SECRET = "reading-summary-test-secret-0123456789abcdefgh";
const TARGET = "Synthetic research-wide reading";
const REASON = "Synthetic fixture isolates the research-wide reading.";
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: REASON };
const TRIAL = "10.1000/summary-trial";
const COHORT = "10.1000/summary-cohort";
const COHORT_PMID = "27182818";
const RECORD_PMID = "16180339";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const verified = (...tokens: string[]) => tokens.map((token) => {
  const result = verifyResearchReceipt(token, { secret: SECRET });
  if (!result.ok) throw new Error("fixture receipt failed verification");
  return { kind: result.kind, claims: result.claims };
});
const summary = (...tokens: string[]) => researchReadingSummary(verified(...tokens), normalizeIdentifier);
const search = (source: "pubmed" | "europepmc" | "ctgov", ids: string[], claims: Record<string, unknown> = {}) =>
  sign("literature_search", { src: source, q: discoveryQueryDigest([`${source} ${ids.join(" ")}`]), ret: ids.length,
    ids, n: ids.length, ...claims });
const AUDIT = sign("study_audit", { doi: TRIAL, pmid: "31415926", content: "a".repeat(16) });
const COHORT_RECORD = sign("pubmed_record", { pmid: COHORT_PMID, doi: COHORT, abs: "1" });
const BARE_RECORD = sign("pubmed_record", { pmid: RECORD_PMID, abs: "0" });
const AUDITED = ANSWER_READING_LABELS.full_text_audited;
const draft = (...paragraphs: string[]) => [...paragraphs, communitySkipCaveat(REASON)].join("\n\n");
const STUDY = `[Trial](https://doi.org/${TRIAL}) (${AUDITED}) compared two routines.`;
const input = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  receipts: [AUDIT], research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: REASON, commercial_review_applicability: NOT_APPLICABLE, intervention_identity: NOT_APPLICABLE,
  full_text_search: { status: "not_needed", reason: REASON }, lab_preparation: NOT_APPLICABLE,
  key_sources: [{ id: TRIAL, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [],
  answer_draft: draft(STUDY),
  later_inputs: { source_reading: [{ source: TRIAL, reading: "full_text_audited", quote: AUDITED }] },
  ...overrides
});
const check = (overrides: Record<string, unknown> = {}) =>
  assertNextStepsContract(finalizeResearch(input(overrides), { secret: SECRET }));
// The review of #422, fourth round: looking the study up comes first.
const NOT_LOOKED_UP_NOTE = (names: string) => `The answer links ${names}, for which AskRigor has no receipt. Look each ` +
  "up (fetch_pubmed_record for a PMID, which ties it to its DOI; resolve_doi for a DOI) and pass its research_receipt. " +
  "Only if you don't, say beside it that AskRigor did not look it up.";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("the research-wide reading, counted exactly from the receipts", () => {
  it("counts each study once, at the deepest reading its receipts show", () => {
    const counted = summary(
      AUDIT,
      // The same trial's full reading and PubMed record add nothing: it is one study, audited.
      sign("full_text_read", { doi: TRIAL, content: "b".repeat(16) }),
      sign("pubmed_record", { pmid: "31415926", doi: TRIAL, abs: "1" }),
      sign("full_text_read", { doi: "10.1000/summary-full", content: "c".repeat(16) }),
      COHORT_RECORD, BARE_RECORD,
      sign("doi_resolution", { doi: "10.1000/summary-registered", url: "https://journal.example.org/a" }),
      // A lead was not read, whatever state it signs (Greptile's review of 12 Nov 2026, below), and a route failure
      // read nothing.
      sign("full_text_lead", { doi: "10.1000/summary-part", state: "PARTIAL_TEXT_READABLE" }),
      sign("full_text_lead", { doi: "10.1000/summary-abstract", state: "ABSTRACT_ONLY" }),
      sign("full_text_lead", { doi: "10.1000/summary-paywall", state: "PAYWALL_OR_LOGIN_REQUIRED" }),
      sign("full_text_route_failure", { doi: "10.1000/summary-failed", routes: ["europe_pmc"], http: ["500"] })
    );
    expect(counted).toEqual({
      audited: 1, audited_from_ai_copies: 0, full_text: 1, full_text_from_ai_copies: 0, part_text: 0,
      abstract_only: 1, record_only: 2, listed_not_read: 0,
      sentence: "AskRigor read 1 study in full and checked its methods, 1 more in full, 1 more only as an abstract, " +
        "and 2 more only by their titles and records."
    });
  });

  // Greptile's review of 12 Nov 2026: one lead receipt with a DOI and the state ABSTRACT_ONLY gave "AskRigor read 1
  // study only as an abstract.", and one with PARTIAL_TEXT_READABLE "AskRigor read 1 study only in part." A lead's
  // result tells the AI where a copy is and what state it is in, and gives it none of the copy's text and no handle to
  // read it, so its receipt shows what was available at a source, not what was read.
  describe("a full-text lead, which gives the AI none of the paper's text", () => {
    const abstractLead = sign("full_text_lead", { doi: COHORT, state: "ABSTRACT_ONLY" });
    const partLead = sign("full_text_lead", { doi: COHORT, pmid: COHORT_PMID, state: "PARTIAL_TEXT_READABLE" });
    const nothingRead = { audited: 0, audited_from_ai_copies: 0, full_text: 0, full_text_from_ai_copies: 0,
      part_text: 0, abstract_only: 0, record_only: 0 };

    it("is not counted as read as an abstract when only an abstract was available at the source", () => {
      expect(summary(abstractLead)).toEqual({ ...nothingRead, listed_not_read: 0, sentence: "AskRigor read no studies." });
      // By its PMID or its PMC copy alone too, as acquire_open_full_text takes them.
      expect(summary(sign("full_text_lead", { pmid: COHORT_PMID, state: "ABSTRACT_ONLY" }))?.sentence)
        .toBe("AskRigor read no studies.");
      expect(summary(sign("full_text_lead", { pmcid: "PMC2718281", state: "ABSTRACT_ONLY" }))?.sentence)
        .toBe("AskRigor read no studies.");
    });

    it("is not counted as read in part when only part of the text was available at the source", () => {
      expect(summary(partLead)).toEqual({ ...nothingRead, listed_not_read: 0, sentence: "AskRigor read no studies." });
      // No receipt signs that part of a text was given to the AI, so no study counts as read in part.
      expect(summary(AUDIT, COHORT_RECORD, partLead, abstractLead)).toMatchObject({ audited: 1, part_text: 0 });
    });

    it("leaves its study among the records a search listed and AskRigor didn't read", () => {
      const listed = search("europepmc", [COHORT, COHORT_PMID, "11235813"], { rg: ["0.1", "2"] });
      for (const lead of [abstractLead, partLead]) {
        expect(summary(listed, lead)).toEqual({ ...nothingRead, listed_not_read: 2,
          sentence: "AskRigor read no studies; its searches listed 2 records it didn't read." });
      }
      expect(summary(AUDIT, search("pubmed", ["31415926", COHORT_PMID]), partLead)?.sentence).toBe("AskRigor read 1 " +
        "study in full and checked its methods; its searches listed 1 other record it didn't read.");
    });

    // No lead's result gives the AI the abstract or the readable part, and no claim of its receipt says it did, so
    // there is no such lead to keep counting. What a tool did give the AI counts as it did before: the abstract a
    // PubMed record returned, and a text read to its end after an earlier attempt left only a lead.
    it("keeps the count of an abstract or a text a tool did give the AI, with a lead beside it", () => {
      expect(summary(COHORT_RECORD, abstractLead)).toEqual({ ...nothingRead, abstract_only: 1, listed_not_read: 0,
        sentence: "AskRigor read 1 study only as an abstract." });
      expect(summary(partLead, sign("full_text_read", { doi: COHORT, content: "d".repeat(16) }))?.sentence)
        .toBe("AskRigor read 1 study in full.");
      expect(summary(AUDIT, sign("full_text_lead", { doi: TRIAL, state: "ABSTRACT_ONLY" }))?.sentence)
        .toBe("AskRigor read 1 study in full and checked its methods.");
    });

    it("counts the study no deeper than its other receipts show it read", () => {
      // The record's abstract is the deepest reading shown: a copy readable in part at a source adds nothing to it.
      expect(summary(COHORT_RECORD, partLead)).toEqual({ ...nothingRead, abstract_only: 1, listed_not_read: 0,
        sentence: "AskRigor read 1 study only as an abstract." });
      expect(summary(sign("doi_resolution", { doi: COHORT, url: "https://journal.example.org/c" }), abstractLead))
        .toEqual({ ...nothingRead, record_only: 1, listed_not_read: 0,
          sentence: "AskRigor read 1 study only by its title and record." });
      expect(summary(BARE_RECORD, sign("full_text_lead", { pmid: RECORD_PMID, state: "PARTIAL_TEXT_READABLE" }))?.sentence)
        .toBe("AskRigor read 1 study only by its title and record.");
    });

    // What the count rests on: the lead's result has no place for the paper's text, or for a handle to read it.
    it("has no text and no reading handle in its result", () => {
      const lead = Object.keys(openFullTextLeadActionOutputSchema.shape);
      expect(lead).toEqual(expect.arrayContaining(["status", "acquisition_state", "candidates", "access_boundary",
        "unseen_content_used_as_evidence"]));
      for (const field of ["blocks", "source", "coverage_receipt"]) {
        expect(Object.keys(availableOpenFullTextActionOutputSchema.shape)).toContain(field);
        expect(lead).not.toContain(field);
      }
      expect(Object.keys(fullTextCandidateSchema.shape)).not.toContain("text");
      // A lead with the text in it is refused: its result cannot carry any.
      const result = { status: "possibly_useful_lead", discovery_attempts: [], acquisition_state: "ABSTRACT_ONLY",
        access_boundary: "Synthetic boundary.", unseen_content_used_as_evidence: false };
      expect(openFullTextLeadActionOutputSchema.safeParse(result).success).toBe(true);
      expect(openFullTextLeadActionOutputSchema.safeParse({ ...result, blocks: [{ text: "Synthetic abstract." }] }).success)
        .toBe(false);
    });
  });

  it("counts the studies the searches listed and didn't read, tied across databases by their identifiers", () => {
    const groups = europePmcRecordGroups([
      { source: "MED", id: COHORT_PMID, pmid: COHORT_PMID, doi: COHORT, pmcid: "PMC2718281" },
      { source: "MED", id: "11235813", pmid: "11235813" },
      // A record with no DOI, PMID or PMCID is known by its source and its own id.
      { source: "AGR", id: "IND600000001" }
    ], [COHORT, COHORT_PMID, "PMC2718281", "11235813", "IND600000001"]);
    expect(groups).toEqual(["0.1.2", "3", "AGR:4"]);
    const counted = summary(AUDIT, COHORT_RECORD,
      // PubMed lists the audited trial, the cohort and two others; Europe PMC the cohort, one of those and one more.
      search("pubmed", ["31415926", COHORT_PMID, "11235813", "14142135"]),
      search("europepmc", [COHORT, COHORT_PMID, "PMC2718281", "11235813", "IND600000001"], { rg: groups }),
      // A registration is no paper: nothing ties it to one exactly.
      search("ctgov", ["NCT01234567"]));
    expect(counted).toMatchObject({ audited: 1, abstract_only: 1, listed_not_read: 3 });
    expect(counted?.sentence).toBe("AskRigor read 1 study in full and checked its methods, and 1 more only as an " +
      "abstract; its searches listed 3 other records it didn't read.");
  });

  it("leaves the listed count out when a Europe PMC search names its records only as one list", () => {
    const older = search("europepmc", [COHORT, COHORT_PMID, "11235813"]);
    const counted = summary(AUDIT, older);
    expect(counted).not.toHaveProperty("listed_not_read");
    expect(counted?.sentence).toBe("AskRigor read 1 study in full and checked its methods.");
    // One that returned no records lists none, exactly.
    expect(summary(AUDIT, sign("literature_search", { src: "europepmc", q: "abc", ret: 0, ids: [] })))
      .toHaveProperty("listed_not_read", 0);
  });

  it("names the copies the AI found, and says when AskRigor read none", () => {
    const copy = { retrieval_provider: "client_search_index", host: "copies.example.org" };
    expect(summary(sign("study_audit", { doi: TRIAL, content: "a".repeat(16), ...copy }))?.sentence)
      .toBe("AskRigor read 1 study in full and checked its methods (from a copy the AI found).");
    expect(summary(sign("full_text_read", { doi: TRIAL, content: "a".repeat(16), ...copy }),
      sign("full_text_read", { doi: COHORT, content: "b".repeat(16) }))?.sentence)
      .toBe("AskRigor read 2 studies in full (1 of them from copies the AI found).");
    // A copy AskRigor fetched of the same study outweighs the AI's.
    expect(summary(sign("full_text_read", { doi: TRIAL, content: "a".repeat(16), ...copy }),
      sign("full_text_read", { doi: TRIAL, content: "b".repeat(16) }))).toMatchObject({ full_text: 1,
      full_text_from_ai_copies: 0 });
    expect(summary(search("pubmed", [COHORT_PMID, "11235813"]))?.sentence)
      .toBe("AskRigor read no studies; its searches listed 2 records it didn't read.");
    expect(summary(sign("youtube_search", { q: "abc" }))?.sentence).toBe("AskRigor read no studies.");
    // A plain answer or a research map is no research.
    expect(summary(sign("plain_answer", { a: "b" }))).toBeUndefined();
    expect(summary()).toBeUndefined();
  });

  // The review of #422: a search lists books, theses and patents as well as studies, and no record's identifiers tell
  // them apart, so the searches' count is of records.
  it("words each count in the singular and the plural, and names what the searches listed records", () => {
    const none = { audited: 0, audited_from_ai_copies: 0, full_text: 0, full_text_from_ai_copies: 0, part_text: 0,
      abstract_only: 0, record_only: 0 };
    expect(readingSummarySentence({ ...none, audited: 3, abstract_only: 3, listed_not_read: 41 })).toBe("AskRigor " +
      "read 3 studies in full and checked their methods, and 3 more only as abstracts; its searches listed 41 other " +
      "records it didn't read.");
    expect(readingSummarySentence({ ...none, audited: 2, audited_from_ai_copies: 2, listed_not_read: 1 })).toBe(
      "AskRigor read 2 studies in full and checked their methods (all from copies the AI found); its searches listed 1 " +
      "other record it didn't read.");
    expect(readingSummarySentence({ ...none, record_only: 1 })).toBe("AskRigor read 1 study only by its title and record.");
    expect(readingSummarySentence({ ...none, listed_not_read: 1 })).toBe("AskRigor read no studies; its searches listed " +
      "1 record it didn't read.");
  });
});

describe("the studies an answer links that aren't key sources", () => {
  const PUBLISHER = "https://journal.example.org/article/summary-registered";
  const linked = () => check({
    receipts: [AUDIT, COHORT_RECORD, BARE_RECORD,
      sign("doi_resolution", { doi: "10.1000/summary-registered", url: PUBLISHER }),
      search("pubmed", ["11235813"]),
      search("europepmc", ["10.1000/summary-listed", "PMC1414213"], { rg: ["0.1"] })],
    answer_draft: draft(STUDY,
      // A link to the key source by another of its pages is the key source's, and so is listed once, above.
      `The [same trial](https://pubmed.ncbi.nlm.nih.gov/31415926/) agreed.`,
      `A [Tanzania; cohort](https://doi.org/10.2000/unlooked) and [a cohort](https://pubmed.ncbi.nlm.nih.gov/${COHORT_PMID}/) ` +
        `agreed, as did [its PMC copy](https://pmc.ncbi.nlm.nih.gov/articles/PMC1414213/), https://pubmed.ncbi.nlm.nih.gov/${RECORD_PMID}/ ` +
        `and [a publisher's page](${PUBLISHER}).`,
      `[A listed paper](https://www.ncbi.nlm.nih.gov/pubmed/11235813) and [the cohort's DOI](https://doi.org/${COHORT}) ` +
        "came up too.",
      // A DOI in a publisher's address names no paper exactly (the review of #422, third round): one note, no reading.
      "So did [a publisher's PDF](https://journal.example.org/doi/10.2000/elsewhere.pdf).",
      // Not papers: a forum, a video and a registration.
      "See [a forum](https://forum.example.org/t/123), [a video](https://www.youtube.com/watch?v=aaaaaaaaaaa) and " +
        "[a registration](https://clinicaltrials.gov/study/NCT01234567).")
  });

  it("gives each its deepest reading, or that AskRigor didn't look it up, once each, holding nothing back", () => {
    const result = linked();
    expect(result.status).toMatch(/^ready/u);
    expect(result.next_steps).toEqual([]);
    expect(result.linked_reading).toEqual([
      { source: "10.2000/unlooked", name: "\"Tanzania, cohort\" (10.2000/unlooked)", reading: "not_looked_up" },
      { source: COHORT_PMID, name: `"a cohort" (${COHORT_PMID})`, reading: "abstract_only" },
      // Europe PMC's record ties the PMC copy to its DOI, which a search listed.
      { source: "PMC1414213", name: `"its PMC copy" (PMC1414213)`, reading: "found_in_search" },
      { source: RECORD_PMID, name: RECORD_PMID, reading: "metadata_only" },
      { source: "10.1000/summary-registered", name: "\"a publisher's page\" (10.1000/summary-registered)",
        reading: "metadata_only" },
      { source: "11235813", name: "\"A listed paper\" (11235813)", reading: "found_in_search" }
    ]);
    expect(advisoryNotes(result)).toContain(NOT_LOOKED_UP_NOTE("\"Tanzania, cohort\" (10.2000/unlooked)"));
    expect(advisoryNotes(result)).toContain("The answer links \"a publisher's PDF\" " +
      "(https://journal.example.org/doi/10.2000/elsewhere.pdf): each holds a DOI, but AskRigor can't match it to a " +
      "study exactly, so link each study by its doi.org or PubMed address in a Markdown link, for its reading to show.");
  });

  it("names a key source's link no more, and names none without a draft or a link", () => {
    expect(check().linked_reading).toBeUndefined();
    expect(check({ answer_draft: undefined }).linked_reading).toBeUndefined();
  });

  it("words the result's line apart from the key sources', with no source_reading entry asked", () => {
    const readings = [{ source: COHORT_PMID, name: `"a cohort" (${COHORT_PMID})`, reading: "abstract_only" as const },
      { source: "https://x.example.org/doi/10.2000/y", name: "https://x.example.org/doi/10.2000/y",
        reading: "not_looked_up" as const }];
    expect(linkedReadingGuidance(readings, true)).toBe("The answer also links studies that aren't key sources: say " +
      "beside each how it was read too, in the answer's language, with no source_reading entry: \"a cohort\" " +
      `(${COHORT_PMID}), "abstract only"; https://x.example.org/doi/10.2000/y, "not looked up by AskRigor".`);
    expect(linkedReadingGuidance(readings.slice(0, 1), false)).toBe("Say beside each study the answer links how it was " +
      "read, in the answer's language; studies that aren't key sources need no source_reading entry: \"a cohort\" " +
      `(${COHORT_PMID}), "abstract only".`);
    expect(LINKED_READING_LABELS.not_looked_up).toBe("not looked up by AskRigor");
    // Worded as HRP words it (the review of #422): the reading beside each claim a study supports, and who paid for each
    // key study.
    expect(STUDY_READING_DISCLOSURE).toBe("HRP StudyReadDepthDisclosure requires, beside each claim a study supports, " +
      "what was read of that study, and, for each key study, who paid for it (or that the paper doesn't say), so these " +
      "are not among the limits the answer may choose to leave out.");
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

describe("the panel", () => {
  it("shows how much AskRigor read right after the verdict, unfolded, under every status with receipts", () => {
    const passed = check({ receipts: [AUDIT, COHORT_RECORD] });
    expect(passed.status).toMatch(/^ready/u);
    const sentence = "AskRigor read 1 study in full and checked its methods, and 1 more only as an abstract.";
    expect(passed.reading_summary?.sentence).toBe(sentence);
    expect(render(passed).children.slice(0, 2).map(({ tagName, textContent }) => [tagName, textContent]))
      .toEqual([["p", expect.stringContaining("Checked by AskRigor's final check")], ["p", sentence]]);
    const blocked = check({ receipts: [AUDIT, COHORT_RECORD], later_inputs: {} });
    expect(blocked.status).toBe("not_ready");
    expect(render(blocked).children[1]?.textContent).toBe(sentence);
    const stopped = { ...blocked, status: "stopped", stopped: { short_reason: "it ran out of rounds" } };
    expect(render(stopped).children[1]?.textContent).toBe(sentence);
    // Without research receipts there is no count, and no line.
    const none = check({ receipts: [], key_sources: [], later_inputs: {}, answer_draft: draft("No studies here.") });
    expect(none.reading_summary).toBeUndefined();
    expect(render(none).children[1]?.tagName).not.toBe("p");
  });

  // Greptile's review of 12 Nov 2026: with a lead as a key study's only receipt, the line read "AskRigor read 1 study
  // only as an abstract." though the lead gave the AI no abstract. The answer's own "abstract only" still passes, as a
  // read_depth no receipt can contradict; the line says only what AskRigor's receipts show read.
  it("says AskRigor read no studies when a key study's only receipt is a lead that gave the AI none of its text", () => {
    const lead = (state: string, depth: "abstract_only" | "partial_text") => check({
      receipts: [sign("full_text_lead", { doi: TRIAL, state })],
      key_sources: [{ id: TRIAL, status: "lead_only", read_depth: depth, answer_marker: "Trial" }],
      answer_draft: draft(`[Trial](https://doi.org/${TRIAL}) (${ANSWER_READING_LABELS[depth]}) compared two routines.`),
      later_inputs: { source_reading: [{ source: TRIAL, reading: depth, quote: ANSWER_READING_LABELS[depth] }] } });
    for (const result of [lead("ABSTRACT_ONLY", "abstract_only"), lead("PARTIAL_TEXT_READABLE", "partial_text")]) {
      expect(result.status).toBe("ready_with_limits");
      expect(result.next_steps).toEqual([]);
      expect(result.reading_summary).toMatchObject({ part_text: 0, abstract_only: 0, sentence: "AskRigor read no studies." });
      expect(render(result).children[1]?.textContent).toBe("AskRigor read no studies.");
    }
  });

  it("lists the linked studies apart, under a passing check", () => {
    const passed = check({ receipts: [AUDIT, COHORT_RECORD],
      answer_draft: draft(STUDY, `[A cohort](https://pubmed.ncbi.nlm.nih.gov/${COHORT_PMID}/) and ` +
        "[another](https://doi.org/10.2000/unlooked) agreed.") });
    const checked = render(passed).children.find(({ tagName, children }) => tagName === "details" &&
      children[0]?.textContent.startsWith("What AskRigor checked"));
    expect(checked?.children.map(({ textContent }) => textContent)).toContain("Other studies the answer links, as " +
      `AskRigor's receipts show them: "A cohort" (${COHORT_PMID}), abstract only; "another" (10.2000/unlooked), not ` +
      "looked up by AskRigor.");
    // Only the panel's own words: an entry it does not know is left out.
    expect(render({ ...passed, linked_reading: [{ source: "x", name: "x", reading: "figures_read" }] }).textContent)
      .not.toContain("Other studies the answer links");
  });
});

describe("through the tool", () => {
  it.each(["/mcp", "/mcp/claude"] as const)("signs a Europe PMC search's records and gives the lines on %s", async (mcpSurface) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    const records = [
      { source: "MED", id: COHORT_PMID, pmid: COHORT_PMID, doi: COHORT, title: "A synthetic cohort" },
      { source: "MED", id: "11235813", pmid: "11235813", title: "Another synthetic paper" }
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      version: "6.9", hitCount: records.length, request: { queryString: "synthetic", cursorMark: "*", pageSize: 20 },
      resultList: { result: records }
    }), { status: 200 })));
    const server = createAskRigorServer("standard", { mcpSurface, researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "reading-summary-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const searched = await client.callTool({ name: "search_europe_pmc", arguments: { query: "synthetic", page_size: 20 } });
      expect(searched.isError).not.toBe(true);
      const receipt = (searched.structuredContent as { research_receipt: string }).research_receipt;
      const signed = verifyResearchReceipt(receipt, { secret: SECRET });
      expect(signed).toMatchObject({ ok: true, kind: "literature_search",
        claims: { src: "europepmc", ids: [COHORT, COHORT_PMID, "11235813"], rg: ["0.1", "2"] } });
      const response = await client.callTool({ name: "finalize_research", arguments: input({
        receipts: [AUDIT, receipt],
        answer_draft: draft(STUDY, `[A cohort](https://doi.org/${COHORT}) agreed.`) }) });
      expect(response.isError).not.toBe(true);
      const output = response.structuredContent as FinalizeResearchOutput;
      const text = (response.content as Array<{ text: string }>)[0]!.text;
      expect(output.reading_summary).toMatchObject({ audited: 1, listed_not_read: 2 });
      expect(output.linked_reading).toEqual([{ source: COHORT, name: `"A cohort" (${COHORT})`, reading: "found_in_search" }]);
      expect(text).toContain("\nThe answer also links studies that aren't key sources: say beside each how it was read " +
        `too, in the answer's language, with no source_reading entry: "A cohort" (${COHORT}), "found in a search, not read".`);
      expect(text).toContain(`\n${STUDY_READING_DISCLOSURE}`);
      expect(text).toContain("\nGive this sentence in the answer, as written (translated when the answer is not in " +
        "English), so the reader sees how much AskRigor read: AskRigor read 1 study in full and checked its methods; " +
        "its searches listed 2 other records it didn't read.\nIts counts are of every research receipt passed to this " +
        "check, earlier research in this chat included.");
      expect(text).toContain(`\n${STUDY_LINK_GUIDANCE}`);
    } finally { await client.close(); await server.close(); }
  });

  it("gives the reading lines under a check that hasn't passed too, and none without research receipts", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { mcpSurface: "/mcp", researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "reading-summary-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const call = async (args: Record<string, unknown>) => {
        const response = await client.callTool({ name: "finalize_research", arguments: args });
        return { output: response.structuredContent as FinalizeResearchOutput,
          text: (response.content as Array<{ text: string }>)[0]!.text };
      };
      const blocked = await call(input({ later_inputs: {} }));
      expect(blocked.output.status).toBe("not_ready");
      expect(blocked.text).toContain(`\n${STUDY_READING_DISCLOSURE}`);
      expect(blocked.text).toContain("so the reader sees how much AskRigor read: AskRigor read 1 study in full and " +
        "checked its methods.");
      const none = await call(input({ receipts: [], key_sources: [], later_inputs: {},
        answer_draft: draft("A synthetic answer without studies.") }));
      expect(none.output.reading_summary).toBeUndefined();
      expect(none.text).not.toContain(STUDY_READING_DISCLOSURE);
      expect(none.text).not.toContain(STUDY_LINK_GUIDANCE);
      expect(none.text).not.toContain("how much AskRigor read");
    } finally { await client.close(); await server.close(); }
  });

  // Greptile's review of 12 Nov 2026, through the tools themselves. The copy passed for the paper holds its abstract and
  // nothing more, or its methods and results without a discussion, so acquire_open_full_text returns a lead: where the
  // copy is and its state, none of its text, no handle to read it, and a receipt signing the DOI and that state alone.
  // The final check then counts no reading of it.
  const sentences = (part: string) => Array.from({ length: 30 }, (_, n) => `Synthetic ${part} sentence ${n} describes ` +
    "generated fixture participants and their generated routines.").join(" ");
  it.each([
    ["ABSTRACT_ONLY", "abstract_only", ""],
    ["PARTIAL_TEXT_READABLE", "partial_text", `\nMethods\n${sentences("methods")}\nResults\n${sentences("results")}`]
  ])("gets a lead with none of the copy's text from acquire_open_full_text (%s), and counts no reading for its receipt", async (state, completeness, body) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    const title = "A synthetic cohort of two daily routines";
    const abstract = sentences("abstract");
    // Europe PMC's record of the DOI, and Unpaywall's, which lists no open copy. Nothing else is fetched.
    const hosts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: string | URL | Request) => {
      const url = new URL(request instanceof Request ? request.url : String(request));
      hosts.push(url.hostname);
      if (url.hostname === "www.ebi.ac.uk") {
        return new Response(JSON.stringify({ version: "6.9", hitCount: 1,
          request: { queryString: url.searchParams.get("query"), cursorMark: "*", pageSize: Number(url.searchParams.get("pageSize")) },
          resultList: { result: [{ source: "MED", id: COHORT_PMID, pmid: COHORT_PMID, doi: COHORT, title, abstractText: abstract }] }
        }), { status: 200 });
      }
      if (url.hostname === "api.unpaywall.org") {
        return new Response(JSON.stringify({ doi: COHORT, title, is_oa: false, oa_status: "closed",
          best_oa_location: null, oa_locations: [] }), { status: 200 });
      }
      return new Response("Synthetic fixture: no such page", { status: 404 });
    }));
    const server = createAskRigorServer("standard", { mcpSurface: "/mcp", researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "reading-summary-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const acquired = await client.callTool({ name: "acquire_open_full_text", arguments: {
        doi: COHORT,
        candidate_texts: [{ url: "https://journal.example.org/synthetic-cohort", retrieved_via: "client_search_index",
          text: `${title}\nDOI ${COHORT}\nAbstract\n${abstract}${body}` }],
        public_copy_search: { queries: [`"${COHORT}" full text`, `"${title}" pdf`] } } });
      expect(acquired.isError).not.toBe(true);
      const lead = acquired.structuredContent as Record<string, unknown>;
      expect(lead).toMatchObject({ status: "possibly_useful_lead", acquisition_state: state,
        unseen_content_used_as_evidence: false, public_copy_search: { status: "declared" },
        candidates: [{ state, completeness, identity_verification: "doi_exact", retrieval_provider: "client_search_index" }] });
      for (const field of ["blocks", "source", "coverage_receipt"]) expect(lead).not.toHaveProperty(field);
      // Neither the result's fields nor its text hold a sentence of the copy.
      expect(JSON.stringify(acquired)).not.toMatch(/Synthetic (?:abstract|methods|results) sentence/u);
      const receipt = lead.research_receipt as string;
      const signed = verifyResearchReceipt(receipt, { secret: SECRET });
      expect(signed).toMatchObject({ ok: true, kind: "full_text_lead", claims: { doi: COHORT, state } });
      expect(signed.ok && Object.keys(signed.claims).filter((key) => key !== "t").sort()).toEqual(["doi", "state"]);
      const response = await client.callTool({ name: "finalize_research", arguments: input({ receipts: [AUDIT, receipt] }) });
      expect(response.isError).not.toBe(true);
      const output = response.structuredContent as FinalizeResearchOutput;
      expect(output.reading_summary).toMatchObject({ audited: 1, part_text: 0, abstract_only: 0,
        sentence: "AskRigor read 1 study in full and checked its methods." });
      expect((response.content as Array<{ text: string }>)[0]!.text).toContain("so the reader sees how much AskRigor " +
        "read: AskRigor read 1 study in full and checked its methods.\n");
      expect([...new Set(hosts)].sort()).toEqual(["api.unpaywall.org", "www.ebi.ac.uk"]);
    } finally { await client.close(); await server.close(); }
  });
});
