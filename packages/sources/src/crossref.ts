import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import { fetchJson } from "./http.js";

const WORKS_URL = "https://api.crossref.org/works";
const CITATION_ROWS = 5;
const CROSSREF_HEADERS = { "User-Agent": "askrigor-research/0.1.0" };
const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/i;
const NO_MARKER_LIMITATION =
  "No retraction, expression-of-concern, correction, or update marker was present in the successful Crossref metadata response; this does not prove unretracted status everywhere.";
const UNKNOWN_LIMITATION =
  "Crossref metadata was unavailable or could not be interpreted; retraction state remains unknown.";
const TITLE_SIMILARITY_THRESHOLD = 0.9;

const datePartsSchema = z.object({
  "date-parts": z.array(z.array(z.number().int().nonnegative()).min(1)).min(1)
}).passthrough();
const crossrefMessageSchema = z.object({
  DOI: z.string().optional(),
  title: z.array(z.string()).optional(),
  author: z.array(z.object({ family: z.string().optional() }).passthrough()).optional(),
  "published-print": datePartsSchema.optional(),
  "published-online": datePartsSchema.optional(),
  issued: datePartsSchema.optional(),
  "update-to": z.array(z.unknown()).optional(),
  "updated-by": z.array(z.unknown()).optional(),
  relation: z.record(z.string(), z.unknown()).optional(),
  source: z.unknown().optional(),
  member: z.unknown().optional()
}).passthrough();
const workResponseSchema = z.object({ message: crossrefMessageSchema }).passthrough();
const workListResponseSchema = z.object({
  message: z.object({ items: z.array(crossrefMessageSchema) }).passthrough()
}).passthrough();

export type RetractionStatus =
  | "retracted"
  | "expression_of_concern"
  | "corrected_or_updated"
  | "no_retraction_record_found"
  | "unknown";

export interface CrossrefCandidate {
  doi: string;
  title?: string;
  first_author?: string;
  year?: string;
}

export interface ResolveDoiData {
  resolved_doi: string | null;
  candidates: CrossrefCandidate[];
}

export interface RetractionEvidence {
  type: Exclude<RetractionStatus, "no_retraction_record_found" | "unknown">;
  doi: string | null;
  date: string | null;
  source: string | null;
  raw_label: string;
}

export interface RetractionStatusData {
  doi: string | null;
  status: RetractionStatus;
  evidence: RetractionEvidence[];
  sources_checked: ["crossref"];
}

export async function resolveDoi(
  doiOrCitation: string
): Promise<ProvenanceEnvelope<ResolveDoiData>> {
  const input = normalizeInput(doiOrCitation);
  if (input.kind === "invalid") {
    return resolveErrorEnvelope(input.reason);
  }

  if (input.kind === "doi") {
    try {
      const work = await fetchWork(input.doi);
      const candidate = candidateFromMessage(work);
      if (candidate === undefined) {
        throw new CrossrefResponseError();
      }
      return okEnvelope({
        provider: "crossref",
        recordType: "doi_resolution",
        primaryIdentifier: input.doi,
        sourceIdentity: sourceIdentity(work, input.doi),
        accessStatus: "metadata_only",
        pagination: { exhausted: true },
        returned: 1,
        data: { resolved_doi: candidate.doi, candidates: [candidate] }
      });
    } catch (error) {
      return resolveErrorEnvelope(crossrefFailure(error), input.doi);
    }
  }

  try {
    const url = new URL(WORKS_URL);
    url.searchParams.set("query.bibliographic", input.citation);
    url.searchParams.set("rows", String(CITATION_ROWS));
    const response = workListResponseSchema.safeParse(await crossrefFetchJson(url.toString()));
    if (!response.success) {
      throw new CrossrefResponseError();
    }
    if (response.data.message.items.length > CITATION_ROWS) {
      throw new CrossrefResponseError();
    }
    const candidates = response.data.message.items
      .map(candidateFromMessage)
      .filter((candidate): candidate is CrossrefCandidate => candidate !== undefined);
    const parsedCitation = parseCitation(input.citation);
    const matches = candidates.filter((candidate) => citationMatches(candidate, parsedCitation));

    return okEnvelope({
      provider: "crossref",
      recordType: "doi_resolution",
      query: { citation: input.citation, rows: CITATION_ROWS },
      accessStatus: "metadata_only",
      pagination: { page_size: CITATION_ROWS, exhausted: true },
      returned: candidates.length,
      data: {
        resolved_doi: matches.length === 1 ? matches[0]!.doi : null,
        candidates
      }
    });
  } catch (error) {
    return resolveErrorEnvelope(crossrefFailure(error));
  }
}

