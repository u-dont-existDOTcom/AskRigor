import { createHash } from "node:crypto";

import {
  errorEnvelope,
  okEnvelope,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  auditableDocumentIndexSchema,
  type AuditableDocumentBlock,
  type AuditableDocumentIndex
} from "./auditable-document-index.js";
import {
  fetchDiscoveredDocument,
  type DiscoveredDocumentFetchRuntime,
  type FetchedDiscoveredDocument
} from "./http.js";
import {
  resolveUnpaywallOpenAccess,
  type UnpaywallConfig,
  type UnpaywallOpenAccessData,
  type UnpaywallOpenLocation
} from "./unpaywall.js";

import { admitFullText, verifyArticleIdentity, type AcquisitionState, type FrozenArticleIdentity, type FullTextAdmission } from "./full-text-admission.js";

const MAX_PDF_PAGES = 1_000;
const MAX_EXTRACTED_CHARACTERS = 20_000_000;
const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/iu;

export interface AcquireUnpaywallFullTextRuntime {
  resolve?: typeof resolveUnpaywallOpenAccess;
  fetchDocument?: (
    url: string,
    runtime?: DiscoveredDocumentFetchRuntime
  ) => Promise<FetchedDiscoveredDocument>;
  documentFetchRuntime?: DiscoveredDocumentFetchRuntime;
  extractPdf?: typeof extractAuditablePdf;
  identity?: FrozenArticleIdentity;
}

export interface UnpaywallFullTextData {
  requested_doi: string;
  outcome: "full_text_indexed" | "possibly_useful_lead";
  discovery_status: string;
  attempted_locations: Array<{
    url: string;
    version?: string;
    result: "indexed" | "fetch_failed" | "not_pdf" | "identity_not_verified" | "extraction_failed" | "partial_text" | "abstract_only";
  }>;
  document_index?: AuditableDocumentIndex;
  access_boundary?: string;
  acquisition_state?: AcquisitionState;
  identity?: FrozenArticleIdentity;
}

/**
 * Resolves and acquires a DOI's open PDF through Unpaywall. A document becomes
 * auditable only after bounded retrieval, PDF extraction, and DOI/title
 * identity verification. Discovery metadata alone never becomes evidence.
 */
