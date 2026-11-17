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
import { atlasPageProblems, rowPassesPageGuard } from "../apps/research-mcp/src/atlas/page-guard.js";
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
// Codex's re-review of stage 2, P1: a copy held waiting for the privacy reading can get one later, bound to the digest of
// the content read, on the owner's action and by the server when the reader is available again. A refusal is final for
// that content; an unavailable reader or no money left today is temporary. Fakes stand in for every reading.
describe("a privacy reading made later", () => {
  /** A copy saved while the reading was off: held, waiting for the privacy reading (and for anything else changed). */
  async function pending(change: (value: Record<string, any>) => void = () => undefined) {
    const { dossiers, publications, publication } = stores();
    const outcome = await saveResearchDossier(dossiers, request({ publication, privacyReading: undefined,
      value: dossier(change) }));
    expect(outcome?.disposition?.publication).toMatchObject({ status: "held",
      hold_reasons: expect.arrayContaining(["privacy_reading_pending"]) });
    return { dossiers, publications };
  }
  const OWNER = "auth0|synthetic-owner";

  it("lets the owner's action read it, bound to the content read, after which the ordinary show works", async () => {
    // Not highly confident besides, so the pass leaves it held for the owner's check.
    const { publications } = await pending((value) => { value.value.confidence = "moderate"; });
    const read: string[] = [];
    const reader = async (texts: ReadonlyArray<{ path: string; text: string }>) => {
      read.push(...texts.map(({ path }) => path));
      return { status: "pass" as const };
    };
    const review = new AtlasDossierReview({ store: publications, now: () => NOW, privacyReader: reader });
    // Without a reader nothing is read and nothing recorded.
    expect((await new AtlasDossierReview({ store: publications, now: () => NOW }).run({ action: "read_dossier_privacy",
      dossier: "D-1001", reviewer: OWNER })).text).toBe("The privacy reading is switched off on this server " +
      "(ASKRIGOR_DOSSIER_PRIVACY_READING), so no reading was made; nothing was changed.");
    // A reading of other content than the copy's own is refused by the store.
    const [copy] = await publications.inspect("D-1001");
    expect(await publications.recordPrivacyReading({ publicNumber: "D-1001", versionNumber: 1,
      contentSha256: "0".repeat(64), reading: { status: "pass" }, at: NOW })).toMatchObject({ outcome: "not_readable" });
    const passed = await review.run({ action: "read_dossier_privacy", dossier: "D-1001", reviewer: OWNER });
    expect(passed.text).toBe("D-1001 version 1: AskRigor's privacy reading passed its public content, exactly as " +
      "stored. It is still held; the privacy reading no longer keeps show_dossier or accept_dossier from showing it.");
    // It read the public content's texts, never an id, a code or the server's stamp.
    expect(read).toContain("findings[1].claim");
    expect(read).toContain("question");
    expect(read.some((path) => /^checked|\.id$|\.read$|^schema|identifiers/u.test(path))).toBe(false);
    expect(passed.dossiers?.items[0]).toMatchObject({ privacyRead: false,
      laterPrivacyReading: { outcome: "passed", on: "2026-11-17" } });
    expect((await publications.inspect("D-1001"))[0]!.payloadSha256).toBe(copy!.payloadSha256);
    expect((await review.run({ action: "list_dossiers" })).text).toContain("held for: waiting for the privacy " +
      "reading, which has since passed it (on 2026-11-17)");
    // Made once: a reading that passed is not made again.
    expect((await review.run({ action: "read_dossier_privacy", dossier: "D-1001", reviewer: OWNER })).ok).toBe(false);
    expect((await review.run({ action: "show_dossier", dossier: "D-1001" })).text)
      .toBe("D-1001 version 1 is now shown, at /atlas/dossiers/D-1001.");
  });

  it("keeps a refusal final for that content, and words it apart from a reader that could not read", async () => {
    const { publications } = await pending();
    const unavailable = new AtlasDossierReview({ store: publications, now: () => NOW,
      privacyReader: async () => ({ status: "unavailable" as const, reason: "daily_budget" as const }) });
    expect((await unavailable.run({ action: "read_dossier_privacy", dossier: "D-1001", reviewer: OWNER })).text)
      .toBe("D-1001 version 1: the privacy reading could not be made just now (the day's money for readings was used " +
        "up). " +
        "That is temporary: it is still held, waiting for the reading, which you can ask for again and the server " +
        "makes when the reader is available.");
    expect((await unavailable.run({ action: "list_dossiers" })).text).toContain("held for: waiting for the privacy " +
      "reading (last tried on 2026-11-17, when it could not be made: the day's money for readings was used up; that " +
      "is temporary)");
    expect((await unavailable.run({ action: "show_dossier", dossier: "D-1001" })).ok).toBe(false);
    const refusing = new AtlasDossierReview({ store: publications, now: () => NOW,
      privacyReader: async () => ({ status: "refuse" as const, reason: "personal_health_story" as const,
        path: "findings[1].claim" }) });
    expect((await refusing.run({ action: "read_dossier_privacy", dossier: "D-1001", reviewer: OWNER })).text)
      .toBe("D-1001 version 1: AskRigor's privacy reading found a personal health story in findings[1].claim. That is " +
        "final for this content: it can't be shown, and it is not read again. It is still held.");
    expect((await refusing.run({ action: "list_dossiers" })).text).toContain("held for: waiting for the privacy " +
      "reading, which has since refused it for good: it found a personal health story in findings[1].claim (on " +
      "2026-11-17)");
    // Final: neither another reading, a pass recorded by hand, the show nor accept puts it up.
    const passing = new AtlasDossierReview({ store: publications, now: () => NOW,
      privacyReader: async () => ({ status: "pass" as const }) });
    expect((await passing.run({ action: "read_dossier_privacy", dossier: "D-1001", reviewer: OWNER })).ok).toBe(false);
    const [copy] = await publications.inspect("D-1001");
    expect(await publications.recordPrivacyReading({ publicNumber: "D-1001", versionNumber: 1,
      contentSha256: copy!.payloadSha256!, reading: { status: "pass" }, at: NOW })).toMatchObject({ outcome: "not_readable" });
    for (const action of ["show_dossier", "accept_dossier"] as const) {
      expect((await passing.run({ action, dossier: "D-1001" })).ok).toBe(false);
    }
    expect(await publications.listShown({ limit: 10 })).toEqual([]);
  });

  it("is made by the server when the reader is available again, and stops while it is not", async () => {
    const { publications } = await pending();
    const { readPendingDossierPrivacy } = await import("../apps/research-mcp/src/atlas/dossier-review.js");
    let calls = 0;
    const budgetGone = async () => { calls += 1; return { status: "unavailable" as const, reason: "daily_budget" as const }; };
    expect(await readPendingDossierPrivacy(publications, budgetGone, { now: () => NOW }))
      .toEqual({ passed: 0, refused: 0, unavailable: 1, shown: 0 });
    expect(calls).toBe(1);
    expect((await publications.privacyPending(10)).map(({ publicNumber }) => publicNumber)).toEqual(["D-1001"]);
    // Held for the reading alone, and nothing shown it could contradict: the pass shows it (Codex's third review).
    expect(await readPendingDossierPrivacy(publications, async () => ({ status: "pass" as const }), { now: () => NOW }))
      .toEqual({ passed: 1, refused: 0, unavailable: 0, shown: 1 });
    expect(await publications.privacyPending(10)).toEqual([]);
    expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1001"]);
  });
});

