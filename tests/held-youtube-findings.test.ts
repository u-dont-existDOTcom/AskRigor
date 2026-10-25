import { afterEach, describe, expect, it, vi } from "vitest";

// The package the tools import, so the stores and their errors are the ones the tools use.
import {
  HELD_YOUTUBE_FINDING_BASES,
  HELD_YOUTUBE_FINDING_TAGS,
  HELD_YOUTUBE_FINDINGS_MILLISECONDS,
  HeldYouTubeFindingsError,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPublicationStore,
  InMemoryAtlasReviewStore,
  InMemoryHeldYouTubeFindingsStore,
  PostgresHeldYouTubeFindingsStore,
  RESEARCH_USE_NOTICE_VERSION,
  heldYouTubeFindingExpiry,
  sha256,
  type HeldYouTubeFindingContent,
  type HeldYouTubeFindingsStore,
} from "@askrigor/evidence-repository";

import { AtlasCardPublisher } from "../apps/research-mcp/src/atlas/publication.js";
import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import { findingsSaveToolResult } from "../apps/research-mcp/src/findings/connector-tool.js";
import {
  FINDING_TAGS,
  VERIFIED_BASES,
  findingsCardDigest,
  findingsCardFingerprint,
  findingsCardSchema,
  heldYouTubeFindingOf,
  isYouTubeVideoId,
  withoutYouTubeData,
  type FindingsCard,
  type VerifiedBasis,
} from "../apps/research-mcp/src/findings/card.js";
import { GitHubFindingsReview, parseFindingsRecordBody } from "../apps/research-mcp/src/findings/github-findings-review.js";
import {
  GitHubFindingsQueue,
  cardIssueBody,
  occurrenceComment,
  type CardMetadata,
  type OccurrenceMetadata,
} from "../apps/research-mcp/src/findings/github-findings.js";
import {
  HELD_YOUTUBE_FINDINGS_PURGE_INTERVAL_MILLISECONDS,
  heldYouTubeFindingsStoresFromEnv,
  startHeldYouTubeFindingsPurge,
} from "../apps/research-mcp/src/findings/held-youtube-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import {
  FindingsSaveService,
  findingsThreadKey,
  type FindingsRecord,
  type FindingsSaveAccount,
} from "../apps/research-mcp/src/findings/service.js";
import { YOUTUBE_FINDINGS_NOT_SAVED } from "../apps/research-mcp/src/register-tools.js";
import {
  createResearchContributionReviewHandler,
  researchContributionReviewOutputSchema,
} from "../apps/research-mcp/src/research-contribution-review-tool.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { FakeGitHub, storedRecordOf } from "./helpers/fake-github-findings.js";
import { CARD } from "./helpers/findings-fixtures.js";

// Owner answer 173 (25 Oct 2026): the findings drawn from YouTube comments that a saved findings card leaves out (owner
// answer 170) are held apart from the card, in the database, for the 30 days YouTube's Developer Policies (III.E.4)
// allow, for the owner's review, and then deleted, with no refreshing. Hermetic: GitHub is in memory, the held store
// is migration 0019's semantics in memory, and every clock is injected.

const SECRET = "held-youtube-findings-test-secret-0123456789";
const OWNER = "auth0|held-youtube-findings-owner";
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);
const PROTOCOLS = [{ name: "HRP", version: "20.6.31", sha256: sha256("synthetic-hrp") }];
const PROVIDERS = {
  crossref: { mailto: "maintainer@example.test" },
  pubmed: { tool: "askrigor-tests", email: "maintainer@example.test" },
};
const DAY = 24 * 60 * 60 * 1_000;
const VIDEO = "aaaaaaaaaaa";
const OTHER_VIDEO = "bbbbbbbbbbb";
const STUDY = CARD.findings[0]!;

/**
 * A finding drawn from YouTube comments, as a model writes one: two videos among its sources, a link to one of them
 * and the other's bare link in its claim, a video's ID, a study's bare link and a link to a study in its other texts,
 * and a repeated tag.
 */
const YOUTUBE_FINDING = {
  ...STUDY,
  claim: "Commenters on two videos reported less hip pain after months of home exercise, as in " +
    "[this video](https://www.youtube.com/watch?v=aaaaaaaaaaa) and https://youtu.be/bbbbbbbbbbb.",
  applies_to: "Adults with hip osteoarthritis who exercise at home",
  answer_quote: "Commenters on two videos reported less hip pain after months of home exercise.",
  sources: ["10.1002/art.41142", VIDEO, OTHER_VIDEO],
  why_not_usual: "Quick answers leave out what people who kept exercising report, as on video aaaaaaaaaaa, unlike " +
    "https://doi.org/10.1002/art.41142.",
  tags: ["community_checked", "community_checked"],
  what_would_change_it: "Commenters on [a trial's page](https://doi.org/10.1002/art.41142) reporting no change.",
  subject: "Home exercise",
};
/** What the held findings keep of YOUTUBE_FINDING, as the card's first finding: no source, link, quote or video ID. */
const HELD_CONTENT: HeldYouTubeFindingContent = {
  findingNumber: 1,
  claim: "Commenters on two videos reported less hip pain after months of home exercise, as in this video " +
    "(YouTube video) and (YouTube video).",
  certainty: "moderate",
  appliesTo: "Adults with hip osteoarthritis who exercise at home",
  whyNotUsual: "Quick answers leave out what people who kept exercising report, as on video (video), unlike (link).",
  whatWouldChangeIt: "Commenters on a trial's page reporting no change.",
  kind: "effect",
  subject: "Home exercise",
  direction: "benefit",
  tags: ["community_checked"],
  verifiedBases: ["comment_audit"],
};
/** A card whose first finding rests on YouTube comments and whose second on a full-text audit. */
const MIXED_CARD = { ...CARD, findings: [YOUTUBE_FINDING, STUDY] };
const MIXED_BASES = ["comment_audit", "full_text_audit"];
/** A card whose only finding rests on YouTube comments, which is not saved as a card; its question holds a video's link. */
const YOUTUBE_ONLY_CARD = {
  ...CARD,
  question: "Does home exercise ease hip osteoarthritis pain, as in https://youtu.be/bbbbbbbbbbb?",
  findings: [YOUTUBE_FINDING],
};
/** What the held findings keep of that card: its question without the link, and its topic. */
const YOUTUBE_ONLY_QUESTION = "Does home exercise ease hip osteoarthritis pain, as in (YouTube video)?";
const TOPIC = { key: "hip-osteoarthritis", label: "Hip osteoarthritis" };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function owner(subject = OWNER, scopes = ["cases:review"]) {
  return {
    authInfo: {
      token: "synthetic-token",
      clientId: "synthetic-client",
      scopes,
      expiresAt: Math.floor(Date.now() / 1_000) + 600,
      extra: { subject },
    },
  };
}

interface Reply {
  isError: boolean;
  text: string;
  structured: Record<string, any>;
}

/** The library, GitHub, the review stores, the held store and the owner's tool, with one clock. */
function harness(options: {
  start?: string;
  held?: Pick<HeldYouTubeFindingsStore, "hold"> | null;
  reviewHeld?: HeldYouTubeFindingsStore | null;
  enabled?: boolean;
  /** Decision 171: the Atlas publications, for the save's publisher and the owner's tool. */
  publications?: InMemoryAtlasPublicationStore;
  /** The saving account, which the publisher reads. */
  account?: FindingsSaveAccount;
} = {}) {
  let instant = Date.parse(options.start ?? "2026-10-07T10:00:00.000Z");
  const clock = () => new Date(instant);
  const github = new FakeGitHub();
  const store = new InMemoryHeldYouTubeFindingsStore({ now: clock });
  const savingHeld = options.held === undefined ? store : options.held;
  const reviewHeld = options.reviewHeld === undefined ? store : options.reviewHeld;
  const tokenProvider = { getToken: async () => "synthetic-findings-token" };
  const library = new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    protocols: async () => PROTOCOLS,
    version: "0.1.0",
    build: "0123abc",
    now: clock,
    ...(savingHeld === null ? {} : { held: savingHeld }),
    ...(options.publications === undefined ? {} : {
      publisher: new AtlasCardPublisher({ store: options.publications, now: clock }),
    }),
  });
  const review = new InMemoryAtlasReviewStore();
  const atlas = new AtlasReview({
    store: review,
    reader: new InMemoryAtlasCanonicalStore({ now: () => clock().toISOString() }),
    inbox: new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    version: "0.1.0",
    build: "0123abc",
    protocols: async () => PROTOCOLS,
    now: clock,
    ...(reviewHeld === null ? {} : { held: reviewHeld }),
    ...(options.publications === undefined ? {} : { publications: options.publications }),
  });
  const handler = createResearchContributionReviewHandler({
    allowedReviewerSubjects: new Set([OWNER]),
    resourceMetadataUrl: new URL("https://mcp.askrigor.test/.well-known/oauth-protected-resource"),
    atlas: { enabled: options.enabled ?? true, review: atlas, providers: () => PROVIDERS },
  });
  return {
    github,
    store,
    review,
    library,
    clock,
    later: (milliseconds: number) => { instant += milliseconds; },
    async call(input: Record<string, unknown>, auth: unknown = owner()): Promise<Reply> {
      const result = await handler(input, auth as never);
      const structured = researchContributionReviewOutputSchema.parse(result.structuredContent) as Record<string, any>;
      expect(structured.canonicalEvidenceChangedByThisCall).toBe(false);
      return {
        isError: result.isError === true,
        text: (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n"),
        structured,
      };
    },
    async save(card: object, bases: string[], contributor = ALICE) {
      const parsed = findingsCardSchema.parse(card);
      return library.save({
        findings_card: card,
        contributor,
        finalization_receipt: issueResearchReceipt("finalization", {
          status: "ready", depth: "standard", target: "0123456789ab", findings: findingsCardDigest(parsed), bases,
        }, { secret: SECRET, now: clock }),
      }, {
        surface: "/mcp/claude",
        toolCatalogSha256: "c".repeat(64),
        ...(options.account === undefined ? {} : { account: options.account }),
      });
    },
  };
}

