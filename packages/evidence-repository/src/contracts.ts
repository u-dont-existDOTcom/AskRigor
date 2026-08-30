import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const uuidSchema = z.uuid();
const timestampSchema = z.string().datetime({ offset: true });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const nonemptyTextSchema = z.string().min(1);
const boundedLabelSchema = z.string().trim().min(1).max(500);
const evidenceLocatorSchema = z.string().trim().min(1).max(2_048);

export const protocolManifestSchema = z.object({
  name: boundedLabelSchema,
  version: boundedLabelSchema,
  revisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  sha256: sha256Schema,
}).strict();

export const analysisSectionSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  sectionKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u),
  title: boundedLabelSchema,
  content: nonemptyTextSchema,
}).strict();

export const analysisDomainFindingSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  rubric: z.enum(["study_method_v1", "review_method_v1", "general_analysis_v1"]),
  domain: z.string().regex(/^[a-z0-9][a-z0-9_]{0,199}$/u),
  status: z.enum(["adequate", "limitation_identified", "unclear", "not_applicable"]),
  finding: nonemptyTextSchema,
  evidenceLocators: z.array(evidenceLocatorSchema),
  unresolvedFields: z.array(nonemptyTextSchema),
  limitations: z.array(nonemptyTextSchema),
}).strict();

export const claimCapabilitySchema = z.object({
  ordinal: z.number().int().nonnegative(),
  claim: nonemptyTextSchema,
  capability: z.enum(["can_support", "cannot_support", "unclear"]),
  reason: nonemptyTextSchema,
  evidenceLocators: z.array(evidenceLocatorSchema),
}).strict();

export const futureAnalysisItemSchema = z.object({
  itemId: uuidSchema,
  question: nonemptyTextSchema,
  rationale: nonemptyTextSchema,
  priority: z.enum(["low", "medium", "high", "decision_critical"]),
  status: z.enum(["open", "resolved", "cancelled"]),
  evidenceNeeded: z.array(nonemptyTextSchema),
  resolvedByVersionId: uuidSchema.nullable(),
}).strict();

const sourceSchema = z.object({
  familyId: uuidSchema,
  versionId: uuidSchema,
  sourceKind: z.enum(["study", "review", "guideline", "registry", "other"]),
  identityHash: sha256Schema,
  displayTitle: boundedLabelSchema,
  identifiers: z.array(z.object({
    scheme: z.enum(["doi", "pmid", "pmcid", "arxiv", "nct", "url", "other"]),
    value: z.string().trim().min(1).max(2_048),
  }).strict()).min(1),
  sourceContentSha256: sha256Schema.nullable(),
  accessStatus: z.enum([
    "complete",
    "partial",
    "abstract_only",
    "metadata_only",
    "inaccessible",
    "not_found",
  ]),
  retrievedAt: timestampSchema.nullable(),
  sourceLocator: evidenceLocatorSchema.nullable(),
  rawContentPersisted: z.literal(false),
}).strict();

const topicSchema = z.object({
  topicId: uuidSchema,
  canonicalKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u),
  label: boundedLabelSchema,
}).strict();