// Codex's third review, P1: a copy held only for the privacy reading stayed held once the reading passed it. It now
// shows by itself if it otherwise qualifies, after fresh conflict and eligibility checks; never one the owner held or
// took down, nor one refused, withdrawn or ineligible.
describe("a copy held only for the privacy reading, once the reading passes", () => {
  const OWNER = "auth0|synthetic-owner";
  const passing = async () => ({ status: "pass" as const });
  const otherAccount = { account: { mode: "FREE_CONTRIBUTOR" as const, accountKey: OTHER, findingsSave: true,
    noticeVersion: RESEARCH_USE_NOTICE_VERSION } };
  /** Saved while the privacy reading was off, so held for it alone; eligible says whether its account may publish. */
  async function waiting(change: (value: Record<string, any>) => void = () => undefined) {
    const eligibility = { open: true };
    const dossiers = new InMemoryResearchDossierStore();
    const publications = new InMemoryResearchDossierPublications({ dossiers, project: publicDossierOf, sizesComplete,
      eligible: () => eligibility.open });
    const publication = { publisher: publications, noticeCovering: COVERING, conflictReader: NO_CONFLICT };
    const outcome = await saveResearchDossier(dossiers, request({ publication, privacyReading: undefined,
      value: dossier(change) }));
    return { dossiers, publications, publication, eligibility, held: outcome?.disposition?.publication };
  }

  it("shows by itself after fresh conflict and eligibility checks, on the owner's reading or the server's", async () => {
    const owner = await waiting();
    expect(owner.held).toMatchObject({ status: "held", hold_reasons: ["privacy_reading_pending"] });
    const review = new AtlasDossierReview({ store: owner.publications, now: () => NOW, privacyReader: passing,
      conflictReader: NO_CONFLICT });
    expect((await review.run({ action: "read_dossier_privacy", dossier: "D-1001", reviewer: OWNER })).text)
      .toBe("D-1001 version 1: AskRigor's privacy reading passed its public content, exactly as stored. Nothing else " +
        "held it, so it is now shown, at /atlas/dossiers/D-1001, marked \"Not checked by supervisors yet\".");
    expect((await owner.publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber))
      .toEqual(["D-1001"]);
    // The server's own reading does the same, and says how many it showed.
    const server = await waiting();
    const { readPendingDossierPrivacy } = await import("../apps/research-mcp/src/atlas/dossier-review.js");
    expect(await readPendingDossierPrivacy(server.publications, passing, { now: () => NOW, conflictReader: NO_CONFLICT }))
      .toEqual({ passed: 1, refused: 0, unavailable: 0, shown: 1 });
    expect((await server.publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber))
      .toEqual(["D-1001"]);
  });

  it("holds it instead for an important conflict found now, and waits while the comparison can't be made", async () => {
    const { dossiers, publications, publication } = await waiting();
    // Another research's dossier on the same topic, shown meanwhile, with the opposite finding.
    await saveResearchDossier(dossiers, request({ ...otherAccount, publication, value: dossier((value) => {
      value.findings[1] = { ...value.findings[1], kind: "harms",
        claim: "Myo-inositol 2 g a day worsened fasting insulin against placebo over 12 weeks." }; }) }));
    expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1002"]);
    const { readPendingDossierPrivacy } = await import("../apps/research-mcp/src/atlas/dossier-review.js");
    // No comparison could be made: it stays held, waiting, and the server tries again.
    const unavailable = async () => ({ status: "unavailable" as const, reason: "daily_budget" as const });
    expect(await readPendingDossierPrivacy(publications, passing, { now: () => NOW, conflictReader: unavailable }))
      .toEqual({ passed: 1, refused: 0, unavailable: 0, shown: 0 });
    expect((await publications.inspect("D-1001"))[0]).toMatchObject({ state: "held",
      holdReasons: ["privacy_reading_pending"], laterPrivacyReading: { outcome: "passed" } });
    // Compared now, it contradicts the shown dossier on an important finding: held for that, for the owner's review.
    const opposite = async (conflictRequest: any) => ({ status: "read" as const, conflicts: conflictRequest.shown
      .map((shown: any) => ({ finding: "f2", dossier: shown.dossier, theirs: "f2" })) });
    expect(await readPendingDossierPrivacy(publications, passing, { now: () => NOW, conflictReader: opposite }))
      .toEqual({ passed: 0, refused: 0, unavailable: 0, shown: 0 });
    expect((await publications.inspect("D-1001"))[0]).toMatchObject({ state: "held", holdReasons: ["important_conflict"],
      conflictsWith: ["D-1002"] });
    expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1002"]);
    expect((await new AtlasDossierReview({ store: publications, now: () => NOW }).run({ action: "list_dossiers" })).text)
      .toContain("held for: it conflicts with a shown dossier on an important finding, conflicts with D-1002");
  });

  it("never shows by itself one held for anything else, taken down by the owner, refused, withdrawn or ineligible",
    async () => {
      const { readPendingDossierPrivacy } = await import("../apps/research-mcp/src/atlas/dossier-review.js");
      const sweep = async (publications: InMemoryResearchDossierPublications,
        reader: Parameters<typeof readPendingDossierPrivacy>[1] = passing) =>
        await readPendingDossierPrivacy(publications, reader, { now: () => NOW, conflictReader: NO_CONFLICT });
      // Not highly confident besides: the pass leaves it for the owner's check.
      const unsure = await waiting((value) => { value.value.confidence = "moderate"; });
      expect(unsure.held).toMatchObject({ hold_reasons: ["privacy_reading_pending", "not_high_confidence"] });
      expect(await sweep(unsure.publications)).toMatchObject({ passed: 1, shown: 0 });
      // Taken down by the owner while it waited.
      const takenDown = await waiting();
      await new AtlasDossierReview({ store: takenDown.publications, now: () => NOW }).run({
        action: "take_down_dossier", dossier: "D-1001", reason: "the owner's own check" });
      expect((await new AtlasDossierReview({ store: takenDown.publications, now: () => NOW, privacyReader: passing,
        conflictReader: NO_CONFLICT }).run({ action: "read_dossier_privacy", dossier: "D-1001", reviewer: OWNER })).text)
        .toBe("D-1001 version 1: AskRigor's privacy reading passed its public content, exactly as stored. It is still " +
          "taken down; the privacy reading no longer keeps show_dossier or accept_dossier from showing it.");
      // Refused by the reading.
      const refusedCopy = await waiting();
      expect(await sweep(refusedCopy.publications, async () => ({ status: "refuse" as const,
        reason: "personal_health_story" as const }))).toMatchObject({ refused: 1, shown: 0 });
      // Its research withdrawn: its contributor lost access.
      const withdrawn = await waiting();
      withdrawn.dossiers.revoke(ACCOUNT, NOW);
      expect((await withdrawn.publications.inspect("D-1001"))[0]!.state).toBe("taken_down");
      expect(await withdrawn.publications.recordPrivacyReading({ publicNumber: "D-1001", versionNumber: 1,
        contentSha256: (await withdrawn.publications.inspect("D-1001"))[0]!.payloadSha256!, reading: { status: "pass" },
        at: NOW })).toMatchObject({ outcome: "recorded" });
      expect(await sweep(withdrawn.publications)).toMatchObject({ shown: 0 });
      // Its account may no longer publish (saving switched off, or its notice no longer covers public dossiers).
      const ineligible = await waiting();
      ineligible.eligibility.open = false;
      expect(await sweep(ineligible.publications)).toMatchObject({ passed: 1, shown: 0 });
      for (const { publications } of [unsure, takenDown, refusedCopy, withdrawn, ineligible]) {
        expect(await publications.listShown({ limit: 10 })).toEqual([]);
      }
      expect((await ineligible.publications.inspect("D-1001"))[0]).toMatchObject({ state: "held",
        holdReasons: ["privacy_reading_pending"] });
    });
});

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
    return { dossiers, publications, versionId: version!.versionId, stored, honest: publicDossierOf(stored) };
  }
  const claimed = (versionId: string, payload: unknown) => ({ accountKey: ACCOUNT, versionId, payload,
    topicKey: "inositol-invented", relatedTopicKeys: [], payloadSha256: "a".repeat(64), state: "shown", holdReasons: [],
    compared: [], conflictCheck: "read", conflictsWith: [], importantConflict: false, origin: { surface: "/mcp" },
    privacyRead: true, at: NOW }) as never;

  // Codex's re-review of stage 2, P2: the publisher repeats the pages' last check at admission, so no copy is stored as
  // shown that the pages would then leave out (his probe stored one, and its page answered 404).
  it("refuses a copy the pages' last check would leave out, however it reaches the publisher", async () => {
    const { publicCopyPassesPageGuard } = await import("@askrigor/evidence-repository");
    const refused = ["See you\u200Btube.com for the trial.", "As card ARF-\u200B1234 says.", "On YOUTU.BE too.",
      "On youtube-nocoo\u212Aie.com too.", "arf-0001"];
    const passing = ["A YouTube video was not used.", "ARF-123 is not a card.", "youtube dot com", "Kelvin \u212A."];
    for (const text of [...refused, ...passing]) {
      // The store's own check is the pages' check, text for text.
      expect(publicCopyPassesPageGuard({ findings: [{ claim: text }] }), text).toBe(rowPassesPageGuard({ claim: text }));
      expect(rowPassesPageGuard({ claim: text }), text).toBe(passing.includes(text));
    }
    for (const claim of refused) {
      const { dossiers, publications, stored } = await saved();
      const payload = structuredClone(stored);
      payload.findings[0].claim = claim;
      const hex = createHash("sha256").update(`guard:${claim}`).digest("hex");
      const versionId = deterministicUuid(`guard:${claim}`);
      await dossiers.append({ accountKey: ACCOUNT, dossierKey: hex, threadKey: hex, requestKey: hex, inputSha256: hex,
        payload, payloadSha256: hex, cardNumber: null, identifiers: [], expectedPreviousVersionId: null, versionId,
        at: NOW });
      expect(await publications.publish({ accountKey: ACCOUNT, versionId, payload: publicDossierOf(payload) as never,
        compared: [], conflictCheck: "read", conflictsWith: [], importantConflict: false, at: NOW }), claim)
        .toEqual({ outcome: "payload_refused" });
      expect(await publications.listShown({ limit: 10 })).toEqual([]);
    }
  });

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
  // Codex's re-review of stage 2: a topic's every finding is ranked now, so rule 3 runs in one pass; it gives exactly
  // the order the step-by-step moves gave, which this test keeps as its reference.
  it("orders exactly as rule 3's step-by-step moves did, in one pass", () => {
    const IMPORTANCE: Record<string, number> = { decision_changing: 0, important: 1, context: 2 };
    const CERTAINTY: Record<string, number> = { high: 0, moderate: 1, low: 2, very_low: 3 };
    const KNOWN = new Set(["helps", "harms", "no_difference", "mixed"]);
    type Item = Parameters<typeof rankDossierFindings>[0][number];
    const identity = (item: Item) => item.finding.form === undefined || item.finding.population_key === undefined
      ? undefined : JSON.stringify([item.finding.form.trim().toLowerCase(), item.finding.population_key.trim().toLowerCase()]);
    const stepwise = (items: readonly Item[]) => {
      const sorted = [...items].sort((left, right) =>
        IMPORTANCE[left.finding.importance]! - IMPORTANCE[right.finding.importance]! ||
        Number(right.finding.hard_to_find) - Number(left.finding.hard_to_find) ||
        right.evidence.strength - left.evidence.strength ||
        (CERTAINTY[left.finding.certainty] ?? 4) - (CERTAINTY[right.finding.certainty] ?? 4) ||
        Date.parse(right.shownAt) - Date.parse(left.shownAt) || left.publicNumber.localeCompare(right.publicNumber) ||
        left.place - right.place);
      for (let moved = true; moved;) {
        moved = false;
        for (let index = 0; index < sorted.length && !moved; index += 1) {
          const item = sorted[index]!;
          const own = item.finding.kind === "not_known" ? identity(item) : undefined;
          if (own === undefined) continue;
          let last = -1;
          for (let later = index + 1; later < sorted.length; later += 1) {
            if (KNOWN.has(sorted[later]!.finding.kind) && identity(sorted[later]!) === own) last = later;
          }
          if (last > index) {
            sorted.splice(index, 1);
            sorted.splice(last, 0, item);
            moved = true;
          }
        }
      }
      return sorted;
    };
    let seed = 477;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
    for (let round = 0; round < 400; round += 1) {
      const items = Array.from({ length: 1 + Math.floor(random() * 30) }, (_, place): Item => ({
        publicNumber: pick(["D-1001", "D-1002", "D-1003"]), place, shownAt: pick([NOW.toISOString(), "2026-11-16T00:00:00Z"]),
        evidence: { parts: [], strength: pick([0, 2, 6]) },
        finding: { id: `f${place}`, claim: "Invented.", certainty: pick(["high", "low"]), applies_to: "Adults",
          kind: pick(["not_known", "not_known", "helps", "harms", "no_difference", "mixed", "correction"]),
          ...(random() < 0.8 ? { form: pick(["myo", "MYO ", "chiro"]) } : {}),
          ...(random() < 0.8 ? { population_key: pick(["adults", "men"]) } : {}),
          rests_on: ["q1"], what_would_change_it: "A trial.", importance: pick(["decision_changing", "important", "context"]),
          hard_to_find: random() < 0.3 } as never,
      }));
      expect(rankDossierFindings(items)).toEqual(stepwise(items));
    }
  });

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
  async function many(count: number, topicOf: (index: number) => string,
    change: (payload: Record<string, any>) => void = () => undefined) {
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
      change(payload);
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

  // Codex's re-review of stage 2, P1: his probe hid an older decision-changing finding behind twenty background
  // dossiers. The main points at a glance are ranked across every shown dossier on the topic (rule 333a); only the list
  // of dossiers below them comes a page at a time.
  it("ranks the main points at a glance across every shown dossier on the topic, and pages only the list below",
    async () => {
      const { publications } = await many(25, () => "inositol-invented", (payload) => {
        for (const finding of payload.findings) finding.importance = "context";
        payload.value.adds = [];
      });
      const base = await serve(handler(publications));
      const glanceOf = (body: string) => {
        const start = body.indexOf('<ol class="dossier-glance">');
        return body.slice(start, body.indexOf("</ol>", start));
      };
      const first = (await get(base, "/atlas/topics/inositol-invented")).body;
      const second = (await get(base, "/atlas/topics/inositol-invented?page=2")).body;
      for (const body of [first, second]) {
        const glance = glanceOf(body);
        // D-1001, the oldest, holds the decision-changing findings; they lead on every page of the topic.
        expect(glance.indexOf('<li class="dossier-finding dossier-decision_changing">')).toBe(glance.indexOf("<li"));
        expect(glance).toContain("High-dose scyllo-inositol came with more serious infections");
        expect(glance).toContain('From research dossier <a href="/atlas/dossiers/D-1001">D-1001</a>');
        expect(body).toContain("Ranked across all 26 dossiers on this topic.");
      }
      // The list below is what pages: the newest twenty first, D-1001 on the second page.
      const listOf = (body: string) => body.slice(body.indexOf('<ul class="dossier-list">'));
      expect(listOf(first)).not.toContain('href="/atlas/dossiers/D-1001"');
      expect(listOf(second)).toContain('href="/atlas/dossiers/D-1001"');
    }, 60_000);

  // Codex's re-review of stage 2, P1: the topics list read every topic, and the size budget covered only the list of
  // every finding. The list comes a page at a time after a key, never read whole, and the cap covers the whole page.
  it("lists the topics a page at a time after a key, and keeps every whole page within its size", async () => {
    const { publications } = await many(230, (index) => `topic-${String(index).padStart(3, "0")}`);
    const limits: number[] = [];
    const listTopics = publications.listTopics.bind(publications);
    publications.listTopics = async (query?: { after?: string; limit: number }) => {
      limits.push(query?.limit ?? Number.POSITIVE_INFINITY);
      return await listTopics(query as never);
    };
    const base = await serve(handler(publications));
    const first = (await get(base, "/atlas/topics")).body;
    const entries = (body: string) => [...body.matchAll(/<li><a href="\/atlas\/topics\/([a-z0-9._-]+)">/gu)].map(([, key]) => key);
    expect(entries(first)).toHaveLength(200);
    expect(entries(first)[0]).toBe("inositol-invented");
    expect(entries(first).at(-1)).toBe("topic-198");
    expect(first).toContain('<a rel="next" href="/atlas/topics?after=topic-198">More topics</a>');
    const second = (await get(base, "/atlas/topics?after=topic-198")).body;
    expect(entries(second)).toEqual(Array.from({ length: 31 }, (_, index) => `topic-${String(199 + index).padStart(3, "0")}`));
    expect(second).toContain('<a href="/atlas/topics">First topics</a>');
    expect(second).not.toContain("More topics");
    expect((await get(base, "/atlas/topics?after=topic-229")).status).toBe(404);
    expect(Math.max(...limits)).toBeLessThanOrEqual(201);
    // The whole response, not only its list of every finding, stays within the size it is given.
    const { DOSSIER_PAGE_BYTES, fitDossierPage, loadDossierTopic, renderDossierTopicPage } =
      await import("../apps/research-mcp/src/atlas/dossier-pages.js");
    expect(DOSSIER_PAGE_BYTES).toBe(2_000_000);
    const crowded = await many(30, () => "crowded-invented");
    const model = (await loadDossierTopic(crowded.publications, "crowded-invented"))!;
    const unbounded = renderDossierTopicPage(model);
    for (const bytes of [Math.floor(Buffer.byteLength(unbounded, "utf8") / 2), 60_000, 20_000]) {
      const fitted = fitDossierPage((size) => renderDossierTopicPage(model, undefined, size), bytes);
      expect(Buffer.byteLength(fitted, "utf8")).toBeLessThanOrEqual(bytes);
      expect(atlasPageProblems(fitted)).toEqual([]);
      expect(fitted).toContain("Research dossiers: main points at a glance");
    }
  }, 120_000);

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

  // Codex's third review, P1 (reproduced): an older, unaccepted dossier's finding led the glance while the twenty
  // dossiers listed below it were accepted, and the section said "Checked by supervisors" without snippet protection.
  it("takes its badge and snippet protection from every dossier a section draws on, the glance's included", async () => {
    const { publications } = await many(24, () => "inositol-invented", (payload) => {
      for (const finding of payload.findings) finding.importance = "context";
      payload.value.adds = [];
    });
    const later = new Date(NOW.getTime() + 3_600_000);
    for (let number = 1002; number <= 1025; number += 1) {
      expect((await publications.decide({ publicNumber: `D-${number}`, versionNumber: 1, decision: "accept",
        reason: null, at: later })).outcome).toBe("decided");
    }
    const { dossierTopicSection, loadDossierTopic } = await import("../apps/research-mcp/src/atlas/dossier-pages.js");
    const model = (await loadDossierTopic(publications, "inositol-invented"))!;
    // The twenty listed are accepted; D-1001, unaccepted, leads the glance with its decision-changing findings.
    expect(model.dossiers.every(({ copy }) => copy.accepted)).toBe(true);
    expect(model.glance[0]).toMatchObject({ publicNumber: "D-1001", accepted: false });
    for (const size of [{}, { compact: true }]) {
      const section = dossierTopicSection(model, size).value;
      expect(section).toMatch(/^<section class="dossier-section" aria-labelledby="dossiers-heading" data-nosnippet>/u);
      expect(section).toContain(`<p class="badge badge-unreviewed">${"Not checked by supervisors yet"}</p>`);
      expect(section).not.toContain('<p class="badge badge-checked">Checked by supervisors</p>');
    }
    // Compact, each line still says whose it is and whether supervisors checked it.
    expect(dossierTopicSection(model, { compact: true }).value).toContain('<a href="/atlas/dossiers/D-1001">D-1001</a>, ' +
      "not checked by supervisors yet");
  }, 60_000);

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

  // Codex's re-review of stage 2, P1: once the save's outer deadline has passed, no comparison is started and the copy
  // is held, waiting for the conflict check.
  it("holds a copy waiting for the conflict check once the save's outer deadline has passed", async () => {
    const { deadlineConflictReader } = await import("../apps/research-mcp/src/findings/dossier-conflict-reading.js");
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication }));
    let calls = 0;
    const outcome = await saveResearchDossier(dossiers, request({ ...other, value: dossier((value) => {
      value.question = "Which inositol forms were measured for fasting insulin, again?"; }),
      publication: { publisher: publications, noticeCovering: COVERING,
        conflictReader: deadlineConflictReader(async () => { calls += 1;
          return { status: "reply" as const, reply: { conflicts: [] } }; }, NOW.getTime() - 1, () => NOW.getTime()) } }));
    expect(outcome?.disposition?.publication).toEqual({ status: "held", public_id: "D-1002",
      hold_reasons: ["conflict_check_pending"] });
    expect(calls).toBe(0);
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

