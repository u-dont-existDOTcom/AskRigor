import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { coreSectionNames, getProtocolManifest, loadProtocolSectionSnapshot, protocolSections } from "@askrigor/protocol";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { undoBookReviewsUniversal, undoOwnerQuestion109Universal, undoReadDepth } from "./helpers/undo-read-depth.js";

// Independent of the recorded fixture: the owner's new Universal item of 2026-10-20, its two sentences word for word
// and in this order, the existing reviews-and-forums line they follow in the core section sources, and the revision.
const REQUESTED = {
  first: "Book research should include reader-review evidence alongside primary-text reading, identifying practical difficulties, negative experiences, differences in usability, and criticisms that the author might not address.",
  second: "Reviews must be checked against the book, duplicates should not be counted as independent evidence, and self-selected reviews must not be mistaken for clinical outcome studies.",
  revision: "Owner request (2026-10-20): book research includes reader-review evidence alongside primary-text reading, with the reviews checked against the book, duplicates not counted as independent evidence, and self-selected reviews not mistaken for clinical outcome studies (sources).",
} as const;
const LINE = `${REQUESTED.first} ${REQUESTED.second}`;
// Between the forum-signal line and the consilience line, which holds the sentence the owner pointed to; question 50's
// tested-identity paragraph stays directly after the consilience line.
const FORUM_SIGNAL_END = "state sampling limits, and never infer population incidence from forum frequency.";
const CONSILIENCE_START = "For a practical effectiveness claim a recommendation or ranking relies on";
const REVIEWS_AND_FORUMS = "Reviews and forums detect discrepancies; they are not trials.";
const IDENTITY_START = "Exact tested identity applies to any study, test, or benchmark an answer relies on,";
const PINS = {
  from: { version: "20.5.44", sha256: "946fac7e5e6ce5cb08811d4c533371e3032e1ce46f5c217990dc326808b55135" },
  to: { version: "20.5.45", sha256: "24f410ed9d6d7abd644c962f5c7a46e9f1cbf2bee0ba193fc2ff22a82ba2962c" },
} as const;
// The Universal core (sum of its section bytes) before and after, both one page.
const CORE_BYTES = { before: 22_890, after: 23_285 } as const;
const WIDTH = 118;
const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string);
const load = () => readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
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
const REVISION_XML = `<revision version="20.5.45" priority="Critical">\n${wrapped(REQUESTED.revision)}\n</revision>`;

// Construct the authorized change whitelist independently of the recorded edit fixture.
function expectedEdits(): Array<[string, string]> {
  return [
    ['version="20.5.44" revisionDate="2026-10-17"', 'version="20.5.45" revisionDate="2026-10-20"'],
    ["<revision_history>\n", `<revision_history>\n${REVISION_XML}\n`],
    [`${FORUM_SIGNAL_END}\n${CONSILIENCE_START}`, `${FORUM_SIGNAL_END}\n${LINE}\n${CONSILIENCE_START}`],
  ];
}

