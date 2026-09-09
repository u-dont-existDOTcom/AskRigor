import { createHash } from "node:crypto";

import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

export const forumCorpusPurposeSchema = z.enum([
  "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION",
  "DIRECTIONAL_SENSITIVITY",
  "PHENOTYPE_DISCOVERY",
  "FORMAL_DISCRIMINATOR"
]);

export const forumDenominatorTypeSchema = z.enum([
  "POPULATION_DENOMINATOR",
  "FIRSTHAND_FORUM_USER_DENOMINATOR",
  "SEARCH_LANDSCAPE_RESULT_CARD_DENOMINATOR",
  "NONE"
]);

export const forumQueryNeutralitySchema = z.object({
  status: z.enum(["NEUTRAL", "DIRECTIONAL", "UNCERTAIN"]),
  rationale: bounded(1_000),
  target_variable_term_exception: z.boolean()
}).strict();

const forumCorpusQuerySchema = z.object({
  query_id: bounded(120),
  query_text: bounded(5_000),
  provider: bounded(120),
  requested_result_depth: z.number().int().positive().max(10_000),
  ranking_basis: bounded(500),
  neutrality: forumQueryNeutralitySchema
}).strict();

const forumSamplingPlanSchema = z.object({
  method: z.enum(["FULL", "DETERMINISTIC_HASH", "STRATIFIED"]),
  threshold: z.number().int().positive().max(1_000_000),
  rule: bounded(2_000)
}).strict();

const forumCorpusPlanCoreSchema = z.object({
  contract_version: z.literal("askrigor_forum_corpus_plan_v2"),
  corpus_plan_id: bounded(160),
  corpus_version: z.number().int().positive(),
  corpus_purpose: forumCorpusPurposeSchema,
  research_question: bounded(5_000),
  subject_aliases: z.array(bounded(500)).min(1).max(100),
  context_aliases: z.array(bounded(500)).max(100),
  planned_at: z.string().datetime({ offset: true }),
  frozen_before_outcome_classification: z.boolean(),
  queries: z.array(forumCorpusQuerySchema).min(1).max(100),
  inclusion_rules: z.array(bounded(2_000)).min(1).max(100),
  exclusion_rules: z.array(bounded(2_000)).min(1).max(100),
  sampling: forumSamplingPlanSchema
}).strict();

export const forumCorpusPlanV2Schema = forumCorpusPlanCoreSchema.extend({
  plan_sha256: digest,
  query_set_sha256: digest,
  prevalence_eligible: z.boolean(),
  outside_primary_denominator: z.boolean()
}).strict().superRefine((value, context) => {
  const expectedQueryHash = sha256(canonicalJson(value.queries));
  const { plan_sha256: _plan, query_set_sha256: _queries,
    prevalence_eligible: _eligible, outside_primary_denominator: _outside, ...core } = value;
  if (value.query_set_sha256 !== expectedQueryHash) {
    context.addIssue({ code: "custom", message: "Query-set hash does not match exact frozen queries" });
  }
  if (value.plan_sha256 !== sha256(canonicalJson(core))) {
    context.addIssue({ code: "custom", message: "Corpus-plan hash does not match exact frozen plan" });
  }
  const primary = value.corpus_purpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION";
  const neutral = value.queries.every(({ neutrality }) => neutrality.status === "NEUTRAL");
  if (primary && !neutral) {
    context.addIssue({
      code: "custom",
      message: "A primary signal-estimation corpus requires directionally neutral queries"
    });
  }
  if (value.prevalence_eligible !== (primary && neutral && value.frozen_before_outcome_classification)) {
    context.addIssue({ code: "custom", message: "Prevalence eligibility must be derived from purpose, neutrality, and freeze" });
  }
  if (value.outside_primary_denominator !== !value.prevalence_eligible) {
    context.addIssue({ code: "custom", message: "Every prevalence-ineligible corpus must remain outside the primary denominator" });
  }
});

export type ForumCorpusPlanV2 = z.output<typeof forumCorpusPlanV2Schema>;
export type ForumCorpusPlanCore = z.input<typeof forumCorpusPlanCoreSchema>;

export function createForumCorpusPlanV2(
  rawCore: ForumCorpusPlanCore
): ForumCorpusPlanV2 {
  const core = forumCorpusPlanCoreSchema.parse(rawCore);
  const primary = core.corpus_purpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION";
  const neutral = core.queries.every(({ neutrality }) => neutrality.status === "NEUTRAL");
  return forumCorpusPlanV2Schema.parse({
    ...core,
    plan_sha256: sha256(canonicalJson(core)),
    query_set_sha256: sha256(canonicalJson(core.queries)),
    prevalence_eligible: primary && neutral && core.frozen_before_outcome_classification,
    outside_primary_denominator:
      !(primary && neutral && core.frozen_before_outcome_classification)
  });
}

export function reviseForumCorpusPlanV2(
  previous: ForumCorpusPlanV2,
  changes: Omit<Partial<ForumCorpusPlanCore>, "corpus_version" | "corpus_plan_id">
): ForumCorpusPlanV2 {
  const prior = forumCorpusPlanV2Schema.parse(previous);
  const { plan_sha256: _plan, query_set_sha256: _query, prevalence_eligible: _eligible,
    outside_primary_denominator: _outside, ...core } = prior;
  return createForumCorpusPlanV2({
    ...core,
    ...changes,
    corpus_plan_id: prior.corpus_plan_id,
    corpus_version: prior.corpus_version + 1
  });
}

