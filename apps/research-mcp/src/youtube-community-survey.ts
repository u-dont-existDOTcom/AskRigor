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

import { forumCorpusPurposeSchema } from "./community-evidence-denominator.js";

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

const forumCorpusExecutionPlanRefSchema = z.object({
  contract_version: z.literal("askrigor_forum_corpus_plan_ref_v2"),
  corpus_plan_id: z.string().trim().min(1).max(160),
  corpus_purpose: forumCorpusPurposeSchema,
  plan_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  query_set_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  frozen_before_outcome_classification: z.boolean(),
  prevalence_eligible: z.boolean(),
  queries: z.array(z.object({
    query_id: z.string().trim().min(1).max(120),
    query_text: z.string().trim().min(1).max(5_000),
    neutrality: z.enum(["NEUTRAL", "DIRECTIONAL", "UNCERTAIN"])
  }).strict()).min(1).max(100)
}).strict().superRefine((value, context) => {
  const eligible = value.corpus_purpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION" &&
    value.frozen_before_outcome_classification &&
    value.queries.every(({ neutrality }) => neutrality === "NEUTRAL");
  if (value.prevalence_eligible !== eligible) {
    context.addIssue({
      code: "custom",
      message: "Plan-reference prevalence eligibility must match purpose, freeze, and query neutrality"
    });
  }
});

export const youtubeCommunitySurveyInputSchema = z.object({
  research_question: z.string().trim().min(1).max(5_000),
  corpus_purpose: forumCorpusPurposeSchema.optional(),
  corpus_plan: forumCorpusExecutionPlanRefSchema.optional(),
  searches: z.array(z.object({
    query_id: z.string().trim().min(1).max(120).optional(),
    direction: youtubeCommunityDirectionSchema,
    query: z.string().trim().min(1).max(5_000),
    cursor: z.string().min(1).max(4_096).optional()
  }).strict()).min(1).max(6),
  results_per_search: z.number().int().min(1).max(10).default(10)
}).strict().superRefine((value, context) => {
  const purpose = value.corpus_purpose ?? value.corpus_plan?.corpus_purpose ??
    "PHENOTYPE_DISCOVERY";
  if (purpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION" && value.corpus_plan === undefined) {
    context.addIssue({ code: "custom", message: "Primary signal estimation requires a frozen corpus plan" });
  }
  if (value.corpus_plan !== undefined &&
    value.corpus_purpose !== undefined &&
    value.corpus_purpose !== value.corpus_plan.corpus_purpose) {
    context.addIssue({ code: "custom", message: "Corpus purpose does not match the frozen plan" });
  }
  if (value.corpus_plan !== undefined) {
    const planned = new Map(value.corpus_plan.queries.map((query) => [query.query_id, query]));
    for (const search of value.searches) {
      const exact = search.query_id === undefined ? undefined : planned.get(search.query_id);
      if (exact === undefined || exact.query_text !== search.query) {
        context.addIssue({ code: "custom", message: "Survey search is not an exact query from the frozen plan" });
      }
      if (purpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION" &&
        (search.direction !== "general" || exact?.neutrality !== "NEUTRAL")) {
        context.addIssue({ code: "custom", message: "Primary survey searches must be semantically neutral general queries" });
      }
    }
  }
});

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
  query_id: z.string().optional(),
  direction: youtubeCommunityDirectionSchema,
  query: z.string(),
  cursor: z.string().optional()
}).strict();
const surveySearchReceiptSchema = z.object({
  query_ids: z.array(z.string()).max(6),
  corpus_purpose: forumCorpusPurposeSchema,
  plan_sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  prevalence_eligible: z.boolean(),
  outside_primary_denominator: z.boolean(),
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
  corpus_purpose: forumCorpusPurposeSchema,
  plan_sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  prevalence_eligible: z.boolean(),
  outside_primary_denominator: z.boolean(),
  directions: z.array(youtubeCommunityDirectionSchema).min(1).max(6),
  search_queries: z.array(findingSchema).min(1).max(36),
  metadata_access_status: accessStatusSchema,
  title: youtubeVideoDataSchema.shape.title.optional(),
  channel_id: youtubeVideoDataSchema.shape.channel_id.optional(),
  channel_title: youtubeVideoDataSchema.shape.channel_title.optional(),
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
  corpus_purpose: forumCorpusPurposeSchema,
  plan_sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  prevalence_eligible: z.boolean(),
  outside_primary_denominator: z.boolean(),
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  error: providerErrorSchema.optional(),
  searches: z.array(surveySearchReceiptSchema).min(1).max(6),
  candidates: z.array(surveyCandidateSchema).max(60)
}).strict();

export type YoutubeCommunityDirection = z.output<typeof youtubeCommunityDirectionSchema>;
export type YoutubeCommunitySurveyInput = z.input<typeof youtubeCommunitySurveyInputSchema>;
export type YoutubeCommunitySurveyOutput = z.output<typeof youtubeCommunitySurveyOutputSchema>;

