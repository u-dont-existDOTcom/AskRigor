import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasReviewStore,
  InMemoryResearchContributorAccessStore,
  InMemoryResearchDossierStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  deterministicUuid,
  sha256,
  type ResearchDossierStore,
} from "@askrigor/evidence-repository";

import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import {
  RESEARCH_DOSSIER_SHAPE,
  checkResearchDossier,
  researchDossierDigest,
  researchDossierFromCall,
  researchDossierInputSchema,
  researchDossierKey,
  researchDossierLine,
  saveResearchDossier,
  type ResearchDossierSaveRequest,
} from "../apps/research-mcp/src/findings/dossier.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService, findingsThreadKey } from "../apps/research-mcp/src/findings/service.js";
import { findingsCardDigest, findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import { AtlasSourceCheckCache } from "../apps/research-mcp/src/findings/source-checks.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  createResearchContributionReviewHandler,
  researchContributionReviewOutputSchema,
} from "../apps/research-mcp/src/research-contribution-review-tool.js";
import {
  FINAL_CHECK_BLOCKING_RULES,
  finalizeResearchInputSchema,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  researchTargetDigest,
} from "../apps/research-mcp/src/research-receipts.js";
import { VELMOR_CARD } from "./helpers/atlas-scenario.js";
import { communitySkipCaveat } from "./helpers/community-skip.js";
import { FakeGitHub } from "./helpers/fake-github-findings.js";
import { CARD } from "./helpers/findings-fixtures.js";
import { withSourceReading } from "./helpers/source-reading.js";

// AskRigor#477 stage 1 (owner answer 329a, 16 Nov 2026): a free contributor's research dossier, saved privately for
// the owner's review. Every study, form and figure here is invented; the identifiers are synthetic.

const SECRET = "research-dossier-test-secret-0123456789abcdef";
const NOW = new Date("2026-11-16T15:00:00.000Z");
const TARGET = "Inositol forms for mood, hormones and metabolic outcomes";
const TARGET_DIGEST = researchTargetDigest(TARGET);
const ANSWER = "The checked answer the person saw.";
const ANSWER_DIGEST = createHash("sha256").update(ANSWER, "utf8").digest("hex");
const ACCOUNT = "a".repeat(64);

const receipt = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, string | number | string[]>) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now: () => NOW });
const finalization = (claims: Record<string, string | number | string[]> = {}) =>
  receipt("finalization", { status: "ready", target: TARGET_DIGEST, answer: ANSWER_DIGEST, ...claims });

const RECEIPTS = [
  receipt("pubmed_record", { pmid: "11111111", doi: "10.1000/myo.trial", abs: "1" }),
  receipt("study_audit", { id: "PMC2222222", doi: "10.1000/dci.pilot", pmid: "22222222", status: "validated" }),
  receipt("pubmed_record", { pmid: "33333333", abs: "1" }),
  receipt("pubmed_record", { pmid: "44444444", abs: "1" }),
  receipt("pubmed_record", { pmid: "55555555", abs: "1" }),
  receipt("literature_search", {
    src: "pubmed", q: discoveryQueryDigest(["inositol randomized trial"]), ret: 20, n: 140,
    ids: ["11111111", "33333333", "55555555", "66666666"],
  }),
  receipt("literature_search", {
    src: "europepmc", q: discoveryQueryDigest(["d-chiro-inositol testosterone"]), ret: 5, n: 5, ids: ["PMC2222222"],
  }),
];

/**
 * The issue's complex topic: one unusual research lead (D-chiro-inositol and testosterone), four known studies, two
 * harms (scyllo-inositol infections, IP6 and minerals) and one negative trial, across four forms kept apart.
 */
function complexDossier(): Record<string, any> {
  return {
    scope: "public",
    value: {
      saves_work: "substantial",
      quick_answer: "Inositol may help some metabolic measures; ask a doctor.",
      adds: ["f1", "f3"],
      reason: "It compares four forms, their trials, two harms and a negative trial that one answer leaves out.",
    },
    question: "What do the different forms of inositol do, and what are their risks?",
    topic: { key: "inositol", name: "Inositol", other_names: ["IP6", "phytic acid"] },
    forms: ["myo-inositol", "D-chiro-inositol", "scyllo-inositol", "IP6"],
    searches: [
      { id: "q1", database: "pubmed", query: "inositol randomized trial" },
      { id: "q2", database: "europepmc", query: "d-chiro-inositol testosterone" },
    ],
    studies: [
      { id: "s1", identifiers: ["PMID 11111111"], kind: "human_trial", form: "myo-inositol", dose: "2 g a day",
        population: "Adults with a metabolic syndrome", comparator: "placebo", decision: "used" },
      { id: "s2", identifiers: ["10.1000/dci.pilot"], kind: "human_trial", form: "D-chiro-inositol",
        population: "Ten healthy men", design: "Uncontrolled pilot", decision: "used" },
      { id: "s3", identifiers: ["33333333"], kind: "human_trial", form: "scyllo-inositol", population: "Adults with a memory disorder",
        comparator: "placebo", decision: "used" },
      { id: "s4", identifiers: ["44444444"], kind: "human_trial", form: "IP6", population: "Adults eating a high-phytate diet",
        decision: "used" },
      { id: "s5", identifiers: ["55555555"], kind: "human_trial", form: "myo-inositol", population: "Adults with low mood",
        comparator: "placebo", decision: "used" },
      { id: "s6", identifiers: ["66666666"], kind: "animal", decision: "set_aside",
        decision_reason: "Found in the search and not read; an animal study." },
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
      { id: "r5", study: "s5", outcome: "Low mood improved", comparator: "placebo", follow_up: "6 weeks",
        direction: "no_difference", certainty: "low", provenance: "reported",
        figure: { kind: "counts", option_events: 12, option_total: 40, comparator_events: 12, comparator_total: 40 } },
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
      { id: "f5", claim: "Myo-inositol did not improve low mood more than placebo in one six-week trial.",
        certainty: "low", kind: "no_difference", applies_to: "Adults with low mood", form: "myo-inositol",
        rests_on: ["r5"], what_would_change_it: "A larger trial", importance: "important" },
      { id: "f6", claim: "Whether scyllo-inositol helps mood is not known: the search found no trial of it.",
        certainty: "low", kind: "not_known", applies_to: "Adults with low mood", form: "scyllo-inositol",
        rests_on: ["q1"], what_would_change_it: "Any trial of it for mood", importance: "context" },
    ],
    coverage: {
      benefits: { status: "entries" },
      harms: { status: "entries" },
      null_results: { status: "entries" },
      conflicts: { status: "not_researched", reason: "No two studies measured the same outcome the same way." },
      mainstream_options: { status: "entries" },
      people_reports: { status: "none_found", search: "q1" },
    },
    open_trails: ["Controlled trials of D-chiro-inositol in men"],
  };
}

