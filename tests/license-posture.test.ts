import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(rootFile(path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

describe("AskRigor licensing posture", () => {
  it("licenses software under exact AGPL terms without relicensing reserved authority or evidence", async () => {
    const [policy, officialText] = await Promise.all([
      readOrEmpty("LICENSE.md"),
      readOrEmpty("LICENSES/AGPL-3.0-or-later.txt"),
    ]);

    expect(policy).toContain("SPDX-License-Identifier: AGPL-3.0-or-later");
    expect(policy).toContain("GNU Affero General Public License v3.0 or later");
    expect(policy).toContain("protocols/");
    expect(policy).toContain("project/");
    expect(policy).toContain("docs/");
    expect(policy).toContain("site/");
    expect(policy).toContain("tests/fixtures/");
    expect(policy).toContain("tools/");
    expect(policy).toContain("docs/custom-gpt-action-openapi.json");
    expect(policy).toContain("docs/tool-inventory-v0.1.0.json");
    expect(policy).toContain("does not amend, replace, summarize, or supersede");
    expect(policy).toContain("No license is granted for the Reserved Materials");

    expect(createHash("sha256").update(officialText).digest("hex")).toBe(
      "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0",
    );
  });
});
