import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasReviewStore,
  InMemoryResearchDossierStore,
  RESEARCH_USE_NOTICE_VERSION,
  deterministicUuid,
  sha256,
  type ResearchDossierStore,
} from "@askrigor/evidence-repository";

import { AtlasReview } from "../apps/research-mcp/src/findings/atlas-review.js";
import { findingsCardDigest, findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import { dossierPrivacyRule } from "../apps/research-mcp/src/findings/dossier-privacy.js";
import {
  researchDossierLine,
  saveResearchDossier,
  type ResearchDossierSaveRequest,
} from "../apps/research-mcp/src/findings/dossier.js";
import { GitHubFindingsReview } from "../apps/research-mcp/src/findings/github-findings-review.js";
import { GitHubFindingsQueue } from "../apps/research-mcp/src/findings/github-findings.js";
import { DEFAULT_FINDINGS_REPOSITORY } from "../apps/research-mcp/src/findings/runtime.js";
import { FindingsSaveService, findingsThreadKey } from "../apps/research-mcp/src/findings/service.js";
import { AtlasSourceCheckCache } from "../apps/research-mcp/src/findings/source-checks.js";
import { forumThreadDigest } from "../apps/research-mcp/src/forum-thread-links.js";
import { createResearchContributionReviewHandler } from "../apps/research-mcp/src/research-contribution-review-tool.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  researchTargetDigest,
} from "../apps/research-mcp/src/research-receipts.js";
import { VELMOR_CARD } from "./helpers/atlas-scenario.js";
import { FakeGitHub } from "./helpers/fake-github-findings.js";

// Codex's review of AskRigor#477 stage 1 (16 Nov 2026): one regression for each finding the memory stores and the
// dossier's own checks can show. The database's (the account lock, the retry table's rows, ARD numbers past 9999) are
// in scripts/research-contributor-access-postgres-acceptance.mts. Every study, person and identifier is invented.

const SECRET = "research-dossier-review-secret-0123456789abcdef";
const NOW = new Date("2026-11-16T16:00:00.000Z");
const TARGET_DIGEST = researchTargetDigest("Magnesium for night cramps in adults");
const ANSWER_DIGEST = createHash("sha256").update("The checked answer.", "utf8").digest("hex");
const ACCOUNT = "a".repeat(64);
const receipt = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, string | number | string[]>) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now: () => NOW });
const THREAD = "https://www.reddit.com/r/crampsupport/comments/abc123/magnesium_helped/";

const BASE_RECEIPTS = [
  receipt("pubmed_record", { pmid: "12121212", doi: "10.1000/mag.trial", abs: "1" }),
  receipt("pubmed_record", { pmid: "34343434", abs: "1" }),
  receipt("literature_search", { src: "pubmed", q: discoveryQueryDigest(["magnesium night cramps"]), ret: 9, n: 9,
    ids: ["12121212", "34343434", "56565656"] }),
];

function dossier(): Record<string, any> {
  return {
    scope: "public",
    value: { saves_work: "substantial", adds: ["f1"], reason: "It weighs two trials and a null result." },
    question: "Does magnesium reduce night cramps in adults?",
    topic: { key: "night-cramps", name: "Night cramps" },
    searches: [{ id: "q1", database: "pubmed", query: "magnesium night cramps" }],
    studies: [
      { id: "s1", identifiers: ["PMID 12121212"], kind: "human_trial", population: "Older adults", decision: "used" },
      { id: "s2", identifiers: ["34343434"], kind: "human_trial", population: "Pregnant women", decision: "used" },
    ],
    results: [
      { id: "r1", study: "s1", outcome: "Cramps per week", direction: "no_difference", certainty: "moderate" },
      { id: "r2", study: "s2", outcome: "Cramps per week", direction: "benefit", certainty: "low" },
    ],
    findings: [
      { id: "f1", claim: "Magnesium did not reduce night cramps in older adults against placebo.", certainty: "moderate",
        kind: "no_difference", applies_to: "Older adults", rests_on: ["r1"], what_would_change_it: "A larger trial",
        importance: "decision_changing" },
      { id: "f2", claim: "In pregnancy, one small trial found fewer cramps with magnesium.", certainty: "low",
        kind: "helps", applies_to: "Pregnant women", rests_on: ["r2"], what_would_change_it: "A replication",
        importance: "important" },
    ],
    coverage: {
      benefits: { status: "entries" }, harms: { status: "not_researched", reason: "Not asked." },
      null_results: { status: "entries" }, conflicts: { status: "none_found", search: "q1" },
      mainstream_options: { status: "not_researched", reason: "Not asked." },
      people_reports: { status: "not_researched", reason: "Not looked for." },
    },
  };
}

