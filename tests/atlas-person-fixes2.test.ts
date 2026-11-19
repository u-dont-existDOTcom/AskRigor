import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ATLAS_PUBLISHED_RETRACTIONS,
  ATLAS_SOURCE_FIGURES,
  ATLAS_SOURCE_READINGS,
  InMemoryAtlasPageSource,
  InMemoryAtlasPersonClaims,
  InMemoryAtlasPublicationStore,
  RESEARCH_USE_NOTICE_VERSION,
  type AtlasPersonReading,
} from "@askrigor/evidence-repository";

import { atlasNearFinder, heldFor } from "../apps/research-mcp/src/askrigor-holds.js";
import { topicKeyText } from "../apps/research-mcp/src/findings/topic-key.js";
import { AtlasChangeSignal } from "../apps/research-mcp/src/atlas/change-signal.js";
import { AtlasKeptReview } from "../apps/research-mcp/src/atlas/kept-review.js";
import { lookupAtlas } from "../apps/research-mcp/src/atlas/lookup-tool.js";
import { loadAtlasFinding, loadAtlasSearchIndex, type ShownFinding } from "../apps/research-mcp/src/atlas/page-data.js";
import { createAtlasPagesHandler, type CreateAtlasPagesHandlerOptions } from "../apps/research-mcp/src/atlas/pages-http.js";
import {
  applyPersonClaims,
  machineFinding,
  parsePersonReply,
  PERSON_LEFT_OUT,
  personBundleOf,
  personDigestOf,
  personSentencesOf,
  type PersonClaimContext,
} from "../apps/research-mcp/src/atlas/person-claims.js";
import { AtlasPersonReadingWorker } from "../apps/research-mcp/src/atlas/person-reading.js";
import { AtlasCardPublisher } from "../apps/research-mcp/src/atlas/publication.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import { recordOf } from "./helpers/atlas-participation-fixture.js";
import { personFinding, ruleReader, ruleReply, type PersonRule } from "./helpers/atlas-person-fixtures.js";
import { VELMOR_CARD } from "./helpers/atlas-scenario.js";

// Atlas Release B, the last fix round (Fable's recheck "release B after changes"; Codex's final pass "do not release",
// its P1): each test here failed before its fix. Hermetic: the reading's replies are written by rule.
const SINCE = "2026-11-19T08:00:00.000Z";
const NOW = new Date("2026-11-19T13:00:00.000Z");

function readingFor(finding: ShownFinding, rule: PersonRule): AtlasPersonReading {
  const bundle = personBundleOf(finding, []);
  const parsed = parsePersonReply(ruleReply(bundle, rule), finding, bundle);
  if (!parsed.ok) throw new Error(parsed.problem);
  return { publicationNumber: finding.publicationNumber, digest: personDigestOf(finding), sentences: parsed.sentences,
    readAt: NOW.toISOString(), model: "claude-opus-5-5", attemptDigest: null, attempts: 0, parked: false };
}
const view = (finding: ShownFinding, reading: AtlasPersonReading | undefined, extra: Partial<PersonClaimContext> = {}) =>
  applyPersonClaims(finding, { since: SINCE, reading, removals: [], removedNames: [], now: NOW, ...extra });

/** Every text leaf of a value, by its path. */
function stringLeaves(value: unknown, path = ""): Array<{ path: string; text: string }> {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => stringLeaves(item, `${path}.${index}`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => stringLeaves(item, path === "" ? key : `${path}.${key}`));
  }
  return [];
}

