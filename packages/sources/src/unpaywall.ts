import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import { fetchJson, UpstreamHttpError } from "./http.js";

const UNPAYWALL_API_ROOT = "https://api.unpaywall.org/v2";
const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/iu;
const doiSchema = z.string().trim().max(2_048).transform((value) =>
  value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").trim().toLowerCase()
).refine((value) => DOI_PATTERN.test(value), "must be a valid DOI");
const configSchema = z.object({
  email: z.string().trim().email().max(320)
}).strict();

const openLocationSchema = z.object({
  host_type: z.string().nullable().optional(),
  is_best: z.boolean().optional(),
  license: z.string().nullable().optional(),
  oa_date: z.string().nullable().optional(),
  pmh_id: z.string().nullable().optional(),
  repository_institution: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  url_for_landing_page: z.string().url().nullable().optional(),
  url_for_pdf: z.string().url().nullable().optional(),
  version: z.string().nullable().optional()
}).passthrough();

const doiRecordSchema = z.object({
  doi: z.string(),
  doi_url: z.string().url().optional(),
  title: z.string().nullable().optional(),
  is_oa: z.boolean(),
  oa_status: z.string(),
  has_repository_copy: z.boolean().optional(),
  updated: z.string().optional(),
  best_oa_location: openLocationSchema.nullable(),
  oa_locations: z.array(openLocationSchema).default([])
}).passthrough();

export interface UnpaywallConfig {
  /** Service contact address required by the public Unpaywall API. */
  email: string;
}

export interface UnpaywallOpenLocation {
  host_type?: string;
  version?: string;
  license?: string;
  repository_institution?: string;
  landing_page_url?: string;
  pdf_url?: string;
  location_url?: string;
  candidate_full_text_url?: string;
  transport: "https" | "http_or_other";
}

export interface UnpaywallOpenAccessData {
  doi: string;
  title?: string;
  is_oa: boolean;
  oa_status: string;
  has_repository_copy?: boolean;
  record_updated?: string;
  full_text_lead_status: "open_location_available" | "no_open_location_found";
  best_location?: UnpaywallOpenLocation;
  oa_locations: UnpaywallOpenLocation[];
}

/**
 * Resolves lawful open-access locations for a DOI using Unpaywall metadata.
 * This function deliberately does not claim that a linked object was fetched,
 * complete, correctly identified, or suitable for study audit.
 */
