import type { IncomingMessage, ServerResponse } from "node:http";

import { isJsonContentType } from "@modelcontextprotocol/sdk/shared/mediaType.js";
import { z } from "zod";

import {
  PRIVATE_ORCHESTRATION_REQUEST_MAX_BYTES,
  PRIVATE_ORCHESTRATION_RESPONSE_MAX_BYTES,
  researchSessionCheckpointConfigFromEnv
} from "./config.js";
import { hasValidActionAuthorization } from "./actions/auth.js";
import { isDeidentifiedResearchTarget } from "./actions/gemini-scout-route.js";
import {
  ActionBodyTooLargeError,
  InvalidActionJsonError,
  readActionJsonBody
} from "./actions/body.js";
import {
  candidateDiscoveryReadyForScreening,
  candidateScreeningSubmissionSchema
} from "./actions/research-candidate-frontier.js";
import {
  applyServerModuleApplicability,
  finalizationDecisionSchema,
  projectResearchSessionView,
  RESEARCH_MODULE_IDS,
  recordCandidateScreeningCompletion,
  researchNextCapabilitySchema,
  researchOutputBoundarySchema,
  researchSessionStateDigest,
  researchSessionViewSchema,
  verifyResearchFinalizationPermit,
  type ResearchModuleId,
  type ResearchSessionState
} from "./actions/research-session-controller.js";
import {
  createResearchSessionPrototypeRoutes,
  type CreateResearchSessionPrototypeRoutesOptions
} from "./actions/research-session-prototype-route.js";
import {
  createResearchSessionStore,
  ResearchSessionUnavailableError,
  type ResearchSessionStore
} from "./actions/research-session-store.js";
import { createFileResearchSessionStore } from
  "./actions/file-research-session-store.js";
import type { ActionRoute } from "./actions/types.js";
import type {
  ConcurrencyLimiter,
  TokenBucketLimiter
} from "./rate-limit.js";
import {
  assertResearchSemanticBinding,
  researchSemanticExecutionEnvelopeSchema,
  researchSemanticWorkSchema,
  type ResearchSemanticExecutor,
  type ResearchSemanticWork
} from "./research-semantic-worker.js";

export const PRIVATE_RESEARCH_ORCHESTRATION_PREFIX =
  "/internal/research/v1" as const;

const sessionIdSchema = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const sessionInputSchema = z.object({ session_id: sessionIdSchema }).strict();
const startInputSchema = z.object({
  research_target: z.string().trim().min(1).max(1_000),
  diagnosis_status: z.enum([
    "diagnosis_not_specified",
    "user_supplied_diagnosis"
  ])
}).strict();
const stateBoundSessionInputSchema = sessionInputSchema.extend({
  state_digest: digestSchema
}).strict();
const moduleDecisionSchema = z.object({
  module_id: z.enum(RESEARCH_MODULE_IDS),
  applicability: z.enum(["REQUIRED", "NOT_REQUIRED"]),
  rationale: z.string().trim().min(1).max(1_000)
}).strict();
const moduleSubmissionSchema = stateBoundSessionInputSchema.extend({
  work_type: z.literal("module_applicability"),
  submission: z.object({
    package_version: z.literal("askrigor_module_applicability_v1"),
    decisions: z.array(moduleDecisionSchema).min(1).max(RESEARCH_MODULE_IDS.length)
  }).strict()
}).strict();
const candidateSubmissionSchema = stateBoundSessionInputSchema.extend({
  work_type: z.literal("candidate_screening"),
  submission: candidateScreeningSubmissionSchema
}).strict();
const semanticSubmissionSchema = z.discriminatedUnion("work_type", [
  moduleSubmissionSchema,
  candidateSubmissionSchema
]);

const boundarySchema = z.object({
  capability: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/u),
  classification: z.enum(["RETRYABLE", "TERMINAL_NONRETRYABLE"]),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u)
}).strict();

const semanticWorkPackageSchema = researchSemanticWorkSchema.nullable();

export const privateResearchOrchestrationViewSchema = z.object({
  session_id: sessionIdSchema,
  state_digest: digestSchema,
  execution_status: researchSessionViewSchema.shape.execution_status,
  output_boundary: researchOutputBoundarySchema,
  finalization_readiness: researchOutputBoundarySchema,
  required_next_capabilities: z.array(researchNextCapabilitySchema),
  boundaries: z.array(boundarySchema).max(32),
  semantic_work: semanticWorkPackageSchema,
  safe_diagnostics: z.object({
    scout_candidate_count: z.number().int().nonnegative(),
    unresolved_scout_candidate_count: z.number().int().nonnegative()
  }).strict(),
  last_transition: z.object({
    capability: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/u),
    result: z.enum([
      "protocol_current",
      "protocol_drift",
      "complete",
      "blocked_retryable",
      "blocked_terminal",
      "already_complete",
      "semantic_work_recorded"
    ])
  }).strict().optional()
}).strict();

const privateErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "private_orchestration_auth_required",
      "private_orchestration_origin_forbidden",
      "private_orchestration_method_not_allowed",
      "private_orchestration_content_type_required",
      "private_orchestration_body_too_large",
      "private_orchestration_invalid_json",
      "private_orchestration_input_invalid",
      "private_orchestration_path_not_found",
      "private_orchestration_state_stale",
      "private_orchestration_work_mismatch",
      "private_orchestration_session_unavailable",
      "private_orchestration_rate_limited",
      "private_orchestration_concurrency_limited",
      "private_orchestration_response_too_large",
      "private_orchestration_worker_unavailable",
      "private_orchestration_worker_failed",
      "private_orchestration_worker_output_rejected",
      "private_orchestration_internal_error"
    ]),
    retryable: z.boolean()
  }).strict()
}).strict();

type PrivateView = z.output<typeof privateResearchOrchestrationViewSchema>;

export interface PrivateResearchOrchestrationHandlerOptions
  extends Omit<CreateResearchSessionPrototypeRoutesOptions, "store"> {
  store?: ResearchSessionStore;
  maximumResponseBytes?: number;
  semanticExecutor?: ResearchSemanticExecutor;
}

export interface PrivateResearchOrchestrationDispatchOptions {
  pathname: string;
  clientIp: string;
  apiKey: string;
  rateLimiter: TokenBucketLimiter;
  concurrencyLimiter: ConcurrencyLimiter;
}

export interface PrivateResearchOrchestrationHandler {
  dispatch(
    request: IncomingMessage,
    response: ServerResponse,
    options: PrivateResearchOrchestrationDispatchOptions
  ): Promise<boolean>;
}

/**
 * Private, non-Action/non-MCP transport over the existing controller. It owns
 * no protocol policy and projects no raw research target or evidence corpus.
 */
