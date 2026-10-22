import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  checkResearchContributionProposal,
  CONTRIBUTION_EXAMPLES,
  CONTRIBUTION_PATTERN_DESCRIPTIONS,
  CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  CONTRIBUTION_PROBLEM_LIMITS,
  InMemoryResearchContributorAccessStore,
  livingEvidenceContributionSchema,
  prepareResearchContributionProposal,
  PROHIBITED_PERSISTENT_KEY_NAMES,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributionRejectedError,
  ResearchContributorAccessService,
  researchContributionContractKeys,
  researchFrontierContributionSchema,
  type ContributionProblem,
} from "../packages/evidence-repository/src/index.js";

// Owner question 127 (answer 127a, 2026-10-20; AskRigor-lessons#43): a rejected
// contribution names every problem with its path, what was expected and an
// example, and never repeats a value it was sent.

const SUBJECT = "auth0|synthetic-contribution-problems";
type Kind = "SOURCE_ANALYSIS" | "RESEARCH_FRONTIER";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const sourceAnalysis = (): Loose => structuredClone(CONTRIBUTION_EXAMPLES.SOURCE_ANALYSIS);
const frontier = (): Loose => structuredClone(CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER);
const boundary = () => ({ ...CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE });

async function fixture(mode: "free" | "paid" | "none" = "free") {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({
    store,
    identitySecret: new TextEncoder().encode("synthetic-contribution-problem-secret-with-32-bytes"),
    now: () => "2026-10-20T12:00:00.000Z",
  });
  if (mode === "free") {
    await service.acceptFreeContributor(SUBJECT, {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
  }
  if (mode === "paid") {
    store.grantPrivateEntitlement({
      entitlementId: "88888888-8888-4888-a888-888888888888",
      accountKey: service.accountKeyForSubject(SUBJECT),
      status: "ACTIVE",
      source: "OWNER_GRANTED",
      externalReferenceSha256: null,
      grantedAt: "2026-10-01T00:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
    });
    await service.activatePaidPrivate(SUBJECT);
  }
  return { store, service };
}

async function rejection(payload: unknown, proposalKind: unknown = "SOURCE_ANALYSIS", privacyBoundary: unknown = boundary()) {
  const { store, service } = await fixture();
  const error = await service.submitProposal(SUBJECT, { proposalKind, privacyBoundary, payload })
    .then(() => undefined, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(ResearchContributionRejectedError);
  expect(store.allProposals()).toHaveLength(0);
  return error as ResearchContributionRejectedError;
}

/** Everything a rejection carries, as a caller could show it. */
function everything(error: ResearchContributionRejectedError): string {
  return `${error.message}\n${JSON.stringify(error)}`;
}

function problemAt(error: ResearchContributionRejectedError, path: string, rule: string): ContributionProblem {
  const problem = error.problems.find((candidate) => candidate.path === path && candidate.rule === rule);
  expect(problem, `${path} (${rule}) in ${JSON.stringify(error.problems)}`).toBeDefined();
  return problem!;
}

describe("one rejection class at a time: path, expectation, example, and no value sent", () => {
  it("wrong type", async () => {
    const payload = sourceAnalysis();
    payload.analysis.coverageStatement = 987654321;
    const error = await rejection(payload);
    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.total).toBe(1);
    expect(problemAt(error, "payload.analysis.coverageStatement", "wrong_type")).toEqual({
      path: "payload.analysis.coverageStatement",
      rule: "wrong_type",
      expected: "text that is not empty, not a whole number",
      example: JSON.stringify("…"),
    });
    expect(everything(error)).not.toContain("987654321");
  });

  it("missing required field", async () => {
    const payload = sourceAnalysis();
    delete payload.schemaVersion;
    delete payload.analysis.coverageStatement;
    payload.analysis.sections[0].content = "SENTINEL-SECTION-CONTENT";
    const error = await rejection(payload);
    expect(error.total).toBe(2);
    expect(problemAt(error, "payload.schemaVersion", "missing")).toMatchObject({
      expected: "exactly 1",
      example: "1",
    });
    expect(problemAt(error, "payload.analysis.coverageStatement", "missing")).toMatchObject({
      expected: "text that is not empty",
      example: JSON.stringify("…"),
    });
    expect(everything(error)).not.toContain("SENTINEL-SECTION-CONTENT");
  });

  it("unknown key, never naming it", async () => {
    const payload = sourceAnalysis();
    payload.interpretationFindings = [{ claim: "SENTINEL-FINDING-CLAIM" }];
    const error = await rejection(payload);
    const problem = problemAt(error, "payload", "unknown_keys");
    expect(problem.expected).toBe("only the keys schemaVersion, idempotencyKey, run, topic, source, analysis, " +
      "receipts, knowledge; 1 other key here is not in the contract (remove or rename it)");
    expect(JSON.parse(problem.example.replaceAll("{…}", "{}").replaceAll("[…]", "[]"))).toMatchObject({
      schemaVersion: 1,
      idempotencyKey: "source-analysis-example-1",
    });
    expect(everything(error)).not.toMatch(/interpretationFindings|SENTINEL-FINDING-CLAIM/u);
  });

  it("enum value, with the narrower set a shared source analysis accepts", async () => {
    const payload = sourceAnalysis();
    payload.analysis.relationship = "SENTINEL_RELATION";
    payload.analysis.analysisKind = "SENTINEL_KIND";
    const error = await rejection(payload);
    expect(problemAt(error, "payload.analysis.relationship", "not_allowed")).toMatchObject({
      expected: "one of initial, clarifies, corrects, supersedes, invalidates",
      example: JSON.stringify("initial"),
    });
    expect(problemAt(error, "payload.analysis.analysisKind", "not_allowed")).toMatchObject({
      expected: "one of study_method_audit, review_method_audit",
      example: JSON.stringify("study_method_audit"),
    });
    expect(everything(error)).not.toMatch(/SENTINEL_RELATION|SENTINEL_KIND/u);
  });

  it("too long", async () => {
    const payload = sourceAnalysis();
    payload.topic.label = `SENTINEL-LONG-LABEL-${"x".repeat(500)}`;
    const error = await rejection(payload);
    expect(problemAt(error, "payload.topic.label", "too_long")).toMatchObject({
      expected: "text of 1 to 500 characters",
      example: JSON.stringify("…"),
    });
    expect(everything(error)).not.toMatch(/SENTINEL-LONG-LABEL|x{20}/u);
  });

  it("prohibited key, even under the free names of receipts[].details", async () => {
    const payload = sourceAnalysis();
    payload.receipts[0].details = { Raw_Chat: "SENTINEL-CHAT-TEXT" };
    const error = await rejection(payload);
    expect(error.code).toBe("CONTRIBUTION_PRIVACY_REJECTED");
    expect(error.total).toBe(1);
    const problem = problemAt(error, "payload.receipts[0].details.*", "prohibited_key");
    expect(problem.expected).toContain("ignoring case, spaces and punctuation, AskRigor never stores a key named");
    expect(problem.expected).toContain("rawchat");
    expect(problem.expected).toMatch(/Remove this key and its value$/u);
    expect(problem.example).toBe(JSON.stringify("…"));
    expect(everything(error)).not.toMatch(/Raw_Chat|SENTINEL-CHAT-TEXT/u);
  });

  it("contact pattern in a free name under receipts[].details, never naming it", async () => {
    const payload = sourceAnalysis();
    payload.receipts[0].details = { "sentinel.person@example.com": "count 3" };
    const { store, service } = await fixture();
    const error = await service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS", privacyBoundary: boundary(), payload,
    }).then(() => undefined, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResearchContributionRejectedError);
    const rejected = error as ResearchContributionRejectedError;
    expect(rejected.code).toBe("CONTRIBUTION_PRIVACY_REJECTED");
    expect(problemAt(rejected, "payload.receipts[0].details.*", "contact_pattern")).toEqual({
      path: "payload.receipts[0].details.*",
      rule: "contact_pattern",
      expected: "a deidentified name: this name matches an email address. Contact details, street addresses and " +
        "credentials are never stored; rename it",
      example: JSON.stringify("…"),
    });
    expect(everything(rejected)).not.toContain("sentinel.person@example.com");
    expect(store.allProposals()).toHaveLength(0);
  });

  it.each([
    ["an email address", "Write to sentinel.person@example.com about it", "sentinel.person@example.com"],
    ["a phone number", "Call +1 (555) 010-9999 tomorrow", "010-9999"],
    ["a credential or access token", "Use Bearer sentinelTOKENabcdefghijkl", "sentinelTOKEN"],
    ["a street address", "Lives at 42 Sentinel Example Street", "Sentinel Example"],
  ])("contact pattern: %s", async (kind, text, sentinel) => {
    const payload = sourceAnalysis();
    payload.analysis.coverageStatement = text;
    const error = await rejection(payload);
    expect(error.code).toBe("CONTRIBUTION_PRIVACY_REJECTED");
    expect(problemAt(error, "payload.analysis.coverageStatement", "contact_pattern")).toEqual({
      path: "payload.analysis.coverageStatement",
      rule: "contact_pattern",
      expected: `deidentified text: this text matches ${kind}. Contact details, street addresses and credentials ` +
        "are never stored; remove it",
      example: JSON.stringify("…"),
    });
    expect(everything(error)).not.toContain(sentinel);
  });

  it.each(["SOURCE_ANALYSIS", "RESEARCH_FRONTIER"] as const)("sandbox locator in %s", async (kind) => {
    const payload = kind === "SOURCE_ANALYSIS" ? sourceAnalysis() : frontier();
    const identifiers = kind === "SOURCE_ANALYSIS"
      ? payload.source.identifiers
      : payload.frontier.candidateVersions[0].identifiers;
    identifiers.push({ scheme: "url", value: "  SANDBOX:/mnt/data/SENTINEL-FILE.json" });
    const error = await rejection(payload, kind);
    expect(error.code).toBe("CONTRIBUTION_PRIVACY_REJECTED");
    expect(error.total).toBe(1);
    expect(error.problems[0]).toEqual({
      path: kind === "SOURCE_ANALYSIS"
        ? "payload.source.identifiers[1].value"
        : "payload.frontier.candidateVersions[0].identifiers[1].value",
      rule: "sandbox_locator",
      expected: "a public identifier or link that opens outside this session, such as a DOI, a PMID or an https " +
        "link: a sandbox: link points into another session and can never be opened",
      example: JSON.stringify("10.1000/example"),
    });
    expect(everything(error)).not.toMatch(/SENTINEL-FILE|mnt\/data/u);
  });
});

