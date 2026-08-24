import { createHash } from "node:crypto";

import {
  errorEnvelope,
  okEnvelope,
  publicationIntegrityEventSchema,
  type AccessStatus,
  type PublicationIntegrityAssertion,
  type PublicationIntegrityEvent,
  type PublicationRecordState,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import { fetchJson } from "./http.js";
import { normalizeDoiIdentifier } from "./doi.js";

const WORKS_URL = "https://api.crossref.org/works";
const CITATION_ROWS = 5;
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
  label: z.string().optional(),
  reason: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  ID: z.union([z.string(), z.number()]).optional(),
  "record-id": z.union([z.string(), z.number()]).optional(),
  record_id: z.union([z.string(), z.number()]).optional()
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
  label: z.string().optional(),
  reason: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  ID: z.union([z.string(), z.number()]).optional(),
  "record-id": z.union([z.string(), z.number()]).optional(),
  record_id: z.union([z.string(), z.number()]).optional()
}).passthrough().refine((value) => value.DOI !== undefined || value.doi !== undefined || value.id !== undefined);
const configSchema = z.object({
  mailto: z.string().trim().email().max(200)
}).strict();

type Message = z.infer<typeof crossrefMessageSchema>;
type Direction = "inbound" | "outbound";
type MarkerType = Exclude<RetractionStatus, "no_retraction_record_found" | "unknown">;

const relationDirections: Record<string, Direction> = {
  "is-retracted-by": "inbound",
  "is-withdrawn-by": "inbound",
  "is-expression-of-concern-by": "inbound",
  "is-corrected-by": "inbound",
  "is-updated-by": "inbound",
  "is-reinstated-by": "inbound",
  "is-retraction-of": "outbound",
  "is-withdrawal-of": "outbound",
  "is-expression-of-concern-of": "outbound",
  "is-correction-of": "outbound",
  "is-update-of": "outbound",
  "is-reinstatement-of": "outbound"
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
export interface CrossrefPublicationIntegrityData {
  doi: string | null;
  record_state: PublicationRecordState;
  events: PublicationIntegrityEvent[];
  sources_checked: ["crossref"];
}

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
  const integrity = await checkCrossrefPublicationIntegrity(identifier, config);
  const evidence = legacyEvidenceFromEvents(integrity.data.events);
  const status = legacyStatusFromIntegrity(
    integrity.data.record_state,
    integrity.data.events
  );
  return {
    ...integrity,
    record_type: "retraction_status",
    data: {
      doi: integrity.data.doi,
      status,
      evidence,
      sources_checked: ["crossref"]
    }
  };
}

