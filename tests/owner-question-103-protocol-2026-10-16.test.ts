import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest, loadProtocolSectionSnapshot, protocolNamedElements } from "@askrigor/protocol";
import {
  undoOwnerQuestion93Hrp, undoOwnerQuestion103Hrp, undoOwnerQuestions86To89Hrp,
  undoOwnerQuestions90To92Hrp, undoOwnerQuestions97And99Hrp, undoReadDepth,
} from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const load = () => readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
const loadPrior = async () => undoOwnerQuestion103Hrp(await load());
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the edit fixture: the owner's exact approved wording, question 103,
// answer "103 a" (2026-10-16), from the 16 October regression run.
const APPROVED = {
  prompt: "Asked whether form A of a mineral supplement raises a low blood marker better than form B, a forum thread discusses low values of the marker, but no one in it says they took form A; in another thread, one person says form A worked better for them than a liver supplement.",
  expected: "Report that no one in the first thread took form A, and keep its marker values apart from any effect of form A; count the second thread's report as one person's use of form A against a liver supplement, not as form A against form B.",
  revision: "Owner-approved, question 103 (2026-10-16), from the 16 October regression run: stress case FormSpecificForumReports now places the liver-supplement report in a second thread, so its prompt no longer contradicts itself.",
} as const;
const PINS = {
  from: { version: "20.6.25", sha256: "f3f1d9d2f60eb0dd376d93a09910a7a26e3543b4cdb8f540298a977315d4beb5" },
  to: { version: "20.6.26", sha256: "8906a8c66da50281e066bb73505ab3d023e219faa57ef04fe0edc5a5c8c6bf39" },
  hrp20624: "04bf76e20ebab9ab5cd6138ca45adbce79dccdd91a505df5ada14366bc0b0589",
  hrp20623: "6623056eab84a60a0a82ac33a5aa0145cb84725d1be60aedfa77faf3d69899bd",
  hrp20622: "da82943f56614783d9316bd9a7d87a3233bf8c03255f20c88cc7bfefa39d73e9",
  hrp20621: "e43fcb2174645f30fc7d8e7f143e2d17403c69d39d5824efc1d6a0d764bf68d7",
  universal: { version: "20.5.43", sha256: "7f03ddbd280a9906860f5a34b022b95931f61da87377b3c6e33afcdbaf9a1bdd" },
} as const;
const CASE_ID = "FormSpecificForumReports";
const CASE_XML = `  <Case id="FormSpecificForumReports">
   <Prompt>
    Asked whether form A of a mineral supplement raises a low blood marker better than form B, a forum thread
    discusses low values of the marker, but no one in it says they took form A; in another thread, one person says
    form A worked better for them than a liver supplement.
   </Prompt>
   <ExpectedBehavior>
    Report that no one in the first thread took form A, and keep its marker values apart from any effect of form A;
    count the second thread's report as one person's use of form A against a liver supplement, not as form A against
    form B.
   </ExpectedBehavior>
  </Case>`;
const REVISION_XML = `  <Revision version="20.6.26" priority="Critical">
   Owner-approved, question 103 (2026-10-16), from the 16 October regression run: stress case
   FormSpecificForumReports now places the liver-supplement report in a second thread, so its prompt no longer
   contradicts itself.
  </Revision>`;
const WIDTH = 118;
const normalize = (text: string) => text.replace(/\s+/gu, " ");
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string).trim();
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