describe("the intake's other rules, reported the same way", () => {
  it("YouTube, Reddit and forum links and community providers", async () => {
    const analysis = sourceAnalysis();
    analysis.source.identifiers.push({ scheme: "url", value: "https://www.youtube.com/watch?v=SENTINELVID" });
    const sourceError = await rejection(analysis);
    expect(problemAt(sourceError, "payload.source.identifiers[1].value", "community_source").expected)
      .toBe("a formal source's identifier: YouTube, Reddit and forum links are outside the shared proposal boundary");

    const lanes = frontier();
    lanes.frontier.lanes[0].provider = "SentinelReddit";
    lanes.frontier.candidateVersions[0].identifiers.push({ scheme: "url", value: "https://example.org/forum/SENTINEL" });
    const frontierError = await rejection(lanes, "RESEARCH_FRONTIER");
    expect(frontierError.total).toBe(2);
    expect(problemAt(frontierError, "payload.frontier.lanes[0].provider", "community_source").expected)
      .toBe("a formal source's provider: community and video providers are outside the durable frontier boundary");
    problemAt(frontierError, "payload.frontier.candidateVersions[0].identifiers[1].value", "community_source");
    for (const error of [sourceError, frontierError]) {
      expect(error.code).toBe("CONTRIBUTION_PRIVACY_REJECTED");
      expect(everything(error)).not.toMatch(/SENTINEL|youtube\.com|example\.org/u);
    }
  });

  it("a shared source analysis is a source-bound study or review audit", async () => {
    const topicOnly = sourceAnalysis();
    topicOnly.source = null;
    topicOnly.analysis.analysisKind = "topic_synthesis";
    const error = await rejection(topicOnly);
    expect(error.code).toBe("CONTRIBUTION_PRIVACY_REJECTED");
    expect(problemAt(error, "payload.source", "source_bound").expected)
      .toBe("the analysed study or review: a shared source analysis is bound to its source, so source cannot be null");
    expect(problemAt(error, "payload.analysis.analysisKind", "source_bound").example).toBe(JSON.stringify("study_method_audit"));

    const guideline = sourceAnalysis();
    guideline.source.sourceKind = "guideline";
    expect(problemAt(await rejection(guideline), "payload.source.sourceKind", "source_bound").expected)
      .toBe("one of study, review: a shared source analysis is bound to a study or a review");
  });

  it("declared hashes that do not match, without the hash they should have been", async () => {
    const analysis = sourceAnalysis();
    analysis.analysis.declaredWholeTextSha256 = "a".repeat(64);
    const analysisError = await rejection(analysis);
    expect(analysisError.problems).toEqual([{
      path: "payload.analysis.declaredWholeTextSha256",
      rule: "hash_mismatch",
      expected: "null, or the SHA-256 (64 lowercase hexadecimal characters) of the sections' content joined in " +
        "order; the hash sent does not match the sections sent",
      example: "null",
    }]);

    const search = frontier();
    search.frontier.passes[0].declaredQuerySha256 = "b".repeat(64);
    const frontierError = await rejection(search, "RESEARCH_FRONTIER");
    expect(problemAt(frontierError, "payload.frontier.passes[0].declaredQuerySha256", "hash_mismatch").expected)
      .toContain("of this pass's deidentifiedQuery, with surrounding spaces removed");
  });

  it("rules between fields, once the fields are valid", async () => {
    const payload = sourceAnalysis();
    payload.analysis.relationship = "corrects";
    const error = await rejection(payload);
    expect(error.crossFieldRulesPending).toBe(false);
    expect(error.problems).toEqual([expect.objectContaining({
      path: "payload.analysis.previousVersionId",
      rule: "cross_field",
      expected: "only an initial version may omit its previous version",
    })]);

    const both = sourceAnalysis();
    both.analysis.relationship = "corrects";
    both.analysis.coverageStatement = 3;
    const pending = await rejection(both);
    expect(pending.crossFieldRulesPending).toBe(true);
    expect(pending.problems.map(({ rule }) => rule)).toEqual(["wrong_type"]);
  });

  it("the other record kind, and a proposalKind that names none", async () => {
    const swapped = await rejection(frontier(), "SOURCE_ANALYSIS");
    expect(swapped.payloadCheck).toBe("kind_mismatch");
    expect(swapped.problems).toEqual([expect.objectContaining({
      path: "proposalKind",
      rule: "kind_mismatch",
      expected: "RESEARCH_FRONTIER: payload is a RESEARCH_FRONTIER record, so proposalKind names it, or payload is a " +
        "SOURCE_ANALYSIS record",
    })]);
    const link = await rejection(structuredClone(CONTRIBUTION_EXAMPLES.TOPIC_LINK), "RESEARCH_FRONTIER");
    expect(link.problems).toEqual([expect.objectContaining({
      path: "proposalKind",
      rule: "kind_mismatch",
      expected: "TOPIC_LINK: payload is a TOPIC_LINK record, so proposalKind names it, or payload is a " +
        "RESEARCH_FRONTIER record",
    })]);

    const payload = sourceAnalysis();
    payload.analysis.coverageStatement = "Mail sentinel@example.com";
    const unnamed = await rejection(payload, "SENTINEL_PROPOSAL");
    expect(unnamed.payloadCheck).toBe("kind_invalid");
    expect(problemAt(unnamed, "proposalKind", "not_allowed")).toMatchObject({
      expected: "one of RESEARCH_FRONTIER, SOURCE_ANALYSIS, TOPIC_LINK",
      example: JSON.stringify("RESEARCH_FRONTIER"),
    });
    // Privacy rules read payload whatever its kind.
    problemAt(unnamed, "payload.analysis.coverageStatement", "contact_pattern");
    expect(everything(unnamed)).not.toMatch(/SENTINEL_PROPOSAL|sentinel@example\.com/u);
  });

  it("privacy markers, and a call that is not an object", async () => {
    const error = await rejection(sourceAnalysis(), "SOURCE_ANALYSIS",
      { ...boundary(), rawChatPersisted: true, sentinelMarker: false });
    expect(problemAt(error, "privacyBoundary.rawChatPersisted", "not_allowed")).toMatchObject({
      expected: "exactly false",
      example: "false",
    });
    expect(problemAt(error, "privacyBoundary", "unknown_keys").expected).toContain("1 other key here is not in the contract");
    expect(everything(error)).not.toContain("sentinelMarker");

    const notObject = checkResearchContributionProposal("SENTINEL-TEXT");
    expect(notObject.problems).toEqual([expect.objectContaining({ path: "input", rule: "wrong_type" })]);
    expect(notObject.problems[0]!.expected).toBe("an object with proposalKind, privacyBoundary, payload, supersedesProposalId, userConsent, finalizationReceipt, not text");
    expect(JSON.stringify(notObject)).not.toContain("SENTINEL-TEXT");
  });

  it("shows no key from the call that the contract does not define", async () => {
    const payload = sourceAnalysis();
    payload.receipts[0].details = { "sentinel.key@example.com": ["SENTINEL-LIST"] };
    payload.sentinelExtra = { sentinelInner: "Email sentinel.inner@example.com" };
    const error = await rejection(payload);
    expect(problemAt(error, "payload.receipts[0].details.*", "wrong_type").expected)
      .toBe("text, or a number, or true or false, or null, not a list");
    problemAt(error, "payload.*.*", "contact_pattern");
    expect(everything(error)).not.toMatch(/sentinel/iu);
    for (const { path } of error.problems) {
      for (const part of path.split(/[.[\]]/u).filter((piece) => piece !== "" && !/^\d+$/u.test(piece))) {
        expect(part === "*" || part === "input" || researchContributionContractKeys().has(part), part).toBe(true);
      }
    }
  });
});

