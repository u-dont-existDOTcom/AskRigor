import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { coreSectionNames, getProtocolManifest, loadProtocolSectionSnapshot } from "@askrigor/protocol";
import { undoMobileNoticeUniversal, undoOwnerQuestions86To89Universal } from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const load = (file: "HRP_Full.xml" | "Universal_Instructions.xml" = "Universal_Instructions.xml") => readFile(
  new URL(`protocols/${file}`, ROOT), "utf8",
);
// Universal 20.5.42, the state the owner's mobile notice was added to.
const loadPrior = async () => undoMobileNoticeUniversal(await load());
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the recorded fixture: the owner's request of 2026-10-15 ("here is a new warning we need to add into
// mobile askrigor responses: 'Mobile responses may be shorter and less intelligent than desktop web/app, even with the
// same model and thinking level selected.'"), the paragraph that carries it in output_style, and the revision sentence.
const REQUESTED = {
  notice: "Mobile responses may be shorter and less intelligent than desktop web/app, even with the same model and thinking level selected.",
  paragraph: "When the context or the person shows that the response will be read in a mobile app or a phone's browser, start each substantive response with this notice, as its own sentence and in the response's language: “Mobile responses may be shorter and less intelligent than desktop web/app, even with the same model and thinking level selected.” When nothing shows a phone, leave it out.",
  revision: "Owner request (2026-10-15): when the context or the person shows a phone, each substantive response starts with the owner's notice that mobile responses may be shorter and less intelligent than desktop web/app, even with the same model and thinking level selected.",
} as const;
const PINS = {
  from: { version: "20.5.42", sha256: "0401335ed4b1f0ec44d4d7351ecb369828dd1c7f362b5c4e0234df22c7f10173" },
  to: { version: "20.5.43", sha256: "7f03ddbd280a9906860f5a34b022b95931f61da87377b3c6e33afcdbaf9a1bdd" },
  universal20541: "115b22a595b4cdcd663bb60986bd3dba0fb0d3f65f64bcc7bbb6d5a4bfd8a708",
  hrp: { version: "20.6.26", sha256: "8906a8c66da50281e066bb73505ab3d023e219faa57ef04fe0edc5a5c8c6bf39" },
} as const;
const WIDTH = 118;
const NEXT_STEP = "For every substantive response, finish with an explicit “Next step:”";
const plain = (body: string) => (parser.parse(`<text>${body}</text>`).text as string).replace(/\s+/gu, " ").trim();
const normalize = (text: string) => text.replace(/\s+/gu, " ");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
// The one line that starts with `start`.
function lineStarting(text: string, start: string): string {
  const lines = text.split("\n").filter((line) => line.startsWith(start));
  expect(lines, start).toHaveLength(1);
  return lines[0]!;
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, () => after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}

