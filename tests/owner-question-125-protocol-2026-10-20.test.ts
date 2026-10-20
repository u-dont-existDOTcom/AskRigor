import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { coreSectionNames, getProtocolManifest, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { undoOwnerQuestion109Hrp, undoOwnerQuestion125Hrp, undoReadDepth } from "./helpers/undo-read-depth.js";

// Independent of the recorded edit fixture: owner question 125's approved sentence, word for word (answer "125a",
// 2026-10-20, from lesson #38), the first sentence it follows, the stress case from the report's own example, and the
// revision note.
const APPROVED = "When the question is whether two product names or labels refer to the same thing, answer both parts: what the names mean chemically, from authoritative documentation, and how sellers and buyers actually use them, from vendor labels and buyer or specialist discussions; skip the second part only with a reason stated in the answer.";
const FIRST_SENTENCE = "Forum review need not activate for a simple definition, a purely chemical or mechanistic question with no real-world outcome claim, an acute emergency before triage is complete, or a topic with no meaningful user-experience corpus.";
const RULE = "ForumSignalNonTrigger";
const CASE = {
  id: "ProductNameEquivalence",
  prompt: "A user asks whether a peptide sold as “NA-Peptide Z” is the same product as “Peptide Z-amidate”, while suppliers also list “N-acetyl Peptide Z-amidate”.",
  expected: "Answer both parts: what each name means chemically, from authoritative documentation, and how sellers and buyers actually use the names, from vendor labels and buyer or specialist discussions, including which variants they tell apart and whether they use the short names consistently; a chemistry-only answer states why it skipped the second part.",
} as const;
const REVISION = "Owner-approved, question 125 (2026-10-20), from lesson #38: ForumSignalNonTrigger now says that a question whether two product names or labels refer to the same thing has two parts, what the names mean chemically and how sellers and buyers actually use them, and that the second is skipped only with a reason stated in the answer; with stress case ProductNameEquivalence.";
const PINS = {
  from: { version: "20.6.27", sha256: "e6db59c14c78f3d53b04b8d36ce514eecfcaaec1cf7f9d176d7b8ad665b2e2fe" },
  to: { version: "20.6.28", sha256: "9dd5e5bf7b896011544731f1acc028befcf0a9d132189e63a50c41bf6197ea17" },
} as const;
// The HRP core (sum of its section bytes), unchanged by this layer and still one page.
const CORE_BYTES = 38_208;
const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string);
const load = () => readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
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
    if (line.trim() && line.length + 1 + word.length > 118) {
      lines.push(line);
      line = " ".repeat(indent);
    }
    line += (line.trim() ? " " : "") + word;
  }
  return [...lines, line].join("\n");
}
const caseXml = (id: string, prompt: string, expected: string) =>
  `  <Case id="${id}">\n   <Prompt>\n${wrapped(prompt, 4)}\n   </Prompt>\n` +
  `   <ExpectedBehavior>\n${wrapped(expected, 4)}\n   </ExpectedBehavior>\n  </Case>`;
const REVISION_XML = `  <Revision version="20.6.28" priority="Critical">\n${wrapped(REVISION, 3)}\n  </Revision>`;

// Construct the authorized change whitelist independently of the recorded edit fixture.
function expectedEdits(prior: string): Array<[string, string]> {
  // The rule's line that ends its first sentence, and the next line, which starts its second.
  const rule = element(prior, "Rule", "name", RULE);
  const lines = rule.split("\n");
  const end = lines.findIndex((line) => line.endsWith(" user-experience corpus."));
  expect(normalize(lines.slice(0, end + 1).join(" "))).toBe(FIRST_SENTENCE);
  const [ending, next] = [lines[end]!, lines[end + 1]!];
  // The case goes directly before the one that follows ConditionsGiven, question 120's last case.
  const coded = '  <Case id="CodedFormulaLargeEffect">';
  expect(prior).toContain(`</ExpectedBehavior>\n  </Case>\n${coded}`);
  return [
    ['version="20.6.27" revisionDate="2026-10-18"', 'version="20.6.28" revisionDate="2026-10-20"'],
    [" <RevisionHistory>\n", ` <RevisionHistory>\n${REVISION_XML}\n`],
    [`${ending}\n${next}`, `${ending}\n${wrapped(APPROVED, 3)}\n${next}`],
    [coded, `${caseXml(CASE.id, CASE.prompt, CASE.expected)}\n${coded}`],
  ];
}

