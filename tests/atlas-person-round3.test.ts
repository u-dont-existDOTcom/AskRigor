import { describe, expect, it } from "vitest";

import { readFile } from "node:fs/promises";

import { InMemoryAtlasPersonClaims, type AtlasPageReads, type AtlasPersonReading, type AtlasPersonRemoval } from "@askrigor/evidence-repository";

import { glanceSubjectOf, markedFindings, type ShownFinding } from "../apps/research-mcp/src/atlas/page-data.js";
import { personRollbackNumbers } from "../apps/research-mcp/src/atlas/person-claims-admin.js";
import {
  PERSON_READING_RUBRIC,
  applyPersonClaims,
  personDisputeWanted,
  machineFinding,
  parsePersonReply,
  personBundleOf,
  personContextKeys,
  personDigestOf,
  personSentenceKey,
  relevantRemovalNumbers,
  type PersonClaimContext,
} from "../apps/research-mcp/src/atlas/person-claims.js";
import { deliverAtlasPersonNotices, personChargedUsd, personOwnerChannelFromEnv } from "../apps/research-mcp/src/atlas/person-reading.js";
import { personFinding, quoteLine, researchSource, ruleReply, type PersonRule } from "./helpers/atlas-person-fixtures.js";

// Atlas Release B, Codex's second review ("do not release") and the run-6 case: each of these failed before the
// round-3 fixes. Hermetic: the reading's replies are written by rule; the server's handling and the stores are real.
const SINCE = "2026-11-19T10:00:00.000Z";
const NOW = new Date("2026-11-19T13:00:00.000Z");
const COI = "Dr Invented Zentaro sells zentarine through his own company.";
const coiRule: PersonRule = (text) => text.includes("Zentaro") ? "person|coi|-|-|-|n|n|n|-|Dr Invented Zentaro" : undefined;

function readingFor(finding: ShownFinding, rule: PersonRule, removals: number[] = []): AtlasPersonReading {
  const bundle = personBundleOf(finding, []);
  const parsed = parsePersonReply(ruleReply(bundle, rule), finding, bundle);
  if (!parsed.ok) throw new Error(parsed.problem);
  return { publicationNumber: finding.publicationNumber, digest: personDigestOf(finding, removals),
    sentences: parsed.sentences, readAt: NOW.toISOString(), model: "claude-opus-5-5", attemptDigest: null, attempts: 0,
    parked: false };
}
const view = (finding: ShownFinding, reading: AtlasPersonReading | undefined, extra: Partial<PersonClaimContext> = {}) =>
  applyPersonClaims(finding, { since: SINCE, reading, removals: [], removedNames: [], now: NOW, ...extra });

