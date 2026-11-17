import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";

import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasReviewStore,
  InMemoryAtlasPageSource,
  InMemoryAtlasPublicationStore,
  InMemoryResearchDossierPublications,
  InMemoryResearchDossierStore,
  PUBLIC_DOSSIER_NOTICE_VERSIONS,
  RESEARCH_USE_NOTICE_VERSION,
  deterministicUuid,
} from "@askrigor/evidence-repository";

import { AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import { AtlasDossierReview } from "../apps/research-mcp/src/atlas/dossier-review.js";
import {
  DOSSIER_ORDER_LINE,
  dossierRankItems,
  rankDossierFindings,
} from "../apps/research-mcp/src/atlas/dossier-ranking.js";
import { atlasPageProblems } from "../apps/research-mcp/src/atlas/page-guard.js";
import { atlasRouteOf, createAtlasPagesHandler, type AtlasPagesHandler } from "../apps/research-mcp/src/atlas/pages-http.js";
import { publicDossiersEnabledFromEnv } from "../apps/research-mcp/src/config.js";
import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import { createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import {
  RESEARCH_DOSSIER_SHAPE,
  researchDossierLine,
  saveResearchDossier,
  type ResearchDossierSaveRequest,
} from "../apps/research-mcp/src/findings/dossier.js";
import {
  dossierDisagreements,
  publicDossierOf,
  publicSizeProblems,
  readPublicDossier,
  type PublicDossier,
  type PublicDossierFinding,
} from "../apps/research-mcp/src/findings/dossier-publication.js";
import { discoveryQueryDigest, issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// AskRigor#477 stage 2 (owner answers 331a, 332a and 333a, 16 Nov 2026): research dossiers on the public Atlas. Every
// study, form, figure and topic here is invented; the identifiers are synthetic.

const SECRET = "research-dossier-publication-secret-0123456789";
const NOW = new Date("2026-11-17T15:00:00.000Z");
const TARGET = "Inositol forms for mood, hormones and metabolic outcomes (invented)";
const ANSWER_DIGEST = createHash("sha256").update("The checked answer.", "utf8").digest("hex");
const ACCOUNT = "b".repeat(64);
const OTHER = "c".repeat(64);
// Here only, v6 stands in for the notice v7 that the release would add (PUBLIC_DOSSIER_NOTICE_VERSIONS is empty).
const COVERING = [RESEARCH_USE_NOTICE_VERSION];

const receipt = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, string | number | string[]>) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now: () => NOW });
const finalization = (target = TARGET) => receipt("finalization",
  { status: "ready", target: researchTargetDigest(target), answer: ANSWER_DIGEST });

const RECEIPTS = [
  receipt("pubmed_record", { pmid: "11111111", doi: "10.1000/myo.trial", abs: "1" }),
  receipt("study_audit", { id: "PMC2222222", doi: "10.1000/dci.pilot", pmid: "22222222", status: "validated" }),
  receipt("pubmed_record", { pmid: "33333333", abs: "1" }),
  receipt("pubmed_record", { pmid: "44444444", abs: "1" }),
  receipt("pubmed_record", { pmid: "55555555", abs: "1" }),
  receipt("literature_search", { src: "pubmed", q: discoveryQueryDigest(["inositol randomized trial"]), ret: 20, n: 140,
    ids: ["11111111", "33333333", "55555555", "66666666"] }),
];

