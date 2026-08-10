import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import { fetchJson } from "./http.js";

const SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const dateRangeSchema = z.object({
  start: dateSchema,
  end: dateSchema
}).strict().refine(({ start, end }) => start <= end);
const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000),
  dateRange: dateRangeSchema.optional(),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(4_096).optional()
}).strict();
const flagSchema = z.union([z.boolean(), z.enum(["Y", "N"])]).nullable().optional();
const providerRecordSchema = z.object({
  source: z.string().min(1),
  id: z.string().min(1),
  pmid: z.string().nullable().optional(),
  pmcid: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  authorString: z.string().nullable().optional(),
  journalTitle: z.string().nullable().optional(),
  pubYear: z.union([z.string(), z.number().int()]).nullable().optional(),
  citedByCount: z.number().int().nonnegative().nullable().optional(),
  isOpenAccess: flagSchema,
  hasFullText: flagSchema
}).passthrough();
const searchResponseSchema = z.object({
  hitCount: z.number().int().nonnegative(),
  nextCursorMark: z.string().min(1).optional(),
  resultList: z.object({
    result: z.array(providerRecordSchema)
  }).passthrough()
}).passthrough();

export interface SearchEuropePmcInput {
  query: string;
  dateRange?: EuropePmcDateRange;
  pageSize?: number;
  cursor?: string;
}

export interface EuropePmcDateRange {
  start: string;
  end: string;
}

export interface EuropePmcRecord {
  source: string;
  id: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authors?: string[];
  journal?: string;
  year?: string;
  cited_by?: number;
  is_open_access?: boolean;
  has_full_text?: boolean;
}

export const searchEuropePmc = async (
  input: SearchEuropePmcInput
): Promise<ProvenanceEnvelope<EuropePmcRecord[]>> => {
  const parsedInput = searchInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error("Invalid Europe PMC search input");
  }

  const { query, dateRange, cursor } = parsedInput.data;
  const pageSize = parsedInput.data.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursorMark = cursor ?? "*";
  const providerQuery = dateRange === undefined
    ? query
    : `(${query}) AND FIRST_PDATE:[${dateRange.start} TO ${dateRange.end}]`;
  const pagination = {
    ...(cursor === undefined ? {} : { cursor }),
    page_size: pageSize
  };

  try {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", providerQuery);
    url.searchParams.set("format", "json");
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("cursorMark", cursorMark);

    let response: unknown;
    try {
      response = await fetchJson(url.toString());
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid upstream JSON response") {
        throw new EuropePmcResponseError();
      }
      throw error;
    }
    const parsedResponse = searchResponseSchema.safeParse(response);
    if (!parsedResponse.success) {
      throw new EuropePmcResponseError();
    }

    const { hitCount, nextCursorMark, resultList } = parsedResponse.data;
    const data = resultList.result.map(normalizeRecord);
    if (data.length > pageSize || data.length > hitCount) {
      throw new EuropePmcResponseError();
    }

    const exhausted = data.length === 0 ||
      nextCursorMark === undefined || nextCursorMark === cursorMark;

    return okEnvelope({
      provider: "europe_pmc",
      recordType: "europe_pmc_search_result",
      query: {
        query,
        ...(dateRange === undefined ? {} : { date_range: dateRange })
      },
      accessStatus: "complete",
      rawMetadata: { hit_count: hitCount },
      pagination: {
        ...pagination,
        ...(!exhausted && nextCursorMark !== undefined
          ? { next_cursor: nextCursorMark }
          : {}),
        exhausted
      },
      data
    });
  } catch (error) {
    return europePmcErrorEnvelope(error, {
      query: {
        query,
        ...(dateRange === undefined ? {} : { date_range: dateRange })
      },
      pagination: { ...pagination, exhausted: false }
    });
  }
};

const normalizeRecord = (record: z.infer<typeof providerRecordSchema>): EuropePmcRecord => {
  const recordAuthors = authors(record.authorString);

  return {
    source: record.source,
    id: record.id,
    ...definedString("pmid", record.pmid),
    ...definedString("pmcid", record.pmcid),
    ...definedString("doi", record.doi),
    ...definedString("title", record.title),
    ...(recordAuthors === undefined ? {} : { authors: recordAuthors }),
    ...definedString("journal", record.journalTitle),
    ...(record.pubYear === undefined || record.pubYear === null
      ? {}
      : { year: String(record.pubYear) }),
    ...(record.citedByCount === undefined || record.citedByCount === null
      ? {}
      : { cited_by: record.citedByCount }),
    ...definedFlag("is_open_access", record.isOpenAccess),
    ...definedFlag("has_full_text", record.hasFullText)
  };
};

const definedString = <T extends string>(
  key: T,
  value: string | null | undefined
): Partial<Record<T, string>> =>
  value === undefined || value === null || value.length === 0 ? {} : { [key]: value } as Record<T, string>;

const authors = (value: string | null | undefined): string[] | undefined => {
  if (value === undefined || value === null || value.length === 0) {
    return undefined;
  }

  const parsed = value.split(",").map((author) => author.trim()).filter(Boolean);
  return parsed.length === 0 ? undefined : parsed;
};

const definedFlag = <T extends string>(
  key: T,
  value: boolean | "Y" | "N" | null | undefined
): Partial<Record<T, boolean>> =>
  value === undefined || value === null
    ? {}
    : { [key]: value === true || value === "Y" } as Record<T, boolean>;

interface EuropePmcErrorContext {
  query: {
    query: string;
    date_range?: EuropePmcDateRange;
  };
  pagination: {
    cursor?: string;
    page_size: number;
    exhausted: boolean;
  };
}

const europePmcErrorEnvelope = (
  error: unknown,
  context: EuropePmcErrorContext
): ProvenanceEnvelope<EuropePmcRecord[]> => {
  const status = httpStatus(error);
  let accessStatus: AccessStatus = "error";
  let code = "europe_pmc_request_failed";
  let message = "Europe PMC request failed";
  let retryable = false;

  if (error instanceof EuropePmcResponseError) {
    code = "europe_pmc_response_invalid";
    message = "Europe PMC response was invalid";
  } else if (status === 429) {
    accessStatus = "rate_limited";
    code = "europe_pmc_rate_limited";
    message = "Europe PMC rate limit reached";
    retryable = true;
  } else if (status === 401 || status === 403) {
    accessStatus = "inaccessible";
    code = "europe_pmc_access_denied";
    message = "Europe PMC access denied";
  } else if (status !== undefined && status >= 500) {
    code = "europe_pmc_upstream_unavailable";
    message = "Europe PMC upstream service unavailable";
    retryable = true;
  }

  return errorEnvelope({
    provider: "europe_pmc",
    recordType: "europe_pmc_search_result",
    query: context.query,
    pagination: context.pagination,
    returned: 0,
    accessStatus,
    code,
    message,
    ...(status === undefined ? {} : { httpStatus: status }),
    retryable,
    data: []
  }) as ProvenanceEnvelope<EuropePmcRecord[]>;
};

const httpStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = /^Upstream request failed with status (\d{3})$/.exec(error.message);
  return match === null ? undefined : Number(match[1]);
};

class EuropePmcResponseError extends Error {}
