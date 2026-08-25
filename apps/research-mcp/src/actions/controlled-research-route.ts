import { getProtocolManifest } from "@askrigor/protocol";
import { z } from "zod";

import {
  PRIVATE_ORCHESTRATION_REQUEST_MAX_BYTES,
  RESEARCH_ACTION_RESPONSE_MAX_BYTES
} from "../config.js";
import {
  controlledWorkerWorkDigest,
  ControlledWorkerPayloadError,
  createControlledWorkerPayloadPage,
  verifyControlledWorkerPayloadReceipt,
  type ControlledWorkerPayloadPage
} from "../controlled-worker-payload.js";
import {
  advanceResearchSessionDeterministically,
  applyResearchSemanticResult,
  deriveResearchSemanticWorkForState,
  ResearchAdvanceDependencyUnavailableError,
  ResearchAdvanceNoProgressError,
  type ResearchDeterministicAdvanceDependencies,
  type ResearchSemanticAdvanceDependencies
} from "../research-session-advance.js";
import {
  researchSemanticModelOutputSchema,
  researchSemanticResponseContract,
  type ResearchSemanticWork
} from "../research-semantic-worker.js";
import {
  CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
  CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET,
  customGptAcceptanceReceiptSchema,
  issueCustomGptAcceptanceReceipt,
  type CustomGptAcceptanceTransition
} from "../custom-gpt-acceptance-receipt.js";
import { isDeidentifiedResearchTarget } from "./gemini-scout-route.js";
import {
  applyProtocolRecheck,
  createInitialResearchSessionState,
  evaluateResearchFinalization,
  finalizationDecisionSchema,
  projectResearchSessionView,
  protocolBindingsFromManifests,
  researchSessionStateDigest,
  type ResearchSessionState
} from "./research-session-controller.js";
import {
  createResearchSessionStore,
  ResearchSessionUnavailableError,
  type ResearchSessionStore
} from "./research-session-store.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";

