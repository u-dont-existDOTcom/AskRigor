import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_SHORT_TEXT = 200;
const MAX_MEDIUM_TEXT = 2_000;
const MAX_LONG_TEXT = 8_000;
const MAX_AUDIT_EVENTS = 1_000;
const PROBABILITY_TOLERANCE = 1e-9;
const LOG_SCORE_EPSILON = 1e-15;

const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const boundedShortTextSchema = z.string().trim().min(1).max(MAX_SHORT_TEXT);
const boundedMediumTextSchema = z.string().trim().min(1).max(MAX_MEDIUM_TEXT);
const boundedLongTextSchema = z.string().trim().min(1).max(MAX_LONG_TEXT);

export const predictionTypeSchema = z.enum([
  "STUDY_OUTCOME",
  "EFFECT_DIRECTION",
  "EFFECT_MAGNITUDE_RANGE",
  "REPLICATION_SUCCESS",
  "FINDING_UPDATE",
  "METHOD_AUDIT",
  "TREATMENT_RANKING",
  "RESEARCH_QUESTION_RESOLUTION",
]);

export const predictorCohortSchema = z.enum([
  "PUBLIC",
  "PATIENT",
  "CLINICIAN",
  "RESEARCHER",
  "METHODS_EXPERT",
  "MODEL",
  "ASKRIGOR",
]);

export const predictionMetricSchema = z.enum([
  "BRIER",
  "LOG",
  "INTERVAL",
  "RANK",
  "CALIBRATION_ONLY",
]);

export const predictionSecondaryMetricSchema = z.enum([
  "BRIER",
  "LOG",
  "INTERVAL",
  "RANK",
  "CALIBRATION",
  "ABSOLUTE_ERROR",
]);

const predictionScopeSchema = z
  .object({
    population: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    intervention_or_exposure: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    comparator: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    outcome: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    horizon: z.string().max(1_000).nullable().optional(),
    setting: z.string().max(1_000).nullable().optional(),
  })
  .strict();

const predictionResolutionRuleSchema = z
  .object({
    rule_version: boundedShortTextSchema,
    authoritative_source_type: z.enum([
      "PUBLICATION",
      "REGISTRY_RESULT",
      "ASKRIGOR_AUDIT",
      "ASKRIGOR_FINDING_VERSION",
      "DEFINED_EVENT",
      "ADJUDICATED",
    ]),
    authoritative_source_identifier: z.string().max(500).nullable().optional(),
    outcome_mapping: z.string().min(1).max(4_000),
    ambiguity_policy: z.enum(["INVALIDATE", "PREDECLARED_ADJUDICATION", "PARTIAL_CREDIT"]),
  })
  .strict();

const predictionScoringRuleSchema = z
  .object({
    rule_version: boundedShortTextSchema,
    primary_metric: predictionMetricSchema,
    secondary_metrics: z.array(predictionSecondaryMetricSchema).max(8).default([]),
  })
  .strict();

export const predictionQuestionSchema = z
  .object({
    question_id: z.string().regex(/^ARQ-[A-Z0-9_-]{8,64}$/u),
    question_version: z.number().int().min(1),
    prediction_type: predictionTypeSchema,
    prompt: z.string().trim().min(10).max(4_000),
    scope: predictionScopeSchema,
    hidden_source_ref: z.string().max(500).nullable().optional(),
    hidden_source_commitment_sha256: sha256Schema.nullable().optional(),
    opens_at: timestampSchema,
    closes_at: timestampSchema,
    scheduled_reveal_at: timestampSchema.nullable().optional(),
    answer_visibility: z.enum(["HIDDEN_UNTIL_SUBMISSION", "HIDDEN_UNTIL_CLOSE", "FUTURE_EVENT"]),
    eligible_cohorts: z.array(predictorCohortSchema).max(7).default([]),
    resolution_rule: predictionResolutionRuleSchema,
    scoring_rule: predictionScoringRuleSchema,
    question_payload_sha256: sha256Schema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const opensAt = Date.parse(value.opens_at);
    const closesAt = Date.parse(value.closes_at);
    if (!(opensAt < closesAt)) {
      context.addIssue({
        code: "custom",
        path: ["closes_at"],
        message: "Prediction question must close after it opens",
      });
    }
    if (value.scheduled_reveal_at !== null && value.scheduled_reveal_at !== undefined) {
      const revealAt = Date.parse(value.scheduled_reveal_at);
      if (revealAt < closesAt) {
        context.addIssue({
          code: "custom",
          path: ["scheduled_reveal_at"],
          message: "Scheduled reveal must not precede question close",
        });
      }
    }
  });

