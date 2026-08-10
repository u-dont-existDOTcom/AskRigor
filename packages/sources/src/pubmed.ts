import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

import { decodeCursor, encodeCursor } from "./cursor.js";
import { fetchJson, fetchText } from "./http.js";

const ESEARCH_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const PUBMED_ESEARCH_LIMIT = 10_000;
const ESEARCH_LIMITATION =
  "PubMed ESearch exposes only the first 10,000 results for a query; refine the query to retrieve additional records.";
const EFETCH_LIMITATION =
  "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated.";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }
);
const dateRangeSchema = z.object({
  start: dateSchema,
  end: dateSchema
}).strict().refine(({ start, end }) => start <= end);
const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000),
  dateRange: dateRangeSchema.optional(),
  pageSize: z.number().int().positive().optional(),
  cursor: z.string().min(1).max(4_096).optional()
}).strict();
const cursorSchema = z.object({
  retstart: z.number().int().min(0).max(PUBMED_ESEARCH_LIMIT - 1)
}).strict();
const pmidSchema = z.string().regex(/^[1-9]\d{0,15}$/);
const configSchema = z.object({
  tool: z.string().trim().min(1).max(200),
  email: z.string().trim().min(1).max(320),
  apiKey: z.string().optional()
}).strict();
const esearchResponseSchema = z.object({
  esearchresult: z.object({
    count: z.string().regex(/^\d+$/),
    retstart: z.string().regex(/^\d+$/),
    idlist: z.array(z.string().regex(/^[1-9]\d*$/))
  }).passthrough()
}).passthrough();

export interface PubmedConfig {
  tool: string;
  email: string;
  apiKey?: string;
}

export interface PubmedDateRange {
  start: string;
  end: string;
}

export interface SearchPubmedInput {
  query: string;
  dateRange?: PubmedDateRange;
  pageSize?: number;
  cursor?: string;
}

export interface PubmedSearchRecord {
  pmid: string;
}

export interface PubmedRecordDate {
  type: string;
  value: string;
}

export interface PubmedRecord {
  pmid?: string;
  title?: string;
  abstract?: string;
  journal?: string;
  dates?: PubmedRecordDate[];
  authors?: string[];
  doi?: string;
  publication_types?: string[];
}

export const searchPubmed = async (
  input: SearchPubmedInput,
  config: PubmedConfig
): Promise<ProvenanceEnvelope<PubmedSearchRecord[]>> => {
  const parsedInput = searchInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error("Invalid PubMed search input");
  }
  const parsedConfig = parseConfig(config);
  const { query, dateRange, cursor } = parsedInput.data;
  const pageSize = Math.min(parsedInput.data.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const retstart = parseCursor(cursor);
  const queryEnvelope = {
    query,
    ...(dateRange === undefined ? {} : { date_range: dateRange })
  };
  const pagination = {
    ...(cursor === undefined ? {} : { cursor }),
    page_size: pageSize
  };

  try {
    const url = new URL(ESEARCH_URL);
    setCommonParams(url, parsedConfig);
    url.searchParams.set("db", "pubmed");
    url.searchParams.set("term", query);
    url.searchParams.set("retmode", "json");
    url.searchParams.set("retstart", String(retstart));
    url.searchParams.set("retmax", String(pageSize));
    if (dateRange !== undefined) {
      url.searchParams.set("datetype", "pdat");
      url.searchParams.set("mindate", dateRange.start.replaceAll("-", "/"));
      url.searchParams.set("maxdate", dateRange.end.replaceAll("-", "/"));
    }

    const parsedResponse = esearchResponseSchema.safeParse(
      await fetchJson(url.toString())
    );
    if (!parsedResponse.success) {
      throw new Error("Invalid PubMed ESearch response");
    }

    const result = parsedResponse.data.esearchresult;
    const totalCount = Number(result.count);
    const responseOffset = Number(result.retstart);
    if (!Number.isSafeInteger(totalCount) || !Number.isSafeInteger(responseOffset)) {
      throw new Error("Invalid PubMed ESearch response");
    }

    const data = result.idlist.map((pmid) => ({ pmid }));
    const retrievableCount = Math.min(totalCount, PUBMED_ESEARCH_LIMIT);
    const nextOffset = responseOffset + data.length;
    const exhausted = data.length === 0 || nextOffset >= retrievableCount;
    const exceedsBoundary = totalCount > PUBMED_ESEARCH_LIMIT;

    return okEnvelope({
      provider: "pubmed",
      recordType: "pubmed_search_result",
      query: queryEnvelope,
      accessStatus: exceedsBoundary ? "partial" : "complete",
      limitations: exceedsBoundary ? [ESEARCH_LIMITATION] : [],
      rawMetadata: { total_count: totalCount },
      pagination: {
        ...pagination,
        ...(!exhausted ? { next_cursor: encodeCursor({ retstart: nextOffset }) } : {}),
        exhausted
      },
      data
    });
  } catch (error) {
    return pubmedErrorEnvelope<PubmedSearchRecord[]>(error, {
      recordType: "pubmed_search_result",
      query: queryEnvelope,
      pagination: { ...pagination, exhausted: false },
      data: []
    });
  }
};

