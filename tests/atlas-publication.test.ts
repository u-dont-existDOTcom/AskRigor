import { describe, expect, it } from "vitest";

import {
  EARLIER_RESEARCH_USE_NOTICE_VERSIONS,
  InMemoryAtlasPublicationStore,
  PostgresAtlasPublicationStore,
  RESEARCH_USE_NOTICE_VERSION,
  type AtlasIntentView,
  type AtlasPublicationStore,
} from "@askrigor/evidence-repository";

import {
  AtlasCardPublisher,
  accountPublicationProblems,
  cardPublicationProblems,
  decidedPublicationDraft,
  decidedPublicationState,
  drawnFromYouTubeComments,
  planCardPublication,
  publicationHoldReasons,
  publishedFindingOf,
  reconcileCardPublications,
} from "../apps/research-mcp/src/atlas/publication.js";
import {
  findingsCardDigest,
  findingsCardSchema,
  withoutYouTubeData,
  type StoredFinding,
} from "../apps/research-mcp/src/findings/card.js";
import { parseMarker } from "../apps/research-mcp/src/findings/github-findings.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import {
  DEFAULT_FINDINGS_REPOSITORY,
  createAtlasPublicationStoreFromEnv,
} from "../apps/research-mcp/src/findings/runtime.js";
import {
  FindingsSaveService,
  type FindingsRecord,
  type FindingsSaveAccount,
  type FindingsSaveContext,
} from "../apps/research-mcp/src/findings/service.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { LOW_DOSE_CARD, VELMOR_CARD } from "./helpers/atlas-scenario.js";
import { FakeGitHub } from "./helpers/fake-github-findings.js";

// Decision 171, section 4B: which saved cards and findings the Atlas publishes, what it publishes of each, and the save
// path's publisher, which never holds back or fails a save. Every rule is an exact check.

const SECRET = "atlas-publication-test-secret-0123456789";
const NOW = new Date("2026-11-04T09:00:00.000Z");
const PROTOCOLS = [{ name: "HRP", version: "20.6.31", sha256: "a".repeat(64) }];
const FREE: FindingsSaveAccount = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION, devAccount: false };

/**
 * A stored record of a card, as the library saves it, with the bases a receipt signed for each finding; olderFindings
 * are stored as a card saved before owner answer 170 could hold them.
 */
function recordOf(card: object, bases: string[][] = [], savedAt = NOW.toISOString(),
  olderFindings: StoredFinding[] = []): FindingsRecord {
  const parsed = findingsCardSchema.parse(card);
  const stored = withoutYouTubeData(parsed);
  return {
    schema: "askrigor.findings-card.v1",
    card: {
      ...stored.card,
      findings: [...stored.card.findings.map((finding, index) => (bases[index] ?? []).length === 0 ? finding
        : { ...finding, verified_bases: bases[index] as StoredFinding["verified_bases"] }), ...olderFindings],
    },
    card_sha256: findingsCardDigest(parsed),
    stamp: {
      saved_at: savedAt,
      askrigor_version: "0.1.0",
      askrigor_build: "0123abc",
      protocols: PROTOCOLS,
      tool_catalog_sha256: "c".repeat(64),
      surface: "/mcp/claude",
      reported_model_unverified: "Example Model 2026-08-06",
      research: { finalized_at: savedAt, depth: "standard", status: "ready" },
    },
  };
}

