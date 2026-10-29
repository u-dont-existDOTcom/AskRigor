import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AtlasFindingPromotionRunner,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPromotionStore,
  InMemoryAtlasPublicationStore,
  InMemoryAtlasReviewStore,
  RESEARCH_USE_NOTICE_VERSION,
  deterministicUuid,
  sha256,
} from "@askrigor/evidence-repository";

import { AtlasCardPublisher } from "../apps/research-mcp/src/atlas/publication.js";
import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import { findingsCardDigest, findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService, type FindingsSaveAccount } from "../apps/research-mcp/src/findings/service.js";
import { AtlasSourceCheckCache } from "../apps/research-mcp/src/findings/source-checks.js";
import {
  createResearchContributionReviewHandler,
  researchContributionReviewInputSchema,
  researchContributionReviewOutputSchema,
} from "../apps/research-mcp/src/research-contribution-review-tool.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { LOW_DOSE_CARD, VELMOR_CARD } from "./helpers/atlas-scenario.js";
import { FakeGitHub } from "./helpers/fake-github-findings.js";

// Decision 171, sections 4B and 4F: the owner's publication actions on review_research_contribution (list, unpublish,
// publish chosen cards, set cards aside), with the findings actions' switch and owner authorization; and accepting,
// editing, rejecting, erasing and forgetting, which move the publications. Hermetic: GitHub, the stores and the
// providers are in memory.

const SECRET = "atlas-publication-review-test-secret-0123";
const OWNER = "auth0|atlas-publication-owner";
const PROTOCOLS = [{ name: "HRP", version: "20.6.32", sha256: sha256("synthetic-hrp") }];
const PROVIDERS = {
  crossref: { mailto: "maintainer@example.test" },
  pubmed: { tool: "askrigor-tests", email: "maintainer@example.test" },
};
const FREE: FindingsSaveAccount = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION };
const PAID: FindingsSaveAccount = { mode: "PAID_PRIVATE", noticeVersion: null };
/** The low-dose card, cited by its DOI, so only Crossref is asked. */
const DOI_CARD = {
  ...LOW_DOSE_CARD,
  findings: [{ ...LOW_DOSE_CARD.findings[0]!, sources: ["10.0000/synthetic-velmor-c"] }],
};

async function stubProviders(): Promise<void> {
  const work = JSON.parse(await readFile(new URL("fixtures/crossref/work-no-marker.json", import.meta.url), "utf8")) as
    { message: Record<string, unknown> };
  vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.hostname !== "api.crossref.org") return new Response("not routed", { status: 404 });
    const doi = decodeURIComponent(url.pathname.replace(/^\/works\//u, ""));
    return new Response(JSON.stringify({ ...work, message: { ...work.message, DOI: doi } }));
  }));
}

afterEach(() => {
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

function harness(options: { enabled?: boolean; publications?: boolean } = {}) {
  let instant = Date.parse("2026-11-04T09:00:00.000Z");
  const clock = () => new Date(instant);
  const github = new FakeGitHub();
  const tokenProvider = { getToken: async () => "synthetic-findings-token" };
  const publications = new InMemoryAtlasPublicationStore();
  const library = new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    protocols: async () => PROTOCOLS,
    version: "0.1.0",
    build: "0123abc",
    now: clock,
    publisher: new AtlasCardPublisher({ store: publications, now: clock }),
  });
  const review = new InMemoryAtlasReviewStore();
  const canonical = new InMemoryAtlasCanonicalStore({ now: () => clock().toISOString() });
  const runner = new AtlasFindingPromotionRunner(new InMemoryAtlasPromotionStore(review, canonical),
    { now: () => clock().toISOString() });
  let sequence = 0;
  const atlas = new AtlasReview({
    store: review,
    reader: canonical,
    inbox: new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    version: "0.1.0",
    build: "0123abc",
    protocols: async () => PROTOCOLS,
    now: clock,
    newIntentId: () => deterministicUuid(`atlas-publication-review-test:${sequence++}`),
    sourceCheckCache: new AtlasSourceCheckCache(),
    ...(options.publications === false ? {} : { publications }),
  });
  const handler = createResearchContributionReviewHandler({
    allowedReviewerSubjects: new Set([OWNER]),
    resourceMetadataUrl: new URL("https://mcp.askrigor.test/.well-known/oauth-protected-resource"),
    atlas: { enabled: options.enabled ?? true, review: atlas, providers: () => PROVIDERS },
  });
  let contributor = 0;
  return {
    github,
    canonical,
    review,
    publications,
    library,
    later: (minutes: number) => { instant += minutes * 60_000; },
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
    /** Saves a card in another research thread; with account null, as a card saved before publishing began. */
    async save(card: object, account: FindingsSaveAccount | null = FREE) {
      contributor += 1;
      const parsed = findingsCardSchema.parse(card);
      const key = contributor.toString(16).padStart(64, "0");
      const saved = await library.save({
        findings_card: card,
        contributor: key,
        finalization_receipt: issueResearchReceipt("finalization", {
          status: "ready", depth: "standard", target: key.slice(0, 12), findings: findingsCardDigest(parsed),
          bases: parsed.findings.map((_, index) => index === 0 ? "full_text_audit" : "none"),
        }, { secret: SECRET, now: clock }),
      }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64), ...(account === null ? {} : { account }) });
      await library.publicationsSettled();
      return saved;
    },
    promote: () => runner.promoteAccepted(),
  };
}