type Harness = ReturnType<typeof harness>;

const held = (finding: Partial<HeldYouTubeFindingContent> = {}): HeldYouTubeFindingContent => ({ ...HELD_CONTENT, ...finding });

describe("the held YouTube findings store (migration 0019's semantics)", () => {
  it("keeps the finding exactly 30 days from its save, and holding it again changes nothing (no refreshing)", async () => {
    let now = Date.parse("2026-10-07T10:00:00.000Z");
    const store = new InMemoryHeldYouTubeFindingsStore({ now: () => new Date(now) });
    const input = { cardNumber: 7, cardSha256: "a".repeat(64), savedAt: "2026-10-07T09:30:00.000Z", findings: [held()] };
    expect(await store.hold(input)).toEqual([{
      cardNumber: 7, cardSha256: "a".repeat(64), findingNumber: 1, savedAt: "2026-10-07T09:30:00.000Z",
      expiresAt: "2026-11-06T09:30:00.000Z", heldNow: true,
    }]);
    expect(heldYouTubeFindingExpiry("2026-10-07T09:30:00.000Z")).toBe("2026-11-06T09:30:00.000Z");
    expect(HELD_YOUTUBE_FINDINGS_MILLISECONDS).toBe(30 * DAY);
    // A later save of the same finding of the same checked card, on the same card, keeps the first expiry.
    now += 5 * DAY;
    expect(await store.hold({ ...input, savedAt: new Date(now).toISOString() })).toEqual([
      expect.objectContaining({ expiresAt: "2026-11-06T09:30:00.000Z", heldNow: false }),
    ]);
    expect(store.snapshot()).toHaveLength(1);
  });

  it("leaves out an expired finding from every read before any purge, and the purge deletes only expired ones", async () => {
    let now = Date.parse("2026-10-07T10:00:00.000Z");
    const store = new InMemoryHeldYouTubeFindingsStore({ now: () => new Date(now) });
    await store.hold({ cardNumber: 7, cardSha256: "a".repeat(64), savedAt: new Date(now).toISOString(), findings: [held()] });
    now += DAY;
    await store.hold({ cardNumber: 7, cardSha256: "b".repeat(64), savedAt: new Date(now).toISOString(), findings: [held()] });
    now = Date.parse("2026-11-06T10:00:00.000Z") - 1;
    expect((await store.inspect([7])).map(({ cardSha256 }) => cardSha256)).toEqual(["a".repeat(64), "b".repeat(64)]);
    // At its expiry, the first is no longer returned, though no purge has run.
    now += 1;
    expect((await store.inspect([7])).map(({ cardSha256 }) => cardSha256)).toEqual(["b".repeat(64)]);
    expect(store.snapshot()).toHaveLength(2);
    expect(await store.purgeExpired()).toBe(1);
    expect(store.snapshot().map(({ cardSha256 }) => cardSha256)).toEqual(["b".repeat(64)]);
    now += DAY;
    expect(await store.inspect([7])).toEqual([]);
    expect(await store.purgeExpired()).toBe(1);
    expect(store.snapshot()).toEqual([]);
  });

  it("never holds a finding already past 30 days, counts a save time ahead of its clock from now, and holds an expired one anew", async () => {
    let now = Date.parse("2026-10-07T10:00:00.000Z");
    const store = new InMemoryHeldYouTubeFindingsStore({ now: () => new Date(now) });
    const old = { cardNumber: 7, cardSha256: "a".repeat(64), savedAt: "2026-09-07T10:00:00.000Z", findings: [held()] };
    expect(await store.hold(old)).toEqual([]);
    expect(store.snapshot()).toEqual([]);
    expect(await store.hold({ ...old, cardNumber: 8, savedAt: "2026-12-31T00:00:00.000Z" })).toEqual([
      expect.objectContaining({ savedAt: "2026-10-07T10:00:00.000Z", expiresAt: "2026-11-06T10:00:00.000Z" }),
    ]);
    await store.hold({ ...old, cardNumber: 9, savedAt: "2026-10-07T10:00:00.000Z" });
    now = Date.parse("2026-11-08T10:00:00.000Z");
    expect(await store.hold({ ...old, cardNumber: 9, savedAt: "2026-11-08T10:00:00.000Z" })).toEqual([
      expect.objectContaining({ expiresAt: "2026-12-08T10:00:00.000Z", heldNow: true }),
    ]);
  });

  it("deletes a card's findings early, and only that card's", async () => {
    const store = new InMemoryHeldYouTubeFindingsStore({ now: () => new Date("2026-10-07T10:00:00.000Z") });
    for (const cardNumber of [7, 12]) {
      await store.hold({ cardNumber, cardSha256: "a".repeat(64), savedAt: "2026-10-07T10:00:00.000Z",
        findings: [held(), held({ findingNumber: 3 })] });
    }
    expect(await store.deleteForCards([7])).toBe(2);
    expect(await store.deleteForCards([7])).toBe(0);
    expect((await store.inspect([7, 12])).map(({ cardNumber, findingNumber }) => [cardNumber, findingNumber]))
      .toEqual([[12, 1], [12, 3]]);
  });

  it("holds a card-less save's findings with its question and topic for 30 days, apart from every saved card's", async () => {
    let now = Date.parse("2026-10-07T10:00:00.000Z");
    const store = new InMemoryHeldYouTubeFindingsStore({ now: () => new Date(now) });
    const older = { cardSha256: "a".repeat(64), savedAt: new Date(now).toISOString(), question: "Does home exercise help?",
      topic: TOPIC, findings: [held(), held({ findingNumber: 2 })] };
    expect(await store.hold(older)).toEqual([
      expect.objectContaining({ cardNumber: null, findingNumber: 1, expiresAt: "2026-11-06T10:00:00.000Z", heldNow: true }),
      expect.objectContaining({ cardNumber: null, findingNumber: 2, heldNow: true }),
    ]);
    // The same checked card saved as card 7 is another row; the card's reads and deletions never touch the card-less.
    await store.hold({ cardNumber: 7, cardSha256: "a".repeat(64), savedAt: new Date(now).toISOString(), findings: [held()] });
    now += DAY;
    await store.hold({ cardSha256: "b".repeat(64), savedAt: new Date(now).toISOString(), question: "Does walking help?",
      findings: [held()] });
    // No refreshing: the same save held again keeps its first expiry.
    expect(await store.hold({ ...older, savedAt: new Date(now).toISOString() })).toEqual([
      expect.objectContaining({ findingNumber: 1, expiresAt: "2026-11-06T10:00:00.000Z", heldNow: false }),
      expect.objectContaining({ findingNumber: 2, expiresAt: "2026-11-06T10:00:00.000Z", heldNow: false }),
    ]);
    expect((await store.inspectWithoutCard()).map(({ cardSha256, findingNumber, question, topic }) =>
      [cardSha256.charAt(0), findingNumber, question, topic ?? null])).toEqual([
      ["b", 1, "Does walking help?", null],
      ["a", 1, "Does home exercise help?", TOPIC],
      ["a", 2, "Does home exercise help?", TOPIC],
    ]);
    expect((await store.inspect([7])).map(({ cardNumber, question }) => [cardNumber, question ?? null])).toEqual([[7, null]]);
    // Deleted early by the save's checked card, and only that save's: never the saved card's row of the same checked
    // card, which the card's own deletion takes, leaving the card-less rows.
    expect(await store.deleteWithoutCard(["a".repeat(64)])).toBe(2);
    expect(await store.deleteWithoutCard(["a".repeat(64)])).toBe(0);
    expect((await store.inspect([7])).map(({ cardNumber }) => cardNumber)).toEqual([7]);
    expect(await store.deleteForCards([7])).toBe(1);
    expect((await store.inspectWithoutCard()).map(({ cardSha256 }) => cardSha256.charAt(0))).toEqual(["b"]);
    // Past its 30 days no read returns it, and the purge deletes it.
    now = Date.parse("2026-11-07T10:00:00.000Z");
    expect(await store.inspectWithoutCard()).toEqual([]);
    expect(store.snapshot()).toHaveLength(1);
    expect(await store.purgeExpired()).toBe(1);
    expect(store.snapshot()).toEqual([]);
  });

  it("takes only AskRigor's texts and fixed values: any other field, or a malformed call, is refused before the database", async () => {
    const memory = new InMemoryHeldYouTubeFindingsStore();
    // A store that never connects: the checks run before any query.
    const postgres = new PostgresHeldYouTubeFindingsStore({ connectionString: "postgresql://nobody@127.0.0.1:1/none" });
    const valid = { cardNumber: 7, cardSha256: "a".repeat(64), savedAt: new Date().toISOString(), findings: [held()] };
    try {
      for (const invalid of [
        { ...valid, findings: [{ ...held(), sources: [VIDEO] }] },
        { ...valid, findings: [{ ...held(), answerQuote: "A quote." }] },
        { ...valid, findings: [{ ...held(), thread: "f".repeat(64) }] },
        { ...valid, contributor: ALICE },
        { ...valid, findings: [held(), held()] },
        { ...valid, findings: [held({ tags: ["community_checked", "community_checked"] })] },
        { ...valid, findings: [held({ claim: "x".repeat(501) })] },
        { ...valid, findings: [1, 2, 3, 4, 5, 6].map((findingNumber) => held({ findingNumber: findingNumber % 5 + 1 })) },
        { ...valid, cardSha256: "A".repeat(64) },
        { ...valid, savedAt: "not a time" },
        // A saved card's findings carry no question or topic; a card-less save's carry its question, and a whole topic.
        { ...valid, question: "Does home exercise help?" },
        { ...valid, topic: TOPIC },
        { cardSha256: "a".repeat(64), savedAt: valid.savedAt, findings: [held()] },
        { cardSha256: "a".repeat(64), savedAt: valid.savedAt, question: "x".repeat(301), findings: [held()] },
        { cardSha256: "a".repeat(64), savedAt: valid.savedAt, question: "Q?", topic: { key: "Hip OA", label: "Hip" },
          findings: [held()] },
        { cardSha256: "a".repeat(64), savedAt: valid.savedAt, question: "Q?", topic: { key: "hip" }, findings: [held()] },
        { cardSha256: "a".repeat(64), savedAt: valid.savedAt, question: "Q?", findings: [held()], thread: "f".repeat(64) },
      ]) {
        for (const store of [memory, postgres]) {
          await expect(store.hold(invalid as never)).rejects.toBeInstanceOf(HeldYouTubeFindingsError);
        }
      }
      for (const cards of [[], [0], [1.5], Array.from({ length: 101 }, (_, index) => index + 1)]) {
        for (const store of [memory, postgres]) {
          await expect(store.inspect(cards)).rejects.toBeInstanceOf(HeldYouTubeFindingsError);
          await expect(store.deleteForCards(cards)).rejects.toBeInstanceOf(HeldYouTubeFindingsError);
        }
      }
      for (const digests of [[], ["A".repeat(64)], ["a".repeat(63)], Array.from({ length: 101 }, () => "a".repeat(64))]) {
        for (const store of [memory, postgres]) {
          await expect(store.deleteWithoutCard(digests)).rejects.toBeInstanceOf(HeldYouTubeFindingsError);
        }
      }
    } finally {
      await postgres.close();
    }
    // Its tags and bases are the card's own vocabulary, the community ones included.
    expect(HELD_YOUTUBE_FINDING_TAGS).toEqual(FINDING_TAGS);
    expect(HELD_YOUTUBE_FINDING_BASES).toEqual(VERIFIED_BASES);
  });
});

