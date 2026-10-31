import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, loadProtocol, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { FINAL_CHECK_RUNTIME_DESCRIPTION, PASSING_LIMITS_GUIDANCE } from "../apps/research-mcp/src/final-check-messages.js";
import { undoCommunitySearchAndVideoCommentMapHrp, undoOwnerAnswer205Hrp } from "./helpers/undo-read-depth.js";

// Owner answer 205a (2026-10-30): the answer states only the limits that change what the person should believe or
// do, and the panel beneath a passing check lists them all. In the run on #384 the check gave 10 limits for a
// 20-minute nap, mostly about the research itself, and answers pasted the list word for word.
const LIMITS_NOTE_SENTENCE = "of the limits finalize_research returns, include in the answer's own words each one " +
  "that changes what the person should believe or do; when its check has not passed, include every one, since " +
  "AskRigor lists them all beneath an answer only after a passing check.";
const OLD_LIMITS_NOTE_SENTENCE = "include every limit finalize_research returns, in the answer's own words.";
const FINALIZE_CLAUSE = "on ready_with_limits, state each limit that changes what the person should believe or do;";
const PINS = {
  from: { version: "20.6.33", sha256: "6bac4fc9d673cdd737975ef62f382f4a5ddeeb33e76986ecec9eeeecf7fd4dea" },
  to: { version: "20.6.34", sha256: "7b933620ecca1116f1d4c45c87046e37d8b2a6f97bc4e7a38b6dfd30aa23c74a" },
} as const;
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
function rule(text: string, name: string): string {
  const matches = [...text.matchAll(new RegExp(`<Rule name="${name}"[^>]*>([\\s\\S]*?)</Rule>`, "gu"))];
  expect(matches, name).toHaveLength(1);
  return normalize(matches[0]![1]!);
}

// HRP 20.6.35's community-search and video-comment-map revision is the layer above this one.
const layer = async () => undoCommunitySearchAndVideoCommentMapHrp(await loadProtocol("hrp"));

describe("owner answer 205a: HRP 20.6.34", () => {
  it("has LimitsNote state the returned limits that change what the person should believe or do", async () => {
    const text = await layer();
    const prior = await undoOwnerAnswer205Hrp(text);
    expect(rule(prior, "LimitsNote")).toContain(OLD_LIMITS_NOTE_SENTENCE);
    expect(rule(text, "LimitsNote")).toBe(rule(prior, "LimitsNote").replace(OLD_LIMITS_NOTE_SENTENCE, LIMITS_NOTE_SENTENCE));
    expect(normalize(text)).not.toContain(OLD_LIMITS_NOTE_SENTENCE);
  });

  it("has FinalizeResearch state on ready_with_limits only the limits that matter", async () => {
    const text = await layer();
    const prior = await undoOwnerAnswer205Hrp(text);
    expect(rule(prior, "FinalizeResearch")).toContain("on ready_with_limits, state each limit;");
    expect(rule(text, "FinalizeResearch"))
      .toBe(rule(prior, "FinalizeResearch").replace("on ready_with_limits, state each limit;", FINALIZE_CLAUSE));
  });

  it("matches what the final check's result tells the AI", () => {
    expect(PASSING_LIMITS_GUIDANCE).toContain("The panel lists every limit below beneath the checked answer.");
    expect(PASSING_LIMITS_GUIDANCE).toContain("only those that change what this person should believe or do;");
    expect(FINAL_CHECK_RUNTIME_DESCRIPTION).toContain("only the limits that change what the person should believe or " +
      "do; an answer whose check has not passed states every material limit.");
  });

  it("leaves the core, which every research answer loads on one page, byte for byte as it was", async () => {
    const text = await layer();
    const prior = await undoOwnerAnswer205Hrp(text);
    const core = new Set(coreSectionNames("hrp"));
    const coreText = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ byte_start, byte_end_exclusive }) => Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive).toString("utf8"));
    expect(coreText(text)).toEqual(coreText(prior));
    expect(protocolNamedElements(text, "LimitsNote")).toMatchObject([{ tag: "Rule", section: "OutputFormatting" }]);
    expect(protocolNamedElements(text, "FinalizeResearch")).toMatchObject([{ tag: "Rule", section: "FinalSelfCheck" }]);
    for (const section of ["OutputFormatting", "FinalSelfCheck"]) expect(core.has(section), section).toBe(false);
  });

  it("binds the exact bytes, puts the revision first and reverses the layer to HRP 20.6.33", async () => {
    const text = await layer();
    expect(XMLValidator.validate(text)).toBe(true);
    expect(text).toContain(`version="${PINS.to.version}" revisionDate="2026-10-30"`);
    expect(hash(text)).toBe(PINS.to.sha256);
    const revisions = [...text.matchAll(/<Revision version="([^"]+)"/gu)].map((match) => match[1]);
    expect(revisions.slice(0, 2)).toEqual(["20.6.34", "20.6.33"]);
    const prior = await undoOwnerAnswer205Hrp(text);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(PINS.from.sha256);
    const fixture = JSON.parse(await readFile(new URL(
      "./fixtures/protocol-edits/2026-10-30-owner-answer-205-hrp.json", import.meta.url,
    ), "utf8")) as { hrp: { from: unknown; to: unknown; edits: Array<[string, string]> } };
    expect(fixture.hrp.from).toEqual(PINS.from);
    expect(fixture.hrp.to).toEqual(PINS.to);
    expect(fixture.hrp.edits).toHaveLength(4);
    expect(fixture.hrp.edits.reduce((value, [before, after]) => value.replace(before, () => after), prior)).toBe(text);
  });
});