export function createPrivateResearchOrchestrationHandler(
  options: PrivateResearchOrchestrationHandlerOptions = {}
): PrivateResearchOrchestrationHandler {
  const checkpointConfig = options.store === undefined
    ? researchSessionCheckpointConfigFromEnv()
    : undefined;
  const store = options.store ?? (checkpointConfig === undefined
    ? createResearchSessionStore()
    : createFileResearchSessionStore(checkpointConfig));
  const maximumResponseBytes = options.maximumResponseBytes ??
    PRIVATE_ORCHESTRATION_RESPONSE_MAX_BYTES;
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1) {
    throw new Error("Private orchestration response limit is invalid");
  }
  const {
    maximumResponseBytes: _maximumResponseBytes,
    semanticExecutor: _semanticExecutor,
    store: _configuredStore,
    ...prototypeOptions
  } = options;
  const routes = createResearchSessionPrototypeRoutes({
    ...prototypeOptions,
    store
  });

  return Object.freeze({ dispatch });

  async function dispatch(
    request: IncomingMessage,
    response: ServerResponse,
    dispatchOptions: PrivateResearchOrchestrationDispatchOptions
  ): Promise<boolean> {
    if (!dispatchOptions.pathname.startsWith(`${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}/`)) {
      return false;
    }
    if (request.headers.origin !== undefined) {
      writeError(response, 403, "private_orchestration_origin_forbidden", false);
      return true;
    }
    if (!hasValidActionAuthorization(request, dispatchOptions.apiKey)) {
      writeError(response, 401, "private_orchestration_auth_required", false);
      return true;
    }
    if (request.method !== "POST") {
      writeError(response, 405, "private_orchestration_method_not_allowed", false, {
        allow: "POST"
      });
      return true;
    }
    if (!isJsonContentType(request.headers["content-type"])) {
      writeError(response, 415, "private_orchestration_content_type_required", false);
      return true;
    }
    if (!dispatchOptions.rateLimiter.consume(dispatchOptions.clientIp)) {
      writeError(response, 429, "private_orchestration_rate_limited", true);
      return true;
    }
    const releasePermit = dispatchOptions.concurrencyLimiter.tryAcquire();
    if (releasePermit === undefined) {
      writeError(response, 503, "private_orchestration_concurrency_limited", true);
      return true;
    }
    try {
      let body: unknown;
      try {
        body = await readActionJsonBody(
          request,
          PRIVATE_ORCHESTRATION_REQUEST_MAX_BYTES
        );
      } catch (error) {
        if (error instanceof ActionBodyTooLargeError) {
          writeError(response, 413, "private_orchestration_body_too_large", false);
        } else if (error instanceof InvalidActionJsonError) {
          writeError(response, 400, "private_orchestration_invalid_json", false);
        } else {
          writeError(response, 400, "private_orchestration_invalid_json", false);
        }
        return true;
      }

      try {
        const result = await handleRequest(dispatchOptions.pathname, body);
        writeBoundedJson(
          response,
          result.status,
          result.body,
          {},
          maximumResponseBytes
        );
      } catch (error) {
        if (error instanceof ResearchSessionUnavailableError) {
          writeError(
            response,
            404,
            "private_orchestration_session_unavailable",
            false
          );
        } else if (error instanceof PrivateStateStaleError) {
          writeError(response, 409, "private_orchestration_state_stale", true);
        } else if (error instanceof PrivateWorkMismatchError) {
          writeError(response, 409, "private_orchestration_work_mismatch", false);
        } else if (error instanceof PrivateInputInvalidError) {
          writeError(response, 422, "private_orchestration_input_invalid", false);
        } else if (error instanceof PrivateWorkerUnavailableError) {
          writeError(response, 503, "private_orchestration_worker_unavailable", true);
        } else if (error instanceof PrivateWorkerFailedError) {
          writeError(response, 503, "private_orchestration_worker_failed", true);
        } else if (error instanceof PrivateWorkerOutputRejectedError) {
          writeError(
            response,
            422,
            "private_orchestration_worker_output_rejected",
            false
          );
        } else {
          writeError(response, 500, "private_orchestration_internal_error", false);
        }
      }
      return true;
    } finally {
      releasePermit();
    }
  }

  async function handleRequest(
    pathname: string,
    body: unknown
  ): Promise<{ status: number; body: unknown }> {
    if (pathname === `${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}/start`) {
      const parsed = startInputSchema.safeParse(body);
      if (
        !parsed.success ||
        !isDeidentifiedResearchTarget(parsed.data.research_target)
      ) {
        throw new PrivateInputInvalidError();
      }
      return projectActionResult(
        await invokeRoute(routes, "start_research_session", parsed.data)
      );
    }
    if (pathname === `${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}/resume`) {
      return projectActionResult(
        await invokeRoute(routes, "continue_research_session", body)
      );
    }
    if (pathname === `${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}/status`) {
      return projectActionResult(
        await invokeRoute(routes, "get_research_session_status", body)
      );
    }
    if (pathname === `${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}/finalize`) {
      const result = await invokeRoute(routes, "finalize_research_report", body);
      if (result.status !== 200) return normalizeActionFailure(result);
      const decision = finalizationDecisionSchema.parse(result.body);
      if (decision.authorization !== "DENIED") {
        if (
          options.finalizationSigningSecret === undefined ||
          options.finalizationKeyId === undefined
        ) throw new Error("Finalization verification configuration unavailable");
        verifyResearchFinalizationPermit(
          decision.finalization_permit,
          decision.session_id,
          store.read(decision.session_id),
          {
            signingSecret: options.finalizationSigningSecret,
            keyId: options.finalizationKeyId,
            ...(options.finalizationNow === undefined
              ? {}
              : { now: options.finalizationNow })
          }
        );
      }
      return {
        status: 200,
        body: decision
      };
    }
    if (pathname === `${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}/submit`) {
      return submitSemanticWork(body);
    }
    if (pathname === `${PRIVATE_RESEARCH_ORCHESTRATION_PREFIX}/advance`) {
      return advanceServerDirectedWork(body);
    }
    return {
      status: 404,
      body: privateErrorSchema.parse({
        error: {
          code: "private_orchestration_path_not_found",
          retryable: false
        }
      })
    };
  }

  function submitSemanticWork(body: unknown): { status: number; body: PrivateView } {
    const parsed = semanticSubmissionSchema.safeParse(body);
    if (!parsed.success) throw new PrivateInputInvalidError();
    const sessionId = parsed.data.session_id;
    const claimed = store.claim(sessionId);
    try {
      if (researchSessionStateDigest(claimed) !== parsed.data.state_digest) {
        throw new PrivateStateStaleError();
      }
      const next = parsed.data.work_type === "module_applicability"
        ? applyModuleSubmission(claimed, parsed.data.submission)
        : applyCandidateSubmission(claimed, parsed.data.submission);
      const projected = projectPrivateView(
        sessionId,
        next,
        { capability: parsed.data.work_type, result: "semantic_work_recorded" }
      );
      store.replace(sessionId, next);
      return {
        status: 200,
        body: projected
      };
    } catch (error) {
      store.rollback(sessionId);
      throw error;
    }
  }

  async function advanceServerDirectedWork(
    body: unknown
  ): Promise<{ status: number; body: PrivateView }> {
    const parsed = stateBoundSessionInputSchema.safeParse(body);
    if (!parsed.success) throw new PrivateInputInvalidError();
    const current = store.read(parsed.data.session_id);
    const currentDigest = researchSessionStateDigest(current);
    if (currentDigest !== parsed.data.state_digest) {
      throw new PrivateStateStaleError();
    }
    const semanticWork = semanticWorkForState(
      parsed.data.session_id,
      current,
      currentDigest
    );
    if (semanticWork !== null) {
      if (options.semanticExecutor === undefined) {
        throw new PrivateWorkerUnavailableError();
      }
      let rawExecution: unknown;
      try {
        rawExecution = await options.semanticExecutor.execute({
          session_id: parsed.data.session_id,
          state_digest: currentDigest,
          research_context: current.research_target,
          semantic_work: semanticWork
        });
      } catch {
        throw new PrivateWorkerFailedError();
      }
      const execution = researchSemanticExecutionEnvelopeSchema.safeParse(
        rawExecution
      );
      if (!execution.success) throw new PrivateWorkerOutputRejectedError();
      try {
        assertResearchSemanticBinding({
          session_id: parsed.data.session_id,
          state_digest: currentDigest,
          work_type: semanticWork.kind,
          ...(semanticWork.kind === "candidate_screening"
            ? { discovery_digest: semanticWork.package.discovery_digest }
            : {})
        }, execution.data.model_output);
      } catch {
        throw new PrivateWorkerOutputRejectedError();
      }
      const claimed = store.claim(parsed.data.session_id);
      try {
        if (researchSessionStateDigest(claimed) !== currentDigest) {
          throw new PrivateStateStaleError();
        }
        const next = execution.data.model_output.work_type === "module_applicability"
          ? applyModuleSubmission(claimed, execution.data.model_output.submission)
          : applyCandidateSubmission(claimed, execution.data.model_output.submission);
        const projected = projectPrivateView(parsed.data.session_id, next, {
          capability: execution.data.model_output.work_type,
          result: "semantic_work_recorded"
        });
        store.replace(parsed.data.session_id, next);
        return { status: 200, body: projected };
      } catch (error) {
        store.rollback(parsed.data.session_id);
        throw error;
      }
    }
    const privateView = projectPrivateView(parsed.data.session_id, current);
    if (privateView.required_next_capabilities.length === 0) {
      return { status: 200, body: privateView };
    }
    return projectActionResult(await invokeRoute(
      routes,
      "continue_research_session",
      { session_id: parsed.data.session_id }
    ));
  }

  function applyModuleSubmission(
    state: ResearchSessionState,
    submission: z.output<typeof moduleSubmissionSchema>["submission"]
  ): ResearchSessionState {
    const unresolved = RESEARCH_MODULE_IDS.filter((moduleId) =>
      state.modules[moduleId].applicability === "UNRESOLVED"
    );
    const submitted = submission.decisions.map(({ module_id }) => module_id);
    if (
      new Set(submitted).size !== submitted.length ||
      unresolved.length !== submitted.length ||
      unresolved.some((moduleId) => !submitted.includes(moduleId))
    ) {
      throw new PrivateWorkMismatchError();
    }
    const updates: Partial<Record<ResearchModuleId, "REQUIRED" | "NOT_REQUIRED">> = {};
    for (const decision of submission.decisions) {
      updates[decision.module_id] = decision.applicability;
    }
    return applyServerModuleApplicability(state, updates, "SERVER_ROUTER");
  }

  function applyCandidateSubmission(
    state: ResearchSessionState,
    submission: z.output<typeof candidateScreeningSubmissionSchema>
  ): ResearchSessionState {
    if (
      state.operations.candidate_screening.status === "COMPLETE" ||
      !candidateDiscoveryReadyForScreening(state.candidate_discovery)
    ) {
      throw new PrivateWorkMismatchError();
    }
    try {
      return recordCandidateScreeningCompletion(state, submission);
    } catch {
      throw new PrivateWorkMismatchError();
    }
  }

  function projectActionResult(result: { status: number; body: unknown }) {
    if (result.status !== 200) return normalizeActionFailure(result);
    const raw = isRecord(result.body) ? result.body : {};
    const { last_transition: lastTransition, ...viewFields } = raw;
    const view = researchSessionViewSchema.parse(viewFields);
    const state = store.read(view.session_id);
    return {
      status: 200,
      body: projectPrivateView(view.session_id, state, lastTransition)
    };
  }

  function normalizeActionFailure(
    result: { status: number; body: unknown }
  ): never {
    if (
      isRecord(result.body) && isRecord(result.body.error) &&
      result.body.error.code === "research_session_invalid_or_expired"
    ) {
      throw new ResearchSessionUnavailableError();
    }
    throw new PrivateInputInvalidError();
  }
}