// What a ShownFinding may hold outside the reading, each with why: numbers, codes, dates and links the server builds
// or checks by exact pattern, and the one owner text left outside by design. Anything else must be read.
const EXEMPT: Readonly<Record<string, string>> = {
  publicationNumber: "the server's P number",
  "links.*.atlasNumber": "an F number", "links.*.relation": "a fixed relation", "links.*.direction": "a fixed direction",
  "status.kind": "a fixed label", "status.atlasNumber": "an F number", "status.checkedOn": "a date",
  certainty: "a fixed grade", kind: "a fixed kind", subjectType: "a fixed type", direction: "a fixed direction",
  "numbers.*.better": "fixed", "numbers.*.source.identifiers.*.scheme": "an identifier's scheme",
  "numbers.*.source.identifiers.*.value": "an identifier, by exact pattern",
  "searches.*.database": "a fixed database", "searches.*.dateRange.start": "a date", "searches.*.dateRange.end": "a date",
  "sources.*.identifiers.*.scheme": "an identifier's scheme", "sources.*.identifiers.*.value": "an identifier, by exact pattern",
  "verifiedBases.*": "a fixed basis", savedOn: "a date", researchCheckedOn: "a date", askrigorVersion: "a version",
  "contested.*.atlasNumber": "an F number", "contested.*.publicationNumber": "a P number",
  "contested.*.disagreement": "the owner's own words on a link between two checked findings (link_findings), outside " +
    "the reading by design, like his pointers",
  "replacedBy.*.atlasNumber": "an F number", "replacedBy.*.publicationNumber": "a P number",
  publishedAt: "a time", stateChangedAt: "a time",
  "research.*.source.identifiers.*.scheme": "an identifier's scheme",
  "research.*.source.identifiers.*.value": "an identifier, by exact pattern",
  "research.*.retraction": "a fixed status", "research.*.read": "a fixed reading", "research.*.figures": "a fixed check",
  "research.*.lines.*.text": "a fixed text kind",
  "forumSignal.communities.*": "a forum's name, by exact pattern, from the read's verified parts",
  "forumSignal.threads.*": "a thread's link, by exact pattern", "forumSignal.studies": "a fixed relation",
  "namedVideos.*": "a watch page's link, by exact pattern", aiReadings: "a fixed value",
  "challenge.sourceUrl": "a link", "challenge.verdict": "a fixed verdict", shownBy: "a fixed route",
  "ownerTexts.*.path": "the server's own path",
};
const generic = (path: string) => path.replace(/\.\d+(?=\.|$)/gu, ".*");

const PLANT = (where: string) => `Dr Plant Witness took bribes, says the ${where}.`;
const plantRule: PersonRule = (text) => /plant witness/iu.test(text) ? "person|crime|-|-|-|n|n|n|-|Dr Plant Witness" : undefined;
const NOTE_PATH = "change.edited.2026-11-19T09:00:00.000Z";
const FULL = personFinding({
  question: PLANT("question"), usualAnswer: PLANT("usual answer"),
  links: [{ atlasNumber: "F-1002", relation: "contradicts", direction: "outgoing" }] as unknown as ShownFinding["links"],
  status: { kind: "checked", atlasNumber: "F-1001", checkedOn: "2026-11-19" } as ShownFinding["status"],
  topic: { key: "dr-plant-witness-bribes", label: PLANT("topic label") },
  claim: PLANT("claim"), appliesTo: PLANT("applies to"), kind: "effect", subject: PLANT("subject"),
  subjectType: "supplement" as ShownFinding["subjectType"], direction: "benefit" as ShownFinding["direction"],
  numbers: [{ outcome: PLANT("outcome"), better: "fewer", option: PLANT("option"), optionEvents: 1, optionTotal: 10,
    comparator: PLANT("comparator"), comparatorEvents: 2, comparatorTotal: 10, followUp: PLANT("follow up"),
    harmsNoneFound: false, source: { identifiers: [{ scheme: "doi", value: "10.1000/n.1" }] as never,
      title: PLANT("figure's source title"), year: 2020 } }],
  searches: [{ database: "pubmed", query: PLANT("search query"), dateRange: { start: "2020-01-01", end: "2026-01-01" } }],
  sources: [{ identifiers: [{ scheme: "doi", value: "10.1000/c.1" }] as never, title: PLANT("cited title"), year: 2019 }],
  whyNotUsual: PLANT("why not usual"), whatWouldChangeIt: PLANT("what would change it"),
  verifiedBases: ["full_text_audit"], savedOn: "2026-11-18", researchCheckedOn: "2026-11-18", askrigorVersion: "1.2.3",
  contested: [{ atlasNumber: "F-1003", publicationNumber: "P-1003", disagreement: "The second trial disagrees on the dose." }],
  replacedBy: [{ atlasNumber: "F-1004", publicationNumber: "P-1004" }],
  research: [{ source: { identifiers: [{ scheme: "doi", value: "10.1000/r.1" }] as never, title: PLANT("research title"),
    year: 2021 }, retraction: ATLAS_PUBLISHED_RETRACTIONS[0], read: ATLAS_SOURCE_READINGS[0], figures: ATLAS_SOURCE_FIGURES[0],
  lines: [{ sentence: PLANT("kept quote"), sentenceSection: PLANT("quote's section"), conclusion: PLANT("kept conclusion"),
    conclusionSection: PLANT("conclusion's section"), text: "full_text", against: PLANT("against") }] }],
  forumSignal: { communities: ["r/velmor"], threadsRead: 1, threads: ["https://www.reddit.com/r/velmor/comments/abc123/"],
    people: { better: 1, noChange: 0, worse: 0, mixed: 0 }, quality: { detailed: 1, measured: 0, bare: 0 },
    mechanism: PLANT("forum mechanism"), studies: "support_not_located", studiesMeasured: PLANT("studies measured") },
  namedVideos: ["https://www.youtube.com/watch?v=abcdefghijk"], aiReadings: "caller",
  challenge: { usualView: PLANT("usual view"), sourceUrl: "https://example.org/usual", sourceLabel: PLANT("usual view's source"),
    verdict: "pass" } as unknown as ShownFinding["challenge"],
  shownBy: "owner" as ShownFinding["shownBy"], shownTestVerdict: null,
  ownerTexts: [{ path: NOTE_PATH, text: PLANT("owner's change note") }],
});
/** A leaf's path as the reading's slots name it. */
const slotPath = (path: string) => path.replace(/^forumSignal\./u, "forum.")
  .replace(/^research\.(\d+)\.source\.title$/u, "research.$1.title")
  .replace(/^ownerTexts\.(\d+)\.text$/u, (_, index: string) => `owner.${FULL.ownerTexts![Number(index)]!.path}`);