const categoricalProbabilitySchema = z
  .object({
    label: boundedShortTextSchema,
    probability: z.number().min(0).max(1),
  })
  .strict();

export const predictionForecastSchema = z
  .object({
    forecast_format: z.enum([
      "CATEGORICAL_PROBABILITIES",
      "BINARY_PROBABILITY",
      "NUMERIC_DISTRIBUTION",
      "INTERVAL",
      "RANKING",
    ]),
    categorical_probabilities: z.array(categoricalProbabilitySchema).min(2).max(20).nullable().optional(),
    binary_probability_true: z.number().min(0).max(1).nullable().optional(),
    point_estimate: z.number().finite().nullable().optional(),
    lower_bound: z.number().finite().nullable().optional(),
    upper_bound: z.number().finite().nullable().optional(),
    interval_coverage_probability: z.number().gt(0).lt(1).nullable().optional(),
    unit: z.string().max(100).nullable().optional(),
    ranking: z.array(boundedShortTextSchema).min(2).max(50).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const has = (candidate: unknown): boolean => candidate !== null && candidate !== undefined;

    if (value.forecast_format === "CATEGORICAL_PROBABILITIES") {
      if (!has(value.categorical_probabilities)) {
        context.addIssue({ code: "custom", path: ["categorical_probabilities"], message: "Categorical probabilities are required" });
      } else {
        const labels = value.categorical_probabilities?.map((entry) => entry.label) ?? [];
        if (new Set(labels).size !== labels.length) {
          context.addIssue({ code: "custom", path: ["categorical_probabilities"], message: "Categorical labels must be unique" });
        }
        const total = value.categorical_probabilities?.reduce((sum, entry) => sum + entry.probability, 0) ?? 0;
        if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
          context.addIssue({ code: "custom", path: ["categorical_probabilities"], message: "Categorical probabilities must sum to one" });
        }
      }
    }

    if (value.forecast_format === "BINARY_PROBABILITY" && !has(value.binary_probability_true)) {
      context.addIssue({ code: "custom", path: ["binary_probability_true"], message: "Binary probability is required" });
    }

    if (value.forecast_format === "NUMERIC_DISTRIBUTION" && !has(value.point_estimate)) {
      context.addIssue({ code: "custom", path: ["point_estimate"], message: "Numeric point estimate is required" });
    }

    if (value.forecast_format === "INTERVAL") {
      if (!has(value.lower_bound) || !has(value.upper_bound) || !has(value.interval_coverage_probability)) {
        context.addIssue({ code: "custom", path: [], message: "Interval forecasts require lower, upper, and coverage probability" });
      } else if ((value.lower_bound as number) > (value.upper_bound as number)) {
        context.addIssue({ code: "custom", path: ["upper_bound"], message: "Interval upper bound must be at least the lower bound" });
      }
    }

    if (value.forecast_format === "RANKING") {
      if (!has(value.ranking)) {
        context.addIssue({ code: "custom", path: ["ranking"], message: "Ranking is required" });
      } else if (new Set(value.ranking ?? []).size !== (value.ranking ?? []).length) {
        context.addIssue({ code: "custom", path: ["ranking"], message: "Ranking entries must be unique" });
      }
    }
  });