/** The issue's complex topic, with stage 2's declarations: one unusual lead, four forms kept apart, two harms. */
function dossier(change: (value: Record<string, any>) => void = () => undefined): Record<string, any> {
  const value: Record<string, any> = {
    scope: "public",
    value: { saves_work: "substantial", quick_answer: "Inositol may help some metabolic measures.", adds: ["f1", "f3"],
      reason: "It compares four forms, their trials and two harms.", confidence: "high" },
    question: "What do the different forms of inositol do, and what are their risks?",
    topic: { key: "inositol-invented", name: "Inositol (invented)", other_names: ["IP6"], related: ["pcos-invented"] },
    forms: ["myo-inositol", "D-chiro-inositol", "scyllo-inositol", "IP6"],
    searches: [{ id: "q1", database: "pubmed", query: "inositol randomized trial" }],
    studies: [
      { id: "s1", identifiers: ["PMID 11111111"], kind: "human_trial", form: "myo-inositol", dose: "2 g a day",
        population: "Adults with a metabolic syndrome", comparator: "placebo", decision: "used" },
      { id: "s2", identifiers: ["10.1000/dci.pilot"], kind: "human_trial", form: "D-chiro-inositol",
        population: "Ten healthy men", design: "Uncontrolled pilot", participants: 10, decision: "used" },
      { id: "s3", identifiers: ["33333333"], kind: "human_trial", form: "scyllo-inositol",
        population: "Adults with a memory disorder", comparator: "placebo", decision: "used" },
      { id: "s4", identifiers: ["44444444"], kind: "human_trial", form: "IP6", participants: 24,
        population: "Adults eating a high-phytate diet", decision: "used" },
      { id: "s5", identifiers: ["55555555"], kind: "animal", form: "myo-inositol", decision: "used", participants: 40 },
    ],
    results: [
      { id: "r1", study: "s1", outcome: "Fasting insulin improved", comparator: "placebo", follow_up: "12 weeks",
        direction: "benefit", certainty: "moderate", provenance: "reported",
        figure: { kind: "counts", option_events: 30, option_total: 50, comparator_events: 20, comparator_total: 50, nnt: 5 } },
      { id: "r2", study: "s2", outcome: "Testosterone rose", follow_up: "1 month", direction: "mixed", certainty: "low",
        provenance: "calculated", calculation: { operation: "percent_change", from: [6.17, 5] },
        figure: { kind: "value", value: 23.4, unit: "%", measure: "Mean change from baseline" } },
      { id: "r3", study: "s3", outcome: "Serious infections", comparator: "placebo", follow_up: "78 weeks",
        direction: "harm", certainty: "moderate", provenance: "reported",
        figure: { kind: "counts", option_events: 10, option_total: 100, comparator_events: 2, comparator_total: 100, nnh: 13 } },
      { id: "r4", study: "s4", outcome: "Iron absorption fell", direction: "harm", certainty: "low", provenance: "from_table",
        figure: { kind: "value", value: 18, unit: "%", measure: "Fall in iron absorption" } },
    ],
    findings: [
      { id: "f1", claim: "In one uncontrolled pilot of ten men, D-chiro-inositol raised testosterone by about a quarter.",
        certainty: "low", kind: "overlooked_option", applies_to: "Healthy men", form: "D-chiro-inositol", rests_on: ["r2"],
        what_would_change_it: "A controlled trial", importance: "decision_changing" },
      { id: "f2", claim: "Myo-inositol 2 g a day improved fasting insulin against placebo over 12 weeks.",
        certainty: "moderate", kind: "helps", applies_to: "Adults with a metabolic syndrome", form: "myo-inositol",
        rests_on: ["r1"], what_would_change_it: "Larger trials with clinical outcomes", importance: "important" },
      { id: "f3", claim: "High-dose scyllo-inositol came with more serious infections than placebo.",
        certainty: "moderate", kind: "harms", applies_to: "Adults with a memory disorder", form: "scyllo-inositol",
        rests_on: ["r3"], what_would_change_it: "A trial at lower doses", importance: "decision_changing" },
      { id: "f4", claim: "IP6 lowered iron absorption in a high-phytate diet.", certainty: "low", kind: "harms",
        applies_to: "Adults eating a high-phytate diet", form: "IP6", rests_on: ["r4"],
        what_would_change_it: "Studies of supplements apart from diet", importance: "important" },
      { id: "f5", claim: "Whether myo-inositol helps mood is not known: the search found no trial of it.",
        certainty: "high", kind: "not_known", applies_to: "Adults with low mood", form: "myo-inositol",
        rests_on: ["q1"], what_would_change_it: "Any trial of it for mood", importance: "decision_changing" },
    ],
    coverage: {
      benefits: { status: "entries" }, harms: { status: "entries" }, null_results: { status: "none_found", search: "q1" },
      conflicts: { status: "not_researched", reason: "No two studies measured the same outcome the same way." },
      mainstream_options: { status: "entries" }, people_reports: { status: "none_found", search: "q1" },
    },
    open_trails: ["Controlled trials of D-chiro-inositol in men"],
    names_living_people: false,
  };
  change(value);
  return value;
}

