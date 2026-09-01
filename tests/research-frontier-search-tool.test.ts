import { describe, expect, it, vi } from "vitest";

import {
  createActionOpenApiDocument,
  createResearchActionRoutes,
  RESEARCH_OPERATIONS,
} from "../apps/research-mcp/src/index.js";
import {
  searchResearchFrontiers,
  researchFrontierSearchInputSchema,
  researchFrontierSearchOutputSchema,
  type ResearchFrontierCatalogReader,
} from "../apps/research-mcp/src/research-frontier-search-tool.js";

const SEARCH_RESULT = {
  catalog_schema: "askrigor.living-evidence.research-frontier-catalog.v1",
  result_count: 1,
  has_more: false,
  matches: [{
    frontier_id: "11111111-1111-4111-8111-111111111111",
    topic: {
      topic_id: "22222222-2222-4222-8222-222222222222",
      canonical_key: "pituitary.prolactinoma.remission",
      label: "Prolactinoma remission",
      aliases: ["prolactinoma spontaneous remission"],
    },
    question: {
      question_id: "33333333-3333-4333-8333-333333333333",
      normalized_question: "What precedes spontaneous prolactinoma remission?",
      dimensions: {
        population: "People with medically documented prolactinomas",
        program_or_exposure: "Biological, environmental, treatment, or life transitions",
        comparator: "Similar people whose prolactinomas do not remit",
        outcome: "Treatment-free biochemical remission or tumor regression",
        horizon: null,
        setting: null,
      },
    },
    frontier_state: "actionable",
    coverage: {
      lane_count: 2,
      pass_count: 3,
      partial_pass_count: 1,
      blocked_pass_count: 0,
      candidate_count: 8,
      selected_candidate_count: 3,
      open_trail_count: 2,
      coverage_gap_count: 1,
      latest_pass_at: "2026-08-30T12:00:00.000Z",
    },
    match_fields: ["topic_label", "topic_alias", "question"],
    text_rank: 0.75,
  }],
} as const;

describe("read-only research-frontier catalog search", () => {
  it("requires a bounded free-text query and defaults to ten matches", () => {
    expect(researchFrontierSearchInputSchema.safeParse({}).success).toBe(false);
    expect(researchFrontierSearchInputSchema.safeParse({ query: " " }).success).toBe(false);
    expect(researchFrontierSearchInputSchema.safeParse({ query: "a" }).success).toBe(false);
    expect(researchFrontierSearchInputSchema.safeParse({
      query: "prolactinoma",
      limit: 26,
    }).success).toBe(false);
    expect(researchFrontierSearchInputSchema.parse({
      query: "  prolactinoma remission  ",
    })).toEqual({
      query: "prolactinoma remission",
      limit: 10,
    });
  });

  it("maps the query to the read-only catalog and preserves partial coverage", async () => {
    const search = vi.fn<ResearchFrontierCatalogReader["searchResearchFrontiers"]>()
      .mockResolvedValue(SEARCH_RESULT);

    const result = await searchResearchFrontiers({
      query: "prolactinoma remission",
      limit: 5,
    }, {
      reader: { searchResearchFrontiers: search },
      now: () => new Date("2026-08-31T23:10:00.000Z"),
    });

    expect(search).toHaveBeenCalledExactlyOnceWith({
      query: "prolactinoma remission",
      limit: 5,
    });
    expect(result).toMatchObject({
      provider: "askrigor_living_evidence",
      record_type: "research_frontier_catalog",
      retrieved_at: "2026-08-31T23:10:00.000Z",
      access_status: "complete",
      search_status: "matched",
      frontier_currency: "not_assessed",
      query: {
        text: "prolactinoma remission",
        limit: 5,
      },
      pagination: {
        returned: 1,
        has_more: false,
      },
      data: SEARCH_RESULT,
    });
    expect(result.data.matches[0]?.coverage.partial_pass_count).toBe(1);
    expect(result.limitations.join(" ")).toContain("lexical catalog discovery");
    expect(result.limitations.join(" ")).toContain("not evidence");
    expect(researchFrontierSearchOutputSchema.safeParse(result).success).toBe(true);
  });

  it("reports no indexed match without implying that no external evidence exists", async () => {
    const result = await searchResearchFrontiers({ query: "unindexed condition" }, {
      reader: {
        async searchResearchFrontiers() {
          return {
            catalog_schema: "askrigor.living-evidence.research-frontier-catalog.v1",
            result_count: 0,
            has_more: false,
            matches: [],
          };
        },
      },
      now: () => new Date("2026-08-31T23:11:00.000Z"),
    });

    expect(result).toMatchObject({
      access_status: "not_found",
      search_status: "no_match",
      data: {
        result_count: 0,
        matches: [],
      },
      error: {
        code: "research_frontier_catalog_no_match",
        retryable: false,
      },
    });
    expect(result.error?.message).toContain("does not mean that no external evidence exists");
  });

  it("keeps missing configuration and repository errors typed and secret-free", async () => {
    const unavailable = await searchResearchFrontiers({ query: "prolactinoma" }, {
      now: () => new Date("2026-08-31T23:12:00.000Z"),
    });
    expect(unavailable).toMatchObject({
      access_status: "inaccessible",
      search_status: "repository_unavailable",
      error: {
        code: "living_evidence_repository_unavailable",
        retryable: false,
      },
    });

    const failed = await searchResearchFrontiers({ query: "prolactinoma" }, {
      reader: {
        async searchResearchFrontiers() {
          throw new Error("password=must-never-cross-the-boundary");
        },
      },
      now: () => new Date("2026-08-31T23:13:00.000Z"),
    });
    expect(failed).toMatchObject({
      access_status: "error",
      search_status: "error",
      error: {
        code: "living_evidence_repository_error",
        retryable: true,
      },
    });
    expect(JSON.stringify(failed)).not.toContain("must-never-cross-the-boundary");
  });

  it("remains operation 23 while access operations append after both frontier reads", () => {
    expect(RESEARCH_OPERATIONS).toHaveLength(26);
    expect(RESEARCH_OPERATIONS.at(21)?.name).toBe("get_research_frontier");
    expect(RESEARCH_OPERATIONS.at(22)).toMatchObject({
      name: "search_research_frontiers",
      actionPath: "/actions/research/search_research_frontiers",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });

    const route = createResearchActionRoutes().find(({ operationId }) =>
      operationId === "search_research_frontiers"
    );
    expect(route).toMatchObject({
      method: "POST",
      public: true,
      publicResearch: true,
      consequential: false,
    });
    const openapi = createActionOpenApiDocument(route === undefined ? [] : [route]);
    expect(openapi).toMatchObject({
      paths: {
        "/actions/research/search_research_frontiers": {
          post: { operationId: "search_research_frontiers" },
        },
      },
    });
  });
});