export const predictionSubmissionSchema = z
  .object({
    predictor_id: z.string().regex(/^ARPRED-[A-Z0-9_-]{8,64}$/u),
    predictor_cohort: predictorCohortSchema,
    expertise_self_rating: z.number().int().min(0).max(5).nullable().optional(),
    familiarity_with_topic: z.number().int().min(0).max(5).nullable().optional(),
    submitted_at: timestampSchema,
    result_exposure_declaration: z.enum([
      "CONFIDENT_NOT_SEEN",
      "POSSIBLY_SEEN_OR_INFERRED",
      "SEEN_RESULT_INELIGIBLE_FOR_PRIMARY_SCORE",
      "UNKNOWN",
    ]),
    evidence_consulted_summary: z.string().max(4_000).nullable().optional(),
    rationale: z.string().max(MAX_LONG_TEXT).nullable().optional(),
    forecast: predictionForecastSchema,
    supersedes_prediction_id: z.string().regex(/^ARP-[A-Z0-9_-]{8,64}$/u).nullable().optional(),
    counts_for_scoring: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.result_exposure_declaration === "SEEN_RESULT_INELIGIBLE_FOR_PRIMARY_SCORE" &&
      value.counts_for_scoring
    ) {
      context.addIssue({
        code: "custom",
        path: ["counts_for_scoring"],
        message: "A predictor who has seen the result cannot count for primary scoring",
      });
    }
  });

export const predictionConsentSchema = z
  .object({
    aggregate_scoring: z.boolean(),
    public_pseudonymous_display: z.boolean(),
    research_use: z.boolean(),
    recontact: z.boolean().default(false),
    notice_version: boundedShortTextSchema,
    consented_at: timestampSchema,
  })
  .strict();

export const predictionLockSchema = z
  .object({
    canonical_payload_sha256: sha256Schema,
    locked_at: timestampSchema,
    immutable: z.literal(true),
    signing_key_id: z.string().max(100).nullable().optional(),
    signature: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
  })
  .strict();

export const predictionResolutionSchema = z
  .object({
    resolved_at: timestampSchema,
    source_identifier: z.string().trim().min(1).max(1_000),
    source_version_sha256: sha256Schema,
    resolved_outcome: z.unknown(),
    resolver_type: z.enum(["DETERMINISTIC", "HUMAN_ADJUDICATION", "MIXED"]),
    adjudication_rationale: z.string().max(MAX_LONG_TEXT).nullable().optional(),
    resolution_payload_sha256: sha256Schema,
  })
  .strict();

export const predictionScoreSchema = z
  .object({
    scored_at: timestampSchema,
    scoring_rule_version: boundedShortTextSchema,
    primary_metric: predictionMetricSchema,
    primary_value: z.number().finite().nullable(),
    secondary_values: z.record(z.string(), z.number().finite().nullable()),
    eligible_for_primary_analysis: z.boolean(),
    ineligibility_reason: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
    score_payload_sha256: sha256Schema,
  })
  .strict();

export const predictionAuditEventSchema = z
  .object({
    event_id: boundedShortTextSchema,
    event_type: z.enum([
      "QUESTION_CREATED",
      "QUESTION_AMENDED",
      "SUBMITTED",
      "LOCKED",
      "LEAK_FLAGGED",
      "RESOLVED",
      "SCORED",
      "INVALIDATED",
      "CANCELLED",
      "SUPERSEDED",
    ]),
    occurred_at: timestampSchema,
    actor_type: z.enum(["USER", "ASKRIGOR", "REVIEWER", "SYSTEM"]),
    payload_sha256: sha256Schema,
    public_note: z.string().max(MAX_MEDIUM_TEXT).nullable().optional(),
  })
  .strict();

export const publicPredictionRecordSchema = z
  .object({
    schema_version: z.literal("0.1.0"),
    prediction_id: z.string().regex(/^ARP-[A-Z0-9_-]{8,64}$/u),
    lifecycle_state: z.enum([
      "OPEN",
      "LOCKED",
      "REVEAL_PENDING",
      "RESOLVED",
      "INVALID_RESOLUTION",
      "CANCELLED",
      "SUPERSEDED",
    ]),
    question: predictionQuestionSchema,
    submission: predictionSubmissionSchema,
    lock: predictionLockSchema,
    consent: predictionConsentSchema,
    resolution: predictionResolutionSchema.nullable(),
    score: predictionScoreSchema.nullable(),
    audit_events: z.array(predictionAuditEventSchema).max(MAX_AUDIT_EVENTS).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.lifecycle_state === "RESOLVED" && (value.resolution === null || value.score === null)) {
      context.addIssue({ code: "custom", path: [], message: "Resolved predictions require resolution and score records" });
    }
    if (value.lifecycle_state !== "RESOLVED" && value.score !== null) {
      context.addIssue({ code: "custom", path: ["score"], message: "Only resolved predictions may have a score" });
    }
  });