const receiptSchema = z.object({
  receiptId: uuidSchema,
  receiptKind: boundedLabelSchema,
  receiptSha256: sha256Schema,
  locator: evidenceLocatorSchema.nullable(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
}).strict();

const questionDimensionsSchema = z.object({
  population: nonemptyTextSchema.nullable(),
  programOrExposure: nonemptyTextSchema.nullable(),
  comparator: nonemptyTextSchema.nullable(),
  outcome: nonemptyTextSchema.nullable(),
  horizon: nonemptyTextSchema.nullable(),
  setting: nonemptyTextSchema.nullable(),
}).strict();

const questionSchema = z.object({
  questionId: uuidSchema,
  normalizedQuestion: nonemptyTextSchema,
  dimensions: questionDimensionsSchema,
}).strict();

const researchRunSchema = z.object({
  runId: uuidSchema,
  runKind: z.enum(["live_research", "historical_import", "clarification", "correction", "synthetic_fixture"]),
  startedAt: timestampSchema,
  completedAt: timestampSchema,
  protocolManifests: z.array(protocolManifestSchema).min(1),
  provenanceNote: nonemptyTextSchema,
}).strict();

const topicEdgeSchema = z.object({
  edgeId: uuidSchema,
  fromTopicId: uuidSchema,
  toTopicId: uuidSchema,
  relation: z.enum(["broader_than", "narrower_than", "related_to"]),
}).strict();

const claimVersionSchema = z.object({
  claimId: uuidSchema,
  versionId: uuidSchema,
  questionId: uuidSchema,
  normalizedAssertion: nonemptyTextSchema,
  claimType: z.enum(["effect", "harm", "method", "applicability", "access", "other"]),
  dimensions: questionDimensionsSchema,
  direction: z.enum(["benefit", "harm", "no_effect", "mixed", "descriptive", "unclear"]),
  inferenceType: z.enum(["causal", "associational", "descriptive", "methodological", "unknown"]),
  capabilityState: z.enum(["can_support", "cannot_support", "uncertain"]),
  uncertaintyAndLimitations: z.array(nonemptyTextSchema),
  status: z.enum(["current", "stale", "superseded", "invalidated"]),
  supersedesClaimVersionId: uuidSchema.nullable(),
}).strict();

const evidenceBindingSchema = z.object({
  bindingId: uuidSchema,
  claimVersionId: uuidSchema,
  sourceVersionId: uuidSchema,
  locator: evidenceLocatorSchema,
  polarity: z.enum(["supports", "refutes", "qualifies", "context_only"]),
  extractionType: z.enum(["source_bound_audit", "authored_synthesis", "metadata_only", "historical_import"]),
  capabilityCeiling: z.enum(["can_support", "cannot_support", "uncertain"]),
  validationReceiptId: uuidSchema.nullable(),
  limitations: z.array(nonemptyTextSchema),
}).strict();

const sourceEdgeSchema = z.object({
  edgeId: uuidSchema,
  fromSourceVersionId: uuidSchema,
  toSourceVersionId: uuidSchema,
  relation: z.enum(["corrects", "retracts", "updates", "includes", "excludes", "duplicates", "shares_population_or_dataset_with"]),
  confidence: z.enum(["verified", "provider_reported", "inferred", "uncertain"]),
  uncertainty: nonemptyTextSchema.nullable(),
  supersedesEdgeId: uuidSchema.nullable(),
}).strict();

const claimEdgeSchema = z.object({
  edgeId: uuidSchema,
  fromClaimVersionId: uuidSchema,
  toClaimVersionId: uuidSchema,
  relation: z.enum(["supports", "refutes", "qualifies", "depends_on", "duplicates", "supersedes", "contradicts"]),
  confidence: z.enum(["verified", "inferred", "uncertain"]),
  uncertainty: nonemptyTextSchema.nullable(),
  supersedesEdgeId: uuidSchema.nullable(),
}).strict();

const assessmentSchema = z.object({
  assessmentId: uuidSchema,
  versionId: uuidSchema,
  rubric: z.enum(["study_method_v1", "review_method_v1", "general_analysis_v1"]),
  rubricVersion: boundedLabelSchema,
  assessorType: z.enum(["deterministic_validator", "model", "human", "imported_framework"]),
  assessorIdentifier: boundedLabelSchema,
  internalValidity: z.object({ status: z.enum(["adequate", "limitation_identified", "unclear", "not_applicable"]), reason: nonemptyTextSchema }).strict(),
  applicability: z.object({ status: z.enum(["adequate", "limitation_identified", "unclear", "not_applicable"]), reason: nonemptyTextSchema }).strict(),
  disagreementState: z.enum(["none_recorded", "unresolved", "adjudicated"]),
  supersedesAssessmentVersionId: uuidSchema.nullable(),
}).strict();

const freshnessPolicySchema = z.object({
  policyId: uuidSchema,
  sourceClass: z.enum(["study", "review", "guideline", "registry", "other"]),
  cadenceDays: z.number().int().positive().max(3_650),
  maximumAgeDays: z.number().int().positive().max(3_650),
  ownerRole: boundedLabelSchema,
  requiredChecks: z.array(boundedLabelSchema).min(1),
  failureBehavior: z.enum(["mark_stale", "mark_inaccessible", "block_current_projection"]),
}).strict();

const freshnessCheckSchema = z.object({
  checkId: uuidSchema,
  policyId: uuidSchema,
  checkedAt: timestampSchema,
  outcome: z.enum(["current", "changed", "partial", "inaccessible", "error"]),
  projectionState: z.enum(["current", "due", "checking", "stale", "inaccessible", "superseded", "invalidated"]),
  nextDueAt: timestampSchema.nullable(),
  receiptSha256: sha256Schema,
  limitations: z.array(nonemptyTextSchema),
}).strict();

const impactJobSchema = z.object({
  jobId: uuidSchema,
  status: z.enum(["pending", "complete", "failed"]),
  affectedClaimVersionIds: z.array(uuidSchema),
  impactReceiptSha256: sha256Schema.nullable(),
  failureCode: boundedLabelSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "complete" && value.impactReceiptSha256 === null) {
    context.addIssue({ code: "custom", path: ["impactReceiptSha256"], message: "a completed impact job requires a receipt hash" });
  }
  if (value.status === "failed" && value.failureCode === null) {
    context.addIssue({ code: "custom", path: ["failureCode"], message: "a failed impact job requires a failure code" });
  }
});

