import { randomBytes } from "node:crypto";

import { z } from "zod";

import {
  finalizationDecisionSchema,
  type ResearchFinalizationDecision
} from "./actions/research-session-controller.js";
import {
  PrivateOrchestrationClientError,
  type PrivateResearchOrchestrationClient,
  type PrivateResearchView
} from "./private-research-orchestration-client.js";

const executionIdSchema = z.string().regex(/^arn8n1_[A-Za-z0-9_-]{32}$/u);
const sessionIdSchema = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const reasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,199}$/u);
const timestampSchema = z.string().datetime({ offset: true });

export const n8nControlPlaneDirectiveSchema = z.enum([
  "CONTINUE_NOW",
  "RETRY_AFTER",
  "OWNER_GATE",
  "STUCK",
  "BLOCKED",
  "COMPLETE",
  "BOUNDED_COMPLETE"
]);

export type N8nControlPlaneDirective = z.output<
  typeof n8nControlPlaneDirectiveSchema
>;

const activeProjectionSchema = z.object({
  control_version: z.literal("askrigor_n8n_control_v1"),
  execution_id: executionIdSchema,
  directive: z.enum([
    "CONTINUE_NOW",
    "OWNER_GATE",
    "STUCK",
    "BLOCKED"
  ]),
  permit_verified: z.literal(false),
  output_boundary: z.null(),
  reason_code: reasonCodeSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema
}).strict();

const retryProjectionSchema = z.object({
  control_version: z.literal("askrigor_n8n_control_v1"),
  execution_id: executionIdSchema,
  directive: z.literal("RETRY_AFTER"),
  permit_verified: z.literal(false),
  output_boundary: z.null(),
  reason_code: reasonCodeSchema,
  retry_after_ms: z.number().int().min(1).max(60_000),
  created_at: timestampSchema,
  updated_at: timestampSchema
}).strict();

const completeProjectionSchema = z.object({
  control_version: z.literal("askrigor_n8n_control_v1"),
  execution_id: executionIdSchema,
  directive: z.literal("COMPLETE"),
  permit_verified: z.literal(true),
  output_boundary: z.literal("FINALIZATION_ALLOWED"),
  permit_payload_sha256: digestSchema,
  reason_code: z.null(),
  created_at: timestampSchema,
  updated_at: timestampSchema
}).strict();

const boundedProjectionSchema = z.object({
  control_version: z.literal("askrigor_n8n_control_v1"),
  execution_id: executionIdSchema,
  directive: z.literal("BOUNDED_COMPLETE"),
  permit_verified: z.literal(true),
  output_boundary: z.literal("BOUNDED_NONRANKING_ONLY"),
  permit_payload_sha256: digestSchema,
  reason_code: z.null(),
  created_at: timestampSchema,
  updated_at: timestampSchema
}).strict();

export const n8nControlPlaneProjectionSchema = z.discriminatedUnion(
  "directive",
  [
    activeProjectionSchema,
    retryProjectionSchema,
    completeProjectionSchema,
    boundedProjectionSchema
  ]
);

export type N8nControlPlaneProjection = z.output<
  typeof n8nControlPlaneProjectionSchema
>;

const internalStateSchema = z.object({
  state_version: z.literal("askrigor_n8n_control_state_v1"),
  execution_id: executionIdSchema,
  session_id: sessionIdSchema,
  state_digest: digestSchema,
  directive: n8nControlPlaneDirectiveSchema,
  retryable_failure_count: z.number().int().nonnegative(),
  no_progress_count: z.number().int().nonnegative(),
  reason_code: reasonCodeSchema.nullable(),
  next_attempt_at: timestampSchema.nullable(),
  output_boundary: z.enum([
    "FINALIZATION_ALLOWED",
    "BOUNDED_NONRANKING_ONLY"
  ]).nullable(),
  permit_payload_sha256: digestSchema.nullable(),
  permit_verified: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  revision: z.number().int().nonnegative()
}).strict().superRefine((state, context) => {
  const complete = state.directive === "COMPLETE" ||
    state.directive === "BOUNDED_COMPLETE";
  if (
    complete !== state.permit_verified ||
    complete !== (state.output_boundary !== null) ||
    complete !== (state.permit_payload_sha256 !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "Only a permit-bound terminal state may claim completion"
    });
  }
  if (
    state.directive === "COMPLETE" &&
    state.output_boundary !== "FINALIZATION_ALLOWED"
  ) {
    context.addIssue({ code: "custom", message: "Complete boundary mismatch" });
  }
  if (
    state.directive === "BOUNDED_COMPLETE" &&
    state.output_boundary !== "BOUNDED_NONRANKING_ONLY"
  ) {
    context.addIssue({ code: "custom", message: "Bounded boundary mismatch" });
  }
  if (
    (state.directive === "RETRY_AFTER") !== (state.next_attempt_at !== null)
  ) {
    context.addIssue({ code: "custom", message: "Retry deadline mismatch" });
  }
});

