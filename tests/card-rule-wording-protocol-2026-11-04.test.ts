import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, getProtocolManifest, loadProtocol, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoCardRuleWordingHrp, undoWhatPeopleWantHrp } from "./helpers/undo-read-depth.js";

const FIXTURE = "./fixtures/protocol-edits/2026-11-04-card-rule-wording-hrp.json";
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("the owner's review of 4 November 2026: HRP 20.6.38", () => {
  it("tests a finding with a search of the problem, and says what a new card replaces", async () => {
    const rule = (await loadProtocol("hrp")).match(/<Rule name="FindingsCardForAPerson"[^>]*>([\s\S]*?)<\/Rule>/u)?.[1]
      ?.replace(/\s+/gu, " ");
    expect(rule).toContain("a plain web search of the problem, by someone who has never heard of this option, doesn't " +
      "already give its useful point or offer something better");
    expect(rule).toContain("a new card replaces an earlier open card only on the same question");
    expect(rule).toContain("can go public once it is saved");
    expect(rule).not.toContain("research target");
  });

  it("leaves every core section byte for byte unchanged", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoCardRuleWordingHrp(text);
    const core = new Set(coreSectionNames("hrp"));
    const sections = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ name, byte_start, byte_end_exclusive }) => ({
        name, bytes: Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive),
      }));
    expect(sections(text)).toEqual(sections(prior));
  });

  it("binds the current manifest and first revision to these bytes, and reverses to 20.6.37's", async () => {
    const text = await loadProtocol("hrp");
    const { hrp } = JSON.parse(await readFile(new URL(FIXTURE, import.meta.url), "utf8")) as {
      hrp: { from: { version: string; sha256: string }; to: { version: string; sha256: string }; edits: Array<[string, string]> };
    };
    expect(XMLValidator.validate(text)).toBe(true);
    expect(await getProtocolManifest("hrp")).toEqual({
      name: "HRP", version: hrp.to.version, revisionDate: "2026-11-04", sha256: hrp.to.sha256,
    });
    expect([...text.matchAll(/<Revision version="([^"]+)"/gu)].slice(0, 2).map((match) => match[1]))
      .toEqual(["20.6.38", "20.6.37"]);
    const prior = await undoCardRuleWordingHrp(text);
    expect(hash(prior)).toBe(hrp.from.sha256);
    expect(hrp.from.version).toBe("20.6.37");
    expect(hrp.edits).toHaveLength(3);
    expect(await undoWhatPeopleWantHrp(text)).toBe(await undoWhatPeopleWantHrp(prior));
  });
});
