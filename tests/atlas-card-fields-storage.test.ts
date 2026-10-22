import { describe, expect, it } from "vitest";

import {
  ATLAS_ERASED_TEXT,
  ATLAS_FINDING_KINDS,
  ATLAS_KIND_CLAIM_TYPES,
  InMemoryAtlasCanonicalStore,
  atlasClaimTypeOf,
  atlasErasedContent,
  atlasErasedIntentPayload,
  atlasSearchWithoutQuery,
  atlasVersionContentSchema,
  prepareAtlasFindingIntent,
  sha256,
  stableJson,
  type AtlasFindingIntent,
} from "../packages/evidence-repository/src/index.js";

// Atlas phase 3 (docs/superpowers/plans/2026-10-22-atlas-phase-3-design.md, section 6): where the card's fields are
// stored. An intent's version content takes them as optional fields, with no default, so a phase 2 intent keeps its
// hash; the kind gives the claim's type; the searches go only with a search that found nothing, which states no
// direction; and decision 7's erasure takes the subject and each search's query with the rest of the wording.

const PROTOCOLS = [{ name: "HRP", version: "20.6.31", sha256: sha256("synthetic-hrp") }];
const MADE_WITH = { askrigorVersion: "0.1.0", build: "unknown", protocols: PROTOCOLS, depth: "deep", status: "ready" };
const DECIDED_WITH = { askrigorVersion: "0.1.0", build: "unknown", protocols: PROTOCOLS };
const SCHEMA = "askrigor.atlas-finding-intent.v1";
const QUESTION = "Does zentarine ease the hand tremor of Velmor syndrome in adults?";
const TREMOR = {
  outcome: "tremor score halved", better: "more", option: "zentarine 20 mg", option_events: 30, option_total: 120,
  comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks", nnt: 10,
  harms_none_found: true,
};

function source(doi: string) {
  return {
    kind: "study",
    identifiers: [{ scheme: "doi", value: doi }],
    check: {
      provider: "crossref", title: "An invented zentarine trial", publishedYear: 2025, retractionStatus: "none_found",
      notices: [], ownerConfirmed: false, envelopeSha256: sha256(`envelope:${doi}`), checkedAt: "2026-11-04T09:00:00.000Z",
    },
  };
}

/** A phase 2 version's content: none of the card's new fields. */
function phase2Content(wording: string, overrides: Record<string, unknown> = {}) {
  return {
    wording, appliesTo: "Adults with Velmor syndrome", certainty: "low",
    usualAnswer: "A gentle supplement.", whyNotUsual: "It misses the numbers.", whatWouldChangeIt: "A second trial.",
    whoElse: "Adults weighing zentarine.", whatItChanges: "The size of the effect.",
    tags: ["full_text_read"], verifiedBases: ["full_text_audit"], numbers: [TREMOR], ...overrides,
  };
}

const EFFECT_FIELDS = { kind: "effect", subject: "Zentarine", subjectType: "supplement", direction: "benefit" };
const NOTHING_FOUND_FIELDS = {
  kind: "nothing_found", subject: "Zentarine", subjectType: "supplement", direction: "descriptive",
  searchScope: [{ database: "pubmed", query: "zentarine children" }, { database: "ctgov", query: "zentarine" }],
};

function accept(content: Record<string, unknown>, wording = String(content.wording)) {
  const key = sha256(`key:${wording}`);
  return {
    schema: SCHEMA, kind: "accept", entryKind: "finding", leadOrigin: null, editedAtAcceptance: false,
    topic: { key: "velmor-syndrome", label: "Velmor syndrome" }, question: QUESTION, content,
    sources: [source(`10.0000/synthetic-${sha256(wording).slice(0, 8)}`)],
    wordingKeys: { card: key, accepted: key }, researchCheckedOn: "2026-11-02", madeWith: MADE_WITH,
  };
}