describe("owner request: book research with reader reviews (2026-10-20)", () => {
  it("chains the exact Universal predecessor, derives the manifest from the bytes, and reverses every layer", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-20-book-reviews-universal.json", ROOT,
    ), "utf8")) as { purpose: string; universal: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "universal"]);
    expect(recorded.purpose).toContain("Owner request: book research with reader reviews (2026-10-20)");
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-17-owner-question-109-universal.json", ROOT,
    ), "utf8")).universal as Edits;
    const fixture = recorded.universal;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toEqual(expectedEdits());
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(expectedEdits().reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    expect(expectedEdits().reduce((text, [before, after]) =>
      replaceOnce(text, normalize(before), normalize(after)), normalize(prior))).toBe(normalize(current));
    await expect(undoBookReviewsUniversal(current)).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(previous.from.sha256);
    await expect(undoOwnerQuestion109Universal(current)).resolves.toBe(beforePrevious);
    const readDepth = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")).universal as Edits;
    expect(hash(await undoReadDepth(current, "universal"))).toBe(readDepth.from.sha256);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: PINS.to.version, revisionDate: "2026-10-20", sha256: hash(current),
    });
  });

  it("puts the owner's two sentences, word for word and in order, on one line of sources beside the reviews-and-forums guidance", async () => {
    const text = await load();
    const prior = await undoBookReviewsUniversal(text);
    expect(section(text, "sources")).toBe(replaceOnce(section(prior, "sources"),
      `${FORUM_SIGNAL_END}\n${CONSILIENCE_START}`, `${FORUM_SIGNAL_END}\n${LINE}\n${CONSILIENCE_START}`));
    const lines = text.split("\n");
    const at = lines.indexOf(LINE);
    expect(at).toBeGreaterThan(0);
    expect(lines.filter((line) => line.includes(REQUESTED.first) || line.includes(REQUESTED.second))).toEqual([LINE]);
    // After the forum-signal line, before the consilience line that says reviews and forums are not trials, and
    // question 50's tested-identity paragraph still directly after that.
    expect(lines[at - 1]!.startsWith("For forum-signal checks,")).toBe(true);
    expect(lines[at - 1]!.endsWith(FORUM_SIGNAL_END)).toBe(true);
    expect(lines[at + 1]!.startsWith(CONSILIENCE_START)).toBe(true);
    expect(lines[at + 1]!).toContain(` ${REVIEWS_AND_FORUMS} `);
    expect(lines[at + 2]!.startsWith(IDENTITY_START)).toBe(true);
    expect(LINE.indexOf(REQUESTED.second)).toBeGreaterThan(LINE.indexOf(REQUESTED.first));
    for (const sentence of [REQUESTED.first, REQUESTED.second]) {
      expect(normalize(text).split(sentence)).toHaveLength(2);
      expect(normalize(prior)).not.toContain(sentence);
      expect(sentence).not.toMatch(/[&<>\n]/u);
    }
    expect(coreSectionNames("universal")).toContain("sources");
  });

  it("places the exact Critical revision first, directly above 20.5.44's, wrapped like its neighbours", async () => {
    const text = await load();
    const prior = await undoBookReviewsUniversal(text);
    const body = element(text, "revision", "version", PINS.to.version);
    expect(plain(body)).toBe(REQUESTED.revision);
    const lines = body.split("\n").slice(1, -1);
    for (const line of lines) {
      expect(line.length, line.slice(0, 60)).toBeLessThanOrEqual(WIDTH);
      expect(line, line.slice(0, 60)).toBe(line.trim());
    }
    expect(section(prior, "revision_history").startsWith(`\n<revision version="${PINS.from.version}" priority="Critical">\n`)).toBe(true);
    expect(section(text, "revision_history")).toBe(`\n${REVISION_XML}${section(prior, "revision_history")}`);
  });

  it("wraps every new line within 118 characters, apart from the root line and the one-line paragraph", async () => {
    const text = await load();
    const prior = await undoBookReviewsUniversal(text);
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    expect(added.filter((line) => line.length > WIDTH)).toEqual([text.split("\n")[1], LINE]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });

  it("grows only sources in the core, by the line's bytes, and keeps the core one page", async () => {
    const text = await load();
    const prior = await undoBookReviewsUniversal(text);
    const [now, before] = [protocolSections("universal", text), protocolSections("universal", prior)];
    expect(now.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
    const changed = now.filter(({ name, sha256 }) => before.find((section) => section.name === name)!.sha256 !== sha256)
      .map(({ name }) => name);
    expect(changed).toEqual(["revision_history", "sources"]);
    const bytes = (sections: typeof now, name: string) => sections.find((section) => section.name === name)!.bytes;
    expect(bytes(now, "sources") - bytes(before, "sources")).toBe(Buffer.byteLength(`${LINE}\n`, "utf8"));
    const core = (sections: typeof now) => sections.filter(({ core }) => core).reduce((sum, { bytes }) => sum + bytes, 0);
    expect(core(before)).toBe(CORE_BYTES.before);
    expect(core(now)).toBe(CORE_BYTES.after);
    expect(now.find(({ name }) => name === "sources")).toMatchObject({ core: true, runtime: true, pages: 1 });
  });

  it("serves sources and the core with the line, as exact canonical bytes on one page", async () => {
    const bytes = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT));
    const { sections, text } = await loadProtocolSectionSnapshot("universal");
    expect(text).toBe(bytes.toString("utf8"));
    const server = createAskRigorServer();
    const client = new Client({ name: "book-reviews-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const sources = sections.find(({ name }) => name === "sources")!;
      const canonical = bytes.subarray(sources.byte_start, sources.byte_end_exclusive).toString("utf8");
      expect(canonical.split(`\n${LINE}\n`)).toHaveLength(2);
      const served = await client.callTool({ name: "load_protocol", arguments: { protocol: "universal", section: "sources" } });
      expect(served.isError).not.toBe(true);
      expect(served.structuredContent).toMatchObject({ ok: true, complete: true, text: canonical });
      const core = sections.filter(({ core }) => core)
        .map(({ byte_start, byte_end_exclusive }) => bytes.subarray(byte_start, byte_end_exclusive).toString("utf8")).join("\n\n");
      const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "universal", section: "core" } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: true, complete: true, page_count: 1, text: core });
      expect(core).toContain(`\n${LINE}\n`);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
