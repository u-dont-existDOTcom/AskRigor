import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ResearchFrontierLookupInput } from "@askrigor/evidence-repository";
import { z } from "zod";

const uuidSchema = z.uuid();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const nullableTextSchema = z.string().nullable();
const frontierSchemaName = "askrigor.living-evidence.research-frontier.v1" as const;

const formalSourceClassSchema = z.enum([
  "study",
  "review",
  "guideline",
  "registry",
  "book",
  "grey_literature",
  "other",
]);
const frontierPassStatusSchema = z.enum([
  "complete",
  "partial",
  "blocked_retryable",
  "blocked_terminal",
]);
const frontierAccessStatusSchema = z.enum([
  "complete",
  "api_visible_complete",
  "partial",
  "abstract_only",
  "metadata_only",
  "inaccessible",
  "rate_limited",
  "not_found",
  "error",
]);
const frontierTrailStateSchema = z.enum([
  "open",
  "ready",
  "blocked_retryable",
  "blocked_terminal",
  "resolved",
  "cancelled",
]);
const frontierTrailKindSchema = z.enum([
  "unresolved_question",
  "unattempted_search",
  "blocked_source",
  "formal_followup",
  "discriminator_search",
  "coverage_gap",
  "delta_search",
]);
const frontierPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "decision_critical",
]);

export const researchFrontierInputSchema = z.object({
  frontier_id: uuidSchema.optional().describe("Exact stored research-frontier UUID."),
  question_id: uuidSchema.optional().describe("Exact stored structured-question UUID."),
  topic_key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u).optional().describe(
    "Exact canonical formal-research topic key.",
  ),
  include_history: z.boolean().default(false).describe(
    "Include append-only candidate and trail version history; defaults to false.",
  ),
}).strict().superRefine((value, context) => {
  const selectorCount = [value.frontier_id, value.question_id, value.topic_key]
    .filter((selector) => selector !== undefined).length;
  if (selectorCount !== 1) {
    context.addIssue({
      code: "custom",
      message: "Exactly one of frontier_id, question_id, or topic_key is required.",
    });
  }
});

