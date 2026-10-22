import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

// The package the tool imports, so the stores' errors are the classes the tool recognizes.
import {
  ATLAS_ERASED_KEY,
  ATLAS_ERASED_TEXT,
  AtlasFindingPromotionRunner,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPromotionStore,
  InMemoryAtlasReviewStore,
  deterministicUuid,
  prepareAtlasFindingIntent,
  sha256,
  type AtlasFindingIntent,
} from "@askrigor/evidence-repository";

import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import { findingsCardDigest, findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService } from "../apps/research-mcp/src/findings/service.js";
import { AtlasSourceCheckCache } from "../apps/research-mcp/src/findings/source-checks.js";
import {
  createResearchContributionReviewHandler,
  researchContributionReviewOutputSchema,
} from "../apps/research-mcp/src/research-contribution-review-tool.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { LOW_DOSE_CARD, VELMOR_CARD } from "./helpers/atlas-scenario.js";
import { FakeGitHub, FINDINGS_ISSUES_ROOT, storedRecordOf } from "./helpers/fake-github-findings.js";

// Atlas phase 2, part D (owner decision 7; design docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md, sections
// 4 and 7): forget_card finds a person's saves by their research-thread marker, deletes their cards' decision rows,
// re-files other people's later saves, deletes the person's later saves elsewhere, leaves a tombstone, and reports the
// card forgotten once GitHub answers 410; eraseWording, on edit_finding and withdraw_finding, has the runner erase the
// wording a finding could identify someone by, in the canonical rows and in the earlier intents. Hermetic: GitHub is in
// memory and the providers answer from the recorded fixtures. Every card and number is the draft's invented example.

const SECRET = "atlas-forget-and-erase-test-secret-0123456789";
const OWNER = "auth0|atlas-forget-owner";
const PROTOCOLS = [{ name: "HRP", version: "20.6.31", sha256: sha256("synthetic-hrp") }];
const PROVIDERS = {
  crossref: { mailto: "maintainer@example.test" },
  pubmed: { tool: "askrigor-tests", email: "maintainer@example.test" },
};
const fixture = (path: string) => readFile(new URL(`fixtures/${path}`, import.meta.url), "utf8");

/** A card whose two checked findings answer one question, each resting on a full-text audit of its own study. */
const TREMOR_CARD = {
  question: "Does zentarine ease the hand tremor of Velmor syndrome in adults?",
  usual_answer: "Zentarine is a gentle supplement that eases the tremor.",
  findings: [{
    claim: "In an invented trial of 240 adults with Velmor syndrome, zentarine 20 mg halved the tremor score in 30 of " +
      "120 against 18 of 120 on placebo over 12 weeks.",
    certainty: "moderate",
    applies_to: "Adults with Velmor syndrome",
    answer_quote: "Zentarine 20 mg halved the tremor score in 30 of 120 adults against 18 of 120 on placebo.",
    sources: ["10.0000/synthetic-velmor-a"],
    why_not_usual: "Quick answers call it gentle and miss the trial's numbers.",
    tags: ["full_text_read"],
    what_would_change_it: "A second trial of similar size with a different result.",
  }, {
    claim: "In a second invented trial, nausea affected 12 of 120 adults on zentarine 20 mg against 6 of 120 on " +
      "placebo over 12 weeks.",
    certainty: "low",
    applies_to: "Adults with Velmor syndrome on 20 mg",
    answer_quote: "Nausea affected 12 of 120 adults on zentarine against 6 of 120 on placebo.",
    sources: ["10.0000/synthetic-velmor-b"],
    why_not_usual: "Quick answers call it well tolerated.",
    tags: ["full_text_read"],
    what_would_change_it: "A trial that records harms over a longer follow-up.",
  }],
  public_value: {
    scope: "public",
    who_else: "Adults with Velmor syndrome weighing zentarine",
    what_it_changes: "It gives the trials' numbers instead of calling it gentle.",
  },
  open_leads: [],
};
const TREMOR = {
  outcome: "tremor score halved", better: "more", option: "zentarine 20 mg", option_events: 30, option_total: 120,
  comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks",
};
const NAUSEA = {
  outcome: "nausea", better: "fewer", option: "zentarine 20 mg", option_events: 12, option_total: 120,
  comparator: "placebo", comparator_events: 6, comparator_total: 120, follow_up: "12 weeks",
};
const LOW_DOSE = {
  outcome: "tremor score halved", better: "more", option: "zentarine 5 mg", option_events: 20, option_total: 100,
  comparator: "placebo", comparator_events: 19, comparator_total: 100, follow_up: "12 weeks",
};
/** The low-dose card, cited by its DOI, with a question of its own. */
const DOI_CARD = {
  ...LOW_DOSE_CARD,
  findings: [{ ...LOW_DOSE_CARD.findings[0]!, sources: ["10.0000/synthetic-velmor-c"] }],
};
/** A third card of its own question, for a third research thread. */
const DAILY_CARD = {
  ...DOI_CARD,
  question: "Does zentarine help adults with Velmor syndrome in daily life?",
};

