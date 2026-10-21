import { describe, expect, it } from "vitest";

import {
  CONTRIBUTION_EXAMPLES,
  CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  InMemoryResearchContributionReviewStore,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributionRejectedError,
  ResearchContributionReviewService,
  ResearchContributorAccessService,
  canonicalIdentityRequest,
  preflightContribution,
  prepareResearchContributionProposal,
  proposalKeys,
  relatedCanonicalRecords,
  topicLinkFindings,
  type CanonicalIdentityReader,
  type CanonicalIdentityState,
  type ResearchContributionProposalRecord,
  type TopicLinkContribution,
  type TopicLinkState,
} from "../packages/evidence-repository/src/index.js";
import { createResearchContributionReviewHandler } from
  "../apps/research-mcp/src/research-contribution-review-tool.js";

// Owner answer 138b (2026-10-20): "merging by meaning (the AI may declare two differently worded topics the same,
// linked on your acceptance, nothing moved or deleted)". The meaning is the model's declaration and the owner's
// judgment; these tests cover only what is exact: the topics, the stored links, the alias and the link's UUID.

const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const FROM = "00000000-0000-4000-8000-000000000053";
const TO = "00000000-0000-4000-8000-000000000054";
const SUBJECT = "auth0|synthetic-topic-link-user";
const OWNER = "auth0|synthetic-owner-reviewer";

function link(relation: TopicLinkContribution["relation"] = "same"): TopicLinkContribution {
  const payload = structuredClone(CONTRIBUTION_EXAMPLES.TOPIC_LINK) as Record<string, unknown>;
  payload.relation = relation;
  return prepareResearchContributionProposal("TOPIC_LINK", payload).payload as TopicLinkContribution;
}

function noLinks(): TopicLinkState {
  return {
    links: [], parentEdges: [], relatedEdges: 0, fromIsAncestorOfTo: false, toIsAncestorOfFrom: false, aliases: [],
    linkIdTaken: false,
  };
}

/** Both example topics are canonical, with different labels, and nothing links them yet. */
function canonicalState(topicLink: Partial<TopicLinkState> = {}): CanonicalIdentityState {
  return {
    idempotency: null, manifests: [], run: null,
    topics: [
      { topicId: FROM, canonicalKey: "example-topic", label: "Example topic" },
      { topicId: TO, canonicalKey: "example-topic-other-wording", label: "Example topic, other wording" },
    ],
    questions: [], frontiers: [], lanes: [], contributionIds: [], passIds: [], candidates: [], candidateVersions: [],
    trails: [], trailVersions: [], identifierCandidates: [], sourceFamilies: [], sourceVersions: [],
    freshnessPolicies: [], analyses: [], analysisVersionIds: [], claims: [],
    topicLink: { ...noLinks(), ...topicLink }, receiptVersions: [],
  };
}

const findings = (payload: TopicLinkContribution, state: CanonicalIdentityState) =>
  topicLinkFindings(payload, state).map(({ code, path }) => `${code} ${path.join(".")}`);

