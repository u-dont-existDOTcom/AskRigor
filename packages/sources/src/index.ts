export {
  ALLOWED_UPSTREAM_HOSTS,
  fetchJson,
  fetchText,
  type UpstreamFetchOptions,
} from "./http.js";
export { decodeCursor, encodeCursor } from "./cursor.js";
export {
  fetchPubmedRecord,
  searchPubmed,
  type PubmedConfig,
  type PubmedDateRange,
  type PubmedRecord,
  type PubmedRecordDate,
  type PubmedSearchRecord,
  type SearchPubmedInput
} from "./pubmed.js";
export {
  searchEuropePmc,
  type EuropePmcDateRange,
  type EuropePmcRecord,
  type SearchEuropePmcInput
} from "./europe-pmc.js";
export {
  fetchEuropePmcFullText,
  type EuropePmcFullTextArticle
} from "./europe-pmc-full-text.js";
export {
  resolveUnpaywallOpenAccess,
  type UnpaywallConfig,
  type UnpaywallOpenAccessData,
  type UnpaywallOpenLocation
} from "./unpaywall.js";
export {
  acquireUnpaywallFullText,
  extractAuditablePdf,
  type AcquireUnpaywallFullTextRuntime,
  type UnpaywallFullTextData
} from "./unpaywall-full-text.js";
export {
  acquireOpenFullText,
  type AcquireOpenFullTextInput,
  type AcquireOpenFullTextRuntime,
  type OpenFullTextAcquisitionData
} from "./open-full-text.js";
export {
  indexJatsStudyDocument,
  jatsStudyBlockSchema,
  jatsStudyIndexSchema,
  type JatsStudyBlock,
  type JatsStudyIndex
} from "./jats-study-index.js";
export {
  auditableDocumentBlockSchema,
  auditableDocumentIndexSchema,
  toAuditableDocumentIndex,
  type AuditableDocumentBlock,
  type AuditableDocumentIndex
} from "./auditable-document-index.js";
export {
  fetchClinicalTrial,
  searchClinicalTrials,
  type ClinicalTrial,
  type ClinicalTrialEnrollment,
  type ClinicalTrialIntervention,
  type ClinicalTrialReference,
  type SearchClinicalTrialsInput
} from "./clinical-trials.js";
export {
  checkCrossrefPublicationIntegrity,
  checkRetractionStatus,
  resolveDoi,
  type CrossrefConfig,
  type CrossrefPublicationIntegrityData,
  type CrossrefCandidate,
  type ResolveDoiData,
  type RetractionEvidence,
  type RetractionStatus,
  type RetractionStatusData
} from "./crossref.js";
export { normalizeDoiIdentifier } from "./doi.js";
export {
  lookupForrtReplicationRelationships,
  type ForrtReplicationLookupData,
} from "./forrt-replication.js";
export {
  adaptPubpeerAuthorizedRecord,
  pubpeerAuthorizedFailureSchema,
  pubpeerAuthorizedRecordSchema,
  pubpeerAuthorizedResponseSchema,
  type PubpeerPostPublicationLookupData,
} from "./pubpeer-postpublication.js";
export {
  adaptEpistemonikosAuthorizedRecord,
  epistemonikosAuthorizedFailureSchema,
  epistemonikosAuthorizedRecordSchema,
  epistemonikosAuthorizedResponseSchema,
  type EpistemonikosReviewAncestryLookupData,
} from "./epistemonikos-ancestry.js";
export {
  RETRACTION_WATCH_GITLAB_PROJECT_ID,
  RETRACTION_WATCH_HEADERS,
  RETRACTION_WATCH_SOURCE_PATH,
  RETRACTION_WATCH_SOURCE_REF,
  RETRACTION_WATCH_SOURCE_REPOSITORY,
  buildRetractionWatchSnapshot,
  derivePublicationRecordState,
  fetchOfficialRetractionWatchSource,
  installRetractionWatchSnapshot,
  loadVerifiedRetractionWatchSnapshot,
  retractionWatchSnapshotIdForSource,
  retractionWatchSnapshotManifestSchema,
  retractionWatchSnapshotPointerSchema,
  rollbackRetractionWatchSnapshot,
  type BuildRetractionWatchSnapshotInput,
  type InstallRetractionWatchSnapshotInput,
  type LoadRetractionWatchSnapshotInput,
  type OfficialRetractionWatchSource,
  type RetractionWatchNormalizedRecord,
  type RetractionWatchPmidLookupData,
  type RetractionWatchPublicationIntegrityData,
  type RetractionWatchSnapshotManifest,
  type RetractionWatchSnapshotPointer,
  type RetractionWatchSnapshotReader,
  type RetractionWatchSnapshotSourceIdentity,
} from "./retraction-watch-snapshot.js";
export {
  getYoutubeComments,
  getYoutubeVideo,
  parseYoutubeVideoId,
  searchYoutube,
  searchYoutubeComments,
  youtubeCommentDataSchema,
  youtubeCommentFailureDataSchema,
  youtubeCommentManifestSchema,
  youtubeCommentSchema,
  youtubeCountSchema,
  youtubeDurationSchema,
  youtubeLiveStateSchema,
  youtubePrivacyStatusSchema,
  youtubeSearchRecordListSchema,
  youtubeSearchRecordSchema,
  youtubeTimestampSchema,
  youtubeVideoDataSchema,
  youtubeVideoFailureDataSchema,
  youtubeVideoIdSchema,
  YOUTUBE_SEARCH_QUOTA_EXHAUSTED_CODE,
  DEFAULT_YOUTUBE_COMMENT_RETRIEVAL_BUDGETS,
  MIN_YOUTUBE_COMMENT_OUTPUT_BYTES,
  type GetYoutubeCommentsInput,
  type SearchYoutubeCommentsInput,
  type SearchYoutubeInput,
  type YoutubeComment,
  type YoutubeCommentData,
  type YoutubeCommentManifest,
  type YoutubeCommentRetrievalBudgets,
  type YoutubeCommentRetrievalRuntime,
  type YoutubeConfig,
  type YoutubeRequestRuntime,
  type YoutubeReplyCountMismatch,
  type YoutubeSearchRecord,
  type YoutubeVideo
} from "./youtube.js";
export {
  getYoutubeCommentSegment,
  getYoutubeCommentsByIds,
  type YoutubeCommentSegmentCursor,
  type YoutubeCommentRefetchRuntime,
  type YoutubeCommentSegmentResult,
  type YoutubeCommentSegmentRuntime
} from "./youtube-comment-segment.js";
export {
  lookupRedditThread,
  lookupRedditThreads,
  redditPostId,
  type RedditThreadLookup
} from "./reddit-thread.js";
export {
  GEMINI_YOUTUBE_CANDIDATE_CONTRACT,
  GEMINI_YOUTUBE_CANDIDATE_LEGACY_CONTRACT,
  GEMINI_YOUTUBE_CANDIDATE_LEGACY_PACKET_VERSION,
  GEMINI_YOUTUBE_CANDIDATE_MODE,
  GEMINI_YOUTUBE_CANDIDATE_PACKET_NAME,
  GEMINI_YOUTUBE_CANDIDATE_PACKET_VERSION,
  GEMINI_YOUTUBE_SUMMARY_BASIS,
  LEGACY_SPARK_YOUTUBE_SUMMARY_BASIS,
  MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES,
  GeminiYoutubeCandidateHandoffError,
  geminiTitleOnlyCandidateSchema,
  geminiYoutubeCandidatePacketSchema,
  geminiYoutubeCandidateV2PacketSchema,
  geminiYoutubeCandidateFrontierSchema,
  geminiYoutubeCandidateValidationReceiptSchema,
  geminiYoutubeDiscoveryPurposeSchema,
  geminiYoutubeInterventionFamilySchema,
  geminiYoutubeSummaryBasisSchema,
  parseGeminiYoutubeCandidateHandoff,
  deriveGeminiYoutubeCandidateFrontier,
  validateGeminiYoutubeCandidateHandoff,
  youtubeChannelsEqual,
  youtubeTitlesEqual,
  type GeminiYoutubeCandidateHandoffErrorCode,
  type GeminiYoutubeCandidateHandoffIssue,
  type GeminiYoutubeCandidatePacket,
  type GeminiYoutubeCandidateValidationDependencies,
  type GeminiYoutubeCandidateValidationReceipt
} from "./gemini-youtube-candidate-handoff.js";
export {
  GEMINI_YOUTUBE_SCOUT_MAX_OUTPUT_TOKENS,
  GEMINI_YOUTUBE_SCOUT_MODEL,
  GEMINI_YOUTUBE_SCOUT_MAX_SEARCH_QUERIES,
  GEMINI_YOUTUBE_SCOUT_MAX_TITLE_ONLY_CANDIDATES,
  GEMINI_YOUTUBE_SCOUT_MAX_REDISCOVERY_LEADS,
  GEMINI_YOUTUBE_SCOUT_MAX_LEAD_CHARACTERS,
  GEMINI_YOUTUBE_BACKGROUND_REQUEST_TIMEOUT_MS,
  advanceGeminiYoutubeScoutBackground,
  deleteGeminiYoutubeScoutInteraction,
  geminiYoutubeScoutBackgroundCheckpointSchema,
  geminiYoutubeScoutLanguageSchema,
  scoutGeminiYoutubeCandidates,
  type GeminiYoutubeScoutBackgroundAdvance,
  type GeminiYoutubeScoutBackgroundCheckpoint,
  type GeminiYoutubeScoutConfig,
  type GeminiYoutubeScoutData,
  type GeminiYoutubeScoutInput
} from "./gemini-youtube-scout.js";
export {
  GEMINI_VIDEO_BOUNDARY_CODES,
  GEMINI_VIDEO_MAX_CLAIMS,
  GEMINI_VIDEO_MAX_POLLS,
  GEMINI_VIDEO_MODEL,
  GEMINI_VIDEO_MOMENT_SPAN_SECONDS,
  GEMINI_VIDEO_REQUEST_TIMEOUT_MS,
  advanceGeminiVideoPass,
  buildGeminiVideoRequest,
  deleteGeminiVideoInteraction,
  formatVideoTime,
  geminiVideoCheckpointSchema,
  geminiVideoClaimSchema,
  geminiVideoClaimsReportSchema,
  geminiVideoMomentReportSchema,
  geminiVideoRequestSchema,
  geminiVideoWatchUrl,
  parseVideoTime,
  type GeminiVideoAdvance,
  type GeminiVideoBoundaryCode,
  type GeminiVideoCheckpoint,
  type GeminiVideoClaimsReport,
  type GeminiVideoConfig,
  type GeminiVideoMomentReport,
  type GeminiVideoRequest,
  type GeminiVideoUsage
} from "./gemini-video-claims.js";
export {
  createYoutubeTranscriptProvider,
  getYoutubeTranscript,
  youtubeTranscriptEnvelopeSchema,
  youtubeTranscriptInputSchema,
  youtubeTranscriptSegmentSchema,
  youtubeTranscriptTrackSchema,
  type YoutubeTranscriptEnvelope,
  type YoutubeTranscriptInput,
  type YoutubeTranscriptProvider,
  type YoutubeTranscriptProviderOptions,
  type YoutubeTranscriptProvenance,
  type YoutubeTranscriptRuntime
} from "./youtube-transcript.js";

export { acquisitionStateSchema, candidateUrlsSchema, fullTextCandidateSchema, publicCopySearchSchema, publicCopySearchResultSchema, hasFailedFullTextAcquisition, canSignFullTextLead, admitFullText, FULL_TEXT_BODY_MIN_CHARACTERS, type AcquisitionState, type FullTextCandidate, type FrozenArticleIdentity } from "./full-text-admission.js";