const knowledgeContributionSchema = z.object({
  question: questionSchema.nullable(),
  topicEdges: z.array(topicEdgeSchema),
  claims: z.array(claimVersionSchema),
  evidenceBindings: z.array(evidenceBindingSchema),
  sourceEdges: z.array(sourceEdgeSchema),
  claimEdges: z.array(claimEdgeSchema),
  assessment: assessmentSchema.nullable(),
  freshnessPolicy: freshnessPolicySchema.nullable(),
  freshnessChecks: z.array(freshnessCheckSchema),
  impactJob: impactJobSchema.nullable(),
}).strict();

export const livingEvidenceContributionSchema = z.object({
  schemaVersion: z.literal(1),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u),
  run: researchRunSchema,
  topic: topicSchema.nullable(),
  source: sourceSchema.nullable(),
  analysis: z.object({
    analysisId: uuidSchema,
    versionId: uuidSchema,
    analysisKind: z.enum([
      "topic_synthesis",
      "study_method_audit",
      "review_method_audit",
      "claim_recalculation",
      "clarification",
      "correction",
      "invalidation",
    ]),
    relationship: z.enum(["initial", "clarifies", "corrects", "supersedes", "invalidates"]),
    previousVersionId: uuidSchema.nullable(),
    captureStatus: z.enum([
      "complete_performed_analysis",
      "partial_historical_capture",
      "clarification",
      "correction",
      "invalidation",
    ]),
    authoredAt: timestampSchema,
    coverageStatement: nonemptyTextSchema,
    declaredWholeTextSha256: sha256Schema.nullable(),
    sections: z.array(analysisSectionSchema).min(1),
    domains: z.array(analysisDomainFindingSchema),
    claimCapabilities: z.array(claimCapabilitySchema),
    futureAnalysisItems: z.array(futureAnalysisItemSchema),
  }).strict(),
  receipts: z.array(receiptSchema),
  knowledge: knowledgeContributionSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.topic === null && value.source === null) {
    context.addIssue({ code: "custom", path: ["topic"], message: "an analysis needs a topic or source target" });
  }
  const { relationship, previousVersionId, captureStatus } = value.analysis;
  if ((relationship === "initial") !== (previousVersionId === null)) {
    context.addIssue({
      code: "custom",
      path: ["analysis", "previousVersionId"],
      message: "only an initial version may omit its previous version",
    });
  }
  if (relationship === "invalidates" && captureStatus !== "invalidation") {
    context.addIssue({
      code: "custom",
      path: ["analysis", "captureStatus"],
      message: "an invalidating relationship requires invalidation capture status",
    });
  }
  for (const [field, rows] of [
    ["sections", value.analysis.sections],
    ["domains", value.analysis.domains],
    ["claimCapabilities", value.analysis.claimCapabilities],
  ] as const) {
    const ordinals = rows.map(({ ordinal }) => ordinal);
    if (ordinals.some((ordinal, index) => ordinal !== index)) {
      context.addIssue({
        code: "custom",
        path: ["analysis", field],
        message: `${field} ordinals must be contiguous and begin at zero`,
      });
    }
  }
  const sectionKeys = value.analysis.sections.map(({ sectionKey }) => sectionKey);
  if (new Set(sectionKeys).size !== sectionKeys.length) {
    context.addIssue({
      code: "custom",
      path: ["analysis", "sections"],
      message: "analysis section keys must be unique",
    });
  }
  for (const [index, item] of value.analysis.futureAnalysisItems.entries()) {
    if ((item.status === "resolved") !== (item.resolvedByVersionId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["analysis", "futureAnalysisItems", index, "resolvedByVersionId"],
        message: "only a resolved future-analysis item may name its resolving version",
      });
    }
  }
  if (value.knowledge?.question !== null && value.knowledge?.question !== undefined && value.topic === null) {
    context.addIssue({ code: "custom", path: ["knowledge", "question"], message: "a structured question requires a topic" });
  }
  if (value.knowledge?.assessment !== null && value.knowledge?.assessment !== undefined && value.source === null) {
    context.addIssue({ code: "custom", path: ["knowledge", "assessment"], message: "an assessment requires a source" });
  }
  if (value.knowledge?.freshnessPolicy !== null && value.knowledge?.freshnessPolicy !== undefined && value.source === null) {
    context.addIssue({ code: "custom", path: ["knowledge", "freshnessPolicy"], message: "a freshness policy requires a source" });
  }
});

