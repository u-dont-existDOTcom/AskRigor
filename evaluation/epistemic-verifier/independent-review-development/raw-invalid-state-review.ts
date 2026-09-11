import { createHash } from "node:crypto";

import { z } from "zod";

import {
  EPISTEMIC_REPRESENTATION_DIMENSIONS,
  EPISTEMIC_REPRESENTATION_REVIEW_VERSION,
  epistemicRepresentationReviewSubmissionSchema,
  type EpistemicRepresentationReviewSubmission
} from "../../../apps/research-mcp/src/epistemic-representation-review.js";

export const RAW_INVALID_STATE_REVIEW_ENVELOPE_VERSION =
  "askrigor_epistemic_representation_raw_invalid_envelope_v0_1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const boundedText = (maximum: number) => z.string().min(1).max(maximum);
const shortText = z.string().trim().min(1).max(240);
const jsonValueSchema: z.ZodType<unknown> = z.json();

export const rawInvalidStateReviewEnvelopeSchema = z.object({
  package_version: z.literal(RAW_INVALID_STATE_REVIEW_ENVELOPE_VERSION),
  phase: z.literal("DEVELOPMENT_DISCOVERY"),
  source_packet: boundedText(100_000),
  source_sha256: sha256Schema,
  raw_candidate_state_json: jsonValueSchema,
  raw_state_sha256: sha256Schema,
  producer_session_id: shortText,
  required_dimensions: z.tuple(
    EPISTEMIC_REPRESENTATION_DIMENSIONS.map((dimension) => z.literal(dimension)) as [
      z.ZodLiteral<(typeof EPISTEMIC_REPRESENTATION_DIMENSIONS)[0]>,
      ...z.ZodLiteral<(typeof EPISTEMIC_REPRESENTATION_DIMENSIONS)[number]>[]
    ]
  )
}).strict();

export const rawInvalidStateReviewReceiptSchema = z.object({
  review_version: z.literal(EPISTEMIC_REPRESENTATION_REVIEW_VERSION),
  source_sha256: sha256Schema,
  raw_state_sha256: sha256Schema,
  producer_session_id: shortText,
  reviewer: z.object({
    session_id: shortText,
    model: shortText,
    mode: shortText,
    fresh_independent_session: z.literal(true)
  }).strict(),
  reviewed_at: z.string().datetime({ offset: true }),
  reviewer_independent: z.literal(true),
  status: z.enum(["pass", "block", "indeterminate"]),
  critical_representation: z.enum(["faithful", "defective", "uncertain"]),
  findings: epistemicRepresentationReviewSubmissionSchema.shape.findings,
  blockers: z.array(boundedText(2_000)).max(100),
  warnings: z.array(boundedText(2_000)).max(100)
}).strict();

export type RawInvalidStateReviewEnvelope = z.output<typeof rawInvalidStateReviewEnvelopeSchema>;

export function createRawInvalidStateReviewEnvelope(input: {
  source_packet: string;
  raw_candidate_state_bytes: string;
  producer_session_id: string;
}): RawInvalidStateReviewEnvelope {
  const sourcePacket = boundedText(100_000).parse(input.source_packet);
  let rawState: unknown;
  try {
    rawState = JSON.parse(input.raw_candidate_state_bytes);
  } catch {
    throw new Error("Raw candidate state is not valid JSON");
  }
  return rawInvalidStateReviewEnvelopeSchema.parse({
    package_version: RAW_INVALID_STATE_REVIEW_ENVELOPE_VERSION,
    phase: "DEVELOPMENT_DISCOVERY",
    source_packet: sourcePacket,
    source_sha256: sha256(sourcePacket),
    raw_candidate_state_json: rawState,
    raw_state_sha256: sha256(input.raw_candidate_state_bytes),
    producer_session_id: input.producer_session_id,
    required_dimensions: EPISTEMIC_REPRESENTATION_DIMENSIONS
  });
}

