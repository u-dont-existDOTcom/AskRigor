import { runInNewContext } from "node:vm";
import { errorEnvelope, okEnvelope } from "@askrigor/contracts";
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
  abstractDocument, lookUpSourceLines, quoteShown, SOURCE_LINE_CONFIRMED, sourceLineConfirmed, sourceLineDocument,
  sourceLineNotes, type SourceLine, type SourceLineDocument, type SourceLineRequest, type SourceLineTexts,
} from "../apps/research-mcp/src/source-lines.js";
import { extractHtmlText } from "../packages/sources/src/candidate-full-text.js";
import { acquireOpenFullText, type AcquireOpenFullTextRuntime } from "../packages/sources/src/index.js";
import { syntheticArticleText, syntheticBody, syntheticPdf } from "./helpers/synthetic-full-text.js";

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

// A paper AskRigor fetched, as the source line reads its index: a candidate page or PDF, identity-checked and admitted,
// laid out and cut into blocks as the stored text is, its headings taken into the section path.
const FETCHED = { doi: "10.1234/synthetic.source-lines", pmid: "99902", title: "Synthetic source line target article",
  first_author: "Fixtureauthor B", year: "2002", journal: "Synthetic Journal" };
const FETCHED_FRONT = `${FETCHED.title}\n${FETCHED.first_author} ${FETCHED.year}\nDOI ${FETCHED.doi}`;
async function fetchedPaper(content: string | Uint8Array, type = "text/html"): Promise<SourceLineDocument> {
  const runtime: AcquireOpenFullTextRuntime = {
    searchEuropePmc: async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result",
      accessStatus: "complete", pagination: { exhausted: true }, returned: 1, data: [{ source: "MED", id: FETCHED.pmid,
        doi: FETCHED.doi, pmid: FETCHED.pmid, title: FETCHED.title, authors: [FETCHED.first_author], year: FETCHED.year,
        journal: FETCHED.journal }] }),
    unpaywallRuntime: { resolve: async () => errorEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution",
      accessStatus: "error", primaryIdentifier: FETCHED.doi, pagination: { exhausted: true }, returned: 0,
      code: "synthetic_provider_failure", message: "Synthetic response", retryable: true, data: {} }) },
    candidateRuntime: { documentFetchRuntime: { resolveAddresses: async () => ["93.184.216.34"],
      requestDocument: async () => ({ status: 200, headers: new Headers({ "content-type": type }),
        bytes: typeof content === "string" ? new TextEncoder().encode(content) : content }) },
    now: () => new Date("2026-11-05T00:00:00Z") },
  };
  const result = await acquireOpenFullText({ doi: FETCHED.doi,
    candidate_urls: [{ url: "https://www.academia.edu/synthetic-source-lines" }] }, { email: "research@example.test" }, runtime);
  expect(result.data.acquisition_state).toBe("FULL_TEXT_READABLE");
  return sourceLineDocument(result.data.document_index!);
}
const fetchedHtml = (results: string, discussion: string) => `<html><body><h1>${FETCHED.title}</h1><p>` +
  `${FETCHED.first_author} ${FETCHED.year} DOI ${FETCHED.doi}</p><h2>Abstract</h2><p>Synthetic summary.</p><h2>Methods</h2>` +
  `<p>${syntheticBody("methods")}</p><h2>Results</h2>${results}<p>${syntheticBody("results")}</p><h2>Discussion</h2>` +
  `${discussion}<p>${syntheticBody("discussion")}</p></body></html>`;

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
    // A PDF's page text: its line breaks and its pages wrap the sentences.
    const paper: SourceLineDocument = { kind: "full_text", blocks: [
      { text: "Participants in the inter-\nvention arm reported side effects. Most were well-\nknown ones, such as\nsoreness. " +
        "Pre- and post-treatment scores were", section: "Results" },
      { text: "compared with those of the control arm at twelve weeks.", section: "Results", runsOn: true },
    ] };
    expect(await lookUp(line({ sentence: "Participants in the intervention arm reported side effects.",
      conclusion: "Pre- and post-treatment scores were compared with those of the control arm at twelve weeks." }), held(paper)))
      .toMatchObject({ sentence: "found", conclusion: "found" });
    expect(await lookUp(line({ sentence: "Most were well-known ones, such as soreness." }), held(paper))).toMatchObject({ sentence: "found" });
    // A wrapped line's start isn't a clause's.
    expect(await lookUp(line({ sentence: "soreness. Pre- and post-treatment scores were compared" }), held(paper)))
      .toMatchObject({ sentence: "not_found" });
  });

  // The review of #417 and its recheck (5 November 2026): a quote is found only as one or more whole sentences of a
  // paragraph, Unicode's sentences, so a part of a sentence that dropped its negation, or the start of a number, is never
  // published as the paper's words.
  describe("only whole sentences", () => {
    const found = async (text: string, sentence: string, block: Partial<SourceLineDocument["blocks"][number]> = {}) =>
      (await lookUp(line({ sentence }), held({ kind: "full_text", blocks: [{ text, ...block }, { text: CONCLUSION }] }))).sentence;
    // An HTML page's lines as its index holds them, one a block, running on within one section.
    const fromHtml = (html: string): SourceLineDocument => ({ kind: "full_text", blocks: [
      ...extractHtmlText(html).text.split("\n").map((text, place) => ({ text, ...(place === 0 ? {} : { runsOn: true }) })),
      { text: CONCLUSION },
    ] });

    it("doesn't find a part of a sentence that leaves its negation out", async () => {
      expect(await found("Pain scores did not decrease significantly after 12 weeks.", "decrease significantly after 12 weeks"))
        .toBe("not_found");
      expect(await found("Pain scores did not decrease significantly after 12 weeks.",
        "Pain scores did not decrease significantly after 12 weeks.")).toBe("found");
    });

    // The recheck of #417: an HTML page's stored lines are laid out for full-text admission and the paywall labels, a
    // <b> or a <br> on a line of its own, so the lookup runs them on within a section; a heading starts one afresh.
    it("runs an HTML page's lines on within a section, so a bold negation or a <br> stays in its sentence", async () => {
      const paper = await fetchedPaper(fetchedHtml(
        "<p>Pain scores did <b>not</b> decrease significantly after 12 weeks.</p>" +
        "<p>We found no evidence that<br>Vitamin D reduces fracture risk in older adults.</p>",
        "<p><strong>Conclusions:</strong> Vitamin D reduced falls in older adults living alone.</p>"));
      const look = async (sentence: string) => (await lookUp(line({ sentence }), held(paper))).sentence;
      expect(await look("decrease significantly after 12 weeks")).toBe("not_found");
      expect(await look("Vitamin D reduces fracture risk in older adults.")).toBe("not_found");
      expect(await lookUp(line({ sentence: "Pain scores did not decrease significantly after 12 weeks." }), held(paper)))
        .toMatchObject({ sentence: "found", sentence_section: "Results" });
      expect(await look("We found no evidence that Vitamin D reduces fracture risk in older adults.")).toBe("found");
      // A heading, set in strong as a run-in label, starts its section afresh.
      expect(await lookUp(line({ sentence: "Vitamin D reduced falls in older adults living alone." }), held(paper)))
        .toMatchObject({ sentence: "found", sentence_section: "Conclusions:" });
    });

    it("finds a sentence after a section's label at a line's start in a PDF, and never after any other colon", async () => {
      const pdf = syntheticPdf(`${syntheticArticleText(FETCHED_FRONT)}\nConclusions: Vitamin D reduced falls in older ` +
        "adults living alone.\nWe could not confirm the earlier report: vitamin D reduces fracture risk in older adults.");
      const paper = await fetchedPaper(pdf, "application/pdf");
      const look = async (sentence: string) => (await lookUp(line({ sentence }), held(paper))).sentence;
      expect(await look("Vitamin D reduced falls in older adults living alone.")).toBe("found");
      expect(await look("Conclusions: Vitamin D reduced falls in older adults living alone.")).toBe("found");
      expect(await look("vitamin D reduces fracture risk in older adults")).toBe("not_found");
      // A label in a sentence a line break cut is no label.
      const page = (text: string): SourceLineDocument => ({ kind: "full_text", blocks: [{ text, section: "Page 2" }] });
      expect((await lookUp(line({ sentence: "vitamin D reduced fractures in older adults." }), held(page(
        "Our trial did not reproduce the earlier\nresults: vitamin D reduced fractures in older adults.")))).sentence)
        .toBe("not_found");
      // Nor is a word the section-name list doesn't know.
      expect((await lookUp(line({ sentence: "Vitamin D reduced falls in older adults living alone." }), held(page(
        "Interpretation: Vitamin D reduced falls in older adults living alone.")))).sentence).toBe("not_found");
    });

    it("prints an HTML superscript of digits as Unicode's, so a citation can be left out and a unit still matches", async () => {
      const html = "<p>Pain fell by 12 points in the exercise group<sup><a href=\"#b4\">4</a>,5&ndash;7</sup>. " +
        "Mean body mass index was 31 kg/m<sup>2</sup> in both groups.</p>";
      expect(extractHtmlText(html).text)
        .toBe("Pain fell by 12 points in the exercise group⁴,⁵⁻⁷. Mean body mass index was 31 kg/m² in both groups.");
      expect((await lookUp(line({ sentence: "Pain fell by 12 points in the exercise group." }), held(fromHtml(html)))).sentence)
        .toBe("found");
      expect((await lookUp(line({ sentence: "Mean body mass index was 31 kg/m² in both groups." }), held(fromHtml(html)))).sentence)
        .toBe("found");
      // A superscript that isn't digits reads as the rest of the text does.
      expect(extractHtmlText("<p>The 1<sup>st</sup> visit</p>").text).toBe("The 1 st visit");
      // CodeQL's incomplete multi-character sanitization (#417): split markup can't reassemble a tag, and an unclosed tag
      // at the end goes, as a browser drops it, so the text never holds the start of a tag.
      expect(extractHtmlText("<p>a <scr<b>ipt>b</p><p>c <script</p>").text).not.toMatch(/<[A-Za-z!/?]/u);
      expect(extractHtmlText("<p>p &lt; 0.05 and a<b>b</b> &lt;i&gt;</p>").text).toBe("p < 0.05 and a\nb\n<i>");
      // A citation linked in HTML reads with a space inside its brackets, and is passed over as an unlinked one is.
      const linked = "<p>We enrolled 64 adults with knee pain.</p><p>Pain fell by 12 points in the exercise group " +
        "(<a href=\"#b1\">Smith et al., 2020</a>). Function did not change.</p>";
      expect(extractHtmlText(linked).text).toContain("( Smith et al., 2020 ).");
      expect((await lookUp(line({ sentence: "Pain fell by 12 points in the exercise group" }), held(fromHtml(linked)))).sentence)
        .toBe("found");
      // A "<" that starts no tag is text (the recheck of #417, item 7), in the text and the title alike.
      const bare = "<h1>Falls (p<0.05) and function (q>0.1)</h1><p>Pain fell (p<0.05) and function rose (q>0.1).</p>";
      expect(extractHtmlText(bare)).toMatchObject({ text: "Falls (p<0.05) and function (q>0.1)\nPain fell (p<0.05) and " +
        "function rose (q>0.1).", title: "Falls (p<0.05) and function (q>0.1)" });
      const paragraphs = "<p>We enrolled 64 adults with knee pain.</p><p>Pain fell (p<0.05) and function rose (q>0.1).</p>";
      expect((await lookUp(line({ sentence: "Pain fell (p<0.05) and function rose (q>0.1)." }), held(fromHtml(paragraphs))))
        .sentence).toBe("found");
    });

    it("doesn't end a sentence at an abbreviation before a small letter", async () => {
      expect(await found("The drug reduced pain at 6 wk. but not at 12 wk.", "The drug reduced pain at 6 wk.")).toBe("not_found");
      expect(await found("The drug reduced pain at 6 wk. but not at 12 wk.", "The drug reduced pain at 6 wk. but not at 12 wk."))
        .toBe("found");
      expect(await found("There is no evidence that supplements, e.g. zinc lozenges shorten colds in adults.",
        "zinc lozenges shorten colds in adults")).toBe("not_found");
      expect(await found("Pain fell more with exercise vs. usual care at 12 weeks in older adults.",
        "usual care at 12 weeks in older adults")).toBe("not_found");
      expect(await found("Pain fell more with exercise vs. usual care at 12 weeks in older adults.",
        "Pain fell more with exercise vs.")).toBe("not_found");
      expect(await found("Most adults, i.e. those under 60, saw no benefit from the drug after a year.",
        "those under 60, saw no benefit from the drug after a year")).toBe("not_found");
      expect(await found("Smith et al. found no reduction in pain after 12 weeks of treatment.",
        "found no reduction in pain after 12 weeks of treatment")).toBe("not_found");
      expect(await found("Smith et al. found no reduction in pain after 12 weeks of treatment.",
        "Smith et al. found no reduction in pain after 12 weeks of treatment.")).toBe("found");
    });

    // The recheck of #417 (item 4a): Unicode's rules end a sentence at an abbreviation's full stop before a capital
    // letter; a sentence whose last word is one runs on into the next, by the word's form alone.
    it("runs a sentence on past an abbreviation with a full stop inside it, before a capital letter too", async () => {
      const probiotic = "No probiotic tested, e.g. Lactobacillus rhamnosus GG reduced diarrhoea in children.";
      expect(await found(probiotic, "Lactobacillus rhamnosus GG reduced diarrhoea in children.")).toBe("not_found");
      expect(await found(probiotic, probiotic)).toBe("found");
      for (const [text, part] of [
        ["Trials ran in the U.S. Pain fell in all of them by a third.", "Pain fell in all of them by a third."],
        ["Some adults, i.e. Those over 60, saw no benefit from the drug.", "Those over 60, saw no benefit from the drug."],
        ["Die Dosis, z.B. Zink in Lutschtabletten, half nicht bei Kindern.", "Zink in Lutschtabletten, half nicht bei Kindern."],
        ["Это не помогло, т.е. Симптомы держались у всех детей.", "Симптомы держались у всех детей."],
      ]) {
        expect(await found(text!, part!), text).toBe("not_found");
      }
      // A sentence that ends in a short word ends there, as Unicode's rules end it: the next one is found alone.
      for (const ending of ["Take the dose twice a day.", "The effect was seen only in men.", "Nine of ten improved in all.",
        "The dose was 10 mg."]) {
        expect(await found(`${ending} Pain fell by 12 points in the exercise group.`,
          "Pain fell by 12 points in the exercise group."), ending).toBe("found");
      }
      expect(await found("Results were similar across arms (Fig. 2). Function did not change in either arm.",
        "Function did not change in either arm.")).toBe("found");
      // A known limit: an abbreviation with no full stop inside it, before a capital letter, ends a sentence.
      for (const [text, part] of [
        ["Pain fell in Group A vs. Group B showed no change at all.", "Group B showed no change at all."],
        ["We read Smith et al. Reported harms were rare in the trial.", "Reported harms were rare in the trial."],
        ["Patients were seen by Dr. Smith in the clinic every week.", "Smith in the clinic every week."],
      ]) {
        expect(await found(text!, part!), text).toBe("found");
      }
    });

    it("never takes a colon or a semicolon as a sentence's end, in any script", async () => {
      const colon = "We could not confirm the earlier report: vitamin D reduces fracture risk in older adults.";
      expect(await found(colon, "vitamin D reduces fracture risk in older adults")).toBe("not_found");
      expect(await found(colon, colon)).toBe("found");
      const semicolon = "We enrolled 64 adults. Pain fell by 12 points in the exercise group; function improved by 4 points " +
        "with usual care. The effect faded after a year.";
      expect(await found(semicolon, "Pain fell by 12 points in the exercise group")).toBe("not_found");
      expect(await found(semicolon, "function improved by 4 points with usual care.")).toBe("not_found");
      expect(await found(semicolon, "Pain fell by 12 points in the exercise group; function improved by 4 points with usual care."))
        .toBe("found");
      expect(await found(semicolon, "We enrolled 64 adults. Pain fell by 12 points in the exercise group; function improved by " +
        "4 points with usual care.")).toBe("found");
      expect(await found(semicolon, "The effect faded after a year")).toBe("found");
      const chinese = "我们无法证实先前的报告：维生素D可显著降低老年人的骨折风险。其他结果未显示。";
      expect(await found(chinese, "维生素D可显著降低老年人的骨折风险。")).toBe("not_found");
      expect(await found(chinese, "我们无法证实先前的报告：维生素D可显著降低老年人的骨折风险。")).toBe("found");
      const arabic = "انخفض ألم الركبة بشكل ملحوظ؛ تحسنت الوظيفة بعد ستة أشهر من العلاج. وانتهت الدراسة.";
      expect(await found(arabic, "تحسنت الوظيفة بعد ستة أشهر من العلاج")).toBe("not_found");
      expect(await found(arabic, "انخفض ألم الركبة بشكل ملحوظ؛ تحسنت الوظيفة بعد ستة أشهر من العلاج.")).toBe("found");
    });

    it("finds whole sentences in any script", async () => {
      expect(await found("膝の痛みは12週間後に有意に減少した。その他の結果は示さない。", "膝の痛みは12週間後に有意に減少した。"))
        .toBe("found");
      expect(await found("膝の痛みは12週間後に有意に減少しなかった。", "12週間後に有意に減少しなかった")).toBe("not_found");
      expect(await found("انخفض ألم الركبة بشكل ملحوظ بعد ستة أشهر من العلاج. وتحسنت الوظيفة أيضا.",
        "انخفض ألم الركبة بشكل ملحوظ بعد ستة أشهر من العلاج.")).toBe("found");
      expect(await found("छह महीने के उपचार के बाद घुटने का दर्द काफी कम हो गया। कार्य में भी सुधार हुआ।",
        "छह महीने के उपचार के बाद घुटने का दर्द काफी कम हो गया।")).toBe("found");
      expect(await found("छह महीने के उपचार के बाद घुटने का दर्द काफी कम नहीं हुआ।", "महीने के उपचार के बाद घुटने का दर्द काफी कम नहीं हुआ"))
        .toBe("not_found");
      expect(await found("Ο πόνος στο γόνατο μειώθηκε σημαντικά μετά από 12 εβδομάδες. Η λειτουργία βελτιώθηκε.",
        "Ο πόνος στο γόνατο μειώθηκε σημαντικά μετά από 12 εβδομάδες.")).toBe("found");
    });

    // The recheck of #417 (item f): scripts and marks Unicode's rules end no sentence at refuse a part, as Thai does.
    it("refuses a part of a Greek sentence that ends with a question mark, and of Tibetan or Lao text", async () => {
      // A Greek question mark (U+037E) is the semicolon itself once a text is in NFC, and ends no sentence there.
      const greek = "Μειώθηκε ο πόνος μετά από 12 εβδομάδες\u037E Ναι, σε όλους τους ασθενείς της μελέτης.";
      expect(greek.normalize("NFC")).toContain(";");
      expect(await found(greek.normalize("NFC"), "Ναι, σε όλους τους ασθενείς της μελέτης.")).toBe("not_found");
      const second = "ནད་པ་རྣམས་ཀྱི་ལས་ཀ་ཡག་ཏུ་ཕྱིན་པ་རེད་ཅེས་སྨན་པ་རྣམས་ཀྱིས་བཤད།";
      expect(await found(`ནད་པ་རྣམས་ཀྱི་ན་ཟུག་ཆུང་དུ་ཕྱིན། ${second}`, second)).toBe("not_found");
      const lao = "ຄວາມເຈັບປວດຫຼຸດລົງຫຼັງຈາກ 12 ອາທິດ ການເຮັດວຽກດີຂຶ້ນສຳລັບຄົນເຈັບທັງໝົດ";
      expect(await found(lao, "ການເຮັດວຽກດີຂຶ້ນສຳລັບຄົນເຈັບທັງໝົດ")).toBe("not_found");
      expect(await found(lao, lao)).toBe("found");
    });

    it("finds only a whole block in a script with no sentence marks", async () => {
      const thai = "ความเจ็บปวดลดลงอย่างมีนัยสำคัญหลังจาก 12 สัปดาห์ การทำงานของข้อเข่าดีขึ้นด้วย";
      expect(await found(thai, "ความเจ็บปวดลดลงอย่างมีนัยสำคัญหลังจาก 12 สัปดาห์")).toBe("not_found");
      expect(await found(thai, "การทำงานของข้อเข่าดีขึ้นด้วย")).toBe("not_found");
      expect(await found(thai, thai)).toBe("found");
    });

    it("lets a citation, a closing mark or a bracket sit between the quote and its sentence's end", async () => {
      for (const text of [
        "Pain fell by 12 points in the exercise group [12]. Function did not change.",
        "Pain fell by 12 points in the exercise group [3, 4–6]. Function did not change.",
        "Pain fell by 12 points in the exercise group¹². Function did not change.",
        "Pain fell by 12 points in the exercise group.¹²,¹³ Function did not change.",
        "Pain fell by 12 points in the exercise group.[12] Function did not change.",
        "Pain fell by 12 points in the exercise group (Smith et al., 2020). Function did not change.",
        "Pain fell by 12 points in the exercise group (Smith et al. 2020; Lee, 2021). Function did not change.",
        "Pain fell by 12 points in the exercise group (Smith et al. 2020). Function did not change.",
        "Pain fell by 12 points in the exercise group (Smith & Jones, 2019). Function did not change.",
        // Linked in HTML or a JATS xref: white space just inside the brackets and before a semicolon.
        "Pain fell by 12 points in the exercise group ( Smith et al., 2020 ). Function did not change.",
        "Pain fell by 12 points in the exercise group ( Smith, 2020 ; Lee et al. 2021 ). Function did not change.",
        "Pain fell by 12 points in the exercise group [ 12 , 14 ]. Function did not change.",
        "“Pain fell by 12 points in the exercise group.” Then he left.",
        "(Pain fell by 12 points in the exercise group.) Then it rose.",
      ]) {
        expect(await found(text, "Pain fell by 12 points in the exercise group"), text).toBe("found");
      }
      // A citation the sentence before left at the next one's start.
      expect(await found("Pain fell in the exercise group.[12] Function did not change in either arm.",
        "Function did not change in either arm.")).toBe("found");
      expect(await found("Pain fell in the exercise group.¹² Function did not change in either arm.",
        "Function did not change in either arm.")).toBe("found");
      // A quotation inside a sentence is no sentence of its own.
      expect(await found("He said: “Pain fell by 12 points in the exercise group.” Then he left.",
        "Pain fell by 12 points in the exercise group")).toBe("not_found");
      // Only an exact, simple author-year form: anything else in the parentheses is the sentence's.
      expect(await found("Pain fell by 12 points in older adults (but not after 2020). Function did not change.",
        "Pain fell by 12 points in older adults")).toBe("not_found");
      expect(await found("Pain fell by 12 points in older adults (not 2020). Function did not change.",
        "Pain fell by 12 points in older adults")).toBe("not_found");
      // A unit in superscript matches its quote.
      expect(await found("Mean body mass index was 31 kg/m² in both groups.", "Mean body mass index was 31 kg/m² in both groups."))
        .toBe("found");
    });

    it("doesn't cut a number short, nor take a minus sign for a list's mark", async () => {
      expect(await found("The dose of 12.5 mg reduced pain in most adults.", "5 mg reduced pain in most adults")).toBe("not_found");
      expect(await found("Pain fell in the exercise group by 12.5 points.", "Pain fell in the exercise group by 12"))
        .toBe("not_found");
      expect(await found("Pain fell in the exercise group by 125 points overall.", "Pain fell in the exercise group by 12"))
        .toBe("not_found");
      expect(await found("The ratio of 1:2 doses reduced pain in most adults.", "2 doses reduced pain in most adults"))
        .toBe("not_found");
      // A bare number after a word may be a value, never a citation to pass over.
      expect(await found("Pain fell in the exercise group 12. Function did not change.", "Pain fell in the exercise group"))
        .toBe("not_found");
      expect(await found("−0.5 points was the mean change in pain over the year.", "0.5 points was the mean change in pain over the year."))
        .toBe("not_found");
      expect(await found("• Pain fell by 12 points in the exercise group", "Pain fell by 12 points in the exercise group"))
        .toBe("found");
      expect(await found("- Pain fell by 12 points in the exercise group", "Pain fell by 12 points in the exercise group"))
        .toBe("found");
    });

    it("takes a block's start as a sentence's, never a line break inside a block", async () => {
      expect(await found("Pain scores did not\ndecrease significantly after 12 weeks.", "decrease significantly after 12 weeks"))
        .toBe("not_found");
      expect(await found("Pain scores did not\ndecrease significantly after 12 weeks.", "decrease significantly after 12 weeks",
        { runsOn: true })).toBe("not_found");
      expect(await found("Primary outcome\nPain fell by 12 points in the exercise group\nSecondary outcomes",
        "Pain fell by 12 points in the exercise group")).toBe("not_found");
      // Its own block is a paragraph of its own.
      const paper: SourceLineDocument = { kind: "full_text", blocks: [
        { text: "Primary outcome" }, { text: "Pain fell by 12 points in the exercise group" }, { text: "Secondary outcomes" },
      ] };
      expect(await lookUp(line({ sentence: "Pain fell by 12 points in the exercise group" }), held(paper)))
        .toMatchObject({ sentence: "found" });
    });

    it("runs a PDF's heading into its first sentence, so that sentence alone isn't found", async () => {
      const page = { text: "Results\nPain fell by 12 points in the exercise group at six months.\nFunction did not change in " +
        "either arm of the trial.", section: "Page 4" };
      const paper: SourceLineDocument = { kind: "full_text", blocks: [page] };
      expect(await lookUp(line({ sentence: "Pain fell by 12 points in the exercise group at six months." }), held(paper)))
        .toMatchObject({ sentence: "not_found" });
      expect(await lookUp(line({ sentence: "Results Pain fell by 12 points in the exercise group at six months." }), held(paper)))
        .toMatchObject({ sentence: "found", sentence_section: "Page 4" });
      expect(await lookUp(line({ sentence: "Function did not change in either arm of the trial." }), held(paper)))
        .toMatchObject({ sentence: "found", sentence_section: "Page 4" });
    });

    it("says on which page a sentence that crosses pages starts", async () => {
      const paper: SourceLineDocument = { kind: "full_text", blocks: [
        { text: "We enrolled 64 adults with knee pain. Pain fell by 12 points in the", section: "Page 3" },
        { text: "exercise group at six months. Function did not change in either arm.", section: "Page 4", runsOn: true },
      ] };
      expect(await lookUp(line({ sentence: "Pain fell by 12 points in the exercise group at six months.",
        conclusion: "Function did not change in either arm." }), held(paper)))
        .toMatchObject({ sentence: "found", sentence_section: "Page 3", conclusion: "found", conclusion_section: "Page 4" });
    });

    it("runs a PDF's pages on, an HTML page's or a plain text's lines within a section, and a JATS paper's blocks never", () => {
      const runsOn = (format: string, kind: string, paths: string[][]) => sourceLineDocument({
        source: { provider: "direct_candidate", format },
        blocks: paths.map((path, place) => ({ text: `line ${place}`, section_path: path, kind })),
      } as never).blocks.map((block) => block.runsOn === true);
      expect(runsOn("pdf_text", "page_text", [["Page 1"], ["Page 2"], ["Page 3"]])).toEqual([false, true, true]);
      expect(runsOn("html_text", "paragraph", [[], [], ["Results"], ["Results"], ["Discussion"]]))
        .toEqual([false, true, false, true, false]);
      expect(runsOn("plain_text", "paragraph", [["Methods"], ["Methods"], ["Results"]])).toEqual([false, true, false]);
      expect(runsOn("jats_xml", "paragraph", [["Results"], ["Results"]])).toEqual([false, false]);
      expect(sourceLineDocument({ source: { provider: "unpaywall_open_location", format: "pdf_text" }, blocks: [
        { text: "a page", section_path: ["Page 1"], kind: "page_text" },
      ] } as never).blocks).toEqual([{ text: "a page", section: "Page 1" }]);
    });

    it("looks a structured abstract up section by section, as its labels are no part of a sentence", async () => {
      const abstract = abstractDocument(`RESULTS: ${SENTENCE}\nCONCLUSIONS: ${CONCLUSION}`,
        [{ label: "RESULTS", text: SENTENCE }, { label: "CONCLUSIONS", text: CONCLUSION }]);
      expect(abstract).toEqual({ kind: "abstract", blocks: [
        { text: SENTENCE, section: "RESULTS" }, { text: CONCLUSION, section: "CONCLUSIONS" },
      ] });
      expect(await lookUp(line(), held(abstract))).toMatchObject({ sentence: "found", sentence_section: "RESULTS",
        conclusion: "found", conclusion_section: "CONCLUSIONS" });
      // Without its sections, a label the section-name list knows still starts a sentence at its line's start; any other
      // label runs into its section's first sentence.
      expect(await lookUp(line(), held(abstractDocument(`RESULTS: ${SENTENCE}\nCONCLUSIONS: ${CONCLUSION}`))))
        .toMatchObject({ sentence: "found", conclusion: "found" });
      expect(await lookUp(line(), held(abstractDocument(`FINDINGS: ${SENTENCE}\nINTERPRETATION: ${CONCLUSION}`))))
        .toMatchObject({ sentence: "not_found", conclusion: "not_found" });
    });
  });

  it("says when a quote is too short to mean much", async () => {
    expect(await lookUp(line({ sentence: "Pain fell.", conclusion: "It helped." })))
      .toMatchObject({ sentence: "not_checked", conclusion: "not_checked", reason: "too_short" });
    expect(await lookUp(line({ sentence: "Pain fell." })))
      .toMatchObject({ sentence: "not_checked", conclusion: "found", reason: "too_short" });
  });

  // #412's run: 9 of 15 lines in one part gave one passage as both quotes, and the answers showed that both were found.
  it("looks one passage given as both quotes up once, and doesn't count it as both found", async () => {
    const same = await lookUp(line({ conclusion: SENTENCE }));
    expect(same).toMatchObject({ sentence: "found", conclusion: "not_checked", reason: "same_quote" });
    expect(sourceLineConfirmed({ ...same, label: "[1]", shown: true })).toBe(false);
    // Spacing, case and closing punctuation don't make it a second quote.
    expect(await lookUp(line({ conclusion: `  ${SENTENCE.toUpperCase()}.` })))
      .toMatchObject({ conclusion: "not_checked", reason: "same_quote" });
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
    const abstract = vi.fn<SourceLineTexts["abstract"]>()
      .mockResolvedValue(abstractDocument(`RESULTS: ${SENTENCE}`, [{ label: "RESULTS", text: SENTENCE }]));
    const texts: SourceLineTexts = { fullText: () => undefined, abstract };
    const result = await lookUp(line(), texts, request({ handles: [], pmids: ["12345"] }));
    expect(result).toMatchObject({ sentence: "found", sentence_section: "RESULTS", conclusion: "not_found", text: "abstract" });
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
    ["same_quote", /are the same text, so only one passage was looked up/u],
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

  it("says when one passage was given as both quotes", () => {
    expect(panel({ ...labelled, conclusion: "not_checked", conclusion_section: undefined, reason: "same_quote" }).join(" "))
      .toContain("the paper's sentence found (Results), given again as its conclusion, so only one passage was looked up, " +
        "in the paper's full text.");
  });

  it.each([
    ["no_text", "AskRigor has no text of this paper to look in."],
    ["text_unavailable", "AskRigor has no text of this paper to look in."],
    ["text_expired", "AskRigor no longer holds this paper's text."],
    ["too_short", "the quotes are too short to mean much."],
    ["not_a_key_source", "this isn't one of the answer's key sources."],
  ])("says why nothing was looked up: %s", (reason, wording) => {
    const { text: _text, sentence_section: _first, conclusion_section: _second, ...bare } = labelled;
    expect(panel({ ...bare, sentence: "not_checked", conclusion: "not_checked", reason }))
      .toContain(`[Smith 2021]: not looked up: ${wording}`);
  });

  it("names each quote when only one was looked up", () => {
    expect(panel({ ...labelled, conclusion: "not_checked", conclusion_section: undefined, reason: "text_expired", text: "abstract" }))
      .toContain("[Smith 2021]: the paper's sentence found (Results), its conclusion not looked up, in the paper's abstract.");
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

  it("keeps the check when looking a line up fails outright", async () => {
    const texts: SourceLineTexts = { fullText: () => { throw new Error("synthetic failure"); }, abstract: vi.fn() };
    const { body } = await call(texts, { ...fixture(), later_inputs: { source_lines: [line()] } });
    expect(body.status).toMatch(/^ready/u);
    expect(body.source_lines).toMatchObject([{ sentence: "not_checked", reason: "text_unavailable" }]);
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