describe("a topic link meets exact checks only", () => {
  it("is clear between two canonical topics nothing links yet, for each relation", () => {
    for (const relation of ["same", "narrower", "broader", "related"] as const) {
      expect(findings(link(relation), canonicalState()), relation).toEqual([]);
    }
  });

  it("names a topic that is not canonical, or is named with another key, at its own field", () => {
    const state = canonicalState();
    state.topics = [{ topicId: FROM, canonicalKey: "another-key", label: "Example topic" }];
    expect(findings(link(), state)).toEqual([
      "TOPIC_LINK_TOPIC_MISSING payload.fromTopic",
      "TOPIC_LINK_TOPIC_MISSING payload.toTopic",
    ]);
    expect(topicLinkFindings(link(), state)[0]).toMatchObject({ rule: "canonical_missing" });
  });

  it("refuses a link the stored links contradict or repeat", () => {
    const same = { links: [{ linkId: uuid(1), fromTopicId: TO, toTopicId: FROM, relation: "same" }] };
    const toIsParent = { parentEdges: [{ parentTopicId: TO, childTopicId: FROM }] };
    expect(findings(link("same"), canonicalState(same))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    expect(findings(link("narrower"), canonicalState(same))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    expect(findings(link("same"), canonicalState(toIsParent))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    expect(findings(link("same"), canonicalState({ toIsAncestorOfFrom: true }))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    // fromTopic narrower than toTopic is the stored hierarchy again; broader would make a cycle.
    expect(findings(link("narrower"), canonicalState(toIsParent))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    expect(findings(link("broader"), canonicalState(toIsParent))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    expect(findings(link("broader"), canonicalState({ toIsAncestorOfFrom: true }))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    expect(findings(link("narrower"), canonicalState({ toIsAncestorOfFrom: true }))).toEqual([]);
    expect(findings(link("related"), canonicalState({ relatedEdges: 1 }))).toEqual(["TOPIC_LINK_CONFLICT payload.relation"]);
    expect(findings(link("related"), canonicalState(toIsParent))).toEqual([]);
  });

  it("refuses an alias another topic already holds, and a UUID already in use", () => {
    const aliased = canonicalState({ aliases: [{ topicId: uuid(9), alias: "Example topic" }] });
    expect(findings(link("same"), aliased)).toEqual(["TOPIC_ALIAS_CONFLICT payload.relation"]);
    // The alias each topic already has is no conflict, and a hierarchy link writes no alias.
    expect(findings(link("same"), canonicalState({ aliases: [{ topicId: TO, alias: "Example topic" }] }))).toEqual([]);
    expect(findings(link("broader"), aliased)).toEqual([]);
    expect(findings(link("related"), canonicalState({ linkIdTaken: true }))).toEqual(["TOPIC_LINK_ID_CONFLICT payload.linkId"]);
  });

  it("asks the reader for both topics and the link between them, and the preflight names the writer's codes", () => {
    const payload = link();
    expect(canonicalIdentityRequest("TOPIC_LINK", payload)).toMatchObject({
      kind: "TOPIC_LINK",
      topicIds: [FROM, TO],
      topicKeys: ["example-topic", "example-topic-other-wording"],
      topicLink: { linkId: payload.linkId, fromTopicId: FROM, toTopicId: TO },
      questionIds: [],
      sourceFamilyIds: [],
    });
    const sha = prepareResearchContributionProposal("TOPIC_LINK", payload).payloadSha256;
    expect(preflightContribution("TOPIC_LINK", payload, canonicalState(), sha)).toEqual({ status: "clear", conflicts: [] });
    const replay = { ...canonicalState(), idempotency: { recordId: payload.linkId, payloadSha256: sha } };
    expect(preflightContribution("TOPIC_LINK", payload, replay, sha).status).toBe("replay");
    const other = { ...canonicalState({ relatedEdges: 1 }), idempotency: { recordId: uuid(2), payloadSha256: "e".repeat(64) } };
    expect(preflightContribution("TOPIC_LINK", link("related"), other, sha).conflicts).toEqual([
      { code: "TOPIC_LINK_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH", path: "payload.idempotencyKey" },
      { code: "TOPIC_LINK_CONFLICT", path: "payload.relation" },
    ]);
  });

  it("shares both topics' keys with related proposals and canonical records, IDs only", () => {
    expect(proposalKeys(CONTRIBUTION_EXAMPLES.TOPIC_LINK)).toEqual([
      { kind: "topic_key", value: "example-topic" },
      { kind: "topic_id", value: FROM },
      { kind: "topic_key", value: "example-topic-other-wording" },
      { kind: "topic_id", value: TO },
    ]);
    expect(relatedCanonicalRecords("TOPIC_LINK", link(), canonicalState())).toEqual({
      records: [
        { record: "topic", id: FROM, shared: "topic_key" },
        { record: "topic", id: TO, shared: "topic_key" },
      ],
      notShown: 0,
    });
  });
});

describe("submission checks a topic link against the canonical store before it is stored", () => {
  async function service() {
    const store = new InMemoryResearchContributorAccessStore();
    const access = new ResearchContributorAccessService({
      store,
      identitySecret: new TextEncoder().encode("synthetic-topic-link-identity-secret-of-32-bytes"),
      now: () => "2026-10-21T02:00:00.000Z",
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
  const input = (change: (payload: Record<string, any>) => void = () => undefined) => {
    const payload = structuredClone(CONTRIBUTION_EXAMPLES.TOPIC_LINK) as Record<string, any>;
    change(payload);
    return { proposalKind: "TOPIC_LINK", privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE, payload };
  };
  const reader = (state = canonicalState()): CanonicalIdentityReader => ({ readCanonicalIdentity: async () => state });
  const refused = async (call: Promise<unknown>) => {
    const error = await call.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResearchContributionRejectedError);
    return (error as ResearchContributionRejectedError).problems;
  };

  it("files a link between two canonical topics, checked", async () => {
    const { store, access } = await service();
    const result = await access.submitProposal(SUBJECT, input(), { canonical: reader() });
    expect(result).toMatchObject({ status: "inserted", canonicalCheck: "checked", reconciled: [] });
    expect(store.allProposals()).toMatchObject([{ proposalKind: "TOPIC_LINK", partial: false, status: "PENDING_REVIEW" }]);
  });

  it("refuses a missing topic, a self link and a relation outside the four, each at its field, and stores nothing", async () => {
    const { store, access } = await service();
    expect(await refused(access.submitProposal(SUBJECT, input(), {
      canonical: reader({ ...canonicalState(), topics: canonicalState().topics.slice(1) }),
    }))).toEqual([{
      path: "payload.fromTopic",
      rule: "canonical_missing",
      expected: "the topicId and canonicalKey of one canonical topic, as search_research_frontiers or " +
        "get_research_frontier returns them: no canonical topic has this ID with this key",
      example: JSON.stringify({ topicId: FROM, canonicalKey: "example-topic" }),
    }]);
    // These are refused by the intake's own rules, before the canonical store is read.
    const unread: CanonicalIdentityReader = { readCanonicalIdentity: async () => { throw new Error("not read"); } };
    expect((await refused(access.submitProposal(SUBJECT, input((payload) => { payload.toTopic = payload.fromTopic; }), {
      canonical: unread,
    }))).map(({ path, rule, expected }) => ({ path, rule, expected }))).toEqual([{
      path: "payload.toTopic", rule: "cross_field", expected: "a topic link joins two different canonical topics",
    }]);
    expect((await refused(access.submitProposal(SUBJECT, input((payload) => { payload.relation = "equivalent"; }), {
      canonical: unread,
    }))).map(({ path, rule }) => `${path} ${rule}`)).toEqual(["payload.relation not_allowed"]);
    expect(store.allProposals()).toHaveLength(0);
  });

  it("refuses a link the stored links contradict", async () => {
    const { access } = await service();
    const problems = await refused(access.submitProposal(SUBJECT, input(), {
      canonical: reader(canonicalState({ parentEdges: [{ parentTopicId: TO, childTopicId: FROM }] })),
    }));
    expect(problems.map(({ path, rule }) => `${path} ${rule}`)).toEqual(["payload.relation canonical_conflict"]);
  });

  it("is not filed when the canonical store cannot be read, unlike a frontier", async () => {
    const { store, access } = await service();
    for (const canonical of [undefined, { readCanonicalIdentity: async () => { throw new Error("reader down"); } }]) {
      const error = await access.submitProposal(SUBJECT, input(), { canonical }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ResearchAccessError);
      expect((error as ResearchAccessError).code).toBe("RESEARCH_ACCESS_SERVICE_UNAVAILABLE");
    }
    expect(store.allProposals()).toHaveLength(0);
  });
});

describe("the owner reviews a topic link with the topics it names", () => {
  function proposal(kind: "TOPIC_LINK" | "RESEARCH_FRONTIER", id: string, createdAt: string): ResearchContributionProposalRecord {
    const prepared = prepareResearchContributionProposal(kind, structuredClone(CONTRIBUTION_EXAMPLES[kind]));
    return {
      proposalId: id, accountKey: "8".repeat(64), proposalKind: kind, payloadSha256: prepared.payloadSha256,
      payload: prepared.payload, privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE, partial: prepared.partial,
      status: "PENDING_REVIEW", createdAt, reviewedAt: null, reviewReason: null,
    };
  }

  it("shows the topics, the frontier proposal filed under one of them, a clear preflight and whose judgment it is", async () => {
    const store = new InMemoryResearchContributionReviewStore([
      proposal("TOPIC_LINK", uuid(10), "2026-10-21T02:00:00.000Z"),
      proposal("RESEARCH_FRONTIER", uuid(11), "2026-10-21T02:01:00.000Z"),
    ]);
    const service = new ResearchContributionReviewService(store, { now: () => "2026-10-21T03:00:00.000Z" });
    const handler = createResearchContributionReviewHandler({
      service,
      allowedReviewerSubjects: new Set([OWNER]),
      canonical: { readCanonicalIdentity: async () => canonicalState() },
    });
    const result = await handler({ action: "inspect", proposalId: uuid(10) }, {
      authInfo: {
        token: "synthetic-token", clientId: "synthetic-client", scopes: ["cases:review"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: OWNER },
      },
    });
    expect(result.structuredContent).toMatchObject({
      outcome: "pending_review",
      proposal: {
        proposalKind: "TOPIC_LINK",
        related: {
          proposals: [{ proposalId: uuid(11), proposalKind: "RESEARCH_FRONTIER", status: "PENDING_REVIEW", shared: ["topic_key"] }],
          canonical: { records: [{ record: "topic", id: FROM }, { record: "topic", id: TO }], notShown: 0 },
        },
        preflight: { status: "clear", conflicts: [] },
      },
    });
    const text = JSON.stringify(result.content);
    expect(text).toContain("It declares topic example-topic the same as topic example-topic-other-wording; whether " +
      "that is so is your judgment. Accepting it writes each topic's label as the other's alias and moves, changes or " +
      "deletes nothing filed under either topic.");
    expect(JSON.stringify(result)).not.toContain("8".repeat(64));
  });
});
