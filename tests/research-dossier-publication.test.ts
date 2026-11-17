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
  researchDossierReminder,
  researchDossierShape,
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
        population_key: "adults-metabolic-syndrome", rests_on: ["r1"],
        what_would_change_it: "Larger trials with clinical outcomes", importance: "important" },
      { id: "f3", claim: "High-dose scyllo-inositol came with more serious infections than placebo.",
        certainty: "moderate", kind: "harms", applies_to: "Adults with a memory disorder", form: "scyllo-inositol",
        rests_on: ["r3"], what_would_change_it: "A trial at lower doses", importance: "decision_changing" },
      { id: "f4", claim: "IP6 lowered iron absorption in a high-phytate diet.", certainty: "low", kind: "harms",
        applies_to: "Adults eating a high-phytate diet", form: "IP6", rests_on: ["r4"],
        what_would_change_it: "Studies of supplements apart from diet", importance: "important" },
      { id: "f5", claim: "Whether myo-inositol helps mood is not known: the search found no trial of it.",
        certainty: "high", kind: "not_known", applies_to: "Adults with a metabolic syndrome", form: "myo-inositol",
        population_key: "adults-metabolic-syndrome", rests_on: ["q1"], what_would_change_it: "Any trial of it for mood",
        importance: "decision_changing" },
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

const PRIVACY_PASS = async () => ({ status: "pass" as const });
const NO_CONFLICT = async () => ({ status: "read" as const, conflicts: [] });

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
    // A fake of AskRigor's privacy reading that passes; no model is called in these tests.
    privacyReading: PRIVACY_PASS,
    now: () => NOW,
    newVersionId: () => deterministicUuid(`dossier-publication-test:${sequence++}`),
    ...rest,
  };
}

/** The fixture as stage 1 (released under notice 6) takes it: none of stage 2's declarations. */
function stage1Dossier(change: (value: Record<string, any>) => void = () => undefined): Record<string, any> {
  return dossier((value) => {
    delete value.value.confidence;
    delete value.names_living_people;
    delete value.topic.related;
    for (const study of value.studies) delete study.participants;
    for (const result of value.results) delete result.group_sizes;
    for (const finding of value.findings) delete finding.population_key;
    change(value);
  });
}

/** The sizes rule on a public part, as the database's research_dossier_public_sizes_complete reads it. */
const sizesComplete = (payload: Record<string, unknown>) => {
  const read = readPublicDossier(payload);
  return read !== undefined && publicSizeProblems(read).length === 0;
};

function stores() {
  const dossiers = new InMemoryResearchDossierStore();
  const publications = new InMemoryResearchDossierPublications({ dossiers, project: publicDossierOf, sizesComplete });
  // A fake of AskRigor's conflict reading that finds no conflict; no model is called in these tests.
  return { dossiers, publications, publication: { publisher: publications, noticeCovering: COVERING,
    conflictReader: NO_CONFLICT } };
}

