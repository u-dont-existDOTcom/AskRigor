import { createHash } from "node:crypto";

import { errorEnvelope, okEnvelope, type ProvenanceEnvelope } from "@askrigor/contracts";

import { type AuditableDocumentIndex, toAuditableDocumentIndex } from "./auditable-document-index.js";
import { acquireCandidateFullText, acquireSuppliedCandidateFullText, type CandidateFullTextRuntime } from "./candidate-full-text.js";
import { decodedDoi, DOI_PATTERN, doiUrl } from "./doi.js";
import { fetchEuropePmcFullText, type EuropePmcFullTextArticle } from "./europe-pmc-full-text.js";
import { searchEuropePmc, type EuropePmcRecord } from "./europe-pmc.js";
import { admitFullText, candidateUrlsSchema, candidateTextsSchema, checkPublicCopySearch, publicCopySearchSchema, titleVariants, hasFailedFullTextAcquisition, sourceClassRank, type AcquisitionState, type CandidateText, type CandidateUrl, type FrozenArticleIdentity, type FullTextCandidate, type PublicCopySearch, type PublicCopySearchResult, type PublicBasis, type FullTextAdmission } from "./full-text-admission.js";
import { indexJatsStudyDocument } from "./jats-study-index.js";
import { acquireUnpaywallFullText, type AcquireUnpaywallFullTextRuntime, extractAuditablePdf } from "./unpaywall-full-text.js";
import { upstreamFailureDetails } from "./http.js";
import type { UnpaywallConfig } from "./unpaywall.js";

const PMCID_PATTERN = /^PMC[1-9]\d{0,15}$/u;
const PMID_PATTERN = /^[1-9]\d{0,15}$/u;

export interface AcquireOpenFullTextInput {
  doi?: string;
  pmcid?: string;
  pmid?: string;
  candidate_urls?: CandidateUrl[];
  candidate_texts?: CandidateText[];
  public_copy_search?: PublicCopySearch;
}
export interface OwnerLibraryPdf {
  bytes: Uint8Array;
  sha256: string;
  size: number;
}
export type OwnerLibraryErrorCode = "unavailable" | "not_found" | "checksum_mismatch" | "too_large" | "busy" | "invalid_response" |
  "timeout";
