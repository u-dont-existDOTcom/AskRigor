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
const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/i;
const TITLE_SIMILARITY_THRESHOLD = 0.9;
const NO_MARKER_LIMITATION =
  "No inbound retraction, expression-of-concern, correction, or update marker was present in the successful Crossref metadata response; this does not prove unretracted status everywhere.";
const OUTBOUND_MARKER_LIMITATION =
  "Crossref metadata contained only outbound update markers for other works; this does not establish a retraction status for the queried DOI.";
const UNKNOWN_LIMITATION =
  "Crossref metadata was unavailable or could not be interpreted; retraction state remains unknown.";

const datePartsSchema = z.object({
  "date-parts": z.array(z.array(z.number().int().nonnegative()).min(1)).min(1)
}).passthrough();
const crossrefMessageSchema = z.object({
  DOI: z.string(),
  title: z.array(z.string()).optional(),
  author: z.array(z.object({ family: z.string().optional() }).passthrough()).optional(),
  "published-print": datePartsSchema.optional(),
  "published-online": datePartsSchema.optional(),
  issued: datePartsSchema.optional(),
  "update-to": z.unknown().optional(),
  "updated-by": z.unknown().optional(),
  relation: z.unknown().optional()
}).passthrough();
const workResponseSchema = z.object({
  status: z.literal("ok"),
  "message-type": z.literal("work"),
  message: crossrefMessageSchema
}).passthrough();
const workListResponseSchema = z.object({
  status: z.literal("ok"),
  "message-type": z.literal("work-list"),
  message: z.object({
    "total-results": z.number().int().nonnegative(),
    items: z.array(crossrefMessageSchema).max(CITATION_ROWS)
  }).passthrough()
}).passthrough();
const updateMarkerSchema = z.object({
  DOI: z.string(),
  type: z.string().trim().min(1),
  updated: datePartsSchema.optional(),
  published: datePartsSchema.optional(),
  created: datePartsSchema.optional(),
  source: z.string().optional(),
  label: z.string().optional()
}).passthrough();
const relationMarkerSchema = z.object({
  DOI: z.string().optional(),
  doi: z.string().optional(),
  id: z.string().optional(),
  type: z.string().trim().min(1).optional(),
  updated: datePartsSchema.optional(),
  published: datePartsSchema.optional(),
  created: datePartsSchema.optional(),
  source: z.string().optional(),
  label: z.string().optional()
}).passthrough().refine((value) => value.DOI !== undefined || value.doi !== undefined || value.id !== undefined);
const configSchema = z.object({
  mailto: z.string().trim().email().max(200)
}).strict();

type Message = z.infer<typeof crossrefMessageSchema>;
type Direction = "inbound" | "outbound";
type MarkerType = Exclude<RetractionStatus, "no_retraction_record_found" | "unknown">;

const relationDirections: Record<string, Direction> = {
  "is-retracted-by": "inbound",
  "is-expression-of-concern-by": "inbound",
  "is-corrected-by": "inbound",
  "is-updated-by": "inbound",
  "is-retraction-of": "outbound",
  "is-expression-of-concern-of": "outbound",
  "is-correction-of": "outbound",
  "is-update-of": "outbound"
};

export interface CrossrefConfig { mailto: string; }
export type RetractionStatus =
  | "retracted"
  | "expression_of_concern"
  | "corrected_or_updated"
  | "no_retraction_record_found"
  | "unknown";
export interface CrossrefCandidate { doi: string; title?: string; first_author?: string; year?: string; }
export interface ResolveDoiData { resolved_doi: string | null; candidates: CrossrefCandidate[]; }
export interface RetractionEvidence { type: MarkerType; doi: string | null; date: string | null; source: string | null; raw_label: string; }
export interface RetractionStatusData { doi: string | null; status: RetractionStatus; evidence: RetractionEvidence[]; sources_checked: ["crossref"]; }

interface CollectedEvidence { evidence: RetractionEvidence; direction: Direction; }