export async function resolveUnpaywallOpenAccess(
  doi: string,
  config: UnpaywallConfig
): Promise<ProvenanceEnvelope<UnpaywallOpenAccessData | Record<string, never>>> {
  const parsedDoi = doiSchema.safeParse(doi);
  if (!parsedDoi.success) throw new Error("Invalid Unpaywall DOI");
  const parsedConfig = configSchema.safeParse(config);
  if (!parsedConfig.success) {
    return unpaywallErrorEnvelope(parsedDoi.data, {
      accessStatus: "error",
      code: "unpaywall_configuration_invalid",
      message: "Unpaywall service contact configuration was invalid",
      retryable: false
    });
  }

  const url = new URL(`${UNPAYWALL_API_ROOT}/${encodeURIComponent(parsedDoi.data)}`);
  url.searchParams.set("email", parsedConfig.data.email);

  try {
    const raw = await fetchJson(url.toString(), {
      headers: { Accept: "application/json" }
    });
    const parsed = doiRecordSchema.safeParse(raw);
    if (!parsed.success || normalizeDoi(parsed.data.doi) !== parsedDoi.data) {
      return unpaywallErrorEnvelope(parsedDoi.data, {
        accessStatus: "error",
        code: "unpaywall_response_invalid",
        message: "Unpaywall returned invalid or mismatched DOI metadata",
        retryable: false
      });
    }

    const locations = parsed.data.oa_locations.map(toOpenLocation);
    const bestLocation = parsed.data.best_oa_location === null
      ? undefined
      : toOpenLocation(parsed.data.best_oa_location);
    const hasOpenLocation = parsed.data.is_oa && bestLocation !== undefined &&
      bestLocation.candidate_full_text_url !== undefined;
    const data: UnpaywallOpenAccessData = {
      doi: parsedDoi.data,
      ...(parsed.data.title === undefined || parsed.data.title === null
        ? {}
        : { title: parsed.data.title }),
      is_oa: parsed.data.is_oa,
      oa_status: parsed.data.oa_status,
      ...(parsed.data.has_repository_copy === undefined
        ? {}
        : { has_repository_copy: parsed.data.has_repository_copy }),
      ...(parsed.data.updated === undefined
        ? {}
        : { record_updated: parsed.data.updated }),
      full_text_lead_status: hasOpenLocation
        ? "open_location_available"
        : "no_open_location_found",
      ...(bestLocation === undefined ? {} : { best_location: bestLocation }),
      oa_locations: locations
    };

    return okEnvelope({
      provider: "unpaywall",
      recordType: "open_access_location_resolution",
      primaryIdentifier: parsedDoi.data,
      sourceIdentity: {
        canonical_url: `https://doi.org/${parsedDoi.data}`,
        ...(data.title === undefined ? {} : { title: data.title })
      },
      pagination: { exhausted: true },
      returned: 1,
      accessStatus: "metadata_only",
      limitations: [
        "Unpaywall reports candidate open-access locations; AskRigor has not yet fetched or identity-checked the linked document.",
        "A location may expose a submitted, accepted, or published version; version and completeness must be preserved during study audit.",
        ...(hasOpenLocation
          ? []
          : ["No open location was found in this Unpaywall response; the study remains a possibly useful research lead requiring further investigation."])
      ],
      rawMetadata: {
        is_oa: parsed.data.is_oa,
        oa_status: parsed.data.oa_status,
        location_count: locations.length
      },
      data
    });
  } catch (error) {
    const status = error instanceof UpstreamHttpError ? error.status : undefined;
    if (status === 404) {
      return unpaywallErrorEnvelope(parsedDoi.data, {
        accessStatus: "not_found",
        code: "unpaywall_doi_not_found",
        message: "Unpaywall did not contain a record for the DOI",
        httpStatus: status,
        retryable: false
      });
    }
    if (status === 429) {
      return unpaywallErrorEnvelope(parsedDoi.data, {
        accessStatus: "rate_limited",
        code: "unpaywall_rate_limited",
        message: "Unpaywall rate limit was reached",
        httpStatus: status,
        retryable: true
      });
    }
    return unpaywallErrorEnvelope(parsedDoi.data, {
      accessStatus: "error",
      code: status !== undefined && status >= 500
        ? "unpaywall_upstream_unavailable"
        : "unpaywall_request_failed",
      message: status !== undefined && status >= 500
        ? "Unpaywall service was unavailable"
        : "Unpaywall request failed",
      ...(status === undefined ? {} : { httpStatus: status }),
      retryable: status !== undefined && status >= 500
    });
  }
}

function toOpenLocation(
  location: z.output<typeof openLocationSchema>
): UnpaywallOpenLocation {
  const candidate = location.url_for_pdf ?? location.url ?? location.url_for_landing_page ?? undefined;
  const protocol = candidate === undefined ? undefined : new URL(candidate).protocol;
  return {
    ...(location.host_type === undefined || location.host_type === null
      ? {}
      : { host_type: location.host_type }),
    ...(location.version === undefined || location.version === null
      ? {}
      : { version: location.version }),
    ...(location.license === undefined || location.license === null
      ? {}
      : { license: location.license }),
    ...(location.repository_institution === undefined || location.repository_institution === null
      ? {}
      : { repository_institution: location.repository_institution }),
    ...(location.url_for_landing_page === undefined || location.url_for_landing_page === null
      ? {}
      : { landing_page_url: location.url_for_landing_page }),
    ...(location.url_for_pdf === undefined || location.url_for_pdf === null
      ? {}
      : { pdf_url: location.url_for_pdf }),
    ...(location.url === undefined || location.url === null
      ? {}
      : { location_url: location.url }),
    ...(candidate === undefined ? {} : { candidate_full_text_url: candidate }),
    transport: protocol === "https:" ? "https" : "http_or_other"
  };
}

function normalizeDoi(value: string): string {
  return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").trim().toLowerCase();
}

interface UnpaywallErrorDetails {
  accessStatus: AccessStatus;
  code: string;
  message: string;
  httpStatus?: number;
  retryable: boolean;
}

function unpaywallErrorEnvelope(
  doi: string,
  details: UnpaywallErrorDetails
): ProvenanceEnvelope<Record<string, never>> {
  return errorEnvelope({
    provider: "unpaywall",
    recordType: "open_access_location_resolution",
    primaryIdentifier: doi,
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: [
      "The study remains a possibly useful research lead; unseen full-text content was not treated as evidence."
    ],
    code: details.code,
    message: details.message,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: {}
  }) as ProvenanceEnvelope<Record<string, never>>;
}