describe("bounded and in a fixed order", () => {
  it("shows at most 25 problems, each part capped, and counts the rest", async () => {
    const payload = sourceAnalysis();
    payload.analysis.sections = Array.from({ length: 60 }, (_, ordinal) => ({
      ordinal,
      sectionKey: `SENTINEL KEY ${ordinal}`,
      title: "…",
      content: "…",
    }));
    const error = await rejection(payload);
    expect(error.total).toBe(60);
    expect(error.problems).toHaveLength(CONTRIBUTION_PROBLEM_LIMITS.shown);
    expect(error.problems.map(({ path }) => path).slice(0, 3)).toEqual([
      "payload.analysis.sections[0].sectionKey",
      "payload.analysis.sections[1].sectionKey",
      "payload.analysis.sections[2].sectionKey",
    ]);
    let characters = 0;
    for (const problem of error.problems) {
      expect(problem.path.length).toBeLessThanOrEqual(CONTRIBUTION_PROBLEM_LIMITS.pathCharacters);
      expect(problem.expected.length).toBeLessThanOrEqual(CONTRIBUTION_PROBLEM_LIMITS.expectedCharacters);
      expect(problem.example.length).toBeLessThanOrEqual(CONTRIBUTION_PROBLEM_LIMITS.exampleCharacters);
      characters += problem.path.length + problem.expected.length + problem.example.length;
    }
    expect(characters).toBeLessThanOrEqual(CONTRIBUTION_PROBLEM_LIMITS.totalCharacters);
    expect(everything(error)).not.toContain("SENTINEL");
  });

  it("puts privacy problems first, then paths in order, whatever order the keys came in", () => {
    const forward = sourceAnalysis();
    forward.analysis.title = "extra";
    forward.run.provenanceNote = 5;
    forward.source.identifiers.push({ scheme: "other", value: "sandbox:x" });
    const reversed = Object.fromEntries(Object.entries(structuredClone(forward)).reverse());
    reversed.analysis = Object.fromEntries(Object.entries(reversed.analysis as object).reverse());
    const input = (payload: unknown) => ({ payload, privacyBoundary: boundary(), proposalKind: "SOURCE_ANALYSIS" });
    const first = checkResearchContributionProposal(input(forward));
    expect(first.problems.map(({ path, rule }) => `${path} ${rule}`)).toEqual([
      "payload.source.identifiers[1].value sandbox_locator",
      "payload.analysis unknown_keys",
      "payload.run.provenanceNote wrong_type",
    ]);
    expect(checkResearchContributionProposal(input(reversed))).toEqual(first);
  });
});

