import { describe, expect, it } from "vitest";

import {
  abstractDocument,
  lookUpSourceLines,
  newsQuoteForms,
  type QuoteMatching,
  type SourceLineDocument,
  type SourceLineTexts,
} from "../apps/research-mcp/src/source-lines.js";

// Atlas news (the 23 Nov 2026 news audit, fix 2): the news card's word-for-word lookups failed on formatting alone: a
// quote that keeps a structured abstract's label ("FUNDING:"), a label or a heading in the text before the quoted
// sentence, a declaration after a web address read as an abbreviation. The news matching is exact and structural, in the
// quote and in the text, and nothing else changes: the standard matching of source lines and findings cards is as it
// was. Every paper, figure, funder and person here is invented.

const HANDLE = `aft1_${"e".repeat(32)}`;
const PMID = "99999902";

const texts = (document: SourceLineDocument): SourceLineTexts => ({
  fullText: (handle) => handle === HANDLE && document.kind !== "abstract" ? document : undefined,
  abstract: async (pmid) => pmid === PMID && document.kind === "abstract" ? document : undefined,
});

/** What each quote's lookup found in the document, by the matching given. */
async function outcomes(document: SourceLineDocument, quotes: readonly string[], matching: QuoteMatching = "news") {
  const lines = quotes.map((sentence) => ({ source: "10.1000/invented", sentence }));
  const requests = quotes.map((_, line) => ({ line, keySource: true,
    handles: document.kind === "abstract" ? [] : [HANDLE], pmids: document.kind === "abstract" ? [PMID] : [] }));
  return (await lookUpSourceLines(lines, requests, texts(document), undefined, matching)).map(({ sentence }) => sentence);
}

// A structured abstract as PubMed gives it: each section's text apart from its label.
const ABSTRACT = abstractDocument("", [
  { label: "BACKGROUND", text: "Whether an invented drug prevents a second stroke is unclear." },
  { label: "FINDINGS", text: "Across all trials, 4012 patients were assigned to the invented drug and 4007 to aspirin." },
  { label: "INTERPRETATION", text: "The invented drug did not reduce the risk of a second stroke when compared with " +
    "aspirin, and major bleeding did not differ between the two treatments." },
  { label: "FUNDING", text: "An invented university's neurology fund." },
]);

describe("the news card's quotes: a structured abstract's label at the quote's start", () => {
  it("finds a quote that keeps its section's label, in any case, by the news matching only", async () => {
    const quotes = [
      "INTERPRETATION: The invented drug did not reduce the risk of a second stroke when compared with aspirin, and " +
        "major bleeding did not differ between the two treatments.",
      "FUNDING: An invented university's neurology fund.",
      "Funding: An invented university's neurology fund.",
      "findings: Across all trials, 4012 patients were assigned to the invented drug and 4007 to aspirin.",
    ];
    expect(await outcomes(ABSTRACT, quotes)).toEqual(["found", "found", "found", "found"]);
    // As before for every other line: the label is no part of the abstract's sentence.
    expect(await outcomes(ABSTRACT, quotes, "standard")).toEqual(["not_found", "not_found", "not_found", "not_found"]);
  });

  it("strips a known label at the quote's start only, and keeps every other word", async () => {
    expect(newsQuoteForms("FUNDING: An invented fund.")).toEqual(["FUNDING: An invented fund.", "An invented fund."]);
    expect(newsQuoteForms("Funding/Support: This study was funded by an invented council."))
      .toEqual(["Funding/Support: This study was funded by an invented council.",
        "This study was funded by an invented council."]);
    // Not a known label, or not at the start: looked up as given only.
    expect(newsQuoteForms("Our sponsor: an invented fund paid for the trial.")).toEqual(["Our sponsor: an invented fund paid for the trial."]);
    expect(newsQuoteForms("The ratio was 3:1 in the invented trial.")).toEqual(["The ratio was 3:1 in the invented trial."]);
    expect(newsQuoteForms("The trial ended. Results: none.")).toEqual(["The trial ended. Results: none."]);
    // A label naming another section is not this sentence's (Codex's review of #517, round 4): the sentence is the
    // INTERPRETATION section's, so "FINDINGS:" before it is refused.
    expect(await outcomes(ABSTRACT, ["Our sponsor: An invented university's neurology fund.",
      "FINDINGS: The invented drug did not reduce the risk of a second stroke when compared with aspirin, and major " +
        "bleeding did not differ between the two treatments.",
      "INTERPRETATION: The invented drug did not reduce the risk of a second stroke when compared with aspirin, and " +
        "major bleeding did not differ between the two treatments."]))
      .toEqual(["not_found", "not_found", "found"]);
  });

  it("looks a quote up without its label only when what is left means much on its own", async () => {
    // Another section says the same few words: the label is what told them apart.
    const back: SourceLineDocument = { kind: "full_text", blocks: [
      { text: "Role of the Funder/Sponsor: None reported.", section: "Article Information" },
      { text: "The invented trial's nurses collected every sample by hand.", section: "Acknowledgments" },
    ] };
    expect(await outcomes(back, ["Conflict of Interest Disclosures: None reported.",
      "Acknowledgments: The invented trial's nurses collected every sample by hand."]))
      .toEqual(["not_found", "found"]);
  });

  it("still refuses a real wording difference, and a part of a sentence, with or without the label", async () => {
    expect(await outcomes(ABSTRACT, [
      "INTERPRETATION: The invented drug reduced the risk of a second stroke when compared with aspirin, and major " +
        "bleeding did not differ between the two treatments.",
      "FINDINGS: Across all trials, 4012 patients were assigned to the invented drug and 4070 to aspirin.",
      "INTERPRETATION: major bleeding did not differ between the two treatments.",
    ])).toEqual(["not_found", "not_found", "not_found"]);
  });
});

