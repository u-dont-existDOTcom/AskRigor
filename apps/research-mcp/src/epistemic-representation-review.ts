import { createHash } from "node:crypto";

import { z } from "zod";

import {
  epistemicStateV1Schema,
  type EpistemicStateV1
} from "./epistemic-verifier.js";

export const EPISTEMIC_REPRESENTATION_REVIEW_VERSION =
  "askrigor_epistemic_representation_review_v0_1" as const;
export const EPISTEMIC_REPRESENTATION_WORK_PACKAGE_VERSION =
  "askrigor_epistemic_representation_work_package_v0_1" as const;

export const EPISTEMIC_REPRESENTATION_DIMENSIONS = [
  "exact_target",
  "case_and_comparison_roles",
  "negative_or_tolerated_comparator",
  "high_information_qualifier",
  "timing",
  "amount_or_dose",
  "route_or_form",
  "feature_value",
  "predicate_semantics",
  "dependency_or_provenance",
  "other"
] as const;

const boundedText = (maximum: number) => z.string().min(1).max(maximum);
const shortText = z.string().trim().min(1).max(240);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const representationDimensionSchema = z.enum(EPISTEMIC_REPRESENTATION_DIMENSIONS);
const representationStatusSchema = z.enum([
  "faithful",
  "missing",
  "distorted",
  "uncertain",
  "not_applicable"
]);

const executionIdentitySchema = z.object({
  session_id: shortText,
  model: shortText,
  mode: shortText
}).strict();

const comparisonReviewViewSchema = z.object({
  comparison_id: shortText,
  positive_case_ids: z.array(shortText).max(100),
  control_case_ids: z.array(shortText).max(100)
}).strict();

const discriminatorReviewViewSchema = z.object({
  hypothesis_id: shortText,
  feature_id: shortText,
  operator: z.enum([
    "present",
    "absent",
    "equals",
    "not_equals",
    "gt",
    "gte",
    "lt",
    "lte"
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  assignments: z.array(z.object({
    case_id: shortText,
    comparison_role: z.enum([
      "positive",
      "tolerated_control",
      "negative_control",
      "unknown"
    ]),
    value: z.union([z.string(), z.number(), z.boolean()])
  }).strict()).max(200)
}).strict();

export const epistemicRepresentationReviewWorkPackageSchema = z.object({
  package_version: z.literal(EPISTEMIC_REPRESENTATION_WORK_PACKAGE_VERSION),
  phase: z.literal("DEVELOPMENT_DISCOVERY"),
  source_packet: boundedText(100_000),
  source_sha256: sha256Schema,
  candidate_state: epistemicStateV1Schema,
  state_sha256: sha256Schema,
  producer: executionIdentitySchema,
  required_dimensions: z.tuple(
    EPISTEMIC_REPRESENTATION_DIMENSIONS.map((dimension) => z.literal(dimension)) as [
      z.ZodLiteral<(typeof EPISTEMIC_REPRESENTATION_DIMENSIONS)[0]>,
      ...z.ZodLiteral<(typeof EPISTEMIC_REPRESENTATION_DIMENSIONS)[number]>[]
    ]
  ),
  comparison_views: z.array(comparisonReviewViewSchema).max(100),
  discriminator_views: z.array(discriminatorReviewViewSchema).max(100)
}).strict();

const sourceSpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: boundedText(2_000)
}).strict();

const representationFindingSchema = z.object({
  dimension: representationDimensionSchema,
  status: representationStatusSchema,
  affects_hard_invariant: z.boolean(),
  source_spans: z.array(sourceSpanSchema).max(20),
  state_paths: z.array(z.string().regex(/^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*/u)).max(30),
  rationale: boundedText(2_000)
}).strict();

export const epistemicRepresentationReviewSubmissionSchema = z.object({
  review_version: z.literal(EPISTEMIC_REPRESENTATION_REVIEW_VERSION),
  source_sha256: sha256Schema,
  state_sha256: sha256Schema,
  producer_session_id: shortText,
  reviewer: executionIdentitySchema.extend({
    fresh_independent_session: z.literal(true)
  }).strict(),
  reviewed_at: z.string().datetime({ offset: true }),
  findings: z.array(representationFindingSchema)
    .length(EPISTEMIC_REPRESENTATION_DIMENSIONS.length)
}).strict();

