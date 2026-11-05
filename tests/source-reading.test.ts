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
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  SOURCE_READINGS, SOURCE_READING_LABELS, identifierShown, sourceReadingGuidance, verifiedSourceReading,
  type SourceReading
} from "../apps/research-mcp/src/source-reading.js";
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// How each key study was read, said beside it (the owner, 5 Nov 2026: "make sure askrigor is enforcing that the AI tells
// people what it actually read, like 'In this study (abstract read/full text read/full text and images analyzed)'").
// source_reading, a later input of finalize_research, copies the answer's words for each key source; under the read_depth
// blocking rule, a key source the draft cites needs an entry whose quote the draft shows. The studies, identifiers and
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
  later_inputs: { source_reading: [{ source: DOI, quote: AUDITED }] },
  ...overrides
});
const check = (overrides: Record<string, unknown> = {}) =>
  assertNextStepsContract(finalizeResearch(input(overrides), { secret: SECRET }));
const readingSteps = (result: FinalizeResearchOutput) => result.next_steps.filter((step) => step.includes("how it was read"));

// Each step, word for word.
const missing = (id: string, reading?: SourceReading) => reading === undefined
  ? `Key source ${id} is cited in the answer without saying how it was read: give it a read_depth its receipts ` +
    "support, say beside it how it was read, in the answer's language, and give later_inputs.source_reading an entry " +
    `for it, with source ${id} and quote those words copied from answer_draft.`
  : `Key source ${id} is cited in the answer without saying how it was read (${SOURCE_READING_LABELS[reading]}): say ` +
    "so beside it, in the answer's language, and give later_inputs.source_reading an entry for it, with source " +
    `${id} and quote those words copied from answer_draft.`;
const unshown = (id: string, reading: SourceReading) => `source_reading's quote for ${id} is not in the answer: say ` +
  `beside it how it was read (${SOURCE_READING_LABELS[reading]}), in the answer's language, and copy those words ` +
  "exactly from answer_draft.";

