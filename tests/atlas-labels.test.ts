import { describe, expect, it } from "vitest";

import {
  AtlasFindingPromotionRunner,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPromotionStore,
  InMemoryAtlasReviewStore,
  atlasLabelOf,
  deterministicUuid,
  prepareAtlasFindingIntent,
  sha256,
  type AtlasLabelContext,
} from "../packages/evidence-repository/src/index.js";

// Atlas phase 2 (design docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md, section 3): one pure label
// function, shared by the PostgreSQL and in-memory writers. The first rule that applies wins.

const finding = (findingId: string, latestStatus = "current", verifiedBases: string[] = ["full_text_audit"]) =>
  ({ findingId, latestStatus, verifiedBases });
const link = (fromFindingId: string, relation: string, toFindingId: string, withdrawn = false) =>
  ({ fromFindingId, toFindingId, relation, withdrawn });

describe("atlasLabelOf", () => {
  it("takes the first rule that applies: withdrawn, superseded, lead, contested, checked", () => {
    const everything: AtlasLabelContext = {
      findings: [finding("a", "invalidated", []), finding("b"), finding("c")],
      links: [link("b", "replaces", "a"), link("c", "contradicts", "a")],
    };
    expect(atlasLabelOf("a", everything)).toBe("withdrawn");
    const replacedLead: AtlasLabelContext = {
      findings: [finding("lead", "current", []), finding("newer"), finding("rival")],
      links: [link("newer", "replaces", "lead"), link("rival", "contradicts", "lead")],
    };
    expect(atlasLabelOf("lead", replacedLead)).toBe("superseded");
    const contradictedLead: AtlasLabelContext = {
      findings: [finding("lead", "current", []), finding("rival")],
      links: [link("rival", "contradicts", "lead")],
    };
    expect(atlasLabelOf("lead", contradictedLead)).toBe("lead");
    expect(atlasLabelOf("rival", contradictedLead)).toBe("checked");
    expect(atlasLabelOf("b", everything)).toBe("checked");
  });

  it("contests both findings an unwithdrawn contradicts link joins, in either direction", () => {
    const context: AtlasLabelContext = { findings: [finding("a"), finding("b")], links: [link("a", "contradicts", "b")] };
    expect(atlasLabelOf("a", context)).toBe("contested");
    expect(atlasLabelOf("b", context)).toBe("contested");
    const withdrawnLink: AtlasLabelContext = { ...context, links: [link("a", "contradicts", "b", true)] };
    expect(atlasLabelOf("a", withdrawnLink)).toBe("checked");
  });

  it("does not contest a finding whose partner is withdrawn, superseded or a lead", () => {
    for (const [partner, extraLinks] of [
      [finding("p", "invalidated"), []],
      [finding("p"), [link("q", "replaces", "p")]],
      [finding("p", "current", []), []],
    ] as const) {
      const context: AtlasLabelContext = {
        findings: [finding("a"), partner, finding("q")],
        links: [link("a", "contradicts", "p"), ...extraLinks],
      };
      expect(atlasLabelOf("a", context)).toBe("checked");
    }
  });

  it("supersedes only through an unwithdrawn replaces link pointing at the finding", () => {
    const context: AtlasLabelContext = {
      findings: [finding("old"), finding("new")],
      links: [link("new", "replaces", "old")],
    };
    expect(atlasLabelOf("old", context)).toBe("superseded");
    expect(atlasLabelOf("new", context)).toBe("checked");
    expect(atlasLabelOf("old", { ...context, links: [link("new", "replaces", "old", true)] })).toBe("checked");
  });

  it("counts only the verified bases, never audited comments (4a)", () => {
    expect(atlasLabelOf("a", { findings: [finding("a", "current", ["comment_audit"])], links: [] })).toBe("lead");
    for (const basis of ["full_text_audit", "bounded_absence", "research_correction"]) {
      expect(atlasLabelOf("a", { findings: [finding("a", "current", [basis])], links: [] })).toBe("checked");
    }
  });

  it("refuses a context missing a contradicts partner", () => {
    expect(() => atlasLabelOf("a", { findings: [finding("a")], links: [link("a", "contradicts", "b")] }))
      .toThrow("ATLAS_LABEL_CONTEXT_INCOMPLETE");
  });
});

