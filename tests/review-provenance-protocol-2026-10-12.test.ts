import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";
import { undoContestedEvidence, undoCorrectionReport, undoReviewProvenance } from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}
// Independent exact owner-approved question 82: "82 yeah i mean that's good", 2026-10-12.
const APPROVED = {
  revision: "Owner-approved, question 82 (2026-10-12): the shopping module keeps review auditability, reviewer genuineness and product efficacy apart, records review provenance against the texts actually read, reconciles platforms before reading a mismatch as manipulation, and weighs specific firsthand reports in both directions, with a regression case.",
  rule: "Keep three questions apart: whether a seller's review display can be audited, whether each review reflects a real buyer, and whether the product works; an answer to one settles neither of the others. Record each review's provenance (seller-curated, embedded testimonial, independent platform, imported or syndicated, email- or order-verified, incentivized, unknown) and compare displayed totals with the texts actually read; a failed \"load more\" or an empty review feed is an access boundary, not evidence of fabrication. Before reading a cross-platform mismatch as manipulation, check imports, order-ID eligibility, earlier product IDs and migrated testimonials. Weigh specific firsthand reports (symptom or function, duration, co-exposures, stop and restart, objective measures) above content-free praise, in both directions: they can raise the probability that some buyers benefit, never establish how many or how much. A questionable review practice and a working product are compatible.",
  case: "A supplement seller's widget claims 600 reviews but shows five old five-star testimonials and returns nothing for the rest; a buyer app shows 490 ratings with generic praise, a few detailed improvements and some nonresponse, and excludes imports without order IDs: explain the incomplete corpus and the different verification rules, allege no fraud from the mismatch or the empty feed, keep both detailed positive and negative buyer reports as low-certainty signals, and give no buyer benefit percentage or efficacy conclusion.",
} as const;
const load = () => readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
function section(text: string, tag: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches).toHaveLength(1);
  return matches[0]![1]!;
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before)).toHaveLength(2);
  const result = text.replace(before, after);
  expect(result.split(after)).toHaveLength(2);
  return result;
}

describe("question 82: review provenance versus product efficacy", () => {
  it("chains five reversible edits from question 78 and derives the exact current manifests", async () => {
    const recorded = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-12-review-provenance.json", ROOT), "utf8")) as { purpose: string; universal: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "universal"]);
    const fixture = recorded.universal;
    const previous = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-12-correction-report.json", ROOT), "utf8")).universal as Edits;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual({ version: "20.5.39", sha256: "09f2d6651b036512f98857925f181ef664f0b2bf4599158c5fe0800bcd0ef8bf" });
    expect(fixture.to).toEqual({ version: "20.5.40", sha256: "c8f770f0ac340b87f97f257f2c981db70f643b0abfddfe7513ec047b0a29f900" });
    expect(fixture.edits).toHaveLength(5);
    const current = await load();
    expect(current).toContain('version="20.5.40" revisionDate="2026-10-12"');
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(fixture.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(prior).toContain('version="20.5.39" revisionDate="2026-10-12"');
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(fixture.from.sha256);
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoReviewProvenance(current)).resolves.toBe(prior);
    const beforeCorrectionReport = [...previous.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), prior,
    );
    expect(hash(beforeCorrectionReport)).toBe(previous.from.sha256);
    await expect(undoCorrectionReport(current)).resolves.toBe(beforeCorrectionReport);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.40",
      revisionDate: "2026-10-12", sha256: hash(current),
    });
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    expect(hash(await undoContestedEvidence(hrp))).toBe("48e0e80ab412a3bce84ed834159664975933c3446b28bfcb5fea2964075f268e");
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.20", revisionDate: "2026-10-12",
      sha256: "faa656b4d51a2554ff4b668c713bf35fb065624cc53e7871cdd5c16910fc74d0",
    });
  });

  it("places the exact wrapped Critical revision first above 20.5.39", async () => {
    const text = await load();
    expect(text).toMatch(/<revision_history>\n<revision version="20.5.40" priority="Critical">[^<]+<\/revision>\n<revision version="20.5.39" priority="Critical">/u);
    const matches = [...text.matchAll(/<revision version="20.5.40" priority="Critical">([^<]+)<\/revision>/gu)];
    expect(matches).toHaveLength(1);
    const body = matches[0]![1]!;
    expect((parser.parse(`<text>${body}</text>`).text as string).replace(/\s+/gu, " ").trim()).toBe(APPROVED.revision);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });

  it("changes only the module heading and adds the exact last Interpretation paragraph as one line", async () => {
    const text = await load();
    const current = section(text, "shopping_module");
    const prior = section(await undoReviewProvenance(text), "shopping_module");
    expect(current.split("\n").filter((line) => line === "# AskRigor shopping module v0.4")).toHaveLength(1);
    expect(current.split("\n").filter((line) => line === APPROVED.rule)).toHaveLength(1);
    const interpretation = prior.split("## 7. Interpretation\n")[1]!.split("\n\n## 8. Decision and output")[0]!;
    const anchor = interpretation.split("\n").filter((line) => line.startsWith("Check visible duplication/variant drift"));
    expect(anchor).toHaveLength(1);
    expect(current).toContain(`${anchor[0]}\n\n${APPROVED.rule}\n\n## 8. Decision and output`);
    const headed = replaceOnce(prior, "# AskRigor shopping module v0.3", "# AskRigor shopping module v0.4");
    expect(current).toBe(replaceOnce(headed, anchor[0]!, `${anchor[0]}\n\n${APPROVED.rule}`));
    expect(text.split(APPROVED.rule)).toHaveLength(2);
  });

  it("inserts only the exact regression case directly after DeadOfferTriggersAlternateSellers", async () => {
    const text = await load();
    const current = section(section(text, "shopping_research"), "regression_cases");
    const prior = section(section(await undoReviewProvenance(text), "shopping_research"), "regression_cases");
    const dead = prior.match(/<case id="DeadOfferTriggersAlternateSellers">[^<]+<\/case>/u)![0];
    const added = `<case id="ReviewProvenanceVersusEfficacy">\n${APPROVED.case}\n</case>`;
    expect(current).toBe(replaceOnce(prior, dead, `${dead}\n${added}`));
    expect(current).toContain(`${dead}\n${added}\n`);
    expect(text.split(added)).toHaveLength(2);
    expect(text.split(APPROVED.case)).toHaveLength(2);
  });
});