/** The providers answer from the recorded fixtures; anything unrouted gets a 404. */
async function stubProviders(): Promise<void> {
  const work = JSON.parse(await fixture("crossref/work-no-marker.json")) as { message: Record<string, unknown> };
  const crossrefWork = (doi: string) => () => new Response(JSON.stringify({ ...work, message: { ...work.message, DOI: doi } }));
  const pubmed = await fixture("pubmed/efetch-record.xml");
  const routes: Record<string, () => Response> = {
    "crossref 10.0000/synthetic-velmor-a": crossrefWork("10.0000/synthetic-velmor-a"),
    "crossref 10.0000/synthetic-velmor-b": crossrefWork("10.0000/synthetic-velmor-b"),
    "crossref 10.0000/synthetic-velmor-c": crossrefWork("10.0000/synthetic-velmor-c"),
    "crossref 10.1234/recorded.example": crossrefWork("10.1234/recorded.example"),
    "pubmed 40123456": () => new Response(pubmed),
  };
  vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const key = url.hostname === "api.crossref.org"
      ? `crossref ${decodeURIComponent(url.pathname.replace(/^\/works\//u, ""))}`
      : url.hostname === "eutils.ncbi.nlm.nih.gov" ? `pubmed ${url.searchParams.get("id")}` : `other ${url.hostname}`;
    const respond = routes[key];
    return respond === undefined ? new Response("not routed", { status: 404 }) : respond();
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Reply {
  isError: boolean;
  text: string;
  structured: Record<string, any>;
}

/** A person's research thread: one account's research on one target. */
interface Thread {
  contributor: string;
  target: string;
}
const thread = (letter: string, target: string): Thread => ({ contributor: letter.repeat(64), target });

/** The library, GitHub, the stores, the runner and the owner's tool, with one clock. */
function harness() {
  let instant = Date.parse("2026-11-04T09:00:00.000Z");
  const clock = () => new Date(instant);
  const later = (minutes: number) => { instant += minutes * 60_000; };
  const github = new FakeGitHub();
  const tokenProvider = { getToken: async () => "synthetic-findings-token" };
  const library = new FindingsSaveService({
    receiptSecret: () => SECRET,
    limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
    queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
    protocols: async () => PROTOCOLS,
    version: "0.1.0",
    build: "0123abc",
    now: clock,
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
    newIntentId: () => deterministicUuid(`atlas-forget-and-erase-test:${sequence++}`),
    sourceCheckCache: new AtlasSourceCheckCache(),
  });
  const handler = createResearchContributionReviewHandler({
    allowedReviewerSubjects: new Set([OWNER]),
    atlas: { enabled: true, review: atlas, providers: () => PROVIDERS },
  });
  const owner = {
    authInfo: {
      token: "synthetic-token", clientId: "synthetic-client", scopes: ["cases:review"],
      expiresAt: Math.floor(Date.now() / 1_000) + 600, extra: { subject: OWNER },
    },
  };
  return {
    github,
    review,
    canonical,
    later,
    async call(input: Record<string, unknown>): Promise<Reply> {
      const result = await handler(input, owner as never);
      const structured = researchContributionReviewOutputSchema.parse(result.structuredContent) as Record<string, any>;
      expect(structured.canonicalEvidenceChangedByThisCall).toBe(false);
      return {
        isError: result.isError === true,
        text: (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n"),
        structured,
      };
    },
    /** One save by a research thread; the clock moves on so no two saves share a receipt. */
    async save(card: object, by: Thread, bases: string[]) {
      later(1);
      const parsed = findingsCardSchema.parse(card);
      return library.save({
        findings_card: card,
        contributor: by.contributor,
        finalization_receipt: issueResearchReceipt("finalization", {
          status: "ready", depth: "standard", target: by.target, findings: findingsCardDigest(parsed), bases,
        }, { secret: SECRET, now: clock }),
      }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) });
    },
    /** Accepts a card's finding with its numbers, after its inspect, and has the writer store it. */
    async accept(card: string, finding: number, numbers: unknown[], topic = { topicKey: "velmor-syndrome",
      topicLabel: "Velmor syndrome" }) {
      const inspected = await this.call({ action: "inspect_finding", card, finding });
      expect(inspected.structured.outcome, inspected.text).toBe("finding_inspected");
      const accepted = await this.call({ action: "accept_finding", card, finding,
        cardSha256: inspected.structured.card.cardSha256, numbers, ...topic });
      expect(accepted.structured.outcome, accepted.text).toBe("finding_queued");
      later(5);
      expect((await runner.promoteAccepted()).result.status).toBe("promoted");
      return accepted.structured.atlas.atlasNumber as string;
    },
    async promote() {
      later(5);
      return runner.promoteAccepted();
    },
  };
}

type Harness = ReturnType<typeof harness>;

/** A tombstone's marker: the cards forgotten together. */
function tombstoneOf(body: string): { cards: number[]; forgotten_at: string } {
  const match = /<!-- askrigor-findings-forgotten:([A-Za-z0-9_-]+) -->\s*$/u.exec(body);
  expect(match, "a tombstone marker").not.toBeNull();
  return JSON.parse(Buffer.from(match![1]!, "base64url").toString("utf8")) as { cards: number[]; forgotten_at: string };
}

