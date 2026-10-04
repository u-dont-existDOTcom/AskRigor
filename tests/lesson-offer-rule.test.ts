import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { coreSectionNames, loadProtocolSnapshot } from "@askrigor/protocol";

// Owner report (2026-09-30): a connector chat found a recurring AskRigor failure
// and went straight to an engineering report without saying the lesson was
// worth saving. Universal 20.5.32 makes the offer part of handling a correction,
// and the section is always loaded because corrections arrive at unpredictable
// points.
describe("lesson offer after a validated correction", () => {
  it("is part of corrections_and_calibration and always loaded", async () => {
    const { text, manifest } = await loadProtocolSnapshot("universal");
    expect(manifest).toMatchObject({ version: "20.5.35", revisionDate: "2026-10-04" });
    const section = new XMLParser().parse(text).Protocol.corrections_and_calibration as string;
    for (const obligation of [
      "rechecked and found valid",
      "say it is worth saving as an AskRigor lesson",
      "show the proposed lesson on its own, apart from any engineering report",
      "Include no identity, personal health story, quotation or unnecessary link.",
      "Submit it only after the user says yes",
      "only through a lesson tool or Action this surface actually offers",
      "if it offers none, say so",
    ]) {
      expect(section, obligation).toContain(obligation);
    }
    expect(coreSectionNames("universal")).toContain("corrections_and_calibration");
  });
});