export const fetchPubmedRecord = async (
  pmid: string,
  config: PubmedConfig
): Promise<ProvenanceEnvelope<PubmedRecord>> => {
  if (!pmidSchema.safeParse(pmid).success) {
    throw new Error("Invalid PubMed PMID");
  }
  const parsedConfig = parseConfig(config);

  try {
    const url = new URL(EFETCH_URL);
    setCommonParams(url, parsedConfig);
    url.searchParams.set("db", "pubmed");
    url.searchParams.set("id", pmid);
    url.searchParams.set("retmode", "xml");

    const record = parsePubmedRecord(await fetchText(url.toString()));
    if (record === undefined || record.pmid !== pmid) {
      return errorEnvelope({
        provider: "pubmed",
        recordType: "pubmed_record",
        primaryIdentifier: pmid,
        sourceIdentity: {
          canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        },
        pagination: { exhausted: true },
        returned: 0,
        accessStatus: "not_found",
        limitations: [EFETCH_LIMITATION],
        code: "pubmed_record_not_found",
        message: "PubMed record not found",
        httpStatus: 404,
        retryable: false,
        data: {}
      }) as ProvenanceEnvelope<PubmedRecord>;
    }

    return okEnvelope({
      provider: "pubmed",
      recordType: "pubmed_record",
      primaryIdentifier: pmid,
      sourceIdentity: {
        canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        ...(record.title === undefined ? {} : { title: record.title }),
        ...(record.authors === undefined
          ? {}
          : { authors_or_channel: record.authors })
      },
      pagination: { exhausted: true },
      returned: 1,
      accessStatus: "api_visible_complete",
      limitations: [EFETCH_LIMITATION],
      data: record
    });
  } catch (error) {
    return pubmedErrorEnvelope<PubmedRecord>(error, {
      recordType: "pubmed_record",
      primaryIdentifier: pmid,
      sourceIdentity: {
        canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      },
      pagination: { exhausted: false },
      limitations: [EFETCH_LIMITATION],
      data: {}
    });
  }
};

const parseConfig = (config: PubmedConfig): PubmedConfig => {
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error("Invalid PubMed configuration");
  }
  return parsed.data;
};

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = cursorSchema.safeParse(decodeCursor(cursor));
    if (!parsed.success) {
      throw new Error("Invalid cursor payload");
    }
    return parsed.data.retstart;
  } catch {
    throw new Error("Invalid PubMed cursor");
  }
};

const setCommonParams = (url: URL, config: PubmedConfig): void => {
  url.searchParams.set("tool", config.tool);
  url.searchParams.set("email", config.email);
  if (config.apiKey !== undefined && config.apiKey.length > 0) {
    url.searchParams.set("api_key", config.apiKey);
  }
};

interface PubmedErrorContext<T> {
  recordType: string;
  primaryIdentifier?: string;
  query?: unknown;
  sourceIdentity?: {
    canonical_url?: string;
    title?: string;
    authors_or_channel?: string[];
  };
  pagination: {
    cursor?: string;
    page_size?: number;
    exhausted?: boolean;
  };
  limitations?: string[];
  data: T;
}

const pubmedErrorEnvelope = <T>(
  error: unknown,
  context: PubmedErrorContext<T>
): ProvenanceEnvelope<T> => {
  const status = httpStatus(error);
  let accessStatus: AccessStatus = "error";
  let code = "pubmed_request_failed";
  let message = "PubMed request failed";
  let retryable = false;

  if (status === 429) {
    accessStatus = "rate_limited";
    code = "pubmed_rate_limited";
    message = "PubMed rate limit reached";
    retryable = true;
  } else if (status === 401 || status === 403) {
    accessStatus = "inaccessible";
    code = "pubmed_access_denied";
    message = "PubMed access denied";
  } else if (status !== undefined && status >= 500) {
    code = "pubmed_upstream_unavailable";
    message = "PubMed upstream service unavailable";
    retryable = true;
  }

  return errorEnvelope({
    provider: "pubmed",
    recordType: context.recordType,
    ...(context.primaryIdentifier === undefined
      ? {}
      : { primaryIdentifier: context.primaryIdentifier }),
    ...(context.query === undefined ? {} : { query: context.query }),
    ...(context.sourceIdentity === undefined
      ? {}
      : { sourceIdentity: context.sourceIdentity }),
    pagination: context.pagination,
    returned: 0,
    accessStatus,
    limitations: context.limitations ?? [],
    code,
    message,
    ...(status === undefined ? {} : { httpStatus: status }),
    retryable,
    data: context.data
  }) as ProvenanceEnvelope<T>;
};

const httpStatus = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = /^Upstream request failed with status (\d{3})$/.exec(error.message);
  return match === null ? undefined : Number(match[1]);
};

type XmlNode = Record<string, unknown>;