export const forumExclusionReasonSchema = z.enum([
  "DUPLICATE",
  "IRRELEVANT_SUBJECT",
  "IRRELEVANT_CONTEXT",
  "INTERVENTION_NOT_MATERIAL",
  "PROMOTIONAL_ONLY",
  "SEARCH_ENGINE_FALSE_MATCH",
  "INACCESSIBLE",
  "INSUFFICIENT_CONTENT",
  "LANGUAGE_UNSUPPORTED",
  "OTHER_EXPLAINED"
]);

export const forumThreadRetrievalStateSchema = z.enum([
  "FULL",
  "DETERMINISTIC_SAMPLE",
  "PARTIAL",
  "UNAVAILABLE"
]);

export const forumSearchLandscapeCategorySchema = z.enum([
  "POSITIVE_LEANING",
  "NEGATIVE_LEANING",
  "MIXED",
  "NEUTRAL_QUESTION",
  "NO_OUTCOME",
  "PROMOTIONAL",
  "OTHER"
]);

const forumSearchReceiptSchema = z.object({
  query_id: bounded(120),
  plan_sha256: digest,
  executed_at: z.string().datetime({ offset: true }),
  actual_result_depth: z.number().int().nonnegative().max(100_000),
  pagination_state: z.enum(["EXHAUSTED", "CURSOR_AVAILABLE", "BLOCKED"]),
  retrieved_result_card_ids: z.array(bounded(2_048)).max(100_000)
}).strict().superRefine((value, context) => {
  if (value.actual_result_depth !== value.retrieved_result_card_ids.length) {
    context.addIssue({
      code: "custom",
      message: "Actual result depth must equal the retained result-card list length"
    });
  }
  if (new Set(value.retrieved_result_card_ids).size !==
    value.retrieved_result_card_ids.length) {
    context.addIssue({
      code: "custom",
      message: "A frozen query receipt cannot repeat a result-card ID"
    });
  }
});

export const forumThreadRecordSchema = z.object({
  result_card_id: bounded(2_048),
  platform: bounded(120),
  canonical_post_id: bounded(2_048).optional(),
  canonical_url: z.string().url().max(4_000),
  query_ids: z.array(bounded(120)).min(1).max(100),
  materiality: z.enum(["CONFIRMED", "REJECTED", "UNCERTAIN"]),
  exclusion_reason: forumExclusionReasonSchema.optional(),
  exclusion_explanation: bounded(2_000).optional(),
  retrieval_state: forumThreadRetrievalStateSchema,
  excluded_from_user_prevalence: z.boolean(),
  search_landscape_category: forumSearchLandscapeCategorySchema,
  promotional_source: z.boolean(),
  replacement_for_result_cards: z.array(z.object({
    query_id: bounded(120),
    rejected_result_card_id: bounded(2_048)
  }).strict()).max(100).optional()
}).strict().superRefine((value, context) => {
  if (value.materiality === "REJECTED" && value.exclusion_reason === undefined) {
    context.addIssue({ code: "custom", message: "Rejected source needs a structured exclusion reason" });
  }
  if (value.exclusion_reason === "OTHER_EXPLAINED" && value.exclusion_explanation === undefined) {
    context.addIssue({ code: "custom", message: "Other exclusion needs an explanation" });
  }
  if ((value.replacement_for_result_cards?.length ?? 0) > 0 &&
    value.materiality !== "CONFIRMED") {
    context.addIssue({ code: "custom", message: "Only a confirmed replacement can fill a rejected materiality slot" });
  }
});

export const forumUserOutcomeSchema = z.enum([
  "BENEFIT",
  "MIXED",
  "NO_EFFECT",
  "WORSENED",
  "TOO_EARLY",
  "UNCLEAR"
]);

export const forumAttributionClassSchema = z.enum([
  "A1_ISOLATED",
  "A2_STABLE_COINTERVENTIONS",
  "A3_WITHIN_PERSON_DISCRIMINATOR",
  "B_CONCURRENT_NEW_CHANGES",
  "C_ATTRIBUTION_IMPOSSIBLE"
]);

const forumIdentitySchema = z.object({
  identity_kind: z.enum(["STABLE_AUTHOR_ID", "STABLE_USERNAME", "ANONYMOUS_OR_DELETED"]),
  identity_value: bounded(1_000).optional()
}).strict().superRefine((value, context) => {
  if ((value.identity_kind === "ANONYMOUS_OR_DELETED") ===
    (value.identity_value !== undefined)) {
    context.addIssue({ code: "custom", message: "Stable identity needs a value; anonymous identity cannot invent one" });
  }
});

export const forumDurationSchema = z.enum([
  "FIRST_EXPOSURE",
  "LESS_THAN_1_WEEK",
  "ONE_TO_FOUR_WEEKS",
  "ONE_TO_THREE_MONTHS",
  "MORE_THAN_3_MONTHS",
  "UNKNOWN"
]);

export const forumDurabilitySchema = z.enum([
  "PERSISTED",
  "RELAPSED",
  "ADVERSE_EFFECT_PERSISTED",
  "NOT_REPORTED",
  "NOT_APPLICABLE"
]);

export const forumPopulationCertaintySchema = z.enum([
  "FORMALLY_VERIFIED",
  "STRONGLY_SELF_IDENTIFIED",
  "PARTIALLY_MATCHING",
  "WEAKLY_MATCHING",
  "UNSPECIFIED"
]);

