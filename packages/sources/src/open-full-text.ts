import {
  errorEnvelope,
  okEnvelope,
  type ProvenanceEnvelope
} from "@askrigor/contracts";

import {
  type AuditableDocumentIndex,
  toAuditableDocumentIndex
} from "./auditable-document-index.js";
import {
  fetchEuropePmcFullText,
  type EuropePmcFullTextArticle
} from "./europe-pmc-full-text.js";
import { searchEuropePmc, type EuropePmcRecord } from "./europe-pmc.js";
import { indexJatsStudyDocument } from "./jats-study-index.js";
import {
  acquireUnpaywallFullText,
  type AcquireUnpaywallFullTextRuntime
} from "./unpaywall-full-text.js";
import type { UnpaywallConfig } from "./unpaywall.js";

const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/iu;
const PMCID_PATTERN = /^PMC[1-9]\d{0,15}$/u;

export interface AcquireOpenFullTextInput {
  doi: string;
  pmcid?: string;
}

export interface AcquireOpenFullTextRuntime {
  searchEuropePmc?: typeof searchEuropePmc;
  fetchEuropePmcFullText?: typeof fetchEuropePmcFullText;
  acquireUnpaywallFullText?: typeof acquireUnpaywallFullText;
  unpaywallRuntime?: AcquireUnpaywallFullTextRuntime;
}

export interface OpenFullTextAcquisitionData {
  requested_doi: string;
  requested_pmcid?: string;
  outcome: "full_text_indexed" | "possibly_useful_lead";
  discovery_attempts: Array<{
    route: "europe_pmc" | "unpaywall";
    result: "indexed" | "not_found" | "inaccessible" | "error";
    identifier?: string;
  }>;
  document_index?: AuditableDocumentIndex;
  access_boundary?: string;
}

/**
 * Acquires a lawful auditable full text through deterministic repository
 * routes. Europe PMC is attempted first when a matching PMCID is known or can
 * be resolved; Unpaywall then discovers additional open copies by DOI.
 */
export async function acquireOpenFullText(
  rawInput: AcquireOpenFullTextInput,
  unpaywallConfig: UnpaywallConfig | undefined,
  runtime: AcquireOpenFullTextRuntime = {}
): Promise<ProvenanceEnvelope<OpenFullTextAcquisitionData>> {
  const doi = normalizeDoi(rawInput.doi);
  if (!DOI_PATTERN.test(doi)) throw new Error("Invalid open-full-text DOI");
  const pmcid = rawInput.pmcid?.trim().toUpperCase();
  if (pmcid !== undefined && !PMCID_PATTERN.test(pmcid)) {
    throw new Error("Invalid open-full-text PMCID");
  }
  const search = runtime.searchEuropePmc ?? searchEuropePmc;
  const fetchPmc = runtime.fetchEuropePmcFullText ?? fetchEuropePmcFullText;
  const acquireUnpaywall = runtime.acquireUnpaywallFullText ?? acquireUnpaywallFullText;
  const attempts: OpenFullTextAcquisitionData["discovery_attempts"] = [];

  let resolvedPmcid = pmcid;
  if (resolvedPmcid === undefined) {
    const searchResult = await search({ query: `DOI:"${doi}"`, pageSize: 10 });
    if (searchResult.access_status === "complete") {
      resolvedPmcid = exactPmcid(searchResult.data, doi);
      if (resolvedPmcid === undefined) {
        attempts.push({ route: "europe_pmc", result: "not_found" });
      }
    } else {
      attempts.push({ route: "europe_pmc", result: routeResult(searchResult.access_status) });
    }
  }

  if (resolvedPmcid !== undefined) {
    const fullText = await fetchPmc(resolvedPmcid);
    if (
      fullText.access_status === "complete" &&
      "xml" in fullText.data
    ) {
      const article = fullText.data as EuropePmcFullTextArticle;
      if (article.doi !== undefined && normalizeDoi(article.doi) !== doi) {
        attempts.push({
          route: "europe_pmc",
          result: "error",
          identifier: resolvedPmcid
        });
      } else {
        const index = toAuditableDocumentIndex(indexJatsStudyDocument(article));
        attempts.push({
          route: "europe_pmc",
          result: "indexed",
          identifier: resolvedPmcid
        });
        return indexed(doi, pmcid, attempts, index);
      }
    } else {
      attempts.push({
        route: "europe_pmc",
        result: routeResult(fullText.access_status),
        identifier: resolvedPmcid
      });
    }
  }

  if (unpaywallConfig === undefined) {
    return unavailable(
      doi,
      pmcid,
      attempts,
      "Europe PMC did not yield a complete matching full text, and Unpaywall service contact configuration was unavailable."
    );
  }
  const unpaywall = await acquireUnpaywall(
    doi,
    unpaywallConfig,
    runtime.unpaywallRuntime
  );
  if (
    unpaywall.access_status === "complete" &&
    unpaywall.data.document_index !== undefined
  ) {
    attempts.push({ route: "unpaywall", result: "indexed", identifier: doi });
    return indexed(doi, pmcid, attempts, unpaywall.data.document_index);
  }
  attempts.push({
    route: "unpaywall",
    result: routeResult(unpaywall.access_status),
    identifier: doi
  });
  return unavailable(
    doi,
    pmcid,
    attempts,
    unpaywall.data.access_boundary ??
      "No identity-verified open full text could be indexed through Europe PMC or Unpaywall."
  );
}

