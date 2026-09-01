import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("zero-spend ChatGPT MAST finalization", () => {
  it("keeps Project Manager interpretation outside the execution worker", async () => {
    const source = await readFile(
      new URL("../scripts/finalize-zero-spend-chatgpt-mast-smoke.mts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('interpretation: "RESERVED_FOR_PROJECT_MANAGER_CHAT"');
    expect(source).toContain("codexAuthoredScientificInterpretation: false");
    expect(source).toContain("resultsReturnedAutomaticallyToProjectManagerChat: true");
    expect(source).toContain("chatLocator: projectManagerChatLocator");
  });
});