describe("an intent's version content with the card's fields", () => {
  it("keeps a phase 2 payload as it was: it parses to itself, so its SHA-256 is the one queued", () => {
    const queued = accept(phase2Content("Zentarine halved the tremor score in 30 of 120 against 18 of 120."));
    const prepared = prepareAtlasFindingIntent(queued);
    expect(prepared.payload).toEqual(queued);
    expect(prepared.payloadSha256).toBe(sha256(stableJson(queued)));
    expect(prepareAtlasFindingIntent(queued, { payloadSha256: sha256(stableJson(queued)) }).payloadSha256)
      .toBe(prepared.payloadSha256);
    expect(Object.keys(prepared.payload.kind === "accept" ? prepared.payload.content : {}))
      .not.toEqual(expect.arrayContaining(["kind"]));
  });

  it("takes the kind, subject, subject type, direction and searches in their vocabularies", () => {
    expect(atlasVersionContentSchema.safeParse(phase2Content("x", EFFECT_FIELDS)).success).toBe(true);
    expect(atlasVersionContentSchema.safeParse(phase2Content("x", { ...NOTHING_FOUND_FIELDS, numbers: [] })).success)
      .toBe(true);
    for (const overrides of [
      { kind: "anecdote" },
      { subjectType: "person" },
      { direction: "unclear" },
      { subject: "" },
      { subject: "x".repeat(121) },
      { searchScope: [{ database: "google", query: "zentarine" }] },
      { ...NOTHING_FOUND_FIELDS, searchScope: [] },
      { ...NOTHING_FOUND_FIELDS, searchScope: Array.from({ length: 11 }, () => ({ database: "pubmed", query: "q" })) },
      { ...NOTHING_FOUND_FIELDS, searchScope: [{ database: "pubmed", query: "zentarine", records: 3 }] },
      // A card reference or a YouTube link is never stored, in the new texts either.
      { ...EFFECT_FIELDS, subject: "Zentarine, from ARF-0142" },
      { ...NOTHING_FOUND_FIELDS, searchScope: [{ database: "pubmed", query: "zentarine youtu.be/aaaaaaaaaaa" }] },
    ]) {
      expect(atlasVersionContentSchema.safeParse(phase2Content("x", overrides)).success, JSON.stringify(overrides))
        .toBe(false);
    }
  });

  it("keeps searches to a search that found nothing, which states no direction", () => {
    const refused = (overrides: Record<string, unknown>) =>
      atlasVersionContentSchema.safeParse(phase2Content("x", overrides)).error?.issues.map(({ message }) => message);
    expect(refused({ ...EFFECT_FIELDS, searchScope: NOTHING_FOUND_FIELDS.searchScope }))
      .toEqual(["searches go only with kind nothing_found"]);
    expect(refused({ searchScope: NOTHING_FOUND_FIELDS.searchScope }))
      .toEqual(["searches go only with kind nothing_found"]);
    expect(refused({ ...NOTHING_FOUND_FIELDS, direction: "no_effect" }))
      .toEqual(["a search that found nothing has direction descriptive"]);
  });

  it("keeps a search's date range, which its erasure keeps too (review finding 8)", () => {
    const ranged = { database: "pubmed", query: "zentarine children", dateRange: { start: "2015-01-01", end: "2026-10-22" } };
    const withSearch = (search: Record<string, unknown>) => atlasVersionContentSchema.safeParse(phase2Content("x", {
      ...NOTHING_FOUND_FIELDS, numbers: [], searchScope: [search] })).success;
    expect(withSearch(ranged)).toBe(true);
    expect(withSearch({ ...ranged, dateRange: { start: "2015", end: "2026-10-22" } })).toBe(false);
    expect(withSearch({ ...ranged, dateRange: { start: "2015-01-01" } })).toBe(false);
    // Stored as the search took it: the search tools check a date's form, not the calendar, so neither does this,
    // and a search the final check bound is never refused at acceptance.
    expect(withSearch({ ...ranged, dateRange: { start: "2015-02-30", end: "2026-10-22" } })).toBe(true);
    expect(atlasSearchWithoutQuery(ranged as Parameters<typeof atlasSearchWithoutQuery>[0]))
      .toEqual({ ...ranged, query: ATLAS_ERASED_TEXT });
  });

  it("stores a query as long as the search tools take, 5,000 characters (review finding 6)", () => {
    const withQuery = (query: string) => atlasVersionContentSchema.safeParse(phase2Content("x", {
      ...NOTHING_FOUND_FIELDS, numbers: [], searchScope: [{ database: "pubmed", query }] })).success;
    expect(withQuery("z".repeat(5_000))).toBe(true);
    expect(withQuery("z".repeat(5_001))).toBe(false);
  });

  it("holds no community sentence (owner decision 4a): the strict content refuses one", () => {
    for (const field of ["communityReport", "community_report", "community"]) {
      expect(atlasVersionContentSchema.safeParse(phase2Content("x", { ...EFFECT_FIELDS, [field]: "Reports." })).success,
        field).toBe(false);
    }
  });
});

