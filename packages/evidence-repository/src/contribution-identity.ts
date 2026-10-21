import type {
  LivingEvidenceContribution,
  ResearchFrontierContribution,
} from "./contracts.js";
import { sha256, stableJson } from "./hash.js";
import type { ContributionProblemRule } from "./research-contribution-check.js";
import type { ResearchContributionPromotionFailureCode } from "./research-contribution-review.js";

// Owner answer 138b (2026-10-20): "exact merging (the same topic, question or study continues the existing record
// ...)". A proposal is reconciled with the canonical store by exact identity only, before it is stored: the owner then
// reviews, and promotion writes, the reconciled payload's hash. Nothing here judges meaning; that is the model's
// declaration (TOPIC_LINK) and the owner's review.

export type ContributionKind = "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS";

export interface QuestionDimensions {
  population: string | null;
  programOrExposure: string | null;
  comparator: string | null;
  outcome: string | null;
  horizon: string | null;
  setting: string | null;
}

/** What the canonical store holds under a payload's identities, read in one read-only snapshot. */
export interface CanonicalIdentityState {
  /** A contribution already stored under the payload's idempotency key. */
  idempotency: { recordId: string; payloadSha256: string } | null;
  manifests: Array<{ sha256: string; name: string; version: string; revisionDateMatches: boolean }>;
  /** Times are compared with the payload's as instants, in SQL. */
  run: {
    runId: string;
    runKind: string;
    startedAtMatches: boolean;
    completedAtMatches: boolean;
    protocolManifestSha256s: string[];
    provenanceNote: string;
  } | null;
  topics: Array<{ topicId: string; canonicalKey: string; label: string }>;
  questions: Array<{ questionId: string; topicId: string; normalizedQuestion: string; dimensions: QuestionDimensions }>;
  frontiers: Array<{ frontierId: string; questionId: string }>;
  /** coverageBasis is the basis of the lane's stored passes, which share one. */
  lanes: Array<{
    laneId: string;
    frontierId: string;
    canonicalKey: string;
    sourceClass: string;
    provider: string;
    label: string;
    coverageBasis: string | null;
  }>;
  contributionIds: string[];
  passIds: string[];
  /** headVersionId is the candidate's current version, the one a new version chains to. */
  candidates: Array<{
    candidateId: string;
    frontierId: string;
    candidateKind: string;
    identityHash: string;
    headVersionId: string | null;
  }>;
  candidateVersions: Array<{ versionId: string; candidateId: string }>;
  trails: Array<{ trailId: string; frontierId: string; trailKind: string; headVersionId: string | null }>;
  trailVersions: Array<{ versionId: string; trailId: string }>;
  /** Candidates of any frontier that share an identifier with the payload (for the owner's related view). */
  identifierCandidates: Array<{ candidateId: string; frontierId: string; scheme: string; value: string }>;
  sourceFamilies: Array<{
    familyId: string;
    sourceKind: string;
    identityHash: string;
    displayTitle: string;
    identifiers: Array<{ scheme: string; value: string }>;
  }>;
  /** retrievedAt is exact to the microsecond; retrievedAtMatches compares it with the payload's as instants. */
  sourceVersions: Array<{
    versionId: string;
    familyId: string;
    sourceContentSha256: string | null;
    accessStatus: string;
    retrievedAt: string | null;
    retrievedAtMatches: boolean;
    sourceLocator: string | null;
  }>;
  freshnessPolicies: Array<{
    policyId: string;
    sourceFamilyId: string;
    sourceClass: string;
    cadenceDays: number;
    maximumAgeDays: number;
    ownerRole: string;
    requiredChecks: string[];
    failureBehavior: string;
  }>;
  analyses: Array<{ analysisId: string; analysisKind: string; topicId: string | null; sourceFamilyId: string | null }>;
  analysisVersionIds: string[];
  claims: Array<{ claimId: string; questionId: string; claimType: string }>;
  /** Canonical analysis versions holding a receipt with one of the payload's receipt hashes, and their protocols. */
  receiptVersions: Array<{
    versionId: string;
    sourceFamilyId: string | null;
    receiptKind: string;
    receiptSha256: string;
    protocolManifestSha256s: string[];
  }>;
}

/** The identities a payload names, which the canonical reader looks up. */
export interface CanonicalIdentityRequest {
  kind: ContributionKind;
  idempotencyKey: string;
  run: { runId: string; startedAt: string; completedAt: string };
  manifests: Array<{ sha256: string; revisionDate: string }>;
  topicIds: string[];
  topicKeys: string[];
  questionIds: string[];
  /** Exact questions, looked for within the topics the request names by ID or key. */
  questionTuples: Array<{ normalizedQuestion: string; dimensions: QuestionDimensions }>;
  frontierIds: string[];
  laneIds: string[];
  laneKeys: string[];
  contributionIds: string[];
  passIds: string[];
  candidateIds: string[];
  candidateIdentityHashes: string[];
  candidateVersionIds: string[];
  trailIds: string[];
  trailVersionIds: string[];
  identifiers: Array<{ scheme: string; value: string }>;
  sourceFamilyIds: string[];
  sourceIdentityHashes: string[];
  sourceVersion: { versionId: string; contentSha256: string | null; retrievedAt: string | null } | null;
  freshnessPolicyIds: string[];
  analysisIds: string[];
  analysisVersionIds: string[];
  claimIds: string[];
  receiptSha256s: string[];
}

/** The canonical store's read-only identity view. The public runtime's reader role is enough. */
export interface CanonicalIdentityReader {
  readCanonicalIdentity(request: CanonicalIdentityRequest): Promise<CanonicalIdentityState>;
}

