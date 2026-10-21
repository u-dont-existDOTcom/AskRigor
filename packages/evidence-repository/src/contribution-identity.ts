import type {
  LivingEvidenceContribution,
  ResearchFrontierContribution,
} from "./contracts.js";
import { sha256, stableJson } from "./hash.js";
import type { ContributionProblemRule } from "./research-contribution-check.js";

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
    freshnessPolicyIds: [], analysisIds: [], analysisVersionIds: [], claimIds: [],
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
  };
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
