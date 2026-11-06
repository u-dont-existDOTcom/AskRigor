/**
 * A DOI as AskRigor takes it: "10.", a registrant code, "/" and a suffix of the characters DOIs use, "<" and ">" among
 * them, which older SICI-form DOIs carry, such as 10.1002/(sici)1097-0258(19980515)17:9<1083::aid-sim794>3.0.co;2-2
 * (the owner regressions on #412's build, judged 6 Nov 2026: acquire_open_full_text refused one at its schema).
 */
export const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:<>a-z0-9]+$/iu;

// The characters a URL's path can't carry as they are, which a DOI's link at doi.org gives percent-encoded.
const DOI_URL_ESCAPES = /[%"#<>?[\\\]^`{|}\s]/gu;

/**
 * A DOI given with percent escapes, as a link carries one ("%3C" for "<"), read as its characters; a "%" that starts no
 * valid escape leaves the DOI as given.
 */
export function decodedDoi(value: string): string {
  if (!/%[0-9a-f]{2}/iu.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** A DOI's link at doi.org, with each character a URL's path can't carry percent-encoded, so "<" reaches it as %3C. */
export function doiUrl(doi: string): string {
  return `https://doi.org/${doi.replace(DOI_URL_ESCAPES, (character) => encodeURIComponent(character))}`;
}

export function normalizeDoiIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 5_000) return undefined;
  let doi = value.trim();
  if (/^doi:/iu.test(doi)) {
    doi = decodedDoi(doi.slice(4).trim());
  } else if (/^https?:\/\//iu.test(doi)) {
    let url: URL;
    try {
      url = new URL(doi);
    } catch {
      return undefined;
    }
    if (
      url.protocol !== "https:" ||
      !["doi.org", "www.doi.org", "dx.doi.org"].includes(url.hostname) ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return undefined;
    }
    try {
      doi = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return undefined;
    }
  } else {
    doi = decodedDoi(doi);
  }
  const canonical = doi.toLowerCase();
  return DOI_PATTERN.test(canonical) ? canonical : undefined;
}
