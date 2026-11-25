import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { loadProtocol } from "@askrigor/protocol";

describe("16 Nov 2026 deep-research preservation policy", () => {
  it("places a second time-saving value test beside novelty, with consent and provenance", async () => {
    const hrp = await loadProtocol("hrp");
    const card = /<Rule name="FindingsCardForAPerson" priority="Critical">([\s\S]*?)<\/Rule>/u.exec(hrp)?.[1];
    const archive = /<Rule name="DeepResearchTimeSavingAtlasPreservation" priority="Critical">([\s\S]*?)<\/Rule>/u.exec(hrp)?.[1];
    expect(card).toContain("mainstream");
    expect(card).toContain("source verification");
    expect(archive).toContain("Medium or High");
    expect(archive).toContain("substantial effort");
    expect(archive).toContain("paid-private");
    expect(archive).toContain("not the entire research record");
  });

  it("keeps privacy and source-receipt protections in the canonical model-facing rule", async () => {
    const hrp = await loadProtocol("hrp");
    expect(hrp).toContain("In paid-private research, or where data consent is missing");
    expect(hrp).toContain("the structured research map");
    expect(hrp).toContain("a recoverable research lead");
    const project = await readFile(new URL("../project/PROJECT_INSTRUCTIONS.md", import.meta.url), "utf8");
    expect(Array.from(project).length).toBeLessThanOrEqual(8000);
  });
});