let sequence = 0;
function request(overrides: Partial<ResearchDossierSaveRequest> & { value?: Record<string, any> } = {}):
  ResearchDossierSaveRequest {
  const { value, ...rest } = overrides;
  return {
    dossier: { given: true, value: value ?? dossier() },
    account: { mode: "FREE_CONTRIBUTOR", accountKey: ACCOUNT, findingsSave: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION },
    callSavingOff: false,
    finalizationReceipt: finalization(),
    shortLookup: false,
    validatedSources: 5,
    receipts: RECEIPTS,
    atlasReuse: [],
    cardId: "ARF-0042",
    commentsRead: false,
    secret: SECRET,
    versions: { askrigor: "0.1.0", build: "0123abc", hrp: "20.6.43" },
    surface: "/mcp/claude",
    now: () => NOW,
    newVersionId: () => deterministicUuid(`dossier-publication-test:${sequence++}`),
    ...rest,
  };
}

function stores() {
  const dossiers = new InMemoryResearchDossierStore();
  const publications = new InMemoryResearchDossierPublications({ dossiers });
  return { dossiers, publications, publication: { publisher: publications, noticeCovering: COVERING } };
}

describe("a saved dossier's public copy (332a: the researching AI's own judgement decides)", () => {
  it("is off by default: the setting, the empty list of covering notices and the live notice stay as they were", () => {
    expect(publicDossiersEnabledFromEnv(undefined)).toBe(false);
    expect(publicDossiersEnabledFromEnv("on")).toBe(false);
    expect(publicDossiersEnabledFromEnv("enabled")).toBe(true);
    expect(PUBLIC_DOSSIER_NOTICE_VERSIONS).toEqual([]);
    expect(RESEARCH_USE_NOTICE_VERSION).toBe("free-contributor-v6-2026-11-15");
  });

  it("publishes nothing without a publisher, and nothing for a notice that does not cover public dossiers", async () => {
    const { dossiers, publications } = stores();
    const off = await saveResearchDossier(dossiers, request());
    expect(off?.disposition.status).toBe("saved");
    expect(off?.disposition.publication).toBeUndefined();
    expect(researchDossierLine(off!.disposition)).toContain("it is not public.");
    const uncovered = await saveResearchDossier(dossiers, request({ value: dossier((value) => { value.question += " Again?"; }),
      publication: { publisher: publications } }));
    expect(uncovered?.disposition.publication).toEqual({ status: "not_published", reason: "notice_not_covering" });
    expect(await publications.listShown({ limit: 10 })).toEqual([]);
  });

  it("shows a highly confident dossier at once, written without the person, with nothing private in its public part", async () => {
    const { dossiers, publications, publication } = stores();
    const outcome = await saveResearchDossier(dossiers, request({ publication }));
    expect(outcome?.disposition).toMatchObject({ status: "saved", dossier_id: "ARD-0001",
      publication: { status: "shown", public_id: "D-1001", page: "/atlas/dossiers/D-1001" } });
    expect(researchDossierLine(outcome!.disposition)).toBe("Research dossier ARD-0001 was saved privately for AskRigor's " +
      "owner to review (version 1). It is also shown on AskRigor's public Atlas as D-1001, written without you and " +
      "marked \"Not checked by supervisors yet\".");
    const [shown] = await publications.listShown({ limit: 10 });
    const text = JSON.stringify(shown!.payload);
    // Field by field: no private number, card, build, exact time, origin, caller readings or named-people declaration.
    for (const hidden of ["ARD-", "card_number", "0123abc", "15:00:00", "/mcp", "origin", "ai_readings",
      "names_living_people", "saves_work", "draws_on_youtube", "card_finding"]) {
      expect(text).not.toContain(hidden);
    }
    expect(readPublicDossier(shown!.payload)).toBeDefined();
    expect(shown!.payload).toMatchObject({ checked: { on: "2026-11-17", privacy_reading: false,
      not_checked: ["papers_support_claims", "figures_match_papers", "value_judgement"] } });
    // The private record keeps where the research ran (332a): the surface, the readings and the runner's declaration.
    const [row] = await publications.list("shown", 10);
    expect(row!.origin).toEqual({ surface: "/mcp/claude", run: "chat", readings: "askrigor" });
    expect(row!.dossierNumber).toBe("ARD-0001");
  });

  it("holds a dossier for AskRigor's check when the AI is not highly confident or a claim names a living person", async () => {
    const cases: Array<[(value: Record<string, any>) => void, string[]]> = [
      [(value) => { value.value.confidence = "moderate"; }, ["not_high_confidence"]],
      [(value) => { delete value.value.confidence; }, ["not_high_confidence"]],
      [(value) => { value.names_living_people = true; }, ["names_living_people"]],
      [(value) => { delete value.names_living_people; }, ["living_people_undeclared"]],
      [(value) => { value.value.confidence = "low"; value.names_living_people = true; },
        ["not_high_confidence", "names_living_people"]],
    ];
    for (const [change, reasons] of cases) {
      const { dossiers, publications, publication } = stores();
      const outcome = await saveResearchDossier(dossiers, request({ value: dossier(change), publication }));
      expect(outcome?.disposition.publication).toEqual({ status: "held", public_id: "D-1001", hold_reasons: reasons });
      expect(outcome?.note).toContain("held for AskRigor's check");
      expect(researchDossierLine(outcome!.disposition)).toContain("It waits for AskRigor's check before it can appear");
      expect(await publications.listShown({ limit: 10 })).toEqual([]);
      expect((await publications.list("held", 10))[0]!.holdReasons).toEqual(reasons);
    }
  });

  it("keeps a dossier off the pages until every comparison it shows carries its group sizes", async () => {
    const { dossiers, publications, publication } = stores();
    const outcome = await saveResearchDossier(dossiers, request({ publication, value: dossier((value) => {
      value.results[1].comparator = "baseline";
      delete value.studies[3].participants;
    }) }));
    expect(outcome?.disposition.status).toBe("saved");
    expect(outcome?.disposition.publication).toEqual({ status: "not_published", reason: "sizes_missing", problems: [
      { path: "results[1].group_sizes", rule: "comparison_sizes_missing" },
      { path: "findings[3].rests_on", rule: "finding_sizes_missing" }] });
    expect(outcome?.note).toContain("every comparison it shows must carry its group sizes");
    expect(await publications.listShown({ limit: 10 })).toEqual([]);
    // Given, the sizes publish; a counts figure carries its own, and a group size that contradicts it is refused.
    const sized = dossier((value) => {
      value.question = "What do the forms of inositol do, sized?";
      value.results[1].comparator = "baseline";
      value.results[1].group_sizes = { option: 10, comparator: 10 };
    });
    expect((await saveResearchDossier(dossiers, request({ publication, value: sized })))?.disposition.publication?.status)
      .toBe("shown");
    const contradicting = dossier((value) => { value.results[0].group_sizes = { option: 49, comparator: 50 }; });
    expect((await saveResearchDossier(dossiers, request({ publication, value: contradicting })))?.disposition)
      .toMatchObject({ status: "insufficient", problems: [{ path: "results[0].group_sizes", rule: "group_sizes_mismatch" }] });
  });

  it("holds a dossier that contradicts a shown one on an important finding, and only notes a background conflict", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    const contradicting = (importance: string) => dossier((value) => {
      value.question = `Does myo-inositol help fasting insulin (${importance})?`;
      value.findings[1] = { ...value.findings[1], kind: "no_difference", importance,
        claim: "Myo-inositol did not change fasting insulin in a second trial." };
    });
    const other = { account: { mode: "FREE_CONTRIBUTOR" as const, accountKey: OTHER, findingsSave: true,
      noticeVersion: RESEARCH_USE_NOTICE_VERSION } };
    const important = await saveResearchDossier(dossiers, request({ ...other, publication,
      value: contradicting("important") }));
    expect(important?.disposition.publication).toEqual({ status: "held", public_id: "D-1002",
      hold_reasons: ["important_conflict"], conflicts_with: ["D-1001"] });
    // f2 of the first dossier is important, so the comparison sees an important conflict either way; a conflict on two
    // background findings shows, with the conflict recorded.
    const first = readPublicDossier((await publications.listShown({ limit: 10 }))[0]!.payload)!;
    const background = (finding: PublicDossierFinding) => ({ ...finding, importance: "context" as const });
    expect(dossierDisagreements({ findings: first.findings.map(background) },
      { findings: readPublicDossier((await publications.inspect("D-1002"))[0]!.payload)!.findings.map(background) }))
      .toEqual([{ form: "myo-inositol", mine: "f2", theirs: "f2", important: false }]);
    // Forms apart: a no-difference finding on another form is no conflict.
    expect(dossierDisagreements(first, { findings: [{ ...first.findings[1]!, form: "D-chiro-inositol",
      kind: "no_difference" }] })).toEqual([]);
  });

  it("takes the copy off the pages when its research is withdrawn or erased, and keeps an accepted one", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    dossiers.revoke(ACCOUNT, NOW);
    expect(await publications.listShown({ limit: 10 })).toEqual([]);
    expect((await publications.list(undefined, 10))[0]).toMatchObject({ state: "taken_down" });
    // An accepted copy stays when the person's research is deleted.
    const fresh = stores();
    await saveResearchDossier(fresh.dossiers, request({ publication: fresh.publication }));
    const review = new AtlasDossierReview({ store: fresh.publications, now: () => NOW });
    expect((await review.run({ action: "accept_dossier", dossier: "D-1001" })).ok).toBe(true);
    const [version] = fresh.dossiers.snapshot();
    await fresh.dossiers.eraseThread({ threadKey: (await threadOf(fresh.dossiers, version!.versionId)), at: NOW });
    expect((await fresh.publications.listShown({ limit: 10 })).map(({ publicNumber, accepted }) => [publicNumber, accepted]))
      .toEqual([["D-1001", true]]);
  });
});