const PROTOCOLS = [{ name: "HRP", version: "20.6.30", sha256: sha256("synthetic-hrp") }];
const MADE_WITH = { askrigorVersion: "0.1.0", build: "unknown", protocols: PROTOCOLS, depth: "standard", status: "complete" };
const DECIDED_WITH = { askrigorVersion: "0.1.0", build: "unknown", protocols: PROTOCOLS };
const QUESTION = "Does zentarine reduce relapse in adults with Velmor syndrome?";

function source(doi: string) {
  return {
    kind: "study",
    identifiers: [{ scheme: "doi", value: doi }],
    check: {
      provider: "crossref", title: `Trial ${doi}`, publishedYear: 2024, retractionStatus: "none_found", notices: [],
      ownerConfirmed: false, envelopeSha256: sha256(`envelope:${doi}`), checkedAt: "2026-10-22T10:00:00.000Z",
    },
  };
}

function content(wording: string, verifiedBases: string[], openLead = false) {
  return {
    wording,
    appliesTo: openLead ? null : "Adults with Velmor syndrome",
    certainty: openLead ? null : "moderate",
    usualAnswer: "A quick answer says zentarine helps everyone.",
    whyNotUsual: openLead ? null : "It misses the dose.",
    whatWouldChangeIt: openLead ? null : "A larger trial.",
    whoElse: null,
    whatItChanges: null,
    tags: [],
    verifiedBases,
    numbers: [],
  };
}

function accept(wording: string, options: { bases?: string[]; doi?: string; entry?: "unverified_finding" | "open_lead" } = {}) {
  const key = sha256(`key:${wording}`);
  const entry = options.entry ?? null;
  return {
    schema: "askrigor.atlas-finding-intent.v1",
    kind: "accept",
    entryKind: entry === null ? "finding" : "lead",
    leadOrigin: entry,
    editedAtAcceptance: false,
    topic: { key: "velmor-syndrome", label: "Velmor syndrome (invented)" },
    question: QUESTION,
    content: content(wording, options.bases ?? (entry === null ? ["full_text_audit"] : []), entry === "open_lead"),
    sources: entry === "open_lead" ? [] : [source(options.doi ?? `10.0000/synthetic-${sha256(wording).slice(0, 8)}`)],
    wordingKeys: { card: key, accepted: key },
    researchCheckedOn: "2026-10-21",
    madeWith: MADE_WITH,
  };
}

/** The review store, the canonical store and the runner in memory, sharing the planner the PostgreSQL writer uses. */
function atlas() {
  const review = new InMemoryAtlasReviewStore();
  const canonical = new InMemoryAtlasCanonicalStore();
  let instant = Date.parse("2026-10-22T12:00:00.000Z");
  const tick = () => new Date(instant += 1_000).toISOString();
  const runner = new AtlasFindingPromotionRunner(new InMemoryAtlasPromotionStore(review, canonical), { now: tick });
  let card = 9_000;
  let sequence = 0;
  const intentId = () => deterministicUuid(`atlas-labels-test:${sequence++}`);
  const promote = async () => {
    const run = await runner.promoteAccepted();
    expect(run.failed).toEqual([]);
    expect(run.result.status).toBe("promoted");
    return run;
  };
  const decide = async (payload: unknown, decision: "accepted" | "accepted_as_lead" = "accepted",
    itemKind: "finding" | "open_lead" = "finding") => {
    const prepared = prepareAtlasFindingIntent(payload);
    const decided = await review.decide({
      cardNumber: ++card, itemKind, itemNumber: 1, decision, cardSha256: sha256(`card:${card}`), ownerReason: null,
      decidedAt: tick(), intent: { intentId: intentId(), ...prepared }, recheckedPublicNumber: null,
    });
    await promote();
    return decided.publicNumber!;
  };
  const record = async (payload: Record<string, unknown>) => {
    const prepared = prepareAtlasFindingIntent({ schema: "askrigor.atlas-finding-intent.v1", ...payload });
    const intent = prepared.payload;
    if (intent.kind === "accept" || intent.kind === "recheck") throw new Error("not recorded this way");
    return review.recordIntent({
      intentId: intentId(), intentKind: intent.kind, publicNumber: intent.publicNumber, payload: intent,
      payloadSha256: prepared.payloadSha256, ownerReason: null, createdAt: tick(), retryOfIntentId: null,
    });
  };
  const state = () => canonical.snapshot();
  const label = (publicNumber: string) => {
    const rows = state();
    const findingId = rows.findings.find((row) => row.publicNumber === publicNumber)!.findingId;
    return rows.changes.filter((change) => change.findingId === findingId).at(-1)!.labelAfter;
  };
  const versions = (publicNumber: string) => {
    const rows = state();
    const findingId = rows.findings.find((row) => row.publicNumber === publicNumber)!.findingId;
    return rows.versions.filter((version) => version.findingId === findingId)
      .sort((left, right) => left.versionNumber - right.versionNumber);
  };
  return { review, canonical, runner, tick, decide, record, promote, label, versions, state };
}

