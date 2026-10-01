import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Owner-approved method change (2026-09-30, "7: A"): HRP 20.6.7 adds one rule
// beside HistoricalVocabularyAndCitationBackchain, routes the terminology
// trigger to it and records the revision. Undoing exactly those edits gives
// HRP 20.6.6's recorded bytes, so nothing else changed.
describe("HRP 20.6.7 small-result-set and exposure-decomposition rule", () => {
  it("adds only the approved rule, its routing and its revision", async () => {
    // HRP 20.6.8 (owner's research-thread lessons) comes first: undoing its recorded
    // edits gives HRP 20.6.7 exactly.
    const onDisk = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    const lessons = JSON.parse(
      await readFile(new URL("tests/fixtures/protocol-edits/2026-09-30-owner-lessons.json", ROOT), "utf8"),
    ).hrp as { from: { sha256: string }; edits: Array<[string, string]> };
    const hrp = [...lessons.edits].reverse().reduce((text, [prior, later]) => {
      expect(text.split(later), later.slice(0, 60)).toHaveLength(2);
      return text.replace(later, prior);
    }, onDisk);
    expect(sha256(hrp)).toBe(lessons.from.sha256);

    const rule = hrp.match(
      /\n  <Rule name="SmallResultSetAndExposureDecomposition" priority="Critical">[\s\S]*?<\/Rule>\n/u,
    )?.[0];
    expect(rule).toBeDefined();
    expect(rule).toContain("read every record's title");
    expect(rule).toContain("before concluding that relevant evidence was not located");
    expect(rule).toContain("split a mixed or ambiguous exposure");
    expect(hrp).toContain(
      '<Rule name="HistoricalVocabularyAndCitationBackchain" priority="Critical">',
    );
    expect(hrp.indexOf(rule!)).toBeGreaterThan(
      hrp.indexOf('<Rule name="HistoricalVocabularyAndCitationBackchain" priority="Critical">'),
    );

    const revision = hrp.match(
      /  <Revision version="20\.6\.7" priority="Critical">[\s\S]*?<\/Revision>\n/u,
    )?.[0];
    expect(revision).toBeDefined();

    const routed =
      "HistoricalVocabularyAndCitationBackchain, SmallResultSetAndExposureDecomposition, HistoricalEndpointAndInvestigatorSweep,";
    expect(hrp.split(routed)).toHaveLength(2);

    const prior = hrp
      .replace(
        '<Protocol name="HRP" version="20.6.7" revisionDate="2026-09-30"',
        '<Protocol name="HRP" version="20.6.6" revisionDate="2026-09-29"',
      )
      .replace(revision!, "")
      .replace(rule!, "")
      .replace(routed, "HistoricalVocabularyAndCitationBackchain, HistoricalEndpointAndInvestigatorSweep,");
    expect(sha256(prior)).toBe("0f406dad647ee9b489b9a59da360ea571d7f08ac185401673664357105e2b852");
  });
});
