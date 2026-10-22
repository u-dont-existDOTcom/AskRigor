import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONTRIBUTION_EXAMPLES,
  CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  InMemoryResearchContributorAccessStore,
  PAID_PRIVATE_MAP_ONLY,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
// The package the tools import, so a refusal it throws is the class the tools recognize.
} from "@askrigor/evidence-repository";

import { askrigorBuildCommitFromEnv } from "../apps/research-mcp/src/config.js";
import {
  FINDINGS_AND_MAP_SAVE_OFFER,
  FINDINGS_ATLAS_SENTENCE,
  FINDINGS_SAVE_OFFER,
  findingsAndMapSaveOffer,
  findingsCardDigest,
  findingsCardSchema,
  findingsSavedLine,
  findingsSaveOffer,
  researchMapSavedLine,
  withoutYouTubeData,
} from "../apps/research-mcp/src/findings/card.js";
import { findingsSaveToolResult } from "../apps/research-mcp/src/findings/connector-tool.js";
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
import {
  OTHER_TOOLS_SENTENCE,
  PERSONAL_ONLY_NOT_OFFERED,
  PERSONAL_ONLY_NOT_SAVED,
  RESEARCH_OPERATIONS,
  registerTools,
  type RegisterToolsOptions,
} from "../apps/research-mcp/src/register-tools.js";
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import {
  RESEARCH_MAP_OFFERED,
  researchMapReminder,
  TOOL_LIST_REFRESH_HINT,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { communitySkipCaveat } from "./helpers/community-skip.js";
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

const finalization = (claims: Record<string, string | number | string[]> = {}, now = NOW) => issueResearchReceipt("finalization", {
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
const corrected = (claims: Record<string, string | number | string[]> = {}) => {
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
    const labels = new RegExp(`^${root.replace(/[.]/gu, "\\.")}/(\\d+)/labels$`, "u").exec(url);
    if (labels !== null && method === "POST") {
      this.writes.push({ method, url, body });
      const issue = this.issues.find(({ number }) => number === Number(labels[1]))!;
      for (const name of body.labels as string[]) {
        if (!issue.labels.some((label) => label.name === name)) issue.labels.push({ name });
      }
      return json(issue.labels);
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

  // Owner answer 156a (2026-10-22): the library keeps only findings that would help other people.
  it("refuses a card declared personal only, and one checked before the declaration, before the limit or the queue", async () => {
    const github = new FakeGitHub();
    let consumed = 0;
    const counting: LessonAttemptLimiter = {
      consume: () => {
        consumed += 1;
        return { allowed: true };
      },
      lastBlockingReason: () => "hourly_limit",
    };
    const save = service(github, { limiter: counting });
    const personal = { ...CARD, public_value: { scope: "personal_only" } };
    const { public_value: _declared, ...undeclared } = CARD;
    const signed = (card: object) => finalization({ findings: findingsCardDigest(findingsCardSchema.parse(card)) });
    await expect(save.save(saveInput({ findings_card: personal, finalization_receipt: signed(personal) }), CONTEXT))
      .resolves.toEqual({ status: "personal_only", retryable: false });
    // A receipt from before the final check asked for the declaration: the card is checked again first.
    await expect(save.save(saveInput({ findings_card: undeclared, finalization_receipt: signed(undeclared) }), CONTEXT))
      .resolves.toEqual({ status: "card_not_checked", retryable: false, reason_code: "public_value_missing" });
    // The declaration read is the one the check signed: one changed after the check is a changed card.
    await expect(save.save(saveInput({ findings_card: personal }), CONTEXT))
      .resolves.toMatchObject({ status: "card_not_checked", reason_code: "card_changed" });
    await expect(save.save(saveInput({ findings_card: CARD, finalization_receipt: signed(personal) }), CONTEXT))
      .resolves.toMatchObject({ status: "card_not_checked", reason_code: "card_changed" });
    expect(github.writes).toEqual([]);
    expect(consumed).toBe(0);
    // What the model and the user see.
    expect(findingsSaveToolResult({ status: "personal_only", retryable: false })).toEqual({
      content: [{
        type: "text",
        text: "Not saved: the card declares its findings personal only, and AskRigor's findings library keeps only " +
          "findings that would help other people.",
      }],
      structuredContent: { status: "personal_only", retryable: false },
      isError: true,
    });
    expect(findingsSaveToolResult({ status: "card_not_checked", retryable: false, reason_code: "public_value_missing" })
      .content).toEqual([{
        type: "text",
        text: "Not saved: the card does not say whom its findings would help, so check it again with finalize_research, " +
          "with public_value in the card. Save the card exactly as the last finalize_research call checked it, with " +
          "the finalization_receipt it returned.",
      }]);
  });

  it("stores the card's public-value declaration and shows each save's in the owner's review", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    await save.save(saveInput(), CONTEXT);
    const [issue] = github.issues;
    expect(storedRecord(issue!.body).card.public_value).toEqual(CARD.public_value);
    const declared = "## Public value, as the AI declared it\n\n- Scope: public\n- Who else faces it: Adults with hip " +
      "osteoarthritis who are weighing a joint replacement\n- What it could change for them: It makes supervised " +
      "exercise a first option with real evidence, not a stopgap before surgery\\.";
    expect(issue!.body).toContain(declared);
    // Read after the question and the usual answer, before the findings.
    expect(issue!.body.indexOf("## Usual answer")).toBeLessThan(issue!.body.indexOf(declared));
    expect(issue!.body.indexOf(declared)).toBeLessThan(issue!.body.indexOf("## Finding 1"));
    // Another person's save of the same question and claims declares in its own words, which its occurrence shows.
    const theirs = { ...CARD, public_value: { ...CARD.public_value, who_else: "Older adults with hip osteoarthritis" } };
    await expect(save.save(saveInput({
      findings_card: theirs,
      contributor: BOB,
      finalization_receipt: finalization({ receipts: 8, findings: findingsCardDigest(findingsCardSchema.parse(theirs)) }),
    }), CONTEXT)).resolves.toMatchObject({ status: "existing_card", card_id: "ARF-0042", occurrence_count: 2 });
    const [occurrence] = github.comments.get(42)!;
    expect(occurrence!.body).toContain("## Public value, as this save declares it\n\n- Scope: public\n- Who else faces " +
      "it: Older adults with hip osteoarthritis\n");
    expect(storedRecord(occurrence!.body).card.public_value).toEqual(theirs.public_value);
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

  // Owner answer 139c (2026-10-20): the owner reviews first the cards whose findings rest on work a quick answer can't do.
  it("stamps each finding's work beyond a quick answer as its receipt signed it, and labels the card", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    await expect(save.save(saveInput({ finalization_receipt: finalization({ bases: ["full_text_audit.comment_audit"] }) }), CONTEXT))
      .resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    const [issue] = github.issues;
    expect(issue!.labels).toEqual([{ name: "findings-card" }, { name: "pending-review" }, { name: "beyond-quick-answer" }]);
    expect(storedRecord(issue!.body).card.findings[0]).toMatchObject({ verified_bases: ["full_text_audit", "comment_audit"] });
    expect(issue!.body).toContain("- Beyond a quick answer, as the receipts show: full\\_text\\_audit, comment\\_audit");

    // No basis, a list that does not fit the card, or a name the library does not know: nothing is stamped.
    for (const bases of [["none"], ["none", "full_text_audit"], ["full_text_read"], ["comment_audit.comment_audit"]]) {
      const other = new FakeGitHub();
      await service(other).save(saveInput({ finalization_receipt: finalization({ bases }) }), CONTEXT);
      expect(other.issues[0]!.labels).toEqual([{ name: "findings-card" }, { name: "pending-review" }]);
      expect(storedRecord(other.issues[0]!.body).card.findings[0]).not.toHaveProperty("verified_bases");
      expect(other.issues[0]!.body).toContain("- Beyond a quick answer, as the receipts show: none");
    }
  });

  it("labels an open card when another person's save of the same findings goes beyond a quick answer", async () => {
    const github = new FakeGitHub();
    const save = service(github);
    await save.save(saveInput(), CONTEXT);
    expect(github.issues[0]!.labels).toEqual([{ name: "findings-card" }, { name: "pending-review" }]);
    await expect(save.save(saveInput({
      contributor: BOB, finalization_receipt: finalization({ receipts: 8, bases: ["full_text_audit"] }),
    }), CONTEXT)).resolves.toMatchObject({ status: "existing_card", card_id: "ARF-0042", occurrence_count: 2 });
    expect(github.issues[0]!.labels).toContainEqual({ name: "beyond-quick-answer" });
    const [occurrence] = github.comments.get(42)!;
    expect(storedRecord(occurrence!.body).card.findings[0]).toMatchObject({ verified_bases: ["full_text_audit"] });
    // The card's own copy shows its first save's bases, so the occurrence shows its own.
    expect(occurrence!.body).toContain("## Beyond a quick answer, as this save's receipts show\n\n- Finding 1: full\\_text\\_audit");
    expect(github.issues[0]!.body).toContain("- Beyond a quick answer, as the receipts show: none");
    // A card already labeled is not labeled again.
    const writes = github.writes.length;
    await save.save(saveInput({
      contributor: "3".repeat(64), finalization_receipt: finalization({ receipts: 9, bases: ["comment_audit"] }),
    }), CONTEXT);
    expect(github.writes.slice(writes).map(({ url }) => url.replace(/^.*\/issues/u, ""))).toEqual(["/42/comments"]);
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
  // The answer states the community search its no_real_world_outcome declaration skipped (owner question 125).
  const SKIP = communitySkipCaveat("How the body clears a drug, with no real-world outcome.");
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
  function connectorTool(
    name: "finalize_research" | "save_research_findings" | "submit_research_contribution" | "manage_research_access",
    options: RegisterToolsOptions,
  ) {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === name) handler = execute;
      },
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", ...options });
    return async (input: Record<string, unknown>, subject?: string) => {
      const { finalizeResearchInputSchema } = await import("../apps/research-mcp/src/research-finalization-gate.js");
      // The contribution tool accepts any call and checks it itself; the access tool's input is plain.
      const parsed = name === "finalize_research"
        ? finalizeResearchInputSchema.parse(input)
        : name === "save_research_findings" ? saveResearchFindingsInputSchema.parse(input) : input;
      return await handler!(parsed, subject === undefined ? {} : {
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
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates findings save checks." },
    receipts: [issueResearchReceipt("study_audit", {
      id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields",
    }, { secret: SECRET })],
    community_evidence: "not_relevant",
    not_relevant_basis: "no_real_world_outcome", question_about: "other",
    commercial_review_applicability: { status: "not_applicable", reason: "Drug clearance mechanism involves no product or service people buy." },
    not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
    treatment_choice: "not_compared",
    research_target: TARGET,
    research_depth: "deep",
    intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded or multi-ingredient product." },
    key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    findings_card: CHECKED_CARD,
    reported_model: "Example Model 2026-08-06",
    ...overrides,
    answer_draft: `${overrides.answer_draft ?? QUOTE}\n\n[Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/)\n\n${SKIP}`,
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
      status: "ready_with_limits",
      caveats: [SKIP],
      findings_card: { status: "checked", problems: [], beyond_quick_answer: 1, saved: { status: "saved", card_id: "ARF-0042" } },
      // Owner answer 139c: the free answer ends by saying where its findings went, with the card's real id.
      saved_line: "Saved to AskRigor's findings library for review as ARF-0042.",
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain("Findings card: checked; saved for review as ARF-0042.");
    const saved = "\nJust before the check line, end the answer with this line, as written (in the answer's language " +
      "when the answer is not in English): Saved to AskRigor's findings library for review as ARF-0042.";
    const ending = "\nEnd the answer with this line, as written (in the answer's language when the answer is not in " +
      "English): Checked with AskRigor's final check, with the limits above.";
    expect(text).toContain(saved);
    expect(text.indexOf(saved)).toBeLessThan(text.indexOf(ending));
    expect(findingsSavedLine("ARF-0042")).toBe("Saved to AskRigor's findings library for review as ARF-0042.");
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
      next_steps: [expect.stringMatching(/^Give findings_card with answer_draft/u), TOOL_LIST_REFRESH_HINT],
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
      status: "ready_with_limits",
      findings_card: { status: "checked", saved: { status: "not_saved", reason: "hourly_limit" } },
    });
    expect(JSON.stringify(result.content)).toContain("Findings card: checked; not saved.");
    // A save that did not happen has no id, so the answer says nothing of it.
    expect(result.structuredContent).not.toHaveProperty("saved_line");
    expect(JSON.stringify(result.content)).not.toContain("Saved to AskRigor's findings library");
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
      status: "ready_with_limits",
      findings_card: { status: "checked", saved: { status: "unconfirmed" } },
    });
    expect(JSON.stringify(result.content)).toContain("the save had not finished; it may still complete");
    expect(result.structuredContent).not.toHaveProperty("saved_line");
    expect(JSON.stringify(result.content)).not.toContain("Saved to AskRigor's findings library");
  });

  it("offers a paid-private answer's save and saves only after the user's yes", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    const { calls, findingsSave } = recorder();
    const options = { researchContributorAccessService: service, findingsLibrary: true, findingsSave };
    const finalize = connectorTool("finalize_research", options);
    // The card's finding rests on the study audited in full text, so the offer names that work (owner answer 139c),
    // and on the connector its one sentence also asks to file this research's map (owner answer 143a). The sentence on
    // the public Atlas follows (owner answers 159 and 160b).
    const offer = findingsAndMapSaveOffer({ studies: 1, videos: 0, absences: 0, corrections: 0 });
    expect(offer).toBe("These findings rest on a full-text audit of 1 study, work a quick answer does not do. " +
      `${FINDINGS_AND_MAP_SAVE_OFFER} ${FINDINGS_ATLAS_SENTENCE}`);
    expect(FINDINGS_ATLAS_SENTENCE).toBe("Saved findings that AskRigor's owner accepts may be published in AskRigor's " +
      "public Atlas, written without you.");
    expect(FINDINGS_AND_MAP_SAVE_OFFER).toBe("If you want them saved to AskRigor's findings library for review, and " +
      "this research's map (the searches, the studies found and the leads left open, never this chat) filed to " +
      "AskRigor's shared research repository for review, say yes; nothing is saved or filed otherwise.");
    // The answer must carry the offer before the card is signed; nothing is saved at the final check.
    expect((await finalize(request(), "auth0|paid")).structuredContent).toMatchObject({
      status: "not_ready", caveats: [SKIP, offer], findings_card: { status: "checked", beyond_quick_answer: 1 },
    });
    const offered = await finalize(request({ answer_draft: `${QUOTE} ${offer}` }), "auth0|paid");
    expect(offered.structuredContent).toMatchObject({
      status: "ready_with_limits", caveats: [SKIP, offer], findings_card: { status: "checked", problems: [] },
      research_map: { status: "offered", note: RESEARCH_MAP_OFFERED },
    });
    expect((offered.content as Array<{ text: string }>).map(({ text }) => text).join("\n"))
      .toContain(`Research map: ${RESEARCH_MAP_OFFERED}`);
    // The receipt signs the offer of the map and the account it was made to.
    expect((offered.structuredContent as { finalization_receipt: string }).finalization_receipt).toContain("map=offered");
    expect(offered.structuredContent).not.toHaveProperty("saved_line");
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

    // The same yes files this research's map (owner answer 143a), with the receipt of the check that offered it.
    const submit = connectorTool("submit_research_contribution", options);
    const map = {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
      payload: CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER,
    };
    // Without the yes and the receipt, a paid private account files nothing.
    const unasked = await submit(map, "auth0|paid");
    expect(unasked.isError).toBe(true);
    expect(unasked.structuredContent).toMatchObject({
      ok: false, error: { code: "paid_private_does_not_contribute", message: PAID_PRIVATE_MAP_ONLY },
    });
    const filed = await submit({ ...map, userConsent: "yes_to_this_save", finalizationReceipt: receipt }, "auth0|paid");
    expect(filed.isError).not.toBe(true);
    expect(filed.structuredContent).toMatchObject({
      ok: true, proposal: { proposalKind: "RESEARCH_FRONTIER", status: "PENDING_REVIEW", writeStatus: "inserted" },
    });
    const mapReceipt = (filed.structuredContent as { research_receipt: string }).research_receipt;
    expect(mapReceipt).toMatch(/^rr1~research_map~/u);
    // Sending the same map again is the same filing; another map needs a new offer and a new yes.
    const again = await submit({ ...map, userConsent: "yes_to_this_save", finalizationReceipt: receipt }, "auth0|paid");
    expect(again.structuredContent).toMatchObject({ ok: true, proposal: { writeStatus: "idempotent_replay" } });
    const another = await submit({
      ...map,
      payload: { ...CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER, idempotencyKey: "research-frontier-example-2" },
      userConsent: "yes_to_this_save",
      finalizationReceipt: receipt,
    }, "auth0|paid");
    expect(another.isError).toBe(true);
    expect(JSON.stringify(another.content)).toContain("has already filed this research's map");
    // A receipt whose check offered no map, or was made to another account, does not count.
    const unoffered = await submit({
      ...map,
      payload: { ...CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER, idempotencyKey: "research-frontier-example-3" },
      userConsent: "yes_to_this_save",
      finalizationReceipt: issueResearchReceipt("finalization", { status: "ready" }, { secret: SECRET }),
    }, "auth0|paid");
    expect(unoffered.isError).toBe(true);
    expect(JSON.stringify(unoffered.content)).toContain("The finalizationReceipt sent does not count: it is not a " +
      "final check of this account whose offer included this research's map.");
  });

  it("reminds a free contributor to file the research map, and ends the answer with what was saved", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const { findingsSave } = recorder();
    const options = { researchContributorAccessService: await accessService(), findingsLibrary: true, findingsSave };
    const finalize = connectorTool("finalize_research", options);
    // Its research audited a study in full text and no map of it was filed: the check reminds, holding nothing back.
    // The research's receipts are made once, before the map is filed, as in a real conversation.
    const research = request().receipts;
    const first = await finalize(request({ receipts: research }), "auth0|free");
    const reminder = researchMapReminder({ studies: 1, videos: 0, absences: 0, corrections: 0 });
    expect(first.structuredContent).toMatchObject({
      status: "ready_with_limits",
      research_map: { status: "not_filed", note: reminder },
      saved_line: findingsSavedLine("ARF-0042"),
    });
    expect(reminder).toContain("the free contributor agreement covers it, so the user is not asked");
    // Filing the map returns a receipt; with it, the check says the map was filed and the last line says so.
    const filed = await connectorTool("submit_research_contribution", options)({
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
      payload: CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER,
    }, "auth0|free");
    const mapReceipt = (filed.structuredContent as { research_receipt: string }).research_receipt;
    expect(mapReceipt).toMatch(/^rr1~research_map~/u);
    const second = await finalize(request({ receipts: [...research, mapReceipt] }), "auth0|free");
    expect(second.structuredContent).toMatchObject({
      status: "ready_with_limits",
      research_map: { status: "filed" },
      saved_line: researchMapSavedLine("ARF-0042"),
    });
    expect(researchMapSavedLine("ARF-0042")).toBe("Saved to AskRigor's findings library for review as ARF-0042; " +
      "this research's map (the searches, the studies found and the leads left open, never this chat) was filed to " +
      "AskRigor's shared research repository for review.");
    // The map is not research: the receipt count a saved card's stamp carries is unchanged.
    expect((second.structuredContent as { receipts_verified: number }).receipts_verified).toBe(2);
    // Another account's map is not this research's.
    const paidMap = await finalize(request({ receipts: [...research, mapReceipt] }), "auth0|paid");
    expect(paidMap.structuredContent).toMatchObject({ research_map: { status: "offered" } });
  });

  it("offers no paid-private save when no finding rests on work a quick answer can't do, and still saves on request", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    const { calls, findingsSave } = recorder();
    const options = { researchContributorAccessService: service, findingsLibrary: true, findingsSave };
    const finalize = connectorTool("finalize_research", options);
    const LEAD = "10.1016/j.joca.2020.01.001";
    const leadCard = { ...CARD, findings: [{ ...CHECKED_CARD.findings[0], sources: [LEAD], tags: [] }] };
    const leadRequest = (draft: string) => request({
      receipts: [...request().receipts, issueResearchReceipt("full_text_lead", {
        doi: LEAD, state: "PAYWALL_OR_LOGIN_REQUIRED",
      }, { secret: SECRET })],
      key_sources: [...request().key_sources, { read_depth: "abstract_only", answer_marker: "Study", id: LEAD, status: "lead_only" }],
      findings_card: leadCard,
      answer_draft: draft,
    });
    const draft = `${QUOTE} [Study](https://doi.org/${LEAD})`;
    const first = await finalize(leadRequest(draft), "auth0|paid");
    const caveats = (first.structuredContent as { caveats: string[] }).caveats;
    expect(caveats.some((caveat) => caveat.includes(FINDINGS_SAVE_OFFER))).toBe(false);
    const result = await finalize(leadRequest([draft, ...caveats].join("\n\n")), "auth0|paid");
    expect(result.structuredContent).toMatchObject({
      status: "ready_with_limits", next_steps: [], findings_card: { status: "checked", problems: [], beyond_quick_answer: 0 },
    });
    expect(JSON.stringify(result.content)).toContain(
      "Findings card: checked; no finding rests on work a quick answer cannot do, so the answer offers no save. If the " +
        // Seen through JSON.stringify, so the sentence's quotation marks are escaped.
        "user asks for it, tell them first: \\\"Saved findings that AskRigor's owner accepts may be published in " +
        "AskRigor's public Atlas, written without you.\\\" Then save_research_findings saves it after their yes."
    );
    // The receipt signed the checked card, so the user's own request saves it after their yes.
    const receipt = (result.structuredContent as { finalization_receipt: string }).finalization_receipt;
    const saved = await connectorTool("save_research_findings", options)({
      findings_card: leadCard, finalization_receipt: receipt, user_consent: "yes_to_this_save",
    }, "auth0|paid");
    expect(saved.isError).not.toBe(true);
    expect(calls).toHaveLength(1);
  });

  // Owner answer 156a (2026-10-22): "Build the test: the AI's public-value declaration on each card; personal-only
  // findings are neither saved for the Atlas nor offered; you approve the rest."
  const PERSONAL_CARD = { ...CHECKED_CARD, public_value: { scope: "personal_only" } };
  const resultText = (result: CallToolResult) => (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n");

  it("saves a free contributor's public card and not a personal-only one, saying why, with no saved line for it", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const { calls, findingsSave } = recorder();
    const options = { researchContributorAccessService: await accessService(), findingsLibrary: true, findingsSave };
    const finalize = connectorTool("finalize_research", options);
    const research = request().receipts;
    const personal = await finalize(request({ receipts: research, findings_card: PERSONAL_CARD }), "auth0|free");
    expect(personal.structuredContent).toMatchObject({
      status: "ready_with_limits",
      caveats: [SKIP],
      findings_card: {
        status: "checked", problems: [], public_value: "personal_only", saved: { status: "not_saved", reason: "personal_only" },
      },
    });
    expect(personal.structuredContent).not.toHaveProperty("saved_line");
    expect(resultText(personal)).toContain(`\nFindings card: checked; ${PERSONAL_ONLY_NOT_SAVED}.`);
    expect(PERSONAL_ONLY_NOT_SAVED).toBe("not saved: its findings are declared personal only, so they stay out of " +
      "AskRigor's findings library");
    expect(resultText(personal)).not.toContain("Saved to AskRigor's findings library");
    expect(calls).toEqual([]);
    // The research map is separate from the card (owner answer 143a): its reminder still comes, and a map filed for
    // this research is still named, alone, in the answer's last line.
    expect(personal.structuredContent).toMatchObject({
      research_map: { status: "not_filed", note: researchMapReminder({ studies: 1, videos: 0, absences: 0, corrections: 0 }) },
    });
    const filed = await connectorTool("submit_research_contribution", options)({
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
      payload: CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER,
    }, "auth0|free");
    const mapReceipt = (filed.structuredContent as { research_receipt: string }).research_receipt;
    const withMap = await finalize(request({ receipts: [...research, mapReceipt], findings_card: PERSONAL_CARD }), "auth0|free");
    expect(withMap.structuredContent).toMatchObject({
      research_map: { status: "filed" },
      findings_card: { saved: { status: "not_saved", reason: "personal_only" } },
      saved_line: researchMapSavedLine(undefined),
    });
    expect(calls).toEqual([]);
    // Declared public, the same findings are saved for the owner's review, as before.
    const shared = await finalize(request({ receipts: research }), "auth0|free");
    expect(shared.structuredContent).toMatchObject({
      findings_card: { status: "checked", public_value: "public", saved: { status: "saved", card_id: "ARF-0042" } },
      saved_line: findingsSavedLine("ARF-0042"),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatchObject({ findings_card: { public_value: CARD.public_value } });
  });

  it("does not save a free contributor's card without the declaration, and lets the answer go ahead", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const { calls, findingsSave } = recorder();
    const finalize = connectorTool("finalize_research", {
      researchContributorAccessService: await accessService(), findingsLibrary: true, findingsSave,
    });
    const { public_value: _declared, ...undeclared } = CHECKED_CARD;
    const result = await finalize(request({ findings_card: undeclared }), "auth0|free");
    expect(result.structuredContent).toMatchObject({
      status: "ready_with_limits",
      next_steps: [],
      findings_card: { status: "rejected", problems: [expect.stringMatching(/^findings_card\.public_value is missing: /u)] },
    });
    expect(result.structuredContent).not.toHaveProperty("saved_line");
    expect(resultText(result)).toContain("\nFindings card: rejected: findings_card.public_value is missing: ");
    expect(resultText(result)).toContain("\nEnd the answer with this line, as written");
    expect(calls).toEqual([]);
  });

  it("offers a paid private save only for a public card, and save_research_findings refuses a personal-only one", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const github = new FakeGitHub();
    // The library itself, with the clock the final check signs by.
    const library = service(github, { now: new Date() });
    const options = {
      researchContributorAccessService: await accessService(),
      findingsLibrary: true,
      findingsSave: (raw: unknown, context: FindingsSaveContext) => library.save(raw, context),
    };
    const finalize = connectorTool("finalize_research", options);
    const save = connectorTool("save_research_findings", options);
    // A public card is offered as before, in the one sentence that also asks to file this research's map (143a).
    const offer = findingsAndMapSaveOffer({ studies: 1, videos: 0, absences: 0, corrections: 0 });
    const shared = await finalize(request({ answer_draft: `${QUOTE} ${offer}` }), "auth0|paid");
    expect(shared.structuredContent).toMatchObject({
      status: "ready_with_limits", caveats: [SKIP, offer],
      findings_card: { status: "checked", public_value: "public" }, research_map: { status: "offered" },
    });
    // A personal-only card is checked, but nothing is offered: neither its save nor the map.
    const personal = await finalize(request({ findings_card: PERSONAL_CARD }), "auth0|paid");
    expect(personal.structuredContent).toMatchObject({
      status: "ready_with_limits", caveats: [SKIP],
      findings_card: { status: "checked", problems: [], beyond_quick_answer: 1, public_value: "personal_only" },
    });
    expect(personal.structuredContent).not.toHaveProperty("research_map");
    expect((personal.structuredContent as { findings_card: object }).findings_card).not.toHaveProperty("saved");
    expect(resultText(personal)).toContain(`\nFindings card: checked; ${PERSONAL_ONLY_NOT_OFFERED}.`);
    expect(PERSONAL_ONLY_NOT_OFFERED).toBe("its findings are declared personal only, so the answer offers no save, and " +
      "save_research_findings does not save them");
    const receipt = (personal.structuredContent as { finalization_receipt: string }).finalization_receipt;
    expect(receipt).not.toContain("map=offered");
    // Asked anyway, the save is refused by the declaration the final check signed, and nothing is stored.
    const refused = await save({ findings_card: PERSONAL_CARD, finalization_receipt: receipt, user_consent: "yes_to_this_save" }, "auth0|paid");
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toEqual({ status: "personal_only", retryable: false });
    expect(refused.content).toEqual([{
      type: "text",
      text: "Not saved: the card declares its findings personal only, and AskRigor's findings library keeps only " +
        "findings that would help other people.",
    }]);
    // Declaring it public after the check does not get it saved: that is not the card the check signed.
    const relabeled = await save({ findings_card: CHECKED_CARD, finalization_receipt: receipt, user_consent: "yes_to_this_save" }, "auth0|paid");
    expect(relabeled.structuredContent).toMatchObject({ status: "card_not_checked", reason_code: "card_changed" });
    expect(github.writes).toEqual([]);
    // With no offer made, the map is not filed with this receipt either.
    const map = await connectorTool("submit_research_contribution", options)({
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
      payload: CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER,
      userConsent: "yes_to_this_save",
      finalizationReceipt: receipt,
    }, "auth0|paid");
    expect(map.isError).toBe(true);
    // The public card's save, after the user's yes, is stored with its declaration.
    const yes = await save({
      findings_card: CHECKED_CARD,
      finalization_receipt: (shared.structuredContent as { finalization_receipt: string }).finalization_receipt,
      user_consent: "yes_to_this_save",
    }, "auth0|paid");
    expect(yes.structuredContent).toMatchObject({ status: "saved", card_id: "ARF-0042" });
    expect(storedRecord(github.issues[0]!.body).card.public_value).toEqual(CARD.public_value);
  });

  it("keeps research without a research account, and research while the library is closed, out of the library", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    const { calls, findingsSave } = recorder();
    const open = connectorTool("finalize_research", {
      researchContributorAccessService: service, researchAccessRequired: false, findingsLibrary: true, findingsSave,
    });
    const anonymous = await open(request());
    expect(anonymous.structuredContent).toMatchObject({ status: "ready_with_limits", findings_card: { status: "private", problems: [] } });
    expect(JSON.stringify(anonymous.content)).not.toContain("Findings card");
    const { findings_card: _card, ...withoutCard } = request();
    expect((await open(withoutCard)).structuredContent).toMatchObject({ status: "ready_with_limits" });

    const closed = connectorTool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false, findingsSave });
    expect((await closed(request(), "auth0|free")).structuredContent).toMatchObject({
      status: "ready_with_limits", findings_card: { status: "closed" },
    });
    expect((await closed(withoutCard, "auth0|free")).structuredContent).toMatchObject({ status: "ready_with_limits" });
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
        "owner's review, and saved_line says so at the end of the answer; in paid private mode, when a finding rests " +
        "on work a quick answer cannot do, the caveats offer its save, which also asks to file this research's map. " +
        // Owner answer 156a (2026-10-22).
        "A card whose public_value declares its findings personal_only is neither saved nor offered."
    );
    expect(save?.description).toContain("A card whose public_value declares its findings personal_only is not saved.");
    // Owner answer 148a: other providers' research tools point to studies; their text is not evidence or answer text.
    expect(finalize?.description).toContain(OTHER_TOOLS_SENTENCE.trim());
    expect(OTHER_TOOLS_SENTENCE).toContain("their summaries, rankings and scores are not evidence");
    expect(OTHER_TOOLS_SENTENCE).toContain("do not send this research to another tool's reporting call");
    expect(save?.description).toContain(
      "when the user said yes to saving it: after the answer offered the save, or when the user asked for it"
    );
    expect(save?.description).toContain("never include claims the user corrected");
    expect(save?.actionEnabled).toBe(false);
  });
});