describe("owner-approved question 103: 103 a (2026-10-16)", () => {
  it("chains three exact edits from questions 97 and 99, validates XML, derives the manifest and reverses the HRP chain", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-16-owner-question-103-hrp.json", ROOT,
    ), "utf8")) as { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    expect(recorded.purpose).toContain('Owner-approved question 103, from the owner\'s answer "103 a" (2026-10-16)');
    expect(recorded.purpose).toContain("from the 16 October regression run");
    const fixture = recorded.hrp;
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-16-owner-questions-97-99-hrp.json", ROOT,
    ), "utf8")).hrp as Edits;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(3);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(current).toContain(`<Protocol name="HRP" version="${PINS.to.version}" revisionDate="2026-10-16"`);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`<Protocol name="HRP" version="${PINS.from.version}" revisionDate="2026-10-16"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoOwnerQuestion103Hrp(current)).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(PINS.hrp20624);
    await expect(undoOwnerQuestions97And99Hrp(current)).resolves.toBe(beforePrevious);
    expect(hash(await undoOwnerQuestion93Hrp(current))).toBe(PINS.hrp20623);
    expect(hash(await undoOwnerQuestions90To92Hrp(current))).toBe(PINS.hrp20622);
    expect(hash(await undoOwnerQuestions86To89Hrp(current))).toBe(PINS.hrp20621);
    const readDepth = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT,
    ), "utf8")).hrp as Edits;
    expect(hash(await undoReadDepth(current, "hrp"))).toBe(readDepth.from.sha256);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: PINS.to.version, revisionDate: "2026-10-16", sha256: PINS.to.sha256,
    });
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(hash(universal)).toBe(PINS.universal.sha256);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: PINS.universal.version, revisionDate: "2026-10-15",
      sha256: PINS.universal.sha256,
    });
  });

  it("keeps the exact approved Prompt and ExpectedBehavior inside the existing stress case in place", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const stress = section(text, "StressTestExpectations");
    const body = element(stress, "Case", "id", CASE_ID);
    expect(plain(section(body, "Prompt"))).toBe(APPROVED.prompt);
    expect(plain(section(body, "ExpectedBehavior"))).toBe(APPROVED.expected);
    expect(`  <Case id="${CASE_ID}">${body}</Case>`).toBe(CASE_XML);
    const before = element(section(prior, "StressTestExpectations"), "Case", "id", CASE_ID);
    expect(stress).toBe(replaceOnce(section(prior, "StressTestExpectations"), before, body));
    const ids = [...stress.matchAll(/<Case id="([^"]+)"/gu)].map((match) => match[1]);
    const index = ids.indexOf(CASE_ID);
    expect(ids.slice(index - 1, index + 2)).toEqual(["StimulusLockedPainReport", CASE_ID, "DoseChangedFormSwitch"]);
  });

  it("puts the exact Critical revision first, directly above 20.6.25's", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const body = element(text, "Revision", "version", PINS.to.version);
    expect(plain(body)).toBe(APPROVED.revision);
    expect(`  <Revision version="${PINS.to.version}" priority="Critical">${body}</Revision>`).toBe(REVISION_XML);
    expect(section(prior, "RevisionHistory").startsWith(`\n  <Revision version="${PINS.from.version}" priority="Critical">\n`))
      .toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${REVISION_XML}${section(prior, "RevisionHistory")}`);
  });

  it("loads the corrected case by name with the exact canonical byte range and containing section", async () => {
    const bytes = await readFile(new URL("protocols/HRP_Full.xml", ROOT));
    const { manifest, sections, text } = await loadProtocolSectionSnapshot("hrp");
    expect(text).toBe(bytes.toString("utf8"));
    expect(manifest).toEqual({ name: "HRP", version: PINS.to.version, revisionDate: "2026-10-16", sha256: PINS.to.sha256 });
    const [found, ...others] = protocolNamedElements(text, CASE_ID);
    expect(others).toEqual([]);
    expect(found).toMatchObject({ tag: "Case", section: "StressTestExpectations" });
    const canonical = bytes.subarray(found!.byte_start, found!.byte_end_exclusive).toString("utf8");
    expect(canonical).toBe(CASE_XML.trimStart());
    const body = element(canonical, "Case", "id", CASE_ID);
    expect(plain(section(body, "Prompt"))).toBe(APPROVED.prompt);
    expect(plain(section(body, "ExpectedBehavior"))).toBe(APPROVED.expected);
    const containing = sections.filter(({ byte_start, byte_end_exclusive }) =>
      byte_start <= found!.byte_start && found!.byte_end_exclusive <= byte_end_exclusive
    );
    expect(containing.map(({ name }) => name)).toEqual(["StressTestExpectations"]);
  });

  it("equals 20.6.25 plus only the approved root, revision and case edits, normalized and byte for byte", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    for (const phrase of Object.values(APPROVED)) {
      expect(phrase).toMatch(/^[\x20-\x7e]+$/u);
      expect(phrase).not.toMatch(/[&<>]/u);
      expect(normalize(text)).toContain(phrase);
      expect(normalize(prior)).not.toContain(phrase);
    }
    const oldCase = `  <Case id="${CASE_ID}">${element(prior, "Case", "id", CASE_ID)}</Case>`;
    const edits = [
      [`version="${PINS.from.version}" revisionDate="2026-10-16"`, `version="${PINS.to.version}" revisionDate="2026-10-16"`],
      [" <RevisionHistory>\n", ` <RevisionHistory>\n${REVISION_XML}\n`],
      [oldCase, CASE_XML],
    ];
    let exact = prior;
    let normalized = normalize(prior);
    for (const [before, after] of edits) {
      exact = replaceOnce(exact, before!, after!);
      normalized = replaceOnce(normalized, normalize(before!), normalize(after!));
    }
    expect(normalize(text)).toBe(normalized);
    expect(text).toBe(exact);
  });

  it("keeps every new line within 118 characters except the existing root format, with no trailing spaces", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    expect(added.filter((line) => line.length > WIDTH)).toEqual([text.split("\n")[1]]);
    for (const line of [...CASE_XML.split("\n"), ...REVISION_XML.split("\n")]) expect(line.length).toBeLessThanOrEqual(WIDTH);
    for (const line of added) expect(line).toBe(line.trimEnd());
  });
});
