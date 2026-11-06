import { describe, expect, it } from "vitest";

import {
  KnownDois, communitySkipCaveat, finalizeResearch, paperNamedByLink, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { ANSWER_READING_LABELS } from "../apps/research-mcp/src/source-reading.js";
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// The review of #422: one matcher reads the paper a link names, as one whole identifier, for a key source's link (the
// first blocking check) and for the studies an answer links. Before it, a publisher's "/full" or ".pdf" was read as part
// of the DOI, a doi.org link kept its query or fragment, and a key source's DOI matched a longer DOI that begins with it.
// Every study and identifier here is a synthetic fixture shaped like a real publisher's address, not evidence.
const SECRET = "paper-link-matcher-test-secret-0123456789abcd";
const REASON = "Synthetic fixture isolates the link matcher.";
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: REASON };
const TRIAL = "10.1000/link-trial";
const AUDITED = ANSWER_READING_LABELS.full_text_audited;
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const audit = (claims: Parameters<typeof issueResearchReceipt>[1]) => sign("study_audit", { content: "a".repeat(16), ...claims });
const draft = (...paragraphs: string[]) => [...paragraphs, communitySkipCaveat(REASON)].join("\n\n");
const STUDY = `[Trial](https://doi.org/${TRIAL}) (${AUDITED}) compared two routines.`;
const input = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  receipts: [audit({ doi: TRIAL })], research_target: "Synthetic link matcher", research_depth: "deep",
  treatment_choice: "not_compared", community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  question_about: "other", not_relevant_reason: REASON, commercial_review_applicability: NOT_APPLICABLE,
  intervention_identity: NOT_APPLICABLE, full_text_search: { status: "not_needed", reason: REASON },
  lab_preparation: NOT_APPLICABLE,
  key_sources: [{ id: TRIAL, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [],
  answer_draft: draft(STUDY),
  later_inputs: { source_reading: [{ source: TRIAL, reading: "full_text_audited", quote: AUDITED }] },
  ...overrides
});
const check = (overrides: Record<string, unknown> = {}) =>
  assertNextStepsContract(finalizeResearch(input(overrides), { secret: SECRET }));
const linkSteps = (result: FinalizeResearchOutput) =>
  result.next_steps.filter((step) => step.includes("has no link") || step.includes("which no receipt passed here ties"));

