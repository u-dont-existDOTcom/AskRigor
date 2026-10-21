import { z } from "zod";

import {
  COMMUNITY_LOCATOR_MESSAGE,
  COMMUNITY_LOCATOR_PATTERN,
  COMMUNITY_PROVIDER_MESSAGE,
  COMMUNITY_PROVIDER_PATTERN,
  isProhibitedPersistentKey,
  livingEvidenceContributionSchema,
  PROHIBITED_PERSISTENT_KEY_NAMES,
  researchFrontierContributionSchema,
  topicLinkContributionSchema,
} from "./contracts.js";
import { sha256 } from "./hash.js";

// Owner question 127 (answer 127a, 2026-10-20; AskRigor-lessons#43): a rejected
// contribution names every problem, each with its path, what the contract expects
// there and an example, and never repeats the values sent. The rules are the
// intake's own; the intake's assertions still run unchanged before storage.

export const contributionPrivacyBoundarySchema = z.object({
  rawChatPersisted: z.literal(false),
  promptPersisted: z.literal(false),
  accountIdentityInPayload: z.literal(false),
  privateHealthNarrativePersisted: z.literal(false),
  uploadContentPersisted: z.literal(false),
  rawSourceContentPersisted: z.literal(false),
  rawProviderResponsePersisted: z.literal(false),
  communityDataPersisted: z.literal(false),
}).strict();

/**
 * The consent a paid private account's research map is filed with (owner answer 143a, 2026-10-21): the user's yes to
 * the answer's offer, which saves its findings card and files this research's map, the literal save_research_findings
 * takes for the same yes.
 */
export const RESEARCH_MAP_CONSENT = "yes_to_this_save" as const;

// The research receipt's size limit (RESEARCH_RECEIPT_MAX_CHARACTERS in the research server).
const FINALIZATION_RECEIPT_MAX_CHARACTERS = 2_048;

export const researchContributionProposalInputSchema = z.object({
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"]),
  privacyBoundary: contributionPrivacyBoundarySchema,
  payload: z.unknown(),
  // Owner answer 138b: this account's own pending proposal of the same kind that this one replaces.
  supersedesProposalId: z.uuid().optional(),
  // Owner answer 143a: a paid private account's research map, filed after the user's yes to the answer's offer, with
  // the finalization receipt of the final check that made it. A free contributor's map needs neither.
  userConsent: z.literal(RESEARCH_MAP_CONSENT).optional(),
  finalizationReceipt: z.string().trim().min(1).max(FINALIZATION_RECEIPT_MAX_CHARACTERS).optional(),
}).strict();

type ProposalKind = "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS" | "TOPIC_LINK";

/** A shared SOURCE_ANALYSIS proposal is a source-bound study or review audit. */
export const SHARED_ANALYSIS_KINDS: readonly string[] = ["study_method_audit", "review_method_audit"];
export const SHARED_SOURCE_KINDS: readonly string[] = ["study", "review"];

/** A link into another session's sandbox ("sandbox:" in any case): it can never be opened. */
export function isSandboxLocator(value: string): boolean {
  return value.slice(0, 8).toLowerCase() === "sandbox:";
}

/** A YouTube, Reddit or forum link given as a url identifier. */
export function isCommunityIdentifier(scheme: unknown, value: string): boolean {
  return scheme === "url" && COMMUNITY_LOCATOR_PATTERN.test(value);
}

const CONTACT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["an email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu],
  ["a phone number", /(?:\+\d{1,3}[ .()-]*|\(\d{2,4}\)[ .-]*)\d[\d .()-]{5,}\d/u],
  ["a credential or access token", /\b(?:sk-|ghp_|github_pat_|Bearer\s+)[A-Za-z0-9._-]{12,}\b/u],
  ["a street address", /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b/iu],
];

/** Which obvious contact, address or credential pattern a text holds, if any: an exact pattern match, not a judgment. */
export function contactPatternKind(text: string): string | undefined {
  return CONTACT_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0];
}

/** Whether a string at this path is an identifier value (identifiers[n].value), which the contact screen skips. */
export function isIdentifierValuePath(path: readonly (string | number)[]): boolean {
  return path.at(-1) === "value" && /^\d+$/u.test(String(path.at(-2) ?? "")) && path.at(-3) === "identifiers";
}

/** The rules a problem can name. Contract rules first, then the privacy rules. */
export const CONTRIBUTION_PROBLEM_RULES = [
  "missing",
  "wrong_type",
  "unknown_keys",
  "not_allowed",
  "too_long",
  "too_short",
  "too_many",
  "too_few",
  "too_large",
  "too_small",
  "format",
  "cross_field",
  "hash_mismatch",
  "kind_mismatch",
  // Checks against stored records (owner answer 138b): an ID the canonical store holds with other content, a canonical
  // record the proposal names that does not exist, and a supersedesProposalId that is not this account's own pending
  // proposal of the same kind.
  "canonical_conflict",
  "canonical_missing",
  "superseded_proposal",
  "prohibited_key",
  "contact_pattern",
  "sandbox_locator",
  "community_source",
  "source_bound",
] as const;

export type ContributionProblemRule = typeof CONTRIBUTION_PROBLEM_RULES[number];

export const CONTRIBUTION_PRIVACY_RULES: ReadonlySet<ContributionProblemRule> = new Set([
  "prohibited_key",
  "contact_pattern",
  "sandbox_locator",
  "community_source",
  "source_bound",
]);