describe("what a held finding keeps, and what it never does", () => {
  it("keeps the claim, certainty, whom it applies to, why the usual answer misses it, what would change it, the kind, subject and direction, and its tags and bases", () => {
    const finding = findingsCardSchema.parse(MIXED_CARD).findings[0]!;
    const kept = heldYouTubeFindingOf(finding, 1, ["comment_audit"], [VIDEO, OTHER_VIDEO]);
    expect(kept).toEqual(HELD_CONTENT);
    // Never its sources (YouTube video IDs), its answer quote, a link, a video ID, the subject's type or the numbers.
    const text = JSON.stringify(kept);
    for (const never of [VIDEO, OTHER_VIDEO, "http", "youtube.com", "youtu.be", "doi.org", "10.1002/art.41142",
      YOUTUBE_FINDING.answer_quote, "practice", "numbers", "sources", "answer_quote", "subject_type"]) {
      expect(text).not.toContain(never);
    }
  });

  it("keeps each text within its field's length, and never empty", () => {
    const longest = { ...STUDY, claim: `${"x".repeat(488)} ${VIDEO}`, applies_to: "[](https://doi.org/10.1002/art.41142)" };
    const kept = heldYouTubeFindingOf(findingsCardSchema.parse({ ...CARD, findings: [longest] }).findings[0]!, 2,
      ["full_text_audit", "comment_audit"], [VIDEO]);
    expect(kept.claim).toBe(`${"x".repeat(488)} (video)`);
    expect(kept.appliesTo).toBe("(link)");
    expect(kept.verifiedBases).toEqual(["full_text_audit", "comment_audit"]);
  });
});