/** Each planted sentence in a text that is not right after its mark. */
const unmarkedPlants = (text: string) => [...text.matchAll(/Dr Plant Witness took bribes, says the [^.]+\./gu)]
  .filter((match) => !text.slice(0, match.index).endsWith("It might be false.] ")).map(([sentence]) => sentence);

describe("every text a public surface shows is read (Codex's final P1; Fable's change 1)", () => {
  it("reads every text field of a finding, but a short exempt list, and shows none of them unmarked", () => {
    const read = new Set(personSentencesOf(FULL).flatMap(({ paths }) => paths));
    const leaves = stringLeaves(FULL);
    expect(leaves.length).toBeGreaterThan(40);
    expect(leaves.filter(({ path }) => !read.has(slotPath(path)) && !(generic(path) in EXEMPT)).map(({ path }) => path))
      .toEqual([]);
    // No exempt field is a free text the AI wrote, but the owner's disagreement.
    for (const { path, text } of leaves) if (generic(path) in EXEMPT) expect(text, path).not.toMatch(/Plant Witness/u);
    const shown = view(FULL, readingFor(FULL, plantRule))!;
    // A topic that doesn't read plain is not shown; a query is replaced by the fixed line, and so is the owner's note.
    expect(shown.topic).toBeNull();
    expect(shown.searches[0]!.query).toBe(`[${PERSON_LEFT_OUT}]`);
    expect(shown.ownerTexts![0]!.text).toBe(`[${PERSON_LEFT_OUT}]`);
    expect(shown.personClaims!.neutralTitle).toBe("The Atlas: a finding with an unverified claim about a named person");
    const { personClaims: _view, ...fields } = shown;
    for (const { path, text } of stringLeaves(fields)) expect(unmarkedPlants(text), path).toEqual([]);
    const { personClaims: _machineView, ...machine } = machineFinding(shown);
    for (const { path, text } of stringLeaves(machine)) expect(text, path).not.toMatch(/Plant Witness/u);
  });

  it("shows a topic and a query that read plain as they are, and an unread finding without its topic", () => {
    const finding = personFinding({ publishedAt: "2026-11-18T12:00:00.000Z",
      searches: [{ database: "pubmed", query: "zentarine tremor", dateRange: null }] });
    const read = view(finding, readingFor(finding, () => undefined))!;
    expect(read.topic).toEqual({ key: "velmor-syndrome", label: "Velmor syndrome" });
    expect(read.searches[0]!.query).toBe("zentarine tremor");
    const unread = view(finding, undefined)!;
    expect(unread.personClaims!.state).toBe("unread");
    expect(unread.topic).toBeNull();
    expect(unread.personClaims!.neutralTitle).toBe("The Atlas: a finding not yet checked for claims about people");
  });
});

