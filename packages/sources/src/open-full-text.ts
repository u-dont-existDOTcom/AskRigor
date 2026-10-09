import { errorEnvelope, okEnvelope, type ProvenanceEnvelope } from "@askrigor/contracts";

import { type AuditableDocumentIndex, toAuditableDocumentIndex } from "./auditable-document-index.js";
import { acquireCandidateFullText, acquireSuppliedCandidateFullText, type CandidateFullTextRuntime } from "./candidate-full-text.js";
import { fetchEuropePmcFullText, type EuropePmcFullTextArticle } from "./europe-pmc-full-text.js";
import { searchEuropePmc, type EuropePmcRecord } from "./europe-pmc.js";
import { admitFullText, candidateUrlsSchema, candidateTextsSchema, checkPublicCopySearch, publicCopySearchSchema, titleVariants, hasFailedFullTextAcquisition, sourceClassRank, type AcquisitionState, type CandidateText, type CandidateUrl, type FrozenArticleIdentity, type FullTextCandidate, type PublicCopySearch, type PublicCopySearchResult } from "./full-text-admission.js";
import { indexJatsStudyDocument } from "./jats-study-index.js";
import { acquireUnpaywallFullText, type AcquireUnpaywallFullTextRuntime } from "./unpaywall-full-text.js";
import type { UnpaywallConfig } from "./unpaywall.js";

const DOI_PATTERN = /^10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/iu;
const PMCID_PATTERN = /^PMC[1-9]\d{0,15}$/u;

export interface AcquireOpenFullTextInput {
  doi: string;
  pmcid?: string;
  candidate_urls?: CandidateUrl[];
  candidate_texts?: CandidateText[];
  public_copy_search?: PublicCopySearch;
}
export interface AcquireOpenFullTextRuntime {
  searchEuropePmc?: typeof searchEuropePmc;
  fetchEuropePmcFullText?: typeof fetchEuropePmcFullText;
  acquireUnpaywallFullText?: typeof acquireUnpaywallFullText;
  unpaywallRuntime?: AcquireUnpaywallFullTextRuntime;
  candidateRuntime?: CandidateFullTextRuntime;
}
export interface OpenFullTextAcquisitionData {
  requested_doi: string;
  requested_pmcid?: string;
  outcome: "full_text_indexed" | "possibly_useful_lead";
  discovery_attempts: Array<{
    route: "europe_pmc" | "unpaywall" | "candidate";
    result: "indexed" | "not_found" | "inaccessible" | "fetch_blocked" | "error" | "partial_text" | "abstract_only" | "identity_mismatch";
    identifier?: string;
  }>;
  document_index?: AuditableDocumentIndex;
  access_boundary?: string;
  acquisition_state?: AcquisitionState;
  candidates?: FullTextCandidate[];
  public_copy_search?: PublicCopySearchResult;
}