describe("the save path holds the findings a saved card leaves out", () => {
  it("holds each finding left out, under the card's number, the checked card's digest and its place, for exactly 30 days", async () => {
    const h = harness({ start: "2026-09-30T12:00:00.000Z" });
    await expect(h.save(MIXED_CARD, MIXED_BASES)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    await h.library.heldSettled();
    expect(h.store.snapshot()).toEqual([{
      ...HELD_CONTENT,
      cardNumber: 42,
      cardSha256: findingsCardDigest(findingsCardSchema.parse(MIXED_CARD)),
      savedAt: "2026-09-30T12:00:00.000Z",
      expiresAt: "2026-10-30T12:00:00.000Z",
    }]);
    // The card in GitHub holds only the other finding, as before (owner answer 170).
    const body = h.github.issue(42).body;
    const record = storedRecordOf(body) as FindingsRecord;
    expect(record.card.findings.map(({ claim }) => claim)).toEqual([STUDY.claim]);
    expect(record.stored_without).toEqual(["youtube_comment_findings"]);
    expect(body).not.toContain("Commenters on two videos");
    // Nothing that ties it to the person, or to YouTube, is held.
    const stored = JSON.stringify(h.store.snapshot());
    for (const never of [ALICE, findingsThreadKey(SECRET, ALICE, "0123456789ab"), VIDEO, OTHER_VIDEO, "http",
      YOUTUBE_FINDING.answer_quote]) {
      expect(stored).not.toContain(never);
    }
  });

  it("holds nothing when no finding is left out", async () => {
    const h = harness();
    await expect(h.save(CARD, ["full_text_audit"])).resolves.toMatchObject({ status: "saved" });
    await h.library.heldSettled();
    expect(h.store.snapshot()).toEqual([]);
  });

  it("saves no card when every finding rests on YouTube comments, and holds its findings with no card, its question and topic", async () => {
    const h = harness({ start: "2026-10-25T09:30:00.000Z" });
    await expect(h.save(YOUTUBE_ONLY_CARD, ["comment_audit"]))
      .resolves.toEqual({ status: "youtube_findings_only", retryable: false });
    await h.library.heldSettled();
    expect(h.github.writes).toEqual([]);
    expect(h.store.snapshot()).toEqual([{
      ...HELD_CONTENT,
      cardNumber: null,
      cardSha256: findingsCardDigest(findingsCardSchema.parse(YOUTUBE_ONLY_CARD)),
      question: YOUTUBE_ONLY_QUESTION,
      topic: TOPIC,
      savedAt: "2026-10-25T09:30:00.000Z",
      expiresAt: "2026-11-24T09:30:00.000Z",
    }]);
    // Never a source, link, video ID, the answer quote, the contributor or the thread key.
    const stored = JSON.stringify(h.store.snapshot());
    for (const never of [ALICE, findingsThreadKey(SECRET, ALICE, "0123456789ab"), VIDEO, OTHER_VIDEO, "http", "youtu",
      YOUTUBE_FINDING.answer_quote, CARD.usual_answer, CARD.public_value.who_else]) {
      expect(stored).not.toContain(never);
    }
  });

  it("does not refresh: the same findings saved again, from another thread, keep their first expiry", async () => {
    const h = harness();
    await h.save(MIXED_CARD, MIXED_BASES, ALICE);
    h.later(3 * DAY);
    await expect(h.save(MIXED_CARD, MIXED_BASES, BOB)).resolves.toMatchObject({ status: "existing_card", card_id: "ARF-0042" });
    await h.library.heldSettled();
    expect(h.store.snapshot().map(({ cardNumber, findingNumber, expiresAt }) => [cardNumber, findingNumber, expiresAt]))
      .toEqual([[42, 1, "2026-11-06T10:00:00.000Z"]]);
    // The later save's comment leaves the finding out too.
    const comment = h.github.comments.get(42)!.find(({ body }) => body.includes("askrigor-findings-occurrence"))!;
    expect((storedRecordOf(comment.body) as FindingsRecord).card.findings).toHaveLength(1);
  });

  it("never fails or delays the save when the held store fails, throws or never answers; the findings are then not kept", async () => {
    const reference = harness();
    await reference.save(MIXED_CARD, MIXED_BASES);
    const expected = storedRecordOf(reference.github.issue(42).body);
    for (const hold of [
      vi.fn(async () => { throw new Error("database unavailable"); }),
      vi.fn(() => { throw new Error("thrown at once"); }),
      vi.fn(() => new Promise<never>(() => undefined)),
    ]) {
      const h = harness({ held: { hold } as Pick<HeldYouTubeFindingsStore, "hold"> });
      let timer: NodeJS.Timeout | undefined;
      const saved = await Promise.race([
        h.save(MIXED_CARD, MIXED_BASES),
        new Promise((resolve) => { timer = setTimeout(() => resolve("timed out"), 1_000); }),
      ]);
      clearTimeout(timer);
      expect(saved).toEqual({ status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1 });
      expect(hold).toHaveBeenCalledTimes(1);
      expect(storedRecordOf(h.github.issue(42).body)).toEqual(expected);
      expect(h.store.snapshot()).toEqual([]);
      // A card not saved as a card answers as before too.
      const unsaved = await Promise.race([
        h.save(YOUTUBE_ONLY_CARD, ["comment_audit"]),
        new Promise((resolve) => { timer = setTimeout(() => resolve("timed out"), 1_000); }),
      ]);
      clearTimeout(timer);
      expect(unsaved).toEqual({ status: "youtube_findings_only", retryable: false });
      expect(hold).toHaveBeenCalledTimes(2);
    }
  });
});

describe("the hourly purge from the research server process", () => {
  it("purges at once and then every hour, through each store once, and a failing store never stops it", async () => {
    const calls: string[] = [];
    const access = { purgeExpired: vi.fn(async () => { calls.push("access"); return 0; }) };
    const review = { purgeExpired: vi.fn(async () => { calls.push("review"); throw new Error("database unavailable"); }) };
    let tick: (() => void) | undefined;
    let every: number | undefined;
    let unref = false;
    let cleared = false;
    const purge = startHeldYouTubeFindingsPurge([access, undefined, review, access], {
      setInterval: (callback, milliseconds) => {
        tick = callback;
        every = milliseconds;
        return { unref: () => { unref = true; } };
      },
      clearInterval: () => { cleared = true; },
    });
    await purge.settled();
    expect(calls).toEqual(["access", "review"]);
    expect(every).toBe(HELD_YOUTUBE_FINDINGS_PURGE_INTERVAL_MILLISECONDS);
    expect(HELD_YOUTUBE_FINDINGS_PURGE_INTERVAL_MILLISECONDS).toBe(60 * 60 * 1_000);
    expect(unref).toBe(true);
    tick!();
    await purge.settled();
    expect(calls).toEqual(["access", "review", "access", "review"]);
    purge.stop();
    expect(cleared).toBe(true);
    // With no store configured, there is nothing to purge and no timer.
    const none = startHeldYouTubeFindingsPurge([undefined, undefined], { setInterval: () => { throw new Error("no timer"); } });
    none.stop();
  });

  it("deletes a held finding at the first hourly purge after its 30 days end", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T10:20:00.000Z") });
    const store = new InMemoryHeldYouTubeFindingsStore();
    await store.hold({ cardNumber: 7, cardSha256: "a".repeat(64), savedAt: new Date().toISOString(), findings: [held()] });
    const purge = startHeldYouTubeFindingsPurge([store]);
    try {
      await vi.advanceTimersByTimeAsync(30 * DAY - 30 * 60 * 1_000);
      expect(store.snapshot()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
      expect(store.snapshot()).toEqual([]);
    } finally {
      purge.stop();
    }
  });

  it("makes a held store for each role the environment configures, and none for one that does not read", async () => {
    expect(heldYouTubeFindingsStoresFromEnv({})).toEqual({});
    expect(heldYouTubeFindingsStoresFromEnv({ ASKRIGOR_RESEARCH_ACCESS_ENABLED: "true" })).toEqual({});
    const stores = heldYouTubeFindingsStoresFromEnv({
      ASKRIGOR_RESEARCH_REVIEW_ENABLED: "true",
      ASKRIGOR_RESEARCH_REVIEW_DATABASE_URL: "postgresql://askrigor_research_review:synthetic@127.0.0.1:1/none",
    });
    expect(stores.access).toBeUndefined();
    expect(stores.review).toBeInstanceOf(PostgresHeldYouTubeFindingsStore);
    await (stores.review as PostgresHeldYouTubeFindingsStore).close();
  });
});

describe("the owner's review of held YouTube findings", () => {
  it("lists a card's held findings on its view with the day each is deleted, never as an item a decision can take", async () => {
    const h = harness();
    await h.save(MIXED_CARD, MIXED_BASES);
    await h.library.heldSettled();
    const view = await h.call({ action: "inspect_finding", card: "ARF-0042" });
    expect(view.isError).toBe(false);
    expect(view.structured.card.items.map(({ item, number }: { item: string; number: number }) => [item, number]))
      .toEqual([["finding", 1], ["lead", 1]]);
    expect(view.structured.card.heldYoutubeFindings).toEqual([{
      finding: 1,
      claim: HELD_CONTENT.claim,
      certainty: "moderate",
      appliesTo: HELD_CONTENT.appliesTo,
      whyNotUsual: HELD_CONTENT.whyNotUsual,
      whatWouldChangeIt: HELD_CONTENT.whatWouldChangeIt,
      kind: "effect",
      subject: "Home exercise",
      direction: "benefit",
      tags: ["community_checked"],
      bases: ["comment_audit"],
      savedOn: "2026-10-07",
      deletedOn: "2026-11-06",
    }]);
    expect(view.text).toContain("Held YouTube findings, kept apart from the card for your review: never decided, " +
      "accepted or published, and deleted 30 days after their save.");
    expect(view.text).toContain("  Finding 1 of the card as checked, saved 7 Oct 2026: Commenters on two videos");
    expect(view.text).toContain("-> deleted on 6 Nov 2026.");
    // Accepting a finding never takes one from the hold: the card has one finding, and no other.
    const sha = view.structured.card.cardSha256 as string;
    const accept = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 2, cardSha256: sha });
    expect(accept.structured.error).toEqual({ code: "item_not_found", message: "ARF-0042 has no finding 2." });
    const reject = await h.call({ action: "reject_finding", card: "ARF-0042", finding: 2, reason: "Held finding." });
    expect(reject.structured.error?.code).toBe("item_not_found");
    const listed = await h.call({ action: "list_findings" });
    expect(JSON.stringify(listed.structured.findings)).not.toContain("Commenters on two videos");
    expect(await h.review.inspectIntents(null)).toEqual([]);
  });

  it("shows nothing past 30 days, before any purge, and says when the held findings cannot be read", async () => {
    const h = harness();
    await h.save(MIXED_CARD, MIXED_BASES);
    await h.library.heldSettled();
    h.later(30 * DAY);
    const expired = await h.call({ action: "inspect_finding", card: "ARF-0042" });
    expect(expired.structured.card.heldYoutubeFindings).toEqual([]);
    expect(expired.text).not.toContain("Held YouTube findings");
    expect(h.store.snapshot()).toHaveLength(1);

    const broken = new InMemoryHeldYouTubeFindingsStore();
    broken.inspect = async () => { throw new Error("database unavailable"); };
    const unread = harness({ reviewHeld: broken });
    await unread.save(MIXED_CARD, MIXED_BASES);
    const view = await unread.call({ action: "inspect_finding", card: "ARF-0042" });
    expect(view.isError).toBe(false);
    expect(view.structured.card.heldYoutubeFindings).toBeNull();
    expect(view.text).toContain("Its held YouTube findings could not be read just now.");
  });

  it("deletes a card's held findings early with delete_youtube_findings", async () => {
    const h = harness();
    await h.save(MIXED_CARD, MIXED_BASES);
    await h.library.heldSettled();
    const deleted = await h.call({ action: "delete_youtube_findings", card: "arf-0042" });
    expect(deleted.structured).toMatchObject({
      ok: true,
      outcome: "youtube_findings_deleted",
      youtubeFindings: {
        cards: [{ card: "ARF-0042", status: "deleted", held: [], deleted: 1, cardRewritten: false,
          laterSavesRewritten: 0, laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [] }],
        ownerSteps: [],
      },
    });
    expect(deleted.text).toBe("Deleted ARF-0042's held YouTube finding now, before its 30 days ended.");
    expect(h.store.snapshot()).toEqual([]);
    const again = await h.call({ action: "delete_youtube_findings", card: "ARF-0042" });
    expect(again.text).toBe("ARF-0042 has no held YouTube findings: none were held, or their 30 days ended, or they " +
      "were deleted already. Nothing was deleted.");
  });

  it("deletes a card's held findings with the card when its contributor asks to forget it", async () => {
    const h = harness();
    await h.save(MIXED_CARD, MIXED_BASES);
    await h.library.heldSettled();
    const forgotten = await h.call({ action: "forget_card", card: "ARF-0042" });
    expect(forgotten.structured.forget).toMatchObject({ card: "ARF-0042", youtubeFindingsDeleted: 1 });
    expect(forgotten.text).toContain("Its 1 held YouTube finding is deleted too.");
    expect(h.store.snapshot()).toEqual([]);
  });

  it("lists the held findings with no card, newest first, with each card's question, topic and deletion day, and deletes one early", async () => {
    const h = harness({ start: "2026-10-25T09:30:00.000Z" });
    await h.save(YOUTUBE_ONLY_CARD, ["comment_audit"]);
    h.later(2 * DAY);
    const { topic: _topic, ...withoutTopic } = YOUTUBE_ONLY_CARD;
    const later = { ...withoutTopic, question: "Does walking ease knee osteoarthritis pain?" };
    await h.save(later, ["comment_audit"]);
    await h.library.heldSettled();
    const listed = await h.call({ action: "list_youtube_findings" });
    expect(listed.isError).toBe(false);
    const older = findingsCardDigest(findingsCardSchema.parse(YOUTUBE_ONLY_CARD));
    const newer = findingsCardDigest(findingsCardSchema.parse(later));
    const view = (savedOn: string, deletedOn: string) => ({
      finding: 1, claim: HELD_CONTENT.claim, certainty: "moderate", appliesTo: HELD_CONTENT.appliesTo,
      whyNotUsual: HELD_CONTENT.whyNotUsual, whatWouldChangeIt: HELD_CONTENT.whatWouldChangeIt, kind: "effect",
      subject: "Home exercise", direction: "benefit", tags: ["community_checked"], bases: ["comment_audit"], savedOn,
      deletedOn,
    });
    expect(listed.structured).toMatchObject({ ok: true, outcome: "youtube_findings_listed" });
    expect(listed.structured.heldWithoutCard).toEqual({
      saves: [
        { cardSha256: newer, question: "Does walking ease knee osteoarthritis pain?", topic: null, savedOn: "2026-10-27",
          deletedOn: "2026-11-26", findings: [view("2026-10-27", "2026-11-26")] },
        { cardSha256: older, question: YOUTUBE_ONLY_QUESTION, topic: TOPIC, savedOn: "2026-10-25", deletedOn: "2026-11-24",
          findings: [view("2026-10-25", "2026-11-24")] },
      ],
      moreNotShown: false,
      deleted: null,
    });
    expect(listed.text).toContain(`${newer}, saved 27 Oct 2026, deleted on 26 Nov 2026: Does walking ease knee ` +
      "osteoarthritis pain?");
    expect(listed.text).toContain(`${older}, saved 25 Oct 2026, deleted on 24 Nov 2026: ${YOUTUBE_ONLY_QUESTION} ` +
      "[Hip osteoarthritis (hip-osteoarthritis)]");
    expect(listed.text).toContain("  Finding 1: Commenters on two videos reported less hip pain");
    // They are no card's, so no card view or list of cards shows them.
    expect((await h.call({ action: "list_findings" })).structured.findings.cards).toEqual([]);

    const deleted = await h.call({ action: "delete_youtube_findings", cardSha256: older });
    expect(deleted.structured).toMatchObject({ ok: true, outcome: "youtube_findings_deleted",
      heldWithoutCard: { saves: [], moreNotShown: false, deleted: 1 } });
    expect(deleted.text).toBe(`Deleted the held YouTube finding with no card under ${older} now, before its 30 days ended.`);
    expect((await h.call({ action: "list_youtube_findings" })).structured.heldWithoutCard.saves
      .map(({ cardSha256 }: { cardSha256: string }) => cardSha256)).toEqual([newer]);
    // Past its 30 days, before any purge, it is listed no more; the purge then deletes it.
    h.later(30 * DAY);
    const expired = await h.call({ action: "list_youtube_findings" });
    expect(expired.structured.heldWithoutCard.saves).toEqual([]);
    expect(expired.text).toBe("No YouTube findings are held without a card.");
    expect(h.store.snapshot()).toHaveLength(1);
    expect(await h.store.purgeExpired()).toBe(1);
    const gone = await h.call({ action: "delete_youtube_findings", cardSha256: newer });
    expect(gone.text).toBe(`No YouTube findings are held without a card under ${newer}: none were held, or their 30 days ` +
      "ended, or they were deleted already. Nothing was deleted.");
  });

  it("checks the owner and the switch on every held-findings action, and each action's input", async () => {
    const h = harness();
    await h.save(MIXED_CARD, MIXED_BASES);
    await h.library.heldSettled();
    for (const input of [
      { action: "delete_youtube_findings", card: "ARF-0042" },
      { action: "delete_youtube_findings", cardSha256: "a".repeat(64) },
      { action: "list_youtube_findings" },
      { action: "move_youtube_findings", cards: ["ARF-0042"] },
    ]) {
      expect((await h.call(input, {})).structured.error?.code).toBe("authorization_required");
      expect((await h.call(input, owner("auth0|someone-else"))).structured.error?.code).toBe("insufficient_scope");
      expect((await h.call(input, owner(OWNER, ["research:use"]))).structured.error?.code).toBe("insufficient_scope");
      expect((await harness({ enabled: false }).call(input)).structured.error?.code).toBe("atlas_review_closed");
      const unconfigured = await harness({ reviewHeld: null }).call(input);
      expect(unconfigured.structured.error?.code).toBe("review_service_unavailable");
      expect(unconfigured.text).toContain("The held YouTube findings are not configured");
    }
    for (const input of [
      { action: "delete_youtube_findings" },
      { action: "delete_youtube_findings", cards: ["ARF-0042"] },
      { action: "delete_youtube_findings", card: "ARF-0042", finding: 1 },
      { action: "move_youtube_findings" },
      { action: "move_youtube_findings", card: "ARF-0042" },
      { action: "move_youtube_findings", cards: [] },
      { action: "move_youtube_findings", cards: ["F-1001"] },
      { action: "move_youtube_findings", cards: ["ARF-0042"], confirm: true },
      { action: "forget_card", cards: ["ARF-0042"] },
      { action: "delete_youtube_findings", card: "ARF-0042", cardSha256: "a".repeat(64) },
      { action: "delete_youtube_findings", cardSha256: "not a digest" },
      { action: "list_youtube_findings", card: "ARF-0042" },
      { action: "list_youtube_findings", cursor: "abc" },
    ]) {
      const refused = await h.call(input);
      expect(refused.structured.error?.code, JSON.stringify(input)).toBe("invalid_request");
    }
    // Refused calls changed nothing.
    expect(h.store.snapshot()).toHaveLength(1);
  });
});