type InternalState = z.output<typeof internalStateSchema>;

export interface N8nControlPlaneStore {
  create(state: InternalState): InternalState;
  read(executionId: string): InternalState;
  readBySession(sessionId: string): InternalState | undefined;
  replace(
    executionId: string,
    expectedRevision: number,
    state: InternalState
  ): InternalState;
}

export interface N8nControlPlaneOptions {
  client: PrivateResearchOrchestrationClient;
  store?: N8nControlPlaneStore;
  now?: () => Date;
  maximumRetryableFailures?: number;
  maximumNoProgressTransitions?: number;
  retryDelayMs?: number;
}

export interface N8nControlPlane {
  start(sessionId: string): Promise<N8nControlPlaneProjection>;
  tick(executionId: string): Promise<N8nControlPlaneProjection>;
  status(executionId: string): N8nControlPlaneProjection;
}

export class N8nControlPlaneUnavailableError extends Error {}
export class N8nControlPlaneConflictError extends Error {}

export function createEphemeralN8nControlPlaneStore(): N8nControlPlaneStore {
  const states = new Map<string, InternalState>();
  const executionsBySession = new Map<string, string>();
  const store: N8nControlPlaneStore = {
    create(rawState) {
      const state = internalStateSchema.parse(structuredClone(rawState));
      const existing = executionsBySession.get(state.session_id);
      if (states.has(state.execution_id) || existing !== undefined) {
        throw new N8nControlPlaneConflictError();
      }
      states.set(state.execution_id, state);
      executionsBySession.set(state.session_id, state.execution_id);
      return structuredClone(state);
    },
    read(rawExecutionId) {
      const executionId = executionIdSchema.parse(rawExecutionId);
      const state = states.get(executionId);
      if (state === undefined) throw new N8nControlPlaneUnavailableError();
      return structuredClone(state);
    },
    readBySession(rawSessionId) {
      const sessionId = sessionIdSchema.parse(rawSessionId);
      const executionId = executionsBySession.get(sessionId);
      if (executionId === undefined) return undefined;
      const state = states.get(executionId);
      return state === undefined ? undefined : structuredClone(state);
    },
    replace(rawExecutionId, expectedRevision, rawState) {
      const executionId = executionIdSchema.parse(rawExecutionId);
      const current = states.get(executionId);
      if (
        current === undefined || current.revision !== expectedRevision ||
        rawState.execution_id !== executionId ||
        rawState.session_id !== current.session_id ||
        rawState.revision !== expectedRevision + 1
      ) throw new N8nControlPlaneConflictError();
      const state = internalStateSchema.parse(structuredClone(rawState));
      states.set(executionId, state);
      return structuredClone(state);
    }
  };
  return Object.freeze(store);
}