export interface ContributionProblem {
  /** From the call's root, such as payload.analysis.sections[0].sectionKey; a key outside the contract shows as *. */
  path: string;
  rule: ContributionProblemRule;
  /** What the contract expects there, in AskRigor's words. */
  expected: string;
  /** JSON of the right shape there, from AskRigor's example record. */
  example: string;
}

export interface ResearchContributionCheck {
  /** At most CONTRIBUTION_PROBLEM_LIMITS.shown, privacy rules first, then in path order. */
  problems: ContributionProblem[];
  /** Every problem found, shown or not. */
  total: number;
  /** Whether a privacy rule failed (shown or not). */
  privacyRuleFailed: boolean;
  /** Fields were invalid, so the rules comparing fields with each other have not run yet. */
  crossFieldRulesPending: boolean;
  /**
   * Whether payload was checked against the record proposalKind names: not when proposalKind is missing or invalid
   * (kind_invalid), or when payload is a valid record of the other kind (kind_mismatch).
   */
  payloadCheck: "checked" | "kind_invalid" | "kind_mismatch";
}

export const CONTRIBUTION_PROBLEM_LIMITS = Object.freeze({
  shown: 25,
  pathCharacters: 300,
  expectedCharacters: 600,
  exampleCharacters: 900,
  /** Path, expectation and example of all problems shown together. */
  totalCharacters: 16_000,
});

const ZERO_HASH = "0".repeat(64);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEXT = "…";

export const CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE = Object.freeze({
  rawChatPersisted: false,
  promptPersisted: false,
  accountIdentityInPayload: false,
  privateHealthNarrativePersisted: false,
  uploadContentPersisted: false,
  rawSourceContentPersisted: false,
  rawProviderResponsePersisted: false,
  communityDataPersisted: false,
});

const exampleRun = (first: number) => ({
  runId: uuid(first),
  runKind: "live_research",
  startedAt: "2026-01-01T00:00:00Z",
  completedAt: "2026-01-01T00:10:00Z",
  protocolManifests: [{ name: "HRP", version: TEXT, revisionDate: "2026-01-01", sha256: ZERO_HASH }],
  provenanceNote: TEXT,
});