type Harness = ReturnType<typeof harness>;

async function cardSha256Of(h: Harness, card: string, finding: number): Promise<string> {
  const reply = await h.call({ action: "inspect_finding", card, finding });
  expect(reply.structured.outcome, reply.text).toBe("finding_inspected");
  return reply.structured.card.cardSha256 as string;
}

const states = async (h: Harness) => (await h.publications.inspect({}))
  .map(({ publicationNumber, cardNumber, findingNumber, state, atlasNumber }) =>
    [publicationNumber, cardNumber, findingNumber, state, atlasNumber]);

describe("the publication actions' access and input", () => {
  it("answers only the allowed owner, with the cases:review scope, and only while the Atlas review is open", async () => {
    const h = harness();
    for (const input of [
      { action: "list_publications" },
      { action: "unpublish_finding", publication: "P-1001", reason: "Wrong." },
      { action: "publish_cards", cards: ["ARF-0042"] },
      { action: "set_aside_cards", cards: ["ARF-0042"] },
    ]) {
      expect((await h.call(input, {})).structured.error.code, input.action).toBe("authorization_required");
      expect((await h.call(input, owner(OWNER, ["research:use"]))).structured.error.code).toBe("insufficient_scope");
      expect((await h.call(input, owner("auth0|someone-else"))).structured.error.code).toBe("insufficient_scope");
      expect((await harness({ enabled: false }).call(input)).structured.error.code).toBe("atlas_review_closed");
      expect((await harness({ publications: false }).call(input)).structured.error.code).toBe("review_service_unavailable");
    }
    expect(h.github.writes).toEqual([]);
  });

  it("refuses each action's wrong fields before anything is read", async () => {
    const refused = (input: Record<string, unknown>) =>
      researchContributionReviewInputSchema.safeParse(input).success;
    expect(refused({ action: "list_publications", publicationState: "held" })).toBe(true);
    expect(refused({ action: "list_publications", card: "ARF-0042" })).toBe(false);
    expect(refused({ action: "list_publications", publicationState: "shown" })).toBe(false);
    expect(refused({ action: "unpublish_finding", publication: "P-1001" })).toBe(false);
    expect(refused({ action: "unpublish_finding", publication: "ARF-0042", reason: "Wrong." })).toBe(false);
    expect(refused({ action: "publish_cards" })).toBe(false);
    expect(refused({ action: "publish_cards", cards: Array.from({ length: 21 }, (_, index) => `ARF-${1000 + index}`) }))
      .toBe(false);
    expect(refused({ action: "set_aside_cards", cards: ["ARF-0042"], cardsFrom: "ARF-0042", cardsTo: "ARF-0043" })).toBe(false);
    expect(refused({ action: "set_aside_cards", cardsFrom: "ARF-0239" , cardsTo: "ARF-0116" })).toBe(false);
    expect(refused({ action: "set_aside_cards", cardsFrom: "ARF-0116" })).toBe(false);
    expect(refused({ action: "set_aside_cards", cardsFrom: "ARF-0001", cardsTo: "ARF-1001" })).toBe(false);
    expect(refused({ action: "set_aside_cards", cardsFrom: "ARF-0116", cardsTo: "ARF-0239" })).toBe(true);
    expect(refused({ action: "list_findings", includeSetAside: true })).toBe(true);
    expect(refused({ action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256: "a".repeat(64),
      includeSetAside: true })).toBe(false);
  });
});