describe("forget_card (decision 7)", () => {
  const ALICE = thread("a", "a1a1a1a1a1a1");
  const BOB = thread("b", "b2b2b2b2b2b2");
  const CAROL = thread("c", "c3c3c3c3c3c3");

  /**
   * Alice's thread saves the Velmor card (ARF-0042), which Bob's save of the same findings joins; then the low-dose
   * card (ARF-0043), which replaces ARF-0042 (kept open for Bob's save); then a save that joins Carol's card (ARF-0044),
   * which replaces ARF-0043 (closed, as it holds nothing else). The owner accepts ARF-0043's finding as F-1001 and
   * ARF-0044's as F-1002.
   */
  async function threeThreads(h: Harness) {
    expect((await h.save(VELMOR_CARD, ALICE, ["full_text_audit", "none"])).card_id).toBe("ARF-0042");
    expect((await h.save(VELMOR_CARD, BOB, ["full_text_audit", "none"])).card_id).toBe("ARF-0042");
    expect((await h.save(DOI_CARD, ALICE, ["full_text_audit"])).card_id).toBe("ARF-0043");
    expect((await h.save(DAILY_CARD, CAROL, ["full_text_audit"])).card_id).toBe("ARF-0044");
    expect((await h.save(DAILY_CARD, ALICE, ["full_text_audit"])).card_id).toBe("ARF-0044");
    expect(h.github.issue(42).state).toBe("open");
    expect(h.github.issue(43).state).toBe("closed");
    const f1001 = await h.accept("ARF-0043", 1, [LOW_DOSE]);
    const f1002 = await h.accept("ARF-0044", 1, [LOW_DOSE], { topicKey: "velmor-syndrome", topicLabel: "Velmor syndrome" });
    expect([f1001, f1002]).toEqual(["F-1001", "F-1002"]);
  }

  it("finds the person's saves by thread, re-files another person's, strips each card, and reports it forgotten once GitHub answers 410", async () => {
    await stubProviders();
    const h = harness();
    await threeThreads(h);
    const canonicalBefore = h.canonical.snapshot();
    const intentsBefore = await h.review.inspectIntents(["F-1001", "F-1002"]);
    const bobsSave = storedRecordOf(h.github.comments.get(42)!.find(({ body }) => body.includes("askrigor-findings-occurrence"))!.body);
    expect(h.github.comments.get(44)!.filter(({ body }) => body.includes("askrigor-findings-occurrence"))).toHaveLength(1);

    const reply = await h.call({ action: "forget_card", card: "arf-0043" });
    expect(reply.structured).toMatchObject({ ok: true, outcome: "card_forget_waiting_for_owner" });
    expect(reply.structured.forget).toEqual({
      card: "ARF-0043",
      status: "waiting_for_owner",
      threadKnown: true,
      cards: [
        { card: "ARF-0042", url: "https://github.com/u-dont-existDOTcom/AskRigor-findings/issues/42", github: "stripped" },
        { card: "ARF-0043", url: "https://github.com/u-dont-existDOTcom/AskRigor-findings/issues/43", github: "stripped" },
      ],
      decisionsRemoved: 1,
      findingsOnlyFromThese: ["F-1001"],
      findingsAlsoElsewhere: [],
      laterSavesDeletedOn: ["ARF-0044"],
      refiled: [{ from: "ARF-0042", card: "ARF-0045" }],
      ownerSteps: [
        "Now delete these issues in GitHub (Delete issue, at the foot of each issue's page), which also removes the " +
          "edit history: https://github.com/u-dont-existDOTcom/AskRigor-findings/issues/42, " +
          "https://github.com/u-dont-existDOTcom/AskRigor-findings/issues/43.",
        "Then call forget_card ARF-0043 again to check that GitHub no longer has them.",
      ],
    });
    expect(reply.text).toMatch(/^Forgot ARF-0043 at its contributor's request \(decision 7\)\. Its research thread also saved ARF-0042, forgotten with it\./u);
    expect(reply.text).toContain("F-1001 came only from these cards and stays in the Atlas while it is valid.");
    expect(reply.text).toContain("Other people's later saves were re-filed as cards of their own: ARF-0045 (from ARF-0042)");

    // The decision rows are gone; nothing canonical changed, and neither did the intents.
    expect(await h.review.inspectCards([42, 43, 44])).toEqual([expect.objectContaining({ cardNumber: 44, publicNumber: "F-1002" })]);
    expect(h.canonical.snapshot()).toEqual(canonicalBefore);
    expect(await h.review.inspectIntents(["F-1001", "F-1002"])).toEqual(intentsBefore);

    // Each of the person's cards is a locked tombstone with no comment, label, wording or thread marker.
    for (const number of [42, 43]) {
      const issue = h.github.issue(number);
      expect(issue).toMatchObject({ title: "Forgotten findings card", state: "closed", state_reason: "not_planned",
        labels: [], locked: true, active_lock_reason: "resolved" });
      expect(h.github.comments.get(number) ?? []).toEqual([]);
      expect(issue.body).not.toMatch(/zentarine|Velmor|askrigor-findings-card|askrigor-findings-occurrence/u);
      expect(tombstoneOf(issue.body)).toEqual({ cards: [42, 43], forgotten_at: "2026-11-04T09:15:00.000Z" });
    }
    // The person's later save on Carol's card is deleted; Carol's card and its decision stay.
    expect(h.github.comments.get(44)!.some(({ body }) => body.includes("askrigor-findings-occurrence"))).toBe(false);
    expect(h.github.issue(44).body).toContain("askrigor-findings-card");
    // Bob's save is a card of its own, with his record, which the owner's review reads.
    const refiled = h.github.issue(45);
    expect(refiled.labels.map(({ name }) => name)).toEqual(["findings-card", "pending-review", "beyond-quick-answer"]);
    expect(refiled.body).toContain("Re-filed from ARF-0042, whose contributor asked for it to be forgotten.");
    expect(storedRecordOf(refiled.body)).toEqual(bobsSave);
    expect((await h.call({ action: "inspect_finding", card: "ARF-0045" })).structured.card).toMatchObject({
      card: "ARF-0045", state: "open", saves: 1 });
    // The named card was stripped last: its thread marker was there until then.
    const patches = h.github.writes.filter(({ method, body }) => method === "PATCH" && body.title === "Forgotten findings card")
      .map(({ url }) => url);
    expect(patches).toEqual([`${FINDINGS_ISSUES_ROOT}/42`, `${FINDINGS_ISSUES_ROOT}/43`]);

    // Called again before the owner deletes them: still waiting, and nothing more is written.
    const writes = h.github.writes.length;
    const again = await h.call({ action: "forget_card", card: "ARF-0043" });
    expect(again.structured.outcome).toBe("card_forget_waiting_for_owner");
    expect(again.structured.forget.cards.map(({ github }: { github: string }) => github)).toEqual(["stripped", "stripped"]);
    expect(h.github.writes).toHaveLength(writes);

    // The owner deletes one, then the other; GitHub answers 410 for each, and the card is forgotten.
    h.github.deleteIssue(43);
    const half = await h.call({ action: "forget_card", card: "ARF-0043" });
    expect(half.structured.outcome).toBe("card_forget_waiting_for_owner");
    expect(half.structured.forget.cards.map(({ card, github }: { card: string; github: string }) => `${card} ${github}`))
      .toEqual(["ARF-0042 stripped", "ARF-0043 deleted"]);
    expect(half.structured.forget.ownerSteps[0]).toContain("issues/42.");
    // With both deleted, no tombstone is left to list the other card: the named one is checked, and it is gone.
    h.github.deleteIssue(42);
    const done = await h.call({ action: "forget_card", card: "ARF-0043" });
    expect(done.structured).toMatchObject({ ok: true, outcome: "card_forgotten",
      forget: { status: "forgotten", ownerSteps: [], cards: [{ card: "ARF-0043", github: "deleted" }] } });
    expect(done.text).toMatch(/^ARF-0043 is forgotten \(decision 7\): GitHub answers 410 \(deleted\) for ARF-0043, and no decision row names it; findings accepted from it stay in the Atlas while they are valid\./u);
    expect((await h.call({ action: "forget_card", card: "ARF-0042" })).structured.outcome).toBe("card_forgotten");

    // F-1001 stays while it is valid.
    const kept = await h.call({ action: "inspect_finding", atlasNumber: "F-1001" });
    expect(kept.structured.atlas).toMatchObject({ atlasNumber: "F-1001", label: "checked", version: 1 });
  });

  it("asks the owner to confirm when the named card holds another person's save, whose saver was told its id too", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD, ALICE, ["full_text_audit", "none"]);
    await h.save(VELMOR_CARD, BOB, ["full_text_audit", "none"]);
    const writes = h.github.writes.length;
    const asked = await h.call({ action: "forget_card", card: "ARF-0042" });
    expect(asked.structured).toMatchObject({ ok: false, outcome: "needs_confirmation" });
    expect(asked.isError).toBe(false);
    expect(asked.text).toContain("ARF-0042 also holds a later save of the same question and claims from other research threads");
    expect(asked.text).toContain("send the same call with confirm: true");
    expect(h.github.writes).toHaveLength(writes);
    const confirmed = await h.call({ action: "forget_card", card: "ARF-0042", confirm: true });
    expect(confirmed.structured).toMatchObject({ outcome: "card_forget_waiting_for_owner",
      forget: { refiled: [{ from: "ARF-0042", card: "ARF-0043" }] } });
    // The re-filed save belongs to Bob's thread: forgetting it finds it by his marker, with nothing to confirm.
    const bobs = await h.call({ action: "forget_card", card: "ARF-0043" });
    expect(bobs.structured).toMatchObject({ outcome: "card_forget_waiting_for_owner",
      forget: { cards: [{ card: "ARF-0043", github: "stripped" }] } });
  });

  it("resumes after GitHub fails part way, re-filing nothing twice", async () => {
    await stubProviders();
    const h = harness();
    await threeThreads(h);
    // GitHub refuses the tombstone of ARF-0042, after the re-filing and the deletion of the save on ARF-0044.
    h.github.failWhen = ({ method, url }) => method === "PATCH" && url === `${FINDINGS_ISSUES_ROOT}/42` ? 503 : undefined;
    const failed = await h.call({ action: "forget_card", card: "ARF-0043" });
    expect(failed.structured).toMatchObject({ ok: false, outcome: "try_again_later", retry: { reason: "github_unavailable" },
      forget: { status: "incomplete", decisionsRemoved: 1, findingsOnlyFromThese: ["F-1001"],
        refiled: [{ from: "ARF-0042", card: "ARF-0045" }], laterSavesDeletedOn: ["ARF-0044"] } });
    expect(failed.text).toMatch(/^GitHub failed part way through forgetting ARF-0043\./u);
    expect(failed.text).toContain("Call forget_card ARF-0043 again in a few minutes to finish; what is done is not redone.");
    expect(await h.review.inspectCards([42, 43])).toEqual([]);
    expect(h.github.issue(43).body).toContain("askrigor-findings-card");
    h.github.failWhen = undefined;
    const resumed = await h.call({ action: "forget_card", card: "ARF-0043" });
    expect(resumed.structured).toMatchObject({ outcome: "card_forget_waiting_for_owner",
      forget: { decisionsRemoved: 0, refiled: [{ from: "ARF-0042", card: "ARF-0045" }], laterSavesDeletedOn: [] } });
    expect(h.github.issues.filter(({ body }) => body.includes("Re-filed from ARF-0042"))).toHaveLength(1);
    for (const number of [42, 43]) expect(h.github.issue(number)).toMatchObject({ title: "Forgotten findings card", locked: true });
  });

  it("stops with nothing changed at another person's save that does not read, and refuses what is not a card", async () => {
    await stubProviders();
    const h = harness();
    await h.save(VELMOR_CARD, ALICE, ["full_text_audit", "none"]);
    await h.save(VELMOR_CARD, BOB, ["full_text_audit", "none"]);
    const occurrence = h.github.comments.get(42)!.find(({ body }) => body.includes("askrigor-findings-occurrence"))!;
    occurrence.body = occurrence.body.replace("\"claim\": \"In one invented trial", "\"claim\": \"In one edited trial");
    const writes = h.github.writes.length;
    const stopped = await h.call({ action: "forget_card", card: "ARF-0042", confirm: true });
    expect(stopped.structured.error?.code).toBe("card_unreadable");
    expect(stopped.text).toContain(`ARF-0042 holds a later save (comment ${occurrence.id}) that does not read`);
    expect(h.github.writes).toHaveLength(writes);
    // An issue that is not a findings card, and a number GitHub has no issue for.
    h.github.issues.push({ number: 60, title: "An issue", body: "Hello.", state: "open", labels: [] });
    expect((await h.call({ action: "forget_card", card: "ARF-0060" })).structured.error?.code).toBe("card_not_found");
    const none = await h.call({ action: "forget_card", card: "ARF-0099" });
    expect(none.structured.error?.code).toBe("card_not_found");
    expect(none.text).toContain("GitHub has no issue ARF-0099 (404)");
    expect(h.github.writes).toHaveLength(writes);
  });
});

