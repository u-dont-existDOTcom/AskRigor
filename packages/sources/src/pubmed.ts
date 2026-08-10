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
  const requestedPageSize = Math.min(
    parsedInput.data.pageSize ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  const retstart = parseCursor(cursor);
  const pageSize = Math.min(requestedPageSize, PUBMED_ESEARCH_LIMIT - retstart);
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

    let response: unknown;
    try {
      response = await fetchJson(url.toString());
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid upstream JSON response") {
        throw new PubmedResponseError();
      }
      throw error;
    }
    const parsedResponse = esearchResponseSchema.safeParse(response);
    if (!parsedResponse.success) {
      throw new PubmedResponseError();
    }

    const result = parsedResponse.data.esearchresult;
    const totalCount = Number(result.count);
    const responseOffset = Number(result.retstart);
    if (!Number.isSafeInteger(totalCount) || !Number.isSafeInteger(responseOffset)) {
      throw new PubmedResponseError();
    }

    const retrievableCount = Math.min(totalCount, PUBMED_ESEARCH_LIMIT);
    const expectedReturned = Math.min(pageSize, retrievableCount - retstart);
    if (
      responseOffset !== retstart ||
      retstart > retrievableCount ||
      result.idlist.length !== expectedReturned
    ) {
      throw new PubmedResponseError();
    }

    const data = result.idlist.map((pmid) => ({ pmid }));
    const nextOffset = retstart + data.length;
    const exhausted = nextOffset >= retrievableCount;
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

    const parsedRecord = parsePubmedRecord(await fetchText(url.toString()));
    if (parsedRecord.kind === "not_found") {
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
    const record = parsedRecord.record;
    if (record.pmid !== pmid) {
      return pubmedErrorEnvelope<PubmedRecord>(new PubmedRecordMismatchError(), {
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

  if (error instanceof PubmedRecordMismatchError) {
    code = "pubmed_record_mismatch";
    message = "PubMed returned a different record";
  } else if (error instanceof PubmedResponseError) {
    code = "pubmed_response_invalid";
    message = "PubMed response was invalid";
  } else if (status === 429) {
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

class PubmedResponseError extends Error {}

class PubmedRecordMismatchError extends Error {}

interface ParsedPubmedRecord {
  kind: "record";
  record: PubmedRecord;
}

interface PubmedRecordNotFound {
  kind: "not_found";
}

interface XmlElement {
  children: XmlNode[];
  attributes: XmlNode;
}

const parsePubmedRecord = (
  xml: string
): ParsedPubmedRecord | PubmedRecordNotFound => {
  if (XMLValidator.validate(xml) !== true) {
    throw new PubmedResponseError();
  }
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    textNodeName: "#text",
    parseTagValue: false,
    trimValues: false,
    processEntities: false,
    preserveOrder: true
  }).parse(xml) as unknown;
  const document = {
    children: asArray(parsed).flatMap((node) => {
      const value = object(node);
      return value === undefined ? [] : [value];
    }),
    attributes: {}
  };
  const recordSet = elementAt(document, "PubmedArticleSet");
  if (recordSet === undefined) {
    throw new PubmedResponseError();
  }
  const articles = elementsAt(recordSet, "PubmedArticle");
  const bookArticles = elementsAt(recordSet, "PubmedBookArticle");
  if (articles.length === 0 && bookArticles.length === 0) {
    if (elementCount(recordSet) === 0) {
      return { kind: "not_found" };
    }
    throw new PubmedResponseError();
  }
  if (articles.length + bookArticles.length !== 1) {
    throw new PubmedResponseError();
  }

  return articles.length === 1
    ? { kind: "record", record: parseArticleRecord(articles[0]!) }
    : { kind: "record", record: parseBookRecord(bookArticles[0]!) };
};

const parseArticleRecord = (article: XmlElement): PubmedRecord => {
  const citation = elementAt(article, "MedlineCitation");
  const articleData = citation === undefined ? undefined : elementAt(citation, "Article");
  if (citation === undefined || articleData === undefined) {
    throw new PubmedResponseError();
  }
  const pubmedData = elementAt(article, "PubmedData");

  const pmid = textAt(elementAt(citation, "PMID"));
  const title = textAt(elementAt(articleData, "ArticleTitle"));
  const journal = textAt(elementAt(elementAt(articleData, "Journal"), "Title"));
  const abstract = parseAbstract(elementAt(articleData, "Abstract"));
  const authors = parseAuthors(elementAt(articleData, "AuthorList"));
  const publicationTypes = valuesAt(
    elementAt(articleData, "PublicationTypeList"),
    "PublicationType"
  );
  const doi = parseDoi([
    ...articleIdsAt(pubmedData),
    ...elementsAt(articleData, "ELocationID")
  ]);
  const dates = parseArticleDates(citation, articleData, pubmedData);

  return recordFromFields({
    pmid,
    title,
    abstract,
    journal,
    dates,
    authors,
    doi,
    publicationTypes
  });
};

const parseBookRecord = (bookArticle: XmlElement): PubmedRecord => {
  const document = elementAt(bookArticle, "BookDocument");
  if (document === undefined) {
    throw new PubmedResponseError();
  }
  const book = elementAt(document, "Book");
  if (book === undefined) {
    throw new PubmedResponseError();
  }
  const pubmedData = elementAt(bookArticle, "PubmedBookData");
  const pmid = textAt(elementAt(document, "PMID"));
  const title = textAt(elementAt(document, "ArticleTitle"));
  const abstract = parseAbstract(elementAt(document, "Abstract"));
  const authors = parseAuthors(elementAt(document, "AuthorList"));
  const publicationTypes = valuesAt(document, "PublicationType");
  const doi = parseDoi([
    ...articleIdsAt(document),
    ...articleIdsAt(pubmedData),
    ...elementsAt(book, "ELocationID")
  ]);
  const dates = parseBookDates(document, book, pubmedData);

  return recordFromFields({
    pmid,
    title,
    abstract,
    dates,
    authors,
    doi,
    publicationTypes
  });
};

interface RecordFields {
  pmid?: string;
  title?: string;
  abstract?: string;
  journal?: string;
  dates: PubmedRecordDate[];
  authors: string[];
  doi?: string;
  publicationTypes: string[];
}

const recordFromFields = ({
  pmid,
  title,
  abstract,
  journal,
  dates,
  authors,
  doi,
  publicationTypes
}: RecordFields): PubmedRecord => ({
  ...(pmid === undefined ? {} : { pmid }),
  ...(title === undefined ? {} : { title }),
  ...(abstract === undefined ? {} : { abstract }),
  ...(journal === undefined ? {} : { journal }),
  ...(dates.length === 0 ? {} : { dates }),
  ...(authors.length === 0 ? {} : { authors }),
  ...(doi === undefined ? {} : { doi }),
  ...(publicationTypes.length === 0 ? {} : { publication_types: publicationTypes })
});

const parseAbstract = (abstract: XmlElement | undefined): string | undefined => {
  const sections = elementsAt(abstract, "AbstractText").flatMap((section) => {
    const text = textAt(section);
    if (text === undefined) {
      return [];
    }
    const label = attributeAt(section, "@Label");
    return [label === undefined ? text : `${label}: ${text}`];
  });
  return sections.length === 0 ? undefined : sections.join("\n");
};

const parseAuthors = (authorList: XmlElement | undefined): string[] =>
  elementsAt(authorList, "Author").flatMap((author) => {
    const collectiveName = textAt(elementAt(author, "CollectiveName"));
    if (collectiveName !== undefined) {
      return [collectiveName];
    }
    const foreName = textAt(elementAt(author, "ForeName"));
    const lastName = textAt(elementAt(author, "LastName"));
    const name = [foreName, lastName].filter((part) => part !== undefined).join(" ");
    return name.length === 0 ? [] : [name];
  });

const articleIdsAt = (parent: XmlElement | undefined): XmlElement[] =>
  elementsAt(elementAt(parent, "ArticleIdList"), "ArticleId");

const parseDoi = (values: XmlElement[]): string | undefined => {
  for (const value of values) {
    if (
      attributeAt(value, "@IdType") === "doi" ||
      attributeAt(value, "@EIdType") === "doi"
    ) {
      return textAt(value);
    }
  }
  return undefined;
};

const parseArticleDates = (
  citation: XmlElement,
  article: XmlElement,
  pubmedData: XmlElement | undefined
): PubmedRecordDate[] => {
  const dates: PubmedRecordDate[] = [];
  addDate(dates, "completed", elementAt(citation, "DateCompleted"));
  addDate(dates, "revised", elementAt(citation, "DateRevised"));
  addDate(
    dates,
    "publication",
    elementAt(elementAt(elementAt(article, "Journal"), "JournalIssue"), "PubDate")
  );

  for (const value of elementsAt(article, "ArticleDate")) {
    const dateType = attributeAt(value, "@DateType");
    if (dateType !== undefined) {
      addDate(dates, dateType.toLowerCase(), value);
    }
  }
  addHistoryDates(dates, pubmedData);
  return dates;
};

const parseBookDates = (
  document: XmlElement,
  book: XmlElement | undefined,
  pubmedData: XmlElement | undefined
): PubmedRecordDate[] => {
  const dates: PubmedRecordDate[] = [];
  addDate(dates, "revised", elementAt(document, "DateRevised"));
  addDate(dates, "publication", elementAt(book, "PubDate"));
  addHistoryDates(dates, pubmedData);
  return dates;
};

const addHistoryDates = (
  dates: PubmedRecordDate[],
  pubmedData: XmlElement | undefined
): void => {
  for (const value of elementsAt(elementAt(pubmedData, "History"), "PubMedPubDate")) {
    const status = attributeAt(value, "@PubStatus");
    if (status !== undefined) {
      addDate(dates, status, value);
    }
  }
};

const addDate = (
  dates: PubmedRecordDate[],
  type: string,
  value: XmlElement | undefined
): void => {
  const medlineDate = textAt(elementAt(value, "MedlineDate"));
  if (medlineDate !== undefined) {
    dates.push({ type, value: medlineDate });
    return;
  }
  const year = textAt(elementAt(value, "Year"));
  if (year === undefined) {
    return;
  }
  const season = textAt(elementAt(value, "Season"));
  const month = textAt(elementAt(value, "Month"));
  const day = textAt(elementAt(value, "Day"));
  const hour = textAt(elementAt(value, "Hour"));
  const minute = textAt(elementAt(value, "Minute"));
  let normalized = year;
  if (season !== undefined) {
    normalized += `-${season}`;
  } else if (month !== undefined) {
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

const valuesAt = (parent: XmlElement | undefined, name: string): string[] =>
  elementsAt(parent, name).flatMap((item) => {
    const text = textAt(item);
    return text === undefined ? [] : [text];
  });

const elementAt = (
  parent: XmlElement | undefined,
  name: string
): XmlElement | undefined => elementsAt(parent, name)[0];

const elementsAt = (
  parent: XmlElement | undefined,
  name: string
): XmlElement[] => {
  if (parent === undefined) {
    return [];
  }
  return parent.children.flatMap((node) => {
    const values = object(node)?.[name];
    if (!Array.isArray(values)) {
      return [];
    }
    return [{
      children: values.flatMap((value) => {
        const child = object(value);
        return child === undefined ? [] : [child];
      }),
      attributes: object(object(node)?.[":@"]) ?? {}
    }];
  });
};

const elementCount = (element: XmlElement): number =>
  element.children.reduce((count, node) => {
    const keys = Object.keys(node).filter((key) => key !== "#text" && key !== ":@");
    return count + keys.length;
  }, 0);

const attributeAt = (element: XmlElement, name: string): string | undefined => {
  const value = element.attributes[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const object = (value: unknown): XmlNode | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as XmlNode
    : undefined;

const asArray = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const textAt = (element: XmlElement | undefined): string | undefined => {
  if (element === undefined) {
    return undefined;
  }
  const text = textContent(element.children).replace(/\s+/g, " ").trim();
  return text.length === 0 ? undefined : text;
};

const textContent = (nodes: XmlNode[]): string =>
  nodes.map((node) => Object.entries(node).map(([name, value]) => {
    if (name === "#text") {
      return typeof value === "string" ? value : "";
    }
    if (name === ":@" || !Array.isArray(value)) {
      return "";
    }
    return textContent(value.flatMap((child) => {
      const childNode = object(child);
      return childNode === undefined ? [] : [childNode];
    }));
  }).join("")).join("");