/** Primary OA acquisition, followed by bounded verification of supplied public copies. */
export async function acquireOpenFullText(
  rawInput: AcquireOpenFullTextInput,
  unpaywallConfig: UnpaywallConfig | undefined,
  runtime: AcquireOpenFullTextRuntime = {}
): Promise<ProvenanceEnvelope<OpenFullTextAcquisitionData>> {
  const doi = normalizeDoi(rawInput.doi);
  if (!DOI_PATTERN.test(doi)) throw new Error("Invalid open-full-text DOI");
  const pmcid = rawInput.pmcid?.trim().toUpperCase();
  if (pmcid !== undefined && !PMCID_PATTERN.test(pmcid)) throw new Error("Invalid open-full-text PMCID");
  const supplied = rawInput.candidate_urls === undefined ? [] : candidateUrlsSchema.parse(rawInput.candidate_urls);
  const suppliedTexts = rawInput.candidate_texts === undefined ? [] : candidateTextsSchema.parse(rawInput.candidate_texts);
  const search = rawInput.public_copy_search === undefined ? undefined : publicCopySearchSchema.parse(rawInput.public_copy_search);
  const attempts: OpenFullTextAcquisitionData["discovery_attempts"] = [];
  let identity: FrozenArticleIdentity = { doi };
  let abstractText: string | undefined;
  let resolvedPmcid = pmcid;
  try {
    // The same DOI search also supplies a single exact metadata identity; no
    // extra metadata host or DOI redirect request is introduced.
    // A supplied search-index copy is checked against the abstract, which only "core" records carry.
    const result = await (runtime.searchEuropePmc ?? searchEuropePmc)({ query: `DOI:"${doi}"`, pageSize: 10,
      ...(suppliedTexts.length > 0 ? { resultType: "core" as const } : {}) });
    if (result.access_status === "complete") {
      const records = result.data.filter((record) => record.doi !== undefined && normalizeDoi(record.doi) === doi);
      if (records.length === 1) {
        identity = identityFromRecord(records[0]!, doi);
        abstractText = records[0]!.abstractText;
        resolvedPmcid ??= records[0]!.pmcid?.toUpperCase();
      }
      if (resolvedPmcid === undefined) attempts.push({ route: "europe_pmc", result: "not_found" });
    } else attempts.push({ route: "europe_pmc", result: routeResult(result.access_status) });
  } catch { attempts.push({ route: "europe_pmc", result: "error" }); }
  if (resolvedPmcid !== undefined) {
    try {
      const result = await (runtime.fetchEuropePmcFullText ?? fetchEuropePmcFullText)(resolvedPmcid);
      if ((result.access_status === "complete" || result.access_status === "partial") && "xml" in result.data) {
        const article = result.data as EuropePmcFullTextArticle;
        if (article.doi !== undefined && normalizeDoi(article.doi) !== doi) {
          attempts.push({ route: "europe_pmc", result: "identity_mismatch", identifier: resolvedPmcid });
        } else {
          identity = { ...identity, title_variants: titleVariants(identity.title, ...(identity.title_variants ?? []), article.title), ...(identity.title === undefined && article.title !== undefined ? { title: article.title } : {}),
            ...(identity.pmid === undefined && article.pmid !== undefined ? { pmid: article.pmid } : {}) };
          const rawIndex = indexJatsStudyDocument(article);
          const admission = admitFullText(rawIndex.blocks);
          if (article.document_completeness === "full_text_with_body") {
            attempts.push({ route: "europe_pmc", result: "indexed", identifier: resolvedPmcid });
            return indexed(doi, pmcid, attempts, toAuditableDocumentIndex(rawIndex), undefined, checkPublicCopySearch(identity, search));
          }
          attempts.push({ route: "europe_pmc", result: admission.state === "ABSTRACT_ONLY" ? "abstract_only" : "partial_text", identifier: resolvedPmcid });
        }
      } else attempts.push({ route: "europe_pmc", result: routeResult(result.access_status), identifier: resolvedPmcid });
    } catch { attempts.push({ route: "europe_pmc", result: "error", identifier: resolvedPmcid }); }
  }
  if (unpaywallConfig === undefined) {
    attempts.push({ route: "unpaywall", result: "error", identifier: doi });
  } else {
    try {
      const result = await (runtime.acquireUnpaywallFullText ?? acquireUnpaywallFullText)(doi, unpaywallConfig, { ...runtime.unpaywallRuntime, identity });
      // Metadata from both existing providers is assembled once, before any
      // supplied copy is inspected; candidates can never retune this identity.
      identity = { ...result.data.identity, ...identity, title_variants: titleVariants(identity.title, ...(identity.title_variants ?? []), result.data.identity?.title, ...(result.data.identity?.title_variants ?? [])) };
      if (result.access_status === "complete" && result.data.document_index !== undefined &&
          admitFullText(result.data.document_index.blocks).state === "FULL_TEXT_READABLE") {
        attempts.push({ route: "unpaywall", result: "indexed", identifier: doi });
        return indexed(doi, pmcid, attempts, result.data.document_index, undefined, checkPublicCopySearch(identity, search));
      }
      const state = result.data.acquisition_state;
      const resultState = state === "PARTIAL_TEXT_READABLE" ? "partial_text" : state === "ABSTRACT_ONLY" ? "abstract_only"
        : state === "IDENTITY_MISMATCH" ? "identity_mismatch" : routeResult(result.access_status);
      attempts.push({ route: "unpaywall", result: resultState, identifier: doi });
    } catch { attempts.push({ route: "unpaywall", result: "error", identifier: doi }); }
  }
  const frozenIdentity = Object.freeze({ ...identity, title_variants: Object.freeze(titleVariants(identity.title, ...(identity.title_variants ?? []))) });
  const publicCopySearch = checkPublicCopySearch(frozenIdentity, search);
  const candidates: FullTextCandidate[] = [];
  let selected: { index: AuditableDocumentIndex; rank: number } | undefined;
  const results = await Promise.all([
    ...supplied.map((candidate) => acquireCandidateFullText(candidate, frozenIdentity, runtime.candidateRuntime)),
    ...suppliedTexts.map((candidate) => acquireSuppliedCandidateFullText(candidate, frozenIdentity, abstractText, runtime.candidateRuntime))
  ]);
  for (const result of results) {
    candidates.push(result.candidate);
    const state = result.candidate.state;
    attempts.push({ route: "candidate", identifier: `candidate_${candidates.length}`,
      result: state === "FULL_TEXT_READABLE" ? "indexed" : state === "PARTIAL_TEXT_READABLE" ? "partial_text"
        : state === "ABSTRACT_ONLY" ? "abstract_only" : state === "IDENTITY_MISMATCH" ? "identity_mismatch"
          : state === "PAYWALL_OR_LOGIN_REQUIRED" ? "inaccessible" : state === "CANDIDATE_FOUND_FETCH_BLOCKED" ? "fetch_blocked" : state === "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" ? "not_found" : "error" });
    const rank = sourceClassRank(result.candidate.source_class);
    if (result.index !== undefined && (selected === undefined || rank > selected.rank)) selected = { index: result.index, rank };
  }
  if (selected !== undefined) return indexed(doi, pmcid, attempts, selected.index, candidates, publicCopySearch);
  const state: AcquisitionState = candidates.length === 0 ? publicCopySearch.status === "declared" ? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" : "PRIMARY_OA_ROUTES_EXHAUSTED" : overallCandidateState(candidates);
  const knownTitles = titleVariants(identity.title, ...(identity.title_variants ?? []));
  const identifiers = `${knownTitles.length > 1 ? "titles" : "title"} ${knownTitles.length === 0 ? "unknown (metadata unavailable)" : knownTitles.map((title) => JSON.stringify(title)).join(" or ")}, DOI ${doi}, PMID ${identity.pmid ?? "unknown"}, PII ${identity.pii ?? "unknown"}`;
  const discovery = `Exact public-copy discovery remains: an exact search by the listed ${identifiers}. candidate_urls records public copies found; candidate_texts accepts AI-supplied search-index copies; public_copy_search records the searches, including a search that found nothing without candidate_urls or candidate_texts.`;
  const missing = publicCopySearch.status === "missing_exact_identifiers"
    ? ` The declared queries lack the exact ${publicCopySearch.missing!.join(" and ")}.` : "";
  const boundary = state === "PRIMARY_OA_ROUTES_EXHAUSTED"
    ? `The primary open-access routes ended without an admitted copy. ${discovery}${missing}`
    : `No supplied or primary-route copy was admitted. The public-copy search is ${publicCopySearch.status}.${missing}`;
  const failed = hasFailedFullTextAcquisition({ discovery_attempts: attempts, candidates, acquisition_state: state });
  return errorEnvelope({
    provider: "open_full_text", recordType: "open_full_text_acquisition", primaryIdentifier: doi,
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` }, pagination: { exhausted: true }, returned: 0,
    accessStatus: failed ? "error" : "partial", limitations: [boundary,
      "The citation remains a possibly useful lead requiring further investigation; unseen contents were not treated as evidence."],
    code: failed ? "open_full_text_route_failed" : "open_full_text_not_auditable", message: boundary, retryable: failed,
    data: { requested_doi: doi, ...(pmcid === undefined ? {} : { requested_pmcid: pmcid }), outcome: "possibly_useful_lead",
      discovery_attempts: attempts, acquisition_state: state, public_copy_search: publicCopySearch, ...(candidates.length === 0 ? {} : { candidates }), access_boundary: boundary }
  }) as ProvenanceEnvelope<OpenFullTextAcquisitionData>;
}
function indexed(doi: string, pmcid: string | undefined, attempts: OpenFullTextAcquisitionData["discovery_attempts"], index: AuditableDocumentIndex, candidates?: FullTextCandidate[], publicCopySearch?: PublicCopySearchResult): ProvenanceEnvelope<OpenFullTextAcquisitionData> {
  return okEnvelope({ provider: "open_full_text", recordType: "open_full_text_acquisition", primaryIdentifier: doi,
    sourceIdentity: { canonical_url: index.source.canonical_url, ...(index.source.title === undefined ? {} : { title: index.source.title }) },
    pagination: { exhausted: true }, returned: 1, accessStatus: "complete",
    limitations: ["The admitted document is available for a source-linked method audit; retrieval and identity verification do not establish study validity.",
      "Claims remain limited to the exact study version, program, population, comparator, outcomes, horizon, and methods actually audited."],
    rawMetadata: { selected_route: index.source.provider, format: index.source.format, content_sha256: index.source.content_sha256, block_count: index.blocks.length },
    data: { requested_doi: doi, ...(pmcid === undefined ? {} : { requested_pmcid: pmcid }), outcome: "full_text_indexed",
      discovery_attempts: attempts, document_index: index, public_copy_search: publicCopySearch, acquisition_state: "FULL_TEXT_READABLE", ...(candidates === undefined ? {} : { candidates }) }
  });
}
function identityFromRecord(record: EuropePmcRecord, doi: string): FrozenArticleIdentity {
  return { doi, ...(record.pmid === undefined ? {} : { pmid: record.pmid }), ...(record.title === undefined ? {} : { title: record.title, title_variants: [record.title] }),
    ...(record.authors?.[0] === undefined ? {} : { first_author: record.authors[0] }), ...(record.year === undefined ? {} : { year: record.year }),
    ...(record.journal === undefined ? {} : { journal: record.journal }), ...(record.pii === undefined ? {} : { pii: record.pii }) };
}
function routeResult(status: string): "not_found" | "inaccessible" | "error" | "partial_text" | "abstract_only" {
  if (status === "not_found") return "not_found";
  if (status === "partial") return "partial_text";
  if (status === "abstract_only" || status === "metadata_only") return "abstract_only";
  if (status === "inaccessible") return "error";
  return "error";
}
function overallCandidateState(candidates: FullTextCandidate[]): AcquisitionState {
  const priority: AcquisitionState[] = ["PARTIAL_TEXT_READABLE", "ABSTRACT_ONLY", "CANDIDATE_FOUND_FETCH_BLOCKED", "PROVIDER_UNAVAILABLE", "PAYWALL_OR_LOGIN_REQUIRED", "IDENTITY_MISMATCH", "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH"];
  return priority.find((state) => candidates.some((candidate) => candidate.state === state)) ?? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH";
}
function normalizeDoi(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "");
}
