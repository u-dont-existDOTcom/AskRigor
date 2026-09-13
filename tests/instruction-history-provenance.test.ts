import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const historicalReceipts = {
  "docs/audits/2026-08-31-pr148-release-boundary-closeout.json": "371b1c32aa28eb7e6b03d9e4a2b66c85858eaf6bd7f3cad199c080186ddbedcb",
  "docs/audits/2026-08-31-research-frontier-catalog-discovery.json": "c13c2411a38fb5471ef05ce06de42cd821bb773994cce7ab6b7f4b9efd94983d",
  "docs/audits/2026-09-01-owner-review-promotion-production-release.json": "cd88d20d63988b3231bb87341e92fcebee65ae59600db10759a9b9d587781cfb"
} as const;
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (body: string) => createHash("sha256").update(body).digest("hex");

describe("historical installation evidence is not current source identity", () => {
  for (const [path, digest] of Object.entries(historicalReceipts)) {
    it(`preserves the dated receipt ${path}`, async () => {
      expect(hash(await read(path))).toBe(digest);
    });
  }

  it("does not backdate today's instructions into the August editor observation", async () => {
    const receipt = JSON.parse(await read(
      "docs/audits/2026-08-31-pr148-release-boundary-closeout.json",
    ));
    const observed = receipt.governedConsumers.controlledCustomGpt;
    expect(observed.lastEdited).toBe("2026-08-31");
    expect(observed.editorInstructionsCharacters).toBe(4751);
    expect(observed.sourceInstructionsSha256).toBe(
      "2ac7368d003e8bef1eee243f9612f39ec88b4b07eb7df6a11125576575a2c514",
    );
    const candidate = await read("project/CUSTOM_GPT_CONTROLLED_INSTRUCTIONS.md");
    expect(hash(candidate)).not.toBe(observed.sourceInstructionsSha256);
    expect(hash(candidate.trimEnd())).not.toBe(observed.editorInstructionsSha256);
  });
});
