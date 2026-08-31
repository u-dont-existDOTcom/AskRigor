import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ResearchFrontierSearchInput } from "@askrigor/evidence-repository";
import { z } from "zod";

const uuidSchema = z.uuid();
const nullableTextSchema = z.string().nullable();
const catalogSchemaName = "askrigor.living-evidence.research-frontier-catalog.v1" as const;

export const researchFrontierSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(300).describe(
    "Free-text lexical query over stored topic keys, labels, aliases, research questions, and structured question dimensions.",
  ),
  limit: z.number().int().min(1).max(25).default(10).describe(
    "Maximum catalog matches to return; defaults to 10 and cannot exceed 25.",
  ),
}).strict();

const matchFieldSchema = z.enum([
  "catalog",
  "topic_key",
  "topic_label",
  "topic_alias",
  "question",
  "population",
  "program_or_exposure",
  "comparator",
  "outcome",
  "horizon",
  "setting",
]);

const catalogMatchSchema = z.object({
  frontier_id: uuidSchema,
  topic: z.object({
    topic_id: uuidSchema,
    canonical_key: z.string(),
    label: z.string(),
    aliases: z.array(z.string()),
  }).strict(),
  question: z.object({
    question_id: uuidSchema,
    normalized_question: z.string(),
    dimensions: z.object({
      population: nullableTextSchema,
      program_or_exposure: nullableTextSchema,
      comparator: nullableTextSchema,
      outcome: nullableTextSchema,
      horizon: nullableTextSchema,
      setting: nullableTextSchema,
    }).strict(),
  }).strict(),
  frontier_state: z.enum(["actionable", "blocked_terminal", "complete"]),
  coverage: z.object({
    lane_count: z.number().int().nonnegative(),
    pass_count: z.number().int().nonnegative(),
    partial_pass_count: z.number().int().nonnegative(),
    blocked_pass_count: z.number().int().nonnegative(),
    candidate_count: z.number().int().nonnegative(),
    selected_candidate_count: z.number().int().nonnegative(),
    open_trail_count: z.number().int().nonnegative(),
    coverage_gap_count: z.number().int().nonnegative(),
    latest_pass_at: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  match_fields: z.array(matchFieldSchema).min(1),
  text_rank: z.number().nonnegative(),
}).strict();

const catalogDataSchema = z.object({
  catalog_schema: z.literal(catalogSchemaName),
  result_count: z.number().int().nonnegative(),
  has_more: z.boolean(),
  matches: z.array(catalogMatchSchema),
}).strict().superRefine((value, context) => {
  if (value.result_count !== value.matches.length) {
    context.addIssue({
      code: "custom",
      path: ["result_count"],
      message: "result_count must equal the number of returned matches",
    });
  }
});

export const researchFrontierSearchOutputSchema = z.object({
  provider: z.literal("askrigor_living_evidence"),
  record_type: z.literal("research_frontier_catalog"),
  retrieved_at: z.string().datetime({ offset: true }),
  query: z.object({
    text: z.string(),
    limit: z.number().int().min(1).max(25),
  }).strict(),
  source_identity: z.object({}).strict(),
  pagination: z.object({
    returned: z.number().int().nonnegative(),
    has_more: z.boolean(),
  }).strict(),
  access_status: z.enum(["complete", "not_found", "inaccessible", "error"]),
  search_status: z.enum([
    "matched",
    "no_match",
    "repository_unavailable",
    "error",
  ]),
  frontier_currency: z.literal("not_assessed"),
  limitations: z.array(z.string()).min(3),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }).strict().optional(),
  data: catalogDataSchema,
}).strict();

export type ResearchFrontierSearchPublicInput = z.input<typeof researchFrontierSearchInputSchema>;
export type ResearchFrontierSearchOutput = z.output<typeof researchFrontierSearchOutputSchema>;

export interface ResearchFrontierCatalogReader {
  searchResearchFrontiers(input: ResearchFrontierSearchInput): Promise<Record<string, unknown>>;
}