const identifierSchema = z.object({
  scheme: z.string(),
  value: z.string(),
}).strict();
const frontierLaneSchema = z.object({
  lane_id: uuidSchema,
  canonical_key: z.string(),
  source_class: formalSourceClassSchema,
  provider: z.string(),
  label: z.string(),
  latest_confirmed_end_exclusive: isoDateSchema.nullable(),
  open_gap_count: z.number().int().nonnegative(),
  next_delta_start: isoDateSchema.nullable(),
}).strict();
const frontierPassSchema = z.object({
  pass_id: uuidSchema,
  contribution_id: uuidSchema,
  lane_id: uuidSchema,
  executed_at: z.string(),
  deidentified_query: z.string(),
  query_sha256: sha256Schema,
  query_bytes: z.string().regex(/^(0|[1-9][0-9]*)$/u),
  coverage_basis: z.enum(["publication_date", "index_date", "provider_unspecified"]),
  requested_start: isoDateSchema.nullable(),
  requested_end_exclusive: isoDateSchema.nullable(),
  confirmed_start: isoDateSchema.nullable(),
  confirmed_end_exclusive: isoDateSchema.nullable(),
  coverage_relation: z.enum([
    "initial",
    "full_refresh",
    "contiguous_delta",
    "overlap_delta",
    "gap_delta",
    "unscoped",
  ]),
  delta_from_pass_id: uuidSchema.nullable(),
  status: frontierPassStatusSchema,
  access_status: frontierAccessStatusSchema,
  exhausted: z.boolean(),
  retrieved_candidate_count: z.number().int().nonnegative(),
  screened_candidate_count: z.number().int().nonnegative(),
  selected_candidate_count: z.number().int().nonnegative(),
  next_capability: nullableTextSchema,
  blocked_reason_code: nullableTextSchema,
  receipt_sha256: sha256Schema,
  limitations: z.array(z.string()),
}).strict();
const currentCandidateSchema = z.object({
  candidate_id: uuidSchema,
  frontier_id: uuidSchema,
  candidate_kind: formalSourceClassSchema,
  identity_hash: sha256Schema,
  version_id: uuidSchema,
  observed_in_pass_id: uuidSchema,
  display_title: z.string(),
  publication_date: isoDateSchema.nullable(),
  decision: z.enum(["selected", "excluded", "deferred", "unresolved"]),
  decision_reason: z.string(),
  relevance_summary: z.string(),
  source_family_id: uuidSchema.nullable(),
  identifiers: z.array(identifierSchema),
}).strict();
const currentTrailSchema = z.object({
  trail_id: uuidSchema,
  frontier_id: uuidSchema,
  trail_kind: frontierTrailKindSchema,
  version_id: uuidSchema,
  lane_id: uuidSchema.nullable(),
  target_start: isoDateSchema.nullable(),
  target_end_exclusive: isoDateSchema.nullable(),
  description: z.string(),
  rationale: z.string(),
  priority: frontierPrioritySchema,
  state: frontierTrailStateSchema,
  next_capability: nullableTextSchema,
  blocked_reason_code: nullableTextSchema,
  resolution_note: nullableTextSchema,
}).strict();
const contributionReceiptSchema = z.object({
  contribution_id: uuidSchema,
  run_id: uuidSchema,
  payload_sha256: sha256Schema,
  idempotency_key: z.string(),
}).strict();
const candidateVersionSchema = currentCandidateSchema.omit({
  frontier_id: true,
  version_id: true,
}).extend({
  version_id: uuidSchema,
  contribution_id: uuidSchema,
  previous_version_id: uuidSchema.nullable(),
}).strict();
const trailVersionSchema = currentTrailSchema.omit({
  frontier_id: true,
  version_id: true,
}).extend({
  version_id: uuidSchema,
  contribution_id: uuidSchema,
  previous_version_id: uuidSchema.nullable(),
}).strict();
const frontierSnapshotSchema = z.object({
  frontier_id: uuidSchema,
  topic: z.object({
    topic_id: uuidSchema,
    canonical_key: z.string(),
    label: z.string(),
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
  lanes: z.array(frontierLaneSchema),
  passes: z.array(frontierPassSchema),
  current_candidates: z.array(currentCandidateSchema),
  current_trails: z.array(currentTrailSchema),
  contribution_receipts: z.array(contributionReceiptSchema),
  frontier_state: z.enum(["actionable", "blocked_terminal", "complete"]),
  next_capabilities: z.array(z.object({
    trail_id: uuidSchema,
    next_capability: z.string(),
    state: z.enum(["open", "ready", "blocked_retryable"]),
    priority: frontierPrioritySchema,
  }).strict()),
  terminal_boundaries: z.array(z.object({
    trail_id: uuidSchema,
    blocked_reason_code: z.string(),
    description: z.string(),
  }).strict()),
  history: z.object({
    candidate_versions: z.array(candidateVersionSchema),
    trail_versions: z.array(trailVersionSchema),
  }).strict().optional(),
  canonical_sha256: sha256Schema,
}).strict();
const researchFrontierDataSchema = z.object({
  frontier_schema: z.literal(frontierSchemaName),
  result_count: z.number().int().nonnegative(),
  frontiers: z.array(frontierSnapshotSchema),
}).strict().superRefine((value, context) => {
  if (value.result_count !== value.frontiers.length) {
    context.addIssue({
      code: "custom",
      path: ["result_count"],
      message: "result_count must equal the number of returned frontiers",
    });
  }
});

export const researchFrontierOutputSchema = z.object({
  provider: z.literal("askrigor_living_evidence"),
  record_type: z.literal("research_frontier"),
  retrieved_at: z.string().datetime({ offset: true }),
  query: z.object({
    selector: z.enum(["frontier_id", "question_id", "topic_key"]),
    value: z.string(),
    include_history: z.boolean(),
  }).strict(),
  source_identity: z.object({}).strict(),
  pagination: z.object({
    returned: z.number().int().nonnegative(),
    exhausted: z.literal(true),
  }).strict(),
  access_status: z.enum(["complete", "not_found", "inaccessible", "error"]),
  lookup_status: z.enum([
    "retrieved",
    "not_indexed",
    "repository_unavailable",
    "error",
  ]),
  frontier_currency: z.literal("not_assessed"),
  limitations: z.array(z.string()).min(2),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }).strict().optional(),
  data: researchFrontierDataSchema,
}).strict();

export type ResearchFrontierInput = z.input<typeof researchFrontierInputSchema>;
export type ResearchFrontierOutput = z.output<typeof researchFrontierOutputSchema>;

export interface ResearchFrontierReader {
  getResearchFrontier(input: ResearchFrontierLookupInput): Promise<Record<string, unknown>>;
}