/** The thread key the in-memory store holds for a version, as forget_card would find it. */
async function threadOf(store: InMemoryResearchDossierStore, versionId: string): Promise<string> {
  const { findingsThreadKey } = await import("../apps/research-mcp/src/findings/service.js");
  expect(store.versionFacts(versionId)?.accountKey).toBe(ACCOUNT);
  return findingsThreadKey(SECRET, ACCOUNT, researchTargetDigest(TARGET));
}

describe("the ranking rule (owner answer 333a)", () => {
  const ranked = (findings: Array<Partial<PublicDossierFinding>>) => {
    const base = publicDossierOf(storedOf(dossier()), false);
    const public_: PublicDossier = { ...base, findings: findings.map((finding, index) => ({ id: `f${index + 1}`,
      claim: `Claim ${index + 1}`, certainty: "moderate", kind: "helps", applies_to: "Adults", rests_on: ["r1"],
      what_would_change_it: "More trials", importance: "important", hard_to_find: false, ...finding })) };
    return rankDossierFindings(dossierRankItems([{ publicNumber: "D-1001", dossier: public_, shownAt: NOW.toISOString(),
      accepted: false }])).map(({ finding }) => finding.id);
  };

  it("puts what could change a decision first, then hard-to-find among equals, with strength only a tie-break", () => {
    expect(ranked([{ importance: "context" }, { importance: "important" }, { importance: "decision_changing" }]))
      .toEqual(["f3", "f2", "f1"]);
    expect(ranked([{}, { hard_to_find: true }])).toEqual(["f2", "f1"]);
    // An important animal finding is not pushed below a less important human trial.
    expect(ranked([{ importance: "context", rests_on: ["r1"] }, { importance: "important", rests_on: ["s5"] }]))
      .toEqual(["f2", "f1"]);
    // Between equals, the human trial before the animal study, then the more certain.
    expect(ranked([{ rests_on: ["s5"] }, { rests_on: ["r1"] }])).toEqual(["f2", "f1"]);
    expect(ranked([{ certainty: "low" }, { certainty: "high" }])).toEqual(["f2", "f1"]);
  });

  it("never puts what is not known before what the same form is known to do, a measured no difference included", () => {
    // The inversion the owner described: a sure "nothing found" ahead of a less sure known effect. The two known
    // findings keep their own order (the more certain first); the not-known one goes after both.
    expect(ranked([
      { kind: "not_known", certainty: "high", importance: "decision_changing", form: "D-chiro-inositol", rests_on: ["q1"] },
      { kind: "helps", certainty: "low", importance: "context", form: "D-chiro-inositol", rests_on: ["r2"] },
      { kind: "no_difference", importance: "context", form: "D-chiro-inositol" },
    ])).toEqual(["f3", "f2", "f1"]);
    // Another form's known finding does not move it; only the not-known finding moves.
    expect(ranked([
      { kind: "helps", importance: "context", form: "IP6" },
      { kind: "not_known", importance: "decision_changing", form: "D-chiro-inositol", rests_on: ["q1"] },
      { kind: "helps", importance: "important", form: "myo-inositol" },
    ])).toEqual(["f2", "f3", "f1"]);
    expect(DOSSIER_ORDER_LINE).toBe("Findings that could change a decision come first, hard-to-find ones first among " +
      "equals; each says what kind of evidence it rests on, and what is unknown never comes before what is known.");
  });
});

