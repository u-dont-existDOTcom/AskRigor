import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

const SOURCE_AUDIT =
  "docs/audits/2026-08-21-treatment-landscape-selection-lock.md";
const CLOSEOUT_AUDIT =
  "docs/audits/2026-08-22-treatment-landscape-lesson-closeout.md";
const SOURCE_AUDIT_SHA256 =
  "a6999861fd00c3047cbd0556d04e3c8ff2b8f93d1a9d0660f4e29ec985bcffd6";

describe("treatment-landscape lesson closeout", () => {
  it("preserves the immutable source receipt while closing Universal promotion", async () => {
    const [source, closeout, index, plan, state] = await Promise.all([
      readFile(rootFile(SOURCE_AUDIT)),
      readFile(rootFile(CLOSEOUT_AUDIT), "utf8"),
      readFile(rootFile("docs/INDEX.md"), "utf8"),
      readFile(
        rootFile(
          "docs/superpowers/plans/2026-08-21-treatment-landscape-synthesis-lock.md",
        ),
        "utf8",
      ),
      readFile(rootFile("project/CODEX-CURRENT-STATE.md"), "utf8"),
    ]);

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      SOURCE_AUDIT_SHA256,
    );
    expect(index).toContain(CLOSEOUT_AUDIT.replace("docs/", ""));

    for (const receipt of [
      "458190ab1be0849fba3f5193d59321a9c7f0d8df",
      "https://github.com/u-dont-existDOTcom/universal-dev-architecture/pull/30",
      "2e81fefcca500265cad0e1209bab5e8fa2306743",
      "https://github.com/u-dont-existDOTcom/universal-dev-architecture/pull/31",
      "9c773e28c75b1ba87956fe0b5dfb9fd5593c8a1f",
      "patterns/coverage-before-depth-in-selection.md",
      SOURCE_AUDIT_SHA256,
    ]) {
      expect(closeout).toContain(receipt);
    }

    expect(plan).toContain("The cross-repository lesson loop is complete");
    expect(state).toContain("Completed 2026-08-21 treatment-landscape selection repair");
    expect(state).toContain("The cross-repository lesson loop is complete");
    expect(state).not.toContain(
      "staged in `universal-dev-architecture` pending exact AskRigor merge provenance",
    );
  });

  it("keeps source completion separate from deployment and editor state", async () => {
    const closeout = await readFile(rootFile(CLOSEOUT_AUDIT), "utf8");
    expect(closeout).toContain("Production still runs the separately recorded pre-repair version");
    expect(closeout).toContain("not deployed or installed merely because source and lesson work are complete");
    expect(closeout).toContain("Fresh Custom GPT product-interface acceptance remains unverified");
  });
});