const sessionIdSchema = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const startInputSchema = z.object({
  research_target: z.string().trim().min(1).max(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  acceptance_challenge_id: z.literal(CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID).optional()
}).strict();
const statusInputSchema = z.object({ session_id: sessionIdSchema }).strict();
const stateBoundInputSchema = statusInputSchema.extend({
  state_digest: digestSchema
}).strict();
const continueInputSchema = stateBoundInputSchema.extend({
  worker_payload_cursor: z.string().min(1).max(4_096).optional(),
  worker_payload_receipt: z.unknown().optional(),
  semantic_result: z.unknown().optional()
}).strict().superRefine((input, context) => {
  const paging = input.worker_payload_cursor !== undefined;
  const submitting = input.semantic_result !== undefined ||
    input.worker_payload_receipt !== undefined;
  if (paging && submitting) {
    context.addIssue({ code: "custom", message: "Paging and submission cannot be combined" });
  }
  if (
    (input.semantic_result === undefined) !==
    (input.worker_payload_receipt === undefined)
  ) {
    context.addIssue({ code: "custom", message: "Semantic result requires its terminal receipt" });
  }
});

const workerPayloadReceiptSchema = z.object({
  receipt_version: z.literal("askrigor_controlled_worker_payload_receipt_v1"),
  session_id: sessionIdSchema,
  state_digest: digestSchema,
  work_digest: digestSchema,
  payload_digest: digestSchema,
  chunk_count: z.number().int().positive(),
  expires_at_ms: z.number().int().nonnegative(),
  signature: z.string().min(1).max(512)
}).strict();

const workerPageSchema = z.object({
  chunk_index: z.number().int().nonnegative(),
  chunk_count: z.number().int().positive(),
  chunk_sha256: digestSchema,
  worker_input_json_chunk: z.string(),
  next_cursor: z.string().min(1).max(4_096).optional(),
  complete: z.boolean(),
  terminal_receipt: workerPayloadReceiptSchema.optional()
}).strict();

const controlledViewSchema = z.object({
  session_id: sessionIdSchema,
  state_digest: digestSchema,
  directive: z.enum([
    "continue_research",
    "perform_semantic_work",
    "finalize",
    "restart_required",
    "blocked"
  ]),
  execution_status: z.enum([
    "IN_PROGRESS",
    "BLOCKED_RETRYABLE",
    "BOUNDED",
    "READY_TO_FINALIZE",
    "PROTOCOL_DRIFT"
  ]),
  output_boundary: z.enum([
    "CONTINUE_RESEARCH",
    "BOUNDED_NONRANKING_ONLY",
    "FINALIZATION_ALLOWED"
  ]),
  next_capability: z.string().min(1).max(100).nullable(),
  semantic_work_type: z.string().min(1).max(100).optional(),
  worker_payload: workerPageSchema.optional(),
  last_transition: z.object({
    capability: z.string().min(1).max(100),
    result: z.enum([
      "complete",
      "semantic_work_recorded",
      "protocol_drift",
      "blocked_retryable"
    ])
  }).strict().optional(),
  technical_summary: z.object({
    candidates_discovered: z.number().int().nonnegative(),
    videos_selected: z.number().int().nonnegative(),
    videos_complete: z.number().int().nonnegative(),
    formal_sources_discovered: z.number().int().nonnegative()
  }).strict()
}).strict();

const errorSchema = z.object({
  error: z.object({
    code: z.enum([
      "action_input_invalid",
      "research_session_invalid_or_expired",
      "research_session_state_stale",
      "research_semantic_work_mismatch",
      "research_worker_payload_invalid",
      "research_dependency_unavailable"
    ]),
    retryable: z.boolean()
  }).strict()
}).strict();

const controlledFinalizationOutputSchema = z.object({
  finalization: finalizationDecisionSchema,
  product_acceptance_receipt: customGptAcceptanceReceiptSchema.optional()
}).strict();

// Keep the installed Action document small and editor-friendly. Runtime output is
// still parsed by the complete Zod schemas above; these schemas are only the
// public transport description projected into the Custom GPT editor.
const controlledViewActionSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "session_id",
    "state_digest",
    "directive",
    "execution_status",
    "output_boundary",
    "next_capability",
    "technical_summary"
  ],
  properties: {
    session_id: { type: "string" },
    state_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    directive: {
      type: "string",
      enum: [
        "continue_research",
        "perform_semantic_work",
        "finalize",
        "restart_required",
        "blocked"
      ]
    },
    execution_status: {
      type: "string",
      enum: [
        "IN_PROGRESS",
        "BLOCKED_RETRYABLE",
        "BOUNDED",
        "READY_TO_FINALIZE",
        "PROTOCOL_DRIFT"
      ]
    },
    output_boundary: {
      type: "string",
      enum: [
        "CONTINUE_RESEARCH",
        "BOUNDED_NONRANKING_ONLY",
        "FINALIZATION_ALLOWED"
      ]
    },
    next_capability: {
      anyOf: [{ type: "string" }, { type: "null" }]
    },
    semantic_work_type: { type: "string" },
    worker_payload: {
      type: "object",
      description: "One signed page of the exact bounded semantic work package.",
      additionalProperties: false,
      required: [
        "chunk_index",
        "chunk_count",
        "chunk_sha256",
        "worker_input_json_chunk",
        "complete"
      ],
      properties: {
        chunk_index: { type: "integer", minimum: 0 },
        chunk_count: { type: "integer", minimum: 1 },
        chunk_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        worker_input_json_chunk: { type: "string" },
        next_cursor: { type: "string" },
        complete: { type: "boolean" },
        terminal_receipt: {
          type: "object",
          additionalProperties: false,
          required: [
            "receipt_version",
            "session_id",
            "state_digest",
            "work_digest",
            "payload_digest",
            "chunk_count",
            "expires_at_ms",
            "signature"
          ],
          properties: {
            receipt_version: { type: "string" },
            session_id: { type: "string" },
            state_digest: { type: "string" },
            work_digest: { type: "string" },
            payload_digest: { type: "string" },
            chunk_count: { type: "integer", minimum: 1 },
            expires_at_ms: { type: "integer", minimum: 0 },
            signature: { type: "string" }
          }
        }
      }
    },
    last_transition: {
      type: "object",
      additionalProperties: false,
      required: ["capability", "result"],
      properties: {
        capability: { type: "string" },
        result: {
          type: "string",
          enum: [
            "complete",
            "semantic_work_recorded",
            "protocol_drift",
            "blocked_retryable"
          ]
        }
      }
    },
    technical_summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "candidates_discovered",
        "videos_selected",
        "videos_complete",
        "formal_sources_discovered"
      ],
      properties: {
        candidates_discovered: { type: "integer", minimum: 0 },
        videos_selected: { type: "integer", minimum: 0 },
        videos_complete: { type: "integer", minimum: 0 },
        formal_sources_discovered: { type: "integer", minimum: 0 }
      }
    }
  }
};

const controlledFinalizationActionSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["finalization"],
  properties: {
    finalization: {
      type: "object",
      description: "Server-authoritative finalization decision and reader-facing output.",
      additionalProperties: true,
      required: [
        "session_id",
        "authorization",
        "output_boundary",
        "required_next_capabilities",
        "state_digest"
      ],
      properties: {
        session_id: { type: "string" },
        authorization: {
          type: "string",
          enum: ["DENIED", "AUTHORIZED", "BOUNDED"]
        },
        output_boundary: {
          type: "string",
          enum: [
            "CONTINUE_RESEARCH",
            "BOUNDED_NONRANKING_ONLY",
            "FINALIZATION_ALLOWED"
          ]
        },
        denial_reasons: {
          type: "array",
          items: { type: "string" }
        },
        required_next_capabilities: {
          type: "array",
          items: { type: "string" }
        },
        state_digest: { type: "string" },
        reader_facing: {
          type: "object",
          additionalProperties: true,
          properties: {
            permitted_scope: { type: "string" },
            limitations: {
              type: "array",
              items: { type: "object", additionalProperties: true }
            },
            report: {
              type: "object",
              additionalProperties: true,
              properties: {
                report_scope: { type: "string" },
                title: { type: "string" },
                public_boundary: { type: "string" },
                bottom_line: {
                  type: "array",
                  items: { type: "string" }
                },
                comparative_conclusion: {
                  anyOf: [{ type: "string" }, { type: "null" }]
                },
                claims: { type: "array", items: { type: "object", additionalProperties: true } },
                approaches: { type: "array", items: { type: "object", additionalProperties: true } },
                alternatives: { type: "array", items: { type: "string" } },
                harms_and_counter_signals: { type: "array", items: { type: "string" } },
                uncertainty: { type: "array", items: { type: "string" } },
                videos_actually_audited: { type: "array", items: { type: "object", additionalProperties: true } },
                videos_worth_watching: { type: "array", items: { type: "object", additionalProperties: true } },
                provider_and_access_limitations: { type: "array", items: { type: "object", additionalProperties: true } },
                clinician_review_questions: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    },
    product_acceptance_receipt: {
      type: "object",
      description: "Signed server receipt emitted only for the fixed product acceptance challenge.",
      additionalProperties: true,
      properties: {
        receipt_version: { type: "string" },
        challenge_id: { type: "string" },
        session_id: { type: "string" },
        installation_bundle: {
          type: "object",
          additionalProperties: true,
          properties: {
            instructions_sha256: { type: "string" },
            action_schema_sha256: { type: "string" },
            bundle_sha256: { type: "string" }
          }
        },
        transition_trace: {
          type: "array",
          items: { type: "object", additionalProperties: true }
        },
        final_boundary: { type: "string" },
        permit_payload_sha256: { type: "string" },
        report_digest: { type: "string" },
        issued_at: { type: "string", format: "date-time" },
        expires_at: { type: "string", format: "date-time" },
        key_id: { type: "string" },
        receipt_payload_sha256: { type: "string" },
        signature: { type: "string" }
      }
    }
  }
};

const controlledContinueInputActionSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["session_id", "state_digest"],
  properties: {
    session_id: { type: "string", pattern: "^ars1_[A-Za-z0-9_-]{32}$" },
    state_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    worker_payload_cursor: { type: "string", maxLength: 4_096 },
    worker_payload_receipt: {
      type: "object",
      additionalProperties: false,
      required: [
        "receipt_version",
        "session_id",
        "state_digest",
        "work_digest",
        "payload_digest",
        "chunk_count",
        "expires_at_ms",
        "signature"
      ],
      properties: {
        receipt_version: { type: "string" },
        session_id: { type: "string" },
        state_digest: { type: "string" },
        work_digest: { type: "string" },
        payload_digest: { type: "string" },
        chunk_count: { type: "integer", minimum: 1 },
        expires_at_ms: { type: "integer", minimum: 0 },
        signature: { type: "string" }
      }
    },
    semantic_result: {
      type: "object",
      description: "Exact JSON object matching the response_contract inside the current signed work package.",
      additionalProperties: true,
      required: ["contract_version", "session_id", "state_digest", "work_type", "submission"],
      properties: {
        contract_version: { type: "string" },
        session_id: { type: "string" },
        state_digest: { type: "string" },
        work_type: { type: "string" },
        submission: {
          type: "object",
          additionalProperties: true,
          properties: {
            package_version: { type: "string" }
          }
        }
      }
    }
  }
};

export interface CreateControlledResearchRoutesOptions {
  store?: ResearchSessionStore;
  getProtocolManifest?: typeof getProtocolManifest;
  deterministicAdvanceDependencies: ResearchDeterministicAdvanceDependencies;
  semanticAdvanceDependencies: ResearchSemanticAdvanceDependencies;
  continuationSigningSecret: string;
  finalizationSigningSecret: string;
  finalizationKeyId: string;
  now?: () => number;
  finalizationNow?: () => Date;
}

/** Authenticated four-operation projection over the server-owned controller. */
export function createControlledResearchRoutes(
  options: CreateControlledResearchRoutesOptions
): readonly ActionRoute[] {
  const store = options.store ?? createResearchSessionStore();
  const manifests = options.getProtocolManifest ?? getProtocolManifest;
  const challengeSessions = new Set<string>();
  const transitionTraces = new Map<string, CustomGptAcceptanceTransition[]>();

  return Object.freeze([
    route("start_research_session", startInputSchema, controlledViewSchema,
      "Start a server-controlled research session. The response never authorizes a final answer.",
      start, controlledViewActionSchema),
    route("continue_research_session", continueInputSchema, controlledViewSchema,
      "Execute one server-required step, retrieve the exact bounded semantic package, or submit its receipt-bound result.",
      advance, controlledViewActionSchema, controlledContinueInputActionSchema),
    route("get_research_session_status", statusInputSchema, controlledViewSchema,
      "Read compact technical recovery state. Status cannot authorize synthesis.",
      status, controlledViewActionSchema),
    route("finalize_research_report", stateBoundInputSchema, controlledFinalizationOutputSchema,
      "Return a reader-facing report only when the server-owned controller authorizes the exact output boundary.",
      finalize, controlledFinalizationActionSchema)
  ]);

  async function start(input: z.output<typeof startInputSchema>) {
    const researchTarget = input.acceptance_challenge_id === undefined
      ? input.research_target
      : CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET;
    if (!isDeidentifiedResearchTarget(researchTarget)) {
      throw new ControlledInputError();
    }
    const state = createInitialResearchSessionState(
      {
        research_target: researchTarget,
        diagnosis_status: input.acceptance_challenge_id === undefined
          ? input.diagnosis_status
          : "diagnosis_not_specified"
      },
      await currentProtocolBindings(manifests)
    );
    const sessionId = store.issue(state);
    if (input.acceptance_challenge_id !== undefined) {
      challengeSessions.add(sessionId);
      transitionTraces.set(sessionId, []);
    }
    return project(sessionId, state);
  }

  async function status(input: z.output<typeof statusInputSchema>) {
    return project(input.session_id, store.read(input.session_id));
  }

  async function advance(input: z.output<typeof continueInputSchema>) {
    const current = store.read(input.session_id);
    if (researchSessionStateDigest(current) !== input.state_digest) {
      throw new ControlledStateStaleError();
    }
    const checked = applyProtocolRecheck(
      current,
      await currentProtocolBindings(manifests)
    );
    if (checked.protocol_binding.currency === "DRIFTED") {
      commit(input.session_id, current, checked, {
        capability: "protocol_currency_recheck",
        result: "protocol_drift"
      });
      return project(input.session_id, checked, undefined, {
        capability: "protocol_currency_recheck",
        result: "protocol_drift"
      });
    }

    const work = deriveResearchSemanticWorkForState(input.session_id, checked);
    if (input.worker_payload_cursor !== undefined) {
      if (work === null) throw new ControlledWorkMismatchError();
      return projectWithWork(input.session_id, checked, work, input.worker_payload_cursor);
    }
    if (input.semantic_result !== undefined) {
      if (work === null) throw new ControlledWorkMismatchError();
      const workerInput = await createWorkerInput(input.session_id, checked, work);
      verifyControlledWorkerPayloadReceipt({
        receipt: input.worker_payload_receipt,
        identity: workIdentity(input.session_id, checked, work),
        workerInput,
        signingSecret: options.continuationSigningSecret,
        ...(options.now === undefined ? {} : { now: options.now })
      });
      const semanticResult = researchSemanticModelOutputSchema.safeParse(
        input.semantic_result
      );
      if (!semanticResult.success) throw new ControlledWorkMismatchError();
      let next: ResearchSessionState;
      try {
        next = await applyResearchSemanticResult(
          input.session_id,
          checked,
          semanticResult.data,
          options.semanticAdvanceDependencies
        );
      } catch {
        throw new ControlledWorkMismatchError();
      }
      commit(input.session_id, current, next, {
        capability: semanticResult.data.work_type,
        result: "semantic_work_recorded"
      });
      return project(input.session_id, next, undefined, {
        capability: semanticResult.data.work_type,
        result: "semantic_work_recorded"
      });
    }
    if (work !== null) {
      return projectWithWork(input.session_id, checked, work);
    }

    const currentView = projectResearchSessionView(input.session_id, checked);
    if (
      currentView.output_boundary !== "CONTINUE_RESEARCH" ||
      currentView.required_next_capabilities.length === 0
    ) return project(input.session_id, checked);

    try {
      const result = await advanceResearchSessionDeterministically(
        input.session_id,
        checked,
        options.deterministicAdvanceDependencies
      );
      commit(input.session_id, current, result.state, {
        capability: result.capability,
        result: "complete"
      });
      return project(input.session_id, result.state, undefined, {
        capability: result.capability,
        result: "complete"
      });
    } catch (error) {
      if (
        error instanceof ResearchAdvanceDependencyUnavailableError ||
        error instanceof ResearchAdvanceNoProgressError
      ) throw new ControlledDependencyUnavailableError();
      throw error;
    }
  }

  async function finalize(input: z.output<typeof stateBoundInputSchema>) {
    const current = store.read(input.session_id);
    if (researchSessionStateDigest(current) !== input.state_digest) {
      throw new ControlledStateStaleError();
    }
    const checked = applyProtocolRecheck(
      current,
      await currentProtocolBindings(manifests)
    );
    const decision = evaluateResearchFinalization(input.session_id, checked, {
      signingSecret: options.finalizationSigningSecret,
      keyId: options.finalizationKeyId,
      ...(options.finalizationNow === undefined
        ? {}
        : { now: options.finalizationNow })
    });
    commit(input.session_id, current, checked);
    return controlledFinalizationOutputSchema.parse({
      finalization: decision,
      ...(challengeSessions.has(input.session_id) && decision.authorization !== "DENIED"
        ? {
            product_acceptance_receipt: issueCustomGptAcceptanceReceipt({
              challengeId: CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID,
              sessionId: input.session_id,
              protocolIdentities: checked.protocol_binding.expected,
              transitionTrace: transitionTraces.get(input.session_id) ?? [],
              finalBoundary: decision.output_boundary,
              permitPayloadSha256:
                decision.finalization_permit.permit_payload_sha256,
              reportDigest: decision.finalization_permit.report_digest,
              signingSecret: options.finalizationSigningSecret,
              keyId: options.finalizationKeyId,
              ...(options.finalizationNow === undefined
                ? {}
                : { now: options.finalizationNow })
            })
          }
        : {})
    });
  }

  async function projectWithWork(
    sessionId: string,
    state: ResearchSessionState,
    work: ResearchSemanticWork,
    cursor?: string
  ) {
    const workerInput = await createWorkerInput(sessionId, state, work);
    const page = createControlledWorkerPayloadPage({
      identity: workIdentity(sessionId, state, work),
      workerInput,
      signingSecret: options.continuationSigningSecret,
      ...(cursor === undefined ? {} : { cursor }),
      ...(options.now === undefined ? {} : { now: options.now })
    });
    return project(sessionId, state, { work, page });
  }

  async function createWorkerInput(
    sessionId: string,
    state: ResearchSessionState,
    work: ResearchSemanticWork
  ) {
    const evidenceContext = options.semanticAdvanceDependencies.evidenceContextForWork === undefined
      ? undefined
      : await options.semanticAdvanceDependencies.evidenceContextForWork({
          sessionId,
          state,
          work
        });
    return {
      worker_contract: "askrigor_controlled_semantic_worker_v1",
      instruction: "Use only this exact package. Return one JSON object matching response_contract. Do not claim workflow completion.",
      session_id: sessionId,
      state_digest: researchSessionStateDigest(state),
      research_context: state.research_target,
      semantic_work: work,
      response_contract: researchSemanticResponseContract(work.kind),
      ...(evidenceContext === undefined ? {} : { evidence_context: evidenceContext })
    };
  }

  function commit(
    sessionId: string,
    previous: ResearchSessionState,
    next: ResearchSessionState,
    transition?: Pick<CustomGptAcceptanceTransition, "capability" | "result">
  ): void {
    const claimed = store.claim(sessionId);
    try {
      if (researchSessionStateDigest(claimed) !== researchSessionStateDigest(previous)) {
        throw new ControlledStateStaleError();
      }
      store.replace(sessionId, next);
      if (challengeSessions.has(sessionId) && transition !== undefined) {
        const trace = transitionTraces.get(sessionId) ?? [];
        trace.push({
          sequence: trace.length,
          ...transition,
          before_state_digest: researchSessionStateDigest(previous),
          after_state_digest: researchSessionStateDigest(next)
        });
        transitionTraces.set(sessionId, trace);
      }
    } catch (error) {
      store.rollback(sessionId);
      throw error;
    }
  }
}

function workIdentity(
  sessionId: string,
  state: ResearchSessionState,
  work: ResearchSemanticWork
) {
  return {
    sessionId,
    stateDigest: researchSessionStateDigest(state),
    workDigest: controlledWorkerWorkDigest(work)
  };
}

function project(
  sessionId: string,
  state: ResearchSessionState,
  semantic?: { work: ResearchSemanticWork; page: ControlledWorkerPayloadPage },
  lastTransition?: z.output<typeof controlledViewSchema>["last_transition"]
) {
  const view = projectResearchSessionView(sessionId, state);
  const next = view.required_next_capabilities[0] ?? null;
  const directive = view.protocol_binding.currency === "DRIFTED"
    ? "restart_required" as const
    : semantic !== undefined
      ? "perform_semantic_work" as const
      : view.output_boundary !== "CONTINUE_RESEARCH" || next === null
        ? "finalize" as const
        : view.execution_status === "BLOCKED_RETRYABLE"
          ? "blocked" as const
          : "continue_research" as const;
  return controlledViewSchema.parse({
    session_id: sessionId,
    state_digest: researchSessionStateDigest(state),
    directive,
    execution_status: view.execution_status,
    output_boundary: view.output_boundary,
    next_capability: next,
    ...(semantic === undefined
      ? {}
      : {
          semantic_work_type: semantic.work.kind,
          worker_payload: semantic.page
        }),
    ...(lastTransition === undefined ? {} : { last_transition: lastTransition }),
    technical_summary: {
      candidates_discovered: view.candidate_discovery.reconciled_candidates,
      videos_selected: view.video_evidence.selected,
      videos_complete: view.video_evidence.complete,
      formal_sources_discovered: view.formal_evidence.sources
    }
  });
}

function route<T extends z.ZodType, O extends z.ZodType>(
  operationId: string,
  inputSchema: T,
  outputSchema: O,
  description: string,
  handler: (input: z.output<T>) => Promise<z.output<O>>,
  publicOutputSchema?: Record<string, unknown>,
  publicInputSchema?: Record<string, unknown>
): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: `/actions/research/${operationId}`,
    operationId,
    summary: `AskRigor ${operationId.replaceAll("_", " ")}`,
    description,
    consequential: false,
    public: false,
    controlledResearch: true,
    maximumRequestBytes: PRIVATE_ORCHESTRATION_REQUEST_MAX_BYTES,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: publicInputSchema ?? actionJsonSchema(inputSchema),
    responseSchemas: {
      200: publicOutputSchema ?? actionJsonSchema(outputSchema),
      409: actionJsonSchema(errorSchema),
      422: actionJsonSchema(errorSchema)
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) return failure(422, "action_input_invalid", false);
      try {
        return { status: 200, body: outputSchema.parse(await handler(parsed.data)) };
      } catch (error) {
        if (error instanceof ResearchSessionUnavailableError) {
          return failure(422, "research_session_invalid_or_expired", false);
        }
        if (error instanceof ControlledStateStaleError) {
          return failure(409, "research_session_state_stale", true);
        }
        if (error instanceof ControlledWorkMismatchError) {
          return failure(409, "research_semantic_work_mismatch", false);
        }
        if (error instanceof ControlledDependencyUnavailableError) {
          return failure(409, "research_dependency_unavailable", true);
        }
        if (error instanceof ControlledInputError) {
          return failure(422, "action_input_invalid", false);
        }
        if (error instanceof ControlledWorkerPayloadError) {
          return failure(409, "research_worker_payload_invalid", false);
        }
        throw error;
      }
    }
  });
}

function failure(status: 409 | 422, code: z.output<typeof errorSchema>["error"]["code"], retryable: boolean): ActionResult {
  return { status, body: errorSchema.parse({ error: { code, retryable } }) };
}

async function currentProtocolBindings(manifests: typeof getProtocolManifest) {
  const [universal, hrp] = await Promise.all([
    manifests("universal"),
    manifests("hrp")
  ]);
  return protocolBindingsFromManifests(universal, hrp);
}

function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
    reused: "inline"
  }) as Record<string, unknown>;
  const { $schema: _dialect, ...openApiSchema } = converted;
  return openApiSchema;
}

class ControlledStateStaleError extends Error {}
class ControlledWorkMismatchError extends Error {}
class ControlledDependencyUnavailableError extends Error {}
class ControlledInputError extends Error {}