describe("owner request: the mobile notice (2026-10-15)", () => {
  it("chains only the recorded Universal edits from the exact predecessor and derives its manifest from the bytes", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-15-mobile-notice-universal.json", ROOT,
    ), "utf8")) as Record<string, Edits>;
    expect(Object.keys(recorded)).toEqual(["purpose", "universal"]);
    const fixture = recorded.universal!;
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-14-owner-questions-86-89-universal.json", ROOT,
    ), "utf8")).universal as Edits;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(3);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(current).toContain(`<Protocol name="AskRigor.com universal saved instructions" version="${PINS.to.version}" revisionDate="2026-10-15"`);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`<Protocol name="AskRigor.com universal saved instructions" version="${PINS.from.version}" revisionDate="2026-10-14"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoMobileNoticeUniversal(current)).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(PINS.universal20541);
    await expect(undoOwnerQuestions86To89Universal(current)).resolves.toBe(beforePrevious);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: PINS.to.version, revisionDate: "2026-10-15",
      sha256: hash(current),
    });
    // HRP does not change.
    const hrp = await load("HRP_Full.xml");
    expect(hash(hrp)).toBe(PINS.hrp.sha256);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: PINS.hrp.version, revisionDate: "2026-10-16", sha256: PINS.hrp.sha256,
    });
  });

  it("quotes the owner's sentence exactly, in curly quotes, as the paragraph's only non-ASCII characters", () => {
    expect(REQUESTED.paragraph.split(`: “${REQUESTED.notice}” `)).toHaveLength(2);
    expect(REQUESTED.paragraph.replace(/[“”]/gu, "")).toMatch(/^[\x20-\x7e]+$/u);
    expect([...REQUESTED.paragraph].filter((character) => character > "\x7e")).toEqual(["“", "”"]);
    expect(REQUESTED.revision.endsWith(`notice that m${REQUESTED.notice.slice(1)}`)).toBe(true);
    for (const text of Object.values(REQUESTED)) expect(text).not.toMatch(/[&<>\n]/u);
  });

  it("puts the exact Critical revision first, directly above 20.5.42's, wrapped like its neighbours", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const body = element(text, "revision", "version", PINS.to.version);
    expect(plain(body)).toBe(REQUESTED.revision);
    const lines = body.split("\n").slice(1, -1);
    expect(body).toBe(`\n${lines.join("\n")}\n`);
    for (const line of lines) {
      expect(line.length, line.slice(0, 60)).toBeLessThanOrEqual(WIDTH);
      expect(line, line.slice(0, 60)).toBe(line.trim());
    }
    // Filled to the width: the next line's first word would not have fitted on the line before it.
    for (let i = 1; i < lines.length; i++) {
      expect(`${lines[i - 1]!} ${lines[i]!.split(" ")[0]!}`.length, lines[i - 1]).toBeGreaterThan(WIDTH);
    }
    const added = `<revision version="${PINS.to.version}" priority="Critical">${body}</revision>\n`;
    expect(section(prior, "revision_history").startsWith(`\n<revision version="${PINS.from.version}" priority="Critical">\n`))
      .toBe(true);
    expect(section(text, "revision_history")).toBe(`\n${added}${section(prior, "revision_history").slice(1)}`);
  });

  it("places the exact paragraph in output_style directly before the Next step paragraph, a blank line on each side", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const nextStep = lineStarting(prior, NEXT_STEP);
    expect(section(text, "output_style")).toBe(
      replaceOnce(section(prior, "output_style"), `\n\n${nextStep}\n`, `\n\n${REQUESTED.paragraph}\n\n${nextStep}\n`),
    );
    expect(section(text, "output_style")).toMatch(new RegExp(
      `\\nFor longer work, provide brief progress updates [^\\n]+\\n\\n${escape(REQUESTED.paragraph)}\\n\\n${escape(nextStep)}\\n`,
      "u",
    ));
    expect(lineStarting(text, "When the context or the person shows")).toBe(REQUESTED.paragraph);
    expect(lineStarting(text, NEXT_STEP)).toBe(nextStep);
    expect(text.split(REQUESTED.paragraph)).toHaveLength(2);
    expect(text.split(REQUESTED.notice)).toHaveLength(2);
  });

  it("serves the paragraph in the core section output_style as its exact canonical bytes", async () => {
    const bytes = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT));
    const { manifest, sections, text } = await loadProtocolSectionSnapshot("universal");
    expect(text).toBe(bytes.toString("utf8"));
    expect(manifest).toEqual({
      name: "AskRigor.com universal saved instructions", version: PINS.to.version, revisionDate: "2026-10-15",
      sha256: PINS.to.sha256,
    });
    expect(coreSectionNames("universal")).toContain("output_style");
    const style = sections.filter(({ name }) => name === "output_style");
    expect(style).toHaveLength(1);
    expect(style[0]).toMatchObject({ core: true, runtime: true });
    const served = bytes.subarray(style[0]!.byte_start, style[0]!.byte_end_exclusive);
    expect(style[0]!.sha256).toBe(createHash("sha256").update(served).digest("hex"));
    expect(served.toString("utf8")).toBe(`<output_style>${section(text, "output_style")}</output_style>`);
    expect(served.toString("utf8").split(`\n\n${REQUESTED.paragraph}\n\n${NEXT_STEP}`)).toHaveLength(2);
  });

  it("holds the requested texts word for word, and nothing else changed", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    for (const phrase of [REQUESTED.paragraph, REQUESTED.revision]) {
      expect(normalize(text), phrase.slice(0, 60)).toContain(phrase);
      expect(normalize(prior), phrase.slice(0, 60)).not.toContain(phrase);
    }
    expect(normalize(prior)).not.toContain(REQUESTED.notice);
    let expected = normalize(prior);
    const swap = (before: string, after: string) => { expected = replaceOnce(expected, before, after); };
    swap(`version="${PINS.from.version}" revisionDate="2026-10-14"`, `version="${PINS.to.version}" revisionDate="2026-10-15"`);
    swap("<revision_history> ", `<revision_history> <revision version="${PINS.to.version}" priority="Critical"> ${REQUESTED.revision} </revision> `);
    swap(` ${NEXT_STEP}`, ` ${REQUESTED.paragraph} ${NEXT_STEP}`);
    expect(normalize(text)).toBe(expected);
    // Byte for byte as well: only the root attributes, the revision entry and the paragraph differ.
    const revision = `<revision version="${PINS.to.version}" priority="Critical">${element(text, "revision", "version", PINS.to.version)}</revision>`;
    let exact = replaceOnce(prior, `version="${PINS.from.version}" revisionDate="2026-10-14"`, `version="${PINS.to.version}" revisionDate="2026-10-15"`);
    exact = replaceOnce(exact, "<revision_history>\n", `<revision_history>\n${revision}\n`);
    const nextStep = lineStarting(prior, NEXT_STEP);
    exact = replaceOnce(exact, `\n\n${nextStep}\n`, `\n\n${REQUESTED.paragraph}\n\n${nextStep}\n`);
    expect(text).toBe(exact);
  });

  it("wraps every new line within 118 characters, apart from the root line and the one-line paragraph", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    expect(added.filter((line) => line.length > WIDTH)).toEqual([lineStarting(text, "<Protocol "), REQUESTED.paragraph]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });
});