describe("source_reading: its shape and words", () => {
  it("is a later input of finalize_research, with a reading for each read_depth and one for another tool", () => {
    expect(laterInputNames("finalize_research")).toContain("source_reading");
    expect([...SOURCE_READINGS].sort()).toEqual([...READ_DEPTH_VALUES, "other_tool"].sort());
  });

  it("words each reading as the owner's examples do, with no semicolon to blur the list", () => {
    expect(SOURCE_READING_LABELS).toMatchObject({
      full_text_audited: "full text read, methods audited by AskRigor",
      full_text_read: "full text read",
      partial_text: "part of the text read",
      abstract_only: "abstract only",
      conference_abstract: "abstract only",
      atlas_checked: "from a checked Atlas finding",
      other_tool: "read through another tool, not checked by AskRigor"
    });
    for (const label of Object.values(SOURCE_READING_LABELS)) expect(label).not.toMatch(/[;；]/u);
    // "Full text and figures analyzed" waits for AskRigor's figure reading, which isn't built: no label claims it.
    expect(Object.values(SOURCE_READING_LABELS).join(" ")).not.toMatch(/figure|image/iu);
  });

  it("reads what the check verified first, then a lower declaration no receipt can contradict", () => {
    const none = { audited: false, read: false, atlasChecked: false };
    expect(verifiedSourceReading("atlas_checked", { ...none, atlasChecked: true })).toBe("atlas_checked");
    expect(verifiedSourceReading("atlas_checked", none)).toBeUndefined();
    expect(verifiedSourceReading("atlas_checked", { ...none, audited: true, read: true })).toBe("full_text_audited");
    expect(verifiedSourceReading("partial_text", { ...none, audited: true, read: true })).toBe("full_text_audited");
    expect(verifiedSourceReading("full_text_audited", { ...none, read: true })).toBe("full_text_read");
    expect(verifiedSourceReading("full_text_audited", none)).toBeUndefined();
    expect(verifiedSourceReading("full_text_read", none)).toBeUndefined();
    expect(verifiedSourceReading(undefined, none)).toBeUndefined();
    for (const declared of ["partial_text", "abstract_only", "conference_abstract", "secondary_only", "metadata_only",
      "inaccessible", "route_error"] as const) {
      expect(verifiedSourceReading(declared, { ...none, atlasChecked: true })).toBe(declared);
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
const CASES: ReadonlyArray<[SourceReading, Record<string, unknown>, Record<string, unknown>]> = [
  ["full_text_audited", { receipts: [audit] }, { status: "validated", read_depth: "full_text_audited" }],
  ["full_text_read", { receipts: [sign("full_text_read", { doi: DOI, content: "b".repeat(16) })] },
    { status: "validated", read_depth: "full_text_read" }],
  ...(["partial_text", "abstract_only", "conference_abstract", "secondary_only", "metadata_only", "inaccessible",
    "route_error"] as const).map((read_depth): [SourceReading, Record<string, unknown>, Record<string, unknown>] =>
    [read_depth, { receipts: [PUBMED] }, { status: "lead_only", read_depth }]),
  ["other_tool", { receipts: [LEAD] }, { status: "lead_only", read_depth: "abstract_only", other_route: "read" }],
  ["atlas_checked", {
    receipts: [atlasLookup],
    atlas_reuse: [{ number: "P-1001", relation: "confirms", answer_quote: ATLAS_QUOTE, page_url: ATLAS_URL }]
  }, { status: "validated", read_depth: "atlas_checked" }]
];

describe("each reading, as the check verified it", () => {
  it.each(CASES)("%s: named up front, asked for beside a cited study, and met by the answer's words", (reading, extra, source) => {
    const label = SOURCE_READING_LABELS[reading];
    const keySources = [{ id: DOI, answer_marker: "Trial", ...source }];
    const atlas = reading === "atlas_checked" ? [ATLAS_QUOTE] : [];
    const cited = `[Trial](https://doi.org/${DOI}) compared two routines`;
    const blocked = check({ ...extra, key_sources: keySources, later_inputs: {},
      answer_draft: draft(`${cited}.`, ...atlas) });
    expect(blocked.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading }]);
    expect(blocked.status).toBe("not_ready");
    expect(readingSteps(blocked)).toEqual([missing(DOI, reading)]);
    const met = check({ ...extra, key_sources: keySources, answer_draft: draft(`${cited} (${label}).`, ...atlas),
      later_inputs: { source_reading: [{ source: DOI, quote: label }] } });
    expect(met.next_steps).toEqual([]);
    expect(met.status).toMatch(/^ready/u);
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
    expect(result.source_reading).toEqual([{ source: DOI, name: `"Trial" (${DOI})`, reading: "full_text_read" }]);
    expect(result.next_steps).toEqual([
      `Key source ${DOI} cannot support read_depth full_text_audited with these receipts; give read_depth ` +
        "full_text_read, or pass its matching research_receipt.",
      missing(DOI, "full_text_read")
    ]);
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
    const result = check({ later_inputs: { source_reading: [{ source: DOI, quote: "full text read and audited" }] } });
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
      expect(check({ later_inputs: { source_reading: [{ source: DOI, quote }] } }).next_steps, quote).toEqual([]);
    }
    expect(check({ answer_draft: draft(`[Trial](https://doi.org/${DOI}) (full text read – methods audited by AskRigor).`),
      later_inputs: { source_reading: [{ source: DOI, quote: "full text read - methods audited by AskRigor" }] } })
      .next_steps).toEqual([]);
    // A quote of marks alone shows nothing.
    expect(check({ later_inputs: { source_reading: [{ source: DOI, quote: "()" }] } }).next_steps)
      .toEqual([unshown(DOI, "full_text_audited")]);
  });

  it("matches an entry to its key source by the identifier as the gate normalizes it", () => {
    expect(check({ later_inputs: { source_reading: [{ source: `https://doi.org/${DOI.toUpperCase()}`, quote: AUDITED }] } })
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
      { source: DOI, name: `"Trial" (${DOI})`, reading: "full_text_audited" },
      { source: OTHER_DOI, name: `"Cohort" (${OTHER_DOI})`, reading: "abstract_only" }
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
      later_inputs: { source_reading: [{ source: DOI, quote: french }] } }).next_steps).toEqual([]);
    const japanese = "全文を読み、AskRigorが方法を監査済み";
    expect(check({ answer_draft: draft(`[試験](https://doi.org/${DOI})（${japanese}）は二つの方法を比べた。`),
      later_inputs: { source_reading: [{ source: DOI, quote: japanese }] } }).next_steps).toEqual([]);
    expect(check({ answer_draft: draft(`[試験](https://doi.org/${DOI})は二つの方法を比べた。`),
      later_inputs: { source_reading: [{ source: DOI, quote: japanese }] } }).next_steps)
      .toEqual([unshown(DOI, "full_text_audited")]);
  });

  it("notes an entry naming no key source, and a second entry for one, without blocking", () => {
    const result = check({ later_inputs: { source_reading: [{ source: DOI, quote: AUDITED },
      { source: OTHER_DOI, quote: "abstract only" }, { source: DOI.toUpperCase(), quote: "full text read" }] } });
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result)).toEqual(expect.arrayContaining([
      `source_reading names ${OTHER_DOI}, which key_sources does not list: give each key source's id as key_sources ` +
        "gives it, or leave the entry out.",
      `source_reading gives ${DOI.toUpperCase()} more than once: give each key source one entry; only the first is checked.`
    ]));
    // The first entry for a source is the one checked.
    expect(check({ later_inputs: { source_reading: [{ source: DOI, quote: "full text read and audited" },
      { source: DOI, quote: AUDITED }] } }).next_steps).toEqual([unshown(DOI, "full_text_audited")]);
  });

  it("changes nothing for a call without key sources", () => {
    const plain = { key_sources: [], receipts: [], answer_draft: draft("A synthetic answer without studies.") };
    const without = check({ ...plain, later_inputs: {} });
    expect(without.source_reading).toBeUndefined();
    expect(without.status).toBe("ready_with_limits");
    expect(without.next_steps).toEqual([]);
    expect(advisoryNotes(without).join(" ")).not.toContain("source_reading");
    // A stray entry is a note, and nothing else changes.
    const stray = check({ ...plain, later_inputs: { source_reading: [{ source: DOI, quote: "abstract only" }] } });
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
        "with source … and quote those words copied from answer_draft."
    ]);
  });
});

