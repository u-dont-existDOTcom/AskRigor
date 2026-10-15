import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";
import { undoCorrectionReport, undoReviewProvenance } from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}
// Independent exact owner-approved question 78: "78a", 2026-10-12.
const APPROVED = {
  revision: "Owner-approved, question 78 (2026-10-12): when the user corrects AskRigor and a recheck shows the user was right, AskRigor asks whether it may send a bug report or whether the user wants to clarify first, shows the report, and sends it only after the user's yes, with a point-of-generation check.",
  rule: "When the user corrects AskRigor and a recheck shows the user was right, acknowledge the error and, in that reply, ask one short question: may AskRigor send a bug report about it, or does the user want to clarify something first? Show the report it would send, on its own and apart from any engineering report: \"When [general situation], AskRigor should [correct behavior] because [reason].\" Include no identity, personal health story, quotation or unnecessary link. Send it only after the user says yes, and only through a lesson tool or Action this surface actually offers; if it offers none, say so and tell the user it can be sent through AskRigor's lesson Action. When the user clarifies, apply the clarification and show the revised report before sending it. When the recheck shows the user was not right, say what the source supports and offer no report.",
  check: "Correction-report check: When the user corrected AskRigor and a recheck showed the user was right, did this reply ask whether AskRigor may send a bug report or whether the user wants to clarify first, with the report shown, and is nothing sent before the user's yes?",
} as const;
const loadCurrent = () => readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
const load = async () => undoReviewProvenance(await loadCurrent());
function section(text: string, tag: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches).toHaveLength(1);
  return matches[0]![1]!;
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before)).toHaveLength(2);
  const result = text.replace(before, after);
  expect(result.split(after)).toHaveLength(2);
  return result;
}

describe("question 78: correction bug report with clarification and consent", () => {
  it("chains four reversible edits from 20.5.38 and derives the current manifest from the canonical bytes", async () => {
    const recorded = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-12-correction-report.json", ROOT), "utf8")) as { purpose: string; universal: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "universal"]);
    const fixture = recorded.universal;
    const previous = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")).universal as Edits;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual({ version: "20.5.38", sha256: "06e5ca6befb9dac648fd41996213394e793e17795087eee8fbc63cbcbbbd8174" });
    expect(fixture.to).toEqual({ version: "20.5.39", sha256: "09f2d6651b036512f98857925f181ef664f0b2bf4599158c5fe0800bcd0ef8bf" });
    expect(fixture.edits).toHaveLength(4);
    const current = await load();
    expect(current).toContain('version="20.5.39" revisionDate="2026-10-12"');
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(fixture.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(prior).toContain('version="20.5.38" revisionDate="2026-10-11"');
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(fixture.from.sha256);
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoCorrectionReport(await loadCurrent())).resolves.toBe(prior);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.43",
      revisionDate: "2026-10-15", sha256: hash(await loadCurrent()),
    });
  });

  it("places the exact Critical revision first above 20.5.38", async () => {
    const text = await load();
    expect(text).toMatch(/<revision_history>\n<revision version="20.5.39" priority="Critical">[^<]+<\/revision>\n<revision version="20.5.38" priority="Critical">/u);
    const matches = [...text.matchAll(/<revision version="20.5.39" priority="Critical">([^<]+)<\/revision>/gu)];
    expect(matches).toHaveLength(1);
    const body = matches[0]![1]!;
    expect((parser.parse(`<text>${body}</text>`).text as string).replace(/\s+/gu, " ").trim()).toBe(APPROVED.revision);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });

  it("replaces only the old paragraph in corrections_and_calibration with the exact single-line rule", async () => {
    const text = await load();
    const current = section(text, "corrections_and_calibration");
    const prior = section(await undoCorrectionReport(await loadCurrent()), "corrections_and_calibration");
    const old = prior.split("\n").filter((line) => line.startsWith("When a correction, rechecked and found valid,"));
    expect(old).toHaveLength(1);
    expect(current.split("\n").filter((line) => line === APPROVED.rule)).toHaveLength(1);
    expect(current).toBe(replaceOnce(prior, old[0]!, APPROVED.rule));
    expect(text.split(APPROVED.rule)).toHaveLength(2);
  });

  it("inserts only the exact single-line check directly after Overcorrection check", async () => {
    const text = await load();
    const current = section(text, "point_of_generation_checks");
    const prior = section(await undoCorrectionReport(await loadCurrent()), "point_of_generation_checks");
    const over = prior.split("\n").filter((line) => line.startsWith("Overcorrection check:"));
    expect(over).toHaveLength(1);
    expect(current).toBe(replaceOnce(prior, over[0]!, `${over[0]}\n${APPROVED.check}`));
    expect(current.split("\n").filter((line) => line === APPROVED.check)).toHaveLength(1);
    expect(text.split(APPROVED.check)).toHaveLength(2);
  });
});