/** A candidate's identity as the canonical writer computes it: the SHA-256 of its sorted identifiers. */
export function frontierCandidateIdentityHash(identifiers: ReadonlyArray<{ scheme: string; value: string }>): string {
  const sorted = identifiers
    .map(({ scheme, value }) => ({ scheme, value }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  return sha256(stableJson(sorted));
}

export function canonicalIdentityRequest(
  kind: ContributionKind,
  payload: LivingEvidenceContribution | ResearchFrontierContribution,
): CanonicalIdentityRequest {
  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
  const uniqueIdentifiers = (identifiers: Array<{ scheme: string; value: string }>) =>
    [...new Map(identifiers.map(({ scheme, value }) => [`${scheme}\u0000${value}`, { scheme, value }])).values()];
  const base = {
    kind,
    idempotencyKey: payload.idempotencyKey,
    run: { runId: payload.run.runId, startedAt: payload.run.startedAt, completedAt: payload.run.completedAt },
    manifests: payload.run.protocolManifests.map(({ sha256: digest, revisionDate }) => ({ sha256: digest, revisionDate })),
  };
  const empty = {
    topicIds: [], topicKeys: [], questionIds: [], questionTuples: [], frontierIds: [], laneIds: [], laneKeys: [],
    contributionIds: [], passIds: [], candidateIds: [], candidateIdentityHashes: [], candidateVersionIds: [], trailIds: [],
    trailVersionIds: [], identifiers: [], sourceFamilyIds: [], sourceIdentityHashes: [], sourceVersion: null,
    freshnessPolicyIds: [], analysisIds: [], analysisVersionIds: [], claimIds: [], receiptSha256s: [],
  };
  if (kind === "RESEARCH_FRONTIER") {
    const frontier = payload as ResearchFrontierContribution;
    const candidates = frontier.frontier.candidateVersions;
    return {
      ...empty,
      ...base,
      topicIds: [frontier.topic.topicId],
      topicKeys: [frontier.topic.canonicalKey],
      questionIds: [frontier.question.questionId],
      questionTuples: [{ normalizedQuestion: frontier.question.normalizedQuestion, dimensions: frontier.question.dimensions }],
      frontierIds: [frontier.frontier.frontierId],
      laneIds: unique(frontier.frontier.lanes.map(({ laneId }) => laneId)),
      laneKeys: unique(frontier.frontier.lanes.map(({ canonicalKey }) => canonicalKey)),
      contributionIds: [frontier.contributionId],
      passIds: unique(frontier.frontier.passes.map(({ passId }) => passId)),
      candidateIds: unique(candidates.map(({ candidateId }) => candidateId)),
      candidateIdentityHashes: unique(candidates.map(({ identifiers }) => frontierCandidateIdentityHash(identifiers))),
      candidateVersionIds: unique(candidates.flatMap(({ versionId, previousVersionId }) => [versionId, previousVersionId])),
      trailIds: unique(frontier.frontier.trailVersions.map(({ trailId }) => trailId)),
      trailVersionIds: unique(frontier.frontier.trailVersions.flatMap(({ versionId, previousVersionId }) =>
        [versionId, previousVersionId])),
      identifiers: uniqueIdentifiers(candidates.flatMap(({ identifiers }) => identifiers)),
    };
  }
  const analysis = payload as LivingEvidenceContribution;
  const knowledge = analysis.knowledge;
  return {
    ...empty,
    ...base,
    topicIds: unique([analysis.topic?.topicId]),
    topicKeys: unique([analysis.topic?.canonicalKey]),
    questionIds: unique([knowledge?.question?.questionId]),
    questionTuples: knowledge?.question === null || knowledge?.question === undefined
      ? []
      : [{ normalizedQuestion: knowledge.question.normalizedQuestion, dimensions: knowledge.question.dimensions }],
    identifiers: uniqueIdentifiers(analysis.source?.identifiers ?? []),
    sourceFamilyIds: unique([analysis.source?.familyId]),
    sourceIdentityHashes: unique([analysis.source?.identityHash]),
    sourceVersion: analysis.source === null
      ? null
      : {
          versionId: analysis.source.versionId,
          contentSha256: analysis.source.sourceContentSha256,
          retrievedAt: analysis.source.retrievedAt,
        },
    freshnessPolicyIds: unique([knowledge?.freshnessPolicy?.policyId]),
    analysisIds: [analysis.analysis.analysisId],
    analysisVersionIds: unique([analysis.analysis.versionId, analysis.analysis.previousVersionId]),
    claimIds: unique((knowledge?.claims ?? []).map(({ claimId }) => claimId)),
    receiptSha256s: unique(analysis.receipts.map(({ receiptSha256 }) => receiptSha256)),
  };
}

/** The canonical source family a server-built analysis is filed under, with the metadata it reuses. */
export interface CanonicalSourceMatch {
  family: { familyId: string; sourceKind: string; identityHash: string; displayTitle: string };
  /** A complete canonical version of the family with the same bytes, earliest first. */
  version: { versionId: string; retrievedAt: string | null; sourceLocator: string | null } | null;
  freshnessPolicy: CanonicalIdentityState["freshnessPolicies"][number] | null;
}

/**
 * The one canonical source family the analysed source's identifiers name, when none of them conflicts: every
 * identifier the store knows names that family, the family records the same kind of source, and it holds no other
 * value for a scheme the source has (a DOI and a PMID that disagree stay unresolved). Its title, the version with the
 * same bytes and its freshness policy are reused, so a second audit of a study joins the study's record.
 */
export function resolveCanonicalSource(
  source: {
    identifiers: ReadonlyArray<{ scheme: string; value: string }>;
    sourceKind: string;
    sourceContentSha256: string | null;
  },
  state: CanonicalIdentityState,
): CanonicalSourceMatch | undefined {
  const named = state.sourceFamilies.filter((family) =>
    family.identifiers.some((stored) =>
      source.identifiers.some(({ scheme, value }) => scheme === stored.scheme && value === stored.value)));
  if (named.length !== 1) return undefined;
  const family = named[0]!;
  if (family.sourceKind !== source.sourceKind) return undefined;
  const disagrees = source.identifiers.some(({ scheme, value }) => {
    const stored = family.identifiers.filter((identifier) => identifier.scheme === scheme);
    return stored.length > 0 && !stored.some((identifier) => identifier.value === value);
  });
  if (disagrees) return undefined;
  const version = state.sourceVersions
    .filter((candidate) =>
      candidate.familyId === family.familyId && candidate.accessStatus === "complete" &&
      candidate.sourceContentSha256 !== null && candidate.sourceContentSha256 === source.sourceContentSha256)
    .sort((left, right) =>
      (left.retrievedAt ?? "").localeCompare(right.retrievedAt ?? "") || left.versionId.localeCompare(right.versionId))[0];
  return {
    family: {
      familyId: family.familyId,
      sourceKind: family.sourceKind,
      identityHash: family.identityHash,
      displayTitle: family.displayTitle,
    },
    version: version === undefined
      ? null
      : { versionId: version.versionId, retrievedAt: version.retrievedAt, sourceLocator: version.sourceLocator },
    freshnessPolicy: state.freshnessPolicies.find(({ sourceFamilyId }) => sourceFamilyId === family.familyId) ?? null,
  };
}

/**
 * Whether the canonical store already holds this audit of this source under these protocols: a version of the same
 * family carrying a receipt of the same kind and hash, written under the same protocol manifests.
 */
export function auditAlreadyCanonical(
  contribution: LivingEvidenceContribution,
  state: CanonicalIdentityState,
): boolean {
  const protocols = contribution.run.protocolManifests.map(({ sha256: digest }) => digest).sort();
  return contribution.receipts.some(({ receiptKind, receiptSha256 }) =>
    state.receiptVersions.some((stored) =>
      stored.sourceFamilyId === contribution.source?.familyId &&
      stored.receiptKind === receiptKind && stored.receiptSha256 === receiptSha256 &&
      stableJson([...stored.protocolManifestSha256s].sort()) === stableJson(protocols)));
}

/** One identity a reconciled payload continues: the payload path and the ID it now holds there. IDs only. */
export interface ReconciledIdentity {
  path: string;
  from: string | null;
  to: string;
}

/** A conflict with the canonical store that exact identity cannot resolve, at the payload path that holds it. */
export interface CanonicalFinding {
  path: Array<string | number>;
  rule: Extract<ContributionProblemRule, "canonical_conflict" | "canonical_missing">;
  expected: string;
}

export interface FrontierReconciliation {
  payload: ResearchFrontierContribution;
  reconciled: ReconciledIdentity[];
  findings: CanonicalFinding[];
}

const sameDimensions = (left: QuestionDimensions, right: QuestionDimensions) =>
  left.population === right.population &&
  left.programOrExposure === right.programOrExposure &&
  left.comparator === right.comparator &&
  left.outcome === right.outcome &&
  left.horizon === right.horizon &&
  left.setting === right.setting;

/**
 * Continues the canonical records a frontier names, by exact identity: the topic by canonical key (keeping the
 * canonical ID and label), the question and frontier by ID or by the exact question text and dimensions within the
 * topic, lanes by key when the source class, provider and coverage basis match, and candidates by identity hash, each
 * new version chained to the candidate's current version. Passes and trails stay as contributed, with their lane IDs
 * following the lanes. An ID the store holds with other content is a finding, never overwritten.
 */
export function reconcileResearchFrontier(
  sent: ResearchFrontierContribution,
  state: CanonicalIdentityState,
): FrontierReconciliation {
  const payload = structuredClone(sent);
  const reconciled: ReconciledIdentity[] = [];
  const findings: CanonicalFinding[] = [];
  const record = (path: string, from: string | null, to: string) => {
    if (from !== to) reconciled.push({ path, from, to });
  };

  const topic = state.topics.find(({ topicId }) => topicId === payload.topic.topicId);
  if (topic !== undefined && topic.canonicalKey !== payload.topic.canonicalKey) {
    findings.push({
      path: ["payload", "topic", "topicId"],
      rule: "canonical_conflict",
      expected: "a new UUID, or the canonical topic's own key: this UUID names a canonical topic with another key",
    });
  } else {
    const canonical = topic ?? state.topics.find(({ canonicalKey }) => canonicalKey === payload.topic.canonicalKey);
    if (canonical !== undefined) {
      record("payload.topic.topicId", payload.topic.topicId, canonical.topicId);
      payload.topic = { topicId: canonical.topicId, canonicalKey: canonical.canonicalKey, label: canonical.label };
    }
  }

  const question = state.questions.find(({ questionId }) => questionId === payload.question.questionId);
  const sameQuestion = (candidate: CanonicalIdentityState["questions"][number]) =>
    candidate.topicId === payload.topic.topicId &&
    candidate.normalizedQuestion === payload.question.normalizedQuestion &&
    sameDimensions(candidate.dimensions, payload.question.dimensions);
  if (question !== undefined && !sameQuestion(question)) {
    findings.push({
      path: ["payload", "question", "questionId"],
      rule: "canonical_conflict",
      expected: "a new UUID, or this canonical question's exact topic, text and dimensions: this UUID names a " +
        "canonical question that differs",
    });
  } else if (question === undefined) {
    const canonical = state.questions
      .filter(sameQuestion)
      .sort((left, right) => left.questionId.localeCompare(right.questionId))[0];
    if (canonical !== undefined) {
      record("payload.question.questionId", payload.question.questionId, canonical.questionId);
      payload.question.questionId = canonical.questionId;
    }
  }

  const frontier = state.frontiers.find(({ frontierId }) => frontierId === payload.frontier.frontierId);
  if (frontier !== undefined && frontier.questionId !== payload.question.questionId) {
    findings.push({
      path: ["payload", "frontier", "frontierId"],
      rule: "canonical_conflict",
      expected: "a new UUID, or the frontier of this question: this UUID names the canonical frontier of another question",
    });
  } else if (frontier === undefined) {
    const canonical = state.frontiers.find(({ questionId }) => questionId === payload.question.questionId);
    if (canonical !== undefined) {
      record("payload.frontier.frontierId", payload.frontier.frontierId, canonical.frontierId);
      payload.frontier.frontierId = canonical.frontierId;
    }
  }
  const frontierId = payload.frontier.frontierId;

  const laneMap = new Map<string, string>();
  payload.frontier.lanes.forEach((lane, index) => {
    const stored = state.lanes.find(({ laneId }) => laneId === lane.laneId);
    const byKey = state.lanes.find((candidate) =>
      candidate.frontierId === frontierId && candidate.canonicalKey === lane.canonicalKey);
    if (stored !== undefined) {
      if (
        stored.frontierId !== frontierId || stored.canonicalKey !== lane.canonicalKey ||
        stored.sourceClass !== lane.sourceClass || stored.provider !== lane.provider
      ) {
        findings.push({
          path: ["payload", "frontier", "lanes", index, "laneId"],
          rule: "canonical_conflict",
          expected: "a new UUID, or this canonical lane's own frontier, key, source class and provider: this UUID " +
            "names a canonical lane that differs",
        });
        return;
      }
      lane.label = stored.label;
    } else if (byKey !== undefined) {
      if (byKey.sourceClass !== lane.sourceClass || byKey.provider !== lane.provider) {
        findings.push({
          path: ["payload", "frontier", "lanes", index, "canonicalKey"],
          rule: "canonical_conflict",
          expected: "another key: this frontier's canonical lane with this key records another source class or provider",
        });
        return;
      }
      record(`payload.frontier.lanes[${index}].laneId`, lane.laneId, byKey.laneId);
      laneMap.set(lane.laneId, byKey.laneId);
      lane.laneId = byKey.laneId;
      lane.label = byKey.label;
    }
    const basis = (stored ?? byKey)?.coverageBasis ?? null;
    if (basis === null) return;
    payload.frontier.passes.forEach((pass, passIndex) => {
      if ((laneMap.get(pass.laneId) ?? pass.laneId) === lane.laneId && pass.coverageBasis !== basis) {
        findings.push({
          path: ["payload", "frontier", "passes", passIndex, "coverageBasis"],
          rule: "canonical_conflict",
          expected: `${basis}, the coverage basis of this lane's canonical passes, or a separate lane key for this ` +
            "basis: every pass in a lane uses one temporal coverage basis",
        });
      }
    });
  });
  for (const pass of payload.frontier.passes) pass.laneId = laneMap.get(pass.laneId) ?? pass.laneId;
  for (const trail of payload.frontier.trailVersions) {
    if (trail.laneId !== null) trail.laneId = laneMap.get(trail.laneId) ?? trail.laneId;
  }
  const laneIds = payload.frontier.lanes.map(({ laneId }) => laneId);
  if (new Set(laneIds).size !== laneIds.length) {
    findings.push({
      path: ["payload", "frontier", "lanes"],
      rule: "canonical_conflict",
      expected: "one lane per key: two lanes sent here continue the same canonical lane",
    });
  }

  // A version whose predecessor is in this payload continues it; only the first of a chain meets the store.
  const payloadVersions = new Set(payload.frontier.candidateVersions.map(({ versionId }) => versionId));
  const candidateMap = new Map<string, string>();
  payload.frontier.candidateVersions.forEach((version, index) => {
    const path = ["payload", "frontier", "candidateVersions", index] as const;
    const identityHash = frontierCandidateIdentityHash(version.identifiers);
    const stored = state.candidates.find(({ candidateId }) => candidateId === version.candidateId);
    const byIdentity = state.candidates.find((candidate) =>
      candidate.frontierId === frontierId && candidate.identityHash === identityHash);
    const chainStart = version.previousVersionId === null || !payloadVersions.has(version.previousVersionId);
    if (stored !== undefined) {
      if (
        stored.frontierId !== frontierId || stored.candidateKind !== version.candidateKind ||
        stored.identityHash !== identityHash
      ) {
        findings.push({
          path: [...path, "candidateId"],
          rule: "canonical_conflict",
          expected: "a new UUID, or this canonical candidate's own frontier, kind and identifiers: this UUID names a " +
            "canonical candidate that differs",
        });
        return;
      }
    } else if (byIdentity !== undefined) {
      if (byIdentity.candidateKind !== version.candidateKind) {
        findings.push({
          path: [...path, "candidateKind"],
          rule: "canonical_conflict",
          expected: `${byIdentity.candidateKind}: this frontier's canonical candidate with these identifiers records ` +
            "that kind",
        });
        return;
      }
      record(`payload.frontier.candidateVersions[${index}].candidateId`, version.candidateId, byIdentity.candidateId);
      candidateMap.set(version.candidateId, byIdentity.candidateId);
    }
    const canonical = stored ?? byIdentity;
    if (!chainStart) return;
    if (canonical !== undefined && canonical.headVersionId !== null) {
      record(
        `payload.frontier.candidateVersions[${index}].previousVersionId`,
        version.previousVersionId,
        canonical.headVersionId,
      );
      version.previousVersionId = canonical.headVersionId;
    } else if (canonical === undefined && version.previousVersionId !== null) {
      findings.push({
        path: [...path, "previousVersionId"],
        rule: "canonical_missing",
        expected: "null for a candidate this frontier does not hold yet: no canonical candidate of this frontier " +
          "has this version",
      });
    }
  });
  for (const version of payload.frontier.candidateVersions) {
    version.candidateId = candidateMap.get(version.candidateId) ?? version.candidateId;
  }
  return { payload, reconciled, findings };
}

/**
 * The promotion preflight (owner answer 138b): a read-only dry run of the canonical writer's identity checks for this
 * exact payload against the canonical store as it is now, naming each conflict with the code promotion would end the
 * intent with, in the writer's order (the first is the one promotion meets). The store's other rules (delta windows,
 * the scope of candidates and trails, receipts and bindings) run at promotion itself.
 */
export interface ContributionPreflight {
  status: "clear" | "conflicts" | "replay";
  conflicts: Array<{ code: ResearchContributionPromotionFailureCode; path: string }>;
}

export function preflightContribution(
  kind: ContributionKind,
  payload: LivingEvidenceContribution | ResearchFrontierContribution,
  state: CanonicalIdentityState,
  payloadSha256: string,
): ContributionPreflight {
  const conflicts: ContributionPreflight["conflicts"] = [];
  const conflict = (code: ResearchContributionPromotionFailureCode, path: string) => conflicts.push({ code, path });
  const recordId = kind === "RESEARCH_FRONTIER"
    ? (payload as ResearchFrontierContribution).contributionId
    : (payload as LivingEvidenceContribution).analysis.versionId;
  if (state.idempotency !== null) {
    if (state.idempotency.payloadSha256 === payloadSha256 && state.idempotency.recordId === recordId) {
      return { status: "replay", conflicts: [] };
    }
    conflict(
      kind === "RESEARCH_FRONTIER" ? "FRONTIER_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" : "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
      "payload.idempotencyKey",
    );
  }
  payload.run.protocolManifests.forEach((manifest, index) => {
    const stored = state.manifests.find(({ sha256: digest }) => digest === manifest.sha256);
    if (stored !== undefined && (stored.name !== manifest.name || stored.version !== manifest.version || !stored.revisionDateMatches)) {
      conflict("PROTOCOL_MANIFEST_CONFLICT", `payload.run.protocolManifests[${index}]`);
    }
  });
  const run = state.run;
  if (
    run !== null && (
      run.runKind !== payload.run.runKind || !run.startedAtMatches || !run.completedAtMatches ||
      JSON.stringify(run.protocolManifestSha256s) !==
        JSON.stringify(payload.run.protocolManifests.map(({ sha256: digest }) => digest)) ||
      run.provenanceNote !== payload.run.provenanceNote
    )
  ) {
    conflict("RESEARCH_RUN_CONFLICT", "payload.run.runId");
  }
  const topic = kind === "RESEARCH_FRONTIER"
    ? (payload as ResearchFrontierContribution).topic
    : (payload as LivingEvidenceContribution).topic;
  if (topic !== null) {
    const stored = state.topics.find(({ topicId }) => topicId === topic.topicId);
    if (stored !== undefined) {
      if (stored.canonicalKey !== topic.canonicalKey || stored.label !== topic.label) {
        conflict("TOPIC_ID_CONFLICT", "payload.topic.topicId");
      }
    } else if (state.topics.some(({ canonicalKey }) => canonicalKey === topic.canonicalKey)) {
      conflict("TOPIC_KEY_CONFLICT", "payload.topic.canonicalKey");
    }
  }
  if (kind === "RESEARCH_FRONTIER") {
    preflightFrontier(payload as ResearchFrontierContribution, state, conflict);
  } else {
    preflightAnalysis(payload as LivingEvidenceContribution, state, conflict);
  }
  return { status: conflicts.length === 0 ? "clear" : "conflicts", conflicts };
}

type Conflict = (code: ResearchContributionPromotionFailureCode, path: string) => void;

function questionDiffers(
  stored: CanonicalIdentityState["questions"][number],
  topicId: string,
  question: { normalizedQuestion: string; dimensions: QuestionDimensions },
): boolean {
  return stored.topicId !== topicId || stored.normalizedQuestion !== question.normalizedQuestion ||
    !sameDimensions(stored.dimensions, question.dimensions);
}

function preflightFrontier(payload: ResearchFrontierContribution, state: CanonicalIdentityState, conflict: Conflict): void {
  const storedQuestion = state.questions.find(({ questionId }) => questionId === payload.question.questionId);
  if (storedQuestion !== undefined && questionDiffers(storedQuestion, payload.topic.topicId, payload.question)) {
    conflict("QUESTION_ID_CONFLICT", "payload.question.questionId");
  }
  const frontierId = payload.frontier.frontierId;
  const storedFrontier = state.frontiers.find((candidate) => candidate.frontierId === frontierId);
  if (storedFrontier !== undefined) {
    if (storedFrontier.questionId !== payload.question.questionId) {
      conflict("RESEARCH_FRONTIER_ID_CONFLICT", "payload.frontier.frontierId");
    }
  } else if (state.frontiers.some(({ questionId }) => questionId === payload.question.questionId)) {
    conflict("RESEARCH_FRONTIER_QUESTION_CONFLICT", "payload.frontier.frontierId");
  }
  payload.frontier.lanes.forEach((lane, index) => {
    const stored = state.lanes.find(({ laneId }) => laneId === lane.laneId);
    if (stored !== undefined) {
      if (
        stored.frontierId !== frontierId || stored.canonicalKey !== lane.canonicalKey ||
        stored.sourceClass !== lane.sourceClass || stored.provider !== lane.provider || stored.label !== lane.label
      ) {
        conflict("FRONTIER_LANE_ID_CONFLICT", `payload.frontier.lanes[${index}].laneId`);
      }
    } else if (state.lanes.some((candidate) => candidate.frontierId === frontierId && candidate.canonicalKey === lane.canonicalKey)) {
      conflict("FRONTIER_LANE_KEY_CONFLICT", `payload.frontier.lanes[${index}].canonicalKey`);
    }
  });
  if (state.contributionIds.includes(payload.contributionId)) conflict("CANONICAL_UNIQUE_CONFLICT", "payload.contributionId");
  payload.frontier.passes.forEach((pass, index) => {
    if (state.passIds.includes(pass.passId)) conflict("CANONICAL_UNIQUE_CONFLICT", `payload.frontier.passes[${index}].passId`);
    const basis = state.lanes.find(({ laneId }) => laneId === pass.laneId)?.coverageBasis ?? null;
    if (basis !== null && basis !== pass.coverageBasis) {
      conflict("FRONTIER_LANE_COVERAGE_BASIS_MISMATCH", `payload.frontier.passes[${index}].coverageBasis`);
    }
  });
  // As the writer meets them, one after another: a version earlier in this payload is the next one's head.
  const heads = new Map(state.candidates.map(({ candidateId, headVersionId }) => [candidateId, headVersionId]));
  const versionCandidates = new Map(state.candidateVersions.map(({ versionId, candidateId }) => [versionId, candidateId]));
  const created = new Map<string, { frontierId: string; candidateKind: string; identityHash: string }>();
  payload.frontier.candidateVersions.forEach((version, index) => {
    const path = `payload.frontier.candidateVersions[${index}]`;
    const identityHash = frontierCandidateIdentityHash(version.identifiers);
    const stored = state.candidates.find(({ candidateId }) => candidateId === version.candidateId) ??
      created.get(version.candidateId);
    if (stored === undefined) {
      if (version.previousVersionId !== null) {
        conflict("FRONTIER_CANDIDATE_INITIAL_VERSION_REQUIRED", `${path}.previousVersionId`);
      } else if ([...state.candidates, ...created.values()].some((candidate) =>
        candidate.frontierId === frontierId && candidate.identityHash === identityHash)) {
        conflict("FRONTIER_CANDIDATE_IDENTITY_CONFLICT", `${path}.identifiers`);
      }
      created.set(version.candidateId, { frontierId, candidateKind: version.candidateKind, identityHash });
    } else if (version.previousVersionId === null) {
      conflict("FRONTIER_CANDIDATE_ALREADY_HAS_INITIAL_VERSION", `${path}.previousVersionId`);
    } else if (
      stored.frontierId !== frontierId || stored.candidateKind !== version.candidateKind || stored.identityHash !== identityHash
    ) {
      conflict("FRONTIER_CANDIDATE_ID_CONFLICT", `${path}.candidateId`);
    }
    // The store's lineage trigger runs before its unique keys.
    if (version.previousVersionId !== null && (stored !== undefined || created.has(version.candidateId))) {
      if (versionCandidates.get(version.previousVersionId) !== version.candidateId) {
        conflict("FRONTIER_CANDIDATE_LINEAGE_MISMATCH", `${path}.previousVersionId`);
      } else if (heads.get(version.candidateId) !== version.previousVersionId) {
        conflict("CANONICAL_UNIQUE_CONFLICT", `${path}.previousVersionId`);
      }
    }
    if (versionCandidates.has(version.versionId)) conflict("CANONICAL_UNIQUE_CONFLICT", `${path}.versionId`);
    versionCandidates.set(version.versionId, version.candidateId);
    heads.set(version.candidateId, version.versionId);
  });
  const trailHeads = new Map(state.trails.map(({ trailId, headVersionId }) => [trailId, headVersionId]));
  const trailVersions = new Map(state.trailVersions.map(({ versionId, trailId }) => [versionId, trailId]));
  const createdTrails = new Map<string, { frontierId: string; trailKind: string }>();
  payload.frontier.trailVersions.forEach((trail, index) => {
    const path = `payload.frontier.trailVersions[${index}]`;
    const stored = state.trails.find(({ trailId }) => trailId === trail.trailId) ?? createdTrails.get(trail.trailId);
    if (stored === undefined) {
      if (trail.previousVersionId !== null) conflict("FRONTIER_TRAIL_INITIAL_VERSION_REQUIRED", `${path}.previousVersionId`);
      createdTrails.set(trail.trailId, { frontierId, trailKind: trail.trailKind });
    } else if (trail.previousVersionId === null) {
      conflict("FRONTIER_TRAIL_ALREADY_HAS_INITIAL_VERSION", `${path}.previousVersionId`);
    } else if (stored.frontierId !== frontierId || stored.trailKind !== trail.trailKind) {
      conflict("FRONTIER_TRAIL_ID_CONFLICT", `${path}.trailId`);
    }
    if (trail.previousVersionId !== null && (stored !== undefined || createdTrails.has(trail.trailId))) {
      if (trailVersions.get(trail.previousVersionId) !== trail.trailId) {
        conflict("FRONTIER_TRAIL_LINEAGE_MISMATCH", `${path}.previousVersionId`);
      } else if (trailHeads.get(trail.trailId) !== trail.previousVersionId) {
        conflict("CANONICAL_UNIQUE_CONFLICT", `${path}.previousVersionId`);
      }
    }
    if (trailVersions.has(trail.versionId)) conflict("CANONICAL_UNIQUE_CONFLICT", `${path}.versionId`);
    trailVersions.set(trail.versionId, trail.trailId);
    trailHeads.set(trail.trailId, trail.versionId);
  });
}

function preflightAnalysis(payload: LivingEvidenceContribution, state: CanonicalIdentityState, conflict: Conflict): void {
  const source = payload.source;
  if (source !== null) {
    const family = state.sourceFamilies.find(({ familyId }) => familyId === source.familyId);
    if (family !== undefined) {
      if (
        family.sourceKind !== source.sourceKind || family.identityHash !== source.identityHash ||
        family.displayTitle !== source.displayTitle
      ) {
        conflict("SOURCE_FAMILY_ID_CONFLICT", "payload.source.familyId");
      }
    } else if (state.sourceFamilies.some(({ identityHash }) => identityHash === source.identityHash)) {
      conflict("SOURCE_FAMILY_IDENTITY_CONFLICT", "payload.source.identityHash");
    }
    source.identifiers.forEach(({ scheme, value }, index) => {
      if (state.sourceFamilies.some((candidate) =>
        candidate.familyId !== source.familyId &&
        candidate.identifiers.some((stored) => stored.scheme === scheme && stored.value === value))) {
        conflict("SOURCE_IDENTIFIER_CONFLICT", `payload.source.identifiers[${index}]`);
      }
    });
    const version = state.sourceVersions.find(({ versionId }) => versionId === source.versionId);
    if (version !== undefined) {
      if (
        version.familyId !== source.familyId || version.sourceContentSha256 !== source.sourceContentSha256 ||
        version.accessStatus !== source.accessStatus || !version.retrievedAtMatches ||
        version.sourceLocator !== source.sourceLocator
      ) {
        conflict("SOURCE_VERSION_ID_CONFLICT", "payload.source.versionId");
      }
    } else if (state.sourceVersions.some((candidate) =>
      candidate.familyId === source.familyId && candidate.sourceContentSha256 === source.sourceContentSha256 &&
      candidate.accessStatus === source.accessStatus && candidate.retrievedAtMatches)) {
      conflict("SOURCE_VERSION_IDENTITY_CONFLICT", "payload.source.versionId");
    }
  }
  const analysis = payload.analysis;
  const stored = state.analyses.find(({ analysisId }) => analysisId === analysis.analysisId);
  if (stored === undefined) {
    if (analysis.relationship !== "initial") conflict("ANALYSIS_INITIAL_VERSION_REQUIRED", "payload.analysis.relationship");
  } else if (analysis.relationship === "initial") {
    conflict("ANALYSIS_ALREADY_HAS_INITIAL_VERSION", "payload.analysis.analysisId");
  } else if (stored.topicId !== (payload.topic?.topicId ?? null) || stored.sourceFamilyId !== (source?.familyId ?? null)) {
    conflict("ANALYSIS_TARGET_MISMATCH", "payload.analysis.analysisId");
  }
  if (state.analysisVersionIds.includes(analysis.versionId)) conflict("CANONICAL_UNIQUE_CONFLICT", "payload.analysis.versionId");
  if (analysis.previousVersionId !== null && !state.analysisVersionIds.includes(analysis.previousVersionId)) {
    conflict("ANALYSIS_LINEAGE_MISMATCH", "payload.analysis.previousVersionId");
  }
  const knowledge = payload.knowledge;
  if (knowledge === undefined) return;
  const question = knowledge.question;
  if (question !== null && payload.topic !== null) {
    const storedQuestion = state.questions.find(({ questionId }) => questionId === question.questionId);
    if (storedQuestion !== undefined && questionDiffers(storedQuestion, payload.topic.topicId, question)) {
      conflict("QUESTION_ID_CONFLICT", "payload.knowledge.question.questionId");
    }
  }
  knowledge.claims.forEach((claim, index) => {
    const path = `payload.knowledge.claims[${index}]`;
    const storedClaim = state.claims.find(({ claimId }) => claimId === claim.claimId);
    if (storedClaim === undefined) {
      if (claim.supersedesClaimVersionId !== null) conflict("CLAIM_INITIAL_VERSION_REQUIRED", `${path}.supersedesClaimVersionId`);
    } else if (claim.supersedesClaimVersionId === null) {
      conflict("CLAIM_ALREADY_HAS_INITIAL_VERSION", `${path}.supersedesClaimVersionId`);
    } else if (storedClaim.questionId !== claim.questionId || storedClaim.claimType !== claim.claimType) {
      conflict("CLAIM_ID_CONFLICT", `${path}.claimId`);
    }
  });
  const policy = knowledge.freshnessPolicy;
  if (policy !== null && source !== null) {
    const storedPolicy = state.freshnessPolicies.find(({ policyId }) => policyId === policy.policyId);
    if (storedPolicy !== undefined) {
      if (
        storedPolicy.sourceFamilyId !== source.familyId || storedPolicy.sourceClass !== policy.sourceClass ||
        storedPolicy.cadenceDays !== policy.cadenceDays || storedPolicy.maximumAgeDays !== policy.maximumAgeDays ||
        storedPolicy.ownerRole !== policy.ownerRole ||
        JSON.stringify(storedPolicy.requiredChecks) !== JSON.stringify(policy.requiredChecks) ||
        storedPolicy.failureBehavior !== policy.failureBehavior
      ) {
        conflict("FRESHNESS_POLICY_ID_CONFLICT", "payload.knowledge.freshnessPolicy.policyId");
      }
    } else if (state.freshnessPolicies.some(({ sourceFamilyId }) => sourceFamilyId === source.familyId)) {
      // One freshness policy per source family.
      conflict("CANONICAL_UNIQUE_CONFLICT", "payload.knowledge.freshnessPolicy.policyId");
    }
  }
}

/** A canonical record that shares one of a proposal's identities (for the owner's review). IDs only. */
export interface RelatedCanonicalRecord {
  record: "topic" | "question" | "frontier" | "frontier_candidate" | "source_family";
  id: string;
  frontierId?: string;
  shared: "topic_key" | "question_text_and_dimensions" | "question_id" | "frontier_id" | "identifier";
}

export const RELATED_RECORDS_SHOWN = 25;

/** The canonical records sharing the proposal's topic key, frontier, question or a candidate or source identifier. */
export function relatedCanonicalRecords(
  kind: ContributionKind,
  payload: LivingEvidenceContribution | ResearchFrontierContribution,
  state: CanonicalIdentityState,
): { records: RelatedCanonicalRecord[]; notShown: number } {
  const records: RelatedCanonicalRecord[] = [];
  const topic = kind === "RESEARCH_FRONTIER"
    ? (payload as ResearchFrontierContribution).topic
    : (payload as LivingEvidenceContribution).topic;
  for (const stored of state.topics) {
    if (topic !== null && stored.canonicalKey === topic.canonicalKey) {
      records.push({ record: "topic", id: stored.topicId, shared: "topic_key" });
    }
  }
  if (kind === "RESEARCH_FRONTIER") {
    const frontier = payload as ResearchFrontierContribution;
    for (const stored of state.questions) {
      if (
        stored.questionId !== frontier.question.questionId &&
        stored.normalizedQuestion === frontier.question.normalizedQuestion &&
        sameDimensions(stored.dimensions, frontier.question.dimensions)
      ) {
        records.push({ record: "question", id: stored.questionId, shared: "question_text_and_dimensions" });
      }
    }
    for (const stored of state.frontiers) {
      if (stored.frontierId === frontier.frontier.frontierId) {
        records.push({ record: "frontier", id: stored.frontierId, shared: "frontier_id" });
      } else if (stored.questionId === frontier.question.questionId) {
        records.push({ record: "frontier", id: stored.frontierId, shared: "question_id" });
      }
    }
  }
  const candidates = new Map<string, RelatedCanonicalRecord>();
  for (const stored of state.identifierCandidates) {
    candidates.set(stored.candidateId, {
      record: "frontier_candidate", id: stored.candidateId, frontierId: stored.frontierId, shared: "identifier",
    });
  }
  records.push(...candidates.values());
  const identifiers = kind === "RESEARCH_FRONTIER"
    ? (payload as ResearchFrontierContribution).frontier.candidateVersions.flatMap(({ identifiers: list }) => list)
    : (payload as LivingEvidenceContribution).source?.identifiers ?? [];
  for (const family of state.sourceFamilies) {
    if (family.identifiers.some((stored) => identifiers.some(({ scheme, value }) => scheme === stored.scheme && value === stored.value))) {
      records.push({ record: "source_family", id: family.familyId, shared: "identifier" });
    }
  }
  return { records: records.slice(0, RELATED_RECORDS_SHOWN), notShown: Math.max(0, records.length - RELATED_RECORDS_SHOWN) };
}

export const RELATED_PROPOSAL_KEY_KINDS = [
  "topic_key",
  "topic_id",
  "frontier_id",
  "question_id",
  "source_family_id",
  "identifier",
] as const;

export type RelatedProposalKeyKind = typeof RELATED_PROPOSAL_KEY_KINDS[number];

/**
 * The identities a proposal's payload names, which related proposals share: in step with migration 0012's
 * research_contribution_proposal_keys, which the review role's context function uses.
 */
export function proposalKeys(payload: unknown): Array<{ kind: RelatedProposalKeyKind; value: string }> {
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const text = (value: unknown) => typeof value === "string" ? value : undefined;
  const root = record(payload);
  const identifier = (value: unknown) => {
    const { scheme, value: identifierValue } = record(value);
    return typeof scheme === "string" && typeof identifierValue === "string" ? `${scheme}:${identifierValue}` : undefined;
  };
  const keys: Array<[RelatedProposalKeyKind, string | undefined]> = [
    ["topic_key", text(record(root.topic).canonicalKey)],
    ["topic_id", text(record(root.topic).topicId)],
    ["frontier_id", text(record(root.frontier).frontierId)],
    ["question_id", text(record(root.question).questionId)],
    ["question_id", text(record(record(root.knowledge).question).questionId)],
    ["source_family_id", text(record(root.source).familyId)],
    ...list(record(root.frontier).candidateVersions).flatMap((candidate) =>
      list(record(candidate).identifiers).map((value): [RelatedProposalKeyKind, string | undefined] =>
        ["identifier", identifier(value)])),
    ...list(record(root.source).identifiers).map((value): [RelatedProposalKeyKind, string | undefined] =>
      ["identifier", identifier(value)]),
  ];
  return keys.flatMap(([kind, value]) => value === undefined ? [] : [{ kind, value }]);
}
