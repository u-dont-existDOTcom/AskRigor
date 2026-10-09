import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";
import { ACCESS_STATUSES, errorEnvelope } from "@askrigor/contracts";
import {
  PostgresEvidenceRepository,
  PUBLIC_PROLACTINOMA_GAP_SLUG,
  RESEARCH_USE_NOTICE_VERSION,
  type PublicEvidenceGapIntakeService,
  type ResearchContributionReviewService,
  type ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import {
  getProtocolManifest,
  loadProtocol,
  loadProtocolSectionSnapshot,
  protocolTextPage,
  verifyProtocolIntegrity,
  type ProtocolName
} from "@askrigor/protocol";
import {
  hasFailedFullTextAcquisition,
  canSignFullTextLead,
  fetchClinicalTrial,
  fetchPubmedRecord,
  checkRetractionStatus,
  resolveDoi,
  searchClinicalTrials,
  searchEuropePmc,
  searchPubmed,
  getYoutubeComments,
  getYoutubeVideo,
  lookupRedditThreads,
  parseYoutubeVideoId,
  searchYoutube,
  searchYoutubeComments,
  youtubeCommentDataSchema,
  youtubeCommentFailureDataSchema,
  youtubeSearchRecordListSchema,
  youtubeVideoDataSchema,
  youtubeVideoFailureDataSchema,
  GEMINI_YOUTUBE_SCOUT_MAX_LEAD_CHARACTERS,
  GEMINI_YOUTUBE_SCOUT_MAX_REDISCOVERY_LEADS,
  type GeminiYoutubeScoutBackgroundCheckpoint
} from "@askrigor/sources";
import { z } from "zod";

import {
  PUBLIC_TOOL_LIMITS,
  findingsLibraryEnabledFromEnv,
  optionalLivingEvidenceReuseConfigFromEnv
} from "./config.js";
import { createConcurrencyLimiter } from "./rate-limit.js";
import {
  connectorLessonInputSchema,
  connectorLessonOutputSchema,
  connectorLessonToolResult,
} from "./lessons/connector-tool.js";
import type { LessonSubmissionResult } from "./lessons/contracts.js";
import { submitConnectorLessonCandidate } from "./lessons/runtime.js";
import {
  findingsSaveToolResult,
  SAVE_RESEARCH_FINDINGS_DESCRIPTION,
} from "./findings/connector-tool.js";
import {
  findingsSaveResultSchema,
  saveResearchFindingsInputSchema,
  type FindingsSaveResult,
} from "./findings/contracts.js";
import { saveResearchFindings } from "./findings/runtime.js";
import type { FindingsSaveContext } from "./findings/service.js";
import {
  protocolErrorResult,
  protocolRequestError,
  successfulToolResult
} from "./tool-result.js";
import {
  automatedScoutInputSchema,
  deleteResumedGeminiScoutInteraction,
  executeResumableAutomatedGeminiScout,
  geminiKeyDeclaredUnbilled,
  isPopulationLevelResearchTarget,
  isPublicLeadTerm
} from "./actions/gemini-scout-route.js";
import {
  decodeScoutContinuation,
  encodeScoutContinuation,
  SCOUT_CONTINUATION_TTL_MS,
  ScoutContinuationError
} from "./scout-continuation.js";
import { lookUpScoutTitles } from "./scout-title-lookup.js";
import {
  EXTRACT_YOUTUBE_VIDEO_CLAIMS,
  EXTRACT_YOUTUBE_VIDEO_CLAIMS_DESCRIPTION,
  extractYoutubeVideoClaims,
  extractYoutubeVideoClaimsInputSchema,
  extractYoutubeVideoClaimsOutputSchema
} from "./gemini-video-tool.js";
import {
  auditYoutubeCommunity,
  youtubeCommunityAuditInputSchema,
  youtubeCommunityAuditOutputSchema,
  type YoutubeCommunityAuditInput,
  type YoutubeCommunityAuditOutput
} from "./youtube-community-audit.js";
import {
  surveyYoutubeCommunity,
  youtubeCommunitySurveyInputSchema,
  youtubeCommunitySurveyOutputSchema,
  type YoutubeCommunitySurveyInput,
  type YoutubeCommunitySurveyOutput
} from "./youtube-community-survey.js";
import {
  auditYoutubeVideoCommunity,
  youtubeVideoCommunityAuditInputSchema,
  youtubeVideoCommunityAuditOutputSchema,
  type YoutubeVideoCommunityAuditInput,
  type YoutubeVideoCommunityAuditOutput
} from "./youtube-video-community-audit.js";
import {
  YoutubeAuditContinuationError,
  YoutubeAuditIdentifierMembershipBoundaryError,
  YoutubeAuditRestartRequiredError
} from "./youtube-audit-continuation.js";
import type {
  ResearchOperation,
  ResearchOperationExtra,
  ResearchOperationHandler
} from "./research-operation.js";
import {
  createEvidenceGapReviewHandler,
  evidenceGapReviewInputSchema,
  evidenceGapReviewOutputSchema,
  evidenceGapReviewSecurityMetadata,
} from "./evidence-gap-review-tool.js";
import type { SignInState } from "./oauth-resource-server.js";
import { type RunningVersions, runningVersionsText } from "./version.js";
import {
  createManageResearchAccessHandler,
  createResearchAccessGuard,
  createSubmitResearchContributionHandler,
  researchUseAccount,
  manageResearchAccessInputSchema,
  manageResearchAccessOutputSchema,
  optionalSignInSecurityMetadata,
  researchConnection,
  researchConnectionSchema,
  researchConnectionSummary,
  researchUseSecurityMetadata,
  submitResearchContributionInputSchema,
  submitResearchContributionOutputSchema,
  submitServerSourceAnalysis,
} from "./research-contributor-access-tool.js";
import {
  AnalysisStaging,
  buildStagedAnalysis,
  saveStagedAnalyses,
} from "./analysis-staging.js";
import {
  createResearchContributionReviewHandler,
  researchContributionReviewInputSchema,
  researchContributionReviewOutputSchema,
} from "./research-contribution-review-tool.js";
import {
  researchFrontierInputSchema,
  researchFrontierOutputSchema,
  researchFrontierToolResult
} from "./research-frontier-tool.js";
import {
  researchFrontierSearchInputSchema,
  researchFrontierSearchOutputSchema,
  researchFrontierSearchToolResult,
} from "./research-frontier-search-tool.js";
import {
  acquireOpenFullTextActionInputSchema,
  availableOpenFullTextActionOutputSchema,
  continueOpenFullTextActionInputSchema,
  createOpenFullTextActionRoutes,
  createOpenFullTextExecutor,
  openFullTextMcpOutputSchema,
  reviewMethodAuditActionInputSchema,
  reviewMethodAuditActionOutputSchema,
  studyMethodAuditActionInputSchema,
  studyMethodAuditRouteOutputSchema
} from "./actions/open-full-text-route.js";
import {
  finalizeResearch,
  protocolNamesFrom,
  finalizeResearchInputSchema,
  finalizeResearchOutputSchema,
  type FinalizeResearchOutput
} from "./research-finalization-gate.js";
import {
  assessTreatmentCoverageFromReceipts,
  treatmentCoverageFromReceiptsInputSchema,
  treatmentCoverageFromReceiptsOutputSchema
} from "./treatment-coverage-from-receipts.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  pageKey,
  researchReceiptSecretFromEnv,
  researchTargetDigest,
  type ResearchReceiptClaims,
  type ResearchReceiptKind
} from "./research-receipts.js";
import {
  compactYoutubeAuditForMcp,
  compactYoutubeCommunityAuditForMcp,
  mcpYoutubeCommunityAuditOutputSchema,
  mcpYoutubeVideoCommunityAuditOutputSchema,
  YoutubeMcpResponseTooLargeError,
  type McpYoutubeCommunityAuditOutput,
  type McpYoutubeVideoCommunityAuditOutput
} from "./youtube-mcp-sample.js";

const LIVING_EVIDENCE_READER = configuredLivingEvidenceRepository();
const OPEN_FULL_TEXT_MCP_ROUTES = createOpenFullTextActionRoutes(
  configuredOpenFullTextOptions(LIVING_EVIDENCE_READER)
);
const RESEARCH_FRONTIER_READER = LIVING_EVIDENCE_READER;

