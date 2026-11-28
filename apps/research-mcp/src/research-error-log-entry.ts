import { canonicalDoiSchema } from "@askrigor/contracts";
import {
  RESEARCH_ERROR_LOG_SOURCES,
  type ResearchErrorLogApp, type ResearchErrorLogEntry, type ResearchErrorLogKind, type ResearchErrorLogShape,
  type ResearchErrorLogSource, type ResearchPaperIdentifier,
} from "@askrigor/evidence-repository";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { failedPrimaryRoutes, hasFailedFullTextAcquisition, normalizeDoiIdentifier } from "@askrigor/sources";
import { z } from "zod";
import { screenPrivateText } from "./lessons/privacy-screen.js";

const SLOW_MS = 10_000;
/** Only these fields have a known search destination that cannot use YouTube. */
const searchFields: Readonly<Record<string, string>> = {
  search_pubmed: "query",
  search_europe_pmc: "query",
  search_clinical_trials: "query",
  resolve_doi: "doi_or_citation",
  search_reddit_threads: "query",
  search_research_frontiers: "query",
};
const providerForSearch: Readonly<Record<string, ResearchErrorLogSource>> = {
  search_pubmed: "pubmed",
  search_europe_pmc: "europe_pmc",
  search_clinical_trials: "clinicaltrials_gov",
  resolve_doi: "crossref",
  search_reddit_threads: "reddit",
  search_research_frontiers: "atlas",
};
const authorizationCodes: ReadonlySet<unknown> = new Set([
  "authorization_required", "insufficient_scope", "research_access_required", "research_access_revoked",
  "dev_account_required", "free_contributor_required", "research_use_notice_required",
  "paid_private_entitlement_required", "reviewer_required", "not_authorized",
  "AUTHORIZATION_REQUIRED", "RESEARCH_ACCESS_REQUIRED", "PAID_PRIVATE_ENTITLEMENT_REQUIRED",
]);
const validationCodes: ReadonlySet<unknown> = new Set([
  "invalid_input", "invalid_arguments", "validation_error", "invalid_request", "invalid_protocol", "invalid_page",
  "bad_request", "invalid_later_inputs",
]);
const opaqueField = /(?:^|_)(?:ids?|identifiers?|keys?|urls?|links?|cursor|token|after|handle|receipt|sha256|hash|date|pmid|pmcid|doi|credentials?|headers?|password|secret|auth|bearer)(?:_|$)/iu;
const email = /[\p{L}\p{N}.!#$%&'*+/=?^_\x60{|}~-]+@[\p{L}\p{N}_.-]+/gu;
const phoneOrDigitRun = /[+\u0028]?\p{Nd}(?:[\p{Nd} ().\-\u2010-\u2014]*\p{Nd})?/gu;
const urls = /(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|tel|data|urn):|(?<!:)\/\/)[^\s<>"']+/giu;
const domains = /(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[a-z0-9-]+)(?=$|[^\p{L}\p{N}-])(?::\d+)?(?:[/?#][^\s<>"'\])}]*)?/giu;
const ipv4 = /(?<![\p{L}\p{N}])(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#][^\s<>"']*)?/gu;
const ipv6 = /\[?(?:[a-f0-9]{0,4}:){2,}[a-f0-9:.]*(?:%[\p{L}\p{N}_.-]+)?(?:\]:\d+|\])?(?:[/?#][^\s<>"']*)?/giu;
const opaqueValue = /\b(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|[a-z0-9_+\/-]{32,}={0,2})\b/giu;
const sensitiveAssignment =
  /\b(?:authorization|proxy-authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|(?:set-)?cookie|password|secret|credentials?|headers?|user-agent|x-forwarded-for|session[_-]?id|request[_-]?id|account[_-]?id|user[_-]?id)\b\s*[:=]|\bbearer\s+[a-z0-9+/_.=-]+|\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/iu;

/** Redact direct identifiers before invoking the existing reject-only privacy screen. */
export function screenFailedSearch(value: string): string | undefined {
  if (value.length > 5_000) return undefined;
  const normalized = value.normalize("NFKC");
  if (sensitiveAssignment.test(normalized)) return undefined;
  const screened = normalized.replace(urls, " ")
    .replace(opaqueValue, " ")
    .replace(email, " ")
    .replace(ipv6, " ")
    .replace(ipv4, " ")
    .replace(domains, " ")
    .replace(phoneOrDigitRun, (candidate) => (candidate.match(/\p{Nd}/gu)?.length ?? 0) >= 7 ? " " : candidate)
    .replace(/ +/gu, " ").trim();
  return screened === "" || screenPrivateText(screened) !== undefined ? undefined : screened;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function keepIdentifier(ids: ResearchPaperIdentifier[], type: string, value: unknown): void {
  if (typeof value !== "string" || value.length > 2_048 || ids.length >= 100) return;
  if (type === "pmid" && !/^[1-9]\d{0,11}$/u.test(value)) return;
  if (type === "pmcid" && !/^PMC[1-9]\d{0,11}$/iu.test(value)) return;
  if (type === "doi" && (!canonicalDoiSchema.safeParse(value.toLowerCase()).success ||
    /:\/\/|(?:https?|ftp|mailto):/iu.test(value))) return;
  if (type !== "pmid" && type !== "pmcid" && type !== "doi") return;
  const canonical = type === "doi" ? value.toLowerCase() : type === "pmcid" ? value.toUpperCase() : value;
  if (!ids.some((id) => id.type === type && id.value === canonical)) ids.push({ type, value: canonical });
}

function unwrap(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable ||
      schema instanceof z.ZodDefault || schema instanceof z.ZodReadonly) return unwrap(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodPipe) return unwrap(schema.in as z.ZodType);
  return schema;
}

/** Traverse only declared fields. Array items share the same fixed paths and their word counts are summed. */
function argumentMetadata(
  tool: string, schema: z.ZodObject, input: unknown, paperIds: ResearchPaperIdentifier[], shape?: ResearchErrorLogShape,
): void {
  const fields = new Set<string>();
  const walk = (field: z.ZodType, value: unknown, path: string, options: boolean, depth: number): void => {
    if (value === undefined || value === null || value === "" || depth > 12) return;
    const type = unwrap(field);
    if (type instanceof z.ZodUnion) {
      const branch = type.options.find((option) => (option as z.ZodType).safeParse(value).success);
      if (branch !== undefined) walk(branch as z.ZodType, value, path, options, depth + 1);
      return;
    }
    if (type instanceof z.ZodObject) {
      visit(type.shape, object(value), path, false, depth + 1);
      return;
    }
    if (type instanceof z.ZodArray && Array.isArray(value)) {
      for (const item of value) walk(type.element as z.ZodType, item, path, false, depth + 1);
      return;
    }
    const name = path.slice(path.lastIndexOf(".") + 1);
    const doiField = name === "doi" || name === "doi_or_citation" ||
      (tool === "check_retraction_status" && name === "identifier");
    if (doiField) keepIdentifier(paperIds, "doi", normalizeDoiIdentifier(value));
    else keepIdentifier(paperIds, name, value);
    if (shape === undefined || (name !== "doi_or_citation" && path.split(".").some((part) =>
      opaqueField.test(part.replace(/([a-z])([A-Z])/gu, "$1_$2"))))) return;
    if (type instanceof z.ZodString && typeof value === "string") {
      shape.word_counts[path] = (shape.word_counts[path] ?? 0) + (value.trim().match(/\S+/gu)?.length ?? 0);
    } else if (options && (type instanceof z.ZodEnum || type instanceof z.ZodLiteral ||
        type instanceof z.ZodNumber || type instanceof z.ZodBoolean) &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean") &&
        type.safeParse(value).success) {
      shape.options[path] = value;
    }
  };
  const visit = (declared: z.ZodRawShape, values: Record<string, unknown>, prefix: string, options: boolean, depth: number) => {
    for (const [name, type] of Object.entries(declared)) {
      if (!Object.hasOwn(values, name) || values[name] === undefined || values[name] === null ||
          values[name] === "" || (Array.isArray(values[name]) && values[name].length === 0)) continue;
      const path = prefix === "" ? name : prefix + "." + name;
      if (shape !== undefined) fields.add(path);
      walk(type as z.ZodType, values[name], path, options, depth);
    }
  };
  const raw = object(input);
  visit(schema.shape, raw, "", true, 0);
  if (Object.hasOwn(schema.shape, "later_inputs")) {
    const { later_inputs: _envelope, ...laterFields } = schema.shape;
    visit(laterFields, object(raw.later_inputs), "later_inputs", true, 0);
  }
  if (shape !== undefined) shape.fields = [...fields].sort();
}

function sourceFor(tool: string, content: Record<string, unknown>): ResearchErrorLogSource {
  const provider = content.provider as ResearchErrorLogSource;
  if (RESEARCH_ERROR_LOG_SOURCES.includes(provider)) return provider;
  if (content.provider === "reddit_reader") return "reddit";
  if (content.provider === "forum_page" || content.provider === "candidate") return "publisher";
  if (content.provider === "owner_library") return "infoaccess";
  return content.provider === undefined ? providerForSearch[tool] ?? "server" : "server";
}

function failureFor(
  tool: string,
  result: Record<string, unknown>,
  kindHint?: ResearchErrorLogKind,
  attempt?: ReturnType<typeof failedPrimaryRoutes>[number],
) {
  const content = object(result.structuredContent);
  const error = object(content.error ?? attempt);
  const provider = content.provider ?? attempt?.route;
  const source = sourceFor(tool, { provider });
  const code = error.code ?? content.code ?? content.error_code ?? object(result._meta)["askrigor/errorCode"];
  const status = typeof error.http_status === "number" && Number.isInteger(error.http_status) ? error.http_status : 0;
  const http_status_class: "4xx" | "5xx" | undefined = status >= 400 && status < 500 ? "4xx" : status >= 500 && status < 600 ? "5xx" : undefined;
  const sdkText = object(Array.isArray(result.content) ? result.content[0] : undefined).text;
  const sdkValidationPrefix = "MCP error " + ErrorCode.InvalidParams + ": Input validation error: Invalid arguments for tool ";
  const sdkValidation = Object.keys(content).length === 0 && typeof sdkText === "string" &&
    sdkText.startsWith(sdkValidationPrefix + tool + ":");
  let kind: ResearchErrorLogKind;
  if (kindHint !== undefined) kind = kindHint;
  else if (authorizationCodes.has(code)) kind = "auth_refused";
  else if (validationCodes.has(code) || sdkValidation) kind = "validation_error";
  else if (status === 429 || content.access_status === "rate_limited" || code === "rate_limited") kind = "rate_limited";
  else if (error.failure_kind === "timeout") kind = "source_timeout";
  else if (http_status_class !== undefined) kind = "source_http_error";
  else if (provider !== undefined && source !== "server") kind = "source_unavailable";
  else kind = "internal_error";
  const where = provider === undefined &&
    (kind === "auth_refused" || kind === "validation_error" || kind === "internal_error") ? "server" : source;
  return { kind, source: where, ...(http_status_class === undefined ? {} : { http_status_class }) } as const;
}

export function buildResearchErrorLogEntry(call: {
  receivedAt: Date;
  durationMs: number;
  tool: string;
  input: unknown;
  schema: z.ZodObject;
  app: ResearchErrorLogApp;
  result?: unknown;
  rpcKind?: ResearchErrorLogKind;
  keepWords?: boolean;
}): ResearchErrorLogEntry | undefined {
  const { tool, schema, input } = call;
  const result = object(call.result);
  const content = object(result.structuredContent);
  // The forum tools report terminal failures as access states so clients can read their guidance.
  const forumState = tool === "search_reddit_threads" || tool === "read_forum_thread" ? object(content.data).access_state : undefined;
  const forumKind = forumState === "needs_research_access" ? "auth_refused"
    : forumState === "refused" || forumState === "invalid" ? "validation_error"
      : forumState === "busy" ? "rate_limited"
        : forumState === "unavailable" || forumState === "not_available" ? "source_unavailable" : undefined;
  const acquisition = content as Parameters<typeof hasFailedFullTextAcquisition>[0];
  const acquisitionFailed = tool === "acquire_open_full_text" && content.status === "possibly_useful_lead" &&
    hasFailedFullTextAcquisition(acquisition);
  const attempt = acquisitionFailed ? failedPrimaryRoutes(acquisition)[0] ??
    acquisition.discovery_attempts?.find(({ result }) => result === "error") : undefined;
  const failureKind = call.rpcKind ?? forumKind ?? (acquisitionFailed && attempt === undefined ? "source_unavailable" : undefined);
  const failed = failureKind !== undefined || acquisitionFailed || result.isError === true;
  if (!failed && call.durationMs <= SLOW_MS) return undefined;
  const paper_identifiers: ResearchPaperIdentifier[] = [];
  const shape: ResearchErrorLogShape | undefined = failed ? { fields: [], word_counts: {}, options: {} } : undefined;
  argumentMetadata(tool, schema, input, paper_identifiers, shape);
  const base = {
    received_at: call.receivedAt.toISOString(), duration_ms: Math.min(86_400_000,
      failed ? Math.max(0, Math.round(call.durationMs)) : Math.max(SLOW_MS + 1, Math.round(call.durationMs))),
    tool, app: call.app, paper_identifiers,
  };
  if (shape === undefined) return { ...base, outcome: "slow" };

  const failure = failureFor(tool, result, failureKind, attempt);
  const { source } = failure;
  if (RESEARCH_ERROR_LOG_SOURCES.includes(content.provider as ResearchErrorLogSource)) {
    for (const key of ["pmid", "pmcid", "doi"]) keepIdentifier(paper_identifiers, key, object(content.source_identity)[key]);
    const primaryType = typeof content.primary_identifier === "string" && content.primary_identifier.startsWith("PMC")
      ? "pmcid" : source === "pubmed" ? "pmid" : "doi";
    keepIdentifier(paper_identifiers, primaryType, content.primary_identifier);
  }
  if (attempt !== undefined) {
    keepIdentifier(paper_identifiers, "pmcid", attempt.identifier);
    keepIdentifier(paper_identifiers, "doi", attempt.identifier);
  }
  const entry: ResearchErrorLogEntry = { ...base, outcome: "error", ...failure, shape };
  const compatibleProvider = content.provider === undefined || source === providerForSearch[tool] ||
    (tool === "search_europe_pmc" && source === "openalex");
  if (call.keepWords !== true || !compatibleProvider || !Object.hasOwn(searchFields, tool)) return entry;
  const field = searchFields[tool]!;
  const query = object(input)[field];
  if (typeof query === "string" && (field !== "doi_or_citation" || normalizeDoiIdentifier(query) === undefined)) {
    try {
      const words = screenFailedSearch(query);
      if (words !== undefined) entry.search_words = { [field]: words };
    } catch { /* A failed screen keeps the shape only. */ }
  }
  return entry;
}