export const forumSourceRoleSchema = z.enum([
  "VENDOR_ACCOUNT",
  "AFFILIATE_CREATOR",
  "CREATOR_SELF_PROMOTION",
  "CUSTOMER_USER",
  "INDEPENDENT_USER",
  "UNKNOWN"
]);

export const forumUserEpisodeSchema = z.object({
  episode_id: bounded(160),
  thread_identity: bounded(4_000),
  identity: forumIdentitySchema,
  firsthand: z.boolean(),
  outcome: forumUserOutcomeSchema,
  chronological_index: z.number().int().nonnegative(),
  attribution: forumAttributionClassSchema,
  duration: forumDurationSchema,
  durability: forumDurabilitySchema,
  population_certainty: forumPopulationCertaintySchema,
  source_role: forumSourceRoleSchema,
  genuine_personal_outcome_from_promotional_role: z.boolean(),
  reaction_information_present: z.boolean(),
  benefit_information_present: z.boolean(),
  marker_benefit_quadrant: z.enum([
    "BENEFIT_STRONG_MARKER",
    "BENEFIT_LITTLE_OR_NO_MARKER",
    "NO_BENEFIT_STRONG_MARKER",
    "NO_BENEFIT_LITTLE_OR_NO_MARKER",
    "UNCLASSIFIABLE"
  ])
}).strict();

export const communityEvidenceDenominatorLedgerV2Schema = z.object({
  ledger_version: z.literal("askrigor_community_denominator_ledger_v2"),
  plan_sha256: digest,
  denominator_type: forumDenominatorTypeSchema,
  neutral_queries_planned: z.number().int().nonnegative(),
  neutral_queries_completed: z.number().int().nonnegative(),
  raw_results_retrieved: z.number().int().nonnegative(),
  duplicate_result_cards: z.number().int().nonnegative(),
  disposed_result_cards: z.number().int().nonnegative(),
  unique_threads: z.number().int().nonnegative(),
  relevant_threads: z.number().int().nonnegative(),
  material_source_quota_consumed: z.number().int().nonnegative(),
  fully_retrieved_threads: z.number().int().nonnegative(),
  deterministic_sample_threads: z.number().int().nonnegative(),
  partial_threads: z.number().int().nonnegative(),
  unavailable_threads: z.number().int().nonnegative(),
  unique_firsthand_users: z.number().int().nonnegative(),
  interpretable_firsthand_users: z.number().int().nonnegative(),
  strict_attribution_users: z.number().int().nonnegative(),
  anonymous_identity_uncertainty: z.object({
    present: z.boolean(),
    lower_bound: z.number().int().nonnegative(),
    upper_bound: z.number().int().nonnegative()
  }).strict(),
  firsthand_user_denominator_bounds: z.object({
    lower_bound: z.number().int().nonnegative(),
    upper_bound: z.number().int().nonnegative()
  }).strict(),
  firsthand_user_strict_denominator_bounds: z.object({
    lower_bound: z.number().int().nonnegative(),
    upper_bound: z.number().int().nonnegative()
  }).strict(),
  sensitivity_cases_outside_denominator: z.number().int().nonnegative(),
  excluded_relevant_partial_sources: z.number().int().nonnegative(),
  search_landscape: z.record(forumSearchLandscapeCategorySchema, z.number().int().nonnegative()),
  user_outcomes_inclusive: z.record(z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]), z.number().int().nonnegative()),
  user_outcomes_strict: z.record(z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]), z.number().int().nonnegative()),
  user_outcome_bounds_inclusive: z.record(
    z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]),
    z.object({
      lower_bound: z.number().int().nonnegative(),
      upper_bound: z.number().int().nonnegative()
    }).strict()
  ),
  user_outcome_bounds_strict: z.record(
    z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]),
    z.object({
      lower_bound: z.number().int().nonnegative(),
      upper_bound: z.number().int().nonnegative()
    }).strict()
  ),
  causal_quadrants: z.record(z.enum([
    "BENEFIT_STRONG_MARKER",
    "BENEFIT_LITTLE_OR_NO_MARKER",
    "NO_BENEFIT_STRONG_MARKER",
    "NO_BENEFIT_LITTLE_OR_NO_MARKER",
    "UNCLASSIFIABLE"
  ]), z.number().int().nonnegative())
}).strict();

const forumGateChecksSchema = z.object({
  CORPUS_CARD_DISPOSITION_CLOSED: z.boolean(),
  PRIMARY_CORPUS_FROZEN: z.boolean(),
  PRIMARY_SEARCHES_DIRECTIONALLY_NEUTRAL: z.boolean(),
  PRIMARY_CORPUS_DEDUPED: z.boolean(),
  DENOMINATOR_EXPLICIT: z.boolean(),
  SENSITIVITY_RESULTS_SEPARATED: z.boolean(),
  RETRIEVAL_COMPLETENESS_ACCEPTABLE: z.boolean(),
  MATERIALITY_RESOLVED: z.boolean(),
  USER_DEDUP_ACCEPTABLE: z.boolean()
}).strict();

