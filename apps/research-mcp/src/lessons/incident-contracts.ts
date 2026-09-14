import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

export const LESSON_INCIDENT_SCHEMA_VERSION =
  "askrigor_lesson_incident_evidence_v1" as const;

export const LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION =
  "askrigor_lesson_incident_capture_v1" as const;

export const LESSON_INCIDENT_ROUTE_MAX_BYTES = 128 * 1_024;
export const LESSON_INCIDENT_MAX_MESSAGES = 12;
export const LESSON_INCIDENT_MAX_MESSAGE_BYTES = 24 * 1_024;
export const LESSON_INCIDENT_MAX_RECORD_BYTES = 128 * 1_024;

export const lessonIncidentPreservationStatusSchema = z.enum([
  "EXACT_TRANSCRIPT_PRESERVED",
  "PARTIAL_TRANSCRIPT_PRESERVED",
  "LESSON_ONLY_NO_TRANSCRIPT",
  "RAW_INCIDENT_NOT_PRESERVED",
]);

export type LessonIncidentPreservationStatus =
  z.infer<typeof lessonIncidentPreservationStatusSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const opaqueIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,96}$/u);
const optionalOpaqueRefSchema = z.string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._:@/-]+$/u)
  .refine((value) => !value.includes("..") && !value.startsWith("/"));
const safeShortStringSchema = z.string().min(1).max(160).refine(noUnsafeString);
const canonicalTimestampSchema = z.string().datetime({ offset: true });

export const lessonIncidentProvenanceSchema = z.strictObject({
  incident_id: opaqueIdSchema,
  incident_sha256: sha256Schema,
  preservation_status: lessonIncidentPreservationStatusSchema,
});

export type LessonIncidentProvenance =
  z.infer<typeof lessonIncidentProvenanceSchema>;

export const lessonIncidentProtocolIdentitySchema = z.strictObject({
  name: safeShortStringSchema,
  version: safeShortStringSchema.optional(),
  sha256: sha256Schema.optional(),
});

const sourceSchema = z.strictObject({
  private_conversation_ref: optionalOpaqueRefSchema.optional(),
  askrigor_version: safeShortStringSchema.optional(),
  model: safeShortStringSchema.optional(),
  mode: safeShortStringSchema.optional(),
  protocol_identities: z.array(lessonIncidentProtocolIdentitySchema).max(6).optional(),
});

const messageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  private_message_ref: optionalOpaqueRefSchema.optional(),
  timestamp: canonicalTimestampSchema.optional(),
  content_utf8: z.string().min(1).superRefine((value, context) => {
    if (!noUnsafeString(value)) {
      context.addIssue({ code: "custom", message: "Message text is not valid UTF-8 content" });
      return;
    }
    if (Buffer.byteLength(value, "utf8") > LESSON_INCIDENT_MAX_MESSAGE_BYTES) {
      context.addIssue({ code: "custom", message: "Message text exceeds the per-message limit" });
    }
  }),
  sha256: sha256Schema,
});

const validatedDefectSchema = z.strictObject({
  category: safeShortStringSchema,
  finding: z.string().min(1).max(1_200).refine(noUnsafeString),
  evidence_basis: z.string().min(1).max(1_200).refine(noUnsafeString),
  validated_at: canonicalTimestampSchema,
  validator_provenance: safeShortStringSchema,
});

const generalizedLessonSchema = z.strictObject({
  fingerprint: sha256Schema.optional(),
  candidate_id: z.string().regex(/^ARL-[0-9]{4,}$/u).optional(),
});

export const lessonIncidentCaptureRequestSchema = z.strictObject({
  schema_version: z.literal(LESSON_INCIDENT_CAPTURE_SCHEMA_VERSION),
  idempotency_key: opaqueIdSchema.optional(),
  preservation_status: lessonIncidentPreservationStatusSchema,
  source: sourceSchema.optional(),
  window: z.array(messageSchema).min(1).max(LESSON_INCIDENT_MAX_MESSAGES),
  validated_defect: validatedDefectSchema,
  generalized_lesson: generalizedLessonSchema.optional(),
}).superRefine((value, context) => {
  for (const [index, message] of value.window.entries()) {
    const digest = sha256Bytes(Buffer.from(message.content_utf8, "utf8"));
    if (digest !== message.sha256) {
      context.addIssue({
        code: "custom",
        path: ["window", index, "sha256"],
        message: "Message digest does not match exact UTF-8 bytes",
      });
    }
  }
  if (
    value.preservation_status === "EXACT_TRANSCRIPT_PRESERVED" &&
    !hasMinimumExactFailureWindow(value.window)
  ) {
    context.addIssue({
      code: "custom",
      path: ["preservation_status"],
      message: "Exact preservation requires an exact user prompt, assistant failure, and user correction window",
    });
  }
});

