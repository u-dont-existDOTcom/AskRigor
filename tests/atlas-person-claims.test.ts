import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InMemoryAtlasPersonClaims, type AtlasPersonReading, type AtlasPersonRemoval } from "@askrigor/evidence-repository";

import {
  ATLAS_PERSON_SENSITIVE_GROUP,
  IT_MIGHT_BE_FALSE,
  PERSON_UNREAD_BANNER,
  PERSON_WAITING,
  applyPersonClaims,
  machineFinding,
  parsePersonReply,
  personBundleOf,
  personDigestOf,
  personDisputeWanted,
  personSentenceKey,
  personSentencesOf,
} from "../apps/research-mcp/src/atlas/person-claims.js";
import { personDisputeOf } from "../apps/research-mcp/src/atlas/person-dispute-pages.js";
import type { ShownFinding } from "../apps/research-mcp/src/atlas/page-data.js";
import {
  forumSignal,
  personFinding,
  quoteLine,
  researchSource,
  ruleReply,
  type PersonRule,
} from "./helpers/atlas-person-fixtures.js";

// Atlas Release B's acceptance (design of 19 Nov 2026, sections 4, 5.3 and 7; owner-356a-and-wording.md; Fable's recheck,
// its seven required changes), hermetic: the reading's replies are written by rule, the server's handling is real.
const SINCE = "2026-11-19T10:00:00.000Z";
const NOW = new Date("2026-11-19T13:00:00.000Z");
const COI = "Dr Invented Zentaro sells zentarine through his own company.";

function readingFor(finding: ShownFinding, rule: PersonRule,
  removed: Array<{ removalNumber: number; sentence: string }> = []): AtlasPersonReading {
  const bundle = personBundleOf(finding, removed);
  const parsed = parsePersonReply(ruleReply(bundle, rule), finding, bundle);
  if (!parsed.ok) throw new Error(`reading rejected: ${parsed.problem}`);
  return { publicationNumber: finding.publicationNumber, digest: personDigestOf(finding), sentences: parsed.sentences,
    readAt: NOW.toISOString(), model: "claude-opus-5-5", attemptDigest: null, attempts: 0, parked: false };
}

const view = (finding: ShownFinding, reading: AtlasPersonReading | undefined,
  extra: { removals?: AtlasPersonRemoval[]; removedNames?: string[] } = {}) =>
  applyPersonClaims(finding, { since: SINCE, reading, removals: extra.removals ?? [], removedNames: extra.removedNames ?? [],
    now: NOW });

const zentaro: PersonRule = (text) => text.includes("Zentaro") ? "person|coi|-|-|-|n|n|n|-|Dr Invented Zentaro" : undefined;

describe("the sentences a reading labels, and the digest it is bound to", () => {
  it("numbers every text a route shows, source titles included, each sentence once", () => {
    const finding = personFinding({
      claim: `Zentarine halved the tremor score. ${COI}`,
      whyNotUsual: "Quick answers miss the harms.",
      contested: [{ atlasNumber: "F-1002", publicationNumber: null, disagreement: "The dose differs." }],
      research: [researchSource("The Velmor trial", [quoteLine("The trial was funded by Zentara Ltd.")])],
      forumSignal: forumSignal("People say it calms the hands."),
      challenge: { usualView: "Guidelines advise against it.", sourceUrl: "https://example.org/g", sourceLabel: "A guideline",
        verdict: "pass" },
    });
    const texts = personSentencesOf(finding).map(({ text, paths }) => [text, paths]);
    expect(texts).toEqual([
      ["Zentarine halved the tremor score.", ["claim"]], [COI, ["claim"]],
      ["Quick answers miss the harms.", ["whyNotUsual"]], ["The dose differs.", ["contested.0.disagreement"]],
      ["The Velmor trial", ["research.0.title"]], ["It is one trial.", ["research.0.lines.0.against"]],
      ["People say it calms the hands.", ["forum.mechanism"]], ["Guidelines advise against it.", ["challenge.usualView"]],
      ["A guideline", ["challenge.sourceLabel"]],
    ]);
    // A kept quote is evidence, not a sentence to label: it is the source's own words.
    expect(texts.flat(2)).not.toContain("The trial was funded by Zentara Ltd.");
  });

  it("changes when any shown text or any evidence changes, and only then", () => {
    const finding = personFinding({ claim: COI, research: [researchSource("The Velmor trial", [quoteLine("Funded by Zentara.")])] });
    const digest = personDigestOf(finding);
    expect(personDigestOf(structuredClone(finding))).toBe(digest);
    expect(personDigestOf({ ...finding, whatWouldChangeIt: "A second trial." })).not.toBe(digest);
    expect(personDigestOf({ ...finding, research: [{ ...finding.research[0]!, retraction: "retracted" }] })).not.toBe(digest);
    expect(personDigestOf({ ...finding, research: [researchSource("The Velmor trial", [quoteLine("Funded by Zentara Ltd.")])] }))
      .not.toBe(digest);
  });
});