export interface ResearchFrontierSearchDependencies {
  reader?: ResearchFrontierCatalogReader;
  now?: () => Date;
}

const LIMITATIONS = [
  "This is lexical catalog discovery over already stored topic and question metadata; wording differences can leave relevant stored frontiers unmatched.",
  "Stored frontier rows are research-control state, not evidence or a health conclusion; use the returned selector with get_research_frontier and inspect current underlying sources before synthesis.",
  "Repository retrieval does not assess currentness; partial, blocked, gapped, or stale coverage remains explicit and must not be generalized beyond the stored records.",
] as const;

export async function searchResearchFrontiers(
  input: unknown,
  dependencies: ResearchFrontierSearchDependencies = {},
): Promise<ResearchFrontierSearchOutput> {
  const parsed = researchFrontierSearchInputSchema.parse(input);
  const retrievedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  if (dependencies.reader === undefined) {
    return response({
      retrievedAt,
      query: parsed,
      accessStatus: "inaccessible",
      searchStatus: "repository_unavailable",
      error: {
        code: "living_evidence_repository_unavailable",
        message: "The read-only living-evidence repository is not configured for this runtime.",
        retryable: false,
      },
    });
  }

  try {
    const data = catalogDataSchema.parse(
      await dependencies.reader.searchResearchFrontiers(parsed),
    );
    if (data.result_count === 0) {
      return response({
        retrievedAt,
        query: parsed,
        accessStatus: "not_found",
        searchStatus: "no_match",
        data,
        error: {
          code: "research_frontier_catalog_no_match",
          message: "No stored frontier matched this lexical catalog query. This means no indexed match was found; it does not mean that no external evidence exists.",
          retryable: false,
        },
      });
    }
    return response({
      retrievedAt,
      query: parsed,
      accessStatus: "complete",
      searchStatus: "matched",
      data,
    });
  } catch (_error) {
    return response({
      retrievedAt,
      query: parsed,
      accessStatus: "error",
      searchStatus: "error",
      error: {
        code: "living_evidence_repository_error",
        message: "The read-only living-evidence repository catalog query failed.",
        retryable: true,
      },
    });
  }
}

export async function researchFrontierSearchToolResult(
  input: Record<string, unknown>,
  dependencies: ResearchFrontierSearchDependencies = {},
): Promise<CallToolResult> {
  const output = await searchResearchFrontiers(input, dependencies);
  const summary = output.search_status === "matched"
    ? `Found ${output.data.result_count} stored research frontier catalog match(es); currentness remains not assessed.`
    : output.error?.message ?? "Research-frontier catalog search did not complete.";
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: output,
    ...(["repository_unavailable", "error"].includes(output.search_status)
      ? { isError: true }
      : {}),
  };
}

function response(input: {
  retrievedAt: string;
  query: z.output<typeof researchFrontierSearchInputSchema>;
  accessStatus: "complete" | "not_found" | "inaccessible" | "error";
  searchStatus: "matched" | "no_match" | "repository_unavailable" | "error";
  data?: z.output<typeof catalogDataSchema>;
  error?: { code: string; message: string; retryable: boolean };
}): ResearchFrontierSearchOutput {
  const data = input.data ?? {
    catalog_schema: catalogSchemaName,
    result_count: 0,
    has_more: false,
    matches: [],
  };
  return researchFrontierSearchOutputSchema.parse({
    provider: "askrigor_living_evidence",
    record_type: "research_frontier_catalog",
    retrieved_at: input.retrievedAt,
    query: { text: input.query.query, limit: input.query.limit },
    source_identity: {},
    pagination: { returned: data.result_count, has_more: data.has_more },
    access_status: input.accessStatus,
    search_status: input.searchStatus,
    frontier_currency: "not_assessed",
    limitations: [...LIMITATIONS],
    ...(input.error === undefined ? {} : { error: input.error }),
    data,
  });
}