const forumFrequencyBasisSchema = z.object({
  denominator_type: forumDenominatorTypeSchema,
  corpus_version: z.number().int().positive(),
  exact_denominators: z.object({
    search_landscape: z.number().int().nonnegative().nullable(),
    firsthand_inclusive: z.number().int().nonnegative().nullable(),
    firsthand_strict: z.number().int().nonnegative().nullable()
  }).strict(),
  denominator_bounds: z.object({
    lower_bound: z.number().int().nonnegative(),
    upper_bound: z.number().int().nonnegative()
  }).strict(),
  search_landscape: z.record(
    forumSearchLandscapeCategorySchema,
    z.number().int().nonnegative()
  ),
  user_outcomes_inclusive: z.record(
    z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]),
    z.number().int().nonnegative()
  ),
  user_outcomes_strict: z.record(
    z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]),
    z.number().int().nonnegative()
  ),
  user_outcome_bounds_inclusive: z.record(
    z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]),
    z.object({
      lower_bound: z.number().int().nonnegative(),
      upper_bound: z.number().int().nonnegative()
    }).strict()
  ),
  user_outcome_bounds_strict: z.record(
    z.enum(["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"]),
    z.object({
      lower_bound: z.number().int().nonnegative(),
      upper_bound: z.number().int().nonnegative()
    }).strict()
  ),
  strict_denominator_bounds: z.object({
    lower_bound: z.number().int().nonnegative(),
    upper_bound: z.number().int().nonnegative()
  }).strict()
}).strict();

export const communityEvidenceDenominatorReceiptV2Schema = z.object({
  receipt_version: z.literal("askrigor_community_denominator_receipt_v2"),
  plan_sha256: digest,
  corpus_version: z.number().int().positive(),
  corpus_purpose: forumCorpusPurposeSchema,
  ledger_sha256: digest,
  gate_checks: forumGateChecksSchema,
  forum_signal_prevalence: z.enum(["ALLOWED", "BLOCKED"]),
  case_discovery: z.literal("ALLOWED"),
  firsthand_user_prevalence_allowed: z.boolean(),
  firsthand_user_bounded_frequency_allowed: z.boolean(),
  search_landscape_prevalence_allowed: z.boolean(),
  exact_frequency_allowed: z.boolean(),
  frequency_basis: forumFrequencyBasisSchema,
  mandatory_wording: bounded(1_000),
  measurement_confidence: z.enum(["HIGH", "MODERATE", "LOW", "INDETERMINATE"]),
  causal_attribution_confidence: z.enum(["HIGH", "MODERATE", "LOW", "INDETERMINATE"]),
  robustness_views: z.array(bounded(1_000)).max(100)
}).strict();

export interface CommunityEvidenceInputV2 {
  plan: ForumCorpusPlanV2;
  denominatorType: z.output<typeof forumDenominatorTypeSchema>;
  searchReceipts: z.output<typeof forumSearchReceiptSchema>[];
  threads: z.output<typeof forumThreadRecordSchema>[];
  userEpisodes: z.output<typeof forumUserEpisodeSchema>[];
  sensitivityCasesOutsideDenominator: number;
  sensitivityResultsSeparated: boolean;
  anonymousIdentityBounds?: { lower: number; upper: number };
  robustnessViews?: string[];
}

export function canonicalForumThreadIdentity(
  record: Pick<z.output<typeof forumThreadRecordSchema>, "platform" | "canonical_post_id" | "canonical_url">
): string {
  return record.canonical_post_id
    ? `${record.platform}:${record.canonical_post_id}`
    : normalizedCanonicalUrl(record.canonical_url);
}

