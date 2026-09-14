import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("lesson incident fail-closed conversation contract", () => {
  it("blocks generalized submission when current exact incident capture fails", async () => {
    const [module, controlledInstructions] = await Promise.all([
      readFile(rootFile("project/LESSON_CAPTURE_MODULE.md"), "utf8"),
      readFile(rootFile("project/CUSTOM_GPT_CONTROLLED_INSTRUCTIONS.md"), "utf8"),
    ]);

    expect(module).toContain("If incident capture fails for a current lesson incident, fail closed.");
    expect(module).toContain("Do not\ncall `submit_lesson_candidate`");
    expect(module).not.toContain("Generalized submission may proceed only with the truthful");

    expect(controlledInstructions).toContain("If incident capture fails or is unavailable, fail closed");
    expect(controlledInstructions).toContain("do not call `submit_lesson_candidate`");
    expect(controlledInstructions).toContain("the anonymized lesson was not submitted");
  });
});
