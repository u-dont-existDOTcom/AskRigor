import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HRP premise-integrity structural integration", () => {
  it("keeps the new revision chronologically placed and wires the gate into controlling architecture", async () => {
    const text = await readFile(
      new URL("../protocols/HRP_Full.xml", import.meta.url),
      "utf8"
    );

    const revision17 = text.indexOf('<Revision version="20.5.17" priority="Critical">');
    const revision18 = text.indexOf('<Revision version="20.5.18" priority="Critical">');
    const revision19 = text.indexOf('<Revision version="20.5.19" priority="Critical">');
    expect(revision17).toBeGreaterThanOrEqual(0);
    expect(revision18).toBeGreaterThan(revision17);
    expect(revision19).toBeGreaterThan(revision18);

    const singleSourceStart = text.indexOf('<Rule name="SingleSourceOfTruth" priority="Critical">');
    const singleSourceEnd = text.indexOf("</Rule>", singleSourceStart);
    expect(singleSourceStart).toBeGreaterThanOrEqual(0);
    expect(singleSourceEnd).toBeGreaterThan(singleSourceStart);
    const singleSource = text.slice(singleSourceStart, singleSourceEnd);
    expect(singleSource).toContain(
      "PremiseIntegrityAndTruthPriorityGate controls verification of material prompt premises"
    );

    const noSilentStart = text.indexOf('<Rule name="NoSilentOverride" priority="Critical">');
    const noSilentEnd = text.indexOf("</Rule>", noSilentStart);
    expect(noSilentStart).toBeGreaterThanOrEqual(0);
    expect(noSilentEnd).toBeGreaterThan(noSilentStart);
    const noSilent = text.slice(noSilentStart, noSilentEnd);
    expect(noSilent).toContain("failed premise-integrity, safety");
  });
});
