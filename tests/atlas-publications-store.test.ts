import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ADMITTED_MIGRATION_EDITS,
  ATLAS_PUBLICATION_HOLD_REASONS,
  ATLAS_PUBLICATION_ROUTES,
  ATLAS_PUBLICATION_SCHEMA,
  ATLAS_PUBLICATION_SCHEMA_V2,
  ATLAS_PUBLICATION_STATES,
  ATLAS_PUBLICATION_WITHDRAWN_REASONS,
  AtlasPublicationError,
  InMemoryAtlasPublicationStore,
  PostgresAtlasPublicationStore,
  atlasPublishedFindingSchema,
  migrationDigestOutcome,
  type AtlasPublicationDraft,
  type AtlasPublishedFinding,
} from "@askrigor/evidence-repository";

// Decision 171, section 4B: the publications store, in memory with migration 0021's semantics, and in PostgreSQL through
// the review role's six functions (checked here by the calls it makes; the Docker acceptance runs them against
// PostgreSQL).

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const AT = "2026-11-04T09:00:00.000Z";
const LATER = "2026-11-05T10:00:00.000Z";

const published = (claim = "In an invented trial, zentarine 20 mg cut relapse from 30 of 120 to 18 of 120."):
  AtlasPublishedFinding => ({
  schema: ATLAS_PUBLICATION_SCHEMA,
  topic: { key: "velmor-syndrome", label: "Velmor syndrome" },
  claim,
  certainty: "moderate",
  applies_to: "Adults with Velmor syndrome",
  kind: "effect",
  subject: "zentarine",
  subject_type: "supplement",
  direction: "benefit",
  numbers: [{
    outcome: "relapse", better: "fewer", option: "zentarine 20 mg", option_events: 18, option_total: 120,
    comparator: "placebo", comparator_events: 30, comparator_total: 120, follow_up: "52 weeks",
  }],
  searches: null,
  sources: ["10.0000/synthetic-velmor-a"],
  why_not_usual: "Quick answers miss the dose the trials used.",
  what_would_change_it: "A larger trial at the lower dose.",
  verified_bases: ["full_text_audit"],
  saved_on: "2026-11-04",
  askrigor_version: "0.1.0",
});

const draft = (findingNumber: number, overrides: Partial<AtlasPublicationDraft> = {}): AtlasPublicationDraft => ({
  findingNumber,
  state: "unreviewed",
  atlasNumber: null,
  heldBecause: null,
  published: published(`Finding ${findingNumber}: zentarine 20 mg cut relapse in an invented trial.`),
  ...overrides,
});