describe("the news card's quotes: white space and dashes, the same in the quote and in the text", () => {
  // A PDF's text, as its extraction spaces a range and a minus sign, a figure and a thin space.
  const PDF: SourceLineDocument = { kind: "full_text", blocks: [
    { text: "Treatment prevented seven serious events per 1,000 patients over 10 years (95% interval 2 \u2013 17), and " +
      "caused two serious falls (95% interval \u2212 3 to 9).", section: "Page 1" },
    { text: "Benefit\u2011risk balance favoured treatment at every age\u00a0group studied.", section: "Page 2",
      runsOn: true },
    { text: "Event rates were 0.64\u2009% with the longer interval and 0.71\u2009% with the shorter one\u2014a " +
      "difference of \u22120.07 points.", section: "Page 3", runsOn: true },
  ] };

  it("reads each dash, hyphen and minus sign as one, and sets aside the white space beside it, both ways", async () => {
    expect(await outcomes(PDF, [
      // En dash closed up, minus as a hyphen, closed up.
      "Treatment prevented seven serious events per 1,000 patients over 10 years (95% interval 2\u201317), and caused " +
        "two serious falls (95% interval -3 to 9).",
      // A non-breaking hyphen as a plain hyphen, a no-break space as a space.
      "Benefit-risk balance favoured treatment at every age group studied.",
      // A thin space as a space, an em dash spaced, a minus sign as a hyphen.
      "Event rates were 0.64 % with the longer interval and 0.71 % with the shorter one \u2014 a difference of -0.07 points.",
    ])).toEqual(["found", "found", "found"]);
    // The other way: the text closed up, the quote spaced.
    const closed: SourceLineDocument = { kind: "full_text", blocks: [{ text: "The fall in pain was 12 points " +
      "(range 4\u201320) at six\u2011months.", section: "Results" }] };
    expect(await outcomes(closed, ["The fall in pain was 12 points (range 4 \u2013 20) at six - months."]))
      .toEqual(["found"]);
  });

  it("still refuses another number or another word beside a dash", async () => {
    expect(await outcomes(PDF, [
      "Treatment prevented seven serious events per 1,000 patients over 10 years (95% interval 2\u201318), and caused " +
        "two serious falls (95% interval -3 to 9).",
      "Event rates were 0.64 % with the longer interval and 0.71 % with the shorter one \u2014 a difference of -0.70 points.",
      "Benefit-harm balance favoured treatment at every age group studied.",
    ])).toEqual(["not_found", "not_found", "not_found"]);
  });
});

describe("the news card's quotes: a label or a heading before the quoted sentence in the text", () => {
  // A journal page's back matter, as a search copy's paragraphs give it: each label runs into its sentence.
  const BACK_MATTER: SourceLineDocument = { kind: "full_text", blocks: [
    { text: "Supervision: Invented, Fictional.", section: "Article Information" },
    { text: "Conflict of Interest Disclosures: Dr Invented reported receiving royalties from an invented press " +
      "during the conduct of the study. No other disclosures were reported.", section: "Article Information", runsOn: true },
    { text: "Funding/Support: This study was funded by an invented grant awarded to an invented university.",
      section: "Article Information", runsOn: true },
  ] };
  // A PDF's page: headings alone on their lines, and a declaration after a web address.
  const PAGE: SourceLineDocument = { kind: "full_text", blocks: [{ section: "Page 11", text: [
    "The corresponding author attests that no others meeting the criteria have been",
    "omitted.",
    "Funding",
    "This research was funded by an invented trust via a fellowship held by AB (ref: 000000/Z/00/Z) and an",
    "invented school (project 000).",
    "Competing interests",
    "All authors have completed the uniform disclosure form at www.",
    "example.org/coi_disclosure.pdf. CD is a current member of an invented hyper-",
    "tension guideline committee. All other authors declare no relevant conflicts of interest.",
  ].join("\n") }] };

  it("reads labels and headings in the text as the standard matching does, and ends a sentence after an address", async () => {
    // Codex's reviews of #517: every wider guess at a label or a heading in the text let a part of a sentence be found as
    // a whole one, four rounds running, so the text's labels are read as the standard matching reads them. The quote
    // gives the label as the text prints it instead.
    const quotes = [
      "Dr Invented reported receiving royalties from an invented press during the conduct of the study.",
      "This study was funded by an invented grant awarded to an invented university.",
    ];
    expect(await outcomes(BACK_MATTER, quotes)).toEqual(await outcomes(BACK_MATTER, quotes, "standard"));
    expect(await outcomes(BACK_MATTER, ["Conflict of Interest Disclosures: Dr Invented reported receiving royalties " +
      "from an invented press during the conduct of the study."])).toEqual(["found"]);
    const pageQuotes = [
      "This research was funded by an invented trust via a fellowship held by AB (ref: 000000/Z/00/Z) and an\n" +
        "invented school (project 000).",
      "CD is a current member of an invented hyper-\ntension guideline committee.",
      "All other authors declare no relevant conflicts of interest.",
    ];
    // The declaration after "www." and a host name a line break split (N-1005 of 23 Nov) starts a sentence of its own; the
    // sentence after the heading "Funding" alone on its line does not.
    expect(await outcomes(PAGE, pageQuotes)).toEqual(["not_found", "found", "found"]);
    expect(await outcomes(PAGE, pageQuotes, "standard")).toEqual(["not_found", "not_found", "found"]);
  });

  it("ends no sentence at a label's word that a line break cut out of its sentence, or at an unknown label", async () => {
    const wrapped: SourceLineDocument = { kind: "full_text", blocks: [{ section: "Page 2", text: [
      "The trial investigators received no",
      "funding",
      "from any maker of the invented devices studied.",
      "Our sponsors: an invented charity paid for the follow-up visits.",
    ].join("\n") }] };
    expect(await outcomes(wrapped, ["from any maker of the invented devices studied.",
      "an invented charity paid for the follow-up visits.",
      "The trial investigators received no funding from any maker of the invented devices studied."]))
      .toEqual(["not_found", "not_found", "found"]);
  });
});

