const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/iu;

export function normalizeDoiIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 5_000) return undefined;
  let doi = value.trim();
  if (/^doi:/iu.test(doi)) {
    doi = doi.slice(4).trim();
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
  }
  const canonical = doi.toLowerCase();
  return DOI_PATTERN.test(canonical) ? canonical : undefined;
}