describe("strict validation of a reading (design 4.7)", () => {
  const finding = personFinding({ claim: `Zentarine halved the tremor score. ${COI}` });
  const bundle = personBundleOf(finding, []);
  it("rejects a reply that doesn't parse, or misses, repeats or adds a number, or leaves a set", () => {
    for (const [reply, problem] of [
      ["not json", "unparsable"], [{ r: ["1|none"] }, "count"], [{ r: ["1|none", "1|none"] }, "number"],
      [{ r: ["1|none", "2|none", "3|none"] }, "count"], [{ r: ["1|none", "2|famous"] }, "label"],
      [{ r: ["1|none", "2|person|gossip|-|-|-|n|n|n|-|X"] }, "field"],
      [{ r: ["1|none", "2|person|coi|S9|-|-|n|n|n|-|X"] }, "field"], [{ r: ["1|none", "2|person|coi"] }, "field"],
    ] as const) {
      expect(parsePersonReply(reply, finding, bundle), JSON.stringify(reply)).toEqual({ ok: false, problem });
    }
  });

  it("counts unsure as a claim about a person, and accepts an all-none reading that marks nothing", () => {
    const unsure = view(finding, readingFor(finding, (text) => text.includes("Zentaro") ? "unsure|other|-|-|-|n|n|n|-|" : undefined))!;
    expect(unsure.claim).toBe(`Zentarine halved the tremor score. [Unverified claim · The AI that wrote this finding gave no source for it, and AskRigor found none. ${IT_MIGHT_BE_FALSE}] ${COI}`);
    expect(unsure.personClaims!.noindex).toBe(true);
    const none = view(finding, readingFor(finding, () => undefined))!;
    expect(none.claim).toBe(finding.claim);
    expect(none.personClaims).toMatchObject({ state: "read", noindex: false, banner: null, neutralTitle: null });
  });
});