const exampleDimensions = () => ({
  population: TEXT,
  programOrExposure: TEXT,
  comparator: null,
  outcome: TEXT,
  horizon: null,
  setting: null,
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * One example record of each kind, with every list holding one item and every optional part present. Tests check that
 * each passes the whole intake and that every path of the contract has an example here.
 */
export const CONTRIBUTION_EXAMPLES: Readonly<Record<ProposalKind, Record<string, unknown>>> = deepFreeze({
  SOURCE_ANALYSIS: {
    schemaVersion: 1,
    idempotencyKey: "source-analysis-example-1",
    run: exampleRun(1),
    topic: { topicId: uuid(2), canonicalKey: "example-topic", label: TEXT },
    source: {
      familyId: uuid(3),
      versionId: uuid(4),
      sourceKind: "study",
      identityHash: ZERO_HASH,
      displayTitle: TEXT,
      identifiers: [{ scheme: "doi", value: "10.1000/example" }],
      sourceContentSha256: ZERO_HASH,
      accessStatus: "complete",
      retrievedAt: "2026-01-01T00:05:00Z",
      sourceLocator: TEXT,
      rawContentPersisted: false,
    },
    analysis: {
      analysisId: uuid(5),
      versionId: uuid(6),
      analysisKind: "study_method_audit",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "complete_performed_analysis",
      authoredAt: "2026-01-01T00:10:00Z",
      coverageStatement: TEXT,
      declaredWholeTextSha256: null,
      sections: [{ ordinal: 0, sectionKey: "000-method-audit", title: TEXT, content: TEXT }],
      domains: [{
        ordinal: 0,
        rubric: "study_method_v1",
        domain: "randomization",
        status: "adequate",
        finding: TEXT,
        evidenceLocators: [TEXT],
        unresolvedFields: [TEXT],
        limitations: [TEXT],
      }],
      claimCapabilities: [{ ordinal: 0, claim: TEXT, capability: "can_support", reason: TEXT, evidenceLocators: [TEXT] }],
      futureAnalysisItems: [{
        itemId: uuid(7),
        question: TEXT,
        rationale: TEXT,
        priority: "medium",
        status: "open",
        evidenceNeeded: [TEXT],
        resolvedByVersionId: null,
      }],
    },
    receipts: [{ receiptId: uuid(8), receiptKind: TEXT, receiptSha256: ZERO_HASH, locator: TEXT, details: { status: TEXT } }],
    knowledge: {
      question: { questionId: uuid(9), normalizedQuestion: TEXT, dimensions: exampleDimensions() },
      topicEdges: [{ edgeId: uuid(10), fromTopicId: uuid(2), toTopicId: uuid(11), relation: "related_to" }],
      claims: [{
        claimId: uuid(12),
        versionId: uuid(13),
        questionId: uuid(9),
        normalizedAssertion: TEXT,
        claimType: "effect",
        dimensions: exampleDimensions(),
        direction: "benefit",
        inferenceType: "causal",
        capabilityState: "uncertain",
        uncertaintyAndLimitations: [TEXT],
        status: "current",
        supersedesClaimVersionId: null,
      }],
      evidenceBindings: [{
        bindingId: uuid(14),
        claimVersionId: uuid(13),
        sourceVersionId: uuid(4),
        locator: TEXT,
        polarity: "supports",
        extractionType: "source_bound_audit",
        capabilityCeiling: "uncertain",
        validationReceiptId: uuid(8),
        limitations: [TEXT],
      }],
      sourceEdges: [{
        edgeId: uuid(15),
        fromSourceVersionId: uuid(4),
        toSourceVersionId: uuid(16),
        relation: "updates",
        confidence: "verified",
        uncertainty: TEXT,
        supersedesEdgeId: null,
      }],
      claimEdges: [{
        edgeId: uuid(17),
        fromClaimVersionId: uuid(13),
        toClaimVersionId: uuid(18),
        relation: "supports",
        confidence: "inferred",
        uncertainty: TEXT,
        supersedesEdgeId: null,
      }],
      assessment: {
        assessmentId: uuid(19),
        versionId: uuid(20),
        rubric: "study_method_v1",
        rubricVersion: TEXT,
        assessorType: "model",
        assessorIdentifier: TEXT,
        internalValidity: { status: "unclear", reason: TEXT },
        applicability: { status: "adequate", reason: TEXT },
        disagreementState: "none_recorded",
        supersedesAssessmentVersionId: null,
      },
      freshnessPolicy: {
        policyId: uuid(21),
        sourceClass: "study",
        cadenceDays: 90,
        maximumAgeDays: 365,
        ownerRole: TEXT,
        requiredChecks: [TEXT],
        failureBehavior: "mark_stale",
      },
      freshnessChecks: [{
        checkId: uuid(22),
        policyId: uuid(21),
        checkedAt: "2026-01-01T00:10:00Z",
        outcome: "current",
        projectionState: "current",
        nextDueAt: "2026-04-01T00:00:00Z",
        receiptSha256: ZERO_HASH,
        limitations: [TEXT],
      }],
      impactJob: {
        jobId: uuid(23),
        status: "pending",
        affectedClaimVersionIds: [uuid(13)],
        impactReceiptSha256: null,
        failureCode: null,
      },
    },
  },
  RESEARCH_FRONTIER: {
    schemaVersion: 1,
    idempotencyKey: "research-frontier-example-1",
    contributionId: uuid(31),
    persistenceBoundary: {
      rawSourceContentPersisted: false,
      rawProviderResponsePersisted: false,
      personalDataPersisted: false,
      communityDataPersisted: false,
    },
    run: exampleRun(32),
    topic: { topicId: uuid(33), canonicalKey: "example-topic", label: TEXT },
    question: { questionId: uuid(34), normalizedQuestion: TEXT, dimensions: exampleDimensions() },
    frontier: {
      frontierId: uuid(35),
      lanes: [{ laneId: uuid(36), canonicalKey: "pubmed-formal", sourceClass: "study", provider: "pubmed", label: TEXT }],
      passes: [{
        passId: uuid(37),
        laneId: uuid(36),
        deidentifiedQuery: TEXT,
        declaredQuerySha256: sha256(TEXT),
        executedAt: "2026-01-01T00:05:00Z",
        coverageBasis: "publication_date",
        requestedWindow: { start: "2020-01-01", endExclusive: "2026-01-01" },
        confirmedWindow: { start: "2020-01-01", endExclusive: "2026-01-01" },
        coverageRelation: "initial",
        deltaFromPassId: null,
        status: "complete",
        accessStatus: "complete",
        exhausted: true,
        retrievedCandidateCount: 1,
        screenedCandidateCount: 1,
        selectedCandidateCount: 1,
        nextCapability: null,
        blockedReasonCode: null,
        receiptSha256: ZERO_HASH,
        limitations: [TEXT],
      }],
      candidateVersions: [{
        candidateId: uuid(38),
        versionId: uuid(39),
        observedInPassId: uuid(37),
        candidateKind: "study",
        identifiers: [{ scheme: "doi", value: "10.1000/example" }],
        displayTitle: TEXT,
        publicationDate: "2025-01-01",
        decision: "selected",
        decisionReason: TEXT,
        relevanceSummary: TEXT,
        sourceFamilyId: null,
        previousVersionId: null,
      }],
      trailVersions: [{
        trailId: uuid(40),
        versionId: uuid(41),
        trailKind: "unattempted_search",
        laneId: uuid(36),
        targetWindow: { start: "2026-01-01", endExclusive: "2026-07-01" },
        description: TEXT,
        rationale: TEXT,
        priority: "high",
        state: "ready",
        nextCapability: TEXT,
        blockedReasonCode: null,
        resolutionNote: null,
        previousVersionId: null,
      }],
    },
  },
  TOPIC_LINK: {
    schemaVersion: 1,
    idempotencyKey: "topic-link-example-1",
    linkId: uuid(51),
    run: exampleRun(52),
    fromTopic: { topicId: uuid(53), canonicalKey: "example-topic" },
    relation: "same",
    toTopic: { topicId: uuid(54), canonicalKey: "example-topic-other-wording" },
    rationale: TEXT,
  },
});

// In a shared SOURCE_ANALYSIS proposal, these accept less than the contribution schema does.
const SHARED_ANALYSIS_EXPECTATIONS: Readonly<Record<string, string>> = {
  "payload.source": "an object for the analysed study or review, with familyId, versionId, sourceKind, identityHash, " +
    "displayTitle, identifiers, sourceContentSha256, accessStatus, retrievedAt, sourceLocator and " +
    "rawContentPersisted (a shared source analysis cannot leave it null)",
  "payload.source.sourceKind": "one of study, review",
  "payload.analysis.analysisKind": "one of study_method_audit, review_method_audit",
};
const SHARED_ANALYSIS_TEMPLATE_VALUES: Readonly<Record<string, readonly string[]>> = {
  "source.sourceKind": SHARED_SOURCE_KINDS,
  "analysis.analysisKind": SHARED_ANALYSIS_KINDS,
};

const PROHIBITED_KEY_EXPECTED = "no prohibited key: ignoring case, spaces and punctuation, AskRigor never stores a " +
  `key named ${PROHIBITED_PERSISTENT_KEY_NAMES.join(", ")}. Remove this key and its value`;

interface JsonNode {
  [key: string]: unknown;
  type?: string;
  properties?: Record<string, JsonNode>;
  items?: JsonNode;
  anyOf?: JsonNode[];
  enum?: unknown[];
  additionalProperties?: boolean | JsonNode;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  maxItems?: number;
}

/** A key the contract does not define, or a free name under receipts[].details: never shown. */
const ANY = Symbol("key outside the contract");
type Segment = string | number | typeof ANY;

interface Found {
  segments: Segment[];
  rule: ContributionProblemRule;
  expected: string;
}

let contract: {
  envelope: JsonNode;
  kinds: Record<ProposalKind, JsonNode>;
  known: ReadonlySet<string>;
} | undefined;

function contractJson() {
  if (contract !== undefined) return contract;
  const toJson = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as JsonNode;
  const envelope = toJson(researchContributionProposalInputSchema);
  const kinds = {
    RESEARCH_FRONTIER: toJson(researchFrontierContributionSchema),
    SOURCE_ANALYSIS: toJson(livingEvidenceContributionSchema),
    TOPIC_LINK: toJson(topicLinkContributionSchema),
  };
  const known = new Set<string>();
  const collect = (node: unknown): void => {
    if (!isJsonObject(node)) return;
    if (isJsonObject(node.properties)) {
      for (const [key, child] of Object.entries(node.properties)) {
        known.add(key);
        collect(child);
      }
    }
    collect(node.items);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(collect);
    collect(node.additionalProperties);
  };
  for (const node of [envelope, kinds.RESEARCH_FRONTIER, kinds.SOURCE_ANALYSIS, kinds.TOPIC_LINK]) collect(node);
  contract = { envelope, kinds, known };
  return contract;
}

/** Every key the proposal contract defines, at any depth. */
export function researchContributionContractKeys(): ReadonlySet<string> {
  return contractJson().known;
}

/**
 * Checks a submit_research_contribution input with intake's rules and returns every problem found, bounded and in a
 * fixed order. Problems carry no text, number, identifier or key from the input.
 */
export function checkResearchContributionProposal(input: unknown): ResearchContributionCheck {
  const found: Found[] = [];
  const declared = isPlainObject(input)
    ? researchContributionProposalInputSchema.shape.proposalKind.safeParse(input.proposalKind)
    : undefined;
  const kind: ProposalKind | undefined = declared?.success === true ? declared.data : undefined;
  const envelope = researchContributionProposalInputSchema.safeParse(input);
  if (!envelope.success) {
    for (const issue of envelope.error.issues) found.push(...fromIssue(issue, [], input, kind));
  }
  const payload = isPlainObject(input) ? input.payload : undefined;
  found.push(...privacyFindings(payload));
  let crossFieldRulesPending = false;
  let payloadCheck: ResearchContributionCheck["payloadCheck"] = kind === undefined ? "kind_invalid" : "checked";
  if (kind !== undefined) {
    const parsed = contributionSchema(kind).safeParse(payload);
    const other = (["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"] as const)
      .find((candidate) => candidate !== kind && contributionSchema(candidate).safeParse(payload).success);
    if (!parsed.success && other !== undefined) {
      payloadCheck = "kind_mismatch";
      found.push({
        segments: ["proposalKind"],
        rule: "kind_mismatch",
        expected: `${other}: payload is a ${other} record, so proposalKind names it, or payload is a ${kind} record`,
      });
    } else {
      found.push(...recordRuleFindings(kind, payload));
      if (!parsed.success) {
        crossFieldRulesPending = parsed.error.issues.some(({ code }) => code !== "custom");
        for (const issue of parsed.error.issues) {
          // The record rules above already report these, at the exact link or provider.
          if (issue.code === "custom" && [COMMUNITY_PROVIDER_MESSAGE, COMMUNITY_LOCATOR_MESSAGE].includes(issue.message)) continue;
          found.push(...fromIssue(issue, ["payload"], input, kind));
        }
      } else {
        found.push(...hashFindings(kind, parsed.data));
      }
    }
  }
  return bounded(found, kind, { crossFieldRulesPending, payloadCheck });
}

/** One problem found by a check against stored records, at its path from the call's root. */
export interface ContributionFinding {
  path: ReadonlyArray<string | number>;
  rule: ContributionProblemRule;
  expected: string;
}

/**
 * The problems a check against stored records found (the canonical store, or the account's own pending proposals),
 * bounded and ordered like the intake's own, each with its example. Run on a record that passed the intake, so its
 * cross-field rules have run.
 */
export function contributionCheckFromFindings(
  kind: ProposalKind,
  findings: readonly ContributionFinding[],
): ResearchContributionCheck {
  return bounded(
    findings.map(({ path, rule, expected }) => ({ segments: sanitize(path), rule, expected })),
    kind,
    { crossFieldRulesPending: false, payloadCheck: "checked" },
  );
}

function contributionSchema(kind: ProposalKind): z.ZodType {
  return kind === "SOURCE_ANALYSIS"
    ? livingEvidenceContributionSchema
    : kind === "TOPIC_LINK" ? topicLinkContributionSchema : researchFrontierContributionSchema;
}

function fromIssue(
  issue: z.core.$ZodIssue,
  prefix: readonly PropertyKey[],
  input: unknown,
  kind: ProposalKind | undefined,
): Found[] {
  const rawPath = [...prefix, ...issue.path];
  const segments = sanitize(rawPath);
  const node = schemaFor(kind, segments);
  if (issue.code === "custom") {
    return [{ segments, rule: "cross_field", expected: issue.message }];
  }
  if (issue.code === "unrecognized_keys") {
    const allowed = Object.keys(unwrapNullable(node ?? {}).properties ?? {});
    const count = issue.keys.length;
    return [{
      segments,
      rule: "unknown_keys",
      expected: `only the keys ${allowed.join(", ")}; ${count === 1 ? "1 other key here is" : `${count} other keys here are`} ` +
        `not in the contract (remove or rename ${count === 1 ? "it" : "them"})`,
    }];
  }
  const location = rawAt(input, rawPath);
  const described = sharedAnalysisExpectation(kind, segments) ?? describe(node);
  if (!location.present) return [{ segments, rule: "missing", expected: described }];
  const origin = "origin" in issue ? issue.origin : undefined;
  switch (issue.code) {
    case "invalid_value":
      return [{ segments, rule: "not_allowed", expected: described }];
    case "too_big":
      return [{ segments, rule: origin === "string" ? "too_long" : origin === "array" ? "too_many" : "too_large", expected: described }];
    case "too_small":
      return [{ segments, rule: origin === "string" ? "too_short" : origin === "array" ? "too_few" : "too_small", expected: described }];
    case "invalid_format":
    case "not_multiple_of":
      return [{ segments, rule: "format", expected: described }];
    default:
      return [{ segments, rule: "wrong_type", expected: `${described}, not ${typeName(location.value)}` }];
  }
}

function sharedAnalysisExpectation(kind: ProposalKind | undefined, segments: readonly Segment[]): string | undefined {
  return kind === "SOURCE_ANALYSIS" ? SHARED_ANALYSIS_EXPECTATIONS[renderPath(segments)] : undefined;
}

function privacyFindings(payload: unknown): Found[] {
  const found: Found[] = [];
  const seen = new Set<object>();
  const walk = (value: unknown, path: (string | number)[]): void => {
    if (typeof value === "string") {
      if (isIdentifierValuePath(path)) return;
      const pattern = contactPatternKind(value);
      if (pattern !== undefined) {
        found.push({
          segments: sanitize(["payload", ...path]),
          rule: "contact_pattern",
          expected: `deidentified text: this text matches ${pattern}. Contact details, street addresses and ` +
            "credentials are never stored; remove it",
        });
      }
      return;
    }
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, [...path, index]));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const keyPattern = contactPatternKind(key);
      if (keyPattern !== undefined) {
        found.push({
          segments: sanitize(["payload", ...path, key]),
          rule: "contact_pattern",
          expected: `a deidentified name: this name matches ${keyPattern}. Contact details, street addresses and ` +
            "credentials are never stored; rename it",
        });
        continue;
      }
      if (isProhibitedPersistentKey(key, child)) {
        found.push({
          segments: sanitize(["payload", ...path, key]),
          rule: "prohibited_key",
          expected: key === "rawContentPersisted"
            ? "exactly false: raw source content is never stored"
            : PROHIBITED_KEY_EXPECTED,
        });
        continue;
      }
      walk(child, [...path, key]);
    }
  };
  walk(payload, []);
  return found;
}

