import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeYoutubeCommunitySurveyOutput,
  surveyYoutubeCommunity,
  youtubeCommunitySurveyInputSchema
} from "../apps/research-mcp/src/youtube-community-survey.js";

const YOUTUBE = { apiKey: "recorded-youtube-key" };
const fixture = (name: string) =>
  readFile(new URL(`fixtures/youtube/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("YouTube community survey", () => {
  it("deduplicates directional discovery while preserving links, cursors, and provider counts", async () => {
    const [searchBody, videoBody] = await Promise.all([
      fixture("search-page-1.json"),
      fixture("video-found.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return url.pathname.endsWith("/search")
        ? new Response(searchBody, { status: 200 })
        : new Response(videoBody, { status: 200 });
    }));

    const result = await surveyYoutubeCommunity({
      research_question: "Which hip osteoarthritis approaches help in real life?",
      searches: [
        {
          direction: "general",
          query: "hip osteoarthritis treatment experience",
          cursor: "cursor-general"
        },
        { direction: "benefit", query: "hip pain treatment success" }
      ],
      results_per_search: 10
    }, YOUTUBE);

    expect(result).toMatchObject({
      provider: "youtube",
      record_type: "youtube_community_survey",
      corpus_purpose: "PHENOTYPE_DISCOVERY",
      prevalence_eligible: false,
      outside_primary_denominator: true,
      access_status: "complete",
      research_question: "Which hip osteoarthritis approaches help in real life?",
      searches: [
        {
          directions: ["general"],
          query: "hip osteoarthritis treatment experience",
          cursor: "cursor-general",
          access_status: "complete",
          pagination: {
            cursor: "cursor-general",
            next_cursor: "opaque+/next-token",
            page_size: 10,
            returned: 1,
            exhausted: false
          },
          candidate_video_ids: ["XpZHKGGCK-o"]
        },
        {
          directions: ["benefit"],
          query: "hip pain treatment success",
          access_status: "complete",
          candidate_video_ids: ["XpZHKGGCK-o"]
        }
      ],
      candidates: [{
        video_id: "XpZHKGGCK-o",
        canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
        directions: ["general", "benefit"],
        search_queries: [
          { direction: "general", query: "hip osteoarthritis treatment experience", cursor: "cursor-general" },
          { direction: "benefit", query: "hip pain treatment success" }
        ],
        metadata_access_status: "api_visible_complete",
        title: "Recorded video title",
        channel_id: "UC0123456789abcdefghijkl",
        channel_title: "Recorded health channel",
        published_at: "2025-01-02T03:04:05Z",
        duration: "PT12M34S",
        statistics: {
          view_count: "12345678901234567890",
          like_count: "42",
          comment_count: "7"
        },
        provider_reported_comments: "7"
      }]
    });
    expect(result.limitations).toContain(
      "YouTube discovery used one bounded provider-ranked page per requested search; it did not exhaust the platform or determine final materiality."
    );
    expect(requests.filter(({ pathname }) => pathname.endsWith("/search"))).toHaveLength(2);
    expect(requests.filter(({ pathname }) => pathname.endsWith("/videos"))).toHaveLength(1);
    expect(requests[0]!.searchParams.get("pageToken")).toBe("cursor-general");
    expect(requests
      .filter(({ pathname }) => pathname.endsWith("/search"))
      .every(({ searchParams }) => searchParams.get("maxResults") === "10")).toBe(true);

    const legacy = structuredClone(result) as Record<string, unknown> & {
      searches: Array<Record<string, unknown>>;
      candidates: Array<Record<string, unknown>>;
    };
    delete legacy.corpus_purpose;
    delete legacy.plan_sha256;
    delete legacy.prevalence_eligible;
    delete legacy.outside_primary_denominator;
    for (const search of legacy.searches) {
      delete search.query_ids;
      delete search.corpus_purpose;
      delete search.plan_sha256;
      delete search.prevalence_eligible;
      delete search.outside_primary_denominator;
    }
    for (const candidate of legacy.candidates) {
      delete candidate.corpus_purpose;
      delete candidate.plan_sha256;
      delete candidate.prevalence_eligible;
      delete candidate.outside_primary_denominator;
    }
    const normalizedLegacy = normalizeYoutubeCommunitySurveyOutput(legacy);
    expect(normalizedLegacy).toMatchObject({
      corpus_purpose: "PHENOTYPE_DISCOVERY",
      prevalence_eligible: false,
      outside_primary_denominator: true
    });
    expect(normalizedLegacy.searches.every((search) =>
      search.query_ids.length === 0 &&
      search.corpus_purpose === "PHENOTYPE_DISCOVERY" &&
      search.prevalence_eligible === false &&
      search.outside_primary_denominator === true
    )).toBe(true);
    expect(normalizedLegacy.candidates.every((candidate) =>
      candidate.corpus_purpose === "PHENOTYPE_DISCOVERY" &&
      candidate.prevalence_eligible === false &&
      candidate.outside_primary_denominator === true
    )).toBe(true);
  });

  it("combines identical query/cursor pairs without losing their directions", async () => {
    const [searchBody, videoBody] = await Promise.all([
      fixture("search-page-1.json"),
      fixture("video-found.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return url.pathname.endsWith("/search")
        ? new Response(searchBody, { status: 200 })
        : new Response(videoBody, { status: 200 });
    }));

    const result = await surveyYoutubeCommunity({
      research_question: "Recorded question",
      searches: [
        { direction: "no_effect", query: "same query", cursor: "same-cursor" },
        { direction: "harm", query: "same query", cursor: "same-cursor" }
      ]
    }, YOUTUBE);

    expect(requests.filter(({ pathname }) => pathname.endsWith("/search"))).toHaveLength(1);
    expect(result.searches).toHaveLength(1);
    expect(result.searches[0]).toMatchObject({ directions: ["no_effect", "harm"] });
    expect(result.candidates[0]).toMatchObject({ directions: ["no_effect", "harm"] });
  });

  it("keeps a metadata failure explicit rather than discarding the discovered candidate", async () => {
    const [searchBody, videoEmpty] = await Promise.all([
      fixture("search-page-1.json"),
      fixture("video-empty.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/search")
        ? new Response(searchBody, { status: 200 })
        : new Response(videoEmpty, { status: 200 });
    }));

    const result = await surveyYoutubeCommunity({
      research_question: "Recorded question",
      searches: [{ direction: "discontinuation", query: "stopped hip treatment" }]
    }, YOUTUBE);

    expect(result).toMatchObject({
      access_status: "partial",
      candidates: [{
        video_id: "XpZHKGGCK-o",
        canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
        metadata_access_status: "inaccessible",
        metadata_error: {
          code: "youtube_video_not_visible",
          message: "YouTube did not expose the requested video"
        }
      }]
    });
    expect(result.candidates[0]).not.toHaveProperty("provider_reported_comments");
  });

  it("returns a complete bounded receipt when discovery finds zero candidates", async () => {
    const emptySearch = await fixture("search-empty.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(emptySearch, { status: 200 });
    }));

    const result = await surveyYoutubeCommunity({
      research_question: "No matching recorded topic",
      searches: [{ direction: "general", query: "deliberately absent recorded topic" }]
    }, YOUTUBE);

    expect(result).toMatchObject({ access_status: "complete", candidates: [] });
    expect(requests).toHaveLength(1);
  });

  it("bounds survey inputs to six searches and ten results per search", () => {
    expect(youtubeCommunitySurveyInputSchema.safeParse({
      research_question: "Question",
      searches: Array.from({ length: 7 }, (_, index) => ({
        direction: "general",
        query: `query ${index}`
      }))
    }).success).toBe(false);
    expect(youtubeCommunitySurveyInputSchema.safeParse({
      research_question: "Question",
      searches: [{ direction: "general", query: "query" }],
      results_per_search: 11
    }).success).toBe(false);
  });

  it("requires an exact frozen neutral plan reference for primary estimation", () => {
    const base = {
      research_question: "What outcomes are visible in the neutral corpus?",
      corpus_purpose: "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION" as const,
      searches: [{ query_id: "q1", direction: "general" as const, query: "subject experience" }]
    };
    expect(youtubeCommunitySurveyInputSchema.safeParse(base).success).toBe(false);
    const corpusPlan = {
      contract_version: "askrigor_forum_corpus_plan_ref_v2" as const,
      corpus_plan_id: "neutral-plan",
      corpus_purpose: "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION" as const,
      plan_sha256: "a".repeat(64),
      query_set_sha256: "b".repeat(64),
      frozen_before_outcome_classification: true,
      prevalence_eligible: true,
      queries: [{
        query_id: "q1",
        query_text: "subject experience",
        neutrality: "NEUTRAL" as const
      }]
    };
    expect(youtubeCommunitySurveyInputSchema.safeParse({
      ...base,
      corpus_plan: corpusPlan
    }).success).toBe(true);
    expect(youtubeCommunitySurveyInputSchema.safeParse({
      ...base,
      corpus_plan: corpusPlan,
      searches: [{ query_id: "q1", direction: "general", query: "subject worked" }]
    }).success).toBe(false);
  });
});