export async function checkRetractionStatus(
  identifier: string
): Promise<ProvenanceEnvelope<RetractionStatusData>> {
  const normalized = normalizeDoi(identifier);
  if (normalized === undefined) {
    return retractionErrorEnvelope("crossref_identifier_invalid");
  }

  try {
    const work = await fetchWork(normalized);
    const evidence = collectRetractionEvidence(work);
    const status = classifyEvidence(evidence);

    return okEnvelope({
      provider: "crossref",
      recordType: "retraction_status",
      primaryIdentifier: normalized,
      sourceIdentity: sourceIdentity(work, normalized),
      accessStatus: "metadata_only",
      limitations: status === "no_retraction_record_found" ? [NO_MARKER_LIMITATION] : [],
      pagination: { exhausted: true },
      returned: 1,
      data: { doi: normalized, status, evidence, sources_checked: ["crossref"] }
    });
  } catch (error) {
    return retractionErrorEnvelope(crossrefFailure(error), normalized);
  }
}

const fetchWork = async (doi: string): Promise<z.infer<typeof crossrefMessageSchema>> => {
  const response = workResponseSchema.safeParse(
    await crossrefFetchJson(`${WORKS_URL}/${encodeURIComponent(doi)}`)
  );
  if (!response.success) {
    throw new CrossrefResponseError();
  }
  if (response.data.message.DOI === undefined || normalizeDoi(response.data.message.DOI) !== doi) {
    throw new CrossrefResponseError();
  }
  return response.data.message;
};

const crossrefFetchJson = <T = unknown>(url: string): Promise<T> =>
  fetchJson<T>(url, { headers: CROSSREF_HEADERS });

const normalizeInput = (value: string):
  | { kind: "doi"; doi: string }
  | { kind: "citation"; citation: string }
  | { kind: "invalid"; reason: CrossrefFailureCode } => {
  if (typeof value !== "string") {
    return { kind: "invalid", reason: "crossref_input_invalid" };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 5_000) {
    return { kind: "invalid", reason: "crossref_input_invalid" };
  }
  const doi = normalizeDoi(trimmed);
  if (doi !== undefined) {
    return { kind: "doi", doi };
  }
  if (/^(?:doi:|https?:\/\/)/i.test(trimmed) || /^10\./i.test(trimmed)) {
    return { kind: "invalid", reason: "crossref_identifier_invalid" };
  }
  return { kind: "citation", citation: trimmed };
};