export type LivingEvidenceContribution = z.infer<typeof livingEvidenceContributionSchema>;

const formalFrontierSourceClassSchema = z.enum([
  "study",
  "review",
  "guideline",
  "registry",
  "book",
  "grey_literature",
  "other",
]);

const frontierWindowSchema = z.object({
  start: dateSchema,
  endExclusive: dateSchema,
}).strict().superRefine((value, context) => {
  if (value.start >= value.endExclusive) {
    context.addIssue({ code: "custom", message: "a frontier window must have start before endExclusive" });
  }
});

const frontierLaneSchema = z.object({
  laneId: uuidSchema,
  canonicalKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u),
  sourceClass: formalFrontierSourceClassSchema,
  provider: boundedLabelSchema,
  label: boundedLabelSchema,
}).strict();

const frontierPassSchema = z.object({
  passId: uuidSchema,
  laneId: uuidSchema,
  deidentifiedQuery: z.string().trim().min(1).max(10_000),
  declaredQuerySha256: sha256Schema,
  executedAt: timestampSchema,
  coverageBasis: z.enum(["publication_date", "index_date", "provider_unspecified"]),
  requestedWindow: frontierWindowSchema.nullable(),
  confirmedWindow: frontierWindowSchema.nullable(),
  coverageRelation: z.enum(["initial", "full_refresh", "contiguous_delta", "overlap_delta", "gap_delta", "unscoped"]),
  deltaFromPassId: uuidSchema.nullable(),
  status: z.enum(["complete", "partial", "blocked_retryable", "blocked_terminal"]),
  accessStatus: z.enum([
    "complete",
    "api_visible_complete",
    "partial",
    "abstract_only",
    "metadata_only",
    "inaccessible",
    "rate_limited",
    "not_found",
    "error",
  ]),
  exhausted: z.boolean(),
  retrievedCandidateCount: z.number().int().nonnegative(),
  screenedCandidateCount: z.number().int().nonnegative(),
  selectedCandidateCount: z.number().int().nonnegative(),
  nextCapability: nonemptyTextSchema.nullable(),
  blockedReasonCode: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u).nullable(),
  receiptSha256: sha256Schema,
  limitations: z.array(nonemptyTextSchema),
}).strict();

const frontierCandidateVersionSchema = z.object({
  candidateId: uuidSchema,
  versionId: uuidSchema,
  observedInPassId: uuidSchema,
  candidateKind: formalFrontierSourceClassSchema,
  identifiers: z.array(z.object({
    scheme: z.enum(["doi", "pmid", "pmcid", "arxiv", "nct", "isbn", "url", "other"]),
    value: z.string().trim().min(1).max(2_048),
  }).strict()).min(1),
  displayTitle: boundedLabelSchema,
  publicationDate: dateSchema.nullable(),
  decision: z.enum(["selected", "excluded", "deferred", "unresolved"]),
  decisionReason: nonemptyTextSchema,
  relevanceSummary: nonemptyTextSchema,
  sourceFamilyId: uuidSchema.nullable(),
  previousVersionId: uuidSchema.nullable(),
}).strict();