describe("the published fields", () => {
  it("hold only what a page shows: no ARF number, account, thread key, answer quote, surface, model or rates", () => {
    expect(atlasPublishedFindingSchema.parse(published())).toEqual(published());
    for (const key of ["answer_quote", "card", "card_id", "contributor", "account", "thread", "surface",
      "reported_model_unverified", "youtube_videos"]) {
      expect(atlasPublishedFindingSchema.safeParse({ ...published(), [key]: "x" }).success, key).toBe(false);
    }
    // Rates, NNT and NNH are worked out when the pages render, from the counts.
    const [entry] = published().numbers!;
    expect(atlasPublishedFindingSchema.safeParse({ ...published(), numbers: [{ ...entry, nnt: 10 }] }).success).toBe(false);
    expect(atlasPublishedFindingSchema.safeParse({ ...published(), numbers: [{ ...entry, option_events: 121 }] }).success)
      .toBe(false);
    // comment_audit is never a published basis.
    expect(atlasPublishedFindingSchema.safeParse({ ...published(), verified_bases: ["comment_audit"] }).success).toBe(false);
  });

  it("add the card's question and usual answer only in version 2, with titles that name a published source", () => {
    const context = { question: "Does zentarine ease the tremor of Velmor syndrome?",
      usual_answer: "A quick answer calls it gentle." };
    const v2 = { ...published(), schema: ATLAS_PUBLICATION_SCHEMA_V2, ...context,
      source_details: [{ source: "10.0000/synthetic-velmor-a", title: "An invented trial", year: 2025 }] };
    expect(atlasPublishedFindingSchema.parse(v2)).toEqual(v2);
    const { source_details: _titles, ...untitled } = v2;
    expect(atlasPublishedFindingSchema.safeParse(untitled).success).toBe(true);
    // Version 1 has none of them; version 2 has both texts.
    for (const extra of [context, { question: context.question }, { source_details: v2.source_details }]) {
      expect(atlasPublishedFindingSchema.safeParse({ ...published(), ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    for (const missing of ["question", "usual_answer"] as const) {
      const { [missing]: _left, ...without } = v2;
      expect(atlasPublishedFindingSchema.safeParse(without).success, missing).toBe(false);
    }
    // A title names one published source, once, with a year in range, and no field beyond.
    for (const details of [
      [{ source: "10.0000/not-published", title: "An invented trial", year: 2025 }],
      [v2.source_details[0], v2.source_details[0]],
      [{ ...v2.source_details[0], year: 1066 }],
      [{ ...v2.source_details[0], title: "" }],
      [{ ...v2.source_details[0], authors: "Someone" }],
    ]) {
      expect(atlasPublishedFindingSchema.safeParse({ ...v2, source_details: details }).success, JSON.stringify(details)).toBe(false);
    }
    expect(atlasPublishedFindingSchema.safeParse({ ...v2, question: "x".repeat(301) }).success).toBe(false);
    expect(atlasPublishedFindingSchema.safeParse({ ...v2, usual_answer: "x".repeat(401) }).success).toBe(false);
  });
});

describe("the in-memory publication store", () => {
  it("publishes each finding once by card digest and place, numbering them P-1001 upward", async () => {
    const store = new InMemoryAtlasPublicationStore();
    const first = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2,
      { state: "held", heldBecause: ["phone_number"] })], publishedAt: AT, revive: false });
    expect(first.map(({ publicationNumber, findingNumber, state, outcome }) =>
      [publicationNumber, findingNumber, state, outcome])).toEqual([
      ["P-1001", 1, "unreviewed", "published"],
      ["P-1002", 2, "held", "published"],
    ]);
    expect(first[1]).toMatchObject({ heldBecause: ["phone_number"], cardNumber: 250, cardSha256: DIGEST_A });
    // A retried save publishes nothing twice.
    const again = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2,
      { state: "held", heldBecause: ["phone_number"] })], publishedAt: LATER, revive: false });
    expect(again.map(({ publicationNumber, outcome }) => [publicationNumber, outcome]))
      .toEqual([["P-1001", "existing"], ["P-1002", "existing"]]);
    expect(again[0]!.publishedAt).toBe(AT);
    // Another card digest is another publication.
    const other = await store.publish({ cardNumber: 251, cardSha256: DIGEST_B, findings: [draft(1)], publishedAt: LATER,
      revive: false });
    expect(other[0]!.publicationNumber).toBe("P-1003");
  });

  it("refuses what no publication may hold", async () => {
    const store = new InMemoryAtlasPublicationStore();
    const publish = (findings: AtlasPublicationDraft[], extra: Record<string, unknown> = {}) =>
      store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings, publishedAt: AT, revive: false, ...extra });
    for (const findings of [
      [],
      [draft(1), draft(1)],
      [draft(6)],
      [draft(1, { state: "accepted" })],
      [draft(1, { atlasNumber: "F-1001" })],
      [draft(1, { state: "held" })],
      [draft(1, { heldBecause: ["phone_number"] })],
      [draft(1, { state: "held", heldBecause: ["link" as never] })],
      [draft(1, { state: "rejected" as never })],
      [draft(1, { published: { ...published(), answer_quote: "The answer's sentence." } as never })],
    ]) {
      await expect(publish(findings), JSON.stringify(findings.map(({ state }) => state))).rejects
        .toBeInstanceOf(AtlasPublicationError);
    }
    await expect(publish([draft(1)], { cardSha256: "not-a-digest" })).rejects.toBeInstanceOf(AtlasPublicationError);
    await expect(publish([draft(1)], { cardNumber: 0 })).rejects.toBeInstanceOf(AtlasPublicationError);
    expect(store.allRows()).toEqual([]);
  });

  it("lists by state, card, number and F number, newest first, a page at a time", async () => {
    const store = new InMemoryAtlasPublicationStore();
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2)], publishedAt: AT, revive: false });
    await store.publish({ cardNumber: 251, cardSha256: DIGEST_B, findings: [draft(1)], publishedAt: AT, revive: false });
    await store.decide({ cardNumber: 250, findingNumber: 2, state: "accepted", atlasNumber: "F-1007", decidedAt: LATER });
    const numbers = async (query: Parameters<typeof store.inspect>[0]) =>
      (await store.inspect(query)).map(({ publicationNumber }) => publicationNumber);
    expect(await numbers({})).toEqual(["P-1003", "P-1002", "P-1001"]);
    expect(await numbers({ states: ["unreviewed"] })).toEqual(["P-1003", "P-1001"]);
    expect(await numbers({ cardNumbers: [250] })).toEqual(["P-1002", "P-1001"]);
    expect(await numbers({ publicationNumbers: ["P-1003"] })).toEqual(["P-1003"]);
    expect(await numbers({ atlasNumbers: ["F-1007"] })).toEqual(["P-1002"]);
    expect(await numbers({ before: 1003, limit: 1 })).toEqual(["P-1002"]);
    await expect(store.inspect({ limit: 501 })).rejects.toBeInstanceOf(AtlasPublicationError);
    await expect(store.inspect({ states: ["shown" as never] })).rejects.toBeInstanceOf(AtlasPublicationError);
  });

  it("moves a decided finding's publications, never a withdrawn one, and reports only what changed", async () => {
    const store = new InMemoryAtlasPublicationStore();
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2, { state: "held",
      heldBecause: ["email_address"] }), draft(3)], publishedAt: AT, revive: false });
    expect(await store.decide({ cardNumber: 250, findingNumber: 1, state: "accepted", atlasNumber: "F-1001",
      decidedAt: LATER })).toMatchObject([{ publicationNumber: "P-1001", state: "accepted", atlasNumber: "F-1001",
      stateChangedAt: LATER }]);
    // The same decision again changes nothing.
    expect(await store.decide({ cardNumber: 250, findingNumber: 1, state: "accepted", atlasNumber: "F-1001",
      decidedAt: LATER })).toEqual([]);
    // A held finding the owner edits at acceptance shows the owner's version; its reasons stay, kinds only.
    expect(await store.decide({ cardNumber: 250, findingNumber: 2, state: "edited", atlasNumber: "F-1002",
      decidedAt: LATER })).toMatchObject([{ state: "edited", atlasNumber: "F-1002", heldBecause: ["email_address"] }]);
    await store.withdraw({ reason: "card_replaced", cardNumbers: [250], withdrawnAt: LATER });
    expect(await store.decide({ cardNumber: 250, findingNumber: 3, state: "rejected", atlasNumber: null,
      decidedAt: LATER })).toEqual([]);
    await expect(store.decide({ cardNumber: 250, findingNumber: 1, state: "rejected", atlasNumber: "F-1001",
      decidedAt: LATER })).rejects.toBeInstanceOf(AtlasPublicationError);
    await expect(store.decide({ cardNumber: 250, findingNumber: 1, state: "accepted", atlasNumber: null,
      decidedAt: LATER })).rejects.toBeInstanceOf(AtlasPublicationError);
  });

  it("withdraws by reason: set aside and unpublished take what shows, replaced takes what is not reviewed", async () => {
    const store = new InMemoryAtlasPublicationStore();
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2), draft(3)], publishedAt: AT,
      revive: false });
    await store.decide({ cardNumber: 250, findingNumber: 2, state: "accepted", atlasNumber: "F-1001", decidedAt: AT });
    await store.decide({ cardNumber: 250, findingNumber: 3, state: "rejected", atlasNumber: null, decidedAt: AT });
    expect((await store.withdraw({ reason: "card_replaced", cardNumbers: [250], withdrawnAt: LATER }))
      .map(({ publicationNumber, state, withdrawnBecause }) => [publicationNumber, state, withdrawnBecause]))
      .toEqual([["P-1001", "withdrawn", "card_replaced"]]);
    expect((await store.withdraw({ reason: "card_set_aside", cardNumbers: [250], withdrawnAt: LATER }))
      .map(({ publicationNumber, withdrawnBecause, atlasNumber }) => [publicationNumber, withdrawnBecause, atlasNumber]))
      .toEqual([["P-1002", "card_set_aside", "F-1001"]]);
    await store.publish({ cardNumber: 251, cardSha256: DIGEST_B, findings: [draft(1)], publishedAt: AT, revive: false });
    expect(await store.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1004"],
      ownerReason: "It overstates the trial.", withdrawnAt: LATER })).toMatchObject([{ publicationNumber: "P-1004",
      state: "withdrawn", withdrawnBecause: "owner_unpublished", ownerReason: "It overstates the trial." }]);
    await expect(store.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1004"], ownerReason: " ",
      withdrawnAt: LATER })).rejects.toBeInstanceOf(AtlasPublicationError);
    await expect(store.withdraw({ reason: "card_set_aside", cardNumbers: [], withdrawnAt: LATER })).rejects
      .toBeInstanceOf(AtlasPublicationError);
  });

  it("forgets a card: what is not accepted is withdrawn and erased, the accepted one stays, and no row keeps the digest", async () => {
    const store = new InMemoryAtlasPublicationStore();
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2), draft(3), draft(4)],
      publishedAt: AT, revive: false });
    await store.decide({ cardNumber: 250, findingNumber: 1, state: "accepted", atlasNumber: "F-1001", decidedAt: AT });
    await store.decide({ cardNumber: 250, findingNumber: 2, state: "edited", atlasNumber: "F-1002", decidedAt: AT });
    await store.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1004"], ownerReason: "Private reason.",
      withdrawnAt: AT });
    const changed = await store.withdraw({ reason: "card_forgotten", cardNumbers: [250], withdrawnAt: LATER });
    expect(changed.map(({ publicationNumber, state, withdrawnBecause }) => [publicationNumber, state, withdrawnBecause]))
      .toEqual([
        ["P-1001", "accepted", null],
        ["P-1002", "withdrawn", "card_forgotten"],
        ["P-1003", "withdrawn", "card_forgotten"],
        ["P-1004", "withdrawn", "card_forgotten"],
      ]);
    for (const row of store.allRows()) {
      expect(row.cardSha256).toBeNull();
      expect(row.cardForgottenAt).toBe(LATER);
      expect(row.ownerReason).toBeNull();
      expect(row.published === null).toBe(row.state !== "accepted");
      expect(row.textsErasedAt === null).toBe(row.state === "accepted");
    }
    // Forgetting again changes nothing; a later correction of the accepted finding withdraws it, as the card is gone.
    expect(await store.withdraw({ reason: "card_forgotten", cardNumbers: [250], withdrawnAt: LATER })).toEqual([]);
    expect(await store.markEdited("F-1001", LATER)).toMatchObject([{ publicationNumber: "P-1001", state: "withdrawn",
      withdrawnBecause: "card_forgotten", published: null }]);
    // A forgotten card's digest publishes anew only as a new row: nothing comes back.
    expect(await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1)], publishedAt: LATER,
      revive: true })).toMatchObject([{ publicationNumber: "P-1005", outcome: "published" }]);
  });

  it("publishes again on the owner's choice what was set aside, replaced or unpublished, never what was erased", async () => {
    const store = new InMemoryAtlasPublicationStore();
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2), draft(3)], publishedAt: AT,
      revive: false });
    await store.decide({ cardNumber: 250, findingNumber: 3, state: "accepted", atlasNumber: "F-1003", decidedAt: AT });
    await store.withdraw({ reason: "card_set_aside", cardNumbers: [250], withdrawnAt: AT });
    await store.eraseTexts("F-1003", LATER);
    // The save path never revives.
    expect((await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2)],
      publishedAt: LATER, revive: false })).map(({ outcome }) => outcome)).toEqual(["existing", "existing"]);
    const revived = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1), draft(2,
      { state: "held", heldBecause: ["messaging_handle"] }), draft(3)], publishedAt: LATER, revive: true });
    expect(revived.map(({ publicationNumber, outcome, state }) => [publicationNumber, outcome, state])).toEqual([
      ["P-1001", "revived", "unreviewed"],
      ["P-1002", "revived", "held"],
      ["P-1003", "existing", "withdrawn"],
    ]);
    expect(revived[0]).toMatchObject({ withdrawnBecause: null, ownerReason: null, publishedAt: AT, stateChangedAt: LATER });
  });

  it("erases the published fields of every publication naming an F number, and moves accepted ones to edited", async () => {
    const store = new InMemoryAtlasPublicationStore();
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1)], publishedAt: AT, revive: false });
    await store.publish({ cardNumber: 251, cardSha256: DIGEST_B, findings: [draft(1)], publishedAt: AT, revive: false });
    await store.decide({ cardNumber: 250, findingNumber: 1, state: "accepted", atlasNumber: "F-1001", decidedAt: AT });
    // A re-check takes the F number it re-checks.
    await store.decide({ cardNumber: 251, findingNumber: 1, state: "accepted", atlasNumber: "F-1001", decidedAt: AT });
    expect((await store.markEdited("F-1001", LATER)).map(({ publicationNumber, state }) => [publicationNumber, state]))
      .toEqual([["P-1001", "edited"], ["P-1002", "edited"]]);
    const erased = await store.eraseTexts("F-1001", LATER);
    expect(erased.map(({ publicationNumber, published: fields, textsErasedAt }) => [publicationNumber, fields, textsErasedAt]))
      .toEqual([["P-1001", null, LATER], ["P-1002", null, LATER]]);
    expect(await store.eraseTexts("F-1001", LATER)).toEqual([]);
    await expect(store.eraseTexts("ARF-0250", LATER)).rejects.toBeInstanceOf(AtlasPublicationError);
  });
});