/** The stored dossier for a fixture, as saveResearchDossier would store it (enough for publicDossierOf). */
function storedOf(value: Record<string, any>): Record<string, unknown> {
  return {
    ...value,
    studies: value.studies.map((study: Record<string, any>) => ({ ...study, identifiers: [{ scheme: "pmid", value: "1" }],
      read: "abstract" })),
    searches: value.searches.map((search: Record<string, any>) => ({ ...search, records_found: 140 })),
    value: { ...value.value, judged_by: "researching_ai" },
    stamp: { saved_at: NOW.toISOString(), askrigor_version: "0.1.0", receipts_checked: 6, checks: ["receipts"],
      not_checked: ["value_judgement"], card_number: 42, origin: { surface: "/mcp" } },
  };
}

describe("the sizes rule on its own", () => {
  it("names each comparison without sizes and each comparing finding with none behind it", () => {
    const value = publicDossierOf(storedOf(dossier((change) => { delete change.studies[3].participants; })), false);
    expect(publicSizeProblems(value)).toEqual([{ path: "findings[3].rests_on", rule: "finding_sizes_missing" }]);
  });
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function serve(handler: AtlasPagesHandler): Promise<string> {
  const server = createAskRigorHttpServer({ publicServerEnabled: false, atlasPagesHandler: handler });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function get(base: string, path: string) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: await response.text() };
}

describe("dossiers on the Atlas's pages", () => {
  async function published(change?: (value: Record<string, any>) => void) {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication, ...(change === undefined ? {} : { value: dossier(change) }) }));
    const source = new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore() });
    return { publications, base: await serve(createAtlasPagesHandler({ enabled: true, source, signal: new AtlasChangeSignal(),
      dossiers: publications })) };
  }

  it("leads a topic page with the main points at a glance, each opening onto what it rests on, sizes included", async () => {
    const { base } = await published();
    const { status, body } = await get(base, "/atlas/topics/inositol-invented");
    expect(status).toBe(200);
    expect(atlasPageProblems(body)).toEqual([]);
    expect(body).toContain("Research dossiers: main points at a glance");
    expect(body).toContain("Not checked by supervisors yet");
    expect(body).toContain(DOSSIER_ORDER_LINE);
    expect(body).toContain("data-nosnippet");
    expect(body).toContain('<meta name="robots" content="noindex">');
    // Rule 333a: the decision-changing harm (hard to find) and the overlooked option lead; the known myo-inositol
    // finding comes before the not-known one of the same form, however sure that one is.
    const order = ["High-dose scyllo-inositol came with more serious infections", "In one uncontrolled pilot of ten men",
      "Myo-inositol 2 g a day improved fasting insulin", "Whether myo-inositol helps mood is not known"]
      .map((claim) => body.indexOf(claim));
    expect(order.every((place) => place > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Each finding says its kind of evidence with its size; each comparison its groups.
    expect(body).toContain("1 human trial (200 people)");
    expect(body).toContain("1 human trial (10 people)");
    expect(body).toContain("30 of 50 (60%) against 20 of 50 (40%); number needed to treat 5");
    expect(body).toContain("How AskRigor read it: Full text, with its methods audited by AskRigor");
    expect(body).toContain('<a href="/atlas/dossiers/D-1001">D-1001</a>');
    expect(body).toContain('<a href="/atlas/topics/inositol">Inositol: forms, benefits and risks</a>');
    expect(body).not.toMatch(/ARD-|ARF-|\/mcp|claude/u);
  });

  it("gives each dossier its own page: what was checked and how deeply, every study, result and search", async () => {
    const { base } = await published();
    const { status, body } = await get(base, "/atlas/dossiers/D-1001");
    expect(status).toBe(200);
    expect(atlasPageProblems(body)).toEqual([]);
    expect(body).toContain("What do the different forms of inositol do, and what are their risks?");
    expect(body).toContain("What was checked, and how deeply");
    expect(body).toContain("1 search in PubMed, 140 records found; 5 studies considered:");
    expect(body).toContain("Not checked: that each paper says what a finding claims: the researching AI’s reading");
    expect(body).toContain("The researching AI judged it with high confidence.");
    expect(body).toContain("Every study (5)");
    expect(body).toContain("animal study, myo-inositol, 40 people");
    expect(body).toContain('<meta name="robots" content="noindex">');
    expect(body).not.toMatch(/ARD-|ARF-|\/mcp|claude|0123abc/u);
    expect((await get(base, "/atlas/dossiers/D-1002")).status).toBe(404);
  });

  it("lists dossier topics, and shows nothing of dossiers while public dossiers are off", async () => {
    const { base } = await published();
    expect((await get(base, "/atlas/topics")).body).toContain('<a href="/atlas/topics/inositol-invented">Inositol (invented)</a> — 5 findings');
    const off = await serve(createAtlasPagesHandler({ enabled: true, signal: new AtlasChangeSignal(),
      source: new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore() }) }));
    expect((await get(off, "/atlas/dossiers/D-1001")).status).toBe(404);
    expect((await get(off, "/atlas/topics/inositol-invented")).status).toBe(404);
    expect(atlasRouteOf("/atlas/dossiers/D-1001")).toEqual({ kind: "dossier", publicNumber: "D-1001" });
    expect(atlasRouteOf("/atlas/dossiers/ARD-0001")).toBeUndefined();
  });

  it("leaves a held dossier off every page, and indexes an accepted one", async () => {
    const held = await published((value) => { value.value.confidence = "moderate"; });
    expect((await get(held.base, "/atlas/dossiers/D-1001")).status).toBe(404);
    const accepted = await published();
    await new AtlasDossierReview({ store: accepted.publications, now: () => NOW }).run({ action: "accept_dossier",
      dossier: "D-1001" });
    const page = (await get(accepted.base, "/atlas/dossiers/D-1001")).body;
    expect(page).toContain("Checked by supervisors");
    expect(page).not.toContain('<meta name="robots" content="noindex">');
    expect(page).not.toContain("data-nosnippet");
  });
});