describe("a kept quote that repeats an allegation (run 6 of the live set), judged by the reading, never by a word list", () => {
  const HADDAD = "Critics have alleged that Dr Omar Haddad concealed two serious adverse events.";
  const DECLARED = "Dr Ada Velmor holds shares in Zentara Ltd.";
  const CLAIM = "Dr Omar Haddad hid two serious adverse events from the trial's safety board.";
  const finding = personFinding({ claim: CLAIM, research: [
    researchSource("Questions over a supplement trial", [quoteLine(HADDAD, "News")], "10.1000/news.1"),
    researchSource("Zentarine for Velmor tremor", [quoteLine(DECLARED)], "10.1000/velmor.1")] });

  it("tells the reading how to label a kept quote, and marks one it says its source only reports", () => {
    expect(PERSON_READING_RUBRIC).toContain("repeating an allegation does not support it");
    const rule: PersonRule = (text) => text === HADDAD ? "person|misconduct|S1|S1.1a|reported|n|n|n|-|Dr Omar Haddad"
      : text === CLAIM ? "person|misconduct|S1|S1.1a|reported|n|n|n|-|Dr Omar Haddad"
        : text === DECLARED ? "person|coi|S2|S2.1a|own|y|n|n|-|Dr Ada Velmor" : undefined;
    const shown = view(finding, readingFor(finding, rule))!;
    const verdicts = new Map(shown.personClaims!.sentences.map(({ text, verdict }) => [text, verdict]));
    expect(verdicts.get(HADDAD)).toBe("unverified");
    expect(shown.research[0]!.lines[0]!.sentence).toBe("[Unverified claim of professional misconduct · An accusation " +
      `made in Questions over a supplement trial that AskRigor could not confirm. It might be false.] ${HADDAD}`);
    expect(machineFinding(shown).research[0]!.lines[0]!.sentence).not.toContain(HADDAD);
    expect(shown.personClaims!.noindex).toBe(true);
    // A declaration in the person's own source, in its own voice, stays the quote it is: no false mark.
    expect(shown.research[1]!.lines[0]!.sentence).toBe(DECLARED);
  });

  it("marks a quote about a person whose reading is doubtful (no source, not found, part only, or backed by another quote)", () => {
    for (const line of ["person|misconduct|-|-|-|n|n|n|-|Dr Omar Haddad", "person|misconduct|S1|-|notfound|n|n|n|-|Dr Omar Haddad",
      "unsure|other|S1|S1.1a|own|n|n|n|-|Dr Omar Haddad"]) {
      const shown = view(finding, readingFor(finding, (text) => text === HADDAD ? line : undefined))!;
      expect(shown.personClaims!.sentences.find(({ text }) => text === HADDAD)!.verdict, line).toBe("unverified");
    }
    const two = personFinding({ claim: CLAIM, research: [researchSource("Questions over a supplement trial",
      [quoteLine(HADDAD, "News"), quoteLine("The trial's board met twice.", "News")], "10.1000/news.1")] });
    const other = view(two, readingFor(two, (text) => text === HADDAD ? "person|misconduct|S1|S1.2a|own|y|n|n|-|Dr Omar Haddad"
      : undefined))!;
    expect(other.personClaims!.sentences.find(({ text }) => text === HADDAD)!.verdict).toBe("unverified");
  });

  it("never marks a quote for its words alone (Codex's third review: no word lists)", () => {
    const EXPENSES = "Dr Ada Velmor claimed travel expenses from Zentara Ltd.";
    const own = personFinding({ claim: "Zentarine halved the tremor score.",
      research: [researchSource("Zentarine for Velmor tremor", [quoteLine(EXPENSES)])] });
    const shown = view(own, readingFor(own, (text) => text === EXPENSES ? "person|coi|S1|S1.1a|own|y|n|n|-|Dr Ada Velmor"
      : undefined))!;
    expect(shown.research[0]!.lines[0]!.sentence).toBe(EXPENSES);
    // Shown as the quote it is, yet sourced: a dispute marks it as disputed rather than waiting unseen (Codex, round 3).
    const sentence = shown.personClaims!.sentences.find(({ text }) => text === EXPENSES)!;
    expect(sentence).toMatchObject({ verdict: "sourced", bare: true });
    expect(personDisputeWanted(sentence).wanted).toBe("marked_disputed");
    const disputed: AtlasPersonRemoval = { removalNumber: 3, publicationNumber: "P-1001", sentenceKey: personSentenceKey(EXPENSES),
      state: "disputed", foldedNames: [], changedAt: "2026-11-19T12:00:00.000Z" };
    expect(view(own, readingFor(own, (text) => text === EXPENSES ? "person|coi|S1|S1.1a|own|y|n|n|-|Dr Ada Velmor" : undefined),
      { removals: [disputed] })!.research[0]!.lines[0]!.sentence).toBe(
      `[Disputed (2026-11-19): someone told AskRigor this is wrong; AskRigor is rechecking it.] ${EXPENSES}`);
  });
});