function projectPrivateView(
  sessionId: string,
  state: ResearchSessionState,
  lastTransition?: unknown
): PrivateView {
  const view = projectResearchSessionView(sessionId, state);
  const stateDigest = researchSessionStateDigest(state);
  const semanticWork = semanticWorkForState(sessionId, state, stateDigest);
  const boundaries = Object.entries(state.operations).flatMap(
    ([capability, operation]) => operation.boundary === undefined
      ? []
      : [{
        capability,
        classification: operation.boundary.classification,
        code: operation.boundary.code
      }]
  );
  return privateResearchOrchestrationViewSchema.parse({
    session_id: sessionId,
    state_digest: stateDigest,
    execution_status: view.execution_status,
    output_boundary: view.output_boundary,
    finalization_readiness: view.finalization_readiness,
    required_next_capabilities: view.required_next_capabilities,
    boundaries,
    semantic_work: semanticWork,
    safe_diagnostics: {
      scout_candidate_count: state.scout.candidate_count,
      unresolved_scout_candidate_count: state.scout.unresolved_candidate_ids.length
    },
    ...(lastTransition === undefined ? {} : { last_transition: lastTransition })
  });
}

function semanticWorkForState(
  sessionId: string,
  state: ResearchSessionState,
  stateDigest: string
): ResearchSemanticWork | null {
  const unresolvedModuleIds = RESEARCH_MODULE_IDS.filter((moduleId) =>
    state.modules[moduleId].applicability === "UNRESOLVED"
  );
  if (unresolvedModuleIds.length > 0) {
    return researchSemanticWorkSchema.parse({
      kind: "module_applicability",
      package: {
        package_version: "askrigor_module_applicability_v1",
        state_digest: stateDigest,
        unresolved_module_ids: unresolvedModuleIds
      }
    });
  }
  const view = projectResearchSessionView(sessionId, state);
  if (view.candidate_screening_work_package === null) return null;
  return researchSemanticWorkSchema.parse({
    kind: "candidate_screening",
    package: {
      ...view.candidate_screening_work_package,
      state_digest: stateDigest
    }
  });
}

async function invokeRoute(
  routes: readonly ActionRoute[],
  operationId: string,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const route = routes.find((candidate) => candidate.operationId === operationId);
  if (route === undefined) throw new Error(`Missing private controller route ${operationId}`);
  return route.handle({ request: {} as IncomingMessage, clientIp: "internal", body });
}

function writeBoundedJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
  maximumBytes = PRIVATE_ORCHESTRATION_RESPONSE_MAX_BYTES
): void {
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
    writeError(response, 502, "private_orchestration_response_too_large", false);
    return;
  }
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers
  });
  response.end(serialized);
}

function writeError(
  response: ServerResponse,
  status: number,
  code: z.output<typeof privateErrorSchema>["error"]["code"],
  retryable: boolean,
  headers: Readonly<Record<string, string>> = {}
): void {
  writeBoundedJson(
    response,
    status,
    privateErrorSchema.parse({ error: { code, retryable } }),
    headers
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class PrivateStateStaleError extends Error {}
class PrivateWorkMismatchError extends Error {}
class PrivateInputInvalidError extends Error {}
class PrivateWorkerUnavailableError extends Error {}
class PrivateWorkerFailedError extends Error {}
class PrivateWorkerOutputRejectedError extends Error {}