export type PredictionQuestion = z.infer<typeof predictionQuestionSchema>;
export type PredictionForecast = z.infer<typeof predictionForecastSchema>;
export type PredictionSubmission = z.infer<typeof predictionSubmissionSchema>;
export type PredictionConsent = z.infer<typeof predictionConsentSchema>;
export type PredictionResolution = z.infer<typeof predictionResolutionSchema>;
export type PredictionScore = z.infer<typeof predictionScoreSchema>;
export type PublicPredictionRecord = z.infer<typeof publicPredictionRecordSchema>;

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not permit non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) {
        continue;
      }
      result[key] = canonicalize(child);
    }
    return result;
  }
  throw new TypeError(`Canonical JSON does not permit values of type ${typeof value}`);
}

export function canonicalPredictionJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function predictionSha256(value: unknown): string {
  return createHash("sha256").update(canonicalPredictionJson(value), "utf8").digest("hex");
}

function normalizeQuestion(question: PredictionQuestion): PredictionQuestion {
  const withoutHash = { ...question, question_payload_sha256: null };
  return predictionQuestionSchema.parse({
    ...withoutHash,
    question_payload_sha256: predictionSha256(withoutHash),
  });
}

function normalizeSubmission(submission: PredictionSubmission): PredictionSubmission {
  const seenResult = submission.result_exposure_declaration === "SEEN_RESULT_INELIGIBLE_FOR_PRIMARY_SCORE";
  return predictionSubmissionSchema.parse({
    ...submission,
    counts_for_scoring: seenResult ? false : submission.counts_for_scoring,
  });
}

export interface LockPredictionInput {
  prediction_id: string;
  question: PredictionQuestion;
  submission: PredictionSubmission;
  consent: PredictionConsent;
  locked_at?: string;
}

export function lockPrediction(input: LockPredictionInput): PublicPredictionRecord {
  const question = normalizeQuestion(predictionQuestionSchema.parse(input.question));
  const submission = normalizeSubmission(predictionSubmissionSchema.parse(input.submission));
  const consent = predictionConsentSchema.parse(input.consent);
  const submittedAt = Date.parse(submission.submitted_at);
  if (submittedAt < Date.parse(question.opens_at) || submittedAt > Date.parse(question.closes_at)) {
    throw new RangeError("Prediction submission timestamp is outside the question window");
  }
  if (question.eligible_cohorts.length > 0 && !question.eligible_cohorts.includes(submission.predictor_cohort)) {
    throw new RangeError("Predictor cohort is not eligible for this question");
  }

  const lockedAt = input.locked_at ?? submission.submitted_at;
  if (Date.parse(lockedAt) < submittedAt || Date.parse(lockedAt) > Date.parse(question.closes_at)) {
    throw new RangeError("Prediction lock timestamp must be between submission and question close");
  }

  const payload = {
    schema_version: "0.1.0" as const,
    prediction_id: input.prediction_id,
    question,
    submission,
    consent,
  };
  const payloadHash = predictionSha256(payload);

  return publicPredictionRecordSchema.parse({
    ...payload,
    lifecycle_state: "LOCKED",
    lock: {
      canonical_payload_sha256: payloadHash,
      locked_at: lockedAt,
      immutable: true,
      signing_key_id: null,
      signature: null,
    },
    resolution: null,
    score: null,
    audit_events: [
      {
        event_id: `${input.prediction_id}-submitted`,
        event_type: "SUBMITTED",
        occurred_at: submission.submitted_at,
        actor_type: "USER",
        payload_sha256: predictionSha256(submission),
        public_note: null,
      },
      {
        event_id: `${input.prediction_id}-locked`,
        event_type: "LOCKED",
        occurred_at: lockedAt,
        actor_type: "SYSTEM",
        payload_sha256: payloadHash,
        public_note: null,
      },
    ],
  });
}

export function verifyPredictionLock(record: PublicPredictionRecord): boolean {
  const parsed = publicPredictionRecordSchema.parse(record);
  const payload = {
    schema_version: parsed.schema_version,
    prediction_id: parsed.prediction_id,
    question: parsed.question,
    submission: parsed.submission,
    consent: parsed.consent,
  };
  return predictionSha256(payload) === parsed.lock.canonical_payload_sha256;
}

