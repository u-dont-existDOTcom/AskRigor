import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { coreSectionNames, getProtocolManifest, loadProtocolSectionSnapshot, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  undoBookReviewsUniversal, undoOwnerQuestion109Universal, undoOwnerQuestion153Universal, undoReadDepth,
} from "./helpers/undo-read-depth.js";

// Independent of the recorded fixture: the owner's new Universal item of 2026-10-20, its two sentences word for word
// and in this order, the existing reviews-and-forums line they follow in the core section sources, and the revision.
const REQUESTED = {
  first: "Book research should include reader-review evidence alongside primary-text reading, identifying practical difficulties, negative experiences, differences in usability, and criticisms that the author might not address.",
  second: "Reviews must be checked against the book, duplicates should not be counted as independent evidence, and self-selected reviews must not be mistaken for clinical outcome studies.",
  revision: "Owner request (2026-10-20): book research includes reader-review evidence alongside primary-text reading, with the reviews checked against the book, duplicates not counted as independent evidence, and self-selected reviews not mistaken for clinical outcome studies (sources).",
} as const;
// Owner question 129, answer "129a" (2026-10-20), from UDA #398: two sentences right after the owner's two.
const Q129 = {
  sentences: [
    "Count as experiences only readers who say they tried the method; keep reviews of another edition, format, translation or book apart; and do not count publisher blurbs or endorsements as reader reviews.",
    "Say how many reviews were read and how they were chosen, or that none could be found, and complete the book research either way.",
  ],
  revision: "Owner-approved, question 129 (2026-10-20), from UDA #398: book research counts as experiences only readers who say they tried the method, keeps reviews of another edition, format, translation or book apart, does not count publisher blurbs or endorsements as reader reviews, and says how many reviews were read and how they were chosen, or that none could be found (sources).",
} as const;
// Owner question 126, answer "126a" (2026-10-20), from lessons #39 to #42: one rule moved word for word into a core
// section, as [rule, its section in Universal 20.5.44, its core section], with the rule it preceded there. It goes
// directly after the paragraph on reading studies, which ends with the words below, so it sits beside "what the design
// can actually estimate".
const Q126 = {
  move: ["EstimandPreservation", "comparison_integrity_gate", "sources"],
  next: "ComparabilityBeforeOrdering",
  studiesEnd: "name which measure each finding addresses and report divergence.",
  mapsStart: "Treat reviews, AI summaries, reports, and synthesized webpages as maps to the evidence",
  revision: "Owner-approved, question 126 (2026-10-20), from lessons #39 to #42: EstimandPreservation moved word for word from comparison_integrity_gate into the core section sources.",
} as const;
// Owner question 128, answer "128b" (2026-10-20), from lesson #44: the owner's paragraph of wording, word for word,
// right after the sentence below in the core section health_labs_supplements_environmental_health, on its line.
const Q128 = {
  section: "health_labs_supplements_environmental_health",
  after: "Keep adverse events, serious events, neurological outcomes, hospitalization, death, and case-fatality separate.",
  lineStart: "Rank hypotheses by base rate, danger if missed, plausibility, testability,",
  sentences: [
    "When asked how safe an exposure is, or which option is safer, list the serious harms plausible for that exposure, its route and the people using it, from its labels, regulators' warnings and pharmacology, and search for each by name and its synonyms in labels and post-marketing reports, trials' serious-event and withdrawal tables, and case reports, apart from the search for common side effects.",
    "Order them by severity and urgency, not by how often sources mention them.",
    "A serious harm not searched for is reported as not checked, not as absent; a small or short study that found none does not rule it out; and doses tolerated before do not rule out a later reaction.",
    "Give the warning signs that need emergency care early and briefly.",
  ],
  revision: "Owner-approved, question 128 (2026-10-20), from lesson #44: when asked how safe an exposure is, the serious harms plausible for it are listed and each is searched by name apart from common side effects; one not searched is reported as not checked, not as absent, and emergency warning signs come early (health_labs_supplements_environmental_health).",
} as const;
const Q128_TEXT = Q128.sentences.join(" ");
// Owner question 135, answer "135a" (2026-10-20), from UDA #408: its own paragraph, right after question 121's
// short-answer paragraph and before the Next step paragraph.
const Q135 = {
  paragraph: "If a known harm, or an effect no study has measured (such as long-term harm), could change whether to use or choose an option, say so in the short answer, not only among the closing caveats.",
  shortAnswer: "After any required notice, start every substantive answer with the short answer, in at most three sentences: the answer, what it depends on, and any question for the user. Then give the details: what the user can do and the evidence, each with its limits; counts of what was read, caveats about the whole answer and offers of more research go last.",
  nextStep: "For every substantive response, finish with an explicit “Next step:”",
  revision: "Owner-approved, question 135 (2026-10-20), from UDA #408: a known harm, or an effect no study has measured, that could change whether to use or choose an option goes in the short answer, not only among the closing caveats (output_style).",
} as const;
const REVISIONS = [REQUESTED.revision, Q126.revision, Q128.revision, Q129.revision, Q135.revision] as const;
const LINE = [REQUESTED.first, REQUESTED.second, ...Q129.sentences].join(" ");
// Between the forum-signal line and the consilience line, which holds the sentence the owner pointed to; question 50's
// tested-identity paragraph stays directly after the consilience line.
const FORUM_SIGNAL_END = "state sampling limits, and never infer population incidence from forum frequency.";
const CONSILIENCE_START = "For a practical effectiveness claim a recommendation or ranking relies on";
const REVIEWS_AND_FORUMS = "Reviews and forums detect discrepancies; they are not trials.";
const IDENTITY_START = "Exact tested identity applies to any study, test, or benchmark an answer relies on,";
const PINS = {
  from: { version: "20.5.44", sha256: "946fac7e5e6ce5cb08811d4c533371e3032e1ce46f5c217990dc326808b55135" },
  to: { version: "20.5.45", sha256: "564c8697fdd4aa69f08b0ecba228ca47cc7dc3e022e6ef55d84ea14f86fb416e" },
} as const;
// The Universal core (sum of its section bytes) before and after, both one page.
const CORE_BYTES = { before: 22_890, after: 25_114 } as const;
const WIDTH = 118;
const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string);
const loadCurrent = () => readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
// Universal 20.5.45, this layer's result, rebuilt from the current file.
const load = async () => undoOwnerQuestion153Universal(await loadCurrent());
// The state before this layer, from the current file.
const undoBookReviews = async () => undoBookReviewsUniversal(await loadCurrent());
const CURRENT = { version: "20.5.46", revisionDate: "2026-10-21", sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e" } as const;
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}
function section(text: string, tag: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, tag).toHaveLength(1);
  return matches[0]![1]!;
}
function element(text: string, tag: string, attr: string, id: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag} ${attr}="${id}"[^>]*>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, id).toHaveLength(1);
  return matches[0]![1]!;
}
// A rule's whole line: Universal keeps each of these rules on one line.
function ruleLine(text: string, name: string): string {
  const lines = text.split("\n").filter((line) => line.startsWith(`<rule name="${name}"`));
  expect(lines, name).toHaveLength(1);
  expect(lines[0]!.endsWith("</rule>"), name).toBe(true);
  return lines[0]!;
}
const openingTag = (text: string, name: string) => ruleLine(text, name).slice(0, ruleLine(text, name).indexOf(">") + 1);
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, () => after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(text: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  return [...lines, line].join("\n");
}
const REVISION_XML = `<revision version="20.5.45" priority="Critical">\n${REVISIONS.map(wrapped).join("\n")}\n</revision>`;
const ruleNames = (text: string, tag: string) => [...section(text, tag).matchAll(/<rule name="([^"]+)"/gu)].map((match) => match[1]);

