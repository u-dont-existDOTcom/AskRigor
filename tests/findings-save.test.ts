import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { askrigorBuildCommitFromEnv } from "../apps/research-mcp/src/config.js";
import { findingsCardDigest, findingsCardSchema, withoutYouTubeData } from "../apps/research-mcp/src/findings/card.js";
import type { FindingsSaveResult } from "../apps/research-mcp/src/findings/contracts.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import {
  DEFAULT_FINDINGS_REPOSITORY,
  findingsRepositoryFromEnv,
  saveResearchFindings,
} from "../apps/research-mcp/src/findings/runtime.js";
import {
  FindingsSaveService,
  type FindingsRecord,
  type FindingsSaveContext,
} from "../apps/research-mcp/src/findings/service.js";
import type { LessonAttemptLimiter } from "../apps/research-mcp/src/lessons/rate-limit.js";
import { RESEARCH_OPERATIONS } from "../apps/research-mcp/src/register-tools.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { CARD, parsedCard } from "./helpers/findings-fixtures.js";

const SECRET = "findings-library-test-secret-0123456789";
const NOW = new Date("2026-09-30T12:00:00.000Z");
const CONTEXT: FindingsSaveContext = { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) };
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
  target: "0123456789ab",
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
  user_consent: "yes_to_this_save",
  reported_model: "Example Model 2026-08-06",
  ...overrides,
});

interface Issue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
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
        .slice((page - 1) * 100, page * 100));
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


describe("save_research_findings service", () => {
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
    await expect(save.save({ ...saveInput(), user_consent: "maybe" }, CONTEXT)).resolves.toMatchObject({
      status: "card_not_checked", reason_code: "invalid_request",
    });
    expect(github.writes).toEqual([]);
  });

  it("runs the privacy screen before anything is written, with no model call", async () => {
    const github = new FakeGitHub();
    const unsafe = { ...CARD, open_leads: ["Call the clinic on 555-123-4567 first."] };
    const receipt = finalization({ findings: findingsCardDigest(findingsCardSchema.parse(unsafe)) });
    await expect(service(github).save(saveInput({ findings_card: unsafe, finalization_receipt: receipt }), CONTEXT))
      .resolves.toEqual({ status: "privacy_rejected", retryable: false, reason_code: "unsafe_card" });
    await expect(service(github).save(saveInput({ reported_model: "someone@example.org" }), CONTEXT))
      .resolves.toMatchObject({ status: "privacy_rejected" });
    expect(github.writes).toEqual([]);
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
    // The research target's digest stays out of the library.
    expect(issue!.body).not.toContain("0123456789ab");
    // Readable for the review, with the card's text escaped: no link, mention or formatting takes effect.
    expect(issue!.body).toContain("## Question");
    expect(issue!.body).toContain("## Version stamp");
    expect(issue!.body).toContain("Pending the owner's review");
    expect(issue!.body).toContain("Model, as the app reported it \\(not verified\\): Example Model 2026\\-08\\-06");
    expect(issue!.body).toMatch(/\n<!-- askrigor-findings-card:[A-Za-z0-9_-]+ -->$/u);
  });

  it("adds a matching card to the open one once per receipt, and starts afresh once that is closed", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    await save.save(saveInput(), CONTEXT);
    // The same question and claims from another checked answer, cased and spaced differently.
    const again = {
      ...CARD,
      question: CARD.question.toLowerCase(),
      findings: [{ ...CARD.findings[0], claim: `  ${CARD.findings[0]!.claim.replace(/ /gu, "  ")}`, certainty: "high" }],
    };
    const againReceipt = finalization({ findings: findingsCardDigest(findingsCardSchema.parse(again)), receipts: 9 });
    const second = saveInput({ findings_card: again, finalization_receipt: againReceipt });
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

    // A third answer counts as the third save.
    const third = saveInput({ findings_card: again, finalization_receipt: finalization({
      findings: findingsCardDigest(findingsCardSchema.parse(again)), receipts: 11,
    }) });
    await expect(save.save(third, CONTEXT)).resolves.toMatchObject({ status: "existing_card", occurrence_count: 3 });

    // Once the owner closes the card, the same findings start a new one.
    github.issues[0]!.state = "closed";
    await expect(save.save(saveInput({ finalization_receipt: finalization({ receipts: 12 }) }), CONTEXT))
      .resolves.toMatchObject({ status: "saved", card_id: "ARF-0043" });
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

describe("save_research_findings tool", () => {
  it("is listed on the standard catalog only, as a write with no research Action path", async () => {
    for (const profile of ["standard", "gemini"] as const) {
      const server = createAskRigorServer(profile);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "findings-test", version: "1.0.0" });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        const { tools } = await client.listTools();
        const tool = tools.find(({ name }) => name === "save_research_findings");
        if (profile === "standard") {
          expect(tools).toHaveLength(32);
          expect(tools.at(-1)?.name).toBe("save_research_findings");
          expect(tool?.annotations).toEqual({
            readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
          });
          expect(tool?.description).toContain("only after the user says yes to this save");
          expect(tool?.description).toContain("never include claims the user corrected");
          expect(tool?.description).toContain("no personal details");
        } else {
          expect(tool).toBeUndefined();
        }
      } finally {
        await Promise.all([client.close(), server.close()]);
      }
    }
    expect(RESEARCH_OPERATIONS.find(({ name }) => name === "save_research_findings")?.actionEnabled).toBe(false);
  });

  it("passes the surface and catalog to the library and shows the user a plain receipt", async () => {
    const received: Array<[unknown, FindingsSaveContext]> = [];
    const replies: FindingsSaveResult[] = [
      { status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1 },
      { status: "existing_card", retryable: false, card_id: "ARF-0042", occurrence_count: 3 },
      { status: "card_not_checked", retryable: false, reason_code: "card_changed" },
      { status: "queue_unavailable", retryable: false, reason_code: "queue_not_configured" },
    ];
    const server = createAskRigorServer("standard", {
      mcpSurface: "/mcp/claude",
      findingsSave: async (raw, context) => {
        received.push([raw, context]);
        return replies.shift()!;
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "findings-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const call = () => client.callTool({ name: "save_research_findings", arguments: saveInput() });
      const saved = await call();
      expect(saved.isError).not.toBe(true);
      expect(saved.content).toEqual([{ type: "text", text: "Saved for review as ARF-0042." }]);
      expect(saved.structuredContent).toEqual({
        status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1,
      });
      expect(JSON.stringify((await call()).content)).toContain("Saved for review as ARF-0042, which already holds");
      const changed = await call();
      expect(changed.isError).toBe(true);
      expect(JSON.stringify(changed.content)).toContain("Not saved: the card is not the one finalize_research checked");
      const unavailable = await call();
      expect(unavailable.isError).toBe(true);
      expect(JSON.stringify(unavailable.content)).toContain("Not saved: the findings library is unavailable right now.");

      const names = RESEARCH_OPERATIONS.map(({ name }) => name).sort().join("\n");
      expect(received[0]![1]).toEqual({
        surface: "/mcp/claude",
        toolCatalogSha256: createHash("sha256").update(names).digest("hex"),
      });
      expect(received[0]![0]).toMatchObject({ user_consent: "yes_to_this_save", findings_card: { question: CARD.question } });

      // Nothing reaches the library without the user's yes.
      const noConsent = await client.callTool({
        name: "save_research_findings", arguments: { ...saveInput(), user_consent: "no" },
      });
      expect(noConsent.isError).toBe(true);
      expect(received).toHaveLength(4);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