const frontierTrailVersionSchema = z.object({
  trailId: uuidSchema,
  versionId: uuidSchema,
  trailKind: z.enum([
    "unresolved_question",
    "unattempted_search",
    "blocked_source",
    "formal_followup",
    "discriminator_search",
    "coverage_gap",
    "delta_search",
  ]),
  laneId: uuidSchema.nullable(),
  targetWindow: frontierWindowSchema.nullable(),
  description: nonemptyTextSchema,
  rationale: nonemptyTextSchema,
  priority: z.enum(["low", "medium", "high", "decision_critical"]),
  state: z.enum(["open", "ready", "blocked_retryable", "blocked_terminal", "resolved", "cancelled"]),
  nextCapability: nonemptyTextSchema.nullable(),
  blockedReasonCode: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u).nullable(),
  resolutionNote: nonemptyTextSchema.nullable(),
  previousVersionId: uuidSchema.nullable(),
}).strict();

export const researchFrontierContributionSchema = z.object({
  schemaVersion: z.literal(1),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u),
  contributionId: uuidSchema,
  persistenceBoundary: z.object({
    rawSourceContentPersisted: z.literal(false),
    rawProviderResponsePersisted: z.literal(false),
    personalDataPersisted: z.literal(false),
    communityDataPersisted: z.literal(false),
  }).strict(),
  run: researchRunSchema,
  topic: topicSchema,
  question: questionSchema,
  frontier: z.object({
    frontierId: uuidSchema,
    lanes: z.array(frontierLaneSchema),
    passes: z.array(frontierPassSchema),
    candidateVersions: z.array(frontierCandidateVersionSchema),
    trailVersions: z.array(frontierTrailVersionSchema),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.run.completedAt) < Date.parse(value.run.startedAt)) {
    context.addIssue({ code: "custom", path: ["run", "completedAt"], message: "frontier run completion precedes its start" });
  }
  if (
    value.frontier.passes.length === 0 &&
    value.frontier.candidateVersions.length === 0 &&
    value.frontier.trailVersions.length === 0
  ) {
    context.addIssue({ code: "custom", path: ["frontier"], message: "a frontier contribution must contain a pass, candidate version, or trail version" });
  }
  for (const [path, values] of [
    [["frontier", "lanes"], value.frontier.lanes.map(({ laneId }) => laneId)],
    [["frontier", "passes"], value.frontier.passes.map(({ passId }) => passId)],
    [["frontier", "candidateVersions"], value.frontier.candidateVersions.map(({ versionId }) => versionId)],
    [["frontier", "trailVersions"], value.frontier.trailVersions.map(({ versionId }) => versionId)],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [...path], message: "frontier contribution identifiers must be unique within their collection" });
    }
  }
  const lanes = new Map(value.frontier.lanes.map((lane) => [lane.laneId, lane]));
  const passes = new Map(value.frontier.passes.map((pass) => [pass.passId, pass]));
  const laneCoverageBases = new Map<string, z.infer<typeof frontierPassSchema>["coverageBasis"]>();
  for (const [index, lane] of value.frontier.lanes.entries()) {
    if (/(?:youtube|youtu\.be|reddit|forum|community)/iu.test(lane.provider)) {
      context.addIssue({
        code: "custom",
        path: ["frontier", "lanes", index, "provider"],
        message: "community and video providers are outside the durable frontier boundary",
      });
    }
  }
  for (const [index, candidate] of value.frontier.candidateVersions.entries()) {
    if (candidate.identifiers.some(({ scheme, value: identifier }) =>
      scheme === "url" && /(?:youtube\.com|youtu\.be|reddit\.com|\/forum(?:s)?(?:\/|$))/iu.test(identifier)
    )) {
      context.addIssue({
        code: "custom",
        path: ["frontier", "candidateVersions", index, "identifiers"],
        message: "community and video locators are outside the durable frontier boundary",
      });
    }
  }
  for (const [index, pass] of value.frontier.passes.entries()) {
    const path = ["frontier", "passes", index] as const;
    if (!lanes.has(pass.laneId)) {
      context.addIssue({ code: "custom", path: [...path, "laneId"], message: "every contributed pass must include its lane definition" });
    }
    const priorCoverageBasis = laneCoverageBases.get(pass.laneId);
    if (priorCoverageBasis !== undefined && priorCoverageBasis !== pass.coverageBasis) {
      context.addIssue({ code: "custom", path: [...path, "coverageBasis"], message: "all passes in a frontier lane must use one temporal coverage basis" });
    } else {
      laneCoverageBases.set(pass.laneId, pass.coverageBasis);
    }
    if (pass.selectedCandidateCount > pass.screenedCandidateCount || pass.screenedCandidateCount > pass.retrievedCandidateCount) {
      context.addIssue({ code: "custom", path: [...path], message: "frontier pass counts must satisfy selected <= screened <= retrieved" });
    }
    if (pass.coverageBasis === "provider_unspecified" && (pass.requestedWindow !== null || pass.confirmedWindow !== null)) {
      context.addIssue({ code: "custom", path: [...path], message: "provider-unspecified coverage cannot claim a date window" });
    }
    if (pass.coverageBasis !== "provider_unspecified" && pass.requestedWindow === null) {
      context.addIssue({ code: "custom", path: [...path, "requestedWindow"], message: "dated coverage requires a requested window" });
    }
    if (pass.status === "complete") {
      if (!pass.exhausted || pass.nextCapability !== null || pass.blockedReasonCode !== null) {
        context.addIssue({ code: "custom", path: [...path], message: "a complete pass must be exhausted and have no continuation or blocked reason" });
      }
      if (stableWindow(pass.requestedWindow) !== stableWindow(pass.confirmedWindow)) {
        context.addIssue({ code: "custom", path: [...path, "confirmedWindow"], message: "a complete dated pass must confirm its exact requested window" });
      }
    }
    if (pass.status === "partial" && (pass.exhausted || pass.nextCapability === null || pass.blockedReasonCode !== null)) {
      context.addIssue({ code: "custom", path: [...path], message: "a partial pass must remain unexhausted with one next capability" });
    }
    if (pass.status === "blocked_retryable" && (
      pass.exhausted || pass.nextCapability === null || pass.blockedReasonCode === null || pass.confirmedWindow !== null
    )) {
      context.addIssue({ code: "custom", path: [...path], message: "a retryable block requires a reason and next capability and cannot claim confirmed coverage" });
    }
    if (pass.status === "blocked_terminal" && (
      pass.exhausted || pass.nextCapability !== null || pass.blockedReasonCode === null || pass.confirmedWindow !== null
    )) {
      context.addIssue({ code: "custom", path: [...path], message: "a terminal block requires a reason and cannot claim confirmed coverage or continuation" });
    }
    const isDelta = ["contiguous_delta", "overlap_delta", "gap_delta"].includes(pass.coverageRelation);
    if (isDelta !== (pass.deltaFromPassId !== null)) {
      context.addIssue({ code: "custom", path: [...path, "deltaFromPassId"], message: "only a delta relationship may name a prior pass" });
    }
    if (pass.coverageRelation === "unscoped" && (pass.requestedWindow !== null || pass.deltaFromPassId !== null)) {
      context.addIssue({ code: "custom", path: [...path], message: "unscoped coverage cannot name a date window or prior pass" });
    }
    if (pass.deltaFromPassId !== null) {
      const prior = passes.get(pass.deltaFromPassId);
      if (prior !== undefined) validateInContributionDelta(value, pass, prior, index, context);
    }
    const observed = value.frontier.candidateVersions.filter(({ observedInPassId }) => observedInPassId === pass.passId);
    const selected = observed.filter(({ decision }) => decision === "selected");
    if (observed.length !== pass.screenedCandidateCount || selected.length !== pass.selectedCandidateCount) {
      context.addIssue({ code: "custom", path: [...path], message: "submitted candidate decisions must reconcile with pass screening counts" });
    }
  }
  for (const [index, trail] of value.frontier.trailVersions.entries()) {
    const path = ["frontier", "trailVersions", index] as const;
    const executable = trail.state === "open" || trail.state === "ready" || trail.state === "blocked_retryable";
    if (executable && trail.nextCapability === null) {
      context.addIssue({ code: "custom", path: [...path, "nextCapability"], message: "a nonterminal trail requires an executable next capability" });
    }
    if (trail.state === "blocked_retryable" && trail.blockedReasonCode === null) {
      context.addIssue({ code: "custom", path: [...path, "blockedReasonCode"], message: "a retryable trail block requires a reason" });
    }
    if (trail.state === "blocked_terminal" && (trail.blockedReasonCode === null || trail.nextCapability !== null)) {
      context.addIssue({ code: "custom", path: [...path], message: "a terminal trail block requires a reason and no next capability" });
    }
    const finished = trail.state === "resolved" || trail.state === "cancelled";
    if (finished !== (trail.resolutionNote !== null) || (finished && trail.nextCapability !== null)) {
      context.addIssue({ code: "custom", path: [...path], message: "resolved or cancelled trails require a resolution note and no next capability" });
    }
    if ((trail.trailKind === "coverage_gap" || trail.trailKind === "delta_search") && (trail.laneId === null || trail.targetWindow === null)) {
      context.addIssue({ code: "custom", path: [...path], message: "coverage-gap and delta-search trails require a lane and target window" });
    }
  }
});