export async function resolveDoi(doiOrCitation: string, config: CrossrefConfig): Promise<ProvenanceEnvelope<ResolveDoiData>> {
  const parsedConfig = configSchema.safeParse(config);
  if (!parsedConfig.success) return resolveErrorEnvelope("crossref_configuration_invalid");
  const input = normalizeInput(doiOrCitation);
  if (input.kind === "invalid") return resolveErrorEnvelope(input.reason);

  if (input.kind === "doi") {
    try {
      const work = await fetchWork(input.doi, parsedConfig.data);
      return okEnvelope({
        provider: "crossref", recordType: "doi_resolution", primaryIdentifier: input.doi,
        sourceIdentity: sourceIdentity(work, input.doi), accessStatus: "metadata_only",
        pagination: { exhausted: true }, returned: 1,
        data: { resolved_doi: input.doi, candidates: [candidateFromMessage(work)] }
      });
    } catch (error) {
      return resolveErrorEnvelope(crossrefFailure(error), input.doi);
    }
  }

  try {
    const url = new URL(WORKS_URL);
    url.searchParams.set("query.bibliographic", input.citation);
    url.searchParams.set("rows", String(CITATION_ROWS));
    url.searchParams.set("mailto", parsedConfig.data.mailto);
    const response = workListResponseSchema.safeParse(await crossrefFetchJson(url.toString(), parsedConfig.data));
    if (!response.success) throw new CrossrefResponseError();
    const { items, totalResults } = { items: response.data.message.items, totalResults: response.data.message["total-results"] };
    if (
      items.length !== Math.min(totalResults, CITATION_ROWS) ||
      items.some((item) => normalizeDoi(item.DOI) === undefined)
    ) throw new CrossrefResponseError();
    const candidates = items.map(candidateFromMessage);
    const matches = candidates.filter((candidate) => citationMatches(candidate, parseCitation(input.citation)));
    const partial = totalResults > CITATION_ROWS;
    const exhausted = !partial;
    return okEnvelope({
      provider: "crossref", recordType: "doi_resolution",
      query: { citation: input.citation, rows: CITATION_ROWS },
      accessStatus: partial ? "partial" : "metadata_only",
      limitations: partial ? [`Crossref returned only the top ${items.length} of ${totalResults} bibliographic candidates; additional candidates were not retrieved.`] : [],
      rawMetadata: { total_results: totalResults },
      pagination: { page_size: CITATION_ROWS, exhausted }, returned: candidates.length,
      data: { resolved_doi: !partial && matches.length === 1 ? matches[0]!.doi : null, candidates }
    });
  } catch (error) {
    return resolveErrorEnvelope(crossrefFailure(error));
  }
}

export async function checkRetractionStatus(identifier: string, config: CrossrefConfig): Promise<ProvenanceEnvelope<RetractionStatusData>> {
  const normalized = normalizeDoi(identifier);
  if (normalized === undefined) return retractionErrorEnvelope("crossref_identifier_invalid");
  const parsedConfig = configSchema.safeParse(config);
  if (!parsedConfig.success) return retractionErrorEnvelope("crossref_configuration_invalid", normalized);
  try {
    const work = await fetchWork(normalized, parsedConfig.data);
    const markers = collectRetractionEvidence(work);
    const evidence = markers.map(({ evidence: item }) => item);
    const status = classifyEvidence(markers);
    const hasOutboundOnlyMarkers = markers.length > 0 && !markers.some(({ direction }) => direction === "inbound");
    return okEnvelope({
      provider: "crossref", recordType: "retraction_status", primaryIdentifier: normalized,
      sourceIdentity: sourceIdentity(work, normalized), accessStatus: "metadata_only",
      limitations: status === "no_retraction_record_found" ? [hasOutboundOnlyMarkers ? OUTBOUND_MARKER_LIMITATION : NO_MARKER_LIMITATION] : [],
      pagination: { exhausted: true }, returned: 1,
      data: { doi: normalized, status, evidence, sources_checked: ["crossref"] }
    });
  } catch (error) {
    return retractionErrorEnvelope(crossrefFailure(error), normalized);
  }
}

