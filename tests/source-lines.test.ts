import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FINAL_CHECK_PANEL_RENDER_SOURCE } from "../apps/research-mcp/src/final-check-panel.js";
import { meaningJudgeBundle, judgmentItems, MEANING_JUDGE_OUTPUT_SCHEMA } from "../apps/research-mcp/src/meaning-judge.js";
import {
  communitySkipCaveat, finalizeResearch, finalizeResearchOutputSchema, meaningJudgeSourceOf, parseFinalizeResearchInput,
  sourceLineRequestsOf, type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  lookUpSourceLines, quoteShown, SOURCE_LINE_CONFIRMED, sourceLineConfirmed, sourceLineDocument,
  sourceLineNotes, type SourceLine, type SourceLineDocument, type SourceLineRequest, type SourceLineTexts,
} from "../apps/research-mcp/src/source-lines.js";

const SECRET = "source-lines-test-secret-0123456789012345678901";
const SENTENCE = "Pain fell by 12 points in the exercise group at 6 months, against 3 points with usual care.";
const CONCLUSION = "Exercise therapy reduced pain, though the effect was small and faded after a year.";
const HANDLE = `aft1_${"a".repeat(32)}`;
const PAPER: SourceLineDocument = {
  kind: "full_text",
  blocks: [
    { text: "We enrolled adults with knee pain.", section: "Methods" },
    { text: SENTENCE, section: "Results" },
    { text: CONCLUSION, section: "Discussion" },
  ],
};
const line = (overrides: Partial<SourceLine> = {}): SourceLine => ({
  source: "10.1000/depth", claim: "Exercise eased knee pain a little.", sentence: SENTENCE, conclusion: CONCLUSION,
  against: "A larger trial found no difference after a year.", ...overrides,
});
const request = (overrides: Partial<SourceLineRequest> = {}): SourceLineRequest =>
  ({ line: 0, keySource: true, handles: [HANDLE], pmids: [], ...overrides });
const held = (document: SourceLineDocument | undefined = PAPER, abstract: SourceLineTexts["abstract"] = async () => undefined): SourceLineTexts =>
  ({ fullText: () => document, abstract });
const lookUp = async (given: SourceLine, texts = held(), wanted = request()) =>
  (await lookUpSourceLines([given], [wanted], texts))[0]!;