function stableWindow(value: { start: string; endExclusive: string } | null): string {
  return value === null ? "null" : `${value.start}/${value.endExclusive}`;
}

function validateInContributionDelta(
  contribution: z.infer<typeof researchFrontierContributionSchema>,
  pass: z.infer<typeof frontierPassSchema>,
  prior: z.infer<typeof frontierPassSchema>,
  passIndex: number,
  context: z.RefinementCtx,
): void {
  const path = ["frontier", "passes", passIndex] as const;
  if (prior.laneId !== pass.laneId || prior.confirmedWindow === null || pass.requestedWindow === null) {
    context.addIssue({ code: "custom", path: [...path], message: "a delta requires a prior confirmed pass in the same lane and a requested window" });
    return;
  }
  const priorEnd = prior.confirmedWindow.endExclusive;
  const nextStart = pass.requestedWindow.start;
  const actual = nextStart === priorEnd ? "contiguous_delta" : nextStart < priorEnd ? "overlap_delta" : "gap_delta";
  if (pass.coverageRelation !== actual) {
    context.addIssue({ code: "custom", path: [...path, "coverageRelation"], message: `delta relationship must be ${actual}` });
  }
  if (actual !== "gap_delta") return;
  const hasGapTrail = contribution.frontier.trailVersions.some((trail) =>
    trail.trailKind === "coverage_gap" &&
    trail.laneId === pass.laneId &&
    trail.targetWindow?.start === priorEnd &&
    trail.targetWindow.endExclusive === nextStart &&
    !["resolved", "cancelled"].includes(trail.state)
  );
  if (!hasGapTrail) {
    context.addIssue({ code: "custom", path: [...path], message: "a gapped delta requires an explicit open coverage-gap trail" });
  }
}