describe("the owner's dossier actions (runtime only)", () => {
  it("lists the check's queue, inspects one, shows it, holds it back and takes it down with a reason", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication, value: dossier((value) => { value.value.confidence = "low"; }) }));
    const review = new AtlasDossierReview({ store: publications, now: () => NOW });
    const queue = await review.run({ action: "list_dossiers" });
    expect(queue.text).toContain("D-1001 version 1 (ARD-0001), held, topic inositol-invented, held for: not_high_confidence;" +
      " researched in a chat through the Claude plugin");
    const inspected = await review.run({ action: "inspect_dossier", dossier: "D-1001" });
    expect(inspected.dossiers?.items[0]?.content).toMatchObject({ question: expect.any(String) });
    expect((await review.run({ action: "show_dossier", dossier: "D-1001" })).text)
      .toBe("D-1001 version 1 is now shown, at /atlas/dossiers/D-1001.");
    expect((await review.run({ action: "hold_dossier", dossier: "D-1001" })).ok).toBe(false);
    expect((await review.run({ action: "hold_dossier", dossier: "D-1001", reason: "a misread figure" })).text)
      .toBe("D-1001 version 1 is now held, off the pages.");
    expect((await review.run({ action: "take_down_dossier", dossier: "D-1001", reason: "invented test" })).ok).toBe(true);
    expect((await review.run({ action: "show_dossier", dossier: "D-1009" })).ok).toBe(false);
  });
});

