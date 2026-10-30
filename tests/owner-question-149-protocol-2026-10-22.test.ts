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
import {
  undoOwnerQuestion149Hrp, undoOwnerQuestion161Hrp, undoOwnerQuestions152And153Hrp, undoReadDepth,
} from "./helpers/undo-read-depth.js";

// Independent of the recorded edit fixture: the owner's approved rule of 2026-10-22, word for word (answer "149a", from
// the 21 Oct regression case Responders, question 136), where it goes, and the revision note.
const RULE = {
  name: "CountsNeedTheirGroupSizes",
  section: "EpistemicSafetyRules",
  // The section's last rule in HRP 20.6.29, which the new rule directly follows.
  follows: "UnverifiedSpecificsLimitConfidence",
  text: "When counts are given without the group sizes they come from, or the group sizes conflict, give the counts and the conflict, and work out no percentage, difference or ratio from them, not even as a conditional figure, until the group sizes are reconciled.",
} as const;
const REVISION = "Owner-approved, answer 149a (2026-10-22), from the 21 Oct regression case Responders (question 136), which computed rates and a ratio from counts whose group sizes conflicted: added CountsNeedTheirGroupSizes to the core section EpistemicSafetyRules, which every research answer loads.";
const PINS = {
  from: { version: "20.6.29", sha256: "a72aed35746b86b084398cdb92fa1d36dac2d2941b31feea34e242678cf49b79" },
  to: { version: "20.6.30", sha256: "b7c1df6eb235bcd1423e4d8fdb86245887e3cd0eac3f469f6cc91619a5c91ef8" },
} as const;
const REVISION_DATE = "2026-10-22";
// The current file also includes owner answer 193a (HRP 20.6.32, 2026-10-29); the undo chain removes later layers.
const CURRENT = {
  version: "20.6.32", revisionDate: "2026-10-29", sha256: "62f9e0a934800ae0a6002d3b433ed2c640e0b8263b6891d7d897a2c0c49b9c89",
} as const;
// Universal does not change.
const UNIVERSAL = {
  name: "AskRigor.com universal saved instructions", version: "20.5.46", revisionDate: "2026-10-21",
  sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e",
} as const;
const FIXTURE = "2026-10-22-owner-question-149-hrp.json";
const PREVIOUS_FIXTURE = "2026-10-21-owner-questions-152-153-hrp.json";
// The core, as the sum of its section bytes, before and after this layer; served with two bytes between sections, it
// stays one page.
const CORE_BYTES = { before: 39_614, after: 39_952 } as const;
const WIDTH = 118;
const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const size = (text: string) => Buffer.byteLength(text, "utf8");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string);
const loadCurrent = () => readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
// This layer's result, HRP 20.6.30, rebuilt from the current file.
const load = async () => undoOwnerQuestion161Hrp(await loadCurrent());
// The state before this layer, and before the previous one, from the current file.
const undoLayer = async () => undoOwnerQuestion149Hrp(await loadCurrent());
const undoPrevious = async () => undoOwnerQuestions152And153Hrp(await loadCurrent());
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
const RULE_XML = ruleXml(RULE.name, RULE.text);
const REVISION_XML = `  <Revision version="20.6.30" priority="Critical">\n${wrapped(REVISION, 3)}\n  </Revision>`;
const ruleNames = (body: string) => [...body.matchAll(/<Rule name="([^"]+)"/gu)].map((match) => match[1]);
const CLOSE = " </EpistemicSafetyRules>";

// Construct the authorized change whitelist independently of the recorded edit fixture.
function expectedEdits(prior: string): Array<[string, string]> {
  // The rule goes directly after UnverifiedSpecificsLimitConfidence, the section's last rule, so before its closing tag.
  const follows = ruleLines(prior, RULE.follows);
  expect(prior).toContain(`${follows}\n${CLOSE}`);
  return [
    ['version="20.6.29" revisionDate="2026-10-21"', 'version="20.6.30" revisionDate="2026-10-22"'],
    [" <RevisionHistory>\n", ` <RevisionHistory>\n${REVISION_XML}\n`],
    [`${follows}\n${CLOSE}`, `${follows}\n\n${RULE_XML}\n${CLOSE}`],
  ];
}