const fetchWork = async (doi: string, config: CrossrefConfig): Promise<Message> => {
  const url = new URL(`${WORKS_URL}/${encodeURIComponent(doi)}`);
  url.searchParams.set("mailto", config.mailto);
  const response = workResponseSchema.safeParse(await crossrefFetchJson(url.toString(), config));
  if (!response.success || normalizeDoi(response.data.message.DOI) !== doi) throw new CrossrefResponseError();
  validateMarkerContainers(response.data.message);
  return response.data.message;
};

const crossrefFetchJson = <T = unknown>(url: string, config: CrossrefConfig): Promise<T> =>
  fetchJson<T>(url, { headers: { "User-Agent": `askrigor-research/0.1.0 (mailto:${config.mailto})` } });

const validateMarkerContainers = (message: Message): void => {
  for (const key of ["update-to", "updated-by"] as const) {
    if (message[key] === undefined) continue;
    const markers = z.array(updateMarkerSchema).safeParse(message[key]);
    if (!markers.success || markers.data.some((marker) => normalizeDoi(marker.DOI) === undefined)) throw new CrossrefResponseError();
  }
  if (message.relation === undefined) return;
  const relation = z.record(z.string(), z.unknown()).safeParse(message.relation);
  if (!relation.success) throw new CrossrefResponseError();
  for (const [key, value] of Object.entries(relation.data)) {
    if (relationDirections[key] === undefined) continue;
    const markers = z.array(relationMarkerSchema).safeParse(value);
    if (!markers.success || markers.data.some((marker) => doiFromEvidence(marker) === null)) throw new CrossrefResponseError();
  }
};

const collectRetractionEvidence = (message: Message): CollectedEvidence[] => {
  const evidence: CollectedEvidence[] = [];
  addUpdateEvidence(evidence, message["update-to"], "update-to", "outbound");
  addUpdateEvidence(evidence, message["updated-by"], "updated-by", "inbound");
  if (message.relation !== undefined) {
    const relation = message.relation as Record<string, unknown>;
    for (const [key, value] of Object.entries(relation)) {
      const direction = relationDirections[key];
      if (direction !== undefined) addRelationEvidence(evidence, value, key, direction);
    }
  }
  return evidence;
};

const addUpdateEvidence = (target: CollectedEvidence[], value: unknown, container: string, direction: Direction): void => {
  if (value === undefined) return;
  for (const record of z.array(updateMarkerSchema).parse(value)) {
    const type = markerType([record.label, record.type, container].filter(Boolean).join(" | "));
    if (type !== undefined) target.push({ evidence: evidenceFromRecord(type, record, container, direction), direction });
  }
};

const addRelationEvidence = (target: CollectedEvidence[], value: unknown, container: string, direction: Direction): void => {
  for (const record of z.array(relationMarkerSchema).parse(value)) {
    const type = markerType([record.label, record.type, container].filter(Boolean).join(" | "));
    if (type !== undefined) target.push({ evidence: evidenceFromRecord(type, record, container, direction), direction });
  }
};

const evidenceFromRecord = (type: MarkerType, record: Record<string, unknown>, container: string, direction: Direction): RetractionEvidence => ({
  type,
  doi: doiFromEvidence(record),
  date: dateFromRecord(record),
  source: traceableSource(record.source),
  raw_label: `${container} | ${direction}${typeof record.label === "string" && record.label.trim().length > 0 ? ` | ${record.label.trim()}` : ""}`
});

const classifyEvidence = (evidence: CollectedEvidence[]): RetractionStatus => {
  const inbound = evidence.filter(({ direction }) => direction === "inbound").map(({ evidence: item }) => item.type);
  if (inbound.includes("retracted")) return "retracted";
  if (inbound.includes("expression_of_concern")) return "expression_of_concern";
  if (inbound.includes("corrected_or_updated")) return "corrected_or_updated";
  return "no_retraction_record_found";
};