describe("Codex's third review of B", () => {
  it("prints a source's title in another line only as the page finally shows it", () => {
    const TITLE = "Dr Ada Velmor holds shares in Zentara Ltd.";
    const QUOTE = "Dr Ada Velmor declared shares in Zentara Ltd.";
    const OTHER = "Dr Ada Velmor sells zentarine to her patients.";
    const finding = personFinding({ claim: OTHER, research: [researchSource(TITLE, [quoteLine(QUOTE)])] });
    const rule: PersonRule = (text) => text === TITLE || text === QUOTE ? "person|coi|S1|S1.1a|own|y|n|n|-|Dr Ada Velmor"
      : text === OTHER ? "person|coi|S1|-|notfound|n|n|n|-|Dr Ada Velmor" : undefined;
    const reading = readingFor(finding, rule);
    expect(view(finding, reading)!.claim).toContain(`The finding cites ${TITLE}, but AskRigor didn’t find this in it.`);
    // The quote that sourced the title is taken off elsewhere: the title follows it off, and no line prints it.
    const elsewhere: AtlasPersonRemoval = { removalNumber: 8, publicationNumber: "P-2002", sentenceKey: personSentenceKey(QUOTE),
      state: "taken_off", foldedNames: ["ada velmor"], changedAt: "2026-11-19T12:00:00.000Z" };
    const shown = view(finding, reading, { globalRemovals: [elsewhere] })!;
    expect(shown.claim).toContain("The finding cites a source, but AskRigor didn’t find this in it.");
    expect(JSON.stringify([shown.claim, shown.research, machineFinding(shown).claim])).not.toContain(TITLE);
  });

  it("gives the direct page a finding's change notes too, so its reading is current there", async () => {
    const store = new InMemoryAtlasPersonClaims();
    const note = `Corrected after a reader's report. ${COI}`;
    const accepted = personFinding({ claim: "Zentarine halved the tremor score.",
      status: { kind: "accepted", atlasNumber: "F-1001" } as unknown as ShownFinding["status"] });
    const withNote = { ...accepted, ownerTexts: [{ path: "change.corrected.2026-11-19T11:00:00.000Z", text: note }] };
    const reading = readingFor(withNote, coiRule);
    await store.saveReading({ publicationNumber: "P-1001", digest: reading.digest!, sentences: reading.sentences,
      model: "claude-opus-5-5", at: NOW.toISOString() });
    const reads = { personClaims: store.pageReads(SINCE), listChanges: async () => [{ atlasNumber: "F-1001",
      kind: "corrected", labelBefore: null, labelAfter: "checked", publicNote: note, decidedAt: "2026-11-19T11:00:00.000Z" }] } as
      unknown as AtlasPageReads;
    const [shown] = await markedFindings(reads, [structuredClone(accepted)]);
    expect(shown!.personClaims!.state).toBe("read");
    expect(shown!.personClaims!.readingDigest).toBe(reading.digest);
    expect(shown!.personClaims!.sentences.map(({ text }) => text)).toContain(COI);
  });

  it("never reads a finding with part of its removal memory", async () => {
    const migration = await readFile(new URL("../packages/evidence-repository/migrations/0042_atlas_person_readings.sql",
      import.meta.url), "utf8");
    const removed = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION atlas_person_removed_texts_for"),
      migration.indexOf("REVOKE ALL ON FUNCTION atlas_person_removed_texts_for"));
    expect(removed).not.toMatch(/LIMIT/u);
  });

  it("sends every dispute to the owner, a legal one flagged, whatever its language", async () => {
    const store = new InMemoryAtlasPersonClaims();
    await store.submitDispute({ idempotencyKey: "french-erasure-00001", publicationNumber: "P-1001",
      sentenceKey: personSentenceKey(COI), kind: "wrong", wanted: "queued", legal: false, addressKey: "e".repeat(64),
      foldedNames: [], contextKeys: [], sentence: COI, whatIsWrong: "Je demande l'effacement de mes données.",
      sourceLink: null, email: null, at: NOW.toISOString(), readingDigest: null, contentDigest: null });
    expect((await store.listNotices(10)).map(({ kind, disputeNumber }) => [kind, disputeNumber])).toEqual([["dispute", 1]]);
  });

  it("lets one call at a time run on a subject, whatever its digest", async () => {
    const store = new InMemoryAtlasPersonClaims();
    const claim = (digest: string) => store.claimReading({ publicationNumber: "P-1001", digest, again: false,
      at: NOW.toISOString(), limit: 3, leaseSeconds: 660 });
    expect((await claim("a".repeat(64))).claimed).toBe(true);
    expect((await claim("b".repeat(64))).claimed).toBe(false);
  });

  it("lists the owner's curated rows for withdrawal before a rollback, unread or with a claim left out", () => {
    const row = glanceSubjectOf({ publicId: "G-1001", categoryKey: "health", subcategoryKey: "sleep", rowClass: "practitioner",
      what: "The clinic programme", result: COI, comparison: null, followUp: null, limits: "One clinic.", sources: [],
      namesAPerson: false, state: "shown", proposedAt: NOW.toISOString(), shownAt: NOW.toISOString() });
    expect(personRollbackNumbers([row], new Map())).toEqual(["G-1001"]);
    const read = applyPersonClaims(row, { since: SINCE, reading: readingFor(row, coiRule), removals: [], removedNames: [],
      now: NOW, leaveOutUnverified: true, hideUnread: true })!;
    expect(read.personClaims!.sentences.some(({ verdict }) => verdict === "left_out")).toBe(true);
    expect(personRollbackNumbers([row], new Map([["G-1001", read]]))).toEqual(["G-1001"]);
    const plain = applyPersonClaims(row, { since: SINCE, reading: readingFor(row, () => undefined), removals: [],
      removedNames: [], now: NOW, leaveOutUnverified: true, hideUnread: true })!;
    expect(personRollbackNumbers([row], new Map([["G-1001", plain]]))).toEqual([]);
  });
});

