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
  preflightContribution,
  prepareResearchContributionProposal,
  proposalKeys,
  reconcileResearchFrontier,
  relatedCanonicalRecords,
  type CanonicalIdentityReader,
  type CanonicalIdentityState,
  type LivingEvidenceContribution,
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
    analysisVersionIds: [], claims: [], topicLink: null, receiptVersions: [],
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
  state.candidateVersions.push({ versionId: uuid(6), candidateId: uuid(5) });
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

describe("the promotion preflight names what the canonical writer would refuse, with its code", () => {
  const sha = "f".repeat(64);
  const codes = (state: CanonicalIdentityState, payload = sent()) =>
    preflightContribution("RESEARCH_FRONTIER", payload, state, sha).conflicts.map(({ code, path }) => `${code} ${path}`);

  it("is clear for a frontier the store does not hold, and a replay for the stored one", () => {
    const payload = sent();
    expect(preflightContribution("RESEARCH_FRONTIER", payload, emptyState(), sha)).toEqual({ status: "clear", conflicts: [] });
    const stored = emptyState();
    stored.idempotency = { recordId: payload.contributionId, payloadSha256: sha };
    expect(preflightContribution("RESEARCH_FRONTIER", payload, stored, sha)).toEqual({ status: "replay", conflicts: [] });
    stored.idempotency = { recordId: payload.contributionId, payloadSha256: "e".repeat(64) };
    expect(codes(stored)).toEqual(["FRONTIER_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH payload.idempotencyKey"]);
  });

  it("names the latent collisions an unreconciled frontier meets, in the writer's order", () => {
    // canonicalState() holds the same topic key, question, lane key and candidate identity under other IDs; as sent,
    // the frontier is a new one under a new topic UUID, so only the topic key meets the store.
    expect(codes(canonicalState())).toEqual(["TOPIC_KEY_CONFLICT payload.topic.canonicalKey"]);
    // Within the canonical frontier, a new candidate UUID with a canonical candidate's identifiers is a collision too.
    const inFrontier = sent();
    inFrontier.topic.topicId = uuid(1);
    inFrontier.topic.label = "Canonical label";
    inFrontier.question.questionId = uuid(2);
    inFrontier.frontier.frontierId = uuid(3);
    inFrontier.frontier.lanes[0]!.laneId = uuid(4);
    inFrontier.frontier.lanes[0]!.label = "Canonical lane label";
    inFrontier.frontier.passes[0]!.laneId = uuid(4);
    inFrontier.frontier.trailVersions[0]!.laneId = uuid(4);
    const lanes = canonicalState();
    expect(codes(lanes, inFrontier)).toEqual([
      "FRONTIER_CANDIDATE_IDENTITY_CONFLICT payload.frontier.candidateVersions[0].identifiers",
    ]);
    // Once reconciled, the same frontier is clear.
    const reconciled = reconcileResearchFrontier(sent(), canonicalState()).payload;
    expect(preflightContribution("RESEARCH_FRONTIER", reconciled, canonicalState(), sha)).toMatchObject({ status: "clear" });
  });

  it("compares run times as instants and names the run, the question, the frontier and the lane conflicts", () => {
    const payload = sent();
    const state = emptyState();
    state.run = {
      runId: payload.run.runId, runKind: payload.run.runKind, startedAtMatches: false, completedAtMatches: true,
      protocolManifestSha256s: payload.run.protocolManifests.map(({ sha256: digest }) => digest),
      provenanceNote: payload.run.provenanceNote,
    };
    state.questions.push({ questionId: payload.question.questionId, topicId: payload.topic.topicId,
      normalizedQuestion: "Another question", dimensions: payload.question.dimensions });
    state.frontiers.push({ frontierId: uuid(70), questionId: payload.question.questionId });
    state.lanes.push({ laneId: uuid(71), frontierId: payload.frontier.frontierId, canonicalKey: payload.frontier.lanes[0]!.canonicalKey,
      sourceClass: "study", provider: "pubmed", label: "Canonical lane", coverageBasis: "index_date" });
    expect(codes(state, payload)).toEqual([
      "RESEARCH_RUN_CONFLICT payload.run.runId",
      "QUESTION_ID_CONFLICT payload.question.questionId",
      "RESEARCH_FRONTIER_QUESTION_CONFLICT payload.frontier.frontierId",
      "FRONTIER_LANE_KEY_CONFLICT payload.frontier.lanes[0].canonicalKey",
    ]);
  });

  it("checks a candidate's versions as the writer chains them", () => {
    const payload = sent();
    const state = canonicalState();
    state.candidates[0]!.candidateId = payload.frontier.candidateVersions[0]!.candidateId;
    state.candidates[0]!.frontierId = payload.frontier.frontierId;
    state.candidateVersions.push({ versionId: uuid(6), candidateId: payload.frontier.candidateVersions[0]!.candidateId });
    state.topics = [];
    // An existing candidate needs a version chained to its current one.
    expect(codes(state, payload)).toEqual([
      "FRONTIER_CANDIDATE_ALREADY_HAS_INITIAL_VERSION payload.frontier.candidateVersions[0].previousVersionId",
    ]);
    payload.frontier.candidateVersions[0]!.previousVersionId = uuid(6);
    expect(codes(state, payload)).toEqual([]);
    // A stale predecessor: another version already continues it.
    state.candidates[0]!.headVersionId = uuid(7);
    expect(codes(state, payload)).toEqual(["CANONICAL_UNIQUE_CONFLICT payload.frontier.candidateVersions[0].previousVersionId"]);
  });

  it("checks a source analysis's family, identifiers, version and initial analysis", () => {
    const analysis = prepareResearchContributionProposal(
      "SOURCE_ANALYSIS",
      structuredClone(CONTRIBUTION_EXAMPLES.SOURCE_ANALYSIS),
    ).payload as LivingEvidenceContribution;
    const source = analysis.source!;
    const state = emptyState();
    state.sourceFamilies.push(
      { familyId: source.familyId, sourceKind: "study", identityHash: source.identityHash, displayTitle: "Another title", identifiers: [] },
      { familyId: uuid(80), sourceKind: "study", identityHash: "a".repeat(64), displayTitle: "Other",
        identifiers: [...source.identifiers] },
    );
    state.sourceVersions.push({ versionId: source.versionId, familyId: source.familyId, sourceContentSha256: source.sourceContentSha256,
      accessStatus: "complete", retrievedAt: "2026-01-01T00:05:00.000001Z", retrievedAtMatches: false, sourceLocator: source.sourceLocator });
    state.analyses.push({ analysisId: analysis.analysis.analysisId, analysisKind: "study_method_audit", topicId: null,
      sourceFamilyId: source.familyId });
    expect(preflightContribution("SOURCE_ANALYSIS", analysis, state, sha).conflicts.map(({ code, path }) => `${code} ${path}`))
      .toEqual([
        "SOURCE_FAMILY_ID_CONFLICT payload.source.familyId",
        "SOURCE_IDENTIFIER_CONFLICT payload.source.identifiers[0]",
        "SOURCE_VERSION_ID_CONFLICT payload.source.versionId",
        "ANALYSIS_ALREADY_HAS_INITIAL_VERSION payload.analysis.analysisId",
      ]);
  });
});