describe("Atlas labels through the planner and the in-memory writer", () => {
  it("stores a finding with a verified basis as checked, and one without or a card's open lead as a lead", async () => {
    const store = atlas();
    const checked = await store.decide(accept("Zentarine 20 mg cut relapse in two invented trials."));
    const unverified = await store.decide(
      accept("An invented case series reported fewer relapses.", { entry: "unverified_finding" }), "accepted_as_lead");
    const openLead = await store.decide(
      accept("Whether zentarine helps children is untested.", { entry: "open_lead" }), "accepted_as_lead", "open_lead");
    expect([checked, unverified, openLead]).toEqual(["F-1001", "F-1002", "F-1003"]);
    expect([store.label(checked), store.label(unverified), store.label(openLead)]).toEqual(["checked", "lead", "lead"]);
    const rows = store.state();
    expect(rows.versions.find(({ findingId }) => findingId === rows.findings[0]!.findingId)?.status).toBe("current");
    expect(rows.bindings).toHaveLength(2);
    expect(rows.bindings.every(({ polarity, capabilityCeiling }, index) =>
      polarity === "supports" && capabilityCeiling === (index === 0 ? "can_support" : "uncertain"))).toBe(true);
  });

  it("contests both sides of an accepted contradiction, and returns one to checked when the other is withdrawn", async () => {
    const store = atlas();
    const first = await store.decide(accept("Zentarine 20 mg cut relapse in two invented trials."));
    const second = await store.decide(accept("At 5 mg zentarine did not cut relapse in an invented trial."));
    await store.record({
      kind: "link", publicNumber: second, relation: "contradicts", toPublicNumber: first, disagreement: "dose",
      rationale: "Different doses.", decidedWith: DECIDED_WITH,
    });
    await store.promote();
    expect([store.label(first), store.label(second)]).toEqual(["contested", "contested"]);
    await store.record({
      kind: "withdraw", publicNumber: second, version: 1, note: "A duplicate report.", decidedWith: DECIDED_WITH,
    });
    await store.promote();
    expect([store.label(first), store.label(second)]).toEqual(["checked", "withdrawn"]);
    expect(store.versions(second).map(({ status }) => status)).toEqual(["current", "invalidated"]);
    const relabeled = store.state().changes.at(-1)!;
    expect(relabeled).toMatchObject({ changeKind: "relabeled", labelBefore: "contested", labelAfter: "checked" });
  });

  it("supersedes a lead a checked finding replaces with a status-only version, and restores it when unlinked", async () => {
    const store = atlas();
    const lead = await store.decide(
      accept("An invented case series reported fewer relapses.", { entry: "unverified_finding" }), "accepted_as_lead");
    const newer = await store.decide(accept("A larger invented trial confirmed the effect over 24 weeks."));
    await store.record({
      kind: "link", publicNumber: newer, relation: "replaces", toPublicNumber: lead, disagreement: null,
      rationale: "The larger trial replaces the case series.", decidedWith: DECIDED_WITH,
    });
    await store.promote();
    expect(store.label(lead)).toBe("superseded");
    expect(store.versions(lead).map(({ status }) => status)).toEqual(["current", "superseded"]);
    expect(store.label(newer)).toBe("checked");
    await store.record({
      kind: "unlink", publicNumber: newer, relation: "replaces", toPublicNumber: lead,
      note: "The two report different outcomes.", decidedWith: DECIDED_WITH,
    });
    await store.promote();
    expect(store.label(lead)).toBe("lead");
    expect(store.versions(lead).map(({ status }) => status)).toEqual(["current", "superseded", "current"]);
  });

  it("keeps a correction chain in one line, with the dated note, and the label through it", async () => {
    const store = atlas();
    const first = await store.decide(accept("Zentarine 20 mg cut relapse from 30 of 120 to 18 of 120."));
    const revise = (version: number, changeKind: "corrected" | "edited", wording: string, note: string | null) =>
      store.record({
        kind: "revise", publicNumber: first, version, changeKind, note, content: content(wording, ["full_text_audit"]),
        sources: [source("10.0000/synthetic-chain")], acceptedWordingKey: sha256(`key:${wording}`),
        researchCheckedOn: "2026-10-21", madeWith: MADE_WITH,
      });
    await revise(1, "corrected", "Zentarine 20 mg cut relapse from 30 of 120 to 19 of 120.", "The count was 19.");
    await store.promote();
    await revise(2, "edited", "Zentarine 20 mg cut relapse by week 12 from 30 of 120 to 19 of 120.", null);
    await store.promote();
    const chain = store.versions(first);
    expect(chain.map(({ versionNumber }) => versionNumber)).toEqual([1, 2, 3]);
    expect(chain.map(({ supersedesClaimVersionId }) => supersedesClaimVersionId))
      .toEqual([null, chain[0]!.claimVersionId, chain[1]!.claimVersionId]);
    const changes = store.state().changes.map(({ changeKind, publicNote }) => [changeKind, publicNote]);
    expect(changes).toEqual([["accepted", null], ["corrected", "The count was 19."], ["edited", null]]);
    expect(store.label(first)).toBe("checked");
  });

  it("relabels a lead to checked when an exact re-check brings a verified basis, and only dates one that brings none", async () => {
    const store = atlas();
    const lead = await store.decide(
      accept("Whether zentarine helps children is untested.", { entry: "open_lead" }), "accepted_as_lead", "open_lead");
    const cardKey = sha256("key:Whether zentarine helps children is untested.");
    const recheck = async (verifiedBases: string[], sources: unknown[], researchCheckedOn: string) => {
      const prepared = prepareAtlasFindingIntent({
        schema: "askrigor.atlas-finding-intent.v1", kind: "recheck", publicNumber: lead, cardWordingKey: cardKey,
        verifiedBases, sources, researchCheckedOn, madeWith: MADE_WITH,
      });
      await store.review.decide({
        cardNumber: researchCheckedOn === "2026-10-22" ? 8001 : 8002, itemKind: "open_lead", itemNumber: 1,
        decision: "rechecked", cardSha256: sha256(researchCheckedOn), ownerReason: null, decidedAt: store.tick(),
        intent: { intentId: deterministicUuid(`recheck:${researchCheckedOn}`), ...prepared },
        recheckedPublicNumber: lead,
      });
      await store.promote();
    };
    await recheck([], [], "2026-10-22");
    expect(store.versions(lead)).toHaveLength(1);
    expect(store.label(lead)).toBe("lead");
    await recheck(["full_text_audit"], [source("10.0000/synthetic-children")], "2026-10-23");
    expect(store.versions(lead)).toHaveLength(2);
    expect(store.label(lead)).toBe("checked");
    expect(store.state().changes.slice(-2).map(({ changeKind, researchCheckedOn, claimVersionId }) =>
      [changeKind, researchCheckedOn, claimVersionId === null])).toEqual([
      ["rechecked", "2026-10-22", true],
      ["rechecked", "2026-10-23", false],
    ]);
  });
});
