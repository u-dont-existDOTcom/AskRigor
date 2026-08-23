import { describe, expect, it } from "vitest";

import {
  acquireUnpaywallFullText,
  getYoutubeComments,
  getYoutubeVideo,
  resolveDoi,
  searchClinicalTrials,
  searchEuropePmc,
  searchPubmed,
  type YoutubeCommentRetrievalRuntime
} from "../packages/sources/src/index.js";

const live = process.env.ASKRIGOR_LIVE_TESTS === "1";
const ncbiEmail = process.env.NCBI_EMAIL?.trim();
const crossrefMailto = process.env.CROSSREF_MAILTO?.trim();
const youtubeApiKey = process.env.YOUTUBE_API_KEY?.trim();
const youtubeVideoId = process.env.ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID?.trim();
const unpaywallEmail = process.env.ASKRIGOR_UNPAYWALL_EMAIL?.trim() ||
  "support@askrigor.com";
const LIVE_TIMEOUT_MS = 30_000;
const YOUTUBE_SMOKE_RUNTIME: YoutubeCommentRetrievalRuntime = {
  budgets: {
    maxProviderRequestAttempts: 30,
    maxCommentThreadPages: 2,
    maxReplyPages: 20,
    maxThreads: 200,
    maxComments: 500,
    maxNormalizedOutputBytes: 2 * 1_024 * 1_024,
    maxTextBytes: 1_024 * 1_024,
    maxElapsedMs: 20_000
  }
};

describe.runIf(live)("live provider smoke tests", () => {
  it.skipIf(ncbiEmail === undefined || ncbiEmail.length === 0)(
    "queries a bounded PubMed page when NCBI_EMAIL enables the adapter",
    async () => {
      const result = await searchPubmed({
        query: "COVID-19[Title] AND 2020/01/01:2020/01/02[Date - Publication]",
        pageSize: 1
      }, {
        tool: process.env.NCBI_TOOL?.trim() || "askrigor-live-smoke",
        email: ncbiEmail!,
        ...(process.env.NCBI_API_KEY?.trim()
          ? { apiKey: process.env.NCBI_API_KEY.trim() }
          : {})
      });

      expect(result.provider).toBe("pubmed");
      expect(result.access_status).toBe("complete");
      expect(result.pagination.returned).toBe(result.data.length);
      expect(result.data.length).toBeLessThanOrEqual(1);
      expect(result.data.every(({ pmid }) => /^[1-9]\d*$/.test(pmid))).toBe(true);
    },
    LIVE_TIMEOUT_MS
  );

  it("queries one bounded Europe PMC page", async () => {
    const result = await searchEuropePmc({
      query: "COVID-19",
      dateRange: { start: "2020-01-01", end: "2020-01-02" },
      pageSize: 1
    });

    expect(result.provider).toBe("europe_pmc");
    expect(result.access_status).toBe("complete");
    expect(result.pagination.returned).toBe(result.data.length);
    expect(result.data.length).toBeLessThanOrEqual(1);
    expect(result.data.every(({ source, id }) => source.length > 0 && id.length > 0))
      .toBe(true);
  }, LIVE_TIMEOUT_MS);

  it("queries one bounded ClinicalTrials.gov page", async () => {
    const result = await searchClinicalTrials({ query: "asthma", pageSize: 1 });

    expect(result.provider).toBe("clinicaltrials_gov");
    expect(result.access_status).toBe("complete");
    expect(result.pagination.returned).toBe(result.data.length);
    expect(result.data.length).toBeLessThanOrEqual(1);
    expect(result.data.every(({ nct_id }) => /^NCT\d{8}$/.test(nct_id))).toBe(true);
  }, LIVE_TIMEOUT_MS);

  it("discovers, fetches, extracts, and identity-checks one open PDF through Unpaywall", async () => {
    const candidates = [
      "10.3389/fpsyg.2020.02084",
      "10.1038/s41598-020-73777-8",
      "10.7554/eLife.43882"
    ];
    const attempts = [];
    let result: Awaited<ReturnType<typeof acquireUnpaywallFullText>> | undefined;
    for (const doi of candidates) {
      const candidate = await acquireUnpaywallFullText(doi, { email: unpaywallEmail });
      attempts.push({
        doi,
        access_status: candidate.access_status,
        limitations: candidate.limitations,
        access_boundary: candidate.data.access_boundary,
        attempted_locations: candidate.data.attempted_locations
      });
      if (candidate.access_status === "complete") {
        result = candidate;
        break;
      }
    }

    if (result === undefined) throw new Error(JSON.stringify({ attempts }));
    expect(result.provider).toBe("unpaywall");
    expect(result.access_status).toBe("complete");
    expect(result.data.outcome).toBe("full_text_indexed");
    expect(result.data.document_index).toMatchObject({
      source: {
        provider: "unpaywall_open_location",
        format: "pdf_text",
        document_completeness: "full_text_with_body",
        identity_verification: "doi_exact"
      }
    });
    expect(result.data.document_index?.source.primary_identifier).toBe(
      result.data.requested_doi
    );
    expect(result.data.document_index?.blocks.length).toBeGreaterThan(0);
  }, 60_000);

  it.skipIf(crossrefMailto === undefined || crossrefMailto.length === 0)(
    "resolves a known DOI when CROSSREF_MAILTO enables the adapter",
    async () => {
      const result = await resolveDoi("10.1038/s41586-020-2649-2", {
        mailto: crossrefMailto!
      });

      expect(result.provider).toBe("crossref");
      expect(result.access_status).toBe("metadata_only");
      expect(result.data.resolved_doi).toBe("10.1038/s41586-020-2649-2");
      expect(result.pagination.exhausted).toBe(true);
    },
    LIVE_TIMEOUT_MS
  );

  it.skipIf(
    youtubeApiKey === undefined || youtubeApiKey.length === 0 ||
    youtubeVideoId === undefined || youtubeVideoId.length === 0
  )(
    "reconciles a complete API-visible YouTube corpus (skips without YOUTUBE_API_KEY and ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID)",
    async () => {
      const config = { apiKey: youtubeApiKey! };
      const video = await getYoutubeVideo(youtubeVideoId!, config);
      expect(video.access_status).toBe("api_visible_complete");

      const comments = await getYoutubeComments({
        video: youtubeVideoId!,
        pageSize: 100
      }, config, YOUTUBE_SMOKE_RUNTIME);

      expect(comments.access_status).toBe("api_visible_complete");
      expect(comments.pagination.exhausted).toBe(true);
      expect(comments.data).toHaveProperty("manifest");
      if (!("manifest" in comments.data)) {
        throw new Error("YouTube comment corpus did not include a manifest");
      }
      expect(comments.data.manifest.extraction_coverage).toBe("api_visible_complete");
      expect(comments.data.manifest.reply_count_mismatches).toEqual([]);
      expect(comments.data.manifest.replies_retrieved)
        .toBe(comments.data.manifest.expected_replies);
      expect(comments.pagination.returned)
        .toBe(comments.data.manifest.total_comments_and_replies);
    },
    LIVE_TIMEOUT_MS
  );
});