export function createN8nControlPlane(
  options: N8nControlPlaneOptions
): N8nControlPlane {
  const store = options.store ?? createEphemeralN8nControlPlaneStore();
  const now = options.now ?? (() => new Date());
  const maximumRetryableFailures = boundedPositiveInteger(
    options.maximumRetryableFailures ?? 3,
    100
  );
  const maximumNoProgressTransitions = boundedPositiveInteger(
    options.maximumNoProgressTransitions ?? 3,
    100
  );
  const retryDelayMs = boundedPositiveInteger(options.retryDelayMs ?? 1_000, 60_000);
  const inFlight = new Set<string>();

  return Object.freeze({ start, tick, status });

  async function start(rawSessionId: string): Promise<N8nControlPlaneProjection> {
    const sessionId = sessionIdSchema.parse(rawSessionId);
    const existing = store.readBySession(sessionId);
    if (existing !== undefined) return project(existing, now());
    const view = await options.client.status(sessionId);
    const decision = finalizationDecisionSchema.parse(
      await options.client.finalize(sessionId)
    );
    const at = validNow(now);
    const initial = stateFromServer({
      executionId: newExecutionId(),
      sessionId,
      view,
      decision,
      at,
      revision: 0,
      retryableFailureCount: 0,
      noProgressCount: 0
    });
    try {
      return project(store.create(initial), at);
    } catch (error) {
      if (!(error instanceof N8nControlPlaneConflictError)) throw error;
      const raced = store.readBySession(sessionId);
      if (raced === undefined) throw error;
      return project(raced, at);
    }
  }

  async function tick(
    rawExecutionId: string
  ): Promise<N8nControlPlaneProjection> {
    const executionId = executionIdSchema.parse(rawExecutionId);
    const original = store.read(executionId);
    const at = validNow(now);
    if (isTerminalDirective(original.directive)) return project(original, at);
    if (
      original.directive === "RETRY_AFTER" &&
      Date.parse(original.next_attempt_at!) > at.getTime()
    ) return project(original, at);
    if (inFlight.has(executionId)) {
      return project(original, at);
    }
    inFlight.add(executionId);
    try {
      let view: PrivateResearchView;
      let decision: ResearchFinalizationDecision;
      try {
        decision = finalizationDecisionSchema.parse(
          await options.client.finalize(original.session_id)
        );
        if (decision.authorization !== "DENIED") {
          return commit(original, stateFromServer({
            executionId,
            sessionId: original.session_id,
            view: syntheticTerminalView(original, decision),
            decision,
            at,
            revision: original.revision + 1,
            retryableFailureCount: 0,
            noProgressCount: 0,
            createdAt: original.created_at
          }), at);
        }
        view = await options.client.status(original.session_id);
        if (view.state_digest !== original.state_digest) {
          return commit(original, stateFromServer({
            executionId,
            sessionId: original.session_id,
            view,
            decision,
            at,
            revision: original.revision + 1,
            retryableFailureCount: 0,
            noProgressCount: 0,
            createdAt: original.created_at
          }), at);
        }
        const preAdvance = directiveFor(view, decision);
        if (preAdvance.directive !== "CONTINUE_NOW") {
          return commit(original, stateFromServer({
            executionId,
            sessionId: original.session_id,
            view,
            decision,
            at,
            revision: original.revision + 1,
            retryableFailureCount: original.retryable_failure_count,
            noProgressCount: original.no_progress_count,
            createdAt: original.created_at
          }), at);
        }
        view = await options.client.advance({
          session_id: original.session_id,
          state_digest: view.state_digest
        });
        decision = finalizationDecisionSchema.parse(
          await options.client.finalize(original.session_id)
        );
      } catch (error) {
        return commitRetryFailure(original, error, at);
      }

      const progressed = view.state_digest !== original.state_digest;
      const noProgressCount = progressed ? 0 : original.no_progress_count + 1;
      if (noProgressCount >= maximumNoProgressTransitions) {
        return commit(original, internalStateSchema.parse({
          ...original,
          directive: "STUCK",
          reason_code: "NO_PROGRESS_LIMIT_REACHED",
          next_attempt_at: null,
          retryable_failure_count: 0,
          no_progress_count: noProgressCount,
          output_boundary: null,
          permit_payload_sha256: null,
          permit_verified: false,
          state_digest: view.state_digest,
          updated_at: at.toISOString(),
          revision: original.revision + 1
        }), at);
      }
      return commit(original, stateFromServer({
        executionId,
        sessionId: original.session_id,
        view,
        decision,
        at,
        revision: original.revision + 1,
        retryableFailureCount: 0,
        noProgressCount,
        createdAt: original.created_at
      }), at);
    } finally {
      inFlight.delete(executionId);
    }
  }

  function status(rawExecutionId: string): N8nControlPlaneProjection {
    return project(store.read(rawExecutionId), validNow(now));
  }

  function commitRetryFailure(
    original: InternalState,
    error: unknown,
    at: Date
  ): N8nControlPlaneProjection {
    const retryable = !(error instanceof PrivateOrchestrationClientError) ||
      error.retryable;
    const reasonCode = error instanceof PrivateOrchestrationClientError
      ? normalizeReasonCode(error.code)
      : "ASKRIGOR_TRANSPORT_FAILURE";
    if (!retryable) {
      return commit(original, internalStateSchema.parse({
        ...original,
        directive: "BLOCKED",
        reason_code: reasonCode,
        next_attempt_at: null,
        output_boundary: null,
        permit_payload_sha256: null,
        permit_verified: false,
        updated_at: at.toISOString(),
        revision: original.revision + 1
      }), at);
    }
    const failureCount = original.retryable_failure_count + 1;
    const exhausted = failureCount >= maximumRetryableFailures;
    return commit(original, internalStateSchema.parse({
      ...original,
      directive: exhausted ? "STUCK" : "RETRY_AFTER",
      reason_code: exhausted ? "RETRY_LIMIT_REACHED" : reasonCode,
      next_attempt_at: exhausted
        ? null
        : new Date(at.getTime() + retryDelayMs).toISOString(),
      retryable_failure_count: failureCount,
      output_boundary: null,
      permit_payload_sha256: null,
      permit_verified: false,
      updated_at: at.toISOString(),
      revision: original.revision + 1
    }), at);
  }

  function commit(
    original: InternalState,
    next: InternalState,
    at: Date
  ): N8nControlPlaneProjection {
    return project(store.replace(original.execution_id, original.revision, next), at);
  }
}