// The every-route walk with the claim planted in the AI's topic name and key and in a search query too.
const TOPIC = { key: "dr-invented-zentaro-fraud", label: "Dr Invented Zentaro research fraud" };
const QUERY = "Dr Invented Zentaro fraud retraction";
const TRIAL = "Zentarine 20 mg halved the tremor score in 60 of 240 against 36 of 240 on placebo over 12 weeks.";
const PLANTS = {
  claim: "Dr Invented Zentaro sells zentarine through his own company.",
  why: "Quick answers miss that Dr Invented Zentaro was struck off for faking data.",
  change: "A trial not run by Dr Invented Zentaro's own clinic.",
  applies: "Adults treated at Dr Invented Zentaro's clinic, which bills for fake visits.",
};
const zentaroRule: PersonRule = (text) => /zentaro/iu.test(text) ? "person|fraud|-|-|-|n|n|n|-|Dr Invented Zentaro" : undefined;
const FREE = { mode: "FREE_CONTRIBUTOR", noticeVersion: RESEARCH_USE_NOTICE_VERSION } as const;
const openLimiter = { consume: () => true } as unknown as CreateAtlasPagesHandlerOptions["rateLimiter"];

async function published(since = SINCE) {
  const clock = Date.parse("2026-11-19T09:00:00.000Z");
  const now = () => new Date(clock);
  const publications = new InMemoryAtlasPublicationStore();
  const publisher = new AtlasCardPublisher({ store: publications, now, showOnPages: false } as
    ConstructorParameters<typeof AtlasCardPublisher>[0]);
  const card = { ...VELMOR_CARD, question: `${VELMOR_CARD.question} (planted)`, topic: TOPIC,
    findings: [{ ...VELMOR_CARD.findings[1]!, claim: `${TRIAL} ${PLANTS.claim}`, why_not_usual: PLANTS.why,
      what_would_change_it: PLANTS.change, applies_to: PLANTS.applies, searches: [{ database: "pubmed", query: QUERY }] }] };
  await publisher.afterSave({ record: recordOf(card), issueNumber: 4701, kind: "created", setAside: false,
    replacedCards: [], account: FREE });
  const [row] = await publications.inspect({ cardNumbers: [4701] });
  if (row === undefined) throw new Error("NOT_PUBLISHED");
  const shown = await new AtlasKeptReview({ publications, now }).run({ action: "show_on_pages",
    items: [row.publicationNumber], shown_by: "owner" } as Parameters<AtlasKeptReview["run"]>[0]);
  if (!shown.ok) throw new Error(`NOT_SHOWN ${JSON.stringify(shown)}`);
  const person = new InMemoryAtlasPersonClaims();
  const source = new InMemoryAtlasPageSource({ publications, personClaims: { since, store: person } });
  return { person, source, number: row.publicationNumber };
}