export function ingestRawInvalidStateRepresentationReview(
  rawEnvelope: unknown,
  rawSubmission: unknown
) {
  const envelope = rawInvalidStateReviewEnvelopeSchema.parse(rawEnvelope);
  const submission = epistemicRepresentationReviewSubmissionSchema.parse(rawSubmission);
  if (submission.source_sha256 !== envelope.source_sha256) {
    throw new Error("Raw-state review is bound to a different source packet");
  }
  if (submission.state_sha256 !== envelope.raw_state_sha256) {
    throw new Error("Raw-state review is bound to different raw state bytes");
  }
  if (submission.producer_session_id !== envelope.producer_session_id) {
    throw new Error("Raw-state review names a different producer session");
  }
  if (submission.reviewer.session_id === envelope.producer_session_id) {
    throw new Error("Raw-state review must use a fresh session independent of the producer");
  }
  const dimensions = new Set<string>();
  for (const finding of submission.findings) {
    if (dimensions.has(finding.dimension)) throw new Error(`Duplicate representation finding for ${finding.dimension}`);
    dimensions.add(finding.dimension);
    if (finding.status === "not_applicable") {
      if (finding.affects_hard_invariant || finding.source_spans.length || finding.state_paths.length) {
        throw new Error(`${finding.dimension}: invalid not_applicable evidence`);
      }
      continue;
    }
    if (finding.source_spans.length === 0) throw new Error(`${finding.dimension}: applicable findings require exact source evidence`);
    for (const item of finding.source_spans) {
      if (item.end <= item.start || item.end > envelope.source_packet.length || envelope.source_packet.slice(item.start, item.end) !== item.quote) {
        throw new Error(`${finding.dimension}: source span does not match the frozen source packet`);
      }
    }
    if (finding.status === "missing") {
      if (finding.state_paths.length) throw new Error(`${finding.dimension}: a missing finding cannot cite a present state path`);
      continue;
    }
    if (["faithful", "distorted"].includes(finding.status) && finding.state_paths.length === 0) {
      throw new Error(`${finding.dimension}: ${finding.status} findings require state evidence`);
    }
    for (const pointer of finding.state_paths) {
      if (!jsonPointerExists(envelope.raw_candidate_state_json, pointer)) {
        throw new Error(`${finding.dimension}: state path ${pointer} does not resolve`);
      }
    }
  }
  for (const dimension of EPISTEMIC_REPRESENTATION_DIMENSIONS) {
    if (!dimensions.has(dimension)) throw new Error(`Missing representation finding for ${dimension}`);
  }
  const target = submission.findings.find(({ dimension }) => dimension === "exact_target")!;
  if (target.status === "not_applicable") throw new Error("The exact target is always applicable to a raw-state review");
  const defects = submission.findings.filter((finding) => finding.affects_hard_invariant && ["missing", "distorted"].includes(finding.status));
  const uncertainty = submission.findings.filter((finding) => finding.affects_hard_invariant && finding.status === "uncertain");
  const warnings = submission.findings.filter((finding) => !finding.affects_hard_invariant && ["missing", "distorted", "uncertain"].includes(finding.status));
  const status = defects.length ? "block" : uncertainty.length ? "indeterminate" : "pass";
  return rawInvalidStateReviewReceiptSchema.parse({
    review_version: EPISTEMIC_REPRESENTATION_REVIEW_VERSION,
    source_sha256: envelope.source_sha256,
    raw_state_sha256: envelope.raw_state_sha256,
    producer_session_id: submission.producer_session_id,
    reviewer: submission.reviewer,
    reviewed_at: submission.reviewed_at,
    reviewer_independent: true,
    status,
    critical_representation: status === "pass" ? "faithful" : status === "block" ? "defective" : "uncertain",
    findings: submission.findings,
    blockers: [...defects, ...uncertainty].map((finding) => `${finding.dimension}: ${finding.rationale}`),
    warnings: warnings.map((finding) => `${finding.dimension}: ${finding.rationale}`)
  });
}

function jsonPointerExists(value: unknown, pointer: string): boolean {
  let current = value;
  for (const raw of pointer.slice(1).split("/")) {
    const token = raw.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (Array.isArray(current)) {
      if (!/^\d+$/u.test(token) || Number(token) >= current.length) return false;
      current = current[Number(token)];
    } else if (current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, token)) {
      current = (current as Record<string, unknown>)[token];
    } else {
      return false;
    }
  }
  return true;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