function stateFromServer(input: {
  executionId: string;
  sessionId: string;
  view: PrivateResearchView;
  decision: ResearchFinalizationDecision;
  at: Date;
  revision: number;
  retryableFailureCount: number;
  noProgressCount: number;
  createdAt?: string;
}): InternalState {
  if (input.decision.session_id !== input.sessionId) {
    throw new Error("Finalization decision session mismatch");
  }
  if (input.decision.authorization !== "DENIED") {
    if (
      input.decision.state_digest !== input.view.state_digest ||
      input.decision.finalization_permit.execution_id !== input.sessionId
    ) throw new Error("Finalization permit binding mismatch");
    return internalStateSchema.parse({
      state_version: "askrigor_n8n_control_state_v1",
      execution_id: input.executionId,
      session_id: input.sessionId,
      state_digest: input.decision.state_digest,
      directive: input.decision.authorization === "AUTHORIZED"
        ? "COMPLETE"
        : "BOUNDED_COMPLETE",
      retryable_failure_count: input.retryableFailureCount,
      no_progress_count: input.noProgressCount,
      reason_code: null,
      next_attempt_at: null,
      output_boundary: input.decision.output_boundary,
      permit_payload_sha256:
        input.decision.finalization_permit.permit_payload_sha256,
      permit_verified: true,
      created_at: input.createdAt ?? input.at.toISOString(),
      updated_at: input.at.toISOString(),
      revision: input.revision
    });
  }
  if (input.decision.state_digest !== input.view.state_digest) {
    throw new Error("Denied finalization state mismatch");
  }
  const directive = directiveFor(input.view, input.decision);
  return internalStateSchema.parse({
    state_version: "askrigor_n8n_control_state_v1",
    execution_id: input.executionId,
    session_id: input.sessionId,
    state_digest: input.view.state_digest,
    directive: directive.directive,
    retryable_failure_count: input.retryableFailureCount,
    no_progress_count: input.noProgressCount,
    reason_code: directive.reasonCode,
    next_attempt_at: null,
    output_boundary: null,
    permit_payload_sha256: null,
    permit_verified: false,
    created_at: input.createdAt ?? input.at.toISOString(),
    updated_at: input.at.toISOString(),
    revision: input.revision
  });
}