// Construct the authorized change whitelist independently of the recorded edit fixture.
function expectedEdits(prior: string): Array<[string, string]> {
  const [moved] = Q126.move;
  return [
    ['version="20.5.44" revisionDate="2026-10-17"', 'version="20.5.45" revisionDate="2026-10-20"'],
    ["<revision_history>\n", `<revision_history>\n${REVISION_XML}\n`],
    [`${FORUM_SIGNAL_END}\n${CONSILIENCE_START}`, `${FORUM_SIGNAL_END}\n${LINE}\n${CONSILIENCE_START}`],
    // The move, as question 123's: an insertion in the core section and an anchored deletion.
    [`${Q126.studiesEnd}\n\n${Q126.mapsStart}`, `${Q126.studiesEnd}\n\n${ruleLine(prior, moved)}\n\n${Q126.mapsStart}`],
    [`${ruleLine(prior, moved)}\n\n${openingTag(prior, Q126.next)}`, openingTag(prior, Q126.next)],
    [`${Q135.shortAnswer}\n\n${Q135.nextStep}`, `${Q135.shortAnswer}\n\n${Q135.paragraph}\n\n${Q135.nextStep}`],
    [`${Q128.after}\n`, `${Q128.after} ${Q128_TEXT}\n`],
  ];
}

