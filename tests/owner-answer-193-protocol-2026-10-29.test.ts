import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getProtocolManifest, loadProtocol } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoOwnerAnswer193Hrp } from "./helpers/undo-read-depth.js";

describe("owner answer 193a: HRP 20.6.32", () => {
  it("preserves the new sentences in each of the eight owner-edited rules", async () => {
    const text = (await loadProtocol("hrp")).replace(/\s+/gu, " ");
    for (const [name, sentences] of [
      ["DurationMatchedBenefitAndHarm", [
        "For any non-urgent question about whether to do something, weigh its benefits for what the person wants beside its harms, near the start and to the same standard of evidence:",
        "whether it would be noticeable over the planned time",
        "give a short provisional answer and ask one question about their main aim; once it is known, do not ask again.",
      ]],
      ["RiskAdjectiveRequiresReferenceClass", ["a statistically significant change is not by itself an important one."]],
      ["HarmWarningCalibration", ["Check a rate against the source's own counts before using it;"]],
      ["CorrectionPropagationIsMandatory", ["correct that statement plainly where the new answer starts,"]],
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

  it("binds the exact owner-edited bytes and reverses them to HRP 20.6.31", async () => {
    const text = await loadProtocol("hrp");
    expect(XMLValidator.validate(text)).toBe(true);
    expect(await getProtocolManifest("hrp")).toMatchObject({
      version: "20.6.32", revisionDate: "2026-10-29",
      sha256: "27546c04255488fab38779ec7e0513fc2c4b805dd6ecfaa65e33d75f40c9bbcb",
    });
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