describe("the dossier's shape and migration 0040", () => {
  it("asks for the public declarations in the shape, without saying anything goes public", () => {
    expect(RESEARCH_DOSSIER_SHAPE).toContain("value.confidence (high, moderate or low");
    expect(RESEARCH_DOSSIER_SHAPE).toContain("names_living_people (true when any text makes a claim about a named living person");
    expect(RESEARCH_DOSSIER_SHAPE).toContain("each comparing result's group_sizes ({option, comparator}");
    // Under notice v6 a dossier is private; the shape asks for what a page would need without promising a page.
    expect(RESEARCH_DOSSIER_SHAPE).not.toMatch(/Atlas|published|shown on/u);
  });

  it("ships a migration that publishes nothing until a notice is listed, and gives the reader only two views", async () => {
    const migration = await readFile(new URL("../packages/evidence-repository/migrations/0040_research_dossier_publications.sql",
      import.meta.url), "utf8");
    expect(migration).not.toMatch(/INSERT INTO research_dossier_public_notices/u);
    expect(migration).toContain("NOT EXISTS (SELECT 1 FROM research_dossier_public_notices notice");
    expect(migration).toContain("FOR NO KEY UPDATE;");
    expect(migration).toContain("GRANT SELECT ON TABLE research_dossier_public_pages TO askrigor_reader;");
    expect(migration).toContain("GRANT SELECT ON TABLE research_dossier_public_history TO askrigor_reader;");
    expect(migration.match(/GRANT /gu)).toHaveLength(2);
    for (const table of ["research_dossier_public_notices", "research_dossier_publications",
      "research_dossier_public_versions", "research_dossier_public_events"]) {
      expect(migration).toContain(`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE ${table} FROM askrigor_reader;`);
    }
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")), header: chunk.slice(0, chunk.indexOf("AS $")) }));
    for (const { name, header } of functions) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
      if (name !== "research_dossier_public_version_guard") expect(header).toContain("SECURITY DEFINER");
    }
    // The views show no column that names the account, the private number, where the research ran or why it was held.
    const views = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW research_dossier_public_pages"),
      migration.indexOf("COMMENT ON VIEW"));
    expect(views.split("FROM")[0]).not.toMatch(/origin|account|dossier_number|hold_reasons|privacy_read/u);
  });
});