describe("a source's words copied into another sentence's note (Codex's second review, new)", () => {
  const QUOTE = "Dr Ada Velmor holds shares in Zentara Ltd.";
  const CLAIM = "The lead author, Dr Ada Velmor, holds shares in the maker.";
  const finding = personFinding({ claim: CLAIM, research: [researchSource("Zentarine for Velmor tremor", [quoteLine(QUOTE)])] });
  const rule: PersonRule = (text) => text === CLAIM || text === QUOTE ? "person|coi|S1|S1.1a|own|y|n|n|-|Dr Ada Velmor"
    : undefined;

  it("never brings back a taken-off quote inside the note of a sentence it supports, page or machine", () => {
    const reading = readingFor(finding, rule);
    expect(view(finding, reading)!.claim).toContain(`says: “${QUOTE}”`);
    const elsewhere: AtlasPersonRemoval = { removalNumber: 7, publicationNumber: "P-2002", sentenceKey: personSentenceKey(QUOTE),
      state: "taken_off", foldedNames: ["ada velmor"], changedAt: "2026-11-19T12:00:00.000Z" };
    const shown = view(finding, reading, { globalRemovals: [elsewhere] })!;
    for (const text of [shown.claim, machineFinding(shown).claim, shown.research[0]!.lines[0]!.sentence!,
      machineFinding(shown).research[0]!.lines[0]!.sentence!]) {
      expect(text).not.toContain(QUOTE);
      expect(text).toContain("taken off here after it was disputed (2026-11-19)");
    }
  });

  it("gives up the note's quote when the quote itself is marked, and marks the sentence it supported", () => {
    const marked = readingFor(finding, (text) => text === QUOTE ? "person|coi|S1|S1.1a|reported|n|n|n|-|Dr Ada Velmor"
      : rule(text, undefined as never));
    const shown = view(finding, marked)!;
    expect(shown.claim).not.toContain(`says: “${QUOTE}”`);
    expect(shown.claim).toMatch(/^\[Unverified claim of a conflict of interest · An accusation made in Zentarine for Velmor tremor/u);
  });
});

describe("text the pages show outside the reading (Codex's second review, partly fixed)", () => {
  it("reads a finding's public change note with it, and marks an allegation in it on every route", () => {
    const note = `Corrected after a reader's report. ${COI}`;
    const finding = personFinding({ claim: "Zentarine halved the tremor score.",
      ownerTexts: [{ path: "change.corrected.2026-11-19T11:00:00.000Z", text: note }] });
    const reading = readingFor(finding, coiRule);
    expect(reading.sentences.some(({ label }) => label === "person")).toBe(true);
    const shown = view(finding, reading)!;
    expect(shown.ownerTexts![0]!.text).toMatch(/^Corrected after a reader's report\. \[Unverified claim of a conflict of interest · The AI/u);
    expect(machineFinding(shown).ownerTexts![0]!.text).not.toContain("Zentaro sells");
    expect(shown.personClaims!.noindex).toBe(true);
    // A new note changes the digest, so it waits for its reading rather than showing plain.
    const more = { ...finding, ownerTexts: [...finding.ownerTexts!, { path: "change.edited.2026-11-19T12:00:00.000Z", text: COI.replace("company", "firm") }] };
    expect(view(more, reading)!.ownerTexts![1]!.text).toContain("waiting for AskRigor’s check");
  });
});

describe("a removed claim coming back under another name or a role (Codex's second review, partly fixed)", () => {
  it("makes a removal relevant to findings of the same topic or sources, not only those holding its names", () => {
    const removedOn = personFinding({ claim: COI, research: [researchSource("A trial", [], "10.1000/shared.1")] });
    const memory = [{ removalNumber: 9, foldedNames: ["invented zentaro"], contextKeys: personContextKeys(removedOn) }];
    const role = personFinding({ publicationNumber: "P-1002", claim: "The trial's lead author sells zentarine himself.",
      topic: { key: "another-topic", label: "Another" }, research: [researchSource("A trial", [], "10.1000/shared.1")] });
    const sameTopic = personFinding({ publicationNumber: "P-1003", claim: "Its best-known promoter sells it from his clinic." });
    const unrelated = personFinding({ publicationNumber: "P-1004", claim: "Zinc eased colds.", topic: { key: "colds", label: "Colds" } });
    expect(relevantRemovalNumbers(role, memory)).toEqual([9]);
    expect(relevantRemovalNumbers(sameTopic, memory)).toEqual([9]);
    expect(relevantRemovalNumbers(unrelated, memory)).toEqual([]);
    // A read finding becomes stale with it, so it is read again with the removal's words.
    const reading = readingFor(sameTopic, () => undefined);
    expect(view(sameTopic, reading)!.personClaims!.state).toBe("read");
    expect(view(sameTopic, reading, { memory })!.personClaims!.state).toBe("stale");
  });
});

describe("the race between a removal and a change (Codex's second review, partly fixed)", () => {
  it("gives no reading to judge by while the page's reading is stale, so its dispute waits for the main session", async () => {
    const finding = personFinding({ claim: COI });
    const reading = readingFor(finding, coiRule);
    const changed = { ...finding, whyNotUsual: "Quick answers miss the nausea." };
    const shown = view(changed, reading)!;
    expect(shown.personClaims!.state).toBe("stale");
    expect(shown.personClaims!.sentences.find(({ text }) => text === COI)!.verdict).toBe("unverified");
    expect(shown.personClaims!.readingDigest).toBeNull();
    expect(view(finding, reading)!.personClaims!.readingDigest).toBe(reading.digest);
    const store = new InMemoryAtlasPersonClaims();
    await store.saveReading({ publicationNumber: "P-1001", digest: reading.digest!, sentences: reading.sentences,
      model: "claude-opus-5-5", at: NOW.toISOString() });
    const result = await store.submitDispute({ idempotencyKey: "race-dispute-0000001", publicationNumber: "P-1001",
      sentenceKey: personSentenceKey(COI), kind: "wrong", wanted: "taken_off", legal: false, addressKey: "a".repeat(64),
      foldedNames: ["invented zentaro"], contextKeys: [], sentence: COI, whatIsWrong: "False.", sourceLink: null,
      email: null, at: NOW.toISOString(), readingDigest: shown.personClaims!.readingDigest,
      contentDigest: shown.personClaims!.contentDigest });
    expect(result.outcome).toBe("queued");
  });
});

describe("owner delivery, the public change history and owner rechecks (Codex's reviews, still open)", () => {
  const dispute = (store: InMemoryAtlasPersonClaims, key: string, legal: boolean, digest: string | null) =>
    store.submitDispute({ idempotencyKey: key, publicationNumber: "P-1001", sentenceKey: personSentenceKey(COI),
      kind: "wrong", wanted: "taken_off", legal, addressKey: "b".repeat(64), foldedNames: ["invented zentaro"],
      contextKeys: ["topic:velmor-syndrome"], sentence: COI, whatIsWrong: "My solicitor will write. Private words.",
      sourceLink: "https://example.org/private", email: "me@example.org", at: NOW.toISOString(), readingDigest: digest,
      contentDigest: digest === null ? null : "f".repeat(64) });

  it("sends a legal notice to the owner's channel, signed and without the dispute's words, until he acknowledges it", async () => {
    const store = new InMemoryAtlasPersonClaims();
    await dispute(store, "legal-dispute-000001", true, null);
    expect((await store.listNotices(10)).map(({ kind }) => kind)).toEqual(["legal"]);
    const secret = Buffer.alloc(32, 7).toString("base64url");
    const channel = personOwnerChannelFromEnv({ ASKRIGOR_ATLAS_PERSON_NOTICE_URL: "https://owner.example/hook",
      ASKRIGOR_ATLAS_PERSON_NOTICE_SECRET: secret })!;
    expect(personOwnerChannelFromEnv({ ASKRIGOR_ATLAS_PERSON_NOTICE_URL: "http://owner.example/hook",
      ASKRIGOR_ATLAS_PERSON_NOTICE_SECRET: secret })).toBeUndefined();
    const sent: Array<{ body: string; signature: string }> = [];
    let up = false;
    const fetch = (async (_url: string, init: RequestInit) => {
      sent.push({ body: String(init.body), signature: String((init.headers as Record<string, string>)["x-askrigor-signature"]) });
      return new Response(null, { status: up ? 204 : 503 });
    }) as unknown as typeof globalThis.fetch;
    let clock = NOW.getTime();
    const now = () => new Date(clock);
    expect(await deliverAtlasPersonNotices(store, channel, { fetch, now, log: () => undefined })).toEqual({ delivered: 0, failed: 1 });
    // The failed send waits, then goes again.
    expect(await deliverAtlasPersonNotices(store, channel, { fetch, now, log: () => undefined })).toEqual({ delivered: 0, failed: 0 });
    up = true;
    clock += 3 * 60_000;
    expect(await deliverAtlasPersonNotices(store, channel, { fetch, now, log: () => undefined })).toEqual({ delivered: 1, failed: 0 });
    expect(sent).toHaveLength(2);
    expect(sent[1]!.body).not.toMatch(/solicitor|Private|example\.org|Zentaro/u);
    expect(JSON.parse(sent[1]!.body)).toMatchObject({ kind: "legal", subject: "P-1001", dispute: 1 });
    expect(sent[1]!.signature).toMatch(/^sha256=[a-f0-9]{64}$/u);
    // Delivered but not acknowledged: again a day later; acknowledged: never again.
    clock += 60 * 60_000;
    expect((await deliverAtlasPersonNotices(store, channel, { fetch, now, log: () => undefined })).delivered).toBe(0);
    clock += 24 * 60 * 60_000;
    expect((await deliverAtlasPersonNotices(store, channel, { fetch, now, log: () => undefined })).delivered).toBe(1);
    expect(await store.recordNotice(1, "acknowledged", "owner", now().toISOString())).toBe(true);
    clock += 48 * 60 * 60_000;
    expect((await deliverAtlasPersonNotices(store, channel, { fetch, now, log: () => undefined })).delivered).toBe(0);
    expect(await store.listNotices(10)).toEqual([]);
    // With no channel, nothing is sent and the log says what waits.
    await dispute(store, "legal-dispute-000002", true, null);
    const log: string[] = [];
    await deliverAtlasPersonNotices(store, undefined, { now, log: (line) => log.push(line) });
    expect(log).toEqual(["owner_channel_not_set waiting=1 legal=1"]);
  });

  it("records each removal in the public history, and puts a finding the owner checked back before him", async () => {
    const store = new InMemoryAtlasPersonClaims();
    store.ownerChecked.add("P-1001");
    const finding = personFinding({ claim: COI });
    const reading = readingFor(finding, coiRule);
    await store.saveReading({ publicationNumber: "P-1001", digest: reading.digest!, sentences: reading.sentences,
      model: "claude-opus-5-5", at: NOW.toISOString() });
    expect((await dispute(store, "history-dispute-0001", false, reading.digest)).outcome).toBe("taken_off");
    const changes = await store.pageReads(SINCE).listPersonChanges(10);
    expect(changes).toEqual([{ changeNumber: 1, subjectKind: "publication", publicationNumber: "P-1001", state: "taken_off",
      changedAt: NOW.toISOString() }]);
    expect(JSON.stringify(changes)).not.toMatch(/Zentaro|solicitor/u);
    expect((await store.listNotices(10)).map(({ kind, detail }) => [kind, detail])).toEqual([["recheck", "taken_off"],
      ["dispute", null]]);
    expect((await store.pageReads(SINCE).listTakenOffMemory())[0]!.contextKeys).toEqual(["topic:velmor-syndrome"]);
  });
});

describe("the live test's spend after a transport error (Codex's second review, new)", () => {
  it("counts a call that failed in transport at its whole reservation, as the worker does", () => {
    expect(personChargedUsd({ failure: "error", costUsd: 0 }, 0.08)).toBe(0.08);
    expect(personChargedUsd({ failure: "timeout", costUsd: 0 }, 0.08)).toBe(0.08);
    expect(personChargedUsd({ failure: null, costUsd: 0.003 }, 0.08)).toBe(0.003);
    expect(personChargedUsd({ failure: "refusal", costUsd: 0.002 }, 0.08)).toBe(0.002);
  });
});

describe("Codex's fourth review of B", () => {
  const COI_KEY = personSentenceKey(COI);
  async function removed() {
    const store = new InMemoryAtlasPersonClaims();
    const finding = personFinding({ claim: COI });
    const reading = readingFor(finding, coiRule);
    await store.saveReading({ publicationNumber: "P-1001", digest: reading.digest!, sentences: reading.sentences,
      model: "claude-opus-5-5", at: NOW.toISOString() });
    const result = await store.submitDispute({ idempotencyKey: "pending-removal-0001", publicationNumber: "P-1001",
      sentenceKey: COI_KEY, kind: "wrong", wanted: "taken_off", legal: false, addressKey: "a".repeat(64),
      foldedNames: ["invented zentaro"], contextKeys: [], sentence: COI, whatIsWrong: "False.", sourceLink: null, email: null,
      at: NOW.toISOString(), readingDigest: reading.digest, contentDigest: "d".repeat(64) });
    expect(result.outcome).toBe("taken_off");
    const decide = (action: "requeue" | "take_off", at: string, disputeNumber: number | null) => store.decide({
      publicationNumber: "P-1001", sentenceKey: COI_KEY, action, sentence: action === "take_off" ? COI : null,
      foldedNames: [], contextKeys: [], disputeNumber, resolution: action, at });
    const state = async () => (await store.pageReads(SINCE).readRemovals(["P-1001"]))[0]!.state;
    return { store, decide, state, dispute: result.disputeNumber! };
  }

  it("never lets a removal's check undo a newer decision, nor act twice", async () => {
    const owner = await removed();
    // The owner takes the sentence off himself before the check runs: the check can no longer put it back.
    expect(await owner.decide("take_off", "2026-11-19T13:05:00.000Z", owner.dispute)).toBe(true);
    expect(await owner.store.listUncheckedRemovals(10)).toEqual([]);
    expect(await owner.decide("requeue", "2026-11-19T13:06:00.000Z", owner.dispute)).toBe(false);
    expect(await owner.state()).toBe("taken_off");
    // Two checks of one pending removal: the first hands it back, the second does nothing.
    const twice = await removed();
    expect(await twice.decide("requeue", "2026-11-19T13:05:00.000Z", twice.dispute)).toBe(true);
    expect(await twice.state()).toBe("restored");
    expect(await twice.decide("requeue", "2026-11-19T13:06:00.000Z", twice.dispute)).toBe(false);
  });

  it("lets no failure or save of one digest end another digest's running call", async () => {
    const store = new InMemoryAtlasPersonClaims();
    const at = NOW.toISOString();
    expect((await store.claimReading({ publicationNumber: "P-1001", digest: "a".repeat(64), again: false, at, limit: 3,
      leaseSeconds: 660 })).claimed).toBe(true);
    await store.recordFailure({ publicationNumber: "P-1001", digest: "b".repeat(64), at, limit: 3, reason: "too_long" });
    await store.saveReading({ publicationNumber: "P-1001", digest: "c".repeat(64), sentences: [], model: "m", at });
    expect((await store.claimReading({ publicationNumber: "P-1001", digest: "b".repeat(64), again: false, at, limit: 3,
      leaseSeconds: 660 })).claimed).toBe(false);
  });
});