export function assessCommunityEvidenceDenominator(
  rawInput: CommunityEvidenceInputV2
): {
  ledger: z.output<typeof communityEvidenceDenominatorLedgerV2Schema>;
  receipt: z.output<typeof communityEvidenceDenominatorReceiptV2Schema>;
} {
  const plan = forumCorpusPlanV2Schema.parse(rawInput.plan);
  const searches = z.array(forumSearchReceiptSchema).parse(rawInput.searchReceipts);
  const threads = z.array(forumThreadRecordSchema).parse(rawInput.threads);
  const episodes = z.array(forumUserEpisodeSchema).parse(rawInput.userEpisodes);
  const denominatorType = forumDenominatorTypeSchema.parse(rawInput.denominatorType);
  if (!Number.isInteger(rawInput.sensitivityCasesOutsideDenominator) ||
    rawInput.sensitivityCasesOutsideDenominator < 0) {
    throw new Error("Sensitivity case count must be a nonnegative integer");
  }
  const queryIds = new Set(plan.queries.map(({ query_id }) => query_id));
  if (searches.some((item) => item.plan_sha256 !== plan.plan_sha256 || !queryIds.has(item.query_id))) {
    throw new Error("Search receipt is stale or outside the frozen plan");
  }
  const searchQueryIds = searches.map(({ query_id }) => query_id);
  if (
    new Set(searchQueryIds).size !== searchQueryIds.length ||
    searchQueryIds.length !== queryIds.size ||
    searchQueryIds.some((queryId) => !queryIds.has(queryId))
  ) {
    throw new Error("Search receipts must cover every frozen query exactly once");
  }
  const resultCardQueries = new Map<string, Set<string>>();
  for (const search of searches) {
    for (const resultCardId of search.retrieved_result_card_ids) {
      const linkedQueries = resultCardQueries.get(resultCardId) ?? new Set<string>();
      linkedQueries.add(search.query_id);
      resultCardQueries.set(resultCardId, linkedQueries);
    }
  }
  const dispositionsByCard = new Map<string, typeof threads>();
  for (const thread of threads) {
    dispositionsByCard.set(thread.result_card_id, [
      ...(dispositionsByCard.get(thread.result_card_id) ?? []),
      thread
    ]);
  }
  const closureFailure = [...resultCardQueries].some(([resultCardId, exactQueries]) => {
    const dispositions = dispositionsByCard.get(resultCardId) ?? [];
    return dispositions.length !== 1 ||
      !sameStringSet(dispositions[0]!.query_ids, [...exactQueries]);
  }) || [...dispositionsByCard.keys()].some((resultCardId) =>
    !resultCardQueries.has(resultCardId)
  );
  if (closureFailure) {
    throw new Error(
      "Every retrieved result card must have exactly one disposition with its exact frozen query IDs"
    );
  }
  assertSameQueryReplacementOrder(searches, threads);
  const threadIdentities = threads.map(canonicalForumThreadIdentity);
  const uniqueThreadIdentities = new Set(threadIdentities);
  const primary = plan.corpus_purpose === "PRIMARY_NEUTRAL_SIGNAL_ESTIMATION";
  const relevant = threads.filter(({ materiality }) => materiality === "CONFIRMED");
  const materialityResolved = threads.every(({ materiality }) =>
    materiality !== "UNCERTAIN"
  );
  const canonicalGroups = new Map<string, typeof threads>();
  for (const thread of threads) {
    const identity = canonicalForumThreadIdentity(thread);
    canonicalGroups.set(identity, [...(canonicalGroups.get(identity) ?? []), thread]);
  }
  const canonicalDeduped = [...canonicalGroups.values()].every((records) => {
    const counted = records.filter(({ exclusion_reason }) =>
      exclusion_reason !== "DUPLICATE"
    );
    return counted.length === 1 && records.every((record) =>
      record === counted[0] ||
      (record.materiality === "REJECTED" && record.exclusion_reason === "DUPLICATE")
    );
  });
  const userEligibleThreads = new Set(relevant.filter(({ retrieval_state, excluded_from_user_prevalence }) =>
    ["FULL", "DETERMINISTIC_SAMPLE"].includes(retrieval_state) && !excluded_from_user_prevalence
  ).map(canonicalForumThreadIdentity));
  const eligibleEpisodes = episodes.filter((episode) =>
    episode.firsthand && userEligibleThreads.has(episode.thread_identity) &&
    promotionalEpisodeEligible(episode)
  );
  const reconciled = reconcileFirsthandUsers(eligibleEpisodes);
  const interpretable = reconciled.filter(({ outcome }) =>
    ["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"].includes(outcome)
  );
  const inclusive = interpretable.filter(({ attribution }) =>
    attribution !== "C_ATTRIBUTION_IMPOSSIBLE"
  );
  const strict = interpretable.filter(({ attribution }) =>
    ["A1_ISOLATED", "A2_STABLE_COINTERVENTIONS", "A3_WITHIN_PERSON_DISCRIMINATOR"]
      .includes(attribution)
  );
  const anonymousCount = reconciled.filter(({ identityKey }) => identityKey.startsWith("anonymous:"))
    .length;
  const bounds = anonymousCount === 0
    ? { present: false, lower_bound: 0, upper_bound: 0 }
    : rawInput.anonymousIdentityBounds === undefined
      ? { present: true, lower_bound: 0, upper_bound: anonymousCount }
      : {
        present: true,
        lower_bound: rawInput.anonymousIdentityBounds.lower,
        upper_bound: rawInput.anonymousIdentityBounds.upper
      };
  if (bounds.lower_bound > bounds.upper_bound || bounds.upper_bound > anonymousCount) {
    throw new Error("Anonymous identity bounds are invalid");
  }
  const counts = <T extends string>(values: readonly T[], keys: readonly T[]) =>
    Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length]));
  const outcomes = ["BENEFIT", "MIXED", "NO_EFFECT", "WORSENED"] as const;
  const landscape = forumSearchLandscapeCategorySchema.options;
  const quadrants = [
    "BENEFIT_STRONG_MARKER",
    "BENEFIT_LITTLE_OR_NO_MARKER",
    "NO_BENEFIT_STRONG_MARKER",
    "NO_BENEFIT_LITTLE_OR_NO_MARKER",
    "UNCLASSIFIABLE"
  ] as const;
  const rawCards = searches.reduce((total, item) => total + item.retrieved_result_card_ids.length, 0);
  const uniqueResultCards = resultCardQueries.size;
  const stableInterpretable = interpretable.filter(({ identityKey }) =>
    !identityKey.startsWith("anonymous:")
  );
  const anonymousInterpretable = interpretable.filter(({ identityKey }) =>
    identityKey.startsWith("anonymous:")
  );
  const stableInclusive = stableInterpretable.filter(({ attribution }) =>
    attribution !== "C_ATTRIBUTION_IMPOSSIBLE"
  );
  const anonymousInclusive = anonymousInterpretable.filter(({ attribution }) =>
    attribution !== "C_ATTRIBUTION_IMPOSSIBLE"
  );
  const stableStrict = stableInterpretable.filter(({ attribution }) =>
    ["A1_ISOLATED", "A2_STABLE_COINTERVENTIONS", "A3_WITHIN_PERSON_DISCRIMINATOR"]
      .includes(attribution)
  );
  const anonymousStrict = anonymousInterpretable.filter(({ attribution }) =>
    ["A1_ISOLATED", "A2_STABLE_COINTERVENTIONS", "A3_WITHIN_PERSON_DISCRIMINATOR"]
      .includes(attribution)
  );
  const denominatorBounds = anonymousCount === 0
    ? { lower_bound: inclusive.length, upper_bound: inclusive.length }
    : {
      lower_bound: stableInclusive.length + Math.max(
        0,
        bounds.lower_bound - (anonymousCount - anonymousInclusive.length)
      ),
      upper_bound: stableInclusive.length + Math.min(
        bounds.upper_bound,
        anonymousInclusive.length
      )
    };
  const boundedUsers = (
    stableUsers: typeof stableInterpretable,
    anonymousUsers: typeof anonymousInterpretable
  ) => ({
    lower_bound: stableUsers.length + Math.max(
      0,
      bounds.lower_bound - (anonymousCount - anonymousUsers.length)
    ),
    upper_bound: stableUsers.length + Math.min(
      bounds.upper_bound,
      anonymousUsers.length
    )
  });
  const boundedOutcomes = (
    stableUsers: typeof stableInterpretable,
    anonymousUsers: typeof anonymousInterpretable
  ) => Object.fromEntries(outcomes.map((outcome) => {
    const stableCount = stableUsers.filter((item) => item.outcome === outcome).length;
    const possibleAnonymous = anonymousUsers.filter((item) =>
      item.outcome === outcome
    ).length;
    return [outcome, {
      lower_bound: stableCount + Math.max(
        0,
        bounds.lower_bound - (anonymousCount - possibleAnonymous)
      ),
      upper_bound: stableCount + Math.min(bounds.upper_bound, possibleAnonymous)
    }];
  }));
  const strictDenominatorBounds = boundedUsers(stableStrict, anonymousStrict);
  const outcomeBounds = boundedOutcomes(stableInclusive, anonymousInclusive);
  const strictOutcomeBounds = boundedOutcomes(stableStrict, anonymousStrict);
  const ledger = communityEvidenceDenominatorLedgerV2Schema.parse({
    ledger_version: "askrigor_community_denominator_ledger_v2",
    plan_sha256: plan.plan_sha256,
    denominator_type: denominatorType,
    neutral_queries_planned: plan.queries.filter(({ neutrality }) => neutrality.status === "NEUTRAL").length,
    neutral_queries_completed: searches.filter(({ pagination_state }) => pagination_state === "EXHAUSTED").length,
    raw_results_retrieved: rawCards,
    duplicate_result_cards: Math.max(0, rawCards - uniqueResultCards) +
      threads.filter(({ exclusion_reason }) => exclusion_reason === "DUPLICATE").length,
    disposed_result_cards: dispositionsByCard.size,
    unique_threads: uniqueThreadIdentities.size,
    relevant_threads: new Set(relevant.map(canonicalForumThreadIdentity)).size,
    material_source_quota_consumed:
      new Set(relevant.map(canonicalForumThreadIdentity)).size,
    fully_retrieved_threads: relevant.filter(({ retrieval_state }) => retrieval_state === "FULL").length,
    deterministic_sample_threads: relevant.filter(({ retrieval_state }) => retrieval_state === "DETERMINISTIC_SAMPLE").length,
    partial_threads: relevant.filter(({ retrieval_state }) => retrieval_state === "PARTIAL").length,
    unavailable_threads: relevant.filter(({ retrieval_state }) => retrieval_state === "UNAVAILABLE").length,
    unique_firsthand_users: reconciled.length,
    interpretable_firsthand_users: interpretable.length,
    strict_attribution_users: strict.length,
    anonymous_identity_uncertainty: bounds,
    firsthand_user_denominator_bounds: denominatorBounds,
    firsthand_user_strict_denominator_bounds: strictDenominatorBounds,
    sensitivity_cases_outside_denominator: rawInput.sensitivityCasesOutsideDenominator,
    excluded_relevant_partial_sources: relevant.filter(({ retrieval_state, excluded_from_user_prevalence }) =>
      ["PARTIAL", "UNAVAILABLE"].includes(retrieval_state) && excluded_from_user_prevalence
    ).length,
    search_landscape: counts(relevant.map(({ search_landscape_category }) => search_landscape_category), landscape),
    user_outcomes_inclusive: counts(inclusive.map(({ outcome }) => outcome as typeof outcomes[number]), outcomes),
    user_outcomes_strict: counts(strict.map(({ outcome }) => outcome as typeof outcomes[number]), outcomes),
    user_outcome_bounds_inclusive: outcomeBounds,
    user_outcome_bounds_strict: strictOutcomeBounds,
    causal_quadrants: counts(inclusive.map(({ markerBenefitQuadrant }) => markerBenefitQuadrant), quadrants)
  });
  const gateChecks = forumGateChecksSchema.parse({
    CORPUS_CARD_DISPOSITION_CLOSED:
      dispositionsByCard.size === resultCardQueries.size,
    PRIMARY_CORPUS_FROZEN: primary && plan.frozen_before_outcome_classification,
    PRIMARY_SEARCHES_DIRECTIONALLY_NEUTRAL: plan.queries.every(({ neutrality }) =>
      neutrality.status === "NEUTRAL"
    ),
    PRIMARY_CORPUS_DEDUPED: canonicalDeduped,
    DENOMINATOR_EXPLICIT: denominatorType !== "NONE",
    SENSITIVITY_RESULTS_SEPARATED: rawInput.sensitivityResultsSeparated,
    RETRIEVAL_COMPLETENESS_ACCEPTABLE: relevant.every(({ retrieval_state, excluded_from_user_prevalence }) =>
      ["FULL", "DETERMINISTIC_SAMPLE"].includes(retrieval_state) || excluded_from_user_prevalence
    ),
    MATERIALITY_RESOLVED: materialityResolved,
    USER_DEDUP_ACCEPTABLE: new Set(reconciled.map(({ identityKey }) => identityKey)).size === reconciled.length &&
      (anonymousCount === 0 || rawInput.anonymousIdentityBounds !== undefined)
  });
  const gatePass = Object.values(gateChecks).every(Boolean) && plan.prevalence_eligible;
  const exactIdentity = anonymousCount === 0;
  const firsthandAllowed = gatePass && exactIdentity &&
    denominatorType === "FIRSTHAND_FORUM_USER_DENOMINATOR" &&
    inclusive.length > 0;
  const landscapeAllowed = gatePass && denominatorType === "SEARCH_LANDSCAPE_RESULT_CARD_DENOMINATOR" &&
    ledger.relevant_threads > 0;
  const boundedFirsthandAllowed = gatePass && !exactIdentity &&
    denominatorType === "FIRSTHAND_FORUM_USER_DENOMINATOR" &&
    denominatorBounds.upper_bound > 0;
  const receipt = communityEvidenceDenominatorReceiptV2Schema.parse({
    receipt_version: "askrigor_community_denominator_receipt_v2",
    plan_sha256: plan.plan_sha256,
    corpus_version: plan.corpus_version,
    corpus_purpose: plan.corpus_purpose,
    ledger_sha256: sha256(canonicalJson(ledger)),
    gate_checks: gateChecks,
    forum_signal_prevalence: firsthandAllowed || landscapeAllowed ? "ALLOWED" : "BLOCKED",
    case_discovery: "ALLOWED",
    firsthand_user_prevalence_allowed: firsthandAllowed,
    firsthand_user_bounded_frequency_allowed: boundedFirsthandAllowed,
    search_landscape_prevalence_allowed: landscapeAllowed,
    exact_frequency_allowed: firsthandAllowed || landscapeAllowed,
    frequency_basis: {
      denominator_type: denominatorType,
      corpus_version: plan.corpus_version,
      exact_denominators: {
        search_landscape: landscapeAllowed ? ledger.relevant_threads : null,
        firsthand_inclusive: firsthandAllowed ? inclusive.length : null,
        firsthand_strict: firsthandAllowed ? strict.length : null
      },
      denominator_bounds: denominatorType === "FIRSTHAND_FORUM_USER_DENOMINATOR"
        ? denominatorBounds
        : {
          lower_bound: ledger.relevant_threads,
          upper_bound: ledger.relevant_threads
        },
      search_landscape: ledger.search_landscape,
      user_outcomes_inclusive: ledger.user_outcomes_inclusive,
      user_outcomes_strict: ledger.user_outcomes_strict,
      user_outcome_bounds_inclusive: ledger.user_outcome_bounds_inclusive,
      user_outcome_bounds_strict: ledger.user_outcome_bounds_strict,
      strict_denominator_bounds: ledger.firsthand_user_strict_denominator_bounds
    },
    mandatory_wording: boundedFirsthandAllowed
      ? "Identity uncertainty permits only bounded forum-corpus frequencies; these bounds are not population response rates."
      : gatePass
        ? denominatorType === "FIRSTHAND_FORUM_USER_DENOMINATOR"
        ? "These percentages describe the predefined forum corpus, not population response rates."
        : "This describes the search landscape, not the proportion of users who experience an outcome."
      : !plan.prevalence_eligible && plan.queries.some(({ neutrality }) =>
          neutrality.status !== "NEUTRAL"
        )
        ? "These outcome-targeted searches are suitable for identifying the range of reported experiences, not their prevalence. A predefined neutral corpus is required to estimate forum direction."
        : primary
        ? "I can identify recurring positive and negative reports, but I do not yet have a denominator from which to estimate their relative forum prevalence."
        : "Targeted searches identify recurring positive and negative reports, but because the corpus was deliberately enriched for outcome directions, relative forum prevalence cannot be estimated.",
    measurement_confidence: gatePass
      ? relevant.some(({ promotional_source }) => promotional_source) ? "MODERATE" : "HIGH"
      : relevant.length > 0 ? "LOW" : "INDETERMINATE",
    causal_attribution_confidence: strict.length === 0
      ? inclusive.length > 0 ? "LOW" : "INDETERMINATE"
      : strict.length === inclusive.length ? "MODERATE" : "LOW",
    robustness_views: rawInput.robustnessViews ?? []
  });
  return { ledger, receipt };
}