let versionSequence = 0;
function request(overrides: Partial<ResearchDossierSaveRequest> = {}): ResearchDossierSaveRequest {
  return {
    dossier: { given: true, value: complexDossier() },
    account: { mode: "FREE_CONTRIBUTOR", accountKey: ACCOUNT, findingsSave: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION },
    callSavingOff: false,
    finalizationReceipt: finalization(),
    shortLookup: false,
    validatedSources: 5,
    receipts: RECEIPTS,
    atlasReuse: [],
    cardId: "ARF-0042",
    secret: SECRET,
    versions: { askrigor: "0.1.0", build: "0123abc", hrp: "20.6.42", universal: "20.5.46" },
    now: () => NOW,
    newVersionId: () => deterministicUuid(`research-dossier-test:${versionSequence++}`),
    ...overrides,
  };
}

const withDossier = (change: (dossier: Record<string, any>) => void) => {
  const dossier = complexDossier();
  change(dossier);
  return request({ dossier: { given: true, value: dossier } });
};

describe("a research dossier's record and its checks", () => {
  it("saves the complex topic whole, privately, and reads back exactly the version it wrote", async () => {
    const store = new InMemoryResearchDossierStore();
    const outcome = await saveResearchDossier(store, request());
    expect(outcome).toEqual({ disposition: {
      status: "saved", dossier_id: "ARD-0001", version: 1, visibility: "private_review",
      digest: expect.stringMatching(/^[a-f0-9]{16}$/u),
    } });
    const [version] = store.snapshot();
    expect(version).toMatchObject({ dossierNumber: "ARD-0001", versionNumber: 1, erased: false, events: ["submitted"],
      cardNumber: 42 });
    const read = await store.readVersion(ACCOUNT, version!.versionId);
    expect(researchDossierDigest(read!.payload)).toBe(read!.payloadSha256);
    expect(read!.payloadSha256!.slice(0, 16)).toBe(outcome!.disposition.digest);
    const payload = read!.payload as Record<string, any>;
    // The server's part: how each study was read, from this call's receipts; a PubMed record's aliases join a study.
    expect(payload.studies.map(({ id, read: depth }: { id: string; read: string }) => [id, depth])).toEqual([
      ["s1", "abstract"], ["s2", "full_text_audited"], ["s3", "abstract"], ["s4", "abstract"], ["s5", "abstract"],
      ["s6", "found_in_search"]]);
    expect(payload.studies[1].identifiers).toEqual([{ scheme: "doi", value: "10.1000/dci.pilot" },
      { scheme: "pmcid", value: "PMC2222222" }, { scheme: "pmid", value: "22222222" }]);
    expect(payload.searches.map(({ records_found }: { records_found: number }) => records_found)).toEqual([140, 5]);
    expect(payload.value).toMatchObject({ saves_work: "substantial", judged_by: "researching_ai" });
    expect(payload.stamp).toMatchObject({ card_number: 42, finalized_at: NOW.toISOString(), receipts_checked: 7,
      not_checked: ["papers_support_claims", "figures_match_papers", "value_judgement"] });
    // The stored dossier holds none of the answer, the person's words or anything outside the twelve parts.
    expect(Object.keys(payload).sort()).toEqual(["coverage", "findings", "forms", "open_trails", "question", "results",
      "schema", "searches", "stamp", "studies", "topic", "value"]);
    expect(JSON.stringify(payload)).not.toContain(ANSWER);
    expect(researchDossierLine(outcome!.disposition)).toBe("Research dossier ARD-0001 was saved privately for " +
      "AskRigor's owner to review (version 1); it is not public.");
  });

  it("says not_sent when research that did work a quick answer cannot do sends none, and nothing after a short lookup", async () => {
    const store = new InMemoryResearchDossierStore();
    const missing = await saveResearchDossier(store, request({ dossier: { given: false } }));
    expect(missing?.disposition).toEqual({ status: "not_sent" });
    expect(missing?.note).toContain(RESEARCH_DOSSIER_SHAPE);
    expect(researchDossierLine(missing!.disposition)).toBe("No research dossier was saved: none was sent.");
    expect(await saveResearchDossier(store, request({ dossier: { given: false }, shortLookup: true }))).toBeUndefined();
    expect(await saveResearchDossier(store, request({ dossier: { given: false }, validatedSources: 0 }))).toBeUndefined();
    expect(store.snapshot()).toEqual([]);
  });

  it("refuses on value, scope, consent and an unpassed check, storing nothing", async () => {
    const store = new InMemoryResearchDossierStore();
    const some = await saveResearchDossier(store, request({ dossier: { given: true,
      value: { scope: "public", value: { saves_work: "some", reason: "Little beyond one answer." } } } }));
    expect(some?.disposition).toMatchObject({ status: "insufficient", reason: "value_not_substantial" });
    expect(researchDossierLine(some!.disposition)).toBe(
      "No research dossier was saved: this research was judged not to save a reader substantial work.");
    const personal = await saveResearchDossier(store, request({ dossier: { given: true,
      value: { ...complexDossier(), scope: "personal_only" } } }));
    expect(personal?.disposition).toEqual({ status: "private", reason: "personal_only" });
    const account = request().account!;
    for (const [overrides, reason] of [
      [{ account: { ...account, mode: "PAID_PRIVATE" as const, noticeVersion: null } }, "paid_private"],
      [{ account: { ...account, findingsSave: false } }, "saving_off"],
      [{ callSavingOff: true }, "call_saving_off"],
      [{ finalizationReceipt: finalization({ fs: "off" }) }, "call_saving_off"],
      [{ account: { ...account, noticeVersion: "free-contributor-v5-2026-11-05" } }, "notice_not_current"],
    ] as const) {
      expect((await saveResearchDossier(store, request(overrides)))?.disposition).toEqual({ status: "consent_blocked", reason });
    }
    expect((await saveResearchDossier(store, request({ account: undefined })))?.disposition)
      .toEqual({ status: "private", reason: "no_research_account" });
    expect((await saveResearchDossier(store, request({ finalizationReceipt: undefined })))?.disposition)
      .toEqual({ status: "insufficient", reason: "final_check_not_passed" });
    // A receipt signed with another secret is no passing check.
    const forged = issueResearchReceipt("finalization", { status: "ready", target: TARGET_DIGEST, answer: ANSWER_DIGEST },
      { secret: "another-secret-0123456789-0123456789-xyz", now: () => NOW });
    expect((await saveResearchDossier(store, request({ finalizationReceipt: forged })))?.disposition)
      .toEqual({ status: "insufficient", reason: "final_check_not_passed" });
    // Nothing is said of a dossier that never came, on consent grounds.
    expect(await saveResearchDossier(store, request({ dossier: { given: false }, callSavingOff: true }))).toBeUndefined();
    expect(store.snapshot()).toEqual([]);
  });

  it("checks receipt binding, searches, arithmetic, references, forms and coverage, naming paths and rules, never values", () => {
    const check = (change: (dossier: Record<string, any>) => void, receipts = RECEIPTS) => {
      const dossier = complexDossier();
      change(dossier);
      return checkResearchDossier(researchDossierInputSchema.parse(dossier), {
        receipts: receipts.map((token) => {
          const [, kind, encoded] = token.split("~");
          return { kind: kind!, claims: Object.fromEntries(encoded!.split(",").map((pair) => {
            const [key, value] = pair.split("=");
            const decoded = decodeURIComponent(value!);
            return [key!, key === "ids" ? decoded.split("+").map(decodeURIComponent) : decoded];
          })) };
        }),
        atlasSources: new Set(),
      }).problems;
    };
    expect(check(() => undefined)).toEqual([]);
    // A result and a conclusion resting on a study no receipt read here.
    expect(check((dossier) => { dossier.studies[0].identifiers = ["PMID 99999999"]; })).toEqual([
      { path: "results[0].study", rule: "result_study_not_read" },
      { path: "findings[1]", rule: "finding_without_backing" },
    ]);
    // A search this call did not run as declared.
    // (The coverage entry that names it is refused with it: the whole dossier is.)
    expect(check((dossier) => { dossier.searches[0].query = "inositol trial"; })).toEqual([
      { path: "searches[0]", rule: "search_not_in_receipts" },
      { path: "findings[5]", rule: "finding_without_backing" },
    ]);
    // Counts beyond a total, a number needed to treat that the counts don't give, and a calculation that doesn't add up.
    expect(check((dossier) => {
      dossier.results[0].figure.option_events = 51;
      dossier.results[2].figure.nnh = 12;
      dossier.results[1].calculation.from = [6.2, 5];
    })).toEqual([
      { path: "results[0].figure.option_events", rule: "counts_exceed_total" },
      { path: "results[0].figure.nnt", rule: "nnt_mismatch" },
      { path: "results[1].calculation", rule: "calculation_mismatch" },
      { path: "results[2].figure.nnh", rule: "nnh_mismatch" },
    ]);
    expect(check((dossier) => { dossier.results[4].figure.nnt = 3; })).toEqual([
      { path: "results[4].figure.nnt", rule: "no_difference_no_nnt" }]);
    expect(check((dossier) => { delete dossier.results[3].provenance; delete dossier.results[1].calculation; })).toEqual([
      { path: "results[1].calculation", rule: "calculation_missing" },
      { path: "results[3].provenance", rule: "provenance_missing" },
    ]);
    // Forms stay apart: a myo-inositol conclusion may not rest on a D-chiro-inositol result, and every form is listed.
    expect(check((dossier) => { dossier.findings[1].rests_on = ["r1", "r2"]; dossier.studies[3].form = "phytate"; })).toEqual([
      { path: "studies[3].form", rule: "form_not_listed" },
      { path: "findings[1].rests_on[1]", rule: "form_mismatch" },
      // The IP6 conclusion now rests on a study whose form reads otherwise.
      { path: "findings[3].rests_on[0]", rule: "form_mismatch" },
    ]);
    // References, ids, a set-aside study's reason and the coverage's own rules.
    expect(check((dossier) => {
      dossier.findings[0].rests_on = ["r9"];
      dossier.value.adds = ["f9"];
      dossier.results[0].id = "s1";
      delete dossier.studies[5].decision_reason;
      dossier.coverage.conflicts = { status: "not_researched" };
      dossier.coverage.people_reports = { status: "entries" };
    })).toEqual([
      { path: "results[0].id", rule: "duplicate_id" },
      { path: "studies[5].decision_reason", rule: "set_aside_reason_missing" },
      { path: "findings[0].rests_on[0]", rule: "unknown_reference" },
      { path: "findings[0]", rule: "finding_without_backing" },
      { path: "findings[1].rests_on[0]", rule: "unknown_reference" },
      { path: "findings[1]", rule: "finding_without_backing" },
      { path: "coverage.conflicts.reason", rule: "coverage_reason_missing" },
      { path: "coverage.people_reports", rule: "coverage_community_missing" },
      { path: "value.adds[0]", rule: "unknown_reference" },
    ]);
    // The dossier's privacy screen (the findings card's first), and no YouTube address.
    expect(check((dossier) => {
      dossier.findings[0].applies_to = "I was diagnosed with diabetes last year";
      dossier.open_trails = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"];
    })).toEqual([
      { path: "findings[0].applies_to", rule: "personal_narrative" },
      { path: "open_trails[0]", rule: "youtube_reference" },
    ]);
  });

  it("stores nothing of a long uncited dossier, or of one whose harm fails, and lists every problem", async () => {
    const store = new InMemoryResearchDossierStore();
    const uncited = complexDossier();
    uncited.studies = Array.from({ length: 30 }, (_, index) => ({ id: `u${index}`, identifiers: [`PMID ${90000000 + index}`],
      kind: "human_trial", decision: "used" }));
    uncited.results = uncited.studies.map(({ id }: { id: string }, index: number) => ({ id: `ur${index}`, study: id,
      outcome: "An outcome it reports at length", direction: "benefit", certainty: "high" }));
    uncited.findings = uncited.results.map(({ id }: { id: string }, index: number) => ({ id: `uf${index}`,
      claim: "A long claim with nothing behind it ".repeat(10).trim(), certainty: "high", kind: "helps",
      applies_to: "Everyone", rests_on: [id], what_would_change_it: "Nothing", importance: "decision_changing" }));
    uncited.value.adds = [];
    uncited.coverage.people_reports = { status: "not_researched", reason: "None looked for." };
    uncited.searches = [];
    const refused = await saveResearchDossier(store, request({ dossier: { given: true, value: uncited } }));
    expect(refused?.disposition.status).toBe("insufficient");
    expect(refused?.disposition.problems?.length).toBe(50);
    expect(refused?.disposition.problems?.[0]).toEqual({ path: "results[0].study", rule: "result_study_not_read" });
    expect(refused?.note).toContain("nothing of it was stored");
    // One harm resting on a study not read here stops the whole save: no one-sided record with its benefits only.
    const harm = await saveResearchDossier(store, withDossier((dossier) => { dossier.studies[2].identifiers = ["77777777"]; }));
    expect(harm?.disposition).toMatchObject({ status: "insufficient", problems: [
      { path: "results[2].study", rule: "result_study_not_read" }, { path: "findings[2]", rule: "finding_without_backing" }] });
    // A shape that doesn't parse names paths only.
    const shape = await saveResearchDossier(store, withDossier((dossier) => { dossier.findings[0].kind = "miracle"; }));
    expect(shape?.disposition).toMatchObject({ status: "insufficient", problems: [{ path: "findings[0].kind", rule: "shape" }] });
    expect(JSON.stringify(shape)).not.toContain("miracle");
    expect(store.snapshot()).toEqual([]);
  });

  it("replays a retry as its original version, appends new content, and never forks under concurrent saves", async () => {
    const store = new InMemoryResearchDossierStore();
    const first = await saveResearchDossier(store, request());
    expect(first?.disposition).toMatchObject({ status: "saved", dossier_id: "ARD-0001", version: 1 });
    // The same request again: its version, nothing written.
    expect((await saveResearchDossier(store, request()))?.disposition)
      .toMatchObject({ status: "duplicate", dossier_id: "ARD-0001", version: 1 });
    // New content for the same question appends version 2; the first request, retried late, still returns version 1.
    const second = await saveResearchDossier(store, withDossier((dossier) => { dossier.open_trails = ["Another trail"]; }));
    expect(second?.disposition).toMatchObject({ status: "saved", dossier_id: "ARD-0001", version: 2 });
    expect((await saveResearchDossier(store, request()))?.disposition)
      .toMatchObject({ status: "duplicate", dossier_id: "ARD-0001", version: 1 });
    // Another question on the same research target is its own dossier.
    const other = await saveResearchDossier(store, withDossier((dossier) => { dossier.question = "Is IP6 safe?"; }));
    expect(other?.disposition).toMatchObject({ status: "saved", dossier_id: "ARD-0002", version: 1 });
    // Two saves of one question at once: versions 3 and 4 of ARD-0001, one written alongside the other.
    const [left, right] = await Promise.all([
      saveResearchDossier(store, withDossier((dossier) => { dossier.open_trails = ["Left"]; })),
      saveResearchDossier(store, withDossier((dossier) => { dossier.open_trails = ["Right"]; })),
    ]);
    expect([left?.disposition.version, right?.disposition.version].sort()).toEqual([3, 4]);
    const versions = store.snapshot().filter(({ dossierNumber }) => dossierNumber === "ARD-0001");
    expect(versions.map(({ versionNumber }) => versionNumber)).toEqual([1, 2, 3, 4]);
    expect(versions.filter(({ writtenAlongside }) => writtenAlongside)).toHaveLength(1);
  });

  it("confirms only a version read back with its digest, and keeps the account's own versions to it", async () => {
    const inner = new InMemoryResearchDossierStore();
    const tampered: ResearchDossierStore = {
      latestVersion: (account, key) => inner.latestVersion(account, key),
      append: (input) => inner.append(input),
      readVersion: async (account, id) => {
        const read = await inner.readVersion(account, id);
        return read === null ? null : { ...read, payload: { ...read.payload, question: "Changed in storage" } };
      },
    };
    expect((await saveResearchDossier(tampered, request()))?.disposition)
      .toEqual({ status: "unconfirmed", reason: "readback_mismatch" });
    const [version] = inner.snapshot();
    expect(await inner.readVersion("b".repeat(64), version!.versionId)).toBeNull();
    const refusing = new InMemoryResearchDossierStore({ eligible: () => false });
    expect((await saveResearchDossier(refusing, request()))?.disposition)
      .toEqual({ status: "consent_blocked", reason: "account_not_eligible" });
    // A store that fails before anything is written leaves nothing behind: unavailable, said in the answer.
    const failing: ResearchDossierStore = { ...tampered, latestVersion: async () => { throw new Error("down"); } };
    expect((await saveResearchDossier(failing, request()))?.disposition)
      .toEqual({ status: "unavailable", reason: "store_unavailable" });
  });

  it("withdraws pending versions on revocation and erases only the forgotten thread's dossiers, leaving no content", async () => {
    const store = new InMemoryResearchDossierStore();
    await saveResearchDossier(store, request());
    await saveResearchDossier(store, withDossier((dossier) => { dossier.open_trails = ["Second"]; }));
    const otherAccount = "c".repeat(64);
    await saveResearchDossier(store, request({ account: { ...request().account!, accountKey: otherAccount } }));
    expect(store.revoke(ACCOUNT, NOW)).toBe(2);
    expect(store.revoke(ACCOUNT, NOW)).toBe(0);
    // forget_card names the forgotten save's research thread: that dossier goes, every version of it, and another
    // account's dossier that recorded the same card number stays whole (Codex's review, finding 1).
    const thread = findingsThreadKey(SECRET, ACCOUNT, TARGET_DIGEST);
    expect(await store.eraseThread({ threadKey: thread, at: NOW })).toBe(2);
    expect(store.snapshot().map(({ dossierNumber, erased, events, identifiers }) => [dossierNumber, erased, events.at(-1), identifiers]))
      .toEqual([["ARD-0001", true, "erased", 0], ["ARD-0001", true, "erased", 0],
        ["ARD-0002", false, "submitted", expect.any(Number)]]);
    expect(store.snapshot().map(({ cardNumber }) => cardNumber)).toEqual([null, null, 42]);
    expect((await store.readVersion(otherAccount, store.snapshot()[2]!.versionId))?.payload).not.toBeNull();
    expect(await store.eraseThread({ threadKey: thread, at: NOW })).toBe(0);
    await expect(store.eraseThread({ threadKey: "not a thread", at: NOW })).rejects.toThrow("RESEARCH_DOSSIER_ERASE_INPUT_INVALID");
  });

  it("reads the dossier from later_inputs or the top level, and keys it by account, target and question", () => {
    expect(researchDossierFromCall({ later_inputs: { research_dossier: { a: 1 } } })).toEqual({ given: true, value: { a: 1 } });
    expect(researchDossierFromCall({ research_dossier: { b: 2 } })).toEqual({ given: true, value: { b: 2 } });
    expect(researchDossierFromCall({ later_inputs: {} })).toEqual({ given: false });
    const key = researchDossierKey(SECRET, ACCOUNT, TARGET_DIGEST, "What do the forms of inositol do?");
    expect(key).toMatch(/^[a-f0-9]{64}$/u);
    expect(researchDossierKey(SECRET, ACCOUNT, TARGET_DIGEST, "  what do the forms of INOSITOL do? ")).toBe(key);
    expect(researchDossierKey(SECRET, ACCOUNT, TARGET_DIGEST, "Is IP6 safe?")).not.toBe(key);
    expect(researchDossierKey(SECRET, "b".repeat(64), TARGET_DIGEST, "What do the forms of inositol do?")).not.toBe(key);
    expect(FINAL_CHECK_BLOCKING_RULES).toEqual(["source_provenance", "read_depth", "numbers", "harm_screen", "retractions",
      "plain_answer_comparison"]);
    expect(sha256("x")).toMatch(/^[a-f0-9]{64}$/u);
  });
});

