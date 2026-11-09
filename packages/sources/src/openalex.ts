import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import { fetchJson, isTransientTransportError, upstreamFailureDetails } from "./http.js";
import type { EuropePmcDateRange, EuropePmcRecord } from "./europe-pmc.js";

/**
 * OpenAlex, a free index of scholarly works across nearly all journals (owner answer 283a, 9 Nov 2026): the 1999 paper
 * that decided the owner's Syrian rue question sat in a journal neither PubMed nor Europe PMC indexes. AskRigor sends
 * OpenAlex the AI's search words and, when the operator set one, its own free API key; nothing about the person.
 *
 * Since 2026 OpenAlex meters use in credits: without a key, every request from one network address shares one small
 * free daily allowance (about 100 searches), and a free key has its own. A search past the allowance gets HTTP 429,
 * reported as rate_limited, never retried here, so the free allowance is never exceeded by AskRigor's own retries.
 */
const SEARCH_URL = "https://api.openalex.org/works";
export const OPENALEX_DEFAULT_PAGE_SIZE = 25;
export const OPENALEX_MAX_PAGE_SIZE = 50;
/** Abstracts longer than this are cut, so a page stays small enough for apps that read only text. */
export const OPENALEX_ABSTRACT_MAX_CHARACTERS = 2_000;
const MAX_AUTHORS = 20;
const SELECT = ["id", "doi", "title", "display_name", "publication_year", "primary_location", "open_access", "authorships",
  "cited_by_count", "ids", "abstract_inverted_index", "type"].join(",");

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000),
  dateRange: z.object({ start: dateSchema, end: dateSchema }).strict().refine(({ start, end }) => start <= end).optional(),
  pageSize: z.number().int().min(1).max(OPENALEX_MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(4_096).optional(),
  apiKey: z.string().min(1).max(200).optional()
}).strict();
const workSchema = z.object({
  id: z.string().regex(/^https:\/\/openalex\.org\/W\d+$/u),
  doi: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  publication_year: z.number().int().nullable().optional(),
  type: z.string().nullable().optional(),
  cited_by_count: z.number().int().nonnegative().nullable().optional(),
  ids: z.record(z.string(), z.unknown()).nullable().optional(),
  primary_location: z.object({
    source: z.object({ display_name: z.string().nullable().optional() }).passthrough().nullable().optional()
  }).passthrough().nullable().optional(),
  open_access: z.object({
    is_oa: z.boolean().nullable().optional(),
    oa_url: z.string().nullable().optional()
  }).passthrough().nullable().optional(),
  authorships: z.array(z.object({
    author: z.object({ display_name: z.string().nullable().optional() }).passthrough().nullable().optional()
  }).passthrough()).nullable().optional(),
  abstract_inverted_index: z.record(z.string(), z.array(z.number().int().nonnegative())).nullable().optional()
}).passthrough();
const searchResponseSchema = z.object({
  meta: z.object({
    count: z.number().int().nonnegative(),
    next_cursor: z.string().min(1).nullable().optional()
  }).passthrough(),
  results: z.array(workSchema)
}).passthrough();

export interface SearchOpenAlexInput {
  query: string;
  dateRange?: EuropePmcDateRange;
  pageSize?: number;
  cursor?: string;
  /** The operator's free OpenAlex key, when set; sent only to OpenAlex, never returned or logged. */
  apiKey?: string;
}

/** A work in the Europe PMC record's fields, so results read alike; source is always OPENALEX and id the W number. */
export interface OpenAlexRecord extends EuropePmcRecord {
  source: "OPENALEX";
  /** The free copy OpenAlex knows of, when it knows one. */
  oa_url?: string;
  /** OpenAlex's kind of work: article, review, preprint, book-chapter, dissertation and so on. */
  type?: string;
  /** True when the abstract was cut at OPENALEX_ABSTRACT_MAX_CHARACTERS. */
  abstract_cut?: boolean;
}

