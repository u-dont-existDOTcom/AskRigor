import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, getProtocolManifest, loadProtocol, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoCardRuleWordingHrp, undoResponseSpreadHrp } from "./helpers/undo-read-depth.js";

const FIXTURE = "./fixtures/protocol-edits/2026-11-05-response-spread-hrp.json";
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("owner answer 244a: HRP 20.6.39", () => {
  it("compares how much individual results varied in each arm of a trial", async () => {
    const text = await loadProtocol("hrp");
    const elements = protocolNamedElements(text, "SpreadOfIndividualResults");
    expect(elements).toHaveLength(1);
    expect(elements[0]!.section).toBe("StatisticalAndClinicalInterpretation");
    const rule = text.match(/<Rule name="SpreadOfIndividualResults"[^>]*>([\s\S]*?)<\/Rule>/u)?.[1]?.replace(/\s+/gu, " ");
    expect(rule).toContain("such as the standard deviation of each arm's change or individual results in a table, compare the arms");
    expect(rule).toContain("A clearly wider spread in the treated arm suggests people respond differently");
    expect(rule).toContain("a similar spread suggests the average fits most people");
    expect(rule).toContain("that chance and ordinary variation, which the control arm also shows, can make a small trial look split");
    expect(rule).toContain("When individual results appear only in a figure the research could not read, say so rather than infer a split.");
  });

  it("leaves every core section byte for byte unchanged", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoResponseSpreadHrp(text);
    const core = new Set(coreSectionNames("hrp"));
    const sections = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ name, byte_start, byte_end_exclusive }) => ({
        name, bytes: Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive),
      }));
    expect(sections(text)).toEqual(sections(prior));
  });

  it("binds the current manifest and first revision to these bytes, and reverses to 20.6.38's", async () => {
    const text = await loadProtocol("hrp");
    const { hrp } = JSON.parse(await readFile(new URL(FIXTURE, import.meta.url), "utf8")) as {
      hrp: { from: { version: string; sha256: string }; to: { version: string; sha256: string }; edits: Array<[string, string]> };
    };
    expect(XMLValidator.validate(text)).toBe(true);
    expect(await getProtocolManifest("hrp")).toEqual({
      name: "HRP", version: hrp.to.version, revisionDate: "2026-11-05", sha256: hrp.to.sha256,
    });
    expect([...text.matchAll(/<Revision version="([^"]+)"/gu)].slice(0, 2).map((match) => match[1]))
      .toEqual(["20.6.39", "20.6.38"]);
    const prior = await undoResponseSpreadHrp(text);
    expect(hash(prior)).toBe(hrp.from.sha256);
    expect(hrp.from.version).toBe("20.6.38");
    expect(hrp.edits).toHaveLength(3);
    expect(await undoCardRuleWordingHrp(text)).toBe(await undoCardRuleWordingHrp(prior));
  });
});