const normalizeDoi = (value: string): string | undefined => {
  if (typeof value !== "string" || value.length > 5_000) {
    return undefined;
  }
  let doi = value.trim();
  if (/^doi:/i.test(doi)) {
    doi = doi.slice(4).trim();
  } else if (/^https?:\/\//i.test(doi)) {
    let url: URL;
    try {
      url = new URL(doi);
    } catch {
      return undefined;
    }
    if (url.protocol !== "https:" || !["doi.org", "www.doi.org", "dx.doi.org"].includes(url.hostname)) {
      return undefined;
    }
    if (url.search || url.hash) {
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
};

const candidateFromMessage = (
  message: z.infer<typeof crossrefMessageSchema>
): CrossrefCandidate | undefined => {
  const doi = message.DOI === undefined ? undefined : normalizeDoi(message.DOI);
  if (doi === undefined) {
    return undefined;
  }
  const title = message.title?.find((value) => value.trim().length > 0)?.trim();
  const firstAuthor = message.author?.[0]?.family?.trim();
  const year = publicationYear(message);
  return {
    doi,
    ...(title === undefined ? {} : { title }),
    ...(firstAuthor === undefined || firstAuthor.length === 0 ? {} : { first_author: firstAuthor }),
    ...(year === undefined ? {} : { year })
  };
};

const publicationYear = (message: z.infer<typeof crossrefMessageSchema>): string | undefined => {
  for (const date of [message["published-print"], message["published-online"], message.issued]) {
    const year = date?.["date-parts"][0]?.[0];
    if (year !== undefined) {
      return String(year);
    }
  }
  return undefined;
};

const sourceIdentity = (
  message: z.infer<typeof crossrefMessageSchema>,
  doi: string
) => {
  const candidate = candidateFromMessage(message);
  return {
    canonical_url: `https://doi.org/${doi}`,
    ...(candidate?.title === undefined ? {} : { title: candidate.title }),
    ...(candidate?.first_author === undefined
      ? {}
      : { authors_or_channel: [candidate.first_author] })
  };
};

const collectRetractionEvidence = (
  message: z.infer<typeof crossrefMessageSchema>
): RetractionEvidence[] => {
  const evidence: RetractionEvidence[] = [];
  addEvidence(evidence, message["update-to"], "update-to");
  addEvidence(evidence, message["updated-by"], "updated-by");
  if (message.relation !== undefined) {
    for (const [relation, items] of Object.entries(message.relation)) {
      addEvidence(evidence, items, relation);
    }
  }
  return evidence;
};

const addEvidence = (
  evidence: RetractionEvidence[],
  value: unknown,
  relation: string
): void => {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (item === undefined || item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const labelParts = [record.label, record.type, relation]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    const rawLabel = labelParts[0] ?? relation;
    const type = markerType(labelParts.join(" | "));
    if (type === undefined) {
      continue;
    }
    evidence.push({
      type,
      doi: doiFromEvidence(record),
      date: dateFromRecord(record),
      source: traceableSource(record.source),
      raw_label: rawLabel
    });
  }
};

const doiFromEvidence = (record: Record<string, unknown>): string | null => {
  for (const key of ["DOI", "doi", "id"]) {
    if (typeof record[key] === "string") {
      const doi = normalizeDoi(record[key]);
      if (doi !== undefined) return doi;
    }
  }
  return null;
};

const traceableSource = (value: unknown): string | null =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= 200 &&
  !/^https?:\/\//i.test(value.trim())
    ? value.trim()
    : null;

const markerType = (value: string): RetractionEvidence["type"] | undefined => {
  const normalized = value.toLowerCase();
  if (/(?:retract|withdraw)/.test(normalized)) {
    return "retracted";
  }
  if (/(?:expression[ _-]*of[ _-]*concern|concern)/.test(normalized)) {
    return "expression_of_concern";
  }
  if (/(?:correct|update|errat)/.test(normalized)) {
    return "corrected_or_updated";
  }
  return undefined;
};

const dateFromRecord = (record: Record<string, unknown>): string | null => {
  for (const key of ["updated", "published", "created"]) {
    const candidate = record[key];
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const parsed = datePartsSchema.safeParse(candidate);
    const parts = parsed.success ? parsed.data["date-parts"][0] : undefined;
    if (parts === undefined) {
      continue;
    }
    const [year, month, day] = parts;
    if (year === undefined) {
      continue;
    }
    return [String(year).padStart(4, "0"), month === undefined ? undefined : String(month).padStart(2, "0"), day === undefined ? undefined : String(day).padStart(2, "0")]
      .filter((part): part is string => part !== undefined)
      .join("-");
  }
  return null;
};

const classifyEvidence = (evidence: RetractionEvidence[]): RetractionStatus => {
  if (evidence.some(({ type }) => type === "retracted")) {
    return "retracted";
  }
  if (evidence.some(({ type }) => type === "expression_of_concern")) {
    return "expression_of_concern";
  }
  if (evidence.some(({ type }) => type === "corrected_or_updated")) {
    return "corrected_or_updated";
  }
  return "no_retraction_record_found";
};

interface ParsedCitation {
  title?: string;
  firstAuthor?: string;
  year?: string;
}

const parseCitation = (citation: string): ParsedCitation => {
  const segments = citation.split(".").map((segment) => segment.trim()).filter(Boolean);
  const firstAuthor = segments[0]?.split(/\s+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, "");
  const title = segments.length >= 2 ? segments[1] : undefined;
  const year = /(?:^|\D)((?:1[6-9]|20)\d{2})(?:\D|$)/.exec(citation)?.[1];
  return {
    ...(title === undefined ? {} : { title }),
    ...(firstAuthor === undefined || firstAuthor.length === 0 ? {} : { firstAuthor }),
    ...(year === undefined ? {} : { year })
  };
};

const citationMatches = (candidate: CrossrefCandidate, citation: ParsedCitation): boolean =>
  candidate.title !== undefined &&
  candidate.first_author !== undefined &&
  candidate.year !== undefined &&
  citation.title !== undefined &&
  citation.firstAuthor !== undefined &&
  citation.year !== undefined &&
  titleSimilarity(candidate.title, citation.title) >= TITLE_SIMILARITY_THRESHOLD &&
  normalizeText(candidate.first_author) === normalizeText(citation.firstAuthor) &&
  candidate.year === citation.year;

const titleSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
};

const tokenize = (value: string): string[] => normalizeText(value).split(" ").filter(Boolean);
const normalizeText = (value: string): string => value
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

type CrossrefFailureCode =
  | "crossref_input_invalid"
  | "crossref_identifier_invalid"
  | "crossref_response_invalid"
  | "crossref_record_not_found"
  | "crossref_rate_limited"
  | "crossref_access_denied"
  | "crossref_upstream_unavailable"
  | "crossref_request_failed";

const crossrefFailure = (error: unknown): CrossrefFailureCode => {
  if (error instanceof CrossrefResponseError || (error instanceof Error && error.message === "Invalid upstream JSON response")) {
    return "crossref_response_invalid";
  }
  const status = httpStatus(error);
  if (status === 404) return "crossref_record_not_found";
  if (status === 429) return "crossref_rate_limited";
  if (status === 401 || status === 403) return "crossref_access_denied";
  if (status !== undefined && status >= 500) return "crossref_upstream_unavailable";
  return "crossref_request_failed";
};

const failureDetails = (code: CrossrefFailureCode): { accessStatus: AccessStatus; message: string; retryable: boolean; httpStatus?: number } => {
  if (code === "crossref_record_not_found") return { accessStatus: "not_found", message: "Crossref DOI record was not found", retryable: false, httpStatus: 404 };
  if (code === "crossref_rate_limited") return { accessStatus: "rate_limited", message: "Crossref rate limit reached", retryable: true, httpStatus: 429 };
  if (code === "crossref_access_denied") return { accessStatus: "inaccessible", message: "Crossref access denied", retryable: false };
  if (code === "crossref_upstream_unavailable") return { accessStatus: "error", message: "Crossref upstream service unavailable", retryable: true };
  if (code === "crossref_response_invalid") return { accessStatus: "error", message: "Crossref response was invalid", retryable: false };
  if (code === "crossref_identifier_invalid") return { accessStatus: "error", message: "Crossref DOI identifier is invalid", retryable: false };
  return { accessStatus: "error", message: "Crossref request failed", retryable: false };
};

const resolveErrorEnvelope = (
  code: CrossrefFailureCode,
  doi?: string
): ProvenanceEnvelope<ResolveDoiData> => {
  const details = failureDetails(code);
  return errorEnvelope({
    provider: "crossref",
    recordType: "doi_resolution",
    ...(doi === undefined ? {} : { primaryIdentifier: doi }),
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: [UNKNOWN_LIMITATION],
    code,
    message: details.message,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: { resolved_doi: null, candidates: [] }
  }) as ProvenanceEnvelope<ResolveDoiData>;
};

const retractionErrorEnvelope = (
  code: CrossrefFailureCode,
  doi?: string
): ProvenanceEnvelope<RetractionStatusData> => {
  const details = failureDetails(code);
  return errorEnvelope({
    provider: "crossref",
    recordType: "retraction_status",
    ...(doi === undefined ? {} : { primaryIdentifier: doi }),
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: [UNKNOWN_LIMITATION],
    code,
    message: details.message,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: { doi: doi ?? null, status: "unknown", evidence: [], sources_checked: ["crossref"] }
  }) as ProvenanceEnvelope<RetractionStatusData>;
};

const httpStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) return undefined;
  const match = /^Upstream request failed with status (\d{3})$/.exec(error.message);
  return match === null ? undefined : Number(match[1]);
};

class CrossrefResponseError extends Error {}