describe("related canonical records, IDs only", () => {
  it("lists the canonical topic, question, frontier and candidates that share the frontier's identities", () => {
    const payload = sent();
    const state = canonicalState();
    state.identifierCandidates.push(
      { candidateId: uuid(5), frontierId: uuid(3), scheme: "doi", value: "10.1000/example" },
      { candidateId: uuid(90), frontierId: uuid(91), scheme: "doi", value: "10.1000/example" },
    );
    expect(relatedCanonicalRecords("RESEARCH_FRONTIER", payload, state)).toEqual({
      records: [
        { record: "topic", id: uuid(1), shared: "topic_key" },
        { record: "question", id: uuid(2), shared: "question_text_and_dimensions" },
        { record: "frontier_candidate", id: uuid(5), frontierId: uuid(3), shared: "identifier" },
        { record: "frontier_candidate", id: uuid(90), frontierId: uuid(91), shared: "identifier" },
      ],
      notShown: 0,
    });
  });

  it("reads the keys a proposal shares exactly as the review function does", () => {
    expect(proposalKeys(CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER)).toEqual([
      { kind: "topic_key", value: "example-topic" },
      { kind: "topic_id", value: "00000000-0000-4000-8000-000000000033" },
      { kind: "frontier_id", value: "00000000-0000-4000-8000-000000000035" },
      { kind: "question_id", value: "00000000-0000-4000-8000-000000000034" },
      { kind: "identifier", value: "doi:10.1000/example" },
    ]);
    expect(proposalKeys(CONTRIBUTION_EXAMPLES.SOURCE_ANALYSIS).map(({ kind }) => kind)).toEqual([
      "topic_key", "topic_id", "question_id", "source_family_id", "identifier",
    ]);
  });
});