export function normalizeLegacyForumCorpusV1(value: unknown): {
  legacy: unknown;
  corpus_purpose: "PHENOTYPE_DISCOVERY";
  prevalence_eligible: false;
  outside_primary_denominator: true;
} {
  return {
    legacy: value,
    corpus_purpose: "PHENOTYPE_DISCOVERY",
    prevalence_eligible: false,
    outside_primary_denominator: true
  };
}

export function communityEvidenceDenominatorReceiptSha256(
  receipt: z.output<typeof communityEvidenceDenominatorReceiptV2Schema>
): string {
  return sha256(canonicalJson(communityEvidenceDenominatorReceiptV2Schema.parse(receipt)));
}

function reconcileFirsthandUsers(episodes: z.output<typeof forumUserEpisodeSchema>[]) {
  const groups = new Map<string, z.output<typeof forumUserEpisodeSchema>[]>();
  episodes.forEach((episode, index) => {
    const key = episode.identity.identity_kind === "ANONYMOUS_OR_DELETED"
      ? `anonymous:${index}:${episode.episode_id}`
      : `${episode.identity.identity_kind}:${episode.identity.identity_value}`;
    groups.set(key, [...(groups.get(key) ?? []), episode]);
  });
  return [...groups.entries()].map(([identityKey, values]) => {
    const ordered = [...values].sort((a, b) => a.chronological_index - b.chronological_index);
    const outcomeValues = new Set(ordered.map(({ outcome }) => outcome));
    const mixedLongitudinal = outcomeValues.has("BENEFIT") &&
      outcomeValues.has("WORSENED");
    const contributing = mixedLongitudinal
      ? ordered.filter(({ outcome }) => ["BENEFIT", "WORSENED"].includes(outcome))
      : [ordered.at(-1)!];
    const outcome = mixedLongitudinal
      ? "MIXED" as const
      : contributing[0]!.duration === "FIRST_EXPOSURE" &&
          contributing[0]!.outcome === "BENEFIT"
        ? "TOO_EARLY" as const
        : contributing[0]!.outcome;
    const attributionOrder = [
      "A3_WITHIN_PERSON_DISCRIMINATOR",
      "A1_ISOLATED",
      "A2_STABLE_COINTERVENTIONS",
      "B_CONCURRENT_NEW_CHANGES",
      "C_ATTRIBUTION_IMPOSSIBLE"
    ] as const;
    const attribution = [...contributing].sort((a, b) =>
      attributionOrder.indexOf(b.attribution) - attributionOrder.indexOf(a.attribution)
    )[0]!.attribution;
    const quadrants = new Set(contributing.map(({ marker_benefit_quadrant }) =>
      marker_benefit_quadrant
    ));
    return {
      identityKey,
      outcome,
      attribution,
      markerBenefitQuadrant: quadrants.size === 1
        ? contributing[0]!.marker_benefit_quadrant
        : "UNCLASSIFIABLE" as const,
      exposureEpisodes: ordered.map(({ episode_id }) => episode_id),
      contributingEpisodeIds: contributing.map(({ episode_id }) => episode_id)
    };
  });
}