describe("the PostgreSQL publication store", () => {
  /** The store with its pool replaced by one that records each call and answers with the rows given. */
  function recorded(rows: unknown[]) {
    const store = new PostgresAtlasPublicationStore({ connectionString: "postgres://review@127.0.0.1/askrigor" });
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    (store as unknown as { pool: { query: unknown } }).pool = {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql: sql.replace(/\s+/gu, " ").trim(), values });
        return { rows };
      },
    };
    return { store, calls };
  }

  const row = {
    publication_number: "P-1001", card_number: 250, card_sha256: DIGEST_A, finding_number: 1, published_json: published(),
    state: "unreviewed", atlas_number: null, held_because: null, withdrawn_because: null, owner_reason: null,
    published_at: new Date(AT), state_changed_at: new Date(AT), card_forgotten_at: null, texts_erased_at: null,
  };

  it("calls only the review role's functions, with the store's checks first, and reads each row back strictly", async () => {
    const { store, calls } = recorded([{ ...row, outcome: "published" }]);
    const rows = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1)], publishedAt: AT,
      revive: false });
    expect(rows).toMatchObject([{ publicationNumber: "P-1001", outcome: "published", publishedAt: AT, published: published() }]);
    expect(calls[0]!.sql).toMatch(/FROM living_evidence\.publish_atlas_findings\( \$1::integer, \$2::text, \$3::jsonb, \$4::timestamptz, \$5::boolean \)$/u);
    expect(JSON.parse(calls[0]!.values[2] as string)).toEqual([draft(1)]);
    await store.inspect({ states: ["held"], before: 1005, limit: 20 });
    expect(calls[1]!.sql).toContain("FROM living_evidence.inspect_atlas_publications(");
    expect(calls[1]!.values).toEqual([["held"], null, null, null, 1005, 20]);
    await store.decide({ cardNumber: 250, findingNumber: 1, state: "edited", atlasNumber: "F-1001", decidedAt: AT });
    expect(calls[2]!.sql).toContain("FROM living_evidence.decide_atlas_publications(");
    await store.markEdited("F-1001", AT);
    expect(calls[3]!.sql).toContain("FROM living_evidence.edit_atlas_publications(");
    await store.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1001"], ownerReason: "Wrong.", withdrawnAt: AT });
    expect(calls[4]!.values).toEqual([null, ["P-1001"], "owner_unpublished", "Wrong.", AT]);
    await store.withdraw({ reason: "card_forgotten", cardNumbers: [250], withdrawnAt: AT });
    expect(calls[5]!.values).toEqual([[250], null, "card_forgotten", null, AT]);
    await store.eraseTexts("F-1001", AT);
    expect(calls[6]!.sql).toContain("FROM living_evidence.erase_atlas_publication_texts(");
    for (const { sql } of calls) expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b|FROM living_evidence\.atlas_publications\b/u);
    // Refused before any call.
    await expect(store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [draft(1, { state: "held" })],
      publishedAt: AT, revive: false })).rejects.toBeInstanceOf(AtlasPublicationError);
    expect(calls).toHaveLength(7);
    // Migration 0041: a draft the save shows at once says so in its JSON, which publish_atlas_findings stores.
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, findings: [{ ...draft(1), shownBy: "automatic_showing" }],
      publishedAt: AT, revive: false });
    expect(JSON.parse(calls[7]!.values[2] as string)).toEqual([{ ...draft(1), shownBy: "automatic_showing" }]);
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false,
      findings: [{ ...draft(1), shownBy: "automatic_showing", keptReason: "waiting for the owner" }] });
    expect(JSON.parse(calls[8]!.values[2] as string)).toEqual([{ ...draft(1), shownBy: "automatic_showing",
      keptReason: "waiting for the owner" }]);
  });

  // Codex's review of 17 Nov 2026, finding 1: a finding the save keeps for the owner is kept in the publishing's own
  // write, so a keep that fails afterwards never leaves it shown (migration 0041).
  it("keeps a draft that carries a kept reason in the same write, only an unreviewed one with a reason that reads", async () => {
    const store = new InMemoryAtlasPublicationStore();
    const [kept, shown] = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false,
      findings: [{ ...draft(1), shownBy: "automatic_showing", keptReason: "waiting for the owner" }, draft(2)] });
    expect(await store.inspectKept()).toEqual([expect.objectContaining({ publicationNumber: kept!.publicationNumber,
      state: "unreviewed", reason: "waiting for the owner" })]);
    expect(store.isKept(shown!.publicationNumber)).toBe(false);
    for (const keptReason of ["", " padded ", "x".repeat(2_001)]) {
      await expect(store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false,
        findings: [{ ...draft(3), keptReason }] })).rejects.toBeInstanceOf(AtlasPublicationError);
    }
    await expect(store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false,
      findings: [{ ...draft(3, { state: "held", heldBecause: ["card_reference"] }), keptReason: "waiting" }] }))
      .rejects.toBeInstanceOf(AtlasPublicationError);
  });

  // Codex's review of 17 Nov 2026, finding 4: how a publication reached the pages, stored with it (migration 0041).
  it("stores a draft shown at once as such, only for an unreviewed draft, and keeps it when the finding is published again", async () => {
    const store = new InMemoryAtlasPublicationStore();
    const [shown, held] = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false,
      findings: [{ ...draft(1), shownBy: "automatic_showing" }, draft(2, { state: "held", heldBecause: ["card_reference"] })] });
    expect(store.shownByOf(shown!.publicationNumber)).toBe("automatic_showing");
    expect(store.shownByOf(held!.publicationNumber)).toBeNull();
    for (const refused of [
      { ...draft(3, { state: "held", heldBecause: ["card_reference"] }), shownBy: "automatic_showing" as const },
      { ...draft(3), shownBy: "quick_answer_test" as unknown as "automatic_showing" },
    ]) {
      await expect(store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false,
        findings: [refused] })).rejects.toBeInstanceOf(AtlasPublicationError);
    }
    // The owner's publish_cards publishing it again, after an unpublishing, leaves how it first reached the pages.
    await store.withdraw({ reason: "owner_unpublished", publicationNumbers: [shown!.publicationNumber], ownerReason: "Wrong.",
      withdrawnAt: LATER });
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: LATER, revive: true, findings: [draft(1)] });
    expect(store.shownByOf(shown!.publicationNumber)).toBe("automatic_showing");
  });

  // Codex's re-review of 17 Nov 2026, finding 4: four routes stored apart. The owner's action and automatic showing are
  // written with the publication; the quick-answer test's only when it shows a finding it kept with its pass; a
  // publication from before 0041, or from an earlier image's publishing, has none (not recorded).
  it("stores each way a publication reached the pages apart, and the test's only from its recorded pass", async () => {
    expect(ATLAS_PUBLICATION_ROUTES).toEqual(["owner_action", "quick_answer_test", "automatic_showing"]);
    const store = new InMemoryAtlasPublicationStore();
    const rows = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false, findings: [
      { ...draft(1), shownBy: "owner_action" },
      { ...draft(2, { state: "accepted", atlasNumber: "F-1001" }), shownBy: "owner_action" },
      draft(3), draft(4), draft(5),
    ] });
    const [owner, accepted, tested, shownByOwner, untouched] = rows.map(({ publicationNumber }) => publicationNumber);
    expect(rows.map(({ publicationNumber }) => store.shownByOf(publicationNumber)))
      .toEqual(["owner_action", "owner_action", null, null, null]);
    for (const refused of [
      { ...draft(6, { state: "held", heldBecause: ["card_reference"] }), shownBy: "owner_action" as const },
      { ...draft(6), shownBy: "quick_answer_test" as const },
      { ...draft(6, { state: "accepted", atlasNumber: "F-1002" }), shownBy: "automatic_showing" as const },
    ]) {
      await expect(store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false,
        findings: [refused] })).rejects.toBeInstanceOf(AtlasPublicationError);
    }
    // Shown again after the quick-answer test kept it with its pass: the test's route; with any other reason: the owner's.
    const keep = (numbers: string[], reason: string | null) => store.keep({ publicationNumbers: numbers, atlasNumbers: [],
      keep: reason !== null, reason, at: LATER });
    await keep([tested!], "owner answer 240a: quick-answer test, passed, waiting for the whole picture");
    await keep([shownByOwner!], "owner answer 240a: quick-answer test, failed, challenges the usual view");
    await keep([tested!, shownByOwner!, untouched!], null);
    expect([tested, shownByOwner, untouched].map((number) => store.shownByOf(number!)))
      .toEqual(["quick_answer_test", "owner_action", null]);
    // The owner's publishing again of a withdrawn finding is the owner's action; without a route it stays as it was.
    await store.withdraw({ reason: "owner_unpublished", publicationNumbers: [tested!], ownerReason: "Wrong.", withdrawnAt: LATER });
    await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: LATER, revive: true,
      findings: [{ ...draft(3), shownBy: "owner_action" }] });
    expect(store.shownByOf(tested!)).toBe("owner_action");
    expect([owner, accepted].map((number) => store.shownByOf(number!))).toEqual(["owner_action", "owner_action"]);
  });

  // Codex's third review of 17 Nov 2026, finding 1 (migration 0041): a later save that says a finding may name a living
  // person holds what the owner hasn't decided and notes what he has, which stays as it is.
  it("holds for a later save's living-person yes only what the owner hasn't decided, and notes the rest", async () => {
    const store = new InMemoryAtlasPublicationStore();
    const rows = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false, findings: [
      { ...draft(1), shownBy: "automatic_showing" },
      draft(2, { state: "held", heldBecause: ["card_reference"] }),
      { ...draft(3), shownBy: "owner_action" },
      draft(4, { state: "accepted", atlasNumber: "F-1001" }),
      draft(5),
    ] });
    const [automatic, heldBefore, ownerShown, accepted, rejected] = rows.map(({ publicationNumber }) => publicationNumber);
    await store.decide({ cardNumber: 250, findingNumber: 5, state: "rejected", atlasNumber: null, decidedAt: AT });
    const numbers = [automatic!, heldBefore!, ownerShown!, accepted!, rejected!];
    expect((await store.holdForLivingPerson({ publicationNumbers: numbers, at: LATER }))
      .map(({ state, heldBecause, outcome }) => [state, heldBecause, outcome])).toEqual([
      ["held", ["living_person_review"], "held"],
      ["held", ["card_reference", "living_person_review"], "reason_added"],
      ["unreviewed", null, "noted"],
      ["accepted", null, "noted"],
      ["rejected", null, "unchanged"],
    ]);
    expect(await store.inspectLivingPersonNotes(numbers)).toEqual([{ publicationNumber: ownerShown, notedAt: LATER },
      { publicationNumber: accepted, notedAt: LATER }]);
    // Again: nothing more changes, and a note keeps when it was first made.
    expect((await store.holdForLivingPerson({ publicationNumbers: numbers, at: "2026-11-06T10:00:00.000Z" }))
      .map(({ outcome }) => outcome)).toEqual(["already_held", "already_held", "noted", "noted", "unchanged"]);
    expect((await store.inspectLivingPersonNotes([accepted!]))[0]!.notedAt).toBe(LATER);
    for (const refused of [[], ["F-1001"], Array.from({ length: 101 }, (_, index) => `P-${1001 + index}`)]) {
      await expect(store.holdForLivingPerson({ publicationNumbers: refused, at: LATER }))
        .rejects.toBeInstanceOf(AtlasPublicationError);
    }
    // Through the review role's two functions.
    const { store: postgres, calls } = recorded([{ held_publication_number: "P-1001", held_state: "held",
      held_reasons: ["living_person_review"], held_outcome: "held" }]);
    expect(await postgres.holdForLivingPerson({ publicationNumbers: ["P-1001"], at: AT })).toEqual([
      { publicationNumber: "P-1001", state: "held", heldBecause: ["living_person_review"], outcome: "held" }]);
    expect(calls[0]!.sql).toBe("SELECT * FROM living_evidence.hold_atlas_publications_for_living_person($1::text[], " +
      "$2::timestamptz)");
    const notes = recorded([{ noted_publication_number: "P-1001", noted_at: new Date(AT) }]);
    expect(await notes.store.inspectLivingPersonNotes(["P-1001"])).toEqual([{ publicationNumber: "P-1001", notedAt: AT }]);
    expect(notes.calls[0]!.sql).toBe("SELECT * FROM living_evidence.inspect_atlas_living_person_notes($1::text[])");
    expect(await notes.store.inspectLivingPersonNotes([])).toEqual([]);
    expect(notes.calls).toHaveLength(1);
  });

  it("refuses a row that does not read as a publication", async () => {
    const { store } = recorded([{ ...row, published_json: { ...published(), answer_quote: "x" } }]);
    await expect(store.inspect({})).rejects.toThrow();
    const unknownState = recorded([{ ...row, state: "shown" }]);
    await expect(unknownState.store.inspect({})).rejects.toThrow();
  });

  it("maps the functions' refusal to the store's error", async () => {
    const store = new PostgresAtlasPublicationStore({ connectionString: "postgres://review@127.0.0.1/askrigor" });
    (store as unknown as { pool: { query: unknown } }).pool = {
      query: async () => { throw new Error("ATLAS_PUBLICATION_INPUT_INVALID"); },
    };
    await expect(store.inspect({})).rejects.toBeInstanceOf(AtlasPublicationError);
  });
});

