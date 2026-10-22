import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ATLAS_FINDING_PROMOTION_FAILURE_CODES,
  AtlasFindingPromotionRunner,
  AtlasIntentMismatchError,
  AtlasReviewError,
  AtlasWriteConflict,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPromotionStore,
  InMemoryAtlasReviewStore,
  atlasPromotionFailureCode,
  atlasPromotionReceiptSchema,
  deterministicUuid,
  prepareAtlasFindingIntent,
  sha256,
  stableJson,
  type AtlasPromotionStore,
} from "../packages/evidence-repository/src/index.js";

// Atlas phase 2 (design docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md, sections 3 and 7): the strict
// intent payloads the owner's call queues and the runner re-validates, the review store's decision semantics, and the
// runner's contract. Canonical rows and intents never hold a card reference, an answer quote or community data.

const PROTOCOLS = [{ name: "HRP", version: "20.6.30", sha256: sha256("synthetic-hrp") }];
const MADE_WITH = { askrigorVersion: "0.1.0", build: "unknown", protocols: PROTOCOLS, depth: "standard", status: "complete" };
const DECIDED_WITH = { askrigorVersion: "0.1.0", build: "unknown", protocols: PROTOCOLS };
const SCHEMA = "askrigor.atlas-finding-intent.v1";

function source(doi: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "study",
    identifiers: [{ scheme: "doi", value: doi }],
    check: {
      provider: "crossref", title: "An invented zentarine trial", publishedYear: 2024, retractionStatus: "none_found",
      notices: [], ownerConfirmed: false, envelopeSha256: sha256(`envelope:${doi}`),
      checkedAt: "2026-10-22T10:00:00.000Z", ...overrides,
    },
  };
}

function content(wording: string, overrides: Record<string, unknown> = {}) {
  return {
    wording, appliesTo: "Adults with Velmor syndrome", certainty: "moderate",
    usualAnswer: "A quick answer says zentarine helps everyone.", whyNotUsual: "It misses the dose.",
    whatWouldChangeIt: "A larger trial.", whoElse: "Adults weighing zentarine.", whatItChanges: "Which dose to ask about.",
    tags: ["full_text_read"], verifiedBases: ["full_text_audit"],
    numbers: [{
      outcome: "relapse by 12 weeks", better: "fewer", option: "zentarine 20 mg", option_events: 18, option_total: 120,
      comparator: "placebo", comparator_events: 30, comparator_total: 120, follow_up: "12 weeks", nnt: 10,
      harms_none_found: true,
    }],
    ...overrides,
  };
}

function accept(overrides: Record<string, unknown> = {}, wording = "Zentarine 20 mg cut relapse in two invented trials.") {
  const key = sha256(`key:${wording}`);
  return {
    schema: SCHEMA, kind: "accept", entryKind: "finding", leadOrigin: null, editedAtAcceptance: false,
    topic: { key: "velmor-syndrome", label: "Velmor syndrome (invented)" },
    question: "Does zentarine reduce relapse in adults with Velmor syndrome?",
    content: content(wording), sources: [source(`10.0000/synthetic-${sha256(wording).slice(0, 6)}`)],
    wordingKeys: { card: key, accepted: key }, researchCheckedOn: "2026-10-21", madeWith: MADE_WITH,
    ...overrides,
  };
}

const EVERY_KIND = {
  accept: accept(),
  recheck: {
    schema: SCHEMA, kind: "recheck", publicNumber: "F-1001", cardWordingKey: sha256("key"), verifiedBases: ["bounded_absence"],
    sources: [source("10.0000/synthetic-recheck")], researchCheckedOn: "2026-10-22", madeWith: MADE_WITH,
  },
  revise: {
    schema: SCHEMA, kind: "revise", publicNumber: "F-1001", version: 1, changeKind: "corrected",
    note: "The count was 19, not 18.", content: content("Zentarine 20 mg cut relapse from 30 to 19 of 120."),
    sources: [source("10.0000/synthetic-revise")], acceptedWordingKey: sha256("revised"), researchCheckedOn: "2026-10-21",
    madeWith: MADE_WITH,
  },
  withdraw: { schema: SCHEMA, kind: "withdraw", publicNumber: "F-1001", version: 2, note: "A duplicate report.", decidedWith: DECIDED_WITH },
  link: {
    schema: SCHEMA, kind: "link", publicNumber: "F-1002", relation: "contradicts", toPublicNumber: "F-1001",
    disagreement: "dose", rationale: "Different doses.", decidedWith: DECIDED_WITH,
  },
  unlink: {
    schema: SCHEMA, kind: "unlink", publicNumber: "F-1002", relation: "contradicts", toPublicNumber: "F-1001",
    note: "They measure different outcomes.", decidedWith: DECIDED_WITH,
  },
  erase: {
    schema: SCHEMA, kind: "erase", publicNumber: "F-1001", version: 3, scope: "earlier_versions",
    reasonCode: "could_identify_a_person", decidedWith: DECIDED_WITH,
  },
} as const;