const protocolSchema = z.enum(["hrp", "universal"]);
const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  revisionDate: z.string(),
  sha256: z.string()
});
const PROTOCOL_INDEX_SECTION = "index";
const protocolSectionIndexSchema = z.object({
  name: z.string(),
  bytes: z.number().int(),
  pages: z.number().int(),
  core: z.boolean(),
  runtime: z.boolean(),
  sha256: z.string(),
  summary: z.string()
}).strict();
const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  http_status: z.number().int().optional(),
  retryable: z.boolean().optional()
}).strict();

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateRangeSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema
}).strict();
const sourceIdentitySchema = z.object({
  canonical_url: z.string().optional(),
  title: z.string().optional(),
  authors_or_channel: z.array(z.string()).optional()
}).strict();
const paginationSchema = z.object({
  cursor: z.string().optional(),
  next_cursor: z.string().optional(),
  page_size: z.number().int().positive().max(PUBLIC_TOOL_LIMITS.maximumPaginationPageSize).optional(),
  returned: z.number().int().nonnegative(),
  exhausted: z.boolean().optional()
}).strict();
const accessStatusSchema = z.enum(ACCESS_STATUSES);
const searchPubmedInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000).describe("PubMed search query."),
  date_range: dateRangeSchema.optional().describe(
    "Inclusive publication-date range in YYYY-MM-DD format."
  ),
  page_size: z.number().int().min(1).max(PUBLIC_TOOL_LIMITS.pubmedPageSize).optional().describe(
    "Requested records per page; allowed range is 1 through 100."
  ),
  cursor: z.string().min(1).max(4_096).optional().describe(
    "Opaque cursor returned by a previous PubMed search."
  )
}).strict();
const pubmedSearchRecordSchema = z.object({
  pmid: z.string(),
  title: z.string().optional(),
  journal: z.string().optional(),
  year: z.string().optional()
}).strict();
const pubmedSearchEnvelopeSchema = z.object({
  provider: z.literal("pubmed"),
  record_type: z.literal("pubmed_search_result"),
  retrieved_at: z.string(),
  query: z.object({
    query: z.string(),
    date_range: dateRangeSchema.optional()
  }).strict(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: z.object({ total_count: z.number().int().nonnegative() }).strict().optional(),
  error: errorSchema.optional(),
  data: z.array(pubmedSearchRecordSchema)
}).strict();
const pubmedDateSchema = z.object({
  type: z.string(),
  value: z.string()
}).strict();
const pubmedRecordSchema = z.object({
  pmid: z.string().optional(),
  title: z.string().optional(),
  abstract: z.string().optional(),
  journal: z.string().optional(),
  dates: z.array(pubmedDateSchema).optional(),
  authors: z.array(z.string()).optional(),
  doi: z.string().optional(),
  pmcid: z.string().optional(),
  publication_types: z.array(z.string()).optional()
}).strict();
const pubmedRecordEnvelopeSchema = z.object({
  provider: z.literal("pubmed"),
  record_type: z.literal("pubmed_record"),
  primary_identifier: z.string(),
  retrieved_at: z.string(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  error: errorSchema.optional(),
  data: pubmedRecordSchema
}).strict();
const searchEuropePmcInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000).describe("Europe PMC search query."),
  date_range: dateRangeSchema.optional().describe(
    "Inclusive publication-date range in YYYY-MM-DD format."
  ),
  page_size: z.number().int().min(1).max(PUBLIC_TOOL_LIMITS.europePmcPageSize).optional().describe(
    "Requested records per page; allowed range is 1 through 100."
  ),
  cursor: z.string().min(1).max(4_096).optional().describe(
    "Opaque Europe PMC cursor returned by a previous search."
  )
}).strict();
const europePmcRecordSchema = z.object({
  source: z.string(),
  id: z.string(),
  pmid: z.string().optional(),
  pmcid: z.string().optional(),
  doi: z.string().optional(),
  pii: z.string().optional(),
  title: z.string().optional(),
  abstractText: z.string().optional().describe("Records the abstract when the Europe PMC response carries one."),
  authors: z.array(z.string()).optional(),
  journal: z.string().optional(),
  year: z.string().optional(),
  cited_by: z.number().int().nonnegative().optional(),
  is_open_access: z.boolean().optional(),
  has_full_text: z.boolean().optional()
}).strict();
const europePmcSearchEnvelopeSchema = z.object({
  provider: z.literal("europe_pmc"),
  record_type: z.literal("europe_pmc_search_result"),
  retrieved_at: z.string(),
  query: z.object({
    query: z.string(),
    date_range: dateRangeSchema.optional()
  }).strict(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: z.object({ hit_count: z.number().int().nonnegative() }).strict().optional(),
  error: errorSchema.optional(),
  data: z.array(europePmcRecordSchema)
}).strict();
const searchClinicalTrialsInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000).describe("ClinicalTrials.gov search query."),
  page_size: z.number().int().min(1).max(PUBLIC_TOOL_LIMITS.clinicalTrialsPageSize).optional().describe(
    "Requested studies per page; allowed range is 1 through 100."
  ),
  page_token: z.string().min(1).max(4_096).optional().describe(
    "Provider page token returned by a previous ClinicalTrials.gov search."
  )
}).strict();
const clinicalTrialInterventionSchema = z.object({
  type: z.string().optional(),
  name: z.string().optional()
}).strict();
const clinicalTrialReferenceSchema = z.object({
  pmid: z.string().optional(),
  type: z.string().optional(),
  citation: z.string().optional()
}).strict();
const clinicalTrialRecordSchema = z.object({
  nct_id: z.string().regex(/^NCT\d{8}$/),
  title: z.string().optional(),
  status: z.string().optional(),
  study_type: z.string().optional(),
  phases: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  interventions: z.array(clinicalTrialInterventionSchema).optional(),
  sponsors: z.array(z.string()).optional(),
  enrollment: z.object({ count: z.number().int().nonnegative(), type: z.string().optional() }).strict().optional(),
  start_date: z.string().optional(),
  completion_date: z.string().optional(),
  has_results: z.boolean().optional(),
  references: z.array(clinicalTrialReferenceSchema).optional(),
  last_update: z.string().optional()
}).strict();
const clinicalTrialsRawMetadataSchema = z.object({
  data_timestamp: z.string()
}).strict();
const clinicalTrialsSearchEnvelopeSchema = z.object({
  provider: z.literal("clinicaltrials_gov"),
  record_type: z.literal("clinical_trial_search_result"),
  retrieved_at: z.string(),
  query: z.object({ query: z.string() }).strict(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: clinicalTrialsRawMetadataSchema.optional(),
  error: errorSchema.optional(),
  data: z.array(clinicalTrialRecordSchema)
}).strict();
const clinicalTrialEnvelopeSchema = z.object({
  provider: z.literal("clinicaltrials_gov"),
  record_type: z.literal("clinical_trial"),
  primary_identifier: z.string().regex(/^NCT\d{8}$/),
  retrieved_at: z.string(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: clinicalTrialsRawMetadataSchema.optional(),
  error: errorSchema.optional(),
  data: clinicalTrialRecordSchema.or(z.object({}).strict())
}).strict();
const crossrefCandidateSchema = z.object({
  doi: z.string(),
  title: z.string().optional(),
  first_author: z.string().optional(),
  year: z.string().optional()
}).strict();
const doiResolutionEnvelopeSchema = z.object({
  provider: z.literal("crossref"),
  record_type: z.literal("doi_resolution"),
  primary_identifier: z.string().trim().min(1).max(2_048).optional(),
  retrieved_at: z.string(),
  query: z.object({ citation: z.string(), rows: z.literal(5) }).strict().optional(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: z.object({ total_results: z.number().int().nonnegative() }).strict().optional(),
  error: errorSchema.optional(),
  data: z.object({
    resolved_doi: z.string().nullable(),
    candidates: z.array(crossrefCandidateSchema)
  }).strict()
}).strict();
const retractionEvidenceSchema = z.object({
  type: z.enum(["retracted", "expression_of_concern", "corrected_or_updated"]),
  doi: z.string().nullable(),
  date: z.string().nullable(),
  source: z.string().nullable(),
  raw_label: z.string()
}).strict();
const retractionStatusEnvelopeSchema = z.object({
  provider: z.literal("crossref"),
  record_type: z.literal("retraction_status"),
  primary_identifier: z.string().optional(),
  retrieved_at: z.string(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  error: errorSchema.optional(),
  data: z.object({
    doi: z.string().nullable(),
    status: z.enum(["retracted", "expression_of_concern", "corrected_or_updated", "no_retraction_record_found", "unknown"]),
    evidence: z.array(retractionEvidenceSchema),
    sources_checked: z.tuple([z.literal("crossref")])
  }).strict()
}).strict();
const youtubeSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000).describe("YouTube video search query."),
  page_size: z.number().int().min(1).max(PUBLIC_TOOL_LIMITS.youtubeSearchPageSize).optional().describe(
    "Requested video results per page; allowed range is 1 through 50."
  ),
  cursor: z.string().min(1).max(4_096).optional().describe(
    "Opaque YouTube page token returned by a previous search."
  ),
  research_target: z.string().trim().min(1).max(5_000).optional().describe(
    "The research target, copied exactly as you give it to the scout and finalize_research. Without it this " +
      "search does not count as discovery for that research."
  )
}).strict();
const youtubeVideoSchema = z.union([
  youtubeVideoDataSchema,
  youtubeVideoFailureDataSchema
]);
const youtubeSearchEnvelopeSchema = z.object({
  provider: z.literal("youtube"),
  record_type: z.literal("youtube_search_result"),
  retrieved_at: z.string(),
  query: z.object({ query: z.string().min(1).max(5_000) }).strict().optional(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: z.object({ total_results: z.number().int().nonnegative() }).strict().optional(),
  error: errorSchema.optional(),
  data: youtubeSearchRecordListSchema
}).strict();
const youtubeVideoEnvelopeSchema = z.object({
  provider: z.literal("youtube"),
  record_type: z.literal("youtube_video"),
  primary_identifier: z.string().optional(),
  retrieved_at: z.string(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  error: errorSchema.optional(),
  data: youtubeVideoSchema
}).strict();
const youtubeCommentBaseInputSchema = z.object({
  video_id_or_url: z.string().min(1).max(2_048).describe(
    "Supported YouTube video ID, youtu.be URL, youtube.com watch URL, or YouTube Shorts URL."
  ),
  include_replies: z.boolean().default(true).describe(
    "Fetch every independently paginated API-visible reply; defaults to true."
  ),
  cursor: z.string().min(1).max(4_096).optional().describe(
    "Opaque YouTube commentThreads page token at which retrieval begins."
  )
}).strict();
const youtubeCommentSearchInputSchema = youtubeCommentBaseInputSchema.extend({
  query: z.string().trim().min(1).max(5_000).describe(
    "Nonempty YouTube comment-thread searchTerms query."
  )
}).strict();
const youtubeCommentDataUnionSchema = z.union([
  youtubeCommentDataSchema,
  youtubeCommentFailureDataSchema
]);
const youtubeCommentEnvelopeSchema = z.object({
  provider: z.literal("youtube"),
  record_type: z.literal("youtube_comments"),
  primary_identifier: z.string().optional(),
  retrieved_at: z.string(),
  query: z.object({ query: z.string() }).strict().optional(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: z.object({
    api_visible_top_level_comments: z.number().int().nonnegative().optional(),
    provider_request_attempts: z.number().int().nonnegative(),
    normalized_output_bytes: z.number().int().nonnegative(),
    normalized_text_bytes: z.number().int().nonnegative(),
    elapsed_ms: z.number().nonnegative()
  }).strict().optional(),
  error: errorSchema.optional(),
  data: youtubeCommentDataUnionSchema
}).strict();

// A query-bounded search sees only the comments that match its terms, so no
// result, not even zero matches, says what the other comments contain.
const youtubeCommentSearchOutputSchema = youtubeCommentEnvelopeSchema.extend({
  absence_inference_permitted: z.literal(false)
}).strict();
const COMMENT_SEARCH_NON_EVIDENCE =
  "Query-bounded: matches show only comments that contain these terms. Zero or few matches are no evidence that " +
  "commenters do not report something; read the full comments with audit_youtube_video_community before saying so.";

function commentSearchOutput(result: object): z.output<typeof youtubeCommentSearchOutputSchema> {
  return youtubeCommentSearchOutputSchema.parse({ ...result, absence_inference_permitted: false });
}

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
const MUTATING_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const DEFAULT_PUBMED_PAGE_SIZE = 20;
const MAX_PUBMED_PAGE_SIZE = 100;
const DEFAULT_EUROPE_PMC_PAGE_SIZE = 20;
const MAX_EUROPE_PMC_PAGE_SIZE = 100;
const DEFAULT_CLINICAL_TRIALS_PAGE_SIZE = 20;
const MAX_CLINICAL_TRIALS_PAGE_SIZE = 100;
const PUBMED_EFETCH_LIMITATION =
  "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated.";
// MCP tools that wrap an existing research Action; the Action keeps its own route.
const ACTION_BACKED_MCP_OPERATION_NAMES = new Set([
  "assess_treatment_landscape_coverage",
  "scout_gemini_youtube_candidates",
  "finalize_research"
]);
const OPEN_FULL_TEXT_MCP_OPERATION_NAMES = new Set([
  "acquire_open_full_text",
  "continue_open_full_text",
  "validate_study_method_audit",
  "validate_review_method_audit"
]);
const PRIVATE_MCP_OPERATION_NAMES = new Set([
  "review_evidence_gap_submissions",
  "review_research_contribution",
]);
// Public protocol identity, the same as GET /version: it needs no sign-in or
// research mode, so asking which version is loaded always gets an answer.
const PUBLIC_IDENTITY_OPERATION_NAMES = new Set(["get_protocol_manifest"]);
const RESEARCH_ACCESS_CONTROL_OPERATION_NAMES = new Set([
  "manage_research_access",
  "submit_research_contribution",
]);
// The GPT keeps its own lesson Action, so the connector's lesson tool has no
// research Action path; paid-private findings are saved from the connector only.
const CONNECTOR_ONLY_OPERATION_NAMES = new Set([
  "submit_lesson_candidate",
  "save_research_findings",
  // "Check this video" starts on MCP; a Custom GPT Action follows only if it fits (AskRigor#248).
  "extract_youtube_video_claims",
]);

/** The MCP endpoint a server is created for, recorded on saved findings cards. */
export type McpSurface = "/mcp" | "/mcp/gemini" | "/mcp/claude";

export interface RegisterToolsOptions {
  publicEvidenceGapReviewService?: PublicEvidenceGapIntakeService;
  oauthResourceMetadataUrl?: URL;
  allowedReviewerSubjects?: ReadonlySet<string>;
  researchContributorAccessService?: ResearchContributorAccessService;
  researchContributionReviewService?: ResearchContributionReviewService;
  researchAccessRequired?: boolean;
  /** Replaces the production lesson queue, for tests. */
  lessonSubmission?: (raw: unknown) => Promise<LessonSubmissionResult>;
  /** Replaces the production findings library, for tests. */
  findingsSave?: (raw: unknown, context: FindingsSaveContext) => Promise<FindingsSaveResult>;
  /** Whether the findings library is open; defaults to ASKRIGOR_FINDINGS_LIBRARY. */
  findingsLibrary?: boolean;
  /** How long finalize_research waits for a findings save; replaced for tests. */
  findingsSaveDeadlineMilliseconds?: number;
  mcpSurface?: McpSurface;
  /** The versions this server runs, shown first in get_protocol_manifest's description. */
  runningVersions?: RunningVersions;
  /** What happened to this request's sign-in on /mcp; undefined without OAuth. */
  signIn?: SignInState;
}

// A findings save never holds back the answer for long: past this, the answer
// goes ahead and the save, which carries on, is reported unconfirmed.
const FINDINGS_SAVE_DEADLINE_MILLISECONDS = 10_000;

function defineResearchOperations(
  registrar: Pick<McpServer, "registerTool">,
  options: RegisterToolsOptions,
): void {
  registrar.registerTool(
    "get_protocol_manifest",
    {
      // Clients show tool descriptions in their plugin panels, so the versions
      // lead; a client keeps the tool list until it is refreshed, so the
      // description says when they applied and the tool gives the current ones.
      description: (options.runningVersions === undefined
        ? ""
        : `Versions when this tool list was loaded: ${runningVersionsText(options.runningVersions)}. `) +
        "Return canonical protocol identity and SHA-256 metadata.",
      inputSchema: {
        protocol: protocolSchema.describe("Canonical protocol to inspect.")
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        manifest: manifestSchema.optional(),
        // Whether this connection's research calls will be accepted: this call needs no sign-in, so it can say why
        // the others are refused when a client shows only a generic error for them.
        connection: researchConnectionSchema.optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol }, extra) => {
      try {
        const manifest = await getProtocolManifest(protocol);
        const connection = await researchConnection(extra, {
          service: options.researchContributorAccessService,
          signIn: options.signIn,
        });
        return successfulToolResult(
          `Protocol manifest: ${manifest.name} ${manifest.version} (${manifest.revisionDate}); SHA-256 ${manifest.sha256}.` +
            (connection === undefined ? "" : ` ${researchConnectionSummary(connection)}`),
          { ok: true, protocol, manifest, ...(connection === undefined ? {} : { connection }) }
        );
      } catch (error) {
        return protocolErrorResult(protocol, error);
      }
    }
  );

  registrar.registerTool(
    "load_protocol",
    {
      // The compact Gemini catalog has a 25,000-byte budget, so usage lives in
      // this description and the parameters carry no descriptions.
      description:
        'Canonical protocol text in 40,000-byte pages. section "index" lists sections; ' +
        "section <name> loads one; page N continues.",
      inputSchema: {
        protocol: protocolSchema,
        section: z.string().optional(),
        page: z.number().optional()
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        manifest: manifestSchema.optional(),
        index: z.array(protocolSectionIndexSchema).optional(),
        core_sections: z.array(z.string()).optional(),
        scope: z.enum(["full", "section"]).optional(),
        section: z.string().optional(),
        page: z.number().int().optional(),
        page_count: z.number().int().optional(),
        next_page: z.number().int().optional(),
        complete: z.boolean().optional(),
        byte_start: z.number().int().optional(),
        byte_end_exclusive: z.number().int().optional(),
        scope_bytes: z.number().int().optional(),
        scope_sha256: z.string().optional(),
        text: z.string().optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol, section, page }) => {
      try {
        const snapshot = await loadProtocolSectionSnapshot(protocol);
        const { manifest, sections } = snapshot;
        if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
          return protocolRequestError(protocol, "protocol_page_out_of_range", "Pages are whole numbers from 1.");
        }
        if (section === PROTOCOL_INDEX_SECTION) {
          if (page !== undefined && page !== 1) {
            return protocolRequestError(
              protocol,
              "protocol_request_invalid",
              "The index has one page."
            );
          }
          const core = sections.filter((entry) => entry.core).map(({ name }) => name);
          return successfulToolResult(
            `${manifest.name} ${manifest.version} index: ${sections.length} sections. ` +
              `Load the core sections first (${core.join(", ")}), then each runtime section your question needs, ` +
              "before the step that uses it. Sections marked runtime: false are maintainer material.",
            {
              ok: true,
              protocol,
              manifest,
              index: sections.map(({ name, bytes, pages, core: isCore, runtime, summary, sha256 }) => ({
                name,
                bytes,
                pages,
                core: isCore,
                runtime,
                sha256,
                summary
              })),
              core_sections: core
            }
          );
        }
        const bytes = Buffer.from(snapshot.text, "utf8");
        const target = section === undefined
          ? undefined
          : sections.find(({ name }) => name === section);
        if (section !== undefined && target === undefined) {
          return protocolRequestError(
            protocol,
            "protocol_section_not_found",
            `${manifest.name} has no top-level section named ${section}. Call load_protocol with section "index" for exact names.`
          );
        }
        const scope = target === undefined
          ? bytes
          : bytes.subarray(target.byte_start, target.byte_end_exclusive);
        const requestedPage = page ?? 1;
        const pageCount = target?.pages ?? protocolTextPage(scope, 1).page_count;
        if (requestedPage > pageCount) {
          return protocolRequestError(
            protocol,
            "protocol_page_out_of_range",
            `Page ${requestedPage} does not exist; this text has ${pageCount} page${pageCount === 1 ? "" : "s"}.`
          );
        }
        const textPage = protocolTextPage(scope, requestedPage);
        const offset = target?.byte_start ?? 0;
        const label = target === undefined
          ? `complete canonical ${manifest.name} text`
          : `${manifest.name} section ${target.name}`;
        return successfulToolResult(
          `Loaded ${label}, page ${textPage.page} of ${textPage.page_count} (exact canonical bytes).` +
            (textPage.complete ? "" : ` Call load_protocol again with page ${textPage.page + 1} to continue.`),
          {
            ok: true,
            protocol,
            manifest,
            scope: target === undefined ? "full" : "section",
            ...(target === undefined ? {} : { section: target.name }),
            page: textPage.page,
            page_count: textPage.page_count,
            ...(textPage.complete ? {} : { next_page: textPage.page + 1 }),
            complete: textPage.complete,
            byte_start: offset + textPage.byte_start,
            byte_end_exclusive: offset + textPage.byte_end_exclusive,
            scope_bytes: textPage.scope_bytes,
            scope_sha256: textPage.scope_sha256,
            text: textPage.text
          }
        );
      } catch (error) {
        return protocolErrorResult(protocol, error);
      }
    }
  );

  registrar.registerTool(
    "verify_protocol_integrity",
    {
      description: "Validate canonical protocol structure and optionally match its SHA-256.",
      inputSchema: {
        protocol: protocolSchema.describe("Canonical protocol to verify."),
        expected_sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional()
          .describe("Optional lowercase SHA-256 digest that must match exactly.")
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        verified: z.boolean().optional(),
        manifest: manifestSchema.optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol, expected_sha256 }) => {
      try {
        const manifest = await verifyIntegrity(protocol, expected_sha256);
        return successfulToolResult(
          `Protocol integrity verified for ${manifest.name}; SHA-256 ${manifest.sha256}.`,
          { ok: true, protocol, verified: true, manifest }
        );
      } catch (error) {
        return protocolErrorResult(protocol, error);
      }
    }
  );

  registrar.registerTool(
    "search_pubmed",
    {
      description:
        "Search PubMed citations and return stable PMIDs with titles, explicit pagination and access state; no medical conclusions are generated.",
      inputSchema: searchPubmedInputSchema,
      outputSchema: pubmedSearchEnvelopeSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, date_range, page_size, cursor }) => {
      try {
        const search = (pageSize: number | undefined) => searchPubmed(
          {
            query,
            ...(date_range === undefined ? {} : { dateRange: date_range }),
            ...(pageSize === undefined ? {} : { pageSize }),
            ...(cursor === undefined ? {} : { cursor })
          },
          ncbiConfig()
        );
        const pubmedTotal = (page: { raw_metadata?: unknown }) =>
          (page.raw_metadata as { total_count?: number } | undefined)?.total_count;
        const result = await readSmallSearchWhole(await search(page_size), cursor === undefined, pubmedTotal, search);
        const total = pubmedTotal(result);
        return withResearchReceipt(pubmedToolResult(
          `PubMed search returned ${result.pagination.returned} PMID record(s); access status ${result.access_status}.` +
            sparseSearchNote(total),
          result
        ), literatureSearchReceipt("pubmed", query, result, total));
      } catch (error) {
        return pubmedToolResult(
          "PubMed search retrieval failed; access status error.",
          pubmedSearchFailure(query, date_range, page_size, cursor, error)
        );
      }
    }
  );

  registrar.registerTool(
    "fetch_pubmed_record",
    {
      description:
        "Retrieve one PubMed citation by PMID, preserving only metadata PubMed supplies and making no full-text or medical inference.",
      inputSchema: z.object({
        pmid: z.string().regex(/^[1-9]\d{0,15}$/).describe("PubMed identifier.")
      }).strict(),
      outputSchema: pubmedRecordEnvelopeSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ pmid }) => {
      try {
        const result = await fetchPubmedRecord(pmid, ncbiConfig());
        // The receipt records whether PubMed lists a DOI or a PMC copy, which
        // decides whether finalize_research may accept this PMID as a lead
        // without acquisition.
        const record = result.data as { pmid?: string; doi?: string; pmcid?: string } | undefined;
        const retrieved = result.access_status === "api_visible_complete" || result.access_status === "complete";
        return withResearchReceipt(pubmedToolResult(
          `PubMed record ${pmid} retrieval finished with access status ${result.access_status}.`,
          result
        ), retrieved && record?.pmid === pmid
          ? researchReceipt("pubmed_record", { pmid, doi: record.doi, pmcid: record.pmcid })
          : undefined);
      } catch (error) {
        return pubmedToolResult(
          `PubMed record ${pmid} retrieval failed; access status error.`,
          pubmedRecordFailure(pmid, error)
        );
      }
    }
  );

  registrar.registerTool(
    "search_europe_pmc",
    {
      description:
        "Search Europe PMC records while preserving provider source identifiers and cursors with explicit pagination and access state; no medical conclusions are generated.",
      inputSchema: searchEuropePmcInputSchema,
      outputSchema: europePmcSearchEnvelopeSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, date_range, page_size, cursor }) => {
      try {
        const search = (pageSize: number | undefined) => searchEuropePmc({
          query,
          ...(date_range === undefined ? {} : { dateRange: date_range }),
          ...(pageSize === undefined ? {} : { pageSize }),
          ...(cursor === undefined ? {} : { cursor })
        });
        const europePmcTotal = (page: { raw_metadata?: unknown }) =>
          (page.raw_metadata as { hit_count?: number } | undefined)?.hit_count;
        const result = await readSmallSearchWhole(await search(page_size), cursor === undefined, europePmcTotal, search);
        const total = europePmcTotal(result);
        return withResearchReceipt(europePmcToolResult(
          `Europe PMC search returned ${result.pagination.returned} record(s); access status ${result.access_status}.` +
            sparseSearchNote(total),
          result
        ), literatureSearchReceipt("europepmc", query, result, total));
      } catch (error) {
        return europePmcToolResult(
          "Europe PMC search retrieval failed; access status error.",
          europePmcSearchFailure(query, date_range, page_size, cursor, error)
        );
      }
    }
  );

  registerOpenFullTextMcpTools(registrar, options);

  registrar.registerTool(
    "search_clinical_trials",
    {
      description:
        "Search ClinicalTrials.gov studies with provider pagination and explicit access state; no medical conclusions are generated.",
      inputSchema: searchClinicalTrialsInputSchema,
      outputSchema: clinicalTrialsSearchEnvelopeSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, page_size, page_token }) => {
      try {
        const result = await searchClinicalTrials({
          query,
          ...(page_size === undefined ? {} : { pageSize: page_size }),
          ...(page_token === undefined ? {} : { pageToken: page_token })
        });
        // ClinicalTrials.gov gives no total: a first page that ends the results is all of them.
        const total = page_token === undefined && result.pagination.exhausted ? result.pagination.returned : undefined;
        return withResearchReceipt(clinicalTrialsToolResult(
          `ClinicalTrials.gov search returned ${result.pagination.returned} study record(s); access status ` +
            `${result.access_status}.${sparseSearchNote(total)}`,
          result
        ), literatureSearchReceipt("ctgov", query, result, total));
      } catch (error) {
        return clinicalTrialsToolResult(
          "ClinicalTrials.gov search retrieval failed; access status error.",
          clinicalTrialsSearchFailure(query, page_size, page_token, error)
        );
      }
    }
  );

  registrar.registerTool(
    "fetch_clinical_trial",
    {
      description:
        "Retrieve one ClinicalTrials.gov study by NCT ID, preserving supplied metadata without medical inference.",
      inputSchema: z.object({
        nct_id: z.string().regex(/^NCT\d{8}$/).describe("ClinicalTrials.gov NCT identifier.")
      }).strict(),
      outputSchema: clinicalTrialEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ nct_id }) => {
      try {
        const result = await fetchClinicalTrial(nct_id);
        return clinicalTrialsToolResult(
          `ClinicalTrials.gov study ${nct_id} retrieval finished with access status ${result.access_status}.`,
          result
        );
      } catch (error) {
        return clinicalTrialsToolResult(
          `ClinicalTrials.gov study ${nct_id} retrieval failed; access status error.`,
          clinicalTrialFailure(nct_id, error)
        );
      }
    }
  );

  registrar.registerTool(
    "resolve_doi",
    {
      description:
        "Resolve a DOI or bibliographic citation through Crossref metadata; no medical conclusions are generated.",
      inputSchema: z.object({
        doi_or_citation: z.string().trim().min(1).max(5_000).describe(
          "DOI URL, doi: identifier, bare DOI, or bibliographic citation."
        )
      }).strict(),
      outputSchema: doiResolutionEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ doi_or_citation }) => {
      try {
        const result = await resolveDoi(doi_or_citation, crossrefConfig());
        return crossrefToolResult(
          `Crossref DOI resolution finished with access status ${result.access_status}.`,
          result
        );
      } catch (_error) {
        return crossrefToolResult(
          "Crossref DOI resolution failed; access status error.",
          crossrefResolveFailure()
        );
      }
    }
  );

  registrar.registerTool(
    "check_retraction_status",
    {
      description:
        "Check traceable Crossref update metadata for a DOI without inferring validity, safety, or medical conclusions.",
      inputSchema: z.object({
        identifier: z.string().trim().min(1).max(5_000).describe(
          "DOI URL, doi: identifier, or bare DOI to inspect."
        )
      }).strict(),
      outputSchema: retractionStatusEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ identifier }) => {
      try {
        const result = await checkRetractionStatus(identifier, crossrefConfig());
        return crossrefToolResult(
          `Crossref retraction-status lookup finished with status ${result.data.status}; access status ${result.access_status}.`,
          result
        );
      } catch (_error) {
        return crossrefToolResult(
          "Crossref retraction-status lookup finished with status unknown; access status error.",
          crossrefRetractionFailure()
        );
      }
    }
  );

  registrar.registerTool(
    "search_youtube",
    {
      description:
        "Search YouTube videos and return API-visible metadata with explicit pagination and access state; no medical conclusions are generated. " +
          "For research, pass research_target so the search counts as a discovery round.",
      inputSchema: youtubeSearchInputSchema,
      outputSchema: youtubeSearchEnvelopeSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, page_size, cursor, research_target }) => {
      try {
        const result = await searchYoutube({
          query,
          ...(page_size === undefined ? {} : { pageSize: page_size }),
          ...(cursor === undefined ? {} : { cursor })
        }, youtubeConfig());
        const videos = result.data.flatMap((record) =>
          "video_id" in record && typeof record.video_id === "string" ? [record.video_id] : []
        );
        // A search a rate limit or the daily quota stopped is signed too: its
        // signed limit keeps discovery open until it is rerun.
        return withResearchReceipt(youtubeToolResult(
          `YouTube search returned ${result.pagination.returned} video record(s); access status ${result.access_status}.`,
          result
        ), researchReceipt("youtube_search", {
          videos,
          access: result.access_status,
          ...searchLimits([result]),
          q: discoveryQueryDigest([query]),
          target: research_target === undefined ? undefined : researchTargetDigest(research_target),
          // An unread results page is discovery still to do, not a settled round;
          // the receipt of a search that reads the next page signs it, which settles it.
          open: result.pagination.next_cursor === undefined ? 0 : 1,
          pg: cursor === undefined || !pageRead(result.access_status) ? undefined : pageKey(query, cursor),
          nx: result.pagination.next_cursor === undefined ? undefined : pageKey(query, result.pagination.next_cursor)
        }), true);
      } catch (_error) {
        return youtubeToolResult(
          "YouTube search returned 0 video record(s); access status error.",
          youtubeSearchFailure(query, page_size, cursor)
        );
      }
    }
  );

  registrar.registerTool(
    "get_youtube_video",
    {
      description:
        "Retrieve one API-visible YouTube video by supported ID or URL without interpreting its content or making medical conclusions.",
      inputSchema: z.object({
        video_id_or_url: z.string().min(1).max(2_048).describe(
          "Supported YouTube video ID, youtu.be URL, youtube.com watch URL, or YouTube Shorts URL."
        )
      }).strict(),
      outputSchema: youtubeVideoEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ video_id_or_url }) => {
      try {
        const result = await getYoutubeVideo(video_id_or_url, youtubeConfig());
        return youtubeToolResult(
          `YouTube video retrieval finished with access status ${result.access_status}.`,
          result
        );
      } catch (_error) {
        return youtubeToolResult(
          "YouTube video retrieval finished with access status error.",
          youtubeVideoFailure()
        );
      }
    }
  );

  registrar.registerTool(
    "get_youtube_comments",
    {
      description:
        "Retrieve all API-visible YouTube top-level comments and, by default, every independently paginated reply with explicit completeness accounting; no medical conclusions are generated.",
      inputSchema: youtubeCommentBaseInputSchema,
      outputSchema: youtubeCommentEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ video_id_or_url, include_replies, cursor }) => {
      try {
        const result = await getYoutubeComments({
          video: video_id_or_url,
          includeReplies: include_replies,
          ...(cursor === undefined ? {} : { cursor })
        }, youtubeConfig(), { budgets: youtubeCommentBudgets() });
        return youtubeToolResult(
          `YouTube comment retrieval returned ${result.pagination.returned} comment/reply record(s); access status ${result.access_status}.`,
          result
        );
      } catch (_error) {
        const result = youtubeCommentsFailure();
        return youtubeToolResult(
          "YouTube comment retrieval returned 0 comment/reply record(s); access status error.",
          result
        );
      }
    }
  );

  registrar.registerTool(
    "search_youtube_comments",
    {
      description:
        "Retrieve a query-bounded API-visible YouTube comment-thread subset and independently paginate replies with explicit partial coverage; no medical conclusions are generated.",
      inputSchema: youtubeCommentSearchInputSchema,
      outputSchema: youtubeCommentSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ video_id_or_url, query, include_replies, cursor }) => {
      try {
        const result = await searchYoutubeComments({
          video: video_id_or_url,
          query,
          includeReplies: include_replies,
          ...(cursor === undefined ? {} : { cursor })
        }, youtubeConfig(), { budgets: youtubeCommentBudgets() });
        return youtubeToolResult(
          `YouTube targeted comment retrieval returned ${result.pagination.returned} comment/reply record(s); access status ${result.access_status}. ${COMMENT_SEARCH_NON_EVIDENCE}`,
          commentSearchOutput(result)
        );
      } catch (_error) {
        const result = youtubeCommentsFailure(query);
        return youtubeToolResult(
          `YouTube targeted comment retrieval returned 0 comment/reply record(s); access status error. ${COMMENT_SEARCH_NON_EVIDENCE}`,
          commentSearchOutput(result)
        );
      }
    }
  );

  registrar.registerTool(
    "audit_youtube_community",
    {
      description:
        "YouTube community evidence in one read-only call: search YouTube, deduplicate bounded provider-ranked videos, retrieve metadata, unfiltered comments and all accessible replies, and return a deterministic receipt for these videos; no medical conclusions are generated. " +
          "It covers YouTube only: use it when YouTube is one of the places people discussing the question talk, and search the others, such as Reddit or a specialist forum, with your own web search. " +
          "research_question must be the research_target given to the other tools.",
      inputSchema: youtubeCommunityAuditInputSchema,
      outputSchema: mcpYoutubeCommunityAuditOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input, extra) => {
      let result: YoutubeCommunityAuditOutput;
      let failed = false;
      try {
        result = await auditYoutubeCommunity(
          input,
          youtubeConfig(),
          { budgets: youtubeCommunityAuditBudgets() }
        );
      } catch (_error) {
        result = youtubeCommunityAuditFailure(input);
        failed = true;
      }
      const summary = `YouTube community audit selected ${result.receipt.selected_video_ids.length} video(s); comment retrieval ${result.receipt.completion_state}; YouTube comments lock ${result.receipt.synthesis_lock} (these videos only).`;
      // The Custom GPT Action bounds the full audit itself.
      if (isActionCall(extra)) return youtubeToolResult(summary, result);
      // An incomplete audit still signs what it found and the searches a limit
      // stopped, which keep discovery open; only a failed call signs nothing.
      // `read` names the videos whose comments the model receives, so a video
      // whose comments did not fit the view needs no findings.
      const receiptFor = (read: string[]) => !failed
        ? researchReceipt("youtube_community_audit", {
            videos: result.receipt.selected_video_ids,
            read,
            // Its searches' access, apart from any comment boundary.
            access: searchLimits(result.searches).inc === 0 ? "complete" : "partial",
            ...searchLimits(result.searches),
            state: result.receipt.completion_state,
            lock: result.receipt.synthesis_lock,
            q: discoveryQueryDigest(input.searches.map(({ query }) => query)),
            target: researchTargetDigest(input.research_question),
            open: unreadResultPages(result.searches),
            ...pageClaims(input.searches.map(({ query }) => query), result.searches)
          })
        : undefined;
      let view: McpYoutubeCommunityAuditOutput;
      try {
        view = compactYoutubeCommunityAuditForMcp(
          result,
          // Room for the longest text and receipt this result can carry.
          MCP_YOUTUBE_AUDIT_MAX_BYTES - reservedResultBytes(
            `${summary} ${MCP_COMMENT_FINDINGS_HANDOFF} ${MCP_COMMENTS_NOT_SHOWN}`,
            receiptFor(result.receipt.selected_video_ids)
          ),
          MCP_BOUNDED_SAMPLE_LIMITATION
        );
      } catch (error) {
        if (!(error instanceof YoutubeMcpResponseTooLargeError)) throw error;
        // Never a truncated result: the client would cut it and lose the audit.
        return {
          content: [{
            type: "text",
            text: "YouTube community audit could not complete: youtube_community_audit_response_too_large. Use " +
              "survey_youtube_community with shorter queries, then audit_youtube_video_community for each video."
          }],
          isError: true
        };
      }
      const read = view.videos.filter(({ sample }) => (sample?.comments.length ?? 0) > 0).map(({ video_id }) => video_id);
      // Every video with comments shows the same number of them, so either
      // each shows some or, when even one per video does not fit, none does.
      const unshown = view.videos.some(({ sample }) => sample !== undefined && sample.corpus_count > 0 && sample.comments.length === 0);
      const text = failed
        ? summary
        : read.length > 0
          ? `${summary} ${MCP_COMMENT_FINDINGS_HANDOFF}`
          : unshown ? `${summary} ${MCP_COMMENTS_NOT_SHOWN}` : summary;
      return withResearchReceipt(youtubeToolResult(text, view), receiptFor(read), true);
    }
  );

  registrar.registerTool(
    "survey_youtube_community",
    {
      description:
        "Survey bounded YouTube video candidates for a community-evidence question and return deduplicated metadata, canonical watch links, provider comment counts, pagination, and access receipts; no medical conclusions are generated. It covers YouTube only. " +
          "For research, research_question must be the research_target given to the other tools.",
      inputSchema: youtubeCommunitySurveyInputSchema,
      outputSchema: youtubeCommunitySurveyOutputSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => {
      let result: YoutubeCommunitySurveyOutput;
      let failed = false;
      try {
        result = await surveyYoutubeCommunity(input, youtubeConfig());
      } catch (_error) {
        result = youtubeCommunitySurveyFailure(input);
        failed = true;
      }
      // A round whose searches a rate limit or the daily quota stopped is
      // signed too: its limits keep discovery open. Only a failed call signs nothing.
      return withResearchReceipt(youtubeToolResult(
        `YouTube community survey returned ${result.candidates.length} deduplicated candidate video(s).`,
        result
      ), !failed
        ? researchReceipt("youtube_survey", {
            access: result.access_status,
            ...searchLimits(result.searches),
            searches: result.searches.length,
            videos: result.candidates.map(({ video_id }) => video_id),
            q: discoveryQueryDigest(input.searches.map(({ query }) => query)),
            target: researchTargetDigest(input.research_question),
            open: unreadResultPages(result.searches),
            ...pageClaims(input.searches.map(({ query }) => query), result.searches)
          })
        : undefined, true);
    }
  );

  registrar.registerTool(
    "audit_youtube_video_community",
    {
      description:
        "Retrieve one material YouTube video's unfiltered API-visible top-level comments and independently paginated replies through authenticated stateless continuation. Returns exact retrieved-versus-analyzed counts and a separate receipt covering this video only; the comment sample comes with the last page (or when the chain stops), for bounded review; no medical conclusions are generated. Sample records are compact: id, reply_to, a per-video pseudonymous author key for counting distinct people, date, likes, text.",
      inputSchema: MCP_YOUTUBE_VIDEO_AUDIT_INPUT_SCHEMA,
      outputSchema: mcpYoutubeVideoCommunityAuditOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (rawInput, extra) => {
      // A continuation token carries the chain's video and analysis limit, so
      // anything else sent with it is ignored rather than failing the audit.
      const input = rawInput.continuation_token === undefined
        ? rawInput
        : { continuation_token: rawInput.continuation_token };
      const actionCall = isActionCall(extra);
      // An MCP call reads longer only while one of a few process-wide slots is
      // free; otherwise it uses the Action's budget.
      const releaseLongSlot = actionCall ? undefined : LONG_VIDEO_AUDIT_SLOTS.tryAcquire();
      const long = releaseLongSlot !== undefined;
      let result: YoutubeVideoCommunityAuditOutput;
      try {
        result = await auditYoutubeVideoCommunity(input, {
          youtube: youtubeConfig(),
          continuation_secret: youtubeAuditContinuationSecret()
        }, {
          max_elapsed_ms: long
            ? PUBLIC_TOOL_LIMITS.mcpYoutubeVideoAuditElapsedMs
            : PUBLIC_TOOL_LIMITS.youtubeVideoAuditElapsedMs,
          segment: {
            max_provider_requests: long
              ? PUBLIC_TOOL_LIMITS.mcpYoutubeVideoAuditProviderRequests
              : PUBLIC_TOOL_LIMITS.youtubeVideoAuditProviderRequests
          }
        });
      } catch (error) {
        result = youtubeVideoCommunityAuditFailure(input, error);
      } finally {
        releaseLongSlot?.();
      }
      const summary = `YouTube video audit retrieved ${result.records_retrieved_cumulative} record(s) cumulatively; this video's comments lock ${result.receipt.synthesis_lock} (this video only).`;
      // The Custom GPT Action bounds the full audit itself.
      if (actionCall) return youtubeToolResult(summary, result);
      const complete = result.receipt.completion_state !== "incomplete";
      // What the final view returns: findings are needed only for comments the
      // model received, and the coverage check reads the audit's depth from
      // these counts, so they are the view's, not the untrimmed audit's.
      const receiptFor = (returned: { shown: number; ret: number; rtop: number; rrep: number }) => !complete
        ? undefined
        : researchReceipt("youtube_video_audit", {
            video: result.video_id,
            state: result.receipt.completion_state,
            lock: result.receipt.synthesis_lock,
            records: result.records_retrieved_cumulative,
            shown: returned.shown,
            // The audit's depth, so the coverage check needs no copy of it.
            ch: result.channel_id ?? undefined,
            ms: result.metadata_access_status,
            acc: result.access_status,
            cov: result.extraction_coverage,
            prc: result.provider_reported_comments,
            top: result.top_level_comments_retrieved_cumulative,
            rep: result.replies_retrieved_cumulative,
            ret: returned.ret,
            rtop: returned.rtop,
            rrep: returned.rrep,
            mm: result.reply_count_mismatches.length,
            cr: result.continuation_recommended ? 1 : 0,
            f: result.receipt.chain_started_at_first_page ? 1 : 0,
            tx: result.receipt.top_level_pagination_exhausted ? 1 : 0,
            rr: result.receipt.replies_reconciled ? 1 : 0,
            bl: result.receipt.blockers.length
          });
      let view: McpYoutubeVideoCommunityAuditOutput;
      try {
        view = compactYoutubeAuditForMcp(
          result,
          // Room for the longest text and receipt this result can carry.
          MCP_YOUTUBE_AUDIT_MAX_BYTES - reservedResultBytes(
            complete ? `${summary} ${MCP_COMMENT_FINDINGS_HANDOFF} ${MCP_VIDEO_COMMENTS_NOT_SHOWN}` : summary,
            // The untrimmed counts are never smaller, so they reserve enough room.
            receiptFor({
              shown: result.records_returned_for_analysis,
              ret: result.records_returned_for_analysis,
              rtop: result.top_level_records_returned_for_analysis,
              rrep: result.reply_records_returned_for_analysis
            })
          ),
          MCP_BOUNDED_SAMPLE_LIMITATION
        );
      } catch (error) {
        if (!(error instanceof YoutubeMcpResponseTooLargeError)) throw error;
        // Never a truncated result: the client would cut it and lose the
        // continuation token or the receipt.
        return {
          content: [{
            type: "text",
            text: "YouTube video audit could not return its state: youtube_video_community_audit_response_too_large " +
              `after ${result.records_retrieved_cumulative} record(s). This video's audit cannot continue; state it as ` +
              "incomplete and continue with the other videos."
          }],
          isError: true
        };
      }
      const shown = view.sample?.comments.length ?? 0;
      const text = !complete
        ? summary
        : shown > 0
          ? `${summary} ${MCP_COMMENT_FINDINGS_HANDOFF}`
          : result.records_retrieved_cumulative > 0 ? `${summary} ${MCP_VIDEO_COMMENTS_NOT_SHOWN}` : summary;
      return withResearchReceipt(youtubeToolResult(text, view), receiptFor({
        shown,
        ret: view.records_returned_for_analysis,
        rtop: view.top_level_records_returned_for_analysis,
        rrep: view.reply_records_returned_for_analysis
      }));
    }
  );

  registrar.registerTool(
    "get_research_frontier",
    {
      description: "Retrieve an exact stored formal research frontier by frontier UUID, question UUID, or canonical topic key, including current coverage, candidates, unresolved trails, and optionally append-only history. Repository state is research control metadata, not evidence or a health conclusion. Retrieval is read-only and never contributes or updates a frontier.",
      inputSchema: researchFrontierInputSchema,
      outputSchema: researchFrontierOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => researchFrontierToolResult(input, {
      reader: RESEARCH_FRONTIER_READER
    })
  );

  registrar.registerTool(
    "search_research_frontiers",
    {
      description: "Search the stored formal research-frontier catalog by topic labels, aliases, research questions, and structured question dimensions. Returns bounded selectors and explicit partial, blocked, gap, and currentness-not-assessed state; catalog matches are research control metadata, not evidence or health conclusions. Retrieval is read-only and never contributes or updates a frontier.",
      inputSchema: researchFrontierSearchInputSchema,
      outputSchema: researchFrontierSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => researchFrontierSearchToolResult(input, {
      reader: RESEARCH_FRONTIER_READER,
    }),
  );

  registrar.registerTool(
    "manage_research_access",
    {
      description: `Shows or sets AskRigor's research-use mode. Inspecting it is the first step of research, and it shows why a research tool was refused. Free use requires explicit agreement to version ${RESEARCH_USE_NOTICE_VERSION}: what AskRigor learns from the research (deidentified structured research progress and each finished answer's findings card) is saved for non-authoritative review. Paid private mode saves an answer's findings card or lesson feedback only when the user accepts saving it for that answer, and activates only for an existing verified entitlement; this release offers no price or checkout.`,
      inputSchema: manageResearchAccessInputSchema,
      outputSchema: manageResearchAccessOutputSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    createManageResearchAccessHandler({
      service: options.researchContributorAccessService,
      resourceMetadataUrl: options.oauthResourceMetadataUrl,
      signIn: options.signIn,
    }),
  );

  registrar.registerTool(
    "submit_research_contribution",
    {
      description: "Files one already-validated, deidentified formal research frontier in the pending review inbox. Study and review audits validated in free contributor research are filed by the server when finalize_research passes, so they are not submitted here. It accepts no raw chat, prompts, identity or contact details, private health narratives, uploads, raw source or provider bodies, or YouTube or community data. A proposal is not canonical evidence and does not gain scientific authority by submission. Paid-private mode cannot use this operation.",
      inputSchema: submitResearchContributionInputSchema,
      outputSchema: submitResearchContributionOutputSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    createSubmitResearchContributionHandler({
      service: options.researchContributorAccessService,
      resourceMetadataUrl: options.oauthResourceMetadataUrl,
      signIn: options.signIn,
    }),
  );

  registrar.registerTool(
    "review_research_contribution",
    {
      description: "Owner-only review of one deidentified pending research contribution. Inspect the exact payload and hash, then accept or reject with a reason. Acceptance creates a hash-bound pending promotion intent but this public-runtime call never writes canonical evidence; a separate one-shot administrator completes promotion.",
      inputSchema: researchContributionReviewInputSchema,
      outputSchema: researchContributionReviewOutputSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    createResearchContributionReviewHandler({
      service: options.researchContributionReviewService,
      resourceMetadataUrl: options.oauthResourceMetadataUrl,
      allowedReviewerSubjects: options.allowedReviewerSubjects,
    }),
  );

  registrar.registerTool(
    "review_evidence_gap_submissions",
    {
      description: `Retrieve the private, deidentified review projection for submitted cases in the ${PUBLIC_PROLACTINOMA_GAP_SLUG} evidence gap. Requires OAuth scope cases:review. Participant-reported cases remain explicitly unverified and noncausal; partial and comparison cases are retained and labeled.`,
      inputSchema: evidenceGapReviewInputSchema,
      outputSchema: evidenceGapReviewOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    createEvidenceGapReviewHandler({
      service: options.publicEvidenceGapReviewService,
      resourceMetadataUrl: options.oauthResourceMetadataUrl,
      allowedReviewerSubjects: options.allowedReviewerSubjects,
    }),
  );

  registrar.registerTool(
    "assess_treatment_landscape_coverage",
    {
      description:
        "In deep research, check treatment-landscape coverage before a broad treatment answer: program diversity, " +
        "selection coverage and per-video depth (a first pass skips this check and presents any comparison as " +
        "provisional). Pass your research receipts and only your judgment: treatment classes, program " +
        "fingerprints, each discovered video as selected (with its four short notes), screened (fingerprint, " +
        "materiality, why not selected) or not material (IDs by class), the classes each round searched, and " +
        "specific-program searches with that round's exact queries. The server builds the discovery rounds " +
        "(batch IDs r<receipt index>), candidates, audit depth and scout frontier from the receipts. Creator claims " +
        "stay unverified because this connector has no transcript tool.",
      inputSchema: treatmentCoverageFromReceiptsInputSchema,
      outputSchema: treatmentCoverageFromReceiptsOutputSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => {
      const ledger = treatmentCoverageFromReceiptsInputSchema.parse(input);
      const secret = researchReceiptSecretFromEnv();
      if (secret === undefined) {
        return {
          content: [{
            type: "text",
            text: "This AskRigor server cannot verify research receipts, so it cannot check treatment coverage; " +
              "say that the treatment comparison was not server-checked."
          }],
          isError: true
        };
      }
      const result = assessTreatmentCoverageFromReceipts(ledger, { secret });
      // finalize_research binds a treatment comparison to the latest check.
      return withResearchReceipt(successfulToolResult(
        `Treatment-landscape coverage: synthesis lock ${result.synthesis_lock}; ` +
          `${result.material_videos_fully_audited} videos fully audited across ` +
          `${result.materially_distinct_programs_fully_audited} distinct programs; answer boundary ${result.answer_boundary}.` +
          (result.synthesis_lock === "pass"
            ? ""
            : " Fix the record problems first: selection_blockers not in breadth_gaps, and depth_blockers. " +
              "In a first pass, breadth_gaps become the answer's open leads once first_pass_complete is true."),
        result as unknown as Record<string, unknown>
      ), researchReceipt("treatment_coverage", {
        boundary: result.answer_boundary,
        lock: result.synthesis_lock,
        videos: result.videos_actually_audited.map(({ video_id }) => video_id),
        target: researchTargetDigest(ledger.research_target),
        // The checker widens a narrow label when the ledger shows a broad
        // space, so a true label is the stricter of the two.
        broad: ledger.broad_treatment_choice
      }));
    }
  );

  registrar.registerTool(
    "scout_gemini_youtube_candidates",
    {
      description:
        "Ask Gemini with Google Search for YouTube videos on a de-identified, population-level target, then validate " +
        "each video's identity. Describe a group of people, their condition and their goal (for example, adults trying " +
        "to avoid a hip replacement and what they tried), with no names, places or personal details, and not a list of " +
        "treatments: the scout searches natural, supplement, " +
        "self-directed and conventional angles itself. After auditing comments, call it again with the remedies, " +
        "methods and products the comments name as rediscovery_leads (short lowercase public terms), and a video " +
        "or creator as video:<id>; never commenter details. A grounded search takes about a minute, so the result may be pending with a " +
        "continuation_token; call again with only that token. Summaries are unverified leads. Give this same " +
        "research_target to every discovery tool and to finalize_research.",
      inputSchema: MCP_SCOUT_INPUT_SCHEMA,
      outputSchema: MCP_SCOUT_OUTPUT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => {
      const secret = researchReceiptSecretFromEnv();
      if (secret === undefined) return scoutError("gemini_scout_continuation_unavailable", false);
      let target: z.output<typeof automatedScoutInputSchema>;
      let leads: string[] = [];
      let resume: { checkpoint: GeminiYoutubeScoutBackgroundCheckpoint; accountedNanoUsd: number } | undefined;
      if (input.continuation_token !== undefined) {
        try {
          const state = decodeScoutContinuation(input.continuation_token, secret, Date.now());
          // The signed token's target and language win over any sent with it.
          target = {
            research_target: state.research_target,
            diagnosis_status: state.diagnosis_status,
            ...(state.language === undefined ? {} : { language: state.language })
          };
          leads = state.rediscovery_leads ?? [];
          resume = { checkpoint: state.checkpoint, accountedNanoUsd: state.accounted_nano_usd };
        } catch (error) {
          // An expired token still names the stored provider interaction:
          // delete it before reporting the expiry.
          if (error instanceof ScoutContinuationError && error.expiredState !== undefined) {
            const deleted = await deleteResumedGeminiScoutInteraction(error.expiredState.checkpoint);
            return scoutError(error.code, !deleted, deleted ? undefined : SCOUT_DELETION_RETRY);
          }
          return scoutError(
            error instanceof ScoutContinuationError ? error.code : "gemini_scout_continuation_invalid",
            false
          );
        }
        // The zero-spend gate holds for resumed scouts too: a poll is free, but
        // a resumed first interaction can start a repair request. A refused
        // scout's stored interaction is deleted.
        if (!geminiKeyDeclaredUnbilled()) {
          const deleted = await deleteResumedGeminiScoutInteraction(resume.checkpoint);
          return scoutError("gemini_scout_spend_not_authorized", !deleted,
            SCOUT_SPEND_GUIDANCE + (deleted ? "" : ` ${SCOUT_DELETION_RETRY}`));
        }
      } else {
        target = automatedScoutInputSchema.parse({
          research_target: input.research_target,
          diagnosis_status: input.diagnosis_status,
          ...(input.language === undefined ? {} : { language: input.language })
        });
        leads = input.rediscovery_leads ?? [];
        // The owner's zero-spend policy: a new scout starts a Gemini interaction,
        // so it runs only with a key the deployment declares has no billing.
        if (!geminiKeyDeclaredUnbilled()) {
          return scoutError("gemini_scout_spend_not_authorized", false, SCOUT_SPEND_GUIDANCE);
        }
        // Only screened, population-level text reaches Gemini.
        if (!isPopulationLevelResearchTarget(target.research_target)) {
          return scoutError("research_target_not_deidentified", false, SCOUT_TARGET_GUIDANCE);
        }
        if (!leads.every((lead) => VIDEO_LEAD.test(lead) || isPublicLeadTerm(lead))) {
          return scoutError("rediscovery_lead_not_public_term", false,
            "Give each lead as a short lowercase public term for a remedy, method or product (for example: collagen " +
              "peptides), with no names, pronouns, places or quotes from comments. Give a video or creator as " +
              "video:<id>.");
        }
        // Videos and creators travel as YouTube's own public title and channel.
        const resolved = await resolveVideoLeads(leads);
        if (resolved === undefined) {
          return scoutError("rediscovery_lead_video_unavailable", false,
            "A video:<id> lead is not an available YouTube video; remove it or use another video ID.");
        }
        leads = resolved;
      }

      // Poll within one call only while a further provider request still fits
      // under the client's tool timeout; otherwise hand back a continuation.
      const started = Date.now();
      const execution = await executeResumableAutomatedGeminiScout(
        target, resume, { deadlineMs: started + MCP_SCOUT_POLL_WINDOW_MS }, leads
      );
      if ("controller_boundary" in execution) {
        const { code, retryable } = execution.controller_boundary;
        return scoutError(code, retryable, code === "research_target_not_population_level"
          ? `Start a new scout without the continuation_token. ${SCOUT_TARGET_GUIDANCE}`
          : code === "gemini_youtube_scout_credits_depleted"
            ? "AskRigor's Gemini key has used up its prepaid credits, so the scout cannot run until its billing is " +
              "fixed. Use survey_youtube_community instead."
            : undefined);
      }
      if ("controller_progress" in execution) {
        const continuation = encodeScoutContinuation({
          ...target,
          ...(leads.length === 0 ? {} : { rediscovery_leads: leads }),
          checkpoint: execution.controller_progress.checkpoint,
          accounted_nano_usd: execution.controller_progress.accounted_nano_usd,
          expires_at_ms: Date.now() + SCOUT_CONTINUATION_TTL_MS
        }, secret);
        const heldBy = execution.controller_progress.held_by;
        return successfulToolResult(
          heldBy === undefined
            ? "Gemini scout is still searching. Call scout_gemini_youtube_candidates again with only this " +
              `continuation_token in about ${MCP_SCOUT_RETRY_AFTER_SECONDS} seconds.`
            : `Gemini scout is on hold (${heldBy}); its stored search is kept until a later call can ` +
              (heldBy === "research_target_not_population_level" ? "delete it" : "resume or delete it") +
              ". Continue discovery with survey_youtube_community, and call scout_gemini_youtube_candidates again " +
              "later with only this continuation_token.",
          MCP_SCOUT_OUTPUT_SCHEMA.parse({
            scout_status: "pending",
            ...target,
            ...(leads.length === 0 ? {} : { rediscovery_leads: leads }),
            continuation_token: continuation,
            retry_after_seconds: MCP_SCOUT_RETRY_AFTER_SECONDS
          })
        );
      }
      const { packet, validation, provider_storage_mode: storageMode } = execution.controller_completion;
      // Gemini often names a video without its ID, or garbles the ID. Look
      // those titles up on YouTube instead of losing the find.
      const notFound = new Set(validation.rejected_candidates
        .filter(({ rejection_reasons: reasons }) => reasons.includes("metadata_not_api_visible_complete"))
        .map(({ video_id }) => video_id));
      // An ID whose YouTube title is not the scout's is rejected with both
      // titles, for the model to judge: it is not searched again, since the ID
      // may well be the video, worded differently.
      const retitledIds = validation.rejected_candidates
        .filter(({ rejection_reasons: reasons }) => reasons.includes("declared_title_mismatch"))
        .map(({ video_id }) => video_id);
      const retitled = retitledIds.length;
      const confirmed = validation.validated_candidates;
      const titleLeads = [
        ...("title_only_candidates" in packet ? packet.title_only_candidates ?? [] : []),
        ...packet.candidates
          .filter(({ video_id }) => notFound.has(video_id))
          .map(({ title, channel, why_surfaced }) => ({ title, channel, why_surfaced }))
      ];
      // Title searches run in parallel; skip them when they might not finish
      // before the client gives up, and leave the titles as open leads.
      const lookupFits = Date.now() + MCP_SCOUT_TITLE_LOOKUP_MS <= started + MCP_SCOUT_CALL_LIMIT_MS;
      const titleLookup = titleLeads.length === 0 ? undefined : await lookUpScoutTitles(titleLeads, {
        config: youtubeConfig(),
        knownVideoIds: new Set(confirmed.map(({ video_id }) => video_id)),
        ...(lookupFits ? {} : { limit: 0 })
      });
      const output = MCP_SCOUT_OUTPUT_SCHEMA.parse({
        scout_status: "complete",
        ...target,
        ...(leads.length === 0 ? {} : { rediscovery_leads: leads }),
        discovery_queries: packet.discovery_queries,
        search_gaps: packet.search_gaps,
        validation,
        ...(titleLookup === undefined ? {} : { title_lookup: titleLookup }),
        ...(storageMode === undefined ? {} : { provider_storage_mode: storageMode })
      });
      if (Buffer.byteLength(JSON.stringify(output), "utf8") > MCP_SCOUT_MAX_BYTES) {
        return scoutError("gemini_youtube_candidate_validation_response_too_large", false);
      }
      // A scout that ran identity validation is a discovery round even when it
      // found nothing; `open` counts candidates that could not be checked,
      // including named titles not yet looked up (a title searched without a
      // match is settled).
      const found = titleLookup?.found ?? [];
      const unresolvedTitles = titleLookup?.unresolved ?? [];
      const videos = [...confirmed.map(({ video_id }) => video_id), ...found.map(({ video_id }) => video_id)];
      // IDs left to the model's judgment: retitled candidates and YouTube's
      // closest results for titles it could not find. The receipt signs them,
      // so a video the model audits from them counts as found by this round.
      const judged = [...new Set([
        ...retitledIds,
        ...unresolvedTitles.flatMap(({ closest }) => (closest ?? []).map(({ video_id }) => video_id))
      ])].filter((video) => !videos.includes(video));
      return withResearchReceipt(successfulToolResult(
        `Gemini scout validated ${confirmed.length} video(s)` +
          (found.length === 0 ? "" : ` and found ${found.length} more by exact title (title_lookup.found)`) +
          "; summaries are unverified discovery leads." +
          (retitled === 0
            ? ""
            : ` ${retitled} more had a YouTube title other than the scout's (validation.rejected_candidates gives ` +
              "both): audit one if YouTube's title shows it is the video meant or relevant anyway.") +
          (unresolvedTitles.length === 0
            ? ""
            : ` ${unresolvedTitles.length} named video(s) could not be identified by exact title ` +
              "(title_lookup.unresolved, with YouTube's closest results): audit one of those if it is the video, or " +
              "search a promising title with search_youtube (100 quota units each)."),
        output
      ), researchReceipt("youtube_scout", {
        videos,
        ...(judged.length === 0 ? {} : { alt: judged }),
        open: validation.unresolved_candidates.length +
          unresolvedTitles.filter(({ reason }) => reason !== "no_matching_video").length,
        q: discoveryQueryDigest([target.research_target, ...leads]),
        target: researchTargetDigest(target.research_target),
        // The rest of the scout frontier, for the coverage check.
        unres: validation.unresolved_candidates.map(({ video_id }) => video_id),
        rej: validation.rejected_candidates.map(({ video_id }) => video_id)
      }));
    }
  );

  registrar.registerTool(
    EXTRACT_YOUTUBE_VIDEO_CLAIMS,
    {
      description: EXTRACT_YOUTUBE_VIDEO_CLAIMS_DESCRIPTION,
      inputSchema: extractYoutubeVideoClaimsInputSchema,
      outputSchema: extractYoutubeVideoClaimsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => {
      const { result, receipt } = await extractYoutubeVideoClaims(input, {
        secret: researchReceiptSecretFromEnv(),
        geminiKeyUnbilled: geminiKeyDeclaredUnbilled()
      });
      return receipt === undefined
        ? result
        : withResearchReceipt(result, researchReceipt("youtube_video_claims", receipt));
    }
  );

  registrar.registerTool(
    "finalize_research",
    {
      description:
        // Descriptive, not imperative: ChatGPT's safety check flagged the earlier wording ("Call before the final
        // answer", "do the required work anyway and say ...") as instructions inside a tool description
        // (owner report, 2026-10-07). What to do when receipts cannot be verified is in that result itself.
        "Final check of a research answer before it is given. Input: the research_receipt values that AskRigor's " +
        "tools returned in this session; the research_target as given to the scout, search_youtube and the coverage " +
        "check, and as research_question to surveys and community audits (discovery for another target does not " +
        "count); whether community evidence was researched and whether the answer compares treatment options; where " +
        "the topic is discussed and what each community searched outside YouTube showed (principal_communities, " +
        "community_searches); what the YouTube comments read showed (community_findings); the studies the " +
        "conclusions rest on (key_sources); after a first pass, the focuses for going deeper (open_leads, " +
        "another_pass_estimate); and the answer draft (answer_draft), which is checked for internal labels, bare " +
        "video IDs, a pasted long prompt, its quoted sentences (answer_quotes), its statements that something was " +
        "not found, not studied or has no effect (absence_claims), and the caveats, and is not stored. Result: " +
        "not_ready with the remaining steps; ready_with_limits with the limits, the caveat sentences for the answer " +
        "(each as its own sentence and as written, in the answer's language when answer_language and " +
        "caveat_renderings are given) and must_report, what the answer reports from each lane researched; or " +
        "receipts_unavailable when this server cannot verify receipts. In free contributor mode a checked " +
        "findings_card is saved to AskRigor's private findings library for the owner's review; in paid private mode " +
        "the caveats offer its save.",
      inputSchema: finalizeResearchInputSchema,
      outputSchema: finalizeResearchOutputSchema,
      // It writes: a free contributor's checked findings card is saved.
      annotations: MUTATING_ANNOTATIONS
    },
    async (input, extra) => {
      // Reddit's public embed endpoint confirms each cited Reddit thread's
      // subreddit and title; only the links are sent.
      const redditLinks = (input.community_searches ?? []).filter(({ platform }) => platform === "reddit")
        .flatMap(({ threads_read }) => (threads_read ?? []).map(({ url }) => url));
      // Owner decision Q11 (2026-09-30): the free tier's findings are saved by
      // the agreement its user accepted; a paid-private answer offers the save,
      // which waits for the user's yes (save_research_findings).
      const library = options.findingsLibrary ?? findingsLibraryEnabledFromEnv();
      const researcher = await researchUseAccount(extra, options.researchContributorAccessService);
      const account = library ? researcher : undefined;
      const result = finalizeResearch(input, {
        secret: researchReceiptSecretFromEnv(),
        protocolNames: await protocolNames(),
        findings: !library
          ? "closed"
          : account === undefined ? "private" : account.mode === "FREE_CONTRIBUTOR" ? "save" : "offer",
        ...(redditLinks.length === 0 ? {} : { redditThreads: await lookupRedditThreads(redditLinks) })
      });
      if (
        account?.mode === "FREE_CONTRIBUTOR" && input.findings_card !== undefined &&
        result.findings_card.status === "checked" && result.finalization_receipt !== undefined
      ) {
        const save = (options.findingsSave ?? saveResearchFindings)({
          findings_card: input.findings_card,
          finalization_receipt: result.finalization_receipt,
          contributor: account.accountKey,
          ...(input.reported_model === undefined ? {} : { reported_model: input.reported_model })
        }, {
          surface: options.mcpSurface ?? "unknown",
          toolCatalogSha256: toolCatalogSha256(),
        }).then(savedFindings, () => ({ status: "not_saved" as const, reason: "queue_service_unavailable" }));
        result.findings_card.saved = await withinDeadline(
          save,
          options.findingsSaveDeadlineMilliseconds ?? FINDINGS_SAVE_DEADLINE_MILLISECONDS,
          { status: "unconfirmed" }
        );
      }
      // Analyses validated in a free contributor's research go to the review
      // inbox once the final check passes, like the findings card.
      if (researcher?.mode === "FREE_CONTRIBUTOR" && result.finalization_receipt !== undefined) {
        const held = ANALYSIS_STAGING.take(researcher.accountKey);
        if (held.length > 0) {
          result.analyses_saved = await saveStagedAnalyses(
            held,
            (contribution) => submitServerSourceAnalysis(extra, options.researchContributorAccessService, contribution),
            options.findingsSaveDeadlineMilliseconds ?? ANALYSES_SAVE_DEADLINE_MILLISECONDS
          );
        }
      }
      const card = result.findings_card;
      const analyses = result.analyses_saved;
      return successfulToolResult(
        `Research finalization: ${result.status}; ${result.next_steps.length} next step(s), ` +
          `${result.limits.length} limit(s) to state; ${result.receipts_verified} receipt(s) verified.` +
          result.caveats.map((caveat) => `\nThe answer must contain, as written: ${caveat}`).join("") +
          result.must_report.map((lane) => `\nThe answer must report: ${lane}`).join("") +
          (card.status === "absent" || card.status === "private"
            ? ""
            : `\nFindings card: ${card.status}` +
              (card.saved !== undefined
                ? `; ${
                  card.saved.status === "not_saved"
                    ? "not saved"
                    : card.saved.status === "unconfirmed"
                      ? "the save had not finished; it may still complete"
                      : `saved for review as ${card.saved.card_id}`
                }.`
                : card.problems.length === 0 ? "." : `: ${card.problems.join(" ")}`)) +
          (analyses === undefined
            ? ""
            : `\nStudy and review analyses sent to the review inbox: ${analyses.saved + analyses.already_saved}` +
              (analyses.unconfirmed === 0 ? "" : `, ${analyses.unconfirmed} still sending`) +
              (analyses.not_saved.length === 0
                ? ""
                : `; not saved: ${analyses.not_saved.map(({ reason, count }) => `${count} (${reason})`).join(", ")}`) +
              "."),
        result as unknown as Record<string, unknown>
      );
    }
  );

  // Owner decision (2026-09-30): lessons are saved from the connector too, not
  // only from the GPT. Same candidate, privacy screen, limits and private queue
  // as the lesson Action; behind the research-access guard like other tools.
  registrar.registerTool(
    "submit_lesson_candidate",
    {
      description: "Save one validated AskRigor lesson to the owner's private review queue, only after the user says yes to the lesson as shown to them. Send only the generalized lesson: no identity, personal health story, quotation, chat text or unnecessary link. Returns a receipt, never the stored lesson.",
      inputSchema: connectorLessonInputSchema,
      outputSchema: connectorLessonOutputSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    async (input) => connectorLessonToolResult(
      await (options.lessonSubmission ?? submitConnectorLessonCandidate)(input),
    ),
  );

  registerFindingsSave(registrar, options);
}

// Owner decision Q11 (2026-09-30): a paid-private user's findings are saved
// when the user accepts saving them for that answer. Behind the research-access
// guard like other tools; no research Action path.
function registerFindingsSave(
  registrar: Pick<McpServer, "registerTool">,
  options: RegisterToolsOptions,
): void {
  registrar.registerTool(
    "save_research_findings",
    {
      description: SAVE_RESEARCH_FINDINGS_DESCRIPTION,
      inputSchema: saveResearchFindingsInputSchema,
      outputSchema: findingsSaveResultSchema,
      annotations: MUTATING_ANNOTATIONS,
    },
    async (input, extra) => {
      const reply = (result: FindingsSaveResult) => findingsSaveToolResult(result);
      if (!(options.findingsLibrary ?? findingsLibraryEnabledFromEnv())) {
        return reply({ status: "queue_unavailable", retryable: false, reason_code: "library_closed" });
      }
      const account = await researchUseAccount(extra, options.researchContributorAccessService);
      if (account === undefined) {
        return reply({ status: "queue_unavailable", retryable: false, reason_code: "research_account_required" });
      }
      return reply(await (options.findingsSave ?? saveResearchFindings)({
        findings_card: input.findings_card,
        finalization_receipt: input.finalization_receipt,
        contributor: account.accountKey,
        ...(input.reported_model === undefined ? {} : { reported_model: input.reported_model }),
      }, {
        surface: options.mcpSurface ?? "unknown",
        toolCatalogSha256: toolCatalogSha256(),
      }));
    },
  );
}

/** The work's result, or `late` once the deadline passes; the work itself carries on. */
async function withinDeadline<T>(work: Promise<T>, milliseconds: number, late: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(late), milliseconds);
        timer.unref();
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** What finalize_research reports of a findings save: its public id, or that it was not saved. */
function savedFindings(result: FindingsSaveResult): NonNullable<FinalizeResearchOutput["findings_card"]["saved"]> {
  if (result.status === "saved" || result.status === "existing_card") {
    return result.card_id === undefined
      ? { status: "not_saved", reason: "queue_service_unavailable" }
      : { status: result.status === "saved" ? "saved" : "already_saved", card_id: result.card_id };
  }
  return { status: "not_saved", reason: result.reason_code ?? result.status };
}

// The tool catalog a findings card was saved with: sha256 of the operation
// names, sorted, one per line. Read when a save arrives, once the catalog exists.
let catalogDigest: string | undefined;
function toolCatalogSha256(): string {
  catalogDigest ??= createHash("sha256")
    .update(RESEARCH_OPERATIONS.map(({ name }) => name).sort().join("\n"), "utf8")
    .digest("hex");
  return catalogDigest;
}

// Compound rule, module and case names in the canonical protocols, such as
// DeepForumAuditActivationPrompt; an answer that shows one has leaked protocol
// notation. Read once per process; a failed read checks without them.
let protocolNamesLoad: Promise<ReadonlySet<string>> | undefined;
function protocolNames(): Promise<ReadonlySet<string>> {
  protocolNamesLoad ??= Promise.all([loadProtocol("hrp"), loadProtocol("universal")])
    .then((texts): ReadonlySet<string> => protocolNamesFrom(texts))
    .catch(() => {
      protocolNamesLoad = undefined;
      return new Set<string>();
    });
  return protocolNamesLoad;
}

// Claude clients reject MCP results near 50,000 characters, and one returned
// comment record is about 600. The sample is cut in the same deterministic
// order the Custom GPT Action uses; counts and the receipt cover the corpus.
const MCP_YOUTUBE_AUDIT_MAX_BYTES = 40_000;

/**
 * Bytes a result adds around its structured view: the text, and the receipt,
 * which appears in both the text and the structured content. The view is cut
 * to what remains, so the whole result stays within the response budget.
 */
function reservedResultBytes(text: string, receipt: string | undefined): number {
  const receiptBytes = receipt === undefined ? 0 : Buffer.byteLength(receipt, "utf8");
  return Buffer.byteLength(text, "utf8") + 2 * receiptBytes + 200;
}
// A pass lock says the comments were retrieved, not that they reached the answer.
const MCP_COMMENT_FINDINGS_HANDOFF =
  "This lock covers retrieving these YouTube comments only; other communities and the final check are separate. " +
  "Note now what these comments show (benefit, no-effect and adverse reports), and give it to finalize_research as " +
  "community_findings, even if the signal is weak or neutral.";
const MCP_COMMENTS_NOT_SHOWN =
  "No comment fitted in this view; read each video's comments with audit_youtube_video_community.";
const MCP_VIDEO_COMMENTS_NOT_SHOWN =
  "No comment fitted in this view, so none was returned; say in the answer that this video's comments could not be shown.";
const MCP_BOUNDED_SAMPLE_LIMITATION =
  "This response returns a deterministic subset of the analysis sample to fit client result-size limits; retrieval coverage and corpus counts are reported separately.";

// The core schema requires exactly one of a video and a continuation token.
// Models sometimes send both; on MCP the token then wins (see the handler).
const MCP_YOUTUBE_VIDEO_AUDIT_INPUT_SCHEMA = z.object(
  youtubeVideoCommunityAuditInputSchema.shape
).strict().superRefine((value, context) => {
  if (value.video_id_or_url === undefined && value.continuation_token === undefined) {
    context.addIssue({
      code: "custom",
      message: "Provide video_id_or_url or continuation_token"
    });
  }
});

const RESEARCH_RECEIPT_OUTPUT_SHAPE = {
  research_receipt: z.string().optional()
};

/**
 * A literature search's receipt: the database it searched, the query's digest
 * (never its text) and the records it matched. finalize_research names the
 * searched databases where the answer says something was not found. A search
 * that failed signs nothing.
 */
function literatureSearchReceipt(
  source: "pubmed" | "europepmc" | "ctgov",
  query: string,
  result: { error?: unknown; pagination: { returned: number } },
  total: number | undefined
): string | undefined {
  if (result.error !== undefined) return undefined;
  return researchReceipt("literature_search", {
    src: source,
    q: discoveryQueryDigest([query]),
    ret: result.pagination.returned,
    ...(total === undefined ? {} : { n: total })
  });
}

// Owner rule (geosmin report, 2026-09-30): before anything is called not
// found, every record of a small search is seen. A first page that stops short
// of a total of 50 or fewer is fetched again whole; if that fails or is slow,
// the first page stands, so the call stays within the client's 60 seconds.
// ClinicalTrials.gov reports no total, so its pages stay as asked.
const WHOLE_SEARCH_RECORDS = 50;
const WHOLE_SEARCH_WAIT_MS = 10_000;
async function readSmallSearchWhole<Page extends { error?: unknown; pagination: { returned: number } }>(
  first: Page,
  firstPage: boolean,
  totalOf: (page: Page) => number | undefined,
  searchAgain: (pageSize: number) => Promise<Page>
): Promise<Page> {
  const total = totalOf(first);
  if (
    !firstPage || first.error !== undefined || total === undefined ||
    total > WHOLE_SEARCH_RECORDS || first.pagination.returned >= total
  ) {
    return first;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const whole = await Promise.race([
    searchAgain(WHOLE_SEARCH_RECORDS).catch(() => undefined),
    new Promise<undefined>((resolve) => {
      timer = setTimeout(resolve, WHOLE_SEARCH_WAIT_MS, undefined);
    })
  ]).finally(() => clearTimeout(timer));
  return whole !== undefined && whole.error === undefined && whole.pagination.returned > first.pagination.returned
    ? whole
    : first;
}

// A search that finds little is where a narrow vocabulary misses most (owner
// report, 2026-09-30: geosmin and humic acid searched under modern terms only),
// so its result says what to try before calling anything not found.
const SPARSE_SEARCH_RECORDS = 10;
function sparseSearchNote(total: number | undefined): string {
  return total === undefined || total > SPARSE_SEARCH_RECORDS
    ? ""
    : " Few records: before saying anything was not found, try synonyms, older or variant terms, the components of " +
      "a mixed exposure, and citation chains.";
}

// Claude clients abandon a tool call after 60 seconds. Provider polling ends
// by 40 seconds; title searches start only if their timeout ends by 55.
const MCP_SCOUT_POLL_WINDOW_MS = 40_000;
const MCP_SCOUT_TITLE_LOOKUP_MS = 20_000;
const MCP_SCOUT_CALL_LIMIT_MS = 55_000;
const MCP_SCOUT_RETRY_AFTER_SECONDS = 10;
const MCP_SCOUT_MAX_BYTES = 45_000;

const MCP_SCOUT_INPUT_SCHEMA = z.object({
  research_target: automatedScoutInputSchema.shape.research_target.optional()
    .describe("Write it in English, whatever the person's language, and give their language in language."),
  diagnosis_status: automatedScoutInputSchema.shape.diagnosis_status.optional(),
  language: automatedScoutInputSchema.shape.language
    .describe("The person's language as a BCP 47 tag (fr, pt-BR); the scout looks for videos in it."),
  rediscovery_leads: z.array(z.string().trim().min(2).max(GEMINI_YOUTUBE_SCOUT_MAX_LEAD_CHARACTERS))
    .min(1).max(GEMINI_YOUTUBE_SCOUT_MAX_REDISCOVERY_LEADS).optional()
    .describe("Remedies, methods, products, videos or creators named in audited comments, to search next."),
  continuation_token: z.string().min(1).max(12_000).optional()
    .describe("Returned while the scout is still searching; call again with only this token.")
}).strict().superRefine((value, context) => {
  if (value.continuation_token === undefined &&
      (value.research_target === undefined || value.diagnosis_status === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Provide research_target and diagnosis_status, or a continuation_token."
    });
  }
  if (value.continuation_token !== undefined && value.rediscovery_leads !== undefined) {
    context.addIssue({
      code: "custom",
      message: "The continuation_token already carries the rediscovery leads; send only the token."
    });
  }
});

const MCP_SCOUT_OUTPUT_SCHEMA = z.object({
  scout_status: z.enum(["pending", "complete"]),
  research_target: z.string(),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  language: z.string().optional(),
  rediscovery_leads: z.array(z.string()).optional(),
  continuation_token: z.string().optional(),
  retry_after_seconds: z.number().int().positive().optional(),
  discovery_queries: z.array(z.object({ purpose: z.string(), query: z.string() }).passthrough()).optional(),
  search_gaps: z.array(z.string()).optional(),
  // Produced and schema-checked by validateGeminiYoutubeCandidateHandoff.
  validation: z.record(z.string(), z.unknown()).optional(),
  title_lookup: z.object({
    found: z.array(z.object({
      video_id: z.string(),
      title: z.string(),
      channel: z.string(),
      declared_title: z.string(),
      why_surfaced: z.string().optional()
    }).strict()),
    unresolved: z.array(z.object({
      title: z.string(),
      channel: z.string(),
      why_surfaced: z.string().optional(),
      reason: z.enum(["no_matching_video", "search_quota_exhausted", "search_failed", "not_searched"]),
      closest: z.array(z.object({ video_id: z.string(), title: z.string(), channel: z.string().optional() }).strict())
        .optional()
    }).strict())
  }).strict().optional(),
  provider_storage_mode: z.enum(["DISABLED", "TEMPORARY_BACKGROUND_DELETE_REQUESTED"]).optional(),
  research_receipt: z.string().optional()
}).strict();

// Shared by every MCP server this process creates, one per request.
const LONG_VIDEO_AUDIT_SLOTS = createConcurrencyLimiter(PUBLIC_TOOL_LIMITS.mcpLongYoutubeVideoAuditSlots);
// Free contributors' validated analyses, held from the method check until the
// final check sends them to the review inbox; see analysis-staging.ts.
const ANALYSIS_STAGING = new AnalysisStaging();
// Like the findings save, sending held analyses never holds the answer back long.
const ANALYSES_SAVE_DEADLINE_MILLISECONDS = 10_000;

const SCOUT_SPEND_GUIDANCE =
  "The zero-spend policy allows the Gemini scout only with a key that has no billing " +
  "(ASKRIGOR_GEMINI_BILLING=none). Use survey_youtube_community instead.";
const SCOUT_DELETION_RETRY =
  "Its stored search could not be deleted yet; call again later with the same continuation_token to delete it.";
// How to fix a target the population screen refused. The screen reads
// English, so the target is written in English and the language goes apart.
const SCOUT_TARGET_GUIDANCE =
  "Write research_target in English, whatever the person's language, as a group of people and their goal in " +
  "sentence case (for example: adults with hip osteoarthritis trying to avoid a replacement), without first-person " +
  "words, he or she, names, places, a person's age, contact details or links, and give the person's language in " +
  "language (for example: fr).";

function scoutError(code: string, retryable: boolean, guidance?: string): CallToolResult {
  return {
    content: [{
      type: "text",
      text: `scout gemini youtube candidates could not complete: ${code}${retryable ? " (retryable)" : ""}.` +
        (guidance === undefined ? "" : ` ${guidance}`)
    }],
    isError: true
  };
}

/** Searches whose results continue on a page nobody has read yet. */
/**
 * How far a discovery round's searches got: `inc` ended incomplete, `rl` of
 * them at a rate limit or the daily search quota, which the coverage ledger
 * treats as retryable once it resets.
 */
function searchLimits(searches: ReadonlyArray<{ access_status: string }>): { rl: number; inc: number } {
  const incomplete = searches.filter(({ access_status }) =>
    access_status !== "complete" && access_status !== "api_visible_complete");
  return {
    rl: incomplete.filter(({ access_status }) => access_status === "rate_limited").length,
    inc: incomplete.length
  };
}

/** A search read its page only when YouTube returned it; a failed page leaves its cursor unread. */
function pageRead(accessStatus: string): boolean {
  return accessStatus === "complete" || accessStatus === "api_visible_complete";
}

/**
 * The pages a round's searches read (`pg`) and left (`nx`), keyed to the
 * caller's own query terms, which the result echoes. A search the caller's
 * terms do not match leaves the round to its `open` count.
 */
function pageClaims(
  queries: readonly string[],
  searches: ReadonlyArray<{
    query: string;
    cursor?: string;
    access_status: string;
    pagination: { next_cursor?: string };
  }>
): { pg?: string[]; nx?: string[] } {
  const pg: string[] = [];
  const nx: string[] = [];
  for (const search of searches) {
    const query = queries.find((candidate) => candidate === search.query);
    if (query === undefined) return {};
    if (search.cursor !== undefined && pageRead(search.access_status)) pg.push(pageKey(query, search.cursor));
    if (search.pagination.next_cursor !== undefined) nx.push(pageKey(query, search.pagination.next_cursor));
  }
  return { ...(pg.length === 0 ? {} : { pg }), ...(nx.length === 0 ? {} : { nx }) };
}

function unreadResultPages(searches: ReadonlyArray<{ pagination: { next_cursor?: string } }>): number {
  return searches.filter(({ pagination }) => pagination.next_cursor !== undefined).length;
}

const VIDEO_LEAD = /^video:([A-Za-z0-9_-]{11})$/u;

/**
 * Replaces each video:<id> lead with the video's public title and channel from
 * YouTube; undefined when one is not an available video.
 */
async function resolveVideoLeads(leads: readonly string[]): Promise<string[] | undefined> {
  const resolved = await Promise.all(leads.map(async (lead) => {
    const videoId = VIDEO_LEAD.exec(lead)?.[1];
    if (videoId === undefined) return lead;
    try {
      const video = await getYoutubeVideo(videoId, youtubeConfig());
      const { title, channel_title: channel } = video.data as { title?: string; channel_title?: string };
      if (video.access_status !== "api_visible_complete" || title === undefined) return undefined;
      return `${title}${channel === undefined ? "" : ` (${channel})`}`.slice(0, GEMINI_YOUTUBE_SCOUT_MAX_LEAD_CHARACTERS);
    } catch {
      return undefined;
    }
  }));
  return resolved.every((lead): lead is string => lead !== undefined) ? resolved : undefined;
}

/** True when the Custom GPT Action adapter, not an MCP client, made the call. */
function isActionCall(extra: unknown): boolean {
  return (extra as ResearchOperationExtra | undefined)?.surface === "action";
}

/** Signs a receipt when a signing secret is configured; see research-receipts.ts. */
function researchReceipt(
  kind: ResearchReceiptKind,
  claims: ResearchReceiptClaims
): string | undefined {
  const secret = researchReceiptSecretFromEnv();
  return secret === undefined
    ? undefined
    : issueResearchReceipt(kind, { ...claims, t: receiptSequence() }, { secret });
}

// A receipt's issue time has whole seconds, so each receipt also signs `t`, a
// millisecond time that only increases within this process. finalize_research
// orders research by it, never by the order the caller passes receipts in.
let lastReceiptMs = 0;
function receiptSequence(): number {
  lastReceiptMs = Math.max(Date.now(), lastReceiptMs + 1);
  return lastReceiptMs;
}

/**
 * Adds the receipt to a result. An error result carries none, except a
 * discovery round's (`signsStoppedRound`): a search a rate limit or the daily
 * quota stopped is signed with that limit, which keeps discovery open.
 */
function withResearchReceipt(
  result: CallToolResult,
  receipt: string | undefined,
  signsStoppedRound = false
): CallToolResult {
  if (receipt === undefined || (result.isError === true && !signsStoppedRound)) return result;
  return {
    ...result,
    content: [...result.content, { type: "text", text: `research_receipt: ${receipt}` }],
    structuredContent: { ...result.structuredContent, research_receipt: receipt }
  };
}


function registerOpenFullTextMcpTools(
  registrar: Pick<McpServer, "registerTool">,
  options: RegisterToolsOptions
): void {
  registrar.registerTool(
    "acquire_open_full_text",
    {
      description: "Acquires one DOI through Europe PMC, Unpaywall PDFs, up to five public HTTPS candidate_urls, and up to two AI-supplied candidate_texts from a client search index, with an optional PMCID. Supplied texts receive the same identity, admission and embedded-block checks plus an exact abstract cross-check when available; audits carry a search-copy caveat. Records expanded public-copy searches with public_copy_search; lead receipts require exact DOI and known-title queries without technical failures. Reports identity, structural completeness, source class and its basis, and route failures. Full text has a handle and content hash for contiguous reading and source-linked audit; reusable repository audits include a version ID.",
      inputSchema: acquireOpenFullTextActionInputSchema,
      outputSchema: openFullTextMcpOutputSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => invokeOpenFullTextMcp("acquire_open_full_text", input)
  );
  registrar.registerTool(
    "continue_open_full_text",
    {
      description: "Retrieves the next contiguous page of an existing document_handle from its server-owned cursor. Coverage binds the handle and content hash; exhausted, expired, or invalid handles cannot advance. Pages preserve the exact document chain for source-linked audit.",
      inputSchema: continueOpenFullTextActionInputSchema,
      outputSchema: availableOpenFullTextActionOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => invokeOpenFullTextMcp("continue_open_full_text", input)
  );
  registrar.registerTool(
    "validate_study_method_audit",
    {
      description: "Validates a full-text, source-linked individual-study audit on the exact exhausted document_handle. Accepts a newly performed audit or the repository_analysis_version_id advertised by the same acquisition. Repository reuse repeats exact source/protocol/rubric/freshness/impact checks and runs the same validator; fresh_study_audit_required records the need for a newly performed audit. Validated coverage binds the acquisition handle and content hash. Audits of client_supplied copies sign search-index provenance for the required finalization caveat.",
      inputSchema: studyMethodAuditActionInputSchema,
      outputSchema: studyMethodAuditRouteOutputSchema.safeExtend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input, extra) => stageValidatedAnalysis(
      "study", await invokeOpenFullTextMcp("validate_study_method_audit", input), extra, options
    )
  );
  registrar.registerTool(
    "validate_review_method_audit",
    {
      description: "Validates a full-text, source-linked review or guideline audit on the exact exhausted acquisition document_handle, including search coverage, study ancestry, heterogeneity, bias, conflicts, and claim scope. Coverage binds the acquisition handle and source_content_sha256; mismatches block synthesis. Audits of client_supplied copies sign search-index provenance for the required finalization caveat.",
      inputSchema: reviewMethodAuditActionInputSchema,
      outputSchema: reviewMethodAuditActionOutputSchema.extend(RESEARCH_RECEIPT_OUTPUT_SHAPE),
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input, extra) => stageValidatedAnalysis(
      "review", await invokeOpenFullTextMcp("validate_review_method_audit", input), extra, options
    )
  );
}

/**
 * Holds a free contributor's freshly validated analysis for the final check
 * to send to the review inbox (owner decision, 30 Sep). The validation result
 * is returned unchanged and never waits: building the contribution, with its
 * Crossref integrity check, runs in the background. Repository reuse is
 * skipped, since that analysis is already in the repository.
 */
async function stageValidatedAnalysis(
  kind: "study" | "review",
  result: CallToolResult,
  extra: unknown,
  options: RegisterToolsOptions
): Promise<CallToolResult> {
  const body = result.structuredContent as {
    status?: string;
    audit_receipt?: { audit_sha256?: string };
    coverage_receipt?: { document_handle?: string };
    repository_reuse_receipt?: unknown;
  } | undefined;
  const handle = body?.coverage_receipt?.document_handle;
  const auditSha256 = body?.audit_receipt?.audit_sha256;
  if (
    result.isError === true || handle === undefined || auditSha256 === undefined ||
    body?.repository_reuse_receipt !== undefined ||
    body?.status !== (kind === "study" ? "source_linked_study_audit_validated" : "source_linked_review_audit_validated")
  ) {
    return result;
  }
  const account = await researchUseAccount(extra as ResearchOperationExtra | undefined, options.researchContributorAccessService);
  if (account?.mode !== "FREE_CONTRIBUTOR") return result;
  let index;
  try {
    index = OPEN_FULL_TEXT_READER.readAuditMaterial?.(handle);
  } catch {
    return result;
  }
  if (index === undefined) return result;
  ANALYSIS_STAGING.stage(account.accountKey, `${kind}:${auditSha256}`, buildStagedAnalysis({
    kind,
    index,
    auditReceipt: body!.audit_receipt as never,
    crossref: crossrefConfig()
  }));
  return result;
}

function configuredOpenFullTextOptions(
  repository: PostgresEvidenceRepository | undefined
) {
  if (repository === undefined) return {};
  return {
    studyAuditReuse: {
      reader: repository,
      currentProtocolManifests: async () => Promise.all([
        getProtocolManifest("universal"),
        getProtocolManifest("hrp")
      ])
    }
  };
}

function configuredLivingEvidenceRepository(): PostgresEvidenceRepository | undefined {
  const config = optionalLivingEvidenceReuseConfigFromEnv();
  if (config === undefined) return undefined;
  return new PostgresEvidenceRepository({
    connectionString: config.connectionString,
    schema: config.schema,
    ssl: config.ssl,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    queryTimeoutMillis: config.queryTimeoutMillis,
    statementTimeoutMillis: config.statementTimeoutMillis
  });
}

async function invokeOpenFullTextMcp(
  operationId: string,
  body: unknown
): Promise<CallToolResult> {
  const route = OPEN_FULL_TEXT_MCP_ROUTES.find((candidate) =>
    candidate.operationId === operationId
  );
  if (route === undefined) throw new Error("Open full-text MCP route is missing");
  const result = await route.handle({
    request: {} as never,
    clientIp: "mcp",
    body
  });
  if (result.status !== 200) {
    return {
      content: [{
        type: "text",
        text: `${operationId.replaceAll("_", " ")} could not complete.`
      }],
      isError: true
    };
  }
  const failedLead = operationId === "acquire_open_full_text" &&
    (result.body as { status?: string }).status === "possibly_useful_lead" &&
    hasFailedFullTextSource(result.body);
  return withResearchReceipt({
    content: [{
      type: "text",
      text: `${operationId.replaceAll("_", " ")} completed.` +
        ((result.body as { access_boundary?: string; acquisition_state?: string }).acquisition_state === undefined ? "" : ` ${(result.body as { access_boundary?: string }).access_boundary ?? ""}`) + (failedLead
        ? " A source failed (an outage or rate limit), so this is not yet a completed lead and has no receipt. " +
          "A later acquire_open_full_text attempt can establish a completed boundary before the study is listed as lead_only."
        : "")
    }],
    structuredContent: result.body as Record<string, unknown>
  }, openFullTextResearchReceipt(operationId, result.body));
}

const OPEN_FULL_TEXT_READER = createOpenFullTextExecutor();

function hasFailedFullTextSource(body: unknown): boolean {
  return hasFailedFullTextAcquisition(body as Parameters<typeof hasFailedFullTextAcquisition>[0]);
}

function openFullTextResearchReceipt(operationId: string, body: unknown): string | undefined {
  const output = body as {
    status?: string;
    requested_doi?: string;
    requested_pmcid?: string;
    acquisition_state?: string;
    audit_receipt?: { audit_status?: string };
    coverage_receipt?: { document_handle?: string };
  };
  if (operationId === "acquire_open_full_text" && output.status === "possibly_useful_lead") {
    // A lead receipt records completed attempts, not proof of paper
    // inaccessibility. Exact expanded search and no technical failures are required.
    if (!canSignFullTextLead(body as Parameters<typeof canSignFullTextLead>[0])) return undefined;
    return researchReceipt("full_text_lead", {
      doi: output.requested_doi,
      pmcid: output.requested_pmcid,
      state: output.acquisition_state
    });
  }
  const kind = output.status === "source_linked_study_audit_validated"
    ? "study_audit"
    : output.status === "source_linked_review_audit_validated"
      ? "review_audit"
      : undefined;
  const handle = output.coverage_receipt?.document_handle;
  if (kind === undefined || handle === undefined) return undefined;
  let source: { primary_identifier: string; doi?: string; pmid?: string; pmcid?: string; provider: string; canonical_url: string } | undefined;
  try {
    source = OPEN_FULL_TEXT_READER.readAuditMaterial?.(handle).source;
  } catch {
    return undefined;
  }
  if (source === undefined) return undefined;
  return researchReceipt(kind, {
    id: source.primary_identifier,
    doi: source.doi,
    pmid: source.pmid,
    pmcid: source.pmcid,
    ...(source.provider === "client_supplied" ? {
      retrieval_provider: "client_search_index",
      host: new URL(source.canonical_url).hostname
    } : {}),
    status: output.audit_receipt?.audit_status ?? "validated"
  });
}

export const RESEARCH_OPERATIONS = Object.freeze(collectResearchOperations());

export function registerTools(
  server: McpServer,
  options: RegisterToolsOptions = {},
): void {
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: unknown,
    execute: ResearchOperationHandler
  ) => unknown;
  const operations = Object.keys(options).length === 0
    ? RESEARCH_OPERATIONS
    : collectResearchOperations(options);
  for (const operation of operations) {
    register(operation.name, operation.mcpConfig, operation.execute);
  }
}

function collectResearchOperations(
  options: RegisterToolsOptions = {},
): readonly ResearchOperation[] {
  const operations: ResearchOperation[] = [];
  const registrar = {
    registerTool(
      name: string,
      config: {
        description?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
        annotations?: ToolAnnotations;
        _meta?: Record<string, unknown>;
      },
      execute: ResearchOperationHandler
    ) {
      if (
        config.description === undefined ||
        config.inputSchema === undefined ||
        config.outputSchema === undefined ||
        config.annotations === undefined
      ) {
        throw new Error(`Incomplete research operation definition: ${name}`);
      }
      const annotations = Object.freeze({ ...config.annotations });
      const _meta = PRIVATE_MCP_OPERATION_NAMES.has(name)
        ? evidenceGapReviewSecurityMetadata()
        : PUBLIC_IDENTITY_OPERATION_NAMES.has(name)
          ? optionalSignInSecurityMetadata()
          : researchUseSecurityMetadata();
      const guardedExecute = options.researchAccessRequired === true &&
          !PRIVATE_MCP_OPERATION_NAMES.has(name) &&
          !PUBLIC_IDENTITY_OPERATION_NAMES.has(name) &&
          !RESEARCH_ACCESS_CONTROL_OPERATION_NAMES.has(name)
        ? createResearchAccessGuard(execute, {
            service: options.researchContributorAccessService,
            resourceMetadataUrl: options.oauthResourceMetadataUrl,
            signIn: options.signIn,
          })
        : execute;
      const mcpConfig = Object.freeze({
        ...config,
        annotations,
        _meta: Object.freeze({ ...config._meta, ..._meta }),
      });
      operations.push(Object.freeze({
        name,
        actionPath: `/actions/research/${name}`,
        description: config.description,
        inputSchema: config.inputSchema,
        outputSchema: config.outputSchema,
        annotations,
        actionEnabled:
          !OPEN_FULL_TEXT_MCP_OPERATION_NAMES.has(name) &&
          !ACTION_BACKED_MCP_OPERATION_NAMES.has(name) &&
          !PRIVATE_MCP_OPERATION_NAMES.has(name) &&
          !RESEARCH_ACCESS_CONTROL_OPERATION_NAMES.has(name) &&
          !CONNECTOR_ONLY_OPERATION_NAMES.has(name),
        execute: guardedExecute,
        mcpConfig
      }));
      return undefined;
    }
  } as unknown as Pick<McpServer, "registerTool">;

  defineResearchOperations(registrar, options);
  if (operations.length !== 33) {
    throw new Error(`Expected 33 research operations; received ${operations.length}`);
  }
  if (new Set(operations.map(({ name }) => name)).size !== operations.length) {
    throw new Error("Research operation names must be unique");
  }
  return operations;
}

async function verifyIntegrity(
  protocol: ProtocolName,
  expectedSha256: string | undefined
) {
  return expectedSha256 === undefined
    ? getProtocolManifest(protocol)
    : verifyProtocolIntegrity(protocol, expectedSha256);
}

function ncbiConfig() {
  return {
    tool: process.env.NCBI_TOOL ?? "askrigor",
    email: process.env.NCBI_EMAIL ?? "",
    ...(process.env.NCBI_API_KEY === undefined
      ? {}
      : { apiKey: process.env.NCBI_API_KEY })
  };
}

function crossrefConfig() {
  return { mailto: process.env.CROSSREF_MAILTO ?? "" };
}

function youtubeConfig() {
  return { apiKey: process.env.YOUTUBE_API_KEY ?? "" };
}

function youtubeAuditContinuationSecret(): string {
  return process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET ?? "";
}

function youtubeCommentBudgets() {
  return {
    maxProviderRequestAttempts: PUBLIC_TOOL_LIMITS.youtubeCommentProviderRequestAttempts,
    maxCommentThreadPages: PUBLIC_TOOL_LIMITS.youtubeCommentThreadPages,
    maxReplyPages: PUBLIC_TOOL_LIMITS.youtubeReplyPages,
    maxThreads: PUBLIC_TOOL_LIMITS.youtubeThreads,
    maxComments: PUBLIC_TOOL_LIMITS.youtubeComments,
    maxNormalizedOutputBytes: PUBLIC_TOOL_LIMITS.youtubeNormalizedOutputBytes,
    maxTextBytes: PUBLIC_TOOL_LIMITS.youtubeTextBytes,
    maxElapsedMs: PUBLIC_TOOL_LIMITS.youtubeElapsedMs
  };
}

function youtubeCommunityAuditBudgets() {
  return {
    ...youtubeCommentBudgets(),
    maxElapsedMs: PUBLIC_TOOL_LIMITS.youtubeCommunityAuditElapsedMs
  };
}

function pubmedToolResult(
  text: string,
  structuredContent: object & { error?: unknown }
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...structuredContent },
    ...(structuredContent.error === undefined ? {} : { isError: true })
  };
}

function europePmcToolResult(
  text: string,
  structuredContent: object & { error?: unknown }
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...structuredContent },
    ...(structuredContent.error === undefined ? {} : { isError: true })
  };
}

function clinicalTrialsToolResult(
  text: string,
  structuredContent: object & { error?: unknown }
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...structuredContent },
    ...(structuredContent.error === undefined ? {} : { isError: true })
  };
}

function pubmedSearchFailure(
  query: string,
  dateRange: { start: string; end: string } | undefined,
  pageSize: number | undefined,
  cursor: string | undefined,
  error: unknown
) {
  return errorEnvelope({
    provider: "pubmed",
    recordType: "pubmed_search_result",
    query: {
      query,
      ...(dateRange === undefined ? {} : { date_range: dateRange })
    },
    pagination: {
      ...(cursor === undefined ? {} : { cursor }),
      page_size: Math.min(pageSize ?? DEFAULT_PUBMED_PAGE_SIZE, MAX_PUBMED_PAGE_SIZE),
      exhausted: false
    },
    returned: 0,
    accessStatus: "error",
    code: pubmedMcpFailureCode(error),
    message: pubmedMcpFailureMessage(error),
    retryable: false,
    data: []
  });
}

function pubmedRecordFailure(pmid: string, error: unknown) {
  return errorEnvelope({
    provider: "pubmed",
    recordType: "pubmed_record",
    primaryIdentifier: pmid,
    sourceIdentity: {
      canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    },
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: "error",
    limitations: [PUBMED_EFETCH_LIMITATION],
    code: pubmedMcpFailureCode(error),
    message: pubmedMcpFailureMessage(error),
    retryable: false,
    data: {}
  });
}

function europePmcSearchFailure(
  query: string,
  dateRange: { start: string; end: string } | undefined,
  pageSize: number | undefined,
  cursor: string | undefined,
  _error: unknown
) {
  return errorEnvelope({
    provider: "europe_pmc",
    recordType: "europe_pmc_search_result",
    query: {
      query,
      ...(dateRange === undefined ? {} : { date_range: dateRange })
    },
    pagination: {
      ...(cursor === undefined ? {} : { cursor }),
      page_size: Math.min(
        pageSize ?? DEFAULT_EUROPE_PMC_PAGE_SIZE,
        MAX_EUROPE_PMC_PAGE_SIZE
      ),
      exhausted: false
    },
    returned: 0,
    accessStatus: "error",
    code: "europe_pmc_tool_failed",
    message: "Europe PMC operation failed",
    retryable: false,
    data: []
  });
}

function clinicalTrialsSearchFailure(
  query: string,
  pageSize: number | undefined,
  pageToken: string | undefined,
  _error: unknown
) {
  return errorEnvelope({
    provider: "clinicaltrials_gov",
    recordType: "clinical_trial_search_result",
    query: { query },
    pagination: {
      ...(pageToken === undefined ? {} : { cursor: pageToken }),
      page_size: Math.min(pageSize ?? DEFAULT_CLINICAL_TRIALS_PAGE_SIZE, MAX_CLINICAL_TRIALS_PAGE_SIZE),
      exhausted: false
    },
    returned: 0,
    accessStatus: "error",
    code: "clinical_trials_tool_failed",
    message: "ClinicalTrials.gov operation failed",
    retryable: false,
    data: []
  });
}

function clinicalTrialFailure(nctId: string, _error: unknown) {
  return errorEnvelope({
    provider: "clinicaltrials_gov",
    recordType: "clinical_trial",
    primaryIdentifier: nctId,
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: "error",
    code: "clinical_trials_tool_failed",
    message: "ClinicalTrials.gov operation failed",
    retryable: false,
    data: {}
  });
}

function crossrefToolResult(
  text: string,
  structuredContent: object & { error?: unknown }
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...structuredContent },
    ...(structuredContent.error === undefined ? {} : { isError: true })
  };
}

function youtubeToolResult(
  text: string,
  structuredContent: object & { error?: unknown; limitations?: unknown }
): CallToolResult {
  if (structuredContent.error === undefined) {
    return { content: [{ type: "text", text }], structuredContent: { ...structuredContent } };
  }
  // Clients such as Claude show only the text of an error result, so the text
  // carries the error code and the server's guidance.
  const error = structuredContent.error as { code?: unknown };
  const guidance = Array.isArray(structuredContent.limitations)
    ? structuredContent.limitations.filter((item): item is string => typeof item === "string").slice(0, 2)
    : [];
  return {
    content: [{
      type: "text",
      text: [text, typeof error.code === "string" ? `Error: ${error.code}.` : "", ...guidance]
        .filter((part) => part.length > 0).join(" ")
    }],
    structuredContent: { ...structuredContent },
    isError: true
  };
}

function youtubeSearchFailure(
  query: string,
  pageSize: number | undefined,
  cursor: string | undefined
) {
  return errorEnvelope({
    provider: "youtube",
    recordType: "youtube_search_result",
    query: { query },
    pagination: {
      ...(cursor === undefined ? {} : { cursor }),
      page_size: pageSize ?? 20,
      exhausted: false
    },
    returned: 0,
    accessStatus: "error",
    code: "youtube_tool_failed",
    message: "YouTube operation failed",
    retryable: false,
    data: []
  });
}

function youtubeVideoFailure() {
  return errorEnvelope({
    provider: "youtube",
    recordType: "youtube_video",
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: "error",
    code: "youtube_tool_failed",
    message: "YouTube operation failed",
    retryable: false,
    data: {}
  });
}

function youtubeCommentsFailure(query?: string) {
  return errorEnvelope({
    provider: "youtube",
    recordType: "youtube_comments",
    ...(query === undefined ? {} : { query: { query } }),
    pagination: { page_size: 100, exhausted: false },
    returned: 0,
    accessStatus: "error",
    code: "youtube_tool_failed",
    message: "YouTube operation failed",
    retryable: false,
    data: {}
  });
}

function youtubeCommunityAuditFailure(
  input: YoutubeCommunityAuditInput
): YoutubeCommunityAuditOutput {
  const parsed = youtubeCommunityAuditInputSchema.parse(input);
  const limitation = "YouTube community audit failed before completing its requested acquisition.";
  return youtubeCommunityAuditOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_community_audit",
    retrieved_at: new Date().toISOString(),
    research_question: parsed.research_question,
    access_status: "error",
    limitations: [limitation],
    selection: {
      basis: "bounded_provider_ranked_round_robin",
      max_videos: parsed.max_videos,
      candidates_considered: 0
    },
    searches: parsed.searches.map(({ direction, query }) => ({
      directions: [direction],
      query,
      access_status: "error",
      pagination: { returned: 0, exhausted: false },
      limitations: [limitation],
      error: {
        code: "youtube_community_audit_failed",
        message: "YouTube community audit failed",
        retryable: false
      },
      candidate_video_ids: []
    })),
    videos: [],
    receipt: {
      completion_state: "incomplete",
      synthesis_lock: "block",
      searches_requested: new Set(parsed.searches.map(({ query }) => query)).size,
      searches_completed: 0,
      selected_video_ids: [],
      unfiltered_retrieval_attempted_for_all: false,
      replies_requested_for_all: false,
      pagination_exhausted_for_complete_videos: true,
      replies_reconciled_for_complete_videos: true,
      query_bounded_comments_used_as_corpus: false,
      blockers: [limitation]
    }
  });
}

function youtubeCommunitySurveyFailure(
  input: YoutubeCommunitySurveyInput
): YoutubeCommunitySurveyOutput {
  const parsed = youtubeCommunitySurveyInputSchema.parse(input);
  const limitation = "YouTube community survey failed before completing its requested discovery.";
  return youtubeCommunitySurveyOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_community_survey",
    retrieved_at: new Date().toISOString(),
    research_question: parsed.research_question,
    access_status: "error",
    limitations: [limitation],
    error: {
      code: "youtube_community_survey_failed",
      message: "YouTube community survey failed",
      retryable: false
    },
    searches: parsed.searches.map(({ direction, query, cursor }) => ({
      directions: [direction],
      query,
      ...(cursor === undefined ? {} : { cursor }),
      access_status: "error",
      pagination: {
        ...(cursor === undefined ? {} : { cursor }),
        page_size: parsed.results_per_search,
        returned: 0,
        exhausted: false
      },
      limitations: [limitation],
      error: {
        code: "youtube_community_survey_failed",
        message: "YouTube community survey failed",
        retryable: false
      },
      candidate_video_ids: []
    })),
    candidates: []
  });
}

