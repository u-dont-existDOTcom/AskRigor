import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
  coreSectionNames, getProtocolManifest, loadProtocolSectionSnapshot, PROTOCOL_PAGE_MAX_BYTES, protocolNamedElements,
  protocolSections,
} from "@askrigor/protocol";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { undoOwnerAnswer193Hrp, undoOwnerQuestion149Hrp, undoOwnerQuestion161Hrp, undoReadDepth } from "./helpers/undo-read-depth.js";

// Independent of the recorded edit fixture: the owner's two approved sentences of 2026-10-22, word for word (answer
// "161a", from lesson #49), where they go, the lesson's three invented cases as stress cases, and the revision note.
const RULE = {
  name: "SocialMediaWholeThreadAudit",
  // Not a core section: load_protocol serves it when a question needs its sources verified, apart from the core.
  section: "SourceVerificationAndCitationAudit",
  // The rule goes between these two, as a rule of its own.
  follows: "WholeReportAudit",
  precedes: "HistoricalVocabularyAndCitationBackchain",
  sentences: [
    "When grading scientific or medical claims from social-media posts, evaluate the author's complete thread—including replies, attachments, corrections, and cited research—before reaching a credibility verdict.",
    "Inaccessible material must leave the audit incomplete rather than support a definitive negative judgment.",
  ],
} as const;
const RULE_TEXT = RULE.sentences.join(" ");
// The lesson's cases A, B and C: each prompt is the case in the lesson's words, and each expected behavior starts with
// the case's own requirement in the lesson's words, then adds the part of the lesson's expected behavior that bears on
// it, as pass criteria, not as rule text.
const CASES = [
  ["AuthorReplyBeforeVerdict",
    "An ambiguous claim appears in a post but the author's reply contains a study defining its population.",
    "Grading must remain incomplete until that reply is read: read the reply and its study, then grade the claim for the population the study defines, keeping the claim's actual scope and uncertainty. If the reply or the study cannot be accessed, say that the audit is incomplete and give no definitive negative judgment from the post alone."],
  ["MistakenLabelNotFalseMeasurement",
    "A post uses a mistaken technical label but makes an independent measurable assertion.",
    "Correct the label without treating it as proof the measurement is false: evaluate the measurable assertion on its own evidence, separately from the wording error, and do not take evidence of harm for one outcome as refuting evidence of benefit for another."],
  ["CompleteThreadNegativeVerdict",
    "A fully read post and its replies make an unambiguously false assertion.",
    "Allow a negative verdict grounded in the complete material: say plainly that the assertion is false, citing what the post and its replies say and the evidence against it, and do not withhold the verdict or call the audit incomplete when nothing relevant is missing."],
] as const;
// Lesson #49's synthetic regression as filed: each case, and the case's requirement.
const LESSON_CASES = [
  ["An ambiguous claim appears in a post but the author's reply contains a study defining its population.",
    "Grading must remain incomplete until that reply is read."],
  ["A post uses a mistaken technical label but makes an independent measurable assertion.",
    "Correct the label without treating it as proof the measurement is false."],
  ["A fully read post and its replies make an unambiguously false assertion.",
    "Allow a negative verdict grounded in the complete material."],
] as const;
// Question 152's last case, which the new cases directly follow, and the case after it.
const CASES_FOLLOW = "ObservationNotProvocation";
const CASES_PRECEDE = "CodedFormulaLargeEffect";
const REVISION = "Owner-approved, answer 161a (2026-10-22), from lesson #49, in which a source audit gave a decisive credibility verdict on a social-media post without checking the author's reply and supporting reference: added SocialMediaWholeThreadAudit to SourceVerificationAndCitationAudit, right after WholeReportAudit and outside the core, with stress cases AuthorReplyBeforeVerdict, MistakenLabelNotFalseMeasurement and CompleteThreadNegativeVerdict.";
const PINS = {
  from: { version: "20.6.30", sha256: "b7c1df6eb235bcd1423e4d8fdb86245887e3cd0eac3f469f6cc91619a5c91ef8" },
  to: { version: "20.6.31", sha256: "29269d656e73c70b541226023b58b294e583188c721481c043d53f900ee0a8b5" },
} as const;
const REVISION_DATE = "2026-10-22";
// Universal does not change.
const UNIVERSAL = {
  name: "AskRigor.com universal saved instructions", version: "20.5.46", revisionDate: "2026-10-21",
  sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e",
} as const;
const FIXTURE = "2026-10-22-owner-question-161-hrp.json";
const PREVIOUS_FIXTURE = "2026-10-22-owner-question-149-hrp.json";
// The core, as the sum of its section bytes, which this layer leaves as question 149 left it: served with two bytes
// between sections, 36 bytes short of a second page.
const CORE_BYTES = 39_952;
const WIDTH = 118;
const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const size = (text: string) => Buffer.byteLength(text, "utf8");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string);
const load = async () => undoOwnerAnswer193Hrp(await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"));
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
// A rule's lines in `text`, from the start of its first line to its closing tag.
function ruleLines(text: string, name: string): string {
  const open = `<Rule name="${name}"`;
  expect(text.split(open), name).toHaveLength(2);
  const start = text.lastIndexOf("\n", text.indexOf(open)) + 1;
  return text.slice(start, text.indexOf("</Rule>", start) + "</Rule>".length);
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, () => after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(text: string, indent: number): string {
  const lines: string[] = [];
  let line = " ".repeat(indent);
  for (const word of text.split(" ")) {
    if (line.trim() && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = " ".repeat(indent);
    }
    line += (line.trim() ? " " : "") + word;
  }
  return [...lines, line].join("\n");
}
const ruleXml = (name: string, text: string) => `  <Rule name="${name}" priority="Critical">\n${wrapped(text, 3)}\n  </Rule>`;
const RULE_XML = ruleXml(RULE.name, RULE_TEXT);
const caseXml = (id: string, prompt: string, expected: string) =>
  `  <Case id="${id}">\n   <Prompt>\n${wrapped(prompt, 4)}\n   </Prompt>\n` +
  `   <ExpectedBehavior>\n${wrapped(expected, 4)}\n   </ExpectedBehavior>\n  </Case>`;
const CASES_XML = CASES.map(([id, prompt, expected]) => caseXml(id, prompt, expected)).join("\n");
const REVISION_XML = `  <Revision version="20.6.31" priority="Critical">\n${wrapped(REVISION, 3)}\n  </Revision>`;
const ruleNames = (body: string) => [...body.matchAll(/<Rule name="([^"]+)"/gu)].map((match) => match[1]);
const caseNames = (text: string) => [...section(text, "StressTestExpectations").matchAll(/<Case id="([^"]+)"/gu)].map((match) => match[1]);
const NEXT = `  <Rule name="${RULE.precedes}" priority="Critical">`;
const PRECEDE = `  <Case id="${CASES_PRECEDE}">`;

// Construct the authorized change whitelist independently of the recorded edit fixture.
function expectedEdits(prior: string): Array<[string, string]> {
  // The rule goes directly after WholeReportAudit, before the next rule, with a blank line on each side.
  const follows = ruleLines(prior, RULE.follows);
  expect(prior).toContain(`${follows}\n\n${NEXT}`);
  // The cases go directly before the case that follows question 152's last one.
  expect(prior).toContain(`</ExpectedBehavior>\n  </Case>\n${PRECEDE}`);
  return [
    ['version="20.6.30" revisionDate="2026-10-22"', 'version="20.6.31" revisionDate="2026-10-22"'],
    [" <RevisionHistory>\n", ` <RevisionHistory>\n${REVISION_XML}\n`],
    [`${follows}\n\n${NEXT}`, `${follows}\n\n${RULE_XML}\n\n${NEXT}`],
    [PRECEDE, `${CASES_XML}\n${PRECEDE}`],
  ];
}

describe('owner-approved question 161: "161a" (2026-10-22), from lesson #49', () => {
  it("chains the exact predecessor, derives the manifest from the bytes, and reverses the layer", async () => {
    const recorded = JSON.parse(await readFile(new URL(`tests/fixtures/protocol-edits/${FIXTURE}`, ROOT), "utf8")) as
      { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    expect(recorded.purpose).toContain('answer "161a" (2026-10-22), from lesson #49');
    const previous = JSON.parse(await readFile(new URL(`tests/fixtures/protocol-edits/${PREVIOUS_FIXTURE}`, ROOT), "utf8")).hrp as Edits;
    const fixture = recorded.hrp;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(4);
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
    await expect(undoOwnerQuestion161Hrp(current)).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(previous.from.sha256);
    await expect(undoOwnerQuestion149Hrp(current)).resolves.toBe(beforePrevious);
    const readDepth = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")).hrp as Edits;
    expect(hash(await undoReadDepth(current, "hrp"))).toBe(readDepth.from.sha256);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.32", revisionDate: "2026-10-29",
      sha256: "27546c04255488fab38779ec7e0513fc2c4b805dd6ecfaa65e33d75f40c9bbcb",
    });
  });

  it("adds SocialMediaWholeThreadAudit as a Critical rule holding the two approved sentences word for word and nothing else", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion161Hrp(text);
    expect(plain(element(text, "Rule", "name", RULE.name))).toBe(RULE_TEXT);
    expect(ruleLines(text, RULE.name)).toBe(RULE_XML);
    // Each sentence appears once in the file, in this rule, and was in no earlier version of it.
    for (const sentence of RULE.sentences) {
      expect(normalize(text).split(sentence), sentence.slice(0, 40)).toHaveLength(2);
      expect(normalize(prior)).not.toContain(sentence);
      expect(sentence).not.toMatch(/[&<>\n]/u);
    }
    expect(prior).not.toContain(RULE.name);
    // Every other rule keeps its name and order; the first test shows that nothing else in the file changes.
    expect(ruleNames(text).filter((name) => name !== RULE.name)).toEqual(ruleNames(prior));
  });

  it("sits in SourceVerificationAndCitationAudit directly after WholeReportAudit, formatted like it", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion161Hrp(text);
    expect(protocolNamedElements(prior, RULE.name)).toEqual([]);
    expect(protocolNamedElements(text, RULE.name)).toMatchObject([{ tag: "Rule", section: RULE.section }]);
    for (const neighbour of [RULE.follows, RULE.precedes]) {
      expect(protocolNamedElements(text, neighbour).filter(({ tag }) => tag === "Rule"))
        .toMatchObject([{ tag: "Rule", section: RULE.section }]);
    }
    const before = ruleNames(section(prior, RULE.section));
    const at = before.indexOf(RULE.follows);
    expect(before[at + 1]).toBe(RULE.precedes);
    expect(ruleNames(section(text, RULE.section))).toEqual([...before.slice(0, at + 1), RULE.name, ...before.slice(at + 1)]);
    // One blank line on each side, as between the section's other rules.
    const follows = ruleLines(text, RULE.follows);
    expect(text).toContain(`${follows}\n\n${RULE_XML}\n\n${NEXT}`);
    expect(section(text, RULE.section)).toBe(replaceOnce(section(prior, RULE.section), `${follows}\n\n${NEXT}`,
      `${follows}\n\n${RULE_XML}\n\n${NEXT}`));
    // Its neighbours have the same shape: the opening tag on its own line, the text on lines indented by three spaces,
    // and the closing tag on its own line. (They were wrapped a column or two wider than 118, so their exact wrapping
    // is not this rule's.)
    for (const neighbour of [RULE.follows, RULE.precedes]) {
      const lines = ruleLines(text, neighbour).split("\n");
      expect(lines[0]).toBe(`  <Rule name="${neighbour}" priority="Critical">`);
      expect(lines.at(-1)).toBe("  </Rule>");
      for (const line of lines.slice(1, -1)) expect(line, line.slice(0, 40)).toMatch(/^ {3}\S/u);
    }
  });

  it("is outside the core, in a runtime section of one page that load_protocol serves with the rule, and serves the paginated current core", async () => {
    expect(coreSectionNames("hrp")).not.toContain(RULE.section);
    const bytes = await readFile(new URL("protocols/HRP_Full.xml", ROOT));
    const { sections, text } = await loadProtocolSectionSnapshot("hrp");
    expect(text).toBe(bytes.toString("utf8"));
    const home = sections.find(({ name }) => name === RULE.section)!;
    expect(home).toMatchObject({ core: false, runtime: true, pages: 1 });
    const server = createAskRigorServer();
    const client = new Client({ name: "owner-question-161-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      // The rule by its name, and its whole section, as exact canonical bytes.
      const [span, ...others] = protocolNamedElements(text, RULE.name);
      expect(others).toEqual([]);
      const canonical = bytes.subarray(span!.byte_start, span!.byte_end_exclusive).toString("utf8");
      expect(canonical).toBe(RULE_XML.trimStart());
      const served = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: RULE.name } });
      expect(served.isError).not.toBe(true);
      expect(served.structuredContent).toMatchObject({ ok: true, complete: true, text: canonical });
      const whole = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: RULE.section } });
      expect(whole.isError).not.toBe(true);
      expect(whole.structuredContent).toMatchObject({
        ok: true, complete: true, page_count: 1,
        text: bytes.subarray(home.byte_start, home.byte_end_exclusive).toString("utf8"),
      });
      expect((whole.structuredContent as { text: string }).text.split(RULE_XML)).toHaveLength(2);
      // The core still loads as one page, without the rule.
      const core = sections.filter(({ core: isCore }) => isCore)
        .map(({ byte_start, byte_end_exclusive }) => bytes.subarray(byte_start, byte_end_exclusive).toString("utf8")).join("\n\n");
      const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "core" } });
      expect(response.isError).not.toBe(true);
      const pages = Math.ceil(size(core) / PROTOCOL_PAGE_MAX_BYTES);
      expect(response.structuredContent).toMatchObject({ ok: true, complete: pages === 1, page_count: pages });
      let servedCore = (response.structuredContent as { text: string }).text;
      for (let page = 2; page <= pages; page += 1) {
        const next = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "core", page } });
        expect(next.isError).not.toBe(true);
        expect(next.structuredContent).toMatchObject({ ok: true, complete: page === pages, page_count: pages });
        servedCore += (next.structuredContent as { text: string }).text;
      }
      expect(servedCore).toBe(core);
      for (const sentence of RULE.sentences) expect(normalize(core)).not.toContain(sentence);
      // Each new stress case by its id.
      for (const [id] of CASES) {
        const [found, ...more] = protocolNamedElements(text, id);
        expect(more, id).toEqual([]);
        expect(found).toMatchObject({ tag: "Case", section: "StressTestExpectations" });
        const caseServed = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: id } });
        expect(caseServed.isError).not.toBe(true);
        expect(caseServed.structuredContent).toMatchObject({
          ok: true, complete: true, text: bytes.subarray(found!.byte_start, found!.byte_end_exclusive).toString("utf8"),
        });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("keeps each case's prompt and expected behavior word for word, in order after question 152's cases", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion161Hrp(text);
    // Each prompt is the lesson's case, and each expected behavior opens with the case's requirement, in its words.
    expect(CASES).toHaveLength(LESSON_CASES.length);
    CASES.forEach(([id, prompt, expected], index) => {
      const [lessonCase, requirement] = LESSON_CASES[index]!;
      expect(prompt, id).toBe(lessonCase);
      expect(expected.startsWith(`${requirement.slice(0, -1)}: `), id).toBe(true);
    });
    for (const [id, prompt, expected] of CASES) {
      const body = element(section(text, "StressTestExpectations"), "Case", "id", id);
      expect(plain(section(body, "Prompt")), id).toBe(prompt);
      expect(plain(section(body, "ExpectedBehavior")), id).toBe(expected);
      expect(`  <Case id="${id}">${body}</Case>`).toBe(caseXml(id, prompt, expected));
      expect(caseNames(text).filter((name) => name === id)).toHaveLength(1);
      expect(caseNames(prior)).not.toContain(id);
      expect(prior).not.toContain(id);
      expect(normalize(prior)).not.toContain(expected);
    }
    const cases = caseNames(text);
    const at = cases.indexOf(CASES_FOLLOW);
    expect(cases.slice(at, at + CASES.length + 2)).toEqual([CASES_FOLLOW, ...CASES.map(([id]) => id), CASES_PRECEDE]);
    // Every other case is unchanged, in its order.
    expect(cases.filter((name) => !CASES.some(([id]) => id === name))).toEqual(caseNames(prior));
    // The lesson's further expected behavior is a pass criterion in the cases, which are maintainer material
    // (runtime: false), and in no rule: the two approved sentences are the only new rule text.
    const harm = "do not take evidence of harm for one outcome as refuting evidence of benefit for another";
    expect(normalize(text).split(harm)).toHaveLength(2);
    expect(normalize(section(text, "StressTestExpectations"))).toContain(harm);
    expect(protocolSections("hrp", text).find(({ name }) => name === "StressTestExpectations"))
      .toMatchObject({ core: false, runtime: false });
  });

  it("places the exact Critical revision first, wrapped like its neighbours", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion161Hrp(text);
    expect(plain(element(text, "Revision", "version", PINS.to.version))).toBe(REVISION);
    expect(section(prior, "RevisionHistory").trimStart().startsWith(`<Revision version="${PINS.from.version}" priority="Critical">`)).toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${REVISION_XML}${section(prior, "RevisionHistory")}`);
  });

  it("wraps new lines at 118, apart from the root line", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion161Hrp(text);
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    expect(added.filter((line) => line.length > WIDTH)).toEqual([text.split("\n")[1]]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });

  it("changes only the sections its edits name, by their exact bytes; the core stays as it was, on one page", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion161Hrp(text);
    const [now, before] = [protocolSections("hrp", text), protocolSections("hrp", prior)];
    expect(now.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
    const changed = now.filter(({ name, sha256 }) => before.find((section) => section.name === name)!.sha256 !== sha256)
      .map(({ name }) => name);
    const bytes = (sections: typeof now, name: string) => sections.find((section) => section.name === name)!.bytes;
    const delta = (name: string) => bytes(now, name) - bytes(before, name);
    const core = (sections: typeof now) => sections.filter(({ core }) => core);
    const coreBytes = (sections: typeof now) => core(sections).reduce((sum, { bytes }) => sum + bytes, 0);
    expect(changed).toEqual(["RevisionHistory", RULE.section, "StressTestExpectations"]);
    expect(delta("RevisionHistory")).toBe(size(`${REVISION_XML}\n`));
    expect(delta(RULE.section)).toBe(size(`${RULE_XML}\n\n`));
    expect(delta("StressTestExpectations")).toBe(size(`${CASES_XML}\n`));
    expect(coreBytes(before)).toBe(CORE_BYTES);
    expect(coreBytes(now)).toBe(CORE_BYTES);
    // Every core section keeps its exact bytes; only its place in the file moves.
    const fingerprint = (sections: typeof now) => core(sections).map(({ name, bytes, pages, sha256 }) => ({ name, bytes, pages, sha256 }));
    expect(fingerprint(now)).toEqual(fingerprint(before));
    // Served as one scope with two bytes between sections, the core still fits one page.
    expect(coreBytes(now) + 2 * (core(now).length - 1)).toBeLessThanOrEqual(PROTOCOL_PAGE_MAX_BYTES);
    for (const { pages } of core(now)) expect(pages).toBe(1);
  });

  it("leaves Universal at 20.5.46", async () => {
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(hash(universal)).toBe(UNIVERSAL.sha256);
    await expect(getProtocolManifest("universal")).resolves.toEqual(UNIVERSAL);
  });
});