function indexed(
  doi: string,
  pmcid: string | undefined,
  attempts: OpenFullTextAcquisitionData["discovery_attempts"],
  index: AuditableDocumentIndex
): ProvenanceEnvelope<OpenFullTextAcquisitionData> {
  return okEnvelope({
    provider: "open_full_text",
    recordType: "open_full_text_acquisition",
    primaryIdentifier: doi,
    sourceIdentity: {
      canonical_url: index.source.canonical_url,
      ...(index.source.title === undefined ? {} : { title: index.source.title })
    },
    pagination: { exhausted: true },
    returned: 1,
    accessStatus: "complete",
    limitations: [
      "The acquired document is available for a source-linked method audit; retrieval and identity verification do not establish study validity.",
      "Claims remain limited to the exact study version, program, population, comparator, outcomes, horizon, and methods actually audited."
    ],
    rawMetadata: {
      selected_route: index.source.provider,
      format: index.source.format,
      content_sha256: index.source.content_sha256,
      block_count: index.blocks.length
    },
    data: {
      requested_doi: doi,
      ...(pmcid === undefined ? {} : { requested_pmcid: pmcid }),
      outcome: "full_text_indexed",
      discovery_attempts: attempts,
      document_index: index
    }
  });
}

function unavailable(
  doi: string,
  pmcid: string | undefined,
  attempts: OpenFullTextAcquisitionData["discovery_attempts"],
  boundary: string
): ProvenanceEnvelope<OpenFullTextAcquisitionData> {
  return errorEnvelope({
    provider: "open_full_text",
    recordType: "open_full_text_acquisition",
    primaryIdentifier: doi,
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
    pagination: { exhausted: true },
    returned: 0,
    accessStatus: "inaccessible",
    limitations: [
      boundary,
      "The citation remains a possibly useful lead requiring further investigation; unseen contents were not treated as evidence."
    ],
    code: "open_full_text_not_auditable",
    message: "No complete identity-verified open full text could be indexed",
    retryable: false,
    data: {
      requested_doi: doi,
      ...(pmcid === undefined ? {} : { requested_pmcid: pmcid }),
      outcome: "possibly_useful_lead",
      discovery_attempts: attempts,
      access_boundary: boundary
    }
  }) as ProvenanceEnvelope<OpenFullTextAcquisitionData>;
}

function exactPmcid(records: EuropePmcRecord[], doi: string): string | undefined {
  const exact = records.filter((record) =>
    record.doi !== undefined && normalizeDoi(record.doi) === doi &&
    record.pmcid !== undefined
  );
  if (exact.length !== 1) return undefined;
  return exact[0]!.pmcid!.toUpperCase();
}

function routeResult(
  status: string
): "not_found" | "inaccessible" | "error" {
  if (status === "not_found") return "not_found";
  if (status === "inaccessible" || status === "partial" || status === "abstract_only" || status === "metadata_only") {
    return "inaccessible";
  }
  return "error";
}

function normalizeDoi(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "");
}