describe("refusals by account come before the record", () => {
  it.each(["paid", "none"] as const)("a %s account is refused for its mode, not told how to repair the record", async (mode) => {
    const { store, service } = await fixture(mode);
    const error = await service.submitProposal(SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: boundary(),
      payload: { sentinel: "SENTINEL" },
    }).then(() => undefined, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResearchAccessError);
    expect(error).not.toBeInstanceOf(ResearchContributionRejectedError);
    expect((error as ResearchAccessError).code)
      .toBe(mode === "paid" ? "PAID_PRIVATE_DOES_NOT_CONTRIBUTE" : "RESEARCH_ACCESS_REQUIRED");
    expect(store.allProposals()).toHaveLength(0);
  });
});

type JsonNode = {
  type?: string;
  properties?: Record<string, JsonNode>;
  items?: JsonNode;
  anyOf?: JsonNode[];
  additionalProperties?: boolean | JsonNode;
  pattern?: string;
  format?: string;
};
const KIND_SCHEMAS = { SOURCE_ANALYSIS: livingEvidenceContributionSchema, RESEARCH_FRONTIER: researchFrontierContributionSchema };
const json = (kind: Kind) => z.toJSONSchema(KIND_SCHEMAS[kind], { target: "draft-7", io: "input" }) as JsonNode;

