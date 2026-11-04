import { InMemoryAtlasReviewStore } from "@askrigor/evidence-repository";
import { describe, expect, it } from "vitest";

import { forgetCard } from "../apps/research-mcp/src/findings/atlas-forget.js";
import { findingsCardDigest } from "../apps/research-mcp/src/findings/card.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import {
  FINDINGS_CARD_LABEL,
  GitHubFindingsQueue,
  UNSAVED_CARD_LABEL,
} from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService, findingsThreadKey } from "../apps/research-mcp/src/findings/service.js";
import {
  declaredPersonalOnly,
  restsOnYouTubeComments,
  unsavedCardCopy,
  unsavedCardProblems,
  unsavedClaimKey,
} from "../apps/research-mcp/src/findings/unsaved-card.js";
import type { LessonAttemptLimiter } from "../apps/research-mcp/src/lessons/rate-limit.js";
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { FakeGitHub } from "./helpers/fake-github-findings.js";
import { CARD, parsedCard } from "./helpers/findings-fixtures.js";

// The owner, 4 Nov 2026: "when a finding is not accepted, it's put into a review queue anyway to check it so we don't
// lose findings on technicalities". Every card and number here is invented.

const SECRET = "unsaved-card-test-secret-0123456789";
const NOW = new Date("2026-11-04T12:00:00.000Z");
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);
const TARGET = "What helps the invented tremor of Velmor syndrome?";
const FINDING = CARD.findings[0]!;

const allow: LessonAttemptLimiter = { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" };
const refuse: LessonAttemptLimiter = {
  consume: () => ({ allowed: false, retryAfterSeconds: 60 }),
  lastBlockingReason: () => "hourly_limit",
};

function queueOf(github: FakeGitHub) {
  return new GitHubFindingsQueue({
    tokenProvider: { getToken: async () => "findings-token-fixture" },
    fetch: github.fetch,
    repository: DEFAULT_FINDINGS_REPOSITORY,
  });
}

function service(github: FakeGitHub, options: {
  unsavedLimiter?: LessonAttemptLimiter;
  held?: unknown[];
  queue?: GitHubFindingsQueue;
} = {}) {
  const { held } = options;
  return new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: allow,
    unsavedLimiter: options.unsavedLimiter ?? allow,
    queue: options.queue ?? queueOf(github),
    protocols: async () => [{ name: "HRP", version: "20.6.38", sha256: "a".repeat(64) }],
    version: "0.1.0",
    build: "0123abc",
    now: () => NOW,
    ...(held === undefined ? {} : { held: { hold: async (input: unknown) => {
      held.push(input);
      return [];
    } } }),
  });
}

const refused = (overrides: Record<string, unknown> = {}) => ({
  card: CARD,
  researchTarget: TARGET,
  contributor: ALICE,
  why: "refused" as const,
  problems: ["findings_card.findings[0].sources lists PMID:1, which this call did not verify."],
  commentsRead: false,
  ...overrides,
});

function saveInput(card = parsedCard(), contributor = ALICE) {
  return {
    findings_card: card,
    contributor,
    finalization_receipt: issueResearchReceipt("finalization", {
      status: "ready_with_limits", community: "researched", receipts: 1, videos: 0, depth: "first_pass",
      target: researchTargetDigest(TARGET), coverage: "none", open_leads: 0, validated: 1, leads: 0, limits: 0,
      unverified: 0, findings: findingsCardDigest(card),
    }, { secret: SECRET, now: () => NOW }),
  };
}
const CONTEXT = { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) };