export type ResearchFrontierContribution = z.infer<typeof researchFrontierContributionSchema>;

const PROHIBITED_PERSISTENT_KEYS = new Set([
  "authorization",
  "authorizationheader",
  "apikey",
  "authorchannelidentity",
  "authoridentity",
  "chat",
  "chathistory",
  "commenttext",
  "commenteridentity",
  "comments",
  "credential",
  "credentials",
  "personalhealthnarrative",
  "personidentity",
  "prompt",
  "providerresponse",
  "rawarticle",
  "rawbody",
  "rawchat",
  "rawcomment",
  "rawcomments",
  "rawcontent",
  "rawproviderresponse",
  "rawtranscript",
  "rawreplies",
  "replies",
  "replytext",
  "secret",
  "transcript",
  "userid",
  "username",
]);

export function assertNoProhibitedPersistentKeys(value: unknown, path = "$", seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoProhibitedPersistentKeys(item, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/gu, "");
    const isRequiredNegativeMarker = key === "rawContentPersisted" && child === false;
    if (
      (key === "rawContentPersisted" && child !== false) ||
      (PROHIBITED_PERSISTENT_KEYS.has(normalizedKey) && !isRequiredNegativeMarker)
    ) {
      throw new Error(`PROHIBITED_PERSISTENT_KEY path=${path}.${key}`);
    }
    assertNoProhibitedPersistentKeys(child, `${path}.${key}`, seen);
  }
}