const SANDBOX_EXPECTED = "a public identifier or link that opens outside this session, such as a DOI, a PMID or an " +
  "https link: a sandbox: link points into another session and can never be opened";
const COMMUNITY_IDENTIFIER_EXPECTED = "a formal source's identifier: YouTube, Reddit and forum links are outside the " +
  "shared proposal boundary";

/** The intake's record rules, read from the record as sent so they report alongside its shape problems. */
function recordRuleFindings(kind: ProposalKind, payload: unknown): Found[] {
  const found: Found[] = [];
  if (!isPlainObject(payload)) return found;
  const identifiers = (list: unknown, base: (string | number)[], community: boolean): void => {
    if (!Array.isArray(list)) return;
    list.forEach((identifier, index) => {
      if (!isPlainObject(identifier) || typeof identifier.value !== "string") return;
      // As the contract reads it: trimmed.
      const value = identifier.value.trim();
      const segments = sanitize(["payload", ...base, index, "value"]);
      if (isSandboxLocator(value)) found.push({ segments, rule: "sandbox_locator", expected: SANDBOX_EXPECTED });
      if (community && isCommunityIdentifier(identifier.scheme, value)) {
        found.push({ segments, rule: "community_source", expected: COMMUNITY_IDENTIFIER_EXPECTED });
      }
    });
  };
  if (kind === "SOURCE_ANALYSIS") {
    const { source, analysis } = payload;
    if (source === null) {
      found.push({
        segments: ["payload", "source"],
        rule: "source_bound",
        expected: "the analysed study or review: a shared source analysis is bound to its source, so source cannot be null",
      });
    }
    const analysisKind = isPlainObject(analysis) ? analysis.analysisKind : undefined;
    if (typeof analysisKind === "string" && enumValues("SOURCE_ANALYSIS", ["analysis", "analysisKind"]).includes(analysisKind) &&
      !SHARED_ANALYSIS_KINDS.includes(analysisKind)) {
      found.push({
        segments: ["payload", "analysis", "analysisKind"],
        rule: "source_bound",
        expected: "one of study_method_audit, review_method_audit: a shared source analysis is a study or review " +
          "method audit, not a personal or topic-only narrative",
      });
    }
    const sourceKind = isPlainObject(source) ? source.sourceKind : undefined;
    if (typeof sourceKind === "string" && enumValues("SOURCE_ANALYSIS", ["source", "sourceKind"]).includes(sourceKind) &&
      !SHARED_SOURCE_KINDS.includes(sourceKind)) {
      found.push({
        segments: ["payload", "source", "sourceKind"],
        rule: "source_bound",
        expected: "one of study, review: a shared source analysis is bound to a study or a review",
      });
    }
    if (isPlainObject(source)) identifiers(source.identifiers, ["source", "identifiers"], true);
    return found;
  }
  // A topic link names canonical topics only; the canonical checks run once it is otherwise valid.
  if (kind === "TOPIC_LINK") return found;
  const frontier = payload.frontier;
  if (!isPlainObject(frontier)) return found;
  if (Array.isArray(frontier.lanes)) {
    frontier.lanes.forEach((lane, index) => {
      if (isPlainObject(lane) && typeof lane.provider === "string" && COMMUNITY_PROVIDER_PATTERN.test(lane.provider)) {
        found.push({
          segments: ["payload", "frontier", "lanes", index, "provider"],
          rule: "community_source",
          expected: `a formal source's provider: ${COMMUNITY_PROVIDER_MESSAGE}`,
        });
      }
    });
  }
  if (Array.isArray(frontier.candidateVersions)) {
    frontier.candidateVersions.forEach((candidate, index) => {
      if (isPlainObject(candidate)) {
        identifiers(candidate.identifiers, ["frontier", "candidateVersions", index, "identifiers"], true);
      }
    });
  }
  return found;
}