/** A finding's sources as a card stored before owner answer 170 kept it: video IDs counted, not named. */
function storedBeforeSeventy(checked: FindingsCard, bases: VerifiedBasis[][]) {
  return {
    ...checked,
    findings: checked.findings.map(({ sources, ...finding }, index) => {
      const videos = sources.filter(isYouTubeVideoId).length;
      return {
        ...finding,
        sources: sources.filter((source) => !isYouTubeVideoId(source)),
        ...(videos === 0 ? {} : { youtube_videos: videos }),
        ...(bases[index]!.length === 0 ? {} : { verified_bases: bases[index]! }),
      };
    }),
  };
}

function stamp(savedAt: string): FindingsRecord["stamp"] {
  return {
    saved_at: savedAt,
    askrigor_version: "0.1.0",
    askrigor_build: "0123abc",
    protocols: PROTOCOLS,
    tool_catalog_sha256: "c".repeat(64),
    surface: "/mcp/claude",
    research: { finalized_at: savedAt, depth: "standard", status: "ready" },
  };
}

/** A card the library stored before it left findings out (owner answer 170), with its record and marker. */
function storeCardBeforeSeventy(github: FakeGitHub, number: number, card: object, bases: VerifiedBasis[][], savedAt: string) {
  const checked = findingsCardSchema.parse(card);
  const record: FindingsRecord = {
    schema: "askrigor.findings-card.v1",
    card: storedBeforeSeventy(checked, bases),
    card_sha256: findingsCardDigest(checked),
    stored_without: ["youtube_video_ids_and_links"],
    stamp: stamp(savedAt),
  };
  const metadata: CardMetadata = {
    fingerprint: findingsCardFingerprint(checked), receipt_sha256: "e".repeat(64), saved_at: savedAt,
    thread: "f".repeat(64),
  };
  github.issues.push({
    number, title: checked.question, body: cardIssueBody(record, metadata), state: "open",
    labels: [{ name: "findings-card" }, { name: "pending-review" }, { name: "beyond-quick-answer" }],
  });
  return { checked, record, metadata };
}