export interface ResolvePredictionInput {
  resolved_at: string;
  source_identifier: string;
  source_version_sha256: string;
  resolved_outcome: unknown;
  resolver_type: "DETERMINISTIC" | "HUMAN_ADJUDICATION" | "MIXED";
  adjudication_rationale?: string | null;
}

function categoricalProbability(forecast: PredictionForecast, label: string): number {
  const entry = forecast.categorical_probabilities?.find((candidate) => candidate.label === label);
  if (entry === undefined) {
    throw new RangeError("Resolved categorical outcome is not present in the forecast labels");
  }
  return entry.probability;
}

function calculateBrier(forecast: PredictionForecast, outcome: unknown): number {
  if (forecast.forecast_format === "BINARY_PROBABILITY") {
    if (typeof outcome !== "boolean") {
      throw new TypeError("Binary Brier scoring requires a boolean resolved outcome");
    }
    const probability = forecast.binary_probability_true as number;
    return (probability - (outcome ? 1 : 0)) ** 2;
  }
  if (forecast.forecast_format === "CATEGORICAL_PROBABILITIES") {
    if (typeof outcome !== "string") {
      throw new TypeError("Categorical Brier scoring requires a string resolved outcome");
    }
    categoricalProbability(forecast, outcome);
    return (forecast.categorical_probabilities ?? []).reduce(
      (sum, entry) => sum + (entry.probability - (entry.label === outcome ? 1 : 0)) ** 2,
      0,
    );
  }
  throw new TypeError("Brier scoring requires a binary or categorical forecast");
}

function calculateLogScore(forecast: PredictionForecast, outcome: unknown): number {
  let probability: number;
  if (forecast.forecast_format === "BINARY_PROBABILITY") {
    if (typeof outcome !== "boolean") {
      throw new TypeError("Binary log scoring requires a boolean resolved outcome");
    }
    const probabilityTrue = forecast.binary_probability_true as number;
    probability = outcome ? probabilityTrue : 1 - probabilityTrue;
  } else if (forecast.forecast_format === "CATEGORICAL_PROBABILITIES") {
    if (typeof outcome !== "string") {
      throw new TypeError("Categorical log scoring requires a string resolved outcome");
    }
    probability = categoricalProbability(forecast, outcome);
  } else {
    throw new TypeError("Log scoring requires a binary or categorical forecast");
  }
  return -Math.log(Math.max(probability, LOG_SCORE_EPSILON));
}

function calculateIntervalScore(forecast: PredictionForecast, outcome: unknown): number {
  if (forecast.forecast_format !== "INTERVAL" || typeof outcome !== "number" || !Number.isFinite(outcome)) {
    throw new TypeError("Interval scoring requires an interval forecast and finite numeric outcome");
  }
  const lower = forecast.lower_bound as number;
  const upper = forecast.upper_bound as number;
  const coverage = forecast.interval_coverage_probability as number;
  const alpha = 1 - coverage;
  let score = upper - lower;
  if (outcome < lower) {
    score += (2 / alpha) * (lower - outcome);
  } else if (outcome > upper) {
    score += (2 / alpha) * (outcome - upper);
  }
  return score;
}

function calculateRankScore(forecast: PredictionForecast, outcome: unknown): number {
  if (forecast.forecast_format !== "RANKING" || !Array.isArray(outcome) || !outcome.every((entry) => typeof entry === "string")) {
    throw new TypeError("Rank scoring requires a ranking forecast and string-array resolved outcome");
  }
  const forecastRanking = forecast.ranking ?? [];
  const resolvedRanking = outcome as string[];
  if (
    forecastRanking.length !== resolvedRanking.length ||
    new Set(forecastRanking).size !== forecastRanking.length ||
    new Set(resolvedRanking).size !== resolvedRanking.length ||
    forecastRanking.some((entry) => !resolvedRanking.includes(entry))
  ) {
    throw new RangeError("Forecast and resolved rankings must contain the same unique entries");
  }
  const resolvedIndexes = new Map(resolvedRanking.map((entry, index) => [entry, index]));
  return (
    forecastRanking.reduce(
      (sum, entry, index) => sum + Math.abs(index - (resolvedIndexes.get(entry) as number)),
      0,
    ) / forecastRanking.length
  );
}