describe("what the Atlas publishes of a finding", () => {
  it("projects the card's topic and the finding's fields, with raw counts, and nothing that ties it to a person", () => {
    const record = recordOf(VELMOR_CARD, [["full_text_audit"], []]);
    const effect = publishedFindingOf(record, 1)!;
    expect(effect).toEqual({
      schema: "askrigor.atlas-publication.v1",
      topic: { key: "velmor-syndrome", label: "Velmor syndrome" },
      claim: VELMOR_CARD.findings[0]!.claim,
      certainty: "moderate",
      applies_to: "Adults with Velmor syndrome",
      kind: "effect",
      subject: "zentarine",
      subject_type: "supplement",
      direction: "benefit",
      numbers: [
        { outcome: "tremor score halved", better: "more", option: "zentarine 20 mg", option_events: 30, option_total: 120,
          comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks" },
        { outcome: "nausea", better: "fewer", option: "zentarine 20 mg", option_events: 12, option_total: 120,
          comparator: "placebo", comparator_events: 6, comparator_total: 120, follow_up: "12 weeks" },
      ],
      searches: null,
      sources: ["10.0000/synthetic-velmor-a"],
      why_not_usual: VELMOR_CARD.findings[0]!.why_not_usual,
      what_would_change_it: VELMOR_CARD.findings[0]!.what_would_change_it,
      verified_bases: ["full_text_audit"],
      saved_on: "2026-11-04",
      askrigor_version: "0.1.0",
    });
    const nothingFound = publishedFindingOf(record, 2)!;
    expect(nothingFound).toMatchObject({ kind: "nothing_found", direction: "descriptive", numbers: null,
      searches: [{ database: "pubmed", query: "zentarine voice tremor" }], verified_bases: [] });
    const text = JSON.stringify([effect, nothingFound]);
    for (const absent of [VELMOR_CARD.findings[0]!.answer_quote, "/mcp/claude", "Example Model", record.card_sha256,
      "ARF-", "answer_quote", "nnt", "nnh", "0123abc", PROTOCOLS[0]!.sha256]) {
      expect(text).not.toContain(absent);
    }
    expect(publishedFindingOf(record, 3)).toBeUndefined();
    expect(publishedFindingOf(record, 0)).toBeUndefined();
  });

  it("keeps an older card's missing fields apart from declared empty ones, and an unknown version as unknown", () => {
    const { topic: _topic, ...card } = LOW_DOSE_CARD;
    const { kind: _kind, subject: _subject, subject_type: _type, direction: _direction, numbers: _numbers, ...finding } =
      LOW_DOSE_CARD.findings[0]!;
    const record = recordOf({ ...card, findings: [finding] });
    expect(publishedFindingOf({ ...record, stamp: { ...record.stamp, askrigor_version: "0.1.0 (local)" } }, 1))
      .toMatchObject({ topic: null, kind: null, subject: null, subject_type: null, direction: null, numbers: null,
        searches: null, askrigor_version: "unknown" });
  });
});

describe("which findings and cards are published", () => {
  const finding = (overrides: Partial<StoredFinding> = {}): StoredFinding => ({
    ...recordOf(VELMOR_CARD).card.findings[0]!,
    ...overrides,
  });

  it("leaves out a finding drawn from YouTube comments by any of withoutYouTubeData's markers", () => {
    expect(drawnFromYouTubeComments(finding())).toBe(false);
    expect(drawnFromYouTubeComments(finding({ youtube_videos: 1 }))).toBe(true);
    expect(drawnFromYouTubeComments(finding({ sources: ["10.0000/synthetic-velmor-a", "zentarineV1"] }))).toBe(true);
    expect(drawnFromYouTubeComments(finding({ tags: ["community_checked"] }))).toBe(true);
    expect(drawnFromYouTubeComments(finding({ verified_bases: ["full_text_audit", "comment_audit"] }))).toBe(true);
  });

  it("publishes at the save only a free contributor's card under the current notice, from no dev account", () => {
    expect(accountPublicationProblems(FREE)).toEqual([]);
    expect(accountPublicationProblems(undefined)).toEqual(["not_free_contributor"]);
    expect(accountPublicationProblems({ ...FREE, mode: "PAID_PRIVATE", noticeVersion: null })).toEqual(["not_free_contributor"]);
    for (const earlier of [...EARLIER_RESEARCH_USE_NOTICE_VERSIONS, null]) {
      expect(accountPublicationProblems({ ...FREE, noticeVersion: earlier })).toEqual(["notice_not_current"]);
    }
    expect(accountPublicationProblems({ ...FREE, devAccount: true })).toEqual(["dev_account"]);
    const record = recordOf(VELMOR_CARD);
    expect(cardPublicationProblems(record, false, { route: "save", account: FREE })).toEqual([]);
    expect(cardPublicationProblems(record, true, { route: "save", account: FREE })).toEqual(["set_aside"]);
    for (const publicValue of [undefined, { scope: "personal_only" as const }]) {
      const { public_value: _value, ...card } = record.card;
      expect(cardPublicationProblems({ ...record, card: publicValue === undefined ? card : { ...card, public_value: publicValue } },
        false, { route: "save", account: FREE })).toEqual(["not_public"]);
    }
    // The owner's choice of a card is the consent for the owner's own cards: no notice or dev check, but never a paid
    // private card, whose findings wait for acceptance.
    expect(cardPublicationProblems(record, false, { route: "owner", paidPrivate: false })).toEqual([]);
    expect(cardPublicationProblems(record, false, { route: "owner", paidPrivate: true })).toEqual(["not_free_contributor"]);
    expect(cardPublicationProblems(record, true, { route: "owner", paidPrivate: false })).toEqual(["set_aside"]);
  });

  it("holds a finding whose published text holds contact details, a card reference or a YouTube link", () => {
    const base = publishedFindingOf(recordOf(VELMOR_CARD), 1)!;
    expect(publicationHoldReasons(base)).toEqual([]);
    expect(publicationHoldReasons({ ...base, claim: `${base.claim} Write to jane.doe@example.org.` })).toEqual(["email_address"]);
    expect(publicationHoldReasons({ ...base, applies_to: "Adults who call +33 6 12 34 56 78" })).toEqual(["phone_number"]);
    expect(publicationHoldReasons({ ...base, subject: "zentarine (@zentarine_shop)" })).toEqual(["messaging_handle"]);
    expect(publicationHoldReasons({ ...base, why_not_usual: "As ARF-0142 also found." })).toEqual(["card_reference"]);
    expect(publicationHoldReasons({ ...base, what_would_change_it: "A talk on youtube.com shows it." })).toEqual(["youtube_link"]);
    expect(publicationHoldReasons({ ...base, topic: { key: "call-555-123-4567", label: "Velmor" } })).toEqual(["phone_number"]);
    expect(publicationHoldReasons({ ...base, numbers: [{ ...base.numbers![0]!, follow_up: "055 123 4567" }] }))
      .toEqual(["phone_number"]);
    // A source is an identifier, not text, and a gene such as ARF-6 is no card.
    expect(publicationHoldReasons({ ...base, sources: ["10.1002/(SICI)1097-0258(19980430)17:8<857::AID-SIM777>3.0.CO;2-E"],
      claim: `${base.claim} ARF-6 is a gene.` })).toEqual([]);
    expect(publicationHoldReasons({ ...base, claim: "Écrivez à jean@exemple.fr ou appelez le 06 12 34 56 78." }))
      .toEqual(["email_address", "phone_number"]);
  });

  it("plans a card: shown, held, left out, and an owner's decided finding in its decided state", () => {
    const card = {
      ...VELMOR_CARD,
      findings: [
        VELMOR_CARD.findings[0]!,
        { ...VELMOR_CARD.findings[1]!, claim: "Zentarine may ease the voice tremor; ask Dr Velm on 020 7946 0958." },
      ],
    };
    // A card saved before owner answer 170 may still hold a finding drawn from YouTube comments.
    const older = { ...recordOf(VELMOR_CARD).card.findings[0]!, claim: "Zentarine helped in audited comments.",
      tags: ["community_checked" as const] };
    const record = recordOf(card, [], NOW.toISOString(), [older]);
    const plan = planCardPublication({ record, setAside: false, route: { route: "save", account: FREE } });
    expect(plan.problems).toEqual([]);
    expect(plan.drafts.map(({ findingNumber, state, heldBecause }) => [findingNumber, state, heldBecause])).toEqual([
      [1, "unreviewed", null],
      [2, "held", ["phone_number"]],
    ]);
    expect(plan.leftOut).toEqual([{ findingNumber: 3, reason: "youtube_comments" }]);
    const decided = planCardPublication({ record, setAside: false, route: { route: "owner", paidPrivate: false },
      decided: new Map([[1, { state: "accepted" as const, atlasNumber: "F-1001" }],
        [2, { state: "rejected" as const, atlasNumber: null }]]) });
    expect(decided.drafts).toMatchObject([{ findingNumber: 1, state: "accepted", atlasNumber: "F-1001", heldBecause: null }]);
    expect(decided.leftOut).toEqual([{ findingNumber: 2, reason: "rejected" }, { findingNumber: 3, reason: "youtube_comments" }]);
    expect(planCardPublication({ record, setAside: true, route: { route: "save", account: FREE } }))
      .toEqual({ problems: ["set_aside"], drafts: [], leftOut: [] });
  });

  it("gives a decided finding's publication its state from the decision and the F number's intents", () => {
    const intent = (intentKind: AtlasIntentView["intentKind"], status: AtlasIntentView["status"], payload: object) =>
      ({ intentKind, publicNumber: "F-1001", status, payload }) as unknown as AtlasIntentView;
    const accept = (edited: boolean) => intent("accept", "COMPLETED", { kind: "accept", editedAtAcceptance: edited });
    const decision = { itemKind: "finding" as const, decision: "accepted" as const, publicNumber: "F-1001" };
    expect(decidedPublicationState(decision, [accept(false)])).toEqual({ state: "accepted", atlasNumber: "F-1001" });
    expect(decidedPublicationState(decision, [accept(true)])).toEqual({ state: "edited", atlasNumber: "F-1001" });
    expect(decidedPublicationState(decision, [accept(false), intent("revise", "PENDING", { kind: "revise" })]))
      .toEqual({ state: "edited", atlasNumber: "F-1001" });
    expect(decidedPublicationState(decision, [accept(false), intent("revise", "FAILED", { kind: "revise" })]))
      .toEqual({ state: "accepted", atlasNumber: "F-1001" });
    expect(decidedPublicationState({ ...decision, decision: "rechecked" }, [accept(false)]))
      .toEqual({ state: "accepted", atlasNumber: "F-1001" });
    expect(decidedPublicationState({ itemKind: "finding", decision: "rejected", publicNumber: null }, []))
      .toEqual({ state: "rejected", atlasNumber: null });
    expect(decidedPublicationState({ ...decision, itemKind: "open_lead" }, [])).toBeUndefined();
  });
});

describe("publishing at the save", () => {
  const CONTEXT = (account?: FindingsSaveAccount): FindingsSaveContext =>
    ({ surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64), ...(account === undefined ? {} : { account }) });

  function harness(store: AtlasPublicationStore = new InMemoryAtlasPublicationStore()) {
    const github = new FakeGitHub();
    const service = new FindingsSaveService({
      receiptSecret: () => SECRET,
      limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
      queue: new GitHubFindingsQueue({
        tokenProvider: { getToken: async () => "findings-token-fixture" },
        fetch: github.fetch,
        repository: DEFAULT_FINDINGS_REPOSITORY,
      }),
      protocols: async () => PROTOCOLS,
      version: "0.1.0",
      build: "0123abc",
      now: () => NOW,
      publisher: new AtlasCardPublisher({ store, now: () => NOW }),
    });
    const save = (card: object, account: FindingsSaveAccount | undefined, thread = "1", receiptClaims: object = {}) => {
      const parsed = findingsCardSchema.parse(card);
      return service.save({
        findings_card: card,
        contributor: thread.padStart(64, "0"),
        finalization_receipt: issueResearchReceipt("finalization", {
          status: "ready", depth: "standard", target: "0123456789ab", findings: findingsCardDigest(parsed),
          bases: parsed.findings.map(() => "full_text_audit"), ...receiptClaims,
        }, { secret: SECRET, now: () => NOW }),
      }, CONTEXT(account));
    };
    return { github, service, store, save };
  }

  const markerOf = (body: string) => parseMarker(body, "askrigor-findings-card", (value) => value);

  it("publishes a free contributor's card right after its save, and its marker says so", async () => {
    const h = harness();
    await expect(h.save(VELMOR_CARD, FREE)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    await h.service.publicationsSettled();
    const rows = await h.store.inspect({});
    expect(rows.map(({ publicationNumber, cardNumber, findingNumber, state }) =>
      [publicationNumber, cardNumber, findingNumber, state])).toEqual([["P-1002", 42, 2, "unreviewed"],
      ["P-1001", 42, 1, "unreviewed"]]);
    const stored = JSON.parse(/(`{3,})json\n([\s\S]*?)\n\1/u.exec(h.github.issue(42).body)![2]!) as FindingsRecord;
    expect(rows[0]!.cardSha256).toBe(stored.card_sha256);
    expect(rows[1]!.published).toEqual(publishedFindingOf(stored, 1));
    expect(markerOf(h.github.issue(42).body)).toMatchObject({ atlas_publish: true });
    expect(markerOf(h.github.issue(42).body)).not.toHaveProperty("paid_private");
  });

  it("publishes nothing for a paid private, dev, earlier-notice or unknown account, and marks a paid private card", async () => {
    for (const [account, paid] of [
      [{ mode: "PAID_PRIVATE", noticeVersion: null, devAccount: false }, true],
      [{ ...FREE, devAccount: true }, false],
      [{ ...FREE, noticeVersion: EARLIER_RESEARCH_USE_NOTICE_VERSIONS.at(-1)! }, false],
      [undefined, false],
    ] as Array<[FindingsSaveAccount | undefined, boolean]>) {
      const h = harness();
      await expect(h.save(VELMOR_CARD, account)).resolves.toMatchObject({ status: "saved" });
      await h.service.publicationsSettled();
      expect(await h.store.inspect({}), JSON.stringify(account)).toEqual([]);
      const marker = markerOf(h.github.issue(42).body)!;
      expect(marker).not.toHaveProperty("atlas_publish");
      expect(marker.paid_private === true).toBe(paid);
    }
  });

  it("publishes a retried save once, and nothing for a later save joining an open card", async () => {
    const h = harness();
    const parsed = findingsCardSchema.parse(LOW_DOSE_CARD);
    const receipt = issueResearchReceipt("finalization", {
      status: "ready", depth: "standard", target: "0123456789ab", findings: findingsCardDigest(parsed), bases: ["full_text_audit"],
    }, { secret: SECRET, now: () => NOW });
    const input = { findings_card: LOW_DOSE_CARD, contributor: "1".padStart(64, "0"), finalization_receipt: receipt };
    await h.service.save(input, CONTEXT(FREE));
    await h.service.save(input, CONTEXT(FREE));
    await h.service.publicationsSettled();
    expect((await h.store.inspect({})).map(({ publicationNumber }) => publicationNumber)).toEqual(["P-1001"]);
    // Another person's save of the same question and claims joins ARF-0042 as a later save: its findings are the
    // card's, published once.
    await expect(h.save(LOW_DOSE_CARD, FREE, "2", { target: "ba9876543210" })).resolves.toMatchObject({
      status: "existing_card", card_id: "ARF-0042", occurrence_count: 2 });
    await h.service.publicationsSettled();
    expect((await h.store.inspect({})).map(({ publicationNumber }) => publicationNumber)).toEqual(["P-1001"]);
  });

  it("withdraws the unreviewed publications of a card the same research thread replaces", async () => {
    const h = harness();
    await h.save(LOW_DOSE_CARD, FREE);
    const corrected = {
      ...LOW_DOSE_CARD,
      findings: [{ ...LOW_DOSE_CARD.findings[0]!, claim: `${LOW_DOSE_CARD.findings[0]!.claim} It held at 24 weeks too.` }],
    };
    await expect(h.save(corrected, FREE)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0043", replaced_count: 1 });
    await h.service.publicationsSettled();
    expect((await h.store.inspect({})).map(({ publicationNumber, cardNumber, state, withdrawnBecause }) =>
      [publicationNumber, cardNumber, state, withdrawnBecause])).toEqual([
      ["P-1002", 43, "unreviewed", null],
      ["P-1001", 42, "withdrawn", "card_replaced"],
    ]);
  });

  it("never fails or holds back a save when publishing fails or hangs", async () => {
    const failing = new InMemoryAtlasPublicationStore();
    failing.publish = async () => { throw new Error("database unavailable"); };
    const h = harness(failing);
    await expect(h.save(VELMOR_CARD, FREE)).resolves.toMatchObject({ status: "saved", card_id: "ARF-0042" });
    await h.service.publicationsSettled();
    expect(await failing.inspect({})).toEqual([]);

    const hanging = new InMemoryAtlasPublicationStore();
    hanging.publish = () => new Promise(() => undefined);
    const slow = harness(hanging);
    const started = Date.now();
    await expect(slow.save(VELMOR_CARD, FREE)).resolves.toMatchObject({ status: "saved" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("publishes nothing of a set-aside card when its save is retried", async () => {
    const failing = new InMemoryAtlasPublicationStore();
    const publish = failing.publish.bind(failing);
    let fail = true;
    failing.publish = async (input) => {
      if (fail) throw new Error("database unavailable");
      return publish(input);
    };
    const h = harness(failing);
    const parsed = findingsCardSchema.parse(LOW_DOSE_CARD);
    const input = {
      findings_card: LOW_DOSE_CARD,
      contributor: "1".padStart(64, "0"),
      finalization_receipt: issueResearchReceipt("finalization", {
        status: "ready", depth: "standard", target: "0123456789ab", findings: findingsCardDigest(parsed),
        bases: ["full_text_audit"],
      }, { secret: SECRET, now: () => NOW }),
    };
    await h.service.save(input, CONTEXT(FREE));
    await h.service.publicationsSettled();
    h.github.issue(42).labels.push({ name: "set-aside" });
    fail = false;
    await h.service.save(input, CONTEXT(FREE));
    await h.service.publicationsSettled();
    expect(await failing.inspect({})).toEqual([]);
  });
});

describe("keeping a card's publications in line with its decisions", () => {
  it("moves each decided finding's publication and erases the fields of an F number being erased", async () => {
    const store = new InMemoryAtlasPublicationStore();
    const record = recordOf(VELMOR_CARD, [["full_text_audit"], []]);
    const plan = planCardPublication({ record, setAside: false, route: { route: "save", account: FREE } });
    await store.publish({ cardNumber: 42, cardSha256: record.card_sha256, findings: plan.drafts,
      publishedAt: NOW.toISOString(), revive: false });
    const decision = (itemNumber: number, decided: "accepted" | "rejected", publicNumber: string | null) => ({
      cardNumber: 42, itemKind: "finding" as const, itemNumber, decision: decided, publicNumber, cardSha256: "d".repeat(64),
      ownerReason: null, intentId: null, decidedAt: NOW.toISOString(), intent: null,
    });
    const intents = [
      { intentKind: "accept", publicNumber: "F-1001", status: "COMPLETED", payload: { kind: "accept", editedAtAcceptance: true } },
      { intentKind: "erase", publicNumber: "F-1001", status: "PENDING", payload: { kind: "erase" } },
    ] as unknown as AtlasIntentView[];
    const asked: string[][] = [];
    const changed = await reconcileCardPublications({
      store,
      cardNumber: 42,
      decisions: [decision(1, "accepted", "F-1001"), decision(2, "rejected", null)],
      intentsOf: async (numbers) => { asked.push([...numbers]); return intents; },
      at: "2026-11-05T09:00:00.000Z",
    });
    expect(asked).toEqual([["F-1001"]]);
    expect(changed.map(({ publicationNumber, state, published: fields }) => [publicationNumber, state, fields === null]))
      .toEqual([["P-1001", "edited", false], ["P-1002", "rejected", false], ["P-1001", "edited", true]]);
    // In line now: nothing more changes.
    expect(await reconcileCardPublications({
      store, cardNumber: 42, decisions: [decision(1, "accepted", "F-1001"), decision(2, "rejected", null)],
      intentsOf: async () => intents, at: "2026-11-05T09:00:00.000Z",
    })).toEqual([]);
  });
});

describe("publishing an accepted finding whose card has no publication of it", () => {
  const AT = "2026-11-05T09:00:00.000Z";
  const decision = (itemNumber: number, decided: "accepted" | "accepted_as_lead" | "rejected", publicNumber: string | null) => ({
    cardNumber: 42, itemKind: "finding" as const, itemNumber, decision: decided, publicNumber, cardSha256: "d".repeat(64),
    ownerReason: null, intentId: null, decidedAt: NOW.toISOString(), intent: null,
  });
  const edited = [{ intentKind: "accept", publicNumber: "F-1002", status: "PENDING",
    payload: { kind: "accept", editedAtAcceptance: true } }] as unknown as AtlasIntentView[];
  const rows = async (store: InMemoryAtlasPublicationStore) => (await store.inspect({}))
    .map(({ publicationNumber, cardNumber, cardSha256, findingNumber, state, atlasNumber, published }) =>
      [publicationNumber, cardNumber, cardSha256, findingNumber, state, atlasNumber, published?.claim ?? null]);

  it("publishes it in its decided state, accepted or edited with its F number, and nothing for a rejection", async () => {
    // A paid private card, or one of the owner's older cards, which nothing published at its save.
    const record = recordOf(VELMOR_CARD, [["full_text_audit"], []]);
    const store = new InMemoryAtlasPublicationStore();
    const decisions = [decision(1, "accepted", "F-1001"), decision(2, "accepted", "F-1002")];
    const changed = await reconcileCardPublications({
      store, cardNumber: 42, decisions, intentsOf: async () => edited, at: AT, card: { record, setAside: false },
    });
    expect(changed.map(({ publicationNumber, state, atlasNumber }) => [publicationNumber, state, atlasNumber]))
      .toEqual([["P-1001", "accepted", "F-1001"], ["P-1002", "edited", "F-1002"]]);
    expect(await rows(store)).toEqual([
      ["P-1002", 42, record.card_sha256, 2, "edited", "F-1002", VELMOR_CARD.findings[1]!.claim],
      ["P-1001", 42, record.card_sha256, 1, "accepted", "F-1001", VELMOR_CARD.findings[0]!.claim],
    ]);
    // Published once: the next read of the card changes nothing.
    expect(await reconcileCardPublications({
      store, cardNumber: 42, decisions, intentsOf: async () => edited, at: AT, card: { record, setAside: false },
    })).toEqual([]);

    // A rejection publishes nothing; a lead accepted as one is published, and its page shows it as a lead.
    const other = new InMemoryAtlasPublicationStore();
    expect(await reconcileCardPublications({
      store: other, cardNumber: 42, decisions: [decision(1, "rejected", null), decision(2, "accepted_as_lead", "F-1003")],
      intentsOf: async () => [], at: AT, card: { record, setAside: false },
    })).toMatchObject([{ publicationNumber: "P-1001", findingNumber: 2, state: "accepted", atlasNumber: "F-1003" }]);
    expect((await other.inspect({})).map(({ findingNumber }) => findingNumber)).toEqual([2]);
  });

  it("publishes nothing for a set-aside card, a finding drawn from YouTube comments, one with a publication in any state, or without the card", async () => {
    const record = recordOf(VELMOR_CARD, [["full_text_audit"], []], NOW.toISOString(),
      [{ ...recordOf(VELMOR_CARD).card.findings[0]!, claim: "Backed by video comments.", youtube_videos: 2 }]);
    const decisions = [decision(3, "accepted", "F-1009")];
    const store = new InMemoryAtlasPublicationStore();
    // The third finding rests on YouTube comments, which are never published (owner answers 170 and 173).
    expect(await reconcileCardPublications({
      store, cardNumber: 42, decisions, intentsOf: async () => [], at: AT, card: { record, setAside: false },
    })).toEqual([]);
    // A set-aside card stays off the pages, and without the card nothing is published.
    for (const card of [{ record, setAside: true }, undefined]) {
      expect(await reconcileCardPublications({
        store, cardNumber: 42, decisions: [decision(1, "accepted", "F-1001")], intentsOf: async () => [], at: AT,
        ...(card === undefined ? {} : { card }),
      })).toEqual([]);
    }
    expect(await store.inspect({})).toEqual([]);
    // A finding the owner unpublished stays unpublished when it is accepted.
    const plan = planCardPublication({ record, setAside: false, route: { route: "save", account: FREE } });
    await store.publish({ cardNumber: 42, cardSha256: record.card_sha256, findings: plan.drafts, publishedAt: AT,
      revive: false });
    await store.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1001"], ownerReason: "Wrong.",
      withdrawnAt: AT });
    expect(await reconcileCardPublications({
      store, cardNumber: 42, decisions: [decision(1, "accepted", "F-1001")], intentsOf: async () => [], at: AT,
      card: { record, setAside: false },
    })).toEqual([]);
    expect((await store.inspect({ publicationNumbers: ["P-1001"] }))[0]).toMatchObject({ state: "withdrawn",
      withdrawnBecause: "owner_unpublished" });
  });

  it("drafts a decided finding's publication only for an accepted or edited one that can be published", () => {
    const record = recordOf(VELMOR_CARD, [["full_text_audit"], []]);
    expect(decidedPublicationDraft(record, 1, { state: "accepted", atlasNumber: "F-1001" })).toMatchObject({
      findingNumber: 1, state: "accepted", atlasNumber: "F-1001", heldBecause: null,
      published: { claim: VELMOR_CARD.findings[0]!.claim },
    });
    expect(decidedPublicationDraft(record, 1, { state: "rejected", atlasNumber: null })).toBeUndefined();
    expect(decidedPublicationDraft(record, 9, { state: "accepted", atlasNumber: "F-1001" })).toBeUndefined();
  });
});

describe("the runtime's publication store", () => {
  it("exists only while the owner's Atlas actions are open and the review database is configured", async () => {
    const review = {
      ASKRIGOR_RESEARCH_REVIEW_ENABLED: "true",
      ASKRIGOR_RESEARCH_REVIEW_DATABASE_URL: "postgres://review@127.0.0.1:5432/askrigor_living_evidence",
    };
    expect(createAtlasPublicationStoreFromEnv({ ...review })).toBeUndefined();
    expect(createAtlasPublicationStoreFromEnv({ ...review, ASKRIGOR_ATLAS_REVIEW: "disabled" })).toBeUndefined();
    expect(createAtlasPublicationStoreFromEnv({ ASKRIGOR_ATLAS_REVIEW: "enabled" })).toBeUndefined();
    expect(createAtlasPublicationStoreFromEnv({ ...review, ASKRIGOR_ATLAS_REVIEW: "enabled",
      ASKRIGOR_RESEARCH_REVIEW_DATABASE_URL: "https://not-postgres.example" })).toBeUndefined();
    const store = createAtlasPublicationStoreFromEnv({ ...review, ASKRIGOR_ATLAS_REVIEW: "enabled" });
    expect(store).toBeInstanceOf(PostgresAtlasPublicationStore);
    expect(store!.schema).toBe("living_evidence");
    await store!.close();
  });
});