describe("the copy of a card that wasn't saved", () => {
  it("keeps the card's fields and a public paper's identifier, and says what it left out, never the text", () => {
    const copy = unsavedCardCopy({
      ...CARD,
      question: "Does zentarine help?",
      usual_answer: "Write to jo.private@example.test about it.",
      findings: [{ ...FINDING, sources: ["10.1000/synthetic-a", "https://www.reddit.com/r/invented/comments/abc/x/"] }],
    }, false)!;
    expect(copy.question).toBe("Does zentarine help?");
    expect(copy.card.usual_answer).toBe("[left out]");
    expect(copy.card.findings).toEqual([expect.objectContaining({ claim: FINDING.claim, sources: ["10.1000/synthetic-a"] })]);
    expect(copy.leftOut).toEqual(["usual_answer: direct_identifier", "findings[0].sources[1]: not a DOI, PMID, PMCID or NCT id"]);
    expect(JSON.stringify(copy)).not.toContain("jo.private");
    expect(JSON.stringify(copy.card)).not.toContain("reddit");
  });

  it("leaves out a finding that rests on YouTube comments, by what it shows, its declaration or the lack of one", () => {
    const shows = { ...FINDING, claim: "Shown by its video.", sources: ["dQw4w9WgXcQ"] };
    const tagged = { ...FINDING, claim: "Tagged.", tags: ["community_checked"] };
    const declared = { ...FINDING, claim: "Declared.", draws_on_youtube_comments: true };
    const clear = { ...FINDING, claim: "Says it doesn't.", draws_on_youtube_comments: false };
    const silent = { ...FINDING, claim: "Says nothing." };
    const copy = unsavedCardCopy({ ...CARD, findings: [shows, tagged, declared, clear, silent] }, true)!;
    expect((copy.card.findings as Array<{ claim: string }>).map(({ claim }) => claim)).toEqual(["Says it doesn't."]);
    expect(copy.kept).toEqual([3]);
    expect(copy.sourcesLeftOut).toContain("dQw4w9WgXcQ");
    expect(JSON.stringify(copy.card)).not.toContain("dQw4w9WgXcQ");
    expect(restsOnYouTubeComments(silent, false)).toBe(false);
    expect(restsOnYouTubeComments(silent, true)).toBe(true);
    expect(restsOnYouTubeComments("not an object", true)).toBe(true);
  });

  it("copies a card that doesn't read, within limits, and keeps nothing without a finding", () => {
    const long = "An invented claim that runs on. ".repeat(100);
    const copy = unsavedCardCopy({
      question: "Does zentarine help?",
      "Not a field name": "kept nowhere",
      findings: [{ claim: long, certainty: "probably", numbers: [{ option_events: 3, option_total: 8 }], extra: { a: { b: "deep" } } }],
    }, false)!;
    const [finding] = copy.card.findings as Array<Record<string, unknown>>;
    expect((finding!.claim as string).length).toBe(2_000);
    expect(finding!.certainty).toBe("probably");
    expect(finding!.numbers).toEqual([{ option_events: 3, option_total: 8 }]);
    expect(copy.card).not.toHaveProperty("Not a field name");
    expect(copy.leftOut).toEqual(["findings[0].claim: too long, so cut"]);
    expect(copy.claims).toEqual([unsavedClaimKey(long)]);
    expect(unsavedCardCopy({ question: "Only a question" }, false)).toBeUndefined();
    expect(unsavedCardCopy({ findings: [] }, false)).toBeUndefined();
    expect(unsavedCardCopy("not a card", false)).toBeUndefined();
  });

  it("doesn't let an empty source garble the check's problems", () => {
    const copy = unsavedCardCopy({ findings: [{ claim: "An invented claim.", sources: ["", "abc"] }] }, false)!;
    expect(copy.sourcesLeftOut).toEqual([]);
    expect(unsavedCardProblems(["A problem."], copy.sourcesLeftOut)).toEqual(["A problem."]);
  });

  it("keeps a card's values and its list of what's left out within limits", () => {
    const numbers = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 1)));
    const copy = unsavedCardCopy({ findings: [{ claim: "An invented claim.", numbers }] }, false)!;
    expect(JSON.stringify(copy.card).length).toBeLessThan(10_000);
    const many = unsavedCardCopy({ findings: Array.from({ length: 20 }, () => ({
      claim: "An invented claim.", sources: Array.from({ length: 20 }, (_, index) => `not-an-identifier-${index}`),
    })) }, false)!;
    expect(many.leftOut).toHaveLength(50);
  });

  it("keeps a card's text within one limit, whatever it holds", () => {
    const finding = (index: number) => ({ claim: `${index} ${"long invented text ".repeat(200)}`,
      applies_to: "long invented text ".repeat(200), why_not_usual: "long invented text ".repeat(200),
      what_would_change_it: "long invented text ".repeat(200) });
    const copy = unsavedCardCopy({ findings: Array.from({ length: 30 }, (_, index) => finding(index)) }, false)!;
    expect(JSON.stringify(copy.card).length).toBeLessThan(45_000);
    expect(copy.leftOut).toContain("findings[9].applies_to: too long, so cut");
  });

  it("takes what was left out out of the check's problems, and leaves out a problem that fails the screen", () => {
    expect(unsavedCardProblems([
      "findings_card.findings[0].sources lists dQw4w9WgXcQ, which this call did not verify.",
      "findings_card.question looks like it holds jo.private@example.test.",
    ], ["dQw4w9WgXcQ"])).toEqual([
      "findings_card.findings[0].sources lists [left out], which this call did not verify.",
      "[left out] (direct_identifier)",
    ]);
  });

  it("reads a personal-only declaration from a card of any shape", () => {
    expect(declaredPersonalOnly({ public_value: { scope: "personal_only" } })).toBe(true);
    expect(declaredPersonalOnly({ public_value: { scope: "public" } })).toBe(false);
    expect(declaredPersonalOnly(undefined)).toBe(false);
  });
});