export const epistemicRepresentationReviewReceiptSchema = z.object({
  review_version: z.literal(EPISTEMIC_REPRESENTATION_REVIEW_VERSION),
  source_sha256: sha256Schema,
  state_sha256: sha256Schema,
  producer_session_id: shortText,
  reviewer: executionIdentitySchema.extend({
    fresh_independent_session: z.literal(true)
  }).strict(),
  reviewed_at: z.string().datetime({ offset: true }),
  reviewer_independent: z.literal(true),
  status: z.enum(["pass", "block", "indeterminate"]),
  critical_representation: z.enum(["faithful", "defective", "uncertain"]),
  findings: z.array(representationFindingSchema)
    .length(EPISTEMIC_REPRESENTATION_DIMENSIONS.length),
  blockers: z.array(boundedText(2_000)).max(100),
  warnings: z.array(boundedText(2_000)).max(100)
}).strict();

export type EpistemicRepresentationReviewWorkPackage = z.output<
  typeof epistemicRepresentationReviewWorkPackageSchema
>;
export type EpistemicRepresentationReviewSubmission = z.output<
  typeof epistemicRepresentationReviewSubmissionSchema
>;
export type EpistemicRepresentationReviewReceipt = z.output<
  typeof epistemicRepresentationReviewReceiptSchema
>;

/**
 * Creates an evaluation-only review packet containing the exact source and
 * candidate state. It deliberately accepts no producer rationale or scorer
 * expectation. The derived views make comparison and predicate mistakes
 * inspectable without changing the deterministic verifier.
 */
export function createEpistemicRepresentationReviewWorkPackage(input: {
  source_packet: string;
  candidate_state: unknown;
  producer: z.input<typeof executionIdentitySchema>;
}): EpistemicRepresentationReviewWorkPackage {
  const sourcePacket = boundedText(100_000).parse(input.source_packet);
  const candidateState = epistemicStateV1Schema.parse(input.candidate_state);
  const producer = executionIdentitySchema.parse(input.producer);
  const caseRoles = new Map(candidateState.cases.map((item) => [
    item.case_id,
    item.comparison_role
  ]));

  return epistemicRepresentationReviewWorkPackageSchema.parse({
    package_version: EPISTEMIC_REPRESENTATION_WORK_PACKAGE_VERSION,
    phase: "DEVELOPMENT_DISCOVERY",
    source_packet: sourcePacket,
    source_sha256: sha256(sourcePacket),
    candidate_state: candidateState,
    state_sha256: stateSha256(candidateState),
    producer,
    required_dimensions: EPISTEMIC_REPRESENTATION_DIMENSIONS,
    comparison_views: candidateState.comparisons.map((comparison) => ({
      comparison_id: comparison.comparison_id,
      positive_case_ids: comparison.positive_case_ids,
      control_case_ids: comparison.control_case_ids
    })),
    discriminator_views: candidateState.hypotheses.map((hypothesis) => ({
      hypothesis_id: hypothesis.hypothesis_id,
      feature_id: hypothesis.discriminator.feature_id,
      operator: hypothesis.discriminator.operator,
      ...(hypothesis.discriminator.value === undefined
        ? {}
        : { value: hypothesis.discriminator.value }),
      assignments: candidateState.features
        .filter(({ feature_id }) => feature_id === hypothesis.discriminator.feature_id)
        .map((feature) => ({
          case_id: feature.case_id,
          comparison_role: caseRoles.get(feature.case_id) ?? "unknown",
          value: feature.value
        }))
    }))
  });
}

/**
 * Binds an independent semantic review to the exact source and exact state.
 * The reviewer supplies semantic judgments; this function enforces identity,
 * completeness, evidence spans, state pointers, and fail-closed disposition.
 */