function youtubeVideoCommunityAuditFailure(
  input: YoutubeVideoCommunityAuditInput,
  cause?: unknown
): YoutubeVideoCommunityAuditOutput {
  const parsed = youtubeVideoCommunityAuditInputSchema.parse(input);
  const videoId = parsed.video_id_or_url === undefined
    ? cause instanceof YoutubeAuditRestartRequiredError
      ? cause.snapshot.video_id
      : cause instanceof YoutubeAuditIdentifierMembershipBoundaryError
        ? cause.snapshot.video_id
      : "unknown0000"
    : parseYoutubeVideoId(parsed.video_id_or_url) ?? "unknown0000";
  const continuationError = cause instanceof YoutubeAuditContinuationError ? cause : undefined;
  const restartError = cause instanceof YoutubeAuditRestartRequiredError ? cause : undefined;
  const identifierBoundary = cause instanceof YoutubeAuditIdentifierMembershipBoundaryError
    ? cause
    : undefined;
  const snapshot = restartError?.snapshot ?? identifierBoundary?.snapshot;
  const limitation = restartError?.code ===
    "youtube_video_audit_continuation_migration_restart_required"
    ? "This continuation predates the full-corpus identifier-membership upgrade and cannot be resumed safely; restart the audit from the video ID."
    : identifierBoundary !== undefined
      ? "A possible identifier-membership match was detected after the exact sample became bounded, so the server cannot prove whether the record was already accepted. The affected audit stopped at the last verified frontier and did not count the rejected record."
      : continuationError?.code === "youtube_video_audit_continuation_expired"
        ? "The YouTube video audit continuation expired; restart the audit from the video ID."
        : continuationError === undefined
          ? "YouTube video community audit failed before reaching a valid completion state."
          : "The YouTube video audit continuation is invalid; restart the audit from the video ID.";
  const error: ProviderErrorShape = {
    code: identifierBoundary?.code ?? restartError?.code ?? continuationError?.code ??
      "youtube_video_community_audit_failed",
    message: continuationError === undefined && restartError === undefined &&
        identifierBoundary === undefined
      ? "YouTube video community audit failed"
      : limitation,
    retryable: false
  };
  return youtubeVideoCommunityAuditOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_video_community_audit",
    retrieved_at: new Date().toISOString(),
    video_id: videoId,
    canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
    analysis_limit: snapshot?.analysis_limit ?? parsed.analysis_limit ?? 500,
    segment_index: snapshot?.segment_index ?? 0,
    metadata_access_status: "error",
    metadata_error: error,
    ...(snapshot?.provider_reported_comments === undefined
      ? {}
      : { provider_reported_comments: snapshot.provider_reported_comments }),
    access_status: identifierBoundary === undefined ? "error" : "partial",
    extraction_coverage: identifierBoundary === undefined
      ? "partial"
      : "completed_with_access_boundary",
    limitations: [limitation],
    error,
    top_level_comments_retrieved_this_call: 0,
    replies_retrieved_this_call: 0,
    records_retrieved_this_call: 0,
    comment_thread_pages_this_call: 0,
    reply_pages_this_call: 0,
    top_level_comments_retrieved_cumulative:
      snapshot?.top_level_comments_retrieved ?? 0,
    replies_retrieved_cumulative: snapshot?.replies_retrieved ?? 0,
    records_retrieved_cumulative: snapshot?.records_retrieved_cumulative ?? 0,
    comment_thread_pages_cumulative: snapshot?.comment_thread_pages ?? 0,
    reply_pages_cumulative: snapshot?.reply_pages ?? 0,
    records_returned_for_analysis: 0,
    top_level_records_returned_for_analysis: 0,
    reply_records_returned_for_analysis: 0,
    reply_count_mismatches: snapshot?.reply_count_mismatches ?? [],
    corpus_rolling_sha256: snapshot?.rolling_sha256 ?? "0".repeat(64),
    insufficient_depth: false,
    continuation_recommended: false,
    receipt: {
      completion_state: identifierBoundary === undefined
        ? "incomplete"
        : "completed_with_access_boundary",
      synthesis_lock: identifierBoundary === undefined ? "block" : "pass",
      chain_started_at_first_page:
        snapshot !== undefined || parsed.video_id_or_url !== undefined,
      top_level_pagination_exhausted: false,
      replies_reconciled: false,
      query_bounded_comments_used_as_corpus: false,
      blockers: identifierBoundary === undefined ? [limitation] : []
    }
  });
}