describe("the publications through the owner's review", () => {
  it("lists a saved free card's publications, which accepting, editing and rejecting then move", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD);
    await h.save(DOI_CARD);
    const listed = await h.call({ action: "list_publications" });
    expect(listed.structured).toMatchObject({ ok: true, outcome: "publications_listed", publications: {
      items: [
        { publication: "P-1003", card: "ARF-0043", finding: 1, state: "unreviewed", atlasNumber: null },
        { publication: "P-1002", card: "ARF-0042", finding: 2, state: "unreviewed" },
        { publication: "P-1001", card: "ARF-0042", finding: 1, state: "unreviewed", publishedOn: "2026-11-04" },
      ],
      nextCursor: null,
      waitingToPublish: [],
    } });
    expect(listed.text).toContain("P-1001 (ARF-0042 finding 1), published, not checked by supervisors yet: In one invented");

    // Accepting finding 1 as the card gives it: accepted with its F number, the label gone.
    const accept = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1,
      cardSha256: await cardSha256Of(h, "ARF-0042", 1) });
    expect(accept.structured.outcome, accept.text).toBe("finding_queued");
    expect(accept.text).toContain("In the Atlas, publication P-1001 (ARF-0042 finding 1) is accepted as F-1001, without " +
      "the label.");
    // Accepting with the owner's wording: edited.
    const edit = await h.call({ action: "edit_finding", card: "ARF-0042", finding: 2,
      cardSha256: await cardSha256Of(h, "ARF-0042", 2), appliesTo: "Adults with Velmor syndrome and a voice tremor, in trials" });
    expect(edit.structured.outcome, edit.text).toBe("finding_queued");
    expect(edit.text).toContain("publication P-1002 (ARF-0042 finding 2) is edited: the pages show F-1002 in its latest " +
      "version.");
    const reject = await h.call({ action: "reject_finding", card: "ARF-0043", finding: 1, reason: "Too small a trial." });
    expect(reject.text).toContain("publication P-1003 (ARF-0043 finding 1) is rejected: it leaves the Atlas pages.");
    expect(await states(h)).toEqual([
      ["P-1003", 43, 1, "rejected", null],
      ["P-1002", 42, 2, "edited", "F-1002"],
      ["P-1001", 42, 1, "accepted", "F-1001"],
    ]);
    expect((await h.call({ action: "list_publications", publicationState: "accepted" })).structured.publications.items
      .map(({ publication }: { publication: string }) => publication)).toEqual(["P-1001"]);

    // A correction after acceptance moves the accepted publication to edited, and an erasure erases its fields.
    expect((await h.promote()).result.status).toBe("promoted");
    expect((await h.promote()).result.status).toBe("promoted");
    const corrected = await h.call({ action: "edit_finding", atlasNumber: "F-1001", version: 1,
      wording: "In one invented trial of 240 adults, zentarine 20 mg halved the tremor score in 30 of 120 against 18 of " +
        "120 on placebo over 12 weeks, a number needed to treat of 10; nausea affected 12 of 120 against 6 of 120, a " +
        "number needed to harm of 20.",
      note: "Said the trial size without the condition.", eraseWording: true });
    expect(corrected.structured.outcome, corrected.text).toBe("finding_queued");
    expect(corrected.text).toContain("publication P-1001 (ARF-0042 finding 1) is edited");
    expect(corrected.text).toContain("publication P-1001 (ARF-0042 finding 1) has its published fields erased.");
    const [p1001] = await h.publications.inspect({ publicationNumbers: ["P-1001"] });
    expect(p1001).toMatchObject({ state: "edited", published: null });
  });

  it("brings a publication the decision's own call left behind in line on the next read of the card", async () => {
    await stubProviders();
    const h = harness();
    await h.save(DOI_CARD);
    const decide = h.publications.decide.bind(h.publications);
    h.publications.decide = async () => { throw new Error("database unavailable"); };
    const accept = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1,
      cardSha256: await cardSha256Of(h, "ARF-0042", 1) });
    expect(accept.structured.outcome, accept.text).toBe("finding_queued");
    expect(accept.text).not.toContain("In the Atlas");
    expect(await states(h)).toEqual([["P-1001", 42, 1, "unreviewed", null]]);
    h.publications.decide = decide;
    await h.call({ action: "inspect_finding", card: "ARF-0042" });
    expect(await states(h)).toEqual([["P-1001", 42, 1, "accepted", "F-1001"]]);
  });

  it("publishes a paid private card's finding, or an older card's, when it is accepted or edited, and nothing for a rejection", async () => {
    await stubProviders();
    const h = harness();
    await h.save(DOI_CARD, PAID);
    // Saved before publishing began, from what is now the owner's account: nothing was published at its save.
    await h.save(VELMOR_CARD, null);
    expect(await states(h)).toEqual([]);
    const accept = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1,
      cardSha256: await cardSha256Of(h, "ARF-0042", 1) });
    expect(accept.structured.outcome, accept.text).toBe("finding_queued");
    expect(accept.text).toContain("In the Atlas, publication P-1001 (ARF-0042 finding 1) is published as F-1001, " +
      "without the label, once the writer has stored it.");
    const edit = await h.call({ action: "edit_finding", card: "ARF-0043", finding: 2,
      cardSha256: await cardSha256Of(h, "ARF-0043", 2), appliesTo: "Adults with Velmor syndrome and a voice tremor, in trials" });
    expect(edit.structured.outcome, edit.text).toBe("finding_queued");
    expect(edit.text).toContain("publication P-1002 (ARF-0043 finding 2) is published with F-1002 in its latest version");
    const reject = await h.call({ action: "reject_finding", card: "ARF-0043", finding: 1, reason: "Too small a trial." });
    expect(reject.text).not.toContain("In the Atlas");
    expect(await states(h)).toEqual([
      ["P-1002", 43, 2, "edited", "F-1002"],
      ["P-1001", 42, 1, "accepted", "F-1001"],
    ]);
    // The next read of the cards publishes nothing twice.
    await h.call({ action: "inspect_finding", card: "ARF-0042" });
    await h.call({ action: "inspect_finding", card: "ARF-0043" });
    expect((await states(h)).length).toBe(2);
  });

  it("publishes an accepted finding the decision's own call could not publish on the next read of its card", async () => {
    await stubProviders();
    const h = harness();
    await h.save(DOI_CARD, PAID);
    const publish = h.publications.publish.bind(h.publications);
    h.publications.publish = async () => { throw new Error("database unavailable"); };
    const accept = await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1,
      cardSha256: await cardSha256Of(h, "ARF-0042", 1) });
    expect(accept.structured.outcome, accept.text).toBe("finding_queued");
    expect(await states(h)).toEqual([]);
    h.publications.publish = publish;
    await h.call({ action: "inspect_finding", card: "ARF-0042" });
    expect(await states(h)).toEqual([["P-1001", 42, 1, "accepted", "F-1001"]]);
  });

  it("unpublishes one publication with the owner's private reason, and says so again without changing anything", async () => {
    const h = harness();
    await h.save(DOI_CARD);
    const unpublished = await h.call({ action: "unpublish_finding", publication: "p-1001", reason: "It overstates the trial." });
    expect(unpublished.structured).toMatchObject({ ok: true, outcome: "publication_withdrawn", publications: {
      items: [{ publication: "P-1001", state: "withdrawn", withdrawnBecause: "owner_unpublished" }] } });
    expect(unpublished.text).toBe("Unpublished P-1001 (ARF-0042 finding 1): it leaves the Atlas pages, and your reason " +
      "stays private.");
    expect(unpublished.text).not.toContain("overstates");
    expect((await h.call({ action: "unpublish_finding", publication: "P-1001", reason: "Again." })).text)
      .toBe("P-1001 (ARF-0042 finding 1) is already off the Atlas pages: you unpublished it. Nothing was changed.");
    const missing = await h.call({ action: "unpublish_finding", publication: "P-1999", reason: "Wrong." });
    expect(missing).toMatchObject({ isError: true, structured: { error: { code: "publication_not_found" } } });
  });

  it("publishes chosen cards: an older card, again idempotently, never a paid private, set-aside or missing one", async () => {
    const h = harness();
    // Saved before publishing began: no account checks were made at its save.
    await h.save(DOI_CARD, null);
    await h.save(VELMOR_CARD, PAID);
    expect(await states(h)).toEqual([]);
    const published = await h.call({ action: "publish_cards", cards: ["ARF-0042", "ARF-0043", "ARF-0099"] });
    expect(published.structured.publications.cards).toEqual([
      { card: "ARF-0042", outcome: "published", problems: [], leftOut: [], publications: ["P-1001"] },
      { card: "ARF-0043", outcome: "not_published", problems: ["not_free_contributor"], leftOut: [], publications: [] },
      { card: "ARF-0099", outcome: "not_a_card", problems: [], leftOut: [], publications: [] },
    ]);
    expect(published.text).toContain("ARF-0042: finding 1 published as P-1001 (published, not checked by supervisors yet).");
    expect(published.text).toContain("ARF-0043 is not published: it was saved in paid private mode, so its findings " +
      "wait for your acceptance.");
    expect((await h.call({ action: "publish_cards", cards: ["ARF-0042"] })).structured.publications.cards[0])
      .toMatchObject({ outcome: "already_published", publications: ["P-1001"] });
    await h.call({ action: "set_aside_cards", cards: ["ARF-0042"] });
    expect((await h.call({ action: "publish_cards", cards: ["ARF-0042"] })).structured.publications.cards[0])
      .toMatchObject({ outcome: "not_published", problems: ["set_aside"] });
  });

  it("files topicless publications under the owner's topic in place, keeping their P numbers", async () => {
    const h = harness();
    const { topic: _topic, ...card } = VELMOR_CARD;
    await h.save(card);
    const before = await h.publications.inspect({ cardNumbers: [42] });
    expect(before.map(({ published }) => published?.topic)).toEqual([null, null]);
    const withdraw = vi.spyOn(h.publications, "withdraw");
    const publish = vi.spyOn(h.publications, "publish");
    const topicKey = "medicinal-plants.overlooked-clinical-leads";
    const topicLabel = "Overlooked medicinal plants with human clinical evidence";
    const reply = await h.call({ action: "publish_cards", cards: ["ARF-0042"], topicKey, topicLabel });
    expect(reply.isError, reply.text).toBe(false);
    const after = await h.publications.inspect({ cardNumbers: [42] });
    expect(after.map(({ publicationNumber }) => publicationNumber)).toEqual(before.map(({ publicationNumber }) => publicationNumber));
    expect(after.map(({ published }) => published?.topic)).toEqual([{ key: topicKey, label: topicLabel }, { key: topicKey, label: topicLabel }]);
    expect(after.map(({ publishedAt }) => publishedAt)).toEqual(before.map(({ publishedAt }) => publishedAt));
    expect(withdraw).toHaveBeenCalledWith(expect.objectContaining({ reason: "owner_unpublished",
      ownerReason: `filed under ${topicKey} (owner answer 191b)` }));
    expect(withdraw.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0]!);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ revive: true }));
    expect(reply.text).toContain("withdrawn as owner_unpublished");
    expect(reply.text).toContain("published again");
    expect(reply.text).toContain(topicLabel);
    expect(reply.text).toContain(topicKey);
    expect((await h.call({ action: "publish_cards", cards: ["ARF-0042"], topicKey, topicLabel })).isError).toBe(false);
    expect(withdraw).toHaveBeenCalledTimes(1);
  });

  it("uses the owner's topic for an unpublished older card and keeps a declared topic", async () => {
    const h = harness();
    const { topic: _topic, ...card } = DOI_CARD;
    await h.save(card, null);
    await h.save(VELMOR_CARD, null);
    const reply = await h.call({ action: "publish_cards", cards: ["ARF-0042", "ARF-0043"],
      topicKey: "plants", topicLabel: "Medicinal plants" });
    expect(reply.isError, reply.text).toBe(false);
    expect((await h.publications.inspect({ cardNumbers: [42] }))[0]?.published?.topic)
      .toEqual({ key: "plants", label: "Medicinal plants" });
    expect((await h.publications.inspect({ cardNumbers: [43] })).every(({ published }) =>
      published?.topic?.key === VELMOR_CARD.topic.key)).toBe(true);
    expect(reply.text).toContain("ARF-0043 keeps its declared topic");
  });

  it("requires a new topic's label, reuses a stored topic's label, and validates topic inputs", async () => {
    const h = harness();
    const { topic: _topic, ...card } = DOI_CARD;
    await h.save(card, null);
    const call = (extra: object) => h.call({ action: "publish_cards", cards: ["ARF-0042"], ...extra });
    for (const extra of [{ topicKey: "plants" }, { topicLabel: "Plants" },
      { topicKey: "Bad key", topicLabel: "Plants" }, { topicKey: "plants", topicLabel: "x".repeat(201) }]) {
      expect((await call(extra)).isError).toBe(true);
      expect(await h.publications.inspect({})).toEqual([]);
    }
    // Atlas findings and research frontiers use the same canonical topics table.
    h.canonical.seedTopic({ topicId: deterministicUuid("frontier-topic"), canonicalKey: "plants", label: "Stored plants" });
    const reply = await call({ topicKey: "plants", topicLabel: "Ignored replacement label" });
    expect(reply.isError, reply.text).toBe(false);
    expect(reply.text).toContain("Stored plants");
    expect((await h.publications.inspect({}))[0]?.published?.topic).toEqual({ key: "plants", label: "Stored plants" });
    expect((await call({ topicKey: "plants" })).isError).toBe(false);
  });

  it.each([
    ["plants", "See ARF-0042", "card_reference"],
    ["arf-0042", "Plants", "card_reference"],
    ["plants", "Write plants@example.test", "email_address"],
  ])("screens the owner's topic %s / %s as publication text", async (topicKey, topicLabel, heldBecause) => {
    const h = harness();
    const { topic: _topic, ...card } = DOI_CARD;
    await h.save(card, null);
    const reply = await h.call({ action: "publish_cards", cards: ["ARF-0042"], topicKey, topicLabel });
    expect(reply.isError, reply.text).toBe(false);
    expect((await h.publications.inspect({}))[0]).toMatchObject({ state: "held", heldBecause: [heldBecause] });
  });

  it("sets cards aside by a range, withdrawing their publications, and the waiting list leaves them out", async () => {
    const h = harness();
    await h.save(VELMOR_CARD);
    await h.save(DOI_CARD);
    const setAside = await h.call({ action: "set_aside_cards", cardsFrom: "ARF-0042", cardsTo: "ARF-0044" });
    expect(setAside.structured).toMatchObject({ ok: true, outcome: "cards_set_aside" });
    expect(setAside.structured.publications.cards).toEqual([
      { card: "ARF-0042", outcome: "set_aside", problems: [], leftOut: [], publications: ["P-1001", "P-1002"] },
      { card: "ARF-0043", outcome: "set_aside", problems: [], leftOut: [], publications: ["P-1003"] },
      { card: "ARF-0044", outcome: "not_a_card", problems: [], leftOut: [], publications: [] },
    ]);
    expect(setAside.text).toContain("Set aside ARF-0042 and ARF-0043.");
    expect(h.github.issue(42).labels.map(({ name }) => name)).toContain("set-aside");
    expect((await states(h)).map(([, , , state]) => state)).toEqual(["withdrawn", "withdrawn", "withdrawn"]);
    // Again: nothing more to label or withdraw.
    const again = await h.call({ action: "set_aside_cards", cards: ["ARF-0042"] });
    expect(again.structured.publications.cards[0]).toMatchObject({ outcome: "already_set_aside", publications: [] });
    const list = await h.call({ action: "list_findings" });
    expect(list.structured.findings).toMatchObject({ cards: [], setAsideLeftOut: 2 });
    expect(list.text).toContain("2 set-aside cards are left out; list_findings with includeSetAside lists them.");
    const all = await h.call({ action: "list_findings", includeSetAside: true });
    expect(all.structured.findings.cards.map(({ card }: { card: string }) => card)).toEqual(["ARF-0042", "ARF-0043"]);
  });

  it("labels at most 50 cards a call and finishes on the next", async () => {
    const h = harness();
    for (let index = 0; index < 52; index += 1) {
      h.github.issues.push({
        number: 300 + index, title: "Synthetic card", state: "open", labels: [{ name: "findings-card" }],
        body: `Synthetic\n<!-- askrigor-findings-card:${Buffer.from(JSON.stringify({
          fingerprint: "f".repeat(64), receipt_sha256: "e".repeat(64), saved_at: "2026-10-20T09:00:00.000Z",
        })).toString("base64url")} -->`,
      });
    }
    const first = await h.call({ action: "set_aside_cards", cardsFrom: "ARF-0300", cardsTo: "ARF-0351" });
    expect(first.structured.publications.cards.filter(({ outcome }: { outcome: string }) => outcome === "set_aside"))
      .toHaveLength(50);
    expect(first.structured.publications.cards.filter(({ outcome }: { outcome: string }) => outcome === "waiting"))
      .toHaveLength(2);
    expect(first.text).toContain("2 more cards wait: this call labels at most 50, so send the same call again");
    const second = await h.call({ action: "set_aside_cards", cardsFrom: "ARF-0300", cardsTo: "ARF-0351" });
    expect(second.structured.publications.cards.filter(({ outcome }: { outcome: string }) => outcome === "set_aside")
      .map(({ card }: { card: string }) => card)).toEqual(["ARF-0350", "ARF-0351"]);
  });

  it("lists a card whose publishing at its save failed, and publish_cards publishes it", async () => {
    const h = harness();
    const publish = h.publications.publish.bind(h.publications);
    h.publications.publish = async () => { throw new Error("database unavailable"); };
    await expect(h.save(DOI_CARD)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    h.publications.publish = publish;
    const listed = await h.call({ action: "list_publications" });
    expect(listed.structured.publications.waitingToPublish).toEqual(["ARF-0042"]);
    expect(listed.text).toContain("Saved for publishing but not published (its publishing did not complete): ARF-0042. " +
      "publish_cards publishes it.");
    await h.call({ action: "publish_cards", cards: ["ARF-0042"] });
    expect((await h.call({ action: "list_publications" })).structured.publications).toMatchObject({
      items: [{ publication: "P-1001", card: "ARF-0042" }], waitingToPublish: [] });
  });

  it("pages the list newest first", async () => {
    const h = harness();
    for (let index = 0; index < 22; index += 1) {
      await h.save({ ...DOI_CARD, question: `${DOI_CARD.question} Variant ${index + 1}.` });
    }
    const first = await h.call({ action: "list_publications" });
    expect(first.structured.publications.items).toHaveLength(20);
    expect(first.structured.publications.items[0].publication).toBe("P-1022");
    const second = await h.call({ action: "list_publications", cursor: first.structured.publications.nextCursor });
    expect(second.structured.publications.items.map(({ publication }: { publication: string }) => publication))
      .toEqual(["P-1002", "P-1001"]);
    expect(second.structured.publications).toMatchObject({ nextCursor: null, waitingToPublish: [] });
    expect((await h.call({ action: "list_publications", cursor: "not-a-cursor" })).structured.error.code)
      .toBe("invalid_request");
  });
});

describe("forgetting a card", () => {
  it("withdraws its publications that are not accepted, erasing them, and keeps the accepted one", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD);
    await h.call({ action: "accept_finding", card: "ARF-0042", finding: 1, cardSha256: await cardSha256Of(h, "ARF-0042", 1) });
    const forgotten = await h.call({ action: "forget_card", card: "ARF-0042" });
    expect(forgotten.structured.forget).toMatchObject({ publicationsWithdrawn: ["P-1002"], publicationsKept: ["P-1001"] });
    expect(forgotten.text).toContain("Its publication P-1002 leaves the Atlas pages, its published fields erased.");
    expect(forgotten.text).toContain("P-1001, which you accepted, stays published, without anything that ties it to the card.");
    const rows = await h.publications.inspect({});
    expect(rows.map(({ publicationNumber, state, cardSha256, published }) =>
      [publicationNumber, state, cardSha256, published === null])).toEqual([
      ["P-1002", "withdrawn", null, true],
      ["P-1001", "accepted", null, false],
    ]);
  });
});
