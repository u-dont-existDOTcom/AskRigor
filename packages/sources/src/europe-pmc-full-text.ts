import { createHash } from "node:crypto";

import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { fetchText, UpstreamHttpError } from "./http.js";

const EUROPE_PMC_FULL_TEXT_ROOT =
  "https://www.ebi.ac.uk/europepmc/webservices/rest";
const pmcidSchema = z.string().trim().toUpperCase().regex(/^PMC[1-9]\d{0,15}$/u);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: false
});
const orderedTextParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: false
});

export interface EuropePmcFullTextArticle {
  pmcid: string;
  pmid?: string;
  doi?: string;
  title?: string;
  license?: string;
  format: "jats_xml";
  document_completeness: "full_text_with_body" | "front_matter_only";
  content_sha256: string;
  content_bytes: number;
  xml: string;
}

/**
 * Retrieves reusable full-text XML from Europe PMC's documented open-access
 * endpoint. The exact XML bytes and hash are preserved for later study audit;
 * retrieval is evidence access, not evidence appraisal.
 */
export async function fetchEuropePmcFullText(
  pmcid: string
): Promise<ProvenanceEnvelope<EuropePmcFullTextArticle | Record<string, never>>> {
  const parsedPmcid = pmcidSchema.safeParse(pmcid);
  if (!parsedPmcid.success) {
    throw new Error("Invalid Europe PMC full-text PMCID");
  }

  const normalizedPmcid = parsedPmcid.data;
  const canonicalUrl = `https://europepmc.org/articles/${normalizedPmcid}`;
  const endpoint = `${EUROPE_PMC_FULL_TEXT_ROOT}/${normalizedPmcid}/fullTextXML`;

  try {
    const xml = await fetchText(endpoint, {
      headers: { Accept: "application/xml,text/xml;q=0.9" }
    });
    const article = parseArticle(xml, normalizedPmcid);
    const fullBody = article.document_completeness === "full_text_with_body";

    return okEnvelope({
      provider: "europe_pmc",
      recordType: "europe_pmc_full_text",
      primaryIdentifier: normalizedPmcid,
      sourceIdentity: {
        canonical_url: canonicalUrl,
        ...(article.title === undefined ? {} : { title: article.title })
      },
      pagination: { exhausted: true },
      returned: 1,
      accessStatus: fullBody ? "complete" : "partial",
      limitations: [
        "Full-text retrieval does not establish study validity, reproducibility, or applicability.",
        ...(fullBody
          ? []
          : ["Europe PMC returned article front matter without a body; treat the document as partial."])
      ],
      rawMetadata: {
        format: "jats_xml",
        content_sha256: article.content_sha256,
        content_bytes: article.content_bytes
      },
      data: article
    });
  } catch (error) {
    if (error instanceof FullTextIdentityError || error instanceof FullTextXmlError) {
      return fullTextErrorEnvelope(normalizedPmcid, canonicalUrl, {
        accessStatus: "error",
        code: error instanceof FullTextIdentityError
          ? "europe_pmc_full_text_identity_mismatch"
          : "europe_pmc_full_text_invalid",
        message: error instanceof FullTextIdentityError
          ? "Europe PMC full text did not match the requested PMCID"
          : "Europe PMC full text was not valid article XML",
        retryable: false
      });
    }

    const status = error instanceof UpstreamHttpError ? error.status : undefined;
    if (status === 404) {
      return fullTextErrorEnvelope(normalizedPmcid, canonicalUrl, {
        accessStatus: "not_found",
        code: "europe_pmc_full_text_not_found",
        message: "Reusable Europe PMC full text was not found",
        httpStatus: status,
        retryable: false
      });
    }
    if (status === 401 || status === 403) {
      return fullTextErrorEnvelope(normalizedPmcid, canonicalUrl, {
        accessStatus: "inaccessible",
        code: "europe_pmc_full_text_inaccessible",
        message: "Europe PMC full text was not accessible",
        httpStatus: status,
        retryable: false
      });
    }
    if (status === 429) {
      return fullTextErrorEnvelope(normalizedPmcid, canonicalUrl, {
        accessStatus: "rate_limited",
        code: "europe_pmc_full_text_rate_limited",
        message: "Europe PMC full-text rate limit was reached",
        httpStatus: status,
        retryable: true
      });
    }

    return fullTextErrorEnvelope(normalizedPmcid, canonicalUrl, {
      accessStatus: "error",
      code: status !== undefined && status >= 500
        ? "europe_pmc_full_text_upstream_unavailable"
        : "europe_pmc_full_text_request_failed",
      message: status !== undefined && status >= 500
        ? "Europe PMC full-text service was unavailable"
        : "Europe PMC full-text request failed",
      ...(status === undefined ? {} : { httpStatus: status }),
      retryable: status !== undefined && status >= 500
    });
  }
}