describe("the studies an answer links: read as the receipts show, whatever the publisher's address adds", () => {
  it("reads a Frontiers /full link and a Springer PDF link of studies AskRigor read (R1)", () => {
    const frontiers = "10.3389/fphar.2020.01234";
    const springer = "10.1007/s00125-020-05123-4";
    const result = check({
      receipts: [audit({ doi: TRIAL }), sign("full_text_read", { doi: frontiers, pmcid: "PMC7000001", content: "b".repeat(16) }),
        sign("full_text_read", { doi: springer, content: "c".repeat(16) })],
      answer_draft: draft(STUDY, `[A second trial](https://www.frontiersin.org/articles/${frontiers}/full) agreed.`,
        `[Its PDF](https://link.springer.com/content/pdf/${springer}.pdf) too.`)
    });
    expect(result.linked_reading).toEqual([
      { source: frontiers, name: `"A second trial" (${frontiers})`, reading: "full_text_read" },
      { source: springer, name: `"Its PDF" (${springer})`, reading: "full_text_read" }
    ]);
    expect(advisoryNotes(result).join(" ")).not.toContain("did not look it up");
    // The research-wide sentence agrees.
    expect(result.reading_summary?.sentence).toBe("AskRigor read 1 study in full and checked its methods, and 2 more in full.");
  });

  it("reads a Wiley /full link of an audited study, and asks no one to say it wasn't looked up (R1b)", () => {
    const wiley = "10.1002/jcsm.12345";
    const result = check({
      receipts: [audit({ doi: TRIAL }), audit({ doi: wiley, content: "f".repeat(16) })],
      answer_draft: draft(STUDY, `[Wiley cohort](https://onlinelibrary.wiley.com/doi/${wiley}/full) agreed.`)
    });
    expect(result.linked_reading).toEqual([{ source: wiley, name: `"Wiley cohort" (${wiley})`, reading: "full_text_audited" }]);
    expect(advisoryNotes(result).join(" ")).not.toContain("did not look it up");
  });

  it.each([
    "https://doi.org/10.1000/other-read?utm_source=x",
    "https://doi.org/10.1000/other-read#methods",
    "https://dx.doi.org/10.1000/OTHER-READ",
    "https://www.doi.org/10.1000/other-read",
    "https://doi.org/10.1000%2Fother-read",
  ])("reads the doi.org link %s without its query or fragment", (link) => {
    const result = check({
      receipts: [audit({ doi: TRIAL }), sign("full_text_read", { doi: "10.1000/other-read", content: "b".repeat(16) })],
      answer_draft: draft(STUDY, `[Other](${link}) agreed.`)
    });
    expect(result.linked_reading).toEqual([{ source: "10.1000/other-read", name: "\"Other\" (10.1000/other-read)",
      reading: "full_text_read" }]);
  });

  it("lists a paper no receipt shows once, though the answer links it by doi.org and by a publisher's page", () => {
    const result = check({ answer_draft: draft(STUDY, "[A](https://doi.org/10.2000/unlooked-x) and " +
      "[A again](https://publisher.example.org/doi/10.2000/unlooked-x/full) agreed.") });
    expect(result.linked_reading).toEqual([{ source: "10.2000/unlooked-x", name: "\"A\" (10.2000/unlooked-x)",
      reading: "not_looked_up" }]);
  });

  it("names no paper for a page with no identifier in its address that no receipt signs (R9, a stated limit)", () => {
    const result = check({ answer_draft: draft(STUDY,
      "The [Tanzania cohort](https://academic.oup.com/jn/article/151/4/1000/6123456) and " +
      "[a JAMA trial](https://jamanetwork.com/journals/jama/fullarticle/2767217) agreed.") });
    expect(result.linked_reading).toBeUndefined();
  });
});