describe("the server's verdict and its fixed words (design 4.2-4.4; the owner's 356a and wording)", () => {
  const trial = (lines = [quoteLine("The authors declare that Dr Ada Velmor holds shares in Zentara Ltd.")]) =>
    researchSource("The Velmor trial", lines);

  it("is sourced only with a kept quote, an openable source, its own statement, and every claim supported", () => {
    const one = "Dr Ada Velmor holds shares in Zentara Ltd, the maker.";
    const two = "Dr Ada Velmor holds shares in Zentara Ltd and faked the trial data.";
    const finding = personFinding({ claim: `${one} ${two}`, research: [trial()] });
    const shown = view(finding, readingFor(finding, (text) => text === one ? "person|coi|S1|S1.1a|own|y|n|n|-|Dr Ada Velmor"
      : text === two ? "person|fraud|S1|S1.1a|own|n|n|n|-|Dr Ada Velmor" : undefined))!;
    expect(shown.claim).toBe(`${one} [The Velmor trial, 2021, says: “The authors declare that Dr Ada Velmor holds shares in Zentara Ltd.”] ` +
      `[Unverified claim of fraud · The Velmor trial supports only part of this sentence. ${IT_MIGHT_BE_FALSE}] ${two}`);
    // Never "confirmed" or "true".
    expect(shown.claim).not.toMatch(/confirmed|true/iu);
  });

  it("writes only the line the server's records allow, and never a word of the model's", () => {
    const sentence = "The lead author takes money from Zentara.";
    const cases: Array<[string, Partial<ShownFinding>, string]> = [
      ["person|coi|F|-|-|n|n|n|-|SECRETWHO", { forumSignal: forumSignal() },
        "Unverified claim of a conflict of interest · It comes from a Reddit thread; AskRigor found no source it could open that supports it."],
      ["person|other|V1|-|-|n|n|n|-|SECRETWHO", { namedVideos: ["https://www.youtube.com/watch?v=abcdefghijk"] },
        "Unverified claim · It comes from a video; AskRigor couldn’t check that the video says this."],
      ["person|coi|S1|-|notfound|n|n|n|-|SECRETWHO", { research: [trial()] },
        "Unverified claim of a conflict of interest · The finding cites The Velmor trial, but AskRigor didn’t find this in it."],
      ["person|misconduct|S1|S1.1a|reported|n|n|n|-|SECRETWHO", { research: [trial()] },
        "Unverified claim of professional misconduct · An accusation made in The Velmor trial that AskRigor could not confirm."],
      ["person|health|S1|S1.1a|reported|n|n|n|-|SECRETWHO", { research: [trial()] },
        "Unverified claim about health · A claim made in The Velmor trial that AskRigor could not confirm."],
      ["person|coi|S1|S1.1a|else|n|n|n|-|SECRETWHO", { research: [trial()] },
        "Unverified claim of a conflict of interest · AskRigor found the quoted words in The Velmor trial, but they don’t say this."],
      ["person|coi|S1|S1.1a|otherwise|n|n|n|-|SECRETWHO", { research: [trial()] },
        "Unverified claim of a conflict of interest · The Velmor trial says otherwise."],
      ["person|coi|S1|-|notfound|n|n|n|-|SECRETWHO", { research: [{ ...trial(), source: { identifiers: [], title: "A report", year: null } }] },
        "Unverified claim of a conflict of interest · The source cited for it can’t be opened."],
      ["person|crime|-|-|-|n|n|n|-|SECRETWHO", {},
        "Unverified claim of a crime · The AI that wrote this finding gave no source for it, and AskRigor found none."],
      ["person|sex|-|-|-|n|n|y|-|SECRETWHO", {},
        "Unverified claim about sex life · The AI that wrote this finding gave no source for it, and AskRigor found none."],
    ];
    for (const [line, fields, mark] of cases) {
      const finding = personFinding({ claim: sentence, ...fields });
      const shown = view(finding, readingFor(finding, (text) => text === sentence ? line : undefined))!;
      expect(shown.claim, line).toBe(`[${mark} ${IT_MIGHT_BE_FALSE}] ${sentence}`);
      expect(JSON.stringify(shown), line).not.toContain("SECRETWHO");
    }
  });

  it("marks a source title that is itself a claim, and never quotes it in another sentence's line (Fable 4.5)", () => {
    const title = "Dr Ada Velmor exposed as a fraud";
    const finding = personFinding({ claim: "Dr Ada Velmor ran the only trial.",
      research: [researchSource(title, [quoteLine("The trial ran in 2020.")])] });
    const shown = view(finding, readingFor(finding, (text) => text === title ? "person|fraud|S1|-|notfound|n|n|n|-|Dr Ada Velmor"
      : "person|other|S1|-|notfound|n|n|n|-|Dr Ada Velmor"))!;
    expect(shown.research[0]!.source.title).toBe(`[Unverified claim of fraud · It is the title of a source the finding cites; ` +
      `AskRigor found nothing it could open that supports it. ${IT_MIGHT_BE_FALSE}] ${title}`);
    expect(shown.claim).toBe("[Unverified claim · The finding cites a source, but AskRigor didn’t find this in it. " +
      `${IT_MIGHT_BE_FALSE}] Dr Ada Velmor ran the only trial.`);
  });

  it("shows claims of crime, fraud, misconduct, health and sex life with the mark, as the owner chose (356a)", () => {
    expect(ATLAS_PERSON_SENSITIVE_GROUP).toBe("show_marked");
    const sentences = ["Dr Ada Velmor was convicted of assault.", "Dr Ada Velmor has advanced cancer.",
      "Dr Ada Velmor had an affair with a patient.", "Reddit user u/tremorfan sells fake zentarine."];
    const finding = personFinding({ claim: sentences.join(" ") });
    const shown = view(finding, readingFor(finding, (text) => text.includes("convicted") ? "person|crime|-|-|-|n|n|n|-|Dr Ada Velmor"
      : text.includes("cancer") ? "person|health|-|-|-|n|n|n|-|Dr Ada Velmor"
        : text.includes("affair") ? "person|sex|-|-|-|n|n|n|-|Dr Ada Velmor" : "person|fraud|-|-|-|n|n|y|-|u/tremorfan"))!;
    for (const sentence of sentences) expect(shown.claim).toContain(`${IT_MIGHT_BE_FALSE}] ${sentence}`);
    expect(shown.personClaims!.neutralTitle).toBe("Velmor syndrome: a finding with an unverified claim about a named person");
  });
});