async function serve(options: CreateAtlasPagesHandlerOptions, work: (base: string) => Promise<void>) {
  const server = createAskRigorHttpServer({ publicServerEnabled: false,
    atlasPagesHandler: createAtlasPagesHandler({ rateLimiter: openLimiter, ...options }) });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

function unmarked(body: string, sentence: string): number {
  let count = 0;
  for (let index = body.indexOf(sentence); index !== -1; index = body.indexOf(sentence, index + 1)) {
    const before = body.slice(0, index);
    if (!before.endsWith("It might be false.] ") && !before.endsWith("It might be false.</span> ") &&
      !before.endsWith("[Unverified claim] ")) count += 1;
  }
  return count;
}

describe("the planted topic name, key and query on every public surface (Codex's final P1)", () => {
  it("never shows them unmarked in a page, list, title, description, address, sitemap, lookup, hand-over or the changes", async () => {
    const { person, source, number } = await published();
    const worker = new AtlasPersonReadingWorker({ source, store: person, reader: ruleReader(zentaroRule), capUsd: 1,
      now: () => NOW, signal: new AtlasChangeSignal(), log: () => undefined });
    expect((await worker.pass()).read).toEqual([number]);
    const paths = ["/atlas", "/atlas/findings", "/atlas/topics", `/atlas/topics/${TOPIC.key}`, "/atlas/search?q=Zentaro",
      "/atlas/search?q=fraud", "/atlas/search?q=zentarine", "/atlas/map", "/atlas/sitemap.xml", "/atlas/changes",
      "/atlas/challenges", "/atlas/health", `/atlas/findings/${number}`, `/atlas/findings/${number}/person`];
    // The key is read as its words; the dispute form lists that sentence too, marked, so the person can dispute it.
    const keySentence = topicKeyText(TOPIC.key);
    const planted = [...Object.values(PLANTS), TOPIC.label, QUERY, keySentence];
    await serve({ enabled: true, source, signal: new AtlasChangeSignal(), personClaims: { store: person } }, async (base) => {
      for (const path of paths) {
        const response = await fetch(`${base}${path}`);
        const body = await response.text();
        expect(response.status, path).toBe(path === `/atlas/topics/${TOPIC.key}` ? 404 : 200);
        for (const sentence of planted) expect(unmarked(body, sentence), `${path}: ${sentence}`).toBe(0);
        expect(body.split(`[Unverified claim] ${keySentence}`).join(""), path).not.toContain(TOPIC.key);
        expect(body.slice(0, body.indexOf("</head>")), path).not.toMatch(/zentaro/iu);
      }
      const page = await (await fetch(`${base}/atlas/findings/${number}`)).text();
      expect(page).toContain(`[${PERSON_LEFT_OUT}]`);
      expect(await (await fetch(`${base}/atlas/sitemap.xml`)).text()).not.toMatch(/zentaro/iu);
    });
    // The lookup other AI apps read, and the hand-over at registration: no claim about him, and no topic of his name.
    for (const input of [{ query: "Zentaro" }, { query: "fraud" }, { query: "zentarine" }, { topic_key: TOPIC.key }]) {
      const output = await lookupAtlas(input, { source, now: () => NOW, origin: "https://askrigor.example" });
      if ("query" in input && input.query === "zentarine") expect(output.findings.length).toBe(1);
      // Its topic_key (also a topic lead's), query_words and the frontier catalog's query repeat the caller's own input.
      const catalog = (output as unknown as { frontier_catalog?: Record<string, unknown> }).frontier_catalog;
      const text = JSON.stringify({ ...output, topic_key: null, query_words: [],
        topic_leads: output.topic_leads.map((lead) => ({ ...lead,
          topic_key: "topic_key" in input && lead.topic_key === input.topic_key ? null : lead.topic_key })),
        ...(catalog === undefined ? {} : { frontier_catalog: { ...catalog, query: null } }) });
      const at = text.search(/zentaro/iu);
      expect(at === -1 ? "" : text.slice(Math.max(0, at - 160), at + 80), JSON.stringify(input)).toBe("");
      if ("topic_key" in input) expect(output.findings).toEqual([]);
    }
    const held = await heldFor({ atlas: atlasNearFinder(source, { fresh: true, origin: "https://askrigor.example" }) },
      "Does zentarine ease the tremor of Velmor syndrome?");
    expect(held?.atlas_findings?.map(({ publication_number }) => publication_number)).toEqual([number]);
    expect(JSON.stringify(held)).not.toMatch(/zentaro/iu);
    expect(held!.atlas_findings![0]!.wording).toContain("Left out here: an unverified claim of fraud about a named person.");
    // A removal keeps the finding's own context, its hidden topic included (Codex's check of this round).
    await serve({ enabled: true, source, signal: new AtlasChangeSignal(), personClaims: { store: person } }, async (base) => {
      const form = await (await fetch(`${base}/atlas/findings/${number}/person`)).text();
      const token = /name="token" value="([A-Za-z0-9_-]+)"/u.exec(form)![1]!;
      const posted = await fetch(`${base}/atlas/findings/${number}/person`, { method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://askrigor.com" },
        body: new URLSearchParams({ token, sentence: personSentencesOf((await loadAtlasFinding(source, number))!.finding)
          .find(({ text }) => text === PLANTS.claim)!.key, what: "False: I sell nothing." }).toString() });
      expect(await posted.text()).toContain("That sentence is off the Atlas pages now");
    });
    expect((await source.read(async (reads) => await reads.personClaims!.listTakenOffMemory()))
      .flatMap(({ contextKeys }) => contextKeys ?? []))
      .toContain(`topic:${TOPIC.key}`);
  });
});

describe("the registration hand-over (Fable's change 2)", () => {
  it("never answers from a reading older than its keep time while the mark is on: it waits, or gives none", async () => {
    const { person, source, number } = await published();
    await new AtlasPersonReadingWorker({ source, store: person, reader: ruleReader(zentaroRule), capUsd: 1, now: () => NOW,
      signal: new AtlasChangeSignal(), log: () => undefined }).pass();
    const index = await loadAtlasSearchIndex(source, true);
    const question = "Does zentarine ease the tremor of Velmor syndrome?";
    for (const fresh of [false, true]) {
      let clock = 0;
      let loads = 0;
      const find = atlasNearFinder(source, { fresh, now: () => clock, keepMs: 1_000, waitMs: 5, retryMs: 50,
        // The first reading answers; the next one, as after a dispute, never comes in time.
        load: async () => loads++ === 0 ? index : await new Promise<never>(() => undefined) });
      expect((await find(question)).map(({ publication_number }) => publication_number)).toEqual([number]);
      clock = 1_001;
      expect((await find(question)).length).toBe(fresh ? 0 : 1);
    }
    // A reading that began keepMs ago or more is never handed over, even when it ends during a later wait (Codex's
    // check of this round): the second reading starts at 1,001, is still running at 2,002, then ends during the wait.
    let clock = 0;
    let loads = 0;
    let finishSecond: (index: typeof index) => void = () => undefined;
    const find = atlasNearFinder(source, { fresh: true, now: () => clock, keepMs: 1_000, waitMs: 40, retryMs: 50,
      load: async () => {
        loads += 1;
        if (loads === 1) return index;
        if (loads === 2) return await new Promise<typeof index>((resolve) => { finishSecond = resolve; });
        return await new Promise<never>(() => undefined);
      } });
    expect((await find(question)).length).toBe(1);
    clock = 1_001;
    expect(await find(question)).toEqual([]);
    clock = 2_002;
    setTimeout(() => finishSecond(index), 5);
    expect(await find(question)).toEqual([]);
    expect(loads).toBe(3);
  });
});

describe("an old finding that can't be read stops showing (Fable's change 3)", () => {
  it("hides an unread old finding once its reading is parked, and any finding still unread seven days after the switch", () => {
    const finding = personFinding({ publishedAt: "2026-11-18T12:00:00.000Z", claim: "Dr Invented Zentaro sells zentarine." });
    expect(view(finding, undefined)?.personClaims?.state).toBe("unread");
    const parked: AtlasPersonReading = { publicationNumber: finding.publicationNumber, digest: null, sentences: [],
      readAt: null, model: null, attemptDigest: personDigestOf(finding), attempts: 3, parked: true };
    expect(view(finding, parked)).toBeUndefined();
    // Parked for an earlier version of its text: the new one can still be read, so it shows under the banner meanwhile.
    expect(view(finding, { ...parked, attemptDigest: "0".repeat(64) })?.personClaims?.state).toBe("unread");
    expect(view(finding, undefined, { now: new Date("2026-11-26T07:59:59.000Z") })).toBeDefined();
    expect(view(finding, undefined, { now: new Date("2026-11-26T08:00:00.000Z") })).toBeUndefined();
    // A finding that was read shows as before.
    const rule: PersonRule = (text) => text.includes("Zentaro") ? "person|coi|-|-|-|n|n|n|-|Dr Invented Zentaro" : undefined;
    expect(view(finding, readingFor(finding, rule), { now: new Date("2026-12-01T00:00:00.000Z") })?.personClaims?.state)
      .toBe("read");
  });
});

describe("the origin line says only what is true (Fable's change 4)", () => {
  const POSTER = "Dr Ann Poster in Leeds sells zentarine from her clinic.";
  const forumRule: PersonRule = (text) => text === POSTER ? "person|coi|F|-|-|n|n|n|-|Dr Ann Poster" : undefined;
  const markOf = (finding: ShownFinding, rule: PersonRule) => view(finding, readingFor(finding, rule))!.personClaims!
    .segments.claim!.find((segment) => segment.type === "mark")! as Extract<NonNullable<ShownFinding["personClaims"]>["segments"][string][number], { type: "mark" }>;
  const thread = (n: string) => `https://www.reddit.com/r/velmor/comments/${n}/`;
  const forum = (threads: string[], threadsRead: number) => ({ communities: ["r/velmor"], threadsRead, threads,
    people: { better: 1, noChange: 0, worse: 0, mixed: 0 }, quality: { detailed: 1, measured: 0, bare: 0 }, mechanism: null,
    studies: "support_not_located" as const, studiesMeasured: null });

  it("links the one thread read, never one of several, and calls a video's link the video", () => {
    expect(markOf(personFinding({ claim: POSTER, forumSignal: forum([thread("one111")], 1) }), forumRule))
      .toMatchObject({ href: thread("one111"), hrefText: "the thread" });
    expect(markOf(personFinding({ claim: POSTER, forumSignal: forum([thread("one111"), thread("two222")], 2) }), forumRule).href)
      .toBeNull();
    expect(markOf(personFinding({ claim: POSTER, forumSignal: forum([thread("one111")], 3) }), forumRule).href).toBeNull();
    const video = "https://www.youtube.com/watch?v=abcdefghijk";
    const videoRule: PersonRule = (text) => text === POSTER ? "person|coi|V1|-|-|n|n|n|-|Dr Ann Poster" : undefined;
    expect(markOf(personFinding({ claim: POSTER, namedVideos: [video] }), videoRule))
      .toMatchObject({ href: video, hrefText: "the video" });
  });

  it("never gives the owner's change note the line about the AI that wrote the finding", () => {
    const note = "Dr Ann Poster was paid by Zentara Ltd for this review.";
    const finding = personFinding({ status: { kind: "checked", atlasNumber: "F-1001", checkedOn: "2026-11-19" } as ShownFinding["status"],
      ownerTexts: [{ path: NOTE_PATH, text: note }] });
    const rule: PersonRule = (text) => text === note ? "person|coi|-|-|-|n|n|n|-|Dr Ann Poster" : undefined;
    const shown = view(finding, readingFor(finding, rule))!;
    expect(shown.ownerTexts![0]!.text).toBe(`[${PERSON_LEFT_OUT}]`);
    expect(JSON.stringify(shown)).not.toContain("The AI that wrote this finding gave no source");
    const { personClaims: _view, ...machine } = machineFinding(shown);
    expect(JSON.stringify(machine)).not.toContain(note);
  });
});

describe("the backfill cap (the default for switch-on)", () => {
  it("reads at USD 5 for the first day after the switch, counted under its date, then at the daily cap", async () => {
    const caps: Array<[string, number, string]> = [];
    for (const [at, capUsd] of [["2026-11-20T07:59:59.000Z", 1], ["2026-11-20T08:00:00.000Z", 1],
      ["2026-11-19T09:30:00.000Z", 0], ["2026-11-19T09:30:00.000Z", 7]] as const) {
      const { person, source } = await published();
      const reserve = person.reserveSpend.bind(person);
      person.reserveSpend = async (input) => {
        caps.push([input.day, input.capUsd, at]);
        return await reserve(input);
      };
      await new AtlasPersonReadingWorker({ source, store: person, reader: ruleReader(zentaroRule), capUsd, since: SINCE,
        now: () => new Date(at), signal: new AtlasChangeSignal(), log: () => undefined }).pass();
    }
    expect(caps).toEqual([["2026-11-19", 5, "2026-11-20T07:59:59.000Z"], ["2026-11-20", 1, "2026-11-20T08:00:00.000Z"],
      ["2026-11-19", 0, "2026-11-19T09:30:00.000Z"],
      // Exactly USD 5 that first day, whatever the daily cap (Codex's check of this round).
      ["2026-11-19", 5, "2026-11-19T09:30:00.000Z"]]);
  });
});

describe("the privacy notice says who reads a dispute (Fable's change 5)", () => {
  it("says the automatic check never sends a dispute to an AI model, and that Claude reads disputes for the owner", async () => {
    const privacy = await readFile(new URL("../site/privacy/index.html", import.meta.url), "utf8");
    expect(privacy).not.toContain("AskRigor sends no dispute to an AI model");
    expect(privacy).toContain("AskRigor’s automatic check never sends a dispute’s message, link or email address to an AI " +
      "model. AskRigor’s operator handles disputes with Claude, an AI model from Anthropic, which reads disputes, with " +
      "any link and email address given with them, for AskRigor’s owner.");
    // The automatic check's bundle for a missed-claim report holds the sentence's number, never the report's words.
    const finding = personFinding({ claim: "Dr Ann Poster sells zentarine." });
    const bundle = personBundleOf(finding, [], personSentencesOf(finding)[0]!.key);
    expect(Object.keys(bundle).sort()).toEqual(["check_again", "cited", "forum", "sentences", "sources", "taken_off", "videos"]);
    expect(bundle.check_again).toBe(1);
  });
});