export const OPENALEX_LIMITATIONS = [
  "OpenAlex indexes works from nearly all journals, PubMed's and Europe PMC's included, with metadata from publishers " +
    "and repositories; it holds no abstract for many papers and no full text here.",
  "A search matches titles, abstracts and, for some works, full text, and ranks by relevance; a paper whose title is " +
    "in another language or badly spaced may rank low, so search in the paper's own language too.",
  `Abstracts longer than ${OPENALEX_ABSTRACT_MAX_CHARACTERS} characters are cut (abstract_cut); read the paper for ` +
    "the rest, and for any number a claim rests on."
];

export const searchOpenAlex = async (input: SearchOpenAlexInput): Promise<ProvenanceEnvelope<OpenAlexRecord[]>> => {
  const parsedInput = searchInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error("Invalid OpenAlex search input");
  }
  const { query, dateRange, cursor, apiKey } = parsedInput.data;
  const pageSize = parsedInput.data.pageSize ?? OPENALEX_DEFAULT_PAGE_SIZE;
  const pagination = { ...(cursor === undefined ? {} : { cursor }), page_size: pageSize };
  const queryRecord = { query, ...(dateRange === undefined ? {} : { date_range: dateRange }) };

  try {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("search", query);
    url.searchParams.set("per_page", String(pageSize));
    url.searchParams.set("cursor", cursor ?? "*");
    url.searchParams.set("select", SELECT);
    if (dateRange !== undefined) {
      url.searchParams.set("filter", `from_publication_date:${dateRange.start},to_publication_date:${dateRange.end}`);
    }
    if (apiKey !== undefined) url.searchParams.set("api_key", apiKey);

    let response: unknown;
    try {
      // No retries: a 429 means the free allowance is spent, and another try would only spend more of it.
      response = await fetchJson(url.toString(), { maxRetries: 0, timeoutMs: 20_000 });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid upstream JSON response") throw new OpenAlexResponseError();
      throw error;
    }
    const parsed = searchResponseSchema.safeParse(response);
    if (!parsed.success || parsed.data.results.length > pageSize || parsed.data.results.length > parsed.data.meta.count) {
      throw new OpenAlexResponseError();
    }
    const { meta, results } = parsed.data;
    const data = results.map(normalizeWork);
    const nextCursor = meta.next_cursor ?? undefined;
    const exhausted = nextCursor === undefined || data.length === 0;
    return okEnvelope({
      provider: "openalex",
      recordType: "openalex_search_result",
      query: queryRecord,
      accessStatus: "complete",
      rawMetadata: { hit_count: meta.count },
      limitations: OPENALEX_LIMITATIONS,
      pagination: { ...pagination, ...(exhausted ? {} : { next_cursor: nextCursor }), exhausted },
      data
    });
  } catch (error) {
    return openAlexErrorEnvelope(error, { query: queryRecord, pagination: { ...pagination, exhausted: false } });
  }
};

/** An abstract from OpenAlex's inverted index (each word with its positions), in reading order. */
export function abstractFromInvertedIndex(index: Readonly<Record<string, readonly number[]>>): string {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter((word) => word !== undefined).join(" ").replace(/\s+/gu, " ").trim();
}

const stripPrefix = (value: unknown, prefix: RegExp): string | undefined => {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const stripped = value.replace(prefix, "");
  return stripped.length === 0 ? undefined : stripped;
};