describe("looking a source line's quotes up", () => {
  it("finds both quotes and says where", async () => {
    expect(await lookUp(line())).toEqual({ source: "10.1000/depth", sentence: "found", sentence_section: "Results",
      conclusion: "found", conclusion_section: "Discussion", text: "full_text" });
  });

  it("sets aside only spacing, case, typography and the marks around a quote", async () => {
    const given = line({
      sentence: `“${SENTENCE.toUpperCase().replace(/ /gu, "\n  ")}”`,
      conclusion: CONCLUSION.replace("though", "though").replace(/\.$/u, ""),
    });
    expect(await lookUp(given)).toMatchObject({ sentence: "found", conclusion: "found" });
  });

  // A changed word, number or sign is the failure this check exists to catch.
  it.each([
    ["a word", SENTENCE.replace("fell", "rose")],
    ["a number", SENTENCE.replace("12 points", "13 points")],
    ["a stitched quote", SENTENCE.replace(" in the exercise group", " ...")],
  ])("doesn't find a quote with %s changed", async (_, sentence) => {
    expect(await lookUp(line({ sentence }))).toMatchObject({ sentence: "not_found", conclusion: "found" });
  });

  it("keeps a minus sign, so a flipped sign isn't found", async () => {
    const paper: SourceLineDocument = { kind: "full_text", blocks: [{ text: "The mean change in pain score was −0.5 points over the year." }] };
    const quote = "The mean change in pain score was 0.5 points over the year.";
    expect(await lookUp(line({ sentence: quote }), held(paper))).toMatchObject({ sentence: "not_found" });
    expect(await lookUp(line({ sentence: quote.replace("0.5", "-0.5") }), held(paper))).toMatchObject({ sentence: "found" });
  });

  it("works in any language and script", async () => {
    const paper: SourceLineDocument = { kind: "full_text", blocks: [
      { text: "運動療法は6か月後の痛みを軽減したが、その効果は小さかった。" },
      { text: "Le traitement a réduit la douleur de façon modérée après six mois." },
    ] };
    expect(await lookUp(line({ sentence: "運動療法は6か月後の痛みを軽減したが、その効果は小さかった。",
      conclusion: "le traitement a RÉDUIT la douleur de façon modérée après six mois" }), held(paper)))
      .toMatchObject({ sentence: "found", conclusion: "found" });
  });

  it("finds a quote a PDF broke across lines, a page or a real hyphen", async () => {
    const paper: SourceLineDocument = { kind: "full_text", blocks: [
      { text: "Participants in the inter-\nvention arm reported well-\nknown side effects and pre- and post-treatment scores were", section: "Results" },
      { text: "compared with those of the control arm at twelve weeks.", section: "Results" },
    ] };
    expect(await lookUp(line({ sentence: "Participants in the intervention arm reported", conclusion: "pre- and post-treatment scores were compared with those of the control arm" }), held(paper)))
      .toMatchObject({ sentence: "found", conclusion: "found" });
    expect(await lookUp(line({ sentence: "reported well-known side effects and" }), held(paper))).toMatchObject({ sentence: "found" });
  });

  it("says when a quote is too short to mean much", async () => {
    expect(await lookUp(line({ sentence: "Pain fell.", conclusion: "It helped." })))
      .toMatchObject({ sentence: "not_checked", conclusion: "not_checked", reason: "too_short" });
    expect(await lookUp(line({ sentence: "Pain fell." })))
      .toMatchObject({ sentence: "not_checked", conclusion: "found", reason: "too_short" });
  });

  it("names a line for a source that isn't a key source", async () => {
    expect(await lookUp(line(), held(), request({ keySource: false })))
      .toEqual({ source: "10.1000/depth", sentence: "not_checked", conclusion: "not_checked", reason: "not_a_key_source" });
  });

  it("says no text was fetched, and doesn't call that a quote not found", async () => {
    expect(await lookUp(line(), held(), request({ handles: [] })))
      .toMatchObject({ sentence: "not_checked", conclusion: "not_checked", reason: "no_text" });
  });

  it("looks in the abstract when no full text is held, and a quote missing from it isn't found there", async () => {
    const abstract = vi.fn<SourceLineTexts["abstract"]>().mockResolvedValue({ kind: "abstract", blocks: [{ text: `Results: ${SENTENCE}` }] });
    const texts: SourceLineTexts = { fullText: () => undefined, abstract };
    const result = await lookUp(line(), texts, request({ handles: [], pmids: ["12345"] }));
    expect(result).toMatchObject({ sentence: "found", conclusion: "not_found", text: "abstract" });
    expect(abstract).toHaveBeenCalledWith("12345");
  });

  it("asks PubMed once for two lines of one paper", async () => {
    const abstract = vi.fn<SourceLineTexts["abstract"]>().mockResolvedValue({ kind: "abstract", blocks: [{ text: `${SENTENCE} ${CONCLUSION}` }] });
    const wanted = [request({ handles: [], pmids: ["12345"] }), request({ line: 1, handles: [], pmids: ["12345"] })];
    const results = await lookUpSourceLines([line(), line()], wanted, { fullText: () => undefined, abstract });
    expect(results.map(({ sentence }) => sentence)).toEqual(["found", "found"]);
    expect(abstract).toHaveBeenCalledOnce();
  });

  // Only an abstract is left of a paper read in full, so a quote from its body can't be called missing.
  it("leaves a quote unchecked once a full text has expired and only the abstract is left", async () => {
    const abstract: SourceLineTexts["abstract"] = async () => ({ kind: "abstract", blocks: [{ text: SENTENCE }] });
    expect(await lookUp(line(), { fullText: () => undefined, abstract }, request({ pmids: ["12345"] })))
      .toMatchObject({ sentence: "found", conclusion: "not_checked", reason: "text_expired", text: "abstract" });
    expect(await lookUp(line(), { fullText: () => undefined, abstract: async () => undefined }))
      .toMatchObject({ sentence: "not_checked", conclusion: "not_checked", reason: "text_expired" });
  });

  it("leaves a line unchecked when PubMed can't be read, and goes on", async () => {
    const abstract: SourceLineTexts["abstract"] = async () => { throw new Error("offline"); };
    expect(await lookUp(line(), { fullText: () => undefined, abstract }, request({ handles: [], pmids: ["12345"] })))
      .toMatchObject({ sentence: "not_checked", reason: "text_unavailable" });
  });

  it("says a copy the AI supplied isn't one AskRigor fetched, and doesn't confirm it", async () => {
    const index = { source: { provider: "client_supplied" }, blocks: [{ text: SENTENCE, section_path: ["Results"] }, { text: CONCLUSION, section_path: [] }] };
    const document = sourceLineDocument(index as never);
    expect(document).toEqual({ kind: "search_copy", blocks: [{ text: SENTENCE, section: "Results" }, { text: CONCLUSION }] });
    const lookup = await lookUp(line(), held(document));
    expect(lookup).toMatchObject({ sentence: "found", conclusion: "found", text: "search_copy" });
    expect(sourceLineConfirmed({ ...lookup, label: "x", shown: true })).toBe(false);
  });
});