export interface ResearchFrontierDependencies {
  reader?: ResearchFrontierReader;
  now?: () => Date;
}

const LIMITATIONS = [
  "Stored frontier rows are research-control state, not evidence or a health conclusion; inspect and validate the underlying current sources before synthesis.",
  "Repository retrieval does not assess currentness; compare confirmed coverage windows, open gaps, unresolved trails, and protocol/source changes before relying on prior work.",
] as const;

export async function getResearchFrontier(
  input: ResearchFrontierInput,
  dependencies: ResearchFrontierDependencies = {},
): Promise<ResearchFrontierOutput> {
  const parsed = researchFrontierInputSchema.parse(input);
  const query = publicQuery(parsed);
  const retrievedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  if (dependencies.reader === undefined) {
    return response({
      retrievedAt,
      query,
      accessStatus: "inaccessible",
      lookupStatus: "repository_unavailable",
      error: {
        code: "living_evidence_repository_unavailable",
        message: "The read-only living-evidence repository is not configured for this runtime.",
        retryable: false,
      },
    });
  }

  try {
    const data = researchFrontierDataSchema.parse(
      await dependencies.reader.getResearchFrontier(repositoryQuery(parsed)),
    );
    return response({
      retrievedAt,
      query,
      accessStatus: "complete",
      lookupStatus: "retrieved",
      data,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RESEARCH_FRONTIER_NOT_FOUND") {
      return response({
        retrievedAt,
        query,
        accessStatus: "not_found",
        lookupStatus: "not_indexed",
        error: {
          code: "research_frontier_not_indexed",
          message: "No stored frontier matched this exact selector. This means not indexed; it does not mean that no external evidence exists.",
          retryable: false,
        },
      });
    }
    return response({
      retrievedAt,
      query,
      accessStatus: "error",
      lookupStatus: "error",
      error: {
        code: "living_evidence_repository_error",
        message: "The read-only living-evidence repository query failed.",
        retryable: true,
      },
    });
  }
}

export async function researchFrontierToolResult(
  input: Record<string, unknown>,
  dependencies: ResearchFrontierDependencies = {},
): Promise<CallToolResult> {
  const output = await getResearchFrontier(input, dependencies);
  const summary = output.lookup_status === "retrieved"
    ? `Retrieved ${output.data.result_count} stored research frontier(s); currentness remains not assessed.`
    : output.error?.message ?? "Research-frontier lookup did not complete.";
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: output,
    ...(["repository_unavailable", "error"].includes(output.lookup_status)
      ? { isError: true }
      : {}),
  };
}

function repositoryQuery(
  input: z.output<typeof researchFrontierInputSchema>,
): ResearchFrontierLookupInput {
  return {
    ...(input.frontier_id === undefined ? {} : { frontierId: input.frontier_id }),
    ...(input.question_id === undefined ? {} : { questionId: input.question_id }),
    ...(input.topic_key === undefined ? {} : { topicKey: input.topic_key }),
    includeHistory: input.include_history,
  };
}

function publicQuery(input: z.output<typeof researchFrontierInputSchema>) {
  if (input.frontier_id !== undefined) {
    return { selector: "frontier_id" as const, value: input.frontier_id, include_history: input.include_history };
  }
  if (input.question_id !== undefined) {
    return { selector: "question_id" as const, value: input.question_id, include_history: input.include_history };
  }
  return { selector: "topic_key" as const, value: input.topic_key!, include_history: input.include_history };
}

function response(input: {
  retrievedAt: string;
  query: ReturnType<typeof publicQuery>;
  accessStatus: "complete" | "not_found" | "inaccessible" | "error";
  lookupStatus: "retrieved" | "not_indexed" | "repository_unavailable" | "error";
  data?: z.output<typeof researchFrontierDataSchema>;
  error?: { code: string; message: string; retryable: boolean };
}): ResearchFrontierOutput {
  const data = input.data ?? {
    frontier_schema: frontierSchemaName,
    result_count: 0,
    frontiers: [],
  };
  return researchFrontierOutputSchema.parse({
    provider: "askrigor_living_evidence",
    record_type: "research_frontier",
    retrieved_at: input.retrievedAt,
    query: input.query,
    source_identity: {},
    pagination: { returned: data.result_count, exhausted: true },
    access_status: input.accessStatus,
    lookup_status: input.lookupStatus,
    frontier_currency: "not_assessed",
    limitations: [...LIMITATIONS],
    ...(input.error === undefined ? {} : { error: input.error }),
    data,
  });
}