describe("unread, stale, disputed and machine-read (Fable's changes 1, 2, 4; design 4.6)", () => {
  it("shows nothing of a finding first published after the mark until it is read", () => {
    expect(view(personFinding({ claim: COI }), undefined)).toBeUndefined();
    expect(view(personFinding({ claim: COI }), { publicationNumber: "P-1001", digest: null, sentences: [], readAt: null,
      model: null, attemptDigest: "a".repeat(64), attempts: 3, parked: true })).toBeUndefined();
  });

  it("shows one on the pages before the mark under the banner, out of search, with taken-off names hidden", () => {
    const finding = personFinding({ claim: `Zentarine halved the tremor score. ${COI}`, publishedAt: "2026-11-01T09:00:00.000Z" });
    const shown = view(finding, undefined, { removedNames: ["dr invented zentaro"] })!;
    expect(shown.personClaims).toMatchObject({ state: "unread", banner: PERSON_UNREAD_BANNER, noindex: true,
      neutralTitle: "Velmor syndrome: a finding not yet checked for claims about people" });
    expect(shown.claim).toBe(`Zentarine halved the tremor score. [${PERSON_WAITING}]`);
    expect(machineFinding(shown).claim).toBe(`[${PERSON_UNREAD_BANNER}] Zentarine halved the tremor score. [${PERSON_WAITING}]`);
  });

  it("keeps the labels of unchanged sentences when a read finding changes, and holds back the changed ones", () => {
    const finding = personFinding({ claim: `Zentarine halved the tremor score. ${COI}` });
    const reading = readingFor(finding, zentaro);
    const changed = view({ ...finding, claim: `Zentarine halved the tremor score. ${COI} Dr Invented Zentaro also owns the clinic.` }, reading)!;
    expect(changed.personClaims!.state).toBe("stale");
    expect(changed.claim).toMatch(/^Zentarine halved the tremor score\. \[Unverified claim of a conflict of interest · .*\] Dr Invented Zentaro sells zentarine through his own company\. \[A sentence here is waiting/u);
    // New evidence: a claim's support may change, so it waits; a sentence with no claim keeps its label.
    const evidence = view({ ...finding, research: [researchSource("The Velmor trial", [quoteLine("Zentaro owns Zentara.")])] }, reading)!;
    expect(evidence.claim).toBe(`Zentarine halved the tremor score. [${PERSON_WAITING}]`);
  });

  it("takes off a disputed sentence everywhere, shows a sourced one as disputed, and keeps a repeat off", () => {
    const owned = "Dr Ada Velmor holds shares in Zentara Ltd.";
    const finding = personFinding({ claim: `${COI} ${owned}`, whyNotUsual: COI,
      research: [researchSource("The Velmor trial", [quoteLine("Dr Ada Velmor holds shares in Zentara Ltd.")])] });
    const reading = readingFor(finding, (text) => text === owned ? "person|coi|S1|S1.1a|own|y|n|n|-|Dr Ada Velmor"
      : zentaro(text, personBundleOf(finding, [])));
    const removals: AtlasPersonRemoval[] = [
      { removalNumber: 1, publicationNumber: "P-1001", sentenceKey: personSentenceKey(COI), state: "taken_off",
        foldedNames: ["dr invented zentaro"], changedAt: "2026-11-19T12:30:00.000Z" },
      { removalNumber: 2, publicationNumber: "P-1001", sentenceKey: personSentenceKey(owned), state: "disputed",
        foldedNames: [], changedAt: "2026-11-19T12:40:00.000Z" }];
    const shown = view(finding, reading, { removals })!;
    const off = "[A claim about a named person was taken off here after it was disputed (2026-11-19). It comes back only if a source supports it.]";
    expect(shown.claim).toBe(`${off} [Disputed (2026-11-19): someone told AskRigor this is wrong; AskRigor is rechecking it.] ` +
      `${owned} [The Velmor trial, 2021, says: “Dr Ada Velmor holds shares in Zentara Ltd.”]`);
    expect(shown.whyNotUsual).toBe(off);
    // Another finding repeating the taken-off claim starts out taken off.
    const other = personFinding({ publicationNumber: "P-1002", claim: "Zentaro sells zentarine via his company." });
    const repeat = view(other, readingFor(other, () => "person|coi|-|-|-|n|n|n|T1|Zentaro", [{ removalNumber: 1, sentence: COI }]),
      { removals })!;
    expect(repeat.claim).toBe(off);
  });

  it("leaves an unverified claim about a person out of machine-read text, with a line; a company's stays marked", () => {
    const company = "Zentara Ltd paid for all three trials.";
    const finding = personFinding({ claim: `${COI} ${company}` });
    const shown = view(finding, readingFor(finding, (text) => text === company ? "organization|coi|-|-|-|n|n|n|-|Zentara Ltd"
      : zentaro(text, personBundleOf(finding, []))))!;
    const machine = machineFinding(shown);
    expect(machine.claim).toBe("[Left out here: an unverified claim of a conflict of interest about a named person. No " +
      "source AskRigor could open supports it; the finding’s page shows it with its mark.] [Unverified claim of a conflict " +
      `of interest · The AI that wrote this finding gave no source for it, and AskRigor found none. ${IT_MIGHT_BE_FALSE}] ${company}`);
    expect(machine.claim).not.toContain("Zentaro");
  });
});

describe("disputes (design 4.6; Fable's changes 3 and 7, and its point 2.3)", () => {
  const exoneration = "Dr Invented Zentaro was later cleared of fraud.";
  const company = "Zentara Ltd paid for all three trials.";
  const finding = personFinding({ claim: `${COI} ${exoneration} ${company} Zentarine halved the tremor score.` });
  const shown = view(finding, readingFor(finding, (text) => text === exoneration ? "person|fraud|-|-|-|n|y|n|-|Dr Invented Zentaro"
    : text === company ? "organization|coi|-|-|-|n|n|n|-|Zentara Ltd" : zentaro(text, personBundleOf(finding, []))))!;
  const sentence = (text: string) => shown.personClaims!.sentences.find((entry) => entry.text === text)!;

  it("takes an unsupported claim off at once, but never one that helps the person or a company's", () => {
    expect(personDisputeWanted(sentence(COI))).toEqual({ kind: "wrong", wanted: "taken_off" });
    expect(personDisputeWanted(sentence(exoneration))).toEqual({ kind: "wrong", wanted: "queued" });
    expect(personDisputeWanted(sentence(company))).toEqual({ kind: "wrong", wanted: "queued" });
    expect(personDisputeWanted(sentence("Zentarine halved the tremor score."))).toEqual({ kind: "missed", wanted: "queued" });
  });

  it("reads the form strictly, flags a legal letter or data request, and keeps only a daily key of the address", () => {
    const form = (fields: Record<string, string>) => new URLSearchParams({ token: "t".repeat(24),
      sentence: personSentenceKey(COI), what: "This is false.", ...fields });
    const ok = personDisputeOf(form({ what: "My solicitor says this is defamatory." }), shown, "203.0.113.9", NOW);
    expect(ok).toMatchObject({ ok: true, input: { wanted: "taken_off", legal: true, sentence: COI } });
    if (!ok.ok) throw new Error("form");
    expect(ok.input.addressKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(ok.input.addressKey).not.toContain("203.0.113.9");
    expect(personDisputeOf(form({ legal: "yes" }), shown, "a", NOW)).toMatchObject({ ok: true, input: { legal: true } });
    expect(personDisputeOf(form({ link: "javascript:alert(1)" }), shown, "a", NOW)).toEqual({ ok: false, problem: "link" });
    expect(personDisputeOf(form({ email: "not an email" }), shown, "a", NOW)).toEqual({ ok: false, problem: "email" });
    expect(personDisputeOf(form({ sentence: "0".repeat(64) }), shown, "a", NOW)).toEqual({ ok: false, problem: "sentence" });
  });

  it("is one dispute when sent twice, keeps the day's limits and the site-wide ceiling, and lists legal mail first", async () => {
    const store = new InMemoryAtlasPersonClaims();
    const key = (value: string) => createHash("sha256").update(value).digest("hex");
    const input = (index: number, extra: Partial<Parameters<InMemoryAtlasPersonClaims["submitDispute"]>[0]> = {}) => ({
      idempotencyKey: `dispute-key-${String(index).padStart(6, "0")}`, publicationNumber: "P-1001",
      sentenceKey: key(`sentence ${index}`), kind: "wrong" as const, wanted: "taken_off" as const, legal: false,
      addressKey: key(`address ${index}`), foldedNames: [], sentence: `Sentence ${index}.`, whatIsWrong: "Wrong.",
      sourceLink: null, email: null, at: "2026-11-19T12:00:00.000Z", ...extra });
    const first = await store.submitDispute(input(0));
    expect(first).toEqual({ outcome: "taken_off", disputeNumber: 1, duplicate: false });
    expect(await store.submitDispute(input(0))).toEqual({ outcome: "taken_off", disputeNumber: 1, duplicate: true });
    for (let index = 1; index < 20; index += 1) expect((await store.submitDispute(input(index))).outcome).toBe("taken_off");
    expect((await store.submitDispute(input(20))).outcome).toBe("over_ceiling");
    const address = key("one address");
    for (let index = 21; index < 26; index += 1) {
      expect((await store.submitDispute(input(index, { addressKey: address, wanted: "queued" }))).outcome).toBe("queued");
    }
    expect((await store.submitDispute(input(26, { addressKey: address, wanted: "queued" }))).outcome).toBe("limited");
    await store.submitDispute(input(27, { legal: true, wanted: "queued" }));
    expect((await store.listQueue(50))[0]).toMatchObject({ legal: true, whatIsWrong: "Wrong." });
    expect(await store.purgeDisputes("2026-11-20T00:00:00.000Z")).toBe(27);
    // The short record stays after the text goes (Fable 4.7).
    expect((await store.listQueue(50))[0]).toMatchObject({ legal: true, whatIsWrong: null, email: null,
      sentence: "Sentence 27." });
  });
});
