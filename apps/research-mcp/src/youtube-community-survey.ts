import { ACCESS_STATUSES, type AccessStatus, type Pagination, type ProviderError } from "@askrigor/contracts";
import {
  getYoutubeVideo,
  searchYoutube,
  youtubeVideoDataSchema,
  type YoutubeConfig,
  type YoutubeSearchRecord,
  type YoutubeVideo
} from "@askrigor/sources";
import { z } from "zod";

const DISCOVERY_LIMITATION =
  "YouTube discovery used one bounded provider-ranked page per requested search; it did not exhaust the platform or determine final materiality.";

export const youtubeCommunityDirectionSchema = z.enum([
  "general",
  "benefit",
  "no_effect",
  "harm",
  "discontinuation",
  "formal_discriminator"
]);

export const youtubeCommunitySurveyInputSchema = z.object({
  research_question: z.string().trim().min(1).max(5_000),
  searches: z.array(z.object({
    direction: youtubeCommunityDirectionSchema,
    query: z.string().trim().min(1).max(5_000),
    cursor: z.string().min(1).max(4_096).optional()
  }).strict()).min(1).max(6),
  results_per_search: z.number().int().min(1).max(10).default(10)
}).strict();

const accessStatusSchema = z.enum(ACCESS_STATUSES);
const paginationSchema = z.object({
  cursor: z.string().optional(),
  next_cursor: z.string().optional(),
  page_size: z.number().int().positive().optional(),
  returned: z.number().int().nonnegative(),
  exhausted: z.boolean().optional()
}).strict();
const providerErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  http_status: z.number().int().optional(),
  retryable: z.boolean().optional()
}).strict();
const findingSchema = z.object({
  direction: youtubeCommunityDirectionSchema,
  query: z.string(),
  cursor: z.string().optional()
}).strict();
const surveySearchReceiptSchema = z.object({
  directions: z.array(youtubeCommunityDirectionSchema).min(1).max(6),
  query: z.string(),
  cursor: z.string().optional(),
  access_status: accessStatusSchema,
  pagination: paginationSchema,
  limitations: z.array(z.string()),
  error: providerErrorSchema.optional(),
  candidate_video_ids: z.array(z.string()).max(10)
}).strict();
const surveyCandidateSchema = z.object({
  video_id: z.string(),
  canonical_url: z.string().url(),
  directions: z.array(youtubeCommunityDirectionSchema).min(1).max(6),
  search_queries: z.array(findingSchema).min(1).max(36),
  metadata_access_status: accessStatusSchema,
  title: youtubeVideoDataSchema.shape.title.optional(),
  channel_id: youtubeVideoDataSchema.shape.channel_id.optional(),
  published_at: youtubeVideoDataSchema.shape.published_at.optional(),
  duration: youtubeVideoDataSchema.shape.duration.optional(),
  statistics: youtubeVideoDataSchema.shape.statistics.optional(),
  provider_reported_comments: z.string().regex(/^(0|[1-9][0-9]*)$/).optional(),
  metadata_error: providerErrorSchema.optional(),
  limitations: z.array(z.string())
}).strict();

export const youtubeCommunitySurveyOutputSchema = z.object({
  provider: z.literal("youtube"),
  record_type: z.literal("youtube_community_survey"),
  retrieved_at: z.string(),
  research_question: z.string(),
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  searches: z.array(surveySearchReceiptSchema).min(1).max(6),
  candidates: z.array(surveyCandidateSchema).max(60)
}).strict();

export type YoutubeCommunityDirection = z.output<typeof youtubeCommunityDirectionSchema>;
export type YoutubeCommunitySurveyInput = z.input<typeof youtubeCommunitySurveyInputSchema>;
export type YoutubeCommunitySurveyOutput = z.output<typeof youtubeCommunitySurveyOutputSchema>;

interface DistinctSearch {
  query: string;
  cursor?: string;
  directions: YoutubeCommunityDirection[];
}

interface SearchOutcome {
  search: DistinctSearch;
  access_status: AccessStatus;
  pagination: Pagination;
  limitations: string[];
  error?: ProviderError;
  records: YoutubeSearchRecord[];
}

interface CandidateAssociation {
  directions: YoutubeCommunityDirection[];
  findings: Array<{
    direction: YoutubeCommunityDirection;
    query: string;
    cursor?: string;
  }>;
}