const normalizeInput = (value: string): { kind: "doi"; doi: string } | { kind: "citation"; citation: string } | { kind: "invalid"; reason: CrossrefFailureCode } => {
  if (typeof value !== "string") return { kind: "invalid", reason: "crossref_input_invalid" };
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 5_000) return { kind: "invalid", reason: "crossref_input_invalid" };
  const doi = normalizeDoi(trimmed);
  if (doi !== undefined) return { kind: "doi", doi };
  return /^(?:doi:|https?:\/\/|10\.)/i.test(trimmed)
    ? { kind: "invalid", reason: "crossref_identifier_invalid" }
    : { kind: "citation", citation: trimmed };
};

const normalizeDoi = (value: string): string | undefined => {
  if (typeof value !== "string" || value.length > 5_000) return undefined;
  let doi = value.trim();
  if (/^doi:/i.test(doi)) doi = doi.slice(4).trim();
  else if (/^https?:\/\//i.test(doi)) {
    let url: URL;
    try { url = new URL(doi); } catch { return undefined; }
    if (url.protocol !== "https:" || !["doi.org", "www.doi.org", "dx.doi.org"].includes(url.hostname) || url.search || url.hash) return undefined;
    try { doi = decodeURIComponent(url.pathname.slice(1)); } catch { return undefined; }
  }
  const canonical = doi.toLowerCase();
  return DOI_PATTERN.test(canonical) ? canonical : undefined;
};

const candidateFromMessage = (message: Message): CrossrefCandidate => {
  const doi = normalizeDoi(message.DOI);
  if (doi === undefined) throw new CrossrefResponseError();
  const title = message.title?.find((value) => value.trim().length > 0)?.trim();
  const firstAuthor = message.author?.[0]?.family?.trim();
  const year = publicationYear(message);
  return { doi, ...(title === undefined ? {} : { title }), ...(firstAuthor === undefined || firstAuthor.length === 0 ? {} : { first_author: firstAuthor }), ...(year === undefined ? {} : { year }) };
};

const publicationYear = (message: Message): string | undefined => {
  for (const date of [message["published-print"], message["published-online"], message.issued]) {
    const year = date?.["date-parts"][0]?.[0];
    if (year !== undefined) return String(year);
  }
  return undefined;
};

const sourceIdentity = (message: Message, doi: string) => {
  const candidate = candidateFromMessage(message);
  return { canonical_url: `https://doi.org/${doi}`, ...(candidate.title === undefined ? {} : { title: candidate.title }), ...(candidate.first_author === undefined ? {} : { authors_or_channel: [candidate.first_author] }) };
};

const markerType = (value: string): MarkerType | undefined => {
  const normalized = value.toLowerCase();
  if (/(?:retract|withdraw)/.test(normalized)) return "retracted";
  if (/(?:expression[ _-]*of[ _-]*concern|concern)/.test(normalized)) return "expression_of_concern";
  if (/(?:correct|update|errat)/.test(normalized)) return "corrected_or_updated";
  return undefined;
};
const doiFromEvidence = (record: Record<string, unknown>): string | null => {
  for (const key of ["DOI", "doi", "id"]) if (typeof record[key] === "string") {
    const doi = normalizeDoi(record[key]);
    if (doi !== undefined) return doi;
  }
  return null;
};
const dateFromRecord = (record: Record<string, unknown>): string | null => {
  for (const key of ["updated", "published", "created"]) {
    const parsed = datePartsSchema.safeParse(record[key]);
    if (!parsed.success) continue;
    const [year, month, day] = parsed.data["date-parts"][0]!;
    return [String(year).padStart(4, "0"), month === undefined ? undefined : String(month).padStart(2, "0"), day === undefined ? undefined : String(day).padStart(2, "0")].filter((part): part is string => part !== undefined).join("-");
  }
  return null;
};
const traceableSource = (value: unknown): string | null => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200 && !/^https?:\/\//i.test(value.trim()) ? value.trim() : null;