function directiveFor(
  view: PrivateResearchView,
  decision: Extract<ResearchFinalizationDecision, { authorization: "DENIED" }>
): { directive: Exclude<N8nControlPlaneDirective, "COMPLETE" | "BOUNDED_COMPLETE" | "RETRY_AFTER">; reasonCode: string | null } {
  if (view.execution_status === "PROTOCOL_DRIFT") {
    return { directive: "BLOCKED", reasonCode: "PROTOCOL_DRIFT" };
  }
  if (
    view.last_transition?.result === "blocked_retryable" ||
    view.boundaries.some(({ classification }) => classification === "RETRYABLE")
  ) {
    return { directive: "CONTINUE_NOW", reasonCode: "RETRYABLE_WORK_REMAINS" };
  }
  if (
    view.semantic_work !== null ||
    view.required_next_capabilities.length > 0 ||
    decision.required_next_capabilities.length > 0
  ) return { directive: "CONTINUE_NOW", reasonCode: null };
  const terminal = view.boundaries.find(
    ({ classification }) => classification === "TERMINAL_NONRETRYABLE"
  );
  return {
    directive: "BLOCKED",
    reasonCode: terminal?.code ?? "NO_SERVER_DIRECTED_WORK"
  };
}

function syntheticTerminalView(
  state: InternalState,
  decision: Exclude<ResearchFinalizationDecision, { authorization: "DENIED" }>
): PrivateResearchView {
  return {
    session_id: state.session_id,
    state_digest: decision.state_digest,
    execution_status: decision.authorization === "AUTHORIZED"
      ? "READY_TO_FINALIZE"
      : "BOUNDED",
    output_boundary: decision.output_boundary,
    finalization_readiness: decision.output_boundary,
    required_next_capabilities: [],
    boundaries: [],
    semantic_work: null,
    safe_diagnostics: {
      scout_candidate_count: 0,
      unresolved_scout_candidate_count: 0
    }
  };
}

function project(state: InternalState, at: Date): N8nControlPlaneProjection {
  const base = {
    control_version: "askrigor_n8n_control_v1" as const,
    execution_id: state.execution_id,
    directive: state.directive,
    reason_code: state.reason_code,
    created_at: state.created_at,
    updated_at: state.updated_at
  };
  if (state.directive === "COMPLETE") {
    return n8nControlPlaneProjectionSchema.parse({
      ...base,
      permit_verified: true,
      output_boundary: "FINALIZATION_ALLOWED",
      permit_payload_sha256: state.permit_payload_sha256
    });
  }
  if (state.directive === "BOUNDED_COMPLETE") {
    return n8nControlPlaneProjectionSchema.parse({
      ...base,
      permit_verified: true,
      output_boundary: "BOUNDED_NONRANKING_ONLY",
      permit_payload_sha256: state.permit_payload_sha256
    });
  }
  if (state.directive === "RETRY_AFTER") {
    return n8nControlPlaneProjectionSchema.parse({
      ...base,
      permit_verified: false,
      output_boundary: null,
      retry_after_ms: Math.max(1, Math.min(
        60_000,
        Date.parse(state.next_attempt_at!) - at.getTime()
      ))
    });
  }
  return n8nControlPlaneProjectionSchema.parse({
    ...base,
    permit_verified: false,
    output_boundary: null
  });
}

function newExecutionId(): string {
  return `arn8n1_${randomBytes(24).toString("base64url")}`;
}

function normalizeReasonCode(value: string): string {
  const normalized = value.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "").slice(0, 200);
  return reasonCodeSchema.parse(normalized.length >= 3
    ? normalized
    : "PRIVATE_ORCHESTRATION_FAILURE");
}

function boundedPositiveInteger(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error("n8n control-plane bound is invalid");
  }
  return value;
}

function validNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("n8n control-plane clock is invalid");
  }
  return value;
}

function isTerminalDirective(directive: N8nControlPlaneDirective): boolean {
  return directive === "OWNER_GATE" || directive === "STUCK" ||
    directive === "BLOCKED" || directive === "COMPLETE" ||
    directive === "BOUNDED_COMPLETE";
}
