import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("instruction boundary source contracts (not live compliance)", () => {
  it("keeps the new public gates independent of development imports", () => {
    for (const [path, tag] of [
      ["protocols/Universal_Instructions.xml", "instruction_obligation_lifecycle"],
      ["protocols/HRP_Full.xml", "InstructionObligationLifecycle"]
    ]) {
      const matches = [...read(path).matchAll(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "g"))];
      expect(matches).toHaveLength(1);
      const gate = matches[0][0];
      expect(gate).toContain('ruleId="portable.obligation-boundary.v1"');
      for (const forbidden of ["universal-dev-architecture", "u-dont-existDOTcom", "DEVELOPMENT_INHERITANCE.md", "handoff:"])
        expect(gate).not.toContain(forbidden);
    }
  });

  it("keeps public role profiles separate from internal governance", () => {
    const profile = JSON.parse(read("scripts/instruction-layering-profile.json"));
    for (const role of Object.values(profile.roles) as Array<{ audience: string; inherits?: string[]; local_sources?: string[] }>) {
      if (role.audience !== "public") continue;
      for (const parent of role.inherits ?? []) expect(profile.roles[parent].audience).toBe("public");
      expect((role.local_sources ?? []).join(" ")).not.toContain("DEVELOPMENT_INHERITANCE.md");
      expect((role.local_sources ?? []).join(" ")).not.toContain("AGENTS.md");
    }
  });

  it("binds the controlled shell to its generated source without private policy", () => {
    const source = read("project/CUSTOM_GPT_CONTROLLED_INSTRUCTIONS.md").trimEnd() + "\n";
    expect(read("docs/custom-gpt-instructions.md")).toBe(source);
    expect(source.length).toBeLessThanOrEqual(8000);
    expect(source).toContain("actual rendered answer");
    expect(source).toContain("finalization.reader_facing.report");
    expect(source).not.toContain("DEVELOPMENT_INHERITANCE.md");
  });
});