describe("erasing wording that could identify a person (decision 7)", () => {
  const OWNER_THREAD = thread("d", "d4d4d4d4d4d4");
  const OTHER_THREAD = thread("e", "e5e5e5e5e5e5");

  /** ARF-0042's two findings answer one question (F-1001, F-1002); ARF-0043's has a question of its own (F-1003). */
  async function threeFindings(h: Harness) {
    await h.save(TREMOR_CARD, OWNER_THREAD, ["full_text_audit", "full_text_audit"]);
    await h.save(DOI_CARD, OTHER_THREAD, ["full_text_audit"]);
    expect(await h.accept("ARF-0042", 1, [TREMOR])).toBe("F-1001");
    expect(await h.accept("ARF-0042", 2, [NAUSEA])).toBe("F-1002");
    expect(await h.accept("ARF-0043", 1, [LOW_DOSE])).toBe("F-1003");
  }

  const finding = (h: Harness, number: string) => h.canonical.snapshot().findings.find(({ publicNumber }) =>
    publicNumber === number)!;
  const versionsOf = (h: Harness, number: string) => h.canonical.snapshot().versions
    .filter(({ findingId }) => findingId === finding(h, number).findingId)
    .sort((left, right) => left.versionNumber - right.versionNumber);
  const questionOf = (h: Harness, number: string) => h.canonical.questionTextOf(number);

  it("makes a new general version and erases the earlier one, keeping a question another finding answers", async () => {
    await stubProviders();
    const h = harness();
    await threeFindings(h);
    const general = "In an invented trial of adults with Velmor syndrome, zentarine 20 mg halved the tremor score in " +
      "30 of 120 against 18 of 120 on placebo over 12 weeks.";
    const reply = await h.call({ action: "edit_finding", atlasNumber: "F-1001", version: 1, wording: general,
      appliesTo: "Adults with Velmor syndrome", note: "Rewritten in general terms.", eraseWording: true });
    expect(reply.structured, reply.text).toMatchObject({ ok: true, outcome: "finding_queued",
      atlas: { atlasNumber: "F-1001", version: 1, intent: { kind: "erase", status: "PENDING" } } });
    expect(reply.text).toBe("Queued a correction of F-1001: version 2, with your note, which the Atlas dates; then " +
      "the wording of version 1 is erased (decision 7): the Atlas shows " +
      "\"[wording removed]\" in place of every text, the numbers keep their counts, and the same texts are cleared " +
      "from the records of your earlier decisions on it. Its question stays, because F-1002 answers it too: erasing " +
      "the wording of that finding too takes the question with the last of them, if it could identify someone. " +
      "ARF-0042 still holds the original wording in the findings inbox: forget_card ARF-0042 removes it, with what " +
      "ties the card to its contributor. The Atlas writer stores them within about 10 minutes, one per run.");
    expect((await h.review.inspectIntents(["F-1001"])).filter(({ status }) => status === "PENDING")
      .map(({ intentKind }) => intentKind)).toEqual(["revise", "erase"]);
    // The same call again is what waits.
    expect((await h.call({ action: "edit_finding", atlasNumber: "F-1001", version: 1, wording: general,
      appliesTo: "Adults with Velmor syndrome", note: "Rewritten in general terms.", eraseWording: true })).text)
      .toBe("This revise and erase of F-1001 already wait for the Atlas writer; nothing new was recorded.");

    expect((await h.promote()).result).toMatchObject({ status: "promoted", receipt: { intentKind: "revise" } });
    const erased = await h.promote();
    expect(erased.result).toMatchObject({ status: "promoted", receipt: { intentKind: "erase" } });

    // Version 1 reads as the marker, its keys are zeros and its numbers keep only their counts; version 2 stays.
    const [one, two] = versionsOf(h, "F-1001");
    expect(one!.content).toEqual({
      wording: ATLAS_ERASED_TEXT, appliesTo: ATLAS_ERASED_TEXT, certainty: "moderate", usualAnswer: ATLAS_ERASED_TEXT,
      whyNotUsual: ATLAS_ERASED_TEXT, whatWouldChangeIt: ATLAS_ERASED_TEXT, whoElse: ATLAS_ERASED_TEXT,
      whatItChanges: ATLAS_ERASED_TEXT, tags: ["full_text_read"], verifiedBases: ["full_text_audit"],
      numbers: [{ ...TREMOR, outcome: ATLAS_ERASED_TEXT, option: ATLAS_ERASED_TEXT, comparator: ATLAS_ERASED_TEXT,
        follow_up: ATLAS_ERASED_TEXT }],
    });
    expect([one!.cardWordingKey, one!.acceptedWordingKey]).toEqual([ATLAS_ERASED_KEY, ATLAS_ERASED_KEY]);
    expect(two!.content.wording).toBe(general);
    const rows = h.canonical.snapshot();
    expect(rows.redactions.map(({ claimVersionId }) => claimVersionId)).toEqual([one!.claimVersionId]);
    expect(rows.changes.filter(({ changeKind }) => changeKind === "wording_removed")).toEqual([expect.objectContaining({
      labelBefore: "checked", labelAfter: "checked", publicNote: null, claimVersionId: null })]);
    expect(rows.changes.find(({ changeKind }) => changeKind === "corrected")!.publicNote).toBe("Rewritten in general terms.");
    expect(questionOf(h, "F-1001")).toBe(TREMOR_CARD.question);

    // The accept's texts leave the intents; the revision that made the version kept stays as it was.
    const intents = await h.review.inspectIntents(["F-1001"]);
    const accept = intents.find(({ intentKind }) => intentKind === "accept")!;
    const payload = accept.payload as Extract<AtlasFindingIntent, { kind: "accept" }>;
    expect(accept.textsErasedAt).not.toBeNull();
    expect(payload.content.wording).toBe(ATLAS_ERASED_TEXT);
    expect(payload.wordingKeys).toEqual({ card: ATLAS_ERASED_KEY, accepted: ATLAS_ERASED_KEY });
    expect(payload.question).toBe(TREMOR_CARD.question);
    expect(payload.topic).toEqual({ key: "velmor-syndrome", label: "Velmor syndrome" });
    expect(JSON.stringify(payload)).not.toContain("240 adults");
    const revise = intents.find(({ intentKind }) => intentKind === "revise")!;
    expect([revise.textsErasedAt, (revise.payload as { content: { wording: string } }).content.wording])
      .toEqual([null, general]);

    // inspect shows it, and names the card still holding the original wording.
    const inspected = await h.call({ action: "inspect_finding", atlasNumber: "F-1001" });
    expect(inspected.structured.atlas).toMatchObject({ version: 2, label: "checked", wording: general, wordingRemoved: [1] });
    expect(inspected.text).toContain("Wording removed (decision 7) from version 1.");
    expect(inspected.text).toContain("ARF-0042 still holds the original wording in the findings inbox");
    // Nothing earlier is left to erase on its own.
    expect((await h.call({ action: "edit_finding", atlasNumber: "F-1001", version: 2, eraseWording: true }))
      .structured.checks.problems).toEqual([expect.objectContaining({ code: "nothing_changed" })]);
  });

  it("withdraws and erases every version, the note included; the shared question goes with the last finding", async () => {
    await stubProviders();
    const h = harness();
    await threeFindings(h);
    const reply = await h.call({ action: "withdraw_finding", atlasNumber: "F-1002", version: 1,
      note: "Withdrawn: its wording could identify a person.", eraseWording: true });
    expect(reply.text).toMatch(/^Queued the withdrawal of F-1002: version 2 marks it withdrawn, with your note, which the Atlas dates\. After it, the wording of versions 1 and 2 is erased \(decision 7\), your note included, which leaves it "withdrawn, wording removed" with the date: /u);
    expect(reply.text).toContain("Its question stays, because F-1001 answers it too");
    await h.promote();
    await h.promote();
    const versions = versionsOf(h, "F-1002");
    expect(versions.map(({ status, content }) => [status, content.wording])).toEqual([
      ["current", ATLAS_ERASED_TEXT], ["invalidated", ATLAS_ERASED_TEXT]]);
    const changes = h.canonical.snapshot().changes.filter(({ findingId }) => findingId === finding(h, "F-1002").findingId);
    expect(changes.map(({ changeKind, publicNote, labelAfter }) => [changeKind, publicNote, labelAfter])).toEqual([
      ["accepted", null, "checked"], ["withdrawn", ATLAS_ERASED_TEXT, "withdrawn"], ["wording_removed", null, "withdrawn"]]);
    const withdrawal = (await h.review.inspectIntents(["F-1002"])).find(({ intentKind }) => intentKind === "withdraw")!;
    expect((withdrawal.payload as { note: string }).note).toBe(ATLAS_ERASED_TEXT);
    const inspected = await h.call({ action: "inspect_finding", atlasNumber: "F-1002" });
    expect(inspected.structured.atlas).toMatchObject({ label: "withdrawn", wording: ATLAS_ERASED_TEXT, wordingRemoved: [1, 2] });
    expect(questionOf(h, "F-1002")).toBe(TREMOR_CARD.question);

    // Once F-1001 is withdrawn and erased too, nothing else uses the question, and it goes.
    const last = await h.call({ action: "withdraw_finding", atlasNumber: "F-1001", version: 1,
      note: "Withdrawn as well.", eraseWording: true });
    expect(last.text).toContain("Its question is erased too: no other finding or research uses it.");
    await h.promote();
    await h.promote();
    expect(questionOf(h, "F-1001")).toBe(ATLAS_ERASED_TEXT);
    const accept = (await h.review.inspectIntents(["F-1001"])).find(({ intentKind }) => intentKind === "accept")!;
    expect((accept.payload as { question: string }).question).toBe(ATLAS_ERASED_TEXT);
    // A finding withdrawn and erased already has nothing left to erase.
    expect((await h.call({ action: "withdraw_finding", atlasNumber: "F-1001", version: 2, eraseWording: true }))
      .structured.checks.problems).toEqual([expect.objectContaining({ code: "nothing_changed" })]);
  });

  it("erases an unshared question, the rationale of its links and an unlink's note, and erases a finding withdrawn before", async () => {
    await stubProviders();
    const h = harness();
    await threeFindings(h);
    // F-1003 contradicts F-1001, the link is withdrawn and recorded again: two rationales and one withdrawal note.
    const link = { action: "link_findings", atlasNumber: "F-1003", relation: "contradicts", to: "F-1001",
      disagreement: "dose", rationale: "The invented trials used 5 mg and 20 mg." };
    expect((await h.call(link)).structured.outcome).toBe("finding_queued");
    await h.promote();
    expect((await h.call({ action: "link_findings", atlasNumber: "F-1003", relation: "unlink", to: "F-1001",
      note: "They measured different tremors." })).structured.outcome).toBe("finding_queued");
    await h.promote();
    expect((await h.call({ ...link, relation: "narrows", disagreement: undefined,
      rationale: "The 5 mg trial narrows the 20 mg finding." })).structured.outcome).toBe("finding_queued");
    await h.promote();
    // Withdrawn first without erasing; then the owner judges its wording could identify someone.
    expect((await h.call({ action: "withdraw_finding", atlasNumber: "F-1003", version: 1,
      note: "Withdrawn." })).structured.outcome).toBe("finding_queued");
    await h.promote();
    const erase = await h.call({ action: "withdraw_finding", atlasNumber: "F-1003", version: 2, eraseWording: true,
      note: "Erase it too." });
    expect(erase.text).toMatch(/^Queued the erasure of the wording of F-1003's versions 1 and 2 \(decision 7\), which leaves it "withdrawn, wording removed" with the date: /u);
    expect(erase.text).toContain("Its question is erased too: no other finding or research uses it.");
    expect(erase.text).toContain("The rationale of its 2 links is erased too.");
    expect(erase.text).toContain("ARF-0043 still holds the original wording in the findings inbox: forget_card ARF-0043");
    expect(erase.text).toContain("The note you sent is not stored: the withdrawal keeps its own, which is erased with the rest.");
    expect((await h.promote()).result).toMatchObject({ status: "promoted", receipt: { intentKind: "erase" } });

    const rows = h.canonical.snapshot();
    expect(rows.links.map(({ relation, rationale }) => [relation, rationale])).toEqual([
      ["contradicts", ATLAS_ERASED_TEXT], ["narrows", ATLAS_ERASED_TEXT]]);
    expect(rows.linkWithdrawals.map(({ publicNote }) => publicNote)).toEqual([ATLAS_ERASED_TEXT]);
    expect(questionOf(h, "F-1003")).toBe(ATLAS_ERASED_TEXT);
    expect(questionOf(h, "F-1001")).toBe(TREMOR_CARD.question);
    // The link and unlink intents lose their texts too, on either side.
    const intents = await h.review.inspectIntents(["F-1003"]);
    expect(intents.filter(({ intentKind }) => intentKind === "link" || intentKind === "unlink")
      .map(({ payload }) => "rationale" in payload ? payload.rationale : (payload as { note: string }).note))
      .toEqual([ATLAS_ERASED_TEXT, ATLAS_ERASED_TEXT, ATLAS_ERASED_TEXT]);
    // F-1001's own wording is untouched.
    expect(versionsOf(h, "F-1001").every(({ content }) => content.wording !== ATLAS_ERASED_TEXT)).toBe(true);
    // Every text of F-1003 stored anywhere is gone.
    const stored = JSON.stringify({ rows: h.canonical.snapshot(), intents });
    expect(stored).not.toContain(DOI_CARD.findings[0]!.claim);
    expect(stored).not.toContain(DOI_CARD.question);
  });

  it("no longer stalls the queue on an erasure: it is applied, or fails with its code and the next intent goes on", async () => {
    await stubProviders();
    const h = harness();
    await threeFindings(h);
    // A stale erasure (F-1003 has one version), then a link: one activation fails the first and promotes the second.
    const stale = prepareAtlasFindingIntent({ schema: "askrigor.atlas-finding-intent.v1", kind: "erase",
      publicNumber: "F-1003", version: 2, scope: "earlier_versions", reasonCode: "could_identify_a_person",
      decidedWith: { askrigorVersion: "0.1.0", build: "0123abc", protocols: PROTOCOLS } });
    await h.review.recordIntent({ intentId: deterministicUuid("stale-erasure"), intentKind: "erase",
      publicNumber: "F-1003", payload: stale.payload, payloadSha256: stale.payloadSha256, ownerReason: null,
      createdAt: "2026-11-04T10:00:00.000Z", retryOfIntentId: null });
    // All versions of a finding not withdrawn is refused too.
    const notWithdrawn = prepareAtlasFindingIntent({ ...stale.payload, version: 1, scope: "all_versions" });
    await h.review.recordIntent({ intentId: deterministicUuid("not-withdrawn"), intentKind: "erase",
      publicNumber: "F-1003", payload: notWithdrawn.payload, payloadSha256: notWithdrawn.payloadSha256,
      ownerReason: null, createdAt: "2026-11-04T10:00:01.000Z", retryOfIntentId: null });
    expect((await h.call({ action: "link_findings", atlasNumber: "F-1003", relation: "contradicts", to: "F-1001",
      disagreement: "dose", rationale: "The invented trials used 5 mg and 20 mg." })).structured.outcome)
      .toBe("try_again_later");
    const link = prepareAtlasFindingIntent({ schema: "askrigor.atlas-finding-intent.v1", kind: "link",
      publicNumber: "F-1003", relation: "contradicts", toPublicNumber: "F-1001", disagreement: "dose",
      rationale: "The invented trials used 5 mg and 20 mg.",
      decidedWith: { askrigorVersion: "0.1.0", build: "0123abc", protocols: PROTOCOLS } });
    await h.review.recordIntent({ intentId: deterministicUuid("after-the-erasures"), intentKind: "link",
      publicNumber: "F-1003", payload: link.payload, payloadSha256: link.payloadSha256, ownerReason: null,
      createdAt: "2026-11-04T10:00:02.000Z", retryOfIntentId: null });
    const run = await h.promote();
    expect(run.failed.map(({ failureCode }) => failureCode)).toEqual(["ATLAS_VERSION_STALE", "ATLAS_ERASE_NOT_WITHDRAWN"]);
    expect(run.result).toMatchObject({ status: "promoted", receipt: { intentKind: "link" } });
    // Neither refusal wrote anything: no redaction, no erased text.
    expect(h.canonical.snapshot().redactions).toEqual([]);
    const listed = await h.call({ action: "list_findings" });
    expect(listed.text).toContain("The Atlas writer refused F-1003's erase with ATLAS_ERASE_NOT_WITHDRAWN: erasing every " +
      "version's wording needs the finding withdrawn first.");
  });
});