export function ingestEpistemicRepresentationReview(
  rawWorkPackage: unknown,
  rawSubmission: unknown
): EpistemicRepresentationReviewReceipt {
  const workPackage = epistemicRepresentationReviewWorkPackageSchema.parse(rawWorkPackage);
  const submission = epistemicRepresentationReviewSubmissionSchema.parse(rawSubmission);

  if (submission.source_sha256 !== workPackage.source_sha256) {
    throw new Error("Representation review is bound to a different source packet");
  }
  if (submission.state_sha256 !== workPackage.state_sha256) {
    throw new Error("Representation review is bound to a different candidate state");
  }
  if (submission.producer_session_id !== workPackage.producer.session_id) {
    throw new Error("Representation review names a different producer session");
  }
  if (submission.reviewer.session_id === workPackage.producer.session_id) {
    throw new Error("Representation review must use a fresh session independent of the producer");
  }

  const byDimension = new Map<string, z.output<typeof representationFindingSchema>>();
  for (const finding of submission.findings) {
    if (byDimension.has(finding.dimension)) {
      throw new Error(`Duplicate representation finding for ${finding.dimension}`);
    }
    byDimension.set(finding.dimension, finding);
    validateFindingEvidence(finding, workPackage);
  }
  for (const dimension of EPISTEMIC_REPRESENTATION_DIMENSIONS) {
    if (!byDimension.has(dimension)) {
      throw new Error(`Missing representation finding for ${dimension}`);
    }
  }
  const targetFinding = byDimension.get("exact_target")!;
  if (targetFinding.status === "not_applicable") {
    throw new Error("The exact target is always applicable to an EpistemicStateV1 review");
  }

  const orderedFindings = EPISTEMIC_REPRESENTATION_DIMENSIONS.map((dimension) =>
    byDimension.get(dimension)!
  );
  const criticalDefects = orderedFindings.filter((finding) =>
    finding.affects_hard_invariant && ["missing", "distorted"].includes(finding.status)
  );
  const criticalUncertainty = orderedFindings.filter((finding) =>
    finding.affects_hard_invariant && finding.status === "uncertain"
  );
  const noncriticalProblems = orderedFindings.filter((finding) =>
    !finding.affects_hard_invariant && ["missing", "distorted", "uncertain"].includes(finding.status)
  );
  const status = criticalDefects.length > 0
    ? "block" as const
    : criticalUncertainty.length > 0
      ? "indeterminate" as const
      : "pass" as const;

  return epistemicRepresentationReviewReceiptSchema.parse({
    review_version: EPISTEMIC_REPRESENTATION_REVIEW_VERSION,
    source_sha256: workPackage.source_sha256,
    state_sha256: workPackage.state_sha256,
    producer_session_id: submission.producer_session_id,
    reviewer: submission.reviewer,
    reviewed_at: submission.reviewed_at,
    reviewer_independent: true,
    status,
    critical_representation: status === "pass"
      ? "faithful"
      : status === "block"
        ? "defective"
        : "uncertain",
    findings: orderedFindings,
    blockers: [...criticalDefects, ...criticalUncertainty].map((finding) =>
      `${finding.dimension}: ${finding.rationale}`
    ),
    warnings: noncriticalProblems.map((finding) =>
      `${finding.dimension}: ${finding.rationale}`
    )
  });
}

function validateFindingEvidence(
  finding: z.output<typeof representationFindingSchema>,
  workPackage: EpistemicRepresentationReviewWorkPackage
): void {
  if (finding.status === "not_applicable") {
    if (finding.affects_hard_invariant) {
      throw new Error(`${finding.dimension}: not_applicable cannot affect a hard invariant`);
    }
    if (finding.source_spans.length > 0 || finding.state_paths.length > 0) {
      throw new Error(`${finding.dimension}: not_applicable must not cite source or state evidence`);
    }
    return;
  }
  if (finding.source_spans.length === 0) {
    throw new Error(`${finding.dimension}: applicable findings require exact source evidence`);
  }
  for (const span of finding.source_spans) {
    if (
      span.end <= span.start ||
      span.end > workPackage.source_packet.length ||
      workPackage.source_packet.slice(span.start, span.end) !== span.quote
    ) {
      throw new Error(`${finding.dimension}: source span does not match the frozen source packet`);
    }
  }
  if (finding.status === "missing") {
    if (finding.state_paths.length > 0) {
      throw new Error(`${finding.dimension}: a missing finding cannot cite a present state path`);
    }
    return;
  }
  if (["faithful", "distorted"].includes(finding.status) && finding.state_paths.length === 0) {
    throw new Error(`${finding.dimension}: ${finding.status} findings require state evidence`);
  }
  for (const pointer of finding.state_paths) {
    if (!jsonPointerExists(workPackage.candidate_state, pointer)) {
      throw new Error(`${finding.dimension}: state path ${pointer} does not resolve`);
    }
  }
}

function jsonPointerExists(value: unknown, pointer: string): boolean {
  let current = value;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (Array.isArray(current)) {
      if (!/^\d+$/u.test(token)) return false;
      const index = Number(token);
      if (index >= current.length) return false;
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(current, token)) return false;
    current = (current as Record<string, unknown>)[token];
  }
  return true;
}

function stateSha256(state: EpistemicStateV1): string {
  return sha256(JSON.stringify(epistemicStateV1Schema.parse(state)));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