function parseArticle(xml: string, expectedPmcid: string): EuropePmcFullTextArticle {
  let parsed: unknown;
  let ordered: unknown;
  try {
    parsed = parser.parse(xml);
    ordered = orderedTextParser.parse(xml);
  } catch {
    throw new FullTextXmlError();
  }

  const root = asRecord(parsed);
  const article = asRecord(root?.article);
  const front = asRecord(article?.front);
  const articleMeta = asRecord(front?.["article-meta"]);
  if (article === undefined || articleMeta === undefined) {
    throw new FullTextXmlError();
  }

  const identifiers = arrayOf(articleMeta["article-id"]);
  const pmcid = identifierOfTypes(identifiers, ["pmcid", "pmc"]);
  if (pmcid === undefined || normalizePmcid(pmcid) !== expectedPmcid) {
    throw new FullTextIdentityError();
  }

  const titleGroup = asRecord(articleMeta["title-group"]);
  const permissions = asRecord(articleMeta.permissions);
  const license = arrayOf(permissions?.license)[0];
  const licenseRecord = asRecord(license);
  const licenseText = orderedElementText(ordered, "license-p") ??
    cleanText(textOf(licenseRecord?.["license-p"] ?? license));
  const title = orderedElementText(ordered, "article-title") ??
    cleanText(textOf(titleGroup?.["article-title"]));
  const pmid = identifier(identifiers, "pmid");
  const doi = identifier(identifiers, "doi");
  const contentBytes = Buffer.byteLength(xml, "utf8");

  return {
    pmcid: expectedPmcid,
    ...(pmid === undefined ? {} : { pmid }),
    ...(doi === undefined ? {} : { doi }),
    ...(title === undefined ? {} : { title }),
    ...(licenseText === undefined ? {} : { license: licenseText }),
    format: "jats_xml",
    document_completeness: article.body === undefined
      ? "front_matter_only"
      : "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: contentBytes,
    xml
  };
}

function identifier(values: unknown[], type: string): string | undefined {
  for (const value of values) {
    const record = asRecord(value);
    if (record?.["@_pub-id-type"] !== type) continue;
    const text = cleanText(textOf(record));
    if (text !== undefined) return text;
  }
  return undefined;
}

function identifierOfTypes(values: unknown[], types: string[]): string | undefined {
  for (const type of types) {
    const value = identifier(values, type);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizePmcid(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized.startsWith("PMC") ? normalized : `PMC${normalized}`;
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  const record = asRecord(value);
  if (record === undefined) return "";
  return Object.entries(record)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, child]) => textOf(child))
    .join(" ");
}

function cleanText(value: string): string | undefined {
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned.length === 0 ? undefined : cleaned;
}

function orderedElementText(value: unknown, tag: string): string | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = orderedElementText(child, tag);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) return undefined;
  if (tag in record) return cleanText(orderedTextOf(record[tag]));
  for (const [key, child] of Object.entries(record)) {
    if (key === ":@") continue;
    const found = orderedElementText(child, tag);
    if (found !== undefined) return found;
  }
  return undefined;
}

function orderedTextOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(orderedTextOf).join("");
  const record = asRecord(value);
  if (record === undefined) return "";
  return Object.entries(record)
    .filter(([key]) => key !== ":@")
    .map(([, child]) => orderedTextOf(child))
    .join("");
}

function arrayOf(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

interface FullTextErrorDetails {
  accessStatus: AccessStatus;
  code: string;
  message: string;
  httpStatus?: number;
  retryable: boolean;
}

function fullTextErrorEnvelope(
  pmcid: string,
  canonicalUrl: string,
  details: FullTextErrorDetails
): ProvenanceEnvelope<Record<string, never>> {
  return errorEnvelope({
    provider: "europe_pmc",
    recordType: "europe_pmc_full_text",
    primaryIdentifier: pmcid,
    sourceIdentity: { canonical_url: canonicalUrl },
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: [
      "The article remains a possibly useful research lead; unseen full-text content was not treated as evidence."
    ],
    code: details.code,
    message: details.message,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: {}
  }) as ProvenanceEnvelope<Record<string, never>>;
}

class FullTextXmlError extends Error {}
class FullTextIdentityError extends Error {}