// Through the tool, over HTTP with the owner's reviewer login: runtime actions with their inputs in later_inputs, so the
// published tool list stays as it is (owner answer 189a).
describe("the dossier actions through review_research_contribution", () => {
  const resource = new URL("https://mcp.askrigor.example/mcp");
  const issuerUrl = new URL("https://identity.askrigor.example/");
  const OWNER = "auth0|synthetic-owner";
  const servers: HttpServer[] = [];
  const clients: Client[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it("lists the queue and shows a held dossier, with each later input only where it belongs", async () => {
    expect(laterInputNames("review_research_contribution")).toEqual(expect.arrayContaining(["dossier", "dossierVersion",
      "dossierState"]));
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication, value: dossier((value) => { value.value.confidence = "low"; }) }));
    const atlas = new AtlasReview({ store: new InMemoryAtlasReviewStore(), reader: new InMemoryAtlasCanonicalStore(),
      inbox: {} as never, version: "0.1.0", build: "unknown", protocols: async () => [], now: () => NOW,
      dossierPublications: publications });
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "dossier-publication-test-key" };
    const server = createAskRigorHttpServer({ publicServerEnabled: true,
      oauthResourceServer: createJwtOAuthResourceServer({ resourceUrl: resource, issuerUrl,
        jwks: createLocalJWKSet({ keys: [jwk] }), allowedClientIds: ["chatgpt-client"], reviewerSubjects: [OWNER] }),
      atlasReview: atlas, atlasReviewEnabled: true });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const token = await new SignJWT({ iss: issuerUrl.href, aud: resource.href, exp: Math.floor(Date.now() / 1_000) + 300,
      client_id: "chatgpt-client", scope: "cases:review", sub: OWNER }).setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .sign(privateKey);
    const client = new Client({ name: "dossier-publication-test", version: "1.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base),
      { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    const call = (args: Record<string, unknown>) => client.callTool({ name: "review_research_contribution", arguments: args });
    const listed = await call({ action: "list_dossiers" });
    expect(listed.structuredContent).toMatchObject({ ok: true, outcome: "dossiers_listed",
      dossiers: { items: [{ dossier: "D-1001", state: "held", holdReasons: ["not_high_confidence"], page: null }] } });
    const shown = await call({ action: "show_dossier", later_inputs: { dossier: "d-1001" } });
    expect(shown.structuredContent).toMatchObject({ ok: true, outcome: "dossier_decided",
      dossiers: { items: [{ dossier: "D-1001", state: "shown", page: "/atlas/dossiers/D-1001" }] } });
    expect((await call({ action: "list_dossiers", later_inputs: { dossier: "D-1001" } })).isError).toBe(true);
    expect((await call({ action: "keep_for_research", reason: "x", later_inputs: { dossierState: "held" } })).isError)
      .toBe(true);
  });
});
