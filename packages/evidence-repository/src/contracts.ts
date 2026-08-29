import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const uuidSchema = z.uuid();
const timestampSchema = z.string().datetime({ offset: true });
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
  run: z.object({
    runId: uuidSchema,
    runKind: z.enum(["live_research", "historical_import", "clarification", "correction", "synthetic_fixture"]),
    startedAt: timestampSchema,
    completedAt: timestampSchema,
    protocolManifests: z.array(protocolManifestSchema).min(1),
    provenanceNote: nonemptyTextSchema,
  }).strict(),
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

const PROHIBITED_PERSISTENT_KEYS = new Set([
  "authorization",
  "authorizationheader",
  "apikey",
  "chat",
  "chathistory",
  "commenttext",
  "comments",
  "credential",
  "credentials",
  "personalhealthnarrative",
  "prompt",
  "providerresponse",
  "rawarticle",
  "rawbody",
  "rawchat",
  "rawcomment",
  "rawcontent",
  "rawproviderresponse",
  "rawtranscript",
  "secret",
  "transcript",
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