function assertSameQueryReplacementOrder(
  searches: z.output<typeof forumSearchReceiptSchema>[],
  threads: z.output<typeof forumThreadRecordSchema>[]
): void {
  const disposition = new Map(threads.map((thread) => [
    thread.result_card_id,
    thread
  ]));
  const replacementBindings = new Set(threads.flatMap((thread) =>
    (thread.replacement_for_result_cards ?? []).map(({ query_id, rejected_result_card_id }) =>
      `${thread.result_card_id}\u0000${query_id}\u0000${rejected_result_card_id}`
    )
  ));
  for (const search of searches) {
    for (const [index, resultCardId] of search.retrieved_result_card_ids.entries()) {
      const rejected = disposition.get(resultCardId);
      if (
        rejected?.materiality !== "REJECTED" ||
        rejected.exclusion_reason === "DUPLICATE"
      ) continue;
      const nextEligibleId = search.retrieved_result_card_ids.slice(index + 1)
        .find((candidateId) =>
          disposition.get(candidateId)?.materiality === "CONFIRMED"
        );
      if (nextEligibleId !== undefined && !replacementBindings.has(
        `${nextEligibleId}\u0000${search.query_id}\u0000${resultCardId}`
      )) {
        throw new Error(
          "A rejected source replacement must be the next eligible result from the same frozen search"
        );
      }
    }
  }
  for (const thread of threads) {
    for (const binding of thread.replacement_for_result_cards ?? []) {
      const search = searches.find(({ query_id }) => query_id === binding.query_id);
      const rejected = disposition.get(binding.rejected_result_card_id);
      if (search === undefined || rejected?.materiality !== "REJECTED") {
        throw new Error("A replacement must identify a rejected result card in the same frozen search");
      }
      const rejectedIndex = search.retrieved_result_card_ids.indexOf(
        binding.rejected_result_card_id
      );
      const replacementIndex = search.retrieved_result_card_ids.indexOf(
        thread.result_card_id
      );
      const intervening = search.retrieved_result_card_ids.slice(
        rejectedIndex + 1,
        replacementIndex
      );
      if (
        rejectedIndex < 0 ||
        replacementIndex <= rejectedIndex ||
        intervening.some((candidateId) =>
          disposition.get(candidateId)?.materiality === "CONFIRMED"
        )
      ) {
        throw new Error(
          "A rejected source replacement must be the next eligible result from the same frozen search"
        );
      }
    }
  }
}

function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  return new Set(actual).size === actual.length &&
    actual.length === expected.length &&
    actual.every((value) => expected.includes(value));
}

function promotionalEpisodeEligible(episode: z.output<typeof forumUserEpisodeSchema>): boolean {
  return !["VENDOR_ACCOUNT", "AFFILIATE_CREATOR", "CREATOR_SELF_PROMOTION"]
    .includes(episode.source_role) || episode.genuine_personal_outcome_from_promotional_role;
}

function normalizedCanonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid|gclid)/u.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
