import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NODE_IMAGE = "node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d";

describe("production Dockerfile", () => {
  it("pins both Node stages to the reviewed multi-platform digest", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const fromLines = dockerfile.split("\n").filter((line) => line.startsWith("FROM "));

    expect(fromLines).toEqual([
      `FROM ${NODE_IMAGE} AS build`,
      `FROM ${NODE_IMAGE} AS runtime`
    ]);
  });
});
