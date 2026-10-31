import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, getProtocolManifest, loadProtocol, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoLesson51AndUda444Hrp, undoOwnerAnswer193Hrp } from "./helpers/undo-read-depth.js";

describe("owner answer 193a: HRP 20.6.32", () => {
  it("preserves the new sentences in each of the seven owner-edited rules, all outside the core", async () => {
    // Read at this layer: owner answer 205a (HRP 20.6.34) later rewrote LimitsNote's sentence on the returned limits.
    const text = (await undoLesson51AndUda444Hrp(await loadProtocol("hrp"))).replace(/\s+/gu, " ");
    for (const [name, sentences] of [
      ["DurationMatchedBenefitAndHarm", [
        "For any non-urgent question about whether to do something, weigh its benefits for what the person wants beside its harms, near the start and to the same standard of evidence:",
        "whether it would be noticeable over the planned time",
        "give a short provisional answer and ask one question about their main aim; once it is known, do not ask again.",
      ]],
      ["RiskAdjectiveRequiresReferenceClass", [
        "a statistically significant change is not by itself an important one.",
        "Check a rate against the source's own counts before using it;",
      ]],
      ["UpdateStructure", ["correct that statement plainly where the new answer starts,"]],
      ["ScopeAxesBeforeSampling", [
        "a total daily intake is not a deficit of the same number",
        "a sustained change that follows an initial response under the same exposure is its own group, apart from a pause of a few days.",
      ]],
      ["LimitsNote", [
        "include every limit finalize_research returns, in the answer's own words.",
        "After a first pass, say in a sentence or two of ordinary words what a deeper pass would look at,",
        "ask whether the user wants it only when they have not already asked to continue or go deeper.",
      ]],
      ["InstallmentIsNotCompletion", ["A request to continue or go deeper already makes that choice:"]],
      ["BeyondConventionalIndexes", [
        "also compare medicine approvals and access across jurisdictions,",
        "A discrepancy is a research lead, not evidence of benefit or of a regulator's error.",
      ]],
    ] as const) {
      const body = new RegExp(`<Rule name="${name}"[^>]*>(.*?)</Rule>`, "u").exec(text)?.[1];
      for (const sentence of sentences) expect(body, name).toContain(sentence);
    }
  });

  it("leaves the core, which every research answer loads on one page, as it was", async () => {
    const text = await loadProtocol("hrp");
    const core = new Set(coreSectionNames("hrp"));
    const sections = protocolSections("hrp", text);
    for (const name of [
      "DurationMatchedBenefitAndHarm", "RiskAdjectiveRequiresReferenceClass", "UpdateStructure", "ScopeAxesBeforeSampling",
      "LimitsNote", "InstallmentIsNotCompletion", "BeyondConventionalIndexes",
    ]) {
      const at = Buffer.byteLength(text.slice(0, text.indexOf(`<Rule name="${name}"`)), "utf8");
      const section = sections.find(({ byte_start, byte_end_exclusive }) => byte_start <= at && at < byte_end_exclusive);
      expect(section?.name, name).toBeDefined();
      expect(core.has(section!.name), name).toBe(false);
    }
  });

  it("binds the exact owner-edited bytes and reverses them to HRP 20.6.31", async () => {
    expect(await getProtocolManifest("hrp")).toMatchObject({
      version: "20.6.35", revisionDate: "2026-10-31",
      sha256: "44e1ca79b864e8f8db232655bf6f67dd73cfd4f3c0c8b1b160f141e421871eec",
    });
    // HRP 20.6.33 (lesson #51 and UDA #444) and 20.6.34 (owner answer 205a) are the layers above this one.
    const text = await undoLesson51AndUda444Hrp(await loadProtocol("hrp"));
    expect(XMLValidator.validate(text)).toBe(true);
    expect(createHash("sha256").update(text).digest("hex"))
      .toBe("62f9e0a934800ae0a6002d3b433ed2c640e0b8263b6891d7d897a2c0c49b9c89");
    const prior = await undoOwnerAnswer193Hrp(text);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(createHash("sha256").update(prior).digest("hex"))
      .toBe("29269d656e73c70b541226023b58b294e583188c721481c043d53f900ee0a8b5");
    const fixture = JSON.parse(await readFile(new URL(
      "./fixtures/protocol-edits/2026-10-29-owner-answer-193-hrp.json", import.meta.url,
    ), "utf8")).hrp as { edits: Array<[string, string]> };
    expect(fixture.edits.reduce((value, [before, after]) => value.replace(before, () => after), prior)).toBe(text);
  });
});