describe("what the AI is told", () => {
  const check = (overrides = {}) => ({ source: "s", label: "[1]", sentence: "found" as const, conclusion: "found" as const,
    text: "full_text" as const, shown: true, ...overrides });

  it("says nothing of a line found and shown", () => {
    expect(sourceLineNotes(check())).toEqual([]);
    expect(sourceLineConfirmed(check())).toBe(true);
  });

  it("names what wasn't found, and where it looked", () => {
    expect(sourceLineNotes(check({ sentence: "not_found" }))[0]).toMatch(/^The sentence given for \[1\] isn't in the full text AskRigor looked in\./u);
    expect(sourceLineNotes(check({ sentence: "not_found", conclusion: "not_found", text: "abstract" }))[0])
      .toMatch(/^The sentence and the conclusion given for \[1\] aren't in the abstract AskRigor looked in\./u);
    expect(sourceLineConfirmed(check({ sentence: "not_found" }))).toBe(false);
  });

  it.each([
    ["not_a_key_source", /isn't in key_sources/u], ["no_text", /fetched no text of \[1\]/u],
    ["text_unavailable", /couldn't read the abstract/u], ["text_expired", /acquire_open_full_text/u], ["too_short", /too short/u],
  ] as const)("explains %s", (reason, wording) => {
    expect(sourceLineNotes(check({ sentence: "not_checked", conclusion: "not_checked", reason }))[0]).toMatch(wording);
  });

  it("asks for both quotes in the answer", () => {
    expect(sourceLineNotes(check({ shown: false }))[0]).toMatch(/^The answer doesn't show both quotes given for \[1\]/u);
    expect(quoteShown(`Le papier dit : « ${SENTENCE} »`, `“${SENTENCE}”`)).toBe(true);
    expect(quoteShown("Le papier dit autre chose.", SENTENCE)).toBe(false);
  });
});

function fixture(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  return {
    receipts: [issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16), handle: HANDLE }, { secret: SECRET })],
    research_target: "Synthetic source line", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the source line.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the source line." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Smith 2021]" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: `[Smith 2021] [Étude](https://doi.org/10.1000/depth): "${SENTENCE}" "${CONCLUSION}"\n\n` +
      communitySkipCaveat("Synthetic fixture isolates the source line."),
    ...overrides,
  } as FinalizeResearchInput;
}
const LOOKUP = { source: "10.1000/depth", sentence: "found", sentence_section: "Results", conclusion: "found",
  conclusion_section: "Discussion", text: "full_text" } as const;

describe("the source line in the final check", () => {
  it("takes the optional field through later_inputs and drops a bad one with a note", () => {
    const parsed = parseFinalizeResearchInput({ ...fixture(), later_inputs: { source_lines: [line()] } });
    expect(parsed.data?.source_lines).toEqual([line()]);
    const bad = parseFinalizeResearchInput({ ...fixture(), later_inputs: { source_lines: [{ source: "x" }] } });
    expect(bad.success).toBe(true);
    expect(bad.data?.source_lines).toBeUndefined();
    expect(bad.notes.join(" ")).toContain("source_lines");
  });

  it("asks to look the lines up in the text the source's verified receipt names, once the check passes", () => {
    const result = finalizeResearch(fixture({ source_lines: [line()] }), { secret: SECRET });
    expect(result.status).toMatch(/^ready/u);
    expect(sourceLineRequestsOf(result)).toEqual([{ line: 0, keySource: true, handles: [HANDLE], pmids: [] }]);
    expect(result).not.toHaveProperty("source_lines");
    // A failing check asks nothing, and a check already looked up doesn't ask again.
    const failing = finalizeResearch(fixture({ source_lines: [line()], answer_draft: "No link to the study here." }), { secret: SECRET });
    expect(failing.status).toBe("not_ready");
    expect(sourceLineRequestsOf(failing)).toBeUndefined();
    expect(sourceLineRequestsOf(finalizeResearch(fixture({ source_lines: [line()] }), { secret: SECRET, sourceLineLookups: [LOOKUP] }))).toBeUndefined();
  });

  it("finds a PMID from the key source or a PubMed receipt, and ignores another paper's receipt", () => {
    const receipts = [
      issueResearchReceipt("pubmed_record", { pmid: "12345", doi: "10.1000/depth" }, { secret: SECRET }),
      issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16), handle: HANDLE }, { secret: SECRET }),
      issueResearchReceipt("full_text_read", { doi: "10.1000/other", content: "b".repeat(16), handle: `aft1_${"b".repeat(32)}` }, { secret: SECRET }),
    ];
    const result = finalizeResearch(fixture({ receipts, source_lines: [line(), line({ source: "10.1000/nobody" })] }), { secret: SECRET });
    expect(sourceLineRequestsOf(result)).toEqual([
      { line: 0, keySource: true, handles: [HANDLE], pmids: ["12345"] },
      { line: 1, keySource: false, handles: [], pmids: [] },
    ]);
  });

  it("reports each line, with the answer's label, and keeps a passing check passing whatever was found", () => {
    const missing = { ...LOOKUP, sentence: "not_found" as const };
    const input = fixture({ source_lines: [line()] });
    const found = finalizeResearch(input, { secret: SECRET, sourceLineLookups: [LOOKUP] });
    expect(found.source_lines).toEqual([{ ...LOOKUP, label: "[Smith 2021]", shown: true }]);
    expect(finalizeResearchOutputSchema.safeParse(found).success).toBe(true);
    const unfound = finalizeResearch(input, { secret: SECRET, sourceLineLookups: [missing] });
    expect(unfound.status).toBe(found.status);
    expect(unfound.next_steps).toEqual([]);
    expect(unfound.round).toEqual(found.round);
    expect(unfound.notes).toContainEqual(expect.stringMatching(/^The sentence given for \[Smith 2021\] isn't in the full text/u));
  });

  it("says when the answer doesn't show the quotes", () => {
    const draft = fixture().answer_draft!.replace(`"${SENTENCE}" "${CONCLUSION}"`, "A short summary.");
    const result = finalizeResearch(fixture({ source_lines: [line()], answer_draft: draft }), { secret: SECRET, sourceLineLookups: [LOOKUP] });
    expect(result.source_lines?.[0]?.shown).toBe(false);
    expect(result.notes).toContainEqual(expect.stringMatching(/^The answer doesn't show both quotes given for \[Smith 2021\]/u));
  });
});

describe("the meaning judge reads the lines", () => {
  const source = { answer: "A.", commentsRead: false, keySources: [], limits: [], sourceLines: [line()] };

  it("carries each line, numbered, and judges one by its number", () => {
    const bundle = meaningJudgeBundle(source)!;
    expect(bundle.source_lines).toEqual([{ number: 1, ...line() }]);
    const reply = { youtube_comments: [], comparison: [], limits: [], standalone: [],
      source_lines: [{ line: 1, backed: false, why: "The claim is wider than its quotes." }, { line: 9, backed: false, why: "" }] };
    expect(judgmentItems(reply, bundle)?.sourceLines).toEqual([{ line: 1, backed: false, why: "The claim is wider than its quotes." }]);
    expect(MEANING_JUDGE_OUTPUT_SCHEMA.required).toContain("source_lines");
  });

  it("gets the lines of a passing check, and its doubt is a note that blocks nothing", () => {
    const input = fixture({ source_lines: [line()] });
    const passing = finalizeResearch(input, { secret: SECRET, sourceLineLookups: [LOOKUP] });
    expect(meaningJudgeSourceOf(passing)?.sourceLines).toEqual([line()]);
    const judged = finalizeResearch(input, { secret: SECRET, sourceLineLookups: [LOOKUP], meaningJudgment: { status: "ran", youtube: [],
      comparison: [], limits: [], standalone: [], sourceLines: [{ line: 1, backed: false, why: "It says more than the quotes do." }] } });
    expect(judged.status).toBe(passing.status);
    expect(judged.notes).toContainEqual(expect.stringMatching(/^The meaning judge doubts that the quotes of source_lines\[0\] back its claim \(It says more than the quotes do\)/u));
  });
});

// The panel test's own page shim, with what this one reads.
class Element {
  children: Element[] = [];
  textContent = "";
  constructor(readonly tagName: string) {}
  appendChild(child: Element) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
}
function panelText(result: unknown): string[] {
  const root = new Element("main");
  const document = { getElementById: () => root, createElement: (tag: string) => new Element(tag) };
  runInNewContext(`${FINAL_CHECK_PANEL_RENDER_SOURCE}\nrenderFinalCheck(document, result);`, { document, result });
  const texts: string[] = [];
  const walk = (element: Element) => { if (element.textContent !== "") texts.push(element.textContent); element.children.forEach(walk); };
  walk(root);
  return texts;
}

describe("the panel", () => {
  const panel = (...source_lines: unknown[]) => panelText({ status: "ready", limits: [], sources: {}, community: {}, source_lines });
  const labelled = { ...LOOKUP, label: "[Smith 2021]", shown: true };

  it("says nothing of source lines when there are none", () => {
    expect(panelText({ status: "ready", limits: [], sources: {}, community: {} }).join(" ")).not.toContain("quotes behind");
  });

  it("lists each line, says what finding a quote shows and where each was found", () => {
    const text = panel(labelled);
    expect(text).toContainEqual(expect.stringContaining("shows the words are there, not that they are a fair summary"));
    expect(text).toContain("[Smith 2021]: ✓ both quotes are in the paper's full text (Results) (Discussion).");
  });

  it("shows a quote not found, and doesn't tick a supplied copy", () => {
    expect(panel({ ...labelled, sentence: "not_found", sentence_section: undefined }))
      .toContain("[Smith 2021]: the paper's sentence NOT found, its conclusion found (Discussion), in the paper's full text.");
    expect(panel({ ...labelled, text: "search_copy" }).join(" ")).not.toContain("✓ both");
    expect(panel({ ...labelled, text: "search_copy" }).join(" ")).toContain("a copy the AI supplied, not one AskRigor fetched itself");
  });

  it("says when there was no text to look in", () => {
    expect(panel({ ...labelled, sentence: "not_checked", conclusion: "not_checked", reason: "no_text" }))
      .toContain("[Smith 2021]: not looked up: AskRigor has no text of this paper to look in.");
  });
});

describe("the finalize_research tool", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  async function call(texts: SourceLineTexts, input: unknown) {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { sourceLineTexts: texts, findingsLibrary: false,
      secondReader: { enabled: false, readAnswer: vi.fn() } });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "source-lines-test", version: "1" });
    try {
      await server.connect(st); await client.connect(ct);
      const result = await client.callTool({ name: "finalize_research", arguments: input as Record<string, unknown> });
      expect(result.isError).not.toBe(true);
      return { body: result.structuredContent as Record<string, unknown>, text: (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n") };
    } finally { await client.close(); await server.close(); }
  }

  it("names the optional field in every result, so an AI that hasn't read it learns of it", async () => {
    const { text } = await call(held(), fixture());
    expect(text).toContain("A key claim can carry a source line: later_inputs.source_lines");
  });

  it("looks the lines up and tells the AI which it may mark as found", async () => {
    const fullText = vi.fn<SourceLineTexts["fullText"]>().mockReturnValue(PAPER);
    const { body, text } = await call({ fullText, abstract: vi.fn() }, { ...fixture(), later_inputs: { source_lines: [line()] } });
    expect(fullText).toHaveBeenCalledWith(HANDLE);
    expect(body.source_lines).toEqual([{ ...LOOKUP, label: "[Smith 2021]", shown: true }]);
    expect(text).toContain(`Both quotes were found for [Smith 2021]: beside each of these lines, and no other, the answer may show "${SOURCE_LINE_CONFIRMED}"`);
  });

  it("offers no mark when a quote wasn't found", async () => {
    const { body, text } = await call(held(), { ...fixture(), later_inputs: { source_lines: [line({ sentence: SENTENCE.replace("12", "13") })] } });
    expect(body.status).toMatch(/^ready/u);
    expect(text).not.toContain(SOURCE_LINE_CONFIRMED);
    expect(text).toContain("The sentence given for [Smith 2021] isn't in the full text AskRigor looked in.");
  });

  it("gives up on a text that doesn't come in time, and the check stands", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const texts: SourceLineTexts = { fullText: () => undefined, abstract: () => new Promise(() => undefined) };
      const receipts = [issueResearchReceipt("study_audit", { doi: "10.1000/depth", pmid: "12345", content: "a".repeat(16) }, { secret: SECRET })];
      const pending = call(texts, { ...fixture({ receipts }), later_inputs: { source_lines: [line()] } });
      await vi.advanceTimersByTimeAsync(9_000);
      const { body } = await pending;
      expect(body.status).toMatch(/^ready/u);
      expect(body.source_lines).toMatchObject([{ sentence: "not_checked", reason: "text_unavailable" }]);
    } finally { vi.useRealTimers(); }
  });
});