describe("migration 0021", () => {
  it("keeps its closed lists in step with the store's vocabularies", async () => {
    const migration = await readFile(new URL("../packages/evidence-repository/migrations/0021_atlas_publications.sql",
      import.meta.url), "utf8");
    const listOf = (constraint: string) => {
      const start = migration.indexOf(`ADD CONSTRAINT ${constraint} CHECK (`);
      return migration.slice(start, migration.indexOf(");", start));
    };
    for (const reason of ATLAS_PUBLICATION_HOLD_REASONS) {
      expect(listOf("atlas_publications_v1_held_check")).toContain(`"${reason}"`);
    }
    expect([...listOf("atlas_publications_v1_held_check").matchAll(/"([a-z_]+)"/gu)].map(([, reason]) => reason))
      .toEqual([...ATLAS_PUBLICATION_HOLD_REASONS]);
    expect([...listOf("atlas_publications_v1_withdrawn_reason_check").matchAll(/'([a-z_]+)'/gu)].map(([, reason]) => reason))
      .toEqual([...ATLAS_PUBLICATION_WITHDRAWN_REASONS]);
    const states = migration.slice(migration.indexOf("state text NOT NULL CHECK (state IN ("));
    expect([...states.slice(0, states.indexOf("))")).matchAll(/'([a-z_]+)'/gu)].map(([, state]) => state))
      .toEqual([...ATLAS_PUBLICATION_STATES]);
  });

  // Codex's re-review of 17 Nov 2026, finding 1 (P0): a finding that may name a living person is held for the owner,
  // a sixth reason. 0021 replaces its own list on every start, so the reason is added there, and the list may hold all
  // six; a later migration's wider list would be narrowed again by 0021 at the next start.
  it("holds a finding that may name a living person, with every other reason too, and no more than the six", async () => {
    const migration = await readFile(new URL("../packages/evidence-repository/migrations/0021_atlas_publications.sql",
      import.meta.url), "utf8");
    expect(ATLAS_PUBLICATION_HOLD_REASONS).toContain("living_person_review");
    expect(migration).toContain("AND jsonb_array_length(held_because) BETWEEN 1 AND 6\n");
    const store = new InMemoryAtlasPublicationStore();
    const rows = await store.publish({ cardNumber: 250, cardSha256: DIGEST_A, publishedAt: AT, revive: false, findings: [
      draft(1, { state: "held", heldBecause: ["living_person_review"] }),
      draft(2, { state: "held", heldBecause: [...ATLAS_PUBLICATION_HOLD_REASONS] }),
    ] });
    expect(rows.map(({ state, heldBecause }) => [state, heldBecause])).toEqual([
      ["held", ["living_person_review"]], ["held", [...ATLAS_PUBLICATION_HOLD_REASONS]]]);
    await expect(store.publish({ cardNumber: 251, cardSha256: DIGEST_B, publishedAt: AT, revive: false, findings: [
      draft(1, { state: "held", heldBecause: ["living_person_review", "living_person_review"] })] })).rejects
      .toBeInstanceOf(AtlasPublicationError);
  });
});

