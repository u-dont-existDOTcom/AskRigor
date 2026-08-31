import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";
import { ACCESS_STATUSES, errorEnvelope } from "@askrigor/contracts";
import {
  PostgresEvidenceRepository,
  PUBLIC_PROLACTINOMA_GAP_SLUG,
  type PublicEvidenceGapIntakeService,
} from "@askrigor/evidence-repository";
import {
  getProtocolManifest,
  loadProtocol,
  verifyProtocolIntegrity,
  type ProtocolName
} from "@askrigor/protocol";
import {
  fetchClinicalTrial,
  fetchPubmedRecord,
  checkRetractionStatus,
  resolveDoi,
  searchClinicalTrials,
  searchEuropePmc,
  searchPubmed,
  getYoutubeComments,
  getYoutubeVideo,
  parseYoutubeVideoId,
  searchYoutube,
  searchYoutubeComments,
  youtubeCommentDataSchema,
  youtubeCommentFailureDataSchema,
  youtubeSearchRecordListSchema,
  youtubeVideoDataSchema,
  youtubeVideoFailureDataSchema
} from "@askrigor/sources";
import { z } from "zod";

import {
  PUBLIC_TOOL_LIMITS,
  optionalLivingEvidenceReuseConfigFromEnv
} from "./config.js";
import { protocolErrorResult, successfulToolResult } from "./tool-result.js";
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
  ResearchOperationHandler
} from "./research-operation.js";
import {
  createEvidenceGapReviewHandler,
  evidenceGapReviewInputSchema,
  evidenceGapReviewOutputSchema,
  evidenceGapReviewSecurityMetadata,
  publicToolSecurityMetadata,
} from "./evidence-gap-review-tool.js";
import {
  researchFrontierInputSchema,
  researchFrontierOutputSchema,
  researchFrontierToolResult
} from "./research-frontier-tool.js";
import {
  acquireOpenFullTextActionInputSchema,
  availableOpenFullTextActionOutputSchema,
  continueOpenFullTextActionInputSchema,
  createOpenFullTextActionRoutes,
  openFullTextMcpOutputSchema,
  reviewMethodAuditActionInputSchema,
  reviewMethodAuditActionOutputSchema,
  studyMethodAuditActionInputSchema,
  studyMethodAuditRouteOutputSchema
} from "./actions/open-full-text-route.js";

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
const pubmedSearchRecordSchema = z.object({ pmid: z.string() }).strict();
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
  title: z.string().optional(),
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

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
const DEFAULT_PUBMED_PAGE_SIZE = 20;
const MAX_PUBMED_PAGE_SIZE = 100;
const DEFAULT_EUROPE_PMC_PAGE_SIZE = 20;
const MAX_EUROPE_PMC_PAGE_SIZE = 100;
const DEFAULT_CLINICAL_TRIALS_PAGE_SIZE = 20;
const MAX_CLINICAL_TRIALS_PAGE_SIZE = 100;
const PUBMED_EFETCH_LIMITATION =
  "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated.";
const OPEN_FULL_TEXT_MCP_OPERATION_NAMES = new Set([
  "acquire_open_full_text",
  "continue_open_full_text",
  "validate_study_method_audit",
  "validate_review_method_audit"
]);
const PRIVATE_MCP_OPERATION_NAMES = new Set([
  "review_evidence_gap_submissions",
]);

export interface RegisterToolsOptions {
  publicEvidenceGapReviewService?: PublicEvidenceGapIntakeService;
  oauthResourceMetadataUrl?: URL;
}