function calculateAbsoluteError(forecast: PredictionForecast, outcome: unknown): number {
  if (typeof outcome !== "number" || !Number.isFinite(outcome) || forecast.point_estimate === null || forecast.point_estimate === undefined) {
    throw new TypeError("Absolute error requires a point estimate and finite numeric outcome");
  }
  return Math.abs(forecast.point_estimate - outcome);
}

function calculateMetric(
  metric: z.infer<typeof predictionMetricSchema> | z.infer<typeof predictionSecondaryMetricSchema>,
  forecast: PredictionForecast,
  outcome: unknown,
): number | null {
  switch (metric) {
    case "BRIER":
      return calculateBrier(forecast, outcome);
    case "LOG":
      return calculateLogScore(forecast, outcome);
    case "INTERVAL":
      return calculateIntervalScore(forecast, outcome);
    case "RANK":
      return calculateRankScore(forecast, outcome);
    case "ABSOLUTE_ERROR":
      return calculateAbsoluteError(forecast, outcome);
    case "CALIBRATION":
      return calculateBrier(forecast, outcome);
    case "CALIBRATION_ONLY":
      return null;
  }
}

export function resolvePrediction(
  recordInput: PublicPredictionRecord,
  input: ResolvePredictionInput,
): PublicPredictionRecord {
  const record = publicPredictionRecordSchema.parse(recordInput);
  if (record.lifecycle_state !== "LOCKED" && record.lifecycle_state !== "REVEAL_PENDING") {
    throw new Error("Only locked or reveal-pending predictions can be resolved");
  }
  if (!verifyPredictionLock(record)) {
    throw new Error("Prediction lock verification failed");
  }
  if (Date.parse(input.resolved_at) < Date.parse(record.question.closes_at)) {
    throw new RangeError("Prediction cannot be resolved before the question closes");
  }

  const resolutionBase = {
    resolved_at: input.resolved_at,
    source_identifier: input.source_identifier,
    source_version_sha256: input.source_version_sha256,
    resolved_outcome: input.resolved_outcome,
    resolver_type: input.resolver_type,
    adjudication_rationale: input.adjudication_rationale ?? null,
  };
  const resolution = predictionResolutionSchema.parse({
    ...resolutionBase,
    resolution_payload_sha256: predictionSha256(resolutionBase),
  });

  const eligible = record.submission.counts_for_scoring;
  const primaryValue = eligible
    ? calculateMetric(record.question.scoring_rule.primary_metric, record.submission.forecast, input.resolved_outcome)
    : null;
  const secondaryValues: Record<string, number | null> = {};
  if (eligible) {
    for (const metric of record.question.scoring_rule.secondary_metrics) {
      secondaryValues[metric] = calculateMetric(metric, record.submission.forecast, input.resolved_outcome);
    }
  }
  const scoreBase = {
    scored_at: input.resolved_at,
    scoring_rule_version: record.question.scoring_rule.rule_version,
    primary_metric: record.question.scoring_rule.primary_metric,
    primary_value: primaryValue,
    secondary_values: secondaryValues,
    eligible_for_primary_analysis: eligible,
    ineligibility_reason: eligible ? null : "Submission was marked ineligible for primary scoring",
  };
  const score = predictionScoreSchema.parse({
    ...scoreBase,
    score_payload_sha256: predictionSha256(scoreBase),
  });

  return publicPredictionRecordSchema.parse({
    ...record,
    lifecycle_state: "RESOLVED",
    resolution,
    score,
    audit_events: [
      ...record.audit_events,
      {
        event_id: `${record.prediction_id}-resolved`,
        event_type: "RESOLVED",
        occurred_at: input.resolved_at,
        actor_type: input.resolver_type === "DETERMINISTIC" ? "SYSTEM" : "REVIEWER",
        payload_sha256: resolution.resolution_payload_sha256,
        public_note: null,
      },
      {
        event_id: `${record.prediction_id}-scored`,
        event_type: "SCORED",
        occurred_at: input.resolved_at,
        actor_type: "SYSTEM",
        payload_sha256: score.score_payload_sha256,
        public_note: null,
      },
    ],
  });
}
