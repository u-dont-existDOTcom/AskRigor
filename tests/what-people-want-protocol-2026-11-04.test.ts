import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, getProtocolManifest, loadProtocol, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoForumReaderHrp, undoWhatPeopleWantHrp } from "./helpers/undo-read-depth.js";

const FIXTURE = "./fixtures/protocol-edits/2026-11-04-what-people-want-hrp.json";
const PINS = {
  from: { version: "20.6.36", sha256: "59e946c296b835a21a28f2ae83d02800a1a1ee5174689e675c597f29a7520ffa" },
  to: { version: "20.6.37", sha256: "ebc72d1f8f48e01e499dc31b2005386287c962ef0ad8ac37dbd2c7c5e941243d" },
} as const;
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const RULES = ["SourceLineBesideKeyClaim", "CountsOutOf100WithEvidenceGrade", "BottomLineEvenWhenUncertain",
  "DoubtInFirstPerson", "WhenCareIsOutOfReach", "TestItYourselfEnding"];

describe("owner answer 237a: HRP 20.6.37", () => {
  it("adds its rules to OutputFormatting and its mode to AnswerShapeController, outside the core", async () => {
    const text = await loadProtocol("hrp");
    for (const name of RULES) {
      const elements = protocolNamedElements(text, name);
      expect(elements, name).toHaveLength(1);
      expect(elements[0]!.section).toBe("OutputFormatting");
    }
    expect(text.match(/<Mode id="what_could_this_be"/gu)).toHaveLength(1);
    expect(protocolSections("hrp", text).find(({ name }) => name === "AnswerShapeController")?.core).toBe(false);
    expect(coreSectionNames("hrp")).not.toContain("OutputFormatting");
  });

  it("names what each rule leans on, so none of it stands alone", async () => {
    const text = await loadProtocol("hrp");
    for (const name of ["MedicalDistrustOrAccessBarrier", "NOf1Exclusions", "HealthFollowUpInformationGain",
      "PatientHistoryAndRecurrenceEvidenceGate"]) expect(text).toContain(name);
    expect(text).toContain("finalize_research's later_inputs.source_lines");
    expect(text.replace(/\s+/gu, " ")).toContain("Say who paid for each key study");
  });

  it("leaves every core section byte for byte unchanged", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoWhatPeopleWantHrp(text);
    const core = new Set(coreSectionNames("hrp"));
    const sections = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ name, byte_start, byte_end_exclusive }) => ({
        name, bytes: Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive),
      }));
    expect(sections(text)).toEqual(sections(prior));
  });

  it("binds the current manifest and first revision to these bytes", async () => {
    const text = await loadProtocol("hrp");
    expect(XMLValidator.validate(text)).toBe(true);
    expect(await getProtocolManifest("hrp")).toEqual({
      name: "HRP", version: PINS.to.version, revisionDate: "2026-11-04", sha256: PINS.to.sha256,
    });
    expect(hash(text)).toBe(PINS.to.sha256);
    const revisions = [...text.matchAll(/<Revision version="([^"]+)"/gu)].map((match) => match[1]);
    expect(revisions.slice(0, 2)).toEqual(["20.6.37", "20.6.36"]);
  });

  it("records each changed passage and reverses to 20.6.36's exact bytes and SHA-256", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoWhatPeopleWantHrp(text);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`version="${PINS.from.version}" revisionDate="2026-11-01"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    const fixture = JSON.parse(await readFile(new URL(FIXTURE, import.meta.url), "utf8")) as {
      hrp: { from: unknown; to: unknown; edits: Array<[string, string]> };
    };
    expect(fixture.hrp.from).toEqual(PINS.from);
    expect(fixture.hrp.to).toEqual(PINS.to);
    expect(fixture.hrp.edits).toHaveLength(5);
    const rebuilt = fixture.hrp.edits.reduce((value, [before, after]) => {
      expect(value.split(before), before.slice(0, 80)).toHaveLength(2);
      return value.replace(before, () => after);
    }, prior);
    expect(Buffer.from(rebuilt, "utf8")).toEqual(Buffer.from(text, "utf8"));
    expect(await undoForumReaderHrp(text)).toBe(await undoForumReaderHrp(prior));
  });

  it("keeps Universal at 20.5.46 with its exact existing bytes", async () => {
    expect(await getProtocolManifest("universal")).toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.46", revisionDate: "2026-10-21",
      sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e",
    });
  });
});