interface ParsedCitation { title?: string; firstAuthor?: string; year?: string; }
const parseCitation = (citation: string): ParsedCitation => {
  const segments = citation.split(".").map((segment) => segment.trim()).filter(Boolean);
  const firstAuthor = segments[0]?.split(/\s+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, "");
  const title = segments.length >= 2 ? segments[1] : undefined;
  const year = /(?:^|\D)((?:1[6-9]|20)\d{2})(?:\D|$)/.exec(citation)?.[1];
  return { ...(title === undefined ? {} : { title }), ...(firstAuthor === undefined || firstAuthor.length === 0 ? {} : { firstAuthor }), ...(year === undefined ? {} : { year }) };
};
const citationMatches = (candidate: CrossrefCandidate, citation: ParsedCitation): boolean => candidate.title !== undefined && candidate.first_author !== undefined && candidate.year !== undefined && citation.title !== undefined && citation.firstAuthor !== undefined && citation.year !== undefined && titleSimilarity(candidate.title, citation.title) >= TITLE_SIMILARITY_THRESHOLD && normalizeText(candidate.first_author) === normalizeText(citation.firstAuthor) && candidate.year === citation.year;
const titleSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(tokenize(left)); const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / new Set([...leftTokens, ...rightTokens]).size;
};
const tokenize = (value: string): string[] => normalizeText(value).split(" ").filter(Boolean);
const normalizeText = (value: string): string => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

type CrossrefFailureCode = "crossref_input_invalid" | "crossref_identifier_invalid" | "crossref_configuration_invalid" | "crossref_response_invalid" | "crossref_record_not_found" | "crossref_rate_limited" | "crossref_access_denied" | "crossref_upstream_unavailable" | "crossref_request_failed";
const crossrefFailure = (error: unknown): CrossrefFailureCode => {
  if (error instanceof CrossrefResponseError || (error instanceof Error && error.message === "Invalid upstream JSON response")) return "crossref_response_invalid";
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
  if (code === "crossref_configuration_invalid") return { accessStatus: "error", message: "Crossref configuration is invalid", retryable: false };
  if (code === "crossref_identifier_invalid") return { accessStatus: "error", message: "Crossref DOI identifier is invalid", retryable: false };
  return { accessStatus: "error", message: "Crossref request failed", retryable: false };
};
const resolveErrorEnvelope = (code: CrossrefFailureCode, doi?: string): ProvenanceEnvelope<ResolveDoiData> => {
  const details = failureDetails(code);
  return errorEnvelope({ provider: "crossref", recordType: "doi_resolution", ...(doi === undefined ? {} : { primaryIdentifier: doi }), pagination: { exhausted: false }, returned: 0, accessStatus: details.accessStatus, limitations: [UNKNOWN_LIMITATION], code, message: details.message, ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }), retryable: details.retryable, data: { resolved_doi: null, candidates: [] } }) as ProvenanceEnvelope<ResolveDoiData>;
};
const retractionErrorEnvelope = (code: CrossrefFailureCode, doi?: string): ProvenanceEnvelope<RetractionStatusData> => {
  const details = failureDetails(code);
  return errorEnvelope({ provider: "crossref", recordType: "retraction_status", ...(doi === undefined ? {} : { primaryIdentifier: doi }), pagination: { exhausted: false }, returned: 0, accessStatus: details.accessStatus, limitations: [UNKNOWN_LIMITATION], code, message: details.message, ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }), retryable: details.retryable, data: { doi: doi ?? null, status: "unknown", evidence: [], sources_checked: ["crossref"] } }) as ProvenanceEnvelope<RetractionStatusData>;
};
const httpStatus = (error: unknown): number | undefined => error instanceof Error ? Number(/^Upstream request failed with status (\d{3})$/.exec(error.message)?.[1]) || undefined : undefined;
class CrossrefResponseError extends Error {}
