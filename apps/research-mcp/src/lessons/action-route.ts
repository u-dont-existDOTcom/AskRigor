import type {
  ActionRequestContext,
  ActionRoute,
} from "../actions/types.js";
import {
  lessonSubmissionResultSchema,
  type LessonSubmissionResult,
} from "./contracts.js";
import type { LessonSubmissionService } from "./service.js";

const categorySchema = {
  type: "string",
  enum: [
    "missing_sources",
    "conflicting_claims",
    "incomplete_research",
    "evidence_weighting",
    "community_corpus",
    "tool_semantics",
    "protocol_execution",
    "privacy_or_safety",
    "usability",
    "other",
  ],
} as const;

const evidenceBasisSchema = {
  type: "string",
  enum: [
    "assistant_self_check",
    "tool_receipt_conflict",
    "source_recheck",
    "instruction_mismatch",
  ],
} as const;

export const LESSON_ACTION_REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "general_lesson",
    "expected_behavior",
    "failure_reason",
    "synthetic_regression_example",
    "evidence_basis",
    "consent_scope",
  ],
  properties: {
    category: categorySchema,
    general_lesson: { type: "string", minLength: 40, maxLength: 600 },
    expected_behavior: { type: "string", minLength: 40, maxLength: 1_200 },
    failure_reason: { type: "string", minLength: 20, maxLength: 800 },
    synthetic_regression_example: { type: "string", minLength: 20, maxLength: 1_200 },
    evidence_basis: evidenceBasisSchema,
    askrigor_version: { type: "string", minLength: 1, maxLength: 64 },
    protocol_identities: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "version"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64 },
          version: { type: "string", minLength: 1, maxLength: 64 },
          sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      },
    },
    consent_scope: { type: "string", enum: ["once", "conversation"] },
  },
} as const;

const successfulResultProperties = {
  candidate_id: { type: "string", pattern: "^ARL-[0-9]{4,}$" },
  occurrence_count: { type: "integer", minimum: 1 },
  retryable: { const: false },
} as const;

export const LESSON_ACTION_RESPONSE_SCHEMAS = {
  200: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "candidate_id", "occurrence_count", "retryable"],
        properties: { status: { const: "submitted" }, ...successfulResultProperties },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "candidate_id", "occurrence_count", "retryable"],
        properties: { status: { const: "existing_candidate" }, ...successfulResultProperties },
      },
    ],
  },
  415: {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "retryable"],
        properties: {
          code: { const: "action_json_content_type_required" },
          retryable: { const: false },
        },
      },
    },
  },
  422: {
    type: "object",
    additionalProperties: false,
    required: ["status", "retryable", "reason_code"],
    properties: {
      status: { const: "privacy_rejected" },
      retryable: { const: false },
      reason_code: { const: "unsafe_candidate" },
    },
  },
  429: {
    type: "object",
    additionalProperties: false,
    required: ["status", "retryable", "retry_after_seconds", "reason_code"],
    properties: {
      status: { const: "rate_limited" },
      retryable: { const: true },
      retry_after_seconds: { type: "integer", minimum: 1 },
      reason_code: { type: "string", enum: ["hourly_limit", "daily_limit"] },
    },
  },
  503: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "retryable", "reason_code"],
        properties: {
          status: { const: "anonymizer_unavailable" },
          retryable: { type: "boolean" },
          reason_code: {
            type: "string",
            enum: ["ai_budget_exhausted", "privacy_service_unavailable"],
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "retryable", "reason_code"],
        properties: {
          status: { const: "github_unavailable" },
          retryable: { type: "boolean" },
          reason_code: {
            type: "string",
            enum: ["github_auth_unavailable", "github_service_unavailable"],
          },
        },
      },
    ],
  },
} as const;

type LessonService = Pick<LessonSubmissionService, "submit">;

export const LESSON_ACTION_PATH = "/actions/lessons" as const;

export const LESSON_ACTION_JSON_CONTENT_TYPE_ERROR = Object.freeze({
  error: {
    code: "action_json_content_type_required",
    retryable: false,
  },
});

/** Creates the only write-capable Action route; it is never registered as MCP. */
export function createLessonActionRoute(service: LessonService): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: LESSON_ACTION_PATH,
    operationId: "submit_lesson_candidate",
    summary: "Submit an anonymized AskRigor lesson candidate",
    description: "Submit a separately consented, generalized AskRigor correction for private human review. Never send raw chat, user identity, personal case details, uploads, or credentials.",
    consequential: true,
    public: false,
    requestSchema: LESSON_ACTION_REQUEST_SCHEMA,
    responseSchemas: LESSON_ACTION_RESPONSE_SCHEMAS,
    responseHeaders: {
      429: {
        "Retry-After": {
          required: true,
          description: "Seconds until the Action request may be retried.",
          schema: { type: "integer", minimum: 1 },
        },
      },
    } as const,
    async handle({ request, body }: ActionRequestContext) {
      if (!isLessonActionJsonContentType(request.headers["content-type"])) {
        return {
          status: 415,
          body: LESSON_ACTION_JSON_CONTENT_TYPE_ERROR,
        };
      }

      try {
        const parsed = lessonSubmissionResultSchema.safeParse(await service.submit(body));
        if (!parsed.success) return unavailableResult();
        return resultToActionResponse(parsed.data);
      } catch {
        return unavailableResult();
      }
    },
  });
}

function resultToActionResponse(result: LessonSubmissionResult) {
  switch (result.status) {
    case "submitted":
    case "existing_candidate":
      return { status: 200, body: result };
    case "privacy_rejected":
      return { status: 422, body: result };
    case "rate_limited":
      return {
        status: 429,
        headers: { "Retry-After": String(result.retry_after_seconds) },
        body: result,
      };
    case "anonymizer_unavailable":
    case "github_unavailable":
      return { status: 503, body: result };
  }
}

function unavailableResult() {
  return {
    status: 503,
    body: lessonSubmissionResultSchema.parse({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_service_unavailable",
    }),
  };
}

export function isLessonActionJsonContentType(value: string | undefined): boolean {
  return typeof value === "string" &&
    /^application\/json(?:[\t ]*;[\t ]*charset[\t ]*=[\t ]*(?:utf-8|"utf-8"))?[\t ]*$/iu.test(value);
}