export async function surveyYoutubeCommunity(
  input: YoutubeCommunitySurveyInput,
  config: YoutubeConfig
): Promise<YoutubeCommunitySurveyOutput> {
  const parsedInput = youtubeCommunitySurveyInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error("YouTube community survey input is invalid");
  }
  const distinctSearches = combineDistinctSearches(parsedInput.data.searches);
  const outcomes = await Promise.all(distinctSearches.map(async (search): Promise<SearchOutcome> => {
    const result = await searchYoutube({
      query: search.query,
      pageSize: parsedInput.data.results_per_search,
      ...(search.cursor === undefined ? {} : { cursor: search.cursor })
    }, config);
    return {
      search,
      access_status: result.access_status,
      pagination: result.pagination,
      limitations: result.limitations,
      ...(result.error === undefined ? {} : { error: result.error }),
      records: result.data
    };
  }));
  const orderedVideoIds = roundRobinVideoIds(outcomes);
  const associations = candidateAssociations(outcomes);
  const candidates = await Promise.all(orderedVideoIds.map(async (videoId) => {
    const metadata = await getYoutubeVideo(videoId, config);
    const association = associations.get(videoId)!;
    return candidateFromMetadata(videoId, association, metadata);
  }));
  const allSearchesComplete = outcomes.every(({ access_status }) => isComplete(access_status));
  const allMetadataComplete = candidates.every(({ metadata_access_status }) =>
    isComplete(metadata_access_status)
  );
  const anySearchComplete = outcomes.some(({ access_status }) => isComplete(access_status));
  const accessStatus: AccessStatus = allSearchesComplete && allMetadataComplete
    ? "complete"
    : anySearchComplete || candidates.length > 0
      ? "partial"
      : outcomes[0]?.access_status ?? "error";
  const limitations = uniqueStrings([
    DISCOVERY_LIMITATION,
    ...outcomes.flatMap(({ limitations: values }) => values),
    ...candidates.flatMap(({ limitations: values }) => values)
  ]);

  return youtubeCommunitySurveyOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_community_survey",
    retrieved_at: new Date().toISOString(),
    research_question: parsedInput.data.research_question,
    access_status: accessStatus,
    limitations,
    searches: outcomes.map(({ search, access_status, pagination, limitations, error, records }) => ({
      directions: search.directions,
      query: search.query,
      ...(search.cursor === undefined ? {} : { cursor: search.cursor }),
      access_status,
      pagination,
      limitations,
      ...(error === undefined ? {} : { error }),
      candidate_video_ids: records.map(({ video_id }) => video_id)
    })),
    candidates
  });
}

function combineDistinctSearches(
  searches: z.output<typeof youtubeCommunitySurveyInputSchema>["searches"]
): DistinctSearch[] {
  const distinct = new Map<string, DistinctSearch>();
  for (const { direction, query, cursor } of searches) {
    const key = JSON.stringify([query, cursor ?? null]);
    const existing = distinct.get(key);
    if (existing === undefined) {
      distinct.set(key, {
        query,
        ...(cursor === undefined ? {} : { cursor }),
        directions: [direction]
      });
    } else if (!existing.directions.includes(direction)) {
      existing.directions.push(direction);
    }
  }
  return [...distinct.values()];
}

function roundRobinVideoIds(outcomes: readonly SearchOutcome[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const maxRecords = Math.max(0, ...outcomes.map(({ records }) => records.length));
  for (let index = 0; index < maxRecords; index += 1) {
    for (const { records } of outcomes) {
      const id = records[index]?.video_id;
      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  }
  return ordered;
}

function candidateAssociations(outcomes: readonly SearchOutcome[]): Map<string, CandidateAssociation> {
  const associations = new Map<string, CandidateAssociation>();
  for (const { search, records } of outcomes) {
    for (const { video_id } of records) {
      const association = associations.get(video_id) ?? { directions: [], findings: [] };
      for (const direction of search.directions) {
        if (!association.directions.includes(direction)) association.directions.push(direction);
        if (!association.findings.some((finding) =>
          finding.direction === direction &&
          finding.query === search.query &&
          finding.cursor === search.cursor
        )) {
          association.findings.push({
            direction,
            query: search.query,
            ...(search.cursor === undefined ? {} : { cursor: search.cursor })
          });
        }
      }
      associations.set(video_id, association);
    }
  }
  return associations;
}

function candidateFromMetadata(
  videoId: string,
  association: CandidateAssociation,
  metadata: Awaited<ReturnType<typeof getYoutubeVideo>>
): z.input<typeof surveyCandidateSchema> {
  const base = {
    video_id: videoId,
    canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
    directions: association.directions,
    search_queries: association.findings,
    metadata_access_status: metadata.access_status,
    ...(metadata.error === undefined ? {} : { metadata_error: metadata.error }),
    limitations: metadata.limitations
  };
  if (!isComplete(metadata.access_status)) return base;
  const video = metadata.data as YoutubeVideo;
  return {
    ...base,
    ...(video.title === undefined ? {} : { title: video.title }),
    ...(video.channel_id === undefined ? {} : { channel_id: video.channel_id }),
    ...(video.published_at === undefined ? {} : { published_at: video.published_at }),
    ...(video.duration === undefined ? {} : { duration: video.duration }),
    ...(video.statistics === undefined ? {} : { statistics: video.statistics }),
    ...(video.statistics?.comment_count === undefined
      ? {}
      : { provider_reported_comments: video.statistics.comment_count })
  };
}

function isComplete(status: AccessStatus): boolean {
  return status === "complete" || status === "api_visible_complete";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