function hashFindings(kind: ProposalKind, record: unknown): Found[] {
  if (kind === "TOPIC_LINK") return [];
  if (kind === "SOURCE_ANALYSIS") {
    const { analysis } = record as { analysis: { declaredWholeTextSha256: string | null; sections: { content: string }[] } };
    const whole = sha256(analysis.sections.map(({ content }) => content).join(""));
    return analysis.declaredWholeTextSha256 === null || analysis.declaredWholeTextSha256 === whole ? [] : [{
      segments: ["payload", "analysis", "declaredWholeTextSha256"],
      rule: "hash_mismatch",
      expected: "null, or the SHA-256 (64 lowercase hexadecimal characters) of the sections' content joined in order; " +
        "the hash sent does not match the sections sent",
    }];
  }
  const { frontier } = record as { frontier: { passes: { deidentifiedQuery: string; declaredQuerySha256: string }[] } };
  return frontier.passes.flatMap((pass, index) => sha256(pass.deidentifiedQuery) === pass.declaredQuerySha256 ? [] : [{
    segments: ["payload", "frontier", "passes", index, "declaredQuerySha256"],
    rule: "hash_mismatch" as const,
    expected: "the SHA-256 (64 lowercase hexadecimal characters) of this pass's deidentifiedQuery, with surrounding " +
      "spaces removed; the hash sent does not match the query sent",
  }]);
}