// The first real dossier (16 Nov 2026): its AI met a shape failure on value.adds it read as "the format of its ids", then
// 13 form_not_listed and 17 form_mismatch problems, by path and rule only, and could not tell what either asked.
describe("problems the AI can act on: the ids' and the forms' rules, said in the shape and explained with each problem", () => {
  const FORM_NOT_LISTED = "a study's or a finding's form must be one of the forms listed in forms, written the same " +
    "way (capitals aside): add it to forms, or write it as listed";
  const FORM_MISMATCH = "a finding's form must be the form of every study it rests on, directly or through a result: " +
    "when its studies' forms differ, leave the finding's form out";

  it("says the ids' format and the forms' rules in the shape the AI is given", () => {
    expect(RESEARCH_DOSSIER_SHAPE).toContain("adds, the ids of up to 8 findings that save the most work");
    expect(RESEARCH_DOSSIER_SHAPE).toContain("Ids: each search, study, result and finding has its own, a lower-case " +
      "letter then up to 31 lower-case letters, digits, - or _ (s1, f2); adds, rests_on, study and search give these ids " +
      "exactly.");
    expect(RESEARCH_DOSSIER_SHAPE).toContain("Forms: a study's form and a finding's form, when given, are each one of " +
      "forms, written the same way; a finding's form is also the form of every study it rests on, directly or through " +
      "a result, so a finding across studies of different forms leaves its form out.");
    expect(RESEARCH_DOSSIER_SHAPE).toContain("cite a paper or a trial by its DOI, PMID with its number (PMID 12345678), " +
      "PMCID or registry number with the registry's prefix");
  });

  it("explains form_not_listed and form_mismatch once each, and a dossier corrected as they say is saved", async () => {
    // As the first real dossier wrote them: a form listed under one name and written under another.
    const named = (dossier: Record<string, any>) => {
      dossier.studies[0].form = "Myo-inositol powder";
      dossier.findings[1].form = "inositol";
    };
    const refused = await saveResearchDossier(new InMemoryResearchDossierStore(), withDossier(named));
    expect(refused?.disposition).toEqual({ status: "insufficient", reason: "checks_failed",
      problems: [
        { path: "studies[0].form", rule: "form_not_listed" },
        { path: "findings[1].form", rule: "form_not_listed" },
        { path: "findings[1].rests_on[0]", rule: "form_mismatch" },
      ],
      explanations: { form_not_listed: FORM_NOT_LISTED, form_mismatch: FORM_MISMATCH } });
    expect(refused?.note).toBe("Research dossier not saved, nothing of it was stored. form_not_listed at " +
      `studies[0].form, findings[1].form: ${FORM_NOT_LISTED}. form_mismatch at findings[1].rests_on[0]: ` +
      `${FORM_MISMATCH}. Correct them and send it again only with a final check already needed for this research; do ` +
      "not make another check solely to repair it.");
    // Done as the explanations say: the study's form added to forms, the finding's form left out.
    const corrected = await saveResearchDossier(new InMemoryResearchDossierStore(), withDossier((dossier) => {
      named(dossier);
      dossier.forms.push("Myo-inositol powder");
      delete dossier.findings[1].form;
    }));
    expect(corrected?.disposition.status).toBe("saved");
  });

  it("explains the ids' format with a shape problem, as adds met it, and never echoes the value", async () => {
    const refused = await saveResearchDossier(new InMemoryResearchDossierStore(), withDossier((dossier) => {
      dossier.value.adds = ["F1", "finding three"];
    }));
    expect(refused?.disposition).toMatchObject({ status: "insufficient",
      problems: [{ path: "value.adds[0]", rule: "shape" }, { path: "value.adds[1]", rule: "shape" }] });
    expect(refused?.disposition.explanations?.shape).toContain("an id, and each reference to one in adds, rests_on, " +
      "study or search, is a lower-case letter then up to 31 lower-case letters, digits, - or _");
    expect(JSON.stringify(refused)).not.toContain("finding three");
    const corrected = await saveResearchDossier(new InMemoryResearchDossierStore(), withDossier((dossier) => {
      dossier.value.adds = ["f1", "f3"];
    }));
    expect(corrected?.disposition.status).toBe("saved");
  });

  it("explains every rule the checks name, once, however many problems break it", async () => {
    const outcome = await saveResearchDossier(new InMemoryResearchDossierStore(), withDossier((dossier) => {
      dossier.findings[0].rests_on = ["r9", "community"];
      dossier.value.adds = ["f9"];
      dossier.results[0].id = "s1";
      dossier.results[0].figure.nnt = 7;
      dossier.results[1].calculation.from = [6.2, 5];
      dossier.results[2].figure.option_events = 101;
      delete dossier.results[3].provenance;
      delete dossier.studies[5].decision_reason;
      dossier.studies[2].identifiers = ["not an identifier"];
      dossier.searches[1].query = "a search not run";
      dossier.coverage.conflicts = { status: "not_researched" };
      dossier.coverage.people_reports = { status: "entries" };
      dossier.studies[3].form = "phytate";
      dossier.open_trails = ["I take it daily"];
    }));
    const disposition = outcome!.disposition!;
    const rules = [...new Set(disposition.problems!.map(({ rule }) => rule))];
    expect(rules.length).toBeGreaterThan(12);
    expect(Object.keys(disposition.explanations!).sort()).toEqual([...rules].sort());
    for (const rule of rules) {
      expect(disposition.explanations![rule], rule).toMatch(/^[a-z].{20,}$/u);
      expect(outcome!.note!.split(`${rule} at `).length - 1, rule).toBe(1);
    }
  });
});