describe("the news card's quotes: no part of a sentence is found as a whole one", () => {
  // Codex's reviews of #517: a mark beside an abbreviation ("report:i.e.", "_i.e.", rounds 1 and 2), "www." with no host
  // name, or a section's name that is a sentence's first word cut onto a line of its own ("Intervention", round 3) is no
  // sign that a sentence ends, so what follows is not a sentence of its own, and a quote of it alone would drop the words
  // before it (here, a negation or the group it is about).
  const PROSE: SourceLineDocument = { kind: "full_text", blocks: [
    { section: "Discussion", text: "We did not confirm the earlier report:i.e. Vitamin D reduces fractures in older adults." },
    { section: "Discussion", text: "Some invented drugs-e.g. Aspirin reduce pain in invented trials." },
    { section: "Discussion", text: "Results held for men and/e.g. Women in the invented cohort." },
    { section: "Discussion", text: "We did not confirm the later report, _i.e. Zinc shortens colds in children._" },
    { section: "Discussion", text: "We saw no effect in the report www.i.e. Zinc lozenges helped nobody." },
    { section: "Methods", text: "Intervention\npatients had no strokes during twelve months of follow-up." },
    { section: "Results", text: "Background\nDNA damage did not predict mortality in the invented cohort." },
    { section: "Results", text: "Background:foreground ratios did not differ between the treatment groups." },
    { section: "Funding", text: "Disclosure forms are at https://www.example.org/coi_disclosure.pdf. The invented " +
      "council paid for the trial." },
  ] };

  it("finds no part of a sentence after an abbreviation that only a mark joins to the word before it", async () => {
    const parts = ["Vitamin D reduces fractures in older adults.", "Aspirin reduce pain in invented trials.",
      "Women in the invented cohort.", "Zinc shortens colds in children.", "Zinc lozenges helped nobody.",
      "Patients had no strokes during twelve months of follow-up.",
      "DNA damage did not predict mortality in the invented cohort.",
      "foreground ratios did not differ between the treatment groups."];
    const none = parts.map(() => "not_found");
    expect(await outcomes(PROSE, parts)).toEqual(none);
    expect(await outcomes(PROSE, parts, "standard")).toEqual(none);
    const wholes = ["We did not confirm the earlier report:i.e. Vitamin D reduces fractures in older adults.",
      "Some invented drugs-e.g. Aspirin reduce pain in invented trials."];
    expect(await outcomes(PROSE, wholes)).toEqual(["found", "found"]);
  });

  it("still ends a sentence after a web address or a file name, by the news matching only", async () => {
    expect(await outcomes(PROSE, ["The invented council paid for the trial."])).toEqual(["found"]);
    expect(await outcomes(PROSE, ["The invented council paid for the trial."], "standard")).toEqual(["not_found"]);
  });
});

describe("the news card's quotes: a quote's own label is looked for only in the section of that name", () => {
  // Codex's review of #517, round 4: a quote whose label names another section is not credited to this one.
  const ONLY_FUNDING = abstractDocument("", [{ label: "FUNDING", text: "No information was provided." }]);

  it("finds a labelled quote in its own section, and refuses it under another section's label", async () => {
    expect(await outcomes(ONLY_FUNDING, ["FUNDING: No information was provided.",
      "Conflict of Interest Disclosures: No information was provided."])).toEqual(["found", "not_found"]);
  });
});
