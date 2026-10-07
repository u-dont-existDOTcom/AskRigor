import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "../packages/evidence-repository/src/index.js";

import { askrigorBuildCommitFromEnv } from "../apps/research-mcp/src/config.js";
import {
  FINDINGS_SAVE_OFFER,
  findingsCardDigest,
  findingsCardSchema,
  withoutYouTubeData,
} from "../apps/research-mcp/src/findings/card.js";
import {
  saveResearchFindingsInputSchema,
  type FindingsSaveResult,
} from "../apps/research-mcp/src/findings/contracts.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import {
  DEFAULT_FINDINGS_REPOSITORY,
  findingsRepositoryFromEnv,
  saveResearchFindings,
} from "../apps/research-mcp/src/findings/runtime.js";
import {
  FindingsSaveService,
  findingsThreadKey,
  type FindingsRecord,
  type FindingsSaveContext,
} from "../apps/research-mcp/src/findings/service.js";
import type { LessonAttemptLimiter } from "../apps/research-mcp/src/lessons/rate-limit.js";
import { RESEARCH_OPERATIONS, registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { CARD, parsedCard } from "./helpers/findings-fixtures.js";

const SECRET = "findings-library-test-secret-0123456789";
const NOW = new Date("2026-09-30T12:00:00.000Z");
const CONTEXT: FindingsSaveContext = { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) };
// Two free contributors' pseudonymous account keys.
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);
const TARGET_DIGEST = "0123456789ab";
const PROTOCOLS = [
  { name: "HRP", version: "20.6.8", sha256: "a".repeat(64) },
  { name: "Universal Instructions", version: "20.5.33", sha256: "b".repeat(64) },
];

const finalization = (claims: Record<string, string | number> = {}, now = NOW) => issueResearchReceipt("finalization", {
  status: "ready_with_limits",
  community: "researched",
  receipts: 7,
  videos: 1,
  depth: "first_pass",
  target: TARGET_DIGEST,
  coverage: "none",
  open_leads: 4,
  validated: 1,
  leads: 0,
  limits: 2,
  unverified: 1,
  findings: findingsCardDigest(parsedCard()),
  ...claims,
}, { secret: SECRET, now: () => now });

const saveInput = (overrides: Record<string, unknown> = {}) => ({
  findings_card: CARD,
  finalization_receipt: finalization(),
  contributor: ALICE,
  reported_model: "Example Model 2026-08-06",
  ...overrides,
});

/** Another card on the same question, as a corrected answer would give it, with its own receipt. */
const corrected = (claims: Record<string, string | number> = {}) => {
  const card = {
    ...CARD,
    findings: [{ ...CARD.findings[0], claim: "Supervised exercise helped only people who kept it up for months." }],
  };
  return { findings_card: card, finalization_receipt: finalization({ findings: findingsCardDigest(findingsCardSchema.parse(card)), ...claims }) };
};

interface Issue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  state_reason?: string;
  labels: Array<{ name: string }>;
}

