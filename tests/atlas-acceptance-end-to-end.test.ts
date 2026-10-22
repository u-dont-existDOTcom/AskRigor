import { describe, expect, it } from "vitest";

// The package the tool imports, so the stores' errors are the classes the tool recognizes.
import {
  AtlasFindingPromotionRunner,
  InMemoryAtlasCanonicalStore,
  InMemoryAtlasPromotionStore,
  InMemoryAtlasReviewStore,
} from "@askrigor/evidence-repository";

import { runAtlasScenario } from "./helpers/atlas-scenario.js";

// Atlas phase 2, end to end and hermetic (design section 7): the real findings library save and signed receipts, the
// owner's tool as the connector calls it, an in-memory GitHub, the providers answered from recorded fixtures, and the
// in-memory review, intent and canonical stores, which share the pure planner planAtlasWrite() with PostgreSQL. The
// same scenario (tests/helpers/atlas-scenario.ts) runs against PostgreSQL in the Docker acceptance.

describe("the owner accepts findings into the Atlas, end to end", () => {
  it("saves, lists, inspects, accepts, leads, links, corrects and forgets, and stores nothing that ties a finding to a card", async () => {
    const review = new InMemoryAtlasReviewStore();
    let canonical: InMemoryAtlasCanonicalStore | undefined;
    const report = await runAtlasScenario((clock) => {
      const now = () => clock().toISOString();
      canonical = new InMemoryAtlasCanonicalStore({ now });
      const runner = new AtlasFindingPromotionRunner(new InMemoryAtlasPromotionStore(review, canonical), { now });
      return {
        review,
        reader: canonical,
        promote: () => runner.promoteAccepted(),
        rows: async () => {
          const numbers = canonical!.snapshot().findings.map(({ publicNumber }) => publicNumber);
          return JSON.stringify({ canonical: canonical!.snapshot(), intents: await review.inspectIntents(numbers) });
        },
      };
    });

    expect(report.steps).toEqual([
      "saved ARF-0042",
      "accepted and promoted F-1001, checked, bound by DOI",
      "accepted F-1002 as a lead; ARF-0042 closed as reviewed",
      "accepted F-1003 and linked it as contradicting F-1001: both contested",
      "corrected F-1001 to version 2 with a dated note",
      "forgot ARF-0042: its decisions removed, its issue stripped, then deleted; F-1001 stays",
      "no stored row names a card, thread, fingerprint, receipt, card hash, answer quote or video",
    ]);
    // The scan read every row, and looked for each thread key, fingerprint, receipt hash and card hash by value.
    expect(report.scanned.characters).toBeGreaterThan(10_000);
    expect(report.scanned.forbidden.filter((value) => /^[a-f0-9]{64}$/u.test(value)).length).toBeGreaterThanOrEqual(8);

    const rows = canonical!.snapshot();
    expect(rows.findings.map(({ publicNumber, entryKind, leadOrigin }) => [publicNumber, entryKind, leadOrigin])).toEqual([
      ["F-1001", "finding", null], ["F-1002", "lead", "unverified_finding"], ["F-1003", "finding", null],
    ]);
    expect(rows.links.map(({ relation, disagreement }) => [relation, disagreement])).toEqual([["contradicts", "dose"]]);
    expect(rows.changes.filter(({ changeKind }) => changeKind === "corrected").map(({ publicNote }) => publicNote))
      .toEqual(["The invented trial report gives 13 cases of nausea on zentarine, not 12."]);
    expect(rows.topics.map(({ canonicalKey, label }) => [canonicalKey, label])).toEqual([["velmor-syndrome", "Velmor syndrome"]]);
    // A retracted source was not met here; every source check recorded the providers' envelope hash.
    expect(rows.sourceChecks.every(({ check }) => /^[a-f0-9]{64}$/u.test(check.envelopeSha256))).toBe(true);
  });
});