export interface AcquireOpenFullTextRuntime {
  ownerLibrary?: {
    access: "owner" | "public_only";
    fetchPdf(doi: string): Promise<OwnerLibraryPdf>;
  };
  searchEuropePmc?: typeof searchEuropePmc;
  fetchEuropePmcFullText?: typeof fetchEuropePmcFullText;
  acquireUnpaywallFullText?: typeof acquireUnpaywallFullText;
  unpaywallRuntime?: AcquireUnpaywallFullTextRuntime;
  candidateRuntime?: CandidateFullTextRuntime;
}
export interface OpenFullTextAcquisitionData {
  requested_doi?: string;
  requested_pmcid?: string;
  requested_pmid?: string;
  outcome: "full_text_indexed" | "possibly_useful_lead";
  discovery_attempts: Array<{
    route: "europe_pmc" | "unpaywall" | "candidate" | "owner_library";
    result: "indexed" | "not_found" | "inaccessible" | "fetch_blocked" | "error" | "partial_text" | "abstract_only" | "identity_mismatch" | "not_public";
    identifier?: string;
    http_status?: number;
    failure_kind?: "timeout" | "network";
    retryable?: boolean;
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
  const doi = rawInput.doi === undefined ? undefined : normalizeDoi(rawInput.doi);
  if (doi !== undefined && !DOI_PATTERN.test(doi)) throw new Error("Invalid open-full-text DOI");
  const pmcid = rawInput.pmcid?.trim().toUpperCase();
  if (pmcid !== undefined && !PMCID_PATTERN.test(pmcid)) throw new Error("Invalid open-full-text PMCID");
  const pmid = rawInput.pmid?.trim();
  if (pmid !== undefined && !PMID_PATTERN.test(pmid)) throw new Error("Invalid open-full-text PMID");
  if (doi === undefined && pmcid === undefined && pmid === undefined) {
    const boundary = "Give at least one paper identifier: doi, pmcid or pmid.";
    return errorEnvelope({ provider: "open_full_text", recordType: "open_full_text_acquisition",
      pagination: { exhausted: true }, returned: 0, accessStatus: "partial", limitations: [boundary],
      code: "open_full_text_identifier_required", message: boundary, retryable: false,
      data: { outcome: "possibly_useful_lead", discovery_attempts: [], access_boundary: boundary }
    }) as ProvenanceEnvelope<OpenFullTextAcquisitionData>;
  }
  const requested = { ...(doi === undefined ? {} : { requested_doi: doi }),
    ...(pmcid === undefined ? {} : { requested_pmcid: pmcid }), ...(pmid === undefined ? {} : { requested_pmid: pmid }) };
  const identifier = doi ?? pmcid ?? pmid!;
  const supplied = rawInput.candidate_urls === undefined ? [] : candidateUrlsSchema.parse(rawInput.candidate_urls);
  const suppliedTexts = rawInput.candidate_texts === undefined ? [] : candidateTextsSchema.parse(rawInput.candidate_texts);
  const search = rawInput.public_copy_search === undefined ? undefined : publicCopySearchSchema.parse(rawInput.public_copy_search);
  const attempts: OpenFullTextAcquisitionData["discovery_attempts"] = [];
  let identity: FrozenArticleIdentity = { doi, pmcid, pmid };
  let licenseBasis: PublicBasis | undefined;
  let abstractText: string | undefined;
  let resolvedPmcid = pmcid;
  try {
    // The same identifier search also supplies a single exact metadata identity; no
    // extra metadata host or DOI redirect request is introduced.
    // A supplied search-index copy is checked against the abstract, which only "core" records carry.
    const query = doi !== undefined ? `DOI:"${doi}"` : pmcid !== undefined
      ? `EXT_ID:"${pmcid}" AND SRC:PMC` : `EXT_ID:"${pmid}" AND SRC:MED`;
    const result = await (runtime.searchEuropePmc ?? searchEuropePmc)({ query, pageSize: 10,
      ...(suppliedTexts.length > 0 ? { resultType: "core" as const } : {}) });
    if (result.access_status === "complete") {
      const records = result.data.filter((record) => doi !== undefined
        ? record.doi !== undefined && normalizeDoi(record.doi) === doi
        : pmcid !== undefined ? record.pmcid?.toUpperCase() === pmcid || record.source === "PMC" && record.id.toUpperCase() === pmcid
          : record.pmid === pmid || record.source === "MED" && record.id === pmid);
      if (records.length === 1) {
        identity = { ...identity, ...identityFromRecord(records[0]!, doi ?? records[0]!.doi) };
        abstractText = records[0]!.abstractText;
        resolvedPmcid ??= records[0]!.pmcid?.toUpperCase();
      }
      if (resolvedPmcid === undefined) attempts.push({ route: "europe_pmc", result: "not_found" });
    } else attempts.push({ route: "europe_pmc", result: routeResult(result.access_status),
      ...responseFailureDetails(result.error) });
  } catch (error) { attempts.push({ route: "europe_pmc", result: "error", ...upstreamFailureDetails(error) }); }
  if (resolvedPmcid !== undefined) {
    try {
      const result = await (runtime.fetchEuropePmcFullText ?? fetchEuropePmcFullText)(resolvedPmcid);
      if ((result.access_status === "complete" || result.access_status === "partial") && "xml" in result.data) {
        const article = result.data as EuropePmcFullTextArticle;
        if (doi !== undefined && article.doi !== undefined && normalizeDoi(article.doi) !== doi ||
            pmid !== undefined && article.pmid !== undefined && article.pmid !== pmid) {
          attempts.push({ route: "europe_pmc", result: "identity_mismatch", identifier: resolvedPmcid });
        } else {
          identity = { ...identity, title_variants: titleVariants(identity.title, ...(identity.title_variants ?? []), article.title), ...(identity.title === undefined && article.title !== undefined ? { title: article.title } : {}),
            ...(identity.pmid === undefined && article.pmid !== undefined ? { pmid: article.pmid } : {}) };
          const rawIndex = indexJatsStudyDocument(article);
          const admission = admitFullText(rawIndex.blocks);
          if (article.document_completeness === "full_text_with_body") {
            attempts.push({ route: "europe_pmc", result: "indexed", identifier: resolvedPmcid });
            return indexed(requested, attempts, toAuditableDocumentIndex(rawIndex), undefined, checkPublicCopySearch(identity, search));
          }
          attempts.push({ route: "europe_pmc", result: admission.state === "ABSTRACT_ONLY" ? "abstract_only" : "partial_text", identifier: resolvedPmcid });
        }
      } else attempts.push({ route: "europe_pmc", result: routeResult(result.access_status), identifier: resolvedPmcid,
        ...responseFailureDetails(result.error),
        ...(result.error?.retryable === undefined ? {} : { retryable: result.error.retryable }) });
    } catch (error) { attempts.push({ route: "europe_pmc", result: "error", identifier: resolvedPmcid, ...upstreamFailureDetails(error) }); }
  }
  if (doi !== undefined && unpaywallConfig === undefined) {
    attempts.push({ route: "unpaywall", result: "error", identifier: doi });
  } else if (doi !== undefined && unpaywallConfig !== undefined) {
    try {
      const result = await (runtime.acquireUnpaywallFullText ?? acquireUnpaywallFullText)(doi, unpaywallConfig, { ...runtime.unpaywallRuntime, identity });
      // Metadata from both existing providers is assembled once, before any
      // supplied copy is inspected; candidates can never retune this identity.
      identity = { ...result.data.identity, ...identity, title_variants: titleVariants(identity.title, ...(identity.title_variants ?? []), result.data.identity?.title, ...(result.data.identity?.title_variants ?? [])) };
      if (result.access_status === "complete" && result.data.document_index !== undefined &&
          admitFullText(result.data.document_index.blocks).state === "FULL_TEXT_READABLE") {
        attempts.push({ route: "unpaywall", result: "indexed", identifier: doi });
        return indexed(requested, attempts, result.data.document_index, undefined, checkPublicCopySearch(identity, search));
      }
      licenseBasis = result.data.public_basis;
      const state = result.data.acquisition_state;
      const resultState = state === "PARTIAL_TEXT_READABLE" ? "partial_text" : state === "ABSTRACT_ONLY" ? "abstract_only"
        : state === "IDENTITY_MISMATCH" ? "identity_mismatch" : routeResult(result.access_status);
      const failures = [result.data.discovery_failure, ...(result.data.attempted_locations ?? [])]
        .filter((failure) => failure !== undefined &&
          (failure.http_status !== undefined || failure.failure_kind !== undefined));
      // An error with its status or kind is recorded once, with them: a bare "error" beside it would count as a
      // failure of its own and hide that a refusal (a 403, say) ended the search.
      if (resultState !== "error" || failures.length === 0) attempts.push({ route: "unpaywall", result: resultState, identifier: doi });
      for (const failure of failures) attempts.push({ route: "unpaywall", result: "error", identifier: doi,
        ...responseFailureDetails(failure) });
    } catch (error) { attempts.push({ route: "unpaywall", result: "error", identifier: doi, ...upstreamFailureDetails(error) }); }
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
  // A public copy AskRigor admitted is returned as is; the owner library only fills a gap.
  if (selected !== undefined) return indexed(requested, attempts, selected.index, candidates, publicCopySearch);
  let librarySearchRequired = false;
  let libraryBoundary = "";
  if (doi !== undefined && runtime.ownerLibrary !== undefined) {
    // A public basis shows the paper's own text beyond its abstract on a public page whose identity passed, or an
    // open license. An abstract-only page, or a bare URL AskRigor could not read, is not a public copy of the paper.
    const verifiedCandidate = results.find((result) => result.candidate.identity_verification !== "not_verified" &&
      result.candidate.state === "PARTIAL_TEXT_READABLE" &&
      (result.candidate.retrieval_provider === "direct" || "abstractVerified" in result && result.abstractVerified === true));
    const publicBasis: PublicBasis | undefined = verifiedCandidate === undefined
      ? licenseBasis : { route: "candidate", url: verifiedCandidate.candidate.url };
    if (runtime.ownerLibrary.access === "public_only" && publicBasis === undefined) {
      librarySearchRequired = publicCopySearch.status !== "declared";
      if (!librarySearchRequired) attempts.push({ route: "owner_library", result: "not_public", identifier: doi });
    } else {
      try {
        const pdf = await runtime.ownerLibrary.fetchPdf(doi);
        if (pdf.bytes.byteLength > 64 * 1024 * 1024 || pdf.size > 64 * 1024 * 1024) throw new Error("Library PDF exceeds byte limit");
        if (!Number.isSafeInteger(pdf.size) || pdf.size < 0 || pdf.size !== pdf.bytes.byteLength || !/^[a-f0-9]{64}$/iu.test(pdf.sha256) ||
            createHash("sha256").update(pdf.bytes).digest("hex") !== pdf.sha256.toLowerCase()) throw new Error("Library PDF checksum mismatch");
        let inspection: FullTextAdmission | undefined;
        const index = await (runtime.candidateRuntime?.extractPdf ?? extractAuditablePdf)({
          doi, title: frozenIdentity.title, identity: frozenIdentity,
          canonicalUrl: runtime.ownerLibrary.access === "public_only" ? publicBasis!.url : doiUrl(doi),
          bytes: pdf.bytes, onInspection: (value) => { inspection = value; }
        });
        const admission = index === undefined ? inspection : admitFullText(index.blocks);
        if (index !== undefined && admission?.state === "FULL_TEXT_READABLE") {
          attempts.push({ route: "owner_library", result: "indexed", identifier: doi });
          return indexed(requested, attempts, { ...index, source: { ...index.source,
            provider: "owner_library", retrieval_provider: "owner_library",
            canonical_url: runtime.ownerLibrary.access === "public_only" ? publicBasis!.url : doiUrl(doi),
            ...(runtime.ownerLibrary.access === "public_only" ? { public_basis: publicBasis } : {})
          } }, candidates.length === 0 ? undefined : candidates, publicCopySearch);
        }
        attempts.push({ route: "owner_library", identifier: doi,
          result: admission === undefined ? "identity_mismatch" : admission.state === "ABSTRACT_ONLY" ? "abstract_only" : "partial_text" });
      } catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
        // The library answered that it cannot use what it found: the search there ended, so a lead is not held back for
        // another try. The regression run on #389's build called the route up to 16 times for one such paper. A busy
        // library is a failure to retry, which the boundary says.
        const answered = code === "not_found" || code === "invalid_response";
        attempts.push({ route: "owner_library", result: answered ? "not_found" : "error", identifier: doi,
          ...(code === "timeout" ? { failure_kind: "timeout" as const } : {}) });
        if (code === "invalid_response") libraryBoundary = " The owner library could not supply this paper, so repeating the call is unlikely to help.";
        if (code === "busy") libraryBoundary = " The owner library stayed busy with other requests, so the same call may work in a minute.";
        // The call's own deadline ended the library route, so the result reaches the AI before the app gives up on it.
        if (code === "timeout") libraryBoundary = " The owner library did not answer within this call's time, so the same call may work in a minute.";
      }
    }
  }
  const state: AcquisitionState = candidates.length === 0 ? publicCopySearch.status === "declared" ? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" : "PRIMARY_OA_ROUTES_EXHAUSTED" : overallCandidateState(candidates);
  const knownTitles = titleVariants(identity.title, ...(identity.title_variants ?? []));
  const identifiers = `${knownTitles.length > 1 ? "titles" : "title"} ${knownTitles.length === 0 ? "unknown (metadata unavailable)" : knownTitles.map((title) => JSON.stringify(title)).join(" or ")}, DOI ${identity.doi ?? "unknown"}, PMID ${identity.pmid ?? "unknown"}${resolvedPmcid === undefined ? "" : `, PMCID ${resolvedPmcid}`}, PII ${identity.pii ?? "unknown"}`;
  const discovery = `Exact public-copy discovery remains: an exact search by the listed ${identifiers}. candidate_urls records public copies found; candidate_texts accepts AI-supplied search-index copies; public_copy_search records the searches, including a search that found nothing without candidate_urls or candidate_texts.`;
  const missing = publicCopySearch.status === "missing_exact_identifiers"
    ? ` The declared queries lack the exact ${publicCopySearch.missing!.join(" and ")}.` : "";
  const europePmcFailure = attempts.find((attempt) => attempt.route === "europe_pmc" && attempt.identifier === resolvedPmcid &&
    attempt.http_status !== undefined && (attempt.http_status === 429 || attempt.http_status >= 500 && attempt.http_status < 600));
  const pmcBoundary = europePmcFailure === undefined ? ""
    : ` Europe PMC's full-text service failed for ${resolvedPmcid} (HTTP ${europePmcFailure.http_status}); the article's PubMed Central page (https://pmc.ncbi.nlm.nih.gov/articles/${resolvedPmcid}/) may be readable by the AI's own browsing, and a copy read there can be passed back as candidate_texts with retrieved_via "client_search_index", which AskRigor checks for identity and completeness as usual.`;
  const boundary = (librarySearchRequired
    ? `The owner library requires a verified public basis for this account. ${discovery}${missing}`
    : state === "PRIMARY_OA_ROUTES_EXHAUSTED"
    ? `The primary open-access routes ended without an admitted copy. ${discovery}${missing}`
    : `No supplied or primary-route${doi === undefined || runtime.ownerLibrary === undefined ? "" : " or owner-library"} copy was admitted. The public-copy search is ${publicCopySearch.status}.${missing}`) + pmcBoundary + libraryBoundary;
  const failed = hasFailedFullTextAcquisition({ discovery_attempts: attempts, candidates, acquisition_state: state });
  return errorEnvelope({
    provider: "open_full_text", recordType: "open_full_text_acquisition", primaryIdentifier: identifier,
    sourceIdentity: { canonical_url: doi !== undefined ? doiUrl(doi) : pmcid !== undefined
      ? `https://europepmc.org/articles/${pmcid}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` }, pagination: { exhausted: true }, returned: 0,
    accessStatus: failed ? "error" : "partial", limitations: [boundary,
      "The citation remains a possibly useful lead requiring further investigation; unseen contents were not treated as evidence."],
    code: failed ? "open_full_text_route_failed" : "open_full_text_not_auditable", message: boundary, retryable: failed,
    data: { ...requested, outcome: "possibly_useful_lead",
      discovery_attempts: attempts, acquisition_state: state, public_copy_search: publicCopySearch, ...(candidates.length === 0 ? {} : { candidates }), access_boundary: boundary }
  }) as ProvenanceEnvelope<OpenFullTextAcquisitionData>;
}
function indexed(requested: Pick<OpenFullTextAcquisitionData, "requested_doi" | "requested_pmcid" | "requested_pmid">, attempts: OpenFullTextAcquisitionData["discovery_attempts"], index: AuditableDocumentIndex, candidates?: FullTextCandidate[], publicCopySearch?: PublicCopySearchResult): ProvenanceEnvelope<OpenFullTextAcquisitionData> {
  return okEnvelope({ provider: "open_full_text", recordType: "open_full_text_acquisition", primaryIdentifier: requested.requested_doi ?? requested.requested_pmcid ?? requested.requested_pmid,
    sourceIdentity: { canonical_url: index.source.canonical_url, ...(index.source.title === undefined ? {} : { title: index.source.title }) },
    pagination: { exhausted: true }, returned: 1, accessStatus: "complete",
    limitations: ["The admitted document is available for a source-linked method audit; retrieval and identity verification do not establish study validity.",
      "Claims remain limited to the exact study version, program, population, comparator, outcomes, horizon, and methods actually audited."],
    rawMetadata: { selected_route: index.source.provider, format: index.source.format, content_sha256: index.source.content_sha256, block_count: index.blocks.length },
    data: { ...requested, outcome: "full_text_indexed",
      discovery_attempts: attempts, document_index: index, public_copy_search: publicCopySearch, acquisition_state: "FULL_TEXT_READABLE", ...(candidates === undefined ? {} : { candidates }) }
  });
}
function identityFromRecord(record: EuropePmcRecord, doi: string | undefined): FrozenArticleIdentity {
  return { ...(doi === undefined ? {} : { doi: normalizeDoi(doi) }), ...(record.pmid === undefined ? {} : { pmid: record.pmid }), ...(record.title === undefined ? {} : { title: record.title, title_variants: [record.title] }),
    ...(record.authors?.[0] === undefined ? {} : { first_author: record.authors[0] }), ...(record.year === undefined ? {} : { year: record.year }),
    ...(record.journal === undefined ? {} : { journal: record.journal }), ...(record.pii === undefined ? {} : { pii: record.pii }) };
}
function responseFailureDetails(error?: { http_status?: number; failure_kind?: "timeout" | "network" }) {
  return {
    ...(error?.http_status === undefined ? {} : { http_status: error.http_status }),
    ...(error?.failure_kind === undefined ? {} : { failure_kind: error.failure_kind })
  };
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
  return decodedDoi(value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")).toLowerCase();
}