describe("a key source's link (the first blocking check): the whole identifier, never one that begins with it", () => {
  it("refuses a doi.org link to a longer DOI for a key source the Europe PMC record ties to the shorter one (R2)", () => {
    const pmid = "31415927";
    const keyDoi = "10.1001/jama.2020.2276";
    const epmc = sign("literature_search", { src: "europepmc", q: discoveryQueryDigest(["epmc synthetic"]), ret: 1,
      ids: [keyDoi, pmid], n: 1, rg: ["0.1"] });
    const base = (link: string) => ({
      receipts: [audit({ pmid }), epmc],
      key_sources: [{ id: pmid, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
      later_inputs: { source_reading: [{ source: pmid, reading: "full_text_audited", quote: AUDITED }] },
      answer_draft: draft(`[Trial](${link}) (${AUDITED}) compared two routines.`)
    });
    const wrong = check(base("https://doi.org/10.1001/jama.2020.22760"));
    expect(wrong.status).toBe("not_ready");
    expect(linkSteps(wrong)).toHaveLength(1);
    expect(check(base(`https://doi.org/${keyDoi}`)).next_steps).toEqual([]);
    expect(check(base(`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`)).next_steps).toEqual([]);
  });

  it("refuses BMJ's bmj.n712 for bmj.n71, and takes BMJ's own article page and PDF for it", () => {
    const bmj = "10.1136/bmj.n71";
    const base = (link: string) => ({
      receipts: [audit({ doi: bmj })],
      key_sources: [{ id: bmj, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
      later_inputs: { source_reading: [{ source: bmj, reading: "full_text_audited", quote: AUDITED }] },
      answer_draft: draft(`[Trial](${link}) (${AUDITED}) compared two routines.`)
    });
    expect(linkSteps(check(base("https://doi.org/10.1136/bmj.n712")))).toHaveLength(1);
    expect(linkSteps(check(base("https://www.bmj.com/content/372/bmj.n712")))).toHaveLength(1);
    for (const link of ["https://www.bmj.com/content/372/bmj.n71", "https://www.bmj.com/content/372/bmj.n71.full.pdf",
      `https://doi.org/${bmj}`]) {
      expect(check(base(link)).next_steps, link).toEqual([]);
    }
  });

  // Real publishers' address shapes, with synthetic DOIs: each links its key source.
  it.each([
    ["Frontiers /full", "10.3389/fphar.2020.01234", (doi: string) => `https://www.frontiersin.org/articles/${doi}/full`],
    ["Frontiers journal path", "10.3389/fphar.2020.01234",
      (doi: string) => `https://www.frontiersin.org/journals/pharmacology/articles/${doi}/full`],
    ["Wiley /doi/full/", "10.1002/jcsm.12345", (doi: string) => `https://onlinelibrary.wiley.com/doi/full/${doi}`],
    ["Wiley /doi/epdf/", "10.1002/jcsm.12345", (doi: string) => `https://onlinelibrary.wiley.com/doi/epdf/${doi}`],
    ["Wiley /doi/pdf/", "10.1002/jcsm.12345", (doi: string) => `https://onlinelibrary.wiley.com/doi/pdf/${doi}`],
    ["Springer /article/", "10.1007/s00125-020-05123-4", (doi: string) => `https://link.springer.com/article/${doi}`],
    ["Springer PDF", "10.1007/s00125-020-05123-4", (doi: string) => `https://link.springer.com/content/pdf/${doi}.pdf`],
    ["Taylor & Francis /doi/abs/ with journalCode", "10.1080/02640414.2020.1234567",
      (doi: string) => `https://www.tandfonline.com/doi/abs/${doi}?journalCode=rjsp20`],
    ["Sage /doi/pdf/", "10.1177/0956797620912345", (doi: string) => `https://journals.sagepub.com/doi/pdf/${doi}`],
    ["NEJM /doi/full/ in capitals", "10.1056/NEJMoa2404881", (doi: string) => `https://www.nejm.org/doi/full/${doi}`],
    ["PLOS ?id=", "10.1371/journal.pone.0123456",
      (doi: string) => `https://journals.plos.org/plosone/article?id=${doi}`],
    ["PLOS printable file", "10.1371/journal.pone.0123456",
      (doi: string) => `https://journals.plos.org/plosone/article/file?id=${doi}&type=printable`],
    ["Nature by its suffix", "10.1038/s41586-020-2012-7", () => "https://www.nature.com/articles/s41586-020-2012-7"],
    ["Cell by its suffix", "10.1016/S0092-8674(20)30229-4", () => "https://www.cell.com/cell/fulltext/S0092-8674(20)30229-4"],
    ["doi.org with a query and a fragment", "10.1000/link-shape", (doi: string) => `https://doi.org/${doi}?utm_source=x#methods`],
    ["a percent-encoded slash", "10.1000/link-shape", (doi: string) => `https://doi.org/${doi.replace("/", "%2F")}`],
    ["a publisher path in capitals", "10.1000/link-shape",
      (doi: string) => `https://publisher.example.org/DOI/${doi.toUpperCase()}/FULL`],
  ])("links %s", (_name, doi, address) => {
    const result = check({
      receipts: [audit({ doi })],
      key_sources: [{ id: doi, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
      later_inputs: { source_reading: [{ source: doi, reading: "full_text_audited", quote: AUDITED }] },
      answer_draft: draft(`[Trial](${address(doi)}) (${AUDITED}) compared two routines.`)
    });
    expect(result.next_steps).toEqual([]);
    expect(result.status).toMatch(/^ready/u);
  });

  it("takes a bare doi.org address ended by an ideographic full stop, and a Markdown link run into Japanese text", () => {
    expect(check({ answer_draft: draft(`Trial（${AUDITED}）は二つの方法を比べた：https://doi.org/${TRIAL}。`) }).next_steps)
      .toEqual([]);
    // An address run on into words with no space is the address a reader's link opens, which isn't the study's.
    expect(linkSteps(check({ answer_draft: draft(`Trial（${AUDITED}）https://doi.org/${TRIAL}を参照。`) })))
      .toHaveLength(1);
    expect(check({ answer_draft: draft(`[試験](https://doi.org/${TRIAL})（${AUDITED}）は二つの方法を比べた。`) }).next_steps)
      .toEqual([]);
  });

  it("ties a page two papers' receipts sign to neither", () => {
    const page = "https://journal.example.org/articles/shared-landing";
    const base = (receipts: string[]) => ({ receipts,
      answer_draft: draft(`[Trial](${page}) (${AUDITED}) compared two routines.`) });
    const own = [audit({ doi: TRIAL }), sign("doi_resolution", { doi: TRIAL, url: page })];
    expect(check(base(own)).next_steps).toEqual([]);
    const shared = check(base([...own, sign("doi_resolution", { doi: "10.1000/another-paper", url: page })]));
    expect(shared.status).toBe("not_ready");
    expect(linkSteps(shared)).toHaveLength(1);
  });
});

describe("the shared matcher, unit by unit", () => {
  const known = new KnownDois(["10.1001/jama.2020.2276", "10.1001/jama.2020.22760", "10.1136/bmj.n71",
    "10.1000/abc", "10.1000/abc/def", "10.2307/1234567", "10.9999/shared.n71", "10.8888/shared.n71"]);
  const named = (link: string) => paperNamedByLink(link, known, () => undefined);

  it("prefers the longest DOI found whole, and finds none inside a longer one", () => {
    expect(named("https://example.org/doi/10.1001/jama.2020.22760")).toBe("10.1001/jama.2020.22760");
    expect(named("https://example.org/doi/10.1001/jama.2020.2276/full")).toBe("10.1001/jama.2020.2276");
    expect(named("https://example.org/doi/10.1000/abc/def")).toBe("10.1000/abc/def");
    expect(named("https://example.org/doi/10.1000/abc-supplement")).toBeUndefined();
    expect(named("https://example.org/doi/10.1000/abc.docx")).toBeUndefined();
  });

  it("takes a suffix alone only with a letter and a digit, and never one two known DOIs share", () => {
    expect(named("https://www.bmj.com/content/372/bmj.n71.full.pdf")).toBe("10.1136/bmj.n71");
    expect(named("https://www.jstor.org/stable/1234567")).toBeUndefined();
    expect(named("https://example.org/articles/shared.n71")).toBeUndefined();
  });

  it("parses PubMed, PubMed Central and Europe PMC addresses, and no number on another site", () => {
    expect(named("https://pubmed.ncbi.nlm.nih.gov/38912654/")).toBe("38912654");
    expect(named("https://www.ncbi.nlm.nih.gov/pubmed/38912654")).toBe("38912654");
    expect(named("https://pmc.ncbi.nlm.nih.gov/articles/PMC11598664/")).toBe("PMC11598664");
    expect(named("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11598664/pdf/x.pdf")).toBe("PMC11598664");
    expect(named("https://europepmc.org/article/MED/38912654")).toBe("38912654");
    expect(named("https://europepmc.org/abstract/MED/38912654")).toBe("38912654");
    expect(named("https://europepmc.org/article/PMC/PMC11598664")).toBe("PMC11598664");
    expect(named("https://europepmc.org/articles/PMC11598664")).toBe("PMC11598664");
    expect(named("https://jamanetwork.com/journals/jama/fullarticle/38912654")).toBeUndefined();
  });

  it("reads a page receipts sign for one paper before an address's text", () => {
    expect(paperNamedByLink("https://journal.example.org/a", known, () => "10.1000/abc")).toBe("10.1000/abc");
  });
});
