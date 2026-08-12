import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

async function projectFile(path: string): Promise<string> {
  try {
    return await readFile(rootFile(`project/${path}`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

describe("AskRigor ChatGPT Project router", () => {
  it("ships the exact copy-ready Project package", async () => {
    let files: string[] = [];
    try {
      files = await readdir(rootFile("project"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    expect(files.sort()).toEqual([
      "FORUM_SIGNAL_MODULE.md",
      "PROJECT_INSTRUCTIONS.md",
      "README.md"
    ]);
  });

  it("uses a compact pre-HRP router with an irreversible sensitive trigger", async () => {
    const instructions = await projectFile("PROJECT_INSTRUCTIONS.md");
    const words = instructions.split(/\s+/).filter(Boolean);

    expect(words.length).toBeGreaterThan(100);
    expect(words.length).toBeLessThan(450);
    expect(instructions).not.toMatch(/<\/?(?:Protocol|Purpose|Research)/);
    expect(instructions).toContain("Run this routing gate before loading or applying the full HRP");
    for (const trigger of [
      "firsthand experience",
      "implementation differences",
      "treatment tolerability",
      "real-world outcomes",
      "adherence",
      "harms",
      "discontinuation",
      "patient decision-making"
    ]) {
      expect(instructions).toContain(trigger);
    }
    expect(instructions).toContain("When uncertain, mark FORUM_SIGNAL REQUIRED");
    expect(instructions).toContain("REQUIRED cannot become NOT REQUIRED");
  });

  it("permanently blocks the exact hip/RCT early-synthesis failure", async () => {
    const instructions = await projectFile("PROJECT_INSTRUCTIONS.md");

    expect(instructions).toContain(
      "@AskRigor best way to fix an old hip that barely works and hurts"
    );
    expect(instructions).toContain("Finding an excellent RCT does not satisfy or deselect FORUM_SIGNAL");
    expect(instructions).toContain("`audit_youtube_community`");
    expect(instructions).toContain("Do not emit a final verdict");
    expect(instructions).toContain("Do not emit the full-HRP opening");
    expect(instructions).toContain("synthesis_lock: pass");
  });

  it("defines a directional, bidirectional Forum Signal receipt for HRP synthesis", async () => {
    const module = await projectFile("FORUM_SIGNAL_MODULE.md");

    for (const direction of ["benefit", "no_effect", "harm", "discontinuation"]) {
      expect(module).toContain(`${direction}: complete | no_material_reports | incomplete`);
    }
    expect(module).toContain(
      "community_to_formal: complete | no_material_transferable_hypotheses | incomplete"
    );
    expect(module).toContain(
      "formal_to_community: complete | no_material_discriminators | incomplete"
    );
    expect(module).toContain("youtube_synthesis_lock: pass | block");
    expect(module).toContain("confidence_effect: <explicit text>");
    expect(module).toContain("query-bounded comment search is discovery-only");
    expect(module).toContain("person × treatment episode");
    expect(module).toContain("This receipt is an input to HRP synthesis, not a treatment verdict");
  });

  it("explains the one-time manual Project installation boundary", async () => {
    const readme = await projectFile("README.md");

    expect(readme).toContain("ChatGPT Project instructions");
    expect(readme).toContain("PROJECT_INSTRUCTIONS.md");
    expect(readme).toContain("FORUM_SIGNAL_MODULE.md");
    expect(readme).toContain("does not update an existing ChatGPT Project automatically");
    expect(readme).toContain("refresh the AskRigor developer-mode connection");
    expect(readme).toMatch(/start a new chat/i);
  });
});
