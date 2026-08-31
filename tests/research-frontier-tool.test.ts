import { describe, expect, it, vi } from "vitest";

import {
  createActionOpenApiDocument,
  createResearchActionRoutes,
  RESEARCH_OPERATIONS,
} from "../apps/research-mcp/src/index.js";
import {
  getResearchFrontier,
  researchFrontierInputSchema,
  researchFrontierOutputSchema,
  type ResearchFrontierReader,
} from "../apps/research-mcp/src/research-frontier-tool.js";

const UUID = "11111111-1111-4111-8111-111111111111";
const QUESTION_UUID = "22222222-2222-4222-8222-222222222222";
const FRONTIER = {
  frontier_schema: "askrigor.living-evidence.research-frontier.v1",
  result_count: 1,
  frontiers: [{
    frontier_id: UUID,
    topic: {
      topic_id: "33333333-3333-4333-8333-333333333333",
      canonical_key: "hip.arthroplasty.rehabilitation",
      label: "Hip arthroplasty and rehabilitation",
    },
    question: {
      question_id: QUESTION_UUID,
      normalized_question: "How do arthroplasty and rehabilitation compare?",
      dimensions: {
        population: "Adults with chronic hip pain",
        program_or_exposure: "Arthroplasty",
        comparator: "Structured rehabilitation",
        outcome: "Function and harms",
        horizon: "At least one year",
        setting: null,
      },
    },
    lanes: [],
    passes: [],
    current_candidates: [],
    current_trails: [],
    contribution_receipts: [],
    frontier_state: "complete",
    next_capabilities: [],
    terminal_boundaries: [],
    history: {
      candidate_versions: [],
      trail_versions: [],
    },
    canonical_sha256: "a".repeat(64),
  }],
} as const;

describe("dedicated read-only research-frontier tool", () => {
  it("requires exactly one bounded exact selector", () => {
    expect(researchFrontierInputSchema.safeParse({}).success).toBe(false);
    expect(researchFrontierInputSchema.safeParse({
      frontier_id: UUID,
      question_id: QUESTION_UUID,
    }).success).toBe(false);
    expect(researchFrontierInputSchema.safeParse({ topic_key: "Upper Case" }).success)
      .toBe(false);
    expect(researchFrontierInputSchema.parse({
      topic_key: "hip.arthroplasty.rehabilitation",
    })).toEqual({
      topic_key: "hip.arthroplasty.rehabilitation",
      include_history: false,
    });
  });

  it("maps public selectors to the existing repository reader and preserves history", async () => {
    const get = vi.fn<ResearchFrontierReader["getResearchFrontier"]>()
      .mockResolvedValue(FRONTIER);

    const result = await getResearchFrontier({
      topic_key: "hip.arthroplasty.rehabilitation",
      include_history: true,
    }, {
      reader: { getResearchFrontier: get },
      now: () => new Date("2026-08-31T09:00:00.000Z"),
    });

    expect(get).toHaveBeenCalledExactlyOnceWith({
      topicKey: "hip.arthroplasty.rehabilitation",
      includeHistory: true,
    });
    expect(result).toMatchObject({
      provider: "askrigor_living_evidence",
      record_type: "research_frontier",
      retrieved_at: "2026-08-31T09:00:00.000Z",
      access_status: "complete",
      lookup_status: "retrieved",
      frontier_currency: "not_assessed",
      query: {
        selector: "topic_key",
        value: "hip.arthroplasty.rehabilitation",
        include_history: true,
      },
      data: FRONTIER,
    });
    expect(result.limitations.join(" ")).toContain("research-control state");
    expect(result.limitations.join(" ")).toContain("currentness");
    expect(researchFrontierOutputSchema.safeParse(result).success).toBe(true);
  });

  it("reports not indexed without claiming that external evidence is absent", async () => {
    const reader: ResearchFrontierReader = {
      async getResearchFrontier() {
        throw new Error("RESEARCH_FRONTIER_NOT_FOUND");
      },
    };

    const result = await getResearchFrontier({ frontier_id: UUID }, {
      reader,
      now: () => new Date("2026-08-31T09:01:00.000Z"),
    });

    expect(result).toMatchObject({
      access_status: "not_found",
      lookup_status: "not_indexed",
      frontier_currency: "not_assessed",
      data: {
        frontier_schema: "askrigor.living-evidence.research-frontier.v1",
        result_count: 0,
        frontiers: [],
      },
      error: {
        code: "research_frontier_not_indexed",
        retryable: false,
      },
    });
    expect(result.error?.message).toContain("does not mean that no external evidence exists");
  });

  it("keeps missing configuration and repository failures typed and secret-free", async () => {
    const unavailable = await getResearchFrontier({ question_id: QUESTION_UUID }, {
      now: () => new Date("2026-08-31T09:02:00.000Z"),
    });
    expect(unavailable).toMatchObject({
      access_status: "inaccessible",
      lookup_status: "repository_unavailable",
      error: {
        code: "living_evidence_repository_unavailable",
        retryable: false,
      },
    });

    const failed = await getResearchFrontier({ question_id: QUESTION_UUID }, {
      reader: {
        async getResearchFrontier() {
          throw new Error("password=must-never-cross-the-boundary");
        },
      },
      now: () => new Date("2026-08-31T09:03:00.000Z"),
    });
    expect(failed).toMatchObject({
      access_status: "error",
      lookup_status: "error",
      error: {
        code: "living_evidence_repository_error",
        retryable: true,
      },
    });
    expect(JSON.stringify(failed)).not.toContain("must-never-cross-the-boundary");
  });

  it("is operation 22 with read-only MCP and non-consequential Action/OpenAPI contracts", () => {
    const operation = RESEARCH_OPERATIONS.at(21);
    expect(RESEARCH_OPERATIONS).toHaveLength(23);
    expect(operation).toMatchObject({
      name: "get_research_frontier",
      actionPath: "/actions/research/get_research_frontier",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });

    const route = createResearchActionRoutes().find(({ operationId }) =>
      operationId === "get_research_frontier"
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
        "/actions/research/get_research_frontier": {
          post: { operationId: "get_research_frontier" },
        },
      },
    });
  });
});