describe("the example records the problems draw on", () => {
  it.each(["SOURCE_ANALYSIS", "RESEARCH_FRONTIER"] as const)("%s passes the whole intake and is filed", async (kind) => {
    const example = CONTRIBUTION_EXAMPLES[kind];
    expect(KIND_SCHEMAS[kind].safeParse(example).success).toBe(true);
    expect(() => prepareResearchContributionProposal(kind, example)).not.toThrow();
    const input = { proposalKind: kind, privacyBoundary: boundary(), payload: example };
    expect(checkResearchContributionProposal(input)).toMatchObject({ problems: [], total: 0, payloadCheck: "checked" });
    const { store, service } = await fixture();
    await expect(service.submitProposal(SUBJECT, input)).resolves.toMatchObject({ status: "inserted" });
    expect(store.allProposals()).toHaveLength(1);
  });

  it.each(["SOURCE_ANALYSIS", "RESEARCH_FRONTIER"] as const)("%s has an example at every path of the contract", (kind) => {
    const missing: string[] = [];
    const walk = (schema: JsonNode, example: unknown, path: string): void => {
      const branches = schema.anyOf?.filter(({ type }) => type !== "null");
      const node = branches?.length === 1 ? branches[0]! : schema;
      if (node.properties !== undefined) {
        if (example === null || typeof example !== "object") {
          missing.push(path);
          return;
        }
        for (const [key, child] of Object.entries(node.properties)) {
          if (!Object.hasOwn(example, key)) missing.push(`${path}.${key}`);
          else walk(child, (example as Record<string, unknown>)[key], `${path}.${key}`);
        }
      } else if (node.type === "array") {
        if (!Array.isArray(example) || example.length === 0) missing.push(`${path}[]`);
        else walk(node.items!, example[0], `${path}[]`);
      } else if (typeof node.additionalProperties === "object") {
        if (example === null || typeof example !== "object" || Object.keys(example).length === 0) missing.push(path);
      }
    };
    walk(json(kind), CONTRIBUTION_EXAMPLES[kind], "payload");
    expect(missing).toEqual([]);
  });

  it("defines no contract key that is also a prohibited name, so a prohibited key is never shown by name", () => {
    const normalized = (key: string) => key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/gu, "");
    const prohibited = new Set(PROHIBITED_PERSISTENT_KEY_NAMES);
    expect([...researchContributionContractKeys()].filter((key) => prohibited.has(normalized(key)))).toEqual([]);
    expect(Object.isFrozen((CONTRIBUTION_EXAMPLES.SOURCE_ANALYSIS.analysis as { sections: object[] }).sections[0])).toBe(true);
  });

  it("describes every pattern of the contract in words", () => {
    const patterns = new Set<string>();
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const schema = node as JsonNode;
      if (typeof schema.pattern === "string" && schema.format !== "uuid" && schema.format !== "date-time") {
        patterns.add(schema.pattern);
      }
      Object.values(node).forEach(walk);
    };
    walk(json("SOURCE_ANALYSIS"));
    walk(json("RESEARCH_FRONTIER"));
    expect([...patterns].filter((pattern) => !CONTRIBUTION_PATTERN_DESCRIPTIONS.has(pattern))).toEqual([]);
    expect(patterns.size).toBeGreaterThan(0);
  });
});