interface ProviderErrorShape {
  code: string;
  message: string;
  retryable: boolean;
}

function crossrefResolveFailure() {
  return errorEnvelope({
    provider: "crossref",
    recordType: "doi_resolution",
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: "error",
    limitations: ["Crossref metadata was unavailable or could not be interpreted; DOI resolution remains unresolved."],
    code: "crossref_tool_failed",
    message: "Crossref DOI resolution failed",
    retryable: false,
    data: { resolved_doi: null, candidates: [] }
  });
}

function crossrefRetractionFailure() {
  return errorEnvelope({
    provider: "crossref",
    recordType: "retraction_status",
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: "error",
    limitations: ["Crossref metadata was unavailable or could not be interpreted; retraction state remains unknown."],
    code: "crossref_tool_failed",
    message: "Crossref retraction-status lookup failed",
    retryable: false,
    data: { doi: null, status: "unknown", evidence: [], sources_checked: ["crossref"] }
  });
}

function pubmedMcpFailureCode(error: unknown): string {
  return isPubmedConfigurationError(error)
    ? "pubmed_configuration_failed"
    : "pubmed_tool_failed";
}

function pubmedMcpFailureMessage(error: unknown): string {
  return isPubmedConfigurationError(error)
    ? "PubMed configuration failed"
    : "PubMed operation failed";
}

function isPubmedConfigurationError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid PubMed configuration";
}