export async function acquireUnpaywallFullText(
  rawDoi: string,
  config: UnpaywallConfig,
  runtime: AcquireUnpaywallFullTextRuntime = {}
): Promise<ProvenanceEnvelope<UnpaywallFullTextData>> {
  const doi = normalizeDoi(rawDoi);
  if (!DOI_PATTERN.test(doi)) throw new Error("Invalid full-text DOI");
  const resolver = runtime.resolve ?? resolveUnpaywallOpenAccess;
  const fetcher = runtime.fetchDocument ?? fetchDiscoveredDocument;
  const extractor = runtime.extractPdf ?? extractAuditablePdf;
  let resolution: Awaited<ReturnType<typeof resolver>>;
  try { resolution = await resolver(doi, config); } catch {
    return unavailable(doi, "error", [], "Unpaywall metadata retrieval failed.", "PROVIDER_UNAVAILABLE");
  }
  if (
    resolution.access_status !== "metadata_only" ||
    !("full_text_lead_status" in resolution.data)
  ) {
    return unavailable(
      doi,
      resolution.access_status,
      [],
      "Open-access resolution did not produce an auditable document location.",
      resolution.access_status === "not_found" ? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" : "PROVIDER_UNAVAILABLE"
    );
  }

  const discovery = resolution.data as UnpaywallOpenAccessData;
  const identity: FrozenArticleIdentity = Object.freeze({
    doi, title: discovery.title, first_author: discovery.first_author, year: discovery.year,
    journal: discovery.journal, pii: discovery.pii, publisher_host: discovery.publisher_host,
    ...runtime.identity
  });
  const locations = pdfCandidates(discovery);
  if (locations.length === 0) {
    return unavailable(
      doi,
      resolution.access_status,
      [],
      "Unpaywall found no direct HTTPS PDF candidate. The citation remains a possibly useful lead requiring further investigation.",
      discovery.full_text_lead_status === "no_open_location_found" ? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" : "ABSTRACT_ONLY", identity
    );
  }

  const attempts: UnpaywallFullTextData["attempted_locations"] = [];
  let observedState: AcquisitionState = "IDENTITY_MISMATCH";
  for (const location of locations.slice(0, 5)) {
    const url = location.pdf_url ?? location.candidate_full_text_url!;
    let fetched: FetchedDiscoveredDocument;
    try {
      fetched = await fetcher(url, runtime.documentFetchRuntime);
    } catch {
      attempts.push(attempt(location, url, "fetch_failed"));
      continue;
    }
    if (!looksLikePdf(fetched) || !hasPdfMagic(fetched.bytes)) {
      attempts.push(attempt(location, url, "not_pdf"));
      continue;
    }
    try {
      let inspection: FullTextAdmission | undefined;
      const index = await extractor({
        doi,
        title: identity.title,
        identity,
        onInspection: (admission) => { inspection = admission; },
        version: location.version,
        canonicalUrl: fetched.finalUrl,
        bytes: fetched.bytes
      });
      if (index === undefined) {
        if (inspection !== undefined) observedState = inspection.state;
        attempts.push(attempt(location, url, inspection?.state === "PARTIAL_TEXT_READABLE" ? "partial_text" : inspection?.state === "ABSTRACT_ONLY" ? "abstract_only" : "identity_not_verified"));
        continue;
      }
      const admission = admitFullText(index.blocks);
      if (admission.state !== "FULL_TEXT_READABLE") {
        observedState = admission.state;
        attempts.push(attempt(location, url, admission.state === "ABSTRACT_ONLY" ? "abstract_only" : "partial_text"));
        continue;
      }
      attempts.push(attempt(location, url, "indexed"));
      return okEnvelope({
        provider: "unpaywall",
        recordType: "open_full_text_acquisition",
        primaryIdentifier: doi,
        sourceIdentity: {
          canonical_url: fetched.finalUrl,
          ...(discovery.title === undefined ? {} : { title: discovery.title })
        },
        pagination: { exhausted: true },
        returned: 1,
        accessStatus: "complete",
        limitations: [
          "The open PDF was identity-checked and indexed for method audit; retrieval does not establish validity, reproducibility, or applicability.",
          "PDF text extraction can lose visual layout, equations, image-only supplements, and some table structure; audit those elements separately when decision-important.",
          "The acquired manuscript version is preserved and must not be silently treated as a different version."
        ],
        rawMetadata: {
          oa_status: discovery.oa_status,
          version: location.version ?? "not reported",
          content_sha256: index.source.content_sha256,
          content_bytes: fetched.contentLength,
          page_count: index.section_paths.length,
          block_count: index.blocks.length
        },
        data: {
          requested_doi: doi,
          outcome: "full_text_indexed",
          discovery_status: resolution.access_status,
          attempted_locations: attempts,
          document_index: index,
          acquisition_state: "FULL_TEXT_READABLE",
          identity
        }
      });
    } catch {
      attempts.push(attempt(location, url, "extraction_failed"));
    }
  }

  return unavailable(
    doi,
    resolution.access_status,
    attempts,
    "Open copies were discovered, but none passed bounded retrieval, PDF extraction, identity and full-text admission. Their unseen contents were not treated as evidence.",
    attempts.some(({ result }) => result === "fetch_failed" || result === "extraction_failed" || result === "not_pdf") ? "PROVIDER_UNAVAILABLE" : observedState, identity
  );
}

interface ExtractPdfInput {
  doi: string;
  title?: string;
  version?: string;
  canonicalUrl: string;
  bytes: Uint8Array;
  identity?: FrozenArticleIdentity;
  onInspection?: (admission: FullTextAdmission) => void;
  onIdentity?: (verification: "doi_exact" | "title_match") => void;
}

