import type { ActionRequestContext, ActionRoute } from "../actions/types.js";
import {
  LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION,
  LESSON_INCIDENT_ROUTE_MAX_BYTES,
  lessonIncidentCaptureRequestSchema,
  lessonIncidentProvenanceSchema,
  type LessonIncidentProvenance,
} from "./incident-contracts.js";
import type { LessonIncidentVault } from "./file-incident-vault.js";

export const LESSON_INCIDENT_ACTION_PATH = "/actions/lesson-incidents" as const;
export const LESSON_INCIDENT_ACTION_OPERATION_ID =
  "preserve_lesson_incident" as const;

const preservationStatusSchema = {
  type: "string",
  enum: [
    "EXACT_TRANSCRIPT_PRESERVED",
    "PARTIAL_TRANSCRIPT_PRESERVED",
    "LESSON_ONLY_NO_TRANSCRIPT",
    "RAW_INCIDENT_NOT_PRESERVED",
  ],
} as const;

const sha256Schema = { type: "string", pattern: "^[a-f0-9]{64}$" } as const;
const opaqueIdSchema = { type: "string", pattern: "^[A-Za-z0-9_-]{16,96}$" } as const;
const incidentIdSchema = { type: "string", pattern: "^ali_[A-Za-z0-9_-]{16,96}$" } as const;

export const LESSON_INCIDENT_ACTION_REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "preservation_status",
    "window",
    "validated_defect",
  ],
  properties: {
    schema_version: { const: LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION },
    idempotency_key: opaqueIdSchema,
    preservation_status: preservationStatusSchema,
    source: {
      type: "object",
      additionalProperties: false,
      properties: {
        private_conversation_ref: { type: "string", minLength: 1, maxLength: 160 },
        askrigor_version: { type: "string", minLength: 1, maxLength: 160 },
        model: { type: "string", minLength: 1, maxLength: 160 },
        mode: { type: "string", minLength: 1, maxLength: 160 },
        protocol_identities: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: { type: "string", minLength: 1, maxLength: 160 },
              version: { type: "string", minLength: 1, maxLength: 160 },
              sha256: sha256Schema,
            },
          },
        },
      },
    },
    window: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "content_utf8", "sha256"],
        properties: {
          role: { type: "string", enum: ["user", "assistant"] },
          private_message_ref: { type: "string", minLength: 1, maxLength: 160 },
          timestamp: { type: "string", format: "date-time" },
          content_utf8: { type: "string", minLength: 1, maxLength: 24 * 1_024 },
          sha256: sha256Schema,
        },
      },
    },
    validated_defect: {
      type: "object",
      additionalProperties: false,
      required: [
        "category",
        "finding",
        "evidence_basis",
        "validated_at",
        "validator_provenance",
      ],
      properties: {
        category: { type: "string", minLength: 1, maxLength: 160 },
        finding: { type: "string", minLength: 1, maxLength: 1_200 },
        evidence_basis: { type: "string", minLength: 1, maxLength: 1_200 },
        validated_at: { type: "string", format: "date-time" },
        validator_provenance: { type: "string", minLength: 1, maxLength: 160 },
      },
    },
    generalized_lesson: {
      type: "object",
      additionalProperties: false,
      properties: {
        fingerprint: sha256Schema,
        candidate_id: { type: "string", pattern: "^ARL-[0-9]{4,}$" },
      },
    },
  },
} as const;

export const LESSON_INCIDENT_ACTION_RESPONSE_SCHEMAS = {
  200: {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "incident_id",
      "incident_sha256",
      "preservation_status",
      "retryable",
    ],
    properties: {
      status: { const: "preserved" },
      incident_id: incidentIdSchema,
      incident_sha256: sha256Schema,
      preservation_status: preservationStatusSchema,
      retryable: { const: false },
    },
  },
  422: {
    type: "object",
    additionalProperties: false,
    required: ["status", "retryable", "reason_code"],
    properties: {
      status: { const: "invalid_incident" },
      retryable: { const: false },
      reason_code: {
        type: "string",
        enum: ["invalid_input", "privacy_or_security_boundary"],
      },
    },
  },
  503: {
    type: "object",
    additionalProperties: false,
    required: ["status", "retryable", "reason_code"],
    properties: {
      status: { const: "incident_vault_unavailable" },
      retryable: { type: "boolean" },
      reason_code: { const: "storage_unavailable" },
    },
  },
} as const;

type LessonIncidentService = Pick<LessonIncidentVault, "capture">;

export function createLessonIncidentActionRoute(
  service: LessonIncidentService,
): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: LESSON_INCIDENT_ACTION_PATH,
    operationId: LESSON_INCIDENT_ACTION_OPERATION_ID,
    summary: "Privately preserve an exact AskRigor lesson incident",
    description: "Write the minimum exact validated lesson incident window to the owner-private encrypted incident vault and return only opaque provenance.",
    consequential: true,
    public: false,
    maximumRequestBytes: LESSON_INCIDENT_ROUTE_MAX_BYTES,
    requestSchema: LESSON_INCIDENT_ACTION_REQUEST_SCHEMA,
    responseSchemas: LESSON_INCIDENT_ACTION_RESPONSE_SCHEMAS,
    async handle({ body }: ActionRequestContext) {
      const parsedInput = lessonIncidentCaptureRequestSchema.safeParse(body);
      if (!parsedInput.success) return invalidIncident();
      try {
        const preserved = lessonIncidentProvenanceSchema.parse(
          service.capture(parsedInput.data),
        );
        return {
          status: 200,
          body: {
            status: "preserved",
            ...preserved,
            retryable: false,
          },
        };
      } catch {
        return {
          status: 503,
          body: {
            status: "incident_vault_unavailable",
            retryable: true,
            reason_code: "storage_unavailable",
          },
        };
      }
    },
  });
}

function invalidIncident() {
  return {
    status: 422,
    body: {
      status: "invalid_incident",
      retryable: false,
      reason_code: "invalid_input",
    },
  };
}
