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
    commentsRead: false,
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
    // Codex's second pass (16 Nov 2026): a name with a birth date and a city, a verb no list named, capitals, and
    // full-width letters; and the same tricks once more.
    "Alice Smith, born 12 April 1984, takes aspirin daily and lives in Paris.",
    "I swallow aspirin daily.",
    "MY HUSBAND TAKES ASPIRIN FOR HIS HEART.",
    "\uff2d\uff59 husband takes aspirin.",
    "Alice takes aspirin daily.",
    "Marie, 45, takes it every night.",
    "She lives in Lyon and takes it every night.",
    "Née le 3 mars 1990, elle le prend chaque soir.",
    "Date of birth: 1984-04-12.",
    "MY husband takes aspirin.",
    "M\u200by husband takes aspirin.",
    "\u041cy husband takes aspirin.",
    "\u039cy husband takes aspirin.",
    "Then I stopped it for a week.",
    "We tried it for a month.",
    "Lives in Leeds, takes 400 mg.",
    "Born 3/4/1984, takes 400 mg.",
    "John takes magnesium nightly.",
    "Laura, 52, has cramps.",
    "The asker's husband takes it.",
    // Codex's final check: a name in capitals, look-alike letters in a name and in "I", and more of the kind.
    "ALICE SMITH TAKES ASPIRIN DAILY",
    "ALICE SMITH takes aspirin daily.",
    "\u0391lice Smith takes aspirin daily.",
    "J\u03bfhn Smith takes aspirin daily.",
    "\u0406 have lupus.",
    "\u04c0 have lupus.",
    "\u0131 have lupus.",
    "l have lupus.",
    "1 have lupus.",
    "i take aspirin daily",
    "I SWALLOW ASPIRIN DAILY",
    "We have been taking it since May.",
    "Nous avons essayé pendant un mois.",
    "DOB 12/04/1984",
    "fecha de nacimiento: 12 de abril de 1984",
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
    // Codex's second pass: an author before "et al." and patients' partners in a study's report; and more of the same.
    "Ho et al. found no effect.",
    "Patients reported improved quality of life at home with their partner.",
    "Mi et al. reported higher response rates.",
    "Moro and colleagues found the same.",
    "Each participant's partner completed a questionnaire.",
    "Heterogeneity was high (I\u00b2 = 78%).",
    "In phases I to III, no serious harm was seen.",
    "Iodine (I-131) was used to image the thyroid.",
    "Smith I, Jones K. A trial of magnesium for night cramps.",
    "Two groups, (I) and (II), received different doses.",
    "ANA titres were positive in 12 patients.",
    "The Robert Koch Institute surveyed 2,000 adults.",
    "Women born on 1 May 1950 or later were eligible.",
    "Caregivers and their spouse were interviewed together.",
    "Each woman and her partner were asked about side effects.",
    "Parents reported their child's sleep improved.",
    "Graves' disease and Hashimoto's thyroiditis were excluded.",
    "Garrison et al. 2012 (Cochrane) found low-certainty benefit.",
    "I risultati non mostrano differenze.",
    "Women and their husbands were interviewed.",
    // Codex's final check: a birth date as a study's covariate in six languages, and the researchers' "we".
    "Date of birth was recorded as a covariate.",
    "La fecha de nacimiento se registró como covariable.",
    "La date de naissance a été enregistrée comme covariable.",
    "A data de nascimento foi registrada como covariável.",
    "Das Geburtsdatum wurde als Kovariate erfasst.",
    "La data di nascita è stata registrata come covariata.",
    "We found no difference between treatments.",
    "We observed no adverse events.",
    "We used a random-effects model.",
    "Nous avons inclus 120 patients.",
    "Wir haben keinen Unterschied gefunden.",
    "Date of birth and sex were adjusted for.",
    "Magnesium was given i.v. over 30 minutes.",
    "The outcomes were (i) cramp frequency and (ii) sleep.",
    "Gli autori hanno seguito i loro figli per due anni.",
    "1 was lost to follow-up.",
    "Each received 2 l per day.",
    "The ALICE trial was stopped early.",
    "ANA was positive in 12 patients.",
  ];
  it("refuses each realistic leak", () => {
    for (const text of LEAKS) expect(dossierPrivacyRule(text), text).not.toBeUndefined();
  });
  it("passes each research sentence", () => {
    for (const text of RESEARCH) expect(dossierPrivacyRule(text), text).toBeUndefined();
  });
  it("still refuses what it cannot read, research or not: a script other than Latin and Greek", () => {
    // Codex's second pass counts this as a refusal of valid research; it stays, as the owner's rule says to refuse when
    // unsure (instruction-disagreements.md).
    expect(dossierPrivacyRule("\u30de\u30b0\u30cd\u30b7\u30a6\u30e0\u306f\u52b9\u679c\u304c\u306a\u304b\u3063\u305f\u3002"))
      .toBe("unscreened_script");
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
  it("after YouTube comments were read, as the final check decides it, refuses a finding drawn from them or left undeclared", async () => {
    expect((await problemsOf(dossier(), { commentsRead: true }))?.problems).toEqual([
      { path: "findings[0].draws_on_youtube_comments", rule: "youtube_origin_undeclared" },
      { path: "findings[1].draws_on_youtube_comments", rule: "youtube_origin_undeclared" },
    ]);
    const declared = edited((value) => {
      value.findings[0].draws_on_youtube_comments = false;
      value.findings[1].draws_on_youtube_comments = true;
    });
    expect((await problemsOf(declared, { commentsRead: true }))?.problems).toEqual([
      { path: "findings[1].draws_on_youtube_comments", rule: "youtube_comment_material" }]);
    const clean = edited((value) => {
      for (const finding of value.findings) finding.draws_on_youtube_comments = false;
    });
    const store = new InMemoryResearchDossierStore();
    expect((await saveResearchDossier(store, request({ commentsRead: true }, clean)))?.disposition?.status).toBe("saved");
    const stored = await store.readVersion(ACCOUNT, store.snapshot()[0]!.versionId);
    expect(JSON.stringify(stored!.payload)).not.toContain("draws_on_youtube_comments");
  });
  it("takes no discovery for comment reading: a survey or an audit that read no comments asks no declaration", async () => {
    // Codex's second pass: the save read every YouTube receipt kind as comments read. The final check's own decision
    // (commentsRead, from onCommentsRead) is what counts; these receipts alone change nothing.
    const receipts = [...BASE_RECEIPTS,
      receipt("youtube_survey", { access: "complete", searches: 1, videos: [], q: discoveryQueryDigest(["cramps"]),
        target: TARGET_DIGEST }),
      receipt("youtube_video_audit", { video: "dQw4w9WgXcQ", state: "complete", records: 0, shown: 0 })];
    expect((await problemsOf(dossier(), { receipts, commentsRead: false }))?.status).toBe("saved");
  });
  it("binds a held card finding to the dossier's own conclusions by an explicit declaration, never by their words", async () => {
    // Codex's final check: a word-overlap matcher let a paraphrase of the held finding through and refused a
    // paper-backed opposite. Each conclusion now says which card finding it is, by its place, or none.
    const held = (places: string[]) => receipt("finalization", { status: "ready", target: TARGET_DIGEST,
      answer: ANSWER_DIGEST, held: places });
    const declared = (change: (value: Record<string, any>) => void) => edited((value) => {
      for (const finding of value.findings) {
        finding.draws_on_youtube_comments = false;
        finding.card_finding = "none";
      }
      change(value);
    });
    const options = { finalizationReceipt: held(["2"]), cardFindings: 2 };
    // An unrelated held card finding: every conclusion declares its origin and none is that finding.
    expect((await problemsOf(declared(() => undefined), options))?.status).toBe("saved");
    // The held finding, paraphrased ("acetylsalicylic acid" for aspirin): its declaration names place 2, and is refused.
    const paraphrase = declared((value) => {
      value.findings[1].claim = "Acetylsalicylic acid eased pain more than an inert pill, by commenters' accounts.";
      value.findings[1].card_finding = 2;
    });
    expect((await problemsOf(paraphrase, options))?.problems).toEqual([
      { path: "findings[1].card_finding", rule: "held_card_finding" }]);
    // The paper-backed opposite of the held finding: declared none, and saved.
    const opposite = declared((value) => {
      value.findings[0].claim = "Aspirin did not reduce pain more than placebo in the trial read here.";
    });
    expect((await problemsOf(opposite, options))?.status).toBe("saved");
    // After a hold, a conclusion that does not say which card finding it is, or names one the card lacks, is refused.
    const undeclared = declared((value) => { delete value.findings[0].card_finding; });
    expect((await problemsOf(undeclared, options))?.problems).toEqual([
      { path: "findings[0].card_finding", rule: "card_finding_undeclared" }]);
    const beyond = declared((value) => { value.findings[0].card_finding = 4; });
    expect((await problemsOf(beyond, options))?.problems).toEqual([
      { path: "findings[0].card_finding", rule: "unknown_reference" }]);
    // Undeclared YouTube origin after a hold is refused too, as after comments were read.
    expect((await problemsOf(edited((value) => {
      for (const finding of value.findings) finding.card_finding = "none";
    }), options))?.problems).toEqual([
      { path: "findings[0].draws_on_youtube_comments", rule: "youtube_origin_undeclared" },
      { path: "findings[1].draws_on_youtube_comments", rule: "youtube_origin_undeclared" },
    ]);
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
  it("takes identifiers that receipts link through one another for one paper (Codex's second pass)", async () => {
    // One receipt links the PMID and the DOI, another the same DOI and a PMCID: a study giving the PMID and the PMCID
    // is that one paper, read as deeply as its deepest receipt.
    const fullText = receipt("full_text_read", { id: "PMC7777777", pmcid: "PMC7777777", doi: "10.1000/mag.trial" });
    const linked = edited((dossierValue) => { dossierValue.studies[0].identifiers = ["PMID 12121212", "PMC7777777"]; });
    const store = new InMemoryResearchDossierStore();
    expect((await saveResearchDossier(store, request({ receipts: [...BASE_RECEIPTS, fullText] }, linked)))
      ?.disposition?.status).toBe("saved");
    const stored = (await store.readVersion(ACCOUNT, store.snapshot()[0]!.versionId))!.payload as Record<string, any>;
    expect(stored.studies[0]).toMatchObject({ read: "full_text_read" });
    expect(stored.studies[0].identifiers).toEqual(expect.arrayContaining([
      { scheme: "pmid", value: "12121212" }, { scheme: "doi", value: "10.1000/mag.trial" },
      { scheme: "pmcid", value: "PMC7777777" }]));
    // And entered again by its PMCID alone, it is the same paper twice.
    const twice = edited((dossierValue) => {
      dossierValue.studies.push({ id: "s3", identifiers: ["PMC7777777"], kind: "human_trial", decision: "used" });
    });
    expect((await problemsOf(twice, { receipts: [...BASE_RECEIPTS, fullText] }))?.problems).toEqual([
      { path: "studies[2]", rule: "duplicate_paper" }]);
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