describe("the result names each reading up front, and the panel lists it", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("words the result's line from each key source's name and reading", () => {
    expect(sourceReadingGuidance([
      { source: DOI, name: `"Trial" (${DOI})`, reading: "full_text_audited" },
      { source: PMID, name: PMID, reading: "abstract_only" }
    ])).toBe("Say beside each study how it was read, in the answer's language, and copy those words into " +
      "later_inputs.source_reading as {source, quote}, with source the study's id as key_sources gives it: " +
      `"Trial" (${DOI}), full text read, methods audited by AskRigor; ${PMID}, abstract only.`);
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
      const line = `\nSay beside each study how it was read, in the answer's language, and copy those words into ` +
        "later_inputs.source_reading as {source, quote}, with source the study's id as key_sources gives it: " +
        `"Trial" (${DOI}), full text read, methods audited by AskRigor.`;
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
      later_inputs: { source_reading: [{ source: DOI, quote: AUDITED }, { source: PMID, quote: "abstract only" }] } });
    expect(passed.status).toBe("ready_with_limits");
    const checked = fold(render(passed), "What AskRigor checked");
    expect(checked.children.map(({ textContent }) => textContent)).toContain(`What AskRigor read: "Trial" (${DOI}), ` +
      `full text read, methods audited by AskRigor; ${PMID}, abstract only.`);
    const blocked = check({ later_inputs: {} });
    expect(blocked.source_reading).toHaveLength(1);
    expect(render(blocked).textContent).not.toContain("What AskRigor read");
    // Only the panel's own words: an entry it does not know is left out.
    expect(fold(render({ ...passed, source_reading: [{ source: DOI, name: "Trial", reading: "figures_read" }] }),
      "What AskRigor checked").textContent).not.toContain("What AskRigor read");
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
