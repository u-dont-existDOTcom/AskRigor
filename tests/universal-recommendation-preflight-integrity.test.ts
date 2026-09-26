import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

const protocol = readFileSync(
  resolve(process.cwd(), "protocols/Universal_Instructions.xml"),
  "utf8",
);

function section(startMarker: string, endMarker: string): string {
  const start = protocol.indexOf(startMarker);
  const end = protocol.indexOf(endMarker, start);
  expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endMarker}`).toBeGreaterThan(start);
  return protocol.slice(start, end + endMarker.length).replace(/\s+/gu, " ");
}

describe("Universal recommendation-preflight integrity gate", () => {
  it("advances Universal to 20.5.26 without losing prior authority", () => {
    expect(XMLValidator.validate(protocol)).toBe(true);
    expect(protocol).toContain('version="20.5.28" revisionDate="2026-09-26"');
    expect(protocol).toContain('<revision version="20.5.26" priority="Critical">');
    expect(protocol).toContain('<revision version="20.5.25" priority="Critical">');
    expect(protocol.match(/<recommendation_preflight_integrity_gate\b/gu)).toHaveLength(1);
  });

  it("makes recommendation terminal after integrated evidence checks", () => {
    const gate = section(
      '<recommendation_preflight_integrity_gate priority="Critical">',
      "</recommendation_preflight_integrity_gate>",
    );
    for (const required of [
      "Only VERIFIED candidates may become RECOMMENDED",
      "current orderability",
      "current price",
      "review count",
      "recurring serious negative themes",
      "actual load or use",
      "exact variant/source identity",
      "relative value",
      "Listed is not orderable",
      "no visible current price or tightly bounded current range means no owner-facing value recommendation",
      "A page with no purchase path is not a buy option",
      "A high mean rating does not erase recurring serious defects",
      "Do not pad a recommendation list with items already known to be unavailable",
      "no verified recommendation was found in the checked set",
    ]) {
      expect(gate).toContain(required);
    }
  });

  it.each([
    "OutOfStockListingNotRecommended",
    "WeakRatingNotHiddenByCapacity",
    "NoBuyPathNotShortlisted",
    "SeriousRecurringComplaintBlocks",
    "ValueAnswerRequiresPrice",
    "ConflictingVariantEvidenceBlocks",
    "VerifiedCandidateCanBeRecommended",
  ])("keeps shopping regression case %s", (id) => {
    expect(protocol).toContain(`<case id="${id}">`);
  });

  it("enforces the gate again at the point of generation", () => {
    expect(protocol.match(/Recommendation-preflight check:/gu)).toHaveLength(1);
    expect(protocol).toContain(
      "did every exposed recommendation pass the currently material fit, orderability, visible-price, review/reliability, compatibility, actual-use performance, exact-variant, and relative-value checks?",
    );
    expect(protocol).toContain(
      "Did I keep failed or decision-relevant unknown discovery candidates internal",
    );
  });
});