function bounded(
  found: Found[],
  kind: ProposalKind | undefined,
  state: Pick<ResearchContributionCheck, "crossFieldRulesPending" | "payloadCheck">,
): ResearchContributionCheck {
  const rendered = found.map((item) => ({
    item,
    path: clip(renderPath(item.segments), CONTRIBUTION_PROBLEM_LIMITS.pathCharacters),
    expected: clip(item.expected, CONTRIBUTION_PROBLEM_LIMITS.expectedCharacters),
  }));
  const rank = (rule: ContributionProblemRule) => (CONTRIBUTION_PRIVACY_RULES.has(rule) ? 0 : 1);
  rendered.sort((a, b) =>
    rank(a.item.rule) - rank(b.item.rule) ||
    compareSegments(a.item.segments, b.item.segments) ||
    CONTRIBUTION_PROBLEM_RULES.indexOf(a.item.rule) - CONTRIBUTION_PROBLEM_RULES.indexOf(b.item.rule) ||
    (a.expected < b.expected ? -1 : a.expected > b.expected ? 1 : 0));
  const unique: typeof rendered = [];
  const keys = new Set<string>();
  for (const entry of rendered) {
    const key = `${entry.path}\u0000${entry.item.rule}\u0000${entry.expected}`;
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push(entry);
  }
  // Examples only for the problems shown: a large record can hold thousands of problems.
  const problems: ContributionProblem[] = [];
  let characters = 0;
  for (const { item, path, expected } of unique) {
    if (problems.length === CONTRIBUTION_PROBLEM_LIMITS.shown) break;
    const example = exampleFor(kind, item.segments);
    const size = path.length + expected.length + example.length;
    if (characters + size > CONTRIBUTION_PROBLEM_LIMITS.totalCharacters) break;
    characters += size;
    problems.push({ path, rule: item.rule, expected, example });
  }
  return {
    problems,
    total: unique.length,
    privacyRuleFailed: unique.some(({ item }) => CONTRIBUTION_PRIVACY_RULES.has(item.rule)),
    ...state,
  };
}

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function compareSegments(a: readonly Segment[], b: readonly Segment[]): number {
  const kind = (segment: Segment) => (typeof segment === "number" ? 0 : segment === ANY ? 2 : 1);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left === right) continue;
    if (kind(left) !== kind(right)) return kind(left) - kind(right);
    if (typeof left === "number" && typeof right === "number") return left - right;
    return String(left) < String(right) ? -1 : 1;
  }
  return a.length - b.length;
}

function sanitize(path: readonly PropertyKey[]): Segment[] {
  const { known } = contractJson();
  return path.map((segment) =>
    typeof segment === "number" ? segment : typeof segment === "string" && known.has(segment) ? segment : ANY);
}