export function normalizeYoutubeCommunitySurveyOutput(
  raw: unknown
): YoutubeCommunitySurveyOutput {
  const record = typeof raw === "object" && raw !== null
    ? raw as Record<string, unknown>
    : {};
  const purpose = forumCorpusPurposeSchema.safeParse(record.corpus_purpose).success
    ? record.corpus_purpose
    : "PHENOTYPE_DISCOVERY";
  const planSha256 = typeof record.plan_sha256 === "string"
    ? record.plan_sha256
    : undefined;
  const eligible = purpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION" &&
    planSha256 !== undefined && record.prevalence_eligible === true;
  const normalizeNested = (value: unknown, search: boolean) => {
    const item = typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};
    return {
      ...item,
      ...(search && !Array.isArray(item.query_ids) ? { query_ids: [] } : {}),
      corpus_purpose: purpose,
      ...(planSha256 === undefined ? {} : { plan_sha256: planSha256 }),
      prevalence_eligible: eligible,
      outside_primary_denominator: purpose !== "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION"
    };
  };
  return youtubeCommunitySurveyOutputSchema.parse({
    ...record,
    corpus_purpose: purpose,
    ...(planSha256 === undefined ? {} : { plan_sha256: planSha256 }),
    prevalence_eligible: eligible,
    outside_primary_denominator: purpose !== "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION",
    searches: Array.isArray(record.searches)
      ? record.searches.map((item) => normalizeNested(item, true))
      : record.searches,
    candidates: Array.isArray(record.candidates)
      ? record.candidates.map((item) => normalizeNested(item, false))
      : record.candidates
  });
}

interface DistinctSearch {
  query: string;
  cursor?: string;
  directions: YoutubeCommunityDirection[];
  queryIds: string[];
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
    query_id?: string;
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
  const corpusPurpose = parsedInput.data.corpus_purpose ??
    parsedInput.data.corpus_plan?.corpus_purpose ?? "PHENOTYPE_DISCOVERY";
  const prevalenceEligible = parsedInput.data.corpus_plan?.prevalence_eligible === true &&
    corpusPurpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION";
  const planSha256 = parsedInput.data.corpus_plan?.plan_sha256;
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
    corpus_purpose: corpusPurpose,
    ...(planSha256 === undefined ? {} : { plan_sha256: planSha256 }),
    prevalence_eligible: prevalenceEligible,
    outside_primary_denominator: corpusPurpose !== "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION",
    access_status: accessStatus,
    limitations,
    searches: outcomes.map(({ search, access_status, pagination, limitations, error, records }) => ({
      query_ids: search.queryIds,
      corpus_purpose: corpusPurpose,
      ...(planSha256 === undefined ? {} : { plan_sha256: planSha256 }),
      prevalence_eligible: prevalenceEligible,
      outside_primary_denominator: corpusPurpose !== "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION",
      directions: search.directions,
      query: search.query,
      ...(search.cursor === undefined ? {} : { cursor: search.cursor }),
      access_status,
      pagination,
      limitations,
      ...(error === undefined ? {} : { error }),
      candidate_video_ids: records.map(({ video_id }) => video_id)
    })),
    candidates: candidates.map((candidate) => ({
      ...candidate,
      corpus_purpose: corpusPurpose,
      ...(planSha256 === undefined ? {} : { plan_sha256: planSha256 }),
      prevalence_eligible: prevalenceEligible,
      outside_primary_denominator: corpusPurpose !== "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION"
    }))
  });
}

function combineDistinctSearches(
  searches: z.output<typeof youtubeCommunitySurveyInputSchema>["searches"]
): DistinctSearch[] {
  const distinct = new Map<string, DistinctSearch>();
  for (const search of searches) {
    const { direction, query, cursor } = search;
    const key = JSON.stringify([query, cursor ?? null]);
    const existing = distinct.get(key);
    if (existing === undefined) {
      distinct.set(key, {
        query,
        ...(cursor === undefined ? {} : { cursor }),
        directions: [direction],
        queryIds: search.query_id === undefined ? [] : [search.query_id]
      });
    } else if (!existing.directions.includes(direction)) {
      existing.directions.push(direction);
    }
    if (existing !== undefined && search.query_id !== undefined &&
      !existing.queryIds.includes(search.query_id)) {
      existing.queryIds.push(search.query_id);
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
            ...(search.queryIds[0] === undefined ? {} : { query_id: search.queryIds[0] }),
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
): Omit<z.input<typeof surveyCandidateSchema>,
  "corpus_purpose" | "plan_sha256" | "prevalence_eligible" |
  "outside_primary_denominator"> {
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
    ...(video.channel_title === undefined ? {} : { channel_title: video.channel_title }),
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
