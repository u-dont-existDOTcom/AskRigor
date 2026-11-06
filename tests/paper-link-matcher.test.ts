import { describe, expect, it } from "vitest";

import {
  communitySkipCaveat, exactLinkPaper, finalizeResearch, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { ANSWER_READING_LABELS } from "../apps/research-mcp/src/source-reading.js";
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// The review of #422, third round: the first blocking check (rule 1, a key source's link) keeps exactly the acceptance
// it had before 6 November 2026 (d920b344), and the studies an answer links that aren't key sources, which are notes
// only, are tied to a paper by exact forms alone. Every study, identifier and address here is a synthetic fixture
// shaped like a real one, not evidence.
const SECRET = "paper-link-matcher-test-secret-0123456789abcd";
const REASON = "Synthetic fixture isolates the link matcher.";
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: REASON };
const AUDITED = ANSWER_READING_LABELS.full_text_audited;
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const audit = (claims: Parameters<typeof issueResearchReceipt>[1]) => sign("study_audit", { content: "a".repeat(16), ...claims });
const draft = (...paragraphs: string[]) => [...paragraphs, communitySkipCaveat(REASON)].join("\n\n");
const md = (link: string) => `[Trial](${link}) (${AUDITED}) compared two routines.`;
const input = (key: string, receipts: string[], ...paragraphs: string[]): Record<string, unknown> => ({
  receipts, research_target: "Synthetic link matcher", research_depth: "deep",
  treatment_choice: "not_compared", community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  question_about: "other", not_relevant_reason: REASON, commercial_review_applicability: NOT_APPLICABLE,
  intervention_identity: NOT_APPLICABLE, full_text_search: { status: "not_needed", reason: REASON },
  lab_preparation: NOT_APPLICABLE,
  key_sources: [{ id: key, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [],
  answer_draft: draft(...paragraphs),
  later_inputs: { source_reading: [{ source: key, reading: "full_text_audited", quote: AUDITED }] }
});
const check = (key: string, receipts: string[], ...paragraphs: string[]) =>
  assertNextStepsContract(finalizeResearch(input(key, receipts, ...paragraphs), { secret: SECRET }));
// Rule 1's own steps about a key source's link; the linked studies' notes are apart.
const ruleOneSteps = (result: FinalizeResearchOutput) =>
  result.next_steps.filter((step) => step.includes("has no link in the answer") || step.includes(" is linked by "));
const NOT_LOOKED_UP = "which no receipt passed here ties to a study AskRigor looked up";
const NOT_EXACT = "each holds a DOI, but AskRigor can't match it to a study exactly, so link each study by its doi.org " +
  "or PubMed address, as a Markdown link or followed by a space, for its reading to show.";

const MEDRXIV = "10.1101/2020.04.10.20060723";
const BIORXIV = "10.1101/2020.03.22.002386";
const LANCET = "10.1016/S0140-6736(20)30183-5";
const SICI = "10.1002/(SICI)1097-4636(199601)30:1<1::AID-JBM1>3.0.CO;2-S";
const SICI_ESC = "10.1002/(SICI)1097-4636(199601)30:1%3C1::AID-JBM1%3E3.0.CO;2-S";
const TRIAL = "10.1000/recheck-trial";
const PMID = "31415926";
const PMCID = "PMC7000001";
const tied = audit({ doi: TRIAL, pmid: PMID, pmcid: PMCID });

// The reviewer's recheck rows (the review of #422, third round), each with what rule 1 did with it at d920b344. Rule 1
// now does exactly the same with every row: it takes each link it took, and refuses each it refused.
const RECHECK: Array<{ name: string; key: string; receipts: string[]; line: string; d920: "takes" | "refuses" }> = [
  { name: "medRxiv v1", key: MEDRXIV, receipts: [audit({ doi: MEDRXIV })], line: md(`https://www.medrxiv.org/content/${MEDRXIV}v1`), d920: "takes" },
  { name: "medRxiv v2.full-text", key: MEDRXIV, receipts: [audit({ doi: MEDRXIV })], line: md(`https://www.medrxiv.org/content/${MEDRXIV}v2.full-text`), d920: "takes" },
  { name: "medRxiv v1.full.pdf", key: MEDRXIV, receipts: [audit({ doi: MEDRXIV })], line: md(`https://www.medrxiv.org/content/${MEDRXIV}v1.full.pdf`), d920: "takes" },
  { name: "medRxiv v1.full (bare, trailing period)", key: MEDRXIV, receipts: [audit({ doi: MEDRXIV })],
    line: `Trial (${AUDITED}) compared two routines: https://www.medrxiv.org/content/${MEDRXIV}v1.full.`, d920: "takes" },
  { name: "bioRxiv v3.full", key: BIORXIV, receipts: [audit({ doi: BIORXIV })], line: md(`https://www.biorxiv.org/content/${BIORXIV}v3.full`), d920: "takes" },
  { name: "bioRxiv v1.abstract", key: BIORXIV, receipts: [audit({ doi: BIORXIV })], line: md(`https://www.biorxiv.org/content/${BIORXIV}v1.abstract`), d920: "takes" },
  { name: "bioRxiv unversioned", key: BIORXIV, receipts: [audit({ doi: BIORXIV })], line: md(`https://www.biorxiv.org/content/${BIORXIV}`), d920: "takes" },
  { name: "medRxiv doi.org", key: MEDRXIV, receipts: [audit({ doi: MEDRXIV })], line: md(`https://doi.org/${MEDRXIV}`), d920: "takes" },
  { name: "Elsevier pii, no signed page", key: LANCET, receipts: [audit({ doi: LANCET })],
    line: md("https://www.sciencedirect.com/science/article/pii/S0140673620301835"), d920: "refuses" },
  { name: "Elsevier pii, signed by resolve_doi", key: LANCET,
    receipts: [audit({ doi: LANCET }), sign("doi_resolution", { doi: LANCET.toLowerCase(), url: "https://www.sciencedirect.com/science/article/pii/S0140673620301835" })],
    line: md("https://www.sciencedirect.com/science/article/pii/S0140673620301835"), d920: "takes" },
  { name: "Lancet PII page, no signed page", key: LANCET, receipts: [audit({ doi: LANCET })],
    line: md("https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(20)30183-5/fulltext"), d920: "refuses" },
  { name: "Lancet doi.org with parentheses", key: LANCET, receipts: [audit({ doi: LANCET })], line: md(`https://doi.org/${LANCET}`), d920: "takes" },
  { name: "Lancet bare doi.org in parentheses then period", key: LANCET, receipts: [audit({ doi: LANCET })],
    line: `Trial (${AUDITED}) compared two routines (https://doi.org/${LANCET}).`, d920: "takes" },
  { name: "OUP article page signed", key: "10.1093/jn/nxaa123",
    receipts: [audit({ doi: "10.1093/jn/nxaa123" }), sign("doi_resolution", { doi: "10.1093/jn/nxaa123", url: "https://academic.oup.com/jn/article/151/4/1000/6123456" })],
    line: md("https://academic.oup.com/jn/article/151/4/1000/6123456"), d920: "takes" },
  { name: "OUP advance article with DOI in path", key: "10.1093/ajcn/nqaa123", receipts: [audit({ doi: "10.1093/ajcn/nqaa123" })],
    line: md("https://academic.oup.com/ajcn/article/doi/10.1093/ajcn/nqaa123/5890000"), d920: "takes" },
  { name: "JAMA fullarticle signed", key: "10.1001/jama.2020.2276",
    receipts: [audit({ doi: "10.1001/jama.2020.2276" }), sign("doi_resolution", { doi: "10.1001/jama.2020.2276", url: "https://jamanetwork.com/journals/jama/fullarticle/2767217" })],
    line: md("https://jamanetwork.com/journals/jama/fullarticle/2767217"), d920: "takes" },
  { name: "Cochrane pub2/full", key: "10.1002/14651858.CD001106.pub2", receipts: [audit({ doi: "10.1002/14651858.CD001106.pub2" })],
    line: md("https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001106.pub2/full"), d920: "takes" },
  { name: "Cochrane pub2/epdf/full", key: "10.1002/14651858.CD001106.pub2", receipts: [audit({ doi: "10.1002/14651858.CD001106.pub2" })],
    line: md("https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001106.pub2/epdf/full"), d920: "takes" },
  { name: "SSRN abstract_id", key: "10.2139/ssrn.3561560", receipts: [audit({ doi: "10.2139/ssrn.3561560" })],
    line: md("https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3561560"), d920: "refuses" },
  { name: "Europe PMC /article/MED/", key: TRIAL, receipts: [tied], line: md(`https://europepmc.org/article/MED/${PMID}`), d920: "takes" },
  { name: "Europe PMC /abstract/MED/", key: TRIAL, receipts: [tied], line: md(`https://europepmc.org/abstract/MED/${PMID}`), d920: "takes" },
  { name: "NCBI PMC", key: TRIAL, receipts: [tied], line: md(`https://www.ncbi.nlm.nih.gov/pmc/articles/${PMCID}/`), d920: "takes" },
  { name: "pmc.ncbi PMC", key: TRIAL, receipts: [tied], line: md(`https://pmc.ncbi.nlm.nih.gov/articles/${PMCID}/`), d920: "takes" },
  { name: "PubMed", key: TRIAL, receipts: [tied], line: md(`https://pubmed.ncbi.nlm.nih.gov/${PMID}/`), d920: "takes" },
  { name: "NCBI PMC by pmid", key: TRIAL, receipts: [tied], line: md(`https://www.ncbi.nlm.nih.gov/pmc/articles/pmid/${PMID}/`), d920: "takes" },
  { name: "Europe PMC render, signed by a full reading", key: TRIAL,
    receipts: [tied, sign("full_text_read", { doi: TRIAL, pmid: PMID, pmcid: PMCID, content: "b".repeat(16),
      url: `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${PMCID}&blobtype=pdf` })],
    line: md(`https://europepmc.org/backend/ptpmcrender.fcgi?accid=${PMCID}&blobtype=pdf`), d920: "takes" },
  { name: "NCBI Bookshelf, signed by a full reading", key: PMID,
    receipts: [sign("pubmed_record", { pmid: PMID, abs: "1" }), sign("full_text_read", { pmid: PMID, content: "c".repeat(16),
      url: "https://www.ncbi.nlm.nih.gov/books/NBK558906/" }), audit({ pmid: PMID })],
    line: md("https://www.ncbi.nlm.nih.gov/books/NBK558906/"), d920: "takes" },
  { name: "Europe PMC preprint page, signed", key: MEDRXIV,
    receipts: [audit({ doi: MEDRXIV }), sign("full_text_read", { doi: MEDRXIV, content: "d".repeat(16), url: "https://europepmc.org/article/PPR/PPR123456" })],
    line: md("https://europepmc.org/article/PPR/PPR123456"), d920: "takes" },
  { name: "SICI doi.org escaped, key raw", key: SICI, receipts: [audit({ doi: SICI })], line: md(`https://doi.org/${SICI_ESC}`), d920: "takes" },
  { name: "SICI doi.org escaped, key escaped", key: SICI_ESC, receipts: [audit({ doi: SICI })], line: md(`https://doi.org/${SICI_ESC}`), d920: "takes" },
  { name: "SICI Wiley abs escaped", key: SICI, receipts: [audit({ doi: SICI })], line: md(`https://onlinelibrary.wiley.com/doi/abs/${SICI_ESC}`), d920: "takes" },
  { name: "SICI Wiley escaped then /full", key: SICI, receipts: [audit({ doi: SICI })], line: md(`https://onlinelibrary.wiley.com/doi/${SICI_ESC}/full`), d920: "takes" },
  { name: "link text with brackets", key: TRIAL, receipts: [tied], line: `[Smith [2020] trial](https://doi.org/${TRIAL}) (${AUDITED}) compared two routines; Trial.`, d920: "takes" },
  { name: "angle-bracket autolink", key: TRIAL, receipts: [tied], line: `Trial (${AUDITED}) compared two routines: <https://doi.org/${TRIAL}>`, d920: "takes" },
  { name: "bare link, trailing period", key: TRIAL, receipts: [tied], line: `Trial (${AUDITED}) compared two routines: https://doi.org/${TRIAL}.`, d920: "takes" },
  { name: "bare link, Japanese run-on", key: TRIAL, receipts: [tied], line: `Trial（${AUDITED}）https://doi.org/${TRIAL}を参照。`, d920: "takes" },
  { name: "bare link, Japanese with space", key: TRIAL, receipts: [tied], line: `Trial（${AUDITED}）https://doi.org/${TRIAL} を参照。`, d920: "takes" },
  { name: "markdown link run into Japanese", key: TRIAL, receipts: [tied], line: `[Trial](https://doi.org/${TRIAL})（${AUDITED}）を参照。`, d920: "takes" },
  { name: "image inside link", key: TRIAL, receipts: [tied], line: `[![Trial](https://img.example.org/t.png)](https://doi.org/${TRIAL}) Trial (${AUDITED}) compared two routines.`, d920: "refuses" },
  { name: "reference-style link", key: TRIAL, receipts: [tied], line: `[Trial][1] (${AUDITED}) compared two routines.\n\n[1]: https://doi.org/${TRIAL}`, d920: "refuses" },
  { name: "HTML anchor", key: TRIAL, receipts: [tied], line: `<a href="https://doi.org/${TRIAL}">Trial</a> (${AUDITED}) compared two routines.`, d920: "refuses" },
  { name: "link with title", key: TRIAL, receipts: [tied], line: `[Trial](https://doi.org/${TRIAL} "The trial") (${AUDITED}) compared two routines.`, d920: "takes" },
  { name: "link with angle destination", key: TRIAL, receipts: [tied], line: `[Trial](<https://doi.org/${TRIAL}>) (${AUDITED}) compared two routines.`, d920: "takes" },
  { name: "Nature by suffix", key: "10.1038/s41586-020-2012-7", receipts: [audit({ doi: "10.1038/s41586-020-2012-7" })],
    line: md("https://www.nature.com/articles/s41586-020-2012-7"), d920: "refuses" },
  { name: "Hindawi-style DOI then html", key: "10.1155/2020/1234567", receipts: [audit({ doi: "10.1155/2020/1234567" })],
    line: md("https://www.hindawi.com/journals/omcl/2020/1234567/"), d920: "refuses" },
  { name: "MDPI htm", key: "10.3390/nu12051234", receipts: [audit({ doi: "10.3390/nu12051234" })],
    line: md("https://www.mdpi.com/2072-6643/12/5/1234/htm"), d920: "refuses" },
  { name: "eLife article", key: "10.7554/eLife.12345", receipts: [audit({ doi: "10.7554/eLife.12345" })],
    line: md("https://elifesciences.org/articles/12345"), d920: "refuses" },
  { name: "doi.org then trailing slash", key: TRIAL, receipts: [tied], line: md(`https://doi.org/${TRIAL}/`), d920: "takes" },
  { name: "handle.net DOI", key: TRIAL, receipts: [tied], line: md(`https://hdl.handle.net/${TRIAL}`), d920: "takes" },
  { name: "doi with suffix hyphen-version (Research Square)", key: "10.21203/rs.3.rs-123456/v1", receipts: [audit({ doi: "10.21203/rs.3.rs-123456/v1" })],
    line: md("https://www.researchsquare.com/article/rs-123456/v1"), d920: "refuses" },
  { name: "Wiley DOI then supplementary file", key: "10.1002/jcsm.12345", receipts: [audit({ doi: "10.1002/jcsm.12345" })],
    line: md("https://onlinelibrary.wiley.com/doi/10.1002/jcsm.12345/suppinfo"), d920: "takes" },
  { name: "Springer DOI then .pdf", key: "10.1007/s00125-020-05123-4", receipts: [audit({ doi: "10.1007/s00125-020-05123-4" })],
    line: md("https://link.springer.com/content/pdf/10.1007/s00125-020-05123-4.pdf?pdf=button"), d920: "takes" },
  { name: "ACS DOI then ?ref", key: "10.1021/acs.jafc.0c01234", receipts: [audit({ doi: "10.1021/acs.jafc.0c01234" })],
    line: md("https://pubs.acs.org/doi/10.1021/acs.jafc.0c01234?ref=pdf"), d920: "takes" },
  { name: "AHA DOI uppercase", key: "10.1161/CIR.0000000000001063", receipts: [audit({ doi: "10.1161/CIR.0000000000001063" })],
    line: md("https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063"), d920: "takes" },
  { name: "Wiley DOI ending with digit then .x (old Wiley)", key: "10.1111/j.1365-2125.2009.03456.x", receipts: [audit({ doi: "10.1111/j.1365-2125.2009.03456.x" })],
    line: md("https://bpspubs.onlinelibrary.wiley.com/doi/10.1111/j.1365-2125.2009.03456.x"), d920: "takes" },
  { name: "bare link then em dash", key: TRIAL, receipts: [tied], line: `Trial (${AUDITED}) compared two routines (see https://doi.org/${TRIAL}—the larger one).`, d920: "takes" },
  { name: "bare link in curly quotes", key: TRIAL, receipts: [tied], line: `Trial (${AUDITED}) compared two routines: “https://doi.org/${TRIAL}”.`, d920: "takes" },
  { name: "bare link in guillemets", key: TRIAL, receipts: [tied], line: `Trial (${AUDITED}) a comparé deux routines «https://doi.org/${TRIAL}».`, d920: "takes" },
  { name: "bare link, Korean run-on", key: TRIAL, receipts: [tied], line: `Trial (${AUDITED}) https://doi.org/${TRIAL}를 참조.`, d920: "takes" },
  { name: "bare link, Chinese run-on", key: TRIAL, receipts: [tied], line: `Trial（${AUDITED}）见https://doi.org/${TRIAL}的研究。`, d920: "takes" },
  { name: "medRxiv v1.full.pdf+html", key: MEDRXIV, receipts: [audit({ doi: MEDRXIV })], line: md(`https://www.medrxiv.org/content/${MEDRXIV}v1.full.pdf+html`), d920: "takes" },
  { name: "doi.org with v1 appended", key: MEDRXIV, receipts: [audit({ doi: MEDRXIV })], line: md(`https://doi.org/${MEDRXIV}v1`), d920: "takes" },
  { name: "medRxiv signed v1.full.pdf (Unpaywall copy)", key: MEDRXIV,
    receipts: [audit({ doi: MEDRXIV }), sign("full_text_read", { doi: MEDRXIV, content: "e".repeat(16), url: `https://www.medrxiv.org/content/${MEDRXIV}v1.full.pdf` })],
    line: md(`https://www.medrxiv.org/content/${MEDRXIV}v1.full.pdf`), d920: "takes" },
  { name: "medRxiv signed v1.full.pdf, linked as v1", key: MEDRXIV,
    receipts: [audit({ doi: MEDRXIV }), sign("full_text_read", { doi: MEDRXIV, content: "e".repeat(16), url: `https://www.medrxiv.org/content/${MEDRXIV}v1.full.pdf` })],
    line: md(`https://www.medrxiv.org/content/${MEDRXIV}v1`), d920: "takes" },
  { name: "BMJ full.pdf+html by suffix", key: "10.1136/bmj.m1328", receipts: [audit({ doi: "10.1136/bmj.m1328" })],
    line: md("https://www.bmj.com/content/369/bmj.m1328.full.pdf+html"), d920: "refuses" },
  { name: "Lancet showPdf?pii=", key: LANCET, receipts: [audit({ doi: LANCET })],
    line: md("https://www.thelancet.com/action/showPdf?pii=S0140-6736(20)30183-5"), d920: "refuses" },
  { name: "wrong paper: same suffix, other prefix", key: "10.1000/abc12345", receipts: [audit({ doi: "10.1000/abc12345" })],
    line: md("https://publisher.example.org/doi/10.9999/abc12345"), d920: "refuses" },
  { name: "wrong page: product code equal to a DOI's suffix", key: "10.7326/M20-1234", receipts: [audit({ doi: "10.7326/M20-1234" })],
    line: md("https://shop.example.org/products/M20-1234"), d920: "refuses" },
  { name: "wrong page: BMJ rapid response by suffix", key: "10.1136/bmj.m1328", receipts: [audit({ doi: "10.1136/bmj.m1328" })],
    line: md("https://www.bmj.com/content/369/bmj.m1328/rr-12"), d920: "refuses" },
  { name: "SICI raw in markdown destination", key: SICI, receipts: [audit({ doi: SICI })], line: md(`https://doi.org/${SICI}`), d920: "refuses" },
  { name: "SICI raw bare", key: SICI, receipts: [audit({ doi: SICI })], line: `Trial (${AUDITED}) compared two routines: https://doi.org/${SICI}`, d920: "refuses" },
  { name: "PubMed similar-articles page", key: TRIAL, receipts: [tied], line: md(`https://pubmed.ncbi.nlm.nih.gov/${PMID}/similar/`), d920: "takes" },
  { name: "EBI REST full text (PMCID segment off the Europe PMC host)", key: TRIAL, receipts: [tied],
    line: md(`https://www.ebi.ac.uk/europepmc/webservices/rest/${PMCID}/fullTextXML`), d920: "takes" },
];

describe("rule 1, a key source's link: exactly as at d920b344", () => {
  it.each(RECHECK.map((row) => [row.name, row] as const))("%s: as at d920b344", (_name, row) => {
    const steps = ruleOneSteps(check(row.key, row.receipts, row.line));
    if (row.d920 === "takes") expect(steps).toEqual([]);
    else expect(steps).not.toEqual([]);
  });

  // The one change allowed: a doi.org or dx.doi.org link is read without its query and fragment. Rule 1 reads a link's
  // path, which never held them, so these were already taken; they stay taken.
  it.each([
    `https://doi.org/${TRIAL}?utm_source=newsletter`,
    `https://doi.org/${TRIAL}#methods`,
    `https://dx.doi.org/${TRIAL}?via=ihub#results`,
  ])("takes %s", (link) => {
    expect(ruleOneSteps(check(TRIAL, [tied], md(link)))).toEqual([]);
  });

  it("isn't widened by a Europe PMC search's record groups: they tie only the linked studies", () => {
    const pmid = "27182818";
    const pmcid = "PMC7000002";
    const keyDoi = "10.1000/grouped-trial";
    // The search lists the paper with its DOI, PMID and PMCID together; the key source is read by its PMID alone.
    const search = sign("literature_search", { src: "europepmc", q: discoveryQueryDigest(["grouped synthetic"]), ret: 1,
      ids: [keyDoi, pmid, pmcid], n: 1, rg: ["0.1.2"] });
    const result = check(pmid, [audit({ pmid }), search], md(`https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`));
    // At d920b344 no receipt tied that PMC page to the PMID, so rule 1 asked for a link it ties: it still does.
    expect(ruleOneSteps(result)).not.toEqual([]);
    expect(result.status).toBe("not_ready");
    // The linked studies know it is the key source's own paper, so they name nothing.
    expect(result.linked_reading).toBeUndefined();
    expect(advisoryNotes(result).join(" ")).not.toContain(NOT_LOOKED_UP);
  });

  // A known limit of rule 1, kept: a DOI is found in a link's path as text, so a link to a longer DOI that begins with
  // the key source's passes. The linked studies, which read a doi.org link exactly, name the paper it links.
  it("passes bmj.n712 for bmj.n71 (a known limit), and the linked studies say bmj.n712 wasn't looked up", () => {
    const bmj = "10.1136/bmj.n71";
    const result = check(bmj, [audit({ doi: bmj })], md("https://doi.org/10.1136/bmj.n712"));
    expect(ruleOneSteps(result)).toEqual([]);
    expect(result.status).toMatch(/^ready/u);
    expect(result.linked_reading).toEqual([{ source: "10.1136/bmj.n712", name: "\"Trial\" (10.1136/bmj.n712)",
      reading: "not_looked_up" }]);
    expect(advisoryNotes(result)).toContainEqual(expect.stringContaining(`"Trial" (10.1136/bmj.n712), ${NOT_LOOKED_UP}`));
  });
});

describe("the studies an answer links: tied to a paper by exact forms alone", () => {
  const KEY = `[Trial](https://doi.org/${TRIAL}) (${AUDITED}) compared two routines.`;
  const other = (receipts: string[], ...paragraphs: string[]) => check(TRIAL, [tied, ...receipts], KEY, ...paragraphs);

  it("reads a doi.org link, decoded, without its query or fragment, in any of doi.org's names", () => {
    for (const link of ["https://doi.org/10.1000/other-read?utm_source=x", "https://doi.org/10.1000/other-read#methods",
      "https://dx.doi.org/10.1000/OTHER-READ", "https://www.doi.org/10.1000/other-read", "https://doi.org/10.1000%2Fother-read",
      "https://doi.org/10.1000/other-read/"]) {
      const result = other([sign("full_text_read", { doi: "10.1000/other-read", content: "b".repeat(16) })],
        `[Other](${link}) agreed.`);
      expect(result.linked_reading, link).toEqual([{ source: "10.1000/other-read", name: "\"Other\" (10.1000/other-read)",
        reading: "full_text_read" }]);
      expect(advisoryNotes(result).join(" "), link).not.toContain("DOI, but AskRigor can't match");
    }
  });

  it("reads PubMed, PubMed Central and Europe PMC pages in their own forms, each paper once", () => {
    const pmid = "16180339";
    const pmcid = "PMC7000003";
    const doi = "10.1000/pubmed-read";
    const result = other([sign("pubmed_record", { pmid, doi, pmcid, abs: "1" })],
      `[Its record](https://pubmed.ncbi.nlm.nih.gov/${pmid}/) and [its copy](https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/) ` +
      `and [again](https://europepmc.org/abstract/MED/${pmid}) agreed.`);
    expect(result.linked_reading).toEqual([{ source: pmid, name: `"Its record" (${pmid})`, reading: "abstract_only" }]);
  });

  it("ties a PubMed Central copy to the DOI it was read by through a Europe PMC search's record groups", () => {
    const pmcid = "PMC7000004";
    const doi = "10.1000/grouped-read";
    const search = sign("literature_search", { src: "europepmc", q: discoveryQueryDigest(["grouped read"]), ret: 1,
      ids: [doi, pmcid], n: 1, rg: ["0.1"] });
    const result = other([search, sign("full_text_read", { doi, content: "b".repeat(16) })],
      `[A cohort](https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/) and [the same](https://doi.org/${doi}) agreed.`);
    expect(result.linked_reading).toEqual([{ source: pmcid, name: `"A cohort" (${pmcid})`, reading: "full_text_read" }]);
  });

  it("names a page receipts of one paper sign, on any host, before any address form", () => {
    const doi = "10.1000/signed-read";
    const pages = ["https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC7000005&blobtype=pdf",
      "https://www.ncbi.nlm.nih.gov/books/NBK000001/", "https://europepmc.org/article/PPR/PPR000001"];
    for (const page of pages) {
      const result = other([sign("full_text_read", { doi, content: "b".repeat(16), url: page })], `[A study](${page}) agreed.`);
      expect(result.linked_reading, page).toEqual([{ source: doi, name: `"A study" (${doi})`, reading: "full_text_read" }]);
    }
  });

  it("says 'not looked up by AskRigor' only for an exact form no receipt names, with one note", () => {
    const result = other([], "[A](https://doi.org/10.2000/unlooked-x) and [B](https://pubmed.ncbi.nlm.nih.gov/27182819/) agreed.");
    expect(result.linked_reading).toEqual([
      { source: "10.2000/unlooked-x", name: "\"A\" (10.2000/unlooked-x)", reading: "not_looked_up" },
      { source: "27182819", name: "\"B\" (27182819)", reading: "not_looked_up" },
    ]);
    expect(advisoryNotes(result).filter((note) => note.includes(NOT_LOOKED_UP))).toEqual([
      `The answer links "A" (10.2000/unlooked-x); "B" (27182819), ${NOT_LOOKED_UP}: say beside each that AskRigor did ` +
        "not look it up, or look it up (resolve_doi for a DOI, fetch_pubmed_record for a PMID) and pass its research_receipt.",
    ]);
  });

  // The reviewer's preprint (the review of #422, third round): read in full, linked by its medRxiv page, it was called
  // "not looked up by AskRigor". A DOI in any other address can be followed by a version, a view or a longer DOI.
  it("gives a DOI in a publisher's or a preprint server's address one note, never a reading", () => {
    const frontiers = "10.3389/fphar.2020.01234";
    const result = other([sign("full_text_read", { doi: MEDRXIV, content: "b".repeat(16) }),
      sign("full_text_read", { doi: frontiers, content: "c".repeat(16) })],
      `[A preprint](https://www.medrxiv.org/content/${MEDRXIV}v1.full) agreed.`,
      `[A second trial](https://www.frontiersin.org/articles/${frontiers}/full) too.`);
    expect(result.linked_reading).toBeUndefined();
    expect(advisoryNotes(result).join(" ")).not.toContain(NOT_LOOKED_UP);
    expect(advisoryNotes(result)).toContain(`The answer links "A preprint" (https://www.medrxiv.org/content/${MEDRXIV}v1.full); ` +
      `"A second trial" (https://www.frontiersin.org/articles/${frontiers}/full): ${NOT_EXACT}`);
    // The research-wide sentence counts them as the receipts show, whatever their links.
    expect(result.reading_summary?.sentence).toBe("AskRigor read 1 study in full and checked its methods, and 2 more in full.");
  });

  it("reads a bare address only up to a clear end: white space, a sentence's punctuation, or an autolink's >", () => {
    const doi = "10.1000/bare-read";
    const read = [sign("full_text_read", { doi, content: "b".repeat(16) })];
    for (const line of [`見よ https://doi.org/${doi}。`, `See “https://doi.org/${doi}”.`, `See <https://doi.org/${doi}>.`,
      `Voir «https://doi.org/${doi}».`]) {
      expect(other(read, line).linked_reading, line).toEqual([{ source: doi, name: doi, reading: "full_text_read" }]);
    }
    // Run on into words with no space, the address a reader's link opens is unclear: one note, no reading.
    for (const line of [`見よhttps://doi.org/${doi}を参照。`, `See https://doi.org/${doi}—the larger one.`]) {
      const result = other(read, line);
      expect(result.linked_reading, line).toBeUndefined();
      expect(advisoryNotes(result).join(" "), line).toContain(NOT_EXACT);
    }
  });

  it("reads a Markdown link's destination whole, a DOI's < and > included", () => {
    const result = other([sign("full_text_read", { doi: SICI, content: "b".repeat(16) })], `[An old trial](https://doi.org/${SICI}) agreed.`);
    expect(result.linked_reading).toEqual([{ source: SICI.toLowerCase(), name: `"An old trial" (${SICI.toLowerCase()})`,
      reading: "full_text_read" }]);
  });

  it("names nothing for a page with no DOI in its address that no receipt signs, nor for a page two papers sign", () => {
    const shared = "https://journal.example.org/articles/shared-landing";
    const result = other([sign("doi_resolution", { doi: "10.1000/first-paper", url: shared }),
      sign("doi_resolution", { doi: "10.1000/second-paper", url: shared })],
      "The [Tanzania cohort](https://academic.oup.com/jn/article/151/4/1000/6123456), " +
      "[a JAMA trial](https://jamanetwork.com/journals/jama/fullarticle/2767217) and " +
      `[a shared page](${shared}) agreed.`);
    expect(result.linked_reading).toBeUndefined();
    expect(advisoryNotes(result).join(" ")).not.toContain("The answer links");
  });
});

describe("exactLinkPaper", () => {
  const none = () => undefined;

  it("reads doi.org and dx.doi.org links, decoded, without a query, a fragment or a closing slash", () => {
    expect(exactLinkPaper("https://doi.org/10.1000/ABC?x=1#y", none)).toBe("10.1000/abc");
    expect(exactLinkPaper("http://dx.doi.org/10.1000%2Fabc/", none)).toBe("10.1000/abc");
    expect(exactLinkPaper(`https://doi.org/${SICI_ESC}`, none)).toBe(SICI.toLowerCase());
    expect(exactLinkPaper("https://doi.org/not-a-doi", none)).toBeUndefined();
  });

  it("reads PubMed, PubMed Central and Europe PMC pages in their own forms only", () => {
    expect(exactLinkPaper("https://pubmed.ncbi.nlm.nih.gov/38912654/", none)).toBe("38912654");
    expect(exactLinkPaper("https://www.ncbi.nlm.nih.gov/pubmed/38912654", none)).toBe("38912654");
    expect(exactLinkPaper("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11598664/", none)).toBe("PMC11598664");
    expect(exactLinkPaper("https://www.ncbi.nlm.nih.gov/pmc/articles/pmid/38912654/", none)).toBe("38912654");
    expect(exactLinkPaper("https://pmc.ncbi.nlm.nih.gov/articles/pmc11598664", none)).toBe("PMC11598664");
    expect(exactLinkPaper("https://europepmc.org/article/MED/38912654", none)).toBe("38912654");
    expect(exactLinkPaper("https://europepmc.org/abstract/MED/38912654?x=1", none)).toBe("38912654");
    expect(exactLinkPaper("https://europepmc.org/article/PMC/PMC11598664", none)).toBe("PMC11598664");
    expect(exactLinkPaper("https://europepmc.org/articles/PMC11598664", none)).toBe("PMC11598664");
    // Anything after the identifier, another source's record or another host is not a form that names one paper.
    for (const link of ["https://pubmed.ncbi.nlm.nih.gov/38912654/similar/", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11598664/pdf/x.pdf",
      "https://europepmc.org/article/PPR/PPR000001", "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11598664/fullTextXML",
      "https://www.frontiersin.org/articles/10.3389/fphar.2020.01234/full", "https://jamanetwork.com/journals/jama/fullarticle/38912654",
      "https://hdl.handle.net/10.1000/abc", "ftp://doi.org/10.1000/abc", "not a link"]) {
      expect(exactLinkPaper(link, none), link).toBeUndefined();
    }
  });

  it("asks for a page receipts sign first, on any host", () => {
    expect(exactLinkPaper("https://journal.example.org/a", () => "10.1000/abc")).toBe("10.1000/abc");
    expect(exactLinkPaper("https://doi.org/10.1000/other", () => "10.1000/abc")).toBe("10.1000/abc");
  });
});