export type LessonIncidentCaptureRequest =
  z.infer<typeof lessonIncidentCaptureRequestSchema>;

export const lessonIncidentEvidenceSchema = z.strictObject({
  schema_version: z.literal(LESSON_INCIDENT_SCHEMA_VERSION),
  incident_id: opaqueIdSchema,
  captured_at: canonicalTimestampSchema,
  preservation_status: lessonIncidentPreservationStatusSchema,
  source: sourceSchema.optional(),
  window: z.array(messageSchema).min(1).max(LESSON_INCIDENT_MAX_MESSAGES),
  validated_defect: validatedDefectSchema,
  generalized_lesson: generalizedLessonSchema.optional(),
  incident_sha256: sha256Schema,
}).superRefine((value, context) => {
  const withoutDigest = { ...value, incident_sha256: undefined };
  delete withoutDigest.incident_sha256;
  const digest = digestCanonicalJson(withoutDigest);
  if (value.incident_sha256 !== digest) {
    context.addIssue({
      code: "custom",
      path: ["incident_sha256"],
      message: "Incident digest does not match canonical record",
    });
  }
});

export type LessonIncidentEvidence =
  z.infer<typeof lessonIncidentEvidenceSchema>;

export function createLessonIncidentEvidence(
  raw: unknown,
  options: {
    now?: () => Date;
    createIncidentId?: () => string;
  } = {},
): LessonIncidentEvidence {
  const request = lessonIncidentCaptureRequestSchema.parse(raw);
  const now = options.now ?? (() => new Date());
  const capturedAt = canonicalTimestamp(now());
  const incidentId = options.createIncidentId?.() ?? randomIncidentId();
  const withoutDigest = {
    schema_version: LESSON_INCIDENT_SCHEMA_VERSION,
    incident_id: opaqueIdSchema.parse(incidentId),
    captured_at: capturedAt,
    preservation_status: request.preservation_status,
    ...(request.source === undefined ? {} : { source: request.source }),
    window: request.window,
    validated_defect: request.validated_defect,
    ...(request.generalized_lesson === undefined
      ? {}
      : { generalized_lesson: request.generalized_lesson }),
  };
  return lessonIncidentEvidenceSchema.parse({
    ...withoutDigest,
    incident_sha256: digestCanonicalJson(withoutDigest),
  });
}

export function lessonIncidentBytes(record: LessonIncidentEvidence): Buffer {
  const parsed = lessonIncidentEvidenceSchema.parse(record);
  return Buffer.from(`${canonicalJson(parsed)}\n`, "utf8");
}

export function digestCanonicalJson(value: unknown): string {
  return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) =>
      `${JSON.stringify(key)}:${canonicalJson(child)}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function messageSha256(content: string): string {
  if (!noUnsafeString(content)) {
    throw new Error("Lesson incident message is not valid UTF-8 content");
  }
  return sha256Bytes(Buffer.from(content, "utf8"));
}

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTimestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Lesson incident clock is invalid");
  }
  return value.toISOString();
}

function randomIncidentId(): string {
  return `ali_${randomUUID().replace(/-/gu, "")}`;
}

function hasMinimumExactFailureWindow(
  window: readonly { role: string; content_utf8: string }[],
): boolean {
  for (let index = 1; index < window.length - 1; index += 1) {
    if (
      window[index - 1]?.role === "user" &&
      window[index]?.role === "assistant" &&
      window[index + 1]?.role === "user"
    ) {
      return true;
    }
  }
  return false;
}

function noUnsafeString(value: string): boolean {
  return !/[\uD800-\uDFFF]/u.test(value) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}