describe("a saved dossier's public copy (332a: the researching AI's own judgement decides)", () => {
  it("is off by default: the setting, the empty list of covering notices and the live notice stay as they were", () => {
    expect(publicDossiersEnabledFromEnv(undefined)).toBe(false);
    expect(publicDossiersEnabledFromEnv("on")).toBe(false);
    expect(publicDossiersEnabledFromEnv("enabled")).toBe(true);
    expect(PUBLIC_DOSSIER_NOTICE_VERSIONS).toEqual([]);
    expect(RESEARCH_USE_NOTICE_VERSION).toBe("free-contributor-v6-2026-11-15");
  });

  // Codex's review, finding 6: with the setting off, stage 1 stays exactly as released under notice 6.
  it("keeps stage 1 as released while public dossiers are off: no stage 2 field, no connector record, no new guidance",
    async () => {
      const { dossiers } = stores();
      const refused = await saveResearchDossier(dossiers, request());
      expect(refused?.disposition).toMatchObject({ status: "insufficient", reason: "checks_failed" });
      // Each unknown key is refused where it stands, as released stage 1 refuses any key it does not know.
      expect(refused?.disposition?.problems).toEqual([{ path: "value", rule: "shape" }, { path: "topic", rule: "shape" },
        { path: "studies[1]", rule: "shape" }, { path: "studies[3]", rule: "shape" }, { path: "studies[4]", rule: "shape" },
        { path: "findings[1]", rule: "shape" }, { path: "findings[4]", rule: "shape" },
        { path: "research_dossier", rule: "shape" }]);
      const saved = await saveResearchDossier(dossiers, request({ value: stage1Dossier() }));
      expect(saved?.disposition?.status).toBe("saved");
      const [version] = dossiers.snapshot();
      const stored = await dossiers.readVersion(ACCOUNT, version!.versionId);
      expect(Object.keys((stored!.payload as { stamp: Record<string, unknown> }).stamp)).not.toContain("origin");
      expect(stored!.payload).not.toHaveProperty("names_living_people");
      for (const text of [RESEARCH_DOSSIER_SHAPE, researchDossierShape(false)]) {
        expect(text).not.toMatch(/confidence|names_living_people|group_sizes|participants|topic\.related|runner/u);
      }
      expect(researchDossierShape(true)).toContain("value.confidence (high, moderate or low");
      expect(researchDossierReminder(false)).not.toMatch(/confidence|names_living_people|group_sizes/u);
      expect(researchDossierReminder(true)).toContain("names_living_people");
    });

  // Codex's review, finding 1: the deterministic screen passes a living person's treatment and town; only a semantic
  // privacy reading that passed the exact saved content lets a copy show.
  it("holds a copy waiting for the privacy reading unless a reading passed exactly what was saved", async () => {
    const personal = dossier((value) => {
      value.findings[1].claim = "Zayd Qureshi receives dialysis in Nouakchott and took myo-inositol 2 g a day.";
    });
    for (const privacyReading of [undefined, async () => ({ status: "unavailable" as const, reason: "daily_budget" as const })]) {
      const { dossiers, publications, publication } = stores();
      const outcome = await saveResearchDossier(dossiers, request({ value: personal, publication, privacyReading }));
      if (privacyReading !== undefined) {
        // A reading that could not be made (no money left today) saves nothing, so nothing can be shown either.
        expect(outcome?.disposition?.status).toBe("unavailable");
        expect(await publications.list(undefined, 10)).toEqual([]);
        continue;
      }
      expect(outcome?.disposition?.publication).toEqual({ status: "held", public_id: "D-1001",
        hold_reasons: ["privacy_reading_pending"] });
      expect(outcome?.note).toBe("Research dossier: saved, and its public copy is held (waiting for the privacy " +
        "reading): nothing appears on the public Atlas before AskRigor's privacy reading has passed it. Do not change " +
        "or resend it to get past the check.");
      expect(researchDossierLine(outcome!.disposition!)).toContain("It is not on AskRigor's public Atlas: a copy " +
        "written without you is held, since nothing appears there before AskRigor's privacy reading has passed it.");
      expect(await publications.listShown({ limit: 10 })).toEqual([]);
      // Neither the owner's show nor accept puts it up without a reading.
      const review = new AtlasDossierReview({ store: publications, now: () => NOW });
      expect((await review.run({ action: "show_dossier", dossier: "D-1001" })).ok).toBe(false);
      expect((await review.run({ action: "accept_dossier", dossier: "D-1001" })).ok).toBe(false);
      expect(await publications.listShown({ limit: 10 })).toEqual([]);
      expect((await review.run({ action: "list_dossiers" })).text).toContain("held for: waiting for the privacy reading");
    }
    // The pass is read from the saved record itself: a stored dossier without it is held, whatever the caller says.
    const { dossiers, publications } = stores();
    const passed = await saveResearchDossier(dossiers, request({ publication: { publisher: publications,
      noticeCovering: COVERING } }));
    expect(passed?.disposition?.publication?.status).toBe("shown");
    const [version] = dossiers.snapshot();
    const stored = (await dossiers.readVersion(ACCOUNT, version!.versionId))!.payload as Record<string, any>;
    expect(stored.stamp.privacy_reading).toBe("pass");
    const unread = structuredClone(stored);
    unread.question = "A record this version never saved?";
    const second = stores();
    // Saved with stage 2's declarations and no reading, under a notice that covers nothing yet: not published.
    await saveResearchDossier(second.dossiers, request({ privacyReading: undefined,
      publication: { publisher: second.publications, noticeCovering: [] } }));
    const [unpublished] = second.dossiers.snapshot();
    const { publishResearchDossier } = await import("../apps/research-mcp/src/findings/dossier-publication.js");
    // Here the caller sends a record this version never saved, with a reading's pass, and claims a reading: the store
    // reads this version's saved record itself and refuses what is not its public part.
    const publish = (stored: Record<string, unknown>) => publishResearchDossier({ publisher: second.publications,
      accountKey: ACCOUNT, noticeVersion: RESEARCH_USE_NOTICE_VERSION, noticeCovering: COVERING,
      versionId: unpublished!.versionId, dossierNumber: unpublished!.dossierNumber, stored, privacyRead: true,
      at: NOW } as never);
    expect(await publish(unread)).toEqual({ status: "not_published", reason: "not_publishable" });
    // Its own record, which no reading passed, is held for the reading.
    const own = (await second.dossiers.readVersion(ACCOUNT, unpublished!.versionId))!.payload!;
    expect(await publish(own)).toMatchObject({ status: "held",
      hold_reasons: expect.arrayContaining(["privacy_reading_pending"]) });
  });

  it("publishes nothing without a publisher, and nothing for a notice that does not cover public dossiers", async () => {
    const { dossiers, publications } = stores();
    const off = await saveResearchDossier(dossiers, request({ value: stage1Dossier() }));
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
    expect(shown!.payload).toMatchObject({ checked: { on: "2026-11-17", privacy_reading: true,
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

  it("lists, for the pages, where two shown dossiers reach opposite kinds of conclusion for one form", () => {
    const first = publicDossierOf(storedOf(dossier()));
    const second = { findings: first.findings.map((finding) => finding.id === "f2"
      ? { ...finding, kind: "no_difference" } : finding) };
    const background = (finding: PublicDossierFinding) => ({ ...finding, importance: "context" as const });
    expect(dossierDisagreements({ findings: first.findings.map(background) },
      { findings: second.findings.map(background) })).toEqual([{ form: "myo-inositol", mine: "f2", theirs: "f2",
      important: false }]);
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

// Codex's review, finding 5: losing access is treated like erasure for an accepted copy: it stays, written without the
// person, but keeps no link to the account and no record of where its research ran.
describe("an accepted copy when its contributor loses access", () => {
  it("stays on the pages with no link to the account and no connector record; unaccepted copies leave", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    const review = new AtlasDossierReview({ store: publications, now: () => NOW });
    expect((await review.run({ action: "accept_dossier", dossier: "D-1001" })).ok).toBe(true);
    // A second dossier of the same account, shown and not accepted.
    await saveResearchDossier(dossiers, request({ publication, value: dossier((value) => {
      value.question = "Which inositol forms were tested against placebo?"; }) }));
    expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber).sort())
      .toEqual(["D-1001", "D-1002"]);
    dossiers.revoke(ACCOUNT, NOW);
    expect((await publications.listShown({ limit: 10 })).map(({ publicNumber, accepted }) => [publicNumber, accepted]))
      .toEqual([["D-1001", true]]);
    const [kept] = await publications.inspect("D-1001");
    expect(kept).toMatchObject({ state: "shown", accepted: true, dossierNumber: null, origin: {} });
    expect((await review.run({ action: "inspect_dossier", dossier: "D-1001" })).text)
      .toContain("D-1001 version 1, shown, checked by supervisors, topic inositol-invented; where its research ran " +
        "is not kept (its contributor's access ended or its research was deleted)");
    expect((await publications.inspect("D-1002"))[0]).toMatchObject({ state: "taken_down", dossierNumber: "ARD-0002" });
    // Nothing of the account remains to find it by: no copy names a private version of it.
    expect(publications.snapshot().find(({ publicNumber }) => publicNumber === "D-1001")).toMatchObject({ linked: false });
  });
});

// Codex's review, finding 10: the publisher takes nothing on trust from the access role: the public copy, its topic,
// digest, origin and why it is held are derived from the private record, and a payload that is not exactly the record's
// public part, or breaks the sizes rule, is refused.
describe("the publisher's own derivation", () => {
  async function saved(change?: (value: Record<string, any>) => void) {
    const { dossiers, publications } = stores();
    // Saved privately with stage 2's declarations (a publisher that never publishes: no notice covers it).
    await saveResearchDossier(dossiers, request({ publication: { publisher: publications, noticeCovering: [] },
      ...(change === undefined ? {} : { value: dossier(change) }) }));
    const [version] = dossiers.snapshot();
    const stored = (await dossiers.readVersion(ACCOUNT, version!.versionId))!.payload as Record<string, any>;
    return { publications, versionId: version!.versionId, stored, honest: publicDossierOf(stored) };
  }
  const claimed = (versionId: string, payload: unknown) => ({ accountKey: ACCOUNT, versionId, payload,
    topicKey: "inositol-invented", relatedTopicKeys: [], payloadSha256: "a".repeat(64), state: "shown", holdReasons: [],
    compared: [], conflictCheck: "read", conflictsWith: [], importantConflict: false, origin: { surface: "/mcp" },
    privacyRead: true, at: NOW }) as never;

  it("refuses a payload that is not exactly the saved record's public part", async () => {
    const { publications, versionId, honest } = await saved();
    const tampered = { ...honest, question: "Zayd Qureshi's dialysis in Nouakchott" };
    expect(await publications.publish(claimed(versionId, tampered))).toEqual({ outcome: "payload_refused" });
    expect(await publications.publish(claimed(versionId, { ...honest, extra: "anything" })))
      .toEqual({ outcome: "payload_refused" });
    expect(await publications.list(undefined, 10)).toEqual([]);
  });

  it("derives why a copy is held from the private record, whatever state the caller claims", async () => {
    const moderate = await saved((value) => { value.value.confidence = "moderate"; value.names_living_people = true; });
    expect(await moderate.publications.publish(claimed(moderate.versionId, moderate.honest))).toMatchObject({
      outcome: "published", state: "held", holdReasons: ["not_high_confidence", "names_living_people"] });
    const [row] = await moderate.publications.list(undefined, 10);
    expect(row).toMatchObject({ topicKey: "inositol-invented", namesLivingPerson: true, privacyRead: true,
      origin: { surface: "/mcp/claude", run: "chat", readings: "askrigor" } });
  });

  it("refuses a comparison without its group sizes even when the caller skips the check", async () => {
    const { publications, versionId, honest } = await saved((value) => { value.results[1].comparator = "baseline"; });
    expect(await publications.publish(claimed(versionId, honest))).toEqual({ outcome: "payload_refused" });
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
    const base = publicDossierOf(storedOf(dossier()));
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
    const men = { form: "D-chiro-inositol", population_key: "healthy-men" };
    expect(ranked([
      { kind: "not_known", certainty: "high", importance: "decision_changing", ...men, rests_on: ["q1"] },
      { kind: "helps", certainty: "low", importance: "context", ...men, rests_on: ["r2"] },
      { kind: "no_difference", importance: "context", ...men },
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

  // Codex's review, finding 7: rule 3 is for the same form and the same people, as the AI declared them; an identity
  // not given never matches.
  it("compares the declared people as well as the form, and never matches a form or people not given", () => {
    // A decision-changing unknown about children stays above a background known effect in adults.
    expect(ranked([
      { kind: "not_known", importance: "decision_changing", form: "myo-inositol", population_key: "children",
        rests_on: ["q1"] },
      { kind: "helps", importance: "context", form: "myo-inositol", population_key: "adults" },
    ])).toEqual(["f1", "f2"]);
    // For the same people it goes after the known effect.
    expect(ranked([
      { kind: "not_known", importance: "decision_changing", form: "myo-inositol", population_key: "adults",
        rests_on: ["q1"] },
      { kind: "helps", importance: "context", form: "Myo-Inositol", population_key: "adults" },
    ])).toEqual(["f2", "f1"]);
    // Neither a missing form nor missing people compare as equal.
    for (const missing of [{ population_key: "adults" }, { form: "myo-inositol" }, {}]) {
      expect(ranked([
        { kind: "not_known", importance: "decision_changing", rests_on: ["q1"], ...missing },
        { kind: "helps", importance: "context", ...missing },
      ])).toEqual(["f1", "f2"]);
    }
  });

  it("keeps the AI's declared people in the public part, and asks for them only while public dossiers are on", async () => {
    const { dossiers, publications, publication } = stores();
    expect((await saveResearchDossier(dossiers, request({ publication })))?.disposition?.publication?.status)
      .toBe("shown");
    const [shown] = await publications.listShown({ limit: 1 });
    expect(readPublicDossier(shown!.payload)?.findings[1]).toMatchObject({ population_key: "adults-metabolic-syndrome" });
    expect(researchDossierShape(true)).toContain("each finding's population_key");
    expect(researchDossierShape(false)).not.toContain("population_key");
  });
});

// Codex's review, finding 7: an importance mark is revised only by a new, reviewed version, never in place.
describe("a reviewed revision of an importance mark", () => {
  it("makes a new version with the reviewer and reason recorded, and keeps the old one as it was", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    const review = new AtlasDossierReview({ store: publications, now: () => NOW });
    const ask = { action: "revise_dossier_importance" as const, dossier: "D-1001", dossierFinding: "f4",
      dossierImportance: "decision_changing" as const, reviewer: "auth0|synthetic-owner" };
    expect((await review.run(ask)).ok).toBe(false);
    expect((await review.run({ ...ask, reason: "Iron loss matters for people with anaemia", reviewer: undefined })).ok)
      .toBe(false);
    expect((await review.run({ ...ask, dossierFinding: "f9", reason: "No such finding" })).ok).toBe(false);
    const revised = await review.run({ ...ask, reason: "Iron loss matters for people with anaemia" });
    expect(revised.text).toBe("D-1001 version 2 now marks finding f4 as could change a decision (it was important), " +
      "on your review; version 1 is kept as it was.");
    expect(revised.dossiers?.items[0]).toMatchObject({ version: 2, state: "shown", revision: { of: 1,
      by: expect.stringMatching(/^reviewer:[0-9a-f]{16}$/u), reason: "Iron loss matters for people with anaemia" } });
    const copies = await publications.inspect("D-1001");
    expect(copies.map(({ versionNumber, state }) => [versionNumber, state])).toEqual([[2, "shown"], [1, "superseded"]]);
    const findingOf = (payload: unknown) => readPublicDossier(payload)!.findings.find(({ id }) => id === "f4")!;
    expect(findingOf(copies[0]!.payload).importance).toBe("decision_changing");
    expect(findingOf(copies[1]!.payload).importance).toBe("important");
    const [shown] = await publications.listShown({ limit: 1 });
    expect(shown!.versionNumber).toBe(2);
    // The same mark again changes nothing.
    expect((await review.run({ ...ask, reason: "again" })).ok).toBe(false);
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
    const value = publicDossierOf(storedOf(dossier((change) => { delete change.studies[3].participants; })));
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
    // Codex's review, finding 11: an animal study's size is in animals, never people.
    expect(body).toContain("animal study, myo-inositol, 40 animals");
    expect(body).not.toContain("40 people");
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

// Codex's review, findings 8, 9 and 11: an exact dossier or topic is read by its own number or key before any limit;
// collections come a page at a time within a size; a change anywhere drops every server's cached pages; sizes are in
// people, animals or lab samples.
describe("the dossier pages' reads, pages, size and cache", () => {
  /**
   * D-1001 saved and shown as usual, then many more shown copies of its saved record, each a dossier of its own on the
   * topic given, written straight into the stores (as the publish function would) so the test stays quick.
   */
  async function many(count: number, topicOf: (index: number) => string) {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    const [first] = dossiers.snapshot();
    const base = (await dossiers.readVersion(ACCOUNT, first!.versionId))!.payload as Record<string, any>;
    for (let index = 0; index < count; index += 1) {
      const key = topicOf(index);
      const payload = structuredClone(base);
      payload.question = `Synthetic question ${index}: what do inositol forms do?`;
      payload.topic = { key, name: `Topic ${key}`, other_names: [], related: [] };
      payload.forms = [`form-${key}`];
      const hex = createHash("sha256").update(`many:${index}`).digest("hex");
      const versionId = deterministicUuid(`many:${index}`);
      // Each a second later than the one before, so D-1001 is the oldest.
      const at = new Date(NOW.getTime() + (index + 1) * 1_000);
      await dossiers.append({ accountKey: ACCOUNT, dossierKey: hex, threadKey: hex, requestKey: hex, inputSha256: hex,
        payload, payloadSha256: hex, cardNumber: null, identifiers: [], expectedPreviousVersionId: null, versionId, at });
      const compared: string[] = [];
      for (let page = await publications.conflictCandidates(ACCOUNT, versionId, null, 200); page.length > 0;
        page = page.length < 200 ? [] : await publications.conflictCandidates(ACCOUNT, versionId, page.at(-1)!, 200)) {
        compared.push(...page.map(({ publicNumber, versionNumber }) => `${publicNumber}/${versionNumber}`));
      }
      const shown = await publications.publish({ accountKey: ACCOUNT, versionId, payload: publicDossierOf(payload) as never,
        compared, conflictCheck: "read", conflictsWith: [], importantConflict: false, at });
      expect(shown).toMatchObject({ outcome: "published", state: "shown" });
    }
    return { dossiers, publications };
  }
  const handler = (publications: InMemoryResearchDossierPublications, signal = new AtlasChangeSignal()) =>
    createAtlasPagesHandler({ enabled: true, signal, dossiers: publications,
      source: new InMemoryAtlasPageSource({ publications: new InMemoryAtlasPublicationStore() }) });

  it("finds an older dossier's page and topic past the newest 500 shown dossiers", async () => {
    const { publications } = await many(501, (index) => `topic-${index}`);
    const base = await serve(handler(publications));
    expect((await get(base, "/atlas/dossiers/D-1001")).status).toBe(200);
    expect((await get(base, "/atlas/topics/inositol-invented")).status).toBe(200);
    expect((await get(base, "/atlas/topics")).body).toContain('<a href="/atlas/topics/inositol-invented">');
  }, 60_000);

  it("shows a topic's dossiers a page at a time, and keeps a page within its size", async () => {
    const { publications } = await many(45, () => "crowded-invented");
    const base = await serve(handler(publications));
    const first = await get(base, "/atlas/topics/crowded-invented");
    expect(first.status).toBe(200);
    expect(first.body.match(/<li><a href="\/atlas\/dossiers\/D-\d+">/gu)).toHaveLength(20);
    expect(first.body).toContain('<a rel="next" href="/atlas/topics/crowded-invented?page=2">Older dossiers on this topic</a>');
    const third = await get(base, "/atlas/topics/crowded-invented?page=3");
    expect(third.body.match(/<li><a href="\/atlas\/dossiers\/D-\d+">/gu)).toHaveLength(5);
    expect(third.body).not.toContain("Older dossiers on this topic");
    expect((await get(base, "/atlas/topics/crowded-invented?page=4")).status).toBe(404);
    // The findings list stops at its size, and says how many more there are and where.
    const { loadDossierTopic, dossierTopicSection } = await import("../apps/research-mcp/src/atlas/dossier-pages.js");
    const model = (await loadDossierTopic(publications, "crowded-invented"))!;
    const section = dossierTopicSection(model, { findingBytes: 20_000 }).value;
    expect(Buffer.byteLength(section, "utf8")).toBeLessThan(80_000);
    expect(section).toMatch(/\d+ more findings are in the dossiers below, each on its own page\./u);
  }, 60_000);

  it("drops every server's cached dossier pages when the research is withdrawn, also in another process", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    // Two servers, each with its own cache and its own change signal, reading the same database.
    const one = await serve(handler(publications));
    const two = await serve(handler(publications));
    for (const base of [one, two]) {
      expect((await get(base, "/atlas/dossiers/D-1001")).status).toBe(200);
      expect((await get(base, "/atlas/topics/inositol-invented")).body).toContain("D-1001");
    }
    // Revocation lands in the database (a trigger), announced on neither server's signal.
    dossiers.revoke(ACCOUNT, NOW);
    for (const base of [one, two]) {
      expect((await get(base, "/atlas/dossiers/D-1001")).status).toBe(404);
      expect((await get(base, "/atlas/topics/inositol-invented")).status).toBe(404);
    }
  });

  it("gives sizes in people, animals or lab samples, as the study was", async () => {
    const { dossiers, publications, publication } = stores();
    // The lab study's abstract was read in this research, as its receipt says.
    const saved = await saveResearchDossier(dossiers, request({ publication,
      receipts: [...RECEIPTS, receipt("pubmed_record", { pmid: "66666666", abs: "1" })], value: dossier((value) => {
      value.studies.push({ id: "s6", identifiers: ["PMID 66666666"], kind: "lab", form: "IP6", participants: 12,
        decision: "used" });
      value.findings.push({ id: "f6", claim: "IP6 slowed cell growth in a dish.", certainty: "low", kind: "helps",
        applies_to: "Cells in a dish", form: "IP6", rests_on: ["s6"], what_would_change_it: "Any study in people",
        importance: "context" });
    }) }));
    expect(saved?.disposition).toMatchObject({ status: "saved", publication: { status: "shown" } });
    const base = await serve(handler(publications));
    const page = (await get(base, "/atlas/dossiers/D-1001")).body;
    expect(page).toContain("lab study, IP6, 12 lab samples");
    expect(page).toContain("1 lab study (12 lab samples), not yet shown in people");
    expect(page).toContain("animal study, myo-inositol, 40 animals");
    expect(page).toContain("human trial, D-chiro-inositol, 10 people");
  });
});

describe("the owner's dossier actions (runtime only)", () => {
  it("lists the check's queue, inspects one, shows it, holds it back and takes it down with a reason", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication, value: dossier((value) => { value.value.confidence = "low"; }) }));
    const review = new AtlasDossierReview({ store: publications, now: () => NOW });
    const queue = await review.run({ action: "list_dossiers" });
    expect(queue.text).toContain("D-1001 version 1 (ARD-0001), held, topic inositol-invented, held for: the " +
      "researching AI was not highly confident in it; researched in a chat through the Claude plugin");
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

// Codex's review, findings 3 and 4: conflicts are found widely (every shown copy on the same or a linked topic, across
// forms and aliases, the dossier's own earlier copy included, all of them), compared for meaning by AskRigor's own paid
// reader (a fake here), and admitted one topic at a time against a comparison set checked again before the insert.
describe("conflicts with shown dossiers", () => {
  type Conflict = { finding: string; dossier: string; theirs: string };
  function fakeReader(report: (request: any) => Conflict[]) {
    const asked: any[] = [];
    return { asked, reader: async (request: any) => { asked.push(request); return { status: "read" as const,
      conflicts: report(request) }; } };
  }
  const other = { account: { mode: "FREE_CONTRIBUTOR" as const, accountKey: OTHER, findingsSave: true,
    noticeVersion: RESEARCH_USE_NOTICE_VERSION } };
  /** Another dossier on a linked topic, under another name, whose myo-inositol finding is a harm on the same outcome. */
  const harmOnLinkedTopic = dossier((value) => {
    value.question = "Does myo-inositol worsen fasting insulin?";
    value.topic = { key: "myo-inositol-invented", name: "Myo-inositol (invented)", other_names: [],
      related: ["inositol-invented"] };
    value.findings[1] = { ...value.findings[1], kind: "harms",
      claim: "Myo-inositol 2 g a day worsened fasting insulin against placebo over 12 weeks." };
  });

  it("holds a benefit against a harm on the same outcome, found on a linked topic and read for meaning", async () => {
    const { dossiers, publications } = stores();
    const quiet = fakeReader(() => []);
    expect((await saveResearchDossier(dossiers, request({ publication: { publisher: publications,
      noticeCovering: COVERING, conflictReader: quiet.reader } })))?.disposition?.publication?.status).toBe("shown");
    // Nothing was shown yet, so nothing was read and nothing paid for.
    expect(quiet.asked).toEqual([]);
    const { asked, reader } = fakeReader((request) => request.shown.flatMap((shown: any) =>
      shown.findings.filter((finding: any) => finding.id === "f2").map(() => ({ finding: "f2", dossier: shown.dossier,
        theirs: "f2" }))));
    const outcome = await saveResearchDossier(dossiers, request({ ...other, value: harmOnLinkedTopic,
      publication: { publisher: publications, noticeCovering: COVERING, conflictReader: reader } }));
    expect(outcome?.disposition?.publication).toEqual({ status: "held", public_id: "D-1002",
      hold_reasons: ["important_conflict"], conflicts_with: ["D-1001"] });
    expect(outcome?.note).toContain("it conflicts with a shown dossier on an important finding");
    // The reader saw both findings with their forms, people and importance, and nothing private.
    expect(asked[0].dossier.findings).toContainEqual(expect.objectContaining({ id: "f2", kind: "harms",
      form: "myo-inositol", applies_to: "Adults with a metabolic syndrome", importance: "important" }));
    expect(asked[0].shown.map(({ dossier: number }: any) => number)).toEqual(["D-1001"]);
    expect(JSON.stringify(asked)).not.toMatch(/ARD-|origin|\/mcp/u);
  });

  it("compares a new version with the dossier's own earlier shown copy", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    const { asked, reader } = fakeReader(() => [{ finding: "f2", dossier: "D-1001", theirs: "f2" }]);
    const reversed = dossier((value) => {
      value.findings[1] = { ...value.findings[1], kind: "no_difference",
        claim: "Myo-inositol did not change fasting insulin once a larger trial was counted." };
    });
    const outcome = await saveResearchDossier(dossiers, request({ value: reversed,
      publication: { ...publication, conflictReader: reader } }));
    expect(outcome?.disposition).toMatchObject({ version: 2, publication: { status: "held", public_id: "D-1001",
      hold_reasons: ["important_conflict"], conflicts_with: ["D-1001"] } });
    expect(asked[0].shown.map(({ dossier: number }: any) => number)).toEqual(["D-1001"]);
    // The first version stays shown until its successor is checked.
    expect((await publications.listShown({ limit: 10 })).map(({ versionNumber }) => versionNumber)).toEqual([1]);
  });

  it("holds a copy waiting for the conflict check when the reader can't read or isn't there", async () => {
    for (const conflictReader of [undefined,
      async () => ({ status: "unavailable" as const, reason: "daily_budget" as const })]) {
      const { dossiers, publications, publication } = stores();
      await saveResearchDossier(dossiers, request({ publication }));
      const outcome = await saveResearchDossier(dossiers, request({ ...other, value: dossier((value) => {
        value.question = "Which inositol forms were measured for fasting insulin?"; }),
        publication: { publisher: publications, noticeCovering: COVERING,
          ...(conflictReader === undefined ? {} : { conflictReader }) } }));
      expect(outcome?.disposition?.publication).toEqual({ status: "held", public_id: "D-1002",
        hold_reasons: ["conflict_check_pending"] });
      expect(outcome?.note).toContain("waiting for the conflict check");
      expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1001"]);
    }
  });

  it("checks the comparison again before the insert, so a dossier shown meanwhile is compared too", async () => {
    const { dossiers, publications } = stores();
    let meanwhile = false;
    // Another research's dossier is shown between this one's comparison and its insert.
    const racing = {
      conflictCandidates: (...args: unknown[]) => (publications.conflictCandidates as any)(...args),
      topicCopies: (...args: unknown[]) => (publications as any).topicCopies(...args),
      publish: async (input: any) => {
        if (!meanwhile) {
          meanwhile = true;
          await saveResearchDossier(dossiers, request({ publication: { publisher: publications, noticeCovering: COVERING,
            conflictReader: async () => ({ status: "read" as const, conflicts: [] }) } }));
        }
        return await publications.publish(input);
      },
    };
    const { asked, reader } = fakeReader((request) => request.shown.map((shown: any) => ({ finding: "f2",
      dossier: shown.dossier, theirs: "f2" })));
    const outcome = await saveResearchDossier(dossiers, request({ ...other, value: dossier((value) => {
      value.question = "Did myo-inositol change fasting insulin in a second trial?";
      value.findings[1] = { ...value.findings[1], kind: "no_difference",
        claim: "Myo-inositol did not change fasting insulin in a second trial." };
    }), publication: { publisher: racing as never, noticeCovering: COVERING, conflictReader: reader } }));
    // The other dossier took the first public number when it was shown meanwhile; this one is compared with it.
    expect(outcome?.disposition?.publication).toEqual({ status: "held", public_id: "D-1002",
      hold_reasons: ["important_conflict"], conflicts_with: ["D-1001"] });
    expect(asked.at(-1).shown.map(({ dossier: number }: any) => number)).toEqual(["D-1001"]);
    expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1001"]);
  });
});

// Codex's review, finding 2: the owner's rule is that a claim about a named living person is published only on his
// explicit decision, so the ordinary actions refuse such a copy and one separate action, with a typed reason, decides.
describe("a copy held for naming a living person", () => {
  it("is refused by show and accept, and shown only by the owner's separate decision, which records who and when",
    async () => {
      const { dossiers, publications, publication } = stores();
      const outcome = await saveResearchDossier(dossiers, request({ publication,
        value: dossier((value) => { value.names_living_people = true; }) }));
      expect(outcome?.disposition?.publication).toMatchObject({ status: "held", hold_reasons: ["names_living_people"] });
      const review = new AtlasDossierReview({ store: publications, now: () => NOW });
      for (const action of ["show_dossier", "accept_dossier"] as const) {
        const refused = await review.run({ action, dossier: "D-1001", reason: "looks fine" });
        expect(refused.ok).toBe(false);
        expect(refused.text).toContain("show_dossier_naming_living_person");
      }
      expect(await publications.listShown({ limit: 10 })).toEqual([]);
      // The separate action needs a typed reason and the reviewer login.
      expect((await review.run({ action: "show_dossier_naming_living_person", dossier: "D-1001",
        reviewer: "auth0|synthetic-owner" })).ok).toBe(false);
      expect((await review.run({ action: "show_dossier_naming_living_person", dossier: "D-1001",
        reason: "The named person is a public figure speaking in office" })).ok).toBe(false);
      const decided = await review.run({ action: "show_dossier_naming_living_person", dossier: "D-1001",
        reason: "The named person is a public figure speaking in office", reviewer: "auth0|synthetic-owner" });
      expect(decided.text).toBe("D-1001 version 1 is now shown, at /atlas/dossiers/D-1001, on your decision that " +
        "its claim about a named living person may be published.");
      expect(decided.dossiers?.items[0]).toMatchObject({ state: "shown", namesLivingPerson: true,
        livingPersonDecision: { by: expect.stringMatching(/^reviewer:[0-9a-f]{16}$/u), on: "2026-11-17",
          reason: "The named person is a public figure speaking in office" } });
      expect(JSON.stringify(decided)).not.toContain("auth0|synthetic-owner");
      expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1001"]);
      // Once decided, the ordinary actions apply to that copy; the decision is not made again.
      expect((await review.run({ action: "accept_dossier", dossier: "D-1001" })).ok).toBe(true);
      expect((await review.run({ action: "show_dossier_naming_living_person", dossier: "D-1001",
        reason: "again", reviewer: "auth0|synthetic-owner" })).ok).toBe(false);
      // It applies only to a copy held for naming a living person.
      const other = stores();
      await saveResearchDossier(other.dossiers, request({ publication: other.publication,
        value: dossier((value) => { value.value.confidence = "low"; }) }));
      expect((await new AtlasDossierReview({ store: other.publications, now: () => NOW }).run({
        action: "show_dossier_naming_living_person", dossier: "D-1001", reason: "no", reviewer: "x" })).ok).toBe(false);
    });

  // Codex's re-review of stage 2, P0: "didn't say" is not "no". A copy whose AI did not say whether a claim names a
  // living person is refused by the ordinary show and accept; only the owner's own recorded statement resolves it.
  it("refuses a copy whose AI didn't say until the owner states it himself, and records who stated what and when",
    async () => {
      const undeclared = dossier((value) => { delete value.names_living_people; });
      const { dossiers, publications, publication } = stores();
      const outcome = await saveResearchDossier(dossiers, request({ publication, value: undeclared }));
      expect(outcome?.disposition?.publication).toMatchObject({ status: "held",
        hold_reasons: ["living_people_undeclared"] });
      // The store refuses the ordinary show itself, whatever the action in front of it checks.
      for (const decision of ["show", "accept"] as const) {
        expect(await publications.decide({ publicNumber: "D-1001", versionNumber: 1, decision, reason: null, at: NOW }))
          .toMatchObject({ outcome: "not_decidable" });
      }
      const review = new AtlasDossierReview({ store: publications, now: () => NOW });
      for (const action of ["show_dossier", "accept_dossier"] as const) {
        const refused = await review.run({ action, dossier: "D-1001" });
        expect(refused.ok).toBe(false);
        expect(refused.text).toBe(`D-1001 version 1 can't be shown by ${action}: its researching AI did not say ` +
          "whether a claim names a living person. State it yourself first: state_dossier_living_person, with " +
          "later_inputs.dossierLivingPerson names_no_living_person or names_a_living_person. Nothing was changed.");
      }
      // Nothing says a person is named, so the separate decision does not apply either.
      expect((await review.run({ action: "show_dossier_naming_living_person", dossier: "D-1001",
        reason: "A public figure", reviewer: "auth0|synthetic-owner" })).ok).toBe(false);
      expect(await publications.listShown({ limit: 10 })).toEqual([]);
      // The statement needs the owner's words and his login.
      expect((await review.run({ action: "state_dossier_living_person", dossier: "D-1001",
        reviewer: "auth0|synthetic-owner" })).ok).toBe(false);
      expect((await review.run({ action: "state_dossier_living_person", dossier: "D-1001",
        dossierLivingPerson: "names_no_living_person" })).ok).toBe(false);
      const stated = await review.run({ action: "state_dossier_living_person", dossier: "D-1001",
        dossierLivingPerson: "names_no_living_person", reviewer: "auth0|synthetic-owner" });
      expect(stated.text).toBe("D-1001 version 1: your statement that no claim in it names a living person is " +
        "recorded, with who made it and when. It is still held; that question no longer keeps show_dossier or " +
        "accept_dossier from showing it.");
      expect(stated.dossiers?.items[0]).toMatchObject({ state: "held", namesLivingPerson: null,
        livingPersonStatement: { statement: "names_no_living_person",
          by: expect.stringMatching(/^reviewer:[0-9a-f]{16}$/u), on: "2026-11-17" } });
      expect(JSON.stringify(stated)).not.toContain("auth0|synthetic-owner");
      expect((await review.run({ action: "list_dossiers" })).text).toContain("held for: its researching AI did not " +
        "say whether a claim names a living person; you stated on 2026-11-17 that no claim in it names a living person");
      // Made once.
      expect((await review.run({ action: "state_dossier_living_person", dossier: "D-1001",
        dossierLivingPerson: "names_a_living_person", reviewer: "auth0|synthetic-owner" })).ok).toBe(false);
      expect((await review.run({ action: "show_dossier", dossier: "D-1001" })).text)
        .toBe("D-1001 version 1 is now shown, at /atlas/dossiers/D-1001.");

      // Stated as naming a living person, only the separate decision with a typed reason shows it.
      const named = stores();
      await saveResearchDossier(named.dossiers, request({ publication: named.publication, value: undeclared }));
      const namedReview = new AtlasDossierReview({ store: named.publications, now: () => NOW });
      expect((await namedReview.run({ action: "state_dossier_living_person", dossier: "D-1001",
        dossierLivingPerson: "names_a_living_person", reviewer: "auth0|synthetic-owner" })).text)
        .toBe("D-1001 version 1: your statement that a claim in it names a living person is recorded, with who made " +
          "it and when. It is still held; only show_dossier_naming_living_person, with your reason, can show it.");
      for (const action of ["show_dossier", "accept_dossier"] as const) {
        const refused = await namedReview.run({ action, dossier: "D-1001" });
        expect(refused.ok).toBe(false);
        expect(refused.text).toContain("show_dossier_naming_living_person");
      }
      expect(await named.publications.decide({ publicNumber: "D-1001", versionNumber: 1, decision: "show", reason: null,
        at: NOW })).toMatchObject({ outcome: "not_decidable" });
      expect((await namedReview.run({ action: "show_dossier_naming_living_person", dossier: "D-1001",
        reason: "The named person is a public figure speaking in office", reviewer: "auth0|synthetic-owner" })).ok)
        .toBe(true);
      expect((await named.publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber))
        .toEqual(["D-1001"]);
      // A copy whose AI did say takes no statement.
      const declared = stores();
      await saveResearchDossier(declared.dossiers, request({ publication: declared.publication,
        value: dossier((value) => { value.names_living_people = true; }) }));
      expect((await new AtlasDossierReview({ store: declared.publications, now: () => NOW }).run({
        action: "state_dossier_living_person", dossier: "D-1001", dossierLivingPerson: "names_no_living_person",
        reviewer: "auth0|synthetic-owner" })).ok).toBe(false);
    });
});

describe("the dossier's shape and migration 0040", () => {
  it("asks for the public declarations in the shape, without saying anything goes public", () => {
    const shape = researchDossierShape(true);
    expect(shape).toContain("value.confidence (high, moderate or low");
    expect(shape).toContain("names_living_people (true when any text makes a claim about a named living person");
    expect(shape).toContain("each comparing result's group_sizes ({option, comparator}");
    // Under notice v6 a dossier is private; the shape asks for what a page would need without promising a page.
    expect(shape).not.toMatch(/Atlas|published|shown on/u);
  });

  it("ships a migration that publishes nothing until a notice is listed, and gives the reader only four views", async () => {
    const migration = await readFile(new URL("../packages/evidence-repository/migrations/0040_research_dossier_publications.sql",
      import.meta.url), "utf8");
    expect(migration).not.toMatch(/INSERT INTO research_dossier_public_notices/u);
    expect(migration).toContain("NOT EXISTS (SELECT 1 FROM research_dossier_public_notices notice");
    expect(migration).toContain("FOR NO KEY UPDATE;");
    expect(migration).toContain("GRANT SELECT ON TABLE research_dossier_public_pages TO askrigor_reader;");
    expect(migration).toContain("GRANT SELECT ON TABLE research_dossier_public_history TO askrigor_reader;");
    // The topics list and the number that moves with every change (Codex's review, findings 8 and 9).
    expect(migration).toContain("GRANT SELECT ON TABLE research_dossier_public_topics TO askrigor_reader;");
    expect(migration).toContain("GRANT SELECT ON TABLE research_dossier_public_changes TO askrigor_reader;");
    expect(migration.match(/GRANT /gu)).toHaveLength(4);
    for (const table of ["research_dossier_public_notices", "research_dossier_publications",
      "research_dossier_public_versions", "research_dossier_public_events", "research_dossier_public_generation"]) {
      expect(migration).toContain(`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE ${table} FROM askrigor_reader;`);
    }
    const functions = migration.split("CREATE OR REPLACE FUNCTION ").slice(1).map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf("(")), header: chunk.slice(0, chunk.indexOf("AS $")) }));
    // The pure helpers that derive a copy from its private record (Codex's review, finding 10) read no table: they run
    // only inside the definer functions, as their owner.
    const pure = ["research_dossier_pick", "research_dossier_public_projection", "research_dossier_public_sizes_complete",
      "research_dossier_topic_names"];
    for (const { name, header } of functions) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^;]*\\) FROM PUBLIC;`, "u"));
      if (pure.includes(name)) expect(header).toMatch(/IMMUTABLE/u);
      else if (name !== "research_dossier_public_version_guard") expect(header).toContain("SECURITY DEFINER");
    }
    // The views show no column that names the account, the private number, where the research ran or why it was held.
    const views = migration.slice(migration.indexOf("CREATE OR REPLACE VIEW research_dossier_public_pages"),
      migration.indexOf("COMMENT ON VIEW"));
    expect(views.split("FROM")[0]).not.toMatch(/origin|account|dossier_number|hold_reasons|privacy_read/u);
  });

  // Codex's re-review of stage 2, P0: every transition that changes what is shown takes the per-topic locks automatic
  // publication takes, through the one helper that takes them in one sorted order; a review takes them before it locks
  // or writes any row, so it never holds a row a waiting publication needs. Its PostgreSQL race is in the acceptance.
  it("takes automatic publication's topic locks, in the same order, in every transition that changes what is shown",
    async () => {
      const migration = await readFile(new URL(
        "../packages/evidence-repository/migrations/0040_research_dossier_publications.sql", import.meta.url), "utf8");
      const body = (name: string) => {
        const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
        return migration.slice(migration.indexOf("BEGIN", start), migration.indexOf("$function$;", start));
      };
      expect(migration.match(/pg_advisory_xact_lock\(/gu)).toHaveLength(1);
      expect(body("research_dossier_lock_topics")).toContain("ORDER BY 1");
      expect(body("publish_research_dossier_version")).toContain("PERFORM research_dossier_lock_topics(names || related);");
      // A review's copies' keys are the same columns publication derives them into: names, then related topics.
      expect(body("research_dossier_lock_copy_topics")).toContain("PERFORM research_dossier_lock_topics(ARRAY(");
      expect(body("research_dossier_lock_copy_topics")).toContain("unnest(copy.topic_names || copy.related_topic_keys)");
      for (const name of ["decide_research_dossier_publication", "decide_research_dossier_living_person",
        "revise_research_dossier_importance"]) {
        const text = body(name);
        const locked = text.indexOf("PERFORM research_dossier_lock_copy_topics(target_public_number, target_version_number);");
        expect(locked, name).toBeGreaterThan(0);
        for (const write of [" FOR UPDATE", "UPDATE research_dossier_public_versions", "INSERT INTO research_dossier_public"]) {
          expect(text.indexOf(write), `${name}: ${write}`).toBeGreaterThan(locked);
        }
      }
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
