import { doiFromInput } from "@askrigor/sources";

import { abstractDocument, type SourceLineDocument } from "../source-lines.js";

/**
 * Atlas news (the 23 Nov 2026 news audit): a short news item the full-text tool admits no copy of (a JAMA news piece
 * under its 2,000-character floor, say) was never verified, so its card wasn't staged (`doi_not_verified`). Its PubMed
 * record is read instead, through the PubMed code the tools already use: PubMed's search for the DOI, then the record,
 * kept only when the record's own DOI is the card's, exactly. Its title and abstract are the text the card's lines that
 * quote that paper are looked up in, and the finalization receipt signs its PMID (`np`), so the day call and the shadow
 * readers know which text the quotes were found in. Nothing here judges meaning; nothing is stored.
 */

/** A PubMed record as the fallback reads it. */
export interface NewsPubmedRecord {
  pmid: string;
  doi?: string | undefined;
  title?: string | undefined;
  abstract?: string | undefined;
  /** A structured abstract's sections, as PubMed gives them. */
  sections?: ReadonlyArray<{ label?: string | undefined; text: string }> | undefined;
}

/** Where the fallback reads PubMed: the tools' own search and record fetch on the server, a stub in tests. */
export interface NewsPubmedSource {
  /** The PMIDs PubMed's search gives for a DOI, best first. */
  pmidsForDoi(doi: string): Promise<readonly string[]>;
  /** One record, or undefined when it can't be read. */
  record(pmid: string): Promise<NewsPubmedRecord | undefined>;
}

/** The fallback's whole time within the final check; past it the card's DOI stays unverified, as before. */
export const NEWS_PUBMED_FALLBACK_MILLISECONDS = 8_000;
/** At most this many of the search's records are read for one DOI. */
export const NEWS_PUBMED_FALLBACK_RECORDS = 3;

const PMID = /^[1-9][0-9]{0,9}$/u;
// A DOI read as acquisition and the final check read it (doiFromInput): a doi.org link decoded in full, a bare DOI's
// "%3C" and "%3E" read as "<" and ">", lower case (Codex's review of #517: an escaped SICI-form DOI never matched its
// record's own spelling).
const comparableDoi = (doi: string) => doiFromInput(doi.normalize("NFKC").trim().replace(/^doi:\s*/iu, ""));

/** PubMed's search for a DOI in its own DOI field, quoted whole, so the DOI's brackets aren't read as the query's. */
export const pubmedDoiQuery = (doi: string): string => `"${doi}"[doi]`;

/**
 * The PubMed record of a DOI, as the text its quotes are looked up in: its title (a block of its own, as no sentence
 * runs on from it) and its abstract, a structured one by its sections. Undefined when PubMed has no record whose own DOI
 * is this one, the record has no text, or the DOI couldn't be searched for whole.
 */
export async function newsPubmedFallback(doi: string, source: NewsPubmedSource):
  Promise<{ pmid: string; document: SourceLineDocument } | undefined> {
  const wanted = comparableDoi(doi);
  // A DOI with a quotation mark or white space can't be searched for whole: it is left unverified.
  if (wanted === "" || /["\s]/u.test(wanted)) return undefined;
  const pmids = [...new Set(await source.pmidsForDoi(wanted))].filter((pmid) => PMID.test(pmid))
    .slice(0, NEWS_PUBMED_FALLBACK_RECORDS);
  for (const pmid of pmids) {
    const record = await source.record(pmid);
    if (record === undefined || record.pmid !== pmid || record.doi === undefined || comparableDoi(record.doi) !== wanted) {
      continue;
    }
    const title = record.title?.trim() ?? "";
    const abstract = record.abstract?.trim() ?? "";
    const blocks = [
      ...(title === "" ? [] : [{ text: title, section: "Title" }]),
      ...(abstract === "" ? [] : abstractDocument(abstract, record.sections).blocks),
    ];
    if (blocks.length > 0) return { pmid, document: { kind: "abstract", blocks } };
  }
  return undefined;
}