const normalizeWork = (work: z.infer<typeof workSchema>): OpenAlexRecord => {
  const ids = work.ids ?? {};
  const doi = stripPrefix(work.doi ?? ids.doi, /^https?:\/\/(?:dx\.)?doi\.org\//iu);
  const pmid = stripPrefix(ids.pmid, /^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//iu)?.replace(/\/$/u, "");
  const pmcid = stripPrefix(ids.pmcid, /^https?:\/\/(?:www\.)?ncbi\.nlm\.nih\.gov\/pmc\/articles\//iu)?.replace(/\/$/u, "");
  const title = work.title ?? work.display_name ?? undefined;
  const journal = work.primary_location?.source?.display_name ?? undefined;
  const authors = (work.authorships ?? []).flatMap(({ author }) =>
    typeof author?.display_name === "string" && author.display_name.length > 0 ? [author.display_name] : [])
    .slice(0, MAX_AUTHORS);
  const fullAbstract = work.abstract_inverted_index === undefined || work.abstract_inverted_index === null
    ? "" : abstractFromInvertedIndex(work.abstract_inverted_index);
  const cut = fullAbstract.length > OPENALEX_ABSTRACT_MAX_CHARACTERS;
  const abstractText = cut ? `${fullAbstract.slice(0, OPENALEX_ABSTRACT_MAX_CHARACTERS).trimEnd()}…` : fullAbstract;
  const oaUrl = work.open_access?.oa_url ?? undefined;
  return {
    source: "OPENALEX",
    id: work.id.replace("https://openalex.org/", ""),
    ...(pmid === undefined || !/^\d+$/u.test(pmid) ? {} : { pmid }),
    ...(pmcid === undefined || !/^PMC\d+$/u.test(pmcid) ? {} : { pmcid }),
    ...(doi === undefined ? {} : { doi }),
    ...(title === undefined || title.length === 0 ? {} : { title }),
    ...(abstractText.length === 0 ? {} : { abstractText }),
    ...(cut ? { abstract_cut: true } : {}),
    ...(authors.length === 0 ? {} : { authors }),
    ...(journal === undefined || journal.length === 0 ? {} : { journal }),
    ...(work.publication_year === undefined || work.publication_year === null ? {} : { year: String(work.publication_year) }),
    ...(work.cited_by_count === undefined || work.cited_by_count === null ? {} : { cited_by: work.cited_by_count }),
    ...(work.open_access?.is_oa === undefined || work.open_access.is_oa === null ? {} : { is_open_access: work.open_access.is_oa }),
    ...(oaUrl === undefined || oaUrl.length === 0 ? {} : { oa_url: oaUrl }),
    ...(work.type === undefined || work.type === null || work.type.length === 0 ? {} : { type: work.type })
  };
};

interface OpenAlexErrorContext {
  query: { query: string; date_range?: EuropePmcDateRange };
  pagination: { cursor?: string; page_size: number; exhausted: boolean };
}

const openAlexErrorEnvelope = (error: unknown, context: OpenAlexErrorContext): ProvenanceEnvelope<OpenAlexRecord[]> => {
  const status = httpStatus(error);
  let accessStatus: AccessStatus = "error";
  let code = "openalex_request_failed";
  let message = "OpenAlex request failed";
  let retryable = false;
  if (error instanceof OpenAlexResponseError) {
    code = "openalex_response_invalid";
    message = "OpenAlex response was invalid";
  } else if (status === 429) {
    accessStatus = "rate_limited";
    code = "openalex_rate_limited";
    message = "OpenAlex's free daily allowance for AskRigor is used up, or requests came too fast";
    retryable = true;
  } else if (status === 401 || status === 403) {
    accessStatus = "inaccessible";
    code = "openalex_access_denied";
    message = "OpenAlex refused access";
  } else if (status !== undefined && status >= 500) {
    code = "openalex_upstream_unavailable";
    message = "OpenAlex upstream service unavailable";
    retryable = true;
  } else if (status === undefined && isTransientTransportError(error)) {
    code = "openalex_unreachable";
    message = "OpenAlex did not respond (a timeout or a dropped connection)";
    retryable = true;
  }
  return errorEnvelope({
    provider: "openalex",
    recordType: "openalex_search_result",
    query: context.query,
    pagination: context.pagination,
    returned: 0,
    accessStatus,
    code,
    message,
    ...(status === undefined ? {} : { httpStatus: status }),
    retryable,
    failureKind: upstreamFailureDetails(error).failure_kind,
    data: []
  }) as ProvenanceEnvelope<OpenAlexRecord[]>;
};

const httpStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) return undefined;
  const match = /^Upstream request failed with status (\d{3})$/.exec(error.message);
  return match === null ? undefined : Number(match[1]);
};

class OpenAlexResponseError extends Error {}