export async function extractAuditablePdf(
  input: ExtractPdfInput
): Promise<AuditableDocumentIndex | undefined> {
  if (!hasPdfMagic(input.bytes)) return undefined;
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const loadingTask = getDocument({
    data: input.bytes.slice(),
    stopAtErrors: true,
    useSystemFonts: false,
    useWasm: false
  });
  const document = await loadingTask.promise;
  try {
    if (document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
      throw new Error("Open PDF page count exceeded audit limits");
    }
    const pageTexts: string[] = [];
    let extractedCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      const text = normalizeText(content.items.map((item) =>
        typeof item === "object" && item !== null && "str" in item &&
          typeof item.str === "string"
          ? `${item.str}${"hasEOL" in item && item.hasEOL === true ? "\n" : " "}`
          : ""
      ).join(""));
      extractedCharacters += text.length;
      if (extractedCharacters > MAX_EXTRACTED_CHARACTERS) {
        throw new Error("Open PDF extracted text exceeded audit limits");
      }
      pageTexts.push(text);
    }
    const completeText = pageTexts.join("\n");
    const identity = verifyArticleIdentity(input.identity ?? { doi: input.doi, title: input.title }, completeText);
    if (identity === undefined) return undefined;
    input.onIdentity?.(identity);
    const blocks: AuditableDocumentBlock[] = [];
    const sectionPaths: string[][] = [];
    for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
      const text = pageTexts[pageIndex]!;
      if (text.length === 0) continue;
      const pageNumber = pageIndex + 1;
      const path = [`Page ${pageNumber}`];
      sectionPaths.push(path);
      for (const chunk of splitText(text, 190_000)) {
        const textHash = createHash("sha256").update(chunk, "utf8").digest("hex");
        blocks.push({
          block_id: `pdf_${String(blocks.length + 1).padStart(6, "0")}_${textHash.slice(0, 12)}`,
          kind: "page_text",
          section_path: path,
          page_number: pageNumber,
          text: chunk,
          text_sha256: textHash
        });
      }
    }
    if (blocks.length === 0) return undefined;
    const admission = admitFullText(blocks);
    input.onInspection?.(admission);
    if (admission.state !== "FULL_TEXT_READABLE") return undefined;
    return auditableDocumentIndexSchema.parse({
      source: {
        provider: "unpaywall_open_location",
        primary_identifier: input.doi,
        canonical_url: input.canonicalUrl,
        doi: input.doi,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.version === undefined ? {} : { version: input.version }),
        format: "pdf_text",
        content_sha256: contentHash,
        document_completeness: "full_text_with_body",
        identity_verification: identity
      },
      section_paths: sectionPaths,
      blocks
    });
  } finally {
    await loadingTask.destroy();
  }
}

function pdfCandidates(discovery: UnpaywallOpenAccessData): UnpaywallOpenLocation[] {
  const candidates = [
    ...(discovery.best_location === undefined ? [] : [discovery.best_location]),
    ...discovery.oa_locations
  ].filter((location) =>
    location.transport === "https" &&
    (location.pdf_url !== undefined || likelyPdfUrl(location.candidate_full_text_url))
  );
  const seen = new Set<string>();
  return candidates.filter((location) => {
    const url = location.pdf_url ?? location.candidate_full_text_url!;
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  }).sort((left, right) => versionRank(right.version) - versionRank(left.version));
}

function versionRank(version: string | undefined): number {
  if (version === "publishedVersion") return 3;
  if (version === "acceptedVersion") return 2;
  if (version === "submittedVersion") return 1;
  return 0;
}

function likelyPdfUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  const path = new URL(value).pathname.toLowerCase();
  return path.endsWith(".pdf") || path.includes("/pdf/") || path.endsWith("/pdf");
}

function looksLikePdf(document: FetchedDiscoveredDocument): boolean {
  return hasPdfMagic(document.bytes) ||
    document.contentType?.toLowerCase().includes("application/pdf") === true;
}

function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

function splitText(value: string, maximum: number): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += maximum) {
    const chunk = value.slice(offset, offset + maximum).trim();
    if (chunk.length > 0) chunks.push(chunk);
  }
  return chunks;
}

function normalizeText(value: string): string {
  return value.replace(/[ \t\f\v]+/gu, " ").replace(/\s*\n\s*/gu, "\n").trim();
}

function normalizeDoi(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "");
}

function attempt(
  location: UnpaywallOpenLocation,
  url: string,
  result: UnpaywallFullTextData["attempted_locations"][number]["result"]
): UnpaywallFullTextData["attempted_locations"][number] {
  return {
    url,
    ...(location.version === undefined ? {} : { version: location.version }),
    result
  };
}

function unavailable(
  doi: string,
  discoveryStatus: string,
  attempts: UnpaywallFullTextData["attempted_locations"],
  boundary: string,
  state: AcquisitionState = "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH",
  identity?: FrozenArticleIdentity
): ProvenanceEnvelope<UnpaywallFullTextData> {
  const envelope = errorEnvelope({
    provider: "unpaywall",
    recordType: "open_full_text_acquisition",
    primaryIdentifier: doi,
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
    pagination: { exhausted: true },
    returned: 0,
    accessStatus: state === "PROVIDER_UNAVAILABLE" ? "error" : state === "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" ? "not_found" : "partial",
    limitations: [
      boundary,
      "The study remains a possibly useful research lead; unseen full-text content was not treated as evidence."
    ],
    code: "open_full_text_not_auditable",
    message: "No identity-verified open full text could be indexed",
    retryable: state === "PROVIDER_UNAVAILABLE",
    data: {
      requested_doi: doi,
      outcome: "possibly_useful_lead",
      discovery_status: discoveryStatus,
      attempted_locations: attempts,
      access_boundary: boundary,
      acquisition_state: state,
      ...(identity === undefined ? {} : { identity })
    }
  });
  return envelope as ProvenanceEnvelope<UnpaywallFullTextData>;
}