describe('owner request: book research with reader reviews (2026-10-20), with questions 126, 128, 129 and 135 in the same layer', () => {
  it("chains the exact Universal predecessor, derives the manifest from the bytes, and reverses every layer", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-20-book-reviews-universal.json", ROOT,
    ), "utf8")) as { purpose: string; universal: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "universal"]);
    expect(recorded.purpose).toContain("Owner request: book research with reader reviews (2026-10-20)");
    expect(recorded.purpose).toContain('questions 126, 128, 129 and 135, answers "126a", "128b", "129a" and "135a" (2026-10-20)');
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-17-owner-question-109-universal.json", ROOT,
    ), "utf8")).universal as Edits;
    const fixture = recorded.universal;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(fixture.edits).toEqual(expectedEdits(prior));
    expect(expectedEdits(prior).reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    expect(expectedEdits(prior).reduce((text, [before, after]) =>
      replaceOnce(text, normalize(before), normalize(after)), normalize(prior))).toBe(normalize(current));
    await expect(undoBookReviews()).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(previous.from.sha256);
    await expect(undoOwnerQuestion109Universal(await loadCurrent())).resolves.toBe(beforePrevious);
    const readDepth = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")).universal as Edits;
    expect(hash(await undoReadDepth(await loadCurrent(), "universal"))).toBe(readDepth.from.sha256);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: CURRENT.version, revisionDate: CURRENT.revisionDate, sha256: CURRENT.sha256,
    });
    expect(hash(await loadCurrent())).toBe(CURRENT.sha256);
  });

  it("puts the owner's two sentences, then question 129's two, word for word and in order, on one line of sources", async () => {
    const text = await load();
    const prior = await undoBookReviews();
    expect(section(text, "sources")).toContain(`${FORUM_SIGNAL_END}\n${LINE}\n${CONSILIENCE_START}`);
    const lines = text.split("\n");
    const at = lines.indexOf(LINE);
    expect(at).toBeGreaterThan(0);
    const sentences = [REQUESTED.first, REQUESTED.second, ...Q129.sentences];
    expect(lines.filter((line) => sentences.some((sentence) => line.includes(sentence)))).toEqual([LINE]);
    // After the forum-signal line, before the consilience line that says reviews and forums are not trials, and
    // question 50's tested-identity paragraph still directly after that.
    expect(lines[at - 1]!.startsWith("For forum-signal checks,")).toBe(true);
    expect(lines[at - 1]!.endsWith(FORUM_SIGNAL_END)).toBe(true);
    expect(lines[at + 1]!.startsWith(CONSILIENCE_START)).toBe(true);
    expect(lines[at + 1]!).toContain(` ${REVIEWS_AND_FORUMS} `);
    expect(lines[at + 2]!.startsWith(IDENTITY_START)).toBe(true);
    // Question 129's sentences come right after the owner's second sentence.
    expect(LINE.startsWith(`${REQUESTED.first} ${REQUESTED.second} ${Q129.sentences[0]} ${Q129.sentences[1]}`)).toBe(true);
    for (const [index, sentence] of sentences.entries()) {
      expect(normalize(text).split(sentence)).toHaveLength(2);
      expect(normalize(prior)).not.toContain(sentence);
      expect(sentence).not.toMatch(/[&<>\n]/u);
      if (index > 0) expect(LINE.indexOf(sentence)).toBeGreaterThan(LINE.indexOf(sentences[index - 1]!));
    }
    expect(coreSectionNames("universal")).toContain("sources");
  });

  it("moves EstimandPreservation into the core section sources, word for word and only once, after the paragraph on reading studies", async () => {
    const [name, from, to] = Q126.move;
    const text = await load();
    const prior = await undoBookReviews();
    expect(protocolNamedElements(prior, name)).toMatchObject([{ tag: "rule", section: from }]);
    expect(protocolNamedElements(text, name)).toMatchObject([{ tag: "rule", section: to }]);
    expect(coreSectionNames("universal")).toContain(to);
    expect(coreSectionNames("universal")).not.toContain(from);
    expect(ruleLine(text, name)).toBe(ruleLine(prior, name));
    expect(plain(element(text, "rule", "name", name))).toBe(plain(element(prior, "rule", "name", name)));
    const lines = text.split("\n");
    const at = lines.indexOf(ruleLine(text, name));
    expect(lines[at - 2]!.startsWith("For studies, inspect full text, methods, outcomes, funding, conflicts of interest")).toBe(true);
    expect(lines[at - 2]!).toContain("and what the design can actually estimate.");
    expect(lines[at - 2]!.endsWith(Q126.studiesEnd)).toBe(true);
    expect([lines[at - 1], lines[at + 1]]).toEqual(["", ""]);
    expect(lines[at + 2]!.startsWith(Q126.mapsStart)).toBe(true);
    expect(ruleNames(text, to)).toEqual([...ruleNames(prior, to), name]);
    expect(ruleNames(text, from)).toEqual(ruleNames(prior, from).filter((rule) => rule !== name));
    const old = ruleNames(prior, from);
    expect(old[old.indexOf(name) + 1]).toBe(Q126.next);
    expect(section(text, from)).toContain(`</rule>\n\n${openingTag(text, Q126.next)}`);
  });

  it("adds question 135's paragraph to output_style, right after question 121's short-answer paragraph", async () => {
    const text = await load();
    const prior = await undoBookReviews();
    expect(section(text, "output_style")).toBe(replaceOnce(section(prior, "output_style"),
      `${Q135.shortAnswer}\n\n${Q135.nextStep}`, `${Q135.shortAnswer}\n\n${Q135.paragraph}\n\n${Q135.nextStep}`));
    expect(text.split("\n").filter((line) => line.includes(Q135.paragraph))).toEqual([Q135.paragraph]);
    expect(normalize(prior)).not.toContain(Q135.paragraph);
    expect(Q135.paragraph).not.toMatch(/[&<>\n]/u);
    expect(coreSectionNames("universal")).toContain("output_style");
  });

  it("adds question 128's wording word for word, right after the sentence on keeping serious events separate", async () => {
    const text = await load();
    const prior = await undoBookReviews();
    expect(section(text, Q128.section)).toBe(replaceOnce(section(prior, Q128.section), `${Q128.after}\n`, `${Q128.after} ${Q128_TEXT}\n`));
    // On the same line, which still starts with the ranking sentence and now ends with the owner's last sentence.
    const lines = text.split("\n").filter((line) => line.includes(Q128.after));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.startsWith(Q128.lineStart)).toBe(true);
    expect(lines[0]!.endsWith(`${Q128.after} ${Q128_TEXT}`)).toBe(true);
    for (const [index, sentence] of Q128.sentences.entries()) {
      expect(normalize(text).split(sentence)).toHaveLength(2);
      expect(normalize(prior)).not.toContain(sentence);
      expect(sentence).not.toMatch(/[&<>\n]/u);
      if (index > 0) expect(lines[0]!.indexOf(sentence)).toBeGreaterThan(lines[0]!.indexOf(Q128.sentences[index - 1]!));
    }
    expect(coreSectionNames("universal")).toContain(Q128.section);
  });

  it("places the exact Critical revision first, directly above 20.5.44's, wrapped like its neighbours", async () => {
    const text = await load();
    const prior = await undoBookReviews();
    const body = element(text, "revision", "version", PINS.to.version);
    expect(plain(body)).toBe(REVISIONS.join(" "));
    const lines = body.split("\n").slice(1, -1);
    for (const line of lines) {
      expect(line.length, line.slice(0, 60)).toBeLessThanOrEqual(WIDTH);
      expect(line, line.slice(0, 60)).toBe(line.trim());
    }
    expect(section(prior, "revision_history").startsWith(`\n<revision version="${PINS.from.version}" priority="Critical">\n`)).toBe(true);
    expect(section(text, "revision_history")).toBe(`\n${REVISION_XML}${section(prior, "revision_history")}`);
  });

  it("wraps every new line within 118 characters, apart from the root line and the one-line paragraphs", async () => {
    const text = await load();
    const prior = await undoBookReviews();
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    const health = text.split("\n").find((line) => line.startsWith(Q128.lineStart));
    expect(added.filter((line) => line.length > WIDTH)).toEqual([text.split("\n")[1], LINE, health, Q135.paragraph]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });

  it("changes only the sections its edits name, by their exact bytes, and keeps the core one page", async () => {
    const text = await load();
    const prior = await undoBookReviews();
    const [now, before] = [protocolSections("universal", text), protocolSections("universal", prior)];
    expect(now.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
    const changed = now.filter(({ name, sha256 }) => before.find((section) => section.name === name)!.sha256 !== sha256)
      .map(({ name }) => name);
    expect(changed).toEqual(["revision_history", "comparison_integrity_gate", "sources", Q128.section, "output_style"]);
    const bytes = (sections: typeof now, name: string) => sections.find((section) => section.name === name)!.bytes;
    const size = (value: string) => Buffer.byteLength(value, "utf8");
    const delta = (name: string) => bytes(now, name) - bytes(before, name);
    const moved = size(`${ruleLine(prior, Q126.move[0])}\n\n`);
    expect(delta("comparison_integrity_gate")).toBe(-moved);
    expect(delta("sources")).toBe(size(`${LINE}\n`) + moved);
    expect(delta("output_style")).toBe(size(`${Q135.paragraph}\n\n`));
    expect(delta(Q128.section)).toBe(size(` ${Q128_TEXT}`));
    const core = (sections: typeof now) => sections.filter(({ core }) => core).reduce((sum, { bytes }) => sum + bytes, 0);
    expect(core(before)).toBe(CORE_BYTES.before);
    expect(core(now)).toBe(CORE_BYTES.after);
    expect(core(now) - core(before)).toBe(delta("sources") + delta(Q128.section) + delta("output_style"));
    for (const name of ["sources", Q128.section, "output_style"]) {
      expect(now.find((section) => section.name === name)).toMatchObject({ core: true, runtime: true, pages: 1 });
    }
  });

  it("serves the changed core sections and the core with the new text, as exact canonical bytes on one page", async () => {
    const bytes = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT));
    const { sections, text } = await loadProtocolSectionSnapshot("universal");
    expect(text).toBe(bytes.toString("utf8"));
    const server = createAskRigorServer();
    const client = new Client({ name: "book-reviews-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      for (const name of ["sources", Q128.section, "output_style"]) {
        const found = sections.find((section) => section.name === name)!;
        const canonical = bytes.subarray(found.byte_start, found.byte_end_exclusive).toString("utf8");
        const served = await client.callTool({ name: "load_protocol", arguments: { protocol: "universal", section: name } });
        expect(served.isError).not.toBe(true);
        expect(served.structuredContent).toMatchObject({ ok: true, complete: true, text: canonical });
      }
      const estimand = protocolNamedElements(text, Q126.move[0]);
      expect(estimand).toHaveLength(1);
      const rule = await client.callTool({ name: "load_protocol", arguments: { protocol: "universal", section: Q126.move[0] } });
      expect(rule.structuredContent).toMatchObject({ ok: true, complete: true,
        text: bytes.subarray(estimand[0]!.byte_start, estimand[0]!.byte_end_exclusive).toString("utf8") });
      const core = sections.filter(({ core }) => core)
        .map(({ byte_start, byte_end_exclusive }) => bytes.subarray(byte_start, byte_end_exclusive).toString("utf8")).join("\n\n");
      const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "universal", section: "core" } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: true, complete: true, page_count: 1, text: core });
      for (const line of [LINE, ruleLine(text, Q126.move[0]), Q135.paragraph]) expect(core).toContain(`\n${line}\n`);
      // The server serves the current file: owner answer 153c (2026-10-21) has since inserted a clause into question
      // 128's first sentence, and the rest is served as this layer wrote it.
      const [first, ...rest] = Q128.sentences;
      const clause = "or when the answer ranks or puts forward a medicine likely to be taken for months or years, ";
      const withClause = replaceOnce(first, "or which option is safer, ", `or which option is safer, ${clause}`);
      expect(core).toContain(` ${Q128.after} ${[withClause, ...rest].join(" ")}\n`);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