// Codex's third review, P1 (his reversed probe): a copy held while nothing was shown, then an opposite one shown at once
// beside it, and the owner's show put up both though neither was compared with the other. An owner's action that shows
// a copy now compares it first with the shown dossiers, under the topic locks; an important conflict shows nothing
// until he repeats the action with an override naming the dossier, recorded with who and when.
describe("the owner's show, compared first with the shown dossiers", () => {
  const OWNER = "auth0|synthetic-owner";
  const otherAccount = { account: { mode: "FREE_CONTRIBUTOR" as const, accountKey: OTHER, findingsSave: true,
    noticeVersion: RESEARCH_USE_NOTICE_VERSION } };
  /** Codex's held copy: not highly confident, its myo-inositol finding a harm on the outcome the other's helps. */
  const worsened = dossier((value) => {
    value.value.confidence = "moderate";
    value.findings[1] = { ...value.findings[1], kind: "harms",
      claim: "Myo-inositol 2 g a day worsened fasting insulin against placebo over 12 weeks." };
  });
  /** A fake of AskRigor's conflict reading that pairs each shown dossier's f2 with this one's f2; no model is called. */
  function pairing() {
    const asked: any[] = [];
    return { asked, reader: async (conflictRequest: any) => {
      asked.push(conflictRequest);
      return { status: "read" as const, conflicts: conflictRequest.shown.map((shown: any) => ({ finding: "f2",
        dossier: shown.dossier, theirs: "f2" })) };
    } };
  }

  it("reproduces Codex's reversed probe: the held copy shows only on a recorded override, and the pages list it",
    async () => {
      const { dossiers, publications, publication } = stores();
      expect((await saveResearchDossier(dossiers, request({ publication, value: worsened })))?.disposition?.publication)
        .toMatchObject({ status: "held", public_id: "D-1001", hold_reasons: ["not_high_confidence"] });
      // The opposite finding is shown at once: the held copy was no candidate for its check.
      expect((await saveResearchDossier(dossiers, request({ ...otherAccount, publication })))?.disposition?.publication)
        .toMatchObject({ status: "shown", public_id: "D-1002" });
      // Codex's own call, a show made without comparing it with the shown dossiers, is refused by the store.
      expect(await publications.decide({ publicNumber: "D-1001", versionNumber: 1, decision: "show", reason: null,
        at: NOW })).toEqual({ outcome: "comparison_stale" });
      const { asked, reader } = pairing();
      const review = new AtlasDossierReview({ store: publications, now: () => NOW, conflictReader: reader });
      const refused = await review.run({ action: "show_dossier", dossier: "D-1001", reviewer: OWNER });
      expect(refused.ok).toBe(false);
      expect(refused.text).toBe("D-1001 version 1 was not shown: AskRigor's conflict check found that it contradicts " +
        "a shown dossier on an important finding. Its finding f2, “Myo-inositol 2 g a day worsened fasting insulin " +
        "against placebo over 12 weeks.”, contradicts D-1002's finding f2, “Myo-inositol 2 g a day improved fasting " +
        "insulin against placebo over 12 weeks.” To show it anyway, beside it, repeat show_dossier with " +
        "later_inputs.dossierOverrideConflicts [\"D-1002\"]; your override is recorded with who made it and when, and " +
        "the pages then list the disagreement. Nothing was changed.");
      expect(asked[0].shown.map(({ dossier: number }: any) => number)).toEqual(["D-1002"]);
      expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1002"]);
      // An override that does not name the dossier it contradicts changes nothing either.
      expect((await review.run({ action: "show_dossier", dossier: "D-1001", reviewer: OWNER,
        dossierOverrideConflicts: ["D-1009"] })).ok).toBe(false);
      expect((await review.run({ action: "show_dossier", dossier: "D-1001",
        dossierOverrideConflicts: ["D-1002"] })).ok).toBe(false);
      expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1002"]);
      const shown = await review.run({ action: "show_dossier", dossier: "D-1001", reviewer: OWNER,
        dossierOverrideConflicts: ["D-1002"] });
      expect(shown.text).toBe("D-1001 version 1 is now shown, at /atlas/dossiers/D-1001, on your override: it " +
        "contradicts D-1002 on an important finding, and the pages list the disagreement.");
      expect(shown.dossiers?.items[0]).toMatchObject({ state: "shown", conflictsWith: ["D-1002"],
        conflictOverride: { by: expect.stringMatching(/^reviewer:[0-9a-f]{16}$/u), on: "2026-11-17" } });
      expect(JSON.stringify(shown)).not.toContain(OWNER);
      expect((await review.run({ action: "inspect_dossier", dossier: "D-1001" })).text).toContain("shown on your " +
        "override on 2026-11-17 though it contradicts D-1002");
      // The pages list the disagreement: on the topic and on each dossier's own page.
      const { dossierTopicSection, loadDossierPage, loadDossierTopic } =
        await import("../apps/research-mcp/src/atlas/dossier-pages.js");
      const section = dossierTopicSection((await loadDossierTopic(publications, "inositol-invented"))!).value;
      expect(section).toContain("<h3>Where dossiers disagree</h3>");
      expect(section).toContain("AskRigor’s conflict check read these findings as contradicting each other.");
      expect(section).toMatch(/worsened fasting insulin[^<]*” \(<a href="\/atlas\/dossiers\/D-1001">D-1001<\/a>\) and “Myo-inositol 2 g a day improved/u);
      for (const number of ["D-1001", "D-1002"]) {
        expect((await loadDossierPage(publications, number))!.disagreements).toEqual([expect.objectContaining({
          found: "check", form: "myo-inositol" })]);
      }
    });

  // Codex's third review, P1: a section's badge and snippet protection come from every dossier it draws on. A checked
  // dossier's own page quotes the unchecked one it disagrees with, marked so and kept out of snippets.
  it("marks an unchecked dossier's claim on a checked dossier's page, and keeps it out of snippets", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication, value: worsened }));
    await saveResearchDossier(dossiers, request({ ...otherAccount, publication }));
    const review = new AtlasDossierReview({ store: publications, now: () => NOW, conflictReader: pairing().reader });
    expect((await review.run({ action: "show_dossier", dossier: "D-1001", reviewer: OWNER,
      dossierOverrideConflicts: ["D-1002"] })).ok).toBe(true);
    expect((await review.run({ action: "accept_dossier", dossier: "D-1002" })).ok).toBe(true);
    const { loadDossierPage, renderDossierPage } = await import("../apps/research-mcp/src/atlas/dossier-pages.js");
    const checked = renderDossierPage((await loadDossierPage(publications, "D-1002"))!);
    expect(checked).toContain('<p class="badge badge-checked">Checked by supervisors</p>');
    expect(checked).toMatch(/<ul class="dossier-conflicts" data-nosnippet><li>myo-inositol: “Myo-inositol 2 g a day worsened[^<]*” \(<a href="\/atlas\/dossiers\/D-1001">D-1001<\/a>, not checked by supervisors yet\) and “Myo-inositol 2 g a day improved[^<]*” \(<a href="\/atlas\/dossiers\/D-1002">D-1002<\/a>\)<\/li>/u);
  });

  it("asks for an override when the comparison can't be made, and shows only what nothing contradicts", async () => {
    const { dossiers, publications, publication } = stores();
    await saveResearchDossier(dossiers, request({ publication, value: worsened }));
    await saveResearchDossier(dossiers, request({ ...otherAccount, publication }));
    // With the conflict reading off on this server, nothing is shown without the owner's override.
    const off = new AtlasDossierReview({ store: publications, now: () => NOW });
    expect((await off.run({ action: "accept_dossier", dossier: "D-1001", reviewer: OWNER })).text).toBe("D-1001 " +
      "version 1 was not shown: AskRigor's conflict check could not compare it with the shown dossier it could " +
      "contradict (D-1002) just now: the conflict check is switched off on this server. To show it without that " +
      "comparison, repeat accept_dossier with later_inputs.dossierOverrideConflicts [\"D-1002\"]; your override is " +
      "recorded with who made it and when. Nothing was changed.");
    expect((await publications.listShown({ limit: 10 })).map(({ publicNumber }) => publicNumber)).toEqual(["D-1002"]);
    expect((await off.run({ action: "accept_dossier", dossier: "D-1001", reviewer: OWNER,
      dossierOverrideConflicts: ["D-1002"] })).text).toBe("D-1001 version 1 is now shown, checked by supervisors, at " +
      "/atlas/dossiers/D-1001, on your override, without a conflict comparison with D-1002.");
    // A copy the check finds nothing against shows as before, and needs no override.
    const quiet = stores();
    await saveResearchDossier(quiet.dossiers, request({ publication: quiet.publication, value: worsened }));
    await saveResearchDossier(quiet.dossiers, request({ ...otherAccount, publication: quiet.publication }));
    const none = new AtlasDossierReview({ store: quiet.publications, now: () => NOW,
      conflictReader: async () => ({ status: "read" as const, conflicts: [] }) });
    expect((await none.run({ action: "show_dossier", dossier: "D-1001" })).text)
      .toBe("D-1001 version 1 is now shown, at /atlas/dossiers/D-1001.");
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
      "research_dossier_topic_names", "research_dossier_public_passes_page_guard", "research_dossier_show_check_invalid",
      "research_dossier_conflict_partners"];
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