/** The card a save today of the same checked card, with the same bases signed, stores (findings/service.ts). */
function storedToday(checked: FindingsCard, bases: VerifiedBasis[][]) {
  const drawn = new Set(bases.flatMap((signed, index) => signed.includes("comment_audit") ? [index] : []));
  const stored = withoutYouTubeData(checked, drawn);
  return {
    card: {
      ...stored.card,
      findings: stored.card.findings.map((finding, index) => {
        const signed = bases[stored.kept[index]!]!;
        return signed.length === 0 ? finding : { ...finding, verified_bases: signed };
      }),
    },
    stored_without: [
      ...(stored.omitted ? ["youtube_video_ids_and_links" as const] : []),
      ...(stored.findingsLeftOut > 0 ? ["youtube_comment_findings" as const] : []),
    ],
  };
}

describe("move_youtube_findings: cards stored before findings were left out", () => {
  const BASES: VerifiedBasis[][] = [["full_text_audit"], ["comment_audit"]];
  const FROM_AUDIT = { ...STUDY, claim: "People who kept exercising in the comments of one video reported walking further.",
    sources: ["10.1002/art.41142"], tags: [] };
  // ARF-0007, saved on 7 Oct: the study finding, then one resting on a comment audit.
  const SEVEN = { ...CARD, findings: [STUDY, FROM_AUDIT] };

  it.each(["unreviewed", "owner_unpublished", "card_set_aside", "card_replaced"] as const)(
    "changes nothing when the card has publications (%s), even for findings before the first one removed",
    async (state) => {
      const publications = new InMemoryAtlasPublicationStore();
      const h = harness({ start: "2026-10-25T09:00:00.000Z", publications });
      const { record, metadata } = storeCardBeforeSeventy(h.github, 7, {
        ...CARD, findings: [STUDY, FROM_AUDIT, { ...STUDY, claim: "Another synthetic study finding." }],
      }, [["full_text_audit"], ["comment_audit"], ["full_text_audit"]], "2026-10-07T08:15:00.000Z");
      // A later save would also be rewritten: refusal must leave both it and the original card untouched.
      const laterMetadata: OccurrenceMetadata = { ...metadata, occurrence_count: 2 };
      h.github.comments.set(7, [{ id: 501, body: occurrenceComment(record, laterMetadata) }]);
      const published = await h.call({ action: "publish_cards", cards: ["ARF-0007"] });
      expect(published.structured.publications.items.map(({ finding }: { finding: number }) => finding)).toEqual([1, 3]);
      if (state !== "unreviewed") {
        await publications.withdraw(state === "owner_unpublished" ? {
          reason: state, publicationNumbers: ["P-1001", "P-1002"], ownerReason: "A synthetic withdrawal.",
          withdrawnAt: h.clock().toISOString(),
        } : { reason: state, cardNumbers: [7], withdrawnAt: h.clock().toISOString() });
      }
      const rows = await publications.inspect({});
      expect(rows.every((row) => row.state === (state === "unreviewed" ? "unreviewed" : "withdrawn"))).toBe(true);
      const issues = structuredClone(h.github.issues);
      const comments = structuredClone(h.github.comments);
      const writes = structuredClone(h.github.writes);
      const hold = vi.spyOn(h.store, "hold");

      const moved = await h.call({ action: "move_youtube_findings", cards: ["ARF-0007"] });
      expect(moved.isError).toBe(false);
      expect(moved.structured.youtubeFindings).toEqual({
        cards: [{ card: "ARF-0007", status: "published_in_the_way", held: [], deleted: 0, cardRewritten: false,
          laterSavesRewritten: 0, laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [1, 3] }],
        ownerSteps: [],
      });
      expect(moved.text).toContain("ARF-0007 has publications for findings 1 and 3, which name findings by their " +
        "place on the card, even after withdrawal; nothing was changed.");
      expect(hold).not.toHaveBeenCalled();
      expect(h.store.snapshot()).toEqual([]);
      expect(h.github.issues).toEqual(issues);
      expect(h.github.comments).toEqual(comments);
      expect(h.github.writes).toEqual(writes);
      expect(await publications.inspect({})).toEqual(rows);
    },
  );

  it.each([false, true])("moves as before when publications are configured but none remain except forgotten cards (%s)", async (forgotten) => {
    const publications = new InMemoryAtlasPublicationStore();
    const h = harness({ start: "2026-10-25T09:00:00.000Z", publications });
    const { checked, record, metadata } = storeCardBeforeSeventy(h.github, 7, SEVEN, BASES, "2026-10-07T08:15:00.000Z");
    if (forgotten) {
      await h.call({ action: "publish_cards", cards: ["ARF-0007"] });
      // Accepted rows retain that state when forgotten, so the exemption must use cardForgottenAt.
      await publications.decide({ cardNumber: 7, findingNumber: 1, state: "accepted", atlasNumber: "F-1001",
        decidedAt: h.clock().toISOString() });
      await publications.withdraw({ reason: "card_forgotten", cardNumbers: [7], withdrawnAt: h.clock().toISOString() });
    }
    const rows = await publications.inspect({});
    expect(rows).toHaveLength(forgotten ? 1 : 0);
    expect(rows.every((row) => row.cardForgottenAt !== null)).toBe(true);

    const moved = await h.call({ action: "move_youtube_findings", cards: ["ARF-0007"] });
    expect(moved.structured.youtubeFindings.cards[0]).toMatchObject({
      status: "moved", held: [{ finding: 2, save: "card", deletedOn: "2026-11-06" }],
      cardRewritten: true, publishedFindings: [],
    });
    const today = storedToday(checked, BASES);
    expect(h.github.issue(7).body).toBe(cardIssueBody({ ...record, card: today.card,
      stored_without: today.stored_without }, metadata));
    expect(h.store.snapshot()).toHaveLength(1);
    expect(await publications.inspect({})).toEqual(rows);
  });

  it("changes nothing if the configured publication store cannot be read", async () => {
    const publications = new InMemoryAtlasPublicationStore();
    const h = harness({ start: "2026-10-25T09:00:00.000Z", publications });
    storeCardBeforeSeventy(h.github, 7, SEVEN, BASES, "2026-10-07T08:15:00.000Z");
    const body = h.github.issue(7).body;
    vi.spyOn(publications, "inspect").mockRejectedValue(new Error("database unavailable"));
    const moved = await h.call({ action: "move_youtube_findings", cards: ["ARF-0007"] });
    expect(moved.structured.youtubeFindings.cards[0]).toMatchObject({ status: "incomplete", held: [], cardRewritten: false });
    expect(h.github.issue(7).body).toBe(body);
    expect(h.github.writes).toEqual([]);
    expect(h.store.snapshot()).toEqual([]);
  });

  it("moves them into the hold from the card's own save time and rewrites the card exactly as a card saved today would read", async () => {
    const h = harness({ start: "2026-10-25T09:00:00.000Z" });
    const { checked, metadata, record } = storeCardBeforeSeventy(h.github, 7, SEVEN, BASES, "2026-10-07T08:15:00.000Z");
    const moved = await h.call({ action: "move_youtube_findings", cards: ["arf-0007"] });
    expect(moved.structured).toMatchObject({
      ok: true,
      outcome: "youtube_findings_moved",
      youtubeFindings: {
        cards: [{ card: "ARF-0007", status: "moved", held: [{ finding: 2, save: "card", deletedOn: "2026-11-06" }],
          deleted: 0, cardRewritten: true, laterSavesRewritten: 0, laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [] }],
      },
    });
    expect(moved.text).toContain("ARF-0007: moved 1 finding drawn from YouTube comments into the 30-day hold " +
      "(deleted on 6 Nov 2026). The card now reads as saved today without them.");
    expect(moved.structured.youtubeFindings.ownerSteps).toEqual([
      "GitHub keeps each rewritten card's earlier text in its edit history. On each card below, open the edited menu " +
        "at the top of the description (and of each rewritten later save), and delete every earlier revision from " +
        "the history: https://github.com/u-dont-existDOTcom/AskRigor-findings/issues/7.",
    ]);
    // The body a save today would write, under the card's own marker and stamp: byte for byte.
    const today = storedToday(checked, BASES);
    const expected: FindingsRecord = {
      schema: "askrigor.findings-card.v1", card: today.card, card_sha256: record.card_sha256,
      stored_without: today.stored_without, stamp: record.stamp,
    };
    expect(today.stored_without).toEqual(["youtube_comment_findings"]);
    expect(h.github.issue(7).body).toBe(cardIssueBody(expected, metadata));
    expect(parseFindingsRecordBody(h.github.issue(7).body, "card")).toEqual({ record: expected, metadata });
    // The finding kept keeps its signed basis.
    expect(expected.card.findings).toEqual([expect.objectContaining({ claim: STUDY.claim, verified_bases: ["full_text_audit"] })]);
    // Held from the card's own save: 7 Oct 08:15, deleted 6 Nov 08:15.
    expect(h.store.snapshot()).toEqual([{
      ...heldYouTubeFindingOf(record.card.findings[1]!, 2, ["comment_audit"]),
      cardNumber: 7, cardSha256: record.card_sha256, savedAt: "2026-10-07T08:15:00.000Z",
      expiresAt: "2026-11-06T08:15:00.000Z",
    }]);
    // The review tool still reads the card, and lists the moved finding with the day it goes.
    const view = await h.call({ action: "inspect_finding", card: "ARF-0007" });
    expect(view.isError).toBe(false);
    expect(view.structured.card.items.filter(({ item }: { item: string }) => item === "finding")).toHaveLength(1);
    expect(view.structured.card.heldYoutubeFindings).toEqual([expect.objectContaining({ finding: 2, deletedOn: "2026-11-06" })]);
    // Once moved, there is nothing left to move.
    const again = await h.call({ action: "move_youtube_findings", cards: ["ARF-0007"] });
    expect(again.structured.youtubeFindings.cards[0]).toMatchObject({ status: "nothing_to_move", held: [] });
    expect(again.structured.youtubeFindings.ownerSteps).toEqual([]);
  });

  it("deletes a finding already past 30 days rather than moving it, and still takes it out of the card", async () => {
    const h = harness({ start: "2026-10-25T09:00:00.000Z" });
    storeCardBeforeSeventy(h.github, 5, SEVEN, BASES, "2026-09-20T08:00:00.000Z");
    const hold = vi.spyOn(h.store, "hold");
    const moved = await h.call({ action: "move_youtube_findings", cards: ["ARF-0005"] });
    // The store is not even asked to hold it (and would refuse to).
    expect(hold).not.toHaveBeenCalled();
    expect(moved.structured.youtubeFindings.cards).toEqual([{ card: "ARF-0005", status: "moved", held: [], deleted: 1,
      cardRewritten: true, laterSavesRewritten: 0, laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [] }]);
    expect(moved.text).toContain("ARF-0005: deleted 1 finding whose 30 days had ended.");
    expect(h.store.snapshot()).toEqual([]);
    expect((storedRecordOf(h.github.issue(5).body) as FindingsRecord).card.findings.map(({ claim }) => claim))
      .toEqual([STUDY.claim]);
  });

  it("moves the findings of later saves too, deleting a later save left with none, and reports each card", async () => {
    const h = harness({ start: "2026-10-25T09:00:00.000Z" });
    // ARF-0012: a video among the sources of its first finding (counted as youtube_videos once stored).
    const twelve = { ...CARD, findings: [{ ...YOUTUBE_FINDING, claim: "Commenters reported less pain.", why_not_usual: "Missed.",
      what_would_change_it: "Commenters reporting no change." }, STUDY] };
    const card = storeCardBeforeSeventy(h.github, 12, twelve, [["comment_audit"], ["full_text_audit"]],
      "2026-10-07T11:00:00.000Z");
    // Two later saves of the same question and claims: one whose second finding rests on a study, one whose
    // findings both rest on YouTube comments in that save.
    const laterSave = (body: object, bases: VerifiedBasis[][], savedAt: string, count: number) => {
      const checked = findingsCardSchema.parse(body);
      const record: FindingsRecord = {
        schema: "askrigor.findings-card.v1", card: storedBeforeSeventy(checked, bases),
        card_sha256: findingsCardDigest(checked), stored_without: ["youtube_video_ids_and_links"], stamp: stamp(savedAt),
      };
      const metadata: OccurrenceMetadata = {
        fingerprint: card.metadata.fingerprint, receipt_sha256: count.toString(16).repeat(64), saved_at: savedAt,
        thread: (count + 2).toString(16).repeat(64), occurrence_count: count,
      };
      return { record, metadata, body: occurrenceComment(record, metadata) };
    };
    // Another wording of the usual answer: the same question and claims, another checked card.
    const kept = laterSave({ ...twelve, usual_answer: "Exercise may ease pain a little, for a while." },
      [["comment_audit"], ["full_text_audit"]], "2026-10-10T11:00:00.000Z", 2);
    const allYouTube = laterSave({ ...twelve, findings: [twelve.findings[0], { ...STUDY, tags: ["community_checked"] }] },
      [["comment_audit"], []], "2026-10-12T11:00:00.000Z", 3);
    h.github.comments.set(12, [{ id: 501, body: kept.body }, { id: 502, body: allYouTube.body }]);
    // ARF-0209, saved on 23 Oct with nothing from YouTube comments; ARF-0099 is no card.
    storeCardBeforeSeventy(h.github, 209, CARD, [["full_text_audit"]], "2026-10-23T16:00:00.000Z");
    const untouched = h.github.issue(209).body;

    const moved = await h.call({ action: "move_youtube_findings", cards: ["ARF-0012", "ARF-0209", "ARF-0099", "ARF-0012"] });
    expect(moved.structured.youtubeFindings.cards).toEqual([
      { card: "ARF-0012", status: "moved", held: [
        { finding: 1, save: "card", deletedOn: "2026-11-06" },
        { finding: 1, save: "later_save", deletedOn: "2026-11-09" },
        { finding: 1, save: "later_save", deletedOn: "2026-11-11" },
        { finding: 2, save: "later_save", deletedOn: "2026-11-11" },
      ], deleted: 0, cardRewritten: true, laterSavesRewritten: 1, laterSavesDeleted: 1, decidedFindings: [], publishedFindings: [] },
      { card: "ARF-0209", status: "nothing_to_move", held: [], deleted: 0, cardRewritten: false, laterSavesRewritten: 0,
        laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [] },
      { card: "ARF-0099", status: "not_found", held: [], deleted: 0, cardRewritten: false, laterSavesRewritten: 0,
        laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [] },
    ]);
    expect(moved.text).toContain("ARF-0209 holds no finding drawn from YouTube comments; nothing was changed.");
    expect(moved.text).toContain("ARF-0099 is not a findings card in the library; nothing was changed.");
    expect(moved.text).toContain("1 later save that rested only on YouTube comments was deleted.");
    // The later save kept is rewritten as one saved today; the other is gone.
    const comments = h.github.comments.get(12)!;
    expect(comments.map(({ id }) => id)).toEqual([501]);
    const rewritten = parseFindingsRecordBody(comments[0]!.body, "occurrence");
    expect(rewritten).not.toBe("tampered");
    expect((rewritten as { record: FindingsRecord }).record.card.findings.map(({ claim }) => claim)).toEqual([STUDY.claim]);
    expect((rewritten as { metadata: OccurrenceMetadata }).metadata).toEqual(kept.metadata);
    expect(h.store.snapshot().map(({ cardSha256, findingNumber, expiresAt }) => [cardSha256, findingNumber, expiresAt]))
      .toEqual([
        [card.record.card_sha256, 1, "2026-11-06T11:00:00.000Z"],
        [kept.record.card_sha256, 1, "2026-11-09T11:00:00.000Z"],
        [allYouTube.record.card_sha256, 1, "2026-11-11T11:00:00.000Z"],
        [allYouTube.record.card_sha256, 2, "2026-11-11T11:00:00.000Z"],
      ]);
    // The card reads, with its later save, in the review tool.
    expect((await h.call({ action: "inspect_finding", card: "ARF-0012" })).structured.card.saves).toBe(2);
    expect(h.github.issue(209).body).toBe(untouched);
    expect(moved.text).toContain("ARF-0012: moved 4 findings drawn from YouTube comments into the 30-day hold " +
      "(deleted on 6 Nov 2026, 9 Nov 2026 and 11 Nov 2026). The card and 1 later save now read as saved today without " +
      "them. 1 later save that rested only on YouTube comments was deleted.");
  });

  it("changes nothing where a decision names a finding the move would remove or renumber, or where every finding rests on YouTube comments", async () => {
    const h = harness({ start: "2026-10-25T09:00:00.000Z" });
    // Finding 1 rests on comments and finding 2, decided, would become finding 1.
    const decidedCard = { ...CARD, findings: [FROM_AUDIT, STUDY] };
    storeCardBeforeSeventy(h.github, 8, decidedCard, [["comment_audit"], ["full_text_audit"]], "2026-10-08T08:00:00.000Z");
    await h.review.decide({
      cardNumber: 8, itemKind: "finding", itemNumber: 2, decision: "rejected", cardSha256: "d".repeat(64),
      ownerReason: "A synthetic decision.", decidedAt: "2026-10-20T08:00:00.000Z", intent: null, recheckedPublicNumber: null,
    });
    // A decision before the first finding moved is no obstacle.
    storeCardBeforeSeventy(h.github, 9, SEVEN, BASES, "2026-10-09T08:00:00.000Z");
    await h.review.decide({
      cardNumber: 9, itemKind: "finding", itemNumber: 1, decision: "rejected", cardSha256: "d".repeat(64),
      ownerReason: "A synthetic decision.", decidedAt: "2026-10-20T08:00:00.000Z", intent: null, recheckedPublicNumber: null,
    });
    const onlyYouTube = storeCardBeforeSeventy(h.github, 10, { ...CARD, findings: [FROM_AUDIT] }, [["comment_audit"]],
      "2026-10-10T08:00:00.000Z");
    const before = [8, 10].map((number) => h.github.issue(number).body);

    const moved = await h.call({ action: "move_youtube_findings", cards: ["ARF-0008", "ARF-0009", "ARF-0010"] });
    expect(moved.structured.youtubeFindings.cards.map(({ card, status, decidedFindings }: Record<string, unknown>) =>
      [card, status, decidedFindings])).toEqual([
      ["ARF-0008", "decisions_in_the_way", [2]],
      ["ARF-0009", "moved", []],
      ["ARF-0010", "every_finding_youtube", []],
    ]);
    expect(moved.text).toContain("ARF-0008 has decisions on finding 2, which moving its findings drawn from YouTube " +
      "comments would remove or renumber; nothing was changed.");
    expect(moved.text).toContain("Every finding on ARF-0010 rests on YouTube comments, so a card saved today would not " +
      "be saved as a card; nothing was changed.");
    expect([8, 10].map((number) => h.github.issue(number).body)).toEqual(before);
    expect(h.store.snapshot().map(({ cardNumber }) => cardNumber)).toEqual([9]);
    expect(onlyYouTube.record.card.findings).toHaveLength(1);
  });

  it("holds before it rewrites: a database failure changes no card, and a GitHub failure is finished by calling again", async () => {
    const failing = new InMemoryHeldYouTubeFindingsStore();
    failing.hold = async () => { throw new Error("database unavailable"); };
    const down = harness({ start: "2026-10-25T09:00:00.000Z", reviewHeld: failing });
    storeCardBeforeSeventy(down.github, 7, SEVEN, BASES, "2026-10-07T08:15:00.000Z");
    const body = down.github.issue(7).body;
    const failed = await down.call({ action: "move_youtube_findings", cards: ["ARF-0007"] });
    expect(failed.structured.youtubeFindings.cards[0]).toMatchObject({ status: "incomplete", held: [], cardRewritten: false });
    expect(failed.text).toContain("ARF-0007: the database or GitHub failed part way. Call move_youtube_findings for it " +
      "again; what is done is not redone.");
    expect(down.github.issue(7).body).toBe(body);

    const h = harness({ start: "2026-10-25T09:00:00.000Z" });
    storeCardBeforeSeventy(h.github, 7, SEVEN, BASES, "2026-10-07T08:15:00.000Z");
    h.github.failWhen = ({ method }) => method === "PATCH" ? 503 : undefined;
    const half = await h.call({ action: "move_youtube_findings", cards: ["ARF-0007"] });
    expect(half.structured.youtubeFindings.cards[0]).toMatchObject({
      status: "incomplete", held: [{ finding: 2, save: "card", deletedOn: "2026-11-06" }], cardRewritten: false,
    });
    h.github.failWhen = undefined;
    h.later(DAY);
    const done = await h.call({ action: "move_youtube_findings", cards: ["ARF-0007"] });
    expect(done.structured.youtubeFindings.cards[0]).toMatchObject({
      status: "moved", held: [{ finding: 2, save: "card", deletedOn: "2026-11-06" }], cardRewritten: true,
    });
    expect(h.store.snapshot()).toHaveLength(1);
  });
});

