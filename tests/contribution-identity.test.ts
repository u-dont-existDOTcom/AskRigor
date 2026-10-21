import { describe, expect, it } from "vitest";

import {
  CONTRIBUTION_EXAMPLES,
  CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributionRejectedError,
  ResearchContributorAccessService,
  canonicalIdentityRequest,
  frontierCandidateIdentityHash,
  prepareResearchContributionProposal,
  reconcileResearchFrontier,
  type CanonicalIdentityReader,
  type CanonicalIdentityState,
  type ResearchFrontierContribution,
} from "../packages/evidence-repository/src/index.js";

// Owner answer 138b (2026-10-20): "exact merging (the same topic, question or study continues the existing record ...)".

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sent = (): ResearchFrontierContribution =>
  prepareResearchContributionProposal("RESEARCH_FRONTIER", structuredClone(CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER))
    .payload as ResearchFrontierContribution;

function emptyState(): CanonicalIdentityState {
  return {
    idempotency: null, manifests: [], run: null, topics: [], questions: [], frontiers: [], lanes: [],
    contributionIds: [], passIds: [], candidates: [], candidateVersions: [], trails: [], trailVersions: [],
    identifierCandidates: [], sourceFamilies: [], sourceVersions: [], freshnessPolicies: [], analyses: [],
    analysisVersionIds: [], claims: [], receiptVersions: [],
  };
}

/** The canonical frontier the example continues: the same topic key, question, lane key and candidate identifiers. */
function canonicalState(payload = sent()): CanonicalIdentityState {
  const state = emptyState();
  state.topics.push({ topicId: uuid(1), canonicalKey: payload.topic.canonicalKey, label: "Canonical label" });
  state.questions.push({
    questionId: uuid(2),
    topicId: uuid(1),
    normalizedQuestion: payload.question.normalizedQuestion,
    dimensions: structuredClone(payload.question.dimensions),
  });
  state.frontiers.push({ frontierId: uuid(3), questionId: uuid(2) });
  const lane = payload.frontier.lanes[0]!;
  state.lanes.push({
    laneId: uuid(4), frontierId: uuid(3), canonicalKey: lane.canonicalKey, sourceClass: lane.sourceClass,
    provider: lane.provider, label: "Canonical lane label", coverageBasis: "publication_date",
  });
  const candidate = payload.frontier.candidateVersions[0]!;
  state.candidates.push({
    candidateId: uuid(5), frontierId: uuid(3), candidateKind: candidate.candidateKind,
    identityHash: frontierCandidateIdentityHash(candidate.identifiers), headVersionId: uuid(6),
  });
  return state;
}