export async function checkCrossrefPublicationIntegrity(
  identifier: string,
  config: CrossrefConfig
): Promise<ProvenanceEnvelope<CrossrefPublicationIntegrityData>> {
  const normalized = normalizeDoi(identifier);
  if (normalized === undefined) return integrityErrorEnvelope("crossref_identifier_invalid");
  const parsedConfig = configSchema.safeParse(config);
  if (!parsedConfig.success) return integrityErrorEnvelope("crossref_configuration_invalid", normalized);
  try {
    const work = await fetchWork(normalized, parsedConfig.data);
    const events = collectPublicationIntegrityEvents(work, normalized);
    const recordState = derivePublicationRecordState(events, normalized);
    const hasOutboundOnlyMarkers =
      events.length > 0 &&
      !events.some((event) =>
        event.assertions.some((assertion) => assertion.relation_direction === "inbound")
      );
    return okEnvelope({
      provider: "crossref", recordType: "publication_integrity", primaryIdentifier: normalized,
      sourceIdentity: sourceIdentity(work, normalized), accessStatus: "metadata_only",
      limitations: recordState === "no_update_marker_found"
        ? [hasOutboundOnlyMarkers ? OUTBOUND_MARKER_LIMITATION : NO_MARKER_LIMITATION]
        : [],
      pagination: { exhausted: true }, returned: 1,
      data: { doi: normalized, record_state: recordState, events, sources_checked: ["crossref"] }
    });
  } catch (error) {
    return integrityErrorEnvelope(crossrefFailure(error), normalized);
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

interface RawIntegrityAssertion {
  eventKind: PublicationIntegrityEvent["event_kind"];
  eventDate: string | null;
  originalDoi: string;
  noticeDoi: string | null;
  reasons: string[];
  assertion: PublicationIntegrityAssertion;
}

const collectPublicationIntegrityEvents = (
  message: Message,
  queriedDoi: string
): PublicationIntegrityEvent[] => {
  const assertions: RawIntegrityAssertion[] = [];
  addUpdateAssertions(assertions, message["update-to"], "update-to", "outbound", queriedDoi);
  addUpdateAssertions(assertions, message["updated-by"], "updated-by", "inbound", queriedDoi);
  if (message.relation !== undefined) {
    const relation = message.relation as Record<string, unknown>;
    for (const [key, value] of Object.entries(relation)) {
      const direction = relationDirections[key];
      if (direction !== undefined) {
        addRelationAssertions(assertions, value, key, direction, queriedDoi);
      }
    }
  }

  const grouped = new Map<string, RawIntegrityAssertion[]>();
  for (const item of assertions) {
    const key = JSON.stringify([
      item.eventKind,
      item.eventDate,
      item.originalDoi,
      item.noticeDoi
    ]);
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }

  const events = [...grouped.values()].map((group) => {
    const first = group[0]!;
    const uniqueAssertions = [...new Map(
      group.map((item) => [item.assertion.assertion_hash, item.assertion])
    ).values()].sort((left, right) => left.assertion_hash.localeCompare(right.assertion_hash));
    const reasons = [...new Set(group.flatMap((item) => item.reasons))].sort();
    const eventHash = sha256(JSON.stringify({
      event_kind: first.eventKind,
      event_date: first.eventDate,
      original_doi: first.originalDoi,
      notice_doi: first.noticeDoi,
      reasons,
      assertion_hashes: uniqueAssertions.map((assertion) => assertion.assertion_hash)
    }));
    return {
      sequence: 0,
      event_kind: first.eventKind,
      event_date: first.eventDate,
      original_doi: first.originalDoi,
      notice_doi: first.noticeDoi,
      reasons,
      assertions: uniqueAssertions,
      event_hash: eventHash
    };
  });

  events.sort(compareIntegrityEvents);
  return events.map((event, sequence) =>
    publicationIntegrityEventSchema.parse({ ...event, sequence })
  );
};

const addUpdateAssertions = (
  target: RawIntegrityAssertion[],
  value: unknown,
  relationType: string,
  direction: Direction,
  queriedDoi: string
): void => {
  if (value === undefined) return;
  for (const record of z.array(updateMarkerSchema).parse(value)) {
    addIntegrityAssertion(target, record, relationType, direction, queriedDoi);
  }
};

const addRelationAssertions = (
  target: RawIntegrityAssertion[],
  value: unknown,
  relationType: string,
  direction: Direction,
  queriedDoi: string
): void => {
  for (const record of z.array(relationMarkerSchema).parse(value)) {
    addIntegrityAssertion(target, record, relationType, direction, queriedDoi);
  }
};

const addIntegrityAssertion = (
  target: RawIntegrityAssertion[],
  record: Record<string, unknown>,
  relationType: string,
  direction: Direction,
  queriedDoi: string
): void => {
  const linkedDoi = doiFromEvidence(record);
  if (linkedDoi === null) throw new CrossrefResponseError();
  const providerDescription = [
    typeof record.label === "string" ? record.label : "",
    typeof record.type === "string" ? record.type : ""
  ].filter((value) => value.length > 0).join(" | ");
  const eventKind = publicationEventKind(
    providerDescription.length > 0 ? providerDescription : relationType
  );
  const eventDate = dateFromRecord(record);
  const rawType = typeof record.type === "string" && record.type.trim().length > 0
    ? record.type.trim()
    : relationType;
  const rawLabel = typeof record.label === "string" && record.label.trim().length > 0
    ? record.label.trim()
    : null;
  const rawSource = traceableSource(record.source);
  const assertionCore = {
    provider: "crossref" as const,
    assertion_source: assertionSource(rawSource),
    raw_source: rawSource,
    relation_direction: direction,
    provider_record_id: providerRecordId(record),
    raw_relation_type: relationType,
    raw_type: rawType,
    raw_label: rawLabel,
    asserted_at: eventDate === null ? null : dateToTimestamp(eventDate)
  };
  const assertion = {
    ...assertionCore,
    assertion_hash: sha256(JSON.stringify(assertionCore))
  } satisfies PublicationIntegrityAssertion;
  target.push({
    eventKind,
    eventDate,
    originalDoi: direction === "inbound" ? queriedDoi : linkedDoi,
    noticeDoi: direction === "inbound" ? linkedDoi : queriedDoi,
    reasons: reasonsFromRecord(record),
    assertion
  });
};

const compareIntegrityEvents = (
  left: Omit<PublicationIntegrityEvent, "sequence">,
  right: Omit<PublicationIntegrityEvent, "sequence">
): number => {
  if (left.event_date === null && right.event_date !== null) return 1;
  if (left.event_date !== null && right.event_date === null) return -1;
  return (left.event_date ?? "").localeCompare(right.event_date ?? "") ||
    left.event_kind.localeCompare(right.event_kind) ||
    left.original_doi.localeCompare(right.original_doi) ||
    (left.notice_doi ?? "").localeCompare(right.notice_doi ?? "");
};

const derivePublicationRecordState = (
  events: PublicationIntegrityEvent[],
  queriedDoi: string
): PublicationRecordState => {
  const inbound = events.filter((event) =>
    event.original_doi === queriedDoi &&
    event.assertions.some((assertion) => assertion.relation_direction === "inbound")
  );
  if (inbound.length === 0) return "no_update_marker_found";
  if (inbound.some((event) => event.event_date === null) && inbound.length > 1) {
    return "state_uncertain";
  }
  const latestDate = inbound.at(-1)!.event_date;
  const latest = inbound.filter((event) => event.event_date === latestDate);
  const latestKinds = new Set(latest.map((event) => event.event_kind));
  if (latestKinds.size !== 1) return "state_uncertain";
  const kind = latest[0]!.event_kind;
  if (kind === "retraction" || kind === "withdrawal") return "active_retraction_or_withdrawal";
  if (kind === "expression_of_concern") return "expression_of_concern_recorded";
  if (kind === "correction") return "correction_recorded";
  if (kind === "update") return "update_recorded";
  if (kind === "reinstatement") return "reinstatement_recorded";
  return "other_update_recorded";
};

const legacyEvidenceFromEvents = (events: PublicationIntegrityEvent[]): RetractionEvidence[] =>
  events.flatMap((event) => event.assertions.flatMap((assertion) => {
    const type = legacyMarkerType([
      assertion.raw_label,
      assertion.raw_type,
      assertion.raw_relation_type
    ].filter((value): value is string => value !== null).join(" | "));
    if (type === undefined) return [];
    return [{
      type,
      doi: assertion.relation_direction === "inbound" ? event.notice_doi : event.original_doi,
      date: event.event_date,
      source: assertion.raw_source,
      raw_label: `${assertion.raw_relation_type} | ${assertion.relation_direction}${
        assertion.raw_label === null ? "" : ` | ${assertion.raw_label}`
      }`
    }];
  }));

const legacyStatusFromIntegrity = (
  recordState: PublicationRecordState,
  events: PublicationIntegrityEvent[]
): RetractionStatus => {
  const inbound = events.flatMap((event) => event.assertions.flatMap((assertion) => {
    if (assertion.relation_direction !== "inbound") return [];
    const type = legacyMarkerType([
      assertion.raw_label,
      assertion.raw_type,
      assertion.raw_relation_type
    ].filter((value): value is string => value !== null).join(" | "));
    return type === undefined ? [] : [type];
  }));
  if (inbound.includes("retracted")) return "retracted";
  if (inbound.includes("expression_of_concern")) return "expression_of_concern";
  if (inbound.includes("corrected_or_updated")) return "corrected_or_updated";
  if (recordState === "state_uncertain") return "unknown";
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

const normalizeDoi = normalizeDoiIdentifier;

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

const publicationEventKind = (value: string): PublicationIntegrityEvent["event_kind"] => {
  const normalized = value.toLowerCase();
  if (/(?:reinstat)/u.test(normalized)) return "reinstatement";
  if (/(?:withdraw)/u.test(normalized)) return "withdrawal";
  if (/(?:retract)/u.test(normalized)) return "retraction";
  if (/(?:expression[ _-]*of[ _-]*concern|concern)/u.test(normalized)) return "expression_of_concern";
  if (/(?:correct|errat)/u.test(normalized)) return "correction";
  if (/(?:update)/u.test(normalized)) return "update";
  return "other";
};

const legacyMarkerType = (value: string): MarkerType | undefined => {
  const normalized = value.toLowerCase();
  if (/(?:retract|withdraw)/u.test(normalized)) return "retracted";
  if (/(?:expression[ _-]*of[ _-]*concern|concern)/u.test(normalized)) return "expression_of_concern";
  if (/(?:correct|update|errat)/u.test(normalized)) return "corrected_or_updated";
  return undefined;
};

const doiFromEvidence = (record: Record<string, unknown>): string | null => {
  for (const key of ["DOI", "doi", "id"]) if (typeof record[key] === "string") {
    const doi = normalizeDoi(record[key]);
    if (doi !== undefined) return doi;
  }
  return null;
};

const assertionSource = (
  source: string | null
): PublicationIntegrityAssertion["assertion_source"] => {
  if (source === null) return "unknown";
  const normalized = source.toLowerCase().replace(/[ _-]+/gu, "-");
  if (normalized === "publisher") return "publisher";
  if (normalized === "retraction-watch") return "retraction_watch";
  return "other";
};

const providerRecordId = (record: Record<string, unknown>): string | null => {
  for (const key of ["record_id", "record-id", "ID"]) {
    const value = record[key];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const normalized = String(value).trim();
    if (normalized.length > 0 && normalized.length <= 4_000) return normalized;
  }
  return null;
};

const reasonsFromRecord = (record: Record<string, unknown>): string[] => {
  const candidates = [
    typeof record.reason === "string" ? record.reason : undefined,
    ...(Array.isArray(record.reasons)
      ? record.reasons.filter((value): value is string => typeof value === "string")
      : [])
  ];
  return [...new Set(candidates
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0 && value.length <= 4_000)
  )].slice(0, 50).sort();
};

const dateToTimestamp = (date: string): string => {
  const parts = date.split("-");
  const year = parts[0]!;
  const month = parts[1] ?? "01";
  const day = parts[2] ?? "01";
  return `${year}-${month}-${day}T00:00:00.000Z`;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
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
const integrityErrorEnvelope = (
  code: CrossrefFailureCode,
  doi?: string
): ProvenanceEnvelope<CrossrefPublicationIntegrityData> => {
  const details = failureDetails(code);
  return errorEnvelope({
    provider: "crossref",
    recordType: "publication_integrity",
    ...(doi === undefined ? {} : { primaryIdentifier: doi }),
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: [UNKNOWN_LIMITATION],
    code,
    message: details.message,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: {
      doi: doi ?? null,
      record_state: "state_uncertain",
      events: [],
      sources_checked: ["crossref"]
    }
  }) as ProvenanceEnvelope<CrossrefPublicationIntegrityData>;
};
const httpStatus = (error: unknown): number | undefined => error instanceof Error ? Number(/^Upstream request failed with status (\d{3})$/.exec(error.message)?.[1]) || undefined : undefined;
class CrossrefResponseError extends Error {}
