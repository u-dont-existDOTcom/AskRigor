import { describe, expect, it } from "vitest";
import { loadProtocolSectionSnapshot } from "@askrigor/protocol";

// Owner lessons (2026-09-30, "review and merge what makes sense"): HRP 20.6.8 and
// Universal 20.5.33. The chain tests undo exactly the recorded edits; this checks
// that the one new rule is read on every run rather than only on request.
describe("owner research-thread lessons", () => {
  it("puts NoFavoredExplanationPrivilege in a core HRP section beside NoFavoredRemedyPrivilege", async () => {
    const { text, manifest, sections } = await loadProtocolSectionSnapshot("hrp");
    expect(manifest).toMatchObject({ version: "20.6.10", revisionDate: "2026-10-03" });
    const bytes = Buffer.from(text, "utf8");
    const holding = (rule: string) =>
      sections.filter((section) =>
        bytes.subarray(section.byte_start, section.byte_end_exclusive).toString("utf8").includes(`<Rule name="${rule}"`),
      );
    const [section] = holding("NoFavoredExplanationPrivilege");
    expect(holding("NoFavoredExplanationPrivilege")).toHaveLength(1);
    expect(section).toMatchObject({ name: "HeterodoxEpistemology", core: true });
    expect(holding("NoFavoredRemedyPrivilege").map(({ name }) => name)).toEqual(["HeterodoxEpistemology"]);
  });
});