/** The path from the call's root; "input" is the root itself. */
function renderPath(segments: readonly Segment[]): string {
  if (segments.length === 0) return "input";
  return segments.reduce<string>((text, segment) => typeof segment === "number"
    ? `${text}[${segment}]`
    : `${text}${text === "" ? "" : "."}${segment === ANY ? "*" : segment}`, "");
}

function rawAt(root: unknown, path: readonly PropertyKey[]): { present: boolean; value: unknown } {
  let node = root;
  for (const segment of path) {
    if (Array.isArray(node) && typeof segment === "number" && segment < node.length) {
      node = node[segment];
    } else if (isPlainObject(node) && typeof segment === "string" && Object.hasOwn(node, segment)) {
      node = node[segment];
    } else {
      return { present: false, value: undefined };
    }
  }
  return { present: node !== undefined, value: node };
}

function unwrapNullable(node: JsonNode): JsonNode {
  if (!Array.isArray(node.anyOf)) return node;
  const branches = node.anyOf.filter((branch) => branch.type !== "null");
  return branches.length === 1 && branches.length < node.anyOf.length ? branches[0]! : node;
}

function childSchema(node: JsonNode | undefined, segment: Segment): JsonNode | undefined {
  if (node === undefined) return undefined;
  const inner = unwrapNullable(node);
  if (typeof segment === "number") return inner.items;
  if (segment !== ANY && inner.properties?.[segment] !== undefined) return inner.properties[segment];
  return isJsonObject(inner.additionalProperties) ? inner.additionalProperties as JsonNode : undefined;
}

function schemaFor(kind: ProposalKind | undefined, segments: readonly Segment[]): JsonNode | undefined {
  const { envelope, kinds } = contractJson();
  if (segments[0] === "payload") {
    return kind === undefined ? undefined : segments.slice(1).reduce<JsonNode | undefined>(childSchema, kinds[kind]);
  }
  return segments.reduce<JsonNode | undefined>(childSchema, envelope);
}

function enumValues(kind: ProposalKind, path: readonly string[]): readonly unknown[] {
  const node = schemaFor(kind, ["payload", ...path]);
  return node === undefined ? [] : unwrapNullable(node).enum ?? [];
}

const PATTERN_WORDS: Readonly<Record<string, string>> = {
  "^[a-f0-9]{64}$": "a SHA-256: 64 lowercase hexadecimal characters",
  "^\\d{4}-\\d{2}-\\d{2}$": "a date as YYYY-MM-DD",
  "^[a-z0-9][a-z0-9._-]{0,199}$": "a key of lowercase letters, digits, '.', '_' or '-' that starts with a letter or " +
    "digit, at most 200 characters",
  "^[a-z0-9][a-z0-9_]{0,199}$": "a key of lowercase letters, digits or '_' that starts with a letter or digit, at most " +
    "200 characters",
  "^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$": "a key of letters, digits, '.', '_', ':' or '-' that starts with a letter or " +
    "digit, at most 200 characters",
};

/** The contract's patterns, each described in words. */
export const CONTRIBUTION_PATTERN_DESCRIPTIONS: ReadonlySet<string> = new Set(Object.keys(PATTERN_WORDS));

function describe(node: JsonNode | undefined): string {
  if (node === undefined) return "nothing: this key is not part of the contract";
  if (Array.isArray(node.anyOf)) {
    const branches = node.anyOf.filter((branch) => branch.type !== "null");
    const text = branches.map(describe).join(", or ");
    return branches.length < node.anyOf.length ? `${text}, or null` : text;
  }
  if ("const" in node) return `exactly ${JSON.stringify(node.const)}`;
  if (Array.isArray(node.enum)) return `one of ${node.enum.join(", ")}`;
  switch (node.type) {
    case "string":
      return describeString(node);
    case "integer":
      return describeNumber("a whole number", node);
    case "number":
      return describeNumber("a number", node);
    case "boolean":
      return "true or false";
    case "array": {
      const size = node.minItems === undefined ? "" : ` of at least ${node.minItems} item${node.minItems === 1 ? "" : "s"}`;
      return `a list${size}, each ${describe(node.items)}`;
    }
    case "object":
      if (node.properties !== undefined) return `an object with ${Object.keys(node.properties).join(", ")}`;
      return isJsonObject(node.additionalProperties)
        ? `an object of names of your choice, each holding ${describe(node.additionalProperties as JsonNode)}`
        : "an object";
    default:
      return "a value of the contract's type";
  }
}

function describeString(node: JsonNode): string {
  if (node.format === "uuid") return "a UUID, such as 00000000-0000-4000-8000-000000000000";
  if (node.format === "date-time") return "an ISO 8601 date-time with a time zone, such as 2026-01-01T00:00:00Z";
  if (typeof node.pattern === "string") return PATTERN_WORDS[node.pattern] ?? `text matching ${node.pattern}`;
  if (node.maxLength !== undefined) return `text of ${node.minLength ?? 0} to ${node.maxLength} characters`;
  return node.minLength !== undefined && node.minLength > 0 ? "text that is not empty" : "text";
}

function describeNumber(base: string, node: JsonNode): string {
  const limits: string[] = [];
  if (node.exclusiveMinimum !== undefined) limits.push(`greater than ${node.exclusiveMinimum}`);
  else if (node.minimum !== undefined) limits.push(`at least ${node.minimum}`);
  if (node.maximum !== undefined && node.maximum !== Number.MAX_SAFE_INTEGER) limits.push(`at most ${node.maximum}`);
  return limits.length === 0 ? base : `${base}, ${limits.join(" and ")}`;
}