describe("keeping a card that wasn't saved", () => {
  it("files it privately, under its own label only, with why it stopped and the research thread's key", async () => {
    const github = new FakeGitHub();
    expect(await service(github).keepUnsaved(refused())).toEqual({ status: "kept", card_id: "ARF-0042" });
    const issue = github.issue(42);
    expect(issue.labels.map(({ name }) => name)).toEqual([UNSAVED_CARD_LABEL]);
    expect(issue.title).toBe(`Not saved: ${CARD.question}`);
    expect(issue.body).toContain("The final check refused this card.");
    expect(issue.body).toContain("did not verify");
    expect(issue.body).toContain(FINDING.claim);
    const [read] = await new GitHubFindingsReview({
      tokenProvider: { getToken: async () => "findings-token-fixture" },
      fetch: github.fetch,
      repository: DEFAULT_FINDINGS_REPOSITORY,
    }).repositoryIssues();
    expect(read!.unsaved).toMatchObject({
      thread: findingsThreadKey(SECRET, ALICE, researchTargetDigest(TARGET)),
      claims: [unsavedClaimKey(FINDING.claim)],
    });
    expect(read!.card).toBeUndefined();
  });

  it("writes nothing new for the same card, and files a changed one", async () => {
    const github = new FakeGitHub();
    const keep = service(github);
    await keep.keepUnsaved(refused());
    expect(await keep.keepUnsaved(refused())).toEqual({ status: "kept", card_id: "ARF-0042" });
    expect(github.issues).toHaveLength(1);
    await keep.keepUnsaved(refused({ card: { ...CARD, usual_answer: "A different usual answer." } }));
    expect(github.issues).toHaveLength(2);
  });

  it("is never read as a card", async () => {
    const github = new FakeGitHub();
    await service(github).keepUnsaved(refused());
    const inbox = new GitHubFindingsReview({
      tokenProvider: { getToken: async () => "findings-token-fixture" },
      fetch: github.fetch,
      repository: DEFAULT_FINDINGS_REPOSITORY,
    });
    expect(await inbox.openCards()).toEqual([]);
    expect(await inbox.readCard(42)).toEqual({ status: "not_found" });
    expect(github.issue(42).labels.map(({ name }) => name)).not.toContain(FINDINGS_CARD_LABEL);
  });

  it("closes once a later card from the same research carries every finding, and not otherwise", async () => {
    const github = new FakeGitHub();
    const queue = queueOf(github);
    const keep = service(github, { queue });
    const reworded = { ...FINDING, claim: "The same finding, in other words." };
    await keep.keepUnsaved(refused());
    await keep.keepUnsaved(refused({ card: { ...CARD, findings: [FINDING, reworded] } }));
    await keep.keepUnsaved(refused({ contributor: BOB, card: { ...CARD, usual_answer: "Another person's card." } }));
    const saved = await keep.save(saveInput(), CONTEXT);
    expect(saved).toMatchObject({ status: "saved" });
    await queue.settled();
    // Only the first copy has all its claims on the saved card, in the same research.
    expect(github.issue(42).state).toBe("closed");
    expect(github.issue(42).state_reason).toBe("completed");
    expect(github.comments.get(42)!.map(({ body }) => body).join("")).toContain("saved on ARF-0045");
    expect(github.issue(43).state).toBe("open");
    expect(github.issue(44).state).toBe("open");
  });

  it("still saves a card when the copies can't be read", async () => {
    const github = new FakeGitHub();
    github.failWhen = ({ method, url }) => method === "GET" && url.includes(UNSAVED_CARD_LABEL) ? 500 : undefined;
    const queue = queueOf(github);
    expect(await service(github, { queue }).save(saveInput(), CONTEXT)).toMatchObject({ status: "saved", card_id: "ARF-0042" });
    await queue.settled();
  });

  it("keeps nothing of a card declared personal only, or when it can't", async () => {
    const github = new FakeGitHub();
    const personal = { ...CARD, public_value: { scope: "personal_only" } };
    expect(await service(github).keepUnsaved(refused({ card: personal })))
      .toEqual({ status: "not_kept", reason: "personal_only" });
    expect(await service(github, { unsavedLimiter: refuse }).keepUnsaved(refused()))
      .toEqual({ status: "not_kept", reason: "rate_limited" });
    expect(await service(github).keepUnsaved(refused({ card: { question: "Only a question" } })))
      .toEqual({ status: "not_kept", reason: "nothing_to_keep" });
    expect(github.issues).toEqual([]);
    github.failWith = 500;
    expect(await service(github).keepUnsaved(refused()))
      .toEqual({ status: "not_kept", reason: "queue_service_unavailable" });
  });

  it("holds a finding resting on YouTube comments as a save would, outside the copy", async () => {
    const github = new FakeGitHub();
    const held: unknown[] = [];
    const keep = service(github, { held });
    const onComments = { ...FINDING, claim: "Commenters reported an invented effect.", draws_on_youtube_comments: true };
    await keep.keepUnsaved(refused({ card: { ...CARD, findings: [FINDING, onComments] } }));
    await keep.heldSettled();
    expect(held).toEqual([expect.objectContaining({
      question: CARD.question,
      findings: [expect.objectContaining({ findingNumber: 2, claim: onComments.claim })],
    })]);
    expect(github.issue(42).body).not.toContain(onComments.claim);
    expect(github.issue(42).body).toContain("rests on YouTube comments");
  });

  it("goes with its research when a card is forgotten, and its own id can ask for that", async () => {
    const github = new FakeGitHub();
    const queue = queueOf(github);
    const keep = service(github, { queue });
    await keep.keepUnsaved(refused({ card: { ...CARD, findings: [{ ...FINDING, claim: "Only on the copy." }] } }));
    await keep.keepUnsaved(refused({ contributor: BOB }));
    await keep.save(saveInput(), CONTEXT);
    await queue.settled();
    const inbox = new GitHubFindingsReview({
      tokenProvider: { getToken: async () => "findings-token-fixture" },
      fetch: github.fetch,
      repository: DEFAULT_FINDINGS_REPOSITORY,
    });
    const deps = { inbox, store: new InMemoryAtlasReviewStore() };
    const outcome = await forgetCard(deps, 44, NOW, { confirmed: false });
    expect(outcome.kind).toBe("done");
    expect(github.issue(42).body).not.toContain("Only on the copy.");
    expect(github.issue(42).state).toBe("closed");
    expect(github.issue(43).body).toContain(FINDING.claim);

    const named = await forgetCard(deps, 43, NOW, { confirmed: false });
    expect(named.kind).toBe("done");
    expect(github.issue(43).body).not.toContain(FINDING.claim);
  });
});