// Owner answer 173 with decision 171 (the next build holds both): a free card's save holds the findings drawn from
// YouTube comments it leaves out and publishes only those it keeps, and forgetting the card both deletes its held
// findings and withdraws its publications that are not accepted.
describe("with the Atlas publications (decision 171)", () => {
  const FREE: FindingsSaveAccount = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION, devAccount: false };

  it("holds the finding drawn from YouTube comments and publishes only the finding the stored card keeps", async () => {
    const publications = new InMemoryAtlasPublicationStore();
    const h = harness({ start: "2026-11-04T09:00:00.000Z", publications, account: FREE });
    await expect(h.save(MIXED_CARD, MIXED_BASES)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    await Promise.all([h.library.heldSettled(), h.library.publicationsSettled()]);
    expect(h.store.snapshot()).toEqual([{
      ...HELD_CONTENT,
      cardNumber: 42,
      cardSha256: findingsCardDigest(findingsCardSchema.parse(MIXED_CARD)),
      savedAt: "2026-11-04T09:00:00.000Z",
      expiresAt: "2026-12-04T09:00:00.000Z",
    }]);
    const published = await publications.inspect({});
    expect(published.map(({ publicationNumber, cardNumber, findingNumber, state }) =>
      [publicationNumber, cardNumber, findingNumber, state])).toEqual([["P-1001", 42, 1, "unreviewed"]]);
    expect(published[0]!.published?.claim).toBe(STUDY.claim);
    expect(JSON.stringify(published)).not.toContain("Commenters on two videos");

    // A card whose findings all rest on YouTube comments is not saved as a card: held with no card, never published.
    await expect(h.save(YOUTUBE_ONLY_CARD, ["comment_audit"], BOB))
      .resolves.toEqual({ status: "youtube_findings_only", retryable: false });
    await Promise.all([h.library.heldSettled(), h.library.publicationsSettled()]);
    expect(h.store.snapshot().map(({ cardNumber }) => cardNumber).sort()).toEqual([42, null].sort());
    expect(await publications.inspect({})).toHaveLength(1);
  });

  it("deletes the card's held findings and withdraws its publication when its contributor asks to forget it", async () => {
    const publications = new InMemoryAtlasPublicationStore();
    const h = harness({ publications, account: FREE });
    await h.save(MIXED_CARD, MIXED_BASES);
    await Promise.all([h.library.heldSettled(), h.library.publicationsSettled()]);
    const forgotten = await h.call({ action: "forget_card", card: "ARF-0042" });
    expect(forgotten.structured.forget).toMatchObject({
      card: "ARF-0042", youtubeFindingsDeleted: 1, publicationsWithdrawn: ["P-1001"], publicationsKept: [],
    });
    expect(forgotten.text).toContain("Its 1 held YouTube finding is deleted too.");
    expect(forgotten.text).toContain("Its publication P-1001 leaves the Atlas pages, its published fields erased.");
    expect(h.store.snapshot()).toEqual([]);
    expect(await publications.inspect({})).toEqual([expect.objectContaining({
      publicationNumber: "P-1001", state: "withdrawn", withdrawnBecause: "card_forgotten", cardSha256: null,
      published: null,
    })]);
  });
});

// Owner answer 173: a card whose findings all rest on YouTube comments is not saved as a card, and the user is told
// that AskRigor keeps those findings only for its owner's review and deletes them after 30 days, not that it stores
// nothing until YouTube confirms it may.
describe("what the user is told of a card whose findings all rest on YouTube comments", () => {
  it("says it is not saved as a card, and that its findings are kept for the owner's review and deleted after 30 days", () => {
    const saved = findingsSaveToolResult({ status: "youtube_findings_only", retryable: false });
    expect(saved.isError).toBe(true);
    expect(saved.content).toEqual([{ type: "text", text: "Not saved as a card: its findings all rest on YouTube " +
      "comments, which AskRigor keeps only for its owner's review and deletes after 30 days." }]);
    expect(YOUTUBE_FINDINGS_NOT_SAVED).toBe("not saved as a card: its findings all rest on YouTube comments, which " +
      "AskRigor keeps only for its owner's review and deletes after 30 days");
    for (const text of [JSON.stringify(saved.content), YOUTUBE_FINDINGS_NOT_SAVED]) {
      expect(text).not.toContain("until YouTube confirms");
    }
  });
});