/** GitHub's issue API for the findings repository, in memory. */
class FakeGitHub {
  readonly issues: Issue[] = [];
  readonly comments = new Map<number, Array<{ id: number; body: string }>>();
  readonly writes: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
  failWith?: number;
  private nextNumber = 42;
  private nextComment = 1;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (this.failWith !== undefined) return json({ message: "private upstream body" }, this.failWith);
    const body = init?.body === undefined ? {} : JSON.parse(String(init.body)) as Record<string, unknown>;
    const root = "https://api.github.com/repos/u-dont-existDOTcom/AskRigor-findings/issues";
    if (method === "GET" && url.startsWith(`${root}?`)) {
      const query = new URL(url).searchParams;
      expect(query.get("state")).toBe("open");
      expect(query.get("labels")).toBe("findings-card");
      const page = Number(query.get("page"));
      return json(this.issues
        .filter((issue) => issue.state === "open" && issue.labels.some(({ name }) => name === "findings-card"))
        .slice((page - 1) * 100, page * 100)
        .map((issue) => ({ ...issue, comments: this.comments.get(issue.number)?.length ?? 0 })));
    }
    if (method === "POST" && url === root) {
      this.writes.push({ method, url, body });
      const issue: Issue = {
        number: this.nextNumber++,
        title: String(body.title),
        body: String(body.body),
        state: "open",
        labels: (body.labels as string[]).map((name) => ({ name })),
      };
      this.issues.push(issue);
      return json(issue, 201);
    }
    const edit = new RegExp(`^${root.replace(/[.]/gu, "\\.")}/(\\d+)$`, "u").exec(url);
    if (edit !== null && method === "PATCH") {
      this.writes.push({ method, url, body });
      const issue = this.issues.find(({ number }) => number === Number(edit[1]))!;
      Object.assign(issue, body);
      return json(issue);
    }
    const comments = new RegExp(`^${root.replace(/[.]/gu, "\\.")}/(\\d+)/comments(?:\\?.*)?$`, "u").exec(url);
    if (comments !== null && method === "GET") {
      const page = Number(new URL(url).searchParams.get("page"));
      return json((this.comments.get(Number(comments[1])) ?? []).slice((page - 1) * 100, page * 100));
    }
    if (comments !== null && method === "POST") {
      this.writes.push({ method, url, body });
      const list = this.comments.get(Number(comments[1])) ?? [];
      const comment = { id: this.nextComment++, body: String(body.body) };
      list.push(comment);
      this.comments.set(Number(comments[1]), list);
      return json(comment, 201);
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

const allowAll: LessonAttemptLimiter = {
  consume: () => ({ allowed: true }),
  lastBlockingReason: () => "hourly_limit",
};

function service(github = new FakeGitHub(), options: {
  limiter?: LessonAttemptLimiter;
  secret?: string;
  now?: Date;
} = {}) {
  return new FindingsSaveService({
    receiptSecret: () => "secret" in options ? options.secret : SECRET,
    limiter: options.limiter ?? allowAll,
    queue: new GitHubFindingsQueue({
      tokenProvider: { getToken: async () => "findings-token-fixture" },
      fetch: github.fetch,
      repository: DEFAULT_FINDINGS_REPOSITORY,
    }),
    protocols: async () => PROTOCOLS,
    version: "0.1.0",
    build: "0123abc",
    now: () => options.now ?? NOW,
  });
}

/** The JSON record a card issue or comment carries. */
function storedRecord(body: string): FindingsRecord {
  const match = /(`{3,})json\n([\s\S]*?)\n\1/u.exec(body);
  expect(match).not.toBeNull();
  return JSON.parse(match![2]!) as FindingsRecord;
}

const originalEnvironment = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});


describe("findings library save", () => {
  it("saves nothing without a valid, unexpired finalization receipt that signed this very card", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ finalization_receipt: "rr1~finalization~status=ready~1790000000~AAAAAAAAAAAAAAAAAAAAAA" }, "receipt_invalid"],
      [{ finalization_receipt: issueResearchReceipt("finalization", { status: "ready", findings: findingsCardDigest(parsedCard()) }, {
        secret: "another-deployment-secret-0123456789", now: () => NOW,
      }) }, "receipt_invalid"],
      [{ finalization_receipt: issueResearchReceipt("study_audit", { findings: findingsCardDigest(parsedCard()) }, {
        secret: SECRET, now: () => NOW,
      }) }, "receipt_invalid"],
      [{ finalization_receipt: finalization({}, new Date("2026-09-29T11:00:00.000Z")) }, "receipt_expired"],
      [{ finalization_receipt: issueResearchReceipt("finalization", { status: "ready" }, { secret: SECRET, now: () => NOW }) },
        "card_not_in_receipt"],
      // A receipt with no research target has no research thread.
      [{ finalization_receipt: issueResearchReceipt("finalization", { status: "ready", findings: findingsCardDigest(parsedCard()) }, {
        secret: SECRET, now: () => NOW,
      }) }, "receipt_invalid"],
      // The card changed after finalize_research checked it.
      [{ findings_card: { ...CARD, question: `${CARD.question} Also for knees?` } }, "card_changed"],
      [{ findings_card: { ...CARD, findings: [{ ...CARD.findings[0], certainty: "high" }] } }, "card_changed"],
    ];
    for (const [overrides, reason] of cases) {
      await expect(save.save(saveInput(overrides), CONTEXT)).resolves.toEqual({
        status: "card_not_checked", retryable: false, reason_code: reason,
      });
    }
    await expect(service(github, { secret: undefined }).save(saveInput(), CONTEXT)).resolves.toMatchObject({
      status: "card_not_checked", reason_code: "receipts_unavailable",
    });
    for (const contributor of ["someone@example.org", "1".repeat(63), undefined]) {
      await expect(save.save({ ...saveInput(), contributor }, CONTEXT)).resolves.toMatchObject({
        status: "card_not_checked", reason_code: "invalid_request",
      });
    }
    expect(github.writes).toEqual([]);
  });

  it("runs the privacy screen before anything is written, with no model call", async () => {
    const github = new FakeGitHub();
    const unsafe = { ...CARD, open_leads: ["Call the clinic on 555-123-4567 first."] };
    const receipt = finalization({ findings: findingsCardDigest(findingsCardSchema.parse(unsafe)) });
    await expect(service(github).save(saveInput({ findings_card: unsafe, finalization_receipt: receipt }), CONTEXT))
      .resolves.toEqual({ status: "privacy_rejected", retryable: false, reason_code: "unsafe_card" });
    expect(github.writes).toEqual([]);
  });

  it("leaves out a reported model name that does not read as one, and saves the card", async () => {
    const github = new FakeGitHub();
    await expect(service(github).save(saveInput({ reported_model: "someone@example.org" }), CONTEXT))
      .resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    expect(storedRecord(github.issues[0]!.body).stamp.reported_model_unverified).toBeUndefined();
    expect(github.issues[0]!.body).not.toContain("example.org");
  });

  it("uses a rate limit of its own before the queue", async () => {
    const github = new FakeGitHub();
    const limited: LessonAttemptLimiter = {
      consume: () => ({ allowed: false, retryAfterSeconds: 120 }),
      lastBlockingReason: () => "daily_limit",
    };
    await expect(service(github, { limiter: limited }).save(saveInput(), CONTEXT)).resolves.toEqual({
      status: "rate_limited", retryable: true, retry_after_seconds: 120, reason_code: "daily_limit",
    });
    expect(github.writes).toEqual([]);
  });

  it("files a stamped card for review and returns only its public id", async () => {
    const github = new FakeGitHub();
    await expect(service(github).save(saveInput(), CONTEXT)).resolves.toEqual({
      status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1,
    });
    expect(github.writes).toHaveLength(1);
    const [issue] = github.issues;
    expect(issue).toMatchObject({ title: CARD.question, labels: [{ name: "findings-card" }, { name: "pending-review" }] });
    const record = storedRecord(issue!.body);
    // The library stores no YouTube video IDs or links: the finding keeps its study and a count of its videos.
    const { card: storedCard } = withoutYouTubeData(parsedCard());
    expect(storedCard.findings[0]).toMatchObject({ sources: ["10.1002/art.41142"], youtube_videos: 1 });
    expect(record).toEqual({
      schema: "askrigor.findings-card.v1",
      card: storedCard,
      card_sha256: findingsCardDigest(parsedCard()),
      stored_without: ["youtube_video_ids_and_links"],
      stamp: {
        saved_at: "2026-09-30T12:00:00.000Z",
        askrigor_version: "0.1.0",
        askrigor_build: "0123abc",
        protocols: PROTOCOLS,
        tool_catalog_sha256: "c".repeat(64),
        surface: "/mcp/claude",
        reported_model_unverified: "Example Model 2026-08-06",
        research: {
          finalized_at: "2026-09-30T12:00:00.000Z",
          depth: "first_pass",
          status: "ready_with_limits",
          receipts_verified: 7,
          validated_sources: 1,
          lead_sources: 0,
          material_videos: 1,
        },
      },
    });
    // The research target's digest and the account stay out of the library; a keyed hash of both marks the thread.
    expect(issue!.body).not.toContain(TARGET_DIGEST);
    expect(issue!.body).not.toContain(ALICE);
    const marker = /<!-- askrigor-findings-card:([A-Za-z0-9_-]+) -->$/u.exec(issue!.body)![1]!;
    expect(JSON.parse(Buffer.from(marker, "base64url").toString("utf8"))).toMatchObject({
      thread: findingsThreadKey(SECRET, ALICE, TARGET_DIGEST),
    });
    // Readable for the review, with the card's text escaped: no link, mention or formatting takes effect.
    expect(issue!.body).toContain("## Question");
    expect(issue!.body).toContain("## Version stamp");
    expect(issue!.body).toContain("Pending the owner's review");
    expect(issue!.body).toContain("Model, as the app reported it \\(not verified\\): Example Model 2026\\-08\\-06");
    expect(issue!.body).toMatch(/\n<!-- askrigor-findings-card:[A-Za-z0-9_-]+ -->$/u);
  });

  it("adds another person's matching card to the open one once per receipt, and starts afresh once that is closed", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    await save.save(saveInput(), CONTEXT);
    // The same question and claims from someone else's checked answer, cased and spaced differently.
    const again = {
      ...CARD,
      question: CARD.question.toLowerCase(),
      findings: [{ ...CARD.findings[0], claim: `  ${CARD.findings[0]!.claim.replace(/ /gu, "  ")}`, certainty: "high" }],
    };
    const againReceipt = finalization({ findings: findingsCardDigest(findingsCardSchema.parse(again)), receipts: 9 });
    const second = saveInput({ findings_card: again, finalization_receipt: againReceipt, contributor: BOB });
    await expect(save.save(second, CONTEXT)).resolves.toEqual({
      status: "existing_card", retryable: false, card_id: "ARF-0042", occurrence_count: 2,
    });
    expect(github.issues).toHaveLength(1);
    const [comment] = github.comments.get(42)!;
    expect(comment!.body).toContain("## Saved again");
    expect(storedRecord(comment!.body).card.findings[0]!.certainty).toBe("high");
    expect(storedRecord(comment!.body).stamp.research.receipts_verified).toBe(9);

    // A retry of either save writes nothing new.
    const writes = github.writes.length;
    await expect(save.save(second, CONTEXT)).resolves.toMatchObject({ status: "existing_card", occurrence_count: 2 });
    await expect(save.save(saveInput(), CONTEXT)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    expect(github.writes).toHaveLength(writes);

    // The same person reaching the same findings again, on the same question, is not another save.
    await expect(save.save(saveInput({ finalization_receipt: finalization({ receipts: 10 }) }), CONTEXT))
      .resolves.toMatchObject({ status: "existing_card", card_id: "ARF-0042", occurrence_count: 2 });
    await expect(save.save(saveInput({ ...second, finalization_receipt: finalization({
      findings: findingsCardDigest(findingsCardSchema.parse(again)), receipts: 10,
    }) }), CONTEXT)).resolves.toMatchObject({ status: "existing_card", occurrence_count: 2 });
    expect(github.writes).toHaveLength(writes);

    // A third person's answer counts as the third save.
    const third = saveInput({ findings_card: again, contributor: "3".repeat(64), finalization_receipt: finalization({
      findings: findingsCardDigest(findingsCardSchema.parse(again)), receipts: 11,
    }) });
    await expect(save.save(third, CONTEXT)).resolves.toMatchObject({ status: "existing_card", occurrence_count: 3 });

    // Once the owner closes the card, the same findings start a new one.
    github.issues[0]!.state = "closed";
    await expect(save.save(saveInput({ finalization_receipt: finalization({ receipts: 12 }) }), CONTEXT))
      .resolves.toMatchObject({ status: "saved", card_id: "ARF-0043" });
  });

  it("replaces the earlier open card of the same person's research on the same question", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    await save.save(saveInput(), CONTEXT);
    // Corrected: new findings on the same research target replace the first card.
    await expect(save.save(saveInput(corrected()), CONTEXT)).resolves.toEqual({
      status: "saved", retryable: false, card_id: "ARF-0043", occurrence_count: 1, replaced_count: 1,
    });
    expect(github.issues[0]).toMatchObject({ number: 42, state: "closed", state_reason: "not_planned" });
    expect(github.comments.get(42)![0]!.body).toBe(
      "## Replaced\n\nA later checked answer in the same research thread was saved as ARF-0043; review that card for this thread."
    );
    // The same person's research on another question, and someone else's on this one, replace nothing.
    const knee = {
      ...CARD,
      question: "Does a walking program help adults with knee osteoarthritis?",
      findings: [{ ...CARD.findings[0], claim: "Walking programs eased knee pain over three months." }],
    };
    await expect(save.save(saveInput({ findings_card: knee, finalization_receipt: finalization({
      findings: findingsCardDigest(findingsCardSchema.parse(knee)), target: "ba9876543210",
    }) }), CONTEXT)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0044" });
    await expect(save.save(saveInput({ ...corrected({ receipts: 8 }), contributor: BOB }), CONTEXT))
      .resolves.toMatchObject({ status: "existing_card", card_id: "ARF-0043", occurrence_count: 2 });
    expect(github.issues.map(({ number, state }) => [number, state])).toEqual([
      [42, "closed"], [43, "open"], [44, "open"],
    ]);
  });

  it("keeps an earlier card open when it also holds someone else's save", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    await save.save(saveInput(), CONTEXT);
    await save.save(saveInput({ contributor: BOB, finalization_receipt: finalization({ receipts: 8 }) }), CONTEXT);
    await expect(save.save(saveInput(corrected()), CONTEXT)).resolves.toMatchObject({
      status: "saved", card_id: "ARF-0043", replaced_count: 1,
    });
    expect(github.issues[0]).toMatchObject({ number: 42, state: "open" });
    expect(github.comments.get(42)!.at(-1)!.body).toContain(
      "saved as ARF-0043; review that card for this thread. This card stays open because it also holds another save or a comment."
    );
  });

  it("answers unavailable, never throwing, when the queue fails or is not configured", async () => {
    for (const [status, retryable, reason] of [
      [401, false, "queue_auth_unavailable"],
      [404, false, "queue_auth_unavailable"],
      [503, true, "queue_service_unavailable"],
    ] as const) {
      const github = new FakeGitHub();
      github.failWith = status;
      await expect(service(github).save(saveInput(), CONTEXT)).resolves.toEqual({
        status: "queue_unavailable", retryable, reason_code: reason,
      });
    }
    for (const key of ["ASKRIGOR_GITHUB_APP_ID", "ASKRIGOR_GITHUB_INSTALLATION_ID", "ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64"]) {
      delete process.env[key];
    }
    // Closed until the owner opens it, whatever else is configured.
    delete process.env.ASKRIGOR_FINDINGS_LIBRARY;
    await expect(saveResearchFindings(saveInput(), CONTEXT)).resolves.toEqual({
      status: "queue_unavailable", retryable: false, reason_code: "library_closed",
    });
    process.env.ASKRIGOR_FINDINGS_LIBRARY = "enabled";
    try {
      await expect(saveResearchFindings(saveInput(), CONTEXT)).resolves.toEqual({
        status: "queue_unavailable", retryable: false, reason_code: "queue_not_configured",
      });
    } finally {
      delete process.env.ASKRIGOR_FINDINGS_LIBRARY;
    }
  });

  it("reads the queue's repository and the build from the environment", () => {
    expect(findingsRepositoryFromEnv({})).toEqual({ owner: "u-dont-existDOTcom", name: "AskRigor-findings" });
    expect(findingsRepositoryFromEnv({ ASKRIGOR_FINDINGS_REPOSITORY: "u-dont-existDOTcom/AskRigor-library" }))
      .toEqual({ owner: "u-dont-existDOTcom", name: "AskRigor-library" });
    for (const value of ["someone-else/AskRigor-findings", "u-dont-existDOTcom/askrigor-LESSONS", "AskRigor-findings"]) {
      expect(() => findingsRepositoryFromEnv({ ASKRIGOR_FINDINGS_REPOSITORY: value }))
        .toThrow("Findings library configuration unavailable");
    }
    expect(askrigorBuildCommitFromEnv(undefined)).toBe("unknown");
    expect(askrigorBuildCommitFromEnv(" 9a02c99 ")).toBe("9a02c99");
    expect(askrigorBuildCommitFromEnv("not a commit")).toBe("unknown");
  });
});

// Owner decision Q11 (2026-09-30): free research is saved by the agreement its user accepted, when
// finalize_research checks the answer, and nothing asks the user; a paid-private answer offers the save,
// and save_research_findings saves it only after the user's yes.
describe("finalize_research, save_research_findings and the findings library", () => {
  const IDENTITY_SECRET = new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes");
  const TARGET = "How the body clears a drug in adults";
  const QUOTE = "The liver clears this drug within a few hours.";
  const CHECKED_CARD = {
    ...CARD,
    findings: [{ ...CARD.findings[0], answer_quote: QUOTE, sources: ["PMC10518852"], tags: ["full_text_read"] }],
  };

  async function accessService() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor("auth0|free", {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
    store.grantPrivateEntitlement({
      entitlementId: "88888888-8888-4888-a888-888888888888",
      accountKey: service.accountKeyForSubject("auth0|paid"),
      status: "ACTIVE",
      source: "OWNER_GRANTED",
      externalReferenceSha256: null,
      grantedAt: "2026-09-01T00:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
    });
    await service.activatePaidPrivate("auth0|paid");
    return service;
  }

  /** A tool as the connector registers it, called with the caller's OAuth identity. */
  function connectorTool(name: "finalize_research" | "save_research_findings", options: RegisterToolsOptions) {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === name) handler = execute;
      },
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", ...options });
    return async (input: Record<string, unknown>, subject?: string) => {
      const { finalizeResearchInputSchema } = await import("../apps/research-mcp/src/research-finalization-gate.js");
      const schema = name === "finalize_research" ? finalizeResearchInputSchema : saveResearchFindingsInputSchema;
      return await handler!(schema.parse(input), subject === undefined ? {} : {
        authInfo: {
          token: "synthetic-token",
          clientId: "synthetic-client",
          scopes: ["research:use"],
          expiresAt: Math.floor(Date.now() / 1_000) + 60,
          extra: { subject },
        },
      });
    };
  }

  const request = (overrides: Record<string, unknown> = {}) => ({
    receipts: [issueResearchReceipt("study_audit", {
      id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields",
    }, { secret: SECRET })],
    community_evidence: "not_relevant",
    not_relevant_basis: "no_real_world_outcome",
    not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
    treatment_choice: "not_compared",
    research_target: TARGET,
    research_depth: "deep",
    intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded or multi-ingredient product." },
    key_sources: [{ id: "PMC10518852", status: "validated" }],
    answer_draft: QUOTE,
    absence_claims: [],
    findings_card: CHECKED_CARD,
    reported_model: "Example Model 2026-08-06",
    ...overrides,
  });

  function recorder(reply: FindingsSaveResult = {
    status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1,
  }) {
    const calls: Array<[Record<string, unknown>, FindingsSaveContext]> = [];
    return {
      calls,
      findingsSave: async (raw: unknown, context: FindingsSaveContext) => {
        calls.push([raw as Record<string, unknown>, context]);
        return reply;
      },
    };
  }

  it("saves a free contributor's checked card, with no offer in the answer", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    const { calls, findingsSave } = recorder();
    const finalize = connectorTool("finalize_research", { researchContributorAccessService: service, findingsLibrary: true, findingsSave });
    const result = await finalize(request(), "auth0|free");
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "ready",
      caveats: [],
      findings_card: { status: "checked", problems: [], saved: { status: "saved", card_id: "ARF-0042" } },
    });
    expect(JSON.stringify(result.content)).toContain("Findings card: checked; saved for review as ARF-0042.");
    expect(calls).toHaveLength(1);
    const [raw, context] = calls[0]!;
    expect(raw).toEqual({
      findings_card: findingsCardSchema.parse(CHECKED_CARD),
      finalization_receipt: (result.structuredContent as { finalization_receipt: string }).finalization_receipt,
      contributor: service.accountKeyForSubject("auth0|free"),
      reported_model: "Example Model 2026-08-06",
    });
    const names = RESEARCH_OPERATIONS.map(({ name }) => name).sort().join("\n");
    expect(context).toEqual({ surface: "/mcp/claude", toolCatalogSha256: createHash("sha256").update(names).digest("hex") });
    // The receipt binds the research target the thread key is made from.
    expect((result.structuredContent as { finalization_receipt: string }).finalization_receipt)
      .toContain(`target=${researchTargetDigest(TARGET)}`);
  });

  it("needs a card from a free contributor's answer, and saves nothing until it has one", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const { calls, findingsSave } = recorder();
    const finalize = connectorTool("finalize_research", { researchContributorAccessService: await accessService(), findingsLibrary: true, findingsSave });
    const { findings_card: _card, ...withoutCard } = request();
    const result = await finalize(withoutCard, "auth0|free");
    expect(result.structuredContent).toMatchObject({
      status: "not_ready",
      next_steps: [expect.stringMatching(/^Give findings_card with answer_draft/u)],
      findings_card: { status: "absent" },
    });
    expect(calls).toEqual([]);
  });

  it("reports a save that did not happen without holding back the answer", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const { findingsSave } = recorder({ status: "rate_limited", retryable: true, retry_after_seconds: 60, reason_code: "hourly_limit" });
    const finalize = connectorTool("finalize_research", { researchContributorAccessService: await accessService(), findingsLibrary: true, findingsSave });
    const result = await finalize(request(), "auth0|free");
    expect(result.structuredContent).toMatchObject({
      status: "ready",
      findings_card: { status: "checked", saved: { status: "not_saved", reason: "hourly_limit" } },
    });
    expect(JSON.stringify(result.content)).toContain("Findings card: checked; not saved.");
  });

  it("lets the answer go ahead when a save takes too long", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const finalize = connectorTool("finalize_research", {
      researchContributorAccessService: await accessService(),
      findingsLibrary: true,
      findingsSave: () => new Promise<FindingsSaveResult>(() => undefined),
      findingsSaveDeadlineMilliseconds: 20,
    });
    const result = await finalize(request(), "auth0|free");
    expect(result.structuredContent).toMatchObject({
      status: "ready",
      findings_card: { status: "checked", saved: { status: "unconfirmed" } },
    });
    expect(JSON.stringify(result.content)).toContain("the save had not finished; it may still complete");
  });

  it("offers a paid-private answer's save and saves only after the user's yes", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    const { calls, findingsSave } = recorder();
    const options = { researchContributorAccessService: service, findingsLibrary: true, findingsSave };
    const finalize = connectorTool("finalize_research", options);
    // The answer must carry the offer before the card is signed; nothing is saved at the final check.
    expect((await finalize(request(), "auth0|paid")).structuredContent).toMatchObject({
      status: "not_ready", caveats: [FINDINGS_SAVE_OFFER], findings_card: { status: "checked" },
    });
    const offered = await finalize(request({ answer_draft: `${QUOTE} ${FINDINGS_SAVE_OFFER}` }), "auth0|paid");
    expect(offered.structuredContent).toMatchObject({
      status: "ready", caveats: [FINDINGS_SAVE_OFFER], findings_card: { status: "checked", problems: [] },
    });
    expect((offered.structuredContent as { findings_card: object }).findings_card).not.toHaveProperty("saved");
    expect(calls).toEqual([]);

    // The user said yes.
    const receipt = (offered.structuredContent as { finalization_receipt: string }).finalization_receipt;
    const save = connectorTool("save_research_findings", options);
    const saved = await save({
      findings_card: CHECKED_CARD, finalization_receipt: receipt, user_consent: "yes_to_this_save",
    }, "auth0|paid");
    expect(saved.isError).not.toBe(true);
    expect(saved.content).toEqual([{ type: "text", text: "Saved for review as ARF-0042." }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({
      findings_card: findingsCardSchema.parse(CHECKED_CARD),
      finalization_receipt: receipt,
      contributor: service.accountKeyForSubject("auth0|paid"),
    });
    // Without the user's yes the request does not reach the tool; without an account or an open library, nothing is saved.
    expect(saveResearchFindingsInputSchema.safeParse({
      findings_card: CHECKED_CARD, finalization_receipt: receipt, user_consent: "no",
    }).success).toBe(false);
    const yes = { findings_card: CHECKED_CARD, finalization_receipt: receipt, user_consent: "yes_to_this_save" };
    const signedOut = await save(yes);
    expect(signedOut.isError).toBe(true);
    expect(JSON.stringify(signedOut.content)).toContain("This call carried no AskRigor sign-in");
    // A surface without research accounts saves nothing either.
    const withoutAccount = await connectorTool("save_research_findings", { ...options, researchAccessRequired: false })(yes);
    expect(withoutAccount.isError).toBe(true);
    expect(JSON.stringify(withoutAccount.content)).toContain("findings are saved only from a connected AskRigor research account");
    const closedSave = await connectorTool("save_research_findings", { ...options, findingsLibrary: false })({
      findings_card: CHECKED_CARD, finalization_receipt: receipt, user_consent: "yes_to_this_save",
    }, "auth0|paid");
    expect(JSON.stringify(closedSave.content)).toContain("Not saved: AskRigor's findings library is not open yet.");
    expect(calls).toHaveLength(1);
  });

  it("keeps research without a research account, and research while the library is closed, out of the library", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    const { calls, findingsSave } = recorder();
    const open = connectorTool("finalize_research", {
      researchContributorAccessService: service, researchAccessRequired: false, findingsLibrary: true, findingsSave,
    });
    const anonymous = await open(request());
    expect(anonymous.structuredContent).toMatchObject({ status: "ready", findings_card: { status: "private", problems: [] } });
    expect(JSON.stringify(anonymous.content)).not.toContain("Findings card");
    const { findings_card: _card, ...withoutCard } = request();
    expect((await open(withoutCard)).structuredContent).toMatchObject({ status: "ready" });

    const closed = connectorTool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false, findingsSave });
    expect((await closed(request(), "auth0|free")).structuredContent).toMatchObject({
      status: "ready", findings_card: { status: "closed" },
    });
    expect((await closed(withoutCard, "auth0|free")).structuredContent).toMatchObject({ status: "ready" });
    expect(calls).toEqual([]);
  });

  it("declares both tools writes, and gives the save tool no research Action path", () => {
    const finalize = RESEARCH_OPERATIONS.find(({ name }) => name === "finalize_research");
    const save = RESEARCH_OPERATIONS.find(({ name }) => name === "save_research_findings");
    for (const tool of [finalize, save]) {
      expect(tool?.annotations).toEqual({
        readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
      });
    }
    expect(finalize?.description).toContain(
      "In free contributor mode a checked findings_card is saved to AskRigor's private findings library for the " +
        "owner's review; in paid private mode the caveats offer its save."
    );
    expect(save?.description).toContain("when the answer offered the save and the user said yes to it");
    expect(save?.description).toContain("never include claims the user corrected");
    expect(save?.actionEnabled).toBe(false);
  });
});