describe('owner-approved question 125: "125a" (2026-10-20), from lesson #38', () => {
  it("chains the exact HRP predecessor, derives the manifest from the bytes, and reverses every layer", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-20-owner-question-125-hrp.json", ROOT,
    ), "utf8")) as { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    expect(recorded.purpose).toContain('Owner-approved question 125, from the owner\'s answer "125a" (2026-10-20)');
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-17-owner-question-109-hrp.json", ROOT,
    ), "utf8")).hrp as Edits;
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
    await expect(undoOwnerQuestion125Hrp(current)).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(previous.from.sha256);
    await expect(undoOwnerQuestion109Hrp(current)).resolves.toBe(beforePrevious);
    const readDepth = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")).hrp as Edits;
    expect(hash(await undoReadDepth(current, "hrp"))).toBe(readDepth.from.sha256);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: PINS.to.version, revisionDate: "2026-10-20", sha256: hash(current),
    });
  });

  it("adds the approved sentence word for word to ForumSignalNonTrigger, directly after its first sentence", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion125Hrp(text);
    const before = plain(element(prior, "Rule", "name", RULE));
    expect(before.startsWith(`${FIRST_SENTENCE} Nonactivation is an affirmative relevance decision`)).toBe(true);
    expect(plain(element(text, "Rule", "name", RULE))).toBe(`${FIRST_SENTENCE} ${APPROVED}${before.slice(FIRST_SENTENCE.length)}`);
    expect(normalize(text).split(APPROVED)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(APPROVED);
    // The rule stays where it was: a runtime section outside the core.
    expect(protocolNamedElements(text, RULE)).toMatchObject([{ tag: "Rule", section: "AnswerShapeController" }]);
    expect(protocolNamedElements(prior, RULE)).toMatchObject([{ tag: "Rule", section: "AnswerShapeController" }]);
    expect(coreSectionNames("hrp")).not.toContain("AnswerShapeController");
    expect(protocolSections("hrp", text).find(({ name }) => name === "AnswerShapeController")).toMatchObject({ core: false, runtime: true });
  });

  it("keeps the stress case's prompt and expected behavior word for word, after ConditionsGiven", async () => {
    const text = await load();
    const body = element(section(text, "StressTestExpectations"), "Case", "id", CASE.id);
    expect(plain(section(body, "Prompt"))).toBe(CASE.prompt);
    expect(plain(section(body, "ExpectedBehavior"))).toBe(CASE.expected);
    expect(`  <Case id="${CASE.id}">${body}</Case>`).toBe(caseXml(CASE.id, CASE.prompt, CASE.expected));
    for (const name of ["“NA-Peptide Z”", "“Peptide Z-amidate”", "“N-acetyl Peptide Z-amidate”"]) expect(CASE.prompt).toContain(name);
    const cases = [...section(text, "StressTestExpectations").matchAll(/<Case id="([^"]+)"/gu)].map((match) => match[1]);
    const at = cases.indexOf("ConditionsGiven");
    expect(cases.slice(at, at + 3)).toEqual(["ConditionsGiven", CASE.id, "CodedFormulaLargeEffect"]);
    expect(cases.filter((id) => id === CASE.id)).toHaveLength(1);
  });

  it("places the exact Critical revision first, wrapped like its neighbours", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion125Hrp(text);
    expect(plain(element(text, "Revision", "version", PINS.to.version))).toBe(REVISION);
    expect(section(prior, "RevisionHistory").trimStart().startsWith(`<Revision version="${PINS.from.version}" priority="Critical">`)).toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${REVISION_XML}${section(prior, "RevisionHistory")}`);
  });

  it("wraps new lines at 118, apart from the root line", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion125Hrp(text);
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    expect(added.filter((line) => line.length > 118)).toEqual([text.split("\n")[1]]);
    for (const line of added) expect(line).toBe(line.trimEnd());
  });

  it("changes only the revision history, AnswerShapeController and the stress cases; the core keeps its bytes and one page", async () => {
    const text = await load();
    const prior = await undoOwnerQuestion125Hrp(text);
    const [now, before] = [protocolSections("hrp", text), protocolSections("hrp", prior)];
    expect(now.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
    const changed = now.filter(({ name, sha256 }) => before.find((section) => section.name === name)!.sha256 !== sha256)
      .map(({ name }) => name);
    expect(changed).toEqual(["RevisionHistory", "AnswerShapeController", "StressTestExpectations"]);
    const bytes = (sections: typeof now, name: string) => sections.find((section) => section.name === name)!.bytes;
    expect(bytes(now, "AnswerShapeController") - bytes(before, "AnswerShapeController"))
      .toBe(Buffer.byteLength(`${wrapped(APPROVED, 3)}\n`, "utf8"));
    expect(bytes(now, "StressTestExpectations") - bytes(before, "StressTestExpectations"))
      .toBe(Buffer.byteLength(`${caseXml(CASE.id, CASE.prompt, CASE.expected)}\n`, "utf8"));
    const core = (sections: typeof now) => sections.filter(({ core }) => core).reduce((sum, { bytes }) => sum + bytes, 0);
    expect(core(before)).toBe(CORE_BYTES);
    expect(core(now)).toBe(CORE_BYTES);
  });

  it("load_protocol serves the rule and the case by name as exact canonical bytes, and the core as one page", async () => {
    const server = createAskRigorServer();
    const client = new Client({ name: "owner-question-125-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const text = await load();
      const bytes = Buffer.from(text, "utf8");
      for (const name of [RULE, CASE.id]) {
        const found = protocolNamedElements(text, name);
        expect(found).toHaveLength(1);
        const canonical = bytes.subarray(found[0]!.byte_start, found[0]!.byte_end_exclusive).toString("utf8");
        const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: name } });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent).toMatchObject({ ok: true, complete: true, text: canonical });
      }
      const rule = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: RULE } });
      expect(plain((rule.structuredContent as { text: string }).text.replace(/^<Rule[^>]*>|<\/Rule>$/gu, ""))).toContain(APPROVED);
      const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "core" } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: true, complete: true, page_count: 1 });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