function defineResearchOperations(
  registrar: Pick<McpServer, "registerTool">,
  options: RegisterToolsOptions,
): void {
  registrar.registerTool(
    "get_protocol_manifest",
    {
      description: "Return canonical protocol identity and SHA-256 metadata.",
      inputSchema: {
        protocol: protocolSchema.describe("Canonical protocol to inspect.")
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        manifest: manifestSchema.optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol }) => {
      try {
        const manifest = await getProtocolManifest(protocol);
        return successfulToolResult(
          `Protocol manifest: ${manifest.name} ${manifest.version} (${manifest.revisionDate}); SHA-256 ${manifest.sha256}.`,
          { ok: true, protocol, manifest }
        );
      } catch (error) {
        return protocolErrorResult(protocol, error);
      }
    }
  );

  registrar.registerTool(
    "load_protocol",
    {
      description: "Load the complete, unmodified canonical protocol text.",
      inputSchema: {
        protocol: protocolSchema.describe("Canonical protocol to load in full.")
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        manifest: manifestSchema.optional(),
        text: z.string().optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol }) => {
      try {
        const [text, manifest] = await Promise.all([
          loadProtocol(protocol),
          getProtocolManifest(protocol)
        ]);
        return successfulToolResult(
          `Loaded the complete canonical ${manifest.name} protocol.`,
          { ok: true, protocol, manifest, text }
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
        "Search PubMed citations and return stable PMIDs with explicit pagination and access state; no medical conclusions are generated.",
      inputSchema: searchPubmedInputSchema,
      outputSchema: pubmedSearchEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, date_range, page_size, cursor }) => {
      try {
        const result = await searchPubmed(
          {
            query,
            ...(date_range === undefined ? {} : { dateRange: date_range }),
            ...(page_size === undefined ? {} : { pageSize: page_size }),
            ...(cursor === undefined ? {} : { cursor })
          },
          ncbiConfig()
        );
        return pubmedToolResult(
          `PubMed search returned ${result.pagination.returned} PMID record(s); access status ${result.access_status}.`,
          result
        );
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
      outputSchema: pubmedRecordEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ pmid }) => {
      try {
        const result = await fetchPubmedRecord(pmid, ncbiConfig());
        return pubmedToolResult(
          `PubMed record ${pmid} retrieval finished with access status ${result.access_status}.`,
          result
        );
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
      outputSchema: europePmcSearchEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, date_range, page_size, cursor }) => {
      try {
        const result = await searchEuropePmc({
          query,
          ...(date_range === undefined ? {} : { dateRange: date_range }),
          ...(page_size === undefined ? {} : { pageSize: page_size }),
          ...(cursor === undefined ? {} : { cursor })
        });
        return europePmcToolResult(
          `Europe PMC search returned ${result.pagination.returned} record(s); access status ${result.access_status}.`,
          result
        );
      } catch (error) {
        return europePmcToolResult(
          "Europe PMC search retrieval failed; access status error.",
          europePmcSearchFailure(query, date_range, page_size, cursor, error)
        );
      }
    }
  );

  registerOpenFullTextMcpTools(registrar);

  registrar.registerTool(
    "search_clinical_trials",
    {
      description:
        "Search ClinicalTrials.gov studies with provider pagination and explicit access state; no medical conclusions are generated.",
      inputSchema: searchClinicalTrialsInputSchema,
      outputSchema: clinicalTrialsSearchEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, page_size, page_token }) => {
      try {
        const result = await searchClinicalTrials({
          query,
          ...(page_size === undefined ? {} : { pageSize: page_size }),
          ...(page_token === undefined ? {} : { pageToken: page_token })
        });
        return clinicalTrialsToolResult(
          `ClinicalTrials.gov search returned ${result.pagination.returned} study record(s); access status ${result.access_status}.`,
          result
        );
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
        "Search YouTube videos and return API-visible metadata with explicit pagination and access state; no medical conclusions are generated.",
      inputSchema: youtubeSearchInputSchema,
      outputSchema: youtubeSearchEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, page_size, cursor }) => {
      try {
        const result = await searchYoutube({
          query,
          ...(page_size === undefined ? {} : { pageSize: page_size }),
          ...(cursor === undefined ? {} : { cursor })
        }, youtubeConfig());
        return youtubeToolResult(
          `YouTube search returned ${result.pagination.returned} video record(s); access status ${result.access_status}.`,
          result
        );
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
      outputSchema: youtubeCommentEnvelopeSchema,
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
          `YouTube targeted comment retrieval returned ${result.pagination.returned} comment/reply record(s); access status ${result.access_status}.`,
          result
        );
      } catch (_error) {
        const result = youtubeCommentsFailure(query);
        return youtubeToolResult(
          "YouTube targeted comment retrieval returned 0 comment/reply record(s); access status error.",
          result
        );
      }
    }
  );

  registrar.registerTool(
    "audit_youtube_community",
    {
      description:
        "Use before synthesis whenever firsthand community evidence could plausibly matter. In one read-only call, search YouTube, deduplicate bounded provider-ranked videos, retrieve metadata, unfiltered comments and all accessible replies, and return a deterministic completion receipt; no medical conclusions are generated.",
      inputSchema: youtubeCommunityAuditInputSchema,
      outputSchema: youtubeCommunityAuditOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => {
      let result: YoutubeCommunityAuditOutput;
      try {
        result = await auditYoutubeCommunity(
          input,
          youtubeConfig(),
          { budgets: youtubeCommunityAuditBudgets() }
        );
      } catch (_error) {
        result = youtubeCommunityAuditFailure(input);
      }
      return youtubeToolResult(
        `YouTube community audit selected ${result.receipt.selected_video_ids.length} video(s); completion state ${result.receipt.completion_state}; synthesis lock ${result.receipt.synthesis_lock}.`,
        result
      );
    }
  );

  registrar.registerTool(
    "survey_youtube_community",
    {
      description:
        "Survey bounded YouTube video candidates for a community-evidence question and return deduplicated metadata, canonical watch links, provider comment counts, pagination, and access receipts; no medical conclusions are generated.",
      inputSchema: youtubeCommunitySurveyInputSchema,
      outputSchema: youtubeCommunitySurveyOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => {
      let result: YoutubeCommunitySurveyOutput;
      try {
        result = await surveyYoutubeCommunity(input, youtubeConfig());
      } catch (_error) {
        result = youtubeCommunitySurveyFailure(input);
      }
      return youtubeToolResult(
        `YouTube community survey returned ${result.candidates.length} deduplicated candidate video(s).`,
        result
      );
    }
  );

  registrar.registerTool(
    "audit_youtube_video_community",
    {
      description:
        "Retrieve one material YouTube video's unfiltered API-visible top-level comments and independently paginated replies through authenticated stateless continuation. Returns exact retrieved-versus-analyzed counts, usable partial-corpus records for bounded review, and a separate completion receipt; no medical conclusions are generated.",
      inputSchema: youtubeVideoCommunityAuditInputSchema,
      outputSchema: youtubeVideoCommunityAuditOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => {
      let result: YoutubeVideoCommunityAuditOutput;
      try {
        result = await auditYoutubeVideoCommunity(input, {
          youtube: youtubeConfig(),
          continuation_secret: youtubeAuditContinuationSecret()
        }, {
          max_elapsed_ms: PUBLIC_TOOL_LIMITS.youtubeVideoAuditElapsedMs,
          segment: {
            max_provider_requests: PUBLIC_TOOL_LIMITS.youtubeVideoAuditProviderRequests
          }
        });
      } catch (error) {
        result = youtubeVideoCommunityAuditFailure(input, error);
      }
      return youtubeToolResult(
        `YouTube video audit retrieved ${result.records_retrieved_cumulative} record(s) cumulatively; synthesis lock ${result.receipt.synthesis_lock}.`,
        result
      );
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
    }),
  );
}

function registerOpenFullTextMcpTools(
  registrar: Pick<McpServer, "registerTool">
): void {
  registrar.registerTool(
    "acquire_open_full_text",
    {
      description: "Start one lawful full-text chain. Input is exactly one doi string plus an optional pmcid string, never an identifier array. Bind the returned coverage_receipt.document_handle and coverage_receipt.source_content_sha256 for every continuation and validation. If repository_study_audit.status is reusable, also bind its repository_analysis_version_id; otherwise perform a fresh audit.",
      inputSchema: acquireOpenFullTextActionInputSchema,
      outputSchema: openFullTextMcpOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => invokeOpenFullTextMcp("acquire_open_full_text", input)
  );
  registrar.registerTool(
    "continue_open_full_text",
    {
      description: "Continue only the exact bound document_handle while its coverage_receipt.exhausted is false. Never call when exhausted is true; never switch, reacquire, or combine handles within a chain.",
      inputSchema: continueOpenFullTextActionInputSchema,
      outputSchema: availableOpenFullTextActionOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => invokeOpenFullTextMcp("continue_open_full_text", input)
  );
  registrar.registerTool(
    "validate_study_method_audit",
    {
      description: "Validate a full-text, source-linked individual-study audit on the exact exhausted document_handle. Supply either a newly performed audit or the repository_analysis_version_id advertised by this same acquisition. Repository reuse repeats exact source/protocol/rubric/freshness/impact checks and runs the same validator; fresh_study_audit_required means call again with a newly performed audit. Before synthesis, require the returned validated coverage receipt to match the acquisition byte-for-byte.",
      inputSchema: studyMethodAuditActionInputSchema,
      outputSchema: studyMethodAuditRouteOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => invokeOpenFullTextMcp("validate_study_method_audit", input)
  );
  registrar.registerTool(
    "validate_review_method_audit",
    {
      description: "Validate a full-text, source-linked review or guideline audit on the exact bound acquisition document_handle, including search coverage, study ancestry, heterogeneity, bias, conflicts, and claim scope. Before synthesis, require the returned coverage_receipt.document_handle and coverage_receipt.source_content_sha256 to match the acquisition byte-for-byte; mismatch blocks synthesis.",
      inputSchema: reviewMethodAuditActionInputSchema,
      outputSchema: reviewMethodAuditActionOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async (input) => invokeOpenFullTextMcp("validate_review_method_audit", input)
  );
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
  return {
    content: [{
      type: "text",
      text: `${operationId.replaceAll("_", " ")} completed.`
    }],
    structuredContent: result.body as Record<string, unknown>
  };
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
        : publicToolSecurityMetadata();
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
          !PRIVATE_MCP_OPERATION_NAMES.has(name),
        execute,
        mcpConfig
      }));
      return undefined;
    }
  } as unknown as Pick<McpServer, "registerTool">;

  defineResearchOperations(registrar, options);
  if (operations.length !== 23) {
    throw new Error(`Expected 23 research operations; received ${operations.length}`);
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
  structuredContent: object & { error?: unknown }
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...structuredContent },
    ...(structuredContent.error === undefined ? {} : { isError: true })
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
