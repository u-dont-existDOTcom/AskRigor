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
  fetchClinicalTrial,
  searchClinicalTrials,
  type ClinicalTrial,
  type ClinicalTrialEnrollment,
  type ClinicalTrialIntervention,
  type ClinicalTrialReference,
  type SearchClinicalTrialsInput
} from "./clinical-trials.js";
export {
  checkRetractionStatus,
  resolveDoi,
  type CrossrefCandidate,
  type ResolveDoiData,
  type RetractionEvidence,
  type RetractionStatus,
  type RetractionStatusData
} from "./crossref.js";
export {
  getYoutubeVideo,
  parseYoutubeVideoId,
  searchYoutube,
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
  type SearchYoutubeInput,
  type YoutubeConfig,
  type YoutubeSearchRecord,
  type YoutubeVideo
} from "./youtube.js";