describe("Atlas intent payloads", () => {
  it("parses each intent kind and hashes it with stableJson", () => {
    for (const [kind, payload] of Object.entries(EVERY_KIND)) {
      const prepared = prepareAtlasFindingIntent(payload);
      expect(prepared.payload.kind).toBe(kind);
      expect(prepared.payloadSha256).toBe(sha256(stableJson(prepared.payload)));
    }
  });

  it("hashes the same payload the same way whatever its key order or surrounding spaces", () => {
    const reordered = Object.fromEntries(Object.entries(accept()).reverse());
    const spaced = accept({ question: "  Does zentarine reduce relapse in adults with Velmor syndrome?  " });
    expect(prepareAtlasFindingIntent(reordered).payloadSha256).toBe(prepareAtlasFindingIntent(accept()).payloadSha256);
    expect(prepareAtlasFindingIntent(spaced).payloadSha256).toBe(prepareAtlasFindingIntent(accept()).payloadSha256);
    expect(prepareAtlasFindingIntent(accept()).payloadSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("refuses unknown keys, an answer quote and the keys no persistent record may hold", () => {
    for (const payload of [
      { ...accept(), extra: true },
      accept({ content: { ...content("Zentarine helped."), answer_quote: "As the answer said, zentarine helped." } }),
      { ...accept(), answer_quote: "Zentarine helped." },
      { ...accept(), cardSha256: sha256("card") },
      { ...accept(), rawChat: "the chat" },
      { ...EVERY_KIND.withdraw, username: "someone" },
      accept({ topic: { key: "velmor-syndrome", label: "Velmor", threadKey: sha256("thread") } }),
    ]) {
      expect(() => prepareAtlasFindingIntent(payload)).toThrow();
    }
  });

  it("refuses a card reference in any text, in any case", () => {
    for (const payload of [
      accept({ question: "Does ARF-0142 apply to adults?" }),
      accept({ content: content("Zentarine helped, as arf-12 found.") }),
      accept({ topic: { key: "velmor-syndrome", label: "From ARF-0007" } }),
      { ...EVERY_KIND.withdraw, note: "Withdrawn at the request behind ARF-0142." },
      { ...EVERY_KIND.link, rationale: "Both come from ARF-1." },
    ]) {
      expect(() => prepareAtlasFindingIntent(payload)).toThrow(/findings card/u);
    }
  });

  it("refuses YouTube links and video ids, audited comments and the community tag (4a)", () => {
    expect(() => prepareAtlasFindingIntent(accept({ content: content("See https://youtu.be/dQw4w9WgXcQ for more.") })))
      .toThrow(/YouTube/u);
    expect(() => prepareAtlasFindingIntent(accept({ content: content("Per youtube.com/watch?v=dQw4w9WgXcQ.") })))
      .toThrow(/YouTube/u);
    for (const identifier of [{ scheme: "youtube", value: "dQw4w9WgXcQ" }, { scheme: "doi", value: "dQw4w9WgXcQ" }]) {
      expect(() => prepareAtlasFindingIntent(accept({ sources: [{ ...source("10.0000/x"), identifiers: [identifier] }] })))
        .toThrow();
    }
    expect(() => prepareAtlasFindingIntent(accept({ content: content("Zentarine helped.", {
      verifiedBases: ["full_text_audit", "comment_audit"],
    }) }))).toThrow();
    expect(() => prepareAtlasFindingIntent(accept({ content: content("Zentarine helped.", {
      tags: ["community_checked"],
    }) }))).toThrow();
    expect(() => prepareAtlasFindingIntent(accept({ sources: [] }))).toThrow(/community_only/u);
  });

  it("checks what a finding, a lead and an open lead may hold", () => {
    expect(() => prepareAtlasFindingIntent(accept({ content: content("No basis.", { verifiedBases: [] }) })))
      .toThrow(/lead/u);
    expect(() => prepareAtlasFindingIntent(accept({ entryKind: "lead", leadOrigin: "unverified_finding" }))).toThrow();
    expect(() => prepareAtlasFindingIntent(accept({ entryKind: "lead", leadOrigin: null }))).toThrow();
    expect(() => prepareAtlasFindingIntent(accept({
      entryKind: "lead", leadOrigin: "open_lead",
      content: content("An open question.", { verifiedBases: [], tags: [], numbers: [], certainty: null, whyNotUsual: null,
        whatWouldChangeIt: null }),
    }))).toThrow(/open lead/u);
    expect(prepareAtlasFindingIntent(accept({
      entryKind: "lead", leadOrigin: "open_lead", sources: [],
      content: content("An open question.", { verifiedBases: [], tags: [], numbers: [], certainty: null, whyNotUsual: null,
        whatWouldChangeIt: null, appliesTo: null }),
    })).payload.kind).toBe("accept");
    expect(() => prepareAtlasFindingIntent(accept({ wordingKeys: { card: sha256("a"), accepted: sha256("b") } })))
      .toThrow(/wording key/u);
    expect(prepareAtlasFindingIntent(accept({
      editedAtAcceptance: true, wordingKeys: { card: sha256("a"), accepted: sha256("b") },
    })).payload.kind).toBe("accept");
  });

  it("checks sources, numbers and dates exactly", () => {
    const refused = [
      accept({ sources: [source("10.0000/x", { retractionStatus: "retracted" })] }),
      accept({ sources: [source("10.0000/x", { retractionStatus: "expression_of_concern" })] }),
      accept({ sources: [source("10.0000/X-UPPER")] }),
      accept({ sources: [{ ...source("10.0000/x"), identifiers: [{ scheme: "pmid", value: "1" }, { scheme: "doi", value: "10.0000/x" }] }] }),
      accept({ sources: [source("10.0000/same"), source("10.0000/same")] }),
      accept({ sources: [source("10.0000/x", { checkedAt: "2026-10-22T10:00:00.123456Z" })] }),
      accept({ researchCheckedOn: "2026-02-30" }),
      accept({ content: content("Zentarine helped.", { numbers: [{ ...content("x").numbers[0], option_events: 121 }] }) }),
      accept({ content: content("Zentarine helped.", { numbers: [{ ...content("x").numbers[0], nnh: 4 }] }) }),
      accept({ content: content("Zentarine helped.", { verifiedBases: ["research_correction", "full_text_audit"] }) }),
      { ...EVERY_KIND.link, toPublicNumber: "F-1002" },
      { ...EVERY_KIND.link, disagreement: null },
      { ...EVERY_KIND.link, relation: "same_as" },
      { ...EVERY_KIND.revise, note: null },
      { ...EVERY_KIND.withdraw, publicNumber: "ARF-0142" },
      { ...EVERY_KIND.withdraw, publicNumber: "F-0999" },
    ];
    for (const payload of refused) expect(() => prepareAtlasFindingIntent(payload)).toThrow();
    const confirmed = accept({ sources: [source("10.0000/x", { retractionStatus: "retracted", ownerConfirmed: true })] });
    expect(prepareAtlasFindingIntent(confirmed).payload.kind).toBe("accept");
    const pmid = accept({ sources: [{ ...source("10.0000/x"), identifiers: [{ scheme: "doi", value: "10.0000/x" }, { scheme: "pmid", value: "12345" }] }] });
    expect(prepareAtlasFindingIntent(pmid).payload.kind).toBe("accept");
  });

  it("refuses a stored intent whose kind, number or hash is not the row's", () => {
    const prepared = prepareAtlasFindingIntent(EVERY_KIND.revise);
    const mismatch = (expected: Parameters<typeof prepareAtlasFindingIntent>[1]) => {
      try {
        prepareAtlasFindingIntent(EVERY_KIND.revise, expected);
      } catch (error) {
        return error instanceof AtlasIntentMismatchError ? error.code : "other";
      }
      return "none";
    };
    expect(mismatch({ kind: "withdraw" })).toBe("ATLAS_INTENT_KIND_MISMATCH");
    expect(mismatch({ publicNumber: "F-1002" })).toBe("ATLAS_INTENT_PUBLIC_NUMBER_MISMATCH");
    expect(mismatch({ payloadSha256: sha256("another") })).toBe("ATLAS_INTENT_PAYLOAD_SHA256_MISMATCH");
    expect(mismatch({ kind: "revise", publicNumber: "F-1001", payloadSha256: prepared.payloadSha256 })).toBe("none");
  });
});

describe("Atlas failure codes", () => {
  it("keeps the code list closed and the same in migration 0017's check", async () => {
    const migration = await readFile(
      new URL("../packages/evidence-repository/migrations/0017_atlas_findings.sql", import.meta.url),
      "utf8",
    );
    const check = migration.slice(migration.indexOf("failure_code IS NULL OR failure_code IN ("));
    const listed = [...check.slice(0, check.indexOf(")\n")).matchAll(/'([A-Z_]+)'/gu)].map(([, code]) => code);
    expect(listed).toEqual([...ATLAS_FINDING_PROMOTION_FAILURE_CODES]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("maps the writer's conflicts and the canonical store's errors, and leaves anything else pending", () => {
    const pg = (code: string, message = "x") => Object.assign(new Error(message), { code });
    expect(atlasPromotionFailureCode(new AtlasWriteConflict("ATLAS_VERSION_STALE"))).toBe("ATLAS_VERSION_STALE");
    expect(atlasPromotionFailureCode(pg("23514", "ATLAS_VERSION_LINEAGE_MISMATCH"))).toBe("ATLAS_VERSION_LINEAGE_MISMATCH");
    expect(atlasPromotionFailureCode(pg("23514", "CLAIM_DEPENDENCY_CYCLE"))).toBe("CLAIM_DEPENDENCY_CYCLE");
    expect(atlasPromotionFailureCode(pg("23514"))).toBe("CANONICAL_CHECK_VIOLATION");
    expect(atlasPromotionFailureCode(pg("23505"))).toBe("CANONICAL_UNIQUE_CONFLICT");
    expect(atlasPromotionFailureCode(pg("23503"))).toBe("CANONICAL_REFERENCE_MISSING");
    expect(atlasPromotionFailureCode(pg("22P02"))).toBe("CANONICAL_VALUE_INVALID");
    for (const error of [pg("40001"), pg("55000", "APPEND_ONLY_TABLE"), pg("55P03"), new Error("SOURCE_IDENTIFIER_CONFLICT"),
      new AtlasIntentMismatchError("ATLAS_INTENT_PAYLOAD_SHA256_MISMATCH"), "a string"]) {
      expect(atlasPromotionFailureCode(error)).toBeUndefined();
    }
  });
});

/** The review store, the canonical store and the runner in memory. */
function atlas(options: { store?: (review: InMemoryAtlasReviewStore, canonical: InMemoryAtlasCanonicalStore) => AtlasPromotionStore } = {}) {
  const review = new InMemoryAtlasReviewStore();
  const canonical = new InMemoryAtlasCanonicalStore({ now: () => "2026-10-22T13:00:00.000Z" });
  let instant = Date.parse("2026-10-22T12:00:00.000Z");
  const tick = () => new Date(instant += 1_000).toISOString();
  const runner = new AtlasFindingPromotionRunner(
    options.store?.(review, canonical) ?? new InMemoryAtlasPromotionStore(review, canonical),
    { now: tick },
  );
  let sequence = 0;
  const intentId = () => deterministicUuid(`atlas-contract-test:${sequence++}`);
  const decide = (card: number, payload: unknown, decision: "accepted" | "accepted_as_lead" | "rechecked" | "rejected" = "accepted",
    extra: { itemKind?: "finding" | "open_lead"; reason?: string; rechecked?: string } = {}) => {
    const prepared = payload === null ? null : prepareAtlasFindingIntent(payload);
    return review.decide({
      cardNumber: card, itemKind: extra.itemKind ?? "finding", itemNumber: 1, decision,
      cardSha256: sha256(`card:${card}`), ownerReason: extra.reason ?? null, decidedAt: tick(),
      intent: prepared === null ? null : { intentId: intentId(), ...prepared },
      recheckedPublicNumber: extra.rechecked ?? null,
    });
  };
  const record = (payload: Record<string, unknown>, retryOfIntentId: string | null = null, id = intentId()) => {
    const prepared = prepareAtlasFindingIntent(payload);
    const intent = prepared.payload;
    if (intent.kind === "accept" || intent.kind === "recheck") throw new Error("not recorded this way");
    return review.recordIntent({
      intentId: id, intentKind: intent.kind, publicNumber: intent.publicNumber, payload: intent,
      payloadSha256: prepared.payloadSha256, ownerReason: null, createdAt: tick(), retryOfIntentId,
    });
  };
  return { review, canonical, runner, tick, decide, record };
}

async function reviewCode(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof AtlasReviewError ? error.code : `other: ${String(error)}`;
  }
  return "none";
}

describe("the owner's Atlas decisions", () => {
  it("numbers accepted findings from F-1001, replays the same decision and refuses a different one", async () => {
    const { decide } = atlas();
    const first = await decide(142, accept());
    const second = await decide(143, accept({}, "At 5 mg zentarine did not cut relapse."));
    expect([first.publicNumber, second.publicNumber]).toEqual(["F-1001", "F-1002"]);
    expect(first.intent).toMatchObject({ intentKind: "accept", status: "PENDING" });
    const again = await decide(142, accept());
    expect([again.publicNumber, again.intentId]).toEqual([first.publicNumber, first.intentId]);
    expect(await reviewCode(() => decide(142, null, "rejected", { reason: "Changed." }))).toBe("DECISION_CONFLICT");
    expect(await reviewCode(() => decide(142, accept({}, "Another wording.")))).toBe("DECISION_CONFLICT");
  });

  it("binds each decision to the payload it queues and refuses what does not fit", async () => {
    const { decide, review } = atlas();
    expect(await reviewCode(() => decide(150, null, "rejected"))).toBe("INPUT_INVALID");
    expect(await reviewCode(() => decide(151, accept(), "accepted_as_lead"))).toBe("INPUT_INVALID");
    expect(await reviewCode(() => decide(152, accept(), "accepted", { itemKind: "open_lead" }))).toBe("INPUT_INVALID");
    expect(await reviewCode(() => decide(153, EVERY_KIND.recheck, "rechecked", { rechecked: "F-1001" })))
      .toBe("FINDING_NOT_FOUND");
    const prepared = prepareAtlasFindingIntent(accept());
    for (const intent of [
      { intentId: deterministicUuid("broken"), payload: { ...prepared.payload, content: "broken" }, payloadSha256: prepared.payloadSha256 },
      { intentId: deterministicUuid("rehashed"), payload: prepared.payload, payloadSha256: sha256("another payload") },
    ]) {
      expect(await reviewCode(() => review.decide({
        cardNumber: 154, itemKind: "finding", itemNumber: 1, decision: "accepted", cardSha256: sha256("card:154"),
        ownerReason: null, decidedAt: "2026-10-22T12:00:00.000Z",
        intent: intent as Parameters<typeof review.decide>[0]["intent"], recheckedPublicNumber: null,
      }))).toBe("INPUT_INVALID");
    }
    const rejected = await decide(155, null, "rejected", { reason: "Not general enough." });
    expect(rejected).toMatchObject({ decision: "rejected", publicNumber: null, intentId: null, intent: null });
  });

  it("queues intents on accepted findings only, replays a pending one and keeps an intent ID to its payload", async () => {
    const { decide, record, review } = atlas();
    expect(await reviewCode(() => record(EVERY_KIND.withdraw))).toBe("FINDING_NOT_FOUND");
    await decide(142, accept());
    expect(await reviewCode(() => record({ ...EVERY_KIND.link, publicNumber: "F-1001", toPublicNumber: "F-1009" })))
      .toBe("FINDING_NOT_FOUND");
    const withdrawal = await record(EVERY_KIND.withdraw);
    const replay = await record(EVERY_KIND.withdraw);
    expect(replay.intentId).toBe(withdrawal.intentId);
    expect(await reviewCode(() => record({ ...EVERY_KIND.withdraw, note: "Another note." }, null, withdrawal.intentId)))
      .toBe("INTENT_CONFLICT");
    expect(await reviewCode(() => record({ ...EVERY_KIND.withdraw, version: 3 }, withdrawal.intentId)))
      .toBe("INPUT_INVALID");
    expect((await review.inspectIntents(null)).map(({ intentKind }) => intentKind)).toEqual(["accept", "withdraw"]);
  });
});

describe("the Atlas promotion runner", () => {
  it("writes a receipt of ids and hashes only, which its schema and hash bind", async () => {
    const { decide, runner, review } = atlas();
    await decide(142, accept());
    const run = await runner.promoteAccepted();
    expect(run.result.status).toBe("promoted");
    if (run.result.status !== "promoted") return;
    expect(atlasPromotionReceiptSchema.parse(run.result.receipt)).toEqual(run.result.receipt);
    expect(run.result.receiptSha256).toBe(sha256(stableJson(run.result.receipt)));
    const text = JSON.stringify(run.result.receipt);
    for (const word of ["Zentarine", "Velmor", "relapse", "placebo"]) expect(text).not.toContain(word);
    const [stored] = await review.inspectIntents(["F-1001"]);
    expect(stored).toMatchObject({ status: "COMPLETED", receiptSha256: run.result.receiptSha256 });
    expect((await runner.promoteAccepted()).result).toEqual({ status: "no_pending_promotion" });
  });

  it("fails each conflict with its code, writes nothing for it, and promotes the next intent", async () => {
    const { decide, record, runner, canonical } = atlas();
    canonical.seedSourceFamily({
      familyId: deterministicUuid("seeded-one"), sourceKind: "study", identityHash: sha256("one"), displayTitle: "One",
      identifiers: [{ scheme: "doi", value: "10.0000/conflict-one" }],
    });
    canonical.seedSourceFamily({
      familyId: deterministicUuid("seeded-two"), sourceKind: "study", identityHash: sha256("two"), displayTitle: "Two",
      identifiers: [{ scheme: "pmid", value: "990001" }],
    });
    const lead = { entryKind: "lead", leadOrigin: "unverified_finding" };
    await decide(1, accept());                                                       // F-1001
    await decide(2, accept({ ...lead, content: content("A lead.", { verifiedBases: [] }) }, "A lead."), "accepted_as_lead"); // F-1002
    await decide(3, accept({}, "A third finding."));                                // F-1003
    for (let promoted = 0; promoted < 3; promoted += 1) {
      expect((await runner.promoteAccepted()).result.status).toBe("promoted");       // one per activation (choice 7)
    }
    await decide(4, accept({ sources: [{ ...source("10.0000/conflict-one"),
      identifiers: [{ scheme: "doi", value: "10.0000/conflict-one" }, { scheme: "pmid", value: "990001" }] }] }, "Conflict.")); // F-1004
    await decide(5, accept({ sources: [{ ...source("10.0000/x"), kind: "review",
      identifiers: [{ scheme: "doi", value: "10.0000/conflict-one" }] }] }, "Other kind."));  // F-1005
    await record({ ...EVERY_KIND.withdraw, publicNumber: "F-1004", version: 1 });
    await record({ ...EVERY_KIND.link, publicNumber: "F-1001", toPublicNumber: "F-1002" });    // a lead in a contradiction
    await record({ ...EVERY_KIND.link, publicNumber: "F-1002", relation: "replaces", toPublicNumber: "F-1001",
      disagreement: null });                                                         // a lead as the newer side
    await record({ ...EVERY_KIND.revise, version: 2 });                              // F-1001 has one version
    await record({ ...EVERY_KIND.link, publicNumber: "F-1003", relation: "same_as", toPublicNumber: "F-1001",
      disagreement: null });                                                         // promoted
    const run = await runner.promoteAccepted();
    expect(run.failed.map(({ publicNumber, failureCode }) => [publicNumber, failureCode])).toEqual([
      ["F-1004", "SOURCE_IDENTIFIER_CONFLICT"],
      ["F-1005", "SOURCE_IDENTIFIER_CONFLICT"],
      ["F-1004", "ATLAS_FINDING_MISSING"],
      ["F-1001", "ATLAS_LINK_LEAD"],
      ["F-1002", "ATLAS_LINK_LEAD"],
      ["F-1001", "ATLAS_VERSION_STALE"],
    ]);
    expect(run.result).toMatchObject({ status: "promoted", receipt: { intentKind: "link", publicNumber: "F-1003" } });
    const rows = canonical.snapshot();
    expect(rows.findings.map(({ publicNumber }) => publicNumber)).toEqual(["F-1001", "F-1002", "F-1003"]);
    expect(rows.applications).toHaveLength(4);
  });

  it("refuses a link the stored links rule out: taken pair, recorded link, cycle, withdrawn side, missing link", async () => {
    const { decide, record, runner } = atlas();
    for (const card of [1, 2, 3]) await decide(card, accept({}, `Finding ${card}.`));
    const link = (from: string, relation: string, to: string) => ({
      ...EVERY_KIND.link, publicNumber: from, relation, toPublicNumber: to,
      disagreement: relation === "contradicts" ? "dose" : null,
    });
    const outcomes: string[] = [];
    const drain = async () => {
      for (;;) {
        const run = await runner.promoteAccepted({ maximumFailures: 1 });
        outcomes.push(...run.failed.map(({ failureCode }) => failureCode));
        if (run.result.status === "promoted") outcomes.push(`promoted:${run.result.receipt.intentKind}`);
        if (run.result.status === "no_pending_promotion") return;
      }
    };
    await record(link("F-1001", "replaces", "F-1002"));
    await record(link("F-1002", "replaces", "F-1003"));
    await record(link("F-1003", "replaces", "F-1001"));                               // a cycle
    await record(link("F-1002", "same_as", "F-1001"));                                // the pair carries replaces
    await record({ ...EVERY_KIND.unlink, publicNumber: "F-1003", relation: "same_as", toPublicNumber: "F-1001" });
    await record({ ...EVERY_KIND.unlink, publicNumber: "F-1002", relation: "replaces", toPublicNumber: "F-1001" });
    await record({ ...EVERY_KIND.unlink, publicNumber: "F-1001", relation: "replaces", toPublicNumber: "F-1002" });
    await drain();
    // Once the first link is withdrawn, the same link again is a new intent, and the stored row refuses it.
    await record(link("F-1001", "replaces", "F-1002"));
    await record({ ...EVERY_KIND.withdraw, publicNumber: "F-1003", version: 2 });    // F-1003 was superseded: version 2
    await record(link("F-1001", "contradicts", "F-1003"));                            // a withdrawn side
    await record({ ...EVERY_KIND.revise, publicNumber: "F-1003", version: 3 });      // a withdrawn finding
    await drain();
    expect(outcomes).toEqual([
      "promoted:accept", "promoted:accept", "promoted:accept", "promoted:link", "promoted:link",
      "ATLAS_LINK_CYCLE", "ATLAS_LINK_PAIR_TAKEN", "ATLAS_LINK_MISSING", "ATLAS_LINK_MISSING", "promoted:unlink",
      "ATLAS_LINK_ALREADY_RECORDED", "promoted:withdraw", "ATLAS_LINK_TARGET_WITHDRAWN", "ATLAS_FINDING_WITHDRAWN",
    ]);
  });

  it("refuses an accept of a written number, a topic it cannot create, a re-check that does not match and an applied intent reused", async () => {
    const { decide, runner, canonical } = atlas();
    await decide(1, accept());
    await runner.promoteAccepted();
    const stored = (payload: unknown, publicNumber: string, intentId: string) => {
      const prepared = prepareAtlasFindingIntent(payload);
      return { intentId, intentKind: prepared.payload.kind, publicNumber, payload: prepared.payload,
        payloadSha256: prepared.payloadSha256, createdAt: "2026-10-22T12:30:00.000Z" };
    };
    const code = async (intent: ReturnType<typeof stored>) => {
      try {
        await canonical.contributeAtlasFinding(intent);
      } catch (error) {
        return error instanceof AtlasWriteConflict ? error.code : `other: ${String(error)}`;
      }
      return "none";
    };
    expect(await code(stored(accept({}, "Another."), "F-1001", deterministicUuid("a")))).toBe("ATLAS_FINDING_ALREADY_WRITTEN");
    expect(await code(stored(accept({ topic: { key: "no-such-topic", label: null } }, "New topic."), "F-1050",
      deterministicUuid("b")))).toBe("ATLAS_TOPIC_MISSING");
    expect(await code(stored(EVERY_KIND.recheck, "F-1001", deterministicUuid("c")))).toBe("ATLAS_RECHECK_KEY_MISMATCH");
    const applied = canonical.snapshot().applications[0]!;
    expect(await code(stored(accept({}, "Reused."), "F-1001", applied.intentId))).toBe("ATLAS_INTENT_APPLICATION_MISMATCH");
  });

  it("completes an intent the writer already applied by its idempotent replay", async () => {
    const { decide, runner, canonical, review } = atlas();
    await decide(1, accept());
    const [pending] = await review.inspectIntents(null);
    const intent = {
      intentId: pending!.intentId, intentKind: pending!.intentKind, publicNumber: pending!.publicNumber,
      payload: pending!.payload, payloadSha256: pending!.payloadSha256, createdAt: pending!.createdAt,
    };
    const direct = await canonical.contributeAtlasFinding(intent);
    const run = await runner.promoteAccepted();
    expect(direct.status).toBe("inserted");
    expect(run.result.status).toBe("promoted");
    if (run.result.status !== "promoted") return;
    expect(run.result.receipt.writerReceipt).toEqual({ ...direct, status: "idempotent_replay" });
    expect(canonical.snapshot().findings).toHaveLength(1);
  });

  it("leaves an intent pending on an unexpected error, and fails a stale erasure with its code instead of waiting", async () => {
    let failing = true;
    const { decide, record, runner, review } = atlas({
      store: (reviewStore, canonical) => {
        const inner = new InMemoryAtlasPromotionStore(reviewStore, canonical);
        return {
          begin: async () => {
            const unit = await inner.begin();
            if (typeof unit === "string" || !failing) return unit;
            return { ...unit, intent: unit.intent, apply: async () => { throw new Error("connection reset"); } };
          },
          close: async () => undefined,
        };
      },
    });
    await decide(1, accept());
    await expect(runner.promoteAccepted()).rejects.toThrow("connection reset");
    expect((await review.inspectIntents(null))[0]).toMatchObject({ status: "PENDING", failureCode: null });
    failing = false;
    expect((await runner.promoteAccepted()).result.status).toBe("promoted");
    // Part D's writer applies erasures (decision 7): this one names version 3 of a finding at version 1, so it ends
    // FAILED with its code and the queue moves on, where part A left it pending and the queue waiting behind it.
    const erase = await record(EVERY_KIND.erase);
    const run = await runner.promoteAccepted();
    expect(run.failed).toEqual([expect.objectContaining({ intentId: erase.intentId, failureCode: "ATLAS_VERSION_STALE" })]);
    expect(run.result).toEqual({ status: "no_pending_promotion" });
    expect((await review.inspectIntents(null)).map(({ status }) => status)).toEqual(["FAILED"]);
  });

  it("retries a failed accept under its number", async () => {
    const { decide, runner, canonical } = atlas();
    canonical.seedSourceFamily({
      familyId: deterministicUuid("seeded-review"), sourceKind: "review", identityHash: sha256("review"),
      displayTitle: "A review", identifiers: [{ scheme: "doi", value: "10.0000/a-review" }],
    });
    const failed = await decide(1, accept({ sources: [source("10.0000/a-review")] }));
    expect((await runner.promoteAccepted()).failed.map(({ failureCode }) => failureCode)).toEqual(["SOURCE_IDENTIFIER_CONFLICT"]);
    const retried = await decide(1, accept({ sources: [{ ...source("10.0000/a-review"), kind: "review" }] }));
    expect(retried).toMatchObject({ publicNumber: failed.publicNumber, intent: { retryOfIntentId: failed.intentId } });
    expect((await runner.promoteAccepted()).result).toMatchObject({ status: "promoted", receipt: { publicNumber: "F-1001" } });
  });
});