// Codex's re-review of 17 Nov 2026, finding 1: migrations are checksummed, so an edit to an applied one stops the next
// start. The one edit admitted is 0021's, from the digest every database recorded for it to the file's digest now, and
// only that edit: the file less the new reason is exactly the 0021 that recorded the old digest.
describe("the migrations' recorded digests", () => {
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const OLD_0021 = "f52a42ebd1a31f2adcef2ee267ab1a611e24d26afe44a3d9b04e2e7198d08443";

  it("admits only 0021's verified edit, from the digest it recorded to the file's digest now", async () => {
    const migration = await readFile(new URL("../packages/evidence-repository/migrations/0021_atlas_publications.sql",
      import.meta.url), "utf8");
    const before = migration
      .replace("BETWEEN 1 AND 6\n", "BETWEEN 1 AND 5\n")
      .replace(', "youtube_link", "living_person_review"]', ', "youtube_link"]');
    expect(before).not.toBe(migration);
    expect(sha(before)).toBe(OLD_0021);
    const now = sha(migration);
    expect(ADMITTED_MIGRATION_EDITS).toEqual({ "0021_atlas_publications": [{ from: OLD_0021, to: now }] });
    expect(migrationDigestOutcome("0021_atlas_publications", OLD_0021, now)).toBe("admitted_edit");
    expect(migrationDigestOutcome("0021_atlas_publications", now, now)).toBe("same");
    expect(migrationDigestOutcome("0021_atlas_publications", undefined, now)).toBe("first_run");
    // Never back, never from another digest, never for another migration.
    expect(migrationDigestOutcome("0021_atlas_publications", now, OLD_0021)).toBe("mismatch");
    expect(migrationDigestOutcome("0021_atlas_publications", "c".repeat(64), now)).toBe("mismatch");
    expect(migrationDigestOutcome("0024_atlas_kept_for_research", OLD_0021, now)).toBe("mismatch");
  });
});