describe("a frontier continues the canonical records it names, by exact identity", () => {
  it("leaves a frontier with no canonical match as sent", () => {
    const payload = sent();
    const result = reconcileResearchFrontier(payload, emptyState());
    expect(result).toEqual({ payload, reconciled: [], findings: [] });
  });

  it("continues the topic by key, the question by its exact text and dimensions, and that question's frontier", () => {
    const payload = sent();
    const { payload: reconciled, reconciled: ids, findings } = reconcileResearchFrontier(payload, canonicalState());
    expect(findings).toEqual([]);
    expect(reconciled.topic).toEqual({ topicId: uuid(1), canonicalKey: payload.topic.canonicalKey, label: "Canonical label" });
    expect(reconciled.question.questionId).toBe(uuid(2));
    expect(reconciled.frontier.frontierId).toBe(uuid(3));
    expect(ids.slice(0, 3)).toEqual([
      { path: "payload.topic.topicId", from: payload.topic.topicId, to: uuid(1) },
      { path: "payload.question.questionId", from: payload.question.questionId, to: uuid(2) },
      { path: "payload.frontier.frontierId", from: payload.frontier.frontierId, to: uuid(3) },
    ]);
  });

  it("continues a lane by key, and its passes and trails follow; a candidate by identity, chained to its current version", () => {
    const payload = sent();
    const { payload: reconciled, reconciled: ids } = reconcileResearchFrontier(payload, canonicalState());
    expect(reconciled.frontier.lanes[0]).toMatchObject({ laneId: uuid(4), label: "Canonical lane label" });
    expect(reconciled.frontier.passes[0]!.laneId).toBe(uuid(4));
    expect(reconciled.frontier.trailVersions[0]!.laneId).toBe(uuid(4));
    expect(reconciled.frontier.candidateVersions[0]).toMatchObject({ candidateId: uuid(5), previousVersionId: uuid(6) });
    expect(ids.slice(3)).toEqual([
      { path: "payload.frontier.lanes[0].laneId", from: payload.frontier.lanes[0]!.laneId, to: uuid(4) },
      {
        path: "payload.frontier.candidateVersions[0].candidateId",
        from: payload.frontier.candidateVersions[0]!.candidateId,
        to: uuid(5),
      },
      { path: "payload.frontier.candidateVersions[0].previousVersionId", from: null, to: uuid(6) },
    ]);
    // Trails and passes stay as contributed otherwise.
    expect(reconciled.frontier.trailVersions).toEqual(payload.frontier.trailVersions.map((trail) => ({ ...trail, laneId: uuid(4) })));
    // The continuation still passes the whole contract.
    expect(() => prepareResearchContributionProposal("RESEARCH_FRONTIER", reconciled)).not.toThrow();
  });

  it("chains a new version of a canonical candidate named by its own ID to the candidate's current version", () => {
    const payload = sent();
    const state = canonicalState();
    state.candidates[0]!.candidateId = payload.frontier.candidateVersions[0]!.candidateId;
    const { payload: reconciled, reconciled: ids } = reconcileResearchFrontier(payload, state);
    expect(reconciled.frontier.candidateVersions[0]!.previousVersionId).toBe(uuid(6));
    expect(ids).toContainEqual({ path: "payload.frontier.candidateVersions[0].previousVersionId", from: null, to: uuid(6) });
  });

  it("names, and never overwrites, an ID the store holds with other content", () => {
    const payload = sent();
    const state = canonicalState();
    state.topics.push({ topicId: payload.topic.topicId, canonicalKey: "another-topic", label: "Another" });
    state.frontiers.push({ frontierId: payload.frontier.frontierId, questionId: uuid(9) });
    state.lanes.push({
      laneId: payload.frontier.lanes[0]!.laneId, frontierId: uuid(3), canonicalKey: "another-lane", sourceClass: "study",
      provider: "pubmed", label: "Another lane", coverageBasis: null,
    });
    const { findings } = reconcileResearchFrontier(payload, state);
    expect(findings.map(({ path, rule }) => `${path.join(".")} ${rule}`)).toEqual([
      "payload.topic.topicId canonical_conflict",
      "payload.frontier.frontierId canonical_conflict",
      "payload.frontier.lanes.0.laneId canonical_conflict",
    ]);
  });

  it("does not merge a lane key whose provider or coverage basis differs, or a candidate of another kind", () => {
    const payload = sent();
    const provider = canonicalState();
    provider.lanes[0]!.provider = "europe_pmc";
    expect(reconcileResearchFrontier(payload, provider).findings.map(({ path }) => path.join("."))).toEqual([
      "payload.frontier.lanes.0.canonicalKey",
    ]);
    const basis = canonicalState();
    basis.lanes[0]!.coverageBasis = "index_date";
    const basisFindings = reconcileResearchFrontier(payload, basis).findings;
    expect(basisFindings.map(({ path }) => path.join("."))).toEqual(["payload.frontier.passes.0.coverageBasis"]);
    expect(basisFindings[0]!.expected).toMatch(/^index_date, the coverage basis of this lane's canonical passes/u);
    const kind = canonicalState();
    kind.candidates[0]!.candidateKind = "review";
    expect(reconcileResearchFrontier(payload, kind).findings.map(({ path }) => path.join("."))).toEqual([
      "payload.frontier.candidateVersions.0.candidateKind",
    ]);
  });

  it("does not merge a question whose text or one dimension differs, in any language", () => {
    for (const change of [
      (payload: ResearchFrontierContribution) => { payload.question.normalizedQuestion = "¿Qué evidencia formal sigue?"; },
      (payload: ResearchFrontierContribution) => { payload.question.dimensions.horizon = "12 Monate"; },
    ]) {
      const payload = sent();
      change(payload);
      const { payload: reconciled } = reconcileResearchFrontier(payload, canonicalState());
      expect(reconciled.question.questionId).toBe(payload.question.questionId);
      expect(reconciled.frontier.frontierId).toBe(payload.frontier.frontierId);
    }
  });

  it("asks the reader only for the identities the frontier names", () => {
    const payload = sent();
    payload.frontier.passes[0]!.deidentifiedQuery = "synthetic formal query that is never looked up";
    const request = canonicalIdentityRequest("RESEARCH_FRONTIER", payload);
    expect(request).toMatchObject({
      kind: "RESEARCH_FRONTIER",
      idempotencyKey: payload.idempotencyKey,
      topicKeys: [payload.topic.canonicalKey],
      laneKeys: [payload.frontier.lanes[0]!.canonicalKey],
      candidateIdentityHashes: [frontierCandidateIdentityHash(payload.frontier.candidateVersions[0]!.identifiers)],
      identifiers: payload.frontier.candidateVersions[0]!.identifiers,
      sourceVersion: null,
    });
    expect(JSON.stringify(request)).not.toContain(payload.frontier.passes[0]!.deidentifiedQuery);
  });
});

describe("submission reconciles a frontier before it is stored", () => {
  const SUBJECT = "auth0|synthetic-continuation-user";
  async function service() {
    const store = new InMemoryResearchContributorAccessStore();
    const access = new ResearchContributorAccessService({
      store,
      identitySecret: new TextEncoder().encode("synthetic-continuation-identity-secret-of-32-bytes"),
      now: () => "2026-10-21T01:00:00.000Z",
      randomUuid: () => uuid(99),
    });
    await access.acceptFreeContributor(SUBJECT, {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
    return { store, access };
  }
  const input = () => ({
    proposalKind: "RESEARCH_FRONTIER",
    privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
    payload: structuredClone(CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER),
  });

  it("stores the continuation, whose hash the owner reviews, and reports the IDs it continued", async () => {
    const { store, access } = await service();
    const reader: CanonicalIdentityReader = { readCanonicalIdentity: async () => canonicalState() };
    const result = await access.submitProposal(SUBJECT, input(), { canonical: reader });
    expect(result).toMatchObject({ status: "inserted", canonicalCheck: "checked" });
    expect(result.reconciled.map(({ to }) => to)).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5), uuid(6)]);
    const stored = store.allProposals()[0]!;
    expect(stored.payload).toMatchObject({ topic: { topicId: uuid(1) }, frontier: { frontierId: uuid(3) } });
    expect(stored.payloadSha256).toBe(prepareResearchContributionProposal("RESEARCH_FRONTIER", stored.payload).payloadSha256);
    expect(stored.payloadSha256).not.toBe(prepareResearchContributionProposal("RESEARCH_FRONTIER", input().payload).payloadSha256);
    // The same record sent again reconciles the same way: an idempotent replay.
    expect((await access.submitProposal(SUBJECT, input(), { canonical: reader })).status).toBe("idempotent_replay");
  });

  it("refuses a conflict with field-level problems and stores nothing", async () => {
    const { store, access } = await service();
    const state = canonicalState();
    state.topics.push({
      topicId: (CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER.topic as { topicId: string }).topicId,
      canonicalKey: "another-topic",
      label: "Another",
    });
    const error = await access.submitProposal(SUBJECT, input(), {
      canonical: { readCanonicalIdentity: async () => state },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResearchContributionRejectedError);
    const rejected = error as ResearchContributionRejectedError;
    expect(rejected.code).toBe("INVALID_REQUEST");
    expect(rejected.problems).toEqual([{
      path: "payload.topic.topicId",
      rule: "canonical_conflict",
      expected: "a new UUID, or the canonical topic's own key: this UUID names a canonical topic with another key",
      example: JSON.stringify("00000000-0000-4000-8000-000000000033"),
    }]);
    expect(store.allProposals()).toHaveLength(0);
  });

  it("files the record as sent when the canonical store cannot be read", async () => {
    const { store, access } = await service();
    const result = await access.submitProposal(SUBJECT, input(), {
      canonical: { readCanonicalIdentity: async () => { throw new Error("connection refused"); } },
    });
    expect(result).toMatchObject({ status: "inserted", canonicalCheck: "unavailable", reconciled: [] });
    expect(store.allProposals()[0]!.payload).toMatchObject({
      topic: { topicId: (CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER.topic as { topicId: string }).topicId },
    });
  });
});
