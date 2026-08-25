import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const WORKSPACE_PACKAGES = [
  "@askrigor/contracts",
  "@askrigor/protocol",
  "@askrigor/sources",
  "@askrigor/research-mcp"
];

describe("workspace package entrypoints", () => {
  it("imports every built workspace package through Node resolution", () => {
    const imports = WORKSPACE_PACKAGES
      .map((packageName) => `await import(${JSON.stringify(packageName)});`)
      .join("\n");
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", imports],
      { encoding: "utf8" }
    );

    expect(result.status, result.stderr).toBe(0);
  }, 10_000);
});