/** The JSON type of a value sent, never the value. */
function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  switch (typeof value) {
    case "string":
      return "text";
    case "number":
      return Number.isInteger(value) ? "a whole number" : "a number with a fraction";
    case "boolean":
      return "true or false";
    case "object":
      return "an object";
    default:
      return "another type";
  }
}

function envelopeExample(kind: ProposalKind | undefined): Record<string, unknown> {
  return {
    proposalKind: kind ?? "RESEARCH_FRONTIER",
    privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
    payload: kind === undefined ? {} : CONTRIBUTION_EXAMPLES[kind],
    supersedesProposalId: uuid(50),
    userConsent: RESEARCH_MAP_CONSENT,
    finalizationReceipt: "rr1~finalization~…",
  };
}

/** The example at a problem's place: lists give their first item, and a key outside the contract its parent. */
function exampleFor(kind: ProposalKind | undefined, segments: readonly Segment[]): string {
  let node: unknown = envelopeExample(kind);
  for (let index = 0; index < segments.length; index += 1) {
    if (schemaFor(kind, segments.slice(0, index + 1)) === undefined) break;
    const segment = segments[index]!;
    const next = Array.isArray(node)
      ? (typeof segment === "number" ? node[0] : undefined)
      : isPlainObject(node)
        ? (segment === ANY ? Object.values(node)[0] : typeof segment === "string" ? node[segment] : undefined)
        : undefined;
    if (next === undefined) break;
    node = next;
  }
  return renderExample(node);
}

function renderExample(value: unknown): string {
  const limit = CONTRIBUTION_PROBLEM_LIMITS.exampleCharacters;
  const full = JSON.stringify(value) ?? "null";
  if (full.length <= limit) return full;
  const summary = (child: unknown) => Array.isArray(child)
    ? (child.length === 0 ? "[]" : "[…]")
    : isPlainObject(child) ? "{…}" : JSON.stringify(child);
  const shallowObject = (object: Record<string, unknown>) =>
    `{${Object.entries(object).map(([key, child]) => `${JSON.stringify(key)}:${summary(child)}`).join(",")}}`;
  const shallow = Array.isArray(value)
    ? `[${value.length === 0 ? "" : isPlainObject(value[0]) ? shallowObject(value[0]) : summary(value[0])}]`
    : isPlainObject(value) ? shallowObject(value) : full;
  return clip(shallow, limit);
}

const TEMPLATE_FORMATS: Readonly<Record<string, string>> = { uuid: "<uuid>", "date-time": "<date-time>" };
const TEMPLATE_PATTERNS: Readonly<Record<string, string>> = {
  "^[a-f0-9]{64}$": "<sha256>",
  "^\\d{4}-\\d{2}-\\d{2}$": "<date>",
};

/**
 * The record's shape as a compact JSON template for the tool description: <uuid>, <sha256>, <date-time> and <date>
 * placeholders, … for text, a|b for the allowed values, and "|null" where a value may be null. SOURCE_ANALYSIS leaves
 * out the optional knowledge part.
 */
export function researchContributionShapeTemplate(kind: ProposalKind): string {
  const template = (value: unknown, schema: JsonNode | undefined, path: readonly (string | number)[]): string => {
    if (schema === undefined) return JSON.stringify(TEXT);
    const node = unwrapNullable(schema);
    const nullable = node !== schema;
    if (node.type === "object" && node.properties === undefined && isJsonObject(node.additionalProperties)) {
      return `{"<name>":${JSON.stringify(TEXT)}}`;
    }
    if (node.properties !== undefined) {
      const example = isPlainObject(value) ? value : {};
      return `{${Object.entries(node.properties)
        .filter(([key]) => !(path.length === 0 && key === "knowledge"))
        .map(([key, child]) => `${JSON.stringify(key)}:${template(example[key], child, [...path, key])}`)
        .join(",")}}`;
    }
    if (node.type === "array") return `[${template(Array.isArray(value) ? value[0] : undefined, node.items, [...path, 0])}]`;
    if ("const" in node) return JSON.stringify(node.const);
    const shared = kind === "SOURCE_ANALYSIS" ? SHARED_ANALYSIS_TEMPLATE_VALUES[path.join(".")] : undefined;
    let token: string;
    if (shared !== undefined) token = shared.join("|");
    else if (Array.isArray(node.enum)) token = node.enum.join("|");
    else if (node.type === "string") {
      token = TEMPLATE_FORMATS[node.format ?? ""] ?? TEMPLATE_PATTERNS[node.pattern ?? ""] ??
        (typeof value === "string" ? value : TEXT);
    } else return JSON.stringify(value ?? (node.type === "boolean" ? false : 0));
    return JSON.stringify(nullable ? `${token}|null` : token);
  };
  return template(CONTRIBUTION_EXAMPLES[kind], contractJson().kinds[kind], []);
}

/** The record's parts that may be null as objects (a template shows such a part as its object). */
export function researchContributionNullableParts(kind: ProposalKind): string[] {
  const parts: string[] = [];
  const walk = (schema: JsonNode | undefined, path: string): void => {
    if (schema === undefined) return;
    const node = unwrapNullable(schema);
    if (node !== schema && node.properties !== undefined) parts.push(path);
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (path === "" && key === "knowledge") continue;
      walk(child, path === "" ? key : `${path}.${key}`);
    }
    if (node.items !== undefined) walk(node.items, `${path}[]`);
  };
  walk(contractJson().kinds[kind], "");
  return kind === "SOURCE_ANALYSIS" ? parts.filter((part) => part !== "source") : parts;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> & JsonNode {
  return isPlainObject(value);
}