const parsePubmedRecord = (xml: string): PubmedRecord | undefined => {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("Invalid PubMed EFetch response");
  }
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    textNodeName: "#text",
    parseTagValue: false,
    trimValues: true,
    processEntities: false
  }).parse(xml) as unknown;
  const article = objectAt(objectAt(parsed, "PubmedArticleSet"), "PubmedArticle");
  if (article === undefined) {
    return undefined;
  }
  const citation = objectAt(article, "MedlineCitation");
  const articleData = objectAt(citation, "Article");
  if (citation === undefined || articleData === undefined) {
    return undefined;
  }

  const pmid = textAt(citation.PMID);
  const title = textAt(articleData.ArticleTitle);
  const journal = textAt(objectAt(articleData, "Journal")?.Title);
  const abstract = parseAbstract(objectAt(articleData, "Abstract")?.AbstractText);
  const authors = parseAuthors(objectAt(articleData, "AuthorList")?.Author);
  const publicationTypes = valuesAt(
    objectAt(articleData, "PublicationTypeList")?.PublicationType
  );
  const doi = parseDoi(
    objectAt(objectAt(article, "PubmedData"), "ArticleIdList")?.ArticleId
  );
  const dates = parseDates(citation, articleData, objectAt(article, "PubmedData"));

  return {
    ...(pmid === undefined ? {} : { pmid }),
    ...(title === undefined ? {} : { title }),
    ...(abstract === undefined ? {} : { abstract }),
    ...(journal === undefined ? {} : { journal }),
    ...(dates.length === 0 ? {} : { dates }),
    ...(authors.length === 0 ? {} : { authors }),
    ...(doi === undefined ? {} : { doi }),
    ...(publicationTypes.length === 0
      ? {}
      : { publication_types: publicationTypes })
  };
};

const parseAbstract = (value: unknown): string | undefined => {
  const sections = asArray(value).flatMap((section) => {
    const text = textAt(section);
    if (text === undefined) {
      return [];
    }
    const label = object(section)?.["@Label"];
    return [typeof label === "string" && label.length > 0 ? `${label}: ${text}` : text];
  });
  return sections.length === 0 ? undefined : sections.join("\n");
};

const parseAuthors = (value: unknown): string[] => asArray(value).flatMap((author) => {
  const authorNode = object(author);
  if (authorNode === undefined) {
    return [];
  }
  const collectiveName = textAt(authorNode.CollectiveName);
  if (collectiveName !== undefined) {
    return [collectiveName];
  }
  const foreName = textAt(authorNode.ForeName);
  const lastName = textAt(authorNode.LastName);
  const name = [foreName, lastName].filter((part) => part !== undefined).join(" ");
  return name.length === 0 ? [] : [name];
});

const parseDoi = (value: unknown): string | undefined => {
  for (const id of asArray(value)) {
    const idNode = object(id);
    if (idNode?.["@IdType"] === "doi") {
      return textAt(id);
    }
  }
  return undefined;
};

const parseDates = (
  citation: XmlNode,
  article: XmlNode,
  pubmedData: XmlNode | undefined
): PubmedRecordDate[] => {
  const dates: PubmedRecordDate[] = [];
  addDate(dates, "completed", citation.DateCompleted);
  addDate(dates, "revised", citation.DateRevised);
  addDate(dates, "publication", objectAt(objectAt(article, "Journal"), "JournalIssue")?.PubDate);

  for (const value of asArray(article.ArticleDate)) {
    const dateType = object(value)?.["@DateType"];
    if (typeof dateType === "string") {
      addDate(dates, dateType.toLowerCase(), value);
    }
  }
  for (const value of asArray(objectAt(pubmedData, "History")?.PubMedPubDate)) {
    const status = object(value)?.["@PubStatus"];
    if (typeof status === "string") {
      addDate(dates, status, value);
    }
  }
  return dates;
};

const addDate = (dates: PubmedRecordDate[], type: string, value: unknown): void => {
  const node = object(value);
  const year = textAt(node?.Year);
  if (year === undefined) {
    return;
  }
  const month = textAt(node?.Month);
  const day = textAt(node?.Day);
  const hour = textAt(node?.Hour);
  const minute = textAt(node?.Minute);
  let normalized = year;
  if (month !== undefined) {
    normalized += `-${month.padStart(2, "0")}`;
  }
  if (day !== undefined) {
    normalized += `-${day.padStart(2, "0")}`;
  }
  if (hour !== undefined) {
    normalized += `T${hour.padStart(2, "0")}:${(minute ?? "00").padStart(2, "0")}`;
  }
  dates.push({ type, value: normalized });
};

const valuesAt = (value: unknown): string[] => asArray(value).flatMap((item) => {
  const text = textAt(item);
  return text === undefined ? [] : [text];
});

const objectAt = (value: unknown, key: string): XmlNode | undefined =>
  object(object(value)?.[key]);

const object = (value: unknown): XmlNode | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as XmlNode
    : undefined;

const asArray = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const textAt = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value.length === 0 ? undefined : value;
  }
  const text = object(value)?.["#text"];
  return typeof text === "string" && text.length > 0 ? text : undefined;
};