describe("finalize_research saves the dossier of a free contributor's research", () => {
  const IDENTITY_SECRET = new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes");
  const QUOTE = "The liver clears this drug within a few hours.";
  const SKIP = communitySkipCaveat("How the body clears a drug, with no real-world outcome.");

  afterEach(() => {
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
  });

  async function accessService() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor("auth0|free", {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
    return service;
  }

  function finalizeTool(options: RegisterToolsOptions) {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === "finalize_research") handler = execute;
      },
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", ...options });
    return async (input: Record<string, unknown>) => handler!(withSourceReading(input), {
      authInfo: {
        token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: "auth0|free" },
      },
    });
  }

  const call = (laterInputs: Record<string, unknown> = {}) => {
    const parsed = finalizeResearchInputSchema.parse({
      lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
      full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the dossier save." },
      receipts: [issueResearchReceipt("study_audit", {
        id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields",
      }, { secret: SECRET })],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome", question_about: "other",
      commercial_review_applicability: { status: "not_applicable", reason: "Drug clearance involves nothing people buy." },
      not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
      treatment_choice: "not_compared",
      research_target: "How the body clears a drug in adults",
      research_depth: "deep",
      intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded product." },
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }],
      absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
      safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
      findings_card: { ...CARD, findings: [{ ...CARD.findings[0], answer_quote: QUOTE, sources: ["PMC10518852"], tags: ["full_text_read"] }] },
      answer_draft: `${QUOTE}\n\n[Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/)\n\n${SKIP}`,
    });
    return { ...parsed, ...(Object.keys(laterInputs).length === 0 ? {} : { later_inputs: laterInputs }) };
  };

  const DOSSIER = {
    scope: "public",
    value: { saves_work: "substantial", adds: ["f1"], reason: "It reads the clearance study in full." },
    question: "How quickly does the body clear this drug?",
    topic: { key: "drug-clearance", name: "Drug clearance" },
    studies: [{ id: "s1", identifiers: ["PMC10518852"], kind: "human_trial", population: "Adults", decision: "used" }],
    results: [{ id: "r1", study: "s1", outcome: "Cleared within hours", direction: "benefit", certainty: "moderate" }],
    findings: [{ id: "f1", claim: "The liver clears this drug within a few hours in adults.", certainty: "moderate",
      kind: "helps", applies_to: "Adults", rests_on: ["r1"], what_would_change_it: "A study in older adults",
      importance: "important" }],
    coverage: {
      benefits: { status: "entries" },
      harms: { status: "not_researched", reason: "The question asks only how fast it is cleared." },
      null_results: { status: "not_researched", reason: "The question asks only how fast it is cleared." },
      conflicts: { status: "not_researched", reason: "One study." },
      mainstream_options: { status: "not_researched", reason: "No options are compared." },
      people_reports: { status: "not_researched", reason: "No real-world outcome." },
    },
  };

  it("saves a free contributor's dossier sent in later_inputs, ends the answer with its line, and changes no blocking check", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const store = new InMemoryResearchDossierStore();
    const finalize = finalizeTool({ researchContributorAccessService: await accessService(), researchDossiers: store });
    const result = await finalize(call({ research_dossier: DOSSIER }));
    expect(result.isError).not.toBe(true);
    const structured = result.structuredContent as Record<string, any>;
    expect(structured.status).toBe("ready_with_limits");
    expect(structured.research_dossier).toMatchObject({ status: "saved", dossier_id: "ARD-0001", version: 1,
      visibility: "private_review" });
    expect(structured.saved_line).toBe("Research dossier ARD-0001 was saved privately for AskRigor's owner to review " +
      "(version 1); it is not public.");
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain(`end the answer with this line, as written (in the answer's language when the answer is not ` +
      `in English): ${structured.saved_line}`);
    const [version] = store.snapshot();
    const read = await store.readVersion((await accessService()).accountKeyForSubject("auth0|free"), version!.versionId);
    expect((read!.payload as Record<string, any>).studies[0].read).toBe("full_text_audited");
    // Sent again with the same answer: the same version, nothing new written.
    const again = await finalize(call({ research_dossier: DOSSIER }));
    expect((again.structuredContent as Record<string, any>).research_dossier)
      .toMatchObject({ status: "duplicate", dossier_id: "ARD-0001", version: 1 });
    expect(store.snapshot()).toHaveLength(1);
  });

  it("asks for nothing and saves nothing without the dossiers' store, and refuses a dossier the checks fail", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const without = finalizeTool({ researchContributorAccessService: await accessService() });
    const plain = await without(call({ research_dossier: DOSSIER }));
    expect((plain.structuredContent as Record<string, any>).research_dossier).toBeUndefined();
    const store = new InMemoryResearchDossierStore();
    const finalize = finalizeTool({ researchContributorAccessService: await accessService(), researchDossiers: store });
    const bad = await finalize(call({ research_dossier: { ...DOSSIER, studies: [{ ...DOSSIER.studies[0], identifiers: ["PMID 12345678"] }] } }));
    const structured = bad.structuredContent as Record<string, any>;
    expect(structured.status).toBe("ready_with_limits");
    expect(structured.research_dossier).toMatchObject({ status: "insufficient", problems: [
      { path: "results[0].study", rule: "result_study_not_read" }, { path: "findings[0]", rule: "finding_without_backing" }] });
    expect(structured.notes.some((note: string) => note.startsWith("Research dossier not saved"))).toBe(true);
    expect(store.snapshot()).toEqual([]);
    // A short look-up that sends no dossier gets no line about one.
    const none = await finalize(call());
    expect((none.structuredContent as Record<string, any>).research_dossier).toBeUndefined();
  });
});