describe("the claim's type, from the kind", () => {
  it("maps each kind to migration 0001's claim types, and no kind to other, as in phase 2", () => {
    expect(ATLAS_KIND_CLAIM_TYPES).toEqual({
      effect: "effect", harm: "harm", overlooked_option: "effect", correction: "other", nothing_found: "other",
      tested_vs_sold: "applicability",
    });
    for (const kind of ATLAS_FINDING_KINDS) {
      expect(["effect", "harm", "method", "applicability", "access", "other"]).toContain(atlasClaimTypeOf(kind));
    }
    expect(atlasClaimTypeOf(undefined)).toBe("other");
  });
});

describe("the in-memory writer with the card's fields", () => {
  const store = () => new InMemoryAtlasCanonicalStore({ now: () => "2026-11-04T09:05:00.000Z" });
  const stored = (intentId: string, publicNumber: string, payload: unknown) => {
    const prepared = prepareAtlasFindingIntent(payload);
    return {
      intentId, intentKind: prepared.payload.kind, publicNumber, payload: prepared.payload,
      payloadSha256: prepared.payloadSha256, createdAt: "2026-11-04T09:00:00.000Z",
    };
  };
  const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("writes the claim type from the kind, keeps the fields through a correction and a withdrawal, and erases texts", async () => {
    const canonical = store();
    const effect = accept(phase2Content("Zentarine halved the tremor score in 30 of 120 against 18 of 120 over 12 " +
      "weeks, a number needed to treat of 10, with no harms found.", EFFECT_FIELDS));
    const nothing = accept(phase2Content("No trial of zentarine in people under 18 was found.", {
      ...NOTHING_FOUND_FIELDS, numbers: [], tags: ["documented_absence"], verifiedBases: ["bounded_absence"],
    }));
    const older = accept(phase2Content("Zentarine halved the tremor score in an invented trial of 30 of 120."));
    await canonical.contributeAtlasFinding(stored(ids(1), "F-1001", effect));
    await canonical.contributeAtlasFinding(stored(ids(2), "F-1002", nothing));
    await canonical.contributeAtlasFinding(stored(ids(3), "F-1003", older));
    const rows = canonical.snapshot();
    expect(rows.claims.map(({ claimType }) => claimType)).toEqual(["effect", "other", "other"]);
    const state = await canonical.readAtlasState({});
    const contentOf = (number: string) => state.findings.find(({ publicNumber }) => publicNumber === number)!
      .versions.at(-1)!.content;
    expect(contentOf("F-1001")).toMatchObject(EFFECT_FIELDS);
    expect(contentOf("F-1002")).toMatchObject(NOTHING_FOUND_FIELDS);
    // A phase 2 finding stores none of them.
    expect(Object.keys(contentOf("F-1003"))).not.toEqual(expect.arrayContaining(["kind"]));
    for (const field of ["kind", "subject", "subjectType", "direction", "searchScope"]) {
      expect(contentOf("F-1003")).not.toHaveProperty(field);
    }

    // A correction may change the declared fields; the claim's type stays the first version's.
    const revise = {
      schema: SCHEMA, kind: "revise", publicNumber: "F-1001", version: 1, changeKind: "corrected",
      note: "The harm was found after all.",
      content: phase2Content("Zentarine halved the tremor score in 30 of 120 against 18 of 120 over 12 weeks, a " +
        "number needed to treat of 10.", { ...EFFECT_FIELDS, direction: "mixed" }),
      sources: [source("10.0000/synthetic-revise")], acceptedWordingKey: sha256("revised"),
      researchCheckedOn: "2026-11-02", madeWith: MADE_WITH,
    };
    await canonical.contributeAtlasFinding(stored(ids(4), "F-1001", revise));
    const withdraw = { schema: SCHEMA, kind: "withdraw", publicNumber: "F-1002", version: 1, note: "Withdrawn.",
      decidedWith: DECIDED_WITH };
    await canonical.contributeAtlasFinding(stored(ids(5), "F-1002", withdraw));
    const after = await canonical.readAtlasState({});
    const versions = (number: string) => after.findings.find(({ publicNumber }) => publicNumber === number)!.versions;
    expect(versions("F-1001").map(({ content }) => content.direction)).toEqual(["benefit", "mixed"]);
    expect(canonical.snapshot().claims.map(({ claimType }) => claimType)).toEqual(["effect", "other", "other"]);
    // A withdrawal's status-only version copies the searches as they were.
    expect(versions("F-1002").at(-1)!.content.searchScope).toEqual(NOTHING_FOUND_FIELDS.searchScope);

    // Decision 7: erasing every version of the withdrawn finding takes its subject and its queries with its wording.
    const erase = { schema: SCHEMA, kind: "erase", publicNumber: "F-1002", version: 2, scope: "all_versions",
      reasonCode: "could_identify_a_person", decidedWith: DECIDED_WITH };
    await canonical.contributeAtlasFinding(stored(ids(6), "F-1002", erase));
    const erased = (await canonical.readAtlasState({})).findings.find(({ publicNumber }) => publicNumber === "F-1002")!;
    for (const version of erased.versions) {
      expect(version.content.subject).toBe(ATLAS_ERASED_TEXT);
      expect(version.content.searchScope).toEqual([
        { database: "pubmed", query: ATLAS_ERASED_TEXT }, { database: "ctgov", query: ATLAS_ERASED_TEXT },
      ]);
      // What cannot identify anyone stays: the kind, the subject's type and the direction.
      expect(version.content).toMatchObject({ kind: "nothing_found", subjectType: "supplement", direction: "descriptive" });
    }
    expect(JSON.stringify(canonical.snapshot())).not.toContain("zentarine children");
  });

  it("clears the same texts from the finding's earlier intents, and keeps a missing field missing", () => {
    const nothing = prepareAtlasFindingIntent(accept(phase2Content("No trial in children was found.", {
      ...NOTHING_FOUND_FIELDS, numbers: [], verifiedBases: ["bounded_absence"],
    }))).payload;
    const cleared = atlasErasedIntentPayload({ publicNumber: "F-1002", status: "COMPLETED", payload: nothing },
      { publicNumber: "F-1002", scope: "all_versions", version: 2, questionErased: false });
    expect(cleared).toBeDefined();
    const content = (cleared as Extract<AtlasFindingIntent, { kind: "accept" }>).content;
    expect(content.subject).toBe(ATLAS_ERASED_TEXT);
    expect(content.searchScope!.map(({ query }) => query)).toEqual([ATLAS_ERASED_TEXT, ATLAS_ERASED_TEXT]);
    expect(atlasVersionContentSchema.safeParse(content).success).toBe(true);
    const plain = atlasErasedContent(atlasVersionContentSchema.parse(phase2Content("x")));
    expect(plain).not.toHaveProperty("subject");
    expect(plain).not.toHaveProperty("searchScope");
  });
});