describe('owner-approved question 149: "149a" (2026-10-22)', () => {
  it("chains the exact predecessor, derives the manifest from the bytes, and reverses the layer", async () => {
    const recorded = JSON.parse(await readFile(new URL(`tests/fixtures/protocol-edits/${FIXTURE}`, ROOT), "utf8")) as
      { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    expect(recorded.purpose).toContain(
      'answer "149a" (2026-10-22), from the 21 Oct regression case Responders (question 136)',
    );
    const previous = JSON.parse(await readFile(new URL(`tests/fixtures/protocol-edits/${PREVIOUS_FIXTURE}`, ROOT), "utf8")).hrp as Edits;
    const fixture = recorded.hrp;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(3);
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
    await expect(undoLayer()).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(previous.from.sha256);
    await expect(undoPrevious()).resolves.toBe(beforePrevious);
    const readDepth = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")).hrp as Edits;
    expect(hash(await undoReadDepth(await loadCurrent(), "hrp"))).toBe(readDepth.from.sha256);
    expect(REVISION_DATE).toBe("2026-10-22");
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: CURRENT.version, revisionDate: CURRENT.revisionDate, sha256: CURRENT.sha256,
    });
    expect(hash(await loadCurrent())).toBe(CURRENT.sha256);
  });

  it("adds CountsNeedTheirGroupSizes as a Critical rule with the approved text word for word and nothing else", async () => {
    const text = await load();
    const prior = await undoLayer();
    expect(plain(element(text, "Rule", "name", RULE.name))).toBe(RULE.text);
    expect(ruleLines(text, RULE.name)).toBe(RULE_XML);
    expect(normalize(text).split(RULE.text)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(RULE.text);
    expect(prior).not.toContain(RULE.name);
    expect(RULE.text).not.toMatch(/[&<>\n]/u);
    // Every other rule keeps its name and order; the first test shows that nothing else in the file changes.
    expect(ruleNames(text).filter((name) => name !== RULE.name)).toEqual(ruleNames(prior));
  });

  it("sits in EpistemicSafetyRules directly after UnverifiedSpecificsLimitConfidence, formatted like it", async () => {
    const text = await load();
    const prior = await undoLayer();
    expect(protocolNamedElements(prior, RULE.name)).toEqual([]);
    expect(protocolNamedElements(text, RULE.name)).toMatchObject([{ tag: "Rule", section: RULE.section }]);
    expect(protocolNamedElements(text, RULE.follows)).toMatchObject([{ tag: "Rule", section: RULE.section }]);
    const names = ruleNames(section(text, RULE.section));
    expect(names).toEqual([...ruleNames(section(prior, RULE.section)), RULE.name]);
    expect(names.slice(-2)).toEqual([RULE.follows, RULE.name]);
    // One blank line between the two rules, as between the section's other rules, and the section's closing tag after.
    const follows = ruleLines(text, RULE.follows);
    expect(text).toContain(`${follows}\n\n${RULE_XML}\n${CLOSE}`);
    expect(section(text, RULE.section)).toBe(replaceOnce(section(prior, RULE.section), `${follows}\n `,
      `${follows}\n\n${RULE_XML}\n `));
    // Its neighbour has the same shape: opening tag, text wrapped at 118 with three spaces, closing tag.
    expect(follows).toBe(ruleXml(RULE.follows, plain(element(text, "Rule", "name", RULE.follows))));
  });

  it("is in the core, which every research answer loads, and load_protocol serves it in the core on one page", async () => {
    expect(coreSectionNames("hrp")).toContain(RULE.section);
    // The server serves the current file; question 161's rule left the core as this layer made it.
    const bytes = await readFile(new URL("protocols/HRP_Full.xml", ROOT));
    const { sections, text } = await loadProtocolSectionSnapshot("hrp");
    expect(text).toBe(bytes.toString("utf8"));
    const server = createAskRigorServer();
    const client = new Client({ name: "owner-question-149-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const [span, ...others] = protocolNamedElements(text, RULE.name);
      expect(others).toEqual([]);
      const canonical = bytes.subarray(span!.byte_start, span!.byte_end_exclusive).toString("utf8");
      expect(canonical).toBe(RULE_XML.trimStart());
      const served = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: RULE.name } });
      expect(served.isError).not.toBe(true);
      expect(served.structuredContent).toMatchObject({ ok: true, complete: true, text: canonical });
      const core = sections.filter(({ core }) => core)
        .map(({ byte_start, byte_end_exclusive }) => bytes.subarray(byte_start, byte_end_exclusive).toString("utf8")).join("\n\n");
      const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "core" } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: true, complete: true, page_count: 1, text: core });
      expect(core.split(RULE_XML)).toHaveLength(2);
      expect(normalize(core)).toContain(RULE.text);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("places the exact Critical revision first, wrapped like its neighbours", async () => {
    const text = await load();
    const prior = await undoLayer();
    expect(plain(element(text, "Revision", "version", PINS.to.version))).toBe(REVISION);
    expect(section(prior, "RevisionHistory").trimStart().startsWith(`<Revision version="${PINS.from.version}" priority="Critical">`)).toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${REVISION_XML}${section(prior, "RevisionHistory")}`);
  });

  it("wraps new lines at 118, apart from the root line", async () => {
    const text = await load();
    const prior = await undoLayer();
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

  it("changes only the sections its edits name, by their exact bytes; the core stays one page", async () => {
    const text = await load();
    const prior = await undoLayer();
    const [now, before] = [protocolSections("hrp", text), protocolSections("hrp", prior)];
    expect(now.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
    const changed = now.filter(({ name, sha256 }) => before.find((section) => section.name === name)!.sha256 !== sha256)
      .map(({ name }) => name);
    const bytes = (sections: typeof now, name: string) => sections.find((section) => section.name === name)!.bytes;
    const delta = (name: string) => bytes(now, name) - bytes(before, name);
    const core = (sections: typeof now) => sections.filter(({ core }) => core);
    const coreBytes = (sections: typeof now) => core(sections).reduce((sum, { bytes }) => sum + bytes, 0);
    expect(changed).toEqual(["RevisionHistory", RULE.section]);
    expect(delta("RevisionHistory")).toBe(size(`${REVISION_XML}\n`));
    expect(delta(RULE.section)).toBe(size(`\n${RULE_XML}\n`));
    expect(coreBytes(now) - coreBytes(before)).toBe(delta(RULE.section));
    expect(coreBytes(before)).toBe(CORE_BYTES.before);
    expect(coreBytes(now)).toBe(CORE_BYTES.after);
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