let versions = 0;
function request(overrides: Partial<ResearchDossierSaveRequest> = {}, value: unknown = dossier()): ResearchDossierSaveRequest {
  return {
    dossier: { given: true, value },
    account: { mode: "FREE_CONTRIBUTOR", accountKey: ACCOUNT, findingsSave: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION },
    callSavingOff: false,
    finalizationReceipt: receipt("finalization", { status: "ready", target: TARGET_DIGEST, answer: ANSWER_DIGEST }),
    shortLookup: false,
    validatedSources: 2,
    receipts: BASE_RECEIPTS,
    atlasReuse: [],
    cardId: undefined,
    secret: SECRET,
    versions: { askrigor: "0.1.0", build: "0123abc" },
    now: () => NOW,
    newVersionId: () => deterministicUuid(`research-dossier-review:${versions++}`),
    ...overrides,
  };
}
const edited = (change: (value: Record<string, any>) => void) => {
  const value = dossier();
  change(value);
  return value;
};
const problemsOf = async (value: unknown, overrides: Partial<ResearchDossierSaveRequest> = {}) =>
  (await saveResearchDossier(new InMemoryResearchDossierStore(), request(overrides, value)))?.disposition;

describe("P0 1: forgetting one person's card erases only their research thread's dossiers", () => {
  it("leaves another contributor's dossier that recorded the same shared card number", async () => {
    const github = new FakeGitHub();
    const tokenProvider = { getToken: async () => "synthetic-findings-token" };
    const library = new FindingsSaveService({
      receiptSecret: () => SECRET,
      limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
      queue: new GitHubFindingsQueue({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
      protocols: async () => [],
      version: "0.1.0",
      build: "0123abc",
      now: () => NOW,
    });
    const card = findingsCardSchema.parse(VELMOR_CARD);
    const alice = { contributor: "a".repeat(64), target: "a1a1a1a1a1a1" };
    const bob = { contributor: "b".repeat(64), target: "b2b2b2b2b2b2" };
    for (const [person, at] of [[alice, 0], [bob, 1]] as const) {
      const saved = await library.save({
        findings_card: VELMOR_CARD,
        contributor: person.contributor,
        finalization_receipt: issueResearchReceipt("finalization", { status: "ready", target: person.target,
          findings: findingsCardDigest(card), bases: ["full_text_audit", "none"] },
        { secret: SECRET, now: () => new Date(NOW.getTime() + at * 60_000) }),
      }, { surface: "/mcp/claude", toolCatalogSha256: "c".repeat(64) });
      // Bob's save joins Alice's open card: both are told ARF-0042.
      expect(saved.card_id).toBe("ARF-0042");
    }
    const dossiers = new InMemoryResearchDossierStore();
    for (const [person, key] of [[alice, "d"], [bob, "e"]] as const) {
      await dossiers.append({
        accountKey: person.contributor, dossierKey: key.repeat(64),
        threadKey: findingsThreadKey(SECRET, person.contributor, person.target), requestKey: sha256(`request:${key}`),
        inputSha256: sha256(`input:${key}`), payload: { schema: "askrigor.research-dossier.v1" },
        payloadSha256: sha256(`payload:${key}`), cardNumber: 42, identifiers: [], expectedPreviousVersionId: null,
        versionId: deterministicUuid(`p0-1:${key}`), at: NOW,
      });
    }
    const atlas = new AtlasReview({
      store: new InMemoryAtlasReviewStore(),
      reader: new InMemoryAtlasCanonicalStore({ now: () => NOW.toISOString() }),
      inbox: new GitHubFindingsReview({ tokenProvider, fetch: github.fetch, repository: DEFAULT_FINDINGS_REPOSITORY }),
      version: "0.1.0",
      build: "0123abc",
      protocols: async () => [],
      now: () => NOW,
      newIntentId: () => deterministicUuid(`p0-1-intent:${versions++}`),
      sourceCheckCache: new AtlasSourceCheckCache(),
      dossiers,
    });
    const handler = createResearchContributionReviewHandler({
      allowedReviewerSubjects: new Set(["auth0|owner"]),
      atlas: { enabled: true, review: atlas, providers: () => ({}) as never },
    });
    const owner = { authInfo: { token: "t", clientId: "c", scopes: ["cases:review"],
      expiresAt: Math.floor(Date.now() / 1_000) + 600, extra: { subject: "auth0|owner" } } } as never;
    // Bob's later save on the card makes forget_card ask for confirmation; confirmed, it forgets Alice's thread and
    // re-files Bob's save as a card of his own.
    await handler({ action: "forget_card", card: "ARF-0042", confirm: true }, owner);
    expect(dossiers.snapshot().map(({ dossierNumber, erased }) => [dossierNumber, erased]))
      .toEqual([["ARD-0001", true], ["ARD-0002", false]]);
  });
});

describe("P0 2: the dossier's privacy screen refuses the person's details and passes research sentences", () => {
  const LEAKS = [
    "My husband, who takes it for his heart",
    "I take aspirin daily",
    "My name is Alice and I live in Paris",
    "Mon mari, qui le prend pour son cœur",
    "Her husband stopped it after two weeks",
    "The patient's wife noticed the change",
    "Je prends du magnésium tous les soirs",
    "J'ai arrêté au bout de deux semaines",
    "Tomo metformina desde hace un año",
    "Contact me at jane.doe@example.com",
    "Call +33 6 12 34 56 78 after six",
    "They live at 12 rue Lepic",
    "Ich nehme es seit drei Monaten",
    "Meu filho tomou durante um mês",
    "Mio marito lo prende ogni giorno",
    "Our son had a seizure after the second dose",
    "I'm 34 and was diagnosed last year",
    "Ma fille a douze ans",
    "u/sleepless_mom reported the same",
    "Мой муж принимает это каждый день",
    "我丈夫每天服用",
    "Her doctor changed the dose",
    "Sa mère habite à Nantes",
    "Su marido notó mejoría",
    "Ho smesso dopo due settimane",
    "Tengo diabetes desde 2019",
    "Sinto dores todas as noites",
    "Her home is near the clinic",
    "Seen in a YouTube video by a coach",
    "Write to @night_cramps_jane",
    "Visit https://example.com/my-story",
    "Springfield, IL 62704 is where it started",
  ];
  const RESEARCH = [
    "Myo-inositol 2 g a day improved fasting insulin against placebo over 12 weeks.",
    "In a phase I trial, people with type I diabetes received 4 g daily.",
    "Adults with ME/CFS reported less fatigue.",
    "After an MI, patients who took the drug had fewer events.",
    "EU regulators approved it in 2019.",
    "Women and their partners were enrolled.",
    "Mothers of infants were surveyed.",
    "Son effet sur l'insuline était modeste.",
    "Durante un mes, los pacientes tomaron 2 g al día.",
    "Les patients et leurs enfants ont été suivis.",
    "Studies in vivo and in vitro agreed.",
    "Das Medikament senkte den Blutdruck bei Erwachsenen.",
    "Os pacientes e seus filhos foram acompanhados.",
    "I pazienti hanno ricevuto 2 g al giorno, ma senza effetto.",
    "Type I and II collagen fell in both arms.",
    "A 34-year-old woman developed a rash (case report).",
    "People living in rural areas had less access to the drug.",
    "Each participant took his or her usual dose.",
    "Children born in 2004 were followed to age 10.",
    "IL-1β and TNF-α fell by a third.",
    "Patients and their doctors chose the dose.",
    "La dose était de 500 mg deux fois par jour.",
    "A meta-analysis of 12 trials (n = 1 234) found no difference.",
    "Night cramps in pregnancy",
    "magnesium citrate",
  ];
  it("refuses each realistic leak", () => {
    for (const text of LEAKS) expect(dossierPrivacyRule(text), text).not.toBeUndefined();
  });
  it("passes each research sentence", () => {
    for (const text of RESEARCH) expect(dossierPrivacyRule(text), text).toBeUndefined();
  });
  it("screens every supplied string, the topic key and ids included, and refuses the whole dossier", async () => {
    expect(await problemsOf(edited((value) => { value.findings[1].applies_to = "My husband, who takes it for his heart"; })))
      .toMatchObject({ status: "insufficient", problems: [{ path: "findings[1].applies_to", rule: expect.any(String) }] });
    expect((await problemsOf(edited((value) => { value.topic.key = "my-husbands-cramps"; })))?.problems)
      .toEqual([{ path: "topic.key", rule: "first_person" }]);
    expect((await problemsOf(edited((value) => { value.findings[0].what_would_change_it = "I take aspirin daily"; })))
      ?.status).toBe("insufficient");
  });
  it("reads an identifier no receipt names for words, and passes a real DOI's digits", async () => {
    const withStudy = (identifier: string) => edited((value) => {
      value.studies.push({ id: "s3", identifiers: [identifier], kind: "human_trial", decision: "set_aside",
        decision_reason: "Not read here." });
    });
    expect((await problemsOf(withStudy("10.5555/my-husband-cramps")))?.problems).toEqual([
      { path: "studies[2].identifiers[0]", rule: "first_person" }]);
    expect((await problemsOf(withStudy("10.1016/S0140-6736(20)30183-5")))?.status).toBe("saved");
    expect((await problemsOf(withStudy("10.1016/j.jad.2019.01.002")))?.status).toBe("saved");
  });
});

describe("P0 3: nothing drawn from YouTube comments, and people's reports only from forum threads read here", () => {
  it("refuses a community section that no forum read backs, whatever it names", async () => {
    const value = edited((dossierValue) => {
      dossierValue.community = { communities: ["YouTube"], people: { better: 40, no_change: 3, worse: 1, mixed: 0 },
        report_quality: { detailed: 4, measured: 0, bare: 40 } };
      dossierValue.findings[1].rests_on = ["community"];
      dossierValue.coverage.people_reports = { status: "entries" };
    });
    expect((await problemsOf(value))?.status).toBe("insufficient");
  });
  it("binds people's reports to threads AskRigor's reader read, and keeps only counts and the receipts' communities", async () => {
    const value = edited((dossierValue) => {
      dossierValue.community = { threads: [THREAD], people: { better: 3, no_change: 1, worse: 0, mixed: 0 },
        report_quality: { detailed: 2, measured: 0, bare: 2 } };
      dossierValue.findings[1].rests_on = ["r2", "community"];
      dossierValue.coverage.people_reports = { status: "entries" };
    });
    const read = receipt("forum_thread_read", { u: forumThreadDigest(THREAD), n: 12, v: "reddit", c: "crampsupport", e: "1" });
    const store = new InMemoryResearchDossierStore();
    const saved = await saveResearchDossier(store, request({ receipts: [...BASE_RECEIPTS, read] }, value));
    expect(saved?.disposition.status).toBe("saved");
    const stored = await store.readVersion(ACCOUNT, store.snapshot()[0]!.versionId);
    expect((stored!.payload as Record<string, any>).community).toEqual({ communities: ["r/crampsupport"], threads_read: 1,
      people: { better: 3, no_change: 1, worse: 0, mixed: 0 }, report_quality: { detailed: 2, measured: 0, bare: 2 } });
    expect(JSON.stringify(stored!.payload)).not.toContain("abc123");
    // A thread no receipt read is refused.
    expect((await saveResearchDossier(new InMemoryResearchDossierStore(), request({}, value)))?.disposition)
      .toMatchObject({ status: "insufficient", problems: [{ path: "community.threads[0]", rule: "community_thread_not_read" }] });
  });
  it("after YouTube comments were read, refuses a finding drawn from them or left undeclared", async () => {
    const comments = receipt("youtube_comments_read", { video: "dQw4w9WgXcQ", records: 50 });
    const receipts = [...BASE_RECEIPTS, comments];
    expect((await problemsOf(dossier(), { receipts }))?.problems).toEqual([
      { path: "findings[0].draws_on_youtube_comments", rule: "youtube_origin_undeclared" },
      { path: "findings[1].draws_on_youtube_comments", rule: "youtube_origin_undeclared" },
    ]);
    const declared = edited((value) => {
      value.findings[0].draws_on_youtube_comments = false;
      value.findings[1].draws_on_youtube_comments = true;
    });
    expect((await problemsOf(declared, { receipts }))?.problems).toEqual([
      { path: "findings[1].draws_on_youtube_comments", rule: "youtube_comment_material" }]);
    const clean = edited((value) => {
      for (const finding of value.findings) finding.draws_on_youtube_comments = false;
    });
    const store = new InMemoryResearchDossierStore();
    expect((await saveResearchDossier(store, request({ receipts }, clean)))?.disposition.status).toBe("saved");
    const stored = await store.readVersion(ACCOUNT, store.snapshot()[0]!.versionId);
    expect(JSON.stringify(stored!.payload)).not.toContain("draws_on_youtube_comments");
  });
  it("refuses the dossier of a check that held card findings apart as drawn from YouTube comments", async () => {
    const clean = edited((value) => {
      for (const finding of value.findings) finding.draws_on_youtube_comments = false;
    });
    const finalizationReceipt = receipt("finalization", { status: "ready", target: TARGET_DIGEST, answer: ANSWER_DIGEST,
      held: ["2"] });
    expect((await problemsOf(clean, { finalizationReceipt }))?.problems).toEqual([
      { path: "findings", rule: "card_findings_held_as_youtube" }]);
  });
  it("refuses a YouTube link among the threads people's reports come from", async () => {
    const video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const value = edited((dossierValue) => {
      dossierValue.community = { threads: [video], people: { better: 1, no_change: 0, worse: 0, mixed: 0 },
        report_quality: { detailed: 0, measured: 0, bare: 1 } };
    });
    const read = receipt("forum_thread_read", { u: forumThreadDigest(video), n: 3, v: "page", e: "1" });
    expect((await problemsOf(value, { receipts: [...BASE_RECEIPTS, read] }))?.problems).toEqual([
      { path: "community.threads[0]", rule: "youtube_reference" }]);
  });
});

describe("P1 5: a retry keeps its own version, whatever content it shares", () => {
  it("records a deduplicated request, so its retry returns its version after newer ones", async () => {
    const store = new InMemoryResearchDossierStore();
    const base = { accountKey: ACCOUNT, dossierKey: "d".repeat(64), threadKey: "e".repeat(64),
      payload: { schema: "askrigor.research-dossier.v1" }, cardNumber: null, identifiers: [], at: NOW };
    const append = (request: string, input: string, expected: string | null) => store.append({ ...base,
      requestKey: sha256(request), inputSha256: sha256(input), payloadSha256: sha256(`payload:${input}`),
      expectedPreviousVersionId: expected, versionId: deterministicUuid(`p1-5:${versions++}`) });
    const a = await append("A", "one", null);
    const b = await append("B", "one", null);
    expect([a.outcome, b.outcome]).toEqual(["inserted", "same_as_latest"]);
    const c = await append("C", "two", null);
    expect(c).toMatchObject({ outcome: "inserted", versionNumber: 2 });
    expect(await append("B", "one", null)).toMatchObject({ outcome: "replayed", versionNumber: 1 });
  });
  it("saves a new version for identical content sent after its earlier version was withdrawn", async () => {
    const store = new InMemoryResearchDossierStore();
    const first = await saveResearchDossier(store, request());
    expect(first?.disposition).toMatchObject({ status: "saved", version: 1 });
    store.revoke(ACCOUNT, NOW);
    const again = await saveResearchDossier(store, request({
      finalizationReceipt: receipt("finalization", { status: "ready", target: TARGET_DIGEST,
        answer: createHash("sha256").update("A later answer.", "utf8").digest("hex") }),
    }));
    expect(again?.disposition).toMatchObject({ status: "saved", version: 2 });
  });
});

describe("P1 6: studies are papers the receipts confirm, each once, and positive findings rest on papers read", () => {
  it("refuses an unread identifier riding on a read one", async () => {
    const value = edited((dossierValue) => { dossierValue.studies[0].identifiers = ["PMID 12121212", "10.9999/unrelated"]; });
    // The study is no paper a receipt read, so nothing may rest on it either.
    expect((await problemsOf(value))?.problems).toEqual([
      { path: "studies[0].identifiers", rule: "identifiers_not_one_paper" },
      { path: "results[0].study", rule: "result_study_not_read" },
      { path: "findings[0]", rule: "finding_without_backing" },
    ]);
  });
  it("refuses one paper entered twice, by its PMID and by its DOI", async () => {
    const value = edited((dossierValue) => {
      dossierValue.studies.push({ id: "s3", identifiers: ["10.1000/mag.trial"], kind: "human_trial", decision: "used" });
    });
    expect((await problemsOf(value))?.problems).toEqual([{ path: "studies[2]", rule: "duplicate_paper" }]);
  });
  it("does not let a search stand in for reading a positive finding's paper", async () => {
    const value = edited((dossierValue) => {
      dossierValue.studies.push({ id: "s3", identifiers: ["56565656"], kind: "human_trial", decision: "used" });
      dossierValue.findings[1].rests_on = ["s3", "q1"];
    });
    expect((await problemsOf(value))?.problems).toEqual([
      { path: "findings[1].rests_on[0]", rule: "finding_rests_on_unread_study" },
      { path: "findings[1]", rule: "finding_without_backing" },
    ]);
  });
});

describe("P2 10: every save outcome of a dossier that was sent is said in the answer", () => {
  it("says unconfirmed, not unavailable, when the write may have landed", async () => {
    const inner = new InMemoryResearchDossierStore();
    const failingRead: ResearchDossierStore = {
      latestVersion: (account, key) => inner.latestVersion(account, key),
      append: (input) => inner.append(input),
      readVersion: async () => { throw new Error("connection lost"); },
    };
    const outcome = await saveResearchDossier(failingRead, request());
    expect(outcome?.disposition).toEqual({ status: "unconfirmed", reason: "readback_failed" });
    expect(inner.snapshot()).toHaveLength(1);
    const failingAppend: ResearchDossierStore = { ...failingRead, append: async () => { throw new Error("timeout"); } };
    expect((await saveResearchDossier(failingAppend, request()))?.disposition)
      .toEqual({ status: "unconfirmed", reason: "write_not_confirmed" });
  });
  it("gives a line for every disposition of a dossier that was sent", () => {
    for (const disposition of [
      { status: "private", reason: "personal_only" }, { status: "private", reason: "no_research_account" },
      { status: "consent_blocked", reason: "paid_private" }, { status: "consent_blocked", reason: "saving_off" },
      { status: "consent_blocked", reason: "call_saving_off" }, { status: "consent_blocked", reason: "notice_not_current" },
      { status: "consent_blocked", reason: "account_not_eligible" }, { status: "unavailable", reason: "store_unavailable" },
      { status: "unconfirmed", reason: "readback_failed" },
    ] as const) {
      expect(researchDossierLine(disposition), JSON.stringify(disposition)).toMatch(/research dossier/iu);
    }
  });
});