describe("forget_card erases the research thread's dossiers (AskRigor#477 stage 1)", () => {
  const OWNER = "auth0|research-dossier-owner";
  const ALICE = { contributor: "a".repeat(64), target: "a1a1a1a1a1a1" };

  it("erases the dossiers saved with the forgotten card's research thread, and leaves another thread's", async () => {
    const github = new FakeGitHub();
    const tokenProvider = { getToken: async () => "synthetic-findings-token" };
    const clock = () => NOW;
    const library = new FindingsSaveService({
      receiptSecret: () => SECRET,
      limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
      queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
      protocols: async () => [{ name: "HRP", version: "20.6.42", sha256: sha256("synthetic-hrp") }],
      version: "0.1.0",
      build: "0123abc",
      now: clock,
    });
    const card = findingsCardSchema.parse(VELMOR_CARD);
    const saved = await library.save({
      findings_card: VELMOR_CARD,
      contributor: ALICE.contributor,
      finalization_receipt: issueResearchReceipt("finalization", {
        status: "ready", depth: "standard", target: ALICE.target, findings: findingsCardDigest(card),
        bases: ["full_text_audit", "none"],
      }, { secret: SECRET, now: clock }),
    }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) });
    expect(saved.card_id).toBe("ARF-0042");

    const dossiers = new InMemoryResearchDossierStore();
    let sequence = 0;
    const base = {
      inputSha256: "1".repeat(64), payload: { schema: "askrigor.research-dossier.v1" }, payloadSha256: "2".repeat(64),
      identifiers: [{ scheme: "pmid" as const, value: "11111111" }], expectedPreviousVersionId: null, at: NOW,
    };
    await dossiers.append({ ...base, accountKey: ALICE.contributor, dossierKey: "d".repeat(64),
      threadKey: findingsThreadKey(SECRET, ALICE.contributor, ALICE.target), requestKey: "3".repeat(64), cardNumber: null,
      versionId: deterministicUuid(`forget-dossier:${sequence++}`) });
    await dossiers.append({ ...base, accountKey: "b".repeat(64), dossierKey: "e".repeat(64),
      threadKey: findingsThreadKey(SECRET, "b".repeat(64), "b2b2b2b2b2b2"), requestKey: "4".repeat(64), cardNumber: null,
      versionId: deterministicUuid(`forget-dossier:${sequence++}`) });

    const atlas = new AtlasReview({
      store: new InMemoryAtlasReviewStore(),
      reader: new InMemoryAtlasCanonicalStore({ now: () => NOW.toISOString() }),
      inbox: new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
      version: "0.1.0",
      build: "0123abc",
      protocols: async () => [],
      now: clock,
      newIntentId: () => deterministicUuid(`forget-dossier-intent:${sequence++}`),
      sourceCheckCache: new AtlasSourceCheckCache(),
      dossiers,
    });
    const handler = createResearchContributionReviewHandler({
      allowedReviewerSubjects: new Set([OWNER]),
      atlas: { enabled: true, review: atlas, providers: () => ({}) as never },
    });
    const result = await handler({ action: "forget_card", card: "ARF-0042" }, {
      authInfo: { token: "t", clientId: "c", scopes: ["cases:review"], expiresAt: Math.floor(Date.now() / 1_000) + 600,
        extra: { subject: OWNER } },
    } as never);
    const structured = researchContributionReviewOutputSchema.parse(result.structuredContent) as Record<string, any>;
    expect(structured.ok).toBe(true);
    const text = (result.content as Array<{ text: string }>).map(({ text: line }) => line).join("\n");
    expect(text).toContain("1 version of its research dossier is erased too.");
    expect(dossiers.snapshot().map(({ dossierNumber, erased }) => [dossierNumber, erased]))
      .toEqual([["ARD-0001", true], ["ARD-0002", false]]);
  });
});

describe("the dossier store's input limits", () => {
  it("takes a dossier at its limits, whose studies' identifiers and aliases can pass 200, and refuses more than 400", async () => {
    const store = new InMemoryResearchDossierStore();
    const identifiers = Array.from({ length: 320 }, (_, index) => ({ scheme: "pmid" as const, value: String(10000000 + index) }));
    const base = {
      accountKey: ACCOUNT, dossierKey: "d".repeat(64), threadKey: "e".repeat(64), requestKey: "1".repeat(64),
      inputSha256: "2".repeat(64), payload: { schema: "askrigor.research-dossier.v1" }, payloadSha256: "3".repeat(64),
      cardNumber: null, expectedPreviousVersionId: null, at: NOW,
    };
    expect((await store.append({ ...base, identifiers, versionId: deterministicUuid("limits:1") })).outcome).toBe("inserted");
    await expect(store.append({ ...base, requestKey: "4".repeat(64), inputSha256: "5".repeat(64),
      identifiers: [...identifiers, ...identifiers.slice(0, 81)], versionId: deterministicUuid("limits:2") }))
      .rejects.toThrow("RESEARCH_DOSSIER_INPUT_INVALID");
  });
});
